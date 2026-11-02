import { readFileSync } from "node:fs";
import { join } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { markdownSample } from "./markdown-plugin.ts";

// The playground imports the library by its published subpaths. By default they resolve to src/
// so edits show up without a build. With PLAYGROUND_DIST=1 (the Playwright run) they resolve to
// the targets in package.json `exports`, so the browser suite checks the built package.
const root = join(import.meta.dirname, "..");
const fromDist = process.env.PLAYGROUND_DIST === "1";
type Target = string | { readonly default?: string };
const { exports } = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  exports: Record<string, Target>;
};

function targetOf(key: string): string {
  const sub = key.slice(2);
  if (!fromDist) return join(root, sub.endsWith(".css") ? `src/${sub}` : `src/${sub}/index.ts`);
  const target = exports[key];
  const file = typeof target === "string" ? target : target?.default;
  if (!file) throw new Error(`package.json exports["${key}"] has no default target`);
  return join(root, file);
}

const alias = Object.keys(exports)
  .filter((key) => key !== "./package.json")
  .map((key) => ({ find: `@steamfield/ui/${key.slice(2)}`, replacement: targetOf(key) }))
  .sort((a, b) => b.find.length - a.find.length);

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), markdownSample(targetOf("./markdown"))],
  resolve: { alias, extensions: [".ts", ".tsx", ".js"] },
  // The Vue binding runs on Vue's esm-bundler build, which reads these flags.
  define: {
    __VUE_OPTIONS_API__: "false",
    __VUE_PROD_DEVTOOLS__: "false",
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
  },
  server: { port: 5199, strictPort: true },
  // The browser suite previews on its own port, so it never collides with a running dev server.
  preview: { port: 5200, strictPort: true },
});
