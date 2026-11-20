import { AgentDemoGlyphs, AgentDemoLabels, AgentDemoLayout, AgentDemoTranscript } from "../../agent-demo/core.js";
import { DemoScript } from "../../script/types.js";
import { FinalPolicy } from "../../sequencer/view.js";
import { ToolRegistry, ToolSlot } from "./parts.js";
import { DefineSetupFnComponent, SlotsType } from "vue";
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
export declare const StaticTranscript: DefineSetupFnComponent<StaticTranscriptProps, NoEmits, SlotsType<StaticTranscriptSlots>>;
export {};