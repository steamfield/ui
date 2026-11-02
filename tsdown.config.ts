import { defineConfig } from "tsdown";

// One ESM file out per file in (unbundle), so a consumer's bundler only pulls the modules a
// subpath import reaches. Every `src/**/index.ts(x)` is an entry and maps to one `exports` key.
// tsconfig.json turns on isolatedDeclarations, so declarations come from oxc and every export
// needs an explicit type. CSS is never imported by JS; it is copied next to the module it styles.
export default defineConfig({
  entry: ["src/**/index.ts", "src/**/index.tsx"],
  unbundle: true,
  root: "src",
  format: "esm",
  platform: "neutral",
  dts: true,
  clean: true,
  copy: [{ from: "src/**/*.css", to: "dist", flatten: false }],
});
