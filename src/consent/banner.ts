import { LibraryError } from "../internal/errors.ts";
import { autoMotionSource } from "../internal/motion.ts";
import {
  CONSENT_ANIMATING,
  CONSENT_PARTS,
  type ConsentBannerContent,
  type ConsentBannerOptions,
  createConsentBannerState,
  resolveBannerOptions,
} from "./banner-state.ts";
import { createFocusReturn } from "./focus.ts";
import type { ConsentStore } from "./store.ts";

export interface MountConsentBannerOptions extends ConsentBannerOptions {
  /** Where the banner is appended. Default `document.body`. */
  readonly container?: Element;
}

/**
 * Shows a consent banner while `store` is undecided: a non-modal labelled region (not a dialog,
 * no focus trap, and it never takes focus) with the message, an optional privacy link, a decline
 * and an accept button. The buttons call `store.decline()` and `store.accept()`; any decision,
 * from the banner or elsewhere, removes it, and `store.reset()` brings it back. If focus is in
 * the banner when it goes, focus returns to where it was before it entered the banner. See
 * `createConsentBannerState` for the delay and motion rules; the store must outlive the banner.
 *
 * Each call owns its own banner and returns a function that removes it and stops following the
 * store; calling that function again does nothing. Without a `document` it does nothing. Call it
 * once the body exists (a deferred or module script) or pass `container`: with neither it throws
 * `LibraryError` `invalid_option` with `field: "container"`. Bad options throw `invalid_option`
 * naming the field.
 */
export function mountConsentBanner(
  store: ConsentStore,
  options: MountConsentBannerOptions = {},
): () => void {
  const content = resolveBannerOptions(options, ["container"]);
  if (typeof document === "undefined") return () => {};
  const container = options.container ?? document.body;
  if (!container) throw new LibraryError("invalid_option", { field: "container" });
  const banner = createConsentBannerState(store, {
    delayMs: content.delayMs,
    motion: autoMotionSource(container),
  });
  const focus = createFocusReturn();
  const onFocusIn = (event: FocusEvent): void => {
    if (element) focus.enter(element, event.relatedTarget);
  };
  let element: HTMLElement | undefined;
  const remove = (): void => {
    if (!element) return;
    focus.restore(element);
    element.remove();
    element = undefined;
  };
  const render = (): void => {
    const view = banner.getState();
    if (!view.open) remove();
    else if (!element) {
      element = build(container.ownerDocument, content, view.animate, store);
      element.addEventListener("focusin", onFocusIn);
      container.append(element);
    }
  };
  const unsubscribe = banner.subscribe(render);
  const stop = banner.start();
  render();
  let mounted = true;
  return () => {
    if (!mounted) return;
    mounted = false;
    unsubscribe();
    stop();
    remove();
  };
}

function build(
  doc: Document,
  content: ConsentBannerContent,
  animate: boolean,
  store: ConsentStore,
): HTMLElement {
  const part = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    name: string,
    text?: string,
  ): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag);
    node.dataset.part = name;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const root = part("section", CONSENT_PARTS.root);
  root.setAttribute("aria-label", content.label);
  if (animate) root.setAttribute(CONSENT_ANIMATING, "");
  const actions = part("div", CONSENT_PARTS.actions);
  if (content.privacyHref !== undefined) {
    const link = part("a", CONSENT_PARTS.privacy, content.privacyLabel);
    link.href = content.privacyHref;
    actions.append(link);
  }
  const decline = part("button", CONSENT_PARTS.decline, content.declineLabel);
  decline.type = "button";
  decline.addEventListener("click", () => store.decline());
  const accept = part("button", CONSENT_PARTS.accept, content.acceptLabel);
  accept.type = "button";
  accept.addEventListener("click", () => store.accept());
  actions.append(decline, accept);
  root.append(part("p", CONSENT_PARTS.message, content.message), actions);
  return root;
}
