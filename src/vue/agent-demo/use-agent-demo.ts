import {
  type ComputedRef,
  computed,
  type MaybeRefOrGetter,
  onMounted,
  onScopeDispose,
  type Ref,
  ref,
  shallowRef,
  toRaw,
  toValue,
  watch,
} from "vue";
import {
  countAt,
  hiddenToolNames,
  signature,
  type ToolRegistry,
} from "../../internal/agent-demo.ts";
import { carryOver, sameInputs } from "../../internal/gate-rebuild.ts";
import { defined } from "../../internal/options.ts";
import {
  checkSpeed,
  createPlaybackGate,
  type GateState,
  type PlaybackGate,
  type ReducedPolicy,
} from "../../playback/gate.ts";
import type { MotionPreference, MotionSource } from "../../playback/motion.ts";
import type { DemoScript, Step } from "../../script/types.ts";
import { compile, type Timeline } from "../../sequencer/compile.ts";
import type { Timing } from "../../sequencer/timing.ts";
import {
  type DemoView,
  type FinalPolicy,
  finalState,
  type Position,
  stateAt,
} from "../../sequencer/view.ts";

export interface UseAgentDemoOptions<TData = unknown> {
  /**
   * The script's identity. When it changes, the script recompiles and playback resets to the
   * start. Without it, the script and timing are compared by content whenever one of them is a
   * new object. Content comparison has two limits: a function compares by its source text, so a
   * callback whose captured variables change is not seen as new; and a script that can't be
   * serialized (a cycle, a BigInt) compares by identity, so building one inline restarts playback
   * on every update. Pass `scriptKey` in either case.
   */
  readonly scriptKey?: string | undefined;
  /** Fields to change from the `chat` preset, such as `presets.terminal`. */
  readonly timing?: Partial<Timing<TData>> | undefined;
  /** Seeds the timing jitter. Defaults to the script's `id`. */
  readonly seed?: string | undefined;
  /** Whether user steps type into the composer by default. Default false. */
  readonly composer?: boolean | undefined;
  /**
   * The tool registry. Only `hidden` is read here: hidden tools' calls take no time, so leaving
   * them out of the transcript leaves no silent gap. `AgentDemo` passes its `tools` prop.
   */
  readonly tools?: ToolRegistry | undefined;
  /** What the server, the pre-mount render and reduced motion show. Default "all". */
  readonly finalPolicy?: FinalPolicy | undefined;
  /**
   * A fixed position instead of the clock: click mode. Pass a ref or a getter so it follows the
   * deck, such as `() => ({ click: $clicks.value })` in Slidev. The demo renders `stateAt` there,
   * runs no clock and shows no controls. The binding imports nothing from Slidev; see the adapter
   * in this module's `useAgentDemo` comment.
   */
  readonly position?: MaybeRefOrGetter<Position | undefined>;
  /**
   * Whether the demo's slide is on screen, such as Slidev's `useIsSlideActive()`. Each change from
   * inactive to active bumps `playCount`. Default always active.
   */
  readonly active?: MaybeRefOrGetter<boolean | undefined>;
  /** Start once in view. When false, the final transcript shows until `play()`. Default true. */
  readonly autoStart?: boolean | undefined;
  /** In-view threshold. Default 0.15. */
  readonly threshold?: number | undefined;
  readonly rootMargin?: string | undefined;
  /** How long the demo may be out of view before it pauses. Default 0. */
  readonly leaveGraceMs?: number | undefined;
  /** Default "auto", which follows `prefers-reduced-motion` live. Keep a custom source stable. */
  readonly motion?: MotionPreference | MotionSource | undefined;
  /**
   * What reduced motion shows: "end" (the default) is `finalState(finalPolicy)`; "hold" freezes
   * the frame playback had reached and resumes from it when motion returns. Before playback has
   * moved, both show the final state.
   */
  readonly reducedPolicy?: ReducedPolicy | undefined;
  /** Initial clock rate. Default 1. */
  readonly speed?: number | undefined;
  /**
   * Called once per step as playback passes the step's start, in script order (also for steps a
   * seek skips over). Playing a stretch again, after a replay or a backward seek, calls it again.
   */
  readonly onStepStart?: ((index: number, step: Step<TData>) => void) | undefined;
  /**
   * Called when the clock plays through to the end. Never under reduced motion, and not for a
   * `seek` or `cancel` to the end.
   */
  readonly onComplete?: (() => void) | undefined;
}

export interface AgentDemoControls {
  readonly play: () => void;
  readonly pause: () => void;
  readonly toggle: () => void;
  /** Back to the start and playing. Touches no DOM, so focus stays where it is. */
  readonly replay: () => void;
  readonly seek: (ms: number) => void;
  /** Stops playback and shows the finished transcript, like skipping to the end. */
  readonly cancel: () => void;
  /**
   * Clock rate. Throws `invalid_option` on `speed` unless it's finite and greater than 0. Holds
   * until the `speed` option changes.
   */
  readonly setSpeed: (speed: number) => void;
}

export interface UseAgentDemoResult<TData = unknown> {
  /** What to render now. */
  readonly view: ComputedRef<DemoView<TData>>;
  readonly controls: AgentDemoControls;
  /**
   * Bind as the template ref of the element whose visibility gates playback. Until one is bound,
   * autoStart waits; a late element gets a fresh gate and a swapped one keeps the progress.
   */
  readonly el: Ref<Element | null>;
  /** False on the server and before mount. Show controls only once true. */
  readonly ready: ComputedRef<boolean>;
  /** `autoStart`, or `play()`, `toggle()` or `replay()` has been called. False until mounted. */
  readonly started: ComputedRef<boolean>;
  readonly playing: ComputedRef<boolean>;
  readonly paused: ComputedRef<boolean>;
  readonly reduced: ComputedRef<boolean>;
  /**
   * Playback reached the end, by playing or by a `seek` or `cancel`. False under reduced motion,
   * which shows the end without playing, and after motion returns from it.
   */
  readonly complete: ComputedRef<boolean>;
  /**
   * Mounted with motion allowed, and either following the clock or pinned to a `position`.
   * Renderers set `data-sf-animating` from it, which turns entrance and typing CSS on.
   */
  readonly animating: ComputedRef<boolean>;
  /** "live" once mounted, "static" on the server and before mount. */
  readonly mode: ComputedRef<"static" | "live">;
  readonly speed: ComputedRef<number>;
  /** The turn playback is in, or -1 before playback. */
  readonly turn: ComputedRef<number>;
  readonly timeline: ComputedRef<Timeline<TData>>;
  /**
   * Bumps on every entry to an active slide, starting at 1. Bind it as `:key` on the demo root
   * so entrance animations run again when the presenter comes back; `AgentDemo` does this.
   */
  readonly playCount: Readonly<Ref<number>>;
  /** Whether `position` is set. */
  readonly clickMode: ComputedRef<boolean>;
}

/** Everything off: what the server and the pre-mount render see. */
const IDLE: GateState = {
  started: false,
  inView: false,
  tabVisible: false,
  paused: false,
  reduced: false,
  complete: false,
  playing: false,
  elapsed: 0,
  speed: 1,
};

/**
 * The headless agent demo for Vue: compiles a script and returns the reactive view to render with
 * its controls. Call it in `setup`. The server and pre-mount render are `finalState(finalPolicy)`,
 * as is reduced motion. With `position` it follows a click index; otherwise a playback gate,
 * created on mount, runs the clock while the element is in view, the tab is visible and motion is
 * allowed.
 *
 * Slidev adapter (the binding imports nothing from `@slidev/*`):
 *
 * ```ts
 * import { useIsSlideActive, useSlideContext } from "@slidev/client";
 * const { $clicks } = useSlideContext();
 * const demo = useAgentDemo(script, { position: () => ({ click: $clicks.value }), active: useIsSlideActive() });
 * ```
 *
 * `options` may itself be a getter, so a component can pass its props through reactively.
 */
export function useAgentDemo<TData = unknown>(
  script: MaybeRefOrGetter<DemoScript<TData>>,
  options: MaybeRefOrGetter<UseAgentDemoOptions<TData>> = {},
): UseAgentDemoResult<TData> {
  const opts = computed(() => toValue(options));
  const position = computed(() => toValue(opts.value.position));
  const clickMode = computed(() => position.value !== undefined);

  let cache: { key: unknown; timeline: Timeline<TData> } | null = null;
  let content: { inputs: readonly unknown[]; key: unknown } | null = null;
  const compiled = computed(() => {
    // Raw, so steps handed to callbacks are the caller's objects and not reactive proxies.
    const value = toRaw(toValue(script));
    const { scriptKey, timing, seed, composer } = opts.value;
    const names = hiddenToolNames(opts.value.tools);
    // Joined into a string, so an inline registry rebuilt every render compares by its names.
    const hidden = names.join("\n");
    // The content signature is recomputed only when an input is a new object.
    let key: unknown = `key:${scriptKey}\n${hidden}`;
    if (scriptKey === undefined) {
      const inputs = [value, toRaw(timing), seed, composer, hidden];
      let last = content;
      if (last === null || inputs.some((input, i) => !Object.is(input, last?.inputs[i]))) {
        const sig = signature({ script: value, timing, seed, composer, hidden });
        last = { inputs, key: sig ?? value };
        content = last;
      }
      key = last.key;
    }
    if (cache === null || !Object.is(cache.key, key)) {
      const hiddenTools = names.length === 0 ? undefined : names;
      cache = { key, timeline: compile(value, defined({ timing, seed, composer, hiddenTools })) };
    }
    return cache;
  });
  const timeline = computed(() => compiled.value.timeline);
  const key = computed(() => compiled.value.key);

  const playCount = ref(0);
  let wasActive = false;
  watch(
    () => toValue(opts.value.active) ?? true,
    (active) => {
      if (active && !wasActive) playCount.value++;
      wasActive = active;
    },
    { immediate: true },
  );

  const el = shallowRef<Element | null>(null);
  const mounted = ref(false);
  onMounted(() => {
    mounted.value = true;
  });
  const gate = shallowRef<PlaybackGate | null>(null);
  const state = shallowRef<GateState>(IDLE);
  // The rate a new gate starts at: the last one set by the `speed` option or `setSpeed`, so a
  // rebuilt gate keeps it.
  let rate = opts.value.speed;
  const autoStart = computed(() => opts.value.autoStart ?? true);
  const reducedPolicy = computed(() => opts.value.reducedPolicy ?? "end");

  watch(
    () => opts.value.speed,
    (next) => {
      if (next === undefined) return;
      rate = next;
      gate.value?.setSpeed(next);
    },
  );

  // The gate follows the element and the options. A swap from one element to another keeps the
  // progress; new options, or a slide re-entry (`playCount`), start a fresh gate at 0. Before any
  // element is bound, autoStart waits for one, so nothing plays or fires callbacks unseen; an
  // explicit `play()` still runs it, counted as in view. An element bound later gets a fresh gate,
  // and unbinding one keeps the gate, which then reads as out of view. Created only after mount,
  // so nothing reads the browser during SSR. Every source is a getter compared on its own: a
  // shallowRef source would force the callback on any props update.
  let observed: Element | null = null;
  let built: readonly unknown[] | null = null;
  let unsubscribe = (): void => {};
  watch(
    [
      mounted,
      () => el.value,
      () => timeline.value.duration,
      () => (clickMode.value ? false : autoStart.value),
      () => opts.value.threshold,
      () => opts.value.rootMargin,
      () => opts.value.leaveGraceMs,
      () => opts.value.motion,
      reducedPolicy,
      playCount,
    ] as const,
    ([isMounted, element, ...inputs]) => {
      if (!isMounted) return;
      const prev = gate.value;
      const same = prev !== null && sameInputs(built, inputs);
      // Unbinding (null) keeps the gate, like React's ref; so does an unchanged element.
      if (same && (element === null || element === observed)) return;
      const carry = same && observed !== null ? prev?.getState() : undefined;
      const [duration, gateAutoStart, threshold, rootMargin, leaveGraceMs, motion, policy] = inputs;
      unsubscribe();
      prev?.destroy();
      const next = createPlaybackGate(element, {
        duration,
        autoStart: element === null ? false : gateAutoStart,
        reducedPolicy: policy,
        ...defined({ speed: rate, threshold, rootMargin, leaveGraceMs, motion }),
      });
      if (carry) carryOver(next, carry);
      observed = element;
      built = inputs;
      gate.value = next;
      state.value = next.getState();
      unsubscribe = next.subscribe(() => {
        state.value = next.getState();
      });
    },
    { immediate: true, flush: "post" },
  );
  onScopeDispose(() => {
    unsubscribe();
    gate.value?.destroy();
    gate.value = null;
    state.value = IDLE;
  });

  // A new script (by key) starts over.
  watch(key, () => {
    gate.value?.reset();
  });

  const ready = computed(() => gate.value !== null);
  const elapsed = computed(() => state.value.elapsed);
  // The clock has moved: started, or a seek before play. Before that the view is the final state.
  const moved = computed(
    () => !clickMode.value && ready.value && (state.value.started || elapsed.value > 0),
  );
  const live = computed(() => moved.value && !state.value.reduced);
  const held = computed(
    () => moved.value && state.value.reduced && reducedPolicy.value === "hold" && elapsed.value > 0,
  );

  let firedUpTo = -1;
  let lastElapsed = 0;
  watch([elapsed, live, () => state.value.playing, timeline], () => {
    const t = elapsed.value;
    const steps = timeline.value.steps;
    if (t < lastElapsed) firedUpTo = steps.filter((s) => s.start < t).length - 1;
    lastElapsed = t;
    if (!live.value || (!state.value.playing && t === 0)) return;
    while ((steps[firedUpTo + 1]?.start ?? Number.POSITIVE_INFINITY) <= t) {
      firedUpTo += 1;
      const step = timeline.value.script.steps[firedUpTo];
      if (step) opts.value.onStepStart?.(firedUpTo, step);
    }
  });

  // The end counts only when the clock plays across it, or a seek or cancel lands on it; never
  // the jump reduced motion makes. `from` is where the last move started.
  const ended = ref(false);
  let from = 0;
  watch([elapsed, live, () => state.value.playing] as const, ([t, isLive], [, , wasPlaying]) => {
    const { duration } = timeline.value;
    if (t < duration) ended.value = false;
    else if (isLive && wasPlaying && from < duration) {
      ended.value = true;
      opts.value.onComplete?.();
    }
    from = t;
  });

  const seek = (ms: number): void => {
    const { duration } = timeline.value;
    gate.value?.seek(ms);
    from = Math.min(Math.max(ms, 0), duration);
    if (ms >= duration) ended.value = true;
  };
  const controls: AgentDemoControls = {
    play: () => gate.value?.play(),
    pause: () => gate.value?.pause(),
    toggle: () => gate.value?.toggle(),
    replay: () => gate.value?.replay(),
    seek,
    cancel: () => seek(timeline.value.duration),
    setSpeed: (next: number) => {
      if (gate.value) gate.value.setSpeed(next);
      else checkSpeed(next);
      rate = next;
    },
  };

  const view = computed<DemoView<TData>>(() => {
    if (position.value !== undefined) return stateAt(timeline.value, position.value);
    if (live.value || held.value) return stateAt(timeline.value, { ms: elapsed.value });
    return finalState(timeline.value, { policy: opts.value.finalPolicy ?? "all" });
  });

  return {
    view,
    controls,
    el,
    ready,
    started: computed(() => live.value && state.value.started),
    playing: computed(() => live.value && state.value.playing),
    paused: computed(() => state.value.paused),
    reduced: computed(() => state.value.reduced),
    complete: computed(() => (clickMode.value ? view.value.complete : live.value && ended.value)),
    animating: computed(
      () => live.value || (clickMode.value && ready.value && !state.value.reduced),
    ),
    mode: computed(() => (ready.value ? "live" : "static")),
    speed: computed(() => (gate.value ? state.value.speed : (opts.value.speed ?? 1))),
    turn: computed(() => {
      const show = live.value && (elapsed.value > 0 || state.value.playing);
      return show ? countAt(timeline.value.turnStarts, elapsed.value) - 1 : -1;
    }),
    timeline,
    playCount,
    clickMode,
  };
}
