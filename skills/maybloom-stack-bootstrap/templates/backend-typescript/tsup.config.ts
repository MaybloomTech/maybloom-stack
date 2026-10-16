import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  target: "node24",
  outDir: "dist",
  sourcemap: true,
  minify: true,
  splitting: false,
  keepNames: true,
  treeshake: true,
  clean: true,
});
