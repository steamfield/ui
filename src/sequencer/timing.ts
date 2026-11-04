import { LibraryError } from "../script/errors.ts";
import type { Step } from "../script/types.ts";

/**
 * A duration in ms: a fixed value, or a `[min, max]` range sampled from the seeded PRNG, so the
 * same seed always lands on the same value.
 */
export type Span = number | readonly [min: number, max: number];

/** A step that types out character by character. */
export type TypedStep = Extract<Step, { kind: "user" | "command" }>;
/** A tool-call step. */
export type ToolCallStep<TData = unknown> = Extract<Step<TData>, { kind: "tool-call" }>;

/** How long each phase of each step takes. Every preset fills every field. */
export interface Timing<TData = unknown> {
  /** Before the first step. */
  readonly startDelay: Span;
  /**
   * Base ms per typed character of user and command steps. A number gives way to a step's
   * `typingMs`; a function gets the step (`typingMs` included) and always decides.
   */
  readonly typeMsPerChar: number | ((step: TypedStep) => number);
  /** ± ms added to each typed character, from the seeded PRNG. */
  readonly jitter: number;
  /** How long a user step's `preTyped` prefix sits in the composer before typing resumes. */
  readonly preTypedHoldMs: Span;
  /** After a user step is typed, before it is submitted. */
  readonly submitHoldMs: Span;
  /** How long the composer's submit flash lasts. */
  readonly flashMs: number;
  /** Thinking after a user step, when another (non-thinking) step follows. `false` for none. */
  readonly thinkingAfterUser: Span | false;
  /** A `thinking` step without its own `ms`. */
  readonly thinkingMs: Span;
  /** What agent text streams by. Words stream as words and the whitespace between them. */
  readonly streamUnit: "char" | "word" | "line";
  /** After an agent-text bubble appears, before its first unit. */
  readonly streamLeadMs: number;
  /** After each streamed unit. Lines use `lineMs` instead. */
  readonly wordMs: Span;
  /** After a streamed unit that ends in `. ! ? , ; :`. */
  readonly punctuationMs: Span;
  /** After agent text finishes, while the reader reads it. */
  readonly readMs: Span;
  /** Per output line, and per streamed line when `streamUnit` is "line". */
  readonly lineMs: number;
  /** Cap on revealing one block of output lines; long blocks reveal faster. */
  readonly revealCapMs: number;
  /** How long a tool call runs before it resolves. */
  readonly toolMs: (step: ToolCallStep<TData>) => number;
  /** After a tool call, command or output block. */
  readonly gapMs: Span;
}

const flatToolMs = (): number => 1000;

/**
 * The chat preset reproduces the OpenData chat demo: a 400–800ms start, per-character typing with
 * ±9ms jitter, a 200–400ms hold on pre-typed text, 350–700ms before submit, a 300ms submit flash,
 * 800–1400ms of thinking after user turns, word streaming at 20–55ms (60–140ms after
 * punctuation) after an 80ms lead, a 1000–1600ms read pause, and a 500–900ms gap after tools.
 * Its `toolMs` is a flat 1000ms; pass `(step) => clamp(timeMs + 200, 800, 1800)` to use recorded
 * tool times.
 */
const chat: Timing = Object.freeze({
  startDelay: [400, 800],
  typeMsPerChar: 25,
  jitter: 9,
  preTypedHoldMs: [200, 400],
  submitHoldMs: [350, 700],
  flashMs: 300,
  thinkingAfterUser: [800, 1400],
  thinkingMs: [800, 1400],
  streamUnit: "word",
  streamLeadMs: 80,
  wordMs: [20, 55],
  punctuationMs: [60, 140],
  readMs: [1000, 1600],
  lineMs: 45,
  revealCapMs: 2400,
  toolMs: flatToolMs,
  gapMs: [500, 900],
} as const);

/**
 * The terminal preset reproduces rr's terminal player: 28ms per character with typing capped at
 * 1600ms for a command and 2000ms for a user message, about 55ms per word, 45ms per output line
 * capped at 2400ms, 900ms per tool call and 500ms after each step. No jitter.
 */
const terminal: Timing = Object.freeze({
  startDelay: 0,
  typeMsPerChar: (step: TypedStep) =>
    Math.min(28, (step.kind === "command" ? 1600 : 2000) / Math.max(1, step.text.length)),
  jitter: 0,
  preTypedHoldMs: 0,
  submitHoldMs: 0,
  flashMs: 300,
  thinkingAfterUser: 500,
  thinkingMs: 700,
  streamUnit: "word",
  streamLeadMs: 0,
  // A word and the space after it are two units, so 27.5ms each is rr's 55ms per word.
  wordMs: 27.5,
  punctuationMs: 27.5,
  readMs: 500,
  lineMs: 45,
  revealCapMs: 2400,
  toolMs: () => 900,
  gapMs: 500,
} as const);

/** Every phase takes 0ms: the whole script is done at 0. For reduced motion and snapshots. */
const instant: Timing = Object.freeze({
  startDelay: 0,
  typeMsPerChar: 0,
  jitter: 0,
  preTypedHoldMs: 0,
  submitHoldMs: 0,
  flashMs: 0,
  thinkingAfterUser: false,
  thinkingMs: 0,
  streamUnit: "word",
  streamLeadMs: 0,
  wordMs: 0,
  punctuationMs: 0,
  readMs: 0,
  lineMs: 0,
  revealCapMs: 0,
  toolMs: () => 0,
  gapMs: 0,
} as const);

export interface TimingPresets {
  readonly chat: Timing;
  readonly terminal: Timing;
  readonly instant: Timing;
}

/** Timing presets. `compile` starts from `chat` and applies the `timing` option over it. */
export const presets: TimingPresets = Object.freeze({ chat, terminal, instant });

const isMs = (value: unknown): boolean =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const isSpan = (value: unknown): boolean =>
  isMs(value) ||
  (Array.isArray(value) &&
    value.length === 2 &&
    isMs(value[0]) &&
    isMs(value[1]) &&
    value[0] <= value[1]);

const checks: Record<keyof Timing, (value: unknown) => boolean> = {
  startDelay: isSpan,
  typeMsPerChar: (v) => isMs(v) || typeof v === "function",
  jitter: isMs,
  preTypedHoldMs: isSpan,
  submitHoldMs: isSpan,
  flashMs: isMs,
  thinkingAfterUser: (v) => v === false || isSpan(v),
  thinkingMs: isSpan,
  streamUnit: (v) => v === "char" || v === "word" || v === "line",
  streamLeadMs: isMs,
  wordMs: isSpan,
  punctuationMs: isSpan,
  readMs: isSpan,
  lineMs: isMs,
  revealCapMs: isMs,
  toolMs: (v) => typeof v === "function",
  gapMs: isSpan,
};

/** `chat` with `overrides` applied, every field checked. An unknown key is `invalid_option`. */
export function resolveTiming<TData>(overrides: unknown): Timing<TData> {
  if (overrides === undefined) return chat;
  if (typeof overrides !== "object" || overrides === null) {
    throw new LibraryError("invalid_option", { field: "timing" });
  }
  for (const [key, value] of Object.entries(overrides)) {
    const check = checks[key as keyof Timing] as ((value: unknown) => boolean) | undefined;
    if (!Object.hasOwn(checks, key) || !check?.(value)) {
      throw new LibraryError("invalid_option", { field: `timing.${key}` });
    }
  }
  return { ...chat, ...overrides } as Timing<TData>;
}

/** A duration from a hook (`typeMsPerChar`, `toolMs`), checked so a bad return can't poison time. */
export function checkedMs(value: number, field: string): number {
  if (!isMs(value)) throw new LibraryError("invalid_option", { field: `timing.${field}` });
  return value;
}
