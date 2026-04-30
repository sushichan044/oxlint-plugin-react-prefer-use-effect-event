import type { Range } from "@oxlint/plugins";
import { parseSync } from "oxc-parser";

export function spanRange(node: { start: number; end: number }): Range {
  return [node.start, node.end];
}

export function pasrseAsOxlint(filename: string, code: string) {
  const result = parseSync(filename, code, {
    astType: "ts",
    range: true,
  });

  return result.program;
}
