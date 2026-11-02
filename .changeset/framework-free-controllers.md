---
"@steamfield/ui": patch
---

Move each stateful component's logic into one framework-free controller that the React and Vue bindings adapt: the agent demo (timeline, playback clock, step starts, end detection, controls), the playback gate's element binding, tabs selection and copy state. Public exports, props and markup are unchanged. Two visible fixes come with it: a React `Tabs` `defaultValue` naming a disabled or unknown tab now falls back to the first enabled tab after hydration, as `createTabs` already did; and markdown code-block copy wrappers now also carry `data-copy-root`, the same marker `CopyButton` uses.
