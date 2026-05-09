import type { Fix, Fixer } from "@oxlint/plugins";
import type { ReactImportState } from "./react-import-state";
import type { HandlerViolation } from "./violation-detection";

import { resolveEventCalleeText } from "./react-import-state";

/**
 * Build the four-step autofix for a `HandlerViolation`. Caller must have already verified that the
 * wrapper binding name is available in the insertion scope (the rule shell does this) — when it is
 * not, no fix is produced and `buildViolationFix` is never called.
 *
 * The four steps are emitted in source order to keep the diff readable; the linter applies them
 * atomically.
 */
export function buildViolationFix(
  violation: HandlerViolation,
  reactImport: ReactImportState | null,
  exportName: string,
  source: string,
  fixer: Fixer,
): Fix[] {
  const eventName = `${violation.handlerName}Event`;
  const eventCalleeText = resolveEventCalleeText(reactImport, exportName);
  const fixes: Fix[] = [];

  addUseEffectEventImport(fixes, fixer, reactImport, exportName);
  insertWrapperDeclaration(fixes, fixer, violation, source, eventName, eventCalleeText);
  replaceCallSites(fixes, fixer, violation, eventName);
  removeFromDepsArray(fixes, fixer, violation, source);

  return fixes;
}

/**
 * Fix-A — Add `useEffectEvent` (or `experimental_useEffectEvent`) to the React named imports if it
 * isn't there yet. Skipped when:
 *
 * - The local name is already known (existing `useEffectEvent` named import — no-op).
 * - The React import has only a default/namespace specifier (the wrapper callee uses
 *   `<ns>.useEffectEvent` instead, no named specifier list to extend).
 */
function addUseEffectEventImport(
  fixes: Fix[],
  fixer: Fixer,
  reactImport: ReactImportState | null,
  exportName: string,
): void {
  if (reactImport === null) return;
  if (reactImport.useEffectEventLocalName !== null) return;

  const namedSpecifiers = reactImport.node.specifiers.filter((s) => s.type === "ImportSpecifier");
  const lastNamed = namedSpecifiers[namedSpecifiers.length - 1];
  if (!lastNamed) return;

  fixes.push(fixer.insertTextAfterRange(lastNamed.range, `, ${exportName}`));
}

/**
 * Fix-B — Insert `const ${eventName} = ${calleeText}(${handlerName});\n${indent}` immediately
 * before the `useEffect` call, mirroring its column.
 */
function insertWrapperDeclaration(
  fixes: Fix[],
  fixer: Fixer,
  violation: HandlerViolation,
  source: string,
  eventName: string,
  eventCalleeText: string,
): void {
  const [nodeStart] = violation.useEffectNode.range;
  const lineStart = source.lastIndexOf("\n", nodeStart - 1) + 1;
  const indent = source.slice(lineStart, nodeStart);
  fixes.push(
    fixer.insertTextBeforeRange(
      violation.useEffectNode.range,
      `const ${eventName} = ${eventCalleeText}(${violation.handlerName});\n${indent}`,
    ),
  );
}

/**
 * Fix-C — Replace each direct-callee call site of the handler inside the callback body with the
 * coined wrapper name. Works uniformly for block and expression bodies because the call sites were
 * collected through scope references, not by AST shape.
 */
function replaceCallSites(
  fixes: Fix[],
  fixer: Fixer,
  violation: HandlerViolation,
  eventName: string,
): void {
  for (const call of violation.callSites) {
    fixes.push(fixer.replaceTextRange(call.callee.range, eventName));
  }
}

/**
 * Fix-D — Remove the handler Identifier from the dependency array, preserving every other element
 * verbatim.
 */
function removeFromDepsArray(
  fixes: Fix[],
  fixer: Fixer,
  violation: HandlerViolation,
  source: string,
): void {
  const remaining: string[] = [];
  const [elementStart] = violation.depElement.range;
  for (const e of violation.depsArray.elements) {
    if (!e) continue;
    const [eStart, eEnd] = e.range;
    if (eStart === elementStart) continue;
    remaining.push(source.slice(eStart, eEnd));
  }
  fixes.push(fixer.replaceTextRange(violation.depsArray.range, `[${remaining.join(", ")}]`));
}
