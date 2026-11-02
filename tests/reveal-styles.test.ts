// The reveal stylesheet's safety contract, checked against its text (Vitest blanks CSS imports,
// so the file is read from disk).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { motionTokens } from "../src/reveal/tokens.ts";

const css: string = readFileSync(join(import.meta.dirname, "../src/reveal/styles.css"), "utf8");

interface Rule {
  readonly selector: string;
  readonly body: string;
  /** Enclosing at-rule preludes, outermost first. */
  readonly within: readonly string[];
}

/** A small brace parser: enough for a stylesheet of plain rules nested in @layer and @media. */
function parse(text: string): { rules: Rule[]; topLevel: string[] } {
  const source = text.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: Rule[] = [];
  const topLevel: string[] = [];
  const stack: string[] = [];
  let buffer = "";
  for (const char of source) {
    if (char === "{") {
      const prelude = buffer.trim();
      buffer = "";
      if (stack.length === 0) topLevel.push(prelude);
      stack.push(prelude);
    } else if (char === "}") {
      const prelude = stack.pop() ?? "";
      if (!prelude.startsWith("@")) {
        rules.push({ selector: prelude, body: buffer.trim(), within: [...stack] });
      }
      buffer = "";
    } else {
      buffer += char;
    }
  }
  const rest = buffer.trim();
  if (rest) topLevel.push(rest);
  return { rules, topLevel };
}

/** Splits a selector list at commas outside parentheses. */
function splitList(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of list) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current.trim());
  return parts;
}

/** The complex selectors a rule matches, with the outer `:where(...)` removed. */
function complexSelectors(rule: Rule): string[] {
  return splitList(rule.selector).flatMap((selector) => {
    const inner = /^:where\(([\s\S]*)\)$/.exec(selector)?.[1];
    return inner === undefined ? [selector] : splitList(inner);
  });
}

const { rules, topLevel } = parse(css);
const ROLE = /\[data-motion(?=[\]=])/g;
const CONTAINER = /\[data-reveal[\]=]/;

const hides = (rule: Rule): boolean =>
  /(^|;)\s*opacity:\s*0\s*(;|$)/.test(rule.body) ||
  /clip-path:\s*inset\((?!0 0 0 0\))/.test(rule.body) ||
  /visibility:\s*hidden/.test(rule.body);

describe("reveal/styles.css contract", () => {
  test("everything sits inside one @layer sf", () => {
    expect(topLevel).toEqual(["@layer sf"]);
    expect(rules.length).toBeGreaterThan(20);
    for (const rule of rules) expect(rule.within[0]).toBe("@layer sf");
  });

  test("every selector is wrapped in :where()", () => {
    for (const rule of rules) {
      for (const selector of splitList(rule.selector)) expect(selector).toMatch(/^:where\(.*\)$/s);
    }
  });

  test("nothing hides content outside html[data-motion-ready] and no-preference", () => {
    // Anything that hides, plus every start state (offsets that only apply before reveal).
    const hiding = rules.filter(
      (rule) => hides(rule) || rule.selector.includes(":not([data-revealed])"),
    );
    expect(rules.filter(hides)).toHaveLength(3);
    expect(hiding.length).toBeGreaterThan(20);
    for (const rule of hiding) {
      expect(rule.within).toContain("@media (prefers-reduced-motion: no-preference)");
      for (const selector of complexSelectors(rule)) {
        expect(selector).toMatch(/^html\[data-motion-ready\] /);
      }
    }
  });

  test("no rule matches a bare root [data-motion]", () => {
    for (const rule of rules) {
      for (const selector of complexSelectors(rule)) {
        for (const match of selector.matchAll(ROLE)) {
          const before = selector.slice(0, match.index);
          expect(before, selector).toMatch(CONTAINER);
        }
      }
    }
  });

  test("the reduced-motion backstop resets every reveal element", () => {
    const reduce = rules.filter((rule) =>
      rule.within.includes("@media (prefers-reduced-motion: reduce)"),
    );
    expect(reduce).toHaveLength(1);
    expect(reduce[0]?.body).toMatch(/opacity: 1/);
    expect(reduce[0]?.body).toMatch(/transition: none/);
  });

  test("focus reveals instantly and will-change is released", () => {
    const focus = rules.find((rule) => rule.selector.includes(":has(:focus-visible)"));
    expect(focus?.body).toMatch(/transition: none/);
    expect(focus?.body).toMatch(/opacity: 1/);
    const revealed = rules.filter(
      (rule) =>
        /will-change:\s*(?!auto)\S/.test(rule.body) &&
        !rule.selector.includes(":not([data-revealed])"),
    );
    expect(revealed).toEqual([]);
  });

  test("revealed is matched by presence, never by value", () => {
    expect(css).not.toMatch(/data-revealed=/);
  });

  test("tokens are the --sf-reveal-* set and nothing else", () => {
    const names = new Set(
      [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/--[a-z][\w-]*/g)].map(([name]) => name),
    );
    expect([...names].sort()).toEqual([
      "--sf-reveal-delay",
      "--sf-reveal-duration",
      "--sf-reveal-ease",
      "--sf-reveal-lift",
      "--sf-reveal-scale",
      "--sf-reveal-step",
    ]);
  });

  test.each([
    "quiet",
    "card",
    "drop",
    "popover",
    "wipe",
    ...Object.keys(motionTokens.animationTypes),
  ])("has the %s role", (role) => {
    expect(css).toContain(`[data-motion="${role}"]`);
  });

  test("opendata role timings match its CSS", () => {
    const timing = (role: string): string | undefined =>
      rules
        .find(
          (rule) =>
            rule.selector.includes(`[data-motion="${role}"]`) &&
            !rule.selector.includes(":not([data-revealed])") &&
            rule.body.includes("transition-duration"),
        )
        ?.body.match(/--sf-reveal-duration, (\d+ms)/)?.[1];
    expect({
      "lift-xs": timing("lift-xs"),
      "lift-sm": timing("lift-sm"),
      "lift-md": timing("lift-md"),
      "lift-lg": timing("lift-lg"),
      "lift-card": timing("lift-card"),
      "lift-xl": timing("lift-xl"),
      "blur-in-soft": timing("blur-in-soft"),
      "scale-in-media": timing("scale-in-media"),
      "slide-in-chip": timing("slide-in-chip"),
    }).toEqual({
      "lift-xs": "340ms",
      "lift-sm": "360ms",
      "lift-md": "420ms",
      "lift-lg": "520ms",
      "lift-card": "520ms",
      "lift-xl": "620ms",
      "blur-in-soft": "620ms",
      "scale-in-media": "640ms",
      "slide-in-chip": "340ms",
    });
  });
});

describe("motionTokens", () => {
  test("every role-named entrance has keyframes and a timing", () => {
    for (const [role, timing] of Object.entries(motionTokens.motionRoles)) {
      expect(
        motionTokens.animationTypes[role as keyof typeof motionTokens.animationTypes],
      ).toBeDefined();
      expect(timing.easing).toMatch(/^cubic-bezier\(/);
      expect(timing.duration).toBeGreaterThan(0);
    }
    expect(motionTokens.motionRoles["lift-xl"]).toEqual({
      easing: motionTokens.easings.organicSoft,
      duration: 0.8,
    });
    expect(Object.isFrozen(motionTokens)).toBe(true);
  });
});
