import {
  type ComputedRef,
  computed,
  type MaybeRefOrGetter,
  onMounted,
  type Ref,
  ref,
  shallowRef,
  toRaw,
  toValue,
  watch,
} from "vue";
import { countAt, defined, signature } from "../../internal/agent-demo.ts";
import { createPlaybackGate, type GateState, type PlaybackGate } from "../../playback/gate.ts";
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
   * start. Without it, the script and timing are compared by content.
   */
  readonly scriptKey?: string | undefined;
  /** Fields to change from the `chat` preset, such as `presets.terminal`. */
  readonly timing?: Partial<Timing<TData>> | undefined;
  /** Seeds the timing jitter. Defaults to the script's `id`. */
  readonly seed?: string | undefined;
  /** Whether user steps type into the composer by default. Default false. */
  readonly composer?: boolean | undefined;
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
  /** Initial clock rate. Default 1. */
  readonly speed?: number | undefined;
  /**
   * Called once per step as playback passes the step's start, in script order (also for steps a
   * seek skips over). Playing a stretch again, after a replay or a backward seek, calls it again.
   */
  readonly onStepStart?: ((index: number, step: Step<TData>) => void) | undefined;
  /** Called when playback reaches the end. Never under reduced motion. */
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
  /** Clock rate, greater than 0. */
  readonly setSpeed: (speed: number) => void;
}

export interface UseAgentDemoResult<TData = unknown> {
  /** What to render now. */
  readonly view: ComputedRef<DemoView<TData>>;
  readonly controls: AgentDemoControls;
  /** Bind as the template ref of the element whose visibility gates playback. */
  readonly el: Ref<Element | null>;
  /** False on the server and before mount. Show controls only once true. */
  readonly ready: ComputedRef<boolean>;
  readonly playing: ComputedRef<boolean>;
  readonly paused: ComputedRef<boolean>;
  readonly reduced: ComputedRef<boolean>;
  /** Playback reached the end. False under reduced motion, which shows the end without playing. */
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
  const compiled = computed(() => {
    // Raw, so steps handed to callbacks are the caller's objects and not reactive proxies.
    const value = toRaw(toValue(script));
    const { scriptKey, timing, seed, composer } = opts.value;
    const key: unknown =
      scriptKey !== undefined
        ? `key:${scriptKey}`
        : (signature({ script: value, timing, seed, composer }) ?? value);
    if (cache === null || !Object.is(cache.key, key)) {
      cache = { key, timeline: compile(value, defined({ timing, seed, composer })) };
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
  const speed = ref(opts.value.speed ?? 1);
  const autoStart = computed(() => opts.value.autoStart ?? true);
  const started = ref(autoStart.value);

  watch(
    () => opts.value.speed,
    (next) => {
      if (next !== undefined) speed.value = next;
    },
  );

  // A new gate whenever the element (a remount on re-entry), the duration or an observer option
  // changes. Created only after mount, so nothing reads the browser during SSR. Every source is a
  // getter compared on its own: a shallowRef source would force the callback on any props update.
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
    ] as const,
    (
      [isMounted, element, duration, gateAutoStart, threshold, rootMargin, leaveGraceMs, motion],
      _,
      onCleanup,
    ) => {
      if (!isMounted) return;
      const next = createPlaybackGate(element, {
        duration,
        autoStart: gateAutoStart,
        speed: speed.value,
        ...defined({ threshold, rootMargin, leaveGraceMs, motion }),
      });
      gate.value = next;
      state.value = next.getState();
      const unsubscribe = next.subscribe(() => {
        state.value = next.getState();
      });
      onCleanup(() => {
        unsubscribe();
        next.destroy();
        if (gate.value === next) gate.value = null;
        state.value = IDLE;
      });
    },
    { immediate: true, flush: "post" },
  );

  watch(speed, (next) => gate.value?.setSpeed(next));

  // A new script (by key) starts over.
  watch(key, () => {
    started.value = autoStart.value;
    gate.value?.reset();
  });

  const ready = computed(() => gate.value !== null);
  const elapsed = computed(() => state.value.elapsed);
  const live = computed(
    () => !clickMode.value && ready.value && !state.value.reduced && started.value,
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

  const finished = computed(() => live.value && state.value.complete);
  watch(finished, (done) => {
    if (done) opts.value.onComplete?.();
  });

  const start = (): void => {
    started.value = true;
  };
  const controls: AgentDemoControls = {
    play: () => {
      start();
      gate.value?.play();
    },
    pause: () => gate.value?.pause(),
    toggle: () => {
      start();
      gate.value?.toggle();
    },
    replay: () => {
      start();
      gate.value?.replay();
    },
    seek: (ms: number) => {
      start();
      gate.value?.seek(ms);
    },
    cancel: () => {
      start();
      gate.value?.seek(timeline.value.duration);
    },
    setSpeed: (next: number) => {
      speed.value = next;
    },
  };

  const view = computed<DemoView<TData>>(() => {
    if (position.value !== undefined) return stateAt(timeline.value, position.value);
    if (live.value) return stateAt(timeline.value, { ms: elapsed.value });
    return finalState(timeline.value, { policy: opts.value.finalPolicy ?? "all" });
  });

  return {
    view,
    controls,
    el,
    ready,
    playing: computed(() => live.value && state.value.playing),
    paused: computed(() => state.value.paused),
    reduced: computed(() => state.value.reduced),
    complete: computed(() => (clickMode.value ? view.value.complete : finished.value)),
    animating: computed(
      () => live.value || (clickMode.value && ready.value && !state.value.reduced),
    ),
    mode: computed(() => (ready.value ? "live" : "static")),
    speed: computed(() => speed.value),
    turn: computed(() => {
      const show = live.value && (elapsed.value > 0 || state.value.playing);
      return show ? countAt(timeline.value.turnStarts, elapsed.value) - 1 : -1;
    }),
    timeline,
    playCount,
    clickMode,
  };
}
