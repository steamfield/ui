import { compile } from "../../sequencer/compile.js";
import { finalState } from "../../sequencer/view.js";
import { defaultGlyphs, defaultLabels } from "../../agent-demo/core.js";
import { Transcript } from "./parts.js";
import { jsx } from "react/jsx-runtime";
// src/react/agent-demo/static-transcript.tsx
/**
* The finished transcript with no playback, controls or composer, in the same parts and CSS as
* `AgentDemo`. It reads no browser state, so it renders on the server: place it outside an Astro
* `client:only` island as the no-JS fallback.
*/
function StaticTranscript({ script, layout = "chat", finalPolicy = "all", tools, renderToolCall, renderToolBody, collapsible = false, transcript, className, style, privacyClassName, ...props }) {
	const timeline = compile(script);
	const view = finalState(timeline, { policy: finalPolicy });
	const labels = {
		...defaultLabels,
		...props.labels
	};
	const glyphs = {
		...defaultGlyphs,
		...props.glyphs
	};
	return /* @__PURE__ */ jsx("div", {
		"data-sf-agent-demo": "",
		"data-part": "agent-demo",
		"data-layout": layout,
		"data-static": "",
		className: [className, privacyClassName].filter(Boolean).join(" ") || void 0,
		style,
		children: /* @__PURE__ */ jsx(Transcript, {
			view,
			config: {
				layout,
				labels,
				glyphs,
				tools,
				renderToolCall,
				renderToolBody,
				mode: "static",
				steps: script.steps,
				collapsible,
				transcript
			}
		})
	});
}
export { StaticTranscript };
