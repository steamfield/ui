/** How a line of output is colored. Renderers map each tone to a `--sf-*` token. */
export type Tone = "default" | "ok" | "fail" | "warn" | "muted";

/** One line of output: plain text, or text with a tone. */
export type Line = string | { readonly text: string; readonly tone?: Tone };

/**
 * The click index a step (or part of one) reveals at, for click-paced playback such as Slidev.
 * Optional everywhere: a step without one reveals with the step before it, and a body or output
 * without one reveals with its step.
 */
export interface At {
  readonly at?: number;
}

/**
 * A tool call's status. While the call is still running in time-paced playback it reads
 * "running"; afterwards this value, or "done" when it is left out.
 */
export type ToolStatus = "running" | "done" | "error" | "retried" | (string & {});

/** What a tool call shows under its header. `custom` is rendered by the consumer's body slot. */
export type ToolBody<TData = unknown> = At &
  (
    | { readonly kind: "lines"; readonly lines: readonly Line[]; readonly more?: number }
    | {
        readonly kind: "code";
        readonly lang?: string;
        readonly code: string;
        readonly collapsed?: boolean;
      }
    | { readonly kind: "steps"; readonly steps: readonly string[] }
    | { readonly kind: "error"; readonly summary: string }
    | { readonly kind: "custom"; readonly data: TData }
  );

/** One beat of a scripted agent session. */
export type Step<TData = unknown> = At &
  (
    | {
        readonly kind: "user";
        readonly text: string;
        /** A prefix of `text` that is already in the composer when the step starts. */
        readonly preTyped?: string;
        /** Type into the composer and post on submit, instead of typing into the transcript. */
        readonly composer?: boolean;
      }
    | { readonly kind: "agent-text"; readonly text: string; readonly lead?: string }
    | { readonly kind: "thinking"; readonly ms?: number }
    | { readonly kind: "pause"; readonly ms: number }
    /** A shell prompt prefix for the commands after it, such as "~/demo $". */
    | { readonly kind: "prompt"; readonly text: string }
    | { readonly kind: "command"; readonly text: string }
    /** `more` counts lines left out; renderers show it as "… +N lines" once the step is done. */
    | { readonly kind: "output"; readonly lines: readonly Line[]; readonly more?: number }
    | {
        readonly kind: "tool-call";
        /** A stable key for the call. Defaults to the step index. */
        readonly id?: string;
        readonly name: string;
        readonly server?: string;
        readonly args?: string;
        readonly status?: ToolStatus;
        /** Right-aligned detail such as "54 rows · 65ms". */
        readonly meta?: string;
        readonly output?: readonly Line[];
        /**
         * The click the output reveals at, when later than the step's. A sibling field rather
         * than `output.at`, because every array already has an `at` method.
         */
        readonly outputAt?: number;
        readonly more?: number;
        readonly body?: ToolBody<TData>;
      }
  );

/** Every step kind, in the order the types list them. */
export type StepKind = Step["kind"];

/** A whole scripted session. `id` seeds the timing jitter when no seed is given. */
export interface DemoScript<TData = unknown> {
  readonly id?: string;
  readonly steps: readonly Step<TData>[];
}
