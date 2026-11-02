# Proposed API

Status: draft for review, 2026-11-02. Derived from [SURVEY.md](SURVEY.md). Names are working names.

Framework-free code lives at top-level subpaths and React at `react/*`. Vue at `vue/*` comes after React. Each subpath imports only what is shown in its "depends on" line; an import-graph test enforces this.

| Subpath | Contents | Depends on |
|---|---|---|
| `script` | `DemoScript` types, `validateScript` | none |
| `sequencer` | `compile`, `stateAt`, `finalState`, `clickCount`, timing presets, `transcriptText` | `script` |
| `playback` | `createPlaybackGate` | none |
| `copy` | `copyText`, `enhanceCopyButtons` | none |
| `tabs` | `createTabs` (DOM controller), `tabs/styles.css` (`:target` fallback) | none |
| `reveal` | `initReveal`, `reveal/styles.css` | none |
| `markdown` | Sätteri hast plugin factories | optional peers `satteri`, `shiki`, `github-slugger` |
| `docs` | `createDocs(config)`, `spyToc`, llms and `.md` route helpers | none |
| `react/playback` | `usePlayback`, `useCountUp` | `playback` |
| `react/copy` | `useCopy`, `CopyCommand`, `CopyButton` | `copy` |
| `react/tabs` | `Tabs`, `TabList`, `Tab`, `TabPanel` | `tabs` |
| `react/install-tabs` | `InstallTabs` | `react/tabs`, `react/copy` |
| `react/window` | `DemoWindow` (optional chrome) | none |
| `react/agent-demo` | `useAgentDemo`, `AgentDemo`, `StaticTranscript`, `agent-demo/styles.css` | `sequencer`, `playback` |
| `vue/agent-demo` | `useAgentDemo` composable, `AgentDemo` component | `sequencer`, `playback` |

## script

```ts
type Tone = "default" | "ok" | "fail" | "warn" | "muted"
type Line = string | { text: string; tone?: Tone }
type At = { at?: number }                      // Slidev click index; optional everywhere

type Step<TData = unknown> = At & (
  | { kind: "user"; text: string; preTyped?: string; composer?: boolean }
  | { kind: "agent-text"; text: string; lead?: string }
  | { kind: "thinking"; ms?: number }
  | { kind: "pause"; ms: number }
  | { kind: "prompt"; text: string }            // shell prompt prefix, e.g. "~/demo $"
  | { kind: "command"; text: string }
  | { kind: "output"; lines: Line[]; more?: number }
  | { kind: "tool-call"; id?: string; name: string; server?: string; args?: string
      status?: "running" | "done" | "error" | "retried" | (string & {})
      meta?: string; output?: Line[] & At; more?: number; body?: ToolBody<TData> }
)
type ToolBody<TData> =
  | { kind: "lines"; lines: Line[]; more?: number } & At
  | { kind: "code"; lang?: string; code: string; collapsed?: boolean } & At
  | { kind: "steps"; steps: string[] } & At
  | { kind: "error"; summary: string } & At
  | { kind: "custom"; data: TData } & At       // rendered by the consumer's body slot

type DemoScript<TData = unknown> = { id?: string; steps: Step<TData>[] }

validateScript(script, { kinds?: Step["kind"][] }): void   // throws LibraryError with step index
```

OpenData keeps its `Turn` type and converts with an adapter in `@opendata/shared`. Its search, info and chart turns become `tool-call` steps with `body: { kind: "custom", data }`. stacks-api's `command` turn (call plus output, `excerpt` flag) becomes `tool-call` with `output` and an explicit `more` count. Talks beats map one to one, with `at` preserved.

## sequencer

```ts
type Timing = {
  startDelay: number
  typeMsPerChar: number | ((step) => number)    // MCD: max(18, typingMs / n)
  jitter: number                                // ± ms, from a seeded PRNG
  streamUnit: "char" | "word" | "line"
  wordMs: number; punctuationMs: number
  toolMs: (step) => number                      // MCD: clamp(timeMs + 200, 800, 1800)
  gapMs: number; thinkingAfterUser: number | false
}
const presets: { chat: Timing; terminal: Timing; instant: Timing }

compile(script, { timing?: Partial<Timing>, seed?: string }): Timeline
stateAt(timeline, pos: { ms: number } | { click: number }): DemoView
finalState(timeline, { policy?: "all" | "last" | ((steps) => number[]) }): DemoView
clickCount(script): number
transcriptText(script): string                  // plain text for noscript / sr / llms

type DemoView = {
  entries: Array<{ key: string; step: Step; index: number
                   phase: "typing" | "submitted" | "thinking" | "revealing" | "holding" | "done"
                   progress: number; visibleText?: string; visibleLines?: Line[] }>
  composer: { text: string; flash: boolean } | null
  current: number; complete: boolean; elapsed: number; duration: number
  turnStarts: number[]; turnEnds: number[]
}
```

`stateAt` is pure and deterministic for a given seed, so SSR, the first client render, tests and screenshots agree. Keys are step indices (or `id`), never text.

## playback

```ts
createPlaybackGate(el: Element, {
  autoStart?: boolean                           // default true
  threshold?: number; rootMargin?: string       // default 0.15
  leaveGraceMs?: number                         // default 0; kelvo 5000
  motion?: "auto" | "reduce" | "full" | { get(): boolean; subscribe(cb): () => void }
  reducedPolicy?: "end" | "hold"
  duration?: number; speed?: number             // enables the rAF clock (100ms step cap)
  onFrame?(elapsed: number): void
}): { play(); pause(); toggle(); replay(); seek(ms); reset(); destroy()
      getState(): GateState; subscribe(cb): () => void }
```

`usePlayback(opts)` returns `{ ref, elapsed, playing, paused, reduced, complete, ready, toggle, replay, seek }` and is SSR-safe: everything starts false and `ready` flips in an effect. `useCountUp(end, opts)` builds on the gate.

## react/agent-demo

```tsx
const demo = useAgentDemo(script, {
  scriptKey?: string                            // reset only when this changes
  timing?, seed?, finalPolicy?, autoStart?, speed?, motion?
  onStepStart?(i, step), onComplete?()
}) // => { view: DemoView, controls: { play, pause, toggle, replay, seek, cancel }, ref, ... }

<AgentDemo
  script={script}
  layout="chat" | "terminal"
  labels={{ play, pause, replay, completeStatus, idleStatus, you, agent, running, done, placeholder }}
  glyphs={{ prompt: "$", user: "❯", agent: "●", output: "⎿", spinner: ["⠋", ...] }}
  tools={{ [name]: { label, runningLabel, icon?, accent? } }}  // consumer registry
  renderToolCall?={(ctx) => ReactNode}          // whole card
  renderToolBody?={(ctx) => ReactNode}          // body only; ctx: { step, index, loading, mode: "static" | "live" }
  stage?={(view) => ReactNode}                  // e.g. OpenChart's live chart pane
  controls?="inline" | "none" | ((c) => ReactNode)
  composer?: boolean
  announce?="status" | "beats" | "none"         // default "status": one sr-only role=status, no live region on playing content
  className?, style?, privacyClassName?         // e.g. "ph-no-capture"
  {...playback and sequencer options}
/>

<StaticTranscript script={script} layout="terminal" />   // server-safe; place outside a client:only island
```

The server and pre-hydration render are `finalState`. Entrance CSS only applies under `[data-sf-animating]`, which is set after hydration, so the final state is visible without JS. Height comes from `--sf-demo-height`, and a consumer `className` overrides it because the CSS is layered.

## react/window

`<DemoWindow title? dots?={true} controls?={node} label?>` provides traffic lights, a title and a controls slot. It renders no heading element; the consumer supplies one.

## copy

```ts
copyText(text: string): Promise<boolean>
enhanceCopyButtons(root: ParentNode, {
  copiedMs?: number                             // 2000
  subjects?: Record<string, string>             // aria-label -> subject for messages
  messages?: { copied?: string; failed?: (subject, { hidden }) => string }
  onCopy?(e: { id: string; label: string; ok: boolean }): void   // also dispatches "sf:copy"
}): () => void
useCopy({ resetMs?, onCopy? }): { copied: boolean; copy(text): Promise<boolean> }
<CopyCommand id command prose? label? emphasis? prompt?="$" />
```

## tabs and install-tabs

```ts
createTabs(root, { activation?: "auto" | "manual", orientation?, hash?: boolean | "replace",
                   onChange?(id), eventName?: string }): () => void
```

React `Tabs` takes `value`/`defaultValue`/`onValueChange`, plus `activation`, `orientation`, `keepMounted` (default true), `asAnchors` (default true) and `hash`. `<InstallTabs options={[{ id, label, command, note? }]} onCopy?(id) labels? />`.

## reveal

```ts
initReveal({ rootMargin?, threshold?, immediate?: (el) => boolean,
             motionAllowed?: () => boolean, readyEvent?: string }): () => void
```

Markup contract: `[data-reveal]` containers, `[data-motion="<role>"]` children, `[data-motion-part]` staggered parts, and `html[data-motion-ready]` as the root gate. Tokens: `--sf-reveal-duration`, `--sf-reveal-step`, `--sf-reveal-ease`, `--sf-reveal-lift`, `--sf-reveal-scale`, `--sf-reveal-delay`.

## CSS contract

Every stylesheet is wrapped in `@layer sf` and uses `:where()` selectors. Consumers declare `@layer sf, …` ahead of their utilities so Tailwind classes win.

Base tokens: `--sf-bg`, `--sf-surface`, `--sf-fg`, `--sf-muted`, `--sf-faint`, `--sf-accent`, `--sf-border`, `--sf-radius`, `--sf-font`, `--sf-font-size`, `--sf-ok`, `--sf-fail`, `--sf-warn`, `--sf-info`, `--sf-demo-height`. Component tokens extend these where the survey showed real need, for example the MCD card surfaces.

There's no built-in dark mode: each consumer maps its light/dark tokens in its own theme file. `[data-sf-motion="reduce"]` on any ancestor disables animation, alongside the media query.

`data-part` values and `--sf-*` names are snapshot-tested as public API. While on 0.x, a minor version is breaking and consumers pin `~0.x`.
