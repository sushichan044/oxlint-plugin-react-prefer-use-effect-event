import type { ESTree, Variable } from "@oxlint/plugins";
import type { TargetSpec } from "./types";

import { defineRule } from "@oxlint/plugins";
import { collectCallSitesOfVariable } from "./ast-utils";
import { findOxlintConfigDir, resolveImportSource } from "./resolver";
import { ScopeIndex } from "./scope-utils";
import { matchModuleTarget } from "./tracked-imports";
import { extractHandlersFromDeclarator } from "./tracked-handlers";
import { spanRange } from "./utils";

type TargetOption = {
  targets: TargetSpec[];
  /**
   * Set this to true if you are using this plugin in an environment where React exports
   * `experimental_useEffectEvent`.
   *
   * @default false
   */
  experimentalUseEffectEvent?: boolean;
};

export type Options = [TargetOption?];
type MessageIds = "preferUseEffectEvent";

const REACT_PACKAGE = "react";
const USE_EFFECT_EXPORT = "useEffect";
const USE_EFFECT_EVENT_EXPORT = "useEffectEvent";
const EXPERIMENTAL_USE_EFFECT_EVENT_EXPORT = "experimental_useEffectEvent";

type ReactImportState = {
  /**
   * The `import ... from "react"` declaration node itself. Kept around so the autofix can mutate
   * its specifier list (e.g. add `useEffectEvent`) without re-finding the declaration.
   *
   * @example
   *   import React, { useEffect } from "react"; // this whole node
   */
  node: ESTree.ImportDeclaration;
  /**
   * Variable bound to the named `useEffect` specifier, if present. `null` when the file uses only a
   * default/namespace import.
   *
   * @example
   *   import { useEffect } from "react"; // the `useEffect` binding
   *   import React from "react"; // null
   */
  useEffectVariable: Variable | null;
  /**
   * Local name of the `useEffect` named specifier (i.e. the `as` alias if renamed). Used as a
   * fast-path filter before resolving identifier references.
   *
   * @example
   *   import { useEffect } from "react"; // "useEffect"
   *   import { useEffect as ue } from "react"; // "ue"
   */
  useEffectLocalName: string | null;
  /**
   * Local name under which `useEffectEvent` (or `experimental_useEffectEvent`) is already imported,
   * accounting for `as` aliases. `null` when no event binding is imported yet.
   *
   * @example
   *   import { useEffectEvent } from "react"; // "useEffectEvent"
   *   import { experimental_useEffectEvent as useEffectEvent } from "react"; // "useEffectEvent"
   *   import { useEffect } from "react"; // null
   */
  useEffectEventLocalName: string | null;
  /**
   * Variable bound to the default or namespace specifier (e.g. `import React from "react"` or
   * `import * as React from "react"`). Used to recognise `React.useEffect(...)` calls.
   *
   * @example
   *   import React from "react"; // the `React` binding
   *   import * as React from "react"; // the `React` binding
   *   import { useEffect } from "react"; // null
   */
  namespaceVariable: Variable | null;
  /**
   * Local name of the namespace/default specifier — used when emitting the wrapper callee in the
   * `React.useEffectEvent` form.
   *
   * @example
   *   import React from "react"; // "React"
   *   import R from "react"; // "R"
   *   import * as React from "react"; // "React"
   *   import { useEffect } from "react"; // null
   */
  namespaceLocalName: string | null;
};

const preferUseEffectEvent = defineRule({
  meta: {
    defaultOptions: [] satisfies Options,
    type: "problem",
    docs: {
      description:
        "Wrap event handlers passed into `useEffect` with `useEffectEvent` to avoid stale closures and unnecessary effect re-runs.",
    },
    messages: {
      preferUseEffectEvent: "Wrap the call of {{handlerName}} with useEffectEvent.",
    } satisfies Record<MessageIds, string>,
    fixable: "code",
    schema: [
      {
        type: "object",
        additionalProperties: false,
        properties: {
          experimentalUseEffectEvent: {
            type: "boolean",
            description:
              "Set to `true` for React versions that export `experimental_useEffectEvent` instead of the stable `useEffectEvent`.",
          },
          targets: {
            type: "array",
            description:
              "Handler bindings inside `useEffect` that should be wrapped with `useEffectEvent`.",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["source", "derivation"],
              properties: {
                source: {
                  description: "Where the handler binding originates.",
                  oneOf: [
                    {
                      type: "object",
                      additionalProperties: false,
                      required: ["from", "package", "name"],
                      properties: {
                        from: {
                          const: "package",
                          description: "Track an export from an npm package.",
                        },
                        package: {
                          type: "string",
                          description: "npm package name to import the handler from.",
                        },
                        name: {
                          type: "string",
                          description: "Named export to track on the package.",
                        },
                      },
                    },
                    {
                      type: "object",
                      additionalProperties: false,
                      required: ["from", "path", "name"],
                      properties: {
                        from: {
                          const: "file",
                          description: "Track an export from a project-local file.",
                        },
                        path: {
                          type: "string",
                          description:
                            "Path to the file declaring the export, relative to the nearest oxlint config (`.oxlintrc.json` or `oxlint.config.*`). Imports are resolved through the nearest tsconfig so TS path aliases match too.",
                        },
                        name: {
                          type: "string",
                          description: "Named export to track on the file.",
                        },
                      },
                    },
                  ],
                },
                derivation: {
                  description: "How the handler is obtained from `source`.",
                  oneOf: [
                    {
                      type: "object",
                      additionalProperties: false,
                      required: ["kind"],
                      properties: {
                        kind: {
                          const: "direct",
                          description: "The imported binding itself is the handler.",
                        },
                      },
                    },
                    {
                      type: "object",
                      additionalProperties: false,
                      required: ["kind"],
                      properties: {
                        kind: {
                          const: "call-return",
                          description:
                            "The handler is the return value of calling the imported binding.",
                        },
                      },
                    },
                    {
                      type: "object",
                      additionalProperties: false,
                      required: ["kind", "properties"],
                      properties: {
                        kind: {
                          const: "call-return-properties",
                          description:
                            "The handler is one or more properties of the value returned by calling the imported binding.",
                        },
                        properties: {
                          type: "array",
                          items: { type: "string" },
                          minItems: 1,
                          description: "Property names on the call's return value to track.",
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    ],
  },
  createOnce: (context) => {
    let fileTargets: TargetSpec[] = [];
    let hasFileTargets = false;
    // Some experimental React versions export `experimental_useEffectEvent` instead of `useEffectEvent`...
    let useEffectEventExportName = USE_EFFECT_EVENT_EXPORT;

    // Per-file state. `before` is not guaranteed to fire, so reset on `Program` too.
    let trackedImports = new Map<Variable, TargetSpec>();
    let trackedHandlers = new Map<Variable, TargetSpec>();
    let reactImport: ReactImportState | null = null;
    let scopeIndex: ScopeIndex | null = null;
    let configDir: string | null | undefined;

    function resetState() {
      trackedImports = new Map();
      trackedHandlers = new Map();
      reactImport = null;
      scopeIndex = null;
      configDir = undefined;
    }

    function ensureScopeIndex(): ScopeIndex {
      if (!scopeIndex) scopeIndex = new ScopeIndex(context.sourceCode.scopeManager);
      return scopeIndex;
    }

    function ensureConfigDir(): string | null {
      if (configDir === undefined) {
        configDir = hasFileTargets ? findOxlintConfigDir(context.physicalFilename) : null;
      }
      return configDir;
    }

    return {
      before() {
        const opts = (context.options as Options | null)?.[0];
        fileTargets = opts?.targets ?? [];
        hasFileTargets = fileTargets.some((t) => t.source.from === "file");
        // No targets means no rule output is possible — skip the file entirely.
        if (fileTargets.length === 0) return false;
        // Skip the file if it doesn't contain useEffect at all.
        if (!context.sourceCode.text.includes(USE_EFFECT_EXPORT)) {
          return false;
        }

        useEffectEventExportName = opts?.experimentalUseEffectEvent
          ? EXPERIMENTAL_USE_EFFECT_EVENT_EXPORT
          : USE_EFFECT_EVENT_EXPORT;

        return true;
      },

      Program: () => {
        resetState();
      },

      ImportDeclaration(node) {
        const isReact = node.source.value === REACT_PACKAGE;
        let useEffectVariable: Variable | null = null;
        let useEffectLocalName: string | null = null;
        let useEffectEventLocalName: string | null = null;
        let namespaceVariable: Variable | null = null;
        let namespaceLocalName: string | null = null;

        // Resolve the import source on demand — only file-source targets need it, and only if the
        // `imported` name on a specifier matched first.
        let resolvedImport: string | null | undefined;
        const getResolvedImport = (): string | null => {
          if (resolvedImport === undefined) {
            resolvedImport = resolveImportSource(context.physicalFilename, node.source.value);
          }
          return resolvedImport;
        };

        for (const specifier of node.specifiers) {
          // React-specific bookkeeping.
          if (isReact) {
            if (
              specifier.type === "ImportDefaultSpecifier" ||
              specifier.type === "ImportNamespaceSpecifier"
            ) {
              namespaceVariable = ensureScopeIndex().resolveDeclaration(specifier.local);
              namespaceLocalName = specifier.local.name;
            } else if (
              specifier.type === "ImportSpecifier" &&
              specifier.imported.type === "Identifier"
            ) {
              const importedName = specifier.imported.name;
              if (importedName === USE_EFFECT_EXPORT) {
                useEffectVariable = ensureScopeIndex().resolveDeclaration(specifier.local);
                useEffectLocalName = specifier.local.name;
              } else if (
                importedName === USE_EFFECT_EVENT_EXPORT ||
                importedName === EXPERIMENTAL_USE_EFFECT_EVENT_EXPORT
              ) {
                useEffectEventLocalName = specifier.local.name;
              }
            }
          }

          // Tracked-import handling (any package, not just React).
          if (specifier.type !== "ImportSpecifier") continue;
          const target = matchModuleTarget(specifier, node.source.value, fileTargets, {
            configDir: ensureConfigDir(),
            getResolvedImport,
          });
          if (!target) continue;

          const variable = ensureScopeIndex().resolveDeclaration(specifier.local);
          if (!variable) continue;

          trackedImports.set(variable, target);

          // For `direct` derivations the imported binding *is* the handler.
          if (target.derivation.kind === "direct") {
            trackedHandlers.set(variable, target);
          }
        }

        if (isReact) {
          reactImport = {
            node,
            useEffectVariable,
            useEffectLocalName,
            useEffectEventLocalName,
            namespaceVariable,
            namespaceLocalName,
          };
        }
      },

      VariableDeclarator(node) {
        // Without any tracked imports, no `const x = source(...)` can produce a handler.
        if (trackedImports.size === 0) return;

        const index = ensureScopeIndex();
        const handlers = extractHandlersFromDeclarator(node, (callee) => {
          const variable = index.resolveReference(callee);
          if (!variable) return null;
          return trackedImports.get(variable) ?? null;
        });

        for (const handler of handlers) {
          const variable = index.resolveDeclaration(handler.binding);
          if (variable) trackedHandlers.set(variable, handler.target);
        }
      },

      CallExpression(node) {
        // Nothing to report when no handlers have been tracked yet.
        if (trackedHandlers.size === 0) return;

        const index = ensureScopeIndex();
        if (!isUseEffectCall(node, reactImport, index)) return;

        const depsArg = node.arguments[1];
        if (!depsArg || depsArg.type !== "ArrayExpression") return;

        for (const element of depsArg.elements) {
          if (!element || element.type !== "Identifier") continue;

          const variable = index.resolveReference(element);
          if (!variable) continue;
          if (!trackedHandlers.has(variable)) continue;

          const handlerName = element.name;
          const eventName = `${handlerName}Event`;
          const capturedReactImport = reactImport;
          const capturedExportName = useEffectEventExportName;

          context.report({
            node: element,
            messageId: "preferUseEffectEvent",
            data: { handlerName },
            fix(fixer) {
              const src = context.sourceCode.getText();
              const fixes = [];

              const eventCalleeText = resolveEventCalleeText(
                capturedReactImport,
                capturedExportName,
              );

              // 1. Add useEffectEvent to the named React imports if it isn't there yet.
              if (
                capturedReactImport !== null &&
                capturedReactImport.useEffectEventLocalName === null
              ) {
                const namedSpecifiers = capturedReactImport.node.specifiers.filter(
                  (s): s is ESTree.ImportSpecifier => s.type === "ImportSpecifier",
                );
                const lastNamed = namedSpecifiers[namedSpecifiers.length - 1];
                // When the import has only a default/namespace specifier we don't need to
                // add a named one — the fix uses `<ns>.useEffectEvent` instead.
                if (lastNamed) {
                  fixes.push(
                    fixer.insertTextAfterRange(spanRange(lastNamed), `, ${capturedExportName}`),
                  );
                }
              }

              // 2. Insert the wrapping declaration just before the useEffect call.
              const [nodeStart] = node.range;
              const lineStart = src.lastIndexOf("\n", nodeStart - 1) + 1;
              const indent = src.slice(lineStart, nodeStart);
              fixes.push(
                fixer.insertTextBeforeRange(
                  spanRange(node),
                  `const ${eventName} = ${eventCalleeText}(${handlerName});\n${indent}`,
                ),
              );

              // 3. Replace handler call sites within the callback body.
              const callbackArg = node.arguments[0];
              if (callbackArg?.type === "ArrowFunctionExpression") {
                const { body } = callbackArg;
                if (body.type === "BlockStatement") {
                  for (const call of collectCallSitesOfVariable(variable, body)) {
                    fixes.push(fixer.replaceTextRange(spanRange(call.callee), eventName));
                  }
                }
              }

              // 4. Drop the handler from the dependency array.
              const remaining: string[] = [];
              const [elementStart] = element.range;
              for (const e of depsArg.elements) {
                if (!e) continue;
                const [eStart, eEnd] = e.range;
                if (eStart === elementStart) continue;
                remaining.push(src.slice(eStart, eEnd));
              }
              fixes.push(fixer.replaceTextRange(spanRange(depsArg), `[${remaining.join(", ")}]`));

              return fixes;
            },
          });
        }
      },
    };
  },
});

/**
 * Decide which expression text to use as the wrapper callee.
 *
 * Priority:
 *
 * 1. An existing `useEffectEvent` (or `experimental_useEffectEvent`) named import — use the local
 *    name.
 * 2. A React namespace/default import with no named specifiers — use `<ns>.useEffectEvent`.
 * 3. Otherwise — use the export name determined by options (added to named imports by the fix).
 */
function resolveEventCalleeText(reactImport: ReactImportState | null, exportName: string): string {
  if (reactImport === null) return exportName;
  if (reactImport.useEffectEventLocalName !== null) {
    return reactImport.useEffectEventLocalName;
  }
  const hasNamedSpecifier = reactImport.node.specifiers.some((s) => s.type === "ImportSpecifier");
  if (!hasNamedSpecifier && reactImport.namespaceLocalName !== null) {
    return `${reactImport.namespaceLocalName}.${exportName}`;
  }
  return exportName;
}

/**
 * Decide whether a `CallExpression` is the React `useEffect` we care about.
 *
 * Recognises both the named-import form (`useEffect(...)`) and the namespace/default form
 * (`React.useEffect(...)`). Filters by identifier name first to avoid resolving every call site
 * through the scope manager.
 */
function isUseEffectCall(
  node: ESTree.CallExpression,
  reactImport: ReactImportState | null,
  index: ScopeIndex,
): boolean {
  const { callee } = node;
  if (callee.type === "Identifier") {
    if (reactImport?.useEffectVariable && reactImport.useEffectLocalName !== null) {
      if (callee.name !== reactImport.useEffectLocalName) return false;
      return index.resolveReference(callee) === reactImport.useEffectVariable;
    }
    return callee.name === USE_EFFECT_EXPORT;
  }
  if (callee.type === "MemberExpression" && !callee.computed) {
    if (callee.property.type !== "Identifier") return false;
    if (callee.property.name !== USE_EFFECT_EXPORT) return false;
    if (callee.object.type !== "Identifier") return false;
    if (!reactImport?.namespaceVariable) return false;
    return index.resolveReference(callee.object) === reactImport.namespaceVariable;
  }
  return false;
}

export default preferUseEffectEvent;
