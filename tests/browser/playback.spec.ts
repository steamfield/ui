import { expect, test } from "@playwright/test";

test("reduced motion shows the count-up end values immediately", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#/playback");
  await expect(page.locator('[data-stat="users"]')).toHaveText("12,400");
  await expect(page.locator('[data-stat="projects"]')).toHaveText("860");
  await expect(page.getByLabel("Playback progress")).toHaveJSProperty("value", 4000);
});
