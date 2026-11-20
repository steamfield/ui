import { MotionPreference, MotionSource } from "../internal/motion.js";
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
   * grace period resumes at once, as if it never left. `Infinity` (or anything past 2^31 - 1, the
   * longest `setTimeout` delay) never pauses for leaving: once the element has been in view, it
   * counts as in view until the next element or option change, like a one-shot observer.
   * Default 0.
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
/**
 * A play/pause gate for an on-page demo. It plays only while the element is in view, the tab is
 * visible, motion is allowed and the user hasn't paused, and its optional clock keeps demo time
 * across every pause. Without IntersectionObserver, or with a `null` element, the demo counts as
 * in view. Create it in the browser (an effect), never during server rendering.
 */
export declare function createPlaybackGate(el: Element | null, options?: PlaybackGateOptions): PlaybackGate;