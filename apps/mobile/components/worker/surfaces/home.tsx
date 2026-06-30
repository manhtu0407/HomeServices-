import { isAcceptedLocalWorkerDeal, localizedWorkerAreaLabel } from './chat-helpers'
import { mapPreview } from './copy'
import { createWorkerMapProviderModel, openWorkerMapDirections, workerHomeMapReducer } from './map-helpers'
import { styles } from './styles'
import { workerMapSharpInset } from './surface-styles/glass-earnings'
import { workerHomeAvailabilityToggleFill, workerHomeAvailabilityToggleKnob, workerHomeAvailabilityToggleTrackSurface, workerHomeLiquidControlSurface, workerHomeLiquidHeroSurface, workerHomeLiquidReadinessSurface, workerHomeOperationalTileSurface, workerHomeReadinessActionWellSurface, workerHomeToggleTrackKeyline, workerOperationalIconAura, workerOperationalIconStage, workerOperationalTileKeyline } from './surface-styles/home-jobs'
import { workerMapModalSheetSurface, workerMapViewportSurface } from './surface-styles/profile-map'
import { workerHasReducedGlass } from './theme'
import { type WorkerMapMode, type WorkerTone } from './types'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { GlassModalSheet } from '@/components/ui/glass-modal-sheet'
import { GlassSurface } from '@/components/ui/glass-surface'
import { motionTokens } from '@/components/ui/motion-tokens'
import { reduceMotionAwarePressStyle } from '@/components/ui/reduce-motion-aware-animation'
import { appCopy, localizedStatusLabel } from '@/lib/app-language'
import { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { type ServiceType } from '@home-services/shared'
import { useRouter } from 'expo-router'
import { type ReactNode, useEffect, useReducer, useState } from 'react'
import { Modal, Pressable, Text, View } from 'react-native'
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { IncomingRequestSheet } from './job-offer'
import { MapLineField, WorkerMapCloseGlyph, WorkerMapControlStack, WorkerMapCoverageLine, WorkerMapProviderBridge, WorkerMapPulseDot, WorkerMapRouteLine, WorkerMapRouteSummary, initialWorkerHomeMapState } from './map'
import { WorkerFrame } from './shell'
import { LiquidMapGlassOverlay, LiquidMapOptics, LiquidPanelGlassOverlay, LiquidSharpKeyline, LiquidSpecularLayer, PressButton, WorkerHomeMapMaterialContours, WorkerHomeMaterialDepthPlane, WorkerHomeMaterialSubstrate, WorkerImageIcon, getWorkerVisibleDeal, localizedWorkerVerificationStatus, useWorkerFrameCopy, useWorkerUi } from './ui'
import type { WorkerImageIconName } from './ui'

const workerServiceImageIcons: Record<Extract<ServiceType, 'cleaning' | 'electrical' | 'plumbing'>, WorkerImageIconName> = {
  cleaning: 'serviceCleaning',
  electrical: 'serviceElectrical',
  plumbing: 'servicePlumbing',
}

export function WorkerHomeSurface() {
  const copy = useWorkerFrameCopy()
  const { state } = useFrontendWorkflow()
  const deal = getWorkerVisibleDeal(state.deal)
  const hasIncomingRequest = Boolean(deal?.broadcast && !isAcceptedLocalWorkerDeal(deal))

  return (
    <WorkerFrame active="home" eyebrow={copy.home.eyebrow} subtitle={copy.home.readinessSubtitle} title={copy.home.readinessTitle} testID="worker-home-surface">
      <WorkerMapStage />
      <WorkerReadinessActionPanel />
      <WorkerHomeServiceGrid />
      <WorkerHomeMiniGrid />
      {hasIncomingRequest ? <IncomingRequestSheet material="liquid" /> : null}
    </WorkerFrame>
  )
}

function WorkerMapStage() {
  const { copy, language, tokens } = useWorkerUi()
  const { selectors, state, workerProfile } = useFrontendWorkflow()
  const { reduceMotion } = useGlassAccessibility()
  const reduceGlass = workerHasReducedGlass(tokens)
  const [mapState, dispatchMap] = useReducer(workerHomeMapReducer, initialWorkerHomeMapState)
  const { centered: mapCentered, compassNorth: mapCompassNorth, expanded, layerDetailed: mapLayerDetailed, trafficEnabled, zoom: mapZoom } = mapState
  const deal = getWorkerVisibleDeal(state.deal)
  const broadcast = deal?.broadcast
  const mapArea = broadcast?.generalArea ?? deal?.draft.districtLabel
  const fullAddressLabel = selectors.canWorkerSeeFullAddress && broadcast?.fullAddressVisible && broadcast.fullAddressLabel ? broadcast.fullAddressLabel : null
  const routeUnlocked = Boolean(fullAddressLabel)
  const mapMode: WorkerMapMode = routeUnlocked ? 'route' : broadcast ? 'locked' : 'area'
  const hasWorkerDistrict = Boolean(workerProfile?.districts[0])
  const workerAnchorLabel = workerProfile?.districts[0]
    ? localizedWorkerAreaLabel(workerProfile.districts[0], language)
    : appCopy[language].common.noData
  const releasedAddressLabel = fullAddressLabel ? localizedWorkerAreaLabel(fullAddressLabel, language) : null
  const visibleMapAreaLabel = releasedAddressLabel ?? (mapArea ? localizedWorkerAreaLabel(mapArea, language) : hasWorkerDistrict ? workerAnchorLabel : null)
  const mapSearch = visibleMapAreaLabel ?? copy.home.mapSearch
  const workerRadiusKm = workerProfile?.service_radius_km
  const hasWorkerRadius = typeof workerRadiusKm === 'number' && Number.isFinite(workerRadiusKm)
  const providerModel = createWorkerMapProviderModel({
    areaLabel: mapSearch,
    fullAddressLabel,
    mapMode,
    serviceRadius: hasWorkerRadius ? workerRadiusKm : null,
    trafficEnabled,
    workerLat: workerProfile?.home_lat,
    workerLng: workerProfile?.home_lng,
  })
  const hasWorkerAnchor = hasWorkerDistrict || Boolean(providerModel.workerOrigin)
  const hasMapContext = Boolean(fullAddressLabel || mapArea || hasWorkerAnchor)
  const mapActionLabel = language === 'en' ? 'Open work map' : 'Mở bản đồ nhận việc'
  const expandedTitle = fullAddressLabel
    ? language === 'en' ? 'Route to meeting point' : 'Đường đến điểm hẹn'
    : language === 'en' ? 'Work area map' : 'Bản đồ khu vực nhận việc'
  const expandedSubtitle = fullAddressLabel
    ? `${language === 'en' ? 'Address' : 'Địa chỉ'}: ${releasedAddressLabel}`
    : language === 'en'
      ? 'Map details appear when verified system data is available.'
      : 'Chi tiết bản đồ chỉ hiện khi hệ thống có dữ liệu đã xác nhận.'
  const availabilityHud = workerProfile?.is_suspended
    ? language === 'en' ? 'Suspended' : 'Tạm khóa'
    : workerProfile?.is_approved && workerProfile.is_available
      ? language === 'en' ? 'Receiving' : 'Nhận việc'
      : workerProfile?.is_approved
        ? language === 'en' ? 'Offline' : 'Tạm tắt'
        : language === 'en' ? 'Pending' : 'Chờ duyệt'

  return (
    <GlassSurface material="liquid" mode={tokens.mode} style={[styles.mapStage, workerHomeLiquidHeroSurface(tokens)]} testID="worker-flexible-map-shell" variant="hero">
      <LiquidSharpKeyline variant="hero" />
      <LiquidSpecularLayer variant="hero" />
      <Pressable
        accessibilityHint={language === 'en' ? 'Shows a larger work map with controls.' : 'Mở bản đồ lớn với các công cụ điều hướng.'}
        accessibilityLabel={mapActionLabel}
        accessibilityRole="button"
        onPress={() => dispatchMap({ type: 'open' })}
        style={({ pressed }) => [styles.workerMapPreviewPressable, reduceMotionAwarePressStyle(pressed, reduceMotion)]}
        testID="worker-map-open-expanded"
      >
      <View style={[styles.mapViewport, workerMapViewportSurface(tokens, 'liquid')]} testID="worker-map-google-ready">
        <WorkerHomeMaterialSubstrate surface="map" />
        <WorkerHomeMaterialDepthPlane surface="map" />
        <WorkerHomeMapMaterialContours />
        <MapLineField />
        {routeUnlocked ? <WorkerMapRouteLine trafficEnabled={trafficEnabled} /> : hasMapContext ? <WorkerMapCoverageLine /> : null}
        {!reduceGlass ? <View pointerEvents="none" style={[styles.mapFogTop, { backgroundColor: tokens.raised }]} /> : null}
        {!reduceGlass ? <View pointerEvents="none" style={[styles.mapCyanVeil, styles.mapCyanVeilLiquid, { backgroundColor: tokens.aqua }]} /> : null}
        {!reduceGlass ? <View pointerEvents="none" style={[styles.mapFogBottom, { backgroundColor: tokens.raised }]} /> : null}
        <View style={styles.hiddenMarker} testID={mapPreview.replaceWithProvider} />
        <WorkerMapProviderBridge model={providerModel} />
        <LiquidMapOptics />
        <LiquidMapGlassOverlay />
        <View pointerEvents="none" style={[styles.mapSharpInset, workerMapSharpInset(tokens)]} testID="worker-map-sharp-inset" />
        {visibleMapAreaLabel || workerProfile ? (
          <View style={styles.workerMapTopHud} testID="worker-home-map-hud">
            {visibleMapAreaLabel ? (
              <View style={[styles.searchPill, workerHomeLiquidControlSurface(tokens)]} testID="worker-map-search-pill-opaque">
                <Text style={[styles.mapChipTitle, { color: tokens.ink }]} numberOfLines={1}>
                  {visibleMapAreaLabel}
                </Text>
              </View>
            ) : null}
            {workerProfile ? (
              <View style={[styles.searchPill, workerHomeLiquidControlSurface(tokens, 'status')]} testID="worker-map-availability-pill">
                <Text style={[styles.mapChipTitle, { color: tokens.primary }]} numberOfLines={1}>
                  {availabilityHud}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
        <WorkerMapControlStack material="liquid" />
        {!reduceGlass && hasMapContext ? <View pointerEvents="none" style={[styles.homeMapZoneRing, styles.homeMapZoneRingLiquid, { backgroundColor: tokens.aqua }]} /> : null}
      </View>
      </Pressable>
      {routeUnlocked && fullAddressLabel ? (
        <Pressable
          accessibilityLabel={language === 'en' ? 'Start navigation from home map' : 'Bắt đầu dẫn đường từ bản đồ chính'}
          accessibilityRole="button"
          onPress={() => {
            void openWorkerMapDirections(fullAddressLabel, language)
          }}
          style={({ pressed }) => [
            styles.workerHomeMapNavigationCta,
            { backgroundColor: tokens.primary },
            reduceMotionAwarePressStyle(pressed, reduceMotion),
          ]}
          testID="worker-home-map-start-navigation"
        >
          <Text style={[styles.pressButtonTextPrimary, { color: tokens.primaryText }]} numberOfLines={1}>
            {language === 'en' ? 'Start navigation' : 'Bắt đầu dẫn đường'}
          </Text>
        </Pressable>
      ) : null}
      <Modal animationType="slide" onRequestClose={() => dispatchMap({ type: 'close' })} transparent visible={expanded}>
        <View style={styles.workerMapModalBackdrop}>
          <GlassModalSheet material="liquid" mode={tokens.mode} style={[styles.workerMapModalSheet, workerMapModalSheetSurface(tokens, 'liquid')]} testID="worker-map-expanded-sheet">
            <View style={styles.workerMapExpandedHeader}>
              <View style={styles.titleStack}>
                <Text style={[styles.kicker, { color: tokens.primary }]}>{language === 'en' ? 'Operational map' : 'Bản đồ vận hành'}</Text>
                <Text style={[styles.heroTitle, { color: tokens.ink }]} numberOfLines={1}>{expandedTitle}</Text>
                <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={2}>{expandedSubtitle}</Text>
              </View>
              <Pressable accessibilityLabel={language === 'en' ? 'Close map' : 'Đóng bản đồ'} accessibilityRole="button" onPress={() => dispatchMap({ type: 'close' })} style={[styles.workerMapCloseButton, { borderColor: tokens.borderStrong, backgroundColor: tokens.raised }]} testID="worker-map-close-expanded">
                <WorkerMapCloseGlyph />
              </Pressable>
            </View>
            <View style={[styles.workerExpandedMapViewport, workerMapViewportSurface(tokens, 'liquid')]} testID="worker-map-expanded-vector">
              <View pointerEvents="none" style={[styles.workerMapZoomLayer, { transform: [{ scale: mapZoom }, { rotate: mapCompassNorth ? '0deg' : '-7deg' }] }]}>
                <WorkerHomeMaterialSubstrate surface="map" />
                <WorkerHomeMaterialDepthPlane surface="map" />
                <WorkerHomeMapMaterialContours expanded />
                <MapLineField detailed={mapLayerDetailed} expanded />
                {routeUnlocked ? <WorkerMapRouteLine expanded trafficEnabled={trafficEnabled} /> : hasMapContext ? <WorkerMapCoverageLine expanded /> : null}
                <WorkerMapProviderBridge expanded model={providerModel} />
                {!reduceGlass ? <View pointerEvents="none" style={[styles.mapCyanVeil, styles.expandedMapVeil, { backgroundColor: tokens.aqua }]} /> : null}
                {hasMapContext ? (
                  <View style={[styles.homeMapMarker, styles.expandedMapMarkerZone]}>
                    <WorkerMapPulseDot tone={routeUnlocked ? 'route' : 'area'} testID="worker-home-map-zone-pulse-dot" />
                  </View>
                ) : null}
                {hasWorkerAnchor ? (
                  <View style={[styles.homeMapMarker, styles.expandedMapMarkerWorker]}>
                    <WorkerMapPulseDot tone="worker" testID="worker-home-map-worker-pulse-dot" />
                  </View>
                ) : null}
              </View>
              <LiquidMapGlassOverlay expanded />
              <WorkerMapControlStack
                centered={mapCentered}
                compassNorth={mapCompassNorth}
                expanded
                layerDetailed={mapLayerDetailed}
                material="liquid"
                onToggleCompass={() => dispatchMap({ type: 'toggle_compass' })}
                onToggleLayer={() => dispatchMap({ type: 'toggle_layer' })}
                showTraffic={routeUnlocked}
                trafficEnabled={trafficEnabled}
                onRecenter={() => dispatchMap({ type: 'recenter' })}
                onToggleTraffic={() => dispatchMap({ type: 'toggle_traffic' })}
                onZoomIn={() => dispatchMap({ type: 'zoom_in' })}
                onZoomOut={() => dispatchMap({ type: 'zoom_out' })}
                zoomInDisabled={mapZoom >= 1.28}
                zoomOutDisabled={mapZoom <= 0.86}
              />
              <WorkerMapRouteSummary fullAddressLabel={fullAddressLabel} mapArea={mapSearch} mapMode={mapMode} onRecenter={() => dispatchMap({ type: 'recenter' })} providerModel={providerModel} trafficEnabled={trafficEnabled} />
            </View>
          </GlassModalSheet>
        </View>
      </Modal>
    </GlassSurface>
  )
}

function WorkerReadinessActionPanel() {
  const { copy, language, tokens } = useWorkerUi()
  const { actions, selectors, state, workerProfile } = useFrontendWorkflow()
  const { replace } = useRouter()
  const deal = getWorkerVisibleDeal(state.deal)
  const acceptedDeal = isAcceptedLocalWorkerDeal(deal) ? deal : null
  const isSuspended = Boolean(workerProfile?.is_suspended)
  const rawIsAvailable = Boolean(workerProfile?.is_available)
  const isAvailable = Boolean(rawIsAvailable && !isSuspended)
  const availabilityLabel = !workerProfile
    ? appCopy[language].common.noData
    : isSuspended
    ? language === 'en' ? 'Suspended' : 'Tạm khóa'
    : isAvailable
    ? language === 'en' ? 'Online' : 'Đang nhận việc'
    : language === 'en' ? 'Offline' : 'Tạm tắt nhận'
  const isOperationallyBusy = Boolean(
    acceptedDeal &&
      selectors.currentStatus !== 'confirmed_by_customer' &&
      selectors.currentStatus !== 'reviewed',
  )
  const nextAvailability = !rawIsAvailable
  const canGoOnline = Boolean(workerProfile?.is_approved && !isSuspended && !isOperationallyBusy)
  const canGoOffline = rawIsAvailable
  const canToggleAvailability = Boolean(workerProfile) &&
    (nextAvailability ? canGoOnline : canGoOffline)
  const canUseAvailabilitySwitch = Boolean(workerProfile) &&
    !isSuspended &&
    (isAvailable ? canGoOffline : canGoOnline)
  const statusTitle = deal
    ? localizedStatusLabel(selectors.currentStatus, language)
    : workerProfile?.is_approved || isSuspended
      ? availabilityLabel
      : copy.home.online
  const readinessBody = isSuspended
    ? copy.home.readinessSuspended
    : workerProfile?.is_available
      ? copy.home.readinessOnline
      : workerProfile?.is_approved
        ? copy.home.readinessOffline
        : copy.home.readinessNoProfile
  const availabilityActionLabel = nextAvailability ? copy.frame.availabilityOn : copy.frame.availabilityOff

  return (
    <GlassSurface
      material="liquid"
      mode={tokens.mode}
      style={[
        styles.shiftCard,
        workerHomeLiquidReadinessSurface(tokens),
      ]}
      testID="worker-readiness-action-panel"
      variant="hero"
    >
      <WorkerHomeMaterialSubstrate surface="readiness" />
      <WorkerHomeMaterialDepthPlane surface="readiness" />
      <LiquidSharpKeyline variant="panel" />
      <LiquidSpecularLayer variant="panel" />
      <LiquidPanelGlassOverlay variant="panel" />
      <View style={styles.hiddenMarker} testID="worker-unified-readiness-panel" />
      <View style={styles.rowBetween}>
        <View style={styles.titleStack}>
          <Text style={[styles.kicker, { color: tokens.primary }]}>{statusTitle}</Text>
          <Text style={[styles.heroTitle, { color: tokens.ink }]}>{copy.home.readinessTitle}</Text>
          <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={2}>
            {readinessBody}
          </Text>
        </View>
        <WorkerAvailabilityLiquidToggle
          checked={isAvailable}
          disabled={!canUseAvailabilitySwitch}
          label={availabilityActionLabel}
          onChange={(next) => actions.workerUpdateAvailability(next)}
        />
      </View>
      <View style={[styles.shiftActionRow, workerHomeReadinessActionWellSurface(tokens)]} testID="worker-readiness-primary-actions">
        <PressButton disabled={!canToggleAvailability} label={availabilityActionLabel} material="liquid" onPress={() => void actions.workerUpdateAvailability(nextAvailability)} testID="worker-availability-primary-action" />
        <PressButton secondary label={copy.jobs.filters[0]} onPress={() => replace('/(worker)/jobs?tab=waiting')} testID="worker-home-open-waiting-jobs" />
      </View>
    </GlassSurface>
  )
}

function WorkerAvailabilityLiquidToggle({ checked, disabled, label, onChange }: { checked: boolean; disabled: boolean; label: string; onChange: (next: boolean) => Promise<boolean> }) {
  const { tokens } = useWorkerUi()
  const { reduceMotion, reduceTransparency } = useGlassAccessibility()
  const [optimisticChecked, setOptimisticChecked] = useState<boolean | null>(null)
  const [pending, setPending] = useState(false)
  const progress = useSharedValue(checked ? 1 : 0)
  const pressSquash = useSharedValue(1)
  const visualChecked = optimisticChecked ?? checked

  useEffect(() => {
    if (optimisticChecked !== null) return
    cancelAnimation(progress)
    progress.value = reduceMotion
      ? withTiming(checked ? 1 : 0, { duration: 120 })
      : withSpring(checked ? 1 : 0, motionTokens.liquid.pill)
  }, [checked, optimisticChecked, progress, reduceMotion])

  const fillStyle = useAnimatedStyle(() => ({
    opacity: reduceTransparency ? 1 : 0.22 + progress.value * 0.78,
    transform: [
      { translateX: -12 + progress.value * 12 },
      { scaleX: 0.58 + progress.value * 0.42 },
    ],
  }))

  const knobStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: progress.value * 26 },
      { scaleX: pressSquash.value },
      { scaleY: 2 - pressSquash.value },
    ],
  }))

  const animateTo = (next: boolean) => {
    cancelAnimation(progress)
    progress.value = reduceMotion
      ? withTiming(next ? 1 : 0, { duration: 100 })
      : withSpring(next ? 1 : 0, motionTokens.liquid.pill)
  }

  const handlePress = async () => {
    if (disabled || pending) return
    const nextVisual = !visualChecked
    setOptimisticChecked(nextVisual)
    setPending(true)
    animateTo(nextVisual)
    const updated = await onChange(nextVisual).catch(() => false)
    if (!updated) {
      animateTo(checked)
    }
    setOptimisticChecked(null)
    pressSquash.value = reduceMotion
      ? withTiming(1, { duration: 80 })
      : withSpring(1, motionTokens.liquid.press)
    setPending(false)
  }

  const handlePressIn = () => {
    if (disabled || pending || reduceMotion) return
    pressSquash.value = withSpring(0.94, motionTokens.liquid.press)
  }

  const handlePressOut = () => {
    pressSquash.value = reduceMotion
      ? withTiming(1, { duration: 80 })
      : withSpring(1, motionTokens.liquid.press)
  }

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked: visualChecked, disabled: disabled || pending }}
      disabled={disabled || pending}
      onPress={() => void handlePress()}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.toggleTrack,
        workerHomeAvailabilityToggleTrackSurface(tokens, visualChecked, disabled || pending),
      ]}
      testID="worker-availability-toggle"
    >
      <Animated.View pointerEvents="none" style={[styles.toggleLiquidFill, workerHomeAvailabilityToggleFill(tokens, visualChecked), fillStyle]} />
      <View pointerEvents="none" style={[styles.toggleTrackKeyline, workerHomeToggleTrackKeyline(tokens, visualChecked)]} />
      <Animated.View pointerEvents="none" style={[styles.toggleKnob, workerHomeAvailabilityToggleKnob(tokens), knobStyle]} />
      <View style={styles.hiddenMarker} testID="worker-availability-liquid-toggle-motion" />
    </Pressable>
  )
}

function WorkerHomeServiceGrid() {
  const { copy } = useWorkerUi()
  const { workerProfile } = useFrontendWorkflow()
  const workerServiceTypes = workerProfile?.service_types ?? []
  const canShowApprovedSkills = Boolean(workerProfile?.is_approved && workerProfile?.verification_status === 'approved')
  const serviceCandidates = [
    { service: 'electrical' as const, title: copy.home.electricianCard, tone: 'mint' as const, testID: 'worker-shell-service-electrical' },
    { service: 'plumbing' as const, title: copy.home.plumberCard, tone: 'cyan' as const, testID: 'worker-shell-service-plumbing' },
    { service: 'cleaning' as const, title: copy.home.cleaningCard, tone: 'cream' as const, testID: 'worker-shell-service-cleaning' },
  ]

  return (
    <View style={styles.workerServiceGrid} testID="worker-home-service-grid">
      {serviceCandidates.map((item) => {
        const approvedForService = canShowApprovedSkills && workerServiceTypes.includes(item.service)
        return (
          <WorkerHomeServiceTile
            key={item.testID}
            meta={approvedForService ? copy.home.serviceSkillLabel : copy.home.servicePendingLabel}
            service={item.service}
            title={item.title}
            tone={item.tone}
            testID={item.testID}
          />
        )
      })}
    </View>
  )
}

function WorkerHomeServiceTile({ meta, service, testID, title, tone }: { meta: string; service: Extract<ServiceType, 'cleaning' | 'electrical' | 'plumbing'>; testID?: string; title: string; tone: WorkerTone }) {
  const { tokens } = useWorkerUi()
  const { replace } = useRouter()
  const { reduceMotion } = useGlassAccessibility()

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => replace('/(worker)/profile')}
      style={({ pressed }) => [styles.workerServiceTile, workerHomeOperationalTileSurface(tokens, tone), reduceMotionAwarePressStyle(pressed, reduceMotion)]}
      testID={testID}
    >
      <View pointerEvents="none" style={[styles.operationalTileKeyline, workerOperationalTileKeyline(tokens)]} />
      <WorkerHomeImageIconStage>
        <WorkerImageIcon frameSize={72} name={workerServiceImageIcons[service]} size={72} />
      </WorkerHomeImageIconStage>
      <Text adjustsFontSizeToFit minimumFontScale={0.78} style={[styles.workerServiceTitle, { color: tokens.ink }]} numberOfLines={2}>
        {title}
      </Text>
      <Text style={[styles.workerServiceMeta, { color: tokens.muted }]} numberOfLines={1}>
        {meta}
      </Text>
    </Pressable>
  )
}

function WorkerHomeMiniGrid() {
  const { copy, language, tokens } = useWorkerUi()
  const { replace } = useRouter()
  const { workerProfile } = useFrontendWorkflow()
  const { reduceMotion } = useGlassAccessibility()
  const profileStatus = localizedWorkerVerificationStatus(workerProfile?.verification_status ?? 'draft', language)

  return (
    <View style={styles.workerMiniGrid} testID="worker-home-mini-grid">
      <View style={styles.hiddenMarker} testID="worker-shell-service-profile-pending" />
      <Pressable
        accessibilityRole="button"
        onPress={() => replace('/(worker)/jobs?tab=waiting')}
        style={({ pressed }) => [styles.workerMiniCard, workerHomeOperationalTileSurface(tokens, 'mint'), reduceMotionAwarePressStyle(pressed, reduceMotion)]}
        testID="worker-home-mini-waiting"
      >
        <View pointerEvents="none" style={[styles.operationalTileKeyline, workerOperationalTileKeyline(tokens)]} />
        <WorkerHomeImageIconStage mini>
          <WorkerImageIcon frameSize={50} name="navJobs" size={50} />
        </WorkerHomeImageIconStage>
        <Text style={[styles.workerMiniTitle, { color: tokens.ink }]} numberOfLines={1}>{copy.jobs.filters[0]}</Text>
        <Text style={[styles.workerMiniMeta, { color: tokens.muted }]} numberOfLines={1}>{language === 'en' ? 'New requests' : 'Yêu cầu mới'}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => replace('/(worker)/profile')}
        style={({ pressed }) => [styles.workerMiniCard, workerHomeOperationalTileSurface(tokens, 'cyan'), reduceMotionAwarePressStyle(pressed, reduceMotion)]}
        testID="worker-home-mini-profile"
      >
        <View pointerEvents="none" style={[styles.operationalTileKeyline, workerOperationalTileKeyline(tokens)]} />
        <WorkerHomeImageIconStage mini>
          <WorkerImageIcon frameSize={50} name="profileVerified" size={50} />
        </WorkerHomeImageIconStage>
        <Text style={[styles.workerMiniTitle, { color: tokens.ink }]} numberOfLines={1}>{profileStatus}</Text>
        <Text style={[styles.workerMiniMeta, { color: tokens.muted }]} numberOfLines={1}>{copy.home.serviceProfileTitle}</Text>
      </Pressable>
    </View>
  )
}

function WorkerHomeImageIconStage({ children, mini = false }: { children: ReactNode; mini?: boolean }) {
  const { tokens } = useWorkerUi()
  const reduceGlass = workerHasReducedGlass(tokens)

  return (
    <View style={[mini ? styles.workerMiniImageStage : styles.workerServiceImageStage, workerOperationalIconStage(tokens)]}>
      {!reduceGlass ? (
        <View pointerEvents="none" style={[styles.workerOperationalIconAura, workerOperationalIconAura(tokens)]} />
      ) : (
        <View pointerEvents="none" style={styles.hiddenMarker} testID="worker-operational-icon-aura-reduced-transparency" />
      )}
      <View style={styles.workerOperationalIconContent}>
        {children}
      </View>
    </View>
  )
}
