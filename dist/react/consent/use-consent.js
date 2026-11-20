import { useSyncExternalStore } from "react";
// src/react/consent/use-consent.ts
const undecided = () => null;
/**
* Follows `store` and re-renders on every decision. Pass a stable store, created once outside
* render: a new one each render would read the cookie again and resubscribe every time.
*/
function useConsent(store) {
	return {
		consent: useSyncExternalStore(store.subscribe, store.getState, undecided),
		accept: store.accept,
		decline: store.decline,
		reset: store.reset
	};
}
export { useConsent };
