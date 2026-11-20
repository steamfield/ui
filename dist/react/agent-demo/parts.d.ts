import { ToolCallStep } from "../../sequencer/timing.js";
import { DemoEntry } from "../../sequencer/view.js";
import { AgentDemoLayout, AgentDemoTranscript } from "../../agent-demo/core.js";
import "./labels.js";
import { CSSProperties, ReactElement, ReactNode } from "react";
/** What `renderToolCall` and `renderToolBody` receive. */
export interface ToolCallContext<TData = unknown> {
  readonly step: ToolCallStep<TData>;
  readonly entry: DemoEntry<TData>;
  /** The step's index in the script. */
  readonly index: number;
  /** The call is still running, or its body hasn't revealed yet. */
  readonly loading: boolean;
  /**
   * "static" on the server, before hydration and in `StaticTranscript`; "live" once hydrated.
   * Render something server-safe (an image, a placeholder) for "static".
   */
  readonly mode: "static" | "live";
}
/**
 * Replaces a whole tool card, or a tool card's body. Return `undefined`, `null` or `false` to fall
 * back to the built-in rendering; to leave a tool's calls out, set `hidden` in the tool registry.
 */
export type ToolRenderer<TData = unknown> = (ctx: ToolCallContext<TData>) => ReactNode | undefined;
export type { AgentDemoLayout, AgentDemoTranscript };