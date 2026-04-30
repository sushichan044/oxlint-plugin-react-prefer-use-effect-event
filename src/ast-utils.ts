import type { ESTree } from "@oxlint/plugins";

export function getModuleExportName(name: ESTree.ModuleExportName): string {
  return name.type === "Identifier" ? name.name : name.value;
}

export function collectCallsToName(
  body: ESTree.FunctionBody,
  name: string,
): ESTree.CallExpression[] {
  const results: ESTree.CallExpression[] = [];
  for (const stmt of body.body) {
    if (stmt.type !== "ExpressionStatement") continue;
    const { expression } = stmt;
    if (expression.type !== "CallExpression") continue;
    const { callee } = expression;
    if (callee.type !== "Identifier") continue;
    if (callee.name !== name) continue;
    results.push(expression);
  }
  return results;
}
