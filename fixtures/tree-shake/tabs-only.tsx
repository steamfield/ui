// Imports only React tabs. Copy, the agent demo and reveal must stay out of the bundle.
import { Tab, TabList, TabPanel, Tabs } from "@steamfield/ui/react/tabs";
import { createRoot } from "react-dom/client";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <Tabs id="x">
      <TabList aria-label="Tabs">
        <Tab value="a">A</Tab>
      </TabList>
      <TabPanel value="a">A</TabPanel>
    </Tabs>,
  );
}
