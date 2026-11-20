import { tabEntries, tabKeyAction, tabValue } from "../../tabs/core.js";
import { createTabsState } from "../../tabs/state.js";
import { jsx } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
// src/react/tabs/tabs.tsx
const TabsContext = createContext({
	base: "tabs",
	selected: void 0,
	hydrated: false,
	activation: "auto",
	orientation: "horizontal",
	keepMounted: true,
	asAnchors: true,
	initial: void 0,
	pick: () => {}
});
const panelId = (base, value) => `${base}-${value}`;
const tabId = (base, value) => `${base}-${value}-tab`;
/**
* Accessible tabs that degrade to anchor links. The server HTML holds every panel and no
* `aria-selected`; after hydration the root gets `data-live` and the component applies ARIA, the
* roving tabindex and `hidden`. Keyboard and hash behavior are shared with `createTabs`.
*/
function Tabs({ value, defaultValue, onValueChange, activation = "auto", orientation = "horizontal", keepMounted = true, asAnchors = true, hash = false, eventName, id, className, children }) {
	const generated = useId();
	const base = id ?? generated;
	const root = useRef(null);
	const [hydrated, setHydrated] = useState(false);
	const [initial] = useState(value ?? defaultValue);
	const latest = useRef({
		value,
		onValueChange,
		hash,
		eventName
	});
	latest.current = {
		value,
		onValueChange,
		hash,
		eventName
	};
	const [state] = useState(() => createTabsState({
		tabs: () => {
			const list = ownList(root.current);
			return list ? tabEntries(list) : [];
		},
		selected: value,
		defaultValue,
		controlled: () => latest.current.value,
		get hash() {
			return latest.current.hash;
		},
		get eventName() {
			return latest.current.eventName;
		},
		onValueChange: (next) => latest.current.onValueChange?.(next),
		target: () => root.current
	}));
	const selected = useSyncExternalStore(state.subscribe, state.getState, state.getState);
	const pick = (next, via) => state.select(next, { via });
	useEffect(() => {
		state.init();
		setHydrated(true);
	}, [state]);
	useEffect(() => hash ? state.connectHash() : void 0, [state, hash]);
	return /* @__PURE__ */ jsx(TabsContext.Provider, {
		value: {
			base,
			selected,
			hydrated,
			activation,
			orientation,
			keepMounted,
			asAnchors,
			initial,
			pick
		},
		children: /* @__PURE__ */ jsx("div", {
			ref: root,
			className,
			"data-part": "tabs",
			"data-orientation": orientation,
			"data-live": hydrated ? "" : void 0,
			children
		})
	});
}
/** This set's own tablist, not one of a `Tabs` nested inside a panel. */
function ownList(root) {
	if (!root) return void 0;
	return [...root.querySelectorAll("[role=\"tablist\"]")].find((list) => list.closest("[data-part=\"tabs\"]") === root);
}
/**
* The `role="tablist"` container. It owns the keys across its tabs: arrows, Home and End move
* focus, and Enter or Space select (`tabKeyAction`).
*/
function TabList({ "aria-label": label, "aria-labelledby": labelledBy, className, children }) {
	const { orientation, activation, pick } = useContext(TabsContext);
	const onKeyDown = (event) => {
		const action = tabKeyAction(event.currentTarget, event, {
			orientation,
			activation
		});
		if (!action) return;
		event.preventDefault();
		if (action.focus) action.tab.focus();
		const next = tabValue(action.tab);
		if (action.via && next !== null) pick(next, action.via);
	};
	return /* @__PURE__ */ jsx("div", {
		role: "tablist",
		"aria-label": label,
		"aria-labelledby": labelledBy,
		"aria-orientation": orientation,
		className,
		"data-part": "tab-list",
		onKeyDown,
		children
	});
}
/** One tab: an anchor to its panel (default) or a button. */
function Tab({ value, disabled = false, className, children }) {
	const { base, selected, hydrated, asAnchors, pick } = useContext(TabsContext);
	const active = selected === value;
	const activate = (event) => {
		event.preventDefault();
		if (!disabled) pick(value, "pointer");
	};
	const props = {
		id: tabId(base, value),
		role: "tab",
		"aria-controls": panelId(base, value),
		"aria-selected": hydrated ? active : void 0,
		tabIndex: hydrated && !active ? -1 : 0,
		className,
		"data-part": "tab",
		"data-value": value,
		"data-state": stateOf(hydrated, active),
		onClick: activate
	};
	if (asAnchors) return /* @__PURE__ */ jsx("a", {
		...props,
		href: disabled ? void 0 : `#${panelId(base, value)}`,
		"aria-disabled": disabled || void 0,
		children
	});
	return /* @__PURE__ */ jsx("button", {
		...props,
		type: "button",
		disabled,
		children
	});
}
/**
* A panel. It is always in the DOM so anchors resolve; after hydration inactive panels are
* `hidden`. With `keepMounted={false}` only the selected panel renders its children.
*/
function TabPanel({ value, className, children }) {
	const { base, selected, hydrated, keepMounted, initial } = useContext(TabsContext);
	const active = selected === value;
	return /* @__PURE__ */ jsx("div", {
		id: panelId(base, value),
		role: "tabpanel",
		"aria-labelledby": tabId(base, value),
		tabIndex: 0,
		hidden: hydrated && !active,
		className,
		"data-part": "tab-panel",
		"data-default": initial === value ? "" : void 0,
		"data-state": stateOf(hydrated, active),
		children: keepMounted || active || !hydrated && selected === void 0 ? children : null
	});
}
/** `data-state` is applied only after hydration, like `aria-selected`. */
function stateOf(hydrated, active) {
	if (!hydrated) return void 0;
	return active ? "active" : "inactive";
}
export { Tab, TabList, TabPanel, Tabs };
