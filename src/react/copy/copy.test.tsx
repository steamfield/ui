import { act, render, renderHook, screen } from "@testing-library/react";
import { type ReactElement, StrictMode, useLayoutEffect, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, test, vi } from "vitest";
import { stubClipboard, stubExecCommand } from "../../../tests/helpers/dom.ts";
import { enhanceCopyButtons } from "../../copy/enhance.ts";
import { CopyCommand } from "./copy-command.tsx";
import { useCopy } from "./use-copy.ts";

const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  stubClipboard(writeText);
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

test("part class names reach the button, prompt and command", () => {
  const { container } = render(
    <CopyCommand
      id="c"
      command="ls"
      className="wrap"
      buttonClassName="btn"
      promptClassName="glyph"
      commandClassName="cmd"
    />,
  );
  expect(container.querySelector('[data-part="copy-command"]')?.className).toBe("wrap");
  expect(container.querySelector('[data-part="copy-button"]')?.className).toBe("btn");
  expect(container.querySelector('[data-part="prompt"]')?.className).toBe("glyph");
  expect(container.querySelector('[data-part="command"]')?.className).toBe("cmd");
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

/** A control over `useCopy` that shows its state as text, as a consumer's button would. */
function CopyProbe({ resetMs }: { readonly resetMs?: number | false }): ReactElement {
  const { copied, failed, copy } = useCopy(resetMs === undefined ? {} : { resetMs });
  let label = "Copy";
  if (copied) label = "Copied";
  else if (failed) label = "Failed";
  return (
    <button type="button" onClick={() => void copy("x")}>
      {label}
    </button>
  );
}

test("useCopy with resetMs false stays copied until the next attempt", async () => {
  vi.useFakeTimers();
  render(<CopyProbe resetMs={false} />);
  await act(async () => screen.getByRole("button").click());
  expect(screen.getByRole("button").textContent).toBe("Copied");
  act(() => vi.advanceTimersByTime(60 * 60 * 1000));
  expect(screen.getByRole("button").textContent).toBe("Copied");
  writeText.mockRejectedValue(new Error("denied"));
  stubExecCommand(() => false);
  await act(async () => screen.getByRole("button").click());
  expect(screen.getByRole("button").textContent).toBe("Failed");
});

test("useCopy switching resetMs from false to a number resets the next copy", async () => {
  vi.useFakeTimers();
  const { rerender } = render(<CopyProbe resetMs={false} />);
  rerender(<CopyProbe resetMs={300} />);
  await act(async () => screen.getByRole("button").click());
  expect(screen.getByRole("button").textContent).toBe("Copied");
  act(() => vi.advanceTimersByTime(300));
  expect(screen.getByRole("button").textContent).toBe("Copy");
});

test.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
  "useCopy rejects resetMs %s with invalid_option on resetMs at render",
  (resetMs) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<CopyProbe resetMs={resetMs} />)).toThrow(
      expect.objectContaining({ code: "invalid_option", field: "resetMs" }),
    );
    expect(() => renderToStaticMarkup(<CopyProbe resetMs={resetMs} />)).toThrow(
      expect.objectContaining({ code: "invalid_option", field: "resetMs" }),
    );
  },
);

test("useCopy reports failure without throwing", async () => {
  writeText.mockRejectedValue(new Error("denied"));
  stubExecCommand(() => false);
  const { result } = renderHook(() => useCopy());
  await act(async () => {
    expect(await result.current.copy("x")).toBe(false);
  });
  expect(result.current.failed).toBe(true);
});

const strict = { wrapper: StrictMode };

test("useCopy under StrictMode copies, reports once and resets", async () => {
  vi.useFakeTimers();
  const onCopy = vi.fn();
  const { result } = renderHook(() => useCopy({ resetMs: 500, onCopy }), strict);
  await act(async () => {
    expect(await result.current.copy("x")).toBe(true);
  });
  expect(result.current.copied).toBe(true);
  expect(onCopy).toHaveBeenCalledTimes(1);
  expect(onCopy).toHaveBeenCalledWith(true);
  act(() => vi.advanceTimersByTime(500));
  expect(result.current.copied).toBe(false);
});

/** Starts a copy from a layout effect, which runs before useCopy's own (passive) effect. */
function EarlyCopy({
  onCopy,
  onStart,
}: {
  readonly onCopy: (ok: boolean) => void;
  readonly onStart: (copying: Promise<boolean>) => void;
}): ReactElement {
  const { copied, copy } = useCopy({ onCopy });
  const started = useRef(false);
  useLayoutEffect(() => {
    if (started.current) return;
    started.current = true;
    onStart(copy("early"));
  }, [copy, onStart]);
  return <output>{copied ? "copied" : "idle"}</output>;
}

test("useCopy under StrictMode applies a copy started before its effects run", async () => {
  const onCopy = vi.fn();
  let started: Promise<boolean> = Promise.resolve(false);
  render(<EarlyCopy onCopy={onCopy} onStart={(copying) => (started = copying)} />, strict);
  await act(async () => {
    await started;
  });
  expect(writeText).toHaveBeenCalledWith("early");
  expect(onCopy).toHaveBeenCalledWith(true);
  expect(screen.getByRole("status").textContent).toBe("copied");
});

test("useCopy keeps a copy in flight across a resetMs change; the next copy uses the new duration", async () => {
  vi.useFakeTimers();
  let release: () => void = () => {};
  writeText.mockReturnValue(new Promise<void>((resolve) => (release = resolve)));
  const onCopy = vi.fn();
  const { result, rerender } = renderHook(({ resetMs }) => useCopy({ resetMs, onCopy }), {
    ...strict,
    initialProps: { resetMs: 500 },
  });
  let copying: Promise<boolean> = Promise.resolve(false);
  act(() => {
    copying = result.current.copy("x");
  });
  rerender({ resetMs: 1000 });
  await act(async () => {
    release();
    await copying;
  });
  expect(result.current.copied).toBe(true);
  expect(onCopy).toHaveBeenCalledWith(true);
  act(() => vi.advanceTimersByTime(500));
  expect(result.current.copied).toBe(false);
  writeText.mockResolvedValue(undefined);
  await act(async () => {
    await result.current.copy("y");
  });
  act(() => vi.advanceTimersByTime(500));
  expect(result.current.copied).toBe(true);
  act(() => vi.advanceTimersByTime(500));
  expect(result.current.copied).toBe(false);
});

test("a throwing onCopy rejects copy() but the copied state still renders", async () => {
  const { result } = renderHook(
    () =>
      useCopy({
        onCopy: () => {
          throw new Error("boom");
        },
      }),
    strict,
  );
  await act(async () => {
    await expect(result.current.copy("x")).rejects.toThrow("boom");
  });
  expect(result.current.copied).toBe(true);
});

test("useCopy drops a result that lands after unmount", async () => {
  let release: () => void = () => {};
  writeText.mockReturnValue(new Promise<void>((resolve) => (release = resolve)));
  const onCopy = vi.fn();
  const { result, unmount } = renderHook(() => useCopy({ onCopy }), strict);
  const copying = result.current.copy("x");
  unmount();
  release();
  expect(await copying).toBe(true);
  expect(onCopy).not.toHaveBeenCalled();
});

test("useCopy clears its pending reset timer on unmount", async () => {
  vi.useFakeTimers();
  const { result, unmount } = renderHook(() => useCopy(), strict);
  await act(async () => {
    await result.current.copy("x");
  });
  expect(result.current.copied).toBe(true);
  expect(vi.getTimerCount()).toBe(1);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
