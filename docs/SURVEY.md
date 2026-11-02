# Survey: duplicated landing, demo and docs components

Status: draft for review, 2026-11-02. Nothing is implemented yet.

This survey covers every source listed in the brief, plus extra copies a grep across `~/Projects` found (talks per-deck demos, the `decks` repo, OpenChart's `AgentReplay`, rr's existing `TerminalPlayer`, rr/template `site.ts` copy helpers). For each component it records the sources and what each one does, the baseline chosen, and what is merged in from the others. Paths are relative to `~/Projects`. `file:line` references were current on 2026-11-02.

## Consumer versions

| Repo | React | Vue / Slidev | Astro | Tailwind |
|---|---|---|---|---|
| stacks-api/apps/web | ^19.3.1 | | ^7.4.2 | ^4.3.3 |
| kelvo/docs-site | 19.3.0 (exact) | | ^7.4.4 | ^4.3.3 |
| steamfield | ^19.3.1 | | ^7.4.4 | ^4.3.3 |
| rr/site (`feat/landing-site`) | ^19.3.1 | | ^7.4.5 | ^4.3.3 |
| opendata/frontend | ^19.2.8 | | (React Router ^8.4) | ^4.3.0 |
| opendata/blog | ^19.2.8 | | ^7.1.3 | ~4.2.4 |
| opendata/shared | peer ^19.0.0 | | | |
| opendata/talks | | Slidev ^52.19, Vue 3.5.41 (transitive) | | none |
| decks | | Slidev ^52.19, Vue 3.5.44 | | none |
| openchart/examples | ^19.3.0 | | (Ladle) | none |

Peer ranges follow from this: `react`/`react-dom` `^19.2`, optional `vue` `^3.5`. Talks, decks and OpenChart have no Tailwind, and the blog sits on a different Tailwind minor, so the library ships plain CSS with custom properties and no Tailwind class names. Shipping Tailwind classes would also force every consumer to add `@source` scanning of `node_modules`.

## 1. Agent demo (one component, chat and terminal layouts)

### Sources

| Source | Kind | Clock | Tests |
|---|---|---|---|
| opendata/shared `mcp-chat-demo` (MCD) | React chat, 8 consumers | async `setTimeout` loop, `Math.random` jitter | none |
| opendata/talks `ScriptedChatDemo.vue` + `Demo*.vue` + registry | Vue chat | Slidev click index (`shown(at)`) | none |
| talks per-deck: `McpBetDemo`, `AskReplayDemo`, `AskDrugPricesDemo`, `AskProofStage`, `SessionReplay` | Vue wrappers + data; `SessionReplay` is a hard-coded 8-beat terminal | click index; `AskProofStage` adds a gsap position timeline (`story/timeline.ts`) | story/ only |
| decks `packages/decks/composables/scripted-demo.ts` | byte-identical copy of the talks composable | click index | none |
| openchart/examples `gallery/agents` (`AgentReplay`, `Conversation`, `replay.ts`) | React chat with live chart stage | pure `buildTimeline` + `deriveView(timeline, elapsed)` | yes, thorough |
| rr/site `TerminalPlayer` + `use-playback.ts` | React terminal | pure `schedule()` + elapsed `setInterval` 50ms | yes, unit + axe e2e |
| stacks-api `HomeCliDemo` + `home-cli-script.ts` + `use-demo-playback.ts` + `TerminalWindow` | React terminal with fake composer | pure `playbackAt(elapsed)` + `setInterval` 40ms | yes, unit + Playwright clock e2e |
| steamfield `StacksDemo` + `stacks-demo.ts` | interactive simulated shell | event-driven `setTimeout` chain | yes, unit |
| opendata frontend `code-window.tsx`, `audiences-mock-agent.tsx` | static code window with tabs (no playback) | n/a | unified-tabs test |
| opendata frontend `use-typewriter.ts` | typewriter hook | `setTimeout` chain | yes; zero callers |
| opendata blog `PlatformDemo.tsx` | chart upsell card, not a terminal | n/a | n/a |

`code-window`, `use-typewriter` and `PlatformDemo` are not agent demos. Only `CodeWindow`'s chrome and tabs, and `PlatformDemo`'s `onView` analytics pattern, carry over.

### Feature matrix

Cells: what the source does (blank = not present).

| Behavior | MCD | talks | openchart | rr TP | stacks-api | steamfield |
|---|---|---|---|---|---|---|
| User typing | per char, `max(18, typingMs/n)`±9ms, `preTyped` prefill | | user text appears whole | 28ms/char, in transcript | 23ms/char into a composer, then posts | chip types into input, 28ms/char |
| Agent text streaming | words, 60–140ms after punctuation, 20–55 otherwise | | chars proportional to time, token-snapped | words 55ms | words 48ms + caret | lines 180/60/650ms |
| Thinking indicator | 3 dots 800–1400ms after user turns | | | | 3 dots at reveal+350ms | "Printing response…" line |
| Submit flash | `submitGeneration` → 300ms | | | | ↵ for 300ms | |
| Tool states | loading → resolved (skeleton crossfade) | static `done/running/error/retried` | running → done + valid/invalid | dot waiting → success | ring spinner, Running/Completed `role=img` | |
| Output abbreviation | tags ≤5, line-clamp | `selected`, SQL collapsed | diff context | `… +N lines` (count) | "Output abbreviated" (flag, no count) | literal `…` |
| Line tones | | | ✓/✗ | `ok/fail/warn/muted` | | |
| Click `at` beats, sub-gates | | yes, body `at` | | | | |
| Backward / seek | | instant unmount | turn jump, Next | | | |
| Pause/resume | tab hide only (buggy) | n/a | Play/Pause | yes | yes, plus CSS `data-paused` | |
| Replay | | slide re-entry (`playCount`) | button | button | button, focus kept | Reset |
| Speed | | | 1x/2x | prop | | |
| Cancel (Esc/Ctrl+C) | | | | | | yes, appends `^C` |
| Interactive input, history, completion | | | | | | yes |
| Autostart | IO `-20%` bottom, once | slide active | IO 0.25, once | IO 0.15, repeats | IO 0.15, repeats | user starts |
| Server / pre-hydration render | empty 420px box | n/a | client only | full final transcript | full final transcript | disabled controls |
| No-JS | nothing (blog is `client:only`) | n/a | n/a | server HTML is transcript | server HTML is transcript | `<noscript>` static `<pre>` |
| Reduced motion | last text + last chart only, inverted order | animation off, content per click | first turn finished, step via Next (read once) | full transcript, controls hidden | full transcript, says "Demo complete" | instant output, user toggle |
| sr-only / live | none | none | `aria-live` per finished beat | none | sr-only "You:/Agent:", `role=status` | `role=status` |
| Scroll | `flex-col-reverse` + reversed array | outer `column-reverse` + inner `column` | JS follow, 24px threshold | forced `scrollTop` (fights user) | `flex-col-reverse` | 32px follow threshold |
| Fixed height | consumer `className` (`h-[480px]`, `!h-[380px]`) | host heights | layout | `heightClass` prop | 480/600px on window | 280px |
| Chrome | header with product copy | `window` / `ask` chrome, CSS `zoom` | panels | title bar + text button | dots + hard-coded `<h2>` "Agent + stacks" | CRT `Monitor` |
| Theming | `--mcp-*`, `.dark` class + MutationObserver | `--od-*` dark only | `[data-oc-mode]` + `--gx-*` | Tailwind `@theme` tokens | shadcn tokens + CSS module | plain CSS, VT323 |
| Live chart update | each chart its own card | | stable spec identity → `update()` | | | |
| Preload | chart chunk at turn 1 | | | | | |

### Baseline and merges

The sequencer takes OpenChart's `replay.ts` as its baseline. It's the only source that's pure, deterministic and well tested, and it already splits `buildTimeline` from `deriveView(timeline, elapsed)`. Scrub, replay, reduced motion and the final state all reduce to picking an `elapsed` value. rr's `schedule()` and stacks-api's `playbackAt()` are the same idea with less structure. The talks click model becomes a second position type (`{ click: n }`): beats with `at <= n` are done, and sub-parts can carry their own `at`. From MCD it takes the typing, submit, thinking, tool-loading and punctuation-weighted streaming phases as timing presets, with `Math.random` replaced by a PRNG seeded from the script, so `stateAt` stays pure and SSR-stable. From `useStoryTimeline` it takes the policy of seeking rather than animating on the first run, while inactive, under reduced motion, or on a jump of more than one beat.

The chat layout's visual baseline is MCD. It's the only chat copy with a composer, caret, submit flash, thinking dots, skeleton crossfade and light/dark tokens, and every web consumer of the chat look is React. Tool cards are restructured on the talks `DemoToolCall` model: one generic header (status pip, icon tile, running/past label from a consumer-supplied tool registry, meta on the right) and a body slot. The scroll structure comes from talks (outer `column-reverse`, inner `column`). It anchors to the bottom without JS, respects a user who scrolls up, and doesn't reverse the array.

The terminal layout's baseline is rr's `TerminalPlayer`. It has the most general step model (tones, separate `tool` and `tool-output`, `more` count) and a server render identical to the final state. It merges in these stacks-api pieces: the thinking dots, the running spinner with Running/Completed accessible names, the streaming caret, the optional composer mode, sr-only "You:"/"Agent:" prefixes, the `role=status` completion message, a single play-button element that keeps focus across replay, `data-paused` for CSS animations, and its e2e patterns (Playwright clock, scroll stability, below-the-fold wait).

From OpenChart, the component also takes the speed toggle, turn jumps with `aria-current`, the focusable transcript region, the 250ms tick cap (background-tab guard), and a stage slot that receives the current view, so a chart can live outside the transcript and update in place.

Steamfield's interactive shell (`runCommand(input, state)` returning lines and an effect, history, draft, cancel, completion) is a different model from a timed script. The recommendation is to keep the shell bespoke. Steamfield adopts the shared window part, the playback gate (with its motion store plugged in), the static transcript fallback and the key-handling conventions. A shared interactive driver would serve one consumer.

### Bugs found (fixed in the library, not ported)

- MCD pause: `sleep` counts time spent paused, so the in-flight step resolves at once after a tab returns.
- MCD reduced motion shows the last text above the last chart, the reverse of script order, and relies on scripts ending with a chart.
- MCD `autostart="off"` renders an empty body forever.
- MCD: the root has an `aria-label` without a role, and so does the shimmer.
- stacks-api folds reduced motion into `complete`, so reduced-motion users hear "Demo complete" for a demo that never played.
- stacks-api keys turns by text, which breaks on duplicate commands (rr's agent script runs the same command twice).
- rr forces `scrollTop` while playing and fights a user who scrolls up.
- talks `running` status never resolves, and `SessionReplay` has no reduced-motion guard.
- openchart reads reduced motion once (not reactive), and its IntersectionObserver is unguarded.

### Product coupling that stays in consumers

- MCD: `mcp · tryopendata.ai`, `CONNECTED · 7 TOOLS`, the CSV placeholder, the `opendata` invocation label and glyph colors, `APP_URL` dataset links, and the search/info/chart card bodies (relevance %, schema table, us-atlas injection, `chromeLayout` forcing, the 260px plot).
- talks: /ask copy ("Share", "Open in figure editor", "Verified", "Answers cite…"), registry accents, the SQL tokenizer, `$clicks`/`useIsSlideActive`.
- openchart: `validateSpec`, diffs, dashboard layouts.
- stacks-api: "Agent + stacks", "Message your agent…", the completion sentence.

These become a per-consumer tool registry, labels and body renderers. Talks tool body kinds split into generic ones the library renders (`lines` with tones and `more`, `code` with an optional collapse, `steps`, `error`) and product ones the consumer renders through the body slot (`hits`, `hit-compact`, `search`, `query`, `dataset-info`, `sources`, `chart`).

`QUALITY_OF_LIFE_SCRIPT` and `ChartCardData.eyebrow` in MCD are dead code. They're noted here and left alone.

## 2. Playback gate

| Source | In-view | Tab hidden | Grace | Reduced motion | User override | Replay | Clock | SSR |
|---|---|---|---|---|---|---|---|---|
| stacks-api `use-demo-playback.ts` | IO 0.15, repeats; no IO = visible | yes | | live; snaps to end | pause toggle | yes | `setInterval` 40ms | safe |
| rr `use-playback.ts` | same (generalized copy of stacks-api) | yes | | `still` | pause toggle | yes | 50ms × speed | safe |
| kelvo `use-demo-frame.ts` (+ `use-on-screen-interval.ts`) | IO default; no fallback | yes | 5s before pausing | interval never ticks (holds first frame) | | | postMessage to iframe | effect |
| steamfield `RrDemo.tsx` + `display.ts` | none (user starts) | time frozen, step capped 100ms | | via saved display store | saved motion toggle | Replay + Reset | rAF | server snapshot |
| opendata `use-count-up.ts` | `enabled` prop | pause/resume, elapsed kept | | snaps to end | | | rAF, ease-out cubic | guarded |
| opendata shared `use-in-view*`, `use-near-viewport` | various (0.1, 0.2, -25%, 400px) | | | in-view reports "visible" under reduced motion | | `once:false` | `motion` lib | `use-prefers-reduced-motion` and `use-near-viewport` read the browser during render (hydration mismatch) |

The baseline is stacks-api's hook, whose play condition is the cleanest and is tested. It's generalized to `started && inView && tabVisible && !userPaused && motionAllowed && !complete`, with these merges: kelvo's leave grace period (returning resumes at once), steamfield's injectable motion source (`motionAllowed` plus subscribe, defaulting to a live media query), a `reducedPolicy: 'end' | 'hold'` (kelvo holds the first frame), an `autoStart` flag, and a rAF clock with a 100ms step cap that keeps elapsed time across pauses.

Count-up sits on the gate with `once` semantics. It fixes opendata's stuck-number bug: `hasAnimatedRef` is set before the animation starts, so a StrictMode re-run or a later prop change freezes the number at 0 or mid-count.

## 3. Reveal / scroll motion

| | stacks-api | kelvo | opendata marketing |
|---|---|---|---|
| Root gate | `html[data-motion-ready="true"]` | `html[data-motion-ready=""]` | none; global `[data-motion]{opacity:0}` in `app.css` |
| Visible without JS | yes | yes | no |
| Revealed | `[data-revealed="true"]` | `[data-revealed]` presence | `[data-revealed="true"]` via `motion`-lib hook |
| Thresholds | home `-48px`/0.08, else `+48px`/0 | `-12%` bottom | hooks: 0.1 / 0.2 / -25% |
| Variants | `quiet`; `card` | `card`, `drop`, `popover`, `wipe` | `lift-xs…xl`, `lift-card`, `blur-in-soft`, `scale-in-media`, `slide-in-chip` |
| Duration / easing | 480ms `(0.45,0.05,0.25,1)` | 640ms token, Tailwind `--ease-out` | 340–640ms by role |
| Stagger | nth-child 40/80/120ms | `--reveal-step` 70ms × 6 | inline `--motion-delay` |
| Reduced motion | `!important` reset, live JS teardown | whole file under `no-preference` | `!important` reset |
| Focus | JS `focusin` + `:has(:focus-visible)`, no transition | `:has(:focus-visible)` (still animates) | none |
| Island gating | `[data-motion-hydrated]` + `stacks:reveal-ready` event | | |

The JS baseline is stacks-api's inline script, the only one with focus reveal, live reduced-motion teardown and late-hydration support. It adds configurable `rootMargin`/`threshold`, an `immediate` path for deep links and above-the-fold sections (from opendata), a generic ready event, a `motionAllowed` hook, and it returns a disposer.

The CSS takes its structure from kelvo, with stacks-api's safety rules and token-driven roles. The gate is under `html[data-motion-ready]` and inside `@media (prefers-reduced-motion: no-preference)`, with the reduce reset kept as a backstop. Focus reveals with `transition: none`, and `will-change` is released after reveal. Duration, step, easing, lift, scale and delay are tokens. CSS matches `[data-revealed]` by presence, so all three sites' attribute values work. The roles are the union of all three vocabularies, with opendata's role names kept as aliases.

Steamfield sets `html[data-motion="true|false"]` as a site-wide toggle. The other sites use `[data-motion]` as a per-element role. Library CSS only matches `[data-motion]` below `[data-reveal]`, so the root attribute is never hit.

The `motion`-library hooks in opendata (`use-in-view-animation`, `use-stagger-animation`, `lib/motion.ts`, the hero) stay in opendata.

## 4. Copy

| | stacks-api | steamfield | kelvo | od copy-button | od useCopy | od CopyCitation | od CopyPageMenu | rr/template `site.ts` |
|---|---|---|---|---|---|---|---|---|
| Hidden until JS | yes (target exists) | yes | yes | n/a | n/a | n/a | n/a | buttons created by JS |
| Clipboard detection | catch only | `navigator.clipboard` check | catch only | | yes | | | |
| `execCommand` fallback | | | | | yes, checks result | yes, ignores result | | |
| Copied label reset | never | 1.6s | 2s (stuck on re-click) | 2s (timer leaks) | 2s | 2s | 2s | 1.5s |
| aria-live | polite status | | polite status | | n/a | toast | toast | |
| Failure: select text | yes, opens `<details>` | | yes | | n/a | | | |
| Failure message | visible, subject-aware, Cmd/Ctrl+C | "Select and copy" (selects nothing) | sr-only, Cmd only | none | caller | none | none | "Copy failed" |
| Race guard | yes | | | | mounted guard | | | |
| Analytics | | `data-sfx` | | `onCopy(label)` | | `track.event` | | `data-track` (fires on failure too) |
| Tests | markup | | 4 behavior tests | | yes | citation text | | |

- `copyText(text): Promise<boolean>` is based on opendata's `writeClipboard`: Clipboard API first, then a readonly-textarea `execCommand` fallback that respects its result, and it never throws.
- `enhanceCopyButtons(root, opts)` starts from kelvo's module and tests. It merges in stacks-api's race guard, the visible failure message, "Cmd+C or Ctrl+C", and an extensible subject map that includes prompts. It fixes kelvo's re-click bug by storing the idle label once. Other options: `copiedMs`, `messages`, and an `onCopy({ id, label, ok })` callback plus a `sf:copy` CustomEvent.
- `useCopy()` lifts opendata's hook onto `copyText`.
- `CopyCommand` follows stacks-api's markup: text in the DOM, `$` set `aria-hidden` and `select-none`, a sibling polite status region, and data-part hooks. It renders as plain server HTML, with no `client:*` needed, and `enhanceCopyButtons` activates it.

## 5. Tabs and install tabs

| | template / rr InstallTabs | rr CommandTabs | opendata marketing `tabs.tsx` | opendata `mcp-install.tsx` |
|---|---|---|---|---|
| Pattern | ARIA tabs | anchors with `role=tab` | compound, controlled | split button + disclosure (not tabs) |
| Keys | Left/Right, auto | all four, auto, `preventDefault` | by orientation, Home/End, manual, skips disabled | |
| No-JS | first panel only, others unreachable | CSS `:target`, all panels in HTML, deep links | inactive panels unmounted | |
| Hash | | read on mount, `replaceState` | | |
| Change reporting | hard-coded `track` (rr) | `rr:command-tab` CustomEvent | `onValueChange` | `onInstall` |
| Copy | no try/catch (unhandled rejection), no live region | | | via CodeBlock |

One controller merges two sources. From opendata it takes the keyboard model and the controlled/uncontrolled API. From rr's CommandTabs it takes the progressive model: anchor tabs, all panels in the HTML, the shipped `:target` CSS, ARIA and roving tabindex applied only after hydration, and hash read and sync. The options are `activation: 'auto' | 'manual'` (manual for opendata, where it stops inflating analytics) and `keepMounted` (default true). Changes are reported through `onValueChange` plus an optional CustomEvent, so no tracker gets imported. `InstallTabs` builds on the controller and `useCopy`, with `onCopy(option)`, a polite live region, a reset on tab switch and a failure message. The two identical InstallTabs test files merge, gaining cases for copy failure, Home/End and no-JS. `mcp-install.tsx` isn't a tabs pattern and stays in opendata.

## 6. Docs chrome, markdown plugins, llms helpers

Apart from formatting, stacks-api and kelvo/docs-site are one codebase:

| Area | Overlap | Difference |
|---|---|---|
| `lib/markdown/*` (callouts, code-blocks, code-meta, hast, heading-anchors, tables) + test | 100% behavior | formatting |
| `lib/docs-enhance.ts` (`spyToc`) | 100% | formatting |
| `pages/llms.txt.ts`, `llms-full.txt.ts` | byte-identical | |
| `pages/docs/[...slug].md.ts` | identical | formatting |
| `lib/docs.ts` | ~85%, all logic shared | groups, summary, product name, trailing-slash policy, extra llms links |
| `DocsShell`, `DocsSidebar`, `TableOfContents`, `DocsPager`, `DocCard`, `DocsPageActions` | 85–97% | Tailwind class strings only, plus one breadcrumb path and one product name |
| `DocsProse.module.css`, `DocCard.module.css` | ~85% | brand tokens |

The stacks `astro-product-site` template and rr/site have a third, incompatible implementation. It's a single-file plugin set with `aside.callout` and `figure.code-frame` markup instead of `blockquote[data-callout]` and `figure[data-code-block]`, has no code groups and no copy-button markup, and its `docs.ts` is config-driven but lacks link rewriting.

Recommendation: share the logic and keep the look per site. `@steamfield/ui/markdown` takes the kelvo/stacks-api plugin set, adding the template's table-region a11y and its CAUTION callout. `@steamfield/ui/docs` provides the docs.ts logic as a config object (`groups`, `summary`, `name`, `trailingSlash`, `optionalLinks`, a `rewriteLink` hook for rr's GitHub links) plus `spyToc` and the llms/`.md` route factories. These are pure functions with existing tests, and today every fix lands two or three times. For example, kelvo fixed the copied-label reset that stacks-api still has, and stacks-api has the race guard kelvo lacks. `satteri`, `shiki` and `github-slugger` become optional peers scoped to the `markdown` subpath. That's the one exception to zero runtime dependencies, and it costs nothing for consumers that don't import the subpath.

The docs TSX components stay per site. They're 30–100 lines each, differ only in Tailwind class strings, and sharing them would mean a slot API larger than the components. This gets revisited if a third docs site appears.

## 7. Decisions needed before implementation

1. Behavior-changing bug fixes. The fixes above (copy label, MCD pause, reduced-motion order and "Demo complete", opendata invisible no-JS content, InstallTabs unreachable no-JS panels, rr scroll fighting) change what users see in edge cases. Recommendation: fix them in the library and list each one in `docs/MIGRATION.md` as an accepted diff. The alternative is replicating each quirk behind an option to keep migrations pixel-identical.
2. The stacks `astro-product-site` template is a scaffolding source in the stacks repo, and rr/site copied it. Should it depend on `@steamfield/ui` (markdown/docs/copy/install-tabs), or stay self-contained, with only rr/site migrating? Moving rr's docs to the shared plugin markup means rewriting rr's docs CSS selectors.
3. Steamfield's interactive shell stays bespoke (recommended), or the library grows an interactive driver.
