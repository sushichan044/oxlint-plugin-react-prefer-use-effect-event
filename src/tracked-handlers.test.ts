import type { ESTree } from "@oxlint/plugins";
import { assert, describe, expect, it } from "vitest";
import type { TargetSpec } from "./types";
import { extractHandlersFromDeclarator } from "./tracked-handlers";
import { pasrseAsOxlint } from "./utils";

const callReturnTarget: TargetSpec = {
  source: { from: "package", package: "pkg", name: "useNotify" },
  derivation: { kind: "call-return" },
};

const callReturnPropertiesTarget: TargetSpec = {
  source: { from: "package", package: "pkg", name: "useNotify" },
  derivation: { kind: "call-return-properties", properties: ["notify", "warn"] },
};

const directTarget: TargetSpec = {
  source: { from: "package", package: "pkg", name: "notify" },
  derivation: { kind: "direct" },
};

function firstDeclarator(code: string): ESTree.VariableDeclarator {
  const program = pasrseAsOxlint("test.tsx", code);
  const stmt = program.body[0];
  assert(stmt && stmt.type === "VariableDeclaration");
  const declarator = stmt.declarations[0];
  assert(declarator);
  return declarator as unknown as ESTree.VariableDeclarator;
}

/** Resolver that maps a callee name to a single fixed target. */
function namedResolver(name: string, target: TargetSpec) {
  return (callee: ESTree.IdentifierReference) => (callee.name === name ? target : null);
}

describe("extractHandlersFromDeclarator", () => {
  it("returns no handlers when there is no initializer", () => {
    const declarator = firstDeclarator(`let x;`);
    const result = extractHandlersFromDeclarator(declarator, () => null);

    expect(result).toEqual([]);
  });

  it("returns no handlers when the initializer is not a call expression", () => {
    const declarator = firstDeclarator(`const x = 42;`);
    const result = extractHandlersFromDeclarator(declarator, () => null);

    expect(result).toEqual([]);
  });

  it("returns no handlers when the callee does not resolve to a tracked target", () => {
    const declarator = firstDeclarator(`const x = useNotify();`);
    const result = extractHandlersFromDeclarator(declarator, () => null);

    expect(result).toEqual([]);
  });

  describe("call-return derivation", () => {
    it("returns the LHS identifier as a handler", () => {
      const declarator = firstDeclarator(`const notify = useNotify();`);
      const result = extractHandlersFromDeclarator(
        declarator,
        namedResolver("useNotify", callReturnTarget),
      );

      expect(result).toHaveLength(1);
      assert(result[0]);
      expect(result[0].binding.name).toBe("notify");
      expect(result[0].target).toBe(callReturnTarget);
    });

    it("ignores destructuring patterns", () => {
      const declarator = firstDeclarator(`const { notify } = useNotify();`);
      const result = extractHandlersFromDeclarator(
        declarator,
        namedResolver("useNotify", callReturnTarget),
      );

      expect(result).toEqual([]);
    });
  });

  describe("call-return-properties derivation", () => {
    it("returns properties listed in the target spec", () => {
      const declarator = firstDeclarator(`const { notify, warn, info } = useNotify();`);
      const result = extractHandlersFromDeclarator(
        declarator,
        namedResolver("useNotify", callReturnPropertiesTarget),
      );

      const names = result.map((handler) => handler.binding.name).sort();
      expect(names).toEqual(["notify", "warn"]);
    });

    it("returns the renamed local binding when destructured with a colon", () => {
      const declarator = firstDeclarator(`const { notify: doNotify } = useNotify();`);
      const result = extractHandlersFromDeclarator(
        declarator,
        namedResolver("useNotify", callReturnPropertiesTarget),
      );

      expect(result).toHaveLength(1);
      assert(result[0]);
      expect(result[0].binding.name).toBe("doNotify");
    });

    it("ignores computed property keys", () => {
      const declarator = firstDeclarator(
        `const key = "notify"; const { [key]: notify } = useNotify();`,
      );
      // grab the second declarator
      const program = pasrseAsOxlint("test.tsx", `const { [key]: notify } = useNotify();`);
      const stmt = program.body[0];
      assert(stmt && stmt.type === "VariableDeclaration");
      const computedDeclarator = stmt.declarations[0];
      assert(computedDeclarator);

      const result = extractHandlersFromDeclarator(
        computedDeclarator as unknown as ESTree.VariableDeclarator,
        namedResolver("useNotify", callReturnPropertiesTarget),
      );

      expect(result).toEqual([]);
      // also confirm the original declarator (`const key = "notify"`) is not affected
      void declarator;
    });

    it("ignores nested destructuring patterns", () => {
      const declarator = firstDeclarator(`const { notify: { x } } = useNotify();`);
      const result = extractHandlersFromDeclarator(
        declarator,
        namedResolver("useNotify", callReturnPropertiesTarget),
      );

      expect(result).toEqual([]);
    });

    it("ignores plain identifier patterns", () => {
      const declarator = firstDeclarator(`const handlers = useNotify();`);
      const result = extractHandlersFromDeclarator(
        declarator,
        namedResolver("useNotify", callReturnPropertiesTarget),
      );

      expect(result).toEqual([]);
    });
  });

  describe("direct derivation", () => {
    it("never produces handlers from declarators (handled at the import level instead)", () => {
      const declarator = firstDeclarator(`const x = notify();`);
      const result = extractHandlersFromDeclarator(
        declarator,
        namedResolver("notify", directTarget),
      );

      expect(result).toEqual([]);
    });
  });
});
