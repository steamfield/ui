import { unknownOption } from "../internal/options.js";
import { LibraryError } from "../internal/errors.js";
import { tracksOf } from "./compile.js";
// src/sequencer/view.ts
const countAt = (times, t) => {
	let n = 0;
	while (n < times.length && (times[n] ?? 0) <= t) n++;
	return n;
};
const fraction = (t, from, to) => to <= from ? 1 : Math.min(1, Math.max(0, (t - from) / (to - from)));
function textEntry(entry, track, t) {
	const text = track.units.join("");
	const shown = track.units.slice(0, countAt(track.unitTimes, t)).join("");
	entry.visibleText = shown;
	entry.progress = text.length === 0 ? 1 : shown.length / text.length;
}
function userPhase(entry, track, t) {
	if (t < track.submit) {
		entry.phase = "typing";
		textEntry(entry, track, t);
		return;
	}
	entry.visibleText = track.units.join("");
	if (t >= track.thinkingStart && t < track.thinkingEnd) {
		entry.phase = "thinking";
		entry.progress = fraction(t, track.thinkingStart, track.thinkingEnd);
	} else if (t < track.flashEnd && t < track.thinkingStart) entry.phase = "submitted";
	else entry.phase = "done";
}
function linesEntry(entry, track, t) {
	entry.visibleLines = track.lines.slice(0, countAt(track.lineTimes, t));
	if (t < track.settle) {
		entry.phase = "revealing";
		entry.progress = track.lines.length === 0 ? 1 : entry.visibleLines.length / track.lines.length;
	}
}
function toolEntry(entry, track, step, t) {
	const running = t < track.runEnd;
	if (step.body) entry.bodyVisible = !running;
	if (step.output) linesEntry(entry, track, t);
	if (running) {
		entry.phase = "running";
		entry.progress = fraction(t, track.start, track.runEnd);
	}
	entry.status = running ? "running" : step.status ?? "done";
}
/** The entry for a started step at `t` ms. */
function timeEntry(track, t) {
	const { key, index, step } = track;
	const entry = {
		key,
		index,
		step,
		phase: "done",
		progress: 1
	};
	switch (step.kind) {
		case "user":
			userPhase(entry, track, t);
			break;
		case "command":
		case "agent-text":
			textEntry(entry, track, t);
			if (t < track.settle) entry.phase = step.kind === "command" ? "typing" : "revealing";
			break;
		case "thinking":
		case "pause":
			if (t < track.settle) {
				entry.phase = step.kind === "pause" ? "holding" : "thinking";
				entry.progress = fraction(t, track.start, track.settle);
			}
			break;
		case "output":
			linesEntry(entry, track, t);
			break;
		case "tool-call": toolEntry(entry, track, step, t);
	}
	return withMore(entry, step);
}
function withMore(entry, step) {
	if (entry.phase === "done" && (step.kind === "output" || step.kind === "tool-call")) {
		if (step.more !== void 0) entry.more = step.more;
	}
	return entry;
}
function clickTool(entry, track, step, click) {
	const bodyShown = click >= track.bodyAt;
	const outputShown = click >= track.outputAt;
	if (step.body) entry.bodyVisible = bodyShown;
	if (step.output) entry.visibleLines = outputShown ? step.output : [];
	const pending = step.body !== void 0 && !bodyShown || step.output && !outputShown;
	if (pending) {
		entry.phase = "running";
		entry.progress = 0;
	}
	entry.status = pending ? "running" : step.status ?? "done";
}
/** The entry for a step revealed by click `click`: done, unless a body or output is pending. */
function clickEntry(track, click) {
	const { key, index, step } = track;
	const entry = {
		key,
		index,
		step,
		phase: "done",
		progress: 1
	};
	if (step.kind === "user" || step.kind === "command" || step.kind === "agent-text") entry.visibleText = track.units.join("");
	if (step.kind === "output") entry.visibleLines = step.lines;
	if (step.kind === "tool-call") clickTool(entry, track, step, click);
	return withMore(entry, step);
}
function lastIndex(entries) {
	return entries.at(-1)?.index ?? -1;
}
function timeView(timeline, ms) {
	const { tracks, composer } = tracksOf(timeline);
	const t = Math.min(Math.max(ms, 0), timeline.duration);
	const entries = tracks.filter((track) => track.appear <= t).map((track) => timeEntry(track, t));
	let text = "";
	let flash = false;
	for (const track of tracks) {
		if (!track.composer || track.start > t) continue;
		if (t < track.submit) text = track.units.slice(0, countAt(track.unitTimes, t)).join("");
		else if (t < track.flashEnd) flash = true;
	}
	const started = tracks.filter((track) => track.start <= t);
	return {
		entries,
		composer: composer ? {
			text,
			flash
		} : null,
		current: started.at(-1)?.index ?? -1,
		complete: t >= timeline.duration,
		elapsed: t,
		duration: timeline.duration,
		turnStarts: timeline.turnStarts,
		turnEnds: timeline.turnEnds
	};
}
function clickView(timeline, click) {
	const { tracks, composer } = tracksOf(timeline);
	const entries = tracks.filter((track) => track.at <= click).map((track) => clickEntry(track, click));
	const complete = click >= timeline.clickCount;
	return {
		entries,
		composer: composer ? {
			text: "",
			flash: false
		} : null,
		current: lastIndex(entries),
		complete,
		elapsed: complete ? timeline.duration : 0,
		duration: timeline.duration,
		turnStarts: timeline.turnStarts,
		turnEnds: timeline.turnEnds
	};
}
/**
* What is on screen at a position. Pure: the same timeline and position always give the same
* view, so the server render, the first client render, tests and screenshots agree. `{ ms }` is
* clamped to `[0, duration]`. `{ click }` shows every step whose `at` is at or below it.
*/
function stateAt(timeline, position) {
	if (typeof position !== "object" || position === null) throw new LibraryError("invalid_option", { field: "position" });
	if ("ms" in position) {
		if (typeof position.ms !== "number" || Number.isNaN(position.ms)) throw new LibraryError("invalid_option", { field: "position.ms" });
		return timeView(timeline, position.ms);
	}
	if (typeof position.click !== "number" || Number.isNaN(position.click)) throw new LibraryError("invalid_option", { field: "position.click" });
	return clickView(timeline, position.click);
}
/** The kept indices, and whether they keep the order listed instead of script order. */
function pick(policy, steps) {
	if (policy === "last") {
		const last = (kind) => steps.findLastIndex((s) => s.kind === kind);
		const picked = [last("agent-text"), last("tool-call")];
		if (picked.every((i) => i === -1)) return {
			keep: [last("command"), last("output")],
			listed: false
		};
		return {
			keep: picked,
			listed: false
		};
	}
	const object = typeof policy === "object" && policy !== null;
	const fn = object ? policy.pick : policy;
	const order = object ? policy.order ?? "script" : "script";
	if (typeof fn !== "function" || order !== "script" && order !== "listed") throw new LibraryError("invalid_option", { field: "policy" });
	const picked = fn(steps);
	if (!(Array.isArray(picked) && picked.every((i) => Number.isInteger(i) && i >= 0 && i < steps.length))) throw new LibraryError("invalid_option", { field: "policy" });
	return {
		keep: [...new Set(picked)],
		listed: order === "listed"
	};
}
/**
* The finished view, for SSR, no-JS and reduced motion. "all" (the default) equals
* `stateAt(timeline, { ms: duration })`. "last" keeps only the last agent-text and the last
* tool-call, in script order; a script with neither keeps its last command and last output. A
* function gets the steps and returns the indices to keep, shown in script order; the object
* form `{ pick, order: "listed" }` shows them in the order `pick` returns them instead.
*/
function finalState(timeline, options = {}) {
	const badOption = unknownOption(options, ["policy"]);
	if (badOption) throw new LibraryError("invalid_option", { field: badOption });
	const { policy = "all" } = options;
	const view = timeView(timeline, timeline.duration);
	if (policy === "all") return view;
	const { keep, listed } = pick(policy, timeline.script.steps);
	if (!listed) {
		const kept = new Set(keep);
		return {
			...view,
			entries: view.entries.filter((entry) => kept.has(entry.index))
		};
	}
	const byIndex = new Map(view.entries.map((entry) => [entry.index, entry]));
	const entries = keep.flatMap((index) => byIndex.get(index) ?? []);
	return {
		...view,
		entries
	};
}
export { finalState, stateAt };
