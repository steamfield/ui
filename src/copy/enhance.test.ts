import { beforeEach, expect, test, vi } from "vitest";
import { removeClipboard, stubClipboard, stubExecCommand } from "../../tests/helpers/dom.ts";
import { copyText } from "./copy-text.ts";
import { enhanceCopyButtons } from "./enhance.ts";

const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  vi.useFakeTimers();
  writeText.mockReset().mockResolvedValue(undefined);
  document.getSelection()?.removeAllRanges();
  stubClipboard(writeText);
  document.body.innerHTML = `
    <div data-copy-root>
      <code id="cmd">npx stacks new</code>
      <button hidden data-copy-command aria-controls="cmd" aria-label="Copy command">
        <span data-copy-label>Copy</span>
      </button>
      <span data-copy-result role="status" aria-live="polite"></span>
    </div>
    <div data-copy-root>
      <button hidden data-copy-command aria-controls="missing" aria-label="Copy code">
        <span data-copy-label>Copy</span>
      </button>
    </div>`;
});

const button = (): HTMLButtonElement =>
  document.querySelector<HTMLButtonElement>('[aria-controls="cmd"]') as HTMLButtonElement;
const label = (): string => button().querySelector("[data-copy-label]")?.textContent ?? "";
const result = (): string => document.querySelector("[data-copy-result]")?.textContent ?? "";

async function click(): Promise<void> {
  button().click();
  await vi.waitFor(() => expect(button().dataset.state).toBeDefined());
}

test("reveals only buttons whose target exists", () => {
  enhanceCopyButtons(document);
  expect(button().hidden).toBe(false);
  expect(document.querySelector<HTMLButtonElement>('[aria-controls="missing"]')?.hidden).toBe(true);
});

test("copies the target text, announces it, then resets the label", async () => {
  enhanceCopyButtons(document, { copiedMs: 1000 });
  await click();
  expect(writeText).toHaveBeenCalledWith("npx stacks new");
  expect(label()).toBe("Copied");
  expect(result()).toBe("Copied to clipboard.");
  vi.advanceTimersByTime(1000);
  expect(label()).toBe("Copy");
  expect(result()).toBe("");
});

test("copiedMs false keeps Copied until the next click", async () => {
  enhanceCopyButtons(document, { copiedMs: false });
  await click();
  vi.advanceTimersByTime(60 * 60 * 1000);
  expect(label()).toBe("Copied");
  expect(button().dataset.state).toBe("copied");
  expect(result()).toBe("Copied to clipboard.");
  writeText.mockRejectedValue(new Error("denied"));
  stubExecCommand(() => false);
  button().click();
  await vi.waitFor(() => expect(button().dataset.state).toBe("failed"));
  expect(label()).toBe("Copy");
});

test.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 31])(
  "copiedMs %s throws invalid_option naming copiedMs and wires nothing",
  (copiedMs) => {
    expect(() => enhanceCopyButtons(document, { copiedMs })).toThrow(
      expect.objectContaining({ code: "invalid_option", field: "copiedMs" }),
    );
    expect(button().hidden).toBe(true);
    expect(button().hasAttribute("data-copy-ready")).toBe(false);
  },
);

test("a second click while showing Copied still resets to the idle label", async () => {
  enhanceCopyButtons(document, { copiedMs: 1000 });
  await click();
  vi.advanceTimersByTime(500);
  delete button().dataset.state;
  await click();
  vi.advanceTimersByTime(1000);
  expect(label()).toBe("Copy");
});

test("on failure it selects the text, opens details and shows a subject-aware message", async () => {
  writeText.mockRejectedValue(new Error("denied"));
  stubExecCommand(() => false);
  const details = document.createElement("details");
  details.append(document.getElementById("cmd") as HTMLElement);
  document.querySelector("[data-copy-root]")?.prepend(details);
  enhanceCopyButtons(document);
  await click();
  expect(details.open).toBe(true);
  expect(document.getSelection()?.toString()).toBe("npx stacks new");
  expect(result()).toBe("Copy failed. The command is selected; press Cmd+C or Ctrl+C.");
  expect(button().dataset.state).toBe("failed");
});

test("reports every attempt through onCopy and a bubbling sf:copy event", async () => {
  const onCopy = vi.fn();
  const events: unknown[] = [];
  document.addEventListener("sf:copy", (event) => events.push((event as CustomEvent).detail));
  enhanceCopyButtons(document, { onCopy });
  await click();
  const detail = { id: "cmd", label: "Copy command", ok: true };
  expect(onCopy).toHaveBeenCalledWith(detail);
  expect(events).toEqual([detail]);
});

test("drops the result when the target is rewired mid-copy", async () => {
  let resolve: () => void = () => {};
  writeText.mockReturnValue(new Promise<void>((r) => (resolve = r)));
  const onCopy = vi.fn();
  enhanceCopyButtons(document, { onCopy });
  const target = button();
  target.click();
  target.setAttribute("aria-controls", "other");
  resolve();
  await vi.runAllTimersAsync();
  expect(onCopy).not.toHaveBeenCalled();
  expect(target.querySelector("[data-copy-label]")?.textContent).toBe("Copy");
});

test("the disposer removes listeners", async () => {
  const dispose = enhanceCopyButtons(document);
  dispose();
  button().click();
  await vi.runAllTimersAsync();
  expect(writeText).not.toHaveBeenCalled();
});

test("copyText falls back to execCommand and respects its result", async () => {
  removeClipboard();
  stubExecCommand(() => true);
  expect(await copyText("a")).toBe(true);
  stubExecCommand(() => false);
  expect(await copyText("a")).toBe(false);
  stubExecCommand(() => {
    throw new Error("nope");
  });
  expect(await copyText("a")).toBe(false);
  expect(document.querySelector("textarea")).toBeNull();
});

test("a hidden target is not selected and the message points elsewhere", async () => {
  writeText.mockRejectedValue(new Error("denied"));
  stubExecCommand(() => false);
  (document.getElementById("cmd") as HTMLElement).hidden = true;
  enhanceCopyButtons(document);
  await click();
  expect(document.getSelection()?.toString()).toBe("");
  expect(result()).toBe("Copy failed. Open the command and copy it manually.");
});

test("custom messages, subjects and labels replace the defaults", async () => {
  writeText.mockRejectedValueOnce(new Error("denied"));
  stubExecCommand(() => false);
  button().setAttribute("aria-label", "Copy snippet");
  enhanceCopyButtons(document, {
    subjects: { "Copy snippet": "snippet" },
    messages: {
      copied: "Done.",
      copiedLabel: "✓",
      failed: (subject, { hidden }) => `no ${subject} ${hidden}`,
    },
  });
  await click();
  expect(result()).toBe("no snippet false");
  delete button().dataset.state;
  await click();
  expect(result()).toBe("Done.");
  expect(label()).toBe("✓");
});

test("an unknown label falls back to 'text', and a button without parts still works", async () => {
  writeText.mockRejectedValue(new Error("denied"));
  stubExecCommand(() => false);
  document.body.innerHTML = `<p id="t">hi</p><button hidden data-copy-command aria-controls="t"></button>`;
  const onCopy = vi.fn();
  enhanceCopyButtons(document, { onCopy });
  const bare = document.querySelector("button") as HTMLButtonElement;
  bare.click();
  await vi.waitFor(() => expect(onCopy).toHaveBeenCalledWith({ id: "t", label: "", ok: false }));
  expect(bare.dataset.state).toBe("failed");
});

test("the target disappearing before the click is a no-op", async () => {
  const onCopy = vi.fn();
  enhanceCopyButtons(document, { onCopy });
  document.getElementById("cmd")?.remove();
  button().click();
  await vi.runAllTimersAsync();
  expect(onCopy).not.toHaveBeenCalled();
});

test("disposing clears a pending reset", async () => {
  const dispose = enhanceCopyButtons(document, { copiedMs: 1000 });
  await click();
  dispose();
  vi.advanceTimersByTime(1000);
  expect(label()).toBe("Copied");
});

test("copyText reports false with no clipboard and no document", async () => {
  removeClipboard();
  const doc = globalThis.document;
  vi.stubGlobal("document", undefined);
  try {
    expect(await copyText("a")).toBe(false);
  } finally {
    vi.stubGlobal("document", doc);
  }
});

test("a failure after a success restores the idle label", async () => {
  enhanceCopyButtons(document, { copiedMs: 1000 });
  await click();
  expect(label()).toBe("Copied");
  writeText.mockRejectedValue(new Error("denied"));
  stubExecCommand(() => false);
  delete button().dataset.state;
  await click();
  expect(button().dataset.state).toBe("failed");
  expect(label()).toBe("Copy");
  vi.advanceTimersByTime(5000);
  expect(label()).toBe("Copy");
});

test("calling it twice wires one listener", async () => {
  const onCopy = vi.fn();
  const first = enhanceCopyButtons(document, { onCopy });
  const second = enhanceCopyButtons(document, { onCopy });
  const events = vi.fn();
  document.addEventListener("sf:copy", events);
  await click();
  document.removeEventListener("sf:copy", events);
  expect(writeText).toHaveBeenCalledTimes(1);
  expect(onCopy).toHaveBeenCalledTimes(1);
  expect(events).toHaveBeenCalledTimes(1);
  second();
  first();
});

test("the disposer hides the buttons again and a later call rewires them", async () => {
  const dispose = enhanceCopyButtons(document);
  expect(button().hidden).toBe(false);
  dispose();
  expect(button().hidden).toBe(true);
  button().click();
  await Promise.resolve();
  expect(writeText).not.toHaveBeenCalled();
  enhanceCopyButtons(document);
  expect(button().hidden).toBe(false);
  await click();
  expect(writeText).toHaveBeenCalledTimes(1);
});

test("a copy still in flight at dispose leaves no timer and no event", async () => {
  let release: () => void = () => {};
  writeText.mockReturnValue(new Promise<void>((resolve) => (release = resolve)));
  const onCopy = vi.fn();
  const dispose = enhanceCopyButtons(document, { onCopy });
  button().click();
  dispose();
  release();
  await vi.advanceTimersByTimeAsync(0);
  expect(vi.getTimerCount()).toBe(0);
  expect(onCopy).not.toHaveBeenCalled();
  expect(label()).toBe("Copy");
});
