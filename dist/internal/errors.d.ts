/**
 * Why a call failed. Each code is public API: callers branch on it, so renaming or removing one
 * is a breaking change, and adding one is a minor release.
 */
export type LibraryErrorCode = "invalid_script" | "unsupported_step" | "invalid_option";
export interface LibraryErrorOptions {
  /** Which argument or option was wrong, such as "steps[3].text". Never the value itself. */
  readonly field?: string;
  readonly cause?: unknown;
}
/** The one error this package throws on purpose. Anything else escaping a call is a bug. */
export declare class LibraryError extends Error {
  override readonly name = "LibraryError";
  readonly code: LibraryErrorCode;
  readonly field: string | undefined;
  constructor(code: LibraryErrorCode, options?: LibraryErrorOptions);
}
/**
 * True for a LibraryError from any copy of this package. Prefer it to `instanceof`, which fails
 * when an app ends up with two installed versions of the package.
 */
export declare function isLibraryError(value: unknown): value is LibraryError;