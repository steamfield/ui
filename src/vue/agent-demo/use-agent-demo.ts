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
import { createDemoController, type DemoControllerOptions } from "../../agent-demo/controller.ts";
import type { ToolRegistry } from "../../agent-demo/core.ts";
import type { ReducedPolicy } from "../../playback/gate.ts";
import type { MotionPreference, MotionSource } from "../../playback/motion.ts";
import type { DemoScript, Step } from "../../script/types.ts";
import type { Timeline } from "../../sequencer/compile.ts";
import type { Timing } from "../../sequencer/timing.ts";
import type { DemoView, FinalPolicy, Position } from "../../sequencer/view.ts";

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
   * autoStart waits; a late element starts fresh and a swapped one keeps the progress.
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
  // Raw, so steps handed to callbacks are the caller's objects and not reactive proxies, and so
  // content comparison sees the caller's identities.
  const read = (): [DemoScript<TData>, DemoControllerOptions<TData>] => {
    const opts = toValue(options);
    return [
      toRaw(toValue(script)),
      { ...opts, timing: toRaw(opts.timing), position: toValue(opts.position) },
    ];
  };
  const controller = createDemoController(...read());
  const state = shallowRef(controller.getState());
  const unsubscribe = controller.subscribe(() => {
    state.value = controller.getState();
  });
  // Runs whenever a reactive source the props read changes; the controller compares the rest.
  watch(read, (next) => controller.update(...next));

  const clickMode = computed(() => toValue(toValue(options).position) !== undefined);
  const playCount = ref(0);
  let wasActive = false;
  watch(
    () => toValue(toValue(options).active) ?? true,
    (active) => {
      if (active && !wasActive) {
        playCount.value++;
        // A slide re-entry starts over.
        controller.reset();
      }
      wasActive = active;
    },
    { immediate: true },
  );

  const el = shallowRef<Element | null>(null);
  watch(el, (node) => controller.attach(node), { flush: "post" });
  // Created in the flush after mount, so nothing reads the browser during SSR and the first
  // mounted render is still the static one.
  const mounted = ref(false);
  onMounted(() => {
    mounted.value = true;
  });
  watch(
    mounted,
    () => {
      controller.attach(el.value);
      controller.mount();
    },
    { flush: "post" },
  );
  onScopeDispose(() => {
    unsubscribe();
    controller.destroy();
  });

  const view = computed(() => state.value.view);
  return {
    view,
    controls: controller.getState().controls,
    el,
    ready: computed(() => state.value.ready),
    started: computed(() => state.value.started),
    playing: computed(() => state.value.playing),
    paused: computed(() => state.value.paused),
    reduced: computed(() => state.value.reduced),
    complete: computed(() => state.value.complete),
    animating: computed(() => state.value.animating),
    mode: computed(() => state.value.mode),
    speed: computed(() => state.value.speed),
    turn: computed(() => state.value.turn),
    timeline: computed(() => state.value.timeline),
    playCount,
    clickMode,
  };
}
