import { AgentDemoGlyphs, AgentDemoLabels, AgentDemoLayout, AgentDemoTranscript, AnnounceMode, ToolInfo as ToolInfo$1, ToolRegistry as ToolRegistry$1 } from "../../agent-demo/core.js";
import { ToolCallStep } from "../../sequencer/timing.js";
import { DemoEntry } from "../../sequencer/view.js";
import { Component, DefineSetupFnComponent, VNode } from "vue";
/** A registry icon: text, a vnode, or a component rendered with no props. */
export type ToolIcon = string | VNode | Component;
/** How one tool reads in the chat layout's card header. */
export type ToolInfo = ToolInfo$1<ToolIcon>;
/** The consumer's tool registry, by tool `name`. */
export type ToolRegistry = ToolRegistry$1<ToolIcon>;
/** What the `toolCall` and `toolBody` slots receive. */
export interface ToolCallContext<TData = unknown> {
  readonly step: ToolCallStep<TData>;
  readonly entry: DemoEntry<TData>;
  /** The step's index in the script. */
  readonly index: number;
  /** The call is still running, or its body hasn't revealed yet. */
  readonly loading: boolean;
  /**
   * "static" on the server, before mount and in `StaticTranscript`; "live" once mounted. Render
   * something server-safe (an image, a placeholder) for "static".
   */
  readonly mode: "static" | "live";
}
/**
 * A slot over a tool call. Rendering nothing (or only comments) keeps the built-in rendering; to
 * leave a tool's calls out, set `hidden` in the tool registry.
 */
export type ToolSlot<TData = unknown> = (ctx: ToolCallContext<TData>) => VNode[];
export type { AgentDemoGlyphs, AgentDemoLabels, AgentDemoLayout, AgentDemoTranscript, AnnounceMode };