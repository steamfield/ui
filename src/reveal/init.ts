import { type MotionPreference, type MotionSource, motionSourceFor } from "../internal/motion.ts";

// The motion contract lives in `internal`; reveal re-exports its types for the `motion` option.
export type { MotionPreference, MotionSource };

export interface RevealOptions {
  /** IntersectionObserver rootMargin. Default `"0px 0px -12% 0px"`. */
  readonly rootMargin?: string;
  /** IntersectionObserver threshold. Default 0. */
  readonly threshold?: number;
  /**
   * Reveal this container at once instead of waiting for it to scroll in: a deep-link target, an
   * above-the-fold section. Default: none.
   */
  readonly immediate?: (el: Element) => boolean;
  /**
   * Whether entrances may run, using the same contract as the playback gate. `"auto"` (the
   * default) follows `prefers-reduced-motion` and any `[data-sf-motion="reduce"]` on `<html>`;
   * pass a `MotionSource` to follow a site's saved motion toggle. When it turns motion off,
   * reveals tear down and everything shows.
   */
  readonly motion?: MotionPreference | MotionSource;
  /**
   * A container that hydrates late (an island) and isn't ready to animate yet. It is skipped at
   * setup and on focus until `readyEvent` fires from inside it. Default: inside
   * `[data-reveal-defer]` and not inside `[data-reveal-hydrated]`, matching the CSS fallback that
   * keeps such content visible if hydration never happens.
   */
  readonly deferred?: (el: Element) => boolean;
  /** Dispatched (bubbling) from a hydrated island to observe its containers. Default `"sf:reveal-ready"`. */
  readonly readyEvent?: string;
}

const CONTAINER = "[data-reveal]";
const noop = (): void => {};

const defaultDeferred = (el: Element): boolean =>
  el.closest("[data-reveal-defer]") !== null && el.closest("[data-reveal-hydrated]") === null;

/**
 * One-shot scroll reveals for `reveal/styles.css`. It sets `data-motion-ready` on `<html>` (the
 * CSS gate), then flips `data-revealed="true"` on each `[data-reveal]` container the first time it
 * enters the viewport or takes keyboard focus. Without IntersectionObserver, or when motion isn't
 * allowed, it does nothing (and removes a gate `revealGateScript` set) so every section stays
 * visible. If reduced motion turns on later, it removes the gate and stops observing. A gate that
 * `revealGateScript` already set is taken over as is, and `data-reveal-live` on `<html>` marks the
 * takeover so the snippet's fail-open timer leaves the gate alone.
 *
 * Call it from a script in `<head>` (it waits for the DOM) or after the DOM is parsed. Returns a
 * disposer that disconnects everything and removes the gate, which leaves all content visible.
 */
export function initReveal(options: RevealOptions = {}): () => void {
  const root = document.documentElement;
  const motion = motionSourceFor(options.motion ?? "auto", root);
  if (typeof IntersectionObserver === "undefined" || !motion.get()) {
    // `revealGateScript` may have set the gate before a site motion source could veto it.
    delete root.dataset.motionReady;
    return noop;
  }
  const immediate = options.immediate ?? (() => false);
  const deferred = options.deferred ?? defaultDeferred;
  const readyEvent = options.readyEvent ?? "sf:reveal-ready";
  const released = new WeakSet<Element>();
  root.dataset.motionReady = "true";
  // Tells `revealGateScript`'s fallback that the gate is in good hands.
  root.dataset.revealLive = "true";

  const reveal = (el: Element): void => {
    el.setAttribute("data-revealed", "true");
    observer.unobserve(el);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) if (entry.isIntersecting) reveal(entry.target);
    },
    { rootMargin: options.rootMargin ?? "0px 0px -12% 0px", threshold: options.threshold ?? 0 },
  );

  const observe = (scope: ParentNode, hydrated: boolean): void => {
    const targets = [...scope.querySelectorAll(CONTAINER)];
    if (scope instanceof Element && scope.matches(CONTAINER)) targets.unshift(scope);
    for (const el of targets) if (!el.hasAttribute("data-revealed")) arm(el, hydrated);
  };

  /** Reveals or observes one container; a hydrated one is released from deferral for good. */
  const arm = (el: Element, hydrated: boolean): void => {
    if (hydrated) released.add(el);
    else if (deferred(el)) return;
    if (immediate(el)) reveal(el);
    else observer.observe(el);
  };

  const onReady = (event: Event): void => {
    if (event.target instanceof Element) observe(event.target, true);
  };

  const onFocus = (event: FocusEvent): void => {
    const target = event.target;
    if (!(target instanceof Element) || !matchesFocusVisible(target)) return;
    const section = target.closest(CONTAINER);
    if (!section || (deferred(section) && !released.has(section))) return;
    reveal(section);
  };

  const onMotionChange = (): void => {
    if (!motion.get()) dispose();
  };

  // Containers added later (client-side navigation, late renders) need arming too.
  const mutations =
    typeof MutationObserver === "undefined"
      ? undefined
      : new MutationObserver((records) => {
          for (const record of records) {
            for (const node of record.addedNodes) {
              if (node instanceof Element) observe(node, false);
            }
          }
        });
  // Watching starts after the first pass, once the document is parsed: a call from <head> must not
  // arm elements the parser is still adding children to.
  const start = (): void => {
    observe(document, false);
    mutations?.observe(document.body ?? root, { childList: true, subtree: true });
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
  document.addEventListener(readyEvent, onReady);
  document.addEventListener("focusin", onFocus);
  const unsubscribeMotion = motion.subscribe(onMotionChange);

  let disposed = false;
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    mutations?.disconnect();
    document.removeEventListener("DOMContentLoaded", start);
    document.removeEventListener(readyEvent, onReady);
    document.removeEventListener("focusin", onFocus);
    unsubscribeMotion();
    delete root.dataset.motionReady;
    delete root.dataset.revealLive;
  }
  return dispose;
}

function matchesFocusVisible(el: Element): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    // An engine without :focus-visible: treat any focus as keyboard focus.
    return true;
  }
}
