import type { ESTree } from "@oxlint/plugins";
import type { TargetSpec } from "./types";
import { getModuleExportName } from "./ast-utils";

/**
 * Find the first target whose `package` source matches the given import specifier.
 *
 * Matching uses the _original_ exported name (`specifier.imported`), so renamed imports such as
 * `import { useNavigate as useNav } from "react-router"` still match a target configured with
 * `name: "useNavigate"`.
 */
export function matchPackageTarget(
  specifier: ESTree.ImportSpecifier,
  importSource: string,
  targets: readonly TargetSpec[],
): TargetSpec | null {
  const importedName = getModuleExportName(specifier.imported);
  for (const target of targets) {
    if (target.source.from !== "package") continue;
    if (target.source.package !== importSource) continue;
    if (target.source.name !== importedName) continue;
    return target;
  }
  return null;
}
