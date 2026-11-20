import { isTabDisabled, panelIdOf, tabEntries, tabKeyAction, tabValue, tabsIn } from "./core.js";
import { createTabsState } from "./state.js";
// src/tabs/create-tabs.ts
/**
* Turns server-rendered tab markup under `root` into ARIA tabs. The markup is a `[role="tablist"]`
* of `[role="tab"]` elements, each naming its panel with `aria-controls` or `href="#panel-id"`.
* Without JavaScript, anchors plus `tabs/styles.css` keep every panel reachable by deep link.
*
* On setup the root gets `data-live`, which turns off the CSS fallback; the controller then owns
* `aria-selected`, the roving `tabindex`, `data-state` and each panel's `hidden`. A tab's value is
* its `data-value`, or its panel id. The first selection is the enabled tab marked
* `aria-selected="true"`, else the enabled tab whose panel has `data-default` (the panel the no-JS
* CSS shows), else the first enabled tab (`init` in `state.ts`). Returns a function
* that removes the listeners and puts back what setup touched (`data-live`, `aria-selected`,
* `tabindex`, `data-state`, `hidden`, `aria-controls`), so the markup is as it was before.
*/
function createTabs(root, options = {}) {
	const list = root.querySelector("[role=\"tablist\"]");
	if (!list) return () => {};
	const activation = options.activation ?? "auto";
	const orientation = options.orientation ?? (list.getAttribute("aria-orientation") === "vertical" ? "vertical" : "horizontal");
	const restore = snapshot(root, list);
	for (const tab of tabsIn(list)) {
		const panel = panelIdOf(tab);
		if (panel && !tab.hasAttribute("aria-controls")) tab.setAttribute("aria-controls", panel);
	}
	const marked = tabsIn(list).find((tab) => tab.getAttribute("aria-selected") === "true");
	const state = createTabsState({
		tabs: () => tabEntries(list),
		selected: marked ? valueOfTab(marked) : void 0,
		defaultValue: defaultValue(list),
		hash: options.hash ?? false,
		eventName: options.eventName,
		onValueChange: options.onValueChange,
		target: () => root,
		window: root.ownerDocument.defaultView
	});
	const unsubscribe = state.subscribe(() => apply(list, state.getState()));
	state.init();
	apply(list, state.getState());
	root.setAttribute("data-live", "");
	const onClick = (event) => {
		const tab = event.target.closest("[role=\"tab\"]");
		if (!tab || !list.contains(tab)) return;
		event.preventDefault();
		state.select(valueOfTab(tab), { via: "pointer" });
	};
	const onKeyDown = (event) => {
		const action = tabKeyAction(list, event, {
			orientation,
			activation
		});
		if (!action) return;
		event.preventDefault();
		if (action.focus) action.tab.focus();
		if (action.via) state.select(valueOfTab(action.tab), { via: action.via });
	};
	list.addEventListener("click", onClick);
	list.addEventListener("keydown", onKeyDown);
	const disconnect = state.connectHash();
	return () => {
		list.removeEventListener("click", onClick);
		list.removeEventListener("keydown", onKeyDown);
		disconnect();
		unsubscribe();
		restore();
	};
}
const valueOfTab = (tab) => tabValue(tab) ?? "";
const TOUCHED_TAB = [
	"aria-selected",
	"tabindex",
	"data-state",
	"aria-controls"
];
const TOUCHED_PANEL = ["hidden", "data-state"];
/** Records the attributes setup is about to change and returns a function that puts them back. */
function snapshot(root, list) {
	const saved = [[
		root,
		"data-live",
		null
	]];
	const save = (el, names) => {
		for (const name of names) saved.push([
			el,
			name,
			el.getAttribute(name)
		]);
	};
	for (const tab of tabsIn(list)) {
		save(tab, TOUCHED_TAB);
		const id = panelIdOf(tab);
		const panel = id ? list.ownerDocument.getElementById(id) : null;
		if (panel) save(panel, TOUCHED_PANEL);
	}
	return () => {
		for (const [el, name, value] of saved) if (value === null) el.removeAttribute(name);
		else el.setAttribute(name, value);
	};
}
/** The value of the enabled tab whose panel carries `data-default`, the one the no-JS CSS shows. */
function defaultValue(list) {
	const tab = tabsIn(list).find((tab) => {
		const id = panelIdOf(tab);
		const panel = id ? list.ownerDocument.getElementById(id) : null;
		return !isTabDisabled(tab) && panel?.hasAttribute("data-default") === true;
	});
	return tab ? valueOfTab(tab) : void 0;
}
/** Applies the selection: the first tab with `selected` as its value is the active one. */
function apply(list, selected) {
	const tabs = tabsIn(list);
	const current = tabs.find((tab) => valueOfTab(tab) === selected);
	for (const tab of tabs) {
		const active = tab === current;
		tab.setAttribute("aria-selected", String(active));
		tab.tabIndex = active ? 0 : -1;
		tab.dataset.state = active ? "active" : "inactive";
		const id = panelIdOf(tab);
		const panel = id ? list.ownerDocument.getElementById(id) : null;
		if (!panel) continue;
		panel.hidden = !active;
		panel.dataset.state = active ? "active" : "inactive";
	}
}
export { createTabs };
