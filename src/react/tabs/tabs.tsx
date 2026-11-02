import {
  createContext,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  isActivationKey,
  keyTarget,
  type TabsActivation,
  type TabsHash,
  type TabsOrientation,
  tabEntries,
  tabValue,
} from "../../tabs/core.ts";
import { createTabsState } from "../../tabs/state.ts";

interface TabsContextValue {
  readonly base: string;
  /** The selected value; before hydration, the default the server rendered. */
  readonly selected: string | undefined;
  /** False on the server and in the first client render, so the markup matches no-JS HTML. */
  readonly hydrated: boolean;
  readonly activation: TabsActivation;
  readonly orientation: TabsOrientation;
  readonly keepMounted: boolean;
  readonly asAnchors: boolean;
  /** The value the server rendered as selected; its panel is marked `data-default` for the CSS. */
  readonly initial: string | undefined;
  /** `keyboard` is an arrow-key move under auto activation, recorded with `replaceState`. */
  readonly pick: (value: string, via: "keyboard" | "pointer") => void;
}

// Outside <Tabs> the parts render their static, pre-hydration markup rather than throwing.
const TabsContext = createContext<TabsContextValue>({
  base: "tabs",
  selected: undefined,
  hydrated: false,
  activation: "auto",
  orientation: "horizontal",
  keepMounted: true,
  asAnchors: true,
  initial: undefined,
  pick: () => {},
});

const panelId = (base: string, value: string): string => `${base}-${value}`;
const tabId = (base: string, value: string): string => `${base}-${value}-tab`;

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
export function Tabs({
  value,
  defaultValue,
  onValueChange,
  activation = "auto",
  orientation = "horizontal",
  keepMounted = true,
  asAnchors = true,
  hash = false,
  eventName,
  id,
  className,
  children,
}: TabsProps): ReactElement {
  const generated = useId();
  const base = id ?? generated;
  const root = useRef<HTMLDivElement>(null);
  const [hydrated, setHydrated] = useState(false);
  const [initial] = useState(value ?? defaultValue);

  const latest = useRef({ value, onValueChange, hash, eventName });
  latest.current = { value, onValueChange, hash, eventName };
  const [state] = useState(() =>
    createTabsState({
      tabs: () => (root.current ? tabEntries(root.current) : []),
      selected: value,
      defaultValue,
      controlled: () => latest.current.value,
      get hash() {
        return latest.current.hash;
      },
      get eventName() {
        return latest.current.eventName;
      },
      onValueChange: (next) => latest.current.onValueChange?.(next),
      target: () => root.current,
    }),
  );
  const selected = useSyncExternalStore(state.subscribe, state.getState, state.getState);
  const pick = (next: string, via: "keyboard" | "pointer"): void => state.select(next, { via });

  useEffect(() => {
    state.init();
    setHydrated(true);
  }, [state]);
  useEffect(() => (hash ? state.connectHash() : undefined), [state, hash]);

  return (
    <TabsContext.Provider
      value={{
        base,
        selected,
        hydrated,
        activation,
        orientation,
        keepMounted,
        asAnchors,
        initial,
        pick,
      }}
    >
      <div
        ref={root}
        className={className}
        data-part="tabs"
        data-orientation={orientation}
        data-live={hydrated ? "" : undefined}
      >
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export interface TabListProps {
  readonly "aria-label"?: string;
  readonly "aria-labelledby"?: string;
  readonly className?: string;
  readonly children?: ReactNode;
}

/** The `role="tablist"` container. It owns arrow, Home and End navigation across its tabs. */
export function TabList({
  "aria-label": label,
  "aria-labelledby": labelledBy,
  className,
  children,
}: TabListProps): ReactElement {
  const { orientation, activation, pick } = useContext(TabsContext);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const target = keyTarget(event.currentTarget, event.target as Element, event.key, orientation);
    if (!target) return;
    event.preventDefault();
    target.focus();
    const next = tabValue(target);
    if (activation === "auto" && next !== null) pick(next, "keyboard");
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      aria-labelledby={labelledBy}
      aria-orientation={orientation}
      className={className}
      data-part="tab-list"
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}

export interface TabProps {
  /** Matches the `value` of one `TabPanel`. */
  readonly value: string;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly children?: ReactNode;
}

/** One tab: an anchor to its panel (default) or a button. */
export function Tab({ value, disabled = false, className, children }: TabProps): ReactElement {
  const { base, selected, hydrated, asAnchors, pick } = useContext(TabsContext);
  const active = selected === value;
  const activate = (event: MouseEvent | KeyboardEvent): void => {
    event.preventDefault();
    if (!disabled) pick(value, "pointer");
  };
  const props = {
    id: tabId(base, value),
    role: "tab",
    "aria-controls": panelId(base, value),
    "aria-selected": hydrated ? active : undefined,
    tabIndex: hydrated && !active ? -1 : 0,
    className,
    "data-part": "tab",
    "data-value": value,
    "data-state": stateOf(hydrated, active),
    onClick: activate,
    onKeyDown: (event: KeyboardEvent) => {
      if (isActivationKey(event.key)) activate(event);
    },
  } as const;
  if (asAnchors) {
    return (
      <a
        {...props}
        href={disabled ? undefined : `#${panelId(base, value)}`}
        aria-disabled={disabled || undefined}
      >
        {children}
      </a>
    );
  }
  return (
    <button {...props} type="button" disabled={disabled}>
      {children}
    </button>
  );
}

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
export function TabPanel({ value, className, children }: TabPanelProps): ReactElement {
  const { base, selected, hydrated, keepMounted, initial } = useContext(TabsContext);
  const active = selected === value;
  return (
    <div
      id={panelId(base, value)}
      role="tabpanel"
      aria-labelledby={tabId(base, value)}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: APG tabs make the panel focusable.
      tabIndex={0}
      hidden={hydrated && !active}
      className={className}
      data-part="tab-panel"
      data-default={initial === value ? "" : undefined}
      data-state={stateOf(hydrated, active)}
    >
      {/* With no default chosen, the server can't know which panel CSS will show: render all. */}
      {keepMounted || active || (!hydrated && selected === undefined) ? children : null}
    </div>
  );
}

/** `data-state` is applied only after hydration, like `aria-selected`. */
function stateOf(hydrated: boolean, active: boolean): "active" | "inactive" | undefined {
  if (!hydrated) return undefined;
  return active ? "active" : "inactive";
}
