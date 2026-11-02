// Browser APIs that happy-dom lacks or can't drive, faked the same way for every library test.
// Each stub goes through vi.stubGlobal or vi.spyOn (undone by unstubGlobals/restoreMocks in
// vitest.config.ts) or onTestFinished, so nothing leaks into the next test.
import { onTestFinished, vi } from "vitest";

type Report = { readonly target: Element; readonly isIntersecting: boolean };

/** An IntersectionObserver the test drives by hand: it plays the browser deciding what's in view. */
export class FakeIntersectionObserver implements IntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly root: Element | Document | null;
  readonly rootMargin: string;
  readonly scrollMargin: string = "0px";
  readonly thresholds: readonly number[];
  readonly options: IntersectionObserverInit;
  readonly targets: Set<Element> = new Set();
  disconnected = false;
  readonly #callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit = {}) {
    this.#callback = callback;
    this.options = options;
    this.root = options.root ?? null;
    this.rootMargin = options.rootMargin ?? "0px";
    const threshold = options.threshold ?? 0;
    this.thresholds = Array.isArray(threshold) ? threshold : [threshold as number];
    FakeIntersectionObserver.instances.push(this);
  }

  /** Observers that have not been disconnected, oldest first. */
  static live(): FakeIntersectionObserver[] {
    return FakeIntersectionObserver.instances.filter((o) => !o.disconnected);
  }

  /** The most recently constructed observer. */
  static last(): FakeIntersectionObserver {
    const last = FakeIntersectionObserver.instances.at(-1);
    if (!last) throw new Error("no IntersectionObserver was created");
    return last;
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
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  /** Reports the given targets as entering the viewport, in one callback. */
  enter(...targets: Element[]): void {
    this.report(targets.map((target) => ({ target, isIntersecting: true })));
  }
  /** Reports the given targets as leaving the viewport, in one callback. */
  leave(...targets: Element[]): void {
    this.report(targets.map((target) => ({ target, isIntersecting: false })));
  }
  /** Reports every observed target as entering or leaving the viewport. */
  fire(isIntersecting: boolean): void {
    this.report([...this.targets].map((target) => ({ target, isIntersecting })));
  }
  /** One callback with a mixed batch of entries, as a browser sends after a scroll. */
  report(entries: readonly Report[]): void {
    const full = entries.map(({ target, isIntersecting }) => {
      const rect = target.getBoundingClientRect();
      return {
        target,
        isIntersecting,
        intersectionRatio: isIntersecting ? 1 : 0,
        boundingClientRect: rect,
        intersectionRect: rect,
        rootBounds: null,
        time: performance.now(),
      };
    });
    this.#callback(full, this);
  }
}

/** Installs FakeIntersectionObserver as the global, with no instances yet. */
export function stubIntersectionObserver(): void {
  FakeIntersectionObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
}

/**
 * A live `matchMedia`: `(prefers-reduced-motion: reduce)` matches when reduced motion is on,
 * every other query never matches. Returns a setter that flips the preference and notifies the
 * change listeners, as the OS setting would.
 */
export function stubReducedMotion(initial: boolean): (next: boolean) => void {
  let reduce = initial;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const isReduce = (query: string): boolean => query.includes("prefers-reduced-motion: reduce");
  vi.stubGlobal("matchMedia", (query: string): MediaQueryList => {
    const list = {
      media: query,
      get matches() {
        return isReduce(query) && reduce;
      },
      onchange: null,
      addEventListener: (_: string, cb: (event: MediaQueryListEvent) => void) => {
        if (isReduce(query)) listeners.add(cb);
      },
      removeEventListener: (_: string, cb: (event: MediaQueryListEvent) => void) => {
        listeners.delete(cb);
      },
      addListener: (cb: (event: MediaQueryListEvent) => void) => {
        if (isReduce(query)) listeners.add(cb);
      },
      removeListener: (cb: (event: MediaQueryListEvent) => void) => {
        listeners.delete(cb);
      },
      dispatchEvent: () => true,
    };
    return list as unknown as MediaQueryList;
  });
  return (next) => {
    reduce = next;
    const event = { matches: next, media: "(prefers-reduced-motion: reduce)" };
    for (const cb of [...listeners]) cb(event as MediaQueryListEvent);
  };
}

/** Hides or shows the tab: `document.visibilityState` and `hidden` change, then the event fires. */
export function setTabHidden(hidden: boolean): void {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue(hidden ? "hidden" : "visible");
  vi.spyOn(document, "hidden", "get").mockReturnValue(hidden);
  document.dispatchEvent(new Event("visibilitychange"));
}

/**
 * Replaces `navigator.clipboard` with one whose `writeText` is the given function. Call it after
 * `userEvent.setup()`, which installs its own clipboard.
 */
export function stubClipboard<T extends (text: string) => Promise<void>>(writeText: T): T {
  vi.spyOn(navigator, "clipboard", "get").mockReturnValue({ writeText } as unknown as Clipboard);
  return writeText;
}

/** Removes `navigator.clipboard`, as on an insecure origin. */
export function removeClipboard(): void {
  vi.spyOn(navigator, "clipboard", "get").mockReturnValue(undefined as unknown as Clipboard);
}

/**
 * Gives `document` an `execCommand` (happy-dom has none, so vi.spyOn has nothing to wrap) and
 * removes it when the test finishes.
 */
export function stubExecCommand(result: () => boolean): ReturnType<typeof vi.fn> {
  const execCommand = vi.fn(result);
  Object.defineProperty(document, "execCommand", {
    value: execCommand,
    configurable: true,
    writable: true,
  });
  onTestFinished(() => {
    Reflect.deleteProperty(document, "execCommand");
  });
  return execCommand;
}

/**
 * Runs `requestAnimationFrame` on a 16ms `setTimeout`, so frames advance with the fake clock
 * (`vi.advanceTimersByTime`) like every other timer.
 */
export function stubAnimationFrame(): void {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 16),
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
}
