import GithubSlugger from "github-slugger";
import { defineHastPlugin, type HastPluginDefinition } from "satteri";
import { element, stringProperty } from "./hast.ts";

export interface HeadingAnchorsOptions {
  /** The accessible name of a heading's link, given the heading text. Default "Link to section: <text>". */
  readonly label?: (heading: string) => string;
}

/**
 * Gives section headings their ids and a hover link. Astro's own id pass runs after user plugins
 * and keeps an existing id, so the ids, the links and the table of contents agree.
 *
 * Returns the per-document factory Sätteri expects, so the slugger restarts on every page.
 */
export function headingAnchors(options: HeadingAnchorsOptions = {}): () => HastPluginDefinition {
  const label = options.label ?? ((heading: string): string => `Link to section: ${heading}`);
  return () => {
    const slugger = new GithubSlugger();
    return defineHastPlugin({
      name: "sf-heading-anchors",
      element: {
        filter: ["h2", "h3"],
        visit(node, ctx) {
          const id = stringProperty(node, "id") ?? slugger.slug(ctx.textContent(node));
          ctx.setProperty(node, "id", id);
          ctx.appendChild(
            node,
            element("a", {
              href: `#${id}`,
              dataHeadingAnchor: "",
              ariaLabel: label(ctx.textContent(node)),
            }),
          );
        },
      },
    });
  };
}
