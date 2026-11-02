import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  createPlaybackGate,
  type GateState,
  type PlaybackGate,
  type PlaybackGateOptions,
} from "../../playback/gate.ts";

/**
 * Gate options for `usePlayback`. Changing `duration`, `motion` or an observer option starts a
 * fresh gate at 0; `speed` and `onFrame` change in place. Keep a custom `motion` source stable
 * (module scope or `useMemo`), or every render restarts playback.
 */
export type UsePlaybackOptions = PlaybackGateOptions;

export interface UsePlaybackResult<T extends Element> {
  /** Attach to the element whose visibility gates playback. */
  readonly ref: RefObject<T | null>;
  readonly elapsed: number;
  readonly playing: boolean;
  readonly paused: boolean;
  readonly reduced: boolean;
  readonly complete: boolean;
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
} {
  const ref = useRef<T>(null);
  const [gate, setGate] = useState<PlaybackGate | null>(null);
  const onFrame = useRef(options.onFrame);
  onFrame.current = options.onFrame;
  const speed = useRef(options.speed);
  speed.current = options.speed;
  const hasOnFrame = options.onFrame !== undefined;
  const { autoStart, threshold, rootMargin, leaveGraceMs, motion, reducedPolicy, duration } =
    options;

  useEffect(() => {
    const next = createPlaybackGate(ref.current, {
      ...definedOnly({ autoStart, threshold, rootMargin, leaveGraceMs, motion, reducedPolicy }),
      ...definedOnly({ duration, speed: speed.current }),
      ...(hasOnFrame ? { onFrame: (elapsed: number) => onFrame.current?.(elapsed) } : {}),
    });
    setGate(next);
    return () => {
      next.destroy();
      setGate(null);
    };
  }, [autoStart, threshold, rootMargin, leaveGraceMs, motion, reducedPolicy, duration, hasOnFrame]);

  useEffect(() => {
    if (gate && options.speed !== undefined) gate.setSpeed(options.speed);
  }, [gate, options.speed]);

  const subscribe = useCallback((cb: () => void) => gate?.subscribe(cb) ?? noop, [gate]);
  const snapshot = useCallback(() => gate?.getState() ?? IDLE, [gate]);
  const state = useSyncExternalStore(subscribe, snapshot, idle);
  return { ref, gate, state };
}

/**
 * React state for a demo that plays only while it is on screen, the tab is visible, motion is
 * allowed and the user hasn't paused. SSR-safe: nothing reads the browser during render, every
 * flag starts false and `ready` flips in an effect.
 */
export function usePlayback<T extends Element = HTMLDivElement>(
  options: UsePlaybackOptions = {},
): UsePlaybackResult<T> {
  const { ref, gate, state } = useGate<T>(options);
  const play = useCallback(() => gate?.play(), [gate]);
  const pause = useCallback(() => gate?.pause(), [gate]);
  const toggle = useCallback(() => gate?.toggle(), [gate]);
  const replay = useCallback(() => gate?.replay(), [gate]);
  const seek = useCallback((ms: number) => gate?.seek(ms), [gate]);
  const reset = useCallback(() => gate?.reset(), [gate]);
  return {
    ref,
    elapsed: state.elapsed,
    playing: state.playing,
    paused: state.paused,
    reduced: state.reduced,
    complete: state.complete,
    ready: gate !== null,
    play,
    pause,
    toggle,
    replay,
    seek,
    reset,
  };
}

/** Drops undefined values, which `exactOptionalPropertyTypes` won't pass as "absent". */
function definedOnly<O extends object>(values: O): { [K in keyof O]?: Exclude<O[K], undefined> } {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as {
    [K in keyof O]?: Exclude<O[K], undefined>;
  };
}
