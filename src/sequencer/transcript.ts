import type { DemoScript, Line, Step, ToolBody } from "../script/types.ts";
import { validateScript } from "../script/validate.ts";

const lineText = (line: Line): string => (typeof line === "string" ? line : line.text);
const moreLine = (more: number | undefined, indent: string): string[] =>
  more === undefined ? [] : [`${indent}… +${more} lines`];

function bodyText(body: ToolBody<unknown>): string[] {
  switch (body.kind) {
    case "lines":
      return [...body.lines.map((l) => `  ${lineText(l)}`), ...moreLine(body.more, "  ")];
    case "code":
      return body.code.split("\n").map((l) => `  ${l}`);
    case "steps":
      return body.steps.map((s) => `  - ${s}`);
    case "error":
      return [`  ${body.summary}`];
    default:
      return [];
  }
}

function toolText(step: Extract<Step<unknown>, { kind: "tool-call" }>): string[] {
  let head = `${step.server ? `${step.server} ` : ""}${step.name}(${step.args ?? ""})`;
  if (step.meta) head += ` · ${step.meta}`;
  if (step.status && step.status !== "done") head += ` [${step.status}]`;
  return [
    head,
    ...(step.output ?? []).map((l) => `  ${lineText(l)}`),
    ...moreLine(step.more, "  "),
    ...(step.body ? bodyText(step.body) : []),
  ];
}

/**
 * The finished script as plain text, for `<noscript>`, screen-reader summaries and llms.txt.
 * User messages start with "> ", commands with their prompt (or "$"), tool calls read
 * `name(args)` with their output indented, and a `more` count reads "… +N lines". A blank line
 * separates turns. Thinking, pauses and custom bodies have no text.
 */
export function transcriptText(script: DemoScript<unknown>): string {
  validateScript(script);
  const out: string[] = [];
  let prompt: string | undefined;
  for (const step of script.steps) {
    if (step.kind === "prompt") {
      prompt = step.text;
      continue;
    }
    if (step.kind === "user" && out.length > 0) out.push("");
    out.push(...stepText(step, prompt));
  }
  return out.join("\n");
}

function stepText(step: Step<unknown>, prompt: string | undefined): string[] {
  switch (step.kind) {
    case "user":
      return [`> ${step.text}`];
    case "agent-text":
      return [step.lead ? `${step.lead} ${step.text}` : step.text];
    case "command":
      return [`${prompt ?? "$"} ${step.text}`];
    case "output":
      return [...step.lines.map(lineText), ...moreLine(step.more, "")];
    case "tool-call":
      return toolText(step);
    default:
      return [];
  }
}
