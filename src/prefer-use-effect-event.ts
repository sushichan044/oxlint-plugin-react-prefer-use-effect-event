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
};

export type Options = [TargetOption?];
type MessageIds = "preferUseEffectEvent";

const REACT_PACKAGE = "react";
const USE_EFFECT_EXPORT = "useEffect";
const USE_EFFECT_EVENT_EXPORT = "useEffectEvent";

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

    // Per-file state. `before` is not guaranteed to fire, so reset on `Program` too.
    let trackedImports = new Map<Variable, TargetSpec>();
    let trackedHandlers = new Map<Variable, TargetSpec>();
    let reactImportNode: ESTree.ImportDeclaration | null = null;
    let reactUseEffectVariable: Variable | null = null;

    function resetState() {
      trackedImports = new Map();
      trackedHandlers = new Map();
      reactImportNode = null;
      reactUseEffectVariable = null;
    }

    return {
      before() {
        fileTargets = (context.options as Options | null)?.[0]?.targets ?? [];
      },

      Program: () => {
        resetState();
      },

      ImportDeclaration(node) {
        const { scopeManager } = context.sourceCode;

        if (node.source.value === REACT_PACKAGE) {
          reactImportNode = node;
          for (const specifier of node.specifiers) {
            if (specifier.type !== "ImportSpecifier") continue;
            if (specifier.imported.type !== "Identifier") continue;
            if (specifier.imported.name !== USE_EFFECT_EXPORT) continue;
            reactUseEffectVariable = findDeclaredVariable(scopeManager, specifier.local);
          }
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

        if (!isUseEffectCall(node, reactUseEffectVariable, scopeManager)) return;

        const depsArg = node.arguments[1];
        if (!depsArg || depsArg.type !== "ArrayExpression") return;

        for (const element of depsArg.elements) {
          if (!element || element.type !== "Identifier") continue;

          const variable = findReferenceVariable(scopeManager, element);
          if (!variable) continue;
          if (!trackedHandlers.has(variable)) continue;

          const handlerName = element.name;
          const eventName = `${handlerName}Event`;
          const capturedReactImport = reactImportNode;

          context.report({
            node: element,
            messageId: "preferUseEffectEvent",
            data: { handlerName },
            fix(fixer) {
              const src = context.sourceCode.getText();
              const fixes = [];

              // 1. Add useEffectEvent to the React import (if not already there).
              if (capturedReactImport !== null) {
                const lastSpecifier =
                  capturedReactImport.specifiers[capturedReactImport.specifiers.length - 1];
                const alreadyImported = capturedReactImport.specifiers.some(
                  (spec) =>
                    spec.type === "ImportSpecifier" &&
                    spec.imported.type === "Identifier" &&
                    spec.imported.name === USE_EFFECT_EVENT_EXPORT,
                );
                if (lastSpecifier && !alreadyImported) {
                  fixes.push(
                    fixer.insertTextAfterRange(
                      spanRange(lastSpecifier),
                      `, ${USE_EFFECT_EVENT_EXPORT}`,
                    ),
                  );
                }
              }

              // 2. Insert the wrapping declaration just before the useEffect call.
              const lineStart = src.lastIndexOf("\n", node.start - 1) + 1;
              const indent = src.slice(lineStart, node.start);
              fixes.push(
                fixer.insertTextBeforeRange(
                  spanRange(node),
                  `const ${eventName} = ${USE_EFFECT_EVENT_EXPORT}(${handlerName});\n${indent}`,
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
 * Decide whether a `CallExpression` is the React `useEffect` we care about.
 *
 * If we have resolved the React `useEffect` import to a `Variable`, require the callee to resolve
 * to it. Otherwise fall back to a name-only check, which keeps the rule working even when the React
 * import hasn't been seen yet (e.g. a file with no React import at all but with a configured target
 * — unlikely, but harmless).
 */
function isUseEffectCall(
  node: ESTree.CallExpression,
  reactUseEffectVariable: Variable | null,
  scopeManager: ScopeManager,
): boolean {
  if (node.callee.type !== "Identifier") return false;
  if (reactUseEffectVariable) {
    return findReferenceVariable(scopeManager, node.callee) === reactUseEffectVariable;
  }
  return node.callee.name === USE_EFFECT_EXPORT;
}

export default preferUseEffectEvent;
