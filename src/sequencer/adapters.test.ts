// OpenData's chat demo keeps its own `Turn` type and converts it with an adapter that will live in
// @opendata/shared. This test carries a copy of that adapter to show the shared API is enough:
// tool turns become tool-calls with a custom body, each turn's `typingMs` rides on its step, and
// `typeMsPerChar` (with the original's 18ms floor) and `toolMs` read the step, so the pacing
// matches use-chat-sequencer.ts. `thinkingOnSubmit` shows the dots as the message posts, and the
// reduced-motion view lists the last text above the last chart, as the original did.
import { describe, expect, test } from "vitest";
import type { DemoScript, Step } from "../script/types.ts";
import { compile } from "./compile.ts";
import type { Timing } from "./timing.ts";
import { finalState, stateAt } from "./view.ts";

type ToolTurn =
  | {
      kind: "tool-search";
      tool: "search_datasets";
      args: string;
      timeMs: number;
      results: string[];
    }
  | { kind: "tool-info"; tool: "get_dataset_info"; args: string; timeMs: number; info: string }
  | { kind: "tool-chart"; tool: "openchart"; args: string; timeMs: number; chart: string };

type Turn =
  | { kind: "user"; text: string; typingMs: number; preTyped?: string }
  | ToolTurn
  | { kind: "assistant-text"; text: string };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The adapter opendata will own: MCD turns to a DemoScript plus the timing hooks they need. */
function fromTurns(turns: readonly Turn[]): {
  script: DemoScript<ToolTurn>;
  timing: Partial<Timing<ToolTurn>>;
} {
  const steps = turns.map((turn): Step<ToolTurn> => {
    if (turn.kind === "user") {
      return {
        kind: "user",
        text: turn.text,
        composer: true,
        typingMs: turn.typingMs,
        ...(turn.preTyped === undefined ? {} : { preTyped: turn.preTyped }),
      };
    }
    if (turn.kind === "assistant-text") return { kind: "agent-text", text: turn.text };
    return {
      kind: "tool-call",
      name: turn.tool,
      args: turn.args,
      body: { kind: "custom", data: turn },
    };
  });
  return {
    script: { id: "mcd", steps },
    timing: {
      typeMsPerChar: (step) => {
        const typed = step.text.length - (step.kind === "user" ? (step.preTyped?.length ?? 0) : 0);
        return Math.max(18, Math.floor((step.typingMs ?? 0) / Math.max(1, typed)));
      },
      thinkingOnSubmit: true,
      toolMs: (step) =>
        step.body?.kind === "custom" ? clamp(step.body.data.timeMs + 200, 800, 1800) : 1000,
    },
  };
}

const turns: Turn[] = [
  {
    kind: "user",
    text: "Which states have the highest uninsured rates?",
    typingMs: 2200,
    preTyped: "Which",
  },
  {
    kind: "tool-search",
    tool: "search_datasets",
    args: 'query: "uninsured"',
    timeMs: 485,
    results: ["a"],
  },
  { kind: "tool-info", tool: "get_dataset_info", args: 'path: "a"', timeMs: 1900, info: "i" },
  { kind: "tool-chart", tool: "openchart", args: 'kind: "bar"', timeMs: 300, chart: "c" },
  { kind: "assistant-text", text: "Texas is highest, at 16.7%. Want the county view?" },
  { kind: "user", text: "Yes, show the counties.", typingMs: 1600 },
];

/** use-chat-sequencer's sleeps, as [min, max] per turn, for the bounds the shared preset must hit. */
function mcdBounds(list: readonly Turn[]): Array<[number, number]> {
  return list.map((turn, i) => {
    if (turn.kind === "user") {
      const pre = turn.preTyped?.length ?? 0;
      const n = turn.text.length - pre;
      const base = Math.max(18, Math.floor(turn.typingMs / Math.max(1, n)));
      const prefill: [number, number] = pre > 0 ? [200, 400] : [0, 0];
      const think: [number, number] = list[i + 1] ? [800, 1400] : [300, 300];
      return [
        prefill[0] + n * Math.max(12, base - 9) + 350 + think[0],
        prefill[1] + n * (base + 9) + 700 + think[1],
      ];
    }
    if (turn.kind === "assistant-text") {
      const units = turn.text.split(/(\s+)/).filter(Boolean);
      const punct = units.filter((u) => /[.!?,;:]$/.test(u)).length;
      const plain = units.length - punct;
      return [80 + punct * 60 + plain * 20 + 1000, 80 + punct * 140 + plain * 55 + 1600];
    }
    const run = clamp(turn.timeMs + 200, 800, 1800);
    return [run + 500, run + 900];
  });
}

describe("an MCD-style script through the adapter", () => {
  const { script, timing } = fromTurns(turns);

  test.each(["a", "b", "c", "d", "e"])("seed %s: every turn keeps MCD's pacing", (seed) => {
    const timeline = compile(script, { timing, seed });
    const bounds = mcdBounds(turns);
    timeline.steps.forEach((step, i) => {
      const [min, max] = bounds[i] ?? [0, 0];
      expect(step.end - step.start).toBeGreaterThanOrEqual(min);
      expect(step.end - step.start).toBeLessThanOrEqual(max);
    });
    expect(timeline.steps[0]?.start).toBeGreaterThanOrEqual(400);
    expect(timeline.steps[0]?.start).toBeLessThanOrEqual(800);
  });

  test("each tool loads for clamp(timeMs + 200, 800, 1800)", () => {
    const timeline = compile(script, { timing });
    for (const [i, expected] of [
      [1, 800],
      [2, 1800],
      [3, 800],
    ] as const) {
      const start = timeline.steps[i]?.start ?? 0;
      expect(stateAt(timeline, { ms: start + expected - 0.01 }).entries.at(-1)?.phase).toBe(
        "running",
      );
      expect(stateAt(timeline, { ms: start + expected }).entries.at(-1)?.phase).toBe("done");
    }
  });

  test("plays in MCD's order: type, submit and think, load tools, stream the answer", () => {
    const timeline = compile(script, { timing });
    const story: string[] = [];
    const marks = Array.from({ length: Math.ceil(timeline.duration / 5) }, (_, i) => i * 5);
    for (const ms of [...marks, timeline.duration]) {
      const view = stateAt(timeline, { ms });
      const last = view.entries.at(-1);
      const beat = last
        ? `${last.index}:${last.phase}`
        : `composer:${view.composer?.text ? "typing" : "empty"}`;
      if (story.at(-1) !== beat) story.push(beat);
    }
    expect(story).toEqual([
      "composer:empty",
      "composer:typing",
      "0:thinking",
      "1:running",
      "1:done",
      "2:running",
      "2:done",
      "3:running",
      "3:done",
      "4:revealing",
      "4:done",
      "5:submitted",
      "5:done",
    ]);
  });

  test("the custom body carries the turn through untouched", () => {
    const view = finalState(compile(script, { timing }));
    const tool = view.entries[2]?.step;
    expect(tool?.kind === "tool-call" && tool.body?.kind === "custom" && tool.body.data).toBe(
      turns[2],
    );
  });

  test("a listed pick puts the last text above the last chart, as MCD's reduced motion did", () => {
    const pick = (steps: readonly Step<unknown>[]): number[] => [
      steps.findLastIndex((s) => s.kind === "agent-text" || s.kind === "user"),
      steps.findLastIndex((s) => s.kind === "tool-call" && s.name === "openchart"),
    ];
    const view = finalState(compile(script, { timing }), { policy: { pick, order: "listed" } });
    expect(view.entries.map((e) => e.index)).toEqual([5, 3]);
  });

  test('"last" keeps the last chart and the last text in script order', () => {
    const view = finalState(compile(script, { timing }), { policy: "last" });
    expect(view.entries.map((e) => e.index)).toEqual([3, 4]);
  });
});
