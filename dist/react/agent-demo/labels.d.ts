import { AgentDemoGlyphs, AgentDemoLabels, ToolInfo as ToolInfo$1, ToolRegistry as ToolRegistry$1 } from "../../agent-demo/core.js";
import { ReactNode } from "react";
/** How one tool reads in the chat layout's card header. */
export type ToolInfo = ToolInfo$1<ReactNode>;
/** The consumer's tool registry, by tool `name`. */
export type ToolRegistry = ToolRegistry$1<ReactNode>;
export type { AgentDemoGlyphs, AgentDemoLabels };