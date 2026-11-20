// src/docs/spy-toc.ts
function hashId(link) {
	const raw = link.hash.slice(1);
	try {
		return decodeURIComponent(raw);
	} catch {
		return raw;
	}
}
/**
* Marks the "On this page" link for the section being read with `aria-current="location"`.
* Without IntersectionObserver (or JavaScript) the links still work; nothing is marked. When every
* heading scrolls out of view the last mark stays.
*
* Returns a function that stops observing.
*/
function spyToc(root, options = {}) {
	const doc = root.ownerDocument ?? root;
	const current = options.current ?? "location";
	const links = /* @__PURE__ */ new Map();
	for (const link of root.querySelectorAll(options.linkSelector ?? "[data-toc-link]")) links.set(hashId(link), link);
	const headings = [...links.keys()].map((id) => doc.getElementById(id)).filter((heading) => heading !== null);
	const Observer = doc.defaultView?.IntersectionObserver;
	if (headings.length === 0 || !Observer) return () => void 0;
	const visible = /* @__PURE__ */ new Set();
	const mark = () => {
		const active = headings.find((heading) => visible.has(heading.id))?.id;
		if (active === void 0) return;
		for (const [id, link] of links) if (id === active) link.setAttribute("aria-current", current);
		else link.removeAttribute("aria-current");
	};
	const observer = new Observer((entries) => {
		for (const entry of entries) if (entry.isIntersecting) visible.add(entry.target.id);
		else visible.delete(entry.target.id);
		mark();
	}, { rootMargin: options.rootMargin ?? "0px 0px -70% 0px" });
	for (const heading of headings) observer.observe(heading);
	return () => observer.disconnect();
}
export { spyToc };
