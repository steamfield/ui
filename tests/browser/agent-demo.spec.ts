// The agent demo in a real browser: autoplay in view, pause, replay focus, reduced motion and
// phone width. Accessibility in every theme is covered by a11y.spec.ts through pages.ts.
import { expect, type Page, test } from "@playwright/test";

const section = '[aria-labelledby="ad-terminal"]';
const FINAL = "Both upload tests pass now.";

test("autoplay starts once the demo is in view", async ({ page }) => {
  await page.goto("/#/agent-demo");
  const demo = page.locator(section);
  const transcript = demo.getByRole("group", { name: "Terminal transcript" });
  await expect(demo.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(demo.locator("[data-sf-animating]")).toHaveCount(1);
  await expect(transcript).toContainText("The upload tests are failing");
  await expect(transcript).not.toContainText(FINAL);
});

test("pause freezes the text", async ({ page }) => {
  await page.clock.install();
  await page.goto("/#/agent-demo");
  const demo = page.locator(section);
  const transcript = demo.getByRole("group", { name: "Terminal transcript" });
  await expect(demo.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.clock.runFor(1500);
  // Control: while playing, the same stretch of clock time adds text.
  const before = await transcript.textContent();
  await page.clock.runFor(1500);
  await expect.poll(() => transcript.textContent()).not.toBe(before);
  await demo.getByRole("button", { name: "Pause" }).click();
  await expect(demo.getByRole("button", { name: "Play" })).toBeVisible();
  const held = await transcript.textContent();
  await page.clock.runFor(5000);
  expect(await transcript.textContent()).toBe(held);
  await expect(transcript).not.toContainText(FINAL);
});

test("replay restarts without moving focus", async ({ page }) => {
  await page.clock.install();
  await page.goto("/#/agent-demo");
  const demo = page.locator(section);
  await expect(demo.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.clock.runFor(30_000);
  const replay = demo.getByRole("button", { name: "Replay" });
  await expect(replay).toBeVisible();
  await expect(demo.getByRole("group", { name: "Terminal transcript" })).toContainText(FINAL);
  await replay.focus();
  await replay.press("Enter");
  const pause = demo.getByRole("button", { name: "Pause" });
  await expect(pause).toBeFocused();
  await expect(demo.getByRole("group", { name: "Terminal transcript" })).not.toContainText(FINAL);
});

test("reduced motion shows the final transcript with no Pause button", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#/agent-demo");
  const demo = page.locator(section);
  await expect(demo.getByRole("group", { name: "Terminal transcript" })).toContainText(FINAL);
  await expect(demo.getByRole("group", { name: "Terminal transcript" })).toContainText(
    "… +12 lines",
  );
  await expect(page.getByRole("button", { name: "Pause" })).toHaveCount(0);
  await expect(page.locator("[data-sf-animating]")).toHaveCount(0);
});

test("a collapsible tool call shows its working line, then folds from the keyboard", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/#/agent-demo");
  const demo = page.locator('[aria-labelledby="ad-extensions"]');
  const transcript = demo.getByRole("region", { name: "Collapsible transcript" });
  // Below the fold: playback waits until it is in view.
  await demo.scrollIntoViewIfNeeded();
  await expect(demo.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect
    .poll(async () => {
      await page.clock.runFor(100);
      return transcript.locator('[data-part="tool-working"]').count();
    })
    .toBe(1);
  await expect(transcript.locator('[data-part="tool-working"]')).toHaveText("Running…");
  await page.clock.runFor(30_000);
  await expect(demo.getByRole("button", { name: "Replay" })).toBeVisible();
  const call = transcript.locator('details[data-part="tool-call"]').first();
  const output = call.locator('[data-part="output"]');
  await expect(output).toBeVisible();
  await call.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(output).toBeHidden();
  await page.keyboard.press("Space");
  await expect(output).toBeVisible();
});

const overflow = (page: Page): Promise<number> =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("no horizontal overflow at 390px, at the start or the end", async ({ page }) => {
  await page.clock.install();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/agent-demo");
  const demo = page.locator(section);
  await expect(demo.getByRole("button", { name: "Pause" })).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await page.clock.runFor(30_000);
  await expect(demo.getByRole("button", { name: "Replay" })).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  // Control: a too-wide element does register as overflow at this width.
  await page.evaluate(() => {
    const wide = document.createElement("div");
    wide.style.width = "1000px";
    wide.style.height = "1px";
    document.body.append(wide);
  });
  expect(await overflow(page)).toBeGreaterThan(0);
});
