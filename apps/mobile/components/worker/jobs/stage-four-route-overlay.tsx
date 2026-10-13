import { Circle, Path, Polyline } from 'react-native-svg'

import { FillSvg } from '@/components/ui/fill-svg'
import { ROUTE_MAP_SIZE, projectToRouteMap, routeMapFrame, type RouteMapPoint } from '@/lib/route-map-projection'
import type { WorkerRouteGeometry } from '@/lib/route-geometry'

import type { WorkerThemeTokens } from '../worker-theme'

const PIN_PATH = 'M12 21s6-6.1 6-11.2A6 6 0 0 0 6 9.8C6 14.9 12 21 12 21Z'
const PIN_SCALE = 1.9

/** Draws the worker's position, the building and the route over the static map image, in the image's own pixels. */
export function StageFourRouteOverlay({
  destination,
  geometry,
  origin,
  tokens,
  zoom = 1,
}: {
  zoom?: number
  destination: RouteMapPoint
  geometry: WorkerRouteGeometry | null
  origin: RouteMapPoint
  tokens: Pick<WorkerThemeTokens, 'base' | 'primary' | 'text'>
}) {
  const frame = routeMapFrame(origin, destination)
  const unit = 1 / zoom
  const start = projectToRouteMap(origin, frame)
  const end = projectToRouteMap(destination, frame)
  const line = geometry?.coordinates
    .map(([longitude, latitude]) => projectToRouteMap({ latitude, longitude }, frame))
    .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(' ')

  return (
    <FillSvg
      preserveAspectRatio="xMidYMid slice"
      testID="stage4-route-overlay"
      viewBox={`0 0 ${ROUTE_MAP_SIZE.width} ${ROUTE_MAP_SIZE.height}`}
    >
      {line ? (
        <>
          <Polyline fill="none" points={line} stroke={tokens.base} strokeLinecap="round" strokeLinejoin="round" strokeWidth={11 * unit} />
          <Polyline fill="none" points={line} stroke={tokens.primary} strokeLinecap="round" strokeLinejoin="round" strokeWidth={6 * unit} testID="stage4-route-line" />
        </>
      ) : null}
      <Circle cx={start.x} cy={start.y} fill={tokens.text} r={9 * unit} stroke={tokens.base} strokeWidth={4 * unit} testID="stage4-route-origin" />
      <Path
        d={PIN_PATH}
        fill={tokens.primary}
        stroke={tokens.base}
        strokeLinejoin="round"
        strokeWidth={1.2 * unit}
        testID="stage4-route-destination"
        transform={`translate(${end.x - 12 * PIN_SCALE * unit} ${end.y - 21 * PIN_SCALE * unit}) scale(${PIN_SCALE * unit})`}
      />
      <Circle cx={end.x} cy={end.y - 11.5 * PIN_SCALE * unit} fill={tokens.base} r={3.4 * unit} />
    </FillSvg>
  )
}
