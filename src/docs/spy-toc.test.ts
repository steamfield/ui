import { afterEach, expect, it, vi } from "vitest";
import { spyToc } from "./spy-toc.ts";

type Callback = (entries: Array<{ target: Element; isIntersecting: boolean }>) => void;

// The browser decides what is in view; the test plays that part.
let report: Callback = () => undefined;
let margin: string | undefined;
const observed: Element[] = [];
const disconnect = vi.fn();

class FakeObserver {
  constructor(callback: Callback, init?: IntersectionObserverInit) {
    report = callback;
    margin = init?.rootMargin;
  }
  observe(target: Element): void {
    observed.push(target);
  }
  disconnect(): void {
    disconnect();
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  observed.length = 0;
  disconnect.mockClear();
});

function page(): {
  link: (name: string) => string | null | undefined;
  heading: (id: string) => Element;
} {
  document.body.innerHTML = `
    <nav data-toc>
      <a data-toc-link href="#install">Install</a>
      <a data-toc-link href="#build-it">Build it</a>
      <a data-toc-link href="#caf%C3%A9">Café</a>
      <a data-toc-link href="#missing">Missing</a>
    </nav>
    <h2 id="install">Install</h2>
    <h2 id="build-it">Build it</h2>
    <h2 id="café">Café</h2>`;
  return {
    link: (name) =>
      document.querySelector(`[data-toc-link][href="#${name}"]`)?.getAttribute("aria-current"),
    heading: (id) => document.getElementById(id) as Element,
  };
}

it("marks the first section in view and moves the mark as reading continues", () => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  const { link, heading } = page();
  spyToc(document);
  report([{ target: heading("install"), isIntersecting: true }]);
  expect([link("install"), link("build-it")]).toEqual(["location", null]);
  report([
    { target: heading("install"), isIntersecting: false },
    { target: heading("build-it"), isIntersecting: true },
  ]);
  expect([link("install"), link("build-it")]).toEqual([null, "location"]);
});

it("observes only headings that exist and decodes percent-encoded hashes", () => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  const { link, heading } = page();
  spyToc(document);
  expect(observed.map((node) => node.id)).toEqual(["install", "build-it", "café"]);
  report([{ target: heading("café"), isIntersecting: true }]);
  expect(link("caf%C3%A9")).toBe("location");
});

it("keeps the last mark when every heading scrolls out of view", () => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  const { link, heading } = page();
  spyToc(document);
  report([{ target: heading("build-it"), isIntersecting: true }]);
  report([{ target: heading("build-it"), isIntersecting: false }]);
  expect(link("build-it")).toBe("location");
});

it("leaves the links unmarked without IntersectionObserver", () => {
  vi.stubGlobal("IntersectionObserver", undefined);
  Reflect.deleteProperty(window, "IntersectionObserver");
  const { link } = page();
  expect(() => spyToc(document)()).not.toThrow();
  expect([link("install"), link("build-it")]).toEqual([null, null]);
});

it("does nothing when the page has no table of contents", () => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  document.body.innerHTML = "<h2 id='a'>A</h2>";
  spyToc(document);
  expect(observed).toEqual([]);
});

it("tolerates a malformed percent-escape in a link", () => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  document.body.innerHTML = `<a data-toc-link href="#a%E0%A4%A">A</a><h2 id="a%E0%A4%A">A</h2>`;
  spyToc(document);
  expect(observed).toHaveLength(1);
});

it("honors a custom selector, attribute value and margin, and scopes to an element", () => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  const { heading } = page();
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div id="scope"><a class="t" href="#install">i</a></div>`,
  );
  const scope = document.getElementById("scope") as Element;
  spyToc(scope, { linkSelector: ".t", current: "true", rootMargin: "0px" });
  expect(margin).toBe("0px");
  report([{ target: heading("install"), isIntersecting: true }]);
  expect(scope.querySelector(".t")?.getAttribute("aria-current")).toBe("true");
});

it("stops observing when the returned function is called", () => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  page();
  spyToc(document)();
  expect(disconnect).toHaveBeenCalledTimes(1);
});
