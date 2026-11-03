import {
  type DefineSetupFnComponent,
  defineComponent,
  h,
  type PropType,
  type SlotsType,
  type VNode,
  type VNodeChild,
} from "vue";
import {
  type AgentDemoGlyphs,
  type AgentDemoLabels,
  type AgentDemoLayout,
  type AgentDemoTranscript,
  type AnnounceMode,
  defaultGlyphs,
  defaultLabels,
  lastBeat,
} from "../../agent-demo/core.ts";
import type { DemoScript } from "../../script/types.ts";
import type { Timeline } from "../../sequencer/compile.ts";
import type { DemoView, Position } from "../../sequencer/view.ts";
import {
  Composer,
  hasContent,
  type PartsConfig,
  srOnly,
  type ToolRegistry,
  type ToolSlot,
  transcript,
} from "./parts.ts";
import {
  type AgentDemoControls,
  type UseAgentDemoOptions,
  type UseAgentDemoResult,
  useAgentDemo,
} from "./use-agent-demo.ts";

/**
 * Which controls show once mounted (never under reduced motion or a fixed `position`): "inline"
 * is the one play/pause/replay button, "full" adds turn jumps, Next and a 1x/2x speed toggle.
 * The `controls` slot replaces either with your own.
 */
export type AgentDemoControlsMode = "inline" | "full" | "none";

/**
 * Window chrome: true for the default window, or a title, whether to draw the dots, and a class
 * for the window root (to size or shadow it).
 */
export type AgentDemoChrome =
  | boolean
  | { readonly title?: string; readonly dots?: boolean; readonly className?: string };

export interface AgentDemoProps
  extends Omit<UseAgentDemoOptions, "position" | "active" | "onStepStart" | "onComplete"> {
  readonly script: DemoScript;
  /** Click mode, such as `{ click: $clicks }` in a Slidev slide. */
  readonly position?: Position | undefined;
  /** Whether the slide is active; each entry remounts the demo so entrances play again. */
  readonly active?: boolean | undefined;
  /** Default "chat". */
  readonly layout?: AgentDemoLayout | undefined;
  /** Overrides for any of the default strings. */
  readonly labels?: Partial<AgentDemoLabels> | undefined;
  readonly glyphs?: Partial<AgentDemoGlyphs> | undefined;
  /** Labels, icons and accents per tool name, for the chat layout's card headers. */
  readonly tools?: ToolRegistry | undefined;
  /** Default "inline". */
  readonly controls?: AgentDemoControlsMode | undefined;
  /** Text at the top of the demo, before the controls. The `header` slot takes markup. */
  readonly header?: string | undefined;
  /** Wraps the transcript in window chrome, with the controls in its title bar. */
  readonly chrome?: AgentDemoChrome | undefined;
  /**
   * Renders each built-in tool card as an open `<details>` with its header as the `<summary>`, so
   * a reader can hide a call's output. Default false.
   */
  readonly collapsible?: boolean | undefined;
  /** The transcript's landmark and tab stop. Default a focusable `role="group"`. */
  readonly transcript?: AgentDemoTranscript | undefined;
  /** Default "status". */
  readonly announce?: AnnounceMode | undefined;
  /** Added to the root's class, for session-recording opt-outs such as "ph-no-capture". */
  readonly privacyClassName?: string | undefined;
  /** Bound by `@step-start`. */
  readonly onStepStart?: UseAgentDemoOptions["onStepStart"];
  /** Bound by `@complete`. */
  readonly onComplete?: UseAgentDemoOptions["onComplete"];
}

/** The demo's state as plain values, for the `controls` slot. */
export interface AgentDemoSlotState {
  readonly view: DemoView;
  readonly controls: AgentDemoControls;
  readonly started: boolean;
  readonly playing: boolean;
  readonly paused: boolean;
  readonly complete: boolean;
  readonly animating: boolean;
  readonly speed: number;
  readonly turn: number;
  readonly timeline: Timeline;
}

export interface AgentDemoSlots {
  /** Replaces a whole tool card. Render nothing to keep the default card. */
  readonly toolCall?: ToolSlot;
  /** Renders a tool body (`custom` bodies, or any kind you want to override). */
  readonly toolBody?: ToolSlot;
  /** Content beside the transcript that follows the view, such as a live chart. */
  readonly stage?: (props: { readonly view: DemoView }) => VNode[];
  /** Content at the top of the demo, before the controls. */
  readonly header?: () => VNode[];
  /** Your own controls, in place of the built-in ones. */
  readonly controls?: (state: AgentDemoSlotState) => VNode[];
}

function playbackControls(
  state: AgentDemoSlotState,
  labels: AgentDemoLabels,
  full: boolean,
): VNode {
  const { controls, complete, started, paused, animating, timeline, speed, turn } = state;
  const elapsed = animating ? state.view.elapsed : 0;
  // At the end without having played there (motion came back after reduced motion) still replays.
  const atEnd = complete || (animating && state.view.complete);
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
  return h("div", { "data-part": "controls" }, [
    turns
      ? h("fieldset", { "data-part": "turn-jumps" }, [
          h("legend", { style: srOnly }, labels.jumpToTurn),
          ...turnStarts.map((start, i) =>
            h(
              "button",
              {
                key: i,
                type: "button",
                "data-part": "control",
                "data-control": "turn",
                "aria-current": turn === i ? "step" : undefined,
                onClick: () => {
                  controls.seek(start);
                  controls.play();
                },
              },
              String(i + 1),
            ),
          ),
        ])
      : null,
    h(
      "button",
      {
        type: "button",
        "data-part": "control",
        "data-control": "play",
        onClick: atEnd ? controls.replay : controls.toggle,
      },
      label,
    ),
    turns
      ? h(
          "button",
          {
            type: "button",
            "data-part": "control",
            "data-control": "next",
            disabled: atEnd,
            onClick: next,
          },
          labels.next,
        )
      : null,
    full
      ? h(
          "button",
          {
            type: "button",
            "data-part": "control",
            "data-control": "speed",
            "aria-label": `${labels.speed} ${speed}x`,
            onClick: () => controls.setSpeed(speed === 1 ? 2 : 1),
          },
          `${speed}x`,
        )
      : null,
  ]);
}

/** The window chrome, in the same parts as React's `DemoWindow`. */
function windowFrame(
  chrome: Exclude<AgentDemoChrome, false>,
  controls: VNodeChild,
  body: VNodeChild[],
): VNode {
  const { title, dots = true, className } = typeof chrome === "object" ? chrome : {};
  return h("div", { "data-part": "window", ...(className ? { class: className } : {}) }, [
    h("div", { "data-part": "window-bar" }, [
      dots
        ? h("span", { "data-part": "window-dots", "aria-hidden": "true" }, [
            h("span", { "data-part": "window-dot" }),
            h("span", { "data-part": "window-dot" }),
            h("span", { "data-part": "window-dot" }),
          ])
        : null,
      title !== undefined ? h("span", { "data-part": "window-title" }, title) : null,
      controls ? h("div", { "data-part": "window-controls" }, [controls]) : null,
    ]),
    h("div", { "data-part": "window-body" }, body),
  ]);
}

/** No emits: `@complete` and `@step-start` bind the `onComplete` and `onStepStart` props. */
type NoEmits = Record<never, never>;

const PROPS = {
  script: { type: Object as PropType<DemoScript>, required: true },
  layout: null,
  labels: null,
  glyphs: null,
  tools: null,
  controls: null,
  header: null,
  chrome: { type: [Boolean, Object] as PropType<AgentDemoChrome>, default: undefined },
  collapsible: { type: Boolean, default: undefined },
  transcript: null,
  announce: null,
  privacyClassName: null,
  position: null,
  active: { type: Boolean, default: undefined },
  scriptKey: null,
  timing: null,
  seed: null,
  composer: { type: Boolean, default: undefined },
  finalPolicy: null,
  autoStart: { type: Boolean, default: undefined },
  threshold: null,
  rootMargin: null,
  leaveGraceMs: null,
  motion: null,
  reducedPolicy: null,
  speed: null,
  onStepStart: null,
  onComplete: null,
} as const;

type Demo = UseAgentDemoResult<unknown>;

function slotState(demo: Demo): AgentDemoSlotState {
  return {
    view: demo.view.value,
    controls: demo.controls,
    started: demo.started.value,
    playing: demo.playing.value,
    paused: demo.paused.value,
    complete: demo.complete.value,
    animating: demo.animating.value,
    speed: demo.speed.value,
    turn: demo.turn.value,
    timeline: demo.timeline.value,
  };
}

function controlsFor(
  props: AgentDemoProps,
  slots: AgentDemoSlots,
  demo: Demo,
  labels: AgentDemoLabels,
): VNodeChild {
  const mode = props.controls ?? "inline";
  if (!demo.ready.value || demo.reduced.value || demo.clickMode.value || mode === "none") {
    return null;
  }
  const state = slotState(demo);
  return slots.controls ? slots.controls(state) : playbackControls(state, labels, mode === "full");
}

/** The header, the controls and the transcript, in window chrome or a plain header bar. */
function frame(
  props: AgentDemoProps,
  slots: AgentDemoSlots,
  controls: VNodeChild,
  body: VNodeChild[],
): VNodeChild[] {
  const slotted = slots.header?.();
  const header: VNodeChild = hasContent(slotted) ? slotted : (props.header ?? null);
  if (props.chrome) {
    const inner = header === null ? null : h("div", { "data-part": "header" }, [header]);
    return [windowFrame(props.chrome, controls, [inner, ...body])];
  }
  const bar =
    header !== null || controls ? h("div", { "data-part": "header" }, [header, controls]) : null;
  return [bar, ...body];
}

function announcements(
  announce: AnnounceMode,
  demo: Demo,
  config: PartsConfig<unknown>,
): VNodeChild[] {
  if (announce === "none") return [];
  const { labels } = config;
  const status = h(
    "p",
    { "data-part": "status", role: "status", style: srOnly },
    demo.complete.value ? labels.completeStatus : labels.idleStatus,
  );
  if (announce !== "beats") return [status];
  const beat = demo.animating.value ? lastBeat(demo.view.value.entries, config) : "";
  return [status, h("div", { "data-part": "beats", "aria-live": "polite", style: srOnly }, beat)];
}

/**
 * The default agent demo renderer for Vue, in the same parts and `data-*` markup as the React
 * `AgentDemo`, so `agent-demo/styles.css` styles both. The server and pre-mount render are the
 * final transcript; entrance and typing CSS only apply under `[data-sf-animating]`, which is set
 * once mounted and playing (or following a click position).
 *
 * Slots: `toolCall` and `toolBody` get a `ToolCallContext`, `stage` gets `{ view }`, `header`
 * takes markup and `controls` gets the state as plain values.
 */
export const AgentDemo: DefineSetupFnComponent<
  AgentDemoProps,
  NoEmits,
  SlotsType<AgentDemoSlots>
> = defineComponent(
  (props: AgentDemoProps, { slots }) => {
    const layout = (): AgentDemoLayout => props.layout ?? "chat";
    const demo = useAgentDemo(
      () => props.script,
      () => ({ ...props, composer: props.composer ?? layout() === "chat" }),
    );

    return () => {
      const view = demo.view.value;
      const labels: AgentDemoLabels = { ...defaultLabels, ...props.labels };
      const glyphs: AgentDemoGlyphs = { ...defaultGlyphs, ...props.glyphs };
      const config: PartsConfig<unknown> = {
        layout: layout(),
        labels,
        glyphs,
        tools: props.tools,
        toolCall: slots.toolCall,
        toolBody: slots.toolBody,
        mode: demo.mode.value,
        steps: demo.timeline.value.script.steps,
        collapsible: props.collapsible === true,
        transcript: props.transcript,
      };
      const composer = view.composer
        ? h(Composer, { ...view.composer, layout: layout(), labels, glyphs })
        : null;
      const body = [transcript(view, config), composer];
      const animating = demo.animating.value;
      return h(
        "div",
        {
          key: demo.playCount.value,
          ref: demo.el,
          "data-sf-agent-demo": "",
          "data-part": "agent-demo",
          "data-layout": layout(),
          "data-sf-animating": animating ? "" : undefined,
          "data-paused": animating && !demo.playing.value ? "" : undefined,
          "data-complete": demo.complete.value ? "" : undefined,
          ...(props.privacyClassName ? { class: props.privacyClassName } : {}),
        },
        [
          ...frame(props, slots, controlsFor(props, slots, demo, labels), body),
          slots.stage ? h("div", { "data-part": "stage" }, slots.stage({ view })) : null,
          ...announcements(props.announce ?? "status", demo, config),
        ],
      );
    };
  },
  {
    name: "SfAgentDemo",
    props: PROPS,
    slots: Object as SlotsType<AgentDemoSlots>,
  },
);
