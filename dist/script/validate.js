import { unknownOption } from "../internal/options.js";
import { LibraryError } from "../internal/errors.js";
// src/script/validate.ts
const STEP_KINDS = [
	"user",
	"agent-text",
	"thinking",
	"pause",
	"prompt",
	"command",
	"output",
	"tool-call"
];
const BODY_KINDS = [
	"lines",
	"code",
	"steps",
	"error",
	"custom"
];
const TONES = [
	"default",
	"ok",
	"fail",
	"warn",
	"muted"
];
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const invalid = (field) => new LibraryError("invalid_script", { field });
function requireString(value, key, field) {
	if (typeof value[key] !== "string") throw invalid(`${field}.${key}`);
}
function optional(value, key, check, field) {
	if (value[key] !== void 0 && !check(value[key])) throw invalid(`${field}.${key}`);
}
const isString = (v) => typeof v === "string";
const isBoolean = (v) => typeof v === "boolean";
const isCount = (v) => Number.isInteger(v) && v >= 0;
const isMs = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;
function checkLines(value, field) {
	if (!Array.isArray(value)) throw invalid(field);
	value.forEach((line, i) => {
		if (typeof line === "string") return;
		if (!isRecord(line) || typeof line.text !== "string") throw invalid(`${field}[${i}]`);
		if (line.tone !== void 0 && !TONES.includes(line.tone)) throw invalid(`${field}[${i}].tone`);
	});
}
function checkStrings(value, field) {
	if (!Array.isArray(value)) throw invalid(field);
	value.forEach((item, i) => {
		if (typeof item !== "string") throw invalid(`${field}[${i}]`);
	});
}
function checkBody(body, field) {
	if (!isRecord(body)) throw invalid(field);
	if (!BODY_KINDS.includes(body.kind)) throw new LibraryError("unsupported_step", { field: `${field}.kind` });
	optional(body, "at", isCount, field);
	switch (body.kind) {
		case "lines":
			checkLines(body.lines, `${field}.lines`);
			optional(body, "more", isCount, field);
			return;
		case "code":
			requireString(body, "code", field);
			optional(body, "lang", isString, field);
			optional(body, "collapsed", isBoolean, field);
			return;
		case "steps":
			checkStrings(body.steps, `${field}.steps`);
			return;
		case "error":
			requireString(body, "summary", field);
			return;
		default: if (!("data" in body)) throw invalid(`${field}.data`);
	}
}
function checkUser(step, field) {
	requireString(step, "text", field);
	optional(step, "composer", isBoolean, field);
	optional(step, "typingMs", isMs, field);
	const { preTyped, text } = step;
	if (preTyped !== void 0 && !(isString(preTyped) && text.startsWith(preTyped))) throw invalid(`${field}.preTyped`);
}
function checkToolCall(step, field) {
	requireString(step, "name", field);
	for (const key of [
		"id",
		"server",
		"args",
		"status",
		"meta"
	]) optional(step, key, isString, field);
	optional(step, "more", isCount, field);
	optional(step, "outputAt", isCount, field);
	if (step.output !== void 0) checkLines(step.output, `${field}.output`);
	if (step.body !== void 0) checkBody(step.body, `${field}.body`);
}
function checkStep(step, field) {
	switch (step.kind) {
		case "user":
			checkUser(step, field);
			return;
		case "agent-text":
			requireString(step, "text", field);
			optional(step, "lead", isString, field);
			return;
		case "thinking":
			optional(step, "ms", isMs, field);
			return;
		case "pause":
			if (!isMs(step.ms)) throw invalid(`${field}.ms`);
			return;
		case "prompt":
			requireString(step, "text", field);
			return;
		case "command":
			requireString(step, "text", field);
			optional(step, "typingMs", isMs, field);
			return;
		case "output":
			checkLines(step.lines, `${field}.lines`);
			optional(step, "more", isCount, field);
			return;
		case "tool-call":
			checkToolCall(step, field);
			return;
	}
}
function checkKinds(kinds) {
	if (kinds === void 0) return STEP_KINDS;
	if (!Array.isArray(kinds) || !kinds.every((k) => STEP_KINDS.includes(k))) throw new LibraryError("invalid_option", { field: "kinds" });
	return kinds;
}
/**
* Checks a script's shape at runtime, for scripts that arrive as JSON or from JavaScript. Throws
* `LibraryError("invalid_script")` naming the first bad field (such as "steps[3].text"), or
* `LibraryError("unsupported_step")` for a step or body kind the caller can't render.
*/
function validateScript(script, options = {}) {
	const badOption = unknownOption(options, ["kinds"]);
	if (badOption) throw new LibraryError("invalid_option", { field: badOption });
	const kinds = checkKinds(options.kinds);
	if (!isRecord(script)) throw invalid("script");
	optional(script, "id", isString, "script");
	if (!Array.isArray(script.steps)) throw invalid("steps");
	const ids = /* @__PURE__ */ new Set();
	script.steps.forEach((step, i) => {
		const field = `steps[${i}]`;
		if (!isRecord(step)) throw invalid(field);
		if (typeof step.kind !== "string") throw invalid(`${field}.kind`);
		if (!kinds.includes(step.kind)) throw new LibraryError("unsupported_step", { field: `${field}.kind` });
		optional(step, "at", isCount, field);
		checkStep(step, field);
		if (typeof step.id === "string") {
			if (ids.has(step.id)) throw invalid(`${field}.id`);
			ids.add(step.id);
		}
	});
}
export { validateScript };
