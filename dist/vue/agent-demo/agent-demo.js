import { defaultGlyphs, defaultLabels, lastBeat } from "../../agent-demo/core.js";
import { Composer, hasContent, srOnly, transcript } from "./parts.js";
import { useAgentDemo } from "./use-agent-demo.js";
import { defineComponent, h } from "vue";
// src/vue/agent-demo/agent-demo.ts
function playbackControls(state, labels, full) {
	const { controls, complete, started, paused, animating, timeline, speed, turn } = state;
	const elapsed = animating ? state.view.elapsed : 0;
	const atEnd = complete || animating && state.view.complete;
	let label = labels.pause;
	if (atEnd) label = labels.replay;
	else if (!started || paused) label = labels.play;
	const { turnStarts, duration } = timeline;
	const turns = full && turnStarts.length > 1;
	const next = () => {
		const target = turnStarts.find((start) => start > elapsed) ?? duration;
		controls.seek(target);
		if (target < duration) controls.play();
	};
	return h("div", { "data-part": "controls" }, [
		turns ? h("fieldset", { "data-part": "turn-jumps" }, [h("legend", { style: srOnly }, labels.jumpToTurn), ...turnStarts.map((start, i) => h("button", {
			key: i,
			type: "button",
			"data-part": "control",
			"data-control": "turn",
			"aria-current": turn === i ? "step" : void 0,
			onClick: () => {
				controls.seek(start);
				controls.play();
			}
		}, String(i + 1)))]) : null,
		h("button", {
			type: "button",
			"data-part": "control",
			"data-control": "play",
			onClick: atEnd ? controls.replay : controls.toggle
		}, label),
		turns ? h("button", {
			type: "button",
			"data-part": "control",
			"data-control": "next",
			disabled: atEnd,
			onClick: next
		}, labels.next) : null,
		full ? h("button", {
			type: "button",
			"data-part": "control",
			"data-control": "speed",
			"aria-label": `${labels.speed} ${speed}x`,
			onClick: () => controls.setSpeed(speed === 1 ? 2 : 1)
		}, `${speed}x`) : null
	]);
}
/** The window chrome, in the same parts as React's `DemoWindow`. */
function windowFrame(chrome, controls, body) {
	const { title, dots = true, className } = typeof chrome === "object" ? chrome : {};
	return h("div", {
		"data-part": "window",
		...className ? { class: className } : {}
	}, [h("div", { "data-part": "window-bar" }, [
		dots ? h("span", {
			"data-part": "window-dots",
			"aria-hidden": "true"
		}, [
			h("span", { "data-part": "window-dot" }),
			h("span", { "data-part": "window-dot" }),
			h("span", { "data-part": "window-dot" })
		]) : null,
		title !== void 0 ? h("span", { "data-part": "window-title" }, title) : null,
		controls ? h("div", { "data-part": "window-controls" }, [controls]) : null
	]), h("div", { "data-part": "window-body" }, body)]);
}
const PROPS = {
	script: {
		type: Object,
		required: true
	},
	layout: null,
	labels: null,
	glyphs: null,
	tools: null,
	controls: null,
	header: null,
	chrome: {
		type: [Boolean, Object],
		default: void 0
	},
	collapsible: {
		type: Boolean,
		default: void 0
	},
	transcript: null,
	announce: null,
	privacyClassName: null,
	position: null,
	active: {
		type: Boolean,
		default: void 0
	},
	scriptKey: null,
	timing: null,
	seed: null,
	composer: {
		type: Boolean,
		default: void 0
	},
	finalPolicy: null,
	beforeStart: null,
	autoStart: {
		type: Boolean,
		default: void 0
	},
	threshold: null,
	rootMargin: null,
	leaveGraceMs: null,
	motion: null,
	reducedPolicy: null,
	speed: null,
	onStepStart: null,
	onComplete: null
};
function slotState(demo) {
	return {
		view: demo.view.value,
		controls: demo.controls,
		started: demo.started.value,
		playing: demo.playing.value,
		paused: demo.paused.value,
		complete: demo.complete.value,
		animating: demo.animating.value,
		speed: demo.speed.value,
		turn: demo.turn.value,
		timeline: demo.timeline.value
	};
}
function controlsFor(props, slots, demo, labels) {
	const mode = props.controls ?? "inline";
	if (!demo.ready.value || demo.reduced.value || demo.clickMode.value || mode === "none") return null;
	const state = slotState(demo);
	return slots.controls ? slots.controls(state) : playbackControls(state, labels, mode === "full");
}
/** The header, the controls and the transcript, in window chrome or a plain header bar. */
function frame(props, slots, controls, body) {
	const slotted = slots.header?.();
	const header = hasContent(slotted) ? slotted : props.header ?? null;
	if (props.chrome) {
		const inner = header === null ? null : h("div", { "data-part": "header" }, [header]);
		return [windowFrame(props.chrome, controls, [inner, ...body])];
	}
	return [header !== null || controls ? h("div", { "data-part": "header" }, [header, controls]) : null, ...body];
}
function announcements(announce, demo, config) {
	if (announce === "none") return [];
	const { labels } = config;
	const status = h("p", {
		"data-part": "status",
		role: "status",
		style: srOnly
	}, demo.complete.value ? labels.completeStatus : labels.idleStatus);
	if (announce !== "beats") return [status];
	const beat = demo.animating.value ? lastBeat(demo.view.value.entries, config) : "";
	return [status, h("div", {
		"data-part": "beats",
		"aria-live": "polite",
		style: srOnly
	}, beat)];
}
/**
* The default agent demo renderer for Vue, in the same parts and `data-*` markup as the React
* `AgentDemo`, so `agent-demo/styles.css` styles both. The server and pre-mount render are the
* final transcript; entrance and typing CSS only apply under `[data-sf-animating]`, which is set
* once mounted and playing (or following a click position).
*
* Slots: `toolCall` and `toolBody` get a `ToolCallContext`, `stage` gets `{ view }`, `header`
* takes markup and `controls` gets the state as plain values.
*/
const AgentDemo = defineComponent((props, { slots }) => {
	const layout = () => props.layout ?? "chat";
	const demo = useAgentDemo(() => props.script, () => ({
		...props,
		composer: props.composer ?? layout() === "chat"
	}));
	return () => {
		const view = demo.view.value;
		const labels = {
			...defaultLabels,
			...props.labels
		};
		const glyphs = {
			...defaultGlyphs,
			...props.glyphs
		};
		const config = {
			layout: layout(),
			labels,
			glyphs,
			tools: props.tools,
			toolCall: slots.toolCall,
			toolBody: slots.toolBody,
			mode: demo.mode.value,
			steps: demo.timeline.value.script.steps,
			collapsible: props.collapsible === true,
			transcript: props.transcript
		};
		const composer = view.composer ? h(Composer, {
			...view.composer,
			layout: layout(),
			labels,
			glyphs,
			start: slots.composerStart?.(),
			submitIcon: slots.submitIcon?.()
		}) : null;
		const body = [transcript(view, config), composer];
		const animating = demo.animating.value;
		return h("div", {
			key: demo.playCount.value,
			ref: demo.el,
			"data-sf-agent-demo": "",
			"data-part": "agent-demo",
			"data-layout": layout(),
			"data-sf-animating": animating ? "" : void 0,
			"data-paused": animating && !demo.playing.value ? "" : void 0,
			"data-complete": demo.complete.value ? "" : void 0,
			...props.privacyClassName ? { class: props.privacyClassName } : {}
		}, [
			...frame(props, slots, controlsFor(props, slots, demo, labels), body),
			slots.stage ? h("div", { "data-part": "stage" }, slots.stage({ view })) : null,
			...announcements(props.announce ?? "status", demo, config)
		]);
	};
}, {
	name: "SfAgentDemo",
	props: PROPS,
	slots: Object
});
export { AgentDemo };
