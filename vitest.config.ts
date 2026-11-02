import { defineConfig } from "vitest/config";

// Two projects: library code runs in happy-dom (it targets browsers); repo tooling (the export
// map, boundaries, hooks) runs in Node.
export default defineConfig({
  test: {
    unstubGlobals: true,
    restoreMocks: true,
    projects: [
      {
        extends: true,
        test: {
          name: "library",
          environment: "happy-dom",
          include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
          setupFiles: ["tests/helpers/library-setup.ts"],
        },
      },
      {
        extends: true,
        // Tooling tests spawn processes (hooks, builds), so they get a longer timeout.
        test: {
          name: "tooling",
          environment: "node",
          include: ["tests/**/*.test.ts"],
          testTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/index.ts"],
      thresholds: { statements: 95, lines: 95, branches: 90, functions: 95 },
    },
  },
});
