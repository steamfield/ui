/** What `onCopy` and the `sf:copy` event receive after every attempt. */
export interface CopyEventDetail {
  /** The `id` of the element whose text was copied. */
  readonly id: string;
  /** The button's accessible name before the click, such as "Copy command". */
  readonly label: string;
  readonly ok: boolean;
}
export interface CopyMessages {
  /** Announced to screen readers after a successful copy. */
  readonly copied?: string;
  /** The visible label on the button while it shows success. */
  readonly copiedLabel?: string;
  /**
   * Shown and announced when copying fails. `subject` comes from `subjects`; `hidden` is true
   * when the target text isn't on screen, so it can't be selected for a manual copy.
   */
  readonly failed?: (subject: string, context: {
    readonly hidden: boolean;
  }) => string;
}
export interface EnhanceCopyOptions {
  /**
   * How long the copied label stays before reverting, from 0 to 2^31 - 1, or false to keep
   * Copied until the next click. Default 2000. Any other value throws `invalid_option` naming
   * `copiedMs`.
   */
  readonly copiedMs?: number | false;
  /** Maps a button's aria-label to the noun used in failure messages. */
  readonly subjects?: Readonly<Record<string, string>>;
  readonly messages?: CopyMessages;
  readonly onCopy?: (detail: CopyEventDetail) => void;
}
/**
 * Activates every `[data-copy-command]` button under `root`. Each button names its source with
 * `aria-controls` and stays `hidden` until a target exists, so a page without JavaScript shows the
 * text with no dead button. A sibling `[data-copy-result]` live region announces the outcome, and
 * on failure the text is selected (opening any enclosing `<details>`) for a manual copy.
 *
 * Each wired button gets `data-copy-ready`. A later call skips buttons that already have it, so
 * it wires only new buttons and its options don't apply to the old ones; to re-wire a button with
 * new options, call the first disposer, then call again.
 *
 * Returns a function that removes the listeners and pending timers, and hides the buttons it
 * wired again (removing `data-copy-ready`), since a button with no listener would be dead.
 */
export declare function enhanceCopyButtons(root: ParentNode, options?: EnhanceCopyOptions): () => void;