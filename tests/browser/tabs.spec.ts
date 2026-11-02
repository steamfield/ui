import { expect, test } from "@playwright/test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Tab, TabList, TabPanel, Tabs } from "../../src/react/tabs/index.ts";

const h = '[aria-label="Horizontal sections"]';
const v = '[aria-label="Vertical sections"]';

test("arrow keys, Home and End move selection under auto activation", async ({ page }) => {
  await page.goto("/#/tabs");
  const overview = page.locator(h).getByRole("tab", { name: "Overview" });
  const usage = page.locator(h).getByRole("tab", { name: "Usage" });
  const notes = page.locator(h).getByRole("tab", { name: "Notes" });
  await overview.focus();
  await overview.press("ArrowRight");
  await expect(usage).toBeFocused();
  await expect(usage).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "Usage" })).toBeVisible();
  await usage.press("End");
  await expect(notes).toBeFocused();
  await expect(notes).toHaveAttribute("aria-selected", "true");
  await notes.press("ArrowRight");
  await expect(overview).toHaveAttribute("aria-selected", "true");
  await overview.press("End");
  await notes.press("Home");
  await expect(overview).toBeFocused();
  await expect(overview).toHaveAttribute("aria-selected", "true");
});

test("the hash is replaced on selection without adding history", async ({ page }) => {
  await page.goto("/#/tabs");
  const length = await page.evaluate(() => history.length);
  await page.locator(h).getByRole("tab", { name: "Usage" }).click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#pg-h-usage");
  expect(await page.evaluate(() => history.length)).toBe(length);
});

test("manual activation needs Enter and skips the disabled tab", async ({ page }) => {
  await page.goto("/#/tabs");
  const alpha = page.locator(v).getByRole("tab", { name: "Alpha" });
  const beta = page.locator(v).getByRole("tab", { name: "Beta" });
  await alpha.focus();
  await alpha.press("ArrowDown");
  await expect(beta).toBeFocused();
  await expect(beta).toHaveAttribute("aria-selected", "false");
  await expect(alpha).toHaveAttribute("aria-selected", "true");
  await beta.press("Enter");
  await expect(beta).toHaveAttribute("aria-selected", "true");
  await beta.press("ArrowDown");
  await expect(page.locator(v).getByRole("tab", { name: "Gamma" })).toBeFocused();
  await expect(page.locator(v).getByRole("tab", { name: "Archived" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
});

test("createTabs enhances plain markup", async ({ page }) => {
  await page.goto("/#/tabs");
  const second = page
    .locator('[aria-label="Plain DOM sections"]')
    .getByRole("tab", { name: "Second" });
  await second.click();
  await expect(second).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#pg-dom-second")).toBeVisible();
  await expect(page.locator("#pg-dom-first")).toBeHidden();
});

test.describe("JavaScript disabled", () => {
  test.use({ javaScriptEnabled: false });
  // The playground is client-rendered, so with no JS it has no DOM. This serves the component's
  // own server markup (renderToString) with the built stylesheet.
  test("every panel is reachable by its anchor", async ({ page, request }) => {
    const index = await (await request.get("/")).text();
    const css = /href="([^"]+\.css)"/.exec(index)?.[1] ?? "";
    const names = ["one", "two", "three"];
    const markup = renderToString(
      createElement(
        Tabs,
        { id: "ssr" },
        createElement(
          TabList,
          { "aria-label": "Sections" },
          ...names.map((n) => createElement(Tab, { key: n, value: n }, n)),
        ),
        ...names.map((n) => createElement(TabPanel, { key: n, value: n }, `Panel ${n}`)),
      ),
    );
    await page.route("**/static-tabs.html", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html><head><link rel="stylesheet" href="${css}"></head><body>${markup}</body></html>`,
      }),
    );
    await page.goto("/static-tabs.html");
    await expect(page.locator("#ssr-one")).toBeVisible();
    await expect(page.locator("#ssr-two")).toBeHidden();
    for (const n of names) {
      await page.goto(`/static-tabs.html#ssr-${n}`);
      await expect(page.locator(`#ssr-${n}`)).toBeVisible();
      for (const other of names.filter((o) => o !== n)) {
        await expect(page.locator(`#ssr-${other}`)).toBeHidden();
      }
    }
  });
});
