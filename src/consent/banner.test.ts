import { getByRole, queryByRole } from "@testing-library/dom";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { setDocumentCookie, stubReducedMotion } from "../../tests/helpers/dom.ts";
import { mountConsentBanner } from "./banner.ts";
import { createConsentStore } from "./store.ts";

const banner = (): HTMLElement | null =>
  queryByRole(document.body, "region", { name: "Analytics consent" });
const button = (name: string): HTMLElement => getByRole(document.body, "button", { name });

beforeEach(() => {
  setDocumentCookie("sf-consent=; Path=/; Max-Age=0");
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-sf-motion");
});

describe("with motion allowed", () => {
  beforeEach(() => {
    stubReducedMotion(false);
    vi.useFakeTimers();
  });

  test("slides in after the default 1200ms delay", () => {
    mountConsentBanner(createConsentStore());
    expect(banner()).toBeNull();
    vi.advanceTimersByTime(1199);
    expect(banner()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(banner()).not.toBeNull();
    expect(banner()?.hasAttribute("data-sf-animating")).toBe(true);
  });

  test("delayMs sets the delay, and 0 shows it at once, still animated", () => {
    mountConsentBanner(createConsentStore(), { delayMs: 300 });
    vi.advanceTimersByTime(299);
    expect(banner()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(banner()).not.toBeNull();

    document.body.innerHTML = "";
    mountConsentBanner(createConsentStore({ cookieName: "other" }), { delayMs: 0 });
    expect(banner()?.hasAttribute("data-sf-animating")).toBe(true);
  });

  test("a decision made during the delay means it never shows", () => {
    const store = createConsentStore();
    mountConsentBanner(store);
    store.decline();
    vi.advanceTimersByTime(5000);
    expect(banner()).toBeNull();
  });

  test("an external accept while it is animating removes it", () => {
    const store = createConsentStore();
    mountConsentBanner(store, { delayMs: 0 });
    expect(banner()?.hasAttribute("data-sf-animating")).toBe(true);
    store.accept();
    expect(banner()).toBeNull();
  });

  test("a [data-sf-motion=reduce] ancestor shows it at once without animation", () => {
    document.documentElement.setAttribute("data-sf-motion", "reduce");
    mountConsentBanner(createConsentStore());
    expect(banner()).not.toBeNull();
    expect(banner()?.hasAttribute("data-sf-animating")).toBe(false);
  });

  test("reset after a decision brings it back without the page-load delay", () => {
    const store = createConsentStore();
    mountConsentBanner(store);
    vi.advanceTimersByTime(1200);
    store.accept();
    expect(banner()).toBeNull();
    store.reset();
    expect(banner()).not.toBeNull();
  });

  test("unmount during the delay cancels it", () => {
    const unmount = mountConsentBanner(createConsentStore());
    unmount();
    vi.advanceTimersByTime(5000);
    expect(banner()).toBeNull();
  });
});

describe("with reduced motion", () => {
  beforeEach(() => {
    stubReducedMotion(true);
  });

  test("shows at once with no delay and no animation", () => {
    mountConsentBanner(createConsentStore());
    expect(banner()).not.toBeNull();
    expect(banner()?.hasAttribute("data-sf-animating")).toBe(false);
  });

  test("renders nothing when a decision is already stored", () => {
    setDocumentCookie("sf-consent=denied; Path=/");
    mountConsentBanner(createConsentStore());
    expect(banner()).toBeNull();
  });

  test("is a labelled, non-modal region with the default text", () => {
    mountConsentBanner(createConsentStore());
    const region = banner();
    expect(region?.tagName).toBe("SECTION");
    expect(queryByRole(document.body, "dialog")).toBeNull();
    expect(region?.getAttribute("aria-modal")).toBeNull();
    expect(region?.textContent).toContain("This site uses analytics to understand how it is used.");
    expect(button("Decline")).toBeDefined();
    expect(button("Accept")).toBeDefined();
    // No privacy link without an href.
    expect(queryByRole(document.body, "link")).toBeNull();
  });

  test("every string comes from the options", () => {
    mountConsentBanner(createConsentStore(), {
      message: "We count visits.",
      acceptLabel: "Allow",
      declineLabel: "No thanks",
      privacyLabel: "How we count",
      privacyHref: "/privacy",
      label: "Cookie choice",
    });
    const region = getByRole(document.body, "region", { name: "Cookie choice" });
    expect(region.textContent).toContain("We count visits.");
    expect(button("Allow")).toBeDefined();
    expect(button("No thanks")).toBeDefined();
    const link = getByRole(document.body, "link", { name: "How we count" });
    expect(link.getAttribute("href")).toBe("/privacy");
  });

  test("exposes the data-part hooks", () => {
    mountConsentBanner(createConsentStore(), { privacyHref: "/privacy" });
    const parts = [...document.querySelectorAll("[data-part]")].map((el) =>
      el.getAttribute("data-part"),
    );
    expect(parts).toEqual([
      "consent",
      "consent-message",
      "consent-actions",
      "consent-privacy",
      "consent-decline",
      "consent-accept",
    ]);
  });

  test("Accept records granted, stores the cookie, and removes the banner", async () => {
    const store = createConsentStore();
    mountConsentBanner(store);
    await userEvent.click(button("Accept"));
    expect(store.getState()).toBe("granted");
    expect(createConsentStore().getState()).toBe("granted");
    expect(banner()).toBeNull();
  });

  test("Decline records denied, stores the cookie, and removes the banner", async () => {
    const store = createConsentStore();
    mountConsentBanner(store);
    await userEvent.click(button("Decline"));
    expect(store.getState()).toBe("denied");
    expect(createConsentStore().getState()).toBe("denied");
    expect(banner()).toBeNull();
  });

  test("a decision from elsewhere removes it", () => {
    const store = createConsentStore();
    mountConsentBanner(store);
    store.decline();
    expect(banner()).toBeNull();
  });

  test("does not take focus, and tabs privacy, decline, accept in order", async () => {
    const before = document.createElement("button");
    before.textContent = "Page";
    document.body.append(before);
    before.focus();
    mountConsentBanner(createConsentStore(), { privacyHref: "/privacy" });
    expect(document.activeElement).toBe(before);
    const user = userEvent.setup();
    await user.tab();
    expect(document.activeElement?.textContent).toBe("Privacy");
    await user.tab();
    expect(document.activeElement?.textContent).toBe("Decline");
    await user.tab();
    expect(document.activeElement?.textContent).toBe("Accept");
  });

  test("appends to the container option", () => {
    const container = document.createElement("div");
    document.body.append(container);
    mountConsentBanner(createConsentStore(), { container });
    expect(container.querySelector('[data-part="consent"]')).not.toBeNull();
  });

  test("unmount removes it and stops following the store", () => {
    const store = createConsentStore();
    const unmount = mountConsentBanner(store);
    unmount();
    expect(banner()).toBeNull();
    store.accept();
    store.reset();
    expect(banner()).toBeNull();
  });

  test("mounting twice for one store adds one banner, kept until both unmount", () => {
    const store = createConsentStore();
    const first = mountConsentBanner(store);
    const second = mountConsentBanner(store);
    expect(document.querySelectorAll('[data-part="consent"]')).toHaveLength(1);
    first();
    first();
    expect(banner()).not.toBeNull();
    second();
    expect(banner()).toBeNull();
    // A fresh mount after both are gone works again.
    mountConsentBanner(store);
    expect(banner()).not.toBeNull();
  });

  test.each([
    [{ delayMs: -1 }, "delayMs"],
    [{ delayMs: Number.NaN }, "delayMs"],
    [{ delayMs: 2 ** 31 }, "delayMs"],
    [{ acceptLabel: 1 }, "acceptLabel"],
    [{ privacyHref: null }, "privacyHref"],
    [{ dely: 0 }, "dely"],
  ])("%j throws invalid_option on %s", (options, field) => {
    expect(() => mountConsentBanner(createConsentStore(), options as never)).toThrow(
      expect.objectContaining({ code: "invalid_option", field }),
    );
    expect(banner()).toBeNull();
  });

  test("without a document it does nothing", () => {
    const store = createConsentStore();
    vi.stubGlobal("document", undefined);
    const unmount = mountConsentBanner(store);
    unmount();
    vi.unstubAllGlobals();
    expect(banner()).toBeNull();
  });
});
