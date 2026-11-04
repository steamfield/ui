// Where focus goes when the banner leaves the page. Removing a focused element drops focus to the
// document, which strands a keyboard user at the top; both bindings put it back where it came
// from instead, when they know where that was.

export interface FocusReturn {
  /** Call on every `focusin` inside `root`, with the event's `relatedTarget`. */
  readonly enter: (root: Element, from: EventTarget | null) => void;
  /**
   * Call just before `root` is removed. When focus is inside it, focus returns (without
   * scrolling) to the element that had it before focus entered the banner. When there was none,
   * or it has left the page, nothing is done and the browser's default applies.
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
      const target = origin;
      origin = null;
      const doc = root?.ownerDocument;
      if (!root || !doc || !root.contains(doc.activeElement)) return;
      if (target?.isConnected && !root.contains(target)) target.focus({ preventScroll: true });
    },
  };
}
