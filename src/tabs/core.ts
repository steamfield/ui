// Keyboard, hash and event logic shared by `createTabs` and the React `Tabs`. Both read the
// rendered tabs from the DOM, so the two stay in step on what counts as a tab, a disabled tab or a
// panel's id.

export type TabsOrientation = "horizontal" | "vertical";

/**
 * `auto` selects a tab as soon as an arrow key focuses it. `manual` only moves focus; Enter,
 * Space or a click selects. Manual suits panels that are costly to show or tabs that report to
 * analytics, since skimming with the keyboard doesn't count as a change.
 */
export type TabsActivation = "auto" | "manual";

/**
 * `false` leaves the URL alone. `true` reads `location.hash` on mount and on `hashchange`, and
 * records each selection with `history.pushState` (Back returns to the previous tab), except that
 * arrow-key moves under auto activation use `replaceState` so a keyboard walk along the tabs
 * doesn't fill the history. `"replace"` reads the same way but always records with
 * `history.replaceState`, so tab switches add no history.
 */
export type TabsHash = boolean | "replace";

/** What the optional CustomEvent carries: the selected tab's value. */
export interface TabsChangeDetail {
  readonly value: string;
}

const TAB = '[role="tab"]';

/** The tabs under `scope`, in document order. */
export function tabsIn(scope: ParentNode): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>(TAB)];
}

export function isTabDisabled(tab: Element): boolean {
  return tab.hasAttribute("disabled") || tab.getAttribute("aria-disabled") === "true";
}

/** The id of the panel a tab controls: `aria-controls`, or the fragment of an anchor's `href`. */
export function panelIdOf(tab: Element): string | null {
  const controls = tab.getAttribute("aria-controls");
  if (controls) return controls;
  const href = tab.getAttribute("href");
  return href?.startsWith("#") && href.length > 1 ? decodeHash(href) : null;
}

/** A tab's value: its `data-value`, falling back to the id of the panel it controls. */
export function tabValue(tab: HTMLElement): string | null {
  return tab.dataset.value ?? panelIdOf(tab);
}

/** True for the keys that select the focused tab under manual activation. */
export function isActivationKey(key: string): boolean {
  return key === "Enter" || key === " ";
}

/**
 * The tab a key press should move focus to, or null when the key isn't a tab key. Arrows follow
 * `orientation` and wrap; Home and End jump to the ends. Disabled tabs are skipped.
 */
export function keyTarget(
  list: ParentNode,
  from: Element,
  key: string,
  orientation: TabsOrientation,
): HTMLElement | null {
  const tabs = tabsIn(list).filter((tab) => !isTabDisabled(tab));
  const current = from.closest<HTMLElement>(TAB);
  const index = current ? tabs.indexOf(current) : -1;
  if (index === -1) return null;
  const next = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
  const prev = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
  if (key === next) return tabs[(index + 1) % tabs.length] ?? null;
  if (key === prev) return tabs[(index - 1 + tabs.length) % tabs.length] ?? null;
  if (key === "Home") return tabs[0] ?? null;
  if (key === "End") return tabs[tabs.length - 1] ?? null;
  return null;
}

/** The enabled tab under `scope` whose panel the hash names, if any. */
export function tabForHash(scope: ParentNode, hash: string): HTMLElement | null {
  if (hash.length < 2) return null;
  const id = decodeHash(hash);
  return tabsIn(scope).find((tab) => panelIdOf(tab) === id && !isTabDisabled(tab)) ?? null;
}

/**
 * Records the selected panel in the URL. A no-op when `mode` is false. `replace` forces
 * `replaceState` even when `mode` is true (arrow-key moves under auto activation).
 */
export function writeHash(panelId: string, mode: TabsHash, replace = false): void {
  if (!mode) return;
  const history = globalThis.history;
  const url = `#${encodeURIComponent(panelId)}`;
  if (mode === "replace" || replace) history?.replaceState(history.state, "", url);
  else history?.pushState(null, "", url);
}

/** Dispatches the change as a bubbling CustomEvent from `target`, when a name is configured. */
export function announce(
  target: EventTarget | null,
  eventName: string | undefined,
  value: string,
): void {
  if (!target || !eventName) return;
  const detail: TabsChangeDetail = { value };
  target.dispatchEvent(new CustomEvent(eventName, { bubbles: true, detail }));
}

function decodeHash(hash: string): string {
  const raw = hash.slice(1);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
