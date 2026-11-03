---
"@steamfield/ui": patch
---

Agent demo extension points, all opt-in, in both the React and Vue bindings:

- `labels.working` (no default): under a running tool call in the terminal layout, shows the output glyph and this text in a new `tool-working` part, which pulses while animating. Unset, a running call still shows nothing under its header. The chat layout ignores it.
- The terminal tool header's args now render as `tool-args` holding a `tool-paren` span on each side of the args text, so a stylesheet can color the parens apart. The visible text is unchanged; this is the one default markup change.
- `collapsible` on `AgentDemo` and `StaticTranscript` (default false): each built-in tool card renders as `<details open>` with its header as the `<summary>`, so a reader can hide a call's output, with or without JavaScript.
- `transcript` on `AgentDemo` and `StaticTranscript` (new type `AgentDemoTranscript`, `{ as?: "group" | "region"; focusable?: boolean }`): `"region"` renders the transcript as a labelled `<section>` landmark, and `focusable: false` drops its tab stop. The default stays a focusable `role="group"`.
- `chrome.className`: a class for the window root, to size or shadow the built-in window.

The working line's pulse moves between the muted and foreground colors rather than fading, so it keeps AA contrast in every frame.

Copy fixes:

- `useCopy`'s `resetMs` takes `false`: `copied` then stays until the next copy attempt. A `resetMs` that isn't `false` or 0 to 2^31 - 1 (negative, NaN, Infinity, or past `setTimeout`'s limit, all of which used to reset at once) now throws `LibraryError` `invalid_option` on `resetMs` during render. `enhanceCopyButtons` checks `copiedMs` the same way, naming `copiedMs`.
- `copy/styles.css` hides the result region visually (until a failure shows it) when it carries only the `data-copy-result` hook the enhancer reads, not just `data-part="copy-result"`. Markup with only the hook used to show "Copied to clipboard." on screen.
