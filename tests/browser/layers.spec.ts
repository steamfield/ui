// Library CSS sits in `@layer sf` with zero-specificity selectors, so a consumer's utility class
// (Tailwind v4 puts utilities in `@layer utilities`) or plain unlayered CSS always wins.
import { expect, test } from "@playwright/test";

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
