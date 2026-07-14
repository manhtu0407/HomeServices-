import {
  advanceHistoryRailMomentum,
  historyRailMomentumVelocityFromGesture,
  historyRailOffsetFromDrag,
} from '../v21/service-history-rail'

describe('service history filter rail', () => {
  const contentWidth = 987
  const viewportWidth = 550

  it('turns a leftward drag into forward horizontal scrolling', () => {
    expect(historyRailOffsetFromDrag(0, -180, contentWidth, viewportWidth)).toBe(180)
  })

  it('clamps dragging to the available horizontal range', () => {
    expect(historyRailOffsetFromDrag(50, 120, contentWidth, viewportWidth)).toBe(0)
    expect(historyRailOffsetFromDrag(400, -180, contentWidth, viewportWidth)).toBe(437)
  })

  it('turns a fast release into a short decaying glide instead of a jump to the far edge', () => {
    let velocity = historyRailMomentumVelocityFromGesture(-2)
    let offset = 132

    expect(velocity).toBe(1.15)

    for (let frameIndex = 0; frameIndex < 32; frameIndex += 1) {
      const frame = advanceHistoryRailMomentum(offset, velocity, 16, contentWidth, viewportWidth)
      offset = frame.offset
      velocity = frame.velocity
    }

    expect(offset).toBeGreaterThan(132)
    expect(offset).toBeLessThan(300)
    expect(offset).toBeLessThan(contentWidth - viewportWidth)
  })

  it('stops momentum cleanly at either rail boundary', () => {
    const rightEdge = advanceHistoryRailMomentum(430, 1.15, 16, contentWidth, viewportWidth)
    const leftEdge = advanceHistoryRailMomentum(5, -1.15, 16, contentWidth, viewportWidth)

    expect(rightEdge).toEqual({ done: true, offset: 437, velocity: 0 })
    expect(leftEdge).toEqual({ done: true, offset: 0, velocity: 0 })
  })
})
