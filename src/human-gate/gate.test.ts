import { describe, expect, it, vi } from "vitest";
import { HUMAN_SIGNALS } from "./events.ts";
import {
  createHumanGate,
  type HumanGate,
  type HumanGateCaptureOptions,
  humanGate,
} from "./gate.ts";

let uuidCounter = 0;

function event(name: string, properties: Record<string, unknown> = {}) {
  const n = String(++uuidCounter).padStart(12, "0");
  return {
    event: name,
    properties,
    uuid: `0192a000-0000-7000-8000-${n}`,
    timestamp: new Date("2026-10-02T12:00:00Z"),
  };
}

/**
 * Does what posthog-js does with a replay: builds a fresh event at the current time under the uuid
 * it was given and runs it through `before_send`. Records what `before_send` let out.
 */
function sdkLikeClient(gate: HumanGate) {
  const sent: ReturnType<typeof event>[] = [];
  const capture = vi.fn(
    (name: string, properties?: Record<string, unknown>, options?: HumanGateCaptureOptions) => {
      const fresh = {
        event: name,
        properties: { ...properties, recomputed: true },
        uuid: options?.uuid as string,
        timestamp: new Date(),
      };
      const out = gate.filter(fresh);
      if (out) sent.push(out);
    },
  );
  return { capture, sent };
}

/** Happy-dom marks dispatched events untrusted; this one claims otherwise. */
function trusted(type: string): Event {
  const e = new Event(type);
  Object.defineProperty(e, "isTrusted", { value: true });
  return e;
}

/** Collects what the gate rethrows from microtasks instead of letting them fail the run. */
function catchRethrown(): Array<() => void> {
  const later: Array<() => void> = [];
  vi.spyOn(globalThis, "queueMicrotask").mockImplementation((cb) => {
    later.push(cb);
  });
  return later;
}

describe("createHumanGate", () => {
  it("holds behavioral events until a signal, then ships the held payload verbatim", () => {
    const gate = createHumanGate(new EventTarget());
    const client = sdkLikeClient(gate);
    gate.attach(client);

    const viewed = event("item_viewed", { source: "list" });
    expect(gate.filter(viewed)).toBeNull();
    expect(client.capture).not.toHaveBeenCalled();

    gate.markHuman();

    // The SDK's recomputed event is swapped for the original: same object, original timestamp,
    // none of the replay-time properties.
    expect(client.sent).toEqual([viewed]);
    expect(client.sent[0]).toBe(viewed);
  });

  it("replays under the held uuid with no timestamp and no rate-limit charge", () => {
    const gate = createHumanGate(new EventTarget());
    const client = { capture: vi.fn() };
    gate.attach(client);

    const viewed = event("item_viewed", { source: "list" });
    gate.filter(viewed);
    gate.markHuman();

    // A stale `timestamp` here would reach posthog-js's session manager.
    expect(client.capture).toHaveBeenCalledWith(
      "item_viewed",
      { source: "list" },
      { uuid: viewed.uuid, skip_client_rate_limiting: true },
    );
  });

  it("replays an event held without a uuid with only the rate-limit skip", () => {
    const gate = createHumanGate(new EventTarget());
    const client = { capture: vi.fn() };
    gate.attach(client);

    gate.filter({ event: "item_viewed", properties: {} });
    gate.markHuman();

    expect(client.capture).toHaveBeenCalledWith(
      "item_viewed",
      {},
      { skip_client_rate_limiting: true },
    );
  });

  it("lets a fresh event with an unrelated uuid through once open", () => {
    const gate = createHumanGate(new EventTarget());
    const client = sdkLikeClient(gate);
    gate.attach(client);
    gate.filter(event("item_viewed"));
    gate.markHuman();

    const later = event("item_viewed");
    expect(gate.filter(later)).toBe(later);
  });

  it("lets replayed and later events through unchanged", () => {
    const gate = createHumanGate(new EventTarget());
    gate.markHuman();

    const e = event("item_viewed");
    expect(gate.filter(e)).toBe(e);
  });

  it("passes a null event through as null", () => {
    expect(createHumanGate(new EventTarget()).filter(null)).toBeNull();
  });

  it("drops $pageleave before a signal instead of holding it", () => {
    const gate = createHumanGate(new EventTarget());
    const client = { capture: vi.fn() };
    gate.attach(client);

    expect(gate.filter(event("$pageleave"))).toBeNull();
    gate.markHuman();

    expect(client.capture).not.toHaveBeenCalled();
  });

  it.each([
    "$exception",
    "$identify",
    "$create_alias",
    "$merge_dangerously",
    "$set",
    "$groupidentify",
    "$snapshot",
  ])("passes %s before any signal", (name) => {
    const gate = createHumanGate(new EventTarget());
    const e = event(name);
    expect(gate.filter(e)).toBe(e);
  });

  it("sends nothing for a visitor who never interacts", () => {
    const gate = createHumanGate(new EventTarget());
    const client = { capture: vi.fn() };
    gate.attach(client);

    gate.filter(event("$pageview"));
    gate.filter(event("item_viewed"));

    expect(client.capture).not.toHaveBeenCalled();
  });

  it("waits for a client before replaying what it held", () => {
    const gate = createHumanGate(new EventTarget());
    gate.filter(event("item_viewed"));
    gate.markHuman();

    const client = { capture: vi.fn() };
    gate.attach(client);

    expect(client.capture).toHaveBeenCalledTimes(1);
  });

  it("runs whenHuman callbacks before replaying held events", () => {
    const gate = createHumanGate(new EventTarget());
    const order: string[] = [];
    gate.attach({ capture: (name: string) => order.push(name) });

    gate.filter(event("item_viewed"));
    gate.whenHuman(() => order.push("$pageview"));
    gate.markHuman();

    expect(order).toEqual(["$pageview", "item_viewed"]);
  });

  it("runs whenHuman immediately once open", () => {
    const gate = createHumanGate(new EventTarget());
    gate.markHuman();
    const callback = vi.fn();

    gate.whenHuman(callback);

    expect(callback).toHaveBeenCalledOnce();
  });

  it.each(HUMAN_SIGNALS)("opens on a trusted %s", (type) => {
    const target = new EventTarget();
    const gate = createHumanGate(target);

    target.dispatchEvent(trusted(type));

    expect(gate.isHuman()).toBe(true);
  });

  it("ignores untrusted, script-dispatched input", () => {
    const target = new EventTarget();
    const gate = createHumanGate(target);

    target.dispatchEvent(new Event("pointermove"));

    expect(gate.isHuman()).toBe(false);
  });

  it.each(["focus", "focusin"])(
    "does not open on %s, which a crawler can cause without input",
    (type) => {
      const target = new EventTarget();
      const gate = createHumanGate(target);

      target.dispatchEvent(trusted(type));

      expect(gate.isHuman()).toBe(false);
    },
  );

  it("opens on a screen reader's synthesized click with no pointer events", () => {
    const target = new EventTarget();
    const gate = createHumanGate(target);

    target.dispatchEvent(trusted("click"));

    expect(gate.isHuman()).toBe(true);
  });

  it("does not treat scroll as a signal, since rendering crawlers scroll", () => {
    const target = new EventTarget();
    const gate = createHumanGate(target);

    target.dispatchEvent(trusted("scroll"));

    expect(gate.isHuman()).toBe(false);
  });

  it("caps what it holds so a long-lived bot page cannot grow memory", () => {
    const gate = createHumanGate(new EventTarget());
    const client = { capture: vi.fn() };
    gate.attach(client);

    for (let i = 0; i < 150; i++) gate.filter(event("read_progress"));
    gate.markHuman();

    expect(client.capture).toHaveBeenCalledTimes(100);
  });

  it("opens only through markHuman without an event target", () => {
    const gate = createHumanGate(undefined);
    expect(gate.isHuman()).toBe(false);

    gate.markHuman();

    expect(gate.isHuman()).toBe(true);
  });

  it("reset closes the gate, forgets what it held and listens again", () => {
    const target = new EventTarget();
    const gate = createHumanGate(target);
    const client = { capture: vi.fn() };
    gate.attach(client);
    gate.markHuman();

    gate.reset();
    expect(gate.isHuman()).toBe(false);
    gate.filter(event("item_viewed"));
    target.dispatchEvent(trusted("keydown"));

    // Open again, but with no client attached: the old one was dropped.
    expect(gate.isHuman()).toBe(true);
    expect(client.capture).not.toHaveBeenCalled();
  });

  describe("when a callback or replay throws", () => {
    it("still replays held events after a whenHuman callback throws, then rethrows its error", () => {
      const rethrown = catchRethrown();
      const gate = createHumanGate(new EventTarget());
      const client = sdkLikeClient(gate);
      gate.attach(client);
      const viewed = event("item_viewed");
      gate.filter(viewed);
      const second = vi.fn();
      gate.whenHuman(() => {
        throw new Error("boom");
      });
      gate.whenHuman(second);

      expect(() => gate.markHuman()).not.toThrow();

      expect(second).toHaveBeenCalledOnce();
      expect(client.sent).toEqual([viewed]);
      expect(rethrown).toHaveLength(1);
      expect(() => rethrown[0]?.()).toThrow("boom");
    });

    it("replays the rest when one replay capture throws, then rethrows its error", () => {
      const rethrown = catchRethrown();
      const gate = createHumanGate(new EventTarget());
      const names: string[] = [];
      gate.attach({
        capture: (name: string) => {
          if (name === "first") throw new Error("boom");
          names.push(name);
        },
      });
      gate.filter(event("first"));
      gate.filter(event("second"));

      gate.markHuman();

      expect(names).toEqual(["second"]);
      expect(rethrown).toHaveLength(1);
      expect(() => rethrown[0]?.()).toThrow("boom");
    });
  });

  describe("deferred whenHuman captures", () => {
    it("ships at the time it was asked for, without a timestamp option", () => {
      vi.useFakeTimers({ now: new Date("2026-10-02T12:00:00Z") });
      const gate = createHumanGate(new EventTarget());
      const client = sdkLikeClient(gate);
      const since = new Date();
      gate.whenHuman((options) => client.capture("$pageview", {}, options), since);

      vi.advanceTimersByTime(24 * 60_000);
      gate.markHuman();

      // A `timestamp` option would reach posthog-js's session manager.
      const [, , options] = client.capture.mock.calls[0] ?? [];
      expect(options).toEqual({ uuid: expect.any(String) });
      expect(client.sent).toHaveLength(1);
      expect(client.sent[0]?.timestamp).toEqual(since);
    });

    it("leaves an unrelated event's time alone", () => {
      vi.useFakeTimers({ now: new Date("2026-10-02T12:00:00Z") });
      const gate = createHumanGate(new EventTarget());
      const client = sdkLikeClient(gate);
      gate.whenHuman((options) => client.capture("$pageview", {}, options));
      vi.advanceTimersByTime(5_000);
      gate.markHuman();

      const later = event("item_viewed");
      later.timestamp = new Date();
      expect(gate.filter(later)?.timestamp).toEqual(new Date());
    });

    it("passes nothing when the gate is already open", () => {
      const gate = createHumanGate(new EventTarget());
      gate.markHuman();
      const callback = vi.fn();

      gate.whenHuman(callback, new Date(0));

      expect(callback).toHaveBeenCalledWith(undefined);
    });

    it("gives an event held before the pageview that pageview's id", () => {
      const gate = createHumanGate(new EventTarget());
      // posthog-js stamps the current pageview's id on every event, and the pageview's id is its
      // uuid. Nothing has one until the deferred pageview is captured.
      let currentPageview: string | undefined;
      const sent: { event: string; properties: Record<string, unknown> }[] = [];
      const client = {
        capture: (
          name: string,
          properties?: Record<string, unknown>,
          options?: HumanGateCaptureOptions,
        ) => {
          const uuid = options?.uuid ?? crypto.randomUUID();
          if (name === "$pageview") currentPageview = uuid;
          const out = gate.filter({
            event: name,
            properties: { ...properties, $pageview_id: currentPageview },
            uuid,
            timestamp: new Date(),
          });
          if (out) sent.push(out);
        },
      };
      gate.attach(client);
      gate.whenHuman((options) => client.capture("$pageview", {}, options));
      gate.filter(event("item_viewed"));

      gate.markHuman();

      const pageview = sent.find((e) => e.event === "$pageview");
      const viewed = sent.find((e) => e.event === "item_viewed");
      expect(pageview?.properties.$pageview_id).toEqual(expect.any(String));
      expect(viewed?.properties.$pageview_id).toBe(pageview?.properties.$pageview_id);
    });

    it("nets out a backdated pageview's own shift from its previous-page duration", () => {
      vi.useFakeTimers({ now: new Date("2026-10-02T12:00:00Z") });
      const gate = createHumanGate(new EventTarget());
      // Two pageviews before the signal, 2 minutes apart. posthog-js captures both at the signal,
      // so it reports 0s between them.
      const ids: string[] = [];
      const sent: { event: string; properties: Record<string, unknown> }[] = [];
      const capture = (
        name: string,
        _properties?: Record<string, unknown>,
        options?: HumanGateCaptureOptions,
      ) => {
        const uuid = options?.uuid as string;
        const prev = ids.at(-1);
        ids.push(uuid);
        const out = gate.filter({
          event: name,
          properties: prev ? { $prev_pageview_id: prev, $prev_pageview_duration: 0 } : {},
          uuid,
          timestamp: new Date(),
        });
        if (out) sent.push(out);
      };
      gate.whenHuman((options) => capture("$pageview", {}, options));
      vi.advanceTimersByTime(2 * 60_000);
      gate.whenHuman((options) => capture("$pageview", {}, options));
      vi.advanceTimersByTime(8 * 60_000);

      gate.markHuman();

      expect(sent[1]?.properties.$prev_pageview_duration).toBe(120);
    });

    it("adds the pre-signal dwell to the first pageleave after a backdated pageview", () => {
      vi.useFakeTimers({ now: new Date("2026-10-02T12:00:00Z") });
      const gate = createHumanGate(new EventTarget());
      let pageviewId = "";
      gate.whenHuman((options) => {
        pageviewId = options?.uuid ?? "";
        gate.filter({ event: "$pageview", properties: {}, uuid: pageviewId });
      });
      vi.advanceTimersByTime(30_000);
      gate.markHuman();

      // posthog-js timed the pageview from the signal, so it reports only the 5s after it.
      const leave = event("$pageleave", {
        $prev_pageview_id: pageviewId,
        $prev_pageview_duration: 5,
      });
      const again = event("$pageleave", {
        $prev_pageview_id: pageviewId,
        $prev_pageview_duration: 5,
      });

      expect(gate.filter(leave)?.properties.$prev_pageview_duration).toBe(35);
      // The shift is spent once.
      expect(gate.filter(again)?.properties.$prev_pageview_duration).toBe(5);
    });

    it("remembers only the latest backdated pageviews' shifts", () => {
      vi.useFakeTimers({ now: new Date("2026-10-02T12:00:00Z") });
      const gate = createHumanGate(new EventTarget());
      const ids: string[] = [];
      for (let i = 0; i < 11; i++) {
        gate.whenHuman((options) => {
          const uuid = options?.uuid ?? "";
          ids.push(uuid);
          gate.filter({ event: "$pageview", properties: {}, uuid });
        });
      }
      vi.advanceTimersByTime(10_000);
      gate.markHuman();

      const leaving = (id: string | undefined) =>
        gate.filter(event("$pageleave", { $prev_pageview_id: id, $prev_pageview_duration: 1 }))
          ?.properties.$prev_pageview_duration;

      // The first of eleven was forgotten; the last is still there.
      expect(leaving(ids[0])).toBe(1);
      expect(leaving(ids[10])).toBe(11);
    });

    describe("without crypto.randomUUID", () => {
      it("sends the deferred capture at the time it is sent", () => {
        vi.stubGlobal("crypto", {});
        const gate = createHumanGate(new EventTarget());
        const callback = vi.fn();
        gate.whenHuman(callback, new Date(0));

        expect(() => gate.markHuman()).not.toThrow();

        expect(callback).toHaveBeenCalledWith(undefined);
        const now = { event: "$pageview", properties: {}, timestamp: new Date() };
        expect(gate.filter(now)).toEqual({
          event: "$pageview",
          properties: {},
          timestamp: now.timestamp,
        });
      });
    });
  });
});

describe("humanGate", () => {
  it("is the page's gate, opened by trusted input on window", () => {
    try {
      window.dispatchEvent(trusted("pointerdown"));
      expect(humanGate.isHuman()).toBe(true);
    } finally {
      humanGate.reset();
    }
    expect(humanGate.isHuman()).toBe(false);
  });
});
