/** Screen-ratio contract shared by the eleven-stage Worker Jobs packages.

 * Every stage keeps its own measured card geometry, but text resolves against the window
 * through `stageTypography` so a host's padding never shrinks copy relative to the app's
 * canonical Apple/SF Pro type scale (design/theme.ts) — one clamp band, one role table, no
 * per-stage font-size ramp.
 */

import { component, radius, scaledTypography, spacing, typography, type AppleTypographyRole } from '@/design/theme'
import { useWindowDimensions, type TextStyle } from 'react-native'

export const STAGE_REFERENCE_WIDTH = 390
export const STAGE_MIN_TAP_SIZE = 44
export const STAGE_MAX_FONT_MULTIPLIER = 1.3
/** The smallest text anywhere in the eleven-stage flow is `caption2` — Apple's own Dynamic Type
 *  scale has no smaller role, and text under it fails accessibility minimums. */
export const STAGE_MIN_FONT_SIZE = typography.caption2.fontSize

const TYPE_BAND_MIN = 0.9
const TYPE_BAND_MAX = 1.1

/** Layout standard for every stage, taken from the app theme so Worker Jobs matches Admin and
 *  Customer. Values are at the 390pt reference; `stageMetric` applies the same band as text. */
export const stageLayout = {
  gutter: spacing.screenHorizontalPadding,
  cardRadius: radius.lg,
  cardPadding: spacing.cardPadding,
  innerRadius: radius.md,
  innerPadding: spacing.cardPaddingSmall,
  sectionGap: spacing.sectionGap,
  componentGap: spacing.componentGap,
  buttonHeight: component.button.primary.height,
  buttonRadius: component.button.primary.radius,
  buttonPaddingX: component.button.primary.paddingX,
  tapSize: STAGE_MIN_TAP_SIZE,
} as const

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** The one band every stage's TEXT resolves against — always the window width, never a
 *  locally-measured container width, so a host's padding never shrinks copy relative to the
 *  approved reference. */
export function stageTypeBand(windowWidth: number): number {
  return clamp(windowWidth / STAGE_REFERENCE_WIDTH, TYPE_BAND_MIN, TYPE_BAND_MAX)
}

/** The one scaling function every stage's text goes through. Reuses theme.ts's own per-role
 *  fontSize/lineHeight ratio (scaledTypography scales both by the same factor, so body's native
 *  22/17 ratio etc. is preserved exactly) — no per-stage lineHeight ratio is invented.
 *  `extraScale` is only for the handful of intentional oversized numeric displays (countdown
 *  timers, hero money amounts) that sit above largeTitle; every normal text node omits it.
 *  The narrow end of the band can shrink `caption2` under the house floor on its own (11 * 0.9
 *  rounds to 10); when that happens the factor is corrected so fontSize lands exactly on the
 *  floor, recomputing lineHeight from the same factor rather than leaving it mismatched. */
export function stageTypography(role: AppleTypographyRole, windowWidth: number, extraScale = 1): TextStyle {
  const scaled = scaledTypography(role, stageTypeBand(windowWidth) * extraScale)
  if ((scaled.fontSize ?? 0) >= STAGE_MIN_FONT_SIZE) return scaled
  return scaledTypography(role, STAGE_MIN_FONT_SIZE / typography[role].fontSize)
}

export function stageTapSize(canvasSize: number, scale: number): number {
  return Math.max(STAGE_MIN_TAP_SIZE, canvasSize * scale)
}

/** Box geometry (radius, padding, gaps, control heights) on the same band as `stageTypography`,
 *  so text and the box around it grow together instead of drifting apart. */
export function stageMetric(value: number, windowWidth: number): number {
  return Math.round(value * stageTypeBand(windowWidth))
}

export function stageButtonHeight(windowWidth: number): number {
  return Math.max(STAGE_MIN_TAP_SIZE, stageMetric(stageLayout.buttonHeight, windowWidth))
}

/** Decorative drawings only (rings, hero art, maps, glyphs): scale an authored canvas to the
 *  real content width the stage was given, never to the window or a guessed host inset. */
export function stageCanvasScale(contentWidth: number, canvasWidth: number): number {
  return contentWidth / canvasWidth
}

export function useStageLayout() {
  const { width: windowWidth } = useWindowDimensions()
  return {
    windowWidth,
    metric: (value: number) => stageMetric(value, windowWidth),
    buttonHeight: stageButtonHeight(windowWidth),
  }
}
