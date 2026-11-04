# API

Status: reflects the built code as of 2026-11-02. Originally a proposal derived from [SURVEY.md](SURVEY.md); where the build differs from that proposal the text says **Deviation** and gives the reason. The consumer-facing reference with every prop and default is the package [README](../README.md); this file is the design-level view.

Framework-free code lives at top-level subpaths and React at `react/*`. Vue at `vue/*` follows React; `vue/agent-demo` is the one Vue subpath. Each subpath imports only what is shown in its "depends on" line; an import-graph test enforces this.

| Subpath | Contents | Depends on |
|---|---|---|
| `script` | `DemoScript` types, `validateScript`, `LibraryError`, `isLibraryError` | none |
| `sequencer` | `compile`, `stateAt`, `finalState`, `clickCount`, `presets`, `transcriptText` | `script` |
| `playback` | `createPlaybackGate` | none |
| `copy` | `copyText`, `enhanceCopyButtons`, `copy/styles.css` | none |
| `tabs` | `createTabs` (DOM controller), `tabs/styles.css` (`:target` fallback) | none |
| `reveal` | `initReveal`, `revealGateScript`, `revealGateHash`, `motionTokens`, `reveal/styles.css` | none |
| `markdown` | Sätteri hast plugin factories, `createShikiConfig`, `markdown/styles.css` | optional peers `satteri`, `github-slugger` (and `shiki` for types) |
| `docs` | `createDocs(config)`, the unbound helpers, `spyToc` | none |
| `react/playback` | `usePlayback`, `useCountUp` | `playback` |
| `react/copy` | `useCopy`, `CopyCommand`, `CopyButton` | `copy` |
| `react/tabs` | `Tabs`, `TabList`, `Tab`, `TabPanel` | `tabs` (shared core) |
| `react/install-tabs` | `InstallTabs`, `react/install-tabs/styles.css` | `react/tabs`, `react/copy` |
| `react/window` | `DemoWindow` (optional chrome), `window/styles.css` | none |
| `react/agent-demo` | `useAgentDemo`, `AgentDemo`, `StaticTranscript` | `sequencer`, `playback`, `react/playback`, `react/window` |
| `agent-demo/styles.css` | CSS only; the `data-part` contract shared by every framework renderer | none |
| `vue/agent-demo` | `useAgentDemo` composable, `AgentDemo` and `StaticTranscript` components | `sequencer`, `playback` |

**Deviation:** `react/agent-demo` also depends on `react/playback` (it is `usePlayback` underneath) and `react/window` (the `chrome` prop). `tabs` and `react/tabs` share a `core.ts` for keyboard, hash and event logic rather than the React tabs wrapping `createTabs`, so the two cannot disagree. `markdown` uses `shiki` for types only; at runtime it needs `satteri` and `github-slugger`. `docs` also exports `spyToc`, the one browser-touching function there.

## script

```ts
type Tone = "default" | "ok" | "fail" | "warn" | "muted"
type Line = string | { text: string; tone?: Tone }
type At = { at?: number }                      // Slidev click index; optional everywhere
type ToolStatus = "running" | "done" | "error" | "retried" | (string & {})

type Step<TData = unknown> = At & (
  | { kind: "user"; text: string; preTyped?: string; composer?: boolean; typingMs?: number }
  | { kind: "agent-text"; text: string; lead?: string }
  | { kind: "thinking"; ms?: number }
  | { kind: "pause"; ms: number }
  | { kind: "prompt"; text: string }            // shell prompt prefix, e.g. "~/demo $"
  | { kind: "command"; text: string; typingMs?: number }
  | { kind: "output"; lines: Line[]; more?: number }
  | { kind: "tool-call"; id?: string; name: string; server?: string; args?: string
      status?: ToolStatus; meta?: string
      output?: Line[]; outputAt?: number; more?: number; body?: ToolBody<TData> }
)
type ToolBody<TData> = At & (
  | { kind: "lines"; lines: Line[]; more?: number }
  | { kind: "code"; lang?: string; code: string; collapsed?: boolean }
  | { kind: "steps"; steps: string[] }
  | { kind: "error"; summary: string }
  | { kind: "custom"; data: TData }             // rendered by the consumer's renderToolBody
)

type DemoScript<TData = unknown> = { id?: string; steps: Step<TData>[] }

validateScript(script, { kinds?: StepKind[] }): asserts script is DemoScript
```

`validateScript` throws `LibraryError` naming the first bad field (`steps[3].text`). `invalid_script` covers malformed shape, a duplicate tool-call `id` and a `preTyped` that is not a prefix of `text`. `unsupported_step` covers an unknown step or body kind, or one outside `kinds`. `invalid_option` covers a bad `kinds` value or an unknown option key. A step without `at` reveals with the step before it.

**Deviation:** `outputAt` replaces the proposed `output: Line[] & At`. An array already has an `at` method, so an intersection with `At` collided; `outputAt` is a sibling field that carries the click the output reveals at.

**Deviation:** `status` is typed as `ToolStatus` (an exported named type) with the open `(string & {})` tail; the value is unchanged from the proposal. While a call is still running in time-paced playback, the view reports `"running"`, then the step's `status` or `"done"`.

OpenData keeps its `Turn` type and converts with an adapter in `@opendata/shared`. Its search, info and chart turns become `tool-call` steps with `body: { kind: "custom", data }`. stacks-api's `command` turn (call plus output, `excerpt` flag) becomes `tool-call` with `output` and an explicit `more` count. Talks beats map one to one, with `at` preserved.

## sequencer

```ts
type Span = number | [min: number, max: number]   // a range is sampled from the seeded PRNG

type Timing = {
  startDelay: Span
  typeMsPerChar: number | ((step) => number)
  jitter: number                                   // ± ms, from a seeded PRNG
  preTypedHoldMs: Span; submitHoldMs: Span; flashMs: number
  thinkingAfterUser: Span | false; thinkingOnSubmit: boolean; thinkingMs: Span
  streamUnit: "char" | "word" | "line"
  streamLeadMs: number
  wordMs: Span; punctuationMs: Span; readMs: Span
  lineMs: number; revealCapMs: number
  toolMs: (step) => number
  gapMs: Span
}
const presets: { chat: Timing; terminal: Timing; instant: Timing }

compile(script, { timing?: Partial<Timing>, seed?: string, composer?: boolean }): Timeline
stateAt(timeline, pos: { ms: number } | { click: number }): DemoView
finalState(timeline, { policy?: "all" | "last" | FinalPick | { pick: FinalPick; order?: "script" | "listed" } }): DemoView
type FinalPick = (steps) => number[]
clickCount(script): number
transcriptText(script): string                    // plain text for noscript / sr / llms

type DemoView = {
  entries: Array<{ key: string; index: number; step: Step
                   phase: "typing" | "submitted" | "thinking" | "revealing" | "holding" | "running" | "done"
                   progress: number
                   visibleText?: string; visibleLines?: Line[]
                   status?: ToolStatus; bodyVisible?: boolean; more?: number }>
  composer: { text: string; flash: boolean } | null
  current: number; complete: boolean; elapsed: number; duration: number
  turnStarts: number[]; turnEnds: number[]
}
```

`stateAt` is pure and deterministic for a given seed, so SSR, the first client render, tests and screenshots agree. Keys are the step `id` (tool calls) or the step index, never text. `compile` starts from the `chat` preset and applies `timing` over it; an unknown timing key is `invalid_option`. `presets.chat` reproduces the OpenData chat demo, `presets.terminal` rr's terminal player, and `presets.instant` takes 0ms everywhere.

**Deviation:** the `Timing` shape grew from the proposal's eight fields to the full set above. The survey's chat and terminal players each had phases (pre-typed hold, submit hold, flash, read pause, per-line reveal and its cap) that the proposal had no field for, and presets could not reproduce them without those fields.

**Deviation:** durations that varied in the originals are a `Span` (a fixed ms or a `[min, max]` range) rather than a single number plus a global `jitter`. `jitter` stays only for per-character typing. The proposal listed `wordMs` and `punctuationMs` as numbers.

**Deviation:** the `chat` preset's `toolMs` is a flat 1000ms. The proposal gave MCD's `clamp(timeMs + 200, 800, 1800)`; scripts have no recorded tool time, so a consumer passes that function in `timing.toolMs` if it wants it.

**Deviation:** `Phase` gained `"running"` (a tool call before it resolves). The proposal's `"holding"` stays for `pause` steps; the proposal's `"done"` is the settled state. Tool calls therefore go `running`, `revealing` (output lines arrive), `done`.

**Deviation:** `DemoEntry` gained `status`, `bodyVisible` and `more`; the last is present only once the step is done, so a "… +N lines" row appears after the lines, not before.

**Deviation:** `compile` takes a `composer` option (default false): whether user steps without their own `composer` flag type into the composer. The proposal only had the per-step flag.

**Deviation:** `Timeline` exposes `steps` (key, index, start, end, at), `duration`, `clickCount`, `turnStarts` and `turnEnds`; the per-step tracks that `stateAt` reads are private.

## playback

```ts
createPlaybackGate(el: Element | null, {
  autoStart?: boolean                              // default true
  threshold?: number; rootMargin?: string          // default 0.15, "0px"
  leaveGraceMs?: number                            // default 0; kelvo 5000
  motion?: "auto" | "reduce" | "full" | { get(): boolean; subscribe(cb): () => void }
  reducedPolicy?: "end" | "hold"                   // default "end"
  duration?: number; speed?: number                // enables the rAF clock (100ms step cap)
  onFrame?(elapsed: number): void
}): { play(); pause(); toggle(); replay(); seek(ms); reset(); setSpeed(n); destroy()
      getState(): GateState; subscribe(cb): () => void }
```

`GateState` is `{ started, inView, tabVisible, paused, reduced, complete, playing, elapsed }`. `playing` is `started && inView && tabVisible && !paused && !reduced && !complete`. With a `null` element, or without `IntersectionObserver`, the demo counts as in view. A `MotionSource.get()` returns true while motion is allowed.

**Deviation:** the gate gained `setSpeed(n)`, used by the hook's speed toggle. The proposal only had `speed` as an option.

**Deviation:** `el` may be `null` (the proposal typed `Element`), so a gate can drive a clock with no element, such as a test or a headless counter.

`usePlayback(opts)` returns `{ ref, elapsed, playing, paused, reduced, complete, ready, play, pause, toggle, replay, seek, reset }` and is SSR-safe: everything starts false and `ready` flips in an effect. Changing `duration`, `motion` or an observer option starts over at 0. The hook holds one gate for its whole life, created disconnected during render and connected in an effect, so a remount (StrictMode, `<Activity>`) resumes where it was; the gate follows its element, options and rate itself (`attach`/`configure`/`connect`/`disconnect` on an internal `BoundGate`). `useCountUp(end, opts)` builds on the gate, returns `end` on the server and under reduced motion, and floors intermediate values.

**Deviation:** `ref` is a `PlaybackRef<T>`, a callback ref that also has a read/write `current`, not a `RefObject`. An element that mounts after the first render (an iframe behind a state flip) starts fresh; before any element attaches, `autoStart` waits (explicit `play()` still runs, counted as in view). An element-to-element swap carries `elapsed`, `started`, `paused` and the rate; option changes still start at 0, and an option change plus a swap in one commit starts over once, with one new observer. Detaching keeps the state, which reads as out of view once the observer reports the element gone. `ref={ref}` and `ref.current` keep working. `useCountUp` and `useAgentDemo` return the same type.

**Deviation:** `usePlayback` returns `speed` and `setSpeed`; the option is applied to the gate in place, and a restart for a new `duration` or `motion` keeps the current rate. A rate set with `setSpeed` holds until the `speed` option changes, including across a remount. `useAgentDemo` drives its `speed` and `controls.setSpeed` through the same gate, so an invalid rate throws at the call.

## react/agent-demo

```tsx
const demo = useAgentDemo(script, {
  scriptKey?: string                               // reset only when this changes
  timing?, seed?, composer?, finalPolicy?, beforeStart?, position?
  autoStart?, threshold?, rootMargin?, leaveGraceMs?, motion?, speed?
  onStepStart?(i, step), onComplete?()
}) // => { view, controls, ref, ready, playing, paused, reduced, complete, animating, mode, speed, turn, timeline }
   // controls: { play, pause, toggle, replay, seek, cancel, setSpeed }

<AgentDemo
  script={script}
  layout="chat" | "terminal"                       // default "chat"
  labels={{ play, pause, replay, completeStatus, idleStatus, you, agent, running, done,
            failed, thinking, placeholder, next, speed, jumpToTurn, transcript, showCode, more,
            working? }}                                   // working: no default; terminal only
  glyphs={{ prompt, user, agent, output, ok, fail, submit, spinner, serverSeparator }}
  composerStart?={node}  submitIcon?={node}         // composer slots (attach icon, SVG submit)
  tools={{ [name]: { label, runningLabel, icon?, accent? } }}   // consumer registry
  renderToolCall?={(ctx) => ReactNode | undefined}              // whole card
  renderToolBody?={(ctx) => ReactNode | undefined}              // body only; ctx: { step, entry, index, loading, mode: "static" | "live" }
  stage?={(view) => ReactNode}                                  // e.g. OpenChart's live chart pane
  controls?="inline" | "full" | "none" | ((demo) => ReactNode)  // default "inline"
  header?={node}  chrome?={boolean | { title?, dots?, className? }}
  collapsible?: boolean                                         // default false: tool cards as <details open>
  transcript?={{ as?: "group" | "region", focusable?: boolean }} // default { as: "group", focusable: true }
  composer?: boolean                                            // default: layout === "chat"
  announce?="status" | "beats" | "none"            // default "status": one sr-only role=status, no live region on playing content
  className?, style?, privacyClassName?            // e.g. "ph-no-capture"
  {...useAgentDemo options}
/>

<StaticTranscript script={script} layout="terminal" />   // server-safe; place outside a client-only island
```

The server and pre-hydration render are `finalState(finalPolicy)`. Entrance CSS only applies under `[data-sf-animating]`, which is set after hydration, so the final state is visible without JS. Height comes from `--sf-demo-height`, and a consumer `className` overrides it because the CSS is layered. `position` pins the view to `stateAt` (for click-paced decks), runs no clock and shows no controls.

**Deviation:** `controls="full"` was added: the play button plus turn-jump buttons (one per turn), Next, and a 1x/2x speed toggle. The proposal had `inline`, `none` or a function.

**Deviation:** `controls.cancel()` seeks to the end (`gateSeek(duration)`) and shows the finished transcript, like skipping. It does not tear down the gate or restore the pre-play state; the proposal did not say.

**Deviation:** `controls` gained `setSpeed`, and the hook exposes `speed`, `turn`, `animating`, `mode` and `timeline`. `animating` is what renderers set `data-sf-animating` from; `mode` feeds `renderToolCall`'s `ctx.mode`.

**Deviation:** `composer` is a hook option (default false) and `AgentDemo` defaults it to `true` for the chat layout only. The proposal had it only on the component.

**Deviation:** `position` and `finalPolicy` are options of the hook itself, so a Slidev wrapper uses the same hook as a page. The proposal had no click-paced hook path.

**Deviation:** `renderToolCall` and `renderToolBody` may return `undefined` to keep the built-in rendering, and the context carries `entry` and `index` (not only `step`).

**Deviation:** `tools` entries only affect the chat layout's card header (label, running label and icon; `accent` sets `--sf-tool-accent`). The terminal layout prints the raw tool `name` (with `server` before it) and ignores the registry. There `tool-label` holds `<span data-part="tool-server">`, the `glyphs.serverSeparator` text (default `" "`, so it reads `server name`) and `<span data-part="tool-name">`, in React and Vue, so a site can show `server · name` with the server dimmed through CSS alone. The stylesheet doesn't style the two parts apart.

**Deviation:** `labels` gained `failed`, `thinking`, `next`, `speed`, `jumpToTurn`, `transcript`, `showCode` and `more`, and `glyphs` gained `ok`, `fail` and `submit`, each needed by a part the proposal's lists did not name. `glyphs.spinner` is ten braille frames advanced every 80ms of demo time.

**Deviation:** `onStepStart` also fires, in order, for steps a `seek` skips over, and again when a stretch is replayed. `onComplete` never fires under reduced motion.

**Deviation:** `chrome` wraps the transcript in `DemoWindow` and moves the controls into the title bar; `header` renders above the controls. `data-part="header"` is a flex strip either way.

**Deviation:** `StaticTranscript` takes no timing, seed or composer: it compiles with the defaults and renders `finalState`. It sets `data-static` on the root instead of `data-sf-animating`.

**Addition (0.1.x):** five opt-in extension points, so a site that renders its own markup over `useAgentDemo` (stacks-api's hero) can use `AgentDemo` instead. `labels.working` shows a `tool-working` line behind the output glyph under a running terminal call (the chat layout keeps its skeleton). The terminal header's args render as `tool-args` holding `tool-paren` spans around the args text, so the parens can be colored apart; the visible text is unchanged. `collapsible` renders each built-in tool card as `<details open>` with the header as `<summary>`, a native disclosure that works without JS. `transcript` picks a `<section>` region instead of the named group, and can drop the tab stop; the rule lives in `transcriptElement` in `agent-demo/core.ts`, beside `workingText`. `chrome.className` lands on the window root. `StaticTranscript` takes `collapsible` and `transcript` too, so the no-JS fallback matches.

**Addition (0.2.2):** six opt-in additions so OpenData's landing chat demo (`MCPChatDemo`) runs on `AgentDemo` with no visible difference. `beforeStart: "start"` renders the view at 0ms instead of the final state before playback (server, pre-hydration, `autoStart: false`), so a demo that begins from an empty transcript doesn't flash its finished one first; reduced motion still shows the final state, and the rule lives in the controller. `leaveGraceMs: Infinity` keeps a started demo playing off screen, like a one-shot observer (before, `setTimeout(Infinity)` fired at once, so it paused immediately). A user or command step's `typingMs` spreads its typing over that time, and a `typeMsPerChar` function can read it to apply its own floor. `timing.thinkingOnSubmit` starts the thinking after a user step at submit, alongside the composer flash, as OpenData's demo does. `finalPolicy: { pick, order: "listed" }` keeps a pick's order, for a reduced-motion view that puts the answer above its chart. `composerStart` and `submitIcon` (Vue slots of the same names) put nodes in the composer, with a new `composer-start` part.

The agent demo's `data-part` values, `data-layout`, `data-from`, `data-status`, `data-tone`, `data-phase` and the `--sf-demo-*` and `--sf-tool-accent` variables live in `agent-demo/styles.css`, so a Vue renderer shares them.

## vue/agent-demo

```ts
useAgentDemo(script: MaybeRefOrGetter<DemoScript>, options?: MaybeRefOrGetter<UseAgentDemoOptions>)
// -> { view, ready, started, playing, paused, reduced, complete, animating, mode, speed, turn,
//      timeline, clickMode, playCount } as refs/computeds, plus controls and el (template ref)
// options: React's, with position and active as MaybeRefOrGetter (Slidev: $clicks, useIsSlideActive())
<AgentDemo :script layout labels glyphs tools controls="inline|full|none" header chrome announce
           collapsible transcript privacyClassName :position :active @step-start @complete>
  slots: toolCall, toolBody, stage({ view }), header, controls(AgentDemoSlotState), composerStart, submitIcon
<StaticTranscript :script layout finalPolicy labels glyphs tools collapsible transcript privacyClassName>  slots: toolCall, toolBody
```

**Deviation:** render props become slots, and a slot that renders nothing (or only comments) keeps the built-in rendering. `@step-start` and `@complete` bind props, not emits. `contract.test.ts` holds the markup equal to React's. `el` follows React's element rules (autoStart waits for an element, a late element starts fresh, a swap keeps progress, option changes reset), and a `playCount` bump on slide re-entry also resets. The binding imports nothing from Slidev; the adapter is two lines in the consumer (see the README).

## react/window

`<DemoWindow title? dots?={true} controls?={node} label?>` provides traffic lights, a title and a controls slot. It renders no heading element; the consumer supplies one.

**Deviation:** `label` makes the window a `<section aria-label>` region; without it the root is a plain `div`. `className` and `style` were added. `--sf-window-dot` and `--sf-window-dot-1/2/3` colour the dots.

## copy

```ts
copyText(text: string): Promise<boolean>
enhanceCopyButtons(root: ParentNode, {
  copiedMs?: number | false                        // 2000; false keeps Copied until the next click; else 0 to 2^31 - 1 or it throws invalid_option (field "copiedMs")
  subjects?: Record<string, string>                // aria-label -> subject for messages
  messages?: { copied?: string; copiedLabel?: string; failed?: (subject, { hidden }) => string }
  onCopy?(e: { id: string; label: string; ok: boolean }): void   // also dispatches "sf:copy"
}): () => void
useCopy({ resetMs?: number | false, onCopy?(ok) }): { copied: boolean; failed: boolean; copy(text): Promise<boolean> }
// resetMs: 2000; false keeps copied until the next copy; else 0 to 2^31 - 1 or it throws invalid_option (field "resetMs") at render
<CopyCommand id command prose? prompt?="$" label? buttonText? className? buttonClassName?
             promptClassName? commandClassName? icon? />
<CopyButton controls label? children? className? icon? />
```

**Deviation:** `messages.copiedLabel` (the visible button text on success) was added alongside `messages.copied` (the announcement). Default subjects cover `Copy command`, `Copy prompt`, `Copy code` and `Copy page`.

**Deviation:** `useCopy` returns `failed` as well as `copied`, and `onCopy` receives the boolean `ok`, not an event object. The `sf:copy` event and the `onCopy` of `enhanceCopyButtons` carry the `{ id, label, ok }` detail.

**Deviation:** `CopyCommand` has `buttonText` and `icon` and no `emphasis`. `CopyButton` was added as its own export for markup that supplies its own target. Both render `hidden` buttons for server rendering and rely on `enhanceCopyButtons`; `useCopy` is the hydrated alternative.

## tabs and install-tabs

```ts
createTabs(root, { activation?: "auto" | "manual", orientation?, hash?: boolean | "replace",
                   onValueChange?(value), eventName?: string }): () => void
```

React `Tabs` takes `value`/`defaultValue`/`onValueChange`, plus `activation`, `orientation`, `keepMounted` (default true), `asAnchors` (default true), `hash`, `eventName` and `id`. `<InstallTabs options={[{ id, label, command, note? }]} onCopy?(id, ok) labels? resetMs? value? defaultValue? onValueChange? activation? orientation? keepMounted? asAnchors? hash? eventName? id? className? />`. The panel holding the initial selection carries `data-default`, which the no-JS CSS shows in place of the first panel.

**Deviation:** `createTabs` calls its callback `onValueChange`, matching the React component, not the proposal's `onChange`. It receives the new value on a click, key or hash change.

**Deviation:** `onCopy` on `InstallTabs` takes `(id, ok)` (the proposal gave `(id)`), so analytics can record failures.

**Deviation:** `InstallTabs` has its own `labels.prompt`, `labels.copied`, `labels.copiedMessage` and `labels.failed`. Keyboard moves under auto activation write the hash with `replaceState`; clicks and Enter/Space push.

## reveal

```ts
initReveal({ rootMargin?, threshold?, immediate?: (el) => boolean,
             motion?: "auto" | "reduce" | "full" | MotionSource, deferred?: (el) => boolean,
             readyEvent?: string }): () => void
revealGateScript: string   // inline in <head>: sets html[data-motion-ready] before first paint
revealGateHash: string     // "sha256-<base64>" of the snippet, for script-src
motionTokens: { easings, durations, springs, animationTypes, motionRoles }
```

Markup contract: `[data-reveal]` containers (`"quiet"` for the quiet entrance), `[data-motion="<role>"]` children (or the container itself), `[data-motion-part]` staggered parts, `data-revealed` set by the script, and `html[data-motion-ready]` as the root gate.

Tokens: `--sf-reveal-duration`, `--sf-reveal-step`, `--sf-reveal-ease`, `--sf-reveal-lift`, `--sf-reveal-scale`, `--sf-reveal-delay`, `--sf-reveal-blur` (start blur; `2px` default role, `6px` `blur-in-soft`, `10px` `blur-in`, `0px` otherwise).

**Deviation:** `revealGateScript` was added because `initReveal()` runs from deferred module scripts, so the gate could land after first paint and above-the-fold content flashed. The snippet applies the same checks as `initReveal` (IntersectionObserver, `prefers-reduced-motion`, `html[data-sf-motion="reduce"]`); `initReveal` adopts a gate it finds (setting `html[data-reveal-live]`) and removes it when its own `motion` option vetoes setup. The snippet fails open: without `data-reveal-live` 3 seconds later it removes the gate, so a module that never runs can't leave content hidden. `revealGateHash` serves a `script-src` CSP.

**Deviation:** the proposal's `readyEvent` became the way late-hydrating islands opt in, and `deferred` was added to define which containers wait for it. The default `deferred` matches `[data-reveal-defer]` that does not yet contain `[data-reveal-hydrated]`, the same rule the CSS uses to keep such content visible if hydration never happens. `readyEvent` defaults to `"sf:reveal-ready"`.

**Deviation:** the seven reveal tokens have no value set in CSS by default; each role keeps its own timing and the token is a fallback `var(--sf-reveal-x, <role default>)`. Set a token to override every role below it. The proposal implied one global default.

**Deviation:** `motionTokens` was added as plain data (`easings`, `durations` in seconds, `springs`, `animationTypes`, role timings) so JS animation code shares numbers with the CSS. The CSS role timings run a little shorter than the JS durations, by design.

**Deviation:** the role vocabulary is wider than the proposal's tokens: `quiet`, `card`, `drop`, `popover`, `wipe`, the `lift-*` family, `blur-in-soft`, `scale-in-media`, `slide-in-chip`, and the older `fade-up`, `blur-in`, `bounce-in`, `slide-left`, `slide-right` kept for existing markup.

## markdown

`createHastPlugins(options?)` returns the factories for `codeBlocks`, `codeGroups`, `callouts`, `headingAnchors` and `tables`; each is also exported alone. `createShikiConfig()` returns `{ theme: "css-variables", transformers: [codeMeta()] }`. Options: `codeBlocks: { copyLabel, copyText, idPrefix }`, `callouts: { titles }`, `headingAnchors: { label }`, `tables: { regionLabel }`, where `regionLabel` is a string, `false` (no `role="region"`, still focusable) or `(table, index, { caption, heading }) => string`. The default is the caption, else `"<heading> table"`, else `"Scrollable table"`, labels are trimmed (blank falls back to the default), and a repeated name gets the first free ` 2`, ` 3`, so regions stay unique within the document for axe `landmark-unique`. A page rendering several documents needs a function that prefixes labels per entry. `parseFenceMeta` and `codeMeta` read `title="…"` and `group="…"` from the fence.

**Deviation:** the proposal said only "Sätteri hast plugin factories". The built set also carries a Shiki config because Sätteri swaps the fence for Shiki's output before any hast plugin runs, so fence meta has to be carried on the `<pre>` by a Shiki transformer. The code-block plugin recognises Astro's `astro-code` class, so the plugins target Astro's pipeline.

## docs

```ts
createDocs(config: DocsConfig): Docs
// config: { name, summary, intro?: string | string[], groups, trailingSlash: "always" | "never",
//           optionalLinks, rewriteLink?, exampleId?, featured? }
// Docs: { config, docPath, markdownPath, docsNav, pageLinks, featuredDocs,
//         pageMarkdown, llmsIndex, llmsFull }
spyToc(root, { linkSelector?, current?, rootMargin? }): () => void
```

The unbound helpers (`docPath`, `markdownPath`, `docsNav`, `pageLinks`, `featuredDocs`, `pageMarkdown`, `llmsIndex`, `llmsFull`, `absoluteLinks`) are exported too. Nothing here touches Astro: route files pass entries from the site's own `getCollection`. Pages live at `/docs/<id>` and ship as Markdown at `/docs/<id>.md`.

**Deviation:** `docs` ships `spyToc`, which touches the DOM, so "depends on: none" holds but "pure" does not apply to that one function. `rewriteLink` and `absoluteLinks` rewrite site-relative links in exported bodies (docs links point at the page's `.md`).

## Errors

`LibraryError` and `isLibraryError` live in `script` (re-exported by nothing else, because every subpath that throws depends on `script`). `LibraryErrorCode` is `"invalid_script" | "unsupported_step" | "invalid_option"`. `error.field` names the argument or option at fault, never its value.

**Deviation:** the proposal did not name codes. There are three, and an unknown option key anywhere an options object is checked is `invalid_option` rather than silently ignored.

## CSS contract

Every stylesheet is wrapped in `@layer sf` and uses `:where()` selectors. Consumers declare `@layer theme, base, sf, components, utilities;` first: `sf` after `base` so a preflight reset (`* { margin: 0; border: 0 solid }`) can't strip library borders, and before `components` and `utilities` so Tailwind classes win. `tests/browser/layers.spec.ts` checks both.

Base tokens read by the stylesheets: `--sf-bg`, `--sf-surface`, `--sf-fg`, `--sf-muted`, `--sf-faint`, `--sf-accent`, `--sf-border`, `--sf-radius`, `--sf-font`, `--sf-font-size`, `--sf-ok`, `--sf-fail`, `--sf-warn`, `--sf-focus`, `--sf-demo-height`. Component tokens extend these where the survey showed real need: `--sf-demo-*` and `--sf-tool-accent` (agent demo), `--sf-window-dot*` (window), `--sf-reveal-*` (reveal).

**Deviation:** `--sf-focus` (the table scroll region's outline in `markdown/styles.css`) is in the set; the proposal did not list it. `--sf-info` is named in the agent-demo stylesheet's header comment but no rule reads it, and `--sf-demo-hover` is named there as well but unused.

There's no built-in dark mode: each consumer maps its light/dark tokens in its own theme file. `[data-sf-motion="reduce"]` on any ancestor disables animation in `agent-demo/styles.css` and `reveal/styles.css`, alongside the media query.

The playback gate's and `initReveal`'s default `"auto"` motion source also follow a `[data-sf-motion="reduce"]` ancestor, live, so one attribute stops both CSS and JS motion. Both accept the same `MotionSource` (`src/internal/motion.ts`, types re-exported from `playback`) for a site's saved toggle.

`data-part` values and `--sf-*` names are snapshot-tested as public API. While on 0.x, a minor version is breaking and consumers pin `~0.x`.
