import { unknownOption } from "../internal/options.ts";
import { LibraryError } from "../script/errors.ts";
import type { Line, Step, ToolStatus } from "../script/types.ts";
import { type Timeline, type Track, tracksOf } from "./compile.ts";

/**
 * Where a step is in its life. A user step goes typing, submitted (while the composer flashes),
 * thinking (when thinking follows it), done. A tool call goes running, revealing (while its
 * output lines arrive), done. Agent text and output go revealing, done; a pause holds.
 */
export type Phase =
  | "typing"
  | "submitted"
  | "thinking"
  | "revealing"
  | "holding"
  | "running"
  | "done";

/** One visible step. */
export interface DemoEntry<TData = unknown> {
  /** The step's `id` or index. Use it as the render key; never the text, which can repeat. */
  readonly key: string;
  readonly index: number;
  readonly step: Step<TData>;
  readonly phase: Phase;
  /** 0 to 1 through the current phase's reveal. 1 once done. */
  readonly progress: number;
  /** User, command and agent-text steps: the text shown so far. */
  readonly visibleText?: string;
  /** Output steps and tool calls with output: the lines shown so far. */
  readonly visibleLines?: readonly Line[];
  /** Tool calls: "running" until resolved, then the step's `status` or "done". */
  readonly status?: ToolStatus;
  /** Tool calls with a body: whether the body is shown yet. */
  readonly bodyVisible?: boolean;
  /** The step's `more` count, present only once the step is done. */
  readonly more?: number;
}

export interface DemoView<TData = unknown> {
  /** Visible steps in script order. Only grows as the position moves forward. */
  readonly entries: readonly DemoEntry<TData>[];
  /** What the composer holds, or null when no user step types into it. */
  readonly composer: { readonly text: string; readonly flash: boolean } | null;
  /** Index of the latest step that has started, or -1 before the first. */
  readonly current: number;
  readonly complete: boolean;
  /** The position in ms. In click mode, 0 until complete and `duration` once complete. */
  readonly elapsed: number;
  readonly duration: number;
  readonly turnStarts: readonly number[];
  readonly turnEnds: readonly number[];
}

/** A position: ms from the start, or a click index for click-paced playback. */
export type Position = { readonly ms: number } | { readonly click: number };

/** Which steps `finalState` keeps: every step, the last agent text and tool call, or a pick. */
export type FinalPolicy = "all" | "last" | ((steps: readonly Step<unknown>[]) => number[]);

export interface FinalStateOptions {
  readonly policy?: FinalPolicy;
}

const countAt = (times: readonly number[], t: number): number => {
  let n = 0;
  while (n < times.length && (times[n] ?? 0) <= t) n++;
  return n;
};

const fraction = (t: number, from: number, to: number): number =>
  to <= from ? 1 : Math.min(1, Math.max(0, (t - from) / (to - from)));

type Mutable<TData> = { -readonly [K in keyof DemoEntry<TData>]: DemoEntry<TData>[K] };

function textEntry<TData>(entry: Mutable<TData>, track: Track<TData>, t: number): void {
  const text = track.units.join("");
  const shown = track.units.slice(0, countAt(track.unitTimes, t)).join("");
  entry.visibleText = shown;
  entry.progress = text.length === 0 ? 1 : shown.length / text.length;
}

function userPhase<TData>(entry: Mutable<TData>, track: Track<TData>, t: number): void {
  if (t < track.submit) {
    entry.phase = "typing";
    textEntry(entry, track, t);
    return;
  }
  entry.visibleText = track.units.join("");
  if (t < track.flashEnd) entry.phase = "submitted";
  else if (t < track.thinkingEnd) {
    entry.phase = "thinking";
    entry.progress = fraction(t, track.flashEnd, track.thinkingEnd);
  } else entry.phase = "done";
}

function linesEntry<TData>(entry: Mutable<TData>, track: Track<TData>, t: number): void {
  entry.visibleLines = track.lines.slice(0, countAt(track.lineTimes, t));
  if (t < track.settle) {
    entry.phase = "revealing";
    entry.progress = track.lines.length === 0 ? 1 : entry.visibleLines.length / track.lines.length;
  }
}

function toolEntry<TData>(
  entry: Mutable<TData>,
  track: Track<TData>,
  step: Extract<Step<TData>, { kind: "tool-call" }>,
  t: number,
): void {
  const running = t < track.runEnd;
  if (step.body) entry.bodyVisible = !running;
  if (step.output) linesEntry(entry, track, t);
  if (running) {
    entry.phase = "running";
    entry.progress = fraction(t, track.start, track.runEnd);
  }
  entry.status = running ? "running" : (step.status ?? "done");
}

/** The entry for a started step at `t` ms. */
function timeEntry<TData>(track: Track<TData>, t: number): DemoEntry<TData> {
  const { key, index, step } = track;
  const entry: Mutable<TData> = { key, index, step, phase: "done", progress: 1 };
  switch (step.kind) {
    case "user":
      userPhase(entry, track, t);
      break;
    case "command":
    case "agent-text":
      textEntry(entry, track, t);
      if (t < track.settle) entry.phase = step.kind === "command" ? "typing" : "revealing";
      break;
    case "thinking":
    case "pause":
      if (t < track.settle) {
        entry.phase = step.kind === "pause" ? "holding" : "thinking";
        entry.progress = fraction(t, track.start, track.settle);
      }
      break;
    case "output":
      linesEntry(entry, track, t);
      break;
    case "tool-call":
      toolEntry(entry, track, step, t);
      break;
    case "prompt":
      break;
  }
  return withMore(entry, step);
}

function withMore<TData>(entry: Mutable<TData>, step: Step<TData>): DemoEntry<TData> {
  if (entry.phase === "done" && (step.kind === "output" || step.kind === "tool-call")) {
    if (step.more !== undefined) entry.more = step.more;
  }
  return entry;
}

function clickTool<TData>(
  entry: Mutable<TData>,
  track: Track<TData>,
  step: Extract<Step<TData>, { kind: "tool-call" }>,
  click: number,
): void {
  const bodyShown = click >= track.bodyAt;
  const outputShown = click >= track.outputAt;
  if (step.body) entry.bodyVisible = bodyShown;
  if (step.output) entry.visibleLines = outputShown ? step.output : [];
  const pending = (step.body !== undefined && !bodyShown) || (step.output && !outputShown);
  if (pending) {
    entry.phase = "running";
    entry.progress = 0;
  }
  entry.status = pending ? "running" : (step.status ?? "done");
}

/** The entry for a step revealed by click `click`: done, unless a body or output is pending. */
function clickEntry<TData>(track: Track<TData>, click: number): DemoEntry<TData> {
  const { key, index, step } = track;
  const entry: Mutable<TData> = { key, index, step, phase: "done", progress: 1 };
  if (step.kind === "user" || step.kind === "command" || step.kind === "agent-text") {
    entry.visibleText = track.units.join("");
  }
  if (step.kind === "output") entry.visibleLines = step.lines;
  if (step.kind === "tool-call") clickTool(entry, track, step, click);
  return withMore(entry, step);
}

function lastIndex(entries: readonly DemoEntry<unknown>[]): number {
  return entries.at(-1)?.index ?? -1;
}

function timeView<TData>(timeline: Timeline<TData>, ms: number): DemoView<TData> {
  const { tracks, composer } = tracksOf(timeline);
  const t = Math.min(Math.max(ms, 0), timeline.duration);
  const entries = tracks.filter((track) => track.appear <= t).map((track) => timeEntry(track, t));
  let text = "";
  let flash = false;
  for (const track of tracks) {
    if (!track.composer || track.start > t) continue;
    if (t < track.submit) text = track.units.slice(0, countAt(track.unitTimes, t)).join("");
    else if (t < track.flashEnd) flash = true;
  }
  const started = tracks.filter((track) => track.start <= t);
  return {
    entries,
    composer: composer ? { text, flash } : null,
    current: started.at(-1)?.index ?? -1,
    complete: t >= timeline.duration,
    elapsed: t,
    duration: timeline.duration,
    turnStarts: timeline.turnStarts,
    turnEnds: timeline.turnEnds,
  };
}

function clickView<TData>(timeline: Timeline<TData>, click: number): DemoView<TData> {
  const { tracks, composer } = tracksOf(timeline);
  const entries = tracks
    .filter((track) => track.at <= click)
    .map((track) => clickEntry(track, click));
  const complete = click >= timeline.clickCount;
  return {
    entries,
    composer: composer ? { text: "", flash: false } : null,
    current: lastIndex(entries),
    complete,
    elapsed: complete ? timeline.duration : 0,
    duration: timeline.duration,
    turnStarts: timeline.turnStarts,
    turnEnds: timeline.turnEnds,
  };
}

/**
 * What is on screen at a position. Pure: the same timeline and position always give the same
 * view, so the server render, the first client render, tests and screenshots agree. `{ ms }` is
 * clamped to `[0, duration]`. `{ click }` shows every step whose `at` is at or below it.
 */
export function stateAt<TData>(timeline: Timeline<TData>, position: Position): DemoView<TData> {
  if ("ms" in position) {
    if (typeof position.ms !== "number" || Number.isNaN(position.ms)) {
      throw new LibraryError("invalid_option", { field: "position.ms" });
    }
    return timeView(timeline, position.ms);
  }
  if (typeof position?.click !== "number" || Number.isNaN(position.click)) {
    throw new LibraryError("invalid_option", { field: "position.click" });
  }
  return clickView(timeline, position.click);
}

function pick(policy: FinalPolicy, steps: readonly Step<unknown>[]): Set<number> {
  if (policy === "last") {
    const last = (kind: Step["kind"]): number => steps.findLastIndex((s) => s.kind === kind);
    return new Set([last("agent-text"), last("tool-call")]);
  }
  if (typeof policy !== "function") throw new LibraryError("invalid_option", { field: "policy" });
  const picked = policy(steps);
  const valid =
    Array.isArray(picked) && picked.every((i) => Number.isInteger(i) && i >= 0 && i < steps.length);
  if (!valid) throw new LibraryError("invalid_option", { field: "policy" });
  return new Set(picked);
}

/**
 * The finished view, for SSR, no-JS and reduced motion. "all" (the default) equals
 * `stateAt(timeline, { ms: duration })`. "last" keeps only the last agent-text and the last
 * tool-call, in script order. A function gets the steps and returns the indices to keep.
 */
export function finalState<TData>(
  timeline: Timeline<TData>,
  options: FinalStateOptions = {},
): DemoView<TData> {
  const badOption = unknownOption(options, ["policy"]);
  if (badOption) throw new LibraryError("invalid_option", { field: badOption });
  const { policy = "all" } = options;
  const view = timeView(timeline, timeline.duration);
  if (policy === "all") return view;
  const keep = pick(policy, timeline.script.steps as readonly Step<unknown>[]);
  return { ...view, entries: view.entries.filter((entry) => keep.has(entry.index)) };
}
