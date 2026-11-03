# @steamfield/ui

## 0.1.0

### Minor Changes

- 74c3914: First release of `@steamfield/ui`: framework-free `script`, `sequencer`, `playback`, `copy`, `tabs`, `reveal`, `markdown` and `docs` subpaths; React wrappers under `react/*` (`agent-demo`, `window`, `playback`, `copy`, `tabs`, `install-tabs`); a Vue binding at `vue/agent-demo`; and opt-in stylesheets (`agent-demo`, `window`, `copy`, `tabs`, `install-tabs`, `reveal`, `markdown`).
  
  Fixes from the first consumer migrations:
  
  - `reveal`: `revealGateScript`, an inline `<head>` snippet that sets `html[data-motion-ready]` before first paint so above-the-fold reveals don't flash. It fails open after 3s if `initReveal` never runs, and `revealGateHash` gives its CSP hash. `initReveal` adopts the gate (marking `html[data-reveal-live]`) and removes it when motion is off. New `--sf-reveal-blur` token for the start blur.
  - `react/playback`: `usePlayback`, `useCountUp` and `useAgentDemo` return a `PlaybackRef` (a callback ref with `current`), so an element that mounts late gets a fresh gate and a swapped one keeps its progress. Before any element attaches, `autoStart` waits for one. The Vue `useAgentDemo` follows the same rules for `el`.
  - `markdown`: `tables({ regionLabel })` takes a string, `false` or a `(table, index, { caption, heading })` function; the default names each region from its caption or preceding heading, and every label is unique in the document (a page rendering several documents prefixes labels with a function).
  - `docs`: `DocsConfig.intro` adds paragraphs to `llms.txt` after the summary (blank entries are dropped).
  - `react/copy`: `CopyCommand` takes `buttonClassName`, `promptClassName` and `commandClassName`.
  - `react/agent-demo` and `vue/agent-demo`: the terminal tool header renders `tool-server` and `tool-name` parts with a `glyphs.serverSeparator` between them (default `" "`).
  - Docs: the recommended layer order is now `@layer theme, base, sf, components, utilities;`, so Tailwind's preflight can't strip library borders.

### Patch Changes

- 1216a1d: Every JS subpath in `exports` now uses `{ types, default }` instead of `{ types, import }`. The package is still ESM only, but `require("@steamfield/ui/<subpath>")` now resolves and loads through Node's require(esm) instead of failing with `ERR_PACKAGE_PATH_NOT_EXPORTED`. `engines.node` is now `>=22.18`, the first 22.x that runs TypeScript files without a flag, which is what CI's floor check uses.
  
  The package checks are stricter. Imports are parsed rather than pattern-matched and checked again in the built JS and `.d.ts`. A consumer with no React, Vue or markdown peers installed now typechecks and runs every framework-free subpath. Exported type names are pinned. Every stylesheet's `@layer sf`, `:where()` and `--sf-*` rules are checked, and the boundary lint catches more ways to throw, log or import a runtime module.
- ebb0e8e: Move each stateful component's logic into one framework-free controller that the React and Vue bindings adapt: the agent demo (timeline, playback clock, step starts, end detection, controls), the playback gate's element binding, tabs selection and copy state. Public exports, props and markup are unchanged. A remount of `usePlayback`, `useCountUp` or the agent demo (React StrictMode, `<Activity>` hide and show) now resumes where it was instead of starting over, without firing `onStepStart` or `onComplete` again, and a `setSpeed` rate holds until the `speed` option changes. A throwing `onStepStart` or `onComplete` no longer stops the clock or skips later callbacks; every error is rethrown after the rest run (an `AggregateError` for several), and one thrown during a prop update or a mount is rethrown from a microtask instead of unwinding the render. Two visible fixes come with it: a React `Tabs` `defaultValue` naming a disabled or unknown tab now falls back to the first enabled tab after hydration, as `createTabs` already did; and markdown code-block copy wrappers now also carry `data-copy-root`, the same marker `CopyButton` uses.
