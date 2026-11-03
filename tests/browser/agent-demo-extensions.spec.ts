// The opt-in agent demo extension points in a real browser, for the React and the Vue binding:
// the working line under a running call (and its pulse), collapsible tool calls folded from the
// keyboard, and the transcript as a named region, each scanned by axe, with motion and without.
import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";

const cases = [
  {
    page: "agent-demo",
    section: "ad-extensions",
    name: "Collapsible transcript",
    final: "Both upload tests pass now.",
  },
  {
    page: "vue-agent-demo",
    section: "vue-extensions",
    name: "Vue collapsible transcript",
    final: "the two imports now point at app.config.ts",
  },
] as const;

async function violations(tab: Page, selector: string): Promise<string[]> {
  const results = await new AxeBuilder({ page: tab })
    .include(selector)
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  return results.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(" ")} ${n.failureSummary}`).join("; ")}`,
  );
}

/** Folds and unfolds the first tool call from its summary with Enter, then Space. */
async function foldFromKeyboard(tab: Page, transcript: Locator): Promise<void> {
  const call = transcript.locator('details[data-part="tool-call"]').first();
  const output = call.locator('[data-part="output"]');
  await expect(call).toHaveAttribute("open", "");
  await expect(output).toBeVisible();
  await call.locator("summary").focus();
  await tab.keyboard.press("Enter");
  await expect(output).toBeHidden();
  await expect(call).not.toHaveAttribute("open");
  await tab.keyboard.press("Space");
  await expect(output).toBeVisible();
}

for (const c of cases) {
  const selector = `[aria-labelledby="${c.section}"]`;

  test(`${c.page}: the working line shows while a call runs, pulses, and the calls fold`, async ({
    page: tab,
  }) => {
    await tab.clock.install();
    await tab.emulateMedia({ reducedMotion: "no-preference" });
    await tab.goto(`/#/${c.page}`);
    const demo = tab.locator(selector);
    const transcript = demo.getByRole("region", { name: c.name });
    await expect(transcript).toHaveJSProperty("tagName", "SECTION");
    await expect(transcript).toHaveAttribute("tabindex", "0");
    // Below the fold: playback waits until it is in view.
    await demo.scrollIntoViewIfNeeded();
    await expect(demo.getByRole("button", { name: "Pause" })).toBeVisible();
    const working = transcript.locator('[data-part="tool-working"]');
    await expect
      .poll(async () => {
        await tab.clock.runFor(100);
        return working.count();
      })
      .toBe(1);
    await expect(working).toHaveText("Running…");
    await expect(working).toBeVisible();
    expect(await working.evaluate((el) => getComputedStyle(el).animationName)).toBe(
      "sf-agent-demo-working",
    );
    expect(await violations(tab, selector), "while running").toEqual([]);
    await tab.clock.runFor(60_000);
    await expect(demo.getByRole("button", { name: "Replay" })).toBeVisible();
    await expect(working).toHaveCount(0);
    await expect(transcript).toContainText(c.final);
    await foldFromKeyboard(tab, transcript);
    expect(await violations(tab, selector), "at the end").toEqual([]);
  });

  test(`${c.page}: under reduced motion it is the final transcript, still foldable`, async ({
    page: tab,
  }) => {
    await tab.emulateMedia({ reducedMotion: "reduce" });
    await tab.goto(`/#/${c.page}`);
    const demo = tab.locator(selector);
    const transcript = demo.getByRole("region", { name: c.name });
    await demo.scrollIntoViewIfNeeded();
    await expect(transcript).toContainText(c.final);
    await expect(demo.locator("[data-sf-animating]")).toHaveCount(0);
    await expect(demo.locator('[data-part="control"]')).toHaveCount(0);
    await expect(transcript.locator('[data-part="tool-working"]')).toHaveCount(0);
    await expect(transcript.getByRole("img", { name: "Running" })).toHaveCount(0);
    await foldFromKeyboard(tab, transcript);
    expect(await violations(tab, selector)).toEqual([]);
  });
}
