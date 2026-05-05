import type { ESTree, Scope, ScopeManager, Variable } from "@oxlint/plugins";

/**
 * O(1) lookups of identifier-node → variable, backed by maps that are populated lazily on the first
 * call.
 *
 * The naive alternative — walking every scope on every lookup — is O(scopes × variables) per call.
 * Rules visit hundreds of identifiers per file, so the linear walk dominated the rule's runtime.
 *
 * One instance is created per file and discarded when the file is done.
 */
export class ScopeIndex {
  readonly #scopeManager: ScopeManager;
  #references: Map<unknown, Variable | null> | null = null;
  #declarations: Map<unknown, Variable> | null = null;

  constructor(scopeManager: ScopeManager) {
    this.#scopeManager = scopeManager;
  }

  /**
   * Resolve an identifier reference to its declared `Variable`.
   *
   * Returns `null` for unresolved (e.g. global) references and for identifiers that aren't a
   * reference (e.g. binding identifiers).
   */
  resolveReference(
    identifier: ESTree.IdentifierReference | ESTree.IdentifierName,
  ): Variable | null {
    let map = this.#references;
    if (!map) {
      map = new Map();
      for (const scope of this.#scopeManager.scopes) {
        for (const ref of scope.references) {
          map.set(ref.identifier, ref.resolved);
        }
      }
      this.#references = map;
    }
    return map.get(identifier) ?? null;
  }

  /**
   * Resolve a binding identifier to the `Variable` it declares.
   *
   * Returns `null` when the node is not a binding identifier in any scope.
   */
  resolveDeclaration(binding: ESTree.BindingIdentifier): Variable | null {
    let map = this.#declarations;
    if (!map) {
      map = new Map();
      for (const scope of this.#scopeManager.scopes) {
        for (const variable of scope.variables) {
          for (const id of variable.identifiers) {
            map.set(id, variable);
          }
        }
      }
      this.#declarations = map;
    }
    return map.get(binding) ?? null;
  }
}

/**
 * Pick a binding name based on `base` that won't collide with anything visible from `insertScope`
 * and won't be shadowed by anything declared in a descendant scope.
 *
 * The name we coin is going to be inserted in `insertScope` and referenced from inside child scopes
 * (the `useEffect` callback). So a clash anywhere on that path would either fail to compile
 * (same-scope redeclare) or cause a rewritten reference to bind to the wrong variable (outer-scope
 * shadow, or inner-scope shadow inside the callback).
 *
 * Returns `base` when it's free, otherwise appends `_1`, `_2`, … until a free name is found.
 */
export function findAvailableBindingName(base: string, insertScope: Scope): string {
  const taken = collectConflictingNames(insertScope);
  if (!taken.has(base)) return base;
  let n = 1;
  while (taken.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

function collectConflictingNames(insertScope: Scope): Set<string> {
  const names = new Set<string>();
  // Walk up: anything visible from `insertScope` either prevents the declaration (same scope)
  // or would be shadowed by it (outer scope, breaking existing references inside the callback).
  for (let s: Scope | null = insertScope; s !== null; s = s.upper) {
    for (const name of s.set.keys()) names.add(name);
  }
  // Walk down: a binding with the same name in any descendant scope would shadow the new
  // declaration when we rewrite call sites inside the callback.
  const stack: Scope[] = [...insertScope.childScopes];
  for (let scope = stack.pop(); scope !== undefined; scope = stack.pop()) {
    for (const name of scope.set.keys()) names.add(name);
    stack.push(...scope.childScopes);
  }
  return names;
}
