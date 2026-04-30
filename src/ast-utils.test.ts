import type { ESTree } from "@oxlint/plugins";
import { assert, describe, expect, it } from "vitest";
import { collectCallsToName } from "./ast-utils";
import { pasrseAsOxlint } from "./utils";

function setup(body: string): ESTree.FunctionBody {
  const code = `function foo() { ${body} }`;
  const program = pasrseAsOxlint("test.tsx", code);

  const fn = program.body[0];
  assert(fn);
  assert(fn.type === "FunctionDeclaration");
  assert(fn.body);

  // @ts-expect-error type mismatch but it works
  return fn.body;
}

describe("collectCallsToName", () => {
  it("returns empty array for empty function body", () => {
    const body = setup("");

    expect(collectCallsToName(body, "foo")).toEqual([]);
  });

  it("collects a call expression whose callee matches the given name", () => {
    const body = setup("foo();");
    const result = collectCallsToName(body, "foo");

    expect(result).toHaveLength(1);

    assert(result[0]);
    assert(result[0].callee.type === "Identifier");
    expect(result[0].callee.name).toBe("foo");
  });

  it("collects multiple call expressions whose callee matches the given name", () => {
    const body = setup("foo(); bar(); foo();");
    const result = collectCallsToName(body, "foo");

    expect(result).toHaveLength(2);

    for (const call of result) {
      assert(call.callee.type === "Identifier");
      expect(call.callee.name).toBe("foo");
    }
  });

  it("skips non-ExpressionStatement nodes", () => {
    const body = setup("return;");

    expect(collectCallsToName(body, "foo")).toEqual([]);
  });

  it("skips ExpressionStatement whose expression is not a call expression", () => {
    const body = setup("const foo = 42; foo;");

    expect(collectCallsToName(body, "foo")).toEqual([]);
  });

  it("skips call expressions whose callee is not an identifier", () => {
    const body = setup("const bar = { foo: () => {} }; bar.foo();");

    expect(collectCallsToName(body, "foo")).toEqual([]);
  });
});
