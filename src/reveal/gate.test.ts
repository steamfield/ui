import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  FakeIntersectionObserver,
  stubIntersectionObserver,
  stubReducedMotion,
} from "../../tests/helpers/dom.ts";
import { initReveal, revealGateScript } from "./index.ts";

const root = document.documentElement;
/** Runs the snippet the way an inline classic script would: in the page's global scope. */
const runGate = (): void => new Function(revealGateScript)();

let dispose: () => void = () => {};

beforeEach(() => {
  stubIntersectionObserver();
  stubReducedMotion(false);
  document.body.innerHTML = `<section data-reveal><h1 data-motion>Hi</h1></section>`;
});

afterEach(() => {
  dispose();
  dispose = () => {};
  delete root.dataset.motionReady;
  delete root.dataset.revealLive;
  root.removeAttribute("data-sf-motion");
  document.body.innerHTML = "";
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

  test("does nothing without a window, without leaning on its catch", () => {
    // Shadowing parameters: the snippet sees no `window`, and a `document` that records reads.
    // Guarded, it never reaches `document`; relying on the catch it would read it first.
    const reads: PropertyKey[] = [];
    const doc = new Proxy({}, { get: (_, key) => reads.push(key) && undefined });
    expect(() =>
      new Function("window", "document", revealGateScript)(undefined, doc),
    ).not.toThrow();
    expect(reads).toEqual([]);
  });

  test("never throws", () => {
    vi.stubGlobal("matchMedia", () => {
      throw new Error("boom");
    });
    expect(runGate).not.toThrow();
  });
});

describe("the gate's fallback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  test("removes the gate after 3s when initReveal never runs", () => {
    runGate();
    vi.advanceTimersByTime(2999);
    expect(root.dataset.motionReady).toBe("true");
    vi.advanceTimersByTime(1);
    expect(root.hasAttribute("data-motion-ready")).toBe(false);
  });

  test("keeps the gate once initReveal has taken over", () => {
    runGate();
    dispose = initReveal();
    expect(root.dataset.revealLive).toBe("true");
    vi.advanceTimersByTime(5000);
    expect(root.dataset.motionReady).toBe("true");
    dispose();
    expect(root.hasAttribute("data-reveal-live")).toBe(false);
    expect(root.hasAttribute("data-motion-ready")).toBe(false);
  });
});

describe("initReveal after the gate", () => {
  test("takes over a gate that is already set", () => {
    runGate();
    dispose = initReveal();
    expect(root.dataset.motionReady).toBe("true");
    expect(FakeIntersectionObserver.instances).toHaveLength(1);
    dispose();
    expect(root.hasAttribute("data-motion-ready")).toBe(false);
  });

  test("removes the gate when motion turns off later", () => {
    const set = stubReducedMotion(false);
    runGate();
    dispose = initReveal();
    set(true);
    expect(root.hasAttribute("data-motion-ready")).toBe(false);
    expect(FakeIntersectionObserver.instances[0]?.disconnected).toBe(true);
  });

  test("removes the gate when its motion source says no at setup", () => {
    runGate();
    dispose = initReveal({ motion: "reduce" });
    expect(root.hasAttribute("data-motion-ready")).toBe(false);
    expect(FakeIntersectionObserver.instances).toEqual([]);
  });
});
