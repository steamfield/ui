import { AgentDemo, StaticTranscript } from "@steamfield/ui/react/agent-demo";
import type { DemoScript } from "@steamfield/ui/script";
import { clickCount, presets } from "@steamfield/ui/sequencer";
import { type CSSProperties, type ReactElement, useState } from "react";

const terminal: DemoScript = {
  id: "pg-terminal",
  steps: [
    { kind: "user", text: "The upload tests are failing. Can you fix them?" },
    {
      kind: "tool-call",
      name: "Bash",
      args: "npm test -- upload",
      output: [
        { text: "FAIL  src/upload.test.ts", tone: "fail" },
        { text: "  ✕ retries a dropped connection (31 ms)", tone: "fail" },
        { text: "  ✓ uploads a small file", tone: "ok" },
      ],
      more: 12,
    },
    {
      kind: "agent-text",
      text: "The client gives up after the first dropped connection. I'll add a retry with backoff.",
    },
    {
      kind: "tool-call",
      name: "Edit",
      args: "src/upload.ts",
      output: [{ text: "+ retry(send, { attempts: 3, backoffMs: 200 })", tone: "ok" }],
    },
    {
      kind: "tool-call",
      name: "Bash",
      args: "npm test -- upload",
      output: [{ text: "PASS  src/upload.test.ts (2 tests)", tone: "ok" }],
    },
    { kind: "agent-text", text: "Both upload tests pass now." },
  ],
};

interface MonthRow {
  readonly month: string;
  readonly mm: number;
}

const chat: DemoScript<readonly MonthRow[]> = {
  id: "pg-chat",
  steps: [
    { kind: "user", text: "Which month had the most rainfall last year?" },
    {
      kind: "tool-call",
      name: "query_sql",
      meta: "12 rows · 40ms",
      body: {
        kind: "custom",
        data: [
          { month: "Oct", mm: 112 },
          { month: "Nov", mm: 138 },
          { month: "Dec", mm: 97 },
        ],
      },
    },
    {
      kind: "agent-text",
      text: "November was the wettest month, with 138 mm of rain. October came second with 112 mm.",
    },
  ],
};

const deck: DemoScript = {
  id: "pg-deck",
  steps: [
    { kind: "user", text: "Summarize the open issues.", at: 1 },
    {
      kind: "tool-call",
      name: "list_issues",
      at: 2,
      body: { kind: "lines", lines: ["#12 Login times out", "#15 Dark mode contrast"], at: 3 },
    },
    { kind: "agent-text", text: "Two issues are open: a login timeout and a contrast bug.", at: 4 },
  ],
};

const tools = {
  query_sql: { label: "Ran query", runningLabel: "Running query", icon: "≡" },
  list_issues: { label: "Listed issues", runningLabel: "Listing issues" },
};

function RainfallBars({ rows }: { readonly rows: readonly MonthRow[] }): ReactElement {
  const max = Math.max(...rows.map((row) => row.mm));
  return (
    <ul className="pg-bars">
      {rows.map((row) => (
        <li key={row.month}>
          <span>{row.month}</span>
          <span className="pg-bar" style={{ width: `${(row.mm / max) * 100}%` }} />
          <span>{row.mm} mm</span>
        </li>
      ))}
    </ul>
  );
}

function ClickDeck(): ReactElement {
  const [click, setClick] = useState(0);
  const total = clickCount(deck);
  return (
    <>
      <div className="pg-row">
        <button
          type="button"
          onClick={() => setClick((c) => Math.max(0, c - 1))}
          disabled={click === 0}
        >
          Previous
        </button>
        <span>
          Click {click} of {total}
        </span>
        <button
          type="button"
          onClick={() => setClick((c) => Math.min(total, c + 1))}
          disabled={click === total}
        >
          Next click
        </button>
      </div>
      <AgentDemo
        script={deck}
        layout="chat"
        composer={false}
        tools={tools}
        position={{ click }}
        labels={{ transcript: "Click-paced transcript" }}
        style={{ "--sf-demo-height": "16rem" } as CSSProperties}
      />
    </>
  );
}

export function AgentDemoPage(): ReactElement {
  return (
    <>
      <h1>agent-demo</h1>
      <section className="pg-section" aria-labelledby="ad-terminal">
        <h2 id="ad-terminal">Terminal</h2>
        <AgentDemo
          script={terminal}
          layout="terminal"
          timing={presets.terminal}
          chrome={{ title: "agent session" }}
          labels={{ transcript: "Terminal transcript" }}
          privacyClassName="ph-no-capture"
        />
      </section>
      <section className="pg-section" aria-labelledby="ad-chat">
        <h2 id="ad-chat">Chat</h2>
        <AgentDemo
          script={chat}
          layout="chat"
          tools={tools}
          controls="full"
          labels={{ transcript: "Chat transcript" }}
          renderToolBody={(ctx) =>
            ctx.step.body?.kind === "custom" ? (
              <RainfallBars rows={ctx.step.body.data} />
            ) : undefined
          }
        />
      </section>
      <section className="pg-section" aria-labelledby="ad-click">
        <h2 id="ad-click">Click mode</h2>
        <ClickDeck />
      </section>
      <section className="pg-section" aria-labelledby="ad-static">
        <h2 id="ad-static">StaticTranscript</h2>
        <StaticTranscript
          script={terminal}
          layout="terminal"
          finalPolicy="last"
          labels={{ transcript: "Static transcript" }}
        />
      </section>
    </>
  );
}
