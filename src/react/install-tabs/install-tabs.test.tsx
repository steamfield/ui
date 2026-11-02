// Merges the identical InstallTabs tests from the rr site and the stacks astro-product-site
// template, and adds copy failure, Home/End, reset and no-JS cases.
import { act, cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { InstallTabs } from "./install-tabs.tsx";

const options = [
  { id: "npm", label: "npm", command: "npm install -g acme" },
  { id: "bun", label: "bun", command: "bun add -g acme", note: "Needs Bun 1.2 or later." },
  { id: "brew", label: "brew", command: "brew install acme" },
];

const writeText = vi.fn<(text: string) => Promise<void>>();

const stubClipboard = (): void => {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
};

/** userEvent.setup() installs its own clipboard, so the stub goes on after it. */
function setup(): ReturnType<typeof userEvent.setup> {
  const user = userEvent.setup();
  stubClipboard();
  return user;
}

beforeEach(() => {
  history.replaceState(null, "", "/");
  writeText.mockReset().mockResolvedValue(undefined);
  stubClipboard();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const status = (): string => screen.getByRole("status").textContent ?? "";

test("shows the first command before any interaction", () => {
  render(<InstallTabs options={options} />);
  expect(screen.getByRole("tab", { name: "npm" }).getAttribute("aria-selected")).toBe("true");
  expect(screen.getByRole("tabpanel").textContent).toContain("npm install -g acme");
});

test("switches tabs by click and arrow keys", async () => {
  const user = setup();
  render(<InstallTabs options={options} />);
  await user.click(screen.getByRole("tab", { name: "bun" }));
  expect(screen.getByRole("tabpanel").textContent).toContain("bun add -g acme");
  expect(screen.getByRole("tabpanel").textContent).toContain("Needs Bun 1.2 or later.");
  await user.keyboard("{ArrowRight}");
  expect(document.activeElement).toBe(screen.getByRole("tab", { name: "brew" }));
  await user.keyboard("{ArrowRight}");
  expect(document.activeElement).toBe(screen.getByRole("tab", { name: "npm" }));
  expect(screen.getByRole("tabpanel").textContent).toContain("npm install -g acme");
});

test("Home and End jump to the first and last option", async () => {
  const user = setup();
  render(<InstallTabs options={options} />);
  await user.click(screen.getByRole("tab", { name: "npm" }));
  await user.keyboard("{End}");
  expect(screen.getByRole("tabpanel").textContent).toContain("brew install acme");
  await user.keyboard("{Home}");
  expect(screen.getByRole("tabpanel").textContent).toContain("npm install -g acme");
});

test("copies the visible command, announces it, and reports it", async () => {
  const user = setup();
  const onCopy = vi.fn();
  render(<InstallTabs options={options} onCopy={onCopy} />);
  await user.click(screen.getByRole("button", { name: "Copy" }));
  expect(writeText).toHaveBeenCalledWith("npm install -g acme");
  expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
  expect(status()).toBe("Copied to clipboard.");
  expect(onCopy).toHaveBeenCalledWith("npm", true);
});

test("the copied state resets after the timeout", async () => {
  vi.useFakeTimers();
  render(<InstallTabs options={options} resetMs={500} />);
  await act(async () => screen.getByRole("button", { name: "Copy" }).click());
  expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
  act(() => vi.advanceTimersByTime(500));
  expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
  expect(status()).toBe("");
});

test("the copied state resets on a tab switch", async () => {
  const user = setup();
  render(<InstallTabs options={options} />);
  await user.click(screen.getByRole("button", { name: "Copy" }));
  await user.click(screen.getByRole("tab", { name: "bun" }));
  expect(status()).toBe("");
  await user.click(screen.getByRole("tab", { name: "npm" }));
  expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
});

test("a clipboard rejection shows a failure message instead of escaping", async () => {
  const user = setup();
  writeText.mockRejectedValue(new Error("denied"));
  document.execCommand = vi.fn(() => false);
  const onCopy = vi.fn();
  render(<InstallTabs options={options} onCopy={onCopy} />);
  await user.click(screen.getByRole("button", { name: "Copy" }));
  expect(status()).toBe("Copy failed. Select the command and copy it manually.");
  expect(screen.getByRole("status").dataset.state).toBe("failed");
  expect(screen.getByRole("button", { name: "Copy" }).dataset.state).toBe("failed");
  expect(onCopy).toHaveBeenCalledWith("npm", false);
});

test("a copy that resolves after a tab switch doesn't mark the new tab", async () => {
  const user = setup();
  let resolve: () => void = () => {};
  writeText.mockReturnValue(new Promise<void>((r) => (resolve = r)));
  const onCopy = vi.fn();
  render(<InstallTabs options={options} onCopy={onCopy} />);
  await user.click(screen.getByRole("button", { name: "Copy" }));
  await user.click(screen.getByRole("tab", { name: "bun" }));
  await act(async () => resolve());
  expect(onCopy).toHaveBeenCalledWith("npm", true);
  expect(status()).toBe("");
});

test("labels replace every visible string", async () => {
  const user = setup();
  render(
    <InstallTabs
      options={options}
      labels={{
        tabList: "Paquet",
        prompt: ">",
        copy: "Copier",
        copied: "Copié",
        copiedMessage: "Copié.",
        failed: "Échec.",
      }}
    />,
  );
  expect(screen.getByRole("tablist", { name: "Paquet" })).toBeTruthy();
  expect(document.querySelector('[data-part="prompt"]')?.textContent).toBe("> ");
  await user.click(screen.getByRole("button", { name: "Copier" }));
  expect(screen.getByRole("button", { name: "Copié" })).toBeTruthy();
  expect(status()).toBe("Copié.");
});

test("the $ prompt is hidden from assistive tech and not selectable; '' removes it", () => {
  render(<InstallTabs options={options} />);
  const prompt = document.querySelector<HTMLElement>('[data-part="prompt"]');
  expect(prompt?.getAttribute("aria-hidden")).toBe("true");
  expect(prompt?.style.userSelect).toBe("none");
  cleanup();
  render(<InstallTabs options={options} labels={{ prompt: "" }} />);
  expect(document.querySelector('[data-part="prompt"]')).toBeNull();
});

test("server markup has every command, tab links, hidden copy buttons, no aria-selected", () => {
  const html = renderToStaticMarkup(<InstallTabs id="install" options={options} />);
  for (const option of options) expect(html).toContain(option.command);
  expect(html).toContain('href="#install-bun"');
  expect(html).toContain('id="install-brew"');
  expect(html).not.toContain("aria-selected");
  expect(html).toMatch(/<button[^>]*hidden/);
});

test("defaultValue, hash, onValueChange and the CustomEvent pass through", async () => {
  const user = setup();
  const onValueChange = vi.fn();
  const seen = vi.fn();
  window.addEventListener("demo:install", seen);
  render(
    <InstallTabs
      id="i"
      options={options}
      defaultValue="bun"
      hash="replace"
      activation="manual"
      eventName="demo:install"
      onValueChange={onValueChange}
      className="box"
    />,
  );
  expect(screen.getByRole("tabpanel").textContent).toContain("bun add -g acme");
  await user.click(screen.getByRole("tab", { name: "brew" }));
  window.removeEventListener("demo:install", seen);
  expect(location.hash).toBe("#i-brew");
  expect(onValueChange).toHaveBeenCalledWith("brew");
  expect(seen).toHaveBeenCalledTimes(1);
  expect(document.querySelector(".box")?.getAttribute("data-part")).toBe("install-tabs");
});

test("an unknown defaultValue falls back to the first option", () => {
  render(<InstallTabs options={options} defaultValue="pip" />);
  expect(screen.getByRole("tabpanel").textContent).toContain("npm install -g acme");
});

test("renders nothing without options", () => {
  const { container } = render(<InstallTabs options={[]} />);
  expect(container.innerHTML).toBe("");
});
