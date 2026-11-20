import { ConsentState, ConsentStore } from "../../consent/store.js";
export interface UseConsentResult {
  /** The decision, or null while undecided (always null on the server). */
  readonly consent: ConsentState;
  readonly accept: () => void;
  readonly decline: () => void;
  /** Clear the stored decision, which shows the banner again. */
  readonly reset: () => void;
}
/**
 * Follows `store` and re-renders on every decision. Pass a stable store, created once outside
 * render: a new one each render would read the cookie again and resubscribe every time.
 */
export declare function useConsent(store: ConsentStore): UseConsentResult;