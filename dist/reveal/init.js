import { motionSourceFor } from "../internal/motion.js";
// src/reveal/init.ts
const CONTAINER = "[data-reveal]";
const noop = () => {};
const defaultDeferred = (el) => el.closest("[data-reveal-defer]") !== null && el.closest("[data-reveal-hydrated]") === null;
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
function initReveal(options = {}) {
	const root = document.documentElement;
	const motion = motionSourceFor(options.motion ?? "auto", root);
	if (typeof IntersectionObserver === "undefined" || !motion.get()) {
		delete root.dataset.motionReady;
		return noop;
	}
	const immediate = options.immediate ?? (() => false);
	const deferred = options.deferred ?? defaultDeferred;
	const readyEvent = options.readyEvent ?? "sf:reveal-ready";
	const released = /* @__PURE__ */ new WeakSet();
	root.dataset.revealLive = "true";
	if (document.readyState === "loading") root.dataset.motionReady = "true";
	const reveal = (el) => {
		el.setAttribute("data-revealed", "true");
		observer.unobserve(el);
	};
	const observer = new IntersectionObserver((entries) => {
		for (const entry of entries) if (entry.isIntersecting) reveal(entry.target);
	}, {
		rootMargin: options.rootMargin ?? "0px 0px -12% 0px",
		threshold: options.threshold ?? 0
	});
	/**
	* Decides every container in `scope` before touching any: `immediate` usually reads layout, and a
	* read after a reveal (or the gate) forces a style pass that makes the next container animate.
	* Returns the writes to apply; a hydrated container is released from deferral for good.
	*/
	const plan = (scope, hydrated) => {
		const targets = [...scope.querySelectorAll(CONTAINER)];
		if (scope instanceof Element && scope.matches(CONTAINER)) targets.unshift(scope);
		const armed = targets.filter((el) => !el.hasAttribute("data-revealed") && (hydrated || !deferred(el)));
		const now = armed.map((el) => immediate(el));
		return () => {
			armed.forEach((el, i) => {
				if (hydrated) released.add(el);
				if (now[i]) reveal(el);
				else observer.observe(el);
			});
		};
	};
	const observe = (scope, hydrated) => plan(scope, hydrated)();
	const onReady = (event) => {
		if (event.target instanceof Element) observe(event.target, true);
	};
	const onFocus = (event) => {
		const target = event.target;
		if (!(target instanceof Element) || !matchesFocusVisible(target)) return;
		const section = target.closest(CONTAINER);
		if (!section || deferred(section) && !released.has(section)) return;
		reveal(section);
	};
	const onMotionChange = () => {
		if (!motion.get()) dispose();
	};
	const mutations = typeof MutationObserver === "undefined" ? void 0 : new MutationObserver((records) => {
		for (const record of records) for (const node of record.addedNodes) if (node instanceof Element) observe(node, false);
	});
	const start = () => {
		const apply = plan(document, false);
		root.dataset.motionReady = "true";
		apply();
		mutations?.observe(document.body ?? root, {
			childList: true,
			subtree: true
		});
	};
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
	else start();
	document.addEventListener(readyEvent, onReady);
	document.addEventListener("focusin", onFocus);
	const unsubscribeMotion = motion.subscribe(onMotionChange);
	let disposed = false;
	function dispose() {
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
function matchesFocusVisible(el) {
	try {
		return el.matches(":focus-visible");
	} catch {
		return true;
	}
}
export { initReveal };
