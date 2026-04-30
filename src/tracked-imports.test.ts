import type { ESTree } from "@oxlint/plugins";
import { assert, describe, expect, it } from "vitest";
import type { TargetSpec } from "./types";
import { matchPackageTarget } from "./tracked-imports";
import { pasrseAsOxlint } from "./utils";

function firstImport(code: string): ESTree.ImportDeclaration {
  const program = pasrseAsOxlint("test.tsx", code);
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

describe("matchPackageTarget", () => {
  it("returns the matching target for a plain import", () => {
    const decl = firstImport(`import { useNavigate } from "react-router";`);
    const result = matchPackageTarget(firstSpecifier(decl), decl.source.value, [useNavigateTarget]);

    expect(result).toBe(useNavigateTarget);
  });

  it("matches by the imported (original) name even when the local binding is renamed", () => {
    const decl = firstImport(`import { useNavigate as useNav } from "react-router";`);
    const result = matchPackageTarget(firstSpecifier(decl), decl.source.value, [useNavigateTarget]);

    expect(result).toBe(useNavigateTarget);
  });

  it("returns null when the package does not match", () => {
    const decl = firstImport(`import { useNavigate } from "other-pkg";`);
    const result = matchPackageTarget(firstSpecifier(decl), decl.source.value, [useNavigateTarget]);

    expect(result).toBeNull();
  });

  it("returns null when the imported name does not match", () => {
    const decl = firstImport(`import { useOther } from "react-router";`);
    const result = matchPackageTarget(firstSpecifier(decl), decl.source.value, [useNavigateTarget]);

    expect(result).toBeNull();
  });

  it("ignores file-source targets", () => {
    const fileTarget: TargetSpec = {
      source: { from: "file", path: "src/hooks/useToast.ts", name: "useNavigate" },
      derivation: { kind: "call-return" },
    };
    const decl = firstImport(`import { useNavigate } from "react-router";`);
    const result = matchPackageTarget(firstSpecifier(decl), decl.source.value, [fileTarget]);

    expect(result).toBeNull();
  });

  it("returns the first matching target when several apply", () => {
    const directTarget: TargetSpec = {
      source: { from: "package", package: "react-router", name: "useNavigate" },
      derivation: { kind: "direct" },
    };
    const decl = firstImport(`import { useNavigate } from "react-router";`);
    const result = matchPackageTarget(firstSpecifier(decl), decl.source.value, [
      directTarget,
      useNavigateTarget,
    ]);

    expect(result).toBe(directTarget);
  });
});
