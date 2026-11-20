import { checkResetMs, createCopyState } from "../../copy/state.js";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
// src/react/copy/use-copy.ts
const idle = () => "idle";
/** Clipboard state for a React control: `copy(text)` resolves to whether it worked. */
function useCopy(options = {}) {
	const { onCopy } = options;
	const resetMs = checkResetMs(options.resetMs ?? 2e3, "resetMs");
	const [store] = useState(createCopyState);
	const mounted = useRef(true);
	const onCopyRef = useRef(onCopy);
	onCopyRef.current = onCopy;
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
			store.reset();
		};
	}, [store]);
	const state = useSyncExternalStore(store.subscribe, store.getState, idle);
	const copy = useCallback(async (text) => {
		const ok = await store.copy(text, {
			resetMs,
			isCurrent: () => mounted.current
		});
		if (mounted.current) onCopyRef.current?.(ok);
		return ok;
	}, [store, resetMs]);
	return {
		copied: state === "copied",
		failed: state === "failed",
		copy
	};
}
export { useCopy };
