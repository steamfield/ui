import { DEFAULT_COPY_MESSAGES } from "../../copy/messages.js";
import { defined } from "../../internal/options.js";
import { useCopy } from "../copy/use-copy.js";
import { Tab, TabList, TabPanel, Tabs } from "../tabs/tabs.js";
import { jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
// src/react/install-tabs/install-tabs.tsx
const DEFAULT_LABELS = {
	tabList: "Install with",
	prompt: "$",
	copy: DEFAULT_COPY_MESSAGES.label,
	copied: DEFAULT_COPY_MESSAGES.copiedLabel,
	copiedMessage: DEFAULT_COPY_MESSAGES.copied,
	failed: "Copy failed. Select the command and copy it manually."
};
/**
* Install commands in tabs, one per package manager or platform, each with a copy button.
* Without JavaScript every command is in the HTML and reachable through the tab links; the copy
* buttons stay hidden until hydration so there's no dead control.
*/
function InstallTabs({ options, onCopy, labels, resetMs, value, defaultValue, onValueChange, activation, orientation, keepMounted, asAnchors, hash, eventName, id, className }) {
	const text = {
		...DEFAULT_LABELS,
		...labels
	};
	const { copied, failed, copy } = useCopy(resetMs === void 0 ? {} : { resetMs });
	const [internal, setInternal] = useState(defaultValue ?? options[0]?.id);
	const active = value ?? internal;
	const [resultFor, setResultFor] = useState(null);
	const activeRef = useRef(active);
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => setHydrated(true), []);
	if (options.length === 0) return null;
	const switchTo = (next) => {
		if (value === void 0) setInternal(next);
		setResultFor(null);
		onValueChange?.(next);
	};
	const copyOption = async (option) => {
		const ok = await copy(option.command);
		if (activeRef.current === option.id) setResultFor(option.id);
		onCopy?.(option.id, ok);
	};
	const state = (option) => {
		if (resultFor !== option.id) return void 0;
		if (copied) return "copied";
		return failed ? "failed" : void 0;
	};
	const current = options.find((option) => option.id === active) ?? options[0];
	activeRef.current = current?.id;
	const result = current ? state(current) : void 0;
	const optional = defined({
		activation,
		orientation,
		keepMounted,
		asAnchors,
		hash,
		eventName,
		id
	});
	return /* @__PURE__ */ jsxs("div", {
		className,
		"data-part": "install-tabs",
		children: [/* @__PURE__ */ jsxs(Tabs, {
			...optional,
			value: current?.id ?? "",
			onValueChange: switchTo,
			children: [/* @__PURE__ */ jsx(TabList, {
				"aria-label": text.tabList,
				children: options.map((option) => /* @__PURE__ */ jsx(Tab, {
					value: option.id,
					children: option.label
				}, option.id))
			}), options.map((option) => /* @__PURE__ */ jsxs(TabPanel, {
				value: option.id,
				children: [/* @__PURE__ */ jsxs("div", {
					"data-part": "install-command",
					children: [/* @__PURE__ */ jsxs("code", {
						"data-part": "command",
						children: [text.prompt ? /* @__PURE__ */ jsxs("span", {
							"aria-hidden": "true",
							"data-part": "prompt",
							style: { userSelect: "none" },
							children: [text.prompt, " "]
						}) : null, option.command]
					}), /* @__PURE__ */ jsx("button", {
						type: "button",
						hidden: !hydrated,
						"data-part": "copy-button",
						"data-state": state(option),
						onClick: () => {
							copyOption(option);
						},
						children: state(option) === "copied" ? text.copied : text.copy
					})]
				}), option.note ? /* @__PURE__ */ jsx("p", {
					"data-part": "install-note",
					children: option.note
				}) : null]
			}, option.id))]
		}), /* @__PURE__ */ jsxs("span", {
			"data-part": "copy-result",
			"data-state": result,
			role: "status",
			"aria-live": "polite",
			children: [result === "copied" ? text.copiedMessage : null, result === "failed" ? text.failed : null]
		})]
	});
}
export { InstallTabs };
