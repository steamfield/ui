import { promptFor, spinnerFrame, toolHidden, toolName, transcriptElement, workingText } from "../../agent-demo/core.js";
import { Comment, Fragment, Text, defineComponent, h, isVNode, onBeforeUnmount, onMounted, onUpdated, ref, watch } from "vue";
// src/vue/agent-demo/parts.ts
/** Visually hidden, still read. Inline so it holds without the stylesheet. */
const srOnly = {
	position: "absolute",
	width: "1px",
	height: "1px",
	margin: "-1px",
	padding: "0",
	overflow: "hidden",
	clipPath: "inset(50%)",
	whiteSpace: "nowrap",
	border: "0"
};
/** Whether slot output renders anything: not empty, not only comments or empty text. */
function hasContent(nodes) {
	if (!nodes) return false;
	return nodes.some((node) => {
		if (node.type === Comment) return false;
		if (node.type === Text) return node.children !== "";
		if (node.type === Fragment) return hasContent(node.children);
		return true;
	});
}
const caret = () => h("span", {
	"data-part": "caret",
	"aria-hidden": "true"
});
const glyph = (text) => h("span", {
	"data-part": "glyph",
	"aria-hidden": "true"
}, text);
function lines(items) {
	return items.map((line, i) => {
		const text = typeof line === "string" ? line : line.text;
		const tone = typeof line === "string" ? void 0 : line.tone;
		return h("div", {
			key: i,
			"data-part": "line",
			"data-tone": tone && tone !== "default" ? tone : void 0
		}, text || " ");
	});
}
function more(count, labels) {
	if (count === void 0) return null;
	return h("div", { "data-part": "more" }, labels.more(count));
}
/** The thinking dots, named for assistive tech. */
function thinking(label) {
	const dot = () => h("span", { "data-part": "thinking-dot" });
	return h("div", {
		"data-part": "thinking",
		role: "img",
		"aria-label": label
	}, [
		dot(),
		dot(),
		dot()
	]);
}
function message(entry, step, config) {
	const user = step.kind === "user";
	const { labels, glyphs, layout } = config;
	const moving = entry.phase === "typing" || entry.phase === "revealing";
	const lead = step.kind === "agent-text" && step.lead ? [h("strong", { "data-part": "lead" }, step.lead), " "] : [];
	return h("div", {
		"data-part": "message",
		"data-from": user ? "user" : "agent",
		"data-phase": entry.phase
	}, [layout === "terminal" ? glyph(user ? glyphs.user : glyphs.agent) : null, h("p", { "data-part": "text" }, [
		h("span", { style: srOnly }, `${user ? labels.you : labels.agent}: `),
		...lead,
		entry.visibleText ?? step.text,
		moving ? caret() : null
	])]);
}
/** Shows the skeleton over still-mounted content while loading, then fades it out (350ms). */
const Crossfade = defineComponent((props, { slots }) => {
	const skeleton = ref(props.loading);
	let timer;
	const clear = () => {
		if (timer !== void 0) clearTimeout(timer);
		timer = void 0;
	};
	watch(() => props.loading, (loading) => {
		clear();
		if (loading) skeleton.value = true;
		else timer = setTimeout(() => skeleton.value = false, 350);
	});
	onBeforeUnmount(clear);
	return () => h("div", {
		"data-part": "tool-body",
		"data-loading": props.loading ? "" : void 0
	}, [h("div", {
		"data-part": "tool-content",
		style: props.loading ? { visibility: "hidden" } : void 0
	}, slots.default?.()), skeleton.value ? h("div", {
		"data-part": "skeleton",
		"data-state": props.loading ? "loading" : "leaving",
		"aria-hidden": "true"
	}, [
		0,
		1,
		2
	].map((i) => h("span", {
		key: i,
		"data-part": "skeleton-bar"
	}))) : null]);
}, {
	name: "SfToolCrossfade",
	props: { loading: {
		type: Boolean,
		required: true
	} }
});
function builtInBody(body, labels) {
	switch (body.kind) {
		case "lines": return h("div", { "data-part": "output" }, [...lines(body.lines), more(body.more, labels)]);
		case "code": {
			const code = h("pre", {
				"data-part": "code",
				"data-lang": body.lang
			}, [h("code", null, body.code)]);
			if (!body.collapsed) return code;
			return h("details", { "data-part": "code-collapse" }, [h("summary", null, labels.showCode), code]);
		}
		case "steps": return h("ol", { "data-part": "steps" }, body.steps.map((item, i) => h("li", {
			key: i,
			"data-part": "step"
		}, item)));
		case "error": return h("p", { "data-part": "error" }, body.summary);
		default: return null;
	}
}
function statusPip(running, failed, config, frame) {
	const { labels, glyphs, layout } = config;
	let label = labels.done;
	let mark = layout === "terminal" ? glyphs.agent : glyphs.ok;
	if (running) {
		label = labels.running;
		mark = layout === "terminal" ? frame : "";
	} else if (failed) {
		label = labels.failed;
		mark = layout === "terminal" ? glyphs.agent : glyphs.fail;
	}
	return h("span", {
		"data-part": "tool-status",
		role: "img",
		"aria-label": label
	}, mark);
}
function icon(value) {
	if (typeof value === "string" || isVNode(value)) return value;
	return h(value);
}
/** The terminal header's `server name`, as parts a stylesheet can tell apart. */
function terminalToolName(step, config) {
	const name = h("span", { "data-part": "tool-name" }, step.name);
	if (!step.server) return [name];
	return [
		h("span", { "data-part": "tool-server" }, step.server),
		config.glyphs.serverSeparator,
		name
	];
}
function toolHeader(ctx, config, frame) {
	const { step, entry } = ctx;
	const terminal = config.layout === "terminal";
	const running = entry.status === "running";
	const iconValue = terminal ? void 0 : config.tools?.[step.name]?.icon;
	const name = terminal ? terminalToolName(step, config) : toolName(config.tools, step, config.layout, running);
	return h(config.collapsible ? "summary" : "div", { "data-part": "tool-header" }, [
		statusPip(running, entry.status === "error", config, frame),
		iconValue ? h("span", {
			"data-part": "tool-icon",
			"aria-hidden": "true"
		}, [icon(iconValue)]) : null,
		h("span", { "data-part": "tool-label" }, name),
		step.args !== void 0 ? h("span", { "data-part": "tool-args" }, terminal ? [
			h("span", { "data-part": "tool-paren" }, "("),
			step.args,
			h("span", { "data-part": "tool-paren" }, ")")
		] : step.args) : null,
		step.meta ? h("span", { "data-part": "tool-meta" }, step.meta) : null
	]);
}
function toolBodyContent(ctx, config, body) {
	const custom = config.toolBody?.(ctx);
	if (hasContent(custom)) return custom;
	return builtInBody(body, config.labels);
}
/**
* Output and body under the header. The terminal shows them once the call resolves, behind the
* output glyph; the chat card keeps them mounted under a skeleton that crossfades away.
*/
function toolSection(ctx, config) {
	const { step, entry, loading } = ctx;
	const working = workingText(config.labels, config.layout, entry.status === "running");
	if (working) return h("div", { "data-part": "tool-body" }, [glyph(config.glyphs.output), h("div", { "data-part": "tool-working" }, working)]);
	if (step.output === void 0 && step.body === void 0) return null;
	const terminal = config.layout === "terminal";
	const shown = terminal ? entry.visibleLines ?? [] : step.output ?? [];
	const content = () => [step.output ? h("div", { "data-part": "output" }, [...lines(shown), more(entry.more, config.labels)]) : null, step.body && (entry.bodyVisible || !terminal) ? toolBodyContent(ctx, config, step.body) : null];
	if (!terminal) return h(Crossfade, { loading }, { default: content });
	if (entry.status === "running") return null;
	return h("div", { "data-part": "tool-body" }, [glyph(config.glyphs.output), h("div", { "data-part": "tool-content" }, content())]);
}
function toolCard(ctx, config, frame) {
	const { step, entry } = ctx;
	const accent = config.tools?.[step.name]?.accent;
	return h(config.collapsible ? "details" : "div", {
		"data-part": "tool-call",
		"data-status": entry.status ?? step.status ?? "done",
		"data-phase": entry.phase,
		"data-tool": step.name,
		...accent ? { style: { "--sf-tool-accent": accent } } : {},
		...config.collapsible ? { open: true } : {}
	}, [toolHeader(ctx, config, frame), toolSection(ctx, config)]);
}
function toolCall(entry, config, frame) {
	const step = entry.step;
	if (toolHidden(config.tools, step.name)) return null;
	const loading = entry.status === "running" || step.body !== void 0 && !entry.bodyVisible;
	const ctx = {
		step,
		entry,
		index: entry.index,
		loading,
		mode: config.mode
	};
	const replaced = config.toolCall?.(ctx);
	if (hasContent(replaced)) return replaced;
	return toolCard(ctx, config, frame);
}
function entryNodes(entry, config, frame) {
	const { step } = entry;
	switch (step.kind) {
		case "user": return [message(entry, step, config), entry.phase === "thinking" ? thinking(config.labels.thinking) : null];
		case "agent-text": return message(entry, step, config);
		case "command": return h("div", {
			"data-part": "command",
			"data-phase": entry.phase
		}, [glyph(promptFor(config.steps, entry.index, config.glyphs.prompt)), h("span", { "data-part": "text" }, [entry.visibleText ?? step.text, entry.phase === "typing" ? caret() : null])]);
		case "output": return h("div", {
			"data-part": "output",
			"data-phase": entry.phase
		}, [...lines(entry.visibleLines ?? step.lines), more(entry.more, config.labels)]);
		case "tool-call": return toolCall(entry, config, frame);
		case "thinking": return entry.phase === "thinking" ? thinking(config.labels.thinking) : null;
		default: return null;
	}
}
/**
* The scrollable transcript: an outer `column-reverse` scroller around an inner `column`, so it
* anchors to the bottom without JS, leaves a reader who scrolled up alone, and keeps DOM order
* equal to visual order. Focusable by default so keyboard users can scroll it. A named group by
* default rather than a landmark, so two demos on one page don't repeat a region; `transcript`
* picks a `<section>` region or drops the tab stop.
*/
function transcript(view, config) {
	const frame = spinnerFrame(config.glyphs.spinner, view.elapsed);
	const { tag, role, tabIndex } = transcriptElement(config.transcript);
	return h(tag, {
		"data-part": "transcript",
		role,
		tabindex: tabIndex,
		"aria-label": config.labels.transcript
	}, [h("div", { "data-part": "turns" }, view.entries.map((entry) => h(Fragment, { key: entry.key }, [entryNodes(entry, config, frame)])))]);
}
/**
* The inert composer: an optional start slot, typed text with a caret, else the placeholder, and
* the submit key.
*/
const Composer = defineComponent((props) => {
	const track = ref(null);
	const follow = () => {
		const el = track.value;
		if (el && props.text) el.scrollLeft = el.scrollWidth;
	};
	onMounted(follow);
	onUpdated(follow);
	return () => h("div", {
		"data-part": "composer",
		"data-flash": props.flash ? "" : void 0,
		"aria-hidden": "true"
	}, [
		props.layout === "terminal" ? glyph(props.glyphs.user) : null,
		hasContent(props.start) ? h("span", {
			"data-part": "composer-start",
			"aria-hidden": "true"
		}, props.start) : null,
		h("span", {
			"data-part": "composer-text",
			ref: track
		}, props.text ? [props.text, caret()] : [h("span", { "data-part": "placeholder" }, props.labels.placeholder)]),
		h("span", {
			"data-part": "submit",
			"data-flash": props.flash ? "" : void 0
		}, hasContent(props.submitIcon) ? props.submitIcon : props.glyphs.submit)
	]);
}, {
	name: "SfDemoComposer",
	props: {
		text: {
			type: String,
			required: true
		},
		flash: {
			type: Boolean,
			required: true
		},
		layout: {
			type: String,
			required: true
		},
		labels: {
			type: Object,
			required: true
		},
		glyphs: {
			type: Object,
			required: true
		},
		start: {
			type: Array,
			default: void 0
		},
		submitIcon: {
			type: Array,
			default: void 0
		}
	}
});
export { Composer, hasContent, srOnly, thinking, transcript };
