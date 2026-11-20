import { DemoScript, StepKind } from "./types.js";
export interface ValidateScriptOptions {
  /** The step kinds the caller can render. A step of any other kind is `unsupported_step`. */
  readonly kinds?: readonly StepKind[];
}
/**
 * Checks a script's shape at runtime, for scripts that arrive as JSON or from JavaScript. Throws
 * `LibraryError("invalid_script")` naming the first bad field (such as "steps[3].text"), or
 * `LibraryError("unsupported_step")` for a step or body kind the caller can't render.
 */
export declare function validateScript(script: unknown, options?: ValidateScriptOptions): asserts script is DemoScript;