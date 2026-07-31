import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/**/*.ts"],
  format: ["esm", "cjs"],
  dts: false,
  outDir: "dist",
  sourcemap: true,
  minify: true,
  splitting: false,
  keepNames: true,
  treeshake: true,
  clean: true,
  esbuildOptions(options) {
    options.outbase = "src";
  },
});
