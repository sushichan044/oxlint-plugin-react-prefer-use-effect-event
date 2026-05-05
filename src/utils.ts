import { parseSync } from "oxc-parser";

import pkg from "../package.json" with { type: "json" };

export function parseAsOxlint(filename: string, code: string) {
  const result = parseSync(filename, code, {
    astType: "ts",
    range: true,
  });

  return result.program;
}

export function getRuleDocsURL(ruleName: string): string {
  const repoURL = pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");

  return `${repoURL}/blob/main/docs/rules/${ruleName}.md`;
}
