import { LibraryError } from "../internal/errors.js";
import { unknownOption } from "../internal/options.js";
import { consentCookie, consentCookieWrites, readConsentCookie } from "./cookie.js";
// src/consent/store.ts
const KNOWN = [
	"cookieName",
	"domain",
	"maxAgeDays"
];
const COOKIE_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const DOMAIN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/i;
const SECONDS_PER_DAY = 86400;
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
function createConsentStore(options = {}) {
	const bad = unknownOption(options, KNOWN);
	if (bad) throw new LibraryError("invalid_option", { field: bad });
	const name = options.cookieName ?? "sf-consent";
	if (typeof name !== "string" || !COOKIE_NAME.test(name)) throw new LibraryError("invalid_option", { field: "cookieName" });
	const domain = options.domain;
	if (domain !== void 0 && (typeof domain !== "string" || !DOMAIN.test(domain))) throw new LibraryError("invalid_option", { field: "domain" });
	const days = options.maxAgeDays ?? 365;
	const maxAge = typeof days === "number" ? Math.round(days * SECONDS_PER_DAY) : NaN;
	if (!(maxAge >= 1 && days <= MAX_DAYS)) throw new LibraryError("invalid_option", { field: "maxAgeDays" });
	const cookie = {
		maxAge,
		domain: domain?.toLowerCase()
	};
	const listeners = /* @__PURE__ */ new Set();
	let destroyed = false;
	let state = readCookie(name);
	const write = (next) => {
		if (typeof document === "undefined") return;
		const writes = consentCookieWrites(name, next, cookie, location);
		for (const assignment of writes) setCookie(assignment);
		if (writes.length === 1 || readCookie(name) === next) return;
		setCookie(consentCookie(name, next, {
			...cookie,
			domain: void 0
		}, location));
	};
	const set = (next) => {
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
		}
	};
}
const isSecurityError = (error) => error instanceof DOMException && error.name === "SecurityError";
function readCookie(name) {
	if (typeof document === "undefined") return null;
	let cookies;
	try {
		cookies = document.cookie;
	} catch (error) {
		if (!isSecurityError(error)) throw error;
		return null;
	}
	return readConsentCookie(cookies, name);
}
function setCookie(assignment) {
	try {
		document.cookie = assignment;
	} catch (error) {
		if (!isSecurityError(error)) throw error;
	}
}
export { createConsentStore };
