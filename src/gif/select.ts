import { LibraryError } from "../internal/errors.ts";
import {
  GIF_COLLECTIONS,
  type GifTheme,
  INLINE_ERROR_GIFS,
  type InlineGifKind,
} from "./collections.ts";

export interface PickGifOptions {
  /**
   * Deterministic seed (number or string) so SSR, re-renders and tests pick the same clip.
   * When omitted, picks uniformly at random via `Math.random()`.
   */
  readonly seed?: number | string;
  /** Optional map overriding or extending `GIF_COLLECTIONS`. */
  readonly collections?: Readonly<Record<string, readonly string[]>>;
}

/** Deterministic FNV-1a 32-bit hash for string seeds. */
function hashSeed(input: string): number {
  let hash = 2_166_136_261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function indexFor(length: number, seed: number | string | undefined): number {
  if (seed === undefined) {
    return Math.floor(Math.random() * length);
  }
  if (typeof seed === "number") {
    if (!Number.isFinite(seed)) {
      throw new LibraryError("invalid_option", { field: "seed" });
    }
    const normalized = Math.trunc(seed) % length;
    return normalized < 0 ? normalized + length : normalized;
  }
  if (typeof seed === "string") {
    return hashSeed(seed) % length;
  }
  throw new LibraryError("invalid_option", { field: "seed" });
}

/**
 * Picks one MP4 clip URL for `theme`. Deterministic when `options.seed` is supplied; random
 * otherwise. Throws `LibraryError("invalid_option")` for unknown themes, empty collections, or
 * non-finite numeric seeds.
 */
export function pickGif(theme: GifTheme, options: PickGifOptions = {}): string {
  const source: Readonly<Record<string, readonly string[]>> =
    options.collections ?? GIF_COLLECTIONS;
  const list = Object.hasOwn(source, theme) ? source[theme] : undefined;
  if (!Array.isArray(list) || list.length === 0) {
    throw new LibraryError("invalid_option", { field: "theme" });
  }
  const picked = list[indexFor(list.length, options.seed)];
  if (typeof picked !== "string" || picked.length === 0) {
    throw new LibraryError("invalid_option", { field: "collections" });
  }
  return picked;
}

/**
 * Returns the compact inline clip URL for `kind`. Throws `LibraryError("invalid_option")` for
 * unknown kinds.
 */
export function pickInlineGif(kind: InlineGifKind): string {
  if (!Object.hasOwn(INLINE_ERROR_GIFS, kind)) {
    throw new LibraryError("invalid_option", { field: "kind" });
  }
  return INLINE_ERROR_GIFS[kind];
}
