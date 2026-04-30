import type { ESTree, Variable } from "@oxlint/plugins";

export function getModuleExportName(name: ESTree.ModuleExportName): string {
  return name.type === "Identifier" ? name.name : name.value;
}

/**
 * If `identifier` is the direct callee of a `CallExpression` (`f(...)`, NOT `o.f(...)`), return
 * that `CallExpression`. Otherwise return `null`.
 *
 * Relies on the `parent` link that the linter sets while visiting; do not call this outside of a
 * rule run.
 */
export function getDirectParentCall(node: ESTree.Node): ESTree.CallExpression | null {
  const parent = node.parent;
  if (!parent || parent.type !== "CallExpression") return null;
  // Narrow to nodes that the AST actually allows as a callee.
  if ((parent.callee as ESTree.Node) !== node) return null;
  return parent;
}

/**
 * Find every `CallExpression` inside `range` whose callee identifier is a reference to `variable`.
 *
 * Uses the variable's reference list rather than walking the AST, so it is robust against
 * arbitrarily nested call sites (`if (...) { f(); }` etc.) without manual traversal.
 */
export function collectCallSitesOfVariable(
  variable: Variable,
  range: { start: number; end: number },
): ESTree.CallExpression[] {
  const results: ESTree.CallExpression[] = [];
  for (const ref of variable.references) {
    const id = ref.identifier;
    if (id.start < range.start || id.end > range.end) continue;
    const call = getDirectParentCall(id);
    if (call) results.push(call);
  }
  return results;
}
