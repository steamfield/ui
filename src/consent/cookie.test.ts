// The cookie writer the store uses: attributes aren't readable back from `document.cookie`, so
// they are checked here for each kind of host. store.test.ts covers the real read/write path.
import { describe, expect, test } from "vitest";
import { consentCookie, readConsentCookie } from "./cookie.ts";

const year = { maxAge: 31_536_000, domain: "steamfield.io" };
const at = (url: string): URL => new URL(url);

describe("consentCookie domain scoping", () => {
  test.each([
    ["the domain itself", "https://steamfield.io/", "Domain=.steamfield.io"],
    ["a subdomain", "https://rr.steamfield.io/x", "Domain=.steamfield.io"],
    ["a nested subdomain", "https://a.b.steamfield.io/", "Domain=.steamfield.io"],
    ["an upper-case host", "https://RR.Steamfield.IO/", "Domain=.steamfield.io"],
  ])("%s gets the shared domain", (_, url, expected) => {
    expect(consentCookie("sf-consent", "granted", year, at(url))).toContain(`; ${expected}`);
  });

  test.each([
    ["localhost", "http://localhost:4321/"],
    ["127.0.0.1", "http://127.0.0.1:4321/"],
    ["an unrelated host", "https://example.com/"],
    ["a host that only ends with the name", "https://notsteamfield.io/"],
    ["a host that contains the domain", "https://steamfield.io.evil.com/"],
    ["a preview host", "https://abc123.steamfield.pages.dev/"],
  ])("%s gets a host-only cookie", (_, url) => {
    expect(consentCookie("sf-consent", "granted", year, at(url))).not.toContain("Domain=");
  });

  test("no configured domain is host-only everywhere", () => {
    const cookie = consentCookie(
      "sf-consent",
      "denied",
      { maxAge: 60, domain: undefined },
      at("https://steamfield.io/"),
    );
    expect(cookie).toBe("sf-consent=denied; Path=/; Max-Age=60; SameSite=Lax; Secure");
  });
});

describe("consentCookie attributes", () => {
  test("a decision on https is Path=/, Max-Age, SameSite=Lax, Domain and Secure", () => {
    expect(consentCookie("sf-consent", "granted", year, at("https://rr.steamfield.io/"))).toBe(
      "sf-consent=granted; Path=/; Max-Age=31536000; SameSite=Lax; Domain=.steamfield.io; Secure",
    );
  });

  test("http drops Secure", () => {
    expect(consentCookie("sf-consent", "denied", year, at("http://localhost:4321/"))).toBe(
      "sf-consent=denied; Path=/; Max-Age=31536000; SameSite=Lax",
    );
  });

  test("clearing writes an empty value with Max-Age=0 and the same scope", () => {
    expect(consentCookie("sf-consent", null, year, at("https://steamfield.io/"))).toBe(
      "sf-consent=; Path=/; Max-Age=0; SameSite=Lax; Domain=.steamfield.io; Secure",
    );
  });
});

describe("readConsentCookie", () => {
  test.each([
    ["sf-consent=granted", "granted"],
    ["a=1; sf-consent=denied; b=2", "denied"],
    ["sf-consent=", null],
    ["sf-consent=GRANTED", null],
    ["sf-consent=granted%20", null],
    ["sf-consent", null],
    ["", null],
    ["other=granted", null],
    ["x-sf-consent=granted", null],
    ["sf-consent-old=granted", null],
  ])("%j reads as %s", (cookie, expected) => {
    expect(readConsentCookie(cookie, "sf-consent")).toBe(expected);
  });

  test("the first matching cookie wins, as the browser lists the most specific first", () => {
    expect(readConsentCookie("sf-consent=denied; sf-consent=granted", "sf-consent")).toBe("denied");
  });
});
