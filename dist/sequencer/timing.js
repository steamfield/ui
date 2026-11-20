import { LibraryError } from "../internal/errors.js";
// src/sequencer/timing.ts
const flatToolMs = () => 1e3;
/**
* The chat preset reproduces the OpenData chat demo: a 400–800ms start, per-character typing with
* ±9ms jitter, a 200–400ms hold on pre-typed text, 350–700ms before submit, a 300ms submit flash,
* 800–1400ms of thinking after user turns, word streaming at 20–55ms (60–140ms after
* punctuation) after an 80ms lead, a 1000–1600ms read pause, and a 500–900ms gap after tools.
* Its `toolMs` is a flat 1000ms; pass `(step) => clamp(timeMs + 200, 800, 1800)` to use recorded
* tool times.
*/
const chat = Object.freeze({
	startDelay: [400, 800],
	typeMsPerChar: 25,
	jitter: 9,
	preTypedHoldMs: [200, 400],
	submitHoldMs: [350, 700],
	flashMs: 300,
	thinkingAfterUser: [800, 1400],
	thinkingOnSubmit: false,
	thinkingMs: [800, 1400],
	streamUnit: "word",
	streamLeadMs: 80,
	wordMs: [20, 55],
	punctuationMs: [60, 140],
	readMs: [1e3, 1600],
	lineMs: 45,
	revealCapMs: 2400,
	toolMs: flatToolMs,
	gapMs: [500, 900]
});
/**
* The terminal preset reproduces rr's terminal player: 28ms per character with typing capped at
* 1600ms for a command and 2000ms for a user message, about 55ms per word, 45ms per output line
* capped at 2400ms, 900ms per tool call and 500ms after each step. No jitter.
*/
const terminal = Object.freeze({
	startDelay: 0,
	typeMsPerChar: (step) => Math.min(28, (step.kind === "command" ? 1600 : 2e3) / Math.max(1, step.text.length)),
	jitter: 0,
	preTypedHoldMs: 0,
	submitHoldMs: 0,
	flashMs: 300,
	thinkingAfterUser: 500,
	thinkingOnSubmit: false,
	thinkingMs: 700,
	streamUnit: "word",
	streamLeadMs: 0,
	wordMs: 27.5,
	punctuationMs: 27.5,
	readMs: 500,
	lineMs: 45,
	revealCapMs: 2400,
	toolMs: () => 900,
	gapMs: 500
});
/** Every phase takes 0ms: the whole script is done at 0. For reduced motion and snapshots. */
const instant = Object.freeze({
	startDelay: 0,
	typeMsPerChar: 0,
	jitter: 0,
	preTypedHoldMs: 0,
	submitHoldMs: 0,
	flashMs: 0,
	thinkingAfterUser: false,
	thinkingOnSubmit: false,
	thinkingMs: 0,
	streamUnit: "word",
	streamLeadMs: 0,
	wordMs: 0,
	punctuationMs: 0,
	readMs: 0,
	lineMs: 0,
	revealCapMs: 0,
	toolMs: () => 0,
	gapMs: 0
});
/** Timing presets. `compile` starts from `chat` and applies the `timing` option over it. */
const presets = Object.freeze({
	chat,
	terminal,
	instant
});
const isMs = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const isSpan = (value) => isMs(value) || Array.isArray(value) && value.length === 2 && isMs(value[0]) && isMs(value[1]) && value[0] <= value[1];
const checks = {
	startDelay: isSpan,
	typeMsPerChar: (v) => isMs(v) || typeof v === "function",
	jitter: isMs,
	preTypedHoldMs: isSpan,
	submitHoldMs: isSpan,
	flashMs: isMs,
	thinkingAfterUser: (v) => v === false || isSpan(v),
	thinkingOnSubmit: (v) => typeof v === "boolean",
	thinkingMs: isSpan,
	streamUnit: (v) => v === "char" || v === "word" || v === "line",
	streamLeadMs: isMs,
	wordMs: isSpan,
	punctuationMs: isSpan,
	readMs: isSpan,
	lineMs: isMs,
	revealCapMs: isMs,
	toolMs: (v) => typeof v === "function",
	gapMs: isSpan
};
/** `chat` with `overrides` applied, every field checked. An unknown key is `invalid_option`. */
function resolveTiming(overrides) {
	if (overrides === void 0) return chat;
	if (typeof overrides !== "object" || overrides === null) throw new LibraryError("invalid_option", { field: "timing" });
	for (const [key, value] of Object.entries(overrides)) {
		const check = checks[key];
		if (!Object.hasOwn(checks, key) || !check?.(value)) throw new LibraryError("invalid_option", { field: `timing.${key}` });
	}
	return {
		...chat,
		...overrides
	};
}
/** A duration from a hook (`typeMsPerChar`, `toolMs`), checked so a bad return can't poison time. */
function checkedMs(value, field) {
	if (!isMs(value)) throw new LibraryError("invalid_option", { field: `timing.${field}` });
	return value;
}
export { checkedMs, presets, resolveTiming };
