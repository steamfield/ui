import { LibraryError } from "../internal/errors.ts";
import { unknownOption } from "../internal/options.ts";
import { consentCookie, consentCookieWrites, readConsentCookie } from "./cookie.ts";

/** The visitor's decision: `"granted"`, `"denied"`, or null while undecided. */
export type ConsentState = "granted" | "denied" | null;

export interface ConsentStoreOptions {
  /** The cookie that holds the decision. Default "sf-consent". */
  readonly cookieName?: string;
  /**
   * A registrable domain such as "example.com", never a public suffix such as "co.uk" or
   * "pages.dev" (browsers refuse those). On that host or any subdomain of it the cookie is written
   * with `Domain=.example.com`, so every subdomain shares one decision. On any other host
   * (localhost, a preview URL) the cookie is host-only. Default: host-only everywhere.
   */
  readonly domain?: string;
  /** How long the decision is kept, in days: at least one second, at most 400. Default 365. */
  readonly maxAgeDays?: number;
}

export interface ConsentStore {
  /** The current decision. Null while undecided, and always null without a `document`. */
  readonly getState: () => ConsentState;
  /** Called with the new state after every change. Returns an unsubscribe function. */
  readonly subscribe: (listener: (state: ConsentState) => void) => () => void;
  /** Records `"granted"` in the cookie and notifies subscribers. */
  readonly accept: () => void;
  /** Records `"denied"` in the cookie and notifies subscribers. */
  readonly decline: () => void;
  /** Clears the cookie, so the visitor is undecided again, and notifies subscribers. */
  readonly reset: () => void;
  /**
   * Drops every subscriber, and a later `subscribe` is inert. The commands still write the cookie
   * and `getState` still answers.
   */
  readonly destroy: () => void;
}

const KNOWN = ["cookieName", "domain", "maxAgeDays"];
// RFC 6265 cookie-name token characters.
const COOKIE_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const DOMAIN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/i;
const SECONDS_PER_DAY = 86_400;
const MAX_DAYS = 400;

/**
 * The consent decision, kept in a first-party cookie (`Path=/`, `SameSite=Lax`, `Secure` on
 * https). The state is read from the cookie once, here, and changes only through this store's
 * commands. Safe to call during server rendering: without a `document` the state is null and the
 * commands write nothing. Bad options throw `LibraryError` `invalid_option` naming the field.
 *
 * Each write is read back. If the browser refused the shared-domain cookie, the decision is
 * written host-only instead. If no cookie persists at all (cookies blocked, or `document.cookie`
 * throwing on an opaque origin), the decision still holds in memory for this page, so the banner
 * closes and subscribers hear it, but the next page load is undecided again. None of this throws.
 */
export function createConsentStore(options: ConsentStoreOptions = {}): ConsentStore {
  const bad = unknownOption(options, KNOWN);
  if (bad) throw new LibraryError("invalid_option", { field: bad });
  const name = options.cookieName ?? "sf-consent";
  if (typeof name !== "string" || !COOKIE_NAME.test(name)) {
    throw new LibraryError("invalid_option", { field: "cookieName" });
  }
  const domain: unknown = options.domain;
  if (domain !== undefined && (typeof domain !== "string" || !DOMAIN.test(domain))) {
    throw new LibraryError("invalid_option", { field: "domain" });
  }
  const days = options.maxAgeDays ?? 365;
  const maxAge = typeof days === "number" ? Math.round(days * SECONDS_PER_DAY) : Number.NaN;
  // Browsers cap cookie lifetimes at 400 days, and under one second rounds to a deleting Max-Age=0.
  if (!(maxAge >= 1 && days <= MAX_DAYS)) {
    throw new LibraryError("invalid_option", { field: "maxAgeDays" });
  }
  const cookie = { maxAge, domain: domain?.toLowerCase() };
  const listeners = new Set<(state: ConsentState) => void>();
  let destroyed = false;
  let state = readCookie(name);

  const write = (next: ConsentState): void => {
    if (typeof document === "undefined") return;
    const writes = consentCookieWrites(name, next, cookie, location);
    for (const assignment of writes) setCookie(assignment);
    if (writes.length === 1 || readCookie(name) === next) return;
    // The browser refused the Domain cookie: keep the decision on this host at least.
    setCookie(consentCookie(name, next, { ...cookie, domain: undefined }, location));
  };

  const set = (next: ConsentState): void => {
    write(next);
    if (next === state) return;
    state = next;
    for (const listener of [...listeners]) listener(next);
  };

  return {
    getState: () => state,
    subscribe(listener) {
      if (destroyed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    accept: () => set("granted"),
    decline: () => set("denied"),
    reset: () => set(null),
    destroy() {
      destroyed = true;
      listeners.clear();
    },
  };
}

// `document.cookie` throws a SecurityError where the page may not use cookies (an opaque origin,
// such as a sandboxed iframe). That is the same outcome as cookies being blocked, handled the same
// way: reads find no decision, writes persist nothing, and the decision lives in memory.

function readCookie(name: string): ConsentState {
  if (typeof document === "undefined") return null;
  try {
    return readConsentCookie(document.cookie, name);
  } catch {
    return null;
  }
}

function setCookie(assignment: string): void {
  try {
    // biome-ignore lint/suspicious/noDocumentCookie: the async Cookie Store API is missing from older Safari and Firefox, and this write must be synchronous.
    document.cookie = assignment;
  } catch {
    // Cookies are unavailable here; the store keeps the decision in memory (see above).
  }
}
