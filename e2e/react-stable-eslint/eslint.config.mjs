//@ts-check

import { defineConfig } from "eslint/config";
import plugin from "oxlint-plugin-react-prefer-use-effect-event";
import tseslint from "typescript-eslint";
export default defineConfig({
  files: ["**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}"],
  languageOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    parser: tseslint.parser,
    parserOptions: {
      ecmaFeatures: { jsx: true },
    },
  },
  plugins: {
    "oxlint-plugin-react-prefer-use-effect-event": plugin,
  },
  rules: {
    "oxlint-plugin-react-prefer-use-effect-event/prefer-use-effect-event": [
      "error",
      {
        targets: [
          {
            source: { from: "package", package: "react-router", name: "useNavigate" },
            derivation: { kind: "call-return" },
          },
        ],
      },
    ],
  },
});
