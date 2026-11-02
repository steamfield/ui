// The playground's routes, in nav order. main.tsx maps each to a page component and the browser
// suite (tests/browser/pages.ts) visits each one, so a page added here is checked everywhere.
export const ROUTES = [
  "copy",
  "agent-demo",
  "vue-agent-demo",
  "window",
  "tabs",
  "install-tabs",
  "reveal",
  "playback",
  "markdown",
] as const;

export type Route = (typeof ROUTES)[number];
