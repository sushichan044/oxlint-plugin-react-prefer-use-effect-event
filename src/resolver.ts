import * as os from "node:os";
import * as path from "node:path";

import * as find from "empathic/find";
import { ResolverFactory } from "unrs-resolver";

/**
 * Upper bound for upward directory traversal. We never expect a project's `.oxlintrc.json` /
 * `tsconfig.json` to live above the user's home directory, so stopping here keeps lookups bounded
 * even when the linted file sits outside any project tree (e.g. a stray ad-hoc edit). When the walk
 * path doesn't pass through `os.homedir()` at all (e.g. CI checkouts under `/work`), the `last`
 * option is a no-op and the walk falls back to filesystem root.
 */
const WALK_STOP_DIR = os.homedir();

const OXLINT_CONFIG_NAMES = [
  ".oxlintrc.json",
  "oxlint.config.ts",
  "oxlint.config.mts",
  "oxlint.config.cts",
  "oxlint.config.js",
  "oxlint.config.mjs",
  "oxlint.config.cjs",
];

const TSCONFIG_NAME = "tsconfig.json";

const RESOLVER_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json"];
const RESOLVER_CONDITIONS = ["import", "require", "node", "default"];

const configDirCache = new Map<string, string | null>();
const tsconfigCache = new Map<string, string | null>();
const resolverCache = new Map<string, ResolverFactory>();

/**
 * Walk upwards from the directory containing `filename` to find the nearest oxlint config file.
 * Returns the directory containing that config, or `null` if none was found.
 *
 * The plugin treats this directory as the resolution base for `from: "file"` target paths. Note
 * this discovery is independent of the config oxlint actually loaded — when oxlint runs with `-c
 * <path>` the explicit config disables nested lookup, but this walk still finds whatever
 * `.oxlintrc.json` (or `oxlint.config.*`) is closest on disk.
 */
export function findOxlintConfigDir(filename: string): string | null {
  const startDir = path.dirname(filename);
  const cached = configDirCache.get(startDir);
  if (cached !== undefined) return cached;

  const found = find.any(OXLINT_CONFIG_NAMES, { cwd: startDir, last: WALK_STOP_DIR });
  const dir = found ? path.dirname(found) : null;
  configDirCache.set(startDir, dir);
  return dir;
}

/**
 * Walk upwards from the directory containing `filename` to find the nearest `tsconfig.json`.
 * Returns the absolute path to that tsconfig, or `null` if none exists. Used to feed unrs-resolver
 * with the right TS path context so aliases (e.g. `@/hooks/...`) resolve correctly.
 */
export function findTsconfig(filename: string): string | null {
  const startDir = path.dirname(filename);
  const cached = tsconfigCache.get(startDir);
  if (cached !== undefined) return cached;

  const found = find.up(TSCONFIG_NAME, { cwd: startDir, last: WALK_STOP_DIR }) ?? null;
  tsconfigCache.set(startDir, found);
  return found;
}

/**
 * Get a `ResolverFactory` configured for the given tsconfig. A `null` tsconfig falls back to plain
 * Node-style resolution. Resolvers are memoised per (tsconfig path) so repeated lints inside one
 * process reuse unrs-resolver's internal cache.
 */
export function getResolver(tsconfigPath: string | null): ResolverFactory {
  const key = tsconfigPath ?? "<no-tsconfig>";
  let resolver = resolverCache.get(key);
  if (resolver) return resolver;

  resolver = new ResolverFactory({
    extensions: RESOLVER_EXTENSIONS,
    conditionNames: RESOLVER_CONDITIONS,
    ...(tsconfigPath !== null && { tsconfig: { configFile: tsconfigPath } }),
  });
  resolverCache.set(key, resolver);
  return resolver;
}

/**
 * Resolve `importSource` (e.g. `"@/hooks/useToast"`, `"./local"`, `"react"`) as it would be seen
 * from the file at `filename`. Returns the absolute on-disk path of the resolved module, or `null`
 * when resolution fails (missing module, unresolvable alias, etc.).
 */
export function resolveImportSource(filename: string, importSource: string): string | null {
  const fileDir = path.dirname(filename);
  const tsconfigPath = findTsconfig(filename);
  const resolver = getResolver(tsconfigPath);
  const result = resolver.sync(fileDir, importSource);
  return result.path ?? null;
}

/** Reset all internal caches. Intended for tests that swap the underlying file system fixtures. */
export function clearResolverCachesForTesting(): void {
  configDirCache.clear();
  tsconfigCache.clear();
  resolverCache.clear();
}
