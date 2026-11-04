// Where focus goes when the banner leaves the page. Removing a focused element drops focus to
// nowhere, which strands a keyboard user; both bindings put it back where it came from instead.

export interface FocusReturn {
  /** Call on every `focusin` inside `root`, with the event's `relatedTarget`. */
  readonly enter: (root: Element, from: EventTarget | null) => void;
  /**
   * Call just before `root` is removed. When focus is inside it, focus returns to the element
   * that had it before focus entered the banner; when there was none (or it is gone), to the body.
   */
  readonly restore: (root: Element | null) => void;
}

const isFocusable = (node: unknown): node is HTMLElement =>
  typeof (node as HTMLElement | null)?.focus === "function";

export function createFocusReturn(): FocusReturn {
  let origin: HTMLElement | null = null;
  return {
    enter(root, from) {
      if (from instanceof Node && root.contains(from)) return;
      origin = isFocusable(from) ? from : null;
    },
    restore(root) {
      const doc = root?.ownerDocument;
      if (!root || !doc || !root.contains(doc.activeElement)) return;
      if (origin?.isConnected && !root.contains(origin)) origin.focus();
      if (root.contains(doc.activeElement)) focusBody(doc);
      origin = null;
    },
  };
}

/** Focuses the body through a temporary `tabindex="-1"`, removed again when it loses focus. */
function focusBody(doc: Document): void {
  const body = doc.body;
  if (!body) return;
  if (body.hasAttribute("tabindex")) {
    body.focus();
    return;
  }
  body.setAttribute("tabindex", "-1");
  body.addEventListener("blur", () => body.removeAttribute("tabindex"), { once: true });
  body.focus();
}
