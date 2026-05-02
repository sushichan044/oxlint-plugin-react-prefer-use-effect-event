import { createFixture } from "fs-fixture";
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearResolverCachesForTesting,
  findOxlintConfigDir,
  findTsconfig,
  resolveImportSource,
} from "./resolver";

const TSCONFIG_WITH_PATHS = JSON.stringify({
  compilerOptions: {
    paths: { "@/*": ["src/*"] },
  },
});

describe("findOxlintConfigDir", () => {
  beforeEach(() => {
    clearResolverCachesForTesting();
  });

  it("returns the directory of the nearest .oxlintrc.json above the file", async () => {
    await using fx = await createFixture({
      ".oxlintrc.json": "{}",
      "packages/foo/src/index.ts": "",
    });

    expect(findOxlintConfigDir(fx.getPath("packages/foo/src/index.ts"))).toBe(fx.path);
  });

  it("prefers the closer config when nested configs exist", async () => {
    await using fx = await createFixture({
      ".oxlintrc.json": "{}",
      "packages/foo": {
        ".oxlintrc.json": "{}",
        "src/index.ts": "",
      },
    });

    expect(findOxlintConfigDir(fx.getPath("packages/foo/src/index.ts"))).toBe(
      fx.getPath("packages/foo"),
    );
  });

  it("recognises oxlint.config.* alongside .oxlintrc.json", async () => {
    await using fx = await createFixture({
      "oxlint.config.ts": "export default {};",
      "src/index.ts": "",
    });

    expect(findOxlintConfigDir(fx.getPath("src/index.ts"))).toBe(fx.path);
  });
});

describe("resolveImportSource", () => {
  it("resolves a TS path alias through tsconfig paths", async () => {
    await using fx = await createFixture({
      "tsconfig.json": TSCONFIG_WITH_PATHS,
      src: {
        "hooks/useToast.ts": "export const useToast = () => {};",
        "Component.tsx": "",
      },
    });

    expect(resolveImportSource(fx.getPath("src/Component.tsx"), "@/hooks/useToast")).toBe(
      fx.getPath("src/hooks/useToast.ts"),
    );
  });

  it("resolves a relative import to the same absolute path as the alias", async () => {
    await using fx = await createFixture({
      "tsconfig.json": TSCONFIG_WITH_PATHS,
      src: {
        "hooks/useToast.ts": "export const useToast = () => {};",
        "feature/Component.tsx": "",
      },
    });

    const file = fx.getPath("src/feature/Component.tsx");
    const target = fx.getPath("src/hooks/useToast.ts");

    expect(resolveImportSource(file, "@/hooks/useToast")).toBe(target);
    expect(resolveImportSource(file, "../hooks/useToast")).toBe(target);
  });

  it("returns null when the import cannot be resolved", async () => {
    await using fx = await createFixture({
      "src/Component.tsx": "",
    });

    expect(resolveImportSource(fx.getPath("src/Component.tsx"), "@/missing/path")).toBeNull();
  });
});

describe("findTsconfig", () => {
  it("walks upward to the nearest tsconfig.json", async () => {
    await using fx = await createFixture({
      "tsconfig.json": "{}",
      "packages/foo/src/index.ts": "",
    });

    expect(findTsconfig(fx.getPath("packages/foo/src/index.ts"))).toBe(fx.getPath("tsconfig.json"));
  });

  it("returns null when no tsconfig is reachable", async () => {
    await using fx = await createFixture({
      "src/index.ts": "",
    });
    // Tmpdir lives outside `os.homedir()` on macOS, so the walk falls back to `/`. Neither path
    // contains a tsconfig.json.
    expect(findTsconfig(fx.getPath("src/index.ts"))).toBeNull();
  });
});
