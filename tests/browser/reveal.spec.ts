import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import { builtStylesheet } from "./built-css.ts";

const late = '[data-role="lift-xl"]';

test("sections below the fold start hidden and reveal on scroll", async ({ page }) => {
  await page.goto("/#/reveal");
  await expect(page.locator("html")).toHaveAttribute("data-motion-ready", "true");
  const section = page.locator(late);
  await expect(section).not.toHaveAttribute("data-revealed", "true");
  await expect(section.locator("[data-motion]")).toHaveCSS("opacity", "0");
  await section.scrollIntoViewIfNeeded();
  await expect(section).toHaveAttribute("data-revealed", "true");
  await expect(section.locator("[data-motion]")).toHaveCSS("opacity", "1");
});

test("a section reveals only once, and stays revealed after scrolling away", async ({ page }) => {
  await page.goto("/#/reveal");
  const section = page.locator('[data-role="default"]');
  await expect(section).not.toHaveAttribute("data-revealed", "true");
  await section.scrollIntoViewIfNeeded();
  await expect(section).toHaveAttribute("data-revealed", "true");
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(section).toHaveAttribute("data-revealed", "true");
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("everything is visible immediately", async ({ page }) => {
    await page.goto("/#/reveal");
    await page.locator("main h1").waitFor();
    await expect(page.locator("html")).not.toHaveAttribute("data-motion-ready", /.*/);
    const motion = page.locator("[data-motion], [data-motion-part]");
    for (const el of await motion.all()) await expect(el).toHaveCSS("opacity", "1");
  });
});

test.describe("JavaScript disabled", () => {
  test.use({ javaScriptEnabled: false });
  // The playground is client-rendered, so with no JS there is no DOM to look at. Serve reveal
  // markup as static HTML with the built stylesheet instead: without data-motion-ready the CSS
  // must leave every entrance in its final state.
  const markup = `<section data-reveal><div data-motion="lift-xl" style="margin-top:3000px">Late</div>
    <ul><li data-motion-part>One</li><li data-motion-part>Two</li></ul></section>`;
  const serve = async (page: Page, request: APIRequestContext, html: string): Promise<void> => {
    const css = await builtStylesheet(request);
    await page.route("**/static-reveal.html", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html>${html.replace("<head>", `<head><link rel="stylesheet" href="${css}">`)}`,
      }),
    );
    await page.goto("/static-reveal.html");
  };

  test("everything is visible", async ({ page, request }) => {
    await serve(page, request, `<html><head></head><body>${markup}</body></html>`);
    const motion = page.locator("[data-motion], [data-motion-part]");
    await expect(motion).toHaveCount(3);
    for (const el of await motion.all()) await expect(el).toHaveCSS("opacity", "1");
  });

  test("the same markup under data-motion-ready starts hidden (control)", async ({
    page,
    request,
  }) => {
    // Proves the stylesheet loaded and applies to this markup, so the check above can fail.
    await serve(
      page,
      request,
      `<html data-motion-ready="true"><head></head><body>${markup}</body></html>`,
    );
    const motion = page.locator("[data-motion], [data-motion-part]");
    await expect(motion).toHaveCount(3);
    for (const el of await motion.all()) await expect(el).toHaveCSS("opacity", "0");
  });
});

test("focusing a link inside an unrevealed section reveals it", async ({ page }) => {
  await page.goto("/#/reveal");
  await expect(page.locator("html")).toHaveAttribute("data-motion-ready", "true");
  const section = page.locator('[data-role="focus"]');
  await expect(section).not.toHaveAttribute("data-revealed", "true");
  await page.keyboard.press("Tab");
  await page.evaluate(() =>
    document.getElementById("pg-reveal-link")?.focus({ preventScroll: true }),
  );
  await expect(section).toHaveAttribute("data-revealed", "true");
});
