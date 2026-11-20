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
export type DurationName = "heroMedia" | "heroHeadline" | "heading" | "media" | "body" | "button" | "chip";
export type SpringName = "gentle" | "fluid" | "bouncy" | "snappy";
/** Role-named entrances. Each has a default timing in `motionRoles`. */
export type MotionRoleName = "lift-xs" | "lift-sm" | "lift-md" | "lift-lg" | "lift-xl" | "blur-in-soft" | "lift-card" | "scale-in-media" | "slide-in-chip";
/** Older entrances kept for existing markup; they have no default timing. */
export type LegacyAnimationName = "fade-up" | "blur-in" | "bounce-in" | "slide-left" | "slide-right";
export type AnimationName = MotionRoleName | LegacyAnimationName;
export interface MotionTokens {
  readonly easings: Readonly<Record<EasingName, string>>;
  readonly durations: Readonly<Record<DurationName, number>>;
  readonly springs: Readonly<Record<SpringName, Spring>>;
  readonly animationTypes: Readonly<Record<AnimationName, AnimationType>>;
  readonly motionRoles: Readonly<Record<MotionRoleName, MotionRoleTiming>>;
}
/** Easings, durations (seconds), springs, entrance keyframes and per-role timings. */
export declare const motionTokens: MotionTokens;