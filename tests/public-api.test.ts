// Pins the public API: the runtime names each subpath entry exports. A change here is a release
// decision (a new export is minor, a removed or renamed one is breaking; on 0.x both bump the
// minor), so update the README section for that subpath and add a changeset in the same change.
import { expect, test } from "vitest";

const api: Record<string, string[]> = {
  "copy/index.ts": ["copyText", "enhanceCopyButtons"],
  "react/copy/index.ts": ["CopyButton", "CopyCommand", "useCopy"],
  "script/index.ts": ["LibraryError", "isLibraryError"],
};

test.each(Object.entries(api))(
  "src/%s exports exactly the documented names",
  async (entry, names) => {
    const module = (await import(`../src/${entry}`)) as Record<string, unknown>;
    expect(Object.keys(module).sort()).toEqual([...names].sort());
  },
);

test("every subpath entry is pinned here", async () => {
  const { entries } = await import("./package-shape.ts");
  expect(Object.keys(api).sort()).toEqual(entries().sort());
});
