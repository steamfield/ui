import {
  type DefineSetupFnComponent,
  defineComponent,
  h,
  type PropType,
  type SlotsType,
} from "vue";
import {
  type AgentDemoGlyphs,
  type AgentDemoLabels,
  type AgentDemoLayout,
  type AgentDemoTranscript,
  defaultGlyphs,
  defaultLabels,
} from "../../agent-demo/core.ts";
import type { DemoScript } from "../../script/types.ts";
import { compile } from "../../sequencer/compile.ts";
import { type FinalPolicy, finalState } from "../../sequencer/view.ts";
import { type ToolRegistry, type ToolSlot, transcript } from "./parts.ts";

export interface StaticTranscriptProps {
  readonly script: DemoScript;
  /** Default "chat". */
  readonly layout?: AgentDemoLayout | undefined;
  /** Default "all". */
  readonly finalPolicy?: FinalPolicy | undefined;
  readonly labels?: Partial<AgentDemoLabels> | undefined;
  readonly glyphs?: Partial<AgentDemoGlyphs> | undefined;
  readonly tools?: ToolRegistry | undefined;
  /** As `AgentDemo`'s: each built-in tool card is an open `<details>`. Default false. */
  readonly collapsible?: boolean | undefined;
  /** As `AgentDemo`'s. Default a focusable `role="group"`. */
  readonly transcript?: AgentDemoTranscript | undefined;
  readonly privacyClassName?: string | undefined;
}

type NoEmits = Record<never, never>;

export interface StaticTranscriptSlots {
  /** Called with `mode: "static"`. */
  readonly toolCall?: ToolSlot;
  /** Called with `mode: "static"`. */
  readonly toolBody?: ToolSlot;
}

/**
 * The finished transcript with no playback, controls or composer, in the same parts and CSS as
 * `AgentDemo`. It reads no browser state, so it renders on the server and in print or PDF export.
 */
export const StaticTranscript: DefineSetupFnComponent<
  StaticTranscriptProps,
  NoEmits,
  SlotsType<StaticTranscriptSlots>
> = defineComponent(
  (props: StaticTranscriptProps, { slots }) =>
    () => {
      const layout = props.layout ?? "chat";
      const view = finalState(compile(props.script), { policy: props.finalPolicy ?? "all" });
      return h(
        "div",
        {
          "data-sf-agent-demo": "",
          "data-part": "agent-demo",
          "data-layout": layout,
          "data-static": "",
          ...(props.privacyClassName ? { class: props.privacyClassName } : {}),
        },
        [
          transcript(view, {
            layout,
            labels: { ...defaultLabels, ...props.labels },
            glyphs: { ...defaultGlyphs, ...props.glyphs },
            tools: props.tools,
            toolCall: slots.toolCall,
            toolBody: slots.toolBody,
            mode: "static",
            steps: props.script.steps,
            collapsible: props.collapsible === true,
            transcript: props.transcript,
          }),
        ],
      );
    },
  {
    name: "SfStaticTranscript",
    props: {
      script: { type: Object as PropType<DemoScript>, required: true },
      layout: null,
      finalPolicy: null,
      labels: null,
      glyphs: null,
      tools: null,
      collapsible: { type: Boolean, default: undefined },
      transcript: null,
      privacyClassName: null,
    },
    slots: Object as SlotsType<StaticTranscriptSlots>,
  },
);
