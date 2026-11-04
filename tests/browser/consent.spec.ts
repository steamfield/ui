// The consent banner in a real browser, and the design claim behind the shared store: a decision
// made on one subdomain is honored on every other, while an unrelated host keeps its own. Chromium
// resolves *.steamfield.test to the preview server; the playground's DOM store uses
// `domain: "steamfield.test"`. The preview is plain http, so `Secure` on https is covered only by
// the unit tests (src/consent/cookie.test.ts).
import { type BrowserContext, expect, type Page, test } from "@playwright/test";

test.use({
  launchOptions: {
    args: ["--host-resolver-rules=MAP *.steamfield.test localhost, MAP steamfield.test localhost"],
  },
});

const COOKIE = "pg-consent";

/** The preview server's port, from the configured baseURL. */
function port(): string {
  const base = test.info().project.use.baseURL;
  if (!base) throw new Error("playwright.config.ts sets no baseURL");
  return new URL(base).port;
}
const origin = (host: string): string => `http://${host}:${port()}`;
const banner = (page: Page) => page.getByRole("region", { name: "Analytics consent", exact: true });
const decision = (page: Page) => page.locator("#consent-dom-state");
const domSection = (page: Page) => page.getByRole("region", { name: /^mountConsentBanner/ });

async function open(page: Page, host: string, query = "?delay=0"): Promise<void> {
  await page.goto(`${origin(host)}/${query}#/consent`);
  await page.locator("main h1").waitFor();
}

const consentCookies = async (context: BrowserContext) =>
  (await context.cookies()).filter(({ name }) => name === COOKIE);

for (const [button, state] of [
  ["Accept", "granted"],
  ["Decline", "denied"],
] as const) {
  test(`${button} on one subdomain is honored on another`, async ({ page, context }) => {
    await open(page, "a.steamfield.test");
    await expect(decision(page)).toHaveText("undecided");
    await banner(page).getByRole("button", { name: button }).click();
    await expect(banner(page)).toHaveCount(0);
    await expect(decision(page)).toHaveText(state);

    const cookies = await consentCookies(context);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatchObject({ value: state, domain: ".steamfield.test", path: "/" });
    expect(cookies[0]?.sameSite).toBe("Lax");

    await open(page, "b.steamfield.test");
    await expect(decision(page)).toHaveText(state);
    await expect(banner(page)).toHaveCount(0);
    // The bare domain shares it too.
    await open(page, "steamfield.test");
    await expect(decision(page)).toHaveText(state);
    await expect(banner(page)).toHaveCount(0);
  });
}

test("reset on one subdomain brings the banner back on another and empties the jar", async ({
  page,
  context,
}) => {
  await open(page, "a.steamfield.test");
  await banner(page).getByRole("button", { name: "Accept" }).click();
  await open(page, "b.steamfield.test");
  await domSection(page).getByRole("button", { name: "Reset choice" }).click();
  await expect(banner(page)).toBeVisible();
  expect(await consentCookies(context)).toEqual([]);
  await open(page, "a.steamfield.test");
  await expect(decision(page)).toHaveText("undecided");
  await expect(banner(page)).toBeVisible();
});

test("an older host-only cookie doesn't shadow a new shared decision", async ({
  page,
  context,
}) => {
  await open(page, "a.steamfield.test");
  await expect(banner(page)).toBeVisible();
  // A decision left from before `domain` was configured: host-only, and older than the next one.
  await context.addCookies([{ name: COOKIE, value: "denied", url: origin("a.steamfield.test") }]);
  await banner(page).getByRole("button", { name: "Accept" }).click();
  await page.reload();
  await page.locator("main h1").waitFor();
  await expect(decision(page)).toHaveText("granted");
  const cookies = await consentCookies(context);
  expect(cookies).toHaveLength(1);
  expect(cookies[0]).toMatchObject({ value: "granted", domain: ".steamfield.test" });
});

test("unrelated cookies, including look-alike names, are read past and left alone", async ({
  page,
  context,
}) => {
  const seeded = [
    { name: `x-${COOKIE}`, value: "granted" },
    { name: `${COOKIE}-old`, value: "denied" },
    { name: "other", value: "granted" },
  ];
  await context.addCookies(
    seeded.map((cookie) => ({ ...cookie, domain: ".steamfield.test", path: "/" })),
  );
  await open(page, "a.steamfield.test");
  await expect(decision(page)).toHaveText("undecided");
  await banner(page).getByRole("button", { name: "Accept" }).click();
  await expect(decision(page)).toHaveText("granted");
  const jar = await context.cookies();
  for (const { name, value } of seeded) {
    expect(jar.find((cookie) => cookie.name === name)?.value).toBe(value);
  }
});

test("a Domain cookie the browser refuses falls back to host-only", async ({ page, context }) => {
  // Chromium won't set Domain=localhost from a.localhost, as for a public suffix.
  await open(page, "a.localhost", "?delay=0&domain=localhost");
  await banner(page).getByRole("button", { name: "Accept" }).click();
  await expect(decision(page)).toHaveText("granted");
  const cookies = await consentCookies(context);
  expect(cookies).toHaveLength(1);
  expect(cookies[0]).toMatchObject({ value: "granted", domain: "a.localhost" });
  await page.reload();
  await page.locator("main h1").waitFor();
  await expect(decision(page)).toHaveText("granted");
  await expect(banner(page)).toHaveCount(0);
  await domSection(page).getByRole("button", { name: "Reset choice" }).click();
  expect(await consentCookies(context)).toEqual([]);
});

test("returning focus doesn't scroll the page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 300 });
  await open(page, "localhost");
  // An element at the very top, scrolled out of view before the banner closes.
  const top = page.getByRole("navigation", { name: "Components" }).getByRole("link").first();
  await top.focus();
  await banner(page).getByRole("link", { name: "Privacy" }).focus();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const scrolled = await page.evaluate(() => window.scrollY);
  expect(scrolled).toBeGreaterThan(0);
  await expect(top).not.toBeInViewport();
  await banner(page).getByRole("button", { name: "Accept" }).click();
  await expect(banner(page)).toHaveCount(0);
  await expect(top).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
});

test("an unrelated host gets a host-only cookie and doesn't share the decision", async ({
  page,
  context,
}) => {
  await open(page, "localhost");
  await banner(page).getByRole("button", { name: "Accept" }).click();
  await expect(decision(page)).toHaveText("granted");
  const cookies = await consentCookies(context);
  expect(cookies).toHaveLength(1);
  expect(cookies[0]).toMatchObject({ value: "granted", domain: "localhost" });

  await open(page, "a.steamfield.test");
  await expect(decision(page)).toHaveText("undecided");
  await expect(banner(page)).toBeVisible();
});

test("a keyboard Accept returns focus to where it was before the banner", async ({ page }) => {
  await open(page, "localhost");
  const reset = domSection(page).getByRole("button", { name: "Reset choice" });
  await reset.focus();
  await banner(page).getByRole("link", { name: "Privacy" }).focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(banner(page).getByRole("button", { name: "Accept" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(banner(page)).toHaveCount(0);
  await expect(reset).toBeFocused();
});

test("with motion it slides in after the default delay and doesn't take focus", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await open(page, "localhost", "");
  await expect(banner(page)).toBeVisible();
  await expect(banner(page)).toHaveAttribute("data-sf-animating", "");
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
});

test("with reduced motion it shows without animation, and tabs privacy, decline, accept", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, "localhost", "");
  await expect(banner(page)).toBeVisible();
  await expect(banner(page)).not.toHaveAttribute("data-sf-animating");
  await banner(page).getByRole("link", { name: "Privacy" }).focus();
  await page.keyboard.press("Tab");
  await expect(banner(page).getByRole("button", { name: "Decline" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(banner(page).getByRole("button", { name: "Accept" })).toBeFocused();
});
