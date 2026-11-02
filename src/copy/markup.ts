// The markup contract `enhanceCopyButtons` activates. React `CopyButton` and markdown's code
// blocks render it, so all three read the attribute names from here.

/** The wrapper that scopes a button's result region. */
export const COPY_ROOT = "data-copy-root";
/** Marks a copy button. */
export const COPY_COMMAND = "data-copy-command";
/** On the button: the `id` of the element whose text it copies. */
export const COPY_CONTROLS = "aria-controls";
/** The span inside the button whose text switches to the copied label. */
export const COPY_LABEL = "data-copy-label";
/** The live region beside the button that announces the outcome. */
export const COPY_RESULT = "data-copy-result";
/** Set on a button once it is wired, so a second enhance call skips it. */
export const COPY_READY = "data-copy-ready";
