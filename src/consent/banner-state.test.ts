// The banner rules both bindings adapt: when it opens, whether it animates, and what closes it.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { setDocumentCookie } from "../../tests/helpers/dom.ts";
import type { MotionSource } from "../internal/motion.ts";
import { CLOSED, createConsentBannerState } from "./banner-state.ts";
import { createConsentStore } from "./store.ts";

/** A motion source the test flips by hand. */
function motion(initial: boolean): MotionSource & { set: (next: boolean) => void } {
  let allowed = initial;
  return {
    get: () => allowed,
    subscribe: () => () => {},
    set: (next) => {
      allowed = next;
    },
  };
}

beforeEach(() => {
  setDocumentCookie("sf-consent=; Path=/; Max-Age=0");
  vi.useFakeTimers();
});

describe("createConsentBannerState", () => {
  test("is closed until started, opens after the delay, and animates once rendered", () => {
    const banner = createConsentBannerState(createConsentStore(), {
      delayMs: 1000,
      motion: motion(true),
    });
    expect(banner.getState()).toBe(CLOSED);
    banner.start();
    vi.advanceTimersByTime(999);
    expect(banner.getState()).toBe(CLOSED);
    vi.advanceTimersByTime(1);
    expect(banner.getState()).toEqual({ open: true, animate: false });
    banner.rendered();
    expect(banner.getState()).toEqual({ open: true, animate: true });
  });

  test("the entrance is decided by motion where the banner sits, when it reports rendered", () => {
    const source = motion(true);
    const banner = createConsentBannerState(createConsentStore(), { delayMs: 0, motion: source });
    banner.start();
    // The element turns out to sit inside a reduced-motion subtree.
    source.set(false);
    banner.rendered();
    expect(banner.getState()).toEqual({ open: true, animate: false });
  });

  test("only the first rendered after each opening counts", () => {
    const store = createConsentStore();
    const source = motion(false);
    const banner = createConsentBannerState(store, { delayMs: 0, motion: source });
    banner.start();
    banner.rendered();
    source.set(true);
    banner.rendered();
    expect(banner.getState().animate).toBe(false);
    // A new opening gets a new decision.
    store.accept();
    store.reset();
    banner.rendered();
    expect(banner.getState()).toEqual({ open: true, animate: true });
  });

  test("rendered while closed does nothing", () => {
    const banner = createConsentBannerState(createConsentStore(), {
      delayMs: 1000,
      motion: motion(true),
    });
    banner.start();
    banner.rendered();
    expect(banner.getState()).toBe(CLOSED);
  });

  test("CLOSED is frozen", () => {
    expect(Object.isFrozen(CLOSED)).toBe(true);
  });

  test("stop during the delay cancels it, and a new start waits the full delay again", () => {
    const banner = createConsentBannerState(createConsentStore(), {
      delayMs: 1000,
      motion: motion(true),
    });
    const stop = banner.start();
    vi.advanceTimersByTime(600);
    stop();
    vi.advanceTimersByTime(5000);
    expect(banner.getState()).toBe(CLOSED);
    banner.start();
    vi.advanceTimersByTime(999);
    expect(banner.getState()).toBe(CLOSED);
    vi.advanceTimersByTime(1);
    expect(banner.getState().open).toBe(true);
  });

  test("stop closes an open banner and notifies", () => {
    const banner = createConsentBannerState(createConsentStore(), {
      delayMs: 0,
      motion: motion(true),
    });
    const listener = vi.fn();
    banner.subscribe(listener);
    const stop = banner.start();
    expect(banner.getState().open).toBe(true);
    stop();
    expect(banner.getState()).toBe(CLOSED);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test("a stopped banner ignores later decisions", () => {
    const store = createConsentStore();
    const banner = createConsentBannerState(store, { delayMs: 0, motion: motion(true) });
    banner.start()();
    store.accept();
    store.reset();
    expect(banner.getState()).toBe(CLOSED);
  });

  test("reset during the delay opens it at once", () => {
    const store = createConsentStore();
    const banner = createConsentBannerState(store, { delayMs: 1000, motion: motion(true) });
    banner.start();
    store.accept();
    store.reset();
    banner.rendered();
    expect(banner.getState()).toEqual({ open: true, animate: true });
    // The page-load timer was cancelled; nothing changes when it would have fired.
    const listener = vi.fn();
    banner.subscribe(listener);
    vi.advanceTimersByTime(5000);
    expect(listener).not.toHaveBeenCalled();
  });

  test("motion turned off during the delay opens it without animation", () => {
    const source = motion(true);
    const banner = createConsentBannerState(createConsentStore(), {
      delayMs: 1000,
      motion: source,
    });
    banner.start();
    source.set(false);
    vi.advanceTimersByTime(1000);
    expect(banner.getState()).toEqual({ open: true, animate: false });
  });

  test("without motion it opens at once, with no animation", () => {
    const banner = createConsentBannerState(createConsentStore(), {
      delayMs: 1000,
      motion: motion(false),
    });
    banner.start();
    expect(banner.getState()).toEqual({ open: true, animate: false });
  });

  test("a decision before the timer fires keeps it closed", () => {
    const store = createConsentStore();
    const banner = createConsentBannerState(store, { delayMs: 1000, motion: motion(true) });
    banner.start();
    store.decline();
    vi.advanceTimersByTime(1000);
    expect(banner.getState()).toBe(CLOSED);
  });

  test("a decision the destroyed store couldn't announce still keeps it closed", () => {
    const store = createConsentStore();
    const banner = createConsentBannerState(store, { delayMs: 1000, motion: motion(true) });
    banner.start();
    store.destroy();
    store.accept();
    vi.advanceTimersByTime(1000);
    expect(banner.getState()).toBe(CLOSED);
  });

  test("a store decided before start never opens", () => {
    setDocumentCookie("sf-consent=granted; Path=/");
    const banner = createConsentBannerState(createConsentStore(), {
      delayMs: 0,
      motion: motion(true),
    });
    banner.start();
    vi.advanceTimersByTime(5000);
    expect(banner.getState()).toBe(CLOSED);
  });

  test("a decision closes it and notifies once", () => {
    const store = createConsentStore();
    const banner = createConsentBannerState(store, { delayMs: 0, motion: motion(true) });
    banner.start();
    const listener = vi.fn();
    const unsubscribe = banner.subscribe(listener);
    store.accept();
    store.decline();
    expect(banner.getState()).toBe(CLOSED);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
