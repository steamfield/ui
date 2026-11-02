import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

const ID = "virtual:markdown-sample";
const RESOLVED = `\0${ID}`;

/**
 * Renders playground/markdown-sample.md at build time through Sätteri with the library's hast
 * plugins and Shiki config, the way a site's astro.config does, and serves the HTML and headings
 * as `virtual:markdown-sample`. `entry` is the markdown subpath's module (src or dist).
 */
export function markdownSample(entry: string): Plugin {
  return {
    name: "playground-markdown-sample",
    resolveId: (id) => (id === ID ? RESOLVED : undefined),
    async load(id) {
      if (id !== RESOLVED) return undefined;
      const { createSatteriMarkdownProcessor } = await import("@astrojs/markdown-satteri");
      const { createHastPlugins, createShikiConfig } = (await import(
        entry
      )) as typeof import("../src/markdown/index.ts");
      const processor = await createSatteriMarkdownProcessor({
        syntaxHighlight: "shiki",
        shikiConfig: createShikiConfig(),
        hastPlugins: createHastPlugins(),
        features: { smartPunctuation: false },
      });
      const source = readFileSync(join(import.meta.dirname, "markdown-sample.md"), "utf8");
      const { code, metadata } = await processor.render(source, {});
      const headings = metadata.headings.map(({ depth, slug, text }) => ({ depth, slug, text }));
      return `export const html = ${JSON.stringify(code)};\nexport const headings = ${JSON.stringify(headings)};`;
    },
  };
}
