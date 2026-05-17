import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { createContext, type ReactNode, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { serviceLabel, statusLabel, type LocalDeal, type LocalDealStatus } from '@home-services/shared'
import { useAuth } from '@/lib/auth-provider'
import { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'

const WORKER_XANHSM_REFERENCE_AUDIT = 'WORKER_XANHSM_REFERENCE_AUDIT: XanhSM map shell translated into Home Services worker production UI'
const WORKER_PRODUCTION_CONTRACT = 'WORKER_PRODUCTION_CONTRACT: docs/design/worker-production-contract.md'
const WORKER_CLIENT_BASELINE_AUDIT = 'WORKER_CLIENT_BASELINE_AUDIT: customer V4 semantic layers matched for worker production'
const WORKER_THEME_LANGUAGE_STORE = 'WORKER_THEME_LANGUAGE_STORE: worker-theme-language-switch AsyncStorage useSyncExternalStore'
const WORKER_FLEXIBLE_MAP_SHELL = 'WORKER_FLEXIBLE_MAP_SHELL: worker-map-google-ready flexible-map-preview'
const WORKER_DOCK_GLASS_MOTION = 'WORKER_DOCK_GLASS_MOTION: worker-dock-glass-aura worker-dock-liquid-pool worker-dock-active-glow worker-dock-motion-sheen worker-dock-kael-brief-mascot worker-dock-icon-system'
const WORKER_GLASSMORPHISM_MOTION_LAYER = 'WORKER_GLASSMORPHISM_MOTION_LAYER: worker-glass-motion-layer animated-refraction-ribbon centered-metric-type'
const WORKER_CHATBOX_EMPTY_COMPOSER = 'WORKER_CHATBOX_EMPTY_COMPOSER: worker-kael-empty-chat-state worker-kael-local-chat-input submitWorkerKaelLocalDraft'
const WORKER_NO_FULL_ADDRESS_BEFORE_ACCEPT = 'WORKER_NO_FULL_ADDRESS_BEFORE_ACCEPT: general area only until worker accepts'
const WORKER_NO_FAKE_PAYMENT_DATA = 'WORKER_NO_FAKE_PAYMENT_DATA: worker-no-fake-payment-data'

const WORKER_THEME_STORAGE_KEY = 'home-services.worker.theme.production'
const WORKER_LANGUAGE_STORAGE_KEY = 'home-services.worker.language.production'
const workerDockHeight = 64
const workerDockBottomMargin = 8
const workerDockClearance = workerDockHeight + workerDockBottomMargin + 42
const workerFrameHorizontalPadding = 16
const kaelHead = require('../../assets/kael-model-8a-head.png')

export type WorkerThemeMode = 'dark' | 'light'
export type WorkerLanguageMode = 'en' | 'vi'

type WorkerActiveTab = 'chat' | 'earnings' | 'home' | 'jobs' | 'profile'
type WorkerTone = 'base' | 'cream' | 'cyan' | 'depth' | 'mint' | 'raised' | 'strong' | 'warm'
type WorkerIconName =
  | 'bank'
  | 'bolt'
  | 'brief'
  | 'chat'
  | 'check'
  | 'clock'
  | 'document'
  | 'globe'
  | 'home'
  | 'jobs'
  | 'map'
  | 'money'
  | 'moon'
  | 'person'
  | 'pin'
  | 'send'
  | 'shield'
  | 'spark'
  | 'sun'
  | 'tools'
  | 'water'
type WorkerChatMessage = { mine?: boolean; system?: boolean; text: string; who: string }

let lastWorkerDockActive: WorkerActiveTab = 'home'
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
  line: string
  mapLine: string
  mapBlock: string
  sheen: string
  shadow: string
  softShadow: string
}

const lightLayer: WorkerThemeTokens = {
  mode: 'light',
  canvas: '#F4FAF7',
  base: '#FFFDF8',
  raised: '#FFFFFF',
  strong: '#FBFFFC',
  depth: '#EAF6F1',
  mint: '#DCF3EC',
  cyan: '#E6F8F6',
  cream: '#FFF0DE',
  warm: '#FFF7EA',
  glass: 'rgba(255,255,255,0.58)',
  glassStrong: 'rgba(255,255,255,0.74)',
  glassBorder: 'rgba(255,255,255,0.82)',
  glassHighlight: 'rgba(255,255,255,0.70)',
  border: '#D2E8E1',
  borderStrong: '#A9D9CF',
  ink: '#102B2D',
  muted: '#667D7A',
  subtle: '#829A95',
  primary: '#08786E',
  primaryText: '#FFFFFF',
  aqua: '#51BBC0',
  copper: '#BB743D',
  line: '#D7E9E4',
  mapLine: '#C7DCD7',
  mapBlock: 'rgba(255,255,255,0.56)',
  sheen: 'rgba(255,255,255,0.64)',
  shadow: '0 20px 52px rgba(13,70,65,0.14)',
  softShadow: '0 12px 30px rgba(13,70,65,0.09)',
}

const darkLayer: WorkerThemeTokens = {
  mode: 'dark',
  canvas: '#071312',
  base: '#0D1D1B',
  raised: '#122622',
  strong: '#17342F',
  depth: '#102521',
  mint: '#163F36',
  cyan: '#12373A',
  cream: '#3B291B',
  warm: '#342719',
  glass: 'rgba(16,36,32,0.76)',
  glassStrong: 'rgba(22,43,38,0.9)',
  glassBorder: 'rgba(255,255,255,0.14)',
  glassHighlight: 'rgba(255,255,255,0.16)',
  border: '#254A43',
  borderStrong: '#3D7A6F',
  ink: '#EAFBF5',
  muted: '#A7C7C0',
  subtle: '#74A096',
  primary: '#69DEC6',
  primaryText: '#08201D',
  aqua: '#70D8DD',
  copper: '#E0A06B',
  line: '#1C3733',
  mapLine: '#2F5650',
  mapBlock: 'rgba(255,255,255,0.07)',
  sheen: 'rgba(255,255,255,0.16)',
  shadow: '0 26px 76px rgba(0,0,0,0.36)',
  softShadow: '0 14px 40px rgba(0,0,0,0.25)',
}

const workerCopy = {
  vi: {
    frame: { safe: 'An toàn', themeLight: 'Sáng', themeDark: 'Tối', lang: 'EN' },
    nav: { chat: 'Nhắn', earnings: 'Tiền', home: 'Nhà', jobs: 'Việc', profile: 'Hồ sơ' },
    home: {
      eyebrow: 'Thợ',
      title: 'Ca trực',
      mapSearch: 'Chờ deal local',
      mapTitle: 'Điện/nước chung cư',
      mapMeta: '--',
      electric: 'Điện',
      water: 'Nước',
      status: 'Trạng thái',
      online: 'Chờ duyệt hệ thống',
      today: 'Hôm nay',
      estimate: 'Tạm tính',
      rating: 'Phản hồi',
      shiftTitle: 'Nhịp xử lý',
      shiftAction: '',
      phases: ['Chờ duyệt', 'Nhận tóm tắt', 'Xác nhận', 'Di chuyển'],
      nextTitle: 'Lịch gần nhất',
      nextNote: 'Chỉ hiện khi Customer phát broadcast local.',
      moneyNote: 'Chờ đối soát, chưa đánh dấu thanh toán.',
      serviceHeading: '',
      electricianCard: 'Kỹ thuật điện',
      electricianNote: '',
      plumberCard: 'Hệ thống nước',
      plumberNote: '',
    },
    request: {
      service: 'Chờ duyệt',
      title: 'Chưa có yêu cầu mới',
      area: 'Khu vực chung',
      briefTitle: 'Tóm tắt Kael',
      brief: ['Chưa có yêu cầu mới từ khách.', 'Chỉ hiện thông tin thật khi có broadcast.'],
      customerEstimate: 'Khách ước tính',
      workerEarns: 'Thợ nhận',
      decline: 'Bỏ qua',
      accept: 'Chấp nhận',
    },
    jobs: {
      eyebrow: 'Công việc',
      title: 'Hàng đợi',
      filters: ['Chờ nhận', 'Đang làm', 'Cần xử lý'],
      emptyStatus: 'Đang theo dõi',
      emptyTitle: 'Chưa có việc đang làm',
      emptyBody: '',
      scopeStatus: 'Khách quyết định',
      scopeTitle: 'Thay đổi phạm vi',
      scopeBody: '',
    },
    chat: {
      eyebrow: 'Tin nhắn',
      title: 'Kael',
      briefTitle: 'Tóm tắt an toàn',
      briefBody: '',
      emptyTitle: 'Chưa có tin nhắn',
      emptyBody: '',
      input: 'Nhập...',
      send: 'Gửi',
      sampleWorker: 'Tôi có thể tới kiểm tra sau khi nhận yêu cầu.',
      sampleKael: 'Đã lưu phản hồi tại máy. Chưa gửi hệ thống và chưa mở địa chỉ chi tiết.',
      worker: 'Thợ',
      kael: 'Kael',
    },
    earnings: {
      eyebrow: 'Thu nhập',
      title: 'Đối soát',
      today: 'Tạm tính hôm nay',
      body: '',
      complete: 'Hoàn tất',
      waiting: 'Chờ khách',
      completeNote: 'Chưa có giao dịch thật.',
      waitingNote: 'Đang chờ xác nhận.',
      ledgerTitle: 'Sổ đối soát',
      rows: [
        ['Giao dịch local', 'Chưa có'],
        ['Tài khoản nhận tiền', 'Chưa lưu hệ thống'],
        ['Thanh toán & đánh giá', 'Đang khóa'],
      ],
    },
    profile: {
      eyebrow: 'Hồ sơ',
      title: 'Tin cậy',
      name: 'Hồ sơ thợ',
      body: '',
      scoreTitle: 'Tin cậy',
      scoreBody: '',
      theme: 'Giao diện',
      language: 'Ngôn ngữ',
      skills: ['Chờ duyệt hệ thống', 'Chưa có hồ sơ thật', 'Chờ phản hồi thật'],
      rows: [
        ['Xác minh danh tính', 'Chờ duyệt hệ thống'],
        ['Kỹ năng dịch vụ', 'Chưa lưu hệ thống'],
        ['Khu vực làm việc', 'Chưa lưu hệ thống'],
      ],
    },
  },
  en: {
    frame: { safe: 'Safe', themeLight: 'Light', themeDark: 'Dark', lang: 'VI' },
    nav: { chat: 'Chat', earnings: 'Pay', home: 'Home', jobs: 'Jobs', profile: 'Profile' },
    home: {
      eyebrow: 'Worker',
      title: 'Shift',
      mapSearch: 'Waiting for local deal',
      mapTitle: 'Apartment power/water',
      mapMeta: '--',
      electric: 'Power',
      water: 'Water',
      status: 'Status',
      online: 'System approval pending',
      today: 'Today',
      estimate: 'Estimate',
      rating: 'Rating',
      shiftTitle: 'Work rhythm',
      shiftAction: '',
      phases: ['Pending', 'Briefed', 'Confirm', 'Travel'],
      nextTitle: 'Next visit',
      nextNote: 'Appears after Customer creates a local broadcast.',
      moneyNote: 'Pending reconciliation, not marked paid.',
      serviceHeading: '',
      electricianCard: 'Electrical',
      electricianNote: '',
      plumberCard: 'Plumbing',
      plumberNote: '',
    },
    request: {
      service: 'Pending',
      title: 'No live request',
      area: 'General area',
      briefTitle: 'Kael brief',
      brief: ['Waiting for a real customer request.', 'Only real broadcast details are shown.'],
      customerEstimate: 'Customer estimate',
      workerEarns: 'Worker earns',
      decline: 'Skip',
      accept: 'Accept',
    },
    jobs: {
      eyebrow: 'Jobs',
      title: 'Queue',
      filters: ['Pending', 'Active', 'Needs review'],
      emptyStatus: 'Watching',
      emptyTitle: 'No active job',
      emptyBody: '',
      scopeStatus: 'Customer decides',
      scopeTitle: 'Scope change',
      scopeBody: '',
    },
    chat: {
      eyebrow: 'Chat',
      title: 'Kael',
      briefTitle: 'Safety brief',
      briefBody: '',
      emptyTitle: 'No messages yet',
      emptyBody: '',
      input: 'Type...',
      send: 'Send',
      sampleWorker: 'I can inspect this after accepting the request.',
      sampleKael: 'Reply saved on this device. No detailed address revealed.',
      worker: 'Worker',
      kael: 'Kael',
    },
    earnings: {
      eyebrow: 'Earnings',
      title: 'Reconcile',
      today: 'Today estimate',
      body: '',
      complete: 'Completed',
      waiting: 'Waiting',
      completeNote: 'No real transaction yet.',
      waitingNote: 'Waiting for confirmation.',
      ledgerTitle: 'Ledger',
      rows: [
        ['Local transaction', 'Empty'],
        ['Payout account', 'Not stored yet'],
        ['Payment & review', 'Locked'],
      ],
    },
    profile: {
      eyebrow: 'Profile',
      title: 'Trust',
      name: 'Worker profile',
      body: '',
      scoreTitle: 'Trust',
      scoreBody: '',
      theme: 'Theme',
      language: 'Language',
      skills: ['System pending', 'No real profile yet', 'Real feedback pending'],
      rows: [
        ['Identity verification', 'System pending'],
        ['Service skills', 'Not stored yet'],
        ['Working area', 'Not stored yet'],
      ],
    },
  },
} as const

const mapPreview = {
  replaceWithProvider: 'google-maps-camera-ready',
}

type WorkerCopy = (typeof workerCopy)[WorkerLanguageMode]
type WorkerUiContextValue = {
  copy: WorkerCopy
  language: WorkerLanguageMode
  mode: WorkerThemeMode
  tokens: WorkerThemeTokens
}

const WorkerUiContext = createContext<WorkerUiContextValue | null>(null)

let workerThemeMode: WorkerThemeMode = 'light'
let workerLanguageMode: WorkerLanguageMode = 'vi'
const themeListeners = new Set<() => void>()
const languageListeners = new Set<() => void>()

function getWorkerThemeModeSnapshot() {
  return workerThemeMode
}

function subscribeWorkerThemeMode(listener: () => void) {
  themeListeners.add(listener)
  const removeListener = themeListeners.delete.bind(themeListeners)
  return () => removeListener(listener)
}

export function setWorkerThemeMode(nextMode: WorkerThemeMode) {
  workerThemeMode = nextMode
  void AsyncStorage.setItem(WORKER_THEME_STORAGE_KEY, nextMode)
  themeListeners.forEach((listener) => listener())
}

export function useWorkerThemeMode() {
  useEffect(() => {
    void AsyncStorage.getItem(WORKER_THEME_STORAGE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark') setWorkerThemeMode(stored)
    })
  }, [])

  return useSyncExternalStore(subscribeWorkerThemeMode, getWorkerThemeModeSnapshot, getWorkerThemeModeSnapshot)
}

function getWorkerLanguageModeSnapshot() {
  return workerLanguageMode
}

function subscribeWorkerLanguageMode(listener: () => void) {
  languageListeners.add(listener)
  const removeListener = languageListeners.delete.bind(languageListeners)
  return () => removeListener(listener)
}

export function setWorkerLanguageMode(nextMode: WorkerLanguageMode) {
  workerLanguageMode = nextMode
  void AsyncStorage.setItem(WORKER_LANGUAGE_STORAGE_KEY, nextMode)
  languageListeners.forEach((listener) => listener())
}

export function useWorkerLanguageMode() {
  useEffect(() => {
    void AsyncStorage.getItem(WORKER_LANGUAGE_STORAGE_KEY).then((stored) => {
      if (stored === 'vi' || stored === 'en') setWorkerLanguageMode(stored)
    })
  }, [])

  return useSyncExternalStore(subscribeWorkerLanguageMode, getWorkerLanguageModeSnapshot, getWorkerLanguageModeSnapshot)
}

export function getWorkerThemeTokens(mode: WorkerThemeMode) {
  return mode === 'dark' ? darkLayer : lightLayer
}

function useWorkerFrameCopy() {
  const language = useWorkerLanguageMode()
  return workerCopy[language]
}

function getWorkerVisibleDeal(deal: LocalDeal | null) {
  if (!deal?.broadcast) return null
  return deal.broadcast.status === 'declined' || deal.broadcast.status === 'expired' ? null : deal
}

function isAcceptedLocalWorkerDeal(deal: LocalDeal | null) {
  return deal?.broadcast?.status === 'accepted'
}

export function WorkerHomeSurface() {
  const copy = useWorkerFrameCopy()
  const { selectors, state } = useFrontendWorkflow()
  const deal = getWorkerVisibleDeal(state.deal)

  return (
    <WorkerFrame active="home" eyebrow={copy.home.eyebrow} title={copy.home.title} testID="worker-home-surface">
      <WorkerMapStage />
      <IncomingRequestSheet />

      <View style={styles.operationalBand} testID="worker-shift-console">
        <QuickPanel icon="clock" title={copy.home.nextTitle} value={deal ? statusLabel(selectors.currentStatus) : '--'} note={deal ? serviceLabel(deal.draft.serviceType) : copy.home.nextNote} tone="cyan" />
        <QuickPanel icon="money" title={copy.home.estimate} value="--" note={selectors.paymentLocked ? copy.home.moneyNote : 'Mở sau khi hệ thống sẵn sàng.'} tone="cream" />
      </View>

      <TimelineCard />
    </WorkerFrame>
  )
}

export function WorkerJobsSurface() {
  const copy = useWorkerFrameCopy()
  const { selectors, state } = useFrontendWorkflow()
  const deal = getWorkerVisibleDeal(state.deal)
  const jobTitle = deal ? serviceLabel(deal.draft.serviceType) : copy.jobs.emptyTitle
  const visibleArea = deal?.broadcast?.generalArea ?? deal?.draft.districtLabel ?? 'Ẩn địa chỉ chi tiết'
  const jobBody = deal
    ? `${deal.draft.problemChips[0] ?? 'Đã mô tả'} · ${selectors.canWorkerSeeFullAddress ? deal.draft.addressLabel : visibleArea}`
    : copy.jobs.emptyBody

  return (
    <WorkerFrame active="jobs" eyebrow={copy.jobs.eyebrow} title={copy.jobs.title} testID="worker-jobs-surface">
      <SegmentFilter labels={copy.jobs.filters} />
      <IncomingRequestSheet compact />
      <JobActivityCard icon="tools" status={deal ? statusLabel(selectors.currentStatus) : copy.jobs.emptyStatus} title={jobTitle} body={jobBody} tone="mint" />
      <JobActivityCard icon="brief" status={copy.jobs.scopeStatus} title={copy.jobs.scopeTitle} body={copy.jobs.scopeBody} testID="worker-scope-change-placeholder" tone="warm" />
    </WorkerFrame>
  )
}

export function WorkerChatSurface() {
  const copy = useWorkerFrameCopy()

  return (
    <WorkerFrame active="chat" eyebrow={copy.chat.eyebrow} title={copy.chat.title} testID="worker-chat-surface">
      <WorkerChatContent />
    </WorkerFrame>
  )
}

export function WorkerEarningsSurface() {
  const copy = useWorkerFrameCopy()
  const { selectors, state } = useFrontendWorkflow()
  const deal = getWorkerVisibleDeal(state.deal)
  const acceptedDeal = isAcceptedLocalWorkerDeal(deal) ? deal : null
  const completedLocal = Boolean(acceptedDeal && selectors.currentStatus === 'confirmed_by_customer')
  const waitingLocal = acceptedDeal && selectors.currentStatus !== 'confirmed_by_customer' ? '1 local' : '0'

  return (
    <WorkerFrame active="earnings" eyebrow={copy.earnings.eyebrow} title={copy.earnings.title} testID="worker-earnings-surface">
      <WorkerEarningsHero />

      <View style={styles.operationalBand}>
        <QuickPanel icon="check" title={copy.earnings.complete} value={completedLocal ? '1 local' : '0'} note={copy.earnings.completeNote} tone="mint" />
        <QuickPanel icon="clock" title={copy.earnings.waiting} value={waitingLocal} note={copy.earnings.waitingNote} tone="cyan" />
      </View>

      <WorkerEarningsLedger />
    </WorkerFrame>
  )
}

export function WorkerProfileSurface() {
  const copy = useWorkerFrameCopy()

  return (
    <WorkerFrame active="profile" eyebrow={copy.profile.eyebrow} title={copy.profile.title} testID="worker-profile-surface">
      <WorkerProfileContent />
    </WorkerFrame>
  )
}

function WorkerFrame({
  active,
  children,
  eyebrow,
  testID,
  title,
}: {
  active: WorkerActiveTab
  children: ReactNode
  eyebrow: string
  testID: string
  title: string
}) {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const mode = useWorkerThemeMode()
  const language = useWorkerLanguageMode()
  const tokens = getWorkerThemeTokens(mode)
  const copy = workerCopy[language]
  const frameWidth = Math.min(width, 430)
  void eyebrow
  void title
  const canvasLayer = {
    backgroundColor: tokens.canvas,
    experimental_backgroundImage:
      mode === 'dark'
        ? 'radial-gradient(circle at 50% 12%, rgba(105,222,198,0.12), transparent 30%), linear-gradient(180deg, #071312 0%, #0B1715 100%)'
        : 'radial-gradient(circle at 50% 12%, rgba(142,231,217,0.18), transparent 28%), linear-gradient(180deg, #F4FAF7 0%, #F7FBF8 100%)',
  } as any

  return (
    <WorkerUiContext.Provider value={{ copy, language, mode, tokens }}>
      <SafeAreaView style={[styles.safe, canvasLayer]} testID={testID}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <View style={[styles.canvas, canvasLayer]}>
          <AmbientBackdrop />
          <WorkerSectionMotionField active={active} frameWidth={frameWidth} screenWidth={width} />
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              {
                paddingBottom: Math.max(insets.bottom + workerDockClearance, workerDockClearance),
                width: Math.max(0, frameWidth - workerFrameHorizontalPadding * 2),
              },
            ]}
            contentInsetAdjustmentBehavior="automatic"
            showsVerticalScrollIndicator={false}
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
                WORKER_NO_FULL_ADDRESS_BEFORE_ACCEPT
              }
            />
            {children}
          </ScrollView>
          <WorkerDockOverlay active={active} />
        </View>
      </SafeAreaView>
    </WorkerUiContext.Provider>
  )
}

function WorkerChatContent() {
  const { copy, tokens } = useWorkerUi()
  const { selectors, state } = useFrontendWorkflow()
  const deal = getWorkerVisibleDeal(state.deal)
  const dealChatKey = workerChatDealKey(deal)
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<WorkerChatMessage[]>([])
  const [activeDealChatKey, setActiveDealChatKey] = useState(dealChatKey)
  const dealSeedMessages = buildWorkerDealChatSeed(deal, selectors.currentStatus, copy.chat.kael)
  const renderedMessages = messages.length > 0 ? messages : dealSeedMessages
  const hasAnyWorkerKaelMessage = renderedMessages.length > 0
  const canSendWorkerKaelMessage = !deal || isAcceptedLocalWorkerDeal(deal)
  const chatInputPlaceholder = canSendWorkerKaelMessage ? copy.chat.input : 'Chấp nhận hoặc bỏ qua trước'

  useEffect(() => {
    if (activeDealChatKey === dealChatKey) return
    setMessages([])
    setDraft('')
    setActiveDealChatKey(dealChatKey)
  }, [activeDealChatKey, dealChatKey])

  const submitWorkerKaelLocalDraft = () => {
    if (!canSendWorkerKaelMessage) return
    const value = draft.trim()
    if (!value) return
    const localResponse = deal
      ? 'Đã lưu ghi chú tại máy cho yêu cầu hiện tại. Chưa gửi lên hệ thống và chưa mở thêm dữ liệu riêng tư.'
      : copy.chat.sampleKael
    const baseMessages = messages.length > 0 ? messages : dealSeedMessages
    setMessages([
      ...baseMessages,
      { mine: true, text: value, who: copy.chat.worker },
      { system: true, text: localResponse, who: copy.chat.kael },
    ])
    setDraft('')
  }

  return (
    <View style={[styles.chatShell, glassSurface(tokens, 'depth')]} testID="worker-chat-kael-relay">
      <GlassSheen />
      <GlassMotionLayer />
      <View style={styles.hiddenMarker} testID="worker-kael-client-chatbox-parity" />
      <View style={[styles.kaelClientStage, glassSurface(tokens, 'cyan'), !hasAnyWorkerKaelMessage ? styles.kaelClientStageEmpty : null]} testID="worker-kael-conversation-feed">
        <GlassSheen />
        <GlassMotionLayer compact />
        <View style={styles.hiddenMarker} testID="worker-kael-empty-chat-state" />
        {!hasAnyWorkerKaelMessage ? (
          <View style={styles.kaelBlankCanvas} testID="worker-kael-empty-chat-canvas">
            <View style={[styles.kaelCanvasOrbLarge, { backgroundColor: tokens.aqua }]} />
            <View style={[styles.kaelCanvasOrbWarm, { backgroundColor: tokens.copper }]} />
          </View>
        ) : (
          <View style={styles.chatStack} testID="hasAnyWorkerKaelMessage">
            {renderedMessages.map((message, index) => (
              <ChatBubble key={`${message.who}-${index}`} {...message} />
            ))}
          </View>
        )}

        <View style={[styles.chatComposer, glassSurface(tokens, 'strong')]} testID="worker-kael-composer-dock">
          <GlassSheen />
          <Pressable accessibilityLabel="Thêm" accessibilityRole="button" style={[styles.composerTool, { borderColor: tokens.border }]}>
            <Text style={[styles.composerToolText, { color: tokens.primary }]} numberOfLines={1}>
              +
            </Text>
          </Pressable>
          <TextInput
            accessibilityLabel={chatInputPlaceholder}
            editable={canSendWorkerKaelMessage}
            onChangeText={setDraft}
            onSubmitEditing={submitWorkerKaelLocalDraft}
            placeholder={chatInputPlaceholder}
            placeholderTextColor={tokens.subtle}
            returnKeyType="send"
            selectionColor={tokens.primary}
            style={[styles.chatInput, { color: tokens.ink }]}
            testID="worker-kael-local-chat-input"
            value={draft}
          />
          <Pressable
            accessibilityLabel={copy.chat.send}
            disabled={!draft.trim() || !canSendWorkerKaelMessage}
            onPress={submitWorkerKaelLocalDraft}
            style={({ pressed }) => [
              styles.sendButton,
              { backgroundColor: draft.trim() && canSendWorkerKaelMessage ? tokens.primary : tokens.border },
              pressed ? styles.pressed : null,
            ]}
            testID="worker-kael-send-button"
          >
            <Icon name="send" active />
          </Pressable>
        </View>
      </View>
    </View>
  )
}

function buildWorkerDealChatSeed(deal: LocalDeal | null, status: LocalDealStatus | null, kaelLabel: string): WorkerChatMessage[] {
  if (!deal?.broadcast) return []
  return [
    { system: true, text: `${serviceLabel(deal.draft.serviceType)} · ${statusLabel(status)}`, who: kaelLabel },
    ...deal.broadcast.prebrief.slice(0, 2).map((text) => ({ system: true, text, who: kaelLabel })),
  ]
}

function workerChatDealKey(deal: LocalDeal | null) {
  if (!deal?.broadcast) return 'none'
  return [
    deal.broadcast.status,
    deal.draft.serviceType ?? 'none',
    deal.draft.problemChips.join('|'),
    deal.draft.description,
    deal.draft.districtLabel,
  ].join('::')
}

function WorkerEarningsHero() {
  const { copy, tokens } = useWorkerUi()
  const { selectors, state } = useFrontendWorkflow()
  const deal = getWorkerVisibleDeal(state.deal)
  const acceptedDeal = isAcceptedLocalWorkerDeal(deal) ? deal : null
  const moneyLabel = acceptedDeal ? 'Chờ hệ thống thanh toán' : 'Chưa có dữ liệu'
  const body = acceptedDeal ? `${statusLabel(selectors.currentStatus)} · chưa ghi nhận thanh toán hoặc đánh giá trong giai đoạn này.` : copy.earnings.body

  return (
    <View style={[styles.earningsHero, glassSurface(tokens, 'cream')]} testID="worker-earnings-summary">
      <MotionSweep />
      <GlassMotionLayer />
      <View style={styles.rowBetween}>
        <View style={styles.titleStack}>
          <Text style={[styles.kicker, { color: tokens.primary }]}>{copy.earnings.today}</Text>
          <Text style={[styles.moneyText, { color: tokens.ink }]}>{moneyLabel}</Text>
        </View>
        <View style={[styles.earningsOrb, { backgroundColor: tokens.glassStrong }]}>
          <Icon name="money" active />
        </View>
      </View>
      {body ? <Text style={[styles.bodyText, { color: tokens.muted }]}>{body}</Text> : null}
      <View style={styles.hiddenMarker} testID={WORKER_NO_FAKE_PAYMENT_DATA} />
    </View>
  )
}

function WorkerEarningsLedger() {
  const { copy, tokens } = useWorkerUi()
  const { selectors, state } = useFrontendWorkflow()
  const deal = getWorkerVisibleDeal(state.deal)
  const acceptedDeal = isAcceptedLocalWorkerDeal(deal) ? deal : null
  const rows = acceptedDeal
    ? [
        ['Local deal', statusLabel(selectors.currentStatus)],
        ['Tài khoản nhận tiền', 'Chưa lưu hệ thống'],
        ['Thanh toán & đánh giá', 'Đang khóa'],
      ]
    : copy.earnings.rows

  return (
    <View style={[styles.listCard, glassSurface(tokens, 'raised')]} testID="worker-earnings-ledger">
      <GlassSheen />
      <GlassMotionLayer compact />
      <SectionHeader title={copy.earnings.ledgerTitle} />
      {rows.map((row, index) => (
        <ListRow key={row[0]} icon={index === 0 ? 'money' : index === 1 ? 'bank' : 'document'} title={row[0]} meta={row[1]} />
      ))}
    </View>
  )
}

function WorkerProfileContent() {
  const { copy, language, tokens } = useWorkerUi()
  const router = useRouter()
  const { role } = useAuth()
  const { selectors, state } = useFrontendWorkflow()
  const deal = getWorkerVisibleDeal(state.deal)
  const acceptedDeal = isAcceptedLocalWorkerDeal(deal) ? deal : null
  const adminAuditSwitchLabel = language === 'en' ? 'Choose audit section' : 'Chọn section audit'
  const profileRows = deal
    ? [
        ['Xác minh danh tính', 'Chờ duyệt hệ thống'],
        ['Kỹ năng dịch vụ', serviceLabel(deal.draft.serviceType)],
        ['Khu vực làm việc', deal.draft.districtLabel || 'Từ deal local'],
      ]
    : copy.profile.rows
  const profileSkills = deal
    ? [serviceLabel(deal.draft.serviceType), deal.draft.districtLabel || 'Khu vực local', 'Chờ duyệt hệ thống', 'Chờ phản hồi thật']
    : copy.profile.skills

  return (
    <>
      <View style={[styles.profileHead, glassSurface(tokens, 'raised')]} testID="worker-profile-verification-card">
        <GlassSheen />
        <GlassMotionLayer compact />
        <View style={[styles.avatarWrap, { backgroundColor: tokens.mint }]}>
          <Icon name="person" />
        </View>
        <View style={styles.titleStack}>
          <Text style={[styles.profileName, { color: tokens.ink }]}>{copy.profile.name}</Text>
          {copy.profile.body ? (
            <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={2}>
              {copy.profile.body}
            </Text>
          ) : null}
        </View>
        <View style={[styles.profileBadge, { backgroundColor: tokens.cyan }]}>
          <Icon name="shield" small />
        </View>
      </View>
      {role === 'admin' ? (
        <View style={styles.adminSwitchWrap}>
          <PressButton label={adminAuditSwitchLabel} onPress={() => router.replace('/(auth)/login')} testID="worker-admin-audit-switch" />
        </View>
      ) : null}

      <View style={[styles.greenScoreCard, glassSurface(tokens, 'mint')]}>
        <MotionSweep />
        <GlassMotionLayer />
        <Text style={[styles.kicker, { color: tokens.primary }]}>{copy.profile.scoreTitle}</Text>
        <Text style={[styles.scoreNumber, { color: tokens.ink }]}>--</Text>
        {copy.profile.scoreBody ? <Text style={[styles.bodyText, { color: tokens.muted }]}>{copy.profile.scoreBody}</Text> : null}
        <View style={styles.scoreStats}>
          <Metric label={copy.home.today} value={acceptedDeal ? '1 local' : '0'} />
          <Metric label={copy.home.rating} value="--" />
          <Metric label={copy.jobs.title} value={deal ? statusLabel(selectors.currentStatus) : '--'} />
        </View>
      </View>

      <View style={styles.skillWrap}>
        {profileSkills.map((item) => (
          <View key={item} style={[styles.skillPill, { backgroundColor: tokens.glassStrong, borderColor: tokens.border }]}>
            <Text style={[styles.skillText, { color: tokens.primary }]}>{item}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.preferenceCard, glassSurface(tokens, 'raised')]} testID="worker-profile-preference-toggles">
        <GlassSheen />
        <GlassMotionLayer compact />
        <ThemeToggle />
        <LanguageToggle />
      </View>

      <View style={[styles.listCard, glassSurface(tokens, 'raised')]} testID="worker-profile-list-groups">
        <GlassSheen />
        <GlassMotionLayer compact />
        {profileRows.map((row, index) => (
          <ListRow key={row[0]} icon={index === 0 ? 'shield' : index === 1 ? 'tools' : index === 2 ? 'map' : index === 3 ? 'moon' : 'globe'} title={row[0]} meta={row[1]} />
        ))}
      </View>
    </>
  )
}

function WorkerMapStage() {
  const { copy, tokens } = useWorkerUi()
  const { selectors, state } = useFrontendWorkflow()
  const deal = getWorkerVisibleDeal(state.deal)
  const acceptedDeal = isAcceptedLocalWorkerDeal(deal) ? deal : null
  const broadcast = deal?.broadcast
  const mapSearch = broadcast?.generalArea ?? deal?.draft.districtLabel ?? copy.home.mapSearch
  const statusTitle = deal ? statusLabel(selectors.currentStatus) : copy.home.online

  return (
    <View style={[styles.mapStage, glassSurface(tokens, 'base')]} testID="worker-flexible-map-shell">
      <GlassSheen />
      <GlassMotionLayer />
      <View style={[styles.mapViewport, { backgroundColor: tokens.mode === 'dark' ? tokens.depth : '#F8FBF9' }]} testID="worker-map-google-ready">
        <MapLineField />
        <View pointerEvents="none" style={[styles.mapFogTop, { backgroundColor: tokens.raised }]} />
        <View pointerEvents="none" style={[styles.mapCyanVeil, { backgroundColor: tokens.aqua }]} />
        <View pointerEvents="none" style={[styles.mapFogBottom, { backgroundColor: tokens.raised }]} />
        <View style={styles.hiddenMarker} testID={mapPreview.replaceWithProvider} />
        <View style={[styles.searchPill, glassSurface(tokens, 'raised')]}>
          <Icon name="pin" small />
          <Text style={[styles.searchText, { color: tokens.ink }]} numberOfLines={1}>
            {mapSearch}
          </Text>
        </View>
        <PulseBeacon />
      </View>

      <View style={styles.mapCardsRow}>
        <WorkerMapFeatureCard icon="bolt" title={copy.home.electricianCard} tone="mint" />
        <WorkerMapFeatureCard icon="water" title={copy.home.plumberCard} tone="cream" />
      </View>

      {copy.home.serviceHeading ? (
        <View style={styles.mapServiceHeader}>
          <Text style={[styles.sectionTitle, { color: tokens.ink }]}>{copy.home.serviceHeading}</Text>
        </View>
      ) : null}

      <View style={[styles.shiftCard, glassSurface(tokens, 'raised')]} testID="worker-availability-toggle">
        <GlassSheen />
        <GlassMotionLayer compact />
        <View style={styles.rowBetween}>
          <View style={styles.titleStack}>
            <Text style={[styles.kicker, { color: tokens.primary }]}>{copy.home.status}</Text>
            <Text style={[styles.heroTitle, { color: tokens.ink }]}>{statusTitle}</Text>
          </View>
          <View style={[styles.toggleTrack, { backgroundColor: deal ? tokens.primary : tokens.borderStrong }]}>
            <View style={[styles.toggleKnob, { backgroundColor: tokens.raised }]} />
          </View>
        </View>
        <View style={styles.metricRow}>
          <Metric label={copy.home.today} value={acceptedDeal ? '1 local' : '0'} />
          <Metric label={copy.home.estimate} value="--" />
          <Metric label={copy.home.rating} value="--" />
        </View>
      </View>
    </View>
  )
}

function WorkerMapFeatureCard({ icon, title, tone }: { icon: WorkerIconName; title: string; tone: WorkerTone }) {
  const { tokens } = useWorkerUi()

  return (
    <View style={[styles.mapFeatureCard, glassSurface(tokens, tone)]}>
      <GlassSheen />
      <GlassMotionLayer compact />
      <Text style={[styles.mapFeatureTitle, { color: tokens.ink }]} numberOfLines={1}>{title}</Text>
      <View style={[styles.mapFeatureIcon, { backgroundColor: tokens.glassStrong }]}>
        <Icon name={icon} />
      </View>
    </View>
  )
}

type WorkerProgressAction =
  | 'worker_start_travel'
  | 'worker_mark_arrived'
  | 'worker_start_inspection'
  | 'worker_start_repair'
  | 'worker_complete_job'

function getNextWorkerAction(status: LocalDealStatus | null): { label: string; type: WorkerProgressAction } | null {
  if (status === 'worker_matched') return { label: 'Bắt đầu di chuyển', type: 'worker_start_travel' }
  if (status === 'worker_on_way') return { label: 'Đã đến nơi', type: 'worker_mark_arrived' }
  if (status === 'arrived') return { label: 'Bắt đầu kiểm tra', type: 'worker_start_inspection' }
  if (status === 'inspecting') return { label: 'Bắt đầu sửa', type: 'worker_start_repair' }
  if (status === 'repairing') return { label: 'Báo hoàn tất', type: 'worker_complete_job' }
  return null
}

function IncomingRequestSheet({ compact = false }: { compact?: boolean }) {
  const { copy, tokens } = useWorkerUi()
  const { dispatch, selectors, state } = useFrontendWorkflow()
  const deal = getWorkerVisibleDeal(state.deal)
  const broadcast = deal?.broadcast ?? null
  const nextAction = selectors.canWorkerAdvance ? getNextWorkerAction(selectors.currentStatus) : null
  const hasBroadcast = Boolean(broadcast)
  const secondsRemainingLabel = broadcast?.secondsRemaining === null || broadcast?.secondsRemaining === undefined ? null : `${broadcast.secondsRemaining}s`
  const confirmWorkerProgressAction = (action: { label: string; type: WorkerProgressAction }) => {
    if (action.type !== 'worker_complete_job') {
      dispatch({ type: action.type })
      return
    }

    Alert.alert(
      'Xác nhận báo hoàn tất?',
      'Worker audit sẽ báo khách kiểm tra và xác nhận. Thanh toán, đánh giá và giá cuối vẫn khóa cho tới khi backend được nối.',
      [
        { text: 'Kiểm tra lại', style: 'cancel' },
        { text: action.label, onPress: () => dispatch({ type: action.type }) },
      ],
    )
  }
  const addressLabel = selectors.canWorkerSeeFullAddress
    ? broadcast?.fullAddressLabel ?? deal?.draft.addressLabel ?? ''
    : broadcast?.generalArea
      ? `${broadcast.generalArea} · ẩn địa chỉ chi tiết`
      : 'Địa chỉ chi tiết chỉ hiện sau khi có job thật và được chấp nhận.'

  return (
    <View style={[styles.requestSheet, compact ? styles.requestSheetCompact : null, glassSurface(tokens, 'raised')]} testID="worker-request-sheet">
      <GlassSheen />
      <MotionSweep />
      <GlassMotionLayer />
      <View style={styles.hiddenMarker} testID="worker-no-live-request-empty-state" />
      <View style={styles.hiddenMarker} testID="worker-safe-address-gate" />
      <View style={styles.rowBetween}>
        <View style={[styles.serviceBadge, { backgroundColor: tokens.mint }]}>
          <Icon name={deal?.draft.serviceType === 'plumbing' ? 'water' : 'bolt'} small />
          <Text style={[styles.serviceBadgeText, { color: tokens.primary }]}>{hasBroadcast ? serviceLabel(deal?.draft.serviceType ?? null) : copy.request.service}</Text>
        </View>
        {secondsRemainingLabel && selectors.canWorkerAccept ? (
          <View style={[styles.countdownOrbit, { borderColor: tokens.primary }]} testID="worker-local-broadcast-countdown">
            <Text style={[styles.countdownText, { color: tokens.primary }]}>{secondsRemainingLabel}</Text>
          </View>
        ) : null}
      </View>

      <Text style={[styles.requestTitle, { color: tokens.ink }]}>{broadcast?.problemSummary ?? copy.request.title}</Text>
      <View style={styles.areaRow} testID={selectors.canWorkerSeeFullAddress ? 'worker-full-address-after-accept' : 'worker-general-area-before-accept'}>
        <Icon name="map" small />
        <Text style={[styles.areaText, { color: tokens.muted }]}>{addressLabel}</Text>
      </View>

      <View style={[styles.kaelBrief, glassSurface(tokens, 'cyan')]} testID="worker-kael-brief">
        <View style={styles.identityRow}>
          <Image source={kaelHead} style={[styles.kaelMini, { borderColor: tokens.borderStrong }]} />
          <Text style={[styles.kaelBriefTitle, { color: tokens.ink }]}>{copy.request.briefTitle}</Text>
        </View>
        {(broadcast?.prebrief ?? copy.request.brief).map((brief) => (
          <View key={brief} style={styles.briefItem}>
            <View style={[styles.briefDot, { backgroundColor: tokens.primary }]} />
            <Text style={[styles.briefText, { color: tokens.muted }]} numberOfLines={2}>
              {brief}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.priceRow}>
        <Metric label={copy.request.customerEstimate} value="--" />
        <Metric label={copy.request.workerEarns} value="--" />
      </View>
      {selectors.canWorkerAccept ? (
        <View style={styles.actionRow}>
          <PressButton label={copy.request.decline} onPress={() => dispatch({ type: 'worker_decline_broadcast' })} secondary />
          <PressButton label={copy.request.accept} onPress={() => dispatch({ type: 'worker_accept_broadcast' })} testID="worker-local-accept-deal" />
        </View>
      ) : nextAction ? (
        <PressButton label={nextAction.label} onPress={() => confirmWorkerProgressAction(nextAction)} testID="worker-local-status-action" />
      ) : hasBroadcast ? (
        <Text style={[styles.bodyText, { color: tokens.muted }]}>{statusLabel(selectors.currentStatus)}</Text>
      ) : null}
    </View>
  )
}

function WorkerDockOverlay({ active }: { active: WorkerActiveTab }) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const { copy, tokens } = useWorkerUi()
  const dockPulse = useSharedValue(0)
  const dockSweep = useSharedValue(0)
  const dockWidth = Math.min(Math.max(width - 34, 0), 392)
  const bottom = Math.max(insets.bottom + workerDockBottomMargin, workerDockBottomMargin)
  const items = [
    { key: 'home' as const, icon: 'home' as const, label: copy.nav.home, path: '/(worker)/home' as const },
    { key: 'jobs' as const, icon: 'jobs' as const, label: copy.nav.jobs, path: '/(worker)/jobs' as const },
    { key: 'chat' as const, icon: 'chat' as const, label: copy.nav.chat, path: '/(worker)/chat' as const },
    { key: 'earnings' as const, icon: 'money' as const, label: copy.nav.earnings, path: '/(worker)/earnings' as const },
    { key: 'profile' as const, icon: 'person' as const, label: copy.nav.profile, path: '/(worker)/profile' as const },
  ]
  const activeIndex = Math.max(items.findIndex((item) => item.key === active), 0)
  const previousActiveIndex = Math.max(items.findIndex((item) => item.key === lastWorkerDockActive), 0)
  const slotWidth = dockWidth / items.length
  const liquidLeft = activeIndex * slotWidth + slotWidth / 2 - 48
  const previousLiquidLeft = previousActiveIndex * slotWidth + slotWidth / 2 - 48
  const liquidX = useSharedValue(previousLiquidLeft)
  const liquidWake = useSharedValue(1)

  useEffect(() => {
    dockPulse.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.quad) }), -1, true)
    dockSweep.value = withRepeat(withTiming(1, { duration: 4600, easing: Easing.inOut(Easing.quad) }), -1, false)
  }, [dockPulse, dockSweep])

  useEffect(() => {
    liquidX.value = withSpring(liquidLeft, { damping: 15, mass: 0.72, stiffness: 132 })
    liquidWake.value = 0
    liquidWake.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) })
    lastWorkerDockActive = active
  }, [active, liquidLeft, liquidWake, liquidX])

  const dockHaloStyle = useAnimatedStyle(() => ({
    opacity: 0.18 + dockPulse.value * 0.2,
    transform: [{ scaleX: 0.98 + dockPulse.value * 0.045 }, { scaleY: 0.94 + dockPulse.value * 0.06 }],
  }))
  const dockSheenStyle = useAnimatedStyle(() => ({
    opacity: dockSweep.value < 0.08 ? dockSweep.value * 2.4 : dockSweep.value > 0.92 ? (1 - dockSweep.value) * 2.4 : 0.2,
    transform: [{ translateX: -64 + dockSweep.value * (dockWidth + 128) }, { rotate: '11deg' }],
  }))
  const activeGlowStyle = useAnimatedStyle(() => ({
    opacity: 0.18 + dockPulse.value * 0.22,
    transform: [{ scale: 0.9 + dockPulse.value * 0.16 }],
  }))
  const liquidPoolStyle = useAnimatedStyle(() => ({
    opacity: 0.16 + dockPulse.value * 0.17,
    transform: [{ translateX: liquidX.value }, { scaleX: 0.94 + dockPulse.value * 0.16 }, { scaleY: 0.84 + dockPulse.value * 0.12 }],
  }))
  const liquidWakeStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, 1 - liquidWake.value) * 0.24,
    transform: [{ translateX: liquidX.value - 10 + liquidWake.value * 20 }, { scaleX: 0.8 + liquidWake.value * 0.52 }, { scaleY: 0.72 + liquidWake.value * 0.2 }],
  }))

  return (
    <View pointerEvents="box-none" style={[styles.dockWrap, { bottom, width: dockWidth }]}>
      <Animated.View pointerEvents="none" style={[styles.dockGlassAura, { backgroundColor: tokens.aqua }, dockHaloStyle]} testID="worker-dock-glass-aura" />
      <View pointerEvents="none" style={[styles.dockWarmAura, { backgroundColor: tokens.copper }]} />
      <View
        style={[
          styles.workerDock,
          {
            backgroundColor: tokens.mode === 'dark' ? 'rgba(14,32,32,0.74)' : 'rgba(255,255,255,0.74)',
            backdropFilter: 'blur(22px) saturate(1.18)',
            borderColor: tokens.glassBorder,
            boxShadow: tokens.mode === 'dark' ? '0 18px 50px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.12)' : '0 20px 52px rgba(13,70,65,0.16), inset 0 1px 0 rgba(255,255,255,0.78)',
          } as any,
        ]}
        testID="worker-liquid-glass-dock"
      >
        <GlassSheen />
        <Animated.View pointerEvents="none" style={[styles.dockLiquidWake, { backgroundColor: tokens.primary }, liquidWakeStyle]} testID="worker-dock-liquid-wake" />
        <Animated.View pointerEvents="none" style={[styles.dockLiquidPool, { backgroundColor: tokens.aqua }, liquidPoolStyle]} testID="worker-dock-liquid-pool" />
        <View pointerEvents="none" style={[styles.dockBottomReflection, { backgroundColor: tokens.glassHighlight }]} testID="worker-dock-bottom-reflection" />
        <Animated.View pointerEvents="none" style={[styles.dockMotionSheen, { backgroundColor: tokens.glassHighlight }, dockSheenStyle]} testID="worker-dock-motion-sheen" />
        {items.map((item) => {
          const focused = active === item.key
          return (
            <Pressable
              accessibilityLabel={item.label}
              key={item.key}
              onPress={() => router.push(item.path)}
              style={({ pressed }) => [
                styles.dockItem,
                focused ? { backgroundColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.18)' : 'rgba(216,247,239,0.78)', boxShadow: tokens.softShadow } : null,
                pressed ? styles.pressed : null,
              ]}
              testID={`worker-dock-${item.key}`}
            >
              {focused ? <Animated.View pointerEvents="none" style={[styles.dockActiveGlow, { backgroundColor: tokens.aqua }, activeGlowStyle]} testID="worker-dock-active-glow" /> : null}
              {item.key === 'chat' ? (
                <Image resizeMode="contain" source={kaelHead} style={styles.dockKaelImage} testID="worker-dock-kael-brief-mascot" />
              ) : (
                <Icon name={item.icon} active={focused} />
              )}
              {focused ? (
                <View style={[styles.dockDot, { backgroundColor: tokens.primary }]} />
              ) : null}
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

function AmbientBackdrop() {
  const { tokens } = useWorkerUi()
  const drift = useSharedValue(0)

  useEffect(() => {
    drift.value = withRepeat(withTiming(1, { duration: 6200, easing: Easing.inOut(Easing.quad) }), -1, true)
  }, [drift])

  const mintDriftStyle = useAnimatedStyle(() => ({
    opacity: 0.16 + drift.value * 0.08,
    transform: [{ translateY: -8 + drift.value * 16 }, { scale: 0.98 + drift.value * 0.04 }],
  }))
  const lineDriftStyle = useAnimatedStyle(() => ({
    opacity: 0.1 + drift.value * 0.06,
    transform: [{ translateX: -10 + drift.value * 20 }],
  }))

  return (
    <>
      <View style={[styles.backdropWarm, { backgroundColor: tokens.cream }]} />
      <Animated.View style={[styles.backdropMint, { backgroundColor: tokens.aqua }, mintDriftStyle]} />
      <View style={[styles.backdropCyan, { backgroundColor: tokens.cyan }]} />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, lineDriftStyle]}>
        <Svg style={StyleSheet.absoluteFill} viewBox="0 0 390 844" preserveAspectRatio="none">
          <Path d="M-10 210 C74 178 128 230 198 190 S332 132 420 164" stroke={tokens.line} strokeWidth={2.2} opacity={0.42} fill="none" />
          <Path d="M42 78 C118 124 126 174 88 238 S92 366 176 394 S302 378 410 424" stroke={tokens.line} strokeWidth={1.8} opacity={0.28} fill="none" />
          <Path d="M-20 604 C72 570 112 620 182 584 S316 512 420 550" stroke={tokens.line} strokeWidth={2} opacity={0.26} fill="none" />
        </Svg>
      </Animated.View>
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
  const tide = useSharedValue(0)
  const sectionIndex = ['home', 'jobs', 'chat', 'earnings', 'profile'].indexOf(active)
  const left = Math.max((screenWidth - frameWidth) / 2, 0)
  const topBias = 18 + Math.max(sectionIndex, 0) * 9

  useEffect(() => {
    tide.value = withRepeat(withTiming(1, { duration: 6800, easing: Easing.inOut(Easing.quad) }), -1, true)
  }, [tide])

  const ribbonStyle = useAnimatedStyle(() => ({
    opacity: 0.16 + tide.value * 0.12,
    transform: [{ translateX: -28 + tide.value * 56 }, { translateY: -10 + tide.value * 18 }, { rotate: '10deg' }],
  }))
  const orbStyle = useAnimatedStyle(() => ({
    opacity: 0.14 + tide.value * 0.1,
    transform: [{ translateX: 12 - tide.value * 24 }, { translateY: -12 + tide.value * 24 }, { scale: 0.98 + tide.value * 0.05 }],
  }))
  const causticStyle = useAnimatedStyle(() => ({
    opacity: 0.08 + tide.value * 0.1,
    transform: [{ translateX: -18 + tide.value * 36 }, { scaleX: 0.92 + tide.value * 0.16 }],
  }))
  const glintStyle = useAnimatedStyle(() => ({
    opacity: tide.value < 0.5 ? 0.08 + tide.value * 0.18 : 0.26 - (tide.value - 0.5) * 0.24,
    transform: [{ translateX: -90 + tide.value * 180 }, { rotate: '13deg' }],
  }))

  return (
    <View
      pointerEvents="none"
      style={[styles.sectionMotionField, { left, width: frameWidth }]}
      testID={workerSectionMotionTestIDs[active]}
    >
      <Animated.View style={[styles.sectionMotionRibbon, { backgroundColor: tokens.glassHighlight, top: topBias }, ribbonStyle]} />
      <Animated.View style={[styles.sectionMotionOrb, { backgroundColor: tokens.aqua, top: 28 + topBias }, orbStyle]} />
      <Animated.View style={[styles.sectionMotionCaustic, { backgroundColor: tokens.mint }, causticStyle]} />
      <Animated.View style={[styles.sectionMotionGlint, { backgroundColor: tokens.glassHighlight }, glintStyle]} />
    </View>
  )
}

function MapLineField() {
  const { tokens } = useWorkerUi()

  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 360 360" preserveAspectRatio="none">
      <Path d="M52 -14 C96 52 130 102 154 174 S194 296 252 390" stroke={tokens.mapLine} strokeWidth={5.2} opacity={0.22} fill="none" />
      <Path d="M84 52 C144 88 206 92 292 76 S370 58 410 82" stroke={tokens.mapLine} strokeWidth={4.5} opacity={0.20} fill="none" />
      <Path d="M24 166 C82 134 128 172 184 154 S270 104 354 136" stroke={tokens.mapLine} strokeWidth={4} opacity={0.27} fill="none" />
      <Path d="M-16 248 C58 208 124 248 194 222 S292 174 388 204" stroke={tokens.mapLine} strokeWidth={4.2} opacity={0.24} fill="none" />
      <Path d="M120 26 L116 126 M204 56 L186 176 M298 24 L278 132 M314 128 L330 262" stroke={tokens.mapLine} strokeWidth={2.8} opacity={0.14} fill="none" />
      <Rect x={50} y={92} width={48} height={34} rx={12} fill={tokens.mapBlock} opacity={0.34} />
      <Rect x={220} y={84} width={60} height={38} rx={13} fill={tokens.mapBlock} opacity={0.3} />
      <Rect x={136} y={220} width={62} height={38} rx={13} fill={tokens.mapBlock} opacity={0.24} />
    </Svg>
  )
}

function PulseBeacon() {
  const { tokens } = useWorkerUi()

  return (
    <View style={styles.beaconWrap}>
      <View style={[styles.beaconHalo, { backgroundColor: tokens.aqua }]} />
      <View style={[styles.beaconCrescent, { borderColor: tokens.aqua }]} />
      <View style={[styles.beaconPin, { backgroundColor: tokens.ink, borderColor: tokens.raised }]}>
        <View style={[styles.beaconCore, { backgroundColor: tokens.primary }]} />
      </View>
    </View>
  )
}

function GlassSheen() {
  const { tokens } = useWorkerUi()

  return (
    <>
      <View pointerEvents="none" style={[styles.glassTopHighlight, { backgroundColor: tokens.glassHighlight }]} />
      <View pointerEvents="none" style={[styles.glassSheen, { backgroundColor: tokens.glassHighlight }]} />
    </>
  )
}

function MotionSweep({ testID }: { testID?: string }) {
  const { tokens } = useWorkerUi()
  const sweep = useSharedValue(0)

  useEffect(() => {
    sweep.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.quad) }), -1, true)
  }, [sweep])

  const sweepStyle = useAnimatedStyle(() => ({
    opacity: 0.14 + sweep.value * 0.16,
    transform: [{ translateX: -130 + sweep.value * 260 }],
  }))

  return <Animated.View pointerEvents="none" style={[styles.motionSweep, { backgroundColor: tokens.sheen }, sweepStyle]} testID={testID} />
}

function GlassMotionLayer({ compact = false }: { compact?: boolean }) {
  const { tokens } = useWorkerUi()
  const motion = useSharedValue(0)
  const verticalFlow = useSharedValue(0)

  useEffect(() => {
    motion.value = withRepeat(withTiming(1, { duration: 5200, easing: Easing.inOut(Easing.quad) }), -1, true)
    verticalFlow.value = withRepeat(
      withTiming(1, { duration: compact ? 3600 : 4300, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    )
  }, [compact, motion, verticalFlow])

  const orbStyle = useAnimatedStyle(() => ({
    opacity: (compact ? 0.08 : 0.12) + motion.value * (compact ? 0.05 : 0.07),
    transform: [{ translateY: -8 + motion.value * 16 }, { scale: 0.96 + motion.value * 0.08 }],
  }))
  const ribbonStyle = useAnimatedStyle(() => ({
    opacity: (compact ? 0.14 : 0.2) + motion.value * (compact ? 0.1 : 0.14),
    transform: [
      { translateY: (compact ? -118 : -168) + verticalFlow.value * (compact ? 236 : 336) },
      { translateX: -8 + motion.value * 16 },
      { rotate: '9deg' },
    ],
  }))
  const coreStyle = useAnimatedStyle(() => ({
    opacity: (compact ? 0.16 : 0.22) + (1 - Math.abs(verticalFlow.value - 0.5) * 2) * (compact ? 0.16 : 0.22),
    transform: [
      { translateY: (compact ? -94 : -138) + verticalFlow.value * (compact ? 188 : 276) },
      { translateX: 6 - motion.value * 12 },
      { rotate: '9deg' },
    ],
  }))

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[styles.glassMotionOrb, compact ? styles.glassMotionOrbCompact : null, { backgroundColor: tokens.aqua }, orbStyle]}
        testID="worker-glass-motion-layer"
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glassMotionRibbon,
          compact ? styles.glassMotionRibbonCompact : null,
          { backgroundColor: tokens.glassHighlight },
          ribbonStyle,
        ]}
        testID="worker-vertical-glass-flow"
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.glassMotionCore, compact ? styles.glassMotionCoreCompact : null, { backgroundColor: tokens.aqua }, coreStyle]}
        testID="worker-vertical-glass-core"
      />
    </>
  )
}

function ThemeToggle() {
  const { copy, mode, tokens } = useWorkerUi()
  const nextMode = mode === 'light' ? 'dark' : 'light'

  return (
    <View style={styles.preferenceRow}>
      <View style={styles.preferenceTitle}>
        <Icon name={mode === 'light' ? 'moon' : 'sun'} small />
        <Text style={[styles.listTitle, { color: tokens.ink }]} numberOfLines={1}>
          {copy.profile.theme}
        </Text>
      </View>
      <Pressable
        accessibilityLabel={mode === 'light' ? copy.frame.themeDark : copy.frame.themeLight}
        onPress={() => setWorkerThemeMode(nextMode)}
        style={({ pressed }) => [styles.preferenceSwitch, { backgroundColor: tokens.mint, borderColor: tokens.borderStrong }, pressed ? styles.pressed : null]}
        testID="worker-dark-mode-toggle"
      >
        <View style={[styles.preferenceKnob, mode === 'dark' ? styles.preferenceKnobRight : null, { backgroundColor: tokens.primary }]} />
      </Pressable>
    </View>
  )
}

function LanguageToggle() {
  const { copy, language, tokens } = useWorkerUi()
  const nextLanguage = language === 'vi' ? 'en' : 'vi'

  return (
    <View style={styles.preferenceRow}>
      <View style={styles.preferenceTitle}>
        <Icon name="globe" small />
        <Text style={[styles.listTitle, { color: tokens.ink }]} numberOfLines={1}>
          {copy.profile.language}
        </Text>
      </View>
      <Pressable
        accessibilityLabel={copy.frame.lang}
        onPress={() => setWorkerLanguageMode(nextLanguage)}
        style={({ pressed }) => [styles.preferenceSwitch, { backgroundColor: tokens.cyan, borderColor: tokens.borderStrong }, pressed ? styles.pressed : null]}
        testID="worker-language-toggle"
      >
        <View style={[styles.preferenceKnob, language === 'en' ? styles.preferenceKnobRight : null, { backgroundColor: tokens.primary }]} />
      </Pressable>
    </View>
  )
}

function TimelineCard() {
  const { copy, tokens } = useWorkerUi()
  const { selectors, state } = useFrontendWorkflow()
  const deal = getWorkerVisibleDeal(state.deal)
  const phases = getWorkerTimeline(deal ? selectors.currentStatus : null)

  return (
    <View style={[styles.timelineCard, glassSurface(tokens, 'raised')]}>
      <GlassSheen />
      <GlassMotionLayer compact />
      <SectionHeader title={copy.home.shiftTitle} action={copy.home.shiftAction} />
      {phases.map((item) => (
        <View key={item.label} style={styles.timelineItem}>
          <View style={[styles.timelineRail, { backgroundColor: item.active ? tokens.primary : tokens.border }]} />
          <Text style={[styles.timelineText, { color: item.active ? tokens.ink : tokens.subtle }]}>{item.label}</Text>
        </View>
      ))}
    </View>
  )
}

function getWorkerTimeline(status: LocalDealStatus | null) {
  const steps: Array<{ label: string; statuses: LocalDealStatus[] }> = [
    { label: 'Chờ broadcast', statuses: ['broadcasting'] },
    { label: 'Nhận local deal', statuses: ['worker_matched'] },
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

function SegmentFilter({ labels }: { labels: readonly string[] }) {
  const { tokens } = useWorkerUi()

  return (
    <View style={[styles.segmentShell, glassSurface(tokens, 'raised')]} testID="worker-activity-filter-pattern">
      <GlassSheen />
      <GlassMotionLayer compact />
      {labels.map((item, index) => (
        <View key={item} style={[styles.segmentPill, index === 0 ? { backgroundColor: tokens.mint, boxShadow: tokens.softShadow } : null]}>
          <Text style={[styles.segmentText, { color: index === 0 ? tokens.primary : tokens.muted }]} numberOfLines={1}>
            {item}
          </Text>
        </View>
      ))}
    </View>
  )
}

function JobActivityCard({
  body,
  icon,
  status,
  testID,
  title,
  tone,
}: {
  body: string
  icon: WorkerIconName
  status: string
  testID?: string
  title: string
  tone: WorkerTone
}) {
  const { tokens } = useWorkerUi()

  return (
    <View style={[styles.flowCard, glassSurface(tokens, tone)]} testID={testID}>
      <GlassSheen />
      <GlassMotionLayer compact />
      <View style={styles.rowBetween}>
        <Icon name={icon} />
        <Text style={[styles.statusPill, { backgroundColor: tokens.glassStrong, color: tokens.primary }]}>{status}</Text>
      </View>
      <Text style={[styles.cardTitle, { color: tokens.ink }]}>{title}</Text>
      {body ? <Text style={[styles.bodyText, { color: tokens.muted }]}>{body}</Text> : null}
    </View>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  const { tokens } = useWorkerUi()

  return (
    <View style={[styles.metric, { backgroundColor: tokens.glassStrong, borderColor: tokens.border }]}>
      <GlassMotionLayer compact />
      <Text style={[styles.metricValue, { color: tokens.ink }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.metricLabel, { color: tokens.subtle }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

function QuickPanel({ icon, note, title, tone, value }: { icon: WorkerIconName; note: string; title: string; tone: WorkerTone; value: string }) {
  const { tokens } = useWorkerUi()

  return (
    <View style={[styles.quickPanel, glassSurface(tokens, tone)]}>
      <GlassSheen />
      <GlassMotionLayer compact />
      <Icon name={icon} />
      <Text style={[styles.quickValue, { color: tokens.ink }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.quickTitle, { color: tokens.ink }]} numberOfLines={1}>
        {title}
      </Text>
      <Text style={[styles.quickNote, { color: tokens.muted }]} numberOfLines={2}>
        {note}
      </Text>
    </View>
  )
}

function SectionHeader({ action = '', title }: { action?: string; title: string }) {
  const { tokens } = useWorkerUi()

  return (
    <View style={styles.rowBetween}>
      <Text style={[styles.sectionTitle, { color: tokens.ink }]}>{title}</Text>
      {action ? <Text style={[styles.sectionAction, { color: tokens.primary }]}>{action}</Text> : null}
    </View>
  )
}

function ChatBubble({ mine = false, system = false, text, who }: { mine?: boolean; system?: boolean; text: string; who: string }) {
  const { tokens } = useWorkerUi()
  const tone = mine ? 'mint' : system ? 'cyan' : 'raised'

  return (
    <View style={[styles.chatBubble, mine ? styles.chatBubbleMine : null, glassSurface(tokens, tone)]}>
      <Text style={[styles.chatWho, { color: tokens.primary }]}>{who}</Text>
      <Text style={[styles.chatText, { color: tokens.ink }]}>{text}</Text>
    </View>
  )
}

function ListRow({ icon, meta, title }: { icon: WorkerIconName; meta: string; title: string }) {
  const { tokens } = useWorkerUi()

  return (
    <View style={styles.listRow}>
      <Icon name={icon} small />
      <Text style={[styles.listTitle, { color: tokens.ink }]} numberOfLines={1}>
        {title}
      </Text>
      <Text style={[styles.listMeta, { color: tokens.subtle }]} numberOfLines={1}>
        {meta}
      </Text>
    </View>
  )
}

function PressButton({
  disabled = false,
  label,
  onPress,
  secondary = false,
  testID,
}: {
  disabled?: boolean
  label: string
  onPress?: () => void
  secondary?: boolean
  testID?: string
}) {
  const { tokens } = useWorkerUi()

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pressButton,
        { backgroundColor: secondary ? tokens.mint : tokens.primary },
        disabled ? styles.disabledButton : null,
        pressed ? styles.pressed : null,
      ]}
      testID={testID}
    >
      <Text style={[styles.pressButtonText, { color: secondary ? tokens.primary : tokens.primaryText }]}>{label}</Text>
    </Pressable>
  )
}

function Icon({ active = false, name, small = false }: { active?: boolean; name: WorkerIconName; small?: boolean }) {
  const { tokens } = useWorkerUi()
  const color = active ? tokens.primary : tokens.muted
  const accent = active ? tokens.copper : tokens.aqua
  const size = small ? 18 : 25
  const stroke = small ? 1.8 : 2

  return (
    <Svg width={size} height={size} viewBox="0 0 25 25" fill="none" testID="worker-dock-icon-system-v3">
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
      {name === 'pin' ? (
        <>
          <Circle cx={12.5} cy={10.5} r={4.2} stroke={color} strokeWidth={stroke} />
          <Path d="M12.5 14.6v5.1" stroke={accent} strokeWidth={stroke} strokeLinecap="round" />
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

function useWorkerUi() {
  const context = useContext(WorkerUiContext)
  if (!context) throw new Error('useWorkerUi must be used inside WorkerFrame')
  return context
}

function glassSurface(tokens: WorkerThemeTokens, tone: WorkerTone = 'base') {
  const warmAccent = tokens.mode === 'dark' ? 'rgba(224,160,107,0.20)' : 'rgba(255,184,102,0.23)'
  const softWarmAccent = tokens.mode === 'dark' ? 'rgba(224,160,107,0.13)' : 'rgba(255,184,102,0.14)'
  const mintWash = tokens.mode === 'dark' ? 'rgba(105,222,198,0.17)' : 'rgba(183,246,231,0.34)'
  const backgroundColor =
    tone === 'raised' || tone === 'strong'
      ? tokens.glassStrong
      : tone === 'cream' || tone === 'warm'
        ? tokens.mode === 'dark'
          ? 'rgba(59,41,27,0.72)'
          : 'rgba(255,240,222,0.70)'
        : tone === 'mint'
          ? tokens.mode === 'dark'
            ? 'rgba(23,59,53,0.72)'
            : 'rgba(220,243,236,0.68)'
          : tone === 'cyan'
            ? tokens.mode === 'dark'
              ? 'rgba(21,54,58,0.72)'
              : 'rgba(232,249,251,0.68)'
            : tone === 'depth'
              ? tokens.mode === 'dark'
                ? 'rgba(13,27,26,0.70)'
                : 'rgba(234,246,241,0.70)'
              : tokens.glass

  return {
    backgroundColor,
    borderColor: tokens.glassBorder,
    borderWidth: 1,
    backdropFilter: 'blur(24px) saturate(1.18)',
    boxShadow: tone === 'raised' || tone === 'base' || tone === 'strong' ? tokens.shadow : tokens.softShadow,
    experimental_backgroundImage:
      tone === 'cream' || tone === 'warm'
        ? `radial-gradient(circle at 84% 42%, ${warmAccent}, transparent 31%), radial-gradient(circle at 18% 88%, ${mintWash}, transparent 38%), linear-gradient(120deg, rgba(201,248,237,0.62), rgba(255,243,205,0.48))`
        : tone === 'mint'
          ? `radial-gradient(circle at 88% 16%, ${softWarmAccent}, transparent 22%), radial-gradient(circle at 74% 62%, rgba(22,185,168,0.26), transparent 34%), linear-gradient(145deg, rgba(255,255,255,0.50), rgba(221,248,241,0.56))`
        : tone === 'cyan'
            ? `radial-gradient(circle at 92% 12%, ${softWarmAccent}, transparent 20%), radial-gradient(circle at 78% 62%, rgba(33,165,177,0.28), transparent 34%), linear-gradient(145deg, rgba(255,255,255,0.50), rgba(221,249,247,0.58))`
            : `radial-gradient(circle at 94% 10%, ${softWarmAccent}, transparent 20%), radial-gradient(circle at 10% 92%, ${mintWash}, transparent 34%), linear-gradient(145deg, rgba(255,255,255,0.50), rgba(224,248,242,0.34))`,
    shadowColor: '#0D4641',
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: tokens.mode === 'dark' ? 0.28 : 0.13,
    shadowRadius: 28,
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  canvas: { alignItems: 'center', flex: 1, overflow: 'hidden' },
  backdropWarm: { borderRadius: 999, bottom: 72, height: 188, left: -86, opacity: 0.16, position: 'absolute', width: 188 },
  backdropMint: { borderRadius: 999, height: 270, opacity: 0.22, position: 'absolute', right: -108, top: 34, width: 270 },
  backdropCyan: { borderRadius: 999, height: 184, left: -80, opacity: 0.14, position: 'absolute', top: 190, width: 184 },
  sectionMotionField: { bottom: 0, overflow: 'hidden', position: 'absolute', top: 0, zIndex: 0 },
  sectionMotionRibbon: { borderRadius: 999, filter: 'blur(8px)', height: 760, left: 18, position: 'absolute', width: 62 },
  sectionMotionOrb: { borderRadius: 999, filter: 'blur(20px)', height: 214, position: 'absolute', right: -82, width: 214 },
  sectionMotionCaustic: { borderRadius: 999, bottom: 84, filter: 'blur(22px)', height: 146, left: -86, position: 'absolute', width: 246 },
  sectionMotionGlint: { bottom: 52, filter: 'blur(2px)', height: 260, left: '50%', position: 'absolute', width: 34 },
  scrollContent: { gap: 14, paddingHorizontal: workerFrameHorizontalPadding, paddingTop: 8, zIndex: 2 },
  kicker: { fontSize: 12, fontWeight: '600', letterSpacing: 0 },
  screenTitle: { fontSize: 27, fontWeight: '600', letterSpacing: 0, lineHeight: 32 },
  glassTopHighlight: { height: 1, left: 16, opacity: 0.82, position: 'absolute', right: 16, top: 0, zIndex: 0 },
  glassSheen: { height: '170%', left: -72, opacity: 0.42, position: 'absolute', top: -46, transform: [{ rotate: '11deg' }], width: 58, zIndex: 0 },
  glassMotionOrb: { borderRadius: 999, filter: 'blur(12px)', height: 126, position: 'absolute', right: -40, top: -34, width: 126, zIndex: 0 },
  glassMotionOrbCompact: { height: 78, right: -28, top: -24, width: 78 },
  glassMotionRibbon: { borderRadius: 999, filter: 'blur(7px)', height: 168, left: 16, position: 'absolute', top: -168, width: 58, zIndex: 0 },
  glassMotionRibbonCompact: { height: 118, left: 8, top: -118, width: 38 },
  glassMotionCore: { borderRadius: 999, filter: 'blur(2px)', height: 118, left: 56, position: 'absolute', top: -118, width: 13, zIndex: 0 },
  glassMotionCoreCompact: { height: 86, left: 36, top: -86, width: 9 },
  mapStage: { borderRadius: 34, gap: 10, marginBottom: 42, minHeight: 448, overflow: 'hidden', padding: 12, position: 'relative' },
  searchPill: { alignItems: 'center', borderRadius: 24, flexDirection: 'row', gap: 8, left: 13, minHeight: 46, paddingHorizontal: 14, position: 'absolute', right: 13, top: 13, zIndex: 4 },
  searchText: { flex: 1, fontSize: 15, fontWeight: '600' },
  mapViewport: { borderRadius: 30, minHeight: 318, overflow: 'hidden', position: 'relative' },
  mapFogTop: { height: 92, left: 0, opacity: 0.38, position: 'absolute', right: 0, top: 0 },
  mapFogBottom: { bottom: -6, height: 86, left: 0, opacity: 0.5, position: 'absolute', right: 0 },
  mapCyanVeil: { borderRadius: 999, filter: 'blur(22px)', height: 118, left: '50%', marginLeft: -59, opacity: 0.12, position: 'absolute', top: 120, width: 118 },
  mapChipTop: { left: 6, position: 'absolute', top: 15 },
  mapZonePill: { borderRadius: 22, left: 6, maxWidth: '64%', paddingHorizontal: 12, paddingVertical: 9, position: 'absolute', top: 9 },
  mapChipTitle: { fontSize: 14, fontWeight: '600', letterSpacing: 0 },
  mapChipMeta: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  mapCardsRow: { flexDirection: 'row', gap: 12, marginTop: -56, zIndex: 5 },
  mapFeatureCard: { borderRadius: 22, flex: 1, minHeight: 100, overflow: 'hidden', padding: 13, position: 'relative' },
  mapFeatureTitle: { fontSize: 17, fontWeight: '600', letterSpacing: 0 },
  mapFeatureIcon: { alignItems: 'center', borderRadius: 999, bottom: 12, height: 50, justifyContent: 'center', position: 'absolute', right: 12, width: 50 },
  mapServiceHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 1 },
  beaconWrap: { alignItems: 'center', height: 104, justifyContent: 'center', left: '50%', marginLeft: -52, marginTop: -28, position: 'absolute', top: '48%', width: 104 },
  beaconHalo: { borderRadius: 999, filter: 'blur(4px)', height: 74, opacity: 0.16, position: 'absolute', width: 74 },
  beaconCrescent: { borderBottomWidth: 10, borderLeftWidth: 8, borderRadius: 999, bottom: 31, height: 38, opacity: 0.2, position: 'absolute', transform: [{ rotate: '18deg' }], width: 42 },
  beaconPin: { alignItems: 'center', borderRadius: 999, borderWidth: 2, height: 22, justifyContent: 'center', opacity: 0.82, width: 22 },
  beaconCore: { borderRadius: 999, height: 6, opacity: 0.82, width: 6 },
  shiftCard: { borderRadius: 25, gap: 7, marginTop: 2, overflow: 'hidden', padding: 10, position: 'relative' },
  rowBetween: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  identityRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  titleStack: { flex: 1, gap: 4 },
  heroTitle: { fontSize: 18, fontWeight: '600', letterSpacing: 0 },
  bodyText: { fontSize: 13.5, fontWeight: '500', lineHeight: 19 },
  toggleTrack: { alignItems: 'flex-end', borderRadius: 999, height: 32, justifyContent: 'center', padding: 4, width: 58 },
  toggleKnob: { borderRadius: 999, height: 24, width: 24 },
  metricRow: { flexDirection: 'row', gap: 8 },
  metric: { alignItems: 'center', borderRadius: 15, borderWidth: 1, flex: 1, gap: 1, justifyContent: 'center', minHeight: 40, overflow: 'hidden', padding: 6, position: 'relative' },
  metricValue: { fontSize: 15, fontVariant: ['tabular-nums'], fontWeight: '600', position: 'relative', textAlign: 'center', zIndex: 2 },
  metricLabel: { fontSize: 10, fontWeight: '500', position: 'relative', textAlign: 'center', zIndex: 2 },
  requestSheet: { borderRadius: 32, gap: 8, marginTop: -2, overflow: 'hidden', padding: 14, position: 'relative' },
  requestSheetCompact: { marginTop: 0 },
  serviceBadge: { alignItems: 'center', borderRadius: 999, flexDirection: 'row', gap: 6, minHeight: 34, paddingHorizontal: 10 },
  serviceBadgeText: { fontSize: 13, fontWeight: '600' },
  countdownOrbit: { alignItems: 'center', borderRadius: 999, borderWidth: 3, justifyContent: 'center', minHeight: 38, minWidth: 70, paddingHorizontal: 10 },
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
  actionRow: { flexDirection: 'row', gap: 10 },
  adminSwitchWrap: { flexDirection: 'row' },
  pressButton: { alignItems: 'center', borderRadius: 18, flex: 1, justifyContent: 'center', minHeight: 46 },
  disabledButton: { opacity: 0.52 },
  pressButtonText: { fontSize: 15, fontWeight: '600' },
  operationalBand: { flexDirection: 'row', gap: 12 },
  quickPanel: { borderRadius: 25, flex: 1, gap: 5, minHeight: 132, overflow: 'hidden', padding: 14, position: 'relative' },
  quickValue: { fontSize: 23, fontVariant: ['tabular-nums'], fontWeight: '600' },
  quickTitle: { fontSize: 14, fontWeight: '600' },
  quickNote: { fontSize: 12, fontWeight: '600', lineHeight: 17 },
  sectionTitle: { fontSize: 18, fontWeight: '600' },
  sectionAction: { fontSize: 13, fontWeight: '600' },
  timelineCard: { borderRadius: 27, gap: 12, overflow: 'hidden', padding: 15, position: 'relative' },
  timelineItem: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  timelineRail: { borderRadius: 999, height: 10, width: 10 },
  timelineText: { fontSize: 14, fontWeight: '600' },
  segmentShell: { borderRadius: 999, flexDirection: 'row', gap: 6, overflow: 'hidden', padding: 6, position: 'relative' },
  segmentPill: { alignItems: 'center', borderRadius: 999, flex: 1, justifyContent: 'center', minHeight: 38, paddingHorizontal: 4 },
  segmentText: { fontSize: 13, fontWeight: '600' },
  flowCard: { borderRadius: 28, gap: 10, overflow: 'hidden', padding: 16, position: 'relative' },
  statusPill: { borderRadius: 999, fontSize: 12, fontWeight: '600', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 6 },
  cardTitle: { fontSize: 17, fontWeight: '600', letterSpacing: 0, lineHeight: 23 },
  chatShell: { borderRadius: 32, gap: 12, minHeight: 593, overflow: 'hidden', padding: 12, position: 'relative' },
  kaelRelayCard: { borderRadius: 27, gap: 12, padding: 14 },
  emptyChatState: { alignItems: 'center', borderRadius: 28, gap: 8, minHeight: 194, justifyContent: 'center', padding: 20 },
  kaelClientStage: { borderRadius: 25, borderWidth: 1, flex: 1, gap: 12, justifyContent: 'space-between', minHeight: 513, overflow: 'hidden', padding: 12, position: 'relative' },
  kaelClientStageEmpty: { opacity: 0.92 },
  kaelBlankCanvas: { flex: 1, minHeight: 363, overflow: 'hidden', position: 'relative' },
  kaelCanvasOrbLarge: { borderRadius: 999, height: 168, left: -48, opacity: 0.09, position: 'absolute', top: 46, width: 168 },
  kaelCanvasOrbWarm: { borderRadius: 999, bottom: 42, height: 126, opacity: 0.08, position: 'absolute', right: -34, width: 126 },
  chatStack: { gap: 10 },
  chatBubble: { alignSelf: 'flex-start', borderRadius: 22, maxWidth: '88%', padding: 13 },
  chatBubbleMine: { alignSelf: 'flex-end' },
  chatWho: { fontSize: 12, fontWeight: '600' },
  chatText: { fontSize: 14, fontWeight: '600', lineHeight: 20, marginTop: 3 },
  chatComposer: { alignItems: 'center', borderRadius: 24, borderWidth: 1, flexDirection: 'row', gap: 8, minHeight: 64, overflow: 'hidden', padding: 7 },
  composerTool: { alignItems: 'center', borderRadius: 16, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  composerToolText: { fontSize: 26, fontWeight: '300', letterSpacing: 0, lineHeight: 28 },
  chatInput: { flex: 1, flexShrink: 1, fontSize: 15, fontWeight: '500', minHeight: 40, minWidth: 0, paddingHorizontal: 8 },
  sendButton: { alignItems: 'center', borderRadius: 17, flexShrink: 0, height: 42, justifyContent: 'center', width: 42 },
  earningsHero: { borderRadius: 32, gap: 12, overflow: 'hidden', padding: 18, position: 'relative' },
  earningsOrb: { alignItems: 'center', borderRadius: 999, height: 58, justifyContent: 'center', width: 58 },
  moneyText: { fontSize: 34, fontVariant: ['tabular-nums'], fontWeight: '600', letterSpacing: 0 },
  listCard: { borderRadius: 29, gap: 4, overflow: 'hidden', padding: 10, position: 'relative' },
  listRow: { alignItems: 'center', flexDirection: 'row', gap: 11, minHeight: 54, paddingHorizontal: 8 },
  listTitle: { flex: 1, fontSize: 14, fontWeight: '600' },
  listMeta: { fontSize: 12, fontWeight: '600', maxWidth: 120, textAlign: 'right' },
  profileHead: { alignItems: 'center', borderRadius: 30, flexDirection: 'row', gap: 13, overflow: 'hidden', padding: 16, position: 'relative' },
  avatarWrap: { alignItems: 'center', borderRadius: 999, height: 56, justifyContent: 'center', width: 56 },
  profileName: { fontSize: 17, fontWeight: '600', letterSpacing: 0 },
  profileBadge: { alignItems: 'center', borderRadius: 999, height: 42, justifyContent: 'center', width: 42 },
  greenScoreCard: { borderRadius: 30, gap: 8, overflow: 'hidden', padding: 17, position: 'relative' },
  scoreNumber: { fontSize: 40, fontVariant: ['tabular-nums'], fontWeight: '600', letterSpacing: 0, lineHeight: 46 },
  scoreStats: { flexDirection: 'row', gap: 8, marginTop: 4 },
  skillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  skillPill: { borderRadius: 999, borderWidth: 1, justifyContent: 'center', minHeight: 38, paddingHorizontal: 13 },
  skillText: { fontSize: 13, fontWeight: '600' },
  preferenceCard: { borderRadius: 29, gap: 6, overflow: 'hidden', padding: 10, position: 'relative' },
  preferenceRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 54, paddingHorizontal: 8 },
  preferenceTitle: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 11 },
  preferenceSwitch: { borderRadius: 999, borderWidth: 1, height: 34, justifyContent: 'center', padding: 4, width: 62 },
  preferenceKnob: { borderRadius: 999, height: 24, width: 24 },
  preferenceKnobRight: { alignSelf: 'flex-end' },
  dockWrap: { alignSelf: 'center', minHeight: workerDockHeight, position: 'absolute', zIndex: 30 },
  dockGlassAura: { borderRadius: 999, bottom: -20, filter: 'blur(24px)', height: 84, left: 20, position: 'absolute', right: 20, zIndex: -1 },
  dockWarmAura: { borderRadius: 999, bottom: -10, filter: 'blur(22px)', height: 48, opacity: 0.12, position: 'absolute', right: -10, width: 100, zIndex: -1 },
  workerDock: { alignItems: 'center', borderRadius: 33, borderWidth: 1, flexDirection: 'row', gap: 5, height: workerDockHeight, justifyContent: 'space-around', overflow: 'hidden', padding: 7, position: 'relative' },
  dockLiquidPool: { borderRadius: 999, bottom: 4, filter: 'blur(15px)', height: 56, left: 0, opacity: 0.27, position: 'absolute', width: 96, zIndex: 0 },
  dockLiquidWake: { borderRadius: 999, bottom: 1, filter: 'blur(18px)', height: 62, left: 0, position: 'absolute', width: 106, zIndex: 0 },
  dockBottomReflection: { borderRadius: 999, bottom: 7, height: 17, left: 38, opacity: 0.18, position: 'absolute', right: 38, zIndex: 0 },
  dockMotionSheen: { bottom: -18, filter: 'blur(1px)', position: 'absolute', top: -18, width: 54, zIndex: 0 },
  dockActiveGlow: { borderRadius: 999, filter: 'blur(11px)', height: 52, position: 'absolute', width: 58 },
  dockItem: { alignItems: 'center', borderRadius: 27, flex: 1, height: 54, justifyContent: 'center', position: 'relative', zIndex: 2 },
  dockDot: { borderRadius: 999, bottom: 5, height: 3, position: 'absolute', width: 3 },
  dockKaelImage: { height: 34, width: 34 },
  motionSweep: { borderRadius: 999, height: 76, position: 'absolute', top: -18, width: 96 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  hiddenMarker: { height: 0, opacity: 0, width: 0 },
})
