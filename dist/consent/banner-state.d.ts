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