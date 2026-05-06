import type { ESTree, Scope } from "@oxlint/plugins";
import { describe, expect, it } from "vitest";
import { isBindingNameAvailable } from "./scope-utils";

function makeScope(params: {
  names?: string[];
  upper?: Scope | null;
  children?: Scope[];
  blockRange?: [number, number];
}): Scope {
  return {
    set: new Map(params.names?.map((n) => [n, {}]) ?? []),
    upper: params.upper ?? null,
    childScopes: params.children ?? [],
    block: { range: params.blockRange ?? [0, 100] } as ESTree.Node,
  } as unknown as Scope;
}

function makeCallbackNode(range: [number, number]): ESTree.Node {
  return { range } as ESTree.Node;
}

describe("isBindingNameAvailable", () => {
  it("returns true when the name is not present in any scope", () => {
    const parent = makeScope({ names: ["otherVar"] });
    const scope = makeScope({ upper: parent });
    expect(isBindingNameAvailable("newName", scope)).toBe(true);
  });

  it("returns false when the name is declared in insertScope itself", () => {
    const scope = makeScope({ names: ["newName"] });
    expect(isBindingNameAvailable("newName", scope)).toBe(false);
  });

  it("returns false when the name is declared in an ancestor scope", () => {
    const grandparent = makeScope({ names: ["newName"] });
    const parent = makeScope({ upper: grandparent });
    const scope = makeScope({ upper: parent });
    expect(isBindingNameAvailable("newName", scope)).toBe(false);
  });

  describe("without callbackNode (conservative mode — all descendants checked)", () => {
    it("returns false when the name is in a direct child scope", () => {
      const child = makeScope({ names: ["newName"] });
      const scope = makeScope({ children: [child] });
      expect(isBindingNameAvailable("newName", scope)).toBe(false);
    });

    it("returns false when the name is in a deeply nested scope", () => {
      const grandchild = makeScope({ names: ["newName"] });
      const child = makeScope({ children: [grandchild] });
      const scope = makeScope({ children: [child] });
      expect(isBindingNameAvailable("newName", scope)).toBe(false);
    });
  });

  describe("with callbackNode — descendant check narrows to callback range", () => {
    it("returns false when the name is in a descendant scope inside the callback range", () => {
      // cleanup function at [50, 80] is inside the callback [30, 90]
      const callback = makeCallbackNode([30, 90]);
      const cleanup = makeScope({ names: ["newName"], blockRange: [50, 80] });
      const scope = makeScope({ children: [cleanup] });
      expect(isBindingNameAvailable("newName", scope, callback)).toBe(false);
    });

    it("returns true when the name is only in a descendant scope OUTSIDE the callback range", () => {
      // handleOther at [0, 25] is outside the callback [30, 90]
      // This was a false positive with the old conservative check
      const callback = makeCallbackNode([30, 90]);
      const handleOther = makeScope({ names: ["newName"], blockRange: [0, 25] });
      const scope = makeScope({ children: [handleOther] });
      expect(isBindingNameAvailable("newName", scope, callback)).toBe(true);
    });

    it("returns true when the name appears in both inside and outside scopes only outside", () => {
      // One unrelated function before callback, one clean scope inside callback
      const callback = makeCallbackNode([30, 90]);
      const outsideScope = makeScope({ names: ["newName"], blockRange: [0, 25] });
      const insideScope = makeScope({ blockRange: [40, 80] }); // no "newName"
      const scope = makeScope({ children: [outsideScope, insideScope] });
      expect(isBindingNameAvailable("newName", scope, callback)).toBe(true);
    });

    it("skips descendants of out-of-range scopes even if deeply nested", () => {
      // deeply nested child inside an out-of-range parent should also be skipped
      const callback = makeCallbackNode([30, 90]);
      const deepChild = makeScope({ names: ["newName"], blockRange: [5, 20] });
      const outsideParent = makeScope({ children: [deepChild], blockRange: [0, 25] });
      const scope = makeScope({ children: [outsideParent] });
      expect(isBindingNameAvailable("newName", scope, callback)).toBe(true);
    });

    it("still checks ancestor scopes regardless of callbackNode", () => {
      const callback = makeCallbackNode([30, 90]);
      const parent = makeScope({ names: ["newName"] });
      const scope = makeScope({ upper: parent });
      expect(isBindingNameAvailable("newName", scope, callback)).toBe(false);
    });
  });
});
