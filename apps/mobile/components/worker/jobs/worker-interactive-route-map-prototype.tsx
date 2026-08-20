import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Line } from 'react-native-svg'
import type { LocalDeal } from '@nestscout/shared'

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

type RouteFixture = {
  destination: Coordinate
  geometry: WorkerRouteGeometry
  origin: Coordinate
}

type RouteFeature = {
  type: 'Feature'
  properties: Record<string, never>
  geometry: WorkerRouteGeometry
}

type MapLibreStyleSpecification = {
  version: 8
  sources: Record<string, unknown>
  layers: unknown[]
}

type MapLibreGeoJsonSource = {
  type: 'geojson'
  setData: (data: RouteFeature) => void
}

type MapLibreMap = {
  addLayer: (layer: Record<string, unknown>) => void
  addSource: (id: string, source: Record<string, unknown>) => void
  easeTo: (options: { bearing?: number; duration: number; zoom?: number }) => void
  fitBounds: (bounds: [number, number, number, number], options: { duration: number; maxZoom: number; padding: { bottom: number; left: number; right: number; top: number } }) => void
  flyTo: (options: { bearing: number; center: [number, number]; duration: number; zoom: number }) => void
  getBearing: () => number
  getLayer: (id: string) => unknown
  getSource: (id: string) => MapLibreGeoJsonSource | undefined
  getZoom: () => number
  isStyleLoaded: () => boolean
  on: (event: string, handler: () => void) => void
  remove: () => void
  setStyle: (style: MapLibreStyleSpecification) => void
}

type MapLibreMarker = {
  remove: () => void
}

type MapLibreRuntime = {
  Map: new (options: {
    attributionControl: boolean
    center: [number, number]
    container: HTMLDivElement
    cooperativeGestures: boolean
    style: MapLibreStyleSpecification | string
    zoom: number
  }) => MapLibreMap
  Marker: new (options: { element: HTMLButtonElement }) => {
    addTo: (map: MapLibreMap) => MapLibreMarker
    setLngLat: (coordinate: [number, number]) => { addTo: (map: MapLibreMap) => MapLibreMarker }
  }
}

type RouteMapStatus = 'loading' | 'ready' | 'fixture' | 'error'

type WorkerInteractiveRouteMapPrototypeProps = {
  allowWebFixture?: boolean
  deal: LocalDeal | null
  language: AppLanguage
  reduceMotion: boolean
  reduceTransparency: boolean
  routePreview: WorkerV5RoutePreviewState
}

const MAP_PROXY_BASE_URL = typeof process !== 'undefined'
  ? process.env.EXPO_PUBLIC_MAP_PROXY_BASE_URL?.replace(/\/+$/, '') ?? null
  : null

const HCMC_PREVIEW_ORIGIN: Coordinate = { latitude: 10.7769, longitude: 106.7009 }
const ROUTE_SOURCE_ID = 'worker-prototype-route'
const ROUTE_CASING_ID = 'worker-prototype-route-casing'
const ROUTE_LINE_ID = 'worker-prototype-route-line'

const FIXTURE_STYLE: MapLibreStyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: 'worker-prototype-background',
      type: 'background',
      paint: { 'background-color': '#EEF8F5' },
    },
  ],
}

const MAPLIBRE_SCRIPT_URL = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js'
const MAPLIBRE_STYLE_URL = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css'
let mapLibreWebPromise: Promise<MapLibreRuntime> | null = null

declare global {
  interface Window {
    maplibregl?: MapLibreRuntime
  }
}

function loadMapLibreWeb() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Web map renderer is unavailable'))
  }
  if (window.maplibregl) return Promise.resolve(window.maplibregl)
  if (mapLibreWebPromise) return mapLibreWebPromise

  const styleLink = document.querySelector<HTMLLinkElement>('link[data-nestscout-maplibre-style]')
  if (!styleLink) {
    const nextStyleLink = document.createElement('link')
    nextStyleLink.rel = 'stylesheet'
    nextStyleLink.href = MAPLIBRE_STYLE_URL
    nextStyleLink.dataset.nestscoutMaplibreStyle = 'true'
    document.head.appendChild(nextStyleLink)
  }

  mapLibreWebPromise = new Promise<MapLibreRuntime>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[data-nestscout-maplibre-script]')
    const script = existingScript ?? document.createElement('script')
    const onLoad = () => {
      if (window.maplibregl) resolve(window.maplibregl)
      else reject(new Error('Map renderer did not expose its runtime'))
    }
    const onError = () => reject(new Error('Map renderer script failed to load'))
    script.addEventListener('load', onLoad, { once: true })
    script.addEventListener('error', onError, { once: true })
    if (!existingScript) {
      script.async = true
      script.src = MAPLIBRE_SCRIPT_URL
      script.dataset.nestscoutMaplibreScript = 'true'
      document.head.appendChild(script)
    }
  }).catch((error: unknown) => {
    mapLibreWebPromise = null
    throw error
  })

  return mapLibreWebPromise
}

export function WorkerInteractiveRouteMapPrototype({
  allowWebFixture = false,
  deal,
  language,
  reduceMotion,
  reduceTransparency,
  routePreview,
}: WorkerInteractiveRouteMapPrototypeProps) {
  const destinationLabel = workerV5ArrivalDestinationLabel(deal, language)
  const useWebFixture = Platform.OS === 'web' && allowWebFixture && routePreview.hasRouteDestination
  const fixtureOrigin = routePreview.origin ?? (useWebFixture ? HCMC_PREVIEW_ORIGIN : null)
  const fixture = useMemo(() => buildRouteFixture(fixtureOrigin), [fixtureOrigin])
  const liveRoute = routePreview.route?.geometry && routePreview.route.destination && routePreview.origin
    ? {
        destination: routePreview.route.destination,
        geometry: routePreview.route.geometry,
        origin: routePreview.origin,
      }
    : null
  const renderedRoute = liveRoute ?? (useWebFixture ? fixture : null)

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

  if ((routePreview.locationStatus !== 'ready' || !routePreview.origin) && !useWebFixture) {
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

  if (!renderedRoute) {
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

  if (Platform.OS !== 'web') {
    return (
      <WorkerInteractiveRouteMapEmpty
        language={language}
        reduceTransparency={reduceTransparency}
        testID="worker-v5-route-native-p1-state"
        title={textByLanguage(language, 'Bản đồ tương tác native đang chuẩn bị', 'Native interactive map is being prepared')}
        meta={textByLanguage(language, 'Tuyến đường thật đã được nhận; renderer native sẽ được bật sau khi EAS xác nhận SDK.', 'The live route is available; the native renderer will be enabled after EAS validates the SDK.')}
      />
    )
  }

  return (
    <WorkerInteractiveRouteMapWeb
      destinationLabel={destinationLabel}
      fixture={renderedRoute}
      language={language}
      locationStatus={routePreview.locationStatus}
      prototypeFixture={useWebFixture}
      reduceMotion={reduceMotion}
      reduceTransparency={reduceTransparency}
      route={routePreview.route}
    />
  )
}

function WorkerInteractiveRouteMapWeb({
  destinationLabel,
  fixture,
  language,
  locationStatus,
  prototypeFixture,
  reduceMotion,
  reduceTransparency,
  route,
}: {
  destinationLabel: string
  fixture: RouteFixture
  language: AppLanguage
  locationStatus: WorkerV5RoutePreviewState['locationStatus']
  prototypeFixture: boolean
  reduceMotion: boolean
  reduceTransparency: boolean
  route: WorkerV5RoutePreviewState['route']
}) {
  const workerThemeMode = useWorkerThemeMode()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markerRefs = useRef<MapLibreMarker[]>([])
  const styleFallbackUsedRef = useRef(false)
  const [status, setStatus] = useState<RouteMapStatus>('loading')
  const [bearing, setBearing] = useState(0)
  const [selectedMarker, setSelectedMarker] = useState<'origin' | 'destination' | null>(null)

  const styleUrl = MAP_PROXY_BASE_URL ? `${MAP_PROXY_BASE_URL}/style?style=tm` : null
  const theme = getWorkerThemeTokens(workerThemeMode)

  const fitRoute = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const longitudes = fixture.geometry.coordinates.map(([longitude]) => longitude)
    const latitudes = fixture.geometry.coordinates.map(([, latitude]) => latitude)
    const bounds: [number, number, number, number] = [
      Math.min(...longitudes),
      Math.min(...latitudes),
      Math.max(...longitudes),
      Math.max(...latitudes),
    ]
    map.fitBounds(bounds, {
      padding: { top: 92, right: 24, bottom: 84, left: 24 },
      duration: reduceMotion ? 0 : 320,
      maxZoom: 15,
    })
  }, [fixture, reduceMotion])

  const recenter = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    map.flyTo({
      center: [fixture.origin.longitude, fixture.origin.latitude],
      zoom: 14,
      bearing: 0,
      duration: reduceMotion ? 0 : 280,
    })
  }, [fixture.origin.latitude, fixture.origin.longitude, reduceMotion])

  const resetBearing = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    map.easeTo({ bearing: 0, duration: reduceMotion ? 0 : 220 })
  }, [reduceMotion])

  const zoom = useCallback((delta: number) => {
    const map = mapRef.current
    if (!map) return
    map.easeTo({ zoom: map.getZoom() + delta, duration: reduceMotion ? 0 : 180 })
  }, [reduceMotion])

  const syncRouteLayers = useCallback((map: MapLibreMap) => {
    if (!map.isStyleLoaded()) return
    if (!map.getSource(ROUTE_SOURCE_ID)) {
      map.addSource(ROUTE_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: fixture.geometry },
      })
    } else {
      const source = map.getSource(ROUTE_SOURCE_ID)
      if (source?.type === 'geojson') source.setData({ type: 'Feature', properties: {}, geometry: fixture.geometry })
    }
    if (!map.getLayer(ROUTE_CASING_ID)) {
      map.addLayer({
        id: ROUTE_CASING_ID,
        type: 'line',
        source: ROUTE_SOURCE_ID,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#FFFFFF', 'line-opacity': 0.92, 'line-width': 8 },
      })
    }
    if (!map.getLayer(ROUTE_LINE_ID)) {
      map.addLayer({
        id: ROUTE_LINE_ID,
        type: 'line',
        source: ROUTE_SOURCE_ID,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': color.brand.primary, 'line-opacity': 0.98, 'line-width': 4 },
      })
    }
  }, [fixture.geometry])

  const syncMarkers = useCallback((map: MapLibreMap, maplibre: MapLibreRuntime) => {
    markerRefs.current.forEach((marker) => marker.remove())
    const makeMarker = (kind: 'origin' | 'destination', coordinate: Coordinate, label: string) => {
      const element = document.createElement('button')
      element.type = 'button'
      element.setAttribute('aria-label', label)
      element.style.width = '30px'
      element.style.height = '30px'
      element.style.border = '3px solid #FFFFFF'
      element.style.borderRadius = '999px'
      element.style.background = kind === 'origin' ? color.brand.primary : color.brand.primaryDark
      element.style.boxShadow = '0 2px 8px rgba(7, 26, 36, 0.24)'
      element.style.cursor = 'pointer'
      element.addEventListener('click', () => setSelectedMarker(kind))
      const marker = new maplibre.Marker({ element }).setLngLat([coordinate.longitude, coordinate.latitude]).addTo(map)
      element.setAttribute('aria-label', label)
      return marker
    }
    markerRefs.current = [
      makeMarker('origin', fixture.origin, textByLanguage(language, 'Vị trí của bạn', 'Your location')),
      makeMarker('destination', fixture.destination, textByLanguage(language, 'Điểm đến công việc', 'Job destination')),
    ]
  }, [fixture.destination, fixture.origin, language])

  useEffect(() => {
    let cancelled = false
    let map: MapLibreMap | null = null

    void loadMapLibreWeb().then((maplibre) => {
      if (cancelled || !containerRef.current) return
      map = new maplibre.Map({
        container: containerRef.current,
        style: styleUrl ?? FIXTURE_STYLE,
        center: [fixture.origin.longitude, fixture.origin.latitude],
        zoom: 13,
        attributionControl: false,
        cooperativeGestures: false,
      })
      mapRef.current = map

      const updateBearing = () => setBearing(map?.getBearing() ?? 0)
      const onLoad = () => {
        if (!map) return
        syncRouteLayers(map)
        syncMarkers(map, maplibre)
        fitRoute()
        setStatus(styleUrl && !styleFallbackUsedRef.current ? 'ready' : 'fixture')
      }
      const onStyleData = () => {
        if (map) syncRouteLayers(map)
      }
      const onError = () => {
        if (!map || styleFallbackUsedRef.current || !styleUrl) {
          setStatus('error')
          return
        }
        styleFallbackUsedRef.current = true
        map.setStyle(FIXTURE_STYLE)
        setStatus('fixture')
      }

      map.on('load', onLoad)
      map.on('styledata', onStyleData)
      map.on('rotate', updateBearing)
      map.on('error', onError)
    }).catch(() => {
      if (!cancelled) setStatus('error')
    })

    return () => {
      cancelled = true
      markerRefs.current.forEach((marker) => marker.remove())
      markerRefs.current = []
      map?.remove()
      mapRef.current = null
    }
  }, [fitRoute, fixture.origin.latitude, fixture.origin.longitude, styleUrl, syncMarkers, syncRouteLayers])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    syncRouteLayers(map)
    fitRoute()
  }, [fitRoute, fixture.geometry, syncRouteLayers])

  const isGlass = !reduceTransparency
  const controlSurface = isGlass ? styles.controlGlass : styles.controlOpaque
  const statusCopy = prototypeFixture && locationStatus !== 'ready'
    ? textByLanguage(language, 'Bản xem thử · cần bật vị trí', 'Preview · location needed')
    : status === 'loading'
    ? textByLanguage(language, 'Đang tải bản đồ', 'Loading map')
    : status === 'error'
      ? textByLanguage(language, 'Không thể tải bản đồ', 'Map unavailable')
      : status === 'fixture'
        ? textByLanguage(language, 'Bản xem thử', 'Preview')
        : textByLanguage(language, 'VietMap', 'VietMap')

  return (
    <View style={[styles.panel, { backgroundColor: theme.base, borderColor: theme.borderStrong }]} testID="worker-v5-route-map-panel">
      <View
        ref={(node) => { containerRef.current = node as unknown as HTMLDivElement | null }}
        style={styles.mapCanvas}
        testID="worker-v5-route-map-interactive"
      />
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <View style={styles.topRow} pointerEvents="box-none">
          <View style={[styles.statusPill, controlSurface, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]} accessibilityRole="text">
            <Text style={[styles.statusText, { color: theme.text }]}>{statusCopy}</Text>
          </View>
          <Pressable
            accessibilityLabel={textByLanguage(language, 'Về vị trí của tôi', 'Recenter on my location')}
            accessibilityRole="button"
            onPress={recenter}
            style={({ pressed }) => [styles.iconButton, controlSurface, { backgroundColor: theme.glass, borderColor: theme.glassBorder }, pressed && pressStyle(reduceMotion)]}
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
              style={({ pressed }) => [styles.iconButton, controlSurface, { backgroundColor: theme.glass, borderColor: theme.glassBorder }, pressed && pressStyle(reduceMotion)]}
              testID="worker-v5-route-map-compass"
            >
              <Text style={[styles.compassGlyph, { color: theme.text, transform: [{ rotate: `${-bearing}deg` }] }]}>▲</Text>
            </Pressable>
          ) : null}
          <View style={[styles.zoomGroup, controlSurface, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}>
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

        <View style={styles.bottomControls} pointerEvents="box-none">
          {selectedMarker ? (
            <Pressable
              accessibilityLabel={selectedMarker === 'origin' ? textByLanguage(language, 'Vị trí của bạn', 'Your location') : textByLanguage(language, 'Điểm đến công việc', 'Job destination')}
              onPress={() => setSelectedMarker(null)}
              style={[styles.markerLabel, controlSurface, { backgroundColor: theme.glass, borderColor: theme.glassBorder }]}
            >
              <Text style={[styles.markerLabelText, { color: theme.text }]}>{selectedMarker === 'origin' ? textByLanguage(language, 'Vị trí của bạn', 'Your location') : textByLanguage(language, 'Điểm đến công việc', 'Job destination')}</Text>
            </Pressable>
          ) : null}
          <View style={[styles.routeCard, reduceTransparency ? styles.routeCardOpaque : styles.routeCardGlass, { backgroundColor: reduceTransparency ? theme.base : theme.glass, borderColor: theme.glassBorder }]}>
            <View style={styles.routeCardCopy}>
              <Text style={[styles.routeCardEyebrow, { color: theme.muted }]}>{textByLanguage(language, 'Tuyến đường tới', 'Route to')}</Text>
              <Text numberOfLines={1} style={[styles.routeCardTitle, { color: theme.text }]}>{destinationLabel}</Text>
              <Text style={[styles.routeCardMeta, { color: theme.muted }]}>{route ? formatRouteMeta(route.distanceMeters, route.durationSeconds, language) : textByLanguage(language, 'Đang cập nhật tuyến đường', 'Route is updating')}</Text>
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

function buildRouteFixture(origin: Coordinate | null): RouteFixture {
  const start = origin ?? HCMC_PREVIEW_ORIGIN
  const destination = {
    latitude: start.latitude + 0.0072,
    longitude: start.longitude + 0.0084,
  }
  const midpoint = {
    latitude: start.latitude + 0.0026,
    longitude: start.longitude + 0.0021,
  }
  return {
    destination,
    geometry: {
      type: 'LineString',
      coordinates: [
        [start.longitude, start.latitude],
        [midpoint.longitude, midpoint.latitude],
        [start.longitude + 0.0058, start.latitude + 0.0047],
        [destination.longitude, destination.latitude],
      ],
    },
    origin: start,
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
  mapCanvas: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    backgroundColor: '#EEF8F5',
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
  rightControls: {
    alignItems: 'flex-end',
    gap: 10,
    position: 'absolute',
    right: 14,
    top: 66,
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
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
  routeCardGlass: {
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  routeCardOpaque: {
    backgroundColor: color.surface.base,
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
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  fitButtonText: {
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
