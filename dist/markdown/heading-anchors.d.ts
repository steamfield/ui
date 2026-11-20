import { HastPluginDefinition } from "satteri";
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
export declare function headingAnchors(options?: HeadingAnchorsOptions): () => HastPluginDefinition;