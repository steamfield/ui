import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { countAt, hiddenToolNames, signature, type ToolRegistry } from "../../agent-demo/core.ts";
import { defined } from "../../internal/options.ts";
import type { ReducedPolicy } from "../../playback/gate.ts";
import type { MotionPreference, MotionSource } from "../../playback/motion.ts";
import type { DemoScript, Step } from "../../script/types.ts";
import { compile, type Timeline } from "../../sequencer/compile.ts";
import type { Timing } from "../../sequencer/timing.ts";
import {
  type DemoView,
  type FinalPolicy,
  finalState,
  type Position,
  stateAt,
} from "../../sequencer/view.ts";
import { type PlaybackRef, usePlayback } from "../playback/use-playback.ts";

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
   * A fixed position instead of the clock, such as `{ click: $clicks }` from Slidev. The demo
   * renders `stateAt` there, runs no clock and shows no controls.
   */
  readonly position?: Position;
  /** Start once in view. When false, the final transcript shows until `play()`. Default true. */
  readonly autoStart?: boolean;
  /** In-view threshold. Default 0.15. */
  readonly threshold?: number;
  readonly rootMargin?: string;
  /** How long the demo may be out of view before it pauses. Default 0. */
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

function useTimeline<TData>(
  script: DemoScript<TData>,
  options: UseAgentDemoOptions<TData>,
): { timeline: Timeline<TData>; key: unknown } {
  const { scriptKey, timing, seed, composer } = options;
  const hiddenTools = hiddenToolNames(options.tools);
  // Joined into a string, so an inline registry rebuilt every render compares by its names.
  const hidden = hiddenTools.join("\n");
  // The content signature is recomputed only when an input is a new object, not every frame.
  const content = useRef<{ inputs: readonly unknown[]; key: unknown } | null>(null);
  let key: unknown = `key:${scriptKey}\n${hidden}`;
  if (scriptKey === undefined) {
    const inputs = [script, timing, seed, composer, hidden];
    const last = content.current;
    if (last === null || inputs.some((input, i) => !Object.is(input, last.inputs[i]))) {
      const sig = signature({ script, timing, seed, composer, hidden });
      content.current = { inputs, key: sig ?? script };
    }
    key = content.current?.key;
  }
  const cache = useRef<{ key: unknown; timeline: Timeline<TData> } | null>(null);
  if (cache.current === null || !Object.is(cache.current.key, key)) {
    const compileOptions = {
      ...(timing === undefined ? {} : { timing }),
      ...(seed === undefined ? {} : { seed }),
      ...(composer === undefined ? {} : { composer }),
      ...(hiddenTools.length === 0 ? {} : { hiddenTools }),
    };
    cache.current = { key, timeline: compile(script, compileOptions) };
  }
  return { timeline: cache.current.timeline, key };
}

/**
 * Whether playback reached the end. It counts only when the clock plays across the end (which
 * calls `onComplete`) or a seek lands on it; never the jump reduced motion makes. `from` is where
 * the last move started; `seeked` records a seek so it isn't taken for the clock.
 */
function useEnd({
  elapsed,
  live,
  playing,
  duration,
  onComplete,
}: {
  readonly elapsed: number;
  readonly live: boolean;
  readonly playing: boolean;
  readonly duration: number;
  readonly onComplete: RefObject<(() => void) | undefined>;
}): { ended: boolean; seeked: (ms: number) => void } {
  const [ended, setEnded] = useState(false);
  const from = useRef(0);
  const wasPlaying = useRef(false);
  useEffect(() => {
    if (elapsed < duration) setEnded(false);
    else if (live && wasPlaying.current && from.current < duration) {
      setEnded(true);
      onComplete.current?.();
    }
    from.current = elapsed;
  }, [elapsed, live, duration, onComplete]);
  useEffect(() => {
    wasPlaying.current = playing;
  }, [playing]);
  const seeked = useCallback(
    (ms: number) => {
      from.current = Math.min(Math.max(ms, 0), duration);
      if (ms >= duration) setEnded(true);
    },
    [duration],
  );
  return { ended, seeked };
}

/**
 * Which view the clock drives, outside click mode. `live` once the clock has moved (started, or a
 * seek before play) with motion allowed; `held` when reduced motion under "hold" froze a frame
 * past 0. Otherwise the view is the final state. `animating` is `live`, or in click mode, motion
 * allowed once hydrated.
 */
function clockMode(
  playback: { readonly ready: boolean; readonly started: boolean; readonly reduced: boolean },
  elapsed: number,
  {
    clickMode,
    reducedPolicy,
  }: { readonly clickMode: boolean; readonly reducedPolicy: ReducedPolicy },
): { live: boolean; held: boolean; animating: boolean } {
  const motion = playback.ready && !playback.reduced;
  const moved = !clickMode && playback.ready && (playback.started || elapsed > 0);
  const live = moved && motion;
  return {
    live,
    held: moved && playback.reduced && reducedPolicy === "hold" && elapsed > 0,
    animating: clickMode ? motion : live,
  };
}

/** Calls `onStepStart` once per step as `elapsed` passes its start, again after a rewind. */
function useStepStarts<TData>(
  timeline: Timeline<TData>,
  {
    elapsed,
    live,
    playing,
    onStepStart,
  }: {
    readonly elapsed: number;
    readonly live: boolean;
    readonly playing: boolean;
    readonly onStepStart: RefObject<((index: number, step: Step<TData>) => void) | undefined>;
  },
): void {
  const firedUpTo = useRef(-1);
  const lastElapsed = useRef(0);
  useEffect(() => {
    const steps = timeline.steps;
    if (elapsed < lastElapsed.current) {
      firedUpTo.current = steps.filter((s) => s.start < elapsed).length - 1;
    }
    lastElapsed.current = elapsed;
    if (!live || (!playing && elapsed === 0)) return;
    while ((steps[firedUpTo.current + 1]?.start ?? Number.POSITIVE_INFINITY) <= elapsed) {
      firedUpTo.current += 1;
      const index = firedUpTo.current;
      const step = timeline.script.steps[index];
      if (step) onStepStart.current?.(index, step);
    }
  }, [elapsed, live, playing, timeline, onStepStart]);
}

/** `stateAt` a position, or the final state without one. */
function viewAt<TData>(
  timeline: Timeline<TData>,
  position: Position | undefined,
  finalPolicy: FinalPolicy,
): DemoView<TData> {
  if (position !== undefined) return stateAt(timeline, position);
  return finalState(timeline, { policy: finalPolicy });
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
  const { timeline, key } = useTimeline(script, options);
  const { position, finalPolicy = "all", autoStart = true, reducedPolicy = "end" } = options;
  const clickMode = position !== undefined;
  const playback = usePlayback<HTMLDivElement>({
    duration: timeline.duration,
    autoStart: clickMode ? false : autoStart,
    reducedPolicy,
    ...defined({
      speed: options.speed,
      threshold: options.threshold,
      rootMargin: options.rootMargin,
      leaveGraceMs: options.leaveGraceMs,
      motion: options.motion,
    }),
  });
  const { elapsed, reset, started } = playback;
  const { duration } = timeline;
  const clock = clockMode(playback, elapsed, { clickMode, reducedPolicy });
  const { live } = clock;

  // A new script (by key) starts over. The first run only records the key.
  const lastKey = useRef(key);
  useEffect(() => {
    if (Object.is(lastKey.current, key)) return;
    lastKey.current = key;
    reset();
  }, [key, reset]);

  const onStepStart = useRef(options.onStepStart);
  onStepStart.current = options.onStepStart;
  const onComplete = useRef(options.onComplete);
  onComplete.current = options.onComplete;

  useStepStarts(timeline, { elapsed, live, playing: playback.playing, onStepStart });

  const { ended, seeked } = useEnd({
    elapsed,
    live,
    playing: playback.playing,
    duration,
    onComplete,
  });

  const {
    play: gatePlay,
    pause,
    toggle: gateToggle,
    replay: gateReplay,
    seek: gateSeek,
    setSpeed,
  } = playback;
  const controls = useMemo<AgentDemoControls>(() => {
    const seek = (ms: number): void => {
      gateSeek(ms);
      seeked(ms);
    };
    return {
      play: gatePlay,
      pause,
      toggle: gateToggle,
      replay: gateReplay,
      seek,
      cancel: () => seek(duration),
      setSpeed,
    };
  }, [gatePlay, pause, gateToggle, gateReplay, gateSeek, setSpeed, seeked, duration]);

  const clockPosition = live || clock.held ? { ms: elapsed } : undefined;
  const view = viewAt(timeline, position ?? clockPosition, finalPolicy);

  const showTurn = live && (elapsed > 0 || playback.playing);
  return {
    view,
    controls,
    ref: playback.ref,
    ready: playback.ready,
    started: live && started,
    playing: live && playback.playing,
    paused: playback.paused,
    reduced: playback.reduced,
    complete: clickMode ? view.complete : live && ended,
    animating: clock.animating,
    mode: playback.ready ? "live" : "static",
    speed: playback.speed,
    turn: showTurn ? countAt(timeline.turnStarts, elapsed) - 1 : -1,
    timeline,
  };
}
