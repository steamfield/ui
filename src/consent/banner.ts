import { autoMotionSource } from "../internal/motion.ts";
import {
  CONSENT_ANIMATING,
  CONSENT_PARTS,
  type ConsentBannerContent,
  type ConsentBannerOptions,
  createConsentBannerState,
  resolveBannerOptions,
} from "./banner-state.ts";
import type { ConsentStore } from "./store.ts";

export interface MountConsentBannerOptions extends ConsentBannerOptions {
  /** Where the banner is appended. Default `document.body`. */
  readonly container?: Element;
}

/** Live mounts per store, so a second mount shares the first banner instead of adding another. */
const mounts = new WeakMap<ConsentStore, { count: number; stop: () => void }>();

/**
 * Shows a consent banner while `store` is undecided: a non-modal labelled region (not a dialog,
 * no focus trap, and it never takes focus) with the message, an optional privacy link, a decline
 * and an accept button. The buttons call `store.decline()` and `store.accept()`; any decision,
 * from the banner or elsewhere, removes it, and `store.reset()` brings it back. See
 * `createConsentBannerState` for the delay and motion rules.
 *
 * Mounting again for a store that already has a banner adds no second banner; the banner goes
 * when every returned function has been called. Without a `document` it does nothing. Bad
 * options throw `LibraryError` `invalid_option` naming the field.
 */
export function mountConsentBanner(
  store: ConsentStore,
  options: MountConsentBannerOptions = {},
): () => void {
  const content = resolveBannerOptions(options, ["container"]);
  if (typeof document === "undefined") return () => {};
  const existing = mounts.get(store);
  if (existing) {
    existing.count += 1;
    return once(() => release(store));
  }
  const container = options.container ?? document.body;
  const banner = createConsentBannerState(store, {
    delayMs: content.delayMs,
    motion: autoMotionSource(container),
  });
  let element: HTMLElement | undefined;
  const render = (): void => {
    const view = banner.getState();
    if (!view.open) {
      element?.remove();
      element = undefined;
    } else if (!element) {
      element = build(container.ownerDocument, content, view.animate, store);
      container.append(element);
    }
  };
  const unsubscribe = banner.subscribe(render);
  const stopBanner = banner.start();
  render();
  mounts.set(store, {
    count: 1,
    stop() {
      unsubscribe();
      stopBanner();
      element?.remove();
      element = undefined;
    },
  });
  return once(() => release(store));
}

function release(store: ConsentStore): void {
  const mount = mounts.get(store);
  if (!mount) return;
  mount.count -= 1;
  if (mount.count > 0) return;
  mounts.delete(store);
  mount.stop();
}

function once(fn: () => void): () => void {
  let called = false;
  return () => {
    if (called) return;
    called = true;
    fn();
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
