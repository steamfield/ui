import { useEffect } from "react";
import type { MotionPreference, MotionSource } from "../../playback/motion.ts";
import { type PlaybackRef, useGate } from "./use-playback.ts";

export interface UseCountUpOptions {
  /** Length of the count in ms. Default 2000. */
  readonly duration?: number;
  /** Set false to hold at 0 until something else (a tab, a step) says go. Default true. */
  readonly enabled?: boolean;
  /** Maps progress 0..1 to 0..1. Default ease-out cubic. */
  readonly easing?: (progress: number) => number;
  /** Default `"auto"`. Under reduced motion the value is `end` straight away. */
  readonly motion?: MotionPreference | MotionSource;
  /** In-view threshold for the attached element. Default 0.15. */
  readonly threshold?: number;
  readonly rootMargin?: string;
}

export interface UseCountUpResult<T extends Element> {
  /** Optional: attach it to count only while the element is on screen. */
  readonly ref: PlaybackRef<T>;
  readonly value: number;
  readonly complete: boolean;
}

const easeOutCubic = (progress: number): number => 1 - (1 - progress) ** 3;

/**
 * Counts from 0 up to `end` once. It runs while the element is in view and the tab is visible,
 * keeps its progress across pauses, and snaps to `end` under reduced motion. The value is derived
 * from the gate's clock on every render, so a StrictMode re-run or a new `end` never freezes it
 * mid-count. The server and first client render return `end`, so markup without JavaScript shows
 * the real number. Intermediate values are floored; the last one is exactly `end`.
 */
export function useCountUp<T extends Element = HTMLElement>(
  end: number,
  options: UseCountUpOptions = {},
): UseCountUpResult<T> {
  const { duration = 2000, enabled = true, easing = easeOutCubic } = options;
  const { ref, gate, state } = useGate<T>({
    autoStart: false,
    duration,
    ...(options.motion === undefined ? {} : { motion: options.motion }),
    ...(options.threshold === undefined ? {} : { threshold: options.threshold }),
    ...(options.rootMargin === undefined ? {} : { rootMargin: options.rootMargin }),
  });

  // `started` turns false when the gate starts over (new options, or the element arriving late),
  // so the count starts again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `state.started` re-runs it on a restart.
  useEffect(() => {
    if (!gate) return;
    if (enabled) gate.play();
    else gate.pause();
  }, [gate, enabled, state.started]);

  if (!gate || state.complete) return { ref, value: end, complete: gate !== null };
  const progress = Math.min(state.elapsed / duration, 1);
  return { ref, value: Math.floor(easing(progress) * end), complete: false };
}
