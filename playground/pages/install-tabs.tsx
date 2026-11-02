import { InstallTabs } from "@steamfield/ui/react/install-tabs";
import { type ReactElement, useState } from "react";

const options = [
  { id: "npm", label: "npm", command: "npm install example-package", note: "Works with Node 20+." },
  { id: "pnpm", label: "pnpm", command: "pnpm add example-package" },
  { id: "bun", label: "bun", command: "bun add example-package" },
];

export function InstallTabsPage(): ReactElement {
  const [last, setLast] = useState("No events yet.");
  return (
    <>
      <h1>install-tabs</h1>
      <section className="pg-section" aria-labelledby="it-main">
        <h2 id="it-main">Three install methods</h2>
        <InstallTabs
          id="pg-install-tabs"
          options={options}
          onCopy={(id, ok) => setLast(`copy ${id}: ${ok ? "ok" : "failed"}`)}
        />
        <p>
          Last event: <output data-testid="last-event">{last}</output>
        </p>
      </section>
    </>
  );
}
