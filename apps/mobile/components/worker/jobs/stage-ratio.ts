/** Screen-ratio contract shared by the eleven-stage Worker Jobs packages.

 * Stage 2 keeps its measured card geometry, but its type resolves against the window so the
 * production host padding does not shrink copy relative to the approved reference.
 */

export const STAGE_REFERENCE_WIDTH = 390
export const STAGE_MIN_FONT_SIZE = 11
export const STAGE_MIN_TAP_SIZE = 44
export const STAGE_MAX_FONT_MULTIPLIER = 1.3

const TYPE_BAND_MIN = 0.9
const TYPE_BAND_MAX = 1.1

export const STAGE_REFERENCE_SCALE = {
  waiting: STAGE_REFERENCE_WIDTH / 560,
  travelWork: STAGE_REFERENCE_WIDTH / 446,
  evidence: STAGE_REFERENCE_WIDTH / 420,
  stageTen: (STAGE_REFERENCE_WIDTH - 32) / 366,
  stageEleven: 1,
  requestDetails: STAGE_REFERENCE_WIDTH / 728,
} as const

const STAGE_TYPE_RAMP = [11, 12, 13, 15, 16, 17, 20, 22, 28, 34] as const
const STAGE_READING_BAND_MAX = 20

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function stageSnapToRamp(size: number): number {
  if (size > STAGE_READING_BAND_MAX) return size
  let best = size
  let bestGap = Infinity
  for (const step of STAGE_TYPE_RAMP) {
    const gap = Math.abs(step - size)
    if (gap < bestGap) {
      bestGap = gap
      best = step
    }
  }
  return best
}

export function stageFontSize(canvasSize: number, referenceScale: number, windowWidth: number): number {
  const band = clamp(windowWidth / STAGE_REFERENCE_WIDTH, TYPE_BAND_MIN, TYPE_BAND_MAX)
  return Math.max(STAGE_MIN_FONT_SIZE, stageSnapToRamp(canvasSize * referenceScale * band))
}

export function stageLineHeight(fontSize: number, ratio = 1.33): number {
  return Math.round(fontSize * ratio * 10) / 10
}

export function stageTapSize(canvasSize: number, scale: number): number {
  return Math.max(STAGE_MIN_TAP_SIZE, canvasSize * scale)
}
