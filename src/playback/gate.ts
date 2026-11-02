import { LibraryError } from "../internal/errors.ts";
import { type MotionPreference, type MotionSource, motionSourceFor } from "../internal/motion.ts";

/** What a gate does once motion is not allowed: jump to the final frame, or hold this one. */
export type ReducedPolicy = "end" | "hold";

export interface PlaybackGateOptions {
  /** Start as soon as the element is in view. When false, wait for `play()`. Default true. */
  readonly autoStart?: boolean;
  /** IntersectionObserver threshold for "in view". Default 0.15. */
  readonly threshold?: number;
  readonly rootMargin?: string;
  /**
   * How long the element may be out of view before playback pauses. Coming back inside the
   * grace period resumes at once, as if it never left. Default 0.
   */
  readonly leaveGraceMs?: number;
  /**
   * Default `"auto"`, which follows `prefers-reduced-motion` and any `[data-sf-motion="reduce"]`
   * ancestor of the element, live.
   */
  readonly motion?: MotionPreference | MotionSource;
  /** Default `"end"`. */
  readonly reducedPolicy?: ReducedPolicy;
  /**
   * Total demo time in ms; `elapsed` stops and `complete` turns true when it is reached. Setting
   * `duration` or `onFrame` runs the requestAnimationFrame clock while playing.
   */
  readonly duration?: number;
  /** Clock rate, greater than 0: 2 plays twice as fast. Default 1. */
  readonly speed?: number;
  /** Called with the new `elapsed` whenever it changes. */
  readonly onFrame?: (elapsed: number) => void;
}

export interface GateState {
  /** `autoStart`, or `play()`/`replay()` has been called. */
  readonly started: boolean;
  readonly inView: boolean;
  readonly tabVisible: boolean;
  /** The user paused. */
  readonly paused: boolean;
  /** Motion is not allowed. */
  readonly reduced: boolean;
  readonly complete: boolean;
  /** `started && inView && tabVisible && !paused && !reduced && !complete`. */
  readonly playing: boolean;
  /** Demo time in ms, kept across pauses. */
  readonly elapsed: number;
  /** The clock rate. */
  readonly speed: number;
}

export interface PlaybackGate {
  /** Starts (or resumes) playback. */
  readonly play: () => void;
  readonly pause: () => void;
  /** Pauses while started and unpaused, otherwise plays. */
  readonly toggle: () => void;
  /** Back to 0 and playing. Touches no DOM, so focus stays where it is. */
  readonly replay: () => void;
  /** Moves `elapsed` to `ms`, clamped to `[0, duration]`. Throws `invalid_option` unless finite. */
  readonly seek: (ms: number) => void;
  /** Back to 0, unpaused, and started only if `autoStart`. */
  readonly reset: () => void;
  /** Changes the clock rate. Throws `invalid_option` unless finite and greater than 0. */
  readonly setSpeed: (speed: number) => void;
  /** Disconnects every observer and listener and stops the clock. */
  readonly destroy: () => void;
  /** The current state. The same object until something changes. */
  readonly getState: () => GateState;
  readonly subscribe: (callback: () => void) => () => void;
}

/** The longest step one frame may advance, so a throttled or stalled tab never jumps ahead. */
const MAX_STEP_MS = 100;

const KEYS: ReadonlyArray<keyof GateState> = [
  "started",
  "inView",
  "tabVisible",
  "paused",
  "reduced",
  "complete",
  "playing",
  "elapsed",
  "speed",
];

/**
 * A play/pause gate for an on-page demo. It plays only while the element is in view, the tab is
 * visible, motion is allowed and the user hasn't paused, and its optional clock keeps demo time
 * across every pause. Without IntersectionObserver, or with a `null` element, the demo counts as
 * in view. Create it in the browser (an effect), never during server rendering.
 */
export function createPlaybackGate(
  el: Element | null,
  options: PlaybackGateOptions = {},
): PlaybackGate {
  const config = readOptions(options);
  const clocked = options.duration !== undefined || options.onFrame !== undefined;
  const motion = motionSourceFor(config.motion, el);
  const listeners = new Set<() => void>();
  let speed = config.speed;
  let started = config.autoStart;
  let paused = false;
  let inView = el === null || typeof IntersectionObserver === "undefined";
  let tabVisible = isTabVisible();
  let reduced = !motion.get();
  let elapsed = 0;
  let destroyed = false;
  let running = false;
  let frame: number | undefined;
  let last: number | undefined;
  let grace: ReturnType<typeof setTimeout> | undefined;

  const setElapsed = (value: number): void => {
    const next = Math.min(Math.max(value, 0), config.duration);
    if (next === elapsed) return;
    elapsed = next;
    options.onFrame?.(elapsed);
  };

  const compute = (): GateState => {
    const ended = reduced && config.reducedPolicy === "end";
    const complete = ended || elapsed >= config.duration;
    const playing = started && inView && tabVisible && !paused && !reduced && !complete;
    return { started, inView, tabVisible, paused, reduced, complete, playing, elapsed, speed };
  };

  let state = compute();

  const tick = (time: number): void => {
    frame = undefined;
    const step = last === undefined ? 0 : Math.min(Math.max(time - last, 0), MAX_STEP_MS);
    last = time;
    setElapsed(elapsed + step * speed);
    update();
    if (running && frame === undefined) frame = requestFrame(tick);
  };

  const syncClock = (): void => {
    const run = clocked && state.playing;
    if (run === running) return;
    running = run;
    if (run) {
      last = undefined;
      frame = requestFrame(tick);
    } else if (frame !== undefined) {
      cancelFrame(frame);
      frame = undefined;
    }
  };

  function update(): void {
    if (destroyed) return;
    if (reduced && config.reducedPolicy === "end" && Number.isFinite(config.duration)) {
      setElapsed(config.duration);
    }
    const next = compute();
    const changed = KEYS.some((key) => next[key] !== state[key]);
    if (changed) state = next;
    syncClock();
    if (changed) for (const listener of [...listeners]) listener();
  }

  const onIntersect = (visible: boolean): void => {
    clearTimeout(grace);
    grace = undefined;
    if (visible || !inView || config.leaveGraceMs === 0) {
      inView = visible;
      update();
      return;
    }
    grace = setTimeout(() => {
      grace = undefined;
      inView = false;
      update();
    }, config.leaveGraceMs);
  };

  let observer: IntersectionObserver | undefined;
  if (el && typeof IntersectionObserver !== "undefined") {
    observer = new IntersectionObserver(
      (entries) => onIntersect(entries.at(-1)?.isIntersecting ?? false),
      { threshold: config.threshold, rootMargin: config.rootMargin },
    );
    observer.observe(el);
  }

  const onVisibility = (): void => {
    tabVisible = isTabVisible();
    update();
  };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibility);
  }
  const unsubscribeMotion = motion.subscribe(() => {
    reduced = !motion.get();
    update();
  });
  update();

  const play = (): void => {
    started = true;
    paused = false;
    update();
  };
  const pause = (): void => {
    paused = true;
    update();
  };

  return {
    play,
    pause,
    toggle: () => (started && !paused ? pause() : play()),
    replay() {
      setElapsed(0);
      started = true;
      paused = false;
      update();
    },
    seek(ms) {
      if (!Number.isFinite(ms)) throw new LibraryError("invalid_option", { field: "ms" });
      setElapsed(ms);
      update();
    },
    reset() {
      setElapsed(0);
      started = config.autoStart;
      paused = false;
      update();
    },
    setSpeed(next) {
      speed = checkSpeed(next);
      update();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      observer?.disconnect();
      clearTimeout(grace);
      if (frame !== undefined) cancelFrame(frame);
      frame = undefined;
      running = false;
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
      unsubscribeMotion();
      listeners.clear();
    },
    getState: () => state,
    subscribe(callback) {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
  };
}

interface Config {
  readonly autoStart: boolean;
  readonly threshold: number;
  readonly rootMargin: string;
  readonly leaveGraceMs: number;
  readonly motion: MotionPreference | MotionSource;
  readonly reducedPolicy: ReducedPolicy;
  readonly duration: number;
  readonly speed: number;
}

/** A clock rate, finite and greater than 0, or `invalid_option`. */
export function checkSpeed(speed: number): number {
  if (!Number.isFinite(speed) || speed <= 0) {
    throw new LibraryError("invalid_option", { field: "speed" });
  }
  return speed;
}

/**
 * Applies defaults. `speed` is checked, since 0, a negative rate or NaN would freeze, reverse or
 * break the clock; the other values are trusted as typed.
 */
function readOptions(options: PlaybackGateOptions): Config {
  return {
    autoStart: options.autoStart ?? true,
    threshold: options.threshold ?? 0.15,
    rootMargin: options.rootMargin ?? "0px",
    leaveGraceMs: options.leaveGraceMs ?? 0,
    motion: options.motion ?? "auto",
    reducedPolicy: options.reducedPolicy ?? "end",
    duration: options.duration ?? Number.POSITIVE_INFINITY,
    speed: checkSpeed(options.speed ?? 1),
  };
}

function isTabVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

function requestFrame(callback: (time: number) => void): number {
  if (typeof requestAnimationFrame === "function") return requestAnimationFrame(callback);
  return setTimeout(() => callback(performance.now()), 16) as unknown as number;
}

function cancelFrame(id: number): void {
  if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(id);
  else clearTimeout(id);
}
