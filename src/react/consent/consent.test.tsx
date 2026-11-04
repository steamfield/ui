// Every store is created once, outside render, as the docs require: a store created inline in
// render would be a new store on every render.
import { act, render, renderHook, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { type ReactElement, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { beforeEach, describe, expect, onTestFinished, test, vi } from "vitest";
import { setDocumentCookie, stubReducedMotion } from "../../../tests/helpers/dom.ts";
import { mountConsentBanner } from "../../consent/banner.ts";
import { type ConsentStore, createConsentStore } from "../../consent/store.ts";
import { ConsentBanner } from "./consent-banner.tsx";
import { useConsent } from "./use-consent.ts";

beforeEach(() => {
  setDocumentCookie("sf-consent=; Path=/; Max-Age=0");
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-sf-motion");
});

const region = (name = "Analytics consent"): HTMLElement | null =>
  screen.queryByRole("region", { name });

describe("useConsent", () => {
  test("reads the stored decision", () => {
    setDocumentCookie("sf-consent=denied; Path=/");
    const store = createConsentStore();
    const { result } = renderHook(() => useConsent(store));
    expect(result.current.consent).toBe("denied");
  });

  test("accept, decline and reset update it and the cookie", () => {
    const store = createConsentStore();
    const { result } = renderHook(() => useConsent(store));
    expect(result.current.consent).toBeNull();
    act(() => result.current.accept());
    expect(result.current.consent).toBe("granted");
    act(() => result.current.decline());
    expect(result.current.consent).toBe("denied");
    expect(createConsentStore().getState()).toBe("denied");
    act(() => result.current.reset());
    expect(result.current.consent).toBeNull();
    expect(createConsentStore().getState()).toBeNull();
  });

  test("follows a decision made through the store elsewhere", () => {
    const store = createConsentStore();
    const { result } = renderHook(() => useConsent(store));
    act(() => store.accept());
    expect(result.current.consent).toBe("granted");
  });

  test("is undecided on the server", () => {
    setDocumentCookie("sf-consent=granted; Path=/");
    const store = createConsentStore();
    expect(renderToStaticMarkup(<Probe store={store} />)).toBe("<span>null</span>");
  });
});

describe("hydration", () => {
  beforeEach(() => {
    stubReducedMotion(true);
  });

  async function hydrate(store: ConsentStore): Promise<HTMLElement> {
    const container = document.createElement("div");
    container.innerHTML = renderToString(<App store={store} />);
    document.body.append(container);
    await act(async () => {
      hydrateRoot(container, <App store={store} />);
    });
    return container;
  }

  test.each([
    ["granted", "sf-consent=granted; Path=/", "granted", false],
    ["undecided", "", "null", true],
  ])(
    "%s: hydrates without a mismatch, then shows the stored state",
    async (_, cookie, shown, banner) => {
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      if (cookie) setDocumentCookie(cookie);
      const store = createConsentStore();
      // The server render is the same for both: undecided, and no banner.
      expect(renderToString(<App store={store} />)).toBe("<main><span>null</span></main>");
      const container = await hydrate(store);
      expect(errors).not.toHaveBeenCalled();
      expect(container.querySelector("span")?.textContent).toBe(shown);
      expect(region() !== null).toBe(banner);
    },
  );
});

describe("<ConsentBanner> with reduced motion", () => {
  beforeEach(() => {
    stubReducedMotion(true);
  });

  test("renders nothing on the server", () => {
    const store = createConsentStore();
    expect(renderToStaticMarkup(<ConsentBanner store={store} />)).toBe("");
  });

  test("shows at once while undecided, with no animation", () => {
    const store = createConsentStore();
    render(<ConsentBanner store={store} />);
    expect(region()).not.toBeNull();
    expect(region()?.hasAttribute("data-sf-animating")).toBe(false);
    expect(screen.queryByRole("link")).toBeNull();
  });

  test("renders nothing when already decided", () => {
    setDocumentCookie("sf-consent=granted; Path=/");
    const store = createConsentStore();
    render(<ConsentBanner store={store} />);
    expect(region()).toBeNull();
  });

  test("labels come from props", () => {
    const store = createConsentStore();
    render(
      <ConsentBanner
        store={store}
        message="We count visits."
        acceptLabel="Allow"
        declineLabel="No thanks"
        privacyLabel="How we count"
        privacyHref="/privacy"
        label="Cookie choice"
      />,
    );
    expect(region("Cookie choice")?.textContent).toContain("We count visits.");
    expect(screen.getByRole("button", { name: "Allow" })).toBeDefined();
    expect(screen.getByRole("button", { name: "No thanks" })).toBeDefined();
    expect(screen.getByRole("link", { name: "How we count" }).getAttribute("href")).toBe(
      "/privacy",
    );
  });

  test.each([
    ["Accept", "granted"],
    ["Decline", "denied"],
  ])("%s records %s and removes the banner", async (name, state) => {
    const store = createConsentStore();
    render(<ConsentBanner store={store} />);
    await userEvent.click(screen.getByRole("button", { name }));
    expect(store.getState()).toBe(state);
    expect(createConsentStore().getState()).toBe(state);
    expect(region()).toBeNull();
  });

  test("a decision from elsewhere removes it, and reset brings it back", () => {
    const store = createConsentStore();
    render(<ConsentBanner store={store} />);
    act(() => store.accept());
    expect(region()).toBeNull();
    act(() => store.reset());
    expect(region()).not.toBeNull();
  });

  test("a keyboard Accept returns focus to where it was before entering the banner", async () => {
    const store = createConsentStore();
    render(
      <>
        <button type="button">Page</button>
        <ConsentBanner store={store} privacyHref="/privacy" />
      </>,
    );
    const page = screen.getByRole("button", { name: "Page" });
    page.focus();
    const user = userEvent.setup();
    await user.tab();
    await user.tab();
    await user.tab();
    expect(document.activeElement?.textContent).toBe("Accept");
    await user.keyboard("{Enter}");
    expect(region()).toBeNull();
    expect(document.activeElement).toBe(page);
  });

  test("unmounting with focus inside returns it too", () => {
    const store = createConsentStore();
    const before = document.createElement("button");
    document.body.append(before);
    before.focus();
    const { unmount } = render(<ConsentBanner store={store} />);
    screen.getByRole("button", { name: "Accept" }).focus();
    unmount();
    expect(document.activeElement).toBe(before);
  });

  test("switching to a decided store returns focus too", () => {
    onTestFinished(() => setDocumentCookie("other=; Path=/; Max-Age=0"));
    const store = createConsentStore();
    setDocumentCookie("other=granted; Path=/");
    const decided = createConsentStore({ cookieName: "other" });
    const before = document.createElement("button");
    document.body.append(before);
    before.focus();
    const { rerender } = render(<ConsentBanner store={store} />);
    screen.getByRole("button", { name: "Accept" }).focus();
    rerender(<ConsentBanner store={decided} />);
    expect(region()).toBeNull();
    expect(document.activeElement).toBe(before);
  });

  test("survives StrictMode's double mount with one banner", () => {
    const store = createConsentStore();
    render(
      <StrictMode>
        <ConsentBanner store={store} />
      </StrictMode>,
    );
    expect(screen.getAllByRole("region")).toHaveLength(1);
  });

  test("unmount stops following the store", () => {
    const store = createConsentStore();
    const { unmount } = render(<ConsentBanner store={store} />);
    unmount();
    act(() => {
      store.accept();
      store.reset();
    });
    expect(region()).toBeNull();
  });

  test("a bad prop throws invalid_option during render", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const store = createConsentStore();
    expect(() => render(<ConsentBanner store={store} delayMs={-1} />)).toThrow(
      expect.objectContaining({ code: "invalid_option", field: "delayMs" }),
    );
  });

  test("renders the same markup as mountConsentBanner", () => {
    const options = { privacyHref: "/privacy", message: "Hi." } as const;
    const store = createConsentStore();
    const fromReact = render(<ConsentBanner store={store} {...options} />).container;
    const dom = document.createElement("div");
    document.body.append(dom);
    mountConsentBanner(createConsentStore({ cookieName: "other" }), { ...options, container: dom });
    expect(shape(fromReact)).toEqual(shape(dom));
    expect(shape(dom)).toHaveLength(6);
  });
});

describe("<ConsentBanner> with motion allowed", () => {
  beforeEach(() => {
    stubReducedMotion(false);
    vi.useFakeTimers();
  });

  test.each([500, 0])("under StrictMode it slides in after delayMs %i", (delayMs) => {
    const store = createConsentStore();
    render(
      <StrictMode>
        <ConsentBanner store={store} delayMs={delayMs} />
      </StrictMode>,
    );
    act(() => {
      vi.advanceTimersByTime(delayMs);
    });
    expect(screen.getAllByRole("region")).toHaveLength(1);
    expect(region()?.hasAttribute("data-sf-animating")).toBe(true);
  });

  test("reopening after reset slides in again", () => {
    const store = createConsentStore();
    render(<ConsentBanner store={store} delayMs={0} />);
    act(() => store.accept());
    expect(region()).toBeNull();
    act(() => store.reset());
    expect(region()?.hasAttribute("data-sf-animating")).toBe(true);
  });

  test("slides in after delayMs, and an accept while animating removes it", () => {
    const store = createConsentStore();
    render(<ConsentBanner store={store} delayMs={500} />);
    expect(region()).toBeNull();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(region()?.hasAttribute("data-sf-animating")).toBe(true);
    act(() => store.accept());
    expect(region()).toBeNull();
  });

  test("a re-render during the delay doesn't restart it", () => {
    const store = createConsentStore();
    const { rerender } = render(<ConsentBanner store={store} delayMs={500} message="One." />);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    rerender(<ConsentBanner store={store} delayMs={500} message="Two." />);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(region()?.textContent).toContain("Two.");
  });

  test("inside a [data-sf-motion=reduce] ancestor it renders without animation", () => {
    const store = createConsentStore();
    render(
      <div data-sf-motion="reduce">
        <ConsentBanner store={store} delayMs={0} />
      </div>,
    );
    expect(region()).not.toBeNull();
    expect(region()?.hasAttribute("data-sf-animating")).toBe(false);
  });
});

function App({ store }: { readonly store: ConsentStore }): ReactElement {
  return (
    <main>
      <Probe store={store} />
      <ConsentBanner store={store} />
    </main>
  );
}

function Probe({ store }: { readonly store: ConsentStore }): ReactElement {
  return <span>{String(useConsent(store).consent)}</span>;
}

/** Each element's tag, sorted attributes and own text, in document order. */
function shape(root: Element): string[] {
  return [...root.querySelectorAll("*")].map((el) => {
    const attrs = [...el.attributes].map((a) => `${a.name}=${a.value}`).sort();
    const text = [...el.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent)
      .join("");
    return `${el.tagName} ${attrs.join(" ")} ${text}`;
  });
}
