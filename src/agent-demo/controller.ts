// The agent demo's state machine, framework-free: it compiles the script, holds the playback gate
// and turns the gate's clock into the view to render, with the callbacks and the end rules. The
// React and Vue `useAgentDemo` only adapt it. Internal: nothing exports it.
import { defined } from "../internal/options.ts";
import {
  type BoundGate,
  checkSpeed,
  createBoundGate,
  type GateState,
  type PlaybackGateOptions,
  type ReducedPolicy,
} from "../playback/gate.ts";
import type { MotionPreference, MotionSource } from "../playback/motion.ts";
import type { DemoScript, Step } from "../script/types.ts";
import { compile, type Timeline } from "../sequencer/compile.ts";
import type { Timing } from "../sequencer/timing.ts";
import {
  type DemoView,
  type FinalPolicy,
  finalState,
  type Position,
  stateAt,
} from "../sequencer/view.ts";
import { countAt, hiddenToolNames, signature, type ToolRegistry } from "./core.ts";

/** The `useAgentDemo` options, with `position` already resolved. Each binding documents them. */
export interface DemoControllerOptions<TData = unknown> {
  readonly scriptKey?: string | undefined;
  readonly timing?: Partial<Timing<TData>> | undefined;
  readonly seed?: string | undefined;
  readonly composer?: boolean | undefined;
  readonly tools?: ToolRegistry | undefined;
  readonly finalPolicy?: FinalPolicy | undefined;
  readonly position?: Position | undefined;
  readonly autoStart?: boolean | undefined;
  readonly threshold?: number | undefined;
  readonly rootMargin?: string | undefined;
  readonly leaveGraceMs?: number | undefined;
  readonly motion?: MotionPreference | MotionSource | undefined;
  readonly reducedPolicy?: ReducedPolicy | undefined;
  readonly speed?: number | undefined;
  readonly onStepStart?: ((index: number, step: Step<TData>) => void) | undefined;
  readonly onComplete?: (() => void) | undefined;
}

export interface DemoControls {
  readonly play: () => void;
  readonly pause: () => void;
  readonly toggle: () => void;
  readonly replay: () => void;
  readonly seek: (ms: number) => void;
  readonly cancel: () => void;
  readonly setSpeed: (speed: number) => void;
}

/** What `useAgentDemo` returns, less the element ref. The bindings document each field. */
export interface DemoState<TData = unknown> {
  readonly view: DemoView<TData>;
  readonly controls: DemoControls;
  readonly ready: boolean;
  readonly started: boolean;
  readonly playing: boolean;
  readonly paused: boolean;
  readonly reduced: boolean;
  readonly complete: boolean;
  readonly animating: boolean;
  readonly mode: "static" | "live";
  readonly speed: number;
  readonly turn: number;
  readonly timeline: Timeline<TData>;
}

export interface DemoController<TData = unknown> {
  /** The current state. The same object until something changes. */
  readonly getState: () => DemoState<TData>;
  readonly subscribe: (callback: () => void) => () => void;
  /** Binds the element whose visibility gates playback; see `BoundGate` for the rules. */
  readonly attach: (element: Element | null) => void;
  /** New props. Recompiles only for a new script (by key or content), which starts over. */
  readonly update: (script: DemoScript<TData>, options: DemoControllerOptions<TData>) => void;
  /** Creates the gate: `ready` turns true. Call it in the browser (an effect or `onMounted`). */
  readonly mount: () => void;
  /** Back to 0 and unpaused, started only if `autoStart`, such as on a slide re-entry. */
  readonly reset: () => void;
  /**
   * Destroys the gate and goes back to the pre-mount state. The controller keeps its script,
   * options, element and rate, so a later `mount()` starts again (React StrictMode does this).
   */
  readonly destroy: () => void;
}

/** Everything off: what the server and the pre-mount render see. */
const IDLE: GateState = {
  started: false,
  inView: false,
  tabVisible: false,
  paused: false,
  reduced: false,
  complete: false,
  playing: false,
  elapsed: 0,
  speed: 1,
};

/** A position as a comparable value, so an inline `{ click: n }` doesn't count as a change. */
const positionKey = (position: Position | undefined): string | undefined => {
  if (position === undefined) return undefined;
  return "ms" in position ? `ms:${position.ms}` : `click:${position.click}`;
};

/**
 * Which view the clock drives, outside click mode. `live` once the clock has moved (started, or a
 * seek before play) with motion allowed; `held` when reduced motion under "hold" froze a frame
 * past 0; `at` is the clock position for either, and otherwise the view is the final state.
 * `animating` is `live`, or in click mode, motion allowed once mounted.
 */
function clockMode(
  gs: GateState,
  ready: boolean,
  clickMode: boolean,
  reducedPolicy: ReducedPolicy = "end",
): { live: boolean; at: Position | undefined; animating: boolean; showTurn: boolean } {
  const motion = ready && !gs.reduced;
  const moved = !clickMode && ready && (gs.started || gs.elapsed > 0);
  const live = moved && motion;
  const held = moved && gs.reduced && reducedPolicy === "hold" && gs.elapsed > 0;
  return {
    live,
    at: live || held ? { ms: gs.elapsed } : undefined,
    animating: clickMode ? motion : live,
    showTurn: live && (gs.elapsed > 0 || gs.playing),
  };
}

/**
 * The agent demo controller. Safe to create during server rendering: it compiles the script and
 * reads no browser state until `mount()`.
 */
export function createDemoController<TData = unknown>(
  initialScript: DemoScript<TData>,
  initialOptions: DemoControllerOptions<TData> = {},
): DemoController<TData> {
  let options = initialOptions;
  let timeline!: Timeline<TData>;
  let key: unknown;
  let compiled = false;
  // The content signature is recomputed only when an input is a new object, not every update.
  let content: { inputs: readonly unknown[]; key: unknown } | null = null;
  let gate: BoundGate | null = null;
  let element: Element | null = null;
  // The last rate set with `setSpeed`, applied to each gate `mount()` creates.
  let pending: number | undefined;
  const listeners = new Set<() => void>();

  // `onStepStart` bookkeeping: the last step fired, and where the clock was last seen.
  let firedUpTo = -1;
  let lastElapsed = 0;
  // End detection: whether the end was reached, where the last move started, and whether the
  // clock was playing when last seen.
  let ended = false;
  let from = 0;
  let wasPlaying = false;

  /** Compiles for new inputs; returns whether the script's identity changed. */
  const compileFor = (script: DemoScript<TData>): boolean => {
    const { scriptKey, timing, seed, composer } = options;
    const names = hiddenToolNames(options.tools);
    // Joined into a string, so an inline registry rebuilt every render compares by its names.
    const hidden = names.join("\n");
    let next: unknown = `key:${scriptKey}\n${hidden}`;
    if (scriptKey === undefined) {
      const inputs = [script, timing, seed, composer, hidden];
      const last = content;
      if (last === null || inputs.some((input, i) => !Object.is(input, last.inputs[i]))) {
        const sig = signature({ script, timing, seed, composer, hidden });
        content = { inputs, key: sig ?? script };
      }
      next = content?.key;
    }
    if (compiled && Object.is(key, next)) return false;
    const hiddenTools = names.length === 0 ? undefined : names;
    timeline = compile(script, defined({ timing, seed, composer, hiddenTools }));
    key = next;
    const changed = compiled;
    compiled = true;
    return changed;
  };

  const gateOptions = (): PlaybackGateOptions => ({
    duration: timeline.duration,
    autoStart: options.position === undefined ? (options.autoStart ?? true) : false,
    reducedPolicy: options.reducedPolicy ?? "end",
    ...defined({
      speed: options.speed,
      threshold: options.threshold,
      rootMargin: options.rootMargin,
      leaveGraceMs: options.leaveGraceMs,
      motion: options.motion,
    }),
  });

  /** `stateAt` a position, or the final state without one. */
  const viewAt = (position: Position | undefined): DemoView<TData> =>
    position === undefined
      ? finalState(timeline, { policy: options.finalPolicy ?? "all" })
      : stateAt(timeline, position);

  /** Everything `derive` reads, compared to tell whether the state changed. */
  const inputsNow = (): readonly unknown[] => {
    const { position, finalPolicy, reducedPolicy, speed } = options;
    const gs = gate?.getState() ?? IDLE;
    return [
      timeline,
      gs,
      gate !== null,
      positionKey(position),
      finalPolicy,
      reducedPolicy,
      speed,
      ended,
    ];
  };

  // The inputs `state` was derived from, compared to tell whether it changed.
  let inputs: readonly unknown[] = [];
  let state: DemoState<TData>;

  const derive = (): DemoState<TData> => {
    const gs = gate?.getState() ?? IDLE;
    const ready = gate !== null;
    const { position } = options;
    const clickMode = position !== undefined;
    const { live, at, animating, showTurn } = clockMode(
      gs,
      ready,
      clickMode,
      options.reducedPolicy,
    );
    const view = viewAt(position ?? at);
    return {
      view,
      controls,
      ready,
      started: live && gs.started,
      playing: live && gs.playing,
      paused: gs.paused,
      reduced: gs.reduced,
      complete: clickMode ? view.complete : live && ended,
      animating,
      mode: ready ? "live" : "static",
      speed: ready ? gs.speed : (options.speed ?? 1),
      turn: showTurn ? countAt(timeline.turnStarts, gs.elapsed) - 1 : -1,
      timeline,
    };
  };

  /** Calls `onStepStart` once per step as `elapsed` passes its start, again after a rewind. */
  const fireStepStarts = (gs: GateState, live: boolean): void => {
    const steps = timeline.steps;
    const t = gs.elapsed;
    if (t < lastElapsed) firedUpTo = steps.filter((s) => s.start < t).length - 1;
    lastElapsed = t;
    if (!live || (!gs.playing && t === 0)) return;
    while ((steps[firedUpTo + 1]?.start ?? Number.POSITIVE_INFINITY) <= t) {
      firedUpTo += 1;
      const step = timeline.script.steps[firedUpTo];
      if (step) options.onStepStart?.(firedUpTo, step);
    }
  };

  /**
   * The end counts only when the clock plays across it (calling `onComplete`), or a seek or
   * cancel lands on it; never the jump reduced motion makes.
   */
  const detectEnd = (gs: GateState, live: boolean): void => {
    const { duration } = timeline;
    if (gs.elapsed < duration) ended = false;
    else if (live && wasPlaying && from < duration) {
      ended = true;
      options.onComplete?.();
    }
    from = gs.elapsed;
    wasPlaying = gs.playing;
  };

  // Gate notifications and updates inside `batch` settle once, at the end.
  let depth = 0;
  const settle = (): void => {
    if (depth > 0) return;
    const gs = gate?.getState() ?? IDLE;
    const { live } = clockMode(gs, gate !== null, options.position !== undefined, undefined);
    fireStepStarts(gs, live);
    detectEnd(gs, live);
    const next = inputsNow();
    if (next.every((value, i) => Object.is(value, inputs[i]))) return;
    inputs = next;
    state = derive();
    for (const listener of [...listeners]) listener();
  };
  const batch = (run: () => void): void => {
    depth += 1;
    try {
      run();
    } finally {
      depth -= 1;
    }
    settle();
  };

  const seek = (ms: number): void =>
    batch(() => {
      gate?.seek(ms);
      // Recorded after the gate moved, so the seek isn't taken for the clock playing to the end.
      const { duration } = timeline;
      from = Math.min(Math.max(ms, 0), duration);
      if (ms >= duration) ended = true;
    });

  const controls: DemoControls = {
    play: () => gate?.play(),
    pause: () => gate?.pause(),
    toggle: () => gate?.toggle(),
    replay: () => gate?.replay(),
    seek,
    cancel: () => seek(timeline.duration),
    setSpeed(next) {
      if (gate) gate.setSpeed(next);
      else checkSpeed(next);
      pending = next;
    },
  };

  compileFor(initialScript);
  state = derive();
  inputs = inputsNow();

  return {
    getState: () => state,
    subscribe(callback) {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    attach(next) {
      element = next;
      gate?.attach(next);
    },
    update(script, next) {
      batch(() => {
        options = next;
        const restart = compileFor(script);
        gate?.configure(gateOptions());
        // A new script (by key) starts over.
        if (restart) gate?.reset();
      });
    },
    mount() {
      if (gate) return;
      batch(() => {
        gate = createBoundGate(gateOptions());
        if (pending !== undefined) gate.setSpeed(pending);
        gate.attach(element);
        gate.subscribe(settle);
      });
    },
    reset: () => gate?.reset(),
    destroy() {
      if (!gate) return;
      gate.destroy();
      gate = null;
      settle();
    },
  };
}
