import { element } from "./hast.js";
import { defineHastPlugin } from "satteri";
// src/markdown/tables.ts
const HEADINGS = [
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6"
];
const defaultLabel = (_, __, context) => context.caption ?? (context.heading ? `${context.heading} table` : "Scrollable table");
/** The trimmed text of a table's `<caption>`, or "" without one. */
function captionOf(node, ctx) {
	const caption = node.children.find((child) => child.type === "element" && child.tagName === "caption");
	return caption ? ctx.textContent(caption).trim() : "";
}
/**
* Wraps tables in a focusable scroll region, so a wide table scrolls by itself on a phone and a
* keyboard user can scroll it, and marks header cells as column headers.
*/
function tables(options = {}) {
	const option = options.regionLabel;
	let labelFor = defaultLabel;
	if (typeof option === "string") labelFor = () => option;
	else if (typeof option === "function") labelFor = option;
	return () => {
		let heading;
		let index = 0;
		const used = /* @__PURE__ */ new Set();
		const unique = (name) => {
			let candidate = name;
			for (let n = 2; used.has(candidate); n++) candidate = `${name} ${n}`;
			used.add(candidate);
			return candidate;
		};
		return defineHastPlugin({
			name: "sf-tables",
			element: [
				{
					filter: HEADINGS,
					visit(node, ctx) {
						heading = ctx.textContent(node).trim() || void 0;
					}
				},
				{
					filter: ["table"],
					visit(node, ctx) {
						const caption = captionOf(node, ctx);
						const context = {
							...caption ? { caption } : {},
							...heading ? { heading } : {}
						};
						const name = option === false ? void 0 : unique(labelFor(node, index, context).trim() || defaultLabel(node, index, context));
						index += 1;
						ctx.wrapNode(node, element("div", {
							dataTableScroll: "",
							tabIndex: 0,
							...name === void 0 ? {} : {
								role: "region",
								ariaLabel: name
							}
						}));
					}
				},
				{
					filter: ["th"],
					visit(node, ctx) {
						ctx.setProperty(node, "scope", "col");
					}
				}
			]
		});
	};
}
export { tables };
