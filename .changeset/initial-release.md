---
"@steamfield/ui": minor
---

First release of `@steamfield/ui`: framework-free `script`, `sequencer`, `playback`, `copy`, `tabs`, `reveal`, `markdown` and `docs` subpaths; React wrappers under `react/*` (`agent-demo`, `window`, `playback`, `copy`, `tabs`, `install-tabs`); a Vue binding at `vue/agent-demo`; and opt-in stylesheets (`agent-demo`, `window`, `copy`, `tabs`, `install-tabs`, `reveal`, `markdown`).

Fixes from the first consumer migrations:

- `reveal`: `revealGateScript`, an inline `<head>` snippet that sets `html[data-motion-ready]` before first paint so above-the-fold reveals don't flash. It fails open after 3s if `initReveal` never runs, and `revealGateHash` gives its CSP hash. `initReveal` adopts the gate (marking `html[data-reveal-live]`) and removes it when motion is off. New `--sf-reveal-blur` token for the start blur.
- `react/playback`: `usePlayback`, `useCountUp` and `useAgentDemo` return a `PlaybackRef` (a callback ref with `current`), so an element that mounts late gets a fresh gate and a swapped one keeps its progress. Before any element attaches, `autoStart` waits for one. The Vue `useAgentDemo` follows the same rules for `el`.
- `markdown`: `tables({ regionLabel })` takes a string, `false` or a `(table, index, { caption, heading })` function; the default names each region from its caption or preceding heading, and every label is unique in the document (a page rendering several documents prefixes labels with a function).
- `docs`: `DocsConfig.intro` adds paragraphs to `llms.txt` after the summary (blank entries are dropped).
- `react/copy`: `CopyCommand` takes `buttonClassName`, `promptClassName` and `commandClassName`.
- `react/agent-demo` and `vue/agent-demo`: the terminal tool header renders `tool-server` and `tool-name` parts with a `glyphs.serverSeparator` between them (default `" "`).
- Docs: the recommended layer order is now `@layer theme, base, sf, components, utilities;`, so Tailwind's preflight can't strip library borders.
