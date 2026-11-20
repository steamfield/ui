import { LibraryError } from "../internal/errors.js";
import { motionSourceFor } from "../internal/motion.js";
// src/playback/gate.ts
/** The longest delay `setTimeout` honors; longer ones fire at once. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;
/** The longest step one frame may advance, so a throttled or stalled tab never jumps ahead. */
const MAX_STEP_MS = 100;
const KEYS = [
	"started",
	"inView",
	"tabVisible",
	"paused",
	"reduced",
	"complete",
	"playing",
	"elapsed",
	"speed"
];
/**
* A play/pause gate for an on-page demo. It plays only while the element is in view, the tab is
* visible, motion is allowed and the user hasn't paused, and its optional clock keeps demo time
* across every pause. Without IntersectionObserver, or with a `null` element, the demo counts as
* in view. Create it in the browser (an effect), never during server rendering.
*/
function createPlaybackGate(el, options = {}) {
	return build(el, options, false).gate;
}
/** Creates a disconnected `BoundGate` with no element. */
function createBoundGate(options = {}) {
	const { gate, ...binding } = build(null, options, true);
	return {
		...gate,
		...binding
	};
}
/** Options whose change starts a bound gate over. */
const RESTART_KEYS = [
	"autoStart",
	"threshold",
	"rootMargin",
	"leaveGraceMs",
	"motion",
	"reducedPolicy",
	"duration"
];
function build(el, initial, bound) {
	let options = initial;
	let config = readOptions(options);
	let clocked = options.duration !== void 0 || options.onFrame !== void 0;
	const listeners = /* @__PURE__ */ new Set();
	let observed = el;
	const autoStart = () => config.autoStart && (!bound || observed !== null);
	let speed = config.speed;
	let started = autoStart();
	let paused = false;
	let inView = true;
	let tabVisible = true;
	let reduced = false;
	let elapsed = 0;
	let destroyed = false;
	let connected = false;
	let running = false;
	let frame;
	let last;
	let grace;
	let observer;
	let unsubscribeMotion = () => {};
	const setElapsed = (value) => {
		const next = Math.min(Math.max(value, 0), config.duration);
		if (next === elapsed) return;
		elapsed = next;
		options.onFrame?.(elapsed);
	};
	const compute = () => {
		const complete = reduced && config.reducedPolicy === "end" || elapsed >= config.duration;
		return {
			started,
			inView,
			tabVisible,
			paused,
			reduced,
			complete,
			playing: started && inView && tabVisible && !paused && !reduced && !complete,
			elapsed,
			speed
		};
	};
	let state = compute();
	const tick = (time) => {
		frame = void 0;
		const step = last === void 0 ? 0 : Math.min(Math.max(time - last, 0), MAX_STEP_MS);
		last = time;
		try {
			setElapsed(elapsed + step * speed);
			update();
		} finally {
			if (running && frame === void 0) frame = requestFrame(tick);
		}
	};
	const syncClock = () => {
		const run = connected && clocked && state.playing;
		if (run === running) return;
		running = run;
		if (run) {
			last = void 0;
			frame = requestFrame(tick);
		} else if (frame !== void 0) {
			cancelFrame(frame);
			frame = void 0;
		}
	};
	function update() {
		if (destroyed) return;
		if (reduced && config.reducedPolicy === "end" && Number.isFinite(config.duration)) setElapsed(config.duration);
		const next = compute();
		const changed = KEYS.some((key) => next[key] !== state[key]);
		if (changed) state = next;
		syncClock();
		if (changed) for (const listener of [...listeners]) listener();
	}
	const onIntersect = (visible) => {
		clearTimeout(grace);
		grace = void 0;
		if (!visible && inView && config.leaveGraceMs > MAX_TIMEOUT_MS) return;
		if (visible || !inView || config.leaveGraceMs === 0) {
			inView = visible;
			update();
			return;
		}
		grace = setTimeout(() => {
			grace = void 0;
			inView = false;
			update();
		}, config.leaveGraceMs);
	};
	const watchView = (from) => {
		if (!connected) return;
		clearTimeout(grace);
		grace = void 0;
		inView = observed === null || typeof IntersectionObserver === "undefined";
		if (inView) return;
		if (from !== null && observer) observer.unobserve(from);
		else {
			observer?.disconnect();
			observer = new IntersectionObserver((entries) => {
				const entry = entries.filter((e) => e.target === observed).at(-1);
				if (entry) onIntersect(entry.isIntersecting);
			}, {
				threshold: config.threshold,
				rootMargin: config.rootMargin
			});
		}
		if (observed) observer.observe(observed);
	};
	const watchMotion = () => {
		if (!connected) return;
		unsubscribeMotion();
		const motion = motionSourceFor(config.motion, observed);
		reduced = !motion.get();
		unsubscribeMotion = motion.subscribe(() => {
			reduced = !motion.get();
			update();
		});
	};
	const onVisibility = () => {
		tabVisible = isTabVisible();
		update();
	};
	const connect = () => {
		if (destroyed || connected) return;
		connected = true;
		tabVisible = isTabVisible();
		watchView(null);
		if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);
		watchMotion();
		update();
	};
	const disconnect = () => {
		if (!connected) return;
		connected = false;
		observer?.disconnect();
		observer = void 0;
		clearTimeout(grace);
		grace = void 0;
		if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
		unsubscribeMotion();
		unsubscribeMotion = () => {};
		syncClock();
	};
	if (!bound) connect();
	const play = () => {
		started = true;
		paused = false;
		update();
	};
	const pause = () => {
		paused = true;
		update();
	};
	/** Back to 0, unpaused, and started only if `autoStart`. */
	const restart = () => {
		setElapsed(0);
		started = autoStart();
		paused = false;
	};
	return {
		gate: {
			play,
			pause,
			toggle: () => started && !paused ? pause() : play(),
			replay() {
				setElapsed(0);
				started = true;
				paused = false;
				update();
			},
			seek(ms) {
				if (!Number.isFinite(ms)) throw new LibraryError("invalid_option", { field: "ms" });
				setElapsed(ms);
				update();
			},
			reset() {
				restart();
				update();
			},
			setSpeed(next) {
				speed = checkSpeed(next);
				update();
			},
			destroy() {
				if (destroyed) return;
				disconnect();
				destroyed = true;
				listeners.clear();
			},
			getState: () => state,
			subscribe(callback) {
				listeners.add(callback);
				return () => {
					listeners.delete(callback);
				};
			}
		},
		connect,
		disconnect,
		attach(element) {
			if (destroyed || element === null || element === observed) return;
			const from = observed;
			observed = element;
			if (from === null) restart();
			watchView(from);
			watchMotion();
			update();
		},
		configure(next) {
			if (destroyed) return;
			const nextConfig = readOptions(next);
			const prev = options;
			options = next;
			clocked = next.duration !== void 0 || next.onFrame !== void 0;
			if (next.speed !== void 0 && !Object.is(next.speed, prev.speed)) speed = nextConfig.speed;
			if (RESTART_KEYS.some((key) => !Object.is(next[key], prev[key]))) {
				config = nextConfig;
				restart();
				watchView(null);
				watchMotion();
			}
			update();
		}
	};
}
/** A clock rate, finite and greater than 0, or `invalid_option`. */
function checkSpeed(speed) {
	if (!Number.isFinite(speed) || speed <= 0) throw new LibraryError("invalid_option", { field: "speed" });
	return speed;
}
/**
* Applies defaults. `speed` is checked, since 0, a negative rate or NaN would freeze, reverse or
* break the clock; the other values are trusted as typed.
*/
function readOptions(options) {
	return {
		autoStart: options.autoStart ?? true,
		threshold: options.threshold ?? .15,
		rootMargin: options.rootMargin ?? "0px",
		leaveGraceMs: options.leaveGraceMs ?? 0,
		motion: options.motion ?? "auto",
		reducedPolicy: options.reducedPolicy ?? "end",
		duration: options.duration ?? Number.POSITIVE_INFINITY,
		speed: checkSpeed(options.speed ?? 1)
	};
}
function isTabVisible() {
	return typeof document === "undefined" || document.visibilityState !== "hidden";
}
function requestFrame(callback) {
	if (typeof requestAnimationFrame === "function") return requestAnimationFrame(callback);
	return setTimeout(() => callback(performance.now()), 16);
}
function cancelFrame(id) {
	if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(id);
	else clearTimeout(id);
}
export { checkSpeed, createBoundGate, createPlaybackGate };
