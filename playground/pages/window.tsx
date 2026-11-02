import { DemoWindow } from "@steamfield/ui/react/window";
import type { ReactElement } from "react";

export function WindowPage(): ReactElement {
  return (
    <>
      <h1>window</h1>
      <section className="pg-section" aria-labelledby="win-full">
        <h2 id="win-full">Dots, title and controls</h2>
        <DemoWindow
          title="~/project"
          label="Example terminal"
          controls={<button type="button">Replay</button>}
        >
          <pre>$ npm test{"\n"}PASS src/upload.test.ts (2 tests)</pre>
        </DemoWindow>
      </section>
      <section className="pg-section" aria-labelledby="win-bare">
        <h2 id="win-bare">No dots, no title</h2>
        <DemoWindow dots={false}>
          <p>A plain body with no chrome in the bar.</p>
        </DemoWindow>
      </section>
    </>
  );
}
