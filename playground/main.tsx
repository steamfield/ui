import { type ReactElement, StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { CopyPage } from "./pages/copy.tsx";

// One page per component. Each page renders sample scripts and content for manual QA; the
// Playwright suite in tests/browser/ loads every route in light, dark and reduced-motion modes.
// The page is picked from the hash (#/copy), so the static build needs no server routing.
const pages: Record<string, () => ReactElement> = {
  copy: CopyPage,
};

function current(): string {
  const name = location.hash.replace(/^#\/?/, "").split("?")[0] ?? "";
  return name in pages ? name : (Object.keys(pages)[0] ?? "");
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
  const Page = pages[page] ?? CopyPage;
  return (
    <div className="pg-shell">
      <nav className="pg-nav" aria-label="Components">
        {Object.keys(pages).map((name) => (
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
