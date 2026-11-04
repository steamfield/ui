// From OpenData's ConsentProvider: the consent state and its accept/decline/reset commands. The
// React context is gone; the store is the shared state, so any component can read it.
import { useSyncExternalStore } from "react";
import type { ConsentState, ConsentStore } from "../../consent/store.ts";

export interface UseConsentResult {
  /** The decision, or null while undecided (always null on the server). */
  readonly consent: ConsentState;
  readonly accept: () => void;
  readonly decline: () => void;
  /** Clear the stored decision, which shows the banner again. */
  readonly reset: () => void;
}

const undecided = (): ConsentState => null;

/**
 * Follows `store` and re-renders on every decision. Pass a stable store, created once outside
 * render: a new one each render would read the cookie again and resubscribe every time.
 */
export function useConsent(store: ConsentStore): UseConsentResult {
  const consent = useSyncExternalStore(store.subscribe, store.getState, undecided);
  return { consent, accept: store.accept, decline: store.decline, reset: store.reset };
}
