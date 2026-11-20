import { CLOSED, CONSENT_ANIMATING, CONSENT_PARTS, createConsentBannerState, resolveBannerOptions } from "../../consent/banner-state.js";
import { createFocusReturn } from "../../consent/focus.js";
import { autoMotionSource } from "../../internal/motion.js";
import { jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
// src/react/consent/consent-banner.tsx
/**
* The consent banner as a React component: the same markup and rules as `mountConsentBanner`.
* It renders nothing on the server and in the first client render, then opens while `store` is
* undecided. The controller decides the entrance once the banner has rendered, from where it
* sits, so a `[data-sf-motion="reduce"]` ancestor turns it off (the delay still applies there:
* the banner can't see its ancestors before it renders). Focus returns as in
* `mountConsentBanner`, also when the component unmounts or `store` changes. Bad props throw
* `LibraryError` `invalid_option` during render.
*/
function ConsentBanner({ store, ...options }) {
	const content = resolveBannerOptions(options);
	const [view, setView] = useState(CLOSED);
	const root = useRef(null);
	const controller = useRef(null);
	const [focus] = useState(createFocusReturn);
	useEffect(() => {
		const banner = createConsentBannerState(store, {
			delayMs: content.delayMs,
			motion: {
				get: () => autoMotionSource(root.current).get(),
				subscribe: () => () => {}
			}
		});
		controller.current = banner;
		const apply = () => {
			const next = banner.getState();
			if (!next.open) focus.restore(root.current);
			setView(next);
		};
		const unsubscribe = banner.subscribe(apply);
		const stop = banner.start();
		apply();
		return () => {
			unsubscribe();
			stop();
		};
	}, [
		store,
		content.delayMs,
		focus
	]);
	useLayoutEffect(() => {
		if (view.open) controller.current?.rendered();
	}, [view]);
	useLayoutEffect(() => () => focus.restore(root.current), [focus]);
	if (!view.open) return null;
	const onFocus = (event) => focus.enter(event.currentTarget, event.relatedTarget);
	return /* @__PURE__ */ jsxs("section", {
		ref: root,
		"aria-label": content.label,
		"data-part": CONSENT_PARTS.root,
		onFocus,
		...view.animate ? { [CONSENT_ANIMATING]: "" } : {},
		children: [/* @__PURE__ */ jsx("p", {
			"data-part": CONSENT_PARTS.message,
			children: content.message
		}), /* @__PURE__ */ jsxs("div", {
			"data-part": CONSENT_PARTS.actions,
			children: [
				content.privacyHref === void 0 ? null : /* @__PURE__ */ jsx("a", {
					href: content.privacyHref,
					"data-part": CONSENT_PARTS.privacy,
					children: content.privacyLabel
				}),
				/* @__PURE__ */ jsx("button", {
					type: "button",
					"data-part": CONSENT_PARTS.decline,
					onClick: store.decline,
					children: content.declineLabel
				}),
				/* @__PURE__ */ jsx("button", {
					type: "button",
					"data-part": CONSENT_PARTS.accept,
					onClick: store.accept,
					children: content.acceptLabel
				})
			]
		})]
	});
}
export { ConsentBanner };
