import { describe, expect, test } from "vitest";
import { isLibraryError } from "../internal/errors.ts";
import {
  GIF_COLLECTIONS,
  GIF_THEME_META,
  type GifTheme,
  INLINE_ERROR_GIFS,
  type InlineGifKind,
  pickGif,
  pickInlineGif,
} from "./index.ts";

describe("gif collections", () => {
  const themes = Object.keys(GIF_COLLECTIONS) as GifTheme[];

  test("every theme has non-empty unique https mp4 URLs and matching metadata", () => {
    expect(themes.length).toBeGreaterThanOrEqual(8);
    for (const theme of themes) {
      const list = GIF_COLLECTIONS[theme];
      expect(list.length).toBeGreaterThan(0);
      expect(new Set(list).size).toBe(list.length);
      for (const url of list) {
        expect(url).toMatch(/^https:\/\/.+\.mp4$/);
      }
      expect(GIF_THEME_META[theme].filename).toMatch(/\.mp4$/);
    }
  });

  test("inline error gifs cover every kind with https mp4 URLs", () => {
    const kinds: InlineGifKind[] = ["network", "timeout", "server", "generic"];
    for (const kind of kinds) {
      expect(INLINE_ERROR_GIFS[kind]).toMatch(/^https:\/\/.+\.mp4$/);
      expect(pickInlineGif(kind)).toBe(INLINE_ERROR_GIFS[kind]);
    }
  });
});

describe("pickGif", () => {
  test("picks deterministically for string and numeric seeds, including negative numbers", () => {
    const first = pickGif("network-error", { seed: "host-1:unreachable" });
    const second = pickGif("network-error", { seed: "host-1:unreachable" });
    expect(first).toBe(second);
    expect(GIF_COLLECTIONS["network-error"]).toContain(first);

    expect(pickGif("network-error", { seed: 0 })).toBe(GIF_COLLECTIONS["network-error"][0]);
    expect(pickGif("network-error", { seed: 1 })).toBe(GIF_COLLECTIONS["network-error"][1]);
    expect(pickGif("network-error", { seed: -1 })).toBe(
      GIF_COLLECTIONS["network-error"][GIF_COLLECTIONS["network-error"].length - 1],
    );
  });

  test("picks a valid clip when seed is omitted", () => {
    const url = pickGif("server-error");
    expect(GIF_COLLECTIONS["server-error"]).toContain(url);
  });

  test("supports custom collections override", () => {
    const custom = {
      "network-error": ["https://example.com/a.mp4", "https://example.com/b.mp4"],
    };
    expect(pickGif("network-error", { seed: 1, collections: custom })).toBe(
      "https://example.com/b.mp4",
    );
  });

  test("throws LibraryError(invalid_option) on bad theme, kind, seed, or empty collection", () => {
    const cases: Array<[() => unknown, string]> = [
      [() => pickGif("unknown" as GifTheme), "theme"],
      [() => pickGif("toString" as GifTheme), "theme"],
      [() => pickGif("network-error", { collections: { "network-error": [] } }), "theme"],
      [
        () => pickGif("network-error", { collections: { "network-error": [""] }, seed: 0 }),
        "collections",
      ],
      [() => pickGif("network-error", { seed: Number.NaN }), "seed"],
      [() => pickGif("network-error", { seed: Number.POSITIVE_INFINITY }), "seed"],
      [() => pickGif("network-error", { seed: {} as unknown as string }), "seed"],
      [() => pickInlineGif("unknown" as InlineGifKind), "kind"],
      [() => pickInlineGif("constructor" as InlineGifKind), "kind"],
    ];

    for (const [fn, field] of cases) {
      let caught: unknown;
      try {
        fn();
      } catch (error) {
        caught = error;
      }
      expect(isLibraryError(caught)).toBe(true);
      if (isLibraryError(caught)) {
        expect(caught.code).toBe("invalid_option");
        expect(caught.field).toBe(field);
      }
    }
  });
});
