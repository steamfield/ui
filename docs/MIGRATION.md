# Migrating consumers onto @steamfield/ui

Status as of 2026-11-02. Each consumer was migrated on a `feat/steamfield-ui` branch in its own
git worktree under `~/Projects/.sfui-worktrees/<repo>`, branched from that repo's HEAD, so the
main checkouts (several with uncommitted work) were never touched. Nothing is pushed or merged.
Each branch installs the library from `file:~/Projects/.sfui-worktrees/_dist/steamfield-ui-0.0.0.tgz`;
replace that with a published version before merging.

The method was the same everywhere. Phase A captured pre-migration baselines (Playwright
screenshots at 1280 and 390, light and dark, motion, reduced motion and no-JS, plus text outputs)
under `~/Projects/.sfui-worktrees/_baselines/<repo>/`, and added characterization tests in the
repo where coverage was missing. Phase B swapped the duplicates for library imports, kept the
repo's own names and paths as thin wrappers, added a theme file mapping site tokens onto `--sf-*`,
and gated on the repo's suites plus before/after diffs.

Layer order for Tailwind v4 sites: `@layer theme, base, sf, components, utilities;` before
`@import "tailwindcss"`. With `sf` ahead of `base`, preflight's `* { margin: 0; border: 0 solid }`
overrides library borders and margins (stacks-api hit this).

## stacks-api (apps/web)

Branch `feat/steamfield-ui`: `3038c39` (characterization tests), `d0ca34d` (migration),
`56564fc` (adopts the library gap fixes).

| Was | Now |
| --- | --- |
| `islands/HomeCliDemo.tsx` internals, `islands/use-demo-playback.ts` | `useAgentDemo` (composer mode) behind the existing markup; `use-demo-playback.ts` deleted |
| `islands/home-cli-script.ts` | keeps the script content, adds the `DemoScript` and timing |
| `components/home/TerminalWindow.tsx` | wrapper over `react/window` `DemoWindow` |
| `components/CopyCommand.tsx` (`CopyCommand`, `CopyButton`) | wrappers over `react/copy`; `emphasis` maps to a class |
| `layouts/BaseLayout.astro` inline reveal + copy enhancers | `revealGateScript` inline in `<head>`; `initReveal` (per-path options, `stacks:reveal-ready`, island `deferred`) and `enhanceCopyButtons` in `layouts/PageEnhancements.astro` + `lib/enhance.ts` |
| `styles/motion.css` | `reveal/styles.css` plus site timing in `sf-theme.css`; deleted |
| `lib/markdown/{callouts,code-blocks,code-meta,heading-anchors,tables,hast}.ts` | `@steamfield/ui/markdown`; `lib/markdown/index.ts` re-exports so `astro.config.mjs` is unchanged |
| `lib/docs.ts`, `lib/docs-enhance.ts` | wrappers over `createDocs` and `spyToc` |

Theme: `src/styles/sf-theme.css` maps `--sf-*` on `:root, .dark, .brand-surface, .paper-surface`;
copy parts are styled through `CopyCommand`'s `buttonClassName`/`promptClassName`/`commandClassName`.
Kept local: the `data-chart-reveal` mapping, AgentPrompt's radio rewiring, the docs React
components, and a one-sentence llms.txt append (`DocsConfig.intro` writes a separate paragraph,
which would change the published file).

Result: 68 of 68 screenshots pixel-identical, including mid-playback frames; `llms.txt`,
`llms-full.txt` and `.md` exports byte-identical. Web Vitest 472 → 483, Playwright 137 → 141,
`bun run check` green.

Accepted differences: reduced motion no longer announces "Demo complete"; the "Copied" label
resets after 2s; turns keyed by index; the demo clock is rAF with a 100ms cap instead of a 40ms
interval; when the Clipboard API is missing, the `execCommand` fallback now copies instead of
showing "Copy failed"; four scripts per page instead of three; docs table regions are labelled
from their heading ("Uninstall table") instead of all "Scrollable table".

## kelvo (docs-site)

Branch `feat/steamfield-ui`: `938ea5c` (characterization tests), `cba5659`, `5c353bf` (migration),
`26419fb` (reveal gate script, callback playback ref, blur token).

| Was | Now |
| --- | --- |
| `src/lib/markdown/*` | `createHastPlugins()` / `createShikiConfig()` in `astro.config.mjs`; deleted |
| `src/lib/docs.ts` | wrapper over `createDocs` (trailingSlash "never", exampleId "install"), export names kept |
| `src/lib/docs-enhance.ts` | `spyToc` from `@steamfield/ui/docs`; deleted |
| `src/components/CopyButton.tsx`, `src/lib/copy-buttons.ts` | wrapper over `react/copy` `CopyButton`; `enhanceCopyButtons` with kelvo's failure wording; `copy-buttons.ts` deleted |
| inline reveal script in `BaseLayout.astro`, `src/styles/motion.css` | `revealGateScript` in `<head>`, `initReveal()` + `reveal/styles.css`; kelvo timings and blur as `--sf-reveal-*` in `sf-theme.css`; `--motion-delay` call sites renamed `--sf-reveal-delay` |
| `src/lib/use-demo-frame.ts` | `usePlayback({ leaveGraceMs: 5000, motion: "full" })` with its callback ref; postMessage glue kept |
| `src/lib/use-on-screen-interval.ts` | `usePlayback({ reducedPolicy: "hold" })` plus a local interval; the hooks now return their ref |

Result: docs pages pixel-identical in all 36 shots, home at 390px and no-JS identical; home at
1280px differs only inside the live dashboard iframe. `llms.txt`, `llms-full.txt` and all 9 `.md`
exports byte-identical. Vitest 78 → 101, astro check clean. The reveal gate lands at about 6ms
against a 24ms first paint, as before the migration.

Accepted differences: visible copy failure message with "Cmd+C or Ctrl+C"; race guard; re-click
label fix; no `title` tooltip on copy; `cursor: pointer`; reveals on keyboard focus; a demo frame
that's never seen hides after the 5s grace instead of immediately; the metrics table's scroll box
is now a labelled region.

## steamfield

Branch `feat/steamfield-ui`: `2a65527` (characterization tests), `d22747e` (migration),
`e3f4970` (layer order).

| Was | Now |
| --- | --- |
| `src/components/CopyCommand.astro` inline script | library copy markup (`aria-controls`, `data-copy-label`, result region) with `data-sfx` kept; `enhanceCopyButtons(document, { copiedMs: 1600 })` |
| `src/components/home/RrDemo.tsx` rAF loop | `usePlayback({ autoStart: false, duration, motion })` with the display store as the `MotionSource` |

Kept bespoke by decision: `StacksDemo` and `src/lib/stacks-demo.ts` (interactive shell), its
cancel handling, and the `<noscript>` transcript in `index.astro`.

Result: 187 of 205 captures byte-identical, including every reduced-motion and motion-off shot
and all no-JS shots; the clock-driven RrDemo mid frame differs by one frame of timing (0.04%).
`make lint/check/test/build` green, 71 tests.

Accepted differences: copy button accessible name "Copy command"; the button now appears without
`navigator.clipboard` (execCommand fallback); failure selects the text and announces it instead of
"Select and copy" with no selection; success is announced; RrDemo also pauses on
`visibilitychange`.

## openchart (examples)

Branch `feat/steamfield-ui`: `4e3570d4` (characterization tests), `783ac8d3` (migration),
`a2ef972b` (library update).

`examples/src/gallery/agents/replay.ts` now builds a `DemoScript` and compiles it with the
library's `compile`; `deriveView` is a wrapper over `stateAt`. `AgentReplay.tsx` runs on the
headless `useAgentDemo` (clock, play/pause, speed, in-view autostart, reactive reduced motion,
seek). `Conversation`, `SpecPane`, `DashboardStage`, `scenarios` and `agents.css` are unchanged;
spec-pane helpers (`lineDiff`, `streamPrefix`) stay local. The live chart keeps stable spec
identity within a turn.

Result: 48 of 56 captures pixel-identical (all final, still and settled frames); the 8 mid-playback
frames lag by about 50ms because of the 100ms step cap. Full test suite 8610 → 8626; the 24 replay
tests pass unchanged.

Accepted differences: reduced motion is reactive; the IntersectionObserver is guarded; playback
only runs while the player is in view.

## decks

Branch `feat/steamfield-ui`: `b579124` (characterization tests), `b5034ea` (migration),
`e268690` (server/name header spans).

`examples/agent-experience/components/ToolCallCard.vue` is a thin wrapper over the Vue
`StaticTranscript` (terminal layout, one tool-call step, the spec in the `toolBody` slot), with
`styles/sf-theme.css` mapping `--od-*` onto `--sf-*`. `useScriptedDemo` and its callers stay:
they aren't transcripts.

Result: slide 9 is pixel-identical (0 px) in all 12 captures, using
`glyphs.serverSeparator: " · "` and a dimmed `tool-label` with a bright `tool-name`.

## opendata

Not committed: the repo's `tmr-confidentiality-staged` pre-commit hook fails closed in a worktree
(the gitignored client data exists only in the main checkout), and the `SKIP` commit was blocked
by the session's permission classifier. Everything is staged or modified on `feat/steamfield-ui`
in `~/Projects/.sfui-worktrees/opendata` for the maintainer to commit, ideally as two commits:
the five characterization tests (already staged), then the migration.

| Was | Now |
| --- | --- |
| `shared/components/mcp-chat-demo/` sequencer and parts (`use-chat-sequencer`, `user-message`, `assistant-text`, `chat-input`, `content-transition`, `invocation-bar`) | thin wrapper over `react/agent-demo` (chat layout) with `adapter.ts` mapping `Turn` to `DemoScript`; public props and types unchanged; the search, info and chart cards render as `renderToolBody` content; deleted parts removed |
| `shared/components/copy-button.tsx`, copy in `code-block.tsx`, `frontend/app/hooks/use-copy-to-clipboard.ts` | `useCopy` |
| `frontend/app/components/marketing/tabs.tsx`, `code-window.tsx` chrome | wrapper over `react/tabs` (manual activation kept); `DemoWindow` |
| `frontend/app/components/marketing/use-count-up.ts` | wrapper over `useCountUp` |
| `shared/hooks/use-in-view`, `use-prefers-reduced-motion`, `use-near-viewport`, `use-section-reveal` | rebuilt on `createPlaybackGate`; `useSectionReveal` keeps its signature, drops the `motion` import, and stamps `data-reveal` so the library CSS applies |
| global `[data-motion]{opacity:0}`, `marketing.css` start states, most of `motion.css` | `revealGateScript` in the frontend `root.tsx` and blog layout heads, `initReveal()` on the client (skipping hook-owned sections), `reveal/styles.css`; 132 `--motion-delay` call sites renamed `--sf-reveal-delay`; drug-prices timings as `--sf-reveal-*` tokens |

Kept local: the start states for the `motion`-animated heroes and pre-hydration section content
(gated on `html[data-motion-ready]`), the pointer-events rule during entrances, the hero
`will-change`, the `motion`-based animation hooks, and `use-typewriter.ts` (no callers; flagged as
dead code rather than deleted). `talks/` is out of scope by decision; the scripted deck demos live
in `decks` going forward.

Result: frontend vitest 4619 → 4663, typecheck and lint pass, astro check and build pass, 48 e2e
tests pass (landing-mobile, dataset-detail, dataset-detail-mobile, docs-journey, accessibility,
drug-prices-journey). Every code-window shot and every motion-mode full page matches the baseline.
Pre-existing failures, unchanged: two `format:check` files and one blog chart-data test.

Accepted differences: the chat demo's text and chart card sit 1-2px off their old position;
reduced motion shows the last tool call then the last text in script order (before, the text sat
above the chart); `autostart="off"` shows the end state instead of an empty body; no-JS pages now
show their content (home, enterprise, the blog newsletter rail, the `/docs/mcp` demo end state)
instead of hiding it; `autostart="manual"` waits until the demo is on screen; the info card uses
the library skeleton; count-ups render their end value on the server; code-window tabs show no
selected tab before hydration.

## rr site

Waiting: `site/` is untracked on `feat/landing-site`. Once it is committed, the swap is
`src/components/landing/TerminalPlayer.tsx` → `AgentDemo` (terminal layout) inside the existing
`MonitorStage`, `CommandTabs`/`InstallTabs` → `react/tabs`/`react/install-tabs`, the copy helpers
in `src/scripts/site.ts` → `@steamfield/ui/copy`, `setupReveals` → `initReveal`, and the docs
helpers → `@steamfield/ui/docs` (its GitHub link rewriting via `rewriteLink`, its leading-title
strip as a local step). `TerminalPlayer.test.tsx`, `CommandTabs.test.tsx` and `e2e/site.spec.ts`
are the gate.

## Library gaps found by migrations (all fixed on main)

| Gap | Found by |
| --- | --- |
| No way to set the reveal gate before first paint from a deferred script | kelvo, stacks-api |
| `usePlayback` couldn't attach to an element that mounts later | kelvo |
| No reveal blur token | kelvo |
| Every markdown table region got the same label (axe `landmark-unique`) | stacks-api |
| README layer order let Tailwind preflight override library CSS | stacks-api |
| No `llms.txt` intro option | stacks-api |
| `CopyCommand` couldn't class its inner parts | stacks-api |
| Terminal tool header rendered server and name as one span | decks |
| README still called the Vue binding unreleased | openchart/decks |
