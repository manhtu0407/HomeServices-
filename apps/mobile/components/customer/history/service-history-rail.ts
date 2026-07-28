const HISTORY_RAIL_MAX_MOMENTUM_VELOCITY = 1.15
const HISTORY_RAIL_DECAY_PER_FRAME = 0.88
const HISTORY_RAIL_FRAME_MS = 1000 / 60
const HISTORY_RAIL_MAX_FRAME_MS = 32
const HISTORY_RAIL_MIN_MOMENTUM_VELOCITY = 0.025

export function clampHistoryRailOffset(
  offset: number,
  contentWidth: number,
  viewportWidth: number,
) {
  const maxOffset = Math.max(0, contentWidth - viewportWidth)
  return Math.max(0, Math.min(offset, maxOffset))
}

export function historyRailOffsetFromDrag(
  startOffset: number,
  dragDistanceX: number,
  contentWidth: number,
  viewportWidth: number,
) {
  return clampHistoryRailOffset(startOffset - dragDistanceX, contentWidth, viewportWidth)
}

export function historyRailMomentumVelocityFromGesture(gestureVelocityX: number) {
  return Math.max(
    -HISTORY_RAIL_MAX_MOMENTUM_VELOCITY,
    Math.min(-gestureVelocityX, HISTORY_RAIL_MAX_MOMENTUM_VELOCITY),
  )
}

export function advanceHistoryRailMomentum(
  currentOffset: number,
  velocity: number,
  elapsedMs: number,
  contentWidth: number,
  viewportWidth: number,
) {
  const duration = Math.max(0, Math.min(elapsedMs, HISTORY_RAIL_MAX_FRAME_MS))
  const decay = Math.pow(HISTORY_RAIL_DECAY_PER_FRAME, duration / HISTORY_RAIL_FRAME_MS)
  const nextVelocity = velocity * decay
  const nextOffset = clampHistoryRailOffset(
    currentOffset + nextVelocity * duration,
    contentWidth,
    viewportWidth,
  )
  const maxOffset = Math.max(0, contentWidth - viewportWidth)
  const hitBoundary = (nextOffset <= 0 && nextVelocity < 0)
    || (nextOffset >= maxOffset && nextVelocity > 0)
  const done = hitBoundary || Math.abs(nextVelocity) < HISTORY_RAIL_MIN_MOMENTUM_VELOCITY

  return {
    done,
    offset: nextOffset,
    velocity: done ? 0 : nextVelocity,
  }
}
