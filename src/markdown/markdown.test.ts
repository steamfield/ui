// @vitest-environment node
import { createSatteriMarkdownProcessor } from "@astrojs/markdown-satteri";
import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";
import { parseFenceMeta } from "./code-meta.ts";
import { createHastPlugins, createShikiConfig, type MarkdownOptions } from "./plugins.ts";

// The same processor and plugins a site's astro.config hands its docs collection.
async function processorFor(options?: MarkdownOptions) {
  return createSatteriMarkdownProcessor({
    syntaxHighlight: "shiki",
    shikiConfig: createShikiConfig(),
    hastPlugins: createHastPlugins(options),
    features: { smartPunctuation: false },
  });
}

const processor = await processorFor();

async function render(markdown: string, using = processor) {
  const result = await using.render(markdown, {});
  const root = new Window().document.createElement("div") as unknown as HTMLElement;
  root.innerHTML = result.code;
  return { root, headings: result.metadata.headings };
}

const fence = (code: string, meta = "", lang = "sh") => `\`\`\`${lang} ${meta}\n${code}\n\`\`\``;

const positions = (root: HTMLElement) =>
  [...root.querySelectorAll("figure")].map((figure) => figure.getAttribute("data-group-position"));

describe("fence meta", () => {
  it("reads title and group and ignores other keys", () => {
    expect(parseFenceMeta('title="Terminal" group="new" theme="x"')).toEqual({
      title: "Terminal",
      group: "new",
    });
  });

  it("returns nothing for a fence without meta", () => {
    expect(parseFenceMeta(undefined)).toEqual({});
  });
});

describe("code blocks", () => {
  it("captions a titled block and pairs it with a copy button for its code", async () => {
    const { root } = await render(fence("verify", 'title="Terminal"'));
    const figure = root.querySelector("figure");
    const pre = figure?.querySelector("pre");
    const button = figure?.querySelector("button");
    expect(figure?.querySelector("figcaption")?.textContent).toBe("Terminal");
    expect(pre?.textContent).toBe("verify");
    expect(button?.getAttribute("aria-controls")).toBe(pre?.id);
    expect(button?.getAttribute("aria-label")).toBe("Copy code");
    expect(button?.hasAttribute("data-copy-command")).toBe(true);
    expect(button?.hidden).toBe(true);
    expect(button?.querySelector("[data-copy-label]")?.textContent).toBe("Copy");
  });

  it("puts the result region beside the button, inside the copy wrapper", async () => {
    const { root } = await render(fence("verify"));
    const result = root.querySelector("[data-code-copy] [data-copy-result]");
    expect(result?.getAttribute("role")).toBe("status");
    expect(result?.getAttribute("aria-live")).toBe("polite");
    expect(root.querySelector("[data-code-copy] button")).not.toBeNull();
  });

  it("frames an untitled block without a caption", async () => {
    const { root } = await render(fence("doctor"));
    expect(root.querySelectorAll("figure")).toHaveLength(1);
    expect(root.querySelector("figcaption")).toBeNull();
  });

  it("gives every block on a page its own id, including one inside a list", async () => {
    const { root } = await render(
      [
        fence("one"),
        "1. Step",
        `   ${fence("two").replaceAll("\n", "\n   ")}`,
        "",
        fence("three"),
      ].join("\n\n"),
    );
    const ids = [...root.querySelectorAll("pre")].map((pre) => pre.id);
    expect(ids).toEqual(["code-1", "code-2", "code-3"]);
    expect(root.querySelector("li figure pre")?.textContent).toBe("two");
  });

  it("restarts ids on the next page", async () => {
    await render(fence("first page"));
    const { root } = await render(fence("second page"));
    expect(root.querySelector("pre")?.id).toBe("code-1");
  });

  it("takes its strings and id prefix from options", async () => {
    const custom = await processorFor({
      codeBlocks: { copyLabel: "Copier le code", copyText: "Copier", idPrefix: "snippet" },
    });
    const { root } = await render(fence("x"), custom);
    const button = root.querySelector("button");
    expect(button?.getAttribute("aria-label")).toBe("Copier le code");
    expect(button?.querySelector("[data-copy-label]")?.textContent).toBe("Copier");
    expect(root.querySelector("pre")?.id).toBe("snippet-1");
    expect(button?.getAttribute("aria-controls")).toBe("snippet-1");
  });
});

describe("code groups", () => {
  it("joins adjacent blocks that share a group, in order", async () => {
    const { root } = await render(
      [
        fence("tool new demo", 'title="Command" group="new"'),
        fence("Wrote demo/BRIEF.md", 'title="Output" group="new"', "text"),
      ].join("\n\n"),
    );
    expect(positions(root)).toEqual(["first", "last"]);
  });

  it("marks the blocks between the ends of a longer run as middle", async () => {
    const blocks = ["a", "b", "c"].map((code) => fence(code, 'group="x"'));
    const { root } = await render(blocks.join("\n\n"));
    expect(positions(root)).toEqual(["first", "middle", "last"]);
  });

  it("does not join blocks separated by a paragraph", async () => {
    const { root } = await render(
      [fence("a", 'group="x"'), "Then:", fence("b", 'group="x"')].join("\n\n"),
    );
    expect(positions(root)).toEqual([null, null]);
  });

  it("does not join neighbours from different groups", async () => {
    const { root } = await render([fence("a", 'group="x"'), fence("b", 'group="y"')].join("\n\n"));
    expect(root.querySelectorAll("[data-group-position]")).toHaveLength(0);
  });
});

describe("callouts", () => {
  it.each([
    ["NOTE", "note", "Note"],
    ["TIP", "tip", "Tip"],
    ["WARNING", "warning", "Warning"],
    ["IMPORTANT", "important", "Important"],
    ["CAUTION", "caution", "Caution"],
  ])("renders > [!%s] as a labelled note", async (marker, kind, title) => {
    const { root } = await render(`> [!${marker}]\n> Run **verify** first.`);
    const callout = root.querySelector('[role="note"]');
    expect(callout?.getAttribute("data-callout")).toBe(kind);
    expect(callout?.querySelector("[data-callout-title]")?.textContent).toBe(title);
    expect(callout?.textContent).not.toContain(`[!${marker}]`);
    expect(callout?.querySelector("strong")?.textContent).toBe("verify");
  });

  it("drops the marker's own paragraph when the body starts in the next one", async () => {
    const { root } = await render("> [!TIP]\n>\n> Body text.");
    const paragraphs = [...(root.querySelectorAll('[role="note"] p') ?? [])].map(
      (p) => p.textContent,
    );
    expect(paragraphs).toEqual(["Tip", "Body text."]);
  });

  it("leaves an unknown marker as a plain quote", async () => {
    const { root } = await render("> [!FOO]\n> Text.");
    expect(root.querySelector("blockquote")?.getAttribute("role")).toBeNull();
  });

  it("leaves a marker that isn't at the start as a plain quote", async () => {
    const { root } = await render("> Text and [!NOTE] later.");
    expect(root.querySelector('[role="note"]')).toBeNull();
  });

  it("uses titles from options and keeps English for the rest", async () => {
    const custom = await processorFor({ callouts: { titles: { WARNING: "Attention" } } });
    const warning = await render("> [!WARNING]\n> Careful.", custom);
    const tip = await render("> [!TIP]\n> Hint.", custom);
    expect(warning.root.querySelector("[data-callout-title]")?.textContent).toBe("Attention");
    expect(tip.root.querySelector("[data-callout-title]")?.textContent).toBe("Tip");
  });
});

describe("headings", () => {
  it("links each section heading to itself and reports clean heading text", async () => {
    const { root, headings } = await render("## Run `verify`\n\n### Read the report");
    expect(headings).toEqual([
      { depth: 2, slug: "run-verify", text: "Run verify" },
      { depth: 3, slug: "read-the-report", text: "Read the report" },
    ]);
    const anchor = root.querySelector("h2 a[data-heading-anchor]");
    expect(anchor?.getAttribute("href")).toBe("#run-verify");
    expect(anchor?.getAttribute("aria-label")).toBe("Link to section: Run verify");
    expect(root.querySelector("h2")?.id).toBe("run-verify");
  });

  it("numbers a repeated heading", async () => {
    const { headings } = await render("## Examples\n\n## Examples");
    expect(headings.map((heading) => heading.slug)).toEqual(["examples", "examples-1"]);
  });

  it("restarts numbering on the next page", async () => {
    await render("## Examples\n\n## Examples");
    const { headings } = await render("## Examples");
    expect(headings.map((heading) => heading.slug)).toEqual(["examples"]);
  });

  it("takes the link label from options", async () => {
    const custom = await processorFor({
      headingAnchors: { label: (heading) => `Aller à ${heading}` },
    });
    const { root } = await render("## Install", custom);
    expect(root.querySelector("h2 a")?.getAttribute("aria-label")).toBe("Aller à Install");
  });
});

describe("tables", () => {
  const table = "| Flag | Meaning |\n| --- | --- |\n| `--json` | One result |";

  it("puts a table in a focusable, labelled scroll region with column headers", async () => {
    const { root } = await render(table);
    const box = root.querySelector("[data-table-scroll]");
    expect(box?.getAttribute("tabindex")).toBe("0");
    expect(box?.getAttribute("role")).toBe("region");
    expect(box?.getAttribute("aria-label")).toBe("Scrollable table");
    expect([...(box?.querySelectorAll("th") ?? [])].map((th) => th.getAttribute("scope"))).toEqual([
      "col",
      "col",
    ]);
  });

  it("takes the region label from options", async () => {
    const custom = await processorFor({ tables: { regionLabel: "Tableau" } });
    const { root } = await render(table, custom);
    expect(root.querySelector("[data-table-scroll]")?.getAttribute("aria-label")).toBe("Tableau");
  });

  const labels = (root: HTMLElement) =>
    [...root.querySelectorAll("[data-table-scroll]")].map((box) => box.getAttribute("aria-label"));

  it("names each region after its preceding heading, so two tables differ", async () => {
    const { root } = await render(`## Flags\n\n${table}\n\n## Exit codes\n\n${table}`);
    expect(labels(root)).toEqual(["Flags table", "Exit codes table"]);
  });

  it("prefers a caption, falls back without a heading and never repeats a label", async () => {
    // Raw HTML only becomes elements (a table with a caption) with Sätteri's rawHtml feature.
    const raw = await createSatteriMarkdownProcessor({
      hastPlugins: createHastPlugins(),
      features: { smartPunctuation: false, rawHtml: true },
    });
    const html = "<table><caption>Ports</caption><tr><td>80</td></tr></table>";
    const { root } = await render(
      `${table}\n\n${table}\n\n## Flags\n\n${html}\n\n${table}\n\n${table}`,
      raw,
    );
    expect(labels(root)).toEqual([
      "Scrollable table",
      "Scrollable table 2",
      "Ports",
      "Flags table",
      "Flags table 2",
    ]);
  });

  it("never reuses a label, even when a caption already took the numbered one", async () => {
    const raw = await createSatteriMarkdownProcessor({
      hastPlugins: createHastPlugins(),
      features: { smartPunctuation: false, rawHtml: true },
    });
    const html = "<table><caption>Ports table 2</caption><tr><td>80</td></tr></table>";
    const { root } = await render(`## Ports\n\n${html}\n\n${table}\n\n${table}`, raw);
    expect(labels(root)).toEqual(["Ports table 2", "Ports table", "Ports table 3"]);
  });

  it("falls back to the default label when a function returns blank text, and trims", async () => {
    const custom = await processorFor({
      tables: { regionLabel: (_, index) => (index === 0 ? "   " : "  Spaced  ") },
    });
    const { root } = await render(`## Flags\n\n${table}\n\n${table}`, custom);
    expect(labels(root)).toEqual(["Flags table", "Spaced"]);
  });

  it("takes a label function with the table, its index and its context", async () => {
    const custom = await processorFor({
      tables: {
        regionLabel: (node, index, { heading }) => `${node.tagName} ${index} ${heading ?? "none"}`,
      },
    });
    const { root } = await render(`${table}\n\n## Flags\n\n${table}`, custom);
    expect(labels(root)).toEqual(["table 0 none", "table 1 Flags"]);
  });

  it("keeps a fixed string label unique across tables", async () => {
    const custom = await processorFor({ tables: { regionLabel: "Data" } });
    const { root } = await render(`${table}\n\n${table}`, custom);
    expect(labels(root)).toEqual(["Data", "Data 2"]);
  });

  it("regionLabel: false keeps a focusable scroll box without a region", async () => {
    const custom = await processorFor({ tables: { regionLabel: false } });
    const { root } = await render(`${table}\n\n${table}`, custom);
    const boxes = [...root.querySelectorAll("[data-table-scroll]")];
    expect(boxes).toHaveLength(2);
    for (const box of boxes) {
      expect(box.getAttribute("tabindex")).toBe("0");
      expect(box.hasAttribute("role")).toBe(false);
      expect(box.hasAttribute("aria-label")).toBe(false);
    }
  });
});

describe("prose", () => {
  it("keeps flags intact instead of turning -- into a dash", async () => {
    const { root } = await render("Add --json to any command.");
    expect(root.textContent).toContain("--json");
  });
});
