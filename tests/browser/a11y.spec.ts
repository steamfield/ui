// Every playground page, in light and dark, with motion and with reduced motion: no axe
// violations (WCAG 2.2 AA), no console errors, and no horizontal overflow on a phone. With motion
// on, each page is scanned twice: as it first settles, and again at its end state once the page
// clock has fast-forwarded every rAF-driven demo to its last frame.
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { PAGES } from "./pages.ts";

const modes = [
  { theme: "light", motion: "no-preference" },
  { theme: "dark", motion: "no-preference" },
  { theme: "light", motion: "reduce" },
  { theme: "dark", motion: "reduce" },
] as const;

// Pages whose demos run on requestAnimationFrame, so their start and end states differ.
const ANIMATED = new Set<string>(["agent-demo", "vue-agent-demo"]);
const animating = "[data-sf-animating]";
// A time-paced demo that has not reached its end. (data-sf-animating stays on at the end: it
// marks motion CSS as enabled, not playback as running. Click-paced demos have no play control.)
const unfinished = '[data-sf-agent-demo]:not([data-complete]):has([data-control="play"])';

/** Plays every demo to its end: each scrolls into view (the gate pauses off-screen demos). */
async function fastForward(tab: Page): Promise<void> {
  for (const demo of await tab.locator("[data-sf-agent-demo]").all()) {
    await demo.scrollIntoViewIfNeeded();
    await tab.clock.runFor(60_000);
  }
  await tab.clock.runFor(60_000);
  await tab.evaluate(() => window.scrollTo(0, 0));
}

function collectErrors(tab: Page): string[] {
  const errors: string[] = [];
  tab.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  tab.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

// axe samples colors as they are painted; a reveal or entrance mid-transition reads as low
// contrast. Wait for CSS animations and transitions to finish; looping ones (carets, spinners)
// never do.
const settle = (tab: Page): Promise<unknown> =>
  tab.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== "running" ||
          animation.effect?.getTiming().iterations === Number.POSITIVE_INFINITY,
      ),
  );

async function violations(tab: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page: tab })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  return results.violations.map((v) => `${v.id}: ${v.help}`);
}

const overflow = (tab: Page): Promise<number> =>
  tab.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const page of PAGES) {
  for (const mode of modes) {
    test(`${page} is accessible (${mode.theme}, motion ${mode.motion})`, async ({ page: tab }) => {
      const errors = collectErrors(tab);
      await tab.clock.install();
      await tab.emulateMedia({ reducedMotion: mode.motion });
      await tab.setViewportSize({ width: 390, height: 844 });
      await tab.goto(`/?theme=${mode.theme}#/${page}`);
      await tab.locator("main h1").waitFor();
      await settle(tab);

      if (mode.motion === "reduce") {
        // Reduced motion renders final states straight away: nothing is mid-animation.
        await expect(tab.locator(animating)).toHaveCount(0);
      } else if (ANIMATED.has(page)) {
        // Control: the start scan really is of demos still playing.
        await expect(tab.locator(animating).first()).toBeAttached();
        await expect(tab.locator(unfinished).first()).toBeAttached();
      }
      expect(await violations(tab), "start state").toEqual([]);
      expect(await overflow(tab), "start state").toBeLessThanOrEqual(0);

      if (mode.motion === "no-preference") {
        await fastForward(tab);
        await expect(tab.locator(unfinished)).toHaveCount(0);
        await settle(tab);
        expect(await violations(tab), "end state").toEqual([]);
        expect(await overflow(tab), "end state").toBeLessThanOrEqual(0);
      }
      expect(errors).toEqual([]);
    });
  }
}

// Each check above, pointed at a page built to fail it, so a pass above means something.
test("the checks catch a violation, an overflow and a console error (control)", async ({
  page: tab,
}) => {
  const errors = collectErrors(tab);
  await tab.setViewportSize({ width: 390, height: 844 });
  await tab.goto("/#/copy");
  await tab.locator("main h1").waitFor();
  await tab.evaluate(() => {
    const broken = document.createElement("div");
    broken.innerHTML = `<button type="button"></button>
      <p style="color:#bbb;background:#fff;width:1000px">Low contrast and too wide</p>`;
    document.querySelector("main")?.append(broken);
    console.error("control error");
  });
  const found = await violations(tab);
  expect(found.some((v) => v.startsWith("button-name"))).toBe(true);
  expect(found.some((v) => v.startsWith("color-contrast"))).toBe(true);
  expect(await overflow(tab)).toBeGreaterThan(0);
  expect(errors).toEqual(["control error"]);
});
