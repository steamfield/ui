export interface DocMeta {
  title: string;
  description: string;
  group: string;
  order: number;
  sidebarLabel?: string | undefined;
  featured?: boolean | undefined;
}
export interface DocEntry {
  /** The page id: "index" is the docs home, "reference/commands" a nested page. */
  id: string;
  data: DocMeta;
  /** The Markdown source without frontmatter. */
  body?: string | undefined;
}
export interface DocLink {
  id: string;
  href: string;
  label: string;
  description: string;
}
export interface DocNavGroup {
  title: string;
  items: DocLink[];
}
/** A link for llms.txt's "Optional" section. `href` may be absolute or relative to the site. */
export interface OptionalLink {
  label: string;
  href: string;
  description: string;
}
export interface RewriteContext {
  /** The site origin the export is for, such as "https://example.com". */
  readonly site: string;
  /** The path of a docs page's Markdown export, such as "/docs/install.md". */
  readonly markdownPath: (id: string) => string;
}
/**
 * Rewrites the target of one Markdown link (or image) in a page body before it is exported. Return
 * the href unchanged to leave it alone. Links inside code fences are never passed in.
 */
export type RewriteLink = (href: string, context: RewriteContext) => string;
export interface DocsConfig {
  /** Group names in reading order. A page whose `group` isn't listed is left out of the nav. */
  readonly groups: readonly string[];
  /** The product's one-paragraph description, shown under the title in llms.txt. */
  readonly summary: string;
  /** The product name: the llms.txt title. */
  readonly name: string;
  /**
   * Extra llms.txt text after the summary: one paragraph, or one per array item. Empty and
   * whitespace-only entries are dropped. Default none.
   */
  readonly intro?: string | readonly string[] | undefined;
  /** Whether page URLs end in a slash. Must match the site's Astro `trailingSlash` setting. */
  readonly trailingSlash: "always" | "never";
  /** Extra links for llms.txt's "Optional" section. Omitted from the file when empty. */
  readonly optionalLinks: readonly OptionalLink[];
  /** Defaults to {@link absoluteLinks}. */
  readonly rewriteLink?: RewriteLink | undefined;
  /** The page id llms.txt uses in its ".md" example. Defaults to the first page in the nav. */
  readonly exampleId?: string | undefined;
  /** Which pages are cards on the docs home. Defaults to `entry.data.featured`. */
  readonly featured?: ((entry: DocEntry) => boolean) | undefined;
}
/** The docs home is "/docs" or "/docs/", a page "/docs/<id>" or "/docs/<id>/". */
export declare function docPath(id: string, trailingSlash: DocsConfig["trailingSlash"]): string;
/** Each page also ships as Markdown at "/docs/<id>.md", whatever the trailing-slash policy. */
export declare function markdownPath(id: string): string;
/** The sidebar: groups in config order, each page by its `order`, ties by id. Empty groups are left out. */
export declare function docsNav(config: DocsConfig, entries: readonly DocEntry[]): DocNavGroup[];
/** The pages before and after this one in sidebar order, and the group it sits in. */
export declare function pageLinks(config: DocsConfig, entries: readonly DocEntry[], id: string): {
  group: string | undefined;
  previous: DocLink | undefined;
  next: DocLink | undefined;
};
/** Featured pages in sidebar order: the cards on the docs home. */
export declare function featuredDocs(config: DocsConfig, entries: readonly DocEntry[]): DocLink[];
/**
 * The default {@link RewriteLink}: a site-relative link becomes absolute, and a link to a docs
 * page points at that page's Markdown, so a page pasted into an agent's context still resolves.
 * Other links (absolute URLs, anchors, relative paths) are left as written.
 */
export declare const absoluteLinks: RewriteLink;
/** One page as Markdown for agents: its title and description, then the source body. */
export declare function pageMarkdown(config: DocsConfig, entry: DocEntry, entries: readonly DocEntry[], site: string): string;
/** The llms.txt index (llmstxt.org): every docs page by group, as Markdown URLs. */
export declare function llmsIndex(config: DocsConfig, entries: readonly DocEntry[], site: string): string;
/** Every docs page in sidebar order, in one file. */
export declare function llmsFull(config: DocsConfig, entries: readonly DocEntry[], site: string): string;
export interface Docs {
  readonly config: DocsConfig;
  docPath(id: string): string;
  markdownPath(id: string): string;
  docsNav(entries: readonly DocEntry[]): DocNavGroup[];
  pageLinks(entries: readonly DocEntry[], id: string): {
    group: string | undefined;
    previous: DocLink | undefined;
    next: DocLink | undefined;
  };
  featuredDocs(entries: readonly DocEntry[]): DocLink[];
  pageMarkdown(entry: DocEntry, entries: readonly DocEntry[], site: string): string;
  llmsIndex(entries: readonly DocEntry[], site: string): string;
  llmsFull(entries: readonly DocEntry[], site: string): string;
}
/**
 * Binds the helpers to one site's config. A route file is then a few lines:
 * `new Response(docs.llmsIndex(await getCollection("docs"), String(site)))`.
 */
export declare function createDocs(config: DocsConfig): Docs;