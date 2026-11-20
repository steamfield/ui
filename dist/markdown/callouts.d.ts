import { HastPluginDefinition } from "satteri";
export type CalloutKind = "NOTE" | "TIP" | "WARNING" | "IMPORTANT" | "CAUTION";
export interface CalloutsOptions {
  /** Visible titles by marker, such as `{ WARNING: "Heads up" }`. Unset kinds keep English. */
  readonly titles?: Partial<Readonly<Record<CalloutKind, string>>>;
}
/**
 * Turns GitHub alert blockquotes (`> [!NOTE]`) into labelled callouts. The source stays plain
 * Markdown, which GitHub and agents already read; an unknown marker stays a blockquote.
 *
 * Returns the per-document factory Sätteri expects in `hastPlugins`.
 */
export declare function callouts(options?: CalloutsOptions): () => HastPluginDefinition;