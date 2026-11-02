#!/usr/bin/env bun
// `bun run test:tree-shake`: builds each app in fixtures/tree-shake/ with Vite against the built
// dist/ (resolved through the package's own `exports`, as a consumer would), then greps the
// output. Each case lists sentinel strings that must appear (proving the imported module made it
// in, so the check can't pass vacuously) and ones that must not (proving siblings stayed out).
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import react from "@vitejs/plugin-react";
import { build } from "vite";

const root = join(import.meta.dirname, "..");
const fixtures = join(root, "fixtures/tree-shake");
const { exports } = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  exports: Record<string, string | { import: string }>;
};

// The subpath -> dist file map a bundler would resolve from `exports`.
const alias = Object.entries(exports)
  .filter(([key, value]) => key !== "./package.json" && typeof value === "object")
  .map(([key, value]) => ({
    find: `@steamfield/ui/${key.slice(2)}`,
    replacement: join(root, (value as { import: string }).import),
  }))
  .sort((a, b) => b.find.length - a.find.length);

interface Case {
  readonly entry: string;
  readonly present: readonly string[];
  readonly absent: readonly string[];
}

// Sentinels are attribute names or values each module renders, which minifiers keep verbatim.
const cases: readonly Case[] = JSON.parse(
  readFileSync(join(fixtures, "cases.json"), "utf8"),
) as Case[];

let failed = false;
for (const { entry, present, absent } of cases) {
  const outDir = join(fixtures, "out", entry.replace(/\.\w+$/, ""));
  rmSync(outDir, { recursive: true, force: true });
  await build({
    root: fixtures,
    logLevel: "warn",
    configFile: false,
    plugins: [react()],
    resolve: { alias },
    build: {
      outDir,
      emptyOutDir: true,
      minify: true,
      rollupOptions: { input: join(fixtures, entry) },
    },
  });
  const files = (readdirSync(outDir, { recursive: true }) as string[]).filter((file) =>
    file.endsWith(".js"),
  );
  const output = files.map((file) => readFileSync(join(outDir, file), "utf8")).join("\n");
  for (const sentinel of present) {
    if (!output.includes(sentinel)) {
      console.error(`${entry}: expected "${sentinel}" in the bundle, but it is missing`);
      failed = true;
    }
  }
  for (const sentinel of absent) {
    if (output.includes(sentinel)) {
      console.error(`${entry}: "${sentinel}" leaked into the bundle`);
      failed = true;
    }
  }
  console.log(`${entry}: ${(output.length / 1024).toFixed(1)} kB, sentinels checked`);
}
if (failed) process.exit(1);
