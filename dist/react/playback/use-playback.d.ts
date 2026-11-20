import { PlaybackGateOptions } from "../../playback/gate.js";
import { RefCallback } from "react";
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
export type PlaybackRef<T extends Element> = RefCallback<T> & {
  current: T | null;
};
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
/**
 * React state for a demo that plays only while it is on screen, the tab is visible, motion is
 * allowed and the user hasn't paused. SSR-safe: nothing reads the browser during render, every
 * flag starts false and `ready` flips in an effect.
 */
export declare function usePlayback<T extends Element = HTMLDivElement>(options?: UsePlaybackOptions): UsePlaybackResult<T>;