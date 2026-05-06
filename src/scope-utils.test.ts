import type { ESTree, Scope } from "@oxlint/plugins";
import { Linter } from "eslint";
import { describe, expect, it } from "vitest";
import { isBindingNameAvailable } from "./scope-utils";

/**
 * Parse `code` with ESLint's scope analysis, locate the `useEffect(...)` call, and return the scope
 * at that call site together with the callback argument node. This gives us real Scope objects (not
 * mocks) so the tests read like real usage.
 */
function extractUseEffectContext(code: string): {
  insertScope: Scope;
  callbackNode: ESTree.Node;
} {
  const linter = new Linter({ configType: "flat" });
  let insertScope: Scope | null = null;
  let callbackNode: ESTree.Node | null = null;

  linter.verify(code, [
    {
      plugins: {
        test: {
          rules: {
            capture: {
              create(ctx) {
                return {
                  CallExpression(node) {
                    if (node.callee.type === "Identifier" && node.callee.name === "useEffect") {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      insertScope = (ctx.sourceCode as any).getScope(node) as unknown as Scope;
                      callbackNode = node.arguments[0] as unknown as ESTree.Node;
                    }
                  },
                };
              },
            },
          },
        },
      },
      rules: { "test/capture": "error" },
      languageOptions: { parserOptions: { range: true } },
    },
  ]);

  if (!insertScope || !callbackNode) throw new Error("useEffect not found in code");
  return { insertScope, callbackNode };
}

describe("isBindingNameAvailable", () => {
  describe("ancestor / insertScope checks", () => {
    it("returns true when the name is not declared anywhere in scope", () => {
      const { insertScope, callbackNode } = extractUseEffectContext(`
        const Component = () => {
          const navigate = () => {};
          useEffect(() => { navigate(); }, [navigate]);
        };
      `);
      expect(isBindingNameAvailable("navigateEvent", insertScope, callbackNode)).toBe(true);
    });

    it("returns false when the name is already declared in insertScope (component body)", () => {
      const { insertScope, callbackNode } = extractUseEffectContext(`
        const Component = () => {
          const navigate = () => {};
          const navigateEvent = () => {};
          useEffect(() => { navigate(); }, [navigate]);
        };
      `);
      expect(isBindingNameAvailable("navigateEvent", insertScope, callbackNode)).toBe(false);
    });

    it("returns false when the name is declared in an outer scope (e.g. module-level import)", () => {
      const { insertScope, callbackNode } = extractUseEffectContext(`
        const navigateEvent = "module-level";
        const Component = () => {
          const navigate = () => {};
          useEffect(() => { navigate(); track(navigateEvent); }, [navigate]);
        };
      `);
      expect(isBindingNameAvailable("navigateEvent", insertScope, callbackNode)).toBe(false);
    });
  });

  describe("descendant scope checks (callback-range narrowing)", () => {
    it("returns false when a scope INSIDE the callback declares the name", () => {
      // The cleanup function is a descendant scope that lives inside the callback.
      // A rewritten call site inside it would resolve to the cleanup-local binding.
      const { insertScope, callbackNode } = extractUseEffectContext(`
        const Component = () => {
          const navigate = () => {};
          useEffect(() => {
            navigate("/path");
            return () => {
              const navigateEvent = cleanup();
              navigate("/cleanup");
            };
          }, [navigate]);
        };
      `);
      expect(isBindingNameAvailable("navigateEvent", insertScope, callbackNode)).toBe(false);
    });

    it("returns true when the name is only in a nested function OUTSIDE the callback", () => {
      // handleOther is a sibling of the callback in the component scope, not a child of it.
      // The fix would insert `const navigateEvent = ...` at component level; inside
      // handleOther its own local `navigateEvent` shadows it harmlessly — no rewritten
      // call site is affected.
      const { insertScope, callbackNode } = extractUseEffectContext(`
        const Component = () => {
          const navigate = () => {};
          const handleOther = () => {
            const navigateEvent = "unrelated";
          };
          useEffect(() => { navigate("/path"); }, [navigate]);
        };
      `);
      expect(isBindingNameAvailable("navigateEvent", insertScope, callbackNode)).toBe(true);
    });

    it("returns true when the colliding nested function is defined AFTER the useEffect call", () => {
      const { insertScope, callbackNode } = extractUseEffectContext(`
        const Component = () => {
          const navigate = () => {};
          useEffect(() => { navigate("/path"); }, [navigate]);
          const handleLater = () => {
            const navigateEvent = "unrelated";
          };
        };
      `);
      expect(isBindingNameAvailable("navigateEvent", insertScope, callbackNode)).toBe(true);
    });
  });

  describe("conservative mode (no callbackNode)", () => {
    it("returns false for a descendant scope even when it is outside the callback", () => {
      // Without callbackNode the check is conservative: any descendant scope collision
      // suppresses the fix, including unrelated nested functions.
      const { insertScope } = extractUseEffectContext(`
        const Component = () => {
          const navigate = () => {};
          const handleOther = () => {
            const navigateEvent = "unrelated";
          };
          useEffect(() => { navigate("/path"); }, [navigate]);
        };
      `);
      expect(isBindingNameAvailable("navigateEvent", insertScope)).toBe(false);
    });
  });
});
