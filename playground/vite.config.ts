import { readFileSync } from "node:fs";
import { join } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The playground imports the library by its published subpaths, resolved to src/ so edits show
// up without a build. Every `exports` key maps to its source entry or stylesheet.
const root = join(import.meta.dirname, "..");
const { exports } = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  exports: Record<string, unknown>;
};
const alias = Object.keys(exports)
  .filter((key) => key !== "./package.json")
  .map((key) => {
    const sub = key.slice(2);
    const target = sub.endsWith(".css") ? `src/${sub}` : `src/${sub}/index`;
    return { find: `@steamfield/ui/${sub}`, replacement: join(root, target) };
  })
  .sort((a, b) => b.find.length - a.find.length);

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  resolve: { alias, extensions: [".ts", ".tsx", ".js"] },
  server: { port: 5199, strictPort: true },
  preview: { port: 5199, strictPort: true },
});
