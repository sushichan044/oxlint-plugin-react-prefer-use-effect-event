import type { ESTree } from "@oxlint/plugins";
import type { TargetSpec } from "./types";

import { defineRule } from "@oxlint/plugins";
import { spanRange } from "./utils";
import { collectCallsToName, getModuleExportName } from "./ast-utils";

type TargetOption = {
  targets: TargetSpec[];
};

export type Options = [TargetOption?];
type MessageIds = "preferUseEffectEvent";

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
                  type: "object",
                  properties: {
                    from: { enum: ["package"] },
                    package: { type: "string" },
                    name: { type: "string" },
                  },
                  required: ["from", "package", "name"],
                },
                derivation: {
                  type: "object",
                  oneOf: [
                    {
                      properties: {
                        kind: { const: "direct" },
                      },
                      required: ["kind"],
                    },
                    {
                      properties: {
                        kind: { const: "call-return" },
                      },
                      required: ["kind"],
                    },
                    {
                      properties: {
                        kind: { const: "call-return-properties" },
                        propertiesList: {
                          type: "array",
                          items: { type: "string" },
                        },
                      },
                      required: ["kind", "propertiesList"],
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
    // context.options is null when createOnce is called during plugin registration;
    // read it lazily only once.
    let fileTargets: TargetSpec[] = [];

    // These must be reset for each file.
    const trackedImports = new Map<string, TargetSpec>();
    const trackedHandlers = new Set<string>();
    let reactImportNode: ESTree.ImportDeclaration | null = null;

    return {
      before() {
        fileTargets = (context.options as Options | null)?.[0]?.targets ?? [];
      },

      // We need to clear the tracked imports and handlers at the beginning of each file.
      // And `before` hooks is NOT guaranteed to run on every file.
      // https://oxc.rs/docs/guide/usage/linter/writing-js-plugins.html#before-hook
      Program: () => {
        trackedImports.clear();
        trackedHandlers.clear();
        reactImportNode = null;
      },

      ImportDeclaration(node) {
        if (node.source.value === "react") {
          reactImportNode = node;
        }

        for (const target of fileTargets) {
          const { source } = target;
          if (source.from !== "package") continue;
          if (node.source.value !== source.package) continue;

          for (const specifier of node.specifiers) {
            if (specifier.type !== "ImportSpecifier") continue;
            if (getModuleExportName(specifier.imported) !== source.name) continue;
            trackedImports.set(specifier.local.name, target);
          }
        }
      },

      VariableDeclarator(node) {
        if (!node.init || node.init.type !== "CallExpression") return;
        const { callee } = node.init;
        if (callee.type !== "Identifier") return;
        const target = trackedImports.get(callee.name);
        if (!target || target.derivation.kind !== "call-return") return;
        if (node.id.type !== "Identifier") return;
        trackedHandlers.add(node.id.name);
      },

      CallExpression(node) {
        if (node.callee.type !== "Identifier") return;
        if (node.callee.name !== "useEffect") return;
        if (node.arguments.length < 2) return;
        const depsArg = node.arguments[1];
        if (!depsArg || depsArg.type !== "ArrayExpression") return;

        for (const element of depsArg.elements) {
          if (!element || element.type !== "Identifier") continue;
          const { name } = element;
          if (!trackedHandlers.has(name)) continue;

          const eventName = `${name}Event`;
          const capturedReactImport = reactImportNode;

          context.report({
            node: element,
            messageId: "preferUseEffectEvent",
            data: { handlerName: name },
            fix(fixer) {
              const src = context.sourceCode.getText();
              const fixes = [];

              // 1. Add useEffectEvent to React import
              if (capturedReactImport !== null) {
                const lastSpecifier =
                  capturedReactImport.specifiers[capturedReactImport.specifiers.length - 1];
                if (lastSpecifier) {
                  fixes.push(
                    fixer.insertTextAfterRange(spanRange(lastSpecifier), `, useEffectEvent`),
                  );
                }
              }

              // 2. Insert new variable declaration before useEffect call
              const lineStart = src.lastIndexOf("\n", node.start - 1) + 1;
              const indent = src.slice(lineStart, node.start);
              fixes.push(
                fixer.insertTextBeforeRange(
                  spanRange(node),
                  `const ${eventName} = useEffectEvent(${name});\n${indent}`,
                ),
              );

              // 3. Replace handler calls in the callback with the wrapped event name
              const callbackArg = node.arguments[0];
              if (callbackArg?.type === "ArrowFunctionExpression") {
                const { body } = callbackArg;
                if (body.type === "BlockStatement") {
                  for (const call of collectCallsToName(body, name)) {
                    fixes.push(fixer.replaceTextRange(spanRange(call.callee), eventName));
                  }
                }
              }

              // 4. Remove handler from dependency array
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

export default preferUseEffectEvent;
