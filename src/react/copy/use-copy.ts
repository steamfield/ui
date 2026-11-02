import { useCallback, useEffect, useRef, useState } from "react";
import { copyText } from "../../copy/copy-text.ts";

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

/** Clipboard state for a React control: `copy(text)` resolves to whether it worked. */
export function useCopy(options: UseCopyOptions = {}): UseCopyResult {
  const { resetMs = 2000, onCopy } = options;
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  const onCopyRef = useRef(onCopy);
  onCopyRef.current = onCopy;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
    };
  }, []);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      const ok = await copyText(text);
      if (!mounted.current) return ok;
      clearTimeout(timer.current);
      setState(ok ? "copied" : "failed");
      if (ok) timer.current = setTimeout(() => mounted.current && setState("idle"), resetMs);
      onCopyRef.current?.(ok);
      return ok;
    },
    [resetMs],
  );

  return { copied: state === "copied", failed: state === "failed", copy };
}
