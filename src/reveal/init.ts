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
   * Whether entrances may run. Checked once at setup and again whenever `prefers-reduced-motion`
   * changes. Default: the media query doesn't ask for reduced motion.
   */
  readonly motionAllowed?: () => boolean;
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
const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";
const noop = (): void => {};

const defaultMotionAllowed = (): boolean =>
  typeof matchMedia !== "function" || !matchMedia(REDUCE_QUERY).matches;

const defaultDeferred = (el: Element): boolean =>
  el.closest("[data-reveal-defer]") !== null && el.closest("[data-reveal-hydrated]") === null;

/**
 * One-shot scroll reveals for `reveal/styles.css`. It sets `data-motion-ready` on `<html>` (the
 * CSS gate), then flips `data-revealed="true"` on each `[data-reveal]` container the first time it
 * enters the viewport or takes keyboard focus. Without IntersectionObserver, or when motion isn't
 * allowed, it does nothing and every section stays visible. If reduced motion turns on later, it
 * removes the gate and stops observing.
 *
 * Call it from a script in `<head>` (it waits for the DOM) or after the DOM is parsed. Returns a
 * disposer that disconnects everything and removes the gate, which leaves all content visible.
 */
export function initReveal(options: RevealOptions = {}): () => void {
  const motionAllowed = options.motionAllowed ?? defaultMotionAllowed;
  if (typeof IntersectionObserver === "undefined" || !motionAllowed()) return noop;
  const immediate = options.immediate ?? (() => false);
  const deferred = options.deferred ?? defaultDeferred;
  const readyEvent = options.readyEvent ?? "sf:reveal-ready";
  const root = document.documentElement;
  const released = new WeakSet<Element>();
  root.dataset.motionReady = "true";

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

  const query = typeof matchMedia === "function" ? matchMedia(REDUCE_QUERY) : undefined;
  const onMotionChange = (): void => {
    if (!motionAllowed()) dispose();
  };

  const start = (): void => observe(document, false);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
  document.addEventListener(readyEvent, onReady);
  document.addEventListener("focusin", onFocus);
  query?.addEventListener("change", onMotionChange);

  let disposed = false;
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    document.removeEventListener("DOMContentLoaded", start);
    document.removeEventListener(readyEvent, onReady);
    document.removeEventListener("focusin", onFocus);
    query?.removeEventListener("change", onMotionChange);
    delete root.dataset.motionReady;
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
