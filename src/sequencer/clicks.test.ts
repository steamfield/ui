// Click-paced playback, ported from the talks ScriptedChatDemo beat model: a beat shows once the
// click count reaches its `at`, a body shows at `body.at ?? beat.at`, and many beats can share one
// `at`. The two fixtures below keep the beat structure of the talks decks (mcp-bet-demo.ts and
// ask-drug-prices.ts) with their copy shortened. Talks `chart` and `sources` beats become
// tool-calls with a custom body, since the consumer renders both.
import { describe, expect, test } from "vitest";
import type { DemoScript } from "../script/types.ts";
import { clickCount, compile } from "./compile.ts";
import { type DemoView, finalState, stateAt } from "./view.ts";

type TalksBody =
  | { kind: "hits"; hits: string[] }
  | { kind: "chart"; tag?: string }
  | { kind: "search"; queries: string[]; matches: string[]; selected?: number }
  | { kind: "query"; description: string; sql?: string }
  | { kind: "sources"; datasets: string[] };

const mcpBet: DemoScript<TalksBody> = {
  id: "mcp-bet",
  steps: [
    { kind: "user", at: 1, text: "How many years of salary did a house cost in 1985 vs today?" },
    {
      kind: "tool-call",
      at: 2,
      server: "opendata",
      name: "search_datasets",
      args: 'queries: ["median home sale price", "median household income"]',
      body: { kind: "custom", at: 3, data: { kind: "hits", hits: ["home-price", "income"] } },
    },
    {
      kind: "tool-call",
      at: 4,
      server: "opendata",
      name: "openchart",
      args: 'kind: "line"',
      body: { kind: "custom", data: { kind: "chart", tag: "sandboxed iframe" } },
    },
    { kind: "agent-text", at: 5, text: "In 1985 it took about 3.6 years of income; in 2024, 5." },
  ],
};

const query = (description: string, meta: string) =>
  ({
    kind: "tool-call",
    at: 1,
    name: "query_sql",
    meta,
    body: { kind: "custom", data: { kind: "query", description } },
  }) as const;

const askDrugPrices: DemoScript<TalksBody> = {
  id: "ask-drug-prices",
  steps: [
    { kind: "user", at: 0, text: "Does the pharmacy mark-up scale with acquisition cost?" },
    { kind: "agent-text", at: 1, text: "I'll look for acquisition cost and reimbursement data." },
    {
      kind: "tool-call",
      at: 1,
      name: "search_datasets",
      meta: "8 found · 8 selected",
      body: {
        kind: "custom",
        data: {
          kind: "search",
          queries: ["NADAC"],
          matches: ["cms/nadac", "cms/sdud"],
          selected: 8,
        },
      },
    },
    query("Building per-drug reimbursement totals.", "10,000 rows · 168ms"),
    query("Counting records with 2024 effective dates.", "1 row · 83ms"),
    { kind: "agent-text", at: 1, text: "Now the core join." },
    {
      kind: "tool-call",
      at: 1,
      name: "query_sql",
      status: "error",
      body: { kind: "error", summary: "SQL validation failed: CORR is not supported." },
    },
    { kind: "agent-text", at: 1, text: "I'll compute the correlation by hand." },
    query("Computing the correlation by hand.", "1 row · 267ms"),
    query("Comparing upper limits to acquisition cost.", "1 row · 143ms"),
    { kind: "agent-text", at: 1, text: "The flat gap must be the dispensing fee." },
    {
      kind: "tool-call",
      at: 1,
      name: "query_sql",
      meta: "6 rows · 219ms",
      body: {
        kind: "custom",
        data: { kind: "query", description: "Recomputing bands.", sql: "SELECT 1" },
      },
    },
    { kind: "tool-call", at: 2, name: "chart", body: { kind: "custom", data: { kind: "chart" } } },
    {
      kind: "agent-text",
      at: 2,
      lead: "The difference is mostly a fixed dollar amount.",
      text: "The median mark-up was $10.79 per fill.",
    },
    {
      kind: "tool-call",
      at: 2,
      name: "sources",
      body: { kind: "custom", data: { kind: "sources", datasets: ["cms/sdud", "cms/nadac"] } },
    },
  ],
};

const shown = (view: DemoView) => view.entries.map((e) => e.index);
const bodies = (view: DemoView) =>
  view.entries.filter((e) => e.bodyVisible !== undefined).map((e) => [e.index, e.bodyVisible]);

describe("mcp-bet-demo beats", () => {
  const timeline = compile(mcpBet);

  test("needs 5 clicks: the highest at, body gates included", () => {
    expect(clickCount(mcpBet)).toBe(5);
    expect(timeline.clickCount).toBe(5);
  });

  test.each([
    [0, [], []],
    [1, [0], []],
    [2, [0, 1], [[1, false]]],
    [3, [0, 1], [[1, true]]],
    [
      4,
      [0, 1, 2],
      [
        [1, true],
        [2, true],
      ],
    ],
    [
      5,
      [0, 1, 2, 3],
      [
        [1, true],
        [2, true],
      ],
    ],
  ])("click %i shows steps %j and bodies %j", (click, steps, bodyState) => {
    const view = stateAt(timeline, { click });
    expect(shown(view)).toEqual(steps);
    expect(bodies(view)).toEqual(bodyState);
    expect(view.complete).toBe(click >= 5);
  });

  test("a tool call runs while its body waits for a later click, then resolves", () => {
    expect(stateAt(timeline, { click: 2 }).entries[1]).toMatchObject({
      phase: "running",
      status: "running",
      progress: 0,
    });
    expect(stateAt(timeline, { click: 3 }).entries[1]).toMatchObject({
      phase: "done",
      status: "done",
    });
  });

  test("text is whole in click mode: no typing or streaming", () => {
    const view = stateAt(timeline, { click: 5 });
    expect(view.entries[0]).toMatchObject({
      phase: "done",
      visibleText: "How many years of salary did a house cost in 1985 vs today?",
    });
    expect(view.entries[3]?.visibleText).toBe(
      "In 1985 it took about 3.6 years of income; in 2024, 5.",
    );
    expect(view.composer).toBeNull();
  });

  test("going backward is pure: n-1 after n equals n-1 fresh", () => {
    for (let n = 1; n <= 5; n++) {
      const fresh = stateAt(compile(mcpBet), { click: n - 1 });
      stateAt(timeline, { click: n });
      expect(stateAt(timeline, { click: n - 1 })).toEqual(fresh);
    }
  });

  test("jumping straight to clickCount equals the final state", () => {
    expect(stateAt(timeline, { click: clickCount(mcpBet) })).toEqual(finalState(timeline));
    expect(stateAt(timeline, { click: 99 })).toEqual(finalState(timeline));
  });

  test("current is the latest shown step", () => {
    expect([0, 1, 2, 3, 4, 5].map((click) => stateAt(timeline, { click }).current)).toEqual([
      -1, 0, 1, 1, 2, 3,
    ]);
  });
});

describe("ask-drug-prices beats (many beats share one at)", () => {
  const timeline = compile(askDrugPrices);

  test("needs 2 clicks", () => {
    expect(clickCount(askDrugPrices)).toBe(2);
  });

  test("click 0 shows the question, click 1 the whole tool stack, click 2 the answer", () => {
    expect(shown(stateAt(timeline, { click: 0 }))).toEqual([0]);
    expect(shown(stateAt(timeline, { click: 1 }))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(shown(stateAt(timeline, { click: 2 }))).toEqual(askDrugPrices.steps.map((_, i) => i));
  });

  test("bodies without their own at show with their beat", () => {
    const view = stateAt(timeline, { click: 1 });
    expect(
      view.entries.filter((e) => e.step.kind === "tool-call").every((e) => e.bodyVisible),
    ).toBe(true);
  });

  test("an explicit status shows as soon as the beat is shown", () => {
    expect(stateAt(timeline, { click: 1 }).entries[6]).toMatchObject({
      phase: "done",
      status: "error",
    });
  });

  test("jumping straight to clickCount equals the final state", () => {
    expect(stateAt(timeline, { click: 2 })).toEqual(finalState(timeline));
  });
});

describe("at inheritance and sub-gates", () => {
  const script: DemoScript = {
    steps: [
      { kind: "user", text: "a" },
      { kind: "agent-text", at: 2, text: "b" },
      { kind: "agent-text", text: "c" },
      { kind: "tool-call", name: "t", output: ["x"], outputAt: 3, more: 2 },
      { kind: "tool-call", name: "u", at: 4, body: { kind: "steps", steps: ["s"], at: 1 } },
    ],
  };
  const timeline = compile(script);

  test("a step without at reveals with the step before it, from 0", () => {
    expect(shown(stateAt(timeline, { click: 0 }))).toEqual([0]);
    expect(shown(stateAt(timeline, { click: 2 }))).toEqual([0, 1, 2, 3]);
    expect(timeline.steps.map((s) => s.at)).toEqual([0, 2, 2, 2, 4]);
  });

  test("output waits for outputAt, and more shows once it is in", () => {
    const at2 = stateAt(timeline, { click: 2 }).entries[3];
    expect(at2).toMatchObject({ phase: "running", visibleLines: [] });
    expect(at2?.more).toBeUndefined();
    expect(stateAt(timeline, { click: 3 }).entries[3]).toMatchObject({
      phase: "done",
      visibleLines: ["x"],
      more: 2,
    });
  });

  test("a body never reveals before its step", () => {
    expect(clickCount(script)).toBe(4);
    expect(stateAt(timeline, { click: 4 }).entries[4]).toMatchObject({ bodyVisible: true });
  });

  test("click mode reports elapsed 0 until complete", () => {
    expect(stateAt(timeline, { click: 3 }).elapsed).toBe(0);
    expect(stateAt(timeline, { click: 4 }).elapsed).toBe(timeline.duration);
  });
});
