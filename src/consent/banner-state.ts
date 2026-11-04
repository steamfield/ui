import { LibraryError } from "../internal/errors.ts";
import type { MotionSource } from "../internal/motion.ts";
import { unknownOption } from "../internal/options.ts";
import type { ConsentStore } from "./store.ts";

/** What the banner shows and how; every string has a neutral default. */
export interface ConsentBannerOptions {
  /** The text of the banner. Default "This site uses analytics to understand how it is used." */
  readonly message?: string;
  /** Default "Accept". */
  readonly acceptLabel?: string;
  /** Default "Decline". */
  readonly declineLabel?: string;
  /** The privacy link's text. Default "Privacy". */
  readonly privacyLabel?: string;
  /** Where the privacy link points. Without it there is no link. */
  readonly privacyHref?: string;
  /** The accessible name of the banner's region. Default "Analytics consent". */
  readonly label?: string;
  /**
   * Milliseconds before the banner slides in on page load, 0 to 2^31 - 1, so it doesn't compete
   * with the page. Default 1200. Ignored under reduced motion, where it shows at once.
   */
  readonly delayMs?: number;
}

/** The banner's options with every default applied. */
export interface ConsentBannerContent {
  readonly message: string;
  readonly acceptLabel: string;
  readonly declineLabel: string;
  readonly privacyLabel: string;
  readonly privacyHref: string | undefined;
  readonly label: string;
  readonly delayMs: number;
}

// One object rather than separate constants, so the bundler keeps a real import binding.
/** The `data-part` names the banner renders. Public API, like the CSS variables. */
export const CONSENT_PARTS: {
  readonly root: string;
  readonly message: string;
  readonly actions: string;
  readonly privacy: string;
  readonly decline: string;
  readonly accept: string;
} = Object.freeze({
  root: "consent",
  message: "consent-message",
  actions: "consent-actions",
  privacy: "consent-privacy",
  decline: "consent-decline",
  accept: "consent-accept",
});

/** Set on the banner's root when it slides in; the stylesheet animates only under it. */
export const CONSENT_ANIMATING = "data-sf-animating";

const KNOWN = [
  "message",
  "acceptLabel",
  "declineLabel",
  "privacyLabel",
  "privacyHref",
  "label",
  "delayMs",
];
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * Applies the defaults and checks the options. `extra` lists keys a binding accepts on top (the
 * DOM mount's `container`). A bad `delayMs`, a non-string label or an unknown key throws
 * `LibraryError` `invalid_option` naming the field.
 */
export function resolveBannerOptions(
  options: ConsentBannerOptions,
  extra: readonly string[] = [],
): ConsentBannerContent {
  const bad = unknownOption(options, [...KNOWN, ...extra]);
  if (bad) throw new LibraryError("invalid_option", { field: bad });
  const delayMs = options.delayMs ?? 1200;
  if (typeof delayMs !== "number" || !(delayMs >= 0 && delayMs <= MAX_TIMEOUT_MS)) {
    throw new LibraryError("invalid_option", { field: "delayMs" });
  }
  const text = (field: keyof ConsentBannerOptions, fallback: string): string => {
    const given: unknown = options[field];
    const value = given === undefined ? fallback : given;
    if (typeof value !== "string") throw new LibraryError("invalid_option", { field });
    return value;
  };
  return {
    message: text("message", "This site uses analytics to understand how it is used."),
    acceptLabel: text("acceptLabel", "Accept"),
    declineLabel: text("declineLabel", "Decline"),
    privacyLabel: text("privacyLabel", "Privacy"),
    privacyHref: options.privacyHref === undefined ? undefined : text("privacyHref", ""),
    label: text("label", "Analytics consent"),
    delayMs,
  };
}

/** Whether the banner is in the page, and whether it slides in. */
export interface ConsentBannerView {
  readonly open: boolean;
  readonly animate: boolean;
}

export interface ConsentBannerState {
  readonly getState: () => ConsentBannerView;
  readonly subscribe: (callback: () => void) => () => void;
  /**
   * Starts following the store and returns a function that stops (clearing any pending delay and
   * closing the banner). Restartable, for a binding that mounts twice (React StrictMode).
   */
  readonly start: () => () => void;
}

const CLOSED: ConsentBannerView = Object.freeze({ open: false, animate: false });

/**
 * The banner's rules, shared by `mountConsentBanner` and React `ConsentBanner`. The banner is open
 * only while the store is undecided. On start it opens after `delayMs` and slides in when motion
 * is allowed; under reduced motion it opens at once, without animation. A decision, from the
 * banner or anywhere else, closes it. A `reset()` opens it again straight away, since the page
 * has long since loaded.
 */
export function createConsentBannerState(
  store: ConsentStore,
  { delayMs, motion }: { readonly delayMs: number; readonly motion: MotionSource },
): ConsentBannerState {
  const listeners = new Set<() => void>();
  let view = CLOSED;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const set = (next: ConsentBannerView): void => {
    if (next.open === view.open && next.animate === view.animate) return;
    view = next;
    for (const listener of [...listeners]) listener();
  };
  const cancel = (): void => {
    clearTimeout(timer);
    timer = undefined;
  };
  const open = (delay: number): void => {
    cancel();
    if (!motion.get() || delay === 0) {
      set({ open: true, animate: motion.get() });
      return;
    }
    timer = setTimeout(() => {
      timer = undefined;
      set({ open: true, animate: motion.get() });
    }, delay);
  };

  return {
    getState: () => view,
    subscribe(callback) {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    start() {
      const unsubscribe = store.subscribe((state) => {
        if (state === null) open(0);
        else {
          cancel();
          set(CLOSED);
        }
      });
      if (store.getState() === null) open(delayMs);
      return () => {
        unsubscribe();
        cancel();
        set(CLOSED);
      };
    },
  };
}
