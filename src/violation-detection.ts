import type { ESTree, Variable } from "@oxlint/plugins";
import type { ScopeIndex } from "./scope-utils";
import type { TargetSpec } from "./types";

import {
  areAllReferencesDirectCallees,
  collectCallSitesOfVariable,
  getFunctionCallbackBody,
} from "./ast-utils";

/**
 * One reportable handler reference inside an effect-hook dependency array (`useEffect`,
 * `useLayoutEffect`, or `useInsertionEffect`). Carries everything the Fix phase needs to mutate the
 * source — Detect collects, Fix consumes.
 */
export type HandlerViolation = {
  /** The Identifier reference node inside the dep array — the report target. */
  depElement: ESTree.IdentifierReference;
  /** Local name of the handler binding (e.g. `"navigate"`). */
  handlerName: string;
  /** The first argument of the effect hook call — used to scope the binding-availability check. */
  callbackArg: ESTree.Node;
  /** The function body inside the callback — used to scope call-site rewriting. */
  callbackBody: ESTree.Node;
  /** Every direct-callee call site of the handler inside the callback body. */
  callSites: ESTree.CallExpression[];
  /** The effect hook call expression — used to compute the wrapper insertion point. */
  effectNode: ESTree.CallExpression;
  /** The dependency `ArrayExpression` — used to remove the handler from the dep list. */
  depsArray: ESTree.ArrayExpression;
};

/**
 * Walk the dependency array of an effect hook call (`useEffect` / `useLayoutEffect` /
 * `useInsertionEffect`) and return one `HandlerViolation` for every dep Identifier that satisfies
 * all of the rule's gating conditions:
 *
 * 1. The Identifier resolves to a variable in `trackedHandlers`.
 * 2. The first argument of the effect hook is an inline arrow / function-expression with a body.
 * 3. Every reference to the handler inside that body is a direct callee (no value pass, no
 *    reassignment, no JSX use).
 * 4. The body contains at least one such call site (a stray dep is not reported).
 *
 * Detect does _not_ compute autofix availability — that requires `context.sourceCode.getScope` and
 * is handled by the rule shell. Detect's only job is "what should be reported".
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

  for (const element of depsArg.elements) {
    if (!element || element.type !== "Identifier") continue;

    const variable = index.resolveReference(element);
    if (!variable) continue;
    if (!trackedHandlers.has(variable)) continue;

    if (!areAllReferencesDirectCallees(variable, callbackBody)) continue;

    const callSites = collectCallSitesOfVariable(variable, callbackBody);
    if (callSites.length === 0) continue;

    violations.push({
      depElement: element,
      handlerName: element.name,
      callbackArg,
      callbackBody,
      callSites,
      effectNode,
      depsArray: depsArg,
    });
  }

  return violations;
}
