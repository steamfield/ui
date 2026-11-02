import { expect, test } from "vitest";
import { isLibraryError, LibraryError } from "./errors.ts";

test("carries its code, field and cause", () => {
  const cause = new Error("root");
  const error = new LibraryError("invalid_option", { field: "speed", cause });
  expect(error).toBeInstanceOf(Error);
  expect(error.name).toBe("LibraryError");
  expect(error.code).toBe("invalid_option");
  expect(error.field).toBe("speed");
  expect(error.message).toBe("An option has an invalid value. (speed)");
  expect(error.cause).toBe(cause);
});

test("has a fixed message without a field", () => {
  const error = new LibraryError("invalid_script");
  expect(error.message).toBe("The demo script is malformed.");
  expect(error.field).toBeUndefined();
  expect("cause" in error).toBe(false);
});

test("isLibraryError recognizes a copy from another install by name and code", () => {
  const copy = Object.assign(new Error("x"), { name: "LibraryError", code: "invalid_script" });
  expect(isLibraryError(new LibraryError("unsupported_step"))).toBe(true);
  expect(isLibraryError(copy)).toBe(true);
});

test.each([
  ["a plain error", new Error("x")],
  ["an unknown code", Object.assign(new Error("x"), { name: "LibraryError", code: "nope" })],
  ["an inherited code", Object.assign(new Error("x"), { name: "LibraryError", code: "toString" })],
  ["a plain object", { name: "LibraryError", code: "invalid_script" }],
  ["undefined", undefined],
])("isLibraryError rejects %s", (_label, value) => {
  expect(isLibraryError(value)).toBe(false);
});
