// A TypeScript user of the published package. scripts/consumer.ts installs the packed tarball
// (plus the peers listed in CONSUMER_PEERS) next to this file, typechecks it under strict NodeNext
// resolution, then runs it with Node. Keep it importing by package name, one block per subpath,
// and add each new subpath here.
import { type CopyEventDetail, copyText, enhanceCopyButtons } from "@steamfield/ui/copy";
import { CopyCommand, type CopyCommandProps, useCopy } from "@steamfield/ui/react/copy";
import { isLibraryError, LibraryError, type LibraryErrorCode } from "@steamfield/ui/script";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(`consumer (ts): ${message}`);
}

// script
const code: LibraryErrorCode = "invalid_script";
const error = new LibraryError(code, { field: "steps[0]" });
check(isLibraryError(error) && error.field === "steps[0]", "LibraryError carries its field");

// copy: framework-free and safe to import where there is no DOM.
const detail: CopyEventDetail = { id: "x", label: "Copy", ok: true };
check(typeof copyText === "function" && typeof enhanceCopyButtons === "function", "copy exports");
check(detail.ok, "CopyEventDetail type");
check((await copyText("x")) === false, "copyText reports false without a clipboard or DOM");

// react/copy: renders on the server with the button hidden until enhanced.
const props: CopyCommandProps = { id: "cmd", command: "bun add @steamfield/ui" };
const html = renderToStaticMarkup(createElement(CopyCommand, props));
check(html.includes("bun add @steamfield/ui") && /<button[^>]*hidden/.test(html), "CopyCommand");
check(typeof useCopy === "function", "useCopy export");
