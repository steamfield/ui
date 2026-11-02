import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createSSRApp, defineComponent, h, nextTick, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import type { MotionSource } from "../../playback/motion.ts";
import type { DemoScript } from "../../script/types.ts";
import { compile } from "../../sequencer/compile.ts";
import { presets } from "../../sequencer/timing.ts";
import {
  AgentDemo,
  type AgentDemoProps,
  type AgentDemoSlotState,
  StaticTranscript,
  type ToolCallContext,
  type UseAgentDemoResult,
  useAgentDemo,
} from "./index.ts";

// The same fixtures as the React suite, so both bindings are held to one behavior.
const terminalScript: DemoScript = {
  steps: [
    { kind: "user", text: "Fix the failing test" },
    {
      kind: "tool-call",
      name: "Bash",
      args: 'rr run "go test ./..."',
      output: [{ text: '{"type":"result","status":"success"}', tone: "ok" }],
      more: 3,
    },
    { kind: "agent-text", text: "All green." },
  ],
};

const chatScript: DemoScript = {
  steps: [
    { kind: "user", text: "How many rows are there?" },
    {
      kind: "tool-call",
      name: "query_sql",
      meta: "54 rows",
      body: { kind: "custom", data: { rows: 54 } },
    },
    { kind: "agent-text", text: "There are 54 rows in the table." },
  ],
};

const terminalTimeline = compile(terminalScript, { timing: presets.terminal });
const TOTAL = terminalTimeline.duration;
const startOf = (i: number): number => terminalTimeline.steps[i]?.start ?? 0;

function stubReducedMotion(reduce: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query.includes("reduce"),
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

const wrappers: VueWrapper[] = [];

/** Mounts and waits for the post-mount gate. */
async function mountDemo(
  props: Partial<AgentDemoProps> = {},
  slots: Record<string, unknown> = {},
): Promise<VueWrapper> {
  const wrapper = mount(AgentDemo, {
    props: { script: terminalScript, layout: "terminal", timing: presets.terminal, ...props },
    slots: slots as never,
    attachTo: document.body,
  });
  wrappers.push(wrapper);
  await nextTick();
  return wrapper;
}

const advance = async (ms: number): Promise<void> => {
  vi.advanceTimersByTime(ms);
  await nextTick();
};

const region = (w: VueWrapper): string => w.find('[data-part="transcript"]').text();
function button(w: VueWrapper, name: string) {
  const found = w.findAll("button").find((b) => (b.attributes("aria-label") ?? b.text()) === name);
  if (!found) throw new Error(`no "${name}" button`);
  return found;
}

beforeEach(() => {
  vi.useFakeTimers();
  // A rAF on the fake clock, so the gate's frames advance with vi.advanceTimersByTime.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 16),
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  // No IntersectionObserver: the demo counts as on screen.
  vi.stubGlobal("IntersectionObserver", undefined);
  stubReducedMotion(false);
});

afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("server render", () => {
  test("is the full final transcript, with no animation flag and no controls", async () => {
    vi.stubGlobal("matchMedia", () => {
      throw new Error("matchMedia during render");
    });
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(AgentDemo, { script: terminalScript, layout: "terminal", timing: presets.terminal }),
      }),
    );
    expect(html).toContain("Fix the failing test");
    expect(html).toContain("rr run &quot;go test ./...&quot;");
    expect(html).toContain("… +3 lines");
    expect(html).toContain("All green.");
    expect(html).toMatch(/<div data-sf-agent-demo[ =]/);
    expect(html).not.toContain('class=""');
    expect(html).toContain('data-layout="terminal"');
    expect(html).not.toContain("data-sf-animating");
    expect(html).not.toContain("<button");
    expect(html).toContain('role="status"');
    expect(html).toContain("Example agent session.");
  });

  test("finalPolicy picks what the server shows; StaticTranscript renders statically", async () => {
    const last = await renderToString(
      createSSRApp({ render: () => h(AgentDemo, { script: terminalScript, finalPolicy: "last" }) }),
    );
    expect(last).not.toContain("Fix the failing test");
    expect(last).toContain("All green.");

    const modes: string[] = [];
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(
            StaticTranscript,
            { script: chatScript, privacyClassName: "ph-no-capture", class: "demo" },
            {
              toolBody: (ctx: ToolCallContext) => {
                modes.push(ctx.mode);
                return [
                  h("span", `custom ${(ctx.step.body as { data: { rows: number } }).data.rows}`),
                ];
              },
            },
          ),
      }),
    );
    expect(html).toContain("How many rows are there?");
    expect(html).toContain("custom 54");
    expect(html).toMatch(/class="(ph-no-capture demo|demo ph-no-capture)"/);
    expect(html).toContain("data-static");
    expect(html).not.toContain("<button");
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain('data-part="composer"');
    expect(modes).toEqual(["static"]);
  });

  test("a click position renders that click on the server", async () => {
    const html = await renderToString(
      createSSRApp({
        render: () => h(AgentDemo, { script: mcpBet, position: { click: 1 } }),
      }),
    );
    expect(html).toContain("How many years");
    expect(html).not.toContain("search_datasets");
  });

  test("renders the generic body kinds", () => {
    const wrapper = mount(StaticTranscript, {
      props: {
        layout: "terminal",
        script: {
          steps: [
            { kind: "prompt", text: "~/demo $" },
            { kind: "command", text: "make test" },
            { kind: "output", lines: ["ok", { text: "1 warning", tone: "warn" }], more: 2 },
            { kind: "tool-call", name: "q", body: { kind: "code", code: "select 1", lang: "sql" } },
            {
              kind: "tool-call",
              name: "q2",
              body: { kind: "code", code: "select 2", collapsed: true },
            },
            { kind: "tool-call", name: "plan", body: { kind: "steps", steps: ["one", "two"] } },
            {
              kind: "tool-call",
              name: "fetch",
              status: "error",
              body: { kind: "error", summary: "Timed out" },
            },
            { kind: "tool-call", name: "ls", body: { kind: "lines", lines: ["a"], more: 4 } },
            { kind: "tool-call", name: "x", body: { kind: "custom", data: 1 } },
          ],
        },
      },
    });
    wrappers.push(wrapper);
    const html = wrapper.html({ raw: true });
    expect(html).toContain("~/demo $");
    expect(html).toContain('data-tone="warn"');
    expect(html).toContain("… +2 lines");
    expect(html).toContain('data-lang="sql"');
    expect(html).toMatch(/<details data-part="code-collapse"><summary>Show code<\/summary>/);
    expect(html).toContain('<li data-part="step">two</li>');
    expect(html).toContain('<p data-part="error">Timed out</p>');
    expect(html).toContain('aria-label="Failed"');
    expect(html).toContain("… +4 lines");
  });
});

describe("time mode", () => {
  test("plays steps in order, pausing holds the position, and Replay shows at the end", async () => {
    const w = await mountDemo();
    expect(region(w)).not.toContain("All green.");
    await advance(startOf(1));
    expect(region(w)).toContain("Fix the failing test");
    await button(w, "Pause").trigger("click");
    const held = region(w);
    await advance(5000);
    expect(region(w)).toBe(held);
    expect(w.find("[data-sf-agent-demo]").attributes("data-paused")).toBe("");
    await button(w, "Play").trigger("click");
    await advance(TOTAL);
    expect(region(w)).toContain("All green.");
    expect(region(w)).toContain("… +3 lines");
    expect(button(w, "Replay")).toBeTruthy();
    expect(w.find('[role="status"]').text()).toBe("Demo complete.");
  });

  test("shows the tool as Running before Completed, and the output only once done", async () => {
    const w = await mountDemo();
    await advance(startOf(1) + 100);
    expect(w.find('[aria-label="Running"]').exists()).toBe(true);
    expect(region(w)).not.toContain("success");
    await advance(1000);
    expect(w.find('[aria-label="Completed"]').exists()).toBe(true);
    expect(region(w)).toContain('Bash(rr run "go test ./...")');
    expect(region(w)).toContain("success");
  });

  test("replays from the start without moving focus, and stops when unmounted", async () => {
    const onComplete = vi.fn();
    const w = await mountDemo({ onComplete });
    await advance(TOTAL + 100);
    expect(onComplete).toHaveBeenCalledTimes(1);
    const replay = button(w, "Replay");
    (replay.element as HTMLButtonElement).focus();
    await replay.trigger("click");
    expect(region(w)).not.toContain("All green.");
    expect(button(w, "Pause").element).toBe(document.activeElement);
    await advance(TOTAL + 100);
    expect(onComplete).toHaveBeenCalledTimes(2);
    await button(w, "Replay").trigger("click");
    w.unmount();
    wrappers.splice(wrappers.indexOf(w), 1);
    await advance(TOTAL + 100);
    expect(onComplete).toHaveBeenCalledTimes(2);
  });

  test("holds its position while the tab is hidden", async () => {
    const w = await mountDemo();
    await advance(300);
    const typed = region(w);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await advance(10_000);
    expect(region(w)).toBe(typed);
  });

  test("autoStart false shows the final transcript until Play", async () => {
    const w = await mountDemo({ autoStart: false });
    expect(region(w)).toContain("All green.");
    await button(w, "Play").trigger("click");
    expect(region(w)).not.toContain("All green.");
    await advance(TOTAL);
    expect(region(w)).toContain("All green.");
  });

  test("streams with a caret, then shows thinking dots after the user message", async () => {
    const w = await mountDemo();
    await advance(100);
    expect(region(w)).toContain("Fix");
    expect(region(w)).not.toContain("Fix the failing test");
    expect(w.find('[data-part="caret"]').exists()).toBe(true);
    await advance(startOf(1) - 200);
    expect(w.find('[data-part="thinking"][aria-label="Agent thinking"]').exists()).toBe(true);
  });

  test("onStepStart fires once per step, in order, and again after a replay", async () => {
    const onStepStart = vi.fn();
    const w = await mountDemo({ onStepStart });
    await advance(TOTAL + 100);
    expect(onStepStart.mock.calls.map(([i]) => i)).toEqual([0, 1, 2]);
    expect(onStepStart.mock.calls[1]?.[1]).toBe(terminalScript.steps[1]);
    await button(w, "Replay").trigger("click");
    await advance(TOTAL + 100);
    expect(onStepStart.mock.calls.map(([i]) => i)).toEqual([0, 1, 2, 0, 1, 2]);
  });

  test("full controls: turn jumps, Next and the speed toggle", async () => {
    const twoTurns: DemoScript = {
      steps: [
        { kind: "user", text: "first" },
        { kind: "agent-text", text: "one" },
        { kind: "user", text: "second" },
        { kind: "agent-text", text: "two" },
      ],
    };
    const timeline = compile(twoTurns, { timing: presets.terminal });
    const w = await mountDemo({ script: twoTurns, controls: "full" });
    await advance(10);
    expect(button(w, "1").attributes("aria-current")).toBe("step");
    await button(w, "Next").trigger("click");
    expect(button(w, "2").attributes("aria-current")).toBe("step");
    expect(region(w)).toContain("one");
    await button(w, "1").trigger("click");
    expect(region(w)).not.toContain("one");
    await button(w, "Playback speed 1x").trigger("click");
    expect(button(w, "Playback speed 2x")).toBeTruthy();
    await advance(timeline.duration / 2 + 100);
    expect(region(w)).toContain("two");
    expect((button(w, "Next").element as HTMLButtonElement).disabled).toBe(true);
    await button(w, "2").trigger("click");
    await button(w, "Next").trigger("click");
    expect(button(w, "Replay")).toBeTruthy();
  });

  test("a changed scriptKey starts over; an equal inline script does not", async () => {
    const copy = (): DemoScript => ({ steps: terminalScript.steps.map((s) => ({ ...s })) });
    const w = await mountDemo({ script: copy() });
    await advance(startOf(2) + 10);
    expect(region(w)).toContain("success");
    await w.setProps({ script: copy() });
    await advance(10);
    expect(region(w)).toContain("success");
    await w.setProps({ script: copy(), scriptKey: "b" });
    await advance(10);
    expect(region(w)).not.toContain("success");
  });

  test("announce beats speaks each finished beat; none renders no status", async () => {
    const w = await mountDemo({ announce: "beats" });
    const beats = (): string => w.find('[data-part="beats"][aria-live="polite"]').text();
    expect(beats()).toBe("");
    await advance(startOf(1) + 50);
    expect(beats()).toBe("You: Fix the failing test");
    await advance(TOTAL);
    expect(beats()).toBe("Agent: All green.");
    expect(w.find('[data-part="transcript"]').attributes("aria-live")).toBeUndefined();
    const quiet = await mountDemo({ announce: "none" });
    expect(quiet.find('[role="status"]').exists()).toBe(false);
  });

  test("the chat composer types, then the skeleton crossfades when the tool resolves", async () => {
    const loading: boolean[] = [];
    const w = await mountDemo(
      {
        script: chatScript,
        layout: "chat",
        timing: undefined,
        seed: "s",
        tools: {
          query_sql: {
            label: "Ran query",
            runningLabel: "Running query",
            accent: "red",
            icon: "Q",
          },
        },
      },
      {
        toolBody: (ctx: ToolCallContext) => {
          loading.push(ctx.loading);
          return [h("span", `rows: ${(ctx.step.body as { data: { rows: number } }).data.rows}`)];
        },
      },
    );
    await advance(1100);
    expect(w.find('[data-part="composer"]').text()).toMatch(/^How/);
    expect(w.find('[data-part="composer"]').attributes("aria-hidden")).toBe("true");
    const timeline = compile(chatScript, { seed: "s", composer: true });
    await advance((timeline.steps[1]?.start ?? 0) - 1100 + 50);
    expect(w.text()).toContain("Running query");
    expect(w.find('[data-part="skeleton"][data-state="loading"]').exists()).toBe(true);
    await advance(1000);
    expect(w.text()).toContain("Ran query");
    expect(w.find('[data-part="skeleton"][data-state="leaving"]').exists()).toBe(true);
    await advance(400);
    expect(w.find('[data-part="skeleton"]').exists()).toBe(false);
    expect(loading).toContain(true);
    expect(loading.at(-1)).toBe(false);
    const card = w.find('[data-part="tool-call"]').element as HTMLElement;
    expect(card.style.getPropertyValue("--sf-tool-accent")).toBe("red");
    expect(w.find('[data-part="tool-icon"]').text()).toBe("Q");
  });
});

describe("reduced motion", () => {
  test("shows the final transcript with no button, no animation and no 'complete'", async () => {
    stubReducedMotion(true);
    const onComplete = vi.fn();
    const w = await mountDemo({ onComplete });
    expect(region(w)).toContain("Fix the failing test");
    expect(region(w)).toContain("… +3 lines");
    expect(region(w)).toContain("All green.");
    expect(w.find("button").exists()).toBe(false);
    expect(w.find('[role="status"]').text()).toBe("Example agent session.");
    expect(w.find("[data-sf-animating]").exists()).toBe(false);
    await advance(TOTAL);
    expect(onComplete).not.toHaveBeenCalled();
  });

  test("in click mode it still follows the clicks, without entrance animation", async () => {
    stubReducedMotion(true);
    const w = await mountDemo({ script: mcpBet, position: { click: 1 } });
    expect(region(w)).toContain("How many years");
    expect(region(w)).not.toContain("search_datasets");
    expect(w.find("[data-sf-animating]").exists()).toBe(false);
  });
});

describe("slots and labels", () => {
  test("toolCall replaces a card; rendering nothing keeps the default", async () => {
    const seen: Array<Pick<ToolCallContext, "index" | "mode" | "loading">> = [];
    const w = await mountDemo(
      { script: mcpBet, layout: "chat", position: { click: 5 } },
      {
        toolCall: (ctx: ToolCallContext) => {
          seen.push({ index: ctx.index, mode: ctx.mode, loading: ctx.loading });
          return ctx.step.name === "openchart"
            ? [h("figure", { "data-testid": "chart" }, "chart here")]
            : [];
        },
      },
    );
    expect(w.find('[data-testid="chart"]').text()).toBe("chart here");
    expect(w.findAll('[data-part="tool-call"]')).toHaveLength(1);
    expect(w.find('[data-part="tool-call"]').attributes("data-tool")).toBe("search_datasets");
    expect(seen.at(-1)).toEqual({ index: 2, mode: "live", loading: false });
  });

  test("stage gets the view; header and controls slots replace the defaults", async () => {
    const w = await mountDemo(
      {},
      {
        stage: ({ view }: { view: { entries: unknown[] } }) => [
          h("output", { "data-testid": "stage" }, String(view.entries.length)),
        ],
        header: () => [h("span", "Title")],
        controls: (state: AgentDemoSlotState) => [
          h("button", { type: "button", onClick: state.controls.cancel }, "Skip"),
        ],
      },
    );
    expect(w.find('[data-testid="stage"]').text()).toBe("1");
    expect(w.find('[data-part="header"]').text()).toContain("Title");
    await button(w, "Skip").trigger("click");
    expect(region(w)).toContain("All green.");
    expect(w.find('[data-testid="stage"]').text()).toBe("3");
  });

  test("labels and glyphs override the defaults", async () => {
    const w = await mountDemo({
      labels: { pause: "Stop", transcript: "Session", idleStatus: "Sample run." },
      glyphs: { agent: "*" },
    });
    expect(button(w, "Stop")).toBeTruthy();
    expect(w.find('[data-part="transcript"]').attributes("aria-label")).toBe("Session");
    expect(w.find('[role="status"]').text()).toBe("Sample run.");
    await advance(TOTAL);
    expect(region(w)).toContain("*");
  });

  test("chrome wraps the demo in a window with the controls in its title bar", async () => {
    const w = await mountDemo({ chrome: { title: "session" }, header: "Header" });
    const bar = w.find('[data-part="window-bar"]');
    expect(bar.text()).toContain("session");
    expect(bar.find('[data-control="play"]').text()).toBe("Pause");
    expect(w.find('[data-part="window-body"] [data-part="header"]').text()).toBe("Header");
    expect(w.find("h1, h2, h3").exists()).toBe(false);
    const plain = await mountDemo({ chrome: true, controls: "none" });
    expect(plain.find('[data-part="window-title"]').exists()).toBe(false);
    expect(plain.find('[data-part="window-controls"]').exists()).toBe(false);
  });
});

// The talks mcp-bet-demo beat structure (from src/sequencer/clicks.test.ts): five clicks, and the
// search hits are a body gated on their own `at`.
type TalksBody = { kind: "hits"; hits: string[] } | { kind: "chart"; tag?: string };
const mcpBet: DemoScript<TalksBody> = {
  id: "mcp-bet",
  steps: [
    { kind: "user", at: 1, text: "How many years of salary did a house cost in 1985 vs today?" },
    {
      kind: "tool-call",
      at: 2,
      server: "opendata",
      name: "search_datasets",
      args: 'queries: ["median home sale price", "median household income"]',
      body: { kind: "custom", at: 3, data: { kind: "hits", hits: ["home-price", "income"] } },
    },
    {
      kind: "tool-call",
      at: 4,
      server: "opendata",
      name: "openchart",
      args: 'kind: "line"',
      body: { kind: "custom", data: { kind: "chart", tag: "sandboxed iframe" } },
    },
    { kind: "agent-text", at: 5, text: "In 1985 it took about 3.6 years of income; in 2024, 5." },
  ],
};

const hitsSlot = {
  toolBody: (ctx: ToolCallContext<TalksBody>) => {
    const body = ctx.step.body;
    if (body?.kind !== "custom" || body.data.kind !== "hits") return [];
    return body.data.hits.map((hit) => h("div", { "data-hit": hit }, hit));
  },
};

describe("click mode (mcp-bet-demo beats)", () => {
  test("each click shows its beats and bodies, forward, backward and jumping to the end", async () => {
    const clicks = compile(mcpBet).clickCount;
    expect(clicks).toBe(5);
    const w = await mountDemo(
      { script: mcpBet, layout: "terminal", position: { click: 0 } },
      hitsSlot,
    );
    const at = async (click: number): Promise<string> => {
      await w.setProps({ position: { click } });
      return region(w);
    };
    expect(await at(0)).toBe("");
    expect(w.find("button").exists()).toBe(false);
    expect(await at(1)).toContain("How many years");
    expect(await at(2)).toContain("opendata search_datasets");
    expect(w.find('[aria-label="Running"]').exists()).toBe(true);
    expect(w.find("[data-hit]").exists()).toBe(false);
    await advance(5000);
    expect(w.find("[data-hit]").exists()).toBe(false);
    await at(3);
    expect(w.findAll("[data-hit]").map((n) => n.text())).toEqual(["home-price", "income"]);
    expect(w.find('[aria-label="Running"]').exists()).toBe(false);
    expect(await at(4)).toContain("opendata openchart");
    expect(await at(1)).not.toContain("search_datasets");
    expect(await at(clicks)).toContain("In 1985 it took about 3.6 years");
    expect(w.findAll("[data-hit]")).toHaveLength(2);
    expect(w.find('[role="status"]').text()).toBe("Demo complete.");
    expect(w.find("[data-sf-animating]").exists()).toBe(true);
  });

  test("the composable follows a click getter and counts slide entries (the Slidev adapter)", async () => {
    // Stand-ins for Slidev's `$clicks` and `useIsSlideActive()`.
    const $clicks = ref(0);
    const isActive = ref(true);
    let demo: UseAgentDemoResult<TalksBody> | undefined;
    const Probe = defineComponent(() => {
      const result = useAgentDemo(mcpBet, {
        position: () => ({ click: $clicks.value }),
        active: isActive,
      });
      demo = result;
      return () =>
        h(
          "div",
          { key: result.playCount.value, ref: result.el },
          String(result.view.value.entries.length),
        );
    });
    const w = mount(Probe);
    wrappers.push(w);
    await nextTick();
    expect(demo?.playCount.value).toBe(1);
    expect(w.text()).toBe("0");
    $clicks.value = 2;
    await nextTick();
    expect(w.text()).toBe("2");
    expect(demo?.view.value.entries[1]?.bodyVisible).toBe(false);
    $clicks.value = 5;
    await nextTick();
    expect(demo?.complete.value).toBe(true);
    const first = w.element;
    isActive.value = false;
    await nextTick();
    isActive.value = true;
    await flushPromises();
    expect(demo?.playCount.value).toBe(2);
    expect(w.element).not.toBe(first);
  });

  test("AgentDemo remounts its root on re-entry so entrances play again", async () => {
    const w = await mountDemo({ script: mcpBet, position: { click: 1 }, active: true });
    const first = w.find("[data-sf-agent-demo]").element;
    await w.setProps({ active: false });
    expect(w.find("[data-sf-agent-demo]").element).toBe(first);
    await w.setProps({ active: true });
    await nextTick();
    expect(w.find("[data-sf-agent-demo]").element).not.toBe(first);
    expect(region(w)).toContain("How many years");
  });
});

describe("useAgentDemo", () => {
  test("seek, cancel, pause and setSpeed drive the view", async () => {
    let demo: UseAgentDemoResult | undefined;
    const Probe = defineComponent(() => {
      const result = useAgentDemo(terminalScript, { timing: presets.terminal, autoStart: false });
      demo = result;
      return () => h("div", { ref: result.el });
    });
    wrappers.push(mount(Probe));
    expect(demo?.mode.value).toBe("static");
    await nextTick();
    expect(demo?.ready.value).toBe(true);
    expect(demo?.animating.value).toBe(false);
    expect(demo?.turn.value).toBe(-1);
    demo?.controls.seek(startOf(2));
    expect(demo?.animating.value).toBe(true);
    expect(demo?.view.value.current).toBe(2);
    expect(demo?.turn.value).toBe(0);
    demo?.controls.setSpeed(2);
    await nextTick();
    expect(demo?.speed.value).toBe(2);
    demo?.controls.play();
    await advance(200);
    expect(demo?.playing.value).toBe(true);
    demo?.controls.pause();
    expect(demo?.paused.value).toBe(true);
    demo?.controls.cancel();
    expect(demo?.complete.value).toBe(true);
    expect(demo?.view.value.complete).toBe(true);
  });

  test("setSpeed rejects an invalid rate at the call site and keeps the current one", async () => {
    let demo: UseAgentDemoResult | undefined;
    const Probe = defineComponent(() => {
      const result = useAgentDemo(terminalScript, { autoStart: false });
      demo = result;
      return () => h("div", { ref: result.el });
    });
    wrappers.push(mount(Probe));
    await nextTick();
    expect(() => demo?.controls.setSpeed(0)).toThrow(
      expect.objectContaining({ code: "invalid_option", field: "speed" }),
    );
    await nextTick();
    expect(demo?.speed.value).toBe(1);
    demo?.controls.play();
    await advance(200);
    expect(demo?.playing.value).toBe(true);
  });

  test("follows a changed speed option and keeps a script it can't serialize", async () => {
    const data: { self?: unknown } = {};
    data.self = data;
    const script: DemoScript<typeof data> = {
      steps: [{ kind: "tool-call", name: "x", body: { kind: "custom", data } }],
    };
    const speed = ref(1);
    let demo: UseAgentDemoResult<typeof data> | undefined;
    const Probe = defineComponent(() => {
      const result = useAgentDemo(script, () => ({ speed: speed.value }));
      demo = result;
      return () => h("div", { ref: result.el });
    });
    wrappers.push(mount(Probe));
    const first = demo?.timeline.value;
    speed.value = 3;
    await nextTick();
    expect(demo?.speed.value).toBe(3);
    expect(demo?.timeline.value).toBe(first);
  });

  test("setSpeed before the gate exists checks the rate and seeds the gate", async () => {
    let demo: UseAgentDemoResult | undefined;
    let early: unknown;
    const Probe = defineComponent(() => {
      const result = useAgentDemo(terminalScript, { autoStart: false });
      try {
        result.controls.setSpeed(0);
      } catch (error) {
        early = error;
      }
      result.controls.setSpeed(2);
      demo = result;
      return () => h("div", { ref: result.el });
    });
    wrappers.push(mount(Probe));
    expect(early).toEqual(expect.objectContaining({ code: "invalid_option", field: "speed" }));
    await nextTick();
    expect(demo?.ready.value).toBe(true);
    expect(demo?.speed.value).toBe(2);
  });

  test("hidden tools in the registry take no time", async () => {
    const hidden = ref(false);
    let demo: UseAgentDemoResult | undefined;
    const Probe = defineComponent(() => {
      const result = useAgentDemo(terminalScript, () => ({
        timing: presets.terminal,
        tools: { Bash: { hidden: hidden.value } },
      }));
      demo = result;
      return () => h("div", { ref: result.el });
    });
    wrappers.push(mount(Probe));
    const shown = demo?.timeline.value;
    hidden.value = true;
    await nextTick();
    const bash = demo?.timeline.value.steps[1];
    expect(bash?.end).toBe(bash?.start);
    expect(demo?.timeline.value.duration ?? 0).toBeLessThan(shown?.duration ?? 0);
  });
});

/** A site motion toggle the test flips by hand. */
function motionToggle(): MotionSource & { set(allowed: boolean): Promise<void> } {
  let allowed = true;
  const listeners = new Set<() => void>();
  return {
    get: () => allowed,
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    async set(next) {
      allowed = next;
      for (const cb of listeners) cb();
      await nextTick();
    },
  };
}

describe("completion, reduced motion and the play label", () => {
  test("reducedPolicy hold freezes the frame playback reached and resumes from it", async () => {
    const motion = motionToggle();
    const w = await mountDemo({ motion, reducedPolicy: "hold" });
    await advance(startOf(1) + 50);
    const frame = region(w);
    expect(frame).not.toContain("All green.");
    await motion.set(false);
    await advance(5000);
    expect(region(w)).toBe(frame);
    await motion.set(true);
    await advance(TOTAL);
    expect(region(w)).toContain("All green.");
  });

  test("reduced motion on and off mid-play neither completes nor announces complete", async () => {
    const motion = motionToggle();
    const onComplete = vi.fn();
    const w = await mountDemo({ motion, onComplete });
    await advance(startOf(1));
    await motion.set(false);
    await motion.set(true);
    await advance(100);
    expect(onComplete).not.toHaveBeenCalled();
    expect(w.find('[role="status"]').text()).toBe("Example agent session.");
    await button(w, "Replay").trigger("click");
    await advance(TOTAL + 100);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(w.find('[role="status"]').text()).toBe("Demo complete.");
  });

  test("a seek or cancel before play keeps started false and fires no onComplete", async () => {
    const onComplete = vi.fn();
    let demo: UseAgentDemoResult | undefined;
    const Probe = defineComponent(() => {
      const result = useAgentDemo(terminalScript, {
        timing: presets.terminal,
        autoStart: false,
        onComplete,
      });
      demo = result;
      return () => h("div", { ref: result.el });
    });
    wrappers.push(mount(Probe));
    await nextTick();
    demo?.controls.seek(startOf(2));
    await nextTick();
    expect(demo?.started.value).toBe(false);
    expect(demo?.playing.value).toBe(false);
    expect(demo?.animating.value).toBe(true);
    expect(demo?.view.value.current).toBe(2);
    demo?.controls.cancel();
    await nextTick();
    expect(demo?.started.value).toBe(false);
    expect(demo?.complete.value).toBe(true);
    expect(onComplete).not.toHaveBeenCalled();
  });

  test("the controls slot sees started stay false after a seek before play", async () => {
    const w = await mountDemo(
      { autoStart: false },
      {
        controls: (state: AgentDemoSlotState) => [
          h(
            "button",
            { type: "button", onClick: () => state.controls.seek(startOf(2)) },
            `Seek ${state.started ? "started" : "idle"}`,
          ),
        ],
      },
    );
    await button(w, "Seek idle").trigger("click");
    expect(button(w, "Seek idle")).toBeTruthy();
    expect(region(w)).toContain("Fix the failing test");
  });

  test("the content signature is computed once per input, not on every update", async () => {
    let reads = 0;
    const step = {
      kind: "agent-text" as const,
      get text() {
        reads++;
        return "Streaming a reply word by word.";
      },
    };
    const script: DemoScript = { steps: [step] };
    const w = await mountDemo({ script, header: "a" });
    const before = reads;
    await w.setProps({ header: "b" });
    await advance(2000);
    expect(reads).toBe(before);
  });

  test("hidden in tools drops a tool's cards", async () => {
    const w = await mountDemo({
      script: chatScript,
      layout: "chat",
      tools: { query_sql: { hidden: true } },
    });
    await advance(20_000);
    expect(w.find('[data-part="tool-call"]').exists()).toBe(false);
    expect(region(w)).toContain("There are 54 rows");
  });
});
