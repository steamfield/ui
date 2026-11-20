import { DemoScript } from "../script/types.js";
import { Timing } from "./timing.js";
export interface CompileOptions<TData = unknown> {
  /** Fields to change from the `chat` preset, such as `presets.terminal` or `{ gapMs: 0 }`. */
  readonly timing?: Partial<Timing<TData>>;
  /** Seeds the jitter. Defaults to the script's `id`, then "". */
  readonly seed?: string;
  /** Whether user steps without their own `composer` flag type into the composer. Default false. */
  readonly composer?: boolean;
  /**
   * Tool names whose calls take no time, for tools a renderer leaves out (`hidden` in a tool
   * registry), so they don't leave a silent gap. Their steps still exist, at the time the next
   * step starts.
   */
  readonly hiddenTools?: readonly string[];
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
/**
 * How many clicks a click-paced script needs: the highest `at` on any step, body or output. At
 * that click everything is shown. Validates the script like `compile`.
 */
export declare function clickCount(script: DemoScript<unknown>): number;
/**
 * Lays a script out in time. Validates the script (`invalid_script`, `unsupported_step`) and the
 * options (`invalid_option`). Pure: the same script, options and seed give the same timeline.
 */
export declare function compile<TData>(script: DemoScript<TData>, options?: CompileOptions<TData>): Timeline<TData>;