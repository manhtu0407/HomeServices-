import AsyncStorage from '@react-native-async-storage/async-storage'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { createContext, type ReactNode, use, useEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { HCMC_DISTRICTS, normalizeDistrict, type DistrictSlug, type LocalDeal, type LocalDealStatus, type ServiceType, type WorkerRegisterInput, type WorkerVerificationStatus } from '@home-services/shared'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { FloatingGlassTabBar, type FloatingGlassTabItem } from '@/components/ui/floating-glass-tab-bar'
import { GlassModalSheet } from '@/components/ui/glass-modal-sheet'
import { GlassPressable } from '@/components/ui/glass-pressable'
import { ReduceMotionAwareEntranceView } from '@/components/ui/reduce-motion-aware-animation'
import { appCopy, localizedProblemLabel, localizedServiceLabel, localizedStatusLabel, setAppLanguage, type AppLanguage, useAppLanguage } from '@/lib/app-language'
import type { WorkerProfileResponse } from '@/lib/api-types'
import { useAuth } from '@/lib/auth-provider'
import { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { uploadJobMediaDrafts, uploadWorkerVerificationDrafts, type LocalMediaUploadDraft } from '@/lib/media-upload'
import { jobService } from '@/lib/services'
import type { JobMessageResponse } from '@/lib/api-types'

const WORKER_XANHSM_REFERENCE_AUDIT = 'WORKER_XANHSM_REFERENCE_AUDIT: XanhSM map shell translated into Home Services worker production UI'
const WORKER_PRODUCTION_CONTRACT = 'WORKER_PRODUCTION_CONTRACT: docs/design/worker-production-contract.md'
const WORKER_CLIENT_BASELINE_AUDIT = 'WORKER_CLIENT_BASELINE_AUDIT: customer V4 semantic layers matched for worker production'
const WORKER_THEME_LANGUAGE_STORE = 'WORKER_THEME_LANGUAGE_STORE: worker-theme-language-switch AsyncStorage useSyncExternalStore'
const WORKER_FLEXIBLE_MAP_SHELL = 'WORKER_FLEXIBLE_MAP_SHELL: worker-map-google-ready flexible-map-preview'
const WORKER_DOCK_GLASS_MOTION = 'WORKER_DOCK_GLASS_MOTION: worker-dock-glass-aura worker-liquid-glass-dock worker-dock-kael-brief-mascot worker-dock-icon-system'
const WORKER_GLASSMORPHISM_MOTION_LAYER = 'WORKER_GLASSMORPHISM_MOTION_LAYER: shared-glass-pressable static-depth-layer centered-metric-type'
const WORKER_CHATBOX_EMPTY_COMPOSER = 'WORKER_CHATBOX_EMPTY_COMPOSER: worker-kael-empty-chat-state worker-kael-local-chat-input submitWorkerChatMessage'
const WORKER_NO_FULL_ADDRESS_BEFORE_ACCEPT = 'WORKER_NO_FULL_ADDRESS_BEFORE_ACCEPT: general area only until worker accepts'
const WORKER_NO_FAKE_PAYMENT_DATA = 'WORKER_NO_FAKE_PAYMENT_DATA: worker-no-fake-payment-data'
const WORKER_JOBROOM_KAEL_HANDOFF = 'WORKER_JOBROOM_KAEL_HANDOFF: worker-jobroom-kael-handoff worker-jobroom-waiting-room worker-jobroom-privacy-gate'

const WORKER_DECORATIVE_MOTION_ENABLED = false
const WORKER_THEME_STORAGE_KEY = 'home-services.worker.theme.production'
const workerDockHeight = 64
const workerDockBottomMargin = 8
const workerDockClearance = workerDockHeight + workerDockBottomMargin + 76
const workerFrameHorizontalPadding = 16
const kaelHead = require('../../assets/kael-model-8a-head.png')

type WorkerThemeMode = 'dark' | 'light'
type WorkerLanguageMode = AppLanguage
type WorkerVerificationFileSlot = 'cccdFront' | 'cccdBack' | 'selfie'

type WorkerActiveTab = 'chat' | 'earnings' | 'home' | 'jobs' | 'profile'
type WorkerJobsTab = 'active' | 'needs' | 'waiting'
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
type WorkerChatMessage = { id: string; mine?: boolean; system?: boolean; text: string; who: string }
type WorkerBroadcastView = NonNullable<LocalDeal['broadcast']>

// Phase 5.9 (plan §22.10.J, 2026-05-23): removed module-level mutable
// `lastWorkerDockActive`. Written-only, never read — see customer-surfaces.tsx
// comment for the rationale and the future-state plan if persistence is needed.
const workerJobsTabKeys: WorkerJobsTab[] = ['waiting', 'active', 'needs']
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
      readinessNoProfile: 'Hoàn tất hồ sơ thợ trước khi nhận yêu cầu mới.',
      readinessOnline: 'Bật nhận việc khi hồ sơ đã được duyệt và bạn đang rảnh.',
      readinessOffline: 'Tắt nhận việc khi đang bận hoặc chưa đủ điều kiện nhận yêu cầu.',
      readinessSuspended: 'Tài khoản đang tạm khóa. Tắt nhận việc và liên hệ hỗ trợ trước khi nhận yêu cầu mới.',
      readinessVerification: 'Xác minh',
      readinessAvailability: 'Khả dụng',
      readinessRequest: 'Yêu cầu mới',
      mapSearch: 'Chờ yêu cầu mới',
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
      electricianCard: 'Kỹ thuật điện',
      plumberCard: 'Hệ thống nước',
      cleaningCard: 'Vệ sinh nhà',
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
      accept: 'Chấp nhận',
    },
    jobs: {
      eyebrow: 'Công việc',
      title: 'Yêu cầu',
      filters: ['Chờ nhận', 'Đang làm', 'Cần xử lý'],
      emptyStatus: 'Đang theo dõi',
      emptyTitle: 'Chưa có việc đang làm',
      emptyBody: 'Kael sẽ đưa yêu cầu mới vào đây khi có khách xác nhận tìm thợ.',
      scopeStatus: 'Khách quyết định',
      scopeTitle: 'Thay đổi phạm vi',
      scopeBody: 'Thợ chờ khách xác nhận trước khi tiếp tục phần việc mới.',
      jobRoomCta: 'Mở phòng việc',
    },
    chat: {
      eyebrow: 'Tin nhắn',
      title: 'Phòng việc',
      jobRoomTitle: 'Phòng việc Kael',
      waitingTitle: 'Đang chờ Kael đưa việc',
      waitingBody: 'Khi khách xác nhận tìm thợ, Kael sẽ mở tóm tắt công việc, khu vực chung và kênh trao đổi.',
      waitingInput: 'Chờ Kael đưa yêu cầu vào phòng việc.',
      handoffTitle: 'Kael giao việc',
      privacyGate: 'Địa chỉ chi tiết chỉ mở sau khi thợ chấp nhận.',
      acceptedGate: 'Đã nhận việc. Có thể trao đổi trong phòng việc.',
      lockedGate: 'Chấp nhận việc để mở trao đổi.',
      serviceLabel: 'Dịch vụ',
      problemLabel: 'Vấn đề',
      areaLabel: 'Khu vực',
      statusLabel: 'Trạng thái',
      briefTitle: 'Tóm tắt an toàn',
      briefBody: 'Kael giữ tóm tắt công việc và mốc an toàn trước khi thợ phản hồi.',
      emptyTitle: 'Chưa có tin nhắn',
      emptyBody: 'Tin nhắn chỉ mở khi có yêu cầu thật hoặc thợ đã nhận việc.',
      input: 'Nhập...',
      send: 'Gửi',
      worker: 'Thợ',
      kael: 'Kael',
      customer: 'Khách',
      sendErrorFallback: 'Không gửi được tin nhắn. Vui lòng thử lại.',
    },
    earnings: {
      eyebrow: 'Thu nhập',
      title: 'Đối soát',
      today: 'Dữ liệu đối soát',
      noReconciliation: 'Chưa có đối soát',
      body: '',
      complete: 'Hoàn tất',
      waiting: 'Chờ khách',
      ledgerTitle: 'Sổ đối soát',
      rows: [
        ['Yêu cầu dịch vụ', appCopy.vi.common.noRequest],
        ['Tài khoản nhận tiền', 'Chưa lưu hệ thống'],
        ['Thanh toán & đánh giá', appCopy.vi.common.noData],
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
      readinessNoProfile: 'Complete your worker profile before receiving new requests.',
      readinessOnline: 'Go online when your profile is approved and you are available.',
      readinessOffline: 'Stay offline while busy or not eligible for new requests.',
      readinessSuspended: 'This account is suspended. Stay offline and contact support before receiving new requests.',
      readinessVerification: 'Verification',
      readinessAvailability: 'Availability',
      readinessRequest: 'New request',
      mapSearch: 'Waiting for a new request',
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
      filters: ['Pending', 'Active', 'Needs review'],
      emptyStatus: 'Watching',
      emptyTitle: 'No active job',
      emptyBody: 'Kael will place new requests here after a customer confirms worker search.',
      scopeStatus: 'Customer decides',
      scopeTitle: 'Scope change',
      scopeBody: 'Wait for the customer decision before continuing the changed scope.',
      jobRoomCta: 'Open JobRoom',
    },
    chat: {
      eyebrow: 'Chat',
      title: 'JobRoom',
      jobRoomTitle: 'Kael JobRoom',
      waitingTitle: 'Waiting for Kael to hand off a job',
      waitingBody: 'When a customer confirms worker search, JobRoom opens the job brief, general area, and relay channel.',
      waitingInput: 'Waiting for Kael to place a request in JobRoom.',
      handoffTitle: 'Kael handoff',
      privacyGate: 'Detailed address opens only after acceptance.',
      acceptedGate: 'Job accepted. You can message in JobRoom.',
      lockedGate: 'Accept the job to unlock messaging.',
      serviceLabel: 'Service',
      problemLabel: 'Problem',
      areaLabel: 'Area',
      statusLabel: 'Status',
      briefTitle: 'Safety brief',
      briefBody: 'Kael keeps the job brief and safety context before worker replies.',
      emptyTitle: 'No messages yet',
      emptyBody: 'Messages open only for a real request or an accepted job.',
      input: 'Type...',
      send: 'Send',
      worker: 'Worker',
      kael: 'Kael',
      customer: 'Customer',
      sendErrorFallback: 'Could not send the message. Please try again.',
    },
    earnings: {
      eyebrow: 'Earnings',
      title: 'Reconcile',
      today: 'Reconciliation data',
      noReconciliation: 'No reconciliation yet',
      body: '',
      complete: 'Completed',
      waiting: 'Waiting',
      ledgerTitle: 'Ledger',
      rows: [
        ['Service request', appCopy.en.common.noRequest],
        ['Payout account', 'Not stored yet'],
        ['Payment & review', appCopy.en.common.noData],
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
    // Phase 2.0 (2026-05-23): worker không nhập giá. Kael giữ price authority.
    kaelLockedPriceLabel: 'Giá Kael chốt',
    kaelLockedPriceWaiting: 'Kael chưa chốt giá',
    completionNotes: 'Ghi chú khi hoàn tất',
    completionPhotosLabel: 'Ảnh sau khi hoàn tất (1-5 ảnh)',
    scopeDescription: 'Mô tả phần phát sinh',
    scopeReason: 'Lý do vì sao thay đổi',
    scopeKaelPriceHint: 'Kael sẽ tính lại giá khi khách xem yêu cầu.',
    scopePhotosLabel: 'Ảnh phần phát sinh (tuỳ chọn)',
    scopeSubmit: 'Yêu cầu đổi phạm vi',
    scopeWaiting: 'Chờ khách quyết định thay đổi phạm vi.',
    cancelReason: 'Lý do cần hủy',
    cancelPlaceholder: 'Lý do hủy và tìm thợ thay thế',
    cancelSubmit: 'Yêu cầu hủy có lý do',
    review: 'Kiểm tra lại',
    send: 'Gửi',
    uploading: 'Đang tải ảnh…',
    pickPhotos: 'Chọn ảnh',
    progress: {
      worker_start_travel: 'Bắt đầu di chuyển',
      worker_mark_arrived: 'Đã đến nơi',
      worker_start_inspection: 'Bắt đầu kiểm tra',
      worker_start_repair: 'Bắt đầu sửa',
      worker_complete_job: 'Báo hoàn tất',
    },
    alerts: {
      completeTitle: 'Xác nhận báo hoàn tất?',
      completeBody: 'Hệ thống sẽ báo khách kiểm tra và xác nhận. Thanh toán vẫn khóa ở giai đoạn này.',
      completionPhotoRequiredTitle: 'Cần ảnh hoàn tất',
      completionPhotoRequiredBody: 'Tải ít nhất 1 ảnh sau khi xong việc để khách kiểm tra trước khi xác nhận.',
      completionNotesShortTitle: 'Ghi chú quá ngắn',
      completionNotesShortBody: 'Ghi chú ít nhất 10 ký tự về phần đã làm để khách hiểu rõ.',
      scopeDescriptionTitle: 'Cần mô tả phạm vi mới',
      scopeDescriptionBody: 'Nhập rõ phần phát sinh để Kael tính lại giá cho khách.',
      scopeReasonTitle: 'Cần lý do',
      scopeReasonBody: 'Ghi rõ vì sao phạm vi thay đổi để khách hiểu trước khi quyết định.',
      scopeConfirmTitle: 'Gửi yêu cầu đổi phạm vi?',
      scopeConfirmBody: 'Hệ thống sẽ khóa tiến độ cho tới khi khách duyệt hoặc từ chối. Kael sẽ tự tính lại giá.',
      cancelReasonTitle: 'Cần lý do hủy',
      cancelReasonBody: 'Nhập lý do cụ thể. Hệ thống sẽ hủy lượt nhận việc này và bắt đầu tìm thợ thay thế sau khi gửi.',
      cancelConfirmTitle: 'Gửi yêu cầu hủy việc?',
      cancelConfirmBody: 'Sau khi gửi, lượt nhận việc của bạn sẽ được hủy và hệ thống tự động tìm thợ thay thế cho khách.',
      photoPermissionTitle: 'Cần quyền truy cập ảnh',
      photoPermissionBody: 'Cho phép ứng dụng truy cập thư viện ảnh để tải bằng chứng.',
      uploadFailedTitle: 'Tải ảnh thất bại',
    },
  },
  en: {
    hiddenAddress: 'detailed address hidden',
    kaelLockedPriceLabel: 'Kael-locked price',
    kaelLockedPriceWaiting: 'Kael price not locked yet',
    completionNotes: 'Completion notes',
    completionPhotosLabel: 'After-completion photos (1-5)',
    scopeDescription: 'New scope details',
    scopeReason: 'Reason for the change',
    scopeKaelPriceHint: 'Kael will compute the new price when the customer reviews the request.',
    scopePhotosLabel: 'Scope change photos (optional)',
    scopeSubmit: 'Request scope change',
    scopeWaiting: 'Waiting for the customer to decide on the scope change.',
    cancelReason: 'Cancellation reason',
    cancelPlaceholder: 'Reason for replacement search',
    cancelSubmit: 'Request cancellation',
    review: 'Review',
    send: 'Send',
    uploading: 'Uploading photos…',
    pickPhotos: 'Pick photos',
    progress: {
      worker_start_travel: 'Start travel',
      worker_mark_arrived: 'Mark arrived',
      worker_start_inspection: 'Start inspection',
      worker_start_repair: 'Start repair',
      worker_complete_job: 'Mark complete',
    },
    alerts: {
      completeTitle: 'Mark job complete?',
      completeBody: 'The customer will be asked to review and confirm. Payment remains locked at this stage.',
      completionPhotoRequiredTitle: 'Completion photo required',
      completionPhotoRequiredBody: 'Upload at least 1 photo after finishing so the customer can verify before confirming.',
      completionNotesShortTitle: 'Notes too short',
      completionNotesShortBody: 'Write at least 10 characters about what was done so the customer understands.',
      scopeDescriptionTitle: 'New scope details required',
      scopeDescriptionBody: 'Describe the added work so Kael can recompute the price for the customer.',
      scopeReasonTitle: 'Reason required',
      scopeReasonBody: 'Explain why the scope changed so the customer understands before deciding.',
      scopeConfirmTitle: 'Send scope change request?',
      scopeConfirmBody: 'Progress will stay locked until the customer approves or rejects it. Kael will recompute the price.',
      cancelReasonTitle: 'Cancellation reason required',
      cancelReasonBody: 'Enter a specific reason. The system will cancel this worker assignment and begin replacement search after you send.',
      cancelConfirmTitle: 'Send cancellation request?',
      cancelConfirmBody: 'After you send, this worker assignment will be cancelled and the system will automatically search for a replacement.',
      photoPermissionTitle: 'Photo permission required',
      photoPermissionBody: 'Allow photo library access to upload evidence.',
      uploadFailedTitle: 'Photo upload failed',
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
    glass: tokens.mode === 'dark' ? 'rgba(18,39,36,0.96)' : 'rgba(255,253,248,0.96)',
    glassBorder: tokens.borderStrong,
    glassHighlight: 'transparent',
    glassStrong: tokens.mode === 'dark' ? 'rgba(22,43,40,0.98)' : 'rgba(255,255,255,0.98)',
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
  const { selectors, state, workerProfile } = useFrontendWorkflow()
  const deal = getWorkerVisibleDeal(state.deal)
  const profileValue = localizedWorkerVerificationStatus(workerProfile?.verification_status ?? 'draft', language)

  return (
    <WorkerFrame active="home" eyebrow={copy.home.eyebrow} title={copy.home.title} testID="worker-home-surface">
      <WorkerMapStage />
      <WorkerReadinessPanel />
      <IncomingRequestSheet />

      <View style={styles.operationalBand} testID="worker-shift-console">
        <QuickPanel icon="clock" title={copy.home.nextTitle} value={deal ? localizedStatusLabel(selectors.currentStatus, language) : appCopy[language].common.noRequest} tone="cyan" />
        <QuickPanel icon="shield" title={copy.profile.title} value={profileValue} tone="mint" />
      </View>

      <TimelineCard />
    </WorkerFrame>
  )
}

export function WorkerJobsSurface() {
  const copy = useWorkerFrameCopy()
  const language = useAppLanguage()
  const { selectors, state } = useFrontendWorkflow()
  const [activeJobsTab, setActiveJobsTab] = useState<WorkerJobsTab>('waiting')
  const deal = getWorkerVisibleDeal(state.deal)
  const jobTitle = deal ? localizedServiceLabel(deal.draft.serviceType, language) : copy.jobs.emptyTitle
  const hiddenAddressLabel = workerActionCopy[language].hiddenAddress
  const visibleArea = deal?.broadcast?.generalArea ?? deal?.draft.districtLabel
  const jobAreaLabel = visibleArea ? localizedWorkerAreaLabel(visibleArea, language) : hiddenAddressLabel
  const fullJobAddressLabel = selectors.canWorkerSeeFullAddress && deal?.draft.addressLabel
    ? localizedWorkerAreaLabel(deal.draft.addressLabel, language)
    : null
  const jobVisibleAreaLabel = fullJobAddressLabel ?? jobAreaLabel
  const jobBody = deal
    ? `${localizedProblemLabel(deal.draft.problemChips[0], deal.draft.serviceType, language)} · ${jobVisibleAreaLabel}`
    : copy.jobs.emptyBody
  const showScopeChangeCard = Boolean(deal && selectors.currentStatus === 'scope_change_pending')
  const acceptedJob = isAcceptedLocalWorkerDeal(deal)
  const activeJobStatus = deal && acceptedJob ? localizedStatusLabel(selectors.currentStatus, language) : copy.jobs.emptyStatus
  const waitingStatus = deal?.broadcast && !acceptedJob ? localizedStatusLabel(selectors.currentStatus, language) : copy.jobs.emptyStatus
  const needsStatus = showScopeChangeCard ? copy.jobs.scopeStatus : appCopy[language].common.noData
  useEffect(() => {
    if (showScopeChangeCard) {
      setActiveJobsTab('needs')
    } else if (acceptedJob) {
      setActiveJobsTab('active')
    }
  }, [acceptedJob, showScopeChangeCard])

  return (
    <WorkerFrame active="jobs" eyebrow={copy.jobs.eyebrow} title={copy.jobs.title} testID="worker-jobs-surface">
      <SegmentFilter activeTab={activeJobsTab} labels={copy.jobs.filters} onTabChange={setActiveJobsTab} />
      <WorkerJobsTabOverview activeTab={activeJobsTab} onTabChange={setActiveJobsTab} />
      {activeJobsTab === 'waiting' ? (
        <>
          <IncomingRequestSheet compact />
          <JobActivityCard icon="clock" status={waitingStatus} title={deal?.broadcast && !acceptedJob ? jobTitle : copy.jobs.emptyTitle} body={deal?.broadcast && !acceptedJob ? jobBody : copy.jobs.emptyBody} tone="mint" />
        </>
      ) : null}
      {activeJobsTab === 'active' ? (
        <>
          <JobActivityCard icon="tools" status={activeJobStatus} title={acceptedJob ? jobTitle : copy.jobs.emptyTitle} body={acceptedJob ? jobBody : copy.jobs.emptyBody} tone="mint" />
          <WorkerJobsJobRoomEntry />
        </>
      ) : null}
      {activeJobsTab === 'needs' ? (
        <JobActivityCard icon="brief" status={needsStatus} title={showScopeChangeCard ? copy.jobs.scopeTitle : copy.jobs.emptyTitle} body={showScopeChangeCard ? copy.jobs.scopeBody : copy.jobs.emptyBody} testID="worker-scope-change-active" tone="warm" />
      ) : null}
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
  const language = useAppLanguage()
  const { selectors, state } = useFrontendWorkflow()
  const deal = getWorkerVisibleDeal(state.deal)
  const acceptedDeal = isAcceptedLocalWorkerDeal(deal) ? deal : null
  const completedLocal = Boolean(acceptedDeal && selectors.currentStatus === 'confirmed_by_customer')
  const completedValue = completedLocal ? localizedStatusLabel(selectors.currentStatus, language) : appCopy[language].common.noData
  const waitingValue = acceptedDeal && selectors.currentStatus !== 'confirmed_by_customer' ? localizedStatusLabel(selectors.currentStatus, language) : appCopy[language].common.noData

  return (
    <WorkerFrame active="earnings" eyebrow={copy.earnings.eyebrow} title={copy.earnings.title} testID="worker-earnings-surface">
      <WorkerEarningsHero />

      <View style={styles.operationalBand}>
        <QuickPanel icon="check" title={copy.earnings.complete} value={completedValue} tone="mint" />
        <QuickPanel icon="clock" title={copy.earnings.waiting} value={waitingValue} tone="cyan" />
      </View>

      <WorkerEarningsTrend />
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
  const language = useAppLanguage()
  const copy = workerCopy[language]
  const { reduceMotion, reduceTransparency } = useGlassAccessibility()
  const baseTokens = getWorkerThemeTokens(mode)
  const tokens = reduceTransparency ? getReducedTransparencyWorkerTokens(baseTokens) : baseTokens
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
          {reduceTransparency ? null : <AmbientBackdrop />}
          {reduceMotion || reduceTransparency ? null : <WorkerSectionMotionField active={active} frameWidth={frameWidth} screenWidth={width} />}
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              {
                paddingBottom: Math.max(insets.bottom + workerDockClearance, workerDockClearance),
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
            {children}
          </ScrollView>
          <WorkerDockOverlay active={active} />
        </View>
      </SafeAreaView>
    </WorkerUiContext.Provider>
  )
}

function WorkerReadinessPanel() {
  const { copy, language, tokens } = useWorkerUi()
  const { selectors, state, workerProfile } = useFrontendWorkflow()
  const deal = getWorkerVisibleDeal(state.deal)
  const isSuspended = Boolean(workerProfile?.is_suspended)
  const isAvailable = Boolean(workerProfile?.is_available && !isSuspended)
  const verificationLabel = localizedWorkerVerificationStatus(workerProfile?.verification_status ?? 'draft', language)
  const availabilityLabel = !workerProfile
    ? appCopy[language].common.noData
    : isSuspended
    ? language === 'en' ? 'Suspended' : 'Tạm khóa'
    : isAvailable
    ? language === 'en' ? 'Online' : 'Đang nhận việc'
    : language === 'en' ? 'Offline' : 'Tạm tắt nhận'
  const requestLabel = deal ? localizedStatusLabel(selectors.currentStatus, language) : appCopy[language].common.noRequest
  const body = !workerProfile
    ? copy.home.readinessNoProfile
    : isSuspended ? copy.home.readinessSuspended : isAvailable ? copy.home.readinessOnline : copy.home.readinessOffline

  return (
    <View style={[styles.readinessPanel, workerOpaqueCardSurface(tokens, 'raised')]} testID="worker-unified-readiness-panel">
      <View style={styles.rowBetween}>
        <View style={styles.titleStack}>
          <Text style={[styles.kicker, { color: tokens.primary }]} numberOfLines={1}>
            {copy.home.readinessTitle}
          </Text>
          <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={3}>
            {body}
          </Text>
        </View>
        <View style={[styles.readinessBadge, { backgroundColor: isAvailable ? tokens.mint : tokens.glassStrong, borderColor: tokens.border }]}>
          <Icon name={isSuspended ? 'shield' : isAvailable ? 'check' : 'clock'} active={isAvailable} />
        </View>
      </View>
      <View style={styles.readinessGrid}>
        <Metric label={copy.home.readinessVerification} value={verificationLabel} />
        <Metric label={copy.home.readinessAvailability} value={availabilityLabel} />
        <Metric label={copy.home.readinessRequest} value={requestLabel} />
      </View>
    </View>
  )
}

function WorkerJobsTabOverview({
  activeTab,
  onTabChange,
}: {
  activeTab: WorkerJobsTab
  onTabChange: (tab: WorkerJobsTab) => void
}) {
  const { copy, language, tokens } = useWorkerUi()
  const { selectors, state } = useFrontendWorkflow()
  const deal = getWorkerVisibleDeal(state.deal)
  const broadcast = deal?.broadcast ?? null
  const isAccepted = isAcceptedLocalWorkerDeal(deal)
  const needsAction = selectors.currentStatus === 'scope_change_pending'
  const labels = copy.jobs.filters
  const waitingLabel = labels[0] ?? (language === 'en' ? 'Pending' : 'Chờ nhận')
  const activeLabel = labels[1] ?? (language === 'en' ? 'Active' : 'Đang làm')
  const needsLabel = labels[2] ?? (language === 'en' ? 'Needs attention' : 'Cần xử lý')
  const rows = [
    {
      icon: 'clock' as WorkerIconName,
      title: waitingLabel,
      value: broadcast && !isAccepted ? localizedStatusLabel(selectors.currentStatus, language) : appCopy[language].common.noData,
    },
    {
      icon: 'tools' as WorkerIconName,
      title: activeLabel,
      value: isAccepted ? localizedStatusLabel(selectors.currentStatus, language) : appCopy[language].common.noData,
    },
    {
      icon: 'shield' as WorkerIconName,
      title: needsLabel,
      value: needsAction ? copy.jobs.scopeStatus : appCopy[language].common.noData,
    },
  ]

  return (
    <View style={styles.jobsTabOverview} testID="worker-jobs-tab-overview">
      {rows.map((row, index) => (
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === workerJobsTabKeys[index] }}
          key={row.title}
          onPress={() => onTabChange(workerJobsTabKeys[index] ?? 'waiting')}
          style={({ pressed }) => [
            styles.jobsTabCard,
            workerOpaqueCardSurface(tokens, activeTab === workerJobsTabKeys[index] ? 'mint' : 'base'),
            pressed ? styles.pressed : null,
          ]}
          testID={`worker-jobs-tab-${workerJobsTabKeys[index] ?? index}`}
        >
          <Icon name={row.icon} small />
          <Text style={[styles.metricLabel, { color: tokens.subtle }]} numberOfLines={1}>
            {row.title}
          </Text>
          <Text style={[styles.jobsTabValue, { color: tokens.ink }]} numberOfLines={2}>
            {row.value}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

function WorkerJobsJobRoomEntry() {
  const { copy, tokens } = useWorkerUi()
  const { replace } = useRouter()
  const { state } = useFrontendWorkflow()
  const deal = getWorkerVisibleDeal(state.deal)
  const canMessage = isAcceptedLocalWorkerDeal(deal)

  if (!deal?.broadcast) return null

  return (
    <View style={[styles.jobRoomEntry, workerOpaqueCardSurface(tokens, canMessage ? 'cyan' : 'warm')]} testID="worker-jobs-jobroom-entry">
      <View style={styles.identityRow}>
        <View style={[styles.readinessBadge, { backgroundColor: canMessage ? tokens.mint : tokens.glassStrong, borderColor: tokens.border }]}>
          <Icon name={canMessage ? 'check' : 'shield'} active={canMessage} />
        </View>
        <View style={styles.titleStack}>
          <Text style={[styles.kicker, { color: tokens.primary }]} numberOfLines={1}>
            {copy.chat.jobRoomTitle}
          </Text>
          <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={3}>
            {canMessage ? copy.chat.acceptedGate : copy.chat.privacyGate}
          </Text>
        </View>
      </View>
      <PressButton secondary label={copy.jobs.jobRoomCta} onPress={() => replace('/(worker)/chat')} testID="worker-jobs-open-jobroom" />
    </View>
  )
}

function WorkerChatContent() {
  const { copy, language, tokens } = useWorkerUi()
  const { selectors, state } = useFrontendWorkflow()
  const { session } = useAuth()
  const deal = getWorkerVisibleDeal(state.deal)
  const broadcast = deal?.broadcast ?? null
  const dealChatKey = workerChatDealKey(deal)
  const [draft, setDraft] = useState('')
  // Phase 2.1 (2026-05-23): real chat backed by jobService.listMessages /
  // sendMessage. Polling on focus + on send. Realtime upgrade deferred to
  // Phase 5.11. Source of truth lives in chat_messages table.
  const [remoteMessages, setRemoteMessages] = useState<JobMessageResponse[]>([])
  const [isSending, setIsSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const activeDealChatKeyRef = useRef(dealChatKey)
  const currentJobId = deal?.id ?? null
  const currentUserId = session?.user.id ?? null
  const renderedMessages = remoteMessages.map((message) => mapWorkerJobMessage(message, currentUserId, copy.chat))
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
    setRemoteMessages([])
    setDraft('')
    setSendError(null)
    activeDealChatKeyRef.current = dealChatKey
  }, [dealChatKey])

  useEffect(() => {
    if (!currentJobId || !canSendWorkerKaelMessage) return
    let cancelled = false
    const fetchMessages = async () => {
      const result = await jobService.listMessages(currentJobId)
      if (cancelled) return
      if (result.success) {
        setRemoteMessages(result.data.messages)
      }
    }
    void fetchMessages()
    const interval = setInterval(fetchMessages, 8000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [currentJobId, canSendWorkerKaelMessage])

  const submitWorkerChatMessage = async () => {
    if (!canSendWorkerKaelMessage || !currentJobId) return
    const value = draft.trim()
    if (!value) return
    setIsSending(true)
    setSendError(null)
    try {
      const result = await jobService.sendMessage(currentJobId, { content: value })
      if (!result.success) {
        setSendError(copy.chat.sendErrorFallback ?? result.error)
        return
      }
      setRemoteMessages((previous) => [...previous, result.data.message])
      setDraft('')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <View style={[styles.chatShell, workerOpaqueCardSurface(tokens, 'depth')]} testID="worker-chat-kael-relay">
      <View style={styles.hiddenMarker} testID="worker-kael-client-chatbox-parity" />
      <View style={[styles.kaelClientStage, workerOpaqueCardSurface(tokens, 'cyan'), !hasAnyWorkerKaelMessage ? styles.kaelClientStageEmpty : null]} testID="worker-kael-conversation-feed">
        <View style={styles.hiddenMarker} testID="worker-kael-empty-chat-state" />
        {!broadcast ? (
          <View style={styles.kaelBlankCanvas} testID="worker-kael-empty-chat-canvas">
            <View style={[styles.kaelCanvasWashLarge, { backgroundColor: tokens.aqua }]} />
            <View style={[styles.kaelCanvasWashWarm, { backgroundColor: tokens.copper }]} />
            <View style={styles.jobRoomWaiting} testID="worker-jobroom-waiting-room">
              <Image accessible={false} contentFit="contain" source={kaelHead} style={styles.jobRoomKaelHead} />
              <Text style={[styles.kicker, { color: tokens.primary }]} numberOfLines={1}>
                {copy.chat.jobRoomTitle}
              </Text>
              <Text style={[styles.cardTitle, { color: tokens.ink }]} numberOfLines={2}>
                {copy.chat.waitingTitle}
              </Text>
              <Text style={[styles.bodyText, { color: tokens.muted, textAlign: 'center' }]} numberOfLines={4}>
                {copy.chat.waitingBody}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.jobRoomStack} testID="hasAnyWorkerKaelMessage">
            <View style={[styles.jobRoomHeader, workerOpaqueCardSurface(tokens, 'raised')]} testID="worker-jobroom-kael-handoff">
              <View style={styles.identityRow}>
                <Image accessible={false} contentFit="contain" source={kaelHead} style={styles.kaelHead} />
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
            <View style={styles.jobRoomMetaGrid}>
              {jobRoomMeta.map((item) => (
                <JobRoomMetaCell key={item.label} label={item.label} value={item.value} />
              ))}
            </View>
            <View style={[styles.jobRoomBrief, workerOpaqueCardSurface(tokens, 'mint')]} testID="worker-jobroom-live-brief">
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
          <View accessible={false} pointerEvents="none" style={[styles.composerTool, { borderColor: tokens.border }]}>
            <Text style={[styles.composerToolText, { color: tokens.primary }]} numberOfLines={1}>
              +
            </Text>
          </View>
          <TextInput
            accessibilityLabel={chatInputPlaceholder}
            editable={canSendWorkerKaelMessage && !isSending}
            onChangeText={setDraft}
            onSubmitEditing={() => void submitWorkerChatMessage()}
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
            accessibilityState={{ disabled: !draft.trim() || !canSendWorkerKaelMessage || isSending }}
            disabled={!draft.trim() || !canSendWorkerKaelMessage || isSending}
            onPress={() => void submitWorkerChatMessage()}
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
        {sendError ? (
          <Text style={[styles.bodyText, { color: tokens.copper }]} numberOfLines={2} testID="worker-chat-send-error">
            {sendError}
          </Text>
        ) : null}
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
  const { copy, language, tokens } = useWorkerUi()
  const { selectors, state } = useFrontendWorkflow()
  const deal = getWorkerVisibleDeal(state.deal)
  const acceptedDeal = isAcceptedLocalWorkerDeal(deal) ? deal : null
  const moneyLabel = acceptedDeal ? localizedStatusLabel(selectors.currentStatus, language) : copy.earnings.noReconciliation
  const body = copy.earnings.body

  return (
    <View style={[styles.earningsHero, glassSurface(tokens, 'cream')]} testID="worker-earnings-summary">
      <View style={styles.rowBetween}>
        <View style={styles.titleStack}>
          <Text style={[styles.kicker, { color: tokens.primary }]}>{copy.earnings.today}</Text>
          <Text adjustsFontSizeToFit minimumFontScale={0.74} numberOfLines={2} style={[styles.moneyText, !acceptedDeal ? styles.moneyTextState : null, { color: tokens.ink }]}>{moneyLabel}</Text>
        </View>
        <View style={[styles.earningsBadge, { backgroundColor: tokens.glassStrong }]}>
          <Icon name="money" active />
        </View>
      </View>
      {body ? <Text style={[styles.bodyText, { color: tokens.muted }]}>{body}</Text> : null}
      <View style={styles.hiddenMarker} testID={WORKER_NO_FAKE_PAYMENT_DATA} />
    </View>
  )
}

function WorkerEarningsLedger() {
  const { copy, language, tokens } = useWorkerUi()
  const { selectors, state } = useFrontendWorkflow()
  const deal = getWorkerVisibleDeal(state.deal)
  const acceptedDeal = isAcceptedLocalWorkerDeal(deal) ? deal : null
  const rows = acceptedDeal
    ? [
        [appCopy[language].common.serviceRequest, localizedStatusLabel(selectors.currentStatus, language)],
        [language === 'en' ? 'Payout account' : 'Tài khoản nhận tiền', appCopy[language].common.noData],
        [language === 'en' ? 'Payment & review' : 'Thanh toán & đánh giá', appCopy[language].common.noData],
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
  const title = language === 'en' ? 'Recent days' : '7 ngày gần nhất'
  const empty = appCopy[language].common.noData
  const days = language === 'en' ? ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'] : ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

  return (
    <View style={[styles.earningsTrendCard, workerOpaqueCardSurface(tokens, 'mint')]} testID="worker-earnings-seven-day-chart">
      <View style={styles.rowBetween}>
        <Text style={[styles.statusPill, { backgroundColor: tokens.mint, color: tokens.primary }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.metricLabel, { color: tokens.subtle }]} numberOfLines={1}>
          {empty}
        </Text>
      </View>
      <View style={[styles.earningsChartShell, workerOpaqueCardSurface(tokens, 'raised')]}>
        <View style={styles.earningsChartEmptyState} testID="worker-earnings-chart-empty-state">
          <View style={[styles.earningsChartBaseline, { backgroundColor: tokens.border }]} />
          <Icon name="money" small />
          <Text style={[styles.metricLabel, { color: tokens.muted }]} numberOfLines={1}>
            {empty}
          </Text>
        </View>
        <View style={styles.earningsDayRail}>
          {days.map((day) => (
            <Text key={day} style={[styles.metricLabel, { color: tokens.muted }]} numberOfLines={1}>
              {day}
            </Text>
          ))}
        </View>
      </View>
    </View>
  )
}

function WorkerProfileContent() {
  const { copy, language, tokens } = useWorkerUi()
  const { replace } = useRouter()
  const { role } = useAuth()
  const { state, workerProfile } = useFrontendWorkflow()
  const deal = getWorkerVisibleDeal(state.deal)
  const acceptedDeal = isAcceptedLocalWorkerDeal(deal) ? deal : null
  const adminAuditSwitchLabel = language === 'en' ? 'Back to login' : 'Về đăng nhập'
  const workingAreaLabel = deal ? localizedWorkerAreaLabel(deal.draft.districtLabel, language) : appCopy[language].common.noData
  const profileRows = deal
    ? [
        [language === 'en' ? 'Identity verification' : 'Xác minh danh tính', appCopy[language].common.pendingSystem],
        [language === 'en' ? 'Service skills' : 'Kỹ năng dịch vụ', localizedServiceLabel(deal.draft.serviceType, language)],
        [language === 'en' ? 'Working area' : 'Khu vực làm việc', workingAreaLabel],
      ]
    : copy.profile.rows
  const profileSkills = deal
    ? [localizedServiceLabel(deal.draft.serviceType, language), workingAreaLabel, appCopy[language].common.pendingSystem, language === 'en' ? 'Feedback pending' : 'Chờ phản hồi']
    : copy.profile.skills
  const profileStatusValue = localizedWorkerVerificationStatus(workerProfile?.verification_status ?? 'draft', language)
  const canSubmitVerification = role === 'worker' &&
    !workerProfile?.is_suspended &&
    !['approved', 'suspended'].includes(workerProfile?.verification_status ?? 'draft')

  return (
    <>
      <View style={[styles.profileHead, glassSurface(tokens, 'raised')]} testID="worker-profile-verification-card">
        <SubtleGlassHighlight />
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
          <PressButton label={adminAuditSwitchLabel} onPress={() => replace('/(auth)/login')} testID="worker-admin-audit-switch" />
        </View>
      ) : null}
      {canSubmitVerification ? <WorkerVerificationForm /> : null}

      <View style={[styles.greenScoreCard, glassSurface(tokens, 'mint')]}>
        <Text style={[styles.kicker, { color: tokens.primary }]}>{copy.profile.scoreTitle}</Text>
        <Text adjustsFontSizeToFit minimumFontScale={0.72} style={[styles.scoreNumber, { color: tokens.ink }]} numberOfLines={1}>{profileStatusValue}</Text>
        {copy.profile.scoreBody ? <Text style={[styles.bodyText, { color: tokens.muted }]}>{copy.profile.scoreBody}</Text> : null}
      </View>

      <View style={styles.skillWrap}>
        {profileSkills.map((item) => (
          <View key={item} style={[styles.skillPill, { backgroundColor: tokens.glassStrong, borderColor: tokens.border }]}>
            <Text style={[styles.skillText, { color: tokens.primary }]}>{item}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.preferenceCard, workerOpaqueCardSurface(tokens)]} testID="worker-profile-preference-toggles">
        <ThemeToggle />
        <LanguageToggle />
      </View>

      <View style={[styles.listCard, workerOpaqueCardSurface(tokens)]} testID="worker-profile-list-groups">
        {profileRows.map((row, index) => (
          <ListRow key={row[0]} icon={index === 0 ? 'shield' : index === 1 ? 'tools' : index === 2 ? 'map' : index === 3 ? 'moon' : 'globe'} title={row[0]} meta={row[1]} />
        ))}
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

// Phase 2.0/2.2 (2026-05-23): photo grid cho worker scope change + completion.
// Worker thay vì nhập price ở B7/B6 nay submit notes + photos để Kael compute
// + customer trust.
function WorkerPhotoGrid({
  label,
  onPick,
  onRemove,
  photos,
  testID,
  tokens,
}: {
  label: string
  onPick: () => void
  onRemove: (index: number) => void
  photos: LocalMediaUploadDraft[]
  testID: string
  tokens: WorkerThemeTokens
}) {
  const { language } = useWorkerUi()
  const actionCopy = workerActionCopy[language]
  return (
    <View style={styles.workerPhotoGrid} testID={testID}>
      <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.workerPhotoRow}>
        {photos.map((photo, index) => (
          <View key={`${photo.uri}-${index}`} style={[styles.workerPhotoTile, { borderColor: tokens.border }]}>
            <Image accessibilityLabel={photo.fileName ?? `photo-${index}`} contentFit="cover" source={{ uri: photo.uri }} style={styles.workerPhotoImage} />
            <Pressable
              accessibilityLabel={`remove-photo-${index}`}
              accessibilityRole="button"
              onPress={() => onRemove(index)}
              style={styles.workerPhotoRemove}
              testID={`${testID}-remove-${index}`}
            >
              <Text style={styles.workerPhotoRemoveText}>×</Text>
            </Pressable>
          </View>
        ))}
        {photos.length < 5 ? (
          <Pressable
            accessibilityLabel={actionCopy.pickPhotos}
            accessibilityRole="button"
            onPress={onPick}
            style={[styles.workerPhotoAddTile, { borderColor: tokens.border, backgroundColor: tokens.glassStrong }]}
            testID={`${testID}-add`}
          >
            <Text style={[styles.workerPhotoAddText, { color: tokens.primary }]} numberOfLines={2}>
              + {actionCopy.pickPhotos}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

function formatWorkerVnd(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(value) + ' đ'
}

function WorkerMapStage() {
  const { copy, language, tokens } = useWorkerUi()
  const { actions, selectors, state, workerProfile } = useFrontendWorkflow()
  const deal = getWorkerVisibleDeal(state.deal)
  const acceptedDeal = isAcceptedLocalWorkerDeal(deal) ? deal : null
  const broadcast = deal?.broadcast
  const mapArea = broadcast?.generalArea ?? deal?.draft.districtLabel
  const mapSearch = mapArea ? localizedWorkerAreaLabel(mapArea, language) : copy.home.mapSearch
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
    : workerProfile?.is_available
      ? language === 'en' ? 'Online' : 'Đang nhận việc'
      : workerProfile?.is_suspended
        ? language === 'en' ? 'Account suspended' : 'Tài khoản đang khóa'
        : workerProfile?.is_approved
          ? language === 'en' ? 'Offline' : 'Tạm tắt nhận'
          : copy.home.online

  return (
    <View style={[styles.mapStage, workerOpaqueCardSurface(tokens, 'depth')]} testID="worker-flexible-map-shell">
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
        <StatusBeacon />
      </View>

      <View style={styles.mapCardsRow}>
        <WorkerMapFeatureCard icon="bolt" title={copy.home.electricianCard} tone="mint" testID="worker-shell-service-electrical" />
        <WorkerMapFeatureCard icon="water" title={copy.home.plumberCard} tone="cream" testID="worker-shell-service-plumbing" />
        <WorkerMapFeatureCard icon="spark" title={copy.home.cleaningCard} tone="cyan" testID="worker-shell-service-cleaning" />
      </View>

      {copy.home.serviceHeading ? (
        <View style={styles.mapServiceHeader}>
          <Text style={[styles.sectionTitle, { color: tokens.ink }]}>{copy.home.serviceHeading}</Text>
        </View>
      ) : null}

      <Pressable
        accessibilityLabel={nextAvailability ? copy.frame.availabilityOn : copy.frame.availabilityOff}
        accessibilityRole="switch"
        accessibilityState={{ checked: Boolean(workerProfile?.is_available), disabled: !canToggleAvailability }}
        disabled={!canToggleAvailability}
        onPress={() => void actions.workerUpdateAvailability(nextAvailability)}
        style={({ pressed }) => [
          styles.shiftCard,
          glassSurface(tokens, 'raised'),
          !canToggleAvailability ? styles.disabledButton : null,
          pressed ? styles.pressed : null,
        ]}
        testID="worker-availability-toggle"
      >
        <SubtleGlassHighlight />
        <View style={styles.rowBetween}>
          <View style={styles.titleStack}>
            <Text style={[styles.kicker, { color: tokens.primary }]}>{copy.home.status}</Text>
            <Text style={[styles.heroTitle, { color: tokens.ink }]}>{statusTitle}</Text>
          </View>
          <View style={[styles.toggleTrack, { backgroundColor: workerProfile?.is_available ? tokens.primary : tokens.borderStrong }]}>
            <View style={[styles.toggleKnob, { backgroundColor: tokens.raised }]} />
          </View>
        </View>
      </Pressable>
    </View>
  )
}

function WorkerMapFeatureCard({ icon, testID, title, tone }: { icon: WorkerIconName; testID?: string; title: string; tone: WorkerTone }) {
  const { tokens } = useWorkerUi()

  return (
    <View style={[styles.mapFeatureCard, workerOpaqueCardSurface(tokens, tone)]} testID={testID}>
      <Text style={[styles.mapFeatureTitle, { color: tokens.ink }]} numberOfLines={2}>{title}</Text>
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

function IncomingRequestSheet({ compact = false }: { compact?: boolean }) {
  const { copy, language, tokens } = useWorkerUi()
  const { actions, selectors, state } = useFrontendWorkflow()
  const actionCopy = workerActionCopy[language]
  // Phase 2.0 (2026-05-23): worker không nhập price. Kael giữ final-price
  // authority. Worker chỉ submit notes (B7) hoặc description + reason (B6) +
  // ảnh hỗ trợ Kael compute.
  const [completionNotesDraft, setCompletionNotesDraft] = useState('')
  const [completionPhotos, setCompletionPhotos] = useState<LocalMediaUploadDraft[]>([])
  const [isUploadingCompletion, setIsUploadingCompletion] = useState(false)
  const [cancellationReasonDraft, setCancellationReasonDraft] = useState('')
  const [scopeDescriptionDraft, setScopeDescriptionDraft] = useState('')
  const [scopeReasonDraft, setScopeReasonDraft] = useState('')
  const [scopePhotos, setScopePhotos] = useState<LocalMediaUploadDraft[]>([])
  const [isUploadingScope, setIsUploadingScope] = useState(false)
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
  const secondsRemainingLabel = broadcast?.secondsRemaining === null || broadcast?.secondsRemaining === undefined ? null : `${broadcast.secondsRemaining}s`
  const kaelLockedPrice = deal?.finalPrice ?? null
  const pickCompletionPhotos = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert(actionCopy.alerts.photoPermissionTitle, actionCopy.alerts.photoPermissionBody)
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      selectionLimit: 5,
    })
    if (result.canceled) return
    const drafts: LocalMediaUploadDraft[] = result.assets.map((asset) => ({
      uri: asset.uri,
      type: 'image',
      fileName: asset.fileName ?? asset.uri.split('/').pop(),
      mimeType: asset.mimeType ?? undefined,
      fileSizeBytes: asset.fileSize ?? undefined,
    }))
    setCompletionPhotos((previous) => [...previous, ...drafts].slice(0, 5))
  }
  const pickScopePhotos = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert(actionCopy.alerts.photoPermissionTitle, actionCopy.alerts.photoPermissionBody)
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      selectionLimit: 5,
    })
    if (result.canceled) return
    const drafts: LocalMediaUploadDraft[] = result.assets.map((asset) => ({
      uri: asset.uri,
      type: 'image',
      fileName: asset.fileName ?? asset.uri.split('/').pop(),
      mimeType: asset.mimeType ?? undefined,
      fileSizeBytes: asset.fileSize ?? undefined,
    }))
    setScopePhotos((previous) => [...previous, ...drafts].slice(0, 5))
  }
  const removeCompletionPhoto = (index: number) => {
    setCompletionPhotos((previous) => previous.filter((_, current) => current !== index))
  }
  const removeScopePhoto = (index: number) => {
    setScopePhotos((previous) => previous.filter((_, current) => current !== index))
  }
  const confirmWorkerProgressAction = (action: { label: string; type: WorkerProgressAction }) => {
    const nextStatus = workerStatusForAction(action.type)
    if (!nextStatus) return
    if (action.type !== 'worker_complete_job') {
      void actions.workerUpdateStatus(nextStatus)
      return
    }

    // Phase 2.0/2.2: worker submits notes + photos. Final price = Kael-locked
    // (set at A7 confirm or A11 approve). Worker không nhập final_price.
    if (completionPhotos.length < 1) {
      Alert.alert(actionCopy.alerts.completionPhotoRequiredTitle, actionCopy.alerts.completionPhotoRequiredBody)
      return
    }
    const notes = completionNotesDraft.trim()
    if (notes.length < 10) {
      Alert.alert(actionCopy.alerts.completionNotesShortTitle, actionCopy.alerts.completionNotesShortBody)
      return
    }
    const jobId = deal?.id ?? null
    if (!jobId) return

    Alert.alert(
      actionCopy.alerts.completeTitle,
      actionCopy.alerts.completeBody,
      [
        { text: actionCopy.review, style: 'cancel' },
        {
          text: action.label,
          onPress: async () => {
            setIsUploadingCompletion(true)
            try {
              const upload = await uploadJobMediaDrafts(jobId, completionPhotos, 'after')
              if (!upload.success) {
                Alert.alert(actionCopy.alerts.uploadFailedTitle, upload.error)
                return
              }
              await actions.workerUpdateStatus(nextStatus, {
                completion_photo_urls: upload.mediaRefs,
                completion_notes: notes,
              })
            } finally {
              setIsUploadingCompletion(false)
            }
          },
        },
      ],
    )
  }
  const submitScopeChangeRequest = () => {
    const description = scopeDescriptionDraft.trim()
    const reason = scopeReasonDraft.trim()
    if (description.length < 10) {
      Alert.alert(actionCopy.alerts.scopeDescriptionTitle, actionCopy.alerts.scopeDescriptionBody)
      return
    }
    if (reason.length < 10) {
      Alert.alert(actionCopy.alerts.scopeReasonTitle, actionCopy.alerts.scopeReasonBody)
      return
    }
    const jobId = deal?.id ?? null
    if (!jobId) return

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
                const upload = await uploadJobMediaDrafts(jobId, scopePhotos, 'after')
                if (!upload.success) {
                  Alert.alert(actionCopy.alerts.uploadFailedTitle, upload.error)
                  return
                }
                photoUrls = upload.mediaRefs
              }
              // Phase 2.0: worker không gửi price; Kael compute sau khi insert.
              await actions.requestScopeChange({
                new_description: description,
                reason,
                photo_urls: photoUrls,
              })
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
            setCancellationReasonDraft('')
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
  const addressLabel = selectors.canWorkerSeeFullAddress
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
      <View style={styles.areaRow} testID={selectors.canWorkerSeeFullAddress ? 'worker-full-address-after-accept' : 'worker-general-area-before-accept'}>
        <Icon name="map" small />
        <Text numberOfLines={2} style={[styles.areaText, { color: tokens.muted }]}>{addressLabel}</Text>
      </View>

      <View style={[styles.kaelBrief, workerOpaqueCardSurface(tokens, 'cyan')]} testID="worker-kael-brief">
        <View style={styles.identityRow}>
          <Image accessible={false} source={kaelHead} style={[styles.kaelMini, { borderColor: tokens.borderStrong }]} />
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
            multiline
            numberOfLines={3}
            onChangeText={setScopeDescriptionDraft}
            placeholder={actionCopy.scopeDescription}
            placeholderTextColor={tokens.subtle}
            style={[styles.chatInput, styles.scopeMultilineInput, { borderColor: tokens.border, color: tokens.ink }]}
            value={scopeDescriptionDraft}
          />
          <TextInput
            accessibilityLabel={actionCopy.scopeReason}
            multiline
            numberOfLines={2}
            onChangeText={setScopeReasonDraft}
            placeholder={actionCopy.scopeReason}
            placeholderTextColor={tokens.subtle}
            style={[styles.chatInput, styles.scopeMultilineInput, { borderColor: tokens.border, color: tokens.ink }]}
            value={scopeReasonDraft}
          />
          <Text style={[styles.bodyText, { color: tokens.muted }]} testID="worker-scope-kael-locked-price-hint">
            {actionCopy.scopeKaelPriceHint}
          </Text>
          <WorkerPhotoGrid
            label={actionCopy.scopePhotosLabel}
            onPick={pickScopePhotos}
            onRemove={removeScopePhoto}
            photos={scopePhotos}
            testID="worker-scope-photo-grid"
            tokens={tokens}
          />
          <PressButton label={isUploadingScope ? actionCopy.uploading : actionCopy.scopeSubmit} onPress={submitScopeChangeRequest} secondary testID="worker-scope-change-submit" />
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
            onChangeText={setCancellationReasonDraft}
            placeholder={actionCopy.cancelPlaceholder}
            placeholderTextColor={tokens.subtle}
            style={[styles.chatInput, { borderColor: tokens.border, color: tokens.ink }]}
            value={cancellationReasonDraft}
          />
          <PressButton label={actionCopy.cancelSubmit} onPress={submitCancellationRequest} secondary testID="worker-cancellation-submit" />
        </View>
      ) : null}
      {nextAction?.type === 'worker_complete_job' ? (
        <View style={styles.completionBox} testID="worker-completion-form">
          <View style={[styles.kaelLockedPriceBadge, { backgroundColor: tokens.mint, borderColor: tokens.borderStrong }]}>
            <Text style={[styles.kaelLockedPriceLabel, { color: tokens.primary }]} numberOfLines={1}>
              {actionCopy.kaelLockedPriceLabel}
            </Text>
            <Text style={[styles.kaelLockedPriceValue, { color: tokens.ink }]} numberOfLines={1} testID="worker-completion-kael-price">
              {kaelLockedPrice != null ? formatWorkerVnd(kaelLockedPrice) : actionCopy.kaelLockedPriceWaiting}
            </Text>
          </View>
          <TextInput
            accessibilityLabel={actionCopy.completionNotes}
            multiline
            numberOfLines={3}
            onChangeText={setCompletionNotesDraft}
            placeholder={actionCopy.completionNotes}
            placeholderTextColor={tokens.subtle}
            style={[styles.chatInput, styles.scopeMultilineInput, { borderColor: tokens.border, color: tokens.ink }]}
            testID="worker-completion-notes-input"
            value={completionNotesDraft}
          />
          <WorkerPhotoGrid
            label={actionCopy.completionPhotosLabel}
            onPick={pickCompletionPhotos}
            onRemove={removeCompletionPhoto}
            photos={completionPhotos}
            testID="worker-completion-photo-grid"
            tokens={tokens}
          />
          {isUploadingCompletion ? (
            <Text style={[styles.bodyText, { color: tokens.muted }]} testID="worker-completion-uploading">
              {actionCopy.uploading}
            </Text>
          ) : null}
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
  const { reduceTransparency } = useGlassAccessibility()
  const { copy, tokens } = useWorkerUi()
  const dockWidth = Math.min(Math.max(width - 34, 0), 392)
  const bottom = Math.max(insets.bottom + workerDockBottomMargin, workerDockBottomMargin)
  type WorkerDockItem = FloatingGlassTabItem<WorkerActiveTab> & {
    icon: WorkerIconName
    path: '/(worker)/home' | '/(worker)/jobs' | '/(worker)/chat' | '/(worker)/earnings' | '/(worker)/profile'
  }
  const items: WorkerDockItem[] = [
    { key: 'home', icon: 'home', label: copy.nav.home, path: '/(worker)/home', testID: 'worker-dock-home' },
    { key: 'jobs', icon: 'jobs', label: copy.nav.jobs, path: '/(worker)/jobs', testID: 'worker-dock-jobs' },
    { key: 'chat', icon: 'chat', label: copy.nav.chat, path: '/(worker)/chat', testID: 'worker-dock-chat' },
    { key: 'earnings', icon: 'money', label: copy.nav.earnings, path: '/(worker)/earnings', testID: 'worker-dock-earnings' },
    { key: 'profile', icon: 'person', label: copy.nav.profile, path: '/(worker)/profile', testID: 'worker-dock-profile' },
  ]

  return (
    <View pointerEvents="box-none" style={[styles.dockWrap, { bottom, width: dockWidth }]}>
      {reduceTransparency ? null : (
        <>
          <View pointerEvents="none" style={[styles.dockGlassAura, { backgroundColor: tokens.aqua, opacity: 0.16 }]} testID="worker-dock-glass-aura" />
          <View pointerEvents="none" style={[styles.dockWarmAura, { backgroundColor: tokens.copper }]} />
        </>
      )}
      <FloatingGlassTabBar<WorkerActiveTab, WorkerDockItem>
        activeKey={active}
        items={items}
        mode={tokens.mode}
        onItemPress={(item) => {
          if (item.key === active) return
          replace(item.path)
        }}
        iconForItem={(item, focused) =>
          item.key === 'chat' ? (
            <Image accessible={false} contentFit="contain" source={kaelHead} style={styles.dockKaelImage} testID="worker-dock-kael-brief-mascot" />
          ) : (
            <Icon name={item.icon} active={focused} />
          )
        }
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

  const ribbonStyle = {
    opacity: 0.16,
    transform: [{ rotate: '10deg' }],
  }
  const washStyle = {
    opacity: 0.13,
    transform: [{ rotate: '-8deg' }],
  }
  const causticStyle = {
    opacity: 0.1,
    transform: [{ scaleX: 0.96 }],
  }
  const glintStyle = {
    opacity: 0.1,
    transform: [{ rotate: '13deg' }],
  }

  return (
    <View
      pointerEvents="none"
      style={[styles.sectionMotionField, { left, width: frameWidth }]}
      testID={workerSectionMotionTestIDs[active]}
    >
      <View style={[styles.sectionMotionRibbon, { backgroundColor: tokens.glassHighlight, top: topBias }, ribbonStyle]} />
      <View style={[styles.sectionMotionWash, { backgroundColor: tokens.aqua, top: 28 + topBias }, washStyle]} />
      <View style={[styles.sectionMotionCaustic, { backgroundColor: tokens.mint }, causticStyle]} />
      <View style={[styles.sectionMotionGlint, { backgroundColor: tokens.glassHighlight }, glintStyle]} />
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

function StatusBeacon() {
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

  return (
    <View style={[styles.segmentShell, glassSurface(tokens, 'raised')]} testID="worker-activity-filter-pattern">
      <SubtleGlassHighlight />
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
              selected ? { backgroundColor: tokens.mint } : null,
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
    <View style={[styles.flowCard, workerOpaqueCardSurface(tokens, tone)]} testID={testID}>
      <View style={styles.rowBetween}>
        <Icon name={icon} />
        <Text style={[styles.statusPill, { backgroundColor: tokens.glassStrong, color: tokens.primary }]}>{status}</Text>
      </View>
      <Text adjustsFontSizeToFit minimumFontScale={0.8} numberOfLines={2} style={[styles.cardTitle, { color: tokens.ink }]}>{title}</Text>
      {body ? <Text numberOfLines={3} style={[styles.bodyText, { color: tokens.muted }]}>{body}</Text> : null}
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

// Phase 2.1 (2026-05-23): map remote JobMessageResponse → WorkerChatMessage.
// sender_role='kael' renders as system bubble; sender_id === currentUser is
// "mine" bubble; remaining customer/worker counterparts get the relay label.
function mapWorkerJobMessage(
  message: JobMessageResponse,
  currentUserId: string | null,
  chatCopy: { worker: string; kael: string; customer: string },
): WorkerChatMessage {
  if (message.sender_role === 'kael') {
    return { id: message.id, system: true, text: message.content, who: chatCopy.kael }
  }
  const isMine = currentUserId !== null && message.sender_id === currentUserId
  return {
    id: message.id,
    mine: isMine,
    text: message.content,
    who: isMine ? chatCopy.worker : chatCopy.customer,
  }
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
      style={[
        styles.pressButton,
        { backgroundColor: secondary ? tokens.mint : tokens.primary },
        disabled ? styles.disabledButton : null,
      ]}
      testID={testID}
      variant="control"
    >
      <Text adjustsFontSizeToFit minimumFontScale={0.84} numberOfLines={1} style={[styles.pressButtonText, { color: secondary ? tokens.primary : tokens.primaryText }]}>{label}</Text>
    </GlassPressable>
  )
}

function Icon({ active = false, name, small = false }: { active?: boolean; name: WorkerIconName; small?: boolean }) {
  const { tokens } = useWorkerUi()
  const color = active ? tokens.primary : tokens.muted
  const accent = active ? tokens.copper : tokens.aqua
  const size = small ? 18 : 25
  const stroke = small ? 1.8 : 2

  return (
    <Svg accessible={false} width={size} height={size} viewBox="0 0 25 25" fill="none" testID="worker-dock-icon-system-v3">
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
  const context = use(WorkerUiContext)
  if (!context) throw new Error('useWorkerUi must be used inside WorkerFrame')
  return context
}

function glassSurface(tokens: WorkerThemeTokens, tone: WorkerTone = 'base') {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
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
      ? 'rgba(23,59,53,0.96)'
      : 'rgba(225,248,242,0.96)'
    : system
      ? tokens.mode === 'dark'
        ? 'rgba(21,54,58,0.94)'
        : 'rgba(235,249,248,0.96)'
      : tokens.mode === 'dark'
        ? 'rgba(18,39,36,0.96)'
        : 'rgba(255,253,248,0.96)'

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
  return {
    backgroundColor: isWarm
      ? tokens.mode === 'dark'
        ? 'rgba(59,41,27,0.94)'
        : 'rgba(255,247,235,0.96)'
      : isMint
        ? tokens.mode === 'dark'
          ? 'rgba(23,59,53,0.94)'
          : 'rgba(232,249,244,0.96)'
        : isCyan
          ? tokens.mode === 'dark'
            ? 'rgba(21,54,58,0.94)'
            : 'rgba(235,249,248,0.96)'
          : tokens.mode === 'dark'
            ? 'rgba(18,39,36,0.96)'
            : 'rgba(255,253,248,0.96)',
    borderColor: tokens.border,
    borderWidth: 1,
    boxShadow: 'none',
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  canvas: { alignItems: 'center', flex: 1, overflow: 'hidden' },
  backdropWarm: { borderRadius: 30, bottom: 72, height: 148, left: -98, opacity: 0.12, position: 'absolute', transform: [{ rotate: '12deg' }], width: 210 },
  backdropMint: { borderRadius: 36, height: 226, opacity: 0.18, position: 'absolute', right: -126, top: 54, width: 294 },
  backdropCyan: { borderRadius: 30, height: 148, left: -96, opacity: 0.1, position: 'absolute', top: 200, transform: [{ rotate: '-10deg' }], width: 220 },
  sectionMotionField: { bottom: 0, overflow: 'hidden', position: 'absolute', top: 0, zIndex: 0 },
  sectionMotionRibbon: { borderRadius: 34, height: 760, left: 18, position: 'absolute', width: 62 },
  sectionMotionWash: { borderRadius: 34, height: 178, position: 'absolute', right: -92, width: 224 },
  sectionMotionCaustic: { borderRadius: 30, bottom: 84, height: 118, left: -104, position: 'absolute', width: 268 },
  sectionMotionGlint: { bottom: 52, height: 260, left: '50%', position: 'absolute', width: 34 },
  scrollContent: { gap: 14, paddingHorizontal: workerFrameHorizontalPadding, paddingTop: 8, zIndex: 2 },
  kicker: { fontSize: 12, fontWeight: '600', letterSpacing: 0 },
  screenTitle: { fontSize: 27, fontWeight: '600', letterSpacing: 0, lineHeight: 32 },
  glassTopHighlight: { height: 1, left: 16, opacity: 0.82, position: 'absolute', right: 16, top: 0, zIndex: 0 },
  glassSheen: { height: '170%', left: -72, opacity: 0.42, position: 'absolute', top: -46, transform: [{ rotate: '11deg' }], width: 58, zIndex: 0 },
  glassMotionRibbon: { borderRadius: 999, height: 168, left: 16, position: 'absolute', top: -168, width: 58, zIndex: 0 },
  glassMotionRibbonCompact: { height: 118, left: 8, top: -118, width: 38 },
  glassMotionCore: { borderRadius: 999, height: 118, left: 56, position: 'absolute', top: -118, width: 13, zIndex: 0 },
  glassMotionCoreCompact: { height: 86, left: 36, top: -86, width: 9 },
  mapStage: { borderRadius: 34, gap: 10, marginBottom: 42, minHeight: 448, overflow: 'hidden', padding: 12, position: 'relative' },
  searchPill: { alignItems: 'center', borderRadius: 24, flexDirection: 'row', gap: 8, left: 13, minHeight: 46, paddingHorizontal: 14, position: 'absolute', right: 13, top: 13, zIndex: 4 },
  searchText: { flex: 1, fontSize: 15, fontWeight: '600' },
  mapViewport: { borderRadius: 30, minHeight: 318, overflow: 'hidden', position: 'relative' },
  mapFogTop: { height: 92, left: 0, opacity: 0.38, position: 'absolute', right: 0, top: 0 },
  mapFogBottom: { bottom: -6, height: 86, left: 0, opacity: 0.5, position: 'absolute', right: 0 },
  mapCyanVeil: { borderRadius: 999, height: 118, left: '50%', marginLeft: -59, opacity: 0.12, position: 'absolute', top: 120, width: 118 },
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
  beaconHalo: { borderRadius: 999, height: 74, opacity: 0.16, position: 'absolute', width: 74 },
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
  readinessPanel: { borderRadius: 28, gap: 12, overflow: 'hidden', padding: 15, position: 'relative' },
  readinessBadge: { alignItems: 'center', borderRadius: 18, borderWidth: 1, height: 46, justifyContent: 'center', width: 46 },
  readinessGrid: { flexDirection: 'row', gap: 8 },
  jobRoomEntry: { borderRadius: 24, borderWidth: 1, gap: 10, overflow: 'hidden', padding: 12 },
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
  scopeMultilineInput: { minHeight: 72, paddingTop: 10, paddingVertical: 10, textAlignVertical: 'top' },
  completionBox: { gap: 10 },
  kaelLockedPriceBadge: { alignItems: 'center', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 10, justifyContent: 'space-between', overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 10 },
  kaelLockedPriceLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0 },
  kaelLockedPriceValue: { fontSize: 15, fontVariant: ['tabular-nums'], fontWeight: '700' },
  workerPhotoGrid: { gap: 8 },
  workerPhotoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  workerPhotoTile: { borderRadius: 14, borderWidth: 1, height: 78, overflow: 'hidden', position: 'relative', width: 78 },
  workerPhotoImage: { height: '100%', width: '100%' },
  workerPhotoRemove: { alignItems: 'center', backgroundColor: 'rgba(15, 23, 42, 0.7)', borderRadius: 999, height: 22, justifyContent: 'center', position: 'absolute', right: 4, top: 4, width: 22 },
  workerPhotoRemoveText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  workerPhotoAddTile: { alignItems: 'center', borderRadius: 14, borderStyle: 'dashed', borderWidth: 1, height: 78, justifyContent: 'center', width: 78 },
  workerPhotoAddText: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  actionRow: { flexDirection: 'row', gap: 10 },
  adminSwitchWrap: { flexDirection: 'row' },
  pressButton: { alignItems: 'center', borderRadius: 18, flex: 1, justifyContent: 'center', minHeight: 46 },
  disabledButton: { opacity: 0.52 },
  pressButtonText: { fontSize: 15, fontWeight: '600' },
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
  segmentShell: { borderRadius: 999, flexDirection: 'row', gap: 6, overflow: 'hidden', padding: 6, position: 'relative' },
  segmentPill: { alignItems: 'center', borderRadius: 999, flex: 1, justifyContent: 'center', minHeight: 38, paddingHorizontal: 4 },
  segmentText: { fontSize: 13, fontWeight: '600' },
  jobsTabOverview: { flexDirection: 'row', gap: 8 },
  jobsTabCard: { alignItems: 'center', borderRadius: 22, borderWidth: 1, flex: 1, gap: 5, minHeight: 92, overflow: 'hidden', padding: 10 },
  jobsTabValue: { fontSize: 13, fontWeight: '600', lineHeight: 17, textAlign: 'center' },
  flowCard: { borderRadius: 28, gap: 10, overflow: 'hidden', padding: 16, position: 'relative' },
  statusPill: { borderRadius: 999, fontSize: 12, fontWeight: '600', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 6 },
  cardTitle: { fontSize: 17, fontWeight: '600', letterSpacing: 0, lineHeight: 23 },
  chatShell: { borderRadius: 32, gap: 12, minHeight: 430, overflow: 'hidden', padding: 12, position: 'relative' },
  kaelClientStage: { borderRadius: 25, borderWidth: 1, flex: 1, gap: 12, justifyContent: 'space-between', minHeight: 336, overflow: 'hidden', padding: 12, position: 'relative' },
  kaelClientStageEmpty: { opacity: 0.92 },
  kaelBlankCanvas: { flex: 1, minHeight: 240, overflow: 'hidden', position: 'relative' },
  kaelCanvasWashLarge: { borderRadius: 32, height: 168, left: -48, opacity: 0.07, position: 'absolute', top: 46, transform: [{ rotate: '-8deg' }], width: 168 },
  kaelCanvasWashWarm: { borderRadius: 28, bottom: 42, height: 126, opacity: 0.06, position: 'absolute', right: -34, transform: [{ rotate: '12deg' }], width: 126 },
  jobRoomWaiting: { alignItems: 'center', gap: 8, justifyContent: 'center', minHeight: 228, padding: 18, position: 'relative', zIndex: 2 },
  jobRoomKaelHead: { height: 70, width: 70 },
  jobRoomStack: { gap: 10 },
  jobRoomHeader: { borderRadius: 24, borderWidth: 1, gap: 10, overflow: 'hidden', padding: 13 },
  jobRoomMetaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  jobRoomMetaCell: { borderRadius: 18, borderWidth: 1, flexBasis: '47%', flexGrow: 1, gap: 4, minHeight: 66, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 9 },
  jobRoomMetaValue: { fontSize: 13, fontWeight: '600', letterSpacing: 0, lineHeight: 17 },
  jobRoomBrief: { borderRadius: 22, borderWidth: 1, gap: 8, overflow: 'hidden', padding: 12 },
  jobRoomGate: { alignItems: 'center', borderRadius: 22, borderWidth: 1, flexDirection: 'row', gap: 10, overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 11 },
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
  earningsBadge: { alignItems: 'center', borderRadius: 24, height: 58, justifyContent: 'center', transform: [{ rotate: '-5deg' }], width: 58 },
  earningsTrendCard: { borderRadius: 30, borderWidth: 1, gap: 12, overflow: 'hidden', padding: 14 },
  earningsChartShell: { borderRadius: 24, borderWidth: 1, gap: 12, justifyContent: 'space-between', minHeight: 132, padding: 14 },
  earningsChartEmptyState: { alignItems: 'center', flex: 1, gap: 8, justifyContent: 'center', minHeight: 76, overflow: 'hidden', position: 'relative' },
  earningsChartBaseline: { borderRadius: 999, height: 3, left: 0, opacity: 0.52, position: 'absolute', right: 0, top: '56%' },
  earningsDayRail: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  moneyText: { fontSize: 34, fontVariant: ['tabular-nums'], fontWeight: '600', letterSpacing: 0 },
  moneyTextState: { fontSize: 24, lineHeight: 30 },
  listCard: { borderRadius: 29, gap: 4, overflow: 'hidden', padding: 10, position: 'relative' },
  listRow: { alignItems: 'center', flexDirection: 'row', gap: 11, minHeight: 54, paddingHorizontal: 8 },
  listTitle: { flex: 1, fontSize: 14, fontWeight: '600' },
  listMeta: { fontSize: 12, fontWeight: '600', maxWidth: 120, textAlign: 'right' },
  profileHead: { alignItems: 'center', borderRadius: 30, flexDirection: 'row', gap: 13, overflow: 'hidden', padding: 16, position: 'relative' },
  avatarWrap: { alignItems: 'center', borderRadius: 999, height: 56, justifyContent: 'center', width: 56 },
  profileName: { fontSize: 17, fontWeight: '600', letterSpacing: 0 },
  profileBadge: { alignItems: 'center', borderRadius: 999, height: 42, justifyContent: 'center', width: 42 },
  greenScoreCard: { borderRadius: 30, gap: 8, overflow: 'hidden', padding: 17, position: 'relative' },
  scoreNumber: { fontSize: 28, fontWeight: '600', letterSpacing: 0, lineHeight: 34 },
  skillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  skillPill: { borderRadius: 999, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 13 },
  skillText: { fontSize: 13, fontWeight: '600' },
  preferenceCard: { borderRadius: 29, gap: 6, overflow: 'hidden', padding: 10, position: 'relative' },
  preferenceRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 54, paddingHorizontal: 8 },
  preferenceTitle: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 11 },
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
  dockGlassAura: { borderRadius: 999, bottom: -20, height: 84, left: 20, position: 'absolute', right: 20, zIndex: -1 },
  dockWarmAura: { borderRadius: 999, bottom: -10, height: 48, opacity: 0.12, position: 'absolute', right: -10, width: 100, zIndex: -1 },
  workerDock: { alignItems: 'center', borderRadius: 33, borderWidth: 1, flexDirection: 'row', gap: 5, height: workerDockHeight, justifyContent: 'space-around', overflow: 'hidden', padding: 7, position: 'relative' },
  dockLiquidPool: { borderRadius: 999, bottom: 4, height: 56, left: 0, opacity: 0.27, position: 'absolute', width: 96, zIndex: 0 },
  dockLiquidWake: { borderRadius: 999, bottom: 1, height: 62, left: 0, position: 'absolute', width: 106, zIndex: 0 },
  dockBottomReflection: { borderRadius: 999, bottom: 7, height: 17, left: 38, opacity: 0.18, position: 'absolute', right: 38, zIndex: 0 },
  dockMotionSheen: { bottom: -18, position: 'absolute', top: -18, width: 54, zIndex: 0 },
  dockActiveGlow: { borderRadius: 999, height: 52, position: 'absolute', width: 58 },
  dockItem: { alignItems: 'center', borderRadius: 27, flex: 1, height: 54, justifyContent: 'center', position: 'relative', zIndex: 2 },
  dockDot: { borderRadius: 999, bottom: 5, height: 3, position: 'absolute', width: 3 },
  dockKaelImage: { height: 34, width: 34 },
  motionSweep: { borderRadius: 999, height: 76, position: 'absolute', top: -18, width: 96 },
  pressed: { opacity: 0.78 },
  hiddenMarker: { height: 0, opacity: 0, width: 0 },
})
