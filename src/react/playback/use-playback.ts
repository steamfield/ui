import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { defined } from "../../internal/options.ts";
import {
  checkSpeed,
  createPlaybackGate,
  type GateState,
  type PlaybackGate,
  type PlaybackGateOptions,
} from "../../playback/gate.ts";

/**
 * Gate options for `usePlayback`. Changing `duration`, `motion` or an observer option starts a
 * fresh gate at 0 that keeps the current rate; `speed` and `onFrame` change in place. Keep a custom `motion` source stable
 * (module scope or `useMemo`), or every render restarts playback.
 */
export type UsePlaybackOptions = PlaybackGateOptions;

export interface UsePlaybackResult<T extends Element> {
  /** Attach to the element whose visibility gates playback. */
  readonly ref: RefObject<T | null>;
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
   * Changes the clock rate until `options.speed` changes; a rebuilt gate keeps it. Throws
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

/** The gate behind `usePlayback` and `useCountUp`, created in an effect and read through a store. */
export function useGate<T extends Element>(
  options: PlaybackGateOptions,
): {
  readonly ref: RefObject<T | null>;
  readonly gate: PlaybackGate | null;
  readonly state: GateState;
  /** Checks the rate and applies it to the gate, or to the first gate when none exists yet. */
  readonly setSpeed: (speed: number) => void;
} {
  const ref = useRef<T>(null);
  const [gate, setGate] = useState<PlaybackGate | null>(null);
  const live = useRef<PlaybackGate | null>(null);
  const onFrame = useRef(options.onFrame);
  onFrame.current = options.onFrame;
  // The rate a new gate starts at: the last one set by the `speed` option or by `setSpeed`, so a
  // rebuilt gate keeps it. `option` is the `speed` option last applied.
  const rate = useRef(options.speed);
  const option = useRef(options.speed);
  const hasOnFrame = options.onFrame !== undefined;
  const { autoStart, threshold, rootMargin, leaveGraceMs, motion, reducedPolicy, duration } =
    options;

  useEffect(() => {
    const next = createPlaybackGate(ref.current, {
      ...defined({ autoStart, threshold, rootMargin, leaveGraceMs, motion, reducedPolicy }),
      ...defined({ duration, speed: rate.current }),
      ...(hasOnFrame ? { onFrame: (elapsed: number) => onFrame.current?.(elapsed) } : {}),
    });
    live.current = next;
    setGate(next);
    return () => {
      next.destroy();
      live.current = null;
      setGate(null);
    };
  }, [autoStart, threshold, rootMargin, leaveGraceMs, motion, reducedPolicy, duration, hasOnFrame]);

  // Declared after the gate effect, so a speed change in the same commit as a rebuild reaches the
  // new gate.
  useEffect(() => {
    if (options.speed === undefined || options.speed === option.current) return;
    option.current = options.speed;
    rate.current = options.speed;
    live.current?.setSpeed(options.speed);
  }, [options.speed]);

  const setSpeed = useCallback((next: number) => {
    if (live.current) live.current.setSpeed(next);
    else checkSpeed(next);
    rate.current = next;
  }, []);

  const subscribe = useCallback((cb: () => void) => gate?.subscribe(cb) ?? noop, [gate]);
  const snapshot = useCallback(() => gate?.getState() ?? IDLE, [gate]);
  const state = useSyncExternalStore(subscribe, snapshot, idle);
  return { ref, gate, state, setSpeed };
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
