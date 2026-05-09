import type { ESTree, Range, Variable } from "@oxlint/plugins";

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
  range: { range: Range },
): ESTree.CallExpression[] {
  const [rangeStart, rangeEnd] = range.range;
  const results: ESTree.CallExpression[] = [];
  for (const ref of variable.references) {
    const id = ref.identifier;
    const [idStart, idEnd] = id.range;
    if (idStart < rangeStart || idEnd > rangeEnd) continue;
    const call = getDirectParentCall(id);
    if (call) results.push(call);
  }
  return results;
}

/**
 * Whether every reference of `variable` inside `range` is the direct callee of a `CallExpression`
 * (`f(...)` style). Returns `true` when there are no references in range.
 *
 * Used as the rule's detection gate: rewriting only callee references would leave a dangling
 * reference when the handler also appears as a value (`subscribe(handler)`), is reassigned (`const
 * fn = handler`), or is used inside JSX, so those shapes are intentionally not reported.
 */
export function areAllReferencesDirectCallees(
  variable: Variable,
  range: { range: Range },
): boolean {
  const [rangeStart, rangeEnd] = range.range;
  for (const ref of variable.references) {
    const id = ref.identifier;
    const [idStart, idEnd] = id.range;
    if (idStart < rangeStart || idEnd > rangeEnd) continue;
    if (!getDirectParentCall(id)) return false;
  }
  return true;
}

/**
 * Body of a function-like `useEffect` callback argument. Normalises the three lintable shapes —
 * arrow with block body (`() => { … }`), arrow with expression body (`() => f()`), and function
 * expression (`function () { … }`) — to a single node whose `range` covers the inspectable region.
 *
 * Returns `null` for any other argument shape (identifier reference, conditional, etc.); callers
 * skip those because there is no inline function body to inspect or rewrite.
 */
export function getFunctionCallbackBody(node: ESTree.Node | null | undefined): ESTree.Node | null {
  if (!node) return null;
  if (node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression") {
    return node.body;
  }
  return null;
}
