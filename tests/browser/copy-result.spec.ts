// The copy result region is a live region beside the button: hidden visually (still read) until
// a failure, which shows. The enhancer finds it by `data-copy-result` (src/copy/markup.ts), so
// markup carrying only that attribute must look the same as markup with `data-part`.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";

const copyCss = readFileSync(join(import.meta.dirname, "../../src/copy/styles.css"), "utf8");

async function withResult(page: Page, attrs: string): Promise<void> {
  await page.setContent(`<!doctype html><html><head><style>${copyCss}</style></head><body>
    <div data-copy-root>
      <code id="cmd">npx stacks new</code>
      <span ${attrs} role="status" aria-live="polite">Copied to clipboard.</span>
    </div>
  </body></html>`);
}

const box = (page: Page) =>
  page.getByRole("status").evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });

for (const [name, attrs] of [
  ["data-part and data-copy-result", 'data-part="copy-result" data-copy-result'],
  ["only data-copy-result", "data-copy-result"],
] as const) {
  test(`a result region with ${name} is visually hidden until it fails, then shown`, async ({
    page,
  }) => {
    await withResult(page, attrs);
    expect(await box(page)).toEqual({ width: 1, height: 1 });
    await expect(page.getByRole("status")).toHaveText("Copied to clipboard.");
    await page.getByRole("status").evaluate((el) => el.setAttribute("data-state", "failed"));
    const shown = await box(page);
    expect(shown.width).toBeGreaterThan(1);
  });
}
