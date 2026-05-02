import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearResolverCachesForTesting,
  findOxlintConfigDir,
  findTsconfig,
  resolveImportSource,
} from "./resolver";

let rigDir: string;

beforeEach(() => {
  // `mkdtempSync` returns a path that may include a symlink prefix on macOS
  // (`/var/folders/...` → `/private/var/folders/...`). Canonicalise once so all assertions can use
  // `rigDir` directly without re-running `realpathSync` per call.
  rigDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "oxlint-resolver-")));
  clearResolverCachesForTesting();
});

afterEach(() => {
  fs.rmSync(rigDir, { recursive: true, force: true });
  clearResolverCachesForTesting();
});

function writeFile(rel: string, contents = ""): string {
  const abs = path.join(rigDir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, contents);
  return abs;
}

describe("findOxlintConfigDir", () => {
  it("returns the directory of the nearest .oxlintrc.json above the file", () => {
    writeFile(".oxlintrc.json", "{}");
    const file = writeFile("packages/foo/src/index.ts", "");

    expect(findOxlintConfigDir(file)).toBe(rigDir);
  });

  it("prefers the closer config when nested configs exist", () => {
    writeFile(".oxlintrc.json", "{}");
    writeFile("packages/foo/.oxlintrc.json", "{}");
    const file = writeFile("packages/foo/src/index.ts", "");

    expect(findOxlintConfigDir(file)).toBe(path.join(rigDir, "packages/foo"));
  });

  it("recognises oxlint.config.* alongside .oxlintrc.json", () => {
    writeFile("oxlint.config.ts", "export default {};");
    const file = writeFile("src/index.ts", "");

    expect(findOxlintConfigDir(file)).toBe(rigDir);
  });
});

describe("resolveImportSource", () => {
  it("resolves a TS path alias through tsconfig paths", () => {
    writeFile(
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: { "@/*": ["src/*"] },
        },
      }),
    );
    const target = writeFile("src/hooks/useToast.ts", "export const useToast = () => {};");
    const file = writeFile("src/Component.tsx", "");

    const resolved = resolveImportSource(file, "@/hooks/useToast");

    expect(resolved).toBe(target);
  });

  it("resolves a relative import to the same absolute path as the alias", () => {
    writeFile(
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: { "@/*": ["src/*"] },
        },
      }),
    );
    const target = writeFile("src/hooks/useToast.ts", "export const useToast = () => {};");
    const file = writeFile("src/feature/Component.tsx", "");

    const aliasResolved = resolveImportSource(file, "@/hooks/useToast");
    const relativeResolved = resolveImportSource(file, "../hooks/useToast");

    expect(aliasResolved).toBe(target);
    expect(relativeResolved).toBe(target);
    expect(aliasResolved).toBe(relativeResolved);
  });

  it("returns null when the import cannot be resolved", () => {
    const file = writeFile("src/Component.tsx", "");

    expect(resolveImportSource(file, "@/missing/path")).toBeNull();
  });
});

describe("findTsconfig", () => {
  it("walks upward to the nearest tsconfig.json", () => {
    const tsconfig = writeFile("tsconfig.json", "{}");
    const file = writeFile("packages/foo/src/index.ts", "");

    expect(findTsconfig(file)).toBe(tsconfig);
  });

  it("returns null when no tsconfig is reachable", () => {
    const file = writeFile("src/index.ts", "");
    // `os.tmpdir()` ancestors should not contain tsconfig.json — the lookup stops at filesystem
    // root.
    expect(findTsconfig(file)).toBeNull();
  });
});
