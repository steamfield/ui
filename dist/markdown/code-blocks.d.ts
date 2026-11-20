import { HastPluginDefinition } from "satteri";
export interface CodeBlocksOptions {
  /** The button's accessible name. Default "Copy code". */
  readonly copyLabel?: string;
  /** The button's visible text. Default "Copy". */
  readonly copyText?: string;
  /** Prefix for the generated `<pre>` ids (`code-1`, `code-2`, ...). Default "code". */
  readonly idPrefix?: string;
}
/**
 * Frames each highlighted block: a figure with its fence title as caption and a copy button.
 * Returns the per-document factory Sätteri expects, so ids restart on every page.
 */
export declare function codeBlocks(options?: CodeBlocksOptions): () => HastPluginDefinition;
/**
 * Marks runs of adjacent blocks that share a `group` (a command and its output, before and after)
 * so CSS joins them into one frame. Nothing moves, so without CSS they read as stacked blocks.
 */
export declare function codeGroups(): () => HastPluginDefinition;