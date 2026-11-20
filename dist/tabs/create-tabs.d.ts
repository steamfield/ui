import { TabsActivation, TabsHash, TabsOrientation } from "./core.js";
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
 * its `data-value`, or its panel id. The first selection is the enabled tab marked
 * `aria-selected="true"`, else the enabled tab whose panel has `data-default` (the panel the no-JS
 * CSS shows), else the first enabled tab (`init` in `state.ts`). Returns a function
 * that removes the listeners and puts back what setup touched (`data-live`, `aria-selected`,
 * `tabindex`, `data-state`, `hidden`, `aria-controls`), so the markup is as it was before.
 */
export declare function createTabs(root: HTMLElement, options?: CreateTabsOptions): () => void;