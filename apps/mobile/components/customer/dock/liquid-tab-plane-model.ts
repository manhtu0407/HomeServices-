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

export type LiquidPendingSelection = { index: number; routedIndex: number | null }

// A released lens rests on its target only while the route still shows the tab it left. Once
// the route moves (to the target or anywhere else) the pending choice is spent, so a later
// return to the old tab cannot resurrect it.
export function liquidPendingAfterRoute(pending: LiquidPendingSelection | null, selectedIndex: number | null) {
  return pending && pending.routedIndex === selectedIndex ? pending : null
}

export type LiquidTouchFrame = { originX: number; scale: number }

// Each touch is resolved against the plane measured for that touch (the dock row scales while
// the page scrolls). A release that lands before the measurement is held and replayed when the
// measurement arrives, so a quick tap is never dropped.
export function createLiquidTouchSession() {
  let frame: LiquidTouchFrame | null = null
  let latestX: number | null = null
  let held: { pageX: number; velocity: number } | null = null
  const toLocal = (pageX: number) => (frame ? (pageX - frame.originX) / frame.scale : null)
  return {
    cancel() {
      latestX = null
      held = null
    },
    grant(pageX: number) {
      frame = null
      latestX = pageX
      held = null
    },
    measured(next: LiquidTouchFrame): { press: number | null; release: { localX: number; velocity: number } | null } {
      frame = next
      if (held) {
        const release = { localX: (held.pageX - next.originX) / next.scale, velocity: held.velocity }
        held = null
        latestX = null
        return { press: null, release }
      }
      return { press: latestX === null ? null : toLocal(latestX), release: null }
    },
    move(pageX: number) {
      latestX = pageX
      return toLocal(pageX)
    },
    release(pageX: number, velocity: number): { held: true } | { held: false; localX: number } {
      latestX = null
      const localX = toLocal(pageX)
      if (localX === null) {
        held = { pageX, velocity }
        return { held: true }
      }
      return { held: false, localX }
    },
  }
}
