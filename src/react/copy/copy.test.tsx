import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { enhanceCopyButtons } from "../../copy/enhance.ts";
import { CopyCommand } from "./copy-command.tsx";
import { useCopy } from "./use-copy.ts";

const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

test("server markup keeps the command readable and the button hidden", () => {
  const html = renderToStaticMarkup(<CopyCommand id="install" command="bun add @steamfield/ui" />);
  expect(html).toContain("bun add @steamfield/ui");
  expect(html).toMatch(/<button[^>]*hidden/);
  expect(html).toContain('aria-hidden="true"');
});

test("enhanceCopyButtons wires the rendered component", async () => {
  render(<CopyCommand id="install" command="bun add @steamfield/ui" />);
  enhanceCopyButtons(document);
  const button = screen.getByRole("button", { name: "Copy command" });
  await act(async () => button.click());
  expect(writeText).toHaveBeenCalledWith("bun add @steamfield/ui");
  expect(screen.getByRole("status").textContent).toBe("Copied to clipboard.");
});

test("prose renders a prompt without the shell glyph", () => {
  render(<CopyCommand id="p" command="Build a site" prose />);
  expect(document.querySelector("button")?.getAttribute("aria-label")).toBe("Copy prompt");
  expect(document.querySelector("#p")?.tagName).toBe("DIV");
  expect(document.querySelector('[data-part="prompt"]')).toBeNull();
});

test("useCopy flips copied, resets, and reports to onCopy", async () => {
  vi.useFakeTimers();
  const onCopy = vi.fn();
  const { result } = renderHook(() => useCopy({ resetMs: 500, onCopy }));
  await act(async () => {
    expect(await result.current.copy("x")).toBe(true);
  });
  expect(result.current.copied).toBe(true);
  expect(onCopy).toHaveBeenCalledWith(true);
  act(() => vi.advanceTimersByTime(500));
  expect(result.current.copied).toBe(false);
});

test("useCopy reports failure without throwing", async () => {
  writeText.mockRejectedValue(new Error("denied"));
  document.execCommand = vi.fn(() => false);
  const { result } = renderHook(() => useCopy());
  await act(async () => {
    expect(await result.current.copy("x")).toBe(false);
  });
  expect(result.current.failed).toBe(true);
});
