import {
  type CSSProperties,
  Fragment,
  type ReactElement,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  type AgentDemoLayout,
  type AgentDemoTranscript,
  promptFor,
  spinnerFrame,
  toolHidden,
  toolName,
  transcriptElement,
  workingText,
} from "../../agent-demo/core.ts";
import type { Line, Step, ToolBody } from "../../script/types.ts";
import type { ToolCallStep } from "../../sequencer/timing.ts";
import type { DemoEntry, DemoView } from "../../sequencer/view.ts";
import type { AgentDemoGlyphs, AgentDemoLabels, ToolRegistry } from "./labels.ts";

export type { AgentDemoLayout, AgentDemoTranscript } from "../../agent-demo/core.ts";

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

/** `undefined`, `null` and `false` from a `ToolRenderer` all mean "use the built-in rendering". */
const fallsBack = (node: ReactNode | undefined): boolean => node == null || node === false;

/** Everything the parts need besides the view. */
export interface PartsConfig<TData> {
  readonly layout: AgentDemoLayout;
  readonly labels: AgentDemoLabels;
  readonly glyphs: AgentDemoGlyphs;
  readonly tools: ToolRegistry | undefined;
  readonly renderToolCall: ToolRenderer<TData> | undefined;
  readonly renderToolBody: ToolRenderer<TData> | undefined;
  readonly mode: "static" | "live";
  readonly steps: readonly Step<TData>[];
  /** Each built-in tool card is an open `<details>` with the header as its `<summary>`. */
  readonly collapsible: boolean;
  readonly transcript: AgentDemoTranscript | undefined;
}

/** Visually hidden, still read. Inline so it holds without the stylesheet. */
export const srOnly: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  border: 0,
};

const Caret = (): ReactElement => <span data-part="caret" aria-hidden="true" />;

function Glyph({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <span data-part="glyph" aria-hidden="true">
      {children}
    </span>
  );
}

function Lines({ lines }: { readonly lines: readonly Line[] }): ReactElement {
  return (
    <>
      {lines.map((line, i) => {
        const text = typeof line === "string" ? line : line.text;
        const tone = typeof line === "string" ? undefined : line.tone;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: output lines are a fixed recording
          <div key={i} data-part="line" data-tone={tone && tone !== "default" ? tone : undefined}>
            {text || " "}
          </div>
        );
      })}
    </>
  );
}

function More({
  count,
  labels,
}: {
  readonly count: number | undefined;
  readonly labels: AgentDemoLabels;
}): ReactElement | null {
  if (count === undefined) return null;
  return <div data-part="more">{labels.more(count)}</div>;
}

/** The thinking dots, named for assistive tech. */
export function Thinking({ label }: { readonly label: string }): ReactElement {
  return (
    <div data-part="thinking" role="img" aria-label={label}>
      <span data-part="thinking-dot" />
      <span data-part="thinking-dot" />
      <span data-part="thinking-dot" />
    </div>
  );
}

function Message<TData>({
  entry,
  step,
  config,
}: {
  readonly entry: DemoEntry<TData>;
  readonly step: Extract<Step<TData>, { kind: "user" | "agent-text" }>;
  readonly config: PartsConfig<TData>;
}): ReactElement {
  const user = step.kind === "user";
  const { labels, glyphs, layout } = config;
  const moving = entry.phase === "typing" || entry.phase === "revealing";
  return (
    <div data-part="message" data-from={user ? "user" : "agent"} data-phase={entry.phase}>
      {layout === "terminal" ? <Glyph>{user ? glyphs.user : glyphs.agent}</Glyph> : null}
      <p data-part="text">
        <span style={srOnly}>{user ? labels.you : labels.agent}: </span>
        {step.kind === "agent-text" && step.lead ? (
          <>
            <strong data-part="lead">{step.lead}</strong>{" "}
          </>
        ) : null}
        {entry.visibleText ?? step.text}
        {moving ? <Caret /> : null}
      </p>
    </div>
  );
}

/** Shows the skeleton over still-mounted content while loading, then fades it out (350ms). */
function Crossfade({
  loading,
  children,
}: {
  readonly loading: boolean;
  readonly children: ReactNode;
}): ReactElement {
  const [skeleton, setSkeleton] = useState(loading);
  useEffect(() => {
    if (loading) {
      setSkeleton(true);
      return;
    }
    const timer = setTimeout(() => setSkeleton(false), 350);
    return () => clearTimeout(timer);
  }, [loading]);
  return (
    <div data-part="tool-body" data-loading={loading ? "" : undefined}>
      <div data-part="tool-content" style={loading ? { visibility: "hidden" } : undefined}>
        {children}
      </div>
      {skeleton ? (
        <div data-part="skeleton" data-state={loading ? "loading" : "leaving"} aria-hidden="true">
          <span data-part="skeleton-bar" />
          <span data-part="skeleton-bar" />
          <span data-part="skeleton-bar" />
        </div>
      ) : null}
    </div>
  );
}

function BuiltInBody<TData>({
  body,
  labels,
}: {
  readonly body: ToolBody<TData>;
  readonly labels: AgentDemoLabels;
}): ReactElement | null {
  switch (body.kind) {
    case "lines":
      return (
        <div data-part="output">
          <Lines lines={body.lines} />
          <More count={body.more} labels={labels} />
        </div>
      );
    case "code": {
      const code = (
        <pre data-part="code" data-lang={body.lang}>
          <code>{body.code}</code>
        </pre>
      );
      if (!body.collapsed) return code;
      return (
        <details data-part="code-collapse">
          <summary>{labels.showCode}</summary>
          {code}
        </details>
      );
    }
    case "steps":
      return (
        <ol data-part="steps">
          {body.steps.map((item, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: steps are a fixed list
            <li key={i} data-part="step">
              {item}
            </li>
          ))}
        </ol>
      );
    case "error":
      return <p data-part="error">{body.summary}</p>;
    default:
      return null;
  }
}

function ToolStatusPip<TData>({
  running,
  failed,
  config,
  frame,
}: {
  readonly running: boolean;
  readonly failed: boolean;
  readonly config: PartsConfig<TData>;
  readonly frame: string;
}): ReactElement {
  const { labels, glyphs, layout } = config;
  let label = labels.done;
  let glyph = layout === "terminal" ? glyphs.agent : glyphs.ok;
  if (running) {
    label = labels.running;
    glyph = layout === "terminal" ? frame : "";
  } else if (failed) {
    label = labels.failed;
    glyph = layout === "terminal" ? glyphs.agent : glyphs.fail;
  }
  return (
    <span data-part="tool-status" role="img" aria-label={label}>
      {glyph}
    </span>
  );
}

interface ToolPartProps<TData> {
  readonly ctx: ToolCallContext<TData>;
  readonly config: PartsConfig<TData>;
  readonly frame: string;
}

function ToolHeader<TData>({ ctx, config, frame }: ToolPartProps<TData>): ReactElement {
  const { step, entry } = ctx;
  const terminal = config.layout === "terminal";
  const running = entry.status === "running";
  const icon = terminal ? undefined : config.tools?.[step.name]?.icon;
  // The terminal shows `server name` as parts a stylesheet can tell apart; chat shows the label.
  const name = terminal ? (
    <>
      {step.server ? (
        <>
          <span data-part="tool-server">{step.server}</span>
          {config.glyphs.serverSeparator}
        </>
      ) : null}
      <span data-part="tool-name">{step.name}</span>
    </>
  ) : (
    toolName(config.tools, step, config.layout, running)
  );
  // Collapsible cards use the header as the native disclosure toggle.
  const Header = config.collapsible ? "summary" : "div";
  return (
    <Header data-part="tool-header">
      <ToolStatusPip
        running={running}
        failed={entry.status === "error"}
        config={config}
        frame={frame}
      />
      {icon ? (
        <span data-part="tool-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span data-part="tool-label">{name}</span>
      {step.args !== undefined ? (
        <span data-part="tool-args">
          {terminal ? (
            <>
              <span data-part="tool-paren">(</span>
              {step.args}
              <span data-part="tool-paren">)</span>
            </>
          ) : (
            step.args
          )}
        </span>
      ) : null}
      {step.meta ? <span data-part="tool-meta">{step.meta}</span> : null}
    </Header>
  );
}

function ToolBodyContent<TData>({
  ctx,
  config,
  body,
}: Omit<ToolPartProps<TData>, "frame"> & { readonly body: ToolBody<TData> }): ReactNode {
  const custom = config.renderToolBody?.(ctx);
  if (!fallsBack(custom)) return custom;
  return <BuiltInBody body={body} labels={config.labels} />;
}

/**
 * Output and body under the header. The terminal shows them once the call resolves, behind the
 * output glyph; the chat card keeps them mounted under a skeleton that crossfades away.
 */
function ToolSection<TData>({ ctx, config }: Omit<ToolPartProps<TData>, "frame">): ReactNode {
  const { step, entry, loading } = ctx;
  const working = workingText(config.labels, config.layout, entry.status === "running");
  if (working) {
    return (
      <div data-part="tool-body">
        <Glyph>{config.glyphs.output}</Glyph>
        <div data-part="tool-working">{working}</div>
      </div>
    );
  }
  if (step.output === undefined && step.body === undefined) return null;
  const terminal = config.layout === "terminal";
  const lines = terminal ? (entry.visibleLines ?? []) : (step.output ?? []);
  const content = (
    <>
      {step.output ? (
        <div data-part="output">
          <Lines lines={lines} />
          <More count={entry.more} labels={config.labels} />
        </div>
      ) : null}
      {step.body && (entry.bodyVisible || !terminal) ? (
        <ToolBodyContent ctx={ctx} config={config} body={step.body} />
      ) : null}
    </>
  );
  if (!terminal) return <Crossfade loading={loading}>{content}</Crossfade>;
  if (entry.status === "running") return null;
  return (
    <div data-part="tool-body">
      <Glyph>{config.glyphs.output}</Glyph>
      <div data-part="tool-content">{content}</div>
    </div>
  );
}

function ToolCard<TData>({ ctx, config, frame }: ToolPartProps<TData>): ReactElement {
  const { step, entry } = ctx;
  const accent = config.tools?.[step.name]?.accent;
  const style = accent ? ({ "--sf-tool-accent": accent } as CSSProperties) : undefined;
  // Rendered open and never set again, so a reader's collapse holds while playback re-renders.
  const Root = config.collapsible ? "details" : "div";
  return (
    <Root
      data-part="tool-call"
      data-status={entry.status ?? step.status ?? "done"}
      data-phase={entry.phase}
      data-tool={step.name}
      style={style}
      open={config.collapsible ? true : undefined}
    >
      <ToolHeader ctx={ctx} config={config} frame={frame} />
      <ToolSection ctx={ctx} config={config} />
    </Root>
  );
}

function ToolCall<TData>({
  entry,
  config,
  frame,
}: {
  readonly entry: DemoEntry<TData>;
  readonly config: PartsConfig<TData>;
  readonly frame: string;
}): ReactNode {
  const step = entry.step as ToolCallStep<TData>;
  if (toolHidden(config.tools, step.name)) return null;
  const loading = entry.status === "running" || (step.body !== undefined && !entry.bodyVisible);
  const ctx: ToolCallContext<TData> = {
    step,
    entry,
    index: entry.index,
    loading,
    mode: config.mode,
  };
  const replaced = config.renderToolCall?.(ctx);
  if (!fallsBack(replaced)) return replaced;
  return <ToolCard ctx={ctx} config={config} frame={frame} />;
}

function Entry<TData>({
  entry,
  config,
  frame,
}: {
  readonly entry: DemoEntry<TData>;
  readonly config: PartsConfig<TData>;
  readonly frame: string;
}): ReactNode {
  const { step } = entry;
  switch (step.kind) {
    case "user":
      return (
        <>
          <Message entry={entry} step={step} config={config} />
          {entry.phase === "thinking" ? <Thinking label={config.labels.thinking} /> : null}
        </>
      );
    case "agent-text":
      return <Message entry={entry} step={step} config={config} />;
    case "command":
      return (
        <div data-part="command" data-phase={entry.phase}>
          <Glyph>{promptFor(config.steps, entry.index, config.glyphs.prompt)}</Glyph>
          <span data-part="text">
            {entry.visibleText ?? step.text}
            {entry.phase === "typing" ? <Caret /> : null}
          </span>
        </div>
      );
    case "output":
      return (
        <div data-part="output" data-phase={entry.phase}>
          <Lines lines={entry.visibleLines ?? step.lines} />
          <More count={entry.more} labels={config.labels} />
        </div>
      );
    case "tool-call":
      return <ToolCall entry={entry} config={config} frame={frame} />;
    case "thinking":
      return entry.phase === "thinking" ? <Thinking label={config.labels.thinking} /> : null;
    default:
      return null;
  }
}

/**
 * The scrollable transcript: an outer `column-reverse` scroller around an inner `column`, so it
 * anchors to the bottom without JS, leaves a reader who scrolled up alone, and keeps DOM order
 * equal to visual order. Focusable by default so keyboard users can scroll it. A named group by
 * default rather than a landmark, so two demos on one page don't repeat a region; `transcript`
 * picks a `<section>` region or drops the tab stop.
 */
export function Transcript<TData>({
  view,
  config,
}: {
  readonly view: DemoView<TData>;
  readonly config: PartsConfig<TData>;
}): ReactElement {
  const frame = spinnerFrame(config.glyphs.spinner, view.elapsed);
  const { tag: Root, role, tabIndex } = transcriptElement(config.transcript);
  return (
    // tabIndex: a scrollable region must be keyboard reachable (axe scrollable-region-focusable)
    <Root
      data-part="transcript"
      role={role}
      tabIndex={tabIndex}
      aria-label={config.labels.transcript}
    >
      <div data-part="turns">
        {view.entries.map((entry) => (
          <Fragment key={entry.key}>
            <Entry entry={entry} config={config} frame={frame} />
          </Fragment>
        ))}
      </div>
    </Root>
  );
}

/** The inert composer: typed text with a caret, else the placeholder, and the submit key. */
export function Composer({
  text,
  flash,
  layout,
  labels,
  glyphs,
}: {
  readonly text: string;
  readonly flash: boolean;
  readonly layout: AgentDemoLayout;
  readonly labels: AgentDemoLabels;
  readonly glyphs: AgentDemoGlyphs;
}): ReactElement {
  const track = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = track.current;
    if (el && text) el.scrollLeft = el.scrollWidth;
  }, [text]);
  return (
    <div data-part="composer" data-flash={flash ? "" : undefined} aria-hidden="true">
      {layout === "terminal" ? <Glyph>{glyphs.user}</Glyph> : null}
      <span data-part="composer-text" ref={track}>
        {text ? (
          <>
            {text}
            <Caret />
          </>
        ) : (
          <span data-part="placeholder">{labels.placeholder}</span>
        )}
      </span>
      <span data-part="submit" data-flash={flash ? "" : undefined}>
        {glyphs.submit}
      </span>
    </div>
  );
}
