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
 * Decide whether `name` is safe to introduce as a new binding in `insertScope`.
 *
 * The autofix coins a `${handlerName}Event` const in `insertScope` and rewrites call sites inside
 * the `useEffect` callback to reference it. The name is unsafe when it's already declared in
 * `insertScope` (redeclaration), in any ancestor scope (the new const would shadow that binding for
 * unrelated references inside the callback), or in any descendant scope within the callback (a
 * rewritten call site inside that scope would resolve to the local binding instead of the
 * wrapper).
 *
 * When `callbackNode` is provided, the descendant check is limited to scopes whose block falls
 * entirely within the callback's range, avoiding false positives from unrelated nested functions
 * elsewhere in the component. Without it, all descendants are checked conservatively.
 */
export function isBindingNameAvailable(
  name: string,
  insertScope: Scope,
  callbackNode?: ESTree.Node | null,
): boolean {
  for (let s: Scope | null = insertScope; s !== null; s = s.upper) {
    if (s.set.has(name)) return false;
  }
  const callbackRange = callbackNode?.range;
  const stack: Scope[] = [...insertScope.childScopes];
  for (let scope = stack.pop(); scope !== undefined; scope = stack.pop()) {
    if (callbackRange) {
      const [blockStart, blockEnd] = scope.block.range;
      if (blockStart < callbackRange[0] || blockEnd > callbackRange[1]) {
        continue;
      }
    }
    if (scope.set.has(name)) return false;
    stack.push(...scope.childScopes);
  }
  return true;
}
