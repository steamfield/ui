import { describe, expect, test } from "vitest";
import { isLibraryError, type LibraryErrorCode } from "../script/errors.ts";
import type { DemoScript, Step } from "../script/types.ts";
import { clickCount, compile, type Timeline } from "./compile.ts";
import { presets } from "./timing.ts";
import { type DemoEntry, type DemoView, finalState, stateAt } from "./view.ts";

function failure(run: () => unknown): { code: LibraryErrorCode; field: string | undefined } {
  try {
    run();
  } catch (error) {
    if (isLibraryError(error)) return { code: error.code, field: error.field };
    throw error;
  }
  throw new Error("expected a LibraryError");
}

// rr's agent script runs the same command twice, which is why keys are never the text.
const terminalScript: DemoScript = {
  id: "terminal",
  steps: [
    { kind: "prompt", text: "~/demo $" },
    { kind: "command", text: "make test" },
    { kind: "output", lines: ["ok  pkg/a", { text: "FAIL pkg/b", tone: "fail" }], more: 4 },
    { kind: "user", text: "Fix the failing test" },
    {
      kind: "tool-call",
      name: "Bash",
      args: "make test",
      output: [{ text: "PASS", tone: "ok" }],
      more: 3,
    },
    { kind: "agent-text", text: "All green. The flaky test now waits for the server." },
    { kind: "command", text: "make test" },
  ],
};

const chatScript: DemoScript = {
  id: "chat",
  steps: [
    { kind: "user", text: "How did prices change?", preTyped: "How" },
    { kind: "tool-call", id: "search", name: "search", body: { kind: "steps", steps: ["a"] } },
    { kind: "agent-text", text: "They rose, then fell. Want a chart?" },
    { kind: "user", text: "Yes, chart it." },
    { kind: "tool-call", id: "chart", name: "chart", status: "error" },
    { kind: "agent-text", text: "The chart failed; here is a table instead." },
  ],
};

const chat = (seed?: string): Timeline =>
  compile(chatScript, { composer: true, ...(seed === undefined ? {} : { seed }) });

/** Every ms boundary the timeline has, plus a step either side, for exhaustive sweeps. */
function sweep(timeline: Timeline, step = 7): number[] {
  const marks: number[] = [];
  for (let ms = 0; ms <= timeline.duration; ms += step) marks.push(ms);
  for (const s of timeline.steps) marks.push(s.start, s.end, s.end - 0.001);
  marks.push(timeline.duration);
  return marks.filter((ms) => ms >= 0).sort((a, b) => a - b);
}

const entry = (view: DemoView, index: number): DemoEntry | undefined =>
  view.entries.find((e) => e.index === index);

describe("determinism", () => {
  test("the same seed gives the same timeline and views", () => {
    const a = chat("one");
    const b = chat("one");
    expect(a.steps).toEqual(b.steps);
    for (const ms of sweep(a, 97)) expect(stateAt(a, { ms })).toEqual(stateAt(b, { ms }));
  });

  test("a different seed changes the jitter, not the content", () => {
    const a = chat("one");
    const b = chat("two");
    expect(a.duration).not.toBe(b.duration);
    expect(a.steps.map((s) => s.start)).not.toEqual(b.steps.map((s) => s.start));
    const strip = (view: DemoView) => ({
      ...view,
      elapsed: 0,
      duration: 0,
      turnStarts: [],
      turnEnds: [],
    });
    expect(strip(finalState(a))).toEqual(strip(finalState(b)));
  });

  test("the seed defaults to the script id", () => {
    expect(chat().steps).toEqual(chat("chat").steps);
    const anonymous = compile({ steps: chatScript.steps });
    expect(anonymous.steps).toEqual(compile(chatScript, { seed: "" }).steps);
  });

  test("a preset without jitter ignores the seed", () => {
    const a = compile(terminalScript, { timing: presets.terminal, seed: "a" });
    const b = compile(terminalScript, { timing: presets.terminal, seed: "b" });
    expect(a.steps).toEqual(b.steps);
  });
});

describe("monotonicity", () => {
  test.each([
    ["chat", chat()],
    ["terminal", compile(terminalScript, { timing: presets.terminal })],
  ])("%s: entries only grow, keys are stable, complete flips at duration", (_name, timeline) => {
    let previous = stateAt(timeline, { ms: 0 });
    for (const ms of sweep(timeline)) {
      const view = stateAt(timeline, { ms });
      const keys = view.entries.map((e) => e.key);
      expect(keys.slice(0, previous.entries.length)).toEqual(previous.entries.map((e) => e.key));
      for (const before of previous.entries) {
        const now = entry(view, before.index);
        expect((now?.visibleText ?? "").length).toBeGreaterThanOrEqual(
          (before.visibleText ?? "").length,
        );
        expect(now?.visibleLines?.length ?? 0).toBeGreaterThanOrEqual(
          before.visibleLines?.length ?? 0,
        );
      }
      expect(view.complete).toBe(ms >= timeline.duration);
      expect(view.current).toBeGreaterThanOrEqual(previous.current);
      previous = view;
    }
  });

  test("keys are the index or id, so a repeated command keeps two keys", () => {
    const view = finalState(compile(terminalScript, { timing: presets.terminal }));
    expect(view.entries.map((e) => e.key)).toEqual(["0", "1", "2", "3", "4", "5", "6"]);
    expect(finalState(chat()).entries.map((e) => e.key)).toEqual([
      "0",
      "id:search",
      "2",
      "3",
      "id:chart",
      "5",
    ]);
  });

  test("a tool-call id that looks like an index never collides with that step's key", () => {
    const timeline = compile({
      steps: [
        { kind: "user", text: "q" },
        { kind: "tool-call", name: "a", id: "2" },
        { kind: "agent-text", text: "done" },
      ],
    });
    const keys = finalState(timeline).entries.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("complete flips exactly at duration", () => {
    const timeline = chat();
    expect(stateAt(timeline, { ms: timeline.duration - 0.01 }).complete).toBe(false);
    expect(stateAt(timeline, { ms: timeline.duration }).complete).toBe(true);
  });

  test("positions outside the timeline clamp to it", () => {
    const timeline = chat();
    expect(stateAt(timeline, { ms: -50 })).toEqual(stateAt(timeline, { ms: 0 }));
    expect(stateAt(timeline, { ms: 1e9 })).toEqual(finalState(timeline));
    expect(stateAt(timeline, { ms: -50 }).current).toBe(-1);
    expect(stateAt(timeline, { ms: -50 }).entries).toEqual([]);
  });
});

describe("user steps", () => {
  const timeline = chat();
  const user = timeline.steps[0] as Timeline["steps"][number];
  const phases = sweep(timeline, 3)
    .filter((ms) => ms < user.end)
    .map((ms) => {
      const view = stateAt(timeline, { ms });
      return { ms, view, user: entry(view, 0) };
    });

  test("type into the composer, flash on submit, then think, then finish", () => {
    const order = phases
      .map((p) => p.user?.phase ?? "composer")
      .filter((p, i, all) => p !== all[i - 1]);
    expect(order).toEqual(["composer", "submitted", "thinking"]);
    expect(stateAt(timeline, { ms: user.end }).entries[0]?.phase).toBe("done");
  });

  test("the pre-typed prefix is in the composer from the start, then text grows", () => {
    const typing = phases.filter((p) => p.ms >= user.start && !p.user);
    expect(typing[0]?.view.composer?.text).toBe("How");
    const texts = typing.map((p) => p.view.composer?.text ?? "");
    expect(texts.at(-1)).toBe("How did prices change?");
    expect(texts.every((t) => "How did prices change?".startsWith(t))).toBe(true);
  });

  test("the composer flashes only while submitted, and empties on submit", () => {
    for (const p of phases) {
      expect(p.view.composer?.flash).toBe(p.user?.phase === "submitted");
      if (p.user) expect(p.view.composer?.text).toBe("");
    }
    const flash = phases.filter((p) => p.view.composer?.flash);
    const span = (flash.at(-1)?.ms ?? 0) - (flash[0]?.ms ?? 0);
    expect(span).toBeGreaterThan(250);
    expect(span).toBeLessThanOrEqual(300);
  });

  test("no thinking after the last step, so the final user step ends after its flash", () => {
    const timeline = compile({ steps: [{ kind: "user", text: "hi", composer: true }] });
    const [step] = timeline.steps;
    const views = sweep(timeline, 1).map((ms) => stateAt(timeline, { ms }).entries[0]?.phase);
    expect(views).not.toContain("thinking");
    expect(views.at(-1)).toBe("done");
    expect(step).toBeDefined();
    expect(finalState(timeline).composer).toEqual({ text: "", flash: false });
  });

  test("no automatic thinking before an explicit thinking step", () => {
    const timeline = compile({
      steps: [
        { kind: "user", text: "hi" },
        { kind: "thinking", ms: 500 },
      ],
    });
    const phases = sweep(timeline, 5).map((ms) => stateAt(timeline, { ms }));
    expect(phases.map((v) => v.entries[0]?.phase)).not.toContain("thinking");
    expect(phases.map((v) => v.entries[1]?.phase)).toContain("thinking");
  });

  test("without a composer the user step types into the transcript", () => {
    const timeline = compile(terminalScript, { timing: presets.terminal });
    const start = timeline.steps[3]?.start ?? 0;
    const view = stateAt(timeline, { ms: start + 100 });
    expect(view.composer).toBeNull();
    expect(entry(view, 3)?.phase).toBe("typing");
    expect(entry(view, 3)?.visibleText?.length).toBeGreaterThan(0);
    expect(entry(view, 3)?.progress).toBeLessThan(1);
  });

  test("a step's composer flag overrides the option", () => {
    const script: DemoScript = { steps: [{ kind: "user", text: "hi", composer: false }] };
    expect(stateAt(compile(script, { composer: true }), { ms: 0 }).composer).toBeNull();
  });
});

describe("tool calls", () => {
  test("run, then resolve; an explicit status overrides done once resolved", () => {
    const timeline = chat();
    const statuses = (index: number) =>
      sweep(timeline, 5)
        .map((ms) => entry(stateAt(timeline, { ms }), index))
        .filter((e) => e !== undefined)
        .map((e) => `${e.phase}:${e.status}`)
        .filter((s, i, all) => s !== all[i - 1]);
    expect(statuses(1)).toEqual(["running:running", "done:done"]);
    expect(statuses(4)).toEqual(["running:running", "done:error"]);
  });

  test("the body shows once the call resolves", () => {
    const timeline = chat();
    const tool = timeline.steps[1];
    const start = tool?.start ?? 0;
    expect(entry(stateAt(timeline, { ms: start }), 1)?.bodyVisible).toBe(false);
    expect(entry(stateAt(timeline, { ms: (tool?.end ?? 0) - 0.01 }), 1)?.bodyVisible).toBe(true);
  });

  test("output lines reveal after the call resolves, and more shows only once done", () => {
    const timing = { ...presets.terminal, toolMs: () => 900, lineMs: 45, gapMs: 500 };
    const timeline = compile(terminalScript, { timing });
    const start = timeline.steps[4]?.start ?? 0;
    const at = (ms: number) => entry(stateAt(timeline, { ms: start + ms }), 4);
    expect(at(0)).toMatchObject({ phase: "running", visibleLines: [] });
    expect(at(0)?.more).toBeUndefined();
    expect(at(450)?.progress).toBeCloseTo(0.5);
    expect(at(900)).toMatchObject({ phase: "revealing", status: "done" });
    expect(at(945)).toMatchObject({
      phase: "done",
      visibleLines: [{ text: "PASS", tone: "ok" }],
      more: 3,
    });
  });

  test("toolMs gets the step, so recorded times can pace each call", () => {
    const timeline = compile(chatScript, {
      timing: { toolMs: (step) => (step.id === "chart" ? 1800 : 800), gapMs: 0 },
    });
    const run = (i: number) => {
      const s = timeline.steps[i];
      return (s?.end ?? 0) - (s?.start ?? 0);
    };
    expect(run(1)).toBe(800);
    expect(run(4)).toBe(1800);
  });

  test("hiddenTools calls take no time, so they leave no gap", () => {
    const shown = compile(chatScript, { seed: "x" });
    const hidden = compile(chatScript, { seed: "x", hiddenTools: ["search"] });
    const search = hidden.steps[1];
    expect(search?.end).toBe(search?.start);
    expect(hidden.steps[2]?.start).toBe(search?.start);
    expect(hidden.duration).toBeLessThan(shown.duration);
    expect(hidden.turnStarts).toHaveLength(shown.turnStarts.length);
    // The other tool call keeps its time.
    expect((hidden.steps[4]?.end ?? 0) - (hidden.steps[4]?.start ?? 0)).toBeGreaterThan(0);
  });

  test("a hidden call that ends a turn doesn't move the turn's end", () => {
    const script: DemoScript = {
      steps: [
        { kind: "user", text: "Go" },
        { kind: "agent-text", text: "Done." },
        { kind: "tool-call", name: "log" },
      ],
    };
    const shown = compile(script, { hiddenTools: [] });
    const hidden = compile(script, { hiddenTools: ["log"] });
    const agent = compile({ steps: script.steps.slice(0, 2) });
    expect(hidden.turnEnds).toEqual(agent.turnEnds);
    expect(shown.turnEnds[0]).toBeGreaterThan(agent.turnEnds[0] ?? 0);
  });
});

describe("output steps", () => {
  const timeline = compile(terminalScript, { timing: presets.terminal });
  const output = timeline.steps[2];
  const start = output?.start ?? 0;

  test("reveal line by line at 45ms, then hold 500ms", () => {
    expect(entry(stateAt(timeline, { ms: start }), 2)?.visibleLines).toEqual(["ok  pkg/a"]);
    expect(entry(stateAt(timeline, { ms: start + 45 }), 2)?.visibleLines).toHaveLength(2);
    expect((output?.end ?? 0) - start).toBe(90 + 500);
  });

  test("more shows only once the step is done", () => {
    expect(entry(stateAt(timeline, { ms: start + 44 }), 2)).toMatchObject({ phase: "revealing" });
    expect(entry(stateAt(timeline, { ms: start + 44 }), 2)?.more).toBeUndefined();
    expect(entry(stateAt(timeline, { ms: start + 90 }), 2)).toMatchObject({
      phase: "done",
      more: 4,
    });
  });

  test("long output is capped at revealCapMs", () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`);
    const long = compile({ steps: [{ kind: "output", lines }] }, { timing: presets.terminal });
    expect(long.duration).toBe(2400 + 500);
  });
});

describe("agent text", () => {
  test("streams by word mid-beat and in full at the end (openchart mid-beat streaming)", () => {
    const timeline = chat();
    const text = timeline.steps[2];
    const full = "They rose, then fell. Want a chart?";
    const mid = entry(
      stateAt(timeline, { ms: ((text?.start ?? 0) + (text?.end ?? 0)) / 2 - 600 }),
      2,
    );
    expect(mid?.phase).toBe("revealing");
    expect(mid?.visibleText?.length).toBeGreaterThan(0);
    expect(mid?.visibleText?.length).toBeLessThan(full.length);
    expect(full.startsWith(mid?.visibleText ?? "x")).toBe(true);
    expect(entry(stateAt(timeline, { ms: (text?.end ?? 0) - 0.01 }), 2)?.visibleText).toBe(full);
  });

  test("never shows half a word", () => {
    const timeline = chat();
    const full = "They rose, then fell. Want a chart?";
    const units = full.split(/(\s+)/);
    const words = new Set(units.map((_, i) => units.slice(0, i).join("")).concat(full));
    for (const ms of sweep(timeline, 3)) {
      const shown = entry(stateAt(timeline, { ms }), 2)?.visibleText;
      if (shown !== undefined) expect(words.has(shown)).toBe(true);
    }
  });

  test("punctuation pauses longer than mid-sentence words", () => {
    const timing = { ...presets.instant, wordMs: 10, punctuationMs: 100 };
    const timeline = compile({ steps: [{ kind: "agent-text", text: "Hi, you" }] }, { timing });
    // Units: "Hi," " " "you" → 100 + 10 + 10.
    expect(timeline.duration).toBe(120);
    expect(stateAt(timeline, { ms: 99 }).entries[0]?.visibleText).toBe("Hi,");
    expect(stateAt(timeline, { ms: 100 }).entries[0]?.visibleText).toBe("Hi, ");
  });

  test.each([
    ["char", "ab c", 4],
    ["line", "one\ntwo", 2],
  ] as const)("streams by %s", (streamUnit, text, units) => {
    const timing = { ...presets.instant, streamUnit, wordMs: 10, lineMs: 10 };
    const timeline = compile({ steps: [{ kind: "agent-text", text }] }, { timing });
    expect(timeline.duration).toBe(units * 10);
    expect(stateAt(timeline, { ms: 0 }).entries[0]?.progress).toBeGreaterThan(0);
  });

  test("empty text is done once its lead passes", () => {
    const timeline = compile(
      { steps: [{ kind: "agent-text", text: "" }] },
      { timing: presets.instant },
    );
    expect(finalState(timeline).entries[0]).toMatchObject({
      phase: "done",
      progress: 1,
      visibleText: "",
    });
  });
});

describe("other steps", () => {
  test("thinking and pause hold for their ms; a prompt takes no time", () => {
    const timeline = compile(
      {
        steps: [
          { kind: "prompt", text: "$" },
          { kind: "thinking", ms: 100 },
          { kind: "pause", ms: 50 },
          { kind: "thinking" },
        ],
      },
      { timing: { ...presets.instant, thinkingMs: 30 } },
    );
    expect(timeline.steps.map((s) => s.end - s.start)).toEqual([0, 100, 50, 30]);
    const view = stateAt(timeline, { ms: 120 });
    expect(view.entries.map((e) => e.phase)).toEqual(["done", "done", "holding"]);
    expect(stateAt(timeline, { ms: 50 }).entries[1]).toMatchObject({
      phase: "thinking",
      progress: 0.5,
    });
  });

  test("a command types, then holds before the next step", () => {
    const timeline = compile(terminalScript, { timing: presets.terminal });
    const command = timeline.steps[1];
    expect((command?.end ?? 0) - (command?.start ?? 0)).toBe("make test".length * 28 + 500);
    expect(entry(stateAt(timeline, { ms: 50 }), 1)).toMatchObject({
      phase: "typing",
      visibleText: "ma",
    });
  });

  test("terminal typing is capped like rr: 1600ms per command, 2000ms per message", () => {
    const long = "x".repeat(200);
    const timeline = compile(
      {
        steps: [
          { kind: "command", text: long },
          { kind: "user", text: long },
        ],
      },
      { timing: { ...presets.terminal, gapMs: 0, thinkingAfterUser: false, flashMs: 0 } },
    );
    expect(timeline.steps.map((s) => Math.round(s.end - s.start))).toEqual([1600, 2000]);
  });

  test("instant puts everything at 0, done", () => {
    const timeline = compile(chatScript, { timing: presets.instant });
    expect(timeline.duration).toBe(0);
    const view = stateAt(timeline, { ms: 0 });
    expect(view.complete).toBe(true);
    expect(view.entries.every((e) => e.phase === "done")).toBe(true);
  });

  test("an empty script is complete at once", () => {
    const timeline = compile({ steps: [] }, { timing: { startDelay: 0 } });
    expect(stateAt(timeline, { ms: 0 })).toMatchObject({
      entries: [],
      complete: true,
      current: -1,
    });
    expect(timeline.turnStarts).toEqual([]);
  });
});

describe("turns (openchart turn targets)", () => {
  const timeline = chat();
  const { turnStarts, turnEnds } = timeline;
  // turnTarget and nextTarget from openchart's replay.ts, written against the shared API.
  const turnTarget = (i: number, still: boolean) => (still ? turnEnds[i] : turnStarts[i]) ?? 0;
  const nextTarget = (elapsed: number, still: boolean) =>
    (still ? turnEnds : turnStarts).find((m) => m > elapsed) ?? timeline.duration;

  test("each user step starts a turn", () => {
    expect(turnStarts).toEqual([0, timeline.steps[3]?.start]);
    expect(stateAt(timeline, { ms: 0 }).turnStarts).toBe(turnStarts);
  });

  test("a turn's end is before the next turn starts, with every step of it done", () => {
    const view = stateAt(timeline, { ms: turnTarget(0, true) });
    expect(view.entries.map((e) => e.index)).toEqual([0, 1, 2]);
    expect(view.entries.every((e) => e.phase === "done")).toBe(true);
    expect(turnTarget(0, true)).toBeLessThan(turnTarget(1, false));
  });

  test("jumps to a turn start when playing and to its finished state when still", () => {
    expect(turnTarget(1, false)).toBe(turnStarts[1]);
    expect(turnTarget(1, true)).toBe(turnEnds[1]);
  });

  test("Next from the very start skips to turn 2, since turn 1 is already playing", () => {
    expect(nextTarget(0, false)).toBe(turnStarts[1]);
  });

  test("Next during the last turn goes to the end", () => {
    expect(nextTarget((turnStarts[1] ?? 0) + 1, false)).toBe(timeline.duration);
    expect(nextTarget(turnEnds[1] ?? 0, true)).toBe(timeline.duration);
  });

  test("steps before the first user step belong to the first turn", () => {
    const t = compile(terminalScript, { timing: presets.terminal });
    expect(t.turnStarts).toEqual([0, t.steps[3]?.start]);
    expect(t.turnEnds[0]).toBeLessThan(t.steps[3]?.start ?? 0);
  });
});

describe("finalState", () => {
  const timeline = chat();

  test('"all" equals the view at duration', () => {
    expect(finalState(timeline)).toEqual(stateAt(timeline, { ms: timeline.duration }));
    expect(finalState(timeline, { policy: "all" })).toEqual(finalState(timeline));
  });

  test('"last" keeps the last tool call and the last agent text, in script order', () => {
    const view = finalState(timeline, { policy: "last" });
    expect(view.entries.map((e) => e.index)).toEqual([4, 5]);
    expect(view.complete).toBe(true);
    const textFirst = compile({
      steps: [...chatScript.steps.slice(0, 2), ...chatScript.steps.slice(2, 3)] as Step[],
    });
    expect(finalState(textFirst, { policy: "last" }).entries.map((e) => e.index)).toEqual([1, 2]);
  });

  test('"last" on a commands-only script keeps the last command and output', () => {
    const commands = compile({
      steps: [
        { kind: "command", text: "make" },
        { kind: "output", lines: ["built"] },
        { kind: "command", text: "make test" },
        { kind: "output", lines: ["ok"] },
      ],
    });
    const view = finalState(commands, { policy: "last" });
    expect(view.entries.map((e) => e.index)).toEqual([2, 3]);
  });

  test("a function policy picks indices", () => {
    const view = finalState(timeline, { policy: (steps) => [steps.length - 1, 0, 0] });
    expect(view.entries.map((e) => e.index)).toEqual([0, 5]);
  });

  test.each<[string, unknown, string]>([
    ["an out-of-range index", { policy: () => [99] }, "policy"],
    ["a non-array result", { policy: () => "0" }, "policy"],
    ["an unknown policy", { policy: "first" }, "policy"],
    ["an unknown option", { polcy: "all" }, "polcy"],
  ])("rejects %s", (_label, options, field) => {
    expect(failure(() => finalState(timeline, options as never))).toEqual({
      code: "invalid_option",
      field,
    });
  });
});

describe("options", () => {
  test.each<[string, unknown, string]>([
    ["an unknown timing key", { timing: { typeMs: 1 } }, "timing.typeMs"],
    ["a negative span", { timing: { gapMs: -1 } }, "timing.gapMs"],
    ["an inverted range", { timing: { gapMs: [9, 1] } }, "timing.gapMs"],
    ["a bad stream unit", { timing: { streamUnit: "token" } }, "timing.streamUnit"],
    ["a non-function toolMs", { timing: { toolMs: 5 } }, "timing.toolMs"],
    ["a bad typeMsPerChar", { timing: { typeMsPerChar: "fast" } }, "timing.typeMsPerChar"],
    ["thinkingAfterUser true", { timing: { thinkingAfterUser: true } }, "timing.thinkingAfterUser"],
    ["a non-object timing", { timing: 3 }, "timing"],
    ["a non-string seed", { seed: 3 }, "seed"],
    ["a non-boolean composer", { composer: "yes" }, "composer"],
    ["a non-array hiddenTools", { hiddenTools: "search" }, "hiddenTools"],
    ["a non-string hidden tool", { hiddenTools: [1] }, "hiddenTools"],
    ["an unknown option", { speed: 2 }, "speed"],
    ["a toolMs that returns NaN", { timing: { toolMs: () => Number.NaN } }, "timing.toolMs"],
    [
      "a typeMsPerChar that returns -1",
      { timing: { typeMsPerChar: () => -1 } },
      "timing.typeMsPerChar",
    ],
  ])("compile rejects %s", (_label, options, field) => {
    expect(failure(() => compile(chatScript, options as never))).toEqual({
      code: "invalid_option",
      field,
    });
  });

  test("compile validates the script", () => {
    expect(failure(() => compile({ steps: [{ kind: "user" }] } as never))).toEqual({
      code: "invalid_script",
      field: "steps[0].text",
    });
  });

  test("stateAt rejects a bad position or a timeline it didn't compile", () => {
    const timeline = chat();
    expect(failure(() => stateAt(timeline, { ms: Number.NaN }))).toEqual({
      code: "invalid_option",
      field: "position.ms",
    });
    expect(failure(() => stateAt(timeline, { click: "1" } as never))).toEqual({
      code: "invalid_option",
      field: "position.click",
    });
    for (const position of [null, undefined, 3]) {
      expect(failure(() => stateAt(timeline, position as never))).toEqual({
        code: "invalid_option",
        field: "position",
      });
    }
    expect(failure(() => stateAt({ ...timeline }, { ms: 0 }))).toEqual({
      code: "invalid_option",
      field: "timeline",
    });
  });

  test("presets are frozen", () => {
    expect(Object.isFrozen(presets)).toBe(true);
    expect(Object.isFrozen(presets.chat)).toBe(true);
  });

  test("the chat preset pauses 400 to 800ms before the first step", () => {
    for (const seed of ["a", "b", "c", "d"]) {
      const start = compile(chatScript, { seed }).steps[0]?.start ?? 0;
      expect(start).toBeGreaterThanOrEqual(400);
      expect(start).toBeLessThanOrEqual(800);
    }
  });

  test("clickCount on a time-paced script is 0", () => {
    expect(clickCount(chatScript)).toBe(0);
    expect(chat().clickCount).toBe(0);
  });
});
