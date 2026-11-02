import { Tab, TabList, TabPanel, Tabs } from "@steamfield/ui/react/tabs";
import { createTabs } from "@steamfield/ui/tabs";
import { type ReactElement, useEffect, useRef } from "react";

function DomTabs(): ReactElement {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => (root.current ? createTabs(root.current) : undefined), []);
  return (
    <div ref={root} data-part="tabs">
      <div role="tablist" aria-label="Plain DOM sections">
        <a role="tab" href="#pg-dom-first" id="pg-dom-first-tab" data-part="tab">
          First
        </a>
        <a role="tab" href="#pg-dom-second" id="pg-dom-second-tab" data-part="tab">
          Second
        </a>
        <a role="tab" href="#pg-dom-third" id="pg-dom-third-tab" data-part="tab">
          Third
        </a>
      </div>
      {["first", "second", "third"].map((name) => (
        <div
          key={name}
          id={`pg-dom-${name}`}
          role="tabpanel"
          aria-labelledby={`pg-dom-${name}-tab`}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: APG tabs make the panel focusable.
          tabIndex={0}
          data-part="tab-panel"
        >
          <p>Plain markup panel: {name}.</p>
        </div>
      ))}
    </div>
  );
}

export function TabsPage(): ReactElement {
  return (
    <>
      <h1>tabs</h1>
      <section className="pg-section" aria-labelledby="tabs-horizontal">
        <h2 id="tabs-horizontal">Horizontal, auto activation, hash replace</h2>
        <Tabs id="pg-h" hash="replace">
          <TabList aria-label="Horizontal sections">
            <Tab value="overview">Overview</Tab>
            <Tab value="usage">Usage</Tab>
            <Tab value="notes">Notes</Tab>
          </TabList>
          <TabPanel value="overview">
            <p>A short overview of the section.</p>
          </TabPanel>
          <TabPanel value="usage">
            <p>Usage details for the section.</p>
          </TabPanel>
          <TabPanel value="notes">
            <p>Extra notes for the section.</p>
          </TabPanel>
        </Tabs>
      </section>
      <section className="pg-section" aria-labelledby="tabs-vertical">
        <h2 id="tabs-vertical">Vertical, manual activation, one disabled</h2>
        <Tabs id="pg-v" orientation="vertical" activation="manual" className="pg-vertical">
          <TabList aria-label="Vertical sections">
            <Tab value="alpha">Alpha</Tab>
            <Tab value="beta">Beta</Tab>
            <Tab value="archived" disabled>
              Archived
            </Tab>
            <Tab value="gamma">Gamma</Tab>
          </TabList>
          <div>
            <TabPanel value="alpha">
              <p>Alpha panel.</p>
            </TabPanel>
            <TabPanel value="beta">
              <p>Beta panel.</p>
            </TabPanel>
            <TabPanel value="archived">
              <p>Archived panel.</p>
            </TabPanel>
            <TabPanel value="gamma">
              <p>Gamma panel.</p>
            </TabPanel>
          </div>
        </Tabs>
      </section>
      <section className="pg-section" aria-labelledby="tabs-dom">
        <h2 id="tabs-dom">createTabs on plain DOM</h2>
        <DomTabs />
      </section>
    </>
  );
}
