// The framework-free half of the agent demo renderers: default strings and glyphs, the tool
// registry shape, and the text helpers both the React and the Vue parts render from. The
// agent-demo area has no entry (only styles.css is exported), so nothing imports this module but
// the two bindings, and neither re-exports it directly; each names the public types from its own
// files.
import type { Step } from "../script/types.ts";
import type { ToolCallStep } from "../sequencer/timing.ts";
import type { DemoEntry } from "../sequencer/view.ts";

/** Every string the demo shows or announces. Each one has a neutral default. */
export interface AgentDemoLabels {
  /** The play button while not started or paused. Default "Play". */
  readonly play: string;
  /** The play button while playing. Default "Pause". */
  readonly pause: string;
  /** The play button once complete. Default "Replay". */
  readonly replay: string;
  /** The status message once playback has reached the end. Default "Demo complete." */
  readonly completeStatus: string;
  /** The status message before then, and under reduced motion. Default "Example agent session." */
  readonly idleStatus: string;
  /** Screen-reader prefix for user messages. Default "You". */
  readonly you: string;
  /** Screen-reader prefix for agent messages. Default "Agent". */
  readonly agent: string;
  /** Accessible name of a running tool's spinner. Default "Running". */
  readonly running: string;
  /** Accessible name of a finished tool's status. Default "Completed". */
  readonly done: string;
  /** Accessible name of a failed tool's status. Default "Failed". */
  readonly failed: string;
  /** Accessible name of the thinking dots. Default "Agent thinking". */
  readonly thinking: string;
  /** The empty composer. Default "Message the agent…". */
  readonly placeholder: string;
  /** The Next button. Default "Next". */
  readonly next: string;
  /** Prefix of the speed toggle's accessible name ("Playback speed 1x"). Default "Playback speed". */
  readonly speed: string;
  /** Name of the turn-jump group. Default "Jump to turn". */
  readonly jumpToTurn: string;
  /** Accessible name of the transcript region. Default "Demo transcript". */
  readonly transcript: string;
  /** Summary of a collapsed code body. Default "Show code". */
  readonly showCode: string;
  /** The count of left-out lines. Default `… +N lines`. */
  readonly more: (count: number) => string;
}

export const defaultLabels: AgentDemoLabels = Object.freeze({
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
  more: (count: number) => `… +${count} lines`,
});

/** The decorative glyphs. All are hidden from assistive tech. */
export interface AgentDemoGlyphs {
  /** Before a command when no `prompt` step set one. Default "$". */
  readonly prompt: string;
  /** Before a user message in the terminal layout and the composer. Default "❯". */
  readonly user: string;
  /** Before agent text, and a finished tool call, in the terminal layout. Default "●". */
  readonly agent: string;
  /** Before a tool call's output in the terminal layout. Default "⎿". */
  readonly output: string;
  /** A finished tool's status pip in the chat layout. Default "✓". */
  readonly ok: string;
  /** A failed tool's status pip in the chat layout. Default "✕". */
  readonly fail: string;
  /** The composer's submit key. Default "↵". */
  readonly submit: string;
  /** Spinner frames for a running tool in the terminal layout, one per 80ms of demo time. */
  readonly spinner: readonly string[];
  /**
   * Between a tool's `server` and `name` in the terminal layout's header. Default " ". Unlike the
   * other glyphs it is plain text, so a screen reader doesn't run the two words together.
   */
  readonly serverSeparator: string;
}

export const defaultGlyphs: AgentDemoGlyphs = Object.freeze({
  prompt: "$",
  user: "❯",
  agent: "●",
  output: "⎿",
  ok: "✓",
  fail: "✕",
  submit: "↵",
  spinner: Object.freeze(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]),
  serverSeparator: " ",
});

/** How one tool reads in the chat layout's card header. `TIcon` is the framework's node type. */
export interface ToolInfo<TIcon = unknown> {
  /** Past-tense label once the call has landed, such as "Ran query". */
  readonly label?: string;
  /** Label while it runs, such as "Running query". Falls back to `label`. */
  readonly runningLabel?: string;
  /** Shown in the header's icon tile. */
  readonly icon?: TIcon;
  /** Any CSS color; sets `--sf-tool-accent` on the card. */
  readonly accent?: string;
  /** Leaves the tool's calls out of the transcript and the announcements, in both layouts. */
  readonly hidden?: boolean;
}

/** The consumer's tool registry, by tool `name`. */
export type ToolRegistry<TIcon = unknown> = Readonly<Record<string, ToolInfo<TIcon>>>;

/** The two looks over one set of parts. */
export type AgentDemoLayout = "chat" | "terminal";

/** What the screen reader hears: one status message, that plus each finished beat, or nothing. */
export type AnnounceMode = "status" | "beats" | "none";

/** "query_sql" reads "Query sql" when the registry has no label for it. */
export function humanize(name: string): string {
  const spaced = name.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** The chat header label for a tool, from the registry or its name. */
export function toolLabel(tools: ToolRegistry | undefined, name: string, running: boolean): string {
  const info = tools?.[name];
  const label = info?.label ?? humanize(name);
  return running ? (info?.runningLabel ?? label) : label;
}

/** The fields of a tool-call step that name it. */
export type ToolNameStep = Pick<ToolCallStep, "name" | "server">;

/**
 * What a tool call's header shows and its beat announces: the registry label in the chat layout,
 * the raw `server name` in the terminal layout, which ignores the registry's labels.
 */
export function toolName(
  tools: ToolRegistry | undefined,
  step: ToolNameStep,
  layout: AgentDemoLayout,
  running: boolean,
): string {
  if (layout === "terminal") return `${step.server ? `${step.server} ` : ""}${step.name}`;
  return toolLabel(tools, step.name, running);
}

/** Whether the registry hides this tool's calls. */
export function toolHidden(tools: ToolRegistry | undefined, name: string): boolean {
  return tools?.[name]?.hidden === true;
}

/** The registry's hidden tool names, sorted, for `compile`'s `hiddenTools`. */
export function hiddenToolNames(tools: ToolRegistry | undefined): string[] {
  return Object.keys(tools ?? {})
    .filter((name) => toolHidden(tools, name))
    .sort();
}

/** Demo time per spinner frame. */
export const SPINNER_FRAME_MS = 80;

/** The spinner frame at `elapsed` ms, or "" with no frames. */
export function spinnerFrame(frames: readonly string[], elapsed: number): string {
  return frames[Math.floor(elapsed / SPINNER_FRAME_MS) % Math.max(1, frames.length)] ?? "";
}

/** The prompt in force before step `index`: the latest `prompt` step's text, else `fallback`. */
export function promptFor(steps: readonly Step[], index: number, fallback: string): string {
  for (let i = index - 1; i >= 0; i--) {
    const step = steps[i];
    if (step?.kind === "prompt") return step.text;
  }
  return fallback;
}

/** What `beatText` needs from a renderer's config. */
export interface BeatConfig {
  readonly layout: AgentDemoLayout;
  readonly labels: AgentDemoLabels;
  readonly glyphs: AgentDemoGlyphs;
  readonly tools: ToolRegistry | undefined;
  readonly steps: readonly Step[];
}

/** What a screen reader hears when a beat finishes; empty while it still plays. */
export function beatText(entry: DemoEntry | undefined, config: BeatConfig): string {
  if (entry?.phase !== "done") return "";
  const { step } = entry;
  const { labels } = config;
  switch (step.kind) {
    case "user":
      return `${labels.you}: ${step.text}`;
    case "agent-text":
      return `${labels.agent}: ${step.lead ? `${step.lead} ` : ""}${step.text}`;
    case "command":
      return `${promptFor(config.steps, entry.index, config.glyphs.prompt)} ${step.text}`;
    case "output":
      return step.lines.map((l) => (typeof l === "string" ? l : l.text)).join(" ");
    case "tool-call": {
      if (toolHidden(config.tools, step.name)) return "";
      const status = entry.status === "error" ? labels.failed : labels.done;
      return `${toolName(config.tools, step, config.layout, false)}: ${status}`;
    }
    default:
      return "";
  }
}

/** The latest finished beat's announcement among `entries`, or "". */
export function lastBeat(entries: readonly DemoEntry[], config: BeatConfig): string {
  for (let i = entries.length - 1; i >= 0; i--) {
    const text = beatText(entries[i], config);
    if (text) return text;
  }
  return "";
}

/** A content signature, or undefined when the value can't be serialized (cycles, BigInt). */
export function signature(value: unknown): string | undefined {
  try {
    return JSON.stringify(value, (_key, v: unknown) => (typeof v === "function" ? String(v) : v));
  } catch {
    return undefined;
  }
}

/** How many of `times` are at or before `t`. */
export const countAt = (times: readonly number[], t: number): number =>
  times.filter((time) => time <= t).length;
