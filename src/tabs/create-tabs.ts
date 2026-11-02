import {
  announce,
  isActivationKey,
  isTabDisabled,
  keyTarget,
  panelIdOf,
  type TabsActivation,
  type TabsHash,
  type TabsOrientation,
  tabForHash,
  tabsIn,
  tabValue,
  writeHash,
} from "./core.ts";

export interface CreateTabsOptions {
  /** Default "auto". */
  readonly activation?: TabsActivation;
  /** Which arrow keys move between tabs. Default: the tablist's `aria-orientation`, else horizontal. */
  readonly orientation?: TabsOrientation;
  /** Default false. See `TabsHash`. */
  readonly hash?: TabsHash;
  /**
   * Called with the new value whenever the selection changes after setup: a click, a key, or a
   * hash change (including a hash read on setup that differs from the default).
   */
  readonly onValueChange?: (value: string) => void;
  /**
   * When set, a bubbling CustomEvent of this name is dispatched from `root` each time the reader
   * picks a tab (click or key, not a hash read). Its detail is `{ value }`.
   */
  readonly eventName?: string;
}

/**
 * Turns server-rendered tab markup under `root` into ARIA tabs. The markup is a `[role="tablist"]`
 * of `[role="tab"]` elements, each naming its panel with `aria-controls` or `href="#panel-id"`.
 * Without JavaScript, anchors plus `tabs/styles.css` keep every panel reachable by deep link.
 *
 * On setup the root gets `data-live`, which turns off the CSS fallback; the controller then owns
 * `aria-selected`, the roving `tabindex`, `data-state` and each panel's `hidden`. A tab's value is
 * its `data-value`, or its panel id. Returns a function that removes the listeners and puts back
 * what setup touched (`data-live`, `aria-selected`, `tabindex`, `data-state`, `hidden`,
 * `aria-controls`), so the markup is as it was before.
 */
export function createTabs(root: HTMLElement, options: CreateTabsOptions = {}): () => void {
  const list = root.querySelector<HTMLElement>('[role="tablist"]');
  if (!list) return () => {};
  const activation = options.activation ?? "auto";
  const orientation =
    options.orientation ??
    (list.getAttribute("aria-orientation") === "vertical" ? "vertical" : "horizontal");
  const hash = options.hash ?? false;
  const view = root.ownerDocument.defaultView;

  const restore = snapshot(root, list);
  for (const tab of tabsIn(list)) {
    const panel = panelIdOf(tab);
    if (panel && !tab.hasAttribute("aria-controls")) tab.setAttribute("aria-controls", panel);
  }
  const initial = tabsIn(list).find((tab) => tab.getAttribute("aria-selected") === "true");
  let current = initial && !isTabDisabled(initial) ? initial : firstEnabled(list);
  apply(list, current);
  root.setAttribute("data-live", "");

  const change = (tab: HTMLElement, picked: boolean, replace = false): void => {
    if (tab === current || isTabDisabled(tab)) return;
    current = tab;
    apply(list, tab);
    const value = tabValue(tab) ?? "";
    options.onValueChange?.(value);
    if (!picked) return;
    writeHash(panelIdOf(tab) ?? "", hash, replace);
    announce(root, options.eventName, value);
  };

  const onClick = (event: MouseEvent): void => {
    const tab = (event.target as Element).closest<HTMLElement>('[role="tab"]');
    if (!tab || !list.contains(tab)) return;
    event.preventDefault();
    change(tab, true);
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    const from = event.target as Element;
    if (isActivationKey(event.key)) {
      const tab = from.closest<HTMLElement>('[role="tab"]');
      if (!tab) return;
      event.preventDefault();
      change(tab, true);
      return;
    }
    const target = keyTarget(list, from, event.key, orientation);
    if (!target) return;
    event.preventDefault();
    target.focus();
    if (activation === "auto") change(target, true, true);
  };
  const onHash = (): void => {
    const tab = tabForHash(list, view?.location.hash ?? "");
    if (tab) change(tab, false);
  };

  list.addEventListener("click", onClick);
  list.addEventListener("keydown", onKeyDown);
  if (hash) {
    onHash();
    view?.addEventListener("hashchange", onHash);
  }

  return () => {
    list.removeEventListener("click", onClick);
    list.removeEventListener("keydown", onKeyDown);
    view?.removeEventListener("hashchange", onHash);
    restore();
  };
}

const TOUCHED_TAB = ["aria-selected", "tabindex", "data-state", "aria-controls"] as const;
const TOUCHED_PANEL = ["hidden", "data-state"] as const;

/** Records the attributes setup is about to change and returns a function that puts them back. */
function snapshot(root: HTMLElement, list: HTMLElement): () => void {
  const saved: [Element, string, string | null][] = [[root, "data-live", null]];
  const save = (el: Element, names: readonly string[]): void => {
    for (const name of names) saved.push([el, name, el.getAttribute(name)]);
  };
  for (const tab of tabsIn(list)) {
    save(tab, TOUCHED_TAB);
    const id = panelIdOf(tab);
    const panel = id ? list.ownerDocument.getElementById(id) : null;
    if (panel) save(panel, TOUCHED_PANEL);
  }
  return () => {
    for (const [el, name, value] of saved) {
      if (value === null) el.removeAttribute(name);
      else el.setAttribute(name, value);
    }
  };
}

function firstEnabled(list: ParentNode): HTMLElement | undefined {
  return tabsIn(list).find((tab) => !isTabDisabled(tab));
}

function apply(list: HTMLElement, selected: HTMLElement | undefined): void {
  for (const tab of tabsIn(list)) {
    const active = tab === selected;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    tab.dataset.state = active ? "active" : "inactive";
    const id = panelIdOf(tab);
    const panel = id ? list.ownerDocument.getElementById(id) : null;
    if (!panel) continue;
    panel.hidden = !active;
    panel.dataset.state = active ? "active" : "inactive";
  }
}
