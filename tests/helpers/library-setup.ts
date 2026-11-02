// Runs before every library test file (vitest.config.ts, library project). Globals and spies are
// undone by unstubGlobals/restoreMocks before each test; this undoes what those don't reach:
// mounted React trees, mounted Vue apps and fake timers.
import { cleanup } from "@testing-library/react";
import { enableAutoUnmount } from "@vue/test-utils";
import { afterEach, vi } from "vitest";

enableAutoUnmount(afterEach);

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
