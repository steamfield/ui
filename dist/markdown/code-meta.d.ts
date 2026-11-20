import { ShikiTransformer } from "shiki";
export interface FenceMeta {
  title?: string;
  group?: string;
}
/** Reads `title="…"` and `group="…"` from a code fence's info string; other keys are ignored. */
export declare function parseFenceMeta(raw: string | undefined): FenceMeta;
/** Carries fence meta onto Shiki's `<pre>`: Sätteri swaps the fence for Shiki's output before any hast plugin runs. */
export declare function codeMeta(): ShikiTransformer;