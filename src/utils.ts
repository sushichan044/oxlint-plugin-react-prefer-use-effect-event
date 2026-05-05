import { parseSync } from "oxc-parser";

export function parseAsOxlint(filename: string, code: string) {
  const result = parseSync(filename, code, {
    astType: "ts",
    range: true,
  });

  return result.program;
}
