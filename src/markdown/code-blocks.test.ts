// @vitest-environment node
import { createSatteriMarkdownProcessor } from "@astrojs/markdown-satteri";
import { Window } from "happy-dom";
import { defineHastPlugin } from "satteri";
import { expect, it } from "vitest";
import { codeBlocks } from "./code-blocks.ts";
import { createShikiConfig } from "./plugins.ts";

// A later plugin that edits one copy icon must not change the other: each block gets its own
// icon nodes, not a shared tree.
it("gives every code block's copy button its own icon nodes", async () => {
  let marked = false;
  const markFirstIcon = () =>
    defineHastPlugin({
      name: "mark-first-icon",
      element: {
        filter: ["rect"],
        visit(node, ctx) {
          if (marked) return;
          marked = true;
          ctx.setProperty(node, "data-marked", "");
        },
      },
    });
  const processor = await createSatteriMarkdownProcessor({
    syntaxHighlight: "shiki",
    shikiConfig: createShikiConfig(),
    hastPlugins: [codeBlocks(), markFirstIcon],
    features: { smartPunctuation: false },
  });
  const result = await processor.render("```sh\nnpm i a\n```\n\n```sh\nnpm i b\n```\n", {});
  const root = new Window().document.createElement("div");
  root.innerHTML = result.code;
  const icons = [...root.querySelectorAll("[data-copy-command] svg")];
  expect(icons).toHaveLength(2);
  expect(icons[0]?.querySelector("rect")?.hasAttribute("data-marked")).toBe(true);
  expect(icons[1]?.querySelector("rect")?.hasAttribute("data-marked")).toBe(false);
});
