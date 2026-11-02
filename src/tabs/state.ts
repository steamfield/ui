import {
  announce,
  decodeHash,
  type TabEntry,
  type TabsHash,
  type TabsVia,
  writeHash,
} from "./core.ts";

// The selection state machine behind `createTabs` and the React `Tabs`. It knows nothing about
// elements or React: each binding describes its tabs as `TabEntry`s (`tabEntries` in `core.ts`)
// and applies `getState()`.

/** The minimal window the controller reads the hash from. */
export type HashSource = Pick<Window, "location" | "addEventListener" | "removeEventListener">;

export interface TabsStateOptions {
  /** The current tabs, in order. Called on demand, so it can read live markup. */
  readonly tabs: () => readonly TabEntry[];
  /** The explicit first selection: a controlled `value`, or the tab marked `aria-selected`. */
  readonly selected?: string | undefined;
  /** The fallback first selection: `defaultValue`, or the tab whose panel has `data-default`. */
  readonly defaultValue?: string | undefined;
  /**
   * The controlled value. While it returns a string, `getState()` returns it, and `select` only
   * reports (callback, hash, event) and leaves the stored value alone for the parent to change.
   */
  readonly controlled?: () => string | undefined;
  /** Read on each use, so a binding can pass a getter that follows its latest props. */
  readonly hash?: TabsHash;
  readonly eventName?: string | undefined;
  readonly onValueChange?: ((value: string) => void) | undefined;
  /** Where the CustomEvent is dispatched from. */
  readonly target?: () => EventTarget | null;
  /** Where the hash is read and `hashchange` heard. Default `globalThis`. */
  readonly window?: HashSource | null;
}

export interface TabsState {
  /** The selected value: the controlled one, else the stored one. Undefined until resolved. */
  readonly getState: () => string | undefined;
  readonly subscribe: (callback: () => void) => () => void;
  /** Selects `value` unless it is already selected or names a disabled tab. */
  readonly select: (value: string, how: { readonly via: TabsVia }) => void;
  /**
   * Resolves and stores the first selection without reporting. One order for both bindings: the
   * explicit value (a controlled `value`, or `aria-selected` in markup), then the default
   * (`defaultValue`, or the `data-default` panel), then the first enabled tab. A candidate naming
   * a disabled or missing tab is skipped. Runs once; later calls do nothing.
   */
  readonly init: () => void;
  /**
   * When `hash` is on: selects the enabled tab whose panel `location.hash` names, now and on
   * every `hashchange`. Returns the disconnect.
   */
  readonly connectHash: () => () => void;
}

export function createTabsState(options: TabsStateOptions): TabsState {
  // Before `init`, the unresolved candidate: what the server rendered as selected.
  let stored = options.selected ?? options.defaultValue;
  let initialized = false;
  const listeners = new Set<() => void>();

  const getState = (): string | undefined => options.controlled?.() ?? stored;

  const store = (value: string | undefined): void => {
    if (options.controlled?.() !== undefined || value === stored) return;
    stored = value;
    for (const listener of [...listeners]) listener();
  };

  const select = (value: string, { via }: { readonly via: TabsVia }): void => {
    if (value === getState()) return;
    const tab = options.tabs().find((entry) => entry.value === value);
    if (tab?.disabled) return;
    store(value);
    options.onValueChange?.(value);
    if (via === "hash") return;
    writeHash(tab?.panelId ?? "", options.hash ?? false, via === "keyboard");
    announce(options.target?.() ?? null, options.eventName, value);
  };

  return {
    getState,
    subscribe: (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    select,
    init: () => {
      if (initialized) return;
      initialized = true;
      const tabs = options.tabs();
      const enabled = (value: string | undefined): boolean =>
        tabs.some((tab) => tab.value === value && !tab.disabled);
      if (enabled(options.selected)) store(options.selected);
      else if (enabled(options.defaultValue)) store(options.defaultValue);
      else store(tabs.find((tab) => !tab.disabled)?.value);
    },
    connectHash: () => {
      const source =
        options.window === undefined ? (globalThis as unknown as HashSource) : options.window;
      if (!options.hash || !source) return () => {};
      const readHash = (): void => {
        const hash = source.location.hash;
        if (hash.length < 2) return;
        const id = decodeHash(hash);
        const tab = options.tabs().find((entry) => entry.panelId === id && !entry.disabled);
        if (tab) select(tab.value, { via: "hash" });
      };
      readHash();
      source.addEventListener("hashchange", readHash);
      return () => source.removeEventListener("hashchange", readHash);
    },
  };
}
