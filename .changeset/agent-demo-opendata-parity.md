---
"@steamfield/ui": patch
---

Agent demo options so OpenData's landing chat demo can run on `AgentDemo` unchanged, all opt-in, in the React and Vue bindings:

- `beforeStart: "start"` (new type `BeforeStart`, default `"final"`): before playback starts (the server, the pre-hydration render, and with `autoStart: false` until `play()`), render the view at 0ms instead of the final transcript, so a demo that begins from nothing doesn't flash its finished state on load. Reduced motion still shows the `finalPolicy` view.
- `leaveGraceMs: Infinity` keeps a demo playing off screen once it has been seen, like a one-shot observer; a hidden tab still pauses. It used to pause at once, since `setTimeout` treats `Infinity` as 0.
- `typingMs` on `user` and `command` steps spreads the typing after `preTyped` over that many ms. A numeric `typeMsPerChar` gives way to it; a `typeMsPerChar` function receives the step and still decides.
- `finalPolicy` takes `{ pick, order?: "script" | "listed" }` (new type `FinalPick` in `sequencer`): `"listed"` shows the picked steps in the order `pick` returns them, such as an answer above the chart it explains. A plain function still shows its picks in script order.
- `composerStart` and `submitIcon` props (Vue: slots of the same names) put nodes in the composer: a new `composer-start` part before the typed text, hidden from assistive tech, and the submit key's content in place of `glyphs.submit`.
