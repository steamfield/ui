import { expect, test } from "@playwright/test";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("switching tabs and copying updates the output and the live region", async ({ page }) => {
  await page.goto("/#/install-tabs");
  const output = page.getByTestId("last-event");
  await expect(output).toHaveText("No events yet.");
  await page.getByRole("tab", { name: "pnpm" }).click();
  await expect(page.getByRole("tab", { name: "pnpm" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Copy" }).click();
  await expect(output).toHaveText("copy pnpm: ok");
  await expect(page.locator('[data-part="copy-result"]')).toHaveText("Copied to clipboard.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "pnpm add example-package",
  );

  await page.getByRole("tab", { name: "bun" }).click();
  await expect(page.locator('[data-part="copy-result"]')).toHaveText("");
  await page.getByRole("button", { name: "Copy" }).click();
  await expect(output).toHaveText("copy bun: ok");
});
