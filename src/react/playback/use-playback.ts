import {
  type RefCallback,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { carryOver, sameInputs } from "../../internal/gate-rebuild.ts";
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

/**
 * The element ref `usePlayback` and `useCountUp` return: a callback ref that also reads and
 * writes like a `RefObject` through `current`, so the gated element may mount late or change.
 */
export type PlaybackRef<T extends Element> = RefCallback<T> & { current: T | null };

export interface UsePlaybackResult<T extends Element> {
  /**
   * Attach to the element whose visibility gates playback. Until one attaches, `autoStart` waits
   * (`play()` still runs the clock, counted as in view). An element that mounts after the first
   * render gets a fresh gate. Swapping one element for another keeps `elapsed`, `started`,
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
  readonly ref: PlaybackRef<T>;
  readonly gate: PlaybackGate | null;
  readonly state: GateState;
  /** Checks the rate and applies it to the gate, or to the first gate when none exists yet. */
  readonly setSpeed: (speed: number) => void;
} {
  const [gate, setGate] = useState<PlaybackGate | null>(null);
  const live = useRef<PlaybackGate | null>(null);
  // The element the live gate observes, and the options it was built with. A different element
  // attached after the gate exists bumps `element` so the gate effect runs again.
  const observed = useRef<Element | null>(null);
  const built = useRef<readonly unknown[] | null>(null);
  const [element, setElement] = useState(0);
  const [ref] = useState(() => {
    let current: T | null = null;
    const attach = (node: T | null): void => {
      if (node === current) return;
      current = node;
      // Only a new node rebuilds. Detaching (null) doesn't: an inline ref callback detaches and
      // reattaches the same node on every commit, and a removed element just reads as out of view.
      if (node && live.current && observed.current !== node) setElement((n) => n + 1);
    };
    return Object.defineProperty(attach, "current", {
      get: () => current,
      set: attach,
    }) as PlaybackRef<T>;
  });
  const onFrame = useRef(options.onFrame);
  onFrame.current = options.onFrame;
  // The rate a new gate starts at: the last one set by the `speed` option or by `setSpeed`, so a
  // rebuilt gate keeps it. `option` is the `speed` option last applied.
  const rate = useRef(options.speed);
  const option = useRef(options.speed);
  const hasOnFrame = options.onFrame !== undefined;
  const { autoStart, threshold, rootMargin, leaveGraceMs, motion, reducedPolicy, duration } =
    options;

  // Builds the gate, and rebuilds it for a new element or new options. It has no cleanup: it
  // replaces the gate itself, so it can keep the gate when the only change is an element bump
  // the run before already picked up (an option change and a swap in one commit build once).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `element` changing means a new node is attached to `ref`, which the effect reads.
  useEffect(() => {
    const node = ref.current;
    const settings = [autoStart, threshold, rootMargin, leaveGraceMs, motion, reducedPolicy];
    const inputs = [...settings, duration, hasOnFrame];
    const prev = live.current;
    const sameOptions = prev !== null && sameInputs(built.current, inputs);
    if (sameOptions && observed.current === node) return;
    // Only an element-to-element swap carries progress. A gate that never had an element starts
    // nothing over: the element it waited for gets a fresh gate.
    const carry = sameOptions && observed.current !== null ? prev?.getState() : undefined;
    prev?.destroy();
    const next = createPlaybackGate(node, {
      ...defined({ threshold, rootMargin, leaveGraceMs, motion, reducedPolicy }),
      // With no element yet, autoStart waits for one rather than playing where nobody sees it.
      // `play()` still runs it, so a clock that never attaches a ref counts as in view.
      ...defined({ autoStart: node === null ? false : autoStart }),
      ...defined({ duration, speed: rate.current }),
      ...(hasOnFrame ? { onFrame: (elapsed: number) => onFrame.current?.(elapsed) } : {}),
    });
    if (carry) carryOver(next, carry);
    live.current = next;
    observed.current = node;
    built.current = inputs;
    setGate(next);
  }, [
    ref,
    element,
    autoStart,
    threshold,
    rootMargin,
    leaveGraceMs,
    motion,
    reducedPolicy,
    duration,
    hasOnFrame,
  ]);

  useEffect(
    () => () => {
      live.current?.destroy();
      live.current = null;
      observed.current = null;
      built.current = null;
      setGate(null);
    },
    [],
  );

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
