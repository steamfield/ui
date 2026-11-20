import { createDemoController } from "../../agent-demo/controller.js";
import { playbackRef } from "../playback/use-playback.js";
import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
// src/react/agent-demo/use-agent-demo.ts
/**
* The headless agent demo: compiles a script, gates playback on visibility, tab and motion, and
* returns the view to render with its controls. The server and pre-hydration render are
* `finalState(finalPolicy)` (the view at 0ms with `beforeStart: "start"`), and reduced motion is
* always `finalState(finalPolicy)`; `position` pins the view for click-paced decks.
*/
function useAgentDemo(script, options = {}) {
	const [controller] = useState(() => createDemoController(script, options));
	const [ref] = useState(() => playbackRef(controller.attach));
	useLayoutEffect(() => {
		controller.update(script, options);
	});
	useEffect(() => {
		controller.mount();
		return controller.destroy;
	}, [controller]);
	return {
		...useSyncExternalStore(controller.subscribe, controller.getState, controller.getState),
		ref
	};
}
export { useAgentDemo };
