import * as path from "node:path";

import type { ESTree } from "@oxlint/plugins";
import type { TargetSpec } from "./types";
import { getModuleExportName } from "./ast-utils";

/**
 * Per-import context required to evaluate `from: "file"` targets.
 *
 * The matcher pulls the resolved import source lazily through `getResolvedImport` so packages with
 * only `from: "package"` targets never pay the resolver cost.
 */
export type MatchContext = {
  /**
   * Directory containing the nearest oxlint config above the file being linted. `null` when no
   * config is found — `from: "file"` targets cannot match in that case.
   */
  configDir: string | null;
  /**
   * Resolves the import source (e.g. `"@/hooks/useToast"`) to its absolute on-disk path, or `null`
   * if the resolver cannot find it. Memoised by the caller.
   */
  getResolvedImport: () => string | null;
};

/**
 * Find the first target whose source matches the given import specifier.
 *
 * - `from: "package"` matches when the import source string is exactly the configured package name.
 * - `from: "file"` matches when the resolved absolute path of the import equals the configured `path`
 *   resolved against the nearest oxlint config directory.
 *
 * Matching uses the _original_ exported name (`specifier.imported`), so renamed imports such as
 * `import { useNavigate as useNav } from "react-router"` still match a target configured with
 * `name: "useNavigate"`.
 */
export function matchModuleTarget(
  specifier: ESTree.ImportSpecifier,
  importSource: string,
  targets: readonly TargetSpec[],
  ctx: MatchContext,
): TargetSpec | null {
  const importedName = getModuleExportName(specifier.imported);
  for (const target of targets) {
    if (target.source.name !== importedName) continue;
    if (target.source.from === "package") {
      if (target.source.package === importSource) return target;
      continue;
    }
    if (ctx.configDir === null) continue;
    const expected = path.resolve(ctx.configDir, target.source.path);
    const actual = ctx.getResolvedImport();
    if (actual !== null && expected === actual) return target;
  }
  return null;
}
