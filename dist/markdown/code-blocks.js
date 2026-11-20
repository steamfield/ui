import { COPY_COMMAND, COPY_CONTROLS, COPY_LABEL, COPY_RESULT, COPY_ROOT } from "../copy/markup.js";
import { element, hasClass, stringProperty, text } from "./hast.js";
import { defineHastPlugin } from "satteri";
// src/markdown/code-blocks.ts
const copyIcon = () => element("svg", {
	ariaHidden: "true",
	width: "13",
	height: "13",
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	strokeWidth: "2"
}, [element("rect", {
	x: "8",
	y: "8",
	width: "13",
	height: "13",
	rx: "2"
}), element("path", { d: "M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" })]);
/** The hast property name for an attribute: `data-copy-root` is `dataCopyRoot`. */
const prop = (attribute) => attribute.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
function copyControl(id, label, visible) {
	return element("span", {
		dataCodeCopy: "",
		[prop(COPY_ROOT)]: ""
	}, [element("button", {
		type: "button",
		hidden: true,
		[prop(COPY_COMMAND)]: "",
		ariaLabel: label,
		[prop(COPY_CONTROLS)]: [id]
	}, [copyIcon(), element("span", { [prop(COPY_LABEL)]: "" }, [text(visible)])]), element("span", {
		[prop(COPY_RESULT)]: "",
		role: "status",
		ariaLive: "polite"
	})]);
}
/**
* Frames each highlighted block: a figure with its fence title as caption and a copy button.
* Returns the per-document factory Sätteri expects, so ids restart on every page.
*/
function codeBlocks(options = {}) {
	const label = options.copyLabel ?? "Copy code";
	const visible = options.copyText ?? "Copy";
	const prefix = options.idPrefix ?? "code";
	return () => {
		let count = 0;
		return defineHastPlugin({
			name: "sf-code-blocks",
			element: {
				filter: ["pre"],
				visit(node, ctx) {
					if (!hasClass(node, "astro-code")) return;
					count += 1;
					const id = `${prefix}-${count}`;
					const title = stringProperty(node, "data-title");
					const group = stringProperty(node, "data-group");
					const caption = title ? [element("figcaption", { dataCodeTitle: "" }, [text(title)])] : [];
					ctx.replaceNode(node, element("figure", {
						dataCodeBlock: "",
						...group && { dataGroup: group }
					}, [
						...caption,
						{
							...node,
							properties: {
								...node.properties,
								id
							}
						},
						copyControl(id, label, visible)
					]));
				}
			}
		});
	};
}
function isBlank(node) {
	return node?.type === "text" && node.value.trim() === "";
}
function adjacentElement(siblings, index, step) {
	let at = index + step;
	while (isBlank(siblings[at])) at += step;
	const node = siblings[at];
	return node?.type === "element" ? node : void 0;
}
function groupOf(node) {
	if (node?.tagName !== "figure") return void 0;
	return stringProperty(node, "dataGroup");
}
function runPosition(joinsPrevious, joinsNext) {
	if (!joinsPrevious) return "first";
	return joinsNext ? "middle" : "last";
}
/**
* Marks runs of adjacent blocks that share a `group` (a command and its output, before and after)
* so CSS joins them into one frame. Nothing moves, so without CSS they read as stacked blocks.
*/
function codeGroups() {
	return () => defineHastPlugin({
		name: "sf-code-groups",
		element: {
			filter: ["figure"],
			visit(node, ctx) {
				const group = groupOf(node);
				const index = ctx.indexOf(node);
				if (!group || index === void 0) return;
				const siblings = ctx.parent(node).children;
				const joinsPrevious = groupOf(adjacentElement(siblings, index, -1)) === group;
				const joinsNext = groupOf(adjacentElement(siblings, index, 1)) === group;
				if (!joinsPrevious && !joinsNext) return;
				ctx.setProperty(node, "dataGroupPosition", runPosition(joinsPrevious, joinsNext));
			}
		}
	});
}
export { codeBlocks, codeGroups };
