// The pre-paint gate snippet as a site inlines it: its CSP hash and HTML safety. Lives in tests/
// because recomputing the hash needs node:crypto, which src/ can't import.
import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import { revealGateHash, revealGateScript } from "../src/reveal/index.ts";

describe("revealGateScript as inline HTML", () => {
  test("revealGateHash is the sha256 of the exact string, for CSP 'sha256-…'", () => {
    const hash = createHash("sha256").update(revealGateScript, "utf8").digest("base64");
    expect(revealGateHash).toBe(`sha256-${hash}`);
  });

  test("can't close or comment out the script element it sits in", () => {
    expect(revealGateScript.toLowerCase()).not.toContain("</script");
    expect(revealGateScript).not.toContain("<!--");
  });
});
