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
import { LibraryError } from "../script/errors.ts";
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
  readonly beforeStart?: BeforeStart | undefined;
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
  /** Connects the gate: `ready` turns true. Call it in the browser (an effect or `onMounted`). */
  readonly mount: () => void;
  /** Back to 0 and unpaused, started only if `autoStart`, such as on a slide re-entry. */
  readonly reset: () => void;
  /**
   * Disconnects the gate and goes back to the pre-mount view. The gate keeps its progress,
   * element and rate, so a later `mount()` resumes (React StrictMode and `<Activity>` do this).
   */
  readonly destroy: () => void;
}

/**
 * What shows before playback has moved: "final" is `finalState(finalPolicy)`, "start" is the
 * view at 0ms, where playback begins. Reduced motion shows the final state either way.
 */
export type BeforeStart = "final" | "start";

/** `beforeStart` as given, or `invalid_option`. */
const checkBeforeStart = (value: unknown): void => {
  if (value !== undefined && value !== "final" && value !== "start") {
    throw new LibraryError("invalid_option", { field: "beforeStart" });
  }
};

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

/**
 * A `finalPolicy` as a comparable value. A function compares by its source text, like `timing`,
 * so an inline one is not new on every render; a bound or native function, whose text is only
 * `[native code]`, compares by identity.
 */
const NATIVE = /\{\s*\[native code\]\s*\}$/;
const fnKey = (fn: unknown): unknown => {
  if (typeof fn !== "function") return fn;
  const source = String(fn);
  return NATIVE.test(source) ? fn : source;
};
const policyKey = (policy: FinalPolicy | undefined): unknown => {
  if (typeof policy !== "object" || policy === null) return fnKey(policy);
  const pick = fnKey(policy.pick);
  // An object policy is new on every render when written inline, so it compares by its parts.
  return typeof pick === "string" ? `${policy.order ?? "script"}:${pick}` : policy;
};

/** A position as a comparable value, so an inline `{ click: n }` doesn't count as a change. */
export const positionKey = (position: Position | undefined): string | undefined => {
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
  // One gate for the controller's life, which holds the element and the rate. It reads no
  // browser state until connected; `gate` is it while mounted, else null.
  let bound: BoundGate;
  let gate: BoundGate | null = null;
  const listeners = new Set<() => void>();

  // `onStepStart` bookkeeping: the last step fired, and where the clock was last seen.
  let firedUpTo = -1;
  let lastElapsed = 0;
  // End detection: whether the end was reached, where the last move started, and whether the
  // clock was playing when last seen.
  let ended = false;
  // Callbacks due, in order: step indexes for `onStepStart`, "end" for `onComplete`.
  let due: Array<number | "end"> = [];
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

  /**
   * `stateAt` a position, or without one the view before playback: the final state, or with
   * `beforeStart: "start"` the view at 0ms, unless motion is reduced.
   */
  const viewAt = (position: Position | undefined, reduced: boolean): DemoView<TData> => {
    if (position !== undefined) return stateAt(timeline, position);
    if (options.beforeStart === "start" && !reduced) return stateAt(timeline, { ms: 0 });
    return finalState(timeline, { policy: options.finalPolicy ?? "all" });
  };

  /** Everything `derive` reads, compared to tell whether the state changed. */
  const inputsNow = (): readonly unknown[] => {
    const { position, finalPolicy, reducedPolicy, speed, beforeStart } = options;
    const gs = gate?.getState() ?? IDLE;
    return [
      timeline,
      gs,
      gate !== null,
      positionKey(position),
      // By source text, like `timing`: an inline function is new on every render.
      policyKey(finalPolicy),
      reducedPolicy,
      speed,
      beforeStart,
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
    const view = viewAt(position ?? at, ready && gs.reduced);
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

  /**
   * The steps whose start `elapsed` has passed since last time, once each in order; a rewind
   * forgets the steps after it, so they fire again.
   */
  const passedSteps = (gs: GateState, live: boolean): number[] => {
    const steps = timeline.steps;
    const t = gs.elapsed;
    if (t < lastElapsed) {
      firedUpTo = steps.filter((s) => s.start < t).length - 1;
      // A rewind (a callback calling `replay()`, say) cancels the calls still due past it.
      due = due.filter((item) => item !== "end" && item <= firedUpTo);
    }
    lastElapsed = t;
    const passed: number[] = [];
    if (!live || (!gs.playing && t === 0)) return passed;
    while ((steps[firedUpTo + 1]?.start ?? Number.POSITIVE_INFINITY) <= t) {
      firedUpTo += 1;
      passed.push(firedUpTo);
    }
    return passed;
  };

  /**
   * Whether the clock just played across the end. The end counts only then (which calls
   * `onComplete`), or when a seek or cancel lands on it; never the jump reduced motion makes.
   */
  const reachedEnd = (gs: GateState, live: boolean): boolean => {
    const { duration } = timeline;
    const reached = gs.elapsed >= duration && live && wasPlaying && from < duration;
    if (gs.elapsed < duration) ended = false;
    else if (reached) ended = true;
    from = gs.elapsed;
    wasPlaying = gs.playing;
    return reached;
  };

  // Gate notifications and updates inside `batch` settle once, at the end. Settling computes the
  // bookkeeping, commits the new state, notifies subscribers, and only then calls the user's
  // callbacks, so a callback never sees a half-written state. The calls go through one queue:
  // a callback that moves the clock settles again inside it, and that settle drops calls a rewind
  // made stale and adds its own after the ones still due, so each step still fires once per run,
  // in order. Each call is isolated: a throwing callback doesn't skip the rest. Once the queue is
  // empty the error is rethrown (an AggregateError for several): synchronously to a control or the
  // clock, and from a microtask during `update`, `mount` or `destroy`, so a callback's error never
  // unwinds a binding's lifecycle hook.
  //
  // While unmounted there is no clock: settling only commits the static state, and the step and
  // end bookkeeping waits, so a remount resumes without counting the pause as a rewind.
  let depth = 0;
  let draining = false;
  let lifecycle = false;
  const settle = (): void => {
    if (depth > 0) return;
    if (gate === null) due = [];
    else track(gate.getState());
    if (commit()) for (const listener of [...listeners]) listener();
    if (!draining) report(drain());
  };
  /** Rethrows what callbacks threw: at once, or later inside a lifecycle step. */
  const report = (errors: unknown[]): void => {
    if (errors.length === 0) return;
    const error =
      // biome-ignore lint/plugin: these are the user's callback errors, rethrown, not the library's.
      errors.length === 1 ? errors[0] : new AggregateError(errors, "Demo callbacks threw");
    if (!lifecycle) throw error;
    queueMicrotask(() => {
      throw error;
    });
  };
  /** The step and end bookkeeping for the clock at `gs`, queueing the callbacks it makes due. */
  const track = (gs: GateState): void => {
    const { live } = clockMode(gs, true, options.position !== undefined, undefined);
    // Computed first: a rewind replaces `due`.
    const passed = passedSteps(gs, live);
    due.push(...passed);
    if (reachedEnd(gs, live)) due.push("end");
  };
  /** Calls everything due, in order, and returns what they threw. */
  const drain = (): unknown[] => {
    draining = true;
    const errors: unknown[] = [];
    for (let item = due.shift(); item !== undefined; item = due.shift()) {
      try {
        call(item);
      } catch (error) {
        errors.push(error);
      }
    }
    draining = false;
    return errors;
  };
  /** Runs a binding lifecycle step, whose callback errors are rethrown later. */
  const inLifecycle = (run: () => void): void => {
    const outer = lifecycle;
    lifecycle = true;
    try {
      run();
    } finally {
      lifecycle = outer;
    }
  };
  const call = (item: number | "end"): void => {
    if (item === "end") {
      options.onComplete?.();
      return;
    }
    const step = timeline.script.steps[item];
    if (step) options.onStepStart?.(item, step);
  };
  /** Derives a new state when an input changed; returns whether it did. */
  const commit = (): boolean => {
    const next = inputsNow();
    if (next.every((value, i) => Object.is(value, inputs[i]))) return false;
    inputs = next;
    state = derive();
    return true;
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
      bound.setSpeed(next);
    },
  };

  checkBeforeStart(options.beforeStart);
  compileFor(initialScript);
  bound = createBoundGate(gateOptions());
  bound.subscribe(settle);
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
      bound.attach(next);
    },
    update(script, next) {
      inLifecycle(() =>
        batch(() => {
          // A changed `speed` option replaces a `setSpeed` rate, here and on later mounts.
          // Checked before anything changes, so a bad rate leaves the controller as it was.
          if (next.speed !== undefined) checkSpeed(next.speed);
          checkBeforeStart(next.beforeStart);
          options = next;
          const restart = compileFor(script);
          bound.configure(gateOptions());
          // A new script (by key) starts over.
          if (restart) bound.reset();
        }),
      );
    },
    mount() {
      if (gate) return;
      inLifecycle(() =>
        batch(() => {
          bound.connect();
          gate = bound;
        }),
      );
    },
    reset: () => bound.reset(),
    destroy() {
      if (!gate) return;
      bound.disconnect();
      gate = null;
      inLifecycle(settle);
    },
  };
}
