// Imports only the copy subpath. The bundle must contain copy's markup and nothing from the
// agent demo, sequencer, tabs or reveal.
import { CopyCommand } from "@steamfield/ui/react/copy";
import { createRoot } from "react-dom/client";

const root = document.getElementById("root");
if (root) createRoot(root).render(<CopyCommand id="x" command="bun add @steamfield/ui" />);
