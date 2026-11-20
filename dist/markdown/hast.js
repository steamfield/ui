// src/markdown/hast.ts
function element(tagName, properties, children = []) {
	return {
		type: "element",
		tagName,
		properties,
		children
	};
}
function text(value) {
	return {
		type: "text",
		value
	};
}
function stringProperty(node, name) {
	const value = node.properties[name];
	return typeof value === "string" && value !== "" ? value : void 0;
}
function hasClass(node, name) {
	const value = node.properties.class ?? node.properties.className;
	return (Array.isArray(value) ? value.map(String) : String(value ?? "").split(/\s+/)).includes(name);
}
export { element, hasClass, stringProperty, text };
