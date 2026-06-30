import { localizedWorkerAreaLabel } from './chat-helpers'
import { createWorkerMapProviderModel, openWorkerMapDirections, workerHomeMapReducer } from './map-helpers'
import { styles } from './styles'
import { workerMapSharpInset } from './surface-styles/glass-earnings'
import { workerHomeLiquidControlSurface, workerHomeMapControlButtonKeyline, workerHomeOperationalTileSurface, workerJobsCompactMapSurface, workerJobsMapCrispShell, workerJobsMapTopEdge, workerOperationalTileKeyline } from './surface-styles/home-jobs'
import { workerMapModalSheetSurface, workerMapViewportSurface } from './surface-styles/profile-map'
import { workerHasReducedGlass } from './theme'
import { type WorkerHomeMapState, type WorkerMapMode, type WorkerMapProviderModel, type WorkerMapSurface } from './types'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { GlassModalSheet } from '@/components/ui/glass-modal-sheet'
import { GlassSurface } from '@/components/ui/glass-surface'
import { type GlassMaterial } from '@/components/ui/tokens'
import { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { type DistrictSlug } from '@home-services/shared'
import { useEffect, useReducer } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { LiquidMapGlassOverlay, LiquidMapOptics, LiquidSharpKeyline, LiquidSpecularLayer, WorkerHomeMapMaterialContours, WorkerHomeMaterialDepthPlane, WorkerHomeMaterialSubstrate, getWorkerVisibleDeal, useWorkerUi } from './ui'

export const workerServiceAreaAnchors: { lat: number; lng: number; slug: Exclude<DistrictSlug, 'hcmc_all'> }[] = [
  { slug: 'q1', lat: 10.7757, lng: 106.7004 },
  { slug: 'q3', lat: 10.7844, lng: 106.6841 },
  { slug: 'q7', lat: 10.7355, lng: 106.7218 },
  { slug: 'binh_thanh', lat: 10.8118, lng: 106.7091 },
  { slug: 'thu_duc', lat: 10.8494, lng: 106.7537 },
  { slug: 'tan_binh', lat: 10.8015, lng: 106.6520 },
  { slug: 'go_vap', lat: 10.8387, lng: 106.6653 },
  { slug: 'phu_nhuan', lat: 10.7992, lng: 106.6803 },
]

const workerMapProviderBridgeTestIDs = {
  area: 'worker-map-provider-area-fallback',
  bridge: 'worker-map-vietmap-provider-bridge',
  origin: 'worker-map-provider-worker-origin',
  radius: 'worker-map-provider-service-radius',
  route: 'worker-map-provider-route-ready',
} as const

export const initialWorkerHomeMapState: WorkerHomeMapState = {
  centered: true,
  compassNorth: true,
  expanded: false,
  layerDetailed: true,
  trafficEnabled: false,
  zoom: 1,
}

export function WorkerMapProviderBridge({
  compact = false,
  expanded = false,
  model,
}: {
  compact?: boolean
  expanded?: boolean
  model: WorkerMapProviderModel
}) {
  const surfaceTestID = expanded
    ? 'worker-map-provider-expanded-surface'
    : compact
      ? 'worker-map-provider-compact-surface'
      : 'worker-map-provider-preview-surface'

  return (
    <View pointerEvents="none" style={styles.hiddenMarker} testID={workerMapProviderBridgeTestIDs.bridge}>
      <View style={styles.hiddenMarker} testID={surfaceTestID} />
      <View style={styles.hiddenMarker} testID={model.routeRequestReady ? workerMapProviderBridgeTestIDs.route : workerMapProviderBridgeTestIDs.area} />
      {model.workerOrigin ? <View style={styles.hiddenMarker} testID={workerMapProviderBridgeTestIDs.origin} /> : null}
      {model.serviceRadius !== null ? <View style={styles.hiddenMarker} testID={workerMapProviderBridgeTestIDs.radius} /> : null}
    </View>
  )
}

export function WorkerMapPulseDot({ testID, tone }: { testID: string; tone: 'area' | 'route' | 'worker' }) {
  const { tokens } = useWorkerUi()
  const { reduceMotion } = useGlassAccessibility()
  const pulse = useSharedValue(0)
  const color = tone === 'worker' ? tokens.primary : tone === 'route' ? tokens.primary : tokens.aqua

  useEffect(() => {
    cancelAnimation(pulse)
    if (reduceMotion) {
      pulse.value = 0
      return undefined
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 920 }),
        withTiming(0, { duration: 920 }),
      ),
      -1,
      false,
    )
    return () => cancelAnimation(pulse)
  }, [pulse, reduceMotion])

  const haloStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0 : 0.16 + pulse.value * 0.3,
    transform: [{ scale: 0.9 + pulse.value * 0.74 }],
  }))

  return (
    <View pointerEvents="none" style={styles.workerMapPulseMarker} testID={testID}>
      {!reduceMotion ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.workerMapPulseHalo, { backgroundColor: color }, haloStyle]}
          testID={`${testID}-halo`}
        />
      ) : null}
      <View
        pointerEvents="none"
        style={[styles.workerMapPulseCore, { backgroundColor: color, borderColor: tokens.raised }]}
        testID={`${testID}-core`}
      />
    </View>
  )
}

export function CompactWorkerPresenceMap({ density = 'regular', mode }: { density?: 'dense' | 'regular'; mode: Exclude<WorkerMapSurface, 'home'> }) {
  const { language, tokens } = useWorkerUi()
  const { selectors, state, workerProfile } = useFrontendWorkflow()
  const [mapState, dispatchMap] = useReducer(workerHomeMapReducer, initialWorkerHomeMapState)
  const { centered: mapCentered, expanded, trafficEnabled } = mapState
  const reduceGlass = workerHasReducedGlass(tokens)
  const useLiquidMaterial = mode !== 'jobroom'
  const deal = getWorkerVisibleDeal(state.deal)
  const broadcast = deal?.broadcast ?? null
  const hasBroadcast = Boolean(broadcast)
  const area = broadcast?.generalArea ?? deal?.draft.districtLabel
  const workerRadiusKm = workerProfile?.service_radius_km
  const hasWorkerRadius = typeof workerRadiusKm === 'number' && Number.isFinite(workerRadiusKm)
  const hasReleasedAddress = Boolean(
    mode !== 'waiting' &&
      selectors.canWorkerSeeFullAddress &&
      broadcast?.fullAddressVisible &&
      broadcast.fullAddressLabel,
  )
  const mapMode: WorkerMapMode = hasReleasedAddress ? 'route' : hasBroadcast ? 'locked' : 'area'
  const fullAddressLabel = hasReleasedAddress && broadcast?.fullAddressLabel ? broadcast.fullAddressLabel : null
  const releasedAddressLabel = fullAddressLabel ? localizedWorkerAreaLabel(fullAddressLabel, language) : null
  const areaLabel = area ? localizedWorkerAreaLabel(area, language) : (language === 'en' ? 'Work area' : 'Khu vực nhận việc')
  const showEmptyWaitingMarker = mode === 'waiting' && !hasBroadcast && !hasReleasedAddress
  const expandedTitle = hasReleasedAddress
    ? (language === 'en' ? 'Route to meeting point' : 'Đường đến điểm hẹn')
    : (language === 'en' ? 'Work area map' : 'Bản đồ khu vực nhận việc')
  const expandedSubtitle = hasReleasedAddress
    ? `${language === 'en' ? 'Address' : 'Địa chỉ'}: ${releasedAddressLabel ?? areaLabel}`
    : language === 'en'
      ? 'Map details appear when verified job data is available.'
      : 'Chi tiết bản đồ chỉ hiện khi có dữ liệu việc đã xác nhận.'
  const mapActionLabel = language === 'en' ? 'Open map detail' : 'Mở bản đồ chi tiết'
  const providerModel = createWorkerMapProviderModel({
    areaLabel,
    fullAddressLabel,
    mapMode,
    serviceRadius: hasWorkerRadius ? workerRadiusKm : null,
    trafficEnabled,
    workerLat: workerProfile?.home_lat,
    workerLng: workerProfile?.home_lng,
  })
  const hasMapContext = Boolean(fullAddressLabel || area || hasBroadcast || providerModel.workerOrigin)

  return (
    <GlassSurface
      material={useLiquidMaterial ? 'liquid' : 'standard'}
      mode={tokens.mode}
      style={[
        styles.compactPresenceMap,
        density === 'dense' ? styles.compactPresenceMapDense : null,
        useLiquidMaterial ? workerJobsCompactMapSurface(tokens) : workerHomeOperationalTileSurface(tokens, 'depth'),
      ]}
      testID={`worker-jobs-${mode}-presence-map`}
      variant={useLiquidMaterial ? 'hero' : 'subtle'}
    >
      <View pointerEvents="none" style={[styles.operationalTileKeyline, workerOperationalTileKeyline(tokens)]} testID="worker-jobs-map-operational-keyline" />
      {useLiquidMaterial ? <LiquidSharpKeyline variant="panel" /> : null}
      {useLiquidMaterial ? <LiquidSpecularLayer variant="panel" /> : null}
      {useLiquidMaterial && !reduceGlass ? (
        <View
          pointerEvents="none"
          style={[
            styles.workerJobsMapCrispShell,
            density === 'dense' ? styles.workerJobsMapCrispShellDense : null,
            workerJobsMapCrispShell(tokens),
          ]}
          testID="worker-jobs-map-crisp-shell"
        />
      ) : null}
      {useLiquidMaterial && !reduceGlass ? <View pointerEvents="none" style={[styles.workerJobsMapTopEdge, workerJobsMapTopEdge(tokens)]} /> : null}
      <Pressable
        accessibilityHint={language === 'en' ? 'Shows a larger map with operational controls.' : 'Mở bản đồ lớn với công cụ vận hành.'}
        accessibilityLabel={mapActionLabel}
        accessibilityRole="button"
        onPress={() => dispatchMap({ type: 'open' })}
        style={({ pressed }) => [
          styles.compactMapViewport,
          density === 'dense' ? styles.compactMapViewportDense : null,
          workerMapViewportSurface(tokens, useLiquidMaterial ? 'liquid' : 'standard'),
          pressed ? styles.pressed : null,
        ]}
        testID={`worker-jobs-${mode}-map-open-expanded`}
      >
        {useLiquidMaterial ? <WorkerHomeMaterialSubstrate surface="map" /> : null}
        {useLiquidMaterial ? <WorkerHomeMaterialDepthPlane surface="map" /> : null}
        {useLiquidMaterial ? <WorkerHomeMapMaterialContours /> : null}
        <MapLineField compact />
        {hasReleasedAddress ? <WorkerMapRouteLine compact trafficEnabled={trafficEnabled} /> : <WorkerMapCoverageLine compact />}
        <WorkerMapProviderBridge compact model={providerModel} />
        {!reduceGlass ? <View pointerEvents="none" style={[styles.mapCyanVeil, styles.compactMapVeil, useLiquidMaterial ? styles.mapCyanVeilLiquid : null, { backgroundColor: tokens.aqua }]} /> : null}
        {useLiquidMaterial ? <LiquidMapOptics /> : null}
        {useLiquidMaterial ? <LiquidMapGlassOverlay /> : null}
        {useLiquidMaterial ? <View pointerEvents="none" style={[styles.mapSharpInset, workerMapSharpInset(tokens)]} testID="worker-jobs-map-liquid-inset" /> : null}
        <View pointerEvents="none" style={styles.compactMapControlMini} testID="worker-map-compact-preview-control">
          <WorkerMapPulseDot tone={hasReleasedAddress ? 'route' : 'area'} testID={`worker-map-${mode}-control-pulse-dot`} />
        </View>
        {hasReleasedAddress || hasBroadcast || showEmptyWaitingMarker ? (
          <View
            style={[
              styles.compactMapMarker,
              styles.compactMapMarkerWorker,
              showEmptyWaitingMarker ? styles.compactMapMarkerEmpty : null,
            ]}
            testID={showEmptyWaitingMarker ? 'worker-map-waiting-area-marker' : undefined}
          >
            <WorkerMapPulseDot tone={hasReleasedAddress ? 'route' : 'worker'} testID={`worker-map-${mode}-worker-pulse-dot`} />
          </View>
        ) : null}
        {hasReleasedAddress || hasBroadcast ? (
          <View
            style={[styles.compactMapMarker, styles.compactMapMarkerZone]}
            testID={hasReleasedAddress ? 'worker-map-route-after-accept' : 'worker-map-address-locked-before-accept'}
          >
            <WorkerMapPulseDot tone={hasReleasedAddress ? 'route' : 'area'} testID={`worker-map-${mode}-zone-pulse-dot`} />
          </View>
        ) : null}
      </Pressable>
      <WorkerExpandedMapModal
        centered={mapCentered}
        fullAddressLabel={fullAddressLabel}
        hasMapContext={hasMapContext}
        hasWorkerAnchor={Boolean(workerProfile?.districts[0] || providerModel.workerOrigin)}
        mapArea={areaLabel}
        mapMode={mapMode}
        onClose={() => dispatchMap({ type: 'close' })}
        onRecenter={() => dispatchMap({ type: 'recenter' })}
        onToggleTraffic={() => dispatchMap({ type: 'toggle_traffic' })}
        providerModel={providerModel}
        subtitle={expandedSubtitle}
        title={expandedTitle}
        trafficEnabled={trafficEnabled}
        visible={expanded}
      />
    </GlassSurface>
  )
}

export function MapLineField({ compact = false, detailed = false, expanded = false }: { compact?: boolean; detailed?: boolean; expanded?: boolean }) {
  const { tokens } = useWorkerUi()
  const opacityScale = detailed ? (expanded ? 1.42 : compact ? 1.1 : 1.24) : expanded ? 1.34 : compact ? 1.08 : 1.24
  const waterColor = tokens.mode === 'dark' ? tokens.cyan : 'rgba(202,239,249,0.68)'
  const parkColor = tokens.mode === 'dark' ? tokens.mint : 'rgba(151,230,206,0.36)'
  const roadCasing = tokens.mode === 'dark' ? 'rgba(190,210,205,0.16)' : 'rgba(255,255,255,0.96)'
  const majorRoadCasing = tokens.mode === 'dark' ? 'rgba(190,210,205,0.20)' : 'rgba(255,255,255,0.98)'
  const roadInk = tokens.mode === 'dark' ? 'rgba(127,190,179,0.34)' : 'rgba(31,103,93,0.28)'
  const majorRoadInk = tokens.mode === 'dark' ? 'rgba(105,222,198,0.35)' : 'rgba(17,120,108,0.34)'

  if (expanded) {
    return (
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 520 620" preserveAspectRatio="none">
        <Path d="M382 -40 C460 66 520 156 528 286 L528 660 L424 660 C456 472 444 178 382 -40Z" fill={waterColor} opacity={0.58} />
        <Path d="M86 190 C150 116 252 154 250 242 C248 334 128 350 70 288 C28 242 40 210 86 190Z" fill={parkColor} opacity={0.74} />
        <Path d="M276 338 C336 304 420 338 424 404 C428 482 322 494 274 440 C246 410 244 366 276 338Z" fill={parkColor} opacity={0.44} />
        <Rect x={34} y={44} width={92} height={56} rx={18} fill={tokens.mapBlock} opacity={0.44} />
        <Rect x={152} y={52} width={118} height={58} rx={18} fill={tokens.mapBlock} opacity={0.38} />
        <Rect x={318} y={70} width={82} height={52} rx={16} fill={tokens.mapBlock} opacity={0.34} />
        <Rect x={42} y={370} width={124} height={64} rx={18} fill={tokens.mapBlock} opacity={0.36} />
        <Rect x={188} y={488} width={112} height={58} rx={18} fill={tokens.mapBlock} opacity={0.28} />
        <Rect x={332} y={448} width={98} height={60} rx={18} fill={tokens.mapBlock} opacity={0.32} />
        <Path d="M-40 98 C64 142 138 130 220 102 S370 48 560 92" stroke={roadCasing} strokeWidth={8.4} strokeLinecap="round" opacity={0.62 * opacityScale} fill="none" />
        <Path d="M-40 98 C64 142 138 130 220 102 S370 48 560 92" stroke={roadInk} strokeWidth={3.2} strokeLinecap="round" opacity={0.36 * opacityScale} fill="none" />
        <Path d="M10 260 C86 210 180 252 246 216 S388 140 560 186" stroke={roadCasing} strokeWidth={8.2} strokeLinecap="round" opacity={0.58 * opacityScale} fill="none" />
        <Path d="M10 260 C86 210 180 252 246 216 S388 140 560 186" stroke={roadInk} strokeWidth={3} strokeLinecap="round" opacity={0.34 * opacityScale} fill="none" />
        <Path d="M-20 404 C84 350 178 398 274 356 S416 264 560 318" stroke={roadCasing} strokeWidth={8.2} strokeLinecap="round" opacity={0.58 * opacityScale} fill="none" />
        <Path d="M-20 404 C84 350 178 398 274 356 S416 264 560 318" stroke={roadInk} strokeWidth={3} strokeLinecap="round" opacity={0.34 * opacityScale} fill="none" />
        <Path d="M-28 536 C90 490 210 544 296 486 S430 426 560 464" stroke={roadCasing} strokeWidth={8} strokeLinecap="round" opacity={0.5 * opacityScale} fill="none" />
        <Path d="M-28 536 C90 490 210 544 296 486 S430 426 560 464" stroke={roadInk} strokeWidth={2.8} strokeLinecap="round" opacity={0.28 * opacityScale} fill="none" />
        <Path d="M116 -42 C144 104 138 238 112 660 M252 -48 C236 110 238 264 266 660 M390 -40 C360 128 364 292 404 660" stroke={roadCasing} strokeWidth={6.2} strokeLinecap="round" opacity={0.36 * opacityScale} fill="none" />
        <Path d="M116 -42 C144 104 138 238 112 660 M252 -48 C236 110 238 264 266 660 M390 -40 C360 128 364 292 404 660" stroke={roadInk} strokeWidth={2} strokeLinecap="round" opacity={0.26 * opacityScale} fill="none" />
        <Path d="M-34 468 C88 390 186 402 272 324 S398 144 560 176" stroke={majorRoadCasing} strokeWidth={12.4} strokeLinecap="round" opacity={0.78 * opacityScale} fill="none" />
        <Path d="M-34 468 C88 390 186 402 272 324 S398 144 560 176" stroke={majorRoadInk} strokeWidth={4.7} strokeLinecap="round" opacity={0.48 * opacityScale} fill="none" />
        <Path d="M-42 202 C94 258 184 238 280 184 S426 96 560 130" stroke={majorRoadCasing} strokeWidth={11.2} strokeLinecap="round" opacity={0.72 * opacityScale} fill="none" />
        <Path d="M-42 202 C94 258 184 238 280 184 S426 96 560 130" stroke={majorRoadInk} strokeWidth={4.2} strokeLinecap="round" opacity={0.44 * opacityScale} fill="none" />
        {detailed ? (
          <>
            <Rect x={82} y={124} width={86} height={48} rx={16} fill={tokens.mapBlock} opacity={0.26} />
            <Rect x={342} y={238} width={74} height={50} rx={16} fill={tokens.mapBlock} opacity={0.24} />
            <Rect x={40} y={468} width={88} height={50} rx={16} fill={tokens.mapBlock} opacity={0.22} />
            <Rect x={300} y={548} width={82} height={42} rx={14} fill={tokens.mapBlock} opacity={0.2} />
            <Path d="M-28 318 C76 286 158 312 236 278 S382 198 548 234" stroke={roadCasing} strokeWidth={6.4} strokeLinecap="round" opacity={0.46 * opacityScale} fill="none" />
            <Path d="M-28 318 C76 286 158 312 236 278 S382 198 548 234" stroke={roadInk} strokeWidth={2.2} strokeLinecap="round" opacity={0.30 * opacityScale} fill="none" />
            <Path d="M66 -24 C96 132 88 282 48 648 M454 -28 C420 132 426 300 486 650" stroke={roadCasing} strokeWidth={5.2} strokeLinecap="round" opacity={0.3 * opacityScale} fill="none" />
            <Path d="M66 -24 C96 132 88 282 48 648 M454 -28 C420 132 426 300 486 650" stroke={roadInk} strokeWidth={1.7} strokeLinecap="round" opacity={0.24 * opacityScale} fill="none" />
            <Path d="M18 178 C92 212 160 198 226 160 S350 92 514 118" stroke={roadCasing} strokeWidth={5.8} strokeLinecap="round" opacity={0.34 * opacityScale} fill="none" />
            <Path d="M18 178 C92 212 160 198 226 160 S350 92 514 118" stroke={roadInk} strokeWidth={1.9} strokeLinecap="round" opacity={0.24 * opacityScale} fill="none" />
            <Path d="M-18 586 C90 540 184 590 268 534 S420 480 552 506" stroke={roadCasing} strokeWidth={5.6} strokeLinecap="round" opacity={0.3 * opacityScale} fill="none" />
            <Path d="M-18 586 C90 540 184 590 268 534 S420 480 552 506" stroke={roadInk} strokeWidth={1.8} strokeLinecap="round" opacity={0.22 * opacityScale} fill="none" />
            <Circle cx={282} cy={184} r={5} fill={roadInk} opacity={0.34} />
            <Circle cx={274} cy={356} r={4.6} fill={roadInk} opacity={0.32} />
            <Circle cx={296} cy={486} r={4.2} fill={roadInk} opacity={0.28} />
          </>
        ) : null}
      </Svg>
    )
  }

  if (compact) {
    return (
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 390 156" preserveAspectRatio="none">
        <Path d="M292 -20 C350 34 388 82 398 156 L398 176 L308 176 C326 118 326 54 292 -20Z" fill={waterColor} opacity={0.58} />
        <Rect x={30} y={20} width={74} height={34} rx={12} fill={tokens.mapBlock} opacity={0.42} />
        <Rect x={212} y={22} width={82} height={38} rx={13} fill={tokens.mapBlock} opacity={0.34} />
        <Rect x={96} y={108} width={104} height={34} rx={13} fill={tokens.mapBlock} opacity={0.32} />
        <Path d="M-18 44 C54 68 102 64 160 48 S258 20 408 42" stroke={roadCasing} strokeWidth={7.2} strokeLinecap="round" opacity={0.58 * opacityScale} fill="none" />
        <Path d="M-18 44 C54 68 102 64 160 48 S258 20 408 42" stroke={roadInk} strokeWidth={2.8} strokeLinecap="round" opacity={0.34 * opacityScale} fill="none" />
        <Path d="M-10 116 C62 90 128 116 196 92 S292 58 408 82" stroke={roadCasing} strokeWidth={7.4} strokeLinecap="round" opacity={0.55 * opacityScale} fill="none" />
        <Path d="M-10 116 C62 90 128 116 196 92 S292 58 408 82" stroke={roadInk} strokeWidth={2.8} strokeLinecap="round" opacity={0.33 * opacityScale} fill="none" />
        <Path d="M-24 126 C42 96 104 92 162 70 S260 36 404 64" stroke={majorRoadCasing} strokeWidth={10.4} strokeLinecap="round" opacity={0.72 * opacityScale} fill="none" />
        <Path d="M-24 126 C42 96 104 92 162 70 S260 36 404 64" stroke={majorRoadInk} strokeWidth={4} strokeLinecap="round" opacity={0.46 * opacityScale} fill="none" />
      </Svg>
    )
  }

  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 390 216" preserveAspectRatio="none">
      <Path d="M294 -20 C354 44 390 104 394 172 L394 238 L300 238 C328 178 326 86 294 -20Z" fill={waterColor} opacity={0.58} />
      <Path d="M66 78 C104 38 164 66 166 116 C168 166 96 180 60 144 C36 120 42 94 66 78Z" fill={parkColor} opacity={0.74} />
      <Rect x={18} y={24} width={58} height={38} rx={12} fill={tokens.mapBlock} opacity={0.44} />
      <Rect x={92} y={22} width={84} height={46} rx={14} fill={tokens.mapBlock} opacity={0.38} />
      <Rect x={208} y={30} width={68} height={42} rx={13} fill={tokens.mapBlock} opacity={0.34} />
      <Rect x={42} y={152} width={84} height={42} rx={14} fill={tokens.mapBlock} opacity={0.36} />
      <Rect x={226} y={150} width={82} height={38} rx={14} fill={tokens.mapBlock} opacity={0.3} />
      <Path d="M-20 54 C40 80 92 80 150 64 S256 28 410 54" stroke={roadCasing} strokeWidth={7.2} strokeLinecap="round" opacity={0.58 * opacityScale} fill="none" />
      <Path d="M-20 54 C40 80 92 80 150 64 S256 28 410 54" stroke={roadInk} strokeWidth={2.8} strokeLinecap="round" opacity={0.34 * opacityScale} fill="none" />
      <Path d="M8 132 C68 108 126 132 182 112 S278 70 402 110" stroke={roadCasing} strokeWidth={7.4} strokeLinecap="round" opacity={0.55 * opacityScale} fill="none" />
      <Path d="M8 132 C68 108 126 132 182 112 S278 70 402 110" stroke={roadInk} strokeWidth={2.8} strokeLinecap="round" opacity={0.33 * opacityScale} fill="none" />
      <Path d="M-12 188 C72 162 126 192 194 168 S294 128 410 154" stroke={roadCasing} strokeWidth={7.2} strokeLinecap="round" opacity={0.52 * opacityScale} fill="none" />
      <Path d="M-12 188 C72 162 126 192 194 168 S294 128 410 154" stroke={roadInk} strokeWidth={2.7} strokeLinecap="round" opacity={0.31 * opacityScale} fill="none" />
      <Path d="M80 -18 C98 48 100 106 84 234 M196 -18 C188 44 184 110 198 236" stroke={roadCasing} strokeWidth={5.4} strokeLinecap="round" opacity={0.34 * opacityScale} fill="none" />
      <Path d="M80 -18 C98 48 100 106 84 234 M196 -18 C188 44 184 110 198 236" stroke={roadInk} strokeWidth={1.8} strokeLinecap="round" opacity={0.27 * opacityScale} fill="none" />
      <Path d="M-24 162 C42 128 104 126 160 96 S250 42 404 82" stroke={majorRoadCasing} strokeWidth={10.6} strokeLinecap="round" opacity={0.74 * opacityScale} fill="none" />
      <Path d="M-24 162 C42 128 104 126 160 96 S250 42 404 82" stroke={majorRoadInk} strokeWidth={4.1} strokeLinecap="round" opacity={0.46 * opacityScale} fill="none" />
    </Svg>
  )
}

export function WorkerMapRouteLine({ compact = false, expanded = false, trafficEnabled = false }: { compact?: boolean; expanded?: boolean; trafficEnabled?: boolean }) {
  const { tokens } = useWorkerUi()
  const routePath = compact
    ? 'M46 122 C94 94 134 100 178 74 S276 40 348 62'
    : expanded
      ? 'M112 446 C178 378 214 396 286 302 S360 146 440 148'
      : 'M42 164 C98 126 132 130 176 102 S270 52 354 80'
  const routeColor = expanded ? '#1A73E8' : tokens.primary
  const routeTestID = expanded ? 'worker-map-route-line-expanded' : compact ? 'worker-map-route-line-compact' : 'worker-map-route-line-preview'
  const routeViewBox = expanded ? '0 0 520 620' : compact ? '0 0 390 156' : '0 0 390 216'

  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} testID={routeTestID} viewBox={routeViewBox} preserveAspectRatio="none">
      {expanded ? <Path d="M112 446 C156 360 214 350 272 298 S356 156 442 152" stroke={tokens.aqua} strokeWidth={5.2} strokeLinecap="round" strokeDasharray="8 8" opacity={0.44} fill="none" /> : null}
      <Path d={routePath} stroke={tokens.raised} strokeWidth={compact ? 10 : expanded ? 16 : 12} strokeLinecap="round" strokeLinejoin="round" opacity={0.88} fill="none" />
      <Path d={routePath} stroke={routeColor} strokeWidth={compact ? 5.4 : expanded ? 8 : 6.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.94} fill="none" />
      <Path d={routePath} stroke={tokens.aqua} strokeWidth={compact ? 1.9 : expanded ? 2.6 : 2.2} strokeLinecap="round" opacity={0.38} fill="none" />
      {trafficEnabled ? <Path d={expanded ? 'M336 204 C362 170 394 150 440 148' : compact ? 'M270 48 C298 48 324 56 348 62' : 'M270 60 C298 60 324 68 354 80'} stroke={tokens.copper} strokeWidth={expanded ? 5.4 : 4.2} strokeLinecap="round" opacity={0.9} fill="none" /> : null}
    </Svg>
  )
}

export function WorkerMapCoverageLine({ compact = false, expanded = false }: { compact?: boolean; expanded?: boolean }) {
  const { tokens } = useWorkerUi()
  const path = compact
    ? 'M48 124 C94 96 132 98 172 76 S266 42 344 64'
    : expanded
      ? 'M112 446 C178 378 214 396 286 302 S360 146 440 148'
      : 'M46 164 C98 126 132 130 176 102 S270 52 354 80'
  const width = compact ? 2.8 : expanded ? 4.4 : 3.5
  const corridorWidth = compact ? 22 : expanded ? 54 : 38
  const testID = expanded ? 'worker-map-coverage-line-expanded' : compact ? 'worker-map-coverage-line-compact' : 'worker-map-coverage-line-preview'
  const viewBox = expanded ? '0 0 520 620' : compact ? '0 0 390 156' : '0 0 390 216'
  const corridorOpacity = expanded ? 0.18 : compact ? 0.20 : 0.19
  const dashOpacity = expanded ? 0.46 : compact ? 0.40 : 0.38
  const zoneOpacity = 0.16

  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} testID={testID} viewBox={viewBox} preserveAspectRatio="none">
      <Path d={path} stroke={tokens.aqua} strokeWidth={corridorWidth} strokeLinecap="round" strokeLinejoin="round" opacity={corridorOpacity} fill="none" />
      <Path d={path} stroke={tokens.primary} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 11" opacity={dashOpacity} fill="none" />
      <Circle cx={compact ? 132 : expanded ? 212 : 154} cy={compact ? 98 : expanded ? 320 : 124} r={compact ? 38 : expanded ? 96 : 68} fill={tokens.mint} opacity={zoneOpacity} />
    </Svg>
  )
}

type WorkerMapControlGlyphName = 'compass' | 'layers' | 'minus' | 'plus' | 'target' | 'traffic'

const WORKER_MAP_PREVIEW_CONTROLS: readonly WorkerMapControlGlyphName[] = ['target', 'layers']

export function WorkerMapControlStack({
  centered = false,
  compassNorth = true,
  expanded = false,
  layerDetailed = false,
  material = 'standard',
  onToggleCompass,
  onRecenter,
  onToggleLayer,
  onToggleTraffic,
  onZoomIn,
  onZoomOut,
  showTraffic = false,
  trafficEnabled = false,
  zoomInDisabled = false,
  zoomOutDisabled = false,
}: {
  centered?: boolean
  compassNorth?: boolean
  expanded?: boolean
  layerDetailed?: boolean
  material?: GlassMaterial
  onToggleCompass?: () => void
  onRecenter?: () => void
  onToggleLayer?: () => void
  onToggleTraffic?: () => void
  onZoomIn?: () => void
  onZoomOut?: () => void
  showTraffic?: boolean
  trafficEnabled?: boolean
  zoomInDisabled?: boolean
  zoomOutDisabled?: boolean
}) {
  const { language, tokens } = useWorkerUi()
  const controlMaterialStyle = material === 'liquid' ? workerHomeLiquidControlSurface(tokens, 'button') : null
  const expandedControls: { active?: boolean; disabled?: boolean; label: string; name: WorkerMapControlGlyphName; onPress?: () => void }[] = [
    { active: centered, label: language === 'en' ? 'Recenter' : 'Căn lại', name: 'target', onPress: onRecenter },
    { active: compassNorth, label: language === 'en' ? 'Compass' : 'La bàn', name: 'compass', onPress: onToggleCompass },
    ...(showTraffic ? [{ active: trafficEnabled, label: language === 'en' ? 'Traffic' : 'Giao thông', name: 'traffic' as const, onPress: onToggleTraffic }] : []),
    { active: layerDetailed, label: language === 'en' ? 'Layers' : 'Lớp bản đồ', name: 'layers', onPress: onToggleLayer },
    { disabled: zoomInDisabled, label: language === 'en' ? 'Zoom in' : 'Phóng to', name: 'plus', onPress: onZoomIn },
    { disabled: zoomOutDisabled, label: language === 'en' ? 'Zoom out' : 'Thu nhỏ', name: 'minus', onPress: onZoomOut },
  ]

  if (!expanded) {
    return (
      <View pointerEvents="none" style={styles.workerMapControlStack} testID="worker-map-preview-controls">
        {WORKER_MAP_PREVIEW_CONTROLS.map((name) => (
          <View key={name} style={[styles.workerMapControlButton, controlMaterialStyle]}>
            {material === 'liquid' ? <View pointerEvents="none" style={[styles.workerMapControlButtonKeyline, workerHomeMapControlButtonKeyline(tokens)]} /> : null}
            <WorkerMapControlGlyph name={name} />
          </View>
        ))}
        </View>
    )
  }

  return (
    <View style={[styles.workerMapControlStack, styles.workerMapControlStackExpanded]} testID="worker-map-expanded-controls">
      {expandedControls.map((control) => (
        <Pressable
          accessibilityLabel={control.label}
          accessibilityRole="button"
          disabled={control.disabled}
          key={control.name}
          onPress={control.onPress}
          style={({ pressed }) => [
            styles.workerMapControlButton,
            controlMaterialStyle,
            control.active ? styles.workerMapControlButtonActive : null,
            material === 'liquid' && control.active ? workerHomeLiquidControlSurface(tokens, 'activeButton') : null,
            control.disabled ? { opacity: 0.45 } : null,
            pressed ? styles.pressed : null,
          ]}
          testID={`worker-map-control-${control.name}`}
        >
          {material === 'liquid' ? <View pointerEvents="none" style={[styles.workerMapControlButtonKeyline, workerHomeMapControlButtonKeyline(tokens, control.active)]} /> : null}
          <WorkerMapControlGlyph active={control.active} name={control.name} />
        </Pressable>
      ))}
    </View>
  )
}

function WorkerMapControlGlyph({ active = false, name }: { active?: boolean; name: WorkerMapControlGlyphName }) {
  const { tokens } = useWorkerUi()
  const color = active ? tokens.primary : tokens.ink
  const accent = active ? tokens.copper : tokens.muted

  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      {name === 'target' ? (
        <>
          <Circle cx={12} cy={12} r={3.2} stroke={color} strokeWidth={2} />
          <Path d="M12 3.8v3M12 17.2v3M3.8 12h3M17.2 12h3" stroke={accent} strokeWidth={2} strokeLinecap="round" />
        </>
      ) : null}
      {name === 'layers' ? (
        <>
          <Path d="m12 4.4 8 4.1-8 4.1-8-4.1 8-4.1Z" stroke={color} strokeWidth={2} strokeLinejoin="round" />
          <Path d="m4 12.3 8 4.1 8-4.1M4 16.1l8 4.1 8-4.1" stroke={accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : null}
      {name === 'traffic' ? (
        <>
          <Path d="M5 17.5 C9 10.5 14 14.5 19 6.5" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
          <Path d="M6 6.5h3.5M14.5 17.5H18" stroke={accent} strokeWidth={2} strokeLinecap="round" />
        </>
      ) : null}
      {name === 'compass' ? (
        <>
          <Path d="M12 3.8 16.4 12 12 20.2 7.6 12 12 3.8Z" stroke={color} strokeWidth={1.9} strokeLinejoin="round" />
          <Path d="M12 7.2v4.8l3.1 1.6" stroke={accent} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : null}
      {name === 'plus' ? <Path d="M12 5.5v13M5.5 12h13" stroke={color} strokeWidth={2.2} strokeLinecap="round" /> : null}
      {name === 'minus' ? <Path d="M5.5 12h13" stroke={color} strokeWidth={2.2} strokeLinecap="round" /> : null}
    </Svg>
  )
}

export function WorkerMapCloseGlyph() {
  const { tokens } = useWorkerUi()

  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" stroke={tokens.ink} strokeWidth={2.5} strokeLinecap="round" />
    </Svg>
  )
}

function WorkerExpandedMapModal({
  centered,
  fullAddressLabel,
  hasMapContext,
  hasWorkerAnchor,
  mapArea,
  mapMode,
  onClose,
  onRecenter,
  onToggleTraffic,
  providerModel,
  subtitle,
  title,
  trafficEnabled,
  visible,
}: {
  centered: boolean
  fullAddressLabel: string | null
  hasMapContext: boolean
  hasWorkerAnchor: boolean
  mapArea: string
  mapMode: WorkerMapMode
  onClose: () => void
  onRecenter: () => void
  onToggleTraffic: () => void
  providerModel: WorkerMapProviderModel
  subtitle: string
  title: string
  trafficEnabled: boolean
  visible: boolean
}) {
  const { language, tokens } = useWorkerUi()
  const routeUnlocked = mapMode === 'route'
  const [mapState, dispatchMap] = useReducer(workerHomeMapReducer, initialWorkerHomeMapState)
  const { compassNorth: mapCompassNorth, layerDetailed: mapLayerDetailed, zoom: mapZoom } = mapState
  const recenterMap = () => {
    dispatchMap({ type: 'recenter' })
    onRecenter()
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.workerMapModalBackdrop}>
        <GlassModalSheet mode={tokens.mode} style={[styles.workerMapModalSheet, workerMapModalSheetSurface(tokens)]} testID="worker-map-expanded-sheet">
          <View style={styles.workerMapExpandedHeader}>
            <View style={styles.titleStack}>
              <Text style={[styles.kicker, { color: tokens.primary }]}>{language === 'en' ? 'Operational map' : 'Bản đồ vận hành'}</Text>
              <Text style={[styles.heroTitle, { color: tokens.ink }]} numberOfLines={1}>{title}</Text>
              <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={2}>{subtitle}</Text>
            </View>
            <Pressable accessibilityLabel={language === 'en' ? 'Close map' : 'Đóng bản đồ'} accessibilityRole="button" onPress={onClose} style={[styles.workerMapCloseButton, { borderColor: tokens.borderStrong, backgroundColor: tokens.raised }]} testID="worker-map-close-expanded">
              <WorkerMapCloseGlyph />
            </Pressable>
          </View>
          <View style={[styles.workerExpandedMapViewport, workerMapViewportSurface(tokens)]} testID="worker-map-expanded-vector">
            <View pointerEvents="none" style={[styles.workerMapZoomLayer, { transform: [{ scale: mapZoom }, { rotate: mapCompassNorth ? '0deg' : '-7deg' }] }]}>
              <MapLineField detailed={mapLayerDetailed} expanded />
              {routeUnlocked ? <WorkerMapRouteLine expanded trafficEnabled={trafficEnabled} /> : hasMapContext ? <WorkerMapCoverageLine expanded /> : null}
              <WorkerMapProviderBridge expanded model={providerModel} />
              <View pointerEvents="none" style={[styles.mapCyanVeil, styles.expandedMapVeil, { backgroundColor: tokens.aqua }]} />
              {hasMapContext ? (
                <View style={[styles.homeMapMarker, styles.expandedMapMarkerZone]}>
                  <WorkerMapPulseDot tone={routeUnlocked ? 'route' : 'area'} testID="worker-map-expanded-zone-pulse-dot" />
                </View>
              ) : null}
              {hasWorkerAnchor ? (
                <View style={[styles.homeMapMarker, styles.expandedMapMarkerWorker]}>
                  <WorkerMapPulseDot tone="worker" testID="worker-map-expanded-worker-pulse-dot" />
                </View>
              ) : null}
            </View>
            <WorkerMapControlStack
              centered={centered}
              compassNorth={mapCompassNorth}
              expanded
              layerDetailed={mapLayerDetailed}
              onToggleCompass={() => dispatchMap({ type: 'toggle_compass' })}
              onToggleLayer={() => dispatchMap({ type: 'toggle_layer' })}
              showTraffic={routeUnlocked}
              trafficEnabled={trafficEnabled}
              onRecenter={recenterMap}
              onToggleTraffic={onToggleTraffic}
              onZoomIn={() => dispatchMap({ type: 'zoom_in' })}
              onZoomOut={() => dispatchMap({ type: 'zoom_out' })}
              zoomInDisabled={mapZoom >= 1.28}
              zoomOutDisabled={mapZoom <= 0.86}
            />
            <WorkerMapRouteSummary fullAddressLabel={fullAddressLabel} mapArea={mapArea} mapMode={mapMode} onRecenter={recenterMap} providerModel={providerModel} trafficEnabled={trafficEnabled} />
          </View>
        </GlassModalSheet>
      </View>
    </Modal>
  )
}

export function WorkerMapRouteSummary({
  fullAddressLabel,
  mapArea,
  mapMode,
  onRecenter,
  providerModel,
  trafficEnabled,
}: {
  fullAddressLabel: string | null
  mapArea: string
  mapMode?: WorkerMapMode
  onRecenter?: () => void
  providerModel: WorkerMapProviderModel
  trafficEnabled: boolean
}) {
  const { language, tokens } = useWorkerUi()
  const routeDestinationLabel = (providerModel.fullAddressLabel ?? fullAddressLabel)?.trim() || null
  const canOpenExternalRoute = providerModel.routeRequestReady && Boolean(routeDestinationLabel)
  if (mapMode !== 'route' || !canOpenExternalRoute || !routeDestinationLabel) return null

  const title = language === 'en' ? 'Route to meeting point' : 'Đường đến điểm hẹn'
  const detail = localizedWorkerAreaLabel(routeDestinationLabel ?? mapArea, language)
  const badge = trafficEnabled
    ? language === 'en' ? 'Traffic' : 'Giao thông'
    : 'Maps'
  const note = language === 'en'
    ? 'Open turn-by-turn directions using the released job address.'
    : 'Mở chỉ đường từng bước bằng địa chỉ đã được mở từ công việc.'

  return (
    <View style={[styles.workerMapRouteSummary, { borderColor: tokens.border, backgroundColor: tokens.raised }]} testID="worker-map-route-summary">
      <View style={styles.hiddenMarker} testID={canOpenExternalRoute ? workerMapProviderBridgeTestIDs.route : workerMapProviderBridgeTestIDs.area} />
      <View style={styles.workerMapSummaryHeader}>
        <View style={styles.titleStack}>
          <Text style={[styles.mapRouteSummaryTitle, { color: tokens.ink }]} numberOfLines={1}>{title}</Text>
          <Text style={[styles.mapRouteSummaryDetail, { color: tokens.muted }]} numberOfLines={2}>{detail}</Text>
        </View>
        <View style={[styles.workerMapSummaryBadge, { backgroundColor: trafficEnabled ? tokens.cream : tokens.mint, borderColor: trafficEnabled ? tokens.border : tokens.borderStrong }]}>
          <Text style={[styles.mapChipTitle, { color: trafficEnabled ? tokens.copper : tokens.primary }]} numberOfLines={1}>{badge}</Text>
        </View>
      </View>
      <Text style={[styles.mapRouteSummaryNote, { color: tokens.subtle }]} numberOfLines={2}>{note}</Text>
      {canOpenExternalRoute ? (
        <View style={styles.workerMapSummaryActions}>
          <Pressable
            accessibilityLabel={language === 'en' ? 'Open route in Maps' : 'Mở tuyến trong Maps'}
            accessibilityRole="button"
            onPress={() => {
              if (!routeDestinationLabel) return
              void openWorkerMapDirections(routeDestinationLabel, language)
            }}
            style={[styles.workerMapSummaryButton, { backgroundColor: tokens.primary }]}
            testID="worker-map-open-external-route"
          >
            <Text style={[styles.pressButtonTextPrimary, { color: tokens.primaryText }]} numberOfLines={1}>{language === 'en' ? 'Start navigation' : 'Bắt đầu dẫn đường'}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={language === 'en' ? 'Recenter route' : 'Căn lại tuyến'}
            accessibilityRole="button"
            onPress={onRecenter}
            style={[styles.workerMapSummaryButton, styles.workerMapSummaryButtonSecondary, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
            testID="worker-map-recenter-route"
          >
            <Text style={[styles.pressButtonTextSecondary, { color: tokens.primary }]} numberOfLines={1}>{language === 'en' ? 'Recenter' : 'Căn lại'}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}
