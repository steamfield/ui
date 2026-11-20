// src/markdown/code-meta.ts
const pair = /([a-z]+)="([^"]*)"/g;
/** Reads `title="…"` and `group="…"` from a code fence's info string; other keys are ignored. */
function parseFenceMeta(raw) {
	const meta = {};
	for (const [, key, value] of (raw ?? "").matchAll(pair)) if ((key === "title" || key === "group") && value) meta[key] = value;
	return meta;
}
/** Carries fence meta onto Shiki's `<pre>`: Sätteri swaps the fence for Shiki's output before any hast plugin runs. */
function codeMeta() {
	return {
		name: "sf-code-meta",
		pre(node) {
			const { title, group } = parseFenceMeta(this.options.meta?.__raw);
			if (title) node.properties["data-title"] = title;
			if (group) node.properties["data-group"] = group;
		}
	};
}
export { codeMeta, parseFenceMeta };
