import { COPY_COMMAND, COPY_CONTROLS, COPY_LABEL, COPY_RESULT, COPY_ROOT } from "../../copy/markup.js";
import { jsx, jsxs } from "react/jsx-runtime";
// src/react/copy/copy-command.tsx
/**
* A copy button for server-rendered markup. It renders `hidden` with a sibling polite live region;
* `enhanceCopyButtons()` from `@steamfield/ui/copy` reveals and wires it on the client, so no
* hydration is needed and a page without JavaScript shows no dead button.
*/
function CopyButton({ controls, label = "Copy", children = "Copy", className, icon }) {
	return /* @__PURE__ */ jsxs("span", {
		[COPY_ROOT]: "",
		"data-part": "copy",
		children: [/* @__PURE__ */ jsxs("button", {
			type: "button",
			hidden: true,
			[COPY_COMMAND]: "",
			"data-part": "copy-button",
			[COPY_CONTROLS]: controls,
			"aria-label": label,
			className,
			children: [icon ? /* @__PURE__ */ jsx("span", {
				"aria-hidden": "true",
				"data-part": "copy-icon",
				children: icon
			}) : null, /* @__PURE__ */ jsx("span", {
				[COPY_LABEL]: "",
				children
			})]
		}), /* @__PURE__ */ jsx("span", {
			[COPY_RESULT]: "",
			"data-part": "copy-result",
			role: "status",
			"aria-live": "polite"
		})]
	});
}
/** A command (or prompt) the reader can copy. The text stays in the DOM, readable without JS. */
function CopyCommand({ id, command, prose = false, prompt = "$", label = prose ? "Copy prompt" : "Copy command", buttonText, className, buttonClassName, promptClassName, commandClassName, icon }) {
	return /* @__PURE__ */ jsxs("div", {
		className,
		"data-part": "copy-command",
		"data-prose": prose ? "" : void 0,
		children: [
			prompt && !prose ? /* @__PURE__ */ jsxs("span", {
				"aria-hidden": "true",
				"data-part": "prompt",
				className: promptClassName,
				style: { userSelect: "none" },
				children: [prompt, " "]
			}) : null,
			/* @__PURE__ */ jsx(prose ? "div" : "code", {
				id,
				"data-part": "command",
				className: commandClassName,
				children: command
			}),
			/* @__PURE__ */ jsx(CopyButton, {
				controls: id,
				label,
				icon,
				className: buttonClassName,
				children: buttonText ?? "Copy"
			})
		]
	});
}
export { CopyButton, CopyCommand };
