import { Line, Step, ToolStatus } from "../script/types.js";
import { Timeline } from "./compile.js";
/**
 * Where a step is in its life. A user step goes typing, submitted (while the composer flashes),
 * thinking (when thinking follows it), done. A tool call goes running, revealing (while its
 * output lines arrive), done. Agent text and output go revealing, done; a pause holds.
 */
export type Phase = "typing" | "submitted" | "thinking" | "revealing" | "holding" | "running" | "done";
/** One visible step. */
export interface DemoEntry<TData = unknown> {
  /**
   * `id:<id>` for a tool call with an `id`, else the step's index ("2"), so the two never collide.
   * Use it as the render key; never the text, which can repeat.
   */
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
  /**
   * Visible steps in script order. Only grows as the position moves forward. A `finalState` with
   * `order: "listed"` is the one exception: its entries follow the pick.
   */
  readonly entries: readonly DemoEntry<TData>[];
  /** What the composer holds, or null when no user step types into it. */
  readonly composer: {
    readonly text: string;
    readonly flash: boolean;
  } | null;
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
export type Position = {
  readonly ms: number;
} | {
  readonly click: number;
};
/** Picks the indices of the steps `finalState` keeps. */
export type FinalPick = (steps: readonly Step<unknown>[]) => number[];
/**
 * Which steps `finalState` keeps: every step, the last agent text and tool call (or, in a script
 * with neither, the last command and output), or a pick. A pick shows its steps in script order;
 * `{ pick, order: "listed" }` shows them in the order the pick lists them.
 */
export type FinalPolicy = "all" | "last" | FinalPick | {
  readonly pick: FinalPick;
  readonly order?: "script" | "listed";
};
export interface FinalStateOptions {
  readonly policy?: FinalPolicy;
}
/**
 * What is on screen at a position. Pure: the same timeline and position always give the same
 * view, so the server render, the first client render, tests and screenshots agree. `{ ms }` is
 * clamped to `[0, duration]`. `{ click }` shows every step whose `at` is at or below it.
 */
export declare function stateAt<TData>(timeline: Timeline<TData>, position: Position): DemoView<TData>;
/**
 * The finished view, for SSR, no-JS and reduced motion. "all" (the default) equals
 * `stateAt(timeline, { ms: duration })`. "last" keeps only the last agent-text and the last
 * tool-call, in script order; a script with neither keeps its last command and last output. A
 * function gets the steps and returns the indices to keep, shown in script order; the object
 * form `{ pick, order: "listed" }` shows them in the order `pick` returns them instead.
 */
export declare function finalState<TData>(timeline: Timeline<TData>, options?: FinalStateOptions): DemoView<TData>;