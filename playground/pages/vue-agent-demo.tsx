import type { DemoScript } from "@steamfield/ui/script";
import { clickCount, presets } from "@steamfield/ui/sequencer";
import { AgentDemo, StaticTranscript } from "@steamfield/ui/vue/agent-demo";
import { type ReactElement, useEffect, useRef } from "react";
import { createApp, defineComponent, h, ref } from "vue";

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

const startEmpty = (): ReturnType<typeof h> =>
  h(
    AgentDemo,
    {
      script,
      layout: "chat",
      beforeStart: "start",
      leaveGraceMs: Number.POSITIVE_INFINITY,
      timing: { thinkingOnSubmit: true },
      labels: { transcript: "Vue empty-start chat transcript" },
    },
    {
      composerStart: () => [h("span", null, "+")],
      submitIcon: () => [h("span", null, "↑")],
    },
  );

const chatCollapsible = (): ReturnType<typeof h> =>
  h(AgentDemo, {
    script,
    layout: "chat",
    collapsible: true,
    transcript: { as: "region" },
    labels: { transcript: "Vue collapsible chat transcript" },
  });

const clickScript: DemoScript = {
  id: "pg-vue-click",
  steps: [
    { kind: "user", text: "List the fixtures.", at: 1 },
    {
      kind: "tool-call",
      name: "Bash",
      args: "ls fixtures",
      at: 2,
      outputAt: 3,
      output: ["small.bin", "large.bin"],
    },
    { kind: "agent-text", text: "Two fixtures: small.bin and large.bin.", at: 4 },
  ],
};

/** A click-paced demo whose clicks live in Vue state, as a Slidev deck's would. */
const ClickWorking = defineComponent(() => {
  const click = ref(0);
  const total = clickCount(clickScript);
  return () =>
    h("div", null, [
      h("div", { class: "pg-row" }, [
        h(
          "button",
          { type: "button", disabled: click.value === 0, onClick: () => click.value-- },
          "Previous",
        ),
        h("span", null, `Click ${click.value} of ${total}`),
        h(
          "button",
          { type: "button", disabled: click.value === total, onClick: () => click.value++ },
          "Next click",
        ),
      ]),
      h(AgentDemo, {
        script: clickScript,
        layout: "terminal",
        position: { click: click.value },
        collapsible: true,
        transcript: { as: "region" },
        labels: { transcript: "Vue click-paced working transcript", working: "Running…" },
        style: { "--sf-demo-height": "12rem" },
      }),
    ]);
});

const clickWorking = (): ReturnType<typeof h> => h(ClickWorking);

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
      <section className="pg-section" aria-labelledby="vue-start-empty">
        <h2 id="vue-start-empty">Starts empty, composer icons</h2>
        <VueIsland render={startEmpty} />
      </section>
      <section className="pg-section" aria-labelledby="vue-chat-collapsible">
        <h2 id="vue-chat-collapsible">Collapsible chat cards</h2>
        <VueIsland render={chatCollapsible} />
      </section>
      <section className="pg-section" aria-labelledby="vue-click-working">
        <h2 id="vue-click-working">Click mode with a working line</h2>
        <VueIsland render={clickWorking} />
      </section>
      <section className="pg-section" aria-labelledby="vue-static">
        <h2 id="vue-static">StaticTranscript</h2>
        <VueIsland render={still} />
      </section>
    </>
  );
}
