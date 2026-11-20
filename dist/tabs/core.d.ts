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