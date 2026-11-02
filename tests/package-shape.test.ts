// The export map, the source tree and the dependency graph between subpaths must agree. A
// subpath a consumer can't import is dead code; one that imports a sibling it isn't allowed to
// reach drags that sibling into every bundle that uses it.
import { describe, expect, test } from "vitest";
import {
  entries,
  packageImports,
  packageJson,
  relativeImports,
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
  markdown: [],
  docs: [],
  "react/playback": ["playback"],
  "react/copy": ["copy"],
  "react/tabs": ["tabs"],
  "react/install-tabs": ["react/tabs", "react/copy", "copy", "tabs"],
  "react/window": [],
  "react/agent-demo": ["script", "sequencer", "playback", "react/playback", "react/window"],
  "vue/agent-demo": ["script", "sequencer", "playback"],
};

/** Packages each area may import at runtime. Type-only imports are erased and not checked. */
const PACKAGES: Array<[RegExp, RegExp]> = [
  [/^react\//, /^react(-dom)?(\/.*)?$/],
  [/^vue\//, /^vue$/],
  [/^markdown/, /^(satteri|shiki|github-slugger|hast|@types\/hast)(\/.*)?$/],
];

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
      import: `./dist/${subpathOf(entry)}/index.js`,
    });
  });

  test("every JS exports entry has a source entry", () => {
    const fromSource = new Set(entries().map((entry) => `./${subpathOf(entry)}`));
    const jsKeys = Object.keys(exports).filter(
      (key) => typeof exports[key] === "object" && key !== "./package.json",
    );
    expect(jsKeys.filter((key) => !fromSource.has(key))).toEqual([]);
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

describe("dependency graph", () => {
  test("every subpath is declared in the graph", () => {
    const undeclared = entries()
      .map(subpathOf)
      .filter((subpath) => !(subpath in ALLOWED));
    expect(undeclared).toEqual([]);
  });

  test.each(modules())("src/%s imports only allowed subpaths", (file) => {
    const from = owner(file);
    const allowed = new Set([from, "internal", ...(ALLOWED[from] ?? [])]);
    const breaks = relativeImports(file)
      .map(owner)
      .filter((to) => !allowed.has(to));
    expect(breaks).toEqual([]);
  });

  test.each(modules())("src/%s imports only the packages its area allows", (file) => {
    const area = subpathOf(file);
    const runtime = packageImports(file);
    const allowed = PACKAGES.filter(([where]) => where.test(`${area}/`)).map(([, what]) => what);
    const breaks = runtime.filter((spec) => !allowed.some((pattern) => pattern.test(spec)));
    expect(breaks).toEqual([]);
  });
});
