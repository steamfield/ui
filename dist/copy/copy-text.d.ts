/**
 * Copies `text` to the clipboard and reports whether it worked. Tries the async Clipboard API
 * first, then a hidden readonly textarea with `execCommand("copy")`, whose result is respected.
 * Never throws, so callers branch on the boolean instead of wrapping every call.
 */
export declare function copyText(text: string): Promise<boolean>;