import { beforeEach, expect, test, vi } from "vitest";
import { stubClipboard, stubExecCommand } from "../../tests/helpers/dom.ts";
import { createCopyState } from "./state.ts";

const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  vi.useFakeTimers();
  writeText.mockReset().mockResolvedValue(undefined);
  stubClipboard(writeText);
});

function fail(): void {
  writeText.mockRejectedValue(new Error("denied"));
  stubExecCommand(() => false);
}

/** A clipboard write that waits for `release()`. */
function pending(): () => void {
  let release: () => void = () => {};
  writeText.mockReturnValue(new Promise<void>((resolve) => (release = resolve)));
  return () => release();
}

test("starts idle, copies, and resets to idle after the default 2000ms", async () => {
  const state = createCopyState();
  expect(state.getState()).toBe("idle");
  expect(await state.copy("x")).toBe(true);
  expect(writeText).toHaveBeenCalledWith("x");
  expect(state.getState()).toBe("copied");
  vi.advanceTimersByTime(1999);
  expect(state.getState()).toBe("copied");
  vi.advanceTimersByTime(1);
  expect(state.getState()).toBe("idle");
});

test("resetMs sets how long copied lasts", async () => {
  const state = createCopyState({ resetMs: 500 });
  await state.copy("x");
  vi.advanceTimersByTime(500);
  expect(state.getState()).toBe("idle");
});

test("a failure resolves false and stays failed with no reset", async () => {
  fail();
  const state = createCopyState();
  expect(await state.copy("x")).toBe(false);
  const listener = vi.fn();
  state.subscribe(listener);
  vi.advanceTimersByTime(5000);
  expect(state.getState()).toBe("failed");
  expect(listener).not.toHaveBeenCalled();
});

test("an attempt's resetMs overrides the controller's", async () => {
  const state = createCopyState({ resetMs: 500 });
  await state.copy("x", { resetMs: 1000 });
  vi.advanceTimersByTime(999);
  expect(state.getState()).toBe("copied");
  vi.advanceTimersByTime(1);
  expect(state.getState()).toBe("idle");
});

test("a failure after a success cancels the pending reset", async () => {
  const state = createCopyState({ resetMs: 1000 });
  await state.copy("x");
  fail();
  await state.copy("x");
  vi.advanceTimersByTime(5000);
  expect(state.getState()).toBe("failed");
});

test("a second success restarts the reset", async () => {
  const state = createCopyState({ resetMs: 1000 });
  await state.copy("x");
  vi.advanceTimersByTime(600);
  await state.copy("x");
  vi.advanceTimersByTime(600);
  expect(state.getState()).toBe("copied");
  vi.advanceTimersByTime(400);
  expect(state.getState()).toBe("idle");
});

test("notifies on every applied result, including a repeat, and on the reset", async () => {
  const state = createCopyState({ resetMs: 1000 });
  const seen: string[] = [];
  state.subscribe(() => seen.push(state.getState()));
  await state.copy("x");
  await state.copy("x");
  vi.advanceTimersByTime(1000);
  expect(seen).toEqual(["copied", "copied", "idle"]);
});

test("unsubscribe stops notifications", async () => {
  const state = createCopyState();
  const listener = vi.fn();
  const unsubscribe = state.subscribe(listener);
  unsubscribe();
  await state.copy("x");
  expect(listener).not.toHaveBeenCalled();
});

test("a result whose isCurrent no longer holds is dropped but still resolves", async () => {
  const state = createCopyState();
  const listener = vi.fn();
  state.subscribe(listener);
  let current = true;
  const release = pending();
  const copying = state.copy("x", { isCurrent: () => current });
  current = false;
  release();
  expect(await copying).toBe(true);
  expect(state.getState()).toBe("idle");
  vi.advanceTimersByTime(5000);
  expect(listener).not.toHaveBeenCalled();
});

test("destroy cancels the pending reset", async () => {
  const state = createCopyState({ resetMs: 1000 });
  await state.copy("x");
  state.destroy();
  vi.advanceTimersByTime(5000);
  expect(state.getState()).toBe("copied");
});

test("destroy ignores a copy still in flight", async () => {
  const state = createCopyState();
  const listener = vi.fn();
  state.subscribe(listener);
  const release = pending();
  const copying = state.copy("x");
  state.destroy();
  release();
  expect(await copying).toBe(true);
  expect(state.getState()).toBe("idle");
  vi.advanceTimersByTime(5000);
  expect(listener).not.toHaveBeenCalled();
});
