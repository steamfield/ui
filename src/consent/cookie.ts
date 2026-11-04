// The consent cookie's wire format: what the store writes to `document.cookie` and how it reads a
// decision back. Pure functions of their inputs, so the attributes can be checked for any host.

import type { ConsentState } from "./store.ts";

/** The parts of `location` that decide the cookie's attributes. */
export interface CookieLocation {
  readonly hostname: string;
  readonly protocol: string;
}

export interface ConsentCookieOptions {
  readonly maxAge: number;
  /** Lowercase registrable domain, or undefined for host-only everywhere. */
  readonly domain: string | undefined;
}

/**
 * The `document.cookie` assignment that records `value`, or clears the cookie when it is null:
 * `Path=/`, `Max-Age` (0 to clear), `SameSite=Lax`, `Domain=.${domain}` only when the host is the
 * domain or a subdomain of it, and `Secure` on https.
 */
export function consentCookie(
  name: string,
  value: ConsentState,
  { maxAge, domain }: ConsentCookieOptions,
  at: CookieLocation,
): string {
  const parts = [
    `${name}=${value ?? ""}`,
    "Path=/",
    `Max-Age=${value ? maxAge : 0}`,
    "SameSite=Lax",
  ];
  const host = at.hostname.toLowerCase();
  if (domain && (host === domain || host.endsWith(`.${domain}`))) parts.push(`Domain=.${domain}`);
  if (at.protocol === "https:") parts.push("Secure");
  return parts.join("; ");
}

/**
 * Every `document.cookie` assignment that records `value`, in order. When the cookie is scoped to
 * the shared domain, a host-only cookie of the same name is expired first: one left from before
 * `domain` was configured would otherwise be listed alongside the shared one and could shadow it.
 */
export function consentCookieWrites(
  name: string,
  value: ConsentState,
  options: ConsentCookieOptions,
  at: CookieLocation,
): string[] {
  const scoped = consentCookie(name, value, options, at);
  if (!scoped.includes("; Domain=")) return [scoped];
  return [consentCookie(name, null, { ...options, domain: undefined }, at), scoped];
}

/**
 * The decision in a `document.cookie` string: the first cookie named `name`. Browsers list
 * cookies by RFC 6265 order (longer path first, then earlier creation), so with two of the same
 * name and path the older one wins. Anything but "granted" or "denied" reads as null.
 */
export function readConsentCookie(cookie: string, name: string): ConsentState {
  const prefix = `${name}=`;
  for (const pair of cookie.split(/;\s*/)) {
    if (!pair.startsWith(prefix)) continue;
    const value = pair.slice(prefix.length);
    return value === "granted" || value === "denied" ? value : null;
  }
  return null;
}
