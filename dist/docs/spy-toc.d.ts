export interface SpyTocOptions {
  /** Selector for the table-of-contents links; each needs an `href="#<heading id>"`. Default `[data-toc-link]`. */
  readonly linkSelector?: string;
  /** The `aria-current` value set on the active link. Default "location". */
  readonly current?: string;
  /** IntersectionObserver `rootMargin`. The default counts a heading as read once it passes the top 30% of the viewport. */
  readonly rootMargin?: string;
}
/**
 * Marks the "On this page" link for the section being read with `aria-current="location"`.
 * Without IntersectionObserver (or JavaScript) the links still work; nothing is marked. When every
 * heading scrolls out of view the last mark stays.
 *
 * Returns a function that stops observing.
 */
export declare function spyToc(root: Document | Element, options?: SpyTocOptions): () => void;