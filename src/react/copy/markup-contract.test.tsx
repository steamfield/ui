// The copy markup contract end to end: what React `CopyButton` and markdown's code blocks render
// is what `enhanceCopyButtons` wires, and each button reports into its own result region.
import { createSatteriMarkdownProcessor } from "@astrojs/markdown-satteri";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { stubClipboard, stubExecCommand } from "../../../tests/helpers/dom.ts";
import { enhanceCopyButtons } from "../../copy/enhance.ts";
import { codeBlocks } from "../../markdown/code-blocks.ts";
import { createShikiConfig } from "../../markdown/plugins.ts";
import { CopyButton } from "./copy-command.tsx";

const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  stubClipboard(writeText);
});

// shiki's inlined wasm reads `Response.bytes`, which happy-dom lacks (markdown's own tests run on
// Node for that reason). This test needs the DOM, so it adds the method for its own run.
const hadBytes = "bytes" in Response.prototype;
beforeAll(() => {
  if (hadBytes) return;
  Object.defineProperty(Response.prototype, "bytes", {
    configurable: true,
    async value(this: Response) {
      return new Uint8Array(await this.arrayBuffer());
    },
  });
});
afterAll(() => {
  if (!hadBytes) Reflect.deleteProperty(Response.prototype, "bytes");
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

  async function clickSecond(): Promise<HTMLButtonElement> {
    const button = document.querySelectorAll<HTMLButtonElement>("[data-copy-command]")[1];
    if (!button) throw new Error("no second button");
    button.click();
    await vi.waitFor(() => expect(button.dataset.state).toBeDefined());
    return button;
  }

  test("a successful copy updates that button's own result region", async () => {
    document.body.innerHTML = await html();
    enhanceCopyButtons(document);
    const button = await clickSecond();
    expect(button.dataset.state).toBe("copied");
    expect(results()).toEqual(["", "Copied to clipboard."]);
  });

  test("a failed copy updates that button's own result region", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    stubExecCommand(() => false);
    document.body.innerHTML = await html();
    enhanceCopyButtons(document);
    const button = await clickSecond();
    expect(button.dataset.state).toBe("failed");
    expect(results()[0]).toBe("");
    expect(results()[1]).toMatch(/^Copy failed\./);
  });
});
