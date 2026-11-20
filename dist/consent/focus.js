// src/consent/focus.ts
const isFocusable = (node) => typeof node?.focus === "function";
function createFocusReturn() {
	let origin = null;
	return {
		enter(root, from) {
			if (from instanceof Node && root.contains(from)) return;
			origin = isFocusable(from) ? from : null;
		},
		restore(root) {
			const target = origin;
			origin = null;
			const doc = root?.ownerDocument;
			if (!root || !doc || !root.contains(doc.activeElement)) return;
			if (target?.isConnected && !root.contains(target)) target.focus({ preventScroll: true });
		}
	};
}
export { createFocusReturn };
