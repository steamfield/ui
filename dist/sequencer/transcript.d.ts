import { DemoScript } from "../script/types.js";
/**
 * The finished script as plain text, for `<noscript>`, screen-reader summaries and llms.txt.
 * User messages start with "> ", commands with their prompt (or "$"), tool calls read
 * `name(args)` with their output indented, and a `more` count reads "… +N lines". A blank line
 * separates turns. Thinking, pauses and custom bodies have no text.
 */
export declare function transcriptText(script: DemoScript<unknown>): string;