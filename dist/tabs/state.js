import { announce, decodeHash, writeHash } from "./core.js";
// src/tabs/state.ts
function createTabsState(options) {
	let stored = options.selected ?? options.defaultValue;
	let initialized = false;
	const listeners = /* @__PURE__ */ new Set();
	const getState = () => options.controlled?.() ?? stored;
	const store = (value) => {
		if (options.controlled?.() !== void 0 || value === stored) return;
		stored = value;
		for (const listener of [...listeners]) listener();
	};
	const select = (value, { via }) => {
		if (value === getState()) return;
		const tab = options.tabs().find((entry) => entry.value === value);
		if (tab?.disabled) return;
		store(value);
		options.onValueChange?.(value);
		if (via === "hash") return;
		writeHash(tab?.panelId ?? "", options.hash ?? false, via === "keyboard");
		announce(options.target?.() ?? null, options.eventName, value);
	};
	return {
		getState,
		subscribe: (callback) => {
			listeners.add(callback);
			return () => listeners.delete(callback);
		},
		select,
		init: () => {
			if (initialized) return;
			initialized = true;
			const tabs = options.tabs();
			const enabled = (value) => tabs.some((tab) => tab.value === value && !tab.disabled);
			if (enabled(options.selected)) store(options.selected);
			else if (enabled(options.defaultValue)) store(options.defaultValue);
			else store(tabs.find((tab) => !tab.disabled)?.value);
		},
		connectHash: () => {
			const source = options.window === void 0 ? globalThis : options.window;
			if (!options.hash || !source) return () => {};
			const readHash = () => {
				const hash = source.location.hash;
				if (hash.length < 2) return;
				const id = decodeHash(hash);
				const tab = options.tabs().find((entry) => entry.panelId === id && !entry.disabled);
				if (tab) select(tab.value, { via: "hash" });
			};
			readHash();
			source.addEventListener("hashchange", readHash);
			return () => source.removeEventListener("hashchange", readHash);
		}
	};
}
export { createTabsState };
