/**
 * A minified classic script that sets `data-motion-ready` on `<html>` before first paint, so
 * above-the-fold `[data-reveal]` content never paints visible and then jumps to its start state.
 * It sets the gate only when `initReveal()` would: IntersectionObserver exists,
 * `prefers-reduced-motion: reduce` doesn't match and `<html>` has no `data-sf-motion="reduce"`.
 * Inline it in `<head>`, before any stylesheet that could paint, and keep calling `initReveal()`
 * from your module script: it takes over the gate, and removes it if motion turns out to be off.
 *
 * Astro: `<script is:inline set:html={revealGateScript} />`. A CSP with `script-src` needs a hash
 * or nonce for it.
 */
export const revealGateScript: string =
  '(function(){try{var d=document.documentElement;if("IntersectionObserver"in window&&!(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches)&&!d.closest(\'[data-sf-motion="reduce"]\'))d.setAttribute("data-motion-ready","true")}catch(e){}})();';
