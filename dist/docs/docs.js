// src/docs/docs.ts
/** The docs home is "/docs" or "/docs/", a page "/docs/<id>" or "/docs/<id>/". */
function docPath(id, trailingSlash) {
	const slash = trailingSlash === "always" ? "/" : "";
	return id === "index" ? `/docs${slash}` : `/docs/${id}${slash}`;
}
/** Each page also ships as Markdown at "/docs/<id>.md", whatever the trailing-slash policy. */
function markdownPath(id) {
	return `/docs/${id}.md`;
}
function link(config, entry) {
	return {
		id: entry.id,
		href: docPath(entry.id, config.trailingSlash),
		label: entry.data.sidebarLabel ?? entry.data.title,
		description: entry.data.description
	};
}
function byOrder(a, b) {
	return a.data.order - b.data.order || a.id.localeCompare(b.id);
}
/** The sidebar: groups in config order, each page by its `order`, ties by id. Empty groups are left out. */
function docsNav(config, entries) {
	return config.groups.map((title) => ({
		title,
		items: entries.filter((entry) => entry.data.group === title).sort(byOrder).map((entry) => link(config, entry))
	})).filter((group) => group.items.length > 0);
}
/** The pages before and after this one in sidebar order, and the group it sits in. */
function pageLinks(config, entries, id) {
	const nav = docsNav(config, entries);
	const order = nav.flatMap((group) => group.items);
	const index = order.findIndex((item) => item.id === id);
	return {
		group: nav.find((group) => group.items.some((item) => item.id === id))?.title,
		previous: index > 0 ? order[index - 1] : void 0,
		next: index >= 0 ? order[index + 1] : void 0
	};
}
/** Featured pages in sidebar order: the cards on the docs home. */
function featuredDocs(config, entries) {
	const isFeatured = config.featured ?? ((entry) => entry.data.featured === true);
	const featured = new Set(entries.filter(isFeatured).map((entry) => entry.id));
	return docsNav(config, entries).flatMap((group) => group.items).filter((item) => featured.has(item.id));
}
function markdownTarget(path, site) {
	const [pathname = "", hash] = path.split("#");
	const docs = /^\/docs(?:\/(.+?))?\/?$/.exec(pathname);
	const target = docs ? markdownPath(docs[1] ?? "index") : pathname;
	return `${new URL(target, site).href}${hash === void 0 ? "" : `#${hash}`}`;
}
/**
* The default {@link RewriteLink}: a site-relative link becomes absolute, and a link to a docs
* page points at that page's Markdown, so a page pasted into an agent's context still resolves.
* Other links (absolute URLs, anchors, relative paths) are left as written.
*/
const absoluteLinks = (href, { site }) => href.startsWith("/") && !href.startsWith("//") ? markdownTarget(href, site) : href;
const markdownLink = /\]\(([^)\s]+)\)/g;
function rewriteBody(body, site, rewrite) {
	const context = {
		site,
		markdownPath
	};
	let fenced = false;
	return body.split("\n").map((line) => {
		if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
		if (fenced) return line;
		return line.replace(markdownLink, (_, href) => `](${rewrite(href, context)})`);
	}).join("\n");
}
function linkList(links, site) {
	return links.map((item) => `- [${item.label}](${markdownTarget(item.href, site)}): ${item.description}`).join("\n");
}
/** One page as Markdown for agents: its title and description, then the source body. */
function pageMarkdown(config, entry, entries, site) {
	const parts = [`# ${entry.data.title}`, `> ${entry.data.description}`];
	const body = (entry.body ?? "").trim();
	if (body) parts.push(rewriteBody(body, site, config.rewriteLink ?? absoluteLinks));
	if (entry.id === "index") parts.push(`## Start here\n\n${linkList(featuredDocs(config, entries), site)}`);
	return `${parts.join("\n\n")}\n`;
}
/** The llms.txt index (llmstxt.org): every docs page by group, as Markdown URLs. */
function llmsIndex(config, entries, site) {
	const absolute = (path) => new URL(path, site).href;
	const nav = docsNav(config, entries);
	const exampleId = config.exampleId ?? nav[0]?.items[0]?.id ?? "index";
	const groups = nav.map((group) => `## ${group.title}\n\n${linkList(group.items, site)}`);
	const optional = config.optionalLinks.length === 0 ? [] : [[
		"## Optional",
		"",
		...config.optionalLinks.map((item) => `- [${item.label}](${absolute(item.href)}): ${item.description}`)
	].join("\n")];
	return `${[
		`# ${config.name}`,
		`> ${config.summary}`,
		...[config.intro ?? []].flat().filter((paragraph) => paragraph.trim() !== ""),
		`Every docs page is also Markdown: add \`.md\` to its path, as in ${absolute(markdownPath(exampleId))}. ${absolute("/llms-full.txt")} has every page in one file.`,
		...groups,
		...optional
	].join("\n\n")}\n`;
}
/** Every docs page in sidebar order, in one file. */
function llmsFull(config, entries, site) {
	const byId = new Map(entries.map((entry) => [entry.id, entry]));
	return `${docsNav(config, entries).flatMap((group) => group.items).map((item) => byId.get(item.id)).filter((entry) => entry !== void 0).map((entry) => `Source: ${new URL(docPath(entry.id, config.trailingSlash), site).href}\n\n${pageMarkdown(config, entry, entries, site).trim()}`).join("\n\n---\n\n")}\n`;
}
/**
* Binds the helpers to one site's config. A route file is then a few lines:
* `new Response(docs.llmsIndex(await getCollection("docs"), String(site)))`.
*/
function createDocs(config) {
	return {
		config,
		docPath: (id) => docPath(id, config.trailingSlash),
		markdownPath,
		docsNav: (entries) => docsNav(config, entries),
		pageLinks: (entries, id) => pageLinks(config, entries, id),
		featuredDocs: (entries) => featuredDocs(config, entries),
		pageMarkdown: (entry, entries, site) => pageMarkdown(config, entry, entries, site),
		llmsIndex: (entries, site) => llmsIndex(config, entries, site),
		llmsFull: (entries, site) => llmsFull(config, entries, site)
	};
}
export { absoluteLinks, createDocs, docPath, docsNav, featuredDocs, llmsFull, llmsIndex, markdownPath, pageLinks, pageMarkdown };
