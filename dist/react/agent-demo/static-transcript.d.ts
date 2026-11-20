import { DemoScript } from "../../script/types.js";
import { FinalPolicy } from "../../sequencer/view.js";
import { AgentDemoGlyphs, AgentDemoLabels, AgentDemoLayout, AgentDemoTranscript } from "../../agent-demo/core.js";
import { ToolRegistry } from "./labels.js";
import { ToolRenderer } from "./parts.js";
import { CSSProperties, ReactElement } from "react";
export interface StaticTranscriptProps<TData = unknown> {
  readonly script: DemoScript<TData>;
  /** Default "chat". */
  readonly layout?: AgentDemoLayout;
  /** Default "all". */
  readonly finalPolicy?: FinalPolicy;
  readonly labels?: Partial<AgentDemoLabels>;
  readonly glyphs?: Partial<AgentDemoGlyphs>;
  readonly tools?: ToolRegistry;
  /** Called with `mode: "static"`. */
  readonly renderToolCall?: ToolRenderer<TData>;
  /** Called with `mode: "static"`. */
  readonly renderToolBody?: ToolRenderer<TData>;
  /** As `AgentDemo`'s: each built-in tool card is an open `<details>`. Default false. */
  readonly collapsible?: boolean;
  /** As `AgentDemo`'s. Default a focusable `role="group"`. */
  readonly transcript?: AgentDemoTranscript;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly privacyClassName?: string;
}
/**
 * The finished transcript with no playback, controls or composer, in the same parts and CSS as
 * `AgentDemo`. It reads no browser state, so it renders on the server: place it outside an Astro
 * `client:only` island as the no-JS fallback.
 */
export declare function StaticTranscript<TData = unknown>({ script, layout, finalPolicy, tools, renderToolCall, renderToolBody, collapsible, transcript, className, style, privacyClassName, ...props }: StaticTranscriptProps<TData>): ReactElement;