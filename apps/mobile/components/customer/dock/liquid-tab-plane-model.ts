// Geometry and motion shape for the liquid tab bar's selection lens. Pure, so the gesture
// maths can be tested without a device.

export type LiquidTabGeometry = {
  count: number
  padding: number
  width: number
}

export function liquidTabWidth({ count, padding, width }: LiquidTabGeometry) {
  return Math.max(width - padding * 2, 0) / Math.max(count, 1)
}

export function liquidTabIndexAt(localX: number, geometry: LiquidTabGeometry) {
  const tabWidth = liquidTabWidth(geometry)
  if (tabWidth === 0) return 0
  const index = Math.floor((localX - geometry.padding) / tabWidth)
  return Math.min(Math.max(index, 0), Math.max(geometry.count, 1) - 1)
}

export function liquidLensRestX(index: number, geometry: LiquidTabGeometry) {
  return geometry.padding + index * liquidTabWidth(geometry)
}

// While a finger drags the lens it stays centred under the finger but never leaves the bar.
export function liquidLensDragX(localX: number, geometry: LiquidTabGeometry) {
  const tabWidth = liquidTabWidth(geometry)
  const min = geometry.padding
  const max = geometry.padding + tabWidth * (Math.max(geometry.count, 1) - 1)
  return Math.min(Math.max(localX - tabWidth / 2, min), max)
}

// The lens stretches along its travel and thins across it, more for a longer jump or a
// faster release, then springs back: the liquid read of iOS tab selection.
export function liquidLensStretch(travelTabs: number, releaseVelocity = 0) {
  const stretch = Math.min(0.34, Math.abs(travelTabs) * 0.1 + Math.abs(releaseVelocity) * 0.06)
  return { scaleX: 1 + stretch, scaleY: 1 - stretch * 0.45 }
}

export const LIQUID_LENS_LIFT_SCALE = 1.14
