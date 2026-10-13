import { buildDirectionsUrl, buildLocationShareMessage } from '../route-navigation'
import {
  ROUTE_MAP_SIZE,
  projectToRouteMap,
  routeMapCenter,
  routeMapFrame,
  routeMapZoom,
} from '../route-map-projection'

const origin = { latitude: 10.7769, longitude: 106.7009 }
const destination = { latitude: 10.7942, longitude: 106.7218 }

describe('route map projection', () => {
  it('uses the same zoom steps as the route-map endpoint', () => {
    expect(routeMapZoom(null, destination)).toBe(15)
    expect(routeMapZoom({ latitude: 10.0, longitude: 106.0 }, { latitude: 10.007, longitude: 106.0 })).toBe(15)
    expect(routeMapZoom({ latitude: 10.0, longitude: 106.0 }, { latitude: 10.01, longitude: 106.0 })).toBe(14)
    expect(routeMapZoom({ latitude: 10.0, longitude: 106.0 }, { latitude: 10.03, longitude: 106.0 })).toBe(13)
    expect(routeMapZoom({ latitude: 10.0, longitude: 106.0 }, { latitude: 10.2, longitude: 106.0 })).toBe(12)
  })

  it('centres on the midpoint, or on the destination when the origin is unknown', () => {
    expect(routeMapCenter(origin, destination)).toEqual({
      latitude: (origin.latitude + destination.latitude) / 2,
      longitude: (origin.longitude + destination.longitude) / 2,
    })
    expect(routeMapCenter(null, destination)).toEqual(destination)
  })

  it('puts the frame centre in the middle of the image', () => {
    const frame = routeMapFrame(origin, destination)
    const middle = projectToRouteMap(frame.center, frame)
    expect(middle.x).toBeCloseTo(ROUTE_MAP_SIZE.width / 2, 5)
    expect(middle.y).toBeCloseTo(ROUTE_MAP_SIZE.height / 2, 5)
  })

  it('places the origin west/south of the destination and both inside the image', () => {
    const frame = routeMapFrame(origin, destination)
    const from = projectToRouteMap(origin, frame)
    const to = projectToRouteMap(destination, frame)
    expect(from.x).toBeLessThan(to.x)
    expect(from.y).toBeGreaterThan(to.y)
    for (const point of [from, to]) {
      expect(point.x).toBeGreaterThan(0)
      expect(point.x).toBeLessThan(ROUTE_MAP_SIZE.width)
      expect(point.y).toBeGreaterThan(0)
      expect(point.y).toBeLessThan(ROUTE_MAP_SIZE.height)
    }
  })

  it('scales longitude to 256 * 2^zoom pixels per 360 degrees', () => {
    const frame = { center: { latitude: 10.78, longitude: 106.7 }, zoom: 15 }
    const east = projectToRouteMap({ latitude: 10.78, longitude: 106.701 }, frame)
    const pixelsPerDegree = (256 * 2 ** 15) / 360
    expect(east.x - ROUTE_MAP_SIZE.width / 2).toBeCloseTo(pixelsPerDegree * 0.001, 3)
  })
})

describe('route navigation links', () => {
  it('opens Apple Maps driving directions on iOS and Google Maps elsewhere, without a start point', () => {
    expect(buildDirectionsUrl('ios', destination)).toBe('https://maps.apple.com/?daddr=10.794200,106.721800&dirflg=d')
    expect(buildDirectionsUrl('android', destination)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=10.794200,106.721800&travelmode=two-wheeler',
    )
    expect(buildDirectionsUrl('web', destination)).toContain('google.com/maps/dir')
  })

  it('builds a localized share message that carries only the worker position', () => {
    const vi = buildLocationShareMessage(origin, 'vi')
    expect(vi).toBe('Vị trí hiện tại của tôi: https://www.google.com/maps?q=10.776900,106.700900')
    expect(buildLocationShareMessage(origin, 'en')).toContain('My current location')
    expect(vi).not.toContain('10.7942')
  })
})
