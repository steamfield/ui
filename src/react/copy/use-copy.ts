import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { type CopyStatus, checkResetMs, createCopyState } from "../../copy/state.ts";

export interface UseCopyOptions {
  /**
   * How long `copied` stays true after a successful copy, or false to keep it until the next
   * attempt. Default 2000. Anything but false or 0 to 2^31 - 1 throws `invalid_option`.
   */
  readonly resetMs?: number | false;
  readonly onCopy?: (ok: boolean) => void;
}

export interface UseCopyResult {
  readonly copied: boolean;
  readonly failed: boolean;
  readonly copy: (text: string) => Promise<boolean>;
}

const idle = (): CopyStatus => "idle";

/** Clipboard state for a React control: `copy(text)` resolves to whether it worked. */
export function useCopy(options: UseCopyOptions = {}): UseCopyResult {
  const { onCopy } = options;
  // Checked at render, so a bad value fails where it is passed rather than on the first click.
  const resetMs = checkResetMs(options.resetMs ?? 2000, "resetMs");
  // One controller for the component's life: a resetMs change applies to the next attempt and
  // never drops one in flight. It is never destroyed, so a StrictMode or <Activity> remount
  // keeps working; `mounted` drops results that land while unmounted instead.
  const [store] = useState(createCopyState);
  const mounted = useRef(true);
  const onCopyRef = useRef(onCopy);
  onCopyRef.current = onCopy;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const state = useSyncExternalStore(store.subscribe, store.getState, idle);
  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      const ok = await store.copy(text, { resetMs, isCurrent: () => mounted.current });
      // After the state applied and React re-rendered, so a throwing onCopy can't block that.
      if (mounted.current) onCopyRef.current?.(ok);
      return ok;
    },
    [store, resetMs],
  );

  return { copied: state === "copied", failed: state === "failed", copy };
}
