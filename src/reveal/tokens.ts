/**
 * Motion vocabulary as plain data, for JavaScript animation code that wants the same numbers as
 * `reveal/styles.css` without depending on an animation library. Durations here are in seconds
 * (what JS animation libraries take); the CSS roles use their own millisecond timings, which run
 * a little shorter.
 */

/** The subset of animated properties: opacity, transform and filter. */
export interface MotionKeyframes {
  readonly opacity?: number;
  readonly transform?: string;
  readonly filter?: string;
}

export interface AnimationType {
  readonly initial: MotionKeyframes;
  readonly animate: MotionKeyframes;
}

export interface Spring {
  readonly stiffness: number;
  readonly damping: number;
  readonly mass: number;
}

export interface MotionRoleTiming {
  /** A CSS `cubic-bezier(...)` string. */
  readonly easing: string;
  /** Seconds. */
  readonly duration: number;
}

export type EasingName = "organicSoft" | "organicMid" | "expoOut" | "quartOut" | "standard";
export type DurationName =
  | "heroMedia"
  | "heroHeadline"
  | "heading"
  | "media"
  | "body"
  | "button"
  | "chip";
export type SpringName = "gentle" | "fluid" | "bouncy" | "snappy";
/** Role-named entrances. Each has a default timing in `motionRoles`. */
export type MotionRoleName =
  | "lift-xs"
  | "lift-sm"
  | "lift-md"
  | "lift-lg"
  | "lift-xl"
  | "blur-in-soft"
  | "lift-card"
  | "scale-in-media"
  | "slide-in-chip";
/** Older entrances kept for existing markup; they have no default timing. */
export type LegacyAnimationName =
  | "fade-up"
  | "blur-in"
  | "bounce-in"
  | "slide-left"
  | "slide-right";
export type AnimationName = MotionRoleName | LegacyAnimationName;

export interface MotionTokens {
  readonly easings: Readonly<Record<EasingName, string>>;
  readonly durations: Readonly<Record<DurationName, number>>;
  readonly springs: Readonly<Record<SpringName, Spring>>;
  readonly animationTypes: Readonly<Record<AnimationName, AnimationType>>;
  readonly motionRoles: Readonly<Record<MotionRoleName, MotionRoleTiming>>;
}

const easings: MotionTokens["easings"] = {
  /** Display reveals: headlines, cards, media. */
  organicSoft: "cubic-bezier(0.45, 0.05, 0.25, 1)",
  /** Body copy and ledes: a slightly faster settle. */
  organicMid: "cubic-bezier(0.4, 0.05, 0.2, 1)",
  expoOut: "cubic-bezier(0.16, 1, 0.3, 1)",
  quartOut: "cubic-bezier(0.25, 1, 0.5, 1)",
  /** Cross-fades and in-place state changes. */
  standard: "cubic-bezier(0.4, 0, 0.2, 1)",
};

const durations: MotionTokens["durations"] = {
  heroMedia: 0.8,
  heroHeadline: 0.8,
  heading: 0.6,
  media: 0.6,
  body: 0.5,
  button: 0.4,
  chip: 0.38,
};

const springs: MotionTokens["springs"] = {
  gentle: { stiffness: 100, damping: 15, mass: 1 },
  fluid: { stiffness: 80, damping: 20, mass: 1 },
  bouncy: { stiffness: 200, damping: 10, mass: 0.5 },
  snappy: { stiffness: 300, damping: 20, mass: 0.8 },
};

const lift = (from: string, to = "translateY(0px)"): AnimationType => ({
  initial: { opacity: 0, transform: from },
  animate: { opacity: 1, transform: to },
});

const animationTypes: MotionTokens["animationTypes"] = {
  "lift-xs": lift("translateY(6px)"),
  "lift-sm": lift("translateY(8px)"),
  "lift-md": lift("translateY(10px)"),
  "lift-lg": lift("translateY(12px)"),
  "lift-xl": lift("translateY(18px)"),
  "blur-in-soft": {
    initial: { opacity: 0, filter: "blur(6px)", transform: "translateY(12px)" },
    animate: { opacity: 1, filter: "blur(0px)", transform: "translateY(0px)" },
  },
  "lift-card": lift("translateY(16px)"),
  "scale-in-media": lift("translateY(10px) scale(0.995)", "translateY(0px) scale(1)"),
  "slide-in-chip": lift("translateX(-12px)", "translateX(0px)"),
  "fade-up": lift("translateY(30px)"),
  "blur-in": {
    initial: { opacity: 0, filter: "blur(10px)", transform: "scale(0.95)" },
    animate: { opacity: 1, filter: "blur(0px)", transform: "scale(1)" },
  },
  "bounce-in": lift("scale(0.8)", "scale(1)"),
  "slide-left": lift("translateX(-40px)", "translateX(0px)"),
  "slide-right": lift("translateX(40px)", "translateX(0px)"),
};

const motionRoles: MotionTokens["motionRoles"] = {
  "lift-xs": { easing: easings.organicMid, duration: durations.chip },
  "lift-sm": { easing: easings.organicMid, duration: durations.button },
  "lift-md": { easing: easings.organicSoft, duration: durations.body },
  "lift-lg": { easing: easings.organicSoft, duration: durations.heading },
  "lift-xl": { easing: easings.organicSoft, duration: durations.heroHeadline },
  "blur-in-soft": { easing: easings.organicSoft, duration: durations.heroHeadline },
  "lift-card": { easing: easings.organicSoft, duration: durations.media },
  "scale-in-media": { easing: easings.organicSoft, duration: durations.heroMedia },
  "slide-in-chip": { easing: easings.organicMid, duration: durations.chip },
};

/** Easings, durations (seconds), springs, entrance keyframes and per-role timings. */
export const motionTokens: MotionTokens = Object.freeze({
  easings,
  durations,
  springs,
  animationTypes,
  motionRoles,
});
