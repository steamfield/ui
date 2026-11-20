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
export declare function createConsentStore(options?: ConsentStoreOptions): ConsentStore;