import { expect, test } from "vitest";
import { isLibraryError } from "../script/errors.ts";
import { transcriptText } from "./transcript.ts";

test("renders a whole session as readable plain text", () => {
  const text = transcriptText({
    steps: [
      { kind: "prompt", text: "~/demo $" },
      { kind: "command", text: "make test" },
      { kind: "output", lines: ["ok  pkg/a", { text: "FAIL pkg/b", tone: "fail" }], more: 4 },
      { kind: "user", text: "Fix the failing test" },
      { kind: "thinking" },
      {
        kind: "tool-call",
        name: "Bash",
        server: "local",
        args: "make test",
        meta: "2s",
        status: "error",
        output: ["PASS"],
        more: 3,
        body: { kind: "lines", lines: [{ text: "warn", tone: "warn" }], more: 1 },
      },
      { kind: "tool-call", name: "Read", status: "done", body: { kind: "code", code: "a\nb" } },
      { kind: "tool-call", name: "Plan", body: { kind: "steps", steps: ["one", "two"] } },
      { kind: "tool-call", name: "Query", body: { kind: "error", summary: "Not allowed." } },
      { kind: "tool-call", name: "Chart", body: { kind: "custom", data: { rows: 3 } } },
      { kind: "pause", ms: 100 },
      { kind: "agent-text", lead: "Fixed.", text: "All green." },
      { kind: "user", text: "Thanks" },
      { kind: "agent-text", text: "Any time." },
    ],
  });
  expect(text).toBe(
    [
      "~/demo $ make test",
      "ok  pkg/a",
      "FAIL pkg/b",
      "… +4 lines",
      "",
      "> Fix the failing test",
      "local Bash(make test) · 2s [error]",
      "  PASS",
      "  … +3 lines",
      "  warn",
      "  … +1 lines",
      "Read()",
      "  a",
      "  b",
      "Plan()",
      "  - one",
      "  - two",
      "Query()",
      "  Not allowed.",
      "Chart()",
      "Fixed. All green.",
      "",
      "> Thanks",
      "Any time.",
    ].join("\n"),
  );
});

test("a command without a prompt gets $", () => {
  expect(transcriptText({ steps: [{ kind: "command", text: "ls" }] })).toBe("$ ls");
});

test("a leading user step has no blank line before it, and an empty script is empty", () => {
  expect(transcriptText({ steps: [{ kind: "user", text: "hi" }] })).toBe("> hi");
  expect(transcriptText({ steps: [] })).toBe("");
});

test("validates the script", () => {
  expect(() => transcriptText({ steps: [{ kind: "nope" }] } as never)).toThrow(
    expect.objectContaining({ code: "unsupported_step", field: "steps[0].kind" }),
  );
  try {
    transcriptText({ steps: null } as never);
  } catch (error) {
    expect(isLibraryError(error)).toBe(true);
  }
});
