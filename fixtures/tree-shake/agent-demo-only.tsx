// Imports only the agent demo. Copy, tabs and reveal must stay out of the bundle.
import { AgentDemo } from "@steamfield/ui/react/agent-demo";
import { createRoot } from "react-dom/client";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <AgentDemo
      layout="terminal"
      script={{
        steps: [
          { kind: "command", text: "ls" },
          { kind: "output", lines: ["a", "b"] },
        ],
      }}
    />,
  );
}
