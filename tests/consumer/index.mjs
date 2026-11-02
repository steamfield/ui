// A JavaScript user of the published package, with no types to lean on. scripts/consumer.ts runs
// it with Node after installing the packed tarball.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
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

// Every stylesheet subpath resolves to a file that shipped in the tarball, read from the installed
// package's own export map so a new stylesheet is covered without editing this file.
const { exports } = (await import("@steamfield/ui/package.json", { with: { type: "json" } }))
  .default;
const stylesheets = Object.keys(exports).filter((key) => key.endsWith(".css"));
check(stylesheets.length >= 7, `only ${stylesheets.length} stylesheet subpaths`);
for (const key of stylesheets) {
  const spec = `@steamfield/ui/${key.slice(2)}`;
  const url = import.meta.resolve(spec);
  check(url.endsWith(exports[key].slice(1)), `${spec} resolved to ${url}`);
  check(existsSync(fileURLToPath(url)), `${spec} resolved to ${url}, which is not in the package`);
}

console.log("consumer (mjs): ok");
