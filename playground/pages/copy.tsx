import { enhanceCopyButtons } from "@steamfield/ui/copy";
import { CopyCommand } from "@steamfield/ui/react/copy";
import { type ReactElement, useEffect } from "react";

export function CopyPage(): ReactElement {
  useEffect(() => enhanceCopyButtons(document), []);
  return (
    <>
      <h1>copy</h1>
      <section className="pg-section" aria-labelledby="copy-command">
        <h2 id="copy-command">CopyCommand</h2>
        <CopyCommand id="pg-install" command="bun add @steamfield/ui" />
      </section>
      <section className="pg-section" aria-labelledby="copy-prompt">
        <h2 id="copy-prompt">Prompt</h2>
        <CopyCommand
          id="pg-prompt"
          prose
          command="Build a landing page with an install section and a terminal demo."
        />
      </section>
    </>
  );
}
