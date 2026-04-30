import { defineConfig, defaultExclude } from "vitest/config";

export default defineConfig({
  test: {
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
          benchmark: {
            include: ["**/*.{bench,benchmark}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
          },
        },
        extends: true,
      },
      {
        test: {
          name: "e2e",
          include: ["e2e/**/*.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
          benchmark: {
            include: ["e2e/**/*.bench.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
          },
        },
        extends: true,
      },
    ],
  },
});
