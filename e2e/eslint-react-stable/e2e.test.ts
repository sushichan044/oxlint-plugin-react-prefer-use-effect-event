import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const here = import.meta.dirname;
const fixturesDir = path.join(here, "fixtures");
const expectedDir = path.join(here, "expected");
const targetDir = path.join(here, ".target");
const configPath = path.join(here, "eslint.config.mjs");

describe("e2e: react-stable-eslint-espree", () => {
  beforeAll(() => {
    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.cpSync(fixturesDir, targetDir, { recursive: true });
  });

  const tc: Array<{ file: string; case: string }> = [
    {
      file: "basic.jsx",
      case: "works with useEffectEvent",
    },
    {
      file: "missing-dep.jsx",
      case: "rewrites a handler called inside the effect but missing from deps",
    },
  ];

  it.each(tc)("$case", async ({ file }) => {
    const target = path.join(targetDir, file);

    execFileSync(
      "pnpm",
      ["exec", "eslint", "--fix", "--config", configPath, "--no-warn-ignored", target],
      {
        cwd: here,
        stdio: "pipe",
      },
    );

    const actual = fs.readFileSync(target, "utf8");
    await expect(actual).toMatchFileSnapshot(path.join(expectedDir, file));
  });
});
