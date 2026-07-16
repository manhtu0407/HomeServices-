const DOCK_SCROLL_DIRECTION_THRESHOLD = 12
const DOCK_SCROLL_TOP_THRESHOLD = 4

export type DockScrollState = {
  anchorY: number
  collapsed: boolean
}

export function createDockScrollState(): DockScrollState {
  return { anchorY: 0, collapsed: false }
}

export function resolveDockScrollState(previous: DockScrollState, offsetY: number): DockScrollState {
  const nextY = Number.isFinite(offsetY) ? Math.max(0, offsetY) : 0

  if (nextY <= DOCK_SCROLL_TOP_THRESHOLD) {
    return { anchorY: nextY, collapsed: false }
  }

  const deltaY = nextY - previous.anchorY
  if (Math.abs(deltaY) < DOCK_SCROLL_DIRECTION_THRESHOLD) return previous

  return { anchorY: nextY, collapsed: deltaY > 0 }
}
