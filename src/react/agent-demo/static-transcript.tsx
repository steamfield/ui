import type { CSSProperties, ReactElement } from "react";
import type { DemoScript } from "../../script/types.ts";
import { compile } from "../../sequencer/compile.ts";
import { type FinalPolicy, finalState } from "../../sequencer/view.ts";
import {
  type AgentDemoGlyphs,
  type AgentDemoLabels,
  defaultGlyphs,
  defaultLabels,
  type ToolRegistry,
} from "./labels.ts";
import { type AgentDemoLayout, type ToolRenderer, Transcript } from "./parts.tsx";

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
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly privacyClassName?: string;
}

/**
 * The finished transcript with no playback, controls or composer, in the same parts and CSS as
 * `AgentDemo`. It reads no browser state, so it renders on the server: place it outside an Astro
 * `client:only` island as the no-JS fallback.
 */
export function StaticTranscript<TData = unknown>({
  script,
  layout = "chat",
  finalPolicy = "all",
  tools,
  renderToolCall,
  renderToolBody,
  className,
  style,
  privacyClassName,
  ...props
}: StaticTranscriptProps<TData>): ReactElement {
  const timeline = compile(script);
  const view = finalState(timeline, { policy: finalPolicy });
  const labels: AgentDemoLabels = { ...defaultLabels, ...props.labels };
  const glyphs: AgentDemoGlyphs = { ...defaultGlyphs, ...props.glyphs };
  return (
    <div
      data-sf-agent-demo=""
      data-part="agent-demo"
      data-layout={layout}
      data-static=""
      className={[className, privacyClassName].filter(Boolean).join(" ") || undefined}
      style={style}
    >
      <Transcript
        view={view}
        config={{
          layout,
          labels,
          glyphs,
          tools,
          renderToolCall,
          renderToolBody,
          mode: "static",
          steps: script.steps,
        }}
      />
    </div>
  );
}
