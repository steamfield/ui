import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  within,
} from "@testing-library/react";
import { Activity, StrictMode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  FakeIntersectionObserver,
  setTabHidden as hideTab,
  stubIntersectionObserver,
  stubReducedMotion,
} from "../../../tests/helpers/dom.ts";
import type { MotionSource } from "../../playback/motion.ts";
import type { DemoScript } from "../../script/types.ts";
import { compile } from "../../sequencer/compile.ts";
import { presets } from "../../sequencer/timing.ts";
import {
  AgentDemo,
  type AgentDemoProps,
  StaticTranscript,
  type ToolCallContext,
  useAgentDemo,
} from "./index.ts";

// rr's terminal script, with a duplicate command so keys can't come from text.
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

const chatScript: DemoScript<{ rows: number }> = {
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

const advance = (ms: number): void =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

const setTabHidden = (hidden: boolean): void => act(() => hideTab(hidden));

function Terminal(props: Partial<AgentDemoProps>) {
  return (
    <AgentDemo script={terminalScript} layout="terminal" timing={presets.terminal} {...props} />
  );
}

function Probe() {
  const demo = useAgentDemo(terminalScript);
  return <span>{`${demo.ready}:${demo.view.entries.length}:${demo.mode}`}</span>;
}

const region = () => screen.getByRole("group", { name: "Demo transcript" });

beforeEach(() => {
  vi.useFakeTimers();
  // No IntersectionObserver: the demo counts as on screen.
  vi.stubGlobal("IntersectionObserver", undefined);
  stubReducedMotion(false);
});

/** `Terminal` inside an Activity, whose hiding disconnects the demo and showing resumes it. */
function HiddenTerminal({
  mode,
  ...props
}: { mode: "visible" | "hidden" } & Partial<AgentDemoProps>) {
  return (
    <Activity mode={mode}>
      <Terminal {...props} />
    </Activity>
  );
}

/** Hides and shows the demo, asserting the transcript, label, data-complete and status hold. */
function hideAndShow(
  rerender: (ui: React.ReactElement) => void,
  props: Partial<AgentDemoProps>,
  label: string,
): void {
  const root = document.querySelector("[data-sf-agent-demo]");
  const before = {
    text: region().textContent,
    complete: root?.getAttribute("data-complete"),
    status: screen.getByRole("status").textContent,
  };
  rerender(<HiddenTerminal mode="hidden" {...props} />);
  rerender(<HiddenTerminal mode="visible" {...props} />);
  expect(region().textContent).toBe(before.text);
  expect(screen.getByRole("button", { name: label })).toBeTruthy();
  expect(document.querySelector("[data-sf-agent-demo]")?.getAttribute("data-complete")).toBe(
    before.complete,
  );
  expect(screen.getByRole("status").textContent).toBe(before.status);
}

describe("server render", () => {
  test("is the full final transcript, with no animation flag and no controls", () => {
    vi.stubGlobal("matchMedia", () => {
      throw new Error("matchMedia during render");
    });
    const html = renderToStaticMarkup(<Terminal />);
    expect(html).toContain("Fix the failing test");
    expect(html).toContain("rr run &quot;go test ./...&quot;");
    expect(html).toContain("… +3 lines");
    expect(html).toContain("All green.");
    expect(html).toContain('data-sf-agent-demo=""');
    expect(html).toContain('data-layout="terminal"');
    expect(html).not.toContain("data-sf-animating");
    expect(html).not.toContain("<button");
    expect(html).toContain('role="status"');
    expect(html).toContain("Example agent session.");
  });

  test("finalPolicy picks what the server shows", () => {
    const html = renderToStaticMarkup(<Terminal finalPolicy="last" />);
    expect(html).not.toContain("Fix the failing test");
    expect(html).toContain("All green.");
  });

  test("StaticTranscript renders the same parts with mode static and nothing interactive", () => {
    const modes: string[] = [];
    const html = renderToStaticMarkup(
      <StaticTranscript
        script={chatScript}
        className="demo"
        privacyClassName="ph-no-capture"
        renderToolBody={(ctx) => {
          modes.push(ctx.mode);
          return (
            <span>custom {String((ctx.step.body as { data: { rows: number } }).data.rows)}</span>
          );
        }}
      />,
    );
    expect(html).toContain("How many rows are there?");
    expect(html).toContain("custom 54");
    expect(html).toContain('class="demo ph-no-capture"');
    expect(html).not.toContain("<button");
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain('data-part="composer"');
    expect(modes).toEqual(["static"]);
  });

  test("renders the generic body kinds", () => {
    const html = renderToStaticMarkup(
      <StaticTranscript
        layout="terminal"
        script={{
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
        }}
      />,
    );
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

describe("playback (terminal)", () => {
  test("plays steps in order, pausing holds the position, and Replay shows at the end", () => {
    render(<Terminal />);
    expect(region().textContent).not.toContain("All green.");
    advance(startOf(1));
    expect(region().textContent).toContain("Fix the failing test");
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    const held = region().textContent;
    advance(5000);
    expect(region().textContent).toBe(held);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    advance(TOTAL);
    expect(region().textContent).toContain("All green.");
    expect(region().textContent).toContain("… +3 lines");
    expect(screen.getByRole("button", { name: "Replay" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Demo complete.");
  });

  test("sets data-sf-animating once hydrated and data-paused while not playing", () => {
    const { container } = render(<Terminal />);
    const root = container.querySelector("[data-sf-agent-demo]");
    expect(root?.hasAttribute("data-sf-animating")).toBe(true);
    advance(100);
    expect(root?.hasAttribute("data-paused")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(root?.hasAttribute("data-paused")).toBe(true);
  });

  test("shows the tool as Running before Completed, and the output only once done", () => {
    render(<Terminal />);
    advance(startOf(1) + 100);
    const transcript = within(region());
    expect(transcript.getByRole("img", { name: "Running" })).toBeTruthy();
    expect(transcript.queryByRole("img", { name: "Completed" })).toBeNull();
    expect(region().textContent).not.toContain("success");
    advance(1000);
    expect(transcript.getByRole("img", { name: "Completed" })).toBeTruthy();
    expect(region().textContent).toContain('Bash(rr run "go test ./...")');
    expect(region().textContent).toContain("success");
  });

  test("keeps DOM order equal to script order", () => {
    render(<Terminal />);
    advance(TOTAL);
    const question = within(region()).getByText("Fix the failing test");
    const answer = within(region()).getByText("All green.");
    expect(question.compareDocumentPosition(answer)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  test("replays from the beginning without moving keyboard focus", () => {
    render(<Terminal />);
    advance(TOTAL + 100);
    const replay = screen.getByRole("button", { name: "Replay" });
    replay.focus();
    fireEvent.click(replay);
    expect(region().textContent).not.toContain("All green.");
    expect(screen.getByRole("button", { name: "Pause" })).toBe(document.activeElement);
    advance(TOTAL + 100);
    expect(screen.getByRole("button", { name: "Replay" })).toBe(document.activeElement);
  });

  test("holds its position while the tab is hidden", () => {
    render(<Terminal />);
    advance(300);
    const typed = region().textContent;
    setTabHidden(true);
    advance(10_000);
    expect(region().textContent).toBe(typed);
    setTabHidden(false);
    advance(TOTAL);
    expect(screen.getByRole("status").textContent).toContain("Demo complete.");
  });

  test("cancels playback when unmounted", () => {
    const onComplete = vi.fn();
    const { unmount } = render(<Terminal onComplete={onComplete} />);
    advance(500);
    unmount();
    advance(TOTAL);
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: "Demo transcript" })).toBeNull();
  });

  test("reduced motion shows everything, with no button and no 'complete' status", () => {
    stubReducedMotion(true);
    const onComplete = vi.fn();
    const { container } = render(<Terminal onComplete={onComplete} />);
    expect(region().textContent).toContain("Fix the failing test");
    expect(region().textContent).toContain('Bash(rr run "go test ./...")');
    expect(region().textContent).toContain("… +3 lines");
    expect(region().textContent).toContain("All green.");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Example agent session.");
    expect(container.querySelector("[data-sf-animating]")).toBeNull();
    advance(TOTAL);
    expect(onComplete).not.toHaveBeenCalled();
  });

  test("autoStart false shows the final transcript until Play", () => {
    render(<Terminal autoStart={false} />);
    expect(region().textContent).toContain("All green.");
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(region().textContent).not.toContain("All green.");
    advance(TOTAL);
    expect(region().textContent).toContain("All green.");
  });

  test("streams agent text with a caret and types the user message", () => {
    const { container } = render(<Terminal />);
    advance(100);
    expect(region().textContent).toContain("Fix");
    expect(region().textContent).not.toContain("Fix the failing test");
    expect(container.querySelector('[data-part="caret"]')).toBeTruthy();
  });

  test("shows thinking dots after the user message", () => {
    render(<Terminal />);
    advance(startOf(1) - 100);
    expect(within(region()).getByRole("img", { name: "Agent thinking" })).toBeTruthy();
  });

  test("StrictMode's mount, unmount, mount leaves one live gate; callbacks fire once each", () => {
    stubIntersectionObserver();
    const onStepStart = vi.fn();
    const onComplete = vi.fn();
    render(
      <StrictMode>
        <Terminal onStepStart={onStepStart} onComplete={onComplete} />
      </StrictMode>,
    );
    expect(FakeIntersectionObserver.live()).toHaveLength(1);
    act(() => FakeIntersectionObserver.live()[0]?.fire(true));
    advance(TOTAL + 1000);
    expect(onStepStart.mock.calls.map(([i]) => i)).toEqual([0, 1, 2]);
    expect(onComplete).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Replay" }));
    advance(startOf(1) + 50);
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    const paused = region().textContent;
    advance(5000);
    expect(region().textContent).toBe(paused);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    advance(TOTAL);
    expect(onStepStart.mock.calls.map(([i]) => i)).toEqual([0, 1, 2, 0, 1, 2]);
    expect(onComplete).toHaveBeenCalledTimes(2);
  });

  test("an Activity hide and show mid-play resumes playing, with no callbacks again", () => {
    const onStepStart = vi.fn();
    const onComplete = vi.fn();
    const props = { onStepStart, onComplete };
    const { rerender } = render(<HiddenTerminal mode="visible" {...props} />);
    advance(startOf(1) + 50);
    const fired = onStepStart.mock.calls.length;
    hideAndShow(rerender, props, "Pause");
    expect(onStepStart).toHaveBeenCalledTimes(fired);
    advance(TOTAL);
    expect(onStepStart.mock.calls.map(([i]) => i)).toEqual([0, 1, 2]);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test("an Activity hide and show while paused stays paused", () => {
    const onStepStart = vi.fn();
    const props = { onStepStart };
    const { rerender } = render(<HiddenTerminal mode="visible" {...props} />);
    advance(startOf(1) + 50);
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    const fired = onStepStart.mock.calls.length;
    hideAndShow(rerender, props, "Play");
    advance(5000);
    expect(onStepStart).toHaveBeenCalledTimes(fired);
  });

  test("an Activity hide and show once complete stays complete", () => {
    const onStepStart = vi.fn();
    const onComplete = vi.fn();
    const props = { onStepStart, onComplete };
    const { rerender } = render(<HiddenTerminal mode="visible" {...props} />);
    advance(TOTAL + 1000);
    expect(screen.getByRole("status").textContent).toContain("Demo complete.");
    hideAndShow(rerender, props, "Replay");
    expect(
      document.querySelector("[data-sf-agent-demo]")?.getAttribute("data-complete"),
    ).not.toBeNull();
    expect(onStepStart.mock.calls.map(([i]) => i)).toEqual([0, 1, 2]);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test("a callback that throws during a prop update leaves the demo mounted", () => {
    const later: Array<() => void> = [];
    vi.spyOn(globalThis, "queueMicrotask").mockImplementation((cb) => {
      later.push(cb);
    });
    const onStepStart = (index: number): void => {
      if (index === 0) throw new Error("step 0");
    };
    const first = render(<Terminal scriptKey="a" onStepStart={() => {}} />);
    advance(500);
    first.rerender(<Terminal scriptKey="b" onStepStart={onStepStart} />);
    expect(region()).toBeTruthy();
    expect(later).toHaveLength(1);
    expect(() => later[0]?.()).toThrow("step 0");
  });
});

describe("composer (chat)", () => {
  test("types into the composer, then posts with a submit flash", () => {
    const { container } = render(<AgentDemo script={chatScript} seed="s" />);
    const composer = (): Element | null => container.querySelector('[data-part="composer"]');
    expect(composer()?.getAttribute("aria-hidden")).toBe("true");
    advance(1100);
    expect(composer()?.textContent).toMatch(/^How/);
    expect(region().textContent).not.toContain("How many rows");
    const timeline = compile(chatScript, { seed: "s", composer: true });
    advance((timeline.steps[1]?.start ?? 0) - 1100 - 1000);
    expect(region().textContent).toContain("How many rows are there?");
    expect(composer()?.textContent).toContain("Message the agent…");
  });

  test("flashes the submit key when the message posts", () => {
    const { container } = render(<AgentDemo script={chatScript} seed="s" />);
    let flashed = false;
    for (let t = 0; t < 4000; t += 50) {
      advance(50);
      if (container.querySelector('[data-part="submit"][data-flash]')) flashed = true;
    }
    expect(flashed).toBe(true);
  });

  test("crossfades the skeleton away when the tool resolves", () => {
    const loading: boolean[] = [];
    const { container } = render(
      <AgentDemo
        script={chatScript}
        seed="s"
        tools={{
          query_sql: {
            label: "Ran query",
            runningLabel: "Running query",
            accent: "red",
            icon: "Q",
          },
        }}
        renderToolBody={(ctx) => {
          loading.push(ctx.loading);
          return <span>rows: {(ctx.step.body as { data: { rows: number } }).data.rows}</span>;
        }}
      />,
    );
    const timeline = compile(chatScript, { seed: "s", composer: true });
    advance((timeline.steps[1]?.start ?? 0) + 50);
    expect(screen.getByText("Running query")).toBeTruthy();
    expect(container.querySelector('[data-part="skeleton"][data-state="loading"]')).toBeTruthy();
    advance(1000);
    expect(screen.getByText("Ran query")).toBeTruthy();
    expect(container.querySelector('[data-part="skeleton"][data-state="leaving"]')).toBeTruthy();
    advance(400);
    expect(container.querySelector('[data-part="skeleton"]')).toBeNull();
    expect(loading).toContain(true);
    expect(loading.at(-1)).toBe(false);
    const card = container.querySelector<HTMLElement>('[data-part="tool-call"]');
    expect(card?.style.getPropertyValue("--sf-tool-accent")).toBe("red");
  });
});

describe("render props", () => {
  test("renderToolCall and renderToolBody see mode static on the server and live once hydrated", () => {
    const calls: Array<Pick<ToolCallContext, "mode" | "index">> = [];
    const props = {
      script: chatScript,
      renderToolCall: (ctx: ToolCallContext<{ rows: number }>) => {
        calls.push({ mode: ctx.mode, index: ctx.index });
        return ctx.mode === "static" ? undefined : <div>live card</div>;
      },
    };
    const html = renderToStaticMarkup(<AgentDemo {...props} />);
    expect(calls).toEqual([{ mode: "static", index: 1 }]);
    expect(html).toContain('data-part="tool-call"');
    stubReducedMotion(true);
    render(<AgentDemo {...props} />);
    expect(screen.getByText("live card")).toBeTruthy();
    expect(calls.at(-1)).toEqual({ mode: "live", index: 1 });
  });

  test("false from renderToolCall or renderToolBody falls back like null and undefined", () => {
    const script: DemoScript = {
      steps: [
        { kind: "user", text: "Show it" },
        { kind: "tool-call", name: "list", body: { kind: "lines", lines: ["built-in line"] } },
      ],
    };
    const { container } = render(
      <StaticTranscript
        script={script}
        renderToolCall={() => false}
        renderToolBody={() => false}
      />,
    );
    expect(container.querySelector('[data-part="tool-call"]')).toBeTruthy();
    expect(screen.getByText("built-in line")).toBeTruthy();
  });

  test("stage receives the current view", () => {
    render(
      <Terminal stage={(view) => <output data-testid="stage">{view.entries.length}</output>} />,
    );
    expect(screen.getByTestId("stage").textContent).toBe("1");
    advance(TOTAL);
    expect(screen.getByTestId("stage").textContent).toBe("3");
  });

  test("labels and glyphs override the defaults", () => {
    render(
      <Terminal
        labels={{ pause: "Stop", transcript: "Session", idleStatus: "Sample run." }}
        glyphs={{ agent: "*" }}
      />,
    );
    expect(screen.getByRole("button", { name: "Stop" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Session" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Sample run.");
    advance(TOTAL);
    expect(screen.getByRole("group", { name: "Session" }).textContent).toContain("*");
  });

  test("custom controls render from the hook result; none renders nothing", () => {
    const { unmount } = render(
      <Terminal
        controls={(demo) => (
          <button type="button" onClick={demo.controls.cancel}>
            Skip
          </button>
        )}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(region().textContent).toContain("All green.");
    unmount();
    render(<Terminal controls="none" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  test("chrome wraps the demo in a window with the controls in its title bar", () => {
    const { container } = render(<Terminal chrome={{ title: "session" }} header="Header" />);
    const bar = container.querySelector('[data-part="window-bar"]');
    expect(bar?.textContent).toContain("session");
    expect(within(bar as HTMLElement).getByRole("button", { name: "Pause" })).toBeTruthy();
    expect(
      container.querySelector('[data-part="window-body"] [data-part="header"]')?.textContent,
    ).toBe("Header");
    expect(container.querySelector("h1, h2, h3")).toBeNull();
  });

  test("header without chrome shares a bar with the controls", () => {
    const { container } = render(<Terminal chrome={true} />);
    expect(container.querySelector('[data-part="window-title"]')).toBeNull();
    cleanup();
    const second = render(<Terminal header={<span>Title</span>} />);
    const header = second.container.querySelector('[data-part="header"]');
    expect(header?.textContent).toContain("Title");
    expect(within(header as HTMLElement).getByRole("button")).toBeTruthy();
  });
});

describe("full controls", () => {
  const twoTurns: DemoScript = {
    steps: [
      { kind: "user", text: "first" },
      { kind: "agent-text", text: "one" },
      { kind: "user", text: "second" },
      { kind: "agent-text", text: "two" },
    ],
  };
  const timeline = compile(twoTurns, { timing: presets.terminal });

  test("turn jumps mark the current turn, Next jumps ahead, speed toggles", () => {
    render(
      <AgentDemo script={twoTurns} layout="terminal" timing={presets.terminal} controls="full" />,
    );
    advance(10);
    const turn1 = screen.getByRole("button", { name: "1" });
    expect(turn1.getAttribute("aria-current")).toBe("step");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("button", { name: "2" }).getAttribute("aria-current")).toBe("step");
    expect(region().textContent).toContain("one");
    fireEvent.click(turn1);
    expect(region().textContent).not.toContain("one");
    const speed = screen.getByRole("button", { name: "Playback speed 1x" });
    fireEvent.click(speed);
    expect(screen.getByRole("button", { name: "Playback speed 2x" })).toBe(speed);
    advance(timeline.duration / 2 + 100);
    expect(region().textContent).toContain("two");
    expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(true);
  });

  test("Next from the last turn goes to the end", () => {
    render(
      <AgentDemo script={twoTurns} layout="terminal" timing={presets.terminal} controls="full" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("button", { name: "Replay" })).toBeTruthy();
  });
});

describe("announce", () => {
  test("status is the default; none renders no status", () => {
    render(<Terminal announce="none" />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.querySelector("[aria-live]")).toBeNull();
  });

  test("beats announces each finished beat in a separate polite region", () => {
    const { container } = render(<Terminal announce="beats" />);
    const beats = (): string =>
      container.querySelector('[data-part="beats"][aria-live="polite"]')?.textContent ?? "";
    expect(screen.getByRole("status")).toBeTruthy();
    expect(beats()).toBe("");
    advance(startOf(1) + 50);
    expect(beats()).toBe("You: Fix the failing test");
    advance(startOf(2) - startOf(1));
    expect(beats()).toBe("Bash: Completed");
    advance(TOTAL);
    expect(beats()).toBe("Agent: All green.");
    expect(region().hasAttribute("aria-live")).toBe(false);
  });
});

describe("script identity", () => {
  test("an inline script rebuilt each render doesn't restart; a new scriptKey does", () => {
    const copy = (): DemoScript => ({ steps: terminalScript.steps.map((s) => ({ ...s })) });
    const { rerender } = render(<Terminal script={copy()} />);
    advance(startOf(2) + 10);
    expect(region().textContent).toContain("success");
    rerender(<Terminal script={copy()} onComplete={() => {}} />);
    advance(10);
    expect(region().textContent).toContain("success");
    rerender(<Terminal script={copy()} scriptKey="b" />);
    advance(10);
    expect(region().textContent).not.toContain("success");
  });

  test("a changed script without a key starts over", () => {
    const { rerender } = render(<Terminal />);
    advance(startOf(2) + 10);
    rerender(
      <Terminal script={{ steps: [{ kind: "user", text: "Something else entirely, please" }] }} />,
    );
    advance(10);
    expect(region().textContent).not.toContain("Fix the failing test");
  });
});

describe("onStepStart", () => {
  test("fires once per step, in order, and again after a replay", () => {
    const onStepStart = vi.fn();
    const { rerender } = render(<Terminal onStepStart={onStepStart} />);
    advance(TOTAL / 2);
    rerender(<Terminal onStepStart={onStepStart} />);
    advance(TOTAL);
    expect(onStepStart.mock.calls.map(([i]) => i)).toEqual([0, 1, 2]);
    expect(onStepStart.mock.calls[1]?.[1]).toBe(terminalScript.steps[1]);
    fireEvent.click(screen.getByRole("button", { name: "Replay" }));
    advance(TOTAL);
    expect(onStepStart.mock.calls.map(([i]) => i)).toEqual([0, 1, 2, 0, 1, 2]);
  });
});

describe("click position", () => {
  const deck: DemoScript = {
    steps: [
      { kind: "user", text: "Question", at: 1 },
      { kind: "tool-call", name: "lookup", at: 2, body: { kind: "lines", lines: ["hit"], at: 3 } },
      { kind: "agent-text", text: "Answer", at: 4 },
    ],
  };

  test("renders stateAt the click with no clock or controls, forward and backward", () => {
    const { rerender, container } = render(
      <AgentDemo script={deck} layout="terminal" position={{ click: 0 }} />,
    );
    expect(region().textContent).toBe("");
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<AgentDemo script={deck} layout="terminal" position={{ click: 2 }} />);
    expect(region().textContent).toContain("Question");
    expect(within(region()).getByRole("img", { name: "Running" })).toBeTruthy();
    advance(5000);
    expect(region().textContent).not.toContain("Answer");
    rerender(<AgentDemo script={deck} layout="terminal" position={{ click: 4 }} />);
    expect(region().textContent).toContain("hit");
    expect(region().textContent).toContain("Answer");
    expect(screen.getByRole("status").textContent).toContain("Demo complete.");
    rerender(<AgentDemo script={deck} layout="terminal" position={{ click: 1 }} />);
    expect(region().textContent).toContain("Question");
    expect(region().textContent).not.toContain("lookup");
    expect(container.querySelector("[data-sf-animating]")).toBeTruthy();
  });

  test("server render at a click shows that click", () => {
    const html = renderToStaticMarkup(<AgentDemo script={deck} position={{ click: 1 }} />);
    expect(html).toContain("Question");
    expect(html).not.toContain("Answer");
  });
});

describe("useAgentDemo", () => {
  test("is not ready on the server and exposes the final view", () => {
    expect(renderToStaticMarkup(<Probe />)).toContain("false:3:static");
  });

  test("seek, cancel and setSpeed drive the view", () => {
    const { result } = renderHook(() =>
      useAgentDemo(terminalScript, { timing: presets.terminal, autoStart: false, speed: 1 }),
    );
    expect(result.current.animating).toBe(false);
    act(() => result.current.controls.seek(startOf(2)));
    expect(result.current.animating).toBe(true);
    expect(result.current.view.current).toBe(2);
    expect(result.current.turn).toBe(0);
    act(() => result.current.controls.setSpeed(2));
    expect(result.current.speed).toBe(2);
    act(() => result.current.controls.play());
    advance(200);
    expect(result.current.playing).toBe(true);
    act(() => result.current.controls.pause());
    expect(result.current.paused).toBe(true);
    act(() => result.current.controls.cancel());
    expect(result.current.complete).toBe(true);
    expect(result.current.view.complete).toBe(true);
  });

  test("setSpeed rejects an invalid rate at the call site and keeps the current one", () => {
    const { result } = renderHook(() => useAgentDemo(terminalScript, { autoStart: false }));
    expect(() => result.current.controls.setSpeed(0)).toThrow(
      expect.objectContaining({ code: "invalid_option", field: "speed" }),
    );
    expect(result.current.speed).toBe(1);
    act(() => result.current.controls.play());
    advance(200);
    expect(result.current.playing).toBe(true);
  });

  test("hidden tools in the registry take no time", () => {
    const { result, rerender } = renderHook(
      (hidden: boolean) =>
        useAgentDemo(terminalScript, {
          timing: presets.terminal,
          tools: { Bash: { hidden } },
        }),
      { initialProps: false },
    );
    const shown = result.current.timeline;
    rerender(false);
    expect(result.current.timeline).toBe(shown);
    rerender(true);
    const bash = result.current.timeline.steps[1];
    expect(bash?.end).toBe(bash?.start);
    expect(result.current.timeline.duration).toBeLessThan(shown.duration);
  });

  test("follows a changed speed option", () => {
    const { result, rerender } = renderHook(
      (speed: number) => useAgentDemo(terminalScript, { speed }),
      { initialProps: 1 },
    );
    rerender(3);
    expect(result.current.speed).toBe(3);
  });

  test("falls back to identity for a script it can't serialize", () => {
    const data: { self?: unknown } = {};
    data.self = data;
    const script: DemoScript<typeof data> = {
      steps: [{ kind: "tool-call", name: "x", body: { kind: "custom", data } }],
    };
    const { result, rerender } = renderHook(() => useAgentDemo(script));
    const first = result.current.timeline;
    rerender();
    expect(result.current.timeline).toBe(first);
  });

  test("an inline function finalPolicy renders without looping", () => {
    const { rerender } = render(<Inline n={1} />);
    rerender(<Inline n={2} />);
    expect(screen.getByTestId("inline").textContent).toBe("2:1");
  });
});

describe("every step kind", () => {
  const session: DemoScript = {
    steps: [
      { kind: "command", text: "pwd" },
      { kind: "prompt", text: "~/x $" },
      { kind: "command", text: "ls" },
      { kind: "output", lines: ["a.txt", ""] },
      { kind: "thinking", ms: 300 },
      { kind: "pause", ms: 100 },
      { kind: "agent-text", lead: "Note:", text: "done" },
      { kind: "tool-call", name: "deploy", server: "ci", status: "error" },
      { kind: "user", text: "ok", composer: true },
    ],
  };
  const timeline = compile(session, { timing: presets.terminal });

  test("terminal plays prompts, output, thinking, leads, errors and the composer", () => {
    const { container } = render(
      <AgentDemo
        script={session}
        layout="terminal"
        timing={presets.terminal}
        announce="beats"
        glyphs={{ spinner: [] }}
      />,
    );
    const beats: string[] = [];
    for (let t = 0; t <= timeline.duration + 100; t += 20) {
      advance(20);
      const text = container.querySelector('[data-part="beats"]')?.textContent ?? "";
      if (text && beats.at(-1) !== text) beats.push(text);
      if (container.querySelector('[data-part="thinking"]')) beats.push("(thinking)");
    }
    expect(beats).toContain("$ pwd");
    expect(beats).toContain("~/x $ ls");
    expect(beats).toContain("a.txt ");
    expect(beats).toContain("(thinking)");
    expect(beats).toContain("Agent: Note: done");
    // The terminal names the tool as its header does, server first, with no registry label.
    expect(beats).toContain("ci deploy: Failed");
    expect(beats.at(-1)).toBe("You: ok");
    expect(region().textContent).toContain("ci deploy");
    expect(container.querySelector('[data-part="composer"] [data-part="glyph"]')?.textContent).toBe(
      "❯",
    );
    expect(container.querySelector('[data-part="lead"]')?.textContent).toBe("Note:");
  });

  test("chat cards show args without meta, failures, and tools without a body", () => {
    const html = renderToStaticMarkup(
      <AgentDemo
        script={{
          steps: [
            { kind: "tool-call", name: "search", args: "query: rivers" },
            { kind: "tool-call", name: "fetch", status: "error", output: ["404"] },
          ],
        }}
      />,
    );
    expect(html).toContain('<span data-part="tool-args">query: rivers</span>');
    expect(html).toContain('aria-label="Failed">✕</span>');
    expect(html).toContain("Search");
  });
});

/** A site motion toggle the test flips by hand. */
function motionToggle(): MotionSource & { set(allowed: boolean): void } {
  let allowed = true;
  const listeners = new Set<() => void>();
  return {
    get: () => allowed,
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    set(next) {
      allowed = next;
      act(() => {
        for (const cb of listeners) cb();
      });
    },
  };
}

describe("completion, reduced motion and the play label", () => {
  test("reducedPolicy hold freezes the frame playback reached and resumes from it", () => {
    const motion = motionToggle();
    render(<Terminal motion={motion} reducedPolicy="hold" />);
    advance(startOf(1) + 50);
    const frame = region().textContent;
    expect(frame).not.toContain("All green.");
    motion.set(false);
    advance(5000);
    expect(region().textContent).toBe(frame);
    motion.set(true);
    advance(TOTAL);
    expect(region().textContent).toContain("All green.");
  });

  test("reduced motion on and off mid-play neither completes nor announces complete", () => {
    const motion = motionToggle();
    const onComplete = vi.fn();
    render(<Terminal motion={motion} onComplete={onComplete} />);
    advance(startOf(1));
    motion.set(false);
    motion.set(true);
    advance(100);
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("Example agent session.");
    fireEvent.click(screen.getByRole("button", { name: "Replay" }));
    advance(TOTAL + 100);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toBe("Demo complete.");
  });

  test("a seek or cancel before play keeps the Play label and fires no onComplete", () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() =>
      useAgentDemo(terminalScript, { timing: presets.terminal, autoStart: false, onComplete }),
    );
    act(() => result.current.controls.seek(startOf(2)));
    expect(result.current).toMatchObject({ started: false, playing: false, animating: true });
    expect(result.current.view.current).toBe(2);
    act(() => result.current.controls.cancel());
    expect(result.current).toMatchObject({ started: false, complete: true });
    expect(onComplete).not.toHaveBeenCalled();
  });

  test("custom controls see started stay false after a seek before play", () => {
    render(
      <Terminal
        autoStart={false}
        controls={(demo) => (
          <button type="button" onClick={() => demo.controls.seek(startOf(2))}>
            {`Seek ${demo.started ? "started" : "idle"}`}
          </button>
        )}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Seek idle" }));
    expect(screen.getByRole("button", { name: "Seek idle" })).toBeTruthy();
    expect(region().textContent).toContain("Fix the failing test");
  });

  test("the content signature is computed once per input, not once per frame", () => {
    let reads = 0;
    const step = {
      kind: "agent-text" as const,
      get text() {
        reads++;
        return "Streaming a reply word by word.";
      },
    };
    const script: DemoScript = { steps: [step] };
    render(<AgentDemo script={script} layout="terminal" timing={presets.terminal} />);
    const before = reads;
    advance(2000);
    expect(reads).toBe(before);
  });

  test("renderToolCall returning null keeps the default card; hidden in tools drops it", () => {
    const html = renderToStaticMarkup(
      <AgentDemo script={chatScript} renderToolCall={() => null} />,
    );
    expect(html).toContain('data-part="tool-call"');
    const hidden = renderToStaticMarkup(
      <AgentDemo script={chatScript} tools={{ query_sql: { hidden: true } }} />,
    );
    expect(hidden).not.toContain('data-part="tool-call"');
    expect(hidden).toContain("There are 54 rows");
  });
});

describe("terminal tool header", () => {
  const script: DemoScript = {
    steps: [
      { kind: "tool-call", name: "query_sql", server: "db", args: "spec" },
      { kind: "tool-call", name: "ls" },
    ],
  };
  const parts = (root: ParentNode) =>
    [...root.querySelectorAll('[data-part="tool-label"]')].map((label) => ({
      text: label.textContent,
      server: label.querySelector('[data-part="tool-server"]')?.textContent ?? null,
      name: label.querySelector('[data-part="tool-name"]')?.textContent ?? null,
    }));

  test("renders server and name as separate parts, reading 'server name' by default", () => {
    const { container } = render(<StaticTranscript script={script} layout="terminal" />);
    expect(parts(container)).toEqual([
      { text: "db query_sql", server: "db", name: "query_sql" },
      { text: "ls", server: null, name: "ls" },
    ]);
  });

  test("glyphs.serverSeparator sets the text between them", () => {
    const { container } = render(
      <StaticTranscript script={script} layout="terminal" glyphs={{ serverSeparator: " · " }} />,
    );
    expect(parts(container)[0]?.text).toBe("db · query_sql");
  });
});

/** A demo with an inline `finalPolicy`, a new function every render. */
function Inline({ n }: { n: number }) {
  const demo = useAgentDemo(terminalScript, {
    timing: presets.terminal,
    autoStart: false,
    finalPolicy: () => [0],
  });
  return <span data-testid="inline">{`${n}:${demo.view.entries.length}`}</span>;
}

describe("extension points", () => {
  const running = () => document.querySelector('[data-part="tool-call"][data-status="running"]');

  test("labels.working shows the output glyph and the text under a running call", () => {
    render(<Terminal labels={{ working: "Running…" }} />);
    advance(startOf(1) + 100);
    const body = running()?.querySelector('[data-part="tool-body"]');
    expect(body?.querySelector('[data-part="glyph"]')?.textContent).toBe("⎿");
    expect(body?.querySelector('[data-part="tool-working"]')?.textContent).toBe("Running…");
    advance(TOTAL);
    expect(document.querySelector('[data-part="tool-working"]')).toBeNull();
    expect(region().textContent).toContain('{"type":"result","status":"success"}');
  });

  test("without labels.working, and in the chat layout, a running call shows no working line", () => {
    render(<Terminal />);
    advance(startOf(1) + 100);
    expect(running()).not.toBeNull();
    expect(running()?.querySelector('[data-part="tool-body"]')).toBeNull();
    cleanup();
    render(
      <AgentDemo
        script={terminalScript}
        timing={presets.terminal}
        composer={false}
        labels={{ working: "Running…" }}
      />,
    );
    advance(startOf(1) + 100);
    expect(running()).not.toBeNull();
    expect(document.querySelector('[data-part="tool-working"]')).toBeNull();
  });

  test("the terminal header wraps the args' parens in tool-paren parts, text unchanged", () => {
    const script: DemoScript = { steps: [{ kind: "tool-call", name: "q", args: "select 1" }] };
    const { container } = render(<StaticTranscript script={script} layout="terminal" />);
    const args = container.querySelector('[data-part="tool-args"]');
    expect(args?.textContent).toBe("(select 1)");
    expect(
      [...(args?.querySelectorAll('[data-part="tool-paren"]') ?? [])].map((p) => p.textContent),
    ).toEqual(["(", ")"]);
    cleanup();
    const chat = render(<StaticTranscript script={script} />);
    expect(chat.container.querySelector('[data-part="tool-args"]')?.innerHTML).toBe("select 1");
  });

  test("collapsible renders each tool call as an open details with the header as its summary", () => {
    const html = renderToStaticMarkup(
      <StaticTranscript script={terminalScript} layout="terminal" collapsible />,
    );
    expect(html).toMatch(/<details data-part="tool-call"[^>]* open=""/);
    expect(html).toContain('<summary data-part="tool-header">');
    const plain = renderToStaticMarkup(<StaticTranscript script={terminalScript} />);
    expect(plain).not.toContain("<details");
    expect(plain).not.toContain("<summary");
  });

  test("a collapsed tool call stays collapsed while playback re-renders it", () => {
    render(<Terminal collapsible />);
    advance(startOf(1) + 100);
    const details = document.querySelector("details") as HTMLDetailsElement;
    expect(details.open).toBe(true);
    const summary = details.querySelector("summary") as HTMLElement;
    expect(summary.getAttribute("data-part")).toBe("tool-header");
    fireEvent.click(summary);
    expect(details.open).toBe(false);
    advance(TOTAL);
    expect(document.querySelector("details")).toBe(details);
    expect(details.open).toBe(false);
    expect(details.getAttribute("data-status")).toBe("done");
  });

  test("transcript picks the landmark and the focusability, defaulting to a focusable group", () => {
    const { rerender } = render(<Terminal />);
    expect(region().tagName).toBe("DIV");
    expect(region().getAttribute("tabindex")).toBe("0");
    rerender(<Terminal transcript={{ as: "region" }} />);
    const section = screen.getByRole("region", { name: "Demo transcript" });
    expect(section.tagName).toBe("SECTION");
    expect(section.getAttribute("role")).toBeNull();
    expect(section.getAttribute("tabindex")).toBe("0");
    rerender(<Terminal transcript={{ focusable: false }} />);
    expect(region().hasAttribute("tabindex")).toBe(false);
    cleanup();
    render(<StaticTranscript script={terminalScript} transcript={{ as: "region" }} />);
    expect(screen.getByRole("region", { name: "Demo transcript" }).tagName).toBe("SECTION");
  });

  test("an empty labels.working shows no working line", () => {
    render(<Terminal labels={{ working: "" }} />);
    advance(startOf(1) + 100);
    expect(running()).not.toBeNull();
    expect(running()?.querySelector('[data-part="tool-body"]')).toBeNull();
  });

  test("under reduced motion every option renders the final transcript with no working line", () => {
    stubReducedMotion(true);
    render(<Terminal labels={{ working: "Running…" }} collapsible transcript={{ as: "region" }} />);
    advance(TOTAL);
    const transcript = screen.getByRole("region", { name: "Demo transcript" });
    expect(transcript.textContent).toContain("All green.");
    expect(transcript.querySelector('[data-part="tool-working"]')).toBeNull();
    expect(within(transcript).queryByRole("img", { name: "Running" })).toBeNull();
    expect(transcript.querySelector("details")?.open).toBe(true);
    expect(document.querySelector("[data-sf-animating]")).toBeNull();
  });

  test("the server render with every option is the final, readable transcript", () => {
    const html = renderToStaticMarkup(
      <Terminal
        labels={{ working: "Running…" }}
        collapsible
        transcript={{ as: "region", focusable: false }}
        chrome={{ className: "hero-window" }}
      />,
    );
    const host = document.body.appendChild(document.createElement("div"));
    host.innerHTML = html;
    const transcript = within(host).getByRole("region", { name: "Demo transcript" });
    expect(transcript.hasAttribute("tabindex")).toBe(false);
    expect(transcript.textContent).toContain('Bash(rr run "go test ./...")');
    expect(transcript.textContent).toContain("All green.");
    expect(host.querySelector('[data-part="tool-working"]')).toBeNull();
    expect(host.querySelector("details")?.open).toBe(true);
    expect(host.querySelector('[data-part="window"]')?.className).toBe("hero-window");
    expect(within(host).queryByRole("button")).toBeNull();
    host.remove();
  });

  test("chrome.className lands on the window root", () => {
    const { container } = render(<Terminal chrome={{ className: "hero-window" }} />);
    expect(container.querySelector('[data-part="window"]')?.className).toBe("hero-window");
  });
});
