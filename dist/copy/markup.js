// src/copy/markup.ts
/** The wrapper that scopes a button's result region. */
const COPY_ROOT = "data-copy-root";
/** Marks a copy button. */
const COPY_COMMAND = "data-copy-command";
/** On the button: the `id` of the element whose text it copies. */
const COPY_CONTROLS = "aria-controls";
/** The span inside the button whose text switches to the copied label. */
const COPY_LABEL = "data-copy-label";
/** The live region beside the button that announces the outcome. */
const COPY_RESULT = "data-copy-result";
/** Set on a button once it is wired, so a second enhance call skips it. */
const COPY_READY = "data-copy-ready";
export { COPY_COMMAND, COPY_CONTROLS, COPY_LABEL, COPY_READY, COPY_RESULT, COPY_ROOT };
