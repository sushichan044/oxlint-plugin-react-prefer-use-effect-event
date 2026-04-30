import type { ESTree, ScopeManager, Variable } from "@oxlint/plugins";
import type { TargetSpec } from "./types";

import { defineRule } from "@oxlint/plugins";
import { collectCallSitesOfVariable } from "./ast-utils";
import { findDeclaredVariable, findReferenceVariable } from "./scope-utils";
import { matchPackageTarget } from "./tracked-imports";
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
  node: ESTree.ImportDeclaration;
  /** Variable bound to the named `useEffect` specifier, if present. */
  useEffectVariable: Variable | null;
  /**
   * Local name under which `useEffectEvent` (or `experimental_useEffectEvent`) is already imported,
   * accounting for `as` aliases. `null` when no event binding is imported yet.
   */
  useEffectEventLocalName: string | null;
  /**
   * Variable bound to the default or namespace specifier (e.g. `import React from "react"` or
   * `import * as React from "react"`). Used to recognise `React.useEffect(...)` calls.
   */
  namespaceVariable: Variable | null;
  /** Local name of the namespace/default specifier (e.g. `"React"`). */
  namespaceLocalName: string | null;
};

const preferUseEffectEvent = defineRule({
  meta: {
    defaultOptions: [] satisfies Options,
    type: "problem",
    messages: {
      preferUseEffectEvent: "Wrap the call of {{handlerName}} with useEffectEvent.",
    } satisfies Record<MessageIds, string>,
    fixable: "code",
    schema: [
      {
        type: "object",
        properties: {
          experimentalUseEffectEvent: {
            type: "boolean",
            description:
              "Set this to true if you are using this plugin in an environment where React exports `experimental_useEffectEvent`.",
          },
          targets: {
            type: "array",
            items: {
              type: "object",
              properties: {
                source: {
                  oneOf: [
                    {
                      type: "object",
                      properties: {
                        from: { const: "package" },
                        package: { type: "string" },
                        name: { type: "string" },
                      },
                      required: ["from", "package", "name"],
                      additionalProperties: false,
                    },
                    {
                      type: "object",
                      properties: {
                        from: { const: "file" },
                        path: { type: "string" },
                        name: { type: "string" },
                      },
                      required: ["from", "path", "name"],
                      additionalProperties: false,
                    },
                  ],
                },
                derivation: {
                  oneOf: [
                    {
                      type: "object",
                      properties: {
                        kind: { const: "direct" },
                      },
                      required: ["kind"],
                      additionalProperties: false,
                    },
                    {
                      type: "object",
                      properties: {
                        kind: { const: "call-return" },
                      },
                      required: ["kind"],
                      additionalProperties: false,
                    },
                    {
                      type: "object",
                      properties: {
                        kind: { const: "call-return-properties" },
                        properties: {
                          type: "array",
                          items: { type: "string" },
                          minItems: 1,
                        },
                      },
                      required: ["kind", "properties"],
                      additionalProperties: false,
                    },
                  ],
                },
              },
              required: ["source", "derivation"],
            },
          },
        },
        additionalProperties: false,
      },
    ],
  },
  createOnce: (context) => {
    let fileTargets: TargetSpec[] = [];
    // Some experimental React versions export `experimental_useEffectEvent` instead of `useEffectEvent`...
    let useEffectEventExportName = USE_EFFECT_EVENT_EXPORT;

    // Per-file state. `before` is not guaranteed to fire, so reset on `Program` too.
    let trackedImports = new Map<Variable, TargetSpec>();
    let trackedHandlers = new Map<Variable, TargetSpec>();
    let reactImport: ReactImportState | null = null;

    function resetState() {
      trackedImports = new Map();
      trackedHandlers = new Map();
      reactImport = null;
    }

    return {
      before() {
        const opts = (context.options as Options | null)?.[0];
        fileTargets = opts?.targets ?? [];
        useEffectEventExportName = opts?.experimentalUseEffectEvent
          ? EXPERIMENTAL_USE_EFFECT_EVENT_EXPORT
          : USE_EFFECT_EVENT_EXPORT;
      },

      Program: () => {
        resetState();
      },

      ImportDeclaration(node) {
        const { scopeManager } = context.sourceCode;

        if (node.source.value === REACT_PACKAGE) {
          let useEffectVariable: Variable | null = null;
          let useEffectEventLocalName: string | null = null;
          let namespaceVariable: Variable | null = null;
          let namespaceLocalName: string | null = null;

          for (const specifier of node.specifiers) {
            if (
              specifier.type === "ImportDefaultSpecifier" ||
              specifier.type === "ImportNamespaceSpecifier"
            ) {
              namespaceVariable = findDeclaredVariable(scopeManager, specifier.local);
              namespaceLocalName = specifier.local.name;
              continue;
            }
            if (specifier.type !== "ImportSpecifier") continue;
            if (specifier.imported.type !== "Identifier") continue;

            const importedName = specifier.imported.name;
            if (importedName === USE_EFFECT_EXPORT) {
              useEffectVariable = findDeclaredVariable(scopeManager, specifier.local);
            } else if (
              importedName === USE_EFFECT_EVENT_EXPORT ||
              importedName === EXPERIMENTAL_USE_EFFECT_EVENT_EXPORT
            ) {
              useEffectEventLocalName = specifier.local.name;
            }
          }

          reactImport = {
            node,
            useEffectVariable,
            useEffectEventLocalName,
            namespaceVariable,
            namespaceLocalName,
          };
        }

        for (const specifier of node.specifiers) {
          if (specifier.type !== "ImportSpecifier") continue;

          const target = matchPackageTarget(specifier, node.source.value, fileTargets);
          if (!target) continue;

          const variable = findDeclaredVariable(scopeManager, specifier.local);
          if (!variable) continue;

          trackedImports.set(variable, target);

          // For `direct` derivations the imported binding *is* the handler.
          if (target.derivation.kind === "direct") {
            trackedHandlers.set(variable, target);
          }
        }
      },

      VariableDeclarator(node) {
        const { scopeManager } = context.sourceCode;

        const handlers = extractHandlersFromDeclarator(node, (callee) => {
          const variable = findReferenceVariable(scopeManager, callee);
          if (!variable) return null;
          return trackedImports.get(variable) ?? null;
        });

        for (const handler of handlers) {
          const variable = findDeclaredVariable(scopeManager, handler.binding);
          if (variable) trackedHandlers.set(variable, handler.target);
        }
      },

      CallExpression(node) {
        const { scopeManager } = context.sourceCode;

        if (!isUseEffectCall(node, reactImport, scopeManager)) return;

        const depsArg = node.arguments[1];
        if (!depsArg || depsArg.type !== "ArrayExpression") return;

        for (const element of depsArg.elements) {
          if (!element || element.type !== "Identifier") continue;

          const variable = findReferenceVariable(scopeManager, element);
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
              const lineStart = src.lastIndexOf("\n", node.start - 1) + 1;
              const indent = src.slice(lineStart, node.start);
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
              for (const e of depsArg.elements) {
                if (!e || e.start === element.start) continue;
                remaining.push(src.slice(e.start, e.end));
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
 * (`React.useEffect(...)`). For the namespace form we require the `React` reference to resolve to
 * the tracked default/namespace specifier — otherwise we ignore it (an unrelated `React.useEffect`
 * member call cannot exist without an import binding in scope).
 *
 * For the named form, when the React `useEffect` import has not been resolved to a `Variable` we
 * fall back to a name-only check, which keeps the rule working on files that don't import React at
 * all but configure a target — unlikely, but harmless.
 */
function isUseEffectCall(
  node: ESTree.CallExpression,
  reactImport: ReactImportState | null,
  scopeManager: ScopeManager,
): boolean {
  if (node.callee.type === "Identifier") {
    if (reactImport?.useEffectVariable) {
      return findReferenceVariable(scopeManager, node.callee) === reactImport.useEffectVariable;
    }
    return node.callee.name === USE_EFFECT_EXPORT;
  }
  if (node.callee.type === "MemberExpression" && !node.callee.computed) {
    if (node.callee.property.type !== "Identifier") return false;
    if (node.callee.property.name !== USE_EFFECT_EXPORT) return false;
    if (node.callee.object.type !== "Identifier") return false;
    if (!reactImport?.namespaceVariable) return false;
    return (
      findReferenceVariable(scopeManager, node.callee.object) === reactImport.namespaceVariable
    );
  }
  return false;
}

export default preferUseEffectEvent;
