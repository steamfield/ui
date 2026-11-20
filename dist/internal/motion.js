// src/internal/motion.ts
const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";
const REDUCE_ANCESTOR = "[data-sf-motion=\"reduce\"]";
const noop = () => {};
function fixed(allowed) {
	return {
		get: () => allowed,
		subscribe: () => noop
	};
}
/**
* The `"auto"` source: motion is allowed unless `prefers-reduced-motion: reduce` matches or `el`
* sits inside a `[data-sf-motion="reduce"]` element. Both stay live: the media query through its
* change event, the attribute through a MutationObserver on the document that watches only
* `data-sf-motion` attribute changes. Moving `el` into or out of a `[data-sf-motion="reduce"]`
* subtree is not seen until the next attribute change or media query change. Without
* `matchMedia` only the attribute counts; without an element only the media query does.
*/
function autoMotionSource(el = null) {
	const query = typeof matchMedia === "function" ? matchMedia(REDUCE_QUERY) : void 0;
	return {
		get: () => !query?.matches && !el?.closest(REDUCE_ANCESTOR),
		subscribe(callback) {
			query?.addEventListener("change", callback);
			let observer;
			if (el && typeof MutationObserver === "function") {
				observer = new MutationObserver(callback);
				observer.observe(el.ownerDocument.documentElement, {
					attributes: true,
					attributeFilter: ["data-sf-motion"],
					subtree: true
				});
			}
			return () => {
				query?.removeEventListener("change", callback);
				observer?.disconnect();
			};
		}
	};
}
/** Resolves a `motion` option to a source for `el`. Call it only in the browser. */
function motionSourceFor(motion, el = null) {
	if (motion === "auto") return autoMotionSource(el);
	if (motion === "reduce") return fixed(false);
	if (motion === "full") return fixed(true);
	return motion;
}
export { autoMotionSource, motionSourceFor };
