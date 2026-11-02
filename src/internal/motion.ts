// The motion contract shared by every subpath that animates: the `MotionSource` shape a site's
// own motion toggle can satisfy, and the default source behind `"auto"`. `playback` re-exports
// the types as public API.

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

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";
const REDUCE_ANCESTOR = '[data-sf-motion="reduce"]';
const noop = (): void => {};

function fixed(allowed: boolean): MotionSource {
  return { get: () => allowed, subscribe: () => noop };
}

/**
 * The `"auto"` source: motion is allowed unless `prefers-reduced-motion: reduce` matches or `el`
 * sits inside a `[data-sf-motion="reduce"]` element. Both stay live: the media query through its
 * change event, the attribute through a MutationObserver on the document. Without `matchMedia`
 * only the attribute counts; without an element only the media query does.
 */
export function autoMotionSource(el: Element | null = null): MotionSource {
  const query = typeof matchMedia === "function" ? matchMedia(REDUCE_QUERY) : undefined;
  return {
    get: () => !query?.matches && !el?.closest(REDUCE_ANCESTOR),
    subscribe(callback) {
      query?.addEventListener("change", callback);
      let observer: MutationObserver | undefined;
      if (el && typeof MutationObserver === "function") {
        observer = new MutationObserver(callback);
        observer.observe(el.ownerDocument.documentElement, {
          attributes: true,
          attributeFilter: ["data-sf-motion"],
          subtree: true,
        });
      }
      return () => {
        query?.removeEventListener("change", callback);
        observer?.disconnect();
      };
    },
  };
}

/** Resolves a `motion` option to a source for `el`. Call it only in the browser. */
export function motionSourceFor(
  motion: MotionPreference | MotionSource,
  el: Element | null = null,
): MotionSource {
  if (motion === "auto") return autoMotionSource(el);
  if (motion === "reduce") return fixed(false);
  if (motion === "full") return fixed(true);
  return motion;
}
