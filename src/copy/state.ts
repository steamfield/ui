import { copyText } from "./copy-text.ts";

/** What a copy control shows: nothing yet, a recent success, or the last attempt's failure. */
export type CopyStatus = "idle" | "copied" | "failed";

export interface CopyStateOptions {
  /** How long `copied` lasts before returning to `idle`. Default 2000. */
  readonly resetMs?: number;
}

export interface CopyAttemptOptions {
  /**
   * Asked when the clipboard answers. Returning false drops the result, say because the control
   * was pointed at other text while the copy was in flight.
   */
  readonly isCurrent?: () => boolean;
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
  /** Cancels the pending reset and ignores copies still in flight. */
  readonly destroy: () => void;
}

/**
 * The copy state machine every binding shares: `copyText`, the stale-result guard, and the timer
 * that returns `copied` to `idle`. Framework-free; the DOM enhancer and `useCopy` only adapt it.
 */
export function createCopyState(options: CopyStateOptions = {}): CopyState {
  const resetMs = options.resetMs ?? 2000;
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
    async copy(text, { isCurrent } = {}) {
      const ok = await copyText(text);
      if (destroyed || (isCurrent && !isCurrent())) return ok;
      clearTimeout(timer);
      timer = ok ? setTimeout(() => set("idle"), resetMs) : undefined;
      set(ok ? "copied" : "failed");
      return ok;
    },
    destroy() {
      destroyed = true;
      clearTimeout(timer);
      timer = undefined;
      listeners.clear();
    },
  };
}
