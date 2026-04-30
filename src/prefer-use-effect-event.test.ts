import { RuleTester } from "oxlint/plugins-dev";
import type { Options } from "./prefer-use-effect-event";
import preferUseEffectEvent from "./prefer-use-effect-event";
import { describe, expect, it } from "vitest";

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: "module",
    parserOptions: {
      ecmaFeatures: {
        jsx: true,
      },
    },
  },
});

const options = [
  {
    targets: [
      {
        source: {
          from: "package",
          package: "react-router",
          name: "useNavigate",
        },
        derivation: {
          kind: "call-return",
        },
      },
    ],
  },
] satisfies Options;

describe("prefer-use-effect-event-for-effect-deps", () => {
  it("works", () => {
    expect(() => {
      ruleTester.run("prefer-use-effect-event-for-effect-deps", preferUseEffectEvent, {
        valid: [],
        invalid: [
          {
            code: `import { useEffect } from "react";
      import { useNavigate } from "react-router";

      const Component = () => {
        const navigate = useNavigate();
        useEffect(() => {
          navigate("/path");
        }, [navigate]);
      };`,
            errors: [
              {
                messageId: "preferUseEffectEvent",
                data: {
                  handlerName: "navigate",
                },
              },
            ],
            output: `import { useEffect, useEffectEvent } from "react";
      import { useNavigate } from "react-router";

      const Component = () => {
        const navigate = useNavigate();
        const navigateEvent = useEffectEvent(navigate);
        useEffect(() => {
          navigateEvent("/path");
        }, []);
      };`,
            options,
          },
        ],
      });
    }).not.toThrow();
  });
});
