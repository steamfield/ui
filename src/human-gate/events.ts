/**
 * Which browser input opens the human gate, which analytics events skip it, and the shape of the
 * events it filters. Data only; the rules that use it live in `gate.ts`.
 */

/**
 * Trusted input events that only a person produces.
 *
 * `scroll` is deliberately not one: rendering crawlers scroll to trigger lazy loading. Keyboard
 * and scrollbar scrolling still count through `keydown` and `pointerdown`, and touch scrolling
 * through `touchstart`. `click` is there for screen readers: VoiceOver and NVDA browse mode
 * activate a control with a synthesized click and no pointer or key event the page can see.
 * `focus` and `focusin` cannot be signals: a page script's `element.focus()` produces focus events
 * that are `isTrusted`, so a crawler opens them without input.
 */
export const HUMAN_SIGNALS: readonly [
  "pointermove",
  "pointerdown",
  "keydown",
  "wheel",
  "touchstart",
  "click",
] = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart", "click"] as const;

/**
 * Events that pass before any signal.
 *
 * `$exception` is commonly collected before consent, and a crash before the first interaction may
 * be why there was none. The identity events only fire for signed-in or consented visitors, and
 * posthog-js gives them merge semantics a re-`capture` would not reproduce. `$snapshot` is session
 * replay, which only runs for consented visitors and must not stall behind the gate.
 */
export const UNGATED_EVENTS: ReadonlySet<string> = new Set([
  "$exception",
  "$identify",
  "$create_alias",
  "$merge_dangerously",
  "$set",
  "$groupidentify",
  "$snapshot",
]);

/**
 * Dropped, not held, before a signal: the only way to reach `$pageleave` without a signal is to
 * leave, so holding it would never ship it anyway.
 */
export const DROPPED_UNTIL_HUMAN: ReadonlySet<string> = new Set(["$pageleave"]);

/** How many events are held before a signal, so a long-lived crawler page cannot grow memory. */
export const MAX_HELD = 100;

/**
 * How many backdated pageviews have their shift remembered. Only the next `$pageview` or
 * `$pageleave` reads one, so a handful is plenty.
 */
export const MAX_PAGEVIEW_SHIFTS = 10;

/**
 * The finished event object posthog-js hands to `before_send` (its `CaptureResult`), declared
 * structurally so the package needs no posthog-js types. The gate may set `timestamp` and add
 * `$pageview_id` or correct `$prev_pageview_duration` in `properties`.
 */
export interface GatedEvent {
  event: string;
  properties: Record<string, unknown>;
  uuid?: string;
  timestamp?: Date;
}
