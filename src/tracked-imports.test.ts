import * as path from "node:path";

import type { ESTree } from "@oxlint/plugins";
import { assert, describe, expect, it } from "vitest";
import type { MatchContext } from "./tracked-imports";
import type { TargetSpec } from "./types";
import { matchModuleTarget } from "./tracked-imports";
import { parseAsOxlint } from "./utils";

function firstImport(code: string): ESTree.ImportDeclaration {
  const program = parseAsOxlint("test.tsx", code);
  const stmt = program.body[0];
  assert(stmt && stmt.type === "ImportDeclaration");
  return stmt as unknown as ESTree.ImportDeclaration;
}

function firstSpecifier(decl: ESTree.ImportDeclaration): ESTree.ImportSpecifier {
  const spec = decl.specifiers[0];
  assert(spec && spec.type === "ImportSpecifier");
  return spec;
}

const useNavigateTarget: TargetSpec = {
  source: { from: "package", package: "react-router", name: "useNavigate" },
  derivation: { kind: "call-return" },
};

/** Match context with no resolver — used for tests that only exercise package-source targets. */
const noFileCtx: MatchContext = {
  configDir: null,
  getResolvedImport: () => null,
};

/** Build a match context that pretends `importSource` always resolves to `resolvedPath`. */
function staticCtx(configDir: string, resolvedPath: string | null): MatchContext {
  return {
    configDir,
    getResolvedImport: () => resolvedPath,
  };
}

describe("matchModuleTarget", () => {
  it("returns the matching target for a plain import", () => {
    const decl = firstImport(`import { useNavigate } from "react-router";`);
    const result = matchModuleTarget(
      firstSpecifier(decl),
      decl.source.value,
      [useNavigateTarget],
      noFileCtx,
    );

    expect(result).toBe(useNavigateTarget);
  });

  it("matches by the imported (original) name even when the local binding is renamed", () => {
    const decl = firstImport(`import { useNavigate as useNav } from "react-router";`);
    const result = matchModuleTarget(
      firstSpecifier(decl),
      decl.source.value,
      [useNavigateTarget],
      noFileCtx,
    );

    expect(result).toBe(useNavigateTarget);
  });

  it("returns null when the package does not match", () => {
    const decl = firstImport(`import { useNavigate } from "other-pkg";`);
    const result = matchModuleTarget(
      firstSpecifier(decl),
      decl.source.value,
      [useNavigateTarget],
      noFileCtx,
    );

    expect(result).toBeNull();
  });

  it("returns null when the imported name does not match", () => {
    const decl = firstImport(`import { useOther } from "react-router";`);
    const result = matchModuleTarget(
      firstSpecifier(decl),
      decl.source.value,
      [useNavigateTarget],
      noFileCtx,
    );

    expect(result).toBeNull();
  });

  it("returns the first matching target when several apply", () => {
    const directTarget: TargetSpec = {
      source: { from: "package", package: "react-router", name: "useNavigate" },
      derivation: { kind: "direct" },
    };
    const decl = firstImport(`import { useNavigate } from "react-router";`);
    const result = matchModuleTarget(
      firstSpecifier(decl),
      decl.source.value,
      [directTarget, useNavigateTarget],
      noFileCtx,
    );

    expect(result).toBe(directTarget);
  });

  it("matches a file-source target when the resolved path equals the configured path", () => {
    const configDir = "/proj";
    const fileTarget: TargetSpec = {
      source: { from: "file", path: "src/hooks/useToast.ts", name: "useToast" },
      derivation: { kind: "call-return" },
    };
    const decl = firstImport(`import { useToast } from "@/hooks/useToast";`);
    const ctx = staticCtx(configDir, path.join(configDir, "src/hooks/useToast.ts"));

    expect(matchModuleTarget(firstSpecifier(decl), decl.source.value, [fileTarget], ctx)).toBe(
      fileTarget,
    );
  });

  it("returns null for a file-source target when the resolved path differs", () => {
    const configDir = "/proj";
    const fileTarget: TargetSpec = {
      source: { from: "file", path: "src/hooks/useToast.ts", name: "useToast" },
      derivation: { kind: "call-return" },
    };
    const decl = firstImport(`import { useToast } from "@/hooks/somewhere-else";`);
    const ctx = staticCtx(configDir, path.join(configDir, "src/hooks/somewhere-else.ts"));

    expect(
      matchModuleTarget(firstSpecifier(decl), decl.source.value, [fileTarget], ctx),
    ).toBeNull();
  });

  it("returns null for a file-source target when the import cannot be resolved", () => {
    const fileTarget: TargetSpec = {
      source: { from: "file", path: "src/hooks/useToast.ts", name: "useToast" },
      derivation: { kind: "call-return" },
    };
    const decl = firstImport(`import { useToast } from "@/hooks/useToast";`);
    const ctx = staticCtx("/proj", null);

    expect(
      matchModuleTarget(firstSpecifier(decl), decl.source.value, [fileTarget], ctx),
    ).toBeNull();
  });

  it("returns null for a file-source target when no oxlint config dir was found", () => {
    const fileTarget: TargetSpec = {
      source: { from: "file", path: "src/hooks/useToast.ts", name: "useToast" },
      derivation: { kind: "call-return" },
    };
    const decl = firstImport(`import { useToast } from "@/hooks/useToast";`);
    const ctx: MatchContext = {
      configDir: null,
      getResolvedImport: () => "/proj/src/hooks/useToast.ts",
    };

    expect(
      matchModuleTarget(firstSpecifier(decl), decl.source.value, [fileTarget], ctx),
    ).toBeNull();
  });
});
