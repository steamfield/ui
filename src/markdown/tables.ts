import { defineHastPlugin, type HastPluginDefinition } from "satteri";
import { element } from "./hast.ts";

export interface TablesOptions {
  /** The accessible name of the scroll region around each table. Default "Scrollable table". */
  readonly regionLabel?: string;
}

/**
 * Wraps tables in a focusable scroll region, so a wide table scrolls by itself on a phone and a
 * keyboard user can scroll it, and marks header cells as column headers.
 */
export function tables(options: TablesOptions = {}): () => HastPluginDefinition {
  const regionLabel = options.regionLabel ?? "Scrollable table";
  return () =>
    defineHastPlugin({
      name: "sf-tables",
      element: [
        {
          filter: ["table"],
          visit(node, ctx) {
            ctx.wrapNode(
              node,
              element("div", {
                dataTableScroll: "",
                tabIndex: 0,
                role: "region",
                ariaLabel: regionLabel,
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
}
