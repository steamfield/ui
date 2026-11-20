import { promptFor, spinnerFrame, toolHidden, toolName, transcriptElement, workingText } from "../../agent-demo/core.js";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { Fragment as Fragment$1, useEffect, useRef, useState } from "react";
// src/react/agent-demo/parts.tsx
/** `undefined`, `null` and `false` from a `ToolRenderer` all mean "use the built-in rendering". */
const fallsBack = (node) => node == null || node === false;
/** A slot that renders nothing (like Vue's empty slot), so the composer keeps its default. */
const emptySlot = (node) => fallsBack(node) || node === true || node === "" || Array.isArray(node) && node.length === 0;
/** Visually hidden, still read. Inline so it holds without the stylesheet. */
const srOnly = {
	position: "absolute",
	width: 1,
	height: 1,
	margin: -1,
	padding: 0,
	overflow: "hidden",
	clipPath: "inset(50%)",
	whiteSpace: "nowrap",
	border: 0
};
const Caret = () => /* @__PURE__ */ jsx("span", {
	"data-part": "caret",
	"aria-hidden": "true"
});
function Glyph({ children }) {
	return /* @__PURE__ */ jsx("span", {
		"data-part": "glyph",
		"aria-hidden": "true",
		children
	});
}
function Lines({ lines }) {
	return /* @__PURE__ */ jsx(Fragment, { children: lines.map((line, i) => {
		const text = typeof line === "string" ? line : line.text;
		const tone = typeof line === "string" ? void 0 : line.tone;
		return /* @__PURE__ */ jsx("div", {
			"data-part": "line",
			"data-tone": tone && tone !== "default" ? tone : void 0,
			children: text || " "
		}, i);
	}) });
}
function More({ count, labels }) {
	if (count === void 0) return null;
	return /* @__PURE__ */ jsx("div", {
		"data-part": "more",
		children: labels.more(count)
	});
}
/** The thinking dots, named for assistive tech. */
function Thinking({ label }) {
	return /* @__PURE__ */ jsxs("div", {
		"data-part": "thinking",
		role: "img",
		"aria-label": label,
		children: [
			/* @__PURE__ */ jsx("span", { "data-part": "thinking-dot" }),
			/* @__PURE__ */ jsx("span", { "data-part": "thinking-dot" }),
			/* @__PURE__ */ jsx("span", { "data-part": "thinking-dot" })
		]
	});
}
function Message({ entry, step, config }) {
	const user = step.kind === "user";
	const { labels, glyphs, layout } = config;
	const moving = entry.phase === "typing" || entry.phase === "revealing";
	return /* @__PURE__ */ jsxs("div", {
		"data-part": "message",
		"data-from": user ? "user" : "agent",
		"data-phase": entry.phase,
		children: [layout === "terminal" ? /* @__PURE__ */ jsx(Glyph, { children: user ? glyphs.user : glyphs.agent }) : null, /* @__PURE__ */ jsxs("p", {
			"data-part": "text",
			children: [
				/* @__PURE__ */ jsxs("span", {
					style: srOnly,
					children: [user ? labels.you : labels.agent, ": "]
				}),
				step.kind === "agent-text" && step.lead ? /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx("strong", {
					"data-part": "lead",
					children: step.lead
				}), " "] }) : null,
				entry.visibleText ?? step.text,
				moving ? /* @__PURE__ */ jsx(Caret, {}) : null
			]
		})]
	});
}
/** Shows the skeleton over still-mounted content while loading, then fades it out (350ms). */
function Crossfade({ loading, children }) {
	const [skeleton, setSkeleton] = useState(loading);
	useEffect(() => {
		if (loading) {
			setSkeleton(true);
			return;
		}
		const timer = setTimeout(() => setSkeleton(false), 350);
		return () => clearTimeout(timer);
	}, [loading]);
	return /* @__PURE__ */ jsxs("div", {
		"data-part": "tool-body",
		"data-loading": loading ? "" : void 0,
		children: [/* @__PURE__ */ jsx("div", {
			"data-part": "tool-content",
			style: loading ? { visibility: "hidden" } : void 0,
			children
		}), skeleton ? /* @__PURE__ */ jsxs("div", {
			"data-part": "skeleton",
			"data-state": loading ? "loading" : "leaving",
			"aria-hidden": "true",
			children: [
				/* @__PURE__ */ jsx("span", { "data-part": "skeleton-bar" }),
				/* @__PURE__ */ jsx("span", { "data-part": "skeleton-bar" }),
				/* @__PURE__ */ jsx("span", { "data-part": "skeleton-bar" })
			]
		}) : null]
	});
}
function BuiltInBody({ body, labels }) {
	switch (body.kind) {
		case "lines": return /* @__PURE__ */ jsxs("div", {
			"data-part": "output",
			children: [/* @__PURE__ */ jsx(Lines, { lines: body.lines }), /* @__PURE__ */ jsx(More, {
				count: body.more,
				labels
			})]
		});
		case "code": {
			const code = /* @__PURE__ */ jsx("pre", {
				"data-part": "code",
				"data-lang": body.lang,
				children: /* @__PURE__ */ jsx("code", { children: body.code })
			});
			if (!body.collapsed) return code;
			return /* @__PURE__ */ jsxs("details", {
				"data-part": "code-collapse",
				children: [/* @__PURE__ */ jsx("summary", { children: labels.showCode }), code]
			});
		}
		case "steps": return /* @__PURE__ */ jsx("ol", {
			"data-part": "steps",
			children: body.steps.map((item, i) => /* @__PURE__ */ jsx("li", {
				"data-part": "step",
				children: item
			}, i))
		});
		case "error": return /* @__PURE__ */ jsx("p", {
			"data-part": "error",
			children: body.summary
		});
		default: return null;
	}
}
function ToolStatusPip({ running, failed, config, frame }) {
	const { labels, glyphs, layout } = config;
	let label = labels.done;
	let glyph = layout === "terminal" ? glyphs.agent : glyphs.ok;
	if (running) {
		label = labels.running;
		glyph = layout === "terminal" ? frame : "";
	} else if (failed) {
		label = labels.failed;
		glyph = layout === "terminal" ? glyphs.agent : glyphs.fail;
	}
	return /* @__PURE__ */ jsx("span", {
		"data-part": "tool-status",
		role: "img",
		"aria-label": label,
		children: glyph
	});
}
function ToolHeader({ ctx, config, frame }) {
	const { step, entry } = ctx;
	const terminal = config.layout === "terminal";
	const running = entry.status === "running";
	const icon = terminal ? void 0 : config.tools?.[step.name]?.icon;
	const name = terminal ? /* @__PURE__ */ jsxs(Fragment, { children: [step.server ? /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx("span", {
		"data-part": "tool-server",
		children: step.server
	}), config.glyphs.serverSeparator] }) : null, /* @__PURE__ */ jsx("span", {
		"data-part": "tool-name",
		children: step.name
	})] }) : toolName(config.tools, step, config.layout, running);
	const Header = config.collapsible ? "summary" : "div";
	return /* @__PURE__ */ jsxs(Header, {
		"data-part": "tool-header",
		children: [
			/* @__PURE__ */ jsx(ToolStatusPip, {
				running,
				failed: entry.status === "error",
				config,
				frame
			}),
			icon ? /* @__PURE__ */ jsx("span", {
				"data-part": "tool-icon",
				"aria-hidden": "true",
				children: icon
			}) : null,
			/* @__PURE__ */ jsx("span", {
				"data-part": "tool-label",
				children: name
			}),
			step.args !== void 0 ? /* @__PURE__ */ jsx("span", {
				"data-part": "tool-args",
				children: terminal ? /* @__PURE__ */ jsxs(Fragment, { children: [
					/* @__PURE__ */ jsx("span", {
						"data-part": "tool-paren",
						children: "("
					}),
					step.args,
					/* @__PURE__ */ jsx("span", {
						"data-part": "tool-paren",
						children: ")"
					})
				] }) : step.args
			}) : null,
			step.meta ? /* @__PURE__ */ jsx("span", {
				"data-part": "tool-meta",
				children: step.meta
			}) : null
		]
	});
}
function ToolBodyContent({ ctx, config, body }) {
	const custom = config.renderToolBody?.(ctx);
	if (!fallsBack(custom)) return custom;
	return /* @__PURE__ */ jsx(BuiltInBody, {
		body,
		labels: config.labels
	});
}
/**
* Output and body under the header. The terminal shows them once the call resolves, behind the
* output glyph; the chat card keeps them mounted under a skeleton that crossfades away.
*/
function ToolSection({ ctx, config }) {
	const { step, entry, loading } = ctx;
	const working = workingText(config.labels, config.layout, entry.status === "running");
	if (working) return /* @__PURE__ */ jsxs("div", {
		"data-part": "tool-body",
		children: [/* @__PURE__ */ jsx(Glyph, { children: config.glyphs.output }), /* @__PURE__ */ jsx("div", {
			"data-part": "tool-working",
			children: working
		})]
	});
	if (step.output === void 0 && step.body === void 0) return null;
	const terminal = config.layout === "terminal";
	const lines = terminal ? entry.visibleLines ?? [] : step.output ?? [];
	const content = /* @__PURE__ */ jsxs(Fragment, { children: [step.output ? /* @__PURE__ */ jsxs("div", {
		"data-part": "output",
		children: [/* @__PURE__ */ jsx(Lines, { lines }), /* @__PURE__ */ jsx(More, {
			count: entry.more,
			labels: config.labels
		})]
	}) : null, step.body && (entry.bodyVisible || !terminal) ? /* @__PURE__ */ jsx(ToolBodyContent, {
		ctx,
		config,
		body: step.body
	}) : null] });
	if (!terminal) return /* @__PURE__ */ jsx(Crossfade, {
		loading,
		children: content
	});
	if (entry.status === "running") return null;
	return /* @__PURE__ */ jsxs("div", {
		"data-part": "tool-body",
		children: [/* @__PURE__ */ jsx(Glyph, { children: config.glyphs.output }), /* @__PURE__ */ jsx("div", {
			"data-part": "tool-content",
			children: content
		})]
	});
}
function ToolCard({ ctx, config, frame }) {
	const { step, entry } = ctx;
	const accent = config.tools?.[step.name]?.accent;
	const style = accent ? { "--sf-tool-accent": accent } : void 0;
	const Root = config.collapsible ? "details" : "div";
	return /* @__PURE__ */ jsxs(Root, {
		"data-part": "tool-call",
		"data-status": entry.status ?? step.status ?? "done",
		"data-phase": entry.phase,
		"data-tool": step.name,
		style,
		open: config.collapsible ? true : void 0,
		children: [/* @__PURE__ */ jsx(ToolHeader, {
			ctx,
			config,
			frame
		}), /* @__PURE__ */ jsx(ToolSection, {
			ctx,
			config
		})]
	});
}
function ToolCall({ entry, config, frame }) {
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
	const replaced = config.renderToolCall?.(ctx);
	if (!fallsBack(replaced)) return replaced;
	return /* @__PURE__ */ jsx(ToolCard, {
		ctx,
		config,
		frame
	});
}
function Entry({ entry, config, frame }) {
	const { step } = entry;
	switch (step.kind) {
		case "user": return /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx(Message, {
			entry,
			step,
			config
		}), entry.phase === "thinking" ? /* @__PURE__ */ jsx(Thinking, { label: config.labels.thinking }) : null] });
		case "agent-text": return /* @__PURE__ */ jsx(Message, {
			entry,
			step,
			config
		});
		case "command": return /* @__PURE__ */ jsxs("div", {
			"data-part": "command",
			"data-phase": entry.phase,
			children: [/* @__PURE__ */ jsx(Glyph, { children: promptFor(config.steps, entry.index, config.glyphs.prompt) }), /* @__PURE__ */ jsxs("span", {
				"data-part": "text",
				children: [entry.visibleText ?? step.text, entry.phase === "typing" ? /* @__PURE__ */ jsx(Caret, {}) : null]
			})]
		});
		case "output": return /* @__PURE__ */ jsxs("div", {
			"data-part": "output",
			"data-phase": entry.phase,
			children: [/* @__PURE__ */ jsx(Lines, { lines: entry.visibleLines ?? step.lines }), /* @__PURE__ */ jsx(More, {
				count: entry.more,
				labels: config.labels
			})]
		});
		case "tool-call": return /* @__PURE__ */ jsx(ToolCall, {
			entry,
			config,
			frame
		});
		case "thinking": return entry.phase === "thinking" ? /* @__PURE__ */ jsx(Thinking, { label: config.labels.thinking }) : null;
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
function Transcript({ view, config }) {
	const frame = spinnerFrame(config.glyphs.spinner, view.elapsed);
	const { tag: Root, role, tabIndex } = transcriptElement(config.transcript);
	return /* @__PURE__ */ jsx(Root, {
		"data-part": "transcript",
		role,
		tabIndex,
		"aria-label": config.labels.transcript,
		children: /* @__PURE__ */ jsx("div", {
			"data-part": "turns",
			children: view.entries.map((entry) => /* @__PURE__ */ jsx(Fragment$1, { children: /* @__PURE__ */ jsx(Entry, {
				entry,
				config,
				frame
			}) }, entry.key))
		})
	});
}
/**
* The inert composer: an optional start slot, typed text with a caret, else the placeholder, and
* the submit key.
*/
function Composer({ text, flash, layout, labels, glyphs, start, submitIcon }) {
	const track = useRef(null);
	useEffect(() => {
		const el = track.current;
		if (el && text) el.scrollLeft = el.scrollWidth;
	}, [text]);
	return /* @__PURE__ */ jsxs("div", {
		"data-part": "composer",
		"data-flash": flash ? "" : void 0,
		"aria-hidden": "true",
		children: [
			layout === "terminal" ? /* @__PURE__ */ jsx(Glyph, { children: glyphs.user }) : null,
			emptySlot(start) ? null : /* @__PURE__ */ jsx("span", {
				"data-part": "composer-start",
				"aria-hidden": "true",
				children: start
			}),
			/* @__PURE__ */ jsx("span", {
				"data-part": "composer-text",
				ref: track,
				children: text ? /* @__PURE__ */ jsxs(Fragment, { children: [text, /* @__PURE__ */ jsx(Caret, {})] }) : /* @__PURE__ */ jsx("span", {
					"data-part": "placeholder",
					children: labels.placeholder
				})
			}),
			/* @__PURE__ */ jsx("span", {
				"data-part": "submit",
				"data-flash": flash ? "" : void 0,
				children: emptySlot(submitIcon) ? glyphs.submit : submitIcon
			})
		]
	});
}
export { Composer, Thinking, Transcript, srOnly };
