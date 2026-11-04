import { LibraryError } from "../internal/errors.ts";
import { copyText } from "./copy-text.ts";

/** What a copy control shows: nothing yet, a recent success, or the last attempt's failure. */
export type CopyStatus = "idle" | "copied" | "failed";

/** Milliseconds `copied` lasts, or false to keep it until the next attempt. */
export type CopyResetMs = number | false;

/** The longest delay `setTimeout` honors; a longer one fires at once. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * Checks a reset duration: false, or a whole range `setTimeout` honors (0 to 2^31 - 1 ms). NaN,
 * a negative, Infinity or an overflowing delay would reset at once, so each throws
 * `invalid_option` naming `field`.
 */
export function checkResetMs(value: unknown, field: string): CopyResetMs {
  if (value === false) return false;
  if (typeof value !== "number" || !(value >= 0 && value <= MAX_TIMEOUT_MS)) {
    throw new LibraryError("invalid_option", { field });
  }
  return value;
}

export interface CopyStateOptions {
  /** How long `copied` lasts before returning to `idle`, or false for never. Default 2000. */
  readonly resetMs?: CopyResetMs;
}

export interface CopyAttemptOptions {
  /**
   * Asked when the clipboard answers. Returning false drops the result, say because the control
   * was pointed at other text while the copy was in flight.
   */
  readonly isCurrent?: () => boolean;
  /** How long this attempt's `copied` lasts (false: until the next attempt), overriding the controller's `resetMs`. */
  readonly resetMs?: CopyResetMs;
}

export interface CopyState {
  readonly getState: () => CopyStatus;
  /**
   * Called after every applied result, even when the status is unchanged (a second success
   * restarts the reset), and when `copied` resets to `idle`.
   */
  readonly subscribe: (callback: () => void) => () => void;
  /**
   * Copies `text` and resolves to whether it worked. The result moves the state only if the
   * controller is still alive and `isCurrent` (when given) still holds.
   */
  readonly copy: (text: string, options?: CopyAttemptOptions) => Promise<boolean>;
  /**
   * Cancels the pending reset and returns to `idle`, notifying subscribers, while staying usable.
   * For a binding that unmounts but may mount again (React StrictMode, `<Activity>`).
   */
  readonly reset: () => void;
  /** Cancels the pending reset and ignores copies still in flight. */
  readonly destroy: () => void;
}

/**
 * The copy state machine every binding shares: `copyText`, the stale-result guard, and the timer
 * that returns `copied` to `idle`. Framework-free; the DOM enhancer and `useCopy` only adapt it.
 */
export function createCopyState(options: CopyStateOptions = {}): CopyState {
  const resetMs = checkResetMs(options.resetMs ?? 2000, "resetMs");
  const listeners = new Set<() => void>();
  let state: CopyStatus = "idle";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;

  const set = (next: CopyStatus): void => {
    state = next;
    for (const listener of [...listeners]) listener();
  };

  return {
    getState: () => state,
    subscribe(callback) {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    async copy(text, attempt = {}) {
      const ms = attempt.resetMs === undefined ? resetMs : checkResetMs(attempt.resetMs, "resetMs");
      const ok = await copyText(text);
      if (destroyed || (attempt.isCurrent && !attempt.isCurrent())) return ok;
      clearTimeout(timer);
      timer = ok && ms !== false ? setTimeout(() => set("idle"), ms) : undefined;
      set(ok ? "copied" : "failed");
      return ok;
    },
    reset() {
      clearTimeout(timer);
      timer = undefined;
      if (state !== "idle") set("idle");
    },
    destroy() {
      destroyed = true;
      clearTimeout(timer);
      timer = undefined;
      listeners.clear();
    },
  };
}
