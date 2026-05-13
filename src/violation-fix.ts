import type { Fix, Fixer, SourceCode } from "@oxlint/plugins";
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
  sourceCode: SourceCode,
  fixer: Fixer,
): Fix[] {
  const eventName = `${violation.handlerName}Event`;
  const eventCalleeText = resolveEventCalleeText(reactImport, exportName);
  const fixes: Fix[] = [];

  addUseEffectEventImport(fixes, fixer, reactImport, exportName);
  insertWrapperDeclaration(fixes, fixer, violation, sourceCode, eventName, eventCalleeText);
  replaceCallSites(fixes, fixer, violation, eventName);
  removeFromDepsArray(fixes, fixer, violation, sourceCode);

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
 * before the effect hook call, mirroring its column.
 */
function insertWrapperDeclaration(
  fixes: Fix[],
  fixer: Fixer,
  violation: HandlerViolation,
  sourceCode: SourceCode,
  eventName: string,
  eventCalleeText: string,
): void {
  const text = sourceCode.getText();
  const [nodeStart] = violation.effectNode.range;
  const lineStart = text.lastIndexOf("\n", nodeStart - 1) + 1;
  const indent = text.slice(lineStart, nodeStart);
  fixes.push(
    fixer.insertTextBeforeRange(
      violation.effectNode.range,
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
 * Fix-D — Remove the handler Identifier from the dependency array.
 *
 * Surgically removes the element along with its adjacent comma so the array's surrounding
 * formatting (line breaks, comments outside the removed span) stays intact. Prefers the trailing
 * comma when one exists; falls back to the preceding comma for the last element; falls back to
 * removing only the element when it is the only one in the array.
 */
function removeFromDepsArray(
  fixes: Fix[],
  fixer: Fixer,
  violation: HandlerViolation,
  sourceCode: SourceCode,
): void {
  const tokenAfter = sourceCode.getTokenAfter(violation.depElement);
  if (tokenAfter && tokenAfter.value === ",") {
    // Extend the removal up to the next token so the inter-element whitespace goes with the
    // comma, leaving `[a, c]` rather than `[a,  c]` when `b` is removed.
    const tokenAfterComma = sourceCode.getTokenAfter(tokenAfter);
    const removeEnd = tokenAfterComma ? tokenAfterComma.range[0] : tokenAfter.range[1];
    fixes.push(fixer.removeRange([violation.depElement.range[0], removeEnd]));
    return;
  }

  const tokenBefore = sourceCode.getTokenBefore(violation.depElement);
  if (tokenBefore && tokenBefore.value === ",") {
    // Last element: start the removal at the previous token's end so the comma and the
    // whitespace before this element are consumed together.
    const tokenBeforeComma = sourceCode.getTokenBefore(tokenBefore);
    const removeStart = tokenBeforeComma ? tokenBeforeComma.range[1] : tokenBefore.range[0];
    fixes.push(fixer.removeRange([removeStart, violation.depElement.range[1]]));
    return;
  }

  fixes.push(fixer.removeRange(violation.depElement.range));
}
