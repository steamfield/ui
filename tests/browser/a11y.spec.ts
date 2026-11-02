// Every playground page, in light and dark, with motion and with reduced motion: no axe
// violations (WCAG 2.2 AA), no console errors, and no horizontal overflow on a phone.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { PAGES } from "./pages.ts";

const modes = [
  { theme: "light", motion: "no-preference" },
  { theme: "dark", motion: "no-preference" },
  { theme: "light", motion: "reduce" },
  { theme: "dark", motion: "reduce" },
] as const;

for (const page of PAGES) {
  for (const mode of modes) {
    test(`${page} is accessible (${mode.theme}, motion ${mode.motion})`, async ({ page: tab }) => {
      const errors: string[] = [];
      tab.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      tab.on("pageerror", (error) => errors.push(error.message));
      await tab.emulateMedia({ reducedMotion: mode.motion });
      await tab.setViewportSize({ width: 390, height: 844 });
      await tab.goto(`/?theme=${mode.theme}#/${page}`);
      await tab.locator("main h1").waitFor();

      const results = await new AxeBuilder({ page: tab })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

      const overflow = await tab.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      expect(errors).toEqual([]);
    });
  }
}
