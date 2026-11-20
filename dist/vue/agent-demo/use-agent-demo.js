import { createDemoController, positionKey } from "../../agent-demo/controller.js";
import { computed, onMounted, onScopeDispose, ref, shallowRef, toRaw, toValue, watch } from "vue";
// src/vue/agent-demo/use-agent-demo.ts
/**
* The headless agent demo for Vue: compiles a script and returns the reactive view to render with
* its controls. Call it in `setup`. The server and pre-mount render are `finalState(finalPolicy)`
* (the view at 0ms with `beforeStart: "start"`), and reduced motion is always
* `finalState(finalPolicy)`. With `position` it follows a click index; otherwise a playback gate,
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
function useAgentDemo(script, options = {}) {
	const read = () => {
		const opts = toValue(options);
		return [toRaw(toValue(script)), {
			...opts,
			timing: toRaw(opts.timing),
			position: toValue(opts.position)
		}];
	};
	const applied = shallowRef(read());
	const apply = (next) => {
		applied.value = next;
		controller.update(...next);
	};
	const controller = createDemoController(...applied.value);
	const state = shallowRef(controller.getState());
	const unsubscribe = controller.subscribe(() => {
		state.value = controller.getState();
	});
	watch(read, apply);
	watch(() => positionKey(toValue(toValue(options).position)), () => {
		const [current, opts] = applied.value;
		apply([current, {
			...opts,
			position: toValue(toValue(options).position)
		}]);
	}, { flush: "sync" });
	const clickMode = computed(() => applied.value[1].position !== void 0);
	const playCount = ref(0);
	let wasActive = false;
	watch(() => toValue(toValue(options).active) ?? true, (active) => {
		if (active && !wasActive) {
			playCount.value++;
			controller.reset();
		}
		wasActive = active;
	}, { immediate: true });
	const el = shallowRef(null);
	watch(el, (node) => controller.attach(node), { flush: "post" });
	const mounted = ref(false);
	onMounted(() => {
		mounted.value = true;
	});
	watch(mounted, () => {
		controller.attach(el.value);
		controller.mount();
	}, { flush: "post" });
	onScopeDispose(() => {
		unsubscribe();
		controller.destroy();
	});
	return {
		view: computed(() => state.value.view),
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
		clickMode
	};
}
export { useAgentDemo };
