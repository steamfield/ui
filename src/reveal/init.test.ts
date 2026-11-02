import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initReveal } from "./index.ts";

class FakeObserver {
  static instances: FakeObserver[] = [];
  readonly targets = new Set<Element>();
  disconnected = false;
  readonly callback: IntersectionObserverCallback;
  readonly options: IntersectionObserverInit;
  constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    FakeObserver.instances.push(this);
  }
  observe(target: Element): void {
    this.targets.add(target);
  }
  unobserve(target: Element): void {
    this.targets.delete(target);
  }
  disconnect(): void {
    this.disconnected = true;
    this.targets.clear();
  }
  enter(target: Element): void {
    const entry = { target, isIntersecting: true };
    this.callback([entry] as unknown as IntersectionObserverEntry[], this as never);
  }
  leave(target: Element): void {
    const entry = { target, isIntersecting: false };
    this.callback([entry] as unknown as IntersectionObserverEntry[], this as never);
  }
}

const observer = (): FakeObserver => {
  const last = FakeObserver.instances.at(-1);
  if (!last) throw new Error("no observer");
  return last;
};

function stubReducedMotion(initial: boolean): (next: boolean) => void {
  let matches = initial;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return matches;
    },
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  }));
  return (next) => {
    matches = next;
    for (const cb of [...listeners]) cb();
  };
}

const root = document.documentElement;
const byId = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(id);
  return el;
};
let dispose: () => void = () => {};

beforeEach(() => {
  FakeObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  stubReducedMotion(false);
  document.body.innerHTML = `
    <section id="a" data-reveal><h2 data-motion="lift-lg">A</h2></section>
    <section id="b" data-reveal><a id="link" href="#x">Link</a></section>
    <section id="done" data-reveal data-revealed="true"></section>
    <div id="island" data-reveal-defer>
      <section id="c" data-reveal><button id="btn">Go</button></section>
    </div>`;
});

afterEach(() => {
  dispose();
  delete root.dataset.motionReady;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("initReveal", () => {
  test("sets the gate and reveals each container once, on intersection", () => {
    dispose = initReveal();
    expect(root.dataset.motionReady).toBe("true");
    const io = observer();
    expect(io.options).toEqual({ rootMargin: "0px 0px -12% 0px", threshold: 0 });
    expect([...io.targets].map((el) => el.id)).toEqual(["a", "b"]);
    io.leave(byId("a"));
    expect(byId("a").hasAttribute("data-revealed")).toBe(false);
    io.enter(byId("a"));
    expect(byId("a").getAttribute("data-revealed")).toBe("true");
    expect(io.targets.has(byId("a"))).toBe(false);
  });

  test("passes rootMargin and threshold through", () => {
    dispose = initReveal({ rootMargin: "0px 0px -48px 0px", threshold: 0.08 });
    expect(observer().options).toEqual({ rootMargin: "0px 0px -48px 0px", threshold: 0.08 });
  });

  test("keyboard focus reveals the section at once", () => {
    dispose = initReveal();
    byId("link").focus();
    expect(byId("b").getAttribute("data-revealed")).toBe("true");
    expect(observer().targets.has(byId("b"))).toBe(false);
  });

  test("pointer focus (not :focus-visible) and focus outside a section do nothing", () => {
    dispose = initReveal();
    const matches = vi.spyOn(Element.prototype, "matches");
    matches.mockImplementation(function (this: Element, selector: string) {
      return selector === ":focus-visible"
        ? false
        : Element.prototype.closest.call(this, selector) === this;
    });
    byId("link").focus();
    matches.mockRestore();
    expect(byId("b").hasAttribute("data-revealed")).toBe(false);
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    expect(document.querySelectorAll("[data-revealed]")).toHaveLength(1);
  });

  test("treats any focus as keyboard focus where :focus-visible is unsupported", () => {
    dispose = initReveal();
    const original = Element.prototype.matches;
    vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, s: string) {
      if (s === ":focus-visible") throw new SyntaxError("unsupported");
      return original.call(this, s);
    });
    byId("link").focus();
    expect(byId("b").getAttribute("data-revealed")).toBe("true");
  });

  test("immediate() reveals without observing", () => {
    dispose = initReveal({ immediate: (el) => el.id === "a" });
    expect(byId("a").getAttribute("data-revealed")).toBe("true");
    expect([...observer().targets].map((el) => el.id)).toEqual(["b"]);
  });

  test("reduced motion skips setup entirely", () => {
    stubReducedMotion(true);
    dispose = initReveal();
    expect(root.dataset.motionReady).toBeUndefined();
    expect(FakeObserver.instances).toEqual([]);
  });

  test('motion: "reduce" vetoes setup', () => {
    dispose = initReveal({ motion: "reduce" });
    expect(root.dataset.motionReady).toBeUndefined();
  });

  test("a site motion store turning motion off tears reveals down", () => {
    let allowed = true;
    const listeners = new Set<() => void>();
    const store = {
      get: () => allowed,
      subscribe(callback: () => void) {
        listeners.add(callback);
        return () => listeners.delete(callback);
      },
    };
    dispose = initReveal({ motion: store });
    expect(root.dataset.motionReady).toBe("true");
    allowed = false;
    for (const listener of listeners) listener();
    expect(root.dataset.motionReady).toBeUndefined();
    expect(listeners.size).toBe(0);
  });

  test('data-sf-motion="reduce" on <html> vetoes setup', () => {
    root.setAttribute("data-sf-motion", "reduce");
    try {
      dispose = initReveal();
      expect(root.dataset.motionReady).toBeUndefined();
    } finally {
      root.removeAttribute("data-sf-motion");
    }
  });

  test("without IntersectionObserver nothing is hidden", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    dispose = initReveal();
    expect(root.dataset.motionReady).toBeUndefined();
  });

  test("reduced motion turning on later tears down live", () => {
    const set = stubReducedMotion(false);
    dispose = initReveal();
    set(false);
    expect(root.dataset.motionReady).toBe("true");
    set(true);
    expect(root.dataset.motionReady).toBeUndefined();
    expect(observer().disconnected).toBe(true);
    byId("link").focus();
    expect(byId("b").hasAttribute("data-revealed")).toBe(false);
  });

  test("works without matchMedia", () => {
    vi.stubGlobal("matchMedia", undefined);
    dispose = initReveal();
    expect(root.dataset.motionReady).toBe("true");
  });

  test("the disposer disconnects, removes listeners and drops the gate", () => {
    dispose = initReveal();
    dispose();
    dispose();
    expect(observer().disconnected).toBe(true);
    expect(root.dataset.motionReady).toBeUndefined();
    byId("link").focus();
    expect(byId("b").hasAttribute("data-revealed")).toBe(false);
  });
});

describe("late hydration", () => {
  test("deferred containers wait for the ready event from inside them", () => {
    dispose = initReveal();
    const io = observer();
    expect(io.targets.has(byId("c"))).toBe(false);
    byId("btn").focus();
    expect(byId("c").hasAttribute("data-revealed")).toBe(false);
    byId("c").dispatchEvent(new CustomEvent("sf:reveal-ready", { bubbles: true }));
    expect(io.targets.has(byId("c"))).toBe(true);
    byId("btn").blur();
    byId("btn").focus();
    expect(byId("c").getAttribute("data-revealed")).toBe("true");
  });

  test("a hydrated marker releases a container at setup", () => {
    byId("island").insertAdjacentHTML(
      "beforeend",
      '<div data-reveal-hydrated><section id="d" data-reveal></section></div>',
    );
    dispose = initReveal();
    expect(observer().targets.has(byId("d"))).toBe(true);
  });

  test("the ready event name and deferral predicate are configurable", () => {
    dispose = initReveal({ readyEvent: "site:ready", deferred: (el) => el.id === "a" });
    const io = observer();
    expect([...io.targets].map((el) => el.id)).toEqual(["b", "c"]);
    byId("island").dispatchEvent(new CustomEvent("site:ready", { bubbles: true }));
    byId("a").dispatchEvent(new CustomEvent("site:ready", { bubbles: true }));
    expect(io.targets.has(byId("a"))).toBe(true);
    document.dispatchEvent(new CustomEvent("site:ready"));
  });

  test("waits for DOMContentLoaded while the document is loading", () => {
    const state = vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
    dispose = initReveal();
    expect(observer().targets.size).toBe(0);
    state.mockReturnValue("interactive");
    document.dispatchEvent(new Event("DOMContentLoaded"));
    expect(observer().targets.size).toBe(2);
  });
});

describe("containers added after init", () => {
  const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  test("a container appended later is observed, and nested ones too", async () => {
    dispose = initReveal();
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div id="wrap"><section id="late" data-reveal></section></div><section id="top" data-reveal></section>',
    );
    await flush();
    expect(observer().targets.has(byId("late"))).toBe(true);
    expect(observer().targets.has(byId("top"))).toBe(true);
  });

  test("a late container inside a deferred island still waits for its ready event", async () => {
    dispose = initReveal();
    byId("island").insertAdjacentHTML("beforeend", '<section id="late" data-reveal></section>');
    await flush();
    expect(observer().targets.has(byId("late"))).toBe(false);
  });

  test("the disposer disconnects the mutation observer", async () => {
    dispose = initReveal();
    dispose();
    document.body.insertAdjacentHTML("beforeend", '<section id="late" data-reveal></section>');
    await flush();
    expect(observer().targets.has(byId("late"))).toBe(false);
  });
});
