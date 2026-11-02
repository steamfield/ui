import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { tabForHash, writeHash } from "./core.ts";
import { createTabs } from "./create-tabs.ts";

let dispose: () => void = () => {};

beforeEach(() => {
  history.replaceState(null, "", "/");
  document.body.innerHTML = `
    <div data-part="tabs" id="root">
      <div role="tablist" aria-label="Commands">
        <a role="tab" href="#p-a" data-value="a">A</a>
        <a role="tab" href="#p-b" data-value="b">B</a>
        <a role="tab" href="#p-c" aria-disabled="true">C</a>
        <a role="tab" href="#p-d">D</a>
      </div>
      <section role="tabpanel" id="p-a">a</section>
      <section role="tabpanel" id="p-b">b</section>
      <section role="tabpanel" id="p-c">c</section>
      <section role="tabpanel" id="p-d">d</section>
    </div>`;
});

afterEach(() => {
  dispose();
});

const root = (): HTMLElement => document.getElementById("root") as HTMLElement;
const tab = (name: string): HTMLElement =>
  [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (el) => el.textContent === name,
  ) as HTMLElement;
const panel = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
const visible = (): string[] =>
  [...document.querySelectorAll<HTMLElement>('[role="tabpanel"]')]
    .filter((el) => !el.hidden)
    .map((el) => el.id);
const press = (target: HTMLElement, key: string): KeyboardEvent => {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};

test("setup marks the root live and applies ARIA, the roving tabindex and hidden", () => {
  dispose = createTabs(root());
  expect(root().hasAttribute("data-live")).toBe(true);
  expect(tab("A").getAttribute("aria-selected")).toBe("true");
  expect(tab("A").getAttribute("aria-controls")).toBe("p-a");
  expect(tab("B").getAttribute("aria-selected")).toBe("false");
  expect(tab("A").tabIndex).toBe(0);
  expect(tab("B").tabIndex).toBe(-1);
  expect(tab("A").dataset.state).toBe("active");
  expect(panel("p-a").dataset.state).toBe("active");
  expect(visible()).toEqual(["p-a"]);
});

test("with nothing selected, setup picks the enabled tab whose panel is data-default", () => {
  panel("p-b").setAttribute("data-default", "");
  dispose = createTabs(root());
  expect(tab("B").getAttribute("aria-selected")).toBe("true");
  expect(visible()).toEqual(["p-b"]);
});

test("a disabled tab's data-default panel falls back to the first enabled tab", () => {
  panel("p-c").setAttribute("data-default", "");
  dispose = createTabs(root());
  expect(visible()).toEqual(["p-a"]);
});

test("aria-selected wins over data-default", () => {
  panel("p-b").setAttribute("data-default", "");
  tab("D").setAttribute("aria-selected", "true");
  dispose = createTabs(root());
  expect(visible()).toEqual(["p-d"]);
});

test("a click selects without following the link, and reports the change", () => {
  const onValueChange = vi.fn();
  dispose = createTabs(root(), { onValueChange });
  const click = new MouseEvent("click", { bubbles: true, cancelable: true });
  tab("B").dispatchEvent(click);
  expect(click.defaultPrevented).toBe(true);
  expect(visible()).toEqual(["p-b"]);
  expect(onValueChange).toHaveBeenCalledWith("b");
  tab("B").click();
  expect(onValueChange).toHaveBeenCalledTimes(1);
});

test("auto activation: arrows move focus and select, wrap, and skip disabled tabs", () => {
  dispose = createTabs(root());
  tab("A").focus();
  expect(press(tab("A"), "ArrowRight").defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(tab("B"));
  expect(visible()).toEqual(["p-b"]);
  press(tab("B"), "ArrowRight");
  expect(document.activeElement).toBe(tab("D"));
  press(tab("D"), "ArrowRight");
  expect(document.activeElement).toBe(tab("A"));
  press(tab("A"), "ArrowLeft");
  expect(document.activeElement).toBe(tab("D"));
  expect(visible()).toEqual(["p-d"]);
});

test("Home and End jump to the first and last enabled tab", () => {
  dispose = createTabs(root());
  press(tab("A"), "End");
  expect(document.activeElement).toBe(tab("D"));
  press(tab("D"), "Home");
  expect(document.activeElement).toBe(tab("A"));
  expect(press(tab("A"), "x").defaultPrevented).toBe(false);
});

test("manual activation moves focus only; Enter or Space selects", () => {
  const onValueChange = vi.fn();
  dispose = createTabs(root(), { activation: "manual", onValueChange });
  press(tab("A"), "ArrowRight");
  expect(document.activeElement).toBe(tab("B"));
  expect(visible()).toEqual(["p-a"]);
  expect(onValueChange).not.toHaveBeenCalled();
  expect(press(tab("B"), " ").defaultPrevented).toBe(true);
  expect(visible()).toEqual(["p-b"]);
  press(tab("D"), "Enter");
  expect(onValueChange).toHaveBeenLastCalledWith("p-d");
});

test("vertical orientation uses Up and Down, read from aria-orientation", () => {
  document.querySelector('[role="tablist"]')?.setAttribute("aria-orientation", "vertical");
  dispose = createTabs(root());
  press(tab("A"), "ArrowRight");
  expect(visible()).toEqual(["p-a"]);
  press(tab("A"), "ArrowDown");
  expect(visible()).toEqual(["p-b"]);
  press(tab("B"), "ArrowUp");
  expect(visible()).toEqual(["p-a"]);
});

test("a disabled tab can't be clicked into", () => {
  dispose = createTabs(root());
  tab("C").click();
  expect(visible()).toEqual(["p-a"]);
});

test("reads the hash on setup and on hashchange without firing the event", () => {
  history.replaceState(null, "", "#p-b");
  const onValueChange = vi.fn();
  const events: unknown[] = [];
  document.addEventListener("tab-change", (e) => events.push((e as CustomEvent).detail));
  dispose = createTabs(root(), { hash: "replace", onValueChange, eventName: "tab-change" });
  expect(visible()).toEqual(["p-b"]);
  expect(onValueChange).toHaveBeenCalledWith("b");
  history.replaceState(null, "", "#p-d");
  window.dispatchEvent(new HashChangeEvent("hashchange"));
  expect(visible()).toEqual(["p-d"]);
  history.replaceState(null, "", "#p-c");
  window.dispatchEvent(new HashChangeEvent("hashchange"));
  expect(visible()).toEqual(["p-d"]);
  expect(events).toEqual([]);
});

test("hash 'replace' syncs without adding history; hash true adds an entry", () => {
  const before = history.length;
  dispose = createTabs(root(), { hash: "replace" });
  tab("B").click();
  expect(location.hash).toBe("#p-b");
  expect(history.length).toBe(before);
  dispose();
  dispose = createTabs(root(), { hash: true });
  tab("D").click();
  expect(location.hash).toBe("#p-d");
  expect(history.length).toBe(before + 1);
});

test("hash true replaces for arrow-key auto activation and pushes for clicks and Enter", () => {
  dispose = createTabs(root(), { hash: true });
  const before = history.length;
  press(tab("A"), "ArrowRight");
  expect(location.hash).toBe("#p-b");
  press(tab("B"), "End");
  expect(location.hash).toBe("#p-d");
  expect(history.length).toBe(before);
  tab("A").click();
  expect(history.length).toBe(before + 1);
  press(tab("B"), "Enter");
  expect(history.length).toBe(before + 2);
});

test("dispose restores the markup as it was before setup", () => {
  // Attribute order may differ after a restore, so compare each element's attributes as a map.
  const attrs = (): Record<string, string>[] =>
    [root(), ...root().querySelectorAll("*")].map((el) =>
      Object.fromEntries([...el.attributes].map((a) => [a.name, a.value])),
    );
  const before = attrs();
  dispose = createTabs(root());
  expect(attrs()).not.toEqual(before);
  dispose();
  expect(attrs()).toEqual(before);
  expect(root().hasAttribute("data-live")).toBe(false);
  expect(visible()).toEqual(["p-a", "p-b", "p-c", "p-d"]);
});

test("without hash the URL is left alone", () => {
  history.replaceState(null, "", "#p-b");
  dispose = createTabs(root());
  expect(visible()).toEqual(["p-a"]);
  tab("D").click();
  expect(location.hash).toBe("#p-b");
});

test("dispatches a bubbling CustomEvent with the value when a tab is picked", () => {
  const seen: string[] = [];
  const listener = (event: Event): void => {
    seen.push((event as CustomEvent<{ value: string }>).detail.value);
  };
  window.addEventListener("demo:tab", listener);
  dispose = createTabs(root(), { eventName: "demo:tab" });
  tab("B").click();
  press(tab("B"), "ArrowRight");
  window.removeEventListener("demo:tab", listener);
  expect(seen).toEqual(["b", "p-d"]);
});

test("keeps an aria-selected tab from the markup, and button tabs with aria-controls work", () => {
  document.body.innerHTML = `
    <div id="root">
      <div role="tablist">
        <button role="tab" aria-controls="x">X</button>
        <button role="tab" aria-controls="y" aria-selected="true">Y</button>
        <span>not a tab</span>
      </div>
      <div role="tabpanel" id="x"></div>
    </div>`;
  dispose = createTabs(root());
  expect(tab("Y").getAttribute("aria-selected")).toBe("true");
  expect(panel("x").hidden).toBe(true);
  (document.querySelector("span") as HTMLElement).click();
  press(document.querySelector("span") as HTMLElement, "Enter");
  press(document.querySelector("span") as HTMLElement, "ArrowRight");
  expect(tab("Y").getAttribute("aria-selected")).toBe("true");
});

test("no tablist is a no-op, and the disposer removes listeners", () => {
  document.body.innerHTML = `<div id="root"></div>`;
  createTabs(root())();
  expect(root().hasAttribute("data-live")).toBe(false);
  document.body.innerHTML = `
    <div id="root"><div role="tablist">
      <a role="tab" href="#one">1</a><a role="tab" href="#two">2</a><a role="tab" href="#">3</a>
    </div></div>`;
  const off = createTabs(root());
  off();
  tab("2").click();
  expect(tab("2").hasAttribute("aria-selected")).toBe(false);
  expect(tab("3").hasAttribute("aria-controls")).toBe(false);
});

test("hash helpers decode fragments and ignore an empty one", () => {
  document.body.innerHTML = `<div role="tablist"><a role="tab" href="#caf%C3%A9">x</a></div>`;
  expect(tabForHash(document, "#café")?.textContent).toBe("x");
  expect(tabForHash(document, "#%E0%A4%A")).toBeNull();
  expect(tabForHash(document, "#")).toBeNull();
  writeHash("ignored", false);
  expect(location.hash).toBe("");
});
