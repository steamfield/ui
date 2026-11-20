import { COPY_COMMAND, COPY_CONTROLS, COPY_LABEL, COPY_READY } from "./markup.js";
import { DEFAULT_COPY_MESSAGES } from "./messages.js";
import { checkResetMs, createCopyState } from "./state.js";
// src/copy/enhance.ts
const DEFAULT_SUBJECTS = {
	"Copy command": "command",
	"Copy prompt": "prompt",
	"Copy code": "code",
	"Copy page": "page"
};
const defaultFailed = (subject, { hidden }) => hidden ? `Copy failed. Open the ${subject} and copy it manually.` : `Copy failed. The ${subject} is selected; press Cmd+C or Ctrl+C.`;
const IDLE_LABEL = "sfCopyIdle";
/**
* Activates every `[data-copy-command]` button under `root`. Each button names its source with
* `aria-controls` and stays `hidden` until a target exists, so a page without JavaScript shows the
* text with no dead button. A sibling `[data-copy-result]` live region announces the outcome, and
* on failure the text is selected (opening any enclosing `<details>`) for a manual copy.
*
* Each wired button gets `data-copy-ready`. A later call skips buttons that already have it, so
* it wires only new buttons and its options don't apply to the old ones; to re-wire a button with
* new options, call the first disposer, then call again.
*
* Returns a function that removes the listeners and pending timers, and hides the buttons it
* wired again (removing `data-copy-ready`), since a button with no listener would be dead.
*/
function enhanceCopyButtons(root, options = {}) {
	const config = {
		copiedMs: checkResetMs(options.copiedMs ?? 2e3, "copiedMs"),
		subjects: {
			...DEFAULT_SUBJECTS,
			...options.subjects
		},
		copied: options.messages?.copied ?? DEFAULT_COPY_MESSAGES.copied,
		copiedLabel: options.messages?.copiedLabel ?? DEFAULT_COPY_MESSAGES.copiedLabel,
		failed: options.messages?.failed ?? defaultFailed,
		onCopy: options.onCopy
	};
	const cleanups = [];
	const wired = [];
	for (const button of root.querySelectorAll(`[${COPY_COMMAND}]`)) {
		if (!targetOf(button) || button.hasAttribute("data-copy-ready")) continue;
		button.dataset[IDLE_LABEL] ??= labelOf(button)?.textContent ?? "";
		setLabel(button, button.dataset[IDLE_LABEL] ?? "");
		button.hidden = false;
		button.setAttribute(COPY_READY, "");
		wired.push(button);
		cleanups.push(wire(button, config));
	}
	return () => {
		for (const cleanup of cleanups) cleanup();
		for (const button of wired) {
			button.hidden = true;
			button.removeAttribute(COPY_READY);
		}
	};
}
/** Gives `button` its own copy state, reflects it on the DOM, and returns the cleanup. */
function wire(button, config) {
	const state = createCopyState({ resetMs: config.copiedMs });
	let attempt;
	state.subscribe(() => {
		const status = state.getState();
		const result = resultOf(button);
		if (status === "idle" || !attempt) {
			setLabel(button, button.dataset[IDLE_LABEL] ?? "");
			show(button, result, void 0, "");
			return;
		}
		if (status === "copied") {
			show(button, result, "copied", config.copied);
			setLabel(button, config.copiedLabel);
		} else {
			setLabel(button, button.dataset[IDLE_LABEL] ?? "");
			const hidden = isHidden(attempt.target);
			if (!hidden) selectText(attempt.target);
			const subject = config.subjects[attempt.label] ?? "text";
			show(button, result, "failed", config.failed(subject, { hidden }));
		}
		const detail = {
			id: attempt.controls,
			label: attempt.label,
			ok: status === "copied"
		};
		config.onCopy?.(detail);
		button.dispatchEvent(new CustomEvent("sf:copy", {
			bubbles: true,
			detail
		}));
	});
	const listener = () => {
		const target = targetOf(button);
		if (!target) return;
		const controls = button.getAttribute("aria-controls") ?? "";
		attempt = {
			controls,
			label: button.getAttribute("aria-label") ?? "",
			target
		};
		state.copy(target.textContent ?? "", { isCurrent: () => button.getAttribute(COPY_CONTROLS) === controls });
	};
	button.addEventListener("click", listener);
	return () => {
		button.removeEventListener("click", listener);
		state.destroy();
	};
}
function labelOf(button) {
	return button.querySelector(`[${COPY_LABEL}]`);
}
function setLabel(button, text) {
	const node = labelOf(button);
	if (node) node.textContent = text;
}
/** Sets (or clears, with `undefined`) the state on the button and its result region. */
function show(button, result, state, message) {
	for (const node of [button, result]) {
		if (!node) continue;
		if (state) node.dataset.state = state;
		else delete node.dataset.state;
	}
	if (result) result.textContent = message;
}
function targetOf(button) {
	const id = button.getAttribute(COPY_CONTROLS);
	return id ? button.ownerDocument.getElementById(id) : null;
}
function resultOf(button) {
	return (button.closest(`[data-copy-root]`) ?? button.parentElement)?.querySelector(`[data-copy-result]`) ?? null;
}
function isHidden(element) {
	return element.closest("[hidden]") !== null;
}
function selectText(target) {
	for (let node = target.parentElement; node; node = node.parentElement) if (node instanceof HTMLDetailsElement) node.open = true;
	const selection = target.ownerDocument.getSelection();
	if (!selection) return;
	const range = target.ownerDocument.createRange();
	range.selectNodeContents(target);
	selection.removeAllRanges();
	selection.addRange(range);
}
export { enhanceCopyButtons };
