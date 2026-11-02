/**
 * A minified classic script that sets `data-motion-ready` on `<html>` before first paint, so
 * above-the-fold `[data-reveal]` content never paints visible and then jumps to its start state.
 * It sets the gate only when `initReveal()` would: IntersectionObserver exists,
 * `prefers-reduced-motion: reduce` doesn't match and `<html>` has no `data-sf-motion="reduce"`.
 * Inline it in `<head>`, before any stylesheet that could paint, and keep calling `initReveal()`
 * from your module script: it takes over the gate (marking `<html>` with `data-reveal-live`), and
 * removes it if motion turns out to be off.
 *
 * It fails open: if nothing has set `data-reveal-live` 3 seconds later (the module 404'd, was
 * blocked, or threw before `initReveal()` ran), it removes the gate so no content stays hidden.
 *
 * Astro: `<script is:inline set:html={revealGateScript} />`. With a `script-src` CSP, allow it
 * with `'${revealGateHash}'`.
 */
// Without a window (Node, a prerender) the guard skips everything. The empty catch is only for a
// hostile environment, such as a `matchMedia` stub that throws: the snippet must never break the
// page it sits in, and failing to set the gate leaves content visible, which is the safe outcome.
export const revealGateScript: string =
  '(function(){if(typeof window!="undefined"){var d=document.documentElement;try{if("IntersectionObserver"in window&&!(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches)&&!d.closest(\'[data-sf-motion="reduce"]\')){d.setAttribute("data-motion-ready","true");setTimeout(function(){d.hasAttribute("data-reveal-live")||d.removeAttribute("data-motion-ready")},3e3)}}catch(e){}}})();';

/**
 * The CSP source for `revealGateScript`: `"sha256-<base64>"`, ready to quote into
 * `script-src 'sha256-…'`. It changes whenever the snippet does, so read it from here rather than
 * copying it.
 */
export const revealGateHash: string = "sha256-rUjaliym7uME+Z+imjm9hC3pilB0dG97Hyzi/tya8Yo=";
