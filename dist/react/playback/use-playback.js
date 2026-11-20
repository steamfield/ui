import { createBoundGate } from "../../playback/gate.js";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
// src/react/playback/use-playback.ts
/** Everything off: what the server and the first client render see. */
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
const noop = () => {};
const idle = () => IDLE;
/**
* A `PlaybackRef` whose writes go to `attach`, so the element may mount late, change or detach.
* Shared with `useAgentDemo`.
*/
function playbackRef(attach) {
	let current = null;
	const set = (node) => {
		current = node;
		attach(node);
	};
	return Object.defineProperty(set, "current", {
		get: () => current,
		set
	});
}
/**
* The gate behind `usePlayback` and `useCountUp`: one `BoundGate` for the hook's life, created
* during render (it reads nothing from the browser until connected), connected in an effect and
* read through a store. The gate itself follows the element, the options and the rate.
*/
function useGate(options) {
	const [bound] = useState(() => createBoundGate(options));
	const [gate, setGate] = useState(null);
	const [ref] = useState(() => playbackRef(bound.attach));
	useEffect(() => {
		bound.connect();
		setGate(bound);
		return () => {
			bound.disconnect();
			setGate(null);
		};
	}, [bound]);
	useEffect(() => {
		bound.configure(options);
	});
	const subscribe = useCallback((cb) => gate?.subscribe(cb) ?? noop, [gate]);
	const snapshot = useCallback(() => gate?.getState() ?? IDLE, [gate]);
	return {
		ref,
		gate,
		state: useSyncExternalStore(subscribe, snapshot, idle),
		setSpeed: bound.setSpeed
	};
}
/**
* React state for a demo that plays only while it is on screen, the tab is visible, motion is
* allowed and the user hasn't paused. SSR-safe: nothing reads the browser during render, every
* flag starts false and `ready` flips in an effect.
*/
function usePlayback(options = {}) {
	const { ref, gate, state, setSpeed } = useGate(options);
	const play = useCallback(() => gate?.play(), [gate]);
	const pause = useCallback(() => gate?.pause(), [gate]);
	const toggle = useCallback(() => gate?.toggle(), [gate]);
	const replay = useCallback(() => gate?.replay(), [gate]);
	const seek = useCallback((ms) => gate?.seek(ms), [gate]);
	const reset = useCallback(() => gate?.reset(), [gate]);
	return {
		ref,
		elapsed: state.elapsed,
		started: state.started,
		playing: state.playing,
		paused: state.paused,
		reduced: state.reduced,
		complete: state.complete,
		speed: gate ? state.speed : options.speed ?? 1,
		ready: gate !== null,
		play,
		pause,
		toggle,
		replay,
		seek,
		reset,
		setSpeed
	};
}
export { playbackRef, useGate, usePlayback };
