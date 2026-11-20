import { callouts } from "./callouts.js";
import { codeBlocks, codeGroups } from "./code-blocks.js";
import { codeMeta } from "./code-meta.js";
import { headingAnchors } from "./heading-anchors.js";
import { tables } from "./tables.js";
// src/markdown/plugins.ts
/**
* The plugin set as factories. Sätteri calls each once per document, so counters and slugs
* restart on every page. Pass the result as `hastPlugins`.
*/
function createHastPlugins(options = {}) {
	return [
		codeBlocks(options.codeBlocks),
		codeGroups(),
		callouts(options.callouts),
		headingAnchors(options.headingAnchors),
		tables(options.tables)
	];
}
/**
* Shiki settings for the code-block plugins: the `css-variables` theme, so token colors come from
* `--astro-code-*` variables the site maps to its own tokens, plus the fence-meta transformer.
*/
function createShikiConfig() {
	return {
		theme: "css-variables",
		transformers: [codeMeta()]
	};
}
export { createHastPlugins, createShikiConfig };
