export const motionTokens = {
  entrance: {
    durationMs: 440,
    reducedDurationMs: 160,
    scaleFrom: 0.98,
    staggerDelayMs: 60,
    translateY: 16,
  },
  press: {
    durationMs: 110,
    scale: 0.98,
  },
  sheet: {
    damping: 18,
    durationMs: 360,
    stiffness: 160,
  },
}

export function motionDuration(baseMs: number, reduceMotion: boolean) {
  return reduceMotion ? Math.min(baseMs, motionTokens.entrance.reducedDurationMs) : baseMs
}
