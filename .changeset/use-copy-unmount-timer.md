---
"@steamfield/ui": patch
---

`useCopy` clears its pending reset timer when the component unmounts. Since 0.1.0 the 2-second `copied` reset kept running after unmount, so a remount (StrictMode, `<Activity>`) could briefly show a stale `copied` state.
