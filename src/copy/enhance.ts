import { copyText } from "./copy-text.ts";

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
const READY = "data-copy-ready";

/**
 * Activates every `[data-copy-command]` button under `root`. Each button names its source with
 * `aria-controls` and stays `hidden` until a target exists, so a page without JavaScript shows the
 * text with no dead button. A sibling `[data-copy-result]` live region announces the outcome, and
 * on failure the text is selected (opening any enclosing `<details>`) for a manual copy.
 *
 * Returns a function that removes the listeners and pending timers.
 */
export function enhanceCopyButtons(root: ParentNode, options: EnhanceCopyOptions = {}): () => void {
  const config: Config = {
    copiedMs: options.copiedMs ?? 2000,
    subjects: { ...DEFAULT_SUBJECTS, ...options.subjects },
    copied: options.messages?.copied ?? "Copied to clipboard.",
    copiedLabel: options.messages?.copiedLabel ?? "Copied",
    failed: options.messages?.failed ?? defaultFailed,
    onCopy: options.onCopy,
    timers: new Map(),
    disposed: false,
  };
  const cleanups: Array<() => void> = [];
  const wired: HTMLButtonElement[] = [];

  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-copy-command]")) {
    // A second call must not stack listeners; the marker is removed again on dispose.
    if (!targetOf(button) || button.hasAttribute(READY)) continue;
    // Store the idle label once, so a second click while "Copied" shows can't capture it.
    button.dataset[IDLE_LABEL] ??= labelOf(button)?.textContent ?? "";
    // A re-wire after a dispose mid-"Copied" starts from the idle label.
    setLabel(button, button.dataset[IDLE_LABEL] ?? "");
    button.hidden = false;
    button.setAttribute(READY, "");
    wired.push(button);
    const listener = (): void => {
      void copyFrom(button, config);
    };
    button.addEventListener("click", listener);
    cleanups.push(() => button.removeEventListener("click", listener));
  }

  return () => {
    config.disposed = true;
    for (const cleanup of cleanups) cleanup();
    for (const timer of config.timers.values()) clearTimeout(timer);
    config.timers.clear();
    // With no listener the button would be dead, so put it back the way the server rendered it.
    for (const button of wired) {
      button.hidden = true;
      button.removeAttribute(READY);
    }
  };
}

interface Config {
  readonly copiedMs: number;
  readonly subjects: Readonly<Record<string, string>>;
  readonly copied: string;
  readonly copiedLabel: string;
  readonly failed: NonNullable<CopyMessages["failed"]>;
  readonly onCopy: EnhanceCopyOptions["onCopy"];
  readonly timers: Map<HTMLElement, ReturnType<typeof setTimeout>>;
  disposed: boolean;
}

async function copyFrom(button: HTMLElement, config: Config): Promise<void> {
  const controls = button.getAttribute("aria-controls") ?? "";
  const target = targetOf(button);
  if (!target) return;
  const label = button.getAttribute("aria-label") ?? "";
  const ok = await copyText(target.textContent ?? "");
  // The target can be rewired while the copy is in flight (a prompt variant switch). Drop the
  // result rather than reporting it against the wrong text.
  if (config.disposed || button.getAttribute("aria-controls") !== controls) return;
  const result = resultOf(button);
  clearTimeout(config.timers.get(button));
  if (ok) {
    show(button, result, "copied", config.copied);
    setLabel(button, config.copiedLabel);
    const reset = (): void => {
      setLabel(button, button.dataset[IDLE_LABEL] ?? "");
      show(button, result, undefined, "");
    };
    config.timers.set(button, setTimeout(reset, config.copiedMs));
  } else {
    setLabel(button, button.dataset[IDLE_LABEL] ?? "");
    const hidden = isHidden(target);
    if (!hidden) selectText(target);
    show(button, result, "failed", config.failed(config.subjects[label] ?? "text", { hidden }));
  }
  const detail: CopyEventDetail = { id: controls, label, ok };
  config.onCopy?.(detail);
  button.dispatchEvent(new CustomEvent("sf:copy", { bubbles: true, detail }));
}

function labelOf(button: HTMLElement): HTMLElement | null {
  return button.querySelector<HTMLElement>("[data-copy-label]");
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
  const id = button.getAttribute("aria-controls");
  return id ? button.ownerDocument.getElementById(id) : null;
}

function resultOf(button: HTMLElement): HTMLElement | null {
  const scope = button.closest("[data-copy-root]") ?? button.parentElement;
  return scope?.querySelector<HTMLElement>("[data-copy-result]") ?? null;
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
