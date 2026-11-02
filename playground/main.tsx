import { type ReactElement, StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { AgentDemoPage } from "./pages/agent-demo.tsx";
import { CopyPage } from "./pages/copy.tsx";
import { InstallTabsPage } from "./pages/install-tabs.tsx";
import { MarkdownPage } from "./pages/markdown.tsx";
import { PlaybackPage } from "./pages/playback.tsx";
import { RevealPage } from "./pages/reveal.tsx";
import { TabsPage } from "./pages/tabs.tsx";
import { VueAgentDemoPage } from "./pages/vue-agent-demo.tsx";
import { WindowPage } from "./pages/window.tsx";
import { ROUTES, type Route } from "./routes.ts";

// One page per component. Each page renders sample scripts and content for manual QA; the
// Playwright suite in tests/browser/ loads every route in light, dark and reduced-motion modes.
// The page is picked from the hash (#/copy), so the static build needs no server routing.
const pages: Record<Route, () => ReactElement> = {
  copy: CopyPage,
  "agent-demo": AgentDemoPage,
  "vue-agent-demo": VueAgentDemoPage,
  window: WindowPage,
  tabs: TabsPage,
  "install-tabs": InstallTabsPage,
  reveal: RevealPage,
  playback: PlaybackPage,
  markdown: MarkdownPage,
};

function current(): Route {
  const name = location.hash.replace(/^#\/?/, "").split("?")[0] ?? "";
  return ROUTES.find((route) => route === name) ?? ROUTES[0];
}

function App(): ReactElement {
  const [page, setPage] = useState(current);
  useEffect(() => {
    const sync = (): void => setPage(current());
    addEventListener("hashchange", sync);
    return () => removeEventListener("hashchange", sync);
  }, []);
  useEffect(() => {
    const theme = new URLSearchParams(location.search).get("theme");
    if (theme) document.documentElement.dataset.theme = theme;
  }, []);
  const Page = pages[page];
  return (
    <div className="pg-shell">
      <nav className="pg-nav" aria-label="Components">
        {ROUTES.map((name) => (
          <a key={name} href={`#/${name}`} aria-current={name === page ? "page" : undefined}>
            {name}
          </a>
        ))}
      </nav>
      <main className="pg-main" key={page}>
        <Page />
      </main>
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
