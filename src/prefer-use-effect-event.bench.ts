import { RuleTester } from "oxlint/plugins-dev";
import { bench, describe } from "vitest";
import preferUseEffectEvent from "./prefer-use-effect-event";

// Bypass the test framework wiring so RuleTester just runs the rule synchronously.
const passthrough = (_name: string, fn: () => void) => {
  fn();
};
RuleTester.describe = passthrough;
RuleTester.it = passthrough;
RuleTester.itOnly = passthrough;

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

const callReturnOptions = [
  {
    targets: [
      {
        source: { from: "package", package: "react-router", name: "useNavigate" },
        handler: { kind: "call-return" },
      },
    ],
  },
];

function runValid(code: string): void {
  ruleTester.run("prefer-use-effect-event", preferUseEffectEvent, {
    valid: [{ code, options: callReturnOptions }],
    invalid: [],
  });
}

// 1. File without `useEffect`. Hits the early text-search skip in `before()`.
const noUseEffect = `
import { useNavigate } from "react-router";
${Array.from(
  { length: 50 },
  (_, i) => `
export const Component${i} = () => {
  const navigate = useNavigate();
  const handle = () => navigate("/p");
  return handle;
};`,
).join("\n")}
`;

// 2. `useEffect` is used but no tracked imports — every CallExpression must run
//    `isUseEffectCall`, but no handlers ever match.
const useEffectNoTracked = `
import { useEffect, useState } from "react";
${Array.from(
  { length: 50 },
  (_, i) => `
export const Component${i} = () => {
  const [value, setValue] = useState(0);
  useEffect(() => {
    console.log(value);
  }, [value]);
  return value;
};`,
).join("\n")}
`;

// 3. Tracked handlers exist but the dependency array does NOT include them — the
//    rule walks the deps array but never reports.
const trackedNoFire = `
import { useEffect } from "react";
import { useNavigate } from "react-router";
${Array.from(
  { length: 30 },
  (_, i) => `
export const Component${i} = () => {
  const navigate${i} = useNavigate();
  useEffect(() => {
    if (true) navigate${i}("/x");
    else navigate${i}("/y");
  }, []);
  return null;
};`,
).join("\n")}
`;

// 4. Realistic component file with several hooks per component but NO firing
//    (deps only contain non-tracked values).
const realisticNoFire = `
import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router";
${Array.from(
  { length: 30 },
  (_, i) => `
export const Component${i} = () => {
  const [a, setA] = useState(0);
  const [b, setB] = useState("");
  const navigate = useNavigate();
  const memo = useMemo(() => a + 1, [a]);
  const cb = useCallback(() => { setA(a + 1); }, [a]);
  useEffect(() => {
    if (memo > 0) console.log(b);
    cb();
  }, [memo, cb, b]);
  return memo;
};`,
).join("\n")}
`;

describe("prefer-use-effect-event", () => {
  bench("no useEffect (early-out)", () => {
    runValid(noUseEffect);
  });

  bench("useEffect, no tracked imports", () => {
    runValid(useEffectNoTracked);
  });

  bench("tracked handlers, deps don't include them", () => {
    runValid(trackedNoFire);
  });

  bench("realistic component file (no fire)", () => {
    runValid(realisticNoFire);
  });
});
