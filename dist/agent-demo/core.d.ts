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
  /**
   * Shown under a running tool call in the terminal layout, behind the output glyph, such as
   * "Running…". No default: unset, a running call shows nothing under its header.
   */
  readonly working?: string;
}
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
/**
 * The transcript's element. `as: "group"` (the default) is a `div` with `role="group"`, which isn't
 * a landmark, so two demos on a page don't repeat one; `"region"` is a `<section>` landmark.
 * Either carries the `transcript` label. `focusable` (default true) puts the scroller in the tab
 * order, so keyboard users can scroll it.
 */
export interface AgentDemoTranscript {
  readonly as?: "group" | "region";
  readonly focusable?: boolean;
}
/** What the screen reader hears: one status message, that plus each finished beat, or nothing. */
export type AnnounceMode = "status" | "beats" | "none";