#!/usr/bin/env bun
// `bun run lint:package`: publint over the packed package, then Are the Types Wrong over every
// JS subpath. Stylesheet subpaths are excluded from attw because they have no types to resolve;
// publint still checks that their files exist.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const { exports } = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  exports: Record<string, unknown>;
};
const stylesheets = Object.keys(exports).filter((key) => key.endsWith(".css"));

function run(command: string, args: string[]): void {
  console.log(`$ ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const bin = (name: string): string => join(root, "node_modules/.bin", name);
run(bin("publint"), ["--strict"]);
run(bin("attw"), [
  "--pack",
  ".",
  "--profile",
  "esm-only",
  ...(stylesheets.length ? ["--exclude-entrypoints", ...stylesheets] : []),
]);
