import { ConsentBannerOptions } from "./banner-state.js";
import { ConsentStore } from "./store.js";
export interface MountConsentBannerOptions extends ConsentBannerOptions {
  /** Where the banner is appended. Default `document.body`. */
  readonly container?: Element;
}
/**
 * Shows a consent banner while `store` is undecided: a non-modal labelled region (not a dialog,
 * no focus trap, and it never takes focus) with the message, an optional privacy link, a decline
 * and an accept button. The buttons call `store.decline()` and `store.accept()`; any decision,
 * from the banner or elsewhere, removes it, and `store.reset()` brings it back. If focus is in
 * the banner when it goes, focus returns to where it was before it entered the banner. See
 * `createConsentBannerState` for the delay and motion rules; the store must outlive the banner.
 *
 * Each call owns its own banner and returns a function that removes it and stops following the
 * store; calling that function again does nothing. Without a `document` it does nothing. Call it
 * once the body exists (a deferred or module script) or pass `container`: with neither it throws
 * `LibraryError` `invalid_option` with `field: "container"`. Bad options throw `invalid_option`
 * naming the field.
 */
export declare function mountConsentBanner(store: ConsentStore, options?: MountConsentBannerOptions): () => void;