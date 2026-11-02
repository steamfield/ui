import { defineConfig, devices } from "@playwright/test";

// Browser checks run against the built playground (vite preview), never the dev server. The
// playground is built against the built package (PLAYGROUND_DIST=1 resolves @steamfield/ui/* to
// the dist/ targets in package.json exports), so they see what a consumer's bundler would.
export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://localhost:5200", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "bun run build && bun run playground:build && bun run playground:preview",
    // vite preview's port (playground/vite.config.ts), apart from the dev server's 5199.
    url: "http://localhost:5200",
    env: { PLAYGROUND_DIST: "1" },
    // A server already on the port may be serving a stale build, so always start a fresh one.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
