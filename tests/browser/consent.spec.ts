// The consent banner in a real browser, and the design claim behind the shared store: a decision
// made on one subdomain is honored on every other, while an unrelated host keeps its own. Chromium
// resolves *.steamfield.test to the preview server; the playground's DOM store uses
// `domain: "steamfield.test"`.
import { expect, type Page, test } from "@playwright/test";

test.use({
  launchOptions: {
    args: ["--host-resolver-rules=MAP *.steamfield.test localhost, MAP steamfield.test localhost"],
  },
});

const PORT = 5200;
const url = (host: string, query = "?delay=0"): string =>
  `http://${host}:${PORT}/${query}#/consent`;
const banner = (page: Page) => page.getByRole("region", { name: "Analytics consent", exact: true });
const decision = (page: Page) => page.locator("#consent-dom-state");

async function open(page: Page, host: string, query?: string): Promise<void> {
  await page.goto(url(host, query));
  await page.locator("main h1").waitFor();
}

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

    const cookie = (await context.cookies()).find(({ name }) => name === "pg-consent");
    expect(cookie).toMatchObject({ value: state, domain: ".steamfield.test", path: "/" });
    expect(cookie?.sameSite).toBe("Lax");

    await open(page, "b.steamfield.test");
    await expect(decision(page)).toHaveText(state);
    await expect(banner(page)).toHaveCount(0);
    // The bare domain shares it too.
    await open(page, "steamfield.test");
    await expect(decision(page)).toHaveText(state);
    await expect(banner(page)).toHaveCount(0);
  });
}

test("reset on one subdomain brings the banner back on another", async ({ page }) => {
  await open(page, "a.steamfield.test");
  await banner(page).getByRole("button", { name: "Accept" }).click();
  await open(page, "b.steamfield.test");
  await page.getByRole("button", { name: "Reset choice" }).first().click();
  await expect(banner(page)).toBeVisible();
  await open(page, "a.steamfield.test");
  await expect(decision(page)).toHaveText("undecided");
  await expect(banner(page)).toBeVisible();
});

test("an unrelated host gets a host-only cookie and doesn't share the decision", async ({
  page,
  context,
}) => {
  await open(page, "localhost");
  await banner(page).getByRole("button", { name: "Accept" }).click();
  await expect(decision(page)).toHaveText("granted");
  const cookie = (await context.cookies()).find(({ name }) => name === "pg-consent");
  expect(cookie).toMatchObject({ value: "granted", domain: "localhost" });

  await open(page, "a.steamfield.test");
  await expect(decision(page)).toHaveText("undecided");
  await expect(banner(page)).toBeVisible();
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
