// Default copy wording shared by `enhanceCopyButtons` and React `InstallTabs`.
//
// Failure wording is not shared on purpose: the enhancer selects the target text on failure, so
// its message says the text is selected; InstallTabs selects nothing and asks the reader to.

export interface DefaultCopyMessages {
  /** The idle button text. */
  readonly label: string;
  /** The button text while it shows success. */
  readonly copiedLabel: string;
  /** Announced after a successful copy. */
  readonly copied: string;
}

// One object rather than separate constants, so the bundler keeps a real import binding instead
// of inlining the strings and leaving a bare `import "./messages.js"` behind.
export const DEFAULT_COPY_MESSAGES: DefaultCopyMessages = Object.freeze({
  label: "Copy",
  copiedLabel: "Copied",
  copied: "Copied to clipboard.",
});
