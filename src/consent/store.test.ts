// Adapted from OpenData's shared/lib/consent.test.ts. Its read/write/clear cases are kept, with
// `getStoredConsent()` read through a fresh `createConsentStore()` (what a page reload does) and
// the setters mapped to the store's commands. `hasConsent` has no counterpart here.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { setDocumentCookie } from "../../tests/helpers/dom.ts";
import { createConsentStore } from "./store.ts";

/** What a page load would read: a new store over the current cookies. */
const getStoredConsent = () => createConsentStore().getState();

describe("consent cookie storage", () => {
  beforeEach(() => {
    // Clear all cookies
    document.cookie.split(";").forEach((c) => {
      const name = c.trim().split("=")[0];
      if (name) {
        setDocumentCookie(`${name}=; Path=/; Max-Age=0`);
      }
    });
  });

  describe("getStoredConsent", () => {
    test("returns null when no consent cookie exists", () => {
      expect(getStoredConsent()).toBeNull();
    });

    test("returns 'granted' when consent cookie is granted", () => {
      setDocumentCookie("sf-consent=granted; Path=/");
      expect(getStoredConsent()).toBe("granted");
    });

    test("returns 'denied' when consent cookie is denied", () => {
      setDocumentCookie("sf-consent=denied; Path=/");
      expect(getStoredConsent()).toBe("denied");
    });

    test("returns null for unrecognized cookie values", () => {
      setDocumentCookie("sf-consent=maybe; Path=/");
      expect(getStoredConsent()).toBeNull();
    });

    test("ignores other cookies", () => {
      setDocumentCookie("other-cookie=granted; Path=/");
      expect(getStoredConsent()).toBeNull();
    });

    test("ignores a cookie whose name only ends with the consent cookie's", () => {
      setDocumentCookie("x-sf-consent=granted; Path=/");
      expect(getStoredConsent()).toBeNull();
    });

    test("reads a custom cookie name", () => {
      setDocumentCookie("site-choice=denied; Path=/");
      expect(createConsentStore({ cookieName: "site-choice" }).getState()).toBe("denied");
      expect(getStoredConsent()).toBeNull();
    });
  });

  describe("setStoredConsent", () => {
    test("sets granted consent readable by getStoredConsent", () => {
      createConsentStore().accept();
      expect(getStoredConsent()).toBe("granted");
    });

    test("sets denied consent readable by getStoredConsent", () => {
      createConsentStore().decline();
      expect(getStoredConsent()).toBe("denied");
    });

    test("overwrites previous consent value", () => {
      const store = createConsentStore();
      store.accept();
      expect(getStoredConsent()).toBe("granted");
      store.decline();
      expect(getStoredConsent()).toBe("denied");
    });

    test("updates the store's own state too", () => {
      const store = createConsentStore();
      store.accept();
      expect(store.getState()).toBe("granted");
    });
  });

  describe("clearStoredConsent", () => {
    test("removes consent so getStoredConsent returns null", () => {
      const store = createConsentStore();
      store.accept();
      expect(getStoredConsent()).toBe("granted");
      store.reset();
      expect(getStoredConsent()).toBeNull();
      expect(store.getState()).toBeNull();
    });

    test("is a no-op when no consent exists", () => {
      createConsentStore().reset();
      expect(getStoredConsent()).toBeNull();
    });
  });
});

describe("subscribe", () => {
  beforeEach(() => {
    setDocumentCookie("sf-consent=; Path=/; Max-Age=0");
  });

  test("notifies each subscriber with the new state", () => {
    const store = createConsentStore();
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe(a);
    store.subscribe(b);
    store.accept();
    store.decline();
    store.reset();
    expect(a.mock.calls).toEqual([["granted"], ["denied"], [null]]);
    expect(b.mock.calls).toEqual(a.mock.calls);
  });

  test("does not notify when the decision is unchanged", () => {
    const store = createConsentStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.accept();
    store.accept();
    store.reset();
    store.reset();
    expect(listener.mock.calls).toEqual([["granted"], [null]]);
  });

  test("stops after unsubscribe", () => {
    const store = createConsentStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.accept();
    expect(listener).not.toHaveBeenCalled();
  });

  test("destroy drops subscribers, and a later subscribe is inert", () => {
    const store = createConsentStore();
    const before = vi.fn();
    store.subscribe(before);
    store.destroy();
    const after = vi.fn();
    const unsubscribe = store.subscribe(after);
    store.accept();
    unsubscribe();
    expect(before).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
    // The store still records and reports the decision.
    expect(store.getState()).toBe("granted");
    expect(getStoredConsent()).toBe("granted");
  });

  test("a listener that unsubscribes another mid-notify doesn't skip anyone this round", () => {
    const store = createConsentStore();
    const second = vi.fn();
    let off = (): void => {};
    store.subscribe(() => off());
    off = store.subscribe(second);
    store.accept();
    expect(second).toHaveBeenCalledWith("granted");
  });
});

describe("without a document (server rendering)", () => {
  test("getState is null and the commands write nothing and don't throw", () => {
    vi.stubGlobal("document", undefined);
    const store = createConsentStore({ domain: "example.com" });
    expect(store.getState()).toBeNull();
    const listener = vi.fn();
    store.subscribe(listener);
    store.accept();
    expect(store.getState()).toBe("granted");
    expect(listener).toHaveBeenCalledWith("granted");
    store.reset();
    expect(store.getState()).toBeNull();
  });
});

describe("options", () => {
  test.each([
    [{ cookieName: "" }, "cookieName"],
    [{ cookieName: "a b" }, "cookieName"],
    [{ cookieName: "a;b" }, "cookieName"],
    [{ cookieName: 1 }, "cookieName"],
    [{ domain: "" }, "domain"],
    [{ domain: ".example.com" }, "domain"],
    [{ domain: "example.com/" }, "domain"],
    [{ domain: 1 }, "domain"],
    [{ maxAgeDays: 0 }, "maxAgeDays"],
    [{ maxAgeDays: -1 }, "maxAgeDays"],
    [{ maxAgeDays: Number.NaN }, "maxAgeDays"],
    [{ maxAgeDays: Number.POSITIVE_INFINITY }, "maxAgeDays"],
    [{ maxAgeDays: "365" }, "maxAgeDays"],
    [{ cookiename: "x" }, "cookiename"],
    [null, "options"],
  ])("%j throws invalid_option on %s", (options, field) => {
    expect(() => createConsentStore(options as never)).toThrow(
      expect.objectContaining({ code: "invalid_option", field }),
    );
  });

  test("accepts a mixed-case domain", () => {
    expect(() => createConsentStore({ domain: "Example.COM" })).not.toThrow();
  });
});

describe("a shared domain, on the real cookie jar", () => {
  const goTo = (url: string): void => {
    (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL(url);
  };
  beforeEach(() => {
    const start = location.href;
    return () => goTo(start);
  });

  test("a decision on a subdomain is read on the domain and a sibling subdomain", () => {
    goTo("https://rr.steamfield.io/");
    createConsentStore({ domain: "steamfield.io" }).accept();
    goTo("https://steamfield.io/");
    expect(createConsentStore({ domain: "steamfield.io" }).getState()).toBe("granted");
    goTo("https://decks.steamfield.io/");
    const sibling = createConsentStore({ domain: "steamfield.io" });
    expect(sibling.getState()).toBe("granted");
    sibling.reset();
    goTo("https://rr.steamfield.io/");
    expect(createConsentStore({ domain: "steamfield.io" }).getState()).toBeNull();
  });

  test("on an unrelated host the decision stays on that host", () => {
    goTo("https://preview.example.com/");
    createConsentStore({ domain: "steamfield.io" }).decline();
    expect(createConsentStore({ domain: "steamfield.io" }).getState()).toBe("denied");
    goTo("https://other.example.com/");
    expect(createConsentStore({ domain: "steamfield.io" }).getState()).toBeNull();
    goTo("https://preview.example.com/");
    createConsentStore({ domain: "steamfield.io" }).reset();
  });
});
