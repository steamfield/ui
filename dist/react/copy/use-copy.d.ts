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
/** Clipboard state for a React control: `copy(text)` resolves to whether it worked. */
export declare function useCopy(options?: UseCopyOptions): UseCopyResult;