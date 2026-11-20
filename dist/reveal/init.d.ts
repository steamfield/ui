import { MotionPreference, MotionSource } from "../internal/motion.js";
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
export declare function initReveal(options?: RevealOptions): () => void;
export type { MotionPreference, MotionSource };