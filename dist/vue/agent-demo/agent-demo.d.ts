import { AgentDemoGlyphs, AgentDemoLabels, AgentDemoLayout, AgentDemoTranscript, AnnounceMode } from "../../agent-demo/core.js";
import { DemoScript } from "../../script/types.js";
import { Timeline } from "../../sequencer/compile.js";
import { DemoView, Position } from "../../sequencer/view.js";
import { ToolRegistry, ToolSlot } from "./parts.js";
import { AgentDemoControls, UseAgentDemoOptions } from "./use-agent-demo.js";
import { DefineSetupFnComponent, SlotsType, VNode } from "vue";
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
export type AgentDemoChrome = boolean | {
  readonly title?: string;
  readonly dots?: boolean;
  readonly className?: string;
};
export interface AgentDemoProps extends Omit<UseAgentDemoOptions, "position" | "active" | "onStepStart" | "onComplete"> {
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
  readonly stage?: (props: {
    readonly view: DemoView;
  }) => VNode[];
  /** Content at the top of the demo, before the controls. */
  readonly header?: () => VNode[];
  /** Your own controls, in place of the built-in ones. */
  readonly controls?: (state: AgentDemoSlotState) => VNode[];
  /** Shown at the start of the composer, before the typed text, such as an attach icon. */
  readonly composerStart?: () => VNode[];
  /** Replaces `glyphs.submit` in the composer's submit key, such as an icon. */
  readonly submitIcon?: () => VNode[];
}
/** No emits: `@complete` and `@step-start` bind the `onComplete` and `onStepStart` props. */
type NoEmits = Record<never, never>;
/**
 * The default agent demo renderer for Vue, in the same parts and `data-*` markup as the React
 * `AgentDemo`, so `agent-demo/styles.css` styles both. The server and pre-mount render are the
 * final transcript; entrance and typing CSS only apply under `[data-sf-animating]`, which is set
 * once mounted and playing (or following a click position).
 *
 * Slots: `toolCall` and `toolBody` get a `ToolCallContext`, `stage` gets `{ view }`, `header`
 * takes markup and `controls` gets the state as plain values.
 */
export declare const AgentDemo: DefineSetupFnComponent<AgentDemoProps, NoEmits, SlotsType<AgentDemoSlots>>;
export {};