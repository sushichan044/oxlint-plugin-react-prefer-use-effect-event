import type { ESTree, Variable } from "@oxlint/plugins";
import type { ScopeIndex } from "./scope-utils";
import type { TargetSpec } from "./types";

import { matchModuleTarget } from "./tracked-imports";
import { extractHandlersFromDeclarator } from "./tracked-handlers";

/**
 * Per-file inputs the Collect phase needs to resolve user-configured `targets` against the file
 * being linted.
 */
export type CollectContext = {
  index: ScopeIndex;
  fileTargets: readonly TargetSpec[];
  /** Directory of the nearest oxlint config; `null` when no `from: "file"` target is configured. */
  configDir: string | null;
  /** Absolute path of an import source as seen from the file being linted, or `null`. */
  resolveImportSource: (importSource: string) => string | null;
};

/** Per-file mutable maps that the Collect phase populates and the Detect phase reads. */
export type CollectedTracking = {
  /** Import binding → matched target. Used by `VariableDeclarator` to recognise tracked calls. */
  trackedImports: Map<Variable, TargetSpec>;
  /** Handler binding → target it came from. Used by `CallExpression` to recognise dep handlers. */
  trackedHandlers: Map<Variable, TargetSpec>;
};

/**
 * Walk the specifiers of `import ... from "..."` and register every one whose source/name pair
 * matches a configured target. For `value` handlers the import binding _is_ the handler, so it is
 * registered in `trackedHandlers` immediately.
 */
export function collectTrackedImport(
  node: ESTree.ImportDeclaration,
  tracking: CollectedTracking,
  ctx: CollectContext,
): void {
  // Resolve the import source on demand — only file-source targets need it, and only if a
  // specifier's `imported` name matched first.
  let resolvedImport: string | null | undefined;
  const getResolvedImport = (): string | null => {
    if (resolvedImport === undefined) {
      resolvedImport = ctx.resolveImportSource(node.source.value);
    }
    return resolvedImport;
  };

  for (const specifier of node.specifiers) {
    if (specifier.type !== "ImportSpecifier" && specifier.type !== "ImportDefaultSpecifier")
      continue;
    const target = matchModuleTarget(specifier, node.source.value, ctx.fileTargets, {
      configDir: ctx.configDir,
      getResolvedImport,
    });
    if (!target) continue;

    const variable = ctx.index.resolveDeclaration(specifier.local);
    if (!variable) continue;

    tracking.trackedImports.set(variable, target);
    if (target.handler.kind === "value") {
      tracking.trackedHandlers.set(variable, target);
    }
  }
}

/**
 * Register handler bindings declared by `const x = source(...)` or `const { y } = source(...)` when
 * `source(...)` resolves to a tracked import. `value` handlers are not produced here — those are
 * registered at the import site by `collectTrackedImport`.
 */
export function collectHandlerBindings(
  node: ESTree.VariableDeclarator,
  tracking: CollectedTracking,
  index: ScopeIndex,
): void {
  const handlers = extractHandlersFromDeclarator(node, (callee) => {
    const variable = index.resolveReference(callee);
    if (!variable) return null;
    return tracking.trackedImports.get(variable) ?? null;
  });

  for (const handler of handlers) {
    const variable = index.resolveDeclaration(handler.binding);
    if (variable) tracking.trackedHandlers.set(variable, handler.target);
  }
}
