import type { Range } from "@oxlint/plugins";
import { parseSync } from "oxc-parser";

export function spanRange(node: { range: Range }): Range {
  return node.range;
}

export function pasrseAsOxlint(filename: string, code: string) {
  const result = parseSync(filename, code, {
    astType: "ts",
    range: true,
  });

  return result.program;
}
