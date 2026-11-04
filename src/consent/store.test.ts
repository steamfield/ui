// Adapted from OpenData's shared/lib/consent.test.ts. Its read/write/clear cases are kept, with
// `getStoredConsent()` read through a fresh `createConsentStore()` (what a page reload does) and
// the setters mapped to the store's commands. `hasConsent` has no counterpart here.
import { beforeEach, describe, expect, type MockInstance, test, vi } from "vitest";
import { setDocumentCookie, stubCookieJar } from "../../tests/helpers/dom.ts";
import { createConsentStore } from "./store.ts";

/** Hosts the shared-domain tests visit; each test's cleanup clears the consent cookie on all. */
const HOSTS = [
  "https://steamfield.io/",
  "https://rr.steamfield.io/",
  "https://decks.steamfield.io/",
  "https://preview.example.com/",
  "https://other.example.com/",
];

const goTo = (url: string): void => {
  (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL(url);
};

// Every test runs on a jar that deletes `Max-Age=0` cookies at once, as browsers do, and starts
// with no consent cookie. The cleanup runs even when an assertion fails, so no cookie leaks into
// the next test: on each visited host it clears the host-only cookie and the shared one.
beforeEach(() => {
  stubCookieJar();
  setDocumentCookie("sf-consent=; Path=/; Max-Age=0");
  const start = location.href;
  return () => {
    // A test may have stubbed `document` away or left the jar refusing writes: put both back
    // (Vitest would before the next test anyway) and clear through a plain jar.
    vi.unstubAllGlobals();
    stubCookieJar();
    for (const host of HOSTS) {
      goTo(host);
      setDocumentCookie("sf-consent=; Path=/; Max-Age=0");
      setDocumentCookie("sf-consent=; Path=/; Max-Age=0; Domain=.steamfield.io");
    }
    goTo(start);
    setDocumentCookie("sf-consent=; Path=/; Max-Age=0");
  };
});

/** What a page load would read: a new store over the current cookies. */
const getStoredConsent = () => createConsentStore().getState();

describe("consent cookie storage", () => {
  beforeEach(() => {
    // Expire every cookie this host lists, host-only, which is how these tests set them. The
    // top-level cleanup clears the consent cookie on the shared-domain tests' hosts.
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
    // Rounds to Max-Age=0, which would delete the cookie it means to write.
    [{ maxAgeDays: 0.4 / 86_400 }, "maxAgeDays"],
    // Browsers cap cookie lifetimes at 400 days.
    [{ maxAgeDays: 401 }, "maxAgeDays"],
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

  test.each([1 / 86_400, 400])("accepts maxAgeDays %s, the ends of the range", (maxAgeDays) => {
    expect(() => createConsentStore({ maxAgeDays })).not.toThrow();
  });
});

describe("a shared domain, across hosts", () => {
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
  });
});

describe("when the browser refuses a write", () => {
  let writes: MockInstance<(value: string) => void>;
  /** Passes every write to the jar except those `refuse` matches, as a browser would. */
  function refuseWrites(refuse: (value: string) => boolean): void {
    writes = stubCookieJar(refuse);
  }

  test("with cookies blocked the decision holds in memory for this page only", () => {
    refuseWrites(() => true);
    const store = createConsentStore();
    expect(store.getState()).toBeNull();
    const listener = vi.fn();
    store.subscribe(listener);
    store.accept();
    expect(writes.mock.calls.at(-1)?.[0]).toMatch(/^sf-consent=granted;/);
    expect(store.getState()).toBe("granted");
    expect(listener).toHaveBeenCalledWith("granted");
    expect(createConsentStore().getState()).toBeNull();
  });

  test("a refused Domain cookie falls back to a host-only one", () => {
    goTo("https://rr.steamfield.io/");
    refuseWrites((value) => value.includes("Domain="));
    createConsentStore({ domain: "steamfield.io" }).decline();
    expect(writes.mock.calls.at(-1)?.[0]).toBe(
      "sf-consent=denied; Path=/; Max-Age=31536000; SameSite=Lax; Secure",
    );
    expect(createConsentStore({ domain: "steamfield.io" }).getState()).toBe("denied");
    // Reset clears the fallback cookie too.
    createConsentStore({ domain: "steamfield.io" }).reset();
    expect(createConsentStore({ domain: "steamfield.io" }).getState()).toBeNull();
  });
});

describe("when document.cookie throws (an opaque origin)", () => {
  test("nothing persists, nothing throws, and the decision holds in memory", () => {
    const denied = (): never => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    };
    const read = vi.spyOn(document, "cookie", "get").mockImplementation(denied);
    const write = vi.spyOn(document, "cookie", "set").mockImplementation(denied);
    const store = createConsentStore({ domain: "steamfield.io" });
    expect(store.getState()).toBeNull();
    const listener = vi.fn();
    store.subscribe(listener);
    expect(() => store.accept()).not.toThrow();
    expect(store.getState()).toBe("granted");
    expect(() => store.decline()).not.toThrow();
    expect(() => store.reset()).not.toThrow();
    expect(listener.mock.calls).toEqual([["granted"], ["denied"], [null]]);
    // The stubs were really hit, so the guards are what kept these from throwing.
    expect(read).toHaveBeenCalled();
    expect(write).toHaveBeenCalled();
  });

  test("any other error from the getter or setter propagates", () => {
    const bug = new TypeError("not a cookie problem");
    const read = vi.spyOn(document, "cookie", "get").mockImplementation(() => {
      throw bug;
    });
    expect(() => createConsentStore()).toThrow(bug);
    read.mockReturnValue("");
    const store = createConsentStore();
    vi.spyOn(document, "cookie", "set").mockImplementation(() => {
      throw bug;
    });
    expect(() => store.accept()).toThrow(bug);
  });
});
