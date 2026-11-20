// src/agent-demo/core.ts
const defaultLabels = Object.freeze({
	play: "Play",
	pause: "Pause",
	replay: "Replay",
	completeStatus: "Demo complete.",
	idleStatus: "Example agent session.",
	you: "You",
	agent: "Agent",
	running: "Running",
	done: "Completed",
	failed: "Failed",
	thinking: "Agent thinking",
	placeholder: "Message the agent…",
	next: "Next",
	speed: "Playback speed",
	jumpToTurn: "Jump to turn",
	transcript: "Demo transcript",
	showCode: "Show code",
	more: (count) => `… +${count} lines`
});
const defaultGlyphs = Object.freeze({
	prompt: "$",
	user: "❯",
	agent: "●",
	output: "⎿",
	ok: "✓",
	fail: "✕",
	submit: "↵",
	spinner: Object.freeze([
		"⠋",
		"⠙",
		"⠹",
		"⠸",
		"⠼",
		"⠴",
		"⠦",
		"⠧",
		"⠇",
		"⠏"
	]),
	serverSeparator: " "
});
/** How the transcript element renders for `options`. */
function transcriptElement(options) {
	const region = options?.as === "region";
	return {
		tag: region ? "section" : "div",
		role: region ? void 0 : "group",
		tabIndex: options?.focusable === false ? void 0 : 0
	};
}
/** The text under a running tool call: `labels.working`, in the terminal layout only. */
function workingText(labels, layout, running) {
	return running && layout === "terminal" ? labels.working : void 0;
}
/** "query_sql" reads "Query sql" when the registry has no label for it. */
function humanize(name) {
	const spaced = name.replace(/[_-]+/g, " ").trim();
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
/** The chat header label for a tool, from the registry or its name. */
function toolLabel(tools, name, running) {
	const info = tools?.[name];
	const label = info?.label ?? humanize(name);
	return running ? info?.runningLabel ?? label : label;
}
/**
* What a tool call's header shows and its beat announces: the registry label in the chat layout,
* the raw `server name` in the terminal layout, which ignores the registry's labels.
*/
function toolName(tools, step, layout, running) {
	if (layout === "terminal") return `${step.server ? `${step.server} ` : ""}${step.name}`;
	return toolLabel(tools, step.name, running);
}
/** Whether the registry hides this tool's calls. */
function toolHidden(tools, name) {
	return tools?.[name]?.hidden === true;
}
/** The registry's hidden tool names, sorted, for `compile`'s `hiddenTools`. */
function hiddenToolNames(tools) {
	return Object.keys(tools ?? {}).filter((name) => toolHidden(tools, name)).sort();
}
/** The spinner frame at `elapsed` ms, or "" with no frames. */
function spinnerFrame(frames, elapsed) {
	return frames[Math.floor(elapsed / 80) % Math.max(1, frames.length)] ?? "";
}
/** The prompt in force before step `index`: the latest `prompt` step's text, else `fallback`. */
function promptFor(steps, index, fallback) {
	for (let i = index - 1; i >= 0; i--) {
		const step = steps[i];
		if (step?.kind === "prompt") return step.text;
	}
	return fallback;
}
/** What a screen reader hears when a beat finishes; empty while it still plays. */
function beatText(entry, config) {
	if (entry?.phase !== "done") return "";
	const { step } = entry;
	const { labels } = config;
	switch (step.kind) {
		case "user": return `${labels.you}: ${step.text}`;
		case "agent-text": return `${labels.agent}: ${step.lead ? `${step.lead} ` : ""}${step.text}`;
		case "command": return `${promptFor(config.steps, entry.index, config.glyphs.prompt)} ${step.text}`;
		case "output": return step.lines.map((l) => typeof l === "string" ? l : l.text).join(" ");
		case "tool-call": {
			if (toolHidden(config.tools, step.name)) return "";
			const status = entry.status === "error" ? labels.failed : labels.done;
			return `${toolName(config.tools, step, config.layout, false)}: ${status}`;
		}
		default: return "";
	}
}
/** The latest finished beat's announcement among `entries`, or "". */
function lastBeat(entries, config) {
	for (let i = entries.length - 1; i >= 0; i--) {
		const text = beatText(entries[i], config);
		if (text) return text;
	}
	return "";
}
/** A content signature, or undefined when the value can't be serialized (cycles, BigInt). */
function signature(value) {
	try {
		return JSON.stringify(value, (_key, v) => typeof v === "function" ? String(v) : v);
	} catch {
		return;
	}
}
/** How many of `times` are at or before `t`. */
const countAt = (times, t) => times.filter((time) => time <= t).length;
export { beatText, countAt, defaultGlyphs, defaultLabels, hiddenToolNames, humanize, lastBeat, promptFor, signature, spinnerFrame, toolHidden, toolLabel, toolName, transcriptElement, workingText };
