// From OpenData's ConsentBanner, with the delay, motion and visibility rules moved into
// `createConsentBannerState` (shared with `mountConsentBanner`), every string made a prop, and the
// Tailwind classes replaced by the `data-part` contract that `consent/styles.css` styles.
import { type ReactElement, useEffect, useState } from "react";
import {
  CONSENT_ANIMATING,
  CONSENT_PARTS,
  type ConsentBannerOptions,
  type ConsentBannerView,
  createConsentBannerState,
  resolveBannerOptions,
} from "../../consent/banner-state.ts";
import type { ConsentStore } from "../../consent/store.ts";
import { autoMotionSource } from "../../internal/motion.ts";

export interface ConsentBannerProps extends ConsentBannerOptions {
  readonly store: ConsentStore;
}

const CLOSED: ConsentBannerView = { open: false, animate: false };

/**
 * The consent banner as a React component: the same markup and rules as `mountConsentBanner`.
 * It renders nothing on the server and in the first client render, then opens while `store` is
 * undecided. Bad props throw `LibraryError` `invalid_option` during render.
 */
export function ConsentBanner({ store, ...options }: ConsentBannerProps): ReactElement | null {
  const content = resolveBannerOptions(options);
  const [view, setView] = useState<ConsentBannerView>(CLOSED);

  useEffect(() => {
    const banner = createConsentBannerState(store, {
      delayMs: content.delayMs,
      motion: autoMotionSource(document.body),
    });
    const unsubscribe = banner.subscribe(() => setView(banner.getState()));
    const stop = banner.start();
    setView(banner.getState());
    return () => {
      unsubscribe();
      stop();
    };
  }, [store, content.delayMs]);

  if (!view.open) return null;
  return (
    <section
      aria-label={content.label}
      data-part={CONSENT_PARTS.root}
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
