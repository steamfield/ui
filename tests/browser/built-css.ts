import { type APIRequestContext, expect } from "@playwright/test";

/**
 * The href of the playground's built stylesheet, read from the served index.html. Fails rather
 * than returning "" so a no-JS check can't pass by loading no CSS at all.
 */
export async function builtStylesheet(request: APIRequestContext): Promise<string> {
  const index = await (await request.get("/")).text();
  const href = /href="([^"]+\.css)"/.exec(index)?.[1] ?? "";
  expect(href, "index.html links no built stylesheet").not.toBe("");
  return href;
}
