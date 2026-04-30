import { defineConfig, defaultExclude } from "vitest/config";

export default defineConfig({
  test: {
    benchmark: {
      include: ["**/*.{bench,benchmark}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    },
    passWithNoTests: true,
    typecheck: {
      enabled: true,
    },
    projects: [
      {
        test: {
          name: "unit",
          include: ["**/*.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
          exclude: [...defaultExclude, "**/e2e/**"],
        },
      },
      {
        test: {
          name: "e2e-react-stable",
          include: ["e2e/react-stable/**/*.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
        },
      },
      {
        test: {
          name: "e2e-react-experimental",
          include: ["e2e/react-experimental/**/*.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
        },
      },
    ],
  },
});
