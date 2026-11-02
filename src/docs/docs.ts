// Pure docs rules: navigation, URLs, and the agent-readable exports (llms.txt, llms-full.txt and
// one Markdown file per page). Nothing here touches Astro: the consumer's route files pass in the
// entries from its own `getCollection`, so the same code runs in a unit test.

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
  /** Extra llms.txt text after the summary: one paragraph, or one per array item. Default none. */
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
export function docPath(id: string, trailingSlash: DocsConfig["trailingSlash"]): string {
  const slash = trailingSlash === "always" ? "/" : "";
  return id === "index" ? `/docs${slash}` : `/docs/${id}${slash}`;
}

/** Each page also ships as Markdown at "/docs/<id>.md", whatever the trailing-slash policy. */
export function markdownPath(id: string): string {
  return `/docs/${id}.md`;
}

function link(config: DocsConfig, entry: DocEntry): DocLink {
  return {
    id: entry.id,
    href: docPath(entry.id, config.trailingSlash),
    label: entry.data.sidebarLabel ?? entry.data.title,
    description: entry.data.description,
  };
}

function byOrder(a: DocEntry, b: DocEntry): number {
  return a.data.order - b.data.order || a.id.localeCompare(b.id);
}

/** The sidebar: groups in config order, each page by its `order`, ties by id. Empty groups are left out. */
export function docsNav(config: DocsConfig, entries: readonly DocEntry[]): DocNavGroup[] {
  return config.groups
    .map((title) => ({
      title,
      items: entries
        .filter((entry) => entry.data.group === title)
        .sort(byOrder)
        .map((entry) => link(config, entry)),
    }))
    .filter((group) => group.items.length > 0);
}

/** The pages before and after this one in sidebar order, and the group it sits in. */
export function pageLinks(
  config: DocsConfig,
  entries: readonly DocEntry[],
  id: string,
): { group: string | undefined; previous: DocLink | undefined; next: DocLink | undefined } {
  const nav = docsNav(config, entries);
  const order = nav.flatMap((group) => group.items);
  const index = order.findIndex((item) => item.id === id);
  return {
    group: nav.find((group) => group.items.some((item) => item.id === id))?.title,
    previous: index > 0 ? order[index - 1] : undefined,
    next: index >= 0 ? order[index + 1] : undefined,
  };
}

/** Featured pages in sidebar order: the cards on the docs home. */
export function featuredDocs(config: DocsConfig, entries: readonly DocEntry[]): DocLink[] {
  const isFeatured = config.featured ?? ((entry: DocEntry) => entry.data.featured === true);
  const featured = new Set(entries.filter(isFeatured).map((entry) => entry.id));
  return docsNav(config, entries)
    .flatMap((group) => group.items)
    .filter((item) => featured.has(item.id));
}

function markdownTarget(path: string, site: string): string {
  const [pathname = "", hash] = path.split("#");
  const docs = /^\/docs(?:\/(.+?))?\/?$/.exec(pathname);
  const target = docs ? markdownPath(docs[1] ?? "index") : pathname;
  return `${new URL(target, site).href}${hash === undefined ? "" : `#${hash}`}`;
}

/**
 * The default {@link RewriteLink}: a site-relative link becomes absolute, and a link to a docs
 * page points at that page's Markdown, so a page pasted into an agent's context still resolves.
 * Other links (absolute URLs, anchors, relative paths) are left as written.
 */
export const absoluteLinks: RewriteLink = (href, { site }) =>
  href.startsWith("/") && !href.startsWith("//") ? markdownTarget(href, site) : href;

const markdownLink = /\]\(([^)\s]+)\)/g;

function rewriteBody(body: string, site: string, rewrite: RewriteLink): string {
  const context: RewriteContext = { site, markdownPath };
  let fenced = false;
  return body
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
      if (fenced) return line;
      return line.replace(markdownLink, (_, href: string) => `](${rewrite(href, context)})`);
    })
    .join("\n");
}

function linkList(links: readonly DocLink[], site: string): string {
  return links
    .map((item) => `- [${item.label}](${markdownTarget(item.href, site)}): ${item.description}`)
    .join("\n");
}

/** One page as Markdown for agents: its title and description, then the source body. */
export function pageMarkdown(
  config: DocsConfig,
  entry: DocEntry,
  entries: readonly DocEntry[],
  site: string,
): string {
  const parts = [`# ${entry.data.title}`, `> ${entry.data.description}`];
  const body = (entry.body ?? "").trim();
  if (body) parts.push(rewriteBody(body, site, config.rewriteLink ?? absoluteLinks));
  if (entry.id === "index") {
    parts.push(`## Start here\n\n${linkList(featuredDocs(config, entries), site)}`);
  }
  return `${parts.join("\n\n")}\n`;
}

/** The llms.txt index (llmstxt.org): every docs page by group, as Markdown URLs. */
export function llmsIndex(config: DocsConfig, entries: readonly DocEntry[], site: string): string {
  const absolute = (path: string): string => new URL(path, site).href;
  const nav = docsNav(config, entries);
  const exampleId = config.exampleId ?? nav[0]?.items[0]?.id ?? "index";
  const groups = nav.map((group) => `## ${group.title}\n\n${linkList(group.items, site)}`);
  const optional =
    config.optionalLinks.length === 0
      ? []
      : [
          [
            "## Optional",
            "",
            ...config.optionalLinks.map(
              (item) => `- [${item.label}](${absolute(item.href)}): ${item.description}`,
            ),
          ].join("\n"),
        ];
  return `${[
    `# ${config.name}`,
    `> ${config.summary}`,
    ...(typeof config.intro === "string" ? [config.intro] : (config.intro ?? [])),
    `Every docs page is also Markdown: add \`.md\` to its path, as in ${absolute(markdownPath(exampleId))}. ${absolute("/llms-full.txt")} has every page in one file.`,
    ...groups,
    ...optional,
  ].join("\n\n")}\n`;
}

/** Every docs page in sidebar order, in one file. */
export function llmsFull(config: DocsConfig, entries: readonly DocEntry[], site: string): string {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const pages = docsNav(config, entries)
    .flatMap((group) => group.items)
    .map((item) => byId.get(item.id))
    .filter((entry) => entry !== undefined)
    .map(
      (entry) =>
        `Source: ${new URL(docPath(entry.id, config.trailingSlash), site).href}\n\n${pageMarkdown(config, entry, entries, site).trim()}`,
    );
  return `${pages.join("\n\n---\n\n")}\n`;
}

export interface Docs {
  readonly config: DocsConfig;
  docPath(id: string): string;
  markdownPath(id: string): string;
  docsNav(entries: readonly DocEntry[]): DocNavGroup[];
  pageLinks(
    entries: readonly DocEntry[],
    id: string,
  ): { group: string | undefined; previous: DocLink | undefined; next: DocLink | undefined };
  featuredDocs(entries: readonly DocEntry[]): DocLink[];
  pageMarkdown(entry: DocEntry, entries: readonly DocEntry[], site: string): string;
  llmsIndex(entries: readonly DocEntry[], site: string): string;
  llmsFull(entries: readonly DocEntry[], site: string): string;
}

/**
 * Binds the helpers to one site's config. A route file is then a few lines:
 * `new Response(docs.llmsIndex(await getCollection("docs"), String(site)))`.
 */
export function createDocs(config: DocsConfig): Docs {
  return {
    config,
    docPath: (id) => docPath(id, config.trailingSlash),
    markdownPath,
    docsNav: (entries) => docsNav(config, entries),
    pageLinks: (entries, id) => pageLinks(config, entries, id),
    featuredDocs: (entries) => featuredDocs(config, entries),
    pageMarkdown: (entry, entries, site) => pageMarkdown(config, entry, entries, site),
    llmsIndex: (entries, site) => llmsIndex(config, entries, site),
    llmsFull: (entries, site) => llmsFull(config, entries, site),
  };
}
