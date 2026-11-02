import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { countAt, defined, signature } from "../../internal/agent-demo.ts";
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
import { usePlayback } from "../playback/use-playback.ts";

export interface UseAgentDemoOptions<TData = unknown> {
  /**
   * The script's identity. When it changes, the script recompiles and playback resets to the
   * start. Without it, the script and timing are compared by content, so an inline array (or
   * inline callbacks) that is rebuilt every render never restarts playback.
   */
  readonly scriptKey?: string;
  /** Fields to change from the `chat` preset, such as `presets.terminal`. */
  readonly timing?: Partial<Timing<TData>>;
  /** Seeds the timing jitter. Defaults to the script's `id`. */
  readonly seed?: string;
  /** Whether user steps type into the composer by default. Default false. */
  readonly composer?: boolean;
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
  /** Initial clock rate. Default 1. */
  readonly speed?: number;
  /**
   * Called once per step as playback passes the step's start, in script order (also for steps a
   * seek skips over). Playing a stretch again, after a replay or a backward seek, calls it again.
   * Use it to preload what a later step needs.
   */
  readonly onStepStart?: (index: number, step: Step<TData>) => void;
  /** Called when playback reaches the end. Never under reduced motion. */
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
  /** Clock rate, greater than 0. */
  readonly setSpeed: (speed: number) => void;
}

export interface UseAgentDemoResult<TData = unknown> {
  /** What to render now. */
  readonly view: DemoView<TData>;
  readonly controls: AgentDemoControls;
  /** Attach to the element whose visibility gates playback. */
  readonly ref: RefObject<HTMLDivElement | null>;
  /** False on the server and the first client render. Show controls only once true. */
  readonly ready: boolean;
  readonly playing: boolean;
  readonly paused: boolean;
  readonly reduced: boolean;
  /** Playback reached the end. False under reduced motion, which shows the end without playing. */
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
  const key: unknown =
    scriptKey !== undefined
      ? `key:${scriptKey}`
      : (signature({ script, timing, seed, composer }) ?? script);
  const cache = useRef<{ key: unknown; timeline: Timeline<TData> } | null>(null);
  if (cache.current === null || !Object.is(cache.current.key, key)) {
    const compileOptions = {
      ...(timing === undefined ? {} : { timing }),
      ...(seed === undefined ? {} : { seed }),
      ...(composer === undefined ? {} : { composer }),
    };
    cache.current = { key, timeline: compile(script, compileOptions) };
  }
  return { timeline: cache.current.timeline, key };
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
  const { position, finalPolicy = "all", autoStart = true } = options;
  const clickMode = position !== undefined;
  const [speed, setSpeed] = useState(options.speed ?? 1);
  const [started, setStarted] = useState(autoStart);

  useEffect(() => {
    if (options.speed !== undefined) setSpeed(options.speed);
  }, [options.speed]);

  const playback = usePlayback<HTMLDivElement>({
    duration: timeline.duration,
    autoStart: clickMode ? false : autoStart,
    speed,
    ...defined({
      threshold: options.threshold,
      rootMargin: options.rootMargin,
      leaveGraceMs: options.leaveGraceMs,
      motion: options.motion,
    }),
  });
  const { elapsed, reset } = playback;
  const live = !clickMode && playback.ready && !playback.reduced && started;

  // A new script (by key) starts over. The first run only records the key.
  const lastKey = useRef(key);
  useEffect(() => {
    if (Object.is(lastKey.current, key)) return;
    lastKey.current = key;
    setStarted(autoStart);
    reset();
  }, [key, autoStart, reset]);

  const onStepStart = useRef(options.onStepStart);
  onStepStart.current = options.onStepStart;
  const onComplete = useRef(options.onComplete);
  onComplete.current = options.onComplete;

  const firedUpTo = useRef(-1);
  const lastElapsed = useRef(0);
  useEffect(() => {
    const steps = timeline.steps;
    if (elapsed < lastElapsed.current) {
      firedUpTo.current = steps.filter((s) => s.start < elapsed).length - 1;
    }
    lastElapsed.current = elapsed;
    if (!live || (!playback.playing && elapsed === 0)) return;
    while ((steps[firedUpTo.current + 1]?.start ?? Number.POSITIVE_INFINITY) <= elapsed) {
      firedUpTo.current += 1;
      const index = firedUpTo.current;
      const step = timeline.script.steps[index];
      if (step) onStepStart.current?.(index, step);
    }
  }, [elapsed, live, playback.playing, timeline]);

  const finished = live && playback.complete;
  const wasFinished = useRef(false);
  useEffect(() => {
    if (finished && !wasFinished.current) onComplete.current?.();
    wasFinished.current = finished;
  }, [finished]);

  const {
    play: gatePlay,
    pause,
    toggle: gateToggle,
    replay: gateReplay,
    seek: gateSeek,
  } = playback;
  const { duration } = timeline;
  const controls = useMemo<AgentDemoControls>(
    () => ({
      play: () => {
        setStarted(true);
        gatePlay();
      },
      pause,
      toggle: () => {
        setStarted(true);
        gateToggle();
      },
      replay: () => {
        setStarted(true);
        gateReplay();
      },
      seek: (ms: number) => {
        setStarted(true);
        gateSeek(ms);
      },
      cancel: () => {
        setStarted(true);
        gateSeek(duration);
      },
      setSpeed,
    }),
    [gatePlay, pause, gateToggle, gateReplay, gateSeek, duration],
  );

  let view: DemoView<TData>;
  if (position !== undefined) view = stateAt(timeline, position);
  else if (live) view = stateAt(timeline, { ms: elapsed });
  else view = finalState(timeline, { policy: finalPolicy });

  const showTurn = live && (elapsed > 0 || playback.playing);
  return {
    view,
    controls,
    ref: playback.ref,
    ready: playback.ready,
    playing: live && playback.playing,
    paused: playback.paused,
    reduced: playback.reduced,
    complete: clickMode ? view.complete : finished,
    animating: live || (clickMode && playback.ready && !playback.reduced),
    mode: playback.ready ? "live" : "static",
    speed,
    turn: showTurn ? countAt(timeline.turnStarts, elapsed) - 1 : -1,
    timeline,
  };
}
