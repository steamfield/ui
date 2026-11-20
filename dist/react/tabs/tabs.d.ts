import { TabsActivation, TabsHash, TabsOrientation } from "../../tabs/core.js";
import { ReactElement, ReactNode } from "react";
export interface TabsProps {
  /** The selected value (controlled). */
  readonly value?: string;
  /**
   * The value selected first when uncontrolled. Its panel is marked `data-default`, which the
   * no-JS CSS shows. Default: the first tab.
   */
  readonly defaultValue?: string;
  /**
   * Called whenever the selection changes: a click, a key, or a hash read (on mount or
   * `hashchange`). In controlled mode this is how a hash on mount reaches the parent.
   */
  readonly onValueChange?: (value: string) => void;
  /** Default "auto". */
  readonly activation?: TabsActivation;
  /** Default "horizontal". */
  readonly orientation?: TabsOrientation;
  /**
   * Keep every panel's content rendered (hidden) after hydration, and in the server HTML.
   * Default true, so SSR and no-JS pages carry every panel. False renders only the selected one
   * (on the server: `defaultValue`'s panel, or every panel when there is no default).
   */
  readonly keepMounted?: boolean;
  /** Render tabs as `<a href="#panel-id">` so they work as deep links without JS. Default true. */
  readonly asAnchors?: boolean;
  /** Default false. See `TabsHash`. */
  readonly hash?: TabsHash;
  /** When set, a bubbling CustomEvent `{ value }` of this name fires when the reader picks a tab. */
  readonly eventName?: string;
  /**
   * The id prefix: panels get `${id}-${value}` and tabs `${id}-${value}-tab`. Pass a stable one
   * for deep links; the default comes from `useId`. Values must be valid in an id.
   */
  readonly id?: string;
  readonly className?: string;
  readonly children?: ReactNode;
}
/**
 * Accessible tabs that degrade to anchor links. The server HTML holds every panel and no
 * `aria-selected`; after hydration the root gets `data-live` and the component applies ARIA, the
 * roving tabindex and `hidden`. Keyboard and hash behavior are shared with `createTabs`.
 */
export declare function Tabs({ value, defaultValue, onValueChange, activation, orientation, keepMounted, asAnchors, hash, eventName, id, className, children }: TabsProps): ReactElement;
export interface TabListProps {
  readonly "aria-label"?: string;
  readonly "aria-labelledby"?: string;
  readonly className?: string;
  readonly children?: ReactNode;
}
/**
 * The `role="tablist"` container. It owns the keys across its tabs: arrows, Home and End move
 * focus, and Enter or Space select (`tabKeyAction`).
 */
export declare function TabList({ "aria-label": label, "aria-labelledby": labelledBy, className, children }: TabListProps): ReactElement;
export interface TabProps {
  /** Matches the `value` of one `TabPanel`. */
  readonly value: string;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly children?: ReactNode;
}
/** One tab: an anchor to its panel (default) or a button. */
export declare function Tab({ value, disabled, className, children }: TabProps): ReactElement;
export interface TabPanelProps {
  /** Matches the `value` of one `Tab`. */
  readonly value: string;
  readonly className?: string;
  readonly children?: ReactNode;
}
/**
 * A panel. It is always in the DOM so anchors resolve; after hydration inactive panels are
 * `hidden`. With `keepMounted={false}` only the selected panel renders its children.
 */
export declare function TabPanel({ value, className, children }: TabPanelProps): ReactElement;