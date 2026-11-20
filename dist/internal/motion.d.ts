/**
 * Where a gate learns whether motion is allowed. `get()` returns true while motion is allowed;
 * `subscribe` calls back whenever that may have changed and returns an unsubscribe function.
 * A site's saved motion toggle fits this shape, for example
 * `{ get: () => motionAllowed(store.getSnapshot()), subscribe: store.subscribe }`.
 */
export interface MotionSource {
  readonly get: () => boolean;
  readonly subscribe: (callback: () => void) => () => void;
}
/**
 * `"auto"` follows `prefers-reduced-motion` and any `[data-sf-motion="reduce"]` ancestor, live;
 * `"reduce"` and `"full"` are fixed.
 */
export type MotionPreference = "auto" | "reduce" | "full";