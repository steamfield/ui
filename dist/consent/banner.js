import { LibraryError } from "../internal/errors.js";
import { autoMotionSource } from "../internal/motion.js";
import { CONSENT_ANIMATING, CONSENT_PARTS, createConsentBannerState, resolveBannerOptions } from "./banner-state.js";
import { createFocusReturn } from "./focus.js";
// src/consent/banner.ts
/**
* Shows a consent banner while `store` is undecided: a non-modal labelled region (not a dialog,
* no focus trap, and it never takes focus) with the message, an optional privacy link, a decline
* and an accept button. The buttons call `store.decline()` and `store.accept()`; any decision,
* from the banner or elsewhere, removes it, and `store.reset()` brings it back. If focus is in
* the banner when it goes, focus returns to where it was before it entered the banner. See
* `createConsentBannerState` for the delay and motion rules; the store must outlive the banner.
*
* Each call owns its own banner and returns a function that removes it and stops following the
* store; calling that function again does nothing. Without a `document` it does nothing. Call it
* once the body exists (a deferred or module script) or pass `container`: with neither it throws
* `LibraryError` `invalid_option` with `field: "container"`. Bad options throw `invalid_option`
* naming the field.
*/
function mountConsentBanner(store, options = {}) {
	const content = resolveBannerOptions(options, ["container"]);
	if (typeof document === "undefined") return () => {};
	const container = options.container ?? document.body;
	if (!container) throw new LibraryError("invalid_option", { field: "container" });
	let element;
	const banner = createConsentBannerState(store, {
		delayMs: content.delayMs,
		motion: {
			get: () => autoMotionSource(element ?? container).get(),
			subscribe: () => () => {}
		}
	});
	const focus = createFocusReturn();
	const onFocusIn = (event) => {
		if (element) focus.enter(element, event.relatedTarget);
	};
	const remove = () => {
		if (!element) return;
		focus.restore(element);
		element.remove();
		element = void 0;
	};
	const render = () => {
		if (!banner.getState().open) {
			remove();
			return;
		}
		if (!element) {
			element = build(container.ownerDocument, content, store);
			element.addEventListener("focusin", onFocusIn);
			container.append(element);
			banner.rendered();
		}
		element.toggleAttribute(CONSENT_ANIMATING, banner.getState().animate);
	};
	const unsubscribe = banner.subscribe(render);
	const stop = banner.start();
	render();
	let mounted = true;
	return () => {
		if (!mounted) return;
		mounted = false;
		unsubscribe();
		stop();
		remove();
	};
}
function build(doc, content, store) {
	const part = (tag, name, text) => {
		const node = doc.createElement(tag);
		node.dataset.part = name;
		if (text !== void 0) node.textContent = text;
		return node;
	};
	const root = part("section", CONSENT_PARTS.root);
	root.setAttribute("aria-label", content.label);
	const actions = part("div", CONSENT_PARTS.actions);
	if (content.privacyHref !== void 0) {
		const link = part("a", CONSENT_PARTS.privacy, content.privacyLabel);
		link.href = content.privacyHref;
		actions.append(link);
	}
	const decline = part("button", CONSENT_PARTS.decline, content.declineLabel);
	decline.type = "button";
	decline.addEventListener("click", () => store.decline());
	const accept = part("button", CONSENT_PARTS.accept, content.acceptLabel);
	accept.type = "button";
	accept.addEventListener("click", () => store.accept());
	actions.append(decline, accept);
	root.append(part("p", CONSENT_PARTS.message, content.message), actions);
	return root;
}
export { mountConsentBanner };
