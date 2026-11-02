// A JavaScript user of the published package, with no types to lean on. scripts/consumer.ts runs
// it with Node after installing the packed tarball.
import { copyText } from "@steamfield/ui/copy";
import { isLibraryError, LibraryError } from "@steamfield/ui/script";

function check(condition, message) {
  if (!condition) throw new Error(`consumer (mjs): ${message}`);
}

check(isLibraryError(new LibraryError("invalid_option")), "LibraryError round trip");
check((await copyText("x")) === false, "copyText without a DOM");

// Only "exports" is reachable: there is no root entry and the build's files stay private.
for (const spec of ["@steamfield/ui", "@steamfield/ui/dist/copy/index.js"]) {
  const outcome = await import(spec).then(
    () => "resolved",
    (error) => error.code,
  );
  check(outcome === "ERR_PACKAGE_PATH_NOT_EXPORTED", `${spec} gave ${outcome}`);
}

// CSS is exported as a file, resolvable by bundlers.
const css = import.meta.resolve("@steamfield/ui/copy/styles.css");
check(css.endsWith("/dist/copy/styles.css"), `styles.css resolved to ${css}`);

console.log("consumer (mjs): ok");
