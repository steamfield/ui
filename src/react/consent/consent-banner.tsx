// From OpenData's ConsentBanner, with the delay, motion and visibility rules moved into
// `createConsentBannerState` (shared with `mountConsentBanner`), every string made a prop, and the
// Tailwind classes replaced by the `data-part` contract that `consent/styles.css` styles.
import {
  type FocusEvent,
  type ReactElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  CLOSED,
  CONSENT_ANIMATING,
  CONSENT_PARTS,
  type ConsentBannerOptions,
  type ConsentBannerState,
  type ConsentBannerView,
  createConsentBannerState,
  resolveBannerOptions,
} from "../../consent/banner-state.ts";
import { createFocusReturn } from "../../consent/focus.ts";
import type { ConsentStore } from "../../consent/store.ts";
import { autoMotionSource } from "../../internal/motion.ts";

export interface ConsentBannerProps extends ConsentBannerOptions {
  /**
   * The store to follow. Keep it stable (create it once, outside render or in `useState`): a new
   * store restarts the banner, delay included. It must outlive the banner.
   */
  readonly store: ConsentStore;
}

/**
 * The consent banner as a React component: the same markup and rules as `mountConsentBanner`.
 * It renders nothing on the server and in the first client render, then opens while `store` is
 * undecided. The controller decides the entrance once the banner has rendered, from where it
 * sits, so a `[data-sf-motion="reduce"]` ancestor turns it off (the delay still applies there:
 * the banner can't see its ancestors before it renders). Focus returns as in
 * `mountConsentBanner`, also when the component unmounts or `store` changes. Bad props throw
 * `LibraryError` `invalid_option` during render.
 */
export function ConsentBanner({ store, ...options }: ConsentBannerProps): ReactElement | null {
  const content = resolveBannerOptions(options);
  const [view, setView] = useState<ConsentBannerView>(CLOSED);
  const root = useRef<HTMLElement>(null);
  const controller = useRef<ConsentBannerState | null>(null);
  const [focus] = useState(createFocusReturn);

  useEffect(() => {
    const banner = createConsentBannerState(store, {
      delayMs: content.delayMs,
      // Read from the banner once it has rendered; before that only the media query counts.
      motion: { get: () => autoMotionSource(root.current).get(), subscribe: () => () => {} },
    });
    controller.current = banner;
    const apply = (): void => {
      const next = banner.getState();
      // Move focus out before React removes the element.
      if (!next.open) focus.restore(root.current);
      setView(next);
    };
    const unsubscribe = banner.subscribe(apply);
    const stop = banner.start();
    apply();
    return () => {
      unsubscribe();
      stop();
    };
  }, [store, content.delayMs, focus]);

  // The banner is in the page and not yet painted: let the controller decide the entrance.
  useLayoutEffect(() => {
    if (view.open) controller.current?.rendered();
  }, [view]);

  // On unmount this runs before React removes the element, while focus can still be moved.
  useLayoutEffect(() => () => focus.restore(root.current), [focus]);

  if (!view.open) return null;
  const onFocus = (event: FocusEvent<HTMLElement>): void =>
    focus.enter(event.currentTarget, event.relatedTarget);
  return (
    <section
      ref={root}
      aria-label={content.label}
      data-part={CONSENT_PARTS.root}
      onFocus={onFocus}
      {...(view.animate ? { [CONSENT_ANIMATING]: "" } : {})}
    >
      <p data-part={CONSENT_PARTS.message}>{content.message}</p>
      <div data-part={CONSENT_PARTS.actions}>
        {content.privacyHref === undefined ? null : (
          <a href={content.privacyHref} data-part={CONSENT_PARTS.privacy}>
            {content.privacyLabel}
          </a>
        )}
        <button type="button" data-part={CONSENT_PARTS.decline} onClick={store.decline}>
          {content.declineLabel}
        </button>
        <button type="button" data-part={CONSENT_PARTS.accept} onClick={store.accept}>
          {content.acceptLabel}
        </button>
      </div>
    </section>
  );
}
