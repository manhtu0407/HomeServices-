// Single source of motion numbers for the app. The token names are the shared
// vocabulary described in governance/design/motion.md — keep the two in sync.
// withTiming reads the *DurationMs fields; withSpring reads the *.spring / liquid.*
// configs. Every timing is clamped to reducedMotionCapMs when Reduce Motion is on
// (see motionDuration). Spring overshoot is dropped under Reduce Motion at the call site.
export const motionTokens = {
  // Press / tap acknowledgement. scale is consumed by reduceMotionAwarePressStyle.
  feedback: {
    durationMs: 140,
    scale: 0.985,
  },
  // One-shot reveal for a selected chip / selected service.
  selection: {
    durationMs: 200,
  },
  // Screen and element enter for major flows. The spring settles the y-offset;
  // the fade uses durationMs. Replaces the old global entrance timing that read as sluggish.
  route: {
    durationMs: 220,
    translateY: 16,
    spring: {
      damping: 18,
      stiffness: 160,
    },
  },
  // Bottom sheet / modal shell.
  sheet: {
    durationMs: 300,
    spring: {
      damping: 18,
      stiffness: 160,
    },
  },
  // Job / status transition when a change is worth showing.
  stateChange: {
    durationMs: 240,
  },
  // Skeleton shimmer loop; low contrast, never blocks the flow.
  loading: {
    durationMs: 1400,
  },
  // Reduce Motion ceiling: no timing animation runs longer than this when the OS
  // "Reduce Motion" setting is on. Applied globally through motionDuration.
  reducedMotionCapMs: 160,
  // Liquid-glass signature springs — used across customer and worker surfaces.
  // Do not change these values (governance/design/signature.md recipe).
  liquid: {
    entrance: {
      damping: 16,
      mass: 1,
      stiffness: 170,
    },
    pill: {
      damping: 14,
      mass: 1,
      stiffness: 200,
    },
    press: {
      damping: 22,
      mass: 1,
      stiffness: 320,
    },
  },
}

export function motionDuration(baseMs: number, reduceMotion: boolean) {
  return reduceMotion ? Math.min(baseMs, motionTokens.reducedMotionCapMs) : baseMs
}
