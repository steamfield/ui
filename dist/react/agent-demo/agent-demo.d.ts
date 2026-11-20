import { AgentDemoGlyphs, AgentDemoLabels, AgentDemoLayout, AgentDemoTranscript, AnnounceMode } from "../../agent-demo/core.js";
import { DemoScript } from "../../script/types.js";
import { DemoView } from "../../sequencer/view.js";
import { ToolRegistry } from "./labels.js";
import { ToolRenderer } from "./parts.js";
import { UseAgentDemoOptions, UseAgentDemoResult } from "./use-agent-demo.js";
import { CSSProperties, ReactElement, ReactNode } from "react";
/**
 * Which controls show once hydrated (never under reduced motion or a fixed `position`):
 * "inline" is the one play/pause/replay button, "full" adds turn jumps, Next and a 1x/2x speed
 * toggle, and a function renders your own from the hook's result.
 */
export type AgentDemoControlsProp<TData = unknown> = "inline" | "full" | "none" | ((demo: UseAgentDemoResult<TData>) => ReactNode);
export interface AgentDemoProps<TData = unknown> extends UseAgentDemoOptions<TData> {
  readonly script: DemoScript<TData>;
  /** Default "chat". */
  readonly layout?: AgentDemoLayout;
  /** Overrides for any of the default strings. */
  readonly labels?: Partial<AgentDemoLabels>;
  readonly glyphs?: Partial<AgentDemoGlyphs>;
  /** Shown at the start of the composer, before the typed text, such as an attach icon. */
  readonly composerStart?: ReactNode;
  /** Replaces `glyphs.submit` in the composer's submit key, such as an icon. */
  readonly submitIcon?: ReactNode;
  /** Labels, icons and accents per tool name, for the chat layout's card headers. */
  readonly tools?: ToolRegistry;
  /** Replaces a whole tool card. Return undefined, null or false to keep the default card. */
  readonly renderToolCall?: ToolRenderer<TData>;
  /** Renders a tool body (`custom` bodies, or any kind you want to override). */
  readonly renderToolBody?: ToolRenderer<TData>;
  /** Content beside the transcript that follows the view, such as a live chart. */
  readonly stage?: (view: DemoView<TData>) => ReactNode;
  /** Default "inline". */
  readonly controls?: AgentDemoControlsProp<TData>;
  /** Content at the top of the demo, before the controls. */
  readonly header?: ReactNode;
  /**
   * Wraps the transcript in `DemoWindow` chrome, with the controls in its title bar. `className`
   * goes on the window root, to size or shadow it.
   */
  readonly chrome?: boolean | {
    readonly title?: ReactNode;
    readonly dots?: boolean;
    readonly className?: string;
  };
  /**
   * Renders each built-in tool card as an open `<details>` with its header as the `<summary>`, so
   * a reader can hide a call's output. Default false.
   */
  readonly collapsible?: boolean;
  /** The transcript's landmark and tab stop. Default a focusable `role="group"`. */
  readonly transcript?: AgentDemoTranscript;
  /** Default "status". */
  readonly announce?: AnnounceMode;
  readonly className?: string;
  readonly style?: CSSProperties;
  /** Added to the root's class, for session-recording opt-outs such as "ph-no-capture". */
  readonly privacyClassName?: string;
}
/**
 * The default agent demo renderer: one set of parts (messages, tool cards, output, thinking,
 * composer, header, status and controls) in a "chat" or "terminal" layout. The server and
 * pre-hydration render are the final transcript; entrance and typing CSS only apply under
 * `[data-sf-animating]`, which is set once hydrated and playing.
 */
export declare function AgentDemo<TData = unknown>(props: AgentDemoProps<TData>): ReactElement;
export type { AnnounceMode };