import { CalloutsOptions } from "./callouts.js";
import { CodeBlocksOptions } from "./code-blocks.js";
import { HeadingAnchorsOptions } from "./heading-anchors.js";
import { TablesOptions } from "./tables.js";
import { HastPluginDefinition } from "satteri";
import { ShikiTransformer } from "shiki";
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
export declare function createHastPlugins(options?: MarkdownOptions): Array<() => HastPluginDefinition>;
/**
 * Shiki settings for the code-block plugins: the `css-variables` theme, so token colors come from
 * `--astro-code-*` variables the site maps to its own tokens, plus the fence-meta transformer.
 */
export declare function createShikiConfig(): ShikiOptions;