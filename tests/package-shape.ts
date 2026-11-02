// Reads the source tree the way the build and the export map see it, for the package-shape tests.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { parseSync } from "vite";

export const ROOT: string = join(import.meta.dirname, "..");
const SRC = join(ROOT, "src");

/** Every file under src/, as a path relative to src/ with forward slashes. */
export function sourceFiles(): string[] {
  return filesUnder(SRC).filter((file) => /\.(tsx?|css)$/.test(file));
}

/** Every file under `dir`, relative to it, with forward slashes. */
export function filesUnder(dir: string): string[] {
  return (readdirSync(dir, { recursive: true }) as string[]).map((file) =>
    file.split("\\").join("/"),
  );
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

/** One module specifier a file depends on. */
export interface ModuleImport {
  /** The specifier, or the argument's source text when a dynamic import isn't a fixed string. */
  readonly spec: string;
}

/** A fixed string argument (quoted, or a template literal without `${}`) without its quotes. */
function literal(text: string): string | undefined {
  return /^(["'`])([^"'`$]*)\1$/.exec(text)?.[2];
}

/** `import("x")` type references, which the module record leaves out. */
function typeImports(node: unknown, found: ModuleImport[]): void {
  if (Array.isArray(node)) {
    for (const child of node) typeImports(child, found);
    return;
  }
  if (typeof node !== "object" || node === null) return;
  const record = node as Record<string, unknown>;
  if (record.type === "TSImportType") {
    const source = record.source as { value: unknown };
    found.push({ spec: String(source.value) });
  }
  for (const [key, child] of Object.entries(record)) {
    if (key !== "parent") typeImports(child, found);
  }
}

/**
 * Every module a file imports or re-exports from, parsed rather than pattern-matched: side-effect
 * imports, re-exports, dynamic imports (string or template literal) and type imports included.
 */
export function importsOf(filename: string, text: string): ModuleImport[] {
  const parsed = parseSync(filename, text);
  if (parsed.errors.length > 0) {
    throw new Error(`${filename}: ${parsed.errors.map((error) => error.message).join("; ")}`);
  }
  const { staticImports, staticExports, dynamicImports } = parsed.module;
  const found: ModuleImport[] = [];
  for (const { moduleRequest } of staticImports) found.push({ spec: moduleRequest.value });
  for (const statement of staticExports) {
    for (const entry of statement.entries) {
      if (entry.moduleRequest) found.push({ spec: entry.moduleRequest.value });
    }
  }
  for (const { moduleRequest } of dynamicImports) {
    const source = text.slice(moduleRequest.start, moduleRequest.end);
    found.push({ spec: literal(source) ?? source });
  }
  typeImports(parsed.program, found);
  return found;
}

/** The names a module exports as types only (`export type { A }`, `export { type B }`, ...). */
export function typeExports(filename: string, text: string): string[] {
  return parseSync(filename, text)
    .module.staticExports.flatMap((statement) => statement.entries)
    .filter((entry) => entry.isType)
    .map((entry) => String(entry.exportName.name));
}

/** Relative specifiers among `imports`, resolved against `file` (both relative to one root). */
export function resolveRelative(file: string, imports: readonly ModuleImport[]): string[] {
  return imports
    .filter(({ spec }) => /^\.{1,2}\//.test(spec))
    .map(({ spec }) =>
      relative(SRC, join(SRC, subpathOf(file), spec))
        .split("\\")
        .join("/"),
    );
}

/** Specifiers that aren't relative: packages, and dynamic imports that aren't a fixed string. */
export function bareImports(imports: readonly ModuleImport[]): ModuleImport[] {
  return imports.filter(({ spec }) => !/^\.{1,2}\//.test(spec));
}

const sourceImports = (file: string): ModuleImport[] =>
  importsOf(file, readFileSync(join(SRC, file), "utf8"));

/** Relative imports in a source file, resolved to paths relative to src/. */
export function relativeImports(file: string): string[] {
  return resolveRelative(file, sourceImports(file));
}

/**
 * Package imports in a source file, type-only ones included: those land in the emitted .d.ts,
 * so a consumer without that package can't compile against them.
 */
export function packageImports(file: string): ModuleImport[] {
  return bareImports(sourceImports(file));
}

/** A JS subpath's conditions. ESM only, so `default` is the module and `types` its declarations. */
export interface JsExport {
  readonly types: string;
  readonly default: string;
}

interface PackageJson {
  exports: Record<string, string | JsExport>;
  sideEffects: string[];
}

export function packageJson(): PackageJson {
  return JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as PackageJson;
}

/** The JS subpath keys of the export map ("./copy"), without "./package.json" or stylesheets. */
export function jsExportKeys(): string[] {
  const { exports } = packageJson();
  return Object.keys(exports).filter(
    (key) => typeof exports[key] === "object" && key !== "./package.json",
  );
}
