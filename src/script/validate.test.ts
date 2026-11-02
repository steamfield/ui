import { describe, expect, test } from "vitest";
import { isLibraryError, type LibraryErrorCode } from "./errors.ts";
import type { DemoScript } from "./types.ts";
import { validateScript } from "./validate.ts";

function failure(run: () => void): { code: LibraryErrorCode; field: string | undefined } {
  try {
    run();
  } catch (error) {
    if (isLibraryError(error)) return { code: error.code, field: error.field };
    throw error;
  }
  throw new Error("expected a LibraryError");
}

const every: DemoScript = {
  id: "all-kinds",
  steps: [
    { kind: "user", text: "Fix the failing test", preTyped: "Fix", composer: true, at: 0 },
    { kind: "thinking", ms: 400 },
    { kind: "thinking" },
    { kind: "agent-text", text: "Running it.", lead: "Sure." },
    { kind: "pause", ms: 0 },
    { kind: "prompt", text: "~/demo $" },
    { kind: "command", text: "make test" },
    { kind: "output", lines: ["ok", { text: "1 failed", tone: "fail" }, { text: "x" }], more: 3 },
    {
      kind: "tool-call",
      id: "a",
      name: "Bash",
      server: "local",
      args: "make test",
      status: "error",
      meta: "1s",
      output: ["ok"],
      outputAt: 2,
      more: 0,
      body: { kind: "lines", lines: ["a"], more: 1, at: 2 },
    },
    { kind: "tool-call", id: "b", name: "x", body: { kind: "code", code: "1", lang: "ts" } },
    { kind: "tool-call", name: "x", body: { kind: "code", code: "1", collapsed: true } },
    { kind: "tool-call", name: "x", body: { kind: "steps", steps: ["one"] } },
    { kind: "tool-call", name: "x", body: { kind: "error", summary: "no" } },
    { kind: "tool-call", name: "x", body: { kind: "custom", data: undefined } },
  ],
};

test("accepts every step and body kind", () => {
  expect(() => validateScript(every)).not.toThrow();
  expect(() => validateScript({ steps: [] })).not.toThrow();
});

test("narrows unknown input to a DemoScript", () => {
  const input: unknown = JSON.parse('{"steps":[{"kind":"user","text":"hi"}]}');
  validateScript(input);
  expect(input.steps[0]?.kind).toBe("user");
});

describe("rejects a malformed script, naming the field", () => {
  test.each<[string, unknown, string]>([
    ["a non-object", null, "script"],
    ["an array", [], "script"],
    ["a non-string id", { id: 1, steps: [] }, "script.id"],
    ["missing steps", {}, "steps"],
    ["a non-object step", { steps: [1] }, "steps[0]"],
    ["a step without a kind", { steps: [{ text: "x" }] }, "steps[0].kind"],
    ["user without text", { steps: [{ kind: "user" }] }, "steps[0].text"],
    [
      "preTyped that isn't a prefix",
      { steps: [{ kind: "user", text: "abc", preTyped: "x" }] },
      "steps[0].preTyped",
    ],
    [
      "a non-string preTyped",
      { steps: [{ kind: "user", text: "a", preTyped: 1 }] },
      "steps[0].preTyped",
    ],
    [
      "a non-boolean composer",
      { steps: [{ kind: "user", text: "a", composer: 1 }] },
      "steps[0].composer",
    ],
    ["a fractional at", { steps: [{ kind: "pause", ms: 1, at: 1.5 }] }, "steps[0].at"],
    ["a negative at", { steps: [{ kind: "pause", ms: 1, at: -1 }] }, "steps[0].at"],
    ["agent-text lead", { steps: [{ kind: "agent-text", text: "a", lead: 2 }] }, "steps[0].lead"],
    ["thinking ms", { steps: [{ kind: "thinking", ms: -1 }] }, "steps[0].ms"],
    ["pause without ms", { steps: [{ kind: "pause" }] }, "steps[0].ms"],
    ["infinite pause", { steps: [{ kind: "pause", ms: Number.POSITIVE_INFINITY }] }, "steps[0].ms"],
    ["prompt text", { steps: [{ kind: "prompt" }] }, "steps[0].text"],
    ["command text", { steps: [{ kind: "command", text: 1 }] }, "steps[0].text"],
    ["output lines", { steps: [{ kind: "output", lines: "x" }] }, "steps[0].lines"],
    ["a bad line", { steps: [{ kind: "output", lines: ["a", 2] }] }, "steps[0].lines[1]"],
    ["a line without text", { steps: [{ kind: "output", lines: [{}] }] }, "steps[0].lines[0]"],
    [
      "an unknown tone",
      { steps: [{ kind: "output", lines: [{ text: "a", tone: "red" }] }] },
      "steps[0].lines[0].tone",
    ],
    ["a fractional more", { steps: [{ kind: "output", lines: [], more: 0.5 }] }, "steps[0].more"],
    ["tool-call name", { steps: [{ kind: "tool-call" }] }, "steps[0].name"],
    ["tool-call args", { steps: [{ kind: "tool-call", name: "x", args: 1 }] }, "steps[0].args"],
    ["tool-call more", { steps: [{ kind: "tool-call", name: "x", more: -1 }] }, "steps[0].more"],
    [
      "tool-call output",
      { steps: [{ kind: "tool-call", name: "x", output: [3] }] },
      "steps[0].output[0]",
    ],
    [
      "tool-call output at",
      { steps: [{ kind: "tool-call", name: "x", output: [], outputAt: "1" }] },
      "steps[0].outputAt",
    ],
    [
      "a non-object body",
      { steps: [{ kind: "tool-call", name: "x", body: "b" }] },
      "steps[0].body",
    ],
    [
      "a body at",
      { steps: [{ kind: "tool-call", name: "x", body: { kind: "steps", steps: [], at: -2 } }] },
      "steps[0].body.at",
    ],
    [
      "lines body",
      { steps: [{ kind: "tool-call", name: "x", body: { kind: "lines" } }] },
      "steps[0].body.lines",
    ],
    [
      "lines body more",
      { steps: [{ kind: "tool-call", name: "x", body: { kind: "lines", lines: [], more: "2" } }] },
      "steps[0].body.more",
    ],
    [
      "code body",
      { steps: [{ kind: "tool-call", name: "x", body: { kind: "code" } }] },
      "steps[0].body.code",
    ],
    [
      "code body lang",
      { steps: [{ kind: "tool-call", name: "x", body: { kind: "code", code: "", lang: 1 } }] },
      "steps[0].body.lang",
    ],
    [
      "code body collapsed",
      { steps: [{ kind: "tool-call", name: "x", body: { kind: "code", code: "", collapsed: 1 } }] },
      "steps[0].body.collapsed",
    ],
    [
      "steps body",
      { steps: [{ kind: "tool-call", name: "x", body: { kind: "steps", steps: [1] } }] },
      "steps[0].body.steps[0]",
    ],
    [
      "steps body array",
      { steps: [{ kind: "tool-call", name: "x", body: { kind: "steps" } }] },
      "steps[0].body.steps",
    ],
    [
      "error body",
      { steps: [{ kind: "tool-call", name: "x", body: { kind: "error" } }] },
      "steps[0].body.summary",
    ],
    [
      "custom body without data",
      { steps: [{ kind: "tool-call", name: "x", body: { kind: "custom" } }] },
      "steps[0].body.data",
    ],
    [
      "a duplicate id",
      {
        steps: [
          { kind: "tool-call", id: "a", name: "x" },
          { kind: "tool-call", id: "a", name: "y" },
        ],
      },
      "steps[1].id",
    ],
  ])("%s", (_label, script, field) => {
    expect(failure(() => validateScript(script))).toEqual({ code: "invalid_script", field });
  });
});

test("an unknown step kind is unsupported_step", () => {
  expect(failure(() => validateScript({ steps: [{ kind: "banner" }] }))).toEqual({
    code: "unsupported_step",
    field: "steps[0].kind",
  });
});

test("an unknown body kind is unsupported_step", () => {
  const script = { steps: [{ kind: "tool-call", name: "x", body: { kind: "chart" } }] };
  expect(failure(() => validateScript(script))).toEqual({
    code: "unsupported_step",
    field: "steps[0].body.kind",
  });
});

test("kinds limits the step kinds a renderer accepts", () => {
  const script: DemoScript = {
    steps: [
      { kind: "user", text: "hi" },
      { kind: "command", text: "ls" },
    ],
  };
  expect(() => validateScript(script, { kinds: ["user", "command"] })).not.toThrow();
  expect(failure(() => validateScript(script, { kinds: ["user"] }))).toEqual({
    code: "unsupported_step",
    field: "steps[1].kind",
  });
});

test.each<[string, unknown, string]>([
  ["an unknown kind in kinds", { kinds: ["banner"] }, "kinds"],
  ["a non-array kinds", { kinds: "user" }, "kinds"],
  ["an unknown option", { kind: ["user"] }, "kind"],
  ["a non-object options argument", 3, "options"],
])("rejects %s with invalid_option", (_label, options, field) => {
  const run = () => validateScript({ steps: [] }, options as never);
  expect(failure(run)).toEqual({ code: "invalid_option", field });
});
