// Imports only the Vue agent demo. No React code may reach the bundle.
import { AgentDemo } from "@steamfield/ui/vue/agent-demo";
import { createApp, h } from "vue";

createApp({
  render: () =>
    h(AgentDemo, {
      layout: "terminal",
      script: { steps: [{ kind: "command", text: "ls" }] },
    }),
}).mount("#root");
