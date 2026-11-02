import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initReveal, revealGateScript } from "./index.ts";

class FakeObserver {
  static instances: FakeObserver[] = [];
  disconnected = false;
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {
    this.disconnected = true;
  }
  constructor() {
    FakeObserver.instances.push(this);
  }
}

function stubReducedMotion(initial: boolean): (next: boolean) => void {
  let matches = initial;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query === "(prefers-reduced-motion: reduce)" && matches;
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
/** Runs the snippet the way an inline classic script would: in the page's global scope. */
const runGate = (): void => new Function(revealGateScript)();

let dispose: () => void = () => {};

beforeEach(() => {
  FakeObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  stubReducedMotion(false);
  document.body.innerHTML = `<section data-reveal><h1 data-motion>Hi</h1></section>`;
});

afterEach(() => {
  dispose();
  dispose = () => {};
  delete root.dataset.motionReady;
  root.removeAttribute("data-sf-motion");
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("revealGateScript", () => {
  test("is a small self-contained classic script", () => {
    expect(revealGateScript.length).toBeLessThan(400);
    expect(revealGateScript).not.toMatch(/\b(import|export)\b/);
  });

  test("sets the gate when motion is allowed", () => {
    runGate();
    expect(root.dataset.motionReady).toBe("true");
  });

  test("leaves the gate off under prefers-reduced-motion", () => {
    stubReducedMotion(true);
    runGate();
    expect(root.hasAttribute("data-motion-ready")).toBe(false);
  });

  test("leaves the gate off without IntersectionObserver", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    // `"IntersectionObserver" in window` must see it as missing, not merely undefined.
    delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
    runGate();
    expect(root.hasAttribute("data-motion-ready")).toBe(false);
  });

  test('leaves the gate off under html[data-sf-motion="reduce"]', () => {
    root.setAttribute("data-sf-motion", "reduce");
    runGate();
    expect(root.hasAttribute("data-motion-ready")).toBe(false);
  });

  test("works without matchMedia", () => {
    vi.stubGlobal("matchMedia", undefined);
    runGate();
    expect(root.dataset.motionReady).toBe("true");
  });

  test("never throws", () => {
    vi.stubGlobal("matchMedia", () => {
      throw new Error("boom");
    });
    expect(runGate).not.toThrow();
  });
});

describe("initReveal after the gate", () => {
  test("takes over a gate that is already set", () => {
    runGate();
    dispose = initReveal();
    expect(root.dataset.motionReady).toBe("true");
    expect(FakeObserver.instances).toHaveLength(1);
    dispose();
    expect(root.hasAttribute("data-motion-ready")).toBe(false);
  });

  test("removes the gate when motion turns off later", () => {
    const set = stubReducedMotion(false);
    runGate();
    dispose = initReveal();
    set(true);
    expect(root.hasAttribute("data-motion-ready")).toBe(false);
    expect(FakeObserver.instances[0]?.disconnected).toBe(true);
  });

  test("removes the gate when its motion source says no at setup", () => {
    runGate();
    dispose = initReveal({ motion: "reduce" });
    expect(root.hasAttribute("data-motion-ready")).toBe(false);
    expect(FakeObserver.instances).toEqual([]);
  });
});
