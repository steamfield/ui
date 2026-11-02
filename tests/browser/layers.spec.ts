// Library CSS sits in `@layer sf` with zero-specificity selectors, so a consumer's utility class
// (Tailwind v4 puts utilities in `@layer utilities`) or plain unlayered CSS always wins. Under the
// documented order `theme, base, sf, components, utilities`, the library also beats Tailwind's
// preflight in `@layer base`.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";

const RECOMMENDED = "@layer theme, base, sf, components, utilities;";
const copyCss = readFileSync(join(import.meta.dirname, "../../src/copy/styles.css"), "utf8");
// The part of Tailwind v4's preflight that strips borders and margins from every element.
const PREFLIGHT = "@layer base { *, ::before, ::after { margin: 0; border: 0 solid; } }";

/** A fresh page whose first statement fixes the layer order, then preflight, then the library. */
async function pageWithOrder(page: Page, order: string): Promise<void> {
  await page.setContent(`<!doctype html><html><head>
    <style>${order}</style>
    <style>${PREFLIGHT}</style>
    <style>${copyCss}</style>
    <style>@layer utilities { .text-probe { color: rgb(1, 2, 3); } }</style>
  </head><body>
    <button type="button" data-part="copy-button">Copy</button>
  </body></html>`);
}

const buttonStyle = (page: Page) =>
  page.locator('[data-part="copy-button"]').evaluate((button) => {
    const style = getComputedStyle(button);
    return { border: style.borderTopWidth, color: style.color };
  });

test("a consumer utility class overrides library styles", async ({ page }) => {
  await page.goto("/#/copy");
  await page.locator("main h1").waitFor();
  const color = await page.evaluate(() => {
    const style = document.createElement("style");
    style.textContent =
      "@layer sf, utilities; @layer utilities { .text-probe { color: rgb(1, 2, 3); } }";
    document.head.append(style);
    const button = document.querySelector<HTMLElement>('[data-part="copy-button"]');
    if (!button) throw new Error("copy button missing");
    button.classList.add("text-probe");
    return getComputedStyle(button).color;
  });
  expect(color).toBe("rgb(1, 2, 3)");
});

test("under the recommended order, a preflight reset keeps library borders and utilities win", async ({
  page,
}) => {
  await pageWithOrder(page, RECOMMENDED);
  expect((await buttonStyle(page)).border).toBe("1px");
  await page.locator('[data-part="copy-button"]').evaluate((b) => b.classList.add("text-probe"));
  expect((await buttonStyle(page)).color).toBe("rgb(1, 2, 3)");
});

test("with sf ahead of base, the same reset strips library borders", async ({ page }) => {
  // The order the README used to show: proves the check above can fail.
  await pageWithOrder(page, "@layer sf, theme, base, components, utilities;");
  expect((await buttonStyle(page)).border).toBe("0px");
});
