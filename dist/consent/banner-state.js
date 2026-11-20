import { LibraryError } from "../internal/errors.js";
import { unknownOption } from "../internal/options.js";
// src/consent/banner-state.ts
/** The `data-part` names the banner renders. Public API, like the CSS variables. */
const CONSENT_PARTS = Object.freeze({
	root: "consent",
	message: "consent-message",
	actions: "consent-actions",
	privacy: "consent-privacy",
	decline: "consent-decline",
	accept: "consent-accept"
});
/** Set on the banner's root when it slides in; the stylesheet animates only under it. */
const CONSENT_ANIMATING = "data-sf-animating";
const KNOWN = [
	"message",
	"acceptLabel",
	"declineLabel",
	"privacyLabel",
	"privacyHref",
	"label",
	"delayMs"
];
const MAX_TIMEOUT_MS = 2 ** 31 - 1;
/**
* Applies the defaults and checks the options. `extra` lists keys a binding accepts on top (the
* DOM mount's `container`). A bad `delayMs`, a non-string label or an unknown key throws
* `LibraryError` `invalid_option` naming the field.
*/
function resolveBannerOptions(options, extra = []) {
	const bad = unknownOption(options, [...KNOWN, ...extra]);
	if (bad) throw new LibraryError("invalid_option", { field: bad });
	const delayMs = options.delayMs ?? 1200;
	if (typeof delayMs !== "number" || !(delayMs >= 0 && delayMs <= MAX_TIMEOUT_MS)) throw new LibraryError("invalid_option", { field: "delayMs" });
	const text = (field, fallback) => {
		const given = options[field];
		const value = given === void 0 ? fallback : given;
		if (typeof value !== "string") throw new LibraryError("invalid_option", { field });
		return value;
	};
	return {
		message: text("message", "This site uses analytics to understand how it is used."),
		acceptLabel: text("acceptLabel", "Accept"),
		declineLabel: text("declineLabel", "Decline"),
		privacyLabel: text("privacyLabel", "Privacy"),
		privacyHref: options.privacyHref === void 0 ? void 0 : text("privacyHref", ""),
		label: text("label", "Analytics consent"),
		delayMs
	};
}
/** The closed view: not in the page. */
const CLOSED = Object.freeze({
	open: false,
	animate: false
});
/**
* The banner's rules, shared by `mountConsentBanner` and React `ConsentBanner`. The banner is open
* only while the store is undecided. On start it opens after `delayMs`, or at once when motion is
* off. It opens without animation; once the binding reports it `rendered`, it slides in if motion
* is allowed where it sits. A decision, from the
* banner or anywhere else, closes it. A `reset()` opens it again straight away, since the page
* has long since loaded.
*
* The store must outlive its banners: once it is destroyed the banner hears no more decisions,
* so it stays as it is until it is stopped.
*/
function createConsentBannerState(store, { delayMs, motion }) {
	const listeners = /* @__PURE__ */ new Set();
	let view = CLOSED;
	let timer;
	let entering = false;
	const set = (next) => {
		if (next.open === view.open && next.animate === view.animate) return;
		view = next;
		for (const listener of [...listeners]) listener();
	};
	const cancel = () => {
		clearTimeout(timer);
		timer = void 0;
	};
	const show = () => {
		entering = !view.open;
		set({
			open: true,
			animate: view.animate
		});
	};
	const close = () => {
		cancel();
		entering = false;
		set(CLOSED);
	};
	const open = (delay) => {
		cancel();
		if (!motion.get() || delay === 0) {
			show();
			return;
		}
		timer = setTimeout(() => {
			timer = void 0;
			if (store.getState() === null) show();
		}, delay);
	};
	return {
		getState: () => view,
		subscribe(callback) {
			listeners.add(callback);
			return () => {
				listeners.delete(callback);
			};
		},
		start() {
			const unsubscribe = store.subscribe((state) => {
				if (state === null) open(0);
				else close();
			});
			if (store.getState() === null) open(delayMs);
			return () => {
				unsubscribe();
				close();
			};
		},
		rendered() {
			if (!entering) return;
			entering = false;
			if (motion.get()) set({
				open: true,
				animate: true
			});
		}
	};
}
export { CLOSED, CONSENT_ANIMATING, CONSENT_PARTS, createConsentBannerState, resolveBannerOptions };
