// The copy markup contract end to end: what React `CopyButton` and markdown's code blocks render
// is what `enhanceCopyButtons` wires, and each button reports into its own result region.
import { createSatteriMarkdownProcessor } from "@astrojs/markdown-satteri";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { stubClipboard, stubExecCommand, stubResponseBytes } from "../../../tests/helpers/dom.ts";
import { enhanceCopyButtons } from "../../copy/enhance.ts";
import { codeBlocks } from "../../markdown/code-blocks.ts";
import { createShikiConfig } from "../../markdown/plugins.ts";
import { CopyButton } from "./copy-command.tsx";

const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  stubClipboard(writeText);
  stubResponseBytes();
});

async function markdownHtml(): Promise<string> {
  const processor = await createSatteriMarkdownProcessor({
    syntaxHighlight: "shiki",
    shikiConfig: createShikiConfig(),
    hastPlugins: [codeBlocks()],
    features: { smartPunctuation: false },
  });
  return (await processor.render("```sh\nnpm i a\n```\n\n```sh\nnpm i b\n```\n", {})).code;
}

const reactHtml = (): string =>
  ["a", "b"]
    .map(
      (id) =>
        `<code id="${id}">cmd ${id}</code>${renderToStaticMarkup(
          <CopyButton controls={id} label="Copy command" />,
        )}`,
    )
    .join("");

describe.each([
  ["React CopyButton", reactHtml],
  ["markdown code blocks", markdownHtml],
])("%s", (_, html) => {
  const results = (): string[] =>
    [...document.querySelectorAll("[data-copy-result]")].map((node) => node.textContent ?? "");

  /**
   * Loads the markup with each button wrapped in one more element, as a consumer's styling might.
   * The button's parent then holds no result region, so only the `data-copy-root` scope finds it.
   */
  async function load(): Promise<void> {
    document.body.innerHTML = await html();
    for (const button of document.querySelectorAll("[data-copy-command]")) {
      const wrap = document.createElement("span");
      button.replaceWith(wrap);
      wrap.append(button);
    }
  }

  async function clickSecond(): Promise<HTMLButtonElement> {
    const button = document.querySelectorAll<HTMLButtonElement>("[data-copy-command]")[1];
    if (!button) throw new Error("no second button");
    button.click();
    await vi.waitFor(() => expect(button.dataset.state).toBeDefined());
    return button;
  }

  test("a successful copy updates that button's own result region", async () => {
    await load();
    enhanceCopyButtons(document);
    const button = await clickSecond();
    expect(button.dataset.state).toBe("copied");
    expect(results()).toEqual(["", "Copied to clipboard."]);
  });

  test("a failed copy updates that button's own result region", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    stubExecCommand(() => false);
    await load();
    enhanceCopyButtons(document);
    const button = await clickSecond();
    expect(button.dataset.state).toBe("failed");
    expect(results()[0]).toBe("");
    expect(results()[1]).toMatch(/^Copy failed\./);
  });
});
