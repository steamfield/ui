import { element, text } from "./hast.js";
import { defineHastPlugin } from "satteri";
// src/markdown/callouts.ts
const DEFAULT_TITLES = {
	NOTE: "Note",
	TIP: "Tip",
	WARNING: "Warning",
	IMPORTANT: "Important",
	CAUTION: "Caution"
};
const marker = /^\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\][ \t]*(?:\r?\n)?/;
/**
* Turns GitHub alert blockquotes (`> [!NOTE]`) into labelled callouts. The source stays plain
* Markdown, which GitHub and agents already read; an unknown marker stays a blockquote.
*
* Returns the per-document factory Sätteri expects in `hastPlugins`.
*/
function callouts(options = {}) {
	const titles = {
		...DEFAULT_TITLES,
		...options.titles
	};
	return () => defineHastPlugin({
		name: "sf-callouts",
		element: {
			filter: ["blockquote"],
			visit(node, ctx) {
				const paragraph = node.children.find((child) => child.type === "element");
				if (paragraph?.type !== "element" || paragraph.tagName !== "p") return;
				const first = paragraph.children[0];
				if (first?.type !== "text") return;
				const match = marker.exec(first.value);
				if (!match?.[1]) return;
				const kind = match[1];
				const rest = first.value.slice(match[0].length);
				if (rest === "" && paragraph.children.length === 1) ctx.removeNode(paragraph);
				else ctx.replaceNode(first, text(rest));
				ctx.insertBefore(paragraph, element("p", { dataCalloutTitle: "" }, [text(titles[kind])]));
				ctx.setProperty(node, "role", "note");
				ctx.setProperty(node, "dataCallout", kind.toLowerCase());
			}
		}
	});
}
export { callouts };
