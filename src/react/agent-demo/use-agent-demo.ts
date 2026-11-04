import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { type BeforeStart, createDemoController } from "../../agent-demo/controller.ts";
import type { ToolRegistry } from "../../agent-demo/core.ts";
import type { ReducedPolicy } from "../../playback/gate.ts";
import type { MotionPreference, MotionSource } from "../../playback/motion.ts";
import type { DemoScript, Step } from "../../script/types.ts";
import type { Timeline } from "../../sequencer/compile.ts";
import type { Timing } from "../../sequencer/timing.ts";
import type { DemoView, FinalPolicy, Position } from "../../sequencer/view.ts";
import { type PlaybackRef, playbackRef } from "../playback/use-playback.ts";

export type { BeforeStart } from "../../agent-demo/controller.ts";

export interface UseAgentDemoOptions<TData = unknown> {
  /**
   * The script's identity. When it changes, the script recompiles and playback resets to the
   * start. Without it, the script and timing are compared by content whenever one of them is a
   * new object, so an inline array (or inline callbacks) rebuilt every render never restarts
   * playback. Content comparison has two limits: a function compares by its source text, so a
   * callback whose captured variables change is not seen as new; and a script that can't be
   * serialized (a cycle, a BigInt) compares by identity, so building one inline restarts playback
   * on every render. Pass `scriptKey` in either case.
   */
  readonly scriptKey?: string;
  /** Fields to change from the `chat` preset, such as `presets.terminal`. */
  readonly timing?: Partial<Timing<TData>>;
  /** Seeds the timing jitter. Defaults to the script's `id`. */
  readonly seed?: string;
  /** Whether user steps type into the composer by default. Default false. */
  readonly composer?: boolean;
  /**
   * The tool registry. Only `hidden` is read here: hidden tools' calls take no time, so leaving
   * them out of the transcript leaves no silent gap. `AgentDemo` passes its `tools` prop.
   */
  readonly tools?: ToolRegistry;
  /** What the server, the pre-hydration render and reduced motion show. Default "all". */
  readonly finalPolicy?: FinalPolicy;
  /**
   * What shows before playback starts (the server, the pre-hydration render, and with
   * `autoStart: false` until `play()`): "final" (the default) is `finalState(finalPolicy)`;
   * "start" is the view at 0ms, where playback begins (with the chat preset's start delay, an
   * empty transcript), so nothing disappears when it starts. Reduced motion still shows the final
   * state.
   */
  readonly beforeStart?: BeforeStart;
  /**
   * A fixed position instead of the clock, such as `{ click: $clicks }` from Slidev. The demo
   * renders `stateAt` there, runs no clock and shows no controls.
   */
  readonly position?: Position;
  /** Start once in view. When false, the final transcript shows until `play()`. Default true. */
  readonly autoStart?: boolean;
  /** In-view threshold. Default 0.15. */
  readonly threshold?: number;
  readonly rootMargin?: string;
  /**
   * How long the demo may be out of view before it pauses. Default 0. `Infinity` never pauses
   * for leaving view once the demo has been seen; a hidden tab still pauses.
   */
  readonly leaveGraceMs?: number;
  /** Default "auto", which follows `prefers-reduced-motion` live. Keep a custom source stable. */
  readonly motion?: MotionPreference | MotionSource;
  /**
   * What reduced motion shows: "end" (the default) is `finalState(finalPolicy)`; "hold" freezes
   * the frame playback had reached and resumes from it when motion returns. Before playback has
   * moved, both show the final state.
   */
  readonly reducedPolicy?: ReducedPolicy;
  /** Initial clock rate. Default 1. */
  readonly speed?: number;
  /**
   * Called once per step as playback passes the step's start, in script order (also for steps a
   * seek skips over). Playing a stretch again, after a replay or a backward seek, calls it again.
   * Use it to preload what a later step needs.
   */
  readonly onStepStart?: (index: number, step: Step<TData>) => void;
  /**
   * Called when the clock plays through to the end. Never under reduced motion, and not for a
   * `seek` or `cancel` to the end.
   */
  readonly onComplete?: () => void;
}

export interface AgentDemoControls {
  readonly play: () => void;
  readonly pause: () => void;
  readonly toggle: () => void;
  /** Back to the start and playing. Touches no DOM, so focus stays where it is. */
  readonly replay: () => void;
  readonly seek: (ms: number) => void;
  /** Stops playback and shows the finished transcript, like skipping to the end. */
  readonly cancel: () => void;
  /**
   * Clock rate. Throws `invalid_option` on `speed` unless it's finite and greater than 0. Holds
   * until the `speed` option changes.
   */
  readonly setSpeed: (speed: number) => void;
}

export interface UseAgentDemoResult<TData = unknown> {
  /** What to render now. */
  readonly view: DemoView<TData>;
  readonly controls: AgentDemoControls;
  /** Attach to the element whose visibility gates playback; it may mount late or change. */
  readonly ref: PlaybackRef<HTMLDivElement>;
  /** False on the server and the first client render. Show controls only once true. */
  readonly ready: boolean;
  /** `autoStart`, or `play()`, `toggle()` or `replay()` has been called. False until hydrated. */
  readonly started: boolean;
  readonly playing: boolean;
  readonly paused: boolean;
  readonly reduced: boolean;
  /**
   * Playback reached the end, by playing or by a `seek` or `cancel`. False under reduced motion,
   * which shows the end without playing, and after motion returns from it.
   */
  readonly complete: boolean;
  /**
   * Hydrated with motion allowed, and either following the clock or pinned to a `position`.
   * Renderers set `data-sf-animating` from it, which turns entrance and typing CSS on.
   */
  readonly animating: boolean;
  /** "live" once hydrated, "static" on the server and the first client render. */
  readonly mode: "static" | "live";
  readonly speed: number;
  /** The turn playback is in, or -1 before playback. */
  readonly turn: number;
  readonly timeline: Timeline<TData>;
}

/**
 * The headless agent demo: compiles a script, gates playback on visibility, tab and motion, and
 * returns the view to render with its controls. The server and pre-hydration render are
 * `finalState(finalPolicy)`, as is reduced motion; `position` pins the view for click-paced decks.
 */
export function useAgentDemo<TData = unknown>(
  script: DemoScript<TData>,
  options: UseAgentDemoOptions<TData> = {},
): UseAgentDemoResult<TData> {
  const [controller] = useState(() => createDemoController(script, options));
  const [ref] = useState(() => playbackRef<HTMLDivElement>(controller.attach));
  // Every commit, before paint: the controller compares the props itself.
  useLayoutEffect(() => {
    controller.update(script, options);
  });
  useEffect(() => {
    controller.mount();
    return controller.destroy;
  }, [controller]);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );
  return { ...state, ref };
}
