import { afterEach, expect, it, vi } from "vitest";
import { FakeIntersectionObserver, stubIntersectionObserver } from "../../tests/helpers/dom.ts";
import { spyToc } from "./spy-toc.ts";

const io = (): FakeIntersectionObserver => FakeIntersectionObserver.last();
const observed = (): Element[] => [...io().targets];

afterEach(() => {
  document.body.innerHTML = "";
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
  stubIntersectionObserver();
  const { link, heading } = page();
  spyToc(document);
  io().enter(heading("install"));
  expect([link("install"), link("build-it")]).toEqual(["location", null]);
  io().report([
    { target: heading("install"), isIntersecting: false },
    { target: heading("build-it"), isIntersecting: true },
  ]);
  expect([link("install"), link("build-it")]).toEqual([null, "location"]);
});

it("observes only headings that exist and decodes percent-encoded hashes", () => {
  stubIntersectionObserver();
  const { link, heading } = page();
  spyToc(document);
  expect(observed().map((node) => node.id)).toEqual(["install", "build-it", "café"]);
  io().enter(heading("café"));
  expect(link("caf%C3%A9")).toBe("location");
});

it("keeps the last mark when every heading scrolls out of view", () => {
  stubIntersectionObserver();
  const { link, heading } = page();
  spyToc(document);
  io().enter(heading("build-it"));
  io().leave(heading("build-it"));
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
  stubIntersectionObserver();
  document.body.innerHTML = "<h2 id='a'>A</h2>";
  spyToc(document);
  expect(FakeIntersectionObserver.instances).toEqual([]);
});

it("tolerates a malformed percent-escape in a link", () => {
  stubIntersectionObserver();
  document.body.innerHTML = `<a data-toc-link href="#a%E0%A4%A">A</a><h2 id="a%E0%A4%A">A</h2>`;
  spyToc(document);
  expect(observed()).toHaveLength(1);
});

it("honors a custom selector, attribute value and margin, and scopes to an element", () => {
  stubIntersectionObserver();
  const { heading } = page();
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div id="scope"><a class="t" href="#install">i</a></div>`,
  );
  const scope = document.getElementById("scope") as Element;
  spyToc(scope, { linkSelector: ".t", current: "true", rootMargin: "0px" });
  expect(io().rootMargin).toBe("0px");
  io().enter(heading("install"));
  expect(scope.querySelector(".t")?.getAttribute("aria-current")).toBe("true");
});

it("stops observing when the returned function is called", () => {
  stubIntersectionObserver();
  page();
  spyToc(document)();
  expect(io().disconnected).toBe(true);
  expect(FakeIntersectionObserver.live()).toEqual([]);
});
