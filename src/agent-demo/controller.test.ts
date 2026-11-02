import { beforeEach, describe, expect, onTestFinished, test, vi } from "vitest";
import {
  FakeIntersectionObserver,
  stubIntersectionObserver,
  stubReducedMotion,
} from "../../tests/helpers/dom.ts";
import type { MotionSource } from "../playback/motion.ts";
import type { DemoScript } from "../script/types.ts";
import { compile } from "../sequencer/compile.ts";
import { presets } from "../sequencer/timing.ts";
import {
  createDemoController,
  type DemoController,
  type DemoControllerOptions,
} from "./controller.ts";

const script: DemoScript = {
  steps: [
    { kind: "user", text: "Fix the failing test" },
    { kind: "tool-call", name: "Bash", args: "go test ./...", output: ["ok"] },
    { kind: "agent-text", text: "All green." },
    { kind: "user", text: "Thanks" },
    { kind: "agent-text", text: "Any time." },
  ],
};
/** The same steps, one per click. */
const clicks: DemoScript = { steps: script.steps.map((step, i) => ({ ...step, at: i + 1 })) };
const options = { timing: presets.terminal } as const;
const timeline = compile(script, options);
const TOTAL = timeline.duration;
const startOf = (i: number): number => timeline.steps[i]?.start ?? 0;

const advance = (ms: number): void => {
  vi.advanceTimersByTime(ms);
};
const scroll = (visible: boolean): void => {
  for (const observer of FakeIntersectionObserver.live()) observer.fire(visible);
};

let el: HTMLElement;

beforeEach(() => {
  vi.useFakeTimers();
  stubIntersectionObserver();
  stubReducedMotion(false);
  el = document.createElement("div");
  document.body.append(el);
  onTestFinished(() => el.remove());
});

/** A controller with `el` attached, mounted and in view, unless told otherwise. */
function make(
  extra: DemoControllerOptions = {},
  { mount = true, attach = true, visible = true, own = script } = {},
): DemoController {
  const c = createDemoController(own, { ...options, ...extra });
  onTestFinished(() => c.destroy());
  if (attach) c.attach(el);
  if (mount) c.mount();
  if (visible) scroll(true);
  return c;
}

describe("before mount", () => {
  test("is the static final state and reads no browser state", () => {
    vi.stubGlobal("matchMedia", () => {
      throw new Error("matchMedia before mount");
    });
    const c = make({}, { mount: false, visible: false });
    expect(c.getState()).toMatchObject({
      ready: false,
      mode: "static",
      animating: false,
      started: false,
      complete: false,
      turn: -1,
      speed: 1,
    });
    expect(c.getState().view.entries).toHaveLength(script.steps.length);
  });

  test("finalPolicy picks the final view", () => {
    const c = make({ finalPolicy: "last" }, { mount: false });
    expect(c.getState().view.entries.length).toBeLessThan(script.steps.length);
  });

  test("the speed option shows before mount; controls do nothing", () => {
    const c = make({ speed: 3 }, { mount: false });
    c.getState().controls.play();
    c.getState().controls.seek(100);
    expect(c.getState()).toMatchObject({ speed: 3, ready: false, started: false });
  });

  test("setSpeed checks the rate and seeds the gate", () => {
    const c = make({ autoStart: false }, { mount: false });
    expect(() => c.getState().controls.setSpeed(0)).toThrow(
      expect.objectContaining({ code: "invalid_option", field: "speed" }),
    );
    c.getState().controls.setSpeed(2);
    c.mount();
    expect(c.getState()).toMatchObject({ ready: true, speed: 2 });
  });
});

describe("clock", () => {
  test("mounting makes it ready; playing in view is live and animating", () => {
    const c = make();
    expect(c.getState()).toMatchObject({ ready: true, mode: "live", playing: true });
    advance(startOf(1) + 50);
    expect(c.getState()).toMatchObject({ animating: true, started: true, turn: 0 });
    expect(c.getState().view.current).toBe(1);
  });

  test("getState is the same object until something changes", () => {
    const c = make({ autoStart: false });
    const listener = vi.fn();
    c.subscribe(listener);
    const first = c.getState();
    c.update(script, { ...options, autoStart: false });
    expect(c.getState()).toBe(first);
    expect(listener).not.toHaveBeenCalled();
  });

  test("subscribe notifies and unsubscribes", () => {
    const c = make();
    const listener = vi.fn();
    const off = c.subscribe(listener);
    advance(100);
    expect(listener).toHaveBeenCalled();
    off();
    listener.mockClear();
    advance(100);
    expect(listener).not.toHaveBeenCalled();
  });

  test("autoStart false shows the final state until play", () => {
    const c = make({ autoStart: false });
    expect(c.getState()).toMatchObject({ started: false, animating: false });
    expect(c.getState().view.entries).toHaveLength(script.steps.length);
    c.getState().controls.play();
    expect(c.getState()).toMatchObject({ started: true, animating: true });
    expect(c.getState().view.entries).toHaveLength(1);
  });

  test("a seek before play shows that frame but keeps started false", () => {
    const onComplete = vi.fn();
    const c = make({ autoStart: false, onComplete });
    c.getState().controls.seek(startOf(2));
    expect(c.getState()).toMatchObject({ started: false, animating: true, turn: 0 });
    expect(c.getState().view.current).toBe(2);
    c.getState().controls.cancel();
    expect(c.getState()).toMatchObject({ started: false, complete: true });
    expect(onComplete).not.toHaveBeenCalled();
  });

  test("a non-finite seek throws once mounted", () => {
    const c = make();
    expect(() => c.getState().controls.seek(Number.NaN)).toThrow(
      expect.objectContaining({ code: "invalid_option" }),
    );
  });

  test("pause, toggle, replay and setSpeed drive the gate", () => {
    const c = make();
    const { controls } = c.getState();
    advance(500);
    controls.pause();
    expect(c.getState()).toMatchObject({ paused: true, playing: false });
    controls.toggle();
    expect(c.getState().playing).toBe(true);
    controls.setSpeed(2);
    expect(c.getState().speed).toBe(2);
    controls.replay();
    expect(c.getState().view.elapsed).toBe(0);
  });

  test("the speed option changes the rate in place", () => {
    const c = make();
    advance(300);
    const at = c.getState().view.elapsed;
    c.update(script, { ...options, speed: 3 });
    expect(c.getState().speed).toBe(3);
    expect(c.getState().view.elapsed).toBe(at);
  });
});

describe("onStepStart", () => {
  test("fires once per step in order, for skipped steps, and again after a rewind", () => {
    const onStepStart = vi.fn();
    const c = make({ onStepStart });
    advance(startOf(1) + 50);
    expect(onStepStart.mock.calls.map(([i]) => i)).toEqual([0, 1]);
    c.getState().controls.seek(startOf(3) + 1);
    expect(onStepStart.mock.calls.map(([i]) => i)).toEqual([0, 1, 2, 3]);
    expect(onStepStart).toHaveBeenLastCalledWith(3, script.steps[3]);
    c.getState().controls.seek(startOf(2) - 1);
    advance(50);
    expect(onStepStart.mock.calls.map(([i]) => i)).toEqual([0, 1, 2, 3, 2]);
    onStepStart.mockClear();
    c.getState().controls.replay();
    advance(1);
    expect(onStepStart).toHaveBeenCalledWith(0, script.steps[0]);
  });

  test("never fires before the element is in view, or before play", () => {
    const onStepStart = vi.fn();
    make({ onStepStart }, { visible: false });
    advance(2000);
    expect(onStepStart).not.toHaveBeenCalled();
    scroll(true);
    advance(10);
    expect(onStepStart).toHaveBeenCalledTimes(1);
  });

  test("the latest callback from update is the one called", () => {
    const first = vi.fn();
    const second = vi.fn();
    const c = make({ onStepStart: first }, { visible: false });
    c.update(script, { ...options, onStepStart: second });
    scroll(true);
    advance(10);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
  });
});

describe("end", () => {
  test("playing through calls onComplete once and completes", () => {
    const onComplete = vi.fn();
    const c = make({ onComplete });
    advance(TOTAL + 1000);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(c.getState()).toMatchObject({ complete: true, playing: false });
    c.getState().controls.replay();
    expect(c.getState().complete).toBe(false);
  });

  test("a seek or cancel to the end completes without onComplete", () => {
    const onComplete = vi.fn();
    const c = make({ onComplete });
    advance(200);
    c.getState().controls.cancel();
    expect(c.getState().complete).toBe(true);
    c.getState().controls.seek(TOTAL - 1);
    expect(c.getState().complete).toBe(false);
    c.getState().controls.seek(TOTAL + 50);
    expect(c.getState().complete).toBe(true);
    expect(onComplete).not.toHaveBeenCalled();
  });

  test("reduced motion shows the end without completing; motion back resumes the clock", () => {
    const set = stubReducedMotion(false);
    const onComplete = vi.fn();
    const c = make({ onComplete });
    advance(500);
    set(true);
    expect(c.getState()).toMatchObject({
      reduced: true,
      complete: false,
      animating: false,
      started: false,
    });
    expect(c.getState().view.entries).toHaveLength(script.steps.length);
    set(false);
    expect(c.getState()).toMatchObject({ reduced: false, complete: false });
    expect(onComplete).not.toHaveBeenCalled();
  });

  test("hold freezes the frame playback reached and resumes from it", () => {
    let allowed = true;
    const listeners = new Set<() => void>();
    const motion: MotionSource = {
      get: () => allowed,
      subscribe(cb) {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
    };
    const toggle = (next: boolean): void => {
      allowed = next;
      for (const cb of listeners) cb();
    };
    const c = make({ motion, reducedPolicy: "hold" });
    advance(startOf(2) + 50);
    toggle(false);
    const frame = c.getState().view;
    expect(frame.current).toBe(2);
    advance(2000);
    expect(c.getState().view.elapsed).toBe(frame.elapsed);
    expect(c.getState().animating).toBe(false);
    toggle(true);
    advance(100);
    expect(c.getState().view.elapsed).toBeGreaterThan(frame.elapsed);
  });

  test("under hold, before playback moves, the final state shows", () => {
    stubReducedMotion(true);
    const c = make({ reducedPolicy: "hold" });
    expect(c.getState().view.entries).toHaveLength(script.steps.length);
  });
});

describe("script identity", () => {
  test("an equal inline script keeps the timeline; a changed one recompiles and starts over", () => {
    const c = make();
    advance(500);
    const first = c.getState().timeline;
    c.update(structuredClone(script), { ...options });
    expect(c.getState().timeline).toBe(first);
    expect(c.getState().view.elapsed).toBeGreaterThan(400);
    const changed: DemoScript = { steps: [{ kind: "agent-text", text: "Only this." }] };
    c.update(changed, { ...options });
    expect(c.getState().timeline).not.toBe(first);
    expect(c.getState().view.elapsed).toBe(0);
  });

  test("a scriptKey decides identity, not content", () => {
    const c = make({ scriptKey: "a" });
    advance(500);
    const first = c.getState().timeline;
    const changed: DemoScript = { steps: [{ kind: "agent-text", text: "Ignored." }] };
    c.update(changed, { ...options, scriptKey: "a" });
    expect(c.getState().timeline).toBe(first);
    c.update(script, { ...options, scriptKey: "b" });
    expect(c.getState().timeline).not.toBe(first);
    expect(c.getState().view.elapsed).toBe(0);
  });

  test("the content signature is computed once per input", () => {
    let reads = 0;
    const step = {
      kind: "agent-text" as const,
      get text() {
        reads++;
        return "Streaming.";
      },
    };
    const own: DemoScript = { steps: [step] };
    const c = createDemoController(own);
    const before = reads;
    c.update(own, {});
    c.update(own, { finalPolicy: "all" });
    expect(reads).toBe(before);
  });

  test("a script that can't serialize compares by identity", () => {
    const data: { self?: unknown } = {};
    data.self = data;
    const own: DemoScript<typeof data> = {
      steps: [{ kind: "tool-call", name: "x", body: { kind: "custom", data } }],
    };
    const c = createDemoController(own);
    const first = c.getState().timeline;
    c.update(own, { speed: 2 });
    expect(c.getState().timeline).toBe(first);
    c.update({ steps: [...own.steps] }, { speed: 2 });
    expect(c.getState().timeline).not.toBe(first);
  });

  test("hidden tools take no time, and changing the hidden set recompiles", () => {
    const c = createDemoController(script, options);
    c.update(script, { ...options, tools: { Bash: { hidden: true } } });
    expect(c.getState().timeline.duration).toBeLessThan(TOTAL);
    const hidden = c.getState().timeline;
    // A new registry with the same hidden names keeps it.
    c.update(script, { ...options, tools: { Bash: { hidden: true } } });
    expect(c.getState().timeline).toBe(hidden);
  });
});

describe("click mode", () => {
  test("renders stateAt the click, forward and backward, with no clock", () => {
    const onStepStart = vi.fn();
    const c = make({ position: { click: 1 }, onStepStart }, { own: clicks });
    advance(TOTAL);
    expect(c.getState()).toMatchObject({ started: false, playing: false, animating: true });
    expect(c.getState().view.entries).toHaveLength(1);
    c.update(clicks, { ...options, position: { click: 3 }, onStepStart });
    expect(c.getState().view.entries).toHaveLength(3);
    c.update(clicks, { ...options, position: { click: 0 }, onStepStart });
    expect(c.getState().view.entries).toHaveLength(0);
    expect(onStepStart).not.toHaveBeenCalled();
  });

  test("an equal inline position doesn't count as a change", () => {
    const c = make({ position: { click: 1 } }, { own: clicks });
    const listener = vi.fn();
    c.subscribe(listener);
    c.update(clicks, { ...options, position: { click: 1 } });
    expect(listener).not.toHaveBeenCalled();
  });

  test("complete follows the view; reduced motion turns animating off", () => {
    stubReducedMotion(true);
    const c = make({ position: { click: script.steps.length } }, { own: clicks });
    expect(c.getState()).toMatchObject({ complete: true, animating: false });
  });
});

describe("element rules", () => {
  test("without an element autoStart waits, and play() runs counted as in view", () => {
    const c = make({}, { attach: false, visible: false });
    advance(500);
    expect(c.getState().started).toBe(false);
    c.getState().controls.play();
    advance(500);
    expect(c.getState().playing).toBe(true);
  });

  test("an element attached late starts fresh and waits to be in view", () => {
    const c = make({}, { attach: false, visible: false });
    c.getState().controls.play();
    advance(500);
    c.attach(el);
    expect(c.getState().view.elapsed).toBe(0);
    expect(c.getState()).toMatchObject({ started: true, playing: false });
    scroll(true);
    expect(c.getState().playing).toBe(true);
  });

  test("a swap keeps the progress; an option change starts over once", () => {
    const c = make();
    advance(500);
    const at = c.getState().view.elapsed;
    const b = document.createElement("div");
    document.body.append(b);
    onTestFinished(() => b.remove());
    c.attach(null);
    c.attach(b);
    expect(c.getState().view.elapsed).toBe(at);
    const before = FakeIntersectionObserver.instances.length;
    c.update(script, { ...options, threshold: 0.5 });
    expect(FakeIntersectionObserver.instances.length).toBe(before + 1);
    expect(c.getState().view.elapsed).toBe(0);
  });
});

describe("lifecycle", () => {
  test("destroy goes back to static, and mount starts again", () => {
    const c = make();
    advance(500);
    c.destroy();
    expect(c.getState()).toMatchObject({ ready: false, mode: "static" });
    expect(FakeIntersectionObserver.live()).toHaveLength(0);
    c.destroy();
    c.mount();
    c.mount();
    expect(FakeIntersectionObserver.live()).toHaveLength(1);
    expect(c.getState()).toMatchObject({ ready: true, started: true });
  });

  test("reset goes back to 0, started only with autoStart", () => {
    const c = make({ autoStart: false });
    c.getState().controls.play();
    advance(500);
    c.reset();
    expect(c.getState()).toMatchObject({ started: false });
    expect(c.getState().view.entries).toHaveLength(script.steps.length);
  });
});

describe("review regressions", () => {
  test("an inline function finalPolicy doesn't count as a change on every update", () => {
    const c = make({ autoStart: false, finalPolicy: () => [0] });
    const listener = vi.fn();
    c.subscribe(listener);
    for (let i = 0; i < 3; i++) {
      c.update(script, { ...options, autoStart: false, finalPolicy: () => [0] });
    }
    expect(listener).not.toHaveBeenCalled();
    expect(c.getState().view.entries).toHaveLength(1);
    c.update(script, { ...options, autoStart: false, finalPolicy: () => [0, 1, 2, 3, 4] });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(c.getState().view.entries).toHaveLength(script.steps.length);
  });

  test("a throwing onStepStart doesn't stop the clock or the view", () => {
    let calls = 0;
    const onStepStart = vi.fn((_index: number) => {
      calls += 1;
      if (calls === 2) throw new Error("boom");
    });
    const c = make({ onStepStart });
    expect(() => advance(startOf(1) + 50)).toThrow("boom");
    expect(c.getState().view.current).toBe(1);
    advance(startOf(3) - startOf(1));
    expect(c.getState()).toMatchObject({ playing: true, turn: 1 });
    expect(onStepStart.mock.calls.map(([i]) => i)).toEqual([0, 1, 2, 3]);
  });

  test("onComplete calling replay plays again cleanly", () => {
    const c = make();
    const onComplete = vi.fn(() => c.getState().controls.replay());
    c.update(script, { ...options, onComplete });
    advance(TOTAL + 50);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(c.getState()).toMatchObject({ playing: true, complete: false });
    expect(c.getState().view.elapsed).toBeLessThan(200);
    advance(TOTAL + 50);
    expect(onComplete).toHaveBeenCalledTimes(2);
  });

  test("a changed speed option replaces a setSpeed rate, also across a remount", () => {
    const c = make();
    c.getState().controls.setSpeed(3);
    c.update(script, { ...options, speed: 5 });
    expect(c.getState().speed).toBe(5);
    c.destroy();
    c.mount();
    expect(c.getState().speed).toBe(5);
  });

  test("a setSpeed rate survives a remount when the option didn't change", () => {
    const c = make({ speed: 2 });
    c.getState().controls.setSpeed(3);
    c.destroy();
    c.mount();
    expect(c.getState().speed).toBe(3);
  });
});
