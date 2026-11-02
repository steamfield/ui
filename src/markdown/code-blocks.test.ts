// @vitest-environment node
import { expect, it } from "vitest";
import { copyControl } from "./code-blocks.ts";

it("gives every copy control its own icon node", () => {
  const icon = (id: string) => {
    const button = copyControl(id, "Copy code", "Copy").children[0];
    if (button?.type !== "element") throw new Error("no button");
    return button.children[0];
  };
  const first = icon("code-1");
  const second = icon("code-2");
  expect(first).toEqual(second);
  expect(first).not.toBe(second);
  if (first?.type === "element" && second?.type === "element") {
    expect(first.children[0]).not.toBe(second.children[0]);
    expect(first.properties).not.toBe(second.properties);
  }
});
