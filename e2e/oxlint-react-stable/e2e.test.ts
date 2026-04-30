import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, "fixtures");
const expectedDir = path.join(here, "expected");
const targetDir = path.join(here, ".target");
const configPath = path.join(here, ".oxlintrc.e2e.json");

describe("e2e: react-stable", () => {
  beforeAll(() => {
    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.cpSync(fixturesDir, targetDir, { recursive: true });
  });

  const tc: Array<{ file: string; case: string }> = [
    {
      file: "basic.tsx",
      case: "works with useEffectEvent",
    },
  ];

  it.each(tc)("works with experimental_useEffectEvent", async ({ file }) => {
    const target = path.join(targetDir, file);

    execFileSync("pnpm", ["exec", "oxlint", "--fix", "--config", configPath, target], {
      cwd: here,
      stdio: "pipe",
    });

    const actual = fs.readFileSync(target, "utf8");
    await expect(actual).toMatchFileSnapshot(path.join(expectedDir, file));
  });
});
