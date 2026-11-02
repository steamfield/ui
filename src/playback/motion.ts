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

/** `"auto"` follows `prefers-reduced-motion` live; `"reduce"` and `"full"` are fixed. */
export type MotionPreference = "auto" | "reduce" | "full";

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";
const noop = (): void => {};

function fixed(allowed: boolean): MotionSource {
  return { get: () => allowed, subscribe: () => noop };
}

/** A live `prefers-reduced-motion` source. Without `matchMedia`, motion is allowed. */
function mediaSource(): MotionSource {
  if (typeof matchMedia !== "function") return fixed(true);
  const query = matchMedia(REDUCE_QUERY);
  return {
    get: () => !query.matches,
    subscribe(callback) {
      query.addEventListener("change", callback);
      return () => query.removeEventListener("change", callback);
    },
  };
}

/** Resolves a gate's `motion` option to a source. Call it only in the browser. */
export function motionSourceFor(motion: MotionPreference | MotionSource): MotionSource {
  if (motion === "auto") return mediaSource();
  if (motion === "reduce") return fixed(false);
  if (motion === "full") return fixed(true);
  return motion;
}
