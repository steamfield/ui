import { Step } from "../script/types.js";
/**
 * A duration in ms: a fixed value, or a `[min, max]` range sampled from the seeded PRNG, so the
 * same seed always lands on the same value.
 */
export type Span = number | readonly [min: number, max: number];
/** A step that types out character by character. */
export type TypedStep = Extract<Step, {
  kind: "user" | "command";
}>;
/** A tool-call step. */
export type ToolCallStep<TData = unknown> = Extract<Step<TData>, {
  kind: "tool-call";
}>;
/** How long each phase of each step takes. Every preset fills every field. */
export interface Timing<TData = unknown> {
  /** Before the first step. */
  readonly startDelay: Span;
  /**
   * Base ms per typed character of user and command steps. A number gives way to a step's
   * `typingMs`; a function gets the step (`typingMs` included) and always decides. `jitter`
   * still applies per character, so a `typingMs` total is approximate.
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
  /**
   * Whether that thinking starts at submit, alongside the composer flash, rather than once the
   * flash ends. Its length counts from submit either way. Default false; optional, so a
   * hand-written `Timing` from before it existed still type-checks.
   */
  readonly thinkingOnSubmit?: boolean;
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
export interface TimingPresets {
  readonly chat: Timing;
  readonly terminal: Timing;
  readonly instant: Timing;
}
/** Timing presets. `compile` starts from `chat` and applies the `timing` option over it. */
export declare const presets: TimingPresets;