import { defineHastPlugin, type HastNode, type HastPluginDefinition } from "satteri";
import { element } from "./hast.ts";

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
   * caption, else "<heading> table", else "Scrollable table". A label already used on the page
   * gets " 2", " 3" appended, so every region stays unique. `false` drops `role="region"` and the
   * label, keeping a plain focusable scroll box.
   */
  readonly regionLabel?:
    | string
    | false
    | ((table: Readonly<TableElement>, index: number, context: TableLabelContext) => string);
}

// A hast element, typed through `satteri` (which depends on `@types/hast`), so a consumer needs no
// extra types package.
type TableElement = Extract<HastNode, { readonly type: "element" }>;

const HEADINGS = ["h1", "h2", "h3", "h4", "h5", "h6"];

const defaultLabel = (_: Readonly<TableElement>, __: number, context: TableLabelContext): string =>
  context.caption ?? (context.heading ? `${context.heading} table` : "Scrollable table");

/**
 * Wraps tables in a focusable scroll region, so a wide table scrolls by itself on a phone and a
 * keyboard user can scroll it, and marks header cells as column headers.
 */
export function tables(options: TablesOptions = {}): () => HastPluginDefinition {
  const option = options.regionLabel;
  let labelFor = defaultLabel;
  if (typeof option === "string") labelFor = (): string => option;
  else if (typeof option === "function") labelFor = option;
  return () => {
    let heading: string | undefined;
    let index = 0;
    const used = new Map<string, number>();
    const unique = (name: string): string => {
      const count = (used.get(name) ?? 0) + 1;
      used.set(name, count);
      return count === 1 ? name : `${name} ${count}`;
    };
    return defineHastPlugin({
      name: "sf-tables",
      element: [
        {
          filter: HEADINGS,
          visit(node, ctx) {
            heading = ctx.textContent(node).trim() || undefined;
          },
        },
        {
          filter: ["table"],
          visit(node, ctx) {
            const caption = node.children.find(
              (child): child is TableElement =>
                child.type === "element" && child.tagName === "caption",
            );
            const captionText = caption ? ctx.textContent(caption).trim() : "";
            const context: TableLabelContext = {
              ...(captionText ? { caption: captionText } : {}),
              ...(heading ? { heading } : {}),
            };
            const name = option === false ? undefined : unique(labelFor(node, index, context));
            index += 1;
            ctx.wrapNode(
              node,
              element("div", {
                dataTableScroll: "",
                tabIndex: 0,
                ...(name === undefined ? {} : { role: "region", ariaLabel: name }),
              }),
            );
          },
        },
        {
          filter: ["th"],
          visit(node, ctx) {
            ctx.setProperty(node, "scope", "col");
          },
        },
      ],
    });
  };
}
