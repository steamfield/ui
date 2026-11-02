// The markup contract: the Vue binding renders the same elements, `data-part` values, `data-*`,
// ARIA attributes and text as the React one, so `agent-demo/styles.css` styles both. Each case
// renders one script with both bindings and compares a flattened outline of the DOM.
import { act, cleanup, render as renderReact } from "@testing-library/react";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createSSRApp, h, nextTick } from "vue";
import { renderToString } from "vue/server-renderer";
import {
  AgentDemo as ReactAgentDemo,
  StaticTranscript as ReactStaticTranscript,
} from "../../react/agent-demo/index.ts";
import type { DemoScript } from "../../script/types.ts";
import { compile } from "../../sequencer/compile.ts";
import { presets } from "../../sequencer/timing.ts";
import { AgentDemo, StaticTranscript } from "./index.ts";

const everyKind: DemoScript = {
  steps: [
    { kind: "user", text: "Run the checks" },
    { kind: "prompt", text: "~/demo $" },
    { kind: "command", text: "make test" },
    { kind: "output", lines: ["ok", { text: "1 warning", tone: "warn" }, ""], more: 2 },
    { kind: "thinking", ms: 300 },
    { kind: "agent-text", lead: "Note:", text: "one warning left." },
    {
      kind: "tool-call",
      name: "query_sql",
      server: "db",
      args: "select 1",
      output: ["1 row"],
      body: { kind: "code", code: "select 1", lang: "sql" },
    },
    {
      kind: "tool-call",
      name: "q2",
      args: "select 2",
      meta: "2 rows",
      body: { kind: "code", code: "x", collapsed: true },
    },
    { kind: "tool-call", name: "plan", body: { kind: "steps", steps: ["one", "two"] } },
    {
      kind: "tool-call",
      name: "fetch",
      status: "error",
      body: { kind: "error", summary: "Timed out" },
    },
    { kind: "tool-call", name: "ls", body: { kind: "lines", lines: ["a"], more: 4 } },
    { kind: "tool-call", name: "deploy", status: "error" },
    { kind: "tool-call", name: "secret", args: "never shown" },
  ],
};

const mcpBet: DemoScript = {
  id: "mcp-bet",
  steps: [
    { kind: "user", at: 1, text: "How many years of salary did a house cost in 1985 vs today?" },
    {
      kind: "tool-call",
      at: 2,
      server: "opendata",
      name: "search_datasets",
      args: 'queries: ["median home sale price", "median household income"]',
      body: { kind: "lines", at: 3, lines: ["home-price", "income"] },
    },
    { kind: "tool-call", at: 4, server: "opendata", name: "openchart", args: 'kind: "line"' },
    { kind: "agent-text", at: 5, text: "In 1985 it took about 3.6 years of income; in 2024, 5." },
  ],
};

const tools = {
  query_sql: { label: "Ran query", runningLabel: "Running query", icon: "Q" },
  secret: { hidden: true },
};

/** Every element in document order: tag, then each attribute but `style`, sorted; then the text. */
function outline(root: Element): { elements: string[]; text: string } {
  const elements = [...root.querySelectorAll("*")].map((el) => {
    const attrs = [...el.attributes]
      .filter((a) => a.name !== "style")
      .map((a) => `${a.name}=${a.value}`)
      .sort();
    return `${el.tagName.toLowerCase()} ${attrs.join(" ")}`;
  });
  return { elements, text: root.textContent ?? "" };
}

function parse(html: string): Element {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
}

const parts = (o: { elements: string[] }): string[] =>
  o.elements.map((e) => /data-part=(\S+)/.exec(e)?.[1]).filter((p) => p !== undefined);

const vueWrappers: VueWrapper[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IntersectionObserver", undefined);
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

afterEach(() => {
  cleanup();
  for (const w of vueWrappers.splice(0)) w.unmount();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe.each([
  ["chat", everyKind],
  ["terminal", everyKind],
  ["chat", mcpBet],
  ["terminal", mcpBet],
] as const)("server markup, %s layout", (layout, script) => {
  test("StaticTranscript matches React", async () => {
    const react = parse(
      renderToStaticMarkup(createElement(ReactStaticTranscript, { script, layout, tools })),
    );
    const vue = parse(
      await renderToString(
        createSSRApp({ render: () => h(StaticTranscript, { script, layout, tools }) }),
      ),
    );
    expect(parts(outline(vue)).length).toBeGreaterThan(10);
    expect(outline(vue)).toEqual(outline(react));
    const transcript = vue.querySelector('[data-part="transcript"]');
    expect(transcript?.tagName).toBe("DIV");
    expect(transcript?.getAttribute("role")).toBe("group");
    expect(vue.querySelector("section")).toBeNull();
    expect(vue.textContent).not.toContain("never shown");
    if (script === everyKind) {
      const q2 = vue.querySelector('[data-tool="q2"]');
      expect(q2?.querySelector('[data-part="tool-args"]')?.textContent).toContain("select 2");
      expect(q2?.querySelector('[data-part="tool-meta"]')?.textContent).toBe("2 rows");
    }
  });

  test("AgentDemo's server render matches React, with chrome, header and beats", async () => {
    const props = {
      script,
      layout,
      tools,
      chrome: { title: "session" },
      header: "Header",
      announce: "beats",
      timing: presets.terminal,
    } as const;
    const react = parse(renderToStaticMarkup(createElement(ReactAgentDemo, props)));
    const vue = parse(await renderToString(createSSRApp({ render: () => h(AgentDemo, props) })));
    expect(outline(vue)).toEqual(outline(react));
  });
});

describe("live markup", () => {
  test("click mode matches React at every click, both ways", async () => {
    const clicks = compile(mcpBet).clickCount;
    for (const layout of ["chat", "terminal"] as const) {
      const react = renderReact(
        createElement(ReactAgentDemo, { script: mcpBet, layout, position: { click: 0 } }),
      );
      const vue = mount(AgentDemo, { props: { script: mcpBet, layout, position: { click: 0 } } });
      vueWrappers.push(vue);
      await nextTick();
      for (const click of [0, 1, 2, 3, 4, clicks, 2, 0, clicks]) {
        react.rerender(
          createElement(ReactAgentDemo, { script: mcpBet, layout, position: { click } }),
        );
        await vue.setProps({ position: { click } });
        expect(outline(vue.element.parentElement as Element)).toEqual(outline(react.container));
      }
      expect(vue.text()).toContain("In 1985 it took");
      expect(vue.find("[data-sf-animating]").exists()).toBe(true);
      cleanup();
    }
  });

  test("time mode matches React frame by frame, controls included", async () => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
      setTimeout(() => cb(performance.now()), 16),
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
    for (const layout of ["terminal", "chat"] as const) {
      const props = {
        script: everyKind,
        layout,
        timing: presets.terminal,
        controls: "full",
        announce: "beats",
        tools,
      } as const;
      const react = renderReact(createElement(ReactAgentDemo, props));
      const vue = mount(AgentDemo, { props });
      vueWrappers.push(vue);
      await nextTick();
      const duration = compile(everyKind, { timing: presets.terminal }).duration;
      const beats = new Set<string>();
      for (let t = 0; t <= duration + 400; t += 200) {
        expect(outline(vue.element.parentElement as Element)).toEqual(outline(react.container));
        beats.add(vue.find('[data-part="beats"]').text());
        act(() => {
          vi.advanceTimersByTime(200);
        });
        await nextTick();
      }
      expect(vue.text()).toContain("Timed out");
      expect(vue.find('[data-control="play"]').text()).toBe("Replay");
      // The announcement names a tool the way its header does in that layout.
      const header = layout === "terminal" ? "db query_sql: Completed" : "Ran query: Completed";
      expect(beats).toContain(header);
      expect([...beats].some((beat) => beat.startsWith("secret"))).toBe(false);
      cleanup();
    }
  });
});
