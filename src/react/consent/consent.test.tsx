import { act, render, renderHook, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { type ReactElement, StrictMode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { setDocumentCookie, stubReducedMotion } from "../../../tests/helpers/dom.ts";
import { mountConsentBanner } from "../../consent/banner.ts";
import { type ConsentStore, createConsentStore } from "../../consent/store.ts";
import { ConsentBanner } from "./consent-banner.tsx";
import { useConsent } from "./use-consent.ts";

beforeEach(() => {
  setDocumentCookie("sf-consent=; Path=/; Max-Age=0");
  document.body.innerHTML = "";
});

describe("useConsent", () => {
  test("reads the stored decision", () => {
    setDocumentCookie("sf-consent=denied; Path=/");
    const { result } = renderHook(() => useConsent(createConsentStore()));
    expect(result.current.consent).toBe("denied");
  });

  test("accept, decline and reset update it and the cookie", () => {
    const { result } = renderHook(() => useConsent(createConsentStore()));
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
    expect(renderToStaticMarkup(<Probe store={createConsentStore()} />)).toBe("<span>null</span>");
  });
});

describe("<ConsentBanner> with reduced motion", () => {
  beforeEach(() => {
    stubReducedMotion(true);
  });

  const region = (name = "Analytics consent"): HTMLElement | null =>
    screen.queryByRole("region", { name });

  test("renders nothing on the server", () => {
    expect(renderToStaticMarkup(<ConsentBanner store={createConsentStore()} />)).toBe("");
  });

  test("shows at once while undecided, with no animation", () => {
    render(<ConsentBanner store={createConsentStore()} />);
    expect(region()).not.toBeNull();
    expect(region()?.hasAttribute("data-sf-animating")).toBe(false);
    expect(screen.queryByRole("link")).toBeNull();
  });

  test("renders nothing when already decided", () => {
    setDocumentCookie("sf-consent=granted; Path=/");
    render(<ConsentBanner store={createConsentStore()} />);
    expect(region()).toBeNull();
  });

  test("labels come from props", () => {
    render(
      <ConsentBanner
        store={createConsentStore()}
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

  test("survives StrictMode's double mount with one banner", () => {
    render(
      <StrictMode>
        <ConsentBanner store={createConsentStore()} />
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
    expect(() => render(<ConsentBanner store={createConsentStore()} delayMs={-1} />)).toThrow(
      expect.objectContaining({ code: "invalid_option", field: "delayMs" }),
    );
  });

  test("renders the same markup as mountConsentBanner", () => {
    const options = { privacyHref: "/privacy", message: "Hi." } as const;
    const fromReact = render(<ConsentBanner store={createConsentStore()} {...options} />).container;
    const dom = document.createElement("div");
    document.body.append(dom);
    mountConsentBanner(createConsentStore({ cookieName: "other" }), { ...options, container: dom });
    expect(shape(fromReact)).toEqual(shape(dom));
    expect(shape(dom)).toHaveLength(6);
  });
});

describe("<ConsentBanner> with motion allowed", () => {
  test("slides in after delayMs, and an accept while animating removes it", () => {
    stubReducedMotion(false);
    vi.useFakeTimers();
    const store = createConsentStore();
    render(<ConsentBanner store={store} delayMs={500} />);
    expect(screen.queryByRole("region")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByRole("region").hasAttribute("data-sf-animating")).toBe(true);
    act(() => store.accept());
    expect(screen.queryByRole("region")).toBeNull();
  });
});

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
