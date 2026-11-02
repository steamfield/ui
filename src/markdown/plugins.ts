import type { HastPluginDefinition } from "satteri";
import type { ShikiTransformer } from "shiki";
import { type CalloutsOptions, callouts } from "./callouts.ts";
import { type CodeBlocksOptions, codeBlocks, codeGroups } from "./code-blocks.ts";
import { codeMeta } from "./code-meta.ts";
import { type HeadingAnchorsOptions, headingAnchors } from "./heading-anchors.ts";
import { type TablesOptions, tables } from "./tables.ts";

export interface MarkdownOptions {
  readonly codeBlocks?: CodeBlocksOptions;
  readonly callouts?: CalloutsOptions;
  readonly headingAnchors?: HeadingAnchorsOptions;
  readonly tables?: TablesOptions;
}

export interface ShikiOptions {
  readonly theme: "css-variables";
  readonly transformers: ShikiTransformer[];
}

/**
 * The plugin set as factories. Sätteri calls each once per document, so counters and slugs
 * restart on every page. Pass the result as `hastPlugins`.
 */
export function createHastPlugins(
  options: MarkdownOptions = {},
): Array<() => HastPluginDefinition> {
  return [
    codeBlocks(options.codeBlocks),
    codeGroups(),
    callouts(options.callouts),
    headingAnchors(options.headingAnchors),
    tables(options.tables),
  ];
}

/**
 * Shiki settings for the code-block plugins: the `css-variables` theme, so token colors come from
 * `--astro-code-*` variables the site maps to its own tokens, plus the fence-meta transformer.
 */
export function createShikiConfig(): ShikiOptions {
  return { theme: "css-variables", transformers: [codeMeta()] };
}
