import { ConsentBannerOptions } from "../../consent/banner-state.js";
import { ConsentStore } from "../../consent/store.js";
import { ReactElement } from "react";
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
export declare function ConsentBanner({ store, ...options }: ConsentBannerProps): ReactElement | null;