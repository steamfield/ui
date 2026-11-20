import { useGate } from "./use-playback.js";
import { useEffect } from "react";
// src/react/playback/use-count-up.ts
const easeOutCubic = (progress) => 1 - (1 - progress) ** 3;
/**
* Counts from 0 up to `end` once. It runs while the element is in view and the tab is visible,
* keeps its progress across pauses, and snaps to `end` under reduced motion. The value is derived
* from the gate's clock on every render, so a StrictMode re-run or a new `end` never freezes it
* mid-count. The server and first client render return `end`, so markup without JavaScript shows
* the real number. Intermediate values are floored; the last one is exactly `end`.
*/
function useCountUp(end, options = {}) {
	const { duration = 2e3, enabled = true, easing = easeOutCubic } = options;
	const { ref, gate, state } = useGate({
		autoStart: false,
		duration,
		...options.motion === void 0 ? {} : { motion: options.motion },
		...options.threshold === void 0 ? {} : { threshold: options.threshold },
		...options.rootMargin === void 0 ? {} : { rootMargin: options.rootMargin }
	});
	useEffect(() => {
		if (!gate) return;
		if (enabled) gate.play();
		else gate.pause();
	}, [
		gate,
		enabled,
		state.started
	]);
	if (!gate || state.complete) return {
		ref,
		value: end,
		complete: gate !== null
	};
	const progress = Math.min(state.elapsed / duration, 1);
	return {
		ref,
		value: Math.floor(easing(progress) * end),
		complete: false
	};
}
export { useCountUp };
