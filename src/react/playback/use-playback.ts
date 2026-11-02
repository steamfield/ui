import { type RefCallback, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  type BoundGate,
  createBoundGate,
  type GateState,
  type PlaybackGate,
  type PlaybackGateOptions,
} from "../../playback/gate.ts";

/**
 * Gate options for `usePlayback`. Changing `duration`, `motion` or an observer option starts
 * over at 0 and keeps the current rate; `speed` and `onFrame` change in place. Keep a custom `motion` source stable
 * (module scope or `useMemo`), or every render restarts playback.
 */
export type UsePlaybackOptions = PlaybackGateOptions;

/**
 * The element ref `usePlayback` and `useCountUp` return: a callback ref that also reads and
 * writes like a `RefObject` through `current`, so the gated element may mount late or change.
 */
export type PlaybackRef<T extends Element> = RefCallback<T> & { current: T | null };

export interface UsePlaybackResult<T extends Element> {
  /**
   * Attach to the element whose visibility gates playback. Until one attaches, `autoStart` waits
   * (`play()` still runs the clock, counted as in view). An element that mounts after the first
   * render starts fresh. Swapping one element for another keeps `elapsed`, `started`,
   * `paused` and the rate; detaching keeps the gate, which then reads as out of view.
   */
  readonly ref: PlaybackRef<T>;
  readonly elapsed: number;
  /** `autoStart`, or `play()`/`replay()` has been called. */
  readonly started: boolean;
  readonly playing: boolean;
  readonly paused: boolean;
  readonly reduced: boolean;
  readonly complete: boolean;
  /** The clock rate: `options.speed` until changed with `setSpeed`. */
  readonly speed: number;
  /**
   * False on the server and on the first client render, true once the gate exists. Render the
   * static or final frame while it's false, and show playback controls only once it's true.
   */
  readonly ready: boolean;
  readonly play: () => void;
  readonly pause: () => void;
  readonly toggle: () => void;
  readonly replay: () => void;
  readonly seek: (ms: number) => void;
  readonly reset: () => void;
  /**
   * Changes the clock rate until `options.speed` changes; a restart keeps it. Throws
   * `invalid_option` on `speed` unless the rate is finite and greater than 0.
   */
  readonly setSpeed: (speed: number) => void;
}

/** Everything off: what the server and the first client render see. */
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

const noop = (): void => {};
const idle = (): GateState => IDLE;

/**
 * A `PlaybackRef` whose writes go to `attach`, so the element may mount late, change or detach.
 * Shared with `useAgentDemo`.
 */
export function playbackRef<T extends Element>(
  attach: (element: Element | null) => void,
): PlaybackRef<T> {
  let current: T | null = null;
  const set = (node: T | null): void => {
    current = node;
    attach(node);
  };
  return Object.defineProperty(set, "current", { get: () => current, set }) as PlaybackRef<T>;
}

/**
 * The gate behind `usePlayback` and `useCountUp`: one `BoundGate` for the hook's life, created
 * during render (it reads nothing from the browser until connected), connected in an effect and
 * read through a store. The gate itself follows the element, the options and the rate.
 */
export function useGate<T extends Element>(
  options: PlaybackGateOptions,
): {
  readonly ref: PlaybackRef<T>;
  /** The gate while connected, else null. */
  readonly gate: PlaybackGate | null;
  readonly state: GateState;
  /** Checks the rate and applies it, connected or not. */
  readonly setSpeed: (speed: number) => void;
} {
  const [bound] = useState(() => createBoundGate(options));
  const [gate, setGate] = useState<BoundGate | null>(null);
  const [ref] = useState(() => playbackRef<T>(bound.attach));

  useEffect(() => {
    bound.connect();
    setGate(bound);
    return () => {
      bound.disconnect();
      setGate(null);
    };
  }, [bound]);

  // Every commit: the gate compares the options itself, restarting only for a real change.
  useEffect(() => {
    bound.configure(options);
  });

  const subscribe = useCallback((cb: () => void) => gate?.subscribe(cb) ?? noop, [gate]);
  const snapshot = useCallback(() => gate?.getState() ?? IDLE, [gate]);
  const state = useSyncExternalStore(subscribe, snapshot, idle);
  return { ref, gate, state, setSpeed: bound.setSpeed };
}

/**
 * React state for a demo that plays only while it is on screen, the tab is visible, motion is
 * allowed and the user hasn't paused. SSR-safe: nothing reads the browser during render, every
 * flag starts false and `ready` flips in an effect.
 */
export function usePlayback<T extends Element = HTMLDivElement>(
  options: UsePlaybackOptions = {},
): UsePlaybackResult<T> {
  const { ref, gate, state, setSpeed } = useGate<T>(options);
  const play = useCallback(() => gate?.play(), [gate]);
  const pause = useCallback(() => gate?.pause(), [gate]);
  const toggle = useCallback(() => gate?.toggle(), [gate]);
  const replay = useCallback(() => gate?.replay(), [gate]);
  const seek = useCallback((ms: number) => gate?.seek(ms), [gate]);
  const reset = useCallback(() => gate?.reset(), [gate]);
  return {
    ref,
    elapsed: state.elapsed,
    started: state.started,
    playing: state.playing,
    paused: state.paused,
    reduced: state.reduced,
    complete: state.complete,
    speed: gate ? state.speed : (options.speed ?? 1),
    ready: gate !== null,
    play,
    pause,
    toggle,
    replay,
    seek,
    reset,
    setSpeed,
  };
}
