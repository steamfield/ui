import type { Element, ElementContent, RootContent } from "hast";
import { defineHastPlugin, type HastPluginDefinition } from "satteri";
import { element, hasClass, stringProperty, text } from "./hast.ts";

export interface CodeBlocksOptions {
  /** The button's accessible name. Default "Copy code". */
  readonly copyLabel?: string;
  /** The button's visible text. Default "Copy". */
  readonly copyText?: string;
  /** Prefix for the generated `<pre>` ids (`code-1`, `code-2`, ...). Default "code". */
  readonly idPrefix?: string;
}

const copyIcon = element(
  "svg",
  {
    ariaHidden: "true",
    width: "13",
    height: "13",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
  },
  [
    element("rect", { x: "8", y: "8", width: "13", height: "13", rx: "2" }),
    element("path", { d: "M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" }),
  ],
);

// The markup `enhanceCopyButtons` (@steamfield/ui/copy) activates: hidden until it runs, with the
// live result region beside the button and `aria-controls` naming the code's `<pre>`.
function copyControl(id: string, label: string, visible: string): Element {
  return element("span", { dataCodeCopy: "" }, [
    element(
      "button",
      {
        type: "button",
        hidden: true,
        dataCopyCommand: "",
        ariaLabel: label,
        ariaControls: [id],
      },
      [copyIcon, element("span", { dataCopyLabel: "" }, [text(visible)])],
    ),
    element("span", {
      dataCopyResult: "",
      role: "status",
      ariaLive: "polite",
    }),
  ]);
}

/**
 * Frames each highlighted block: a figure with its fence title as caption and a copy button.
 * Returns the per-document factory Sätteri expects, so ids restart on every page.
 */
export function codeBlocks(options: CodeBlocksOptions = {}): () => HastPluginDefinition {
  const label = options.copyLabel ?? "Copy code";
  const visible = options.copyText ?? "Copy";
  const prefix = options.idPrefix ?? "code";
  return () => {
    let count = 0;
    return defineHastPlugin({
      name: "sf-code-blocks",
      element: {
        filter: ["pre"],
        visit(node, ctx) {
          if (!hasClass(node, "astro-code")) return;
          count += 1;
          const id = `${prefix}-${count}`;
          const title = stringProperty(node, "data-title");
          const group = stringProperty(node, "data-group");
          const caption = title
            ? [element("figcaption", { dataCodeTitle: "" }, [text(title)])]
            : [];
          ctx.setProperty(node, "id", id);
          ctx.wrapNode(
            node,
            element("figure", { dataCodeBlock: "", ...(group && { dataGroup: group }) }, [
              ...caption,
              copyControl(id, label, visible),
            ]),
          );
        },
      },
    });
  };
}

function isBlank(node: RootContent | ElementContent | undefined): boolean {
  return node?.type === "text" && node.value.trim() === "";
}

function adjacentElement(
  siblings: readonly (RootContent | ElementContent)[],
  index: number,
  step: 1 | -1,
): Element | undefined {
  let at = index + step;
  while (isBlank(siblings[at])) at += step;
  const node = siblings[at];
  return node?.type === "element" ? node : undefined;
}

function groupOf(node: Element | undefined): string | undefined {
  if (node?.tagName !== "figure") return undefined;
  return stringProperty(node, "dataGroup");
}

function runPosition(joinsPrevious: boolean, joinsNext: boolean): "first" | "middle" | "last" {
  if (!joinsPrevious) return "first";
  return joinsNext ? "middle" : "last";
}

/**
 * Marks runs of adjacent blocks that share a `group` (a command and its output, before and after)
 * so CSS joins them into one frame. Nothing moves, so without CSS they read as stacked blocks.
 */
export function codeGroups(): () => HastPluginDefinition {
  return () =>
    defineHastPlugin({
      name: "sf-code-groups",
      element: {
        filter: ["figure"],
        visit(node, ctx) {
          const group = groupOf(node);
          const index = ctx.indexOf(node);
          if (!group || index === undefined) return;
          const siblings = ctx.parent(node).children;
          const joinsPrevious = groupOf(adjacentElement(siblings, index, -1)) === group;
          const joinsNext = groupOf(adjacentElement(siblings, index, 1)) === group;
          if (!joinsPrevious && !joinsNext) return;
          ctx.setProperty(node, "dataGroupPosition", runPosition(joinsPrevious, joinsNext));
        },
      },
    });
}
