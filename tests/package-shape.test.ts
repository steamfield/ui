// The export map, the source tree and the dependency graph between subpaths must agree. A
// subpath a consumer can't import is dead code; one that imports a sibling it isn't allowed to
// reach drags that sibling into every bundle that uses it.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "tsdown";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  bareImports,
  entries,
  filesUnder,
  importsOf,
  jsExportKeys,
  type ModuleImport,
  packageImports,
  packageJson,
  ROOT,
  relativeImports,
  resolveRelative,
  sourceFiles,
  subpathOf,
} from "./package-shape.ts";

const isTest = (file: string): boolean => /\.test\.tsx?$/.test(file);
const modules = (): string[] => sourceFiles().filter((f) => /\.tsx?$/.test(f) && !isTest(f));

/**
 * Which subpaths each subpath may import. `internal` is always allowed. Anything not listed is a
 * boundary break: move the shared code down a layer instead of reaching sideways.
 */
const ALLOWED: Record<string, string[]> = {
  script: [],
  sequencer: ["script"],
  playback: [],
  copy: [],
  tabs: [],
  reveal: [],
  markdown: ["copy"],
  docs: [],
  "react/playback": ["playback"],
  "react/copy": ["copy"],
  "react/tabs": ["tabs"],
  "react/install-tabs": ["react/tabs", "react/copy", "copy", "tabs"],
  "react/window": [],
  "react/agent-demo": [
    "script",
    "sequencer",
    "playback",
    "react/playback",
    "react/window",
    "agent-demo",
  ],
  "vue/agent-demo": ["script", "sequencer", "playback", "agent-demo"],
  // No entry: the renderer core both bindings share. Only its stylesheet is exported.
  "agent-demo": ["script", "sequencer", "playback"],
};

/**
 * Packages each area may import. Type-only imports count too: they are erased from the JS but
 * land in the .d.ts, which a consumer without that package can't compile.
 */
const PACKAGES: Array<[RegExp, RegExp]> = [
  [/^react\//, /^react(-dom)?(\/.*)?$/],
  [/^vue\//, /^vue$/],
  [/^markdown/, /^(satteri|shiki|github-slugger|hast|@types\/hast)(\/.*)?$/],
];

/** Specifiers in `imports` the area that `file` belongs to may not import. */
function packageBreaks(file: string, imports: readonly ModuleImport[]): string[] {
  const area = subpathOf(file);
  const allowed = PACKAGES.filter(([where]) => where.test(`${area}/`)).map(([, what]) => what);
  return bareImports(imports)
    .map(({ spec }) => spec)
    .filter((spec) => !allowed.some((pattern) => pattern.test(spec)));
}

/** Relative imports of `file` that land in a subpath its owner may not reach. */
function graphBreaks(file: string, targets: readonly string[]): string[] {
  const from = owner(file);
  const allowed = new Set([from, "internal", ...(ALLOWED[from] ?? [])]);
  return targets.filter((to) => !allowed.has(owner(to)));
}

/** JS subpaths whose area may import no package: they must work with no peers installed. */
const frameworkFree = (): string[] =>
  jsExportKeys().filter((key) => !PACKAGES.some(([where]) => where.test(`${key.slice(2)}/`)));

/** The `@steamfield/ui/*` subpaths a consumer fixture imports. */
function fixtureSubpaths(path: string): string[] {
  const imports = importsOf(path, readFileSync(join(ROOT, path), "utf8"));
  return imports
    .map(({ spec }) => /^@steamfield\/ui\/(.+)$/.exec(spec)?.[1])
    .filter((key): key is string => key !== undefined)
    .map((key) => `./${key}`);
}

/** The subpath a src/ path belongs to, by longest matching ALLOWED key. */
function owner(file: string): string {
  const dir = subpathOf(file);
  const keys = Object.keys(ALLOWED).sort((a, b) => b.length - a.length);
  return keys.find((key) => dir === key || dir.startsWith(`${key}/`)) ?? dir.split("/")[0] ?? dir;
}

describe("export map", () => {
  const { exports } = packageJson();

  test.each(entries())("src/%s has a matching exports entry", (entry) => {
    const subpath = `./${subpathOf(entry)}`;
    expect(exports[subpath]).toEqual({
      types: `./dist/${subpathOf(entry)}/index.d.ts`,
      default: `./dist/${subpathOf(entry)}/index.js`,
    });
  });

  test("every JS exports entry has a source entry", () => {
    const fromSource = new Set(entries().map((entry) => `./${subpathOf(entry)}`));
    expect(jsExportKeys().filter((key) => !fromSource.has(key))).toEqual([]);
  });

  test("every stylesheet is exported, and CSS is the only side effect", () => {
    const css = sourceFiles().filter((file) => file.endsWith(".css"));
    for (const file of css) {
      expect(exports[`./${file}`]).toBe(`./dist/${file}`);
    }
    expect(packageJson().sideEffects).toEqual(["**/*.css"]);
  });

  test("no module imports a stylesheet", () => {
    const offenders = modules().filter((file) =>
      relativeImports(file).some((target) => target.endsWith(".css")),
    );
    expect(offenders).toEqual([]);
  });
});

describe("every JS subpath is budgeted and consumed", () => {
  test("has a .size-limit.json entry", () => {
    const budgets = JSON.parse(readFileSync(join(ROOT, ".size-limit.json"), "utf8")) as {
      path: string;
    }[];
    const paths = new Set(budgets.map(({ path }) => path));
    const missing = jsExportKeys().filter((key) => !paths.has(`dist/${key.slice(2)}/index.js`));
    expect(missing).toEqual([]);
  });

  test("is imported by tests/consumer/index.ts", () => {
    const imported = new Set(fixtureSubpaths("tests/consumer/index.ts"));
    expect(jsExportKeys().filter((key) => !imported.has(key))).toEqual([]);
  });

  test("is imported by tests/consumer-no-peers/index.ts when it needs no peer", () => {
    expect(frameworkFree().length).toBeGreaterThan(5);
    expect(fixtureSubpaths("tests/consumer-no-peers/index.ts").sort()).toEqual(
      frameworkFree().sort(),
    );
  });
});

describe("dependency graph", () => {
  test("every subpath is declared in the graph", () => {
    const undeclared = entries()
      .map(subpathOf)
      .filter((subpath) => !(subpath in ALLOWED));
    expect(undeclared).toEqual([]);
  });

  test.each(modules())("src/%s imports only allowed subpaths", (file) => {
    expect(graphBreaks(file, relativeImports(file))).toEqual([]);
  });

  test.each(modules())("src/%s imports only the packages its area allows", (file) => {
    expect(packageBreaks(file, packageImports(file))).toEqual([]);
  });

  test("JSX lives only under react/, since it compiles to a react/jsx-runtime import", () => {
    expect(modules().filter((file) => file.endsWith(".tsx") && !file.startsWith("react/"))).toEqual(
      [],
    );
  });
});

// The rules again over what tsdown emits, which is what a consumer's bundler and tsc read: JSX
// becomes a react/jsx-runtime import and type imports land in the .d.ts.
describe("built output", () => {
  let out = "";
  beforeAll(async () => {
    out = mkdtempSync(join(tmpdir(), "package-shape-"));
    await build({ cwd: ROOT, outDir: out, copy: [], logLevel: "silent" });
  });
  afterAll(() => {
    if (out) rmSync(out, { recursive: true, force: true });
  });

  const emitted = (): string[] => filesUnder(out).filter((file) => /\.(js|d\.ts)$/.test(file));
  const importsIn = (file: string): ModuleImport[] =>
    importsOf(file, readFileSync(join(out, file), "utf8"));

  test("emits JS and declarations for every entry", () => {
    const files = new Set(emitted());
    for (const key of jsExportKeys()) {
      expect(files).toContain(`${key.slice(2)}/index.js`);
      expect(files).toContain(`${key.slice(2)}/index.d.ts`);
    }
  });

  test("every emitted file imports only the packages its area allows", () => {
    const breaks = emitted().flatMap((file) =>
      packageBreaks(file, importsIn(file)).map((spec) => `${file}: ${spec}`),
    );
    expect(breaks).toEqual([]);
  });

  test("every emitted file imports only allowed subpaths", () => {
    const breaks = emitted().flatMap((file) =>
      graphBreaks(file, resolveRelative(file, importsIn(file))).map((to) => `${file}: ${to}`),
    );
    expect(breaks).toEqual([]);
  });
});
