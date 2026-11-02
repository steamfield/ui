export interface SpyTocOptions {
  /** Selector for the table-of-contents links; each needs an `href="#<heading id>"`. Default `[data-toc-link]`. */
  readonly linkSelector?: string;
  /** The `aria-current` value set on the active link. Default "location". */
  readonly current?: string;
  /** IntersectionObserver `rootMargin`. The default counts a heading as read once it passes the top 30% of the viewport. */
  readonly rootMargin?: string;
}

function hashId(link: HTMLAnchorElement): string {
  const raw = link.hash.slice(1);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Marks the "On this page" link for the section being read with `aria-current="location"`.
 * Without IntersectionObserver (or JavaScript) the links still work; nothing is marked. When every
 * heading scrolls out of view the last mark stays.
 *
 * Returns a function that stops observing.
 */
export function spyToc(root: Document | Element, options: SpyTocOptions = {}): () => void {
  const doc = root.ownerDocument ?? (root as Document);
  const current = options.current ?? "location";
  const links = new Map<string, HTMLAnchorElement>();
  for (const link of root.querySelectorAll<HTMLAnchorElement>(
    options.linkSelector ?? "[data-toc-link]",
  )) {
    links.set(hashId(link), link);
  }
  const headings = [...links.keys()]
    .map((id) => doc.getElementById(id))
    .filter((heading) => heading !== null);
  const Observer = doc.defaultView?.IntersectionObserver;
  if (headings.length === 0 || !Observer) return () => undefined;

  const visible = new Set<string>();
  const mark = (): void => {
    const active = headings.find((heading) => visible.has(heading.id))?.id;
    if (active === undefined) return;
    for (const [id, link] of links) {
      if (id === active) link.setAttribute("aria-current", current);
      else link.removeAttribute("aria-current");
    }
  };
  const observer = new Observer(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target.id);
        else visible.delete(entry.target.id);
      }
      mark();
    },
    { rootMargin: options.rootMargin ?? "0px 0px -70% 0px" },
  );
  for (const heading of headings) observer.observe(heading);
  return () => observer.disconnect();
}
