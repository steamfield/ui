import { defaultGlyphs, defaultLabels } from "../../agent-demo/core.js";
import { compile } from "../../sequencer/compile.js";
import { finalState } from "../../sequencer/view.js";
import { transcript } from "./parts.js";
import { defineComponent, h } from "vue";
// src/vue/agent-demo/static-transcript.ts
/**
* The finished transcript with no playback, controls or composer, in the same parts and CSS as
* `AgentDemo`. It reads no browser state, so it renders on the server and in print or PDF export.
*/
const StaticTranscript = defineComponent((props, { slots }) => () => {
	const layout = props.layout ?? "chat";
	const view = finalState(compile(props.script), { policy: props.finalPolicy ?? "all" });
	return h("div", {
		"data-sf-agent-demo": "",
		"data-part": "agent-demo",
		"data-layout": layout,
		"data-static": "",
		...props.privacyClassName ? { class: props.privacyClassName } : {}
	}, [transcript(view, {
		layout,
		labels: {
			...defaultLabels,
			...props.labels
		},
		glyphs: {
			...defaultGlyphs,
			...props.glyphs
		},
		tools: props.tools,
		toolCall: slots.toolCall,
		toolBody: slots.toolBody,
		mode: "static",
		steps: props.script.steps,
		collapsible: props.collapsible === true,
		transcript: props.transcript
	})]);
}, {
	name: "SfStaticTranscript",
	props: {
		script: {
			type: Object,
			required: true
		},
		layout: null,
		finalPolicy: null,
		labels: null,
		glyphs: null,
		tools: null,
		collapsible: {
			type: Boolean,
			default: void 0
		},
		transcript: null,
		privacyClassName: null
	},
	slots: Object
});
export { StaticTranscript };
