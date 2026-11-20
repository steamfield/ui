// src/copy/copy-text.ts
/**
* Copies `text` to the clipboard and reports whether it worked. Tries the async Clipboard API
* first, then a hidden readonly textarea with `execCommand("copy")`, whose result is respected.
* Never throws, so callers branch on the boolean instead of wrapping every call.
*/
async function copyText(text) {
	const clipboard = globalThis.navigator?.clipboard;
	if (clipboard?.writeText) try {
		await clipboard.writeText(text);
		return true;
	} catch {}
	return copyWithExecCommand(text);
}
function copyWithExecCommand(text) {
	const doc = globalThis.document;
	if (!doc?.body || typeof doc.execCommand !== "function") return false;
	const area = doc.createElement("textarea");
	area.value = text;
	area.setAttribute("readonly", "");
	area.style.position = "fixed";
	area.style.opacity = "0";
	area.style.pointerEvents = "none";
	doc.body.append(area);
	const previous = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
	try {
		area.select();
		return doc.execCommand("copy");
	} catch {
		return false;
	} finally {
		area.remove();
		previous?.focus();
	}
}
export { copyText };
