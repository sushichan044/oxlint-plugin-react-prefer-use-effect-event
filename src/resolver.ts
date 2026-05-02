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

export class Resolver {
  #configDirCache: Map<string, string | null>;
  #tsconfigCache: Map<string, string | null>;
  #resolverFactoryCache: Map<string, ResolverFactory>;

  constructor() {
    this.#configDirCache = new Map();
    this.#tsconfigCache = new Map();
    this.#resolverFactoryCache = new Map();
  }

  /**
   * Walk upwards from the directory containing `filename` to find the nearest oxlint config file.
   * Returns the directory containing that config, or `null` if none was found.
   *
   * The plugin treats this directory as the resolution base for `from: "file"` target paths. Note
   * this discovery is independent of the config oxlint actually loaded — when oxlint runs with `-c
   * <path>` the explicit config disables nested lookup, but this walk still finds whatever
   * `.oxlintrc.json` (or `oxlint.config.*`) is closest on disk.
   */
  findOxlintConfigDir(filename: string): string | null {
    const startDir = path.dirname(filename);
    const cached = this.#configDirCache.get(startDir);
    if (cached !== undefined) return cached;

    const found = find.any(OXLINT_CONFIG_NAMES, { cwd: startDir, last: WALK_STOP_DIR });
    const dir = found ? path.dirname(found) : null;
    this.#configDirCache.set(startDir, dir);
    return dir;
  }

  /**
   * Walk upwards from the directory containing `filename` to find the nearest `tsconfig.json`.
   * Returns the absolute path to that tsconfig, or `null` if none exists. Used to feed
   * unrs-resolver with the right TS path context so aliases (e.g. `@/hooks/...`) resolve
   * correctly.
   */
  findTsconfig(filename: string): string | null {
    const startDir = path.dirname(filename);
    const cached = this.#tsconfigCache.get(startDir);
    if (cached !== undefined) return cached;

    const found = find.up(TSCONFIG_NAME, { cwd: startDir, last: WALK_STOP_DIR }) ?? null;
    this.#tsconfigCache.set(startDir, found);
    return found;
  }

  /**
   * Resolve `importSource` (e.g. `"@/hooks/useToast"`, `"./local"`, `"react"`) as it would be seen
   * from the file at `filename`. Returns the absolute on-disk path of the resolved module, or
   * `null` when resolution fails (missing module, unresolvable alias, etc.).
   */
  resolveImportSource(filename: string, importSource: string): string | null {
    const fileDir = path.dirname(filename);
    const tsconfigPath = this.findTsconfig(filename);
    const factory = this.getResolverFactory(tsconfigPath);
    const result = factory.sync(fileDir, importSource);
    return result.path ?? null;
  }

  private getResolverFactory(tsconfigPath: string | null): ResolverFactory {
    const key = tsconfigPath ?? "<no-tsconfig>";
    let factory = this.#resolverFactoryCache.get(key);
    if (factory) return factory;

    factory = new ResolverFactory({
      extensions: RESOLVER_EXTENSIONS,
      conditionNames: RESOLVER_CONDITIONS,
      ...(tsconfigPath !== null && { tsconfig: { configFile: tsconfigPath } }),
    });
    this.#resolverFactoryCache.set(key, factory);
    return factory;
  }
}
