// src/reveal/tokens.ts
const easings = {
	/** Display reveals: headlines, cards, media. */
	organicSoft: "cubic-bezier(0.45, 0.05, 0.25, 1)",
	/** Body copy and ledes: a slightly faster settle. */
	organicMid: "cubic-bezier(0.4, 0.05, 0.2, 1)",
	expoOut: "cubic-bezier(0.16, 1, 0.3, 1)",
	quartOut: "cubic-bezier(0.25, 1, 0.5, 1)",
	/** Cross-fades and in-place state changes. */
	standard: "cubic-bezier(0.4, 0, 0.2, 1)"
};
const durations = {
	heroMedia: .8,
	heroHeadline: .8,
	heading: .6,
	media: .6,
	body: .5,
	button: .4,
	chip: .38
};
const springs = {
	gentle: {
		stiffness: 100,
		damping: 15,
		mass: 1
	},
	fluid: {
		stiffness: 80,
		damping: 20,
		mass: 1
	},
	bouncy: {
		stiffness: 200,
		damping: 10,
		mass: .5
	},
	snappy: {
		stiffness: 300,
		damping: 20,
		mass: .8
	}
};
const lift = (from, to = "translateY(0px)") => ({
	initial: {
		opacity: 0,
		transform: from
	},
	animate: {
		opacity: 1,
		transform: to
	}
});
const animationTypes = {
	"lift-xs": lift("translateY(6px)"),
	"lift-sm": lift("translateY(8px)"),
	"lift-md": lift("translateY(10px)"),
	"lift-lg": lift("translateY(12px)"),
	"lift-xl": lift("translateY(18px)"),
	"blur-in-soft": {
		initial: {
			opacity: 0,
			filter: "blur(6px)",
			transform: "translateY(12px)"
		},
		animate: {
			opacity: 1,
			filter: "blur(0px)",
			transform: "translateY(0px)"
		}
	},
	"lift-card": lift("translateY(16px)"),
	"scale-in-media": lift("translateY(10px) scale(0.995)", "translateY(0px) scale(1)"),
	"slide-in-chip": lift("translateX(-12px)", "translateX(0px)"),
	"fade-up": lift("translateY(30px)"),
	"blur-in": {
		initial: {
			opacity: 0,
			filter: "blur(10px)",
			transform: "scale(0.95)"
		},
		animate: {
			opacity: 1,
			filter: "blur(0px)",
			transform: "scale(1)"
		}
	},
	"bounce-in": lift("scale(0.8)", "scale(1)"),
	"slide-left": lift("translateX(-40px)", "translateX(0px)"),
	"slide-right": lift("translateX(40px)", "translateX(0px)")
};
const motionRoles = {
	"lift-xs": {
		easing: easings.organicMid,
		duration: durations.chip
	},
	"lift-sm": {
		easing: easings.organicMid,
		duration: durations.button
	},
	"lift-md": {
		easing: easings.organicSoft,
		duration: durations.body
	},
	"lift-lg": {
		easing: easings.organicSoft,
		duration: durations.heading
	},
	"lift-xl": {
		easing: easings.organicSoft,
		duration: durations.heroHeadline
	},
	"blur-in-soft": {
		easing: easings.organicSoft,
		duration: durations.heroHeadline
	},
	"lift-card": {
		easing: easings.organicSoft,
		duration: durations.media
	},
	"scale-in-media": {
		easing: easings.organicSoft,
		duration: durations.heroMedia
	},
	"slide-in-chip": {
		easing: easings.organicMid,
		duration: durations.chip
	}
};
/** Easings, durations (seconds), springs, entrance keyframes and per-role timings. */
const motionTokens = Object.freeze({
	easings,
	durations,
	springs,
	animationTypes,
	motionRoles
});
export { motionTokens };
