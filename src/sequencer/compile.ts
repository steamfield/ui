import { unknownOption } from "../internal/options.ts";
import { LibraryError } from "../script/errors.ts";
import type { DemoScript, Line, Step } from "../script/types.ts";
import { validateScript } from "../script/validate.ts";
import { seededRandom } from "./random.ts";
import { checkedMs, resolveTiming, type Span, type Timing } from "./timing.ts";

export interface CompileOptions<TData = unknown> {
  /** Fields to change from the `chat` preset, such as `presets.terminal` or `{ gapMs: 0 }`. */
  readonly timing?: Partial<Timing<TData>>;
  /** Seeds the jitter. Defaults to the script's `id`, then "". */
  readonly seed?: string;
  /** Whether user steps without their own `composer` flag type into the composer. Default false. */
  readonly composer?: boolean;
}

/** When one step plays, in ms from the start, and the click it reveals at. */
export interface TimedStep {
  /** The step's `id` when it has one, else its index. Stable across replays and edits to text. */
  readonly key: string;
  readonly index: number;
  readonly start: number;
  /** When the next step starts: the step's content plus its trailing gap or read pause. */
  readonly end: number;
  /** The click index it reveals at, after inheriting from the step before. */
  readonly at: number;
}

/** A compiled script. Pass it to `stateAt` and `finalState`; it never changes after `compile`. */
export interface Timeline<TData = unknown> {
  readonly script: DemoScript<TData>;
  readonly steps: readonly TimedStep[];
  readonly duration: number;
  /** The click at which everything is shown. */
  readonly clickCount: number;
  /**
   * When each turn starts. Every user step after the first step starts a turn; steps before the
   * first user step belong to the first turn, which starts at 0.
   */
  readonly turnStarts: readonly number[];
  /** When each turn's last step has finished showing, before its trailing pause. */
  readonly turnEnds: readonly number[];
}

/** Everything `stateAt` needs about one step. Private: only the summary in `steps` is public. */
export interface Track<TData = unknown> extends TimedStep {
  readonly step: Step<TData>;
  /** When the entry appears in the transcript. Later than `start` for a composer user step. */
  readonly appear: number;
  /** When the step's content is fully shown. */
  readonly settle: number;
  /** Typed or streamed text, in reveal units, each with the time it appears. */
  readonly units: readonly string[];
  readonly unitTimes: readonly number[];
  /** Output lines, each with the time it appears. */
  readonly lines: readonly Line[];
  readonly lineTimes: readonly number[];
  /** User steps: submit time, end of the submit flash, end of thinking. */
  readonly submit: number;
  readonly flashEnd: number;
  readonly thinkingEnd: number;
  /** Tool calls: when the call resolves. */
  readonly runEnd: number;
  readonly composer: boolean;
  readonly bodyAt: number;
  readonly outputAt: number;
}

export interface Compiled<TData = unknown> {
  readonly tracks: readonly Track<TData>[];
  readonly composer: boolean;
}

const compiled = new WeakMap<object, Compiled<unknown>>();

/** The private half of a timeline from `compile`. */
export function tracksOf<TData>(timeline: Timeline<TData>): Compiled<TData> {
  const found = compiled.get(timeline);
  if (!found) throw new LibraryError("invalid_option", { field: "timeline" });
  return found as unknown as Compiled<TData>;
}

const PUNCTUATION = /[.!?,;:]$/;

function streamUnits(text: string, unit: Timing["streamUnit"]): string[] {
  if (unit === "char") return Array.from(text);
  if (unit === "line") return text.split(/(?<=\n)/).filter(Boolean);
  return text.split(/(\s+)/).filter(Boolean);
}

type Draft<TData> = { -readonly [K in keyof Track<TData>]: Track<TData>[K] };

class Builder<TData> {
  readonly timing: Timing<TData>;
  private readonly random: () => number;
  t = 0;

  constructor(timing: Timing<TData>, seed: string) {
    this.timing = timing;
    this.random = seededRandom(seed);
    this.t = this.span(timing.startDelay);
  }

  span(value: Span): number {
    if (typeof value === "number") return value;
    const [min, max] = value;
    return min + this.random() * (max - min);
  }

  jitter(): number {
    const { jitter } = this.timing;
    return jitter === 0 ? 0 : (this.random() * 2 - 1) * jitter;
  }

  /** Units appear one after another, each followed by its delay (set, then sleep). */
  reveal(units: readonly string[], delay: (unit: string) => number): number[] {
    return units.map((unit) => {
      const at = this.t;
      this.t += delay(unit);
      return at;
    });
  }

  revealLines(lines: readonly Line[]): number[] {
    const { lineMs, revealCapMs } = this.timing;
    const per = lines.length === 0 ? 0 : Math.min(lineMs, revealCapMs / lines.length);
    return this.reveal(
      lines.map(() => ""),
      () => per,
    );
  }
}

function typeDelay<TData>(b: Builder<TData>, step: Extract<Step, { kind: "user" | "command" }>) {
  const { typeMsPerChar } = b.timing;
  const base = checkedMs(
    typeof typeMsPerChar === "number" ? typeMsPerChar : typeMsPerChar(step),
    "typeMsPerChar",
  );
  return (): number => Math.max(0, base + b.jitter());
}

function emptyTrack<TData>(step: Step<TData>, index: number, start: number): Draft<TData> {
  // Prefixed so an id such as "2" can't collide with step 2's index key.
  const key = step.kind === "tool-call" && step.id !== undefined ? `id:${step.id}` : String(index);
  return {
    key,
    index,
    step,
    start,
    end: start,
    at: 0,
    appear: start,
    settle: start,
    units: [],
    unitTimes: [],
    lines: [],
    lineTimes: [],
    submit: start,
    flashEnd: start,
    thinkingEnd: start,
    runEnd: start,
    composer: false,
    bodyAt: 0,
    outputAt: 0,
  };
}

function buildUser<TData>(
  b: Builder<TData>,
  track: Draft<TData>,
  step: Extract<Step<TData>, { kind: "user" }>,
  next: Step<TData> | undefined,
): void {
  const pre = step.preTyped ?? "";
  const units: string[] = [];
  const times: number[] = [];
  if (pre) {
    units.push(pre);
    times.push(b.t);
    b.t += b.span(b.timing.preTypedHoldMs);
  }
  const chars = Array.from(step.text.slice(pre.length));
  const delay = typeDelay(b, step);
  times.push(...b.reveal(chars, delay));
  units.push(...chars);
  b.t += b.span(b.timing.submitHoldMs);
  track.units = units;
  track.unitTimes = times;
  track.submit = b.t;
  track.flashEnd = b.t + b.timing.flashMs;
  const { thinkingAfterUser } = b.timing;
  const think = thinkingAfterUser !== false && next !== undefined && next.kind !== "thinking";
  track.thinkingEnd = b.t + (think ? b.span(thinkingAfterUser) : 0);
  if (track.composer) track.appear = track.submit;
  b.t = Math.max(track.flashEnd, track.thinkingEnd);
  track.settle = b.t;
}

function buildAgentText<TData>(b: Builder<TData>, track: Draft<TData>, text: string): void {
  const { streamUnit, streamLeadMs, lineMs, wordMs, punctuationMs, readMs } = b.timing;
  b.t += streamLeadMs;
  track.units = streamUnits(text, streamUnit);
  track.unitTimes = b.reveal(track.units, (unit) => {
    if (streamUnit === "line") return lineMs;
    return b.span(PUNCTUATION.test(unit) ? punctuationMs : wordMs);
  });
  track.settle = b.t;
  b.t += b.span(readMs);
}

function buildToolCall<TData>(
  b: Builder<TData>,
  track: Draft<TData>,
  step: Extract<Step<TData>, { kind: "tool-call" }>,
): void {
  b.t += checkedMs(b.timing.toolMs(step), "toolMs");
  track.runEnd = b.t;
  track.lines = step.output ?? [];
  track.lineTimes = b.revealLines(track.lines);
  track.settle = b.t;
  b.t += b.span(b.timing.gapMs);
}

function buildStep<TData>(
  b: Builder<TData>,
  track: Draft<TData>,
  next: Step<TData> | undefined,
): void {
  const { step } = track;
  switch (step.kind) {
    case "user":
      buildUser(b, track, step, next);
      return;
    case "command":
      track.units = Array.from(step.text);
      track.unitTimes = b.reveal(track.units, typeDelay(b, step));
      track.settle = b.t;
      b.t += b.span(b.timing.gapMs);
      return;
    case "agent-text":
      buildAgentText(b, track, step.text);
      return;
    case "thinking":
    case "pause":
      b.t += step.ms ?? b.span(b.timing.thinkingMs);
      track.settle = b.t;
      return;
    case "output":
      track.lines = step.lines;
      track.lineTimes = b.revealLines(step.lines);
      track.settle = b.t;
      b.t += b.span(b.timing.gapMs);
      return;
    case "prompt":
      return;
    case "tool-call":
      buildToolCall(b, track, step);
      return;
  }
}

function turns(tracks: readonly Track[]): { starts: number[]; ends: number[] } {
  const starts: number[] = [];
  const ends: number[] = [];
  for (const track of tracks) {
    // The first turn starts at 0, so jumping to it replays the start delay too.
    if (starts.length === 0) starts.push(0);
    else if (track.step.kind === "user") starts.push(track.start);
    ends[starts.length - 1] = track.settle;
  }
  return { starts, ends };
}

/** The click each step reveals at: its own `at`, else the previous step's, else 0. */
export function effectiveAts(steps: readonly Step<unknown>[]): number[] {
  let at = 0;
  return steps.map((step) => {
    at = step.at ?? at;
    return at;
  });
}

function maxClick(tracks: readonly Pick<Track, "at" | "bodyAt" | "outputAt">[]): number {
  return tracks.reduce((max, t) => Math.max(max, t.at, t.bodyAt, t.outputAt), 0);
}

/** Sub-gates of a step: its body and output reveal at their own `at`, never before the step. */
function gates(step: Step<unknown>, at: number): { bodyAt: number; outputAt: number } {
  if (step.kind !== "tool-call") return { bodyAt: at, outputAt: at };
  return {
    bodyAt: Math.max(at, step.body?.at ?? at),
    outputAt: Math.max(at, step.outputAt ?? at),
  };
}

/**
 * How many clicks a click-paced script needs: the highest `at` on any step, body or output. At
 * that click everything is shown. Validates the script like `compile`.
 */
export function clickCount(script: DemoScript<unknown>): number {
  validateScript(script);
  const ats = effectiveAts(script.steps);
  return maxClick(
    script.steps.map((step, i) => ({ at: ats[i] ?? 0, ...gates(step, ats[i] ?? 0) })),
  );
}

/**
 * Lays a script out in time. Validates the script (`invalid_script`, `unsupported_step`) and the
 * options (`invalid_option`). Pure: the same script, options and seed give the same timeline.
 */
export function compile<TData>(
  script: DemoScript<TData>,
  options: CompileOptions<TData> = {},
): Timeline<TData> {
  validateScript(script);
  const badOption = unknownOption(options, ["timing", "seed", "composer"]);
  if (badOption) throw new LibraryError("invalid_option", { field: badOption });
  const { seed = script.id ?? "", composer = false } = options;
  if (typeof seed !== "string") throw new LibraryError("invalid_option", { field: "seed" });
  if (typeof composer !== "boolean") {
    throw new LibraryError("invalid_option", { field: "composer" });
  }
  const b = new Builder<TData>(resolveTiming<TData>(options.timing), seed);
  const ats = effectiveAts(script.steps);
  const tracks = script.steps.map((step, index) => {
    const track = emptyTrack(step, index, b.t);
    track.at = ats[index] ?? 0;
    Object.assign(track, gates(step, track.at));
    track.composer = step.kind === "user" && (step.composer ?? composer);
    buildStep(b, track, script.steps[index + 1]);
    track.end = b.t;
    return track as Track<TData>;
  });
  const { starts, ends } = turns(tracks);
  const timeline: Timeline<TData> = Object.freeze({
    script,
    steps: Object.freeze(
      tracks.map(({ key, index, start, end, at }) => Object.freeze({ key, index, start, end, at })),
    ),
    duration: b.t,
    clickCount: maxClick(tracks),
    turnStarts: Object.freeze(starts),
    turnEnds: Object.freeze(ends),
  });
  const detail: Compiled<TData> = { tracks, composer: tracks.some((t) => t.composer) };
  compiled.set(timeline, detail as unknown as Compiled<unknown>);
  return timeline;
}
