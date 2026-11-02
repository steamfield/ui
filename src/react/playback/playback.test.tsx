import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { StrictMode, useEffect } from "react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  FakeIntersectionObserver,
  setTabHidden as hideTab,
  stubIntersectionObserver,
  stubReducedMotion as stubMotion,
} from "../../../tests/helpers/dom.ts";
import type { MotionSource } from "../../playback/motion.ts";
import { useAgentDemo } from "../agent-demo/index.ts";
import {
  type UsePlaybackOptions,
  type UsePlaybackResult,
  useCountUp,
  usePlayback,
} from "./index.ts";

/** Reports every live observer's targets as entering or leaving the viewport. */
const scroll = (isIntersecting: boolean): void =>
  act(() => {
    for (const observer of FakeIntersectionObserver.live()) observer.fire(isIntersecting);
  });

const live = (): FakeIntersectionObserver[] => FakeIntersectionObserver.live();

function stubReducedMotion(initial: boolean): (next: boolean) => void {
  const set = stubMotion(initial);
  return (next) => act(() => set(next));
}

const advance = (ms: number): void =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

const setTabHidden = (hidden: boolean): void => act(() => hideTab(hidden));

const DURATION = 10_000;

/** A demo shaped like the stacks CLI demo: one control that pauses, resumes and replays. */
function Demo(props: UsePlaybackOptions) {
  const playback = usePlayback({ duration: DURATION, ...props });
  let label = playback.paused ? "Resume demo" : "Pause demo";
  if (playback.complete) label = "Replay demo";
  return (
    <div ref={playback.ref}>
      <output data-testid="elapsed">{Math.round(playback.elapsed)}</output>
      <span data-testid="flags">
        {JSON.stringify({
          ready: playback.ready,
          playing: playback.playing,
          reduced: playback.reduced,
        })}
      </span>
      {playback.ready && (
        <button type="button" onClick={playback.complete ? playback.replay : playback.toggle}>
          {label}
        </button>
      )}
    </div>
  );
}

function FinalCount() {
  const { value } = useCountUp(12_847);
  return <span>{value}</span>;
}

function InViewCount() {
  const { ref, value } = useCountUp<HTMLSpanElement>(100, {
    duration: 500,
    threshold: 0.5,
    rootMargin: "10px",
    motion: "full",
    easing: (t) => t,
  });
  return <span ref={ref}>{value}</span>;
}

/** Renders its gating element only once `show` is true, like an iframe behind a state flip. */
function Late({ show }: { show: boolean }) {
  const playback = usePlayback<HTMLElement>({ duration: DURATION });
  return (
    <>
      <output data-testid="elapsed">{Math.round(playback.elapsed)}</output>
      {show && <section title="late" ref={playback.ref} />}
    </>
  );
}

let seen: Element | null = null;

/** Attaches the same ref to one of two elements, recording what `ref.current` reads. */
function Swap({ which }: { which: "a" | "b" }) {
  const playback = usePlayback<HTMLDivElement>({ duration: DURATION });
  useEffect(() => {
    seen = playback.ref.current;
  });
  return which === "a" ? (
    <div key="a" data-testid="a" ref={playback.ref} />
  ) : (
    <div key="b" data-testid="b" ref={playback.ref} />
  );
}

/** Merges the ref by hand through `current`, with a new inline callback every render. */
function Manual() {
  const playback = usePlayback<HTMLDivElement>({ duration: DURATION });
  return (
    <div
      data-testid="manual"
      ref={(node) => {
        playback.ref.current = node;
      }}
    />
  );
}

let latest: UsePlaybackResult<HTMLElement> | undefined;
const hook = (): UsePlaybackResult<HTMLElement> => {
  if (!latest) throw new Error("no hook result");
  return latest;
};

/** One gated element, swapped by `which`, plus an option to change in the same commit. */
function Carry({
  which,
  show = true,
  ...options
}: { which: "a" | "b"; show?: boolean } & UsePlaybackOptions) {
  const playback = usePlayback<HTMLElement>({ duration: DURATION, ...options });
  latest = playback;
  if (!show) return null;
  return which === "a" ? (
    <section key="a" data-testid="a" ref={playback.ref} />
  ) : (
    <section key="b" data-testid="b" ref={playback.ref} />
  );
}

/** `Late`, with callbacks, through the agent demo hook. */
function LateAgentDemo({
  show,
  onStepStart,
}: {
  show: boolean;
  onStepStart: (index: number) => void;
}) {
  const demo = useAgentDemo(
    { steps: [{ kind: "agent-text", text: "Hello there, reader." }] },
    { onStepStart },
  );
  return (
    <>
      <output data-testid="text">{demo.view.entries.length}</output>
      {show && <div data-testid="late-demo" ref={demo.ref} />}
    </>
  );
}

/** `Late` through the count-up hook. */
function LateCount({ show }: { show: boolean }) {
  const { ref, value } = useCountUp<HTMLSpanElement>(100, {
    duration: 500,
    motion: "full",
    easing: (t) => t,
  });
  return (
    <>
      <output data-testid="count">{value}</output>
      {show && <span data-testid="late-count" ref={ref} />}
    </>
  );
}

const elapsed = (): number => Number(screen.getByTestId("elapsed").textContent);
const flags = (): { ready: boolean; playing: boolean; reduced: boolean } =>
  JSON.parse(screen.getByTestId("flags").textContent ?? "{}");

beforeEach(() => {
  vi.useFakeTimers();
  stubIntersectionObserver();
  stubReducedMotion(false);
});

let earlySpeedError: unknown;

/** Calls setSpeed with a bad rate before the gate exists (the server render). */
function EarlySpeed(): null {
  const playback = usePlayback();
  if (!playback.ready) {
    try {
      playback.setSpeed(-1);
    } catch (error) {
      earlySpeedError = error;
    }
  }
  return null;
}

describe("usePlayback", () => {
  test("server render reads no browser state and reports not ready", () => {
    vi.stubGlobal("matchMedia", () => {
      throw new Error("matchMedia during render");
    });
    const html = renderToString(<Demo />);
    expect(html).toContain("&quot;ready&quot;:false");
    expect(html).not.toContain("<button");
  });

  test("becomes ready after mount and plays once in view", () => {
    render(<Demo />);
    expect(flags()).toEqual({ ready: true, playing: false, reduced: false });
    scroll(true);
    advance(1000);
    expect(flags().playing).toBe(true);
    expect(elapsed()).toBeGreaterThan(900);
  });

  test("pauses and resumes from the same position", () => {
    render(<Demo />);
    scroll(true);
    advance(1400);
    fireEvent.click(screen.getByRole("button", { name: "Pause demo" }));
    const at = elapsed();
    advance(5000);
    expect(elapsed()).toBe(at);
    fireEvent.click(screen.getByRole("button", { name: "Resume demo" }));
    advance(DURATION);
    expect(screen.getByRole("button", { name: "Replay demo" })).toBeTruthy();
    expect(elapsed()).toBe(DURATION);
  });

  test("replays from the beginning without moving keyboard focus", () => {
    render(<Demo />);
    scroll(true);
    advance(DURATION + 1000);
    const button = screen.getByRole("button", { name: "Replay demo" });
    button.focus();
    fireEvent.click(button);
    expect(elapsed()).toBe(0);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Pause demo" }));
    advance(DURATION + 1000);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Replay demo" }));
  });

  test("holds its position while the tab is hidden", () => {
    render(<Demo />);
    scroll(true);
    advance(1200);
    setTabHidden(true);
    const at = elapsed();
    advance(10_000);
    expect(elapsed()).toBe(at);
    setTabHidden(false);
    advance(DURATION);
    expect(elapsed()).toBe(DURATION);
  });

  test("cancels playback when it unmounts", () => {
    const cancel = vi.spyOn(globalThis, "cancelAnimationFrame");
    const { unmount } = render(<Demo />);
    scroll(true);
    advance(1000);
    unmount();
    expect(cancel).toHaveBeenCalled();
    expect(live()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("keeps playing through the leave grace period and pauses after it", () => {
    render(<Demo leaveGraceMs={5000} />);
    scroll(true);
    advance(1000);
    scroll(false);
    advance(4000);
    expect(flags().playing).toBe(true);
    scroll(true);
    scroll(false);
    advance(5000);
    expect(flags().playing).toBe(false);
    scroll(true);
    expect(flags().playing).toBe(true);
  });

  test("reduced motion with the end policy shows the final frame", () => {
    stubReducedMotion(true);
    render(<Demo />);
    expect(elapsed()).toBe(DURATION);
    expect(flags()).toMatchObject({ reduced: true, playing: false });
  });

  test("reduced motion with the hold policy keeps the first frame", () => {
    stubReducedMotion(true);
    render(<Demo reducedPolicy="hold" />);
    scroll(true);
    advance(3000);
    expect(elapsed()).toBe(0);
    expect(screen.getByRole("button", { name: "Pause demo" })).toBeTruthy();
  });

  test("a motion store toggled mid-run drives playback", () => {
    let allowed = true;
    const listeners = new Set<() => void>();
    const motion: MotionSource = {
      get: () => allowed,
      subscribe: (cb) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
    };
    const toggle = (next: boolean): void =>
      act(() => {
        allowed = next;
        for (const cb of listeners) cb();
      });
    render(<Demo motion={motion} reducedPolicy="hold" />);
    scroll(true);
    advance(1000);
    toggle(false);
    const at = elapsed();
    advance(2000);
    expect(elapsed()).toBe(at);
    expect(flags().reduced).toBe(true);
    toggle(true);
    advance(1000);
    expect(elapsed()).toBeGreaterThan(at);
  });

  test("a live media query change snaps a running demo to the end", () => {
    const set = stubReducedMotion(false);
    render(<Demo />);
    scroll(true);
    advance(1000);
    set(true);
    expect(elapsed()).toBe(DURATION);
  });

  test("speed changes in place without restarting", () => {
    const { rerender } = render(<Demo speed={1} />);
    scroll(true);
    advance(1000);
    const at = elapsed();
    rerender(<Demo speed={4} />);
    advance(1000);
    expect(elapsed()).toBeGreaterThan(at + 3500);
  });

  test("survives the StrictMode double mount with one live gate", () => {
    render(
      <StrictMode>
        <Demo />
      </StrictMode>,
    );
    expect(live()).toHaveLength(1);
    scroll(true);
    advance(1000);
    expect(elapsed()).toBeGreaterThan(900);
    expect(elapsed()).toBeLessThan(1100);
  });

  test("attaches to an element that mounts after the first render", () => {
    const { rerender } = render(<Late show={false} />);
    // No element yet: autoStart waits for one instead of playing where nobody can see it.
    advance(500);
    expect(elapsed()).toBe(0);
    rerender(<Late show />);
    const frame = screen.getByTitle("late");
    expect(live()).toHaveLength(1);
    expect([...(live()[0]?.targets ?? [])]).toEqual([frame]);
    // Observed, so it waits for the viewport rather than counting as in view.
    advance(500);
    expect(elapsed()).toBe(0);
    scroll(true);
    advance(500);
    expect(elapsed()).toBeGreaterThan(400);
  });

  test("follows a swapped element, and ref.current reads the attached node", () => {
    seen = null;
    const { rerender } = render(<Swap which="a" />);
    expect(seen).toBe(screen.getByTestId("a"));
    rerender(<Swap which="b" />);
    const b = screen.getByTestId("b");
    expect(seen).toBe(b);
    expect(live()).toHaveLength(1);
    expect([...(live()[0]?.targets ?? [])]).toEqual([b]);
  });

  test("a ref assigned through .current, as a RefObject, still gates", () => {
    const { rerender } = render(<Manual />);
    expect([...(live()[0]?.targets ?? [])]).toEqual([screen.getByTestId("manual")]);
    // The inline callback detaches and reattaches the same node each commit: no rebuild.
    rerender(<Manual />);
    rerender(<Manual />);
    expect(FakeIntersectionObserver.instances).toHaveLength(1);
  });

  test("an element swap carries elapsed, started, paused and the rate into the new gate", () => {
    const { rerender } = render(<Carry which="a" />);
    scroll(true);
    advance(1000);
    act(() => hook().setSpeed(2));
    advance(500);
    act(() => hook().pause());
    const at = hook().elapsed;
    expect(at).toBeGreaterThan(1900);
    rerender(<Carry which="b" />);
    expect(live()).toHaveLength(1);
    expect([...(live()[0]?.targets ?? [])]).toEqual([screen.getByTestId("b")]);
    expect(hook()).toMatchObject({ elapsed: at, started: true, paused: true, speed: 2 });
    scroll(true);
    act(() => hook().play());
    advance(500);
    expect(hook().elapsed).toBeGreaterThan(at + 900);
  });

  test("an unstarted gate stays unstarted across a swap", () => {
    const { rerender } = render(<Carry which="a" autoStart={false} />);
    scroll(true);
    rerender(<Carry which="b" autoStart={false} />);
    expect(hook()).toMatchObject({ elapsed: 0, started: false, paused: false });
  });

  test("an option change still starts over at 0, and one landing with a swap builds once", () => {
    const { rerender } = render(<Carry which="a" />);
    scroll(true);
    advance(1000);
    const before = FakeIntersectionObserver.instances.length;
    rerender(<Carry which="b" threshold={0.5} />);
    expect(FakeIntersectionObserver.instances.length).toBe(before + 1);
    expect([...(live()[0]?.targets ?? [])]).toEqual([screen.getByTestId("b")]);
    expect(hook()).toMatchObject({ elapsed: 0, started: true, paused: false });
  });

  test("detaching with no reattach keeps the gate, which reads as out of view", () => {
    const { rerender } = render(<Carry which="a" />);
    scroll(true);
    advance(500);
    const gates = FakeIntersectionObserver.instances.length;
    rerender(<Carry which="a" show={false} />);
    // A browser reports a removed target as no longer intersecting.
    scroll(false);
    advance(500);
    expect(FakeIntersectionObserver.instances.length).toBe(gates);
    expect(hook().playing).toBe(false);
  });

  test("a ref attached late starts fresh: nothing carried from the element-less gate", () => {
    const { rerender } = render(<Carry which="a" show={false} />);
    act(() => hook().play());
    advance(500);
    // Explicitly played with no element: in view, so it ran.
    expect(hook().elapsed).toBeGreaterThan(400);
    rerender(<Carry which="a" />);
    expect(hook()).toMatchObject({ elapsed: 0, started: true, paused: false });
    expect([...(live()[0]?.targets ?? [])]).toEqual([screen.getByTestId("a")]);
  });

  test("a ref that is never attached counts as in view once played", () => {
    render(<Carry which="a" show={false} autoStart={false} />);
    expect(hook().started).toBe(false);
    act(() => hook().play());
    advance(500);
    expect(hook().playing).toBe(true);
  });

  test("useAgentDemo waits for a late element before playing or firing callbacks", () => {
    const onStepStart = vi.fn();
    const { rerender } = render(<LateAgentDemo show={false} onStepStart={onStepStart} />);
    advance(5000);
    expect(onStepStart).not.toHaveBeenCalled();
    rerender(<LateAgentDemo show onStepStart={onStepStart} />);
    expect([...(live()[0]?.targets ?? [])]).toEqual([screen.getByTestId("late-demo")]);
    advance(5000);
    expect(onStepStart).not.toHaveBeenCalled();
    scroll(true);
    advance(5000);
    expect(onStepStart).toHaveBeenCalledTimes(1);
    expect(onStepStart).toHaveBeenCalledWith(0, expect.objectContaining({ kind: "agent-text" }));
  });

  test("controls work through the hook and are no-ops before ready", () => {
    const onFrame = vi.fn();
    const { result } = renderHook(() => usePlayback({ duration: 1000, autoStart: false, onFrame }));
    act(() => result.current.seek(250));
    expect(result.current.elapsed).toBe(250);
    expect(onFrame).toHaveBeenLastCalledWith(250);
    act(() => result.current.play());
    advance(100);
    act(() => result.current.pause());
    expect(result.current.paused).toBe(true);
    act(() => result.current.reset());
    expect(result.current).toMatchObject({ elapsed: 0, paused: false, playing: false });
  });

  test("exposes started, speed and setSpeed from the gate", () => {
    const { result } = renderHook(() =>
      usePlayback({ duration: 10_000, autoStart: false, speed: 2 }),
    );
    expect(result.current).toMatchObject({ started: false, speed: 2 });
    act(() => result.current.seek(500));
    expect(result.current.started).toBe(false);
    act(() => result.current.play());
    expect(result.current.started).toBe(true);
    act(() => result.current.setSpeed(3));
    expect(result.current.speed).toBe(3);
    scroll(true);
    const at = result.current.elapsed;
    advance(1000);
    expect(result.current.elapsed).toBeGreaterThan(at + 2500);
  });

  test("a rate set with setSpeed survives a rebuilt gate", () => {
    const { result, rerender } = renderHook(
      (duration: number) => usePlayback({ duration, autoStart: false, speed: 1 }),
      { initialProps: 10_000 },
    );
    act(() => result.current.setSpeed(3));
    rerender(20_000);
    expect(result.current.speed).toBe(3);
  });

  test("setSpeed throws invalid_option for a bad rate, before and after ready", () => {
    const bad = expect.objectContaining({ code: "invalid_option", field: "speed" });
    renderToString(<EarlySpeed />);
    expect(earlySpeedError).toEqual(bad);
    const { result } = renderHook(() => usePlayback({ duration: 1000 }));
    expect(() => result.current.setSpeed(Number.NaN)).toThrow(bad);
    expect(result.current.speed).toBe(1);
  });
});

describe("useCountUp", () => {
  test("counts up to the target", () => {
    const { result } = renderHook(() => useCountUp(1000, { duration: 500 }));
    expect(result.current.value).toBe(0);
    advance(250);
    expect(result.current.value).toBeGreaterThan(0);
    expect(result.current.value).toBeLessThan(1000);
    advance(2000);
    expect(result.current).toMatchObject({ value: 1000, complete: true });
  });

  test("server markup shows the final number", () => {
    expect(renderToString(<FinalCount />)).toContain("12847");
  });

  test("snaps to the target under reduced motion", () => {
    stubReducedMotion(true);
    const { result } = renderHook(() => useCountUp(12_847, { duration: 2000 }));
    expect(result.current).toMatchObject({ value: 12_847, complete: true });
  });

  test("holds at 0 while disabled and runs once enabled", () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useCountUp(200, { duration: 500, enabled }),
      { initialProps: { enabled: false } },
    );
    advance(1000);
    expect(result.current.value).toBe(0);
    rerender({ enabled: true });
    advance(2000);
    expect(result.current.value).toBe(200);
  });

  test("pausing via enabled mid-count resumes instead of freezing", () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useCountUp(1000, { duration: 1000, enabled }),
      { initialProps: { enabled: true } },
    );
    advance(300);
    rerender({ enabled: false });
    const at = result.current.value;
    advance(1000);
    expect(result.current.value).toBe(at);
    rerender({ enabled: true });
    advance(2000);
    expect(result.current.value).toBe(1000);
  });

  test("a new end mid-count keeps counting to the new target", () => {
    const { result, rerender } = renderHook(({ end }) => useCountUp(end, { duration: 1000 }), {
      initialProps: { end: 100 },
    });
    advance(300);
    rerender({ end: 500 });
    advance(2000);
    expect(result.current.value).toBe(500);
  });

  test("StrictMode's double effect run doesn't freeze the number", () => {
    const { result } = renderHook(() => useCountUp(300, { duration: 500 }), {
      wrapper: StrictMode,
    });
    advance(2000);
    expect(result.current.value).toBe(300);
  });

  test("counts for an element that mounts after the first render, once it is in view", () => {
    const { rerender } = render(<LateCount show={false} />);
    rerender(<LateCount show />);
    expect([...(live()[0]?.targets ?? [])]).toEqual([screen.getByTestId("late-count")]);
    advance(1000);
    expect(screen.getByTestId("count").textContent).toBe("0");
    scroll(true);
    advance(1000);
    expect(screen.getByTestId("count").textContent).toBe("100");
  });

  test("counts only while the attached element is in view", () => {
    const { container } = render(<InViewCount />);
    advance(1000);
    expect(container.textContent).toBe("0");
    scroll(true);
    advance(250);
    expect(Number(container.textContent)).toBeGreaterThan(40);
    advance(1000);
    expect(container.textContent).toBe("100");
  });
});
