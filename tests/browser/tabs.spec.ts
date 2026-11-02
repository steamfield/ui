import { expect, test } from "@playwright/test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { InstallTabs } from "../../src/react/install-tabs/index.ts";
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
    const withDefault = (keepMounted: boolean): string =>
      renderToString(
        createElement(
          Tabs,
          { id: keepMounted ? "dk" : "dn", defaultValue: "b", keepMounted },
          createElement(
            TabList,
            { "aria-label": "Sections" },
            ...["a", "b", "c"].map((n) => createElement(Tab, { key: n, value: n }, n)),
          ),
          ...["a", "b", "c"].map((n) => createElement(TabPanel, { key: n, value: n }, `Body ${n}`)),
        ),
      );
    await page.route("**/static-default.html", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html><head><link rel="stylesheet" href="${css}"></head><body>${withDefault(true)}${withDefault(false)}</body></html>`,
      }),
    );
    await page.goto("/static-default.html");
    for (const prefix of ["dk", "dn"]) {
      await expect(page.locator(`#${prefix}-b`)).toBeVisible();
      await expect(page.locator(`#${prefix}-b`)).toHaveText("Body b");
      await expect(page.locator(`#${prefix}-a`)).toBeHidden();
      await expect(page.locator(`#${prefix}-c`)).toBeHidden();
    }
    await page.goto("/static-default.html#dk-c");
    await expect(page.locator("#dk-c")).toBeVisible();
    await expect(page.locator("#dk-b")).toBeHidden();
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

  // A nested set always has a data-default panel (InstallTabs) or none (Tabs); neither may change
  // which outer panel shows, and the outer set's state must not reach the inner one.
  test("nested tab sets keep their own fallback", async ({ page, request }) => {
    const index = await (await request.get("/")).text();
    const css = /href="([^"]+\.css)"/.exec(index)?.[1] ?? "";
    const set = (
      id: string,
      names: string[],
      inner: (n: string) => unknown,
      defaultValue?: string,
    ) =>
      createElement(
        Tabs,
        defaultValue ? { id, defaultValue } : { id },
        createElement(
          TabList,
          { "aria-label": id },
          ...names.map((n) => createElement(Tab, { key: n, value: n }, n)),
        ),
        ...names.map((n) => createElement(TabPanel, { key: n, value: n }, inner(n) as never)),
      );
    const install = (n: string) =>
      createElement(InstallTabs, {
        id: `in-${n}`,
        defaultValue: "pnpm",
        options: [
          { id: "npm", label: "npm", command: `npm i ${n}` },
          { id: "pnpm", label: "pnpm", command: `pnpm add ${n}` },
        ],
      });
    const plain = (n: string) => set(`pl-${n}`, ["x", "y"], (m) => `Inner ${n} ${m}`);
    const markup = renderToString(
      createElement(
        "div",
        null,
        set("out", ["a", "b"], install),
        set("dout", ["a", "b"], plain, "b"),
      ),
    );
    await page.route("**/static-nested.html", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html><head><link rel="stylesheet" href="${css}"></head><body>${markup}</body></html>`,
      }),
    );
    await page.goto("/static-nested.html");
    // No outer default, inner InstallTabs with a default: the first outer panel shows.
    await expect(page.locator("#out-a")).toBeVisible();
    await expect(page.locator("#out-b")).toBeHidden();
    await expect(page.locator("#in-a-pnpm")).toBeVisible();
    await expect(page.locator("#in-a-npm")).toBeHidden();
    // Outer default, inner Tabs without one: the outer default shows and the inner set its first.
    await expect(page.locator("#dout-b")).toBeVisible();
    await expect(page.locator("#dout-a")).toBeHidden();
    await expect(page.locator("#pl-b-x")).toBeVisible();
    await expect(page.locator("#pl-b-y")).toBeHidden();
    // Targeting an inner panel switches only the inner set.
    await page.goto("/static-nested.html#pl-b-y");
    await expect(page.locator("#dout-b")).toBeVisible();
    await expect(page.locator("#pl-b-y")).toBeVisible();
    await expect(page.locator("#pl-b-x")).toBeHidden();
    // Targeting an outer panel switches the outer set and leaves the inner default alone.
    await page.goto("/static-nested.html#out-b");
    await expect(page.locator("#out-b")).toBeVisible();
    await expect(page.locator("#out-a")).toBeHidden();
    await expect(page.locator("#in-b-pnpm")).toBeVisible();
    await expect(page.locator("#in-b-npm")).toBeHidden();
  });
});
