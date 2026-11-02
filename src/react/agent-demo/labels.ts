import type { ReactNode } from "react";
import type {
  ToolInfo as BaseToolInfo,
  ToolRegistry as BaseToolRegistry,
} from "../../agent-demo/core.ts";

export type { AgentDemoGlyphs, AgentDemoLabels } from "../../agent-demo/core.ts";
export { defaultGlyphs, defaultLabels, humanize, toolLabel } from "../../agent-demo/core.ts";

/** How one tool reads in the chat layout's card header. */
export type ToolInfo = BaseToolInfo<ReactNode>;

/** The consumer's tool registry, by tool `name`. */
export type ToolRegistry = BaseToolRegistry<ReactNode>;
