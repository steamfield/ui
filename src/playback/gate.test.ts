import { afterEach, beforeEach, describe, expect, onTestFinished, test, vi } from "vitest";
import {
  FakeIntersectionObserver,
  setTabHidden,
  stubIntersectionObserver,
  stubReducedMotion,
} from "../../tests/helpers/dom.ts";
import { LibraryError } from "../script/errors.ts";
import { type BoundGate, createBoundGate } from "./gate.ts";
import {
  createPlaybackGate,
  type MotionSource,
  type PlaybackGate,
  type PlaybackGateOptions,
} from "./index.ts";

const observer = (): FakeIntersectionObserver => FakeIntersectionObserver.last();

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

let el: HTMLElement;
let gate: PlaybackGate | undefined;
const advance = (ms: number): void => {
  vi.advanceTimersByTime(ms);
};

beforeEach(() => {
  vi.useFakeTimers();
  stubIntersectionObserver();
  stubReducedMotion(false);
  el = document.createElement("div");
  document.body.append(el);
});

afterEach(() => {
  gate?.destroy();
  gate = undefined;
  el.remove();
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
    stubReducedMotion(true);
    const onFrame = vi.fn();
    const g = make({ onFrame });
    expect(g.getState()).toMatchObject({ reduced: true, complete: true, elapsed: 10_000 });
    expect(onFrame).toHaveBeenCalledWith(10_000);
  });

  test("hold policy freezes the current frame and resumes when motion returns", () => {
    const set = stubReducedMotion(false);
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
    stubReducedMotion(true);
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

describe("bound gate (the bindings' element and option rules)", () => {
  let bound: BoundGate | undefined;
  const other = (): HTMLElement => {
    const node = document.createElement("section");
    document.body.append(node);
    onTestFinished(() => node.remove());
    return node;
  };
  const makeBound = (options: PlaybackGateOptions = {}): BoundGate => {
    bound = createBoundGate({ duration: 10_000, ...options });
    onTestFinished(() => bound?.destroy());
    bound.connect();
    return bound;
  };
  const targets = (): Element[] => [...observer().targets];

  test("with no element, autoStart waits and observes nothing", () => {
    const g = makeBound();
    advance(500);
    expect(g.getState()).toMatchObject({ started: false, inView: true, elapsed: 0 });
    expect(FakeIntersectionObserver.instances).toHaveLength(0);
  });

  test("with no element, play() runs, counted as in view", () => {
    const g = makeBound({ autoStart: false });
    g.play();
    advance(500);
    expect(g.getState()).toMatchObject({ playing: true, inView: true });
    expect(g.getState().elapsed).toBeGreaterThan(400);
  });

  test("the first element starts fresh, with nothing carried from before it", () => {
    const onFrame = vi.fn();
    const g = makeBound({ onFrame });
    g.play();
    g.pause();
    g.seek(700);
    g.attach(el);
    expect(g.getState()).toMatchObject({
      elapsed: 0,
      started: true,
      paused: false,
      inView: false,
    });
    expect(onFrame).toHaveBeenLastCalledWith(0);
    expect(targets()).toEqual([el]);
    observer().fire(true);
    advance(500);
    expect(g.getState().elapsed).toBeGreaterThan(400);
  });

  test("a swap carries elapsed, started, paused and the rate, on the same observer", () => {
    const g = makeBound();
    g.attach(el);
    observer().fire(true);
    advance(500);
    g.setSpeed(2);
    g.pause();
    const at = g.getState().elapsed;
    const b = other();
    g.attach(b);
    expect(FakeIntersectionObserver.instances).toHaveLength(1);
    expect(targets()).toEqual([b]);
    expect(g.getState()).toMatchObject({
      elapsed: at,
      started: true,
      paused: true,
      speed: 2,
      inView: false,
    });
    // A late report about the old element is ignored.
    observer().report([{ target: el, isIntersecting: true }]);
    expect(g.getState().inView).toBe(false);
    observer().enter(b);
    g.play();
    advance(100);
    expect(g.getState().elapsed).toBeGreaterThan(at + 150);
  });

  test("a swap keeps an unstarted gate unstarted", () => {
    const g = makeBound({ autoStart: false });
    g.attach(el);
    g.attach(other());
    expect(g.getState()).toMatchObject({ started: false, elapsed: 0 });
  });

  test("an option change starts over at 0 with the rate kept and one new observer", () => {
    const g = makeBound();
    g.attach(el);
    observer().fire(true);
    advance(500);
    g.setSpeed(3);
    g.pause();
    const b = other();
    g.attach(b);
    g.configure({ duration: 10_000, threshold: 0.5 });
    expect(FakeIntersectionObserver.instances).toHaveLength(2);
    expect(FakeIntersectionObserver.live()).toHaveLength(1);
    expect(targets()).toEqual([b]);
    expect(observer().options).toEqual({ threshold: 0.5, rootMargin: "0px" });
    expect(g.getState()).toMatchObject({ elapsed: 0, started: true, paused: false, speed: 3 });
  });

  test("an option change before any element keeps autoStart waiting", () => {
    const g = makeBound();
    g.play();
    advance(200);
    g.configure({ duration: 5000 });
    expect(g.getState()).toMatchObject({ elapsed: 0, started: false });
  });

  test("the same options change nothing; speed and onFrame change in place", () => {
    const first = vi.fn();
    const g = makeBound({ onFrame: first });
    g.attach(el);
    observer().fire(true);
    advance(500);
    const at = g.getState().elapsed;
    const listener = vi.fn();
    g.subscribe(listener);
    g.configure({ duration: 10_000, onFrame: first });
    expect(listener).not.toHaveBeenCalled();
    const second = vi.fn();
    g.configure({ duration: 10_000, onFrame: second, speed: 4 });
    expect(FakeIntersectionObserver.instances).toHaveLength(1);
    expect(g.getState().speed).toBe(4);
    advance(100);
    expect(g.getState().elapsed).toBeGreaterThan(at + 300);
    expect(second).toHaveBeenCalled();
    // An unchanged `speed` option leaves a rate set with setSpeed alone.
    g.setSpeed(2);
    g.configure({ duration: 10_000, onFrame: second, speed: 4 });
    expect(g.getState().speed).toBe(2);
  });

  test("a bad speed throws before anything changes", () => {
    const g = makeBound();
    g.attach(el);
    expect(() => g.configure({ duration: 1, speed: 0 })).toThrow(
      expect.objectContaining({ code: "invalid_option", field: "speed" }),
    );
    expect(FakeIntersectionObserver.instances).toHaveLength(1);
  });

  test("unbinding keeps the state; the observer then reports it out of view", () => {
    const g = makeBound();
    g.attach(el);
    observer().fire(true);
    advance(300);
    g.attach(null);
    const at = g.getState().elapsed;
    expect(g.getState()).toMatchObject({ started: true, inView: true });
    observer().fire(false);
    advance(300);
    expect(g.getState()).toMatchObject({ playing: false, elapsed: at });
    // Binding the same element again changes nothing.
    g.attach(el);
    expect(FakeIntersectionObserver.instances).toHaveLength(1);
    expect(g.getState().elapsed).toBe(at);
  });

  test("the motion source follows the element", () => {
    const g = makeBound();
    g.attach(el);
    const wrap = document.createElement("div");
    wrap.dataset.sfMotion = "reduce";
    const b = document.createElement("section");
    wrap.append(b);
    document.body.append(wrap);
    onTestFinished(() => wrap.remove());
    g.attach(b);
    expect(g.getState()).toMatchObject({ reduced: true, complete: true });
  });

  test("after destroy, attach and configure do nothing", () => {
    const g = makeBound();
    g.destroy();
    g.attach(el);
    g.configure({ duration: 5 });
    expect(FakeIntersectionObserver.instances).toHaveLength(0);
  });

  test("without IntersectionObserver a bound element counts as in view", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const g = makeBound();
    g.attach(el);
    advance(200);
    expect(g.getState()).toMatchObject({ inView: true, playing: true });
  });

  test("created disconnected, it reads no browser state and runs no clock", () => {
    vi.stubGlobal("matchMedia", () => {
      throw new Error("matchMedia before connect");
    });
    const g = createBoundGate({ duration: 1000, autoStart: false });
    onTestFinished(() => g.destroy());
    g.attach(el);
    g.setSpeed(2);
    g.play();
    advance(500);
    expect(g.getState()).toMatchObject({ started: true, elapsed: 0, speed: 2 });
    expect(FakeIntersectionObserver.instances).toHaveLength(0);
  });

  test("disconnect stops observing and the clock; connect resumes with everything kept", () => {
    const g = makeBound();
    g.attach(el);
    observer().fire(true);
    advance(500);
    g.setSpeed(3);
    g.disconnect();
    g.disconnect();
    expect(FakeIntersectionObserver.live()).toHaveLength(0);
    const at = g.getState().elapsed;
    advance(500);
    expect(g.getState().elapsed).toBe(at);
    g.connect();
    g.connect();
    expect(FakeIntersectionObserver.live()).toHaveLength(1);
    expect(targets()).toEqual([el]);
    observer().fire(true);
    advance(100);
    expect(g.getState()).toMatchObject({ speed: 3, started: true });
    expect(g.getState().elapsed).toBeGreaterThan(at + 200);
  });

  test("a setSpeed rate holds until the speed option changes, even while disconnected", () => {
    const g = makeBound({ speed: 1 });
    g.setSpeed(3);
    g.disconnect();
    g.configure({ duration: 10_000, speed: 1 });
    g.connect();
    expect(g.getState().speed).toBe(3);
    g.disconnect();
    g.configure({ duration: 10_000, speed: 5 });
    g.connect();
    expect(g.getState().speed).toBe(5);
    expect(() => g.configure({ duration: 10_000, speed: 0 })).toThrow(
      expect.objectContaining({ code: "invalid_option", field: "speed" }),
    );
    expect(g.getState().speed).toBe(5);
  });

  test("destroy while disconnected leaves nothing to resume", () => {
    const g = makeBound();
    g.disconnect();
    g.destroy();
    g.connect();
    expect(FakeIntersectionObserver.live()).toHaveLength(0);
  });
});

describe("listeners that throw", () => {
  test("the clock keeps running when a listener throws", () => {
    const g = make();
    observer().fire(true);
    let thrown = 0;
    g.subscribe(() => {
      if (thrown++ < 2) throw new Error("listener");
    });
    expect(() => advance(200)).toThrow("listener");
    advance(500);
    expect(g.getState().playing).toBe(true);
    expect(g.getState().elapsed).toBeGreaterThan(400);
  });

  test("the clock keeps running when onFrame throws", () => {
    let calls = 0;
    const g = make({
      onFrame: () => {
        if (calls++ === 1) throw new Error("frame");
      },
    });
    observer().fire(true);
    expect(() => advance(200)).toThrow("frame");
    advance(500);
    expect(g.getState().elapsed).toBeGreaterThan(400);
  });
});
