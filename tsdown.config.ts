import { defineConfig } from "tsdown";

export default defineConfig({
  attw: { level: "error", profile: "esm-only" },
  clean: true,
  dts: {
    tsgo: true,
  },
  entry: [],
  fixedExtension: true,
  format: "esm",
  fromVite: true,
  minify: "dce-only",
  nodeProtocol: true,
  outDir: "dist",
  publint: true,
  sourcemap: false,
  treeshake: true,
  unused: true,
  deps: {
    alwaysBundle: ["@typescript-eslint/utils"],
  },
});
