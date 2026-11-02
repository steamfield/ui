import { beforeEach, describe, expect, test, vi } from "vitest";
import type { TabEntry } from "./core.ts";
import { createTabsState, type TabsStateOptions } from "./state.ts";

const TABS: readonly TabEntry[] = [
  { value: "a", disabled: false, panelId: "p-a" },
  { value: "b", disabled: false, panelId: "p-b" },
  { value: "c", disabled: true, panelId: "p-c" },
  { value: "d", disabled: false, panelId: "p d" },
];

const make = (options: Partial<TabsStateOptions> = {}) =>
  createTabsState({ tabs: () => TABS, ...options });

beforeEach(() => {
  history.replaceState(null, "", "/");
});

// The first selection after `init`.
const resolve = (
  selected: string | undefined,
  defaultValue: string | undefined,
  tabs: readonly TabEntry[] = TABS,
): string | undefined => {
  const state = createTabsState({ tabs: () => tabs, selected, defaultValue });
  state.init();
  return state.getState();
};

describe("first selection", () => {
  test("the explicit value wins over the default", () => {
    expect(resolve("d", "b")).toBe("d");
  });

  test("then the default", () => {
    expect(resolve(undefined, "b")).toBe("b");
  });

  test("then the first enabled tab", () => {
    expect(resolve(undefined, undefined)).toBe("a");
    expect(resolve(undefined, undefined, TABS.slice(2))).toBe("d");
  });

  test("a disabled or missing candidate is skipped", () => {
    expect(resolve("c", "b")).toBe("b");
    expect(resolve("zz", "c")).toBe("a");
  });

  test("no enabled tabs resolves to nothing", () => {
    expect(resolve("a", "b", [])).toBeUndefined();
    expect(resolve(undefined, undefined, [TABS[2] as TabEntry])).toBeUndefined();
  });
});

describe("init", () => {
  test("before init the state is the unresolved candidate the server rendered", () => {
    expect(make({ selected: "c", defaultValue: "b" }).getState()).toBe("c");
    expect(make({ defaultValue: "c" }).getState()).toBe("c");
    expect(make().getState()).toBeUndefined();
  });

  test("resolves once, notifies subscribers, and reports nothing", () => {
    const onValueChange = vi.fn();
    const listener = vi.fn();
    const state = make({ defaultValue: "c", onValueChange, hash: true, eventName: "x" });
    state.subscribe(listener);
    state.init();
    expect(state.getState()).toBe("a");
    expect(listener).toHaveBeenCalledTimes(1);
    state.select("b", { via: "pointer" });
    state.init();
    expect(state.getState()).toBe("b");
    expect(onValueChange).toHaveBeenCalledTimes(1);
  });
});

describe("select", () => {
  test("ignores the current value and disabled tabs", () => {
    const onValueChange = vi.fn();
    const state = make({ onValueChange });
    state.init();
    state.select("a", { via: "pointer" });
    state.select("c", { via: "pointer" });
    expect(state.getState()).toBe("a");
    expect(onValueChange).not.toHaveBeenCalled();
  });

  test("a pick calls back, dispatches the event from the target, and notifies", () => {
    const target = new EventTarget();
    const seen: unknown[] = [];
    target.addEventListener("pick", (e) => seen.push((e as CustomEvent).detail));
    const onValueChange = vi.fn();
    const listener = vi.fn();
    const state = make({ onValueChange, eventName: "pick", target: () => target });
    state.init();
    const off = state.subscribe(listener);
    state.select("b", { via: "pointer" });
    state.select("d", { via: "keyboard" });
    off();
    state.select("a", { via: "pointer" });
    expect(onValueChange.mock.calls).toEqual([["b"], ["d"], ["a"]]);
    expect(seen).toEqual([{ value: "b" }, { value: "d" }, { value: "a" }]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test("hash true pushes for a pointer pick and replaces for a keyboard move", () => {
    const state = make({ hash: true });
    state.init();
    const before = history.length;
    state.select("d", { via: "keyboard" });
    expect(location.hash).toBe("#p%20d");
    expect(history.length).toBe(before);
    state.select("b", { via: "pointer" });
    expect(location.hash).toBe("#p-b");
    expect(history.length).toBe(before + 1);
  });

  test("hash 'replace' never adds history; hash false leaves the URL alone", () => {
    const replacing = make({ hash: "replace" });
    replacing.init();
    const before = history.length;
    replacing.select("b", { via: "pointer" });
    expect(location.hash).toBe("#p-b");
    expect(history.length).toBe(before);
    const off = make();
    off.init();
    off.select("d", { via: "pointer" });
    expect(location.hash).toBe("#p-b");
  });

  test("a hash read calls back but writes no hash and fires no event", () => {
    const target = new EventTarget();
    const event = vi.fn();
    target.addEventListener("pick", event);
    const onValueChange = vi.fn();
    const state = make({ onValueChange, hash: true, eventName: "pick", target: () => target });
    state.init();
    const before = history.length;
    state.select("b", { via: "hash" });
    expect(onValueChange).toHaveBeenCalledWith("b");
    expect(event).not.toHaveBeenCalled();
    expect(location.hash).toBe("");
    expect(history.length).toBe(before);
  });

  test("hash and eventName are read on each use", () => {
    const live: { hash: boolean } = { hash: false };
    // A spread would read the getter once, so build the options object directly.
    const state = createTabsState({
      tabs: () => TABS,
      get hash() {
        return live.hash;
      },
    });
    state.init();
    state.select("b", { via: "pointer" });
    expect(location.hash).toBe("");
    live.hash = true;
    state.select("d", { via: "pointer" });
    expect(location.hash).toBe("#p%20d");
  });
});

describe("controlled", () => {
  test("getState follows the controlled value and select only reports", () => {
    let value: string | undefined = "b";
    const onValueChange = vi.fn();
    const listener = vi.fn();
    const state = make({ selected: "b", controlled: () => value, onValueChange, hash: true });
    state.subscribe(listener);
    state.init();
    expect(state.getState()).toBe("b");
    state.select("b", { via: "pointer" });
    expect(onValueChange).not.toHaveBeenCalled();
    state.select("d", { via: "pointer" });
    expect(onValueChange).toHaveBeenCalledWith("d");
    expect(location.hash).toBe("#p%20d");
    expect(state.getState()).toBe("b");
    expect(listener).not.toHaveBeenCalled();
    value = "d";
    expect(state.getState()).toBe("d");
  });
});

describe("hash", () => {
  test("connectHash decodes the fragment and skips disabled tabs and empty fragments", () => {
    const onValueChange = vi.fn();
    const pick = (hash: string): string | undefined => {
      history.replaceState(null, "", hash);
      const state = make({ hash: true, onValueChange });
      state.init();
      state.connectHash()();
      return state.getState();
    };
    expect(pick("#p%20d")).toBe("d");
    expect(pick("#p-c")).toBe("a");
    expect(pick("#")).toBe("a");
    expect(pick("#nope")).toBe("a");
    expect(onValueChange.mock.calls).toEqual([["d"]]);
  });

  test("connectHash reads now and on hashchange until disconnected", () => {
    history.replaceState(null, "", "#p-b");
    const state = make({ hash: "replace" });
    state.init();
    const disconnect = state.connectHash();
    expect(state.getState()).toBe("b");
    history.replaceState(null, "", "#p%20d");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(state.getState()).toBe("d");
    disconnect();
    history.replaceState(null, "", "#p-a");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(state.getState()).toBe("d");
  });

  test("connectHash does nothing without hash or without a window", () => {
    history.replaceState(null, "", "#p-b");
    const off = make();
    off.init();
    off.connectHash()();
    expect(off.getState()).toBe("a");
    const headless = make({ hash: true, window: null });
    headless.init();
    headless.connectHash()();
    expect(headless.getState()).toBe("a");
  });

  test("an explicit window is used for the hash", () => {
    const fake = {
      location: { hash: "#p-b" },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as NonNullable<TabsStateOptions["window"]>;
    const state = make({ hash: true, window: fake });
    state.init();
    const disconnect = state.connectHash();
    expect(state.getState()).toBe("b");
    disconnect();
    expect(fake.addEventListener).toHaveBeenCalledWith("hashchange", expect.any(Function));
    expect(fake.removeEventListener).toHaveBeenCalledWith("hashchange", expect.any(Function));
  });
});
