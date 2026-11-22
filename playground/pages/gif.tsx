import { GIF_THEME_META, pickGif, pickInlineGif } from "@steamfield/ui/gif";
import { Gif } from "@steamfield/ui/react/gif";
import { DemoWindow } from "@steamfield/ui/react/window";
import type { ReactElement } from "react";

export function GifPage(): ReactElement {
  const networkUrl = pickGif("network-error", { seed: "playground" });
  const inlineUrl = pickInlineGif("timeout");
  return (
    <>
      <h1>gif</h1>
      <section className="pg-section" aria-labelledby="gif-fallback">
        <h2 id="gif-fallback">Fallback when offline or missing</h2>
        <Gif
          label="Offline graphic fallback"
          fallback={<span>Offline fallback content</span>}
          style={{ width: 220, maxWidth: "100%", height: 140 }}
        />
      </section>
      <section className="pg-section" aria-labelledby="gif-window">
        <h2 id="gif-window">Inside DemoWindow (reduced fallback mode)</h2>
        <DemoWindow title={GIF_THEME_META["network-error"].filename} label="Network error preview">
          <Gif
            src={networkUrl}
            motion="reduce"
            reducedBehavior="fallback"
            fallback={<span>Paused fallback ({GIF_THEME_META["network-error"].filename})</span>}
            style={{ width: 280, maxWidth: "100%", height: 160 }}
          />
        </DemoWindow>
      </section>
      <section className="pg-section" aria-labelledby="gif-inline">
        <h2 id="gif-inline">Inline catalog selection</h2>
        <p data-testid="gif-inline-url" style={{ overflowWrap: "anywhere" }}>
          {inlineUrl}
        </p>
      </section>
    </>
  );
}
