// The error class lives in `internal` so subpaths that may not import `script`, such as
// `playback`, throw the same class. This module is its public home.
export type { LibraryErrorCode, LibraryErrorOptions } from "../internal/errors.ts";
export { isLibraryError, LibraryError } from "../internal/errors.ts";
