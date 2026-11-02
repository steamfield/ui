// Pins the public API: the runtime names and the type names each subpath entry exports. A change
// here is a release decision (a new export is minor, a removed or renamed one is breaking; on 0.x
// both bump the minor), so update the README section for that subpath and add a changeset in the
// same change.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { entries, typeExports } from "./package-shape.ts";

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

/** Type-only exports (`export type { ... }`, `export { type ... }`), which land in the .d.ts. */
const types: Record<string, string[]> = {
  "copy/index.ts": ["CopyEventDetail", "CopyMessages", "EnhanceCopyOptions"],
  "docs/index.ts": [
    "DocEntry",
    "DocLink",
    "DocMeta",
    "DocNavGroup",
    "Docs",
    "DocsConfig",
    "OptionalLink",
    "RewriteContext",
    "RewriteLink",
    "SpyTocOptions",
  ],
  "markdown/index.ts": [
    "CalloutKind",
    "CalloutsOptions",
    "CodeBlocksOptions",
    "FenceMeta",
    "HeadingAnchorsOptions",
    "MarkdownOptions",
    "ShikiOptions",
    "TableLabelContext",
    "TablesOptions",
  ],
  "playback/index.ts": [
    "GateState",
    "MotionPreference",
    "MotionSource",
    "PlaybackGate",
    "PlaybackGateOptions",
    "ReducedPolicy",
  ],
  "react/agent-demo/index.ts": [
    "AgentDemoControls",
    "AgentDemoControlsProp",
    "AgentDemoGlyphs",
    "AgentDemoLabels",
    "AgentDemoLayout",
    "AgentDemoProps",
    "AnnounceMode",
    "StaticTranscriptProps",
    "ToolCallContext",
    "ToolInfo",
    "ToolRegistry",
    "ToolRenderer",
    "UseAgentDemoOptions",
    "UseAgentDemoResult",
  ],
  "react/copy/index.ts": ["CopyButtonProps", "CopyCommandProps", "UseCopyOptions", "UseCopyResult"],
  "react/install-tabs/index.ts": ["InstallOption", "InstallTabsLabels", "InstallTabsProps"],
  "react/playback/index.ts": [
    "PlaybackRef",
    "UseCountUpOptions",
    "UseCountUpResult",
    "UsePlaybackOptions",
    "UsePlaybackResult",
  ],
  "react/tabs/index.ts": [
    "TabListProps",
    "TabPanelProps",
    "TabProps",
    "TabsActivation",
    "TabsChangeDetail",
    "TabsHash",
    "TabsOrientation",
    "TabsProps",
  ],
  "react/window/index.ts": ["DemoWindowProps"],
  "reveal/index.ts": [
    "AnimationName",
    "AnimationType",
    "DurationName",
    "EasingName",
    "LegacyAnimationName",
    "MotionKeyframes",
    "MotionPreference",
    "MotionRoleName",
    "MotionRoleTiming",
    "MotionSource",
    "MotionTokens",
    "RevealOptions",
    "Spring",
    "SpringName",
  ],
  "script/index.ts": [
    "At",
    "DemoScript",
    "LibraryErrorCode",
    "LibraryErrorOptions",
    "Line",
    "Step",
    "StepKind",
    "Tone",
    "ToolBody",
    "ToolStatus",
    "ValidateScriptOptions",
  ],
  "sequencer/index.ts": [
    "CompileOptions",
    "DemoEntry",
    "DemoView",
    "FinalPolicy",
    "FinalStateOptions",
    "Phase",
    "Position",
    "Span",
    "TimedStep",
    "Timeline",
    "Timing",
    "TimingPresets",
    "ToolCallStep",
    "TypedStep",
  ],
  "tabs/index.ts": [
    "CreateTabsOptions",
    "TabsActivation",
    "TabsChangeDetail",
    "TabsHash",
    "TabsOrientation",
  ],
  "vue/agent-demo/index.ts": [
    "AgentDemoChrome",
    "AgentDemoControls",
    "AgentDemoControlsMode",
    "AgentDemoGlyphs",
    "AgentDemoLabels",
    "AgentDemoLayout",
    "AgentDemoProps",
    "AgentDemoSlotState",
    "AgentDemoSlots",
    "AnnounceMode",
    "StaticTranscriptProps",
    "StaticTranscriptSlots",
    "ToolCallContext",
    "ToolIcon",
    "ToolInfo",
    "ToolRegistry",
    "ToolSlot",
    "UseAgentDemoOptions",
    "UseAgentDemoResult",
  ],
};

test.each(Object.entries(api))(
  "src/%s exports exactly the documented names",
  async (entry, names) => {
    const module = (await import(/* @vite-ignore */ `../src/${entry}`)) as Record<string, unknown>;
    expect(Object.keys(module).sort()).toEqual([...names].sort());
  },
);

test.each(Object.entries(types))("src/%s exports exactly the documented types", (entry, names) => {
  const file = join(import.meta.dirname, "../src", entry);
  expect(typeExports(entry, readFileSync(file, "utf8")).sort()).toEqual([...names].sort());
});

test("every subpath entry is pinned here", () => {
  expect(Object.keys(api).sort()).toEqual(entries().sort());
  expect(Object.keys(types).sort()).toEqual(entries().sort());
});
