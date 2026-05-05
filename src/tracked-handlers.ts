import type { ESTree } from "@oxlint/plugins";
import type { TargetSpec } from "./types";

/** A binding identifier that should be treated as a handler, with the target it came from. */
export type HandlerBinding = {
  binding: ESTree.BindingIdentifier;
  target: TargetSpec;
};

/**
 * Resolve the call expression's callee to a known target.
 *
 * Returning `null` means "this call does not come from a tracked import" — for the rule this is
 * provided by looking up the callee identifier through the scope manager.
 */
export type ResolveCalleeTarget = (callee: ESTree.IdentifierReference) => TargetSpec | null;

/**
 * Extract handler bindings declared by `const x = source(...)` or `const { y } = source(...)`,
 * where `source(...)` resolves to a tracked import via `resolveCalleeTarget`.
 *
 * Returns an empty array when the declarator does not match either shape, when its initializer is
 * not a call to a tracked import, or when the handler kind disallows the shape.
 *
 * `value` handlers are NOT processed here — for those the import binding itself is the handler, not
 * anything declared via `=`.
 */
export function extractHandlersFromDeclarator(
  declarator: ESTree.VariableDeclarator,
  resolveCalleeTarget: ResolveCalleeTarget,
): HandlerBinding[] {
  if (!declarator.init || declarator.init.type !== "CallExpression") return [];
  const { callee } = declarator.init;
  if (callee.type !== "Identifier") return [];

  const target = resolveCalleeTarget(callee);
  if (!target) return [];

  switch (target.handler.kind) {
    case "value":
      return [];

    case "call-return": {
      if (declarator.id.type !== "Identifier") return [];
      return [{ binding: declarator.id, target }];
    }

    case "call-return-property": {
      if (declarator.id.type !== "ObjectPattern") return [];
      return collectMatchingProperties(declarator.id, target.handler.properties, target);
    }
  }
}

function collectMatchingProperties(
  pattern: ESTree.ObjectPattern,
  wantedProperties: readonly string[],
  target: TargetSpec,
): HandlerBinding[] {
  const wanted = new Set(wantedProperties);
  const handlers: HandlerBinding[] = [];

  for (const property of pattern.properties) {
    if (property.type !== "Property") continue;
    if (property.computed) continue;

    const propertyName = readStaticPropertyName(property.key);
    if (propertyName === null || !wanted.has(propertyName)) continue;

    // Only plain `{ a }` or `{ a: b }` — nested patterns / defaults are not supported.
    if (property.value.type !== "Identifier") continue;
    handlers.push({ binding: property.value, target });
  }

  return handlers;
}

function readStaticPropertyName(key: ESTree.PropertyKey): string | null {
  if (key.type === "Identifier") return key.name;
  if (key.type === "Literal" && typeof key.value === "string") return key.value;
  return null;
}
