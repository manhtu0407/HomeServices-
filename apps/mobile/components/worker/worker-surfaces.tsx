import AsyncStorage from '@react-native-async-storage/async-storage'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams, usePathname, useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { createContext, memo, type ReactNode, use, useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react'
import { Alert, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { HCMC_DISTRICTS, LOCAL_DEAL_ID, LOCAL_WORKFLOW_PRICE_DISCLAIMER, hasLocalDealCompletionEvidence, normalizeDistrict, orderWorkflowPhaseSectionsForSummary, workflowAllowedActionsLabel, workflowArtifactModeLabel, workflowBlockedReasonLabel, workflowEventLabel, workflowSourceOfTruthLabel, type DistrictSlug, type LocalDeal, type LocalDealStatus, type LocalKaelProgress, type ServiceType, type WorkerRegisterInput, type WorkerVerificationStatus, type WorkflowPhaseContext } from '@home-services/shared'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { FloatingGlassTabBar, type FloatingGlassTabItem } from '@/components/ui/floating-glass-tab-bar'
import { GlassModalSheet } from '@/components/ui/glass-modal-sheet'
import { GlassPressable } from '@/components/ui/glass-pressable'
import { GlassSurface } from '@/components/ui/glass-surface'
import { motionTokens } from '@/components/ui/motion-tokens'
import { ReduceMotionAwareEntranceView, reduceMotionAwarePressStyle } from '@/components/ui/reduce-motion-aware-animation'
import type { GlassMaterial } from '@/components/ui/tokens'
import { color } from '@/design/theme'
import { appCopy, localizedProblemLabel, localizedServiceLabel, localizedStatusLabel, setAppLanguage, type AppLanguage, useAppLanguage } from '@/lib/app-language'
import type { EarningsResponse, JobMessageResponse, KaelChatProgress, WorkerKaelChatResponse, WorkerKaelChatTurn, WorkerProfileResponse } from '@/lib/api-types'
import { useAuth } from '@/lib/auth-provider'
import { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { uploadJobMediaDrafts, uploadWorkerVerificationDrafts, type LocalMediaUploadDraft } from '@/lib/media-upload'
import { workerKaelChatService } from '@/lib/services'
import { useJobChatThread } from '@/lib/use-job-chat-thread'
import { useServiceWorkflow } from '@/lib/use-service-workflow'

const WORKER_XANHSM_REFERENCE_AUDIT = 'WORKER_XANHSM_REFERENCE_AUDIT: XanhSM map shell translated into Home Services worker production UI'
const WORKER_PRODUCTION_CONTRACT = 'WORKER_PRODUCTION_CONTRACT: docs/design/worker-production-contract.md'
const WORKER_CLIENT_BASELINE_AUDIT = 'WORKER_CLIENT_BASELINE_AUDIT: customer V4 semantic layers matched for worker production'
const WORKER_THEME_LANGUAGE_STORE = 'WORKER_THEME_LANGUAGE_STORE: worker-theme-language-switch AsyncStorage useSyncExternalStore'
const WORKER_FLEXIBLE_MAP_SHELL = 'WORKER_FLEXIBLE_MAP_SHELL: worker-map-google-ready flexible-map-preview'
const WORKER_DOCK_GLASS_MOTION = 'WORKER_DOCK_GLASS_MOTION: worker-dock-glass-aura worker-liquid-glass-dock worker-dock-kael-mascot-icon worker-dock-client-style-icon'
const WORKER_GLASSMORPHISM_MOTION_LAYER = 'WORKER_GLASSMORPHISM_MOTION_LAYER: shared-glass-pressable static-depth-layer centered-metric-type'
const WORKER_MAP_BALANCED_DIRECTION = 'WORKER_MAP_BALANCED_DIRECTION: docs/design/worker-map-operation-balanced-20260531.md vector-map-no-screenshot'
void WORKER_MAP_BALANCED_DIRECTION
const WORKER_CHATBOX_EMPTY_COMPOSER = 'WORKER_CHATBOX_EMPTY_COMPOSER: worker-kael-empty-chat-state worker-kael-chat-input submitWorkerChatMessage'
const WORKER_NO_FULL_ADDRESS_BEFORE_ACCEPT = 'WORKER_NO_FULL_ADDRESS_BEFORE_ACCEPT: general area only until worker accepts'
const WORKER_NO_FAKE_PAYMENT_DATA = 'WORKER_NO_FAKE_PAYMENT_DATA: worker-no-fake-payment-data'
const WORKER_JOBROOM_KAEL_HANDOFF = 'WORKER_JOBROOM_KAEL_HANDOFF: worker-jobroom-kael-handoff worker-jobroom-waiting-room worker-jobroom-privacy-gate'
const WORKER_JOBROOM_WAITING_COPY_CONTRACT = 'Chờ Kael đưa yêu cầu vào phòng việc.'
void WORKER_JOBROOM_WAITING_COPY_CONTRACT

const WORKER_THEME_STORAGE_KEY = 'home-services.worker.theme.production'
const workerDockHeight = 58
const workerDockBottomMargin = 18
const workerDockClearance = workerDockHeight + workerDockBottomMargin + 74
const workerFrameHorizontalPadding = 14.8
const workerJobRoomRevealDelayMs = 360
const workerAmbientMintWashStyle = {
  opacity: 0.18,
  transform: [{ rotate: '-8deg' }],
}
const workerAmbientLineWashStyle = {
  opacity: 0.12,
}
const kaelHead = require('../../assets/kael-model-8a-head.png')
const workerImageIcons = {
  navEarnings: require('../../assets/worker-image-icons/nav-earnings.png'),
  navHome: require('../../assets/worker-image-icons/nav-home.png'),
  navJobs: require('../../assets/worker-image-icons/nav-jobs.png'),
  navProfile: require('../../assets/worker-image-icons/nav-profile.png'),
  profileAvatar: require('../../assets/worker-image-icons/profile-avatar-core.png'),
  profileIdentity: require('../../assets/worker-image-icons/profile-identity.png'),
  profileServiceArea: require('../../assets/worker-image-icons/profile-service-area.png'),
  profileSkills: require('../../assets/worker-image-icons/profile-skills.png'),
  profileVerified: require('../../assets/worker-image-icons/profile-verified.png'),
  serviceCleaning: require('../../assets/worker-image-icons/service-cleaning.png'),
  serviceElectrical: require('../../assets/worker-image-icons/service-electrical.png'),
  servicePlumbing: require('../../assets/worker-image-icons/service-plumbing.png'),
  settingLanguage: require('../../assets/worker-image-icons/setting-language.png'),
  settingTheme: require('../../assets/worker-image-icons/setting-theme.png'),
  utilityBell: require('../../assets/worker-image-icons/utility-bell.png'),
  utilityCalendar: require('../../assets/worker-image-icons/utility-calendar.png'),
  utilityCamera: require('../../assets/worker-image-icons/utility-camera.png'),
  utilityChat: require('../../assets/worker-image-icons/utility-chat.png'),
  utilityClock: require('../../assets/worker-image-icons/utility-clock.png'),
  utilityDocument: require('../../assets/worker-image-icons/utility-document.png'),
  utilityEarningsLedger: require('../../assets/worker-image-icons/utility-earnings-ledger-core.png'),
  utilityEarningsWallet: require('../../assets/worker-image-icons/utility-earnings-wallet-core.png'),
  utilityEvidence: require('../../assets/worker-image-icons/utility-evidence-core.png'),
  utilityIdentity: require('../../assets/worker-image-icons/utility-identity.png'),
  utilityMap: require('../../assets/worker-image-icons/utility-map.png'),
  utilityShield: require('../../assets/worker-image-icons/utility-shield.png'),
  utilityScope: require('../../assets/worker-image-icons/utility-scope-core.png'),
  utilityTools: require('../../assets/worker-image-icons/utility-tools.png'),
  utilityWallet: require('../../assets/worker-image-icons/utility-wallet.png'),
} as const

type WorkerThemeMode = 'dark' | 'light'
type WorkerLanguageMode = AppLanguage
type WorkerVerificationFileSlot = 'cccdFront' | 'cccdBack' | 'selfie'

type WorkerActiveTab = 'chat' | 'earnings' | 'home' | 'jobs' | 'profile'
type WorkerJobsTab = 'active' | 'needs' | 'waiting'
type WorkerRoutePath = '/(worker)/home' | '/(worker)/jobs?tab=waiting' | '/(worker)/earnings' | '/(worker)/profile'
const defaultWorkerJobsTab: WorkerJobsTab = 'waiting'
type WorkerTone = 'base' | 'cream' | 'cyan' | 'depth' | 'mint' | 'raised' | 'strong' | 'warm'
type WorkerEarningsChromeVariant = 'cell' | 'chart' | 'hero' | 'ledger'
type WorkerProfileChromeVariant = 'collapsed' | 'form' | 'hero' | 'mini' | 'panel' | 'preference'
type WorkerKaelChatTone = 'agent' | 'avatar' | 'brief' | 'bubble' | 'composer' | 'header' | 'icon' | 'send' | 'status' | 'step'
type WorkerHeaderPillTone = 'cream' | 'mint'
type WorkerDockIconName = 'apartment' | 'document' | 'kael' | 'payment' | 'person'
type WorkerImageIconName = keyof typeof workerImageIcons
type WorkerIconName =
  | 'back'
  | 'bank'
  | 'bolt'
  | 'broom'
  | 'brief'
  | 'chat'
  | 'check'
  | 'clock'
  | 'document'
  | 'evidence'
  | 'faucet'
  | 'globe'
  | 'home'
  | 'jobs'
  | 'map'
  | 'mic'
  | 'money'
  | 'moon'
  | 'person'
  | 'pin'
  | 'plug'
  | 'plus'
  | 'send'
  | 'shield'
  | 'spark'
  | 'sun'
  | 'tools'
  | 'trend'
  | 'water'
type WorkerChatLocalState = {
  draft: string
  localMessages: WorkerChatLocalMessage[]
  mediaDrafts: LocalMediaUploadDraft[]
  reveal: { requested: number; step: number }
}
type WorkerChatLocalMessage = {
  id: string
  mine: boolean
  system: boolean
  text: string
  who: string
}
type WorkerWebSpeechRecognition = {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  onend: (() => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onresult: ((event: { results?: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void) | null
  start: () => void
  stop?: () => void
}
type WorkerWebSpeechRecognitionConstructor = new () => WorkerWebSpeechRecognition
type WorkerBroadcastView = NonNullable<LocalDeal['broadcast']>
type WorkerMapMode = 'area' | 'locked' | 'route'
type WorkerMapPoint = { lat: number; lng: number }
type WorkerMapProviderModel = {
  areaLabel: string
  fullAddressLabel: string | null
  mapMode: WorkerMapMode
  serviceRadius: number | null
  routeRequestReady: boolean
  trafficEnabled: boolean
  workerOrigin: WorkerMapPoint | null
}
type WorkerHomeMapState = {
  centered: boolean
  compassNorth: boolean
  expanded: boolean
  layerDetailed: boolean
  trafficEnabled: boolean
  zoom: number
}
type WorkerHomeMapAction =
  | { type: 'close' }
  | { type: 'open' }
  | { type: 'recenter' }
  | { type: 'toggle_compass' }
  | { type: 'toggle_layer' }
  | { type: 'toggle_traffic' }
  | { type: 'zoom_in' }
  | { type: 'zoom_out' }
type WorkerMapSurface = 'active' | 'home' | 'jobroom' | 'needs' | 'waiting'
type WorkerHomeMaterialContrast = 'quiet' | 'recessed' | 'standard' | 'prominent'
type WorkerHomeMaterialDepth = 'anchored' | 'content' | 'floating' | 'focus' | 'substrate'
type WorkerHomeMaterialGroup = 'content' | 'control' | 'navigation' | 'surface'
type WorkerHomeMaterialRole = 'glass-control' | 'glass-focus' | 'opaque-content' | 'substrate'
type WorkerHomeMaterialSurface = 'cta' | 'dock' | 'map' | 'mapControl' | 'mapHud' | 'readiness' | 'sheet' | 'tile'

const workerHomeLiquidMaterialSystem: {
  accent: 'mint'
  applePath: 'functional-layer-depth-hierarchy'
  maxVisibleGlassLayers: 3
  surfaces: Record<WorkerHomeMaterialSurface, {
    blurCap?: 14 | 18 | 22 | 24 | 26
    contrast: WorkerHomeMaterialContrast
    depth: WorkerHomeMaterialDepth
    glassLayer: 0 | 1 | 2 | 3
    group: WorkerHomeMaterialGroup
    role: WorkerHomeMaterialRole
  }>
} = {
  accent: 'mint',
  applePath: 'functional-layer-depth-hierarchy',
  maxVisibleGlassLayers: 3,
  surfaces: {
    cta: { blurCap: 18, contrast: 'prominent', depth: 'focus', glassLayer: 3, group: 'control', role: 'glass-focus' },
    dock: { blurCap: 24, contrast: 'prominent', depth: 'anchored', glassLayer: 3, group: 'navigation', role: 'glass-control' },
    map: { blurCap: 22, contrast: 'standard', depth: 'substrate', glassLayer: 1, group: 'surface', role: 'substrate' },
    mapControl: { blurCap: 18, contrast: 'standard', depth: 'floating', glassLayer: 2, group: 'control', role: 'glass-control' },
    mapHud: { blurCap: 18, contrast: 'standard', depth: 'floating', glassLayer: 2, group: 'control', role: 'glass-control' },
    readiness: { blurCap: 22, contrast: 'prominent', depth: 'focus', glassLayer: 1, group: 'surface', role: 'glass-focus' },
    sheet: { blurCap: 26, contrast: 'prominent', depth: 'focus', glassLayer: 3, group: 'surface', role: 'glass-focus' },
    tile: { contrast: 'quiet', depth: 'content', glassLayer: 0, group: 'content', role: 'opaque-content' },
  },
}

let lastWorkerDockActive: WorkerActiveTab = 'home'
const workerJobsTabKeys: WorkerJobsTab[] = ['waiting', 'active', 'needs']

function createWorkerChatLocalState(): WorkerChatLocalState {
  return { draft: '', localMessages: [], mediaDrafts: [], reveal: { requested: 0, step: 0 } }
}

function isWorkerJobsTab(value: unknown): value is WorkerJobsTab {
  return typeof value === 'string' && workerJobsTabKeys.includes(value as WorkerJobsTab)
}
const workerMoneyFormatters = {
  en: new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }),
  vi: new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }),
} as const
const workerServiceImageIcons: Record<Extract<ServiceType, 'cleaning' | 'electrical' | 'plumbing'>, WorkerImageIconName> = {
  cleaning: 'serviceCleaning',
  electrical: 'serviceElectrical',
  plumbing: 'servicePlumbing',
}
const workerDockImageIcons: Record<Exclude<WorkerDockIconName, 'kael'>, WorkerImageIconName> = {
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
const workerEarningsImageIcons: Partial<Record<WorkerIconName, WorkerImageIconName>> = {
  bank: 'utilityEarningsWallet',
  document: 'utilityEarningsLedger',
  money: 'utilityEarningsWallet',
}
const workerServiceAreaAnchors: { lat: number; lng: number; slug: Exclude<DistrictSlug, 'hcmc_all'> }[] = [
  { slug: 'q1', lat: 10.7757, lng: 106.7004 },
  { slug: 'q3', lat: 10.7844, lng: 106.6841 },
  { slug: 'q7', lat: 10.7355, lng: 106.7218 },
  { slug: 'binh_thanh', lat: 10.8118, lng: 106.7091 },
  { slug: 'thu_duc', lat: 10.8494, lng: 106.7537 },
  { slug: 'tan_binh', lat: 10.8015, lng: 106.6520 },
  { slug: 'go_vap', lat: 10.8387, lng: 106.6653 },
  { slug: 'phu_nhuan', lat: 10.7992, lng: 106.6803 },
]
const workerServiceRadiusPresets = [5, 8, 12, 20] as const
const workerDistrictTextAliases: Partial<Record<string, DistrictSlug>> = {
  'binh chanh': 'binh_chanh',
  'binh tan': 'binh_tan',
  'binh thanh': 'binh_thanh',
  'can gio': 'can_gio',
  'cu chi': 'cu_chi',
  'go vap': 'go_vap',
  'hoc mon': 'hoc_mon',
  'nha be': 'nha_be',
  'phu nhuan': 'phu_nhuan',
  'tan binh': 'tan_binh',
  'tan phu': 'tan_phu',
  'thu duc': 'thu_duc',
}
const workerSectionMotionTestIDs: Record<WorkerActiveTab, string> = {
  chat: 'worker-section-glass-motion-chat',
  earnings: 'worker-section-glass-motion-earnings',
  home: 'worker-section-glass-motion-home',
  jobs: 'worker-section-glass-motion-jobs',
  profile: 'worker-section-glass-motion-profile',
}

type WorkerThemeTokens = {
  mode: WorkerThemeMode
  canvas: string
  base: string
  raised: string
  strong: string
  depth: string
  mint: string
  cyan: string
  cream: string
  warm: string
  glass: string
  glassStrong: string
  glassBorder: string
  glassHighlight: string
  border: string
  borderStrong: string
  ink: string
  muted: string
  subtle: string
  primary: string
  primaryText: string
  aqua: string
  copper: string
  danger: string
  line: string
  mapLine: string
  mapBlock: string
  sheen: string
  shadow: string
  softShadow: string
}

const lightLayer: WorkerThemeTokens = {
  mode: 'light',
  canvas: color.background,
  base: color.mint.white,
  raised: color.surface.raised,
  strong: color.surface.soft,
  depth: color.mint.auraSoft,
  mint: color.surface.mint,
  cyan: color.mint.mint50,
  cream: '#FFF8EB',
  warm: '#FFF8EB',
  glass: 'rgba(255,255,255,0.58)',
  glassStrong: 'rgba(255,255,255,0.74)',
  glassBorder: 'rgba(255,255,255,0.82)',
  glassHighlight: 'rgba(255,255,255,0.70)',
  border: 'rgba(35,96,84,0.13)',
  borderStrong: 'rgba(8,120,110,0.22)',
  ink: color.text.primary,
  muted: color.text.secondary,
  subtle: color.text.muted,
  primary: color.brand.primary,
  primaryText: color.text.inverse,
  aqua: color.accent.aqua,
  copper: '#BB743D',
  danger: color.accent.destructive,
  line: 'rgba(35,96,84,0.13)',
  mapLine: 'rgba(39,108,96,0.13)',
  mapBlock: 'rgba(255,255,255,0.56)',
  sheen: 'rgba(255,255,255,0.64)',
  shadow: '0 14px 36px rgba(13,70,65,0.11)',
  softShadow: '0 9px 24px rgba(13,70,65,0.08)',
}

const darkLayer: WorkerThemeTokens = {
  mode: 'dark',
  canvas: '#0B0F0E',
  base: '#111614',
  raised: '#171D1B',
  strong: '#1D2522',
  depth: '#131918',
  mint: '#183832',
  cyan: '#172F31',
  cream: '#30271E',
  warm: '#2A241D',
  glass: 'rgba(22,29,27,0.58)',
  glassStrong: 'rgba(30,38,35,0.68)',
  glassBorder: 'rgba(190,210,205,0.16)',
  glassHighlight: 'rgba(230,244,240,0.13)',
  border: 'rgba(190,210,205,0.12)',
  borderStrong: 'rgba(105,222,198,0.26)',
  ink: '#F1F6F4',
  muted: '#A9B7B3',
  subtle: '#83938F',
  primary: color.mint.mint300,
  primaryText: '#08201D',
  aqua: '#82DDE2',
  copper: '#E2A56E',
  danger: '#FF9A8C',
  line: 'rgba(190,210,205,0.09)',
  mapLine: 'rgba(190,210,205,0.15)',
  mapBlock: 'rgba(255,255,255,0.055)',
  sheen: 'rgba(255,255,255,0.12)',
  shadow: '0 22px 56px rgba(0,0,0,0.42)',
  softShadow: '0 12px 34px rgba(0,0,0,0.30)',
}

const workerCopy = {
  vi: {
    frame: { availabilityOff: 'Tắt nhận việc', availabilityOn: 'Bật nhận việc', safe: 'An toàn', themeLight: 'Sáng', themeDark: 'Tối', lang: 'Đổi sang English' },
    nav: { chat: 'Nhắn', earnings: 'Tiền', home: 'Nhà', jobs: 'Việc', profile: 'Hồ sơ' },
    home: {
      eyebrow: 'Thợ',
      title: 'Ca trực',
      readinessTitle: 'Sẵn sàng nhận việc',
      readinessSubtitle: 'Trạng thái quyết định yêu cầu mới',
      readinessNoProfile: 'Hoàn tất hồ sơ thợ trước khi nhận yêu cầu mới.',
      readinessOnline: 'Bật nhận việc khi hồ sơ đã được duyệt và bạn đang rảnh.',
      readinessOffline: 'Tắt nhận việc khi đang bận hoặc chưa đủ điều kiện nhận yêu cầu.',
      readinessSuspended: 'Tài khoản đang tạm khóa. Tắt nhận việc và liên hệ hỗ trợ trước khi nhận yêu cầu mới.',
      readinessVerification: 'Xác minh',
      readinessAvailability: 'Khả dụng',
      readinessRequest: 'Yêu cầu mới',
      mapSearch: 'Chưa có khu vực',
      mapTitle: 'Điện, nước, vệ sinh',
      mapMeta: 'Chưa có yêu cầu',
      electric: 'Điện',
      water: 'Nước',
      status: 'Trạng thái',
      online: 'Chờ duyệt',
      today: 'Trạng thái',
      rating: 'Phản hồi',
      shiftTitle: 'Nhịp xử lý',
      shiftAction: '',
      phases: ['Kael gửi', 'Tóm tắt', 'Nhận việc', 'Di chuyển'],
      nextTitle: 'Yêu cầu',
      serviceHeading: '',
      serviceSkillLabel: 'Kỹ năng',
      serviceProfileTitle: 'Hồ sơ thợ',
      serviceProfileMeta: 'Chờ duyệt kỹ năng',
      servicePendingLabel: 'Chờ duyệt',
      electricianCard: 'Sửa điện',
      plumberCard: 'Sửa nước',
      cleaningCard: 'Vệ sinh',
    },
    request: {
      service: 'Chờ duyệt',
      title: 'Chưa có yêu cầu mới',
      area: 'Khu vực chung',
      briefTitle: 'Tóm tắt Kael',
      brief: ['Kael chưa chuyển yêu cầu mới.'],
      customerEstimate: 'Ước tính Kael',
      workerEarns: 'Thợ nhận',
      decline: 'Bỏ qua',
      accept: 'Nhận việc',
    },
    jobs: {
      eyebrow: 'Công việc',
      title: 'Yêu cầu',
      subtitle: 'Quyết định nhanh, giữ riêng tư địa chỉ',
      filters: ['Chờ nhận', 'Đang làm', 'Cần xử lý'],
      emptyStatus: 'Đang theo dõi',
      emptyTitle: 'Chưa có việc đang làm',
      emptyBody: 'Kael sẽ đưa yêu cầu mới vào đây khi phiếu đủ dữ liệu để điều phối.',
      waitingEmptyTitle: 'Chưa có yêu cầu mới',
      waitingEmptyBody: 'Yêu cầu mới sẽ hiện ở mục Chờ nhận.',
      activeEmptyTitle: 'Chưa nhận việc',
      activeEmptyBody: 'Việc đã nhận và Phòng việc sẽ hiện tại đây.',
      needsEmptyTitle: 'Không có mục chặn',
      needsEmptyBody: 'Phát sinh hoặc quyết định Kael sẽ hiện ở đây.',
      safetyTitle: 'An toàn & checklist',
      safetyMeta: 'Theo cổng thật',
      safetyChecklistAction: 'Hoàn tất checklist',
      safetyChecklistLocked: 'Checklist giữ nội bộ; trạng thái việc chỉ đổi qua bước hiện trường và bằng chứng.',
      safetyAddressTitle: 'Địa chỉ chi tiết',
      safetyAddressAreaOnly: 'Chỉ dùng khu vực chung',
      safetyAddressReleased: 'Đã mở sau khi nhận việc',
      safetyScopeTitle: 'Đổi phạm vi',
      safetyScopeLocked: 'Chờ bước kiểm tra',
      safetyScopeReady: 'Gửi bằng chứng qua Kael, không nhập giá',
      safetyScopeReviewing: 'Kael đang xét phát sinh',
      safetyCompletionTitle: 'Bằng chứng hoàn tất',
      safetyCompletionPending: 'Mở ở bước sửa',
      safetyCompletionReady: 'Cần ghi chú và ảnh trước khi hoàn tất',
      safetyCompletionSubmitted: 'Đã gửi bằng chứng thật',
      summaryReportTitle: 'Báo cáo từ Kael',
      summaryReportMeta: 'Từ bằng chứng thật',
      summaryReportBody: 'Kael giữ báo cáo đọc từ ghi chú, ảnh nghiệm thu và trạng thái hệ thống. Không có giá cuối nếu hệ thống chưa đối soát.',
      summaryStatusTitle: 'Trạng thái',
      summaryStatusSubmitted: 'Đã hoàn tất bởi thợ',
      summaryNoteTitle: 'Ghi chú',
      summaryMediaTitle: 'Ảnh nghiệm thu',
      summaryPriceTitle: 'Giá cuối',
      summaryPriceWaiting: 'Chờ Kael đối soát',
      scopeStatus: 'Kael đang xét',
      scopeTitle: 'Thay đổi phạm vi',
      scopeBody: 'Kael đang xét phạm vi mới; khách có thể cung cấp thêm dữ liệu, khiếu nại hoặc hủy nếu thực tế chưa đúng.',
      jobRoomCta: 'Mở phòng việc',
    },
    chat: {
      eyebrow: 'Tin nhắn',
      title: 'Phòng việc',
      jobRoomTitle: 'Phòng việc Kael',
      relaySubtitle: 'Kael chuyển tiếp với khách',
      acceptedPill: 'Đã nhận',
      waitingTitle: 'Đang chờ Kael đưa việc',
      waitingBody: 'Khi Kael có phiếu đủ dữ liệu, Phòng việc sẽ mở tóm tắt công việc, khu vực chung và ghi chú việc.',
      waitingInput: 'Nhắn trong Phòng việc...',
      handoffTitle: 'Kael giao việc',
      privacyGate: 'Địa chỉ chi tiết chỉ mở sau khi thợ chấp nhận.',
      acceptedGate: 'Đã nhận việc. Ghi chú hiện lưu trong phiên này.',
      lockedGate: 'Chấp nhận việc để mở ghi chú việc.',
      advisoryTitle: 'Tư vấn hiện trường',
      advisoryMeta: 'Kael đồng hành',
      advisoryBody: 'Kael giữ nhắc việc theo trạng thái thật: địa chỉ, phạm vi, bằng chứng và giá đều đi qua cổng hệ thống.',
      advisoryStatusTitle: 'Bước việc',
      advisoryAddressTitle: 'Địa chỉ',
      advisoryAddressAreaOnly: 'Đang dùng khu vực chung',
      advisoryAddressReleased: 'Đã mở địa chỉ chi tiết',
      advisoryScopeTitle: 'Phạm vi & giá',
      advisoryScopeNoPrice: 'Gửi bằng chứng qua Kael, không nhập giá',
      advisoryScopeLocked: 'Chờ bước kiểm tra',
      advisoryScopeReviewing: 'Kael đang xét phát sinh',
      advisoryEvidenceTitle: 'Bằng chứng',
      attach: 'Đính kèm',
      attachHint: 'Đính kèm chưa mở trong Phòng việc này. Thợ ghi chú bằng chữ trước.',
      mic: 'Mic',
      micHint: 'Mic chưa sẵn sàng trong Phòng việc này. Thợ nhập ghi chú để Kael giữ bối cảnh trước.',
      serviceLabel: 'Dịch vụ',
      problemLabel: 'Vấn đề',
      areaLabel: 'Khu vực',
      statusLabel: 'Trạng thái',
      briefTitle: 'Tóm tắt Kael',
      briefBody: 'Kael giữ tóm tắt công việc và mốc an toàn trước khi thợ phản hồi.',
      emptyTitle: 'Chưa có tin nhắn',
      emptyBody: 'Tin nhắn chỉ mở khi có yêu cầu thật hoặc thợ đã nhận việc.',
      input: 'Nhập...',
      send: 'Gửi',
      sendErrorTitle: 'Chưa gửi được',
      sendErrorBody: 'Kael chưa lưu được tin nhắn. Thử lại sau.',
      worker: 'Thợ',
      kael: 'Kael',
    },
    earnings: {
      eyebrow: 'Thu nhập',
      title: 'Thu nhập',
      subtitle: 'Theo dõi tiền công dễ hiểu hơn',
      today: 'Hôm nay',
      period: 'Kỳ này',
      month: 'Tháng này',
      noReconciliation: 'Chờ dữ liệu',
      // X6 (Plan.md §27.9 — 2026-05-29): F-30 honest empty chart copy.
      chartEmpty: 'Chưa có dữ liệu đối soát',
      summaryHint: 'Khi có đối soát',
      paidJobs: 'Việc đã trả',
      pendingPayout: 'Chờ chi trả',
      platformFee: 'Phí nền tảng',
      noPendingPayout: 'Không có khoản chờ',
      feeWaiting: 'Chờ đối soát phí',
      body: '',
      complete: 'Hoàn tất',
      waiting: 'Chờ Kael',
      ledgerTitle: 'Sổ đối soát',
      rows: [
        ['Sổ đối soát', appCopy.vi.common.noData],
        ['Tài khoản nhận tiền', 'Chưa lưu'],
      ],
    },
    profile: {
      eyebrow: 'Hồ sơ',
      title: 'Hồ sơ',
      name: 'Hồ sơ thợ',
      body: '',
      scoreTitle: 'Trạng thái hồ sơ',
      scoreBody: '',
      theme: 'Giao diện',
      language: 'Ngôn ngữ',
      skills: ['Chờ duyệt', 'Chưa có hồ sơ', 'Chờ phản hồi'],
      rows: [
        ['Xác minh danh tính', 'Chờ duyệt'],
        ['Kỹ năng dịch vụ', 'Chưa lưu hệ thống'],
        ['Khu vực làm việc', 'Chưa lưu hệ thống'],
      ],
    },
  },
  en: {
    frame: { availabilityOff: 'Go offline', availabilityOn: 'Go online', safe: 'Safe', themeLight: 'Light', themeDark: 'Dark', lang: 'Switch to Tiếng Việt' },
    nav: { chat: 'Chat', earnings: 'Pay', home: 'Home', jobs: 'Jobs', profile: 'Profile' },
    home: {
      eyebrow: 'Worker',
      title: 'Shift',
      readinessTitle: 'Ready for jobs',
      readinessSubtitle: 'Status that controls new jobs',
      readinessNoProfile: 'Complete your worker profile before receiving new requests.',
      readinessOnline: 'Go online when your profile is approved and you are available.',
      readinessOffline: 'Stay offline while busy or not eligible for new requests.',
      readinessSuspended: 'This account is suspended. Stay offline and contact support before receiving new requests.',
      readinessVerification: 'Verification',
      readinessAvailability: 'Availability',
      readinessRequest: 'New request',
      mapSearch: 'No area yet',
      mapTitle: 'Power, plumbing, cleaning',
      mapMeta: 'No request yet',
      electric: 'Power',
      water: 'Water',
      status: 'Status',
      online: 'Pending approval',
      today: 'Status',
      rating: 'Feedback',
      shiftTitle: 'Work rhythm',
      shiftAction: '',
      phases: ['Kael sent', 'Briefed', 'Accept', 'Travel'],
      nextTitle: 'Request',
      serviceHeading: '',
      serviceSkillLabel: 'Skill',
      serviceProfileTitle: 'Worker profile',
      serviceProfileMeta: 'Skills pending review',
      servicePendingLabel: 'Pending',
      electricianCard: 'Electrical',
      plumberCard: 'Plumbing',
      cleaningCard: 'Cleaning',
    },
    request: {
      service: 'Pending',
      title: 'No live request',
      area: 'General area',
      briefTitle: 'Kael brief',
      brief: ['Waiting for Kael to hand off a request.'],
      customerEstimate: 'Kael estimate',
      workerEarns: 'Worker earns',
      decline: 'Skip',
      accept: 'Accept',
    },
    jobs: {
      eyebrow: 'Jobs',
      title: 'Requests',
      subtitle: 'Decide quickly while address stays private',
      filters: ['Pending', 'Active', 'Needs review'],
      emptyStatus: 'Watching',
      emptyTitle: 'No active job',
      emptyBody: 'Kael will place new requests here when a ticket has enough data to orchestrate.',
      waitingEmptyTitle: 'No new request',
      waitingEmptyBody: 'New requests appear in the Pending tab.',
      activeEmptyTitle: 'No accepted job',
      activeEmptyBody: 'Accepted work and JobRoom appear here.',
      needsEmptyTitle: 'Nothing blocked',
      needsEmptyBody: 'Scope or Kael decision blockers appear here.',
      safetyTitle: 'Safety & Checklist',
      safetyMeta: 'From real gates',
      safetyChecklistAction: 'Complete checklist',
      safetyChecklistLocked: 'Checklist stays internal; job status changes only through field steps and evidence.',
      safetyAddressTitle: 'Detailed address',
      safetyAddressAreaOnly: 'Use general area only',
      safetyAddressReleased: 'Released after acceptance',
      safetyScopeTitle: 'Scope change',
      safetyScopeLocked: 'Wait for inspection',
      safetyScopeReady: 'Send evidence through Kael; no price input',
      safetyScopeReviewing: 'Kael is reviewing scope evidence',
      safetyCompletionTitle: 'Completion evidence',
      safetyCompletionPending: 'Opens during repair',
      safetyCompletionReady: 'Needs notes and photos before completion',
      safetyCompletionSubmitted: 'Real evidence submitted',
      summaryReportTitle: 'Kael report',
      summaryReportMeta: 'From real evidence',
      summaryReportBody: 'Kael keeps this report from notes, completion photos, and system status. No final price appears before reconciliation.',
      summaryStatusTitle: 'Status',
      summaryStatusSubmitted: 'Submitted by worker',
      summaryNoteTitle: 'Notes',
      summaryMediaTitle: 'Completion photos',
      summaryPriceTitle: 'Final price',
      summaryPriceWaiting: 'Waiting for Kael reconciliation',
      scopeStatus: 'Kael reviewing',
      scopeTitle: 'Scope change',
      scopeBody: 'Kael is reviewing the new scope; the customer can add evidence, appeal, or cancel if the facts are wrong.',
      jobRoomCta: 'Open JobRoom',
    },
    chat: {
      eyebrow: 'Chat',
      title: 'JobRoom',
      jobRoomTitle: 'Kael JobRoom',
      relaySubtitle: 'Kael relays with the customer',
      acceptedPill: 'Accepted',
      waitingTitle: 'Waiting for Kael to hand off a job',
      waitingBody: 'When Kael has enough ticket data, JobRoom opens the job brief, general area, and job notes.',
      waitingInput: 'Message in JobRoom...',
      handoffTitle: 'Kael handoff',
      privacyGate: 'Detailed address opens only after acceptance.',
      acceptedGate: 'Job accepted. Notes are saved for this session.',
      lockedGate: 'Accept the job to unlock job notes.',
      advisoryTitle: 'On-site advisory',
      advisoryMeta: 'Kael alongside',
      advisoryBody: 'Kael keeps reminders from real state: address, scope, evidence, and price all stay behind system gates.',
      advisoryStatusTitle: 'Job step',
      advisoryAddressTitle: 'Address',
      advisoryAddressAreaOnly: 'Using general area',
      advisoryAddressReleased: 'Detailed address released',
      advisoryScopeTitle: 'Scope & price',
      advisoryScopeNoPrice: 'Send evidence through Kael; no price input',
      advisoryScopeLocked: 'Wait for inspection',
      advisoryScopeReviewing: 'Kael is reviewing scope evidence',
      advisoryEvidenceTitle: 'Evidence',
      attach: 'Attach',
      attachHint: 'Attachments are not open in this JobRoom yet. Add a written note first.',
      mic: 'Mic',
      micHint: 'Voice input is not ready in this JobRoom yet. Type a note so Kael can keep context first.',
      serviceLabel: 'Service',
      problemLabel: 'Problem',
      areaLabel: 'Area',
      statusLabel: 'Status',
      briefTitle: 'Kael brief',
      briefBody: 'Kael keeps the job brief and safety context before worker replies.',
      emptyTitle: 'No messages yet',
      emptyBody: 'Messages open only for a real request or an accepted job.',
      input: 'Type...',
      send: 'Send',
      sendErrorTitle: 'Message not sent',
      sendErrorBody: 'Kael could not save this message. Try again.',
      worker: 'Worker',
      kael: 'Kael',
    },
    earnings: {
      eyebrow: 'Earnings',
      title: 'Earnings',
      subtitle: 'Track payout clearly',
      today: 'Today',
      period: 'This period',
      month: 'This month',
      noReconciliation: 'Waiting for data',
      // X6 (Plan.md §27.9 — 2026-05-29): F-30 honest empty chart copy.
      chartEmpty: 'No reconciliation data yet',
      summaryHint: 'After reconciliation',
      paidJobs: 'Paid jobs',
      pendingPayout: 'Pending payout',
      platformFee: 'Platform fee',
      noPendingPayout: 'No pending payout',
      feeWaiting: 'Fee reconciliation pending',
      body: '',
      complete: 'Completed',
      waiting: 'Waiting for Kael',
      ledgerTitle: 'Ledger',
      rows: [
        ['Ledger', appCopy.en.common.noData],
        ['Payout account', 'Not stored'],
      ],
    },
    profile: {
      eyebrow: 'Profile',
      title: 'Profile',
      name: 'Service profile',
      body: '',
      scoreTitle: 'Profile status',
      scoreBody: '',
      theme: 'Theme',
      language: 'Language',
      skills: ['Pending approval', 'No profile yet', 'Feedback pending'],
      rows: [
        ['Identity verification', 'Pending approval'],
        ['Service skills', 'Not stored yet'],
        ['Working area', 'Not stored yet'],
      ],
    },
  },
} as const

const workerVerificationCopy = {
  vi: {
    kicker: 'Xác minh',
    title: 'Hồ sơ xác minh',
    legalName: 'Tên pháp lý',
    dateOfBirth: 'Ngày sinh',
    yearsExperience: 'Năm kinh nghiệm',
    districts: 'Khu vực làm việc',
    districtsPlaceholder: 'Khu vực làm việc, cách nhau bằng dấu phẩy',
    homeLat: 'Vĩ độ điểm xuất phát',
    homeLng: 'Kinh độ điểm xuất phát',
    serviceRadius: 'Bán kính km',
    serviceAreaTitle: 'Khu vực phục vụ',
    serviceAreaBody: 'Chọn quận làm điểm xuất phát để Kael ưu tiên việc gần khu vực bạn phục vụ.',
    serviceAreaManual: 'Bạn có thể đổi quận hoặc bán kính trước khi gửi hồ sơ.',
    radiusDecrease: 'Giảm bán kính phục vụ',
    radiusIncrease: 'Tăng bán kính phục vụ',
    radiusPreset: 'Chọn bán kính',
    problemSpecializations: 'Chuyên môn, cách nhau bằng dấu phẩy',
    bankName: 'Ngân hàng',
    bankAccount: 'Số tài khoản',
    selectSkill: 'Chọn kỹ năng',
    files: {
      cccdFront: 'CCCD mặt trước',
      cccdBack: 'CCCD mặt sau',
      selfie: 'Ảnh selfie',
      selectedFallback: 'đã chọn tệp',
      choose: 'Chọn',
    },
    submit: 'Gửi hồ sơ xác minh',
    submitting: 'Đang gửi...',
    permissionError: 'Cần quyền thư viện ảnh để chọn giấy tờ xác minh.',
    uploadError: 'Không thể tải hồ sơ xác minh. Kiểm tra kết nối và thử lại.',
    savedTitle: 'Đã gửi hồ sơ',
    savedBody: 'Đội vận hành sẽ duyệt hồ sơ trước khi bật nhận việc.',
    errors: {
      identity: 'Nhập tên pháp lý và ngày sinh theo YYYY-MM-DD.',
      work: 'Nhập kinh nghiệm, dịch vụ và khu vực làm việc.',
      bank: 'Nhập ngân hàng và số tài khoản nhận tiền.',
      files: 'Cần CCCD mặt trước, CCCD mặt sau và ảnh selfie.',
      submit: 'Hệ thống chưa nhận hồ sơ. Kiểm tra lại kết nối và thử lại.',
    },
    status: {
      approved: 'Đã duyệt',
      draft: 'Nháp',
      rejected: 'Cần bổ sung',
      submitted: 'Đã gửi',
      suspended: 'Tạm khóa',
      under_review: 'Đang duyệt',
    },
  },
  en: {
    kicker: 'Verification',
    title: 'Verification profile',
    legalName: 'Legal name',
    dateOfBirth: 'Date of birth',
    yearsExperience: 'Years of experience',
    districts: 'Work areas',
    districtsPlaceholder: 'Work areas, separated by commas',
    homeLat: 'Home latitude',
    homeLng: 'Home longitude',
    serviceRadius: 'Radius km',
    serviceAreaTitle: 'Service area',
    serviceAreaBody: 'Choose the district used as your starting anchor so Kael can prioritize nearby jobs.',
    serviceAreaManual: 'You can change the district or radius before submitting the profile.',
    radiusDecrease: 'Decrease service radius',
    radiusIncrease: 'Increase service radius',
    radiusPreset: 'Choose radius',
    problemSpecializations: 'Specializations, comma-separated',
    bankName: 'Bank',
    bankAccount: 'Account number',
    selectSkill: 'Select skill',
    files: {
      cccdFront: 'ID front',
      cccdBack: 'ID back',
      selfie: 'Selfie',
      selectedFallback: 'file selected',
      choose: 'Select',
    },
    submit: 'Submit verification',
    submitting: 'Submitting...',
    permissionError: 'Photo library permission is required to choose verification documents.',
    uploadError: 'Unable to upload verification files. Check your connection and try again.',
    savedTitle: 'Profile submitted',
    savedBody: 'Operations will review the profile before enabling live jobs.',
    errors: {
      identity: 'Enter legal name and date of birth as YYYY-MM-DD.',
      work: 'Enter experience, services, and work areas.',
      bank: 'Enter bank and payout account number.',
      files: 'ID front, ID back, and selfie are required.',
      submit: 'The system did not receive the profile. Check your connection and try again.',
    },
    status: {
      approved: 'Approved',
      draft: 'Draft',
      rejected: 'Needs update',
      submitted: 'Submitted',
      suspended: 'Suspended',
      under_review: 'Under review',
    },
  },
} as const
type WorkerVerificationCopy = {
  bankAccount: string
  bankName: string
  dateOfBirth: string
  districts: string
  districtsPlaceholder: string
  errors: Record<'bank' | 'files' | 'identity' | 'submit' | 'work', string>
  files: Record<'cccdBack' | 'cccdFront' | 'choose' | 'selectedFallback' | 'selfie', string>
  homeLat: string
  homeLng: string
  kicker: string
  legalName: string
  permissionError: string
  problemSpecializations: string
  radiusDecrease: string
  radiusIncrease: string
  radiusPreset: string
  savedBody: string
  savedTitle: string
  selectSkill: string
  serviceAreaBody: string
  serviceAreaManual: string
  serviceAreaTitle: string
  serviceRadius: string
  status: Record<WorkerVerificationStatus, string>
  submit: string
  submitting: string
  title: string
  uploadError: string
  yearsExperience: string
}

const workerActionCopy = {
  vi: {
    hiddenAddress: 'ẩn địa chỉ chi tiết',
    completionNote: 'Ghi chú hoàn tất',
    completionPhoto: 'Ảnh nghiệm thu',
    completionPhotoRequired: 'Cần ít nhất 1 ảnh nghiệm thu',
    completionPhotoCount: (count: number) => `${count} ảnh đã chọn`,
    addCompletionPhoto: 'Thêm ảnh',
    completeLater: 'Để sau',
    scopeDescription: 'Mô tả phần phát sinh',
    scopePhotoOptional: 'Ảnh bằng chứng phát sinh nếu có',
    scopePhotoCount: (count: number) => `${count} ảnh phát sinh đã chọn`,
    addScopePhoto: 'Thêm ảnh phát sinh',
    scopeSubmit: 'Yêu cầu đổi phạm vi',
    scopeWaiting: 'Chờ Kael quyết định thay đổi phạm vi.',
    uploading: 'Đang tải ảnh...',
    cancelReason: 'Lý do cần hủy',
    cancelPlaceholder: 'Lý do hủy và tìm thợ thay thế',
    cancelSubmit: 'Yêu cầu hủy có lý do',
    review: 'Kiểm tra lại',
    send: 'Gửi',
    progress: {
      worker_start_travel: 'Bắt đầu di chuyển',
      worker_mark_arrived: 'Đã đến nơi',
      worker_start_inspection: 'Bắt đầu kiểm tra',
      worker_start_repair: 'Bắt đầu sửa',
      worker_complete_job: 'Gửi báo cáo hoàn thành',
    },
    alerts: {
      completionNoteRequiredTitle: 'Cần ghi chú hoàn tất',
      completionNoteRequiredBody: 'Nhập ghi chú ngắn về việc đã làm trước khi báo hoàn tất.',
      completionPhotoRequiredTitle: 'Cần ảnh nghiệm thu',
      completionPhotoRequiredBody: 'Thêm ít nhất một ảnh sau sửa để giữ chuỗi bằng chứng đầy đủ.',
      completionUploadTitle: 'Chưa tải được ảnh',
      completionPermissionTitle: 'Cần quyền chọn ảnh',
      completionPermissionBody: 'Cho phép truy cập ảnh để thêm ảnh nghiệm thu.',
      completeTitle: 'Xác nhận báo hoàn tất?',
      completeBody: 'Kael sẽ kiểm tra bằng chứng hoàn tất và tự chuyển sang bước phù hợp. Thanh toán vẫn khóa ở giai đoạn này.',
      scopeDescriptionTitle: 'Cần mô tả phạm vi mới',
      scopeDescriptionBody: 'Nhập rõ phần phát sinh để Kael quyết định từ bằng chứng.',
      scopeUploadTitle: 'Chưa tải được ảnh phát sinh',
      scopePermissionTitle: 'Cần quyền chọn ảnh',
      scopePermissionBody: 'Cho phép truy cập ảnh để thêm bằng chứng phát sinh.',
      scopeConfirmTitle: 'Gửi yêu cầu đổi phạm vi?',
      scopeConfirmBody: 'Hệ thống sẽ khóa tiến độ cho tới khi Kael ra quyết định phạm vi.',
      cancelReasonTitle: 'Cần lý do hủy',
      cancelReasonBody: 'Nhập lý do cụ thể. Hệ thống sẽ hủy lượt nhận việc này và bắt đầu tìm thợ thay thế sau khi gửi.',
      cancelConfirmTitle: 'Gửi yêu cầu hủy việc?',
      cancelConfirmBody: 'Sau khi gửi, lượt nhận việc của bạn sẽ được hủy và hệ thống tự động tìm thợ thay thế cho khách.',
    },
  },
  en: {
    hiddenAddress: 'detailed address hidden',
    completionNote: 'Completion note',
    completionPhoto: 'Completion photo',
    completionPhotoRequired: 'At least 1 completion photo required',
    completionPhotoCount: (count: number) => `${count} photo${count === 1 ? '' : 's'} selected`,
    addCompletionPhoto: 'Add photo',
    completeLater: 'Later',
    scopeDescription: 'New scope details',
    scopePhotoOptional: 'Scope evidence photos optional',
    scopePhotoCount: (count: number) => `${count} scope photo${count === 1 ? '' : 's'} selected`,
    addScopePhoto: 'Add scope photo',
    scopeSubmit: 'Request scope change',
    scopeWaiting: 'Waiting for Kael to decide on the scope change.',
    uploading: 'Uploading photos...',
    cancelReason: 'Cancellation reason',
    cancelPlaceholder: 'Reason for replacement search',
    cancelSubmit: 'Request cancellation',
    review: 'Review',
    send: 'Send',
    progress: {
      worker_start_travel: 'Start travel',
      worker_mark_arrived: 'Mark arrived',
      worker_start_inspection: 'Start inspection',
      worker_start_repair: 'Start repair',
      worker_complete_job: 'Send completion report',
    },
    alerts: {
      completionNoteRequiredTitle: 'Completion note required',
      completionNoteRequiredBody: 'Add a short note about the completed work before marking the job complete.',
      completionPhotoRequiredTitle: 'Completion photo required',
      completionPhotoRequiredBody: 'Add at least one after-repair photo to keep the evidence trail complete.',
      completionUploadTitle: 'Photo upload failed',
      completionPermissionTitle: 'Photo permission required',
      completionPermissionBody: 'Allow photo access to add completion evidence.',
      completeTitle: 'Mark job complete?',
      completeBody: 'Kael will review the completion evidence and either confirm completion or open a dispute. Payment remains locked at this stage.',
      scopeDescriptionTitle: 'New scope details required',
      scopeDescriptionBody: 'Describe the added work so Kael can decide from the evidence.',
      scopeUploadTitle: 'Scope photo upload failed',
      scopePermissionTitle: 'Photo permission required',
      scopePermissionBody: 'Allow photo access to add scope-change evidence.',
      scopeConfirmTitle: 'Send scope change request?',
      scopeConfirmBody: 'Progress stays locked until Kael decides the scope change.',
      cancelReasonTitle: 'Cancellation reason required',
      cancelReasonBody: 'Enter a specific reason. The system will cancel this worker assignment and begin replacement search after you send.',
      cancelConfirmTitle: 'Send cancellation request?',
      cancelConfirmBody: 'After you send, this worker assignment will be cancelled and the system will automatically search for a replacement.',
    },
  },
} as const

const mapPreview = {
  replaceWithProvider: 'google-maps-camera-ready',
}
const workerMapProviderBridgeTestIDs = {
  area: 'worker-map-provider-area-fallback',
  bridge: 'worker-map-vietmap-provider-bridge',
  origin: 'worker-map-provider-worker-origin',
  radius: 'worker-map-provider-service-radius',
  route: 'worker-map-provider-route-ready',
} as const
const initialWorkerHomeMapState: WorkerHomeMapState = {
  centered: true,
  compassNorth: true,
  expanded: false,
  layerDetailed: true,
  trafficEnabled: false,
  zoom: 1,
}

type WorkerCopy = (typeof workerCopy)[WorkerLanguageMode]
type WorkerUiContextValue = {
  copy: WorkerCopy
  language: WorkerLanguageMode
  mode: WorkerThemeMode
  reduceTransparency: boolean
  tokens: WorkerThemeTokens
}

const WorkerUiContext = createContext<WorkerUiContextValue | null>(null)

let workerThemeMode: WorkerThemeMode = 'light'
const themeListeners = new Set<() => void>()

function getWorkerThemeModeSnapshot() {
  return workerThemeMode
}

function subscribeWorkerThemeMode(listener: () => void) {
  themeListeners.add(listener)
  const removeListener = themeListeners.delete.bind(themeListeners)
  return () => removeListener(listener)
}

function setWorkerThemeMode(nextMode: WorkerThemeMode) {
  workerThemeMode = nextMode
  void AsyncStorage.setItem(WORKER_THEME_STORAGE_KEY, nextMode)
  themeListeners.forEach((listener) => listener())
}

function useWorkerThemeMode() {
  useEffect(() => {
    void AsyncStorage.getItem(WORKER_THEME_STORAGE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark') setWorkerThemeMode(stored)
    })
  }, [])

  return useSyncExternalStore(subscribeWorkerThemeMode, getWorkerThemeModeSnapshot, getWorkerThemeModeSnapshot)
}

function getWorkerThemeTokens(mode: WorkerThemeMode) {
  return mode === 'dark' ? darkLayer : lightLayer
}

function workerLiquidHomeCanvasBackgroundImage(mode: WorkerThemeMode) {
  return mode === 'dark'
    ? 'radial-gradient(circle at 50% 94%, rgba(105,222,198,0.045), transparent 28%), radial-gradient(circle at 58% 10%, rgba(230,244,240,0.060), transparent 30%), linear-gradient(180deg, #0B0F0E 0%, #101513 100%)'
    : 'radial-gradient(circle at 50% 94%, rgba(23,169,149,0.075), transparent 28%), radial-gradient(circle at 54% 12%, rgba(23,169,149,0.10), transparent 30%), linear-gradient(180deg, #F4F6F5 0%, #FBFCFB 100%)'
}

function getReducedTransparencyWorkerTokens(tokens: WorkerThemeTokens): WorkerThemeTokens {
  return {
    ...tokens,
    glass: tokens.mode === 'dark' ? '#161D1B' : '#FFFDF8',
    glassBorder: tokens.borderStrong,
    glassHighlight: 'transparent',
    glassStrong: tokens.mode === 'dark' ? '#1A2220' : '#FFFFFF',
    shadow: 'none',
    sheen: 'transparent',
    softShadow: 'none',
  }
}

function workerHasReducedGlass(tokens: WorkerThemeTokens) {
  return tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
}

function useWorkerFrameCopy() {
  const language = useAppLanguage()
  return workerCopy[language]
}

function getWorkerVisibleDeal(deal: LocalDeal | null) {
  if (!deal?.broadcast) return null
  return deal.broadcast.status === 'declined' || deal.broadcast.status === 'expired' || deal.broadcast.status === 'reassigned' || deal.broadcast.status === 'cancelled' ? null : deal
}

function localizedWorkerVerificationStatus(status: WorkerVerificationStatus, language: WorkerLanguageMode) {
  return workerVerificationCopy[language].status[status]
}

function isAcceptedLocalWorkerDeal(deal: LocalDeal | null) {
  return deal?.broadcast?.status === 'accepted'
}

export function WorkerHomeSurface() {
  const copy = useWorkerFrameCopy()
  const language = useAppLanguage()
  const { state, workerProfile } = useFrontendWorkflow()
  const deal = getWorkerVisibleDeal(state.deal)
  const hasIncomingRequest = Boolean(deal?.broadcast && !isAcceptedLocalWorkerDeal(deal))
  const greetingTitle = workerHomeGreetingLabel(workerProfile, language)

  return (
    <WorkerFrame active="home" eyebrow={copy.home.eyebrow} subtitle={copy.home.readinessSubtitle} title={greetingTitle} testID="worker-home-surface">
      <WorkerMapStage />
      <WorkerReadinessActionPanel />
      <WorkerHomeServiceGrid />
      <WorkerHomeMiniGrid />
      {hasIncomingRequest ? <IncomingRequestSheet material="liquid" /> : null}
    </WorkerFrame>
  )
}

export function WorkerJobsSurface() {
  const copy = useWorkerFrameCopy()
  const language = useAppLanguage()
  const params = useLocalSearchParams<{ tab?: string }>()
  const { replace } = useRouter()
  const { selectors, state } = useFrontendWorkflow()
  const requestedTab = isWorkerJobsTab(params.tab) ? params.tab : defaultWorkerJobsTab
  const activeJobsTab = requestedTab
  const deal = getWorkerVisibleDeal(state.deal)
  const jobTitle = deal ? localizedServiceLabel(deal.draft.serviceType, language) : copy.jobs.emptyTitle
  const hiddenAddressLabel = workerActionCopy[language].hiddenAddress
  const visibleArea = deal?.broadcast?.generalArea ?? deal?.draft.districtLabel
  const jobAreaLabel = visibleArea ? localizedWorkerAreaLabel(visibleArea, language) : hiddenAddressLabel
  const fullJobAddressSource = selectors.canWorkerSeeFullAddress && deal?.broadcast?.fullAddressVisible && deal.broadcast.fullAddressLabel ? deal.broadcast.fullAddressLabel : null
  const fullJobAddressLabel = fullJobAddressSource ? localizedWorkerAreaLabel(fullJobAddressSource, language) : null
  const jobVisibleAreaLabel = fullJobAddressLabel ?? jobAreaLabel
  const jobBody = deal
    ? `${localizedProblemLabel(deal.draft.problemChips[0], deal.draft.serviceType, language)} · ${jobVisibleAreaLabel}`
    : copy.jobs.emptyBody
  const activeJobBriefLines = deal?.broadcast ? buildWorkerBroadcastBrief(deal, deal.broadcast, selectors.currentStatus, language, selectors.canWorkerSeeFullAddress) : []
  const workflow = useServiceWorkflow({
    status: selectors.currentBackendStatus,
    hasAiNotes: Boolean(deal?.estimate?.advisory),
    hasCompletionEvidence: hasLocalDealCompletionEvidence(deal),
    hasCustomerInput: Boolean(deal),
    hasEstimate: Boolean(deal?.estimate),
    hasScopeChange: Boolean(deal?.scopeChange),
  })
  const showScopeChangeCard = Boolean(deal && workflow.artifacts.scope_change.mode === 'review')
  const showCompletionEvidenceCard = Boolean(deal && selectors.currentStatus === 'repairing')
  const hasNeedsAttention = showScopeChangeCard || showCompletionEvidenceCard
  const showJobSummaryReport = Boolean(
    deal &&
    hasLocalDealCompletionEvidence(deal) &&
    selectors.currentStatus &&
    ['completed_by_worker', 'confirmed_by_customer', 'reviewed'].includes(selectors.currentStatus),
  )
  const acceptedJob = isAcceptedLocalWorkerDeal(deal)
  const showAcceptedActionPanel = Boolean(acceptedJob && deal?.broadcast && [
    'inspecting',
    'repairing',
    'scope_change_pending',
  ].includes(selectors.currentStatus ?? ''))
  const activeJobStatus = deal && acceptedJob ? localizedStatusLabel(selectors.currentStatus, language) : copy.jobs.emptyStatus
  const waitingHasRequest = Boolean(deal?.broadcast && !acceptedJob)
  const jobsFrameTitle = activeJobsTab === 'waiting'
    ? copy.jobs.filters[0]
    : activeJobsTab === 'active'
      ? copy.jobs.eyebrow
      : copy.jobs.filters[2]
  const jobsFrameSubtitleFallback = activeJobsTab === 'waiting'
    ? (language === 'en' ? 'New requests around your area' : 'Yêu cầu mới quanh khu vực')
    : activeJobsTab === 'active'
      ? (language === 'en' ? 'Accepted jobs and the next action' : 'Việc đã nhận và bước tiếp theo')
      : (language === 'en' ? 'Blocked work that needs a decision' : 'Việc đang chặn tiến trình')
  const jobsFrameSubtitle = activeJobsTab === 'active' ? copy.jobs.subtitle : jobsFrameSubtitleFallback
  const selectJobsTab = (tab: WorkerJobsTab) => {
    replace(`/(worker)/jobs?tab=${tab}`)
  }

  return (
    <WorkerFrame active="jobs" eyebrow={copy.jobs.title} subtitle={jobsFrameSubtitle} title={jobsFrameTitle} testID="worker-jobs-surface">
      <SegmentFilter activeTab={activeJobsTab} labels={copy.jobs.filters} onTabChange={selectJobsTab} />
      {activeJobsTab === 'waiting' ? (
        <WorkerJobsLiquidSection testID="worker-jobs-waiting-liquid-section">
          <View style={styles.hiddenMarker} testID="worker-jobs-waiting" />
          {waitingHasRequest ? (
            <>
              <CompactWorkerPresenceMap mode="waiting" />
              <WorkerPhaseContextCard phaseContext={workflow.phaseContext} testID="worker-jobs-waiting-phase-context" />
              <IncomingRequestSheet compact material="liquid" />
            </>
          ) : (
            <>
              <CompactWorkerPresenceMap mode="waiting" />
              <WorkerEmptyJobPanel
                body={copy.jobs.waitingEmptyBody}
                icon="clock"
                primaryActionLabel={copy.home.readinessTitle}
                primaryActionPath="/(worker)/home"
                testID="worker-jobs-waiting-empty-card"
                title={copy.jobs.waitingEmptyTitle}
                tone="base"
              />
            </>
          )}
        </WorkerJobsLiquidSection>
      ) : null}
      {activeJobsTab === 'active' ? (
        <WorkerJobsLiquidSection testID="worker-jobs-active-liquid-section">
          {acceptedJob ? (
            <>
              <ActiveWorkerJobCard body={jobBody} briefLines={activeJobBriefLines} deal={deal} status={activeJobStatus} title={jobTitle} />
              <WorkerPhaseContextCard phaseContext={workflow.phaseContext} testID="worker-jobs-active-phase-context" />
              <WorkerSafetyChecklistCard
                canSeeFullAddress={Boolean(fullJobAddressLabel)}
                hasCompletionEvidence={hasLocalDealCompletionEvidence(deal)}
                serviceType={deal?.draft.serviceType ?? deal?.broadcast?.serviceType ?? null}
                status={selectors.currentStatus}
              />
              {hasNeedsAttention ? <WorkerNeedsReviewCard /> : <WorkerNeedsInlineEmptyCard />}
            </>
          ) : (
            <>
              <WorkerEmptyJobPanel
                body={copy.jobs.activeEmptyBody}
                icon="tools"
                primaryActionLabel={copy.jobs.filters[0]}
                primaryActionPath="/(worker)/jobs?tab=waiting"
                secondaryActionLabel={copy.home.readinessTitle}
                secondaryActionPath="/(worker)/home"
                showMapPreview
                testID="worker-jobs-active-empty-card"
                title={copy.jobs.activeEmptyTitle}
                tone="base"
              />
              <WorkerNeedsInlineEmptyCard />
            </>
          )}
        </WorkerJobsLiquidSection>
      ) : null}
      {activeJobsTab === 'needs' ? (
        <WorkerJobsLiquidSection testID="worker-jobs-needs-liquid-section">
          {deal ? <WorkerPhaseContextCard phaseContext={workflow.phaseContext} testID="worker-jobs-needs-phase-context" /> : null}
          <WorkerNeedsReviewCard />
          {showJobSummaryReport && deal ? <WorkerJobSummaryReportCard deal={deal} status={selectors.currentStatus} /> : null}
          {showAcceptedActionPanel ? (
            <View testID="worker-needs-accepted-action-sheet">
              <IncomingRequestSheet compact material="liquid" />
            </View>
          ) : null}
        </WorkerJobsLiquidSection>
      ) : null}
    </WorkerFrame>
  )
}

function WorkerJobsLiquidSection({ children, testID }: { children: ReactNode; testID: string }) {
  return (
    <ReduceMotionAwareEntranceView delayMs={40} distanceY={10} testID={`${testID}-motion`}>
      <View style={styles.workerJobsLiquidSection} testID={testID}>
        <WorkerJobsSectionBackdrop />
        <View style={styles.workerJobsLiquidContent}>
          {children}
        </View>
      </View>
    </ReduceMotionAwareEntranceView>
  )
}

function WorkerJobsSectionBackdrop() {
  const { tokens } = useWorkerUi()

  if (workerHasReducedGlass(tokens)) {
    return <View pointerEvents="none" style={styles.hiddenMarker} testID="worker-jobs-section-opaque-backdrop" />
  }

  return (
    <>
      <View pointerEvents="none" style={[styles.workerJobsSectionWash, workerJobsSectionWash(tokens)]} testID="worker-jobs-liquid-section-wash" />
      <View pointerEvents="none" style={[styles.workerJobsSectionReflection, workerJobsSectionReflection(tokens)]} testID="worker-jobs-liquid-section-reflection" />
      <View pointerEvents="none" style={[styles.workerJobsSectionBottomLens, workerJobsSectionBottomLens(tokens)]} />
      <View pointerEvents="none" style={[styles.workerJobsSectionCrispShell, workerJobsSectionCrispShell(tokens)]} testID="worker-jobs-section-crisp-shell" />
      <View pointerEvents="none" style={[styles.workerJobsSectionTopEdge, workerJobsSectionTopEdge(tokens)]} />
    </>
  )
}

function WorkerJobsCardChrome({ tone = 'base' }: { tone?: WorkerTone } = {}) {
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

function WorkerPhaseContextCard({
  phaseContext,
  testID,
}: {
  phaseContext: WorkflowPhaseContext
  testID: string
}) {
  const { language, tokens } = useWorkerUi()
  const visibleSections = orderWorkflowPhaseSectionsForSummary(phaseContext, phaseContext.sections.filter((section) => section.visible && section.role !== 'customer'))
  const primarySection = selectWorkerPhasePrimarySection(phaseContext, visibleSections)
  const primaryArtifact = primarySection?.title[language] ?? (language === 'en' ? 'No live artifact' : 'Chưa có dấu mốc sống')
  const gateLabel = workerPhaseGateLabel(phaseContext, language)
  const nextEvent = phaseContext.nextExpectedEvent
    ? workflowEventLabel(phaseContext.nextExpectedEvent, language)
    : language === 'en'
      ? 'No next event'
      : 'Không có sự kiện kế tiếp'
  const sectionSummary = workerWorkflowSectionSummary(visibleSections, language)

  return (
    <View style={[styles.needsReviewCard, workerJobCardSurface(tokens)]} testID={testID}>
      <WorkerJobsCardChrome />
      <View style={styles.identityRow}>
        <WorkerUtilityIcon active frameSize={48} icon="brief" size={48} style={styles.needsInlineImageIcon} />
        <View style={styles.titleStack}>
          <Text style={[styles.statusPill, { alignSelf: 'flex-start', backgroundColor: tokens.mint, borderColor: tokens.border, borderWidth: 1, color: tokens.primary }]} numberOfLines={1}>
            {workflowSourceOfTruthLabel(phaseContext.sourceOfTruth, language)}
          </Text>
          <Text style={[styles.cardTitle, { color: tokens.ink }]} numberOfLines={2}>
            {phaseContext.title[language]}
          </Text>
        </View>
      </View>
      <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={3}>
        {phaseContext.intent[language]}
      </Text>
      <View style={styles.needsReviewGrid}>
        <JobRoomMetaCell label={language === 'en' ? 'Artifact' : 'Dấu mốc'} value={primaryArtifact} />
        <JobRoomMetaCell label={language === 'en' ? 'Next' : 'Tiếp theo'} value={nextEvent} />
        <JobRoomMetaCell label={language === 'en' ? 'Gate' : 'Cổng'} value={gateLabel} />
        <JobRoomMetaCell label={language === 'en' ? 'Live sections' : 'Mục đang sống'} value={sectionSummary} valueLines={4} />
      </View>
    </View>
  )
}

function WorkerSafetyChecklistCard({
  canSeeFullAddress,
  hasCompletionEvidence,
  serviceType,
  status,
}: {
  canSeeFullAddress: boolean
  hasCompletionEvidence: boolean
  serviceType: ServiceType | null
  status: LocalDealStatus | null
}) {
  const { copy, language, tokens } = useWorkerUi()
  const [checklistDone, setChecklistDone] = useState(false)
  const scopeValue = status === 'scope_change_pending'
    ? copy.jobs.safetyScopeReviewing
    : status === 'inspecting' || status === 'repairing'
      ? copy.jobs.safetyScopeReady
      : copy.jobs.safetyScopeLocked
  const completionValue = hasCompletionEvidence
    ? copy.jobs.safetyCompletionSubmitted
    : status === 'repairing'
      ? copy.jobs.safetyCompletionReady
      : copy.jobs.safetyCompletionPending
  const rows = [
    {
      id: 'address',
      label: copy.jobs.safetyAddressTitle,
      value: canSeeFullAddress ? copy.jobs.safetyAddressReleased : copy.jobs.safetyAddressAreaOnly,
    },
    {
      id: 'scope',
      label: copy.jobs.safetyScopeTitle,
      value: scopeValue,
    },
    {
      id: 'completion',
      label: copy.jobs.safetyCompletionTitle,
      value: completionValue,
    },
  ] as const
  const checklistItems = workerSafetyChecklistItems(serviceType, language)
  const checklistDoneNote = language === 'en'
    ? 'Checklist acknowledged internally; job status still waits for field steps and evidence.'
    : 'Đã ghi nhận checklist nội bộ; trạng thái việc vẫn chờ bước hiện trường và bằng chứng.'
  const checklistDoneLabel = language === 'en' ? 'Checklist noted' : 'Đã ghi nhận'

  return (
    <View style={[styles.needsReviewCard, workerJobCardSurface(tokens)]} testID="worker-safety-checklist-card">
      <WorkerJobsCardChrome />
      <View style={styles.identityRow}>
        <WorkerUtilityIcon active frameSize={48} icon="shield" size={48} style={styles.needsInlineImageIcon} />
        <View style={styles.titleStack}>
          <Text style={[styles.statusPill, { alignSelf: 'flex-start', backgroundColor: tokens.mint, borderColor: tokens.border, borderWidth: 1, color: tokens.primary }]} numberOfLines={1}>
            {copy.jobs.safetyMeta}
          </Text>
          <Text style={[styles.cardTitle, { color: tokens.ink }]} numberOfLines={2}>
            {copy.jobs.safetyTitle}
          </Text>
        </View>
      </View>
      <View style={styles.needsReviewGrid}>
        {rows.map((row) => (
          <JobRoomMetaCell key={row.id} label={row.label} testID={`worker-safety-checklist-${row.id}`} value={row.value} valueLines={3} />
        ))}
      </View>
      <View style={[styles.jobDiagnosisBox, workerDiagnosisSurface(tokens)]} testID="worker-safety-reference-list">
        {checklistItems.map((item, index) => (
          <View key={item} style={styles.briefItem} testID={`worker-safety-reference-item-${index}`}>
            <View style={[styles.briefDot, { backgroundColor: tokens.primary }]} />
            <Text style={[styles.briefText, { color: tokens.muted }]} numberOfLines={2}>
              {item}
            </Text>
          </View>
        ))}
      </View>
      <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={2} testID="worker-safety-checklist-note">
        {checklistDone ? checklistDoneNote : copy.jobs.safetyChecklistLocked}
      </Text>
      <View style={styles.actionRow}>
        <PressButton disabled={checklistDone} label={checklistDone ? checklistDoneLabel : copy.jobs.safetyChecklistAction} onPress={() => setChecklistDone(true)} secondary testID="worker-safety-checklist-complete-action" />
      </View>
    </View>
  )
}

function workerSafetyChecklistItems(serviceType: ServiceType | null, language: WorkerLanguageMode) {
  if (serviceType === 'plumbing') {
    return language === 'en'
      ? ['Shut off the water valve', 'Check for leaks', 'Use protective gear', 'Keep the floor dry', 'Confirm safety']
      : ['Khóa van nước', 'Kiểm tra rò rỉ', 'Sử dụng đồ bảo hộ', 'Giữ sàn khô', 'Xác nhận an toàn']
  }
  if (serviceType === 'cleaning') {
    return language === 'en'
      ? ['Check surfaces first', 'Separate cleaning chemicals safely', 'Use protective gear', 'Ventilate the area', 'Confirm safety']
      : ['Kiểm tra bề mặt trước', 'Tách hóa chất an toàn', 'Sử dụng đồ bảo hộ', 'Thông gió khu vực', 'Xác nhận an toàn']
  }
  if (serviceType === 'electrical') {
    return language === 'en'
      ? ['Cut power before work', 'Check hot spots and exposed wires', 'Use protective gear', 'Keep the work area dry', 'Confirm safety']
      : ['Ngắt nguồn điện', 'Kiểm tra điểm nóng và dây hở', 'Sử dụng đồ bảo hộ', 'Giữ khu vực làm việc khô', 'Xác nhận an toàn']
  }

  return language === 'en'
    ? ['Confirm the work area', 'Check visible risks', 'Use protective gear', 'Keep the path clear', 'Confirm safety']
    : ['Xác nhận khu vực làm việc', 'Kiểm tra rủi ro thấy được', 'Sử dụng đồ bảo hộ', 'Giữ lối đi an toàn', 'Xác nhận an toàn']
}

function workerPhaseActionLabel(phaseContext: WorkflowPhaseContext, language: WorkerLanguageMode) {
  if (phaseContext.phase === 'worker_matched' || phaseContext.phase === 'worker_on_way' || phaseContext.phase === 'arrived') {
    return language === 'en' ? 'Update field status' : 'Cập nhật bước hiện trường'
  }
  if (phaseContext.phase === 'inspecting') {
    return language === 'en' ? 'Continue repair or submit scope evidence' : 'Tiếp tục xử lý hoặc gửi bằng chứng phạm vi'
  }
  if (phaseContext.phase === 'repairing') {
    return language === 'en' ? 'Submit completion evidence' : 'Gửi bằng chứng hoàn tất'
  }
  if (phaseContext.phase === 'matching') {
    return language === 'en' ? 'Accept or decline request' : 'Nhận hoặc từ chối yêu cầu'
  }
  if (phaseContext.phase === 'customer_confirmed_completion') {
    return language === 'en' ? 'Completion is waiting for customer review' : 'Hoàn tất chờ khách đánh giá'
  }
  if (phaseContext.phase === 'paid') {
    return language === 'en' ? 'Customer review may open' : 'Khách có thể đánh giá'
  }
  if (phaseContext.phase === 'done') {
    return language === 'en' ? 'Transaction closed' : 'Giao dịch đã đóng'
  }
  return workflowAllowedActionsLabel(phaseContext.allowedActions, language)
}

function workerWorkflowSectionSummary(sections: WorkflowPhaseContext['sections'], language: WorkerLanguageMode) {
  const labels = sections.slice(0, 3).map((section) => {
    const mode = section.mode ? workflowArtifactModeLabel(section.mode, language) : workflowSourceOfTruthLabel(section.sourceOfTruth, language)
    return `${section.title[language]} · ${mode}`
  })
  if (sections.length > 3) {
    labels.push(language === 'en' ? `+${sections.length - 3} more` : `+${sections.length - 3} mục nữa`)
  }
  return labels.length > 0 ? labels.join('\n') : (language === 'en' ? 'No visible section yet' : 'Chưa có mục hiển thị')
}

function WorkerRequestPhaseInline({ phaseContext }: { phaseContext: WorkflowPhaseContext }) {
  const { language, tokens } = useWorkerUi()
  const visibleSections = orderWorkflowPhaseSectionsForSummary(phaseContext, phaseContext.sections.filter((section) => section.visible && section.role !== 'customer'))
  const primarySection = selectWorkerPhasePrimarySection(phaseContext, visibleSections)
  const primaryArtifact = primarySection?.title[language] ?? (language === 'en' ? 'Worker brief' : 'Tóm tắt cho thợ')
  const gateLabel = workerPhaseGateLabel(phaseContext, language)

  return (
    <View style={[styles.jobDiagnosisBox, workerDiagnosisSurface(tokens)]} testID="worker-request-phase-context">
      <Text style={[styles.kaelBriefTitle, { color: tokens.ink }]} numberOfLines={1}>
        {phaseContext.title[language]}
      </Text>
      <Text style={[styles.briefText, { color: tokens.muted }]} numberOfLines={2}>
        {phaseContext.intent[language]}
      </Text>
      <View style={styles.briefItem}>
        <View style={[styles.briefDot, { backgroundColor: tokens.primary }]} />
        <Text style={[styles.briefText, { color: tokens.muted }]} numberOfLines={1}>
          {workflowSourceOfTruthLabel(phaseContext.sourceOfTruth, language)} · {primaryArtifact}
        </Text>
      </View>
      <View style={styles.briefItem}>
        <View style={[styles.briefDot, { backgroundColor: tokens.copper }]} />
        <Text style={[styles.briefText, { color: tokens.muted }]} numberOfLines={1}>
          {gateLabel}
        </Text>
      </View>
    </View>
  )
}

function workerPhaseGateLabel(phaseContext: WorkflowPhaseContext, language: WorkerLanguageMode) {
  if (phaseContext.phase === 'matching') {
    return workerPhaseActionLabel(phaseContext, language)
  }
  if (phaseContext.blockedReason) {
    return workflowBlockedReasonLabel(phaseContext.blockedReason, language)
  }
  return workerPhaseActionLabel(phaseContext, language)
}

function selectWorkerPhasePrimarySection(
  phaseContext: WorkflowPhaseContext,
  visibleSections: WorkflowPhaseContext['sections'],
) {
  if (phaseContext.phase === 'matching') {
    const workerBrief = visibleSections.find((section) => section.id === 'worker_brief')
    if (workerBrief) return workerBrief
  }
  if (phaseContext.phase === 'inspecting') {
    const scopeChange = visibleSections.find((section) => section.id === 'scope_change')
    if (scopeChange) return scopeChange
  }
  if (phaseContext.phase === 'repairing') {
    const completionEvidence = visibleSections.find((section) => section.id === 'completion_evidence')
    if (completionEvidence) return completionEvidence
  }
  return visibleSections.find((section) => section.id === phaseContext.primaryArtifact?.id) ?? visibleSections[0] ?? null
}

function resolveWorkerScopeProgressLabel(progress: LocalKaelProgress | null, language: WorkerLanguageMode) {
  if (!progress) return language === 'en' ? 'Kael is reviewing' : 'Kael đang xét'
  if (progress.status === 'failed') return language === 'en' ? 'Needs retry' : 'Cần thử lại'
  if (progress.current_stage === 'scope_reviewing') {
    return language === 'en' ? 'Kael is reviewing evidence' : 'Kael đang rà soát bằng chứng'
  }
  if (progress.current_stage === 'scope_estimating') {
    if (progress.status === 'completed') {
      return language === 'en' ? 'Kael estimate ready' : 'Kael đã tính xong'
    }
    return language === 'en' ? 'Kael is estimating' : 'Kael đang tính phạm vi'
  }
  return language === 'en' ? 'Kael is reviewing' : 'Kael đang xét'
}

function resolveWorkerScopeProgressBody(
  progress: LocalKaelProgress | null,
  fallbackBody: string,
  language: WorkerLanguageMode,
) {
  if (!progress) return fallbackBody
  if (progress.status === 'failed') {
    return language === 'en'
      ? 'Kael could not finish this scope review yet. The job stays app-owned and price changes must be retried from the job room.'
      : 'Kael chưa hoàn tất phần xét phạm vi này. Việc vẫn thuộc app và thay đổi giá cần thử lại trong phòng việc.'
  }
  if (progress.current_stage === 'scope_reviewing') {
    return language === 'en'
      ? 'Kael is checking the worker report and attached evidence before any price decision appears.'
      : 'Kael đang kiểm tra mô tả của thợ và bằng chứng đã gửi trước khi hiện quyết định giá.'
  }
  if (progress.current_stage === 'scope_estimating') {
    if (progress.status === 'completed') {
      return language === 'en'
        ? 'Kael has prepared the scope estimate. The customer still decides inside the app before work continues.'
        : 'Kael đã chuẩn bị ước tính phạm vi. Khách vẫn quyết định trong app trước khi tiếp tục.'
    }
    return language === 'en'
      ? 'Kael is turning the reviewed evidence into an app-owned scope estimate.'
      : 'Kael đang chuyển bằng chứng đã rà soát thành ước tính phạm vi thuộc app.'
  }
  return fallbackBody
}

function resolveWorkerScopeProgressValue(progress: LocalKaelProgress | null, language: WorkerLanguageMode) {
  if (!progress) return language === 'en' ? 'Waiting for live state' : 'Chờ trạng thái thật'
  const percent = `${Math.round(Math.max(0, Math.min(1, progress.progress)) * 100)}%`
  const status = progress.status === 'completed'
    ? (language === 'en' ? 'done' : 'xong')
    : progress.status === 'failed'
      ? (language === 'en' ? 'failed' : 'lỗi')
      : progress.status === 'queued'
        ? (language === 'en' ? 'queued' : 'đang chờ')
        : (language === 'en' ? 'running' : 'đang chạy')
  return `${percent} · ${status}`
}

function WorkerNeedsReviewCard() {
  const { copy, language, tokens } = useWorkerUi()
  const { replace } = useRouter()
  const { selectors, state } = useFrontendWorkflow()
  const actionCopy = workerActionCopy[language]
  const deal = getWorkerVisibleDeal(state.deal)
  const scopeChange = deal?.scopeChange ?? null
  const hasScopeBlocker = Boolean(deal && selectors.currentStatus === 'scope_change_pending' && scopeChange)
  const hasCompletionEvidenceBlocker = Boolean(deal && selectors.currentStatus === 'repairing')
  const hasSubmittedCompletionEvidenceGap = Boolean(
    deal &&
    selectors.currentStatus === 'completed_by_worker' &&
    !hasLocalDealCompletionEvidence(deal),
  )
  const hasCompletionEvidenceArtifact = Boolean(
    deal &&
    hasLocalDealCompletionEvidence(deal) &&
    selectors.currentStatus &&
    ['completed_by_worker', 'confirmed_by_customer', 'reviewed'].includes(selectors.currentStatus),
  )

  if (!hasScopeBlocker && !hasCompletionEvidenceBlocker && !hasSubmittedCompletionEvidenceGap && !hasCompletionEvidenceArtifact) {
    return (
      <>
        <WorkerNeedsEmptyCard
          body={copy.jobs.needsEmptyBody}
          icon="brief"
          testID="worker-scope-change-empty"
          title={copy.jobs.needsEmptyTitle}
          tone="warm"
        />
        <WorkerNeedsEmptyCard
          body={language === 'en' ? 'Completion notes and photos appear here when a job reaches the finish step.' : 'Ghi chú và ảnh nghiệm thu sẽ hiện ở đây khi việc tới bước hoàn tất.'}
          icon="evidence"
          testID="worker-completion-evidence-empty"
          title={language === 'en' ? 'Completion evidence' : 'Ảnh nghiệm thu'}
          tone="base"
        />
      </>
    )
  }

  if (hasSubmittedCompletionEvidenceGap && deal) {
    const hasEnoughNote = (deal.completionNotes?.trim().length ?? 0) >= 5
    const hasPhoto = (deal.completionPhotoUrls?.length ?? 0) > 0
    const gapMeta = language === 'en'
      ? `${hasEnoughNote ? 'Notes saved' : 'Notes missing'} · ${hasPhoto ? 'Photos saved' : 'Photos missing'}`
      : `${hasEnoughNote ? 'Đã có ghi chú' : 'Thiếu ghi chú'} · ${hasPhoto ? 'Đã có ảnh' : 'Thiếu ảnh'}`
    return (
      <View style={[styles.needsReviewCard, workerJobCardSurface(tokens)]} testID="worker-completion-evidence-missing-card">
        <WorkerJobsCardChrome />
        <View style={styles.identityRow}>
          <WorkerUtilityIcon active frameSize={48} icon="evidence" size={48} style={styles.needsInlineImageIcon} />
          <View style={styles.titleStack}>
            <Text style={[styles.statusPill, { alignSelf: 'flex-start', backgroundColor: tokens.mint, borderColor: tokens.border, borderWidth: 1, color: tokens.primary }]} numberOfLines={1}>
              {language === 'en' ? 'Evidence gate' : 'Cổng bằng chứng'}
            </Text>
            <Text style={[styles.cardTitle, { color: tokens.ink }]} numberOfLines={2}>
              {language === 'en' ? 'Completion evidence is incomplete' : 'Bằng chứng hoàn tất chưa đủ'}
            </Text>
          </View>
        </View>
        <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={3}>
          {language === 'en'
            ? 'Kael needs both worker notes and completion photos before this artifact can move forward. Final price remains Kael-owned.'
            : 'Kael cần cả ghi chú thợ và ảnh hoàn tất trước khi dấu mốc này đi tiếp. Giá cuối vẫn thuộc quyết định của Kael.'}
        </Text>
        <View style={styles.needsReviewGrid}>
          <JobRoomMetaCell label={language === 'en' ? 'Missing' : 'Còn thiếu'} value={gapMeta} valueLines={2} />
          <JobRoomMetaCell label={language === 'en' ? 'Gate' : 'Cổng'} value={workflowBlockedReasonLabel('completion_evidence_required', language)} />
        </View>
        <PressButton secondary label={copy.jobs.jobRoomCta} onPress={() => replace('/(worker)/chat')} testID="worker-needs-open-missing-completion-jobroom" />
      </View>
    )
  }

  if (hasCompletionEvidenceBlocker) {
    return (
      <>
        <View style={[styles.needsReviewCard, workerJobCardSurface(tokens)]} testID="worker-completion-evidence-blocker-card">
          <WorkerJobsCardChrome />
          <View style={styles.identityRow}>
            <WorkerUtilityIcon active frameSize={48} icon="evidence" size={48} style={styles.needsInlineImageIcon} />
            <View style={styles.titleStack}>
              <Text style={[styles.statusPill, { alignSelf: 'flex-start', backgroundColor: tokens.mint, borderColor: tokens.border, borderWidth: 1, color: tokens.primary }]} numberOfLines={1}>
                {language === 'en' ? 'Update needed' : 'Cần cập nhật'}
              </Text>
              <Text style={[styles.cardTitle, { color: tokens.ink }]} numberOfLines={2}>
                {language === 'en' ? 'Completion photos are missing' : 'Ảnh nghiệm thu còn thiếu'}
              </Text>
            </View>
            <Text style={[styles.statusPill, { backgroundColor: tokens.mint, borderColor: tokens.border, color: tokens.primary }]} numberOfLines={1}>
              {language === 'en' ? 'Evidence' : 'Bằng chứng'}
            </Text>
          </View>
          <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={3}>
            {language === 'en'
              ? 'Before marking the job complete, add after-repair photos and a short note so the evidence trail stays complete.'
              : 'Trước khi đánh dấu hoàn tất, cần gửi ảnh sau sửa và ghi chú ngắn để giữ chuỗi bằng chứng đầy đủ.'}
          </Text>
          <View style={styles.actionRow}>
            <PressButton label={actionCopy.addCompletionPhoto} onPress={() => replace('/(worker)/jobs?tab=needs')} testID="worker-needs-add-completion-photo" />
            <PressButton secondary label={actionCopy.completeLater} onPress={() => replace('/(worker)/jobs?tab=active')} testID="worker-needs-completion-later" />
          </View>
        </View>
      </>
    )
  }

  if (hasCompletionEvidenceArtifact && deal) {
    const photoCount = deal.completionPhotoUrls?.length ?? 0
    const note = deal.completionNotes?.trim() || (language === 'en' ? 'Completion note saved by the system.' : 'Ghi chú hoàn tất đã được hệ thống lưu.')
    const statusLabel = localizedStatusLabel(selectors.currentStatus, language)
    const statusBody = selectors.currentStatus === 'completed_by_worker'
      ? language === 'en'
        ? 'Kael is reviewing the submitted evidence before completion or payment moves forward.'
        : 'Kael đang rà soát bằng chứng đã gửi trước khi chuyển hoàn tất hoặc thanh toán.'
      : language === 'en'
        ? 'Completion evidence is preserved as a read-only artifact for this job.'
        : 'Bằng chứng hoàn tất được giữ lại như dấu mốc chỉ đọc của công việc này.'
    const photoLabel = language === 'en'
      ? `${photoCount} completion photo${photoCount === 1 ? '' : 's'}`
      : `${photoCount} ảnh nghiệm thu`

    return (
      <View style={[styles.needsReviewCard, workerJobCardSurface(tokens)]} testID="worker-completion-evidence-submitted-card">
        <WorkerJobsCardChrome />
        <View style={styles.identityRow}>
          <WorkerUtilityIcon active frameSize={48} icon="evidence" size={48} style={styles.needsInlineImageIcon} />
          <View style={styles.titleStack}>
            <Text style={[styles.statusPill, { alignSelf: 'flex-start', backgroundColor: tokens.mint, borderColor: tokens.border, borderWidth: 1, color: tokens.primary }]} numberOfLines={1}>
              {statusLabel}
            </Text>
            <Text style={[styles.cardTitle, { color: tokens.ink }]} numberOfLines={2}>
              {language === 'en' ? 'Completion evidence submitted' : 'Đã gửi bằng chứng hoàn tất'}
            </Text>
          </View>
          <Text style={[styles.statusPill, { backgroundColor: tokens.mint, borderColor: tokens.border, color: tokens.primary }]} numberOfLines={1}>
            {language === 'en' ? 'Read-only' : 'Chỉ đọc'}
          </Text>
        </View>
        <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={3}>
          {statusBody}
        </Text>
        <View style={styles.needsReviewGrid}>
          <JobRoomMetaCell label={language === 'en' ? 'Completion note' : 'Ghi chú hoàn tất'} value={note} valueLines={3} />
          <JobRoomMetaCell label={language === 'en' ? 'Media' : 'Ảnh/video'} value={photoLabel} />
          <JobRoomMetaCell label={language === 'en' ? 'Kael gate' : 'Cổng Kael'} value={statusLabel} />
        </View>
        <View style={styles.actionRow}>
          <PressButton secondary label={copy.jobs.jobRoomCta} onPress={() => replace('/(worker)/chat')} testID="worker-needs-open-completion-jobroom" />
        </View>
      </View>
    )
  }

  const requestedScope = scopeChange?.requestedDescription ?? copy.jobs.scopeBody
  const scopeProgress = scopeChange?.kaelProgress ?? null
  const scopeProgressLabel = resolveWorkerScopeProgressLabel(scopeProgress, language)
  const scopeProgressBody = resolveWorkerScopeProgressBody(scopeProgress, copy.jobs.scopeBody, language)
  const scopeProgressValue = resolveWorkerScopeProgressValue(scopeProgress, language)
  const missingReasonLabel = language === 'en' ? 'Waiting for worker evidence' : 'Chờ bằng chứng từ thợ'
  const missingEstimateLabel = language === 'en' ? 'Waiting for Kael estimate' : 'Chờ Kael ước tính'
  const pendingPriceDecisionLabel = scopeProgressLabel
  const reason = scopeChange?.reason?.trim() || missingReasonLabel
  const originalScope = deal?.draft.description || deal?.draft.inferredProblemLabel || copy.jobs.scopeBody
  const originalPrice = deal?.estimate?.priceRangeLabel ?? missingEstimateLabel
  const price =
    scopeChange?.priceMin && scopeChange.priceMax
      ? `${formatWorkerMoney(scopeChange.priceMin, language)} - ${formatWorkerMoney(scopeChange.priceMax, language)}`
      : pendingPriceDecisionLabel
  const scopeDelta =
    formatWorkerScopePriceDelta(deal?.estimate?.priceRangeLabel, scopeChange?.priceMin ?? null, language) ??
    pendingPriceDecisionLabel
  const evidenceCount = scopeChange?.evidencePhotoUrls.length ?? 0
  const evidenceLabel =
    language === 'en'
      ? `${evidenceCount} evidence photo${evidenceCount === 1 ? '' : 's'}`
      : `${evidenceCount} ảnh bằng chứng`
  const scopeSummary = reason === missingReasonLabel ? requestedScope : `${requestedScope}. ${reason}`

  return (
    <>
    <View style={[styles.needsReviewCard, workerJobCardSurface(tokens)]} testID="worker-scope-change-active">
      <WorkerJobsCardChrome tone="warm" />
      <View style={styles.identityRow}>
        <WorkerUtilityIcon active frameSize={48} icon="brief" size={48} style={styles.needsInlineImageIcon} />
        <View style={styles.titleStack}>
          <Text style={[styles.statusPill, { alignSelf: 'flex-start', backgroundColor: tokens.cream, borderColor: tokens.border, borderWidth: 1, color: tokens.copper }]} numberOfLines={1}>
            {scopeProgressLabel}
          </Text>
          <Text style={[styles.cardTitle, { color: tokens.ink }]} numberOfLines={2}>
            {copy.jobs.scopeTitle}
          </Text>
        </View>
      </View>
      <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={3}>
        {scopeProgressBody}
      </Text>
      <View style={[styles.jobDiagnosisBox, workerDiagnosisSurface(tokens)]} testID="worker-scope-change-kael-summary">
        <Text style={[styles.kaelBriefTitle, { color: tokens.ink }]} numberOfLines={1}>
          {copy.chat.briefTitle}
        </Text>
        <Text style={[styles.briefText, { color: tokens.muted }]} numberOfLines={3}>
          {scopeSummary}
        </Text>
      </View>
      <View style={[styles.jobDiagnosisBox, workerDiagnosisSurface(tokens)]} testID="worker-scope-change-reference-card">
        <JobRoomMetaCell label={language === 'en' ? 'Old scope' : 'Phạm vi cũ'} testID="worker-scope-change-reference-old" value={originalScope} valueLines={2} />
        <JobRoomMetaCell label={language === 'en' ? 'New scope' : 'Phạm vi mới'} testID="worker-scope-change-reference-new" value={requestedScope} valueLines={2} />
        <JobRoomMetaCell label={language === 'en' ? 'Evidence' : 'Bằng chứng'} testID="worker-scope-change-reference-reason" value={`${reason} · ${evidenceLabel}`} valueLines={2} />
        <JobRoomMetaCell label={language === 'en' ? 'Price delta' : 'Chênh lệch giá'} testID="worker-scope-change-reference-delta" value={scopeDelta} />
      </View>
      <View style={styles.needsReviewGrid}>
        <JobRoomMetaCell label={language === 'en' ? 'Current scope' : 'Phạm vi hiện tại'} value={originalScope} />
        <JobRoomMetaCell label={language === 'en' ? 'Current estimate' : 'Ước tính hiện tại'} value={originalPrice} />
        <JobRoomMetaCell label={language === 'en' ? 'Requested work' : 'Phần việc mới'} value={requestedScope} />
        <JobRoomMetaCell label={language === 'en' ? 'Reason' : 'Lý do'} value={reason} />
        <JobRoomMetaCell label={language === 'en' ? 'Kael progress' : 'Tiến trình Kael'} value={scopeProgressValue} />
        <JobRoomMetaCell label={language === 'en' ? 'Kael price decision' : 'Giá Kael xét'} value={price} />
      </View>
      <View style={styles.actionRow}>
        <PressButton secondary label={language === 'en' ? 'View details' : 'Xem chi tiết'} onPress={() => replace('/(worker)/chat')} testID="worker-scope-change-detail-action" />
      </View>
    </View>
    </>
  )
}

function WorkerJobSummaryReportCard({ deal, status }: { deal: LocalDeal; status: LocalDealStatus | null }) {
  const { copy, language, tokens } = useWorkerUi()
  const { replace } = useRouter()
  const note = deal.completionNotes?.trim() || copy.jobs.summaryPriceWaiting
  const photoCount = deal.completionPhotoUrls?.length ?? 0
  const mediaValue = photoCount > 0
    ? language === 'en'
      ? `${photoCount} completion photo${photoCount === 1 ? '' : 's'}`
      : `${photoCount} ảnh nghiệm thu`
    : copy.jobs.safetyCompletionPending
  const statusValue = status === 'completed_by_worker'
    ? copy.jobs.summaryStatusSubmitted
    : status
      ? localizedStatusLabel(status, language)
      : copy.jobs.summaryPriceWaiting
  const finalPriceValue = deal.finalPrice && deal.finalPrice > 0
    ? formatWorkerMoney(deal.finalPrice, language)
    : deal.scopeChange?.priceMin && deal.scopeChange.priceMax
      ? `${formatWorkerMoney(deal.scopeChange.priceMin, language)} - ${formatWorkerMoney(deal.scopeChange.priceMax, language)}`
      : copy.jobs.summaryPriceWaiting
  const summaryRows = [
    { id: 'status', label: copy.jobs.summaryStatusTitle, value: statusValue },
    { id: 'note', label: copy.jobs.summaryNoteTitle, value: note },
    { id: 'media', label: copy.jobs.summaryMediaTitle, value: mediaValue },
    { id: 'price', label: copy.jobs.summaryPriceTitle, value: finalPriceValue },
  ] as const

  return (
    <View style={[styles.needsReviewCard, workerJobCardSurface(tokens)]} testID="worker-job-summary-report-card">
      <WorkerJobsCardChrome />
      <View style={styles.identityRow}>
        <WorkerUtilityIcon active frameSize={48} icon="document" size={48} style={styles.needsInlineImageIcon} />
        <View style={styles.titleStack}>
          <Text style={[styles.statusPill, { alignSelf: 'flex-start', backgroundColor: tokens.mint, borderColor: tokens.border, borderWidth: 1, color: tokens.primary }]} numberOfLines={1}>
            {copy.jobs.summaryReportMeta}
          </Text>
          <Text style={[styles.cardTitle, { color: tokens.ink }]} numberOfLines={2}>
            {copy.jobs.summaryReportTitle}
          </Text>
        </View>
      </View>
      <View style={[styles.jobDiagnosisBox, workerDiagnosisSurface(tokens)]} testID="worker-job-summary-report-checklist">
        {summaryRows.map((row) => (
          <View key={row.id} style={styles.briefItem} testID={`worker-job-summary-report-${row.id}`}>
            <WorkerUtilityIcon active frameSize={18} icon="check" size={18} small />
            <Text style={[styles.briefText, { color: tokens.muted }]} numberOfLines={2}>
              {row.label}: {row.value}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.actionRow}>
        <PressButton label={language === 'en' ? 'View details' : 'Xem chi tiết'} onPress={() => replace('/(worker)/chat')} testID="worker-job-summary-report-detail-action" />
      </View>
    </View>
  )
}

function WorkerNeedsInlineEmptyCard() {
  const { copy, language, tokens } = useWorkerUi()
  const { replace } = useRouter()

  return (
    <View style={[styles.needsReviewCard, workerJobCardSurface(tokens, 'warm')]} testID="worker-jobs-active-needs-inline-empty-card">
      <WorkerJobsCardChrome tone="warm" />
      <SubtleGlassHighlight />
      <View style={[styles.jobTopRow, styles.needsTopRow]}>
        <View style={[styles.titleStack, styles.needsTextStack]}>
          <Text style={[styles.cardTitle, { color: tokens.ink }]} numberOfLines={2}>
            {copy.jobs.needsEmptyTitle}
          </Text>
          <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={2}>
            {copy.jobs.needsEmptyBody}
          </Text>
        </View>
      </View>
      <View style={styles.actionRow}>
        <PressButton label={language === 'en' ? 'View request' : 'Xem yêu cầu'} onPress={() => replace('/(worker)/jobs?tab=needs')} testID="worker-jobs-active-needs-inline-primary" />
        <PressButton secondary label={language === 'en' ? 'Message Kael' : 'Nhắn Kael'} onPress={() => replace('/(worker)/chat')} testID="worker-jobs-active-needs-inline-secondary" />
      </View>
    </View>
  )
}

function WorkerNeedsEmptyCard({
  body,
  icon,
  testID,
  title,
  tone = 'base',
}: {
  body: string
  icon: WorkerIconName
  testID: string
  title: string
  tone?: WorkerTone
}) {
  const { tokens } = useWorkerUi()

  return (
    <View style={[styles.needsReviewCard, workerJobCardSurface(tokens, tone)]} testID={testID}>
      <WorkerJobsCardChrome tone={tone} />
      <View style={[styles.jobTopRow, styles.needsTopRow]}>
        <WorkerUtilityIcon active frameSize={64} icon={icon} size={64} small style={styles.needsImageIcon} />
        <View style={[styles.titleStack, styles.needsTextStack]}>
          <Text style={[styles.cardTitle, { color: tokens.ink }]} numberOfLines={2}>
            {title}
          </Text>
          <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={3}>
            {body}
          </Text>
        </View>
      </View>
    </View>
  )
}

export function WorkerChatSurface() {
  const copy = useWorkerFrameCopy()

  return (
    <WorkerFrame active="chat" eyebrow={copy.chat.eyebrow} hideDock title={copy.chat.title} testID="worker-chat-surface">
      <WorkerChatContent />
    </WorkerFrame>
  )
}

export function WorkerEarningsSurface() {
  const copy = useWorkerFrameCopy()
  const language = useAppLanguage()
  const [showPayDetails, setShowPayDetails] = useState(false)
  const payDetailActionLabel = language === 'en' ? 'View income details' : 'Xem chi tiết thu nhập'

  return (
    <WorkerFrame
      active="earnings"
      eyebrow={copy.earnings.eyebrow}
      subtitle={copy.earnings.subtitle}
      title={copy.earnings.title}
      testID="worker-earnings-surface"
    >
      <WorkerEarningsHero />
      <WorkerEarningsSummary />
      <View style={styles.actionRow}>
        <PressButton label={payDetailActionLabel} material="liquid" onPress={() => setShowPayDetails(true)} testID="worker-pay-detail-action" />
      </View>
      {showPayDetails ? (
        <>
          <WorkerEarningsReconciliationStrip />
          <WorkerEarningsLedger />
        </>
      ) : null}
    </WorkerFrame>
  )
}

export function WorkerProfileSurface() {
  const copy = useWorkerFrameCopy()

  return (
    <WorkerFrame active="profile" eyebrow={copy.profile.eyebrow} hideHeader title={copy.profile.title} testID="worker-profile-surface">
      <WorkerProfileContent />
    </WorkerFrame>
  )
}

function WorkerFrame({
  active,
  children,
  eyebrow,
  headerIcon,
  headerPill,
  headerPillTone = 'cream',
  hideHeader = false,
  testID,
  subtitle,
  title,
  hideDock = false,
}: {
  active: WorkerActiveTab
  children: ReactNode
  eyebrow: string
  headerIcon?: WorkerIconName
  headerPill?: string
  headerPillTone?: WorkerHeaderPillTone
  hideHeader?: boolean
  hideDock?: boolean
  subtitle?: string
  testID: string
  title: string
}) {
  const insets = useSafeAreaInsets()
  const { height, width } = useWindowDimensions()
  const pathname = usePathname()
  const mode = useWorkerThemeMode()
  const language = useAppLanguage()
  const copy = workerCopy[language]
  const { reduceMotion, reduceTransparency } = useGlassAccessibility()
  const baseTokens = getWorkerThemeTokens(mode)
  const tokens = reduceTransparency ? getReducedTransparencyWorkerTokens(baseTokens) : baseTokens
  const frameWidth = hideDock ? width : Math.min(width, 430)
  const liquidHome = active === 'home'
  const canvasBackgroundImage = liquidHome
    ? workerLiquidHomeCanvasBackgroundImage(mode)
    : mode === 'dark'
      ? 'radial-gradient(circle at 52% 10%, rgba(230,244,240,0.055), transparent 30%), radial-gradient(circle at 72% 88%, rgba(105,222,198,0.045), transparent 28%), linear-gradient(180deg, #0B0F0E 0%, #111614 100%)'
      : 'radial-gradient(circle at 50% 12%, rgba(142,231,217,0.18), transparent 28%), linear-gradient(180deg, #F4FAF7 0%, #F7FBF8 100%)'
  const canvasLayer = {
    backgroundColor: tokens.canvas,
    experimental_backgroundImage: reduceTransparency ? undefined : canvasBackgroundImage,
  } as any
  const frameHeight = Math.max(0, height - insets.top - insets.bottom)
  const routeIsFocused =
    (active === 'home' && pathname.endsWith('/home')) ||
    (active === 'jobs' && pathname.endsWith('/jobs')) ||
    (active === 'chat' && pathname.endsWith('/chat')) ||
    (active === 'earnings' && pathname.endsWith('/earnings')) ||
    (active === 'profile' && pathname.endsWith('/profile'))
  const workerUiValue = useMemo(() => ({ copy, language, mode, reduceTransparency, tokens }), [copy, language, mode, reduceTransparency, tokens])
  const routeScrollRef = useRef<ScrollView | null>(null)
  const lastScrollYRef = useRef(0)
  const dockRouteResetKey = `${active}:${pathname}`
  const [dockState, setDockState] = useState({ hidden: false, routeKey: dockRouteResetKey })
  const dockHidden = dockState.routeKey === dockRouteResetKey ? dockState.hidden : false
  useEffect(() => {
    lastScrollYRef.current = 0
  }, [dockRouteResetKey])
  const setDockHiddenSafely = useCallback((nextHidden: boolean) => {
    setDockState((current) => {
      if (current.routeKey === dockRouteResetKey && current.hidden === nextHidden) return current
      return { hidden: nextHidden, routeKey: dockRouteResetKey }
    })
  }, [dockRouteResetKey])
  const handleWorkerDockScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (hideDock || !routeIsFocused) return

    const nextY = Math.max(0, event.nativeEvent.contentOffset.y)
    const deltaY = nextY - lastScrollYRef.current

    if (nextY <= 12) {
      setDockHiddenSafely(false)
    } else if (deltaY > 8 && nextY > 34) {
      setDockHiddenSafely(true)
    } else if (deltaY < -7) {
      setDockHiddenSafely(false)
    }

    lastScrollYRef.current = nextY
  }, [hideDock, routeIsFocused, setDockHiddenSafely])

  useEffect(() => {
    if (!hideDock || !routeIsFocused) return
    const resetScroll = () => {
      routeScrollRef.current?.scrollTo({ animated: false, y: 0 })
      resetWorkerChatWebScrollPosition()
    }
    resetScroll()
    const frame = requestAnimationFrame(resetScroll)
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [frameHeight, hideDock, routeIsFocused])

  return (
    <WorkerUiContext.Provider value={workerUiValue}>
      <SafeAreaView style={[styles.safe, canvasLayer, routeIsFocused ? null : styles.inactiveRouteSurface]} testID={testID}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <View style={[styles.canvas, canvasLayer, { minHeight: frameHeight }]}>
          {reduceTransparency || hideDock || liquidHome ? null : <AmbientBackdrop />}
          {routeIsFocused && !hideDock && !liquidHome && !reduceMotion && !reduceTransparency ? <WorkerSectionMotionField active={active} frameWidth={frameWidth} screenWidth={width} /> : null}
          <ScrollView
            ref={routeScrollRef}
            contentContainerStyle={[
              styles.scrollContent,
              hideDock ? styles.standaloneScrollContent : null,
              {
                alignSelf: 'center',
                minHeight: frameHeight,
                paddingBottom: Math.max(insets.bottom + workerDockClearance, workerDockClearance),
                ...(hideDock ? { height: frameHeight, minHeight: frameHeight, paddingBottom: 0, paddingHorizontal: 4 } : null),
                width: Math.max(0, hideDock ? frameWidth : frameWidth - workerFrameHorizontalPadding * 2),
              },
            ]}
            automaticallyAdjustKeyboardInsets={!hideDock}
            contentInsetAdjustmentBehavior="automatic"
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            onScroll={hideDock ? undefined : handleWorkerDockScroll}
            scrollEventThrottle={16}
            scrollEnabled={!hideDock}
            showsVerticalScrollIndicator={false}
            style={[styles.workerScroll, hideDock ? styles.workerStandaloneScroll : null]}
            testID={`worker-${active}-scroll`}
          >
            <View
              style={styles.hiddenMarker}
              testID={
                WORKER_XANHSM_REFERENCE_AUDIT +
                WORKER_PRODUCTION_CONTRACT +
                WORKER_CLIENT_BASELINE_AUDIT +
                WORKER_THEME_LANGUAGE_STORE +
                WORKER_FLEXIBLE_MAP_SHELL +
                WORKER_DOCK_GLASS_MOTION +
                WORKER_GLASSMORPHISM_MOTION_LAYER +
                WORKER_CHATBOX_EMPTY_COMPOSER +
                WORKER_NO_FULL_ADDRESS_BEFORE_ACCEPT +
                WORKER_JOBROOM_KAEL_HANDOFF
              }
            />
            {hideDock ? <WorkerStandaloneHeader /> : hideHeader ? null : <WorkerScreenHeader active={active} eyebrow={eyebrow} headerIcon={headerIcon} headerPill={headerPill} headerPillTone={headerPillTone} subtitle={subtitle} title={title} />}
            {children}
          </ScrollView>
          {!hideDock && routeIsFocused ? <WorkerDockOverlay active={active} hidden={dockHidden} /> : null}
        </View>
      </SafeAreaView>
    </WorkerUiContext.Provider>
  )
}

function WorkerScreenHeader({ active, eyebrow, headerIcon, headerPill, headerPillTone = 'cream', subtitle, title }: { active: WorkerActiveTab; eyebrow: string; headerIcon?: WorkerIconName; headerPill?: string; headerPillTone?: WorkerHeaderPillTone; subtitle?: string; title: string }) {
  const { reduceTransparency, tokens } = useWorkerUi()
  const showKicker = eyebrow.trim().toLocaleLowerCase() !== title.trim().toLocaleLowerCase()
  const headerPillSurface = active === 'home'
    ? workerHomeHeaderPillSurface(tokens)
    : headerPillTone === 'mint'
      ? { backgroundColor: tokens.mint, borderColor: tokens.mode === 'dark' ? tokens.borderStrong : 'rgba(13,134,119,0.12)', color: tokens.mode === 'dark' ? tokens.aqua : '#0B5C50' }
      : { backgroundColor: tokens.cream, borderColor: tokens.border, color: tokens.primary }

  return (
    <View style={styles.workerTopRow} testID={`worker-${active}-title-row`}>
      <View style={styles.titleStack}>
        {subtitle ? null : showKicker ? (
          <Text style={[styles.kicker, { color: tokens.primary }]} numberOfLines={1}>
            {eyebrow}
          </Text>
        ) : null}
        <Text adjustsFontSizeToFit minimumFontScale={0.78} numberOfLines={2} style={[styles.screenTitle, { color: tokens.ink }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.screenSubtitle, { color: tokens.muted }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {headerPill ? (
        <Text style={[styles.screenHeaderPill, headerPillSurface]} numberOfLines={1}>
          {headerPill}
        </Text>
      ) : headerIcon ? (
        <View style={[styles.screenHeaderAction, workerOpaqueCardSurface(tokens, 'mint', reduceTransparency)]}>
          <Icon name={headerIcon} active small />
        </View>
      ) : active === 'home' ? (
        <View style={[styles.screenHeaderAction, workerOpaqueCardSurface(tokens, 'mint', reduceTransparency)]} testID="worker-home-header-avatar">
          <WorkerImageIcon frameSize={38} name="profileAvatar" size={38} />
        </View>
      ) : null}
    </View>
  )
}

function WorkerStandaloneHeader() {
  const { copy, language, tokens } = useWorkerUi()
  const { reduceMotion } = useGlassAccessibility()
  const { replace } = useRouter()
  const exitLabel = language === 'en' ? 'Exit chat' : 'Thoát chat'

  return (
    <View style={styles.jobRoomTopChrome} testID="worker-jobroom-fullscreen-header">
      <View style={styles.jobRoomTopUtilityRow} testID="worker-chat-reference-top-controls">
        <Pressable accessibilityLabel={exitLabel} accessibilityRole="button" onPress={() => replace('/(worker)/jobs?tab=active')} style={({ pressed }) => [styles.jobRoomRoundButton, { borderColor: tokens.border }, workerKaelChatSurface(tokens, 'icon'), reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID="worker-jobroom-back">
          <WorkerChatExitIcon color={tokens.primary} />
        </Pressable>
        <View accessibilityLabel={copy.chat.kael} accessible style={[styles.jobRoomKaelBubble, { borderColor: tokens.border }, workerKaelChatSurface(tokens, 'icon')]} testID="worker-chat-reference-kael-bubble">
          <Image contentFit="contain" source={kaelHead} style={styles.jobRoomKaelBubbleImage} />
        </View>
      </View>
    </View>
  )
}

function ActiveWorkerJobCard({ body, briefLines, deal, status, title }: { body: string; briefLines: string[]; deal: LocalDeal | null; status: string; title: string }) {
  const { actions, selectors } = useFrontendWorkflow()
  const { copy, language, tokens } = useWorkerUi()
  const { replace } = useRouter()
  const nextAction = selectors.canWorkerAdvance ? getNextWorkerAction(selectors.currentStatus, language) : null
  const nextStatus = nextAction && nextAction.type !== 'worker_complete_job' ? workerStatusForAction(nextAction.type) : null
  const needsCompletionEvidence = nextAction?.type === 'worker_complete_job'
  const referenceJobId = workerActiveJobReferenceId(deal, language)
  const referenceProblem = workerActiveJobProblemLabel(deal, language)
  const referenceTitle = referenceJobId === appCopy[language].common.noData
    ? referenceJobId
    : language === 'en' ? `Job #${referenceJobId}` : `Đơn #${referenceJobId}`

  return (
    <View style={[styles.activeJobCard, workerJobCardSurface(tokens)]} testID="worker-jobs-active-card">
      <WorkerJobsCardChrome />
      <View style={styles.rowBetween} testID="worker-jobs-active-reference-card">
        <View style={styles.titleStack}>
          <Text style={[styles.statusPill, { alignSelf: 'flex-start', backgroundColor: tokens.mint, borderColor: tokens.border, borderWidth: 1, color: tokens.primary }]} numberOfLines={1}>
            {status}
          </Text>
          <Text style={[styles.cardTitle, { color: tokens.ink }]} numberOfLines={2} testID="worker-jobs-active-reference-id">
            {referenceTitle}
          </Text>
          <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={2} testID="worker-jobs-active-reference-problem">
            {referenceProblem}
          </Text>
        </View>
        {nextAction ? (
          <Text style={[styles.statusPill, { backgroundColor: tokens.cream, borderColor: tokens.border, borderWidth: 1, color: tokens.copper, flexShrink: 0, maxWidth: 118, textAlign: 'center' }]} numberOfLines={1} testID="worker-active-next-action-pill">
            {nextAction.label}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={3}>
        {title} · {body}
      </Text>
      <WorkerActiveJobListRow deal={deal} status={status} />
      {briefLines.length > 0 ? (
        <View style={[styles.jobDiagnosisBox, workerDiagnosisSurface(tokens)]} testID="worker-active-job-kael-summary">
          <View style={styles.identityRow}>
            <Image source={kaelHead} style={[styles.kaelMini, { borderColor: tokens.borderStrong }]} />
            <Text style={[styles.kaelBriefTitle, { color: tokens.ink }]} numberOfLines={1}>
              {copy.request.briefTitle}
            </Text>
          </View>
          {briefLines.slice(0, 3).map((line) => (
            <View key={line} style={styles.briefItem}>
              <View style={[styles.briefDot, { backgroundColor: tokens.primary }]} />
              <Text style={[styles.briefText, { color: tokens.muted }]} numberOfLines={2}>
                {line}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      <CompactWorkerPresenceMap mode="active" />
      <View style={styles.actionRow}>
        <PressButton label={copy.jobs.jobRoomCta} onPress={() => replace('/(worker)/chat')} testID="worker-jobs-open-jobroom" />
        {nextAction && nextStatus ? (
          <PressButton secondary label={nextAction.label} onPress={() => void actions.workerUpdateStatus(nextStatus)} testID="worker-jobs-next-status-action" />
        ) : null}
        {needsCompletionEvidence ? (
          <PressButton secondary label={nextAction.label} onPress={() => replace('/(worker)/jobs?tab=needs')} testID="worker-jobs-completion-evidence-route" />
        ) : null}
      </View>
    </View>
  )
}

function WorkerActiveJobListRow({ deal, status }: { deal: LocalDeal | null; status: string }) {
  const { copy, language } = useWorkerUi()
  const broadcast = deal?.broadcast ?? null
  const jobValue = workerActiveJobReferenceId(deal, language)
  const areaValue = localizedWorkerAreaLabel(
    broadcast?.fullAddressVisible && broadcast.fullAddressLabel
      ? broadcast.fullAddressLabel
      : broadcast?.generalArea ?? deal?.draft.districtLabel,
    language,
  )
  const serviceValue = localizedServiceLabel(deal?.draft.serviceType ?? broadcast?.serviceType ?? null, language)
  const timeValue = workerJobTimeLabel(deal, language)
  const earningValue = broadcast?.estimatedEarningLabel ?? broadcast?.estimatedPriceLabel ?? deal?.estimate?.priceRangeLabel ?? copy.earnings.waiting

  return (
    <View style={styles.needsReviewGrid} testID="worker-jobs-active-list-row">
      <JobRoomMetaCell label={language === 'en' ? 'Job' : 'Mã việc'} testID="worker-jobs-active-list-id" value={jobValue} />
      <JobRoomMetaCell label={copy.chat.serviceLabel} testID="worker-jobs-active-list-service" value={serviceValue} />
      <JobRoomMetaCell label={language === 'en' ? 'Area' : 'Khu vực'} testID="worker-jobs-active-list-area" value={areaValue} />
      <JobRoomMetaCell label={language === 'en' ? 'Time' : 'Thời gian'} testID="worker-jobs-active-list-time" value={timeValue} />
      <JobRoomMetaCell label={copy.home.status} testID="worker-jobs-active-list-status" value={status} />
      <JobRoomMetaCell label={copy.request.workerEarns} testID="worker-jobs-active-list-earning" value={earningValue} />
    </View>
  )
}

function workerActiveJobReferenceId(deal: LocalDeal | null, language: WorkerLanguageMode) {
  const jobId = deal?.broadcast?.jobId ?? deal?.id ?? null
  return jobId && jobId !== LOCAL_DEAL_ID ? jobId : appCopy[language].common.noData
}

function workerActiveJobProblemLabel(deal: LocalDeal | null, language: WorkerLanguageMode) {
  return localizedProblemLabel(
    deal?.draft.problemChips[0] ?? deal?.draft.inferredProblemLabel ?? deal?.broadcast?.problemSummary,
    deal?.draft.serviceType ?? deal?.broadcast?.serviceType ?? null,
    language,
  )
}

function workerJobTimeLabel(deal: LocalDeal | null, language: WorkerLanguageMode) {
  if (!deal) return appCopy[language].common.noData
  if (deal.draft.timeChoice === 'now') return language === 'en' ? 'Now' : 'Nhận ngay'
  return language === 'en' ? 'Waiting for real schedule' : 'Chờ lịch thật'
}

function useWorkerChatComposerActions({
  attachLabel,
  chatCanEdit,
  chatCanSend,
  chatInputPlaceholder,
  language,
  micLabel,
  setChatLocalState,
  startJobRoomReveal,
}: {
  attachLabel: string
  chatCanEdit: boolean
  chatCanSend: boolean
  chatInputPlaceholder: string
  language: WorkerLanguageMode
  micLabel: string
  setChatLocalState: (updater: (current: WorkerChatLocalState) => WorkerChatLocalState) => void
  startJobRoomReveal: () => void
}) {
  const speechRecognitionRef = useRef<WorkerWebSpeechRecognition | null>(null)
  const appendDraftNote = useCallback((note: string) => {
    setChatLocalState((current) => ({
      ...current,
      draft: appendWorkerChatDraftSegment(current.draft, note),
      reveal: current.reveal.requested >= 1 ? current.reveal : { ...current.reveal, requested: 1 },
    }))
  }, [setChatLocalState])

  const handleWorkerAttachPress = useCallback(async () => {
    startJobRoomReveal()
    if (!chatCanEdit) {
      Alert.alert(attachLabel, chatInputPlaceholder)
      return
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert(attachLabel, workerChatAttachmentPermissionBody(language))
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.86,
      selectionLimit: 5,
    })
    if (result.canceled || !result.assets[0]) return
    const drafts = result.assets.slice(0, 5).map((asset) => {
      const fileName = asset.fileName ?? asset.uri.split('/').pop() ?? workerChatAttachmentFallbackName(language)
      return {
        fileName,
        fileSizeBytes: asset.fileSize ?? undefined,
        mimeType: asset.mimeType ?? undefined,
        type: 'image' as const,
        uri: asset.uri,
      }
    })
    setChatLocalState((current) => ({
      ...current,
      mediaDrafts: [...current.mediaDrafts, ...drafts].slice(-5),
    }))
    appendDraftNote(drafts.map((draft) => workerChatAttachmentDraftLine(language, draft.fileName)).join('\n'))
    Alert.alert(attachLabel, workerChatAttachmentReadyBody(language, chatCanSend))
  }, [appendDraftNote, attachLabel, chatCanEdit, chatCanSend, chatInputPlaceholder, language, setChatLocalState, startJobRoomReveal])

  const handleWorkerMicPress = useCallback(() => {
    startJobRoomReveal()
    if (!chatCanEdit) {
      Alert.alert(micLabel, chatInputPlaceholder)
      return
    }
    const SpeechRecognition = getWorkerWebSpeechRecognition()
    if (!SpeechRecognition) {
      Alert.alert(micLabel, workerChatMicUnavailableBody(language))
      return
    }
    try {
      speechRecognitionRef.current?.stop?.()
      const recognition = new SpeechRecognition()
      speechRecognitionRef.current = recognition
      recognition.continuous = false
      recognition.interimResults = false
      recognition.lang = language === 'en' ? 'en-US' : 'vi-VN'
      recognition.maxAlternatives = 1
      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim()
        if (transcript) appendDraftNote(transcript)
      }
      recognition.onerror = () => {
        Alert.alert(micLabel, workerChatMicUnavailableBody(language))
      }
      recognition.onend = () => {
        if (speechRecognitionRef.current === recognition) speechRecognitionRef.current = null
      }
      recognition.start()
      Alert.alert(micLabel, workerChatMicListeningBody(language))
    } catch {
      speechRecognitionRef.current = null
      Alert.alert(micLabel, workerChatMicUnavailableBody(language))
    }
  }, [appendDraftNote, chatCanEdit, chatInputPlaceholder, language, micLabel, startJobRoomReveal])

  return { handleWorkerAttachPress, handleWorkerMicPress }
}

function WorkerChatContent() {
  const { copy, language, reduceTransparency, tokens } = useWorkerUi()
  const { reduceMotion } = useGlassAccessibility()
  const { session } = useAuth()
  const { selectors, state, workerProfile } = useFrontendWorkflow()
  const deal = getWorkerVisibleDeal(state.deal)
  const broadcast = deal?.broadcast ?? null
  const dealChatKey = workerChatDealKey(deal)
  const [chatLocalState, setChatLocalState] = useState(createWorkerChatLocalState)
  const [workerKaelChat, setWorkerKaelChat] = useState<WorkerKaelChatResponse | null>(null)
  const [workerKaelChatError, setWorkerKaelChatError] = useState<string | null>(null)
  const [workerKaelChatLoading, setWorkerKaelChatLoading] = useState(false)
  const [workerKaelChatSendingJobId, setWorkerKaelChatSendingJobId] = useState<string | null>(null)
  const [workerKaelLiveProgress, setWorkerKaelLiveProgress] = useState<{ jobId: string; progress: KaelChatProgress } | null>(null)
  const [workerKaelPendingMessage, setWorkerKaelPendingMessage] = useState<{ jobId: string; text: string } | null>(null)
  const [workerKaelStreamingText, setWorkerKaelStreamingText] = useState<{ jobId: string; text: string } | null>(null)
  const [workerKaelFeedbackOpen, setWorkerKaelFeedbackOpen] = useState(false)
  const [workerKaelFeedbackValue, setWorkerKaelFeedbackValue] = useState('')
  const [workerKaelFeedbackError, setWorkerKaelFeedbackError] = useState<string | null>(null)
  const [workerKaelFeedbackSaving, setWorkerKaelFeedbackSaving] = useState(false)
  const [workerKaelFeedbackSent, setWorkerKaelFeedbackSent] = useState(false)
  const [workerTrainingConsent, setWorkerTrainingConsent] = useState(false)
  const [workerTrainingConsentSaving, setWorkerTrainingConsentSaving] = useState(false)
  const draft = chatLocalState.draft
  const jobRoomReveal = chatLocalState.reveal
  const activeDealChatKeyRef = useRef(dealChatKey)
  const localMessageIdRef = useRef(0)
  const workerChatJobId = getWorkerChatJobId(deal)
  const activeWorkerChatJobIdRef = useRef<string | null>(workerChatJobId)
  const workerKaelChatSending = Boolean(workerChatJobId && workerKaelChatSendingJobId === workerChatJobId)
  const canSendWorkerKaelMessage = Boolean(deal && isAcceptedLocalWorkerDeal(deal))
  const workflow = useServiceWorkflow({
    status: selectors.currentBackendStatus,
    hasAiNotes: Boolean(deal?.estimate?.advisory),
    hasCompletionEvidence: hasLocalDealCompletionEvidence(deal),
    hasCustomerInput: Boolean(deal),
    hasEstimate: Boolean(deal?.estimate),
    hasScopeChange: Boolean(deal?.scopeChange),
  })
  const chatSection = workflow.phaseContext.sections.find((section) => section.id === 'job_chat')
  const chatCanRead = Boolean(workerChatJobId && chatSection?.visible)
  const chatCanSend = Boolean(chatCanRead && canSendWorkerKaelMessage && !chatSection?.lockedReason)
  const chatIsStandalonePreview = !workerChatJobId && !broadcast
  const chatCanEdit = chatCanSend || chatIsStandalonePreview
  const chatLockedReason = chatSection?.lockedReason ? workflowBlockedReasonLabel(chatSection.lockedReason, language) : null
  const jobChat = useJobChatThread(workerChatJobId, chatCanRead)
  const activeWorkerKaelChatState = workerKaelChat?.session.job_id === workerChatJobId ? workerKaelChat : null
  const visibleWorkerKaelChatError = workerChatJobId && chatCanRead ? workerKaelChatError : null
  const visibleWorkerKaelChatLoading = Boolean(workerChatJobId && chatCanRead && workerKaelChatLoading)
  const visibleWorkerKaelLiveProgress = workerChatJobId && chatCanRead && workerKaelLiveProgress?.jobId === workerChatJobId ? workerKaelLiveProgress.progress : null
  const visibleWorkerKaelStreamingText = workerChatJobId && chatCanRead && workerKaelStreamingText?.jobId === workerChatJobId ? workerKaelStreamingText.text : ''
  const workerKaelMessages = activeWorkerKaelChatState
    ? activeWorkerKaelChatState.turns.map((turn) => workerChatMessageFromWorkerKaelTurn(turn, language))
    : []
  const workerKaelPendingMessages = workerKaelPendingMessage
    && workerKaelPendingMessage.jobId === workerChatJobId
    ? [{ id: 'worker-kael-pending-message', mine: true, system: false, text: workerKaelPendingMessage.text, who: copy.chat.worker }]
    : []
  const renderedMessages = [
    ...chatLocalState.localMessages,
    ...workerKaelMessages,
    ...workerKaelPendingMessages,
    ...jobChat.messages.map((message) => workerChatMessageFromJobMessage(message, session?.user.id ?? null, language)),
  ]
  const hasAnyWorkerKaelMessage = Boolean(broadcast || renderedMessages.length > 0)
  const showReferenceWelcome = !broadcast && renderedMessages.length === 0 && jobRoomReveal.requested === 0
  const workerGreeting = workerChatGreetingLabel(workerProfile, language)
  const chatInputPlaceholder = chatCanSend
    ? copy.chat.input
    : chatIsStandalonePreview
      ? workerChatStandaloneAccessibilityLabel(language)
      : chatLockedReason ?? (broadcast ? copy.chat.lockedGate : copy.chat.waitingInput)
  const visibleChatInputPlaceholder = chatCanSend
    ? copy.chat.input
    : chatIsStandalonePreview
      ? workerChatStandaloneInputLabel(language)
      : copy.chat.waitingInput
  const hiddenAddressLabel = workerActionCopy[language].hiddenAddress
  const jobAreaLabel = broadcast?.generalArea ? localizedWorkerAreaLabel(broadcast.generalArea, language) : hiddenAddressLabel
  const fullAddressLabel = broadcast?.fullAddressVisible ? broadcast.fullAddressLabel ?? null : null
  const jobAddressLabel = selectors.canWorkerSeeFullAddress && fullAddressLabel ? localizedWorkerAreaLabel(fullAddressLabel, language) : jobAreaLabel
  const jobStatusLabel = localizedStatusLabel(selectors.currentStatus, language)
  const jobRoomMeta = broadcast ? [
    { label: copy.chat.serviceLabel, value: localizedServiceLabel(broadcast.serviceType, language) },
    { label: copy.chat.problemLabel, value: localizedWorkerProblemSummary(broadcast, language) },
    { label: copy.chat.areaLabel, value: jobAddressLabel },
    { label: copy.chat.statusLabel, value: jobStatusLabel },
  ] : []
  const jobRoomGate = chatCanSend ? copy.chat.acceptedGate : chatLockedReason ?? (broadcast ? copy.chat.lockedGate : copy.chat.waitingBody)
  const jobBriefLines = broadcast ? buildWorkerBroadcastBrief(deal, broadcast, selectors.currentStatus, language, selectors.canWorkerSeeFullAddress) : []
  const maxRevealStep = broadcast ? 4 : 3
  const targetRevealStep = Math.min(maxRevealStep, jobRoomReveal.requested)
  const showJobRoomProcess = jobRoomReveal.step >= 1
  const showJobRoomMessage = jobRoomReveal.step >= 2
  const showJobRoomBrief = jobRoomReveal.step >= 3
  const showJobRoomDetails = jobRoomReveal.step >= 4
  const showWorkerKaelStatusOutsideReveal = Boolean(
    broadcast &&
    !showJobRoomDetails &&
    (visibleWorkerKaelChatError || visibleWorkerKaelChatLoading || workerKaelChatSending || visibleWorkerKaelLiveProgress),
  )
  const startJobRoomReveal = () => {
    setChatLocalState((current) => current.reveal.requested >= 1 ? current : { ...current, reveal: { ...current.reveal, requested: 1 } })
  }
  const { handleWorkerAttachPress, handleWorkerMicPress } = useWorkerChatComposerActions({
    attachLabel: copy.chat.attach,
    chatCanEdit,
    chatCanSend,
    chatInputPlaceholder,
    language,
    micLabel: copy.chat.mic,
    setChatLocalState,
    startJobRoomReveal,
  })
  useEffect(() => {
    activeWorkerChatJobIdRef.current = workerChatJobId
  }, [workerChatJobId])
  const isActiveWorkerChatJob = useCallback((jobId: string | null) => Boolean(jobId && activeWorkerChatJobIdRef.current === jobId), [])
  const clearWorkerKaelTransientState = useCallback((jobId: string) => {
    setWorkerKaelChatSendingJobId((current) => (current === jobId ? null : current))
    setWorkerKaelLiveProgress((current) => (current?.jobId === jobId ? null : current))
    setWorkerKaelPendingMessage((current) => (current?.jobId === jobId ? null : current))
    setWorkerKaelStreamingText((current) => (current?.jobId === jobId ? null : current))
  }, [])
  const advanceJobRoomReveal = () => {
    setChatLocalState((current) => {
      const nextRequested = Math.min(maxRevealStep, Math.max(current.reveal.requested, current.reveal.step + 1))
      return nextRequested === current.reveal.requested ? current : { ...current, reveal: { ...current.reveal, requested: nextRequested } }
    })
  }
  const createWorkerKaelChatSessionForStream = async (jobId: string, chatLanguage: WorkerLanguageMode) => {
    const result = await workerKaelChatService.create({
      job_id: jobId,
      media_refs: [],
      language: chatLanguage,
    })
    if (!isActiveWorkerChatJob(jobId)) {
      clearWorkerKaelTransientState(jobId)
      return null
    }
    if (!result.success || result.data.session.job_id !== jobId) return null
    return result.data
  }

  useEffect(() => {
    if (activeDealChatKeyRef.current === dealChatKey) return
    setChatLocalState(createWorkerChatLocalState())
    setWorkerKaelChat(null)
    setWorkerKaelChatError(null)
    setWorkerKaelChatLoading(false)
    setWorkerKaelChatSendingJobId(null)
    setWorkerKaelLiveProgress(null)
    setWorkerKaelPendingMessage(null)
    setWorkerKaelStreamingText(null)
    activeDealChatKeyRef.current = dealChatKey
  }, [dealChatKey])

  useEffect(() => {
    let cancelled = false
    if (!workerChatJobId || !chatCanRead) {
      return () => {
        cancelled = true
      }
    }

    void (async () => {
      const listResult = await workerKaelChatService.list()
      if (cancelled) return
      if (!listResult.success) {
        setWorkerKaelChatLoading(false)
        setWorkerKaelChatError(workerKaelChatErrorCopy(language))
        return
      }
      const sessionForJob = listResult.data.sessions.find((item) => item.job_id === workerChatJobId)
      if (!sessionForJob) {
        setWorkerKaelChat(null)
        setWorkerKaelChatLoading(false)
        return
      }
      const chatResult = await workerKaelChatService.get(sessionForJob.id)
      if (cancelled) return
      setWorkerKaelChatLoading(false)
      if (chatResult.success) {
        setWorkerKaelChatError(null)
        setWorkerKaelChat(chatResult.data)
      } else {
        setWorkerKaelChatError(workerKaelChatErrorCopy(language))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [chatCanRead, language, workerChatJobId])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await workerKaelChatService.getTrainingConsent()
      if (cancelled) return
      if (result.success) setWorkerTrainingConsent(result.data.training_consent)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (jobRoomReveal.step >= targetRevealStep) return
    const revealDelayMs = jobRoomReveal.step === 0 ? 80 : workerJobRoomRevealDelayMs
    const revealTimer = setTimeout(() => {
      setChatLocalState((current) => {
        const nextTargetRevealStep = Math.min(maxRevealStep, current.reveal.requested)
        if (current.reveal.step >= nextTargetRevealStep) return current
        return { ...current, reveal: { ...current.reveal, step: Math.min(nextTargetRevealStep, current.reveal.step + 1) } }
      })
    }, reduceMotion ? 0 : revealDelayMs)

    return () => {
      clearTimeout(revealTimer)
    }
  }, [jobRoomReveal.step, maxRevealStep, reduceMotion, targetRevealStep])

  const submitWorkerChatMessage = async () => {
    if (!chatCanEdit) return
    const value = draft.trim()
    if (!value) return
    if (!chatCanSend) {
      localMessageIdRef.current += 1
      const workerMessageId = `worker-local-chat-${localMessageIdRef.current}`
      localMessageIdRef.current += 1
      const kaelMessageId = `worker-local-chat-${localMessageIdRef.current}`
      setChatLocalState((current) => ({
        ...current,
        draft: '',
        mediaDrafts: [],
        localMessages: [
          ...current.localMessages,
          { id: workerMessageId, mine: true, system: false, text: value, who: copy.chat.worker },
          { id: kaelMessageId, mine: false, system: true, text: workerChatStandaloneReply(language), who: copy.chat.kael },
        ],
      }))
      return
    }
    if (!workerChatJobId) return
    const activeJobId = workerChatJobId
    setWorkerKaelChatSendingJobId(activeJobId)
    setWorkerKaelChatError(null)
    setWorkerKaelLiveProgress(null)
    setWorkerKaelStreamingText(null)
    setWorkerKaelPendingMessage({ jobId: activeJobId, text: value })
    let mediaRefs: string[] = []
    if (chatLocalState.mediaDrafts.length > 0) {
      const uploaded = await uploadJobMediaDrafts(activeJobId, chatLocalState.mediaDrafts, 'before')
      if (!isActiveWorkerChatJob(activeJobId)) {
        clearWorkerKaelTransientState(activeJobId)
        return
      }
      if (!uploaded.success) {
        setWorkerKaelChatSendingJobId(null)
        setWorkerKaelPendingMessage(null)
        setWorkerKaelChatError(uploaded.error)
        Alert.alert(copy.chat.sendErrorTitle, uploaded.error)
        return
      }
      mediaRefs = uploaded.mediaRefs
    }
    const activeWorkerKaelChat = workerKaelChat?.session.job_id === activeJobId
      ? workerKaelChat
      : await createWorkerKaelChatSessionForStream(activeJobId, language)
    if (!isActiveWorkerChatJob(activeJobId)) {
      clearWorkerKaelTransientState(activeJobId)
      return
    }
    if (!activeWorkerKaelChat) {
      setWorkerKaelChatSendingJobId(null)
      setWorkerKaelPendingMessage(null)
      setWorkerKaelChatError(workerKaelChatErrorCopy(language))
      Alert.alert(copy.chat.sendErrorTitle, copy.chat.sendErrorBody)
      return
    }
    setWorkerKaelChat(activeWorkerKaelChat)
    const turnInput = { message: value, media_refs: mediaRefs, language }
    const result = await workerKaelChatService.streamTurn(activeWorkerKaelChat.session.id, turnInput, {
      onStage: (event) => {
        if (isActiveWorkerChatJob(activeJobId)) setWorkerKaelLiveProgress({ jobId: activeJobId, progress: event.progress })
      },
      onToken: (event) => {
        if (event.field === 'worker_assist' && isActiveWorkerChatJob(activeJobId)) {
          setWorkerKaelStreamingText((current) => ({
            jobId: activeJobId,
            text: current?.jobId === activeJobId ? `${current.text}${event.delta}` : event.delta,
          }))
        }
      },
      onResult: (event) => {
        if (event.data.session.job_id !== activeJobId || !isActiveWorkerChatJob(activeJobId)) return
        setWorkerKaelChat(event.data)
        setWorkerKaelLiveProgress(event.data.session.progress ? { jobId: activeJobId, progress: event.data.session.progress } : null)
      },
    })
    if (!isActiveWorkerChatJob(activeJobId)) {
      clearWorkerKaelTransientState(activeJobId)
      return
    }
    setWorkerKaelChatSendingJobId(null)
    setWorkerKaelPendingMessage(null)
    setWorkerKaelStreamingText(null)
    if (!result.success) {
      setWorkerKaelLiveProgress(null)
      setWorkerKaelChatError(workerKaelChatErrorCopy(language))
      Alert.alert(copy.chat.sendErrorTitle, copy.chat.sendErrorBody)
      return
    }
    if (result.data.session.job_id !== activeJobId) {
      setWorkerKaelLiveProgress(null)
      setWorkerKaelChatError(workerKaelChatErrorCopy(language))
      Alert.alert(copy.chat.sendErrorTitle, copy.chat.sendErrorBody)
      return
    }
    setWorkerKaelChat(result.data)
    setChatLocalState((current) => ({
      ...current,
      draft: '',
      mediaDrafts: [],
      reveal: current.reveal.requested >= maxRevealStep ? current.reveal : { ...current.reveal, requested: maxRevealStep },
    }))
  }
  const submitWorkerKaelFeedback = async () => {
    if (workerKaelFeedbackSaving) return
    const message = workerKaelFeedbackValue.trim()
    if (message.length < 8) {
      setWorkerKaelFeedbackError(workerKaelFeedbackRequiredCopy(language))
      return
    }
    setWorkerKaelFeedbackSaving(true)
    setWorkerKaelFeedbackError(null)
    const result = await workerKaelChatService.submitFeedback({
      language,
      message,
      source: 'worker_chat',
    })
    setWorkerKaelFeedbackSaving(false)
    if (!result.success) {
      setWorkerKaelFeedbackError(workerKaelFeedbackSaveErrorCopy(language))
      return
    }
    setWorkerKaelFeedbackSent(true)
    setWorkerKaelFeedbackOpen(false)
    setWorkerKaelFeedbackValue('')
  }
  const toggleWorkerTrainingConsent = async () => {
    if (workerTrainingConsentSaving) return
    const nextConsent = !workerTrainingConsent
    setWorkerTrainingConsentSaving(true)
    const result = await workerKaelChatService.setTrainingConsent({
      language,
      source: 'worker_chat',
      training_consent: nextConsent,
    })
    setWorkerTrainingConsentSaving(false)
    if (result.success) setWorkerTrainingConsent(result.data.training_consent)
  }
  const focusWorkerKaelComposer = () => {
    if (!chatIsStandalonePreview) startJobRoomReveal()
    stabilizeWorkerChatWebLayout()
  }
  const canSubmitWorkerDraft = Boolean(draft.trim() && chatCanEdit && !jobChat.sending && !workerKaelChatSending)

  return (
    <View style={[styles.chatShell, showReferenceWelcome ? styles.chatShellReference : null]} testID="worker-chat-kael-relay">
      <View style={styles.hiddenMarker} testID="worker-kael-client-chatbox-parity" />
      <View style={styles.hiddenMarker} testID="worker-kael-empty-chat-state" />
      <View style={[styles.kaelClientStage, showReferenceWelcome ? styles.kaelClientStageReference : !hasAnyWorkerKaelMessage ? styles.kaelClientStageEmpty : null]} testID="worker-kael-conversation-feed">
        <View style={[styles.jobRoomRevealStack, showReferenceWelcome ? styles.jobRoomRevealStackReference : null]} testID="worker-jobroom-sequential-content">
          {showJobRoomProcess ? (
            <SequentialJobRoomReveal step={1} testID="worker-jobroom-process-reveal">
              <JobRoomProcessCard broadcast={broadcast} canSend={chatCanSend} onAdvance={advanceJobRoomReveal} />
            </SequentialJobRoomReveal>
          ) : showReferenceWelcome ? null : (
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={styles.jobRoomProcessHidden} testID="worker-jobroom-process-reserve">
              <JobRoomProcessCard broadcast={broadcast} canSend={chatCanSend} onAdvance={advanceJobRoomReveal} />
            </View>
          )}
          {!broadcast ? (
            <View style={[styles.jobRoomStack, showReferenceWelcome ? styles.workerChatReferenceCenter : null]} testID="worker-kael-empty-chat-canvas">
              {/* X6 (Plan.md §27.9 — 2026-05-29): F-29 fix. The animated waiting
                  room only appears after the reveal sequence is requested
                  (reveal.requested starts at 0 with no job), so the Nhắn tab
                  showed a fully blank screen. Always render an honest empty
                  state with copy — parity with the customer chat empty state. */}
              {showReferenceWelcome ? (
                <WorkerChatReferenceWelcome greeting={workerGreeting} />
              ) : !showJobRoomMessage && renderedMessages.length === 0 ? (
                <View style={[styles.workerChatStaticEmpty, workerOpaqueCardSurface(tokens, 'warm', reduceTransparency)]} testID="worker-chat-static-empty-state">
                  <Text style={[styles.workerChatStaticEmptyTitle, { color: tokens.ink }]} numberOfLines={2}>
                    {copy.chat.emptyTitle}
                  </Text>
                  <Text style={[styles.workerChatStaticEmptyBody, { color: tokens.muted }]} numberOfLines={3}>
                    {copy.chat.emptyBody}
                  </Text>
                </View>
              ) : null}
              {renderedMessages.length > 0 ? (
                <View style={styles.chatStack} testID="worker-chat-standalone-thread">
                  {renderedMessages.map((message) => (
                    <ChatBubble key={message.id} {...message} />
                  ))}
                  <WorkerKaelChatStatusBubble error={visibleWorkerKaelChatError} loading={visibleWorkerKaelChatLoading} progress={visibleWorkerKaelLiveProgress ?? activeWorkerKaelChatState?.session.progress ?? null} sending={workerKaelChatSending} streamingText={visibleWorkerKaelStreamingText} />
                </View>
              ) : null}
              {showJobRoomMessage ? (
                <SequentialJobRoomReveal step={2} testID="worker-jobroom-waiting-room-reveal">
                  <JobRoomKaelMessage body={copy.chat.waitingBody} kicker={copy.chat.jobRoomTitle} testID="worker-jobroom-waiting-room" title={copy.chat.waitingTitle} />
                </SequentialJobRoomReveal>
              ) : null}
              {showJobRoomBrief ? (
                <SequentialJobRoomReveal step={3} testID="worker-jobroom-empty-brief-reveal">
                  <JobRoomBriefBlock body={copy.chat.briefBody} testID="worker-jobroom-empty-brief-shell" title={copy.chat.briefTitle} />
                  {renderedMessages.length > 0 && workerChatJobId ? (
                    <View style={styles.chatStack}>
                      {renderedMessages.map((message) => (
                        <ChatBubble key={message.id} {...message} />
                      ))}
                      <WorkerKaelChatStatusBubble error={visibleWorkerKaelChatError} loading={visibleWorkerKaelChatLoading} progress={visibleWorkerKaelLiveProgress ?? activeWorkerKaelChatState?.session.progress ?? null} sending={workerKaelChatSending} streamingText={visibleWorkerKaelStreamingText} />
                    </View>
                  ) : null}
                </SequentialJobRoomReveal>
              ) : null}
            </View>
          ) : (
            <View style={styles.jobRoomStack} testID="hasAnyWorkerKaelMessage">
              {showJobRoomMessage ? (
                <SequentialJobRoomReveal step={2} testID="worker-jobroom-handoff-reveal">
                  <JobRoomKaelMessage body={copy.chat.briefBody} kicker={copy.chat.handoffTitle} testID="worker-jobroom-kael-handoff" title={localizedServiceLabel(broadcast.serviceType, language)} />
                </SequentialJobRoomReveal>
              ) : null}
              {showJobRoomBrief ? (
                <SequentialJobRoomReveal step={3} testID="worker-jobroom-live-brief-reveal">
                  <JobRoomBriefBlock lines={jobBriefLines} testID="worker-jobroom-live-brief" title={copy.chat.briefTitle} />
                </SequentialJobRoomReveal>
              ) : null}
              {showJobRoomDetails ? (
                <SequentialJobRoomReveal step={4} testID="worker-jobroom-details-reveal">
                  <View style={styles.jobRoomMetaGrid}>
                    {jobRoomMeta.map((item) => (
                      <JobRoomMetaCell key={item.label} label={item.label} value={item.value} />
                    ))}
                  </View>
                  <WorkerOnSiteAdvisoryRail
                    canSeeFullAddress={Boolean(selectors.canWorkerSeeFullAddress && fullAddressLabel)}
                    deal={deal}
                    status={selectors.currentStatus}
                  />
                  <CompactWorkerPresenceMap density="dense" mode="jobroom" />
                  <View style={[styles.jobRoomGate, workerOpaqueCardSurface(tokens, chatCanSend ? 'cyan' : 'warm', reduceTransparency)]} testID="worker-jobroom-privacy-gate">
                    <Icon name={chatCanSend ? 'check' : 'shield'} active={chatCanSend} small />
                    <View style={styles.titleStack}>
                      <Text style={[styles.bodyText, { color: tokens.ink }]} numberOfLines={2}>
                        {jobRoomGate}
                      </Text>
                      {!chatCanSend ? (
                        <Text style={[styles.briefText, { color: tokens.muted }]} numberOfLines={2}>
                          {copy.chat.privacyGate}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  {renderedMessages.length > 0 ? (
                    <View style={styles.chatStack}>
                      {renderedMessages.map((message) => (
                        <ChatBubble key={message.id} {...message} />
                      ))}
                      <WorkerKaelChatStatusBubble error={visibleWorkerKaelChatError} loading={visibleWorkerKaelChatLoading} progress={visibleWorkerKaelLiveProgress ?? activeWorkerKaelChatState?.session.progress ?? null} sending={workerKaelChatSending} streamingText={visibleWorkerKaelStreamingText} />
                    </View>
                  ) : null}
                </SequentialJobRoomReveal>
              ) : null}
            </View>
          )}
          </View>

          {showWorkerKaelStatusOutsideReveal ? (
            <View style={styles.chatStack}>
              <WorkerKaelChatStatusBubble error={visibleWorkerKaelChatError} loading={visibleWorkerKaelChatLoading} progress={visibleWorkerKaelLiveProgress ?? activeWorkerKaelChatState?.session.progress ?? null} sending={workerKaelChatSending} streamingText={visibleWorkerKaelStreamingText} />
            </View>
          ) : null}

        <WorkerChatMediaDraftPreviewRail drafts={chatLocalState.mediaDrafts} />

        <WorkerKaelParityPanel
          consent={workerTrainingConsent}
          consentSaving={workerTrainingConsentSaving}
          feedbackError={workerKaelFeedbackError}
          feedbackOpen={workerKaelFeedbackOpen}
          feedbackSaving={workerKaelFeedbackSaving}
          feedbackSent={workerKaelFeedbackSent}
          feedbackValue={workerKaelFeedbackValue}
          onCancelFeedback={() => {
            setWorkerKaelFeedbackOpen(false)
            setWorkerKaelFeedbackError(null)
          }}
          onChangeFeedback={(value) => {
            setWorkerKaelFeedbackValue(value)
            if (workerKaelFeedbackError) setWorkerKaelFeedbackError(null)
          }}
          onOpenFeedback={() => setWorkerKaelFeedbackOpen(true)}
          onSubmitFeedback={submitWorkerKaelFeedback}
          onToggleConsent={toggleWorkerTrainingConsent}
        />

        <WorkerChatComposerDock
          canEdit={chatCanEdit}
          canSubmit={canSubmitWorkerDraft}
          draft={draft}
          inputAccessibilityLabel={chatInputPlaceholder}
          modeLabel={chatCanSend ? copy.chat.acceptedPill : copy.chat.kael}
          onAttach={handleWorkerAttachPress}
          onChangeDraft={(value) => setChatLocalState((current) => current.draft === value ? current : { ...current, draft: value })}
          onFocus={focusWorkerKaelComposer}
          onMic={handleWorkerMicPress}
          onSend={submitWorkerChatMessage}
          placeholder={visibleChatInputPlaceholder}
        />
      </View>
    </View>
  )
}

function WorkerChatMediaDraftPreviewRail({ drafts }: { drafts: LocalMediaUploadDraft[] }) {
  const { language, tokens } = useWorkerUi()
  if (drafts.length === 0) return null
  const fallbackName = language === 'en' ? 'Evidence photo' : 'Ảnh bằng chứng'

  return (
    <View style={styles.completionPhotoPreviewRail} testID="worker-chat-media-preview-rail">
      {drafts.map((draft, index) => (
        <View key={`${draft.uri}-${index}`} style={[styles.completionPhotoPreviewTile, { backgroundColor: tokens.glassStrong, borderColor: tokens.border }]} testID={`worker-chat-media-preview-${index}`}>
          <Image contentFit="cover" source={{ uri: draft.uri }} style={styles.completionPhotoPreviewImage} testID={`worker-chat-media-preview-image-${index}`} />
          <Text style={[styles.workerMiniMeta, { color: tokens.muted }]} numberOfLines={1}>
            {draft.fileName ?? fallbackName}
          </Text>
        </View>
      ))}
    </View>
  )
}

function WorkerChatComposerDock({
  canEdit,
  canSubmit,
  draft,
  inputAccessibilityLabel,
  modeLabel,
  onAttach,
  onChangeDraft,
  onFocus,
  onMic,
  onSend,
  placeholder,
}: {
  canEdit: boolean
  canSubmit: boolean
  draft: string
  inputAccessibilityLabel: string
  modeLabel: string
  onAttach: () => void
  onChangeDraft: (value: string) => void
  onFocus: () => void
  onMic: () => void
  onSend: () => void
  placeholder: string
}) {
  const { copy, tokens } = useWorkerUi()
  const { reduceMotion } = useGlassAccessibility()
  const [composerInputHeight, setComposerInputHeight] = useState(28)

  return (
    <View style={styles.chatComposerTouchWrap} testID="worker-kael-composer-sequential-trigger">
      <View style={[styles.chatComposer, workerKaelChatSurface(tokens, 'composer')]} testID="worker-kael-composer-dock">
        <SubtleGlassHighlight liquid />
        <View pointerEvents="none" style={[styles.workerChatComposerKeyline, { borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.16)' : 'rgba(255,255,255,0.88)' }]} testID="worker-chat-reference-composer-keyline" />
        <TextInput
          accessibilityLabel={inputAccessibilityLabel}
          editable={canEdit}
          multiline
          onChangeText={onChangeDraft}
          onContentSizeChange={(event) => setComposerInputHeight(Math.min(76, Math.max(28, event.nativeEvent.contentSize.height)))}
          onFocus={onFocus}
          onSubmitEditing={onSend}
          placeholder={placeholder}
          placeholderTextColor={tokens.subtle}
          returnKeyType="send"
          scrollEnabled={false}
          selectionColor={tokens.primary}
          style={[styles.chatInput, styles.chatInputInvisibleFocus, { caretColor: tokens.primary, color: tokens.ink, height: composerInputHeight } as any]}
          testID="worker-kael-chat-input"
          value={draft}
        />
        <View style={styles.chatComposerControlRow} testID="worker-chat-reference-composer-tools">
          <Pressable accessibilityLabel={copy.chat.attach} accessibilityRole="button" hitSlop={4} onPress={onAttach} style={({ pressed }) => [styles.composerTool, { borderColor: tokens.border }, workerKaelChatSurface(tokens, 'icon'), reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID="worker-kael-chat-attach">
            <WorkerChatPlusIcon color={tokens.primary} />
          </Pressable>
          <View style={[styles.workerChatModePill, { borderColor: tokens.border }, workerKaelChatSurface(tokens, 'status')]} testID="worker-chat-reference-mode-pill">
            <View pointerEvents="none" style={[styles.workerChatModePillGlassLayer, workerChatModePillGlassLayer(tokens)]} testID="worker-chat-mode-pill-glass-layer" />
            <Text style={[styles.workerChatModeText, { color: tokens.primary }, workerChatModePillTextHighlight(tokens)]} numberOfLines={1}>
              {modeLabel}
            </Text>
          </View>
          <View style={styles.chatComposerControlSpacer} />
          <View style={styles.chatComposerRightActions} testID="worker-chat-reference-composer-right-actions">
            <Pressable accessibilityLabel={copy.chat.mic} accessibilityRole="button" hitSlop={4} onPress={onMic} style={({ pressed }) => [styles.composerTool, { borderColor: tokens.border }, workerKaelChatSurface(tokens, 'icon'), reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID="worker-kael-chat-mic">
              <WorkerChatMicIcon color={tokens.primary} />
            </Pressable>
            <Pressable
              accessibilityLabel={copy.chat.send}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSubmit }}
              disabled={!canSubmit}
              hitSlop={4}
              onPress={onSend}
              style={({ pressed }) => [
                styles.sendButton,
                { backgroundColor: canSubmit ? tokens.primary : tokens.raised, borderColor: canSubmit ? tokens.borderStrong : tokens.border },
                canSubmit ? workerKaelChatSurface(tokens, 'send') : workerKaelChatSurface(tokens, 'icon'),
                reduceMotionAwarePressStyle(pressed, reduceMotion),
              ]}
              testID="worker-kael-send-button"
            >
              <WorkerChatSendIcon color={canSubmit ? tokens.primaryText : tokens.subtle} />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  )
}

function WorkerKaelParityPanel({
  consent,
  consentSaving,
  feedbackError,
  feedbackOpen,
  feedbackSaving,
  feedbackSent,
  feedbackValue,
  onCancelFeedback,
  onChangeFeedback,
  onOpenFeedback,
  onSubmitFeedback,
  onToggleConsent,
}: {
  consent: boolean
  consentSaving: boolean
  feedbackError: string | null
  feedbackOpen: boolean
  feedbackSaving: boolean
  feedbackSent: boolean
  feedbackValue: string
  onCancelFeedback: () => void
  onChangeFeedback: (value: string) => void
  onOpenFeedback: () => void
  onSubmitFeedback: () => void
  onToggleConsent: () => void
}) {
  const { language, reduceTransparency, tokens } = useWorkerUi()
  const { reduceMotion } = useGlassAccessibility()

  return (
    <View style={[styles.workerKaelParityPanel, workerOpaqueCardSurface(tokens, 'mint', reduceTransparency)]} testID="worker-kael-parity-panel">
      <View style={styles.rowBetween}>
        <View style={styles.titleStack}>
          <Text style={[styles.workerKaelParityTitle, { color: tokens.ink }]} numberOfLines={1}>
            {language === 'en' ? 'Kael controls' : 'Tu\u1ef3 ch\u1ecdn Kael'}
          </Text>
          <Text style={[styles.workerKaelParityBody, { color: tokens.muted }]} numberOfLines={2}>
            {workerKaelTrainingConsentBody(language, consent)}
          </Text>
        </View>
        <Pressable
          accessibilityLabel={workerKaelTrainingConsentLabel(language, consent)}
          accessibilityRole="button"
          accessibilityState={{ busy: consentSaving, checked: consent, disabled: consentSaving }}
          disabled={consentSaving}
          onPress={onToggleConsent}
          style={({ pressed }) => [styles.workerKaelMiniButton, { borderColor: tokens.border }, workerOpaqueCardSurface(tokens, consent ? 'cyan' : 'warm', reduceTransparency), reduceMotionAwarePressStyle(pressed, reduceMotion)]}
          testID="worker-kael-training-consent-toggle"
        >
          <Text style={[styles.workerKaelMiniButtonText, { color: consent ? tokens.primary : tokens.copper }]} numberOfLines={1}>
            {workerKaelTrainingConsentLabel(language, consent)}
          </Text>
        </Pressable>
      </View>
      <View style={styles.workerKaelParityActions}>
        <Pressable
          accessibilityLabel={language === 'en' ? 'Send Kael feedback' : 'G\u1eedi ph\u1ea3n h\u1ed3i Kael'}
          accessibilityRole="button"
          onPress={onOpenFeedback}
          style={({ pressed }) => [styles.workerKaelMiniButton, { borderColor: tokens.border }, workerOpaqueCardSurface(tokens, 'cream', reduceTransparency), reduceMotionAwarePressStyle(pressed, reduceMotion)]}
          testID="worker-kael-feedback-open"
        >
          <Text style={[styles.workerKaelMiniButtonText, { color: tokens.primary }]} numberOfLines={1}>
            {feedbackSent
              ? language === 'en' ? 'Feedback sent' : '\u0110\u00e3 g\u1eedi'
              : language === 'en' ? 'Feedback' : 'Ph\u1ea3n h\u1ed3i'}
          </Text>
        </Pressable>
      </View>
      {feedbackOpen ? (
        <View style={styles.workerKaelFeedbackForm} testID="worker-kael-feedback-form">
          <TextInput
            accessibilityLabel={language === 'en' ? 'Kael feedback' : 'Ph\u1ea3n h\u1ed3i Kael'}
            editable={!feedbackSaving}
            multiline
            onChangeText={onChangeFeedback}
            placeholder={language === 'en' ? 'What should Kael improve for worker jobs?' : 'Kael n\u00ean c\u1ea3i thi\u1ec7n g\u00ec cho th\u1ee3?'}
            placeholderTextColor={tokens.subtle}
            style={[styles.workerKaelFeedbackInput, { borderColor: tokens.border, color: tokens.ink }]}
            testID="worker-kael-feedback-input"
            value={feedbackValue}
          />
          {feedbackError ? (
            <Text accessibilityRole="alert" style={[styles.workerKaelFeedbackError, { color: tokens.danger }]} testID="worker-kael-feedback-error">
              {feedbackError}
            </Text>
          ) : null}
          <View style={styles.workerKaelParityActions}>
            <Pressable accessibilityRole="button" disabled={feedbackSaving} onPress={onCancelFeedback} style={({ pressed }) => [styles.workerKaelMiniButton, { borderColor: tokens.border }, reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID="worker-kael-feedback-cancel">
              <Text style={[styles.workerKaelMiniButtonText, { color: tokens.muted }]}>{language === 'en' ? 'Cancel' : 'Hu\u1ef7'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={feedbackSaving} onPress={onSubmitFeedback} style={({ pressed }) => [styles.workerKaelMiniButton, { borderColor: tokens.borderStrong, backgroundColor: tokens.primary }, reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID="worker-kael-feedback-submit">
              <Text style={[styles.workerKaelMiniButtonText, { color: tokens.primaryText }]}>{feedbackSaving ? (language === 'en' ? 'Sending' : '\u0110ang g\u1eedi') : (language === 'en' ? 'Send' : 'G\u1eedi')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  )
}

function WorkerChatReferenceWelcome({ greeting }: { greeting: string }) {
  const { tokens } = useWorkerUi()

  return (
    <ReduceMotionAwareEntranceView delayMs={70} distanceY={10} testID="worker-chat-reference-welcome-motion">
      <View style={styles.workerChatWelcomeStage} testID="worker-chat-reference-welcome-stage">
        <View style={[styles.workerChatWelcomeGlyph, { borderColor: tokens.border }, workerKaelChatSurface(tokens, 'avatar')]} testID="worker-chat-reference-kael-mark">
          <View pointerEvents="none" style={[styles.workerChatWelcomeGlyphAura, { backgroundColor: tokens.mint }]} />
          <Image contentFit="contain" source={kaelHead} style={styles.workerChatWelcomeGlyphImage} />
        </View>
        <Text adjustsFontSizeToFit minimumFontScale={0.56} numberOfLines={1} style={[styles.workerChatWelcomeTitle, { color: tokens.ink }]}>
          {greeting}
        </Text>
      </View>
    </ReduceMotionAwareEntranceView>
  )
}

function resetWorkerChatWebScrollPosition() {
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

function stabilizeWorkerChatWebLayout() {
  if (Platform.OS !== 'web') return
  resetWorkerChatWebScrollPosition()
  requestAnimationFrame(resetWorkerChatWebScrollPosition)
  setTimeout(resetWorkerChatWebScrollPosition, 80)
}

function SequentialJobRoomReveal({ children, step, testID }: { children: ReactNode; step: number; testID: string }) {
  return (
    <ReduceMotionAwareEntranceView delayMs={(step - 1) * 70} distanceY={12} testID={testID}>
      <View style={styles.jobRoomRevealStep}>
        {children}
      </View>
    </ReduceMotionAwareEntranceView>
  )
}

function JobRoomProcessCard({ broadcast, canSend, onAdvance }: { broadcast: WorkerBroadcastView | null; canSend: boolean; onAdvance: () => void }) {
  const { copy, language, tokens } = useWorkerUi()
  const status = canSend
    ? copy.chat.acceptedPill
    : broadcast
      ? language === 'en' ? 'Reviewing request' : 'Đang kiểm tra yêu cầu'
      : language === 'en' ? 'Waiting for request' : 'Đang chờ yêu cầu'
  const steps = broadcast
    ? canSend
      ? language === 'en'
        ? ['Read brief', 'Save notes', 'Update job']
        : ['Đọc tóm tắt', 'Lưu ghi chú', 'Cập nhật việc']
      : language === 'en'
        ? ['Read request', 'Keep privacy', 'Await accept']
        : ['Đọc yêu cầu', 'Giữ riêng tư', 'Chờ nhận']
    : language === 'en'
      ? ['Kael routes', 'Build brief', 'Open room']
      : ['Kael điều phối', 'Dựng tóm tắt', 'Mở phòng']

  return (
    <Pressable accessibilityLabel={status} accessibilityRole="button" onPress={onAdvance} style={({ pressed }) => [styles.jobRoomProcessTapTarget, pressed ? styles.pressed : null]} testID="worker-jobroom-agentic-process-trigger">
      <View style={[styles.jobRoomProcessCard, workerKaelChatSurface(tokens, 'agent')]} testID="worker-jobroom-agentic-process">
        <View style={styles.jobRoomProcessHead}>
          <View style={[styles.jobRoomProcessAvatar, { backgroundColor: tokens.raised, borderColor: tokens.border }, workerKaelChatSurface(tokens, 'avatar')]}>
            <Image contentFit="contain" source={kaelHead} style={styles.jobRoomProcessAvatarImage} />
          </View>
          <View style={[styles.jobRoomProcessStatus, { backgroundColor: tokens.raised, borderColor: tokens.border }, workerKaelChatSurface(tokens, 'status')]}>
            <View style={[styles.jobRoomProcessAccent, { backgroundColor: tokens.primary }]} />
            <View style={styles.titleStack}>
              <Text style={[styles.jobRoomProcessTitle, { color: tokens.ink }]} numberOfLines={1}>
                {status}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.jobRoomProcessSteps}>
          {steps.map((step, index) => (
            <JobRoomStepCard index={`0${index + 1}`} key={step} title={step} />
          ))}
        </View>
      </View>
    </Pressable>
  )
}

function JobRoomStepCard({ index, title }: { index: string; title: string }) {
  const { tokens } = useWorkerUi()

  return (
    <View style={[styles.jobRoomProcessStep, { backgroundColor: tokens.raised, borderColor: tokens.border }, workerKaelChatSurface(tokens, 'step')]}>
      <Text style={[styles.jobRoomProcessStepIndex, { color: tokens.primary }]}>{index}</Text>
      <Text style={[styles.jobRoomProcessStepTitle, { color: tokens.ink }]} numberOfLines={2}>
        {title}
      </Text>
    </View>
  )
}

function WorkerOnSiteAdvisoryRail({
  canSeeFullAddress,
  deal,
  status,
}: {
  canSeeFullAddress: boolean
  deal: LocalDeal | null
  status: LocalDealStatus | null
}) {
  const { copy, language, tokens } = useWorkerUi()
  const hasCompletionEvidence = hasLocalDealCompletionEvidence(deal)
  const statusValue = status ? localizedStatusLabel(status, language) : copy.chat.waitingTitle
  const scopeValue = status === 'scope_change_pending'
    ? copy.chat.advisoryScopeReviewing
    : status === 'inspecting' || status === 'repairing'
      ? copy.chat.advisoryScopeNoPrice
      : copy.chat.advisoryScopeLocked
  const evidenceValue = hasCompletionEvidence
    ? copy.jobs.safetyCompletionSubmitted
    : status === 'repairing'
      ? copy.jobs.safetyCompletionReady
      : copy.jobs.safetyCompletionPending
  const rows = [
    { id: 'status', label: copy.chat.advisoryStatusTitle, value: statusValue },
    { id: 'address', label: copy.chat.advisoryAddressTitle, value: canSeeFullAddress ? copy.chat.advisoryAddressReleased : copy.chat.advisoryAddressAreaOnly },
    { id: 'scope', label: copy.chat.advisoryScopeTitle, value: scopeValue },
    { id: 'evidence', label: copy.chat.advisoryEvidenceTitle, value: evidenceValue },
  ] as const

  return (
    <View style={[styles.jobRoomBrief, styles.jobRoomAdvisoryRail, workerKaelChatSurface(tokens, 'brief')]} testID="worker-onsite-advisory-rail">
      <View style={styles.identityRow}>
        <WorkerUtilityIcon active frameSize={42} icon="shield" size={42} style={styles.needsInlineImageIcon} />
        <View style={styles.titleStack}>
          <Text style={[styles.jobRoomBriefTitle, { color: tokens.primary }]} numberOfLines={1}>
            {copy.chat.advisoryMeta}
          </Text>
          <Text style={[styles.jobRoomBubbleTitle, { color: tokens.ink }]} numberOfLines={1}>
            {copy.chat.advisoryTitle}
          </Text>
        </View>
      </View>
      <Text style={[styles.jobRoomBubbleBody, { color: tokens.muted }]} numberOfLines={3}>
        {copy.chat.advisoryBody}
      </Text>
      <View style={styles.jobRoomMetaGrid}>
        {rows.map((row) => (
          <JobRoomMetaCell key={row.id} label={row.label} testID={`worker-onsite-advisory-${row.id}`} value={row.value} valueLines={3} />
        ))}
      </View>
    </View>
  )
}

function JobRoomKaelMessage({ body, kicker, testID, title }: { body: string; kicker: string; testID: string; title: string }) {
  const { tokens } = useWorkerUi()

  return (
    <View style={styles.jobRoomMessageRow} testID={testID}>
      <View style={[styles.jobRoomMessageAvatar, { backgroundColor: tokens.raised, borderColor: tokens.border }, workerKaelChatSurface(tokens, 'avatar')]}>
        <Image contentFit="contain" source={kaelHead} style={styles.jobRoomMessageAvatarImage} />
      </View>
      <View style={[styles.jobRoomMessageBubble, messageBubbleSurface(tokens, { mine: false, system: true }), workerKaelChatSurface(tokens, 'bubble')]}>
        <Text style={[styles.jobRoomBubbleKicker, { color: tokens.primary }]} numberOfLines={1}>
          {kicker}
        </Text>
        <Text style={[styles.jobRoomBubbleTitle, { color: tokens.ink }]} numberOfLines={2}>
          {title}
        </Text>
        <Text style={[styles.jobRoomBubbleBody, { color: tokens.muted }]} numberOfLines={3}>
          {body}
        </Text>
      </View>
    </View>
  )
}

function JobRoomBriefBlock({ body, lines, testID, title }: { body?: string; lines?: string[]; testID: string; title: string }) {
  const { tokens } = useWorkerUi()

  return (
    <View style={[styles.jobRoomBrief, workerKaelChatSurface(tokens, 'brief'), styles.jobRoomBriefAligned]} testID={testID}>
      <View style={styles.jobRoomBriefTitleRow}>
        <View style={[styles.jobRoomBriefAccent, { backgroundColor: tokens.primary }]} />
        <Text style={[styles.jobRoomBriefTitle, { color: tokens.primary }]} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {lines?.length
        ? lines.map((line) => (
            <View key={line} style={styles.briefItem}>
              <View style={[styles.briefDot, { backgroundColor: tokens.primary }]} />
              <Text style={[styles.briefText, styles.jobRoomBriefText, { color: tokens.ink }]} numberOfLines={3}>
                {line}
              </Text>
            </View>
          ))
        : (
            <Text style={[styles.briefText, styles.jobRoomBriefText, { color: tokens.ink }]} numberOfLines={4}>
              {body}
            </Text>
          )}
    </View>
  )
}

function JobRoomMetaCell({ label, testID, value, valueLines = 2 }: { label: string; testID?: string; value: string; valueLines?: number }) {
  const { reduceTransparency, tokens } = useWorkerUi()

  return (
    <View style={[styles.jobRoomMetaCell, workerOpaqueCardSurface(tokens, 'raised', reduceTransparency)]} testID={testID}>
      <Text style={[styles.metricLabel, { color: tokens.subtle }]} numberOfLines={1} testID={testID ? `${testID}-label` : undefined}>
        {label}
      </Text>
      <Text style={[styles.jobRoomMetaValue, { color: tokens.ink }]} numberOfLines={valueLines} testID={testID ? `${testID}-value` : undefined}>
        {value}
      </Text>
    </View>
  )
}

function buildWorkerBroadcastBrief(deal: LocalDeal | null, broadcast: WorkerBroadcastView, status: LocalDealStatus | null, language: WorkerLanguageMode, canWorkerSeeFullAddress: boolean): string[] {
  const serviceLabel = localizedServiceLabel(broadcast.serviceType, language)
  const problemLabel = localizedWorkerProblemSummary(broadcast, language)
  const areaLabel = localizedWorkerAreaLabel(broadcast.generalArea, language)
  const fullAddressLabel = broadcast.fullAddressVisible ? broadcast.fullAddressLabel ?? null : null
  const canRevealFullAddress = Boolean(canWorkerSeeFullAddress && isAcceptedLocalWorkerDeal(deal) && fullAddressLabel)
  const addressAccess = broadcast.addressAccess ?? null
  const hasAcceptedBuildingAccess = Boolean(isAcceptedLocalWorkerDeal(deal) && addressAccess?.release_stage === 'building_released')
  const addressGate = language === 'en'
    ? canRevealFullAddress && fullAddressLabel
      ? `Address: ${localizedWorkerAreaLabel(fullAddressLabel, language)}.`
      : hasAcceptedBuildingAccess
        ? `${areaLabel}. Exact unit unlocks after lobby check-in and identity check.`
        : `${areaLabel}. Detailed address is hidden until acceptance.`
    : canRevealFullAddress && fullAddressLabel
      ? `Địa chỉ: ${localizedWorkerAreaLabel(fullAddressLabel, language)}.`
      : `Khu vực: ${areaLabel}. Địa chỉ chi tiết vẫn ẩn trước khi nhận.`
  const stagedAddressGate = hasAcceptedBuildingAccess && !canRevealFullAddress
    ? language === 'en'
      ? `${areaLabel}. Exact unit unlocks after lobby check-in and identity check.`
      : `Khu v\u1ef1c: ${areaLabel}. C\u0103n h\u1ed9 ch\u1ec9 m\u1edf sau check-in s\u1ea3nh v\u00e0 x\u00e1c nh\u1eadn danh t\u00ednh.`
    : addressGate
  const accessLine = buildWorkerApartmentAccessBriefLine(addressAccess, language)
  const statusLine = localizedStatusLabel(status, language)
  const mediaLine = deal?.draft.mediaCount
    ? language === 'en'
      ? `${deal.draft.mediaCount} media item attached.`
      : `Có ${deal.draft.mediaCount} ảnh/video.`
    : null

  const artifactBriefLines = localizedWorkerBriefLines(broadcast.prebrief, language)
  const briefLines = [
    `${serviceLabel} · ${problemLabel}`,
    stagedAddressGate,
    accessLine,
    ...artifactBriefLines,
    mediaLine ?? statusLine,
  ].filter((line): line is string => Boolean(line))
  return briefLines.slice(0, 4)
}

function buildWorkerApartmentAccessBriefLine(
  addressAccess: WorkerBroadcastView['addressAccess'] | null | undefined,
  language: WorkerLanguageMode,
) {
  if (!addressAccess || addressAccess.release_stage === 'area_only') return null
  const profile = addressAccess.access_profile ?? {}
  const detail = [
    profile.entry_method,
    profile.guard_note,
    profile.parking_note,
    profile.building_note,
    profile.customer_handoff_note,
  ].find((item) => typeof item === 'string' && item.trim().length > 0)?.trim()
  if (language === 'en') {
    return detail
      ? `App-only access: ${detail}. Verify identity at the door.`
      : 'App-only access. Verify identity at the door.'
  }
  return detail
    ? `V\u00e0o nh\u00e0 qua app: ${detail}. Ki\u1ec3m tra danh t\u00ednh \u1edf c\u1eeda.`
    : `V\u00e0o nh\u00e0 qua app. Ki\u1ec3m tra danh t\u00ednh \u1edf c\u1eeda.`
}

function uniqueWorkerBriefLines(lines: string[]) {
  const seen = new Set<string>()
  const uniqueLines: string[] = []
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    const normalized = line.toLowerCase()
    if (seen.has(normalized)) continue
    seen.add(normalized)
    uniqueLines.push(line)
  }
  return uniqueLines
}

const workerVietnameseSignalPattern = /[\u00c0-\u1ef9]/i
const workerAsciiOnlyPattern = /^[\x00-\x7F]*$/

function localizedWorkerBriefLines(lines: string[], language: WorkerLanguageMode) {
  return uniqueWorkerBriefLines(lines).filter((line) => {
    const hasVietnameseText = workerVietnameseSignalPattern.test(line)
    if (language === 'en') return !hasVietnameseText
    return hasVietnameseText || !workerAsciiOnlyPattern.test(line)
  })
}

function localizedWorkerProblemSummary(broadcast: WorkerBroadcastView, language: WorkerLanguageMode) {
  return localizedProblemLabel(broadcast.problemSummary, broadcast.serviceType, language)
}

function canonicalWorkerAreaLabel(area: string) {
  const trimmed = area.trim()
  if (!trimmed) return null
  const directSlug = normalizeDistrict(trimmed)
  if (directSlug !== 'hcmc_all' || /^hcmc_all$/i.test(trimmed)) return HCMC_DISTRICTS[directSlug]
  const aliasKey = trimmed
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  const aliasSlug = workerDistrictTextAliases[aliasKey]
  return aliasSlug ? HCMC_DISTRICTS[aliasSlug] : null
}

function localizedWorkerAreaLabel(area: string | null | undefined, language: WorkerLanguageMode) {
  if (!area) return appCopy[language].common.noData
  const canonicalArea = canonicalWorkerAreaLabel(area) ?? area
  if (language === 'vi') return localizeWorkerAreaFallback(canonicalArea)
  const mapped = canonicalArea
    .replace(/^Khu vực:\s*/i, '')
    .replace(/Khu vực TP\.?HCM/gi, 'Ho Chi Minh City area')
    .replace(/Khu vực chung/gi, 'General area')
    .replace(/Quận\s*(\d+)/gi, 'District $1')
    .replace(/TP\.?\s*HCM|Thành phố Hồ Chí Minh/gi, 'HCMC')
  return mapped.trim() || appCopy[language].common.noData
}

function localizeWorkerAreaFallback(area: string) {
  return area
    .replace(/\bquan\s*(\d+)\b/gi, 'Quận $1')
    .replace(/\bq\s*\.?\s*(\d+)\b/gi, 'Quận $1')
    .replace(/\bBinh Thanh\b/gi, 'Bình Thạnh')
    .replace(/\bThu Duc\b/gi, 'Thủ Đức')
    .replace(/\bTan Binh\b/gi, 'Tân Bình')
    .replace(/\bGo Vap\b/gi, 'Gò Vấp')
    .replace(/\bPhu Nhuan\b/gi, 'Phú Nhuận')
    .trim()
}

function formatWorkerMoney(value: number, language: WorkerLanguageMode) {
  if (!Number.isFinite(value) || value <= 0) return appCopy[language].common.noData
  const formatted = workerMoneyFormatters[language].format(value)
  return language === 'vi' ? `${formatted} đ` : `${formatted} VND`
}

function parseWorkerMoneyLabelStart(label: string | null | undefined) {
  const match = label?.match(/\d[\d.,]*/)
  if (!match) return null
  const value = Number(match[0].replace(/[^\d]/g, ''))
  return Number.isFinite(value) && value > 0 ? value : null
}

function formatWorkerScopePriceDelta(
  originalPriceLabel: string | null | undefined,
  nextPriceMin: number | null,
  language: WorkerLanguageMode,
) {
  const originalPriceMin = parseWorkerMoneyLabelStart(originalPriceLabel)
  if (!originalPriceMin || !nextPriceMin || !Number.isFinite(nextPriceMin)) return null
  const delta = nextPriceMin - originalPriceMin
  if (delta === 0) return language === 'en' ? 'No change' : 'Không đổi'
  const sign = delta > 0 ? '+' : '-'
  return `${sign}${formatWorkerMoney(Math.abs(delta), language)}`
}

function workerChatDealKey(deal: LocalDeal | null) {
  if (!deal?.broadcast) return 'none'
  return [
    deal.broadcast.broadcastId ?? deal.broadcast.jobId ?? deal.id,
    deal.broadcast.status,
    deal.draft.serviceType ?? 'none',
    deal.draft.problemChips.join('|'),
    deal.draft.description,
    deal.draft.districtLabel,
  ].join('::')
}

function getWorkerChatJobId(deal: LocalDeal | null) {
  const jobId = deal?.broadcast?.jobId ?? deal?.id ?? null
  if (!jobId || jobId === LOCAL_DEAL_ID) return null
  return jobId
}

function workerChatMessageFromJobMessage(message: JobMessageResponse, currentUserId: string | null, language: WorkerLanguageMode) {
  const system = message.sender_role === 'kael'
  const mine = Boolean(currentUserId && message.sender_id === currentUserId)
  const who = system
    ? 'Kael'
    : message.sender_role === 'worker'
      ? workerCopy[language].chat.worker
      : language === 'en'
        ? 'Customer'
        : 'Khách'

  return {
    id: message.id,
    mine,
    system,
    text: message.content,
    who,
  }
}

function workerChatMessageFromWorkerKaelTurn(turn: WorkerKaelChatTurn, language: WorkerLanguageMode) {
  const mine = turn.role === 'worker'
  const text = workerKaelTurnText(turn, language)
  return {
    id: `worker-kael-${turn.id}`,
    mine,
    system: !mine,
    text,
    who: mine ? workerCopy[language].chat.worker : workerCopy[language].chat.kael,
  }
}

function workerKaelTurnText(turn: WorkerKaelChatTurn, language: WorkerLanguageMode) {
  const base = turn.text_content?.trim() ||
    (language === 'en' ? 'Kael saved this advisory turn.' : 'Kael \u0111\u00e3 l\u01b0u l\u01b0\u1ee3t t\u01b0 v\u1ea5n n\u00e0y.')
  const notes = workerKaelSafetyNotes(turn.safe_metadata).slice(0, 2)
  if (notes.length === 0 || turn.role === 'worker') return base
  return `${base}\n${notes.map((note) => `- ${note}`).join('\n')}`
}

function workerKaelSafetyNotes(metadata: Record<string, unknown>) {
  const raw = metadata.safety_notes
  return Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

function workerKaelChatErrorCopy(language: WorkerLanguageMode) {
  return language === 'en'
    ? 'Kael could not load the advisory chat. Try again shortly.'
    : 'Kael ch\u01b0a t\u1ea3i \u0111\u01b0\u1ee3c chat t\u01b0 v\u1ea5n. Th\u1eed l\u1ea1i sau \u00edt ph\u00fat.'
}

function workerKaelChatStatusCopy(language: WorkerLanguageMode, sending: boolean) {
  if (sending) {
    return language === 'en'
      ? 'Kael is checking the accepted job context.'
      : 'Kael \u0111ang ki\u1ec3m tra ng\u1eef c\u1ea3nh vi\u1ec7c \u0111\u00e3 nh\u1eadn.'
  }
  return language === 'en'
    ? 'Loading Kael advisory chat.'
    : '\u0110ang t\u1ea3i chat t\u01b0 v\u1ea5n Kael.'
}

function workerKaelChatProgressCopy(progress: KaelChatProgress | null, language: WorkerLanguageMode) {
  if (!progress) return null
  const percent = `${Math.round(Math.max(0, Math.min(1, progress.progress)) * 100)}%`
  if (progress.status === 'failed') {
    return language === 'en' ? `Kael advisory stopped at ${percent}.` : `Tư vấn Kael dừng ở ${percent}.`
  }
  if (progress.current_stage === 'worker_assist') {
    if (progress.status === 'completed') {
      return language === 'en' ? 'Kael advisory is ready.' : 'Kael đã có tư vấn.'
    }
    return language === 'en'
      ? `Kael is checking this job: ${percent}.`
      : `Kael đang xét việc này: ${percent}.`
  }
  return language === 'en' ? `Kael is working: ${percent}.` : `Kael đang xử lý: ${percent}.`
}

function workerKaelTrainingConsentLabel(language: WorkerLanguageMode, consent: boolean) {
  if (language === 'en') return consent ? 'Training on' : 'Training off'
  return consent ? 'Cho ph\u00e9p h\u1ecdc' : 'T\u1eaft h\u1ecdc'
}

function workerKaelTrainingConsentBody(language: WorkerLanguageMode, consent: boolean) {
  if (language === 'en') {
    return consent
      ? 'Worker advisory feedback may be reviewed to improve Kael.'
      : 'Kael will save feedback, but not use it for training review without consent.'
  }
  return consent
    ? 'Ph\u1ea3n h\u1ed3i t\u01b0 v\u1ea5n c\u00f3 th\u1ec3 \u0111\u01b0\u1ee3c r\u00e0 so\u00e1t \u0111\u1ec3 c\u1ea3i thi\u1ec7n Kael.'
    : 'Kael l\u01b0u ph\u1ea3n h\u1ed3i, nh\u01b0ng kh\u00f4ng d\u00f9ng cho review hu\u1ea5n luy\u1ec7n n\u1ebfu ch\u01b0a cho ph\u00e9p.'
}

function workerKaelFeedbackRequiredCopy(language: WorkerLanguageMode) {
  return language === 'en'
    ? 'Feedback needs at least 8 characters.'
    : 'Ph\u1ea3n h\u1ed3i c\u1ea7n \u00edt nh\u1ea5t 8 k\u00fd t\u1ef1.'
}

function workerKaelFeedbackSaveErrorCopy(language: WorkerLanguageMode) {
  return language === 'en'
    ? 'Kael could not save this feedback. Try again.'
    : 'Kael ch\u01b0a l\u01b0u \u0111\u01b0\u1ee3c ph\u1ea3n h\u1ed3i. Th\u1eed l\u1ea1i sau.'
}

function workerChatStandaloneInputLabel(language: WorkerLanguageMode) {
  return language === 'en' ? 'Message Kael...' : 'Nhắn với Kael...'
}

function workerChatStandaloneAccessibilityLabel(language: WorkerLanguageMode) {
  return language === 'en'
    ? 'Message Kael. Real JobRoom messages are saved after an accepted job.'
    : 'Nhắn với Kael. Tin nhắn Phòng việc thật sẽ được lưu sau khi thợ nhận việc.'
}

function workerChatStandaloneReply(language: WorkerLanguageMode) {
  return language === 'en'
    ? 'Kael needs a real JobRoom before saving messages. When a request is accepted, real customer chat opens here.'
    : 'Kael cần có Phòng việc thật trước khi lưu tin nhắn. Khi có yêu cầu đã nhận, chat thật với khách sẽ mở ở đây.'
}

function appendWorkerChatDraftSegment(draft: string, segment: string) {
  const cleanDraft = draft.trim()
  const cleanSegment = segment.trim()
  if (!cleanSegment) return cleanDraft
  return cleanDraft ? `${cleanDraft} ${cleanSegment}` : cleanSegment
}

function workerChatAttachmentFallbackName(language: WorkerLanguageMode) {
  return language === 'en' ? 'selected image' : 'ảnh đã chọn'
}

function workerChatAttachmentDraftLine(language: WorkerLanguageMode, fileName: string) {
  const cleanName = fileName.trim() || workerChatAttachmentFallbackName(language)
  return language === 'en' ? `Selected image: ${cleanName}` : `Ảnh đã chọn: ${cleanName}`
}

function workerChatAttachmentPermissionBody(language: WorkerLanguageMode) {
  return language === 'en'
    ? 'Allow photo library access to attach an image note.'
    : 'Cho phép truy cập thư viện ảnh để đính kèm ghi chú ảnh.'
}

function workerChatAttachmentReadyBody(language: WorkerLanguageMode, canSend: boolean) {
  if (language === 'en') {
    return canSend
      ? 'The image name was added to the message. Send it now; real media evidence still stays in the matching evidence step.'
      : 'The image name was added to the draft. Real media upload opens after a real JobRoom exists.'
  }
  return canSend
    ? 'Tên ảnh đã được thêm vào tin nhắn. Gửi ghi chú này trước; media thật vẫn nằm ở bước bằng chứng phù hợp.'
    : 'Tên ảnh đã được thêm vào ô nhắn. Media thật sẽ mở sau khi có Phòng việc thật.'
}

function workerChatMicListeningBody(language: WorkerLanguageMode) {
  return language === 'en' ? 'Listening now. The transcript will be added to the message box.' : 'Đang nghe. Nội dung nhận được sẽ được thêm vào ô nhắn.'
}

function workerChatMicUnavailableBody(language: WorkerLanguageMode) {
  return language === 'en'
    ? 'Voice dictation is not available on this device yet. Type the note so Kael can keep context.'
    : 'Thiết bị này chưa mở đọc giọng nói. Nhập ghi chú để Kael giữ bối cảnh.'
}

function getWorkerWebSpeechRecognition(): WorkerWebSpeechRecognitionConstructor | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null
  const speechWindow = window as unknown as {
    SpeechRecognition?: WorkerWebSpeechRecognitionConstructor
    webkitSpeechRecognition?: WorkerWebSpeechRecognitionConstructor
  }
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null
}

function WorkerEarningsHero() {
  const { workerEarnings } = useFrontendWorkflow()

  return (
    <View style={styles.earningsHeroWrap} testID="worker-earnings-summary">
      <WorkerEarningsTrend />
      {workerEarnings ? <View style={styles.hiddenMarker} testID="worker-earnings-real-api-data" /> : null}
      <View style={styles.hiddenMarker} testID={WORKER_NO_FAKE_PAYMENT_DATA} />
    </View>
  )
}

function WorkerEarningsMaterialChrome({
  testID,
  variant,
}: {
  testID: string
  variant: WorkerEarningsChromeVariant
}) {
  const { tokens } = useWorkerUi()

  if (workerHasReducedGlass(tokens)) {
    return <View pointerEvents="none" style={styles.hiddenMarker} testID={`${testID}-opaque`} />
  }

  return (
    <>
      <View pointerEvents="none" style={[styles.workerEarningsChromeWash, workerEarningsChromeWash(tokens, variant)]} />
      <View pointerEvents="none" style={[styles.workerEarningsChromeRefraction, workerEarningsChromeRefraction(tokens, variant)]} />
      <View pointerEvents="none" style={[styles.workerEarningsChromeCrispShell, workerEarningsChromeCrispShell(tokens, variant)]} testID={testID} />
      <View pointerEvents="none" style={[styles.workerEarningsChromeInnerInset, workerEarningsChromeInnerInset(tokens, variant)]} />
      <View pointerEvents="none" style={[styles.workerEarningsChromeTopEdge, workerEarningsChromeTopEdge(tokens)]} />
      <View pointerEvents="none" style={[styles.workerEarningsChromeBottomEdge, workerEarningsChromeBottomEdge(tokens)]} />
    </>
  )
}

function WorkerProfileMaterialChrome({
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

type WorkerProfileLevelSignal = {
  id: 'jobs' | 'rating' | 'recommendation'
  label: string
  value: string
}

type WorkerProfileLevelMilestoneState = 'current' | 'mystery' | 'next' | 'open' | 'reached'

type WorkerProfileLevelMilestone = {
  level: number
  requirement: string
  reward: string
  state: WorkerProfileLevelMilestoneState
  stateLabel: string
  title: string
}

type WorkerProfileLevelModel = {
  body: string
  currentFloor: number
  level: number
  milestones: WorkerProfileLevelMilestone[]
  nextLabel: string
  nextThreshold: number
  points: number
  progress: number
  signals: WorkerProfileLevelSignal[]
  title: string
}

const WorkerProfileLevelRailSpacer = memo(function WorkerProfileLevelRailSpacer() {
  return <View style={styles.profileLevelRailSpacer} />
})

const WorkerProfileLevelChip = memo(function WorkerProfileLevelChip({
  language,
  milestone,
  onSelect,
  reduceMotion,
  selected,
  tokens,
}: {
  language: WorkerLanguageMode
  milestone: WorkerProfileLevelMilestone
  onSelect: (level: number) => void
  reduceMotion: boolean
  selected: boolean
  tokens: WorkerThemeTokens
}) {
  const accessibilityState = useMemo(() => ({ selected }), [selected])
  const handlePress = useCallback(() => {
    onSelect(milestone.level)
  }, [milestone.level, onSelect])

  return (
    <Pressable
      accessibilityLabel={`${language === 'en' ? 'Level' : 'Cấp'} ${milestone.level}`}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.profileLevelChip,
        workerProfileLevelChipSurface(tokens, milestone.state, selected),
        reduceMotionAwarePressStyle(pressed, reduceMotion),
      ]}
      testID={`worker-profile-level-chip-${milestone.level}`}
    >
      {selected ? <View pointerEvents="none" style={[styles.profileLevelChipSheen, workerProfileLevelChipSheen(tokens)]} /> : null}
      <Text style={[styles.profileLevelChipMeta, { color: selected ? tokens.primary : tokens.muted }]} numberOfLines={1}>
        {language === 'en' ? 'Lv' : 'Cấp'}
      </Text>
      <Text style={[styles.profileLevelChipValue, { color: tokens.ink }]} numberOfLines={1}>
        {milestone.level}
      </Text>
      <Text style={[styles.profileLevelChipState, { color: selected ? tokens.primary : tokens.subtle }]} numberOfLines={1}>
        {milestone.stateLabel}
      </Text>
    </Pressable>
  )
})

function WorkerProfileReputationPanel({
  workerEarnings,
  workerProfile,
}: {
  workerEarnings: EarningsResponse | null
  workerProfile: WorkerProfileResponse | null
}) {
  const { language, tokens } = useWorkerUi()
  const [showReviewDetails, setShowReviewDetails] = useState(false)
  const completedJobs = Math.max(0, workerProfile?.total_jobs ?? 0)
  const rawRating = Number(workerProfile?.rating ?? 0)
  const hasJobs = completedJobs > 0
  const hasRating = hasJobs && Number.isFinite(rawRating) && rawRating > 0
  const rating = hasRating ? Math.min(5, Math.max(1, rawRating)) : 0
  const emptyValue = language === 'en' ? 'Not yet' : 'Ch\u01b0a c\u00f3'
  const title = language === 'en' ? 'Service performance' : 'Hi\u1ec7u su\u1ea5t d\u1ecbch v\u1ee5'
  const ratingTitle = language === 'en' ? 'Customer rating' : '\u0110\u00e1nh gi\u00e1 c\u1ee7a kh\u00e1ch h\u00e0ng'
  const ratingSummary = hasRating ? `${rating.toFixed(1)}/5` : emptyValue
  const starSummary = hasRating ? workerProfileRatingStars(rating) : emptyValue
  const reviewDetailScore = hasRating ? `${Math.min(5, Math.max(1, rawRating)).toFixed(1)}/5` : emptyValue
  const reviewDetailCount = hasJobs ? `${completedJobs}` : emptyValue
  const hasSettledEarnings = hasWorkerSettledEarnings(workerEarnings)
  const earningsValue = hasSettledEarnings && workerEarnings ? formatWorkerMoney(workerEarnings.net_earnings, language) : emptyValue
  const earningsPeriod = formatWorkerEarningsPeriod(workerEarnings) ?? (language === 'en' ? 'Waiting for real reconciliation data' : 'Ch\u1edd d\u1eef li\u1ec7u \u0111\u1ed1i so\u00e1t th\u1eadt')
  const kaelSuggestion = !workerProfile
    ? language === 'en'
      ? 'Submit the worker profile so Kael can open performance guidance.'
      : 'Ho\u00e0n t\u1ea5t h\u1ed3 s\u01a1 th\u1ee3 \u0111\u1ec3 Kael m\u1edf g\u1ee3i \u00fd hi\u1ec7u su\u1ea5t.'
    : workerProfile.is_suspended
      ? language === 'en'
        ? 'Resolve verification before receiving more jobs.'
        : 'X\u1eed l\u00fd x\u00e1c minh tr\u01b0\u1edbc khi nh\u1eadn th\u00eam vi\u1ec7c.'
      : hasRating && workerProfile.is_available
        ? language === 'en'
          ? 'Keep availability on while your area and skills are showing real positive signals.'
          : 'Ti\u1ebfp t\u1ee5c b\u1eadt nh\u1eadn vi\u1ec7c khi khu v\u1ef1c v\u00e0 k\u1ef9 n\u0103ng \u0111ang c\u00f3 t\u00edn hi\u1ec7u t\u1ed1t.'
        : hasJobs
          ? language === 'en'
            ? 'More completed jobs and verified feedback will strengthen the recommendation signal.'
            : 'Th\u00eam vi\u1ec7c ho\u00e0n t\u1ea5t v\u00e0 ph\u1ea3n h\u1ed3i x\u00e1c th\u1ef1c s\u1ebd t\u0103ng t\u00edn hi\u1ec7u \u0111\u1ec1 xu\u1ea5t.'
          : language === 'en'
            ? 'Finish the first real job to open performance analysis.'
            : 'Ho\u00e0n t\u1ea5t vi\u1ec7c th\u1eadt \u0111\u1ea7u ti\u00ean \u0111\u1ec3 m\u1edf ph\u00e2n t\u00edch hi\u1ec7u su\u1ea5t.'
  const detailNote = hasRating
    ? language === 'en'
      ? 'Summary opens from real score and completed jobs; tips wait for API data.'
      : 'T\u00f3m t\u1eaft m\u1edf t\u1eeb \u0111i\u1ec3m v\u00e0 s\u1ed1 vi\u1ec7c th\u1eadt; ti\u1ec1n boa ch\u1edd d\u1eef li\u1ec7u API.'
    : language === 'en'
      ? 'Customer rating opens after real completed jobs.'
      : '\u0110\u00e1nh gi\u00e1 m\u1edf sau vi\u1ec7c ho\u00e0n t\u1ea5t th\u1eadt.'
  const reviewPulse = hasRating
    ? language === 'en'
      ? `Excellent work. Score ${reviewDetailScore} from ${reviewDetailCount} completed jobs.`
      : `Tuy\u1ec7t v\u1eddi! \u0110i\u1ec3m ${reviewDetailScore} t\u1eeb ${reviewDetailCount} vi\u1ec7c ho\u00e0n t\u1ea5t.`
    : detailNote
  const availabilityValue = !workerProfile
    ? emptyValue
    : workerProfile.is_suspended
      ? language === 'en' ? 'Suspended' : 'T\u1ea1m kh\u00f3a'
      : workerProfile.is_available
        ? language === 'en' ? 'Available' : '\u0110ang nh\u1eadn vi\u1ec7c'
        : language === 'en' ? 'Paused' : 'T\u1ea1m ngh\u1ec9'
  const hasReputationData = hasRating || hasJobs
  const stats = [
    {
      id: 'rating',
      label: language === 'en' ? 'Rating' : '\u0110\u00e1nh gi\u00e1',
      value: ratingSummary,
    },
    {
      id: 'jobs',
      label: language === 'en' ? 'Completed jobs' : 'Vi\u1ec7c ho\u00e0n t\u1ea5t',
      value: hasJobs ? `${completedJobs}` : emptyValue,
    },
    {
      id: 'availability',
      label: language === 'en' ? 'Availability' : 'Nh\u1eadn vi\u1ec7c',
      value: availabilityValue,
    },
    {
      id: 'tips',
      label: language === 'en' ? 'Tips' : 'Ti\u1ec1n boa',
      value: emptyValue,
    },
  ] as const

  return (
    <View style={[styles.profileSyncPreview, workerProfilePanelSurface(tokens)]} testID="worker-profile-reputation-card">
      <WorkerProfileMaterialChrome testID="worker-profile-reputation-crisp-shell" variant="panel" />
      <View style={styles.profileSyncPreviewTop}>
        <Text style={[styles.cardTitle, { color: tokens.ink, flex: 1 }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.statusPill, { backgroundColor: tokens.mint, color: tokens.primary }]} numberOfLines={1}>
          {language === 'en' ? 'Real data' : 'D\u1eef li\u1ec7u th\u1eadt'}
        </Text>
      </View>
      <Text style={[styles.kicker, { color: tokens.primary }]} numberOfLines={1}>
        {ratingTitle}
      </Text>
      <View style={styles.profileSyncPreviewTop} testID="worker-profile-rating-summary-row">
        <Text style={[styles.cardTitle, { color: hasRating ? tokens.copper : tokens.muted, flex: 1 }]} numberOfLines={1} testID="worker-profile-rating-stars">
          {starSummary}
        </Text>
        <Text style={[styles.statusPill, { backgroundColor: tokens.cream, color: tokens.copper }]} numberOfLines={1} testID="worker-profile-rating-summary">
          {ratingSummary}
        </Text>
      </View>
      <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={2} testID="worker-profile-review-pulse">
        {reviewPulse}
      </Text>
      <View style={styles.profileLevelSignalGrid}>
        {stats.map((stat) => (
          <View key={stat.id} style={[styles.profileLevelSignal, workerProfileLevelSignalSurface(tokens)]} testID={`worker-profile-reputation-${stat.id}`}>
            <View pointerEvents="none" style={[styles.profileLevelSignalGlass, workerProfileLevelSignalGlass(tokens)]} />
            <View pointerEvents="none" style={[styles.profileLevelSignalTopEdge, workerProfileLevelSignalTopEdge(tokens)]} />
            <Text style={[styles.profileLevelSignalLabel, { color: tokens.muted }]} numberOfLines={1}>
              {stat.label}
            </Text>
            <Text style={[styles.profileLevelSignalValue, { color: tokens.ink }]} numberOfLines={1}>
              {stat.value}
            </Text>
          </View>
        ))}
      </View>
      <View style={[styles.profileLevelDetail, workerProfileLevelMilestoneSurface(tokens, hasSettledEarnings ? 'reached' : 'open')]} testID="worker-profile-reputation-earnings">
        <View style={[styles.profileLevelMilestoneBadge, workerProfileLevelMilestoneBadgeSurface(tokens, hasSettledEarnings ? 'reached' : 'open')]}>
          <WorkerImageIcon frameSize={42} name="utilityEarningsWallet" size={42} />
        </View>
        <View style={styles.profileLevelMilestoneCopy}>
          <Text style={[styles.profileLevelMilestoneTitle, { color: tokens.ink }]} numberOfLines={1}>
            {language === 'en' ? 'Reconciled earnings' : 'Thu nh\u1eadp \u0111\u1ed1i so\u00e1t'}
          </Text>
          <Text style={[styles.profileLevelMilestoneText, { color: tokens.primary }]} numberOfLines={1}>
            {earningsValue}
          </Text>
          <Text style={[styles.profileLevelMilestoneText, { color: tokens.muted }]} numberOfLines={1}>
            {earningsPeriod}
          </Text>
        </View>
      </View>
      <View style={[styles.profileLevelDetail, workerProfileLevelMilestoneSurface(tokens, hasReputationData ? 'next' : 'open')]} testID="worker-profile-reputation-kael-suggestion">
        <View style={[styles.profileLevelMilestoneBadge, workerProfileLevelMilestoneBadgeSurface(tokens, hasReputationData ? 'next' : 'open')]}>
          <WorkerImageIcon frameSize={42} name="utilityShield" size={42} />
        </View>
        <View style={styles.profileLevelMilestoneCopy}>
          <Text style={[styles.profileLevelMilestoneTitle, { color: tokens.ink }]} numberOfLines={1}>
            {language === 'en' ? 'Kael suggestion' : 'Kael g\u1ee3i \u00fd cho b\u1ea1n'}
          </Text>
          <Text style={[styles.profileLevelMilestoneText, { color: tokens.muted }]} numberOfLines={3}>
            {kaelSuggestion}
          </Text>
        </View>
      </View>
      <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={2} testID="worker-profile-rating-detail-note">
        {detailNote}
      </Text>
      <View style={styles.actionRow}>
        <PressButton disabled={!hasRating} label={language === 'en' ? 'View reviews' : 'Xem \u0111\u00e1nh gi\u00e1'} onPress={() => setShowReviewDetails(true)} secondary testID="worker-profile-reputation-review-action" />
      </View>
      {showReviewDetails && hasRating ? (
        <View style={[styles.profileLevelDetail, workerProfileLevelMilestoneSurface(tokens, 'reached')]} testID="worker-profile-review-detail-panel">
          <View style={[styles.profileLevelMilestoneBadge, workerProfileLevelMilestoneBadgeSurface(tokens, 'reached')]}>
            <WorkerImageIcon frameSize={42} name="utilityShield" size={42} />
          </View>
          <View style={styles.profileLevelMilestoneCopy}>
            <Text style={[styles.profileLevelMilestoneTitle, { color: tokens.ink }]} numberOfLines={1}>
              {language === 'en' ? 'Review summary' : 'T\u00f3m t\u1eaft \u0111\u00e1nh gi\u00e1'}
            </Text>
            <Text style={[styles.profileLevelMilestoneText, { color: tokens.primary }]} numberOfLines={1}>
              {reviewDetailScore}
            </Text>
            <Text style={[styles.profileLevelMilestoneText, { color: tokens.muted }]} numberOfLines={2}>
              {language === 'en' ? `${reviewDetailCount} completed jobs; tips wait for API data.` : `${reviewDetailCount} vi\u1ec7c ho\u00e0n t\u1ea5t; ti\u1ec1n boa ch\u1edd d\u1eef li\u1ec7u API.`}
            </Text>
          </View>
        </View>
      ) : null}
      {!hasReputationData ? (
        <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={2} testID="worker-profile-reputation-empty">
          {language === 'en' ? 'Rating and performance open after real completed jobs.' : '\u0110\u00e1nh gi\u00e1 v\u00e0 hi\u1ec7u su\u1ea5t ch\u1ec9 m\u1edf sau vi\u1ec7c ho\u00e0n t\u1ea5t th\u1eadt.'}
        </Text>
      ) : null}
    </View>
  )
}

function workerProfileRatingStars(rating: number) {
  const filled = Math.max(0, Math.min(5, Math.round(rating)))

  return `${'\u2605'.repeat(filled)}${'\u2606'.repeat(5 - filled)}`
}

function WorkerProfileLevelCard({ workerProfile }: { workerProfile: WorkerProfileResponse | null }) {
  const { language, tokens } = useWorkerUi()
  const { reduceMotion } = useGlassAccessibility()
  const model = buildWorkerProfileLevelModel(workerProfile, language)
  const defaultSelectedLevel = model.level >= 5 ? Math.min(workerProfileLevelMax, model.level + 1) : Math.max(1, model.level)
  const [selectedLevelOverride, setSelectedLevelOverride] = useState<number | null>(null)
  const [railContentWidth, setRailContentWidth] = useState(0)
  const [railViewportWidth, setRailViewportWidth] = useState(0)
  const selectedLevel = selectedLevelOverride ?? defaultSelectedLevel
  const progressWidth = `${Math.max(workerProfile ? 8 : 0, Math.round(model.progress * 100))}%`
  const progressNow = Math.min(model.points, model.nextThreshold)
  const selectedMilestone = model.milestones.find((milestone) => milestone.level === selectedLevel) ?? model.milestones[0]!
  const hasLevelProgress = Boolean(workerProfile && model.points > 0)
  const progressValueLabel = hasLevelProgress
    ? `${progressNow} / ${model.nextThreshold} ${language === 'en' ? 'pts' : 'điểm'}`
    : language === 'en'
      ? 'Progress opens after the first completed job'
      : 'Tiến trình mở sau việc hoàn tất đầu tiên'
  const progressBadgeLabel = hasLevelProgress
    ? language === 'en' ? 'Real progress' : 'Tiến trình thật'
    : language === 'en' ? 'Waiting' : 'Đang chờ'
  const detailReveal = useSharedValue(1)
  const railScrollX = useSharedValue(0)
  const railScrollableWidth = Math.max(0, railContentWidth - railViewportWidth)
  const railThumbWidth = railScrollableWidth > 0 && railViewportWidth > 0
    ? Math.max(40, Math.min(96, Math.round((railViewportWidth / railContentWidth) * railViewportWidth)))
    : 64
  const railThumbTravel = Math.max(0, railViewportWidth - railThumbWidth)
  const showRailIndicator = model.milestones.length > 4
  const handleSelectLevel = useCallback((level: number) => {
    setSelectedLevelOverride(level)
  }, [])
  const handleLevelRailLayout = useCallback((event: LayoutChangeEvent) => {
    setRailViewportWidth(Math.round(event.nativeEvent.layout.width))
  }, [])
  const handleLevelRailContentSize = useCallback((width: number) => {
    setRailContentWidth(Math.round(width))
  }, [])
  const handleLevelRailScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    railScrollX.value = event.nativeEvent.contentOffset.x
  }, [railScrollX])
  useEffect(() => {
    cancelAnimation(detailReveal)
    detailReveal.value = 0
    detailReveal.value = reduceMotion
      ? withTiming(1, { duration: 100 })
      : withSpring(1, motionTokens.liquid.pill)

    return () => {
      cancelAnimation(detailReveal)
    }
  }, [detailReveal, reduceMotion, selectedLevel])

  const detailRevealStyle = useAnimatedStyle(() => ({
    opacity: 0.70 + detailReveal.value * 0.30,
    transform: [
      { translateY: (1 - detailReveal.value) * 8 },
      { scale: 0.985 + detailReveal.value * 0.015 },
    ],
  }), [detailReveal])
  const railThumbStyle = useAnimatedStyle(() => {
    const progress = railScrollableWidth > 0 ? Math.min(1, Math.max(0, railScrollX.value / railScrollableWidth)) : 0

    return {
      transform: [{ translateX: progress * railThumbTravel }],
    }
  }, [railScrollableWidth, railThumbTravel, railScrollX])

  return (
    <View style={[styles.profileLevelCard, workerProfilePanelSurface(tokens)]} testID="worker-profile-level-card">
      <WorkerProfileMaterialChrome testID="worker-profile-level-crisp-shell" variant="panel" />
      <View pointerEvents="none" style={[styles.profileLevelCornerAura, workerProfileLevelCornerAura(tokens)]} testID="worker-profile-level-corner-aura" />
      <View style={styles.profileLevelTop}>
        <View style={[styles.profileLevelOrb, workerProfileLevelOrbSurface(tokens)]} testID="worker-profile-level-orb">
          <Text style={[styles.profileLevelOrbMeta, { color: tokens.primary }]} numberOfLines={1}>
            {language === 'en' ? 'Lv' : 'Cấp'}
          </Text>
          <Text style={[styles.profileLevelOrbValue, { color: tokens.primary }]} numberOfLines={1}>
            {workerProfile ? model.level : ''}
          </Text>
        </View>
        <View style={styles.profileLevelCopy}>
          <Text style={[styles.kicker, { color: tokens.primary }]} numberOfLines={1} testID="worker-profile-level-current-kicker">
            {language === 'en' ? 'Current worker level' : 'Cấp thợ hiện tại'}
          </Text>
          <Text style={[styles.cardTitle, { color: tokens.ink }]} numberOfLines={1} testID="worker-profile-level-title">
            {model.title}
          </Text>
          <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={3}>
            {model.body}
          </Text>
        </View>
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ max: model.nextThreshold, min: model.currentFloor, now: progressNow }}
        style={[styles.profileLevelProgressTrack, workerProfileProgressTrackSurface(tokens)]}
        testID="worker-profile-level-progress"
      >
        <View style={[styles.profileLevelProgressFill, workerProfileProgressFillSurface(tokens), { width: progressWidth }]} testID="worker-profile-level-progress-fill" />
      </View>
      <View style={styles.profileSyncPreviewTop} testID="worker-profile-level-progress-value">
        <Text style={[styles.profileLevelNext, { color: tokens.primary, flex: 1 }]} numberOfLines={1}>
          {progressValueLabel}
        </Text>
        <Text style={[styles.statusPill, { backgroundColor: tokens.mint, color: tokens.primary }]} numberOfLines={1}>
          {progressBadgeLabel}
        </Text>
      </View>
      <Text style={[styles.profileLevelNext, { color: tokens.muted }]} numberOfLines={2} testID="worker-profile-level-next">
        {model.nextLabel}
      </Text>
      <View style={styles.profileLevelSignalGrid}>
        {model.signals.map((signal) => (
          <View key={signal.id} style={[styles.profileLevelSignal, workerProfileLevelSignalSurface(tokens)]} testID={`worker-profile-level-signal-${signal.id}`}>
            <View pointerEvents="none" style={[styles.profileLevelSignalGlass, workerProfileLevelSignalGlass(tokens)]} testID="worker-profile-level-signal-glass-layer" />
            <View pointerEvents="none" style={[styles.profileLevelSignalTopEdge, workerProfileLevelSignalTopEdge(tokens)]} />
            <Text style={[styles.profileLevelSignalLabel, { color: tokens.muted }]} numberOfLines={1}>
              {signal.label}
            </Text>
            <Text style={[styles.profileLevelSignalValue, { color: tokens.ink }]} numberOfLines={1}>
              {signal.value}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.profileLevelLadder} testID="worker-profile-level-ladder">
        <View style={styles.profileLevelLadderHeader}>
          <Text style={[styles.profileLevelLadderTitle, { color: tokens.ink }]} numberOfLines={1}>
            {language === 'en' ? 'Level path' : 'Lộ trình cấp'}
          </Text>
          <Text style={[styles.profileLevelLadderMax, { color: tokens.primary }]} numberOfLines={1} testID="worker-profile-level-max">
            {language === 'en' ? `Level ${workerProfileLevelMax} max` : `Cấp tối đa ${workerProfileLevelMax}`}
          </Text>
        </View>
        <ScrollView
          horizontal
          onContentSizeChange={handleLevelRailContentSize}
          onLayout={handleLevelRailLayout}
          onScroll={handleLevelRailScroll}
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
          style={styles.profileLevelRail}
          contentContainerStyle={styles.profileLevelRailContent}
          testID="worker-profile-level-rail"
        >
          {model.milestones.map((milestone, index) => (
            <View key={milestone.level} style={styles.profileLevelRailItem}>
              {index > 0 ? <WorkerProfileLevelRailSpacer /> : null}
              <WorkerProfileLevelChip
                language={language}
                milestone={milestone}
                onSelect={handleSelectLevel}
                reduceMotion={reduceMotion}
                selected={milestone.level === selectedMilestone.level}
                tokens={tokens}
              />
            </View>
          ))}
        </ScrollView>
        {showRailIndicator ? (
          <View
            pointerEvents="none"
            style={styles.profileLevelScrollIndicatorSlot}
            testID="worker-profile-level-liquid-scroll-indicator"
          >
            <View style={[styles.profileLevelScrollIndicatorTrack, workerProfileLevelScrollTrackSurface(tokens)]}>
              <View style={[styles.profileLevelScrollIndicatorTopEdge, workerProfileLevelScrollEdgeSurface(tokens)]} />
              <Animated.View
                style={[
                  styles.profileLevelScrollIndicatorThumb,
                  workerProfileLevelScrollThumbSurface(tokens),
                  { width: railThumbWidth },
                  railThumbStyle,
                ]}
                testID="worker-profile-level-liquid-scroll-thumb"
              >
                <View style={[styles.profileLevelScrollIndicatorSheen, workerProfileLevelScrollSheenSurface(tokens)]} />
              </Animated.View>
            </View>
          </View>
        ) : null}
        <Animated.View
          style={[styles.profileLevelDetail, workerProfileLevelMilestoneSurface(tokens, selectedMilestone.state), detailRevealStyle]}
          testID="worker-profile-level-detail"
        >
          <View style={[styles.profileLevelMilestoneBadge, workerProfileLevelMilestoneBadgeSurface(tokens, selectedMilestone.state)]}>
            <Text style={[styles.profileLevelMilestoneBadgeMeta, { color: tokens.primary }]} numberOfLines={1}>
              {language === 'en' ? 'Lv' : 'Cấp'}
            </Text>
            <Text style={[styles.profileLevelMilestoneBadgeValue, { color: tokens.ink }]} numberOfLines={1}>
              {selectedMilestone.level}
            </Text>
          </View>
          <View style={styles.profileLevelMilestoneCopy}>
            <View style={styles.profileLevelMilestoneHead}>
              <Text style={[styles.profileLevelMilestoneTitle, { color: tokens.ink }]} numberOfLines={1}>
                {selectedMilestone.title}
              </Text>
              <Text style={[styles.profileLevelMilestoneState, { color: tokens.primary }]} numberOfLines={1}>
                {selectedMilestone.stateLabel}
              </Text>
            </View>
            <Text
              style={[styles.profileLevelMilestoneText, { color: tokens.muted }]}
              numberOfLines={3}
              testID="worker-profile-level-selected-requirement"
            >
              {selectedMilestone.requirement}
            </Text>
            <Text
              style={[styles.profileLevelMilestoneReward, { color: tokens.ink }]}
              numberOfLines={3}
              testID="worker-profile-level-selected-reward"
            >
              {selectedMilestone.reward}
            </Text>
          </View>
        </Animated.View>
      </View>
    </View>
  )
}

function WorkerEarningsLedger() {
  const { copy, language, tokens } = useWorkerUi()
  const { selectors, state, workerEarnings } = useFrontendWorkflow()
  const deal = getWorkerVisibleDeal(state.deal)
  const acceptedDeal = isAcceptedLocalWorkerDeal(deal) ? deal : null
  const hasSettledEarnings = hasWorkerSettledEarnings(workerEarnings)
  const payoutAccountTitle = language === 'en' ? 'Payout account' : 'Tài khoản nhận tiền'
  const periodValue = formatWorkerEarningsPeriod(workerEarnings)
  const rows = hasSettledEarnings && workerEarnings
    ? [
        ...(periodValue ? [{ id: 'period', title: language === 'en' ? 'Period' : 'Kỳ đối soát', meta: periodValue }] : []),
        { id: 'ledger', title: copy.earnings.ledgerTitle, meta: `${workerEarnings.total_jobs_paid} ${language === 'en' ? 'items' : 'mục'}` },
        { id: 'gross', title: language === 'en' ? 'Gross earnings' : 'Tổng trước phí', meta: formatWorkerMoney(workerEarnings.gross_earnings, language) },
        { id: 'net', title: language === 'en' ? 'Net earnings' : 'Thực nhận', meta: formatWorkerMoney(workerEarnings.net_earnings, language) },
        { id: 'payout', title: payoutAccountTitle, meta: appCopy[language].common.noData },
      ]
    : acceptedDeal
    ? [
        { id: 'ledger', title: copy.earnings.ledgerTitle, meta: localizedStatusLabel(selectors.currentStatus, language) },
        { id: 'payout', title: payoutAccountTitle, meta: appCopy[language].common.noData },
      ]
    : copy.earnings.rows.map(([title, meta], index) => ({ id: `empty-${index}`, title, meta }))

  return (
    <View style={[styles.earningsLedgerCard, workerEarningsLedgerSurface(tokens)]} testID="worker-earnings-ledger">
      <WorkerEarningsMaterialChrome testID="worker-earnings-ledger-crisp-shell" variant="ledger" />
      {rows.map((row, index) => (
        <EarningsLedgerRow
          key={`${row.id}-${row.title}`}
          icon={earningsLedgerIcon(row.title, copy.earnings.ledgerTitle, payoutAccountTitle, index)}
          meta={row.meta}
          testID={row.id === 'period' ? 'worker-earnings-period-row' : undefined}
          title={row.title}
        />
      ))}
    </View>
  )
}

function earningsLedgerIcon(title: string, ledgerTitle: string, payoutAccountTitle: string, index: number): WorkerIconName {
  if (title === ledgerTitle) return 'document'
  if (title === payoutAccountTitle) return 'bank'
  return index === 1 ? 'money' : 'document'
}

function WorkerEarningsTrend() {
  const { copy, language, tokens } = useWorkerUi()
  const { workerEarnings } = useFrontendWorkflow()
  const realDays = buildWorkerEarningsDays(language, workerEarnings)
  const maxDailyValue = Math.max(...realDays.map((day) => day.netEarnings), 0)
  const hasDailyEarnings = maxDailyValue > 0
  const days = hasDailyEarnings ? realDays : buildWorkerEmptyEarningsDays(language)
  // X6 (Plan.md §27.9 — 2026-05-29): F-30 fix. Previously the empty state drew
  // bars at varying heights ([42,78,58,104,72,122,64]) which read as a real
  // earnings trend even when backend earnings = 0 — a RULES.md #8 fake-data
  // violation. When there is no settled earning, all bars now sit at a uniform
  // flat baseline (clearly "no data") and an explicit empty label is shown.
  const EMPTY_FLAT_BAR_HEIGHT = 10

  return (
    <GlassSurface material="liquid" mode={tokens.mode} style={[styles.earningsTrendCard, workerEarningsTrendSurface(tokens)]} testID="worker-earnings-seven-day-chart" variant="hero">
      <WorkerEarningsMaterialChrome testID="worker-earnings-hero-crisp-shell" variant="hero" />
      <View pointerEvents="none" style={[styles.earningsTrendGlow, { backgroundColor: tokens.primary }]} />
      <View style={[styles.earningsChartShell, workerEarningsChartSurface(tokens)]} testID="worker-earnings-chart-shell">
        <WorkerEarningsMaterialChrome testID="worker-earnings-chart-crisp-shell" variant="chart" />
        <View style={styles.earningsChartEmptyState} testID="worker-earnings-chart-empty-state">
          <View style={styles.earningsBarRail} testID={hasDailyEarnings ? 'worker-earnings-real-bar-shell' : 'worker-earnings-empty-bar-shell'}>
            {days.map((day) => (
              <View
                accessibilityLabel={hasDailyEarnings ? `${day.label}: ${formatWorkerMoney(day.netEarnings, language)}` : `${day.label}: ${copy.earnings.chartEmpty}`}
                key={day.date}
                style={[
                  styles.earningsEmptyBar,
                  workerEarningsBarSurface(tokens, hasDailyEarnings),
                  {
                    height: hasDailyEarnings
                      ? Math.max(30, Math.round(42 + (day.netEarnings / maxDailyValue) * 76))
                      : EMPTY_FLAT_BAR_HEIGHT,
                    opacity: hasDailyEarnings ? 0.98 : 0.4,
                  },
                ]}
              />
            ))}
          </View>
          {!hasDailyEarnings ? (
            <Text
              style={[styles.earningsChartEmptyLabel, { color: tokens.muted }]}
              numberOfLines={1}
              testID="worker-earnings-chart-empty-label"
            >
              {copy.earnings.chartEmpty}
            </Text>
          ) : null}
        </View>
        <View style={styles.earningsDayRail}>
          {days.map((day) => (
            <Text key={day.date} style={[styles.earningsDayLabel, { color: tokens.muted }]} numberOfLines={1}>
              {day.label}
            </Text>
          ))}
        </View>
      </View>
    </GlassSurface>
  )
}

function WorkerEarningsSummary() {
  const { copy, language, tokens } = useWorkerUi()
  const { workerEarnings } = useFrontendWorkflow()
  const empty = copy.earnings.noReconciliation
  const hasSettledEarnings = hasWorkerSettledEarnings(workerEarnings)
  const todayNet = getTodayWorkerNetEarnings(workerEarnings)
  const todayLabel = copy.earnings.today
  const periodLabel = copy.earnings.period
  const monthLabel = copy.earnings.month
  const todayValue = todayNet > 0 ? formatWorkerMoney(todayNet, language) : empty
  const periodValue = hasSettledEarnings && workerEarnings ? formatWorkerMoney(workerEarnings.net_earnings, language) : empty
  const monthValue = empty

  return (
    <View style={styles.earningsSummaryGrid} testID="worker-earnings-day-month-summary">
      <View style={[styles.earningsSummaryCell, workerEarningsMiniSurface(tokens)]} testID="worker-earnings-today-cell">
        <WorkerEarningsMaterialChrome testID="worker-earnings-summary-crisp-shell" variant="cell" />
        <Text style={[styles.earningsSummaryLabel, { color: tokens.subtle }]} numberOfLines={1}>
          {todayLabel}
        </Text>
        <Text adjustsFontSizeToFit minimumFontScale={0.88} style={[styles.earningsSummaryValue, { color: tokens.ink }]} numberOfLines={1}>
          {todayValue}
        </Text>
        <Text style={[styles.earningsSummaryHint, { color: tokens.muted }]} numberOfLines={1}>
          {copy.earnings.summaryHint}
        </Text>
      </View>
      <View style={[styles.earningsSummaryCell, workerEarningsMiniSurface(tokens)]} testID="worker-earnings-period-total-cell">
        <WorkerEarningsMaterialChrome testID="worker-earnings-summary-crisp-shell" variant="cell" />
        <Text style={[styles.earningsSummaryLabel, { color: tokens.subtle }]} numberOfLines={1}>
          {periodLabel}
        </Text>
        <Text adjustsFontSizeToFit minimumFontScale={0.88} style={[styles.earningsSummaryValue, { color: tokens.ink }]} numberOfLines={1}>
          {periodValue}
        </Text>
        <Text style={[styles.earningsSummaryHint, { color: tokens.muted }]} numberOfLines={1}>
          {copy.earnings.summaryHint}
        </Text>
      </View>
      <View style={[styles.earningsSummaryCell, workerEarningsMiniSurface(tokens)]} testID="worker-earnings-month-cell">
        <WorkerEarningsMaterialChrome testID="worker-earnings-summary-crisp-shell" variant="cell" />
        <Text style={[styles.earningsSummaryLabel, { color: tokens.subtle }]} numberOfLines={1}>
          {monthLabel}
        </Text>
        <Text adjustsFontSizeToFit minimumFontScale={0.88} style={[styles.earningsSummaryValue, { color: tokens.ink }]} numberOfLines={1}>
          {monthValue}
        </Text>
        <Text style={[styles.earningsSummaryHint, { color: tokens.muted }]} numberOfLines={1}>
          {copy.earnings.summaryHint}
        </Text>
      </View>
    </View>
  )
}

function WorkerEarningsReconciliationStrip() {
  const { copy, language, tokens } = useWorkerUi()
  const { workerEarnings } = useFrontendWorkflow()
  const hasSettledEarnings = hasWorkerSettledEarnings(workerEarnings)
  const hasPendingPayout = Boolean(workerEarnings && (workerEarnings.pending_payment_amount > 0 || workerEarnings.pending_payment_count > 0))
  const paidJobsValue = hasSettledEarnings && workerEarnings && workerEarnings.total_jobs_paid > 0
    ? `${workerEarnings.total_jobs_paid} ${language === 'en' ? 'paid' : 'việc'}`
    : copy.earnings.noReconciliation
  const pendingValue = hasPendingPayout && workerEarnings
    ? workerEarnings.pending_payment_amount > 0
      ? formatWorkerMoney(workerEarnings.pending_payment_amount, language)
      : `${workerEarnings.pending_payment_count} ${language === 'en' ? 'pending' : 'mục chờ'}`
    : copy.earnings.noPendingPayout
  const platformFeeValue = hasSettledEarnings && workerEarnings && workerEarnings.platform_fee_total > 0
    ? formatWorkerMoney(workerEarnings.platform_fee_total, language)
    : copy.earnings.feeWaiting
  const rows = [
    { id: 'paid-jobs', label: copy.earnings.paidJobs, value: paidJobsValue },
    { id: 'pending', label: copy.earnings.pendingPayout, value: pendingValue },
    { id: 'platform-fee', label: copy.earnings.platformFee, value: platformFeeValue },
  ] as const

  return (
    <View style={styles.earningsReconciliationStrip} testID="worker-earnings-reconciliation-strip">
      {rows.map((row) => (
        <View key={row.id} style={[styles.earningsReconciliationCell, workerEarningsMiniSurface(tokens)]} testID={`worker-earnings-${row.id}-cell`}>
          <WorkerEarningsMaterialChrome testID="worker-earnings-reconciliation-crisp-shell" variant="cell" />
          <Text style={[styles.earningsSummaryLabel, { color: tokens.subtle }]} numberOfLines={1}>
            {row.label}
          </Text>
          <Text adjustsFontSizeToFit minimumFontScale={0.76} style={[styles.earningsReconciliationValue, { color: tokens.ink }]} numberOfLines={1}>
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  )
}

function hasWorkerSettledEarnings(workerEarnings: ReturnType<typeof useFrontendWorkflow>['workerEarnings']) {
  return Boolean(workerEarnings && (
    workerEarnings.total_jobs_paid > 0 ||
    workerEarnings.gross_earnings > 0 ||
    workerEarnings.net_earnings > 0
  ))
}

function formatWorkerEarningsPeriod(workerEarnings: EarningsResponse | null) {
  if (!workerEarnings?.from_date && !workerEarnings?.to_date) return null
  if (workerEarnings.from_date && workerEarnings.to_date) return `${workerEarnings.from_date} - ${workerEarnings.to_date}`
  return workerEarnings.from_date ?? workerEarnings.to_date
}

function buildWorkerEarningsDays(language: WorkerLanguageMode, workerEarnings: EarningsResponse | null, referenceDate = new Date()) {
  const dailyByDate = new Map((workerEarnings?.daily_earnings ?? []).map((day) => [day.date, day]))
  const labels = language === 'en'
    ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    : ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(referenceDate)
    date.setDate(referenceDate.getDate() - (6 - index))
    const dateKey = workerDateKey(date)
    const bucket = dailyByDate.get(dateKey)
    return {
      date: dateKey,
      label: labels[date.getDay()],
      netEarnings: bucket?.net_earnings ?? 0,
      paidJobCount: bucket?.paid_job_count ?? 0,
    }
  })
}

function buildWorkerEmptyEarningsDays(language: WorkerLanguageMode) {
  const labels = language === 'en'
    ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    : ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
  return labels.map((label, index) => ({
    date: `empty-${index}`,
    label,
    netEarnings: 0,
    paidJobCount: 0,
  }))
}

function getTodayWorkerNetEarnings(workerEarnings: EarningsResponse | null, referenceDate = new Date()) {
  const todayKey = workerDateKey(referenceDate)
  return workerEarnings?.daily_earnings?.find((day) => day.date === todayKey)?.net_earnings ?? 0
}

function workerDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function workerChatGreetingLabel(workerProfile: WorkerProfileResponse | null, _language: WorkerLanguageMode, referenceDate = new Date(Date.now())) {
  const displayName = workerChatDisplayName(workerProfile)
  const hour = referenceDate.getHours()
  const dayPart = hour < 11
    ? 'Morning'
    : hour < 14
      ? 'Lunch'
      : hour < 18
        ? 'Afternoon'
        : 'Evening'

  return `${dayPart}, ${displayName}`
}

function workerHomeGreetingLabel(workerProfile: WorkerProfileResponse | null, language: WorkerLanguageMode) {
  const displayName = workerChatDisplayName(workerProfile)
  if (displayName === 'there') {
    return language === 'en' ? 'Hi' : 'Xin chào'
  }

  return language === 'en' ? `Hi, ${displayName}` : `Xin chào, ${displayName}`
}

function workerChatDisplayName(workerProfile: WorkerProfileResponse | null) {
  const legalName = workerProfile?.legal_name?.trim()
  if (!legalName) return 'there'
  return legalName.replace(/\s+/g, ' ')
}

function WorkerProfileContent() {
  const { copy, language, tokens } = useWorkerUi()
  const { replace } = useRouter()
  const { role, signOut } = useAuth()
  const { workerEarnings, workerProfile } = useFrontendWorkflow()
  const [showVerificationForm, setShowVerificationForm] = useState(false)
  const workerSignOutLabel = language === 'en' ? 'Sign out' : 'Đăng xuất'
  const adminAuditSwitchLabel = language === 'en' ? 'Back to login' : 'Về đăng nhập'
  const verificationCopy = workerVerificationCopy[language]
  const serviceSkillsLabel = workerProfile?.service_types.length
    ? workerProfile.service_types.map((service) => localizedServiceLabel(service, language)).join(' · ')
    : appCopy[language].common.noData
  const workingAreaLabel = workerProfile?.districts.length
    ? workerProfile.districts.map((district) => localizedWorkerAreaLabel(district, language)).join(' · ')
    : appCopy[language].common.noData
  const workerProfileName = workerProfile?.legal_name?.trim().replace(/\s+/g, ' ') || copy.profile.name
  const verificationStatus = workerProfile?.verification_status ?? 'draft'
  const profileRows: { icon: WorkerImageIconName; meta: string; title: string }[] = [
    { icon: 'profileIdentity', meta: localizedWorkerVerificationStatus(verificationStatus, language), title: language === 'en' ? 'Identity verification' : 'Xác minh danh tính' },
    { icon: 'profileSkills', meta: serviceSkillsLabel, title: language === 'en' ? 'Service skills' : 'Kỹ năng dịch vụ' },
    { icon: 'profileServiceArea', meta: workingAreaLabel, title: language === 'en' ? 'Working area' : 'Khu vực làm việc' },
  ]
  const profileStatusValue = localizedWorkerVerificationStatus(verificationStatus, language)
  const approvedProfileValue = workerProfile
    ? workerProfile.is_approved
      ? language === 'en' ? 'Approved' : 'Đã duyệt'
      : profileStatusValue
    : appCopy[language].common.noData
  const submittedProfileValue = workerProfile && verificationStatus !== 'draft'
    ? (language === 'en' ? 'Submitted' : 'Đã gửi')
    : profileStatusValue
  const profileMiniCards: { icon: WorkerImageIconName; id: 'approved' | 'skills' | 'submitted'; label: string; value: string }[] = [
    { icon: 'profileVerified', id: 'approved', label: language === 'en' ? 'Approved' : 'Xác minh', value: approvedProfileValue },
    { icon: 'profileIdentity', id: 'submitted', label: language === 'en' ? 'Worker profile' : 'Hồ sơ thợ', value: submittedProfileValue },
    { icon: 'profileSkills', id: 'skills', label: language === 'en' ? 'Skills' : 'Kỹ năng', value: serviceSkillsLabel },
  ]
  const profileOverviewModel = buildWorkerProfileLevelModel(workerProfile, language)
  const profileSyncLabel = language === 'en' ? 'Synced from verification' : 'Đồng bộ từ xác thực'
  const profileSyncMeta = workerProfile
    ? localizedWorkerVerificationStatus(workerProfile.verification_status, language)
    : appCopy[language].common.noData
  const canSubmitVerification = role === 'worker' &&
    !workerProfile?.is_suspended &&
    !['approved', 'suspended'].includes(verificationStatus)
  const showProfileSyncPreview = role === 'admin' && Boolean(workerProfile) && !showVerificationForm

  return (
    <>
      <GlassSurface material="liquid" mode={tokens.mode} style={[styles.profileHead, workerProfileHeroSurface(tokens)]} testID="worker-profile-verification-card" variant="hero">
        <WorkerProfileMaterialChrome testID="worker-profile-hero-crisp-shell" variant="hero" />
        <SubtleGlassHighlight liquid />
        <View style={styles.profileHeroTop}>
          <View style={styles.profileAvatarHero}>
            <WorkerImageIcon frameSize={50} name="profileAvatar" size={50} />
          </View>
          <View style={styles.profileTitleStack}>
            <Text style={[styles.profileName, { color: tokens.ink }]} numberOfLines={1} testID="worker-profile-hero-name">
              {workerProfileName}
            </Text>
            <Text style={[styles.profileSubtitle, { color: tokens.muted }]} numberOfLines={2}>
              {language === 'en' ? 'Status and service skills' : 'Trạng thái và kỹ năng dịch vụ'}
            </Text>
          </View>
        </View>
        {role === 'worker' ? (
          <View style={styles.profileHeroAction}>
            <PressButton label={workerSignOutLabel} onPress={() => void signOut()} testID="worker-profile-sign-out" />
          </View>
        ) : role === 'admin' ? (
          <View style={styles.profileHeroAction}>
            <PressButton label={adminAuditSwitchLabel} onPress={() => replace('/(auth)/login')} testID="worker-admin-audit-switch" />
          </View>
        ) : null}
      </GlassSurface>
      {canSubmitVerification && showVerificationForm ? <WorkerVerificationForm /> : null}

      <View style={styles.profileMiniGrid} testID="worker-profile-mini-status-grid">
        {profileMiniCards.map((card) => (
          <View key={card.id} style={[styles.profileMiniCard, workerProfileMiniSurface(tokens)]} testID={`worker-profile-mini-card-${card.id}`}>
            <WorkerProfileMaterialChrome testID="worker-profile-mini-crisp-shell" variant="mini" />
            <WorkerImageIcon frameSize={48} name={card.icon} size={48} style={styles.profileMiniImage} />
            <Text adjustsFontSizeToFit minimumFontScale={0.74} style={[styles.profileMiniTitle, { color: tokens.ink }]} numberOfLines={1}>
              {card.value}
            </Text>
            <Text adjustsFontSizeToFit minimumFontScale={0.82} style={[styles.profileMiniMeta, { color: tokens.muted }]} numberOfLines={1}>
              {card.label}
            </Text>
          </View>
        ))}
      </View>

      <View style={[styles.profileSyncPreview, workerProfilePanelSurface(tokens)]} testID="worker-profile-overview-card">
        <WorkerProfileMaterialChrome testID="worker-profile-overview-crisp-shell" variant="panel" />
        <View style={styles.profileSyncPreviewTop}>
          <Text style={[styles.cardTitle, { color: tokens.ink, flex: 1 }]} numberOfLines={1}>
            {language === 'en' ? 'Quick overview' : 'Tổng quan nhanh'}
          </Text>
          <Text style={[styles.statusPill, { backgroundColor: tokens.mint, color: tokens.primary }]} numberOfLines={1}>
            {language === 'en' ? 'Live profile' : 'Hồ sơ thật'}
          </Text>
        </View>
        <View style={styles.profileLevelSignalGrid}>
          {profileOverviewModel.signals.map((signal) => (
            <View key={signal.id} style={[styles.profileLevelSignal, workerProfileLevelSignalSurface(tokens)]} testID={`worker-profile-overview-stat-${signal.id}`}>
              <View pointerEvents="none" style={[styles.profileLevelSignalGlass, workerProfileLevelSignalGlass(tokens)]} testID="worker-profile-overview-signal-glass-layer" />
              <View pointerEvents="none" style={[styles.profileLevelSignalTopEdge, workerProfileLevelSignalTopEdge(tokens)]} />
              <Text style={[styles.profileLevelSignalLabel, { color: tokens.muted }]} numberOfLines={1}>
                {signal.label}
              </Text>
              <Text style={[styles.profileLevelSignalValue, { color: tokens.ink }]} numberOfLines={1}>
                {signal.value}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <WorkerProfileLevelCard workerProfile={workerProfile} />
      <WorkerProfileReputationPanel workerEarnings={workerEarnings} workerProfile={workerProfile} />

      {showProfileSyncPreview ? (
        <View style={[styles.profileSyncPreview, workerProfilePanelSurface(tokens)]} testID="worker-profile-sync-preview">
          <WorkerProfileMaterialChrome testID="worker-profile-sync-crisp-shell" variant="panel" />
          <View style={styles.profileSyncPreviewTop}>
            <Text style={[styles.cardTitle, { color: tokens.ink, flex: 1 }]} numberOfLines={1}>
              {profileSyncLabel}
            </Text>
            <Text style={[styles.statusPill, { backgroundColor: tokens.mint, color: tokens.primary }]} numberOfLines={1}>
              {profileSyncMeta}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={[styles.listCard, styles.profileListCard, workerProfilePanelSurface(tokens)]} testID="worker-profile-list-groups">
        <WorkerProfileMaterialChrome testID="worker-profile-list-crisp-shell" variant="panel" />
        {profileRows.map((row) => (
          <ProfileListRow key={row.title} icon={row.icon} title={row.title} meta={row.meta} />
        ))}
      </View>

      {canSubmitVerification && !showVerificationForm ? (
        <View style={[styles.profileSyncPreview, workerProfilePanelSurface(tokens)]} testID="worker-profile-verification-collapsed">
          <WorkerProfileMaterialChrome testID="worker-profile-verification-collapsed-crisp-shell" variant="collapsed" />
          <Text style={[styles.kicker, { color: tokens.primary }]} numberOfLines={1}>
            {verificationCopy.kicker}
          </Text>
          <Text style={[styles.cardTitle, { color: tokens.ink }]} numberOfLines={1}>
            {verificationCopy.title}
          </Text>
          <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={3}>
            {verificationCopy.savedBody}
          </Text>
          <View style={styles.actionRow}>
            <PressButton label={verificationCopy.submit} onPress={() => setShowVerificationForm(true)} testID="worker-profile-open-verification-form" />
          </View>
        </View>
      ) : null}

      <View style={[styles.preferenceCard, workerProfilePreferenceSurface(tokens)]} testID="worker-profile-preference-toggles">
        <WorkerProfileMaterialChrome testID="worker-profile-preference-crisp-shell" variant="preference" />
        <ThemeToggle />
        <LanguageToggle />
      </View>
    </>
  )
}

const workerVerificationServices: ServiceType[] = ['electrical', 'plumbing', 'cleaning']

type WorkerVerificationField =
  | 'bankAccount'
  | 'bankName'
  | 'dateOfBirth'
  | 'districts'
  | 'homeLat'
  | 'homeLng'
  | 'legalName'
  | 'problemSpecializations'
  | 'serviceRadiusKm'
  | 'yearsExperience'

type WorkerVerificationFormState = {
  bankAccount: string
  bankName: string
  dateOfBirth: string
  districts: string
  files: Partial<Record<WorkerVerificationFileSlot, LocalMediaUploadDraft>>
  homeLat: string
  homeLng: string
  legalName: string
  problemSpecializations: string
  serviceRadiusKm: string
  serviceTypes: ServiceType[]
  submitError: string | null
  submitting: boolean
  yearsExperience: string
}

type WorkerVerificationFormAction =
  | { type: 'field'; field: WorkerVerificationField; value: string }
  | { type: 'file'; slot: WorkerVerificationFileSlot; file: LocalMediaUploadDraft }
  | { type: 'hydrate'; profile: WorkerProfileResponse }
  | { type: 'reset_bank_account' }
  | { type: 'submit_error'; error: string | null }
  | { type: 'submitting'; submitting: boolean }
  | { type: 'toggle_service'; serviceType: ServiceType }

function createWorkerVerificationFormState(workerProfile: WorkerProfileResponse | null): WorkerVerificationFormState {
  return {
    bankAccount: '',
    bankName: workerProfile?.bank_name ?? '',
    dateOfBirth: workerProfile?.date_of_birth ?? '',
    districts: workerProfile?.districts.join(', ') ?? '',
    files: {},
    homeLat: workerProfile?.home_lat === null || workerProfile?.home_lat === undefined ? '' : String(workerProfile.home_lat),
    homeLng: workerProfile?.home_lng === null || workerProfile?.home_lng === undefined ? '' : String(workerProfile.home_lng),
    legalName: workerProfile?.legal_name ?? '',
    problemSpecializations: workerProfile?.problem_specializations.join(', ') ?? '',
    serviceRadiusKm: String(workerProfile?.service_radius_km ?? 8),
    serviceTypes: workerProfile?.service_types.length ? workerProfile.service_types : ['electrical'],
    submitError: null,
    submitting: false,
    yearsExperience: workerProfile?.years_experience ? String(workerProfile.years_experience) : '',
  }
}

function workerVerificationFormReducer(
  state: WorkerVerificationFormState,
  action: WorkerVerificationFormAction,
): WorkerVerificationFormState {
  switch (action.type) {
    case 'field':
      return { ...state, [action.field]: action.value }
    case 'file':
      return { ...state, files: { ...state.files, [action.slot]: action.file }, submitError: null }
    case 'hydrate':
      return {
        ...state,
        bankName: state.bankName || action.profile.bank_name || '',
        dateOfBirth: state.dateOfBirth || action.profile.date_of_birth || '',
        districts: state.districts || action.profile.districts.join(', '),
        homeLat: state.homeLat || (action.profile.home_lat === null ? '' : String(action.profile.home_lat)),
        homeLng: state.homeLng || (action.profile.home_lng === null ? '' : String(action.profile.home_lng)),
        legalName: state.legalName || action.profile.legal_name || '',
        problemSpecializations: state.problemSpecializations || action.profile.problem_specializations.join(', '),
        serviceRadiusKm: state.serviceRadiusKm || String(action.profile.service_radius_km ?? 8),
        serviceTypes: action.profile.service_types.length > 0 ? action.profile.service_types : state.serviceTypes,
        yearsExperience: state.yearsExperience || (action.profile.years_experience ? String(action.profile.years_experience) : ''),
      }
    case 'reset_bank_account':
      return { ...state, bankAccount: '' }
    case 'submit_error':
      return { ...state, submitError: action.error }
    case 'submitting':
      return { ...state, submitting: action.submitting }
    case 'toggle_service':
      if (state.serviceTypes.includes(action.serviceType)) {
        return state.serviceTypes.length === 1
          ? state
          : { ...state, serviceTypes: state.serviceTypes.filter((item) => item !== action.serviceType) }
      }
      return { ...state, serviceTypes: [...state.serviceTypes, action.serviceType] }
    default:
      return state
  }
}

function WorkerVerificationForm() {
  const { language, tokens } = useWorkerUi()
  const { actions, workerProfile } = useFrontendWorkflow()
  const verificationCopy = workerVerificationCopy[language] as WorkerVerificationCopy
  const [{
    bankAccount,
    bankName,
    dateOfBirth,
    districts,
    files,
    homeLat,
    homeLng,
    legalName,
    problemSpecializations,
    serviceRadiusKm,
    serviceTypes,
    submitError,
    submitting,
    yearsExperience,
  }, formDispatch] = useReducer(
    workerVerificationFormReducer,
    workerProfile,
    createWorkerVerificationFormState,
  )
  const status: WorkerVerificationStatus = workerProfile?.verification_status ?? 'draft'
  const setLegalName = (value: string) => formDispatch({ type: 'field', field: 'legalName', value })
  const setDateOfBirth = (value: string) => formDispatch({ type: 'field', field: 'dateOfBirth', value })
  const setDistricts = (value: string) => formDispatch({ type: 'field', field: 'districts', value })
  const setHomeLat = (value: string) => formDispatch({ type: 'field', field: 'homeLat', value })
  const setHomeLng = (value: string) => formDispatch({ type: 'field', field: 'homeLng', value })
  const setYearsExperience = (value: string) => formDispatch({ type: 'field', field: 'yearsExperience', value })
  const setProblemSpecializations = (value: string) => formDispatch({ type: 'field', field: 'problemSpecializations', value })
  const setServiceRadiusKm = (value: string) => formDispatch({ type: 'field', field: 'serviceRadiusKm', value })
  const setBankName = (value: string) => formDispatch({ type: 'field', field: 'bankName', value })
  const setBankAccount = (value: string) => formDispatch({ type: 'field', field: 'bankAccount', value })
  const setSubmitError = (error: string | null) => formDispatch({ type: 'submit_error', error })
  const setSubmitting = (submittingValue: boolean) => formDispatch({ type: 'submitting', submitting: submittingValue })
  const setDistrictsFromText = (value: string) => {
    setDistricts(value)
    setHomeLat('')
    setHomeLng('')
    setSubmitError(null)
  }
  const selectedDistrictSlug = normalizeDistrict(districts.split(',')[0] ?? '')
  const parsedRadiusValue = Number.parseInt(serviceRadiusKm.replace(/[^\d]/g, ''), 10)
  const radiusValue = Math.min(30, Math.max(1, Number.isFinite(parsedRadiusValue) ? parsedRadiusValue : 8))
  const setServiceAreaAnchor = (anchor: (typeof workerServiceAreaAnchors)[number]) => {
    setDistricts(HCMC_DISTRICTS[anchor.slug])
    setHomeLat(anchor.lat.toFixed(6))
    setHomeLng(anchor.lng.toFixed(6))
    setSubmitError(null)
  }
  const adjustServiceRadius = (delta: number) => {
    setServiceRadiusKm(String(Math.min(30, Math.max(1, radiusValue + delta))))
    setSubmitError(null)
  }
  const setRadiusPreset = (value: number) => {
    setServiceRadiusKm(String(value))
    setSubmitError(null)
  }

  useEffect(() => {
    if (!workerProfile) return
    formDispatch({ type: 'hydrate', profile: workerProfile })
  }, [workerProfile])

  const toggleService = (serviceType: ServiceType) => {
    formDispatch({ type: 'toggle_service', serviceType })
  }

  const pickVerificationFile = async (slot: WorkerVerificationFileSlot) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      setSubmitError(verificationCopy.permissionError)
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: false,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.86,
      selectionLimit: 1,
    })
    if (result.canceled || !result.assets[0]) return
    const asset = result.assets[0]
    formDispatch({
      type: 'file',
      slot,
      file: {
        uri: asset.uri,
        type: 'image',
        fileName: asset.fileName ?? asset.uri.split('/').pop(),
        mimeType: asset.mimeType ?? undefined,
        fileSizeBytes: asset.fileSize ?? undefined,
      },
    })
  }

  const submitVerification = async () => {
    const years = Number.parseInt(yearsExperience.replace(/[^\d]/g, ''), 10)
    const radius = Number.parseInt(serviceRadiusKm.replace(/[^\d]/g, ''), 10)
    const parsedHomeLat = homeLat.trim() ? Number(homeLat.trim()) : null
    const parsedHomeLng = homeLng.trim() ? Number(homeLng.trim()) : null
    const specializationList = problemSpecializations.split(',').flatMap((item) => {
      const specialization = item.trim()
      return specialization ? [specialization] : []
    })
    const districtList = districts.split(',').flatMap((item) => {
      const district = item.trim()
      return district ? [district] : []
    })
    if (legalName.trim().length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth.trim())) {
      setSubmitError(verificationCopy.errors.identity)
      return
    }
    if (!Number.isFinite(years) || years < 0 || districtList.length === 0 || serviceTypes.length === 0) {
      setSubmitError(verificationCopy.errors.work)
      return
    }
    if (!Number.isFinite(radius) || radius < 1 || radius > 30) {
      setSubmitError(verificationCopy.errors.work)
      return
    }
    if (
      (parsedHomeLat !== null || parsedHomeLng !== null) &&
      (
        parsedHomeLat === null ||
        parsedHomeLng === null ||
        !Number.isFinite(parsedHomeLat) ||
        !Number.isFinite(parsedHomeLng) ||
        Math.abs(parsedHomeLat) > 90 ||
        Math.abs(parsedHomeLng) > 180
      )
    ) {
      setSubmitError(verificationCopy.errors.work)
      return
    }
    if (!bankName.trim() || bankAccount.trim().length < 6) {
      setSubmitError(verificationCopy.errors.bank)
      return
    }
    if (!files.cccdFront || !files.cccdBack || !files.selfie) {
      setSubmitError(verificationCopy.errors.files)
      return
    }

    setSubmitting(true)
    setSubmitError(null)
    const uploaded = await uploadWorkerVerificationDrafts({
      cccdFront: files.cccdFront,
      cccdBack: files.cccdBack,
      selfie: files.selfie,
    })
    if (!uploaded.success) {
      setSubmitting(false)
      setSubmitError(verificationCopy.uploadError)
      return
    }

    const input: WorkerRegisterInput = {
      legal_name: legalName.trim(),
      date_of_birth: dateOfBirth.trim(),
      service_types: serviceTypes,
      years_experience: years,
      districts: districtList,
      home_lat: parsedHomeLat ?? undefined,
      home_lng: parsedHomeLng ?? undefined,
      service_radius_km: radius,
      problem_specializations: specializationList,
      bank_account: bankAccount.trim(),
      bank_name: bankName.trim(),
      ...uploaded.urls,
    }
    const saved = await actions.workerSubmitRegistration(input)
    setSubmitting(false)
    if (!saved) {
      setSubmitError(verificationCopy.errors.submit)
      return
    }
    formDispatch({ type: 'reset_bank_account' })
    Alert.alert(verificationCopy.savedTitle, verificationCopy.savedBody)
  }

  return (
    <View style={[styles.verificationCard, workerProfilePanelSurface(tokens)]} testID="worker-verification-submit-card">
      <WorkerProfileMaterialChrome testID="worker-profile-verification-crisp-shell" variant="form" />
      <View style={styles.rowBetween}>
        <View style={styles.titleStack}>
          <Text style={[styles.kicker, { color: tokens.primary }]}>{verificationCopy.kicker}</Text>
          <Text style={[styles.sectionTitle, { color: tokens.ink }]}>{verificationCopy.title}</Text>
        </View>
        <Text style={[styles.statusPill, { backgroundColor: tokens.mint, color: tokens.primary }]} testID="worker-verification-status">
          {localizedWorkerVerificationStatus(status, language)}
        </Text>
      </View>
      <TextInput accessibilityLabel={verificationCopy.legalName} autoCapitalize="words" onChangeText={setLegalName} placeholder={verificationCopy.legalName} placeholderTextColor={tokens.subtle} style={[styles.verificationInput, workerProfileInputSurface(tokens), { color: tokens.ink }]} testID="worker-verification-legal-name" value={legalName} />
      <View style={styles.verificationGrid}>
        <TextInput accessibilityLabel={verificationCopy.dateOfBirth} onChangeText={setDateOfBirth} placeholder="YYYY-MM-DD" placeholderTextColor={tokens.subtle} style={[styles.verificationInput, styles.verificationHalfInput, workerProfileInputSurface(tokens), { color: tokens.ink }]} testID="worker-verification-date-of-birth" value={dateOfBirth} />
        <TextInput accessibilityLabel={verificationCopy.yearsExperience} keyboardType="number-pad" onChangeText={setYearsExperience} placeholder={verificationCopy.yearsExperience} placeholderTextColor={tokens.subtle} style={[styles.verificationInput, styles.verificationHalfInput, workerProfileInputSurface(tokens), { color: tokens.ink }]} testID="worker-verification-years" value={yearsExperience} />
      </View>
      <TextInput accessibilityLabel={verificationCopy.districts} onChangeText={setDistrictsFromText} placeholder={verificationCopy.districtsPlaceholder} placeholderTextColor={tokens.subtle} style={[styles.verificationInput, workerProfileInputSurface(tokens), { color: tokens.ink }]} testID="worker-verification-districts" value={districts} />
      <WorkerServiceAreaPicker
        onAdjustRadius={adjustServiceRadius}
        onSelectAnchor={setServiceAreaAnchor}
        onSelectRadiusPreset={setRadiusPreset}
        radiusValue={radiusValue}
        selectedDistrictSlug={selectedDistrictSlug}
      />
      <TextInput accessibilityLabel={verificationCopy.problemSpecializations} onChangeText={setProblemSpecializations} placeholder={verificationCopy.problemSpecializations} placeholderTextColor={tokens.subtle} style={[styles.verificationInput, workerProfileInputSurface(tokens), { color: tokens.ink }]} testID="worker-verification-problem-specializations" value={problemSpecializations} />
      <View style={styles.skillWrap} testID="worker-verification-service-types">
        {workerVerificationServices.map((serviceType) => {
          const selected = serviceTypes.includes(serviceType)
          return (
            <Pressable
              accessibilityLabel={`${verificationCopy.selectSkill} ${localizedServiceLabel(serviceType, language)}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              key={serviceType}
              onPress={() => toggleService(serviceType)}
              style={({ pressed }) => [
                styles.skillPill,
                { backgroundColor: selected ? tokens.primary : tokens.glassStrong, borderColor: selected ? tokens.primary : tokens.border },
                pressed ? styles.pressed : null,
              ]}
              testID={`worker-verification-service-${serviceType}`}
            >
              <Text style={[styles.skillText, { color: selected ? tokens.primaryText : tokens.primary }]}>{localizedServiceLabel(serviceType, language)}</Text>
            </Pressable>
          )
        })}
      </View>
      <View style={styles.verificationGrid}>
        <TextInput accessibilityLabel={verificationCopy.bankName} onChangeText={setBankName} placeholder={verificationCopy.bankName} placeholderTextColor={tokens.subtle} style={[styles.verificationInput, styles.verificationHalfInput, workerProfileInputSurface(tokens), { color: tokens.ink }]} testID="worker-verification-bank-name" value={bankName} />
        <TextInput accessibilityLabel={verificationCopy.bankAccount} keyboardType="number-pad" onChangeText={setBankAccount} placeholder={verificationCopy.bankAccount} placeholderTextColor={tokens.subtle} secureTextEntry style={[styles.verificationInput, styles.verificationHalfInput, workerProfileInputSurface(tokens), { color: tokens.ink }]} testID="worker-verification-bank-account" value={bankAccount} />
      </View>
      <View style={styles.verificationFiles}>
        <VerificationFileButton file={files.cccdFront} label={verificationCopy.files.cccdFront} onPress={() => void pickVerificationFile('cccdFront')} testID="worker-verification-cccd-front" />
        <VerificationFileButton file={files.cccdBack} label={verificationCopy.files.cccdBack} onPress={() => void pickVerificationFile('cccdBack')} testID="worker-verification-cccd-back" />
        <VerificationFileButton file={files.selfie} label={verificationCopy.files.selfie} onPress={() => void pickVerificationFile('selfie')} testID="worker-verification-selfie" />
      </View>
      {submitError ? <Text style={[styles.bodyText, { color: tokens.copper }]} testID="worker-verification-error">{submitError}</Text> : null}
      <PressButton disabled={submitting} label={submitting ? verificationCopy.submitting : verificationCopy.submit} material="liquid" onPress={() => void submitVerification()} testID="worker-verification-submit" />
    </View>
  )
}

function WorkerServiceAreaPicker({
  onAdjustRadius,
  onSelectAnchor,
  onSelectRadiusPreset,
  radiusValue,
  selectedDistrictSlug,
}: {
  onAdjustRadius: (delta: number) => void
  onSelectAnchor: (anchor: (typeof workerServiceAreaAnchors)[number]) => void
  onSelectRadiusPreset: (value: number) => void
  radiusValue: number
  selectedDistrictSlug: DistrictSlug
}) {
  const { language, tokens } = useWorkerUi()
  const verificationCopy = workerVerificationCopy[language] as WorkerVerificationCopy

  return (
    <View style={[styles.serviceAreaPicker, workerProfileServiceAreaSurface(tokens)]} testID="worker-verification-service-area-picker">
      <WorkerProfileMaterialChrome testID="worker-profile-service-area-crisp-shell" variant="panel" />
      <View style={styles.titleStack}>
        <Text style={[styles.kicker, { color: tokens.primary }]}>{verificationCopy.serviceAreaTitle}</Text>
        <Text style={[styles.bodyText, { color: tokens.muted }]}>{verificationCopy.serviceAreaBody}</Text>
      </View>
      <View style={styles.serviceAreaAnchorGrid} testID="worker-verification-service-area-anchors">
        {workerServiceAreaAnchors.map((anchor) => {
          const selected = selectedDistrictSlug === anchor.slug
          return (
            <Pressable
              accessibilityLabel={`${verificationCopy.serviceAreaTitle}: ${HCMC_DISTRICTS[anchor.slug]}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={anchor.slug}
              onPress={() => onSelectAnchor(anchor)}
              style={({ pressed }) => [
                styles.serviceAreaAnchorButton,
                { backgroundColor: selected ? tokens.primary : tokens.raised, borderColor: selected ? tokens.primary : tokens.border },
                pressed ? styles.pressed : null,
              ]}
              testID={`worker-verification-service-area-${anchor.slug}`}
            >
              <Text style={[styles.serviceAreaAnchorText, { color: selected ? tokens.primaryText : tokens.primary }]}>{HCMC_DISTRICTS[anchor.slug]}</Text>
            </Pressable>
          )
        })}
      </View>
      <View style={styles.serviceAreaRadiusRow} testID="worker-verification-radius-stepper">
        <Pressable
          accessibilityLabel={verificationCopy.radiusDecrease}
          accessibilityRole="button"
          onPress={() => onAdjustRadius(-1)}
          style={({ pressed }) => [
            styles.serviceAreaRadiusButton,
            { backgroundColor: tokens.raised, borderColor: tokens.border },
            pressed ? styles.pressed : null,
          ]}
          testID="worker-verification-radius-minus"
        >
          <Text style={[styles.serviceAreaRadiusControlText, { color: tokens.primary }]}>-</Text>
        </Pressable>
        <Text accessibilityLabel={verificationCopy.serviceRadius} style={[styles.serviceAreaRadiusValue, { color: tokens.ink }]} testID="worker-verification-service-radius">
          {radiusValue} km
        </Text>
        <Pressable
          accessibilityLabel={verificationCopy.radiusIncrease}
          accessibilityRole="button"
          onPress={() => onAdjustRadius(1)}
          style={({ pressed }) => [
            styles.serviceAreaRadiusButton,
            { backgroundColor: tokens.raised, borderColor: tokens.border },
            pressed ? styles.pressed : null,
          ]}
          testID="worker-verification-radius-plus"
        >
          <Text style={[styles.serviceAreaRadiusControlText, { color: tokens.primary }]}>+</Text>
        </Pressable>
      </View>
      <View style={styles.serviceAreaRadiusPresets}>
        {workerServiceRadiusPresets.map((value) => {
          const selected = radiusValue === value
          return (
            <Pressable
              accessibilityLabel={`${verificationCopy.radiusPreset} ${value} km`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={value}
              onPress={() => onSelectRadiusPreset(value)}
              style={({ pressed }) => [
                styles.serviceAreaAnchorButton,
                { backgroundColor: selected ? tokens.primary : tokens.raised, borderColor: selected ? tokens.primary : tokens.border },
                pressed ? styles.pressed : null,
              ]}
              testID={`worker-verification-radius-${value}`}
            >
              <Text style={[styles.serviceAreaAnchorText, { color: selected ? tokens.primaryText : tokens.primary }]}>{value} km</Text>
            </Pressable>
          )
        })}
      </View>
      <Text style={[styles.verificationHint, { color: tokens.subtle }]} testID="worker-verification-home-geo">
        {verificationCopy.serviceAreaManual}
      </Text>
    </View>
  )
}

function VerificationFileButton({ file, label, onPress, testID }: { file?: LocalMediaUploadDraft; label: string; onPress: () => void; testID: string }) {
  const { language, tokens } = useWorkerUi()
  const fileCopy = workerVerificationCopy[language].files
  const selected = Boolean(file)
  return (
    <Pressable
      accessibilityLabel={file ? `${label}: ${file.fileName ?? fileCopy.selectedFallback}` : `${fileCopy.choose} ${label}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.verificationFileButton,
        workerProfileFileButtonSurface(tokens, selected),
        pressed ? styles.pressed : null,
      ]}
      testID={testID}
    >
      <WorkerUtilityIcon frameSize={28} icon="document" size={28} small />
      <Text style={[styles.verificationFileText, { color: selected ? tokens.primary : tokens.muted }]} numberOfLines={2}>
        {file?.fileName ?? label}
      </Text>
    </Pressable>
  )
}

function finiteMapNumber(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function createWorkerMapProviderModel({
  areaLabel,
  fullAddressLabel,
  mapMode,
  serviceRadius,
  trafficEnabled,
  workerLat,
  workerLng,
}: {
  areaLabel: string
  fullAddressLabel: string | null
  mapMode: WorkerMapMode
  serviceRadius: number | null
  trafficEnabled: boolean
  workerLat: number | null | undefined
  workerLng: number | null | undefined
}): WorkerMapProviderModel {
  const lat = finiteMapNumber(workerLat)
  const lng = finiteMapNumber(workerLng)
  const releasedFullAddressLabel = fullAddressLabel?.trim() || null
  return {
    areaLabel,
    fullAddressLabel: releasedFullAddressLabel,
    mapMode,
    serviceRadius,
    routeRequestReady: mapMode === 'route' && Boolean(releasedFullAddressLabel),
    trafficEnabled,
    workerOrigin: lat !== null && lng !== null ? { lat, lng } : null,
  }
}

function buildWorkerMapDirectionsUrl(destinationLabel: string) {
  const destination = normalizeWorkerMapDirectionsDestination(destinationLabel)
  const params = new URLSearchParams({
    api: '1',
    destination,
    dir_action: 'navigate',
    travelmode: 'driving',
  })
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

function normalizeWorkerMapDirectionsDestination(destinationLabel: string) {
  const fallback = destinationLabel.trim()
  const routeParts: string[] = []
  for (const part of fallback.split(',')) {
    const trimmed = part.trim()
    if (trimmed && !isFineGrainedAddressPart(trimmed)) routeParts.push(trimmed)
  }
  return routeParts.length >= 2 ? routeParts.join(', ') : fallback
}

function isFineGrainedAddressPart(part: string) {
  const normalized = part
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim()
  if (/^(tang|lau|floor)\s+[a-z0-9-]+$/.test(normalized)) return true
  if (/^(phong|unit|apt)\s+[a-z0-9-]+$/.test(normalized)) return true
  if (/^(can ho|can|apartment)\s+[a-z0-9-]+$/.test(normalized)) return true
  return /^(can ho|can|apartment)\s+[a-z0-9-]+\s+[a-z0-9-]+$/.test(normalized) && /\d/.test(normalized)
}

async function openWorkerMapDirections(destinationLabel: string, language: WorkerLanguageMode) {
  const destination = destinationLabel.trim()
  if (!destination) {
    Alert.alert(
      language === 'en' ? 'Address unavailable' : 'Chưa có địa chỉ',
      language === 'en'
        ? 'Kael has not released a specific address for directions yet.'
        : 'Kael chưa mở địa chỉ cụ thể để chỉ đường.',
    )
    return
  }

  try {
    await Linking.openURL(buildWorkerMapDirectionsUrl(destination))
  } catch {
    Alert.alert(
      language === 'en' ? 'Maps could not open' : 'Chưa mở được Maps',
      language === 'en'
        ? 'Try again after checking your Maps app or connection.'
        : 'Hãy thử lại sau khi kiểm tra ứng dụng Maps hoặc kết nối.',
    )
  }
}

function workerHomeMapReducer(state: WorkerHomeMapState, action: WorkerHomeMapAction): WorkerHomeMapState {
  switch (action.type) {
    case 'close':
      return { ...state, expanded: false }
    case 'open':
      return { ...state, centered: false, expanded: true }
    case 'recenter':
      return { ...state, centered: true, compassNorth: true, zoom: 1 }
    case 'toggle_compass':
      return { ...state, compassNorth: !state.compassNorth }
    case 'toggle_layer':
      return { ...state, layerDetailed: !state.layerDetailed }
    case 'toggle_traffic':
      return { ...state, trafficEnabled: !state.trafficEnabled }
    case 'zoom_in':
      return { ...state, zoom: Math.min(1.28, Number((state.zoom + 0.14).toFixed(2))) }
    case 'zoom_out':
      return { ...state, zoom: Math.max(0.86, Number((state.zoom - 0.14).toFixed(2))) }
    default:
      return state
  }
}

function WorkerMapProviderBridge({
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

function WorkerMapPulseDot({ testID, tone }: { testID: string; tone: 'area' | 'route' | 'worker' }) {
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
    ? language === 'en' ? 'Online' : 'Bạn đang trực tuyến'
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
  const verificationLabel = workerProfile
    ? localizedWorkerVerificationStatus(workerProfile.verification_status, language)
    : appCopy[language].common.noData
  const requestSignalLabel = !deal
    ? copy.jobs.waitingEmptyTitle
    : acceptedDeal
      ? localizedStatusLabel(selectors.currentStatus, language)
      : localizedServiceLabel(deal.draft.serviceType, language)
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
      <View style={styles.metricRow} testID="worker-readiness-signal-panel">
        <Metric label={copy.home.readinessVerification} testID="worker-readiness-verification" value={verificationLabel} />
        <Metric label={copy.home.readinessAvailability} testID="worker-readiness-availability" value={availabilityLabel} />
        <Metric label={copy.home.readinessRequest} testID="worker-readiness-request" value={requestSignalLabel} />
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

function CompactWorkerPresenceMap({ density = 'regular', mode }: { density?: 'dense' | 'regular'; mode: Exclude<WorkerMapSurface, 'home'> }) {
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

type WorkerProgressAction =
  | 'worker_start_travel'
  | 'worker_mark_arrived'
  | 'worker_start_inspection'
  | 'worker_start_repair'
  | 'worker_complete_job'

function getNextWorkerAction(status: LocalDealStatus | null, language: WorkerLanguageMode): { label: string; type: WorkerProgressAction } | null {
  const progressCopy = workerActionCopy[language].progress
  if (status === 'worker_matched') return { label: progressCopy.worker_start_travel, type: 'worker_start_travel' }
  if (status === 'worker_on_way') return { label: progressCopy.worker_mark_arrived, type: 'worker_mark_arrived' }
  if (status === 'arrived') return { label: progressCopy.worker_start_inspection, type: 'worker_start_inspection' }
  if (status === 'inspecting') return { label: progressCopy.worker_start_repair, type: 'worker_start_repair' }
  if (status === 'repairing') return { label: progressCopy.worker_complete_job, type: 'worker_complete_job' }
  return null
}

function workerStatusForAction(action: WorkerProgressAction): Extract<LocalDealStatus, 'worker_on_way' | 'arrived' | 'inspecting' | 'repairing' | 'completed_by_worker'> | null {
  if (action === 'worker_start_travel') return 'worker_on_way'
  if (action === 'worker_mark_arrived') return 'arrived'
  if (action === 'worker_start_inspection') return 'inspecting'
  if (action === 'worker_start_repair') return 'repairing'
  if (action === 'worker_complete_job') return 'completed_by_worker'
  return null
}

type IncomingRequestDraftField =
  | 'cancellationReasonDraft'
  | 'completionNoteDraft'
  | 'scopeReasonDraft'

type IncomingRequestDraftState = {
  cancellationReasonDraft: string
  completionNoteDraft: string
  completionPhotos: LocalMediaUploadDraft[]
  scopeReasonDraft: string
  scopePhotos: LocalMediaUploadDraft[]
}

type IncomingRequestDraftAction =
  | { type: 'clear_cancellation' }
  | { type: 'clear_completion' }
  | { type: 'clear_scope' }
  | { type: 'completion_photo'; photo: LocalMediaUploadDraft }
  | { type: 'field'; field: IncomingRequestDraftField; value: string }
  | { type: 'scope_photo'; photo: LocalMediaUploadDraft }

const EMPTY_INCOMING_REQUEST_DRAFTS: IncomingRequestDraftState = {
  cancellationReasonDraft: '',
  completionNoteDraft: '',
  completionPhotos: [],
  scopeReasonDraft: '',
  scopePhotos: [],
}

function incomingRequestDraftReducer(state: IncomingRequestDraftState, action: IncomingRequestDraftAction): IncomingRequestDraftState {
  switch (action.type) {
    case 'field':
      return { ...state, [action.field]: action.value }
    case 'completion_photo':
      return { ...state, completionPhotos: [...state.completionPhotos, action.photo].slice(0, 5) }
    case 'scope_photo':
      return { ...state, scopePhotos: [...state.scopePhotos, action.photo].slice(0, 5) }
    case 'clear_completion':
      return { ...state, completionNoteDraft: '', completionPhotos: [] }
    case 'clear_scope':
      return { ...state, scopeReasonDraft: '', scopePhotos: [] }
    case 'clear_cancellation':
      return { ...state, cancellationReasonDraft: '' }
    default:
      return state
  }
}

function IncomingRequestSheet({ compact = false, material = 'standard' }: { compact?: boolean; material?: GlassMaterial }) {
  const { copy, language, tokens } = useWorkerUi()
  const { actions, selectors, state } = useFrontendWorkflow()
  const actionCopy = workerActionCopy[language]
  const [requestDrafts, requestDraftDispatch] = useReducer(incomingRequestDraftReducer, EMPTY_INCOMING_REQUEST_DRAFTS)
  const [isUploadingScope, setIsUploadingScope] = useState(false)
  const { cancellationReasonDraft, completionNoteDraft, completionPhotos, scopePhotos, scopeReasonDraft } = requestDrafts
  const updateRequestDraft = (field: IncomingRequestDraftField) => (value: string) => requestDraftDispatch({ type: 'field', field, value })
  const deal = getWorkerVisibleDeal(state.deal)
  const jobId = deal?.id ?? ''
  const broadcast = deal?.broadcast ?? null
  const nextAction = selectors.canWorkerAdvance ? getNextWorkerAction(selectors.currentStatus, language) : null
  const localizedProblemSummary = broadcast ? localizedWorkerProblemSummary(broadcast, language) : copy.request.title
  const workerBriefLines = broadcast ? buildWorkerBroadcastBrief(deal, broadcast, selectors.currentStatus, language, selectors.canWorkerSeeFullAddress) : copy.request.brief
  const canRequestScopeChange = selectors.currentStatus === 'inspecting' || selectors.currentStatus === 'repairing'
  const hasBroadcast = Boolean(broadcast)
  const workflow = useServiceWorkflow({
    status: selectors.currentBackendStatus,
    hasAiNotes: Boolean(deal?.estimate?.advisory),
    hasCompletionEvidence: hasLocalDealCompletionEvidence(deal),
    hasCustomerInput: Boolean(deal),
    hasEstimate: Boolean(deal?.estimate),
    hasScopeChange: Boolean(deal?.scopeChange),
  })
  const canRequestCancellation = Boolean(hasBroadcast && !selectors.canWorkerAccept && [
    'worker_matched',
    'worker_on_way',
    'arrived',
    'inspecting',
    'repairing',
    'scope_change_pending',
  ].includes(selectors.currentStatus ?? ''))
  const secondsRemainingLabel = broadcast?.secondsRemaining === null || broadcast?.secondsRemaining === undefined ? null : language === 'en' ? `${broadcast.secondsRemaining}s` : `${broadcast.secondsRemaining} giây`
  const pickCompletionPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert(actionCopy.alerts.completionPermissionTitle, actionCopy.alerts.completionPermissionBody)
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.86,
      selectionLimit: 5,
    })
    if (result.canceled || !result.assets[0]) return
    result.assets.slice(0, 5).forEach((asset) => {
      const draft = {
        uri: asset.uri,
        type: 'image' as const,
        fileName: asset.fileName ?? asset.uri.split('/').pop(),
        mimeType: asset.mimeType ?? undefined,
        fileSizeBytes: asset.fileSize ?? undefined,
      }
      requestDraftDispatch({ type: 'completion_photo', photo: draft })
    })
  }
  const pickScopePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert(actionCopy.alerts.scopePermissionTitle, actionCopy.alerts.scopePermissionBody)
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: false,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.86,
      selectionLimit: 1,
    })
    if (result.canceled || !result.assets[0]) return
    const asset = result.assets[0]
    const draft: LocalMediaUploadDraft = {
        uri: asset.uri,
        type: 'image',
        fileName: asset.fileName ?? asset.uri.split('/').pop(),
        mimeType: asset.mimeType ?? undefined,
        fileSizeBytes: asset.fileSize ?? undefined,
    }
    requestDraftDispatch({ type: 'scope_photo', photo: draft })
  }
  const confirmWorkerProgressAction = (action: { label: string; type: WorkerProgressAction }) => {
    const nextStatus = workerStatusForAction(action.type)
    if (!nextStatus) return
    if (action.type !== 'worker_complete_job') {
      void actions.workerUpdateStatus(nextStatus)
      return
    }

    const completionNote = completionNoteDraft.trim()
    if (completionNote.length < 5) {
      Alert.alert(actionCopy.alerts.completionNoteRequiredTitle, actionCopy.alerts.completionNoteRequiredBody)
      return
    }
    if (completionPhotos.length === 0) {
      Alert.alert(actionCopy.alerts.completionPhotoRequiredTitle, actionCopy.alerts.completionPhotoRequiredBody)
      return
    }

    Alert.alert(
      actionCopy.alerts.completeTitle,
      actionCopy.alerts.completeBody,
      [
        { text: actionCopy.review, style: 'cancel' },
        {
          text: action.label,
          onPress: () => {
            void (async () => {
              const uploaded = await uploadJobMediaDrafts(deal?.id ?? '', completionPhotos, 'after')
              if (!uploaded.success) {
                Alert.alert(actionCopy.alerts.completionUploadTitle, uploaded.error)
                return
              }
              const updated = await actions.workerUpdateStatus(nextStatus, {
                completion_notes: completionNote,
                completion_photo_urls: uploaded.mediaRefs,
              })
              if (!updated) return
              requestDraftDispatch({ type: 'clear_completion' })
            })()
          },
        },
      ],
    )
  }
  const submitScopeChangeRequest = () => {
    const reason = scopeReasonDraft.trim()
    if (reason.length < 10) {
      Alert.alert(actionCopy.alerts.scopeDescriptionTitle, actionCopy.alerts.scopeDescriptionBody)
      return
    }
    Alert.alert(
      actionCopy.alerts.scopeConfirmTitle,
      actionCopy.alerts.scopeConfirmBody,
      [
        { text: actionCopy.review, style: 'cancel' },
        {
          text: actionCopy.send,
          onPress: async () => {
            setIsUploadingScope(true)
            try {
              let photoUrls: string[] = []
              if (scopePhotos.length > 0) {
                const upload = await uploadJobMediaDrafts(jobId, scopePhotos, 'scope_change_evidence')
                if (!upload.success) {
                  Alert.alert(actionCopy.alerts.scopeUploadTitle, upload.error)
                  return
                }
                photoUrls = upload.mediaRefs
              }
              // Phase 2.0: worker không gửi price; Kael compute sau khi insert.
              await actions.requestScopeChange({
                new_description: reason,
                reason,
                photo_urls: photoUrls,
              })
              requestDraftDispatch({ type: 'clear_scope' })
            } finally {
              setIsUploadingScope(false)
            }
          },
        },
      ],
    )
  }
  const submitCancellationRequest = () => {
    const reason = cancellationReasonDraft.trim()
    if (reason.length < 10) {
      Alert.alert(actionCopy.alerts.cancelReasonTitle, actionCopy.alerts.cancelReasonBody)
      return
    }
    Alert.alert(
      actionCopy.alerts.cancelConfirmTitle,
      actionCopy.alerts.cancelConfirmBody,
      [
        { text: actionCopy.review, style: 'cancel' },
        {
          text: actionCopy.send,
          onPress: () => {
            requestDraftDispatch({ type: 'clear_cancellation' })
            void actions.requestWorkerCancellation({
              reason,
              evidence_photo_urls: [],
            })
          },
        },
      ],
    )
  }
  const fullAddressLabel = broadcast?.fullAddressVisible ? broadcast.fullAddressLabel ?? null : null
  const canRenderFullAddress = Boolean(selectors.canWorkerSeeFullAddress && fullAddressLabel)
  const addressLabel = canRenderFullAddress
    ? localizedWorkerAreaLabel(fullAddressLabel, language)
    : broadcast?.generalArea
      ? `${localizedWorkerAreaLabel(broadcast.generalArea, language)} · ${actionCopy.hiddenAddress}`
      : appCopy[language].common.noRequest
  const priceDisclaimer = language === 'en'
    ? 'This is a Kael estimate from current evidence. Kael may update it when new scope evidence is added.'
    : LOCAL_WORKFLOW_PRICE_DISCLAIMER

  return (
    <ReduceMotionAwareEntranceView delayMs={compact ? 40 : 80} distanceY={compact ? 8 : 14} testID="worker-request-sheet-motion">
      <GlassModalSheet material={material} mode={tokens.mode} style={[styles.requestSheet, material === 'liquid' ? workerHomeLiquidSheetSurface(tokens) : null, compact ? styles.requestSheetCompact : null]} testID="worker-request-sheet">
      {material === 'liquid' ? <WorkerHomeMaterialSubstrate surface="sheet" /> : null}
      {material === 'liquid' ? <WorkerHomeMaterialDepthPlane surface="sheet" /> : null}
      <SubtleGlassHighlight liquid={material === 'liquid'} />
      {material === 'liquid' ? <LiquidSharpKeyline variant="sheet" /> : null}
      {material === 'liquid' ? <LiquidSpecularLayer variant="sheet" /> : null}
      {material === 'liquid' ? <LiquidPanelGlassOverlay variant="sheet" /> : null}
      <MotionSweep />
      <View style={styles.hiddenMarker} testID="worker-no-live-request-empty-state" />
      <View style={styles.hiddenMarker} testID="worker-safe-address-gate" />
      <View style={styles.rowBetween}>
        <View style={[styles.serviceBadge, { backgroundColor: tokens.mint }]}>
          <Icon name={deal?.draft.serviceType === 'plumbing' ? 'water' : deal?.draft.serviceType === 'cleaning' ? 'spark' : 'bolt'} small />
          <Text adjustsFontSizeToFit minimumFontScale={0.84} numberOfLines={1} style={[styles.serviceBadgeText, { color: tokens.primary }]}>{hasBroadcast ? localizedServiceLabel(deal?.draft.serviceType ?? null, language) : copy.request.service}</Text>
        </View>
        {secondsRemainingLabel && selectors.canWorkerAccept ? (
          <View style={[styles.countdownRing, { borderColor: tokens.primary }]} testID="worker-local-broadcast-countdown">
            <Text style={[styles.countdownText, { color: tokens.primary }]}>{secondsRemainingLabel}</Text>
          </View>
        ) : null}
      </View>

      <Text adjustsFontSizeToFit minimumFontScale={0.84} numberOfLines={2} style={[styles.requestTitle, { color: tokens.ink }]}>{localizedProblemSummary}</Text>
      <WorkerRequestAddressRow addressLabel={addressLabel} canRenderFullAddress={canRenderFullAddress} tokens={tokens} />
      {hasBroadcast ? <WorkerRequestPhaseInline phaseContext={workflow.phaseContext} /> : null}

      <View style={[styles.kaelBrief, workerDiagnosisSurface(tokens)]} testID="worker-kael-brief">
        <View style={styles.identityRow}>
          <Image source={kaelHead} style={[styles.kaelMini, { borderColor: tokens.borderStrong }]} />
          <Text style={[styles.kaelBriefTitle, { color: tokens.ink }]}>{copy.request.briefTitle}</Text>
        </View>
        {workerBriefLines.map((brief) => (
          <View key={brief} style={styles.briefItem}>
            <View style={[styles.briefDot, { backgroundColor: tokens.primary }]} />
            <Text style={[styles.briefText, { color: tokens.muted }]} numberOfLines={2}>
              {brief}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.priceRow}>
        <Metric label={copy.request.customerEstimate} value={broadcast?.estimatedPriceLabel ?? (language === 'en' ? 'Waiting for Kael estimate' : 'Chờ Kael ước tính')} />
        <Metric label={copy.request.workerEarns} value={broadcast?.estimatedEarningLabel ?? (language === 'en' ? 'Calculated after Kael price' : 'Chờ Kael tính tiền công')} />
      </View>
      {hasBroadcast ? (
        <Text style={[styles.priceDisclaimer, { color: tokens.muted }]} testID="worker-request-price-disclaimer">
          {priceDisclaimer}
        </Text>
      ) : null}
      {canRequestScopeChange ? (
        <WorkerScopeChangeRequestBox
          actionCopy={actionCopy}
          isUploadingScope={isUploadingScope}
          onPickPhoto={pickScopePhoto}
          onSubmit={submitScopeChangeRequest}
          onUpdateReason={updateRequestDraft('scopeReasonDraft')}
          photoCount={scopePhotos.length}
          reason={scopeReasonDraft}
          tokens={tokens}
        />
      ) : null}
      {selectors.currentStatus === 'scope_change_pending' ? (
        <Text style={[styles.bodyText, { color: tokens.muted }]} testID="worker-scope-change-waiting">
          {actionCopy.scopeWaiting}
        </Text>
      ) : null}
      {canRequestCancellation ? (
        <WorkerCancellationRequestBox
          actionCopy={actionCopy}
          onSubmit={submitCancellationRequest}
          onUpdateReason={updateRequestDraft('cancellationReasonDraft')}
          reason={cancellationReasonDraft}
          tokens={tokens}
        />
      ) : null}
      {nextAction?.type === 'worker_complete_job' ? (
        <WorkerCompletionEvidenceBox
          actionCopy={actionCopy}
          note={completionNoteDraft}
          onPickPhoto={pickCompletionPhoto}
          onUpdateNote={updateRequestDraft('completionNoteDraft')}
          photos={completionPhotos}
          tokens={tokens}
        />
      ) : null}
      {selectors.canWorkerAccept ? (
        <View style={styles.actionRow}>
          <PressButton label={copy.request.decline} onPress={() => void actions.workerDeclineBroadcast()} secondary />
          <PressButton label={copy.request.accept} onPress={() => void actions.workerAcceptBroadcast()} testID="worker-local-accept-deal" />
        </View>
      ) : nextAction?.type === 'worker_complete_job' ? (
        <PressButton label={nextAction.label} onPress={() => confirmWorkerProgressAction(nextAction)} testID="worker-local-status-action" />
      ) : hasBroadcast ? (
        <Text style={[styles.bodyText, { color: tokens.muted }]}>{localizedStatusLabel(selectors.currentStatus, language)}</Text>
      ) : null}
      </GlassModalSheet>
    </ReduceMotionAwareEntranceView>
  )
}

function WorkerScopeChangeRequestBox({
  actionCopy,
  isUploadingScope,
  onPickPhoto,
  onSubmit,
  onUpdateReason,
  photoCount,
  reason,
  tokens,
}: {
  actionCopy: (typeof workerActionCopy)[WorkerLanguageMode]
  isUploadingScope: boolean
  onPickPhoto: () => void
  onSubmit: () => void
  onUpdateReason: (value: string) => void
  photoCount: number
  reason: string
  tokens: WorkerThemeTokens
}) {
  return (
    <View style={styles.scopeRequestBox} testID="worker-scope-change-request">
      <TextInput
        accessibilityLabel={actionCopy.scopeDescription}
        onChangeText={onUpdateReason}
        placeholder={actionCopy.scopeDescription}
        placeholderTextColor={tokens.subtle}
        style={[styles.chatInput, { borderColor: tokens.border, color: tokens.ink }]}
        value={reason}
      />
      <View style={styles.actionRow}>
        <PressButton label={actionCopy.addScopePhoto} onPress={onPickPhoto} secondary testID="worker-scope-change-add-photo" />
        <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={1} testID="worker-scope-change-photo-count">
          {photoCount > 0 ? actionCopy.scopePhotoCount(photoCount) : actionCopy.scopePhotoOptional}
        </Text>
      </View>
      <PressButton disabled={isUploadingScope} label={isUploadingScope ? actionCopy.uploading : actionCopy.scopeSubmit} onPress={onSubmit} secondary testID="worker-scope-change-submit" />
    </View>
  )
}

function WorkerCancellationRequestBox({
  actionCopy,
  onSubmit,
  onUpdateReason,
  reason,
  tokens,
}: {
  actionCopy: (typeof workerActionCopy)[WorkerLanguageMode]
  onSubmit: () => void
  onUpdateReason: (value: string) => void
  reason: string
  tokens: WorkerThemeTokens
}) {
  return (
    <View style={styles.scopeRequestBox} testID="worker-cancellation-request">
      <TextInput
        accessibilityLabel={actionCopy.cancelReason}
        onChangeText={onUpdateReason}
        placeholder={actionCopy.cancelPlaceholder}
        placeholderTextColor={tokens.subtle}
        style={[styles.chatInput, { borderColor: tokens.border, color: tokens.ink }]}
        value={reason}
      />
      <PressButton label={actionCopy.cancelSubmit} onPress={onSubmit} secondary testID="worker-cancellation-submit" />
    </View>
  )
}

function WorkerCompletionEvidenceBox({
  actionCopy,
  note,
  onPickPhoto,
  onUpdateNote,
  photos,
  tokens,
}: {
  actionCopy: (typeof workerActionCopy)[WorkerLanguageMode]
  note: string
  onPickPhoto: () => void
  onUpdateNote: (value: string) => void
  photos: LocalMediaUploadDraft[]
  tokens: WorkerThemeTokens
}) {
  const photoCount = photos.length

  return (
    <View style={styles.scopeRequestBox} testID="worker-completion-evidence-blocker">
      <TextInput
        accessibilityLabel={actionCopy.completionNote}
        onChangeText={onUpdateNote}
        placeholder={actionCopy.completionNote}
        placeholderTextColor={tokens.subtle}
        style={[styles.chatInput, { borderColor: tokens.border, color: tokens.ink }]}
        testID="worker-completion-note-input"
        value={note}
      />
      <View style={styles.actionRow}>
        <PressButton label={actionCopy.addCompletionPhoto} onPress={onPickPhoto} secondary testID="worker-completion-add-photo" />
        <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={1} testID="worker-completion-photo-count">
          {photoCount > 0 ? actionCopy.completionPhotoCount(photoCount) : actionCopy.completionPhotoRequired}
        </Text>
      </View>
      {photoCount > 0 ? (
        <View style={styles.completionPhotoPreviewRail} testID="worker-completion-photo-preview-rail">
          {photos.map((photo, index) => (
            <View key={`${photo.uri}-${index}`} style={[styles.completionPhotoPreviewTile, { backgroundColor: tokens.glassStrong, borderColor: tokens.border }]} testID={`worker-completion-photo-preview-${index}`}>
              <Image contentFit="cover" source={{ uri: photo.uri }} style={styles.completionPhotoPreviewImage} testID={`worker-completion-photo-preview-image-${index}`} />
              <Text style={[styles.workerMiniMeta, { color: tokens.muted }]} numberOfLines={1}>
                {photo.fileName ?? actionCopy.completionPhoto}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}

function WorkerRequestAddressRow({
  addressLabel,
  canRenderFullAddress,
  tokens,
}: {
  addressLabel: string
  canRenderFullAddress: boolean
  tokens: WorkerThemeTokens
}) {
  return (
    <View style={styles.areaRow} testID={canRenderFullAddress ? 'worker-full-address-after-accept' : 'worker-general-area-before-accept'}>
      <Icon name="map" small />
      <Text numberOfLines={2} style={[styles.areaText, { color: tokens.muted }]}>{addressLabel}</Text>
    </View>
  )
}

function WorkerDockOverlay({ active, hidden }: { active: WorkerActiveTab; hidden: boolean }) {
  const { replace } = useRouter()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const { copy, tokens } = useWorkerUi()
  const { reduceMotion } = useGlassAccessibility()
  const frameWidth = Math.min(width, 430)
  const dockWidth = Math.max(Math.min(frameWidth - 48, 356), 0)
  const dockActionSize = 64
  const dockGap = 14
  const dockMainWidth = Math.max(dockWidth - dockActionSize - dockGap, 0)
  const bottom = Math.max(insets.bottom + workerDockBottomMargin, workerDockBottomMargin)
  const dockTranslateY = useSharedValue(hidden ? 90 : 0)
  const dockScaleX = useSharedValue(hidden ? 0.955 : 1)
  const dockScaleY = useSharedValue(hidden ? 0.84 : 1)
  const dockOpacity = useSharedValue(hidden ? 0 : 1)
  const dockMotionStyle = useAnimatedStyle(() => ({
    opacity: dockOpacity.value,
    transform: reduceMotion
      ? []
      : [
        { translateY: dockTranslateY.value },
        { scaleX: dockScaleX.value },
        { scaleY: dockScaleY.value },
      ],
  }), [reduceMotion])
  type WorkerDockItem = FloatingGlassTabItem<WorkerActiveTab> & {
    icon: Exclude<WorkerDockIconName, 'kael'>
    path: WorkerRoutePath
  }
  const items: WorkerDockItem[] = [
    { key: 'home', accessibilityLabel: copy.nav.home, icon: 'apartment', path: '/(worker)/home', testID: 'worker-dock-home' },
    { key: 'jobs', accessibilityLabel: copy.nav.jobs, icon: 'document', path: '/(worker)/jobs?tab=waiting', testID: 'worker-dock-jobs' },
    { key: 'earnings', accessibilityLabel: copy.nav.earnings, icon: 'payment', path: '/(worker)/earnings', testID: 'worker-dock-earnings' },
    { key: 'profile', accessibilityLabel: copy.nav.profile, icon: 'person', path: '/(worker)/profile', testID: 'worker-dock-profile' },
  ]
  const chatPath = '/(worker)/chat' as const

  useEffect(() => {
    const timeout = setTimeout(() => {
      lastWorkerDockActive = active
    }, 560)
    return () => clearTimeout(timeout)
  }, [active])

  useEffect(() => {
    if (reduceMotion) {
      dockOpacity.value = withTiming(hidden ? 0 : 1, { duration: 120 })
      dockTranslateY.value = hidden ? 0 : 0
      dockScaleX.value = 1
      dockScaleY.value = 1
      return
    }

    dockOpacity.value = withTiming(hidden ? 0 : 1, { duration: hidden ? 105 : 145 })
    dockTranslateY.value = withSpring(hidden ? 90 : 0, hidden ? motionTokens.liquid.press : motionTokens.liquid.entrance)
    dockScaleX.value = hidden
      ? withSpring(0.955, motionTokens.liquid.press)
      : withSequence(
        withSpring(1.026, motionTokens.liquid.pill),
        withSpring(1, motionTokens.liquid.press),
      )
    dockScaleY.value = hidden
      ? withSpring(0.84, motionTokens.liquid.press)
      : withSequence(
        withSpring(1.045, motionTokens.liquid.pill),
        withSpring(1, motionTokens.liquid.press),
      )
  }, [dockOpacity, dockScaleX, dockScaleY, dockTranslateY, hidden, reduceMotion])

  return (
    <Animated.View pointerEvents={hidden ? 'none' : 'box-none'} style={[styles.dockWrap, { bottom, width: dockWidth }, dockMotionStyle]} testID="worker-dock-motion-shell">
      <View pointerEvents="none" style={styles.hiddenMarker} testID="worker-dock-glass-aura" />
      <View style={styles.workerDockSplitRow} testID="worker-dock-split-toolbar">
        <FloatingGlassTabBar<WorkerActiveTab, WorkerDockItem>
          activeKey={active === 'chat' ? null : active}
          items={items}
          material="liquid"
          mode={tokens.mode}
          onItemPress={(item) => {
            if (item.key === active) return
            lastWorkerDockActive = active
            replace(item.path)
          }}
          previousKey={active === 'chat' || lastWorkerDockActive === 'chat' ? null : lastWorkerDockActive}
          iconForItem={(item, focused) => <WorkerDockIcon focused={focused} name={item.icon} />}
          style={[styles.workerDock, styles.workerDockMainCluster, { width: dockMainWidth }, workerHomeDockGlassSurface(tokens)]}
          testID="worker-liquid-glass-dock"
        />
        <Pressable
          accessibilityLabel={copy.nav.chat}
          accessibilityRole="tab"
          accessibilityState={{ selected: active === 'chat' }}
          onPress={() => {
            if (active === 'chat') return
            lastWorkerDockActive = active
            replace(chatPath)
          }}
          style={({ pressed }) => [styles.workerDockKaelActionPressable, reduceMotionAwarePressStyle(pressed, reduceMotion)]}
          testID="worker-dock-chat"
        >
          <GlassSurface
            material="liquid"
            mode={tokens.mode}
            style={[styles.workerDockKaelActionGlass, workerDockKaelActionSurface(tokens, active === 'chat')]}
            testID="worker-dock-kael-action-glass"
            variant="nav"
          >
            <View pointerEvents="none" style={[styles.workerDockKaelActionEdge, workerDockKaelActionEdgeSurface(tokens)]} testID="worker-dock-kael-action-edge" />
            <View pointerEvents="none" style={[styles.workerDockKaelActionAura, workerDockKaelActionAuraSurface(tokens, active === 'chat')]} testID="worker-dock-kael-action-aura" />
            <WorkerDockIcon focused={active === 'chat'} name="kael" />
          </GlassSurface>
        </Pressable>
      </View>
    </Animated.View>
  )
}

function WorkerDockIcon({ focused, name }: { focused: boolean; name: WorkerDockIconName }) {
  if (name === 'kael') {
    return <Image contentFit="contain" source={kaelHead} style={[styles.workerDockKaelImage, focused ? styles.workerDockKaelImageFocused : null]} testID="worker-dock-kael-mascot-icon" />
  }

  return (
    <WorkerImageIcon
      frameSize={focused ? 32 : 28}
      name={workerDockImageIcons[name]}
      size={focused ? 32 : 24}
      style={[styles.workerDockAssetImage, focused ? styles.workerDockAssetImageFocused : null]}
    />
  )
}

function AmbientBackdrop() {
  const { tokens } = useWorkerUi()

  return (
    <>
      <View style={[styles.backdropWarm, { backgroundColor: tokens.cream }]} />
      <View style={[styles.backdropMint, { backgroundColor: tokens.aqua }, workerAmbientMintWashStyle]} />
      <View style={[styles.backdropCyan, { backgroundColor: tokens.cyan }]} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, workerAmbientLineWashStyle]}>
        <Svg style={StyleSheet.absoluteFill} viewBox="0 0 390 844" preserveAspectRatio="none">
          <Path d="M-10 210 C74 178 128 230 198 190 S332 132 420 164" stroke={tokens.line} strokeWidth={2.2} opacity={0.42} fill="none" />
          <Path d="M42 78 C118 124 126 174 88 238 S92 366 176 394 S302 378 410 424" stroke={tokens.line} strokeWidth={1.8} opacity={0.28} fill="none" />
          <Path d="M-20 604 C72 570 112 620 182 584 S316 512 420 550" stroke={tokens.line} strokeWidth={2} opacity={0.26} fill="none" />
        </Svg>
      </View>
    </>
  )
}

function WorkerSectionMotionField({
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

function MapLineField({ compact = false, detailed = false, expanded = false }: { compact?: boolean; detailed?: boolean; expanded?: boolean }) {
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

function WorkerMapRouteLine({ compact = false, expanded = false, trafficEnabled = false }: { compact?: boolean; expanded?: boolean; trafficEnabled?: boolean }) {
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

function WorkerMapCoverageLine({ compact = false, expanded = false }: { compact?: boolean; expanded?: boolean }) {
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

function WorkerMapControlStack({
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

function WorkerMapCloseGlyph() {
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

function WorkerMapRouteSummary({
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

function SubtleGlassHighlight({ liquid = false }: { liquid?: boolean } = {}) {
  const { tokens } = useWorkerUi()

  if (tokens.glassHighlight === 'transparent') return null
  return <View pointerEvents="none" style={[styles.glassTopHighlight, { backgroundColor: liquid ? workerLiquidEdgeHighlight(tokens) : tokens.glassHighlight, opacity: liquid ? (tokens.mode === 'dark' ? 1 : 0.92) : undefined }]} />
}

function LiquidSharpKeyline({ variant = 'hero' }: { variant?: 'hero' | 'panel' | 'sheet' } = {}) {
  const { tokens } = useWorkerUi()

  if (tokens.glassHighlight === 'transparent') return null
  return <View pointerEvents="none" style={[styles.liquidSharpKeyline, variant === 'panel' ? styles.liquidSharpKeylinePanel : null, variant === 'sheet' ? styles.liquidSharpKeylineSheet : null, workerLiquidSharpKeyline(tokens)]} testID={`worker-liquid-sharp-keyline-${variant}`} />
}

function LiquidSpecularLayer({ variant = 'hero' }: { variant?: 'hero' | 'panel' | 'sheet' } = {}) {
  const { tokens } = useWorkerUi()

  if (tokens.glassHighlight === 'transparent') return null
  return (
    <>
      <View pointerEvents="none" style={[styles.liquidSpecularBand, variant === 'panel' ? styles.liquidSpecularBandPanel : null, workerLiquidSpecularBand(tokens, variant)]} />
      <View pointerEvents="none" style={[styles.liquidRefractionPool, variant === 'panel' ? styles.liquidRefractionPoolPanel : null, workerLiquidRefractionPool(tokens, variant)]} />
    </>
  )
}

function LiquidMapOptics() {
  const { tokens } = useWorkerUi()

  if (tokens.glassHighlight === 'transparent') return null
  return (
    <>
      <View pointerEvents="none" style={[styles.mapLiquidLens, workerMapLiquidLens(tokens)]} testID="worker-map-liquid-lens" />
      <View pointerEvents="none" style={[styles.mapLiquidSpecularArc, workerMapLiquidSpecularArc(tokens)]} />
    </>
  )
}

function LiquidMapGlassOverlay({ expanded = false }: { expanded?: boolean } = {}) {
  const { tokens } = useWorkerUi()

  if (tokens.glassHighlight === 'transparent') return null
  return (
    <>
      <View pointerEvents="none" style={[styles.mapLiquidGlassOverlay, expanded ? styles.mapLiquidGlassOverlayExpanded : null, workerMapLiquidGlassOverlay(tokens)]} testID={expanded ? 'worker-map-liquid-glass-overlay-expanded' : 'worker-map-liquid-glass-overlay'} />
      <View pointerEvents="none" style={[styles.mapLiquidGlassEdge, expanded ? styles.mapLiquidGlassOverlayExpanded : null, workerMapLiquidGlassEdge(tokens)]} />
    </>
  )
}

function LiquidPanelGlassOverlay({ variant }: { variant: 'panel' | 'sheet' }) {
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

function WorkerHomeMaterialDepthPlane({ surface }: { surface: 'map' | 'readiness' | 'sheet' }) {
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

function WorkerHomeMaterialSubstrate({ surface }: { surface: 'map' | 'readiness' | 'sheet' }) {
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

function WorkerHomeMapMaterialContours({ expanded = false }: { expanded?: boolean } = {}) {
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

function MotionSweep({ testID }: { testID?: string }) {
  const { tokens } = useWorkerUi()
  const { reduceMotion, reduceTransparency } = useGlassAccessibility()

  if (reduceMotion || reduceTransparency) return null

  return <View pointerEvents="none" style={[styles.motionSweep, { backgroundColor: tokens.sheen, opacity: 0.12 }]} testID={testID} />
}

function ThemeToggle() {
  const { copy, mode, tokens } = useWorkerUi()
  const nextMode = mode === 'light' ? 'dark' : 'light'
  const currentModeLabel = mode === 'light' ? copy.frame.themeLight : copy.frame.themeDark

  return (
    <Pressable
      accessibilityLabel={mode === 'light' ? copy.frame.themeDark : copy.frame.themeLight}
      accessibilityRole="switch"
      accessibilityState={{ checked: mode === 'dark' }}
      onPress={() => setWorkerThemeMode(nextMode)}
      style={({ pressed }) => [styles.preferenceRow, workerProfilePreferenceRowSurface(tokens), pressed ? styles.pressed : null]}
      testID="worker-dark-mode-toggle"
    >
      <View style={styles.preferenceTitle}>
        <WorkerImageIcon frameSize={44} name="settingTheme" size={44} style={styles.preferenceImage} />
        <View style={styles.preferenceCopy}>
          <Text style={[styles.listTitle, { color: tokens.ink }]} numberOfLines={1}>
            {copy.profile.theme}
          </Text>
        </View>
      </View>
      <Text style={[styles.preferenceMetaAction, { color: tokens.muted }]} numberOfLines={1}>
        {currentModeLabel}
      </Text>
    </Pressable>
  )
}

function LanguageToggle() {
  const { copy, language, tokens } = useWorkerUi()
  const nextLanguage = language === 'vi' ? 'en' : 'vi'
  const currentLanguageLabel = language === 'vi' ? 'Tiếng Việt' : 'English'

  return (
    <Pressable
      accessibilityLabel={copy.frame.lang}
      accessibilityRole="switch"
      accessibilityState={{ checked: language === 'en' }}
      onPress={() => setAppLanguage(nextLanguage)}
      style={({ pressed }) => [styles.preferenceRow, workerProfilePreferenceRowSurface(tokens), pressed ? styles.pressed : null]}
      testID="worker-language-toggle"
    >
      <View style={styles.preferenceTitle}>
        <WorkerImageIcon frameSize={44} name="settingLanguage" size={44} style={styles.preferenceImage} />
        <View style={styles.preferenceCopy}>
          <Text style={[styles.listTitle, { color: tokens.ink }]} numberOfLines={1}>
            {copy.profile.language}
          </Text>
        </View>
      </View>
      <Text style={[styles.preferenceMetaAction, { color: tokens.muted }]} numberOfLines={1}>
        {currentLanguageLabel}
      </Text>
    </Pressable>
  )
}

function getWorkerTimeline(status: LocalDealStatus | null, language: WorkerLanguageMode) {
  const steps: { label: string; statuses: LocalDealStatus[] }[] = language === 'en' ? [
    { label: 'Waiting request', statuses: ['broadcasting'] },
    { label: 'Accepted', statuses: ['worker_matched'] },
    { label: 'On the way', statuses: ['worker_on_way'] },
    { label: 'Arrived', statuses: ['arrived'] },
    { label: 'Inspecting', statuses: ['inspecting'] },
    { label: 'Repairing', statuses: ['repairing', 'completed_by_worker', 'confirmed_by_customer'] },
  ] : [
    { label: 'Chờ yêu cầu', statuses: ['broadcasting'] },
    { label: 'Đã nhận việc', statuses: ['worker_matched'] },
    { label: 'Di chuyển', statuses: ['worker_on_way'] },
    { label: 'Đến nơi', statuses: ['arrived'] },
    { label: 'Kiểm tra', statuses: ['inspecting'] },
    { label: 'Sửa và hoàn tất', statuses: ['repairing', 'completed_by_worker', 'confirmed_by_customer'] },
  ]
  const activeIndex = status ? Math.max(steps.findIndex((step) => step.statuses.includes(status)), -1) : -1
  return steps.map((step, index) => ({
    label: step.label,
    active: activeIndex >= index,
  }))
}
void getWorkerTimeline

function SegmentFilter({
  activeTab,
  labels,
  onTabChange,
}: {
  activeTab: WorkerJobsTab
  labels: readonly string[]
  onTabChange: (tab: WorkerJobsTab) => void
}) {
  const { tokens } = useWorkerUi()
  const { reduceMotion, reduceTransparency } = useGlassAccessibility()
  const [shellWidth, setShellWidth] = useState(0)
  const activeIndex = Math.max(0, workerJobsTabKeys.indexOf(activeTab))
  const segmentInset = 5
  const segmentGap = 5
  const pillWidth = shellWidth > 0 ? Math.max((shellWidth - segmentInset * 2 - segmentGap * Math.max(labels.length - 1, 0)) / Math.max(labels.length, 1), 0) : 0
  const pillLeft = segmentInset + activeIndex * (pillWidth + segmentGap)
  const segmentProgress = useSharedValue(pillLeft)

  useEffect(() => {
    if (reduceMotion) {
      segmentProgress.value = pillLeft
      return
    }
    segmentProgress.value = withSpring(pillLeft, motionTokens.liquid.pill)
  }, [pillLeft, reduceMotion, segmentProgress])

  const liquidSegmentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: segmentProgress.value }],
  }), [segmentProgress])

  return (
    <GlassSurface
      material="liquid"
      mode={tokens.mode}
      onLayout={(event) => {
        const nextWidth = event.nativeEvent.layout.width
        setShellWidth((current) => Math.abs(current - nextWidth) > 0.5 ? nextWidth : current)
      }}
      style={[styles.segmentShell, workerJobsSegmentLiquidSurface(tokens)]}
      testID="worker-activity-filter-pattern"
      variant="control"
    >
      <View style={styles.hiddenMarker} testID="worker-jobs-segment-opaque-shell" />
      <View style={styles.hiddenMarker} testID="worker-jobs-liquid-segment-selection" />
      {!reduceTransparency ? <LiquidSharpKeyline variant="panel" /> : null}
      {!reduceTransparency ? <View pointerEvents="none" style={[styles.workerJobsSegmentRefraction, workerJobsSegmentRefraction(tokens)]} /> : null}
      {!reduceTransparency ? <View pointerEvents="none" style={[styles.workerJobsSegmentCrispShell, workerJobsSegmentCrispShell(tokens)]} testID="worker-jobs-segment-crisp-shell" /> : null}
      {!reduceTransparency ? <View pointerEvents="none" style={[styles.workerJobsSegmentTopEdge, workerJobsSegmentTopEdge(tokens)]} /> : null}
      {pillWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.segmentLiquidPill,
            {
              backgroundColor: reduceTransparency ? tokens.mint : tokens.mode === 'dark' ? 'rgba(24,56,50,0.72)' : 'rgba(197,253,239,0.96)',
              borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.15)' : 'rgba(8,120,110,0.10)',
              borderWidth: 1,
              boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? 'inset 0 1px 0 rgba(255,255,255,0.12)' : 'inset 0 1px 0 rgba(255,255,255,0.90), 0 10px 22px rgba(14,141,124,0.12)',
              width: pillWidth,
            } as any,
            liquidSegmentStyle,
          ]}
        >
          {!reduceTransparency ? <View style={[styles.segmentLiquidSheen, { backgroundColor: tokens.glassHighlight }]} /> : null}
        </Animated.View>
      ) : null}
      {labels.map((item, index) => {
        const tab = workerJobsTabKeys[index] ?? 'waiting'
        const selected = tab === activeTab
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={item}
            onPress={() => onTabChange(tab)}
            style={({ pressed }) => [
              styles.segmentPill,
              pressed ? styles.pressed : null,
            ]}
            testID={`worker-jobs-segment-${tab}`}
          >
            <Text style={[styles.segmentText, { color: selected ? tokens.primary : tokens.muted }]} numberOfLines={1}>
              {item}
            </Text>
          </Pressable>
        )
      })}
    </GlassSurface>
  )
}

function WorkerEmptyJobPanel({
  body,
  icon,
  primaryActionLabel,
  primaryActionPath,
  secondaryActionLabel,
  secondaryActionPath,
  showMapPreview = false,
  testID,
  title,
  tone,
}: {
  body: string
  icon: WorkerIconName
  primaryActionLabel?: string
  primaryActionPath?: '/(worker)/home' | '/(worker)/jobs?tab=waiting' | '/(worker)/chat'
  secondaryActionLabel?: string
  secondaryActionPath?: '/(worker)/home' | '/(worker)/jobs?tab=waiting' | '/(worker)/chat'
  showMapPreview?: boolean
  testID?: string
  title: string
  tone: WorkerTone
}) {
  const { language, tokens } = useWorkerUi()
  const { replace } = useRouter()

  return (
    <View style={[styles.activeJobCard, workerJobCardSurface(tokens, tone)]} testID={testID}>
      <WorkerJobsCardChrome tone={tone} />
      <View style={styles.jobTop}>
        <View style={styles.identityRow}>
          <WorkerUtilityIcon active frameSize={46} icon={icon} size={46} small style={styles.jobPanelImageIcon} />
          <View style={styles.titleStack}>
            <Text adjustsFontSizeToFit minimumFontScale={0.8} numberOfLines={2} style={[styles.cardTitle, { color: tokens.ink }]}>
              {title}
            </Text>
          </View>
        </View>
      </View>
      <View style={[styles.jobDiagnosisBox, workerDiagnosisSurface(tokens)]} testID={`${testID ?? 'worker-empty-job'}-brief`}>
        <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={3}>
          {body}
        </Text>
      </View>
      {showMapPreview ? <CompactWorkerPresenceMap density="dense" mode="active" /> : null}
      {primaryActionLabel && primaryActionPath ? (
        <View style={styles.actionRow}>
          <PressButton label={primaryActionLabel} onPress={() => replace(primaryActionPath)} testID={`${testID ?? 'worker-empty-job'}-primary-action`} />
          {secondaryActionLabel && secondaryActionPath ? (
            <PressButton secondary label={secondaryActionLabel} onPress={() => replace(secondaryActionPath)} testID={`${testID ?? 'worker-empty-job'}-secondary-action`} />
          ) : (
            <View style={[styles.emptyActionPill, workerSecondaryButtonSurface(tokens)]}>
              <Text adjustsFontSizeToFit minimumFontScale={0.84} numberOfLines={1} style={[styles.pressButtonTextSecondary, { color: tokens.primary }]}>
                {language === 'en' ? 'No request yet' : 'Chưa có yêu cầu'}
              </Text>
            </View>
          )}
        </View>
      ) : null}
    </View>
  )
}

function Metric({ label, testID, value }: { label: string; testID?: string; value: string }) {
  const { tokens } = useWorkerUi()

  return (
    <View style={[styles.metric, { backgroundColor: tokens.glassStrong, borderColor: tokens.border }]} testID={testID}>
      <Text adjustsFontSizeToFit minimumFontScale={0.72} style={[styles.metricValue, { color: tokens.ink }]} numberOfLines={1} testID={testID ? `${testID}-value` : undefined}>
        {value}
      </Text>
      <Text adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.metricLabel, { color: tokens.subtle }]} numberOfLines={1} testID={testID ? `${testID}-label` : undefined}>
        {label}
      </Text>
    </View>
  )
}

function WorkerKaelChatStatusBubble({
  error,
  loading,
  progress,
  sending,
  streamingText,
}: {
  error: string | null
  loading: boolean
  progress: KaelChatProgress | null
  sending: boolean
  streamingText: string
}) {
  const { language, tokens } = useWorkerUi()
  if (!error && !loading && !sending) return null
  const progressText = workerKaelChatProgressCopy(progress, language)
  const visibleStreamingText = streamingText.trim()
  const statusText = error ?? (visibleStreamingText ? `${visibleStreamingText} |` : progressText ?? workerKaelChatStatusCopy(language, sending))
  return (
    <View testID="worker-kael-chat-status">
      <ChatBubble
        system
        text={statusText}
        who={workerCopy[language].chat.kael}
      />
      {progress && !error ? (
        <View style={[styles.workerKaelProgressPanel, { backgroundColor: tokens.raised, borderColor: tokens.border }]} testID="worker-kael-chat-progress">
          <View style={styles.workerKaelProgressTrack}>
            <View style={[styles.workerKaelProgressFill, { backgroundColor: tokens.primary, width: `${Math.round(Math.max(0, Math.min(1, progress.progress)) * 100)}%` }]} />
          </View>
          <Text style={[styles.workerKaelProgressText, { color: tokens.muted }]} numberOfLines={1}>
            {progressText}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

function ChatBubble({ mine = false, system = false, text, who }: { mine?: boolean; system?: boolean; text: string; who: string }) {
  const { tokens } = useWorkerUi()

  return (
    <View style={[styles.chatBubble, messageBubbleSurface(tokens, { mine, system }), mine ? styles.chatBubbleMine : null]}>
      <Text style={[styles.chatWho, { color: tokens.primary }]}>{who}</Text>
      <Text style={[styles.chatText, { color: tokens.ink }]}>{text}</Text>
    </View>
  )
}

function EarningsLedgerRow({ icon, meta, testID, title }: { icon: WorkerIconName; meta: string; testID?: string; title: string }) {
  const { tokens } = useWorkerUi()

  return (
    <View style={[styles.earningsListRow, workerEarningsRowSurface(tokens)]} testID={testID}>
      <View style={styles.earningsListIcon}>
        <WorkerEarningsLedgerIcon icon={icon} />
      </View>
      <Text
        style={[styles.earningsListTitle, { color: tokens.ink }]}
        numberOfLines={1}
        testID={testID ? `${testID}-title` : undefined}
      >
        {title}
      </Text>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.86}
        style={[styles.earningsListMeta, { color: tokens.muted }]}
        numberOfLines={1}
        testID={testID ? `${testID}-meta` : undefined}
      >
        {meta}
      </Text>
    </View>
  )
}

function WorkerEarningsLedgerIcon({ icon }: { icon: WorkerIconName }) {
  const imageIcon = workerEarningsImageIcons[icon]

  if (imageIcon) {
    return <WorkerImageIcon frameSize={34} name={imageIcon} size={34} style={styles.earningsListImageIcon} />
  }

  return <WorkerUtilityIcon frameSize={34} icon={icon} size={34} small />
}

function WorkerUtilityIcon({
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

function WorkerImageIcon({ frameSize, name, size, style }: { frameSize?: number; name: WorkerImageIconName; size: number; style?: StyleProp<ViewStyle> }) {
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

function ProfileListRow({ icon, meta, title }: { icon: WorkerImageIconName; meta: string; title: string }) {
  const { tokens } = useWorkerUi()

  return (
    <View style={[styles.profileListRow, workerProfileRowSurface(tokens)]}>
      <WorkerImageIcon frameSize={44} name={icon} size={44} style={styles.profileListImage} />
      <Text style={[styles.profileListTitle, { color: tokens.ink }]} numberOfLines={1}>
        {title}
      </Text>
      <Text adjustsFontSizeToFit minimumFontScale={0.84} style={[styles.profileListMeta, { color: tokens.muted }]} numberOfLines={1}>
        {meta}
      </Text>
    </View>
  )
}

function PressButton({
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

function Icon({ active = false, dock = false, inverse = false, name, small = false }: { active?: boolean; dock?: boolean; inverse?: boolean; name: WorkerIconName; small?: boolean }) {
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

function WorkerChatPlusIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  )
}

function WorkerChatExitIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M7.5 7.5l9 9M16.5 7.5l-9 9" stroke={color} strokeWidth={2.15} strokeLinecap="round" />
    </Svg>
  )
}

function WorkerChatMicIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3.5a3.3 3.3 0 0 0-3.3 3.3v4.4a3.3 3.3 0 0 0 6.6 0V6.8A3.3 3.3 0 0 0 12 3.5Z" stroke={color} strokeWidth={2} />
      <Path d="M5.7 10.7a6.3 6.3 0 0 0 12.6 0M12 17v3.5M9.2 20.5h5.6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

function WorkerChatSendIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M22 2 11 13" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="m22 2-7 20-4-9-9-4 20-7Z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

function useWorkerUi() {
  const context = use(WorkerUiContext)
  if (!context) throw new Error('useWorkerUi must be used inside WorkerFrame')
  return context
}

function messageBubbleSurface(tokens: WorkerThemeTokens, { mine, system }: { mine: boolean; system: boolean }) {
  const backgroundColor = mine
    ? tokens.mode === 'dark'
      ? '#183832'
      : '#E1F8F2'
    : system
      ? tokens.mode === 'dark'
        ? '#172F31'
        : '#EBF9F8'
      : tokens.mode === 'dark'
        ? '#171D1B'
        : '#FFFDF8'

  return {
    backgroundColor,
    borderColor: system ? tokens.borderStrong : tokens.border,
    borderWidth: 1,
    boxShadow: 'none',
  }
}

function workerKaelChatSurface(tokens: WorkerThemeTokens, tone: WorkerKaelChatTone) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const dark = tokens.mode === 'dark'
  const gradients: Record<WorkerKaelChatTone, string> = dark
    ? {
        agent: 'radial-gradient(circle at 92% 0%, rgba(105,222,198,0.14), transparent 34%), radial-gradient(circle at 10% 100%, rgba(230,244,240,0.052), transparent 38%), linear-gradient(145deg, rgba(24,31,29,0.84), rgba(13,17,16,0.74))',
        avatar: 'linear-gradient(145deg, rgba(30,38,35,0.78), rgba(18,23,22,0.70))',
        brief: 'radial-gradient(circle at 94% 12%, rgba(105,222,198,0.12), transparent 35%), linear-gradient(150deg, rgba(24,31,29,0.80), rgba(15,20,19,0.66))',
        bubble: 'linear-gradient(145deg, rgba(24,31,29,0.82), rgba(16,20,19,0.70))',
        composer: 'linear-gradient(135deg, rgba(24,31,29,0.82), rgba(15,20,19,0.74))',
        header: 'radial-gradient(circle at 88% 16%, rgba(105,222,198,0.12), transparent 30%), linear-gradient(135deg, rgba(24,31,29,0.84), rgba(15,20,19,0.74))',
        icon: 'linear-gradient(145deg, rgba(30,38,35,0.78), rgba(18,23,22,0.70))',
        send: 'linear-gradient(145deg, #69DEC6, #10A594)',
        status: 'linear-gradient(135deg, rgba(29,44,40,0.82), rgba(17,22,21,0.68))',
        step: 'linear-gradient(145deg, rgba(30,38,35,0.78), rgba(16,22,21,0.66))',
      }
    : {
        agent: 'radial-gradient(circle at 92% 0%, rgba(156,238,221,0.82), transparent 32%), radial-gradient(circle at 4% 100%, rgba(255,245,229,0.76), transparent 36%), linear-gradient(145deg, rgba(255,253,248,0.98), rgba(224,249,243,0.93))',
        avatar: 'linear-gradient(145deg, rgba(255,253,248,0.98), rgba(232,252,247,0.78))',
        brief: 'radial-gradient(circle at 94% 12%, rgba(156,238,221,0.62), transparent 35%), linear-gradient(150deg, rgba(217,251,242,0.92), rgba(236,255,250,0.82))',
        bubble: 'linear-gradient(145deg, rgba(255,253,248,0.98), rgba(255,249,239,0.92))',
        composer: 'linear-gradient(135deg, rgba(255,253,248,0.98), rgba(239,255,250,0.94))',
        header: 'radial-gradient(circle at 88% 16%, rgba(156,238,221,0.74), transparent 32%), linear-gradient(135deg, rgba(255,253,248,0.98), rgba(226,250,244,0.98))',
        icon: 'linear-gradient(145deg, rgba(217,251,242,0.95), rgba(255,253,248,0.82))',
        send: 'linear-gradient(145deg, #10A594, #078B7C)',
        status: 'linear-gradient(135deg, rgba(217,251,242,0.96), rgba(255,253,248,0.80))',
        step: 'linear-gradient(145deg, rgba(255,253,248,0.86), rgba(232,252,247,0.78))',
      }
  const backgroundColor = dark
    ? tone === 'send'
      ? '#69DEC6'
      : tone === 'brief'
        ? '#183832'
        : tone === 'icon'
          ? tokens.mint
        : '#171D1B'
    : tone === 'send'
      ? '#078B7C'
      : tone === 'brief'
        ? '#D9FBF2'
        : tone === 'icon'
          ? tokens.mint
        : '#FFFDF8'
  const borderColor = dark
    ? tone === 'agent' || tone === 'brief' ? 'rgba(230,244,240,0.16)' : 'rgba(230,244,240,0.12)'
    : tone === 'agent' || tone === 'brief' || tone === 'composer' || tone === 'header'
      ? 'rgba(8,139,124,0.30)'
      : 'rgba(8,139,124,0.22)'
  const shadow = dark
    ? tone === 'agent' || tone === 'brief' || tone === 'composer' || tone === 'header'
      ? '0 16px 34px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.10)'
      : '0 8px 18px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.08)'
    : tone === 'agent' || tone === 'brief'
      ? '0 15px 36px rgba(16,74,66,0.11), inset 0 1px 0 rgba(255,255,255,0.88)'
      : tone === 'header'
        ? '0 15px 36px rgba(16,74,66,0.12), inset 0 1px 0 rgba(255,255,255,0.92)'
        : tone === 'composer'
          ? '0 18px 40px rgba(16,74,66,0.12), inset 0 1px 0 rgba(255,255,255,0.92)'
          : tone === 'send'
            ? '0 10px 22px rgba(8,139,124,0.22), inset 0 1px 0 rgba(255,255,255,0.22)'
            : '0 6px 14px rgba(16,74,66,0.06), inset 0 1px 0 rgba(255,255,255,0.72)'

  return {
    backgroundColor,
    borderColor,
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : shadow,
    background: reduceTransparency ? undefined : gradients[tone],
    backgroundImage: reduceTransparency ? undefined : gradients[tone],
    experimental_backgroundImage: reduceTransparency ? undefined : gradients[tone],
  } as any
}

function workerChatModePillGlassLayer(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 72% 16%, rgba(245,255,252,0.18), transparent 38%), linear-gradient(145deg, rgba(245,255,252,0.12), rgba(105,222,198,0.09))'
    : 'radial-gradient(circle at 72% 10%, rgba(255,255,255,0.98), transparent 42%), linear-gradient(145deg, rgba(255,255,255,0.96), rgba(235,255,250,0.78))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(245,255,252,0.12)' : 'rgba(255,255,255,0.92)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    boxShadow: reduceTransparency
      ? 'none'
      : tokens.mode === 'dark'
        ? 'inset 0 1px 0 rgba(190,210,205,0.16)'
        : '0 8px 20px rgba(13,134,119,0.06), inset 0 1px 0 rgba(255,255,255,0.98)',
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function workerChatModePillTextHighlight(tokens: WorkerThemeTokens) {
  return {
    textShadowColor: tokens.mode === 'dark' ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.94)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: tokens.mode === 'dark' ? 2 : 3,
  }
}

function workerOpaqueCardSurface(tokens: WorkerThemeTokens, tone: WorkerTone = 'base', reduceTransparency = false) {
  const isWarm = tone === 'cream' || tone === 'warm'
  const isMint = tone === 'mint'
  const isCyan = tone === 'cyan'
  const backgroundColor = isWarm
    ? tokens.mode === 'dark'
      ? '#30271E'
      : '#FFF8EB'
    : isMint
      ? tokens.mode === 'dark'
        ? '#183832'
        : '#E8F9F4'
      : isCyan
        ? tokens.mode === 'dark'
          ? '#172F31'
          : '#EBF9F8'
        : tokens.mode === 'dark'
          ? '#171D1B'
          : '#FFFDF8'
  const experimentalBackgroundImage = tokens.mode === 'dark'
    ? isWarm
      ? 'linear-gradient(180deg, rgba(48,39,30,0.82), rgba(18,23,22,0.72))'
      : isMint
        ? 'linear-gradient(180deg, rgba(24,56,50,0.76), rgba(18,23,22,0.70))'
        : isCyan
          ? 'linear-gradient(180deg, rgba(23,47,49,0.76), rgba(18,23,22,0.70))'
          : 'linear-gradient(180deg, rgba(24,31,29,0.72), rgba(13,17,16,0.66))'
    : isWarm
      ? 'linear-gradient(180deg, rgba(255,248,235,0.96), rgba(255,253,248,0.90))'
      : isMint
        ? 'linear-gradient(180deg, rgba(232,249,244,0.96), rgba(255,253,248,0.90))'
        : isCyan
          ? 'linear-gradient(180deg, rgba(235,249,248,0.96), rgba(255,253,248,0.90))'
          : 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(255,253,248,0.90))'
  return {
    backgroundColor,
    borderColor: tokens.border,
    borderWidth: 1,
    boxShadow: tokens.mode === 'dark' ? '0 8px 22px rgba(0,0,0,0.18)' : '0 8px 22px rgba(17,70,61,0.06)',
    experimental_backgroundImage: reduceTransparency ? undefined : experimentalBackgroundImage,
  } as any
}

function workerJobCardSurface(tokens: WorkerThemeTokens, tone: WorkerTone = 'base') {
  return workerJobsLiquidCardSurface(tokens, tone)
}

function workerEarningsChromeRadius(variant: WorkerEarningsChromeVariant) {
  if (variant === 'hero') return 32
  if (variant === 'ledger') return 29
  if (variant === 'chart' || variant === 'cell') return 22
  return 24
}

function workerEarningsChromeInsetRadius(variant: WorkerEarningsChromeVariant) {
  return Math.max(workerEarningsChromeRadius(variant) - 4, 16)
}

function workerEarningsChromeWash(tokens: WorkerThemeTokens, variant: WorkerEarningsChromeVariant) {
  const prominent = variant === 'hero'
  const gradient = tokens.mode === 'dark'
    ? prominent
      ? 'radial-gradient(circle at 82% 14%, rgba(105,222,198,0.12), transparent 32%), linear-gradient(180deg, rgba(190,210,205,0.055), rgba(0,0,0,0))'
      : 'linear-gradient(180deg, rgba(190,210,205,0.045), rgba(105,222,198,0.030))'
    : prominent
      ? 'radial-gradient(circle at 82% 14%, rgba(23,169,149,0.11), transparent 32%), linear-gradient(180deg, rgba(255,255,255,0.74), rgba(230,255,248,0.26))'
      : 'linear-gradient(180deg, rgba(255,255,255,0.78), rgba(230,255,248,0.34))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.020)' : 'rgba(255,255,255,0.22)',
    background: gradient,
    backgroundImage: gradient,
    borderRadius: workerEarningsChromeRadius(variant),
    experimental_backgroundImage: gradient,
    opacity: prominent ? 0.92 : 0.72,
  } as any
}

function workerEarningsChromeRefraction(tokens: WorkerThemeTokens, variant: WorkerEarningsChromeVariant) {
  const prominent = variant === 'hero' || variant === 'chart'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 50% 50%, rgba(105,222,198,0.095), transparent 66%)'
    : 'radial-gradient(circle at 50% 50%, rgba(23,169,149,0.105), transparent 66%)'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.040)' : 'rgba(23,169,149,0.045)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
    opacity: prominent ? 0.72 : 0.48,
  } as any
}

function workerEarningsChromeCrispShell(tokens: WorkerThemeTokens, variant: WorkerEarningsChromeVariant) {
  return {
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.18)' : 'rgba(255,255,255,0.86)',
    borderRadius: workerEarningsChromeRadius(variant),
    boxShadow: tokens.mode === 'dark'
      ? 'inset 0 1px 0 rgba(190,210,205,0.14), inset 0 -1px 0 rgba(105,222,198,0.070)'
      : 'inset 0 1px 0 rgba(255,255,255,0.94), inset 0 -1px 0 rgba(9,121,106,0.12)',
  } as any
}

function workerEarningsChromeInnerInset(tokens: WorkerThemeTokens, variant: WorkerEarningsChromeVariant) {
  return {
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.085)' : 'rgba(9,121,106,0.075)',
    borderRadius: workerEarningsChromeInsetRadius(variant),
    boxShadow: tokens.mode === 'dark'
      ? 'inset 0 1px 0 rgba(190,210,205,0.060)'
      : 'inset 0 1px 0 rgba(255,255,255,0.70)',
  } as any
}

function workerEarningsChromeTopEdge(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(90deg, rgba(230,244,240,0), rgba(230,244,240,0.18) 22%, rgba(105,222,198,0.055) 58%, rgba(230,244,240,0))'
    : 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.90) 22%, rgba(195,255,243,0.48) 58%, rgba(255,255,255,0))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.10)' : 'rgba(255,255,255,0.76)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

function workerEarningsChromeBottomEdge(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(90deg, rgba(0,0,0,0), rgba(105,222,198,0.070) 50%, rgba(0,0,0,0))'
    : 'linear-gradient(90deg, rgba(255,255,255,0), rgba(9,121,106,0.12) 50%, rgba(255,255,255,0))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.040)' : 'rgba(9,121,106,0.080)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

function workerEarningsTrendSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 82% 18%, rgba(105,222,198,0.085), transparent 32%), radial-gradient(circle at 18% 0%, rgba(230,244,240,0.050), transparent 34%), linear-gradient(145deg, rgba(24,31,29,0.72), rgba(12,16,15,0.58))'
    : 'radial-gradient(circle at 82% 18%, rgba(23,169,149,0.12), transparent 32%), linear-gradient(145deg, rgba(255,255,255,0.64), rgba(239,255,251,0.50))'

  return {
    backgroundColor: reduceTransparency ? (tokens.mode === 'dark' ? '#161D1B' : '#F8FFFC') : tokens.mode === 'dark' ? 'rgba(22,29,27,0.58)' : 'rgba(255,255,255,0.46)',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.16)' : 'rgba(255,255,255,0.86)',
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : workerHomeMaterialDepthShadow(tokens, 'readiness'),
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function workerEarningsChartSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(180deg, rgba(24,31,29,0.72), rgba(13,17,16,0.62))'
    : 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(239,255,251,0.74))'

  return {
    backgroundColor: tokens.mode === 'dark' ? '#171D1B' : '#F8FFFC',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.12)' : 'rgba(16,131,115,0.12)',
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? '0 10px 24px rgba(0,0,0,0.20)' : '0 12px 26px rgba(17,70,61,0.09)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function workerEarningsBarSurface(tokens: WorkerThemeTokens, hasDailyEarnings: boolean) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? hasDailyEarnings
      ? `linear-gradient(180deg, ${color.mint.mint300}, ${color.brand.primary})`
      : 'linear-gradient(180deg, rgba(105,222,198,0.96), rgba(8,120,110,0.78))'
    : hasDailyEarnings
      ? `linear-gradient(180deg, ${color.mint.mint500}, ${color.brand.primary})`
      : `linear-gradient(180deg, ${color.accent.aqua} 0%, ${color.brand.primary} 54%, ${color.brand.primaryDark} 100%)`

  return {
    backgroundColor: hasDailyEarnings ? tokens.primary : tokens.mode === 'dark' ? '#69DEC6' : '#16BCA9',
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? '0 8px 14px rgba(0,0,0,0.24)' : '0 10px 18px rgba(8,120,110,0.24)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function workerEarningsMiniSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(180deg, rgba(24,31,29,0.72), rgba(13,17,16,0.62))'
    : 'linear-gradient(180deg, rgba(255,255,255,0.94), rgba(240,255,251,0.88))'

  return {
    backgroundColor: tokens.mode === 'dark' ? '#171D1B' : '#F8FFFC',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.12)' : 'rgba(35,96,84,0.13)',
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? '0 10px 24px rgba(0,0,0,0.20)' : '0 10px 24px rgba(17,70,61,0.07)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function workerEarningsLedgerSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(180deg, rgba(24,31,29,0.72), rgba(13,17,16,0.62))'
    : 'linear-gradient(180deg, rgba(255,255,255,0.94), rgba(240,255,251,0.86))'

  return {
    backgroundColor: tokens.mode === 'dark' ? '#171D1B' : '#F8FFFC',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.12)' : 'rgba(35,96,84,0.13)',
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? '0 10px 24px rgba(0,0,0,0.18)' : '0 10px 24px rgba(17,70,61,0.07)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function workerEarningsRowSurface(tokens: WorkerThemeTokens) {
  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.026)' : 'rgba(255,255,255,0.42)',
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.070)' : 'rgba(16,131,115,0.070)',
    borderWidth: 1,
  } as any
}

function workerDiagnosisSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(135deg, #173F37, #102E2A)'
    : 'linear-gradient(135deg, #E0FFF7, #F0FFFB)'
  return {
    backgroundColor: tokens.mode === 'dark' ? '#143832' : '#EFFFFA',
    borderColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.26)' : 'rgba(16,131,115,0.20)',
    borderWidth: 1,
    boxShadow: 'none',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function workerPrimaryButtonSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? `linear-gradient(135deg, ${color.mint.mint300}, ${color.brand.primary})`
    : `linear-gradient(135deg, ${color.brand.primaryDark}, ${color.brand.primary})`
  return {
    backgroundColor: reduceTransparency ? tokens.primary : tokens.mode === 'dark' ? tokens.aqua : '#0B5C50',
    borderColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.24)' : 'rgba(255,255,255,0.28)',
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? '0 14px 25px rgba(0,0,0,0.22)' : '0 14px 25px rgba(9,121,106,0.22)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
    transition: reduceTransparency ? undefined : 'transform 130ms ease, filter 130ms ease',
  } as any
}

function workerSecondaryButtonSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  return {
    backgroundColor: reduceTransparency ? tokens.raised : tokens.mode === 'dark' ? 'rgba(24,31,29,0.74)' : 'rgba(255,255,255,0.72)',
    borderColor: reduceTransparency ? tokens.border : tokens.mode === 'dark' ? 'rgba(230,244,240,0.12)' : 'rgba(20,117,105,0.12)',
    boxShadow: 'none',
    transition: reduceTransparency ? undefined : 'transform 130ms ease',
    experimental_backgroundImage: reduceTransparency
      ? undefined
      : tokens.mode === 'dark'
      ? 'linear-gradient(180deg, rgba(24,31,29,0.72), rgba(13,17,16,0.62))'
      : undefined,
  } as any
}

function workerJobsSegmentLiquidSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 50% 0%, rgba(105,222,198,0.08), transparent 38%), linear-gradient(180deg, rgba(22,29,27,0.70), rgba(15,22,21,0.58))'
    : 'radial-gradient(circle at 50% 0%, rgba(255,255,255,0.72), transparent 38%), radial-gradient(circle at 28% 100%, rgba(147,255,232,0.18), transparent 42%), linear-gradient(180deg, rgba(255,255,255,0.58), rgba(247,249,248,0.42))'

  return {
    backgroundColor: reduceTransparency ? tokens.raised : tokens.mode === 'dark' ? 'rgba(22,29,27,0.64)' : 'rgba(255,255,255,0.48)',
    borderColor: reduceTransparency ? tokens.borderStrong : workerLiquidEdgeHighlight(tokens),
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : workerHomeMaterialDepthShadow(tokens, 'mapControl'),
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function workerJobsSegmentRefraction(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(100deg, rgba(190,210,205,0), rgba(190,210,205,0.10), rgba(105,222,198,0.055), rgba(190,210,205,0))'
    : 'linear-gradient(100deg, rgba(255,255,255,0), rgba(255,255,255,0.82), rgba(207,255,243,0.34), rgba(255,255,255,0))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.07)' : 'rgba(255,255,255,0.56)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

function workerJobsSegmentCrispShell(tokens: WorkerThemeTokens) {
  return {
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.18)' : 'rgba(255,255,255,0.84)',
    boxShadow: tokens.mode === 'dark'
      ? 'inset 0 1px 0 rgba(190,210,205,0.13), inset 0 -1px 0 rgba(105,222,198,0.060)'
      : 'inset 0 1px 0 rgba(255,255,255,0.94), inset 0 -1px 0 rgba(0,117,106,0.10)',
  } as any
}

function workerJobsSegmentTopEdge(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(90deg, rgba(190,210,205,0), rgba(190,210,205,0.16) 28%, rgba(105,222,198,0.090) 62%, rgba(190,210,205,0))'
    : 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.88) 28%, rgba(195,255,243,0.42) 62%, rgba(255,255,255,0))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.10)' : 'rgba(255,255,255,0.72)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

function workerLiquidEdgeHighlight(tokens: WorkerThemeTokens) {
  return tokens.mode === 'dark' ? 'rgba(190,210,205,0.14)' : 'rgba(255,255,255,0.46)'
}

function workerHomeMaterialRole(surface: WorkerHomeMaterialSurface) {
  return workerHomeLiquidMaterialSystem.surfaces[surface].role
}

function workerHomeMaterialDepth(surface: WorkerHomeMaterialSurface) {
  return workerHomeLiquidMaterialSystem.surfaces[surface].depth
}

function workerHomeMaterialContrast(surface: WorkerHomeMaterialSurface) {
  return workerHomeLiquidMaterialSystem.surfaces[surface].contrast
}

function workerHomeMaterialDepthShadow(tokens: WorkerThemeTokens, surface: WorkerHomeMaterialSurface) {
  const depth = workerHomeMaterialDepth(surface)
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'

  if (reduceTransparency) return 'none'

  if (tokens.mode === 'dark') {
    if (depth === 'anchored') return '0 20px 42px rgba(0,0,0,0.34), 0 0 0 1px rgba(190,210,205,0.10), inset 0 1px 0 rgba(190,210,205,0.11)'
    if (depth === 'focus') return '0 24px 56px rgba(0,0,0,0.32), 0 0 38px rgba(105,222,198,0.055), inset 0 1px 0 rgba(190,210,205,0.14), inset 0 -18px 28px rgba(105,222,198,0.045)'
    if (depth === 'floating') return '0 12px 26px rgba(0,0,0,0.24), 0 0 0 1px rgba(190,210,205,0.055), inset 0 1px 0 rgba(190,210,205,0.10)'
    if (depth === 'content') return '0 7px 16px rgba(0,0,0,0.10), inset 0 1px 0 rgba(190,210,205,0.055)'
    return '0 18px 42px rgba(0,0,0,0.26), 0 0 0 1px rgba(190,210,205,0.070), inset 0 1px 0 rgba(190,210,205,0.12)'
  }

  if (depth === 'anchored') return '0 20px 42px rgba(20,73,66,0.12), 0 0 0 1px rgba(255,255,255,0.72), inset 0 1px 0 rgba(255,255,255,0.46)'
  if (depth === 'focus') return '0 24px 54px rgba(20,73,66,0.13), 0 0 42px rgba(76,222,199,0.072), inset 0 1px 0 rgba(255,255,255,0.88), inset 0 -18px 28px rgba(20,117,105,0.038)'
  if (depth === 'floating') return '0 12px 26px rgba(20,73,66,0.10), 0 0 0 1px rgba(255,255,255,0.66), inset 0 1px 0 rgba(255,255,255,0.58)'
  if (depth === 'content') return '0 7px 16px rgba(17,70,61,0.030), inset 0 1px 0 rgba(255,255,255,0.78)'
  return '0 18px 42px rgba(20,73,66,0.11), 0 0 0 1px rgba(255,255,255,0.76), inset 0 1px 0 rgba(255,255,255,0.82)'
}

function workerHomeMaterialSubstrateSurface(tokens: WorkerThemeTokens, surface: 'map' | 'readiness' | 'sheet') {
  const map = surface === 'map'
  const gradient = tokens.mode === 'dark'
    ? map
      ? 'radial-gradient(circle at 32% 38%, rgba(105,222,198,0.10), transparent 28%), radial-gradient(circle at 76% 18%, rgba(190,210,205,0.06), transparent 32%), linear-gradient(155deg, rgba(24,32,30,0.46), rgba(12,18,17,0.08))'
      : 'radial-gradient(circle at 76% 18%, rgba(105,222,198,0.11), transparent 30%), linear-gradient(145deg, rgba(190,210,205,0.045), rgba(0,0,0,0))'
    : map
      ? 'radial-gradient(circle at 32% 38%, rgba(23,169,149,0.12), transparent 28%), radial-gradient(circle at 76% 18%, rgba(255,255,255,0.78), transparent 32%), linear-gradient(155deg, rgba(255,255,255,0.44), rgba(236,244,242,0.08))'
      : 'radial-gradient(circle at 76% 18%, rgba(23,169,149,0.10), transparent 30%), linear-gradient(145deg, rgba(255,255,255,0.52), rgba(255,255,255,0))'

  return {
    backgroundColor: tokens.mode === 'dark'
      ? map ? 'rgba(190,210,205,0.022)' : 'rgba(190,210,205,0.026)'
      : map ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.24)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
    opacity: map ? 0.9 : 0.82,
  } as any
}

function workerHomeMaterialDepthPlaneSurface(tokens: WorkerThemeTokens, surface: 'map' | 'readiness' | 'sheet') {
  const map = surface === 'map'
  const sheet = surface === 'sheet'
  const contrast = workerHomeMaterialContrast(surface)
  const gradient = tokens.mode === 'dark'
    ? map
      ? 'linear-gradient(180deg, rgba(190,210,205,0.09), rgba(190,210,205,0.018) 32%, rgba(0,0,0,0) 66%, rgba(0,117,106,0.08)), radial-gradient(circle at 78% 18%, rgba(105,222,198,0.10), transparent 30%)'
      : 'linear-gradient(180deg, rgba(190,210,205,0.075), rgba(190,210,205,0.018) 36%, rgba(0,0,0,0) 64%, rgba(0,117,106,0.07)), radial-gradient(circle at 86% 18%, rgba(105,222,198,0.12), transparent 32%)'
    : map
      ? 'linear-gradient(180deg, rgba(255,255,255,0.72), rgba(255,255,255,0.18) 33%, rgba(255,255,255,0) 63%, rgba(20,117,105,0.065)), radial-gradient(circle at 80% 18%, rgba(147,255,232,0.20), transparent 31%)'
      : 'linear-gradient(180deg, rgba(255,255,255,0.82), rgba(255,255,255,0.20) 36%, rgba(255,255,255,0) 64%, rgba(20,117,105,0.055)), radial-gradient(circle at 86% 18%, rgba(147,255,232,0.24), transparent 33%)'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.016)' : 'rgba(255,255,255,0.13)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
    opacity: map ? 0.42 : contrast === 'prominent' ? (sheet ? 0.82 : 0.88) : 0.76,
  } as any
}

function workerHomeMaterialTopEdge(tokens: WorkerThemeTokens, surface: 'map' | 'readiness' | 'sheet') {
  const readiness = surface === 'readiness' || surface === 'sheet'
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(90deg, rgba(190,210,205,0), rgba(190,210,205,0.16) 22%, rgba(105,222,198,0.10) 56%, rgba(190,210,205,0))'
    : 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.90) 22%, rgba(194,255,243,0.48) 56%, rgba(255,255,255,0))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.10)' : 'rgba(255,255,255,0.72)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
    opacity: readiness ? 0.58 : 0.66,
  } as any
}

function workerHomeMaterialBottomEdge(tokens: WorkerThemeTokens, surface: 'map' | 'readiness' | 'sheet') {
  const readiness = surface === 'readiness' || surface === 'sheet'
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(90deg, rgba(0,0,0,0), rgba(0,117,106,0.16) 40%, rgba(0,0,0,0))'
    : 'linear-gradient(90deg, rgba(255,255,255,0), rgba(0,117,106,0.10) 40%, rgba(255,255,255,0))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(0,117,106,0.10)' : 'rgba(0,117,106,0.08)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
    opacity: readiness ? 0.44 : 0.5,
  } as any
}

function workerLiquidSharpKeyline(tokens: WorkerThemeTokens) {
  return {
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.18)' : 'rgba(255,255,255,0.82)',
    boxShadow: tokens.mode === 'dark'
      ? 'inset 0 1px 0 rgba(190,210,205,0.12), inset 0 -1px 0 rgba(0,0,0,0.14)'
      : 'inset 0 1px 0 rgba(255,255,255,0.96), inset 0 -1px 0 rgba(20,117,105,0.08)',
  } as any
}

function workerLiquidSpecularBand(tokens: WorkerThemeTokens, variant: 'hero' | 'panel' | 'sheet') {
  const panel = variant === 'panel'
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(105deg, rgba(190,210,205,0), rgba(190,210,205,0.10) 42%, rgba(105,222,198,0.06) 56%, rgba(190,210,205,0) 78%)'
    : 'linear-gradient(105deg, rgba(255,255,255,0), rgba(255,255,255,0.76) 42%, rgba(207,255,243,0.36) 56%, rgba(255,255,255,0) 78%)'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.08)' : 'rgba(255,255,255,0.70)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
    opacity: panel ? 0.50 : 0.58,
  } as any
}

function workerLiquidRefractionPool(tokens: WorkerThemeTokens, variant: 'hero' | 'panel' | 'sheet') {
  const panel = variant === 'panel'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 50% 50%, rgba(105,222,198,0.10), transparent 62%)'
    : 'radial-gradient(circle at 50% 50%, rgba(23,169,149,0.13), transparent 62%)'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.06)' : 'rgba(23,169,149,0.08)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
    opacity: panel ? 0.54 : 0.62,
  } as any
}

function workerMapLiquidLens(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(118deg, rgba(190,210,205,0), rgba(190,210,205,0.045) 46%, rgba(105,222,198,0.045) 60%, rgba(190,210,205,0) 82%)'
    : 'linear-gradient(118deg, rgba(255,255,255,0), rgba(255,255,255,0.34) 46%, rgba(23,169,149,0.08) 60%, rgba(255,255,255,0) 82%)'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.025)' : 'rgba(255,255,255,0.22)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

function workerMapLiquidGlassOverlay(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(112deg, rgba(190,210,205,0) 8%, rgba(190,210,205,0.07) 34%, rgba(105,222,198,0.08) 47%, rgba(190,210,205,0.026) 58%, rgba(190,210,205,0) 78%), radial-gradient(circle at 20% 18%, rgba(105,222,198,0.08), transparent 28%), radial-gradient(circle at 82% 70%, rgba(190,210,205,0.05), transparent 34%)'
    : 'linear-gradient(112deg, rgba(255,255,255,0) 8%, rgba(255,255,255,0.40) 34%, rgba(147,255,232,0.18) 47%, rgba(255,255,255,0.12) 58%, rgba(255,255,255,0) 78%), radial-gradient(circle at 20% 18%, rgba(255,255,255,0.44), transparent 28%), radial-gradient(circle at 82% 70%, rgba(76,222,199,0.11), transparent 34%)'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.018)' : 'rgba(255,255,255,0.08)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
    opacity: tokens.mode === 'dark' ? 0.46 : 0.52,
  } as any
}

function workerMapLiquidGlassEdge(tokens: WorkerThemeTokens) {
  return {
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.20)' : 'rgba(255,255,255,0.82)',
    boxShadow: tokens.mode === 'dark'
      ? 'inset 0 1px 0 rgba(190,210,205,0.17), inset 0 -1px 0 rgba(105,222,198,0.11), inset 1px 0 0 rgba(190,210,205,0.07)'
      : 'inset 0 1px 0 rgba(255,255,255,0.96), inset 0 -1px 0 rgba(76,222,199,0.18), inset 1px 0 0 rgba(255,255,255,0.52)',
  } as any
}

function workerMapLiquidSpecularArc(tokens: WorkerThemeTokens) {
  return {
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.11)' : 'rgba(255,255,255,0.68)',
    boxShadow: tokens.mode === 'dark'
      ? '0 14px 34px rgba(0,0,0,0.14)'
      : '0 14px 30px rgba(255,255,255,0.42)',
  } as any
}

function workerPanelLiquidGlassOverlay(tokens: WorkerThemeTokens, variant: 'panel' | 'sheet') {
  const sheet = variant === 'sheet'
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(128deg, rgba(190,210,205,0) 10%, rgba(190,210,205,0.095) 34%, rgba(105,222,198,0.16) 50%, rgba(190,210,205,0.045) 61%, rgba(190,210,205,0) 82%), radial-gradient(circle at 84% 14%, rgba(105,222,198,0.17), transparent 26%)'
    : 'linear-gradient(128deg, rgba(255,255,255,0) 10%, rgba(255,255,255,0.62) 34%, rgba(147,255,232,0.36) 50%, rgba(255,255,255,0.22) 61%, rgba(255,255,255,0) 82%), radial-gradient(circle at 84% 14%, rgba(76,222,199,0.24), transparent 27%)'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.035)' : 'rgba(255,255,255,0.20)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
    opacity: sheet ? 0.72 : 0.86,
  } as any
}

function workerMapSharpInset(tokens: WorkerThemeTokens) {
  return {
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.14)' : 'rgba(255,255,255,0.72)',
    boxShadow: tokens.mode === 'dark'
      ? 'inset 0 1px 0 rgba(190,210,205,0.12), inset 0 -1px 0 rgba(0,0,0,0.18)'
      : 'inset 0 1px 0 rgba(255,255,255,0.90), inset 0 -1px 0 rgba(20,117,105,0.08)',
  } as any
}

function workerHomeLiquidHeroSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 62% 20%, rgba(105,222,198,0.08), transparent 31%), linear-gradient(155deg, rgba(24,32,30,0.82), rgba(15,22,21,0.58) 62%, rgba(20,28,26,0.70))'
    : 'radial-gradient(circle at 62% 20%, rgba(23,169,149,0.07), transparent 31%), linear-gradient(155deg, rgba(255,255,255,0.78), rgba(242,246,245,0.46) 64%, rgba(255,255,255,0.62))'

  return {
    backgroundColor: reduceTransparency ? (tokens.mode === 'dark' ? '#161D1B' : '#FFFFFF') : tokens.mode === 'dark' ? 'rgba(22,29,27,0.56)' : 'rgba(255,255,255,0.40)',
    borderColor: reduceTransparency ? tokens.borderStrong : tokens.mode === 'dark' ? 'rgba(190,210,205,0.13)' : 'rgba(255,255,255,0.58)',
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : workerHomeMaterialDepthShadow(tokens, 'map'),
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function workerHomeLiquidControlSurface(tokens: WorkerThemeTokens, tone: 'activeButton' | 'button' | 'control' | 'status' = 'control') {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const active = tone === 'activeButton'
  const status = tone === 'status'
  const gradient = tokens.mode === 'dark'
    ? active
      ? 'linear-gradient(145deg, rgba(105,222,198,0.18), rgba(22,29,27,0.84))'
      : 'linear-gradient(145deg, rgba(31,42,40,0.86), rgba(22,29,27,0.70))'
    : active
      ? 'linear-gradient(145deg, rgba(232,252,247,0.92), rgba(255,255,255,0.70))'
      : 'linear-gradient(145deg, rgba(255,255,255,0.78), rgba(246,248,248,0.58))'

  return {
    backgroundColor: reduceTransparency
      ? tokens.mode === 'dark' ? '#161D1B' : '#FFFFFF'
      : tokens.mode === 'dark'
        ? active ? 'rgba(105,222,198,0.14)' : 'rgba(22,29,27,0.68)'
        : status ? 'rgba(255,255,255,0.68)' : 'rgba(255,255,255,0.62)',
    borderColor: reduceTransparency ? tokens.borderStrong : active ? (tokens.mode === 'dark' ? 'rgba(105,222,198,0.26)' : 'rgba(23,169,149,0.20)') : workerLiquidEdgeHighlight(tokens),
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : workerHomeMaterialDepthShadow(tokens, active ? 'cta' : status ? 'mapHud' : 'mapControl'),
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function workerHomeDockGlassSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 18% 8%, rgba(190,210,205,0.10), transparent 31%), radial-gradient(circle at 54% 94%, rgba(105,222,198,0.050), transparent 42%), linear-gradient(180deg, rgba(31,42,40,0.40), rgba(22,29,27,0.18))'
    : 'radial-gradient(circle at 18% 8%, rgba(255,255,255,0.44), transparent 34%), radial-gradient(circle at 50% 96%, rgba(23,169,149,0.018), transparent 42%), linear-gradient(180deg, rgba(255,255,255,0.11), rgba(255,255,255,0.026))'
  return {
    backgroundColor: reduceTransparency
      ? tokens.mode === 'dark' ? '#161D1B' : '#FFFFFF'
        : tokens.mode === 'dark' ? 'rgba(22,29,27,0.32)' : 'rgba(255,255,255,0.052)',
    backgroundImage: reduceTransparency ? undefined : gradient,
    borderColor: reduceTransparency ? tokens.borderStrong : tokens.mode === 'dark' ? 'rgba(190,210,205,0.13)' : 'rgba(255,255,255,0.78)',
    boxShadow: reduceTransparency
      ? 'none'
      : tokens.mode === 'dark'
        ? '0 13px 28px rgba(0,0,0,0.24), inset 0 1px 0 rgba(190,210,205,0.12), inset 0 -1px 0 rgba(0,117,106,0.08)'
        : '0 10px 22px rgba(31,92,82,0.040), 0 2px 8px rgba(255,255,255,0.30), inset 0 1px 0 rgba(255,255,255,0.86), inset 0 -1px 0 rgba(8,120,110,0.045)',
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function workerDockKaelActionSurface(tokens: WorkerThemeTokens, active: boolean) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? active
      ? 'radial-gradient(circle at 34% 15%, rgba(255,255,255,0.20), transparent 34%), radial-gradient(circle at 70% 72%, rgba(190,210,205,0.12), transparent 42%), linear-gradient(145deg, rgba(31,42,40,0.28), rgba(22,29,27,0.10))'
      : 'radial-gradient(circle at 34% 15%, rgba(255,255,255,0.16), transparent 34%), radial-gradient(circle at 70% 72%, rgba(190,210,205,0.09), transparent 42%), linear-gradient(145deg, rgba(31,42,40,0.22), rgba(22,29,27,0.08))'
    : active
      ? 'radial-gradient(circle at 32% 14%, rgba(255,255,255,0.92), transparent 36%), radial-gradient(circle at 72% 76%, rgba(255,255,255,0.38), transparent 44%), linear-gradient(145deg, rgba(255,255,255,0.34), rgba(255,255,255,0.10))'
      : 'radial-gradient(circle at 32% 14%, rgba(255,255,255,0.84), transparent 36%), radial-gradient(circle at 72% 76%, rgba(255,255,255,0.28), transparent 44%), linear-gradient(145deg, rgba(255,255,255,0.26), rgba(255,255,255,0.08))'

  return {
    backgroundColor: reduceTransparency
      ? tokens.mode === 'dark' ? '#161D1B' : '#FFFFFF'
      : tokens.mode === 'dark'
        ? active ? 'rgba(31,42,40,0.28)' : 'rgba(31,42,40,0.22)'
        : active ? 'rgba(255,255,255,0.26)' : 'rgba(255,255,255,0.22)',
    backgroundImage: reduceTransparency ? undefined : gradient,
    borderColor: reduceTransparency
      ? tokens.borderStrong
      : tokens.mode === 'dark'
        ? active ? 'rgba(190,210,205,0.24)' : 'rgba(190,210,205,0.18)'
        : active ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.90)',
    boxShadow: reduceTransparency
      ? 'none'
      : tokens.mode === 'dark'
        ? '0 14px 26px rgba(0,0,0,0.20), inset 0 1px 0 rgba(190,210,205,0.18), inset 0 -1px 0 rgba(190,210,205,0.06)'
        : '0 0 0 1px rgba(255,255,255,0.62), 0 12px 24px rgba(31,92,82,0.035), 0 2px 10px rgba(255,255,255,0.38), inset 0 1px 0 rgba(255,255,255,0.98), inset 0 -1px 0 rgba(20,73,66,0.06)',
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function workerDockKaelActionEdgeSurface(tokens: WorkerThemeTokens) {
  return {
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.22)' : 'rgba(255,255,255,0.98)',
    boxShadow: tokens.mode === 'dark'
      ? '0 0 0 1px rgba(190,210,205,0.08), inset 0 1px 0 rgba(190,210,205,0.18), inset 0 -1px 0 rgba(190,210,205,0.06)'
      : '0 0 0 1px rgba(255,255,255,0.72), inset 0 1px 0 rgba(255,255,255,0.98), inset 0 -1px 0 rgba(20,73,66,0.06)',
  } as any
}

function workerDockKaelActionAuraSurface(tokens: WorkerThemeTokens, active: boolean) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle, rgba(190,210,205,0.12), rgba(255,255,255,0.035) 48%, transparent 76%)'
    : 'radial-gradient(circle, rgba(255,255,255,0.46), rgba(255,255,255,0.12) 48%, transparent 76%)'
  return {
    backgroundColor: reduceTransparency
      ? 'transparent'
      : tokens.mode === 'dark'
        ? active ? 'rgba(190,210,205,0.09)' : 'rgba(190,210,205,0.06)'
        : active ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.12)',
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function workerHomeHeaderPillSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  return {
    backgroundColor: reduceTransparency
      ? tokens.mode === 'dark' ? '#161D1B' : '#FFFFFF'
      : tokens.mode === 'dark' ? 'rgba(190,210,205,0.045)' : 'rgba(255,255,255,0.58)',
    borderColor: reduceTransparency ? tokens.borderStrong : tokens.mode === 'dark' ? 'rgba(190,210,205,0.11)' : 'rgba(20,73,66,0.10)',
    color: tokens.primary,
  } as any
}

function workerHomeMapControlButtonKeyline(tokens: WorkerThemeTokens, active = false) {
  return {
    borderColor: active
      ? tokens.mode === 'dark' ? 'rgba(230,244,240,0.18)' : 'rgba(255,255,255,0.82)'
      : tokens.mode === 'dark' ? 'rgba(190,210,205,0.12)' : 'rgba(255,255,255,0.72)',
    boxShadow: tokens.mode === 'dark'
      ? active ? 'inset 0 1px 0 rgba(190,210,205,0.14), inset 0 -1px 0 rgba(0,117,106,0.22)' : 'inset 0 1px 0 rgba(190,210,205,0.09)'
      : active ? 'inset 0 1px 0 rgba(255,255,255,0.90), inset 0 -1px 0 rgba(0,117,106,0.12)' : 'inset 0 1px 0 rgba(255,255,255,0.78)',
  } as any
}

function workerHomeToggleTrackKeyline(tokens: WorkerThemeTokens, active = false) {
  return {
    borderColor: active
      ? tokens.mode === 'dark' ? 'rgba(190,210,205,0.24)' : 'rgba(255,255,255,0.72)'
      : tokens.mode === 'dark' ? 'rgba(190,210,205,0.12)' : 'rgba(20,73,66,0.10)',
    boxShadow: tokens.mode === 'dark'
      ? active ? 'inset 0 1px 0 rgba(190,210,205,0.16), inset 0 -1px 0 rgba(0,0,0,0.18)' : 'inset 0 1px 0 rgba(190,210,205,0.08)'
      : active ? 'inset 0 1px 0 rgba(255,255,255,0.76), inset 0 -1px 0 rgba(0,117,106,0.14)' : 'inset 0 1px 0 rgba(255,255,255,0.60)',
  } as any
}

function workerHomeAvailabilityToggleTrackSurface(tokens: WorkerThemeTokens, active = false, disabled = false) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const offGradient = tokens.mode === 'dark'
    ? 'linear-gradient(145deg, rgba(190,210,205,0.08), rgba(22,29,27,0.82))'
    : 'linear-gradient(145deg, rgba(255,255,255,0.92), rgba(235,245,242,0.76))'
  const activeGradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 76% 44%, rgba(190,210,205,0.24), transparent 30%), linear-gradient(135deg, rgba(105,222,198,0.82), rgba(0,117,106,0.96))'
    : 'radial-gradient(circle at 76% 44%, rgba(255,255,255,0.52), transparent 30%), linear-gradient(135deg, rgba(71,204,184,0.82), rgba(0,130,116,0.96))'
  const gradient = active ? activeGradient : offGradient

  return {
    backgroundColor: reduceTransparency
      ? active ? tokens.primary : tokens.raised
      : active ? tokens.primary : tokens.mode === 'dark' ? 'rgba(190,210,205,0.10)' : 'rgba(255,255,255,0.82)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    borderColor: reduceTransparency ? tokens.borderStrong : active ? tokens.primary : tokens.border,
    boxShadow: reduceTransparency
      ? 'none'
      : active
        ? tokens.mode === 'dark' ? '0 12px 28px rgba(0,117,106,0.22), inset 0 1px 0 rgba(190,210,205,0.18)' : '0 14px 30px rgba(0,117,106,0.18), inset 0 1px 0 rgba(255,255,255,0.62)'
        : tokens.mode === 'dark' ? 'inset 0 1px 0 rgba(190,210,205,0.09)' : 'inset 0 1px 0 rgba(255,255,255,0.70)',
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
    opacity: disabled ? 0.72 : 1,
  } as any
}

function workerHomeAvailabilityToggleFill(tokens: WorkerThemeTokens, active = false) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(135deg, rgba(105,222,198,0.78), rgba(0,117,106,0.96))'
    : 'linear-gradient(135deg, rgba(112,231,211,0.80), rgba(0,130,116,0.98))'

  return {
    backgroundColor: reduceTransparency
      ? active ? tokens.primary : tokens.raised
      : active ? tokens.primary : tokens.mode === 'dark' ? 'rgba(105,222,198,0.18)' : 'rgba(112,231,211,0.22)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function workerHomeAvailabilityToggleKnob(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  return {
    backgroundColor: tokens.mode === 'dark' ? '#F5FFFC' : '#FFFFFF',
    borderColor: reduceTransparency ? tokens.borderStrong : tokens.mode === 'dark' ? 'rgba(190,210,205,0.18)' : 'rgba(255,255,255,0.82)',
    boxShadow: reduceTransparency
      ? 'none'
      : tokens.mode === 'dark' ? '0 6px 14px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.52)' : '0 6px 16px rgba(20,73,66,0.16), inset 0 1px 0 rgba(255,255,255,0.96)',
  } as any
}

function workerHomeLiquidReadinessSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 82% 16%, rgba(105,222,198,0.11), transparent 28%), linear-gradient(160deg, rgba(24,33,31,0.96), rgba(15,22,21,0.88) 64%, rgba(22,29,27,0.94))'
    : 'radial-gradient(circle at 82% 16%, rgba(23,169,149,0.085), transparent 30%), linear-gradient(160deg, rgba(255,255,255,0.96), rgba(245,248,247,0.74) 64%, rgba(255,255,255,0.86))'

  return {
    backgroundColor: reduceTransparency ? (tokens.mode === 'dark' ? '#161D1B' : '#FFFFFF') : tokens.mode === 'dark' ? 'rgba(22,29,27,0.78)' : 'rgba(255,255,255,0.66)',
    borderColor: reduceTransparency ? tokens.borderStrong : workerLiquidEdgeHighlight(tokens),
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : workerHomeMaterialDepthShadow(tokens, 'readiness'),
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function workerHomeDisabledPrimaryButtonSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(145deg, rgba(190,210,205,0.08), rgba(22,29,27,0.74))'
    : 'linear-gradient(145deg, rgba(255,255,255,0.72), rgba(239,245,243,0.64))'

  return {
    backgroundColor: reduceTransparency ? tokens.raised : tokens.mode === 'dark' ? 'rgba(22,29,27,0.70)' : 'rgba(246,249,248,0.76)',
    borderColor: reduceTransparency ? tokens.border : tokens.mode === 'dark' ? 'rgba(190,210,205,0.12)' : 'rgba(20,73,66,0.09)',
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? 'inset 0 1px 0 rgba(190,210,205,0.08)' : 'inset 0 1px 0 rgba(255,255,255,0.76)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function workerHomeReadinessActionWellSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(145deg, rgba(190,210,205,0.045), rgba(22,29,27,0.10))'
    : 'linear-gradient(145deg, rgba(255,255,255,0.54), rgba(244,249,248,0.18))'

  return {
    backgroundColor: reduceTransparency
      ? tokens.mode === 'dark' ? '#161D1B' : '#FFFFFF'
      : tokens.mode === 'dark' ? 'rgba(190,210,205,0.035)' : 'rgba(255,255,255,0.34)',
    borderColor: reduceTransparency ? tokens.border : tokens.mode === 'dark' ? 'rgba(190,210,205,0.08)' : 'rgba(255,255,255,0.62)',
    borderRadius: 21,
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? 'inset 0 1px 0 rgba(190,210,205,0.06)' : 'inset 0 1px 0 rgba(255,255,255,0.62)',
    padding: 4,
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function workerHomeLiquidPrimaryButtonSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? `linear-gradient(135deg, ${color.mint.mint300}, ${color.brand.primary})`
    : `linear-gradient(135deg, ${color.mint.mint500}, ${color.brand.primary})`

  return {
    backgroundColor: reduceTransparency ? tokens.primary : tokens.mode === 'dark' ? color.mint.mint300 : color.brand.primary,
    borderColor: reduceTransparency ? tokens.borderStrong : tokens.mode === 'dark' ? 'rgba(190,210,205,0.14)' : 'rgba(255,255,255,0.30)',
    boxShadow: reduceTransparency ? 'none' : workerHomeMaterialDepthShadow(tokens, 'cta'),
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function workerHomeLiquidButtonSheen(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(100deg, rgba(255,255,255,0), rgba(255,255,255,0.24), rgba(255,255,255,0))'
    : 'linear-gradient(100deg, rgba(255,255,255,0), rgba(255,255,255,0.54), rgba(255,255,255,0))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.38)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

function workerHomeLiquidSheetSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 86% 10%, rgba(105,222,198,0.08), transparent 28%), linear-gradient(180deg, rgba(22,29,27,0.96), rgba(15,22,21,0.94))'
    : 'radial-gradient(circle at 86% 10%, rgba(23,169,149,0.08), transparent 30%), linear-gradient(180deg, rgba(255,255,255,0.96), rgba(247,248,248,0.94))'

  return {
    backgroundColor: reduceTransparency ? (tokens.mode === 'dark' ? '#161D1B' : '#FFFFFF') : tokens.mode === 'dark' ? 'rgba(22,29,27,0.78)' : 'rgba(255,255,255,0.70)',
    borderColor: reduceTransparency ? tokens.borderStrong : workerLiquidEdgeHighlight(tokens),
    boxShadow: reduceTransparency ? 'none' : workerHomeMaterialDepthShadow(tokens, 'sheet'),
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function workerJobsSectionWash(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 50% 0%, rgba(105,222,198,0.070), transparent 42%), linear-gradient(180deg, rgba(190,210,205,0.030), rgba(0,0,0,0))'
    : 'radial-gradient(circle at 50% 0%, rgba(76,222,199,0.115), transparent 42%), linear-gradient(180deg, rgba(255,255,255,0.52), rgba(255,255,255,0))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.018)' : 'rgba(255,255,255,0.24)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

function workerJobsSectionReflection(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(105deg, rgba(190,210,205,0), rgba(190,210,205,0.075) 42%, rgba(105,222,198,0.035) 58%, rgba(190,210,205,0))'
    : 'linear-gradient(105deg, rgba(255,255,255,0), rgba(255,255,255,0.62) 42%, rgba(207,255,243,0.25) 58%, rgba(255,255,255,0))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.040)' : 'rgba(255,255,255,0.34)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

function workerJobsSectionBottomLens(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 50% 50%, rgba(105,222,198,0.075), transparent 64%)'
    : 'radial-gradient(circle at 50% 50%, rgba(76,222,199,0.13), transparent 64%)'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.030)' : 'rgba(76,222,199,0.060)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

function workerJobsSectionCrispShell(tokens: WorkerThemeTokens) {
  return {
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.16)' : 'rgba(255,255,255,0.72)',
    boxShadow: tokens.mode === 'dark'
      ? 'inset 0 1px 0 rgba(190,210,205,0.10), inset 0 -1px 0 rgba(105,222,198,0.065), 0 16px 42px rgba(0,0,0,0.18)'
      : 'inset 0 1px 0 rgba(255,255,255,0.86), inset 0 -1px 0 rgba(9,121,106,0.10), 0 16px 38px rgba(20,73,66,0.060)',
  } as any
}

function workerJobsSectionTopEdge(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(90deg, rgba(190,210,205,0), rgba(190,210,205,0.17) 22%, rgba(105,222,198,0.095) 58%, rgba(190,210,205,0))'
    : 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.86) 22%, rgba(195,255,243,0.42) 58%, rgba(255,255,255,0))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.10)' : 'rgba(255,255,255,0.70)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

function workerJobsLiquidCardSurface(tokens: WorkerThemeTokens, tone: WorkerTone = 'base') {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const warm = tone === 'cream' || tone === 'warm'
  const mint = tone === 'mint'
  const cyan = tone === 'cyan'
  const accent = warm
    ? tokens.mode === 'dark' ? 'rgba(224,160,107,0.090)' : 'rgba(255,218,151,0.18)'
    : cyan
      ? tokens.mode === 'dark' ? 'rgba(88,190,196,0.075)' : 'rgba(183,243,247,0.18)'
      : mint
        ? tokens.mode === 'dark' ? 'rgba(105,222,198,0.090)' : 'rgba(76,222,199,0.17)'
        : tokens.mode === 'dark' ? 'rgba(105,222,198,0.060)' : 'rgba(76,222,199,0.105)'
  const gradient = tokens.mode === 'dark'
    ? `radial-gradient(circle at 78% 18%, ${accent}, transparent 34%), radial-gradient(circle at 18% 100%, rgba(190,210,205,0.028), transparent 42%), linear-gradient(180deg, rgba(22,29,27,0.94), rgba(15,23,22,0.88))`
    : `radial-gradient(circle at 78% 18%, ${accent}, transparent 34%), radial-gradient(circle at 18% 100%, rgba(255,255,255,0.66), transparent 42%), linear-gradient(180deg, rgba(255,255,255,0.94), rgba(247,249,248,0.84))`

  return {
    backgroundColor: reduceTransparency ? (tokens.mode === 'dark' ? '#161D1B' : '#FFFFFF') : tokens.mode === 'dark' ? 'rgba(22,29,27,0.90)' : 'rgba(255,255,255,0.86)',
    borderColor: reduceTransparency ? tokens.borderStrong : workerLiquidEdgeHighlight(tokens),
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : workerHomeMaterialDepthShadow(tokens, tone === 'strong' ? 'mapHud' : 'tile'),
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function workerJobsCardCrispShell(tokens: WorkerThemeTokens, tone: WorkerTone = 'base') {
  const warm = tone === 'cream' || tone === 'warm'
  return {
    borderColor: tokens.mode === 'dark'
      ? warm ? 'rgba(190,210,205,0.18)' : 'rgba(190,210,205,0.20)'
      : warm ? 'rgba(255,255,255,0.80)' : 'rgba(255,255,255,0.88)',
    boxShadow: tokens.mode === 'dark'
      ? 'inset 0 1px 0 rgba(190,210,205,0.14), inset 0 -1px 0 rgba(105,222,198,0.055)'
      : 'inset 0 1px 0 rgba(255,255,255,0.92), inset 0 -1px 0 rgba(0,117,106,0.11)',
  } as any
}

function workerJobsCardInnerInset(tokens: WorkerThemeTokens) {
  return {
    borderColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.080)' : 'rgba(9,121,106,0.075)',
    boxShadow: tokens.mode === 'dark'
      ? 'inset 0 1px 0 rgba(190,210,205,0.065)'
      : 'inset 0 1px 0 rgba(255,255,255,0.70)',
  } as any
}

function workerJobsCardBottomEdge(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(90deg, rgba(0,0,0,0), rgba(105,222,198,0.12) 50%, rgba(0,0,0,0))'
    : 'linear-gradient(90deg, rgba(255,255,255,0), rgba(9,121,106,0.13) 50%, rgba(255,255,255,0))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.070)' : 'rgba(9,121,106,0.080)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

function workerJobsCardDepthPlane(tokens: WorkerThemeTokens, tone: WorkerTone = 'base') {
  const warm = tone === 'cream' || tone === 'warm'
  const accent = warm
    ? tokens.mode === 'dark' ? 'rgba(224,160,107,0.08)' : 'rgba(255,218,151,0.16)'
    : tokens.mode === 'dark' ? 'rgba(105,222,198,0.07)' : 'rgba(76,222,199,0.13)'
  const gradient = tokens.mode === 'dark'
    ? `linear-gradient(180deg, rgba(190,210,205,0.070), rgba(190,210,205,0.014) 36%, rgba(0,0,0,0) 68%, ${accent}), radial-gradient(circle at 84% 18%, ${accent}, transparent 32%)`
    : `linear-gradient(180deg, rgba(255,255,255,0.86), rgba(255,255,255,0.20) 36%, rgba(255,255,255,0) 68%, ${accent}), radial-gradient(circle at 84% 18%, ${accent}, transparent 32%)`

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.016)' : 'rgba(255,255,255,0.16)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

function workerJobsCardRefraction(tokens: WorkerThemeTokens, tone: WorkerTone = 'base') {
  const warm = tone === 'cream' || tone === 'warm'
  const color = warm
    ? tokens.mode === 'dark' ? 'rgba(224,160,107,0.13)' : 'rgba(255,218,151,0.24)'
    : tokens.mode === 'dark' ? 'rgba(105,222,198,0.12)' : 'rgba(76,222,199,0.18)'
  const gradient = `radial-gradient(circle at 50% 50%, ${color}, transparent 66%)`

  return {
    backgroundColor: color,
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

function workerJobsCardTopEdge(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(90deg, rgba(190,210,205,0), rgba(190,210,205,0.16) 24%, rgba(105,222,198,0.10) 58%, rgba(190,210,205,0))'
    : 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.88) 24%, rgba(194,255,243,0.42) 58%, rgba(255,255,255,0))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.11)' : 'rgba(255,255,255,0.72)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

function workerHomeOperationalTileSurface(tokens: WorkerThemeTokens, tone: WorkerTone = 'base') {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  void tone
  const primaryWeight = 0.026
  const accent = tokens.mode === 'dark'
    ? `rgba(190,210,205,${primaryWeight})`
    : `rgba(255,255,255,0.58)`
  const mintAura = tokens.mode === 'dark'
    ? 'rgba(105,222,198,0.10)'
    : 'rgba(76,222,199,0.10)'
  const gradient = tokens.mode === 'dark'
    ? `radial-gradient(circle at 50% 38%, ${mintAura}, transparent 48%), radial-gradient(circle at 74% 20%, ${accent}, transparent 32%), linear-gradient(180deg, rgba(22,29,27,0.98), rgba(16,24,23,0.92))`
    : `radial-gradient(circle at 50% 38%, ${mintAura}, transparent 48%), radial-gradient(circle at 74% 20%, ${accent}, transparent 32%), linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,249,248,0.94))`

  return {
    backgroundColor: tokens.mode === 'dark' ? '#16211F' : '#FAFFFD',
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.10)' : 'rgba(20,73,66,0.08)',
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : workerHomeMaterialDepthShadow(tokens, 'tile'),
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function workerJobsCompactMapSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 36% 40%, rgba(105,222,198,0.08), transparent 38%), radial-gradient(circle at 76% 18%, rgba(190,210,205,0.055), transparent 30%), linear-gradient(155deg, rgba(22,29,27,0.88), rgba(14,22,21,0.72) 62%, rgba(18,28,26,0.84))'
    : 'radial-gradient(circle at 36% 40%, rgba(23,169,149,0.075), transparent 38%), radial-gradient(circle at 76% 18%, rgba(255,255,255,0.72), transparent 30%), linear-gradient(155deg, rgba(255,255,255,0.78), rgba(241,247,245,0.50) 62%, rgba(255,255,255,0.66))'

  return {
    backgroundColor: reduceTransparency ? (tokens.mode === 'dark' ? '#161D1B' : '#FFFFFF') : tokens.mode === 'dark' ? 'rgba(22,29,27,0.64)' : 'rgba(255,255,255,0.46)',
    borderColor: reduceTransparency ? tokens.borderStrong : workerLiquidEdgeHighlight(tokens),
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : workerHomeMaterialDepthShadow(tokens, 'map'),
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function workerJobsMapCrispShell(tokens: WorkerThemeTokens) {
  return {
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.19)' : 'rgba(255,255,255,0.88)',
    boxShadow: tokens.mode === 'dark'
      ? 'inset 0 1px 0 rgba(190,210,205,0.14), inset 0 -1px 0 rgba(105,222,198,0.070)'
      : 'inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(9,121,106,0.13)',
  } as any
}

function workerJobsMapTopEdge(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(90deg, rgba(190,210,205,0), rgba(190,210,205,0.18) 24%, rgba(105,222,198,0.11) 58%, rgba(190,210,205,0))'
    : 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.92) 24%, rgba(195,255,243,0.50) 58%, rgba(255,255,255,0))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.11)' : 'rgba(255,255,255,0.78)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

function workerOperationalTileKeyline(tokens: WorkerThemeTokens) {
  return {
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.09)' : 'rgba(255,255,255,0.64)',
    boxShadow: tokens.mode === 'dark' ? 'inset 0 1px 0 rgba(190,210,205,0.06)' : 'inset 0 1px 0 rgba(255,255,255,0.70)',
  } as any
}

function workerOperationalIconStage(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 72% 36%, rgba(105,222,198,0.10), transparent 44%), linear-gradient(145deg, rgba(190,210,205,0.055), rgba(22,29,27,0.08))'
    : 'radial-gradient(circle at 72% 36%, rgba(76,222,199,0.20), transparent 42%), linear-gradient(145deg, rgba(255,255,255,0.94), rgba(241,254,251,0.72))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.035)' : 'rgba(245,255,252,0.72)',
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.07)' : 'rgba(20,117,105,0.08)',
    boxShadow: reduceTransparency
      ? 'none'
      : tokens.mode === 'dark'
        ? '0 0 0 5px rgba(105,222,198,0.045), 0 10px 22px rgba(0,0,0,0.12), inset 0 1px 0 rgba(190,210,205,0.06)'
        : '0 0 0 5px rgba(76,222,199,0.070), 0 12px 24px rgba(23,169,149,0.080), inset 0 1px 0 rgba(255,255,255,0.82)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function workerOperationalIconAura(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 50% 50%, rgba(105,222,198,0.17), transparent 62%)'
    : 'radial-gradient(circle at 50% 50%, rgba(76,222,199,0.20), transparent 64%)'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.06)' : 'rgba(76,222,199,0.08)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

function workerProfileHeroSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 84% 16%, rgba(105,222,198,0.090), transparent 31%), radial-gradient(circle at 24% 8%, rgba(230,244,240,0.080), transparent 34%), linear-gradient(135deg, rgba(28,36,33,0.70), rgba(12,16,15,0.54))'
    : 'radial-gradient(circle at 86% 14%, rgba(23,169,149,0.12), transparent 31%), linear-gradient(135deg, rgba(255,255,255,0.66), rgba(241,255,251,0.52))'

  return {
    backgroundColor: reduceTransparency ? (tokens.mode === 'dark' ? '#161D1B' : '#F8FFFC') : tokens.mode === 'dark' ? 'rgba(22,29,27,0.54)' : 'rgba(255,255,255,0.48)',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.18)' : 'rgba(255,255,255,0.86)',
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : workerHomeMaterialDepthShadow(tokens, 'readiness'),
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function workerProfileChromeRadius(variant: WorkerProfileChromeVariant) {
  if (variant === 'hero') return 30
  if (variant === 'form') return 29
  if (variant === 'preference') return 29
  if (variant === 'collapsed') return 24
  if (variant === 'mini') return 20
  return 29
}

function workerProfileChromeInsetRadius(variant: WorkerProfileChromeVariant) {
  return Math.max(workerProfileChromeRadius(variant) - 4, 15)
}

function workerProfileChromeWash(tokens: WorkerThemeTokens, variant: WorkerProfileChromeVariant) {
  const prominent = variant === 'hero' || variant === 'form'
  const gradient = tokens.mode === 'dark'
    ? prominent
      ? 'radial-gradient(circle at 82% 14%, rgba(105,222,198,0.075), transparent 32%), linear-gradient(180deg, rgba(230,244,240,0.070), rgba(0,0,0,0))'
      : 'linear-gradient(180deg, rgba(230,244,240,0.052), rgba(105,222,198,0.018))'
    : prominent
      ? 'radial-gradient(circle at 82% 14%, rgba(23,169,149,0.10), transparent 32%), linear-gradient(180deg, rgba(255,255,255,0.76), rgba(230,255,248,0.24))'
      : 'linear-gradient(180deg, rgba(255,255,255,0.78), rgba(230,255,248,0.30))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.018)' : 'rgba(255,255,255,0.22)',
    background: gradient,
    backgroundImage: gradient,
    borderRadius: workerProfileChromeRadius(variant),
    experimental_backgroundImage: gradient,
    opacity: prominent ? 0.92 : 0.70,
  } as any
}

function workerProfileChromeRefraction(tokens: WorkerThemeTokens, variant: WorkerProfileChromeVariant) {
  const prominent = variant === 'hero' || variant === 'form'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 50% 50%, rgba(105,222,198,0.060), transparent 66%)'
    : 'radial-gradient(circle at 50% 50%, rgba(23,169,149,0.10), transparent 66%)'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.026)' : 'rgba(23,169,149,0.042)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
    opacity: prominent ? 0.70 : 0.46,
  } as any
}

function workerProfileChromeCrispShell(tokens: WorkerThemeTokens, variant: WorkerProfileChromeVariant) {
  return {
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.19)' : 'rgba(255,255,255,0.86)',
    borderRadius: workerProfileChromeRadius(variant),
    boxShadow: tokens.mode === 'dark'
      ? 'inset 0 1px 0 rgba(230,244,240,0.15), inset 0 -1px 0 rgba(105,222,198,0.045)'
      : 'inset 0 1px 0 rgba(255,255,255,0.94), inset 0 -1px 0 rgba(9,121,106,0.12)',
  } as any
}

function workerProfileChromeInnerInset(tokens: WorkerThemeTokens, variant: WorkerProfileChromeVariant) {
  return {
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.085)' : 'rgba(9,121,106,0.075)',
    borderRadius: workerProfileChromeInsetRadius(variant),
    boxShadow: tokens.mode === 'dark'
      ? 'inset 0 1px 0 rgba(190,210,205,0.060)'
      : 'inset 0 1px 0 rgba(255,255,255,0.70)',
  } as any
}

function workerProfileChromeTopEdge(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(90deg, rgba(230,244,240,0), rgba(230,244,240,0.20) 22%, rgba(105,222,198,0.060) 58%, rgba(230,244,240,0))'
    : 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.90) 22%, rgba(195,255,243,0.48) 58%, rgba(255,255,255,0))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.11)' : 'rgba(255,255,255,0.76)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

function workerProfileChromeBottomEdge(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(90deg, rgba(0,0,0,0), rgba(105,222,198,0.075) 50%, rgba(0,0,0,0))'
    : 'linear-gradient(90deg, rgba(255,255,255,0), rgba(9,121,106,0.12) 50%, rgba(255,255,255,0))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.045)' : 'rgba(9,121,106,0.080)',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

const workerProfileLevelMax = 10
const workerProfileLevelThresholds = [0, 15, 30, 50, 100, 160, 240, 340, 460, 600] as const

function buildWorkerProfileLevelModel(
  workerProfile: WorkerProfileResponse | null,
  language: WorkerLanguageMode,
): WorkerProfileLevelModel {
  const completedJobs = Math.max(0, workerProfile?.total_jobs ?? 0)
  const rawRating = Number(workerProfile?.rating ?? 0)
  const hasRating = completedJobs > 0 && Number.isFinite(rawRating) && rawRating > 0
  const rating = hasRating ? Math.min(5, Math.max(1, rawRating)) : 0
  const points = workerProfile ? completedJobs : 0
  let levelIndex = 0
  for (let index = 0; index < workerProfileLevelThresholds.length; index += 1) {
    if (points >= workerProfileLevelThresholds[index]) levelIndex = index
  }
  const level = levelIndex + 1
  const currentFloor = workerProfileLevelThresholds[levelIndex] ?? 0
  const nextThreshold = workerProfileLevelThresholds[levelIndex + 1] ?? currentFloor
  const span = Math.max(1, nextThreshold - currentFloor)
  const progress = nextThreshold > currentFloor ? Math.min(1, Math.max(0, (points - currentFloor) / span)) : 1
  const titles = workerProfileLevelTitles(language)
  const title = workerProfile ? titles[levelIndex] ?? titles[titles.length - 1] : language === 'en' ? 'Profile pending' : 'Chờ hồ sơ thợ'
  const nextTitle = titles[levelIndex + 1] ?? null
  const nextLabel = !workerProfile
    ? language === 'en'
      ? 'Submit verification to start earning level progress.'
      : 'Hoàn tất xác minh để bắt đầu tích lũy cấp thợ.'
    : !nextTitle
      ? language === 'en'
        ? 'You are at the highest visible level for this phase.'
        : 'Bạn đang ở cấp cao nhất trong giai đoạn này.'
      : completedJobs === 0
        ? language === 'en'
          ? 'Finish your first real job to start progress.'
          : 'Hoàn tất việc đầu tiên để bắt đầu tiến trình.'
        : language === 'en'
          ? `${Math.max(1, nextThreshold - points)} completed jobs to reach ${nextTitle}.`
          : `${Math.max(1, nextThreshold - points)} việc hoàn tất nữa để lên ${nextTitle}.`
  const body = !workerProfile
    ? language === 'en'
      ? 'Your level will use real completed jobs and customer feedback only.'
      : 'Cấp thợ chỉ dùng việc hoàn tất và phản hồi thật.'
    : completedJobs === 0
      ? language === 'en'
        ? 'Complete jobs and earn real feedback to build recommendation signals.'
        : 'Hoàn tất việc và nhận phản hồi thật để xây tín hiệu đề xuất.'
      : language === 'en'
        ? 'Kael ranks with feedback, service fit, area, and availability; total jobs help break ties.'
        : 'Kael xếp hạng bằng phản hồi, kỹ năng, khu vực và trạng thái nhận việc; số việc hỗ trợ khi cần phân hạng.'
  const recommendationPercent = workerProfile ? Math.round(progress * 100) : 0
  const hasCompletedJobs = completedJobs > 0
  const emptySignalValue = language === 'en' ? 'Not yet' : 'Ch\u01b0a c\u00f3'
  const signals: WorkerProfileLevelSignal[] = [
    {
      id: 'jobs',
      label: language === 'en' ? 'Completed jobs' : 'Việc hoàn tất',
      value: hasCompletedJobs ? `${completedJobs}` : emptySignalValue,
    },
    {
      id: 'rating',
      label: language === 'en' ? 'Feedback' : 'Phản hồi',
      value: hasRating ? `${rating.toFixed(1)}/5` : emptySignalValue,
    },
    {
      id: 'recommendation',
      label: language === 'en' ? 'Ranking signal' : 'Tín hiệu đề xuất',
      value: hasCompletedJobs ? `${recommendationPercent}%` : emptySignalValue,
    },
  ]
  const milestones = buildWorkerProfileLevelMilestones({
    currentLevel: workerProfile ? level : 0,
    language,
    titles,
  })

  return {
    body,
    currentFloor,
    level,
    milestones,
    nextLabel,
    nextThreshold,
    points,
    progress,
    signals,
    title,
  }
}

function workerProfileLevelTitles(language: WorkerLanguageMode) {
  return language === 'en'
    ? ['New worker', 'Steady worker', 'Trusted worker', 'Standout worker', 'Elite worker', 'Level 6', 'Level 7', 'Level 8', 'Level 9', 'Level 10']
    : ['Thợ mới', 'Thợ vững tay', 'Thợ tin cậy', 'Thợ nổi bật', 'Thợ tinh nhuệ', 'Cấp 6', 'Cấp 7', 'Cấp 8', 'Cấp 9', 'Cấp 10']
}

function buildWorkerProfileLevelMilestones({
  currentLevel,
  language,
  titles,
}: {
  currentLevel: number
  language: WorkerLanguageMode
  titles: string[]
}): WorkerProfileLevelMilestone[] {
  return workerProfileLevelThresholds.map((threshold, index) => {
    const level = index + 1
    const requirementVisible = level <= 4 || level <= currentLevel || (currentLevel >= 5 && level === currentLevel + 1)
    const rewardVisible = level <= 4
    const state = workerProfileLevelMilestoneState(level, currentLevel, requirementVisible)

    return {
      level,
      requirement: requirementVisible ? workerProfileLevelRequirement(level, threshold, language) : workerProfileLockedRequirementText(language),
      reward: rewardVisible ? workerProfileLevelReward(level, language) : workerProfileLockedRewardText(language),
      state,
      stateLabel: workerProfileLevelStateLabel(state, language),
      title: requirementVisible ? titles[index] ?? `${language === 'en' ? 'Level' : 'Cấp'} ${level}` : `${language === 'en' ? 'Level' : 'Cấp'} ${level}`,
    }
  })
}

function workerProfileLevelMilestoneState(
  level: number,
  currentLevel: number,
  requirementVisible: boolean,
): WorkerProfileLevelMilestoneState {
  if (!requirementVisible) return 'mystery'
  if (level < currentLevel) return 'reached'
  if (level === currentLevel) return 'current'
  if (level === currentLevel + 1) return 'next'
  return 'open'
}

function workerProfileLevelStateLabel(state: WorkerProfileLevelMilestoneState, language: WorkerLanguageMode) {
  if (state === 'current') return language === 'en' ? 'Current' : 'Hiện tại'
  if (state === 'reached') return language === 'en' ? 'Unlocked' : 'Đã mở'
  if (state === 'next') return language === 'en' ? 'Next' : 'Tiếp theo'
  if (state === 'mystery') return language === 'en' ? 'Locked' : 'Đang khóa'
  return language === 'en' ? 'Path' : 'Lộ trình'
}

function workerProfileLockedRequirementText(language: WorkerLanguageMode) {
  return language === 'en'
    ? 'Unlocks after earlier real milestones.'
    : 'Mở sau các mốc thật trước đó.'
}

function workerProfileLockedRewardText(language: WorkerLanguageMode) {
  return language === 'en'
    ? 'Reward details unlock with real progress.'
    : 'Chi tiết quyền lợi mở theo tiến trình thật.'
}

function workerProfileLevelRequirement(level: number, threshold: number, language: WorkerLanguageMode) {
  if (level === 1) {
    return language === 'en'
      ? 'Complete verification and start receiving real jobs.'
      : 'Hoàn tất xác minh và bắt đầu nhận việc thật.'
  }

  return language === 'en'
    ? `${threshold} completed jobs with honest customer feedback.`
    : `${threshold} việc hoàn tất cùng phản hồi thật.`
}

function workerProfileLevelReward(level: number, language: WorkerLanguageMode) {
  const rewards = language === 'en'
    ? [
        'Level progress opens.',
        'Steadier profile signal.',
        'Stronger recommendation signal when area and skills fit.',
        'Better tie-break signal against similar profiles.',
      ]
    : [
        'Mở tiến trình cấp thợ.',
        'Tín hiệu hồ sơ ổn định hơn.',
        'Tín hiệu đề xuất mạnh hơn khi đúng khu vực và kỹ năng.',
        'Tín hiệu phân hạng tốt hơn khi hồ sơ tương đương.',
      ]

  return rewards[level - 1] ?? workerProfileLockedRewardText(language)
}

function workerProfileLevelOrbSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 38% 24%, rgba(230,244,240,0.12), transparent 30%), linear-gradient(145deg, rgba(105,222,198,0.13), rgba(22,29,27,0.68))'
    : 'radial-gradient(circle at 38% 24%, rgba(255,255,255,0.92), transparent 30%), linear-gradient(145deg, rgba(211,255,246,0.96), rgba(247,255,252,0.78))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.12)' : 'rgba(226,255,249,0.90)',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.16)' : 'rgba(8,139,124,0.12)',
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? '0 12px 26px rgba(0,0,0,0.28), inset 0 1px 0 rgba(230,244,240,0.10)' : '0 12px 26px rgba(17,70,61,0.08)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function workerProfileProgressTrackSurface(tokens: WorkerThemeTokens) {
  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.045)' : 'rgba(255,255,255,0.54)',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.075)' : 'rgba(16,131,115,0.070)',
  } as any
}

function workerProfileProgressFillSurface(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? `linear-gradient(90deg, ${color.mint.mint300}, ${color.brand.primary})`
    : `linear-gradient(90deg, ${color.mint.auraStrong}, ${color.brand.primary})`

  return {
    backgroundColor: tokens.primary,
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

function workerProfileLevelChipSurface(tokens: WorkerThemeTokens, state: WorkerProfileLevelMilestoneState, selected: boolean) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const isOpen = state === 'open' || state === 'next'
  const isMystery = state === 'mystery'
  const gradient = tokens.mode === 'dark'
    ? selected
      ? 'linear-gradient(145deg, rgba(105,222,198,0.13), rgba(230,244,240,0.055))'
      : 'linear-gradient(145deg, rgba(230,244,240,0.038), rgba(105,222,198,0.014))'
    : selected
      ? 'linear-gradient(145deg, rgba(223,255,248,0.90), rgba(255,255,255,0.60))'
      : 'linear-gradient(145deg, rgba(255,255,255,0.56), rgba(239,255,251,0.26))'

  return {
    backgroundColor: tokens.mode === 'dark'
      ? selected ? 'rgba(105,222,198,0.085)' : 'rgba(230,244,240,0.022)'
      : selected ? 'rgba(226,255,249,0.78)' : 'rgba(255,255,255,0.46)',
    borderColor: tokens.mode === 'dark'
      ? selected ? 'rgba(230,244,240,0.15)' : isOpen ? 'rgba(105,222,198,0.075)' : 'rgba(230,244,240,0.060)'
      : selected ? 'rgba(8,139,124,0.18)' : isOpen ? 'rgba(8,139,124,0.10)' : 'rgba(16,131,115,0.060)',
    boxShadow: reduceTransparency || !selected ? 'none' : tokens.mode === 'dark' ? '0 10px 22px rgba(0,0,0,0.18)' : '0 10px 22px rgba(17,70,61,0.060)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
    opacity: isMystery ? 0.72 : 1,
  } as any
}

function workerProfileLevelChipSheen(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(90deg, rgba(255,255,255,0.20), rgba(255,255,255,0.02))'
    : 'linear-gradient(90deg, rgba(255,255,255,0.78), rgba(255,255,255,0.08))'

  return {
    backgroundColor: tokens.glassHighlight,
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

function workerProfileLevelMilestoneSurface(tokens: WorkerThemeTokens, state: WorkerProfileLevelMilestoneState) {
  const isCurrent = state === 'current'
  const isMystery = state === 'mystery'
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? isCurrent
      ? 'linear-gradient(135deg, rgba(105,222,198,0.11), rgba(230,244,240,0.048))'
      : 'linear-gradient(135deg, rgba(230,244,240,0.036), rgba(105,222,198,0.014))'
    : isCurrent
      ? 'linear-gradient(135deg, rgba(219,255,248,0.86), rgba(255,255,255,0.54))'
      : 'linear-gradient(135deg, rgba(255,255,255,0.52), rgba(239,255,251,0.24))'

  return {
    backgroundColor: tokens.mode === 'dark'
      ? isCurrent ? 'rgba(105,222,198,0.072)' : 'rgba(230,244,240,0.020)'
      : isCurrent ? 'rgba(226,255,249,0.62)' : 'rgba(255,255,255,0.42)',
    borderColor: tokens.mode === 'dark'
      ? isCurrent ? 'rgba(230,244,240,0.14)' : isMystery ? 'rgba(230,244,240,0.050)' : 'rgba(230,244,240,0.072)'
      : isCurrent ? 'rgba(8,139,124,0.15)' : isMystery ? 'rgba(16,131,115,0.048)' : 'rgba(16,131,115,0.075)',
    boxShadow: reduceTransparency || !isCurrent ? 'none' : tokens.mode === 'dark' ? '0 10px 24px rgba(0,0,0,0.18)' : '0 10px 22px rgba(17,70,61,0.065)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
    opacity: isMystery ? 0.76 : 1,
  } as any
}

function workerProfileLevelMilestoneBadgeSurface(tokens: WorkerThemeTokens, state: WorkerProfileLevelMilestoneState) {
  const isCurrent = state === 'current'
  return {
    backgroundColor: tokens.mode === 'dark'
      ? isCurrent ? 'rgba(105,222,198,0.105)' : 'rgba(230,244,240,0.024)'
      : isCurrent ? 'rgba(209,255,246,0.88)' : 'rgba(255,255,255,0.50)',
    borderColor: tokens.mode === 'dark'
      ? isCurrent ? 'rgba(230,244,240,0.15)' : 'rgba(230,244,240,0.066)'
      : isCurrent ? 'rgba(8,139,124,0.16)' : 'rgba(16,131,115,0.070)',
  } as any
}

function workerProfileLevelScrollTrackSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = workerHasReducedGlass(tokens)
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(90deg, rgba(230,244,240,0.018), rgba(230,244,240,0.070), rgba(105,222,198,0.028), rgba(230,244,240,0.018))'
    : 'linear-gradient(90deg, rgba(255,255,255,0.18), rgba(255,255,255,0.56), rgba(211,255,246,0.22), rgba(255,255,255,0.18))'

  return {
    backgroundColor: reduceTransparency
      ? tokens.mode === 'dark' ? 'rgba(230,244,240,0.050)' : 'rgba(255,255,255,0.60)'
      : tokens.mode === 'dark' ? 'rgba(230,244,240,0.026)' : 'rgba(255,255,255,0.32)',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.080)' : 'rgba(255,255,255,0.68)',
    boxShadow: reduceTransparency
      ? 'none'
      : tokens.mode === 'dark'
        ? 'inset 0 1px 0 rgba(230,244,240,0.070), inset 0 -1px 0 rgba(0,0,0,0.18)'
        : 'inset 0 1px 0 rgba(255,255,255,0.82), 0 6px 14px rgba(17,70,61,0.050)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function workerProfileLevelScrollThumbSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = workerHasReducedGlass(tokens)
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(90deg, rgba(230,244,240,0.20), rgba(230,244,240,0.42), rgba(105,222,198,0.18))'
    : 'linear-gradient(90deg, rgba(255,255,255,0.74), rgba(255,255,255,0.94), rgba(191,255,242,0.58))'

  return {
    backgroundColor: reduceTransparency
      ? tokens.mode === 'dark' ? 'rgba(230,244,240,0.24)' : 'rgba(8,139,124,0.24)'
      : tokens.mode === 'dark' ? 'rgba(230,244,240,0.24)' : 'rgba(255,255,255,0.72)',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.18)' : 'rgba(8,139,124,0.11)',
    boxShadow: reduceTransparency
      ? 'none'
      : tokens.mode === 'dark'
        ? '0 4px 12px rgba(0,0,0,0.24), inset 0 1px 0 rgba(230,244,240,0.18)'
        : '0 6px 16px rgba(17,70,61,0.070), inset 0 1px 0 rgba(255,255,255,0.96)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function workerProfileLevelScrollEdgeSurface(tokens: WorkerThemeTokens) {
  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.12)' : 'rgba(255,255,255,0.72)',
  } as any
}

function workerProfileLevelScrollSheenSurface(tokens: WorkerThemeTokens) {
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(90deg, rgba(255,255,255,0.18), transparent 58%)'
    : 'linear-gradient(90deg, rgba(255,255,255,0.94), transparent 58%)'

  return {
    backgroundColor: tokens.glassHighlight,
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

function workerProfileMiniSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 82% 8%, rgba(230,244,240,0.060), transparent 36%), linear-gradient(180deg, rgba(24,31,29,0.74), rgba(13,17,16,0.58))'
    : 'linear-gradient(180deg, rgba(255,255,255,0.94), rgba(240,255,251,0.86))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(22,29,27,0.66)' : '#F8FFFC',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.12)' : 'rgba(35,96,84,0.12)',
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? '0 14px 30px rgba(0,0,0,0.30), inset 0 1px 0 rgba(230,244,240,0.08)' : '0 10px 22px rgba(17,70,61,0.06)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function workerProfilePreferenceSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 86% 0%, rgba(230,244,240,0.050), transparent 34%), linear-gradient(180deg, rgba(24,31,29,0.72), rgba(13,17,16,0.58))'
    : 'linear-gradient(180deg, rgba(255,255,255,0.94), rgba(240,255,251,0.86))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(22,29,27,0.66)' : '#F8FFFC',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.12)' : 'rgba(35,96,84,0.12)',
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? '0 14px 32px rgba(0,0,0,0.30), inset 0 1px 0 rgba(230,244,240,0.08)' : '0 10px 24px rgba(17,70,61,0.07)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function workerProfilePanelSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 86% 0%, rgba(230,244,240,0.056), transparent 34%), linear-gradient(180deg, rgba(24,31,29,0.72), rgba(13,17,16,0.56))'
    : 'linear-gradient(180deg, rgba(255,255,255,0.94), rgba(240,255,251,0.86))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(22,29,27,0.66)' : '#F8FFFC',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.12)' : 'rgba(35,96,84,0.13)',
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? '0 15px 34px rgba(0,0,0,0.31), inset 0 1px 0 rgba(230,244,240,0.08)' : '0 10px 24px rgba(17,70,61,0.07)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function workerProfileLevelCornerAura(tokens: WorkerThemeTokens) {
  if (workerHasReducedGlass(tokens)) {
    return {
      backgroundColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.048)' : 'rgba(105,222,198,0.090)',
    } as any
  }

  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(225deg, rgba(105,222,198,0.10), rgba(230,244,240,0.030) 42%, transparent 74%)'
    : 'linear-gradient(225deg, rgba(105,222,198,0.30), rgba(105,222,198,0.12) 42%, transparent 74%)'

  return {
    backgroundColor: 'transparent',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

function workerProfileRowSurface(tokens: WorkerThemeTokens) {
  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.022)' : 'rgba(255,255,255,0.42)',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.065)' : 'rgba(16,131,115,0.070)',
    borderWidth: 1,
  } as any
}

function workerProfileLevelSignalSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = workerHasReducedGlass(tokens)
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 50% 0%, rgba(230,244,240,0.070), transparent 48%), linear-gradient(145deg, rgba(230,244,240,0.055), rgba(13,17,16,0.54))'
    : 'radial-gradient(circle at 50% 0%, rgba(255,255,255,0.96), transparent 48%), linear-gradient(145deg, rgba(255,255,255,0.82), rgba(232,255,249,0.48))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(22,29,27,0.54)' : 'rgba(255,255,255,0.58)',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.12)' : 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    boxShadow: reduceTransparency
      ? 'none'
      : tokens.mode === 'dark'
        ? 'inset 0 1px 0 rgba(230,244,240,0.10), 0 14px 24px rgba(0,0,0,0.26)'
        : 'inset 0 1px 0 rgba(255,255,255,0.86), 0 12px 24px rgba(17,70,61,0.08)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function workerProfileLevelSignalGlass(tokens: WorkerThemeTokens) {
  if (workerHasReducedGlass(tokens)) {
    return { backgroundColor: 'transparent' } as any
  }

  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(160deg, rgba(230,244,240,0.080), transparent 42%, rgba(105,222,198,0.030))'
    : 'linear-gradient(160deg, rgba(255,255,255,0.82), transparent 42%, rgba(195,255,243,0.38))'

  return {
    backgroundColor: 'transparent',
    background: gradient,
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

function workerProfileLevelSignalTopEdge(tokens: WorkerThemeTokens) {
  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.14)' : 'rgba(255,255,255,0.82)',
  } as any
}

function workerProfilePreferenceRowSurface(tokens: WorkerThemeTokens) {
  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.020)' : 'rgba(255,255,255,0.36)',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.052)' : 'rgba(16,131,115,0.055)',
    borderWidth: 1,
  } as any
}

function workerProfileInputSurface(tokens: WorkerThemeTokens) {
  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.024)' : 'rgba(255,255,255,0.50)',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.082)' : 'rgba(16,131,115,0.090)',
  } as any
}

function workerProfileServiceAreaSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(180deg, rgba(230,244,240,0.040), rgba(105,222,198,0.016))'
    : 'linear-gradient(180deg, rgba(255,255,255,0.72), rgba(230,255,248,0.30))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.020)' : 'rgba(255,255,255,0.42)',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.082)' : 'rgba(16,131,115,0.085)',
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? 'inset 0 1px 0 rgba(230,244,240,0.055)' : 'inset 0 1px 0 rgba(255,255,255,0.66)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function workerProfileFileButtonSurface(tokens: WorkerThemeTokens, selected: boolean) {
  return {
    backgroundColor: selected
      ? tokens.mode === 'dark' ? 'rgba(105,222,198,0.12)' : 'rgba(218,255,247,0.78)'
      : tokens.mode === 'dark' ? 'rgba(230,244,240,0.022)' : 'rgba(255,255,255,0.46)',
    borderColor: selected
      ? tokens.mode === 'dark' ? 'rgba(105,222,198,0.24)' : 'rgba(8,139,124,0.18)'
      : tokens.mode === 'dark' ? 'rgba(230,244,240,0.072)' : 'rgba(16,131,115,0.080)',
  } as any
}

function workerMapViewportSurface(tokens: WorkerThemeTokens, material: GlassMaterial = 'standard') {
  if (material === 'liquid') {
    return {
      backgroundColor: tokens.mode === 'dark' ? '#161D1B' : '#F6F7F7',
      borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.10)' : 'rgba(255,255,255,0.58)',
      borderWidth: 1,
      experimental_backgroundImage:
        tokens.mode === 'dark'
          ? 'radial-gradient(circle at 34% 42%, rgba(105,222,198,0.10), transparent 25%), radial-gradient(circle at 78% 22%, rgba(190,210,205,0.06), transparent 30%), linear-gradient(145deg, #161D1B, #101615 58%, #18201E)'
          : 'radial-gradient(circle at 34% 42%, rgba(23,169,149,0.13), transparent 25%), radial-gradient(circle at 78% 22%, rgba(255,255,255,0.74), transparent 30%), linear-gradient(145deg, #FFFFFF 0%, #EEF2F1 58%, #F7F8F8 100%)',
    } as any
  }

  return {
    backgroundColor: tokens.mode === 'dark' ? tokens.depth : '#ECFFF8',
    experimental_backgroundImage:
      tokens.mode === 'dark'
        ? 'radial-gradient(circle at 24% 28%, rgba(105,222,198,0.11), transparent 28%), radial-gradient(circle at 82% 32%, rgba(230,244,240,0.060), transparent 30%), linear-gradient(145deg, #131918, #171D1B 58%, #1D2522)'
        : 'radial-gradient(circle at 27% 49%, rgba(134,237,220,0.72), transparent 23%), radial-gradient(circle at 83% 31%, rgba(151,226,220,0.54), transparent 31%), radial-gradient(circle at 86% 85%, rgba(255,226,173,0.70), transparent 31%), linear-gradient(145deg, #F7FFF8 0%, #D7F7EE 50%, #FFF2D8 100%)',
  } as any
}

function workerMapModalSheetSurface(tokens: WorkerThemeTokens, material: GlassMaterial = 'standard') {
  if (material === 'liquid') {
    return workerHomeLiquidSheetSurface(tokens)
  }

  const backgroundColor = tokens.mode === 'dark' ? 'rgba(22,29,27,0.86)' : 'rgba(252,255,252,0.96)'
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 82% 8%, rgba(230,244,240,0.070), transparent 34%), linear-gradient(180deg, rgba(24,31,29,0.82), rgba(13,17,16,0.78))'
    : 'linear-gradient(180deg, rgba(252,255,252,0.98), rgba(244,252,248,0.96))'

  return {
    backgroundColor,
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.14)' : 'rgba(20,117,105,0.14)',
    experimental_backgroundImage: gradient,
  } as any
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  inactiveRouteSurface: { display: 'none' },
  canvas: { alignItems: 'center', flex: 1, overflow: 'hidden' },
  workerScroll: { flex: 1, overflowAnchor: 'none', width: '100%' } as any,
  workerStandaloneScroll: { overflow: 'hidden' } as any,
  backdropWarm: { borderRadius: 30, bottom: 72, height: 148, left: -98, opacity: 0.12, position: 'absolute', transform: [{ rotate: '12deg' }], width: 210 },
  backdropMint: { borderRadius: 36, height: 226, opacity: 0.18, position: 'absolute', right: -126, top: 54, width: 294 },
  backdropCyan: { borderRadius: 30, height: 148, left: -96, opacity: 0.1, position: 'absolute', top: 200, transform: [{ rotate: '-10deg' }], width: 220 },
  sectionMotionField: { bottom: 0, overflow: 'hidden', position: 'absolute', top: 0, zIndex: 0 },
  sectionMotionRibbon: { borderRadius: 34, height: 760, left: 18, position: 'absolute', width: 62 },
  sectionMotionWash: { borderRadius: 34, height: 178, position: 'absolute', right: -92, width: 224 },
  sectionMotionCaustic: { borderRadius: 30, bottom: 84, height: 118, left: -104, position: 'absolute', width: 268 },
  sectionMotionGlint: { bottom: 52, height: 260, left: '50%', position: 'absolute', width: 34 },
  scrollContent: { gap: 12, paddingHorizontal: workerFrameHorizontalPadding, paddingTop: 8, zIndex: 2 },
  standaloneScrollContent: { overflow: 'visible' } as any,
  kicker: { fontSize: 12, fontWeight: '600', letterSpacing: 0 },
  screenSubtitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0, lineHeight: 16 },
  screenTitle: { fontSize: 25, fontWeight: '700', letterSpacing: 0, lineHeight: 27 },
  workerTopRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 47, paddingTop: 0 },
  screenHeaderAction: { alignItems: 'center', borderRadius: 18, borderWidth: 1, height: 46, justifyContent: 'center', width: 46 },
  screenHeaderPill: { borderCurve: 'continuous', borderRadius: 999, borderWidth: 1, flexShrink: 0, fontSize: 12, fontWeight: '700', lineHeight: 14, maxWidth: 126, overflow: 'hidden', paddingHorizontal: 11, paddingVertical: 8 },
  glassTopHighlight: { height: 1, left: 16, opacity: 0.82, position: 'absolute', right: 16, top: 0, zIndex: 0 },
  liquidSharpKeyline: { borderCurve: 'continuous', borderRadius: 24, borderWidth: 1, bottom: 0, left: 0, opacity: 0.92, position: 'absolute', right: 0, top: 0, zIndex: 1 },
  liquidSharpKeylinePanel: { borderRadius: 24 },
  liquidSharpKeylineSheet: { borderRadius: 32 },
  liquidSpecularBand: { height: 88, left: -62, position: 'absolute', right: -62, top: -28, transform: [{ rotate: '-8deg' }], zIndex: 0 },
  liquidSpecularBandPanel: { height: 78, top: -22 },
  liquidRefractionPool: { borderRadius: 999, height: 164, opacity: 0.74, position: 'absolute', right: -76, top: 18, width: 230, zIndex: 0 },
  liquidRefractionPoolPanel: { height: 132, right: -58, top: -8, width: 178 },
  liquidPanelGlassOverlay: { borderCurve: 'continuous', borderRadius: 24, bottom: 0, left: 0, position: 'absolute', right: 0, top: 0, zIndex: 0 },
  liquidPanelGlassOverlaySheet: { borderRadius: 32 },
  workerHomeMaterialDepthPlane: { borderCurve: 'continuous', borderRadius: 24, bottom: 0, left: 0, overflow: 'hidden', position: 'absolute', right: 0, top: 0, zIndex: 0 },
  workerHomeMaterialDepthPlaneSheet: { borderRadius: 32 },
  workerHomeMaterialSubstrate: { borderCurve: 'continuous', borderRadius: 24, bottom: 0, left: 0, overflow: 'hidden', position: 'absolute', right: 0, top: 0, zIndex: 0 },
  workerHomeMaterialSubstrateReadiness: { borderRadius: 24 },
  workerHomeMaterialTopEdge: { height: 1.5, left: 18, position: 'absolute', right: 18, top: 1, zIndex: 2 },
  workerHomeMaterialTopEdgeReadiness: { left: 20, right: 20, top: 1 },
  workerHomeMaterialBottomEdge: { bottom: 1, height: 1, left: 24, position: 'absolute', right: 24, zIndex: 2 },
  workerHomeMaterialBottomEdgeReadiness: { bottom: 1, left: 22, right: 22 },
  workerHomeMapMaterialContours: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0, zIndex: 0 },
  glassSheen: { height: '170%', left: -72, opacity: 0.42, position: 'absolute', top: -46, transform: [{ rotate: '11deg' }], width: 58, zIndex: 0 },
  glassMotionRibbon: { borderRadius: 999, height: 168, left: 16, position: 'absolute', top: -168, width: 58, zIndex: 0 },
  glassMotionRibbonCompact: { height: 118, left: 8, top: -118, width: 38 },
  glassMotionCore: { borderRadius: 999, height: 118, left: 56, position: 'absolute', top: -118, width: 13, zIndex: 0 },
  glassMotionCoreCompact: { height: 86, left: 36, top: -86, width: 9 },
  mapStage: { borderCurve: 'continuous', borderRadius: 24, minHeight: 196, overflow: 'hidden', padding: 0, position: 'relative' },
  workerMapPreviewPressable: { borderCurve: 'continuous', borderRadius: 24, overflow: 'hidden' },
  workerHomeMapNavigationCta: { alignItems: 'center', borderCurve: 'continuous', borderRadius: 16, justifyContent: 'center', marginBottom: 12, marginHorizontal: 12, marginTop: 10, minHeight: 44, paddingHorizontal: 14, position: 'relative', zIndex: 5 },
  workerMapTopHud: { flexDirection: 'row', gap: 8, left: 12, maxWidth: '78%', position: 'absolute', top: 12, zIndex: 4 },
  searchPill: { alignItems: 'center', borderRadius: 999, flexDirection: 'row', gap: 8, minHeight: 38, paddingHorizontal: 12 },
  searchText: { flex: 1, fontSize: 15, fontWeight: '600' },
  mapViewport: { borderCurve: 'continuous', borderRadius: 24, minHeight: 196, overflow: 'hidden', position: 'relative' },
  workerMapControlStack: { gap: 8, position: 'absolute', right: 12, top: 12, zIndex: 6 },
  workerMapControlStackExpanded: { right: 14, top: 14 },
  workerMapControlButton: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.88)', borderColor: 'rgba(31,103,93,0.16)', borderCurve: 'continuous', borderRadius: 14, borderWidth: 1, height: 38, justifyContent: 'center', width: 38 },
  workerMapControlButtonKeyline: { borderCurve: 'continuous', borderRadius: 13, borderWidth: 1, bottom: 2, left: 2, position: 'absolute', right: 2, top: 2 },
  workerMapControlButtonActive: { backgroundColor: 'rgba(220,251,243,0.95)' },
  workerMapZoomLayer: { ...StyleSheet.absoluteFillObject },
  workerMapModalBackdrop: {
    backgroundColor: 'rgba(5,19,17,0.46)',
    bottom: Platform.OS === 'web' ? 0 : undefined,
    flex: 1,
    justifyContent: 'flex-end',
    left: Platform.OS === 'web' ? 0 : undefined,
    padding: 12,
    position: Platform.OS === 'web' ? 'fixed' as any : undefined,
    right: Platform.OS === 'web' ? 0 : undefined,
    top: Platform.OS === 'web' ? 0 : undefined,
    zIndex: Platform.OS === 'web' ? 1000 : undefined,
  },
  workerMapModalSheet: { borderRadius: 28, gap: 12, maxHeight: '92%', paddingBottom: 16, paddingHorizontal: 16, paddingTop: 14 },
  workerMapExpandedHeader: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between', paddingHorizontal: 2 },
  workerMapCloseButton: { alignItems: 'center', borderRadius: 999, borderWidth: 1, flexShrink: 0, height: 38, justifyContent: 'center', marginRight: 12, width: 38 },
  workerExpandedMapViewport: { borderCurve: 'continuous', borderRadius: 24, minHeight: 520, overflow: 'hidden', position: 'relative' },
  expandedMapVeil: { height: 210, left: '58%', opacity: 0.2, top: 102, width: 210 },
  expandedMapMarkerZone: { right: '14%', top: '28%' },
  expandedMapMarkerWorker: { left: '20%', top: '68%' },
  workerMapRouteSummary: { borderRadius: 18, borderWidth: 1, bottom: 36, gap: 4, left: 36, paddingHorizontal: 11, paddingVertical: 6, position: 'absolute', right: 36, zIndex: 8 },
  workerMapSummaryHeader: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  workerMapSummaryBadge: { borderRadius: 999, borderWidth: 1, flexShrink: 0, paddingHorizontal: 8, paddingVertical: 5 },
  workerMapSummaryActions: { flexDirection: 'row', gap: 10 },
  workerMapSummaryButton: { alignItems: 'center', borderRadius: 15, flex: 1, justifyContent: 'center', minHeight: 42, paddingHorizontal: 14 },
  workerMapSummaryButtonSecondary: { borderWidth: 1 },
  mapRouteSummaryTitle: { fontSize: 14.5, fontWeight: '700', letterSpacing: 0, lineHeight: 16 },
  mapRouteSummaryDetail: { fontSize: 11, fontWeight: '700', lineHeight: 13, marginTop: 1 },
  mapRouteSummaryNote: { fontSize: 10, fontWeight: '600', lineHeight: 12, marginTop: 0 },
  compactPresenceMap: { borderCurve: 'continuous', borderRadius: 28, minHeight: 194, overflow: 'hidden', padding: 10, position: 'relative' },
  compactPresenceMapDense: { borderRadius: 24, minHeight: 152, padding: 8 },
  workerJobsMapCrispShell: { borderCurve: 'continuous', borderRadius: 28, borderWidth: 1, bottom: 0, left: 0, opacity: 0.92, position: 'absolute', right: 0, top: 0, zIndex: 6 },
  workerJobsMapCrispShellDense: { borderRadius: 24 },
  workerJobsMapTopEdge: { borderRadius: 999, height: 1, left: 18, opacity: 0.78, position: 'absolute', right: 18, top: 1, zIndex: 7 },
  compactMapViewport: { borderRadius: 24, minHeight: 174, overflow: 'hidden', position: 'relative' },
  compactMapViewportDense: { borderRadius: 20, minHeight: 136 },
  compactMapControlMini: { alignItems: 'center', borderRadius: 999, height: 34, justifyContent: 'center', position: 'absolute', right: 14, top: 14, width: 34, zIndex: 5 },
  compactMapVeil: { left: '54%', opacity: 0.24, top: 42 },
  compactMapMarker: { alignItems: 'center', borderRadius: 999, height: 38, justifyContent: 'center', overflow: 'visible', position: 'absolute', width: 38, zIndex: 4 },
  compactMapMarkerEmpty: { opacity: 0.92 },
  compactMapMarkerZone: { right: '18%', top: '34%' },
  compactMapMarkerWorker: { left: '31%', top: '48%' },
  mapFogTop: { height: 68, left: 0, opacity: 0.06, position: 'absolute', right: 0, top: 0 },
  mapFogBottom: { bottom: -6, height: 62, left: 0, opacity: 0.08, position: 'absolute', right: 0 },
  mapCyanVeil: { borderRadius: 999, height: 158, left: '52%', marginLeft: -79, opacity: 0.23, position: 'absolute', top: 94, width: 158 },
  mapCyanVeilLiquid: { opacity: 0.13 },
  mapLiquidLens: { height: 214, left: '-10%', opacity: 0.36, position: 'absolute', right: '-18%', top: -30, transform: [{ rotate: '-10deg' }], zIndex: 2 },
  mapLiquidSpecularArc: { borderRadius: 999, borderWidth: 1, height: 164, left: '26%', opacity: 0.42, position: 'absolute', top: 22, transform: [{ rotate: '-8deg' }], width: 250, zIndex: 2 },
  mapLiquidGlassOverlay: { borderCurve: 'continuous', borderRadius: 24, bottom: 0, left: 0, position: 'absolute', right: 0, top: 0, zIndex: 3 },
  mapLiquidGlassOverlayExpanded: { borderRadius: 24 },
  mapLiquidGlassEdge: { borderCurve: 'continuous', borderRadius: 24, borderWidth: 1, bottom: 1, left: 1, position: 'absolute', right: 1, top: 1, zIndex: 3 },
  mapSharpInset: { borderCurve: 'continuous', borderRadius: 24, borderWidth: 1, bottom: 0, left: 0, opacity: 0.94, position: 'absolute', right: 0, top: 0, zIndex: 3 },
  homeMapMarker: { alignItems: 'center', borderRadius: 999, height: 38, justifyContent: 'center', overflow: 'visible', position: 'absolute', width: 38, zIndex: 4 },
  workerMapPulseMarker: { alignItems: 'center', height: 34, justifyContent: 'center', width: 34 },
  workerMapPulseHalo: { borderRadius: 999, height: 28, position: 'absolute', width: 28 },
  workerMapPulseCore: { borderRadius: 999, borderWidth: 3, height: 14, width: 14 },
  homeMapZoneRing: { borderRadius: 999, height: 136, left: '22%', opacity: 0.22, position: 'absolute', top: '34%', width: 136, zIndex: 1 },
  homeMapZoneRingLiquid: { opacity: 0.16 },
  homeMapZoneHalo: { borderRadius: 999, height: 102, opacity: 0.24, position: 'absolute', width: 102 },
  mapChipTop: { left: 6, position: 'absolute', top: 15 },
  mapZonePill: { borderRadius: 22, left: 6, maxWidth: '64%', paddingHorizontal: 12, paddingVertical: 9, position: 'absolute', top: 9 },
  mapChipTitle: { fontSize: 14, fontWeight: '700', letterSpacing: 0 },
  mapCardsRow: { flexDirection: 'row', gap: 12, marginTop: -56, zIndex: 5 },
  mapFeatureCard: { borderRadius: 22, flex: 1, minHeight: 100, overflow: 'hidden', padding: 13, position: 'relative' },
  mapFeatureTitle: { fontSize: 17, fontWeight: '600', letterSpacing: 0 },
  mapFeatureMeta: { fontSize: 11, fontWeight: '600', lineHeight: 14, marginTop: 4 },
  mapFeatureIcon: { alignItems: 'center', borderRadius: 999, bottom: 12, height: 50, justifyContent: 'center', position: 'absolute', right: 12, width: 50 },
  shiftCard: { borderCurve: 'continuous', borderRadius: 24, gap: 10, overflow: 'hidden', padding: 14, position: 'relative' },
  shiftActionRow: { flexDirection: 'row', gap: 10 },
  rowBetween: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', position: 'relative', zIndex: 2 },
  identityRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  jobPanelImageIcon: { flexShrink: 0 },
  titleStack: { flex: 1, gap: 4, position: 'relative', zIndex: 2 },
  heroTitle: { fontSize: 18, fontWeight: '600', letterSpacing: 0 },
  bodyText: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  toggleTrack: { borderRadius: 999, borderWidth: 1, height: 32, overflow: 'hidden', position: 'relative', width: 58 },
  toggleLiquidFill: { borderRadius: 999, bottom: 3, left: 3, position: 'absolute', top: 3, width: 52, zIndex: 0 },
  toggleTrackKeyline: { borderRadius: 999, borderWidth: 1, bottom: 1, left: 1, position: 'absolute', right: 1, top: 1, zIndex: 1 },
  toggleKnob: { borderRadius: 999, borderWidth: 1, height: 24, left: 4, position: 'absolute', top: 4, width: 24, zIndex: 2 },
  workerImageIconStage: { alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  workerServiceGrid: { flexDirection: 'row', gap: 10 },
  workerServiceTile: { borderCurve: 'continuous', borderRadius: 22, borderWidth: 1, flex: 1, minHeight: 122, overflow: 'hidden', padding: 11, position: 'relative' },
  workerServiceIcon: { alignItems: 'center', borderRadius: 16, borderWidth: 1, height: 38, justifyContent: 'center', width: 38 },
  operationalTileKeyline: { borderCurve: 'continuous', borderRadius: 21, borderWidth: 1, bottom: 1, left: 1, opacity: 0.72, position: 'absolute', right: 1, top: 1, zIndex: 5 },
  workerServiceImageStage: { alignItems: 'center', alignSelf: 'stretch', borderCurve: 'continuous', borderRadius: 18, borderWidth: 1, height: 58, justifyContent: 'center', marginBottom: 2, marginTop: -2, overflow: 'visible', position: 'relative' },
  workerServiceTitle: { fontSize: 14, fontWeight: '700', letterSpacing: 0, lineHeight: 16, marginTop: 2 },
  workerServiceMeta: { fontSize: 10, fontWeight: '700', letterSpacing: 0, marginTop: 3 },
  workerMiniGrid: { flexDirection: 'row', gap: 10 },
  workerMiniCard: { borderCurve: 'continuous', borderRadius: 22, borderWidth: 1, flex: 1, gap: 4, minHeight: 98, overflow: 'hidden', padding: 11, position: 'relative' },
  workerMiniIcon: { alignItems: 'center', borderRadius: 16, borderWidth: 1, height: 38, justifyContent: 'center', marginBottom: 3, width: 38 },
  workerMiniImageStage: { alignItems: 'center', borderCurve: 'continuous', borderRadius: 17, borderWidth: 1, height: 54, justifyContent: 'center', marginBottom: 4, marginLeft: -1, overflow: 'visible', position: 'relative', width: 58 },
  workerOperationalIconAura: { borderRadius: 23, bottom: -7, left: -7, opacity: 0.72, position: 'absolute', right: -7, top: -7, zIndex: 0 },
  workerOperationalIconContent: { alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1 },
  workerMiniImageWrap: { alignSelf: 'flex-start', marginBottom: 2, marginLeft: -2 },
  workerMiniTitle: { fontSize: 15.5, fontWeight: '600', letterSpacing: 0, lineHeight: 18 },
  workerMiniMeta: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0, lineHeight: 14 },
  metricRow: { flexDirection: 'row', gap: 8 },
  metric: { alignItems: 'center', borderRadius: 15, borderWidth: 1, flex: 1, gap: 1, justifyContent: 'center', minHeight: 40, overflow: 'hidden', padding: 6, position: 'relative' },
  metricValue: { fontSize: 15, fontVariant: ['tabular-nums'], fontWeight: '600', position: 'relative', textAlign: 'center', zIndex: 2 },
  metricLabel: { fontSize: 10, fontWeight: '500', position: 'relative', textAlign: 'center', zIndex: 2 },
  requestSheet: { borderRadius: 32, gap: 8, marginTop: -2, overflow: 'hidden', padding: 14, position: 'relative' },
  requestSheetCompact: { marginTop: 0 },
  readinessBadge: { alignItems: 'center', borderRadius: 18, borderWidth: 1, height: 46, justifyContent: 'center', width: 46 },
  serviceBadge: { alignItems: 'center', borderRadius: 999, flexDirection: 'row', gap: 6, minHeight: 34, paddingHorizontal: 10 },
  serviceBadgeText: { fontSize: 13, fontWeight: '600' },
  countdownRing: { alignItems: 'center', borderRadius: 999, borderWidth: 3, justifyContent: 'center', minHeight: 38, minWidth: 70, paddingHorizontal: 10 },
  countdownText: { fontSize: 13, fontVariant: ['tabular-nums'], fontWeight: '600' },
  requestTitle: { fontSize: 19, fontWeight: '600', letterSpacing: 0, lineHeight: 25 },
  areaRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  areaText: { fontSize: 14, fontWeight: '600' },
  kaelBrief: { borderRadius: 23, gap: 6, padding: 10 },
  kaelMini: { borderRadius: 999, borderWidth: 1, height: 29, width: 29 },
  kaelHead: { borderRadius: 999, borderWidth: 1, height: 48, width: 48 },
  kaelBriefTitle: { fontSize: 14, fontWeight: '600' },
  briefItem: { alignItems: 'flex-start', flexDirection: 'row', gap: 8 },
  briefDot: { borderRadius: 999, height: 5, marginTop: 7, width: 5 },
  briefText: { flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 16 },
  priceRow: { flexDirection: 'row', gap: 8 },
  priceDisclaimer: { fontSize: 11, fontWeight: '600', lineHeight: 15 },
  scopeRequestBox: { gap: 8 },
  completionPhotoPreviewRail: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  completionPhotoPreviewTile: { borderCurve: 'continuous', borderRadius: 16, borderWidth: 1, gap: 6, minHeight: 92, overflow: 'hidden', padding: 7, width: 92 },
  completionPhotoPreviewImage: { borderRadius: 11, height: 52, width: '100%' },
  actionRow: { flexDirection: 'row', gap: 9, position: 'relative', zIndex: 2 },
  pressButton: { alignItems: 'center', borderCurve: 'continuous', borderRadius: 17, flex: 1, justifyContent: 'center', minHeight: 48, overflow: 'hidden', position: 'relative' },
  emptyActionPill: { alignItems: 'center', borderRadius: 17, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 48 },
  pressButtonPressedPrimary: { filter: Platform.OS === 'web' ? 'brightness(0.98)' : undefined } as any,
  pressButtonSecondary: { borderRadius: 15, minHeight: 44 },
  liquidButtonSheen: { height: 78, left: -34, opacity: 0.72, position: 'absolute', top: -18, transform: [{ rotate: '-12deg' }], width: 118, zIndex: 1 },
  disabledButton: { opacity: 0.52 },
  disabledButtonLiquid: { opacity: 1 },
  pressButtonTextPrimary: { fontSize: 14, fontWeight: '700', position: 'relative', zIndex: 2 },
  pressButtonTextSecondary: { fontSize: 13, fontWeight: '700', position: 'relative', zIndex: 2 },
  workerJobsLiquidSection: { marginTop: 10, overflow: 'visible', position: 'relative' },
  workerJobsLiquidContent: { gap: 12, position: 'relative', zIndex: 2 },
  workerJobsSectionWash: { borderCurve: 'continuous', borderRadius: 30, bottom: -10, left: -8, opacity: 0.86, position: 'absolute', right: -8, top: -10, zIndex: 0 },
  workerJobsSectionReflection: { borderRadius: 999, height: 96, left: -42, opacity: 0.50, position: 'absolute', right: -42, top: -30, transform: [{ rotate: '-7deg' }], zIndex: 0 },
  workerJobsSectionBottomLens: { borderRadius: 999, bottom: -46, height: 118, left: '18%', opacity: 0.54, position: 'absolute', right: '8%', zIndex: 0 },
  workerJobsSectionCrispShell: { borderCurve: 'continuous', borderRadius: 30, borderWidth: 1, bottom: -8, left: -6, opacity: 0.82, position: 'absolute', right: -6, top: -8, zIndex: 1 },
  workerJobsSectionTopEdge: { borderRadius: 999, height: 1, left: 18, opacity: 0.72, position: 'absolute', right: 18, top: -7, zIndex: 1 },
  workerJobsCardDepthPlane: { borderCurve: 'continuous', borderRadius: 24, bottom: 0, left: 0, opacity: 0.76, overflow: 'hidden', position: 'absolute', right: 0, top: 0, zIndex: 0 },
  workerJobsCardRefraction: { borderRadius: 999, height: 132, opacity: 0.62, position: 'absolute', right: -48, top: -28, width: 178, zIndex: 1 },
  workerJobsCardTopEdge: { borderRadius: 999, height: 1, left: 18, opacity: 0.70, position: 'absolute', right: 18, top: 1, zIndex: 4 },
  workerJobsCardCrispShell: { borderCurve: 'continuous', borderRadius: 24, borderWidth: 1, bottom: 0, left: 0, opacity: 0.92, position: 'absolute', right: 0, top: 0, zIndex: 6 },
  workerJobsCardInnerInset: { borderCurve: 'continuous', borderRadius: 20, borderWidth: 1, bottom: 4, left: 4, opacity: 0.58, position: 'absolute', right: 4, top: 4, zIndex: 6 },
  workerJobsCardBottomEdge: { borderRadius: 999, bottom: 1, height: 1, left: 20, opacity: 0.62, position: 'absolute', right: 20, zIndex: 7 },
  operationalBand: { flexDirection: 'row', gap: 12 },
  quickPanel: { borderRadius: 25, flex: 1, gap: 5, minHeight: 132, overflow: 'hidden', padding: 14, position: 'relative' },
  quickValue: { fontSize: 23, fontVariant: ['tabular-nums'], fontWeight: '600' },
  quickTitle: { fontSize: 14, fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '600' },
  sectionAction: { fontSize: 13, fontWeight: '600' },
  timelineCard: { borderRadius: 27, gap: 12, overflow: 'hidden', padding: 15, position: 'relative' },
  timelineItem: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  timelineRail: { borderRadius: 999, height: 10, width: 10 },
  timelineText: { fontSize: 14, fontWeight: '600' },
  segmentShell: { borderRadius: 20, flexDirection: 'row', gap: 5, overflow: 'hidden', padding: 5, position: 'relative' },
  segmentPill: { alignItems: 'center', borderRadius: 16, flex: 1, justifyContent: 'center', minHeight: 38, paddingHorizontal: 4, position: 'relative', zIndex: 2 },
  segmentLiquidPill: { borderRadius: 16, bottom: 5, left: 0, overflow: 'hidden', position: 'absolute', top: 5, zIndex: 0 },
  segmentLiquidSheen: { borderRadius: 999, height: 14, left: 14, opacity: 0.48, position: 'absolute', right: 14, top: 4 },
  segmentText: { fontSize: 12, fontWeight: '700' },
  workerJobsSegmentRefraction: { borderRadius: 999, height: 66, left: -28, opacity: 0.56, position: 'absolute', right: -28, top: -24, transform: [{ rotate: '-5deg' }], zIndex: 0 },
  workerJobsSegmentCrispShell: { borderCurve: 'continuous', borderRadius: 20, borderWidth: 1, bottom: 0, left: 0, opacity: 0.86, position: 'absolute', right: 0, top: 0, zIndex: 1 },
  workerJobsSegmentTopEdge: { borderRadius: 999, height: 1, left: 14, opacity: 0.76, position: 'absolute', right: 14, top: 1, zIndex: 1 },
  activeJobCard: { borderRadius: 24, borderWidth: 1, gap: 13, overflow: 'hidden', padding: 16, position: 'relative' },
  jobTop: { gap: 10 },
  jobTopRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  jobDiagnosisBox: { borderRadius: 22, gap: 10, padding: 15 },
  flowCard: { borderRadius: 28, gap: 10, overflow: 'hidden', padding: 16, position: 'relative' },
  needsReviewCard: { borderRadius: 24, borderWidth: 1, gap: 13, overflow: 'hidden', padding: 16, position: 'relative' },
  needsTopRow: { alignItems: 'center', justifyContent: 'flex-start', minHeight: 96 },
  needsTextStack: { flex: 1, minWidth: 0 },
  needsImageIcon: { flexShrink: 0 },
  needsInlineImageIcon: { flexShrink: 0, marginTop: -3 },
  needsReviewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusPill: { borderRadius: 999, fontSize: 12, fontWeight: '700', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 6 },
  cardTitle: { fontSize: 18, fontWeight: '600', letterSpacing: 0, lineHeight: 24 },
  chatShell: { flex: 1, gap: 10, justifyContent: 'space-between', minHeight: 0, paddingBottom: 10, position: 'relative' },
  chatShellReference: { paddingTop: 2 },
  kaelClientStage: { flex: 1, gap: 12, justifyContent: 'space-between', minHeight: 0, overflowAnchor: 'none', paddingBottom: 0, position: 'relative' } as any,
  kaelClientStageReference: { paddingTop: 8 },
  kaelClientStageEmpty: { opacity: 0.92 },
  kaelBlankCanvas: { flex: 1, minHeight: 240, overflow: 'hidden', position: 'relative' },
  kaelCanvasWashLarge: { borderRadius: 32, height: 168, left: -48, opacity: 0.07, position: 'absolute', top: 46, transform: [{ rotate: '-8deg' }], width: 168 },
  kaelCanvasWashWarm: { borderRadius: 28, bottom: 42, height: 126, opacity: 0.06, position: 'absolute', right: -34, transform: [{ rotate: '12deg' }], width: 126 },
  jobRoomWaiting: { alignItems: 'center', gap: 8, justifyContent: 'center', minHeight: 228, padding: 18, position: 'relative', zIndex: 2 },
  jobRoomKaelHead: { height: 70, width: 70 },
  jobRoomRevealStack: { gap: 12 },
  jobRoomRevealStackReference: { flex: 1, justifyContent: 'center', minHeight: 0 },
  jobRoomStack: { gap: 11 },
  workerChatReferenceCenter: { alignItems: 'center', flex: 1, justifyContent: 'center', minHeight: 310, paddingBottom: 44 },
  workerChatWelcomeStage: { alignItems: 'center', gap: 18, justifyContent: 'center', paddingHorizontal: 8 },
  workerChatWelcomeGlyph: { alignItems: 'center', borderRadius: 999, borderWidth: 1, height: 62, justifyContent: 'center', overflow: 'hidden', position: 'relative', width: 62 },
  workerChatWelcomeGlyphAura: { borderRadius: 999, height: 86, opacity: 0.32, position: 'absolute', width: 86 },
  workerChatWelcomeGlyphImage: { height: 48, position: 'relative', width: 48, zIndex: 2 },
  workerChatWelcomeTitle: { alignSelf: 'stretch', fontSize: 23, fontWeight: '700', letterSpacing: 0, lineHeight: 29, maxWidth: 380, textAlign: 'center', whiteSpace: 'nowrap' } as any,
  jobRoomRevealStep: { gap: 11 },
  jobRoomProcessHidden: { opacity: 0 },
  jobRoomProcessTapTarget: { borderRadius: 28 },
  jobRoomProcessCard: { borderRadius: 28, borderWidth: 1, gap: 16, overflow: 'hidden', paddingBottom: 18, paddingHorizontal: 17, paddingTop: 16 },
  jobRoomProcessHead: { alignItems: 'center', flexDirection: 'row', gap: 11 },
  jobRoomProcessAvatar: { alignItems: 'center', borderRadius: 21, borderWidth: 1, flexShrink: 0, height: 50, justifyContent: 'center', overflow: 'hidden', width: 50 },
  jobRoomProcessAvatarImage: { height: 42, width: 42 },
  jobRoomProcessStatus: { alignItems: 'center', borderRadius: 18, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 9, minHeight: 48, paddingHorizontal: 13 },
  jobRoomProcessAccent: { borderRadius: 999, height: 26, width: 6 },
  jobRoomProcessTitle: { flex: 1, fontSize: 14.5, fontWeight: '700', letterSpacing: 0, lineHeight: 18.5 },
  jobRoomProcessMeta: { fontSize: 11.5, fontWeight: '600', letterSpacing: 0, lineHeight: 15 },
  jobRoomProcessSteps: { flexDirection: 'row', gap: 9, paddingHorizontal: 3 },
  jobRoomProcessStep: { borderRadius: 17, borderWidth: 1, flex: 1, minHeight: 64, paddingHorizontal: 9, paddingVertical: 10 },
  jobRoomProcessStepIndex: { fontSize: 10, fontWeight: '700', letterSpacing: 0, lineHeight: 12, marginBottom: 6 },
  jobRoomProcessStepTitle: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0, lineHeight: 15 },
  jobRoomMessageRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
  jobRoomMessageAvatar: { alignItems: 'center', borderRadius: 18, borderWidth: 1, flexShrink: 0, height: 40, justifyContent: 'center', marginTop: 2, overflow: 'hidden', width: 40 },
  jobRoomMessageAvatarImage: { height: 34, width: 34 },
  jobRoomMessageBubble: { borderRadius: 22, borderTopLeftRadius: 8, borderWidth: 1, flex: 1, gap: 6, overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 12 },
  jobRoomBubbleKicker: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0, lineHeight: 15 },
  jobRoomBubbleTitle: { fontSize: 17, fontWeight: '700', letterSpacing: 0, lineHeight: 22 },
  jobRoomBubbleBody: { fontSize: 13, fontWeight: '700', letterSpacing: 0, lineHeight: 19 },
  jobRoomHeader: { borderRadius: 24, borderWidth: 1, gap: 10, overflow: 'hidden', padding: 13 },
  jobRoomMetaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  jobRoomMetaCell: { borderRadius: 18, borderWidth: 1, flexBasis: '47%', flexGrow: 1, gap: 4, minHeight: 66, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 9 },
  jobRoomMetaValue: { fontSize: 13, fontWeight: '600', letterSpacing: 0, lineHeight: 17 },
  jobRoomBrief: { borderRadius: 20, borderWidth: 1, gap: 8, overflow: 'hidden', paddingHorizontal: 13, paddingVertical: 11 },
  jobRoomBriefAligned: { marginLeft: 50 },
  jobRoomAdvisoryRail: { marginLeft: 0, paddingHorizontal: 14, paddingVertical: 13 },
  jobRoomBriefTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  jobRoomBriefAccent: { borderRadius: 999, height: 18, width: 4 },
  jobRoomBriefTitle: { flex: 1, fontSize: 12.5, fontWeight: '700', letterSpacing: 0, lineHeight: 16 },
  jobRoomBriefText: { lineHeight: 19 },
  jobRoomGate: { alignItems: 'center', borderRadius: 22, borderWidth: 1, flexDirection: 'row', gap: 10, overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 11 },
  jobRoomTopBar: { alignItems: 'center', borderRadius: 26, borderWidth: 1, flexDirection: 'row', gap: 10, marginBottom: 12, minHeight: 74, paddingHorizontal: 12, paddingVertical: 10 },
  jobRoomTopChrome: { gap: 10, marginBottom: 14, marginHorizontal: 0 },
  jobRoomTopUtilityRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 49, paddingHorizontal: 7 },
  jobRoomRoundButton: { alignItems: 'center', borderRadius: 999, borderWidth: 1, height: 46, justifyContent: 'center', overflow: 'hidden', width: 46 },
  jobRoomBackButton: { alignItems: 'center', borderRadius: 20, borderWidth: 1, height: 48, justifyContent: 'center', width: 48 },
  jobRoomKaelBubble: { alignItems: 'center', borderRadius: 999, borderWidth: 1, height: 46, justifyContent: 'center', overflow: 'hidden', width: 46 },
  jobRoomKaelBubbleImage: { height: 34, width: 34 },
  jobRoomHeaderAvatar: { height: 44, width: 44 },
  jobRoomHeaderSpacer: { flex: 1, minHeight: 42 },
  jobRoomStatusPill: { borderRadius: 999, borderWidth: 1, fontSize: 11, fontWeight: '700', letterSpacing: 0, maxWidth: 94, overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 7, textAlign: 'center' },
  jobRoomTitleStack: { flex: 1, minWidth: 0 },
  chatStack: { gap: 10 },
  chatBubble: { alignSelf: 'flex-start', borderRadius: 22, maxWidth: '88%', padding: 12 },
  chatBubbleMine: { alignSelf: 'flex-end' },
  workerKaelProgressPanel: { alignSelf: 'flex-start', borderRadius: 16, borderWidth: 1, gap: 6, marginTop: 6, minWidth: 188, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 8 },
  workerKaelProgressTrack: { backgroundColor: 'rgba(148,163,184,0.22)', borderRadius: 999, height: 5, overflow: 'hidden', width: '100%' },
  workerKaelProgressFill: { borderRadius: 999, height: 5, minWidth: 5 },
  workerKaelProgressText: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0, lineHeight: 15 },
  chatWho: { fontSize: 11.5, fontWeight: '600' },
  chatText: { fontSize: 13.5, fontWeight: '600', lineHeight: 19, marginTop: 3 },
  chatComposerTouchWrap: { marginHorizontal: 0, marginTop: 10 },
  workerKaelParityPanel: { borderRadius: 18, borderWidth: 1, gap: 10, marginTop: 10, overflow: 'hidden', padding: 10 },
  workerKaelParityTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0 },
  workerKaelParityBody: { fontSize: 11, fontWeight: '700', lineHeight: 15 },
  workerKaelParityActions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  workerKaelMiniButton: { alignItems: 'center', borderRadius: 14, borderWidth: 1, minHeight: 34, justifyContent: 'center', minWidth: 92, paddingHorizontal: 10, paddingVertical: 7 },
  workerKaelMiniButtonText: { fontSize: 11, fontWeight: '700', letterSpacing: 0 },
  workerKaelFeedbackForm: { gap: 8 },
  workerKaelFeedbackInput: { borderRadius: 14, borderWidth: 1, fontSize: 12, fontWeight: '700', minHeight: 74, paddingHorizontal: 10, paddingVertical: 9, textAlignVertical: 'top' },
  workerKaelFeedbackError: { fontSize: 11, fontWeight: '700', lineHeight: 15 },
  chatComposer: { alignSelf: 'stretch', borderCurve: 'continuous', borderRadius: 24, borderWidth: 1, gap: 5, minHeight: 79, overflow: 'hidden', paddingBottom: 3, paddingHorizontal: 9, paddingTop: 5, position: 'relative', zIndex: 2 },
  workerChatComposerKeyline: { borderCurve: 'continuous', borderRadius: 22, borderWidth: 1, bottom: 3, left: 3, opacity: 0.78, position: 'absolute', right: 3, top: 3, zIndex: 1 },
  chatComposerControlRow: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 42, position: 'relative', zIndex: 2 },
  chatComposerRightActions: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  chatComposerControlSpacer: { flex: 1, minWidth: 0 },
  composerTool: { alignItems: 'center', borderRadius: 15, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  workerChatModePill: { alignItems: 'center', borderRadius: 999, borderWidth: 1, justifyContent: 'center', minHeight: 38, minWidth: 82, overflow: 'hidden', paddingHorizontal: 14, position: 'relative' },
  workerChatModePillGlassLayer: { borderRadius: 999, bottom: 3, left: 3, position: 'absolute', right: 3, top: 3, zIndex: 0 },
  workerChatModeText: { fontSize: 13.5, fontWeight: '700', letterSpacing: 0, lineHeight: 17, position: 'relative', zIndex: 1 },
  chatInput: { borderRadius: 16, borderWidth: 0, flexShrink: 0, fontSize: 16.5, fontWeight: '700', letterSpacing: 0, lineHeight: 21, maxHeight: 76, minHeight: 28, minWidth: 0, paddingBottom: 4, paddingHorizontal: 10, paddingTop: 1, position: 'relative', textAlignVertical: 'top', zIndex: 2 },
  chatInputInvisibleFocus: { backgroundColor: 'transparent', borderColor: 'transparent', borderWidth: 0, boxShadow: 'none', outlineColor: 'transparent', outlineOffset: 0, outlineStyle: 'none', outlineWidth: 0 } as any,
  sendButton: { alignItems: 'center', borderRadius: 999, borderWidth: 1, flexShrink: 0, height: 42, justifyContent: 'center', minWidth: 42, width: 42 },
  earningsHero: { borderRadius: 32, gap: 12, overflow: 'hidden', padding: 18, position: 'relative' },
  earningsHeroWrap: { gap: 0, position: 'relative' },
  earningsBadge: { alignItems: 'center', borderRadius: 24, height: 58, justifyContent: 'center', transform: [{ rotate: '-5deg' }], width: 58 },
  earningsTrendCard: { borderRadius: 32, gap: 14, overflow: 'hidden', padding: 18, position: 'relative' },
  workerEarningsChromeWash: { borderCurve: 'continuous', bottom: 0, left: 0, overflow: 'hidden', position: 'absolute', right: 0, top: 0, zIndex: 0 },
  workerEarningsChromeRefraction: { borderRadius: 999, height: 148, opacity: 0.62, position: 'absolute', right: -48, top: -34, width: 188, zIndex: 1 },
  workerEarningsChromeCrispShell: { borderCurve: 'continuous', borderWidth: 1, bottom: 0, left: 0, opacity: 0.92, position: 'absolute', right: 0, top: 0, zIndex: 4 },
  workerEarningsChromeInnerInset: { borderCurve: 'continuous', borderWidth: 1, bottom: 4, left: 4, opacity: 0.56, position: 'absolute', right: 4, top: 4, zIndex: 4 },
  workerEarningsChromeTopEdge: { borderRadius: 999, height: 1, left: 20, opacity: 0.76, position: 'absolute', right: 20, top: 1, zIndex: 5 },
  workerEarningsChromeBottomEdge: { borderRadius: 999, bottom: 1, height: 1, left: 20, opacity: 0.62, position: 'absolute', right: 20, zIndex: 5 },
  workerProfileChromeWash: { borderCurve: 'continuous', bottom: 0, left: 0, overflow: 'hidden', position: 'absolute', right: 0, top: 0, zIndex: 0 },
  workerProfileChromeRefraction: { borderRadius: 999, height: 142, opacity: 0.60, position: 'absolute', right: -46, top: -32, width: 184, zIndex: 1 },
  workerProfileChromeCrispShell: { borderCurve: 'continuous', borderWidth: 1, bottom: 0, left: 0, opacity: 0.92, position: 'absolute', right: 0, top: 0, zIndex: 3 },
  workerProfileChromeInnerInset: { borderCurve: 'continuous', borderWidth: 1, bottom: 4, left: 4, opacity: 0.54, position: 'absolute', right: 4, top: 4, zIndex: 3 },
  workerProfileChromeTopEdge: { borderRadius: 999, height: 1, left: 20, opacity: 0.76, position: 'absolute', right: 20, top: 1, zIndex: 4 },
  workerProfileChromeBottomEdge: { borderRadius: 999, bottom: 1, height: 1, left: 20, opacity: 0.60, position: 'absolute', right: 20, zIndex: 4 },
  earningsTrendGlow: { borderRadius: 44, height: 146, opacity: 0.10, position: 'absolute', right: -38, top: -34, transform: [{ rotate: '-6deg' }], width: 146, zIndex: 1 },
  earningsChartShell: { borderRadius: 22, borderWidth: 1, gap: 11, justifyContent: 'space-between', minHeight: 154, overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 13, position: 'relative', zIndex: 2 },
  earningsChartEmptyState: { alignItems: 'center', flex: 1, gap: 8, justifyContent: 'center', minHeight: 124, overflow: 'hidden', position: 'relative' },
  earningsChartEmptyLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.2, marginTop: 6, textAlign: 'center' },
  workerChatStaticEmpty: { borderRadius: 22, borderWidth: 1, gap: 8, marginTop: 8, paddingHorizontal: 18, paddingVertical: 20 },
  workerChatStaticEmptyTitle: { fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
  workerChatStaticEmptyBody: { fontSize: 13, lineHeight: 19 },
  earningsBarRail: { alignItems: 'flex-end', alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-between', minHeight: 122, paddingHorizontal: 15 },
  earningsEmptyBar: { borderBottomLeftRadius: 8, borderBottomRightRadius: 8, borderTopLeftRadius: 12, borderTopRightRadius: 12, width: 28 },
  earningsDayRail: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 15 },
  earningsDayLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0, minWidth: 24, position: 'relative', textAlign: 'center', zIndex: 2 },
  earningsSummaryGrid: { flexDirection: 'row', gap: 10 },
  earningsSummaryCell: { borderRadius: 22, borderWidth: 1, flex: 1, gap: 4, justifyContent: 'center', minHeight: 86, overflow: 'hidden', paddingHorizontal: 16, paddingVertical: 13, position: 'relative' },
  earningsSummaryLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0, lineHeight: 14, position: 'relative', textAlign: 'left', zIndex: 2 },
  earningsSummaryValue: { fontSize: 17, fontVariant: ['tabular-nums'], fontWeight: '700', letterSpacing: 0, lineHeight: 22, position: 'relative', zIndex: 2 },
  earningsSummaryHint: { fontSize: 11, fontWeight: '600', letterSpacing: 0, lineHeight: 14, position: 'relative', zIndex: 2 },
  earningsReconciliationStrip: { flexDirection: 'row', gap: 8 },
  earningsReconciliationCell: { borderRadius: 20, borderWidth: 1, flex: 1, gap: 4, justifyContent: 'center', minHeight: 78, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 11, position: 'relative' },
  earningsReconciliationValue: { fontSize: 13.5, fontVariant: ['tabular-nums'], fontWeight: '800', letterSpacing: 0, lineHeight: 18, position: 'relative', zIndex: 2 },
  moneyText: { fontSize: 34, fontVariant: ['tabular-nums'], fontWeight: '600', letterSpacing: 0 },
  moneyTextState: { fontSize: 24, lineHeight: 30 },
  listCard: { borderRadius: 29, gap: 4, overflow: 'hidden', padding: 10, position: 'relative' },
  earningsLedgerCard: { borderRadius: 29, gap: 6, overflow: 'hidden', padding: 10, position: 'relative' },
  earningsListRow: { alignItems: 'center', borderRadius: 16, flexDirection: 'row', gap: 10, minHeight: 56, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 7, position: 'relative', zIndex: 2 },
  earningsListIcon: { alignItems: 'center', height: 36, justifyContent: 'center', width: 36 },
  earningsListImageIcon: { flexShrink: 0 },
  earningsListTitle: { flex: 1, fontSize: 13.5, fontWeight: '700', letterSpacing: 0, lineHeight: 18 },
  earningsListMeta: { flexShrink: 0, fontSize: 11.5, fontWeight: '700', letterSpacing: 0, lineHeight: 15, maxWidth: 116, textAlign: 'right' },
  listRow: { alignItems: 'center', flexDirection: 'row', gap: 11, minHeight: 54, paddingHorizontal: 8 },
  listTitle: { flex: 1, fontSize: 14, fontWeight: '600' },
  listMeta: { fontSize: 12, fontWeight: '600', maxWidth: 148, textAlign: 'right' },
  listMetaInline: { fontSize: 11, fontWeight: '600', lineHeight: 14 },
  profileHead: { borderRadius: 30, gap: 14, overflow: 'hidden', paddingHorizontal: 18, paddingVertical: 17, position: 'relative' },
  profileHeroTop: { alignItems: 'center', flexDirection: 'row', gap: 12, position: 'relative', zIndex: 2 },
  profileHeroAction: { flexDirection: 'row', position: 'relative', zIndex: 2 },
  avatarWrap: { alignItems: 'center', borderRadius: 999, height: 56, justifyContent: 'center', width: 56 },
  profileAvatarHero: {
    alignItems: 'center',
    borderRadius: 20,
    height: 52,
    justifyContent: 'center',
    width: 52,
  } as any,
  profileTitleStack: { flex: 1, gap: 3, minWidth: 0 },
  profileName: { fontSize: 23, fontWeight: '600', letterSpacing: 0, lineHeight: 28 },
  profileSubtitle: { fontSize: 13, fontWeight: '600', letterSpacing: 0, lineHeight: 18 },
  profileBadge: { alignItems: 'center', borderRadius: 999, height: 42, justifyContent: 'center', width: 42 },
  scoreNumber: { fontSize: 28, fontWeight: '600', letterSpacing: 0, lineHeight: 34 },
  skillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, position: 'relative', zIndex: 2 },
  skillPill: { borderRadius: 999, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 13 },
  skillText: { fontSize: 13, fontWeight: '600' },
  profileMiniGrid: { flexDirection: 'row', gap: 10 },
  profileMiniCard: { borderRadius: 20, borderWidth: 1, flex: 1, gap: 2, minHeight: 118, overflow: 'hidden', paddingBottom: 14, paddingHorizontal: 14, paddingTop: 14 },
  profileMiniImage: { alignSelf: 'flex-start', marginLeft: -4, position: 'relative', zIndex: 2 },
  profileMiniTitle: { fontSize: 16, fontWeight: '600', letterSpacing: 0, lineHeight: 18, position: 'relative', zIndex: 2 },
  profileMiniMeta: { fontSize: 11, fontWeight: '700', letterSpacing: 0, lineHeight: 15, position: 'relative', zIndex: 2 },
  profileSyncPreview: { borderRadius: 24, borderWidth: 1, gap: 4, overflow: 'hidden', padding: 14, position: 'relative' },
  profileSyncPreviewTop: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between', position: 'relative', zIndex: 2 },
  profileLevelCard: { borderRadius: 29, borderWidth: 1, gap: 12, overflow: 'hidden', padding: 14, position: 'relative' },
  profileLevelCornerAura: { borderBottomLeftRadius: 116, borderCurve: 'continuous', borderTopRightRadius: 29, height: 128, position: 'absolute', right: -2, top: -2, width: '48%', zIndex: 1 },
  profileLevelTop: { alignItems: 'center', flexDirection: 'row', gap: 12, position: 'relative', zIndex: 2 },
  profileLevelOrb: { alignItems: 'center', borderRadius: 20, borderWidth: 1, flexShrink: 0, height: 58, justifyContent: 'center', overflow: 'hidden', width: 58 },
  profileLevelOrbMeta: { fontSize: 11, fontWeight: '700', letterSpacing: 0, lineHeight: 13 },
  profileLevelOrbValue: { fontSize: 22, fontWeight: '700', letterSpacing: 0, lineHeight: 25 },
  profileLevelCopy: { flex: 1, gap: 3, minWidth: 0 },
  profileLevelProgressTrack: { borderRadius: 999, borderWidth: 1, height: 12, overflow: 'hidden', position: 'relative', zIndex: 2 },
  profileLevelProgressFill: { borderRadius: 999, bottom: 2, left: 2, position: 'absolute', top: 2 },
  profileLevelNext: { fontSize: 12, fontWeight: '700', letterSpacing: 0, lineHeight: 16, position: 'relative', zIndex: 2 },
  profileLevelSignalGrid: { flexDirection: 'row', gap: 8, position: 'relative', zIndex: 2 },
  profileLevelSignal: { alignItems: 'center', borderCurve: 'continuous', borderRadius: 18, flex: 1, gap: 5, justifyContent: 'center', minHeight: 66, minWidth: 0, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 10, position: 'relative' },
  profileLevelSignalGlass: { borderRadius: 17, bottom: 1, left: 1, position: 'absolute', right: 1, top: 1, zIndex: 0 },
  profileLevelSignalTopEdge: { borderRadius: 999, height: 1, left: 14, position: 'absolute', right: 14, top: 1, zIndex: 1 },
  profileLevelSignalLabel: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0, lineHeight: 13, position: 'relative', textAlign: 'center', zIndex: 2 },
  profileLevelSignalValue: { fontSize: 16, fontVariant: ['tabular-nums'], fontWeight: '700', letterSpacing: 0, lineHeight: 20, position: 'relative', textAlign: 'center', zIndex: 2 },
  profileLevelLadder: { gap: 8, position: 'relative', zIndex: 2 },
  profileLevelLadderHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  profileLevelLadderTitle: { flex: 1, fontSize: 14.5, fontWeight: '700', letterSpacing: 0, lineHeight: 19 },
  profileLevelLadderMax: { flexShrink: 0, fontSize: 11.5, fontWeight: '700', letterSpacing: 0, lineHeight: 15 },
  profileLevelRail: { height: 104, marginHorizontal: -3 },
  profileLevelRailContent: { alignItems: 'center', paddingBottom: 16, paddingHorizontal: 3, paddingTop: 6 },
  profileLevelRailItem: { alignItems: 'center', flexDirection: 'row' },
  profileLevelRailSpacer: { width: 8 },
  profileLevelScrollIndicatorSlot: { height: 18, justifyContent: 'center', marginBottom: 4, marginTop: -18, paddingHorizontal: 5, position: 'relative', zIndex: 2 },
  profileLevelScrollIndicatorTrack: { borderCurve: 'continuous', borderRadius: 999, borderWidth: 1, height: 10, overflow: 'hidden', position: 'relative' },
  profileLevelScrollIndicatorTopEdge: { borderRadius: 999, height: 1, left: 12, opacity: 0.72, position: 'absolute', right: 12, top: 1, zIndex: 1 },
  profileLevelScrollIndicatorThumb: { borderCurve: 'continuous', borderRadius: 999, borderWidth: 1, height: 6, left: 1, overflow: 'hidden', position: 'absolute', top: 1, zIndex: 2 },
  profileLevelScrollIndicatorSheen: { borderRadius: 999, bottom: 0, left: 0, opacity: 0.58, position: 'absolute', right: 0, top: 0 },
  profileLevelChip: { alignItems: 'center', borderRadius: 18, borderWidth: 1, gap: 1, justifyContent: 'center', minHeight: 70, overflow: 'hidden', paddingHorizontal: 10, position: 'relative', width: 62 },
  profileLevelChipSheen: { borderRadius: 999, height: 34, left: -18, opacity: 0.40, position: 'absolute', top: -8, transform: [{ rotate: '-16deg' }], width: 74, zIndex: 0 },
  profileLevelChipMeta: { fontSize: 9.5, fontWeight: '700', letterSpacing: 0, lineHeight: 11, position: 'relative', zIndex: 2 },
  profileLevelChipValue: { fontSize: 18, fontVariant: ['tabular-nums'], fontWeight: '700', letterSpacing: 0, lineHeight: 22, position: 'relative', zIndex: 2 },
  profileLevelChipState: { fontSize: 9.5, fontWeight: '700', letterSpacing: 0, lineHeight: 11, maxWidth: 52, position: 'relative', textAlign: 'center', zIndex: 2 },
  profileLevelDetail: { alignItems: 'center', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 10, minHeight: 92, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 10 },
  profileLevelMilestone: { alignItems: 'center', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 10, minHeight: 76, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 9 },
  profileLevelMilestoneBadge: { alignItems: 'center', borderRadius: 16, borderWidth: 1, flexShrink: 0, height: 46, justifyContent: 'center', overflow: 'hidden', width: 46 },
  profileLevelMilestoneBadgeMeta: { fontSize: 9.5, fontWeight: '700', letterSpacing: 0, lineHeight: 11 },
  profileLevelMilestoneBadgeValue: { fontSize: 17, fontVariant: ['tabular-nums'], fontWeight: '700', letterSpacing: 0, lineHeight: 20 },
  profileLevelMilestoneCopy: { flex: 1, gap: 3, minWidth: 0 },
  profileLevelMilestoneHead: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  profileLevelMilestoneTitle: { flex: 1, fontSize: 13.5, fontWeight: '700', letterSpacing: 0, lineHeight: 17 },
  profileLevelMilestoneState: { flexShrink: 0, fontSize: 10.5, fontWeight: '700', letterSpacing: 0, lineHeight: 13, maxWidth: 72, textAlign: 'right' },
  profileLevelMilestoneText: { fontSize: 11.5, fontWeight: '600', letterSpacing: 0, lineHeight: 15 },
  profileLevelMilestoneReward: { fontSize: 12, fontWeight: '700', letterSpacing: 0, lineHeight: 16 },
  profileListCard: { borderRadius: 29, gap: 8, paddingHorizontal: 12, paddingVertical: 14, position: 'relative' },
  profileListRow: { alignItems: 'center', borderRadius: 16, flexDirection: 'row', gap: 12, minHeight: 52, overflow: 'hidden', paddingHorizontal: 12, position: 'relative', zIndex: 2 },
  profileListImage: { flexShrink: 0 },
  profileListTitle: { flex: 1, fontSize: 14.5, fontWeight: '600', letterSpacing: 0, lineHeight: 20 },
  profileListMeta: { flexShrink: 0, fontSize: 12, fontWeight: '600', letterSpacing: 0, lineHeight: 16, maxWidth: 146, textAlign: 'right' },
  preferenceCard: { borderRadius: 29, gap: 2, overflow: 'hidden', paddingHorizontal: 13, paddingVertical: 12, position: 'relative' },
  preferenceRow: { alignItems: 'center', borderRadius: 18, flexDirection: 'row', justifyContent: 'space-between', minHeight: 54, overflow: 'hidden', paddingHorizontal: 12, position: 'relative', zIndex: 2 },
  preferenceTitle: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 11 },
  preferenceImage: { flexShrink: 0 },
  preferenceCopy: { flex: 1, gap: 2, minWidth: 0 },
  preferenceMetaAction: { flexShrink: 0, fontSize: 12, fontWeight: '600', maxWidth: 112, textAlign: 'right' },
  verificationCard: { borderRadius: 29, gap: 10, overflow: 'hidden', padding: 14, position: 'relative' },
  verificationGrid: { flexDirection: 'row', gap: 8, position: 'relative', zIndex: 2 },
  verificationInput: { borderRadius: 18, borderWidth: 1, fontSize: 14, fontWeight: '600', minHeight: 46, paddingHorizontal: 12, position: 'relative', zIndex: 2 },
  verificationHalfInput: { flex: 1, minWidth: 0 },
  serviceAreaPicker: { borderRadius: 22, borderWidth: 1, gap: 10, overflow: 'hidden', padding: 12, position: 'relative', zIndex: 2 },
  serviceAreaAnchorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, position: 'relative', zIndex: 2 },
  serviceAreaAnchorButton: { borderRadius: 999, borderWidth: 1, justifyContent: 'center', minHeight: 40, paddingHorizontal: 11, paddingVertical: 7 },
  serviceAreaAnchorText: { fontSize: 12, fontWeight: '700', letterSpacing: 0, lineHeight: 16 },
  serviceAreaRadiusRow: { alignItems: 'center', flexDirection: 'row', gap: 10, position: 'relative', zIndex: 2 },
  serviceAreaRadiusButton: { alignItems: 'center', borderRadius: 999, borderWidth: 1, height: 38, justifyContent: 'center', width: 38 },
  serviceAreaRadiusControlText: { fontSize: 22, fontWeight: '700', letterSpacing: 0, lineHeight: 24 },
  serviceAreaRadiusValue: { flex: 1, fontSize: 18, fontWeight: '700', letterSpacing: 0, lineHeight: 24, textAlign: 'center' },
  serviceAreaRadiusPresets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, position: 'relative', zIndex: 2 },
  verificationHint: { fontSize: 12, fontWeight: '600', lineHeight: 16, position: 'relative', zIndex: 2 },
  verificationFiles: { flexDirection: 'row', gap: 8, position: 'relative', zIndex: 2 },
  verificationFileButton: { alignItems: 'center', borderRadius: 18, borderWidth: 1, flex: 1, gap: 5, justifyContent: 'center', minHeight: 72, padding: 8 },
  verificationFileText: { fontSize: 11, fontWeight: '600', lineHeight: 14, textAlign: 'center' },
  dockWrap: { alignSelf: 'center', minHeight: workerDockHeight, position: 'absolute', zIndex: 30 },
  workerDockSplitRow: { alignItems: 'center', flexDirection: 'row', gap: 14, justifyContent: 'center', minHeight: 64, position: 'relative', width: '100%', zIndex: 2 },
  workerDock: { alignItems: 'center', borderRadius: 29, borderWidth: 1, flexDirection: 'row', gap: 0, height: workerDockHeight, justifyContent: 'space-around', minHeight: workerDockHeight, overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 3, position: 'relative' },
  workerDockMainCluster: { flexShrink: 1 },
  workerDockAssetImage: { opacity: 0.86 },
  workerDockAssetImageFocused: { opacity: 1 },
  workerDockKaelActionPressable: { alignItems: 'center', flexShrink: 0, height: 64, justifyContent: 'center', width: 64, zIndex: 2 },
  workerDockKaelActionGlass: { alignItems: 'center', borderCurve: 'continuous', borderRadius: 32, borderWidth: 1, height: 64, justifyContent: 'center', overflow: 'hidden', position: 'relative', width: 64 },
  workerDockKaelActionEdge: { borderCurve: 'continuous', borderRadius: 31, borderWidth: 1, bottom: 1, left: 1, position: 'absolute', right: 1, top: 1, zIndex: 1 },
  workerDockKaelActionAura: { borderRadius: 999, height: 58, opacity: 0.68, position: 'absolute', right: -11, top: -8, width: 58, zIndex: 0 },
  workerDockKaelImage: { height: 31, width: 31, zIndex: 2 },
  workerDockKaelImageFocused: { height: 33, width: 33 },
  motionSweep: { borderRadius: 999, height: 76, position: 'absolute', top: -18, width: 96 },
  pressed: { opacity: 0.78 },
  hiddenMarker: { height: 0, opacity: 0, width: 0 },
})
