import type { DemoScript } from "@steamfield/ui/script";
import { presets } from "@steamfield/ui/sequencer";
import { AgentDemo, StaticTranscript } from "@steamfield/ui/vue/agent-demo";
import { type ReactElement, useEffect, useRef } from "react";
import { createApp, h } from "vue";

// The Vue binding is render functions, so it mounts with createApp alone: no SFC compiler and no
// @vitejs/plugin-vue. React owns the host element; Vue owns everything inside it.
const script: DemoScript = {
  id: "pg-vue",
  steps: [
    { kind: "user", text: "Rename the config file and update the imports." },
    {
      kind: "tool-call",
      name: "Bash",
      args: "git mv app.config.js app.config.ts",
      output: [{ text: "renamed app.config.js -> app.config.ts", tone: "ok" }],
    },
    { kind: "agent-text", text: "Renamed, and the two imports now point at app.config.ts." },
  ],
};

function VueIsland({ render }: { readonly render: () => ReturnType<typeof h> }): ReactElement {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const app = createApp({ render });
    app.mount(host.current);
    return () => app.unmount();
  }, [render]);
  return <div ref={host} />;
}

const live = (): ReturnType<typeof h> =>
  h(AgentDemo, {
    script,
    layout: "terminal",
    timing: presets.terminal,
    chrome: { title: "vue session" },
    labels: { transcript: "Vue terminal transcript" },
  });

const extended = (): ReturnType<typeof h> =>
  h(AgentDemo, {
    script,
    layout: "terminal",
    timing: presets.terminal,
    chrome: { title: "vue session", className: "pg-hero-window" },
    labels: { transcript: "Vue collapsible transcript", working: "Running…" },
    collapsible: true,
    transcript: { as: "region" },
  });

const still = (): ReturnType<typeof h> =>
  h(StaticTranscript, {
    script,
    layout: "chat",
    labels: { transcript: "Vue static transcript" },
  });

export function VueAgentDemoPage(): ReactElement {
  return (
    <>
      <h1>vue agent-demo</h1>
      <section className="pg-section" aria-labelledby="vue-terminal">
        <h2 id="vue-terminal">Terminal</h2>
        <VueIsland render={live} />
      </section>
      <section className="pg-section" aria-labelledby="vue-extensions">
        <h2 id="vue-extensions">Working line, collapsible calls, region transcript</h2>
        <VueIsland render={extended} />
      </section>
      <section className="pg-section" aria-labelledby="vue-static">
        <h2 id="vue-static">StaticTranscript</h2>
        <VueIsland render={still} />
      </section>
    </>
  );
}
