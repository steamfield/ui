# @steamfield/ui

Generic landing and docs components shared across several sites: one agent/terminal demo (a scripted chat or shell session), a playback gate that plays only while the demo is on screen, copy buttons, tabs, install tabs, scroll-reveal motion, and Markdown and docs helpers.

The design rules:

- Content is data. A demo is a `DemoScript` object, install options are an array, docs are entries you pass in. Nothing is fetched or hard-coded to a product.
- The CSS is headless-ish. Stylesheets read `--sf-*` custom properties with fallbacks, select on `data-part` attributes, and sit inside `@layer sf` with `:where()` selectors, so any consumer class or utility wins.
- Cores are framework-free. React bindings live under `react/*`. A Vue binding is in progress.
- Every component has a deterministic final state. The server render, the first client render, reduced motion and a page without JavaScript all show the finished content.
- Motion is optional everywhere: `prefers-reduced-motion` and `[data-sf-motion="reduce"]` turn it off, and content never depends on it to be readable.

## Install

```sh
bun add @steamfield/ui
# or
npm i @steamfield/ui
```

ESM only: load it with `import`, or with `require()` on a Node version that loads ES modules synchronously. Types are included.

### Optional peers

Nothing is installed for you. Add the peers for the subpaths you use.

| Subpath | Needs |
| --- | --- |
| `script`, `sequencer`, `playback`, `copy`, `tabs`, `reveal`, `docs` | nothing |
| `react/*` | `react` `^19.2` (and `react-dom` to render; `@types/react` `^19.2` for TypeScript) |
| `markdown` | `satteri` `^0.10.5`, `github-slugger` `^2.0.0`; `shiki` `^4.5.0` for its types |
| `vue/*` | `vue` `^3.5` (in progress) |

All peers are marked optional, so a package manager does not warn for the ones you skip.

### CSS is opt-in

JavaScript never imports CSS. Import the stylesheet for each subpath you use, once, from your own entry or layout:

```ts
import "@steamfield/ui/agent-demo/styles.css";
import "@steamfield/ui/window/styles.css";
import "@steamfield/ui/copy/styles.css";
import "@steamfield/ui/tabs/styles.css";
import "@steamfield/ui/react/install-tabs/styles.css";
import "@steamfield/ui/reveal/styles.css";
import "@steamfield/ui/markdown/styles.css";
```

| Stylesheet | For |
| --- | --- |
| `agent-demo/styles.css` | `react/agent-demo` (and the Vue binding) |
| `window/styles.css` | `react/window`, and `AgentDemo` with `chrome` |
| `copy/styles.css` | `copy`, `react/copy`, and the copy button in `react/install-tabs` |
| `tabs/styles.css` | `tabs`, `react/tabs`, `react/install-tabs` (includes the no-JS fallback) |
| `react/install-tabs/styles.css` | `react/install-tabs` |
| `reveal/styles.css` | `reveal` |
| `markdown/styles.css` | `markdown` |

The package has `"sideEffects": ["**/*.css"]`, so unused JavaScript tree-shakes and stylesheets are kept.

### Layer ordering with Tailwind v4

Every rule is inside `@layer sf`. Declare the order once, before your utilities, so your own CSS and utilities beat the library:

```css
@layer sf, theme, base, components, utilities;
@import "tailwindcss";
```

With the order declared, a utility such as `h-96` on the demo overrides `--sf-demo-height` defaults, and a class on a tab panel overrides its `display`. Without it, the browser orders layers by first appearance, which may put `sf` above your utilities.

## Theming

Stylesheets read a shared set of base tokens. Each has a fallback, so unset tokens degrade to `currentColor`, `inherit` or system colors.

| Token | Used for |
| --- | --- |
| `--sf-bg` | Demo and window background |
| `--sf-surface` | Raised surfaces: tool cards, window bar, install tabs, user bubble in the terminal layout |
| `--sf-fg` | Primary text |
| `--sf-muted` | Secondary text, glyphs, inactive tabs |
| `--sf-faint` | Window dots |
| `--sf-accent` | Active tab underline, prompts, caret, focus ring, submit button |
| `--sf-border` | Borders and dividers |
| `--sf-radius` | Corner radius (inner elements use fractions of it) |
| `--sf-font` | Monospace font for terminal, code and commands |
| `--sf-font-size` | Agent demo font size |
| `--sf-ok`, `--sf-fail`, `--sf-warn` | Status colors: done, error, running; line tones |
| `--sf-focus` | Focus outline on scrollable tables (`markdown/styles.css`) |
| `--sf-demo-height` | Height of the agent demo transcript |

There is no built-in dark mode. Map your own light and dark tokens onto `--sf-*` in your theme file:

```css
:root {
  --sf-bg: var(--color-page);
  --sf-surface: var(--color-card);
  --sf-fg: var(--color-text);
  --sf-muted: var(--color-text-muted);
  --sf-accent: var(--color-brand);
  --sf-border: var(--color-line);
  --sf-ok: var(--color-success);
  --sf-fail: var(--color-danger);
  --sf-warn: var(--color-warning);
  --sf-radius: 0.75rem;
}

/* your site's tokens change under .dark, so --sf-* follow without extra rules */
```

If your site's tokens are redefined for dark mode, the `--sf-*` aliases follow automatically, because `var()` is resolved at the element.

Each stylesheet's own component tokens are listed in its section below.

### Reduced motion

Animation is off under `@media (prefers-reduced-motion: reduce)`. A `[data-sf-motion="reduce"]` attribute on any ancestor (usually `<html>`, driven by a site motion toggle) turns off the CSS animation in `agent-demo/styles.css` and `reveal/styles.css` the same way.

The attribute only affects CSS. The playback gate follows `prefers-reduced-motion` live and does not read the attribute. To make the JavaScript clock follow a site toggle too, pass a `motion` source to `usePlayback`, `useAgentDemo` or `AgentDemo`:

```ts
const motion = { get: () => !siteStore.reduced, subscribe: siteStore.subscribe }; // keep it stable
<AgentDemo script={script} motion={motion} />
```

## agent-demo

The core of the package. A script of steps (user messages, agent text, shell commands, output, tool calls) plays back in a chat or terminal layout.

```tsx
import "@steamfield/ui/agent-demo/styles.css";
import { AgentDemo, StaticTranscript } from "@steamfield/ui/react/agent-demo";
import { presets } from "@steamfield/ui/sequencer";
import type { DemoScript } from "@steamfield/ui/script";

const script: DemoScript = {
  id: "install",
  steps: [
    { kind: "user", text: "Set up the project" },
    { kind: "thinking" },
    { kind: "agent-text", lead: "Done.", text: "Dependencies are installed." },
    {
      kind: "tool-call",
      name: "run_command",
      args: "bun install",
      meta: "1.2s",
      output: ["12 packages installed", { text: "0 vulnerabilities", tone: "ok" }],
    },
  ],
};

<AgentDemo script={script} layout="terminal" timing={presets.terminal} />;
```

The styles, scripts and sequencer are split across subpaths, described in the sections that follow: `script` (types and validation), `sequencer` (timing and views), `playback` (the gate), then `react/agent-demo`.

### `@steamfield/ui/react/agent-demo`

```ts
import {
  AgentDemo,
  StaticTranscript,
  useAgentDemo,
} from "@steamfield/ui/react/agent-demo";
```

Also exported as types: `AgentDemoProps`, `AgentDemoControlsProp`, `AnnounceMode`, `AgentDemoLabels`, `AgentDemoGlyphs`, `ToolInfo`, `ToolRegistry`, `AgentDemoLayout`, `ToolCallContext`, `ToolRenderer`, `StaticTranscriptProps`, `AgentDemoControls`, `UseAgentDemoOptions`, `UseAgentDemoResult`.

#### `useAgentDemo(script, options?)`

The headless hook: compiles the script, gates playback and returns the view to render. Options (also accepted by `AgentDemo`):

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `scriptKey` | `string` | none | The script's identity. When it changes the script recompiles and playback restarts. Without it, script and timing are compared by content, so an inline script never restarts playback |
| `timing` | `Partial<Timing>` | the `chat` preset | Fields to change from the `chat` preset, such as `presets.terminal` |
| `seed` | `string` | the script's `id`, then `""` | Seeds the timing jitter |
| `composer` | `boolean` | `false` in the hook; `AgentDemo` uses `true` for `layout="chat"` | Whether user steps type into the composer instead of the transcript (a step's own `composer` overrides it) |
| `finalPolicy` | `"all" \| "last" \| (steps) => number[]` | `"all"` | What the server, the pre-hydration render and reduced motion show |
| `position` | `{ ms } \| { click }` | none | Pin the view to a position, such as `{ click }` from a Slidev deck. No clock runs and no controls show |
| `autoStart` | `boolean` | `true` | Start when in view. When false the final transcript shows until `play()` |
| `threshold` | `number` | `0.15` | In-view threshold |
| `rootMargin` | `string` | `"0px"` | In-view root margin |
| `leaveGraceMs` | `number` | `0` | How long the demo may be out of view before it pauses |
| `motion` | `"auto" \| "reduce" \| "full" \| MotionSource` | `"auto"` | Where motion permission comes from. Keep a custom source stable |
| `speed` | `number` | `1` | Initial clock rate |
| `onStepStart` | `(index, step) => void` | none | Once per step as playback passes its start, in order (also for steps a seek skips). Fires again on a replay or backward seek |
| `onComplete` | `() => void` | none | Playback reached the end. Never under reduced motion |

Result:

| Field | Type | Meaning |
| --- | --- | --- |
| `view` | `DemoView` | What to render now |
| `controls` | `AgentDemoControls` | `play`, `pause`, `toggle`, `replay`, `seek(ms)`, `cancel`, `setSpeed(n)`. `cancel` stops and shows the finished transcript |
| `ref` | `RefObject<HTMLDivElement>` | Attach to the element whose visibility gates playback |
| `ready` | `boolean` | False on the server and first client render |
| `playing`, `paused`, `reduced` | `boolean` | Gate state |
| `complete` | `boolean` | Playback reached the end. False under reduced motion |
| `animating` | `boolean` | Hydrated with motion allowed and following the clock or a `position`. Renderers set `data-sf-animating` from it |
| `mode` | `"static" \| "live"` | `"live"` once hydrated |
| `speed` | `number` | Current rate |
| `turn` | `number` | Index of the current turn, or `-1` before playback |
| `timeline` | `Timeline` | The compiled script |

#### `<AgentDemo>`

All hook options plus:

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `script` | `DemoScript` | required | The session |
| `layout` | `"chat" \| "terminal"` | `"chat"` | The two looks over one set of parts |
| `labels` | `Partial<AgentDemoLabels>` | see below | Overrides for any default string |
| `glyphs` | `Partial<AgentDemoGlyphs>` | see below | Overrides for the decorative glyphs |
| `tools` | `ToolRegistry` | none | Per tool `name`: `label`, `runningLabel`, `icon`, `accent` (any CSS color, sets `--sf-tool-accent`). A tool without an entry gets its name humanized ("query_sql" reads "Query sql") |
| `renderToolCall` | `(ctx) => ReactNode \| undefined` | none | Replaces a whole tool card. Return `undefined` for the default |
| `renderToolBody` | `(ctx) => ReactNode \| undefined` | none | Renders a tool body (`custom` bodies, or any kind you override) |
| `stage` | `(view) => ReactNode` | none | Content beside the transcript that follows the view, such as a live chart |
| `controls` | `"inline" \| "full" \| "none" \| (demo) => ReactNode` | `"inline"` | `"inline"` is one play/pause/replay button; `"full"` adds turn jumps, Next and a 1x/2x speed toggle; a function renders your own |
| `header` | `ReactNode` | none | Content at the top, before the controls |
| `chrome` | `boolean \| { title?, dots? }` | none | Wrap the transcript in `DemoWindow`, with controls in its title bar. Needs `window/styles.css` |
| `announce` | `"status" \| "beats" \| "none"` | `"status"` | One `role="status"` message; `"beats"` adds a polite live region with each finished beat; `"none"` nothing |
| `className`, `style` | | none | On the root |
| `privacyClassName` | `string` | none | Appended to the root class, for session-recording opt-outs such as `"ph-no-capture"` |

`ToolCallContext` (what the render props receive): `step`, `entry`, `index`, `loading` (still running, or the body has not revealed), `mode` (`"static"` on the server, before hydration and in `StaticTranscript`; `"live"` once hydrated). Render something server-safe for `"static"`.

Default labels (`AgentDemoLabels`): `play` "Play", `pause` "Pause", `replay` "Replay", `completeStatus` "Demo complete.", `idleStatus` "Example agent session.", `you` "You", `agent` "Agent", `running` "Running", `done` "Completed", `failed` "Failed", `thinking` "Agent thinking", `placeholder` "Message the agent…", `next` "Next", `speed` "Playback speed", `jumpToTurn` "Jump to turn", `transcript` "Demo transcript", `showCode` "Show code", `more(count)` `… +N lines`.

Default glyphs (`AgentDemoGlyphs`): `prompt` `$`, `user` `❯`, `agent` `●`, `output` `⎿`, `ok` `✓`, `fail` `✕`, `submit` `↵`, `spinner` ten braille frames at 80ms each.

#### `<StaticTranscript>`

The finished transcript with no playback, controls or composer, in the same parts and CSS. It reads no browser state, so it renders on the server; place it outside a client-only island as the no-JS fallback. Props: `script` (required), `layout` (`"chat"`), `finalPolicy` (`"all"`), `labels`, `glyphs`, `tools`, `renderToolCall`, `renderToolBody`, `className`, `style`, `privacyClassName`. It sets `data-static` on the root.

#### Styling hooks

CSS variables (set on the demo or an ancestor), besides the base tokens:

| Variable | Meaning |
| --- | --- |
| `--sf-demo-prose-font` | Chat message font (default `inherit`) |
| `--sf-demo-subtle-bg` | Header strip, code and composer wells |
| `--sf-demo-border-subtle` | Hairlines inside cards |
| `--sf-demo-bubble-bg` | User bubble |
| `--sf-demo-caret` | Typing and streaming caret |
| `--sf-demo-accent-strong` | Submit button while it flashes |
| `--sf-demo-accent-fg` | Text on the accent (submit arrow) |
| `--sf-demo-shimmer`, `--sf-demo-shimmer-hi` | Skeleton base and highlight |
| `--sf-demo-shadow` | The demo's box shadow |
| `--sf-tool-accent` | Per tool, set from the registry's `accent` |

Root attributes: `data-sf-agent-demo`, `data-part="agent-demo"`, `data-layout="chat|terminal"`, `data-sf-animating` (hydrated and playing), `data-paused`, `data-complete`, `data-static` (`StaticTranscript`).

`data-part` values: `agent-demo`, `header`, `controls`, `turn-jumps`, `control` (with `data-control="play|next|speed|turn"`), `transcript`, `turns`, `message` (`data-from="user|agent"`, `data-phase`), `glyph`, `text`, `lead`, `caret`, `command`, `output`, `line` (`data-tone="ok|fail|warn|muted"`), `more`, `thinking`, `thinking-dot`, `tool-call` (`data-status`, `data-phase`, `data-tool`), `tool-header`, `tool-status`, `tool-icon`, `tool-label`, `tool-args`, `tool-meta`, `tool-body` (`data-loading`), `tool-content`, `skeleton` (`data-state="loading|leaving"`), `skeleton-bar`, `code` (`data-lang`), `code-collapse`, `steps`, `step`, `error`, `composer` (`data-flash`), `composer-text`, `placeholder`, `submit` (`data-flash`), `stage`, `status`, `beats`.

The transcript is a `column-reverse` scroller around a column, so the newest line stays in view without JavaScript and a reader who scrolled up is left alone. It is focusable so keyboard users can scroll it. Its height is `--sf-demo-height` (default `20rem`).

#### Without JavaScript

- Server and first client render: `finalState(finalPolicy)`, the whole transcript, with no controls and no composer text. Entrance and typing animation only applies under `[data-sf-animating]`, which is set after hydration.
- Reduced motion (media query or a `motion` source that says reduce): the same final transcript, no controls, no animation.
- `StaticTranscript` is the fully server-safe option; `AgentDemo` also renders on the server because it reads no browser state during render.
- Screen readers get one `role="status"` message ("Example agent session.", then "Demo complete.") rather than a live region on moving content.

## script

```ts
import { validateScript, isLibraryError, LibraryError } from "@steamfield/ui/script";
import type { DemoScript, Step, StepKind, ToolBody, Line, Tone, At, ToolStatus } from "@steamfield/ui/script";
```

Types and a runtime validator for scripts that arrive as JSON. The shapes:

| Step `kind` | Fields |
| --- | --- |
| `user` | `text`; `preTyped` (a prefix of `text` already in the composer); `composer` (type into the composer) |
| `agent-text` | `text`; `lead` (bold lead-in) |
| `thinking` | `ms` (optional) |
| `pause` | `ms` |
| `prompt` | `text`: the shell prompt prefix for the commands after it, such as `"~/demo $"` |
| `command` | `text` |
| `output` | `lines: Line[]`; `more` (count of left-out lines) |
| `tool-call` | `name`; `id`, `server`, `args`, `status`, `meta`, `output: Line[]`, `outputAt`, `more`, `body` |

Every step also takes `at` (a click index for click-paced playback; a step without one reveals with the step before). A `Line` is a string or `{ text, tone? }` where `tone` is `"default" | "ok" | "fail" | "warn" | "muted"`. `status` is `"running" | "done" | "error" | "retried"` or any string. A tool `body` is one of `{ kind: "lines", lines, more? }`, `{ kind: "code", code, lang?, collapsed? }`, `{ kind: "steps", steps }`, `{ kind: "error", summary }` or `{ kind: "custom", data }` (rendered by your `renderToolBody`), each with an optional `at`. `DemoScript<TData>` is `{ id?, steps }`; `TData` types custom bodies.

### `validateScript(script, options?)`

Asserts the shape at runtime and narrows to `DemoScript`. Throws `LibraryError` naming the first bad field, such as `steps[3].text`. A duplicate tool-call `id`, a `preTyped` that is not a prefix of `text`, and a negative or non-integer `at` are `invalid_script`.

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `kinds` | `StepKind[]` | all kinds | The step kinds the caller can render. Another kind is `unsupported_step` |

### Without JavaScript

Pure data and functions with no DOM access; safe on the server and in workers.

## sequencer

```ts
import {
  compile, stateAt, finalState, clickCount, transcriptText, presets,
} from "@steamfield/ui/sequencer";
```

Lays a script out in time and answers "what is on screen at this position". All of it is pure: the same script, options and seed give the same result, so server, first client render, tests and screenshots agree.

### `compile(script, options?)`

Validates and returns a frozen `Timeline` (`script`, `steps` with `key`/`index`/`start`/`end`/`at`, `duration`, `clickCount`, `turnStarts`, `turnEnds`).

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `timing` | `Partial<Timing>` | the `chat` preset | Fields to change; an unknown key is `invalid_option` |
| `seed` | `string` | the script's `id`, then `""` | Seeds the jitter |
| `composer` | `boolean` | `false` | Whether user steps without their own `composer` flag type into the composer |

### `Timing` and `presets`

`presets.chat`, `presets.terminal` and `presets.instant` fill every field. `compile` starts from `chat`. A `Span` is a number of ms or a `[min, max]` range sampled from the seeded generator.

| Field | Type | Meaning |
| --- | --- | --- |
| `startDelay` | `Span` | Before the first step |
| `typeMsPerChar` | `number \| (step) => number` | Per typed character of user and command steps |
| `jitter` | `number` | ± ms per typed character |
| `preTypedHoldMs` | `Span` | How long `preTyped` text sits before typing resumes |
| `submitHoldMs` | `Span` | After typing, before submit |
| `flashMs` | `number` | Submit flash length |
| `thinkingAfterUser` | `Span \| false` | Thinking after a user step when another non-thinking step follows |
| `thinkingMs` | `Span` | A `thinking` step without its own `ms` |
| `streamUnit` | `"char" \| "word" \| "line"` | What agent text streams by |
| `streamLeadMs` | `number` | Before the first streamed unit |
| `wordMs` | `Span` | After each streamed unit |
| `punctuationMs` | `Span` | After a unit ending in `. ! ? , ; :` |
| `readMs` | `Span` | After agent text finishes |
| `lineMs` | `number` | Per output line (and per streamed line) |
| `revealCapMs` | `number` | Cap on revealing one block of lines |
| `toolMs` | `(step) => number` | How long a tool call runs |
| `gapMs` | `Span` | After a tool call, command or output |

| Preset | Matches | Notes |
| --- | --- | --- |
| `chat` | the OpenData chat demo | 400–800ms start, 25ms per character with ±9ms jitter, word streaming, flat 1000ms tool time |
| `terminal` | rr's terminal player | 28ms per character capped per step, 900ms per tool call, no jitter |
| `instant` | reduced motion and snapshots | every phase 0ms |

### `stateAt(timeline, position)`

`position` is `{ ms }` (clamped to `[0, duration]`) or `{ click }` (shows every step whose `at` is at or below it). Returns a `DemoView`:

| Field | Meaning |
| --- | --- |
| `entries` | Visible steps in script order. Each has `key` (the step `id` or index; use it as the render key), `index`, `step`, `phase`, `progress` (0 to 1), and, when relevant, `visibleText`, `visibleLines`, `status`, `bodyVisible`, `more` (present once done) |
| `composer` | `{ text, flash }`, or `null` when no user step uses it |
| `current` | Index of the latest started step, or `-1` |
| `complete`, `elapsed`, `duration` | In click mode `elapsed` is `0` until complete |
| `turnStarts`, `turnEnds` | Turn boundaries in ms |

`phase` is one of `typing`, `submitted`, `thinking`, `revealing`, `holding`, `running`, `done`.

### `finalState(timeline, options?)`

The finished view, for SSR, no-JS and reduced motion. `options.policy`: `"all"` (default, equals `stateAt` at `duration`), `"last"` (the last agent text and the last tool call), or a function from the steps to the indices to keep.

### `clickCount(script)` and `transcriptText(script)`

`clickCount` is the highest `at` on any step, body or output. `transcriptText` is the finished script as plain text for `<noscript>`, screen-reader summaries and `llms.txt`: user messages start with `> `, commands with their prompt (or `$`), tool calls read `name(args)` with indented output, and a `more` count reads `… +N lines`. Thinking, pauses and custom bodies have no text.

### Without JavaScript

Pure functions, no DOM. `finalState` and `transcriptText` are the server-side answers.

## playback

```ts
import { createPlaybackGate } from "@steamfield/ui/playback";
import type { GateState, PlaybackGate, PlaybackGateOptions } from "@steamfield/ui/playback";
```

A play/pause gate for an on-page demo. It plays only while the element is in view, the tab is visible, motion is allowed and the user has not paused, and its optional clock keeps demo time across every pause.

```ts
const gate = createPlaybackGate(element, { duration: 8000, onFrame: (ms) => draw(ms) });
gate.subscribe(() => console.log(gate.getState().playing));
// later
gate.destroy();
```

Create it in the browser (an effect), never during server rendering. With a `null` element, or without `IntersectionObserver`, the demo counts as in view.

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `autoStart` | `boolean` | `true` | Start when in view. When false, wait for `play()` |
| `threshold` | `number` | `0.15` | In-view threshold |
| `rootMargin` | `string` | `"0px"` | In-view root margin |
| `leaveGraceMs` | `number` | `0` | How long out of view before pausing. Coming back inside resumes at once |
| `motion` | `"auto" \| "reduce" \| "full" \| { get, subscribe }` | `"auto"` | `"auto"` follows `prefers-reduced-motion` live. A source's `get()` returns true while motion is allowed |
| `reducedPolicy` | `"end" \| "hold"` | `"end"` | When motion is not allowed: jump to the end, or hold where it is |
| `duration` | `number` | `Infinity` | Total demo time in ms; `complete` turns true at it |
| `speed` | `number` | `1` | Clock rate, greater than 0 |
| `onFrame` | `(elapsed) => void` | none | Called when `elapsed` changes |

Setting `duration` or `onFrame` runs the `requestAnimationFrame` clock while playing; one frame advances at most 100ms, so a throttled tab never jumps ahead.

Methods: `play`, `pause`, `toggle`, `replay` (back to 0 and playing), `seek(ms)`, `reset` (back to 0, unpaused, started only if `autoStart`), `setSpeed(n)`, `destroy`, `getState`, `subscribe(callback)` (returns an unsubscribe).

`GateState`: `started`, `inView`, `tabVisible`, `paused`, `reduced`, `complete`, `playing` (`started && inView && tabVisible && !paused && !reduced && !complete`), `elapsed`.

### Without JavaScript

Nothing renders. The gate is behavior only; the component using it decides what the server shows. With `reducedPolicy: "end"`, reduced motion reports `complete` and puts `elapsed` at `duration`.

## react/playback

```ts
import { usePlayback, useCountUp } from "@steamfield/ui/react/playback";
```

### `usePlayback(options?)`

React state over the gate. Options are `PlaybackGateOptions`. Changing `duration`, `motion` or an observer option starts a fresh gate at 0; `speed` and `onFrame` change in place. Keep a custom `motion` source stable.

Returns `ref` (attach to the gating element), `elapsed`, `playing`, `paused`, `reduced`, `complete`, `ready`, and `play`, `pause`, `toggle`, `replay`, `seek`, `reset`. SSR-safe: every flag starts false and `ready` flips in an effect, so render the final frame while `ready` is false and show controls only once it is true.

### `useCountUp(end, options?)`

Counts from 0 to `end` once, while the element is in view and the tab is visible.

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `duration` | `number` | `2000` | Length of the count in ms |
| `enabled` | `boolean` | `true` | False holds at 0 until something else says go |
| `easing` | `(progress) => number` | ease-out cubic | Maps progress 0..1 to 0..1 |
| `motion` | `"auto" \| "reduce" \| "full" \| MotionSource` | `"auto"` | Under reduced motion the value is `end` straight away |
| `threshold`, `rootMargin` | | `0.15`, `"0px"` | In-view options |

Returns `{ ref, value, complete }`. Intermediate values are floored; the last is exactly `end`.

### Without JavaScript

The server and first client render return `end`, so markup without JavaScript shows the real number. Reduced motion shows `end` too.

## react/window

```ts
import "@steamfield/ui/window/styles.css";
import { DemoWindow } from "@steamfield/ui/react/window";
```

Optional window chrome: dots, a title and a controls slot over a body. It renders no heading; supply one outside the window.

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `title` | `ReactNode` | none | Text in the title bar |
| `dots` | `boolean` | `true` | Three decorative dots |
| `controls` | `ReactNode` | none | Right-aligned title-bar content |
| `label` | `string` | none | Names the window, which then renders as a `<section>` region. Without it, a plain `<div>` |
| `className`, `style`, `children` | | | |

Variables: `--sf-window-dot` (all three dots), `--sf-window-dot-1`, `-2`, `-3` (one each, for traffic lights), plus the base tokens. `data-part` values: `window`, `window-bar`, `window-dots`, `window-dot`, `window-title`, `window-controls`, `window-body`.

### Without JavaScript

Renders identically on the server; it has no state.

## copy

```ts
import "@steamfield/ui/copy/styles.css";
import { copyText, enhanceCopyButtons } from "@steamfield/ui/copy";
import type { CopyEventDetail, CopyMessages, EnhanceCopyOptions } from "@steamfield/ui/copy";
```

`copyText(text)` copies to the clipboard and resolves to whether it worked. It tries the async Clipboard API, then a hidden textarea with `execCommand("copy")`. It never throws; without a clipboard or DOM it resolves `false`.

`enhanceCopyButtons(root, options?)` activates every `[data-copy-command]` button under `root` and returns a function that removes the listeners and timers. Markup contract:

```html
<span data-copy-root>
  <button type="button" hidden data-copy-command aria-controls="cmd" aria-label="Copy command">
    <span data-copy-label>Copy</span>
  </button>
  <span data-copy-result role="status" aria-live="polite"></span>
</span>
<code id="cmd">bun add @steamfield/ui</code>
```

The button names its source with `aria-controls` and stays `hidden` until the target exists. On success the label switches to `copiedLabel` and the result region announces `copied`. On failure the text is selected (opening any enclosing `<details>`) for a manual copy and the region shows the failure message.

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `copiedMs` | `number` | `2000` | How long the copied label stays |
| `subjects` | `Record<string, string>` | `Copy command` → command, `Copy prompt` → prompt, `Copy code` → code, `Copy page` → page | Maps a button's `aria-label` to the noun in failure messages. Unknown labels use "text" |
| `messages.copied` | `string` | `"Copied to clipboard."` | Announced on success |
| `messages.copiedLabel` | `string` | `"Copied"` | Visible label on the button while it shows success |
| `messages.failed` | `(subject, { hidden }) => string` | built-in English | Failure text; `hidden` is true when the target is not on screen |
| `onCopy` | `(detail) => void` | none | Called after every attempt with `{ id, label, ok }` |

Each attempt also dispatches a bubbling `sf:copy` CustomEvent from the button with the same detail.

Hooks: `data-part` values `copy-command` (`data-prose`), `prompt`, `command`, `copy`, `copy-button` (`data-state="copied|failed"`), `copy-icon`, `copy-result` (`data-state`). The stylesheet hides the result region visually unless the state is `failed`. No variables beyond the base tokens.

### Without JavaScript

The text is in the HTML and the button is `hidden`, so there is no dead control. `copyText` returns `false` on the server. Reduced motion has no effect; there is no animation.

## react/copy

```ts
import { CopyCommand, CopyButton, useCopy } from "@steamfield/ui/react/copy";
```

`CopyCommand` and `CopyButton` render the markup above for server rendering; call `enhanceCopyButtons(document)` once on the client to wire them. No hydration is needed.

### `<CopyCommand>`

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `id` | `string` | required | Unique id of the command text; the button points at it |
| `command` | `string` | required | The text |
| `prose` | `boolean` | `false` | Render as wrapping prose (a prompt) instead of a one-line `<code>` |
| `prompt` | `string \| null` | `"$"` | Glyph before a command. `null` for none. Not shown when `prose` |
| `label` | `string` | `"Copy command"`, or `"Copy prompt"` when `prose` | The button's accessible name |
| `buttonText` | `ReactNode` | `"Copy"` | Visible idle text |
| `icon` | `ReactNode` | none | Rendered before the label, hidden from assistive tech |
| `className` | `string` | none | On the wrapper |

### `<CopyButton>`

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `controls` | `string` | required | `id` of the element whose text is copied |
| `label` | `string` | `"Copy"` | Accessible name; also picks the noun in failure messages |
| `children` | `ReactNode` | `"Copy"` | Visible idle text |
| `icon` | `ReactNode` | none | |
| `className` | `string` | none | On the button |

### `useCopy(options?)`

Clipboard state for your own control. Options: `resetMs` (`2000`, how long `copied` stays true), `onCopy(ok)`. Returns `{ copied, failed, copy(text) }`, where `copy` resolves to whether it worked.

### Without JavaScript

The command is readable text and the button renders `hidden`, with a polite live region beside it. Nothing appears broken without JavaScript.

## tabs

```ts
import "@steamfield/ui/tabs/styles.css";
import { createTabs } from "@steamfield/ui/tabs";
import type { CreateTabsOptions, TabsActivation, TabsChangeDetail, TabsHash, TabsOrientation } from "@steamfield/ui/tabs";
```

`createTabs(root, options?)` turns server-rendered markup into ARIA tabs and returns a function that removes the listeners. The markup is a `[role="tablist"]` of `[role="tab"]` elements, each naming its panel with `aria-controls` or `href="#panel-id"`:

```html
<div data-part="tabs">
  <div role="tablist" data-part="tab-list" aria-label="Install with">
    <a role="tab" data-part="tab" href="#npm" data-value="npm">npm</a>
    <a role="tab" data-part="tab" href="#bun" data-value="bun">bun</a>
  </div>
  <div id="npm" role="tabpanel" data-part="tab-panel">npm i @steamfield/ui</div>
  <div id="bun" role="tabpanel" data-part="tab-panel">bun add @steamfield/ui</div>
</div>
```

On setup the root gets `data-live`, which turns off the CSS fallback. The controller then owns `aria-selected`, the roving `tabindex`, `data-state` (`active|inactive`) and each panel's `hidden`. A tab's value is its `data-value`, or its panel id. The initial tab is the one with `aria-selected="true"`, else the first enabled tab. Without a `[role="tablist"]` it does nothing.

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `activation` | `"auto" \| "manual"` | `"auto"` | `"manual"` only moves focus on arrow keys; Enter, Space or a click selects |
| `orientation` | `"horizontal" \| "vertical"` | the tablist's `aria-orientation`, else horizontal | Which arrow keys move between tabs. Home and End always work; arrows wrap |
| `hash` | `boolean \| "replace"` | `false` | `true` reads `location.hash` on setup and on `hashchange` and records selections with `pushState`; `"replace"` records with `replaceState` |
| `onValueChange` | `(value) => void` | none | Called when the selection changes after setup: click, key or hash |
| `eventName` | `string` | none | Dispatch a bubbling CustomEvent of this name from `root` when the reader picks a tab (not for a hash read), with detail `{ value }` |

Disabled tabs (`disabled` or `aria-disabled="true"`) are skipped.

Hooks: `data-part` values `tabs` (`data-live`, `data-orientation` from React), `tab-list`, `tab` (`data-value`, `data-state`), `tab-panel` (`data-state`). The stylesheet uses `--sf-fg`, `--sf-muted`, `--sf-accent`.

### Without JavaScript

With anchor tabs and `tabs/styles.css`, the first panel shows, or the panel the URL fragment targets (`:target`), so every panel is reachable by deep link. Panels are in the HTML. Put `display` styles on an element inside a panel, because the fallback hides panels with `display: none` and a `display` utility on the panel would defeat it (utilities beat `@layer sf`). Reduced motion has no effect.

## react/tabs

```ts
import { Tabs, TabList, Tab, TabPanel } from "@steamfield/ui/react/tabs";
```

```tsx
<Tabs id="cmd" hash="replace">
  <TabList aria-label="Commands">
    <Tab value="npm">npm</Tab>
    <Tab value="bun">bun</Tab>
  </TabList>
  <TabPanel value="npm">npm i @steamfield/ui</TabPanel>
  <TabPanel value="bun">bun add @steamfield/ui</TabPanel>
</Tabs>
```

Panels get the id `${id}-${value}` and tabs `${id}-${value}-tab`, so values must be valid in an id.

### `<Tabs>`

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `value` | `string` | none | Selected value (controlled) |
| `defaultValue` | `string` | the first tab | Initially selected value (uncontrolled) |
| `onValueChange` | `(value) => void` | none | Click, key or hash read |
| `activation` | `"auto" \| "manual"` | `"auto"` | As in `createTabs` |
| `orientation` | `"horizontal" \| "vertical"` | `"horizontal"` | |
| `keepMounted` | `boolean` | `true` | Keep every panel's content rendered (hidden) after hydration and in server HTML. False renders only the selected panel (on the server: the `defaultValue` panel, or all panels when there is no default) |
| `asAnchors` | `boolean` | `true` | Render tabs as `<a href="#panel-id">` so they are deep links without JS. False renders buttons |
| `hash` | `boolean \| "replace"` | `false` | As in `createTabs` |
| `eventName` | `string` | none | As in `createTabs` |
| `id` | `string` | from `useId` | Id prefix; pass a stable one for deep links |
| `className`, `children` | | | |

`TabList` takes `aria-label`, `aria-labelledby`, `className`. `Tab` takes `value` (required), `disabled`, `className`. `TabPanel` takes `value` (required), `className`.

### Without JavaScript

The server HTML has every panel and no `aria-selected`; tabs are links. After hydration `data-live` is set and the component applies ARIA, the roving tabindex and `hidden`. Outside `<Tabs>` the parts render their static markup instead of throwing.

## react/install-tabs

```ts
import "@steamfield/ui/tabs/styles.css";
import "@steamfield/ui/copy/styles.css";
import "@steamfield/ui/react/install-tabs/styles.css";
import { InstallTabs } from "@steamfield/ui/react/install-tabs";
```

```tsx
<InstallTabs
  options={[
    { id: "bun", label: "bun", command: "bun add @steamfield/ui" },
    { id: "npm", label: "npm", command: "npm i @steamfield/ui", note: "Node 22 or later." },
  ]}
/>
```

Install commands in tabs, one per package manager, each with a copy button. It returns `null` for an empty `options`.

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `options` | `InstallOption[]` | required | `{ id, label, command, note? }`. `id` must be id-safe: it is the tab value and part of the panel id |
| `onCopy` | `(id, ok) => void` | none | After every copy attempt |
| `labels` | `InstallTabsLabels` | see below | Overrides |
| `resetMs` | `number` | `2000` | How long the copied state lasts |
| `defaultValue` | `string` | the first option | Initially selected id |
| `onValueChange` | `(id) => void` | none | Tab changes |
| `activation` | `"auto" \| "manual"` | `"auto"` | |
| `hash` | `boolean \| "replace"` | `false` | |
| `eventName` | `string` | none | |
| `id` | `string` | from `useId` | Id prefix |
| `className` | `string` | none | |

Labels: `tabList` "Install with", `prompt` `$` (`""` for none), `copy` "Copy", `copied` "Copied", `copiedMessage` "Copied to clipboard.", `failed` "Copy failed. Select the command and copy it manually."

`data-part` values: `install-tabs`, `install-command`, `install-note`, plus the tabs parts, `command`, `prompt`, `copy-button` (`data-state`) and `copy-result` (`data-state`). Variables: the base tokens.

### Without JavaScript

Every command is in the HTML and reachable through the tab links. Copy buttons render `hidden` until hydration, so there is no dead control. The first panel shows, or the one the URL fragment targets.

## reveal

```ts
import "@steamfield/ui/reveal/styles.css";
import { initReveal, motionTokens } from "@steamfield/ui/reveal";
```

One-shot scroll entrances. `initReveal(options?)` sets `data-motion-ready="true"` on `<html>` (the CSS gate) and flips `data-revealed="true"` on each `[data-reveal]` container the first time it enters the viewport or takes keyboard focus. It returns a disposer that disconnects everything and removes the gate, which leaves all content visible. Call it from a script in `<head>` (it waits for the DOM) or after the DOM is parsed.

```html
<section data-reveal>
  <h2 data-motion="lift-lg">Heading</h2>
  <ul>
    <li data-motion-part>One</li>
    <li data-motion-part>Two</li>
  </ul>
</section>
```

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `rootMargin` | `string` | `"0px 0px -12% 0px"` | IntersectionObserver root margin |
| `threshold` | `number` | `0` | IntersectionObserver threshold |
| `immediate` | `(el) => boolean` | none | Reveal this container at once: a deep-link target, an above-the-fold section |
| `motionAllowed` | `() => boolean` | the media query does not ask for reduced motion | Checked at setup and whenever `prefers-reduced-motion` changes. If it turns false later, the gate is removed |
| `deferred` | `(el) => boolean` | inside `[data-reveal-defer]` and not inside `[data-reveal-hydrated]` | A late-hydrating container that is skipped until `readyEvent` fires from inside it |
| `readyEvent` | `string` | `"sf:reveal-ready"` | Bubbling event a hydrated island dispatches to be observed |

Markup attributes: `data-reveal` on a container (`"quiet"` for the quiet entrance), `data-motion="<role>"` on an element inside it or on the container itself, `data-motion-part` on rows that follow each other in, `data-revealed` (set by the script; any value works), `data-reveal-defer` and `data-reveal-hydrated` for islands.

Roles: unnamed default, `quiet`, `card`, `drop`, `popover`, `wipe`, `lift-xs`, `lift-sm`, `lift-md`, `lift-lg`, `lift-xl`, `lift-card`, `blur-in-soft`, `scale-in-media`, `slide-in-chip`, and the older `fade-up`, `blur-in`, `bounce-in`, `slide-left`, `slide-right`.

Variables (unset by default, so each role keeps its own timing; set one on an element or ancestor to override every role below it): `--sf-reveal-duration`, `--sf-reveal-ease`, `--sf-reveal-delay`, `--sf-reveal-step` (stagger between `data-motion-part` rows, default 70ms, capped at six steps), `--sf-reveal-lift` (distance traveled), `--sf-reveal-scale` (start scale for roles that scale).

`motionTokens` is plain data for JavaScript animation code that wants the same numbers: `easings`, `durations` (seconds), `springs`, `animationTypes` (initial and animate keyframes by role) and `motionRoles` (easing and duration per role). The CSS roles use their own millisecond timings, which run a little shorter.

### Without JavaScript

Static HTML is always visible. Start states apply only under `html[data-motion-ready]` and `prefers-reduced-motion: no-preference`, and `initReveal` is what sets the attribute. Under reduced motion, or with `[data-sf-motion="reduce"]` on an ancestor, every element is shown with no transition. Keyboard focus inside a container is never hidden behind an entrance, and `[data-reveal-defer]` content stays visible until it hydrates. Without `IntersectionObserver`, `initReveal` does nothing and every section stays visible.

## markdown

```ts
import "@steamfield/ui/markdown/styles.css";
import { createHastPlugins, createShikiConfig } from "@steamfield/ui/markdown";
```

Sätteri hast plugins for docs Markdown, built as factories because Sätteri calls each once per document, so counters and slugs restart on every page. They are written for Astro's Markdown pipeline (the code-block plugin looks for Shiki's `astro-code` class).

```ts
const processor = await createSatteriMarkdownProcessor({
  syntaxHighlight: "shiki",
  shikiConfig: createShikiConfig(),
  hastPlugins: createHastPlugins({ callouts: { titles: { WARNING: "Heads up" } } }),
});
```

`createShikiConfig()` returns `{ theme: "css-variables", transformers: [codeMeta()] }`. Token colors come from `--astro-code-*` variables, which your site maps to its own tokens. The transformer carries a fence's `title="…"` and `group="…"` onto the `<pre>`.

`createHastPlugins(options?)` returns the factories for `codeBlocks`, `codeGroups`, `callouts`, `headingAnchors` and `tables`. Each is also exported on its own (with `parseFenceMeta` and `codeMeta`), taking the same options:

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `codeBlocks.copyLabel` | `string` | `"Copy code"` | The copy button's accessible name |
| `codeBlocks.copyText` | `string` | `"Copy"` | The button's visible text |
| `codeBlocks.idPrefix` | `string` | `"code"` | Prefix for generated `<pre>` ids (`code-1`, `code-2`, …) |
| `callouts.titles` | `Partial<Record<CalloutKind, string>>` | English: Note, Tip, Warning, Important, Caution | Visible titles by marker (`NOTE`, `TIP`, `WARNING`, `IMPORTANT`, `CAUTION`) |
| `headingAnchors.label` | `(heading) => string` | `"Link to section: <text>"` | Accessible name of a heading's link |
| `tables.regionLabel` | `string` | `"Scrollable table"` | Accessible name of the scroll region around each table |

What they emit:

- `codeBlocks`: each highlighted block becomes `<figure data-code-block>` with an optional `<figcaption data-code-title>` from the fence title, and a copy button that `enhanceCopyButtons` from `copy` activates (`[data-code-copy]`, `[data-copy-command]`, `[data-copy-result]`).
- `codeGroups`: adjacent figures sharing a `group` get `data-group-position="first|middle|last"` so CSS can join them into one frame.
- `callouts`: GitHub alert blockquotes (`> [!NOTE]`) get `role="note"`, `data-callout="note"` and a leading `<p data-callout-title>`. An unknown marker stays a blockquote.
- `headingAnchors`: `h2` and `h3` get an id and a trailing `<a data-heading-anchor>`.
- `tables`: each table is wrapped in `<div data-table-scroll role="region" tabindex="0">` and `th` cells get `scope="col"`.

`markdown/styles.css` supplies structure only: the visually hidden copy result, relative positioning and horizontal scroll for code, the table scroll region (focus outline uses `--sf-focus`), and the heading anchor (hidden until hover or focus, `#` glyph). Callout, code title and code group looks are yours to style on the `data-*` attributes above.

### Without JavaScript

These run at build time, so the output is static HTML. Code copy buttons are `hidden` until `enhanceCopyButtons` runs; tables, callouts, headings and code are fully readable without it. The anchor transition is skipped under reduced motion.

## docs

```ts
import { createDocs, docPath, spyToc } from "@steamfield/ui/docs";
import type { DocsConfig, DocEntry } from "@steamfield/ui/docs";
```

Pure docs rules: navigation, URLs and the agent-readable exports (`llms.txt`, `llms-full.txt` and one Markdown file per page). Nothing touches Astro: your route files pass in the entries from your own `getCollection`.

```ts
const docs = createDocs({
  name: "Acme",
  summary: "Acme runs your jobs.",
  groups: ["Start", "Reference"],
  trailingSlash: "never",
  optionalLinks: [],
});
// in a route file
new Response(docs.llmsIndex(await getCollection("docs"), String(site)));
```

`DocsConfig`:

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `name` | `string` | required | The product name; the `llms.txt` title |
| `summary` | `string` | required | One-paragraph description under the title |
| `groups` | `string[]` | required | Group names in reading order. A page whose `group` is not listed is left out of the nav |
| `trailingSlash` | `"always" \| "never"` | required | Must match the site's Astro `trailingSlash` setting |
| `optionalLinks` | `{ label, href, description }[]` | required | Extra links for the "Optional" section; omitted from the file when empty |
| `rewriteLink` | `(href, { site, markdownPath }) => string` | `absoluteLinks` | Rewrites each Markdown link target in an exported page body. Links in code fences are not passed in |
| `exampleId` | `string` | the first page in the nav | The page id `llms.txt` uses in its `.md` example |
| `featured` | `(entry) => boolean` | `entry.data.featured` | Which pages are cards on the docs home |

A `DocEntry` is `{ id, data: { title, description, group, order, sidebarLabel?, featured? }, body? }`, where `id` `"index"` is the docs home and `body` is the Markdown source without frontmatter.

`createDocs(config)` returns methods bound to the config: `docPath(id)`, `markdownPath(id)`, `docsNav(entries)`, `pageLinks(entries, id)` (group, previous, next), `featuredDocs(entries)`, `pageMarkdown(entry, entries, site)`, `llmsIndex(entries, site)`, `llmsFull(entries, site)` and `config`. The same functions are exported unbound, taking `config` first, along with `absoluteLinks` (the default `rewriteLink`: site-relative links become absolute, and docs links point at that page's `.md`). Page URLs are `/docs` or `/docs/<id>` (with a slash when `trailingSlash` is `"always"`); Markdown exports are `/docs/<id>.md` whatever the policy.

### `spyToc(root, options?)`

Marks the "On this page" link for the section being read with `aria-current="location"`, and returns a function that stops observing. Each link needs `href="#<heading id>"`.

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `linkSelector` | `string` | `"[data-toc-link]"` | Selector for the table-of-contents links |
| `current` | `string` | `"location"` | The `aria-current` value |
| `rootMargin` | `string` | `"0px 0px -70% 0px"` | A heading counts as read once it passes the top 30% of the viewport |

### Without JavaScript

`createDocs` and the helpers are pure and run on the server, which is where route files use them. `spyToc` is the only browser part; without it (or without `IntersectionObserver`) the TOC links still work and none is marked. There is no stylesheet and no animation.

## vue/agent-demo

The Vue binding (`vue/agent-demo`: a `useAgentDemo` composable and an `AgentDemo` component over the same `script`, `sequencer`, `playback` and `agent-demo/styles.css` cores) is in progress. It is not in the package `exports` yet, and this section will describe it when it lands.

## Errors

The package throws one error on purpose, `LibraryError`, from `@steamfield/ui/script`. `error.code` is a `LibraryErrorCode` and `error.field` names the argument or option at fault, never its value. Anything else escaping a call is a bug.

| Code | When |
| --- | --- |
| `invalid_script` | A script is malformed: not an object, `steps` not an array, a missing or wrongly typed field (`field` is a path such as `steps[3].text`), a duplicate tool-call `id`, a `preTyped` that is not a prefix of `text` |
| `unsupported_step` | A step or tool-body `kind` that is unknown, or outside the `kinds` list passed to `validateScript` |
| `invalid_option` | An option has a bad value or an unknown key (`field` names it, such as `timing.gapMs`), or a position or policy is invalid |

```ts
import { isLibraryError } from "@steamfield/ui/script";

try {
  validateScript(json);
} catch (error) {
  if (isLibraryError(error)) console.error(error.code, error.field);
  else throw error;
}
```

Use `isLibraryError(error)` rather than `instanceof` when an app may have two copies of the package installed. Adding a code is a minor release; renaming or removing one is breaking.

## Versioning

The package is on 0.x: a minor version is a breaking change, and a patch is anything else. Pin `~0.x` (for example `"@steamfield/ui": "~0.3.0"`). Exports, props, options, `--sf-*` variables and `data-part` values are public API. Every change to them adds a changeset (`bunx changeset`); see [.changeset/README.md](.changeset/README.md).

## Development

Requirements: Bun at the version in `packageManager` (`bun@1.4.2`) and Node at the version in `.node-version` (`26.13.0`). `engines.node` is `>=22`.

```sh
bun install
```

| Script | What it does |
| --- | --- |
| `bun run build` | Build `dist/` with tsdown |
| `bun run typecheck` | `tsc` for the package, the tooling and the playground |
| `bun run lint` | `biome check .` |
| `bun run lint:package` | publint (strict) and Are the Types Wrong over the packed package |
| `bun run format` | `biome check --write .` |
| `bun run test` | `vitest run` |
| `bun run test:watch` | Vitest in watch mode |
| `bun run test:consumer` | Pack the package, install the tarball into a temporary copy of `tests/consumer/`, typecheck it and run it with Node |
| `bun run coverage` | `vitest run --coverage` |
| `bun run check` | The full gate: lint, typecheck, coverage, lint:package, test:consumer |
| `bun run clean` | Remove `dist`, `coverage` and tarballs |
| `bun run playground` | Vite dev server for the playground in `playground/` |
| `bun run playground:build` | Build the playground |
| `bun run playground:preview` | Serve the built playground |
| `bun run test:a11y` | Playwright browser and axe checks against the built playground |
| `bun run size` | `size-limit` budgets for each built subpath (`.size-limit.json`) |
| `bun run test:tree-shake` | Build the apps in `fixtures/tree-shake/` against `dist/` and check that unused siblings stay out of the bundle |

Run a single test file:

```sh
bun run test src/copy/enhance.test.ts
```

`prepack` builds `dist/` and `prepare` installs the git hooks (skipped when `CI` is set). Run `bun run build` before `size`, `test:tree-shake` and `lint:package`.

## Releasing

The package stays `"private": true` until the maintainer decides to publish. Releases are cut with Changesets: `bunx changeset version` bumps the version and writes the changelog from the pending changesets, and the maintainer then runs the publish themselves. Nothing is automated.
