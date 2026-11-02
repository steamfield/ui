// How the React and Vue bindings replace a playback gate when its element or options change, so
// both follow one rule: a swap between elements keeps progress, anything else starts over.
// `internal` imports no subpath, so the gate is described by the parts used here.

/** Whether two option lists hold the same values, compared with `Object.is`. */
export function sameInputs(a: readonly unknown[] | null, b: readonly unknown[]): boolean {
  return a !== null && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
}

/** Puts a fresh gate where the old one was: its position, and whether it was started or paused. */
export function carryOver(
  gate: {
    readonly seek: (ms: number) => void;
    readonly play: () => void;
    readonly pause: () => void;
  },
  from: { readonly elapsed: number; readonly started: boolean; readonly paused: boolean },
): void {
  gate.seek(from.elapsed);
  if (from.started) gate.play();
  if (from.paused) gate.pause();
}
