// src/internal/options.ts
/**
* The first problem with an options argument: the field name when it isn't an object (`fallback`)
* or has a key outside `known`, else undefined. Callers throw `invalid_option` with it, so a typo
* never passes silently.
*/
function unknownOption(options, known, fallback = "options") {
	if (options === void 0) return void 0;
	if (typeof options !== "object" || options === null || Array.isArray(options)) return fallback;
	return Object.keys(options).find((key) => !known.includes(key));
}
/** Drops undefined values, which `exactOptionalPropertyTypes` won't pass as "absent". */
function defined(values) {
	return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== void 0));
}
export { defined, unknownOption };
