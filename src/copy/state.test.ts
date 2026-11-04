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

test("resetMs false keeps copied until the next attempt, which still applies", async () => {
  const state = createCopyState({ resetMs: false });
  await state.copy("x");
  vi.advanceTimersByTime(60 * 60 * 1000);
  expect(state.getState()).toBe("copied");
  fail();
  expect(await state.copy("x")).toBe(false);
  expect(state.getState()).toBe("failed");
});

test("an attempt's resetMs false overrides a timed controller, and a number overrides false", async () => {
  const state = createCopyState({ resetMs: 500 });
  await state.copy("x", { resetMs: false });
  vi.advanceTimersByTime(5000);
  expect(state.getState()).toBe("copied");
  const never = createCopyState({ resetMs: false });
  await never.copy("x", { resetMs: 300 });
  vi.advanceTimersByTime(300);
  expect(never.getState()).toBe("idle");
});

test("resetMs 0 resets on the next tick", async () => {
  const state = createCopyState({ resetMs: 0 });
  await state.copy("x");
  expect(state.getState()).toBe("copied");
  vi.advanceTimersByTime(0);
  expect(state.getState()).toBe("idle");
});

test.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 31, "2000", true])(
  "resetMs %s is rejected with invalid_option on resetMs",
  async (value) => {
    expect(() => createCopyState({ resetMs: value as number })).toThrow(
      expect.objectContaining({ code: "invalid_option", field: "resetMs" }),
    );
    const state = createCopyState();
    await expect(state.copy("x", { resetMs: value as number })).rejects.toMatchObject({
      code: "invalid_option",
      field: "resetMs",
    });
    expect(writeText).not.toHaveBeenCalled();
    expect(state.getState()).toBe("idle");
  },
);

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

test("reset cancels the pending reset, returns to idle, and leaves the controller usable", async () => {
  const state = createCopyState({ resetMs: 1000 });
  const listener = vi.fn();
  state.subscribe(listener);
  await state.copy("x");
  listener.mockClear();
  state.reset();
  expect(state.getState()).toBe("idle");
  expect(listener).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
  state.reset();
  expect(listener).toHaveBeenCalledTimes(1);
  expect(await state.copy("y")).toBe(true);
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
