---
"@steamfield/ui": minor
---

Breaking (0.x, so a minor):

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
