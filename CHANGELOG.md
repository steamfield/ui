# @steamfield/ui

## 0.3.0

### Minor Changes

- d44c876: Agent demo options so OpenData's landing chat demo can run on `AgentDemo` unchanged, all opt-in, in the React and Vue bindings:
  
  - `beforeStart: "start"` (new type `BeforeStart`, default `"final"`): before playback starts (the server, the pre-hydration render, and with `autoStart: false` until `play()`), render the view at 0ms instead of the final transcript, so a demo that begins from nothing doesn't flash its finished state on load. Reduced motion still shows the `finalPolicy` view. Without JavaScript the transcript is then empty; pair it with a `<noscript>` `StaticTranscript` where that matters. A `finalPolicy` is now validated when passed rather than when first rendered.
  - `leaveGraceMs: Infinity` (or any value past 2^31 - 1 ms) keeps a demo playing off screen once it has been seen, like a one-shot observer; a hidden tab still pauses. It used to pause at once, since `setTimeout` fires at once past that.
  - `typingMs` on `user` and `command` steps spreads the typing after `preTyped` over about that many ms (`jitter` still varies each character). A numeric `typeMsPerChar` gives way to it; a `typeMsPerChar` function receives the step and still decides.
  - `timing.thinkingOnSubmit` (optional, default false): the thinking after a user step starts at submit, alongside the composer flash, instead of once the flash ends. Its length still counts from submit.
  - `finalPolicy` takes `{ pick, order?: "script" | "listed" }` (new type `FinalPick` in `sequencer`): `"listed"` shows the picked steps in the order `pick` returns them, such as an answer above the chart it explains. A plain function still shows its picks in script order.
  - `composerStart` and `submitIcon` props (Vue: slots of the same names) put nodes in the composer: a new `composer-start` part before the typed text, hidden from assistive tech, and the submit key's content in place of `glyphs.submit`. An empty node (`null`, `false`, `true`, `""`, `[]`, or an empty Vue slot) keeps the default.

## 0.2.1

### Patch Changes

- `initReveal` asks `immediate` about every container before it sets the gate or reveals any. A layout read in `immediate` (the usual above-the-fold check) used to run after the gate and earlier reveals were applied, which forced a style pass in the hidden start state, so on-screen containers animated in instead of simply being there.
- `codeBlocks` emits a titled block's `figcaption` before its `<pre>`, so assistive tech reads and focuses the title before the code, as it is shown. Sites that moved the caption up with `order: -1` look the same and can drop that rule.
- 9ac39c5: `useCopy` clears its pending reset timer when the component unmounts. Since 0.1.0 the 2-second `copied` reset kept running after unmount, so a remount (StrictMode, `<Activity>`) could briefly show a stale `copied` state.

## 0.2.0

### Minor Changes

- 83495cf: Breaking (0.x, so a minor):
  
  - The terminal tool header's args now render as `tool-args` holding a `tool-paren` span on each side of the args text, so a stylesheet can color the parens apart. The visible text and `tool-args`' text content are unchanged, but a selector or test that expected `tool-args` to hold a single text node sees two child spans.
  - Copy reset durations now throw `LibraryError` `invalid_option`: `useCopy`'s `resetMs` (during render, field `resetMs`) and `enhanceCopyButtons`' `copiedMs` (up front, field `copiedMs`) must be `false` or 0 to 2^31 - 1. A negative, NaN, Infinity or larger value used to reset at once, since `setTimeout` treats them as 0.
  
  Agent demo extension points, all opt-in, in both the React and Vue bindings:
  
  - `labels.working` (no default): under a running tool call in the terminal layout, including click mode, shows the output glyph and this text in a new `tool-working` part. Its pulse moves between the muted and foreground colors, never fading, so it keeps AA contrast, and it doesn't run under reduced motion. Unset or `""`, a running call still shows nothing under its header. The chat layout ignores it.
  - `collapsible` on `AgentDemo` and `StaticTranscript` (default false): each built-in tool card renders as `<details open>` with its header as the `<summary>`, so a reader can hide a call's output, with or without JavaScript. A glyph after the header shows open or closed (new variable `--sf-demo-disclosure`, default `"▾"`, kept out of the accessible name), and in the chat layout the focus ring sits inside the card.
  - `transcript` on `AgentDemo` and `StaticTranscript` (new type `AgentDemoTranscript`, `{ as?: "group" | "region"; focusable?: boolean }`): `"region"` renders the transcript as a labelled `<section>` landmark, and `focusable: false` drops its tab stop. The default stays a focusable `role="group"`.
  - `chrome.className`: a class for the window root, to size or shadow the built-in window.
  
  Copy:
  
  - `useCopy`'s `resetMs` and `enhanceCopyButtons`' `copiedMs` take `false`: Copied then stays until the next copy attempt.
  - `copy/styles.css` hides the result region visually (until a failure shows it) when it carries only the `data-copy-result` hook the enhancer reads, not just `data-part="copy-result"`. Markup with only the hook used to show "Copied to clipboard." on screen.

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
