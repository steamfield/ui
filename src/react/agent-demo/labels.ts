import type { ReactNode } from "react";
import type {
  ToolInfo as BaseToolInfo,
  ToolRegistry as BaseToolRegistry,
} from "../../internal/agent-demo.ts";

export type { AgentDemoGlyphs, AgentDemoLabels } from "../../internal/agent-demo.ts";
export { defaultGlyphs, defaultLabels, humanize, toolLabel } from "../../internal/agent-demo.ts";

/** How one tool reads in the chat layout's card header. */
export type ToolInfo = BaseToolInfo<ReactNode>;

/** The consumer's tool registry, by tool `name`. */
export type ToolRegistry = BaseToolRegistry<ReactNode>;
