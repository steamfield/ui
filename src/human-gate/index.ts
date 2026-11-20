/**
 * `@steamfield/ui/human-gate`: holds analytics events until the visitor gives a trusted input,
 * so headless crawlers that never touch the page send nothing.
 */
export type { GatedEvent } from "./events.ts";
export { HUMAN_SIGNALS, UNGATED_EVENTS } from "./events.ts";
export type {
  DeferredCaptureOptions,
  HumanGate,
  HumanGateCaptureOptions,
  HumanGateClient,
} from "./gate.ts";
export { createHumanGate, humanGate } from "./gate.ts";
