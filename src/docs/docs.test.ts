import { describe, expect, it } from "vitest";
import {
  createDocs,
  type DocEntry,
  type DocMeta,
  type DocsConfig,
  docPath,
  docsNav,
  llmsFull,
  llmsIndex,
  markdownPath,
  pageLinks,
  pageMarkdown,
  type RewriteLink,
} from "./index.ts";

const site = "https://example.com";

const config: DocsConfig = {
  name: "Acme",
  summary: "Acme does things.",
  groups: ["Getting started", "Using Acme", "Reference", "Empty group"],
  trailingSlash: "never",
  optionalLinks: [{ label: "Source", href: "https://example.org/acme", description: "the code" }],
};

function entry(id: string, data: Partial<DocMeta> = {}, body = ""): DocEntry {
  return {
    id,
    body,
    data: {
      title: `Title ${id}`,
      description: `About ${id}`,
      group: "Getting started",
      order: 1,
      ...data,
    },
  };
}

const entries = [
  entry("reference/output", { group: "Reference", order: 2 }),
  entry("index", { title: "Introduction", order: 0 }),
  entry("concepts/verify", { group: "Using Acme", order: 3 }),
  entry("quickstart", { title: "Quickstart", order: 1, featured: true }),
  entry("concepts", {
    group: "Using Acme",
    order: 1,
    sidebarLabel: "Overview",
    featured: true,
  }),
  entry("agents", { order: 1 }),
  entry("unlisted", { group: "Not in config" }),
];

describe("paths", () => {
  it.each([
    ["index", "never", "/docs"],
    ["index", "always", "/docs/"],
    ["reference/commands", "never", "/docs/reference/commands"],
    ["reference/commands", "always", "/docs/reference/commands/"],
  ] as const)("docPath(%s) with trailingSlash %s is %s", (id, policy, expected) => {
    expect(docPath(id, policy)).toBe(expected);
  });

  it("serves Markdown at <id>.md under either policy", () => {
    expect(markdownPath("index")).toBe("/docs/index.md");
    expect(markdownPath("reference/commands")).toBe("/docs/reference/commands.md");
  });
});

describe("docsNav", () => {
  it("orders groups by config and pages by order, breaking ties on id", () => {
    expect(
      docsNav(config, entries).map((group) => [group.title, group.items.map((item) => item.id)]),
    ).toEqual([
      ["Getting started", ["index", "agents", "quickstart"]],
      ["Using Acme", ["concepts", "concepts/verify"]],
      ["Reference", ["reference/output"]],
    ]);
  });

  it("labels a page with its sidebar label and links it by policy", () => {
    const never = docsNav(config, entries)[1]?.items[0];
    expect(never).toEqual({
      id: "concepts",
      href: "/docs/concepts",
      label: "Overview",
      description: "About concepts",
    });
    const always = docsNav({ ...config, trailingSlash: "always" }, entries)[1]?.items[0];
    expect(always?.href).toBe("/docs/concepts/");
  });

  it("is empty with no pages", () => {
    expect(docsNav(config, [])).toEqual([]);
  });
});

describe("pageLinks", () => {
  it("links across a group boundary", () => {
    const links = pageLinks(config, entries, "quickstart");
    expect(links.group).toBe("Getting started");
    expect(links.previous?.id).toBe("agents");
    expect(links.next?.id).toBe("concepts");
  });

  it("has no previous page on the first page and no next page on the last", () => {
    expect(pageLinks(config, entries, "index").previous).toBeUndefined();
    expect(pageLinks(config, entries, "reference/output").next).toBeUndefined();
  });

  it("finds nothing for an unknown page", () => {
    expect(pageLinks(config, entries, "missing")).toEqual({
      group: undefined,
      previous: undefined,
      next: undefined,
    });
  });
});

describe("pageMarkdown", () => {
  const render = (body: string, using: DocsConfig = config): string =>
    pageMarkdown(using, entry("agents", {}, body), entries, site);

  it("starts with the title and description and keeps the body", () => {
    expect(render("Run `tool guide`.")).toBe(
      "# Title agents\n\n> About agents\n\nRun `tool guide`.\n",
    );
  });

  it("omits the body block for an empty page", () => {
    expect(render("")).toBe("# Title agents\n\n> About agents\n");
  });

  it("points docs links at their Markdown and makes other site links absolute", () => {
    const output = render(
      "See [verify](/docs/concepts/verify#outcomes), [home](/docs), [slash](/docs/quickstart/), [privacy](/privacy), [GitHub](https://github.com/x/y), [here](#top) and [rel](./other.md).",
    );
    expect(output).toContain(
      "See [verify](https://example.com/docs/concepts/verify.md#outcomes), [home](https://example.com/docs/index.md), [slash](https://example.com/docs/quickstart.md), [privacy](https://example.com/privacy), [GitHub](https://github.com/x/y), [here](#top) and [rel](./other.md).",
    );
  });

  it("leaves links inside code fences as written", () => {
    const output = render(
      "```md\n[verify](/docs/concepts/verify)\n```\n\n[verify](/docs/concepts/verify)",
    );
    expect(output).toContain("```md\n[verify](/docs/concepts/verify)\n```");
    expect(output).toContain("\n[verify](https://example.com/docs/concepts/verify.md)");
  });

  it("lists the featured pages on the docs home, for either policy", () => {
    const home = entries.find((page) => page.id === "index");
    if (!home) throw new Error("fixture has no home page");
    const expected = [
      "# Introduction",
      "",
      "> About index",
      "",
      "## Start here",
      "",
      "- [Quickstart](https://example.com/docs/quickstart.md): About quickstart",
      "- [Overview](https://example.com/docs/concepts.md): About concepts",
      "",
    ].join("\n");
    expect(pageMarkdown(config, home, entries, site)).toBe(expected);
    expect(pageMarkdown({ ...config, trailingSlash: "always" }, home, entries, site)).toBe(
      expected,
    );
  });

  it("picks featured pages with the featured option", () => {
    const home = entries.find((page) => page.id === "index");
    if (!home) throw new Error("fixture has no home page");
    const output = pageMarkdown(
      { ...config, featured: (page) => page.id === "agents" },
      home,
      entries,
      site,
    );
    expect(output).toContain("- [Title agents](https://example.com/docs/agents.md): About agents");
    expect(output).not.toContain("Quickstart");
  });
});

describe("rewriteLink", () => {
  // rr writes its docs for GitHub, so links are relative file paths: a link to another site page
  // becomes its route, and anything else in the repository becomes a GitHub URL.
  const repoBlob = "https://github.com/acme/tool/blob/main";
  const sitePages = new Set(["install.md", "usage.md"]);
  const rewriteLink: RewriteLink = (href) => {
    if (/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(href)) return href;
    const [path = "", hash] = href.split("#");
    const anchor = hash ? `#${hash}` : "";
    const clean = path.replace(/^\.\//, "");
    if (sitePages.has(clean)) return `/docs/${clean.replace(/\.md$/, "")}/${anchor}`;
    if (clean.startsWith("../")) return `${repoBlob}/${clean.slice(3)}${anchor}`;
    return `${repoBlob}/docs/${clean}${anchor}`;
  };

  it("expresses GitHub-relative rewriting", () => {
    const github = { ...config, trailingSlash: "always", rewriteLink } satisfies DocsConfig;
    const output = pageMarkdown(
      github,
      entry(
        "agents",
        {},
        "[install](./install.md#linux), [guide](CONTRIBUTING.md), [readme](../README.md), [web](https://x.dev), [anchor](#a).",
      ),
      entries,
      site,
    );
    expect(output).toContain(
      `[install](/docs/install/#linux), [guide](${repoBlob}/docs/CONTRIBUTING.md), [readme](${repoBlob}/README.md), [web](https://x.dev), [anchor](#a).`,
    );
  });

  it("receives the site and the Markdown path helper, and skips code fences", () => {
    const seen: string[] = [];
    const spy: RewriteLink = (href, context) => {
      seen.push(href);
      return `${context.site}${context.markdownPath("x")}`;
    };
    const output = pageMarkdown(
      { ...config, rewriteLink: spy },
      entry("agents", {}, "[a](one)\n\n```\n[b](two)\n```"),
      entries,
      site,
    );
    expect(seen).toEqual(["one"]);
    expect(output).toContain("[a](https://example.com/docs/x.md)");
    expect(output).toContain("[b](two)");
  });
});

describe("llmsIndex", () => {
  it("lists every page's Markdown URL under its group, led by the name and summary", () => {
    const text = llmsIndex(config, entries, site);
    const lines = text.split("\n");
    expect(lines[0]).toBe("# Acme");
    expect(lines[2]).toBe("> Acme does things.");
    expect(lines.filter((line) => line.startsWith("- [") && line.includes("/docs/"))).toEqual([
      "- [Introduction](https://example.com/docs/index.md): About index",
      "- [Title agents](https://example.com/docs/agents.md): About agents",
      "- [Quickstart](https://example.com/docs/quickstart.md): About quickstart",
      "- [Overview](https://example.com/docs/concepts.md): About concepts",
      "- [Title concepts/verify](https://example.com/docs/concepts/verify.md): About concepts/verify",
      "- [Title reference/output](https://example.com/docs/reference/output.md): About reference/output",
    ]);
    expect(lines.filter((line) => line.startsWith("## "))).toEqual([
      "## Getting started",
      "## Using Acme",
      "## Reference",
      "## Optional",
    ]);
    expect(text).toContain("- [Source](https://example.org/acme): the code");
    expect(text.endsWith("\n")).toBe(true);
  });

  it("links the same Markdown URLs under either trailing-slash policy", () => {
    expect(llmsIndex({ ...config, trailingSlash: "always" }, entries, site)).toBe(
      llmsIndex(config, entries, site),
    );
  });

  it("resolves a relative optional link against the site and omits the section when empty", () => {
    const relative = llmsIndex(
      { ...config, optionalLinks: [{ label: "Privacy", href: "/privacy/", description: "data" }] },
      entries,
      site,
    );
    expect(relative).toContain("- [Privacy](https://example.com/privacy/): data");
    expect(llmsIndex({ ...config, optionalLinks: [] }, entries, site)).not.toContain("## Optional");
  });

  it("names the first page as the .md example unless exampleId says otherwise", () => {
    expect(llmsIndex(config, entries, site)).toContain("as in https://example.com/docs/index.md.");
    expect(llmsIndex({ ...config, exampleId: "quickstart" }, entries, site)).toContain(
      "as in https://example.com/docs/quickstart.md.",
    );
    expect(llmsIndex(config, [], site)).toContain("as in https://example.com/docs/index.md.");
  });

  it("adds intro paragraphs right after the summary", () => {
    const one = llmsIndex({ ...config, intro: "Run `acme help` first." }, entries, site);
    expect(one.split("\n\n").slice(1, 3)).toEqual([
      "> Acme does things.",
      "Run `acme help` first.",
    ]);
    const many = llmsIndex({ ...config, intro: ["First.", "Second."] }, entries, site);
    expect(many.split("\n\n").slice(1, 4)).toEqual(["> Acme does things.", "First.", "Second."]);
    expect(llmsIndex({ ...config, intro: [] }, entries, site)).toBe(
      llmsIndex(config, entries, site),
    );
  });

  it("points at llms-full.txt", () => {
    expect(llmsIndex(config, entries, site)).toContain("https://example.com/llms-full.txt has");
  });
});

describe("llmsFull", () => {
  const sources = (using: DocsConfig): string[] =>
    llmsFull(using, entries, site)
      .split("\n")
      .filter((line) => line.startsWith("Source: "));

  it("joins every page in sidebar order with its source URL (never)", () => {
    expect(sources(config)).toEqual([
      "Source: https://example.com/docs",
      "Source: https://example.com/docs/agents",
      "Source: https://example.com/docs/quickstart",
      "Source: https://example.com/docs/concepts",
      "Source: https://example.com/docs/concepts/verify",
      "Source: https://example.com/docs/reference/output",
    ]);
  });

  it("uses slash-terminated source URLs under always", () => {
    expect(sources({ ...config, trailingSlash: "always" })[0]).toBe(
      "Source: https://example.com/docs/",
    );
    expect(sources({ ...config, trailingSlash: "always" })[1]).toBe(
      "Source: https://example.com/docs/agents/",
    );
  });

  it("separates pages with a rule and embeds each page's export", () => {
    const text = llmsFull(config, entries, site);
    expect(text.split("\n\n---\n\n")).toHaveLength(6);
    expect(text).toContain("# Title agents\n\n> About agents");
  });
});

describe("createDocs", () => {
  it("binds the config so a route file passes only entries and site", () => {
    const docs = createDocs(config);
    expect(docs.docPath("quickstart")).toBe("/docs/quickstart");
    expect(docs.markdownPath("quickstart")).toBe("/docs/quickstart.md");
    expect(docs.docsNav(entries)).toEqual(docsNav(config, entries));
    expect(docs.pageLinks(entries, "agents")).toEqual(pageLinks(config, entries, "agents"));
    expect(docs.featuredDocs(entries).map((item) => item.id)).toEqual(["quickstart", "concepts"]);
    expect(docs.pageMarkdown(entries[5] as DocEntry, entries, site)).toBe(
      pageMarkdown(config, entries[5] as DocEntry, entries, site),
    );
    expect(docs.llmsIndex(entries, site)).toBe(llmsIndex(config, entries, site));
    expect(docs.llmsFull(entries, site)).toBe(llmsFull(config, entries, site));
    expect(docs.config).toBe(config);
  });
});
