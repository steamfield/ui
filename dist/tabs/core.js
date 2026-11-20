// src/tabs/core.ts
const TAB = "[role=\"tab\"]";
/** The tabs under `scope`, in document order. */
function tabsIn(scope) {
	return [...scope.querySelectorAll(TAB)];
}
function isTabDisabled(tab) {
	return tab.hasAttribute("disabled") || tab.getAttribute("aria-disabled") === "true";
}
/** The id of the panel a tab controls: `aria-controls`, or the fragment of an anchor's `href`. */
function panelIdOf(tab) {
	const controls = tab.getAttribute("aria-controls");
	if (controls) return controls;
	const href = tab.getAttribute("href");
	return href?.startsWith("#") && href.length > 1 ? decodeHash(href) : null;
}
/** A tab's value: its `data-value`, falling back to the id of the panel it controls. */
function tabValue(tab) {
	return tab.dataset.value ?? panelIdOf(tab);
}
/** The tabs under `scope` as the controller sees them. A tab without a value counts as `""`. */
function tabEntries(scope) {
	return tabsIn(scope).map((tab) => ({
		value: tabValue(tab) ?? "",
		disabled: isTabDisabled(tab),
		panelId: panelIdOf(tab)
	}));
}
/**
* The one key rule for both bindings: Enter and Space select the focused tab as a pick; arrows,
* Home and End move focus and, under auto activation only, select as a keyboard move. Null when
* the key does nothing here; otherwise the caller prevents the default.
*/
function tabKeyAction(list, { target, key }, mode) {
	const from = target;
	if (key === "Enter" || key === " ") {
		const tab = from.closest(TAB);
		return tab && list.contains(tab) ? {
			tab,
			focus: false,
			via: "pointer"
		} : null;
	}
	const tab = keyTarget(list, from, key, mode.orientation);
	return tab ? {
		tab,
		focus: true,
		via: mode.activation === "auto" ? "keyboard" : null
	} : null;
}
/**
* The tab a key press should move focus to, or null when the key isn't a tab key. Arrows follow
* `orientation` and wrap; Home and End jump to the ends. Disabled tabs are skipped.
*/
function keyTarget(list, from, key, orientation) {
	const tabs = tabsIn(list).filter((tab) => !isTabDisabled(tab));
	const current = from.closest(TAB);
	const index = current ? tabs.indexOf(current) : -1;
	if (index === -1) return null;
	const next = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
	const prev = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
	if (key === next) return tabs[(index + 1) % tabs.length] ?? null;
	if (key === prev) return tabs[(index - 1 + tabs.length) % tabs.length] ?? null;
	if (key === "Home") return tabs[0] ?? null;
	if (key === "End") return tabs[tabs.length - 1] ?? null;
	return null;
}
/**
* Records the selected panel in the URL. A no-op when `mode` is false. `replace` forces
* `replaceState` even when `mode` is true (arrow-key moves under auto activation).
*/
function writeHash(panelId, mode, replace = false) {
	if (!mode) return;
	const history = globalThis.history;
	const url = `#${encodeURIComponent(panelId)}`;
	if (mode === "replace" || replace) history?.replaceState(history.state, "", url);
	else history?.pushState(null, "", url);
}
/** Dispatches the change as a bubbling CustomEvent from `target`, when a name is configured. */
function announce(target, eventName, value) {
	if (!target || !eventName) return;
	const detail = { value };
	target.dispatchEvent(new CustomEvent(eventName, {
		bubbles: true,
		detail
	}));
}
/** A fragment without its `#`, percent-decoded when it decodes cleanly. */
function decodeHash(hash) {
	const raw = hash.slice(1);
	try {
		return decodeURIComponent(raw);
	} catch {
		return raw;
	}
}
export { announce, decodeHash, isTabDisabled, panelIdOf, tabEntries, tabKeyAction, tabValue, tabsIn, writeHash };
