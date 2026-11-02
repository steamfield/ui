import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { MotionSource } from "../../playback/motion.ts";
import { type UsePlaybackOptions, useCountUp, usePlayback } from "./index.ts";

class FakeObserver {
  static instances: FakeObserver[] = [];
  readonly targets = new Set<Element>();
  disconnected = false;
  readonly callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
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
  }
}

/** Reports every live observer's targets as entering or leaving the viewport. */
const scroll = (isIntersecting: boolean): void =>
  act(() => {
    for (const observer of FakeObserver.instances.filter((o) => !o.disconnected)) {
      const entries = [...observer.targets].map((target) => ({ target, isIntersecting }));
      observer.callback(entries as unknown as IntersectionObserverEntry[], observer as never);
    }
  });

const live = (): FakeObserver[] => FakeObserver.instances.filter((o) => !o.disconnected);

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
    act(() => {
      for (const cb of listeners) cb();
    });
  };
}

const advance = (ms: number): void =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

const setTabHidden = (hidden: boolean): void =>
  act(() => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue(hidden ? "hidden" : "visible");
    document.dispatchEvent(new Event("visibilitychange"));
  });

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

const elapsed = (): number => Number(screen.getByTestId("elapsed").textContent);
const flags = (): { ready: boolean; playing: boolean; reduced: boolean } =>
  JSON.parse(screen.getByTestId("flags").textContent ?? "{}");

beforeEach(() => {
  vi.useFakeTimers();
  FakeObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  stubReducedMotion(false);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

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
