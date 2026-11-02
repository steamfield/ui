// Reads the source tree the way the build and the export map see it, for the package-shape tests.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export const ROOT: string = join(import.meta.dirname, "..");
const SRC = join(ROOT, "src");

/** Every file under src/, as a path relative to src/ with forward slashes. */
export function sourceFiles(): string[] {
  return (readdirSync(SRC, { recursive: true }) as string[])
    .map((file) => file.split("\\").join("/"))
    .filter((file) => /\.(tsx?|css)$/.test(file));
}

/** Entry modules: each `index.ts(x)` under src/, relative to src/. */
export function entries(): string[] {
  return sourceFiles().filter((file) => /(^|\/)index\.tsx?$/.test(file));
}

/** The subpath (without "./") a source module belongs to: its nearest entry's directory. */
export function subpathOf(file: string): string {
  const parts = file.split("/");
  parts.pop();
  return parts.join("/");
}

/** Relative imports in a source file, resolved to paths relative to src/. */
export function relativeImports(file: string): string[] {
  const text = readFileSync(join(SRC, file), "utf8");
  const found: string[] = [];
  for (const match of text.matchAll(/(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g)) {
    const spec = match[1] as string;
    const resolved = relative(SRC, join(SRC, subpathOf(file), spec))
      .split("\\")
      .join("/");
    found.push(resolved);
  }
  return found;
}

/** Bare (package) imports that survive compilation: `import type` / `export type` are skipped. */
export function packageImports(file: string): string[] {
  const text = readFileSync(join(SRC, file), "utf8");
  const found: string[] = [];
  for (const match of text.matchAll(
    /(?:^|\n)\s*(import|export)(\s+type\b)?[^;]*?\bfrom\s*["']([^./"'][^"']*)["']/g,
  )) {
    if (!match[2]) found.push(match[3] as string);
  }
  for (const match of text.matchAll(/\bimport\(\s*["']([^./"'][^"']*)["']\s*\)/g)) {
    found.push(match[1] as string);
  }
  return found;
}

interface PackageJson {
  exports: Record<string, string | { types: string; import: string }>;
  sideEffects: string[];
}

export function packageJson(): PackageJson {
  return JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as PackageJson;
}
