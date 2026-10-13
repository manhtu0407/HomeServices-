import type { LocalWorkerTravel } from '@nestscout/shared'

import {
  TRAVEL_STALE_SECONDS,
  buildTravelReadout,
  formatTravelDistance,
  formatTravelAge,
  projectTravel,
} from '../kael-chat/case-work-travel-model'

const NOW = Date.parse('2026-10-13T07:00:00.000Z')

const travel = (overrides: Partial<LocalWorkerTravel> = {}): LocalWorkerTravel => ({
  position: [10.8423, 106.8304],
  remainingMeters: 3300,
  remainingSeconds: 600,
  route: [[10.8406, 106.8271], [10.8411, 106.829], [10.8423, 106.8304], [10.8431, 106.8325], [10.849, 106.8421]],
  totalMeters: 5400,
  updatedAt: new Date(NOW - 20_000).toISOString(),
  ...overrides,
})

describe('buildTravelReadout', () => {
  it('splits the trip into driven and remaining and quotes an arrival time from the fresh report', () => {
    const readout = buildTravelReadout(travel(), NOW, 'vi')
    expect(readout.traveledMeters).toBe(2100)
    expect(readout.remainingMeters).toBe(3300)
    expect(readout.progress).toBeCloseTo(2100 / 5400)
    expect(readout.minutesLeft).toBe(10)
    expect(readout.stale).toBe(false)
    expect(readout.arrivalClock).toMatch(/\d{2}:\d{2}/)
    expect(readout.birdMeters).toBeGreaterThan(0)
    expect(readout.birdMeters).toBeLessThan(readout.remainingMeters)
  })

  it('withholds the arrival time once the position is older than the stale window', () => {
    const readout = buildTravelReadout(
      travel({ updatedAt: new Date(NOW - (TRAVEL_STALE_SECONDS + 5) * 1000).toISOString() }),
      NOW,
      'vi',
    )
    expect(readout.stale).toBe(true)
    expect(readout.arrivalClock).toBeNull()
  })

  it('treats an unreadable timestamp as stale instead of quoting a time', () => {
    const readout = buildTravelReadout(travel({ updatedAt: 'not-a-date' }), NOW, 'vi')
    expect(readout.stale).toBe(true)
    expect(readout.arrivalClock).toBeNull()
  })

  it('never reports negative driven distance or progress above one', () => {
    const readout = buildTravelReadout(travel({ remainingMeters: 6000, totalMeters: 5400 }), NOW, 'vi')
    expect(readout.traveledMeters).toBe(0)
    expect(readout.progress).toBe(0)
    expect(buildTravelReadout(travel({ remainingMeters: 0 }), NOW, 'vi').progress).toBe(1)
  })
})

describe('projectTravel', () => {
  it('keeps every point inside the box and cuts the route at the worker', () => {
    const projection = projectTravel(travel(), 320, 200, 40)
    const points = [
      ...projection.traveledPath,
      ...projection.remainingPath,
      projection.origin,
      projection.destination,
      projection.worker,
    ]
    for (const point of points) {
      expect(point.x).toBeGreaterThanOrEqual(0)
      expect(point.x).toBeLessThanOrEqual(320)
      expect(point.y).toBeGreaterThanOrEqual(0)
      expect(point.y).toBeLessThanOrEqual(200)
    }
    expect(projection.traveledPath[projection.traveledPath.length - 1]).toEqual(projection.worker)
    expect(projection.remainingPath[0]).toEqual(projection.worker)
    expect(projection.remainingPath[projection.remainingPath.length - 1]).toEqual(projection.destination)
  })

  it('keeps the destination at the end of the remaining path when the worker is already at it', () => {
    const route = travel().route
    const projection = projectTravel(travel({ position: route[route.length - 1] }), 320, 200, 40)
    expect(projection.remainingPath.length).toBeGreaterThanOrEqual(1)
    expect(projection.remainingPath[0]).toEqual(projection.worker)
  })
})

describe('travel labels', () => {
  it('writes short distances in metres and long ones in kilometres with the locale separator', () => {
    expect(formatTravelDistance(860, 'vi')).toBe('860 m')
    expect(formatTravelDistance(3300, 'vi')).toBe('3,3 km')
    expect(formatTravelDistance(3300, 'en')).toBe('3.3 km')
  })

  it('says how old the report is', () => {
    expect(formatTravelAge(20, 'vi')).toBe('vừa xong')
    expect(formatTravelAge(125, 'vi')).toBe('2 phút trước')
    expect(formatTravelAge(125, 'en')).toBe('2 min ago')
  })
})
