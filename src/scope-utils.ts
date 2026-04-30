import type { ESTree, ScopeManager, Variable } from "@oxlint/plugins";

/**
 * Find the `Variable` that an identifier reference resolves to using the scope manager.
 *
 * Returns `null` when: - The identifier is unresolved (e.g. references a global / undeclared name).
 * - The identifier does not appear as a `Reference` in any scope (e.g. it is a binding name).
 */
export function findReferenceVariable(
  scopeManager: ScopeManager,
  identifier: ESTree.IdentifierReference | ESTree.IdentifierName,
): Variable | null {
  for (const scope of scopeManager.scopes) {
    for (const ref of scope.references) {
      if (ref.identifier === identifier) {
        return ref.resolved;
      }
    }
  }
  return null;
}

/**
 * Get the `Variable` declared at the given binding identifier.
 *
 * Searches every scope in the scope manager for a variable whose first declaration identifier is
 * the given node.
 */
export function findDeclaredVariable(
  scopeManager: ScopeManager,
  binding: ESTree.BindingIdentifier,
): Variable | null {
  for (const scope of scopeManager.scopes) {
    for (const variable of scope.variables) {
      for (const id of variable.identifiers) {
        if (id === binding) return variable;
      }
    }
  }
  return null;
}
