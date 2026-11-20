import { LibraryError } from "../internal/errors.js";
import { copyText } from "./copy-text.js";
// src/copy/state.ts
/** The longest delay `setTimeout` honors; a longer one fires at once. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;
/**
* Checks a reset duration: false, or a whole range `setTimeout` honors (0 to 2^31 - 1 ms). NaN,
* a negative, Infinity or an overflowing delay would reset at once, so each throws
* `invalid_option` naming `field`.
*/
function checkResetMs(value, field) {
	if (value === false) return false;
	if (typeof value !== "number" || !(value >= 0 && value <= MAX_TIMEOUT_MS)) throw new LibraryError("invalid_option", { field });
	return value;
}
/**
* The copy state machine every binding shares: `copyText`, the stale-result guard, and the timer
* that returns `copied` to `idle`. Framework-free; the DOM enhancer and `useCopy` only adapt it.
*/
function createCopyState(options = {}) {
	const resetMs = checkResetMs(options.resetMs ?? 2e3, "resetMs");
	const listeners = /* @__PURE__ */ new Set();
	let state = "idle";
	let timer;
	let destroyed = false;
	const set = (next) => {
		state = next;
		for (const listener of [...listeners]) listener();
	};
	return {
		getState: () => state,
		subscribe(callback) {
			listeners.add(callback);
			return () => {
				listeners.delete(callback);
			};
		},
		async copy(text, attempt = {}) {
			const ms = attempt.resetMs === void 0 ? resetMs : checkResetMs(attempt.resetMs, "resetMs");
			const ok = await copyText(text);
			if (destroyed || attempt.isCurrent && !attempt.isCurrent()) return ok;
			clearTimeout(timer);
			timer = ok && ms !== false ? setTimeout(() => set("idle"), ms) : void 0;
			set(ok ? "copied" : "failed");
			return ok;
		},
		reset() {
			clearTimeout(timer);
			timer = void 0;
			if (state !== "idle") set("idle");
		},
		destroy() {
			destroyed = true;
			clearTimeout(timer);
			timer = void 0;
			listeners.clear();
		}
	};
}
export { checkResetMs, createCopyState };
