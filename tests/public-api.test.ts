// Pins the public API: the runtime names each subpath entry exports. A change here is a release
// decision (a new export is minor, a removed or renamed one is breaking; on 0.x both bump the
// minor), so update the README section for that subpath and add a changeset in the same change.
import { expect, test } from "vitest";

const api: Record<string, string[]> = {
  "copy/index.ts": ["copyText", "enhanceCopyButtons"],
  "docs/index.ts": [
    "absoluteLinks",
    "createDocs",
    "docPath",
    "docsNav",
    "featuredDocs",
    "llmsFull",
    "llmsIndex",
    "markdownPath",
    "pageLinks",
    "pageMarkdown",
    "spyToc",
  ],
  "markdown/index.ts": [
    "callouts",
    "codeBlocks",
    "codeGroups",
    "codeMeta",
    "createHastPlugins",
    "createShikiConfig",
    "headingAnchors",
    "parseFenceMeta",
    "tables",
  ],
  "playback/index.ts": ["createPlaybackGate"],
  "react/agent-demo/index.ts": ["AgentDemo", "StaticTranscript", "useAgentDemo"],
  "react/copy/index.ts": ["CopyButton", "CopyCommand", "useCopy"],
  "react/playback/index.ts": ["useCountUp", "usePlayback"],
  "reveal/index.ts": ["initReveal", "motionTokens", "revealGateHash", "revealGateScript"],
  "react/install-tabs/index.ts": ["InstallTabs"],
  "react/tabs/index.ts": ["Tab", "TabList", "TabPanel", "Tabs"],
  "react/window/index.ts": ["DemoWindow"],
  "tabs/index.ts": ["createTabs"],
  "vue/agent-demo/index.ts": ["AgentDemo", "StaticTranscript", "useAgentDemo"],
  "script/index.ts": ["LibraryError", "isLibraryError", "validateScript"],
  "sequencer/index.ts": [
    "clickCount",
    "compile",
    "finalState",
    "presets",
    "stateAt",
    "transcriptText",
  ],
};

test.each(Object.entries(api))(
  "src/%s exports exactly the documented names",
  async (entry, names) => {
    const module = (await import(`../src/${entry}`)) as Record<string, unknown>;
    expect(Object.keys(module).sort()).toEqual([...names].sort());
  },
);

test("every subpath entry is pinned here", async () => {
  const { entries } = await import("./package-shape.ts");
  expect(Object.keys(api).sort()).toEqual(entries().sort());
});
