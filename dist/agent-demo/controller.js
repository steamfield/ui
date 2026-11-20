import { defined } from "../internal/options.js";
import { checkSpeed, createBoundGate } from "../playback/gate.js";
import { LibraryError } from "../internal/errors.js";
import { compile } from "../sequencer/compile.js";
import { finalState, stateAt } from "../sequencer/view.js";
import { countAt, hiddenToolNames, signature } from "./core.js";
// src/agent-demo/controller.ts
/**
* A `finalPolicy` checked against the timeline now, so a bad one throws where it is passed. With
* `beforeStart: "start"` the final view may otherwise first be computed much later, under reduced
* motion, inside a motion-change listener.
*/
const checkPolicy = (timeline, policy) => {
	finalState(timeline, { policy: policy ?? "all" });
};
/** `beforeStart` as given, or `invalid_option`. */
const checkBeforeStart = (value) => {
	if (value !== void 0 && value !== "final" && value !== "start") throw new LibraryError("invalid_option", { field: "beforeStart" });
};
/** Everything off: what the server and the pre-mount render see. */
const IDLE = {
	started: false,
	inView: false,
	tabVisible: false,
	paused: false,
	reduced: false,
	complete: false,
	playing: false,
	elapsed: 0,
	speed: 1
};
/**
* A `finalPolicy` as a comparable value. A function compares by its source text, like `timing`,
* so an inline one is not new on every render; a bound or native function, whose text is only
* `[native code]`, compares by identity.
*/
const NATIVE = /\{\s*\[native code\]\s*\}$/;
const fnKey = (fn) => {
	if (typeof fn !== "function") return fn;
	const source = String(fn);
	return NATIVE.test(source) ? fn : source;
};
/** One stable key per (bound or native `pick`, order), so an inline object around it is not new. */
const identityKeys = /* @__PURE__ */ new WeakMap();
const policyKey = (policy) => {
	if (typeof policy !== "object" || policy === null) return fnKey(policy);
	const order = policy.order ?? "script";
	const pick = fnKey(policy.pick);
	if (typeof pick !== "function") return `${String(order)}:${String(pick)}`;
	const byOrder = identityKeys.get(pick) ?? /* @__PURE__ */ new Map();
	identityKeys.set(pick, byOrder);
	const key = byOrder.get(order) ?? {};
	byOrder.set(order, key);
	return key;
};
/** A position as a comparable value, so an inline `{ click: n }` doesn't count as a change. */
const positionKey = (position) => {
	if (position === void 0) return void 0;
	return "ms" in position ? `ms:${position.ms}` : `click:${position.click}`;
};
/**
* Which view the clock drives, outside click mode. `live` once the clock has moved (started, or a
* seek before play) with motion allowed; `held` when reduced motion under "hold" froze a frame
* past 0; `at` is the clock position for either, and otherwise the view is the final state.
* `animating` is `live`, or in click mode, motion allowed once mounted.
*/
function clockMode(gs, ready, clickMode, reducedPolicy = "end") {
	const motion = ready && !gs.reduced;
	const moved = !clickMode && ready && (gs.started || gs.elapsed > 0);
	const live = moved && motion;
	const held = moved && gs.reduced && reducedPolicy === "hold" && gs.elapsed > 0;
	return {
		live,
		at: live || held ? { ms: gs.elapsed } : void 0,
		animating: clickMode ? motion : live,
		showTurn: live && (gs.elapsed > 0 || gs.playing)
	};
}
/**
* The agent demo controller. Safe to create during server rendering: it compiles the script and
* reads no browser state until `mount()`.
*/
function createDemoController(initialScript, initialOptions = {}) {
	let options = initialOptions;
	let timeline;
	let key;
	let compiled = false;
	let content = null;
	let bound;
	let gate = null;
	const listeners = /* @__PURE__ */ new Set();
	let firedUpTo = -1;
	let lastElapsed = 0;
	let ended = false;
	let due = [];
	let from = 0;
	let wasPlaying = false;
	/** Compiles for new inputs; returns whether the script's identity changed. */
	const compileFor = (script) => {
		const { scriptKey, timing, seed, composer } = options;
		const names = hiddenToolNames(options.tools);
		const hidden = names.join("\n");
		let next = `key:${scriptKey}\n${hidden}`;
		if (scriptKey === void 0) {
			const inputs = [
				script,
				timing,
				seed,
				composer,
				hidden
			];
			const last = content;
			if (last === null || inputs.some((input, i) => !Object.is(input, last.inputs[i]))) content = {
				inputs,
				key: signature({
					script,
					timing,
					seed,
					composer,
					hidden
				}) ?? script
			};
			next = content?.key;
		}
		if (compiled && Object.is(key, next)) return false;
		const hiddenTools = names.length === 0 ? void 0 : names;
		timeline = compile(script, defined({
			timing,
			seed,
			composer,
			hiddenTools
		}));
		key = next;
		const changed = compiled;
		compiled = true;
		return changed;
	};
	let checkedPolicy;
	const checkFinal = () => {
		checkPolicy(timeline, options.finalPolicy);
		checkedPolicy = policyKey(options.finalPolicy);
	};
	const gateOptions = () => ({
		duration: timeline.duration,
		autoStart: options.position === void 0 ? options.autoStart ?? true : false,
		reducedPolicy: options.reducedPolicy ?? "end",
		...defined({
			speed: options.speed,
			threshold: options.threshold,
			rootMargin: options.rootMargin,
			leaveGraceMs: options.leaveGraceMs,
			motion: options.motion
		})
	});
	/**
	* `stateAt` a position, or without one the view before playback: the final state, or with
	* `beforeStart: "start"` the view at 0ms, unless motion is reduced.
	*/
	const viewAt = (position, reduced) => {
		if (position !== void 0) return stateAt(timeline, position);
		if (options.beforeStart === "start" && !reduced) return stateAt(timeline, { ms: 0 });
		return finalState(timeline, { policy: options.finalPolicy ?? "all" });
	};
	/** Everything `derive` reads, compared to tell whether the state changed. */
	const inputsNow = () => {
		const { position, finalPolicy, reducedPolicy, speed, beforeStart } = options;
		const gs = gate?.getState() ?? IDLE;
		return [
			timeline,
			gs,
			gate !== null,
			positionKey(position),
			policyKey(finalPolicy),
			reducedPolicy,
			speed,
			beforeStart,
			ended
		];
	};
	let inputs = [];
	let state;
	const derive = () => {
		const gs = gate?.getState() ?? IDLE;
		const ready = gate !== null;
		const { position } = options;
		const clickMode = position !== void 0;
		const { live, at, animating, showTurn } = clockMode(gs, ready, clickMode, options.reducedPolicy);
		const view = viewAt(position ?? at, ready && gs.reduced);
		return {
			view,
			controls,
			ready,
			started: live && gs.started,
			playing: live && gs.playing,
			paused: gs.paused,
			reduced: gs.reduced,
			complete: clickMode ? view.complete : live && ended,
			animating,
			mode: ready ? "live" : "static",
			speed: ready ? gs.speed : options.speed ?? 1,
			turn: showTurn ? countAt(timeline.turnStarts, gs.elapsed) - 1 : -1,
			timeline
		};
	};
	/**
	* The steps whose start `elapsed` has passed since last time, once each in order; a rewind
	* forgets the steps after it, so they fire again.
	*/
	const passedSteps = (gs, live) => {
		const steps = timeline.steps;
		const t = gs.elapsed;
		if (t < lastElapsed) {
			firedUpTo = steps.filter((s) => s.start < t).length - 1;
			due = due.filter((item) => item !== "end" && item <= firedUpTo);
		}
		lastElapsed = t;
		const passed = [];
		if (!live || !gs.playing && t === 0) return passed;
		while ((steps[firedUpTo + 1]?.start ?? Number.POSITIVE_INFINITY) <= t) {
			firedUpTo += 1;
			passed.push(firedUpTo);
		}
		return passed;
	};
	/**
	* Whether the clock just played across the end. The end counts only then (which calls
	* `onComplete`), or when a seek or cancel lands on it; never the jump reduced motion makes.
	*/
	const reachedEnd = (gs, live) => {
		const { duration } = timeline;
		const reached = gs.elapsed >= duration && live && wasPlaying && from < duration;
		if (gs.elapsed < duration) ended = false;
		else if (reached) ended = true;
		from = gs.elapsed;
		wasPlaying = gs.playing;
		return reached;
	};
	let depth = 0;
	let draining = false;
	let lifecycle = false;
	const settle = () => {
		if (depth > 0) return;
		if (gate === null) due = [];
		else track(gate.getState());
		if (commit()) for (const listener of [...listeners]) listener();
		if (!draining) report(drain());
	};
	/** Rethrows what callbacks threw: at once, or later inside a lifecycle step. */
	const report = (errors) => {
		if (errors.length === 0) return;
		const error = errors.length === 1 ? errors[0] : new AggregateError(errors, "Demo callbacks threw");
		if (!lifecycle) throw error;
		queueMicrotask(() => {
			throw error;
		});
	};
	/** The step and end bookkeeping for the clock at `gs`, queueing the callbacks it makes due. */
	const track = (gs) => {
		const { live } = clockMode(gs, true, options.position !== void 0, void 0);
		const passed = passedSteps(gs, live);
		due.push(...passed);
		if (reachedEnd(gs, live)) due.push("end");
	};
	/** Calls everything due, in order, and returns what they threw. */
	const drain = () => {
		draining = true;
		const errors = [];
		for (let item = due.shift(); item !== void 0; item = due.shift()) try {
			call(item);
		} catch (error) {
			errors.push(error);
		}
		draining = false;
		return errors;
	};
	/** Runs a binding lifecycle step, whose callback errors are rethrown later. */
	const inLifecycle = (run) => {
		const outer = lifecycle;
		lifecycle = true;
		try {
			run();
		} finally {
			lifecycle = outer;
		}
	};
	const call = (item) => {
		if (item === "end") {
			options.onComplete?.();
			return;
		}
		const step = timeline.script.steps[item];
		if (step) options.onStepStart?.(item, step);
	};
	/** Derives a new state when an input changed; returns whether it did. */
	const commit = () => {
		const next = inputsNow();
		if (next.every((value, i) => Object.is(value, inputs[i]))) return false;
		inputs = next;
		state = derive();
		return true;
	};
	const batch = (run) => {
		depth += 1;
		try {
			run();
		} finally {
			depth -= 1;
		}
		settle();
	};
	const seek = (ms) => batch(() => {
		gate?.seek(ms);
		const { duration } = timeline;
		from = Math.min(Math.max(ms, 0), duration);
		if (ms >= duration) ended = true;
	});
	const controls = {
		play: () => gate?.play(),
		pause: () => gate?.pause(),
		toggle: () => gate?.toggle(),
		replay: () => gate?.replay(),
		seek,
		cancel: () => seek(timeline.duration),
		setSpeed(next) {
			bound.setSpeed(next);
		}
	};
	checkBeforeStart(options.beforeStart);
	compileFor(initialScript);
	checkFinal();
	bound = createBoundGate(gateOptions());
	bound.subscribe(settle);
	state = derive();
	inputs = inputsNow();
	return {
		getState: () => state,
		subscribe(callback) {
			listeners.add(callback);
			return () => {
				listeners.delete(callback);
			};
		},
		attach(next) {
			bound.attach(next);
		},
		update(script, next) {
			inLifecycle(() => batch(() => {
				if (next.speed !== void 0) checkSpeed(next.speed);
				checkBeforeStart(next.beforeStart);
				options = next;
				const restart = compileFor(script);
				if (restart || policyKey(next.finalPolicy) !== checkedPolicy) checkFinal();
				bound.configure(gateOptions());
				if (restart) bound.reset();
			}));
		},
		mount() {
			if (gate) return;
			inLifecycle(() => batch(() => {
				bound.connect();
				gate = bound;
			}));
		},
		reset: () => bound.reset(),
		destroy() {
			if (!gate) return;
			bound.disconnect();
			gate = null;
			inLifecycle(settle);
		}
	};
}
export { createDemoController, positionKey };
