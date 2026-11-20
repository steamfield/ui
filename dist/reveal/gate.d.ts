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
export declare const revealGateScript: string;
/**
 * The CSP source for `revealGateScript`: `"sha256-<base64>"`, ready to quote into
 * `script-src 'sha256-…'`. It changes whenever the snippet does, so read it from here rather than
 * copying it.
 */
export declare const revealGateHash: string;