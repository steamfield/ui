// Probes biome-plugins/boundaries.grit on real files: each rule must fire where it should and stay
// quiet where the thing is allowed.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, expect, test } from "vitest";

const ROOT = join(import.meta.dirname, "..");
const fixtures: string[] = [];
afterEach(() => {
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** The plugin's messages for `source` written at `path` (relative to a src/-shaped fixture). */
function pluginMessages(path: string, source: string): string[] {
  const dir = mkdtempSync(join(ROOT, ".boundary-fixture-"));
  fixtures.push(dir);
  const file = join(dir, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, source);
  const biome = join(ROOT, "node_modules/.bin/biome");
  // .gitignore lists the fixture directories, and Biome skips ignored files unless told not to.
  const args = ["lint", "--vcs-use-ignore-file=false", "--reporter=json", file];
  const result = spawnSync(biome, args, { encoding: "utf8" });
  if (!result.stdout) throw new Error(result.stderr);
  const report = JSON.parse(result.stdout) as {
    diagnostics?: { category?: string; message?: string }[];
  };
  return (report.diagnostics ?? [])
    .filter((diagnostic) => diagnostic.category === "plugin")
    .map((diagnostic) => diagnostic.message ?? "");
}

test.each([
  ["src/x.ts", 'import { readFileSync } from "node:fs";', "platform neutral"],
  ["src/x.ts", 'export const load = () => import("bun");', "platform neutral"],
  ["src/index.ts", 'export { words } from "./internal/words.ts";', "src/internal/ is private"],
  ["src/copy/index.ts", 'export { ids } from "../internal/ids.ts";', "src/internal/ is private"],
  ["src/react/x/index.tsx", 'export { ids } from "../../internal/ids.ts";', "src/internal/"],
  ["src/x.tsx", 'console.warn("deprecated");', "never writes to the console"],
  ["src/x.ts", "export const debug = process.env.DEBUG;", "never reads the process"],
  ["src/x.ts", 'console.warn("deprecated");', "never writes to the console"],
  ["src/x.ts", 'throw new TypeError("bad input");', "LibraryError"],
  ["src/x.ts", 'throw Error("bad input");', "LibraryError"],
  ["src/x.ts", "throw new Error();", "LibraryError"],
  ["src/x.ts", 'export const fail = () => Promise.reject(new Error("x"));', "src/script/errors.ts"],
  ["src/x.ts", 'throw new DOMException("gone", "AbortError");', "LibraryError"],
  ["src/x.ts", 'throw new globalThis.Error("x");', "LibraryError"],
  ["src/x.ts", 'export const fail = () => new window.TypeError("x");', "LibraryError"],
  ["src/x.ts", 'throw self.RangeError("x");', "LibraryError"],
  ["src/x.ts", 'globalThis.console.log("x");', "never writes to the console"],
  ["src/x.ts", "export const log = console;", "never writes to the console"],
  ["src/x.ts", "export const load = () => import(`node:fs`);", "platform neutral"],
  ["src/x.ts", "export default function slugify() {}", "Export by name"],
  ["src/x.ts", "const api = {};\nexport default api;", "Export by name"],
  ["src/index.ts", 'export * from "./slugify.ts";', "Export by name"],
])("%s: %s is rejected", (path, source, pointer) => {
  const messages = pluginMessages(path, source);
  expect(messages).toHaveLength(1);
  expect(messages[0]).toContain(pointer);
});

test.each([
  ["src/index.ts", 'export { slugify } from "./slugify.ts";'],
  ["src/slugify.ts", 'import { words } from "./internal/words.ts";'],
  ["src/x.ts", 'throw new LibraryError("invalid_input");'],
  ["src/x.ts", "export function rethrow(error: unknown) {\n  throw error;\n}"],
  ["src/x.ts", "export const load = () => import(`./lazy.ts`);"],
  ["src/x.ts", "export const ok = (x: { console: number }) => x.console;"],
  ["src/x.test.ts", 'console.log("debugging a test");'],
  ["src/x.test.tsx", 'console.log("debugging a test");'],
  ["src/copy/enhance.ts", 'import { ids } from "../internal/ids.ts";'],
  ["scripts/x.ts", 'import { join } from "node:path";\nconsole.log(process.cwd(), join("a"));'],
  ["tests/x.test.ts", 'throw new Error("fixture");'],
])("%s: %s is allowed", (path, source) => {
  expect(pluginMessages(path, source)).toEqual([]);
});
