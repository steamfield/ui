import { jsx, jsxs } from "react/jsx-runtime";
// src/react/window/demo-window.tsx
/**
* Optional window chrome for a demo: dots, a title and a controls slot over a body. It renders no
* heading element; the consumer supplies one.
*/
function DemoWindow({ title, dots = true, controls, label, className, style, children }) {
	return /* @__PURE__ */ jsxs(label ? "section" : "div", {
		"data-part": "window",
		className,
		style,
		"aria-label": label,
		children: [/* @__PURE__ */ jsxs("div", {
			"data-part": "window-bar",
			children: [
				dots ? /* @__PURE__ */ jsxs("span", {
					"data-part": "window-dots",
					"aria-hidden": "true",
					children: [
						/* @__PURE__ */ jsx("span", { "data-part": "window-dot" }),
						/* @__PURE__ */ jsx("span", { "data-part": "window-dot" }),
						/* @__PURE__ */ jsx("span", { "data-part": "window-dot" })
					]
				}) : null,
				title !== void 0 ? /* @__PURE__ */ jsx("span", {
					"data-part": "window-title",
					children: title
				}) : null,
				controls ? /* @__PURE__ */ jsx("div", {
					"data-part": "window-controls",
					children: controls
				}) : null
			]
		}), /* @__PURE__ */ jsx("div", {
			"data-part": "window-body",
			children
		})]
	});
}
export { DemoWindow };
