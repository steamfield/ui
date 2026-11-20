---
"@steamfield/ui": minor
---

Add `@steamfield/ui/human-gate`: a `before_send` filter that holds analytics events until the visitor gives a trusted pointer, key, wheel, touch or click input, so headless crawlers that pass the SDK's bot filter send nothing. Exports `humanGate` (the page's gate), `createHumanGate`, `HUMAN_SIGNALS`, `UNGATED_EVENTS` and their types. Visitors who leave without touching the page, including screen reader users reading in browse mode without activating a control, are no longer counted.
