import AsyncStorage from '@react-native-async-storage/async-storage'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams, usePathname, useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { createContext, type ReactNode, use, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react'
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native'
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { HCMC_DISTRICTS, normalizeDistrict, type DistrictSlug, type LocalDeal, type LocalDealStatus, type ServiceType, type WorkerRegisterInput, type WorkerVerificationStatus } from '@home-services/shared'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { FloatingGlassTabBar, type FloatingGlassTabItem } from '@/components/ui/floating-glass-tab-bar'
import { GlassModalSheet } from '@/components/ui/glass-modal-sheet'
import { GlassPressable } from '@/components/ui/glass-pressable'
import { ReduceMotionAwareEntranceView, reduceMotionAwarePressStyle } from '@/components/ui/reduce-motion-aware-animation'
import { appCopy, localizedProblemLabel, localizedServiceLabel, localizedStatusLabel, setAppLanguage, type AppLanguage, useAppLanguage } from '@/lib/app-language'
import type { EarningsResponse, WorkerProfileResponse } from '@/lib/api-types'
import { useAuth } from '@/lib/auth-provider'
import { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { uploadJobMediaDrafts, uploadWorkerVerificationDrafts, type LocalMediaUploadDraft } from '@/lib/media-upload'

const WORKER_XANHSM_REFERENCE_AUDIT = 'WORKER_XANHSM_REFERENCE_AUDIT: XanhSM map shell translated into Home Services worker production UI'
const WORKER_PRODUCTION_CONTRACT = 'WORKER_PRODUCTION_CONTRACT: docs/design/worker-production-contract.md'
const WORKER_CLIENT_BASELINE_AUDIT = 'WORKER_CLIENT_BASELINE_AUDIT: customer V4 semantic layers matched for worker production'
const WORKER_THEME_LANGUAGE_STORE = 'WORKER_THEME_LANGUAGE_STORE: worker-theme-language-switch AsyncStorage useSyncExternalStore'
const WORKER_FLEXIBLE_MAP_SHELL = 'WORKER_FLEXIBLE_MAP_SHELL: worker-map-google-ready flexible-map-preview'
const WORKER_DOCK_GLASS_MOTION = 'WORKER_DOCK_GLASS_MOTION: worker-dock-glass-aura worker-liquid-glass-dock worker-dock-outline-chat-icon worker-dock-icon-system'
const WORKER_GLASSMORPHISM_MOTION_LAYER = 'WORKER_GLASSMORPHISM_MOTION_LAYER: shared-glass-pressable static-depth-layer centered-metric-type'
const WORKER_CHATBOX_EMPTY_COMPOSER = 'WORKER_CHATBOX_EMPTY_COMPOSER: worker-kael-empty-chat-state worker-kael-local-chat-input submitWorkerKaelLocalDraft'
const WORKER_NO_FULL_ADDRESS_BEFORE_ACCEPT = 'WORKER_NO_FULL_ADDRESS_BEFORE_ACCEPT: general area only until worker accepts'
const WORKER_NO_FAKE_PAYMENT_DATA = 'WORKER_NO_FAKE_PAYMENT_DATA: worker-no-fake-payment-data'
const WORKER_JOBROOM_KAEL_HANDOFF = 'WORKER_JOBROOM_KAEL_HANDOFF: worker-jobroom-kael-handoff worker-jobroom-waiting-room worker-jobroom-privacy-gate'
const WORKER_JOBROOM_WAITING_COPY_CONTRACT = 'Chờ Kael đưa yêu cầu vào phòng việc.'
void WORKER_JOBROOM_WAITING_COPY_CONTRACT

const WORKER_THEME_STORAGE_KEY = 'home-services.worker.theme.production'
const workerDockHeight = 66
const workerDockBottomMargin = 6
const workerDockClearance = workerDockHeight + workerDockBottomMargin + 76
const workerFrameHorizontalPadding = 14.8
const kaelHead = require('../../assets/kael-model-8a-head.png')

type WorkerThemeMode = 'dark' | 'light'
type WorkerLanguageMode = AppLanguage
type WorkerVerificationFileSlot = 'cccdFront' | 'cccdBack' | 'selfie'

type WorkerActiveTab = 'chat' | 'earnings' | 'home' | 'jobs' | 'profile'
type WorkerJobsTab = 'active' | 'needs' | 'waiting'
type WorkerTone = 'base' | 'cream' | 'cyan' | 'depth' | 'mint' | 'raised' | 'strong' | 'warm'
type WorkerHeaderPillTone = 'cream' | 'mint'
type WorkerIconName =
  | 'back'
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
  | 'plus'
  | 'send'
  | 'shield'
  | 'spark'
  | 'sun'
  | 'tools'
  | 'trend'
  | 'water'
type WorkerChatMessage = { id: string; mine?: boolean; system?: boolean; text: string; who: string }
type WorkerBroadcastView = NonNullable<LocalDeal['broadcast']>

let lastWorkerDockActive: WorkerActiveTab = 'home'
const workerJobsTabKeys: WorkerJobsTab[] = ['waiting', 'active', 'needs']

function isWorkerJobsTab(value: unknown): value is WorkerJobsTab {
  return typeof value === 'string' && workerJobsTabKeys.includes(value as WorkerJobsTab)
}
const workerMoneyFormatters = {
  en: new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }),
  vi: new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }),
} as const
const workerServiceAreaAnchors: Array<{ lat: number; lng: number; slug: Exclude<DistrictSlug, 'hcmc_all'> }> = [
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
  canvas: '#F8FBF5',
  base: '#FFFDF7',
  raised: '#FFFFFF',
  strong: '#FBFFFC',
  depth: '#E5F1EB',
  mint: '#DCFBF3',
  cyan: '#E8FCFA',
  cream: '#FFF8EB',
  warm: '#FFF8EB',
  glass: 'rgba(255,255,255,0.58)',
  glassStrong: 'rgba(255,255,255,0.74)',
  glassBorder: 'rgba(255,255,255,0.82)',
  glassHighlight: 'rgba(255,255,255,0.70)',
  border: 'rgba(35,96,84,0.13)',
  borderStrong: 'rgba(8,120,110,0.22)',
  ink: '#12231F',
  muted: '#647672',
  subtle: '#7D958F',
  primary: '#08786E',
  primaryText: '#FFFFFF',
  aqua: '#51BBC0',
  copper: '#BB743D',
  line: 'rgba(35,96,84,0.13)',
  mapLine: 'rgba(39,108,96,0.13)',
  mapBlock: 'rgba(255,255,255,0.56)',
  sheen: 'rgba(255,255,255,0.64)',
  shadow: '0 14px 36px rgba(13,70,65,0.11)',
  softShadow: '0 9px 24px rgba(13,70,65,0.08)',
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
  shadow: '0 18px 50px rgba(0,0,0,0.28)',
  softShadow: '0 10px 30px rgba(0,0,0,0.20)',
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
      phases: ['Chờ duyệt', 'Tóm tắt', 'Xác nhận', 'Di chuyển'],
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
      brief: ['Chưa có yêu cầu mới từ khách.'],
      customerEstimate: 'Khách ước tính',
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
      emptyBody: 'Kael sẽ đưa yêu cầu mới vào đây khi có khách xác nhận tìm thợ.',
      waitingEmptyTitle: 'Chưa có yêu cầu mới',
      waitingEmptyBody: 'Yêu cầu mới sẽ hiện ở mục Chờ nhận.',
      activeEmptyTitle: 'Chưa nhận việc',
      activeEmptyBody: 'Việc đã nhận và Phòng việc sẽ hiện tại đây.',
      needsEmptyTitle: 'Không có mục chặn',
      needsEmptyBody: 'Phát sinh hoặc bước cần duyệt sẽ hiện ở đây.',
      scopeStatus: 'Khách quyết định',
      scopeTitle: 'Thay đổi phạm vi',
      scopeBody: 'Thợ chờ khách xác nhận trước khi tiếp tục phần việc mới.',
      jobRoomCta: 'Mở phòng việc',
    },
    chat: {
      eyebrow: 'Tin nhắn',
      title: 'Phòng việc',
      jobRoomTitle: 'Phòng việc Kael',
      relaySubtitle: 'Kael chuyển tiếp với khách',
      acceptedPill: 'Đã nhận',
      waitingTitle: 'Đang chờ Kael đưa việc',
      waitingBody: 'Khi khách xác nhận tìm thợ, Kael sẽ mở tóm tắt công việc, khu vực chung và ghi chú việc.',
      waitingInput: 'Nhắn trong Phòng việc...',
      handoffTitle: 'Kael giao việc',
      privacyGate: 'Địa chỉ chi tiết chỉ mở sau khi thợ chấp nhận.',
      acceptedGate: 'Đã nhận việc. Ghi chú hiện lưu trong phiên này.',
      lockedGate: 'Chấp nhận việc để mở ghi chú việc.',
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
      worker: 'Thợ',
      kael: 'Kael',
    },
    earnings: {
      eyebrow: 'Thu nhập',
      title: 'Thu nhập',
      subtitle: 'Theo dõi tiền công dễ hiểu hơn',
      today: 'Hôm nay',
      month: 'Tháng này',
      noReconciliation: 'Chờ dữ liệu',
      body: '',
      complete: 'Hoàn tất',
      waiting: 'Chờ khách',
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
      phases: ['Pending', 'Briefed', 'Confirm', 'Travel'],
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
      brief: ['Waiting for a customer request.'],
      customerEstimate: 'Customer estimate',
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
      emptyBody: 'Kael will place new requests here after a customer confirms worker search.',
      waitingEmptyTitle: 'No new request',
      waitingEmptyBody: 'New requests appear in the Pending tab.',
      activeEmptyTitle: 'No accepted job',
      activeEmptyBody: 'Accepted work and JobRoom appear here.',
      needsEmptyTitle: 'Nothing blocked',
      needsEmptyBody: 'Scope or approval blockers appear here.',
      scopeStatus: 'Customer decides',
      scopeTitle: 'Scope change',
      scopeBody: 'Wait for the customer decision before continuing the changed scope.',
      jobRoomCta: 'Open JobRoom',
    },
    chat: {
      eyebrow: 'Chat',
      title: 'JobRoom',
      jobRoomTitle: 'Kael JobRoom',
      relaySubtitle: 'Kael relays with the customer',
      acceptedPill: 'Accepted',
      waitingTitle: 'Waiting for Kael to hand off a job',
      waitingBody: 'When a customer confirms worker search, JobRoom opens the job brief, general area, and job notes.',
      waitingInput: 'Message in JobRoom...',
      handoffTitle: 'Kael handoff',
      privacyGate: 'Detailed address opens only after acceptance.',
      acceptedGate: 'Job accepted. Notes are saved for this session.',
      lockedGate: 'Accept the job to unlock job notes.',
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
      worker: 'Worker',
      kael: 'Kael',
    },
    earnings: {
      eyebrow: 'Earnings',
      title: 'Earnings',
      subtitle: 'Track payout clearly',
      today: 'Today',
      month: 'This month',
      noReconciliation: 'Waiting for data',
      body: '',
      complete: 'Completed',
      waiting: 'Waiting',
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
    finalPrice: 'Giá cuối cùng',
    completionNote: 'Ghi chú hoàn tất',
    completionPhoto: 'Ảnh nghiệm thu',
    completionPhotoRequired: 'Cần ít nhất 1 ảnh nghiệm thu',
    completionPhotoCount: (count: number) => `${count} ảnh đã chọn`,
    addCompletionPhoto: 'Thêm ảnh',
    completeLater: 'Để sau',
    scopeDescription: 'Mô tả phần phát sinh',
    scopeSubmit: 'Yêu cầu đổi phạm vi',
    scopeWaiting: 'Chờ khách quyết định thay đổi phạm vi.',
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
      worker_complete_job: 'Báo hoàn tất',
    },
    alerts: {
      finalPriceRequiredTitle: 'Cần giá cuối cùng',
      finalPriceRequiredBody: 'Nhập giá cuối cùng thực tế trước khi báo hoàn tất.',
      completionNoteRequiredTitle: 'Cần ghi chú hoàn tất',
      completionNoteRequiredBody: 'Nhập ghi chú ngắn về việc đã làm trước khi báo hoàn tất.',
      completionPhotoRequiredTitle: 'Cần ảnh nghiệm thu',
      completionPhotoRequiredBody: 'Thêm ít nhất một ảnh sau sửa để giữ chuỗi bằng chứng đầy đủ.',
      completionUploadTitle: 'Chưa tải được ảnh',
      completionPermissionTitle: 'Cần quyền chọn ảnh',
      completionPermissionBody: 'Cho phép truy cập ảnh để thêm ảnh nghiệm thu.',
      completeTitle: 'Xác nhận báo hoàn tất?',
      completeBody: 'Hệ thống sẽ báo khách kiểm tra và xác nhận. Thanh toán vẫn khóa ở giai đoạn này.',
      scopeDescriptionTitle: 'Cần mô tả phạm vi mới',
      scopeDescriptionBody: 'Nhập rõ phần phát sinh để khách quyết định.',
      scopeConfirmTitle: 'Gửi yêu cầu đổi phạm vi?',
      scopeConfirmBody: 'Hệ thống sẽ khóa tiến độ cho tới khi khách duyệt hoặc từ chối.',
      cancelReasonTitle: 'Cần lý do hủy',
      cancelReasonBody: 'Nhập lý do cụ thể. Hệ thống sẽ hủy lượt nhận việc này và bắt đầu tìm thợ thay thế sau khi gửi.',
      cancelConfirmTitle: 'Gửi yêu cầu hủy việc?',
      cancelConfirmBody: 'Sau khi gửi, lượt nhận việc của bạn sẽ được hủy và hệ thống tự động tìm thợ thay thế cho khách.',
    },
  },
  en: {
    hiddenAddress: 'detailed address hidden',
    finalPrice: 'Final price',
    completionNote: 'Completion note',
    completionPhoto: 'Completion photo',
    completionPhotoRequired: 'At least 1 completion photo required',
    completionPhotoCount: (count: number) => `${count} photo${count === 1 ? '' : 's'} selected`,
    addCompletionPhoto: 'Add photo',
    completeLater: 'Later',
    scopeDescription: 'New scope details',
    scopeSubmit: 'Request scope change',
    scopeWaiting: 'Waiting for the customer to decide on the scope change.',
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
      worker_complete_job: 'Mark complete',
    },
    alerts: {
      finalPriceRequiredTitle: 'Final price required',
      finalPriceRequiredBody: 'Enter the real final price before marking the job complete.',
      completionNoteRequiredTitle: 'Completion note required',
      completionNoteRequiredBody: 'Add a short note about the completed work before marking the job complete.',
      completionPhotoRequiredTitle: 'Completion photo required',
      completionPhotoRequiredBody: 'Add at least one after-repair photo to keep the evidence trail complete.',
      completionUploadTitle: 'Photo upload failed',
      completionPermissionTitle: 'Photo permission required',
      completionPermissionBody: 'Allow photo access to add completion evidence.',
      completeTitle: 'Mark job complete?',
      completeBody: 'The customer will be asked to review and confirm. Payment remains locked at this stage.',
      scopeDescriptionTitle: 'New scope details required',
      scopeDescriptionBody: 'Describe the added work so the customer can decide.',
      scopeConfirmTitle: 'Send scope change request?',
      scopeConfirmBody: 'Progress will stay locked until the customer approves or rejects it.',
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

type WorkerCopy = (typeof workerCopy)[WorkerLanguageMode]
type WorkerUiContextValue = {
  copy: WorkerCopy
  language: WorkerLanguageMode
  mode: WorkerThemeMode
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

function getReducedTransparencyWorkerTokens(tokens: WorkerThemeTokens): WorkerThemeTokens {
  return {
    ...tokens,
    glass: tokens.mode === 'dark' ? '#122724' : '#FFFDF8',
    glassBorder: tokens.borderStrong,
    glassHighlight: 'transparent',
    glassStrong: tokens.mode === 'dark' ? '#162B28' : '#FFFFFF',
    shadow: 'none',
    sheen: 'transparent',
    softShadow: 'none',
  }
}

function useWorkerFrameCopy() {
  const language = useAppLanguage()
  return workerCopy[language]
}

function getWorkerVisibleDeal(deal: LocalDeal | null) {
  if (!deal?.broadcast) return null
  return deal.broadcast.status === 'declined' || deal.broadcast.status === 'expired' ? null : deal
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
  const profileValue = localizedWorkerVerificationStatus(workerProfile?.verification_status ?? 'draft', language)

  return (
    <WorkerFrame active="home" eyebrow={copy.home.eyebrow} headerPill={profileValue} subtitle={copy.home.readinessSubtitle} title={copy.home.readinessTitle} testID="worker-home-surface">
      <WorkerMapStage />
      <WorkerReadinessActionPanel />
      <WorkerHomeServiceGrid />
      <WorkerHomeMiniGrid />
      {hasIncomingRequest ? <IncomingRequestSheet /> : null}
    </WorkerFrame>
  )
}

export function WorkerJobsSurface() {
  const copy = useWorkerFrameCopy()
  const language = useAppLanguage()
  const params = useLocalSearchParams<{ tab?: string }>()
  const { replace } = useRouter()
  const { selectors, state } = useFrontendWorkflow()
  const requestedTab = isWorkerJobsTab(params.tab) ? params.tab : null
  const [activeJobsTab, setActiveJobsTab] = useState<WorkerJobsTab>(requestedTab ?? 'active')
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
  const activeJobBriefLines = deal?.broadcast ? buildWorkerBroadcastBrief(deal, deal.broadcast, selectors.currentStatus, language) : []
  const showScopeChangeCard = Boolean(deal && selectors.currentStatus === 'scope_change_pending')
  const showCompletionEvidenceCard = Boolean(deal && selectors.currentStatus === 'repairing')
  const acceptedJob = isAcceptedLocalWorkerDeal(deal)
  const showAcceptedActionPanel = Boolean(acceptedJob && deal?.broadcast && [
    'inspecting',
    'repairing',
    'scope_change_pending',
  ].includes(selectors.currentStatus ?? ''))
  const activeJobStatus = deal && acceptedJob ? localizedStatusLabel(selectors.currentStatus, language) : copy.jobs.emptyStatus
  const waitingStatus = deal?.broadcast && !acceptedJob ? localizedStatusLabel(selectors.currentStatus, language) : copy.jobs.emptyStatus
  const waitingHasRequest = Boolean(deal?.broadcast && !acceptedJob)
  const waitingCountdownLabel = waitingHasRequest && selectors.canWorkerAccept && deal?.broadcast?.secondsRemaining !== null && deal?.broadcast?.secondsRemaining !== undefined
    ? language === 'en'
      ? `${deal.broadcast.secondsRemaining}s`
      : `${deal.broadcast.secondsRemaining} giây`
    : null
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
  const jobsFramePill = activeJobsTab === 'waiting'
    ? waitingCountdownLabel ?? waitingStatus
    : activeJobsTab === 'active'
      ? activeJobStatus
      : showScopeChangeCard || showCompletionEvidenceCard
        ? (language === 'en' ? 'Needs action' : 'Cần xử lý')
        : appCopy[language].common.noData
  const jobsFramePillTone: WorkerHeaderPillTone = activeJobsTab === 'active' ? 'mint' : 'cream'
  const jobsFrameSubtitle = activeJobsTab === 'active' ? copy.jobs.subtitle : jobsFrameSubtitleFallback
  useEffect(() => {
    if (requestedTab) {
      setActiveJobsTab((current) => current === requestedTab ? current : requestedTab)
    }
  }, [requestedTab])
  const selectJobsTab = (tab: WorkerJobsTab) => {
    setActiveJobsTab(tab)
    replace(tab === 'active' ? '/(worker)/jobs' : `/(worker)/jobs?tab=${tab}`)
  }

  return (
    <WorkerFrame active="jobs" eyebrow={copy.jobs.title} headerPill={jobsFramePill} headerPillTone={jobsFramePillTone} subtitle={jobsFrameSubtitle} title={jobsFrameTitle} testID="worker-jobs-surface">
      <SegmentFilter activeTab={activeJobsTab} labels={copy.jobs.filters} onTabChange={selectJobsTab} />
      {activeJobsTab === 'waiting' ? (
        <>
          <View style={styles.hiddenMarker} testID="worker-jobs-waiting" />
          {waitingHasRequest ? (
            <>
              <CompactWorkerPresenceMap mode="waiting" />
              <IncomingRequestSheet compact />
            </>
          ) : (
            <>
              <CompactWorkerPresenceMap mode="waiting" />
              <WorkerEmptyJobPanel
                body={copy.jobs.waitingEmptyBody}
                icon="clock"
                primaryActionLabel={copy.home.readinessTitle}
                primaryActionPath="/(worker)/home"
                status={waitingStatus}
                testID="worker-jobs-waiting-empty-card"
                title={copy.jobs.waitingEmptyTitle}
                tone="base"
              />
            </>
          )}
        </>
      ) : null}
      {activeJobsTab === 'active' ? (
        <>
          {acceptedJob ? (
            <>
              <ActiveWorkerJobCard body={jobBody} briefLines={activeJobBriefLines} status={activeJobStatus} title={jobTitle} />
              {showScopeChangeCard || showCompletionEvidenceCard ? <WorkerNeedsReviewCard /> : <WorkerNeedsInlineEmptyCard />}
              {showAcceptedActionPanel ? (
                <View testID="worker-accepted-action-sheet">
                  <IncomingRequestSheet compact />
                </View>
              ) : null}
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
                status={copy.jobs.emptyStatus}
                testID="worker-jobs-active-empty-card"
                title={copy.jobs.activeEmptyTitle}
                tone="base"
              />
              <WorkerNeedsInlineEmptyCard />
            </>
          )}
        </>
      ) : null}
      {activeJobsTab === 'needs' ? (
        <>
          <WorkerNeedsReviewCard />
          {showAcceptedActionPanel ? (
            <View testID="worker-needs-accepted-action-sheet">
              <IncomingRequestSheet compact />
            </View>
          ) : null}
        </>
      ) : null}
    </WorkerFrame>
  )
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

  if (!hasScopeBlocker && !hasCompletionEvidenceBlocker) {
    return (
      <>
        <WorkerNeedsEmptyCard
          body={copy.jobs.needsEmptyBody}
          icon="brief"
          label={language === 'en' ? 'Scope review' : 'Phạm vi'}
          testID="worker-scope-change-empty"
          title={copy.jobs.needsEmptyTitle}
        />
        <WorkerNeedsEmptyCard
          body={language === 'en' ? 'Completion notes and photos appear here when a job reaches the finish step.' : 'Ghi chú và ảnh nghiệm thu sẽ hiện ở đây khi việc tới bước hoàn tất.'}
          icon="document"
          label={language === 'en' ? 'Completion media' : 'Ảnh nghiệm thu'}
          testID="worker-completion-evidence-empty"
          title={language === 'en' ? 'Completion evidence' : 'Ảnh nghiệm thu'}
        />
      </>
    )
  }

  if (hasCompletionEvidenceBlocker) {
    return (
    <View style={[styles.needsReviewCard, workerJobCardSurface(tokens)]} testID="worker-completion-evidence-blocker-card">
        <View style={styles.identityRow}>
          <View style={[styles.readinessBadge, { backgroundColor: tokens.glassStrong, borderColor: tokens.border }]}>
            <Icon name="document" active />
          </View>
          <View style={styles.titleStack}>
            <Text style={[styles.statusPill, { alignSelf: 'flex-start', backgroundColor: tokens.mint, borderColor: tokens.border, borderWidth: 1, color: tokens.primary }]} numberOfLines={1}>
              {language === 'en' ? 'Update needed' : 'Cần cập nhật'}
            </Text>
            <Text style={[styles.cardTitle, { color: tokens.ink }]} numberOfLines={2}>
              {language === 'en' ? 'Completion photos are missing' : 'Ảnh nghiệm thu còn thiếu'}
            </Text>
          </View>
          <Text style={[styles.statusPill, { backgroundColor: tokens.mint, borderColor: tokens.border, color: tokens.primary }]} numberOfLines={1}>
            B5
          </Text>
        </View>
        <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={3}>
          {language === 'en'
            ? 'Before marking the job complete, add after-repair photos and a short note so the evidence trail stays complete.'
            : 'Trước khi đánh dấu hoàn tất, cần gửi ảnh sau sửa và ghi chú ngắn để giữ chuỗi bằng chứng đầy đủ.'}
        </Text>
        <View style={styles.actionRow}>
          <PressButton label={actionCopy.addCompletionPhoto} onPress={() => replace('/(worker)/jobs?tab=needs')} testID="worker-needs-add-completion-photo" />
          <PressButton secondary label={actionCopy.completeLater} onPress={() => replace('/(worker)/jobs')} testID="worker-needs-completion-later" />
        </View>
      </View>
    )
  }

  const requestedScope = scopeChange?.requestedDescription ?? copy.jobs.scopeBody
  const reason = scopeChange?.reason ?? appCopy[language].common.noData
  const originalScope = deal?.draft.description || deal?.draft.inferredProblemLabel || copy.jobs.scopeBody
  const originalPrice = deal?.estimate?.priceRangeLabel ?? appCopy[language].common.noData
  const price =
    scopeChange?.priceMin && scopeChange.priceMax
      ? `${formatWorkerMoney(scopeChange.priceMin, language)} - ${formatWorkerMoney(scopeChange.priceMax, language)}`
      : appCopy[language].common.noData
  const scopeSummary = reason === appCopy[language].common.noData ? requestedScope : `${requestedScope}. ${reason}`

  return (
    <View style={[styles.needsReviewCard, workerJobCardSurface(tokens)]} testID="worker-scope-change-active">
      <View style={styles.identityRow}>
        <View style={[styles.readinessBadge, { backgroundColor: tokens.glassStrong, borderColor: tokens.border }]}>
          <Icon name="brief" active />
        </View>
        <View style={styles.titleStack}>
          <Text style={[styles.statusPill, { alignSelf: 'flex-start', backgroundColor: tokens.cream, borderColor: tokens.border, borderWidth: 1, color: tokens.copper }]} numberOfLines={1}>
            {copy.jobs.scopeStatus}
          </Text>
          <Text style={[styles.cardTitle, { color: tokens.ink }]} numberOfLines={2}>
            {copy.jobs.scopeTitle}
          </Text>
        </View>
      </View>
      <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={3}>
        {copy.jobs.scopeBody}
      </Text>
      <View style={[styles.jobDiagnosisBox, workerDiagnosisSurface(tokens)]} testID="worker-scope-change-kael-summary">
        <Text style={[styles.kaelBriefTitle, { color: tokens.ink }]} numberOfLines={1}>
          {copy.chat.briefTitle}
        </Text>
        <Text style={[styles.briefText, { color: tokens.muted }]} numberOfLines={3}>
          {scopeSummary}
        </Text>
      </View>
      <View style={styles.needsReviewGrid}>
        <JobRoomMetaCell label={language === 'en' ? 'Current scope' : 'Phạm vi hiện tại'} value={originalScope} />
        <JobRoomMetaCell label={language === 'en' ? 'Current estimate' : 'Ước tính hiện tại'} value={originalPrice} />
        <JobRoomMetaCell label={language === 'en' ? 'Requested work' : 'Phần việc mới'} value={requestedScope} />
        <JobRoomMetaCell label={language === 'en' ? 'Reason' : 'Lý do'} value={reason} />
        <JobRoomMetaCell label={language === 'en' ? 'Price review' : 'Giá chờ duyệt'} value={price} />
      </View>
      <View style={styles.actionRow}>
        <PressButton secondary label={copy.jobs.jobRoomCta} onPress={() => replace('/(worker)/chat')} testID="worker-needs-open-jobroom" />
      </View>
    </View>
  )
}

function WorkerNeedsInlineEmptyCard() {
  const { copy, language, tokens } = useWorkerUi()
  const { replace } = useRouter()

  return (
    <View style={[styles.needsReviewCard, workerJobCardSurface(tokens)]} testID="worker-jobs-active-needs-inline-empty-card">
      <SubtleGlassHighlight />
      <View style={styles.jobTopRow}>
        <View style={styles.titleStack}>
          <Text style={[styles.statusPill, { alignSelf: 'flex-start', backgroundColor: tokens.cream, borderColor: tokens.border, borderWidth: 1, color: tokens.copper }]} numberOfLines={1}>
            {copy.jobs.filters[2]}
          </Text>
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

function WorkerNeedsEmptyCard({ body, icon, label, testID, title }: { body: string; icon: WorkerIconName; label: string; testID: string; title: string }) {
  const { tokens } = useWorkerUi()

  return (
    <View style={[styles.needsReviewCard, workerJobCardSurface(tokens)]} testID={testID}>
      <SubtleGlassHighlight />
      <View style={styles.jobTopRow}>
        <View style={styles.titleStack}>
          <Text style={[styles.statusPill, { alignSelf: 'flex-start', backgroundColor: tokens.mint, borderColor: tokens.border, borderWidth: 1, color: tokens.primary }]} numberOfLines={1}>
            {label}
          </Text>
          <Text style={[styles.cardTitle, { color: tokens.ink }]} numberOfLines={2}>
            {title}
          </Text>
          <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={3}>
            {body}
          </Text>
        </View>
        <View style={[styles.readinessBadge, { backgroundColor: tokens.glassStrong, borderColor: tokens.border }]}>
          <Icon name={icon} active small />
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

  return (
    <WorkerFrame
      active="earnings"
      eyebrow={copy.earnings.eyebrow}
      headerIcon="trend"
      subtitle={copy.earnings.subtitle}
      title={copy.earnings.title}
      testID="worker-earnings-surface"
    >
      <WorkerEarningsHero />
      <WorkerEarningsSummary />
      <WorkerEarningsLedger />
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
  const frameWidth = Math.min(width, 430)
  const canvasBackgroundImage =
    mode === 'dark'
      ? 'radial-gradient(circle at 50% 12%, rgba(105,222,198,0.12), transparent 30%), linear-gradient(180deg, #071312 0%, #0B1715 100%)'
      : 'radial-gradient(circle at 50% 12%, rgba(142,231,217,0.18), transparent 28%), linear-gradient(180deg, #F4FAF7 0%, #F7FBF8 100%)'
  const canvasLayer = {
    backgroundColor: tokens.canvas,
    experimental_backgroundImage: reduceTransparency ? undefined : canvasBackgroundImage,
  } as any
  const routeIsFocused =
    (active === 'home' && pathname.endsWith('/home')) ||
    (active === 'jobs' && pathname.endsWith('/jobs')) ||
    (active === 'chat' && pathname.endsWith('/chat')) ||
    (active === 'earnings' && pathname.endsWith('/earnings')) ||
    (active === 'profile' && pathname.endsWith('/profile'))
  const workerUiValue = useMemo(() => ({ copy, language, mode, tokens }), [copy, language, mode, tokens])

  return (
    <WorkerUiContext.Provider value={workerUiValue}>
      <SafeAreaView style={[styles.safe, canvasLayer, routeIsFocused ? null : styles.inactiveRouteSurface]} testID={testID}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <View style={[styles.canvas, canvasLayer]}>
          {reduceTransparency ? null : <AmbientBackdrop />}
          {routeIsFocused && !reduceMotion && !reduceTransparency ? <WorkerSectionMotionField active={active} frameWidth={frameWidth} screenWidth={width} /> : null}
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              {
                paddingBottom: Math.max(insets.bottom + workerDockClearance, workerDockClearance),
                ...(hideDock ? { minHeight: Math.max(0, height - insets.top - insets.bottom - 8), paddingBottom: Math.max(insets.bottom + 96, 108) } : null),
                width: Math.max(0, frameWidth - workerFrameHorizontalPadding * 2),
              },
            ]}
            automaticallyAdjustKeyboardInsets
            contentInsetAdjustmentBehavior="automatic"
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
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
                WORKER_NO_FULL_ADDRESS_BEFORE_ACCEPT +
                WORKER_JOBROOM_KAEL_HANDOFF
              }
            />
            {hideDock ? <WorkerStandaloneHeader /> : hideHeader ? null : <WorkerScreenHeader active={active} eyebrow={eyebrow} headerIcon={headerIcon} headerPill={headerPill} headerPillTone={headerPillTone} subtitle={subtitle} title={title} />}
            {children}
          </ScrollView>
          {!hideDock && routeIsFocused ? <WorkerDockOverlay active={active} /> : null}
        </View>
      </SafeAreaView>
    </WorkerUiContext.Provider>
  )
}

function WorkerScreenHeader({ active, eyebrow, headerIcon, headerPill, headerPillTone = 'cream', subtitle, title }: { active: WorkerActiveTab; eyebrow: string; headerIcon?: WorkerIconName; headerPill?: string; headerPillTone?: WorkerHeaderPillTone; subtitle?: string; title: string }) {
  const { tokens } = useWorkerUi()
  const showKicker = eyebrow.trim().toLocaleLowerCase() !== title.trim().toLocaleLowerCase()
  const headerPillSurface = headerPillTone === 'mint'
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
        <View style={[styles.screenHeaderAction, workerOpaqueCardSurface(tokens, 'mint')]}>
          <Icon name={headerIcon} active small />
        </View>
      ) : null}
    </View>
  )
}

function WorkerStandaloneHeader() {
  const { copy, language, tokens } = useWorkerUi()
  const { selectors, state } = useFrontendWorkflow()
  const { replace } = useRouter()
  const deal = getWorkerVisibleDeal(state.deal)
  const broadcast = deal?.broadcast ?? null
  const statusLabel = broadcast && isAcceptedLocalWorkerDeal(deal)
    ? copy.chat.acceptedPill
    : broadcast
      ? localizedStatusLabel(selectors.currentStatus, language)
      : language === 'en' ? 'Waiting' : 'Chờ việc'

  return (
    <View style={[styles.jobRoomTopBar, workerOpaqueCardSurface(tokens, 'raised')]} testID="worker-jobroom-fullscreen-header">
      <Pressable accessibilityLabel={copy.jobs.title} accessibilityRole="button" onPress={() => replace('/(worker)/jobs')} style={({ pressed }) => [styles.jobRoomBackButton, { backgroundColor: tokens.mint, borderColor: tokens.border }, pressed ? styles.pressed : null]} testID="worker-jobroom-back">
        <Icon name="back" small />
      </Pressable>
      <Image contentFit="contain" source={kaelHead} style={styles.jobRoomHeaderAvatar} />
      <View style={[styles.titleStack, styles.jobRoomTitleStack]}>
        <Text style={[styles.sectionTitle, { color: tokens.ink }]} numberOfLines={1}>
          {copy.chat.title}
        </Text>
        <Text style={[styles.kicker, { color: tokens.primary }]} numberOfLines={1}>
          {copy.chat.relaySubtitle}
        </Text>
      </View>
      <Text style={[styles.jobRoomStatusPill, { backgroundColor: tokens.mint, borderColor: tokens.border, color: tokens.primary }]} numberOfLines={1}>
        {statusLabel}
      </Text>
    </View>
  )
}

function ActiveWorkerJobCard({ body, briefLines, status, title }: { body: string; briefLines: string[]; status: string; title: string }) {
  const { actions, selectors } = useFrontendWorkflow()
  const { copy, language, tokens } = useWorkerUi()
  const { replace } = useRouter()
  const nextAction = selectors.canWorkerAdvance ? getNextWorkerAction(selectors.currentStatus, language) : null
  const nextStatus = nextAction && nextAction.type !== 'worker_complete_job' ? workerStatusForAction(nextAction.type) : null
  const needsCompletionEvidence = nextAction?.type === 'worker_complete_job'

  return (
    <View style={[styles.activeJobCard, workerJobCardSurface(tokens)]} testID="worker-jobs-active-card">
      <View style={styles.rowBetween}>
        <View style={styles.titleStack}>
          <Text style={[styles.statusPill, { alignSelf: 'flex-start', backgroundColor: tokens.mint, borderColor: tokens.border, borderWidth: 1, color: tokens.primary }]} numberOfLines={1}>
            {status}
          </Text>
          <Text style={[styles.cardTitle, { color: tokens.ink }]} numberOfLines={2}>
            {title}
          </Text>
        </View>
        {nextAction ? (
          <Text style={[styles.statusPill, { backgroundColor: tokens.cream, borderColor: tokens.border, borderWidth: 1, color: tokens.copper, flexShrink: 0, maxWidth: 118, textAlign: 'center' }]} numberOfLines={1} testID="worker-active-next-action-pill">
            {nextAction.label}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={3}>
        {body}
      </Text>
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

function WorkerChatContent() {
  const { copy, language, tokens } = useWorkerUi()
  const { selectors, state } = useFrontendWorkflow()
  const deal = getWorkerVisibleDeal(state.deal)
  const broadcast = deal?.broadcast ?? null
  const dealChatKey = workerChatDealKey(deal)
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<WorkerChatMessage[]>([])
  const activeDealChatKeyRef = useRef(dealChatKey)
  const localMessageSequenceRef = useRef(0)
  const renderedMessages = messages
  const hasAnyWorkerKaelMessage = Boolean(broadcast || renderedMessages.length > 0)
  const canSendWorkerKaelMessage = Boolean(deal && isAcceptedLocalWorkerDeal(deal))
  const chatInputPlaceholder = canSendWorkerKaelMessage ? copy.chat.input : broadcast ? copy.chat.lockedGate : copy.chat.waitingInput
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
  const jobRoomGate = canSendWorkerKaelMessage ? copy.chat.acceptedGate : broadcast ? copy.chat.lockedGate : copy.chat.waitingBody
  const jobBriefLines = broadcast ? buildWorkerBroadcastBrief(deal, broadcast, selectors.currentStatus, language) : []

  useEffect(() => {
    if (activeDealChatKeyRef.current === dealChatKey) return
    setMessages([])
    setDraft('')
    localMessageSequenceRef.current = 0
    activeDealChatKeyRef.current = dealChatKey
  }, [dealChatKey])

  const submitWorkerKaelLocalDraft = () => {
    if (!canSendWorkerKaelMessage) return
    const value = draft.trim()
    if (!value) return
    localMessageSequenceRef.current += 1
    setMessages((prev) => [
      ...prev,
      { id: `worker-local-${dealChatKey}-${localMessageSequenceRef.current}`, mine: true, text: value, who: copy.chat.worker },
    ])
    setDraft('')
  }

  return (
    <View style={styles.chatShell} testID="worker-chat-kael-relay">
      <View style={styles.hiddenMarker} testID="worker-kael-client-chatbox-parity" />
      <View style={[styles.kaelClientStage, !hasAnyWorkerKaelMessage ? styles.kaelClientStageEmpty : null]} testID="worker-kael-conversation-feed">
        <View style={styles.hiddenMarker} testID="worker-kael-empty-chat-state" />
        {!broadcast ? (
          <View style={styles.jobRoomStack} testID="worker-kael-empty-chat-canvas">
            <View style={[styles.jobRoomHeader, workerOpaqueCardSurface(tokens, 'raised')]} testID="worker-jobroom-waiting-room">
              <View style={styles.identityRow}>
                <Image contentFit="contain" source={kaelHead} style={styles.kaelHead} />
                <View style={styles.titleStack}>
                  <Text style={[styles.kicker, { color: tokens.primary }]} numberOfLines={1}>
                    {copy.chat.jobRoomTitle}
                  </Text>
                  <Text style={[styles.cardTitle, { color: tokens.ink }]} numberOfLines={2}>
                    {copy.chat.waitingTitle}
                  </Text>
                </View>
              </View>
              <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={3}>
                {copy.chat.waitingBody}
              </Text>
            </View>
            <View style={[styles.jobRoomBrief, workerDiagnosisSurface(tokens)]} testID="worker-jobroom-empty-brief-shell">
              <Text style={[styles.statusPill, { alignSelf: 'stretch', backgroundColor: tokens.mint, borderColor: tokens.border, borderWidth: 1, color: tokens.primary }]} numberOfLines={1}>
                {copy.chat.briefTitle}
              </Text>
              <Text style={[styles.briefText, { color: tokens.ink }]} numberOfLines={4}>
                {copy.chat.briefBody}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.jobRoomStack} testID="hasAnyWorkerKaelMessage">
            <View style={[styles.jobRoomHeader, workerOpaqueCardSurface(tokens, 'raised')]} testID="worker-jobroom-kael-handoff">
              <View style={styles.identityRow}>
                <Image contentFit="contain" source={kaelHead} style={styles.kaelHead} />
                <View style={styles.titleStack}>
                  <Text style={[styles.kicker, { color: tokens.primary }]} numberOfLines={1}>
                    {copy.chat.handoffTitle}
                  </Text>
                  <Text style={[styles.cardTitle, { color: tokens.ink }]} numberOfLines={2}>
                    {localizedServiceLabel(broadcast.serviceType, language)}
                  </Text>
                </View>
              </View>
              <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={3}>
                {copy.chat.briefBody}
              </Text>
            </View>
            <View style={[styles.jobRoomBrief, workerDiagnosisSurface(tokens)]} testID="worker-jobroom-live-brief">
              <Text style={[styles.kicker, { color: tokens.primary }]} numberOfLines={1}>
                {copy.chat.briefTitle}
              </Text>
              {jobBriefLines.map((line) => (
                <View key={line} style={styles.briefItem}>
                  <View style={[styles.briefDot, { backgroundColor: tokens.primary }]} />
                  <Text style={[styles.briefText, { color: tokens.ink }]} numberOfLines={3}>
                    {line}
                  </Text>
                </View>
              ))}
            </View>
            <View style={styles.jobRoomMetaGrid}>
              {jobRoomMeta.map((item) => (
                <JobRoomMetaCell key={item.label} label={item.label} value={item.value} />
              ))}
            </View>
            <View style={[styles.jobRoomGate, workerOpaqueCardSurface(tokens, canSendWorkerKaelMessage ? 'cyan' : 'warm')]} testID="worker-jobroom-privacy-gate">
              <Icon name={canSendWorkerKaelMessage ? 'check' : 'shield'} active={canSendWorkerKaelMessage} small />
              <View style={styles.titleStack}>
                <Text style={[styles.bodyText, { color: tokens.ink }]} numberOfLines={2}>
                  {jobRoomGate}
                </Text>
                {!canSendWorkerKaelMessage ? (
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
              </View>
            ) : null}
          </View>
        )}

        <View style={[styles.chatComposer, glassSurface(tokens, 'strong')]} testID="worker-kael-composer-dock">
          <SubtleGlassHighlight />
          <View pointerEvents="none" style={[styles.composerTool, { borderColor: tokens.border }]}>
            <Icon name="plus" small />
          </View>
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
            accessibilityRole="button"
            accessibilityState={{ disabled: !draft.trim() || !canSendWorkerKaelMessage }}
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

function JobRoomMetaCell({ label, value }: { label: string; value: string }) {
  const { tokens } = useWorkerUi()

  return (
    <View style={[styles.jobRoomMetaCell, workerOpaqueCardSurface(tokens, 'raised')]}>
      <Text style={[styles.metricLabel, { color: tokens.subtle }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.jobRoomMetaValue, { color: tokens.ink }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  )
}

function buildWorkerBroadcastBrief(deal: LocalDeal | null, broadcast: WorkerBroadcastView, status: LocalDealStatus | null, language: WorkerLanguageMode): string[] {
  const serviceLabel = localizedServiceLabel(broadcast.serviceType, language)
  const problemLabel = localizedWorkerProblemSummary(broadcast, language)
  const areaLabel = localizedWorkerAreaLabel(broadcast.generalArea, language)
  const fullAddressLabel = broadcast.fullAddressVisible ? broadcast.fullAddressLabel ?? null : null
  const addressGate = language === 'en'
    ? isAcceptedLocalWorkerDeal(deal) && fullAddressLabel
      ? `Address: ${localizedWorkerAreaLabel(fullAddressLabel, language)}.`
      : `${areaLabel}. Detailed address is hidden until acceptance.`
    : isAcceptedLocalWorkerDeal(deal) && fullAddressLabel
      ? `Địa chỉ: ${localizedWorkerAreaLabel(fullAddressLabel, language)}.`
      : `Khu vực: ${areaLabel}. Địa chỉ chi tiết vẫn ẩn trước khi nhận.`
  const statusLine = localizedStatusLabel(status, language)
  const mediaLine = deal?.draft.mediaCount
    ? language === 'en'
      ? `${deal.draft.mediaCount} media item attached.`
      : `Có ${deal.draft.mediaCount} ảnh/video.`
    : null

  return [`${serviceLabel} · ${problemLabel}`, addressGate, mediaLine ?? statusLine].filter(Boolean)
}

function localizedWorkerProblemSummary(broadcast: WorkerBroadcastView, language: WorkerLanguageMode) {
  return localizedProblemLabel(broadcast.problemSummary, broadcast.serviceType, language)
}

function localizedWorkerAreaLabel(area: string | null | undefined, language: WorkerLanguageMode) {
  if (!area) return appCopy[language].common.noData
  if (language === 'vi') return area
  const mapped = area
    .replace(/^Khu vực:\s*/i, '')
    .replace(/Khu vực TP\.?HCM/gi, 'Ho Chi Minh City area')
    .replace(/Khu vực chung/gi, 'General area')
    .replace(/Quận\s*(\d+)/gi, 'District $1')
    .replace(/TP\.?\s*HCM|Thành phố Hồ Chí Minh/gi, 'HCMC')
  return mapped.trim() || appCopy[language].common.noData
}

function formatWorkerMoney(value: number, language: WorkerLanguageMode) {
  if (!Number.isFinite(value) || value <= 0) return appCopy[language].common.noData
  const formatted = workerMoneyFormatters[language].format(value)
  return language === 'vi' ? `${formatted} đ` : `${formatted} VND`
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

function WorkerEarningsHero() {
  const { tokens } = useWorkerUi()
  const { workerEarnings } = useFrontendWorkflow()

  return (
    <View style={styles.earningsHeroWrap} testID="worker-earnings-summary">
      <WorkerEarningsTrend />
      {workerEarnings ? <View style={styles.hiddenMarker} testID="worker-earnings-real-api-data" /> : null}
      <View style={styles.hiddenMarker} testID={WORKER_NO_FAKE_PAYMENT_DATA} />
    </View>
  )
}

function WorkerEarningsLedger() {
  const { copy, language, tokens } = useWorkerUi()
  const { selectors, state, workerEarnings } = useFrontendWorkflow()
  const deal = getWorkerVisibleDeal(state.deal)
  const acceptedDeal = isAcceptedLocalWorkerDeal(deal) ? deal : null
  const hasSettledEarnings = hasWorkerSettledEarnings(workerEarnings)
  const rows = hasSettledEarnings && workerEarnings
    ? [
        [copy.earnings.ledgerTitle, `${workerEarnings.total_jobs_paid} ${language === 'en' ? 'items' : 'mục'}`],
        [language === 'en' ? 'Gross earnings' : 'Tổng trước phí', formatWorkerMoney(workerEarnings.gross_earnings, language)],
        [language === 'en' ? 'Net earnings' : 'Thực nhận', formatWorkerMoney(workerEarnings.net_earnings, language)],
        [language === 'en' ? 'Payout account' : 'Tài khoản nhận tiền', appCopy[language].common.noData],
      ]
    : acceptedDeal
    ? [
        [copy.earnings.ledgerTitle, localizedStatusLabel(selectors.currentStatus, language)],
        [language === 'en' ? 'Payout account' : 'Tài khoản nhận tiền', appCopy[language].common.noData],
      ]
    : copy.earnings.rows

  return (
    <View style={[styles.listCard, workerOpaqueCardSurface(tokens)]} testID="worker-earnings-ledger">
      <SectionHeader title={copy.earnings.ledgerTitle} />
      {rows.map((row, index) => (
        <ListRow key={row[0]} icon={index === 0 ? 'money' : index === 1 ? 'bank' : 'document'} title={row[0]} meta={row[1]} />
      ))}
    </View>
  )
}

function WorkerEarningsTrend() {
  const { language, tokens } = useWorkerUi()
  const { workerEarnings } = useFrontendWorkflow()
  const title = language === 'en' ? 'Recent days' : '7 ngày gần nhất'
  const days = buildWorkerEarningsDays(language, workerEarnings)
  const maxDailyValue = Math.max(...days.map((day) => day.netEarnings), 0)
  const hasDailyEarnings = maxDailyValue > 0
  const emptyBarHeight = 56

  return (
    <View style={[styles.earningsTrendCard, glassSurface(tokens, 'cream')]} testID="worker-earnings-seven-day-chart">
      <View style={styles.earningsTrendTop}>
        <Text style={[styles.statusPill, { backgroundColor: tokens.mint, color: tokens.primary }]} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <View style={[styles.earningsChartShell, workerOpaqueCardSurface(tokens, 'raised')]}>
        <View style={styles.earningsChartEmptyState} testID="worker-earnings-chart-empty-state">
          <View style={[styles.earningsChartBaseline, { backgroundColor: tokens.border }]} />
          <View style={styles.earningsBarRail} testID={hasDailyEarnings ? 'worker-earnings-real-bar-shell' : 'worker-earnings-empty-bar-shell'}>
            {days.map((day, index) => (
              <View
                accessibilityLabel={`${day.label}: ${formatWorkerMoney(day.netEarnings, language)}`}
                key={day.date}
                style={[
                  styles.earningsEmptyBar,
                  {
                    backgroundColor: tokens.primary,
                    height: hasDailyEarnings ? Math.max(30, Math.round(42 + (day.netEarnings / maxDailyValue) * 76)) : emptyBarHeight,
                    opacity: hasDailyEarnings ? 0.86 : 0.16,
                  },
                ]}
              />
            ))}
          </View>
        </View>
        <View style={styles.earningsDayRail}>
          {days.map((day) => (
            <Text key={day.date} style={[styles.metricLabel, { color: tokens.muted }]} numberOfLines={1}>
              {day.label}
            </Text>
          ))}
        </View>
      </View>
    </View>
  )
}

function WorkerEarningsSummary() {
  const { copy, language, tokens } = useWorkerUi()
  const { workerEarnings } = useFrontendWorkflow()
  const empty = copy.earnings.noReconciliation
  const hasSettledEarnings = hasWorkerSettledEarnings(workerEarnings)
  const todayNet = getTodayWorkerNetEarnings(workerEarnings)
  const todayLabel = copy.earnings.today
  const monthLabel = copy.earnings.month
  const todayValue = todayNet > 0 ? formatWorkerMoney(todayNet, language) : empty
  const monthValue = hasSettledEarnings && workerEarnings ? formatWorkerMoney(workerEarnings.net_earnings, language) : empty

  return (
    <View style={styles.earningsSummaryGrid} testID="worker-earnings-day-month-summary">
      <View style={[styles.earningsSummaryCell, workerOpaqueCardSurface(tokens, 'raised')]}>
        <Text style={[styles.metricLabel, { color: tokens.subtle }]} numberOfLines={1}>
          {todayLabel}
        </Text>
        <Text style={[styles.cardTitle, { color: tokens.ink }]} numberOfLines={1}>
          {todayValue}
        </Text>
      </View>
      <View style={[styles.earningsSummaryCell, workerOpaqueCardSurface(tokens, 'raised')]}>
        <Text style={[styles.metricLabel, { color: tokens.subtle }]} numberOfLines={1}>
          {monthLabel}
        </Text>
        <Text style={[styles.cardTitle, { color: tokens.ink }]} numberOfLines={1}>
          {monthValue}
        </Text>
      </View>
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

function getTodayWorkerNetEarnings(workerEarnings: EarningsResponse | null, referenceDate = new Date()) {
  const todayKey = workerDateKey(referenceDate)
  return workerEarnings?.daily_earnings?.find((day) => day.date === todayKey)?.net_earnings ?? 0
}

function workerDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function WorkerProfileContent() {
  const { copy, language, tokens } = useWorkerUi()
  const { replace } = useRouter()
  const { role, signOut } = useAuth()
  const { workerProfile } = useFrontendWorkflow()
  const [showVerificationForm, setShowVerificationForm] = useState(false)
  const adminAuditSwitchLabel = language === 'en' ? 'Back to login' : 'Về đăng nhập'
  const verificationCopy = workerVerificationCopy[language]
  const serviceSkillsLabel = workerProfile?.service_types.length
    ? workerProfile.service_types.map((service) => localizedServiceLabel(service, language)).join(' · ')
    : appCopy[language].common.noData
  const workingAreaLabel = workerProfile?.districts.length
    ? workerProfile.districts.map((district) => localizedWorkerAreaLabel(district, language)).join(' · ')
    : appCopy[language].common.noData
  const profileRows = [
    [language === 'en' ? 'Identity verification' : 'Xác minh danh tính', localizedWorkerVerificationStatus(workerProfile?.verification_status ?? 'draft', language)],
    [language === 'en' ? 'Service skills' : 'Kỹ năng dịch vụ', serviceSkillsLabel],
    [language === 'en' ? 'Working area' : 'Khu vực làm việc', workingAreaLabel],
  ]
  const profileStatusValue = localizedWorkerVerificationStatus(workerProfile?.verification_status ?? 'draft', language)
  const submittedProfileValue = workerProfile && workerProfile.verification_status !== 'draft'
    ? (language === 'en' ? 'Submitted' : 'Đã gửi')
    : profileStatusValue
  const profileSyncLabel = language === 'en' ? 'Synced from verification' : 'Đồng bộ từ xác thực'
  const profileSyncMeta = workerProfile
    ? localizedWorkerVerificationStatus(workerProfile.verification_status, language)
    : appCopy[language].common.noData
  const canSubmitVerification = role === 'worker' &&
    !workerProfile?.is_suspended &&
    !['approved', 'suspended'].includes(workerProfile?.verification_status ?? 'draft')

  return (
    <>
      <View style={[styles.profileHead, glassSurface(tokens, 'raised')]} testID="worker-profile-verification-card">
        <SubtleGlassHighlight />
        <View style={styles.profileHeroTop}>
          <View style={styles.profileAvatarHero}>
            <Icon inverse name="person" />
          </View>
          <View style={styles.titleStack}>
            <Text style={[styles.profileName, { color: tokens.ink }]}>{copy.profile.name}</Text>
            <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={2}>
              {language === 'en' ? 'Status and service skills' : 'Trạng thái và kỹ năng dịch vụ'}
            </Text>
          </View>
          <Text style={[styles.statusPill, { backgroundColor: tokens.cream, borderColor: tokens.border, borderWidth: 1, color: tokens.primary }]} numberOfLines={1}>
            {profileStatusValue}
          </Text>
        </View>
        {role === 'worker' ? (
          <PressButton label={adminAuditSwitchLabel} onPress={() => void signOut()} testID="worker-profile-sign-out" />
        ) : role === 'admin' ? (
          <PressButton label={adminAuditSwitchLabel} onPress={() => replace('/(auth)/login')} testID="worker-admin-audit-switch" />
        ) : null}
      </View>
      {canSubmitVerification && showVerificationForm ? <WorkerVerificationForm /> : null}

      <View style={styles.profileMiniGrid} testID="worker-profile-mini-status-grid">
        <View style={[styles.workerMiniCard, workerOpaqueCardSurface(tokens, 'raised')]}>
          <Text style={[styles.workerMiniTitle, { color: tokens.ink }]} numberOfLines={1}>
            {profileStatusValue}
          </Text>
          <Text style={[styles.workerMiniMeta, { color: tokens.muted }]} numberOfLines={1}>
            {language === 'en' ? 'Verification' : 'Xác minh'}
          </Text>
        </View>
        <View style={[styles.workerMiniCard, workerOpaqueCardSurface(tokens, 'raised')]}>
          <Text style={[styles.workerMiniTitle, { color: tokens.ink }]} numberOfLines={1}>
            {submittedProfileValue}
          </Text>
          <Text style={[styles.workerMiniMeta, { color: tokens.muted }]} numberOfLines={1}>
            {language === 'en' ? 'Worker profile' : 'Hồ sơ thợ'}
          </Text>
        </View>
      </View>

      <View style={[styles.profileSyncPreview, workerOpaqueCardSurface(tokens)]} testID="worker-profile-sync-preview">
        <View style={styles.profileSyncPreviewTop}>
          <Text style={[styles.cardTitle, { color: tokens.ink, flex: 1 }]} numberOfLines={1}>
            {profileSyncLabel}
          </Text>
          <Text style={[styles.statusPill, { backgroundColor: tokens.mint, color: tokens.primary }]} numberOfLines={1}>
            {profileSyncMeta}
          </Text>
        </View>
      </View>

      <View style={[styles.listCard, workerOpaqueCardSurface(tokens)]} testID="worker-profile-list-groups">
        {profileRows.map((row, index) => (
          <ListRow key={row[0]} icon={index === 0 ? 'shield' : index === 1 ? 'tools' : index === 2 ? 'map' : index === 3 ? 'moon' : 'globe'} title={row[0]} meta={row[1]} />
        ))}
      </View>

      {canSubmitVerification && !showVerificationForm ? (
        <View style={[styles.profileSyncPreview, workerOpaqueCardSurface(tokens)]} testID="worker-profile-verification-collapsed">
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

      <View style={[styles.preferenceCard, workerOpaqueCardSurface(tokens)]} testID="worker-profile-preference-toggles">
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
    <View style={[styles.verificationCard, workerOpaqueCardSurface(tokens)]} testID="worker-verification-submit-card">
      <View style={styles.rowBetween}>
        <View style={styles.titleStack}>
          <Text style={[styles.kicker, { color: tokens.primary }]}>{verificationCopy.kicker}</Text>
          <Text style={[styles.sectionTitle, { color: tokens.ink }]}>{verificationCopy.title}</Text>
        </View>
        <Text style={[styles.statusPill, { backgroundColor: tokens.mint, color: tokens.primary }]} testID="worker-verification-status">
          {localizedWorkerVerificationStatus(status, language)}
        </Text>
      </View>
      <TextInput accessibilityLabel={verificationCopy.legalName} autoCapitalize="words" onChangeText={setLegalName} placeholder={verificationCopy.legalName} placeholderTextColor={tokens.subtle} style={[styles.verificationInput, { borderColor: tokens.border, color: tokens.ink }]} testID="worker-verification-legal-name" value={legalName} />
      <View style={styles.verificationGrid}>
        <TextInput accessibilityLabel={verificationCopy.dateOfBirth} onChangeText={setDateOfBirth} placeholder="YYYY-MM-DD" placeholderTextColor={tokens.subtle} style={[styles.verificationInput, styles.verificationHalfInput, { borderColor: tokens.border, color: tokens.ink }]} testID="worker-verification-date-of-birth" value={dateOfBirth} />
        <TextInput accessibilityLabel={verificationCopy.yearsExperience} keyboardType="number-pad" onChangeText={setYearsExperience} placeholder={verificationCopy.yearsExperience} placeholderTextColor={tokens.subtle} style={[styles.verificationInput, styles.verificationHalfInput, { borderColor: tokens.border, color: tokens.ink }]} testID="worker-verification-years" value={yearsExperience} />
      </View>
      <TextInput accessibilityLabel={verificationCopy.districts} onChangeText={setDistrictsFromText} placeholder={verificationCopy.districtsPlaceholder} placeholderTextColor={tokens.subtle} style={[styles.verificationInput, { borderColor: tokens.border, color: tokens.ink }]} testID="worker-verification-districts" value={districts} />
      <WorkerServiceAreaPicker
        onAdjustRadius={adjustServiceRadius}
        onSelectAnchor={setServiceAreaAnchor}
        onSelectRadiusPreset={setRadiusPreset}
        radiusValue={radiusValue}
        selectedDistrictSlug={selectedDistrictSlug}
      />
      <TextInput accessibilityLabel={verificationCopy.problemSpecializations} onChangeText={setProblemSpecializations} placeholder={verificationCopy.problemSpecializations} placeholderTextColor={tokens.subtle} style={[styles.verificationInput, { borderColor: tokens.border, color: tokens.ink }]} testID="worker-verification-problem-specializations" value={problemSpecializations} />
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
        <TextInput accessibilityLabel={verificationCopy.bankName} onChangeText={setBankName} placeholder={verificationCopy.bankName} placeholderTextColor={tokens.subtle} style={[styles.verificationInput, styles.verificationHalfInput, { borderColor: tokens.border, color: tokens.ink }]} testID="worker-verification-bank-name" value={bankName} />
        <TextInput accessibilityLabel={verificationCopy.bankAccount} keyboardType="number-pad" onChangeText={setBankAccount} placeholder={verificationCopy.bankAccount} placeholderTextColor={tokens.subtle} secureTextEntry style={[styles.verificationInput, styles.verificationHalfInput, { borderColor: tokens.border, color: tokens.ink }]} testID="worker-verification-bank-account" value={bankAccount} />
      </View>
      <View style={styles.verificationFiles}>
        <VerificationFileButton file={files.cccdFront} label={verificationCopy.files.cccdFront} onPress={() => void pickVerificationFile('cccdFront')} testID="worker-verification-cccd-front" />
        <VerificationFileButton file={files.cccdBack} label={verificationCopy.files.cccdBack} onPress={() => void pickVerificationFile('cccdBack')} testID="worker-verification-cccd-back" />
        <VerificationFileButton file={files.selfie} label={verificationCopy.files.selfie} onPress={() => void pickVerificationFile('selfie')} testID="worker-verification-selfie" />
      </View>
      {submitError ? <Text style={[styles.bodyText, { color: tokens.copper }]} testID="worker-verification-error">{submitError}</Text> : null}
      <PressButton disabled={submitting} label={submitting ? verificationCopy.submitting : verificationCopy.submit} onPress={() => void submitVerification()} testID="worker-verification-submit" />
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
    <View style={[styles.serviceAreaPicker, { backgroundColor: tokens.glassStrong, borderColor: tokens.border }]} testID="worker-verification-service-area-picker">
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
  return (
    <Pressable
      accessibilityLabel={file ? `${label}: ${file.fileName ?? fileCopy.selectedFallback}` : `${fileCopy.choose} ${label}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.verificationFileButton,
        { backgroundColor: file ? tokens.mint : tokens.glassStrong, borderColor: file ? tokens.primary : tokens.border },
        pressed ? styles.pressed : null,
      ]}
      testID={testID}
    >
      <Icon name="document" small />
      <Text style={[styles.verificationFileText, { color: file ? tokens.primary : tokens.muted }]} numberOfLines={2}>
        {file?.fileName ?? label}
      </Text>
    </Pressable>
  )
}

function WorkerMapStage() {
  const { copy, language, tokens } = useWorkerUi()
  const { state, workerProfile } = useFrontendWorkflow()
  const deal = getWorkerVisibleDeal(state.deal)
  const broadcast = deal?.broadcast
  const mapArea = broadcast?.generalArea ?? deal?.draft.districtLabel
  const mapSearch = mapArea ? localizedWorkerAreaLabel(mapArea, language) : copy.home.mapSearch
  const workerAnchorLabel = workerProfile?.districts[0]
    ? localizedWorkerAreaLabel(workerProfile.districts[0], language)
    : appCopy[language].common.noData
  const hasWorkerAnchor = Boolean(workerProfile?.districts[0])
  const workerRadiusKm = workerProfile?.service_radius_km
  const workerRadiusLabel = Number.isFinite(workerRadiusKm)
    ? `${workerRadiusKm} km`
    : appCopy[language].common.noData
  const hasWorkerRadius = Number.isFinite(workerRadiusKm)
  const hasMapContext = Boolean(mapArea || hasWorkerAnchor || hasWorkerRadius)
  const availabilityHud = !workerProfile
    ? appCopy[language].common.noData
    : workerProfile.is_suspended
      ? language === 'en' ? 'Suspended' : 'Tạm khóa'
      : workerProfile.is_approved && workerProfile.is_available
        ? language === 'en' ? 'Receiving' : 'Nhận việc'
        : workerProfile.is_approved
          ? language === 'en' ? 'Offline' : 'Tạm tắt'
          : language === 'en' ? 'Pending' : 'Chờ duyệt'

  return (
    <View style={[styles.mapStage, workerOpaqueCardSurface(tokens, 'depth')]} testID="worker-flexible-map-shell">
      <View style={[styles.mapViewport, workerMapViewportSurface(tokens)]} testID="worker-map-google-ready">
        <MapLineField />
        {mapArea ? <WorkerMapRouteLine /> : null}
        <View pointerEvents="none" style={[styles.mapFogTop, { backgroundColor: tokens.raised }]} />
        <View pointerEvents="none" style={[styles.mapCyanVeil, { backgroundColor: tokens.aqua }]} />
        <View pointerEvents="none" style={[styles.mapFogBottom, { backgroundColor: tokens.raised }]} />
        <View style={styles.hiddenMarker} testID={mapPreview.replaceWithProvider} />
        <View style={styles.workerMapTopHud} testID="worker-home-map-hud">
          <View style={[styles.searchPill, workerOpaqueCardSurface(tokens, 'raised')]} testID="worker-map-search-pill-opaque">
            <Text style={[styles.mapChipTitle, { color: tokens.ink }]} numberOfLines={1}>
              {mapSearch}
            </Text>
          </View>
          <View style={[styles.searchPill, workerOpaqueCardSurface(tokens, 'mint')]} testID="worker-map-availability-pill">
            <Text style={[styles.mapChipTitle, { color: tokens.primary }]} numberOfLines={1}>
              {hasMapContext ? availabilityHud : appCopy[language].common.noData}
            </Text>
          </View>
        </View>
        {hasMapContext ? (
          <View style={[styles.homeMapMarker, styles.homeMapMarkerZone, { backgroundColor: tokens.glassStrong, borderColor: tokens.glassBorder }]} testID="worker-map-zone-marker">
            <View style={[styles.homeMapZoneHalo, { backgroundColor: tokens.aqua }]} />
            <Icon name="pin" active small />
          </View>
        ) : null}
        {hasWorkerAnchor ? (
          <View style={[styles.homeMapMarker, styles.homeMapMarkerWorker, { backgroundColor: tokens.raised, borderColor: tokens.primary }]} testID="worker-map-worker-marker">
            <Icon name="tools" active small />
          </View>
        ) : null}
        <View style={styles.workerMapHudStack} testID="worker-map-hud-stack">
          <View style={[styles.workerMapHudChip, workerOpaqueCardSurface(tokens, 'mint')]} testID="worker-map-hud-worker">
            <Text style={[styles.mapChipTitle, { color: tokens.ink }]} numberOfLines={1}>{language === 'en' ? 'You' : 'Bạn'}</Text>
            {hasWorkerAnchor ? (
              <Text style={[styles.mapChipMeta, { color: tokens.muted }]} numberOfLines={1}>{workerAnchorLabel}</Text>
            ) : null}
          </View>
          <View style={[styles.workerMapHudChip, workerOpaqueCardSurface(tokens, 'raised')]} testID="worker-map-hud-zone">
            <Text style={[styles.mapChipTitle, { color: tokens.ink }]} numberOfLines={1}>{language === 'en' ? 'Work area' : 'Khu vực nhận việc'}</Text>
            {hasWorkerRadius ? (
              <Text style={[styles.mapChipMeta, { color: tokens.muted }]} numberOfLines={1}>{workerRadiusLabel}</Text>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  )
}

function WorkerMapFeatureCard({ icon, mapFeatureMeta, title, tone }: { icon: WorkerIconName; mapFeatureMeta: string; title: string; tone: WorkerTone }) {
  const { tokens } = useWorkerUi()

  return (
    <View style={[styles.mapFeatureCard, workerOpaqueCardSurface(tokens, tone)]}>
      <Text style={[styles.mapFeatureTitle, { color: tokens.ink }]} numberOfLines={2}>
        {title}
      </Text>
      <Text style={[styles.mapFeatureMeta, { color: tokens.muted }]} numberOfLines={1}>
        {mapFeatureMeta}
      </Text>
      <View style={[styles.mapFeatureIcon, { backgroundColor: tokens.glassStrong }]}>
        <Icon name={icon} active />
      </View>
    </View>
  )
}

function WorkerReadinessActionPanel() {
  const { copy, language, tokens } = useWorkerUi()
  const { actions, selectors, state, workerProfile } = useFrontendWorkflow()
  const { replace } = useRouter()
  const deal = getWorkerVisibleDeal(state.deal)
  const acceptedDeal = isAcceptedLocalWorkerDeal(deal) ? deal : null
  const isSuspended = Boolean(workerProfile?.is_suspended)
  const isAvailable = Boolean(workerProfile?.is_available && !isSuspended)
  const availabilityLabel = !workerProfile
    ? appCopy[language].common.noData
    : isSuspended
    ? language === 'en' ? 'Suspended' : 'Tạm khóa'
    : isAvailable
    ? language === 'en' ? 'Online' : 'Đang nhận việc'
    : language === 'en' ? 'Offline' : 'Tạm tắt nhận'
  const nextAvailability = !workerProfile?.is_available
  const isOperationallyBusy = Boolean(
    acceptedDeal &&
      selectors.currentStatus !== 'confirmed_by_customer' &&
      selectors.currentStatus !== 'reviewed',
  )
  const canToggleAvailability = Boolean(workerProfile) &&
    (!nextAvailability || (workerProfile?.is_approved && !workerProfile?.is_suspended && !isOperationallyBusy))
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
    <View
      style={[
        styles.shiftCard,
        workerOpaqueCardSurface(tokens, 'raised'),
      ]}
      testID="worker-readiness-action-panel"
    >
      <SubtleGlassHighlight />
      <View style={styles.hiddenMarker} testID="worker-unified-readiness-panel" />
      <View style={styles.rowBetween}>
        <View style={styles.titleStack}>
          <Text style={[styles.kicker, { color: tokens.primary }]}>{statusTitle}</Text>
          <Text style={[styles.heroTitle, { color: tokens.ink }]}>{copy.home.readinessTitle}</Text>
          <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={2}>
            {readinessBody}
          </Text>
        </View>
        <Pressable
          accessibilityLabel={availabilityActionLabel}
          accessibilityRole="switch"
          accessibilityState={{ checked: Boolean(workerProfile?.is_available), disabled: !canToggleAvailability }}
          disabled={!canToggleAvailability}
          onPress={() => void actions.workerUpdateAvailability(nextAvailability)}
          style={({ pressed }) => [
            styles.toggleTrack,
            { backgroundColor: workerProfile?.is_available ? tokens.primary : tokens.borderStrong },
            { alignItems: workerProfile?.is_available ? 'flex-end' : 'flex-start' },
            pressed ? styles.pressed : null,
          ]}
          testID="worker-availability-toggle"
        >
          <View style={[styles.toggleKnob, { backgroundColor: tokens.raised }]} />
        </Pressable>
      </View>
      <View style={styles.shiftActionRow} testID="worker-readiness-primary-actions">
        <PressButton disabled={!canToggleAvailability} label={availabilityActionLabel} onPress={() => void actions.workerUpdateAvailability(nextAvailability)} testID="worker-availability-primary-action" />
        <PressButton secondary label={copy.jobs.filters[0]} onPress={() => replace('/(worker)/jobs?tab=waiting')} testID="worker-home-open-waiting-jobs" />
      </View>
    </View>
  )
}

function WorkerHomeServiceGrid() {
  const { copy } = useWorkerUi()
  const { workerProfile } = useFrontendWorkflow()
  const workerServiceTypes = workerProfile?.service_types ?? []
  const canShowApprovedSkills = Boolean(workerProfile?.is_approved && workerProfile?.verification_status === 'approved')
  const serviceCandidates = [
    { service: 'electrical' as const, icon: 'bolt' as const, title: copy.home.electricianCard, tone: 'mint' as const, testID: 'worker-shell-service-electrical' },
    { service: 'plumbing' as const, icon: 'water' as const, title: copy.home.plumberCard, tone: 'cyan' as const, testID: 'worker-shell-service-plumbing' },
    { service: 'cleaning' as const, icon: 'spark' as const, title: copy.home.cleaningCard, tone: 'cream' as const, testID: 'worker-shell-service-cleaning' },
  ]

  return (
    <View style={styles.workerServiceGrid} testID="worker-home-service-grid">
      {serviceCandidates.map((item) => {
        const approvedForService = canShowApprovedSkills && workerServiceTypes.includes(item.service)
        return (
          <WorkerHomeServiceTile
            icon={item.icon}
            key={item.testID}
            meta={approvedForService ? copy.home.serviceSkillLabel : copy.home.servicePendingLabel}
            title={item.title}
            tone={item.tone}
            testID={item.testID}
          />
        )
      })}
    </View>
  )
}

function WorkerHomeServiceTile({ icon, meta, testID, title, tone }: { icon: WorkerIconName; meta: string; testID?: string; title: string; tone: WorkerTone }) {
  const { tokens } = useWorkerUi()
  const { replace } = useRouter()
  const { reduceMotion } = useGlassAccessibility()

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => replace('/(worker)/profile')}
      style={({ pressed }) => [styles.workerServiceTile, workerServiceTileSurface(tokens), reduceMotionAwarePressStyle(pressed, reduceMotion)]}
      testID={testID}
    >
      <View style={[styles.workerServiceIcon, workerIconBubbleSurface(tokens, tone)]}>
        <Icon name={icon} active />
      </View>
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
        style={({ pressed }) => [styles.workerMiniCard, workerOpaqueCardSurface(tokens, 'raised'), reduceMotionAwarePressStyle(pressed, reduceMotion)]}
        testID="worker-home-mini-waiting"
      >
        <Icon name="jobs" small />
        <Text style={[styles.workerMiniTitle, { color: tokens.ink }]} numberOfLines={1}>{copy.jobs.filters[0]}</Text>
        <Text style={[styles.workerMiniMeta, { color: tokens.muted }]} numberOfLines={1}>{language === 'en' ? 'New requests' : 'Yêu cầu mới'}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => replace('/(worker)/profile')}
        style={({ pressed }) => [styles.workerMiniCard, workerOpaqueCardSurface(tokens, 'raised'), reduceMotionAwarePressStyle(pressed, reduceMotion)]}
        testID="worker-home-mini-profile"
      >
        <Icon name="shield" small />
        <Text style={[styles.workerMiniTitle, { color: tokens.ink }]} numberOfLines={1}>{profileStatus}</Text>
        <Text style={[styles.workerMiniMeta, { color: tokens.muted }]} numberOfLines={1}>{copy.home.serviceProfileTitle}</Text>
      </Pressable>
    </View>
  )
}

function CompactWorkerPresenceMap({ mode }: { mode: 'active' | 'waiting' }) {
  const { language, tokens } = useWorkerUi()
  const { selectors, state } = useFrontendWorkflow()
  const deal = getWorkerVisibleDeal(state.deal)
  const broadcast = deal?.broadcast ?? null
  const hasBroadcast = Boolean(broadcast)
  const area = broadcast?.generalArea ?? deal?.draft.districtLabel
  const hasReleasedAddress = Boolean(
    mode === 'active' &&
      selectors.canWorkerSeeFullAddress &&
      broadcast?.fullAddressVisible &&
      broadcast.fullAddressLabel,
  )
  const areaLabel = area ? localizedWorkerAreaLabel(area, language) : (language === 'en' ? 'Waiting area' : 'Khu vực chờ')
  const privacyLabel = hasReleasedAddress
    ? (language === 'en' ? 'Address available' : 'Điểm hẹn đã mở')
    : hasBroadcast
      ? (language === 'en' ? 'Address locked' : 'Địa chỉ khóa')
      : (language === 'en' ? 'No request' : 'Chưa có yêu cầu')
  const mapPrimary = hasReleasedAddress ? (language === 'en' ? 'Meeting point' : 'Điểm hẹn') : areaLabel
  const mapContextLabel = hasReleasedAddress
    ? (language === 'en' ? 'Route' : 'Tuyến đến')
    : hasBroadcast
      ? (language === 'en' ? 'Customer area' : 'Khu vực khách')
      : (language === 'en' ? 'Service area' : 'Khu vực nhận việc')
  const mapStateLabel = hasReleasedAddress
    ? areaLabel
    : hasBroadcast
      ? (language === 'en' ? 'Locked' : 'Đã khóa')
      : appCopy[language].common.noRequest

  return (
    <View style={[styles.compactPresenceMap, workerOpaqueCardSurface(tokens, 'depth')]} testID={`worker-jobs-${mode}-presence-map`}>
      <View style={[styles.compactMapViewport, workerMapViewportSurface(tokens)]}>
        <MapLineField compact />
        {hasReleasedAddress ? <WorkerMapRouteLine compact /> : null}
        <View pointerEvents="none" style={[styles.mapCyanVeil, styles.compactMapVeil, { backgroundColor: tokens.aqua }]} />
        <View style={styles.workerMapTopHud}>
          <View style={[styles.searchPill, workerOpaqueCardSurface(tokens, 'raised')]} testID="worker-map-zone-pill-opaque">
            <Text style={[styles.mapChipTitle, { color: tokens.ink }]} numberOfLines={1}>{mapPrimary}</Text>
          </View>
          <View style={[styles.searchPill, workerOpaqueCardSurface(tokens, hasReleasedAddress ? 'mint' : 'cream')]}>
            <Text style={[styles.mapChipTitle, { color: hasReleasedAddress ? tokens.primary : tokens.copper }]} numberOfLines={1}>{privacyLabel}</Text>
          </View>
        </View>
        {hasReleasedAddress || hasBroadcast ? (
          <View style={[styles.compactMapMarker, styles.compactMapMarkerZone, { backgroundColor: tokens.mint, borderColor: tokens.borderStrong }]} testID={hasReleasedAddress ? 'worker-map-route-after-accept' : 'worker-map-address-locked-before-accept'}>
            <Icon name={hasReleasedAddress ? 'pin' : 'shield'} small />
          </View>
        ) : null}
        {hasReleasedAddress ? (
          <View style={[styles.compactMapMarker, styles.compactMapMarkerWorker, { backgroundColor: tokens.raised, borderColor: tokens.primary }]}>
            <Icon name="tools" small />
          </View>
        ) : null}
        <View style={styles.workerMapHudStack}>
          <View style={[styles.workerMapHudChip, workerOpaqueCardSurface(tokens, 'mint')]}>
            <Text style={[styles.mapChipTitle, { color: tokens.ink }]} numberOfLines={1}>{mapContextLabel}</Text>
          </View>
          <View style={[styles.workerMapHudChip, workerOpaqueCardSurface(tokens, 'raised')]}>
            <Text style={[styles.mapChipTitle, { color: tokens.ink }]} numberOfLines={1}>{mapStateLabel}</Text>
          </View>
        </View>
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
  | 'finalPriceDraft'
  | 'scopeReasonDraft'

type IncomingRequestDraftState = {
  cancellationReasonDraft: string
  completionNoteDraft: string
  completionPhotos: LocalMediaUploadDraft[]
  finalPriceDraft: string
  scopeReasonDraft: string
}

type IncomingRequestDraftAction =
  | { type: 'clear_cancellation' }
  | { type: 'clear_completion' }
  | { type: 'completion_photo'; photo: LocalMediaUploadDraft }
  | { type: 'field'; field: IncomingRequestDraftField; value: string }

const EMPTY_INCOMING_REQUEST_DRAFTS: IncomingRequestDraftState = {
  cancellationReasonDraft: '',
  completionNoteDraft: '',
  completionPhotos: [],
  finalPriceDraft: '',
  scopeReasonDraft: '',
}

function incomingRequestDraftReducer(state: IncomingRequestDraftState, action: IncomingRequestDraftAction): IncomingRequestDraftState {
  switch (action.type) {
    case 'field':
      return { ...state, [action.field]: action.value }
    case 'completion_photo':
      return { ...state, completionPhotos: [...state.completionPhotos, action.photo].slice(0, 5) }
    case 'clear_completion':
      return { ...state, completionNoteDraft: '', completionPhotos: [], finalPriceDraft: '' }
    case 'clear_cancellation':
      return { ...state, cancellationReasonDraft: '' }
    default:
      return state
  }
}

function IncomingRequestSheet({ compact = false }: { compact?: boolean }) {
  const { copy, language, tokens } = useWorkerUi()
  const { actions, selectors, state } = useFrontendWorkflow()
  const actionCopy = workerActionCopy[language]
  const [requestDrafts, requestDraftDispatch] = useReducer(incomingRequestDraftReducer, EMPTY_INCOMING_REQUEST_DRAFTS)
  const { cancellationReasonDraft, completionNoteDraft, completionPhotos, finalPriceDraft, scopeReasonDraft } = requestDrafts
  const updateRequestDraft = (field: IncomingRequestDraftField) => (value: string) => requestDraftDispatch({ type: 'field', field, value })
  const deal = getWorkerVisibleDeal(state.deal)
  const broadcast = deal?.broadcast ?? null
  const nextAction = selectors.canWorkerAdvance ? getNextWorkerAction(selectors.currentStatus, language) : null
  const localizedProblemSummary = broadcast ? localizedWorkerProblemSummary(broadcast, language) : copy.request.title
  const workerBriefLines = broadcast ? buildWorkerBroadcastBrief(deal, broadcast, selectors.currentStatus, language) : copy.request.brief
  const canRequestScopeChange = selectors.currentStatus === 'inspecting' || selectors.currentStatus === 'repairing'
  const hasBroadcast = Boolean(broadcast)
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
    requestDraftDispatch({ type: 'completion_photo', photo: draft })
  }
  const confirmWorkerProgressAction = (action: { label: string; type: WorkerProgressAction }) => {
    const nextStatus = workerStatusForAction(action.type)
    if (!nextStatus) return
    if (action.type !== 'worker_complete_job') {
      void actions.workerUpdateStatus(nextStatus)
      return
    }

    const finalPrice = Number.parseInt(finalPriceDraft.replace(/[^\d]/g, ''), 10)
    if (!Number.isFinite(finalPrice) || finalPrice <= 0) {
      Alert.alert(actionCopy.alerts.finalPriceRequiredTitle, actionCopy.alerts.finalPriceRequiredBody)
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
                final_price: finalPrice,
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
          onPress: () => void actions.requestScopeChange({
            new_description: reason,
            photo_urls: [],
            reason,
          }),
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

  return (
    <ReduceMotionAwareEntranceView delayMs={compact ? 40 : 80} distanceY={compact ? 8 : 14} testID="worker-request-sheet-motion">
      <GlassModalSheet mode={tokens.mode} style={[styles.requestSheet, compact ? styles.requestSheetCompact : null]} testID="worker-request-sheet">
      <SubtleGlassHighlight />
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
      <View style={styles.areaRow} testID={canRenderFullAddress ? 'worker-full-address-after-accept' : 'worker-general-area-before-accept'}>
        <Icon name="map" small />
        <Text numberOfLines={2} style={[styles.areaText, { color: tokens.muted }]}>{addressLabel}</Text>
      </View>

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
        <Metric label={copy.request.customerEstimate} value={broadcast?.estimatedPriceLabel ?? appCopy[language].common.noData} />
        <Metric label={copy.request.workerEarns} value={broadcast?.estimatedEarningLabel ?? appCopy[language].common.noData} />
      </View>
      {canRequestScopeChange ? (
        <View style={styles.scopeRequestBox} testID="worker-scope-change-request">
          <TextInput
            accessibilityLabel={actionCopy.scopeDescription}
            onChangeText={updateRequestDraft('scopeReasonDraft')}
            placeholder={actionCopy.scopeDescription}
            placeholderTextColor={tokens.subtle}
            style={[styles.chatInput, { borderColor: tokens.border, color: tokens.ink }]}
            value={scopeReasonDraft}
          />
          <PressButton label={actionCopy.scopeSubmit} onPress={submitScopeChangeRequest} secondary testID="worker-scope-change-submit" />
        </View>
      ) : null}
      {selectors.currentStatus === 'scope_change_pending' ? (
        <Text style={[styles.bodyText, { color: tokens.muted }]} testID="worker-scope-change-waiting">
          {actionCopy.scopeWaiting}
        </Text>
      ) : null}
      {canRequestCancellation ? (
        <View style={styles.scopeRequestBox} testID="worker-cancellation-request">
          <TextInput
            accessibilityLabel={actionCopy.cancelReason}
            onChangeText={updateRequestDraft('cancellationReasonDraft')}
            placeholder={actionCopy.cancelPlaceholder}
            placeholderTextColor={tokens.subtle}
            style={[styles.chatInput, { borderColor: tokens.border, color: tokens.ink }]}
            value={cancellationReasonDraft}
          />
          <PressButton label={actionCopy.cancelSubmit} onPress={submitCancellationRequest} secondary testID="worker-cancellation-submit" />
        </View>
      ) : null}
      {nextAction?.type === 'worker_complete_job' ? (
        <View style={styles.scopeRequestBox} testID="worker-completion-evidence-blocker">
          <TextInput
            accessibilityLabel={actionCopy.completionNote}
            onChangeText={updateRequestDraft('completionNoteDraft')}
            placeholder={actionCopy.completionNote}
            placeholderTextColor={tokens.subtle}
            style={[styles.chatInput, { borderColor: tokens.border, color: tokens.ink }]}
            testID="worker-completion-note-input"
            value={completionNoteDraft}
          />
          <TextInput
            accessibilityLabel={actionCopy.finalPrice}
            keyboardType="number-pad"
            onChangeText={updateRequestDraft('finalPriceDraft')}
            placeholder={actionCopy.finalPrice}
            placeholderTextColor={tokens.subtle}
            style={[styles.chatInput, { borderColor: tokens.border, color: tokens.ink }]}
            testID="worker-final-price-input"
            value={finalPriceDraft}
          />
          <View style={styles.actionRow}>
            <PressButton label={actionCopy.addCompletionPhoto} onPress={pickCompletionPhoto} secondary testID="worker-completion-add-photo" />
            <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={1} testID="worker-completion-photo-count">
              {completionPhotos.length > 0 ? actionCopy.completionPhotoCount(completionPhotos.length) : actionCopy.completionPhotoRequired}
            </Text>
          </View>
        </View>
      ) : null}
      {selectors.canWorkerAccept ? (
        <View style={styles.actionRow}>
          <PressButton label={copy.request.decline} onPress={() => void actions.workerDeclineBroadcast()} secondary />
          <PressButton label={copy.request.accept} onPress={() => void actions.workerAcceptBroadcast()} testID="worker-local-accept-deal" />
        </View>
      ) : nextAction ? (
        <PressButton label={nextAction.label} onPress={() => confirmWorkerProgressAction(nextAction)} testID="worker-local-status-action" />
      ) : hasBroadcast ? (
        <Text style={[styles.bodyText, { color: tokens.muted }]}>{localizedStatusLabel(selectors.currentStatus, language)}</Text>
      ) : null}
      </GlassModalSheet>
    </ReduceMotionAwareEntranceView>
  )
}

function WorkerDockOverlay({ active }: { active: WorkerActiveTab }) {
  const { replace } = useRouter()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const { copy, tokens } = useWorkerUi()
  const frameWidth = Math.min(width, 430)
  const dockWidth = Math.max(frameWidth - 51.2, 0)
  const bottom = Math.max(insets.bottom + workerDockBottomMargin, workerDockBottomMargin)
  type WorkerDockItem = FloatingGlassTabItem<WorkerActiveTab> & {
    icon: WorkerIconName
    path: '/(worker)/home' | '/(worker)/jobs' | '/(worker)/chat' | '/(worker)/earnings' | '/(worker)/profile'
  }
  const items: WorkerDockItem[] = [
    { key: 'home', icon: 'home', label: copy.nav.home, path: '/(worker)/home', testID: 'worker-dock-home' },
    { key: 'jobs', icon: 'jobs', label: copy.nav.jobs, path: '/(worker)/jobs', testID: 'worker-dock-jobs' },
    { key: 'chat', icon: 'chat', label: copy.nav.chat, path: '/(worker)/chat', testID: 'worker-dock-chat' },
    { key: 'earnings', icon: 'trend', label: copy.nav.earnings, path: '/(worker)/earnings', testID: 'worker-dock-earnings' },
    { key: 'profile', icon: 'person', label: copy.nav.profile, path: '/(worker)/profile', testID: 'worker-dock-profile' },
  ]

  useEffect(() => {
    const timeout = setTimeout(() => {
      lastWorkerDockActive = active
    }, 560)
    return () => clearTimeout(timeout)
  }, [active])

  return (
    <View pointerEvents="box-none" style={[styles.dockWrap, { bottom, width: dockWidth }]}>
      <View pointerEvents="none" style={[styles.dockBackdropShield, { backgroundColor: tokens.canvas }]} testID="worker-dock-backdrop-shield" />
      <View pointerEvents="none" style={styles.hiddenMarker} testID="worker-dock-glass-aura" />
      <FloatingGlassTabBar<WorkerActiveTab, WorkerDockItem>
        activeKey={active}
        items={items}
        mode={tokens.mode}
        onItemPress={(item) => {
          if (item.key === active) return
          lastWorkerDockActive = active
          replace(item.path)
        }}
        previousKey={lastWorkerDockActive}
        iconForItem={(item, focused) => <Icon name={item.icon} active={focused} dock />}
        style={styles.workerDock}
        testID="worker-liquid-glass-dock"
      />
    </View>
  )
}

function AmbientBackdrop() {
  const { tokens } = useWorkerUi()
  const mintWashStyle = {
    opacity: 0.18,
    transform: [{ rotate: '-8deg' }],
  }
  const lineWashStyle = {
    opacity: 0.12,
  }

  return (
    <>
      <View style={[styles.backdropWarm, { backgroundColor: tokens.cream }]} />
      <View style={[styles.backdropMint, { backgroundColor: tokens.aqua }, mintWashStyle]} />
      <View style={[styles.backdropCyan, { backgroundColor: tokens.cyan }]} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, lineWashStyle]}>
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

function MapLineField({ compact = false }: { compact?: boolean }) {
  const { tokens } = useWorkerUi()
  const opacityScale = compact ? 0.9 : 1.08

  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 360 360" preserveAspectRatio="none">
      <Path d="M52 -14 C96 52 130 102 154 174 S194 296 252 390" stroke={tokens.mapLine} strokeWidth={5.2} opacity={0.22 * opacityScale} fill="none" />
      <Path d="M84 52 C144 88 206 92 292 76 S370 58 410 82" stroke={tokens.mapLine} strokeWidth={4.5} opacity={0.20 * opacityScale} fill="none" />
      <Path d="M24 166 C82 134 128 172 184 154 S270 104 354 136" stroke={tokens.mapLine} strokeWidth={4} opacity={0.27 * opacityScale} fill="none" />
      <Path d="M-16 248 C58 208 124 248 194 222 S292 174 388 204" stroke={tokens.mapLine} strokeWidth={4.2} opacity={0.24 * opacityScale} fill="none" />
      <Path d="M120 26 L116 126 M204 56 L186 176 M298 24 L278 132 M314 128 L330 262" stroke={tokens.mapLine} strokeWidth={2.8} opacity={0.14 * opacityScale} fill="none" />
      <Rect x={50} y={92} width={48} height={34} rx={12} fill={tokens.mapBlock} opacity={0.34} />
      <Rect x={220} y={84} width={60} height={38} rx={13} fill={tokens.mapBlock} opacity={0.3} />
      <Rect x={136} y={220} width={62} height={38} rx={13} fill={tokens.mapBlock} opacity={0.24} />
    </Svg>
  )
}

function WorkerMapRouteLine({ compact = false }: { compact?: boolean }) {
  const { tokens } = useWorkerUi()

  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 390 196" preserveAspectRatio="none">
      <Path d="M66 132 C116 98 153 122 194 86 S282 58 334 82" stroke={tokens.raised} strokeWidth={compact ? 12 : 15} strokeLinecap="round" opacity={0.84} fill="none" />
      <Path d="M66 132 C116 98 153 122 194 86 S282 58 334 82" stroke={tokens.primary} strokeWidth={compact ? 6 : 8} strokeLinecap="round" opacity={0.78} fill="none" />
    </Svg>
  )
}

function SubtleGlassHighlight() {
  const { tokens } = useWorkerUi()

  if (tokens.glassHighlight === 'transparent') return null
  return <View pointerEvents="none" style={[styles.glassTopHighlight, { backgroundColor: tokens.glassHighlight }]} />
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
    <View style={styles.preferenceRow}>
      <View style={styles.preferenceTitle}>
        <Icon name={mode === 'light' ? 'moon' : 'sun'} small />
        <View style={styles.preferenceCopy}>
          <Text style={[styles.listTitle, { color: tokens.ink }]} numberOfLines={1}>
            {copy.profile.theme}
          </Text>
          <Text style={[styles.listMetaInline, { color: tokens.muted }]} numberOfLines={1}>
            {currentModeLabel}
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityLabel={mode === 'light' ? copy.frame.themeDark : copy.frame.themeLight}
        accessibilityRole="switch"
        accessibilityState={{ checked: mode === 'dark' }}
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
  const currentLanguageLabel = language === 'vi' ? 'Tiếng Việt' : 'English'

  return (
    <View style={styles.preferenceRow}>
      <View style={styles.preferenceTitle}>
        <Icon name="globe" small />
        <View style={styles.preferenceCopy}>
          <Text style={[styles.listTitle, { color: tokens.ink }]} numberOfLines={1}>
            {copy.profile.language}
          </Text>
          <Text style={[styles.listMetaInline, { color: tokens.muted }]} numberOfLines={1}>
            {currentLanguageLabel}
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityLabel={copy.frame.lang}
        accessibilityRole="switch"
        accessibilityState={{ checked: language === 'en' }}
        onPress={() => setAppLanguage(nextLanguage)}
        style={({ pressed }) => [styles.preferenceSwitch, { backgroundColor: tokens.cyan, borderColor: tokens.borderStrong }, pressed ? styles.pressed : null]}
        testID="worker-language-toggle"
      >
        <View style={[styles.preferenceKnob, language === 'en' ? styles.preferenceKnobRight : null, { backgroundColor: tokens.primary }]} />
      </Pressable>
    </View>
  )
}

function TimelineCard() {
  const { copy, language, tokens } = useWorkerUi()
  const { selectors, state } = useFrontendWorkflow()
  const deal = getWorkerVisibleDeal(state.deal)
  const phases = getWorkerTimeline(deal ? selectors.currentStatus : null, language)

  return (
    <View style={[styles.timelineCard, workerOpaqueCardSurface(tokens)]}>
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

function getWorkerTimeline(status: LocalDealStatus | null, language: WorkerLanguageMode) {
  const steps: Array<{ label: string; statuses: LocalDealStatus[] }> = language === 'en' ? [
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
    segmentProgress.value = withTiming(pillLeft, { duration: 180 })
  }, [pillLeft, reduceMotion, segmentProgress])

  const liquidSegmentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: segmentProgress.value }],
  }), [segmentProgress])

  return (
    <View
      onLayout={(event) => {
        const nextWidth = event.nativeEvent.layout.width
        setShellWidth((current) => Math.abs(current - nextWidth) > 0.5 ? nextWidth : current)
      }}
      style={[styles.segmentShell, workerSegmentShellSurface(tokens)]}
      testID="worker-activity-filter-pattern"
    >
      <View style={styles.hiddenMarker} testID="worker-jobs-segment-opaque-shell" />
      <View style={styles.hiddenMarker} testID="worker-jobs-liquid-segment-selection" />
      {pillWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.segmentLiquidPill,
            {
              backgroundColor: reduceTransparency ? tokens.mint : tokens.mode === 'dark' ? 'rgba(23,59,53,0.92)' : 'rgba(209,250,240,0.88)',
              boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? 'inset 0 1px 0 rgba(255,255,255,0.10)' : 'inset 0 1px 0 rgba(255,255,255,0.80)',
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
    <View style={[styles.activeJobCard, workerJobCardSurface(tokens, tone)]} testID={testID}>
      <SubtleGlassHighlight />
      <View style={styles.identityRow}>
        <View style={[styles.readinessBadge, { backgroundColor: tokens.glassStrong, borderColor: tokens.border }]}>
          <Icon name={icon} active small />
        </View>
        <View style={styles.titleStack}>
          <Text style={[styles.statusPill, { alignSelf: 'flex-start', backgroundColor: tokens.mint, color: tokens.primary }]} numberOfLines={1}>
            {status}
          </Text>
          <Text adjustsFontSizeToFit minimumFontScale={0.8} numberOfLines={2} style={[styles.cardTitle, { color: tokens.ink }]}>
            {title}
          </Text>
        </View>
      </View>
      {body ? <Text numberOfLines={3} style={[styles.bodyText, { color: tokens.muted }]}>{body}</Text> : null}
    </View>
  )
}

function WorkerEmptyJobPanel({
  body,
  icon,
  primaryActionLabel,
  primaryActionPath,
  secondaryActionLabel,
  secondaryActionPath,
  status,
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
  status: string
  testID?: string
  title: string
  tone: WorkerTone
}) {
  const { language, tokens } = useWorkerUi()
  const { replace } = useRouter()

  return (
    <View style={[styles.activeJobCard, workerJobCardSurface(tokens, tone)]} testID={testID}>
      <SubtleGlassHighlight />
      <View style={styles.jobTop}>
        <View style={styles.identityRow}>
          <View style={[styles.readinessBadge, { backgroundColor: tokens.glassStrong, borderColor: tokens.border }]}>
            <Icon name={icon} active small />
          </View>
          <View style={styles.titleStack}>
            <Text style={[styles.statusPill, { alignSelf: 'flex-start', backgroundColor: tokens.mint, color: tokens.primary }]} numberOfLines={1}>
              {status}
            </Text>
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
      {primaryActionLabel && primaryActionPath ? (
        <View style={styles.actionRow}>
          <PressButton label={primaryActionLabel} onPress={() => replace(primaryActionPath)} testID={`${testID ?? 'worker-empty-job'}-primary-action`} />
          {secondaryActionLabel && secondaryActionPath ? (
            <PressButton secondary label={secondaryActionLabel} onPress={() => replace(secondaryActionPath)} testID={`${testID ?? 'worker-empty-job'}-secondary-action`} />
          ) : (
            <Text style={[styles.bodyText, { color: tokens.subtle, flex: 1, textAlign: 'center' }]} numberOfLines={2}>
              {language === 'en' ? 'No request yet' : 'Chưa có yêu cầu'}
            </Text>
          )}
        </View>
      ) : null}
    </View>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
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

function QuickPanel({ icon, title, tone, value }: { icon: WorkerIconName; title: string; tone: WorkerTone; value: string }) {
  const { tokens } = useWorkerUi()

  return (
    <View style={[styles.quickPanel, workerOpaqueCardSurface(tokens, tone)]}>
      <Icon name={icon} />
      <Text adjustsFontSizeToFit minimumFontScale={0.72} style={[styles.quickValue, { color: tokens.ink }]} numberOfLines={1}>
        {value}
      </Text>
      <Text adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.quickTitle, { color: tokens.ink }]} numberOfLines={1}>
        {title}
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

  return (
    <View style={[styles.chatBubble, messageBubbleSurface(tokens, { mine, system }), mine ? styles.chatBubbleMine : null]}>
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
  onPress: () => void
  secondary?: boolean
  testID?: string
}) {
  const { tokens } = useWorkerUi()

  return (
    <GlassPressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      active={!secondary}
      disabled={disabled}
      mode={tokens.mode}
      onPress={onPress}
      pressedStyle={!secondary ? styles.pressButtonPressedPrimary : null}
      style={[
        styles.pressButton,
        secondary ? styles.pressButtonSecondary : null,
        secondary ? workerSecondaryButtonSurface(tokens) : workerPrimaryButtonSurface(tokens),
        disabled ? styles.disabledButton : null,
      ]}
      testID={testID}
      variant="control"
    >
      <Text adjustsFontSizeToFit minimumFontScale={0.84} numberOfLines={1} style={[secondary ? styles.pressButtonTextSecondary : styles.pressButtonTextPrimary, { color: secondary ? tokens.primary : tokens.primaryText }]}>{label}</Text>
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
  const context = use(WorkerUiContext)
  if (!context) throw new Error('useWorkerUi must be used inside WorkerFrame')
  return context
}

function glassSurface(tokens: WorkerThemeTokens, tone: WorkerTone = 'base') {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const warmAccent = tokens.mode === 'dark' ? 'rgba(224,160,107,0.20)' : 'rgba(255,184,102,0.23)'
  const softWarmAccent = tokens.mode === 'dark' ? 'rgba(224,160,107,0.13)' : 'rgba(255,184,102,0.14)'
  const mintWash = tokens.mode === 'dark' ? 'rgba(105,222,198,0.17)' : 'rgba(183,246,231,0.34)'
  const reducedBackgroundColor =
    tone === 'raised' || tone === 'strong'
      ? tokens.glassStrong
      : tone === 'cream' || tone === 'warm'
        ? tokens.warm
        : tone === 'mint'
          ? tokens.mint
          : tone === 'cyan'
            ? tokens.cyan
            : tone === 'depth'
              ? tokens.depth
              : tokens.base
  const backgroundColor =
    reduceTransparency
      ? reducedBackgroundColor
      : tone === 'raised' || tone === 'strong'
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
  const experimentalBackgroundImage =
    tokens.mode === 'dark'
      ? tone === 'cream' || tone === 'warm'
        ? `radial-gradient(circle at 84% 42%, ${warmAccent}, transparent 31%), radial-gradient(circle at 18% 88%, ${mintWash}, transparent 38%), linear-gradient(120deg, rgba(59,41,27,0.70), rgba(18,34,32,0.68))`
        : tone === 'mint'
          ? `radial-gradient(circle at 88% 16%, ${softWarmAccent}, transparent 22%), radial-gradient(circle at 74% 62%, rgba(105,222,198,0.18), transparent 34%), linear-gradient(145deg, rgba(23,59,53,0.78), rgba(12,26,25,0.68))`
        : tone === 'cyan'
            ? `radial-gradient(circle at 92% 12%, ${softWarmAccent}, transparent 20%), radial-gradient(circle at 78% 62%, rgba(105,222,198,0.16), transparent 34%), linear-gradient(145deg, rgba(21,54,58,0.76), rgba(12,26,25,0.68))`
            : `radial-gradient(circle at 94% 10%, ${softWarmAccent}, transparent 20%), radial-gradient(circle at 10% 92%, ${mintWash}, transparent 34%), linear-gradient(145deg, rgba(22,43,40,0.78), rgba(12,26,25,0.68))`
      : tone === 'cream' || tone === 'warm'
        ? `radial-gradient(circle at 84% 42%, ${warmAccent}, transparent 31%), radial-gradient(circle at 18% 88%, ${mintWash}, transparent 38%), linear-gradient(120deg, rgba(201,248,237,0.62), rgba(255,243,205,0.48))`
        : tone === 'mint'
          ? `radial-gradient(circle at 88% 16%, ${softWarmAccent}, transparent 22%), radial-gradient(circle at 74% 62%, rgba(22,185,168,0.26), transparent 34%), linear-gradient(145deg, rgba(255,255,255,0.50), rgba(221,248,241,0.56))`
        : tone === 'cyan'
            ? `radial-gradient(circle at 92% 12%, ${softWarmAccent}, transparent 20%), radial-gradient(circle at 78% 62%, rgba(33,165,177,0.28), transparent 34%), linear-gradient(145deg, rgba(255,255,255,0.50), rgba(221,249,247,0.58))`
            : `radial-gradient(circle at 94% 10%, ${softWarmAccent}, transparent 20%), radial-gradient(circle at 10% 92%, ${mintWash}, transparent 34%), linear-gradient(145deg, rgba(255,255,255,0.50), rgba(224,248,242,0.34))`

  return {
    backgroundColor,
    borderColor: tokens.glassBorder,
    borderWidth: 1,
    boxShadow:
      reduceTransparency
        ? 'none'
        : tone === 'raised' || tone === 'strong'
        ? tokens.mode === 'dark'
          ? '0 10px 26px rgba(0,0,0,0.18)'
          : '0 10px 26px rgba(13,70,65,0.07)'
        : 'none',
    experimental_backgroundImage: reduceTransparency ? undefined : experimentalBackgroundImage,
  }
}

function messageBubbleSurface(tokens: WorkerThemeTokens, { mine, system }: { mine: boolean; system: boolean }) {
  const backgroundColor = mine
    ? tokens.mode === 'dark'
      ? '#173B35'
      : '#E1F8F2'
    : system
      ? tokens.mode === 'dark'
        ? '#15363A'
        : '#EBF9F8'
      : tokens.mode === 'dark'
        ? '#122724'
        : '#FFFDF8'

  return {
    backgroundColor,
    borderColor: system ? tokens.borderStrong : tokens.border,
    borderWidth: 1,
    boxShadow: 'none',
  }
}

function workerOpaqueCardSurface(tokens: WorkerThemeTokens, tone: WorkerTone = 'base') {
  const isWarm = tone === 'cream' || tone === 'warm'
  const isMint = tone === 'mint'
  const isCyan = tone === 'cyan'
  const backgroundColor = isWarm
    ? tokens.mode === 'dark'
      ? '#3B291B'
      : '#FFF8EB'
    : isMint
      ? tokens.mode === 'dark'
        ? '#173B35'
        : '#E8F9F4'
      : isCyan
        ? tokens.mode === 'dark'
          ? '#15363A'
          : '#EBF9F8'
        : tokens.mode === 'dark'
          ? '#122724'
          : '#FFFDF8'
  const experimentalBackgroundImage = tokens.mode === 'dark'
    ? isWarm
      ? 'linear-gradient(180deg, rgba(59,41,27,0.96), rgba(22,39,36,0.90))'
      : isMint
        ? 'linear-gradient(180deg, rgba(23,59,53,0.96), rgba(18,39,36,0.90))'
        : isCyan
          ? 'linear-gradient(180deg, rgba(21,54,58,0.96), rgba(18,39,36,0.90))'
          : 'linear-gradient(180deg, rgba(18,39,36,0.96), rgba(13,29,27,0.90))'
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
    experimental_backgroundImage: experimentalBackgroundImage,
  } as any
}

function workerJobCardSurface(tokens: WorkerThemeTokens, tone: WorkerTone = 'base') {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  if (tokens.mode === 'dark') {
    return workerOpaqueCardSurface(tokens, tone)
  }

  return {
    backgroundColor: reduceTransparency ? '#FFFDF8' : 'rgba(255,253,248,0.93)',
    borderColor: reduceTransparency ? tokens.border : 'rgba(35,96,84,0.12)',
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : '0 10px 28px rgba(17,70,61,0.08)',
  } as any
}

function workerDiagnosisSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(135deg, rgba(23,59,53,0.94), rgba(59,41,27,0.78))'
    : 'linear-gradient(135deg, rgba(223,253,246,0.94), rgba(255,247,226,0.80))'
  return {
    backgroundColor: tokens.mode === 'dark' ? '#15363A' : '#F7FFF9',
    borderColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.18)' : 'rgba(16,131,115,0.13)',
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
    ? 'linear-gradient(135deg, #69DEC6, #08786E)'
    : 'linear-gradient(135deg, #08786E, #0AA895)'
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
    backgroundColor: reduceTransparency ? tokens.raised : tokens.mode === 'dark' ? 'rgba(18,39,36,0.90)' : 'rgba(255,255,255,0.72)',
    borderColor: reduceTransparency ? tokens.border : tokens.mode === 'dark' ? 'rgba(105,222,198,0.18)' : 'rgba(20,117,105,0.12)',
    boxShadow: 'none',
    transition: reduceTransparency ? undefined : 'transform 130ms ease',
    experimental_backgroundImage: reduceTransparency
      ? undefined
      : tokens.mode === 'dark'
      ? 'linear-gradient(180deg, rgba(18,39,36,0.92), rgba(22,43,38,0.86))'
      : undefined,
  } as any
}

function workerSegmentShellSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  return {
    backgroundColor: reduceTransparency ? tokens.raised : tokens.mode === 'dark' ? 'rgba(18,39,36,0.86)' : 'rgba(255,255,255,0.66)',
    borderColor: reduceTransparency ? tokens.border : tokens.mode === 'dark' ? 'rgba(105,222,198,0.18)' : 'rgba(255,255,255,0.78)',
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? '0 10px 28px rgba(0,0,0,0.22)' : '0 10px 28px rgba(17,70,61,0.08)',
  } as any
}

function workerServiceTileSurface(tokens: WorkerThemeTokens) {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
  return {
    backgroundColor: tokens.mode === 'dark' ? '#122724' : '#F8FFFC',
    borderColor: tokens.border,
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? '0 10px 22px rgba(0,0,0,0.20)' : '0 10px 22px rgba(17,70,61,0.07)',
    experimental_backgroundImage: reduceTransparency
      ? undefined
      : tokens.mode === 'dark'
      ? 'linear-gradient(180deg, rgba(18,39,36,0.96), rgba(13,29,27,0.90))'
      : 'linear-gradient(180deg, rgba(255,255,255,0.94), rgba(248,255,252,0.86))',
  } as any
}

function workerIconBubbleSurface(tokens: WorkerThemeTokens, tone: WorkerTone = 'mint') {
  const isWarm = tone === 'cream' || tone === 'warm'
  const isCyan = tone === 'cyan'
  return {
    backgroundColor: isWarm ? tokens.cream : isCyan ? tokens.cyan : tokens.mint,
    borderColor: tokens.borderStrong,
    boxShadow: tokens.mode === 'dark' ? '0 8px 18px rgba(0,0,0,0.20)' : '0 8px 18px rgba(17,70,61,0.07)',
    experimental_backgroundImage: tokens.mode === 'dark'
      ? 'radial-gradient(circle at 24% 18%, rgba(255,255,255,0.10), transparent 28%), linear-gradient(145deg, rgba(105,222,198,0.16), rgba(18,39,36,0.82))'
      : isWarm
        ? 'radial-gradient(circle at 24% 18%, rgba(255,255,255,0.92), transparent 28%), linear-gradient(145deg, #FFF8EB, #F8E5C1)'
        : isCyan
          ? 'radial-gradient(circle at 24% 18%, rgba(255,255,255,0.92), transparent 28%), linear-gradient(145deg, #E8FCFA, #C8F0F2)'
          : 'radial-gradient(circle at 24% 18%, rgba(255,255,255,0.92), transparent 28%), linear-gradient(145deg, #DCFBF3, #BDF1E4)',
  } as any
}

function workerMapViewportSurface(tokens: WorkerThemeTokens) {
  return {
    backgroundColor: tokens.mode === 'dark' ? tokens.depth : '#F8FFF9',
    experimental_backgroundImage:
      tokens.mode === 'dark'
        ? 'radial-gradient(circle at 24% 24%, rgba(105,222,198,0.15), transparent 26%), radial-gradient(circle at 88% 82%, rgba(224,160,107,0.13), transparent 28%), linear-gradient(145deg, #102521, #17342F 54%, #342719)'
        : 'radial-gradient(circle at 18% 22%, rgba(196,255,242,0.88), transparent 26%), radial-gradient(circle at 88% 78%, rgba(255,240,206,0.84), transparent 28%), linear-gradient(145deg, #F7FFF9, #E6FBF5 52%, #FFF8E8)',
  } as any
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  inactiveRouteSurface: { display: 'none' },
  canvas: { alignItems: 'center', flex: 1, overflow: 'hidden' },
  backdropWarm: { borderRadius: 30, bottom: 72, height: 148, left: -98, opacity: 0.12, position: 'absolute', transform: [{ rotate: '12deg' }], width: 210 },
  backdropMint: { borderRadius: 36, height: 226, opacity: 0.18, position: 'absolute', right: -126, top: 54, width: 294 },
  backdropCyan: { borderRadius: 30, height: 148, left: -96, opacity: 0.1, position: 'absolute', top: 200, transform: [{ rotate: '-10deg' }], width: 220 },
  sectionMotionField: { bottom: 0, overflow: 'hidden', position: 'absolute', top: 0, zIndex: 0 },
  sectionMotionRibbon: { borderRadius: 34, height: 760, left: 18, position: 'absolute', width: 62 },
  sectionMotionWash: { borderRadius: 34, height: 178, position: 'absolute', right: -92, width: 224 },
  sectionMotionCaustic: { borderRadius: 30, bottom: 84, height: 118, left: -104, position: 'absolute', width: 268 },
  sectionMotionGlint: { bottom: 52, height: 260, left: '50%', position: 'absolute', width: 34 },
  scrollContent: { gap: 12, paddingHorizontal: workerFrameHorizontalPadding, paddingTop: 8, zIndex: 2 },
  kicker: { fontSize: 12, fontWeight: '600', letterSpacing: 0 },
  screenSubtitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0, lineHeight: 16 },
  screenTitle: { fontSize: 25, fontWeight: '700', letterSpacing: 0, lineHeight: 27 },
  workerTopRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 47, paddingTop: 0 },
  screenHeaderAction: { alignItems: 'center', borderRadius: 18, borderWidth: 1, height: 46, justifyContent: 'center', width: 46 },
  screenHeaderPill: { borderRadius: 999, borderWidth: 1, flexShrink: 0, fontSize: 12, fontWeight: '700', lineHeight: 14, maxWidth: 126, overflow: 'hidden', paddingHorizontal: 11, paddingVertical: 8 },
  glassTopHighlight: { height: 1, left: 16, opacity: 0.82, position: 'absolute', right: 16, top: 0, zIndex: 0 },
  glassSheen: { height: '170%', left: -72, opacity: 0.42, position: 'absolute', top: -46, transform: [{ rotate: '11deg' }], width: 58, zIndex: 0 },
  glassMotionRibbon: { borderRadius: 999, height: 168, left: 16, position: 'absolute', top: -168, width: 58, zIndex: 0 },
  glassMotionRibbonCompact: { height: 118, left: 8, top: -118, width: 38 },
  glassMotionCore: { borderRadius: 999, height: 118, left: 56, position: 'absolute', top: -118, width: 13, zIndex: 0 },
  glassMotionCoreCompact: { height: 86, left: 36, top: -86, width: 9 },
  mapStage: { borderRadius: 24, minHeight: 196, overflow: 'hidden', padding: 0, position: 'relative' },
  workerMapTopHud: { flexDirection: 'row', gap: 8, left: 12, maxWidth: '78%', position: 'absolute', top: 12, zIndex: 4 },
  searchPill: { alignItems: 'center', borderRadius: 999, flexDirection: 'row', gap: 8, minHeight: 38, paddingHorizontal: 12 },
  searchText: { flex: 1, fontSize: 15, fontWeight: '600' },
  workerMapHudStack: { bottom: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8, left: 12, position: 'absolute', right: 12, zIndex: 4 },
  workerMapHudChip: { borderRadius: 999, minHeight: 36, overflow: 'hidden', paddingHorizontal: 11, paddingVertical: 8 },
  mapViewport: { borderRadius: 24, minHeight: 196, overflow: 'hidden', position: 'relative' },
  compactPresenceMap: { borderRadius: 28, minHeight: 196, overflow: 'hidden', padding: 10, position: 'relative' },
  compactMapViewport: { borderRadius: 24, minHeight: 176, overflow: 'hidden', position: 'relative' },
  compactMapVeil: { left: '54%', top: 42 },
  compactMapMarker: { alignItems: 'center', borderRadius: 999, borderWidth: 1, height: 44, justifyContent: 'center', position: 'absolute', width: 44 },
  compactMapMarkerZone: { left: '30%', top: '48%' },
  compactMapMarkerWorker: { right: '20%', top: '28%' },
  mapFogTop: { height: 92, left: 0, opacity: 0.38, position: 'absolute', right: 0, top: 0 },
  mapFogBottom: { bottom: -6, height: 86, left: 0, opacity: 0.5, position: 'absolute', right: 0 },
  mapCyanVeil: { borderRadius: 999, height: 118, left: '50%', marginLeft: -59, opacity: 0.12, position: 'absolute', top: 120, width: 118 },
  homeMapMarker: { alignItems: 'center', borderRadius: 18, borderWidth: 2, height: 46, justifyContent: 'center', position: 'absolute', width: 46, zIndex: 4 },
  homeMapMarkerWorker: { right: '21%', top: '29%' },
  homeMapMarkerZone: { left: '22%', top: '45%' },
  homeMapZoneHalo: { borderRadius: 999, height: 92, opacity: 0.16, position: 'absolute', width: 92 },
  mapChipTop: { left: 6, position: 'absolute', top: 15 },
  mapZonePill: { borderRadius: 22, left: 6, maxWidth: '64%', paddingHorizontal: 12, paddingVertical: 9, position: 'absolute', top: 9 },
  mapChipTitle: { fontSize: 14, fontWeight: '600', letterSpacing: 0 },
  mapChipMeta: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  mapCardsRow: { flexDirection: 'row', gap: 12, marginTop: -56, zIndex: 5 },
  mapFeatureCard: { borderRadius: 22, flex: 1, minHeight: 100, overflow: 'hidden', padding: 13, position: 'relative' },
  mapFeatureTitle: { fontSize: 17, fontWeight: '600', letterSpacing: 0 },
  mapFeatureMeta: { fontSize: 11, fontWeight: '600', lineHeight: 14, marginTop: 4 },
  mapFeatureIcon: { alignItems: 'center', borderRadius: 999, bottom: 12, height: 50, justifyContent: 'center', position: 'absolute', right: 12, width: 50 },
  shiftCard: { borderRadius: 24, gap: 10, overflow: 'hidden', padding: 14, position: 'relative' },
  shiftActionRow: { flexDirection: 'row', gap: 10 },
  rowBetween: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  identityRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  titleStack: { flex: 1, gap: 4 },
  heroTitle: { fontSize: 18, fontWeight: '600', letterSpacing: 0 },
  bodyText: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
  toggleTrack: { alignItems: 'flex-end', borderRadius: 999, height: 32, justifyContent: 'center', padding: 4, width: 58 },
  toggleKnob: { borderRadius: 999, height: 24, width: 24 },
  workerServiceGrid: { flexDirection: 'row', gap: 10 },
  workerServiceTile: { borderRadius: 22, borderWidth: 1, flex: 1, minHeight: 96, overflow: 'hidden', padding: 11, position: 'relative' },
  workerServiceIcon: { alignItems: 'center', borderRadius: 16, borderWidth: 1, height: 38, justifyContent: 'center', width: 38 },
  workerServiceTitle: { fontSize: 14, fontWeight: '600', letterSpacing: 0, lineHeight: 16, marginTop: 9 },
  workerServiceMeta: { fontSize: 10, fontWeight: '700', letterSpacing: 0, marginTop: 3 },
  workerMiniGrid: { flexDirection: 'row', gap: 10 },
  workerMiniCard: { borderRadius: 20, borderWidth: 1, flex: 1, gap: 4, minHeight: 84, overflow: 'hidden', padding: 12 },
  workerMiniTitle: { fontSize: 16, fontWeight: '600', letterSpacing: 0, lineHeight: 18 },
  workerMiniMeta: { fontSize: 11, fontWeight: '600', lineHeight: 14 },
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
  scopeRequestBox: { gap: 8 },
  actionRow: { flexDirection: 'row', gap: 9 },
  pressButton: { alignItems: 'center', borderRadius: 17, flex: 1, justifyContent: 'center', minHeight: 48 },
  pressButtonPressedPrimary: { filter: Platform.OS === 'web' ? 'brightness(0.98)' : undefined } as any,
  pressButtonSecondary: { borderRadius: 15, minHeight: 44 },
  disabledButton: { opacity: 0.52 },
  pressButtonTextPrimary: { fontSize: 14, fontWeight: '700' },
  pressButtonTextSecondary: { fontSize: 13, fontWeight: '700' },
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
  activeJobCard: { borderRadius: 22, borderWidth: 1, gap: 12, overflow: 'hidden', padding: 15 },
  jobTop: { gap: 10 },
  jobTopRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  jobDiagnosisBox: { borderRadius: 22, gap: 10, padding: 16 },
  flowCard: { borderRadius: 28, gap: 10, overflow: 'hidden', padding: 16, position: 'relative' },
  needsReviewCard: { borderRadius: 22, borderWidth: 1, gap: 12, overflow: 'hidden', padding: 15, position: 'relative' },
  needsReviewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusPill: { borderRadius: 999, fontSize: 12, fontWeight: '600', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 6 },
  cardTitle: { fontSize: 17, fontWeight: '600', letterSpacing: 0, lineHeight: 23 },
  chatShell: { flex: 1, gap: 12, minHeight: 620, paddingBottom: 86, position: 'relative' },
  kaelClientStage: { flex: 1, gap: 12, justifyContent: 'space-between', minHeight: 642, paddingBottom: 2, position: 'relative' },
  kaelClientStageEmpty: { opacity: 0.92 },
  kaelBlankCanvas: { flex: 1, minHeight: 240, overflow: 'hidden', position: 'relative' },
  kaelCanvasWashLarge: { borderRadius: 32, height: 168, left: -48, opacity: 0.07, position: 'absolute', top: 46, transform: [{ rotate: '-8deg' }], width: 168 },
  kaelCanvasWashWarm: { borderRadius: 28, bottom: 42, height: 126, opacity: 0.06, position: 'absolute', right: -34, transform: [{ rotate: '12deg' }], width: 126 },
  jobRoomWaiting: { alignItems: 'center', gap: 8, justifyContent: 'center', minHeight: 228, padding: 18, position: 'relative', zIndex: 2 },
  jobRoomKaelHead: { height: 70, width: 70 },
  jobRoomStack: { gap: 10, paddingBottom: 86 },
  jobRoomHeader: { borderRadius: 24, borderWidth: 1, gap: 10, overflow: 'hidden', padding: 13 },
  jobRoomMetaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  jobRoomMetaCell: { borderRadius: 18, borderWidth: 1, flexBasis: '47%', flexGrow: 1, gap: 4, minHeight: 66, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 9 },
  jobRoomMetaValue: { fontSize: 13, fontWeight: '600', letterSpacing: 0, lineHeight: 17 },
  jobRoomBrief: { borderRadius: 22, borderWidth: 1, gap: 8, overflow: 'hidden', padding: 12 },
  jobRoomGate: { alignItems: 'center', borderRadius: 22, borderWidth: 1, flexDirection: 'row', gap: 10, overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 11 },
  jobRoomTopBar: { alignItems: 'center', borderRadius: 24, borderWidth: 1, flexDirection: 'row', gap: 10, marginBottom: 12, minHeight: 68, paddingHorizontal: 12, paddingVertical: 10 },
  jobRoomBackButton: { alignItems: 'center', borderRadius: 18, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
  jobRoomHeaderAvatar: { height: 44, width: 44 },
  jobRoomStatusPill: { borderRadius: 999, borderWidth: 1, fontSize: 11, fontWeight: '700', letterSpacing: 0, maxWidth: 94, overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 7, textAlign: 'center' },
  jobRoomTitleStack: { flex: 1, minWidth: 0 },
  chatStack: { gap: 10 },
  chatBubble: { alignSelf: 'flex-start', borderRadius: 22, maxWidth: '88%', padding: 13 },
  chatBubbleMine: { alignSelf: 'flex-end' },
  chatWho: { fontSize: 12, fontWeight: '600' },
  chatText: { fontSize: 14, fontWeight: '600', lineHeight: 20, marginTop: 3 },
  chatComposer: { alignItems: 'center', borderRadius: 24, borderWidth: 1, bottom: 0, flexDirection: 'row', gap: 8, left: 0, minHeight: 64, overflow: 'hidden', padding: 7, position: 'absolute', right: 0, zIndex: 12 },
  composerTool: { alignItems: 'center', borderRadius: 16, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  chatInput: { flex: 1, flexShrink: 1, fontSize: 15, fontWeight: '500', minHeight: 40, minWidth: 0, paddingHorizontal: 8 },
  sendButton: { alignItems: 'center', borderRadius: 17, flexShrink: 0, height: 42, justifyContent: 'center', width: 42 },
  earningsHero: { borderRadius: 32, gap: 12, overflow: 'hidden', padding: 18, position: 'relative' },
  earningsHeroWrap: { gap: 0, position: 'relative' },
  earningsBadge: { alignItems: 'center', borderRadius: 24, height: 58, justifyContent: 'center', transform: [{ rotate: '-5deg' }], width: 58 },
  earningsTrendCard: { borderRadius: 32, gap: 14, overflow: 'hidden', padding: 18, position: 'relative' },
  earningsTrendTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  earningsChartShell: { borderRadius: 22, borderWidth: 1, gap: 12, justifyContent: 'space-between', minHeight: 150, padding: 15 },
  earningsChartEmptyState: { alignItems: 'center', flex: 1, gap: 8, justifyContent: 'center', minHeight: 102, overflow: 'hidden', position: 'relative' },
  earningsChartBaseline: { borderRadius: 999, height: 3, left: 0, opacity: 0.52, position: 'absolute', right: 0, top: '56%' },
  earningsBarRail: { alignItems: 'flex-end', flexDirection: 'row', gap: 10, minHeight: 104 },
  earningsEmptyBar: { borderRadius: 999, boxShadow: '0 8px 14px rgba(10,122,107,0.16)', width: 26 },
  earningsDayRail: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  earningsSummaryGrid: { flexDirection: 'row', gap: 10 },
  earningsSummaryCell: { borderRadius: 24, borderWidth: 1, flex: 1, gap: 4, minHeight: 86, padding: 14 },
  moneyText: { fontSize: 34, fontVariant: ['tabular-nums'], fontWeight: '600', letterSpacing: 0 },
  moneyTextState: { fontSize: 24, lineHeight: 30 },
  listCard: { borderRadius: 29, gap: 4, overflow: 'hidden', padding: 10, position: 'relative' },
  listRow: { alignItems: 'center', flexDirection: 'row', gap: 11, minHeight: 54, paddingHorizontal: 8 },
  listTitle: { flex: 1, fontSize: 14, fontWeight: '600' },
  listMeta: { fontSize: 12, fontWeight: '600', maxWidth: 120, textAlign: 'right' },
  listMetaInline: { fontSize: 11, fontWeight: '600', lineHeight: 14 },
  profileHead: { borderRadius: 30, gap: 14, overflow: 'hidden', padding: 16, position: 'relative' },
  profileHeroTop: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  avatarWrap: { alignItems: 'center', borderRadius: 999, height: 56, justifyContent: 'center', width: 56 },
  profileAvatarHero: {
    alignItems: 'center',
    backgroundColor: '#08786E',
    borderColor: 'rgba(255,255,255,0.72)',
    borderRadius: 20,
    borderWidth: 1,
    boxShadow: '0 12px 22px rgba(10,119,105,0.20)',
    height: 52,
    justifyContent: 'center',
    width: 52,
    experimental_backgroundImage: 'linear-gradient(135deg, #08786E, #38D8BA)',
  } as any,
  profileName: { fontSize: 22, fontWeight: '600', letterSpacing: 0, lineHeight: 27 },
  profileBadge: { alignItems: 'center', borderRadius: 999, height: 42, justifyContent: 'center', width: 42 },
  scoreNumber: { fontSize: 28, fontWeight: '600', letterSpacing: 0, lineHeight: 34 },
  skillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  skillPill: { borderRadius: 999, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 13 },
  skillText: { fontSize: 13, fontWeight: '600' },
  profileMiniGrid: { flexDirection: 'row', gap: 10 },
  profileSyncPreview: { borderRadius: 24, borderWidth: 1, gap: 4, overflow: 'hidden', padding: 14 },
  profileSyncPreviewTop: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  preferenceCard: { borderRadius: 29, gap: 6, overflow: 'hidden', padding: 10, position: 'relative' },
  preferenceRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 54, paddingHorizontal: 8 },
  preferenceTitle: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 11 },
  preferenceCopy: { flex: 1, gap: 2, minWidth: 0 },
  preferenceSwitch: { borderRadius: 999, borderWidth: 1, height: 44, justifyContent: 'center', padding: 6, width: 72 },
  preferenceKnob: { borderRadius: 999, height: 28, width: 28 },
  preferenceKnobRight: { alignSelf: 'flex-end' },
  verificationCard: { borderRadius: 29, gap: 10, overflow: 'hidden', padding: 14, position: 'relative' },
  verificationGrid: { flexDirection: 'row', gap: 8 },
  verificationInput: { borderRadius: 18, borderWidth: 1, fontSize: 14, fontWeight: '600', minHeight: 46, paddingHorizontal: 12 },
  verificationHalfInput: { flex: 1, minWidth: 0 },
  serviceAreaPicker: { borderRadius: 22, borderWidth: 1, gap: 10, padding: 12 },
  serviceAreaAnchorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  serviceAreaAnchorButton: { borderRadius: 999, borderWidth: 1, justifyContent: 'center', minHeight: 40, paddingHorizontal: 11, paddingVertical: 7 },
  serviceAreaAnchorText: { fontSize: 12, fontWeight: '700', letterSpacing: 0, lineHeight: 16 },
  serviceAreaRadiusRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  serviceAreaRadiusButton: { alignItems: 'center', borderRadius: 999, borderWidth: 1, height: 38, justifyContent: 'center', width: 38 },
  serviceAreaRadiusControlText: { fontSize: 22, fontWeight: '700', letterSpacing: 0, lineHeight: 24 },
  serviceAreaRadiusValue: { flex: 1, fontSize: 18, fontWeight: '700', letterSpacing: 0, lineHeight: 24, textAlign: 'center' },
  serviceAreaRadiusPresets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  verificationHint: { fontSize: 12, fontWeight: '600', lineHeight: 16 },
  verificationFiles: { flexDirection: 'row', gap: 8 },
  verificationFileButton: { alignItems: 'center', borderRadius: 18, borderWidth: 1, flex: 1, gap: 5, justifyContent: 'center', minHeight: 72, padding: 8 },
  verificationFileText: { fontSize: 11, fontWeight: '600', lineHeight: 14, textAlign: 'center' },
  dockWrap: { alignSelf: 'center', minHeight: workerDockHeight, position: 'absolute', zIndex: 30 },
  dockBackdropShield: { borderRadius: 38, bottom: -10, height: 90, left: -6, opacity: 0, position: 'absolute', right: -6, zIndex: -2 },
  workerDock: { alignItems: 'center', borderRadius: 32, borderWidth: 1, flexDirection: 'row', gap: 5, height: workerDockHeight, justifyContent: 'space-around', overflow: 'hidden', padding: 7, position: 'relative' },
  motionSweep: { borderRadius: 999, height: 76, position: 'absolute', top: -18, width: 96 },
  pressed: { opacity: 0.78 },
  hiddenMarker: { height: 0, opacity: 0, width: 0 },
})
