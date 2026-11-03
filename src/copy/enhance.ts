import {
  COPY_COMMAND,
  COPY_CONTROLS,
  COPY_LABEL,
  COPY_READY,
  COPY_RESULT,
  COPY_ROOT,
} from "./markup.ts";
import { DEFAULT_COPY_MESSAGES } from "./messages.ts";
import { type CopyResetMs, checkResetMs, createCopyState } from "./state.ts";

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
  readonly failed?: (subject: string, context: { readonly hidden: boolean }) => string;
}

export interface EnhanceCopyOptions {
  /** How long the copied label stays before reverting. Default 2000. */
  readonly copiedMs?: number;
  /** Maps a button's aria-label to the noun used in failure messages. */
  readonly subjects?: Readonly<Record<string, string>>;
  readonly messages?: CopyMessages;
  readonly onCopy?: (detail: CopyEventDetail) => void;
}

const DEFAULT_SUBJECTS: Readonly<Record<string, string>> = {
  "Copy command": "command",
  "Copy prompt": "prompt",
  "Copy code": "code",
  "Copy page": "page",
};

const defaultFailed = (subject: string, { hidden }: { readonly hidden: boolean }): string =>
  hidden
    ? `Copy failed. Open the ${subject} and copy it manually.`
    : `Copy failed. The ${subject} is selected; press Cmd+C or Ctrl+C.`;

const IDLE_LABEL = "sfCopyIdle";

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
export function enhanceCopyButtons(root: ParentNode, options: EnhanceCopyOptions = {}): () => void {
  const config: Config = {
    // Checked here so a bad value names this option, not the copy state's `resetMs`.
    copiedMs: checkResetMs(options.copiedMs ?? 2000, "copiedMs"),
    subjects: { ...DEFAULT_SUBJECTS, ...options.subjects },
    copied: options.messages?.copied ?? DEFAULT_COPY_MESSAGES.copied,
    copiedLabel: options.messages?.copiedLabel ?? DEFAULT_COPY_MESSAGES.copiedLabel,
    failed: options.messages?.failed ?? defaultFailed,
    onCopy: options.onCopy,
  };
  const cleanups: Array<() => void> = [];
  const wired: HTMLButtonElement[] = [];

  for (const button of root.querySelectorAll<HTMLButtonElement>(`[${COPY_COMMAND}]`)) {
    // A second call must not stack listeners; the marker is removed again on dispose.
    if (!targetOf(button) || button.hasAttribute(COPY_READY)) continue;
    // Store the idle label once, so a second click while "Copied" shows can't capture it.
    button.dataset[IDLE_LABEL] ??= labelOf(button)?.textContent ?? "";
    // A re-wire after a dispose mid-"Copied" starts from the idle label.
    setLabel(button, button.dataset[IDLE_LABEL] ?? "");
    button.hidden = false;
    button.setAttribute(COPY_READY, "");
    wired.push(button);
    cleanups.push(wire(button, config));
  }

  return () => {
    for (const cleanup of cleanups) cleanup();
    // With no listener the button would be dead, so put it back the way the server rendered it.
    for (const button of wired) {
      button.hidden = true;
      button.removeAttribute(COPY_READY);
    }
  };
}

interface Config {
  readonly copiedMs: CopyResetMs;
  readonly subjects: Readonly<Record<string, string>>;
  readonly copied: string;
  readonly copiedLabel: string;
  readonly failed: NonNullable<CopyMessages["failed"]>;
  readonly onCopy: EnhanceCopyOptions["onCopy"];
}

/** The latest click: what it copied from, and the label to report. */
interface Attempt {
  readonly controls: string;
  readonly label: string;
  readonly target: HTMLElement;
}

/** Gives `button` its own copy state, reflects it on the DOM, and returns the cleanup. */
function wire(button: HTMLElement, config: Config): () => void {
  const state = createCopyState({ resetMs: config.copiedMs });
  let attempt: Attempt | undefined;

  state.subscribe(() => {
    const status = state.getState();
    const result = resultOf(button);
    if (status === "idle" || !attempt) {
      setLabel(button, button.dataset[IDLE_LABEL] ?? "");
      show(button, result, undefined, "");
      return;
    }
    if (status === "copied") {
      show(button, result, "copied", config.copied);
      setLabel(button, config.copiedLabel);
    } else {
      setLabel(button, button.dataset[IDLE_LABEL] ?? "");
      const hidden = isHidden(attempt.target);
      if (!hidden) selectText(attempt.target);
      const subject = config.subjects[attempt.label] ?? "text";
      show(button, result, "failed", config.failed(subject, { hidden }));
    }
    const detail: CopyEventDetail = {
      id: attempt.controls,
      label: attempt.label,
      ok: status === "copied",
    };
    config.onCopy?.(detail);
    button.dispatchEvent(new CustomEvent("sf:copy", { bubbles: true, detail }));
  });

  const listener = (): void => {
    const target = targetOf(button);
    if (!target) return;
    const controls = button.getAttribute(COPY_CONTROLS) ?? "";
    attempt = { controls, label: button.getAttribute("aria-label") ?? "", target };
    // The target can be rewired while the copy is in flight (a prompt variant switch). Drop the
    // result rather than reporting it against the wrong text.
    void state.copy(target.textContent ?? "", {
      isCurrent: () => button.getAttribute(COPY_CONTROLS) === controls,
    });
  };
  button.addEventListener("click", listener);
  return () => {
    button.removeEventListener("click", listener);
    state.destroy();
  };
}

function labelOf(button: HTMLElement): HTMLElement | null {
  return button.querySelector<HTMLElement>(`[${COPY_LABEL}]`);
}

function setLabel(button: HTMLElement, text: string): void {
  const node = labelOf(button);
  if (node) node.textContent = text;
}

/** Sets (or clears, with `undefined`) the state on the button and its result region. */
function show(
  button: HTMLElement,
  result: HTMLElement | null,
  state: "copied" | "failed" | undefined,
  message: string,
): void {
  for (const node of [button, result]) {
    if (!node) continue;
    if (state) node.dataset.state = state;
    else delete node.dataset.state;
  }
  if (result) result.textContent = message;
}

function targetOf(button: HTMLElement): HTMLElement | null {
  const id = button.getAttribute(COPY_CONTROLS);
  return id ? button.ownerDocument.getElementById(id) : null;
}

function resultOf(button: HTMLElement): HTMLElement | null {
  const scope = button.closest(`[${COPY_ROOT}]`) ?? button.parentElement;
  return scope?.querySelector<HTMLElement>(`[${COPY_RESULT}]`) ?? null;
}

function isHidden(element: HTMLElement): boolean {
  return element.closest("[hidden]") !== null;
}

function selectText(target: HTMLElement): void {
  for (let node = target.parentElement; node; node = node.parentElement) {
    if (node instanceof HTMLDetailsElement) node.open = true;
  }
  const selection = target.ownerDocument.getSelection();
  if (!selection) return;
  const range = target.ownerDocument.createRange();
  range.selectNodeContents(target);
  selection.removeAllRanges();
  selection.addRange(range);
}
