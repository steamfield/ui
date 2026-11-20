import { HastNode, HastPluginDefinition } from "satteri";
/** What the default label is built from, passed to a `regionLabel` function. */
export interface TableLabelContext {
  /** The text of the table's `<caption>`, if it has one. */
  readonly caption?: string;
  /** The text of the nearest heading before the table, if there is one. */
  readonly heading?: string;
}
export interface TablesOptions {
  /**
   * The accessible name of the scroll region around each table: a string, or a function of the
   * table, its 0-based index in the document and its caption and preceding heading. Default: the
   * caption, else "<heading> table", else "Scrollable table". A label is trimmed, and a blank
   * one falls back to the default. A label already used in the document gets " 2", " 3" (the
   * first number not yet taken) appended, so every region in it stays unique. That covers one
   * document: a page that renders several (a docs index, say) needs a function that prefixes
   * each document's labels, such as its title. `false` drops `role="region"` and the label,
   * keeping a plain focusable scroll box.
   */
  readonly regionLabel?: string | false | ((table: Readonly<TableElement>, index: number, context: TableLabelContext) => string);
}
type TableElement = Extract<HastNode, {
  readonly type: "element";
}>;
/**
 * Wraps tables in a focusable scroll region, so a wide table scrolls by itself on a phone and a
 * keyboard user can scroll it, and marks header cells as column headers.
 */
export declare function tables(options?: TablesOptions): () => HastPluginDefinition;
export {};