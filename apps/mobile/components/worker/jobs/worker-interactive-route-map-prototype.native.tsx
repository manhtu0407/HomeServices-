import { useCallback, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Constants from 'expo-constants'
import type { LocalDeal } from '@nestscout/shared'
import { Camera, LineLayer, MapView, MarkerView, ShapeSource, type CameraRef } from '@vietmap/vietmap-gl-react-native'
import Svg, { Circle, Line } from 'react-native-svg'

import { color, typography } from '@/design/theme'
import { type AppLanguage } from '@/lib/app-language'
import type { WorkerRouteGeometry } from '@/lib/route-geometry'

import { textByLanguage } from '../ui/format'
import { workerV5ArrivalDestinationLabel } from '../ui/route'
import { getWorkerThemeTokens, useWorkerThemeMode } from '../worker-theme'
import type { WorkerV5RoutePreviewState } from './use-worker-route-preview'

type Coordinate = {
  latitude: number
  longitude: number
}

type RouteValue = NonNullable<WorkerV5RoutePreviewState['route']>
type ReadyRoute = Omit<RouteValue, 'destination' | 'geometry'> & {
  destination: NonNullable<RouteValue['destination']>
  geometry: WorkerRouteGeometry
}

type WorkerInteractiveRouteMapPrototypeProps = {
  allowWebFixture?: boolean
  deal: LocalDeal | null
  language: AppLanguage
  reduceMotion: boolean
  reduceTransparency: boolean
  routePreview: WorkerV5RoutePreviewState
}

type RouteFeature = {
  type: 'Feature'
  properties: Record<string, never>
  geometry: WorkerRouteGeometry
}

type MapExtra = {
  mapProxyBaseUrl?: unknown
  vietmapDisplayKey?: unknown
  vietmapMapStyleUrl?: unknown
}

type NativeRouteStatus = 'loading' | 'ready' | 'error'

const ROUTE_SOURCE_ID = 'worker-route-source'
const ROUTE_CASING_ID = 'worker-route-casing'
const ROUTE_LINE_ID = 'worker-route-line'

export function WorkerInteractiveRouteMapPrototype({
  deal,
  language,
  reduceMotion,
  reduceTransparency,
  routePreview,
}: WorkerInteractiveRouteMapPrototypeProps) {
  const destinationLabel = workerV5ArrivalDestinationLabel(deal, language)
  const route = routePreview.route
  const readyRoute: ReadyRoute | null = route?.geometry && route.destination
    ? { ...route, destination: route.destination, geometry: route.geometry }
    : null

  if (!routePreview.hasRouteDestination) {
    return (
      <WorkerInteractiveRouteMapEmpty
        language={language}
        reduceTransparency={reduceTransparency}
        title={textByLanguage(language, 'Địa chỉ chưa được mở cho lộ trình', 'The route address is not available yet')}
        meta={textByLanguage(language, 'Bản đồ chỉ hiện khi backend đã mở điểm đến tòa nhà cho thợ.', 'The map appears after the backend releases the building destination to the worker.')}
      />
    )
  }

  if (routePreview.locationStatus !== 'ready' || !routePreview.origin) {
    const title = routePreview.locationStatus === 'denied'
      ? textByLanguage(language, 'Cần bật vị trí để mở bản đồ', 'Enable location to open the map')
      : routePreview.locationStatus === 'unavailable'
        ? textByLanguage(language, 'Chưa thể lấy vị trí hiện tại', 'Current location is unavailable')
        : textByLanguage(language, 'Đang lấy vị trí của bạn', 'Getting your current location')
    const meta = routePreview.locationStatus === 'denied'
      ? textByLanguage(language, 'Bật quyền vị trí để tính tuyến đường tới tòa nhà.', 'Enable location to calculate the route to the building.')
      : textByLanguage(language, 'Tuyến đường chỉ dùng tọa độ tòa nhà; số căn và tầng vẫn được bảo vệ.', 'The route uses the building location only; unit and floor remain protected.')

    return <WorkerInteractiveRouteMapEmpty language={language} reduceTransparency={reduceTransparency} title={title} meta={meta} />
  }

  if (!readyRoute) {
    return (
      <WorkerInteractiveRouteMapEmpty
        language={language}
        reduceTransparency={reduceTransparency}
        testID="worker-v5-route-geometry-unavailable"
        title={textByLanguage(language, 'Chưa có hình học tuyến đường', 'Route geometry is unavailable')}
        meta={textByLanguage(language, 'Bản đồ chỉ hiện khi VietMap trả về tuyến đường hợp lệ.', 'The map appears when VietMap returns a valid route.')}
      />
    )
  }

  return (
    <WorkerInteractiveRouteMapNativeBody
      destinationLabel={destinationLabel}
      language={language}
      origin={routePreview.origin}
      reduceMotion={reduceMotion}
      reduceTransparency={reduceTransparency}
      route={readyRoute}
    />
  )
}

function WorkerInteractiveRouteMapNativeBody({
  destinationLabel,
  language,
  origin,
  reduceMotion,
  reduceTransparency,
  route,
}: {
  destinationLabel: string
  language: AppLanguage
  origin: Coordinate
  reduceMotion: boolean
  reduceTransparency: boolean
  route: ReadyRoute
}) {
  const workerThemeMode = useWorkerThemeMode()
  const theme = getWorkerThemeTokens(workerThemeMode)
  const cameraRef = useRef<CameraRef | null>(null)
  const [status, setStatus] = useState<NativeRouteStatus>('loading')
  const [bearing, setBearing] = useState(0)
  const [zoomLevel, setZoomLevel] = useState(13)
  const [selectedMarker, setSelectedMarker] = useState<'origin' | 'destination' | null>(null)
  const [mapVersion, setMapVersion] = useState(0)
  const styleUrl = useMemo(() => resolveNativeMapStyleUrl(), [])
  const routeFeature = useMemo<RouteFeature>(() => ({
    type: 'Feature',
    properties: {},
    geometry: route.geometry,
  }), [route.geometry])

  const fitRoute = useCallback(() => {
    const bounds = getRouteBounds(route.geometry)
    cameraRef.current?.fitBounds(
      [bounds.maxLongitude, bounds.maxLatitude],
      [bounds.minLongitude, bounds.minLatitude],
      [92, 24, 84, 24],
      reduceMotion ? 0 : 320,
    )
  }, [reduceMotion, route.geometry])

  const recenter = useCallback(() => {
    cameraRef.current?.setCamera({
      animationDuration: reduceMotion ? 0 : 280,
      animationMode: reduceMotion ? 'moveTo' : 'easeTo',
      centerCoordinate: [origin.longitude, origin.latitude],
      heading: 0,
      zoomLevel: 14,
    })
  }, [origin.latitude, origin.longitude, reduceMotion])

  const resetBearing = useCallback(() => {
    cameraRef.current?.setCamera({
      animationDuration: reduceMotion ? 0 : 220,
      animationMode: reduceMotion ? 'moveTo' : 'easeTo',
      heading: 0,
    })
  }, [reduceMotion])

  const zoom = useCallback((delta: number) => {
    const nextZoom = Math.min(18, Math.max(3, zoomLevel + delta))
    setZoomLevel(nextZoom)
    cameraRef.current?.zoomTo(nextZoom, reduceMotion ? 0 : 180)
  }, [reduceMotion, zoomLevel])

  const onRegionDidChange = useCallback((feature: GeoJSON.Feature) => {
    const properties = feature.properties as { heading?: unknown; zoomLevel?: unknown } | null
    if (typeof properties?.heading === 'number') setBearing(properties.heading)
    if (typeof properties?.zoomLevel === 'number') setZoomLevel(properties.zoomLevel)
  }, [])

  const controlSurface = reduceTransparency ? styles.controlOpaque : styles.controlGlass
  const statusCopy = status === 'loading'
    ? textByLanguage(language, 'Đang tải bản đồ', 'Loading map')
    : status === 'error'
      ? textByLanguage(language, 'Không thể tải bản đồ', 'Map unavailable')
      : textByLanguage(language, 'VietMap', 'VietMap')

  if (!styleUrl) {
    return (
      <WorkerInteractiveRouteMapEmpty
        language={language}
        reduceTransparency={reduceTransparency}
        testID="worker-v5-route-map-native-config-missing"
        title={textByLanguage(language, 'Chưa cấu hình bản đồ VietMap', 'VietMap map is not configured')}
        meta={textByLanguage(language, 'Bản dựng native cần map style URL hoặc display key đã giới hạn cho ứng dụng.', 'The native build needs an app-restricted map style URL or display key.')}
      />
    )
  }

  return (
    <View style={[styles.panel, { backgroundColor: theme.base, borderColor: theme.borderStrong }]} testID="worker-v5-route-map-panel">
      <MapView
        key={mapVersion}
        attributionEnabled
        compassEnabled={false}
        logoEnabled
        mapStyle={styleUrl}
        onDidFailLoadingMap={() => setStatus('error')}
        onDidFinishLoadingMap={() => {
          setStatus('ready')
          requestAnimationFrame(fitRoute)
        }}
        onRegionDidChange={onRegionDidChange}
        rotateEnabled
        scrollEnabled
        style={StyleSheet.absoluteFill}
        testID="worker-v5-route-map-native"
        zoomEnabled
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: [origin.longitude, origin.latitude],
            zoomLevel: 13,
          }}
          maxZoomLevel={18}
          minZoomLevel={3}
        />
        <ShapeSource id={ROUTE_SOURCE_ID} lineMetrics shape={routeFeature}>
          <LineLayer
            id={ROUTE_CASING_ID}
            style={{
              lineCap: 'round',
              lineColor: '#FFFFFF',
              lineJoin: 'round',
              lineOpacity: 0.92,
              lineWidth: 8,
            }}
          />
          <LineLayer
            id={ROUTE_LINE_ID}
            style={{
              lineCap: 'round',
              lineColor: color.brand.primary,
              lineJoin: 'round',
              lineOpacity: 0.98,
              lineWidth: 4,
            }}
          />
        </ShapeSource>
        <MarkerView coordinate={[origin.longitude, origin.latitude]} allowOverlap>
          <Pressable
            accessibilityLabel={textByLanguage(language, 'Vị trí của bạn', 'Your location')}
            accessibilityRole="button"
            onPress={() => setSelectedMarker('origin')}
            style={[styles.marker, { backgroundColor: color.brand.primary }]}
          >
            <View style={styles.markerCore} />
          </Pressable>
        </MarkerView>
        <MarkerView coordinate={[route.destination.longitude, route.destination.latitude]} allowOverlap>
          <Pressable
            accessibilityLabel={textByLanguage(language, 'Điểm đến công việc', 'Job destination')}
            accessibilityRole="button"
            onPress={() => setSelectedMarker('destination')}
            style={[styles.marker, { backgroundColor: color.brand.primaryDark }]}
          >
            <View style={styles.markerBuilding} />
          </Pressable>
        </MarkerView>
      </MapView>

      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <View pointerEvents="box-none" style={styles.topRow}>
          <View style={[styles.statusPill, controlSurface, { backgroundColor: reduceTransparency ? theme.base : theme.glass, borderColor: theme.glassBorder }]} accessibilityRole="text">
            <Text style={[styles.statusText, { color: theme.text }]}>{statusCopy}</Text>
          </View>
          <Pressable
            accessibilityLabel={textByLanguage(language, 'Về vị trí của tôi', 'Recenter on my location')}
            accessibilityRole="button"
            onPress={recenter}
            style={({ pressed }) => [styles.iconButton, controlSurface, { backgroundColor: reduceTransparency ? theme.base : theme.glass, borderColor: theme.glassBorder }, pressed && pressStyle(reduceMotion)]}
            testID="worker-v5-route-map-recenter"
          >
            <WorkerMapLocationIcon color={theme.text} />
          </Pressable>
        </View>

        <View style={styles.rightControls}>
          {Math.abs(bearing) > 2 ? (
            <Pressable
              accessibilityLabel={textByLanguage(language, 'Đưa bản đồ về hướng Bắc', 'Reset map to north')}
              accessibilityRole="button"
              onPress={resetBearing}
              style={({ pressed }) => [styles.iconButton, controlSurface, { backgroundColor: reduceTransparency ? theme.base : theme.glass, borderColor: theme.glassBorder }, pressed && pressStyle(reduceMotion)]}
              testID="worker-v5-route-map-compass"
            >
              <Text style={[styles.compassGlyph, { color: theme.text, transform: [{ rotate: `${-bearing}deg` }] }]}>▲</Text>
            </Pressable>
          ) : null}
          <View style={[styles.zoomGroup, controlSurface, { backgroundColor: reduceTransparency ? theme.base : theme.glass, borderColor: theme.glassBorder }]}>
            <Pressable
              accessibilityLabel={textByLanguage(language, 'Phóng to bản đồ', 'Zoom in')}
              accessibilityRole="button"
              onPress={() => zoom(1)}
              style={({ pressed }) => [styles.zoomButton, pressed && pressStyle(reduceMotion)]}
              testID="worker-v5-route-map-zoom-in"
            >
              <Text style={[styles.zoomGlyph, { color: theme.text }]}>+</Text>
            </Pressable>
            <View style={[styles.zoomDivider, { backgroundColor: theme.glassBorder }]} />
            <Pressable
              accessibilityLabel={textByLanguage(language, 'Thu nhỏ bản đồ', 'Zoom out')}
              accessibilityRole="button"
              onPress={() => zoom(-1)}
              style={({ pressed }) => [styles.zoomButton, pressed && pressStyle(reduceMotion)]}
              testID="worker-v5-route-map-zoom-out"
            >
              <Text style={[styles.zoomGlyph, { color: theme.text }]}>−</Text>
            </Pressable>
          </View>
        </View>

        <View pointerEvents="box-none" style={styles.bottomControls}>
          {selectedMarker ? (
            <Pressable
              accessibilityLabel={selectedMarker === 'origin' ? textByLanguage(language, 'Vị trí của bạn', 'Your location') : textByLanguage(language, 'Điểm đến công việc', 'Job destination')}
              accessibilityRole="button"
              onPress={() => setSelectedMarker(null)}
              style={[styles.markerLabel, controlSurface, { backgroundColor: reduceTransparency ? theme.base : theme.glass, borderColor: theme.glassBorder }]}
            >
              <Text style={[styles.markerLabelText, { color: theme.text }]}>{selectedMarker === 'origin' ? textByLanguage(language, 'Vị trí của bạn', 'Your location') : textByLanguage(language, 'Điểm đến công việc', 'Job destination')}</Text>
            </Pressable>
          ) : null}
          <View style={[styles.routeCard, { backgroundColor: reduceTransparency ? theme.base : theme.glass, borderColor: theme.glassBorder }]}>
            <View style={styles.routeCardCopy}>
              <Text style={[styles.routeCardEyebrow, { color: theme.muted }]}>{textByLanguage(language, 'Tuyến đường tới', 'Route to')}</Text>
              <Text numberOfLines={1} style={[styles.routeCardTitle, { color: theme.text }]}>{destinationLabel}</Text>
              <Text style={[styles.routeCardMeta, { color: theme.muted }]}>{formatRouteMeta(route.distanceMeters, route.durationSeconds, language)}</Text>
            </View>
            <Pressable
              accessibilityLabel={textByLanguage(language, 'Xem toàn tuyến', 'Show full route')}
              accessibilityRole="button"
              onPress={fitRoute}
              style={({ pressed }) => [styles.fitButton, { backgroundColor: theme.primary }, pressed && pressStyle(reduceMotion)]}
              testID="worker-v5-route-map-fit"
            >
              <Text style={[styles.fitButtonText, { color: theme.primaryText }]}>{textByLanguage(language, 'Toàn tuyến', 'Full route')}</Text>
            </Pressable>
          </View>
          {status === 'error' ? (
            <Pressable
              accessibilityLabel={textByLanguage(language, 'Thử lại bản đồ', 'Retry map')}
              accessibilityRole="button"
              onPress={() => {
                setStatus('loading')
                setMapVersion((version) => version + 1)
              }}
              style={({ pressed }) => [styles.retryButton, controlSurface, { backgroundColor: reduceTransparency ? theme.base : theme.glass, borderColor: theme.glassBorder }, pressed && pressStyle(reduceMotion)]}
              testID="worker-v5-route-map-retry"
            >
              <Text style={[styles.retryButtonText, { color: theme.text }]}>{textByLanguage(language, 'Thử lại', 'Retry')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  )
}

function WorkerInteractiveRouteMapEmpty({
  language,
  meta,
  reduceTransparency,
  testID = 'worker-v5-route-vietmap-empty-state',
  title,
}: {
  language: AppLanguage
  meta: string
  reduceTransparency: boolean
  testID?: string
  title: string
}) {
  const workerThemeMode = useWorkerThemeMode()
  const theme = getWorkerThemeTokens(workerThemeMode)
  return (
    <View style={[styles.panel, { backgroundColor: reduceTransparency ? theme.base : theme.raised, borderColor: theme.borderStrong }]} testID="worker-v5-route-map-panel">
      <View style={styles.emptyContent} testID={testID}>
        <Text style={[styles.emptyTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.emptyMeta, { color: theme.muted }]}>{meta}</Text>
      </View>
    </View>
  )
}

function resolveNativeMapStyleUrl() {
  const extra = (Constants.expoConfig?.extra ?? {}) as MapExtra
  const explicitStyleUrl = stringValue(extra.vietmapMapStyleUrl)
  if (explicitStyleUrl) return explicitStyleUrl

  const proxyBaseUrl = stringValue(extra.mapProxyBaseUrl)?.replace(/\/+$/, '')
  if (proxyBaseUrl) return `${proxyBaseUrl}/style?style=tm`

  const displayKey = stringValue(extra.vietmapDisplayKey)
  return displayKey
    ? `https://maps.vietmap.vn/mt/tm/style.json?apikey=${encodeURIComponent(displayKey)}`
    : null
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function getRouteBounds(geometry: WorkerRouteGeometry) {
  const longitudes = geometry.coordinates.map(([longitude]) => longitude)
  const latitudes = geometry.coordinates.map(([, latitude]) => latitude)
  return {
    maxLatitude: Math.max(...latitudes),
    maxLongitude: Math.max(...longitudes),
    minLatitude: Math.min(...latitudes),
    minLongitude: Math.min(...longitudes),
  }
}

function formatRouteMeta(distanceMeters: number, durationSeconds: number, language: AppLanguage) {
  const distance = distanceMeters >= 1000
    ? `${(distanceMeters / 1000).toFixed(1).replace('.', ',')} km`
    : `${Math.round(distanceMeters)} m`
  const minutes = Math.max(1, Math.round(durationSeconds / 60))
  return textByLanguage(language, `${distance} · khoảng ${minutes} phút`, `${distance} · about ${minutes} min`)
}

function pressStyle(reduceMotion: boolean) {
  return reduceMotion ? { opacity: 0.78 } : { opacity: 0.82, transform: [{ scale: 0.97 }] }
}

function WorkerMapLocationIcon({ color: iconColor }: { color: string }) {
  return (
    <Svg height={22} viewBox="0 0 24 24" width={22}>
      <Circle cx="12" cy="12" fill="none" r="5.5" stroke={iconColor} strokeWidth="1.8" />
      <Circle cx="12" cy="12" fill={iconColor} r="1.8" />
      <Line stroke={iconColor} strokeLinecap="round" strokeWidth="1.8" x1="12" x2="12" y1="1.9" y2="5" />
      <Line stroke={iconColor} strokeLinecap="round" strokeWidth="1.8" x1="12" x2="12" y1="19" y2="22.1" />
      <Line stroke={iconColor} strokeLinecap="round" strokeWidth="1.8" x1="1.9" x2="5" y1="12" y2="12" />
      <Line stroke={iconColor} strokeLinecap="round" strokeWidth="1.8" x1="19" x2="22.1" y1="12" y2="12" />
    </Svg>
  )
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: 28,
    borderWidth: 1,
    minHeight: 330,
    overflow: 'hidden',
    position: 'relative',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  statusPill: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 44,
    paddingHorizontal: 15,
  },
  statusText: {
    ...typography.footnote,
    fontWeight: '600',
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  rightControls: {
    alignItems: 'flex-end',
    gap: 10,
    position: 'absolute',
    right: 14,
    top: 66,
  },
  compassGlyph: {
    fontSize: 19,
    lineHeight: 23,
  },
  zoomGroup: {
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
  zoomButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  zoomGlyph: {
    fontSize: 28,
    fontWeight: '400',
    lineHeight: 30,
  },
  zoomDivider: {
    height: 1,
    marginHorizontal: 9,
  },
  bottomControls: {
    bottom: 14,
    gap: 8,
    left: 14,
    position: 'absolute',
    right: 14,
  },
  marker: {
    alignItems: 'center',
    borderColor: '#FFFFFF',
    borderRadius: 999,
    borderWidth: 3,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  markerCore: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    height: 7,
    width: 7,
  },
  markerBuilding: {
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
    height: 9,
    width: 9,
  },
  markerLabel: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  markerLabelText: {
    ...typography.caption1,
    fontWeight: '700',
  },
  routeCard: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 78,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  routeCardCopy: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  routeCardEyebrow: {
    ...typography.caption2,
    fontWeight: '700',
  },
  routeCardTitle: {
    ...typography.footnote,
    fontWeight: '700',
  },
  routeCardMeta: {
    ...typography.caption1,
    fontWeight: '500',
  },
  fitButton: {
    alignItems: 'center',
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 12,
  },
  fitButtonText: {
    ...typography.caption1,
    fontWeight: '700',
  },
  retryButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  retryButtonText: {
    ...typography.caption1,
    fontWeight: '700',
  },
  controlGlass: {
    backgroundColor: 'rgba(255,255,255,0.82)',
  },
  controlOpaque: {
    backgroundColor: color.surface.base,
  },
  emptyContent: {
    alignItems: 'center',
    flex: 1,
    gap: 10,
    justifyContent: 'center',
    minHeight: 248,
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  emptyTitle: {
    ...typography.title3,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyMeta: {
    ...typography.footnote,
    fontWeight: '500',
    textAlign: 'center',
  },
})
