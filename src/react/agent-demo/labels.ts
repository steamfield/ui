import type { ReactNode } from "react";

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
});

/** How one tool reads in the chat layout's card header. */
export interface ToolInfo {
  /** Past-tense label once the call has landed, such as "Ran query". */
  readonly label?: string;
  /** Label while it runs, such as "Running query". Falls back to `label`. */
  readonly runningLabel?: string;
  /** Shown in the header's icon tile. */
  readonly icon?: ReactNode;
  /** Any CSS color; sets `--sf-tool-accent` on the card. */
  readonly accent?: string;
}

/** The consumer's tool registry, by tool `name`. */
export type ToolRegistry = Readonly<Record<string, ToolInfo>>;

/** "query_sql" reads "Query sql" when the registry has no label for it. */
export function humanize(name: string): string {
  const spaced = name.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** The header label for a tool, from the registry or its name. */
export function toolLabel(tools: ToolRegistry | undefined, name: string, running: boolean): string {
  const info = tools?.[name];
  const label = info?.label ?? humanize(name);
  return running ? (info?.runningLabel ?? label) : label;
}
