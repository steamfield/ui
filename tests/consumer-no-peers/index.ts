// A user of the framework-free subpaths with nothing else installed: no React, Vue, markdown
// packages or @types/node. scripts/consumer.ts installs only the packed tarball next to this file,
// typechecks it (so no declaration may reference a peer) and runs it with Node. Every subpath
// whose area imports no package is imported here; tests/package-shape.test.ts keeps the list
// complete. The DOM controllers need a document, so they are only imported and type-checked.
import { copyText, enhanceCopyButtons } from "@steamfield/ui/copy";
import { createDocs, type DocsConfig, docPath, spyToc } from "@steamfield/ui/docs";
import { createPlaybackGate } from "@steamfield/ui/playback";
import { initReveal, motionTokens, revealGateHash, revealGateScript } from "@steamfield/ui/reveal";
import { type DemoScript, isLibraryError, validateScript } from "@steamfield/ui/script";
import { compile, finalState, presets, transcriptText } from "@steamfield/ui/sequencer";
import { createTabs } from "@steamfield/ui/tabs";

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(`consumer (no peers): ${message}`);
}

// script + sequencer
const script: DemoScript = {
  steps: [
    { kind: "user", text: "hi" },
    { kind: "agent-text", text: "Hello there." },
  ],
};
validateScript(script);
try {
  validateScript({ steps: [{ kind: "nope" }] });
  check(false, "an unknown step kind should throw");
} catch (thrown) {
  check(isLibraryError(thrown) && thrown.code === "unsupported_step", "unsupported_step");
}
const end = finalState(compile(script, { timing: presets.terminal, seed: "demo" }));
check(end.complete && end.entries.length === 2, "finalState");
check(transcriptText(script).includes("Hello there."), "transcriptText");

// playback: a gate without an element counts as in view.
const gate = createPlaybackGate(null, { duration: 1000, motion: "full", autoStart: false });
check(typeof gate.getState().elapsed === "number", "gate state");
gate.destroy();

// copy
check((await copyText("x")) === false, "copyText reports false without a clipboard or DOM");

// reveal: tokens are data and the pre-paint gate is safe to evaluate without a DOM.
check(Object.isFrozen(motionTokens), "motionTokens");
new Function(revealGateScript)();
check(revealGateHash.startsWith("sha256-"), "revealGateHash");

// docs
const docsConfig: DocsConfig = {
  name: "Acme",
  summary: "Docs for Acme.",
  groups: ["Start"],
  trailingSlash: "never",
  optionalLinks: [],
  intro: ["Start with the quickstart."],
};
check(createDocs(docsConfig).llmsIndex([], "https://example.com").includes("Acme"), "llmsIndex");
check(docPath("intro", "always").endsWith("/"), "docPath");

// DOM controllers
for (const controller of [enhanceCopyButtons, createTabs, initReveal, spyToc]) {
  check(typeof controller === "function", `${controller.name} export`);
}

console.log("consumer (no peers): ok");
