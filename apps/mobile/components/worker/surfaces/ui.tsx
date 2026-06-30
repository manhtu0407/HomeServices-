import { workerCopy, type WorkerCopy, workerVerificationCopy } from './copy'
import { styles } from './styles'
import { workerHomeMaterialBottomEdge, workerHomeMaterialDepth, workerHomeMaterialDepthPlaneSurface, workerHomeMaterialRole, workerHomeMaterialSubstrateSurface, workerHomeMaterialTopEdge, workerLiquidEdgeHighlight, workerLiquidRefractionPool, workerLiquidSharpKeyline, workerLiquidSpecularBand, workerMapLiquidGlassEdge, workerMapLiquidGlassOverlay, workerMapLiquidLens, workerMapLiquidSpecularArc, workerPanelLiquidGlassOverlay, workerPrimaryButtonSurface, workerSecondaryButtonSurface } from './surface-styles/glass-earnings'
import { workerHomeDisabledPrimaryButtonSurface, workerHomeLiquidButtonSheen, workerHomeLiquidPrimaryButtonSurface, workerJobsCardBottomEdge, workerJobsCardCrispShell, workerJobsCardDepthPlane, workerJobsCardInnerInset, workerJobsCardRefraction, workerJobsCardTopEdge, workerOperationalTileKeyline } from './surface-styles/home-jobs'
import { workerHomeLiquidMaterialSystem, workerProfileChromeBottomEdge, workerProfileChromeCrispShell, workerProfileChromeInnerInset, workerProfileChromeRefraction, workerProfileChromeTopEdge, workerProfileChromeWash } from './surface-styles/profile-map'
import { workerHasReducedGlass, type WorkerThemeTokens } from './theme'
import { type WorkerActiveTab, type WorkerDockIconName, type WorkerIconName, type WorkerJobsTab, type WorkerLanguageMode, type WorkerProfileChromeVariant, type WorkerThemeMode, type WorkerTone } from './types'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { GlassPressable } from '@/components/ui/glass-pressable'
import { type GlassMaterial } from '@/components/ui/tokens'
import { useAppLanguage } from '@/lib/app-language'
import { type LocalDeal, type WorkerVerificationStatus } from '@nestscout/shared'
import { Image } from 'expo-image'
import { createContext, use, useEffect } from 'react'
import { Platform, type StyleProp, Text, View, type ViewStyle } from 'react-native'
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated'
import Svg, { Circle, Path, Rect } from 'react-native-svg'

export const WORKER_XANHSM_REFERENCE_AUDIT = 'WORKER_XANHSM_REFERENCE_AUDIT: XanhSM map shell translated into Home Services worker production UI'

export const WORKER_PRODUCTION_CONTRACT = 'WORKER_PRODUCTION_CONTRACT: docs/design/worker-production-contract.md'

export const WORKER_CLIENT_BASELINE_AUDIT = 'WORKER_CLIENT_BASELINE_AUDIT: customer V4 semantic layers matched for worker production'

export const WORKER_THEME_LANGUAGE_STORE = 'WORKER_THEME_LANGUAGE_STORE: worker-theme-language-switch AsyncStorage useSyncExternalStore'

export const WORKER_FLEXIBLE_MAP_SHELL = 'WORKER_FLEXIBLE_MAP_SHELL: worker-map-google-ready flexible-map-preview'

export const WORKER_DOCK_GLASS_MOTION = 'WORKER_DOCK_GLASS_MOTION: worker-dock-glass-aura worker-liquid-glass-dock worker-dock-kael-mascot-icon worker-dock-client-style-icon'

export const WORKER_GLASSMORPHISM_MOTION_LAYER = 'WORKER_GLASSMORPHISM_MOTION_LAYER: shared-glass-pressable static-depth-layer centered-metric-type'

const WORKER_MAP_BALANCED_DIRECTION = 'WORKER_MAP_BALANCED_DIRECTION: docs/design/worker-map-operation-balanced-20260531.md vector-map-no-screenshot'

void WORKER_MAP_BALANCED_DIRECTION

export const WORKER_CHATBOX_EMPTY_COMPOSER = 'WORKER_CHATBOX_EMPTY_COMPOSER: worker-kael-empty-chat-state worker-kael-chat-input submitWorkerChatMessage'

export const WORKER_NO_FULL_ADDRESS_BEFORE_ACCEPT = 'WORKER_NO_FULL_ADDRESS_BEFORE_ACCEPT: general area only until worker accepts'

export const WORKER_JOBROOM_KAEL_HANDOFF = 'WORKER_JOBROOM_KAEL_HANDOFF: worker-jobroom-kael-handoff worker-jobroom-waiting-room worker-jobroom-privacy-gate'

const WORKER_JOBROOM_WAITING_COPY_CONTRACT = 'Chờ Kael đưa yêu cầu vào phòng việc.'

void WORKER_JOBROOM_WAITING_COPY_CONTRACT

export const workerAmbientMintWashStyle = {
  opacity: 0.18,
  transform: [{ rotate: '-8deg' }],
}

export const workerAmbientLineWashStyle = {
  opacity: 0.12,
}

export const kaelHead = require('../../../assets/kael-model-8a-head.png')

const workerImageIcons = {
  navEarnings: require('../../../assets/worker-image-icons/nav-earnings.png'),
  navHome: require('../../../assets/worker-image-icons/nav-home.png'),
  navJobs: require('../../../assets/worker-image-icons/nav-jobs.png'),
  navProfile: require('../../../assets/worker-image-icons/nav-profile.png'),
  profileAvatar: require('../../../assets/worker-image-icons/profile-avatar-core.png'),
  profileIdentity: require('../../../assets/worker-image-icons/profile-identity.png'),
  profileServiceArea: require('../../../assets/worker-image-icons/profile-service-area.png'),
  profileSkills: require('../../../assets/worker-image-icons/profile-skills.png'),
  profileVerified: require('../../../assets/worker-image-icons/profile-verified.png'),
  serviceCleaning: require('../../../assets/worker-image-icons/service-cleaning.png'),
  serviceElectrical: require('../../../assets/worker-image-icons/service-electrical.png'),
  servicePlumbing: require('../../../assets/worker-image-icons/service-plumbing.png'),
  settingLanguage: require('../../../assets/worker-image-icons/setting-language.png'),
  settingTheme: require('../../../assets/worker-image-icons/setting-theme.png'),
  utilityBell: require('../../../assets/worker-image-icons/utility-bell.png'),
  utilityCalendar: require('../../../assets/worker-image-icons/utility-calendar.png'),
  utilityCamera: require('../../../assets/worker-image-icons/utility-camera.png'),
  utilityChat: require('../../../assets/worker-image-icons/utility-chat.png'),
  utilityClock: require('../../../assets/worker-image-icons/utility-clock.png'),
  utilityDocument: require('../../../assets/worker-image-icons/utility-document.png'),
  utilityEarningsLedger: require('../../../assets/worker-image-icons/utility-earnings-ledger-core.png'),
  utilityEarningsWallet: require('../../../assets/worker-image-icons/utility-earnings-wallet-core.png'),
  utilityEvidence: require('../../../assets/worker-image-icons/utility-evidence-core.png'),
  utilityIdentity: require('../../../assets/worker-image-icons/utility-identity.png'),
  utilityMap: require('../../../assets/worker-image-icons/utility-map.png'),
  utilityShield: require('../../../assets/worker-image-icons/utility-shield.png'),
  utilityScope: require('../../../assets/worker-image-icons/utility-scope-core.png'),
  utilityTools: require('../../../assets/worker-image-icons/utility-tools.png'),
  utilityWallet: require('../../../assets/worker-image-icons/utility-wallet.png'),
} as const

export const defaultWorkerJobsTab: WorkerJobsTab = 'waiting'

export type WorkerImageIconName = keyof typeof workerImageIcons

export const workerDockImageIcons: Record<Exclude<WorkerDockIconName, 'kael'>, WorkerImageIconName> = {
  apartment: 'navHome',
  document: 'navJobs',
  payment: 'navEarnings',
  person: 'navProfile',
}

const workerUtilityImageIcons: Partial<Record<WorkerIconName, WorkerImageIconName>> = {
  bank: 'utilityWallet',
  brief: 'utilityScope',
  chat: 'utilityChat',
  clock: 'utilityClock',
  document: 'utilityDocument',
  evidence: 'utilityEvidence',
  jobs: 'utilityCalendar',
  map: 'utilityMap',
  money: 'utilityWallet',
  person: 'utilityIdentity',
  pin: 'utilityMap',
  shield: 'utilityShield',
  tools: 'utilityTools',
}

const workerSectionMotionTestIDs: Record<WorkerActiveTab, string> = {
  chat: 'worker-section-glass-motion-chat',
  earnings: 'worker-section-glass-motion-earnings',
  home: 'worker-section-glass-motion-home',
  jobs: 'worker-section-glass-motion-jobs',
  profile: 'worker-section-glass-motion-profile',
}

type WorkerUiContextValue = {
  copy: WorkerCopy
  language: WorkerLanguageMode
  mode: WorkerThemeMode
  reduceTransparency: boolean
  tokens: WorkerThemeTokens
}

export const WorkerUiContext = createContext<WorkerUiContextValue | null>(null)

export function useWorkerFrameCopy() {
  const language = useAppLanguage()
  return workerCopy[language]
}

export function getWorkerVisibleDeal(deal: LocalDeal | null) {
  if (!deal?.broadcast) return null
  return deal.broadcast.status === 'declined' || deal.broadcast.status === 'expired' || deal.broadcast.status === 'reassigned' || deal.broadcast.status === 'cancelled' ? null : deal
}

export function localizedWorkerVerificationStatus(status: WorkerVerificationStatus, language: WorkerLanguageMode) {
  return workerVerificationCopy[language].status[status]
}

export function WorkerJobsCardChrome({ tone = 'base' }: { tone?: WorkerTone } = {}) {
  const { tokens } = useWorkerUi()
  const reduceGlass = workerHasReducedGlass(tokens)

  return (
    <>
      {!reduceGlass ? (
        <>
          <View pointerEvents="none" style={[styles.workerJobsCardDepthPlane, workerJobsCardDepthPlane(tokens, tone)]} testID="worker-jobs-card-liquid-chrome" />
          <View pointerEvents="none" style={[styles.workerJobsCardRefraction, workerJobsCardRefraction(tokens, tone)]} />
          <View pointerEvents="none" style={[styles.workerJobsCardTopEdge, workerJobsCardTopEdge(tokens)]} />
          <View pointerEvents="none" style={[styles.workerJobsCardCrispShell, workerJobsCardCrispShell(tokens, tone)]} testID="worker-jobs-card-crisp-shell" />
          <View pointerEvents="none" style={[styles.workerJobsCardInnerInset, workerJobsCardInnerInset(tokens)]} />
          <View pointerEvents="none" style={[styles.workerJobsCardBottomEdge, workerJobsCardBottomEdge(tokens)]} />
        </>
      ) : (
        <View pointerEvents="none" style={styles.hiddenMarker} testID="worker-jobs-card-opaque-chrome" />
      )}
      <View pointerEvents="none" style={[styles.operationalTileKeyline, workerOperationalTileKeyline(tokens)]} testID="worker-jobs-card-operational-keyline" />
    </>
  )
}

export function resetWorkerChatWebScrollPosition() {
  if (Platform.OS !== 'web') return
  const document = (globalThis as typeof globalThis & { document?: Document }).document
  const root = document?.querySelector?.('[data-testid="worker-chat-surface"]')
  if (!root) return
  const scrollTargets = [root, ...Array.from(root.querySelectorAll('*'))]
  scrollTargets.forEach((target) => {
    const scrollable = target as Element & { scrollLeft?: number; scrollTop?: number }
    try {
      if (typeof scrollable.scrollTop === 'number') scrollable.scrollTop = 0
      if (typeof scrollable.scrollLeft === 'number') scrollable.scrollLeft = 0
    } catch {
      // React Native Web can expose read-only scroll accessors on wrapper nodes.
    }
  })
}

export function WorkerProfileMaterialChrome({
  testID,
  variant,
}: {
  testID: string
  variant: WorkerProfileChromeVariant
}) {
  const { tokens } = useWorkerUi()

  if (workerHasReducedGlass(tokens)) {
    return <View pointerEvents="none" style={styles.hiddenMarker} testID={`${testID}-opaque`} />
  }

  return (
    <>
      <View pointerEvents="none" style={[styles.workerProfileChromeWash, workerProfileChromeWash(tokens, variant)]} />
      <View pointerEvents="none" style={[styles.workerProfileChromeRefraction, workerProfileChromeRefraction(tokens, variant)]} />
      <View pointerEvents="none" style={[styles.workerProfileChromeCrispShell, workerProfileChromeCrispShell(tokens, variant)]} testID={testID} />
      <View pointerEvents="none" style={[styles.workerProfileChromeInnerInset, workerProfileChromeInnerInset(tokens, variant)]} />
      <View pointerEvents="none" style={[styles.workerProfileChromeTopEdge, workerProfileChromeTopEdge(tokens)]} />
      <View pointerEvents="none" style={[styles.workerProfileChromeBottomEdge, workerProfileChromeBottomEdge(tokens)]} />
    </>
  )
}

export function WorkerSectionMotionField({
  active,
  frameWidth,
  screenWidth,
}: {
  active: WorkerActiveTab
  frameWidth: number
  screenWidth: number
}) {
  const { tokens } = useWorkerUi()
  const sectionIndex = ['home', 'jobs', 'chat', 'earnings', 'profile'].indexOf(active)
  const left = Math.max((screenWidth - frameWidth) / 2, 0)
  const topBias = 18 + Math.max(sectionIndex, 0) * 9
  const motionPulse = useSharedValue(0)
  const motionSettle = useSharedValue(0)

  useEffect(() => {
    motionPulse.value = 0
    motionSettle.value = 0
    motionPulse.value = withSequence(
      withTiming(1, { duration: 160 }),
      withDelay(90, withTiming(0, { duration: 280 })),
    )
    motionSettle.value = withSequence(
      withTiming(1, { duration: 180 }),
      withTiming(0.72, { duration: 180 }),
      withTiming(1, { duration: 160 }),
    )
    return () => {
      cancelAnimation(motionPulse)
      cancelAnimation(motionSettle)
    }
  }, [active, motionPulse, motionSettle])

  const ribbonStyle = useAnimatedStyle(() => ({
    opacity: 0.13 + motionPulse.value * 0.08,
    transform: [{ translateY: 8 - motionSettle.value * 8 }, { rotate: '10deg' }],
  }), [motionPulse, motionSettle])
  const washStyle = useAnimatedStyle(() => ({
    opacity: 0.1 + motionPulse.value * 0.08,
    transform: [{ translateY: 5 - motionSettle.value * 5 }, { rotate: '-8deg' }],
  }), [motionPulse, motionSettle])
  const causticStyle = useAnimatedStyle(() => ({
    opacity: 0.08 + motionPulse.value * 0.06,
    transform: [{ scaleX: 0.94 + motionSettle.value * 0.04 }],
  }), [motionPulse, motionSettle])
  const glintStyle = useAnimatedStyle(() => ({
    opacity: motionPulse.value * 0.18,
    transform: [{ translateX: -16 + motionSettle.value * 16 }, { rotate: '13deg' }],
  }), [motionPulse, motionSettle])

  return (
    <View
      pointerEvents="none"
      style={[styles.sectionMotionField, { left, width: frameWidth }]}
      testID={workerSectionMotionTestIDs[active]}
    >
      <Animated.View style={[styles.sectionMotionRibbon, { backgroundColor: tokens.glassHighlight, top: topBias }, ribbonStyle]} />
      <Animated.View style={[styles.sectionMotionWash, { backgroundColor: tokens.aqua, top: 28 + topBias }, washStyle]} />
      <Animated.View style={[styles.sectionMotionCaustic, { backgroundColor: tokens.mint }, causticStyle]} />
      <Animated.View style={[styles.sectionMotionGlint, { backgroundColor: tokens.glassHighlight }, glintStyle]} />
    </View>
  )
}

export function SubtleGlassHighlight({ liquid = false }: { liquid?: boolean } = {}) {
  const { tokens } = useWorkerUi()

  if (tokens.glassHighlight === 'transparent') return null
  return <View pointerEvents="none" style={[styles.glassTopHighlight, { backgroundColor: liquid ? workerLiquidEdgeHighlight(tokens) : tokens.glassHighlight, opacity: liquid ? (tokens.mode === 'dark' ? 1 : 0.92) : undefined }]} />
}

export function LiquidSharpKeyline({ variant = 'hero' }: { variant?: 'hero' | 'panel' | 'sheet' } = {}) {
  const { tokens } = useWorkerUi()

  if (tokens.glassHighlight === 'transparent') return null
  return <View pointerEvents="none" style={[styles.liquidSharpKeyline, variant === 'panel' ? styles.liquidSharpKeylinePanel : null, variant === 'sheet' ? styles.liquidSharpKeylineSheet : null, workerLiquidSharpKeyline(tokens)]} testID={`worker-liquid-sharp-keyline-${variant}`} />
}

export function LiquidSpecularLayer({ variant = 'hero' }: { variant?: 'hero' | 'panel' | 'sheet' } = {}) {
  const { tokens } = useWorkerUi()

  if (tokens.glassHighlight === 'transparent') return null
  return (
    <>
      <View pointerEvents="none" style={[styles.liquidSpecularBand, variant === 'panel' ? styles.liquidSpecularBandPanel : null, workerLiquidSpecularBand(tokens, variant)]} />
      <View pointerEvents="none" style={[styles.liquidRefractionPool, variant === 'panel' ? styles.liquidRefractionPoolPanel : null, workerLiquidRefractionPool(tokens, variant)]} />
    </>
  )
}

export function LiquidMapOptics() {
  const { tokens } = useWorkerUi()

  if (tokens.glassHighlight === 'transparent') return null
  return (
    <>
      <View pointerEvents="none" style={[styles.mapLiquidLens, workerMapLiquidLens(tokens)]} testID="worker-map-liquid-lens" />
      <View pointerEvents="none" style={[styles.mapLiquidSpecularArc, workerMapLiquidSpecularArc(tokens)]} />
    </>
  )
}

export function LiquidMapGlassOverlay({ expanded = false }: { expanded?: boolean } = {}) {
  const { tokens } = useWorkerUi()

  if (tokens.glassHighlight === 'transparent') return null
  return (
    <>
      <View pointerEvents="none" style={[styles.mapLiquidGlassOverlay, expanded ? styles.mapLiquidGlassOverlayExpanded : null, workerMapLiquidGlassOverlay(tokens)]} testID={expanded ? 'worker-map-liquid-glass-overlay-expanded' : 'worker-map-liquid-glass-overlay'} />
      <View pointerEvents="none" style={[styles.mapLiquidGlassEdge, expanded ? styles.mapLiquidGlassOverlayExpanded : null, workerMapLiquidGlassEdge(tokens)]} />
    </>
  )
}

export function LiquidPanelGlassOverlay({ variant }: { variant: 'panel' | 'sheet' }) {
  const { tokens } = useWorkerUi()

  if (tokens.glassHighlight === 'transparent') return null
  return (
    <View
      pointerEvents="none"
      style={[
        styles.liquidPanelGlassOverlay,
        variant === 'sheet' ? styles.liquidPanelGlassOverlaySheet : null,
        workerPanelLiquidGlassOverlay(tokens, variant),
      ]}
      testID={`worker-liquid-panel-glass-overlay-${variant}`}
    />
  )
}

export function WorkerHomeMaterialDepthPlane({ surface }: { surface: 'map' | 'readiness' | 'sheet' }) {
  const { tokens } = useWorkerUi()
  const layer = workerHomeLiquidMaterialSystem.surfaces[surface].glassLayer
  const depth = workerHomeMaterialDepth(surface)

  if (tokens.glassHighlight === 'transparent') {
    return <View pointerEvents="none" style={styles.hiddenMarker} testID={`worker-home-material-depth-${surface}-opaque-fallback`} />
  }

  return (
    <View
      pointerEvents="none"
      style={[
        styles.workerHomeMaterialDepthPlane,
        surface === 'sheet' ? styles.workerHomeMaterialDepthPlaneSheet : null,
        workerHomeMaterialDepthPlaneSurface(tokens, surface),
      ]}
      testID={`worker-home-material-depth-${surface}-${depth}-layer-${layer}`}
    />
  )
}

export function WorkerHomeMaterialSubstrate({ surface }: { surface: 'map' | 'readiness' | 'sheet' }) {
  const { tokens } = useWorkerUi()
  const role = workerHomeMaterialRole(surface)
  const layer = workerHomeLiquidMaterialSystem.surfaces[surface].glassLayer

  if (tokens.glassHighlight === 'transparent') {
    return <View pointerEvents="none" style={styles.hiddenMarker} testID={`worker-home-material-${surface}-opaque-fallback`} />
  }

  return (
    <>
      <View
        pointerEvents="none"
        style={[
          styles.workerHomeMaterialSubstrate,
          surface === 'readiness' || surface === 'sheet' ? styles.workerHomeMaterialSubstrateReadiness : null,
          workerHomeMaterialSubstrateSurface(tokens, surface),
        ]}
        testID={`worker-home-material-${surface}-${role}-layer-${layer}`}
      />
      <View
        pointerEvents="none"
        style={[
          styles.workerHomeMaterialTopEdge,
          surface === 'readiness' || surface === 'sheet' ? styles.workerHomeMaterialTopEdgeReadiness : null,
          workerHomeMaterialTopEdge(tokens, surface),
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.workerHomeMaterialBottomEdge,
          surface === 'readiness' || surface === 'sheet' ? styles.workerHomeMaterialBottomEdgeReadiness : null,
          workerHomeMaterialBottomEdge(tokens, surface),
        ]}
      />
    </>
  )
}

export function WorkerHomeMapMaterialContours({ expanded = false }: { expanded?: boolean } = {}) {
  const { tokens } = useWorkerUi()
  const viewBox = expanded ? '0 0 520 620' : '0 0 390 216'
  const contourColor = tokens.mode === 'dark' ? 'rgba(190,210,205,0.11)' : 'rgba(20,73,66,0.10)'
  const contourHighlight = tokens.mode === 'dark' ? 'rgba(105,222,198,0.09)' : 'rgba(255,255,255,0.58)'
  const gridColor = tokens.mode === 'dark' ? 'rgba(190,210,205,0.055)' : 'rgba(20,73,66,0.055)'

  if (expanded) {
    return (
      <Svg pointerEvents="none" preserveAspectRatio="none" style={styles.workerHomeMapMaterialContours} testID="worker-home-map-material-contours-expanded" viewBox={viewBox}>
        <Path d="M28 124 C120 62 208 86 292 58 S430 18 520 74" stroke={contourHighlight} strokeLinecap="round" strokeWidth={1.4} opacity={0.68} fill="none" />
        <Path d="M-20 216 C104 156 204 170 302 132 S430 102 560 146" stroke={contourColor} strokeLinecap="round" strokeWidth={1.1} opacity={0.68} fill="none" />
        <Path d="M-18 384 C98 318 210 352 312 292 S450 236 548 272" stroke={contourColor} strokeLinecap="round" strokeWidth={1.1} opacity={0.58} fill="none" />
        <Path d="M82 -24 C112 142 108 324 68 652 M222 -40 C206 152 220 340 252 660 M414 -30 C374 134 392 332 472 664" stroke={gridColor} strokeLinecap="round" strokeWidth={1} opacity={0.66} fill="none" />
        <Path d="M52 520 C156 464 264 518 348 456 S456 412 540 436" stroke={contourHighlight} strokeLinecap="round" strokeWidth={1} opacity={0.46} fill="none" />
      </Svg>
    )
  }

  return (
    <Svg pointerEvents="none" preserveAspectRatio="none" style={styles.workerHomeMapMaterialContours} testID="worker-home-map-material-contours" viewBox={viewBox}>
      <Path d="M18 42 C76 18 126 28 184 20 S292 -4 390 34" stroke={contourHighlight} strokeLinecap="round" strokeWidth={1.2} opacity={0.62} fill="none" />
      <Path d="M-14 92 C64 54 132 74 198 48 S304 20 408 58" stroke={contourColor} strokeLinecap="round" strokeWidth={1} opacity={0.62} fill="none" />
      <Path d="M-18 172 C78 126 142 166 220 132 S314 106 408 138" stroke={contourColor} strokeLinecap="round" strokeWidth={1} opacity={0.52} fill="none" />
      <Path d="M70 -18 C88 56 90 136 70 234 M178 -18 C166 58 174 142 204 236 M310 -18 C284 60 298 144 354 238" stroke={gridColor} strokeLinecap="round" strokeWidth={0.9} opacity={0.62} fill="none" />
    </Svg>
  )
}

export function MotionSweep({ testID }: { testID?: string }) {
  const { tokens } = useWorkerUi()
  const { reduceMotion, reduceTransparency } = useGlassAccessibility()

  if (reduceMotion || reduceTransparency) return null

  return <View pointerEvents="none" style={[styles.motionSweep, { backgroundColor: tokens.sheen, opacity: 0.12 }]} testID={testID} />
}

export function Metric({ label, value }: { label: string; value: string }) {
  const { tokens } = useWorkerUi()

  return (
    <View style={[styles.metric, { backgroundColor: tokens.glassStrong, borderColor: tokens.border }]}>
      <Text adjustsFontSizeToFit minimumFontScale={0.72} style={[styles.metricValue, { color: tokens.ink }]} numberOfLines={1}>
        {value}
      </Text>
      <Text adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.metricLabel, { color: tokens.subtle }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

export function WorkerUtilityIcon({
  active,
  frameSize,
  icon,
  inverse,
  size,
  small,
  style,
}: {
  active?: boolean
  frameSize: number
  icon: WorkerIconName
  inverse?: boolean
  size: number
  small?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const imageIcon = workerUtilityImageIcons[icon]

  if (imageIcon) {
    return <WorkerImageIcon frameSize={frameSize} name={imageIcon} size={size} style={style} />
  }

  return <Icon active={active} inverse={inverse} name={icon} small={small} />
}

export function WorkerImageIcon({ frameSize, name, size, style }: { frameSize?: number; name: WorkerImageIconName; size: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View pointerEvents="none" style={[styles.workerImageIconStage, { height: frameSize ?? size, width: frameSize ?? size }, style]}>
      <Image
        contentFit="contain"
        source={workerImageIcons[name]}
        style={{ height: size, width: size }}
      />
    </View>
  )
}

export function PressButton({
  disabled = false,
  label,
  material = 'standard',
  onPress,
  secondary = false,
  testID,
}: {
  disabled?: boolean
  label: string
  material?: GlassMaterial
  onPress: () => void
  secondary?: boolean
  testID?: string
}) {
  const { tokens } = useWorkerUi()
  const reduceGlass = workerHasReducedGlass(tokens)
  const disabledLiquidPrimary = disabled && material === 'liquid' && !secondary
  const primarySurface = disabledLiquidPrimary
    ? workerHomeDisabledPrimaryButtonSurface(tokens)
    : material === 'liquid'
      ? workerHomeLiquidPrimaryButtonSurface(tokens)
      : workerPrimaryButtonSurface(tokens)

  return (
    <GlassPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      active={!secondary}
      disabled={disabled}
      material={material}
      mode={tokens.mode}
      onPress={onPress}
      pressedStyle={!secondary ? styles.pressButtonPressedPrimary : null}
      style={[
        styles.pressButton,
        secondary ? styles.pressButtonSecondary : null,
        secondary ? workerSecondaryButtonSurface(tokens) : primarySurface,
        disabled ? (disabledLiquidPrimary ? styles.disabledButtonLiquid : styles.disabledButton) : null,
      ]}
      testID={testID}
      variant="control"
    >
      {material === 'liquid' && !secondary && !disabled && !reduceGlass ? <View pointerEvents="none" style={[styles.liquidButtonSheen, workerHomeLiquidButtonSheen(tokens)]} /> : null}
      <Text adjustsFontSizeToFit minimumFontScale={0.84} numberOfLines={1} style={[secondary ? styles.pressButtonTextSecondary : styles.pressButtonTextPrimary, { color: secondary ? tokens.primary : disabledLiquidPrimary ? tokens.muted : tokens.primaryText }]}>{label}</Text>
    </GlassPressable>
  )
}

export function Icon({ active = false, dock = false, inverse = false, name, small = false }: { active?: boolean; dock?: boolean; inverse?: boolean; name: WorkerIconName; small?: boolean }) {
  const { tokens } = useWorkerUi()
  const dockColor = tokens.mode === 'dark' ? (active ? '#CFF7EE' : '#8FB0AA') : active ? '#034D44' : '#66827B'
  const color = inverse ? '#FFFFFF' : dock ? dockColor : active ? tokens.primary : tokens.muted
  const accent = inverse ? 'rgba(255,255,255,0.86)' : dock ? color : active ? tokens.copper : tokens.aqua
  const size = dock ? 20 : small ? 18 : 25
  const stroke = dock ? 2.25 : small ? 1.8 : 2

  return (
    <Svg width={size} height={size} viewBox="0 0 25 25" fill="none" testID="worker-dock-icon-system-v3">
      {name === 'back' ? <Path d="M15.5 18.5 9.5 12.5l6-6" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" /> : null}
      {name === 'home' ? (
        <>
          <Path d="M5.5 12.2 12.5 6l7 6.2v7.2H5.5v-7.2Z" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M10.2 19.4v-4.2h4.6v4.2" stroke={accent} strokeWidth={stroke} strokeLinecap="round" />
        </>
      ) : null}
      {name === 'jobs' || name === 'brief' ? (
        <>
          <Rect x={6} y={6.5} width={13} height={12.5} rx={3.2} stroke={color} strokeWidth={stroke} />
          <Path d="M9.4 10.2h6.2M9.4 14h4.8" stroke={accent} strokeWidth={stroke} strokeLinecap="round" />
        </>
      ) : null}
      {name === 'chat' ? (
        <>
          <Path d="M6.5 7.2h12v8.3h-5.1l-3.7 3v-3H6.5V7.2Z" stroke={color} strokeWidth={stroke} strokeLinejoin="round" />
          <Path d="M9.4 10.5h6.2M9.4 13.2h3.8" stroke={accent} strokeWidth={stroke} strokeLinecap="round" />
        </>
      ) : null}
      {name === 'money' || name === 'bank' ? (
        <>
          <Rect x={5.8} y={7.2} width={13.4} height={10.6} rx={2.8} stroke={color} strokeWidth={stroke} />
          <Circle cx={12.5} cy={12.5} r={2.1} stroke={accent} strokeWidth={stroke} />
        </>
      ) : null}
      {name === 'trend' ? (
        <>
          <Path d="M5.2 19.2h14.6" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
          <Path d="M7.4 16.6V12M12.5 16.6V8.4M17.6 16.6v-6" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
          <Path d="m7.4 11.8 3.1-3.1 2.6 2.4 4.5-5.2" stroke={accent} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : null}
      {name === 'person' ? (
        <>
          <Path d="M7.1 20c.9-2.5 2.9-3.7 5.4-3.7s4.5 1.2 5.4 3.7" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
          <Circle cx={12.5} cy={9.4} r={3.1} stroke={accent} strokeWidth={stroke} />
        </>
      ) : null}
      {name === 'bolt' ? <Path d="M13.5 4.8 7.8 13h4l-1.2 7.2 6.1-9h-4l.8-6.4Z" stroke={color} strokeWidth={stroke} strokeLinejoin="round" /> : null}
      {name === 'water' ? (
        <>
          <Path d="M12.5 4.8c3.1 3.5 5 6.2 5 9.1a5 5 0 0 1-10 0c0-2.9 1.9-5.6 5-9.1Z" stroke={color} strokeWidth={stroke} strokeLinejoin="round" />
          <Path d="M9.7 14.2c.8 1.3 2.1 1.9 3.8 1.6" stroke={accent} strokeWidth={stroke} strokeLinecap="round" />
        </>
      ) : null}
      {name === 'plug' ? (
        <>
          <Path d="M9.4 5.6v5.2M15.6 5.6v5.2" stroke={accent} strokeWidth={stroke} strokeLinecap="round" />
          <Path d="M8.2 10.6h8.6v3.3a4.3 4.3 0 0 1-4.3 4.3 4.3 4.3 0 0 1-4.3-4.3v-3.3Z" stroke={color} strokeWidth={stroke} strokeLinejoin="round" />
          <Path d="M12.5 18.2v2.2" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
        </>
      ) : null}
      {name === 'faucet' ? (
        <>
          <Path d="M6.2 9.2h7.2c2.4 0 4 1.5 4 3.8v1.1" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M8.2 6.6h5.2M10.8 6.6v2.6M5.8 12.2h4.8" stroke={accent} strokeWidth={stroke} strokeLinecap="round" />
          <Path d="M17.4 15.2c1.3 1.3 2 2.3 2 3.1a2 2 0 0 1-4 0c0-.8.7-1.8 2-3.1Z" stroke={accent} strokeWidth={stroke} strokeLinejoin="round" />
        </>
      ) : null}
      {name === 'pin' ? (
        <>
          <Circle cx={12.5} cy={10.5} r={4.2} stroke={color} strokeWidth={stroke} />
          <Path d="M12.5 14.6v5.1" stroke={accent} strokeWidth={stroke} strokeLinecap="round" />
        </>
      ) : null}
      {name === 'plus' ? (
        <>
          <Path d="M12.5 6.4v12.2" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
          <Path d="M6.4 12.5h12.2" stroke={accent} strokeWidth={stroke} strokeLinecap="round" />
        </>
      ) : null}
      {name === 'mic' ? (
        <>
          <Path d="M9.6 6.9a2.9 2.9 0 0 1 5.8 0v5.2a2.9 2.9 0 0 1-5.8 0V6.9Z" stroke={color} strokeWidth={stroke} strokeLinejoin="round" />
          <Path d="M6.9 11.8c0 3.1 2.3 5.3 5.6 5.3s5.6-2.2 5.6-5.3M12.5 17.1v3.1M9.6 20.2h5.8" stroke={accent} strokeWidth={stroke} strokeLinecap="round" />
        </>
      ) : null}
      {name === 'map' ? (
        <>
          <Path d="m5.8 8.5 4-2 5.4 2.2 4-2v10l-4 2-5.4-2.2-4 2v-10Z" stroke={color} strokeWidth={stroke} strokeLinejoin="round" />
          <Path d="M9.8 6.5v10M15.2 8.8v10" stroke={accent} strokeWidth={stroke} strokeLinecap="round" />
        </>
      ) : null}
      {name === 'clock' ? (
        <>
          <Circle cx={12.5} cy={12.5} r={7} stroke={color} strokeWidth={stroke} />
          <Path d="M12.5 8.6v4.2l3 1.7" stroke={accent} strokeWidth={stroke} strokeLinecap="round" />
        </>
      ) : null}
      {name === 'check' || name === 'shield' ? (
        <>
          <Path d="M12.5 4.8 18.5 7v5.3c0 3.4-2.2 5.9-6 7.5-3.8-1.6-6-4.1-6-7.5V7l6-2.2Z" stroke={color} strokeWidth={stroke} strokeLinejoin="round" />
          <Path d="m9.5 12.6 2 2.1 4-4.5" stroke={accent} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : null}
      {name === 'tools' ? (
        <>
          <Path d="M7.2 17.8 17.8 7.2M15.8 5.8l3.4 3.4M5.8 15.8l3.4 3.4" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
          <Path d="M8.2 6.2 11 9" stroke={accent} strokeWidth={stroke} strokeLinecap="round" />
        </>
      ) : null}
      {name === 'broom' ? (
        <>
          <Path d="M15.8 5.6 9.6 13" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
          <Path d="m8.5 12.6 4.2 3.5" stroke={accent} strokeWidth={stroke} strokeLinecap="round" />
          <Path d="M7.2 13.8 12 18l-1.2 1.4c-1.4.6-3 .5-4.7-.4l-1.3-1.1 2.4-4.1Z" stroke={color} strokeWidth={stroke} strokeLinejoin="round" />
          <Path d="m6.3 17.2 2.2 1.9" stroke={accent} strokeWidth={stroke} strokeLinecap="round" />
        </>
      ) : null}
      {name === 'document' ? (
        <>
          <Path d="M7.5 5.8h7.2l2.8 2.8v10.6h-10V5.8Z" stroke={color} strokeWidth={stroke} strokeLinejoin="round" />
          <Path d="M10 11.2h5M10 14.4h4" stroke={accent} strokeWidth={stroke} strokeLinecap="round" />
        </>
      ) : null}
      {name === 'moon' ? <Path d="M17.8 16.4A7 7 0 0 1 8.6 7.2a6.8 6.8 0 1 0 9.2 9.2Z" stroke={color} strokeWidth={stroke} strokeLinejoin="round" /> : null}
      {name === 'sun' ? (
        <>
          <Circle cx={12.5} cy={12.5} r={3.5} stroke={color} strokeWidth={stroke} />
          <Path d="M12.5 4.5v2M12.5 18.5v2M4.5 12.5h2M18.5 12.5h2M6.8 6.8l1.4 1.4M16.8 16.8l1.4 1.4M18.2 6.8l-1.4 1.4M8.2 16.8l-1.4 1.4" stroke={accent} strokeWidth={stroke} strokeLinecap="round" />
        </>
      ) : null}
      {name === 'globe' ? (
        <>
          <Circle cx={12.5} cy={12.5} r={7} stroke={color} strokeWidth={stroke} />
          <Path d="M5.8 12.5h13.4M12.5 5.5c2 2 3 4.3 3 7s-1 5-3 7c-2-2-3-4.3-3-7s1-5 3-7Z" stroke={accent} strokeWidth={stroke} strokeLinecap="round" />
        </>
      ) : null}
      {name === 'send' ? <Path d="M5.4 12.8 19.4 5.8l-4.3 13.4-3.1-5.2-6.6-1.2Z" stroke={active ? tokens.primaryText : color} strokeWidth={stroke} strokeLinejoin="round" /> : null}
      {name === 'spark' ? <Path d="M12.5 4.8l1.7 5.1 5.1 1.7-5.1 1.7-1.7 5.1-1.7-5.1-5.1-1.7 5.1-1.7 1.7-5.1Z" stroke={color} strokeWidth={stroke} strokeLinejoin="round" /> : null}
    </Svg>
  )
}

export function WorkerChatPlusIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  )
}

export function WorkerChatExitIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M7.5 7.5l9 9M16.5 7.5l-9 9" stroke={color} strokeWidth={2.15} strokeLinecap="round" />
    </Svg>
  )
}

export function WorkerChatMicIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3.5a3.3 3.3 0 0 0-3.3 3.3v4.4a3.3 3.3 0 0 0 6.6 0V6.8A3.3 3.3 0 0 0 12 3.5Z" stroke={color} strokeWidth={2} />
      <Path d="M5.7 10.7a6.3 6.3 0 0 0 12.6 0M12 17v3.5M9.2 20.5h5.6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

export function WorkerChatSendIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M22 2 11 13" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="m22 2-7 20-4-9-9-4 20-7Z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

export function useWorkerUi() {
  const context = use(WorkerUiContext)
  if (!context) throw new Error('useWorkerUi must be used inside WorkerFrame')
  return context
}
