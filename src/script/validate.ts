import { unknownOption } from "../internal/options.ts";
import { LibraryError } from "./errors.ts";
import type { DemoScript, StepKind } from "./types.ts";

export interface ValidateScriptOptions {
  /** The step kinds the caller can render. A step of any other kind is `unsupported_step`. */
  readonly kinds?: readonly StepKind[];
}

const STEP_KINDS: readonly StepKind[] = [
  "user",
  "agent-text",
  "thinking",
  "pause",
  "prompt",
  "command",
  "output",
  "tool-call",
];
const BODY_KINDS = ["lines", "code", "steps", "error", "custom"];
const TONES = ["default", "ok", "fail", "warn", "muted"];

type Record_ = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is Record_ =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const invalid = (field: string): LibraryError => new LibraryError("invalid_script", { field });

function requireString(value: Record_, key: string, field: string): void {
  if (typeof value[key] !== "string") throw invalid(`${field}.${key}`);
}

function optional(value: Record_, key: string, check: (v: unknown) => boolean, field: string) {
  if (value[key] !== undefined && !check(value[key])) throw invalid(`${field}.${key}`);
}

const isString = (v: unknown): boolean => typeof v === "string";
const isBoolean = (v: unknown): boolean => typeof v === "boolean";
const isCount = (v: unknown): boolean => Number.isInteger(v) && (v as number) >= 0;
const isMs = (v: unknown): boolean =>
  typeof v === "number" && Number.isFinite(v) && (v as number) >= 0;

function checkLines(value: unknown, field: string): void {
  if (!Array.isArray(value)) throw invalid(field);
  value.forEach((line: unknown, i) => {
    if (typeof line === "string") return;
    if (!isRecord(line) || typeof line.text !== "string") throw invalid(`${field}[${i}]`);
    if (line.tone !== undefined && !TONES.includes(line.tone as string)) {
      throw invalid(`${field}[${i}].tone`);
    }
  });
}

function checkStrings(value: unknown, field: string): void {
  if (!Array.isArray(value)) throw invalid(field);
  value.forEach((item: unknown, i) => {
    if (typeof item !== "string") throw invalid(`${field}[${i}]`);
  });
}

function checkBody(body: unknown, field: string): void {
  if (!isRecord(body)) throw invalid(field);
  if (!BODY_KINDS.includes(body.kind as string)) {
    throw new LibraryError("unsupported_step", { field: `${field}.kind` });
  }
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
    default:
      if (!("data" in body)) throw invalid(`${field}.data`);
  }
}

function checkUser(step: Record_, field: string): void {
  requireString(step, "text", field);
  optional(step, "composer", isBoolean, field);
  optional(step, "typingMs", isMs, field);
  const { preTyped, text } = step;
  if (
    preTyped !== undefined &&
    !(isString(preTyped) && (text as string).startsWith(preTyped as string))
  ) {
    throw invalid(`${field}.preTyped`);
  }
}

function checkToolCall(step: Record_, field: string): void {
  requireString(step, "name", field);
  for (const key of ["id", "server", "args", "status", "meta"])
    optional(step, key, isString, field);
  optional(step, "more", isCount, field);
  optional(step, "outputAt", isCount, field);
  if (step.output !== undefined) {
    checkLines(step.output, `${field}.output`);
  }
  if (step.body !== undefined) checkBody(step.body, `${field}.body`);
}

function checkStep(step: Record_, field: string): void {
  switch (step.kind as StepKind) {
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

function checkKinds(kinds: unknown): readonly StepKind[] {
  if (kinds === undefined) return STEP_KINDS;
  if (!Array.isArray(kinds) || !kinds.every((k) => STEP_KINDS.includes(k))) {
    throw new LibraryError("invalid_option", { field: "kinds" });
  }
  return kinds;
}

/**
 * Checks a script's shape at runtime, for scripts that arrive as JSON or from JavaScript. Throws
 * `LibraryError("invalid_script")` naming the first bad field (such as "steps[3].text"), or
 * `LibraryError("unsupported_step")` for a step or body kind the caller can't render.
 */
export function validateScript(
  script: unknown,
  options: ValidateScriptOptions = {},
): asserts script is DemoScript {
  const badOption = unknownOption(options, ["kinds"]);
  if (badOption) throw new LibraryError("invalid_option", { field: badOption });
  const kinds = checkKinds(options.kinds);
  if (!isRecord(script)) throw invalid("script");
  optional(script, "id", isString, "script");
  if (!Array.isArray(script.steps)) throw invalid("steps");
  const ids = new Set<string>();
  script.steps.forEach((step: unknown, i) => {
    const field = `steps[${i}]`;
    if (!isRecord(step)) throw invalid(field);
    if (typeof step.kind !== "string") throw invalid(`${field}.kind`);
    if (!kinds.includes(step.kind as StepKind)) {
      throw new LibraryError("unsupported_step", { field: `${field}.kind` });
    }
    optional(step, "at", isCount, field);
    checkStep(step, field);
    if (typeof step.id === "string") {
      if (ids.has(step.id)) throw invalid(`${field}.id`);
      ids.add(step.id);
    }
  });
}
