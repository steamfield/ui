// The CSS conventions every stylesheet follows, checked on the parsed sheet (Vitest blanks CSS
// imports, so each file is read from disk): everything in one `@layer sf`, every selector inside
// `:where()` so a consumer's class always wins, and theming only through `--sf-*` custom
// properties that each carry a fallback. tests/reveal-styles.test.ts adds reveal's own contract.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postcss, { type AtRule, type Node, type Root, type Rule } from "postcss";
import { describe, expect, test } from "vitest";
import { sourceFiles } from "./package-shape.ts";

const sheets = sourceFiles().filter((file) => file.endsWith(".css"));
const parse = (file: string): Root =>
  postcss.parse(readFileSync(join(import.meta.dirname, "../src", file), "utf8"), { from: file });

/** Whether `rule` sits inside an `@keyframes` block, where selectors are offsets, not elements. */
const inKeyframes = (rule: Rule): boolean => {
  for (let node: Node | undefined = rule.parent; node; node = node.parent) {
    if (node.type === "atrule" && /keyframes$/.test((node as AtRule).name)) return true;
  }
  return false;
};

/**
 * Whether the whole selector is one `:where(...)`, optionally followed by a pseudo-element (which
 * can't sit inside it). Finds the paren that closes the opening `:where(`, skipping quoted
 * attribute values, so `:where(.a) .b:is(.c)` is rejected.
 */
function wrappedInWhere(selector: string): boolean {
  // Quoted attribute values may hold parens; blank them before counting.
  const text = selector.trim().replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""');
  if (!text.startsWith(":where(")) return false;
  let depth = 0;
  for (let i = ":where".length; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")" && --depth === 0) return /^(::[a-z-]+)?$/.test(text.slice(i + 1));
  }
  return false;
}

/** Every `var(--name ...)` in `value`, with whether a fallback follows the name. */
function varUses(value: string): { name: string; fallback: boolean }[] {
  return [...value.matchAll(/var\(\s*(--[\w-]+)\s*([,)])/g)].map((match) => ({
    name: match[1] as string,
    fallback: match[2] === ",",
  }));
}

test.each([
  [':where([data-part="tab"])', true],
  [":where([data-heading-anchor])::before", true],
  [":where(a:not(.x), b:is(.y))", true],
  [':where([data-x=")"]) ', true],
  [':where([data-part="tabs"]) button:not(.x)', false],
  [":where(.a) .b:is(.c)", false],
  [":where(.a):hover", false],
  [".a", false],
])("wrappedInWhere(%s) is %s", (selector, expected) => {
  expect(wrappedInWhere(selector)).toBe(expected);
});

test("there are stylesheets to check", () => {
  expect(sheets.length).toBeGreaterThanOrEqual(7);
});

describe.each(sheets)("src/%s", (file) => {
  const root = parse(file);

  test("everything sits inside one @layer sf", () => {
    const top = root.nodes.filter((node) => node.type !== "comment");
    expect(
      top.map((node) => (node.type === "atrule" ? `@${node.name} ${node.params}` : node.type)),
    ).toEqual(["@layer sf"]);
    let rules = 0;
    root.walkRules(() => {
      rules += 1;
    });
    expect(rules).toBeGreaterThan(0);
  });

  test("every selector is wrapped in :where()", () => {
    const bare: string[] = [];
    root.walkRules((rule) => {
      if (inKeyframes(rule)) return;
      for (const selector of rule.selectors) {
        if (!wrappedInWhere(selector)) bare.push(selector);
      }
    });
    expect(bare).toEqual([]);
  });

  test("custom properties are --sf-*, and every var() has a fallback", () => {
    const problems: string[] = [];
    root.walkDecls((decl) => {
      if (decl.prop.startsWith("--") && !decl.prop.startsWith("--sf-")) {
        problems.push(`sets ${decl.prop}`);
      }
      for (const { name, fallback } of varUses(decl.value)) {
        if (!name.startsWith("--sf-")) problems.push(`${decl.prop} reads ${name}`);
        if (!fallback) problems.push(`${decl.prop} reads ${name} with no fallback`);
      }
    });
    expect(problems).toEqual([]);
  });

  test("keyframes are namespaced sf-*", () => {
    const names: string[] = [];
    root.walkAtRules(/keyframes$/, (rule) => {
      names.push(rule.params);
    });
    expect(names.filter((name) => !name.startsWith("sf-"))).toEqual([]);
  });
});
