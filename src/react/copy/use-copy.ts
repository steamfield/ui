import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { copyText } from "../../copy/copy-text.ts";
import { type CopyState, type CopyStatus, createCopyState } from "../../copy/state.ts";

export interface UseCopyOptions {
  /** How long `copied` stays true after a successful copy. Default 2000. */
  readonly resetMs?: number;
  readonly onCopy?: (ok: boolean) => void;
}

export interface UseCopyResult {
  readonly copied: boolean;
  readonly failed: boolean;
  readonly copy: (text: string) => Promise<boolean>;
}

const noop = (): void => {};
const idle = (): CopyStatus => "idle";

/** Clipboard state for a React control: `copy(text)` resolves to whether it worked. */
export function useCopy(options: UseCopyOptions = {}): UseCopyResult {
  const { resetMs = 2000, onCopy } = options;
  const [store, setStore] = useState<CopyState | null>(null);
  const onCopyRef = useRef(onCopy);
  onCopyRef.current = onCopy;

  // Created in the effect so a StrictMode remount gets a live controller, not a destroyed one.
  useEffect(() => {
    const next = createCopyState({ resetMs });
    next.subscribe(() => {
      const status = next.getState();
      if (status !== "idle") onCopyRef.current?.(status === "copied");
    });
    setStore(next);
    return next.destroy;
  }, [resetMs]);

  const subscribe = useCallback((cb: () => void) => store?.subscribe(cb) ?? noop, [store]);
  const snapshot = useCallback(() => store?.getState() ?? "idle", [store]);
  const state = useSyncExternalStore(subscribe, snapshot, idle);
  const copy = useCallback(
    (text: string): Promise<boolean> => (store ? store.copy(text) : copyText(text)),
    [store],
  );

  return { copied: state === "copied", failed: state === "failed", copy };
}
