import { defaultGlyphs, defaultLabels, lastBeat as lastBeat$1 } from "../../agent-demo/core.js";
import { DemoWindow } from "../window/demo-window.js";
import { Composer, Transcript, srOnly } from "./parts.js";
import { useAgentDemo } from "./use-agent-demo.js";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
// src/react/agent-demo/agent-demo.tsx
function PlaybackControls({ demo, labels, full }) {
	const { controls, complete, started, paused, animating, timeline, speed, turn } = demo;
	const elapsed = animating ? demo.view.elapsed : 0;
	const atEnd = complete || animating && demo.view.complete;
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
	return /* @__PURE__ */ jsxs("div", {
		"data-part": "controls",
		children: [
			turns ? /* @__PURE__ */ jsxs("fieldset", {
				"data-part": "turn-jumps",
				children: [/* @__PURE__ */ jsx("legend", {
					style: srOnly,
					children: labels.jumpToTurn
				}), turnStarts.map((start, i) => /* @__PURE__ */ jsx("button", {
					type: "button",
					"data-part": "control",
					"data-control": "turn",
					"aria-current": turn === i ? "step" : void 0,
					onClick: () => {
						controls.seek(start);
						controls.play();
					},
					children: i + 1
				}, i))]
			}) : null,
			/* @__PURE__ */ jsx("button", {
				type: "button",
				"data-part": "control",
				"data-control": "play",
				onClick: atEnd ? controls.replay : controls.toggle,
				children: label
			}),
			turns ? /* @__PURE__ */ jsx("button", {
				type: "button",
				"data-part": "control",
				"data-control": "next",
				disabled: atEnd,
				onClick: next,
				children: labels.next
			}) : null,
			full ? /* @__PURE__ */ jsxs("button", {
				type: "button",
				"data-part": "control",
				"data-control": "speed",
				"aria-label": `${labels.speed} ${speed}x`,
				onClick: () => controls.setSpeed(speed === 1 ? 2 : 1),
				children: [speed, "x"]
			}) : null
		]
	});
}
function lastBeat(demo, config) {
	if (!demo.animating) return "";
	return lastBeat$1(demo.view.entries, config);
}
function controlsFor(props, demo, labels) {
	const { controls = "inline" } = props;
	if (!demo.ready || demo.reduced || props.position !== void 0 || controls === "none") return null;
	if (typeof controls === "function") return controls(demo);
	return /* @__PURE__ */ jsx(PlaybackControls, {
		demo,
		labels,
		full: controls === "full"
	});
}
function Frame({ chrome, header, controls, children }) {
	if (chrome) {
		const { title, dots, className } = typeof chrome === "object" ? chrome : {};
		return /* @__PURE__ */ jsxs(DemoWindow, {
			...title === void 0 ? {} : { title },
			...dots === void 0 ? {} : { dots },
			...className === void 0 ? {} : { className },
			controls,
			children: [header !== void 0 ? /* @__PURE__ */ jsx("div", {
				"data-part": "header",
				children: header
			}) : null, children]
		});
	}
	return /* @__PURE__ */ jsxs(Fragment, { children: [header !== void 0 || controls ? /* @__PURE__ */ jsxs("div", {
		"data-part": "header",
		children: [header, controls]
	}) : null, children] });
}
/**
* The default agent demo renderer: one set of parts (messages, tool cards, output, thinking,
* composer, header, status and controls) in a "chat" or "terminal" layout. The server and
* pre-hydration render are the final transcript; entrance and typing CSS only apply under
* `[data-sf-animating]`, which is set once hydrated and playing.
*/
function AgentDemo(props) {
	const { layout = "chat", stage, announce = "status", className, privacyClassName } = props;
	const composer = props.composer ?? layout === "chat";
	const demo = useAgentDemo(props.script, {
		...props,
		composer
	});
	const labels = {
		...defaultLabels,
		...props.labels
	};
	const glyphs = {
		...defaultGlyphs,
		...props.glyphs
	};
	const config = {
		layout,
		labels,
		glyphs,
		tools: props.tools,
		renderToolCall: props.renderToolCall,
		renderToolBody: props.renderToolBody,
		mode: demo.mode,
		steps: demo.timeline.script.steps,
		collapsible: props.collapsible === true,
		transcript: props.transcript
	};
	const { view } = demo;
	return /* @__PURE__ */ jsxs("div", {
		ref: demo.ref,
		"data-sf-agent-demo": "",
		"data-part": "agent-demo",
		"data-layout": layout,
		"data-sf-animating": demo.animating ? "" : void 0,
		"data-paused": demo.animating && !demo.playing ? "" : void 0,
		"data-complete": demo.complete ? "" : void 0,
		className: [className, privacyClassName].filter(Boolean).join(" ") || void 0,
		style: props.style,
		children: [
			/* @__PURE__ */ jsxs(Frame, {
				chrome: props.chrome,
				header: props.header,
				controls: controlsFor(props, demo, labels),
				children: [/* @__PURE__ */ jsx(Transcript, {
					view,
					config
				}), view.composer ? /* @__PURE__ */ jsx(Composer, {
					text: view.composer.text,
					flash: view.composer.flash,
					layout,
					labels,
					glyphs,
					start: props.composerStart,
					submitIcon: props.submitIcon
				}) : null]
			}),
			stage ? /* @__PURE__ */ jsx("div", {
				"data-part": "stage",
				children: stage(view)
			}) : null,
			announce === "none" ? null : /* @__PURE__ */ jsx("p", {
				"data-part": "status",
				role: "status",
				style: srOnly,
				children: demo.complete ? labels.completeStatus : labels.idleStatus
			}),
			announce === "beats" ? /* @__PURE__ */ jsx("div", {
				"data-part": "beats",
				"aria-live": "polite",
				style: srOnly,
				children: lastBeat(demo, config)
			}) : null
		]
	});
}
export { AgentDemo };
