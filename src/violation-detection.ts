import type { ESTree, Variable } from "@oxlint/plugins";
import type { ScopeIndex } from "./scope-utils";
import type { TargetSpec } from "./types";

import {
  areAllReferencesDirectCallees,
  collectCallSitesOfVariable,
  getFunctionCallbackBody,
  hasReferenceInRange,
} from "./ast-utils";

/**
 * One reportable handler reference for an effect hook call (`useEffect`, `useLayoutEffect`, or
 * `useInsertionEffect`). Carries everything the Fix phase needs to mutate the source — Detect
 * collects, Fix consumes.
 *
 * Two flavours share this type:
 *
 * - `depElement !== null` — handler is listed in the dep array. The dep Identifier is both the report
 *   target and the element to remove from the array (Fix-D fires).
 * - `depElement === null` — handler is referenced inside the callback but missing from the dep array
 *   (the exhaustive-deps suppression case). The first call site is the report target and the dep
 *   array is left untouched (Fix-D is skipped).
 */
export type HandlerViolation = {
  /**
   * The Identifier reference node inside the dep array when the handler is listed there, or `null`
   * when the handler is referenced from the callback but absent from the dep array.
   */
  depElement: ESTree.IdentifierReference | null;
  /** Local name of the handler binding (e.g. `"navigate"`). */
  handlerName: string;
  /** The first argument of the effect hook call — used to scope the binding-availability check. */
  callbackArg: ESTree.Node;
  /** The function body inside the callback — used to scope call-site rewriting. */
  callbackBody: ESTree.Node;
  /**
   * Every direct-callee call site of the handler inside the callback body. Guaranteed non-empty:
   * Detect drops the violation when no call sites are found, so the rule shell can read
   * `callSites[0]` to position the diagnostic without an extra nil check.
   */
  callSites: [ESTree.CallExpression, ...ESTree.CallExpression[]];
  /** The effect hook call expression — used to compute the wrapper insertion point. */
  effectNode: ESTree.CallExpression;
  /** The dependency `ArrayExpression` — used to remove the handler from the dep list. */
  depsArray: ESTree.ArrayExpression;
};

/**
 * Inspect an effect hook call (`useEffect` / `useLayoutEffect` / `useInsertionEffect`) and return
 * one `HandlerViolation` for every tracked handler that satisfies the rule's gating conditions.
 *
 * Two passes share the same gates (inline callback body, all references are direct callees, at
 * least one call site in the body):
 *
 * - Phase 1 walks the dep array — each Identifier that resolves to a tracked handler with a call site
 *   in the body produces a violation whose `depElement` points to the dep entry. The handler is
 *   recorded in `seenVariables` so Phase 2 does not re-emit for the same binding.
 * - Phase 2 walks `trackedHandlers` — handlers absent from the dep array but still called inside the
 *   callback produce a `depElement: null` violation. This is the `react-hooks/exhaustive-deps`
 *   suppression case, where the dep list intentionally omits a handler that would otherwise cause
 *   the effect to resubscribe.
 *
 * Phase 1 records `seenVariables` even when push is skipped (e.g. callee gate fails) so that
 * "handler is in deps but has non-callee references" stays a single Phase-1 decision and never
 * leaks into Phase 2.
 *
 * Detect does _not_ compute autofix availability — that requires `context.sourceCode.getScope` and
 * is handled by the rule shell.
 */
export function detectViolations(
  effectNode: ESTree.CallExpression,
  index: ScopeIndex,
  trackedHandlers: ReadonlyMap<Variable, TargetSpec>,
): HandlerViolation[] {
  const callbackArg = effectNode.arguments[0];
  const depsArg = effectNode.arguments[1];
  if (!callbackArg || !depsArg || depsArg.type !== "ArrayExpression") return [];

  const callbackBody = getFunctionCallbackBody(callbackArg);
  if (!callbackBody) return [];

  const violations: HandlerViolation[] = [];
  const seenVariables = new Set<Variable>();

  for (const element of depsArg.elements) {
    if (!element || element.type !== "Identifier") continue;

    const variable = index.resolveReference(element);
    if (!variable) continue;
    if (!trackedHandlers.has(variable)) continue;

    // Record before the further gates so that the "handler is in deps but mixed callee/non-callee
    // references" decision belongs to Phase 1 alone. Without this, Phase 2 would re-check the same
    // variable.
    seenVariables.add(variable);

    if (!areAllReferencesDirectCallees(variable, callbackBody)) continue;

    const callSites = collectCallSitesOfVariable(variable, callbackBody);
    const [firstCallSite, ...restCallSites] = callSites;
    if (!firstCallSite) continue;

    violations.push({
      depElement: element,
      handlerName: element.name,
      callbackArg,
      callbackBody,
      callSites: [firstCallSite, ...restCallSites],
      effectNode,
      depsArray: depsArg,
    });
  }

  for (const variable of trackedHandlers.keys()) {
    if (seenVariables.has(variable)) continue;
    if (!hasReferenceInRange(variable, callbackBody)) continue;
    if (!areAllReferencesDirectCallees(variable, callbackBody)) continue;

    const callSites = collectCallSitesOfVariable(variable, callbackBody);
    const [firstCallSite, ...restCallSites] = callSites;
    if (!firstCallSite) continue;

    violations.push({
      depElement: null,
      handlerName: variable.name,
      callbackArg,
      callbackBody,
      callSites: [firstCallSite, ...restCallSites],
      effectNode,
      depsArray: depsArg,
    });
  }

  return violations;
}
