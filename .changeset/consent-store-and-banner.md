---
"@steamfield/ui": minor
---

New `consent` and `react/consent` subpaths: one analytics consent decision shared across a site's subdomains, and a banner that asks for it.

- `createConsentStore({ cookieName?, domain?, maxAgeDays? })` keeps `"granted" | "denied" | null` in a first-party cookie (`sf-consent` by default, `Path=/`, `SameSite=Lax`, one year, `Secure` on https). With `domain` the cookie is scoped to `.${domain}` on that host and its subdomains, and host-only anywhere else. It has `getState`, `subscribe`, `accept`, `decline`, `reset` and `destroy`, and is safe to create during server rendering.
- `mountConsentBanner(store, options?)` shows a non-modal labelled region with a message, an optional privacy link, Decline and Accept while the store is undecided, and removes it on any decision. It slides in after `delayMs` (default 1200) only when motion is allowed, and never takes focus. Every string is an option.
- `useConsent(store)` and `<ConsentBanner store />` are the React binding, with the same markup and rules.
- `consent/styles.css`: a bottom-right card themed through `--sf-consent-background`, `-foreground`, `-muted`, `-border`, `-accent`, `-accent-foreground`, `-radius`, `-shadow`, `-font` and `-z-index`. New `data-part` values: `consent`, `consent-message`, `consent-actions`, `consent-privacy`, `consent-decline`, `consent-accept`.
