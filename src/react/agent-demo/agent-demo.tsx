import type { CSSProperties, ReactElement, ReactNode } from "react";
import { type AnnounceMode, lastBeat as lastBeatOf } from "../../agent-demo/core.ts";
import type { DemoScript } from "../../script/types.ts";
import type { DemoView } from "../../sequencer/view.ts";
import { DemoWindow } from "../window/demo-window.tsx";
import {
  type AgentDemoGlyphs,
  type AgentDemoLabels,
  defaultGlyphs,
  defaultLabels,
  type ToolRegistry,
} from "./labels.ts";
import {
  type AgentDemoLayout,
  Composer,
  type PartsConfig,
  srOnly,
  type ToolRenderer,
  Transcript,
} from "./parts.tsx";
import {
  type UseAgentDemoOptions,
  type UseAgentDemoResult,
  useAgentDemo,
} from "./use-agent-demo.ts";

export type { AnnounceMode } from "../../agent-demo/core.ts";

/**
 * Which controls show once hydrated (never under reduced motion or a fixed `position`):
 * "inline" is the one play/pause/replay button, "full" adds turn jumps, Next and a 1x/2x speed
 * toggle, and a function renders your own from the hook's result.
 */
export type AgentDemoControlsProp<TData = unknown> =
  | "inline"
  | "full"
  | "none"
  | ((demo: UseAgentDemoResult<TData>) => ReactNode);

export interface AgentDemoProps<TData = unknown> extends UseAgentDemoOptions<TData> {
  readonly script: DemoScript<TData>;
  /** Default "chat". */
  readonly layout?: AgentDemoLayout;
  /** Overrides for any of the default strings. */
  readonly labels?: Partial<AgentDemoLabels>;
  readonly glyphs?: Partial<AgentDemoGlyphs>;
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
  /** Wraps the transcript in `DemoWindow` chrome, with the controls in its title bar. */
  readonly chrome?: boolean | { readonly title?: ReactNode; readonly dots?: boolean };
  /** Default "status". */
  readonly announce?: AnnounceMode;
  readonly className?: string;
  readonly style?: CSSProperties;
  /** Added to the root's class, for session-recording opt-outs such as "ph-no-capture". */
  readonly privacyClassName?: string;
}

function PlaybackControls<TData>({
  demo,
  labels,
  full,
}: {
  readonly demo: UseAgentDemoResult<TData>;
  readonly labels: AgentDemoLabels;
  readonly full: boolean;
}): ReactElement {
  const { controls, complete, started, paused, animating, timeline, speed, turn } = demo;
  const elapsed = animating ? demo.view.elapsed : 0;
  // At the end without having played there (motion came back after reduced motion) still replays.
  const atEnd = complete || (animating && demo.view.complete);
  let label = labels.pause;
  if (atEnd) label = labels.replay;
  else if (!started || paused) label = labels.play;
  const { turnStarts, duration } = timeline;
  const turns = full && turnStarts.length > 1;
  const next = (): void => {
    const target = turnStarts.find((start) => start > elapsed) ?? duration;
    controls.seek(target);
    if (target < duration) controls.play();
  };
  return (
    <div data-part="controls">
      {turns ? (
        <fieldset data-part="turn-jumps">
          <legend style={srOnly}>{labels.jumpToTurn}</legend>
          {turnStarts.map((start, i) => (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: turns are fixed for a timeline
              key={i}
              type="button"
              data-part="control"
              data-control="turn"
              aria-current={turn === i ? "step" : undefined}
              onClick={() => {
                controls.seek(start);
                controls.play();
              }}
            >
              {i + 1}
            </button>
          ))}
        </fieldset>
      ) : null}
      <button
        type="button"
        data-part="control"
        data-control="play"
        onClick={atEnd ? controls.replay : controls.toggle}
      >
        {label}
      </button>
      {turns ? (
        <button
          type="button"
          data-part="control"
          data-control="next"
          disabled={atEnd}
          onClick={next}
        >
          {labels.next}
        </button>
      ) : null}
      {full ? (
        <button
          type="button"
          data-part="control"
          data-control="speed"
          aria-label={`${labels.speed} ${speed}x`}
          onClick={() => controls.setSpeed(speed === 1 ? 2 : 1)}
        >
          {speed}x
        </button>
      ) : null}
    </div>
  );
}

function lastBeat<TData>(demo: UseAgentDemoResult<TData>, config: PartsConfig<TData>): string {
  if (!demo.animating) return "";
  return lastBeatOf(demo.view.entries, config);
}

function controlsFor<TData>(
  props: AgentDemoProps<TData>,
  demo: UseAgentDemoResult<TData>,
  labels: AgentDemoLabels,
): ReactNode {
  const { controls = "inline" } = props;
  if (!demo.ready || demo.reduced || props.position !== undefined || controls === "none") {
    return null;
  }
  if (typeof controls === "function") return controls(demo);
  return <PlaybackControls demo={demo} labels={labels} full={controls === "full"} />;
}

function Frame({
  chrome,
  header,
  controls,
  children,
}: {
  readonly chrome: AgentDemoProps["chrome"];
  readonly header: ReactNode;
  readonly controls: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  if (chrome) {
    const { title, dots } = typeof chrome === "object" ? chrome : {};
    return (
      <DemoWindow
        {...(title === undefined ? {} : { title })}
        {...(dots === undefined ? {} : { dots })}
        controls={controls}
      >
        {header !== undefined ? <div data-part="header">{header}</div> : null}
        {children}
      </DemoWindow>
    );
  }
  return (
    <>
      {header !== undefined || controls ? (
        <div data-part="header">
          {header}
          {controls}
        </div>
      ) : null}
      {children}
    </>
  );
}

/**
 * The default agent demo renderer: one set of parts (messages, tool cards, output, thinking,
 * composer, header, status and controls) in a "chat" or "terminal" layout. The server and
 * pre-hydration render are the final transcript; entrance and typing CSS only apply under
 * `[data-sf-animating]`, which is set once hydrated and playing.
 */
export function AgentDemo<TData = unknown>(props: AgentDemoProps<TData>): ReactElement {
  const { layout = "chat", stage, announce = "status", className, privacyClassName } = props;
  const composer = props.composer ?? layout === "chat";
  const demo = useAgentDemo(props.script, { ...props, composer });
  const labels: AgentDemoLabels = { ...defaultLabels, ...props.labels };
  const glyphs: AgentDemoGlyphs = { ...defaultGlyphs, ...props.glyphs };
  const config: PartsConfig<TData> = {
    layout,
    labels,
    glyphs,
    tools: props.tools,
    renderToolCall: props.renderToolCall,
    renderToolBody: props.renderToolBody,
    mode: demo.mode,
    steps: demo.timeline.script.steps,
  };
  const { view } = demo;

  return (
    <div
      ref={demo.ref}
      data-sf-agent-demo=""
      data-part="agent-demo"
      data-layout={layout}
      data-sf-animating={demo.animating ? "" : undefined}
      data-paused={demo.animating && !demo.playing ? "" : undefined}
      data-complete={demo.complete ? "" : undefined}
      className={[className, privacyClassName].filter(Boolean).join(" ") || undefined}
      style={props.style}
    >
      <Frame
        chrome={props.chrome}
        header={props.header}
        controls={controlsFor(props, demo, labels)}
      >
        <Transcript view={view} config={config} />
        {view.composer ? (
          <Composer
            text={view.composer.text}
            flash={view.composer.flash}
            layout={layout}
            labels={labels}
            glyphs={glyphs}
          />
        ) : null}
      </Frame>
      {stage ? <div data-part="stage">{stage(view)}</div> : null}
      {announce === "none" ? null : (
        <p data-part="status" role="status" style={srOnly}>
          {demo.complete ? labels.completeStatus : labels.idleStatus}
        </p>
      )}
      {announce === "beats" ? (
        <div data-part="beats" aria-live="polite" style={srOnly}>
          {lastBeat(demo, config)}
        </div>
      ) : null}
    </div>
  );
}
