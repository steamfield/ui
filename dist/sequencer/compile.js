import { unknownOption } from "../internal/options.js";
import { LibraryError } from "../internal/errors.js";
import { validateScript } from "../script/validate.js";
import { seededRandom } from "./random.js";
import { checkedMs, resolveTiming } from "./timing.js";
// src/sequencer/compile.ts
const compiled = /* @__PURE__ */ new WeakMap();
/** The private half of a timeline from `compile`. */
function tracksOf(timeline) {
	const found = compiled.get(timeline);
	if (!found) throw new LibraryError("invalid_option", { field: "timeline" });
	return found;
}
const PUNCTUATION = /[.!?,;:]$/;
function streamUnits(text, unit) {
	if (unit === "char") return Array.from(text);
	if (unit === "line") return text.split(/(?<=\n)/).filter(Boolean);
	return text.split(/(\s+)/).filter(Boolean);
}
var Builder = class {
	timing;
	random;
	t = 0;
	constructor(timing, seed) {
		this.timing = timing;
		this.random = seededRandom(seed);
		this.t = this.span(timing.startDelay);
	}
	span(value) {
		if (typeof value === "number") return value;
		const [min, max] = value;
		return min + this.random() * (max - min);
	}
	jitter() {
		const { jitter } = this.timing;
		return jitter === 0 ? 0 : (this.random() * 2 - 1) * jitter;
	}
	/** Units appear one after another, each followed by its delay (set, then sleep). */
	reveal(units, delay) {
		return units.map((unit) => {
			const at = this.t;
			this.t += delay(unit);
			return at;
		});
	}
	revealLines(lines) {
		const { lineMs, revealCapMs } = this.timing;
		const per = lines.length === 0 ? 0 : Math.min(lineMs, revealCapMs / lines.length);
		return this.reveal(lines.map(() => ""), () => per);
	}
};
/**
* The base ms per typed character: a `typeMsPerChar` function's answer, else the step's `typingMs`
* spread over the `chars` it types, else the preset's number.
*/
function typeDelay(b, step, chars) {
	const { typeMsPerChar } = b.timing;
	let base;
	if (typeof typeMsPerChar === "function") base = typeMsPerChar(step);
	else if (step.typingMs !== void 0) base = step.typingMs / Math.max(1, chars);
	else base = typeMsPerChar;
	base = checkedMs(base, "typeMsPerChar");
	return () => Math.max(0, base + b.jitter());
}
function emptyTrack(step, index, start) {
	return {
		key: step.kind === "tool-call" && step.id !== void 0 ? `id:${step.id}` : String(index),
		index,
		step,
		start,
		end: start,
		at: 0,
		appear: start,
		settle: start,
		units: [],
		unitTimes: [],
		lines: [],
		lineTimes: [],
		submit: start,
		flashEnd: start,
		thinkingStart: start,
		thinkingEnd: start,
		runEnd: start,
		composer: false,
		bodyAt: 0,
		outputAt: 0
	};
}
function buildUser(b, track, step, next) {
	const pre = step.preTyped ?? "";
	const units = [];
	const times = [];
	if (pre) {
		units.push(pre);
		times.push(b.t);
		b.t += b.span(b.timing.preTypedHoldMs);
	}
	const chars = Array.from(step.text.slice(pre.length));
	const delay = typeDelay(b, step, chars.length);
	times.push(...b.reveal(chars, delay));
	units.push(...chars);
	b.t += b.span(b.timing.submitHoldMs);
	track.units = units;
	track.unitTimes = times;
	track.submit = b.t;
	track.flashEnd = b.t + b.timing.flashMs;
	const { thinkingAfterUser } = b.timing;
	const think = thinkingAfterUser !== false && next !== void 0 && next.kind !== "thinking";
	track.thinkingEnd = b.t + (think ? b.span(thinkingAfterUser) : 0);
	track.thinkingStart = think && b.timing.thinkingOnSubmit ? b.t : track.flashEnd;
	if (track.composer) track.appear = track.submit;
	b.t = Math.max(track.flashEnd, track.thinkingEnd);
	track.settle = b.t;
}
function buildAgentText(b, track, text) {
	const { streamUnit, streamLeadMs, lineMs, wordMs, punctuationMs, readMs } = b.timing;
	b.t += streamLeadMs;
	track.units = streamUnits(text, streamUnit);
	track.unitTimes = b.reveal(track.units, (unit) => {
		if (streamUnit === "line") return lineMs;
		return b.span(PUNCTUATION.test(unit) ? punctuationMs : wordMs);
	});
	track.settle = b.t;
	b.t += b.span(readMs);
}
function buildToolCall(b, track, step) {
	b.t += checkedMs(b.timing.toolMs(step), "toolMs");
	track.runEnd = b.t;
	track.lines = step.output ?? [];
	track.lineTimes = b.revealLines(track.lines);
	track.settle = b.t;
	b.t += b.span(b.timing.gapMs);
}
function buildStep(b, track, next) {
	const { step } = track;
	switch (step.kind) {
		case "user":
			buildUser(b, track, step, next);
			return;
		case "command":
			track.units = Array.from(step.text);
			track.unitTimes = b.reveal(track.units, typeDelay(b, step, track.units.length));
			track.settle = b.t;
			b.t += b.span(b.timing.gapMs);
			return;
		case "agent-text":
			buildAgentText(b, track, step.text);
			return;
		case "thinking":
		case "pause":
			b.t += step.ms ?? b.span(b.timing.thinkingMs);
			track.settle = b.t;
			return;
		case "output":
			track.lines = step.lines;
			track.lineTimes = b.revealLines(step.lines);
			track.settle = b.t;
			b.t += b.span(b.timing.gapMs);
			return;
		case "prompt": return;
		case "tool-call":
			buildToolCall(b, track, step);
			return;
	}
}
function turns(tracks, hidden) {
	const starts = [];
	const ends = [];
	for (const track of tracks) {
		if (starts.length === 0) starts.push(0);
		else if (track.step.kind === "user") starts.push(track.start);
		if (!hidden(track.step) || ends[starts.length - 1] === void 0) ends[starts.length - 1] = track.settle;
	}
	return {
		starts,
		ends
	};
}
function hiddenToolsOption(value) {
	if (value === void 0) return () => false;
	if (!Array.isArray(value) || value.some((name) => typeof name !== "string")) throw new LibraryError("invalid_option", { field: "hiddenTools" });
	const names = new Set(value);
	return (step) => step.kind === "tool-call" && names.has(step.name);
}
/** The click each step reveals at: its own `at`, else the previous step's, else 0. */
function effectiveAts(steps) {
	let at = 0;
	return steps.map((step) => {
		at = step.at ?? at;
		return at;
	});
}
function maxClick(tracks) {
	return tracks.reduce((max, t) => Math.max(max, t.at, t.bodyAt, t.outputAt), 0);
}
/** Sub-gates of a step: its body and output reveal at their own `at`, never before the step. */
function gates(step, at) {
	if (step.kind !== "tool-call") return {
		bodyAt: at,
		outputAt: at
	};
	return {
		bodyAt: Math.max(at, step.body?.at ?? at),
		outputAt: Math.max(at, step.outputAt ?? at)
	};
}
/**
* How many clicks a click-paced script needs: the highest `at` on any step, body or output. At
* that click everything is shown. Validates the script like `compile`.
*/
function clickCount(script) {
	validateScript(script);
	const ats = effectiveAts(script.steps);
	return maxClick(script.steps.map((step, i) => ({
		at: ats[i] ?? 0,
		...gates(step, ats[i] ?? 0)
	})));
}
/**
* Lays a script out in time. Validates the script (`invalid_script`, `unsupported_step`) and the
* options (`invalid_option`). Pure: the same script, options and seed give the same timeline.
*/
function compile(script, options = {}) {
	validateScript(script);
	const badOption = unknownOption(options, [
		"timing",
		"seed",
		"composer",
		"hiddenTools"
	]);
	if (badOption) throw new LibraryError("invalid_option", { field: badOption });
	const { seed = script.id ?? "", composer = false } = options;
	if (typeof seed !== "string") throw new LibraryError("invalid_option", { field: "seed" });
	if (typeof composer !== "boolean") throw new LibraryError("invalid_option", { field: "composer" });
	const hidden = hiddenToolsOption(options.hiddenTools);
	const b = new Builder(resolveTiming(options.timing), seed);
	const ats = effectiveAts(script.steps);
	const tracks = script.steps.map((step, index) => {
		const track = emptyTrack(step, index, b.t);
		track.at = ats[index] ?? 0;
		Object.assign(track, gates(step, track.at));
		track.composer = step.kind === "user" && (step.composer ?? composer);
		if (!hidden(step)) buildStep(b, track, script.steps[index + 1]);
		track.end = b.t;
		return track;
	});
	const { starts, ends } = turns(tracks, hidden);
	const timeline = Object.freeze({
		script,
		steps: Object.freeze(tracks.map(({ key, index, start, end, at }) => Object.freeze({
			key,
			index,
			start,
			end,
			at
		}))),
		duration: b.t,
		clickCount: maxClick(tracks),
		turnStarts: Object.freeze(starts),
		turnEnds: Object.freeze(ends)
	});
	const detail = {
		tracks,
		composer: tracks.some((t) => t.composer)
	};
	compiled.set(timeline, detail);
	return timeline;
}
export { clickCount, compile, effectiveAts, tracksOf };
