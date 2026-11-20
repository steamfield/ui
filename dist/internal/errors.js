// src/internal/errors.ts
const messages = {
	invalid_script: "The demo script is malformed.",
	unsupported_step: "The demo script has a step kind this renderer does not support.",
	invalid_option: "An option has an invalid value."
};
/** The one error this package throws on purpose. Anything else escaping a call is a bug. */
var LibraryError = class extends Error {
	name = "LibraryError";
	code;
	field;
	constructor(code, options = {}) {
		super(options.field ? `${messages[code]} (${options.field})` : messages[code], options.cause === void 0 ? void 0 : { cause: options.cause });
		this.code = code;
		this.field = options.field;
	}
};
/**
* True for a LibraryError from any copy of this package. Prefer it to `instanceof`, which fails
* when an app ends up with two installed versions of the package.
*/
function isLibraryError(value) {
	if (!(value instanceof Error) || value.name !== "LibraryError") return false;
	const code = value.code;
	return typeof code === "string" && Object.hasOwn(messages, code);
}
export { LibraryError, isLibraryError };
