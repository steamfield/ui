import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { LibraryError } from "../script/errors.ts";
import { createPlaybackGate, type MotionSource, type PlaybackGate } from "./index.ts";

/** An IntersectionObserver the test drives by hand. */
class FakeObserver {
  static instances: FakeObserver[] = [];
  readonly targets = new Set<Element>();
  disconnected = false;
  readonly callback: IntersectionObserverCallback;
  readonly options: IntersectionObserverInit;
  constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit = {}) {
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
  fire(isIntersecting: boolean): void {
    const entries = [...this.targets].map((target) => ({ target, isIntersecting }));
    this.callback(entries as unknown as IntersectionObserverEntry[], this as never);
  }
}

const observer = (): FakeObserver => {
  const last = FakeObserver.instances.at(-1);
  if (!last) throw new Error("no observer");
  return last;
};

function setReducedMotion(initial: boolean): (next: boolean) => void {
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
    for (const cb of listeners) cb();
  };
}

function store(initial: boolean): MotionSource & { set(next: boolean): void } {
  let allowed = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => allowed,
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    set(next) {
      allowed = next;
      for (const cb of listeners) cb();
    },
  };
}

const setTabHidden = (hidden: boolean): void => {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue(hidden ? "hidden" : "visible");
  document.dispatchEvent(new Event("visibilitychange"));
};

let el: HTMLElement;
let gate: PlaybackGate | undefined;
const advance = (ms: number): void => {
  vi.advanceTimersByTime(ms);
};

beforeEach(() => {
  vi.useFakeTimers();
  FakeObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  setReducedMotion(false);
  el = document.createElement("div");
  document.body.append(el);
});

afterEach(() => {
  gate?.destroy();
  gate = undefined;
  el.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const make = (options: Parameters<typeof createPlaybackGate>[1] = {}): PlaybackGate => {
  gate = createPlaybackGate(el, { duration: 10_000, ...options });
  return gate;
};

describe("play condition", () => {
  test("waits for the element to come into view, then advances the clock", () => {
    const g = make();
    advance(500);
    expect(g.getState()).toMatchObject({ playing: false, inView: false, elapsed: 0 });
    observer().fire(true);
    advance(1000);
    expect(g.getState().playing).toBe(true);
    expect(g.getState().elapsed).toBeGreaterThan(900);
    expect(observer().options).toEqual({ threshold: 0.15, rootMargin: "0px" });
  });

  test("pause and resume keep the position", () => {
    const g = make();
    observer().fire(true);
    advance(1000);
    g.pause();
    const at = g.getState().elapsed;
    advance(5000);
    expect(g.getState()).toMatchObject({ paused: true, playing: false, elapsed: at });
    g.toggle();
    advance(32);
    expect(g.getState().playing).toBe(true);
    expect(g.getState().elapsed).toBeGreaterThan(at);
    expect(g.getState().elapsed).toBeLessThan(at + 100);
    g.toggle();
    expect(g.getState().paused).toBe(true);
  });

  test("holds while the tab is hidden and resumes without a jump", () => {
    const g = make();
    observer().fire(true);
    advance(1000);
    setTabHidden(true);
    const at = g.getState().elapsed;
    advance(10_000);
    expect(g.getState()).toMatchObject({ tabVisible: false, playing: false, elapsed: at });
    setTabHidden(false);
    advance(50);
    expect(g.getState().elapsed - at).toBeLessThan(100);
  });

  test("caps a single frame at 100ms of demo time", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const g = make();
    observer().fire(true);
    frames.shift()?.(1000);
    frames.shift()?.(5000);
    expect(g.getState().elapsed).toBe(100);
  });

  test("speed scales the clock and can change mid-run", () => {
    const g = make({ speed: 2 });
    observer().fire(true);
    advance(1000);
    expect(g.getState().elapsed).toBeGreaterThan(1900);
    const at = g.getState().elapsed;
    g.setSpeed(0.5);
    advance(1000);
    expect(g.getState().elapsed - at).toBeLessThan(550);
  });

  test("completes at the duration and stops the clock", () => {
    const onFrame = vi.fn();
    const g = make({ duration: 500, onFrame });
    observer().fire(true);
    advance(2000);
    expect(g.getState()).toMatchObject({ complete: true, playing: false, elapsed: 500 });
    expect(onFrame).toHaveBeenLastCalledWith(500);
    const calls = onFrame.mock.calls.length;
    advance(1000);
    expect(onFrame).toHaveBeenCalledTimes(calls);
  });

  test("without a duration or onFrame the gate runs no clock", () => {
    const raf = vi.fn(() => 1);
    vi.stubGlobal("requestAnimationFrame", raf);
    gate = createPlaybackGate(el);
    observer().fire(true);
    expect(gate.getState().playing).toBe(true);
    expect(raf).not.toHaveBeenCalled();
  });

  test("counts as in view with no element or no IntersectionObserver", () => {
    gate = createPlaybackGate(null, { duration: 1000 });
    expect(gate.getState().inView).toBe(true);
    gate.destroy();
    vi.stubGlobal("IntersectionObserver", undefined);
    gate = createPlaybackGate(el, { duration: 1000 });
    advance(2000);
    expect(gate.getState().complete).toBe(true);
  });

  test("falls back to timers without requestAnimationFrame", () => {
    vi.stubGlobal("requestAnimationFrame", undefined);
    vi.stubGlobal("cancelAnimationFrame", undefined);
    const g = make();
    observer().fire(true);
    advance(500);
    expect(g.getState().elapsed).toBeGreaterThan(400);
    g.pause();
    const at = g.getState().elapsed;
    advance(500);
    expect(g.getState().elapsed).toBe(at);
  });
});

describe("controls", () => {
  test("autoStart false waits for play()", () => {
    const g = make({ autoStart: false });
    observer().fire(true);
    advance(500);
    expect(g.getState()).toMatchObject({ started: false, playing: false, elapsed: 0 });
    g.play();
    advance(500);
    expect(g.getState().elapsed).toBeGreaterThan(400);
    g.reset();
    expect(g.getState()).toMatchObject({ started: false, elapsed: 0 });
  });

  test("toggle before start plays", () => {
    const g = make({ autoStart: false });
    observer().fire(true);
    g.toggle();
    expect(g.getState().playing).toBe(true);
  });

  test("replay restarts from 0 and never moves focus", () => {
    const button = document.createElement("button");
    el.append(button);
    button.focus();
    const g = make({ duration: 500 });
    observer().fire(true);
    advance(1000);
    expect(g.getState().complete).toBe(true);
    g.replay();
    expect(g.getState()).toMatchObject({ elapsed: 0, playing: true, complete: false });
    expect(document.activeElement).toBe(button);
    advance(1000);
    expect(g.getState().complete).toBe(true);
    expect(document.activeElement).toBe(button);
  });

  test("seek clamps to the duration", () => {
    const g = make({ duration: 1000, autoStart: false });
    g.seek(400);
    expect(g.getState().elapsed).toBe(400);
    g.seek(5000);
    expect(g.getState()).toMatchObject({ elapsed: 1000, complete: true });
    g.seek(-10);
    expect(g.getState().elapsed).toBe(0);
  });

  test("subscribe notifies on change and unsubscribes", () => {
    const g = make({ autoStart: false });
    const listener = vi.fn();
    const off = g.subscribe(listener);
    const before = g.getState();
    g.seek(0);
    expect(listener).not.toHaveBeenCalled();
    expect(g.getState()).toBe(before);
    g.seek(10);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    g.seek(20);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("destroy disconnects, stops the clock and ignores later events", () => {
    const g = make();
    observer().fire(true);
    advance(200);
    g.destroy();
    g.destroy();
    const at = g.getState().elapsed;
    expect(observer().disconnected).toBe(true);
    advance(2000);
    setTabHidden(true);
    expect(g.getState().elapsed).toBe(at);
    expect(g.getState().tabVisible).toBe(true);
  });
});

describe("validation", () => {
  test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "speed %s is invalid_option",
    (speed) => {
      expect(() => make({ speed })).toThrow(
        expect.objectContaining({ code: "invalid_option", field: "speed" }),
      );
      const g = make();
      expect(() => g.setSpeed(speed)).toThrow(LibraryError);
      expect(() => g.setSpeed(speed)).toThrow(expect.objectContaining({ field: "speed" }));
    },
  );

  test.each([Number.NaN, Number.POSITIVE_INFINITY])(
    "seek(%s) is invalid_option and keeps elapsed",
    (ms) => {
      const g = make();
      g.seek(500);
      expect(() => g.seek(ms)).toThrow(
        expect.objectContaining({ code: "invalid_option", field: "ms" }),
      );
      expect(g.getState().elapsed).toBe(500);
    },
  );

  test("setSpeed shows in state", () => {
    const g = make({ speed: 2 });
    expect(g.getState().speed).toBe(2);
    g.setSpeed(0.5);
    expect(g.getState().speed).toBe(0.5);
  });
});

describe("leave grace period", () => {
  test("keeps playing through a short scroll away", () => {
    const g = make({ leaveGraceMs: 5000 });
    observer().fire(true);
    advance(1000);
    observer().fire(false);
    advance(3000);
    expect(g.getState()).toMatchObject({ inView: true, playing: true });
    observer().fire(true);
    advance(5000);
    expect(g.getState().playing).toBe(true);
  });

  test("pauses once the grace period runs out and resumes at once on return", () => {
    const g = make({ leaveGraceMs: 5000 });
    observer().fire(true);
    observer().fire(false);
    advance(5000);
    expect(g.getState()).toMatchObject({ inView: false, playing: false });
    const at = g.getState().elapsed;
    advance(3000);
    expect(g.getState().elapsed).toBe(at);
    observer().fire(true);
    expect(g.getState().playing).toBe(true);
  });

  test("with no grace period, leaving pauses at once", () => {
    const g = make();
    observer().fire(true);
    observer().fire(false);
    expect(g.getState().playing).toBe(false);
  });
});

describe("reduced motion", () => {
  test("end policy shows the final frame", () => {
    setReducedMotion(true);
    const onFrame = vi.fn();
    const g = make({ onFrame });
    expect(g.getState()).toMatchObject({ reduced: true, complete: true, elapsed: 10_000 });
    expect(onFrame).toHaveBeenCalledWith(10_000);
  });

  test("hold policy freezes the current frame and resumes when motion returns", () => {
    const set = setReducedMotion(false);
    const g = make({ reducedPolicy: "hold" });
    observer().fire(true);
    advance(1000);
    set(true);
    const at = g.getState().elapsed;
    advance(3000);
    expect(g.getState()).toMatchObject({ reduced: true, complete: false, playing: false });
    expect(g.getState().elapsed).toBe(at);
    set(false);
    advance(500);
    expect(g.getState().elapsed).toBeGreaterThan(at);
  });

  test("end policy without a duration completes without moving elapsed", () => {
    gate = createPlaybackGate(el, { motion: "reduce" });
    expect(gate.getState()).toMatchObject({ complete: true, elapsed: 0 });
  });

  test("a motion store toggling mid-run snaps to the end and stays there", () => {
    const motion = store(true);
    const g = make({ motion });
    observer().fire(true);
    advance(1000);
    motion.set(false);
    expect(g.getState()).toMatchObject({ reduced: true, complete: true, elapsed: 10_000 });
    motion.set(true);
    expect(g.getState()).toMatchObject({ reduced: false, complete: true, elapsed: 10_000 });
    g.replay();
    advance(100);
    expect(g.getState().playing).toBe(true);
  });

  test("full ignores the media query", () => {
    setReducedMotion(true);
    const g = make({ motion: "full" });
    expect(g.getState().reduced).toBe(false);
  });

  test("auto follows a [data-sf-motion=reduce] ancestor live", async () => {
    const g = make();
    observer().fire(true);
    advance(500);
    expect(g.getState().reduced).toBe(false);
    document.documentElement.setAttribute("data-sf-motion", "reduce");
    await vi.waitFor(() => expect(g.getState()).toMatchObject({ reduced: true, complete: true }));
    document.documentElement.setAttribute("data-sf-motion", "full");
    await vi.waitFor(() => expect(g.getState().reduced).toBe(false));
    document.documentElement.removeAttribute("data-sf-motion");
  });

  test("auto starts reduced inside a [data-sf-motion=reduce] ancestor", () => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-sf-motion", "reduce");
    wrapper.append(el);
    document.body.append(wrapper);
    expect(make().getState().reduced).toBe(true);
    wrapper.remove();
  });

  test("auto allows motion when matchMedia is missing", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(make().getState().reduced).toBe(false);
  });
});
