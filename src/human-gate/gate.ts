/**
 * Holds analytics until the visitor does something only a person does.
 *
 * Many headless crawlers get past posthog-js's own bot filter: they present an ordinary desktop
 * Chrome user agent, leave `navigator.webdriver` false, load one page, and are gone within a
 * second. Nothing in the user agent separates them from people. What does is that they never move
 * a pointer, press a key, touch the screen, or turn a wheel.
 *
 * So nothing behavioral leaves the browser until one of those trusted input events fires
 * (`HUMAN_SIGNALS`). Events captured before then are held in memory; on the first signal each is
 * re-captured under its own `uuid`, and the filter hands back the held payload verbatim, so a
 * person's timeline, session, and identity properties are exactly what they were when the event
 * happened, except a missing `$pageview_id`, which takes the deferred pageview's. A visitor who
 * leaves without a signal never sends anything, and `$pageleave` before one is dropped outright
 * rather than held. Every signal must be `isTrusted`, so a page script dispatching synthetic events
 * cannot open the gate.
 *
 * The cost is a real person who lands and leaves without touching anything. That includes any
 * screen reader's virtual-cursor reading (NVDA/JAWS browse mode, VoiceOver, TalkBack swipes)
 * without activating a control, which fires none of these. That population is indistinguishable
 * from a crawler, so losing it is the trade.
 */
import {
  DROPPED_UNTIL_HUMAN,
  type GatedEvent,
  HUMAN_SIGNALS,
  MAX_HELD,
  MAX_PAGEVIEW_SHIFTS,
  UNGATED_EVENTS,
} from "./events.ts";

/** The `capture` options the gate passes when it replays a held event. */
export interface HumanGateCaptureOptions {
  uuid?: string;
  skip_client_rate_limiting?: boolean;
}

/** The slice of a PostHog client the gate replays through. A posthog-js instance fits. */
export interface HumanGateClient {
  capture(
    event: string,
    properties?: Record<string, unknown>,
    options?: HumanGateCaptureOptions,
  ): unknown;
}

/**
 * What a deferred `whenHuman` callback passes as `capture` options: a uuid the gate recognises in
 * `filter`, where it stamps the event with the time the callback was registered. Never a
 * `timestamp` option. posthog-js hands that to its session manager, which writes it back as the
 * session's last activity, so a backdated capture rewinds the session and can rotate it on the
 * next event.
 */
export type DeferredCaptureOptions = { uuid: string } | undefined;

export interface HumanGate {
  /**
   * A `before_send` filter. Holds or drops gated events until a signal.
   *
   * Never hold `$pageview` here: re-capturing one runs posthog-js's pageview bookkeeping a second
   * time and corrupts `$prev_pageview_*`. Gate pageview *calls* upstream with `whenHuman` instead.
   */
  readonly filter: <T extends GatedEvent>(event: T | null) => T | null;
  /** Whether a trusted signal has been seen. */
  readonly isHuman: () => boolean;
  /**
   * Run now if a signal has been seen, otherwise on the first one.
   *
   * A deferred callback receives `{ uuid }` to pass to `capture`; the event that comes through
   * `filter` under that uuid ships with `since` as its timestamp. Run straight away, the callback
   * receives `undefined`.
   */
  readonly whenHuman: (callback: (options: DeferredCaptureOptions) => void, since?: Date) => void;
  /** The client held events are replayed through. Replays anything waiting. */
  readonly attach: (client: HumanGateClient) => void;
  /** Open the gate. Called by the input listeners; exported for tests. */
  readonly markHuman: () => void;
  /** Test-only: back to the closed state, with nothing held. */
  readonly reset: () => void;
}

/**
 * A gate listening for `HUMAN_SIGNALS` on `target` (default `window`; without one, such as during
 * server rendering, only `markHuman` opens it).
 *
 * A `whenHuman` callback or replayed `capture` that throws does not stop the others: its error is
 * rethrown from a microtask, so it reaches the page's global error handler instead of vanishing
 * inside an input listener.
 */
export function createHumanGate(
  target: EventTarget | undefined = typeof window === "undefined" ? undefined : window,
): HumanGate {
  let human = false;
  let client: HumanGateClient | null = null;
  const held: GatedEvent[] = [];
  const callbacks: { callback: (options: DeferredCaptureOptions) => void; since: Date }[] = [];
  /** Held events mid-replay, by uuid, for `filter` to hand back verbatim. */
  const replaying = new Map<string, GatedEvent>();
  /** Deferred `whenHuman` captures mid-flight, by uuid, to their real time. */
  const backdating = new Map<string, Date>();
  /**
   * How far each backdated `$pageview` was moved, by its id. posthog-js timed that pageview from
   * when it was captured, the signal, so the next `$pageview` or `$pageleave` reports a
   * `$prev_pageview_duration` short by exactly this much: all the dwell before the first
   * interaction.
   */
  const pageviewShiftMs = new Map<string, number>();

  /** Put the pre-signal dwell back into `$prev_pageview_duration`. */
  const restorePrevDuration = (event: GatedEvent, ownShiftMs: number): void => {
    const prevId = event.properties.$prev_pageview_id;
    const duration = event.properties.$prev_pageview_duration;
    if (typeof prevId !== "string" || typeof duration !== "number") return;
    const shift = pageviewShiftMs.get(prevId);
    if (shift === undefined) return;
    pageviewShiftMs.delete(prevId);
    // A backdated event's own capture time moved too, so its share comes off.
    event.properties.$prev_pageview_duration = duration + (shift - ownShiftMs) / 1000;
  };

  const rememberPageviewShift = (uuid: string, shift: number): void => {
    pageviewShiftMs.set(uuid, shift);
    if (pageviewShiftMs.size > MAX_PAGEVIEW_SHIFTS) {
      const oldest = pageviewShiftMs.keys().next();
      if (!oldest.done) pageviewShiftMs.delete(oldest.value);
    }
  };

  const onSignal = (event: Event): void => {
    if (event.isTrusted) markHuman();
  };

  const listen = (): void => {
    for (const type of HUMAN_SIGNALS) {
      target?.addEventListener(type, onSignal, { capture: true, passive: true });
    }
  };

  const unlisten = (): void => {
    for (const type of HUMAN_SIGNALS) {
      target?.removeEventListener(type, onSignal, { capture: true });
    }
  };

  /**
   * Re-capture each held event under its own uuid, with no `timestamp`.
   *
   * Passing the original time would feed it to posthog-js's session manager, which can rotate the
   * session and rewind its persisted activity when that time is older than the idle timeout.
   * Instead the SDK builds a fresh event at the current time, and `filter` swaps it for the held
   * one by uuid, so what ships is the original payload: its timestamp, `$session_id`,
   * `$is_identified`, `$process_person_profile`, and redacted properties. The held properties are
   * passed too, so an event the swap somehow misses still carries what the page captured.
   *
   * The original capture already spent a client rate-limit token, so the replay skips the limiter
   * rather than charging the visitor twice.
   */
  const replay = (): void => {
    if (!human || !client) return;
    for (const event of held.splice(0, held.length)) replayOne(client, event);
  };

  const replayOne = (to: HumanGateClient, event: GatedEvent): void => {
    const { uuid } = event;
    if (uuid) replaying.set(uuid, event);
    const options: HumanGateCaptureOptions = uuid
      ? { uuid, skip_client_rate_limiting: true }
      : { skip_client_rate_limiting: true };
    try {
      to.capture(event.event, event.properties, options);
    } catch (error) {
      // One bad replay must not lose the rest.
      rethrowLater(error);
    } finally {
      if (uuid) replaying.delete(uuid);
    }
  };

  /** Runs a deferred `whenHuman` callback with a uuid `filter` will backdate to `since`. */
  const runDeferred = (callback: (options: DeferredCaptureOptions) => void, since: Date): void => {
    const uuid = newUuid();
    if (uuid) backdating.set(uuid, since);
    try {
      callback(uuid ? { uuid } : undefined);
    } catch (error) {
      rethrowLater(error);
    } finally {
      if (uuid) backdating.delete(uuid);
    }
  };

  function markHuman(): void {
    if (human) return;
    human = true;
    unlisten();
    // Callbacks first: they carry the deferred `$pageview`, which belongs ahead of whatever the
    // page captured while it waited.
    for (const { callback, since } of callbacks.splice(0, callbacks.length)) {
      runDeferred(callback, since);
    }
    replay();
  }

  /** Stamps a deferred capture with the time it was asked for. */
  const backdate = <T extends GatedEvent>(event: T, uuid: string, since: Date): T => {
    // Only the payload is backdated; the SDK's session state saw "now".
    const shift = Date.now() - since.getTime();
    event.timestamp = since;
    restorePrevDuration(event, shift);
    if (event.event === "$pageview") rememberPageviewShift(uuid, shift);
    return event;
  };

  /** The held event in place of the SDK's fresh copy of it. */
  const restoreHeld = <T extends GatedEvent>(fresh: T, original: GatedEvent): T => {
    // Held before the deferred pageview existed, so it carries no `$pageview_id`. The fresh copy,
    // built after that pageview, does. With several deferred pageviews, every held event takes the
    // last one's id, since all of them are captured before the replay.
    if (original.properties.$pageview_id == null) {
      original.properties.$pageview_id = fresh.properties.$pageview_id;
    }
    // The held event is the one this uuid was captured as, so it has the caller's type.
    return original as T;
  };

  /** Lets an event through, holds it, or drops it, by whether the gate is open. */
  const admit = <T extends GatedEvent>(event: T): T | null => {
    if (human || UNGATED_EVENTS.has(event.event)) {
      restorePrevDuration(event, 0);
      return event;
    }
    if (!DROPPED_UNTIL_HUMAN.has(event.event) && held.length < MAX_HELD) held.push(event);
    return null;
  };

  listen();

  return {
    filter<T extends GatedEvent>(event: T | null): T | null {
      if (!event) return null;
      const { uuid } = event;
      const since = uuid ? backdating.get(uuid) : undefined;
      if (uuid && since) return backdate(event, uuid, since);
      const original = uuid ? replaying.get(uuid) : undefined;
      if (original) return restoreHeld(event, original);
      return admit(event);
    },
    isHuman: () => human,
    whenHuman(callback, since = new Date()) {
      if (human) callback(undefined);
      else callbacks.push({ callback, since });
    },
    attach(next) {
      client = next;
      replay();
    },
    markHuman,
    reset() {
      unlisten();
      human = false;
      client = null;
      held.length = 0;
      callbacks.length = 0;
      replaying.clear();
      backdating.clear();
      pageviewShiftMs.clear();
      listen();
    },
  };
}

/**
 * Reports a caller's error without interrupting the loop that hit it: thrown from a microtask, it
 * reaches the page's global error handler (and any error tracking) with its own stack.
 */
function rethrowLater(error: unknown): void {
  queueMicrotask(() => {
    throw error;
  });
}

/**
 * A uuid posthog-js will accept as an event's `uuid` option, or `undefined` where
 * `crypto.randomUUID` is missing (insecure origins, old browsers); the capture then simply goes
 * out at the time it is sent.
 */
function newUuid(): string | undefined {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : undefined;
}

/**
 * The page's gate, listening on `window` from import. Chain its `filter` into `before_send`, gate
 * pageview calls with `whenHuman`, and `attach` the client once it exists.
 */
export const humanGate: HumanGate = /* @__PURE__ */ createHumanGate();
