// A TypeScript user of the published package. scripts/consumer.ts installs the packed tarball
// (plus the peers listed in CONSUMER_PEERS; tests/consumer-no-peers/ covers a consumer with
// none) next to this file, typechecks it under strict NodeNext resolution, then runs it with
// Node. Keep it importing by package name, one block per subpath, and add each new subpath here.
import { type CopyEventDetail, copyText, enhanceCopyButtons } from "@steamfield/ui/copy";
import { createDocs, type DocsConfig, docPath } from "@steamfield/ui/docs";
import { createHastPlugins, createShikiConfig, type TablesOptions } from "@steamfield/ui/markdown";
import { createPlaybackGate, type GateState } from "@steamfield/ui/playback";
import {
  AgentDemo,
  type AgentDemoProps,
  type AgentDemoTranscript,
  StaticTranscript,
  useAgentDemo,
} from "@steamfield/ui/react/agent-demo";
import { CopyCommand, type CopyCommandProps, useCopy } from "@steamfield/ui/react/copy";
import { type InstallOption, InstallTabs } from "@steamfield/ui/react/install-tabs";
import { type PlaybackRef, useCountUp, usePlayback } from "@steamfield/ui/react/playback";
import { Tab, TabList, TabPanel, Tabs } from "@steamfield/ui/react/tabs";
import { DemoWindow, type DemoWindowProps } from "@steamfield/ui/react/window";
import {
  initReveal,
  type MotionPreference,
  type MotionSource,
  motionTokens,
  revealGateHash,
  revealGateScript,
} from "@steamfield/ui/reveal";
import {
  type DemoScript,
  isLibraryError,
  LibraryError,
  type LibraryErrorCode,
  validateScript,
} from "@steamfield/ui/script";
import {
  clickCount,
  compile,
  type DemoView,
  finalState,
  presets,
  stateAt,
  transcriptText,
} from "@steamfield/ui/sequencer";
import { type CreateTabsOptions, createTabs } from "@steamfield/ui/tabs";
import {
  useAgentDemo as useVueAgentDemo,
  AgentDemo as VueAgentDemo,
  type AgentDemoProps as VueAgentDemoProps,
  type AgentDemoTranscript as VueAgentDemoTranscript,
  StaticTranscript as VueStaticTranscript,
} from "@steamfield/ui/vue/agent-demo";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";

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
const props: CopyCommandProps = {
  id: "cmd",
  command: "bun add @steamfield/ui",
  buttonClassName: "btn",
  promptClassName: "glyph",
  commandClassName: "cmd",
};
const html = renderToStaticMarkup(createElement(CopyCommand, props));
check(html.includes("bun add @steamfield/ui") && /<button[^>]*hidden/.test(html), "CopyCommand");
check(html.includes('class="btn"') && html.includes('class="cmd"'), "CopyCommand part classes");
// A wrapper forwarding its own optional props passes undefined straight through.
function forward(buttonClassName?: string): CopyCommandProps {
  return { id: "fwd", command: "ls", buttonClassName, promptClassName: undefined };
}
check(
  !renderToStaticMarkup(createElement(CopyCommand, forward())).includes("class="),
  "CopyCommand with undefined part classes",
);
check(typeof useCopy === "function", "useCopy export");

// script + sequencer: pure, so they run on the server.
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
const timeline = compile(script, { timing: presets.terminal, seed: "demo" });
const mid: DemoView = stateAt(timeline, { ms: timeline.duration / 2 });
const end: DemoView = finalState(timeline);
check(!mid.complete && end.complete && end.entries.length === 2, "stateAt / finalState");
check(clickCount(script) >= 0 && transcriptText(script).includes("Hello there."), "transcript");

// react/agent-demo: the server render is the final transcript, with no controls.
const demoProps: AgentDemoProps = { script, layout: "terminal", timing: presets.terminal };
const demoHtml = renderToStaticMarkup(createElement(AgentDemo, demoProps));
check(
  demoHtml.includes("data-sf-agent-demo") &&
    demoHtml.includes("Hello there.") &&
    !demoHtml.includes("<button"),
  "AgentDemo SSR is the final transcript",
);
check(
  renderToStaticMarkup(createElement(StaticTranscript, { script })).includes("hi"),
  "StaticTranscript",
);
check(typeof useAgentDemo === "function", "useAgentDemo export");
const toolScript: DemoScript = { steps: [{ kind: "tool-call", name: "query", server: "db" }] };
const toolHtml = renderToStaticMarkup(
  createElement(StaticTranscript, {
    script: toolScript,
    layout: "terminal",
    glyphs: { serverSeparator: " · " },
  }),
);
check(
  toolHtml.includes('data-part="tool-server">db</span> · <span data-part="tool-name">query'),
  "terminal tool header parts",
);
// The opt-in extension points: a working line, paren parts, collapsible cards, a region
// transcript and a window class.
const region: AgentDemoTranscript = { as: "region", focusable: false };
const extendedHtml = renderToStaticMarkup(
  createElement(AgentDemo, {
    script: { steps: [{ kind: "tool-call", name: "q", args: "x" }] },
    layout: "terminal",
    labels: { working: "Running…" },
    collapsible: true,
    transcript: region,
    chrome: { className: "hero" },
  }),
);
check(
  extendedHtml.includes('<section data-part="transcript" aria-label="Demo transcript">') &&
    extendedHtml.includes('<summary data-part="tool-header">') &&
    extendedHtml.includes('<span data-part="tool-paren">(</span>x') &&
    extendedHtml.includes('class="hero"'),
  "AgentDemo extension points",
);
const windowProps: DemoWindowProps = { title: "session", label: "Example" };
check(
  renderToStaticMarkup(createElement(DemoWindow, windowProps)).includes("session"),
  "DemoWindow",
);

// vue/agent-demo: same markup contract, rendered on the server.
const vueProps: VueAgentDemoProps = { script, layout: "terminal", position: { click: 1 } };
const vueHtml = await renderToString(
  createSSRApp({ render: () => h(VueStaticTranscript, { script }) }),
);
check(vueHtml.includes("Hello there."), "Vue StaticTranscript SSR");
const vueToolHtml = await renderToString(
  createSSRApp({
    render: () =>
      h(VueStaticTranscript, {
        script: toolScript,
        layout: "terminal",
        glyphs: { serverSeparator: " · " },
      }),
  }),
);
check(vueToolHtml.includes('data-part="tool-server"'), "Vue terminal tool header parts");
const vueRegion: VueAgentDemoTranscript = { as: "region" };
const vueExtendedHtml = await renderToString(
  createSSRApp({
    render: () =>
      h(VueStaticTranscript, {
        script: toolScript,
        layout: "terminal",
        collapsible: true,
        transcript: vueRegion,
      }),
  }),
);
check(
  vueExtendedHtml.includes("<section") && vueExtendedHtml.includes("<summary"),
  "Vue StaticTranscript extension points",
);
const vueDemoHtml = await renderToString(createSSRApp({ render: () => h(VueAgentDemo, vueProps) }));
check(vueDemoHtml.includes("data-sf-agent-demo"), "Vue AgentDemo SSR");
check(typeof useVueAgentDemo === "function", "Vue useAgentDemo export");

// playback: a gate without an element counts as in view.
const gate = createPlaybackGate(null, { duration: 1000, motion: "full", autoStart: false });
const state: GateState = gate.getState();
check(typeof state.elapsed === "number", "gate state");
gate.destroy();
check(typeof usePlayback === "function" && typeof useCountUp === "function", "react/playback");
// The ref is a callback ref that also reads like a RefObject.
const readCurrent = (ref: PlaybackRef<HTMLDivElement>): HTMLDivElement | null => ref.current;
check(typeof readCurrent === "function", "PlaybackRef type");

// reveal: the motion tokens are plain data; the motion types describe a site's own toggle.
check(typeof initReveal === "function" && typeof motionTokens === "object", "reveal");
// The pre-paint gate is a classic script string, safe to evaluate where there is no DOM.
check(
  typeof revealGateScript === "string" && revealGateScript.includes("data-motion-ready"),
  "gate",
);
new Function(revealGateScript)();
const csp = `script-src 'self' '${revealGateHash}'`;
check(/'sha256-[A-Za-z0-9+/]+=*'/.test(csp), "revealGateHash is a CSP source");
const revealMotion: MotionPreference | MotionSource = {
  get: () => true,
  subscribe: () => () => {},
};
check(typeof revealMotion === "object", "reveal motion types");

// tabs: the DOM controller exists; React tabs and install tabs render on the server.
const tabOptions: CreateTabsOptions = { activation: "manual", hash: "replace" };
check(typeof createTabs === "function" && tabOptions.activation === "manual", "tabs");
const tabsHtml = renderToStaticMarkup(
  createElement(
    Tabs,
    { id: "cmd" },
    createElement(TabList, { "aria-label": "Commands" }, createElement(Tab, { value: "a" }, "A")),
    createElement(TabPanel, { value: "a" }, "panel a"),
  ),
);
check(tabsHtml.includes('href="#cmd-a"') && tabsHtml.includes("panel a"), "react/tabs SSR");
const installOptions: InstallOption[] = [{ id: "npm", label: "npm", command: "npm i -g acme" }];
const installHtml = renderToStaticMarkup(createElement(InstallTabs, { options: installOptions }));
check(installHtml.includes("npm i -g acme"), "react/install-tabs SSR");

// markdown + docs: plugin factories and pure docs helpers.
const tableOptions: TablesOptions = {
  regionLabel: (_table, index, { heading }) => `${heading ?? "Data"} ${index + 1}`,
};
const hastPlugins = createHastPlugins({ tables: tableOptions });
check(createHastPlugins({ tables: { regionLabel: false } }).length > 0, "regionLabel false");
check(Array.isArray(hastPlugins) || typeof hastPlugins === "object", "markdown plugins");
check(typeof createShikiConfig().theme === "string", "shiki config");
const docsConfig: DocsConfig = {
  name: "Acme",
  summary: "Docs for Acme.",
  groups: ["Start"],
  trailingSlash: "never",
  optionalLinks: [],
  intro: ["Start with the quickstart."],
};
const docs = createDocs(docsConfig);
check(docs.llmsIndex([], "https://example.com").includes("Start with the quickstart."), "intro");
check(typeof docs.llmsFull([], "https://example.com") === "string", "docs llmsFull");
check(docPath("intro", "always").endsWith("/"), "docPath trailing slash");
