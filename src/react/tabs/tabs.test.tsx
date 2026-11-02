import { act, cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { type ReactElement, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { Tab, TabList, TabPanel, Tabs, type TabsProps } from "./tabs.tsx";

beforeEach(() => {
  history.replaceState(null, "", "/");
});

const commands = [
  { name: "doctor", command: "rr doctor", caption: "Checks hosts" },
  { name: "status", command: "rr status", caption: "Who holds a lock" },
];

/** The CommandTabs shape from the rr site, rebuilt on the shared components. */
function Commands(props: Omit<TabsProps, "children">): ReactElement {
  return (
    <Tabs id="cmd" orientation="vertical" hash="replace" {...props}>
      <TabList aria-label="Commands">
        {commands.map((cmd) => (
          <Tab key={cmd.name} value={cmd.name}>
            <code>{cmd.command}</code> <span>{cmd.caption}</span>
          </Tab>
        ))}
      </TabList>
      {commands.map((cmd) => (
        <TabPanel key={cmd.name} value={cmd.name}>
          output of {cmd.command}
        </TabPanel>
      ))}
    </Tabs>
  );
}

function Four(props: Omit<TabsProps, "children">): ReactElement {
  return (
    <Tabs id="t" {...props}>
      <TabList aria-label="Letters">
        <Tab value="a">A</Tab>
        <Tab value="b">B</Tab>
        <Tab value="c" disabled>
          C
        </Tab>
        <Tab value="d">D</Tab>
      </TabList>
      <TabPanel value="a">panel a</TabPanel>
      <TabPanel value="b">panel b</TabPanel>
      <TabPanel value="c">panel c</TabPanel>
      <TabPanel value="d">panel d</TabPanel>
    </Tabs>
  );
}

function Controlled(): ReactElement {
  const [value, setValue] = useState("b");
  return <Four value={value} onValueChange={setValue} />;
}

const tab = (name: string | RegExp): HTMLElement => screen.getByRole("tab", { name });
const shownPanel = (): HTMLElement => screen.getByRole("tabpanel");

describe("ported from rr CommandTabs", () => {
  test("switches commands by click and arrow keys, and records the tab in the URL", async () => {
    const user = userEvent.setup();
    render(<Commands />);
    expect(tab(/rr doctor/).getAttribute("aria-selected")).toBe("true");
    await user.click(tab(/rr status/));
    expect(shownPanel().id).toBe("cmd-status");
    expect(window.location.hash).toBe("#cmd-status");
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(tab(/rr doctor/));
    expect(shownPanel().id).toBe("cmd-doctor");
  });

  test("announces tab switches through a CustomEvent", async () => {
    const user = userEvent.setup();
    const seen: string[] = [];
    const listener = (event: Event): void => {
      seen.push((event as CustomEvent<{ value: string }>).detail.value);
    };
    window.addEventListener("demo:command-tab", listener);
    render(<Commands eventName="demo:command-tab" />);
    await user.click(tab(/rr status/));
    await user.click(tab(/rr status/));
    window.removeEventListener("demo:command-tab", listener);
    expect(seen).toEqual(["status"]);
  });

  test("selects the panel the hash names on mount, without announcing it", () => {
    history.replaceState(null, "", "#cmd-status");
    const seen = vi.fn();
    window.addEventListener("demo:command-tab", seen);
    render(<Commands eventName="demo:command-tab" />);
    window.removeEventListener("demo:command-tab", seen);
    expect(shownPanel().id).toBe("cmd-status");
    expect(seen).not.toHaveBeenCalled();
  });
});

test("server markup keeps every panel, anchors to each, and no aria-selected", () => {
  const html = renderToStaticMarkup(<Four />);
  for (const letter of ["a", "b", "c", "d"]) {
    expect(html).toContain(`panel ${letter}`);
    expect(html).toContain(`id="t-${letter}"`);
  }
  expect(html).toContain('href="#t-a"');
  expect(html).not.toContain("aria-selected");
  expect(html).not.toContain("hidden");
  expect(html).not.toContain("data-live");
  expect(html).not.toContain('tabindex="-1"');
});

test("the server marks the defaultValue panel data-default so the no-JS CSS can show it", () => {
  for (const keepMounted of [true, false]) {
    const html = renderToStaticMarkup(<Four keepMounted={keepMounted} defaultValue="b" />);
    expect(html.match(/data-default=""/g)).toHaveLength(1);
    expect(html).toMatch(/id="t-b"[^>]*data-default=""/);
    expect(html).toContain("panel b");
  }
  expect(renderToStaticMarkup(<Four keepMounted={false} defaultValue="b" />)).not.toContain(
    "panel a",
  );
  expect(renderToStaticMarkup(<Four />)).not.toContain("data-default");
  expect(renderToStaticMarkup(<Four value="d" />)).toMatch(/id="t-d"[^>]*data-default=""/);
});

test("keepMounted false renders only the selected panel's content", async () => {
  const user = userEvent.setup();
  expect(renderToStaticMarkup(<Four keepMounted={false} />)).toContain("panel d");
  render(<Four keepMounted={false} />);
  expect(screen.queryByText("panel b")).toBeNull();
  await user.click(tab("B"));
  expect(screen.getByText("panel b")).toBeTruthy();
  expect(screen.queryByText("panel a")).toBeNull();
});

test("after hydration the root is live and inactive panels are hidden", () => {
  const { container } = render(<Four />);
  expect(container.querySelector('[data-part="tabs"]')?.hasAttribute("data-live")).toBe(true);
  expect(tab("A").tabIndex).toBe(0);
  expect(tab("B").tabIndex).toBe(-1);
  expect(tab("A").dataset.state).toBe("active");
  expect(shownPanel().textContent).toBe("panel a");
  expect(screen.getByText("panel b").hidden).toBe(true);
});

test("Home and End jump to the ends; arrows skip disabled tabs", async () => {
  const user = userEvent.setup();
  render(<Four />);
  await user.click(tab("B"));
  await user.keyboard("{ArrowRight}");
  expect(document.activeElement).toBe(tab("D"));
  await user.keyboard("{Home}");
  expect(document.activeElement).toBe(tab("A"));
  await user.keyboard("{End}");
  expect(document.activeElement).toBe(tab("D"));
  expect(shownPanel().textContent).toBe("panel d");
});

test("a disabled tab has no link and ignores clicks", async () => {
  const user = userEvent.setup();
  const onValueChange = vi.fn();
  render(<Four onValueChange={onValueChange} />);
  expect(tab("C").getAttribute("aria-disabled")).toBe("true");
  expect(tab("C").hasAttribute("href")).toBe(false);
  await user.click(tab("C"));
  expect(onValueChange).not.toHaveBeenCalled();
  expect(shownPanel().textContent).toBe("panel a");
});

test("manual activation moves focus only; Enter and Space select", async () => {
  const user = userEvent.setup();
  const onValueChange = vi.fn();
  render(<Four activation="manual" onValueChange={onValueChange} />);
  await user.click(tab("A"));
  await user.keyboard("{ArrowRight}");
  expect(document.activeElement).toBe(tab("B"));
  expect(shownPanel().textContent).toBe("panel a");
  expect(onValueChange).not.toHaveBeenCalled();
  await user.keyboard(" ");
  expect(shownPanel().textContent).toBe("panel b");
  await user.keyboard("{ArrowRight}{Enter}");
  expect(onValueChange).toHaveBeenLastCalledWith("d");
});

test("auto activation selects as arrows move", async () => {
  const user = userEvent.setup();
  render(<Four />);
  await user.click(tab("A"));
  await user.keyboard("{ArrowLeft}");
  expect(shownPanel().textContent).toBe("panel d");
  await user.keyboard("{ArrowDown}");
  expect(shownPanel().textContent).toBe("panel d");
});

test("buttons instead of anchors, with a native disabled", () => {
  render(<Four asAnchors={false} />);
  expect(tab("A").tagName).toBe("BUTTON");
  expect((tab("C") as HTMLButtonElement).disabled).toBe(true);
});

test("controlled mode follows value and asks the parent to change it", async () => {
  const user = userEvent.setup();
  render(<Controlled />);
  expect(shownPanel().textContent).toBe("panel b");
  await user.click(tab("D"));
  expect(shownPanel().textContent).toBe("panel d");

  cleanup();
  const fixed = vi.fn();
  render(<Four value="a" onValueChange={fixed} />);
  await user.click(tab("B"));
  expect(fixed).toHaveBeenCalledWith("b");
  expect(shownPanel().textContent).toBe("panel a");
});

test("in controlled mode a hash on mount reaches the parent through onValueChange", () => {
  history.replaceState(null, "", "#t-d");
  const onValueChange = vi.fn();
  render(<Four value="a" hash onValueChange={onValueChange} />);
  expect(onValueChange).toHaveBeenCalledWith("d");
});

test("hash true adds history, hash 'replace' doesn't, and hashchange selects", async () => {
  const user = userEvent.setup();
  const before = history.length;
  render(<Four hash />);
  await user.click(tab("B"));
  expect(location.hash).toBe("#t-b");
  expect(history.length).toBe(before + 1);
  history.replaceState(null, "", "#t-d");
  act(() => {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  expect(shownPanel().textContent).toBe("panel d");
  cleanup();
  render(<Four hash="replace" />);
  await user.click(tab("A"));
  expect(location.hash).toBe("#t-a");
  expect(history.length).toBe(before + 1);
});

test("hash true replaces for arrow-key auto activation and pushes for clicks and Enter", async () => {
  const user = userEvent.setup();
  render(<Four hash />);
  const before = history.length;
  tab("A").focus();
  await user.keyboard("{ArrowRight}");
  expect(location.hash).toBe("#t-b");
  await user.keyboard("{End}");
  expect(location.hash).toBe("#t-d");
  expect(history.length).toBe(before);
  await user.click(tab("A"));
  expect(history.length).toBe(before + 1);
  tab("B").focus();
  await user.keyboard("{Enter}");
  expect(history.length).toBe(before + 2);
});

test("without hash the URL is left alone and a hash is ignored", async () => {
  const user = userEvent.setup();
  history.replaceState(null, "", "#t-b");
  render(<Four />);
  expect(shownPanel().textContent).toBe("panel a");
  await user.click(tab("D"));
  expect(location.hash).toBe("#t-b");
});

test("parts outside Tabs render static markup instead of throwing", () => {
  const html = renderToStaticMarkup(
    <>
      <TabList>
        <Tab value="x">X</Tab>
      </TabList>
      <TabPanel value="x">x</TabPanel>
    </>,
  );
  expect(html).toContain('href="#tabs-x"');
  expect(html).not.toContain("aria-selected");
  render(<Tab value="x">X</Tab>);
  tab("X").click();
  expect(tab("X").hasAttribute("aria-selected")).toBe(false);
});
