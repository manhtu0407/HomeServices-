export type RouteMapPoint = { latitude: number; longitude: number }

/** Pixel size of the static map the route-map endpoint requests from the provider. */
export const ROUTE_MAP_SIZE = { height: 400, width: 600 } as const

// Web Mercator tile edge. The provider's static map uses the standard 256px tile; if it ever serves 512px
// tiles every projected point lands at the wrong place, so this is the one constant to re-check first.
const TILE_SIZE = 256

/** Mirrors routeMapZoom in supabase/functions/mobile-api/_shared/domains/worker/route.ts. */
export function routeMapZoom(origin: RouteMapPoint | null, destination: RouteMapPoint): number {
  if (!origin) return 15
  const delta = Math.max(Math.abs(origin.latitude - destination.latitude), Math.abs(origin.longitude - destination.longitude))
  if (delta < 0.008) return 15
  if (delta < 0.02) return 14
  if (delta < 0.05) return 13
  return 12
}

/** Mirrors the centre getWorkerRouteMap sends: the origin/destination midpoint, or the destination alone. */
export function routeMapCenter(origin: RouteMapPoint | null, destination: RouteMapPoint): RouteMapPoint {
  if (!origin) return destination
  return {
    latitude: (origin.latitude + destination.latitude) / 2,
    longitude: (origin.longitude + destination.longitude) / 2,
  }
}

function worldPoint(point: RouteMapPoint, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom
  const sine = Math.min(Math.max(Math.sin((point.latitude * Math.PI) / 180), -0.9999), 0.9999)
  return {
    x: ((point.longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * scale,
  }
}

export type RouteMapFrame = { center: RouteMapPoint; zoom: number }

export function routeMapFrame(origin: RouteMapPoint | null, destination: RouteMapPoint): RouteMapFrame {
  return { center: routeMapCenter(origin, destination), zoom: routeMapZoom(origin, destination) }
}

/** Position of a coordinate inside the ROUTE_MAP_SIZE image. */
export function projectToRouteMap(point: RouteMapPoint, frame: RouteMapFrame): { x: number; y: number } {
  const target = worldPoint(point, frame.zoom)
  const middle = worldPoint(frame.center, frame.zoom)
  return {
    x: ROUTE_MAP_SIZE.width / 2 + (target.x - middle.x),
    y: ROUTE_MAP_SIZE.height / 2 + (target.y - middle.y),
  }
}
