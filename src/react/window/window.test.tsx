import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { DemoWindow } from "./index.ts";

test("renders dots, a title, a controls slot and the body, with no heading", () => {
  const { container } = render(
    <DemoWindow title="session" controls={<button type="button">Pause</button>}>
      <p>body</p>
    </DemoWindow>,
  );
  expect(container.querySelector('[data-part="window-dots"]')?.getAttribute("aria-hidden")).toBe(
    "true",
  );
  expect(container.querySelectorAll('[data-part="window-dot"]')).toHaveLength(3);
  expect(container.querySelector('[data-part="window-title"]')?.textContent).toBe("session");
  expect(
    container.querySelector('[data-part="window-controls"]')?.contains(screen.getByRole("button")),
  ).toBe(true);
  expect(container.querySelector('[data-part="window-body"]')?.textContent).toBe("body");
  expect(container.querySelector("h1, h2, h3, h4, h5, h6")).toBeNull();
  expect(screen.queryByRole("region")).toBeNull();
});

test("dots and title are optional, and a label makes it a named region", () => {
  const html = renderToStaticMarkup(
    <DemoWindow dots={false} label="Example session" className="w" style={{ maxWidth: 10 }} />,
  );
  expect(html).not.toContain("window-dots");
  expect(html).not.toContain("window-title");
  expect(html).not.toContain("window-controls");
  expect(html).toMatch(
    /^<section data-part="window" class="w" style="max-width:10px" aria-label="Example session">/,
  );
});
