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
 * undecided. Motion is read from where the banner renders, so a `[data-sf-motion="reduce"]`
 * ancestor turns off its entrance (it can't see its ancestors before it renders, so the delay
 * still applies there). Bad props throw `LibraryError` `invalid_option` during render.
 */
export function ConsentBanner({ store, ...options }: ConsentBannerProps): ReactElement | null {
  const content = resolveBannerOptions(options);
  const [view, setView] = useState<ConsentBannerView>(CLOSED);
  const [motionHere, setMotionHere] = useState(true);
  const root = useRef<HTMLElement>(null);
  const [focus] = useState(createFocusReturn);

  useEffect(() => {
    const banner = createConsentBannerState(store, {
      delayMs: content.delayMs,
      motion: { get: () => autoMotionSource(root.current).get(), subscribe: () => () => {} },
    });
    const unsubscribe = banner.subscribe(() => {
      const next = banner.getState();
      // Move focus out before React removes the element.
      if (!next.open) focus.restore(root.current);
      setView(next);
    });
    const stop = banner.start();
    setView(banner.getState());
    return () => {
      unsubscribe();
      stop();
    };
  }, [store, content.delayMs, focus]);

  // Once rendered, the banner can see its own ancestors; this runs before paint.
  useLayoutEffect(() => {
    if (view.open) setMotionHere(autoMotionSource(root.current).get());
  }, [view.open]);

  if (!view.open) return null;
  const onFocus = (event: FocusEvent<HTMLElement>): void =>
    focus.enter(event.currentTarget, event.relatedTarget);
  return (
    <section
      ref={root}
      aria-label={content.label}
      data-part={CONSENT_PARTS.root}
      onFocus={onFocus}
      {...(view.animate && motionHere ? { [CONSENT_ANIMATING]: "" } : {})}
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
