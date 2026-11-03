// The framework-free rules both agent demo bindings render from.
import { describe, expect, test } from "vitest";
import { type AgentDemoTranscript, defaultLabels, transcriptElement, workingText } from "./core.ts";

describe("transcriptElement", () => {
  test.each<[string, AgentDemoTranscript | undefined, ReturnType<typeof transcriptElement>]>([
    ["undefined", undefined, { tag: "div", role: "group", tabIndex: 0 }],
    ["{}", {}, { tag: "div", role: "group", tabIndex: 0 }],
    ['as: "group"', { as: "group" }, { tag: "div", role: "group", tabIndex: 0 }],
    ['as: "region"', { as: "region" }, { tag: "section", role: undefined, tabIndex: 0 }],
    ["focusable: false", { focusable: false }, { tag: "div", role: "group", tabIndex: undefined }],
    ["focusable: true", { focusable: true }, { tag: "div", role: "group", tabIndex: 0 }],
    [
      'as: "region", focusable: false',
      { as: "region", focusable: false },
      { tag: "section", role: undefined, tabIndex: undefined },
    ],
  ])("%s", (_name, options, expected) => {
    expect(transcriptElement(options)).toEqual(expected);
  });

  test("an unknown `as` from JavaScript falls back to the group", () => {
    const options = { as: "landmark" } as unknown as AgentDemoTranscript;
    expect(transcriptElement(options)).toEqual({ tag: "div", role: "group", tabIndex: 0 });
  });
});

describe("workingText", () => {
  const labels = { ...defaultLabels, working: "Running…" };

  test("is the label for a running call in the terminal layout", () => {
    expect(workingText(labels, "terminal", true)).toBe("Running…");
  });

  test.each([
    ["a call that is not running", labels, "terminal", false],
    ["the chat layout", labels, "chat", true],
    ["no working label", defaultLabels, "terminal", true],
  ] as const)("is undefined for %s", (_name, given, layout, running) => {
    expect(workingText(given, layout, running)).toBeUndefined();
  });

  test('passes an empty label through as "", which renders nothing', () => {
    expect(workingText({ ...defaultLabels, working: "" }, "terminal", true)).toBe("");
  });

  test("the default labels set no working text", () => {
    expect("working" in defaultLabels).toBe(false);
  });
});
