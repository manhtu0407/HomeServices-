import { type ReactNode, useMemo, useState } from 'react'
import { useEffect, useRef } from 'react'
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg'
import { HCMC_DISTRICTS, LOCAL_WORKFLOW_PRICE_DISCLAIMER, normalizeDistrict, type LocalDeal, type ServiceType, toLocalDealStatus } from '@nestscout/shared'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { KaelButton, KaelTextField, MintAura } from '@/components/ui/kael-primitives'
import { motionDuration, motionTokens } from '@/components/ui/motion-tokens'
import { color, component, glass, radius, shadow, typography } from '@/design/theme'
import type { KaelChatProgress, KaelMemoryPayload, PlacesAutocompleteResponse, WorkerJobListResponse, WorkerKaelChatTurn } from '@/lib/api-types'
import { getMobileApiAuthHeaders, mobileApiUrl } from '@/lib/api'
import { setAppLanguage, type AppLanguage, localizedServiceLabel, localizedStatusLabel } from '@/lib/app-language'
import { useAuth } from '@/lib/auth-provider'
import { generateClientRequestId } from '@/lib/client-request-id'
import { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { uploadJobMediaDrafts, type LocalMediaUploadDraft } from '@/lib/media-upload'
import { kaelMemoryService, placesService, workerKaelChatService } from '@/lib/services'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated'

export {
  WorkerDockLayoutProvider,
  WorkerRebuildDockOverlay,
} from '@/components/rebuild/rebuild-surfaces'

export type WorkerDockActive = 'earnings' | 'home' | 'jobs' | 'kael' | 'profile'

type WorkerV5Section = 'earnings' | 'home' | 'jobs' | 'kael' | 'profile'
type WorkerV5Phase = 'accept' | 'approval' | 'assist' | 'close' | 'complete' | 'discover' | 'execute' | 'grow' | 'money' | 'prepare' | 'profile' | 'settle' | 'travel' | 'work'
type WorkerV5IconName =
  | 'calendar'
  | 'camera'
  | 'chat'
  | 'clock'
  | 'document'
  | 'earnings'
  | 'evidence'
  | 'home'
  | 'jobs'
  | 'map'
  | 'profile'
  | 'shield'
  | 'scope'
  | 'tools'
  | 'wallet'

type WorkerV5BankLogoName = 'acb' | 'bidv' | 'mbbank' | 'techcombank' | 'vietcombank' | 'vietinbank'
type WorkerV5PlaceSuggestion = PlacesAutocompleteResponse['suggestions'][number]
type WorkerV5MapLocation = {
  lat: number
  lng: number
  provider: 'vietmap' | 'google_maps'
}
type WorkerV5InboxTabId = 'matches' | 'new' | 'saved'
type WorkerV5MemoryPreferenceUiId =
  | 'area-preference'
  | 'income-preference'
  | 'travel-limit'
  | 'skill-preference'
  | 'opportunity-filter'
  | 'auto-accept-work'
type WorkerV5MemoryPreferenceApiKey =
  | 'area_preference'
  | 'income_preference'
  | 'travel_limit'
  | 'skill_preference'
  | 'opportunity_filter'
  | 'auto_accept_work'

const WORKER_V5_MEMORY_PREFERENCE_API_KEYS: Record<WorkerV5MemoryPreferenceUiId, WorkerV5MemoryPreferenceApiKey> = {
  'area-preference': 'area_preference',
  'income-preference': 'income_preference',
  'travel-limit': 'travel_limit',
  'skill-preference': 'skill_preference',
  'opportunity-filter': 'opportunity_filter',
  'auto-accept-work': 'auto_accept_work',
}

function workerV5RecordFromUnknown(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function workerV5MemoryPreferenceOverridesFromMemory(memory: KaelMemoryPayload | null): Partial<Record<WorkerV5MemoryPreferenceUiId, boolean>> {
  const safeMetadata = workerV5RecordFromUnknown(memory?.safe_metadata)
  const preferences = workerV5RecordFromUnknown(safeMetadata?.memory_preferences)
  const overrides: Partial<Record<WorkerV5MemoryPreferenceUiId, boolean>> = {}
  if (!preferences) return overrides
  for (const [uiId, apiKey] of Object.entries(WORKER_V5_MEMORY_PREFERENCE_API_KEYS) as Array<[WorkerV5MemoryPreferenceUiId, WorkerV5MemoryPreferenceApiKey]>) {
    if (typeof preferences[apiKey] === 'boolean') {
      overrides[uiId] = preferences[apiKey]
    }
  }
  return overrides
}

type WorkerV5ScreenId =
  | '1.1-worker-home'
  | '1.2-shift-brief'
  | '1.3-demand-map'
  | '1.4-smart-schedule'
  | '2.1-opportunity-inbox'
  | '2.2-offer-detail'
  | '2.3-accept-review'
  | '2.4-route-eta'
  | '2.5-arrival-checkin'
  | '2.7-in-progress'
  | '2.8-scope-change'
  | '2.9-approval-wait'
  | '2.10-completion-evidence'
  | '2.11-completion-submitted'
  | '2.12-case-closed'
  | '3.1-kael-chat-normal'
  | '3.2-kael-job-intake'
  | '4.1-earnings-overview'
  | '4.2-ledger-detail'
  | '4.3-payout-request'
  | '4.4-payout-method'
  | '5.1-profile-overview'
  | '5.2-worker-ranking'
  | '5.3-skills-service-area'
  | '5.4-reliability-insights'
  | '5.5-account-utilities'
  | '5.6-agent-memory-preferences'
  | '5.7-verification-documents'
  | '5.8-bank-tax-center'
  | '5.9-reviews-feedback'
  | '5.10-support-settings'

type WorkerV5ScreenDefinition = {
  authority: string
  guardrail: string
  icon: WorkerV5IconName
  id: WorkerV5ScreenId
  order: number
  phase: WorkerV5Phase
  primaryNext?: string
  section: WorkerV5Section
  title: Record<AppLanguage, string>
}

type WorkerV5RouteParams = {
  ns_audit_surface?: string | string[]
  ns_payment_step?: string | string[]
  ns_scope_mode?: string | string[]
  ns_worker_lang?: string | string[]
  ns_worker_screen?: string | string[]
  tab?: string | string[]
}

type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

const workerV5Icons: Record<WorkerV5IconName, ImageSourcePropType> = {
  calendar: require('@/assets/worker-image-icons/utility-calendar.png') as ImageSourcePropType,
  camera: require('@/assets/worker-image-icons/utility-camera.png') as ImageSourcePropType,
  chat: require('@/assets/worker-image-icons/utility-chat.png') as ImageSourcePropType,
  clock: require('@/assets/worker-image-icons/utility-clock.png') as ImageSourcePropType,
  document: require('@/assets/worker-image-icons/utility-document.png') as ImageSourcePropType,
  earnings: require('@/assets/worker-image-icons/nav-earnings.png') as ImageSourcePropType,
  evidence: require('@/assets/worker-image-icons/utility-evidence-core.png') as ImageSourcePropType,
  home: require('@/assets/worker-image-icons/nav-home.png') as ImageSourcePropType,
  jobs: require('@/assets/worker-image-icons/nav-jobs.png') as ImageSourcePropType,
  map: require('@/assets/worker-image-icons/utility-map.png') as ImageSourcePropType,
  profile: require('@/assets/worker-image-icons/nav-profile.png') as ImageSourcePropType,
  shield: require('@/assets/worker-image-icons/utility-shield.png') as ImageSourcePropType,
  scope: require('@/assets/worker-image-icons/utility-scope-core.png') as ImageSourcePropType,
  tools: require('@/assets/worker-image-icons/utility-tools.png') as ImageSourcePropType,
  wallet: require('@/assets/worker-image-icons/utility-wallet.png') as ImageSourcePropType,
}

const workerV5ServiceIcons: Record<ServiceType, ImageSourcePropType> = {
  cleaning: require('@/assets/worker-image-icons/service-cleaning.png') as ImageSourcePropType,
  electrical: require('@/assets/worker-image-icons/service-electrical.png') as ImageSourcePropType,
  plumbing: require('@/assets/worker-image-icons/service-plumbing.png') as ImageSourcePropType,
}

const workerV5AvatarIcon = require('@/assets/worker-image-icons/profile-avatar-core.png') as ImageSourcePropType
const workerV5KaelHeadIcon = require('@/assets/kael-emotions/kael-emotion-focused.png') as ImageSourcePropType
const workerV5PhoneIcon = require('@/assets/client-image-icons/client-phone-v2.png') as ImageSourcePropType
const WORKER_V5_PROFILE_ICON_VISUAL_BOOST = new Set<WorkerV5IconName>(['document', 'scope'])

const workerV5BankLogos: Record<WorkerV5BankLogoName, ImageSourcePropType> = {
  acb: require('@/assets/banks/acb.png') as ImageSourcePropType,
  bidv: require('@/assets/banks/bidv.png') as ImageSourcePropType,
  mbbank: require('@/assets/banks/mbbank.png') as ImageSourcePropType,
  techcombank: require('@/assets/banks/techcombank.png') as ImageSourcePropType,
  vietcombank: require('@/assets/banks/vietcombank.png') as ImageSourcePropType,
  vietinbank: require('@/assets/banks/vietinbank.png') as ImageSourcePropType,
}

const WORKER_V5_BANK_OPTIONS: ReadonlyArray<{ code: WorkerV5BankLogoName; label: string }> = [
  { code: 'vietcombank', label: 'Vietcombank' },
  { code: 'techcombank', label: 'Techcombank' },
  { code: 'bidv', label: 'BIDV' },
  { code: 'mbbank', label: 'MBBank' },
  { code: 'acb', label: 'ACB' },
  { code: 'vietinbank', label: 'VietinBank' },
]

const WORKER_V5_SUPPORTED_SERVICES: readonly ServiceType[] = ['electrical', 'plumbing', 'cleaning']

const WORKER_V5_SCREENS: WorkerV5ScreenDefinition[] = [
  {
    authority: 'worker',
    guardrail: 'Kael chỉ đồng bộ bối cảnh và gợi ý; thợ tự bật/tắt nhận việc.',
    icon: 'home',
    id: '1.1-worker-home',
    order: 1,
    phase: 'prepare',
    primaryNext: '1.2-shift-brief',
    section: 'home',
    title: { en: 'Worker home', vi: 'Trang chủ thợ' },
  },
  {
    authority: 'worker',
    guardrail: 'Không hiển thị thời tiết, nhu cầu hoặc ưu tiên nếu chưa có dữ liệu thật.',
    icon: 'calendar',
    id: '1.2-shift-brief',
    order: 2,
    phase: 'prepare',
    primaryNext: '1.3-demand-map',
    section: 'jobs',
    title: { en: 'Work board', vi: 'Bảng công việc' },
  },
  {
    authority: 'worker',
    guardrail: 'Bản đồ cơ hội chỉ dùng khu vực phục vụ hoặc cơ hội thật, không vẽ nhu cầu giả.',
    icon: 'map',
    id: '1.3-demand-map',
    order: 3,
    phase: 'discover',
    primaryNext: '1.4-smart-schedule',
    section: 'jobs',
    title: { en: 'Opportunity map', vi: 'Bản đồ cơ hội' },
  },
  {
    authority: 'kael_assist',
    guardrail: 'Kael được đề xuất lịch, nhưng không tự nhận việc hoặc đổi lịch thay thợ.',
    icon: 'tools',
    id: '1.4-smart-schedule',
    order: 4,
    phase: 'discover',
    primaryNext: '2.1-opportunity-inbox',
    section: 'jobs',
    title: { en: 'Work optimization', vi: 'Tối ưu việc làm' },
  },
  {
    authority: 'worker',
    guardrail: 'Kael chỉ lọc và giải thích mức phù hợp; thợ là người mở, nhận hoặc từ chối.',
    icon: 'jobs',
    id: '2.1-opportunity-inbox',
    order: 5,
    phase: 'discover',
    primaryNext: '2.2-offer-detail',
    section: 'jobs',
    title: { en: 'Opportunity inbox', vi: 'Hộp thư cơ hội' },
  },
  {
    authority: 'worker',
    guardrail: 'Địa chỉ đầy đủ chỉ hiển thị sau khi NestScout đã giao việc cho thợ.',
    icon: 'document',
    id: '2.2-offer-detail',
    order: 6,
    phase: 'discover',
    primaryNext: '2.3-accept-review',
    section: 'jobs',
    title: { en: 'Offer detail', vi: 'Chi tiết đề nghị' },
  },
  {
    authority: 'worker',
    guardrail: 'Kael không thể bấm nhận việc thay thợ; nút này cần xác nhận rõ từ người dùng.',
    icon: 'shield',
    id: '2.3-accept-review',
    order: 7,
    phase: 'accept',
    primaryNext: '2.4-route-eta',
    section: 'jobs',
    title: { en: 'Accept review', vi: 'Xác nhận nhận việc' },
  },
  {
    authority: 'worker',
    guardrail: 'Thời gian đến và liên hệ khách dùng dữ liệu việc thật; không tự đổi lịch hẹn.',
    icon: 'map',
    id: '2.4-route-eta',
    order: 8,
    phase: 'travel',
    primaryNext: '2.5-arrival-checkin',
    section: 'jobs',
    title: { en: 'Route and ETA', vi: 'Di chuyển và thời gian đến' },
  },
  {
    authority: 'worker',
    guardrail: 'Đến nơi cần tín hiệu vị trí hoặc bằng chứng thủ công, không tự đánh dấu.',
    icon: 'map',
    id: '2.5-arrival-checkin',
    order: 9,
    phase: 'travel',
    primaryNext: '2.7-in-progress',
    section: 'jobs',
    title: { en: 'Location', vi: 'Địa điểm' },
  },
  {
    authority: 'worker',
    guardrail: 'Thợ chỉ cập nhật tiến độ và bằng chứng; Kael không tự chuyển trạng thái thay thợ.',
    icon: 'tools',
    id: '2.7-in-progress',
    order: 10,
    phase: 'execute',
    primaryNext: '2.10-completion-evidence',
    section: 'jobs',
    title: { en: 'In progress', vi: 'Đang thực hiện' },
  },
  {
    authority: 'worker',
    guardrail: 'Kael được soạn nháp từ việc hiện tại; thợ phải kiểm tra nội dung trước khi gửi đổi phạm vi.',
    icon: 'scope',
    id: '2.8-scope-change',
    order: 11,
    phase: 'approval',
    primaryNext: '2.9-approval-wait',
    section: 'jobs',
    title: { en: 'Scope change', vi: 'Đổi phạm vi' },
  },
  {
    authority: 'system',
    guardrail: 'Chỉ làm phần phát sinh sau khi NestScout duyệt.',
    icon: 'clock',
    id: '2.9-approval-wait',
    order: 12,
    phase: 'approval',
    primaryNext: '2.10-completion-evidence',
    section: 'jobs',
    title: { en: 'Customer approval wait', vi: 'Chờ khách phê duyệt' },
  },
  {
    authority: 'worker',
    guardrail: 'Hồ sơ hoàn tất cần ghi chú hoặc ảnh thật; thợ là người gửi, Kael chỉ đối chiếu.',
    icon: 'evidence',
    id: '2.10-completion-evidence',
    order: 13,
    phase: 'complete',
    primaryNext: '2.11-completion-submitted',
    section: 'jobs',
    title: { en: 'Completion evidence', vi: 'Bằng chứng hoàn tất' },
  },
  {
    authority: 'system',
    guardrail: 'Sau khi gửi, thợ chờ NestScout cập nhật xác nhận và đối soát; ứng dụng không tự đóng việc.',
    icon: 'shield',
    id: '2.11-completion-submitted',
    order: 14,
    phase: 'complete',
    primaryNext: '2.12-case-closed',
    section: 'jobs',
    title: { en: 'Completion submitted', vi: 'Đã gửi hoàn tất' },
  },
  {
    authority: 'system',
    guardrail: 'Số đối soát và rút tiền chỉ hiển thị khi hệ thống đã ghi nhận, không tự tạo thu nhập.',
    icon: 'wallet',
    id: '2.12-case-closed',
    order: 15,
    phase: 'complete',
    primaryNext: '4.1-earnings-overview',
    section: 'jobs',
    title: { en: 'Case closed', vi: 'Case đã đóng' },
  },
  {
    authority: 'kael_assist',
    guardrail: 'Kael chat là tư vấn giới hạn, không nhận việc, không đổi giá và không quyết kết quả.',
    icon: 'chat',
    id: '3.1-kael-chat-normal',
    order: 16,
    phase: 'assist',
    primaryNext: '3.2-kael-job-intake',
    section: 'kael',
    title: { en: 'Kael', vi: 'Kael' },
  },
  {
    authority: 'kael_assist',
    guardrail: 'Kael có thể lọc và giải thích cơ hội; thợ vẫn là người mở và nhận việc.',
    icon: 'jobs',
    id: '3.2-kael-job-intake',
    order: 17,
    phase: 'assist',
    primaryNext: '2.2-offer-detail',
    section: 'kael',
    title: { en: 'Kael job intake', vi: 'Kael nhận việc' },
  },
  {
    authority: 'system',
    guardrail: 'Thu nhập chỉ đọc từ dữ liệu đối soát thật, không tạo số tháng hay giao dịch mẫu.',
    icon: 'earnings',
    id: '4.1-earnings-overview',
    order: 24,
    phase: 'settle',
    primaryNext: '4.2-ledger-detail',
    section: 'earnings',
    title: { en: 'Earnings overview', vi: 'Thu nhập' },
  },
  {
    authority: 'system',
    guardrail: 'Chi tiết đối soát chỉ dùng số đã ghi nhận, không tự mở tiền rút.',
    icon: 'wallet',
    id: '4.2-ledger-detail',
    order: 25,
    phase: 'settle',
    primaryNext: '4.3-payout-request',
    section: 'earnings',
    title: { en: 'Ledger detail', vi: 'Chi tiết đối soát' },
  },
  {
    authority: 'worker',
    guardrail: 'Yêu cầu rút tiền cần xác nhận rõ của thợ và tài khoản đã xác minh.',
    icon: 'wallet',
    id: '4.3-payout-request',
    order: 26,
    phase: 'settle',
    primaryNext: '4.4-payout-method',
    section: 'earnings',
    title: { en: 'Payout request', vi: 'Yêu cầu rút tiền' },
  },
  {
    authority: 'worker',
    guardrail: 'Đổi tài khoản nhận tiền cần đi qua luồng xác minh hiện hữu.',
    icon: 'shield',
    id: '4.4-payout-method',
    order: 27,
    phase: 'settle',
    primaryNext: '4.3-payout-request',
    section: 'earnings',
    title: { en: 'Payout method', vi: 'Tài khoản nhận tiền' },
  },
  {
    authority: 'worker',
    guardrail: 'Hồ sơ chỉ hiển thị thông tin thợ thật, không bịa cấp bậc hoặc số việc.',
    icon: 'profile',
    id: '5.1-profile-overview',
    order: 28,
    phase: 'grow',
    primaryNext: '5.2-worker-ranking',
    section: 'profile',
    title: { en: 'Worker profile', vi: 'Hồ sơ thợ' },
  },
  {
    authority: 'system',
    guardrail: 'Xếp hạng chỉ đọc từ dữ liệu hiệu suất thật; nếu thiếu thì hiển thị trạng thái trống.',
    icon: 'shield',
    id: '5.2-worker-ranking',
    order: 29,
    phase: 'grow',
    primaryNext: '5.4-reliability-insights',
    section: 'profile',
    title: { en: 'Worker ranking', vi: 'Xếp hạng thợ' },
  },
  {
    authority: 'worker',
    guardrail: 'Kỹ năng và khu vực chỉ lấy từ hồ sơ thợ thật; không vẽ vùng phủ hoặc nhãn trạng thái giả.',
    icon: 'tools',
    id: '5.3-skills-service-area',
    order: 30,
    phase: 'grow',
    primaryNext: '5.1-profile-overview',
    section: 'profile',
    title: { en: 'Skills and service area', vi: 'Kỹ năng và khu vực' },
  },
  {
    authority: 'system',
    guardrail: 'Độ tin cậy chỉ tính từ dữ liệu hiệu suất thật; chỉ số đẹp trong mẫu thiết kế không được dùng làm dữ liệu.',
    icon: 'shield',
    id: '5.4-reliability-insights',
    order: 31,
    phase: 'grow',
    primaryNext: '5.2-worker-ranking',
    section: 'profile',
    title: { en: 'Reliability insights', vi: 'Độ tin cậy' },
  },
  {
    authority: 'worker',
    guardrail: 'Alias cài đặt cũ chỉ mở màn cài đặt tài khoản; không còn hiển thị hub tiện ích tài khoản cũ.',
    icon: 'shield',
    id: '5.5-account-utilities',
    order: 32,
    phase: 'grow',
    primaryNext: '5.1-profile-overview',
    section: 'profile',
    title: { en: 'Settings', vi: 'Cài đặt' },
  },
  {
    authority: 'worker',
    guardrail: 'Bộ nhớ Kael chỉ là tùy chọn có quyền kiểm soát; shell này không lưu ưu tiên mới hay tự lọc cơ hội.',
    icon: 'shield',
    id: '5.6-agent-memory-preferences',
    order: 33,
    phase: 'grow',
    primaryNext: '5.1-profile-overview',
    section: 'profile',
    title: { en: 'Kael memory preferences', vi: 'Bộ nhớ & ưu tiên' },
  },
  {
    authority: 'system',
    guardrail: 'Giấy tờ xác minh chỉ hiện tình trạng thật từ hồ sơ; thiếu giấy tờ thì hiển thị trạng thái trống an toàn.',
    icon: 'document',
    id: '5.7-verification-documents',
    order: 34,
    phase: 'grow',
    primaryNext: '5.8-bank-tax-center',
    section: 'profile',
    title: { en: 'Verification documents', vi: 'Giấy tờ & xác minh' },
  },
  {
    authority: 'system',
    guardrail: 'Ngân hàng và thuế chỉ đọc tài khoản nhận tiền, đối soát và chứng từ đã có; không tự yêu cầu rút tiền.',
    icon: 'wallet',
    id: '5.8-bank-tax-center',
    order: 35,
    phase: 'grow',
    primaryNext: '5.10-support-settings',
    section: 'profile',
    title: { en: 'Bank and tax center', vi: 'Ngân hàng và thuế' },
  },
  {
    authority: 'system',
    guardrail: 'Đánh giá và phản hồi chỉ dùng dữ liệu tổng hợp thật; không đếng lời khách hoặc chuỗi 5 sao giả.',
    icon: 'chat',
    id: '5.9-reviews-feedback',
    order: 36,
    phase: 'grow',
    primaryNext: '5.2-worker-ranking',
    section: 'profile',
    title: { en: 'Reviews and feedback', vi: 'Đánh giá và phản hồi' },
  },
  {
    authority: 'worker',
    guardrail: 'Cài đặt tài khoản chỉ dùng hồ sơ, bảo mật, ngôn ngữ và bộ nhớ Kael được phép.',
    icon: 'shield',
    id: '5.10-support-settings',
    order: 37,
    phase: 'grow',
    primaryNext: '5.1-profile-overview',
    section: 'profile',
    title: { en: 'Settings', vi: 'Cài đặt' },
  },
]

const workerV5EnglishGuardrails: Partial<Record<WorkerV5ScreenId, string>> = {
  '1.1-worker-home': 'Kael only syncs context and suggestions; the worker controls availability.',
  '1.2-shift-brief': 'Weather, demand, and priority signals stay hidden until real data exists.',
  '1.3-demand-map': 'The opportunity map uses service areas or real broadcasts, never invented demand.',
  '1.4-smart-schedule': 'Kael may suggest a schedule, but it cannot accept work or change plans for the worker.',
  '2.1-opportunity-inbox': 'Kael can filter and explain fit; the worker opens, accepts, or declines.',
  '2.2-offer-detail': 'Full address is shown only after NestScout assigns the job to the worker.',
  '2.3-accept-review': 'Kael cannot accept work for the worker; confirmation must be explicit.',
  '2.4-route-eta': 'ETA and customer contact use real job data and do not create a new promise.',
  '2.5-arrival-checkin': 'Check-in needs location signal or manual evidence; it is never automatic.',
  '2.7-in-progress': 'Workers update progress and evidence; Kael does not change status for them.',
  '2.8-scope-change': 'Kael can draft from the work resolution context; the worker reviews before sending.',
  '2.9-approval-wait': 'Approval stays NestScout-recorded; extra work waits for a real NestScout decision.',
  '2.10-completion-evidence': 'Completion needs real notes or photos; the worker submits the artifact.',
  '2.11-completion-submitted': 'After submission, the worker waits for NestScout confirmation and settlement.',
  '2.12-case-closed': 'Ledger and payout data appear only after the system records them.',
  '3.1-kael-chat-normal': 'Kael chat is bounded advisory, not a work decision surface.',
  '3.2-kael-job-intake': 'Kael can filter and explain opportunities; the worker still accepts.',
  '4.1-earnings-overview': 'Earnings read from real settlement data and never invent monthly totals.',
  '4.2-ledger-detail': 'Ledger detail uses recorded settlement numbers only.',
  '4.3-payout-request': 'Payout requests need explicit worker confirmation and a verified account.',
  '4.4-payout-method': 'Changing payout account must use the existing verification flow.',
  '5.1-profile-overview': 'Profile shows real worker data only, without invented level or job totals.',
  '5.2-worker-ranking': 'Ranking reads from real performance insights or shows an honest empty state.',
  '5.3-skills-service-area': 'Skills and service area update through the real worker profile.',
  '5.4-reliability-insights': 'Reliability uses real performance insights, never decorative reference numbers.',
  '5.5-account-utilities': 'Legacy settings alias opens the account settings surface instead of the old utility hub.',
  '5.6-agent-memory-preferences': 'Kael memory remains worker-controlled and this shell does not save new preferences.',
  '5.7-verification-documents': 'Verification documents show real profile status and honest missing states.',
  '5.8-bank-tax-center': 'Bank and tax center reads recorded payout data only and never submits payout by itself.',
  '5.9-reviews-feedback': 'Reviews use real aggregate feedback only; customer quotes are not fabricated.',
  '5.10-support-settings': 'Settings stay in-app and keep account, security, language, and Kael memory controls explicit.',
}

const workerV5Routes: Record<WorkerV5Section, string> = {
  earnings: '/(worker)/earnings',
  home: '/(worker)/home',
  jobs: '/(worker)/jobs',
  kael: '/(worker)/chat',
  profile: '/(worker)/profile',
}

const workerV5SectionRootIds: Record<WorkerV5Section, WorkerV5ScreenId> = {
  earnings: '4.1-earnings-overview',
  home: '1.1-worker-home',
  jobs: '1.2-shift-brief',
  kael: '3.1-kael-chat-normal',
  profile: '5.1-profile-overview',
}

const phaseCopy: Record<WorkerV5Phase, Record<AppLanguage, string>> = {
  accept: { en: 'Accept', vi: 'Nhận việc' },
  approval: { en: 'Approval', vi: 'Chờ quyết định' },
  assist: { en: 'Assist', vi: 'Hỗ trợ' },
  close: { en: 'Close', vi: 'Kết thúc việc' },
  complete: { en: 'Complete', vi: 'Hoàn tất' },
  discover: { en: 'Discover', vi: 'Tìm cơ hội' },
  execute: { en: 'Execute', vi: 'Thực hiện' },
  grow: { en: 'Growth', vi: 'Phát triển' },
  money: { en: 'Money', vi: 'Thu nhập' },
  prepare: { en: 'Prepare', vi: 'Chuẩn bị' },
  profile: { en: 'Profile', vi: 'Hồ sơ' },
  settle: { en: 'Settlement', vi: 'Đối soát' },
  travel: { en: 'Travel', vi: 'Di chuyển' },
  work: { en: 'Work', vi: 'Đang làm' },
}

function firstRouteParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function getWorkerV5Screen(id: string | undefined) {
  return WORKER_V5_SCREENS.find((screen) => screen.id === id) ?? null
}

function requireWorkerV5Screen(id: WorkerV5ScreenId) {
  const screen = getWorkerV5Screen(id)
  if (!screen) throw new Error(`Missing worker v5 screen: ${id}`)
  return screen
}

function routeForWorkerV5Screen(screen: WorkerV5ScreenDefinition) {
  return `${workerV5Routes[screen.section]}?ns_worker_screen=${encodeURIComponent(screen.id)}`
}

function resolveWorkerV5ScreenId(section: WorkerV5Section, params: WorkerV5RouteParams): WorkerV5ScreenId {
  const explicitScreen = getWorkerV5Screen(firstRouteParam(params.ns_worker_screen))
  if (explicitScreen?.section === section) return explicitScreen.id

  if (section === 'jobs') return resolveWorkerV5JobsScreenId(params)
  if (section === 'earnings') return resolveWorkerV5EarningsScreenId(params)
  return workerV5SectionRootIds[section]
}

function resolveWorkerV5JobsScreenId(params: WorkerV5RouteParams): WorkerV5ScreenId {
  const auditSurface = firstRouteParam(params.ns_audit_surface)
  const tab = firstRouteParam(params.tab)

  if (auditSurface === 'worker_scope_change' || auditSurface === 'worker_scope_evidence_form') {
    return '2.8-scope-change'
  }

  if (auditSurface === 'worker_completion_evidence') return '2.10-completion-evidence'
  if (auditSurface === 'worker_job_summary' || auditSurface === 'worker_summary_report') {
    return '2.11-completion-submitted'
  }

  if (auditSurface === 'worker_case_closed' || auditSurface === 'worker_payment_gate') {
    return '2.12-case-closed'
  }

  if (auditSurface === 'worker_safety_checklist' || tab === 'active') return '2.7-in-progress'
  if (tab === 'waiting') return '1.2-shift-brief'
  if (tab === 'needs') return '2.8-scope-change'
  return workerV5SectionRootIds.jobs
}

function resolveWorkerV5EarningsScreenId(params: WorkerV5RouteParams): WorkerV5ScreenId {
  const paymentStep = firstRouteParam(params.ns_payment_step)

  if (paymentStep === 'withdraw') return '4.3-payout-request'
  if (paymentStep === 'method') return '4.4-payout-method'
  if (paymentStep === 'wallet') return '4.2-ledger-detail'
  return workerV5SectionRootIds.earnings
}

function resolveWorkerV5Language(params: WorkerV5RouteParams): AppLanguage {
  const routeLanguage = firstRouteParam(params.ns_worker_lang)
  if (routeLanguage === 'en' || routeLanguage === 'vi') return routeLanguage
  return 'vi'
}

function useWorkerV5Screen(section: WorkerV5Section) {
  const params = useLocalSearchParams<WorkerV5RouteParams>()
  return requireWorkerV5Screen(resolveWorkerV5ScreenId(section, params))
}

export function WorkerHomeSurface() {
  const screen = useWorkerV5Screen('home')
  return <WorkerV5ScreenSurface screen={screen} />
}

export function WorkerJobsSurface() {
  const screen = useWorkerV5Screen('jobs')
  return <WorkerV5ScreenSurface screen={screen} />
}

export function WorkerChatSurface() {
  const screen = useWorkerV5Screen('kael')
  return <WorkerV5ScreenSurface screen={screen} />
}

export function WorkerEarningsSurface() {
  const screen = useWorkerV5Screen('earnings')
  return <WorkerV5ScreenSurface screen={screen} />
}

export function WorkerProfileSurface() {
  const screen = useWorkerV5Screen('profile')
  return <WorkerV5ScreenSurface screen={screen} />
}

function WorkerV5ScreenSurface({ screen }: { screen: WorkerV5ScreenDefinition }) {
  const params = useLocalSearchParams<WorkerV5RouteParams>()
  const language = resolveWorkerV5Language(params)
  const router = useRouter()
  const { signOut } = useAuth()
  const runtime = useFrontendWorkflow()
  const [actionBusy, setActionBusy] = useState(false)
  const { height } = useWindowDimensions()
  const glass = useGlassAccessibility()
  const previousScreen = useMemo(
    () => WORKER_V5_SCREENS.find((candidate) => candidate.order === screen.order - 1) ?? null,
    [screen.order],
  )
  const nextScreen = useMemo(
    () => WORKER_V5_SCREENS.find((candidate) => candidate.id === screen.primaryNext) ?? null,
    [screen.primaryNext],
  )
  const title = screen.title[language]
  const minHeight = Math.max(620, Math.round(height * 0.92))
  const surfaceStyle = glass.reduceTransparency ? styles.surfaceSolid : styles.surfaceGlass
  const usesShiftBriefHandoff = screen.id === '1.2-shift-brief'
  const usesDemandMapHandoff = screen.id === '1.3-demand-map'
  const usesSmartScheduleHandoff = screen.id === '1.4-smart-schedule'
  const usesOpportunityInboxHandoff = screen.id === '2.1-opportunity-inbox'
  const usesOfferDetailHandoff = screen.id === '2.2-offer-detail'
  const usesAcceptReviewHandoff = screen.id === '2.3-accept-review'
  const usesRouteEtaHandoff = screen.id === '2.4-route-eta'
  const usesArrivalCheckinHandoff = screen.id === '2.5-arrival-checkin'
  const usesTravelHandoff = usesRouteEtaHandoff || usesArrivalCheckinHandoff
  const usesInProgressHandoff = screen.id === '2.7-in-progress'
  const usesScopeChangeHandoff = screen.id === '2.8-scope-change'
  const usesApprovalWaitHandoff = screen.id === '2.9-approval-wait'
  const usesCompletionEvidenceHandoff = screen.id === '2.10-completion-evidence'
  const usesCompletionSubmittedHandoff = screen.id === '2.11-completion-submitted'
  const usesCaseClosedHandoff = screen.id === '2.12-case-closed'
  const usesKaelOrbHandoff = screen.id === '3.1-kael-chat-normal' || screen.id === '3.2-kael-job-intake'
  const usesEarningsHandoff = screen.id === '4.1-earnings-overview' || screen.id === '4.2-ledger-detail' || screen.id === '4.3-payout-request' || screen.id === '4.4-payout-method'
  const usesEarningsOverviewHandoff = screen.id === '4.1-earnings-overview'
  const usesLedgerDetailHandoff = screen.id === '4.2-ledger-detail'
  const usesPayoutRequestHandoff = screen.id === '4.3-payout-request'
  const usesPayoutMethodHandoff = screen.id === '4.4-payout-method'
  const usesProfileHandoff = screen.id === '5.1-profile-overview' || screen.id === '5.2-worker-ranking' || screen.id === '5.3-skills-service-area' || screen.id === '5.4-reliability-insights' || screen.id === '5.5-account-utilities' || screen.id === '5.6-agent-memory-preferences' || screen.id === '5.10-support-settings'
  const usesProfileInfoHeaderIcon = screen.id === '5.1-profile-overview' || screen.id === '5.2-worker-ranking' || screen.id === '5.3-skills-service-area' || screen.id === '5.4-reliability-insights'
  const usesCaseExecutionHandoff = usesInProgressHandoff || usesScopeChangeHandoff || usesApprovalWaitHandoff || usesCompletionEvidenceHandoff || usesCompletionSubmittedHandoff || usesCaseClosedHandoff
  const usesHandoffStage = usesShiftBriefHandoff || usesDemandMapHandoff || usesSmartScheduleHandoff || usesOpportunityInboxHandoff || usesOfferDetailHandoff || usesAcceptReviewHandoff || usesTravelHandoff || usesCaseExecutionHandoff || usesKaelOrbHandoff || usesEarningsHandoff || usesProfileHandoff
  const usesCustomerFormulaAura = usesHandoffStage
  const handoffHeaderSubtitle = usesOpportunityInboxHandoff
    ? textByLanguage(language, 'Kael đã lọc theo kỹ năng, bán kính và lịch trống', 'Kael has filtered by skills, radius, and open schedule')
    : usesEarningsOverviewHandoff
      ? null
    : screen.id === '4.2-ledger-detail'
      ? null
    : usesPayoutRequestHandoff
      ? null
    : usesPayoutMethodHandoff
      ? textByLanguage(language, 'Chọn ngân hàng đã xác minh', 'Choose a verified bank')
    : screen.id === '5.4-reliability-insights'
      ? textByLanguage(language, 'Chỉ số có thể kiểm chứng, không phải cảm tính', 'Verifiable signals, not sentiment')
    : screen.id === '5.5-account-utilities' || screen.id === '5.10-support-settings'
      ? textByLanguage(language, 'Tài khoản, bảo mật và bộ nhớ Kael', 'Account, security, and Kael memory')
    : screen.id === '5.6-agent-memory-preferences'
      ? textByLanguage(language, 'Kael nhớ có kiểm soát, bạn có thể tắt bất kỳ lúc nào', 'Kael remembers with your control and can be turned off anytime')
    : usesKaelOrbHandoff
      ? screen.id === '3.1-kael-chat-normal'
        ? textByLanguage(language, 'Chat thường · hỏi đáp & hỗ trợ nhanh', 'Normal chat · quick help')
        : textByLanguage(language, 'Tìm, lọc và giải thích cơ hội cho thợ', 'Find, filter, and explain worker opportunities')
    : usesTravelHandoff
      ? workerV5TravelHeaderSubtitle(runtime.state.deal, language)
      : usesCaseClosedHandoff
        ? null
      : usesApprovalWaitHandoff || usesCompletionSubmittedHandoff
        ? workerV5CaseHeaderSubtitle(runtime.state.deal, language)
      : usesInProgressHandoff
        ? null
      : usesCaseExecutionHandoff || usesOfferDetailHandoff || usesAcceptReviewHandoff
        ? workerV5OfferHeaderSubtitle(runtime.state.deal, language)
        : null

  const displayTitle = usesKaelOrbHandoff && screen.id === '3.1-kael-chat-normal'
    ? 'Kael'
    : usesEarningsOverviewHandoff
      ? textByLanguage(language, 'Thu nhập của bạn', 'Your earnings')
    : title

  const openScreen = (target: WorkerV5ScreenDefinition | null) => {
    if (!target) return
    router.replace(routeForWorkerV5Screen(target) as never)
  }
  const openScreenById = (id: WorkerV5ScreenId) => {
    openScreen(WORKER_V5_SCREENS.find((candidate) => candidate.id === id) ?? null)
  }
  const openJobChat = () => router.replace('/(worker)/chat?ns_worker_screen=3.1-kael-chat-normal' as never)
  const runWorkerAction = async (action: () => Promise<boolean>) => {
    setActionBusy(true)
    try {
      const ok = await action()
      if (ok) openScreen(nextScreen)
    } finally {
      setActionBusy(false)
    }
  }
  const primaryAction = getWorkerV5PrimaryAction(screen, runtime, language, actionBusy, runWorkerAction, () => openScreen(nextScreen))

  if (usesKaelOrbHandoff) {
    return (
      <WorkerV5KaelOrbScreenSurface
        deal={runtime.state.deal}
        language={language}
        mode={screen.id === '3.2-kael-job-intake' ? 'intake' : 'normal'}
        navigateToScreen={openScreenById}
        reduceMotion={glass.reduceMotion}
        reduceTransparency={glass.reduceTransparency}
        screen={screen}
        surfaceStyle={surfaceStyle}
      />
    )
  }

  if (screen.id === '1.1-worker-home') {
    return (
      <WorkerV5HomeScreenSurface
        glass={glass}
        language={language}
        minHeight={minHeight}
        openScreen={openScreen}
        runtime={runtime}
        surfaceStyle={surfaceStyle}
      />
    )
  }

  return (
    <SafeAreaView style={[styles.safeArea, surfaceStyle]} testID={`worker-v5-screen-${screen.id}`}>
      {!glass.reduceTransparency && !usesCustomerFormulaAura ? <MintAura intensity="page" style={styles.pageMintAura} testID="worker-v5-page-mint-aura" /> : null}
      {usesCompletionSubmittedHandoff && !glass.reduceTransparency ? (
        <WorkerV5CustomerFulfillmentCanvasAura
          scope="CompletionSubmittedPage"
          testID="worker-v5-completion-submitted-background-mint-aura"
        />
      ) : null}
      {usesCustomerFormulaAura && !glass.reduceTransparency ? (
        usesDemandMapHandoff ? (
          <WorkerV5CustomerMapMintAura
            scope="DemandMapPage"
            style={styles.demandMapPageAura}
            testID="worker-v5-demand-page-customer-mint-aura"
          />
        ) : usesOpportunityInboxHandoff ? (
          <WorkerV5CustomerCaseWideMintAura
            scope="OpportunityInboxPage"
            style={styles.opportunityInboxPageAura}
            testID="worker-v5-opportunity-page-customer-mint-aura"
          />
        ) : usesOfferDetailHandoff ? (
          <WorkerV5CustomerCaseWideMintAura
            scope="OfferDetailPage"
            style={styles.offerDetailPageAura}
            testID="worker-v5-offer-page-customer-mint-aura"
          />
        ) : usesAcceptReviewHandoff ? (
          <WorkerV5CustomerCaseWideMintAura
            scope="AcceptReviewPage"
            style={styles.acceptReviewPageAura}
            testID="worker-v5-accept-page-customer-mint-aura"
          />
        ) : usesRouteEtaHandoff ? (
          <WorkerV5CustomerMapMintAura
            scope="RouteEtaPage"
            style={styles.routeEtaPageAura}
            testID="worker-v5-route-page-customer-mint-aura"
          />
        ) : usesArrivalCheckinHandoff ? (
          <WorkerV5CustomerCaseWideMintAura
            scope="ArrivalCheckinPage"
            style={styles.arrivalCheckinPageAura}
            testID="worker-v5-checkin-page-customer-mint-aura"
          />
        ) : usesEarningsOverviewHandoff || usesLedgerDetailHandoff || usesPayoutRequestHandoff || usesPayoutMethodHandoff || usesProfileHandoff ? (
          <WorkerV5EarningsHomeAuraBackground />
        ) : usesEarningsHandoff ? (
          <WorkerV5CustomerCaseWideMintAura
            scope="WorkerEarningsPage"
            style={styles.arrivalCheckinPageAura}
            testID="worker-v5-earnings-page-customer-mint-aura"
          />
        ) : usesInProgressHandoff ? (
          <WorkerV5CustomerFulfillmentCanvasAura
            scope="WorkerInProgressPage"
            testID="worker-v5-in-progress-canvas-aura"
          />
        ) : usesKaelOrbHandoff ? (
          <WorkerV5CustomerFulfillmentCanvasAura
            scope="KaelOrbPage"
            testID="worker-v5-kael-orb-background-mint-aura"
          />
        ) : usesCaseExecutionHandoff ? (
          <WorkerV5CustomerCaseWideMintAura
            scope="WorkerCaseExecutionPage"
            style={styles.arrivalCheckinPageAura}
            testID="worker-v5-case-flow-page-customer-mint-aura"
          />
        ) : (
          <WorkerV5CustomerCaseWideMintAura
            scope={usesShiftBriefHandoff ? 'ShiftBriefPage' : 'SmartSchedulePage'}
            style={usesShiftBriefHandoff ? styles.shiftBriefPageAura : styles.smartSchedulePageAura}
            testID={usesShiftBriefHandoff ? 'worker-v5-shift-page-customer-mint-aura' : 'worker-v5-schedule-page-customer-mint-aura'}
          />
        )
      ) : null}
      {usesDemandMapHandoff && !glass.reduceTransparency ? (
        <WorkerV5CustomerZipMintAura
          scope="DemandMapPageFine"
          style={styles.demandMapPageZipAura}
          testID="worker-v5-demand-page-customer-zip-mint-aura"
        />
      ) : null}
      {usesSmartScheduleHandoff && !glass.reduceTransparency ? (
        <WorkerV5CustomerZipMintAura
          scope="SmartSchedulePageFine"
          style={styles.smartSchedulePageZipAura}
          testID="worker-v5-schedule-page-customer-zip-mint-aura"
        />
      ) : null}
      {usesSmartScheduleHandoff && !glass.reduceTransparency ? (
        <WorkerV5CustomerCaseWideMintAura
          scope="SmartSchedulePageLower"
          style={styles.smartSchedulePageLowerAura}
          testID="worker-v5-schedule-page-lower-mint-aura"
        />
      ) : null}
      {usesOpportunityInboxHandoff && !glass.reduceTransparency ? (
        <WorkerV5CustomerZipMintAura
          scope="OpportunityInboxPageFine"
          style={styles.opportunityInboxPageZipAura}
          testID="worker-v5-opportunity-page-customer-zip-mint-aura"
        />
      ) : null}
      {usesOfferDetailHandoff && !glass.reduceTransparency ? (
        <WorkerV5CustomerZipMintAura
          scope="OfferDetailPageFine"
          style={styles.offerDetailPageZipAura}
          testID="worker-v5-offer-page-customer-zip-mint-aura"
        />
      ) : null}
      {usesAcceptReviewHandoff && !glass.reduceTransparency ? (
        <WorkerV5CustomerZipMintAura
          scope="AcceptReviewPageFine"
          style={styles.acceptReviewPageZipAura}
          testID="worker-v5-accept-page-customer-zip-mint-aura"
        />
      ) : null}
      {usesRouteEtaHandoff && !glass.reduceTransparency ? (
        <WorkerV5CustomerZipMintAura
          scope="RouteEtaPageFine"
          style={styles.routeEtaPageZipAura}
          testID="worker-v5-route-page-customer-zip-mint-aura"
        />
      ) : null}
      {usesArrivalCheckinHandoff && !glass.reduceTransparency ? (
        <WorkerV5CustomerZipMintAura
          scope="ArrivalCheckinPageFine"
          style={styles.arrivalCheckinPageZipAura}
          testID="worker-v5-checkin-page-customer-zip-mint-aura"
        />
      ) : null}
      {usesCaseExecutionHandoff && !usesInProgressHandoff && !glass.reduceTransparency ? (
        <WorkerV5CustomerZipMintAura
          scope="WorkerCaseExecutionPageFine"
          style={styles.arrivalCheckinPageZipAura}
          testID="worker-v5-case-flow-page-customer-zip-mint-aura"
        />
      ) : null}
      {(usesEarningsHandoff || usesProfileHandoff) && !glass.reduceTransparency ? (
        <WorkerV5CustomerZipMintAura
          scope={usesProfileHandoff ? 'WorkerProfilePageFine' : 'WorkerEarningsPageFine'}
          style={usesEarningsOverviewHandoff || usesLedgerDetailHandoff || usesPayoutRequestHandoff || usesPayoutMethodHandoff || usesProfileHandoff ? styles.earningsPageZipAura : styles.arrivalCheckinPageZipAura}
          testID="worker-v5-earnings-page-customer-zip-mint-aura"
        />
      ) : null}
      {(usesEarningsOverviewHandoff || usesLedgerDetailHandoff || usesPayoutRequestHandoff || usesPayoutMethodHandoff || usesProfileHandoff) && !glass.reduceTransparency ? (
        <WorkerV5CustomerCaseWideMintAura
          scope={usesProfileHandoff ? 'WorkerProfilePageLower' : 'WorkerEarningsPageLower'}
          style={styles.earningsPageLowerAura}
          testID={usesProfileHandoff ? 'worker-v5-profile-page-lower-mint-aura' : 'worker-v5-earnings-page-lower-mint-aura'}
        />
      ) : null}
      {usesCaseExecutionHandoff && !usesInProgressHandoff && !glass.reduceTransparency ? (
        <WorkerV5CustomerCaseWideMintAura
          scope="WorkerCaseExecutionPageLower"
          style={styles.caseFlowPageLowerAura}
          testID="worker-v5-case-flow-page-lower-mint-aura"
        />
      ) : null}
      {usesKaelOrbHandoff && !glass.reduceTransparency ? (
        <WorkerV5CustomerZipMintAura
          scope="KaelOrbPageFine"
          style={styles.kaelOrbPageZipAura}
          testID="worker-v5-kael-orb-page-zip-mint-aura"
        />
      ) : null}
      {usesOfferDetailHandoff && !glass.reduceTransparency ? (
        <WorkerV5CustomerCaseWideMintAura
          scope="OfferDetailPageLower"
          style={styles.offerDetailPageLowerAura}
          testID="worker-v5-offer-page-lower-mint-aura"
        />
      ) : null}
      {usesAcceptReviewHandoff && !glass.reduceTransparency ? (
        <WorkerV5CustomerCaseWideMintAura
          scope="AcceptReviewPageLower"
          style={styles.acceptReviewPageLowerAura}
          testID="worker-v5-accept-page-lower-mint-aura"
        />
      ) : null}
      <ScrollView
        bounces={false}
        contentContainerStyle={[styles.scrollContent, usesKaelOrbHandoff ? styles.kaelOrbCustomerScrollContent : null, { minHeight }]}
        showsVerticalScrollIndicator={false}
        testID="worker-v5-scroll"
      >
        <View style={[styles.headerRow, usesKaelOrbHandoff ? styles.kaelOrbCustomerHeaderRow : null]}>
          {usesOpportunityInboxHandoff || usesEarningsOverviewHandoff ? (
            <View style={styles.iconBadge} testID="worker-v5-opportunity-header-icon">
              <MintAura intensity="iconTile" style={styles.iconTileMintAura} />
              <Image source={workerV5Icons[usesEarningsOverviewHandoff ? 'profile' : 'jobs']} style={styles.iconImage} />
            </View>
          ) : (
            <Pressable
              accessibilityLabel={language === 'vi' ? 'Quay lại worker hiện tại' : 'Back to current worker surface'}
              onPress={() => (usesOfferDetailHandoff || usesAcceptReviewHandoff || usesTravelHandoff || usesCaseExecutionHandoff || usesEarningsHandoff ? openScreen(previousScreen) : router.replace(workerV5Routes[screen.section] as never))}
              style={({ pressed }) => [styles.iconButton, pressed && !glass.reduceMotion ? styles.pressed : null]}
              testID="worker-v5-back"
            >
              <WorkerV5BackArrowIcon />
            </Pressable>
          )}
          <View style={styles.headerTextColumn}>
            {usesCaseClosedHandoff ? null : usesKaelOrbHandoff || usesOpportunityInboxHandoff || usesOfferDetailHandoff || usesAcceptReviewHandoff || usesTravelHandoff || usesCaseExecutionHandoff || usesEarningsHandoff || usesProfileHandoff ? (
              <>
                <Text style={[styles.titleText, usesKaelOrbHandoff ? styles.kaelOrbCustomerHeaderTitle : null]}>{displayTitle}</Text>
                {handoffHeaderSubtitle ? <Text style={styles.headerSubtitleText} numberOfLines={2}>{handoffHeaderSubtitle}</Text> : null}
              </>
            ) : !usesShiftBriefHandoff && !usesSmartScheduleHandoff ? (
              <Text style={styles.phaseText}>{phaseCopy[screen.phase][language]}</Text>
            ) : null}
            {!usesOpportunityInboxHandoff && !usesOfferDetailHandoff && !usesAcceptReviewHandoff && !usesTravelHandoff && !usesCaseExecutionHandoff && !usesKaelOrbHandoff && !usesEarningsHandoff && !usesProfileHandoff ? <Text style={styles.titleText}>{title}</Text> : null}
          </View>
          {usesOpportunityInboxHandoff ? (
            <Pressable
              accessibilityLabel={language === 'vi' ? 'Lọc cơ hội' : 'Filter opportunities'}
              accessibilityRole="button"
              onPress={() => openScreen(WORKER_V5_SCREENS.find((candidate) => candidate.id === '3.2-kael-job-intake') ?? nextScreen)}
              style={({ pressed }) => [styles.iconButton, pressed && !glass.reduceMotion ? styles.pressed : null]}
              testID="worker-v5-opportunity-filter"
            >
              <Text style={styles.headerMenuText}>⌁</Text>
            </Pressable>
          ) : usesEarningsOverviewHandoff ? (
            <Pressable
              accessibilityLabel={language === 'vi' ? 'Lọc thu nhập' : 'Filter earnings'}
              accessibilityRole="button"
              onPress={() => openScreen(WORKER_V5_SCREENS.find((candidate) => candidate.id === '4.2-ledger-detail') ?? nextScreen)}
              style={({ pressed }) => [styles.iconButton, pressed && !glass.reduceMotion ? styles.pressed : null]}
              testID="worker-v5-earnings-filter"
            >
              <Text style={styles.headerMenuText}>⌁</Text>
            </Pressable>
          ) : usesOfferDetailHandoff ? (
            <Pressable
              accessibilityLabel={language === 'vi' ? 'Tùy chọn đề nghị' : 'Offer options'}
              accessibilityRole="button"
              onPress={() => openScreen(WORKER_V5_SCREENS.find((candidate) => candidate.id === '3.2-kael-job-intake') ?? nextScreen)}
              style={({ pressed }) => [styles.iconButton, pressed && !glass.reduceMotion ? styles.pressed : null]}
              testID="worker-v5-offer-menu"
            >
              <Text style={styles.headerMenuText}>•••</Text>
            </Pressable>
          ) : usesAcceptReviewHandoff ? (
            <Pressable
              accessibilityLabel={language === 'vi' ? 'Thông tin xác nhận' : 'Acceptance information'}
              accessibilityRole="button"
              onPress={() => openScreen(previousScreen)}
              style={({ pressed }) => [styles.iconButton, pressed && !glass.reduceMotion ? styles.pressed : null]}
              testID="worker-v5-accept-info"
            >
              <Text style={styles.headerMenuText}>i</Text>
            </Pressable>
          ) : usesRouteEtaHandoff ? (
            <Pressable
              accessibilityLabel={language === 'vi' ? 'Tùy chọn di chuyển' : 'Travel options'}
              accessibilityRole="button"
              onPress={openJobChat}
              style={({ pressed }) => [styles.iconButton, pressed && !glass.reduceMotion ? styles.pressed : null]}
              testID="worker-v5-route-menu"
            >
              <Text style={styles.headerMenuText}>•••</Text>
            </Pressable>
          ) : usesArrivalCheckinHandoff ? (
            <Pressable
              accessibilityLabel={language === 'vi' ? 'Thông tin đến điểm hẹn' : 'Arrival information'}
              accessibilityRole="button"
              onPress={() => openScreen(previousScreen)}
              style={({ pressed }) => [styles.iconButton, pressed && !glass.reduceMotion ? styles.pressed : null]}
              testID="worker-v5-checkin-info"
            >
              <Text style={styles.headerMenuText}>i</Text>
            </Pressable>
          ) : usesApprovalWaitHandoff ? (
            <Pressable
              accessibilityLabel={language === 'vi' ? 'Trợ giúp phê duyệt' : 'Approval help'}
              accessibilityRole="button"
              onPress={openJobChat}
              style={({ pressed }) => [styles.iconButton, pressed && !glass.reduceMotion ? styles.pressed : null]}
              testID="worker-v5-approval-help"
            >
              <Text style={styles.headerMenuText}>?</Text>
            </Pressable>
          ) : usesCaseExecutionHandoff ? (
            <Pressable
              accessibilityLabel={language === 'vi' ? 'Thông tin công việc' : 'Work information'}
              accessibilityRole="button"
              onPress={usesInProgressHandoff || usesScopeChangeHandoff ? openJobChat : () => openScreen(previousScreen)}
              style={({ pressed }) => [styles.iconButton, pressed && !glass.reduceMotion ? styles.pressed : null]}
              testID="worker-v5-case-flow-info"
            >
              <Text style={styles.headerMenuText}>i</Text>
            </Pressable>
          ) : screen.id === '4.2-ledger-detail' ? (
            <Pressable
              accessibilityLabel={language === 'vi' ? 'Mở yêu cầu rút tiền' : 'Open payout request'}
              accessibilityRole="button"
              onPress={() => openScreen(WORKER_V5_SCREENS.find((candidate) => candidate.id === '4.3-payout-request') ?? nextScreen)}
              style={({ pressed }) => [styles.iconButton, pressed && !glass.reduceMotion ? styles.pressed : null]}
              testID="worker-v5-ledger-export"
            >
              <Text style={styles.headerMenuText}>↗</Text>
            </Pressable>
          ) : screen.id === '4.3-payout-request' ? (
            <Pressable
              accessibilityLabel={language === 'vi' ? 'Hỏi Kael về rút tiền' : 'Ask Kael about payout'}
              accessibilityRole="button"
              onPress={openJobChat}
              style={({ pressed }) => [styles.iconButton, pressed && !glass.reduceMotion ? styles.pressed : null]}
              testID="worker-v5-payout-help"
            >
              <Text style={styles.headerMenuText}>?</Text>
            </Pressable>
          ) : usesKaelOrbHandoff ? (
            <Pressable
              accessibilityLabel={language === 'vi' ? 'Tùy chọn Kael' : 'Kael options'}
              accessibilityRole="button"
              onPress={openJobChat}
              style={({ pressed }) => [styles.iconButton, pressed && !glass.reduceMotion ? styles.pressed : null]}
              testID="worker-v5-kael-menu"
            >
              <Text style={styles.headerMenuText}>•••</Text>
            </Pressable>
          ) : usesSmartScheduleHandoff ? (
            <Pressable
              accessibilityLabel={language === 'vi' ? 'Tùy chỉnh lịch đề xuất' : 'Customize suggested schedule'}
              accessibilityRole="button"
              onPress={() => openScreen(previousScreen)}
              style={({ pressed }) => [styles.iconButton, pressed && !glass.reduceMotion ? styles.pressed : null]}
              testID="worker-v5-schedule-menu"
            >
              <Text style={styles.headerMenuText}>•••</Text>
            </Pressable>
          ) : usesProfileInfoHeaderIcon ? (
            <View style={styles.iconBadge} testID={`worker-v5-profile-info-header-icon-${screen.id}`}>
              {!glass.reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
              <Text style={[styles.headerMenuText, styles.profileInfoHeaderGlyph]}>i</Text>
            </View>
          ) : (
            <View style={styles.iconBadge}>
              <MintAura intensity="iconTile" style={styles.iconTileMintAura} />
              <Image source={workerV5Icons[screen.icon]} style={styles.iconImage} />
            </View>
          )}
        </View>

        {!usesHandoffStage ? (
          <View style={[styles.glassCard, glass.reduceTransparency && styles.opaqueCard]}>
            {!glass.reduceTransparency ? <MintAura intensity="component" style={styles.cardMintAura} testID="worker-v5-hero-mint-aura" /> : null}
            <View pointerEvents="none" style={styles.cardTopHighlight} />
            <View style={styles.heroTopRow}>
              <View style={styles.statusDot} />
              <Text style={styles.kickerText}>
                {language === 'vi' ? 'Dữ liệu đã đồng bộ' : 'Synced data'}
              </Text>
            </View>
            <Text style={styles.heroTitle}>{buildHeroLine(screen, runtime, language)}</Text>
            <Text style={styles.heroBody}>{buildHeroBody(screen, runtime, language)}</Text>
          </View>
        ) : null}

        {renderWorkerV5Body(
          screen,
          runtime,
          language,
          glass.reduceMotion,
          glass.reduceTransparency,
          () => openScreen(nextScreen),
          () => openScreen(previousScreen),
          openScreenById,
          runWorkerAction,
          openJobChat,
          actionBusy,
        )}

        {primaryAction && screen.id !== '5.4-reliability-insights' && screen.id !== '5.5-account-utilities' && screen.id !== '5.6-agent-memory-preferences' && screen.id !== '5.10-support-settings' && !usesSmartScheduleHandoff && !usesOpportunityInboxHandoff && !usesOfferDetailHandoff && !usesAcceptReviewHandoff && !usesTravelHandoff && !usesCaseExecutionHandoff && !usesKaelOrbHandoff && !usesEarningsHandoff ? (
          <WorkerV5PrimaryActionButton
            disabled={primaryAction.disabled}
            label={primaryAction.label}
            onPress={primaryAction.onPress}
            variant={usesHandoffStage ? 'source' : 'default'}
          />
        ) : null}

        {screen.id === '5.1-profile-overview' ? (
          <KaelButton
            backgroundLayer={!glass.reduceTransparency ? <WorkerV5EarningsHomeListAura testID="worker-v5-profile-sign-out-mint-aura" /> : null}
            label={textByLanguage(language, 'Đăng xuất', 'Sign out')}
            onPress={() => void signOut()}
            showPrimaryGradient={false}
            style={[styles.workerProfileLogoutCta, styles.workerProfileAuraButton]}
            testID="worker-v5-profile-sign-out"
            variant="secondary"
          />
        ) : null}

        {usesHandoffStage ? null : <AuthorityCard screen={screen} language={language} />}

        {usesHandoffStage ? null : (
          <View style={styles.navigationRow}>
            <WorkerV5NavButton
              disabled={!previousScreen}
              label={language === 'vi' ? 'Trước' : 'Previous'}
              onPress={() => openScreen(previousScreen)}
            />
            <WorkerV5NavButton
              disabled={!nextScreen}
              label={nextScreen ? (language === 'vi' ? 'Tiếp tục' : 'Continue') : (language === 'vi' ? 'Chưa có bước tiếp' : 'No next step yet')}
              onPress={() => openScreen(nextScreen)}
              primary
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function WorkerV5HomeScreenSurface({
  glass,
  language,
  minHeight,
  openScreen,
  runtime,
  surfaceStyle,
}: {
  glass: ReturnType<typeof useGlassAccessibility>
  language: AppLanguage
  minHeight: number
  openScreen: (target: WorkerV5ScreenDefinition | null) => void
  runtime: WorkerV5Runtime
  surfaceStyle: StyleProp<ViewStyle>
}) {
  const profile = runtime.workerProfile
  const deal = runtime.state.deal
  const earnings = runtime.workerEarnings
  const insights = runtime.workerPerformanceInsights
  const displayName = workerV5HomeDisplayName(profile, language)
  const score = typeof insights?.performance_score === 'number' && Number.isFinite(insights.performance_score)
    ? Math.max(0, Math.min(100, Math.round(insights.performance_score)))
    : null
  const scoreRingRadius = 36
  const scoreCircumference = 2 * Math.PI * scoreRingRadius
  const scoreStroke = score == null ? 0 : (score / 100) * scoreCircumference
  const pendingSettlementCount = earnings?.pending_payment_count && earnings.pending_payment_count > 0
    ? String(earnings.pending_payment_count)
    : earnings?.pending_payment_amount && earnings.pending_payment_amount > 0
      ? '1'
      : textByLanguage(language, 'Chưa có', 'None')
  const stats = [
    {
      label: textByLanguage(language, 'Cơ hội mới', 'New opportunities'),
      value: deal?.broadcast ? '1' : textByLanguage(language, 'Chưa có', 'None'),
    },
    {
      label: textByLanguage(language, 'Việc đang chạy', 'Active work'),
      value: deal ? '1' : textByLanguage(language, 'Chưa có', 'None'),
    },
    {
      label: textByLanguage(language, 'Chờ đối soát', 'Settlement'),
      value: pendingSettlementCount,
    },
  ]
  const quickActions = [
    {
      icon: 'jobs' as const,
      meta: deal?.broadcast ? textByLanguage(language, '1 cơ hội đã lọc', '1 filtered opportunity') : textByLanguage(language, 'Chưa có cơ hội thật', 'No real opportunity'),
      targetId: '2.1-opportunity-inbox' as const,
      title: textByLanguage(language, 'Nhận việc ngay', 'Open work'),
    },
    {
      icon: 'map' as const,
      meta: profile?.districts?.length
        ? textByLanguage(language, `${profile.districts.length} khu vực phục vụ`, `${profile.districts.length} service areas`)
        : textByLanguage(language, 'Chưa có khu vực', 'No area'),
      targetId: '1.3-demand-map' as const,
      title: textByLanguage(language, 'Bản đồ cơ hội', 'Opportunity map'),
    },
    {
      icon: 'calendar' as const,
      meta: deal?.broadcast ? textByLanguage(language, 'Dựa trên cơ hội thật', 'From real opportunities') : textByLanguage(language, 'Cần cơ hội thật', 'Needs real data'),
      targetId: '1.4-smart-schedule' as const,
      title: textByLanguage(language, 'Tối ưu việc làm', 'Work optimization'),
    },
    {
      icon: 'calendar' as const,
      meta: deal?.displayCode ?? deal?.id ?? textByLanguage(language, 'Chưa có việc', 'No work'),
      targetId: '2.7-in-progress' as const,
      title: textByLanguage(language, 'Việc đang chạy', 'Active work'),
    },
  ]
  const broadcast = deal?.broadcast ?? null
  const workerBriefLines = broadcast ? localizedWorkerBriefLines(broadcast.prebrief, language) : []
  const fullAddressLabel = broadcast?.fullAddressVisible ? broadcast.fullAddressLabel ?? null : null
  const canRevealFullAddress = Boolean(deal?.broadcast?.fullAddressVisible && deal.broadcast.fullAddressLabel && deal && canShowWorkerAddress(deal))
  const generalAreaLabel = broadcast?.generalArea || deal?.draft.districtLabel || textByLanguage(language, 'Khu vực đang ẩn', 'Area hidden')
  const priceEstimateLabel = broadcast?.estimatedPriceLabel ?? textByLanguage(language, 'Chờ Kael ước tính', 'Waiting for Kael estimate')
  const earningEstimateLabel = broadcast?.estimatedEarningLabel ?? textByLanguage(language, 'Chờ Kael tính tiền công', 'Waiting for Kael earning')
  const priceDisclaimer = textByLanguage(
    language,
    LOCAL_WORKFLOW_PRICE_DISCLAIMER,
    "This is Kael's estimate from current job data. Kael may update it when new scope evidence is added.",
  )
  const kaelTitle = textByLanguage(language, 'Kael đã chuẩn bị việc phù hợp', 'Kael prepared matching work')
  const kaelBody = workerBriefLines[0]
    ?? (deal
      ? buildDealSummary(deal, language)
      : textByLanguage(language, 'Khi có cơ hội thật, Kael sẽ tóm tắt phạm vi, khu vực và lịch trước khi bạn quyết định.', 'When real work arrives, Kael summarizes scope, area, and schedule before your decision.'))

  return (
    <SafeAreaView style={[styles.safeArea, surfaceStyle]} testID="worker-v5-screen-1.1-worker-home">
      {!glass.reduceTransparency ? <WorkerV5HomeAuraBackground /> : null}
      <ScrollView
        bounces={false}
        contentContainerStyle={[styles.homeSourceScrollContent, { minHeight }]}
        showsVerticalScrollIndicator={false}
        style={styles.homeSourceScroll}
        testID="worker-v5-scroll"
      >
        <View style={styles.homeSourceHeader}>
          <View style={styles.homeSourceAvatarTile}>
            {!glass.reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
            <Image source={workerV5AvatarIcon} style={styles.homeSourceAvatarImage} />
          </View>
          <View style={styles.homeSourceHeaderCopy}>
            <Text style={styles.homeSourceTitle} numberOfLines={2}>
              {textByLanguage(language, `Chào buổi sáng, ${displayName}!`, `Good morning, ${displayName}!`)}
            </Text>
            <Text style={styles.homeSourceSubtitle} numberOfLines={2}>
              {deal
                ? textByLanguage(language, 'Kael đã đồng bộ lịch, khu vực và việc đang chạy', 'Kael synced schedule, area, and active work')
                : textByLanguage(language, 'Kael đã đồng bộ hồ sơ và khu vực nhận việc', 'Kael synced profile and service area')}
            </Text>
          </View>
          <Pressable
            accessibilityLabel={textByLanguage(language, 'Thông báo worker', 'Worker notifications')}
            style={({ pressed }) => [styles.homeSourceHeaderAction, pressed && !glass.reduceMotion ? styles.pressed : null]}
            testID="worker-v5-home-notifications"
          >
            <Text style={styles.homeSourceHeaderActionText}>•</Text>
          </Pressable>
        </View>

        <WorkerV5AvailabilityCard
          language={language}
          onToggleAvailability={runtime.actions.workerUpdateAvailability}
          profile={profile}
          reduceMotion={glass.reduceMotion}
          reduceTransparency={glass.reduceTransparency}
        />

        <View style={[styles.homeCommandCard, glass.reduceTransparency && styles.opaqueCard]} testID="worker-v5-home-command-center">
          {!glass.reduceTransparency ? <WorkerV5HomeHeroSourceAura /> : null}
          <View style={styles.homeCommandTopRow}>
            <View style={styles.homeCommandCopy}>
              <Text style={styles.homeCommandTitle}>{textByLanguage(language, 'Giải quyết công việc hôm nay', 'Today work resolution')}</Text>
              <Text style={styles.homeCommandBody}>
                {textByLanguage(language, 'Kael đề xuất; bạn luôn là người nhận hoặc từ chối việc.', 'Kael suggests; you always accept or decline work.')}
              </Text>
            </View>
            <View style={styles.homeScoreShell} testID="worker-v5-home-score-ring">
              <Svg height={92} width={92} viewBox="0 0 92 92">
                <Defs>
                  <LinearGradient id="worker-v5-home-score-gradient" x1="0" x2="1" y1="0" y2="1">
                    <Stop offset="0" stopColor="#48DCC9" />
                    <Stop offset="1" stopColor="#078D7D" />
                  </LinearGradient>
                </Defs>
                <Circle cx="46" cy="46" fill="rgba(255,255,255,0.72)" r="38" />
                <Circle cx="46" cy="46" fill="none" r={scoreRingRadius} stroke="rgba(184,231,223,0.55)" strokeWidth="8" />
                <Circle
                  cx="46"
                  cy="46"
                  fill="none"
                  r={scoreRingRadius}
                  stroke="url(#worker-v5-home-score-gradient)"
                  strokeDasharray={`${scoreStroke} ${scoreCircumference}`}
                  strokeLinecap="round"
                  strokeWidth="8"
                  transform="rotate(-90 46 46)"
                />
              </Svg>
              <View style={styles.homeScoreText}>
                <Text style={styles.homeScoreValue}>{score ?? '—'}</Text>
                <Text style={styles.homeScoreLabel} numberOfLines={2}>{score != null ? textByLanguage(language, 'Tỷ lệ hoàn tất', 'Completion') : textByLanguage(language, 'Chờ dữ liệu', 'No data')}</Text>
              </View>
            </View>
          </View>
          <View style={styles.homeStatGrid}>
            {stats.map((item) => (
              <View key={item.label} style={styles.homeStatTile} testID={`worker-v5-home-stat-${item.label}`}>
                <Text style={styles.homeStatValue} numberOfLines={1}>{item.value}</Text>
                <Text style={styles.homeStatLabel} numberOfLines={2}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {deal ? (
          <View style={styles.workerHomeKaelStack} testID="worker-kael-brief">
            <WorkerV5KaelBriefCard
              body={kaelBody}
              icon="chat"
              reduceTransparency={glass.reduceTransparency}
              source={workerV5KaelHeadIcon}
              title={kaelTitle}
            />
            {workerBriefLines.slice(1, 3).map((line) => (
              <Text key={line} style={styles.workerHomeKaelBriefLine}>{line}</Text>
            ))}
            <View style={[styles.workerHomeKaelContext, glass.reduceTransparency && styles.opaqueCard]}>
              <View style={styles.workerHomeKaelStatusRow}>
                <Text style={styles.workerHomeKaelStatusText} testID="worker-request-kael-analyzing">
                  {textByLanguage(language, 'Kael đang phân tích hồ sơ việc', 'Kael is analyzing this work')}
                </Text>
                <Text style={styles.workerHomeKaelRiskStatus} testID="worker-v5-safety-risk-status-0">
                  {textByLanguage(language, 'Kael', 'Kael')}
                </Text>
              </View>
              <View style={styles.workerHomeKaelMetricGrid}>
                <View style={styles.workerHomeKaelMetric}>
                  <Text style={styles.workerHomeKaelMetricLabel}>{textByLanguage(language, 'Ước tính khách', 'Customer estimate')}</Text>
                  <Text style={styles.workerHomeKaelMetricValue}>{priceEstimateLabel}</Text>
                </View>
                <View style={styles.workerHomeKaelMetric}>
                  <Text style={styles.workerHomeKaelMetricLabel}>{textByLanguage(language, 'Tiền công', 'Earning')}</Text>
                  <Text style={styles.workerHomeKaelMetricValue}>{earningEstimateLabel}</Text>
                </View>
              </View>
              <Text style={styles.workerHomeKaelDisclaimer} testID="worker-request-price-disclaimer">
                {priceDisclaimer}
              </Text>
              {canRevealFullAddress ? (
                <Text style={styles.workerHomeKaelAddress} testID="worker-full-address-after-accept">
                  {fullAddressLabel}
                </Text>
              ) : (
                <Text style={styles.workerHomeKaelAddress} testID="worker-general-area-before-accept">
                  {generalAreaLabel}
                </Text>
              )}
            </View>
          </View>
        ) : null}

        <WorkerV5SectionHeader
          action={textByLanguage(language, 'Được cá nhân hóa', 'Personalized')}
          title={textByLanguage(language, 'Hành động nhanh', 'Quick actions')}
        />
        <View style={styles.homeQuickAuraFrame}>
          {!glass.reduceTransparency ? <WorkerV5HomeQuickActionsAura /> : null}
          <WorkerV5HomeQuickActionGrid
            items={quickActions}
            onOpen={(id) => openScreen(getWorkerV5Screen(id))}
            reduceMotion={glass.reduceMotion}
            reduceTransparency={glass.reduceTransparency}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function WorkerV5HomeAuraBackground() {
  return (
    <View pointerEvents="none" style={styles.homeAuraBackground} testID="worker-v5-page-mint-aura">
      <Svg
        height="100%"
        preserveAspectRatio="none"
        testID="worker-v5-home-background-mint-aura"
        viewBox="0 0 390 844"
        width="100%"
      >
        <Defs>
          <LinearGradient id="workerV5HomeCanvasBase" x1="0" x2="0" y1="0" y2="1">
            <Stop offset="0" stopColor="#F9FFFD" />
            <Stop offset="0.42" stopColor="#F3FBF9" />
            <Stop offset="1" stopColor="#EDF9F6" />
          </LinearGradient>
          <RadialGradient id="workerV5HomeCanvasTopRight" cx="102%" cy="-4%" r="74%">
            <Stop offset="0" stopColor="rgba(80,232,210,0.34)" />
            <Stop offset="0.58" stopColor="rgba(151,246,232,0.12)" />
            <Stop offset="0.74" stopColor="rgba(151,246,232,0)" />
          </RadialGradient>
          <RadialGradient id="workerV5HomeCanvasLeft" cx="-18%" cy="38%" r="72%">
            <Stop offset="0" stopColor="rgba(136,241,223,0.22)" />
            <Stop offset="0.72" stopColor="rgba(136,241,223,0)" />
          </RadialGradient>
          <RadialGradient id="workerV5HomeCanvasMidRight" cx="104%" cy="74%" r="72%">
            <Stop offset="0" stopColor="rgba(83,220,206,0.24)" />
            <Stop offset="0.72" stopColor="rgba(83,220,206,0)" />
          </RadialGradient>
          <RadialGradient id="workerV5HomeCanvasBottomLeft" cx="14%" cy="104%" r="73%">
            <Stop offset="0" stopColor="rgba(145,232,222,0.23)" />
            <Stop offset="0.73" stopColor="rgba(145,232,222,0)" />
          </RadialGradient>
          <RadialGradient id="workerV5HomeCanvasSoftTop" cx="16%" cy="14%" r="42%">
            <Stop offset="0" stopColor="rgba(89,232,207,0.20)" />
            <Stop offset="0.72" stopColor="rgba(89,232,207,0)" />
          </RadialGradient>
          <RadialGradient id="workerV5HomeCanvasSoftMiddle" cx="82%" cy="49%" r="46%">
            <Stop offset="0" stopColor="rgba(122,243,223,0.18)" />
            <Stop offset="0.72" stopColor="rgba(122,243,223,0)" />
          </RadialGradient>
          <RadialGradient id="workerV5HomeCanvasSoftBottom" cx="25%" cy="82%" r="48%">
            <Stop offset="0" stopColor="rgba(81,216,203,0.15)" />
            <Stop offset="0.75" stopColor="rgba(81,216,203,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#workerV5HomeCanvasBase)" height="844" width="390" />
        <Rect fill="url(#workerV5HomeCanvasTopRight)" height="844" width="390" />
        <Rect fill="url(#workerV5HomeCanvasLeft)" height="844" width="390" />
        <Rect fill="url(#workerV5HomeCanvasMidRight)" height="844" width="390" />
        <Rect fill="url(#workerV5HomeCanvasBottomLeft)" height="844" width="390" />
        <Rect fill="url(#workerV5HomeCanvasSoftTop)" height="844" width="390" />
        <Rect fill="url(#workerV5HomeCanvasSoftMiddle)" height="844" width="390" />
        <Rect fill="url(#workerV5HomeCanvasSoftBottom)" height="844" width="390" />
      </Svg>
    </View>
  )
}

function WorkerV5HomeHeroSourceAura() {
  return (
    <View pointerEvents="none" style={styles.homeCommandAura} testID="worker-v5-hero-mint-aura">
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 360 220" width="100%">
        <Defs>
          <RadialGradient id="workerV5HomeHeroSourceAuraFill" cx="84%" cy="18%" r="70%">
            <Stop offset="0" stopColor="rgba(73,231,207,0.42)" />
            <Stop offset="0.46" stopColor="rgba(149,246,229,0.16)" />
            <Stop offset="0.78" stopColor="rgba(149,246,229,0)" />
          </RadialGradient>
          <RadialGradient id="workerV5HomeHeroSourceAuraLeft" cx="10%" cy="92%" r="66%">
            <Stop offset="0" stopColor="rgba(83,220,206,0.24)" />
            <Stop offset="0.72" stopColor="rgba(83,220,206,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#workerV5HomeHeroSourceAuraFill)" height="220" width="360" />
        <Rect fill="url(#workerV5HomeHeroSourceAuraLeft)" height="220" width="360" />
      </Svg>
    </View>
  )
}

function WorkerV5HomeQuickActionsAura() {
  return (
    <View pointerEvents="none" style={styles.homeListMintAura} testID="worker-v5-list-mint-aura">
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 360 220" width="100%">
        <Defs>
          <RadialGradient id="workerV5HomeQuickAuraRight" cx="86%" cy="8%" r="64%">
            <Stop offset="0" stopColor="rgba(80,232,210,0.28)" />
            <Stop offset="0.62" stopColor="rgba(151,246,232,0.12)" />
            <Stop offset="0.84" stopColor="rgba(151,246,232,0)" />
          </RadialGradient>
          <RadialGradient id="workerV5HomeQuickAuraLeft" cx="8%" cy="92%" r="58%">
            <Stop offset="0" stopColor="rgba(81,216,203,0.22)" />
            <Stop offset="0.74" stopColor="rgba(81,216,203,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#workerV5HomeQuickAuraRight)" height="220" width="360" />
        <Rect fill="url(#workerV5HomeQuickAuraLeft)" height="220" width="360" />
      </Svg>
    </View>
  )
}

function WorkerV5EarningsHomeAuraBackground() {
  return (
    <View pointerEvents="none" style={styles.homeAuraBackground} testID="worker-v5-earnings-page-customer-mint-aura">
      <Svg
        height="100%"
        preserveAspectRatio="none"
        testID="worker-v5-earnings-background-home-formula-aura"
        viewBox="0 0 390 844"
        width="100%"
      >
        <Defs>
          <LinearGradient id="workerV5EarningsCanvasBase" x1="0" x2="0" y1="0" y2="1">
            <Stop offset="0" stopColor="#F9FFFD" />
            <Stop offset="0.42" stopColor="#F3FBF9" />
            <Stop offset="1" stopColor="#EDF9F6" />
          </LinearGradient>
          <RadialGradient id="workerV5EarningsCanvasTopRight" cx="102%" cy="-4%" r="74%">
            <Stop offset="0" stopColor="rgba(80,232,210,0.34)" />
            <Stop offset="0.58" stopColor="rgba(151,246,232,0.12)" />
            <Stop offset="0.74" stopColor="rgba(151,246,232,0)" />
          </RadialGradient>
          <RadialGradient id="workerV5EarningsCanvasLeft" cx="-18%" cy="38%" r="72%">
            <Stop offset="0" stopColor="rgba(136,241,223,0.22)" />
            <Stop offset="0.72" stopColor="rgba(136,241,223,0)" />
          </RadialGradient>
          <RadialGradient id="workerV5EarningsCanvasMidRight" cx="104%" cy="74%" r="72%">
            <Stop offset="0" stopColor="rgba(83,220,206,0.24)" />
            <Stop offset="0.72" stopColor="rgba(83,220,206,0)" />
          </RadialGradient>
          <RadialGradient id="workerV5EarningsCanvasBottomLeft" cx="14%" cy="104%" r="73%">
            <Stop offset="0" stopColor="rgba(145,232,222,0.23)" />
            <Stop offset="0.73" stopColor="rgba(145,232,222,0)" />
          </RadialGradient>
          <RadialGradient id="workerV5EarningsCanvasSoftTop" cx="16%" cy="14%" r="42%">
            <Stop offset="0" stopColor="rgba(89,232,207,0.20)" />
            <Stop offset="0.72" stopColor="rgba(89,232,207,0)" />
          </RadialGradient>
          <RadialGradient id="workerV5EarningsCanvasSoftMiddle" cx="82%" cy="49%" r="46%">
            <Stop offset="0" stopColor="rgba(122,243,223,0.18)" />
            <Stop offset="0.72" stopColor="rgba(122,243,223,0)" />
          </RadialGradient>
          <RadialGradient id="workerV5EarningsCanvasSoftBottom" cx="25%" cy="82%" r="48%">
            <Stop offset="0" stopColor="rgba(81,216,203,0.15)" />
            <Stop offset="0.75" stopColor="rgba(81,216,203,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#workerV5EarningsCanvasBase)" height="844" width="390" />
        <Rect fill="url(#workerV5EarningsCanvasTopRight)" height="844" width="390" />
        <Rect fill="url(#workerV5EarningsCanvasLeft)" height="844" width="390" />
        <Rect fill="url(#workerV5EarningsCanvasMidRight)" height="844" width="390" />
        <Rect fill="url(#workerV5EarningsCanvasBottomLeft)" height="844" width="390" />
        <Rect fill="url(#workerV5EarningsCanvasSoftTop)" height="844" width="390" />
        <Rect fill="url(#workerV5EarningsCanvasSoftMiddle)" height="844" width="390" />
        <Rect fill="url(#workerV5EarningsCanvasSoftBottom)" height="844" width="390" />
      </Svg>
    </View>
  )
}

function WorkerV5EarningsHomeHeroAura({ testID }: { testID: string }) {
  return (
    <View pointerEvents="none" style={styles.homeCommandAura} testID={testID}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 360 220" width="100%">
        <Defs>
          <RadialGradient id="workerV5EarningsHeroHomeAuraFill" cx="84%" cy="18%" r="70%">
            <Stop offset="0" stopColor="rgba(73,231,207,0.42)" />
            <Stop offset="0.46" stopColor="rgba(149,246,229,0.16)" />
            <Stop offset="0.78" stopColor="rgba(149,246,229,0)" />
          </RadialGradient>
          <RadialGradient id="workerV5EarningsHeroHomeAuraLeft" cx="10%" cy="92%" r="66%">
            <Stop offset="0" stopColor="rgba(83,220,206,0.24)" />
            <Stop offset="0.72" stopColor="rgba(83,220,206,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#workerV5EarningsHeroHomeAuraFill)" height="220" width="360" />
        <Rect fill="url(#workerV5EarningsHeroHomeAuraLeft)" height="220" width="360" />
      </Svg>
    </View>
  )
}

function WorkerV5EarningsHomeListAura({ testID }: { testID: string }) {
  return (
    <View pointerEvents="none" style={styles.homeListMintAura} testID={testID}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 360 220" width="100%">
        <Defs>
          <RadialGradient id="workerV5EarningsHomeListAuraRight" cx="86%" cy="8%" r="64%">
            <Stop offset="0" stopColor="rgba(80,232,210,0.28)" />
            <Stop offset="0.62" stopColor="rgba(151,246,232,0.12)" />
            <Stop offset="0.84" stopColor="rgba(151,246,232,0)" />
          </RadialGradient>
          <RadialGradient id="workerV5EarningsHomeListAuraLeft" cx="8%" cy="92%" r="58%">
            <Stop offset="0" stopColor="rgba(81,216,203,0.22)" />
            <Stop offset="0.74" stopColor="rgba(81,216,203,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#workerV5EarningsHomeListAuraRight)" height="220" width="360" />
        <Rect fill="url(#workerV5EarningsHomeListAuraLeft)" height="220" width="360" />
      </Svg>
    </View>
  )
}

function WorkerV5HomeQuickCardAura({ testID }: { testID: string }) {
  return (
    <View pointerEvents="none" style={styles.homeQuickCardAura} testID={testID}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 170 76" width="100%">
        <Defs>
          <RadialGradient id={`${testID}-corner`} cx="88%" cy="8%" r="62%">
            <Stop offset="0" stopColor="rgba(88,232,211,0.34)" />
            <Stop offset="0.48" stopColor="rgba(153,246,232,0.12)" />
            <Stop offset="0.82" stopColor="rgba(153,246,232,0)" />
          </RadialGradient>
          <RadialGradient id={`${testID}-base`} cx="18%" cy="88%" r="72%">
            <Stop offset="0" stopColor="rgba(116,230,216,0.18)" />
            <Stop offset="0.72" stopColor="rgba(116,230,216,0)" />
          </RadialGradient>
          <LinearGradient id={`${testID}-edge`} x1="0" x2="1" y1="0" y2="1">
            <Stop offset="0" stopColor="rgba(255,255,255,0.58)" />
            <Stop offset="0.46" stopColor="rgba(122,238,224,0.16)" />
            <Stop offset="1" stopColor="rgba(255,255,255,0)" />
          </LinearGradient>
        </Defs>
        <Rect fill={`url(#${testID}-corner)`} height="76" width="170" />
        <Rect fill={`url(#${testID}-base)`} height="76" width="170" />
        <Rect fill={`url(#${testID}-edge)`} height="76" width="170" />
      </Svg>
    </View>
  )
}

function renderWorkerV5Body(
  screen: WorkerV5ScreenDefinition,
  runtime: WorkerV5Runtime,
  language: AppLanguage,
  reduceMotion: boolean,
  reduceTransparency: boolean,
  navigateNext: () => void,
  navigatePrevious: () => void,
  navigateToScreen: (id: WorkerV5ScreenId) => void,
  runWorkerAction: (action: () => Promise<boolean>) => void | Promise<void>,
  navigateJobChat: () => void,
  actionBusy: boolean,
) {
  switch (screen.id) {
    case '1.1-worker-home':
      return <WorkerV5HomeBody language={language} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '1.2-shift-brief':
      return <WorkerV5ShiftBriefBody language={language} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '1.3-demand-map':
      return <WorkerV5DemandMapBody language={language} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '1.4-smart-schedule':
      return (
        <WorkerV5ScheduleBody
          language={language}
          onCustomize={navigatePrevious}
          onUseSchedule={navigateNext}
          reduceTransparency={reduceTransparency}
          runtime={runtime}
        />
      )
    case '2.1-opportunity-inbox':
      return <WorkerV5OpportunityInboxBody language={language} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '2.2-offer-detail':
      return <WorkerV5OfferDetailBody language={language} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '2.3-accept-review':
      return <WorkerV5AcceptReviewBody language={language} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '2.4-route-eta':
      return (
        <WorkerV5RouteEtaBody
          actionBusy={actionBusy}
          language={language}
          navigateJobChat={navigateJobChat}
          navigateNext={navigateNext}
          reduceTransparency={reduceTransparency}
          runtime={runtime}
        />
      )
    case '2.5-arrival-checkin':
      return (
        <WorkerV5ArrivalCheckInBody
          actionBusy={actionBusy}
          language={language}
          navigateJobChat={navigateJobChat}
          navigateNext={navigateNext}
          reduceTransparency={reduceTransparency}
          runtime={runtime}
        />
      )
    case '2.7-in-progress':
      return (
        <WorkerV5InProgressBody
          language={language}
          navigateJobChat={navigateJobChat}
          reduceTransparency={reduceTransparency}
          runtime={runtime}
        />
      )
    case '2.8-scope-change':
      return <WorkerV5ScopeChangeBody language={language} navigateNext={navigateNext} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '2.9-approval-wait':
      return (
        <WorkerV5ApprovalWaitBody
          language={language}
          navigateJobChat={navigateJobChat}
          navigateNext={navigateNext}
          reduceTransparency={reduceTransparency}
          runtime={runtime}
        />
      )
    case '2.10-completion-evidence':
      return (
        <WorkerV5CompletionEvidenceBody
          language={language}
          navigateNext={navigateNext}
          reduceTransparency={reduceTransparency}
          runtime={runtime}
        />
      )
    case '2.11-completion-submitted':
      return (
        <WorkerV5CompletionSubmittedBody
          language={language}
          navigateNext={navigateNext}
          navigateToEvidence={() => navigateToScreen('2.10-completion-evidence')}
          reduceTransparency={reduceTransparency}
          runtime={runtime}
        />
      )
    case '2.12-case-closed':
      return (
        <WorkerV5CaseClosedBody
          language={language}
          navigateToEarnings={() => navigateToScreen('4.1-earnings-overview')}
          navigateToRanking={() => navigateToScreen('5.2-worker-ranking')}
          reduceTransparency={reduceTransparency}
          runtime={runtime}
        />
      )
    case '3.1-kael-chat-normal':
      return <WorkerV5KaelChatBody language={language} navigateToScreen={navigateToScreen} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '3.2-kael-job-intake':
      return <WorkerV5KaelJobIntakeBody language={language} navigateToScreen={navigateToScreen} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '4.1-earnings-overview':
      return <WorkerV5EarningsOverviewBody language={language} navigateToScreen={navigateToScreen} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '4.2-ledger-detail':
      return <WorkerV5LedgerDetailBody language={language} navigateToScreen={navigateToScreen} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '4.3-payout-request':
      return <WorkerV5PayoutRequestBody language={language} navigateToScreen={navigateToScreen} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '4.4-payout-method':
      return <WorkerV5PayoutMethodBody language={language} navigateToScreen={navigateToScreen} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '5.1-profile-overview':
      return <WorkerV5ProfileOverviewBody language={language} navigateToScreen={navigateToScreen} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '5.2-worker-ranking':
      return <WorkerV5WorkerRankingBody language={language} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '5.3-skills-service-area':
      return <WorkerV5SkillsServiceAreaBody language={language} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '5.4-reliability-insights':
      return <WorkerV5ReliabilityInsightsBody language={language} reduceMotion={reduceMotion} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '5.5-account-utilities':
      return <WorkerV5SettingsBody language={language} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '5.6-agent-memory-preferences':
      return <WorkerV5AgentMemoryBody language={language} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '5.7-verification-documents':
      return <WorkerV5VerificationDocumentsBody language={language} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '5.8-bank-tax-center':
      return <WorkerV5BankTaxBody language={language} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '5.9-reviews-feedback':
      return <WorkerV5ReviewsFeedbackBody language={language} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '5.10-support-settings':
      return <WorkerV5SupportSettingsBody language={language} reduceTransparency={reduceTransparency} runtime={runtime} />
    default:
      return null
  }
}

function WorkerV5HomeBody({
  language,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const profile = runtime.workerProfile
  const deal = runtime.state.deal
  const availability = profile?.is_suspended
    ? textByLanguage(language, 'Hồ sơ đang bị khóa', 'Profile suspended')
    : profile?.is_available && profile?.is_approved
      ? textByLanguage(language, 'Sẵn sàng nhận việc', 'Ready for work')
      : profile?.is_approved
        ? textByLanguage(language, 'Đang tắt nhận việc', 'Not accepting jobs')
        : textByLanguage(language, 'Cần hoàn tất hồ sơ', 'Profile needed')
  const pendingPayment = runtime.workerEarnings?.pending_payment_amount
  const pendingPaymentLabel = pendingPayment && pendingPayment > 0
    ? formatVnd(pendingPayment, language)
    : textByLanguage(language, 'Chưa có đối soát đang chờ', 'No pending settlement')
  const quickActions = [
    {
      icon: 'jobs' as const,
      meta: deal ? buildDealSummary(deal, language) : textByLanguage(language, 'Mở khi có cơ hội thật', 'Opens when a real broadcast exists'),
      title: textByLanguage(language, 'Nhận việc ngay', 'Open work'),
    },
    {
      icon: 'map' as const,
      meta: profile?.districts?.length
        ? profile.districts.map((district) => formatWorkerDistrict(district, language)).join(', ')
        : textByLanguage(language, 'Chưa có khu vực phục vụ', 'No service area'),
      title: textByLanguage(language, 'Bản đồ cơ hội', 'Opportunity map'),
    },
    {
      icon: 'calendar' as const,
      meta: textByLanguage(language, 'Kael cần dữ liệu thật trước khi xếp lịch', 'Kael needs real data before sequencing'),
        title: textByLanguage(language, 'Tối ưu việc làm', 'Work optimization'),
    },
    {
      icon: 'scope' as const,
      meta: deal ? deal.displayCode ?? deal.id : textByLanguage(language, 'Chưa có việc đang chạy', 'No active work'),
      title: textByLanguage(language, 'Việc đang chạy', 'Active work'),
    },
  ]

  return (
    <View style={styles.sectionStack}>
      <WorkerV5AvailabilityCard
        language={language}
        onToggleAvailability={runtime.actions.workerUpdateAvailability}
        profile={profile}
        reduceTransparency={reduceTransparency}
      />
      <View style={styles.metricsGrid}>
        <MetricTile label={textByLanguage(language, 'Trạng thái', 'Status')} value={availability} />
        <MetricTile
          label={textByLanguage(language, 'Việc đang chạy', 'Active work')}
          value={deal ? localizedStatusLabel(deal.status, language) : textByLanguage(language, 'Chưa có việc', 'No active work')}
        />
        <MetricTile label={textByLanguage(language, 'Đối soát', 'Settlement')} value={pendingPaymentLabel} />
      </View>
      <WorkerV5KaelBriefCard
        body={deal?.broadcast?.prebrief?.[0] ?? textByLanguage(language, 'Kael chỉ chuẩn bị gợi ý khi có lịch, khu vực hoặc việc thật để đối chiếu.', 'Kael prepares suggestions only from real schedule, area, or job data.')}
        icon="chat"
        reduceTransparency={reduceTransparency}
        title={deal ? textByLanguage(language, 'Kael đã chuẩn bị việc phù hợp', 'Kael prepared matching work') : textByLanguage(language, 'Kael đang chờ nguồn thật', 'Kael is waiting for real sources')}
      />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Được cá nhân hóa', 'Personalized')}
        title={textByLanguage(language, 'Hành động nhanh', 'Quick actions')}
      />
      <WorkerV5QuickActionGrid items={quickActions} reduceTransparency={reduceTransparency} />
      <InfoListCard reduceTransparency={reduceTransparency}>
        <WorkerV5InfoRow
          icon="jobs"
          label={textByLanguage(language, 'Nhận việc ngay', 'Open work')}
          value={deal ? buildDealSummary(deal, language) : textByLanguage(language, 'Hộp cơ hội sẽ mở khi có cơ hội thật', 'Inbox opens when a real broadcast exists')}
        />
        <WorkerV5InfoRow
          icon="map"
          label={textByLanguage(language, 'Bản đồ cơ hội', 'Opportunity map')}
          value={profile?.districts?.length ? profile.districts.join(', ') : textByLanguage(language, 'Chưa có khu vực phục vụ', 'No service area yet')}
        />
        <WorkerV5InfoRow
          icon="calendar"
          label={textByLanguage(language, 'Tối ưu việc làm', 'Work optimization')}
          value={textByLanguage(language, 'Chờ đề xuất khi có danh sách cơ hội thật', 'Suggestions require real opportunities')}
        />
      </InfoListCard>
    </View>
  )
}

function WorkerV5ShiftBriefBody({
  language,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const profile = runtime.workerProfile
  const deal = runtime.state.deal
  const summaryCopy = buildWorkerV5ShiftSummaryCopy(profile, deal, language)
  const demandRow = buildWorkerV5ShiftDemandRow(profile, deal, language)
  const missionRows = buildWorkerV5ClientMissionRows(deal, language)

  return (
    <View style={styles.sectionStack}>
      <WorkerV5ShiftSummaryCard
        icon="calendar"
        meta={summaryCopy.meta}
        reduceTransparency={reduceTransparency}
        title={summaryCopy.title}
      />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Kael tổng hợp', 'Kael summary')}
        title={textByLanguage(language, 'CẢNH BÁO & NHU CẦU', 'ALERTS AND DEMAND')}
      />
      <WorkerV5SourceRowList
        auraTestID="worker-v5-shift-demand-mint-aura"
        scope="ShiftDemand"
        reduceTransparency={reduceTransparency}
        rows={[
          demandRow,
          {
            icon: 'shield',
            meta: textByLanguage(language, 'Chỉ check-in khi có mặt tại điểm hẹn hoặc có bằng chứng thủ công', 'Check in only on site or with manual evidence'),
            status: textByLanguage(language, 'Bắt buộc', 'Required'),
            title: textByLanguage(language, 'Nhắc quy trình check-in', 'Check-in protocol'),
          },
        ]}
        testID="worker-v5-shift-demand-list"
        variant="shift"
      />
      <WorkerV5SectionHeader
        action={deal ? textByLanguage(language, 'Theo việc thật', 'From real work') : textByLanguage(language, 'Chờ nhiệm vụ', 'Waiting mission')}
        title={textByLanguage(language, 'NHIỆM VỤ TỪ KHÁCH', 'CLIENT MISSIONS')}
      />
      <WorkerV5SourceRowList
        auraTestID="worker-v5-shift-priority-mint-aura"
        scope="ShiftPriority"
        reduceTransparency={reduceTransparency}
        rows={missionRows}
        testID="worker-v5-shift-priority-list"
        variant="shift"
      />
    </View>
  )
}

function WorkerV5DemandMapBody({
  language,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const deal = runtime.state.deal
  const profile = runtime.workerProfile
  const districts = profile?.districts?.length ? profile.districts : []
  const profileLocation = typeof profile?.home_lat === 'number' &&
    Number.isFinite(profile.home_lat) &&
    typeof profile.home_lng === 'number' &&
    Number.isFinite(profile.home_lng)
    ? { lat: profile.home_lat, lng: profile.home_lng, provider: 'vietmap' as const }
    : null
  const [searchValue, setSearchValue] = useState('')
  const [searchPending, setSearchPending] = useState(false)
  const [searchFallback, setSearchFallback] = useState(false)
  const [suggestions, setSuggestions] = useState<WorkerV5PlaceSuggestion[]>([])
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null)
  const [selectedLocation, setSelectedLocation] = useState<WorkerV5MapLocation | null>(null)
  const resolveRequestRef = useRef(0)
  const activeMapLocation = selectedLocation ?? profileLocation
  const priorityAreas = districts.length
    ? districts.map((district) => formatWorkerDistrict(district, language)).join(', ')
    : textByLanguage(language, 'Thiết lập trong hồ sơ thợ', 'Set this in the worker profile')

  useEffect(() => {
    const trimmed = searchValue.trim()
    if (trimmed.length < 2) {
      setSearchPending(false)
      setSearchFallback(false)
      setSuggestions([])
      return
    }

    let cancelled = false
    setSearchPending(true)
    const timer = setTimeout(() => {
      void placesService.autocomplete({ input: trimmed }).then((result) => {
        if (cancelled) return
        if (!result.success) {
          setSearchFallback(true)
          setSuggestions([])
          return
        }
        setSearchFallback(result.data.fallback_used)
        setSuggestions(result.data.suggestions)
      }).finally(() => {
        if (!cancelled) setSearchPending(false)
      })
    }, 260)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [searchValue])

  const selectSuggestion = (suggestion: WorkerV5PlaceSuggestion) => {
    const requestId = resolveRequestRef.current + 1
    resolveRequestRef.current = requestId
    setSearchValue(suggestion.label)
    setSelectedLabel(suggestion.label)
    setSuggestions([])
    setSearchFallback(false)
    setSearchPending(true)
    void placesService.resolve({ label: suggestion.label, place_id: suggestion.place_id }).then((result) => {
      if (resolveRequestRef.current !== requestId) return
      if (result.success && result.data.location && result.data.provider !== 'fallback') {
        setSelectedLocation({
          lat: result.data.location.lat,
          lng: result.data.location.lng,
          provider: result.data.provider,
        })
        setSearchFallback(result.data.fallback_used)
        return
      }
      setSelectedLocation(null)
      setSearchFallback(true)
    }).finally(() => {
      if (resolveRequestRef.current === requestId) setSearchPending(false)
    })
  }

  return (
    <View style={styles.sectionStack}>
      <WorkerV5SearchPill
        fallbackUsed={searchFallback}
        language={language}
        onChangeText={setSearchValue}
        onSelectSuggestion={selectSuggestion}
        pending={searchPending}
        placeholder={textByLanguage(language, 'Tìm khu vực, địa chỉ hoặc loại việc...', 'Search area, address, or job type...')}
        reduceTransparency={reduceTransparency}
        suggestions={suggestions}
        value={searchValue}
      />
      <WorkerV5MapStage
        activeLocation={activeMapLocation}
        deal={deal}
        language={language}
        profile={profile}
        reduceTransparency={reduceTransparency}
        selectedLabel={selectedLabel}
        testID="worker-v5-demand-map-panel"
      />
      <WorkerV5SectionHeader
        action={deal ? textByLanguage(language, 'Cập nhật từ việc thật', 'Updated from real work') : textByLanguage(language, 'Chưa có tín hiệu', 'No signal yet')}
        title={textByLanguage(language, 'Vùng ưu tiên', 'Priority areas')}
      />
      <InfoListCard aura="demandMap" reduceTransparency={reduceTransparency}>
        {deal ? (
          <WorkerV5InfoRow icon="jobs" label={localizedServiceLabel(deal.draft.serviceType, language)} value={buildDealSummary(deal, language)} />
        ) : (
          <WorkerV5InfoRow icon="jobs" label={textByLanguage(language, 'Cơ hội thật', 'Real opportunities')} value={textByLanguage(language, 'Chưa có cơ hội phù hợp trong trạng thái hiện tại', 'No matching opportunity in the current state')} />
        )}
        <WorkerV5InfoRow
          icon="map"
          label={textByLanguage(language, 'Vùng ưu tiên', 'Priority areas')}
          value={priorityAreas}
        />
      </InfoListCard>
    </View>
  )
}

function WorkerV5ScheduleBody({
  language,
  onCustomize,
  onUseSchedule,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  onCustomize: () => void
  onUseSchedule: () => void
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const deal = runtime.state.deal
  const schedulePlan = buildWorkerV5SchedulePlan(deal, runtime.workerJobs, language)

  return (
    <View style={styles.sectionStack}>
      <WorkerV5ScheduleSummaryCard
        amount={schedulePlan.amount}
        lensLabel={schedulePlan.lensLabel}
        lensValue={schedulePlan.lensValue}
        meta={schedulePlan.meta}
        reduceTransparency={reduceTransparency}
      />
      <WorkerV5SectionHeader
        action={schedulePlan.actionLabel}
        title={textByLanguage(language, 'Lịch trình', 'Schedule')}
      />
      {schedulePlan.rows.length > 0 ? (
        <>
          <WorkerV5ScheduleList
            reduceTransparency={reduceTransparency}
            rows={schedulePlan.rows}
          />
          <WorkerV5KaelBriefCard
            auraScope="SmartScheduleKaelBrief"
            body={schedulePlan.kaelBody}
            icon="chat"
            reduceTransparency={reduceTransparency}
            title={schedulePlan.kaelTitle}
          />
        </>
      ) : (
        <WorkerV5ScheduleSupportAuraGroup reduceTransparency={reduceTransparency}>
          <WorkerV5ScheduleEmptyState language={language} reduceTransparency={reduceTransparency} />
          <WorkerV5KaelBriefCard
            auraScope="SmartScheduleKaelBrief"
            body={schedulePlan.kaelBody}
            icon="chat"
            reduceTransparency={reduceTransparency}
            title={schedulePlan.kaelTitle}
          />
        </WorkerV5ScheduleSupportAuraGroup>
      )}
      <WorkerV5ScheduleActionRow
        onCustomize={onCustomize}
        onUseSchedule={onUseSchedule}
        primary={textByLanguage(language, 'Dùng lịch này', 'Use this schedule')}
        reduceTransparency={reduceTransparency}
        secondary={textByLanguage(language, 'Tùy chỉnh', 'Customize')}
      />
    </View>
  )
}

function WorkerV5ScheduleSupportAuraGroup({
  children,
  reduceTransparency,
}: {
  children: ReactNode
  reduceTransparency: boolean
}) {
  return (
    <View style={styles.scheduleSupportAuraGroup} testID="worker-v5-schedule-support-aura-group">
      {!reduceTransparency ? (
        <>
          <WorkerV5CustomerCaseWideMintAura
            scope="SmartScheduleSupportGroup"
            style={styles.scheduleSupportAura}
            testID="worker-v5-schedule-support-mint-aura"
          />
          <WorkerV5CustomerZipMintAura
            scope="SmartScheduleSupportFine"
            style={styles.scheduleSupportZipAura}
            testID="worker-v5-schedule-support-zip-mint-aura"
          />
        </>
      ) : null}
      <View style={styles.scheduleSupportContent}>{children}</View>
    </View>
  )
}

type WorkerV5SchedulePlanRow = {
  aside: string
  meta: string
  time: string
  title: string
}

type WorkerV5SchedulePlan = {
  actionLabel: string
  amount: string
  kaelBody: string
  kaelTitle: string
  lensLabel: string
  lensValue: string
  meta: string
  rows: readonly WorkerV5SchedulePlanRow[]
}

function buildWorkerV5SchedulePlan(
  deal: LocalDeal | null,
  workerJobs: WorkerV5Runtime['workerJobs'],
  language: AppLanguage,
): WorkerV5SchedulePlan {
  const scheduleJobs = workerJobs
    .filter(isWorkerV5SchedulableJob)
    .slice()
    .sort(compareWorkerV5ScheduleJobs)

  if (scheduleJobs.length > 0) {
    const rows = scheduleJobs.map((job, index) => buildWorkerV5ScheduleRowFromJob(job, index, language))
    return {
      actionLabel: textByLanguage(language, 'Theo tín hiệu thật', 'Real signals'),
      amount: scheduleJobs.length === 1
        ? rows[0]?.aside ?? textByLanguage(language, '1 việc thật', '1 real task')
        : textByLanguage(language, `${scheduleJobs.length} việc đã nhận`, `${scheduleJobs.length} accepted tasks`),
      kaelBody: textByLanguage(
        language,
        'Kael ưu tiên việc đang mở, tín hiệu địa chỉ/khu vực đã có và thời điểm nhận. Khi hệ thống có thời gian di chuyển hoặc độ khó, thứ tự sẽ được tinh chỉnh tăng dần.',
        'Kael prioritizes open work, available address/area signals, and accepted time. When ETA or difficulty signals exist, the order will be refined upward.',
      ),
      kaelTitle: textByLanguage(language, 'Kael đã xếp việc thật', 'Kael sorted real tasks'),
      lensLabel: textByLanguage(language, 'Việc thật', 'Real tasks'),
      lensValue: String(scheduleJobs.length),
      meta: buildWorkerV5ScheduleJobMeta(scheduleJobs, language),
      rows,
    }
  }

  if (!deal) {
    return {
      actionLabel: textByLanguage(language, 'Chờ dữ liệu thật', 'Waiting for real data'),
      amount: textByLanguage(language, 'Chờ dữ liệu thật', 'No real data'),
      kaelBody: textByLanguage(
        language,
        'Kael chỉ sắp lịch khi có cơ hội thật từ khách hoặc việc đang chạy để đối chiếu.',
        'Kael schedules only from real customer opportunities or active work.',
      ),
      kaelTitle: textByLanguage(language, 'Kael đang chờ cơ hội thật', 'Kael is waiting for real work'),
      lensLabel: textByLanguage(language, 'Cơ hội thật', 'Real work'),
      lensValue: textByLanguage(language, 'Chờ', 'Wait'),
      meta: textByLanguage(language, 'Mở khi hệ thống có cơ hội phù hợp', 'Opens when the system has a matching opportunity'),
      rows: [],
    }
  }

  const earning = deal.broadcast?.estimatedEarningLabel?.trim() || null
  const rows = [buildWorkerV5ScheduleRow(deal, language)]
  return {
    actionLabel: textByLanguage(language, 'Theo việc thật', 'Real work'),
    amount: earning ?? textByLanguage(language, 'Chờ Kael tính tiền công', 'Waiting for Kael earning'),
    kaelBody: textByLanguage(
      language,
      'Không tự nhận việc hoặc thay đổi lịch nếu bạn chưa xác nhận.',
      'No job is accepted or schedule changed until you confirm.',
    ),
    kaelTitle: textByLanguage(language, 'Tôi đã chừa 30 phút dự phòng', 'I kept a 30-minute buffer'),
    lensLabel: textByLanguage(language, 'Cơ hội thật', 'Real work'),
    lensValue: '1',
    meta: textByLanguage(
      language,
      `${rows.length} việc · ${routeDestinationLabel(deal, language)}`,
      `${rows.length} work · ${routeDestinationLabel(deal, language)}`,
    ),
    rows,
  }
}

function isWorkerV5SchedulableJob(job: WorkerJobListResponse['jobs'][number]) {
  return [
    'worker_matched',
    'worker_on_way',
    'arrived',
    'inspecting',
    'repairing',
    'scope_change_pending',
    'completed_by_worker',
  ].includes(toLocalDealStatus(job.status))
}

function compareWorkerV5ScheduleJobs(
  left: WorkerJobListResponse['jobs'][number],
  right: WorkerJobListResponse['jobs'][number],
) {
  const statusRank = workerV5ScheduleStatusRank(toLocalDealStatus(left.status)) - workerV5ScheduleStatusRank(toLocalDealStatus(right.status))
  if (statusRank !== 0) return statusRank
  const locationRank = workerV5ScheduleLocationRank(left) - workerV5ScheduleLocationRank(right)
  if (locationRank !== 0) return locationRank
  return workerV5ScheduleTimestamp(left) - workerV5ScheduleTimestamp(right)
}

function workerV5ScheduleStatusRank(status: LocalDeal['status']) {
  switch (status) {
    case 'worker_matched':
      return 0
    case 'worker_on_way':
      return 1
    case 'arrived':
      return 2
    case 'inspecting':
      return 3
    case 'repairing':
      return 4
    case 'scope_change_pending':
      return 5
    case 'completed_by_worker':
      return 6
    default:
      return 9
  }
}

function workerV5ScheduleLocationRank(job: WorkerJobListResponse['jobs'][number]) {
  if (workerV5JobExactAddressReleased(job)) return 0
  if (job.district?.trim()) return 1
  return 2
}

function workerV5ScheduleTimestamp(job: WorkerJobListResponse['jobs'][number]) {
  const value = job.matched_at ?? job.created_at
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER
}

function buildWorkerV5ScheduleRowFromJob(
  job: WorkerJobListResponse['jobs'][number],
  index: number,
  language: AppLanguage,
): WorkerV5SchedulePlanRow {
  const problem = job.problem_summary?.trim() || localizedServiceLabel(job.service_type, language)
  const destination = workerV5JobDestinationLabel(job, language)
  const earning = typeof job.estimated_earning === 'number' && job.estimated_earning > 0
    ? formatVnd(job.estimated_earning, language)
    : localizedStatusLabel(toLocalDealStatus(job.status), language)
  return {
    aside: earning,
    meta: `${destination} · ${problem}`,
    time: String(index + 1).padStart(2, '0'),
    title: localizedServiceLabel(job.service_type, language),
  }
}

function buildWorkerV5ScheduleJobMeta(
  jobs: ReadonlyArray<WorkerJobListResponse['jobs'][number]>,
  language: AppLanguage,
) {
  const districtCount = new Set(jobs.map((job) => job.district?.trim()).filter(Boolean)).size
  return textByLanguage(
    language,
    `${jobs.length} việc thật · ${districtCount || 1} khu vực`,
    `${jobs.length} real tasks · ${districtCount || 1} area${districtCount > 1 ? 's' : ''}`,
  )
}

function workerV5JobDestinationLabel(job: WorkerJobListResponse['jobs'][number], language: AppLanguage) {
  const district = job.district?.trim() ? formatWorkerDistrict(job.district, language) : textByLanguage(language, 'Khu vực đang ẩn', 'Area hidden')
  if (!workerV5JobExactAddressReleased(job)) return district
  const parts = [job.address_building, job.address_floor, job.address_unit, district]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
  return parts.length > 0 ? parts.join(', ') : district
}

function workerV5JobExactAddressReleased(job: WorkerJobListResponse['jobs'][number]) {
  return Boolean(job.address_access.exact_unit_released && (job.address_building || job.address_floor || job.address_unit))
}

function buildWorkerV5ScheduleRow(deal: LocalDeal, language: AppLanguage): WorkerV5SchedulePlanRow {
  const problem = deal.broadcast?.problemSummary || deal.draft.problemChips[0] || deal.draft.description
  const destination = routeDestinationLabel(deal, language)
  const meta = problem ? `${destination} · ${problem}` : destination
  return {
    aside: deal.broadcast?.estimatedEarningLabel ?? textByLanguage(language, 'Chờ Kael tính tiền công', 'Waiting for Kael earning'),
    meta,
    time: workerV5TimeChoiceLabel(deal.draft.timeChoice, language),
    title: localizedServiceLabel(deal.draft.serviceType, language),
  }
}

function WorkerV5OpportunityInboxBody({
  language,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const router = useRouter()
  const [selectedInboxTab, setSelectedInboxTab] = useState<WorkerV5InboxTabId>('matches')
  const deal = runtime.state.deal
  const broadcast = deal?.broadcast
  const newOpportunityDeal = broadcast?.status === 'sent' ? deal : null
  const visibleDeal = selectedInboxTab === 'matches'
    ? deal
    : selectedInboxTab === 'new'
      ? newOpportunityDeal
      : null
  const realOpportunityCount = deal ? 1 : 0
  const openMap = () => router.replace('/(worker)/jobs?ns_worker_screen=1.3-demand-map' as never)
  const openOffer = () => {
    if (!visibleDeal) return
    router.replace('/(worker)/jobs?ns_worker_screen=2.2-offer-detail' as never)
  }

  return (
    <View style={styles.opportunityInboxStack} testID="worker-v5-opportunity-inbox-handoff">
      <WorkerV5InboxTabs
        activeCount={realOpportunityCount}
        language={language}
        newCount={newOpportunityDeal ? 1 : 0}
        onSelect={setSelectedInboxTab}
        reduceTransparency={reduceTransparency}
        savedCount={0}
        selectedTab={selectedInboxTab}
      />
      <WorkerV5BoundaryNote
        title={textByLanguage(language, 'Quyền quyết định', 'Decision owner')}
        body={textByLanguage(language, 'Kael chỉ sắp xếp và giải thích. Không cơ hội nào được tự động nhận.', 'Kael only sorts and explains. No opportunity is accepted automatically.')}
      />
      <View style={styles.opportunityList} testID="worker-v5-opportunity-list">
        {visibleDeal ? (
          <WorkerV5OpportunityCard deal={visibleDeal} language={language} reduceTransparency={reduceTransparency} />
        ) : (
          <WorkerV5OpportunityEmptyCard language={language} reduceTransparency={reduceTransparency} tab={selectedInboxTab} />
        )}
      </View>
      <WorkerV5ActionRail
        onPrimary={openOffer}
        onSecondary={openMap}
        primary={textByLanguage(language, 'Mở đề nghị tốt nhất', 'Open best offer')}
        primaryDisabled={!visibleDeal}
        primaryTestID="worker-v5-primary-action"
        reduceTransparency={reduceTransparency}
        secondary={textByLanguage(language, 'Xem bản đồ', 'View map')}
        secondaryTestID="worker-v5-opportunity-map-action"
      />
    </View>
  )
}

function WorkerV5OfferDetailBody({
  language,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const router = useRouter()
  const [declineBusy, setDeclineBusy] = useState(false)
  const deal = runtime.state.deal
  const canDecline = deal?.status === 'broadcasting' && deal.broadcast?.status === 'sent'
  const addressRows = buildWorkerV5OfferAddressRows(deal, language)
  const requestRows = buildWorkerV5OfferRequestRows(deal, language)
  const openAcceptReview = () => {
    if (!deal) return
    router.replace('/(worker)/jobs?ns_worker_screen=2.3-accept-review' as never)
  }
  const declineOffer = async () => {
    if (!canDecline || declineBusy) return
    setDeclineBusy(true)
    try {
      await runtime.actions.workerDeclineBroadcast()
    } finally {
      setDeclineBusy(false)
    }
  }

  return (
    <View style={styles.offerDetailStack} testID="worker-v5-offer-detail-handoff">
      {deal ? (
        <WorkerV5OfferDetailSummaryCard deal={deal} language={language} reduceTransparency={reduceTransparency} />
      ) : (
        <WorkerV5OfferDetailEmptyCard language={language} reduceTransparency={reduceTransparency} />
      )}
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Đã xác minh', 'Verified')}
        title={textByLanguage(language, 'Địa chỉ & khách hàng', 'Address and customer')}
      />
      <WorkerV5OfferDetailListCard
        reduceTransparency={reduceTransparency}
        rows={addressRows}
        scope="OfferAddressList"
        testID="worker-v5-offer-address-list"
      />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Scope hiện tại', 'Current scope')}
        title={textByLanguage(language, 'Yêu cầu', 'Request')}
      />
      <WorkerV5OfferDetailListCard
        reduceTransparency={reduceTransparency}
        rows={requestRows}
        scope="OfferRequestList"
        testID="worker-v5-offer-request-list"
      />
      <WorkerV5ActionRail
        onPrimary={openAcceptReview}
        onSecondary={canDecline ? () => void declineOffer() : undefined}
        primary={textByLanguage(language, 'Tiếp tục nhận việc', 'Continue to accept')}
        primaryDisabled={!deal}
        primaryTestID="worker-v5-offer-continue-action"
        reduceTransparency={reduceTransparency}
        secondary={declineBusy ? textByLanguage(language, 'Đang từ chối', 'Declining') : textByLanguage(language, 'Từ chối', 'Decline')}
        secondaryTestID="worker-v5-offer-decline-action"
      />
    </View>
  )
}

type WorkerV5OfferDetailRow = {
  icon: WorkerV5IconName
  meta: string
  status: string
  title: string
}
type WorkerV5AcceptCheckState = 'blocked' | 'done' | 'pending'
type WorkerV5AcceptCheck = {
  label: string
  meta: string
  state: WorkerV5AcceptCheckState
}

function WorkerV5OfferDetailSummaryCard({
  deal,
  language,
  reduceTransparency,
}: {
  deal: LocalDeal
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const serviceLabel = localizedServiceLabel(deal.draft.serviceType, language)
  const serviceIcon = deal.draft.serviceType ? workerV5ServiceIcons[deal.draft.serviceType] : workerV5Icons.jobs
  const earning = deal.broadcast?.estimatedEarningLabel ?? textByLanguage(language, 'Chờ Kael tính tiền công', 'Waiting for Kael earning')
  const area = routeDestinationLabel(deal, language)
  const problem = deal.broadcast?.problemSummary || deal.draft.inferredProblemLabel || deal.draft.description
  const meta = problem
    ? `${workerV5TimeChoiceLabel(deal.draft.timeChoice, language)} · ${problem}`
    : `${workerV5TimeChoiceLabel(deal.draft.timeChoice, language)} · ${area}`
  const status = deal.broadcast?.status === 'sent'
    ? textByLanguage(language, 'Mới từ nguồn thật', 'New from real source')
    : localizedStatusLabel(deal.status, language)
  const chipItems = buildWorkerV5OfferSummaryChips(deal, language)

  return (
    <View style={[styles.offerDetailSummaryCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-offer-detail-summary-card">
      {!reduceTransparency ? (
        <>
          <WorkerV5CustomerCaseWideMintAura
            scope="OfferDetailSummaryWide"
            style={styles.offerDetailSummaryAura}
            testID="worker-v5-offer-detail-summary-mint-aura"
          />
          <WorkerV5CustomerZipMintAura
            scope="OfferDetailSummaryFine"
            style={styles.offerDetailSummaryZipAura}
            testID="worker-v5-offer-detail-summary-zip-mint-aura"
          />
        </>
      ) : null}
      <View style={styles.offerDetailSummaryLine}>
        <View style={styles.offerDetailIconTile}>
          <MintAura intensity="iconTile" style={styles.iconTileMintAura} />
          <Image resizeMode="contain" source={serviceIcon} style={styles.offerDetailIcon} />
        </View>
        <View style={styles.offerDetailSummaryCopy}>
          <Text style={styles.offerDetailStatusChip} numberOfLines={1}>{status}</Text>
          <Text style={styles.offerDetailTitle} numberOfLines={2} testID="worker-v5-offer-summary-title">{serviceLabel}</Text>
          <Text style={styles.offerDetailMeta} numberOfLines={2} testID="worker-v5-offer-summary-meta">{meta}</Text>
        </View>
        <Text style={styles.offerDetailPrice} numberOfLines={2} testID="worker-v5-offer-summary-price">{earning}</Text>
      </View>
      <View style={styles.offerDetailChipRow} testID="worker-v5-offer-summary-chip-row">
        {chipItems.map((item, index) => (
          <Text key={item} style={styles.offerDetailChip} numberOfLines={1} testID={`worker-v5-offer-summary-chip-${index}`}>{item}</Text>
        ))}
      </View>
    </View>
  )
}

function WorkerV5OfferDetailEmptyCard({
  language,
  reduceTransparency,
}: {
  language: AppLanguage
  reduceTransparency: boolean
}) {
  return (
    <View style={[styles.offerDetailSummaryCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-offer-detail-summary-card">
      {!reduceTransparency ? (
        <>
          <WorkerV5CustomerCaseWideMintAura
            scope="OfferDetailEmptySummary"
            style={styles.offerDetailSummaryAura}
            testID="worker-v5-offer-detail-summary-mint-aura"
          />
          <WorkerV5CustomerZipMintAura
            scope="OfferDetailEmptySummaryFine"
            style={styles.offerDetailSummaryZipAura}
            testID="worker-v5-offer-detail-summary-zip-mint-aura"
          />
        </>
      ) : null}
      <View style={styles.offerDetailSummaryLine}>
        <View style={styles.offerDetailIconTile}>
          <MintAura intensity="iconTile" style={styles.iconTileMintAura} />
          <Image resizeMode="contain" source={workerV5Icons.jobs} style={styles.offerDetailIcon} />
        </View>
        <View style={styles.offerDetailSummaryCopy}>
          <Text style={styles.offerDetailStatusChip} numberOfLines={1}>{textByLanguage(language, 'Chờ dữ liệu thật', 'Waiting for real data')}</Text>
          <Text style={styles.offerDetailTitle} numberOfLines={2} testID="worker-v5-offer-summary-title">
            {textByLanguage(language, 'Chưa có đề nghị thật', 'No real offer yet')}
          </Text>
          <Text style={styles.offerDetailMeta} numberOfLines={2} testID="worker-v5-offer-summary-meta">
            {textByLanguage(language, 'Chi tiết chỉ hiện khi NestScout gửi cơ hội tới thợ.', 'Details appear only after NestScout sends an opportunity to the worker.')}
          </Text>
        </View>
        <Text style={styles.offerDetailPrice} numberOfLines={2} testID="worker-v5-offer-summary-price">
          {textByLanguage(language, 'Chờ', 'Pending')}
        </Text>
      </View>
    </View>
  )
}

function WorkerV5OfferDetailListCard({
  reduceTransparency,
  rows,
  scope,
  testID,
}: {
  reduceTransparency: boolean
  rows: readonly WorkerV5OfferDetailRow[]
  scope: string
  testID: string
}) {
  return (
    <View style={[styles.offerDetailListCard, reduceTransparency && styles.opaqueCard]} testID={testID}>
      {!reduceTransparency ? (
        <>
          <WorkerV5CustomerCaseWideMintAura scope={`${scope}Wide`} style={styles.offerDetailListAura} />
          <WorkerV5CustomerZipMintAura scope={`${scope}Fine`} style={styles.offerDetailListZipAura} />
          <WorkerV5CustomerCaseWideMintAura
            scope={`${scope}Lower`}
            style={styles.offerDetailListLowerAura}
            testID={`${testID}-mint-aura`}
          />
        </>
      ) : null}
      {rows.map((row, index) => (
        <View key={`${row.title}-${row.status}`} style={[styles.offerDetailListRow, index > 0 && styles.offerDetailListDivider]}>
          <View style={styles.offerDetailRowIconTile}>
            <MintAura intensity="iconTile" style={styles.iconTileMintAura} />
            <Image resizeMode="contain" source={workerV5Icons[row.icon]} style={styles.offerDetailRowIcon} />
          </View>
          <View style={styles.offerDetailRowCopy}>
            <Text style={styles.offerDetailRowTitle} numberOfLines={2}>{row.title}</Text>
            <Text style={styles.offerDetailRowMeta} numberOfLines={2}>{row.meta}</Text>
          </View>
          <Text style={styles.offerDetailRowStatus} numberOfLines={1}>{row.status}</Text>
        </View>
      ))}
    </View>
  )
}

function WorkerV5AcceptReviewBody({
  language,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const router = useRouter()
  const [acceptBusy, setAcceptBusy] = useState(false)
  const deal = runtime.state.deal
  const profile = runtime.workerProfile
  const checks = buildWorkerV5AcceptReviewChecks(deal, profile, language)
  const passedCount = checks.filter((item) => item.state === 'done').length
  const canAccept = workerV5CanAcceptOpenOffer(deal, runtime.state.workerGate)

  const confirmAccept = async () => {
    if (!canAccept || acceptBusy) return
    setAcceptBusy(true)
    try {
      const ok = await runtime.actions.workerAcceptBroadcast()
      if (ok) router.replace('/(worker)/jobs?ns_worker_screen=2.4-route-eta' as never)
    } finally {
      setAcceptBusy(false)
    }
  }

  return (
    <View style={styles.acceptReviewStack} testID="worker-v5-accept-review-handoff">
      <WorkerV5AcceptSummaryCard deal={deal} language={language} reduceTransparency={reduceTransparency} />
      <WorkerV5SectionHeader
        action={textByLanguage(language, `${passedCount}/${checks.length} điều kiện`, `${passedCount}/${checks.length} checks`)}
        title={textByLanguage(language, 'Kael đã kiểm tra', 'Kael checked')}
      />
      <WorkerV5AcceptChecklistCard checks={checks} reduceTransparency={reduceTransparency} />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Bạn có thể xem lại', 'You can review')}
        title={textByLanguage(language, 'Cam kết khi nhận việc', 'Acceptance commitment')}
      />
      <WorkerV5AcceptCommitmentCard deal={deal} language={language} reduceTransparency={reduceTransparency} />
      <WorkerV5AcceptBoundaryNote language={language} reduceTransparency={reduceTransparency} />
      <WorkerV5AcceptConfirmButton
        disabled={!canAccept || acceptBusy}
        label={acceptBusy ? textByLanguage(language, 'Đang xác nhận', 'Confirming') : textByLanguage(language, 'Xác nhận nhận việc', 'Confirm accept')}
        onPress={() => void confirmAccept()}
        reduceTransparency={reduceTransparency}
      />
    </View>
  )
}

function WorkerV5AcceptSummaryCard({
  deal,
  language,
  reduceTransparency,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const serviceType = deal?.draft.serviceType ?? null
  const serviceIcon = serviceType ? workerV5ServiceIcons[serviceType] : workerV5Icons.jobs
  const serviceLabel = deal
    ? localizedServiceLabel(deal.draft.serviceType, language)
    : textByLanguage(language, 'Chưa có đề nghị thật', 'No real offer yet')
  const meta = deal
    ? `${deal.draft.description || textByLanguage(language, 'Yêu cầu từ khách', 'Customer request')} · ${routeDestinationLabel(deal, language)}`
    : textByLanguage(language, 'Chi tiết chỉ hiện khi NestScout gửi cơ hội tới thợ.', 'Details appear only after NestScout sends an opportunity to the worker.')
  const earning = deal?.broadcast?.estimatedEarningLabel?.trim() || '0'

  return (
    <View style={[styles.acceptSummaryCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-accept-summary-card">
      {!reduceTransparency ? (
        <>
          <WorkerV5CustomerCaseWideMintAura
            scope="AcceptSummaryWide"
            style={styles.acceptSummaryAura}
            testID="worker-v5-accept-summary-mint-aura"
          />
          <WorkerV5CustomerZipMintAura
            scope="AcceptSummaryFine"
            style={styles.acceptSummaryZipAura}
            testID="worker-v5-accept-summary-zip-mint-aura"
          />
        </>
      ) : null}
      <View style={styles.acceptSummaryLine}>
        <View style={styles.acceptSummaryIconTile} testID="worker-v5-accept-summary-icon-tile">
          <MintAura intensity="iconTile" style={styles.iconTileMintAura} />
          <Image resizeMode="contain" source={serviceIcon} style={styles.acceptSummaryIcon} />
        </View>
        <View style={styles.acceptSummaryCopy} testID="worker-v5-accept-summary-copy">
          <Text style={styles.acceptSummaryTitle} numberOfLines={2} testID="worker-v5-accept-summary-title">{serviceLabel}</Text>
          <Text style={styles.acceptSummaryMeta} numberOfLines={2} testID="worker-v5-accept-summary-meta">{meta}</Text>
        </View>
        <View style={styles.acceptSummaryPriceSlot} testID="worker-v5-accept-summary-price-slot">
          <Text style={styles.acceptSummaryPrice} numberOfLines={2} testID="worker-v5-accept-summary-price">{earning}</Text>
        </View>
      </View>
    </View>
  )
}

function WorkerV5AcceptChecklistCard({
  checks,
  reduceTransparency,
}: {
  checks: readonly WorkerV5AcceptCheck[]
  reduceTransparency: boolean
}) {
  return (
    <View style={[styles.acceptChecklistCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-accept-checklist-card">
      {!reduceTransparency ? (
        <>
          <WorkerV5CustomerCaseWideMintAura
            scope="AcceptChecklistWide"
            style={styles.acceptChecklistAura}
            testID="worker-v5-accept-checklist-mint-aura"
          />
          <WorkerV5CustomerZipMintAura scope="AcceptChecklistFine" style={styles.acceptChecklistZipAura} />
        </>
      ) : null}
      {checks.map((check, index) => (
        <View key={check.label} style={[styles.acceptCheckRow, index > 0 && styles.acceptCheckRowGap]} testID={`worker-v5-accept-check-${index}`}>
          {!reduceTransparency ? (
            <WorkerV5CustomerZipMintAura
              scope={`AcceptCheckRow${index}`}
              style={styles.acceptCheckRowAura}
              testID={`worker-v5-accept-check-row-mint-aura-${index}`}
            />
          ) : null}
          <View style={[
            styles.acceptCheckState,
            check.state === 'done' && styles.acceptCheckStateDone,
            check.state === 'blocked' && styles.acceptCheckStateBlocked,
          ]}>
            <Text style={[styles.acceptCheckStateText, check.state === 'done' && styles.acceptCheckStateTextDone]}>
              {check.state === 'done' ? '✓' : '!'}
            </Text>
          </View>
          <Text style={styles.acceptCheckLabel} numberOfLines={2}>{check.label}</Text>
          <Text style={styles.acceptCheckMeta} numberOfLines={2}>{check.meta}</Text>
        </View>
      ))}
    </View>
  )
}

function WorkerV5AcceptCommitmentCard({
  deal,
  language,
  reduceTransparency,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const etaSignal = buildWorkerV5AcceptEtaSignal(deal, language)

  return (
    <View style={[styles.acceptCommitmentCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-accept-commitment">
      {!reduceTransparency ? (
        <>
          <WorkerV5CustomerCaseWideMintAura scope="AcceptCommitmentWide" style={styles.acceptCommitmentAura} />
          <WorkerV5CustomerZipMintAura scope="AcceptCommitmentFine" style={styles.acceptCommitmentZipAura} />
        </>
      ) : null}
      <View style={styles.acceptCommitmentIconTile}>
        <MintAura intensity="iconTile" style={styles.iconTileMintAura} />
        <Image resizeMode="contain" source={workerV5Icons.clock} style={styles.acceptCommitmentIcon} />
      </View>
      <View style={styles.acceptCommitmentCopy}>
        <Text style={styles.acceptCommitmentTitle} numberOfLines={2} testID="worker-v5-accept-commitment-title">
          {etaSignal.label}
        </Text>
        {etaSignal.hasSignal ? (
          <Text style={styles.acceptCommitmentMeta} numberOfLines={3} testID="worker-v5-accept-commitment-meta">
            {etaSignal.meta}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

function WorkerV5AcceptBoundaryNote({
  language,
  reduceTransparency,
}: {
  language: AppLanguage
  reduceTransparency: boolean
}) {
  return (
    <View style={[styles.acceptBoundaryNote, reduceTransparency && styles.opaqueCard]} testID="worker-v5-accept-boundary-note">
      {!reduceTransparency ? (
        <>
          <WorkerV5CustomerCaseWideMintAura
            scope="AcceptBoundaryWide"
            style={styles.acceptBoundaryAura}
            testID="worker-v5-accept-boundary-mint-aura"
          />
          <WorkerV5CustomerZipMintAura scope="AcceptBoundaryFine" style={styles.acceptBoundaryZipAura} />
        </>
      ) : null}
      <Text style={styles.acceptBoundaryText}>
        <Text style={styles.acceptBoundaryStrong}>
          {textByLanguage(language, 'Kael không thể bấm nhận thay bạn.', 'Kael cannot accept on your behalf.')}
        </Text>
        {textByLanguage(language, ' Nút dưới tạo sự kiện xác nhận rõ của thợ.', ' The button below creates an explicit worker confirmation event.')}
      </Text>
    </View>
  )
}

function WorkerV5AcceptConfirmButton({
  disabled,
  label,
  onPress,
  reduceTransparency,
}: {
  disabled: boolean
  label: string
  onPress: () => void
  reduceTransparency: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.acceptConfirmButton,
        reduceTransparency && styles.primaryActionButtonSource,
        disabled && styles.acceptConfirmDisabled,
        pressed && !disabled ? styles.pressed : null,
      ]}
      testID="worker-v5-accept-confirm-action"
    >
      {!reduceTransparency ? (
        <Svg
          pointerEvents="none"
          preserveAspectRatio="none"
          style={StyleSheet.absoluteFill}
          testID="worker-v5-accept-confirm-formula-fill"
          viewBox="0 0 100 56"
        >
          <Defs>
            <LinearGradient id="worker-v5-accept-confirm-fill" x1="0" x2="1" y1="0" y2="0">
              <Stop offset="0" stopColor="#2DD4BF" />
              <Stop offset="0.28" stopColor="#20CDB9" />
              <Stop offset="0.52" stopColor="#12BCAA" />
              <Stop offset="0.78" stopColor="#069889" />
              <Stop offset="1" stopColor="#008579" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100" height="56" rx="0" fill="url(#worker-v5-accept-confirm-fill)" />
        </Svg>
      ) : null}
      <Text style={styles.acceptConfirmText} numberOfLines={1}>{label}</Text>
    </Pressable>
  )
}

function WorkerV5RouteEtaBody({
  actionBusy,
  language,
  navigateJobChat,
  navigateNext,
  reduceTransparency,
  runtime,
}: {
  actionBusy: boolean
  language: AppLanguage
  navigateJobChat: () => void
  navigateNext: () => void
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const deal = runtime.state.deal
  const etaSignal = buildWorkerV5AcceptEtaSignal(deal, language)
  const distanceSignal = buildWorkerV5RouteDistanceSignal(deal, language)
  const destinationSignal = workerV5RouteMapLabelFromDeal(deal) ?? (deal ? routeDestinationLabel(deal, language) : textByLanguage(language, 'Chưa có việc', 'No work'))
  const canOpenArrival = !actionBusy

  return (
    <View style={styles.sectionStack}>
      <WorkerV5RouteMapStage deal={deal} language={language} reduceTransparency={reduceTransparency} />
      <WorkerV5EtaSummaryCard deal={deal} language={language} reduceTransparency={reduceTransparency} />
      <WorkerV5InfoGrid
        items={[
          { label: textByLanguage(language, 'Quãng đường', 'Distance'), value: distanceSignal.label },
          { label: textByLanguage(language, 'Tín hiệu đường đi', 'Route signal'), value: etaSignal.hasSignal ? etaSignal.label : textByLanguage(language, 'Chờ dữ liệu thật', 'Waiting for real data') },
          { label: textByLanguage(language, 'Vùng đến nơi', 'Arrival zone'), value: destinationSignal },
        ]}
      />
      <WorkerV5ActionRail
        primary={textByLanguage(language, 'Tôi đã đến nơi', 'I have arrived')}
        primaryDisabled={!canOpenArrival}
        primaryTestID="worker-v5-route-arrival-action"
        primaryVariant="source"
        reduceTransparency={reduceTransparency}
        secondary={textByLanguage(language, 'Liên hệ khách', 'Contact customer')}
        secondaryTestID="worker-v5-route-contact-action"
        onPrimary={canOpenArrival ? navigateNext : undefined}
        onSecondary={navigateJobChat}
      />
    </View>
  )
}

function WorkerV5ArrivalCheckInBody({
  actionBusy,
  language,
  navigateJobChat,
  navigateNext,
  reduceTransparency,
  runtime,
}: {
  actionBusy: boolean
  language: AppLanguage
  navigateJobChat: () => void
  navigateNext: () => void
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const deal = runtime.state.deal
  const canOpenInProgress = !actionBusy

  return (
    <View style={styles.sectionStack}>
      <WorkerV5CheckInHero deal={deal} language={language} reduceTransparency={reduceTransparency} />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Theo việc thật', 'From real work')}
        title={textByLanguage(language, 'Khách hàng', 'Customer')}
      />
      <WorkerV5CustomerContactCard deal={deal} language={language} reduceTransparency={reduceTransparency} />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Bắt buộc', 'Required')}
        title={textByLanguage(language, 'Trước khi ghi nhận', 'Before confirming')}
      />
      <WorkerV5CheckInChecklist deal={deal} language={language} reduceTransparency={reduceTransparency} />
      <WorkerV5ActionRail
        primary={textByLanguage(language, 'Xác nhận đã đến', 'Confirm arrival')}
        primaryDisabled={!canOpenInProgress}
        primaryTestID="worker-v5-checkin-arrived-action"
        primaryVariant="source"
        reduceTransparency={reduceTransparency}
        secondary={textByLanguage(language, 'Liên hệ khách', 'Contact customer')}
        secondaryTestID="worker-v5-checkin-contact-action"
        onPrimary={canOpenInProgress ? navigateNext : undefined}
        onSecondary={navigateJobChat}
      />
    </View>
  )
}

function WorkerV5InProgressBody({
  language,
  navigateJobChat,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  navigateJobChat: () => void
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const router = useRouter()
  const deal = runtime.state.deal
  const briefLines = deal?.broadcast?.prebrief?.filter(Boolean).slice(0, 5) ?? []
  const evidenceUrls = deal?.completionPhotoUrls ?? []
  const [fieldEvidencePhotos, setFieldEvidencePhotos] = useState<WorkerV5PrivateKaelMediaPreview[]>([])
  const [fieldEvidenceBusy, setFieldEvidenceBusy] = useState(false)
  const localEvidenceUrls = fieldEvidencePhotos.map((item) => item.uri)
  const visibleEvidenceUrls = [...evidenceUrls, ...localEvidenceUrls]
  const evidenceCount = visibleEvidenceUrls.length
  const progressItems = briefLines.map((line, index) => ({
    meta: index === briefLines.length - 1 ? textByLanguage(language, 'Đang kiểm', 'Active') : textByLanguage(language, 'Đã đọc', 'Read'),
    state: index === briefLines.length - 1 ? 'active' as const : 'done' as const,
    title: line,
  }))
  const pickFieldEvidence = async (source: 'camera' | 'library') => {
    if (fieldEvidenceBusy) return
    const permission = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Kael', source === 'camera'
        ? textByLanguage(language, 'Cần quyền camera để chụp bằng chứng hiện trường.', 'Camera permission is needed to capture on-site evidence.')
        : textByLanguage(language, 'Cần quyền thư viện ảnh để chọn bằng chứng hiện trường.', 'Photo library permission is needed to choose on-site evidence.'))
      return
    }
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.82,
      })
      : await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.82,
        selectionLimit: 3,
      })
    if (result.canceled || result.assets.length === 0) return

    const picked = result.assets.slice(0, source === 'camera' ? 1 : 3).map((asset, index) => ({
      fileName: workerV5PrivateKaelMediaName(asset, index, language),
      uri: asset.uri,
    }))
    setFieldEvidencePhotos((current) => [...current, ...picked])

    const jobId = deal?.broadcast?.jobId ?? deal?.id ?? null
    if (!jobId) return

    const mediaDrafts: LocalMediaUploadDraft[] = picked.map((item) => ({
      fileName: item.fileName,
      type: 'image',
      uri: item.uri,
    }))
    setFieldEvidenceBusy(true)
    try {
      const uploaded = await uploadJobMediaDrafts(jobId, mediaDrafts, 'before')
      if (!uploaded.success) {
        Alert.alert('Kael', uploaded.error)
      }
    } catch {
      Alert.alert('Kael', textByLanguage(language, 'Chưa thể tải bằng chứng hiện trường. Vui lòng thử lại.', 'Could not upload on-site evidence yet. Please try again.'))
    } finally {
      setFieldEvidenceBusy(false)
    }
  }

  return (
    <View style={styles.sectionStack}>
      <WorkerV5TimerCard deal={deal} language={language} reduceTransparency={reduceTransparency} sourceCount={progressItems.length} />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Trực tiếp', 'Live')}
        title={textByLanguage(language, 'Tiến độ công việc', 'Work progress')}
      />
      {progressItems.length ? (
        <WorkerV5WorkProgressBoard
          items={progressItems}
          language={language}
          reduceTransparency={reduceTransparency}
        />
      ) : null}
      <WorkerV5SectionHeader
        action={evidenceCount ? textByLanguage(language, `${evidenceCount} tệp`, `${evidenceCount} files`) : textByLanguage(language, 'Chưa có', 'None yet')}
        title={textByLanguage(language, 'Bằng chứng hiện trường', 'On-site evidence')}
      />
      <WorkerV5EvidenceTray
        emptyLabel={textByLanguage(language, 'Chưa có', 'None')}
        language={language}
        reduceTransparency={reduceTransparency}
        urls={visibleEvidenceUrls}
      />
      <WorkerV5EvidencePickerActions
        busy={fieldEvidenceBusy}
        language={language}
        onCamera={() => void pickFieldEvidence('camera')}
        onLibrary={() => void pickFieldEvidence('library')}
        reduceTransparency={reduceTransparency}
      />
      <WorkerV5ActionRail
        onPrimary={() => router.replace('/(worker)/jobs?ns_worker_screen=2.8-scope-change' as never)}
        onSecondary={navigateJobChat}
        primary={textByLanguage(language, 'Báo đổi phạm vi', 'Report scope change')}
        primaryTestID="worker-v5-in-progress-scope-action"
        primaryVariant="source"
        reduceTransparency={reduceTransparency}
        secondary={textByLanguage(language, 'Hỏi Kael', 'Ask Kael')}
        secondaryTestID="worker-v5-in-progress-kael-action"
      />
    </View>
  )
}

function WorkerV5ScopeChangeBody({
  language,
  navigateNext,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  navigateNext: () => void
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const params = useLocalSearchParams<WorkerV5RouteParams>()
  const router = useRouter()
  const deal = runtime.state.deal
  const scope = runtime.state.deal?.scopeChange ?? null
  const price = formatScopePriceRange(scope, language)
  const scopeRouteMode = firstRouteParam(params.ns_scope_mode)
  const [scopeEvidenceOpenLocal, setScopeEvidenceOpenLocal] = useState(false)
  const scopeEvidenceOpen = scopeRouteMode === 'edit' || scopeEvidenceOpenLocal
  const [scopeDescription, setScopeDescription] = useState('')
  const [scopeReason, setScopeReason] = useState('')
  const [scopePhotos, setScopePhotos] = useState<WorkerV5PrivateKaelMediaPreview[]>([])
  const [scopeUploadedEvidenceRefs, setScopeUploadedEvidenceRefs] = useState<string[]>([])
  const [scopeSubmitting, setScopeSubmitting] = useState(false)
  const [scopeEvidenceSent, setScopeEvidenceSent] = useState(false)
  const [scopeMediaNotice, setScopeMediaNotice] = useState<string | null>(null)
  useEffect(() => {
    if (!scope) return
    setScopeDescription((current) => current.trim() ? current : scope.requestedDescription || '')
    setScopeReason((current) => current.trim() ? current : scope.reason || '')
  }, [scope?.id, scope?.reason, scope?.requestedDescription])
  const scopeEvidenceUrls = Array.from(new Set([
    ...scopePhotos.map((item) => item.uri),
    ...(scope?.evidencePhotoUrls ?? []),
    ...scopeUploadedEvidenceRefs,
  ].filter((uri): uri is string => Boolean(uri))))
  const evidenceCount = scopeEvidenceUrls.length
  const canDraftScopeEvidence = Boolean(deal && ['arrived', 'inspecting', 'repairing', 'scope_change_pending'].includes(deal.status))
  const hasScopeSubmission = Boolean(scope || scopeEvidenceSent)
  const scopeDescriptionReady = scopeDescription.trim().length >= 10
  const scopeReasonReady = scopeReason.trim().length >= 10
  const scopeSubmitDisabled = !canDraftScopeEvidence || !scopeDescriptionReady || !scopeReasonReady || scopeSubmitting || scopeEvidenceSent
  const openScopeEditPath = () => {
    setScopeEvidenceOpenLocal(true)
    router.replace('/(worker)/jobs?ns_worker_screen=2.8-scope-change&ns_scope_mode=edit' as never)
  }
  const submitScopeEvidence = async () => {
    if (!deal || scopeSubmitDisabled) return
    const jobId = deal.broadcast?.jobId ?? deal.id
    const scopeMediaDrafts: LocalMediaUploadDraft[] = scopePhotos.slice(0, 5).map((item) => ({
      fileName: item.fileName,
      type: 'image',
      uri: item.uri,
    }))
    setScopeSubmitting(true)
    setScopeMediaNotice(null)
    let uploadedRefs: string[] = []
    if (scopeMediaDrafts.length > 0) {
      const uploaded = await uploadJobMediaDrafts(jobId, scopeMediaDrafts, 'scope_change_evidence')
      if (!uploaded.success) {
        setScopeSubmitting(false)
        setScopeMediaNotice(uploaded.error)
        return
      }
      uploadedRefs = uploaded.mediaRefs
    }
    const nextEvidenceRefs = Array.from(new Set([...(scope?.evidencePhotoUrls ?? []), ...scopeUploadedEvidenceRefs, ...uploadedRefs]))
    setScopeUploadedEvidenceRefs((current) => Array.from(new Set([...current, ...uploadedRefs])))
    const ok = await runtime.actions.requestScopeChange({
      new_description: scopeDescription.trim(),
      photo_urls: nextEvidenceRefs,
      reason: scopeReason.trim(),
    })
    setScopeSubmitting(false)
    if (!ok) return
    setScopeEvidenceSent(true)
  }

  return (
    <View style={styles.sectionStack}>
      <WorkerV5ProgressRail activeStep={4} language={language} />
      <WorkerV5ScopeChangeHero language={language} reduceTransparency={reduceTransparency} scope={scope} />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Kael hỗ trợ soạn', 'Kael drafts')}
        title={textByLanguage(language, 'Đề xuất thay đổi', 'Change proposal')}
      />
      <WorkerV5PriceLines
        formulaAura
        reduceTransparency={reduceTransparency}
        rows={[
          { label: textByLanguage(language, 'Hạng mục bổ sung', 'Additional scope'), value: scope?.requestedDescription || textByLanguage(language, 'Chưa có bản nháp thật', 'No real draft') },
          { label: textByLanguage(language, 'Lý do', 'Reason'), value: scope?.reason || textByLanguage(language, 'Chưa có lý do thật', 'No real reason') },
          { label: textByLanguage(language, 'Bằng chứng', 'Evidence'), value: evidenceCount ? `${evidenceCount}` : textByLanguage(language, 'Chưa có ảnh', 'No photos') },
        ]}
        total={{ label: textByLanguage(language, 'Khoảng giá', 'Price range'), value: price }}
      />
      <WorkerV5EvidenceTray
        emptyLabel={textByLanguage(language, 'Chưa có', 'None')}
        language={language}
        reduceTransparency={reduceTransparency}
        urls={scopeEvidenceUrls}
      />
      <WorkerV5ScopeEvidenceGate
        deal={deal}
        language={language}
        reduceTransparency={reduceTransparency}
        scope={scope}
        scopeDescription={scopeDescription}
        scopeEvidenceOpen={scopeEvidenceOpen}
        scopeEvidenceSent={scopeEvidenceSent}
        scopeMediaNotice={scopeMediaNotice}
        scopePhotos={scopePhotos}
        scopeReason={scopeReason}
        scopeSubmitDisabled={scopeSubmitDisabled}
        scopeSubmitting={scopeSubmitting}
        setScopeDescription={setScopeDescription}
        setScopeMediaNotice={setScopeMediaNotice}
        setScopePhotos={setScopePhotos}
        setScopeReason={setScopeReason}
        submitScopeEvidence={submitScopeEvidence}
      />
      <WorkerV5ActionRail
        onPrimary={navigateNext}
        onSecondary={canDraftScopeEvidence ? openScopeEditPath : undefined}
        primary={hasScopeSubmission ? textByLanguage(language, 'Gửi khách phê duyệt', 'Send for customer review') : textByLanguage(language, 'Không có vấn đề phát sinh', 'No scope issue')}
        primaryTestID="worker-v5-scope-change-send-action"
        primaryVariant="source"
        reduceTransparency={reduceTransparency}
        secondary={textByLanguage(language, 'Chỉnh sửa', 'Edit')}
        secondaryTestID="worker-v5-scope-change-edit-action"
      />
    </View>
  )
}

function WorkerV5ScopeEvidenceGate({
  deal,
  language,
  reduceTransparency,
  scope,
  scopeDescription,
  scopeEvidenceOpen,
  scopeEvidenceSent,
  scopeMediaNotice,
  scopePhotos,
  scopeReason,
  scopeSubmitDisabled,
  scopeSubmitting,
  setScopeDescription,
  setScopeMediaNotice,
  setScopePhotos,
  setScopeReason,
  submitScopeEvidence,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
  scope: LocalDeal['scopeChange']
  scopeDescription: string
  scopeEvidenceOpen: boolean
  scopeEvidenceSent: boolean
  scopeMediaNotice: string | null
  scopePhotos: WorkerV5PrivateKaelMediaPreview[]
  scopeReason: string
  scopeSubmitDisabled: boolean
  scopeSubmitting: boolean
  setScopeDescription: (value: string) => void
  setScopeMediaNotice: (value: string | null) => void
  setScopePhotos: (value: WorkerV5PrivateKaelMediaPreview[] | ((current: WorkerV5PrivateKaelMediaPreview[]) => WorkerV5PrivateKaelMediaPreview[])) => void
  setScopeReason: (value: string) => void
  submitScopeEvidence: () => Promise<void>
}) {
  const router = useRouter()
  const attachScopePhotos = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      setScopeMediaNotice(textByLanguage(language, 'Cần quyền thư viện ảnh để đính kèm bằng chứng đổi phạm vi.', 'Photo library permission is needed to attach scope evidence.'))
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.84,
      selectionLimit: 5,
    })
    if (result.canceled || result.assets.length === 0) return
    setScopePhotos((current) => {
      const picked = result.assets.map((asset, index) => ({
        fileName: asset.fileName?.trim() || textByLanguage(language, `anh-phat-sinh-${current.length + index + 1}.jpg`, `scope-evidence-${current.length + index + 1}.jpg`),
        uri: asset.uri,
      }))
      return [...current, ...picked].slice(0, 5)
    })
    setScopeMediaNotice(null)
  }

  if (!scope && !scopeEvidenceOpen) return null

  return (
    <>
      {scope && !scopeEvidenceOpen ? (
        <View style={[styles.glassCard, reduceTransparency && styles.opaqueCard]} testID="worker-scope-change-active">
          <View style={styles.sectionStack} testID="worker-scope-change-reference-card">
            <View testID="worker-scope-change-reference-old">
              <WorkerV5InfoRow icon="document" label={textByLanguage(language, 'Phạm vi hiện tại', 'Original scope')} value={deal?.draft.description || textByLanguage(language, 'Chưa có phạm vi thật', 'No real scope')} />
            </View>
            <View testID="worker-scope-change-reference-new">
              <WorkerV5InfoRow icon="scope" label={textByLanguage(language, 'Phạm vi mới', 'New scope')} value={scope.requestedDescription || textByLanguage(language, 'Chưa có nháp thật', 'No real draft')} />
            </View>
            <View testID="worker-scope-change-reference-reason">
              <WorkerV5InfoRow icon="document" label={textByLanguage(language, 'Lý do', 'Reason')} value={scope.reason || textByLanguage(language, 'Chưa có lý do thật', 'No real reason')} />
            </View>
            <View testID="worker-scope-change-reference-media">
              <WorkerV5InfoRow icon="evidence" label={textByLanguage(language, 'Ảnh bằng chứng', 'Evidence photos')} value={scope.evidencePhotoUrls.length ? textByLanguage(language, `${scope.evidencePhotoUrls.length} ảnh`, `${scope.evidencePhotoUrls.length} photos`) : textByLanguage(language, 'Chưa có ảnh', 'No photos')} />
            </View>
            <View testID="worker-scope-change-reference-delta">
              <WorkerV5InfoRow icon="wallet" label={textByLanguage(language, 'Chi phí phát sinh', 'Kael delta')} value={scopeChangeDeltaLabel(deal, scope, language)} />
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/(worker)/chat' as never)}
            style={styles.navButtonSecondary}
            testID="worker-scope-change-detail-action"
          >
            <Text style={styles.navButtonText}>{textByLanguage(language, 'Xem chi tiết', 'View details')}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.glassCard, reduceTransparency && styles.opaqueCard]} testID="worker-scope-change-request">
          <View style={styles.sectionStack} testID="worker-scope-change-evidence-form">
              <KaelTextField
                inputShellStyle={styles.workerChatTextFieldShell}
                multiline
                onChangeText={setScopeDescription}
                placeholder={textByLanguage(language, 'VD: cần thay thêm đoạn dây bị cháy...', 'Example: replace the burnt wire section...')}
                placeholderTextColor={color.text.muted}
                shellStyle={styles.workerChatTextFieldStack}
                testID="worker-scope-change-new-description-input"
                value={scopeDescription}
              />
              <KaelTextField
                inputShellStyle={styles.workerChatTextFieldShell}
                multiline
                onChangeText={setScopeReason}
                placeholder={textByLanguage(language, 'Mô tả dấu hiệu thực tế Kael cần kiểm tra.', 'Describe the real on-site signal for Kael.')}
                placeholderTextColor={color.text.muted}
                shellStyle={styles.workerChatTextFieldStack}
                testID="worker-scope-change-reason-input"
                value={scopeReason}
              />
              <View style={styles.scopePhotoPickerRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void attachScopePhotos()}
                  style={({ pressed }) => [
                    styles.navButton,
                    styles.navButtonSecondary,
                    styles.scopePhotoPickerButton,
                    pressed ? styles.pressed : null,
                  ]}
                  testID="worker-scope-change-add-photo"
                >
                  <Text adjustsFontSizeToFit minimumFontScale={0.82} numberOfLines={1} style={styles.navButtonText}>{textByLanguage(language, 'Thêm ảnh', 'Add photos')}</Text>
                </Pressable>
                <Text style={[styles.authorityText, styles.scopePhotoPickerHint]} testID="worker-scope-change-photo-count">
                  {scopePhotos.length > 0
                    ? textByLanguage(language, `${scopePhotos.length} ảnh đã chọn`, `${scopePhotos.length} photos selected`)
                    : textByLanguage(language, 'Ảnh là tùy chọn; video chưa hỗ trợ ở bước này.', 'Photos are optional; video is not supported here yet.')}
                </Text>
              </View>
              {scopePhotos.length > 0 ? (
                <View style={styles.privateKaelMediaRail} testID="worker-scope-change-photo-preview-rail">
                  {scopePhotos.map((item, index) => (
                    <View key={`${item.uri}-${index}`} style={styles.privateKaelMediaPreview} testID={`worker-scope-change-photo-preview-${index}`}>
                      <Image source={{ uri: item.uri }} style={styles.privateKaelMediaImage} testID={`worker-scope-change-photo-preview-image-${index}`} />
                      <Text numberOfLines={1} style={styles.privateKaelMediaText}>{item.fileName}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {scopeMediaNotice ? <Text style={styles.authorityText}>{scopeMediaNotice}</Text> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ busy: scopeSubmitting, disabled: scopeSubmitDisabled }}
                disabled={scopeSubmitDisabled}
                onPress={() => void submitScopeEvidence()}
                style={({ pressed }) => [
                  styles.navButton,
                  styles.navButtonPrimary,
                  styles.primaryActionButtonSource,
                  styles.scopeSubmitButton,
                  scopeSubmitDisabled && styles.scopeSubmitDisabled,
                  pressed && !scopeSubmitDisabled ? styles.pressed : null,
                ]}
                testID="worker-scope-change-confirm-submit"
              >
                {!scopeSubmitDisabled ? <WorkerV5PrimaryButtonFill disabled={false} variant="source" /> : null}
                <Text
                  adjustsFontSizeToFit
                  minimumFontScale={0.82}
                  numberOfLines={1}
                  style={[styles.navButtonPrimaryText, styles.scopeSubmitButtonText, scopeSubmitDisabled && styles.scopeSubmitDisabledText]}
                >
                  {scopeEvidenceSent ? textByLanguage(language, 'Đã gửi cho Kael', 'Sent to Kael') : scopeSubmitting ? textByLanguage(language, 'Đang gửi cho Kael', 'Sending to Kael') : textByLanguage(language, 'Gửi cho Kael kiểm tra', 'Send for Kael review')}
                </Text>
              </Pressable>
          </View>
        </View>
      )}
    </>
  )
}

function WorkerV5ApprovalWaitBody({
  language,
  navigateJobChat,
  navigateNext,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  navigateJobChat: () => void
  navigateNext: () => void
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const scope = runtime.state.deal?.scopeChange ?? null
  const approved = scope?.status === 'approved_by_customer'

  return (
    <View style={styles.sectionStack}>
      <WorkerV5ApprovalWaitHero deal={runtime.state.deal} language={language} reduceTransparency={reduceTransparency} scope={scope} />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Theo thời gian thực', 'Real-time')}
        title={textByLanguage(language, 'Trạng thái yêu cầu', 'Request status')}
      />
      <WorkerV5ApprovalTimeline language={language} reduceTransparency={reduceTransparency} scope={scope} />
      <WorkerV5BoundaryNote
        body={textByLanguage(language, 'Hồ sơ giữ nguyên phạm vi cũ cho tới khi khách phê duyệt trên hệ thống.', 'The case stays on the original scope until the customer approves in the system.')}
        formulaAura
        reduceTransparency={reduceTransparency}
        title={textByLanguage(language, 'Không tự thực hiện phần phát sinh', 'Do not perform extra work')}
      />
      <WorkerV5ActionRail
        onPrimary={navigateNext}
        onSecondary={navigateJobChat}
        primary={approved ? textByLanguage(language, 'Tiếp tục công việc', 'Continue work') : textByLanguage(language, 'Chờ khách phê duyệt', 'Waiting for customer approval')}
        primaryDisabled={false}
        primaryTestID="worker-v5-approval-continue-action"
        primaryVariant="source"
        reduceTransparency={reduceTransparency}
        secondary={textByLanguage(language, 'Nhắn khách', 'Message customer')}
        secondaryTestID="worker-v5-approval-message-action"
      />
    </View>
  )
}

function WorkerV5CompletionEvidenceBody({
  language,
  navigateNext,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  navigateNext: () => void
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const deal = runtime.state.deal
  const notes = deal?.completionNotes?.trim()
  const photoCount = deal?.completionPhotoUrls?.length ?? 0
  const checks = buildCompletionChecks(deal, language)
  const passedCount = checks.filter((check) => check.done).length

  return (
    <View style={styles.sectionStack}>
      <WorkerV5CompletionEvidenceHero
        completenessPercent={checks.length ? Math.round((passedCount / checks.length) * 100) : null}
        language={language}
        noteReady={Boolean(notes)}
        photoCount={photoCount}
        reduceTransparency={reduceTransparency}
      />
      <WorkerV5SectionHeader
        action={photoCount ? textByLanguage(language, `${photoCount} ảnh`, `${photoCount} photos`) : textByLanguage(language, 'Trống', 'Empty')}
        title={textByLanguage(language, 'Ảnh trước & sau', 'Before and after photos')}
      />
      <WorkerV5EvidenceTray
        emptyLabel={textByLanguage(language, 'Chưa có', 'None')}
        language={language}
        reduceTransparency={reduceTransparency}
        urls={deal?.completionPhotoUrls ?? []}
      />
      <WorkerV5SectionHeader
        action={`${passedCount}/${checks.length}`}
        title={textByLanguage(language, 'Kiểm tra cuối', 'Final check')}
      />
      <WorkerV5FinalChecklistCard checks={checks} formulaAura reduceTransparency={reduceTransparency} />
      <WorkerV5KaelDraftCard
        body={textByLanguage(language, 'Kael chỉ đối chiếu phạm vi và nguồn bằng chứng; quyền gửi vẫn là hành động rõ ràng của thợ.', 'Kael only reconciles scope and evidence sources; submission remains an explicit worker action.')}
        formulaAura
        language={language}
        reduceTransparency={reduceTransparency}
        title={textByLanguage(language, 'Kael đã đối chiếu phạm vi', 'Kael checked the scope')}
      />
      <WorkerV5SingleSourceActionButton
        disabled={false}
        label={textByLanguage(language, 'Gửi hồ sơ hoàn tất', 'Submit completion')}
        onPress={navigateNext}
        reduceTransparency={reduceTransparency}
        testID="worker-v5-completion-submit-action"
      />
    </View>
  )
}

function WorkerV5CompletionSubmittedBody({
  language,
  navigateNext,
  navigateToEvidence,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  navigateNext: () => void
  navigateToEvidence: () => void
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const deal = runtime.state.deal
  const sourceCount = (deal?.completionPhotoUrls?.length ?? 0) + (deal?.completionNotes?.trim() ? 1 : 0)
  const customerConfirmed = deal?.status === 'confirmed_by_customer' || deal?.status === 'reviewed'

  return (
    <View style={styles.sectionStack}>
      <WorkerV5SuccessEmblem
        body={deal
          ? sourceCount
            ? textByLanguage(language, `Khách đang xem ${sourceCount} nguồn bằng chứng và tổng thanh toán.`, `The customer is reviewing ${sourceCount} evidence sources and the payment total.`)
            : textByLanguage(language, 'Hệ thống chưa có nguồn bằng chứng hoàn tất để gửi.', 'The system has no completion evidence sources to submit yet.')
          : textByLanguage(language, 'Chỉ hiển thị khi NestScout ghi nhận hồ sơ hoàn tất thật.', 'Shown only when NestScout records a real completion artifact.')}
        reduceTransparency={reduceTransparency}
        status={customerConfirmed ? textByLanguage(language, 'Đã xác nhận', 'Confirmed') : textByLanguage(language, 'Đang chờ xác nhận', 'Waiting confirmation')}
        title={deal ? textByLanguage(language, 'Hồ sơ đã được gửi', 'Completion artifact submitted') : textByLanguage(language, 'Chưa có hồ sơ đã gửi', 'No submitted artifact')}
      />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Tự động cập nhật', 'Auto update')}
        title={textByLanguage(language, 'Tiến trình', 'Progress')}
      />
      <WorkerV5SubmissionTimeline deal={deal} language={language} reduceTransparency={reduceTransparency} />
      <WorkerV5SettlementStrip deal={deal} language={language} reduceTransparency={reduceTransparency} />
      <WorkerV5ActionRail
        onPrimary={navigateNext}
        onSecondary={navigateToEvidence}
        primary={customerConfirmed ? textByLanguage(language, 'Mở Case đã đóng', 'Open closed case') : textByLanguage(language, 'Chờ khách xác nhận', 'Waiting for customer')}
        primaryTestID="worker-v5-completion-submitted-next-action"
        primaryVariant="source"
        reduceTransparency={reduceTransparency}
        secondary={textByLanguage(language, 'Xem bằng chứng', 'View evidence')}
        secondaryTestID="worker-v5-completion-submitted-timeline-action"
      />
    </View>
  )
}

function WorkerV5CaseClosedBody({
  language,
  navigateToEarnings,
  navigateToRanking,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  navigateToEarnings: () => void
  navigateToRanking: () => void
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const deal = runtime.state.deal
  const payment = deal?.payment
  const workerNet = payment?.workerNet ?? runtime.workerEarnings?.net_earnings ?? null
  const rating = runtime.workerPerformanceInsights?.average_rating ?? runtime.workerProfile?.rating ?? null
  const hasRating = typeof rating === 'number' && rating > 0
  const rankingDelta = runtime.workerPerformanceInsights?.performance_score ?? null

  return (
    <View style={styles.sectionStack}>
      <WorkerV5CaseClosedHero
        deal={deal}
        language={language}
        reduceTransparency={reduceTransparency}
        workerNet={workerNet}
      />
      <WorkerV5InfoGrid
        items={[
          { label: textByLanguage(language, 'Đánh giá Case', 'Case rating'), value: hasRating ? `${rating.toFixed(rating % 1 === 0 ? 0 : 1)} ★` : textByLanguage(language, 'Chưa có', 'None') },
          { label: textByLanguage(language, 'Thời gian thực tế', 'Actual time'), value: workerV5ActualWorkDurationLabel(deal, language) },
          { label: textByLanguage(language, 'Điểm xếp hạng', 'Ranking points'), value: rankingDelta && rankingDelta > 0 ? `+${Math.round(rankingDelta)}` : textByLanguage(language, 'Chưa có', 'None') },
        ]}
      />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Không thể sửa', 'Read only')}
        title={textByLanguage(language, 'Dấu vết Case', 'Case trail')}
      />
      <WorkerV5CaseTrailCard deal={deal} language={language} reduceTransparency={reduceTransparency} />
      <WorkerV5ActionRail
        onPrimary={navigateToEarnings}
        onSecondary={navigateToRanking}
        primary={textByLanguage(language, 'Mở thu nhập', 'Open earnings')}
        primaryTestID="worker-v5-case-closed-earnings-action"
        primaryVariant="source"
        reduceTransparency={reduceTransparency}
        secondary={textByLanguage(language, 'Xem điểm hạng', 'View ranking')}
        secondaryTestID="worker-v5-case-closed-ranking-action"
      />
    </View>
  )
}

type WorkerV5KaelOrbMode = 'intake' | 'normal'

function WorkerV5KaelOrbScreenSurface({
  deal,
  language,
  mode,
  navigateToScreen,
  reduceMotion,
  reduceTransparency,
  screen,
  surfaceStyle,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  mode: WorkerV5KaelOrbMode
  navigateToScreen: (id: WorkerV5ScreenId) => void
  reduceMotion: boolean
  reduceTransparency: boolean
  screen: WorkerV5ScreenDefinition
  surfaceStyle: StyleProp<ViewStyle>
}) {
  const title = mode === 'normal'
    ? 'Kael'
    : textByLanguage(language, 'Kael nhận việc', 'Kael intake')
  const [modeMenuOpen, setModeMenuOpen] = useState(false)
  const modeMenuOpacity = useSharedValue(reduceMotion ? 1 : 0)
  const modeMenuScale = useSharedValue(reduceMotion ? 1 : 0.96)
  const modeMenuSheenOpacity = useSharedValue(0)
  const modeMenuSheenX = useSharedValue(-92)
  const modeMenuTranslateY = useSharedValue(reduceMotion ? 0 : -6)

  const switchMode = (nextMode: WorkerV5KaelOrbMode) => {
    setModeMenuOpen(false)
    navigateToScreen(nextMode === 'normal' ? '3.1-kael-chat-normal' : '3.2-kael-job-intake')
  }
  const toggleModeMenu = () => {
    if (!modeMenuOpen) {
      modeMenuOpacity.value = reduceMotion ? 1 : 0
      modeMenuScale.value = reduceMotion ? 1 : 0.96
      modeMenuSheenOpacity.value = 0
      modeMenuSheenX.value = -92
      modeMenuTranslateY.value = reduceMotion ? 0 : -6
    }
    setModeMenuOpen((current) => !current)
  }
  const animatedModeMenuStyle = useAnimatedStyle(() => ({
    opacity: modeMenuOpacity.value,
    transform: [
      { translateY: modeMenuTranslateY.value },
      { scale: modeMenuScale.value },
    ],
  }))
  const animatedModeMenuSheenStyle = useAnimatedStyle(() => ({
    opacity: modeMenuSheenOpacity.value,
    transform: [
      { translateX: modeMenuSheenX.value },
      { rotate: '-10deg' },
    ],
  }))

  useEffect(() => {
    if (!modeMenuOpen) return
    if (reduceMotion) {
      modeMenuOpacity.value = 1
      modeMenuScale.value = 1
      modeMenuSheenOpacity.value = 0
      modeMenuTranslateY.value = 0
      return
    }

    modeMenuOpacity.value = withTiming(1, { duration: motionDuration(140, reduceMotion) })
    modeMenuScale.value = withSpring(1, motionTokens.liquid.entrance)
    modeMenuTranslateY.value = withSpring(0, motionTokens.liquid.entrance)
    if (!reduceTransparency) {
      modeMenuSheenOpacity.value = withSequence(
        withTiming(0.58, { duration: motionDuration(90, reduceMotion) }),
        withDelay(170, withTiming(0, { duration: motionDuration(180, reduceMotion) })),
      )
      modeMenuSheenX.value = withTiming(96, { duration: motionDuration(340, reduceMotion) })
    }
  }, [modeMenuOpen, modeMenuOpacity, modeMenuScale, modeMenuSheenOpacity, modeMenuSheenX, modeMenuTranslateY, reduceMotion, reduceTransparency])

  return (
    <SafeAreaView style={[styles.safeArea, surfaceStyle, styles.kaelOrbCustomerSafeArea]} testID={`worker-v5-screen-${screen.id}`}>
      {!reduceTransparency ? (
        <>
          <WorkerV5CustomerFulfillmentCanvasAura
            scope="KaelOrbCustomerPage"
            testID="worker-v5-kael-orb-background-mint-aura"
          />
          <WorkerV5CustomerZipMintAura
            scope="KaelOrbCustomerPageFine"
            style={styles.kaelOrbPageZipAura}
            testID="worker-v5-kael-orb-page-zip-mint-aura"
          />
        </>
      ) : null}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kaelOrbCustomerKeyboard}>
        <View
          style={[styles.kaelOrbCustomerChatFrame, mode === 'intake' ? styles.kaelOrbCustomerChatFrameIntake : null]}
          testID="worker-v5-kael-customer-frame"
        >
          <View style={[styles.kaelOrbCustomerTopBar, reduceTransparency && styles.opaqueCard]} testID="worker-v5-kael-source-header">
            <Pressable
              accessibilityLabel={language === 'vi' ? 'Quay lại' : 'Back'}
              accessibilityRole="button"
              onPress={() => navigateToScreen('1.2-shift-brief')}
              style={({ pressed }) => [styles.kaelOrbCustomerTopControl, pressed ? styles.pressed : null]}
              testID="worker-v5-back"
            >
              <WorkerV5BackArrowIcon />
            </Pressable>
            <View style={styles.kaelOrbCustomerTopCopy}>
              <Text
                adjustsFontSizeToFit
                minimumFontScale={0.68}
                numberOfLines={1}
                style={styles.kaelOrbCustomerTopTitle}
                testID="worker-v5-kael-source-title"
              >
                {title}
              </Text>
            </View>
            <Pressable
              accessibilityLabel={textByLanguage(language, 'Chuyển chế độ chat', 'Switch chat mode')}
              accessibilityRole="button"
              onPress={toggleModeMenu}
              style={({ pressed }) => [styles.kaelOrbCustomerTopControl, pressed ? styles.pressed : null]}
              testID="worker-v5-kael-mode-toggle"
            >
              <Text style={styles.kaelOrbCustomerTopActionText}>⇄</Text>
            </Pressable>
          </View>

          {modeMenuOpen ? (
            <Animated.View style={[styles.kaelOrbCustomerModeMenu, reduceTransparency && styles.opaqueCard, animatedModeMenuStyle]} testID="worker-v5-kael-mode-menu">
              {!reduceTransparency ? (
                <>
                  <WorkerV5SourceCardSkin testID="worker-v5-kael-mode-menu-skin" />
                  <WorkerV5CustomerCaseWideMintAura scope="KaelOrbModeMenu" style={styles.kaelOrbCustomerModeMenuAura} testID="worker-v5-kael-mode-menu-mint-aura" />
                  <View pointerEvents="none" style={styles.kaelOrbCustomerModeMenuTopLight} testID="worker-v5-kael-mode-menu-top-light" />
                  <View pointerEvents="none" style={styles.kaelOrbCustomerModeMenuInnerShadow} testID="worker-v5-kael-mode-menu-inner-shadow" />
                  {!reduceMotion ? <Animated.View pointerEvents="none" style={[styles.kaelOrbCustomerModeMenuSheen, animatedModeMenuSheenStyle]} testID="worker-v5-kael-mode-menu-sheen" /> : null}
                </>
              ) : null}
              {([
                { label: textByLanguage(language, 'Chat thường', 'Normal chat'), value: 'normal' as const },
                { label: textByLanguage(language, 'Nhận việc', 'Job intake'), value: 'intake' as const },
              ]).map((item) => {
                const selected = mode === item.value
                return (
                  <Pressable
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    key={item.value}
                    onPress={() => switchMode(item.value)}
                    style={({ pressed }) => [
                      styles.kaelOrbCustomerModeMenuOption,
                      selected ? styles.kaelOrbCustomerModeMenuOptionActive : null,
                      pressed ? styles.pressed : null,
                    ]}
                    testID={`worker-v5-kael-mode-menu-${item.value}`}
                  >
                    <Text style={[styles.kaelOrbCustomerModeMenuText, selected ? styles.kaelOrbCustomerModeMenuTextActive : null]}>{item.label}</Text>
                  </Pressable>
                )
              })}
            </Animated.View>
          ) : null}

          <WorkerV5KaelOrbBody
            deal={deal}
            language={language}
            mode={mode}
            modeMenuOpen={modeMenuOpen}
            navigateToScreen={navigateToScreen}
            reduceTransparency={reduceTransparency}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function WorkerV5KaelOrbBody({
  deal,
  language,
  mode,
  modeMenuOpen = false,
  navigateToScreen,
  reduceTransparency,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  mode: WorkerV5KaelOrbMode
  modeMenuOpen?: boolean
  navigateToScreen: (id: WorkerV5ScreenId) => void
  reduceTransparency: boolean
}) {
  return (
    <View style={styles.kaelOrbCustomerShell} testID={`worker-v5-kael-orb-${mode}`}>
      <ScrollView
        bounces={false}
        contentContainerStyle={[styles.kaelOrbCustomerTranscript, modeMenuOpen ? styles.kaelOrbCustomerTranscriptMenuOpen : null]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.kaelOrbCustomerTranscriptScroll}
        testID="worker-v5-kael-orb-transcript"
      >
        {mode === 'normal' ? (
          <WorkerV5KaelOrbNormalThread
            deal={deal}
            language={language}
            reduceTransparency={reduceTransparency}
          />
        ) : (
          <WorkerV5KaelOrbIntakeThread
            deal={deal}
            language={language}
            onOpenOpportunity={() => navigateToScreen('2.2-offer-detail')}
            reduceTransparency={reduceTransparency}
          />
        )}
      </ScrollView>
      <WorkerV5KaelOrbComposer
        language={language}
        mode={mode}
        reduceTransparency={reduceTransparency}
      />
    </View>
  )
}

function WorkerV5KaelOrbBoundary({
  language,
  mode,
  reduceTransparency,
}: {
  language: AppLanguage
  mode: WorkerV5KaelOrbMode
  reduceTransparency: boolean
}) {
  const normal = mode === 'normal'
  const title = normal
    ? textByLanguage(language, 'Không ghi quyết định vào Case', 'No decision writes to the case')
    : textByLanguage(language, 'Chỉ lọc cơ hội thật', 'Real opportunities only')
  const body = normal
    ? textByLanguage(
        language,
        'Chat này dùng cho tư vấn chung. Chuyển sang Nhận việc khi cần Kael lọc cơ hội thật.',
        'This chat is for general advice. Kael does not create work actions from this screen.',
      )
    : textByLanguage(
        language,
        'Kael chỉ giải thích cơ hội NestScout gửi tới thợ. Việc nhận, từ chối hoặc đổi lịch vẫn cần bạn xác nhận.',
        'Kael does not accept, decline, reschedule, or share customer data. Authorized actions still need your confirmation.',
      )
  return (
    <View style={[styles.kaelOrbBoundaryCard, normal ? styles.kaelOrbBoundaryCardNormal : null, reduceTransparency && styles.opaqueCard]} testID="worker-v5-kael-orb-boundary">
      {!reduceTransparency ? (
        <>
          <WorkerV5SourceCardSkin testID="worker-v5-kael-orb-boundary-skin" />
          <WorkerV5CustomerCaseWideMintAura scope="KaelOrbBoundaryWide" style={styles.kaelOrbCardAura} testID="worker-v5-kael-orb-boundary-mint-aura" />
          <WorkerV5CustomerZipMintAura scope="KaelOrbBoundaryFine" style={styles.kaelOrbCardZipAura} testID="worker-v5-kael-orb-boundary-zip-mint-aura" />
        </>
      ) : null}
      <View style={styles.kaelOrbBoundaryIconShell}>
        {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
        <Image source={normal ? workerV5Icons.chat : workerV5Icons.jobs} style={styles.kaelOrbBoundaryIcon} />
      </View>
      <View style={styles.kaelOrbBoundaryCopy}>
        <Text style={styles.kaelOrbBoundaryStrong} numberOfLines={2}>{title}</Text>
        <Text style={styles.kaelOrbBoundaryText} numberOfLines={normal ? 3 : 4}>{body}</Text>
      </View>
    </View>
  )
}

function WorkerV5KaelOrbNormalThread({
  deal,
  language,
  reduceTransparency,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const service = deal?.draft.serviceType ? localizedServiceLabel(deal.draft.serviceType, language) : null
  const area = deal?.draft.districtLabel || deal?.broadcast?.generalArea || null
  const hasMedia = (deal?.draft.mediaCount ?? 0) > 0
  const customerKaelBody = deal
    ? textByLanguage(
        language,
        `Kael đang đọc dữ liệu thật${service ? ` của ${service}` : ''}${area ? ` tại ${area}` : ''}. Chat thường chỉ tư vấn và không ghi quyết định vào công việc.`,
        `Kael is reading real data${service ? ` for ${service}` : ''}${area ? ` in ${area}` : ''}. Normal chat is advisory only and does not write case decisions.`,
      )
    : textByLanguage(
        language,
        'Chào bạn, mình là Kael. Bạn muốn hỏi gì hôm nay?',
        'Hi, I am Kael. What would you like to ask today?',
      )
  const customerWorkerPrompt = textByLanguage(
    language,
    `Kael, hỗ trợ tôi chuẩn bị${service ? ` ${service}` : ''}${area ? ` tại ${area}` : ''}.`,
    `Kael, help me prepare${service ? ` ${service}` : ''}${area ? ` in ${area}` : ''}.`,
  )

  return (
    <View style={styles.kaelOrbChatBody} testID="worker-v5-kael-normal-thread">
      {deal ? (
        <WorkerV5KaelOrbBubble
          align="right"
          body={customerWorkerPrompt}
          role={textByLanguage(language, 'Bạn', 'You')}
        />
      ) : null}
      <WorkerV5KaelOrbBubble body={customerKaelBody} role="Kael" strongFirstLine={Boolean(deal)} />
      {hasMedia ? <WorkerV5KaelOrbMediaStrip count={Math.min(2, deal?.draft.mediaCount ?? 0)} reduceTransparency={reduceTransparency} /> : null}
    </View>
  )
}

function WorkerV5KaelOrbIntakeThread({
  deal,
  language,
  onOpenOpportunity,
  reduceTransparency,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  onOpenOpportunity: () => void
  reduceTransparency: boolean
}) {
  const service = deal?.broadcast?.serviceType ?? deal?.draft.serviceType
  const area = deal?.broadcast?.generalArea || deal?.draft.districtLabel || null
  const serviceLabel = service ? localizedServiceLabel(service, language) : null
  const hasOpportunity = Boolean(deal?.broadcast)
  if (!hasOpportunity) {
    return (
      <View style={styles.kaelOrbChatBody} testID="worker-v5-kael-intake-thread">
        <WorkerV5KaelOrbOpportunityResults
          deal={deal}
          language={language}
          onOpenOpportunity={onOpenOpportunity}
          reduceTransparency={reduceTransparency}
        />
      </View>
    )
  }
  const customerWorkerRequest = textByLanguage(
    language,
    `Tìm việc${serviceLabel ? ` ${serviceLabel}` : ''}${area ? ` tại ${area}` : ''} từ nguồn cơ hội thật.`,
    `Find${serviceLabel ? ` ${serviceLabel}` : ''} work${area ? ` in ${area}` : ''} from real opportunity sources.`,
  )
  const customerKaelReply = textByLanguage(
    language,
    'Kael đã đối chiếu kỹ năng, lịch trống, thời gian đến, độ tin cậy khách và thanh toán bảo vệ từ dữ liệu hiện có.',
    'Kael has compared skills, schedule, ETA, customer reliability, and protected payment from available data.',
  )

  return (
    <View style={styles.kaelOrbChatBody} testID="worker-v5-kael-intake-thread">
      <WorkerV5KaelOrbBubble align="right" body={customerWorkerRequest} role={textByLanguage(language, 'Bạn', 'You')} />
      <WorkerV5KaelOrbBubble body={customerKaelReply} role="Kael" />
      <WorkerV5KaelOrbOpportunityResults
        deal={deal}
        language={language}
        onOpenOpportunity={onOpenOpportunity}
        reduceTransparency={reduceTransparency}
      />
      {hasOpportunity ? (
        <WorkerV5KaelOrbBubble
          body={textByLanguage(
            language,
            'Đề xuất: mở cơ hội đầu tiên nếu dữ liệu thật đạt đủ điều kiện và không ảnh hưởng lịch còn lại.',
            'Suggestion: open the first opportunity if real data meets the conditions and does not affect the remaining schedule.',
          )}
          role="Kael"
          strongFirstLine
        />
      ) : null}
    </View>
  )
}

function WorkerV5KaelOrbBubble({
  align,
  body,
  role,
  strongFirstLine = false,
}: {
  align?: 'right'
  body?: string
  role: string
  strongFirstLine?: boolean
}) {
  return (
    <View
      accessibilityLabel={role}
      style={[styles.kaelOrbBubble, align === 'right' ? styles.kaelOrbBubbleRight : styles.kaelOrbBubbleLeft]}
      testID={`worker-v5-kael-bubble-${align === 'right' ? 'worker' : 'kael'}`}
    >
      <Text
        style={[
          styles.kaelOrbBubbleText,
          align === 'right' ? styles.kaelOrbBubbleTextRight : null,
          strongFirstLine ? styles.kaelOrbBubbleTextStrong : null,
        ]}
      >
        {body}
      </Text>
    </View>
  )
}

function WorkerV5KaelOrbCameraIcon({ color: strokeColor }: { color: string }) {
  return (
    <Svg
      fill="none"
      height={20}
      style={styles.kaelOrbComposerCameraIcon}
      testID="worker-v5-kael-orb-camera-icon"
      viewBox="0 0 24 24"
      width={20}
    >
      <Rect height={15.5} rx={5.2} stroke={strokeColor} strokeWidth={2} width={17.5} x={3.25} y={5.25} />
      <Circle cx={12} cy={13} r={3.8} stroke={strokeColor} strokeWidth={2} />
      <Circle cx={17.35} cy={9.4} fill={strokeColor} r={1.35} />
    </Svg>
  )
}

function WorkerV5KaelOrbMediaStrip({
  count,
  reduceTransparency,
}: {
  count: number
  reduceTransparency: boolean
}) {
  return (
    <View style={styles.kaelOrbMediaStrip} testID="worker-v5-kael-media-strip">
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={[styles.kaelOrbMediaThumb, index % 2 === 0 ? styles.kaelOrbMediaThumbSoft : styles.kaelOrbMediaThumbDark]} testID={`worker-v5-kael-media-thumb-${index}`}>
          {!reduceTransparency && index % 2 === 0 ? <WorkerV5CustomerZipMintAura scope={`KaelMediaThumb${index}`} style={styles.kaelOrbMediaAura} /> : null}
          <View style={styles.kaelOrbMediaLine} />
        </View>
      ))}
    </View>
  )
}

function WorkerV5KaelOrbQuickChips({
  chips,
  onNavigate,
}: {
  chips: readonly { label: string; target: WorkerV5ScreenId | null }[]
  onNavigate: (id: WorkerV5ScreenId) => void
}) {
  return (
    <View style={styles.kaelOrbQuickChips} testID="worker-v5-kael-quick-chips">
      {chips.map((chip, index) => (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !chip.target }}
          disabled={!chip.target}
          key={`${chip.label}-${index}`}
          onPress={() => {
            if (chip.target) onNavigate(chip.target)
          }}
          style={({ pressed }) => [
            styles.kaelOrbQuickChip,
            index === 0 ? styles.kaelOrbQuickChipSelected : null,
            !chip.target ? styles.kaelOrbQuickChipDisabled : null,
            pressed && chip.target ? styles.pressed : null,
          ]}
          testID={`worker-v5-kael-quick-chip-${index}`}
        >
          <Text style={[styles.kaelOrbQuickChipText, index === 0 ? styles.kaelOrbQuickChipTextSelected : null]} numberOfLines={1}>{chip.label}</Text>
        </Pressable>
      ))}
    </View>
  )
}

function WorkerV5KaelOrbOpportunityResults({
  deal,
  language,
  onOpenOpportunity,
  reduceTransparency,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  onOpenOpportunity: () => void
  reduceTransparency: boolean
}) {
  if (!deal?.broadcast) {
    return null
  }

  const serviceLabel = localizedServiceLabel(deal.broadcast.serviceType ?? deal.draft.serviceType, language)
  const area = deal.broadcast.generalArea || deal.draft.districtLabel || null
  const distance = buildWorkerV5RouteDistanceSignal(deal, language)
  const matchScore = workerV5KaelOpportunityMatchScore(deal)
  const title = matchScore == null ? serviceLabel : `${serviceLabel} · ${matchScore}%`
  const metaParts = [
    area,
    workerV5TimeChoiceLabel(deal.draft.timeChoice, language),
    distance.hasSignal ? distance.label : null,
  ].filter(Boolean)
  const meta = metaParts.length > 0
    ? metaParts.join(' · ')
    : textByLanguage(language, 'Dữ liệu thật đang đồng bộ', 'Real data is syncing')
  const earning = deal.broadcast.estimatedEarningLabel?.trim() || textByLanguage(language, 'Chờ dữ liệu thật', 'Waiting for real data')

  return (
    <View style={styles.kaelOrbOpportunityList} testID="worker-v5-kael-orb-opportunities">
      <View style={[styles.kaelOrbOpportunityCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-kael-orb-opportunity-card">
        {!reduceTransparency ? (
          <>
            <WorkerV5SourceCardSkin testID="worker-v5-kael-orb-opportunity-skin" />
            <WorkerV5CustomerCaseWideMintAura scope="KaelOrbOpportunityWide" style={styles.kaelOrbCardAura} testID="worker-v5-kael-orb-opportunity-mint-aura" />
            <WorkerV5CustomerZipMintAura scope="KaelOrbOpportunityFine" style={styles.kaelOrbCardZipAura} testID="worker-v5-kael-orb-opportunity-zip-mint-aura" />
          </>
        ) : null}
        <View style={styles.kaelOrbOpportunityIconShell}>
          {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
          <Image source={workerV5ServiceIcons[deal.broadcast.serviceType] ?? workerV5Icons.jobs} style={styles.kaelOrbOpportunityIcon} />
        </View>
        <View style={styles.kaelOrbOpportunityCopy}>
          <Text style={styles.kaelOrbOpportunityTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.kaelOrbOpportunityMeta} numberOfLines={2}>{meta}</Text>
        </View>
        <View style={styles.kaelOrbOpportunityAside}>
          <Text style={styles.kaelOrbOpportunityPayout} numberOfLines={2}>{earning}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={textByLanguage(language, 'Mở cơ hội thật', 'Open real opportunity')}
            onPress={onOpenOpportunity}
            style={({ pressed }) => [styles.kaelOrbOpenButton, pressed ? styles.pressed : null]}
            testID="worker-v5-kael-orb-open-opportunity"
          >
            <Text style={styles.kaelOrbOpenButtonText}>{textByLanguage(language, 'Mở', 'Open')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

function WorkerV5KaelOrbComposer({
  language,
  mode,
  reduceTransparency,
}: {
  language: AppLanguage
  mode: WorkerV5KaelOrbMode
  reduceTransparency: boolean
}) {
  const [draft, setDraft] = useState('')
  const [selectedMediaCount, setSelectedMediaCount] = useState(0)
  const trimmedDraft = draft.trim()
  const placeholder = textByLanguage(language, 'Nhập tin nhắn cho Kael...', 'Message Kael...')
  const disclaimer = textByLanguage(language, 'Kael có thể mắc lỗi. Hãy kiểm tra các thông tin quan trọng.', 'Kael can make mistakes. Check important information.')
  const mediaLabel = mode === 'normal'
    ? textByLanguage(language, 'Thêm ảnh cho Kael', 'Add photo for Kael')
    : textByLanguage(language, 'Thêm ảnh công việc cho Kael', 'Add work photo for Kael')

  const pickComposerMedia = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Kael', textByLanguage(language, 'Cần quyền thư viện ảnh để thêm ảnh cho Kael.', 'Photo library permission is needed to add a photo for Kael.'))
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: false,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.84,
    })
    if (result.canceled || result.assets.length === 0) return
    setSelectedMediaCount(1)
  }

  return (
    <View style={styles.kaelOrbComposerStack} testID="worker-v5-kael-orb-composer">
      <View style={[styles.kaelOrbComposerCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-kael-orb-composer-frame">
        {!reduceTransparency ? (
          <>
            <WorkerV5SourceCardSkin testID="worker-v5-kael-orb-composer-skin" />
            <WorkerV5CustomerCaseWideMintAura scope="KaelOrbComposerWide" style={styles.kaelOrbComposerAura} testID="worker-v5-kael-orb-composer-mint-aura" />
          </>
        ) : null}
        <Pressable
          accessibilityLabel={mediaLabel}
          accessibilityRole="button"
          onPress={pickComposerMedia}
          style={({ pressed }) => [
            styles.kaelOrbComposerCameraButton,
            pressed ? styles.pressed : null,
          ]}
          testID="worker-v5-kael-orb-camera"
        >
          <WorkerV5KaelOrbCameraIcon color={color.brand.primaryDark} />
          {selectedMediaCount > 0 ? (
            <View style={styles.kaelOrbComposerCameraBadge} testID="worker-v5-kael-orb-camera-count">
              <Text style={styles.kaelOrbComposerCameraBadgeText}>{selectedMediaCount}</Text>
            </View>
          ) : null}
        </Pressable>
        <KaelTextField
          accessibilityLabel={textByLanguage(language, 'Nhắn Kael', 'Message Kael')}
          inputShellStyle={styles.kaelOrbComposerInputShell}
          inputShellTestID="worker-v5-kael-orb-input-shell"
          onChangeText={setDraft}
          onSubmitEditing={() => {
            if (trimmedDraft || selectedMediaCount > 0) {
              setDraft('')
              setSelectedMediaCount(0)
            }
          }}
          placeholder={textByLanguage(language, 'Nhập tin nhắn cho Kael...', 'Message Kael...')}
          placeholderTextColor={color.text.muted}
          returnKeyType="send"
          shellStyle={styles.kaelOrbComposerField}
          style={styles.kaelOrbComposerInput}
          testID="worker-v5-kael-orb-input"
          value={draft}
        />
        <Pressable
          accessibilityLabel={textByLanguage(language, 'Gửi tin nhắn cho Kael', 'Send message to Kael')}
          accessibilityRole="button"
          onPress={() => {
            setDraft('')
            setSelectedMediaCount(0)
          }}
          style={({ pressed }) => [
            styles.kaelOrbSendButton,
            pressed && trimmedDraft ? styles.pressed : null,
          ]}
          testID="worker-v5-kael-orb-send"
        >
          <Text style={styles.kaelOrbSendText}>↑</Text>
        </Pressable>
      </View>
      <Text style={styles.kaelOrbComposerDisclaimer} testID="worker-v5-kael-orb-disclaimer">
        {textByLanguage(language, 'Kael có thể mắc lỗi. Hãy kiểm tra các thông tin quan trọng.', 'Kael can make mistakes. Check important information.')}
      </Text>
    </View>
  )
}

function WorkerV5KaelChatBody({
  language,
  navigateToScreen,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  navigateToScreen: (id: WorkerV5ScreenId) => void
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  return (
    <WorkerV5KaelOrbBody
      deal={runtime.state.deal}
      language={language}
      mode="normal"
      navigateToScreen={navigateToScreen}
      reduceTransparency={reduceTransparency}
    />
  )
}

function WorkerV5KaelJobIntakeBody({
  language,
  navigateToScreen,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  navigateToScreen: (id: WorkerV5ScreenId) => void
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  return (
    <WorkerV5KaelOrbBody
      deal={runtime.state.deal}
      language={language}
      mode="intake"
      navigateToScreen={navigateToScreen}
      reduceTransparency={reduceTransparency}
    />
  )
}

function WorkerV5OnsiteAdvisoryRail({
  deal,
  language,
  reduceTransparency,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const status = deal
    ? localizedStatusLabel(deal.status, language)
    : textByLanguage(language, 'Chưa có việc', 'No work')
  const area = deal?.draft.districtLabel || deal?.broadcast?.generalArea ||
    textByLanguage(language, 'khu vực chưa rõ', 'unknown area')

  return (
    <View style={[styles.onsiteAdvisoryRail, reduceTransparency && styles.opaqueCard]} testID="worker-onsite-advisory-rail">
      <Text style={styles.onsiteAdvisoryText} testID="worker-onsite-advisory-status">
        {textByLanguage(language, `Trạng thái sửa chữa: ${status}`, `Work status: ${status}`)}
      </Text>
      <Text style={styles.onsiteAdvisoryText} testID="worker-onsite-advisory-address">
        {textByLanguage(language, `Khu vực làm việc: ${area}`, `Service area: ${area}`)}
      </Text>
      <Text style={styles.onsiteAdvisoryText} testID="worker-onsite-advisory-scope">
        {textByLanguage(language, 'Không nhập giá trong chat; phát sinh phải đi qua luồng đổi phạm vi.', 'Do not enter prices in chat; scope changes must use the controlled flow.')}
      </Text>
      <Text style={styles.onsiteAdvisoryText} testID="worker-onsite-advisory-evidence">
        {textByLanguage(language, 'Ghi chú và ảnh chỉ hỗ trợ Kael tư vấn, không tự cập nhật trạng thái.', 'Notes and photos only help Kael advise; they do not update status automatically.')}
      </Text>
    </View>
  )
}

function WorkerV5CommandCenterBody({
  language,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const deal = runtime.state.deal
  const approvalCount = deal?.scopeChange ? 1 : 0

  return (
    <View style={styles.sectionStack}>
      <WorkerV5CommandCenterHero
        deal={deal}
        earnings={runtime.workerEarnings}
        language={language}
        reduceTransparency={reduceTransparency}
      />
      <WorkerV5ProgressRail activeStep={4} language={language} />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Nhật ký trực tiếp', 'Live log')}
        title={textByLanguage(language, 'Điều Kael dang điều phối', 'What Kael is coordinating')}
      />
      <WorkerV5CommandCenterLog deal={deal} language={language} reduceTransparency={reduceTransparency} />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Tất cả', 'All')}
        title={textByLanguage(language, 'Hồ sơ của việc', 'Work artifacts')}
      />
      <WorkerV5ArtifactGrid
        items={[
          { label: textByLanguage(language, 'Phạm vi', 'Scope'), value: deal?.scopeChange ? textByLanguage(language, 'Có nháp', 'Draft') : textByLanguage(language, 'Chưa có', 'None'), tone: deal?.scopeChange ? 'mint' : 'neutral' },
          { label: textByLanguage(language, 'Bằng chứng', 'Evidence'), value: deal?.completionPhotoUrls?.length ? `${deal.completionPhotoUrls.length}` : textByLanguage(language, 'Chưa có', 'None') },
          { label: textByLanguage(language, 'Duyệt', 'Approvals'), value: approvalCount ? `${approvalCount}` : textByLanguage(language, 'Không có', 'None') },
        ]}
      />
      <WorkerV5ActionRail
        primary={approvalCount ? textByLanguage(language, `Hàng duyệt · ${approvalCount}`, `Approval Queue · ${approvalCount}`) : textByLanguage(language, 'Không có hàng chờ', 'No queue')}
        reduceTransparency={reduceTransparency}
        secondary={textByLanguage(language, 'Trò chuyện việc', 'Work Chat')}
      />
      <InfoListCard reduceTransparency={reduceTransparency}>
        <WorkerV5InfoRow icon="jobs" label={textByLanguage(language, 'Việc hiện tại', 'Current work')} value={deal ? buildDealSummary(deal, language) : textByLanguage(language, 'Chưa có việc', 'No work')} />
        <WorkerV5InfoRow icon="evidence" label={textByLanguage(language, 'Bằng chứng', 'Evidence')} value={deal?.completionPhotoUrls?.length ? `${deal.completionPhotoUrls.length}` : textByLanguage(language, 'Chưa có nguồn hoàn tất', 'No completion sources')} />
        <WorkerV5InfoRow icon="document" label={textByLanguage(language, 'Cần thợ duyệt', 'Needs worker review')} value={approvalCount ? `${approvalCount}` : textByLanguage(language, 'Không có bản nháp đang chờ', 'No waiting draft')} />
      </InfoListCard>
    </View>
  )
}

function WorkerV5ApprovalQueueBody({
  language,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const scope = runtime.state.deal?.scopeChange ?? null

  return (
    <View style={styles.sectionStack}>
      <WorkerV5ApprovalQueueHero language={language} reduceTransparency={reduceTransparency} scope={scope} />
      <WorkerV5SectionHeader
        action={runtime.state.deal?.displayCode || runtime.state.deal?.id || textByLanguage(language, 'Việc thật', 'Real work')}
        title={textByLanguage(language, 'Cần duyệt ngay', 'Needs review')}
      />
      <WorkerV5ApprovalDraftCard language={language} reduceTransparency={reduceTransparency} scope={scope} />
      <WorkerV5ActionRail
        primary={scope ? textByLanguage(language, 'Mở bản nháp', 'Open draft') : textByLanguage(language, 'Chờ bản nháp', 'Waiting for draft')}
        reduceTransparency={reduceTransparency}
        secondary={textByLanguage(language, 'Chỉnh sửa', 'Edit')}
      />
      <WorkerV5ArtifactGrid
        items={[
          { label: textByLanguage(language, 'Bản nháp', 'Draft'), value: scope?.requestedDescription ? textByLanguage(language, 'Đã có', 'Available') : textByLanguage(language, 'Chưa có', 'None'), tone: scope?.requestedDescription ? 'mint' : 'neutral' },
          { label: textByLanguage(language, 'Bằng chứng', 'Evidence'), value: scope?.evidencePhotoUrls?.length ? `${scope.evidencePhotoUrls.length}` : textByLanguage(language, 'Chưa có', 'None') },
          { label: textByLanguage(language, 'Dấu vết', 'Audit'), value: scope?.createdAt ? textByLanguage(language, 'Đã ghi', 'Recorded') : textByLanguage(language, 'Chưa có', 'None') },
        ]}
      />
      <WorkerV5EvidenceTray
        emptyLabel={textByLanguage(language, 'Chưa có', 'None')}
        language={language}
        reduceTransparency={reduceTransparency}
        urls={scope?.evidencePhotoUrls ?? []}
      />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Dấu vết kiểm tra', 'Audit trail')}
        title={textByLanguage(language, 'Quyết định gần đây', 'Recent decisions')}
      />
      <WorkerV5ApprovalDecisionList language={language} reduceTransparency={reduceTransparency} scope={scope} />
      <InfoListCard reduceTransparency={reduceTransparency}>
        <WorkerV5InfoRow icon="scope" label={textByLanguage(language, 'Bản nháp đổi phạm vi', 'Scope draft')} value={scope?.requestedDescription || textByLanguage(language, 'Chưa có bản nháp thật', 'No real draft')} />
        <WorkerV5InfoRow icon="shield" label={textByLanguage(language, 'Nguồn độc lập', 'Source check')} value={scope?.evidencePhotoUrls?.length ? `${scope.evidencePhotoUrls.length}` : textByLanguage(language, 'Chưa có bằng chứng dính kèm', 'No attached evidence')} />
        <WorkerV5InfoRow icon="clock" label={textByLanguage(language, 'Dấu vết', 'Audit trail')} value={scope?.createdAt || textByLanguage(language, 'Chưa có mốc gửi', 'No sent timestamp')} />
      </InfoListCard>
    </View>
  )
}

function WorkerV5CaseTimelineBody({
  language,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const deal = runtime.state.deal
  const events = buildKnownCaseEvents(deal, language)

  return (
    <View style={styles.sectionStack}>
      <WorkerV5TimelineHero
        eventCount={events.length}
        language={language}
        reduceTransparency={reduceTransparency}
      />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Mới nhất trước', 'Newest first')}
        title={textByLanguage(language, 'Sự kiện chính', 'Main events')}
      />
      <WorkerV5Timeline events={events} reduceTransparency={reduceTransparency} />
      <WorkerV5InfoGrid
        items={[
          { label: textByLanguage(language, 'Sự kiện', 'Events'), value: `${events.length}` },
          { label: textByLanguage(language, 'Trạng thái', 'Status'), value: deal ? localizedStatusLabel(deal.status, language) : textByLanguage(language, 'Chưa có việc', 'No work') },
          { label: textByLanguage(language, 'Nguồn', 'Source'), value: deal ? textByLanguage(language, 'Theo việc thật', 'Real work') : textByLanguage(language, 'Chưa có', 'None') },
        ]}
      />
      <WorkerV5ActionRail
        primary={textByLanguage(language, 'Quay lại việc', 'Back to work')}
        reduceTransparency={reduceTransparency}
        secondary={textByLanguage(language, 'Trung tâm điều phối', 'Command center')}
      />
    </View>
  )
}

function WorkerV5SafetyBody({
  language,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const deal = runtime.state.deal

  return (
    <View style={styles.sectionStack}>
      <WorkerV5SafetyHero language={language} reduceTransparency={reduceTransparency} />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Chọn một', 'Choose one')}
        title={textByLanguage(language, 'Tình huống hiện tại', 'Current situation')}
      />
      <WorkerV5SafetyRiskList language={language} reduceTransparency={reduceTransparency} />
      <WorkerV5KaelDraftCard
        body={textByLanguage(language, 'Kael ghi nhận sự cố, giữ nguồn việc và ngăn quy trình tiếp tục cho tới khi được xác nhận an toàn.', 'Kael records the incident, preserves work sources, and blocks workflow continuation until safety is confirmed.')}
        language={language}
        reduceTransparency={reduceTransparency}
        title={textByLanguage(language, 'Kael sẽ làm gì', 'What Kael does')}
      />
      <WorkerV5SuggestionChips
        items={[
          textByLanguage(language, 'Ghi nhận rủi ro', 'Record risk'),
          textByLanguage(language, 'Không có rủi ro', 'No risk'),
        ]}
      />
      <WorkerV5InfoGrid
        items={[
          { label: textByLanguage(language, 'Rủi ro', 'Risk'), value: textByLanguage(language, 'Thợ xác nhận', 'Worker confirms') },
          { label: textByLanguage(language, 'Tạm dừng', 'Pause'), value: textByLanguage(language, 'Theo quy trình', 'By workflow') },
          { label: textByLanguage(language, 'Hỗ trợ', 'Support'), value: textByLanguage(language, 'Trong app', 'In app') },
        ]}
      />
      <WorkerV5ActionRail
        primary={textByLanguage(language, 'Không có rủi ro', 'No risk')}
        reduceTransparency={reduceTransparency}
        secondary={textByLanguage(language, 'Ghi nhận rủi ro', 'Record risk')}
      />
      <InfoListCard reduceTransparency={reduceTransparency}>
        <WorkerV5InfoRow icon="jobs" label={textByLanguage(language, 'Việc', 'Work')} value={deal ? buildDealSummary(deal, language) : textByLanguage(language, 'Chưa có việc đang làm', 'No active work')} />
      </InfoListCard>
    </View>
  )
}

function WorkerV5EarningsOverviewBody({
  language,
  navigateToScreen,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  navigateToScreen: (id: WorkerV5ScreenId) => void
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const earnings = runtime.workerEarnings
  const recent = earnings?.daily_earnings?.slice(0, 3) ?? []

  return (
    <View style={styles.sectionStack}>
      <WorkerV5EarningsHero earnings={earnings} language={language} reduceTransparency={reduceTransparency} />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Xem tất cả ›', 'View all ›')}
        title={textByLanguage(language, 'Giao dịch gần đây', 'Recent transactions')}
      />
      <WorkerV5EarningsTransactionList
        language={language}
        recent={recent}
        reduceTransparency={reduceTransparency}
      />
      <WorkerV5ActionRail
        auraTestID="worker-v5-earnings-action-rail-mint-aura"
        formulaAura
        onPrimary={() => navigateToScreen('4.3-payout-request')}
        onSecondary={() => navigateToScreen('4.2-ledger-detail')}
        primary={textByLanguage(language, 'Rút tiền', 'Withdraw')}
        primaryTestID="worker-v5-earnings-withdraw-action"
        primaryVariant="source"
        reduceTransparency={reduceTransparency}
        secondary={textByLanguage(language, 'Chi tiết đối soát', 'Ledger detail')}
        secondaryTestID="worker-v5-earnings-ledger-action"
      />
    </View>
  )
}

function WorkerV5LedgerDetailBody({
  language,
  navigateToScreen,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  navigateToScreen: (id: WorkerV5ScreenId) => void
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const earnings = runtime.workerEarnings
  return (
    <View style={styles.sectionStack}>
      <WorkerV5LedgerHero earnings={earnings} language={language} reduceTransparency={reduceTransparency} />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Minh bạch', 'Transparent')}
        title={textByLanguage(language, 'Cấu phần giao dịch', 'Transaction breakdown')}
      />
      <WorkerV5LedgerBreakdownCard earnings={earnings} language={language} reduceTransparency={reduceTransparency} />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Không thể sửa', 'Immutable')}
        title={textByLanguage(language, 'Dấu vết thanh toán', 'Payment trail')}
      />
      <WorkerV5LedgerTraceTimeline earnings={earnings} language={language} reduceTransparency={reduceTransparency} />
      <WorkerV5ActionRail
        auraTestID="worker-v5-ledger-action-rail-mint-aura"
        formulaAura
        onPrimary={() => navigateToScreen('4.3-payout-request')}
        onSecondary={() => navigateToScreen('4.1-earnings-overview')}
        primary={textByLanguage(language, 'Tạo yêu cầu rút tiền', 'Create payout request')}
        primaryTestID="worker-v5-ledger-payout-action"
        primaryVariant="source"
        reduceTransparency={reduceTransparency}
        secondary={textByLanguage(language, 'Thu nhập', 'Earnings')}
        secondaryTestID="worker-v5-ledger-back-earnings-action"
      />
    </View>
  )
}

function WorkerV5PayoutRequestBody({
  language,
  navigateToScreen,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  navigateToScreen: (id: WorkerV5ScreenId) => void
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const earnings = runtime.workerEarnings
  const profile = runtime.workerProfile
  const balanceValue = typeof earnings?.net_earnings === 'number' ? earnings.net_earnings : 0
  const hasAccount = Boolean(profile?.bank_account_masked)
  const amountLabel = formatVndDong(balanceValue, language)
  return (
    <View style={styles.sectionStack}>
      <WorkerV5PayoutRequestHero earnings={earnings} language={language} reduceTransparency={reduceTransparency} />
      <WorkerV5SectionHeader
        action={textByLanguage(language, `Tối đa ${amountLabel}`, `Max ${amountLabel}`)}
        title={textByLanguage(language, 'Số tiền muốn rút', 'Withdrawal amount')}
      />
      <WorkerV5PayoutAmountCard earnings={earnings} language={language} reduceTransparency={reduceTransparency} />
      <WorkerV5SectionHeader
        action={hasAccount ? textByLanguage(language, 'Đã xác minh', 'Verified') : undefined}
        title={textByLanguage(language, 'Tài khoản nhận', 'Receiving account')}
      />
      <WorkerV5PayoutAccountCard language={language} profile={profile} reduceTransparency={reduceTransparency} />
      <WorkerV5SingleSourceActionButton
        disabled={false}
        label={textByLanguage(language, `Xác nhận rút ${amountLabel}`, `Confirm ${amountLabel}`)}
        onPress={() => navigateToScreen('4.4-payout-method')}
        reduceTransparency={reduceTransparency}
        testID="worker-v5-payout-request-confirm-action"
      />
    </View>
  )
}

function WorkerV5PayoutMethodBody({
  language,
  navigateToScreen,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  navigateToScreen: (id: WorkerV5ScreenId) => void
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const profile = runtime.workerProfile
  const hasBank = Boolean(profile?.bank_account_masked)
  const [selectedBank, setSelectedBank] = useState<WorkerV5BankLogoName | null>(() => resolveWorkerV5BankLogoName(profile?.bank_name))
  const [accountFormOpen, setAccountFormOpen] = useState(false)
  const [limitPolicyOpen, setLimitPolicyOpen] = useState(false)
  const [accountOwnerName, setAccountOwnerName] = useState(profile?.legal_name?.trim() ?? '')
  const [accountNumber, setAccountNumber] = useState('')
  const [precheckMessage, setPrecheckMessage] = useState<string | null>(null)
  const [payoutSaveMessage, setPayoutSaveMessage] = useState<string | null>(null)
  const [savingPayoutMethod, setSavingPayoutMethod] = useState(false)
  const accountOwnerNameReady = accountOwnerName.trim().length >= 2
  const accountNumberReady = /^\d{6,20}$/.test(accountNumber.trim())
  const canConfirmPayoutMethod = Boolean(selectedBank && accountOwnerNameReady && accountNumberReady)
  const runAccountPrecheck = () => {
    if (!selectedBank) {
      setPrecheckMessage(textByLanguage(language, 'Chọn ngân hàng nhận tiền trước khi kiểm tra.', 'Choose a receiving bank before checking.'))
      return
    }
    if (!accountOwnerNameReady || !accountNumberReady) {
      setPrecheckMessage(textByLanguage(language, 'Cần tên chủ tài khoản và số tài khoản hợp lệ để kiểm tra trước xác thực.', 'A valid account owner and account number are required before verification.'))
      return
    }
    setPrecheckMessage(textByLanguage(language, 'Đã kiểm tra định dạng. Tài khoản sẽ chờ xác thực qua hệ thống trước khi dùng để rút tiền.', 'Format checked. The account still waits for system verification before payout use.'))
  }
  const confirmPayoutMethod = async () => {
    if (!selectedBank || !accountOwnerNameReady || !accountNumberReady) {
      setPayoutSaveMessage(textByLanguage(language, 'Nhập đủ thông tin tài khoản hợp lệ trước khi xác nhận.', 'Enter valid receiving account details before confirming.'))
      return
    }
    setSavingPayoutMethod(true)
    setPayoutSaveMessage(null)
    const result = await runtime.actions.workerSavePayoutMethod({
      account_holder_name: accountOwnerName.trim(),
      bank_account: accountNumber.trim(),
      bank_key: selectedBank,
      bank_name: workerV5BankLabel(selectedBank),
    })
    setSavingPayoutMethod(false)
    if (result !== true) {
      setPayoutSaveMessage(result && typeof result === 'object' ? result.error : textByLanguage(language, 'Chưa lưu được tài khoản nhận tiền.', 'Could not save receiving account.'))
      return
    }
    setPayoutSaveMessage(textByLanguage(language, 'Đã gửi tài khoản nhận tiền để hệ thống xác thực. Tài khoản sẽ được dùng cho lượt rút tiền sau khi đối soát xong.', 'Receiving account sent for system verification. It will be used for payout after reconciliation.'))
  }
  return (
    <View style={styles.sectionStack}>
      <WorkerV5PayoutMethodHero language={language} profile={profile} reduceTransparency={reduceTransparency} selectedBank={selectedBank} />
      <WorkerV5SectionHeader
        action={textByLanguage(language, '6 ngân hàng', '6 banks')}
        title={textByLanguage(language, 'Ngân hàng Việt Nam', 'Vietnamese banks')}
      />
      <WorkerV5PayoutMethodBankGrid
        language={language}
        onSelectBank={(bank) => {
          setSelectedBank(bank)
          setPayoutSaveMessage(null)
        }}
        profile={profile}
        reduceTransparency={reduceTransparency}
        selectedBank={selectedBank}
      />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Cơ bản', 'Basic')}
        title={textByLanguage(language, 'Quản lý tài khoản', 'Account management')}
      />
      <WorkerV5PayoutAccountManagementRows
        accountFormOpen={accountFormOpen}
        language={language}
        limitPolicyOpen={limitPolicyOpen}
        onOpenAccountForm={() => {
          setAccountFormOpen(true)
          setLimitPolicyOpen(false)
        }}
        onOpenLimitPolicy={() => {
          setLimitPolicyOpen(true)
          setAccountFormOpen(false)
        }}
        profile={profile}
        reduceTransparency={reduceTransparency}
      />
      {accountFormOpen ? (
        <WorkerV5PayoutBankAccountForm
          accountNumber={accountNumber}
          accountOwnerName={accountOwnerName}
          language={language}
          onAccountNumberChange={(value) => {
            setAccountNumber(value.replace(/[^\d]/g, '').slice(0, 20))
            setPrecheckMessage(null)
            setPayoutSaveMessage(null)
          }}
          onAccountOwnerNameChange={(value) => {
            setAccountOwnerName(value)
            setPrecheckMessage(null)
            setPayoutSaveMessage(null)
          }}
          onPrecheck={runAccountPrecheck}
          precheckMessage={precheckMessage}
          reduceTransparency={reduceTransparency}
          selectedBank={selectedBank}
        />
      ) : null}
      {limitPolicyOpen ? (
        <WorkerV5PayoutLimitPolicyCard language={language} reduceTransparency={reduceTransparency} />
      ) : null}
      <WorkerV5SingleSourceActionButton
        disabled={savingPayoutMethod || (!hasBank && !canConfirmPayoutMethod)}
        label={textByLanguage(language, 'Dùng tài khoản đã chọn', 'Use selected account')}
        onPress={() => {
          if (canConfirmPayoutMethod) {
            void confirmPayoutMethod()
            return
          }
          navigateToScreen('4.3-payout-request')
        }}
        reduceTransparency={reduceTransparency}
        testID="worker-v5-payout-method-use-action"
      />
      {payoutSaveMessage ? (
        <Text style={styles.payoutMethodSaveStatus} numberOfLines={3} testID="worker-v5-payout-method-save-status">{payoutSaveMessage}</Text>
      ) : null}
    </View>
  )
}

function WorkerV5ProfileOverviewBody({
  language,
  navigateToScreen,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  navigateToScreen: (id: WorkerV5ScreenId) => void
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const profile = runtime.workerProfile
  const insights = runtime.workerPerformanceInsights
  return (
    <View style={styles.sectionStack}>
      <WorkerV5ProfileHeader insights={insights} language={language} profile={profile} reduceTransparency={reduceTransparency} />
      <WorkerV5ProfileDashboardCards insights={insights} language={language} profile={profile} reduceTransparency={reduceTransparency} />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Chi tiết hơn', 'More detail')}
        title={textByLanguage(language, 'Hồ sơ nghiệp vụ', 'Work dossier')}
      />
      <WorkerV5ProfileDossierCard
        insights={insights}
        language={language}
        onOpenReliability={() => navigateToScreen('5.4-reliability-insights')}
        onOpenSettings={() => navigateToScreen('5.10-support-settings')}
        onOpenSkills={() => navigateToScreen('5.3-skills-service-area')}
        profile={profile}
        reduceTransparency={reduceTransparency}
      />
    </View>
  )
}

function WorkerV5WorkerRankingBody({ language, reduceTransparency, runtime }: { language: AppLanguage; reduceTransparency: boolean; runtime: WorkerV5Runtime }) {
  const insights = runtime.workerPerformanceInsights
  const profile = runtime.workerProfile
  return (
    <View style={styles.sectionStack}>
      <WorkerV5RankingHero insights={insights} language={language} profile={profile} reduceTransparency={reduceTransparency} />
      <WorkerV5RankingStatsStrip insights={insights} language={language} profile={profile} reduceTransparency={reduceTransparency} />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Dữ liệu thật', 'Real data')}
        title={textByLanguage(language, 'Bảng xếp hạng khu vực', 'Area ranking')}
      />
      <WorkerV5RankingLeaderboard insights={insights} language={language} profile={profile} reduceTransparency={reduceTransparency} />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Có thể hành động', 'Actionable')}
        title={textByLanguage(language, 'Điều giúp bạn thăng hạng', 'Ranking improvements')}
      />
      <WorkerV5RankingImprovementList insights={insights} language={language} reduceTransparency={reduceTransparency} />
    </View>
  )
}

function WorkerV5SkillsServiceAreaBody({ language, reduceTransparency, runtime }: { language: AppLanguage; reduceTransparency: boolean; runtime: WorkerV5Runtime }) {
  const profile = runtime.workerProfile

  return (
    <View style={styles.sectionStack}>
      <WorkerV5SkillsServiceHero language={language} profile={profile} reduceTransparency={reduceTransparency} />
      <WorkerV5ServiceCardGrid language={language} profile={profile} reduceTransparency={reduceTransparency} />
      <WorkerV5ServiceAreaMapCard language={language} reduceTransparency={reduceTransparency} runtime={runtime} />
    </View>
  )
}

function WorkerV5ReliabilityInsightsBody({ language, reduceMotion, reduceTransparency, runtime }: { language: AppLanguage; reduceMotion: boolean; reduceTransparency: boolean; runtime: WorkerV5Runtime }) {
  const insights = runtime.workerPerformanceInsights
  const profile = runtime.workerProfile
  const axes = workerV5ReliabilityAxes(insights)
  const syncedAxes = axes.filter((axis) => axis.hasData)
  const weakestAxis = syncedAxes.slice().sort((left, right) => left.score - right.score)[0]
  const onTimeValue = workerV5ReliabilityPercentValue(insights?.on_time_rate_percent)
  const ratingValue = workerV5ReliabilityRatingValue(insights?.average_rating ?? profile?.rating, language)
  return (
    <View style={styles.sectionStack}>
      <WorkerV5ReliabilityHero insights={insights} language={language} profile={profile} reduceTransparency={reduceTransparency} />
      <View style={styles.reliabilityStatsGrid} testID="worker-v5-reliability-stat-grid">
        <WorkerV5ReliabilityStatTile
          label={textByLanguage(language, 'Hoàn tất', 'Completion')}
          testID="worker-v5-reliability-stat-completion"
          value={workerV5ReliabilityPercentValue(workerV5ReliabilityAxisScore(insights, 'completion'))}
        />
        <WorkerV5ReliabilityStatTile
          label={textByLanguage(language, 'Đúng hẹn', 'On-time')}
          testID="worker-v5-reliability-stat-arrival"
          value={onTimeValue}
        />
        <WorkerV5ReliabilityStatTile
          label={textByLanguage(language, 'Đánh giá', 'Rating')}
          testID="worker-v5-reliability-stat-rating"
          value={ratingValue}
        />
      </View>
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Có thể giải thích', 'Explainable')}
        title={textByLanguage(language, 'Thành phần điểm', 'Score components')}
      />
      <WorkerV5ReliabilityComponentList axes={axes} language={language} reduceMotion={reduceMotion} reduceTransparency={reduceTransparency} />
      {weakestAxis ? (
        <WorkerV5KaelDraftCard
          body={textByLanguage(language, `Kael ưu tiên cải thiện ${workerV5ReliabilityAxisTitle(weakestAxis.id, language)} vì đây là thành phần thấp nhất trong dữ liệu thật.`, `Kael prioritizes ${workerV5ReliabilityAxisTitle(weakestAxis.id, language)} because it is the lowest real component.`)}
          formulaAura
          language={language}
          reduceTransparency={reduceTransparency}
          title={textByLanguage(language, 'Kael gợi ý cải thiện', 'Kael coaching')}
        />
      ) : null}
    </View>
  )
}

function WorkerV5AccountUtilitiesBody({ language, reduceTransparency, runtime }: { language: AppLanguage; reduceTransparency: boolean; runtime: WorkerV5Runtime }) {
  const router = useRouter()
  const profile = runtime.workerProfile
  const area = profile?.districts?.length
    ? profile.districts.map((district) => formatWorkerDistrict(district, language)).join(', ')
    : textByLanguage(language, 'Chưa có khu vực', 'No areas')
  const radius = typeof profile?.service_radius_km === 'number' && Number.isFinite(profile.service_radius_km)
    ? `${profile.service_radius_km} km`
    : null
  const areaMeta = radius ? `${area} · ${radius}` : area
  const openMemoryPreferences = () => {
    router.replace('/(worker)/profile?ns_worker_screen=5.6-agent-memory-preferences' as never)
  }
  const openServiceArea = () => {
    router.replace('/(worker)/profile?ns_worker_screen=5.3-skills-service-area' as never)
  }
  const openVerificationDocuments = () => {
    router.replace('/(worker)/profile?ns_worker_screen=5.7-verification-documents' as never)
  }
  const openSupportSettings = () => {
    router.replace('/(worker)/profile?ns_worker_screen=5.10-support-settings' as never)
  }
  return (
    <View style={styles.sectionStack}>
      <WorkerV5AccountUtilityHero language={language} profile={profile} reduceTransparency={reduceTransparency} />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Mở chi tiết', 'Open detail')}
        title={textByLanguage(language, 'Tài khoản & công việc', 'Account and work')}
      />
      <WorkerV5UtilityGrid
        items={[
          {
            icon: 'shield',
            meta: textByLanguage(language, 'Kael nhớ có kiểm soát', 'Kael remembers with your control'),
            onPress: openMemoryPreferences,
            title: textByLanguage(language, 'Bộ nhớ & Ưu tiên', 'Memory and preferences'),
          },
          { icon: 'map', meta: areaMeta, onPress: openServiceArea, title: textByLanguage(language, 'Khu vực phục vụ', 'Service area') },
          { icon: 'document', meta: workerDocumentSummary(profile, language), onPress: openVerificationDocuments, title: textByLanguage(language, 'Giấy tờ & xác minh', 'Documents and verification') },
          { icon: 'scope', meta: textByLanguage(language, 'Thông báo, giao diện', 'Notifications, interface'), onPress: openSupportSettings, title: textByLanguage(language, 'Cài đặt', 'Settings') },
        ]}
        reduceTransparency={reduceTransparency}
      />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Bắt buộc', 'Required')}
        title={textByLanguage(language, 'Bảo mật & quyền hạn', 'Security and permissions')}
      />
      <WorkerV5AccountSecurityList language={language} profile={profile} reduceTransparency={reduceTransparency} />
    </View>
  )
}

function WorkerV5AgentMemoryBody({ language, reduceTransparency, runtime }: { language: AppLanguage; reduceTransparency: boolean; runtime: WorkerV5Runtime }) {
  const profile = runtime.workerProfile
  const [memoryToggleOverrides, setMemoryToggleOverrides] = useState<Partial<Record<WorkerV5MemoryPreferenceUiId, boolean>>>({})
  const [savingMemoryToggleIds, setSavingMemoryToggleIds] = useState<Partial<Record<WorkerV5MemoryPreferenceUiId, boolean>>>({})
  const memoryToggleRequestIds = useRef<Partial<Record<WorkerV5MemoryPreferenceUiId, number>>>({})
  const memoryTouchedToggleIds = useRef<Partial<Record<WorkerV5MemoryPreferenceUiId, true>>>({})
  const readMemoryToggle = (id: WorkerV5MemoryPreferenceUiId, initialValue: boolean) => memoryToggleOverrides[id] ?? initialValue
  useEffect(() => {
    let mounted = true
    memoryTouchedToggleIds.current = {}
    memoryToggleRequestIds.current = {}
    kaelMemoryService.getMyWorkerMemory()
      .then((response) => {
        if (!mounted) return
        if (response.success) {
          const remoteOverrides = workerV5MemoryPreferenceOverridesFromMemory(response.data.memory)
          setMemoryToggleOverrides((current) => {
            const next = { ...current }
            for (const [id, enabled] of Object.entries(remoteOverrides) as Array<[WorkerV5MemoryPreferenceUiId, boolean]>) {
              if (!memoryTouchedToggleIds.current[id]) {
                next[id] = enabled
              }
            }
            return next
          })
        }
      })
      .catch(() => {
        return undefined
      })
    return () => {
      mounted = false
    }
  }, [profile?.id])
  const setMemoryItemEnabled = (id: WorkerV5MemoryPreferenceUiId, nextEnabled: boolean) => {
    const requestId = (memoryToggleRequestIds.current[id] ?? 0) + 1
    memoryToggleRequestIds.current[id] = requestId
    memoryTouchedToggleIds.current[id] = true
    setMemoryToggleOverrides((current) => ({
      ...current,
      [id]: nextEnabled,
    }))
    setSavingMemoryToggleIds((current) => ({ ...current, [id]: true }))
    kaelMemoryService.updateMyWorkerPreference({
      enabled: nextEnabled,
      key: WORKER_V5_MEMORY_PREFERENCE_API_KEYS[id],
    })
      .then((response) => {
        if (memoryToggleRequestIds.current[id] !== requestId) return
        if (!response.success) {
          return
        }
        const remoteOverrides = workerV5MemoryPreferenceOverridesFromMemory(response.data.memory)
        setMemoryToggleOverrides((current) => ({
          ...current,
          ...Object.fromEntries(
            (Object.entries(remoteOverrides) as Array<[WorkerV5MemoryPreferenceUiId, boolean]>)
              .filter(([remoteId]) => remoteId === id || !memoryTouchedToggleIds.current[remoteId]),
          ),
          [id]: remoteOverrides[id] ?? nextEnabled,
        }))
      })
      .catch(() => {
        if (memoryToggleRequestIds.current[id] !== requestId) return
        return undefined
      })
      .finally(() => {
        if (memoryToggleRequestIds.current[id] !== requestId) return
        setSavingMemoryToggleIds((current) => ({ ...current, [id]: false }))
      })
  }
  const hasDistricts = Boolean(profile?.districts?.length)
  const hasRadius = typeof profile?.service_radius_km === 'number' && Number.isFinite(profile.service_radius_km)
  const hasServices = Boolean(profile?.service_types?.length)
  const districts = hasDistricts
    ? (profile?.districts ?? []).map((district) => formatWorkerDistrict(district, language)).join(', ')
    : textByLanguage(language, 'Chưa có khu vực đã ghi', 'No saved area')
  const radius = hasRadius
    ? `${profile.service_radius_km} km`
    : textByLanguage(language, 'Chưa có giới hạn di chuyển', 'No travel limit')
  const areaPreference = hasDistricts && hasRadius
    ? textByLanguage(language, `${districts} · bán kính ${radius}`, `${districts} · ${radius} radius`)
    : hasDistricts
      ? districts
      : textByLanguage(language, 'Chưa có khu vực đã ghi', 'No saved area')
  const services = hasServices
    ? (profile?.service_types ?? []).map((service) => localizedServiceLabel(service, language)).join(', ')
    : textByLanguage(language, 'Chưa có kỹ năng ưu tiên', 'No priority skills')
  const canFilterFromProfile = hasDistricts || hasServices || hasRadius
  const permissionItems: Array<{ enabled: boolean; icon: WorkerV5IconName; id: WorkerV5MemoryPreferenceUiId; label: string; value: string }> = [
    {
      id: 'area-preference',
      enabled: readMemoryToggle('area-preference', hasDistricts),
      icon: 'map' as const,
      label: textByLanguage(language, 'Ưu tiên khu vực', 'Area preference'),
      value: areaPreference,
    },
    {
      id: 'travel-limit',
      enabled: readMemoryToggle('travel-limit', hasRadius),
      icon: 'clock' as const,
      label: textByLanguage(language, 'Giới hạn di chuyển', 'Travel limit'),
      value: hasRadius ? textByLanguage(language, `Tối đa ${radius}`, `Up to ${radius}`) : radius,
    },
    {
      id: 'skill-preference',
      enabled: readMemoryToggle('skill-preference', hasServices),
      icon: 'tools' as const,
      label: textByLanguage(language, 'Ưu tiên kỹ năng', 'Skill preference'),
      value: services,
    },
  ]
  const boundaryItems: Array<{ enabled: boolean; icon: WorkerV5IconName; id: WorkerV5MemoryPreferenceUiId; label: string; value: string }> = [
    {
      id: 'opportunity-filter',
      enabled: readMemoryToggle('opportunity-filter', canFilterFromProfile),
      icon: 'jobs' as const,
      label: textByLanguage(language, 'Tự lọc cơ hội phù hợp', 'Auto-filter matching opportunities'),
      value: textByLanguage(language, 'Chỉ sắp xếp và đề xuất', 'Sorts and suggests only'),
    },
    {
      id: 'auto-accept-work',
      enabled: readMemoryToggle('auto-accept-work', false),
      icon: 'shield' as const,
      label: textByLanguage(language, 'Tự động nhận việc', 'Auto-accept work'),
      value: textByLanguage(language, 'Luôn khóa theo quyền quyết định của thợ', 'Always locked to worker authority'),
    },
  ]

  return (
    <View style={styles.sectionStack}>
      <WorkerV5MemoryHero language={language} reduceTransparency={reduceTransparency} />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Chỉnh sửa', 'Edit')}
        title={textByLanguage(language, 'Thông tin được phép dùng', 'Allowed information')}
      />
      <WorkerV5MemorySwitchList
        auraTestID="worker-v5-memory-permission-mint-aura"
        items={permissionItems}
        onChange={setMemoryItemEnabled}
        reduceTransparency={reduceTransparency}
        savingIds={savingMemoryToggleIds}
        testID="worker-v5-memory-permission-list"
      />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Không được vượt', 'Cannot bypass')}
        title={textByLanguage(language, 'Ranh giới tự động hóa', 'Automation boundary')}
      />
      <WorkerV5MemorySwitchList
        auraTestID="worker-v5-memory-boundary-mint-aura"
        items={boundaryItems}
        onChange={setMemoryItemEnabled}
        reduceTransparency={reduceTransparency}
        savingIds={savingMemoryToggleIds}
        testID="worker-v5-memory-boundary-list"
      />
    </View>
  )
}

function WorkerV5VerificationDocumentsBody({ language, reduceTransparency, runtime }: { language: AppLanguage; reduceTransparency: boolean; runtime: WorkerV5Runtime }) {
  const profile = runtime.workerProfile
  const checks = workerV5VerificationChecks(profile, language)
  const missingCount = checks.filter((check) => !check.done).length
  return (
    <View style={styles.sectionStack}>
      <WorkerV5VerificationHero language={language} profile={profile} reduceTransparency={reduceTransparency} />
      <WorkerV5SectionHeader
        action={missingCount ? textByLanguage(language, `${missingCount} mục thiếu`, `${missingCount} missing`) : textByLanguage(language, 'Không thiếu mục', 'No missing item')}
        title={textByLanguage(language, 'Hồ sơ bắt buộc', 'Required profile')}
      />
      <WorkerV5VerificationChecklist language={language} profile={profile} reduceTransparency={reduceTransparency} />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Kael theo dõi', 'Kael tracks')}
        title={textByLanguage(language, 'Nhắc gia hạn', 'Renewal reminder')}
      />
      <WorkerV5VerificationRenewalCard language={language} profile={profile} reduceTransparency={reduceTransparency} />
    </View>
  )
}

function WorkerV5BankTaxBody({ language, reduceTransparency, runtime }: { language: AppLanguage; reduceTransparency: boolean; runtime: WorkerV5Runtime }) {
  const earnings = runtime.workerEarnings
  const profile = runtime.workerProfile
  const hasBank = Boolean(profile?.bank_account_masked)
  const netEarnings = earnings?.net_earnings && earnings.net_earnings > 0
    ? formatVnd(earnings.net_earnings, language)
    : textByLanguage(language, 'Chưa có số dư thật', 'No real balance')
  const pending = earnings?.pending_payment_amount && earnings.pending_payment_amount > 0
    ? formatVnd(earnings.pending_payment_amount, language)
    : textByLanguage(language, 'Chưa có khoản đang chờ', 'No pending amount')

  return (
    <View style={styles.sectionStack}>
      <WorkerV5BankTaxHero earnings={earnings} language={language} profile={profile} reduceTransparency={reduceTransparency} />
      <WorkerV5PayoutRulesList earnings={earnings} language={language} reduceTransparency={reduceTransparency} />
      <WorkerV5BankCard language={language} profile={profile} reduceTransparency={reduceTransparency} />
      <WorkerV5BankChipGrid
        items={[
          {
            label: hasBank ? profile?.bank_name ?? textByLanguage(language, 'Ngân hàng', 'Bank') : textByLanguage(language, 'Ngân hàng', 'Bank'),
            selected: hasBank,
            value: hasBank ? profile?.bank_account_masked ?? textByLanguage(language, 'Đã xác minh', 'Verified') : textByLanguage(language, 'Chưa xác minh', 'Not verified'),
          },
          {
            label: textByLanguage(language, 'ĐẢnh danh', 'Identity'),
            selected: Boolean(profile?.has_cccd && profile?.has_selfie),
            value: workerDocumentSummary(profile, language),
          },
          {
            label: textByLanguage(language, 'Đối soát', 'Settlement'),
            selected: Boolean(earnings?.total_jobs_paid),
            value: formatDateRange(earnings?.from_date, earnings?.to_date, language),
          },
        ]}
        reduceTransparency={reduceTransparency}
      />
      <View style={styles.metricsGrid}>
        <MetricTile label={textByLanguage(language, 'Có thể rút', 'Available')} value={netEarnings} />
        <MetricTile label={textByLanguage(language, 'Đang chờ', 'Pending')} value={pending} />
      </View>
      <WorkerV5AccountChangeGuard language={language} profile={profile} reduceTransparency={reduceTransparency} />
      <InfoListCard reduceTransparency={reduceTransparency}>
        <WorkerV5InfoRow icon="wallet" label={textByLanguage(language, 'Tài khoản nhận tiền', 'Payout account')} reduceTransparency={reduceTransparency} value={hasBank ? `${profile?.bank_name ?? textByLanguage(language, 'Ngân hàng', 'Bank')} · ${profile?.bank_account_masked}` : textByLanguage(language, 'Chưa xác minh tài khoản', 'No verified account')} />
        <WorkerV5InfoRow icon="shield" label={textByLanguage(language, 'Trùng định danh hồ sơ', 'Profile identity match')} reduceTransparency={reduceTransparency} value={profile?.legal_name ? profile.legal_name : textByLanguage(language, 'Chưa có tên pháp lý', 'No legal name')} />
        <WorkerV5InfoRow icon="document" label={textByLanguage(language, 'Kỳ đối soát', 'Settlement period')} reduceTransparency={reduceTransparency} value={formatDateRange(earnings?.from_date, earnings?.to_date, language)} />
        <WorkerV5InfoRow icon="document" label={textByLanguage(language, 'Chứng từ thu nhập', 'Income document')} reduceTransparency={reduceTransparency} value={textByLanguage(language, 'Chưa có chứng từ thu nhập được đồng bộ', 'No synced income document')} />
        <WorkerV5InfoRow icon="clock" label={textByLanguage(language, 'Đổi tài khoản', 'Change account')} reduceTransparency={reduceTransparency} value={textByLanguage(language, 'Cần xác minh lại trước khi dùng cho rút tiền', 'Requires verification before payout use')} />
      </InfoListCard>
    </View>
  )
}

function WorkerV5ReviewsFeedbackBody({ language, reduceTransparency, runtime }: { language: AppLanguage; reduceTransparency: boolean; runtime: WorkerV5Runtime }) {
  const insights = runtime.workerPerformanceInsights
  const profile = runtime.workerProfile
  const reviewCount = insights?.review_count ?? 0
  return (
    <View style={styles.sectionStack}>
      <WorkerV5ReviewsHero insights={insights} language={language} profile={profile} reduceTransparency={reduceTransparency} />
      <WorkerV5ReviewSignalGrid insights={insights} language={language} profile={profile} />
      <View style={styles.metricsGrid}>
        <MetricTile label={textByLanguage(language, 'Đánh giá', 'Rating')} value={formatNullableRating(insights?.average_rating ?? profile?.rating, language)} />
        <MetricTile label={textByLanguage(language, 'Phản hồi', 'Reviews')} value={formatCountOrEmpty(reviewCount, textByLanguage(language, 'Chưa có', 'None yet'))} />
        <MetricTile label={textByLanguage(language, 'Đúng hẹn', 'On-time')} value={formatNullablePercent(insights?.on_time_rate_percent, language)} />
      </View>
      <WorkerV5RecentFeedbackList insights={insights} language={language} reduceTransparency={reduceTransparency} />
      <WorkerV5ReviewImprovementPlan insights={insights} language={language} reduceTransparency={reduceTransparency} />
      <InfoListCard reduceTransparency={reduceTransparency}>
        <WorkerV5InfoRow icon="chat" label={textByLanguage(language, 'Phản hồi gần đây', 'Recent feedback')} reduceTransparency={reduceTransparency} value={reviewCount > 0 ? textByLanguage(language, 'Chưa đồng bộ nội dung phản hồi chi tiết', 'Detailed review content is not synced') : textByLanguage(language, 'Chưa có phản hồi thật', 'No real feedback yet')} />
        <WorkerV5InfoRow icon="shield" label={textByLanguage(language, 'Tỷ lệ phản hồi', 'Response rate')} reduceTransparency={reduceTransparency} value={formatNullablePercent(insights?.response_rate_percent, language)} />
        <WorkerV5InfoRow icon="jobs" label={textByLanguage(language, 'Việc hoàn tất', 'Completed cases')} reduceTransparency={reduceTransparency} value={insights ? formatCountOrEmpty(insights.completed_job_count, textByLanguage(language, 'Chưa có', 'None yet')) : textByLanguage(language, 'Chưa có dữ liệu', 'No data')} />
        <WorkerV5InfoRow icon="document" label={textByLanguage(language, 'Gợi ý cải thiện', 'Improvement signal')} reduceTransparency={reduceTransparency} value={insights?.performance_score != null ? textByLanguage(language, 'Kael có thể giải thích từ dữ liệu hiệu suất hiện có', 'Kael can explain the current performance data') : textByLanguage(language, 'Cần thêm dữ liệu thật trước khi gợi ý', 'Needs more real data before suggestions')} />
      </InfoListCard>
    </View>
  )
}

function WorkerV5SupportSettingsBody({ language, reduceTransparency, runtime }: { language: AppLanguage; reduceTransparency: boolean; runtime: WorkerV5Runtime }) {
  return <WorkerV5SettingsBody language={language} reduceTransparency={reduceTransparency} runtime={runtime} />
}

function WorkerV5SettingsBody({ language, reduceTransparency, runtime }: { language: AppLanguage; reduceTransparency: boolean; runtime: WorkerV5Runtime }) {
  const router = useRouter()
  const { session, updateCustomerProfile, updatePassword } = useAuth()
  const metadata = session?.user.user_metadata
  const metadataFullName = workerV5StringFromUnknown(metadata?.full_name ?? metadata?.name)
  const metadataPhone = workerV5StringFromUnknown(metadata?.phone_number ?? metadata?.phone)
  const metadataEmail = workerV5StringFromUnknown(metadata?.contact_email) ?? session?.user.email ?? ''
  const [accountPanelOpen, setAccountPanelOpen] = useState(false)
  const [accountFullNameDraft, setAccountFullNameDraft] = useState(metadataFullName ?? '')
  const [accountPhoneDraft, setAccountPhoneDraft] = useState(metadataPhone ?? '')
  const [accountEmailDraft, setAccountEmailDraft] = useState(metadataEmail)
  const [accountSaving, setAccountSaving] = useState(false)
  const [accountMessage, setAccountMessage] = useState<string | null>(null)
  const [passwordPanelOpen, setPasswordPanelOpen] = useState(false)
  const [currentPasswordDraft, setCurrentPasswordDraft] = useState('')
  const [newPasswordDraft, setNewPasswordDraft] = useState('')
  const [confirmPasswordDraft, setConfirmPasswordDraft] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null)
  const currentLanguage = language === 'vi' ? 'Tiếng Việt' : 'English'
  const hasServiceArea = Boolean(runtime.workerProfile?.districts?.length || runtime.workerProfile?.service_radius_km)
  const accountCanSave = accountFullNameDraft.trim().length >= 2 || accountPhoneDraft.trim().length >= 6 || accountEmailDraft.trim().length >= 4
  const passwordMatches = newPasswordDraft.length > 0 && newPasswordDraft === confirmPasswordDraft
  const passwordCanSave = currentPasswordDraft.trim().length > 0 && newPasswordDraft.length >= 8 && passwordMatches

  const saveAccountSettings = async () => {
    if (accountSaving || !accountCanSave) return
    setAccountSaving(true)
    setAccountMessage(null)
    const result = await updateCustomerProfile({
      email: accountEmailDraft.trim(),
      fullName: accountFullNameDraft.trim(),
      phone: accountPhoneDraft.trim(),
    })
    setAccountSaving(false)
    setAccountMessage(result.success ? textByLanguage(language, 'Đã lưu thông tin.', 'Saved') : (result.error ?? textByLanguage(language, 'Chưa thể lưu thông tin.', 'Could not save details.')))
  }

  const savePasswordSettings = async () => {
    if (passwordSaving || !passwordCanSave) return
    setPasswordSaving(true)
    setPasswordMessage(null)
    const result = await updatePassword({
      currentPassword: currentPasswordDraft.trim(),
      newPassword: newPasswordDraft,
    })
    setPasswordSaving(false)
    setPasswordMessage(result.success ? textByLanguage(language, 'Đã đổi mật khẩu.', 'Password changed') : (result.error ?? textByLanguage(language, 'Chưa thể đổi mật khẩu.', 'Could not change password.')))
    if (result.success) {
      setCurrentPasswordDraft('')
      setNewPasswordDraft('')
      setConfirmPasswordDraft('')
    }
  }

  const switchSettingsLanguage = () => {
    const nextLanguage = language === 'vi' ? 'en' : 'vi'
    setAppLanguage(nextLanguage)
    router.replace(`/(worker)/profile?ns_worker_screen=5.10-support-settings&ns_worker_lang=${nextLanguage}` as never)
  }

  return (
    <View style={styles.sectionStack} testID="worker-v5-settings-screen">
      <WorkerV5SettingsHero language={language} reduceTransparency={reduceTransparency} />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Cơ bản', 'Basics')}
        title={textByLanguage(language, 'Cài đặt chung', 'General settings')}
      />
      <View style={[styles.workerSettingsListCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-settings-list">
        {!reduceTransparency ? <WorkerV5EarningsHomeListAura testID="worker-v5-settings-list-mint-aura" /> : null}
        <WorkerV5SettingsActionRow
          body={textByLanguage(language, 'Cập nhật tên, số điện thoại và email liên hệ.', 'Update name, phone, and contact email.')}
          icon="profile"
          onPress={() => {
            setAccountPanelOpen((current) => !current)
            setAccountMessage(null)
          }}
          reduceTransparency={reduceTransparency}
          status={accountPanelOpen ? textByLanguage(language, 'Ẩn', 'Hide') : textByLanguage(language, 'Sửa', 'Edit')}
          testID="worker-v5-settings-account"
          title={textByLanguage(language, 'Thông tin cá nhân', 'Personal details')}
        />
        {accountPanelOpen ? (
          <View style={styles.workerSettingsForm} testID="worker-v5-settings-account-form">
            <KaelTextField
              accessibilityLabel={textByLanguage(language, 'Họ và tên', 'Full name')}
              inputShellStyle={styles.workerSettingsInputShell}
              onChangeText={(value) => {
                setAccountFullNameDraft(value)
                setAccountMessage(null)
              }}
              placeholder={textByLanguage(language, 'Họ và tên', 'Full name')}
              style={styles.workerSettingsInput}
              testID="worker-v5-settings-account-name-input"
              value={accountFullNameDraft}
            />
            <KaelTextField
              accessibilityLabel={textByLanguage(language, 'Số điện thoại', 'Phone number')}
              inputShellStyle={styles.workerSettingsInputShell}
              keyboardType="phone-pad"
              onChangeText={(value) => {
                setAccountPhoneDraft(value)
                setAccountMessage(null)
              }}
              placeholder={textByLanguage(language, 'Số điện thoại', 'Phone number')}
              style={styles.workerSettingsInput}
              testID="worker-v5-settings-account-phone-input"
              value={accountPhoneDraft}
            />
            <KaelTextField
              accessibilityLabel={textByLanguage(language, 'Email liên hệ', 'Contact email')}
              autoCapitalize="none"
              inputShellStyle={styles.workerSettingsInputShell}
              keyboardType="email-address"
              onChangeText={(value) => {
                setAccountEmailDraft(value)
                setAccountMessage(null)
              }}
              placeholder={textByLanguage(language, 'Email liên hệ', 'Contact email')}
              style={styles.workerSettingsInput}
              testID="worker-v5-settings-account-email-input"
              value={accountEmailDraft}
            />
            <KaelButton
              disabled={accountSaving || !accountCanSave}
              label={accountSaving ? textByLanguage(language, 'Đang lưu', 'Saving') : textByLanguage(language, 'Lưu thông tin', 'Save details')}
              onPress={() => void saveAccountSettings()}
              showPrimaryGradient={false}
              style={[styles.workerSettingsSaveButton, accountCanSave && !accountSaving ? styles.workerSettingsSaveButtonActive : null]}
              testID="worker-v5-settings-account-save"
            />
            {accountMessage ? (
              <Text
                style={accountMessage.includes('Đã') || accountMessage === 'Saved' ? styles.workerSettingsMessage : styles.workerSettingsMessageError}
                testID="worker-v5-settings-account-message"
              >
                {accountMessage}
              </Text>
            ) : null}
          </View>
        ) : null}
        <View style={styles.workerSettingsDivider} />
        <WorkerV5SettingsActionRow
          body={textByLanguage(language, 'Chuyển ngôn ngữ giao diện.', 'Switch app language.')}
          icon="chat"
          onPress={switchSettingsLanguage}
          reduceTransparency={reduceTransparency}
          status={currentLanguage}
          testID="worker-v5-settings-language"
          title={textByLanguage(language, 'Ngôn ngữ', 'Language')}
        />
        <View style={styles.workerSettingsDivider} />
        <WorkerV5SettingsActionRow
          body={textByLanguage(language, 'Xác nhận mật khẩu hiện tại trước khi đổi.', 'Confirm the current password first.')}
          icon="shield"
          onPress={() => {
            setPasswordPanelOpen((current) => !current)
            setPasswordMessage(null)
          }}
          reduceTransparency={reduceTransparency}
          status={passwordPanelOpen ? textByLanguage(language, 'Ẩn', 'Hide') : textByLanguage(language, 'Đổi', 'Change')}
          testID="worker-v5-settings-password"
          title={textByLanguage(language, 'Bảo mật đăng nhập', 'Login security')}
        />
        {passwordPanelOpen ? (
          <View style={styles.workerSettingsForm} testID="worker-v5-settings-password-form">
            <KaelTextField
              accessibilityLabel={textByLanguage(language, 'Mật khẩu hiện tại', 'Current password')}
              inputShellStyle={styles.workerSettingsInputShell}
              onChangeText={(value) => {
                setCurrentPasswordDraft(value)
                setPasswordMessage(null)
              }}
              placeholder={textByLanguage(language, 'Mật khẩu hiện tại', 'Current password')}
              secureTextEntry
              style={styles.workerSettingsInput}
              testID="worker-v5-settings-password-current-input"
              value={currentPasswordDraft}
            />
            <KaelTextField
              accessibilityLabel={textByLanguage(language, 'Mật khẩu mới', 'New password')}
              inputShellStyle={styles.workerSettingsInputShell}
              onChangeText={(value) => {
                setNewPasswordDraft(value)
                setPasswordMessage(null)
              }}
              placeholder={textByLanguage(language, 'Mật khẩu mới', 'New password')}
              secureTextEntry
              style={styles.workerSettingsInput}
              testID="worker-v5-settings-password-new-input"
              value={newPasswordDraft}
            />
            <KaelTextField
              accessibilityLabel={textByLanguage(language, 'Nhập lại mật khẩu mới', 'Confirm new password')}
              inputShellStyle={[styles.workerSettingsInputShell, confirmPasswordDraft.length > 0 && !passwordMatches ? styles.workerSettingsInputShellError : null]}
              onChangeText={(value) => {
                setConfirmPasswordDraft(value)
                setPasswordMessage(null)
              }}
              placeholder={textByLanguage(language, 'Nhập lại mật khẩu mới', 'Confirm new password')}
              secureTextEntry
              style={styles.workerSettingsInput}
              testID="worker-v5-settings-password-confirm-input"
              value={confirmPasswordDraft}
            />
            {confirmPasswordDraft.length > 0 && !passwordMatches ? (
              <Text style={styles.workerSettingsMessageError} testID="worker-v5-settings-password-mismatch">
                {textByLanguage(language, 'Mật khẩu chưa khớp.', 'Passwords do not match.')}
              </Text>
            ) : null}
            <KaelButton
              disabled={passwordSaving || !passwordCanSave}
              label={passwordSaving ? textByLanguage(language, 'Đang đổi', 'Changing') : textByLanguage(language, 'Lưu mật khẩu', 'Save password')}
              onPress={() => void savePasswordSettings()}
              showPrimaryGradient={false}
              style={[styles.workerSettingsSaveButton, passwordCanSave && !passwordSaving ? styles.workerSettingsSaveButtonActive : null]}
              testID="worker-v5-settings-password-save"
            />
            {passwordMessage ? (
              <Text
                style={passwordMessage.includes('Đã') || passwordMessage === 'Password changed' ? styles.workerSettingsMessage : styles.workerSettingsMessageError}
                testID="worker-v5-settings-password-message"
              >
                {passwordMessage}
              </Text>
            ) : null}
          </View>
        ) : null}
        <View style={styles.workerSettingsDivider} />
        <WorkerV5SettingsActionRow
          body={hasServiceArea ? textByLanguage(language, 'Khu vực phục vụ lấy từ hồ sơ thợ.', 'Service areas come from the worker profile.') : textByLanguage(language, 'Thiết lập khu vực phục vụ ưu tiên.', 'Set preferred service areas.')}
          icon="map"
          onPress={() => router.replace('/(worker)/profile?ns_worker_screen=5.3-skills-service-area' as never)}
          reduceTransparency={reduceTransparency}
          status={hasServiceArea ? textByLanguage(language, 'Mở', 'Open') : textByLanguage(language, 'Thiết lập', 'Set up')}
          testID="worker-v5-settings-service-area"
          title={textByLanguage(language, 'Khu vực phục vụ', 'Service areas')}
        />
        <View style={styles.workerSettingsDivider} />
        <WorkerV5SettingsActionRow
          body={textByLanguage(language, 'Ghi nhớ tương tác được phép; thợ có thể bật hoặc tắt.', 'Remember allowed interactions; the worker can turn it on or off.')}
          icon="shield"
          onPress={() => router.replace('/(worker)/profile?ns_worker_screen=5.6-agent-memory-preferences' as never)}
          reduceTransparency={reduceTransparency}
          status={textByLanguage(language, 'Mở', 'Open')}
          testID="worker-v5-settings-memory"
          title={textByLanguage(language, 'Bộ nhớ Kael', 'Kael memory')}
        />
      </View>
    </View>
  )
}

function WorkerV5OpportunityCard({
  deal,
  language,
  onOpenOpportunity,
  reduceTransparency,
}: {
  deal: LocalDeal
  language: AppLanguage
  onOpenOpportunity?: () => void
  reduceTransparency: boolean
}) {
  const earning = deal.broadcast?.estimatedEarningLabel ?? textByLanguage(language, 'Chờ Kael tính tiền công', 'Waiting for Kael earning')
  const area = deal.broadcast?.generalArea || deal.draft.districtLabel || textByLanguage(language, 'Khu vực đang ẩn', 'Area hidden')
  const meta = `${workerV5TimeChoiceLabel(deal.draft.timeChoice, language)} · ${area}`
  const progressLabel = textByLanguage(language, 'Phù hợp từ nguồn thật', 'Matched from real source')
  const serviceLabel = localizedServiceLabel(deal.draft.serviceType, language)
  const serviceIcon = deal.draft.serviceType ? workerV5ServiceIcons[deal.draft.serviceType] : workerV5Icons.jobs
  const distanceLabel = deal.broadcast
    ? textByLanguage(language, 'Đã gửi tới bạn', 'Sent to you')
    : textByLanguage(language, 'Chưa có broadcast', 'No broadcast yet')
  return (
    <View style={[styles.opportunityCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-opportunity-card">
      <View style={styles.opportunityIconTile}>
        <MintAura intensity="iconTile" style={styles.iconTileMintAura} />
        <Image source={serviceIcon} style={styles.opportunityIcon} />
      </View>
      <View style={styles.opportunityTextColumn}>
        <Text style={styles.opportunityTitle} numberOfLines={1}>{serviceLabel}</Text>
        <Text style={styles.opportunityMeta} numberOfLines={1}>{meta}</Text>
        <WorkerV5SourceProgressBar active={Boolean(deal.broadcast)} label={progressLabel} />
      </View>
      <View style={styles.opportunityPayoutColumn}>
        <Text style={styles.opportunityPayout} numberOfLines={2}>{earning}</Text>
        <Text style={styles.opportunityCaption} numberOfLines={2}>{distanceLabel}</Text>
        {onOpenOpportunity ? (
          <Pressable
            accessibilityLabel={textByLanguage(language, 'Mở cơ hội thật', 'Open real opportunity')}
            accessibilityRole="button"
            onPress={onOpenOpportunity}
            style={({ pressed }) => [styles.opportunityOpenButton, pressed ? styles.pressed : null]}
            testID="worker-v5-intake-open-opportunity"
          >
            <Text style={styles.opportunityOpenButtonText}>{textByLanguage(language, 'Mở', 'Open')}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

function WorkerV5OpportunityEmptyCard({
  language,
  reduceTransparency,
  tab,
}: {
  language: AppLanguage
  reduceTransparency: boolean
  tab: WorkerV5InboxTabId
}) {
  const title = tab === 'new'
    ? textByLanguage(language, 'Chưa có cơ hội mới', 'No new opportunity yet')
    : tab === 'saved'
      ? textByLanguage(language, 'Chưa có cơ hội đã lưu', 'No saved opportunity yet')
      : textByLanguage(language, 'Chưa có cơ hội phù hợp', 'No matching opportunity yet')
  const body = tab === 'new'
    ? textByLanguage(language, 'Cơ hội mới chỉ hiện khi NestScout gửi broadcast thật tới thợ.', 'New opportunities appear only after NestScout sends a real broadcast to the worker.')
    : tab === 'saved'
      ? textByLanguage(language, 'Cơ hội đã lưu sẽ hiện ở đây khi backend đồng bộ danh sách lưu thật.', 'Saved opportunities appear here after the backend syncs a real saved list.')
      : textByLanguage(language, 'Danh sách chỉ hiện cơ hội thật NestScout đã gửi tới thợ.', 'The list only shows real NestScout opportunities sent to the worker.')
  return (
    <View style={[styles.opportunityCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-opportunity-empty-card">
      <View style={styles.opportunityIconTile}>
        <MintAura intensity="iconTile" style={styles.iconTileMintAura} />
        <Image source={workerV5Icons.jobs} style={styles.opportunityIcon} />
      </View>
      <View style={styles.opportunityTextColumn}>
        <Text style={styles.opportunityTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.opportunityMeta} numberOfLines={2}>
          {body}
        </Text>
        <WorkerV5SourceProgressBar active={false} label={textByLanguage(language, 'Chờ dữ liệu thật', 'Waiting for real data')} />
      </View>
    </View>
  )
}

function WorkerV5SectionHeader({ action, title }: { action?: string; title: string }) {
  return (
    <View style={styles.sectionHeader} testID="worker-v5-section-header">
      <Text style={styles.sectionHeaderTitle}>{title}</Text>
      {action ? <Text style={styles.sectionHeaderAction}>{action}</Text> : null}
    </View>
  )
}

function WorkerV5BackArrowIcon() {
  return (
    <Svg height={18} style={styles.iconButtonIcon} viewBox="0 0 24 24" width={18}>
      <Path
        d="M15 18L9 12l6-6"
        fill="none"
        stroke={color.brand.primaryDark}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={3}
      />
    </Svg>
  )
}

function WorkerV5AvailabilityCard({
  language,
  onToggleAvailability,
  profile,
  reduceMotion = false,
  reduceTransparency,
}: {
  language: AppLanguage
  onToggleAvailability?: (isAvailable: boolean) => Promise<boolean>
  profile: WorkerV5Runtime['workerProfile']
  reduceMotion?: boolean
  reduceTransparency: boolean
}) {
  const [pending, setPending] = useState(false)
  const [optimisticAvailable, setOptimisticAvailable] = useState<boolean | null>(null)
  const availabilityRequestIdRef = useRef(0)
  const availabilityTitleDidMountRef = useRef(false)
  const availabilityTitleProgress = useSharedValue(1)
  const rawAvailable = optimisticAvailable ?? Boolean(profile?.is_available)
  const effectiveProfile = profile ? { ...profile, is_available: rawAvailable } : profile
  const availabilityTitle = workerAvailabilityLabel(effectiveProfile, language)
  const checked = Boolean(rawAvailable && profile?.is_approved && !profile?.is_suspended)
  const canToggle = Boolean(
    onToggleAvailability
      && profile
      && ((profile.is_approved && !profile.is_suspended) || rawAvailable),
  )
  const disabled = !canToggle

  useEffect(() => {
    availabilityRequestIdRef.current += 1
    setOptimisticAvailable(null)
    setPending(false)
  }, [profile?.id])

  useEffect(() => {
    if (pending || optimisticAvailable === null || profile?.is_available !== optimisticAvailable) return
    setOptimisticAvailable(null)
  }, [optimisticAvailable, pending, profile?.is_available])

  useEffect(() => {
    if (reduceMotion) {
      availabilityTitleProgress.value = 1
      availabilityTitleDidMountRef.current = true
      return
    }
    if (!availabilityTitleDidMountRef.current) {
      availabilityTitleProgress.value = 1
      availabilityTitleDidMountRef.current = true
      return
    }
    availabilityTitleProgress.value = 0.74
    availabilityTitleProgress.value = withTiming(1, {
      duration: 145,
      easing: Easing.out(Easing.quad),
    })
  }, [availabilityTitle, availabilityTitleProgress, reduceMotion])

  const availabilityTitleMotionStyle = useAnimatedStyle(() => ({
    opacity: availabilityTitleProgress.value,
    transform: [{ translateY: (1 - availabilityTitleProgress.value) * 8 }],
  }))

  const handleToggle = async () => {
    if (!onToggleAvailability || !canToggle) return
    const nextAvailability = rawAvailable ? false : true
    const requestId = availabilityRequestIdRef.current + 1
    availabilityRequestIdRef.current = requestId
    setOptimisticAvailable(nextAvailability)
    setPending(true)
    try {
      const saved = await onToggleAvailability(nextAvailability)
      if (availabilityRequestIdRef.current !== requestId) return
      if (!saved) {
        setOptimisticAvailable(null)
        Alert.alert(
          textByLanguage(language, 'Chưa cập nhật được trạng thái', 'Could not update status'),
          textByLanguage(language, 'Vui lòng thử lại sau khi kết nối ổn định.', 'Please try again once the connection is stable.'),
        )
      }
    } catch {
      if (availabilityRequestIdRef.current !== requestId) return
      setOptimisticAvailable(null)
      Alert.alert(
        textByLanguage(language, 'Chưa cập nhật được trạng thái', 'Could not update status'),
        textByLanguage(language, 'Vui lòng thử lại sau khi kết nối ổn định.', 'Please try again once the connection is stable.'),
      )
    } finally {
      if (availabilityRequestIdRef.current === requestId) setPending(false)
    }
  }

  return (
    <View style={[styles.availabilityCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-availability-card">
      <View style={styles.availabilityCopy}>
        <Animated.Text
          numberOfLines={1}
          style={[styles.workerCustomerFontText, styles.availabilityTitle, availabilityTitleMotionStyle]}
          testID="worker-v5-availability-title"
        >
          {availabilityTitle}
        </Animated.Text>
      </View>
      <Pressable
        accessibilityLabel={textByLanguage(language, 'Bật tắt nhận việc', 'Toggle work availability')}
        accessibilityRole="switch"
        accessibilityState={{ busy: pending, checked, disabled }}
        disabled={disabled}
        onPress={handleToggle}
        style={({ pressed }) => [
          styles.availabilitySwitch,
          checked ? styles.availabilitySwitchOn : null,
          disabled ? styles.availabilitySwitchDisabled : null,
          pressed && !reduceMotion ? styles.pressed : null,
        ]}
        testID="worker-v5-availability-switch"
      >
        <View style={[styles.availabilityKnob, checked ? styles.availabilityKnobOn : null]} />
      </Pressable>
    </View>
  )
}

function WorkerV5KaelBriefCard({
  auraScope,
  body,
  icon,
  reduceTransparency,
  source,
  title,
}: {
  auraScope?: string
  body?: string
  icon: WorkerV5IconName
  reduceTransparency: boolean
  source?: ImageSourcePropType
  title: string
}) {
  return (
    <View style={[styles.kaelBriefCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-kael-brief-card">
      {auraScope && !reduceTransparency ? (
        <>
          <WorkerV5CustomerCaseWideMintAura scope={`${auraScope}Wide`} style={styles.kaelBriefAura} />
          <WorkerV5CustomerZipMintAura scope={`${auraScope}Fine`} style={styles.kaelBriefZipAura} />
        </>
      ) : null}
      <View style={styles.kaelBriefIconTile}>
        <MintAura intensity="iconTile" style={styles.iconTileMintAura} />
        <Image source={source ?? workerV5Icons[icon]} style={styles.kaelBriefIcon} />
      </View>
      <View style={styles.kaelBriefText}>
        <Text style={styles.kaelBriefTitle}>{title}</Text>
        {body ? <Text style={styles.kaelBriefBody}>{body}</Text> : null}
      </View>
      <Text style={styles.kaelBriefChevron}>›</Text>
    </View>
  )
}

function WorkerV5HomeQuickActionGrid({
  items,
  onOpen,
  reduceMotion,
  reduceTransparency,
}: {
  items: ReadonlyArray<{ icon: WorkerV5IconName; meta: string; targetId: WorkerV5ScreenId; title: string }>
  onOpen: (id: WorkerV5ScreenId) => void
  reduceMotion: boolean
  reduceTransparency: boolean
}) {
  return (
    <View style={styles.quickActionGrid} testID="worker-v5-quick-action-grid">
      {items.map((item, index) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.title}. ${item.meta}`}
          key={`${item.icon}-${item.title}`}
          onPress={() => onOpen(item.targetId)}
          style={({ pressed }) => [
            styles.quickActionCard,
            styles.homeQuickActionCard,
            reduceTransparency && styles.opaqueCard,
            pressed && !reduceMotion ? styles.pressed : null,
          ]}
          testID={`worker-v5-quick-action-${index}`}
        >
          {!reduceTransparency ? <WorkerV5HomeQuickCardAura testID={`worker-v5-quick-action-mint-aura-${index}`} /> : null}
          <View style={styles.quickActionIconTile}>
            {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
            <Image source={workerV5Icons[item.icon]} style={styles.quickActionIcon} />
          </View>
          <View style={styles.quickActionText}>
            <Text style={styles.quickActionTitle} numberOfLines={2} testID={`worker-v5-quick-action-title-${index}`}>{item.title}</Text>
            <Text style={styles.quickActionMeta} numberOfLines={2} testID={`worker-v5-quick-action-meta-${index}`}>{item.meta}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  )
}

function WorkerV5QuickActionGrid({
  items,
  reduceTransparency,
}: {
  items: ReadonlyArray<{ icon: WorkerV5IconName; meta: string; title: string }>
  reduceTransparency: boolean
}) {
  return (
    <View style={styles.quickActionGrid} testID="worker-v5-quick-action-grid">
      {items.map((item, index) => (
        <View key={`${item.icon}-${item.title}`} style={[styles.quickActionCard, reduceTransparency && styles.opaqueCard]} testID={`worker-v5-quick-action-${index}`}>
          <View style={styles.quickActionIconTile}>
            {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
            <Image source={workerV5Icons[item.icon]} style={styles.quickActionIcon} />
          </View>
          <View style={styles.quickActionText}>
            <Text style={styles.quickActionTitle} numberOfLines={2} testID={`worker-v5-quick-action-title-${index}`}>{item.title}</Text>
            <Text style={styles.quickActionMeta} numberOfLines={2} testID={`worker-v5-quick-action-meta-${index}`}>{item.meta}</Text>
          </View>
        </View>
      ))}
    </View>
  )
}

function WorkerV5CustomerCaseWideMintAura({
  scope,
  style,
  testID,
}: {
  scope: string
  style?: StyleProp<ViewStyle>
  testID?: string
}) {
  const topId = `workerV5CaseWideMintAuraTop${scope}`
  const leftId = `workerV5CaseWideMintAuraLeft${scope}`
  const bottomId = `workerV5CaseWideMintAuraBottom${scope}`
  return (
    <View pointerEvents="none" style={[styles.workerV5CustomerCaseWideMintAura, style]} testID={testID}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 360 130" width="100%">
        <Defs>
          <RadialGradient id={topId} cx="88%" cy="2%" r="68%">
            <Stop offset="0" stopColor="rgba(143,226,212,0.38)" />
            <Stop offset="0.45" stopColor="rgba(230,251,243,0.17)" />
            <Stop offset="0.76" stopColor="rgba(230,251,243,0)" />
          </RadialGradient>
          <RadialGradient id={leftId} cx="5%" cy="96%" r="58%">
            <Stop offset="0" stopColor="rgba(83,220,206,0.20)" />
            <Stop offset="0.58" stopColor="rgba(230,251,243,0.11)" />
            <Stop offset="0.84" stopColor="rgba(230,251,243,0)" />
          </RadialGradient>
          <RadialGradient id={bottomId} cx="58%" cy="108%" r="58%">
            <Stop offset="0" stopColor="rgba(151,246,232,0.16)" />
            <Stop offset="0.72" stopColor="rgba(151,246,232,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill={`url(#${topId})`} height="130" width="360" />
        <Rect fill={`url(#${leftId})`} height="130" width="360" />
        <Rect fill={`url(#${bottomId})`} height="130" width="360" />
      </Svg>
    </View>
  )
}

function WorkerV5CustomerFulfillmentCanvasAura({
  scope,
  testID,
}: {
  scope: string
  testID?: string
}) {
  const safeScope = scope.replace(/[^a-zA-Z0-9]/g, '')
  const baseId = `workerV5FulfillmentCanvasBase${safeScope}`
  const topId = `workerV5FulfillmentCanvasTop${safeScope}`
  const heroId = `workerV5FulfillmentCanvasHero${safeScope}`
  const leftId = `workerV5FulfillmentCanvasLeft${safeScope}`
  const bottomId = `workerV5FulfillmentCanvasBottom${safeScope}`

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID={testID}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 390 844" width="100%">
        <Defs>
          <LinearGradient id={baseId} x1="0" x2="0.92" y1="0" y2="1">
            <Stop offset="0" stopColor="#FBFFFD" />
            <Stop offset="0.42" stopColor="#F2FBF8" />
            <Stop offset="1" stopColor="#E7F7F3" />
          </LinearGradient>
          <RadialGradient id={topId} cx="100%" cy="2%" r="82%">
            <Stop offset="0" stopColor="rgba(73,232,210,0.33)" />
            <Stop offset="0.54" stopColor="rgba(151,246,232,0.12)" />
            <Stop offset="0.80" stopColor="rgba(151,246,232,0)" />
          </RadialGradient>
          <RadialGradient id={heroId} cx="86%" cy="26%" r="70%">
            <Stop offset="0" stopColor="rgba(83,220,206,0.27)" />
            <Stop offset="0.58" stopColor="rgba(154,246,232,0.10)" />
            <Stop offset="0.82" stopColor="rgba(154,246,232,0)" />
          </RadialGradient>
          <RadialGradient id={leftId} cx="-18%" cy="45%" r="76%">
            <Stop offset="0" stopColor="rgba(132,242,223,0.21)" />
            <Stop offset="0.76" stopColor="rgba(132,242,223,0)" />
          </RadialGradient>
          <RadialGradient id={bottomId} cx="82%" cy="104%" r="78%">
            <Stop offset="0" stopColor="rgba(81,216,203,0.20)" />
            <Stop offset="0.74" stopColor="rgba(81,216,203,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill={`url(#${baseId})`} height="844" width="390" />
        <Rect fill={`url(#${topId})`} height="844" width="390" />
        <Rect fill={`url(#${heroId})`} height="844" width="390" />
        <Rect fill={`url(#${leftId})`} height="844" width="390" />
        <Rect fill={`url(#${bottomId})`} height="844" width="390" />
      </Svg>
    </View>
  )
}

function WorkerV5SourceCardSkin({ testID }: { testID?: string }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID={testID}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 100 100" width="100%">
        <Defs>
          <LinearGradient id="workerV5SourceCardFill" x1="0" x2="1" y1="0" y2="1">
            <Stop offset="0" stopColor="rgba(255,255,255,0.83)" />
            <Stop offset="1" stopColor="rgba(250,255,253,0.65)" />
          </LinearGradient>
          <LinearGradient id="workerV5SourceCardEdge" x1="0" x2="1" y1="0" y2="0">
            <Stop offset="0" stopColor="rgba(255,255,255,0)" />
            <Stop offset="0.50" stopColor="rgba(255,255,255,0.98)" />
            <Stop offset="1" stopColor="rgba(255,255,255,0)" />
          </LinearGradient>
        </Defs>
        <Rect fill="url(#workerV5SourceCardFill)" height="100" width="100" />
        <Rect fill="url(#workerV5SourceCardEdge)" height="1.3" width="82" x="9" y="0" />
      </Svg>
    </View>
  )
}

function WorkerV5CustomerCaseWorkCardAura({
  scope,
  testID,
}: {
  scope: string
  testID?: string
}) {
  const topId = `workerV5CaseWorkAuraTop${scope}`
  const bottomId = `workerV5CaseWorkAuraBottom${scope}`
  return (
    <View pointerEvents="none" style={styles.workerV5CustomerCaseWorkCardAura} testID={testID}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 360 180" width="100%">
        <Defs>
          <RadialGradient id={topId} cx="90%" cy="0%" r="64%">
            <Stop offset="0" stopColor="rgba(77,231,209,0.25)" />
            <Stop offset="0.62" stopColor="rgba(151,246,232,0.10)" />
            <Stop offset="0.84" stopColor="rgba(151,246,232,0)" />
          </RadialGradient>
          <RadialGradient id={bottomId} cx="5%" cy="100%" r="60%">
            <Stop offset="0" stopColor="rgba(75,214,201,0.17)" />
            <Stop offset="0.74" stopColor="rgba(75,214,201,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill={`url(#${topId})`} height="180" width="360" />
        <Rect fill={`url(#${bottomId})`} height="180" width="360" />
      </Svg>
    </View>
  )
}

function WorkerV5CustomerZipMintAura({
  scope,
  style,
  testID,
}: {
  scope: string
  style?: StyleProp<ViewStyle>
  testID?: string
}) {
  const fillId = `workerV5ZipMintAura${scope}`
  return (
    <View pointerEvents="none" style={[styles.workerV5CustomerZipMintAura, style]} testID={testID}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 220 180" width="100%">
        <Defs>
          <RadialGradient id={fillId} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="rgba(143,226,212,0.35)" />
            <Stop offset="0.45" stopColor="rgba(230,251,243,0.15)" />
            <Stop offset="0.72" stopColor="rgba(230,251,243,0)" />
            <Stop offset="1" stopColor="rgba(230,251,243,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill={`url(#${fillId})`} height="180" width="220" />
      </Svg>
    </View>
  )
}

function WorkerV5SuccessEmblemAura({ scope, testID }: { scope: string; testID?: string }) {
  const coreId = `workerV5SuccessEmblemAuraCore${scope}`
  const edgeId = `workerV5SuccessEmblemAuraEdge${scope}`
  return (
    <View pointerEvents="none" style={styles.successEmblemAura} testID={testID}>
      <Svg height="104" preserveAspectRatio="none" viewBox="0 0 104 104" width="104">
        <Defs>
          <RadialGradient id={coreId} cx="45%" cy="35%" r="70%">
            <Stop offset="0" stopColor="#F4FFFC" />
            <Stop offset="0.55" stopColor="#CBF8EE" />
            <Stop offset="1" stopColor="#7EDCCA" />
          </RadialGradient>
          <RadialGradient id={edgeId} cx="50%" cy="52%" r="58%">
            <Stop offset="0" stopColor="rgba(255,255,255,0.10)" />
            <Stop offset="0.58" stopColor="rgba(63,223,202,0.12)" />
            <Stop offset="1" stopColor="rgba(63,223,202,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill={`url(#${coreId})`} height="104" rx="34" width="104" />
        <Rect fill={`url(#${edgeId})`} height="104" rx="34" width="104" />
      </Svg>
    </View>
  )
}

function WorkerV5SuccessCheckFill({ scope, testID }: { scope: string; testID?: string }) {
  const fillId = `workerV5SuccessCheckFill${scope}`
  return (
    <View pointerEvents="none" style={styles.successCheckFill} testID={testID}>
      <Svg height="63" preserveAspectRatio="none" viewBox="0 0 63 63" width="63">
        <Defs>
          <LinearGradient id={fillId} x1="0" x2="1" y1="0" y2="1">
            <Stop offset="0" stopColor="#33D4BD" />
            <Stop offset="1" stopColor="#087F73" />
          </LinearGradient>
        </Defs>
        <Rect fill={`url(#${fillId})`} height="63" rx="23" width="63" />
      </Svg>
    </View>
  )
}

function WorkerV5CustomerMapMintAura({
  scope,
  style,
  testID,
}: {
  scope: string
  style?: StyleProp<ViewStyle>
  testID?: string
}) {
  const topId = `workerV5CustomerMapAuraTop${scope}`
  const bottomId = `workerV5CustomerMapAuraBottom${scope}`
  return (
    <View pointerEvents="none" style={[styles.workerV5CustomerMapMintAura, style]} testID={testID}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 340 215" width="100%">
        <Defs>
          <RadialGradient id={topId} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="rgba(143,226,212,0.35)" />
            <Stop offset="0.45" stopColor="rgba(230,251,243,0.15)" />
            <Stop offset="0.72" stopColor="rgba(230,251,243,0)" />
            <Stop offset="1" stopColor="rgba(230,251,243,0)" />
          </RadialGradient>
          <RadialGradient id={bottomId} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="rgba(143,226,212,0.26)" />
            <Stop offset="0.45" stopColor="rgba(230,251,243,0.12)" />
            <Stop offset="0.72" stopColor="rgba(230,251,243,0)" />
            <Stop offset="1" stopColor="rgba(230,251,243,0)" />
          </RadialGradient>
        </Defs>
        <Circle cx="282" cy="10" fill={`url(#${topId})`} r="126" />
        <Circle cx="22" cy="210" fill={`url(#${bottomId})`} r="126" />
      </Svg>
    </View>
  )
}

function WorkerV5SourceRowList({
  auraTestID,
  reduceTransparency,
  rows,
  scope,
  testID,
  variant = 'default',
}: {
  auraTestID?: string
  reduceTransparency: boolean
  rows: ReadonlyArray<{ icon: WorkerV5IconName; meta: string; status: string; title: string }>
  scope?: string
  testID: string
  variant?: 'default' | 'shift'
}) {
  return (
    <View style={[styles.approvalDecisionList, variant === 'shift' && styles.shiftSourceList, reduceTransparency && styles.opaqueCard]} testID={testID}>
      {!reduceTransparency && variant === 'shift' ? (
        <>
          <WorkerV5CustomerCaseWideMintAura scope={`${scope ?? testID}Wide`} testID={auraTestID} />
          <WorkerV5CustomerZipMintAura scope={`${scope ?? testID}Fine`} testID={auraTestID ? `${auraTestID}-zip` : undefined} />
        </>
      ) : !reduceTransparency && auraTestID ? (
        <MintAura intensity="component" style={styles.shiftSourceAura} testID={auraTestID} />
      ) : null}
      {rows.map((row) => (
        <View key={`${row.title}-${row.status}`} style={[styles.approvalDecisionRow, variant === 'shift' && styles.shiftSourceRow]}>
          <View style={styles.approvalDecisionIconShell}>
            <MintAura intensity="iconTile" style={styles.iconTileMintAura} />
            <Image resizeMode="contain" source={workerV5Icons[row.icon]} style={styles.approvalDecisionIcon} />
          </View>
          <View style={styles.approvalDecisionCopy}>
            <Text style={[styles.approvalDecisionTitle, variant === 'shift' && styles.shiftSourceTitle]} numberOfLines={2}>{row.title}</Text>
            <Text style={styles.approvalDecisionMeta} numberOfLines={2}>{row.meta}</Text>
          </View>
          <Text style={[styles.approvalDecisionStatus, variant === 'shift' && styles.shiftSourceStatus]} numberOfLines={1}>{row.status}</Text>
        </View>
      ))}
    </View>
  )
}

function WorkerV5ShiftSummaryCard({
  icon,
  meta,
  reduceTransparency,
  title,
}: {
  icon: WorkerV5IconName
  meta: string
  reduceTransparency: boolean
  title: string
}) {
  return (
    <View style={[styles.shiftSummaryCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-shift-summary-card">
      {!reduceTransparency ? (
        <>
          <WorkerV5CustomerCaseWideMintAura scope="ShiftSummaryWide" testID="worker-v5-shift-summary-mint-aura" />
          <WorkerV5CustomerZipMintAura scope="ShiftSummaryFine" testID="worker-v5-shift-summary-zip-mint-aura" />
        </>
      ) : null}
      <View style={styles.shiftIconTile} testID="worker-v5-shift-top-calendar-icon">
        {!reduceTransparency ? (
          <WorkerV5CustomerZipMintAura
            scope="ShiftSummaryIconFormula"
            style={styles.shiftIconFormulaAura}
            testID="worker-v5-shift-icon-formula-mint-aura"
          />
        ) : null}
        <MintAura intensity="iconTile" style={styles.iconTileMintAura} />
        <Image source={workerV5Icons[icon]} style={styles.shiftIcon} />
      </View>
      <View style={[styles.shiftTextColumn, styles.shiftSummaryTextColumn]}>
        <Text style={[styles.shiftTitle, styles.shiftSummaryTitle]} numberOfLines={1} testID="worker-v5-shift-summary-title">{title}</Text>
        <Text style={styles.shiftMeta} numberOfLines={2} testID="worker-v5-shift-summary-meta">{meta}</Text>
      </View>
    </View>
  )
}

function WorkerV5SearchPill({
  fallbackUsed,
  language,
  onChangeText,
  onSelectSuggestion,
  pending,
  placeholder,
  reduceTransparency,
  suggestions,
  value,
}: {
  fallbackUsed: boolean
  language: AppLanguage
  onChangeText: (value: string) => void
  onSelectSuggestion: (suggestion: WorkerV5PlaceSuggestion) => void
  pending: boolean
  placeholder: string
  reduceTransparency: boolean
  suggestions: WorkerV5PlaceSuggestion[]
  value: string
}) {
  return (
    <View style={styles.searchStack} testID="worker-v5-search-pill">
      <KaelTextField
        autoCapitalize="words"
        inputShellStyle={[styles.searchPill, reduceTransparency && styles.opaqueCard]}
        inputShellTestID="worker-v5-search-input-shell"
        mode="search"
        onChangeText={onChangeText}
        placeholder={placeholder}
        shellStyle={styles.searchFieldStack}
        style={styles.searchInput}
        testID="worker-v5-search-input"
        value={value}
      />
      {pending ? (
        <Text style={styles.searchFeedback} testID="worker-v5-search-loading">
          {textByLanguage(language, 'Đang tìm trên VietMap...', 'Searching VietMap...')}
        </Text>
      ) : null}
      {suggestions.length > 0 ? (
        <View style={[styles.searchSuggestions, reduceTransparency && styles.opaqueCard]} testID="worker-v5-search-suggestions">
          {suggestions.map((suggestion) => (
            <Pressable
              accessibilityRole="button"
              key={suggestion.place_id}
              onPress={() => onSelectSuggestion(suggestion)}
              style={({ pressed }) => [styles.searchSuggestionButton, pressed ? styles.pressed : null]}
              testID="worker-v5-search-suggestion"
            >
              <Text numberOfLines={1} style={styles.searchSuggestionTitle}>{suggestion.main_text}</Text>
              {suggestion.secondary_text ? (
                <Text numberOfLines={1} style={styles.searchSuggestionMeta}>{suggestion.secondary_text}</Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
      {fallbackUsed && !pending ? (
        <Text style={styles.searchFeedback} testID="worker-v5-search-fallback">
          {textByLanguage(language, 'Chưa lấy được tọa độ VietMap thật cho lựa chọn này.', 'No real VietMap coordinates yet for this selection.')}
        </Text>
      ) : null}
    </View>
  )
}

function WorkerV5MapStage({
  activeLocation,
  deal,
  language,
  profile,
  reduceTransparency,
  selectedLabel,
  testID,
}: {
  activeLocation: WorkerV5MapLocation | null
  deal: LocalDeal | null
  language: AppLanguage
  profile: WorkerV5Runtime['workerProfile']
  reduceTransparency: boolean
  selectedLabel: string | null
  testID: string
}) {
  const districts = profile?.districts?.slice(0, 2) ?? []
  const mapLabel = selectedLabel ??
    deal?.broadcast?.generalArea ??
    deal?.draft.districtLabel ??
    (districts[0] ? formatWorkerDistrict(districts[0], language) : null)

  return (
    <View style={[styles.mapPanel, reduceTransparency && styles.opaqueCard]} testID={testID}>
      {!reduceTransparency ? <WorkerV5CustomerMapMintAura scope="DemandMapPanel" style={styles.demandMapPanelAura} testID="worker-v5-demand-map-mint-aura" /> : null}
      {activeLocation ? (
        <WorkerV5VietMapStaticPreview
          label={mapLabel ?? textByLanguage(language, 'Vị trí đã đồng bộ', 'Synced location')}
          language={language}
          location={activeLocation}
        />
      ) : (
        <View style={styles.mapUnavailable} testID="worker-v5-vietmap-empty-state">
          <Text style={styles.mapUnavailableTitle}>{textByLanguage(language, 'Chưa có tọa độ VietMap thật', 'No real VietMap coordinates yet')}</Text>
          <Text style={styles.mapUnavailableMeta}>
            {textByLanguage(
              language,
              'Bản đồ chỉ hiện khi hồ sơ thợ, cơ hội thật hoặc kết quả tìm kiếm có tọa độ đã xác thực.',
              'The map renders only when the worker profile, real opportunity, or search result has verified coordinates.',
            )}
          </Text>
        </View>
      )}
    </View>
  )
}

function WorkerV5VietMapStaticPreview({
  label,
  language,
  location,
}: {
  label: string
  language: AppLanguage
  location: WorkerV5MapLocation
}) {
  const [headers, setHeaders] = useState<Record<string, string> | null>(null)
  const [failed, setFailed] = useState(false)
  const uri = mobileApiUrl(`/maps/vietmap/static?lat=${encodeURIComponent(location.lat.toFixed(6))}&lng=${encodeURIComponent(location.lng.toFixed(6))}&zoom=13`)

  useEffect(() => {
    let cancelled = false
    setFailed(false)
    void getMobileApiAuthHeaders().then((nextHeaders) => {
      if (cancelled) return
      const imageHeaders = { ...nextHeaders }
      delete imageHeaders['Content-Type']
      setHeaders(imageHeaders)
    })
    return () => {
      cancelled = true
    }
  }, [uri])

  if (failed) {
    return (
      <View style={styles.mapUnavailable} testID="worker-v5-vietmap-image-error">
        <Text style={styles.mapUnavailableTitle}>{textByLanguage(language, 'VietMap chưa trả ảnh bản đồ', 'VietMap map image unavailable')}</Text>
        <Text style={styles.mapUnavailableMeta}>{label}</Text>
      </View>
    )
  }

  if (!headers) {
    return (
      <View style={styles.mapUnavailable} testID="worker-v5-vietmap-image-loading">
        <Text style={styles.mapUnavailableTitle}>{textByLanguage(language, 'Đang chuẩn bị VietMap', 'Preparing VietMap')}</Text>
        <Text style={styles.mapUnavailableMeta}>{label}</Text>
      </View>
    )
  }

  return (
    <Image
      accessibilityLabel={textByLanguage(language, `Bản đồ VietMap cho ${label}`, `VietMap for ${label}`)}
      onError={() => setFailed(true)}
      resizeMode="cover"
      source={{ headers, uri }}
      style={styles.mapStaticImage}
      testID="worker-v5-vietmap-static-image"
    />
  )
}

function WorkerV5ScheduleSummaryCard({
  amount,
  lensLabel,
  lensValue,
  meta,
  reduceTransparency,
}: {
  amount: string
  lensLabel: string
  lensValue: string
  meta: string
  reduceTransparency: boolean
}) {
  return (
    <View style={[styles.scheduleSummaryCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-schedule-summary-card">
      {!reduceTransparency ? (
        <>
          <WorkerV5CustomerCaseWideMintAura scope="SmartScheduleSummaryWide" style={styles.scheduleSummaryAura} testID="worker-v5-schedule-summary-mint-aura" />
          <WorkerV5CustomerZipMintAura scope="SmartScheduleSummaryFine" style={styles.scheduleSummaryZipAura} testID="worker-v5-schedule-summary-zip-mint-aura" />
        </>
      ) : null}
      <View style={styles.scheduleSummaryCopy}>
        <Text style={styles.scheduleSummaryAmount} numberOfLines={1}>{amount}</Text>
        <Text style={styles.scheduleSummaryMeta} numberOfLines={1}>{meta}</Text>
      </View>
      <View style={styles.scheduleSummaryLens}>
        <Text style={styles.scheduleSummaryLensValue} numberOfLines={1}>{lensValue}</Text>
        <Text style={styles.scheduleSummaryLensLabel} numberOfLines={2}>{lensLabel}</Text>
      </View>
    </View>
  )
}

function WorkerV5InboxTabs({
  activeCount,
  language,
  newCount,
  onSelect,
  reduceTransparency,
  savedCount,
  selectedTab,
}: {
  activeCount: number
  language: AppLanguage
  newCount: number
  onSelect: (tab: WorkerV5InboxTabId) => void
  reduceTransparency: boolean
  savedCount: number
  selectedTab: WorkerV5InboxTabId
}) {
  const empty = textByLanguage(language, 'Chưa có', 'None')
  const tabs: Array<{ id: WorkerV5InboxTabId; label: string }> = [
    {
      id: 'matches',
      label: `${textByLanguage(language, 'Phù hợp', 'Matches')} · ${activeCount > 0 ? activeCount : empty}`,
    },
    {
      id: 'new',
      label: `${textByLanguage(language, 'Mới', 'New')} · ${newCount > 0 ? newCount : empty}`,
    },
    {
      id: 'saved',
      label: `${textByLanguage(language, 'Đã lưu', 'Saved')} · ${savedCount > 0 ? savedCount : empty}`,
    },
  ]
  return (
    <View style={[styles.inboxTabs, reduceTransparency && styles.opaqueCard]} testID="worker-v5-inbox-tabs">
      {tabs.map((tab) => (
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: tab.id === selectedTab }}
          key={tab.id}
          onPress={() => onSelect(tab.id)}
          style={({ pressed }) => [
            tab.id === selectedTab ? styles.inboxTabActive : styles.inboxTab,
            pressed ? styles.pressed : null,
          ]}
          testID={`worker-v5-inbox-tab-${tab.id}`}
        >
          <Text style={tab.id === selectedTab ? styles.inboxTabText : styles.inboxTabMuted} numberOfLines={1}>{tab.label}</Text>
        </Pressable>
      ))}
    </View>
  )
}

function WorkerV5SourceProgressBar({ active, label }: { active: boolean; label: string }) {
  return (
    <View style={styles.sourceProgressShell} testID="worker-v5-opportunity-progress">
      <View style={[styles.sourceProgressFill, active ? styles.sourceProgressFillActive : null]} />
      <Text style={styles.sourceProgressText} numberOfLines={1}>{label}</Text>
    </View>
  )
}

function WorkerV5JobMetaPillRow({
  items,
  reduceTransparency,
}: {
  items: ReadonlyArray<{ label: string; value: string }>
  reduceTransparency: boolean
}) {
  return (
    <View style={styles.jobMetaPillRow} testID="worker-v5-job-meta-pills">
      {items.map((item) => (
        <View key={`${item.label}-${item.value}`} style={[styles.jobMetaPill, reduceTransparency && styles.opaqueCard]}>
          <Text style={styles.jobMetaPillValue} numberOfLines={1}>{item.value}</Text>
          <Text style={styles.jobMetaPillLabel} numberOfLines={1}>{item.label}</Text>
        </View>
      ))}
    </View>
  )
}

function WorkerV5EligibilityChecklist({
  items,
  reduceTransparency,
}: {
  items: ReadonlyArray<{ label: string; meta: string; state: 'blocked' | 'done' | 'pending' }>
  reduceTransparency: boolean
}) {
  return (
    <View style={[styles.eligibilityCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-eligibility-checklist">
      {items.map((item, index) => (
        <View key={`${item.label}-${item.meta}`} style={styles.eligibilityRow}>
          <View style={[
            styles.eligibilityState,
            item.state === 'done' ? styles.eligibilityStateDone : null,
            item.state === 'blocked' ? styles.eligibilityStateBlocked : null,
          ]}>
            <Text style={[
              styles.eligibilityStateText,
              item.state === 'done' ? styles.eligibilityStateTextDone : null,
            ]}>{item.state === 'done' ? '?' : index + 1}</Text>
          </View>
          <Text style={styles.eligibilityLabel} numberOfLines={1}>{item.label}</Text>
          <Text style={styles.eligibilityMeta} numberOfLines={1}>{item.meta}</Text>
        </View>
      ))}
    </View>
  )
}

function WorkerV5RouteMapStage({
  deal,
  language,
  reduceTransparency,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const metadataLocation = useMemo(() => workerV5RouteMapLocationFromDeal(deal), [deal])
  const metadataLabel = useMemo(() => workerV5RouteMapLabelFromDeal(deal), [deal])
  const routeLabel = deal ? routeDestinationLabel(deal, language) : null
  const [resolvedRoute, setResolvedRoute] = useState<{ label: string; location: WorkerV5MapLocation } | null>(null)
  const resolveRequestRef = useRef(0)
  const activeLocation = metadataLocation ?? resolvedRoute?.location ?? null
  const activeLabel = metadataLabel ?? resolvedRoute?.label ?? routeLabel ?? textByLanguage(language, 'Điểm đến đã đồng bộ', 'Synced destination')

  useEffect(() => {
    const input = routeLabel?.trim() ?? ''
    const requestId = resolveRequestRef.current + 1
    resolveRequestRef.current = requestId
    setResolvedRoute(null)

    if (!deal || metadataLocation || input.length < 2) {
      return
    }

    let cancelled = false
    void placesService.autocomplete({ input }).then((autocompleteResult) => {
      if (cancelled || resolveRequestRef.current !== requestId) return
      if (!autocompleteResult.success) {
        return
      }
      const suggestion = autocompleteResult.data.suggestions[0]
      if (!suggestion) {
        return
      }
      return placesService.resolve({ label: suggestion.label, place_id: suggestion.place_id }).then((resolveResult) => {
        if (cancelled || resolveRequestRef.current !== requestId) return
        if (resolveResult.success && resolveResult.data.location && resolveResult.data.provider !== 'fallback') {
          setResolvedRoute({
            label: resolveResult.data.label ?? suggestion.label,
            location: {
              lat: resolveResult.data.location.lat,
              lng: resolveResult.data.location.lng,
              provider: resolveResult.data.provider,
            },
          })
          return
        }
      })
    }).catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [deal, metadataLocation, routeLabel])

  return (
    <View style={[styles.mapPanel, reduceTransparency && styles.opaqueCard]} testID="worker-v5-route-map-panel">
      {!reduceTransparency ? (
        <WorkerV5CustomerMapMintAura
          scope="RouteEtaMapPanel"
          style={styles.routeMapPanelAura}
          testID="worker-v5-route-map-mint-aura"
        />
      ) : null}
      {activeLocation ? (
        <WorkerV5VietMapStaticPreview
          label={activeLabel}
          language={language}
          location={activeLocation}
        />
      ) : (
        <View style={styles.mapUnavailable} testID="worker-v5-route-vietmap-empty-state">
          <Text style={styles.mapUnavailableTitle}>
            {textByLanguage(language, 'Chưa có tọa độ VietMap thật', 'No real VietMap coordinates yet')}
          </Text>
          <Text style={styles.mapUnavailableMeta}>
            {textByLanguage(language, 'Bản đồ chỉ hiện khi backend hoặc VietMap đồng bộ điểm đến đã xác thực.', 'The map appears only after the backend or VietMap syncs a verified destination.')}
          </Text>
        </View>
      )}
    </View>
  )
}

function WorkerV5EtaSummaryCard({
  deal,
  language,
  reduceTransparency,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const etaSignal = buildWorkerV5AcceptEtaSignal(deal, language)
  const distanceSignal = buildWorkerV5RouteDistanceSignal(deal, language)
  const lensValue = etaSignal.hasSignal ? workerV5EtaLensValue(etaSignal.label) : '0'
  return (
    <View style={[styles.etaSummaryCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-eta-summary-card">
      {!reduceTransparency ? (
        <>
          <WorkerV5CustomerCaseWideMintAura
            scope="RouteEtaSummaryWide"
            style={styles.routeEtaSummaryAura}
            testID="worker-v5-route-eta-mint-aura"
          />
          <WorkerV5CustomerZipMintAura
            scope="RouteEtaSummaryFine"
            style={styles.routeEtaSummaryZipAura}
            testID="worker-v5-route-eta-zip-mint-aura"
          />
        </>
      ) : null}
      <View style={styles.etaSummaryCopy}>
        <Text style={styles.etaLabel}>{textByLanguage(language, 'Thời gian đến dự kiến', 'Estimated arrival')}</Text>
        <Text style={styles.etaValue}>{etaSignal.label}</Text>
        <Text style={styles.etaMeta} numberOfLines={2}>{distanceSignal.hasSignal ? distanceSignal.meta : (deal ? routeDestinationLabel(deal, language) : textByLanguage(language, 'Chưa có điểm đến', 'No destination'))}</Text>
      </View>
      <View style={styles.etaLens}>
        <Text style={styles.etaLensValue}>{lensValue}</Text>
        <Text style={styles.etaLensLabel}>{etaSignal.hasSignal ? textByLanguage(language, 'phút', 'min') : textByLanguage(language, 'chờ', 'wait')}</Text>
      </View>
    </View>
  )
}

function WorkerV5CheckInHero({
  deal,
  language,
  reduceTransparency,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const addressOpen = deal ? canShowWorkerAddress(deal) : false
  const destinationLabel = workerV5ArrivalDestinationLabel(deal, language)
  const destinationMeta = workerV5ArrivalDestinationMeta(deal, language)
  return (
    <View style={[styles.checkInHero, reduceTransparency && styles.opaqueCard]} testID="worker-v5-checkin-hero">
      {!reduceTransparency ? (
        <>
          <WorkerV5CustomerCaseWideMintAura
            scope="ArrivalCheckinHeroWide"
            style={styles.checkInHeroAura}
            testID="worker-v5-checkin-mint-aura"
          />
          <WorkerV5CustomerZipMintAura
            scope="ArrivalCheckinHeroFine"
            style={styles.checkInHeroZipAura}
            testID="worker-v5-checkin-zip-mint-aura"
          />
        </>
      ) : null}
      <View style={styles.shiftIconTile}>
        <MintAura intensity="iconTile" style={styles.iconTileMintAura} />
        <Image source={workerV5Icons.map} style={styles.shiftIcon} />
      </View>
      <View style={styles.shiftTextColumn}>
        <Text style={styles.shiftKicker}>{addressOpen ? textByLanguage(language, 'Địa chỉ đã mở', 'Address open') : textByLanguage(language, 'Điểm đến bảo vệ', 'Protected destination')}</Text>
        <Text style={styles.shiftTitle} numberOfLines={1} testID="worker-v5-checkin-destination-title">{destinationLabel}</Text>
        <Text style={styles.shiftMeta} numberOfLines={2} testID="worker-v5-checkin-destination-meta">{destinationMeta}</Text>
      </View>
    </View>
  )
}

function WorkerV5CustomerContactCard({
  deal,
  language,
  reduceTransparency,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const customerContact = workerV5CustomerContactInfo(deal, language)
  const showContactIcons = Boolean(deal)
  return (
    <View style={[styles.customerContactCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-customer-contact-card">
      {!reduceTransparency ? (
        <>
          <WorkerV5CustomerCaseWideMintAura scope="ArrivalCustomerWide" style={styles.checkInListAura} />
          <WorkerV5CustomerZipMintAura scope="ArrivalCustomerFine" style={styles.checkInListZipAura} />
        </>
      ) : null}
      <View style={styles.kaelBriefIconTile}>
        <MintAura intensity="iconTile" style={styles.iconTileMintAura} />
        <Image source={workerV5Icons.chat} style={styles.kaelBriefIcon} />
      </View>
      <View style={styles.kaelBriefText}>
        <Text style={styles.kaelBriefTitle} numberOfLines={2} testID="worker-v5-customer-contact-title">{customerContact.title}</Text>
        <Text style={styles.kaelBriefBody} numberOfLines={2} testID="worker-v5-customer-contact-meta">{customerContact.meta}</Text>
      </View>
      {showContactIcons ? (
        <View style={styles.customerContactIconRow} testID="worker-v5-customer-contact-icons">
          <View style={styles.customerContactMiniIcon}>
            <Image resizeMode="contain" source={workerV5PhoneIcon} style={styles.customerContactMiniIconImage} />
          </View>
          <View style={styles.customerContactMiniIcon}>
            <Image resizeMode="contain" source={workerV5Icons.chat} style={styles.customerContactMiniIconImage} />
          </View>
        </View>
      ) : null}
    </View>
  )
}

function WorkerV5CheckInChecklist({
  deal,
  language,
  reduceTransparency,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const items = buildWorkerV5CheckInChecklistItems(deal, language)
  return (
    <View style={[styles.checkInChecklist, reduceTransparency && styles.opaqueCard]} testID="worker-v5-checkin-checklist">
      {!reduceTransparency ? (
        <>
          <WorkerV5CustomerCaseWideMintAura
            scope="ArrivalChecklistWide"
            style={styles.checkInChecklistAura}
            testID="worker-v5-checkin-checklist-mint-aura"
          />
          <WorkerV5CustomerZipMintAura
            scope="ArrivalChecklistFine"
            style={styles.checkInChecklistZipAura}
            testID="worker-v5-checkin-checklist-zip-mint-aura"
          />
        </>
      ) : null}
      {items.map((item, index) => (
        <View key={item.label} style={styles.checkInRow}>
          <View style={[
            styles.checkInState,
            item.state === 'done' ? styles.checkInStateDone : null,
            item.state === 'active' ? styles.checkInStateActive : null,
          ]}>
            <Text style={[styles.checkInStateText, item.state === 'done' ? styles.checkInStateTextOn : null]}>
              {item.state === 'done' ? '✓' : index + 1}
            </Text>
          </View>
          <Text style={styles.checkInLabel} numberOfLines={2} testID={`worker-v5-checkin-label-${index}`}>{item.label}</Text>
          <Text style={styles.checkInMeta} numberOfLines={1} testID={`worker-v5-checkin-meta-${index}`}>{item.meta}</Text>
        </View>
      ))}
    </View>
  )
}

function WorkerV5ProfileHeader({
  insights,
  language,
  profile,
  reduceTransparency,
}: {
  insights: WorkerV5Runtime['workerPerformanceInsights']
  language: AppLanguage
  profile: WorkerV5Runtime['workerProfile']
  reduceTransparency: boolean
}) {
  const legalName = profile?.legal_name?.trim() || ''
  const name = legalName || textByLanguage(language, 'Chưa có tên pháp lý', 'No legal name')
  const syncPercent = workerV5ProfileBackendSyncPercent(insights)
  return (
    <View style={[styles.profileHeader, reduceTransparency && styles.opaqueCard]} testID="worker-v5-worker-avatar">
      {!reduceTransparency ? <WorkerV5EarningsHomeHeroAura testID="worker-v5-profile-mint-aura" /> : null}
      <View style={styles.profileAvatar}>
        {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
        <Image resizeMode="contain" source={workerV5AvatarIcon} style={styles.profileAvatarImage} testID="worker-v5-profile-avatar-image" />
      </View>
      <View style={styles.profileHeaderText}>
        <Text style={styles.profileHeaderName} numberOfLines={2} testID="worker-v5-profile-header-name">{name}</Text>
        <View style={styles.profileHeaderChipRow}>
          <Text style={styles.profileHeaderMiniChip} numberOfLines={1}>{workerVerificationLabel(profile?.verification_status, language)}</Text>
          <Text style={styles.profileHeaderMiniChip} numberOfLines={1}>{formatNullableRating(profile?.rating, language)}</Text>
          <Text style={styles.profileHeaderMiniChip} numberOfLines={1}>
            {profile?.total_jobs && profile.total_jobs > 0
              ? textByLanguage(language, `${profile.total_jobs} việc`, `${profile.total_jobs} jobs`)
              : textByLanguage(language, 'Chưa có việc', 'No jobs')}
          </Text>
        </View>
        <View style={styles.profileProgressTrack}>
          <View style={[styles.profileProgressFill, { width: `${syncPercent}%` }]} testID="worker-v5-profile-sync-progress-fill" />
        </View>
        <Text style={styles.profileHeaderMeta} numberOfLines={1} testID="worker-v5-profile-sync-progress-label">{textByLanguage(language, `Hồ sơ đã đồng bộ ${syncPercent}%`, `Profile synced ${syncPercent}%`)}</Text>
      </View>
      <View style={styles.profileHeaderChip}>
        <Text style={styles.profileHeaderChipText} numberOfLines={2} testID="worker-v5-profile-header-availability">{workerAvailabilityLabel(profile, language)}</Text>
      </View>
    </View>
  )
}

function WorkerV5ProfileDashboardCards({
  insights,
  language,
  profile,
  reduceTransparency,
}: {
  insights: WorkerV5Runtime['workerPerformanceInsights']
  language: AppLanguage
  profile: WorkerV5Runtime['workerProfile']
  reduceTransparency: boolean
}) {
  const score = insights?.performance_score ?? null
  const rating = insights?.average_rating ?? profile?.rating ?? null
  const hasScore = score != null && Number.isFinite(score)
  const hasRating = rating != null && rating > 0
  const cards = [
    {
      icon: 'profile' as const,
      score: hasScore ? `${score}` : '0',
      scoreLabel: textByLanguage(language, 'xếp hạng', 'ranking'),
      title: hasScore ? textByLanguage(language, 'Điểm xếp hạng', 'Ranking score') : textByLanguage(language, 'Chưa có xếp hạng thật', 'No real ranking yet'),
    },
    {
      icon: 'shield' as const,
      score: hasRating ? `${rating}` : '0',
      scoreLabel: textByLanguage(language, 'đánh giá', 'rating'),
      title: hasRating ? textByLanguage(language, 'Độ tin cậy có nguồn', 'Sourced reliability') : textByLanguage(language, 'Chưa có đánh giá thật', 'No real rating yet'),
    },
  ]
  return (
    <View style={styles.profileDashboard} testID="worker-v5-profile-dashboard">
      {cards.map((card, index) => (
        <View key={card.title} style={[styles.profileDashboardCard, reduceTransparency && styles.opaqueCard]} testID={`worker-v5-profile-dashboard-card-${index}`}>
          {!reduceTransparency ? <WorkerV5EarningsHomeListAura testID={`worker-v5-profile-dashboard-mint-aura-${index}`} /> : null}
          <View style={styles.profileDashboardScore}>
            <Text style={styles.profileDashboardScoreValue} numberOfLines={1} testID={`worker-v5-profile-dashboard-score-${index}`}>{card.score}</Text>
            <Text style={styles.profileDashboardScoreLabel} numberOfLines={1} testID={`worker-v5-profile-dashboard-score-label-${index}`}>{card.scoreLabel}</Text>
          </View>
          <View style={styles.profileDashboardCopy}>
            <Text style={styles.profileDashboardTitle} numberOfLines={2} testID={`worker-v5-profile-dashboard-title-${index}`}>{card.title}</Text>
          </View>
        </View>
      ))}
    </View>
  )
}

function WorkerV5ScheduleList({
  reduceTransparency,
  rows,
}: {
  reduceTransparency: boolean
  rows: ReadonlyArray<WorkerV5SchedulePlanRow>
}) {
  return (
    <View style={styles.scheduleList} testID="worker-v5-schedule-list">
      {rows.map((row) => (
        <View key={`${row.time}-${row.title}-${row.meta}`} style={[styles.scheduleRow, reduceTransparency && styles.opaqueCard]} testID="worker-v5-schedule-row">
          <Text style={styles.scheduleTime} numberOfLines={1}>{row.time}</Text>
          <View style={styles.scheduleTextColumn}>
            <Text style={styles.scheduleTitle} numberOfLines={1}>{row.title}</Text>
            <Text style={styles.scheduleMeta} numberOfLines={1}>{row.meta}</Text>
          </View>
          <Text style={styles.scheduleAside} numberOfLines={1}>{row.aside}</Text>
        </View>
      ))}
    </View>
  )
}

function WorkerV5ScheduleEmptyState({
  language,
  reduceTransparency,
}: {
  language: AppLanguage
  reduceTransparency: boolean
}) {
  return (
    <View style={[styles.scheduleEmptyCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-schedule-empty-state">
      {!reduceTransparency ? (
        <>
          <WorkerV5CustomerCaseWideMintAura scope="SmartScheduleEmptyWide" style={styles.scheduleEmptyAura} testID="worker-v5-schedule-empty-mint-aura" />
          <WorkerV5CustomerZipMintAura scope="SmartScheduleEmptyFine" style={styles.scheduleEmptyZipAura} testID="worker-v5-schedule-empty-zip-mint-aura" />
        </>
      ) : null}
      <View style={styles.scheduleEmptyIconTile}>
        {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
        <Image source={workerV5Icons.calendar} style={styles.scheduleEmptyIcon} />
      </View>
      <View style={styles.scheduleEmptyText}>
        <Text style={styles.scheduleEmptyTitle} numberOfLines={2}>
          {textByLanguage(language, 'Chưa có lịch tối ưu thật', 'No real optimized schedule yet')}
        </Text>
        <Text style={styles.scheduleEmptyMeta} numberOfLines={3}>
          {textByLanguage(
            language,
            'Lịch trình sẽ tự hiện khi NestScout có cơ hội thật từ khách hoặc việc đang chạy.',
            'The schedule appears when NestScout has a real customer opportunity or active work.',
          )}
        </Text>
      </View>
    </View>
  )
}

function WorkerV5ScheduleActionRow({
  onCustomize,
  onUseSchedule,
  primary,
  reduceTransparency,
  secondary,
}: {
  onCustomize: () => void
  onUseSchedule: () => void
  primary: string
  reduceTransparency: boolean
  secondary: string
}) {
  return (
    <View accessibilityRole="summary" style={styles.scheduleActionRow} testID="worker-v5-schedule-action-row">
      <Pressable
        accessibilityRole="button"
        onPress={onCustomize}
        style={({ pressed }) => [
          styles.scheduleActionButton,
          styles.scheduleActionSecondary,
          reduceTransparency && styles.opaqueCard,
          pressed ? styles.pressed : null,
        ]}
        testID="worker-v5-schedule-customize"
      >
        <Text style={styles.scheduleActionSecondaryText} numberOfLines={1}>{secondary}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={onUseSchedule}
        style={({ pressed }) => [
          styles.scheduleActionButton,
          styles.scheduleActionPrimary,
          reduceTransparency && styles.opaqueCard,
          pressed ? styles.pressed : null,
        ]}
        testID="worker-v5-schedule-use"
      >
        {!reduceTransparency ? <WorkerV5PrimaryButtonFill disabled={false} variant="source" /> : null}
        <Text style={[styles.scheduleActionPrimaryText, reduceTransparency && styles.actionRailPrimaryText]} numberOfLines={1}>{primary}</Text>
      </Pressable>
    </View>
  )
}

function WorkerV5MediaStrip({ language, reduceTransparency, urls }: { language: AppLanguage; reduceTransparency: boolean; urls: readonly string[] }) {
  const visibleUrls = urls.slice(0, 3)
  if (!visibleUrls.length) return null
  return (
    <View style={styles.mediaStrip} testID="worker-v5-media-strip">
      {visibleUrls.map((url, index) => (
        <View key={`${url}-${index}`} style={[styles.mediaThumb, reduceTransparency && styles.opaqueCard]} testID={`worker-v5-media-thumb-${index}`}>
          <Image source={{ uri: url }} style={styles.mediaImage} />
          <Text style={styles.mediaTag}>{index === 2 && urls.length > 3 ? `+${urls.length - 2}` : `${textByLanguage(language, 'Ảnh', 'Photo')} ${index + 1}`}</Text>
        </View>
      ))}
    </View>
  )
}

function WorkerV5EvidenceTiles({ language, urls }: { language: AppLanguage; urls: readonly string[] }) {
  const visibleUrls = urls.slice(0, 3)
  return (
    <View style={styles.evidenceGrid} testID="worker-v5-evidence-grid">
      {visibleUrls.map((url, index) => (
        <View key={`${url}-${index}`} style={styles.evidenceTile}>
          <Image source={{ uri: url }} style={styles.evidenceImage} />
          <Text style={styles.evidenceBadge}>{textByLanguage(language, 'Ảnh', 'Photo')} {index + 1}</Text>
        </View>
      ))}
    </View>
  )
}

function WorkerV5WorkProgressBoard({
  items,
  language,
  reduceTransparency,
}: {
  items: ReadonlyArray<{ meta: string; state: WorkerV5StepState; title: string }>
  language: AppLanguage
  reduceTransparency: boolean
}) {
  return (
    <View style={styles.workProgressBoardShell} testID="worker-v5-work-progress-board">
      <View style={styles.workProgressBoardMeta}>
        <Text style={styles.workProgressBoardTitle}>{textByLanguage(language, 'Bảng công việc', 'Work board')}</Text>
        <Text style={styles.workProgressBoardCount}>{items.length}</Text>
      </View>
      <WorkerV5StepList
        formulaAura
        items={items}
        reduceTransparency={reduceTransparency}
        testID="worker-v5-in-progress-step-list"
      />
    </View>
  )
}

function WorkerV5EvidenceTray({
  emptyLabel,
  language,
  reduceTransparency,
  urls,
}: {
  emptyLabel: string
  language: AppLanguage
  reduceTransparency: boolean
  urls: readonly string[]
}) {
  const slots = [0, 1, 2]
  return (
    <View style={styles.evidenceTray} testID="worker-v5-evidence-tray">
      {slots.map((slot) => {
        const url = urls[slot]
        const overflowCount = slot === 2 && urls.length > 3 ? urls.length - 2 : 0
        return (
          <View
            key={slot}
            style={[styles.evidenceTrayTile, reduceTransparency && styles.opaqueCard]}
            testID={`worker-v5-evidence-tray-tile-${slot}`}
          >
            {url ? (
              <Image source={{ uri: url }} style={styles.evidenceTrayImage} />
            ) : (
              <View style={styles.evidenceTrayIconShell}>
                {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
                <Image source={workerV5Icons.evidence} style={styles.evidenceTrayIcon} />
              </View>
            )}
            <Text style={styles.evidenceTrayBadge} numberOfLines={1} testID={`worker-v5-evidence-tray-badge-${slot}`}>
              {url
                ? overflowCount
                  ? `+${overflowCount}`
                  : textByLanguage(language, 'Đã có', 'Added')
                : emptyLabel}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

function WorkerV5EvidencePickerActions({
  busy,
  language,
  onCamera,
  onLibrary,
  reduceTransparency,
}: {
  busy: boolean
  language: AppLanguage
  onCamera: () => void
  onLibrary: () => void
  reduceTransparency: boolean
}) {
  return (
    <View style={styles.evidencePickerRow} testID="worker-v5-evidence-picker-actions">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={onCamera}
        style={({ pressed }) => [
          styles.evidencePickerButton,
          reduceTransparency && styles.opaqueCard,
          busy && styles.navButtonDisabled,
          pressed && !busy ? styles.pressed : null,
        ]}
        testID="worker-v5-in-progress-camera-action"
      >
        {!reduceTransparency ? (
          <>
            <WorkerV5SourceCardSkin testID="worker-v5-in-progress-camera-action-card-skin" />
            <WorkerV5CustomerCaseWideMintAura
              scope="JobProgressEvidenceCameraAction"
              testID="worker-v5-in-progress-camera-action-mint-aura"
            />
          </>
        ) : null}
        <Image source={workerV5Icons.evidence} style={styles.evidencePickerIcon} testID="worker-v5-in-progress-camera-icon" />
        <Text style={styles.evidencePickerText} numberOfLines={1}>{textByLanguage(language, 'Chụp ảnh', 'Camera')}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={onLibrary}
        style={({ pressed }) => [
          styles.evidencePickerButton,
          reduceTransparency && styles.opaqueCard,
          busy && styles.navButtonDisabled,
          pressed && !busy ? styles.pressed : null,
        ]}
        testID="worker-v5-in-progress-library-action"
      >
        {!reduceTransparency ? (
          <>
            <WorkerV5SourceCardSkin testID="worker-v5-in-progress-library-action-card-skin" />
            <WorkerV5CustomerCaseWideMintAura
              scope="JobProgressEvidenceLibraryAction"
              testID="worker-v5-in-progress-library-action-mint-aura"
            />
          </>
        ) : null}
        <Image source={workerV5Icons.document} style={styles.evidencePickerIcon} testID="worker-v5-in-progress-library-icon" />
        <Text style={styles.evidencePickerText} numberOfLines={1}>{textByLanguage(language, 'Thư viện', 'Library')}</Text>
      </Pressable>
    </View>
  )
}

function WorkerV5ScopeChangeHero({
  language,
  reduceTransparency,
  scope,
}: {
  language: AppLanguage
  reduceTransparency: boolean
  scope: LocalDeal['scopeChange']
}) {
  const title = scope?.requestedDescription || textByLanguage(language, 'Chưa có phát sinh thật', 'No real extra scope')
  const reason = scope?.reason || textByLanguage(language, 'Cần thông tin trước khi gửi khách phê duyệt', 'Details are required before customer review')
  return (
    <View style={[styles.scopeHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-scope-change-hero">
      {!reduceTransparency ? (
        <>
          <WorkerV5CustomerCaseWideMintAura scope="ScopeChangeHeroWide" style={styles.checkInHeroAura} testID="worker-v5-scope-change-mint-aura" />
          <WorkerV5CustomerZipMintAura scope="ScopeChangeHeroFine" style={styles.checkInHeroZipAura} testID="worker-v5-scope-change-zip-mint-aura" />
        </>
      ) : null}
      <View style={styles.scopeHeroIconTile}>
        {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
        <Image source={workerV5Icons.scope} style={styles.scopeHeroIcon} />
      </View>
      <View style={[styles.scopeHeroText, !scope && styles.scopeHeroTextNoPill]}>
        {scope ? <Text style={styles.scopeHeroPill} numberOfLines={1}>{scopeChangeStatusLabel(scope.status, language)}</Text> : null}
        <Text style={[styles.scopeHeroTitle, !scope && styles.scopeHeroTitleNoPill]} numberOfLines={2}>{title}</Text>
        <Text style={styles.scopeHeroMeta} numberOfLines={2}>{reason}</Text>
      </View>
    </View>
  )
}

function WorkerV5KaelDraftCard({
  body,
  formulaAura = false,
  language,
  reduceTransparency,
  title,
}: {
  body: string
  formulaAura?: boolean
  language: AppLanguage
  reduceTransparency: boolean
  title: string
}) {
  return (
    <View style={[styles.kaelDraftCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-kael-draft-card">
      {formulaAura && !reduceTransparency ? (
        <>
          <WorkerV5CustomerCaseWideMintAura scope="KaelDraftCardWide" style={styles.checkInChecklistAura} testID="worker-v5-kael-draft-mint-aura" />
          <WorkerV5CustomerZipMintAura scope="KaelDraftCardFine" style={styles.checkInChecklistZipAura} testID="worker-v5-kael-draft-zip-mint-aura" />
        </>
      ) : null}
      <View style={styles.kaelDraftAvatar}>
        <MintAura intensity="iconTile" style={styles.iconTileMintAura} />
        <Image source={workerV5Icons.chat} style={styles.kaelDraftIcon} />
      </View>
      <View style={styles.kaelDraftCopy}>
        <Text style={styles.kaelDraftTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.kaelDraftBody} numberOfLines={2}>{body}</Text>
      </View>
      <Text accessibilityLabel={textByLanguage(language, 'Mở chi tiết', 'Open details')} style={styles.kaelDraftChevron}>›</Text>
    </View>
  )
}

function WorkerV5ApprovalWaitHero({
  deal,
  language,
  reduceTransparency,
  scope,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
  scope: LocalDeal['scopeChange']
}) {
  const price = scope ? scopeChangeApprovalAmountLabel(deal, scope, language) : textByLanguage(language, 'Chờ dữ liệu thật', 'Waiting for real data')
  const title = scope?.requestedDescription || textByLanguage(language, 'Không có đề xuất đang chờ', 'No proposal is waiting')
  const waitTime = formatScopeWaitElapsed(scope?.createdAt, language)
  return (
    <View style={[styles.approvalHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-approval-wait-hero">
      {!reduceTransparency ? (
        <>
          <WorkerV5CustomerCaseWideMintAura scope="ApprovalWaitHeroWide" style={styles.checkInHeroAura} testID="worker-v5-approval-wait-mint-aura" />
          <WorkerV5CustomerZipMintAura scope="ApprovalWaitHeroFine" style={styles.checkInHeroZipAura} testID="worker-v5-approval-wait-zip-mint-aura" />
        </>
      ) : null}
      <View style={styles.approvalHeroCopy}>
        {scope ? <Text style={styles.approvalHeroPill} numberOfLines={1}>{scopeChangeStatusLabel(scope.status, language)}</Text> : null}
        <Text style={styles.approvalHeroAmount} numberOfLines={2} testID="worker-v5-approval-amount">{price}</Text>
        <Text style={styles.approvalHeroMeta} numberOfLines={2}>{title}</Text>
      </View>
      <View style={styles.approvalLens}>
        <Text style={styles.approvalLensValue} numberOfLines={2}>{waitTime}</Text>
        <Text style={styles.approvalLensLabel}>{scope ? textByLanguage(language, 'Đã chờ', 'waiting') : textByLanguage(language, 'khách duyệt', 'approval')}</Text>
      </View>
    </View>
  )
}

type WorkerV5TimelineState = 'active' | 'done' | 'todo'

function WorkerV5StatusTimeline({
  formulaAura = false,
  reduceTransparency = false,
  rows,
  testID,
}: {
  formulaAura?: boolean
  reduceTransparency?: boolean
  rows: ReadonlyArray<{ meta: string; state: WorkerV5TimelineState; title: string }>
  testID: string
}) {
  return (
    <View style={[styles.timeline, reduceTransparency && styles.opaqueCard]} testID={testID}>
      {formulaAura && !reduceTransparency ? (
        <>
          <WorkerV5CustomerCaseWideMintAura scope="StatusTimelineWide" style={styles.checkInChecklistAura} testID={`${testID}-mint-aura`} />
          <WorkerV5CustomerZipMintAura scope="StatusTimelineFine" style={styles.checkInChecklistZipAura} testID={`${testID}-zip-mint-aura`} />
        </>
      ) : null}
      <View pointerEvents="none" style={styles.timelineRail} />
      {rows.map((row, index) => (
        <View key={`${row.title}-${row.meta}`} style={styles.timelineItem}>
          <View
            style={[
              styles.timelineDot,
              row.state === 'done' ? styles.timelineDotDone : null,
              row.state === 'active' ? styles.timelineDotActive : null,
            ]}
          />
          <Text style={styles.timelineTitle} numberOfLines={2} testID={`${testID}-title-${index}`}>{row.title}</Text>
          <Text style={styles.timelineMeta} numberOfLines={2} testID={`${testID}-meta-${index}`}>{row.meta}</Text>
        </View>
      ))}
    </View>
  )
}

function WorkerV5ApprovalTimeline({
  language,
  reduceTransparency,
  scope,
}: {
  language: AppLanguage
  reduceTransparency: boolean
  scope: LocalDeal['scopeChange']
}) {
  const hasScope = Boolean(scope)
  const kaelDone = scope?.kaelProgress?.status === 'completed'
  const approved = scope?.status === 'approved_by_customer'
  const rejected = scope?.status === 'rejected_by_customer' || scope?.status === 'cancelled'
  const customerActive = hasScope && !approved && !rejected
  const sentTime = formatScopeEventTime(scope?.createdAt, language)
  const evidenceLabel = scope?.evidencePhotoUrls.length
    ? textByLanguage(language, `${scope.evidencePhotoUrls.length} ảnh và mô tả đã gửi`, `${scope.evidencePhotoUrls.length} photos and description sent`)
    : textByLanguage(language, 'Mô tả đã gửi', 'Description sent')
  const rows = [
    {
      meta: scope ? `${sentTime} · ${evidenceLabel}` : textByLanguage(language, 'Chưa có mốc gửi thật', 'No real sent timestamp'),
      state: hasScope ? 'done' as const : 'todo' as const,
      title: textByLanguage(language, 'Bạn gửi đề xuất', 'Proposal sent'),
    },
    {
      meta: kaelDone ? textByLanguage(language, `${formatScopeEventTime(scope?.kaelProgress?.updated_at, language)} · đã đối chiếu ràng buộc`, `${formatScopeEventTime(scope?.kaelProgress?.updated_at, language)} · constraints checked`) : textByLanguage(language, 'Chưa có kết quả kiểm tra', 'No review result yet'),
      state: kaelDone ? 'done' as const : hasScope ? 'active' as const : 'todo' as const,
      title: textByLanguage(language, 'Kael kiểm tra ràng buộc', 'Kael checks constraints'),
    },
    {
      meta: approved
        ? textByLanguage(language, 'Khách đã duyệt trên hệ thống', 'Customer approved in system')
        : rejected
          ? textByLanguage(language, 'Yêu cầu không còn chờ duyệt', 'Request is no longer pending')
          : textByLanguage(language, 'Chờ khách phê duyệt trong ứng dụng', 'Waiting for customer approval in the app'),
      state: approved || rejected ? 'done' as const : customerActive ? 'active' as const : 'todo' as const,
      title: textByLanguage(language, 'Khách phê duyệt', 'Customer reviews'),
    },
    {
      meta: approved ? textByLanguage(language, 'Có thể quay lại luồng hoàn tất', 'Can return to completion flow') : textByLanguage(language, 'Chỉ sau khi có quyết định', 'Only after the decision'),
      state: approved ? 'active' as const : 'todo' as const,
      title: textByLanguage(language, 'Tiếp tục công việc', 'Continue work'),
    },
  ]
  return <WorkerV5StatusTimeline formulaAura reduceTransparency={reduceTransparency} rows={rows} testID="worker-v5-approval-timeline" />
}

function WorkerV5CompletionEvidenceHero({
  completenessPercent,
  language,
  noteReady,
  photoCount,
  reduceTransparency,
}: {
  completenessPercent: number | null
  language: AppLanguage
  noteReady: boolean
  photoCount: number
  reduceTransparency: boolean
}) {
  const sourceCount = photoCount + (noteReady ? 1 : 0)
  const label = sourceCount
    ? textByLanguage(language, `${sourceCount} nguồn · đã kiểm tra`, `${sourceCount} sources · checked`)
    : textByLanguage(language, 'Chưa có nguồn hoàn tất', 'No completion sources yet')
  const caption = noteReady && photoCount
    ? textByLanguage(language, 'Ảnh, ghi chú và checklist lấy từ hồ sơ thật.', 'Photos, notes, and checklist come from the real case.')
    : textByLanguage(language, 'Cần ảnh hoặc ghi chú thật trước khi gửi.', 'Real photos or notes are required before submission.')
  const lensValue = sourceCount && completenessPercent != null
    ? `${Math.max(0, Math.min(100, completenessPercent))}%`
    : textByLanguage(language, 'Chờ', 'Wait')
  return (
    <View style={[styles.completionHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-completion-hero">
      {!reduceTransparency ? (
        <>
          <WorkerV5CustomerCaseWideMintAura scope="CompletionEvidenceHeroWide" style={styles.checkInHeroAura} testID="worker-v5-completion-evidence-mint-aura" />
          <WorkerV5CustomerZipMintAura scope="CompletionEvidenceHeroFine" style={styles.checkInHeroZipAura} testID="worker-v5-completion-evidence-zip-mint-aura" />
        </>
      ) : null}
      <View style={styles.completionHeroCopy}>
        <Text style={styles.completionHeroPill} numberOfLines={1}>{textByLanguage(language, 'Hồ sơ hoàn tất', 'Completion artifact')}</Text>
        <Text style={styles.completionHeroTitle} numberOfLines={2}>{label}</Text>
        <Text style={styles.completionHeroMeta} numberOfLines={2}>{caption}</Text>
      </View>
      <View style={styles.completionLens}>
        <Text style={styles.completionLensValue}>{lensValue}</Text>
        <Text style={styles.completionLensLabel}>{textByLanguage(language, 'Độ đầy đủ', 'Completeness')}</Text>
      </View>
    </View>
  )
}

type WorkerV5FinalCheck = {
  done: boolean
  meta: string
  title: string
}

function WorkerV5FinalChecklistCard({
  checks,
  formulaAura = false,
  reduceTransparency,
}: {
  checks: readonly WorkerV5FinalCheck[]
  formulaAura?: boolean
  reduceTransparency: boolean
}) {
  return (
    <View style={[styles.finalChecklistCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-final-checklist">
      {formulaAura && !reduceTransparency ? (
        <>
          <WorkerV5CustomerCaseWideMintAura scope="FinalChecklistWide" style={styles.checkInChecklistAura} testID="worker-v5-final-checklist-mint-aura" />
          <WorkerV5CustomerZipMintAura scope="FinalChecklistFine" style={styles.checkInChecklistZipAura} testID="worker-v5-final-checklist-zip-mint-aura" />
        </>
      ) : null}
      {checks.map((check, index) => (
        <View key={check.title} style={styles.finalChecklistRow}>
          <View style={[styles.finalChecklistState, check.done ? styles.finalChecklistStateDone : null]}>
            <Text style={[styles.finalChecklistStateText, check.done ? styles.finalChecklistStateTextDone : null]}>
              {check.done ? '✓' : index + 1}
            </Text>
          </View>
          <Text style={styles.finalChecklistTitle} numberOfLines={2} testID={`worker-v5-final-check-title-${index}`}>{check.title}</Text>
          <Text style={styles.finalChecklistMeta} numberOfLines={2} testID={`worker-v5-final-check-meta-${index}`}>{check.meta}</Text>
        </View>
      ))}
    </View>
  )
}

function WorkerV5SubmissionTimeline({
  deal,
  language,
  reduceTransparency,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const hasEvidence = Boolean(deal?.completionNotes?.trim() || deal?.completionPhotoUrls?.length)
  const customerConfirmed = deal?.status === 'confirmed_by_customer' || deal?.status === 'reviewed'
  const paymentRecorded = Boolean(deal?.payment?.workerNet && deal.payment.workerNet > 0)
  const rows = [
    {
      meta: hasEvidence ? textByLanguage(language, 'Hash nguồn đã ghi', 'Source hash recorded') : textByLanguage(language, 'Chưa có bằng chứng thật', 'No real evidence yet'),
      state: hasEvidence ? 'done' as const : 'todo' as const,
      title: textByLanguage(language, 'Bằng chứng đã khóa', 'Evidence locked'),
    },
    {
      meta: deal ? textByLanguage(language, 'Không phát hiện thiếu nguồn', 'No missing source detected') : textByLanguage(language, 'Chưa có việc để đối chiếu', 'No work to review'),
      state: deal ? 'done' as const : 'todo' as const,
      title: textByLanguage(language, 'Kael đối chiếu phạm vi', 'Kael checks scope'),
    },
    {
      meta: customerConfirmed ? textByLanguage(language, 'Khách đã xác nhận trong hệ thống', 'Customer confirmed in system') : textByLanguage(language, 'Dự kiến trong lần đồng bộ tiếp theo', 'Expected in the next sync'),
      state: customerConfirmed ? 'done' as const : deal ? 'active' as const : 'todo' as const,
      title: textByLanguage(language, 'Khách xác nhận', 'Customer confirmation'),
    },
    {
      meta: paymentRecorded ? textByLanguage(language, 'Đã có số đối soát thật', 'Real settlement amount exists') : textByLanguage(language, 'Sau khi việc đóng', 'After work closes'),
      state: paymentRecorded ? 'done' as const : 'todo' as const,
      title: textByLanguage(language, 'Giải ngân về ví thợ', 'Worker settlement'),
    },
  ]
  return <WorkerV5StatusTimeline formulaAura reduceTransparency={reduceTransparency} rows={rows} testID="worker-v5-submission-timeline" />
}

function WorkerV5SettlementStrip({
  deal,
  language,
  reduceTransparency,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const payment = deal?.payment
  const cells = [
    {
      label: textByLanguage(language, 'Khách thanh toán', 'Customer paid'),
      value: payment?.grossAmount ? formatVnd(payment.grossAmount, language) : textByLanguage(language, 'Chưa có', 'None'),
    },
    {
      label: textByLanguage(language, 'Bạn nhận', 'Worker net'),
      value: payment?.workerNet ? formatVnd(payment.workerNet, language) : textByLanguage(language, 'Chưa có', 'None'),
    },
    {
      label: textByLanguage(language, 'Phí nền tảng', 'Platform fee'),
      value: payment?.platformFee ? formatVnd(payment.platformFee, language) : textByLanguage(language, 'Chưa có', 'None'),
    },
  ]
  return (
    <View style={styles.settlementStrip} testID="worker-v5-settlement-strip">
      {cells.map((cell, index) => (
        <View key={cell.label} style={[styles.settlementCell, reduceTransparency && styles.opaqueCard]}>
          {!reduceTransparency ? (
            <>
              <WorkerV5CustomerCaseWideMintAura
                scope={`CompletionSettlement${index}`}
                style={styles.settlementCellMintAura}
                testID={`worker-v5-settlement-cell-mint-aura-${index}`}
              />
              <WorkerV5CustomerZipMintAura
                scope={`CompletionSettlement${index}`}
                style={styles.settlementCellZipMintAura}
                testID={`worker-v5-settlement-cell-zip-mint-aura-${index}`}
              />
            </>
          ) : null}
          <Text style={styles.settlementValue} numberOfLines={1} testID={`worker-v5-settlement-value-${index}`}>{cell.value}</Text>
          <Text style={styles.settlementLabel} numberOfLines={2}>{cell.label}</Text>
        </View>
      ))}
    </View>
  )
}

function WorkerV5UtilityGrid({
  items,
  reduceTransparency = false,
}: {
  items: ReadonlyArray<{ icon: WorkerV5IconName; meta: string; onPress?: () => void; title: string }>
  reduceTransparency?: boolean
}) {
  return (
    <View style={styles.utilityGrid} testID="worker-v5-utility-grid">
      {!reduceTransparency ? <WorkerV5EarningsHomeListAura testID="worker-v5-account-utility-grid-mint-aura" /> : null}
      {items.map((item, index) => {
        const content = (
          <>
          <View style={styles.utilityIconTile} testID="worker-v5-utility-icon-tile">
            {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
            <Image
              resizeMode="contain"
              source={workerV5Icons[item.icon]}
              style={[styles.utilityIcon, styles.utilityGridIcon]}
              testID="worker-v5-utility-icon"
            />
          </View>
          <Text style={styles.utilityTitle} numberOfLines={2} testID={`worker-v5-utility-title-${index}`}>{item.title}</Text>
          <Text style={styles.utilityMeta} numberOfLines={2} testID={`worker-v5-utility-meta-${index}`}>{item.meta}</Text>
          </>
        )
        const cardStyle = [styles.utilityCard, reduceTransparency && styles.opaqueCard]
        return item.onPress ? (
          <Pressable
            accessibilityLabel={item.title}
            accessibilityRole="button"
            key={item.title}
            onPress={item.onPress}
            style={cardStyle}
            testID={`worker-v5-utility-card-${index}`}
          >
            {content}
          </Pressable>
        ) : (
          <View key={item.title} style={cardStyle} testID={`worker-v5-utility-card-${index}`}>
            {content}
          </View>
        )
      })}
    </View>
  )
}

function WorkerV5BankCard({
  language,
  profile,
  reduceTransparency,
}: {
  language: AppLanguage
  profile: WorkerV5Runtime['workerProfile']
  reduceTransparency: boolean
}) {
  const hasBank = Boolean(profile?.bank_account_masked)
  const bankLogo = resolveWorkerV5BankLogo(profile?.bank_name)
  return (
    <View style={[styles.bankCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-bank-card">
      <View style={styles.bankIconTile}>
        {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
        <Image
          resizeMode="contain"
          source={bankLogo ?? workerV5Icons.wallet}
          style={bankLogo ? styles.bankCardLogoImage : styles.utilityIcon}
          testID="worker-v5-bank-card-logo"
        />
      </View>
      <View style={styles.opportunityTextColumn}>
        <Text style={styles.opportunityTitle} numberOfLines={2} testID="worker-v5-bank-card-title">{hasBank ? profile?.bank_name || textByLanguage(language, 'Ngân hàng', 'Bank') : textByLanguage(language, 'Chưa xác minh ngân hàng', 'No verified bank')}</Text>
        <Text style={styles.opportunityMeta} numberOfLines={2} testID="worker-v5-bank-card-meta">{hasBank ? profile?.bank_account_masked : textByLanguage(language, 'Dùng luồng xác minh hiện hữu', 'Use the existing verification flow')}</Text>
      </View>
    </View>
  )
}

function WorkerV5CaseClosedHero({
  deal,
  language,
  reduceTransparency,
  workerNet,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
  workerNet: number | null
}) {
  const hasIncome = Boolean(workerNet && workerNet > 0)
  const amount = hasIncome ? formatVnd(workerNet ?? 0, language) : '0'
  const status = hasIncome
    ? textByLanguage(language, 'Có thể rút tiền', 'Payout available')
    : textByLanguage(language, 'Chờ đối soát', 'Waiting settlement')
  const closed = deal?.status === 'confirmed_by_customer' || deal?.status === 'reviewed'
  return (
    <View style={[styles.caseClosedHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-case-closed-hero">
      {!reduceTransparency ? <MintAura intensity="component" style={styles.caseClosedHeroAura} testID="worker-v5-case-closed-mint-aura" /> : null}
      <View style={styles.caseClosedCheckShell}>
        {!reduceTransparency ? <WorkerV5SuccessEmblemAura scope="CaseClosed" testID="worker-v5-case-closed-check-aura" /> : null}
        <View style={styles.caseClosedCheck}>
          {!reduceTransparency ? <WorkerV5SuccessCheckFill scope="CaseClosed" testID="worker-v5-case-closed-check-fill" /> : null}
          <Text style={styles.caseClosedCheckText}>✓</Text>
        </View>
      </View>
      <View style={styles.caseClosedStatusPill}>
        <View style={styles.statusDotSmall} />
        <Text style={styles.caseClosedStatusText} numberOfLines={2} testID="worker-v5-case-closed-status">{status}</Text>
      </View>
      <Text style={styles.caseClosedTitle} numberOfLines={2} testID="worker-v5-case-closed-title">{closed ? textByLanguage(language, 'Hoàn tất công việc', 'Work completed') : textByLanguage(language, 'Chưa hoàn tất công việc', 'Work not completed')}</Text>
      <Text style={styles.caseClosedAmount} numberOfLines={1} testID="worker-v5-case-closed-amount">{amount}</Text>
      <Text style={styles.caseClosedAmountLabel} numberOfLines={2}>
        {hasIncome ? textByLanguage(language, 'Đã ghi vào sổ thu nhập', 'Recorded in income ledger') : textByLanguage(language, 'Chờ sổ thu nhập đồng bộ', 'Waiting for income ledger')}
      </Text>
    </View>
  )
}

function WorkerV5CaseTrailCard({
  deal,
  language,
  reduceTransparency,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const artifactReady = Boolean(deal?.completionNotes?.trim() || deal?.completionPhotoUrls?.length)
  const ledgerReady = Boolean(deal?.payment?.workerNet && deal.payment.workerNet > 0)
  const rows = [
    {
      icon: 'document' as const,
      meta: artifactReady
        ? textByLanguage(language, `${deal?.completionPhotoUrls?.length ?? 0} ảnh · có ghi chú`, `${deal?.completionPhotoUrls?.length ?? 0} photos · note exists`)
        : textByLanguage(language, 'Chưa có hồ sơ hoàn tất thật', 'No real completion artifact'),
      status: artifactReady ? textByLanguage(language, 'Đã khóa', 'Locked') : textByLanguage(language, 'Chờ', 'Waiting'),
      title: textByLanguage(language, 'Hồ sơ hoàn tất', 'Completion artifact'),
    },
    {
      icon: 'wallet' as const,
      meta: ledgerReady ? formatVnd(deal?.payment?.workerNet ?? 0, language) : textByLanguage(language, 'Chờ hệ thống đối soát', 'Waiting for system settlement'),
      status: ledgerReady ? textByLanguage(language, 'Đã ghi', 'Recorded') : textByLanguage(language, 'Chờ', 'Waiting'),
      title: textByLanguage(language, 'Giải ngân sổ thu nhập', 'Ledger release'),
    },
  ]
  return (
    <View style={[styles.caseTrailCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-case-trail-card">
      {rows.map((row, index) => (
        <View key={row.title} style={styles.caseTrailRow}>
          {!reduceTransparency ? (
            <>
              <WorkerV5CustomerCaseWideMintAura
                scope={`CaseTrailRow${index}`}
                style={styles.caseTrailRowAura}
                testID={`worker-v5-case-trail-row-mint-aura-${index}`}
              />
              <WorkerV5CustomerZipMintAura
                scope={`CaseTrailRow${index}`}
                style={styles.caseTrailRowZipAura}
                testID={`worker-v5-case-trail-row-zip-mint-aura-${index}`}
              />
            </>
          ) : null}
          <View style={styles.caseTrailIconShell}>
            {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
            <Image resizeMode="contain" source={workerV5Icons[row.icon]} style={styles.caseTrailIcon} testID={`worker-v5-case-trail-icon-${index}`} />
          </View>
          <View style={styles.caseTrailCopy}>
            <Text style={styles.caseTrailTitle} numberOfLines={2} testID={`worker-v5-case-trail-title-${index}`}>{row.title}</Text>
            <Text style={styles.caseTrailMeta} numberOfLines={2} testID={`worker-v5-case-trail-meta-${index}`}>{row.meta}</Text>
          </View>
          <Text style={styles.caseTrailStatus} numberOfLines={2} testID={`worker-v5-case-trail-status-${index}`}>{row.status}</Text>
        </View>
      ))}
    </View>
  )
}

function WorkerV5ChatBubble({
  align,
  body,
  label,
}: {
  align?: 'right'
  body: string
  label: string
}) {
  return (
    <View style={[styles.chatBubble, align === 'right' ? styles.chatBubbleRight : null]}>
      <Text style={styles.chatBubbleBody} numberOfLines={4}>{body}</Text>
      <Text style={styles.chatBubbleLabel} numberOfLines={1}>{label}</Text>
    </View>
  )
}

function WorkerV5KaelConversationCard({
  deal,
  language,
  mode,
  reduceTransparency,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  mode: 'intake' | 'normal'
  reduceTransparency: boolean
}) {
  const prompt = mode === 'intake'
    ? textByLanguage(language, 'Tìm cơ hội phù hợp từ nguồn thật đã gửi cho thợ.', 'Find suitable work from real opportunities sent to the worker.')
    : textByLanguage(language, 'Hỏi Kael về chuẩn bị giải quyết công việc, kỹ năng hoặc cách xử lý trong ứng dụng.', 'Ask Kael about work resolution prep, skills, or in-app handling.')
  const response = deal
    ? textByLanguage(language, `Kael đang đọc ${localizedServiceLabel(deal.draft.serviceType, language)} tại ${deal.draft.districtLabel || deal.broadcast?.generalArea || 'khu vực đã đồng bộ'}.`, `Kael is reading ${localizedServiceLabel(deal.draft.serviceType, language)} in ${deal.draft.districtLabel || deal.broadcast?.generalArea || 'the synced area'}.`)
    : textByLanguage(language, 'Chưa có cơ hội hoặc việc thật để Kael xếp hạng. Các gợi ý chỉ là tư vấn.', 'No real opportunity or work is available for Kael ranking. Suggestions remain advisory.')
  return (
    <View style={[styles.kaelConversationCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-kael-conversation-card">
      {!reduceTransparency ? <MintAura intensity="component" style={styles.kaelConversationAura} testID="worker-v5-kael-conversation-mint-aura" /> : null}
      <WorkerV5ChatBubble align="right" body={prompt} label={textByLanguage(language, 'Bạn · yêu cầu tư vấn', 'You · advisory request')} />
      <WorkerV5ChatBubble body={response} label={textByLanguage(language, 'Kael · không ghi quyết định', 'Kael · no decision write')} />
    </View>
  )
}

function WorkerV5SuggestionChips({ items }: { items: readonly string[] }) {
  return (
    <View style={styles.suggestionChipRow} testID="worker-v5-suggestion-chips">
      {items.map((item, index) => (
        <View key={item} style={styles.suggestionChip}>
          <Text style={styles.suggestionChipText} numberOfLines={2} testID={`worker-v5-suggestion-chip-text-${index}`}>{item}</Text>
        </View>
      ))}
    </View>
  )
}

function WorkerV5ActionRail({
  auraTestID,
  formulaAura = false,
  onPrimary,
  onSecondary,
  primary,
  primaryDisabled = false,
  primaryTestID,
  primaryVariant = 'default',
  reduceTransparency,
  secondary,
  secondaryTestID,
}: {
  auraTestID?: string
  formulaAura?: boolean
  onPrimary?: () => void
  onSecondary?: () => void
  primary: string
  primaryDisabled?: boolean
  primaryTestID?: string
  primaryVariant?: 'default' | 'source'
  reduceTransparency: boolean
  secondary: string
  secondaryTestID?: string
}) {
  const primaryIsDisabled = primaryDisabled || !onPrimary
  const primaryUsesSourceTone = primaryVariant === 'source'
  return (
    <View accessibilityRole="summary" style={styles.navigationRow} testID="worker-v5-action-rail">
      {formulaAura && !reduceTransparency ? (
        <>
          <WorkerV5CustomerCaseWideMintAura scope={`${auraTestID ?? 'ActionRail'}Wide`} style={styles.actionRailFormulaAura} testID={auraTestID} />
          <WorkerV5CustomerZipMintAura scope={`${auraTestID ?? 'ActionRail'}Fine`} style={styles.actionRailZipAura} testID={auraTestID ? `${auraTestID}-zip` : undefined} />
        </>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !onSecondary }}
        disabled={!onSecondary}
        onPress={onSecondary}
        style={({ pressed }) => [
          styles.navButton,
          styles.navButtonSecondary,
          reduceTransparency && styles.opaqueCard,
          pressed && onSecondary ? styles.pressed : null,
        ]}
        testID={secondaryTestID}
      >
        <Text adjustsFontSizeToFit minimumFontScale={0.78} style={[styles.navButtonText, styles.actionRailButtonText]} numberOfLines={1}>{secondary}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: primaryIsDisabled }}
        disabled={primaryIsDisabled}
        onPress={onPrimary}
        style={({ pressed }) => [
          styles.navButton,
          styles.navButtonPrimary,
          primaryUsesSourceTone && styles.primaryActionButtonSource,
          reduceTransparency && (primaryUsesSourceTone ? styles.primaryActionButtonSource : styles.opaqueCard),
          primaryIsDisabled && (primaryUsesSourceTone ? styles.sourceActionDisabled : styles.navButtonDisabled),
          pressed && !primaryIsDisabled ? styles.pressed : null,
        ]}
        testID={primaryTestID}
      >
        {primaryUsesSourceTone ? <WorkerV5PrimaryButtonFill disabled={false} variant="source" /> : null}
        <Text
          style={[
            styles.navButtonText,
            styles.actionRailButtonText,
            styles.navButtonPrimaryText,
            reduceTransparency && !primaryUsesSourceTone && styles.actionRailPrimaryText,
            primaryIsDisabled && !primaryUsesSourceTone && styles.navButtonDisabledText,
          ]}
          adjustsFontSizeToFit
          minimumFontScale={0.72}
          numberOfLines={1}
        >
          {primary}
        </Text>
      </Pressable>
    </View>
  )
}

function WorkerV5SingleSourceActionButton({
  disabled,
  label,
  onPress,
  reduceTransparency,
  testID,
}: {
  disabled: boolean
  label: string
  onPress: () => void
  reduceTransparency: boolean
  testID: string
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryActionButton,
        styles.primaryActionButtonSource,
        reduceTransparency && styles.primaryActionButtonSource,
        disabled && styles.sourceActionDisabled,
        pressed && !disabled ? styles.pressed : null,
      ]}
      testID={testID}
    >
      <WorkerV5PrimaryButtonFill disabled={false} variant="source" />
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.76}
        numberOfLines={1}
        style={[styles.primaryActionText, styles.navButtonPrimaryText]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

function WorkerV5IntakeOpportunityStack({
  deal,
  language,
  onOpenOpportunity,
  reduceTransparency,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  onOpenOpportunity: () => void
  reduceTransparency: boolean
}) {
  return (
    <View style={styles.intakeStack} testID="worker-v5-intake-opportunity-stack">
      {deal ? (
        <WorkerV5OpportunityCard
          deal={deal}
          language={language}
          onOpenOpportunity={onOpenOpportunity}
          reduceTransparency={reduceTransparency}
        />
      ) : (
        <View style={[styles.intakeEmptyRow, reduceTransparency && styles.opaqueCard]} testID="worker-v5-intake-empty-state">
          <View style={styles.intakeEmptyIconShell}>
            {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
            <Image source={workerV5Icons.jobs} style={styles.intakeEmptyIcon} />
          </View>
          <View style={styles.intakeEmptyCopy}>
            <Text style={styles.intakeEmptyTitle} numberOfLines={2}>{textByLanguage(language, 'Chưa có cơ hội thật', 'No real opportunities')}</Text>
            <Text style={styles.intakeEmptyMeta} numberOfLines={2}>{textByLanguage(language, 'Danh sách chỉ hiện cơ hội thật từ NestScout.', 'The list only shows real NestScout broadcasts.')}</Text>
          </View>
        </View>
      )}
    </View>
  )
}

type WorkerV5PrivateKaelMode = 'normal'

type WorkerV5PrivateKaelLocalTurn = {
  id: string
  role: 'kael' | 'worker'
  text: string
}

type WorkerV5PrivateKaelMediaPreview = {
  fileName: string
  uri: string
}

type WorkerV5PrivateKaelSession = {
  jobId: string
  sessionId: string
}

function WorkerV5PrivateKaelChat({
  deal,
  language,
  mode,
  reduceTransparency,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  mode: WorkerV5PrivateKaelMode
  reduceTransparency: boolean
}) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<KaelChatProgress | null>(null)
  const [turns, setTurns] = useState<WorkerV5PrivateKaelLocalTurn[]>([])
  const [mediaItems, setMediaItems] = useState<WorkerV5PrivateKaelMediaPreview[]>([])
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [workerKaelSession, setWorkerKaelSession] = useState<WorkerV5PrivateKaelSession | null>(null)
  const jobId = getWorkerV5ChatJobId(deal)
  const activeJobIdRef = useRef<string | null>(jobId)
  const workerKaelSessionRef = useRef<WorkerV5PrivateKaelSession | null>(workerKaelSession)
  activeJobIdRef.current = jobId
  workerKaelSessionRef.current = workerKaelSession
  const readOnly = isWorkerV5PrivateKaelReadOnly(deal)
  const placeholder = textByLanguage(
    language,
    'Hỏi Kael riêng về chuẩn bị giải quyết công việc hoặc xử lý trong app.',
    'Privately ask Kael about work resolution prep or in-app handling.',
  )
  const introText = textByLanguage(
    language,
    'Kael có thể tư vấn cách chuẩn bị và thao tác trong ứng dụng; mọi quyết định theo việc vẫn đi qua màn có thẩm quyền riêng.',
    'Kael can advise on prep and in-app handling; work decisions still go through authorized work screens.',
  )
  const noJobReply = textByLanguage(
    language,
    'Mình chưa có phiên Kael theo công việc để gửi qua kênh riêng. Khi có việc thật, câu hỏi này sẽ được gửi qua private worker Kael.',
    'There is no job-scoped Kael session yet. Once real work exists, this question will go through private worker Kael.',
  )
  const readOnlyReason = textByLanguage(language, 'Chat chỉ còn đọc lại sau cổng thanh toán.', 'Chat is read-only after the payment gate.')
  const feedbackPlaceholder = textByLanguage(language, 'Góp ý để Kael giải quyết công việc tốt hơn.', 'Share feedback so Kael can improve worker support.')
  const inputPlaceholder = feedbackOpen ? feedbackPlaceholder : readOnly ? readOnlyReason : placeholder

  const renderedTurns = turns.length > 0
    ? turns.slice(-8)
    : [{ id: 'kael-intro', role: 'kael' as const, text: introText }]
  const progressPercent = progress ? Math.max(0, Math.min(100, Math.round(progress.progress * 100))) : null

  useEffect(() => {
    setError(null)
    setProgress(null)
    setTurns([])
    setMediaItems([])
    setFeedbackOpen(false)
    workerKaelSessionRef.current = null
    setWorkerKaelSession(null)
  }, [jobId])

  const rememberWorkerKaelSession = (currentJobId: string, sessionId: string) => {
    const nextSession = { jobId: currentJobId, sessionId }
    workerKaelSessionRef.current = nextSession
    setWorkerKaelSession(nextSession)
  }

  const attachPrivateKaelMedia = async () => {
    if (busy || readOnly) return
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Kael', textByLanguage(language, 'Cần quyền thư viện ảnh để đính kèm bằng chứng cho Kael.', 'Photo library permission is needed to attach evidence for Kael.'))
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.82,
      selectionLimit: 5,
    })
    if (result.canceled || result.assets.length === 0) return

    const picked = result.assets.slice(0, 5).map((asset, index) => ({
      fileName: workerV5PrivateKaelMediaName(asset, index, language),
      uri: asset.uri,
    }))
    setMediaItems(picked)
    setDraft((current) => [current.trim(), picked.map((asset) => asset.fileName).join(', ')].filter(Boolean).join('\n'))
  }

  const submitPrivateKaelFeedback = async () => {
    const message = draft.trim()
    if (!message || busy) return

    setBusy(true)
    setError(null)
    try {
      const submitted = await workerKaelChatService.submitFeedback({
        language,
        message,
        source: 'worker_chat',
      })
      if (!submitted.success) {
        setError(textByLanguage(language, 'Kael chưa nhận được góp ý. Không có dữ liệu huấn luyện nào được bật tự động.', 'Kael could not receive this feedback. No training consent was enabled automatically.'))
        return
      }
      setTurns((current) => [
        ...current,
        { id: `worker-feedback-${Date.now()}`, role: 'worker', text: message },
        { id: `kael-feedback-${submitted.data.feedback_id}`, role: 'kael', text: textByLanguage(language, 'Đã ghi nhận góp ý cho đội Kael. Mình không bật consent học máy từ màn chat.', 'Feedback was sent to the Kael team. This chat did not enable training consent.') },
      ])
      setDraft('')
      setFeedbackOpen(false)
    } catch {
      setError(textByLanguage(language, 'Kael chua gửi được góp ý lúc này.', 'Kael could not send feedback right now.'))
    } finally {
      setBusy(false)
    }
  }

  const submitPrivateKaelMessage = async () => {
    const message = draft.trim()
    if (!message || busy || readOnly || feedbackOpen) return

    setDraft('')
    setError(null)
    setTurns((current) => [...current, { id: `worker-local-${Date.now()}`, role: 'worker', text: message }])

    if (!jobId) {
      setTurns((current) => [...current, { id: `kael-local-${Date.now()}`, role: 'kael', text: noJobReply }])
      setMediaItems([])
      return
    }

    setBusy(true)
    const currentJobId = jobId
    try {
      let mediaRefs: string[] = []
      if (mediaItems.length > 0) {
        const uploadDrafts: LocalMediaUploadDraft[] = mediaItems.map((item) => ({
          fileName: item.fileName,
          type: 'image',
          uri: item.uri,
        }))
        const uploaded = await uploadJobMediaDrafts(currentJobId, uploadDrafts, 'kael_reference')
        if (!uploaded.success) {
          setError(uploaded.error)
          return
        }
        mediaRefs = uploaded.mediaRefs
      }

      let sessionId = workerKaelSessionRef.current?.jobId === currentJobId
        ? workerKaelSessionRef.current.sessionId
        : null

      if (!sessionId) {
        const created = await workerKaelChatService.create({
          client_request_id: generateClientRequestId(),
          job_id: currentJobId,
          language,
        })

        if (!created.success || created.data.session.job_id !== currentJobId) {
          setProgress(null)
          setError(textByLanguage(language, 'Kael chưa mở được phiên riêng cho việc này.', 'Kael could not open the private work session yet.'))
          return
        }

        sessionId = created.data.session.id
        rememberWorkerKaelSession(currentJobId, sessionId)

        if (created.data.session.progress && activeJobIdRef.current === currentJobId) {
          setProgress(created.data.session.progress)
        }
      }

      const streamed = await workerKaelChatService.streamTurn(sessionId, {
        client_request_id: generateClientRequestId(),
        language,
        media_refs: mediaRefs,
        message,
      }, {
        onStage: (event) => {
          if (activeJobIdRef.current !== currentJobId) return
          setProgress(event.progress)
        },
        onToken: () => undefined,
      })

      let finalResponse = streamed.success ? streamed : null
      if (!finalResponse) {
        const recovered = await workerKaelChatService.get(sessionId)
        if (recovered.success) finalResponse = recovered
      }

      if (!finalResponse || finalResponse.data.session.job_id !== currentJobId) {
        if (activeJobIdRef.current === currentJobId) setProgress(null)
        setError(textByLanguage(language, 'Kael bỏ qua phản hồi không khớp việc hiện tại.', 'Kael ignored a response that did not match the current work.'))
        return
      }

      if (activeJobIdRef.current === currentJobId) {
        rememberWorkerKaelSession(currentJobId, finalResponse.data.session.id)
        setProgress(finalResponse.data.session.progress)
        setTurns(workerV5PrivateKaelTurnsFromResponse(finalResponse.data.turns))
        setMediaItems([])
      }
    } catch {
      setError(textByLanguage(language, 'Kael đang không kết nối được. Không có hành động nào được ghi vào việc.', 'Kael is unavailable. No work action was written.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={[styles.jobRoomThreadCard, reduceTransparency && styles.opaqueCard]} testID={`worker-v5-private-kael-chat-${mode}`}>
      {!reduceTransparency ? <MintAura intensity="component" style={styles.jobRoomThreadAura} /> : null}
      <View style={styles.jobRoomBubbleStack}>
        {renderedTurns.map((turn) => (
          <WorkerV5ChatBubble
            align={turn.role === 'worker' ? 'right' : undefined}
            body={turn.text}
            key={turn.id}
            label={turn.role === 'worker'
              ? textByLanguage(language, 'Thợ · riêng tư', 'Worker · private')
              : textByLanguage(language, 'Kael · tư vấn riêng', 'Kael · private advisory')}
          />
        ))}
        {progressPercent != null ? (
          <View style={styles.boundaryNote} testID="worker-kael-chat-progress">
            <Text style={styles.boundaryTitle}>{textByLanguage(language, 'Kael đang xử lý', 'Kael is working')}</Text>
            <Text style={styles.boundaryBody}>{`${progressPercent}%`}</Text>
          </View>
        ) : null}
        {error ? (
          <WorkerV5ChatBubble
            body={error}
            label={textByLanguage(language, 'Kael · fallback', 'Kael · fallback')}
          />
        ) : null}
      </View>
      {mediaItems.length > 0 ? (
        <View style={styles.privateKaelMediaRail} testID="worker-chat-media-preview-rail">
          {mediaItems.map((item, index) => (
            <View key={`${item.uri}-${index}`} style={styles.privateKaelMediaPreview} testID={`worker-chat-media-preview-${index}`}>
              <Image source={{ uri: item.uri }} style={styles.privateKaelMediaImage} testID={`worker-chat-media-preview-image-${index}`} />
              <Text numberOfLines={1} style={styles.privateKaelMediaText}>{item.fileName}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View
        accessibilityLabel={inputPlaceholder}
        accessibilityState={{ busy, disabled: busy || readOnly }}
        style={[styles.composerShell, reduceTransparency && styles.opaqueCard]}
        testID="worker-v5-composer-shell"
      >
        <Pressable
          accessibilityLabel={textByLanguage(language, 'Đính kèm bằng chứng cho Kael', 'Attach evidence for Kael')}
          accessibilityRole="button"
          disabled={busy || readOnly}
          onPress={attachPrivateKaelMedia}
          style={[styles.composerUtility, (busy || readOnly) && styles.jobRoomSendDisabled]}
          testID="worker-kael-chat-attach"
        >
          <Image source={workerV5Icons.document} style={styles.composerIcon} />
        </Pressable>
        <Pressable
          accessibilityLabel={textByLanguage(language, 'Góp ý về Kael', 'Send Kael feedback')}
          accessibilityRole="button"
          accessibilityState={{ busy, disabled: busy || (feedbackOpen && !draft.trim()) }}
          disabled={busy || (feedbackOpen && !draft.trim())}
          onPress={feedbackOpen ? submitPrivateKaelFeedback : () => {
            setFeedbackOpen(true)
            setError(null)
          }}
          style={[styles.composerUtility, busy && styles.jobRoomSendDisabled]}
          testID={feedbackOpen ? 'worker-kael-feedback-submit' : 'worker-kael-feedback-open'}
        >
          <Image source={workerV5Icons.chat} style={styles.composerIcon} />
        </Pressable>
        <Pressable
          accessibilityLabel={textByLanguage(language, 'Ghi âm cho Kael', 'Record for Kael')}
          accessibilityRole="button"
          disabled={busy || readOnly}
          onPress={() => Alert.alert('Mic', textByLanguage(language, 'Kael chưa có dictation trong bản mobile này. Bạn có thể nhập tin nhắn hoặc đính kèm ảnh.', 'Kael dictation is not enabled in this mobile build. You can type a message or attach a photo.'))}
          style={[styles.composerUtility, (busy || readOnly) && styles.jobRoomSendDisabled]}
          testID="worker-kael-chat-mic"
        >
          <Image source={workerV5Icons.scope} style={styles.composerIcon} />
        </Pressable>
        <KaelTextField
          accessibilityLabel={inputPlaceholder}
          editable={!busy && !readOnly}
          inputShellStyle={styles.workerChatTextFieldShell}
          multiline
          onChangeText={setDraft}
          placeholder={inputPlaceholder}
          placeholderTextColor={color.text.muted}
          scrollEnabled={false}
          shellStyle={styles.workerChatTextFieldStack}
          style={styles.jobRoomComposerInput}
          testID="worker-kael-chat-input"
          value={draft}
        />
        <Pressable
          accessibilityLabel={textByLanguage(language, 'Gửi cho Kael', 'Send to Kael')}
          accessibilityRole="button"
          accessibilityState={{ busy, disabled: busy || readOnly || feedbackOpen || !draft.trim() }}
          disabled={busy || readOnly || feedbackOpen || !draft.trim()}
          onPress={submitPrivateKaelMessage}
          style={[styles.composerSend, (busy || readOnly || feedbackOpen || !draft.trim()) && styles.jobRoomSendDisabled]}
          testID="worker-kael-send-button"
        >
          <Image source={workerV5Icons.chat} style={styles.composerSendIcon} />
        </Pressable>
      </View>
    </View>
  )
}

function workerV5PrivateKaelTurnsFromResponse(turns: WorkerKaelChatTurn[]): WorkerV5PrivateKaelLocalTurn[] {
  return turns
    .filter((turn) => (turn.role === 'worker' || turn.role === 'kael') && turn.text_content)
    .map((turn) => ({
      id: turn.id,
      role: turn.role as 'kael' | 'worker',
      text: turn.text_content ?? '',
    }))
}

function workerV5PrivateKaelMediaName(asset: ImagePicker.ImagePickerAsset, index: number, language: AppLanguage) {
  const fileName = asset.fileName?.trim()
  if (fileName) return fileName
  return textByLanguage(language, `anh-hien-truong-${index + 1}.jpg`, `onsite-photo-${index + 1}.jpg`)
}

function isWorkerV5PrivateKaelReadOnly(deal: LocalDeal | null) {
  const status = deal?.backendStatus ?? deal?.status ?? null
  return status === 'payment_pending' || status === 'paid' || status === 'reviewed'
}

function WorkerV5CommandCenterHero({
  deal,
  earnings,
  language,
  reduceTransparency,
}: {
  deal: LocalDeal | null
  earnings: WorkerV5Runtime['workerEarnings']
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const amount = earnings?.net_earnings && earnings.net_earnings > 0
    ? formatVnd(earnings.net_earnings, language)
    : textByLanguage(language, 'Chưa có rút tiền thật', 'No real payout yet')
  return (
    <View style={[styles.commandHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-command-center-hero">
      {!reduceTransparency ? <MintAura intensity="component" style={styles.commandHeroAura} testID="worker-v5-command-center-mint-aura" /> : null}
      <View style={styles.commandHeroCopy}>
        <Text style={styles.commandHeroPill} numberOfLines={1}>{deal ? localizedStatusLabel(deal.status, language) : textByLanguage(language, 'Chưa có việc', 'No work')}</Text>
        <Text style={styles.commandHeroTitle} numberOfLines={2}>{deal ? localizedServiceLabel(deal.draft.serviceType, language) : textByLanguage(language, 'Trung tâm điều phối việc', 'Active Work Command Center')}</Text>
        <Text style={styles.commandHeroMeta} numberOfLines={2}>{deal ? routeDestinationLabel(deal, language) : textByLanguage(language, 'Điều phối chỉ mở khi có việc thật.', 'Command center opens only for real work.')}</Text>
      </View>
      <View style={styles.commandHeroAmount}>
        <Text style={styles.commandHeroAmountLabel} numberOfLines={2}>{textByLanguage(language, 'Rút tiền được bảo vệ', 'Protected payout')}</Text>
        <Text style={styles.commandHeroAmountValue} numberOfLines={2} testID="worker-v5-command-center-amount">{amount}</Text>
      </View>
    </View>
  )
}

function WorkerV5CommandCenterLog({
  deal,
  language,
  reduceTransparency,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const rows = [
    {
      meta: deal?.completionPhotoUrls?.length ? textByLanguage(language, `${deal.completionPhotoUrls.length} ảnh · nguồn thợ`, `${deal.completionPhotoUrls.length} photos · worker source`) : textByLanguage(language, 'Chưa có nhóm bằng chứng', 'No evidence batch yet'),
      state: deal?.completionPhotoUrls?.length ? 'done' as const : 'todo' as const,
      title: textByLanguage(language, 'Nhóm bằng chứng đã nhập', 'Evidence batch imported'),
    },
    {
      meta: textByLanguage(language, 'Không phát sinh nguy co từ dữ liệu hiện có', 'No risk detected from current data'),
      state: deal ? 'done' as const : 'todo' as const,
      title: textByLanguage(language, 'Kiểm tra rủi ro hoàn tất', 'Risk check completed'),
    },
    {
      meta: deal?.scopeChange ? textByLanguage(language, 'Đang so với phạm vi ban đầu và chính sách', 'Comparing with original scope and policy') : textByLanguage(language, 'Không có đổi phạm vi', 'No scope change'),
      state: deal?.scopeChange ? 'active' as const : 'todo' as const,
      title: textByLanguage(language, 'Đối chiếu đổi phạm vi', 'Scope-change reconciliation'),
    },
    {
      meta: deal?.completionNotes ? textByLanguage(language, 'Đã có ghi chú hoàn tất', 'Completion note exists') : textByLanguage(language, 'Chờ phần phát sinh được duyệt', 'Waiting for approved extra work'),
      state: deal?.completionNotes ? 'done' as const : 'todo' as const,
      title: textByLanguage(language, 'Chuẩn bị hồ sơ hoàn tất', 'Prepare completion artifact'),
    },
  ]
  return <WorkerV5StatusTimeline reduceTransparency={reduceTransparency} rows={rows} testID="worker-v5-command-center-log" />
}

function WorkerV5ApprovalQueueHero({
  language,
  reduceTransparency,
  scope,
}: {
  language: AppLanguage
  reduceTransparency: boolean
  scope: LocalDeal['scopeChange']
}) {
  return (
    <View style={[styles.approvalQueueHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-approval-queue-hero">
      {!reduceTransparency ? <MintAura intensity="component" style={styles.approvalQueueHeroAura} testID="worker-v5-approval-queue-mint-aura" /> : null}
      <View style={styles.approvalQueueIconShell}>
        {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
        <Image source={workerV5Icons.shield} style={styles.approvalQueueIcon} />
      </View>
      <View style={styles.approvalQueueHeroCopy}>
        <Text style={styles.approvalQueuePill} numberOfLines={1}>{scope ? textByLanguage(language, '1 việc cần bạn', '1 item needs you') : textByLanguage(language, 'Không có hàng chờ', 'No queue')}</Text>
        <Text style={styles.approvalQueueTitle} numberOfLines={2}>{scope ? textByLanguage(language, 'Duyệt trước khi gửi', 'Review before sending') : textByLanguage(language, 'Chưa có bản nháp cần duyệt', 'No draft needs review')}</Text>
        <Text style={styles.approvalQueueMeta} numberOfLines={2}>{textByLanguage(language, 'Kael không được tự thực hiện các hành động này.', 'Kael cannot execute these actions automatically.')}</Text>
      </View>
    </View>
  )
}

function WorkerV5ApprovalDraftCard({
  language,
  reduceTransparency,
  scope,
}: {
  language: AppLanguage
  reduceTransparency: boolean
  scope: LocalDeal['scopeChange']
}) {
  return (
    <View style={[styles.approvalDraftCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-approval-draft-card">
      <View style={styles.approvalDraftHeader}>
        <View style={styles.approvalDraftIconShell}>
          {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
          <Image source={workerV5Icons.scope} style={styles.approvalDraftIcon} />
        </View>
        <View style={styles.approvalDraftCopy}>
          <Text style={styles.approvalDraftTitle} numberOfLines={2} testID="worker-v5-approval-draft-title">{scope?.requestedDescription || textByLanguage(language, 'Chưa có bản nháp thật', 'No real draft yet')}</Text>
          <Text style={styles.approvalDraftMeta} numberOfLines={2}>{scope?.reason || textByLanguage(language, 'Kael chỉ hiển thị khi có lý do và bằng chứng thật.', 'Kael shows this only when real reason and evidence exist.')}</Text>
        </View>
        <Text style={styles.approvalDraftImpact} numberOfLines={2} testID="worker-v5-approval-draft-impact">{scope ? textByLanguage(language, 'Cần duyệt', 'Review') : textByLanguage(language, 'Trống', 'Empty')}</Text>
      </View>
      <View style={styles.approvalDraftStats}>
        <MetricTile label={textByLanguage(language, 'Kael kiểm tra', 'Kael review')} value={scope?.kaelProgress?.status ? scope.kaelProgress.status : textByLanguage(language, 'Chưa có', 'None')} />
        <MetricTile label={textByLanguage(language, 'Nguồn độc lập', 'Sources')} value={scope?.evidencePhotoUrls?.length ? `${scope.evidencePhotoUrls.length}` : textByLanguage(language, 'Chưa có', 'None')} />
      </View>
    </View>
  )
}

function WorkerV5ApprovalDecisionList({
  language,
  reduceTransparency,
  scope,
}: {
  language: AppLanguage
  reduceTransparency: boolean
  scope: LocalDeal['scopeChange']
}) {
  const rows = [
    {
      icon: 'calendar' as const,
      meta: scope?.createdAt || textByLanguage(language, 'Chưa có mốc ghi nhận', 'No recorded timestamp'),
      status: scope ? scopeChangeStatusLabel(scope.status, language) : textByLanguage(language, 'Chờ', 'Waiting'),
      title: textByLanguage(language, 'Gửi đổi phạm vi', 'Send scope change'),
    },
    {
      icon: 'evidence' as const,
      meta: scope?.evidencePhotoUrls?.length ? textByLanguage(language, 'Có bằng chứng dính kèm', 'Evidence attached') : textByLanguage(language, 'Chưa đủ bằng chứng', 'Evidence missing'),
      status: scope?.evidencePhotoUrls?.length ? textByLanguage(language, 'Đã có', 'Ready') : textByLanguage(language, 'Chờ', 'Waiting'),
      title: textByLanguage(language, 'Gửi hồ sơ hoàn tất', 'Send completion artifact'),
    },
  ]
  return (
    <View style={[styles.approvalDecisionList, reduceTransparency && styles.opaqueCard]} testID="worker-v5-approval-decision-list">
      {rows.map((row, index) => (
        <View key={row.title} style={styles.approvalDecisionRow}>
          <View style={styles.approvalDecisionIconShell}>
            {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
            <Image resizeMode="contain" source={workerV5Icons[row.icon]} style={styles.approvalDecisionIcon} />
          </View>
          <View style={styles.approvalDecisionCopy}>
            <Text style={styles.approvalDecisionTitle} numberOfLines={2} testID={`worker-v5-approval-decision-title-${index}`}>{row.title}</Text>
            <Text style={styles.approvalDecisionMeta} numberOfLines={2}>{row.meta}</Text>
          </View>
          <Text style={styles.approvalDecisionStatus} numberOfLines={2} testID={`worker-v5-approval-decision-status-${index}`}>{row.status}</Text>
        </View>
      ))}
    </View>
  )
}

function WorkerV5TimelineHero({
  eventCount,
  language,
  reduceTransparency,
}: {
  eventCount: number
  language: AppLanguage
  reduceTransparency: boolean
}) {
  return (
    <View style={[styles.timelineHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-timeline-hero">
      {!reduceTransparency ? <MintAura intensity="component" style={styles.timelineHeroAura} testID="worker-v5-timeline-mint-aura" /> : null}
      <View style={styles.timelineHeroCopy}>
        <Text style={styles.timelineHeroPill} numberOfLines={1}>{textByLanguage(language, 'Nguồn đã khóa', 'Source locked')}</Text>
        <Text style={styles.timelineHeroTitle} numberOfLines={2}>{textByLanguage(language, 'Một dòng thời gian duy nhất', 'One canonical timeline')}</Text>
        <Text style={styles.timelineHeroMeta} numberOfLines={2}>{textByLanguage(language, 'Hiển thị sự kiện suy ra từ trạng thái thật, không tạo mốc giả.', 'Shows events inferred from real status without invented timestamps.')}</Text>
      </View>
      <View style={styles.timelineHeroLens}>
        <Text style={styles.timelineHeroCount}>{eventCount}</Text>
        <Text style={styles.timelineHeroCountLabel}>{textByLanguage(language, 'Sự kiện', 'Events')}</Text>
      </View>
    </View>
  )
}

function WorkerV5SafetyHero({ language, reduceTransparency }: { language: AppLanguage; reduceTransparency: boolean }) {
  return (
    <View style={[styles.safetyHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-safety-hero">
      {!reduceTransparency ? <MintAura intensity="component" style={styles.safetyHeroAura} testID="worker-v5-safety-mint-aura" /> : null}
      <View style={styles.safetyHeroIconShell}>
        {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
        <Image source={workerV5Icons.shield} style={styles.safetyHeroIcon} />
      </View>
      <View style={styles.safetyHeroCopy}>
        <Text style={styles.safetyHeroPill} numberOfLines={1}>{textByLanguage(language, 'Ranh giới an toàn', 'Safety boundary')}</Text>
        <Text style={styles.safetyHeroTitle} numberOfLines={2}>{textByLanguage(language, 'Đếng việc nếu có rủi ro', 'Stop work if there is risk')}</Text>
        <Text style={styles.safetyHeroMeta} numberOfLines={2}>{textByLanguage(language, 'Kael hướng dẫn sơ bộ; chuyên gia hoặc hỗ trợ con người xử lý quyết định an toàn.', 'Kael gives initial guidance; experts or human support handle safety decisions.')}</Text>
      </View>
    </View>
  )
}

function WorkerV5SafetyRiskList({
  language,
  reduceTransparency,
}: {
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const rows = [
    { icon: 'shield' as const, status: textByLanguage(language, 'Khẩn cấp', 'Urgent'), title: textByLanguage(language, 'Rò điện hoặc mùi khét', 'Electrical leak or burning smell'), value: textByLanguage(language, 'Đóng nguồn, rời khu vực nguy hiểm', 'Cut power and leave the unsafe area') },
    { icon: 'tools' as const, status: '›', title: textByLanguage(language, 'Rò nước lớn', 'Major water leak'), value: textByLanguage(language, 'Khóa van nếu an toàn và gửi hỗ trợ trong app', 'Shut valve if safe and request in-app support') },
    { icon: 'scope' as const, status: '›', title: textByLanguage(language, 'Phát sinh ngoài chuyên môn', 'Outside specialization'), value: textByLanguage(language, 'Tạm dừng và chuyển tuyến', 'Pause and route to support') },
  ]
  return (
    <View style={[styles.safetyRiskList, reduceTransparency && styles.opaqueCard]} testID="worker-v5-safety-risk-list">
      {rows.map((row, index) => (
        <View key={row.title} style={styles.safetyRiskRow}>
          <View style={styles.safetyRiskIconShell}>
            {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
            <Image source={workerV5Icons[row.icon]} style={styles.safetyRiskIcon} />
          </View>
          <View style={styles.safetyRiskCopy}>
            <Text style={styles.safetyRiskTitle} numberOfLines={2} testID={`worker-v5-safety-risk-title-${index}`}>{row.title}</Text>
            <Text style={styles.safetyRiskMeta} numberOfLines={2}>{row.value}</Text>
          </View>
          <Text style={[styles.safetyRiskStatus, row.status === textByLanguage(language, 'Khẩn cấp', 'Urgent') ? styles.safetyRiskStatusUrgent : null]} numberOfLines={2} testID={`worker-v5-safety-risk-status-${index}`}>{row.status}</Text>
        </View>
      ))}
    </View>
  )
}

function WorkerV5EarningsHero({
  earnings,
  language,
  reduceTransparency,
}: {
  earnings: WorkerV5Runtime['workerEarnings']
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const hasGross = Boolean(earnings?.gross_earnings && earnings.gross_earnings > 0)
  const amount = hasGross
    ? formatVndDong(earnings?.gross_earnings ?? 0, language)
    : textByLanguage(language, 'Chưa có thu nhập thật', 'No real income yet')
  const stats = [
    {
      label: textByLanguage(language, 'Đã thanh toán', 'Settled'),
      value: earnings?.net_earnings && earnings.net_earnings > 0 ? formatCompactVnd(earnings.net_earnings, language) : textByLanguage(language, 'Chưa có', 'None'),
    },
    {
      label: textByLanguage(language, 'Đang chờ', 'Pending'),
      value: earnings?.pending_payment_amount && earnings.pending_payment_amount > 0 ? formatCompactVnd(earnings.pending_payment_amount, language) : textByLanguage(language, 'Không có', 'None'),
    },
    {
      label: textByLanguage(language, 'Có thể rút', 'Available'),
      value: earnings?.net_earnings && earnings.net_earnings > 0 ? formatCompactVnd(earnings.net_earnings, language) : textByLanguage(language, 'Chưa có', 'None'),
    },
  ]
  return (
    <View style={[styles.earningsHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-earnings-hero">
      {!reduceTransparency ? (
        <WorkerV5EarningsHomeHeroAura testID="worker-v5-earnings-mint-aura" />
      ) : null}
      <View style={styles.earningsHeroContent}>
        <View style={styles.earningsHeroMainRow}>
          <View style={styles.earningsHeroCopy}>
            <Text style={styles.earningsHeroAmount} numberOfLines={2} testID="worker-v5-earnings-amount">{amount}</Text>
            <Text style={styles.earningsHeroMeta} numberOfLines={2}>{hasGross ? textByLanguage(language, 'Đã ghi sổ thu nhập', 'Income ledger recorded') : textByLanguage(language, 'Chờ hệ thống ghi sổ thu nhập', 'Waiting for system income ledger')}</Text>
          </View>
          <View style={styles.earningsHeroIconShell}>
            {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
            <Image resizeMode="contain" source={workerV5Icons.wallet} style={styles.earningsHeroIcon} />
          </View>
        </View>
        <View style={styles.earningsStatGrid} testID="worker-v5-earnings-stat-grid">
          {stats.map((item, index) => (
            <View key={item.label} style={styles.earningsStatTile} testID={`worker-v5-earnings-stat-${index}`}>
              <Text style={styles.earningsStatValue} numberOfLines={1} testID={`worker-v5-earnings-stat-value-${index}`}>{item.value}</Text>
              <Text style={styles.earningsStatLabel} numberOfLines={2}>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}

function WorkerV5EarningsTransactionList({
  language,
  recent,
  reduceTransparency,
}: {
  language: AppLanguage
  recent: NonNullable<WorkerV5Runtime['workerEarnings']>['daily_earnings']
  reduceTransparency: boolean
}) {
  return (
    <View style={[styles.earningsTransactionList, reduceTransparency && styles.opaqueCard]} testID="worker-v5-earnings-transactions">
      {!reduceTransparency ? (
        <WorkerV5EarningsHomeListAura testID="worker-v5-earnings-transactions-mint-aura" />
      ) : null}
      {recent.length ? recent.map((row, index) => (
        <View key={row.date} style={styles.earningsTransactionRow} testID={`worker-v5-earnings-transaction-${index}`}>
          <View style={styles.earningsTransactionIconShell}>
            {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
            <Image source={workerV5Icons.document} style={styles.earningsTransactionIcon} />
          </View>
          <View style={styles.earningsTransactionCopy}>
            <Text style={styles.earningsTransactionTitle} numberOfLines={1}>{row.date}</Text>
            <Text style={styles.earningsTransactionMeta} numberOfLines={2}>{textByLanguage(language, `${row.paid_job_count} việc đã trả`, `${row.paid_job_count} paid jobs`)}</Text>
          </View>
          <Text style={styles.earningsTransactionAmount} numberOfLines={2} testID={`worker-v5-earnings-transaction-amount-${index}`}>+{formatVndDong(row.net_earnings, language)}</Text>
        </View>
      )) : (
        <View style={styles.earningsTransactionRow}>
          <View style={styles.earningsTransactionIconShell}>
            {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
            <Image source={workerV5Icons.wallet} style={styles.earningsTransactionIcon} />
          </View>
          <View style={styles.earningsTransactionCopy}>
            <Text style={styles.earningsTransactionTitle} numberOfLines={2}>{textByLanguage(language, 'Chưa có giao dịch gần đây', 'No recent transactions')}</Text>
            <Text style={styles.earningsTransactionMeta} numberOfLines={2}>{textByLanguage(language, 'Giao dịch chỉ hiện khi số đối soát thật đồng bộ.', 'Transactions appear only when the real ledger syncs.')}</Text>
          </View>
        </View>
      )}
    </View>
  )
}

function WorkerV5LedgerHero({
  earnings,
  language,
  reduceTransparency,
}: {
  earnings: WorkerV5Runtime['workerEarnings']
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const netValue = typeof earnings?.net_earnings === 'number' ? earnings.net_earnings : 0
  const net = formatVndDong(netValue, language)

  return (
    <View style={[styles.paymentTotalCard, styles.ledgerHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-ledger-hero">
      {!reduceTransparency ? <WorkerV5EarningsHomeHeroAura testID="worker-v5-ledger-mint-aura" /> : null}
      <View style={styles.paymentTotalCopy}>
        <Text style={styles.paymentTotalCaption} numberOfLines={1}>{textByLanguage(language, 'Thu nhập ròng', 'Net earnings')}</Text>
        <Text style={styles.paymentTotalAmount} numberOfLines={2} testID="worker-v5-ledger-amount">{net}</Text>
      </View>
    </View>
  )
}

function WorkerV5LedgerBreakdownCard({
  earnings,
  language,
  reduceTransparency,
}: {
  earnings: WorkerV5Runtime['workerEarnings']
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const grossValue = typeof earnings?.gross_earnings === 'number' ? earnings.gross_earnings : 0
  const platformFeeValue = typeof earnings?.platform_fee_total === 'number' ? earnings.platform_fee_total : 0
  const netValue = typeof earnings?.net_earnings === 'number' ? earnings.net_earnings : 0
  const paidJobsValue = typeof earnings?.total_jobs_paid === 'number' ? earnings.total_jobs_paid : 0
  const rows = [
    {
      label: textByLanguage(language, 'Thu nhập gộp', 'Gross income'),
      value: formatVndDong(grossValue, language),
    },
    {
      label: textByLanguage(language, 'Phí nền tảng', 'Platform fee'),
      value: platformFeeValue > 0 ? `-${formatVndDong(platformFeeValue, language)}` : formatVndDong(0, language),
    },
    {
      label: textByLanguage(language, 'Việc đã trả', 'Paid jobs'),
      value: `${paidJobsValue}`,
    },
  ]

  return (
    <View style={[styles.priceLinesCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-ledger-breakdown">
      {!reduceTransparency ? <WorkerV5EarningsHomeListAura testID="worker-v5-ledger-breakdown-mint-aura" /> : null}
      {rows.map((row, index) => (
        <View key={row.label} style={styles.priceLine}>
          <Text style={styles.priceLineLabel} numberOfLines={2} testID={`worker-v5-ledger-breakdown-label-${index}`}>{row.label}</Text>
          <Text style={styles.priceLineValue} numberOfLines={2} testID={`worker-v5-ledger-breakdown-value-${index}`}>{row.value}</Text>
        </View>
      ))}
      <View style={styles.priceTotalLine}>
        <Text style={styles.priceTotalLabel} numberOfLines={2}>{textByLanguage(language, 'Thu nhập ròng', 'Net income')}</Text>
        <Text style={styles.priceTotalValue} numberOfLines={2} testID="worker-v5-ledger-net-total">
          {formatVndDong(netValue, language)}
        </Text>
      </View>
    </View>
  )
}

function WorkerV5LedgerTraceTimeline({
  earnings,
  language,
  reduceTransparency,
}: {
  earnings: WorkerV5Runtime['workerEarnings']
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const paidJobsValue = typeof earnings?.total_jobs_paid === 'number' ? earnings.total_jobs_paid : 0
  const netValue = typeof earnings?.net_earnings === 'number' ? earnings.net_earnings : 0
  const jobsReady = paidJobsValue > 0
  const netReady = netValue > 0
  const rows = [
    {
      meta: textByLanguage(language, `${paidJobsValue} việc đã trả`, `${paidJobsValue} paid jobs`),
      state: jobsReady ? 'done' as const : 'todo' as const,
      title: textByLanguage(language, 'Gom giao dịch', 'Transaction rollup'),
    },
    {
      meta: formatVndDong(netValue, language),
      state: netReady ? 'done' as const : jobsReady ? 'active' as const : 'todo' as const,
      title: textByLanguage(language, 'Ghi sổ ví thu nhập', 'Income wallet ledger'),
    },
  ]
  return <WorkerV5StatusTimeline formulaAura reduceTransparency={reduceTransparency} rows={rows} testID="worker-v5-ledger-trace" />
}

function WorkerV5PayoutRequestHero({
  earnings,
  language,
  reduceTransparency,
}: {
  earnings: WorkerV5Runtime['workerEarnings']
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const balanceValue = typeof earnings?.net_earnings === 'number' ? earnings.net_earnings : 0
  return (
    <View style={[styles.earningsHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-payout-request-hero">
      {!reduceTransparency ? <WorkerV5EarningsHomeHeroAura testID="worker-v5-payout-request-mint-aura" /> : null}
      <View style={styles.earningsHeroMainRow}>
        <View style={styles.earningsHeroIconShell}>
          {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
          <Image resizeMode="contain" source={workerV5Icons.wallet} style={styles.earningsHeroIcon} />
        </View>
        <View style={styles.earningsHeroCopy}>
          <Text style={styles.earningsHeroMeta} numberOfLines={1}>{textByLanguage(language, 'Số dư khả dụng', 'Available balance')}</Text>
          <Text style={styles.earningsHeroAmount} numberOfLines={2} testID="worker-v5-payout-request-amount">
            {formatVndDong(balanceValue, language)}
          </Text>
        </View>
      </View>
    </View>
  )
}

function WorkerV5PayoutAmountCard({
  earnings,
  language,
  reduceTransparency,
}: {
  earnings: WorkerV5Runtime['workerEarnings']
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const balanceValue = typeof earnings?.net_earnings === 'number' ? earnings.net_earnings : 0
  const amount = new Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US', { maximumFractionDigits: 0 }).format(balanceValue)
  return (
    <View style={[styles.payoutAmountInputCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-payout-amount-card">
      {!reduceTransparency ? <WorkerV5EarningsHomeListAura testID="worker-v5-payout-amount-mint-aura" /> : null}
      <Text style={styles.payoutAmountInputValue} numberOfLines={2} testID="worker-v5-payout-amount-value">
        {amount}
      </Text>
      <Text style={styles.payoutAmountCurrency} numberOfLines={1}>
        đ
      </Text>
    </View>
  )
}

function WorkerV5PayoutAccountCard({
  language,
  profile,
  reduceTransparency,
}: {
  language: AppLanguage
  profile: WorkerV5Runtime['workerProfile']
  reduceTransparency: boolean
}) {
  const hasBank = Boolean(profile?.bank_account_masked)
  const bankLogo = resolveWorkerV5BankLogo(profile?.bank_name)
  const bankName = profile?.bank_name || textByLanguage(language, 'Ngân hàng đã ghi', 'Recorded bank')
  return (
    <View style={[styles.bankCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-payout-account-card">
      {!reduceTransparency ? <WorkerV5EarningsHomeListAura testID="worker-v5-payout-account-mint-aura" /> : null}
      <View style={styles.bankIconTile}>
        {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
        <Image source={bankLogo ?? workerV5Icons.shield} style={bankLogo ? styles.bankCardLogoImage : styles.utilityIcon} />
      </View>
      <View style={styles.opportunityTextColumn}>
        <Text style={styles.opportunityTitle} numberOfLines={2} testID="worker-v5-payout-account-title">{hasBank ? bankName : textByLanguage(language, 'Chưa có tài khoản xác minh', 'No verified account')}</Text>
        <Text style={styles.opportunityMeta} numberOfLines={2} testID="worker-v5-payout-account-meta">{hasBank ? profile?.bank_account_masked : textByLanguage(language, 'Dùng luồng xác minh hiện hữu trước khi rút tiền.', 'Use the existing verification flow before payout.')}</Text>
      </View>
      <Text style={styles.chevronText}>›</Text>
    </View>
  )
}

function WorkerV5PayoutMethodHero({
  language,
  profile,
  reduceTransparency,
  selectedBank,
}: {
  language: AppLanguage
  profile: WorkerV5Runtime['workerProfile']
  reduceTransparency: boolean
  selectedBank: WorkerV5BankLogoName | null
}) {
  const profileBank = resolveWorkerV5BankLogoName(profile?.bank_name)
  const effectiveBank = selectedBank ?? profileBank
  const hasBank = Boolean(profile?.bank_account_masked && (!selectedBank || selectedBank === profileBank))
  const bankLogo = effectiveBank ? workerV5BankLogos[effectiveBank] : null
  const bankName = effectiveBank ? workerV5BankLabel(effectiveBank) : textByLanguage(language, 'Tài khoản nhận tiền', 'Payout account')
  const identity = profile?.legal_name?.trim() || textByLanguage(language, 'Hồ sơ thợ', 'Worker profile')
  return (
    <View style={[styles.payoutMethodHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-payout-method-hero">
      {!reduceTransparency ? <WorkerV5EarningsHomeListAura testID="worker-v5-payout-method-mint-aura" /> : null}
      <View style={styles.payoutMethodLogoFrame}>
        {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
        <Image
          resizeMode="contain"
          source={bankLogo ?? workerV5Icons.wallet}
          style={bankLogo ? styles.payoutMethodLogoImage : styles.earningsHeroIcon}
          testID="worker-v5-payout-method-hero-logo"
        />
      </View>
      <View style={styles.payoutMethodHeroCopy}>
        <Text style={styles.opportunityTitle} numberOfLines={2} testID="worker-v5-payout-method-name">
          {hasBank ? `${bankName} · ${profile?.bank_account_masked}` : bankName}
        </Text>
        <Text style={styles.opportunityMeta} numberOfLines={2} testID="worker-v5-payout-method-account">
          {hasBank ? `${identity} · ${textByLanguage(language, 'mặc định', 'default')}` : textByLanguage(language, 'Nhập thông tin chủ tài khoản rồi kiểm tra trước xác thực.', 'Enter account owner details, then run pre-verification checks.')}
        </Text>
      </View>
      <Text style={styles.approvalDecisionStatus} numberOfLines={2} testID="worker-v5-payout-method-status">
        {hasBank ? textByLanguage(language, 'Đã chọn', 'Selected') : textByLanguage(language, 'Chưa có', 'None')}
      </Text>
    </View>
  )
}

function WorkerV5PayoutMethodBankGrid({
  language,
  onSelectBank,
  profile,
  reduceTransparency,
  selectedBank,
}: {
  language: AppLanguage
  onSelectBank: (bank: WorkerV5BankLogoName) => void
  profile: WorkerV5Runtime['workerProfile']
  reduceTransparency: boolean
  selectedBank: WorkerV5BankLogoName | null
}) {
  const effectiveSelectedBank = selectedBank ?? resolveWorkerV5BankLogoName(profile?.bank_name)
  return (
    <View style={styles.payoutBankGrid} testID="worker-v5-payout-method-grid">
      {WORKER_V5_BANK_OPTIONS.map((item, index) => {
        const selected = effectiveSelectedBank === item.code
        return (
        <Pressable
          accessibilityLabel={textByLanguage(language, `Chọn ${item.label}`, `Choose ${item.label}`)}
          accessibilityRole="button"
          accessibilityState={{ selected }}
          key={item.code}
          onPress={() => onSelectBank(item.code)}
          style={[styles.payoutBankChip, reduceTransparency && styles.opaqueCard, selected ? styles.payoutBankChipSelected : null]}
          testID={`worker-v5-payout-method-bank-${index}`}
        >
          {!reduceTransparency ? <WorkerV5EarningsHomeListAura testID={`worker-v5-payout-method-bank-aura-${index}`} /> : null}
          <Image resizeMode="contain" source={workerV5BankLogos[item.code]} style={styles.payoutBankLogo} />
          <Text style={styles.srOnlyText} numberOfLines={2} testID={`worker-v5-payout-method-label-${index}`}>
            {textByLanguage(language, `Ngân hàng ${index + 1}`, `Bank ${index + 1}`)}
          </Text>
          <Text style={styles.srOnlyText} numberOfLines={2} testID={`worker-v5-payout-method-value-${index}`}>{selected ? textByLanguage(language, 'Đã chọn', 'Selected') : textByLanguage(language, 'Chưa liên kết', 'Not linked')}</Text>
          {selected ? (
            <View style={styles.payoutBankCheck}>
              <Text style={styles.payoutBankCheckText}>✓</Text>
            </View>
          ) : null}
        </Pressable>
      )})}
    </View>
  )
}

function WorkerV5PayoutAccountManagementRows({
  accountFormOpen,
  language,
  limitPolicyOpen,
  onOpenAccountForm,
  onOpenLimitPolicy,
  profile,
  reduceTransparency,
}: {
  accountFormOpen: boolean
  language: AppLanguage
  limitPolicyOpen: boolean
  onOpenAccountForm: () => void
  onOpenLimitPolicy: () => void
  profile: WorkerV5Runtime['workerProfile']
  reduceTransparency: boolean
}) {
  const rows = [
    {
      icon: 'wallet' as const,
      meta: textByLanguage(language, 'Xác minh chủ tài khoản trước khi dùng', 'Verify account ownership before use'),
      onPress: onOpenAccountForm,
      status: Boolean(profile?.bank_account_masked) ? textByLanguage(language, 'Đã ghi', 'Recorded') : textByLanguage(language, 'Chờ', 'Waiting'),
      title: textByLanguage(language, 'Thêm tài khoản ngân hàng', 'Add bank account'),
      active: accountFormOpen,
    },
    {
      icon: 'shield' as const,
      meta: textByLanguage(language, 'Không đặt hạn mức cố định', 'No fixed withdrawal cap'),
      onPress: onOpenLimitPolicy,
      status: textByLanguage(language, 'Hệ thống', 'System'),
      title: textByLanguage(language, 'Giới hạn rút tiền', 'Payout limit'),
      active: limitPolicyOpen,
    },
  ]
  return (
    <View style={[styles.approvalDecisionList, reduceTransparency && styles.opaqueCard]} testID="worker-v5-account-management-list">
      {!reduceTransparency ? <WorkerV5EarningsHomeListAura testID="worker-v5-account-management-mint-aura" /> : null}
      {rows.map((row, index) => (
        <Pressable
          accessibilityLabel={row.title}
          accessibilityRole="button"
          accessibilityState={{ selected: row.active }}
          key={row.title}
          onPress={row.onPress}
          style={[styles.approvalDecisionRow, row.active ? styles.payoutAccountManagementRowActive : null]}
          testID={`worker-v5-account-management-row-${index}`}
        >
          <View style={styles.approvalDecisionIconShell}>
            {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
            <Image resizeMode="contain" source={workerV5Icons[row.icon]} style={styles.approvalDecisionIcon} />
          </View>
          <View style={styles.approvalDecisionCopy}>
            <Text style={styles.approvalDecisionTitle} numberOfLines={2} testID={`worker-v5-account-management-title-${index}`}>{row.title}</Text>
            <Text style={styles.approvalDecisionMeta} numberOfLines={2} testID={`worker-v5-account-management-meta-${index}`}>{row.meta}</Text>
          </View>
          <Text style={styles.chevronText}>›</Text>
        </Pressable>
      ))}
    </View>
  )
}

function WorkerV5PayoutBankAccountForm({
  accountNumber,
  accountOwnerName,
  language,
  onAccountNumberChange,
  onAccountOwnerNameChange,
  onPrecheck,
  precheckMessage,
  reduceTransparency,
  selectedBank,
}: {
  accountNumber: string
  accountOwnerName: string
  language: AppLanguage
  onAccountNumberChange: (value: string) => void
  onAccountOwnerNameChange: (value: string) => void
  onPrecheck: () => void
  precheckMessage: string | null
  reduceTransparency: boolean
  selectedBank: WorkerV5BankLogoName | null
}) {
  return (
    <View style={[styles.payoutAccountFormCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-bank-account-form">
      {!reduceTransparency ? <WorkerV5EarningsHomeListAura testID="worker-v5-bank-account-form-mint-aura" /> : null}
      <Text style={styles.boundaryTitle} numberOfLines={2}>{textByLanguage(language, 'Thông tin tài khoản nhận tiền', 'Receiving account details')}</Text>
      <Text style={styles.boundaryBody} numberOfLines={2} testID="worker-v5-bank-account-selected-bank">
        {selectedBank ? workerV5BankLabel(selectedBank) : textByLanguage(language, 'Chưa chọn ngân hàng', 'No bank selected')}
      </Text>
      <KaelTextField
        inputShellStyle={styles.payoutAccountInputShell}
        labelStyle={styles.payoutAccountFieldLabel}
        label={textByLanguage(language, 'Tên chủ tài khoản', 'Account owner')}
        onChangeText={onAccountOwnerNameChange}
        placeholder={textByLanguage(language, 'Nhập đúng tên trên tài khoản ngân hàng', 'Enter the bank account holder name')}
        shellStyle={styles.payoutAccountInputStack}
        testID="worker-v5-bank-account-owner-input"
        value={accountOwnerName}
      />
      <KaelTextField
        inputMode="numeric"
        inputShellStyle={styles.payoutAccountInputShell}
        keyboardType="number-pad"
        labelStyle={styles.payoutAccountFieldLabel}
        label={textByLanguage(language, 'Số tài khoản', 'Account number')}
        onChangeText={onAccountNumberChange}
        placeholder={textByLanguage(language, 'Chỉ nhập chữ số', 'Digits only')}
        shellStyle={styles.payoutAccountInputStack}
        testID="worker-v5-bank-account-number-input"
        value={accountNumber}
      />
      {precheckMessage ? (
        <Text style={styles.payoutAccountPrecheckStatus} numberOfLines={3} testID="worker-v5-bank-account-precheck-status">{precheckMessage}</Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={onPrecheck}
        style={({ pressed }) => [styles.payoutAccountPrecheckButton, pressed ? styles.pressed : null]}
        testID="worker-v5-bank-account-precheck-action"
      >
        <Text style={styles.payoutAccountPrecheckText}>{textByLanguage(language, 'Kiểm tra trước xác thực', 'Run pre-verification check')}</Text>
      </Pressable>
    </View>
  )
}

function WorkerV5PayoutLimitPolicyCard({
  language,
  reduceTransparency,
}: {
  language: AppLanguage
  reduceTransparency: boolean
}) {
  return (
    <View style={[styles.payoutLimitPolicyCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-payout-limit-policy">
      {!reduceTransparency ? <WorkerV5EarningsHomeListAura testID="worker-v5-payout-limit-policy-mint-aura" /> : null}
      <Text style={styles.boundaryTitle} numberOfLines={2}>{textByLanguage(language, 'Chính sách giới hạn rút tiền', 'Withdrawal limit policy')}</Text>
      <Text style={[styles.boundaryBody, styles.payoutLimitPolicyCopy]} numberOfLines={6} testID="worker-v5-payout-limit-policy-copy">
        {textByLanguage(
          language,
          'NestScout không đặt hạn mức rút tiền cố định cho thợ. Mỗi yêu cầu rút tiền được xử lý theo số dư thật, tài khoản nhận tiền đã xác minh, trạng thái bảo mật và quy định vận hành hiện hành. Khi cần bảo vệ tài khoản hoặc tuân thủ pháp luật, hệ thống có thể yêu cầu kiểm tra bổ sung trước khi giải ngân.',
          'NestScout does not set a fixed worker withdrawal cap. Each payout request is processed against the real balance, a verified receiving account, security status, and current operating rules. Additional checks may be required before disbursement to protect the account or meet compliance needs.',
        )}
      </Text>
    </View>
  )
}

function WorkerV5ProfileStatsStrip({
  insights,
  language,
  profile,
  reduceTransparency,
}: {
  insights: WorkerV5Runtime['workerPerformanceInsights']
  language: AppLanguage
  profile: WorkerV5Runtime['workerProfile']
  reduceTransparency: boolean
}) {
  const cells = [
    {
      label: textByLanguage(language, 'Đánh giá', 'Rating'),
      value: formatNullableRating(insights?.average_rating ?? profile?.rating, language),
    },
    {
      label: textByLanguage(language, 'Việc hoàn tất', 'Completed'),
      value: formatCountOrEmpty(insights?.completed_job_count ?? profile?.total_jobs, textByLanguage(language, 'Chưa có', 'None')),
    },
    {
      label: textByLanguage(language, 'Kinh nghiệm', 'Experience'),
      value: profile?.years_experience && profile.years_experience > 0 ? textByLanguage(language, `${profile.years_experience} nam`, `${profile.years_experience} years`) : textByLanguage(language, 'Chưa có', 'None'),
    },
  ]
  return (
    <View style={styles.settlementStrip} testID="worker-v5-profile-stats-strip">
      {cells.map((cell, index) => (
        <View key={cell.label} style={[styles.settlementCell, reduceTransparency && styles.opaqueCard]}>
          <Text style={styles.settlementValue} numberOfLines={2} testID={`worker-v5-profile-stat-value-${index}`}>{cell.value}</Text>
          <Text style={styles.settlementLabel} numberOfLines={2} testID={`worker-v5-profile-stat-label-${index}`}>{cell.label}</Text>
        </View>
      ))}
    </View>
  )
}

function WorkerV5ProfileDossierCard({
  insights,
  language,
  onOpenReliability,
  onOpenSettings,
  onOpenSkills,
  profile,
  reduceTransparency,
}: {
  insights: WorkerV5Runtime['workerPerformanceInsights']
  language: AppLanguage
  onOpenReliability: () => void
  onOpenSettings: () => void
  onOpenSkills: () => void
  profile: WorkerV5Runtime['workerProfile']
  reduceTransparency: boolean
}) {
  const trustScore = workerV5NumericInsight(insights?.performance_score)
  const services = profile?.service_types?.length
    ? profile.service_types.map((service) => localizedServiceLabel(service, language)).join(', ')
    : textByLanguage(language, 'Chưa có dịch vụ đã duyệt', 'No approved services')
  const reliabilityMeta = insights?.performance_score != null
    ? textByLanguage(language, `${trustScore}/100 · ${workerV5ReliabilityPercentValue(insights.on_time_rate_percent)} đúng hẹn`, `${trustScore}/100 · ${workerV5ReliabilityPercentValue(insights.on_time_rate_percent)} on-time`)
    : textByLanguage(language, 'Chưa có dữ liệu hiệu suất thật', 'No real performance data')
  const rows = [
    { icon: 'tools' as const, meta: services, status: textByLanguage(language, 'Vào', 'Open'), title: textByLanguage(language, 'Dịch vụ chuyên môn', 'Service dossier') },
    { icon: 'clock' as const, meta: reliabilityMeta, status: textByLanguage(language, 'Vào', 'Open'), title: textByLanguage(language, 'Độ tin cậy', 'Reliability') },
    { icon: 'shield' as const, meta: textByLanguage(language, 'Tài khoản, bảo mật và bộ nhớ Kael', 'Account, security, and Kael memory'), status: textByLanguage(language, 'Vào', 'Open'), title: textByLanguage(language, 'Cài đặt', 'Settings') },
  ]
  return (
    <View style={[styles.approvalDecisionList, reduceTransparency && styles.opaqueCard]} testID="worker-v5-profile-dossier">
      {!reduceTransparency ? (
        <>
          <WorkerV5CustomerCaseWideMintAura scope="ProfileDossierWide" testID="worker-v5-profile-dossier-wide-mint-aura" />
          <WorkerV5CustomerZipMintAura scope="ProfileDossierFine" testID="worker-v5-profile-dossier-mint-aura" />
        </>
      ) : null}
      {rows.map((row, index) => {
        const rowContent = (
          <>
            {!reduceTransparency ? (
              <WorkerV5CustomerZipMintAura
                scope={`ProfileDossierRow${index}`}
                style={styles.profileDossierRowAura}
                testID={`worker-v5-profile-dossier-row-${index}-mint-aura`}
              />
            ) : null}
            <View style={styles.approvalDecisionIconShell} testID="worker-v5-profile-dossier-icon-shell">
              {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
              <Image resizeMode="contain" source={workerV5Icons[row.icon]} style={styles.approvalDecisionIcon} testID="worker-v5-profile-dossier-icon" />
            </View>
            <View style={styles.approvalDecisionCopy}>
              <Text style={styles.approvalDecisionTitle} numberOfLines={2} testID={`worker-v5-profile-dossier-title-${index}`}>{row.title}</Text>
              <Text style={styles.approvalDecisionMeta} numberOfLines={2} testID={`worker-v5-profile-dossier-meta-${index}`}>{row.meta}</Text>
            </View>
            <Text style={styles.approvalDecisionStatus} numberOfLines={2} testID={`worker-v5-profile-dossier-status-${index}`}>{row.status}</Text>
          </>
        )
        if (index === 0 || index === 1 || index === 2) {
          const onPress = index === 0 ? onOpenSkills : index === 1 ? onOpenReliability : onOpenSettings
          const accessibilityLabel = index === 0
            ? textByLanguage(language, 'Mở kỹ năng và khu vực', 'Open skills and service area')
            : index === 1
              ? textByLanguage(language, 'Mở độ tin cậy', 'Open reliability insights')
              : textByLanguage(language, 'Mở cài đặt', 'Open settings')
          return (
            <Pressable
              accessibilityLabel={accessibilityLabel}
              accessibilityRole="button"
              key={row.title}
              onPress={onPress}
              style={({ pressed }) => [styles.approvalDecisionRow, pressed ? styles.pressed : null]}
              testID={`worker-v5-profile-dossier-row-${index}`}
            >
              {rowContent}
            </Pressable>
          )
        }
        return (
          <View key={row.title} style={styles.approvalDecisionRow} testID={`worker-v5-profile-dossier-row-${index}`}>
            {rowContent}
          </View>
        )
      })}
    </View>
  )
}

function WorkerV5ProfileInsightCard({
  insights,
  language,
  profile,
  reduceTransparency,
}: {
  insights: WorkerV5Runtime['workerPerformanceInsights']
  language: AppLanguage
  profile: WorkerV5Runtime['workerProfile']
  reduceTransparency: boolean
}) {
  const score = insights?.performance_score
  const body = score != null
    ? textByLanguage(language, 'Tín hiệu hiệu suất đến từ dữ liệu thật đã đồng bộ.', 'Performance insight comes from synced real data.')
    : textByLanguage(language, 'Chưa đủ dữ liệu để hiển thị cấp độ, nhóm dẫn đầu hoặc bảng xếp hạng.', 'Not enough data to show level, top rank, or leaderboard.')
  return (
    <WorkerV5KaelDraftCard
      body={`${body} ${workerAvailabilityLabel(profile, language)}`}
      language={language}
      reduceTransparency={reduceTransparency}
      title={score != null ? textByLanguage(language, 'Tín hiệu hiệu suất', 'Performance signal') : textByLanguage(language, 'Chưa có xếp hạng thật', 'No real ranking yet')}
    />
  )
}

function workerV5HasNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function workerV5NumericInsight(value: number | null | undefined) {
  return workerV5HasNumber(value) ? Math.max(0, Math.round(value)) : 0
}

function workerV5RankingAxisIcon(axisId: string): WorkerV5IconName {
  switch (axisId) {
    case 'arrival':
    case 'response':
      return 'clock'
    case 'completion':
      return 'evidence'
    case 'earnings':
      return 'wallet'
    case 'rating':
    default:
      return 'shield'
  }
}

type WorkerV5ReliabilityAxis = {
  hasData: boolean
  id: string
  score: number
}

const WORKER_V5_RELIABILITY_EMPTY_AXES = ['arrival', 'completion', 'rating'] as const

function workerV5ReliabilityAxisScore(insights: WorkerV5Runtime['workerPerformanceInsights'], axisId: string) {
  const score = insights?.performance_axes.find((axis) => axis.id === axisId)?.score
  return workerV5HasNumber(score) ? Math.max(0, Math.min(100, Math.round(score))) : null
}

function workerV5ReliabilityAxes(insights: WorkerV5Runtime['workerPerformanceInsights']): WorkerV5ReliabilityAxis[] {
  return WORKER_V5_RELIABILITY_EMPTY_AXES.map((id) => {
    const score = workerV5ReliabilityAxisScore(insights, id)
    return { hasData: score != null, id, score: score ?? 0 }
  })
}

function workerV5ReliabilityPercentValue(value: number | null | undefined) {
  return workerV5HasNumber(value) ? `${Math.max(0, Math.round(value))}%` : '0%'
}

function workerV5ReliabilityRatingValue(value: number | null | undefined, language?: AppLanguage) {
  if (!workerV5HasNumber(value) || value <= 0) return '0'
  const normalized = `${Math.round(value * 10) / 10}`
  return language === 'vi' ? normalized.replace('.', ',') : normalized
}

function workerV5ReliabilityAxisTitle(id: string, language: AppLanguage) {
  const labels: Record<AppLanguage, Record<string, string>> = {
    en: {
      arrival: 'On time & ETA updates',
      completion: 'Evidence & process',
      earnings: 'Reconciled earnings',
      rating: 'Quality & communication',
      response: 'Response & ETA discipline',
    },
    vi: {
      arrival: 'Đúng hẹn & cập nhật thời gian đến',
      completion: 'Bằng chứng & quy trình',
      earnings: 'Thu nhập đã đối soát',
      rating: 'Chất lượng & giao tiếp',
      response: 'Phản hồi & cập nhật thời gian đến',
    },
  }
  return labels[language][id] ?? workerPerformanceAxisLabel(id, language)
}

function workerV5ReliabilityAxisMeta(axis: WorkerV5ReliabilityAxis, language: AppLanguage) {
  return axis.hasData
    ? textByLanguage(language, `${axis.score}/100 · dữ liệu thật`, `${axis.score}/100 · real data`)
    : textByLanguage(language, '0/100 · chưa có dữ liệu thật', '0/100 · no real data yet')
}

function WorkerV5RankingHero({
  insights,
  language,
  profile,
  reduceTransparency,
}: {
  insights: WorkerV5Runtime['workerPerformanceInsights']
  language: AppLanguage
  profile: WorkerV5Runtime['workerProfile']
  reduceTransparency: boolean
}) {
  const score = workerV5NumericInsight(insights?.performance_score)
  const hasScore = workerV5HasNumber(insights?.performance_score)
  const completed = workerV5NumericInsight(insights?.completed_job_count ?? profile?.total_jobs)
  const progressWidth = `${Math.max(0, Math.min(100, score))}%` as ViewStyle['width']
  return (
    <View style={[styles.earningsHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-ranking-hero">
      {!reduceTransparency ? <WorkerV5EarningsHomeHeroAura testID="worker-v5-ranking-mint-aura" /> : null}
      <View style={styles.rankingHeroRow}>
        <View style={styles.rankingScoreOrb} testID="worker-v5-ranking-score-orb">
          {!reduceTransparency ? <MintAura intensity="component" style={styles.rankingScoreOrbAura} /> : null}
          <Text style={styles.rankingScoreOrbValue} numberOfLines={1} testID="worker-v5-ranking-score">{score}</Text>
          <Text style={styles.rankingScoreOrbLabel} numberOfLines={2} testID="worker-v5-ranking-score-label">{textByLanguage(language, 'điểm hạng', 'rank points')}</Text>
        </View>
        <View style={styles.earningsHeroCopy}>
          <Text style={styles.earningsHeroPill} numberOfLines={2} testID="worker-v5-ranking-status">
            {hasScore ? textByLanguage(language, 'Dữ liệu thật', 'Real data') : textByLanguage(language, 'Chưa đủ dữ liệu', 'Not enough data')}
          </Text>
          <Text style={styles.rankingHeroTitle} numberOfLines={2} testID="worker-v5-ranking-title">
            {hasScore
              ? textByLanguage(language, `${score}/100 điểm xếp hạng`, `${score}/100 ranking points`)
              : textByLanguage(language, '0 điểm xếp hạng', '0 ranking points')}
          </Text>
          <Text style={styles.earningsHeroMeta} numberOfLines={2} testID="worker-v5-ranking-name">
            {profile?.legal_name || textByLanguage(language, 'Hồ sơ thợ', 'Worker profile')} · {completed} {textByLanguage(language, 'việc hoàn tất', 'completed jobs')}
          </Text>
          <View style={styles.rankingProgressTrack} testID="worker-v5-ranking-progress">
            <View style={[styles.rankingProgressFill, { width: progressWidth }]} />
          </View>
        </View>
      </View>
    </View>
  )
}

function WorkerV5RankingStatsStrip({
  insights,
  language,
  profile,
  reduceTransparency,
}: {
  insights: WorkerV5Runtime['workerPerformanceInsights']
  language: AppLanguage
  profile: WorkerV5Runtime['workerProfile']
  reduceTransparency: boolean
}) {
  const stats = [
    {
      label: textByLanguage(language, 'việc hoàn tất', 'completed'),
      value: workerV5NumericInsight(insights?.completed_job_count ?? profile?.total_jobs),
    },
    {
      label: textByLanguage(language, 'đánh giá', 'reviews'),
      value: workerV5NumericInsight(insights?.review_count),
    },
    {
      label: textByLanguage(language, 'đúng quy trình', 'on time'),
      value: `${workerV5NumericInsight(insights?.on_time_rate_percent)}%`,
    },
  ]
  return (
    <View style={styles.settlementStrip} testID="worker-v5-ranking-stat-strip">
      {stats.map((item, index) => (
        <View key={item.label} style={[styles.settlementCell, reduceTransparency && styles.opaqueCard]} testID={`worker-v5-ranking-stat-${index}`}>
          {!reduceTransparency ? <WorkerV5EarningsHomeListAura testID={`worker-v5-ranking-stat-aura-${index}`} /> : null}
          <Text style={styles.settlementValue} numberOfLines={1} testID={`worker-v5-ranking-stat-value-${index}`}>{item.value}</Text>
          <Text style={styles.settlementLabel} numberOfLines={2} testID={`worker-v5-ranking-stat-label-${index}`}>{item.label}</Text>
        </View>
      ))}
    </View>
  )
}

function WorkerV5RankingLeaderboard({
  insights,
  language,
  profile,
  reduceTransparency,
}: {
  insights: WorkerV5Runtime['workerPerformanceInsights']
  language: AppLanguage
  profile: WorkerV5Runtime['workerProfile']
  reduceTransparency: boolean
}) {
  const score = workerV5NumericInsight(insights?.performance_score)
  const completed = workerV5NumericInsight(insights?.completed_job_count ?? profile?.total_jobs)
  const name = profile?.legal_name?.trim() || textByLanguage(language, 'Hồ sơ thợ', 'Worker profile')
  return (
    <View style={[styles.approvalDecisionList, reduceTransparency && styles.opaqueCard]} testID="worker-v5-ranking-leaderboard">
      {!reduceTransparency ? <WorkerV5EarningsHomeListAura testID="worker-v5-ranking-leaderboard-mint-aura" /> : null}
      <View style={styles.approvalDecisionRow}>
        <View style={styles.approvalDecisionIconShell}>
          {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
          <Image resizeMode="contain" source={workerV5Icons.profile} style={styles.approvalDecisionIcon} />
        </View>
        <View style={styles.approvalDecisionCopy}>
          <Text style={styles.approvalDecisionTitle} numberOfLines={2} testID="worker-v5-ranking-leaderboard-title">{name}</Text>
          <Text style={styles.approvalDecisionMeta} numberOfLines={2} testID="worker-v5-ranking-leaderboard-meta">
            {textByLanguage(language, `Hồ sơ hiện tại · ${completed} việc hoàn tất · nguồn Supabase`, `Current profile · ${completed} completed jobs · Supabase source`)}
          </Text>
        </View>
        <Text style={styles.approvalDecisionStatus} numberOfLines={2} testID="worker-v5-ranking-leaderboard-status">{score}</Text>
      </View>
    </View>
  )
}

function WorkerV5RankingImprovementList({
  insights,
  language,
  reduceTransparency,
}: {
  insights: WorkerV5Runtime['workerPerformanceInsights']
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const fallbackAxes = ['arrival', 'completion', 'rating'] as const
  const axes = insights?.performance_axes
    ?.filter((axis) => typeof axis.score === 'number' && Number.isFinite(axis.score))
    .map((axis) => ({ id: axis.id, score: axis.score ?? 0 }))
    .sort((left, right) => left.score - right.score)
    .slice(0, 3) ?? []
  const rows = (axes.length ? axes : fallbackAxes.map((id) => ({ id, score: 0 }))).slice(0, 3)
  return (
    <View style={[styles.approvalDecisionList, reduceTransparency && styles.opaqueCard]} testID="worker-v5-ranking-improvement-list">
      {!reduceTransparency ? <WorkerV5EarningsHomeListAura testID="worker-v5-ranking-improvement-mint-aura" /> : null}
      {rows.map((axis, index) => {
        const score = workerV5NumericInsight(axis.score)
        const gain = Math.max(0, 100 - score)
        return (
          <View key={axis.id} style={[styles.approvalDecisionRow, index > 0 && styles.offerDetailListDivider]}>
            <View style={styles.approvalDecisionIconShell}>
              {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
              <Image resizeMode="contain" source={workerV5Icons[workerV5RankingAxisIcon(axis.id)]} style={styles.approvalDecisionIcon} />
            </View>
            <View style={styles.approvalDecisionCopy}>
              <Text style={styles.approvalDecisionTitle} numberOfLines={2} testID={`worker-v5-ranking-improvement-title-${index}`}>
                {workerPerformanceAxisLabel(axis.id, language)}
              </Text>
              <Text style={styles.approvalDecisionMeta} numberOfLines={2} testID={`worker-v5-ranking-improvement-meta-${index}`}>
                {score > 0
                  ? textByLanguage(language, `${score}/100 từ dữ liệu hiệu suất thật`, `${score}/100 from real performance data`)
                  : textByLanguage(language, '0/100 khi chưa có dữ liệu thật', '0/100 until real data syncs')}
              </Text>
              <View style={styles.rankingProgressTrack}>
                <View style={[styles.rankingProgressFill, { width: `${Math.max(0, Math.min(100, score))}%` as ViewStyle['width'] }]} />
              </View>
            </View>
            <Text style={styles.approvalDecisionStatus} numberOfLines={1} testID={`worker-v5-ranking-improvement-status-${index}`}>
              +{gain}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

function WorkerV5SkillsServiceHero({
  language,
  profile,
  reduceTransparency,
}: {
  language: AppLanguage
  profile: WorkerV5Runtime['workerProfile']
  reduceTransparency: boolean
}) {
  const serviceCount = profile?.service_types?.length ?? 0
  return (
    <View style={[styles.earningsHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-skills-service-hero">
      {!reduceTransparency ? <WorkerV5EarningsHomeHeroAura testID="worker-v5-skills-service-mint-aura" /> : null}
      <View style={styles.earningsHeroCopy}>
        <Text style={[styles.earningsHeroAmount, styles.skillsServiceHeroAmount]} numberOfLines={2} testID="worker-v5-skills-service-count">
          {textByLanguage(language, `${serviceCount} kỹ năng đang hoạt động`, `${serviceCount} active skills`)}
        </Text>
        <Text style={styles.earningsHeroMeta} numberOfLines={2}>{textByLanguage(language, 'Chỉ hiển thị dữ liệu sử dụng trực tiếp trong workflow.', 'Only data used directly by the workflow is shown.')}</Text>
      </View>
      <View style={styles.earningsHeroIconShell}>
        {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
        <Image resizeMode="contain" source={workerV5Icons.tools} style={styles.earningsHeroIcon} />
      </View>
    </View>
  )
}

function WorkerV5ServiceCardGrid({
  language,
  profile,
  reduceTransparency,
}: {
  language: AppLanguage
  profile: WorkerV5Runtime['workerProfile']
  reduceTransparency: boolean
}) {
  const registeredServices = profile?.service_types ?? []
  if (!registeredServices.length) {
    return (
      <View style={styles.serviceCardGrid} testID="worker-v5-quick-action-grid">
        <View style={[styles.serviceSourceCard, styles.serviceSourceCardFull, reduceTransparency && styles.opaqueCard]} testID="worker-v5-quick-action-empty">
          {!reduceTransparency ? <WorkerV5EarningsHomeListAura testID="worker-v5-service-card-mint-aura-empty" /> : null}
          <View style={styles.serviceSourceIconTile}>
            {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
            <Image resizeMode="contain" source={workerV5Icons.tools} style={styles.serviceSourceIcon} />
          </View>
          <View style={styles.serviceSourceCopy}>
            <Text style={styles.serviceSourceTitle} numberOfLines={2} testID="worker-v5-quick-action-empty-title">
              {textByLanguage(language, 'Chưa có kỹ năng đã ghi', 'No saved skills')}
            </Text>
            <Text style={styles.serviceSourceMeta} numberOfLines={2} testID="worker-v5-quick-action-empty-meta">
              {textByLanguage(language, 'Kỹ năng sẽ hiện khi hồ sơ thợ đồng bộ', 'Skills appear when the worker profile syncs')}
            </Text>
          </View>
        </View>
      </View>
    )
  }
  return (
    <View style={styles.serviceCardGrid} testID="worker-v5-quick-action-grid">
      {registeredServices.map((service, index) => {
        return (
          <View
            key={service}
            style={[
              styles.serviceSourceCard,
              registeredServices.length === 1 ? styles.serviceSourceCardFull : null,
              registeredServices.length === 2 ? styles.serviceSourceCardHalf : null,
              styles.serviceSourceCardSelected,
              reduceTransparency && styles.opaqueCard,
            ]}
            testID={`worker-v5-quick-action-${index}`}
          >
            {!reduceTransparency ? <WorkerV5EarningsHomeListAura testID={`worker-v5-service-card-mint-aura-${index}`} /> : null}
            <View style={styles.serviceSourceIconTile}>
              {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
              <Image resizeMode="contain" source={workerV5ServiceIcons[service]} style={styles.serviceSourceIcon} />
            </View>
            <View style={styles.serviceSourceCopy}>
              <Text style={styles.serviceSourceTitle} numberOfLines={2} testID={`worker-v5-quick-action-title-${index}`}>
                {localizedServiceLabel(service, language)}
              </Text>
              <Text style={styles.serviceSourceMeta} numberOfLines={2} testID={`worker-v5-quick-action-meta-${index}`}>
                {workerVerificationLabel(profile?.verification_status, language)}
              </Text>
            </View>
          </View>
        )
      })}
    </View>
  )
}

function WorkerV5ServiceAreaMapCard({
  language,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const profile = runtime.workerProfile
  const [expanded, setExpanded] = useState(false)
  const savedDistricts = normalizeWorkerV5DistrictSelectionList(profile?.districts ?? [])
  const [selectedDistricts, setSelectedDistricts] = useState(() => savedDistricts)
  const [areaDraft, setAreaDraft] = useState(() => workerV5DistrictDraftFromSelection(savedDistricts, language))
  const [savingAreas, setSavingAreas] = useState(false)
  const [serviceAreaMessage, setServiceAreaMessage] = useState('')
  const savedDistrictKey = savedDistricts.join('|')
  const selectedDistrictDraft = workerV5DistrictDraftFromSelection(selectedDistricts, language)
  const draftParse = parseWorkerV5ServiceAreaDraft(areaDraft, language)
  const draftHasChanges = normalizeServiceAreaDraftText(areaDraft) !== normalizeServiceAreaDraftText(selectedDistrictDraft)

  useEffect(() => {
    setSelectedDistricts(savedDistricts)
    setAreaDraft(workerV5DistrictDraftFromSelection(savedDistricts, language))
    setServiceAreaMessage('')
  }, [language, savedDistrictKey])

  const saveServiceAreas = async () => {
    if (savingAreas) return
    const parsed = parseWorkerV5ServiceAreaDraft(areaDraft, language)
    const nextDistricts = parsed.districts
    if (!nextDistricts.length) {
      setServiceAreaMessage(textByLanguage(language, 'Nhập ít nhất một khu vực phục vụ.', 'Enter at least one service area.'))
      return
    }
    if (parsed.invalid.length) {
      setServiceAreaMessage(textByLanguage(language, 'Kiểm tra lại tên khu vực trước khi lưu.', 'Check service area names before saving.'))
      return
    }
    const previousDistricts = selectedDistricts
    setSelectedDistricts(nextDistricts)
    setSavingAreas(true)
    setServiceAreaMessage('')
    const saved = await runtime.actions.workerUpdateServiceArea({
      districts: nextDistricts,
    })
    setSavingAreas(false)
    if (!saved) {
      setSelectedDistricts(previousDistricts)
      setServiceAreaMessage(textByLanguage(language, 'Chưa đồng bộ được với NestScout. Khu vực vừa nhập vẫn đang chờ lưu.', 'Could not sync with NestScout. Your entered areas are still pending.'))
      return
    }
    setAreaDraft(workerV5DistrictDraftFromSelection(nextDistricts, language))
    setServiceAreaMessage(textByLanguage(language, 'Đã lưu khu vực phục vụ.', 'Service area saved.'))
  }
  const profileLocation = typeof profile?.home_lat === 'number' &&
    Number.isFinite(profile.home_lat) &&
    typeof profile.home_lng === 'number' &&
    Number.isFinite(profile.home_lng)
    ? { lat: profile.home_lat, lng: profile.home_lng, provider: 'vietmap' as const }
    : null
  const radius = typeof profile?.service_radius_km === 'number' && Number.isFinite(profile.service_radius_km)
    ? `${profile.service_radius_km} km`
    : null
  const selectedDistrictLabels = selectedDistricts.map((district) => formatWorkerDistrict(district, language))
  const visibleAreaLabels = draftHasChanges && draftParse.labels.length ? draftParse.labels : selectedDistrictLabels
  const expandedSummary = visibleAreaLabels.length
    ? radius
      ? textByLanguage(language, `${visibleAreaLabels.length} khu vực ưu tiên · ${radius}`, `${visibleAreaLabels.length} priority areas · ${radius}`)
      : textByLanguage(language, `${visibleAreaLabels.length} khu vực ưu tiên`, `${visibleAreaLabels.length} priority areas`)
    : textByLanguage(language, 'Chưa có khu vực ưu tiên', 'No priority area yet')
  const collapsedSummary = visibleAreaLabels.length || profileLocation
    ? textByLanguage(language, 'Nhấn để xem khu vực ưu tiên', 'Open priority areas')
    : expandedSummary
  const mapLabel = visibleAreaLabels[0] ?? textByLanguage(language, 'Khu vực phục vụ ưu tiên', 'Priority service area')
  return (
    <View style={styles.sectionStack} testID="worker-v5-service-area-map-card">
      <Pressable
        accessibilityLabel={`${textByLanguage(language, 'Khu vực phục vụ', 'Service area')}. ${collapsedSummary}`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [
          styles.kaelBriefCard,
          styles.serviceAreaOpenCard,
          reduceTransparency && styles.opaqueCard,
          pressed && styles.pressed,
        ]}
        testID="worker-v5-service-area-open-card"
      >
        {!reduceTransparency ? (
          <>
            <WorkerV5CustomerCaseWideMintAura scope="ServiceAreaOpenWide" style={styles.kaelBriefAura} />
            <WorkerV5CustomerZipMintAura scope="ServiceAreaOpenFine" style={styles.kaelBriefZipAura} />
          </>
        ) : null}
        <View style={styles.kaelBriefIconTile}>
          {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
          <Image source={workerV5Icons.map} style={styles.kaelBriefIcon} />
        </View>
        <View style={styles.kaelBriefText}>
          <Text style={styles.kaelBriefTitle} numberOfLines={2}>{textByLanguage(language, 'Khu vực phục vụ', 'Service area')}</Text>
          <Text style={styles.kaelBriefBody} numberOfLines={2} testID="worker-v5-service-area-open-summary">{collapsedSummary}</Text>
        </View>
        <Text style={[styles.kaelBriefChevron, expanded && styles.serviceAreaChevronOpen]}>›</Text>
      </Pressable>
      {expanded ? (
        <View style={styles.serviceAreaExpandedStack} testID="worker-v5-service-area-expanded">
          {profileLocation ? (
            <View style={[styles.serviceAreaMapShell, reduceTransparency && styles.opaqueCard]}>
              {!reduceTransparency ? <WorkerV5EarningsHomeListAura testID="worker-v5-service-area-map-mint-aura" /> : null}
              <WorkerV5MapStage
                activeLocation={profileLocation}
                deal={null}
                language={language}
                profile={profile}
                reduceTransparency={reduceTransparency}
                selectedLabel={mapLabel}
                testID="worker-v5-service-area-map"
              />
            </View>
          ) : null}
          <View style={[styles.serviceAreaPlacePanel, reduceTransparency && styles.opaqueCard]} testID="worker-v5-service-area-place-list">
            {!reduceTransparency ? <WorkerV5EarningsHomeListAura testID="worker-v5-service-area-place-mint-aura" /> : null}
            <Text style={styles.serviceAreaPlaceTitle} numberOfLines={2}>
              {profileLocation
                ? textByLanguage(language, 'Địa điểm ưu tiên đã đồng bộ', 'Synced priority place')
                : textByLanguage(language, 'Tên khu vực ưu tiên', 'Priority area names')}
            </Text>
            {visibleAreaLabels.length ? (
              <Text style={styles.serviceAreaPlaceMeta} numberOfLines={2} testID="worker-v5-service-area-expanded-summary">{expandedSummary}</Text>
            ) : (
              <Text style={styles.serviceAreaPlaceMeta} numberOfLines={2} testID="worker-v5-service-area-empty">
                {textByLanguage(language, 'Chọn khu vực thợ sẽ nhận việc.', 'Choose areas where the worker accepts jobs.')}
              </Text>
            )}
            <View style={styles.serviceAreaInlineEditor} testID="worker-v5-service-area-inline-editor">
              <KaelTextField
                autoCapitalize="words"
                autoCorrect={false}
                inputShellStyle={styles.serviceAreaDraftShell}
                inputShellTestID="worker-v5-service-area-draft-shell"
                label={textByLanguage(language, 'Nhập khu vực ưu tiên', 'Enter priority areas')}
                labelStyle={styles.serviceAreaDraftLabel}
                onChangeText={setAreaDraft}
                placeholder={textByLanguage(language, 'Ví dụ: Bình Thạnh, Quận 1, Thủ Đức', 'Example: Binh Thanh, District 1, Thu Duc')}
                spellCheck={false}
                style={styles.serviceAreaDraftInput}
                testID="worker-v5-service-area-draft-input"
                value={areaDraft}
              />
              <KaelButton
                accessibilityState={{ busy: savingAreas, disabled: savingAreas }}
                label={savingAreas ? textByLanguage(language, 'Đang lưu', 'Saving') : textByLanguage(language, 'Lưu khu vực', 'Save areas')}
                loading={savingAreas}
                onPress={() => { void saveServiceAreas() }}
                showPrimaryGradient={false}
                style={styles.serviceAreaSaveInlineButton}
                testID="worker-v5-service-area-save-inline"
                variant="secondary"
              />
            </View>
            {visibleAreaLabels.map((label, index) => (
              <View
                key={`${label}-${index}`}
                style={[
                  styles.serviceAreaPlaceRow,
                  styles.serviceAreaPlaceRowSelected,
                  draftHasChanges && styles.serviceAreaPlaceRowPending,
                ]}
                testID={`worker-v5-service-area-saved-row-${index}`}
              >
                <View style={styles.serviceAreaPlacePin}>
                  <Text style={styles.serviceAreaPlacePinText}>{index + 1}</Text>
                </View>
                <Text style={styles.serviceAreaPlaceName} numberOfLines={2} testID={`worker-v5-service-area-place-name-${index}`}>{label}</Text>
              </View>
            ))}
            {radius ? (
              <Text style={styles.serviceAreaPlaceMeta} numberOfLines={2} testID="worker-v5-service-area-radius">
                {textByLanguage(language, `Bán kính phục vụ ${radius}`, `Service radius ${radius}`)}
              </Text>
            ) : null}
            {serviceAreaMessage ? (
              <Text
                style={styles.workerSettingsMessage}
                testID="worker-v5-service-area-message"
              >
                {serviceAreaMessage}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  )
}

function WorkerV5ReliabilityHero({
  insights,
  language,
  profile,
  reduceTransparency,
}: {
  insights: WorkerV5Runtime['workerPerformanceInsights']
  language: AppLanguage
  profile: WorkerV5Runtime['workerProfile']
  reduceTransparency: boolean
}) {
  const hasScore = workerV5HasNumber(insights?.performance_score)
  const score = workerV5NumericInsight(insights?.performance_score)
  return (
    <View style={[styles.earningsHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-reliability-hero">
      {!reduceTransparency ? <WorkerV5EarningsHomeHeroAura testID="worker-v5-reliability-mint-aura" /> : null}
      <View style={styles.completionLens}>
        <Text style={styles.completionLensValue} numberOfLines={1} testID="worker-v5-reliability-score">{score}</Text>
        <Text style={styles.completionLensLabel} numberOfLines={2}>{textByLanguage(language, 'điểm tin cậy', 'trust score')}</Text>
      </View>
      <View style={styles.earningsHeroCopy}>
        <Text style={styles.earningsHeroPill} numberOfLines={2} testID="worker-v5-reliability-status">{hasScore ? textByLanguage(language, 'Có thể giải thích', 'Explainable') : textByLanguage(language, 'Chưa đủ dữ liệu', 'Not enough data')}</Text>
        <Text style={styles.earningsHeroAmount} numberOfLines={2} testID="worker-v5-reliability-title">{hasScore ? textByLanguage(language, 'Đáng tin cậy và ổn định', 'Reliable and stable') : textByLanguage(language, 'Chờ dữ liệu thật', 'Waiting for real data')}</Text>
        <Text style={styles.earningsHeroMeta} numberOfLines={2}>{hasScore ? textByLanguage(language, 'Tính từ dữ liệu hiệu suất đã đồng bộ.', 'Calculated from synced performance data.') : textByLanguage(language, 'Số sẽ cập nhật khi có hiệu suất thật.', 'The score updates when real performance exists.')}</Text>
      </View>
    </View>
  )
}

function WorkerV5ReliabilityComponentList({
  axes,
  language,
  reduceMotion,
  reduceTransparency,
}: {
  axes: WorkerV5ReliabilityAxis[]
  language: AppLanguage
  reduceMotion: boolean
  reduceTransparency: boolean
}) {
  return (
    <View style={[styles.reliabilityAxisList, reduceTransparency && styles.opaqueCard]} testID="worker-v5-reliability-components">
      {!reduceTransparency ? <WorkerV5EarningsHomeListAura testID="worker-v5-reliability-components-mint-aura" /> : null}
      {axes.map((axis, index) => (
        <View key={axis.id} style={styles.reliabilityAxisRow}>
          <View style={styles.reliabilityAxisIconShell}>
            {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
            <Image resizeMode="contain" source={workerV5Icons[workerV5RankingAxisIcon(axis.id)]} style={styles.reliabilityAxisIcon} />
          </View>
          <View style={styles.reliabilityAxisCopy}>
            <Text style={styles.reliabilityAxisTitle} numberOfLines={2} testID={`worker-v5-reliability-axis-title-${index}`}>{workerV5ReliabilityAxisTitle(axis.id, language)}</Text>
            <Text style={styles.reliabilityAxisMeta} numberOfLines={1} testID={`worker-v5-reliability-axis-meta-${index}`}>{workerV5ReliabilityAxisMeta(axis, language)}</Text>
            <View style={styles.reliabilityAxisTrack}>
              <WorkerV5ReliabilityAxisFill
                hasData={axis.hasData}
                index={index}
                reduceMotion={reduceMotion}
                score={axis.score}
              />
            </View>
          </View>
          <Text style={styles.reliabilityAxisScore} numberOfLines={1} testID={`worker-v5-reliability-axis-score-${index}`}>{axis.score}/100</Text>
        </View>
      ))}
    </View>
  )
}

function WorkerV5ReliabilityAxisFill({
  hasData,
  index,
  reduceMotion,
  score,
}: {
  hasData: boolean
  index: number
  reduceMotion: boolean
  score: number
}) {
  const target = hasData ? Math.max(0, Math.min(100, score)) : 0
  const progress = useSharedValue(reduceMotion ? target : 0)
  const animatedFillStyle = useAnimatedStyle(() => ({
    width: `${progress.value}%` as ViewStyle['width'],
  }))

  useEffect(() => {
    if (!hasData || reduceMotion) {
      progress.value = target
      return
    }
    progress.value = 0
    progress.value = withDelay(70 + index * 45, withSpring(target, motionTokens.liquid.entrance))
  }, [hasData, index, progress, reduceMotion, target])

  return (
    <Animated.View
      style={[styles.reliabilityAxisFill, animatedFillStyle]}
      testID={`worker-v5-reliability-axis-fill-${index}`}
    />
  )
}

function WorkerV5AccountUtilityHero({
  language,
  profile,
  reduceTransparency,
}: {
  language: AppLanguage
  profile: WorkerV5Runtime['workerProfile']
  reduceTransparency: boolean
}) {
  const title = profile?.legal_name || textByLanguage(language, 'Hồ sơ thợ', 'Worker profile')
  const bankStatus = profile?.bank_account_masked
    ? textByLanguage(language, 'tài khoản nhận tiền đã ghi', 'payout account recorded')
    : textByLanguage(language, 'chưa có tài khoản nhận tiền', 'no payout account')
  return (
    <View style={[styles.accountUtilityHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-account-utility-hero">
      {!reduceTransparency ? <WorkerV5EarningsHomeHeroAura testID="worker-v5-account-utility-mint-aura" /> : null}
      <View style={styles.accountUtilityHeroIconShell}>
        {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
        <Image resizeMode="contain" source={workerV5Icons.profile} style={styles.accountUtilityHeroIcon} />
      </View>
      <View style={styles.accountUtilityHeroCopy}>
        <Text style={styles.accountUtilityHeroTitle} numberOfLines={2} testID="worker-v5-account-utility-name">{title}</Text>
        <Text style={styles.accountUtilityHeroMeta} numberOfLines={2}>{`${workerDocumentSummary(profile, language)} · ${bankStatus}`}</Text>
      </View>
    </View>
  )
}

function WorkerV5AccountSecurityList({
  language,
  profile,
  reduceTransparency,
}: {
  language: AppLanguage
  profile: WorkerV5Runtime['workerProfile']
  reduceTransparency: boolean
}) {
  return (
    <View testID="worker-v5-account-security-list">
      <InfoListCard aura="accountSecurity" reduceTransparency={reduceTransparency}>
        <WorkerV5InfoRow
          icon="shield"
          label={textByLanguage(language, 'Sinh trắc học', 'Biometrics')}
          reduceTransparency={reduceTransparency}
          value={textByLanguage(language, 'Xác nhận nhận việc, đổi ngân hàng và rút tiền', 'Confirm work, bank changes, and payout')}
        />
        <WorkerV5InfoRow
          icon="calendar"
          label={textByLanguage(language, 'Thông báo cơ hội', 'Opportunity alerts')}
          reduceTransparency={reduceTransparency}
          value={workerAvailabilityLabel(profile, language)}
        />
        <WorkerV5InfoRow
          icon="scope"
          label={textByLanguage(language, 'Chia sẻ ngoài công việc', 'Outside-work sharing')}
          reduceTransparency={reduceTransparency}
          value={textByLanguage(language, 'Luôn tắt; chỉ dùng dữ liệu theo công việc', 'Always off; only job-scoped data')}
        />
      </InfoListCard>
    </View>
  )
}

function WorkerV5MemoryHero({
  language,
  reduceTransparency,
}: {
  language: AppLanguage
  reduceTransparency: boolean
}) {
  return (
    <View style={[styles.earningsHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-memory-hero">
      {!reduceTransparency ? <WorkerV5EarningsHomeHeroAura testID="worker-v5-memory-mint-aura" /> : null}
      <View style={styles.earningsHeroIconShell}>
        {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
        <Image resizeMode="contain" source={workerV5Icons.shield} style={styles.earningsHeroIcon} />
      </View>
      <View style={styles.earningsHeroCopy}>
        <Text style={styles.earningsHeroAmount} numberOfLines={2} testID="worker-v5-memory-title">{textByLanguage(language, 'Kael nhớ theo quyền bạn cho.', 'Kael remembers only what you allow.')}</Text>
        <Text style={styles.earningsHeroMeta} numberOfLines={2}>{textByLanguage(language, 'Không tự nhận việc hoặc chia sẻ ngoài công việc.', 'No accepting work on its own or sharing outside work.')}</Text>
      </View>
    </View>
  )
}

function WorkerV5MemorySwitchList({
  auraTestID,
  items,
  onChange,
  reduceTransparency,
  savingIds,
  testID,
}: {
  auraTestID: string
  items: ReadonlyArray<{ enabled: boolean; icon: WorkerV5IconName; id: WorkerV5MemoryPreferenceUiId; label: string; value: string }>
  onChange: (id: WorkerV5MemoryPreferenceUiId, enabled: boolean) => void
  reduceTransparency: boolean
  savingIds: Partial<Record<WorkerV5MemoryPreferenceUiId, boolean>>
  testID: string
}) {
  return (
    <View style={[styles.memorySwitchList, reduceTransparency && styles.opaqueCard]} testID={testID}>
      {!reduceTransparency ? <WorkerV5EarningsHomeListAura testID={auraTestID} /> : null}
      {items.map((item, index) => {
        const saving = Boolean(savingIds[item.id])
        return (
        <Pressable
          key={item.id}
          accessibilityLabel={`${item.label}. ${item.value}`}
          accessibilityRole="switch"
          accessibilityState={{ checked: item.enabled, busy: saving }}
          onPress={() => onChange(item.id, !item.enabled)}
          style={({ pressed }) => [
            styles.memorySwitchRow,
            index === items.length - 1 ? styles.memorySwitchRowLast : null,
            pressed ? styles.pressed : null,
          ]}
          testID={`${testID}-row-${index}`}
        >
          <View style={styles.memorySwitchIconShell} testID={`${testID}-icon-shell-${index}`}>
            {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
            <Image
              resizeMode="contain"
              source={workerV5Icons[item.icon]}
              style={[
                styles.memorySwitchIcon,
                WORKER_V5_PROFILE_ICON_VISUAL_BOOST.has(item.icon) ? styles.profileRouteIconVisualBoost : null,
              ]}
              testID={`${testID}-icon-${index}`}
            />
          </View>
          <View style={styles.memorySwitchCopy}>
            <Text style={styles.memorySwitchTitle} numberOfLines={2} testID={`${testID}-title-${index}`}>{item.label}</Text>
            <Text style={styles.memorySwitchValue} numberOfLines={2} testID={`${testID}-value-${index}`}>{item.value}</Text>
          </View>
          <View
            style={[styles.toggleTrack, item.enabled ? styles.toggleTrackOn : null]}
            testID={`${testID}-track-${index}`}
          >
            <View style={[styles.toggleKnob, item.enabled ? styles.toggleKnobOn : null]} />
          </View>
        </Pressable>
        )
      })}
    </View>
  )
}

type WorkerV5VerificationCheck = {
  done: boolean
  icon: WorkerV5IconName
  meta: string
  title: string
}

function workerV5VerificationChecks(profile: WorkerV5Runtime['workerProfile'], language: AppLanguage): WorkerV5VerificationCheck[] {
  const services = profile?.service_types?.length
    ? profile.service_types.map((service) => localizedServiceLabel(service, language)).join(', ')
    : textByLanguage(language, 'Chưa có dịch vụ đã ghi', 'No saved services')
  const hasLegalIdentity = Boolean(profile?.has_selfie && profile?.legal_name?.trim())
  return [
    {
      done: Boolean(profile?.has_cccd),
      icon: 'document',
      meta: profile?.has_cccd
        ? textByLanguage(language, 'Đã có đối chiếu định danh', 'Identity source provided')
        : textByLanguage(language, 'Chưa có CCCD trong hồ sơ', 'No ID card in profile'),
      title: textByLanguage(language, 'CCCD / định danh', 'ID card'),
    },
    {
      done: hasLegalIdentity,
      icon: 'profile',
      meta: hasLegalIdentity
        ? textByLanguage(language, 'Ảnh hồ sơ khớp tên pháp lý', 'Profile photo matches legal name')
        : textByLanguage(language, 'Cần ảnh hồ sơ và tên pháp lý', 'Profile photo and legal name required'),
      title: textByLanguage(language, 'Lý lịch & ảnh đại diện', 'Profile and portrait'),
    },
    {
      done: Boolean(profile?.service_types?.length),
      icon: 'tools',
      meta: services,
      title: textByLanguage(language, 'Chứng chỉ nghề', 'Trade certificate'),
    },
    {
      done: profile?.verification_status === 'approved',
      icon: 'shield',
      meta: profile?.verification_status === 'approved'
        ? textByLanguage(language, 'Hồ sơ đã được duyệt', 'Profile approved')
        : workerVerificationLabel(profile?.verification_status, language),
      title: textByLanguage(language, 'Bảo hiểm trách nhiệm', 'Liability coverage'),
    },
  ]
}

function WorkerV5VerificationHero({
  language,
  profile,
  reduceTransparency,
}: {
  language: AppLanguage
  profile: WorkerV5Runtime['workerProfile']
  reduceTransparency: boolean
}) {
  const checks = workerV5VerificationChecks(profile, language)
  const completed = checks.filter((check) => check.done).length
  const ready = completed === checks.length && Boolean(profile?.is_approved)
  return (
    <View style={[styles.earningsHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-verification-hero">
      {!reduceTransparency ? <MintAura intensity="component" style={styles.earningsHeroAura} testID="worker-v5-verification-mint-aura" /> : null}
      <View style={styles.earningsHeroIconShell}>
        {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
        <Image resizeMode="contain" source={workerV5Icons.shield} style={styles.earningsHeroIcon} />
      </View>
      <View style={styles.earningsHeroCopy}>
        <Text style={styles.earningsHeroPill} numberOfLines={2} testID="worker-v5-verification-count">{textByLanguage(language, `${completed}/${checks.length} hợp lệ`, `${completed}/${checks.length} valid`)}</Text>
        <Text style={styles.earningsHeroAmount} numberOfLines={2} testID="worker-v5-verification-title">{ready ? textByLanguage(language, 'Sẵn sàng nhận việc', 'Ready for work') : textByLanguage(language, 'Cần hoàn tất xác minh', 'Verification needed')}</Text>
        <Text style={styles.earningsHeroMeta} numberOfLines={2}>{textByLanguage(language, 'Trạng thái pháp lý, chứng chỉ và bảo hiểm từ hồ sơ thật.', 'Legal status, documents, and coverage come from the real profile.')}</Text>
      </View>
    </View>
  )
}

function WorkerV5VerificationChecklist({
  language,
  profile,
  reduceTransparency,
}: {
  language: AppLanguage
  profile: WorkerV5Runtime['workerProfile']
  reduceTransparency: boolean
}) {
  const checks = workerV5VerificationChecks(profile, language)
  return (
    <View style={[styles.verificationDocumentList, reduceTransparency && styles.opaqueCard]} testID="worker-v5-verification-checklist">
      {!reduceTransparency ? (
        <>
          <WorkerV5CustomerCaseWideMintAura scope="VerificationDocumentsWide" style={styles.verificationDocumentListAura} testID="worker-v5-verification-checklist-mint-aura" />
          <WorkerV5CustomerZipMintAura scope="VerificationDocumentsFine" style={styles.verificationDocumentListZipAura} testID="worker-v5-verification-checklist-zip-mint-aura" />
        </>
      ) : null}
      {checks.map((check, index) => (
        <View
          key={check.title}
          style={[styles.verificationDocumentRow, index === checks.length - 1 ? styles.verificationDocumentRowLast : null]}
          testID={`worker-v5-verification-row-${index}`}
        >
          <View style={styles.verificationDocumentIconTile}>
            {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
            <Image
              resizeMode="contain"
              source={workerV5Icons[check.icon]}
              style={[styles.verificationDocumentIcon, WORKER_V5_PROFILE_ICON_VISUAL_BOOST.has(check.icon) ? styles.profileRouteIconVisualBoost : null]}
            />
          </View>
          <View style={styles.verificationDocumentCopy}>
            <Text style={styles.verificationDocumentTitle} numberOfLines={2} testID={`worker-v5-verification-row-title-${index}`}>{check.title}</Text>
            <Text style={styles.verificationDocumentMeta} numberOfLines={2} testID={`worker-v5-verification-row-meta-${index}`}>{check.meta}</Text>
          </View>
          <View style={[styles.verificationDocumentStatus, check.done ? styles.verificationDocumentStatusDone : null]}>
            <Text style={[styles.verificationDocumentStatusText, check.done ? styles.verificationDocumentStatusTextDone : null]} numberOfLines={1} testID={`worker-v5-verification-row-status-${index}`}>
              {check.done ? 'OK' : textByLanguage(language, 'Chờ', 'Wait')}
            </Text>
          </View>
        </View>
      ))}
    </View>
  )
}

function WorkerV5VerificationRenewalCard({
  language,
  profile,
  reduceTransparency,
}: {
  language: AppLanguage
  profile: WorkerV5Runtime['workerProfile']
  reduceTransparency: boolean
}) {
  const hasDocumentSource = Boolean(profile?.has_cccd || profile?.has_selfie || profile?.service_types?.length)
  return (
    <View testID="worker-v5-verification-renewal-card">
      <WorkerV5ReadOnlyToggleList
        items={[
          {
            enabled: hasDocumentSource,
            label: textByLanguage(language, 'Gợi nhắc trước 30 ngày', 'Send 30-day reminder'),
            value: hasDocumentSource
              ? textByLanguage(language, 'Kael theo dõi hạn giấy tờ đã đồng bộ trong hồ sơ.', 'Kael tracks renewal dates from synced profile documents.')
              : textByLanguage(language, 'Chưa có giấy tờ đủ nguồn để theo dõi hẹn.', 'No sourced document is available for renewal tracking.'),
          },
        ]}
        reduceTransparency={reduceTransparency}
      />
    </View>
  )
}

function WorkerV5BankTaxHero({
  earnings,
  language,
  profile,
  reduceTransparency,
}: {
  earnings: WorkerV5Runtime['workerEarnings']
  language: AppLanguage
  profile: WorkerV5Runtime['workerProfile']
  reduceTransparency: boolean
}) {
  const hasBank = Boolean(profile?.bank_account_masked)
  const bankLogo = resolveWorkerV5BankLogo(profile?.bank_name)
  const available = earnings?.net_earnings && earnings.net_earnings > 0
    ? formatVnd(earnings.net_earnings, language)
    : textByLanguage(language, 'Chưa có số dư thật', 'No real balance')
  const identity = profile?.legal_name?.trim() || textByLanguage(language, 'Chưa có tên pháp lý', 'No legal name')
  return (
    <View style={[styles.earningsHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-bank-tax-hero">
      {!reduceTransparency ? <MintAura intensity="component" style={styles.earningsHeroAura} testID="worker-v5-bank-tax-mint-aura" /> : null}
      <View style={styles.earningsHeroIconShell}>
        {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
        <Image
          resizeMode="contain"
          source={bankLogo ?? workerV5Icons.wallet}
          style={bankLogo ? styles.bankLogoImage : styles.earningsHeroIcon}
          testID="worker-v5-bank-tax-logo"
        />
      </View>
      <View style={styles.earningsHeroCopy}>
        <Text style={styles.earningsHeroPill} numberOfLines={2} testID="worker-v5-bank-tax-status">{hasBank ? textByLanguage(language, 'Tài khoản đã ghi', 'Account recorded') : textByLanguage(language, 'Cần xác minh', 'Verification needed')}</Text>
        <Text style={styles.earningsHeroAmount} numberOfLines={2} testID="worker-v5-bank-tax-title">
          {hasBank ? profile?.bank_name || textByLanguage(language, 'Tài khoản nhận tiền', 'Payout account') : textByLanguage(language, 'Ngân hàng và thuế', 'Bank and tax')}
        </Text>
        <Text style={styles.earningsHeroMeta} numberOfLines={2} testID="worker-v5-bank-tax-account">
          {hasBank ? `${profile?.bank_account_masked} · ${identity}` : textByLanguage(language, 'Tài khoản nhận tiền sẽ hiện sau khi xác minh.', 'Payout account appears after verification.')}
        </Text>
        <Text style={styles.earningsHeroMeta} numberOfLines={2} testID="worker-v5-bank-tax-available">{available}</Text>
      </View>
    </View>
  )
}

function WorkerV5PayoutRulesList({
  earnings,
  language,
  reduceTransparency,
}: {
  earnings: WorkerV5Runtime['workerEarnings']
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const hasSettledBalance = Boolean(earnings?.net_earnings && earnings.net_earnings > 0)
  const hasPending = Boolean(earnings?.pending_payment_amount && earnings.pending_payment_amount > 0)
  const rows = [
    {
      icon: 'wallet' as const,
      meta: hasSettledBalance ? formatVnd(earnings?.net_earnings ?? 0, language) : textByLanguage(language, 'Chờ việc đóng và đối soát thật', 'Waiting for real work closure and settlement'),
      status: hasSettledBalance ? textByLanguage(language, 'Có thể rút', 'Available') : textByLanguage(language, 'Chờ', 'Waiting'),
      title: textByLanguage(language, 'Số dư có thể rút', 'Withdrawable balance'),
    },
    {
      icon: 'clock' as const,
      meta: hasPending ? formatVnd(earnings?.pending_payment_amount ?? 0, language) : textByLanguage(language, 'Không có khoản đang chờ', 'No pending amount'),
      status: textByLanguage(language, 'Theo hệ thống', 'System-led'),
      title: textByLanguage(language, 'Chu kỳ chuyển tiền', 'Payout cycle'),
    },
    {
      icon: 'document' as const,
      meta: earnings?.total_jobs_paid && earnings.total_jobs_paid > 0
        ? formatDateRange(earnings.from_date, earnings.to_date, language)
        : textByLanguage(language, 'Chưa có chứng từ thu nhập được đồng bộ', 'No synced income document'),
      status: earnings?.total_jobs_paid && earnings.total_jobs_paid > 0 ? textByLanguage(language, 'Đã ghi', 'Recorded') : textByLanguage(language, 'Chưa có', 'None'),
      title: textByLanguage(language, 'Chứng từ thu nhập', 'Income document'),
    },
  ]
  return (
    <View style={[styles.approvalDecisionList, reduceTransparency && styles.opaqueCard]} testID="worker-v5-payout-rules-list">
      {rows.map((row, index) => (
        <View key={row.title} style={styles.approvalDecisionRow}>
          <View style={styles.approvalDecisionIconShell}>
            {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
            <Image resizeMode="contain" source={workerV5Icons[row.icon]} style={styles.approvalDecisionIcon} />
          </View>
          <View style={styles.approvalDecisionCopy}>
            <Text style={styles.approvalDecisionTitle} numberOfLines={2} testID={`worker-v5-payout-rule-title-${index}`}>{row.title}</Text>
            <Text style={styles.approvalDecisionMeta} numberOfLines={2} testID={`worker-v5-payout-rule-meta-${index}`}>{row.meta}</Text>
          </View>
          <Text style={styles.approvalDecisionStatus} numberOfLines={2} testID={`worker-v5-payout-rule-status-${index}`}>{row.status}</Text>
        </View>
      ))}
    </View>
  )
}

function WorkerV5AccountChangeGuard({
  language,
  profile,
  reduceTransparency,
}: {
  language: AppLanguage
  profile: WorkerV5Runtime['workerProfile']
  reduceTransparency: boolean
}) {
  const checks = [
    {
      done: Boolean(profile?.has_cccd && profile?.has_selfie),
      meta: textByLanguage(language, 'ĐẢnh danh', 'Identity'),
      title: textByLanguage(language, 'Yêu cầu sinh trắc hoặc định danh hồ sơ', 'Biometric or profile identity is required'),
    },
    {
      done: Boolean(profile?.bank_account_masked),
      meta: textByLanguage(language, 'Tài khoản', 'Account'),
      title: textByLanguage(language, 'Có tài khoản nhận tiền đang ghi nhận', 'A payout account is recorded'),
    },
    {
      done: false,
      meta: textByLanguage(language, 'Không tự đổi', 'No auto-change'),
      title: textByLanguage(language, 'Đổi tài khoản cần xác minh lại trước khi rút tiền', 'Changing account requires re-verification before payout'),
    },
  ]
  return (
    <View testID="worker-v5-account-change-guard">
      <WorkerV5FinalChecklistCard checks={checks} reduceTransparency={reduceTransparency} />
    </View>
  )
}

function WorkerV5ReviewsHero({
  insights,
  language,
  profile,
  reduceTransparency,
}: {
  insights: WorkerV5Runtime['workerPerformanceInsights']
  language: AppLanguage
  profile: WorkerV5Runtime['workerProfile']
  reduceTransparency: boolean
}) {
  const rating = insights?.average_rating ?? profile?.rating ?? null
  const hasRating = typeof rating === 'number' && rating > 0
  const reviewCount = insights?.review_count ?? 0
  return (
    <View style={[styles.earningsHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-reviews-hero">
      {!reduceTransparency ? <MintAura intensity="component" style={styles.earningsHeroAura} testID="worker-v5-reviews-mint-aura" /> : null}
      <View style={styles.completionLens}>
        <Text style={styles.completionLensValue} numberOfLines={1} testID="worker-v5-reviews-rating">{hasRating ? rating.toFixed(rating % 1 === 0 ? 0 : 1) : '—'}</Text>
        <Text style={styles.completionLensLabel} numberOfLines={1}>{textByLanguage(language, 'điểm', 'rating')}</Text>
      </View>
      <View style={styles.earningsHeroCopy}>
        <Text style={styles.earningsHeroPill} numberOfLines={2} testID="worker-v5-reviews-count">{reviewCount > 0 ? textByLanguage(language, `${reviewCount} phản hồi`, `${reviewCount} reviews`) : textByLanguage(language, 'Chưa có phản hồi', 'No feedback yet')}</Text>
        <Text style={styles.earningsHeroAmount} numberOfLines={2} testID="worker-v5-reviews-title">
          {hasRating ? textByLanguage(language, 'Tín hiệu chất lượng thật', 'Real quality signal') : textByLanguage(language, 'Chờ phản hồi thật', 'Waiting for real feedback')}
        </Text>
        <Text style={styles.earningsHeroMeta} numberOfLines={2}>
          {textByLanguage(language, 'Chỉ hiển thị điểm, lượt đánh giá và tín hiệu đã đồng bộ.', 'Only synced rating, counts, and signals are shown.')}
        </Text>
      </View>
    </View>
  )
}

function WorkerV5ReviewSignalGrid({
  insights,
  language,
  profile,
}: {
  insights: WorkerV5Runtime['workerPerformanceInsights']
  language: AppLanguage
  profile: WorkerV5Runtime['workerProfile']
}) {
  const axisCells = insights?.performance_axes
    ?.filter((axis) => typeof axis.score === 'number' && Number.isFinite(axis.score))
    .slice(0, 3)
    .map((axis) => ({
      label: workerPerformanceAxisShortLabel(axis.id, language),
      value: `${axis.score}/100`,
    })) ?? []
  const cells = axisCells.length
    ? axisCells
    : [
      { label: textByLanguage(language, 'Đánh giá', 'Rating'), value: formatNullableRating(insights?.average_rating ?? profile?.rating, language) },
      { label: textByLanguage(language, 'Phản hồi', 'Response'), value: formatNullablePercent(insights?.response_rate_percent, language) },
      { label: textByLanguage(language, 'Đúng hẹn', 'On-time'), value: formatNullablePercent(insights?.on_time_rate_percent, language) },
    ]
  return (
    <View style={styles.metricsGrid} testID="worker-v5-review-signal-grid">
      {cells.map((cell) => (
        <MetricTile key={`${cell.label}-${cell.value}`} label={cell.label} value={cell.value} />
      ))}
    </View>
  )
}

function WorkerV5RecentFeedbackList({
  insights,
  language,
  reduceTransparency,
}: {
  insights: WorkerV5Runtime['workerPerformanceInsights']
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const axes = insights?.performance_axes
    ?.filter((axis) => typeof axis.score === 'number' && Number.isFinite(axis.score))
    .slice(0, 3) ?? []
  const rows = axes.length
    ? axes.map((axis) => ({
      icon: 'chat' as const,
      meta: textByLanguage(language, 'Tín hiệu tổng hợp, không phải lời khách nguyên văn', 'Aggregate signal, not a fabricated customer quote'),
      status: `${axis.score}/100`,
      title: workerPerformanceAxisLabel(axis.id, language),
    }))
    : [
      {
        icon: 'chat' as const,
        meta: insights?.review_count && insights.review_count > 0
          ? textByLanguage(language, 'Có số lượt dánh giá nhưng chua đồng bộ nội dung chi tiết', 'Review count exists but detailed content is not synced')
          : textByLanguage(language, 'Chưa có phản hồi thật để hiển thị', 'No real feedback to show yet'),
        status: insights?.review_count && insights.review_count > 0 ? `${insights.review_count}` : textByLanguage(language, 'Chờ', 'Waiting'),
        title: textByLanguage(language, 'Phản hồi gần đây', 'Recent feedback'),
      },
    ]
  return (
    <View style={[styles.approvalDecisionList, reduceTransparency && styles.opaqueCard]} testID="worker-v5-recent-feedback-list">
      {rows.map((row, index) => (
        <View key={row.title} style={styles.approvalDecisionRow}>
          <View style={styles.approvalDecisionIconShell}>
            {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
            <Image resizeMode="contain" source={workerV5Icons[row.icon]} style={styles.approvalDecisionIcon} />
          </View>
          <View style={styles.approvalDecisionCopy}>
            <Text style={styles.approvalDecisionTitle} numberOfLines={2} testID={`worker-v5-feedback-title-${index}`}>{row.title}</Text>
            <Text style={styles.approvalDecisionMeta} numberOfLines={2} testID={`worker-v5-feedback-meta-${index}`}>{row.meta}</Text>
          </View>
          <Text style={styles.approvalDecisionStatus} numberOfLines={2} testID={`worker-v5-feedback-status-${index}`}>{row.status}</Text>
        </View>
      ))}
    </View>
  )
}

function WorkerV5ReviewImprovementPlan({
  insights,
  language,
  reduceTransparency,
}: {
  insights: WorkerV5Runtime['workerPerformanceInsights']
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const weakestAxis = insights?.performance_axes
    ?.filter((axis) => typeof axis.score === 'number' && Number.isFinite(axis.score))
    .sort((left, right) => (left.score ?? 0) - (right.score ?? 0))[0]
  const body = weakestAxis
    ? textByLanguage(
      language,
      `Kael có thể huấn luyện dựa trên ${workerPerformanceAxisLabel(weakestAxis.id, language).toLowerCase()} (${weakestAxis.score}/100).`,
      `Kael can coach from ${workerPerformanceAxisLabel(weakestAxis.id, language).toLowerCase()} (${weakestAxis.score}/100).`,
    )
    : textByLanguage(language, 'Cần thêm dữ liệu đánh giá thật trước khi tạo kế hoạch cải thiện.', 'More real review data is needed before making an improvement plan.')
  return (
    <View testID="worker-v5-review-improvement-plan">
      <WorkerV5KaelBriefCard
        body={body}
        icon="chat"
        reduceTransparency={reduceTransparency}
        title={textByLanguage(language, 'Kế hoạch cải thiện', 'Improvement plan')}
      />
    </View>
  )
}

function WorkerV5SettingsHero({ language, reduceTransparency }: { language: AppLanguage; reduceTransparency: boolean }) {
  return (
    <View style={[styles.earningsHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-settings-hero">
      {!reduceTransparency ? <WorkerV5EarningsHomeListAura testID="worker-v5-settings-mint-aura" /> : null}
      <View style={styles.earningsHeroIconShell}>
        {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
        <Image resizeMode="contain" source={workerV5Icons.shield} style={styles.earningsHeroIcon} />
      </View>
      <View style={styles.earningsHeroCopy}>
        <Text style={styles.earningsHeroAmount} numberOfLines={2} testID="worker-v5-settings-title">{textByLanguage(language, 'Cài đặt tài khoản', 'Account settings')}</Text>
        <Text style={styles.earningsHeroMeta} numberOfLines={2}>
          {textByLanguage(language, 'Bảo mật, ngôn ngữ và dữ liệu Kael.', 'Security, language, and Kael data.')}
        </Text>
      </View>
    </View>
  )
}

function WorkerV5SettingsActionRow({
  body,
  icon,
  onPress,
  reduceTransparency,
  status,
  testID,
  title,
}: {
  body: string
  icon: WorkerV5IconName
  onPress: () => void
  reduceTransparency: boolean
  status: string
  testID: string
  title: string
}) {
  return (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.workerSettingsActionRow, pressed ? styles.pressed : null]}
      testID={testID}
    >
      {!reduceTransparency ? <WorkerV5EarningsHomeListAura testID={`${testID}-mint-aura`} /> : null}
      <View style={styles.workerSettingsActionIconShell}>
        {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
        <Image resizeMode="contain" source={workerV5Icons[icon]} style={styles.workerSettingsActionIcon} />
      </View>
      <View style={styles.workerSettingsActionCopy}>
        <Text style={styles.workerSettingsActionTitle} numberOfLines={2}>{title}</Text>
        <Text style={styles.workerSettingsActionBody} numberOfLines={2}>{body}</Text>
      </View>
      <View style={[styles.workerSettingsStatusPill, reduceTransparency && styles.opaqueCard]}>
        {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
        <Text style={styles.workerSettingsStatusText} numberOfLines={1}>{status}</Text>
      </View>
    </Pressable>
  )
}

function WorkerV5BankChipGrid({
  items,
  reduceTransparency,
}: {
  items: ReadonlyArray<{ label: string; selected: boolean; value: string }>
  reduceTransparency: boolean
}) {
  return (
    <View style={styles.bankChipGrid} testID="worker-v5-bank-chip-grid">
      {items.map((item, index) => (
        <View key={`${item.label}-${item.value}`} style={[styles.bankChip, reduceTransparency && styles.opaqueCard, item.selected ? styles.bankChipSelected : null]} testID={`worker-v5-bank-chip-${index}`}>
          <Text style={styles.bankChipLabel} numberOfLines={1}>{item.label}</Text>
          <Text style={styles.bankChipValue} numberOfLines={1}>{item.value}</Text>
          {item.selected ? (
            <View style={styles.bankChipCheck}>
              <Text style={styles.bankChipCheckText}>?</Text>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  )
}

function WorkerV5ReadOnlyToggleList({
  items,
  reduceTransparency,
}: {
  items: ReadonlyArray<{ enabled: boolean; label: string; value: string }>
  reduceTransparency: boolean
}) {
  return (
    <View style={[styles.toggleList, reduceTransparency && styles.opaqueCard]} testID="worker-v5-toggle-list">
      {items.map((item, index) => (
        <View key={`${item.label}-${item.value}`} style={styles.toggleRow} testID={`worker-v5-toggle-row-${index}`}>
          <View style={styles.toggleTextColumn}>
            <Text style={styles.toggleLabel} numberOfLines={2} testID={`worker-v5-toggle-label-${index}`}>{item.label}</Text>
            <Text style={styles.toggleValue} numberOfLines={2} testID={`worker-v5-toggle-value-${index}`}>{item.value}</Text>
          </View>
          <View
            accessibilityRole="switch"
            accessibilityState={{ checked: item.enabled, disabled: true }}
            style={[styles.toggleTrack, item.enabled ? styles.toggleTrackOn : null]}
            testID={`worker-v5-toggle-track-${index}`}
          >
            <View style={[styles.toggleKnob, item.enabled ? styles.toggleKnobOn : null]} />
          </View>
        </View>
      ))}
    </View>
  )
}

function WorkerV5VoiceShell({ caption, reduceTransparency, title }: { caption: string; reduceTransparency: boolean; title: string }) {
  const bars = [8, 17, 12, 23, 15, 10, 19, 8]
  return (
    <View
      accessibilityLabel={`${title}. ${caption}`}
      accessibilityState={{ disabled: true }}
      style={[styles.voiceShell, reduceTransparency && styles.opaqueCard]}
      testID="worker-v5-voice-shell"
    >
      <View style={styles.voiceWave}>
        {bars.map((height, index) => <View key={`${height}-${index}`} style={[styles.voiceBar, { height }]} />)}
      </View>
      <View style={styles.voiceTextColumn}>
        <Text style={styles.voiceTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.voiceCaption} numberOfLines={2}>{caption}</Text>
      </View>
    </View>
  )
}

function WorkerV5CaseMessagePreview({
  deal,
  language,
  reduceTransparency,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
}) {
  if (!deal) return null
  const scope = deal.scopeChange
  const rows = [
    {
      body: deal.draft.description || textByLanguage(language, 'Không có mô tả yêu cầu', 'No request description'),
      label: textByLanguage(language, 'Nguồn yêu cầu', 'Request source'),
      tone: 'peer' as const,
    },
    scope?.requestedDescription
      ? {
        body: scope.requestedDescription,
        label: textByLanguage(language, 'Nháp đổi phạm vi', 'Scope draft'),
        tone: 'user' as const,
      }
      : null,
    {
      body: textByLanguage(
        language,
        'Kael chỉ gắn nguồn vào review; không thay tin nhắn của khách hoặc thợ.',
        'Kael only attaches sources to review; it does not rewrite customer or worker messages.',
      ),
      label: textByLanguage(language, 'Kael · ranh giới', 'Kael · boundary'),
      tone: 'system' as const,
    },
  ].filter((row): row is { body: string; label: string; tone: 'peer' | 'system' | 'user' } => Boolean(row))

  return (
    <View style={[styles.chatPreviewCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-chat-message-preview">
      {rows.map((row) => (
        <View
          key={`${row.label}-${row.body}`}
          style={[
            styles.chatPreviewRow,
            row.tone === 'user' ? styles.chatPreviewRowUser : null,
          ]}
        >
          <View
            style={[
              styles.chatMessage,
              reduceTransparency ? styles.opaqueCard : null,
              row.tone === 'peer' ? styles.chatMessagePeer : null,
              row.tone === 'system' ? styles.chatMessageSystem : null,
              row.tone === 'user' ? styles.chatMessageUser : null,
            ]}
          >
            <Text style={styles.chatMessageLabel}>{row.label}</Text>
            <Text style={styles.chatMessageBody}>{row.body}</Text>
          </View>
        </View>
      ))}
    </View>
  )
}

function WorkerV5PaymentTotalCard({
  amount,
  caption,
  reduceTransparency,
  status,
}: {
  amount: string
  caption: string
  reduceTransparency: boolean
  status: string
}) {
  return (
    <View style={[styles.paymentTotalCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-payment-total-glass">
      {!reduceTransparency ? <MintAura intensity="component" style={styles.paymentTotalAura} /> : null}
      <View style={styles.paymentTotalCopy}>
        <Text style={styles.paymentTotalCaption} numberOfLines={1}>{caption}</Text>
        <Text style={styles.paymentTotalAmount} numberOfLines={2}>{amount}</Text>
      </View>
      <View style={styles.paymentTotalChip}>
        <Text style={styles.paymentTotalChipText} numberOfLines={1}>{status}</Text>
      </View>
    </View>
  )
}

function WorkerV5InfoGrid({ items }: { items: ReadonlyArray<{ label: string; value: string }> }) {
  return (
    <View style={styles.infoGrid} testID="worker-v5-info-grid">
      {items.map((item, index) => (
        <View key={`${item.label}-${item.value}`} style={styles.infoCell}>
          <Text style={styles.infoCellValue} numberOfLines={1} testID={`worker-v5-info-cell-value-${index}`}>{item.value}</Text>
          <Text style={styles.infoCellLabel} numberOfLines={2} testID={`worker-v5-info-cell-label-${index}`}>{item.label}</Text>
        </View>
      ))}
    </View>
  )
}

function WorkerV5PriceLines({
  formulaAura = false,
  reduceTransparency = false,
  rows,
  total,
}: {
  formulaAura?: boolean
  reduceTransparency?: boolean
  rows: ReadonlyArray<{ label: string; value: string }>
  total?: { label: string; value: string }
}) {
  return (
    <View style={[styles.priceLinesCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-price-lines">
      {formulaAura && !reduceTransparency ? (
        <>
          <WorkerV5CustomerCaseWideMintAura scope="PriceLinesWide" style={styles.checkInChecklistAura} testID="worker-v5-price-lines-mint-aura" />
          <WorkerV5CustomerZipMintAura scope="PriceLinesFine" style={styles.checkInChecklistZipAura} testID="worker-v5-price-lines-zip-mint-aura" />
        </>
      ) : null}
      {rows.map((row, index) => (
        <View key={`${row.label}-${row.value}`} style={styles.priceLine}>
          <Text style={styles.priceLineLabel} numberOfLines={2} testID={`worker-v5-price-line-label-${index}`}>{row.label}</Text>
          <Text style={styles.priceLineValue} numberOfLines={2} testID={`worker-v5-price-line-value-${index}`}>{row.value}</Text>
        </View>
      ))}
      {total ? (
        <View style={styles.priceTotalLine}>
          <Text style={styles.priceTotalLabel} numberOfLines={2} testID="worker-v5-price-total-label">{total.label}</Text>
          <Text style={styles.priceTotalValue} numberOfLines={2} testID="worker-v5-price-total-value">{total.value}</Text>
        </View>
      ) : null}
    </View>
  )
}

function WorkerV5ArtifactGrid({ items }: { items: ReadonlyArray<{ label: string; tone?: 'mint' | 'neutral'; value: string }> }) {
  return (
    <View style={styles.artifactGrid} testID="worker-v5-artifact-grid">
      {items.map((item) => (
        <View key={`${item.label}-${item.value}`} style={styles.artifactCell}>
          <Text style={styles.artifactLabel} numberOfLines={1}>{item.label}</Text>
          <Text style={[styles.artifactValue, item.tone === 'mint' ? styles.artifactValueMint : null]} numberOfLines={2}>
            {item.value}
          </Text>
        </View>
      ))}
    </View>
  )
}

function WorkerV5SuccessEmblem({
  body,
  reduceTransparency,
  status,
  title,
}: {
  body: string
  reduceTransparency?: boolean
  status?: string
  title: string
}) {
  return (
    <View style={[styles.successCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-success-emblem">
      {!reduceTransparency ? <MintAura intensity="component" style={styles.successAura} testID="worker-v5-completion-submitted-mint-aura" /> : null}
      <View style={styles.successEmblem}>
        {!reduceTransparency ? <WorkerV5SuccessEmblemAura scope="CompletionSubmitted" testID="worker-v5-success-emblem-aura" /> : null}
        <View style={styles.successCheck}>
          {!reduceTransparency ? <WorkerV5SuccessCheckFill scope="CompletionSubmitted" testID="worker-v5-success-check-fill" /> : null}
          <Text style={styles.successCheckText}>✓</Text>
        </View>
      </View>
      {status ? (
        <View style={styles.successStatusPill}>
          <View style={styles.statusDotSmall} />
          <Text style={styles.successStatusText} numberOfLines={2}>{status}</Text>
        </View>
      ) : null}
      <Text style={styles.successTitle} numberOfLines={2}>{title}</Text>
      <Text style={styles.successBody} numberOfLines={3}>{body}</Text>
    </View>
  )
}

function WorkerV5PerformanceGauge({
  caption,
  label,
  reduceTransparency,
  score,
}: {
  caption: string
  label: string
  reduceTransparency: boolean
  score: number | null
}) {
  const normalizedScore = typeof score === 'number' && Number.isFinite(score)
    ? Math.max(0, Math.min(100, Math.round(score)))
    : null
  const progress = normalizedScore == null ? 0 : normalizedScore / 100
  const endAngle = Math.PI - (Math.PI * progress)
  const endX = 77 + (60 * Math.cos(endAngle))
  const endY = 76 - (60 * Math.sin(endAngle))
  const activePath = progress > 0 ? `M 17 76 A 60 60 0 ${progress > 0.5 ? 1 : 0} 1 ${endX.toFixed(2)} ${endY.toFixed(2)}` : null

  return (
    <View style={[styles.gaugeCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-gauge">
      <View style={styles.gaugeShell}>
        <Svg height={86} width={154} viewBox="0 0 154 86">
          <Defs>
            <LinearGradient id="worker-v5-gauge-gradient" x1="0" x2="1" y1="0" y2="0">
              <Stop offset={0} stopColor={color.mint.mint300} />
              <Stop offset={0.7} stopColor={color.brand.primary} />
              <Stop offset={1} stopColor={color.accent.success} />
            </LinearGradient>
          </Defs>
          <Path d="M 17 76 A 60 60 0 0 1 137 76" fill="none" stroke="rgba(216,235,232,0.82)" strokeLinecap="round" strokeWidth={16} />
          {activePath ? (
            <Path d={activePath} fill="none" stroke="url(#worker-v5-gauge-gradient)" strokeLinecap="round" strokeWidth={16} />
          ) : null}
        </Svg>
        <View style={styles.gaugeValue}>
          <Text style={styles.gaugeNumber} numberOfLines={1}>{normalizedScore != null ? normalizedScore : '—'}</Text>
          <Text style={styles.gaugeLabel} numberOfLines={2}>{label}</Text>
        </View>
      </View>
      <Text style={styles.gaugeCaption} numberOfLines={3}>{caption}</Text>
    </View>
  )
}

function WorkerV5RankingPodium({ insights, language }: { insights: WorkerV5Runtime['workerPerformanceInsights']; language: AppLanguage }) {
  const scoredAxes = insights?.performance_axes
    ?.filter((axis): axis is { id: typeof axis.id; score: number } => typeof axis.score === 'number' && Number.isFinite(axis.score))
    .sort((left, right) => right.score - left.score)
    .slice(0, 3) ?? []
  if (scoredAxes.length < 3) return null
  const podiumAxes = [scoredAxes[1], scoredAxes[0], scoredAxes[2]]
  return (
    <View style={styles.rankingPodium} testID="worker-v5-ranking-podium">
      {podiumAxes.map((axis, index) => (
        <View
          key={axis.id}
          style={[
            styles.podiumColumn,
            index === 1 ? styles.podiumFirst : index === 0 ? styles.podiumSecond : styles.podiumThird,
          ]}
        >
          <Text style={styles.podiumValue}>{axis.score}</Text>
          <Text style={styles.podiumLabel} numberOfLines={2}>{workerPerformanceAxisShortLabel(axis.id, language)}</Text>
        </View>
      ))}
    </View>
  )
}

function WorkerV5RankRail({ insights, language }: { insights: WorkerV5Runtime['workerPerformanceInsights']; language: AppLanguage }) {
  const fallbackAxes = ['rating', 'response', 'arrival', 'completion', 'earnings']
  const axes = fallbackAxes.map((id) => insights?.performance_axes?.find((axis) => axis.id === id) ?? { id, score: null })
  return (
    <View style={styles.rankRail} testID="worker-v5-rank-rail">
      {axes.map((axis) => {
        const active = axis.score != null
        return (
          <View key={axis.id} style={[styles.rankNode, active ? styles.rankNodeActive : null]}>
            <Text style={[styles.rankNodeValue, active ? styles.rankNodeValueActive : null]} numberOfLines={1}>
              {active ? axis.score : textByLanguage(language, 'Chờ', 'Pending')}
            </Text>
            <Text style={styles.rankNodeLabel} numberOfLines={2}>{workerPerformanceAxisShortLabel(axis.id, language)}</Text>
          </View>
        )
      })}
    </View>
  )
}

function WorkerV5JobSummaryCard({ deal, language, reduceTransparency }: { deal: LocalDeal; language: AppLanguage; reduceTransparency: boolean }) {
  const earning = deal.broadcast?.estimatedEarningLabel ?? textByLanguage(language, 'Chờ Kael tính tiền công', 'Waiting for Kael earning')
  const area = deal.broadcast?.generalArea || deal.draft.districtLabel || textByLanguage(language, 'Khu vực đang ẩn', 'Area hidden')
  return (
    <View style={[styles.jobSummaryCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-job-summary-card">
      {!reduceTransparency ? <MintAura intensity="component" style={styles.cardMintAura} testID="worker-v5-offer-detail-mint-aura" /> : null}
      <View style={styles.jobSummaryServiceLine}>
        <View style={styles.opportunityIconTile}>
          <MintAura intensity="iconTile" style={styles.iconTileMintAura} />
          <Image source={workerV5Icons.jobs} style={styles.opportunityIcon} />
        </View>
        <View style={styles.opportunityTextColumn}>
          <Text style={styles.jobSummaryChip}>{localizedStatusLabel(deal.status, language)}</Text>
          <Text style={styles.jobSummaryTitle} numberOfLines={2} testID="worker-v5-job-summary-title">{localizedServiceLabel(deal.draft.serviceType, language)}</Text>
          <Text style={styles.jobSummaryMeta} numberOfLines={2} testID="worker-v5-job-summary-meta">{area}</Text>
        </View>
        <Text style={styles.jobSummaryPrice} numberOfLines={2} testID="worker-v5-job-summary-price">{earning}</Text>
      </View>
    </View>
  )
}

function WorkerV5ProgressRail({ activeStep, language }: { activeStep: number; language: AppLanguage }) {
  const labels = [
    textByLanguage(language, 'Nhận', 'Accept'),
    textByLanguage(language, 'Đến', 'Arrive'),
    textByLanguage(language, 'Làm', 'Work'),
    textByLanguage(language, 'Duyệt', 'Review'),
    textByLanguage(language, 'Đóng', 'Close'),
  ]
  return <WorkerV5Rail labels={labels} activeStep={activeStep} testID="worker-v5-progress-rail" />
}

function WorkerV5KaelProgressRail({ language }: { language: AppLanguage }) {
  const labels = [
    textByLanguage(language, 'Thu thập', 'Collect'),
    textByLanguage(language, 'Đối chiếu', 'Compare'),
    textByLanguage(language, 'Đề xuất', 'Draft'),
    textByLanguage(language, 'Bạn duyệt', 'Review'),
  ]
  return <WorkerV5Rail labels={labels} activeStep={3} testID="worker-v5-kael-progress-rail" />
}

function WorkerV5Rail({ activeStep, labels, testID }: { activeStep: number; labels: readonly string[]; testID: string }) {
  return (
    <View style={styles.railCard} testID={testID}>
      <View style={styles.progressRail}>
        {labels.map((label, index) => {
          const step = index + 1
          const done = step < activeStep
          const active = step === activeStep
          return (
            <View key={label} style={styles.railSegment} testID={`${testID}-segment-${step}`}>
              {index < labels.length - 1 ? <View style={[styles.railLine, done ? styles.railLineDone : null]} /> : null}
              <View style={[styles.railNode, done || active ? styles.railNodeOn : null, active ? styles.railNodeActive : null]}>
                <Text style={[styles.railNodeText, done || active ? styles.railNodeTextOn : null]}>{done ? '✓' : step}</Text>
              </View>
              <Text style={[styles.railLabel, active ? styles.railLabelActive : null]} numberOfLines={1} testID={`${testID}-label-${step}`}>
                {label}
              </Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

function WorkerV5ModeSwitch({
  active,
  language,
  onSelect,
}: {
  active: 'intake' | 'normal'
  language: AppLanguage
  onSelect: (id: WorkerV5ScreenId) => void
}) {
  const tabs = [
    { id: 'normal' as const, label: textByLanguage(language, 'Chat thường', 'Normal'), screenId: '3.1-kael-chat-normal' as const },
    { id: 'intake' as const, label: textByLanguage(language, 'Nhận việc', 'Intake'), screenId: '3.2-kael-job-intake' as const },
  ]
  return (
    <View accessibilityRole="tablist" style={styles.modeSwitch} testID="worker-v5-mode-switch">
      {tabs.map((tab) => {
        const selected = tab.id === active
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            disabled={selected}
            key={tab.id}
            onPress={() => onSelect(tab.screenId)}
            style={({ pressed }) => [styles.modeTab, selected ? styles.modeTabActive : null, pressed && !selected ? styles.pressed : null]}
            testID={`worker-v5-mode-tab-${tab.id}`}
          >
            <Text style={[styles.modeTabText, selected ? styles.modeTabTextActive : null]} numberOfLines={2} testID={`worker-v5-mode-tab-text-${tab.id}`}>{tab.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function WorkerV5TimerCard({
  deal,
  language,
  reduceTransparency,
  sourceCount,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
  sourceCount: number
}) {
  const stage = workerStatusStage(deal?.status)
  const status = deal ? localizedStatusLabel(deal.status, language) : textByLanguage(language, 'Chưa có việc', 'No work')
  const caption = sourceCount > 0
    ? textByLanguage(language, `${sourceCount} nguồn kiểm tra thật`, `${sourceCount} real checklist sources`)
    : textByLanguage(language, 'Chờ nguồn kiểm tra thật từ việc', 'Waiting for real checklist sources')
  const radiusPx = 30
  const circumference = 2 * Math.PI * radiusPx
  const dashOffset = circumference - (stage.progress / 100) * circumference

  return (
    <View style={[styles.timerCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-timer-card">
      {!reduceTransparency ? (
        <>
          <WorkerV5SourceCardSkin testID="worker-v5-in-progress-card-skin" />
          <WorkerV5CustomerCaseWideMintAura scope="JobProgressHero" testID="worker-v5-in-progress-mint-aura" />
          <WorkerV5CustomerZipMintAura scope="JobProgressHeroFine" testID="worker-v5-in-progress-zip-mint-aura" />
          <WorkerV5CustomerCaseWorkCardAura scope="JobProgressHeroSoft" testID="worker-v5-in-progress-card-mint-aura" />
        </>
      ) : null}
      <View style={styles.timerTextColumn}>
        <Text style={styles.timerLabel}>{textByLanguage(language, 'Tiến độ theo trạng thái', 'Status-based progress')}</Text>
        <Text style={styles.timerValue} numberOfLines={1}>{status}</Text>
        <Text style={styles.timerCaption} numberOfLines={2} testID="worker-v5-timer-caption">{caption}</Text>
      </View>
      <View
        accessibilityLabel={textByLanguage(language, `Mốc ${stage.current} trên ${stage.total}`, `Step ${stage.current} of ${stage.total}`)}
        accessibilityRole="progressbar"
        accessibilityValue={{ max: stage.total, min: 0, now: stage.current }}
        style={styles.timerRing}
      >
        <Svg height={70} width={70} viewBox="0 0 70 70">
          <Defs>
            <LinearGradient id="worker-v5-timer-gradient" x1="0" x2="1" y1="0" y2="1">
              <Stop offset={0} stopColor={color.mint.mint300} />
              <Stop offset={0.58} stopColor={color.brand.primary} />
              <Stop offset={1} stopColor={color.brand.primaryDark} />
            </LinearGradient>
          </Defs>
          <Circle cx={35} cy={35} r={radiusPx} fill="none" stroke="rgba(205,228,223,0.62)" strokeWidth={7} />
          <Circle
            cx={35}
            cy={35}
            r={radiusPx}
            fill="none"
            stroke="url(#worker-v5-timer-gradient)"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            strokeWidth={7}
            transform="rotate(-90 35 35)"
          />
        </Svg>
        <View style={styles.timerRingLens}>
          <Text style={styles.timerRingValue}>{stage.current}/{stage.total}</Text>
        </View>
      </View>
    </View>
  )
}

function WorkerV5ComposerShell({ label, reduceTransparency = false }: { label: string; reduceTransparency?: boolean }) {
  return (
    <View
      accessibilityLabel={label}
      accessibilityState={{ disabled: true }}
      style={[styles.composerShell, reduceTransparency && styles.opaqueCard]}
      testID="worker-v5-composer-shell"
    >
      <Text style={styles.composerPlaceholder} numberOfLines={1} testID="worker-v5-composer-placeholder">{label}</Text>
      <View style={styles.composerUtility}>
        <Image source={workerV5Icons.document} style={styles.composerIcon} />
      </View>
      <View style={styles.composerSend}>
        <Image source={workerV5Icons.chat} style={styles.composerSendIcon} />
      </View>
    </View>
  )
}

function WorkerV5BoundaryNote({
  body,
  formulaAura = false,
  reduceTransparency = false,
  title,
}: {
  body: string
  formulaAura?: boolean
  reduceTransparency?: boolean
  title: string
}) {
  return (
    <View style={[styles.boundaryNote, reduceTransparency && styles.opaqueCard]} testID="worker-v5-boundary-note">
      {formulaAura && !reduceTransparency ? (
        <>
          <WorkerV5CustomerCaseWideMintAura scope="BoundaryNoteWide" style={styles.checkInChecklistAura} testID="worker-v5-boundary-note-mint-aura" />
          <WorkerV5CustomerZipMintAura scope="BoundaryNoteFine" style={styles.checkInChecklistZipAura} testID="worker-v5-boundary-note-zip-mint-aura" />
        </>
      ) : null}
      <Text style={styles.boundaryTitle}>{title}</Text>
      <Text style={styles.boundaryBody}>{body}</Text>
    </View>
  )
}

type WorkerV5StepState = 'active' | 'done' | 'todo'

function WorkerV5StepList({
  formulaAura = false,
  items,
  reduceTransparency = false,
  testID = 'worker-v5-step-list',
}: {
  formulaAura?: boolean
  items: ReadonlyArray<{ meta: string; state: WorkerV5StepState; title: string }>
  reduceTransparency?: boolean
  testID?: string
}) {
  return (
    <View style={[styles.stepList, formulaAura && styles.stepListFormula, reduceTransparency && styles.opaqueCard]} testID={testID}>
      {formulaAura && !reduceTransparency ? (
        <>
          <WorkerV5CustomerCaseWideMintAura scope="StepListWide" style={styles.checkInChecklistAura} testID={`${testID}-formula-aura`} />
          <WorkerV5CustomerZipMintAura scope="StepListFine" style={styles.checkInChecklistZipAura} testID={`${testID}-zip-mint-aura`} />
        </>
      ) : null}
      {items.map((item, index) => (
        <View
          key={`${item.title}-${index}`}
          style={[
            styles.stepRow,
            item.state === 'done' ? styles.stepRowDone : null,
            item.state === 'active' ? styles.stepRowActive : null,
          ]}
        >
          <View style={[styles.stepState, item.state === 'done' ? styles.stepStateDone : null, item.state === 'active' ? styles.stepStateActive : null]}>
            <Text style={[styles.stepStateText, item.state === 'active' ? styles.stepStateTextActive : null, item.state === 'done' ? styles.stepStateTextDone : null]}>
              {item.state === 'done' ? '✓' : index + 1}
            </Text>
          </View>
          <Text style={styles.stepTitle} numberOfLines={2} testID={`worker-v5-step-title-${index}`}>{item.title}</Text>
          <Text style={styles.stepMeta} numberOfLines={2} testID={`worker-v5-step-meta-${index}`}>{item.meta}</Text>
        </View>
      ))}
    </View>
  )
}

function WorkerV5Timeline({ events, reduceTransparency = false }: { events: readonly string[]; reduceTransparency?: boolean }) {
  return (
    <View style={[styles.timeline, reduceTransparency && styles.opaqueCard]} testID="worker-v5-timeline">
      <View pointerEvents="none" style={styles.timelineRail} />
      {events.map((event, index) => {
        const active = index === events.length - 1
        return (
          <View key={`${event}-${index}`} style={styles.timelineItem}>
            <View style={[styles.timelineDot, active ? styles.timelineDotActive : styles.timelineDotDone]} />
            <Text style={styles.timelineTitle} numberOfLines={2} testID={`worker-v5-case-timeline-title-${index}`}>{event}</Text>
          </View>
        )
      })}
    </View>
  )
}

function WorkerV5ScoreSummary({
  caption,
  label,
  reduceTransparency,
  score,
}: {
  caption: string
  label: string
  reduceTransparency: boolean
  score: number | null
}) {
  const normalizedScore = typeof score === 'number' && Number.isFinite(score)
    ? Math.max(0, Math.min(100, Math.round(score)))
    : null
  const progress = normalizedScore ?? 0
  const radiusPx = 39
  const circumference = 2 * Math.PI * radiusPx
  const dashOffset = circumference - (progress / 100) * circumference
  return (
    <View style={[styles.scoreSummary, reduceTransparency && styles.opaqueCard]} testID="worker-v5-score-ring">
      {!reduceTransparency ? <MintAura intensity="component" style={styles.scoreMintAura} /> : null}
      <View style={styles.scoreRing}>
        <Svg height={98} width={98} viewBox="0 0 98 98">
          <Defs>
            <LinearGradient id="worker-v5-score-gradient" x1="0" x2="1" y1="0" y2="1">
              <Stop offset={0} stopColor={color.mint.mint300} />
              <Stop offset={0.55} stopColor={color.brand.primary} />
              <Stop offset={1} stopColor={color.brand.primaryDark} />
            </LinearGradient>
          </Defs>
          <Circle cx={49} cy={49} r={radiusPx} fill="none" stroke="rgba(204,226,222,0.62)" strokeWidth={8} />
          <Circle
            cx={49}
            cy={49}
            r={radiusPx}
            fill="none"
            stroke="url(#worker-v5-score-gradient)"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            strokeWidth={8}
            transform="rotate(-90 49 49)"
          />
        </Svg>
        <View style={styles.scoreLens}>
          <Text style={styles.scoreValue} numberOfLines={1}>{normalizedScore != null ? normalizedScore : '—'}</Text>
          <Text style={styles.scoreLabel} numberOfLines={2}>{label}</Text>
        </View>
      </View>
      <Text style={styles.scoreCaption} numberOfLines={3}>{caption}</Text>
    </View>
  )
}

function AuthorityCard({ language, screen }: { language: AppLanguage; screen: WorkerV5ScreenDefinition }) {
  const guardrail = language === 'vi'
    ? screen.guardrail
    : workerV5EnglishGuardrails[screen.id] ?? 'Kael stays advisory; worker or system authority remains required.'
  return (
    <View style={styles.authorityCard} testID="worker-v5-authority-card">
      <Text style={styles.authorityLabel}>{language === 'vi' ? 'Ranh giới quyền' : 'Authority boundary'}</Text>
      <Text style={styles.authorityText}>{guardrail}</Text>
    </View>
  )
}

function InfoListCard({
  aura,
  children,
  reduceTransparency,
}: {
  aura?: 'accountSecurity' | 'demandMap'
  children: ReactNode
  reduceTransparency: boolean
}) {
  return (
    <View style={[styles.infoListCard, reduceTransparency && styles.opaqueCard]}>
      {!reduceTransparency ? <MintAura intensity="component" style={styles.listCardMintAura} testID="worker-v5-list-mint-aura" /> : null}
      {aura === 'demandMap' && !reduceTransparency ? (
        <WorkerV5CustomerMapMintAura
          scope="DemandMapInfoList"
          style={styles.demandMapInfoListAura}
          testID="worker-v5-demand-info-mint-aura"
        />
      ) : null}
      {aura === 'accountSecurity' && !reduceTransparency ? (
        <WorkerV5EarningsHomeListAura testID="worker-v5-account-security-mint-aura" />
      ) : null}
      {children}
    </View>
  )
}

function WorkerV5InfoRow({
  icon,
  label,
  reduceTransparency = false,
  value,
}: {
  icon: WorkerV5IconName
  label: string
  reduceTransparency?: boolean
  value: string
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIconShell} testID="worker-v5-info-icon-shell">
        {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
        <Image
          resizeMode="contain"
          source={workerV5Icons[icon]}
          style={[
            styles.infoIcon,
            WORKER_V5_PROFILE_ICON_VISUAL_BOOST.has(icon) ? styles.profileRouteIconVisualBoost : null,
          ]}
          testID="worker-v5-info-icon"
        />
      </View>
      <View style={styles.infoTextColumn}>
        <Text style={styles.infoLabel} numberOfLines={2}>{label}</Text>
        <Text style={styles.infoValue} numberOfLines={2}>{value}</Text>
      </View>
    </View>
  )
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricTile}>
      <View pointerEvents="none" style={styles.cardTopHighlight} />
      <Text style={styles.metricLabel} numberOfLines={2}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={2}>{value}</Text>
    </View>
  )
}

function WorkerV5ReliabilityStatTile({ label, testID, value }: { label: string; testID: string; value: string }) {
  return (
    <View style={styles.reliabilityStatTile} testID={testID}>
      <View pointerEvents="none" style={styles.cardTopHighlight} />
      <Text style={styles.reliabilityStatValue} numberOfLines={1} testID={`${testID}-value`}>{value}</Text>
      <Text style={styles.reliabilityStatLabel} numberOfLines={2} testID={`${testID}-label`}>{label}</Text>
    </View>
  )
}

function WorkerV5NavButton({
  disabled,
  label,
  onPress,
  primary,
}: {
  disabled: boolean
  label: string
  onPress: () => void
  primary?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.navButton,
        primary ? styles.navButtonPrimary : styles.navButtonSecondary,
        disabled && styles.navButtonDisabled,
        pressed && !disabled ? styles.pressed : null,
      ]}
      testID={primary ? 'worker-v5-next' : 'worker-v5-previous'}
    >
      <Text style={[styles.navButtonText, primary && styles.navButtonPrimaryText, disabled && styles.navButtonDisabledText]}>{label}</Text>
    </Pressable>
  )
}

type WorkerV5PrimaryAction = {
  disabled: boolean
  label: string
  onPress: () => void
}

function WorkerV5PrimaryButtonFill({
  disabled,
  variant = 'default',
}: {
  disabled: boolean
  variant?: 'default' | 'source'
}) {
  if (disabled) return null
  const gradient = variant === 'source'
    ? ['#2DD4BF', '#20CDB9', '#12BCAA', '#069889', '#008579'] as const
    : component.button.primary.gradient
  const gradientStops = variant === 'source'
    ? [0, 0.28, 0.52, 0.78, 1] as const
    : component.button.primary.gradientStops
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 100 56" preserveAspectRatio="none" testID="worker-v5-primary-gradient">
      <Defs>
        <LinearGradient
          id={`worker-v5-primary-gradient-fill-${variant}`}
          x1="0"
          x2="1"
          y1="0"
          y2={variant === 'source' ? '0' : '1'}
        >
          {gradient.map((stopColor, index) => (
            <Stop key={stopColor} offset={gradientStops[index]} stopColor={stopColor} />
          ))}
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100" height="56" rx={variant === 'source' ? '0' : '26'} fill={`url(#worker-v5-primary-gradient-fill-${variant})`} />
    </Svg>
  )
}

function getWorkerV5PrimaryAction(
  screen: WorkerV5ScreenDefinition,
  runtime: WorkerV5Runtime,
  language: AppLanguage,
  busy: boolean,
  runWorkerAction: (action: () => Promise<boolean>) => void,
  navigateNext: () => void,
): WorkerV5PrimaryAction | null {
  const hasDeal = Boolean(runtime.state.deal)
  switch (screen.id) {
    case '1.2-shift-brief':
      return {
        disabled: busy,
        label: textByLanguage(language, 'Xem bản đồ cơ hội', 'View opportunity map'),
        onPress: navigateNext,
      }
    case '1.3-demand-map':
      return {
        disabled: busy,
        label: textByLanguage(language, 'Tối ưu việc làm', 'Optimize work'),
        onPress: navigateNext,
      }
    case '1.4-smart-schedule':
      return {
        disabled: busy,
        label: textByLanguage(language, 'Mở hộp thư cơ hội', 'Open opportunity inbox'),
        onPress: navigateNext,
      }
    case '2.1-opportunity-inbox':
      return {
        disabled: !hasDeal || busy,
        label: textByLanguage(language, 'Mở đề nghị thật', 'Open real offer'),
        onPress: navigateNext,
      }
    case '2.2-offer-detail':
      return {
        disabled: busy,
        label: textByLanguage(language, 'Tiếp tục nhận việc', 'Continue to accept'),
        onPress: navigateNext,
      }
    case '2.3-accept-review':
      return {
        disabled: !runtime.state.deal?.broadcast || busy,
        label: busy ? textByLanguage(language, 'Đang xác nhận', 'Confirming') : textByLanguage(language, 'Xác nhận nhận việc', 'Confirm job'),
        onPress: () => runWorkerAction(runtime.actions.workerAcceptBroadcast),
      }
    case '2.4-route-eta':
      return {
        disabled: !hasDeal || busy,
        label: busy ? textByLanguage(language, 'Đang cập nhật', 'Updating') : textByLanguage(language, 'Bắt đầu di chuyển', 'Start travel'),
        onPress: () => runWorkerAction(() => runtime.actions.workerUpdateStatus('worker_on_way')),
      }
    case '2.5-arrival-checkin':
      return {
        disabled: !hasDeal || busy,
        label: busy ? textByLanguage(language, 'Đang ghi nhận đến nơi', 'Checking in') : textByLanguage(language, 'Ghi nhận đến điểm hẹn', 'Check in on site'),
        onPress: () => runWorkerAction(() => runtime.actions.workerUpdateStatus('arrived')),
      }
    case '2.7-in-progress':
      return {
        disabled: !hasDeal || busy,
        label: textByLanguage(language, 'Chuẩn bị hồ sơ hoàn tất', 'Prepare completion artifact'),
        onPress: navigateNext,
      }
    case '2.8-scope-change':
      return {
        disabled: !runtime.state.deal?.scopeChange || busy,
        label: textByLanguage(language, 'Gửi đề xuất phạm vi', 'Submit scope proposal'),
        onPress: navigateNext,
      }
    case '2.9-approval-wait':
      return {
        disabled: busy,
        label: textByLanguage(language, 'Chờ khách phê duyệt', 'Waiting for customer approval'),
        onPress: navigateNext,
      }
    case '2.10-completion-evidence': {
      return {
        disabled: busy,
        label: textByLanguage(language, 'Gửi hồ sơ hoàn tất', 'Submit completion artifact'),
        onPress: navigateNext,
      }
    }
    case '3.1-kael-chat-normal':
      return {
        disabled: busy,
        label: textByLanguage(language, 'Tìm cơ hội cùng Kael', 'Find work with Kael'),
        onPress: navigateNext,
      }
    case '3.2-kael-job-intake':
      return {
        disabled: !hasDeal || busy,
        label: textByLanguage(language, 'Mở đề nghị thật', 'Open real offer'),
        onPress: navigateNext,
      }
    case '4.2-ledger-detail':
      return {
        disabled: busy,
        label: textByLanguage(language, 'Mở yêu cầu rút tiền', 'Open payout request'),
        onPress: navigateNext,
      }
    case '4.3-payout-request':
      return {
        disabled: busy,
        label: textByLanguage(language, 'Xem tài khoản nhận tiền', 'Review payout account'),
        onPress: navigateNext,
      }
    case '4.4-payout-method':
      return {
        disabled: busy,
        label: textByLanguage(language, 'Quay lại yêu cầu rút tiền', 'Back to payout request'),
        onPress: navigateNext,
      }
    case '5.1-profile-overview':
      return {
        disabled: busy,
        label: textByLanguage(language, 'Xem xếp hạng thợ', 'Open worker ranking'),
        onPress: navigateNext,
      }
    case '5.2-worker-ranking':
      return {
        disabled: busy,
        label: textByLanguage(language, 'Xem độ tin cậy', 'Open reliability insights'),
        onPress: navigateNext,
      }
    case '5.3-skills-service-area':
      return {
        disabled: busy,
        label: textByLanguage(language, 'Quay lại hồ sơ', 'Back to profile'),
        onPress: navigateNext,
      }
    case '5.4-reliability-insights':
      return {
        disabled: busy,
        label: textByLanguage(language, 'Quay lại xếp hạng', 'Back to ranking'),
        onPress: navigateNext,
      }
    case '5.5-account-utilities':
      return {
        disabled: busy,
        label: textByLanguage(language, 'Quay lại hồ sơ', 'Back to profile'),
        onPress: navigateNext,
      }
    case '5.6-agent-memory-preferences':
      return {
        disabled: busy,
        label: textByLanguage(language, 'Quay lại hồ sơ', 'Back to profile'),
        onPress: navigateNext,
      }
    case '5.7-verification-documents':
      return {
        disabled: busy,
        label: textByLanguage(language, 'Xem ngân hàng và thuế', 'Open bank and tax center'),
        onPress: navigateNext,
      }
    case '5.8-bank-tax-center':
      return {
        disabled: busy,
        label: textByLanguage(language, 'Quay lại cài đặt', 'Back to settings'),
        onPress: navigateNext,
      }
    case '5.9-reviews-feedback':
      return {
        disabled: busy,
        label: textByLanguage(language, 'Quay lại xếp hạng', 'Back to ranking'),
        onPress: navigateNext,
      }
    case '5.10-support-settings':
      return {
        disabled: busy,
        label: textByLanguage(language, 'Quay lại hồ sơ', 'Back to profile'),
        onPress: navigateNext,
      }
    default:
      return null
  }
}

function WorkerV5PrimaryActionButton({
  disabled,
  label,
  onPress,
  variant = 'default',
}: {
  disabled: boolean
  label: string
  onPress: () => void
  variant?: 'default' | 'source'
}) {
  const usesSourceTone = variant === 'source'
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryActionButton,
        usesSourceTone && styles.primaryActionButtonSource,
        disabled && (usesSourceTone ? styles.sourceActionDisabled : styles.navButtonDisabled),
        pressed && !disabled ? styles.pressed : null,
      ]}
      testID="worker-v5-primary-action"
    >
      <WorkerV5PrimaryButtonFill disabled={disabled && !usesSourceTone} variant={variant} />
      {!disabled && !usesSourceTone ? <View pointerEvents="none" style={styles.primaryActionTopHighlight} /> : null}
      <Text style={[styles.primaryActionText, disabled && !usesSourceTone && styles.navButtonDisabledText]}>{label}</Text>
    </Pressable>
  )
}

function buildHeroLine(screen: WorkerV5ScreenDefinition, runtime: WorkerV5Runtime, language: AppLanguage) {
  const deal = runtime.state.deal
  switch (screen.id) {
    case '1.1-worker-home':
      return runtime.workerProfile?.legal_name
        ? textByLanguage(language, `Chào ${runtime.workerProfile.legal_name.trim()}`, `Hello ${runtime.workerProfile.legal_name.trim()}`)
        : textByLanguage(language, 'Chào bạn, giải quyết công việc đã sẵn sàng', 'Your work resolution is ready')
    case '1.2-shift-brief':
      return runtime.workerProfile?.is_available
        ? textByLanguage(language, 'Bạn dang mở nhận việc', 'You are accepting jobs')
        : textByLanguage(language, 'Bạn chua mở nhận việc', 'You are not accepting jobs')
    case '1.3-demand-map':
      return deal
        ? textByLanguage(language, 'Có một việc thật trong vùng làm việc', 'One real work item is in your work area')
        : textByLanguage(language, 'Chờ dữ liệu cơ hội thật', 'Waiting for real opportunity data')
    case '1.4-smart-schedule':
      return deal
        ? textByLanguage(language, 'Kael chỉ sắp xếp dựa trên việc hiện tại', 'Kael sequences only the current work')
        : textByLanguage(language, 'Chưa đủ dữ liệu để tối ưu lịch', 'Not enough data to optimize the schedule')
    case '2.1-opportunity-inbox':
      return deal
        ? textByLanguage(language, 'Có đề nghị hoặc việc đang cần xử lý', 'A real offer or work item needs attention')
        : textByLanguage(language, 'Hộp thư cơ hội đang trống', 'Opportunity inbox is empty')
    case '2.2-offer-detail':
      return deal
        ? textByLanguage(language, 'Xem kỹ đề nghị trước khi quyết định', 'Review the offer before deciding')
        : textByLanguage(language, 'Chưa có đề nghị để mở', 'No offer to open')
    case '2.3-accept-review':
      return textByLanguage(language, 'Bạn là người quyết định nhận việc', 'You decide whether to accept')
    case '2.4-route-eta':
      return deal
        ? textByLanguage(language, 'Cập nhật di chuyển từ việc hiện tại', 'Travel updates use the current work')
        : textByLanguage(language, 'Chưa có việc dang di chuyển', 'No en-route work')
    case '2.5-arrival-checkin':
      return textByLanguage(language, 'Đến nơi tạo mốc việc chính thức', 'Check-in creates the official work milestone')
    case '2.7-in-progress':
      return deal
        ? textByLanguage(language, 'Đang xử lý việc thật', 'Working on the real work')
        : textByLanguage(language, 'Chưa có việc dang làm', 'No in-progress work')
    case '2.8-scope-change':
      return textByLanguage(language, 'Đổi phạm vi cần bằng chứng và lý do rõ', 'Scope change needs evidence and a clear reason')
    case '2.9-approval-wait':
      return textByLanguage(language, 'Chờ NestScout cập nhật quyết định', 'Waiting for NestScout to update the decision')
    case '2.10-completion-evidence':
      return textByLanguage(language, 'Gửi hồ sơ khi bằng chứng đã đủ', 'Submit only when evidence is ready')
    case '2.11-completion-submitted':
      return textByLanguage(language, 'Hồ sơ đã gửi thì chờ xác nhận thật', 'After submission, wait for real confirmation')
    case '2.12-case-closed':
      return deal
        ? textByLanguage(language, 'Việc đã có trạng thái kết thúc thật', 'The work has a real closing state')
        : textByLanguage(language, 'Chưa có việc đã đóng', 'No closed work')
    case '3.1-kael-chat-normal':
      return textByLanguage(language, 'Kael hỗ trợ nhanh ngoài quyết định việc', 'Kael supports quick advisory outside work decisions')
    case '3.2-kael-job-intake':
      return deal
        ? textByLanguage(language, 'Kael giải thích cơ hội dang có', 'Kael explains the current opportunity')
        : textByLanguage(language, 'Chưa có cơ hội thật để lọc', 'No real opportunity to filter')
    case '4.1-earnings-overview':
      return runtime.workerEarnings?.net_earnings
        ? textByLanguage(language, 'Thu nhập đã đối soát', 'Settled earnings')
        : textByLanguage(language, 'Chưa có dữ liệu thu nhập thật', 'No real earnings data yet')
    case '4.2-ledger-detail':
      return textByLanguage(language, 'Chi tiết đối soát đã ghi nhận', 'Recorded ledger detail')
    case '4.3-payout-request':
      return textByLanguage(language, 'Rút tiền cần tài khoản xác minh', 'Payout needs a verified account')
    case '4.4-payout-method':
      return textByLanguage(language, 'Quản lý tài khoản nhận tiền', 'Manage payout account')
    case '5.1-profile-overview':
      return runtime.workerProfile?.legal_name || textByLanguage(language, 'Hồ sơ thợ', 'Worker profile')
    case '5.2-worker-ranking':
      return runtime.workerPerformanceInsights?.performance_score != null
        ? textByLanguage(language, 'Có dữ liệu hiệu suất thật', 'Real performance insight is available')
        : textByLanguage(language, 'Chưa đủ dữ liệu xếp hạng', 'Not enough ranking data')
    case '5.3-skills-service-area':
      return runtime.workerProfile?.service_types?.length
        ? textByLanguage(language, 'Kỹ năng và khu vực lấy từ hồ sơ thật', 'Skills and areas come from the real profile')
        : textByLanguage(language, 'Chưa có kỹ năng đã duyệt', 'No approved skills yet')
    case '5.4-reliability-insights':
      return runtime.workerPerformanceInsights?.performance_score != null
        ? textByLanguage(language, 'Độ tin cậy có dữ liệu hiệu suất', 'Reliability has performance data')
        : textByLanguage(language, 'Chưa đủ tín hiệu độ tin cậy', 'Not enough reliability signal')
    case '5.5-account-utilities':
      return textByLanguage(language, 'Cài đặt tài khoản trong ứng dụng', 'In-app account settings')
    case '5.6-agent-memory-preferences':
      return textByLanguage(language, 'Kael nhớ theo quyền bạn cho', 'Kael remembers only what you allow')
    case '5.7-verification-documents':
      return workerDocumentSummary(runtime.workerProfile, language)
    case '5.8-bank-tax-center':
      return runtime.workerProfile?.bank_account_masked
        ? textByLanguage(language, 'Có tài khoản nhận tiền đã ghi nhận', 'A payout account is recorded')
        : textByLanguage(language, 'Chưa có tài khoản nhận tiền đã xác minh', 'No verified payout account')
    case '5.9-reviews-feedback':
      return runtime.workerPerformanceInsights?.review_count
        ? textByLanguage(language, 'Có dữ liệu phản hồi tổng hợp', 'Aggregate feedback data is available')
        : textByLanguage(language, 'Chưa có phản hồi thật', 'No real feedback yet')
    case '5.10-support-settings':
      return textByLanguage(language, 'Cài đặt tài khoản trong ứng dụng', 'In-app account settings')
    default:
      return screen.title[language]
  }
}

function buildHeroBody(screen: WorkerV5ScreenDefinition, runtime: WorkerV5Runtime, language: AppLanguage) {
  const deal = runtime.state.deal
  switch (screen.id) {
    case '1.1-worker-home':
      return textByLanguage(
        language,
        'Tổng quan dùng hồ sơ thợ, trạng thái nhận việc và việc thật đã đồng bộ.',
        'Overview uses synced worker profile, availability, and real work state.',
      )
    case '1.2-shift-brief':
      return textByLanguage(
        language,
        'Bản tin chỉ tóm tắt điều kiện đã biết: dịch vụ, khu vực, xác minh và cảnh báo bắt buộc.',
        'The brief summarizes known readiness: services, areas, verification, and required cautions.',
      )
    case '1.3-demand-map':
      return textByLanguage(
        language,
        'Bản đồ ưu tiên chỉ hiện nhu cầu đã xác thực; điểm việc xuất hiện khi có việc thật.',
        'The map shows verified demand only; a job marker appears when the current state has a real job.',
      )
    case '1.4-smart-schedule':
      return textByLanguage(
        language,
        'Lịch đề xuất giữ Kael ở vai trò tư vấn; mọi nhận việc hoặc đổi lịch vẫn cần thợ xác nhận.',
        'The schedule keeps Kael advisory; accepting or changing work still requires the worker.',
      )
    case '2.1-opportunity-inbox':
      return textByLanguage(
        language,
        'Inbox chỉ hiển thị cơ hội đã được NestScout gửi tới thợ để mở chi tiết.',
        'The inbox shows only opportunities NestScout has sent to the worker.',
      )
    case '2.2-offer-detail':
      return textByLanguage(
        language,
        'Chi tiết đề nghị giữ thông tin nhạy cảm theo trạng thái việc và không tự nhận việc.',
        'Offer details respect work-state privacy and never accept work on their own.',
      )
    case '2.3-accept-review':
      return textByLanguage(
        language,
        'Nút xác nhận gửi đúng hành động nhận đề nghị của thợ; Kael chỉ kiểm tra và giải thích.',
        'The confirm button uses the worker offer-accept action; Kael only checks and explains.',
      )
    case '2.4-route-eta':
      return textByLanguage(
        language,
        'Di chuyển cập nhật qua quy trình NestScout để khách nhận tín hiệu đúng, không tự hứa thời gian đến mới.',
        'Travel updates through NestScout so customers get accurate signals without a new ETA promise.',
      )
    case '2.5-arrival-checkin':
      return textByLanguage(
        language,
        'Đến nơi là hành động rõ của thợ, gắn với vùng vị trí hoặc bằng chứng thủ công.',
        'Check-in is an explicit worker action tied to geofence or manual evidence.',
      )
    case '2.7-in-progress':
      return textByLanguage(
        language,
        'Tiến độ và bằng chứng bám việc hiện tại; thợ không nhập giá trực tiếp tại màn này.',
        'Progress and evidence follow the current work; workers do not enter prices on this screen.',
      )
    case '2.8-scope-change':
      return textByLanguage(
        language,
        'Kael có thể hỗ trợ soạn nháp, nhưng thợ phải kiểm tra nội dung và bằng chứng trước khi gửi.',
        'Kael can draft, but the worker must review content and evidence before sending.',
      )
    case '2.9-approval-wait':
      return textByLanguage(
        language,
        'Chỉ làm phần phát sinh sau khi NestScout duyệt.',
        'This screen does not approve work; extra work continues only after NestScout has a real decision.',
      )
    case '2.10-completion-evidence':
      return textByLanguage(
        language,
        'Hồ sơ hoàn tất cần ảnh hoặc ghi chú thật trước khi gửi.',
        'Completion artifacts need real photos or notes before submission.',
      )
    case '2.11-completion-submitted':
      return textByLanguage(
        language,
        'Màn này chỉ theo dõi hồ sơ đã gửi và đối soát thật, không tự xác nhận thanh toán.',
        'This screen tracks real submission and settlement state; it does not confirm payment.',
      )
    case '2.12-case-closed':
      return textByLanguage(
        language,
        'Việc đã đóng chỉ hiển thị dấu vết và số đối soát đã ghi nhận từ hệ thống.',
        'Closed work shows only system-recorded trail and ledger data.',
      )
    case '3.1-kael-chat-normal':
      return textByLanguage(
        language,
        'Chat thường không ghi quyết định vào việc; mọi hành động theo đơn phải chuyển về màn có thẩm quyền.',
        'General chat does not write work decisions; work actions move to the authorized surface.',
      )
    case '3.2-kael-job-intake':
      return textByLanguage(
        language,
        'Kael có thể lọc cơ hội và giải thích đánh đổi, nhưng không tự nhận việc thay thợ.',
        'Kael can filter opportunities and explain trade-offs, but it never accepts work for the worker.',
      )
    case '4.1-earnings-overview':
      return textByLanguage(
        language,
        'Thu nhập đọc từ dữ liệu thu nhập thợ thật; nếu trống sẽ hiển thị trạng thái trống an toàn.',
        'Earnings read from real settlement records; empty data stays honest.',
      )
    case '4.2-ledger-detail':
      return textByLanguage(
        language,
        'Chi tiết đối soát không tự mở tiền rút; chỉ trình bày số đã có trong dữ liệu thu nhập.',
        'Ledger detail does not unlock payout; it only presents recorded earnings data.',
      )
    case '4.3-payout-request':
      return textByLanguage(
        language,
        'Màn này không tự gửi yêu cầu rút tiền; luồng ví thu nhập hiện hữu xử lý giao dịch thật.',
        'This screen does not submit payout; the existing income wallet handles real transactions.',
      )
    case '4.4-payout-method':
      return textByLanguage(
        language,
        'Thông tin ngân hàng chỉ hiện từ hồ sơ thật; thay đổi tài khoản cần xác minh.',
        'Bank data appears only from the real profile; account changes require verification.',
      )
    case '5.1-profile-overview':
      return textByLanguage(
        language,
        'Hồ sơ dùng tên, dịch vụ, khu vực và trạng thái xác minh thật từ hồ sơ thợ.',
        'Profile uses real name, services, areas, and verification state from the worker profile.',
      )
    case '5.2-worker-ranking':
      return textByLanguage(
        language,
        'Xếp hạng không tạo top phần trăm; chỉ dùng dữ liệu hiệu suất hoặc trạng thái trống.',
        'Ranking does not invent top percentiles; it uses performance insight or an honest empty state.',
      )
    case '5.3-skills-service-area':
      return textByLanguage(
        language,
        'Màn kỹ năng và khu vực chỉ trình bày dịch vụ, chuyên môn, quận và bán kính đã có trong hồ sơ thợ.',
        'Skills and service area show only services, specializations, districts, and radius from the worker profile.',
      )
    case '5.4-reliability-insights':
      return textByLanguage(
        language,
        'Độ tin cậy đọc từ dữ liệu hiệu suất thật; thiếu insight thì giả trạng thái trống thay vì đếng điểm đẹp.',
        'Reliability reads real performance insights; missing insight stays empty instead of inventing a score.',
      )
    case '5.5-account-utilities':
      return textByLanguage(
        language,
        'Cài đặt tài khoản gom thông tin cá nhân, bảo mật đăng nhập, ngôn ngữ và quyền bộ nhớ Kael.',
        'Account settings gather profile details, login security, language, and Kael memory permission.',
      )
    case '5.6-agent-memory-preferences':
      return textByLanguage(
        language,
        'Bộ nhớ Kael dùng hồ sơ hiện có làm ngữ cảnh đọc, không lưu ưu tiên mới trong màn này.',
        'Kael memory uses the current profile as read-only context and does not save new preferences in this v5 shell.',
      )
    case '5.7-verification-documents':
      return textByLanguage(
        language,
        'Giấy tờ & xác minh phản ánh CCCD, ảnh đại diện, trạng thái duyệt và hồ sơ chuyên môn đã có thật.',
        'Verification documents reflect the real ID, selfie, approval status, and declared skill profile.',
      )
    case '5.8-bank-tax-center':
      return textByLanguage(
        language,
        'Ngân hàng và thuế trình bày tài khoản nhận tiền và đối soát đã đồng bộ; giao dịch thật vẫn do hệ thống xử lý.',
        'Bank and tax center shows synced payout account and settlement records; real transactions remain system-handled.',
      )
    case '5.9-reviews-feedback':
      return textByLanguage(
        language,
        'Đánh giá không dựng lời khách; màn này chỉ đọc điểm, số lượt và tín hiệu hiệu suất đã có.',
        'Reviews do not fabricate customer quotes; this screen reads only rating, counts, and available performance signals.',
      )
    case '5.10-support-settings':
      return textByLanguage(
        language,
        'Cài đặt tài khoản gom thông tin cá nhân, bảo mật đăng nhập, ngôn ngữ và quyền bộ nhớ Kael.',
        'Account settings gather profile details, login security, language, and Kael memory permission.',
      )
    default:
      return ''
  }
}

function buildDealSummary(deal: LocalDeal | null, language: AppLanguage) {
  if (!deal) return textByLanguage(language, 'Chưa có việc', 'No work')
  const service = localizedServiceLabel(deal.draft.serviceType, language)
  const area = deal.draft.districtLabel || textByLanguage(language, 'chưa rõ khu vực', 'unknown area')
  return `${service} · ${area} · ${localizedStatusLabel(deal.status, language)}`
}

function buildWorkerV5ShiftSummaryCopy(
  profile: WorkerV5Runtime['workerProfile'],
  deal: LocalDeal | null,
  language: AppLanguage,
) {
  if (deal?.broadcast?.status === 'sent') {
    return {
      kicker: textByLanguage(language, 'CƠ HỘI THẬT', 'REAL OPPORTUNITY'),
      meta: buildDealSummary(deal, language),
      title: textByLanguage(language, 'Có cơ hội cần xem', 'Opportunity needs review'),
    }
  }

  if (deal) {
    return {
      meta: buildDealSummary(deal, language),
      title: localizedStatusLabel(deal.status, language),
    }
  }

  if (!profile) {
    return {
      meta: textByLanguage(language, 'Đang nhập tài khoản thợ để tải dữ liệu thật', 'Sign in as a worker to load live data'),
      title: textByLanguage(language, 'Chưa có hồ sơ thợ', 'No worker profile'),
    }
  }

  if (profile.is_suspended) {
    return {
      meta: workerVerificationLabel(profile.verification_status, language),
      title: textByLanguage(language, 'Hồ sơ đang bị tạm ngưng', 'Profile is suspended'),
    }
  }

  if (!profile.is_approved) {
    return {
      meta: workerDocumentSummary(profile, language),
      title: workerVerificationLabel(profile.verification_status, language),
    }
  }

  if (!profile.is_available) {
    return {
      meta: workerV5ShiftProfileCoverageLabel(profile, language),
      title: textByLanguage(language, 'Đang tắt nhận cơ hội', 'Opportunity receiving is off'),
    }
  }

  return {
    meta: workerV5ShiftProfileCoverageLabel(profile, language),
    title: textByLanguage(language, 'Đang mở nhận cơ hội', 'Open for opportunities'),
  }
}

function buildWorkerV5ShiftDemandRow(
  profile: WorkerV5Runtime['workerProfile'],
  deal: LocalDeal | null,
  language: AppLanguage,
) {
  if (deal?.broadcast?.status === 'sent') {
    return {
      icon: 'map' as const,
      meta: buildDealSummary(deal, language),
      status: textByLanguage(language, 'Có tín hiệu', 'Signal'),
      title: deal.broadcast.generalArea
        ? textByLanguage(language, `${deal.broadcast.generalArea} có nhu cầu`, `${deal.broadcast.generalArea} has demand`)
        : textByLanguage(language, 'Có cơ hội thật', 'Real opportunity'),
    }
  }

  if (deal) {
    return {
      icon: 'map' as const,
      meta: buildDealSummary(deal, language),
      status: textByLanguage(language, 'Có việc', 'Active'),
      title: localizedStatusLabel(deal.status, language),
    }
  }

  return {
    icon: 'map' as const,
    meta: textByLanguage(language, 'Chỉ hiện mức nhu cầu khi NestScout có tín hiệu đã xác thực', 'Demand appears only with verified NestScout signals'),
    status: textByLanguage(language, 'Chờ', 'Waiting'),
    title: profile?.districts?.length
      ? textByLanguage(language, `${formatWorkerDistrict(profile.districts[0], language)} trong phạm vi`, `${formatWorkerDistrict(profile.districts[0], language)} in range`)
      : textByLanguage(language, 'Chưa có vùng nhu cầu', 'No demand area'),
  }
}

function buildWorkerV5ClientMissionRows(deal: LocalDeal | null, language: AppLanguage) {
  if (!deal) {
    return [
      {
        icon: 'jobs' as const,
        meta: textByLanguage(language, 'Chỉ hiển thị khi có yêu cầu thật từ khách', 'Shown only when a real client request exists'),
        status: textByLanguage(language, 'Chờ', 'Waiting'),
        title: textByLanguage(language, 'Chưa có nhiệm vụ từ khách', 'No client mission yet'),
      },
      {
        icon: 'map' as const,
        meta: textByLanguage(language, 'Đợi khách gửi yêu cầu có điểm hẹn thật', 'Waiting for a client request with a real appointment'),
        status: textByLanguage(language, 'Chưa có', 'None'),
        title: textByLanguage(language, 'Chưa có điểm hẹn', 'No appointment point'),
      },
    ]
  }

  const service = localizedServiceLabel(deal.draft.serviceType, language)
  const problem = deal.broadcast?.problemSummary || deal.draft.problemChips[0] || deal.draft.description
  const destination = routeDestinationLabel(deal, language)
  const addressOpen = canShowWorkerAddress(deal)

  return [
    {
      icon: 'jobs' as const,
      meta: problem,
      status: deal.broadcast?.status === 'sent'
        ? textByLanguage(language, 'Cần xem', 'Review')
        : localizedStatusLabel(deal.status, language),
      title: service,
    },
    {
      icon: addressOpen ? 'map' as const : 'shield' as const,
      meta: destination,
      status: addressOpen
        ? textByLanguage(language, 'Đã mở', 'Open')
        : textByLanguage(language, 'Ẩn chi tiết', 'Hidden'),
      title: addressOpen
        ? textByLanguage(language, 'Điểm hẹn của khách', 'Client appointment')
        : textByLanguage(language, 'Điểm hẹn chưa mở', 'Appointment locked'),
    },
  ]
}

function workerV5ShiftProfileCoverageLabel(profile: WorkerV5Runtime['workerProfile'], language: AppLanguage) {
  if (!profile) return textByLanguage(language, 'Chưa có hồ sơ thợ', 'No worker profile')
  const serviceCount = profile.service_types.length
  const districtCount = profile.districts.length
  if (serviceCount > 0 && districtCount > 0) {
    return textByLanguage(language, `${serviceCount} dịch vụ · ${districtCount} khu vực`, `${serviceCount} services · ${districtCount} areas`)
  }
  if (serviceCount > 0) return textByLanguage(language, `${serviceCount} dịch vụ đã duyệt`, `${serviceCount} approved services`)
  if (districtCount > 0) return textByLanguage(language, `${districtCount} khu vực phục vụ`, `${districtCount} service areas`)
  return textByLanguage(language, 'Chưa có dịch vụ hoặc khu vực đã duyệt', 'No approved services or areas')
}

function localizedWorkerBriefLines(lines: readonly string[] | null | undefined, language: AppLanguage) {
  const normalized = (lines ?? []).map((line) => line.trim()).filter(Boolean)
  const localized = normalized.filter((line) => {
    const hasVietnameseText = /[\u00C0-\u1EF9]/.test(line)
    if (language === 'en') return !hasVietnameseText
    return hasVietnameseText
  })
  return (localized.length ? localized : normalized).slice(0, 3)
}

function workerV5HomeDisplayName(profile: WorkerV5Runtime['workerProfile'], language: AppLanguage) {
  const name = profile?.legal_name?.trim().replace(/\s+/g, ' ')
  if (name) return name
  return textByLanguage(language, 'Anh thợ', 'Worker')
}

function workerV5ChatGreetingName(profile: WorkerV5Runtime['workerProfile'], language: AppLanguage) {
  const name = profile?.legal_name?.trim().replace(/\s+/g, ' ')
  if (name) return name
  return textByLanguage(language, 'bạn', 'there')
}

function workerV5Initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  return words.slice(0, 2).map((word) => word.charAt(0).toUpperCase()).join('')
}

function workerV5TimeChoiceLabel(value: string | null | undefined, language: AppLanguage) {
  if (value === 'now') return textByLanguage(language, 'Ngay', 'Now')
  if (value === 'scheduled') return textByLanguage(language, 'Đã hẹn', 'Scheduled')
  return textByLanguage(language, 'Theo don', 'By work')
}

function canShowWorkerAddress(deal: LocalDeal) {
  return [
    'worker_matched',
    'worker_on_way',
    'arrived',
    'inspecting',
    'repairing',
    'scope_change_pending',
    'completed_by_worker',
    'confirmed_by_customer',
    'reviewed',
  ].includes(deal.status)
}

function getWorkerV5ChatJobId(deal: LocalDeal | null) {
  return deal?.broadcast?.jobId ?? deal?.id ?? null
}

function routeDestinationLabel(deal: LocalDeal, language: AppLanguage) {
  if (canShowWorkerAddress(deal)) return deal.draft.addressLabel || deal.draft.districtLabel || textByLanguage(language, 'Chưa có địa chỉ', 'No address')
  return deal.broadcast?.generalArea || deal.draft.districtLabel || textByLanguage(language, 'Địa chỉ đang ẩn', 'Address hidden')
}

function buildKnownCaseEvents(deal: LocalDeal | null, language: AppLanguage) {
  if (!deal) return [textByLanguage(language, 'Chưa có dòng sự kiện việc', 'No work timeline yet')]
  const events = [
    textByLanguage(language, 'Việc được tạo trong NestScout', 'Work created in NestScout'),
  ]
  if (canShowWorkerAddress(deal)) events.push(textByLanguage(language, 'Thợ đã nhận việc', 'Worker accepted the work'))
  if (['arrived', 'inspecting', 'repairing', 'scope_change_pending', 'completed_by_worker', 'confirmed_by_customer', 'reviewed'].includes(deal.status)) {
    events.push(textByLanguage(language, 'Thợ đã đến nơi hoặc bắt đầu kiểm tra', 'Worker checked in or started inspection'))
  }
  if (deal.scopeChange) events.push(textByLanguage(language, 'Có yêu cầu đổi phạm vi', 'Scope-change request exists'))
  if (deal.completionNotes || deal.completionPhotoUrls?.length) events.push(textByLanguage(language, 'Có bằng chứng hoàn tất', 'Completion evidence exists'))
  if (['completed_by_worker', 'confirmed_by_customer', 'reviewed'].includes(deal.status)) events.push(textByLanguage(language, 'Hồ sơ hoàn tất đã gửi', 'Completion artifact submitted'))
  return events
}

function workerStatusStage(status: LocalDeal['status'] | null | undefined) {
  const total = 5
  let current = 0
  switch (status) {
    case 'broadcasting':
    case 'awaiting_customer_confirm':
    case 'worker_matched':
      current = 1
      break
    case 'worker_on_way':
    case 'arrived':
      current = 2
      break
    case 'inspecting':
    case 'repairing':
      current = 3
      break
    case 'scope_change_pending':
      current = 4
      break
    case 'completed_by_worker':
    case 'confirmed_by_customer':
    case 'reviewed':
      current = 5
      break
    default:
      current = 0
  }

  return {
    current,
    progress: Math.round((current / total) * 100),
    total,
  }
}

function formatScopePriceRange(scope: LocalDeal['scopeChange'], language: AppLanguage) {
  if (!scope?.priceMin || !scope?.priceMax) {
    return '0'
  }
  const min = formatVnd(scope.priceMin, language)
  const max = formatVnd(scope.priceMax, language)
  return `${min} - ${max}`
}

function scopeChangeDeltaLabel(deal: LocalDeal | null, scope: LocalDeal['scopeChange'], language: AppLanguage) {
  if (!scope) return textByLanguage(language, 'Chưa có phát sinh', 'No delta')
  const originalMin = firstNumberFromPriceLabel(deal?.estimate?.priceRangeLabel)
  if (!originalMin || !scope.priceMin) return formatScopePriceRange(scope, language)
  const delta = Math.max(0, scope.priceMin - originalMin)
  if (delta <= 0) return formatScopePriceRange(scope, language)
  return `+${formatVnd(delta, language)}`
}

function scopeChangeApprovalAmountLabel(deal: LocalDeal | null, scope: LocalDeal['scopeChange'], language: AppLanguage) {
  if (!scope?.priceMin) return textByLanguage(language, 'Chờ dữ liệu thật', 'Waiting for real data')
  const originalMin = firstNumberFromPriceLabel(deal?.estimate?.priceRangeLabel)
  const amount = originalMin ? Math.max(0, scope.priceMin - originalMin) : scope.priceMin
  if (amount <= 0) return formatApprovalVnd(scope.priceMin, language)
  return `+${formatApprovalVnd(amount, language)}`
}

function formatApprovalVnd(value: number, language: AppLanguage) {
  const locale = language === 'vi' ? 'vi-VN' : 'en-US'
  const formatted = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)
  return textByLanguage(language, `${formatted}đ`, `${formatted} VND`)
}

function formatScopeEventTime(value: string | null | undefined, language: AppLanguage) {
  if (!value) return textByLanguage(language, 'Chưa có mốc', 'No timestamp')
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return textByLanguage(language, 'Chưa có mốc', 'No timestamp')
  return new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  }).format(parsed)
}

function formatScopeWaitElapsed(value: string | null | undefined, language: AppLanguage) {
  if (!value) return textByLanguage(language, 'Chờ', 'Wait')
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return textByLanguage(language, 'Chờ', 'Wait')
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 60000))
  const hours = Math.floor(elapsedMinutes / 60)
  const minutes = elapsedMinutes % 60
  if (hours < 24) return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  if (days < 7) return textByLanguage(language, `${days} ngày ${remainingHours}g`, `${days}d ${remainingHours}h`)
  return textByLanguage(language, `${days} ngày`, `${days}d`)
}

function firstNumberFromPriceLabel(value: string | null | undefined) {
  const match = value?.replace(/\./g, '').match(/\d+/)
  return match ? Number.parseInt(match[0], 10) : null
}

function scopeChangeStatusLabel(status: string, language: AppLanguage) {
  const labels: Record<AppLanguage, Record<string, string>> = {
    en: {
      approved_by_customer: 'Approved',
      cancelled: 'Cancelled',
      rejected_by_customer: 'Rejected',
      requested_by_worker: 'Drafted',
      reviewing_by_kael: 'Kael reviewing',
      waiting_customer_decision: 'Approval pending',
    },
    vi: {
      approved_by_customer: 'Đã duyệt',
      cancelled: 'Đã hủy',
      rejected_by_customer: 'Bị từ chối',
      requested_by_worker: 'Đã tạo nháp',
      reviewing_by_kael: 'Kael đang kiểm tra',
      waiting_customer_decision: 'Chờ khách duyệt',
    },
  }
  return labels[language][status] ?? textByLanguage(language, 'Đã ghi nhận', status)
}

function buildCompletionChecks(deal: LocalDeal | null, language: AppLanguage): WorkerV5FinalCheck[] {
  const photoDone = Boolean(deal?.completionPhotoUrls?.length)
  const notesDone = Boolean(deal?.completionNotes?.trim())
  const scope = deal?.scopeChange
  const scopeDone = !scope || scope.status === 'approved_by_customer'
  return [
    {
      done: photoDone,
      meta: photoDone ? textByLanguage(language, 'Đạt', 'Passed') : textByLanguage(language, 'Cần ảnh', 'Needs photo'),
      title: textByLanguage(language, 'Có ảnh trước hoặc sau', 'Has before or after photos'),
    },
    {
      done: notesDone,
      meta: notesDone ? textByLanguage(language, 'Đạt', 'Passed') : textByLanguage(language, 'Cần ghi chú', 'Needs note'),
      title: textByLanguage(language, 'Có ghi chú hoàn tất', 'Has completion note'),
    },
    {
      done: scopeDone,
      meta: scopeDone ? textByLanguage(language, 'Đạt', 'Passed') : textByLanguage(language, 'Đang chờ', 'Pending'),
      title: textByLanguage(language, 'Không còn phạm vi chờ duyệt', 'No pending scope approval'),
    },
  ]
}

function workerV5ActualWorkDurationLabel(deal: LocalDeal | null, language: AppLanguage) {
  if (!deal) return textByLanguage(language, 'Chưa có', 'None')
  const start = parseWorkflowTime(deal.matchedAt ?? deal.createdAt)
  const end = parseWorkflowTime(deal.completedAt ?? deal.confirmedAt ?? deal.reviewedAt ?? deal.payment?.receivedAt ?? deal.paidAt)
  if (!start || !end || end <= start) return textByLanguage(language, 'Chưa đồng bộ', 'Not synced')
  return formatWorkDurationMinutes(Math.round((end - start) / 60000), language)
}

function parseWorkflowTime(value: string | null | undefined) {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

function formatWorkDurationMinutes(totalMinutes: number, language: AppLanguage) {
  if (totalMinutes <= 0) return textByLanguage(language, 'Chưa đồng bộ', 'Not synced')
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (!hours) return textByLanguage(language, `${minutes} phút`, `${minutes} min`)
  if (!minutes) return textByLanguage(language, `${hours} giờ`, `${hours}h`)
  return textByLanguage(language, `${hours} giờ ${minutes} phút`, `${hours}h ${minutes}m`)
}

function paymentStatusLabel(status: string, language: AppLanguage) {
  const labels: Record<AppLanguage, Record<string, string>> = {
    en: {
      paid: 'Paid',
      pending: 'Pending',
      received: 'Received',
      released: 'Released',
    },
    vi: {
      paid: 'Đã thanh toán',
      pending: 'Đang chờ',
      received: 'Đã nhận',
      released: 'Đã giải ngân',
    },
  }
  return labels[language][status] ?? textByLanguage(language, 'Đã ghi nhận', status)
}

function workerVerificationLabel(status: string | null | undefined, language: AppLanguage) {
  if (!status) return textByLanguage(language, 'Chưa có trạng thái', 'No status')
  const labels: Record<AppLanguage, Record<string, string>> = {
    en: {
      approved: 'Approved',
      draft: 'Draft',
      rejected: 'Rejected',
      submitted: 'Submitted',
      suspended: 'Suspended',
      under_review: 'Under review',
    },
    vi: {
      approved: 'Đã duyệt',
      draft: 'Bản nháp',
      rejected: 'Từ chối',
      submitted: 'Đã gửi',
      suspended: 'Tạm ngưng',
      under_review: 'Đang xét duyệt',
    },
  }
  return labels[language][status] ?? textByLanguage(language, 'Đã ghi nhận', status)
}

function workerAvailabilityLabel(profile: WorkerV5Runtime['workerProfile'], language: AppLanguage) {
  if (!profile) return textByLanguage(language, 'Chưa có hồ sơ', 'No profile')
  if (profile.is_suspended) return textByLanguage(language, 'Tạm ngưng', 'Suspended')
  if (!profile.is_approved) return textByLanguage(language, 'Cần hoàn tất xác minh', 'Verification needed')
  return profile.is_available
    ? textByLanguage(language, 'Sẵn sàng nhận việc', 'Ready for jobs')
    : textByLanguage(language, 'Đang tắt nhận việc', 'Not accepting jobs')
}

function workerV5ProfileBackendSyncPercent(insights: WorkerV5Runtime['workerPerformanceInsights']) {
  const score = insights?.performance_score
  if (!workerV5HasNumber(score)) return 0
  return Math.max(0, Math.min(100, Math.round(score)))
}

function workerDocumentSummary(profile: WorkerV5Runtime['workerProfile'], language: AppLanguage) {
  if (!profile) return textByLanguage(language, 'Chưa có hồ sơ', 'No profile')
  if (profile.has_cccd && profile.has_selfie) return textByLanguage(language, 'Đã có giấy tờ bắt buộc', 'Required documents provided')
  if (profile.has_cccd || profile.has_selfie) return textByLanguage(language, 'Còn thiếu một phần', 'Partially provided')
  return textByLanguage(language, 'Chưa có giấy tờ', 'No documents yet')
}

function documentBooleanLabel(value: boolean | null | undefined, language: AppLanguage) {
  if (value === true) return textByLanguage(language, 'Đã có', 'Provided')
  if (value === false) return textByLanguage(language, 'Còn thiếu', 'Missing')
  return textByLanguage(language, 'Chưa có hồ sơ', 'No profile')
}

function formatWorkerDistrict(value: string, language: AppLanguage) {
  const trimmed = value.trim()
  const normalized = formatLooseLabel(trimmed).toLowerCase()
  const districtMatch = normalized.match(/^(?:quan|q)\s*(\d+)$/i)
  if (districtMatch) return language === 'vi' ? `Quận ${districtMatch[1]}` : `District ${districtMatch[1]}`
  const namedDistricts: Record<string, { en: string; vi: string }> = {
    'binh chanh': { en: 'Binh Chanh', vi: 'Bình Chánh' },
    'binh tan': { en: 'Binh Tan', vi: 'Bình Tân' },
    'binh thanh': { en: 'Binh Thanh', vi: 'Bình Thạnh' },
    'can gio': { en: 'Can Gio', vi: 'Cần Giờ' },
    'cu chi': { en: 'Cu Chi', vi: 'Củ Chi' },
    'go vap': { en: 'Go Vap', vi: 'Gò Vấp' },
    'hoc mon': { en: 'Hoc Mon', vi: 'Hóc Môn' },
    'nha be': { en: 'Nha Be', vi: 'Nhà Bè' },
    'phu nhuan': { en: 'Phu Nhuan', vi: 'Phú Nhuận' },
    'tan binh': { en: 'Tan Binh', vi: 'Tân Bình' },
    'tan phu': { en: 'Tan Phu', vi: 'Tân Phú' },
    'thu duc': { en: 'Thu Duc', vi: 'Thủ Đức' },
  }
  const namedDistrict = namedDistricts[normalized]
  if (namedDistrict) return namedDistrict[language]
  return formatLooseLabel(trimmed)
}

function normalizeWorkerV5DistrictSelectionList(values: string[]) {
  const districts: string[] = []
  for (const value of values) {
    const district = normalizeWorkerV5DistrictSelection(value)
    if (district && !districts.includes(district)) districts.push(district)
  }
  return districts
}

function normalizeWorkerV5DistrictSelection(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const canonical = normalizeDistrict(trimmed)
  const lower = trimmed.toLowerCase()
  if (
    canonical !== 'hcmc_all' ||
    lower === 'hcmc_all' ||
    lower === HCMC_DISTRICTS.hcmc_all.toLowerCase()
  ) {
    return canonical
  }
  const looseCanonical = normalizeDistrict(formatLooseLabel(trimmed))
  return looseCanonical === 'hcmc_all' ? null : looseCanonical
}

function workerV5DistrictDraftFromSelection(values: string[], language: AppLanguage) {
  return values.map((district) => formatWorkerDistrict(district, language)).join(', ')
}

function parseWorkerV5ServiceAreaDraft(value: string, _language: AppLanguage) {
  const districts: string[] = []
  const invalid: string[] = []
  const labels: string[] = []
  const entries = value
    .split(',')
    .map((entry) => formatLooseLabel(entry))
    .filter(Boolean)
  for (const entry of entries) {
    const district = normalizeWorkerV5DistrictSelection(entry)
    if (!district) {
      invalid.push(entry)
      labels.push(entry)
      continue
    }
    labels.push(entry)
    if (!districts.includes(district)) districts.push(district)
  }
  return { districts, invalid, labels }
}

function normalizeServiceAreaDraftText(value: string) {
  return value
    .split(',')
    .map((entry) => formatLooseLabel(entry).toLowerCase())
    .filter(Boolean)
    .join('|')
}

function formatLooseLabel(value: string) {
  return value
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function formatNullablePercent(value: number | null | undefined, language: AppLanguage) {
  return value != null
    ? `${value}%`
    : textByLanguage(language, 'Chưa đủ dữ liệu', 'Not enough data')
}

function formatNullableRating(value: number | null | undefined, language: AppLanguage) {
  return value != null && value > 0
    ? `${value}/5`
    : textByLanguage(language, 'Chưa có đánh giá', 'No rating')
}

function formatResponseSpeed(value: number | null | undefined, language: AppLanguage) {
  if (value == null) return textByLanguage(language, 'Chưa đủ dữ liệu', 'Not enough data')
  return textByLanguage(language, `${value} phút`, `${value} min`)
}

function formatCountOrEmpty(value: number | null | undefined, emptyLabel: string) {
  return value && value > 0 ? `${value}` : emptyLabel
}

function resolveWorkerV5BankLogo(bankName: string | null | undefined) {
  const code = resolveWorkerV5BankLogoName(bankName)
  return code ? workerV5BankLogos[code] : null
}

function workerV5BankLabel(code: WorkerV5BankLogoName) {
  return WORKER_V5_BANK_OPTIONS.find((item) => item.code === code)?.label ?? code
}

function resolveWorkerV5BankLogoName(bankName: string | null | undefined): WorkerV5BankLogoName | null {
  const normalized = bankName?.toLowerCase().replace(/\s+/g, '') ?? ''
  if (!normalized) return null
  if (normalized.includes('vietcombank') || normalized.includes('vcb')) return 'vietcombank'
  if (normalized.includes('techcombank') || normalized.includes('tcb')) return 'techcombank'
  if (normalized.includes('vietinbank') || normalized.includes('ctg')) return 'vietinbank'
  if (normalized.includes('mbbank') || normalized === 'mb') return 'mbbank'
  if (normalized.includes('bidv')) return 'bidv'
  if (normalized.includes('acb')) return 'acb'
  return null
}

function formatDateRange(from: string | null | undefined, to: string | null | undefined, language: AppLanguage) {
  if (!from && !to) return textByLanguage(language, 'Chưa có kỳ đối soát', 'No settlement period')
  if (from && to) return `${from} - ${to}`
  return from ?? to ?? textByLanguage(language, 'Chưa có kỳ đối soát', 'No settlement period')
}

function workerPerformanceAxisLabel(id: string, language: AppLanguage) {
  const labels: Record<AppLanguage, Record<string, string>> = {
    en: {
      arrival: 'Arrival reliability',
      completion: 'Completion quality',
      earnings: 'Settled earnings',
      rating: 'Customer feedback',
      response: 'Response discipline',
    },
    vi: {
      arrival: 'Đúng hẹn',
      completion: 'Chất lượng hoàn tất',
      earnings: 'Thu nhập đã đối soát',
      rating: 'Phản hồi khách',
      response: 'Kỷ luật phản hồi',
    },
  }
  return labels[language][id] ?? formatLooseLabel(id)
}

function workerPerformanceAxisShortLabel(id: string, language: AppLanguage) {
  const labels: Record<AppLanguage, Record<string, string>> = {
    en: {
      arrival: 'Arrival',
      completion: 'Quality',
      earnings: 'Earnings',
      rating: 'Rating',
      response: 'Response',
    },
    vi: {
      arrival: 'Đúng hẹn',
      completion: 'Chất lượng',
      earnings: 'Thu nhập',
      rating: 'Đánh giá',
      response: 'Phản hồi',
    },
  }
  return labels[language][id] ?? formatLooseLabel(id)
}

function formatVnd(value: number, language: AppLanguage) {
  const locale = language === 'vi' ? 'vi-VN' : 'en-US'
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)} VND`
}

function formatVndDong(value: number, language: AppLanguage) {
  const locale = language === 'vi' ? 'vi-VN' : 'en-US'
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)}đ`
}

function formatCompactVnd(value: number, language: AppLanguage) {
  if (value >= 1_000_000) {
    const compact = new Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
      maximumFractionDigits: value >= 10_000_000 ? 1 : 2,
    }).format(value / 1_000_000)
    return textByLanguage(language, `${compact}tr`, `${compact}m`)
  }
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`
  return formatVnd(value, language)
}

function textByLanguage(language: AppLanguage, vi: string, en: string) {
  return language === 'vi' ? vi : en
}

function workerV5OfferHeaderSubtitle(deal: LocalDeal | null, language: AppLanguage) {
  const code = deal?.displayCode || deal?.broadcast?.jobId || deal?.id
  if (code) return textByLanguage(language, `Mã việc ${code}`, `Work ${code}`)
  return textByLanguage(language, 'Đề nghị từ dữ liệu thật', 'Offer from real data')
}

function workerV5CaseHeaderSubtitle(deal: LocalDeal | null, language: AppLanguage) {
  const code = deal?.displayCode || deal?.broadcast?.jobId || deal?.id
  if (code) return textByLanguage(language, `Case ${code}`, `Case ${code}`)
  return textByLanguage(language, 'Case chờ khách phê duyệt', 'Case waiting for customer approval')
}

function workerV5TravelHeaderSubtitle(deal: LocalDeal | null, language: AppLanguage) {
  const code = deal?.displayCode || deal?.broadcast?.jobId || deal?.id
  if (code) return textByLanguage(language, `Mã việc ${code}`, `Work ${code}`)
  return null
}

function buildWorkerV5OfferAddressRows(deal: LocalDeal | null, language: AppLanguage): WorkerV5OfferDetailRow[] {
  if (!deal) {
    return [
      {
        icon: 'map',
        meta: textByLanguage(language, 'Chỉ hiện khi có cơ hội thật từ khách.', 'Shown only when there is a real customer opportunity.'),
        status: textByLanguage(language, 'Chờ', 'Waiting'),
        title: textByLanguage(language, 'Chưa có điểm hẹn', 'No appointment point'),
      },
      {
        icon: 'profile',
        meta: textByLanguage(language, 'NestScout chưa gửi khách hàng nào tới thợ.', 'NestScout has not sent any customer to the worker.'),
        status: textByLanguage(language, 'Chờ', 'Waiting'),
        title: textByLanguage(language, 'Khách hàng trong ứng dụng', 'In-app customer'),
      },
    ]
  }

  const addressOpen = canShowWorkerAddress(deal)
  const destination = routeDestinationLabel(deal, language)
  return [
    {
      icon: addressOpen ? 'map' : 'shield',
      meta: addressOpen
        ? destination
        : textByLanguage(language, `${destination}. Địa chỉ chi tiết mở sau khi nhận việc.`, `${destination}. Exact address opens after accepting.`),
      status: addressOpen ? textByLanguage(language, 'Đã mở', 'Open') : textByLanguage(language, 'Bảo vệ', 'Protected'),
      title: addressOpen
        ? textByLanguage(language, 'Địa chỉ việc', 'Work address')
        : textByLanguage(language, 'Khu vực việc', 'Work area'),
    },
    {
      icon: 'profile',
      meta: textByLanguage(
        language,
        'Liên hệ và thanh toán được giữ trong workflow NestScout.',
        'Contact and payment stay inside the NestScout workflow.',
      ),
      status: textByLanguage(language, 'Trong app', 'In app'),
      title: textByLanguage(language, 'Khách hàng trong ứng dụng', 'In-app customer'),
    },
  ]
}

function buildWorkerV5OfferRequestRows(deal: LocalDeal | null, language: AppLanguage): WorkerV5OfferDetailRow[] {
  if (!deal) {
    return [
      {
        icon: 'document',
        meta: textByLanguage(language, 'Yêu cầu sẽ hiện khi backend đồng bộ cơ hội.', 'Request appears after the backend syncs an opportunity.'),
        status: textByLanguage(language, 'Chờ', 'Waiting'),
        title: textByLanguage(language, 'Chưa có yêu cầu', 'No request yet'),
      },
    ]
  }

  const service = localizedServiceLabel(deal.draft.serviceType, language)
  const problem = deal.broadcast?.problemSummary || deal.draft.inferredProblemLabel || deal.draft.problemChips[0] || service
  const description = deal.draft.description || localizedWorkerBriefLines(deal.broadcast?.prebrief, language)[0] || textByLanguage(language, 'Chưa có mô tả chi tiết.', 'No detailed description yet.')
  const sourceCode = deal.displayCode || deal.broadcast?.broadcastId || deal.broadcast?.jobId || deal.id
  return [
    {
      icon: 'document',
      meta: description,
      status: textByLanguage(language, 'Scope hiện tại', 'Current scope'),
      title: problem,
    },
    {
      icon: 'jobs',
      meta: sourceCode
        ? textByLanguage(language, `Nguồn ${sourceCode}`, `Source ${sourceCode}`)
        : textByLanguage(language, 'Nguồn việc chưa có mã hiển thị.', 'Work source has no display code yet.'),
      status: deal.broadcast ? textByLanguage(language, 'Đã gửi', 'Sent') : textByLanguage(language, 'Chờ', 'Waiting'),
      title: service,
    },
  ]
}

function buildWorkerV5OfferSummaryChips(deal: LocalDeal, language: AppLanguage) {
  const destination = routeDestinationLabel(deal, language)
  const timing = deal.broadcast?.secondsRemaining != null
    ? textByLanguage(language, `${deal.broadcast.secondsRemaining} giây còn lại`, `${deal.broadcast.secondsRemaining}s left`)
    : workerV5TimeChoiceLabel(deal.draft.timeChoice, language)
  const source = deal.broadcast?.status === 'sent'
    ? textByLanguage(language, 'Đã gửi tới bạn', 'Sent to you')
    : localizedStatusLabel(deal.status, language)
  const privacy = canShowWorkerAddress(deal)
    ? textByLanguage(language, 'Địa chỉ đã mở', 'Address open')
    : textByLanguage(language, 'Địa chỉ bảo vệ', 'Address protected')
  return [destination, timing, deal.broadcast ? source : privacy]
}

type WorkerV5AcceptEtaSignal = {
  hasSignal: boolean
  label: string
  meta: string
}

type WorkerV5RouteDistanceSignal = {
  hasSignal: boolean
  label: string
  meta: string
}

type WorkerV5CheckInState = 'active' | 'done' | 'pending'

type WorkerV5BroadcastRouteMetadata = {
  metadata?: Record<string, unknown> | null
  safe_metadata?: Record<string, unknown> | null
}

function workerV5BroadcastRouteMetadata(deal: LocalDeal | null): Record<string, unknown> | null {
  const broadcast = deal?.broadcast as (LocalDeal['broadcast'] & WorkerV5BroadcastRouteMetadata) | null | undefined
  return broadcast?.safe_metadata ?? broadcast?.metadata ?? null
}

function workerV5KaelOpportunityMatchScore(deal: LocalDeal | null): number | null {
  const metadata = workerV5BroadcastRouteMetadata(deal)
  if (!metadata) return null
  const scoreKeys = ['match_score', 'matchScore', 'worker_match_score', 'kael_match_score', 'fit_score']
  for (const key of scoreKeys) {
    const value = workerV5FiniteNumberFromUnknown(metadata[key])
    if (value == null) continue
    const normalized = value <= 1 ? value * 100 : value
    return Math.max(0, Math.min(100, Math.round(normalized)))
  }
  return null
}

function workerV5RouteMapLabelFromDeal(deal: LocalDeal | null): string | null {
  const metadata = workerV5BroadcastRouteMetadata(deal)
  if (!metadata) return null
  const labelKeys = ['route_destination_label', 'destination_label', 'customer_address_label', 'map_label', 'route_label']
  for (const key of labelKeys) {
    const label = workerV5StringFromUnknown(metadata[key])
    if (label) return label
  }
  return null
}

function workerV5ArrivalDestinationMeta(deal: LocalDeal | null, language: AppLanguage) {
  if (!deal) return textByLanguage(language, 'Chưa có việc', 'No work')
  const access = deal.broadcast?.addressAccess
  const release = access?.exact_unit_released
    ? textByLanguage(language, 'Đã mở căn hộ', 'Unit released')
    : access?.release_stage === 'building_released'
      ? textByLanguage(language, 'Đã mở tòa nhà', 'Building released')
      : canShowWorkerAddress(deal)
        ? textByLanguage(language, 'Địa chỉ đã mở', 'Address open')
        : textByLanguage(language, 'Địa chỉ đang bảo vệ', 'Address protected')
  return `${release} · ${localizedStatusLabel(deal.status, language)}`
}

function workerV5ArrivalDestinationLabel(deal: LocalDeal | null, language: AppLanguage) {
  if (!deal) return textByLanguage(language, 'Chưa có điểm đến', 'No destination')
  if (deal.broadcast?.fullAddressVisible && deal.broadcast.fullAddressLabel) return deal.broadcast.fullAddressLabel
  return routeDestinationLabel(deal, language)
}

function workerV5CustomerContactInfo(deal: LocalDeal | null, language: AppLanguage) {
  if (!deal) {
    return {
      meta: textByLanguage(language, 'Chỉ hiện khi workflow có việc thật.', 'Shown only when the workflow has real work.'),
      title: textByLanguage(language, 'Chưa có khách hàng', 'No customer yet'),
    }
  }

  const metadata = workerV5BroadcastRouteMetadata(deal)
  const name = workerV5StringFromUnknown(metadata?.customer_display_name)
    ?? workerV5StringFromUnknown(metadata?.customer_name)
    ?? workerV5StringFromUnknown(metadata?.customer_label)
  const channel = workerV5StringFromUnknown(metadata?.customer_contact_channel)
    ?? workerV5StringFromUnknown(metadata?.contact_channel)
  const title = name ?? textByLanguage(language, 'Khách hàng trong ứng dụng', 'In-app customer')
  const meta = channel
    ? textByLanguage(language, `Kênh liên hệ: ${channel}`, `Contact channel: ${channel}`)
    : textByLanguage(language, 'Giữ liên hệ trong JobRoom của việc này.', 'Keep contact inside this work JobRoom.')
  return { meta, title }
}

function buildWorkerV5CheckInChecklistItems(deal: LocalDeal | null, language: AppLanguage): Array<{ label: string; meta: string; state: WorkerV5CheckInState }> {
  const arrived = workerV5HasReachedArrival(deal)
  const addressOpen = deal ? canShowWorkerAddress(deal) : false
  const contacted = workerV5CustomerContacted(deal)
  const evidenceMode = deal?.broadcast?.addressAccess?.evidence_mode ?? null
  const initialEvidenceReady = workerV5InitialEvidenceReady(deal)

  return [
    {
      label: textByLanguage(language, 'Có mặt đúng địa điểm', 'At the correct location'),
      meta: deal
        ? addressOpen
          ? workerV5ArrivalDestinationLabel(deal, language)
          : textByLanguage(language, 'Địa chỉ đang bảo vệ', 'Address protected')
        : textByLanguage(language, 'Chờ điểm đến', 'Waiting destination'),
      state: arrived ? 'done' : addressOpen ? 'active' : 'pending',
    },
    {
      label: textByLanguage(language, 'Đã liên hệ khách', 'Contacted customer'),
      meta: contacted
        ? textByLanguage(language, 'Đã ghi trong workflow', 'Recorded in workflow')
        : deal
          ? textByLanguage(language, 'Mở JobRoom để liên hệ', 'Open JobRoom to contact')
          : textByLanguage(language, 'Chờ khách hàng', 'Waiting customer'),
      state: contacted ? 'done' : deal ? 'active' : 'pending',
    },
    {
      label: textByLanguage(language, 'Xác nhận hiện trạng ban đầu', 'Confirm starting condition'),
      meta: initialEvidenceReady
        ? textByLanguage(language, 'Đã có bằng chứng', 'Evidence exists')
        : workerV5EvidenceModeLabel(evidenceMode, language),
      state: initialEvidenceReady ? 'done' : arrived || deal?.status === 'worker_on_way' ? 'active' : 'pending',
    },
  ]
}

function workerV5HasReachedArrival(deal: LocalDeal | null) {
  return Boolean(deal && ['arrived', 'inspecting', 'repairing', 'scope_change_pending', 'completed_by_worker', 'confirmed_by_customer', 'reviewed'].includes(deal.status))
}

function workerV5CustomerContacted(deal: LocalDeal | null) {
  const metadata = workerV5BroadcastRouteMetadata(deal)
  return workerV5BooleanFromUnknown(metadata?.customer_contacted)
    || Boolean(workerV5StringFromUnknown(metadata?.customer_contacted_at))
    || Boolean(workerV5StringFromUnknown(metadata?.last_customer_message_at))
}

function workerV5InitialEvidenceReady(deal: LocalDeal | null) {
  const metadata = workerV5BroadcastRouteMetadata(deal)
  return workerV5BooleanFromUnknown(metadata?.initial_condition_confirmed)
    || Boolean(workerV5StringFromUnknown(metadata?.initial_condition_confirmed_at))
    || Boolean(workerV5StringFromUnknown(metadata?.arrival_evidence_id))
}

function workerV5EvidenceModeLabel(
  mode: NonNullable<NonNullable<LocalDeal['broadcast']>['addressAccess']>['evidence_mode'] | null,
  language: AppLanguage,
) {
  if (mode === 'geofence') return textByLanguage(language, 'Cần tín hiệu vị trí', 'Needs location signal')
  if (mode === 'manual_photo') return textByLanguage(language, 'Cần ảnh thủ công', 'Needs manual photo')
  if (mode === 'none') return textByLanguage(language, 'Theo workflow', 'By workflow')
  return textByLanguage(language, 'Chờ workflow', 'Waiting workflow')
}

function workerV5RouteMapLocationFromDeal(deal: LocalDeal | null): WorkerV5MapLocation | null {
  const metadata = workerV5BroadcastRouteMetadata(deal)
  if (!metadata) return null

  const directPairs = [
    ['route_destination_lat', 'route_destination_lng'],
    ['destination_lat', 'destination_lng'],
    ['customer_lat', 'customer_lng'],
    ['job_lat', 'job_lng'],
    ['appointment_lat', 'appointment_lng'],
    ['address_lat', 'address_lng'],
    ['lat', 'lng'],
  ] as const

  for (const [latKey, lngKey] of directPairs) {
    const location = workerV5MapLocationFromValues(metadata[latKey], metadata[lngKey], metadata.map_provider ?? metadata.provider)
    if (location) return location
  }

  const nestedKeys = ['route_destination', 'destination_location', 'destination', 'customer_location', 'job_location', 'appointment_location', 'address_location', 'location', 'coordinates']
  for (const key of nestedKeys) {
    const location = workerV5MapLocationFromRecord(metadata[key], metadata.map_provider ?? metadata.provider)
    if (location) return location
  }

  return null
}

function workerV5MapLocationFromRecord(value: unknown, providerValue: unknown): WorkerV5MapLocation | null {
  if (Array.isArray(value)) {
    const first = workerV5FiniteNumberFromUnknown(value[0])
    const second = workerV5FiniteNumberFromUnknown(value[1])
    if (first != null && second != null) {
      return Math.abs(first) <= 90 && Math.abs(second) <= 180
        ? workerV5MapLocationFromValues(first, second, providerValue)
        : workerV5MapLocationFromValues(second, first, providerValue)
    }
  }
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const lat = record.lat ?? record.latitude
  const lng = record.lng ?? record.lon ?? record.long ?? record.longitude
  return workerV5MapLocationFromValues(lat, lng, record.provider ?? providerValue)
}

function workerV5MapLocationFromValues(latValue: unknown, lngValue: unknown, providerValue: unknown): WorkerV5MapLocation | null {
  const lat = workerV5FiniteNumberFromUnknown(latValue)
  const lng = workerV5FiniteNumberFromUnknown(lngValue)
  if (lat == null || lng == null) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return {
    lat,
    lng,
    provider: workerV5MapProviderFromUnknown(providerValue),
  }
}

function workerV5MapProviderFromUnknown(value: unknown): WorkerV5MapLocation['provider'] {
  return typeof value === 'string' && value.toLowerCase().includes('google') ? 'google_maps' : 'vietmap'
}

function buildWorkerV5AcceptEtaSignal(deal: LocalDeal | null, language: AppLanguage): WorkerV5AcceptEtaSignal {
  const syncedEtaLabel = workerV5AcceptEtaFromBroadcastMetadata(deal, language)
    ?? workerV5AcceptEtaFromPrebrief(deal?.broadcast?.prebrief, language)

  if (syncedEtaLabel) {
    return {
      hasSignal: true,
      label: syncedEtaLabel,
      meta: textByLanguage(
        language,
        'Kael đã ước tính từ dữ liệu quãng đường đã đồng bộ.',
        'Kael estimated this from synced route distance.',
      ),
    }
  }

  return {
    hasSignal: false,
    label: textByLanguage(language, 'Đang đo thời gian đến', 'Measuring ETA'),
    meta: textByLanguage(
      language,
      'Kael sẽ hiện thời gian khi backend đồng bộ quãng đường thật.',
      'Kael shows travel time when the backend syncs real route distance.',
    ),
  }
}

function buildWorkerV5RouteDistanceSignal(deal: LocalDeal | null, language: AppLanguage): WorkerV5RouteDistanceSignal {
  const syncedDistanceLabel = workerV5RouteDistanceFromBroadcastMetadata(deal, language)
    ?? workerV5RouteDistanceFromPrebrief(deal?.broadcast?.prebrief, language)

  if (syncedDistanceLabel) {
    return {
      hasSignal: true,
      label: syncedDistanceLabel,
      meta: textByLanguage(language, `Quãng đường thật · ${syncedDistanceLabel}`, `Real route distance · ${syncedDistanceLabel}`),
    }
  }

  return {
    hasSignal: false,
    label: textByLanguage(language, 'Chờ dữ liệu thật', 'Waiting for real data'),
    meta: textByLanguage(language, 'Kael sẽ hiện quãng đường khi backend đồng bộ tuyến đường.', 'Kael shows distance when the backend syncs the route.'),
  }
}

function workerV5RouteDistanceFromBroadcastMetadata(deal: LocalDeal | null, language: AppLanguage): string | null {
  const broadcast = deal?.broadcast as (LocalDeal['broadcast'] & WorkerV5BroadcastRouteMetadata) | null | undefined
  const metadata = broadcast?.safe_metadata ?? broadcast?.metadata ?? null
  if (!metadata) return null

  const labelKeys = ['route_distance_label', 'travel_distance_label', 'distance_label']
  for (const key of labelKeys) {
    const label = workerV5StringFromUnknown(metadata[key])
    if (label) return normalizeWorkerV5RouteDistanceLabel(label, language)
  }

  const kilometerKeys = ['route_distance_km', 'travel_distance_km', 'distance_km']
  for (const key of kilometerKeys) {
    const kilometers = workerV5PositiveNumberFromUnknown(metadata[key])
    if (kilometers != null) return formatWorkerV5RouteKilometers(kilometers, language)
  }

  const meterKeys = ['route_distance_m', 'travel_distance_m', 'distance_m', 'route_distance_meters', 'travel_distance_meters', 'distance_meters']
  for (const key of meterKeys) {
    const meters = workerV5PositiveNumberFromUnknown(metadata[key])
    if (meters != null) return formatWorkerV5RouteMeters(meters, language)
  }

  return null
}

function workerV5RouteDistanceFromPrebrief(prebrief: readonly string[] | null | undefined, language: AppLanguage): string | null {
  for (const line of prebrief ?? []) {
    const text = line.trim()
    if (!/(quãng đường|khoảng cách|distance|route|travel)/i.test(text)) continue

    const kilometerMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(km|kilometer|kilometers|kilometre|kilometres)\b/i)
    if (kilometerMatch) return formatWorkerV5RouteKilometers(Number(kilometerMatch[1].replace(',', '.')), language)

    const meterMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(m|meter|meters|metre|metres)\b/i)
    if (meterMatch) return formatWorkerV5RouteMeters(Number(meterMatch[1].replace(',', '.')), language)
  }

  return null
}

function workerV5AcceptEtaFromBroadcastMetadata(deal: LocalDeal | null, language: AppLanguage): string | null {
  const broadcast = deal?.broadcast as (LocalDeal['broadcast'] & WorkerV5BroadcastRouteMetadata) | null | undefined
  const metadata = broadcast?.safe_metadata ?? broadcast?.metadata ?? null
  if (!metadata) return null

  const labelKeys = ['travel_eta_label', 'estimated_travel_time_label', 'route_eta_label', 'eta_label']
  for (const key of labelKeys) {
    const label = workerV5StringFromUnknown(metadata[key])
    if (label) return normalizeWorkerV5AcceptEtaLabel(label, language)
  }

  const minuteKeys = ['travel_minutes', 'estimated_travel_minutes', 'route_eta_minutes', 'eta_minutes']
  for (const key of minuteKeys) {
    const minutes = workerV5PositiveNumberFromUnknown(metadata[key])
    if (minutes != null) return normalizeWorkerV5AcceptEtaLabel(formatWorkerV5EtaMinutes(minutes, language), language)
  }

  const secondKeys = ['travel_seconds', 'estimated_travel_seconds', 'route_eta_seconds', 'eta_seconds']
  for (const key of secondKeys) {
    const seconds = workerV5PositiveNumberFromUnknown(metadata[key])
    if (seconds != null) return normalizeWorkerV5AcceptEtaLabel(formatWorkerV5EtaSeconds(seconds, language), language)
  }

  return null
}

function workerV5AcceptEtaFromPrebrief(prebrief: readonly string[] | null | undefined, language: AppLanguage): string | null {
  for (const line of prebrief ?? []) {
    const text = line.trim()
    if (!/(eta|di chuyển|thời gian|quãng đường|travel|route|distance)/i.test(text)) continue

    const minuteMatch = text.match(/(\d{1,3})\s*(phút|p|minute|minutes|min)\b/i)
    if (minuteMatch) return normalizeWorkerV5AcceptEtaLabel(formatWorkerV5EtaMinutes(Number(minuteMatch[1]), language), language)

    const secondMatch = text.match(/(\d{1,4})\s*(giây|s|second|seconds|sec)\b/i)
    if (secondMatch) return normalizeWorkerV5AcceptEtaLabel(formatWorkerV5EtaSeconds(Number(secondMatch[1]), language), language)
  }

  return null
}

function normalizeWorkerV5AcceptEtaLabel(raw: string, language: AppLanguage) {
  const label = raw.trim()
  if (!label) return null
  if (language === 'vi') {
    const minuteMatch = label.match(/(\d{1,3})\s*(phút|p|minute|minutes|min)\b/i)
    if (minuteMatch) return `Di chuyển trong ${formatWorkerV5EtaMinutes(Number(minuteMatch[1]), language)}`

    const secondMatch = label.match(/(\d{1,4})\s*(giây|s|second|seconds|sec)\b/i)
    if (secondMatch) return `Di chuyển trong ${formatWorkerV5EtaSeconds(Number(secondMatch[1]), language)}`

    const localizedLabel = label
      .replace(/\bETA\b/gi, 'thời gian đến')
      .replace(/\bestimated\b/gi, 'ước tính')
      .replace(/\btravel\b/gi, 'di chuyển')
      .replace(/\broute\b/gi, 'lộ trình')
      .replace(/\btime\b/gi, 'thời gian')
      .replace(/\bminutes?\b|\bmin\b/gi, 'phút')
      .replace(/\bseconds?\b|\bsec\b/gi, 'giây')
      .trim()

    if (/(di chuyển|thời gian|lộ trình|quãng đường)/i.test(localizedLabel)) return localizedLabel
    return `Di chuyển trong ${localizedLabel}`
  }
  if (/(eta|di chuyển|travel|route)/i.test(label)) return label
  return textByLanguage(language, `Di chuyển trong ${label}`, `Travel in ${label}`)
}

function formatWorkerV5EtaMinutes(minutes: number, language: AppLanguage) {
  const rounded = Math.max(1, Math.round(minutes))
  return textByLanguage(language, `${rounded} phút`, `${rounded} min`)
}

function formatWorkerV5EtaSeconds(seconds: number, language: AppLanguage) {
  return formatWorkerV5EtaMinutes(Math.ceil(seconds / 60), language)
}

function workerV5EtaLensValue(label: string) {
  const minuteMatch = label.match(/(\d{1,3})/)
  return minuteMatch ? minuteMatch[1] : '0'
}

function normalizeWorkerV5RouteDistanceLabel(raw: string, language: AppLanguage) {
  const label = raw.trim()
  if (!label) return null
  const kilometerMatch = label.match(/(\d+(?:[.,]\d+)?)\s*(km|kilometer|kilometers|kilometre|kilometres)\b/i)
  if (kilometerMatch) return formatWorkerV5RouteKilometers(Number(kilometerMatch[1].replace(',', '.')), language)

  const meterMatch = label.match(/(\d+(?:[.,]\d+)?)\s*(m|meter|meters|metre|metres)\b/i)
  if (meterMatch) return formatWorkerV5RouteMeters(Number(meterMatch[1].replace(',', '.')), language)

  return label
    .replace(/\bdistance\b/gi, language === 'vi' ? 'quãng đường' : 'distance')
    .replace(/\bmeters?\b|\bmetres?\b/gi, language === 'vi' ? 'm' : 'm')
    .replace(/\bkilometers?\b|\bkilometres?\b/gi, language === 'vi' ? 'km' : 'km')
    .trim()
}

function formatWorkerV5RouteKilometers(kilometers: number, language: AppLanguage) {
  const safeKm = Math.max(0.1, kilometers)
  const label = new Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
    maximumFractionDigits: safeKm >= 10 ? 1 : 2,
    minimumFractionDigits: 0,
  }).format(safeKm)
  return `${label} km`
}

function formatWorkerV5RouteMeters(meters: number, language: AppLanguage) {
  if (meters >= 1000) return formatWorkerV5RouteKilometers(meters / 1000, language)
  const safeMeters = Math.max(1, Math.round(meters))
  return `${new Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US').format(safeMeters)} m`
}

function workerV5StringFromUnknown(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function workerV5BooleanFromUnknown(value: unknown) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return ['1', 'true', 'yes', 'done', 'completed'].includes(value.trim().toLowerCase())
  if (typeof value === 'number') return value === 1
  return false
}

function workerV5FiniteNumberFromUnknown(value: unknown) {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value.trim().replace(',', '.'))
      : Number.NaN
  return Number.isFinite(numeric) ? numeric : null
}

function workerV5PositiveNumberFromUnknown(value: unknown) {
  const numeric = workerV5FiniteNumberFromUnknown(value)
  return numeric != null && numeric > 0 ? numeric : null
}

function buildWorkerV5AcceptReviewChecks(
  deal: LocalDeal | null,
  profile: WorkerV5Runtime['workerProfile'],
  language: AppLanguage,
): WorkerV5AcceptCheck[] {
  const offerOpen = workerV5CanAcceptOpenOffer(deal, 'remote_backend')
  const profileReady = Boolean(profile?.is_approved && !profile?.is_suspended)
  const serviceMatched = Boolean(deal?.draft.serviceType && profile?.service_types?.includes(deal.draft.serviceType))
  const area = deal ? routeDestinationLabel(deal, language) : textByLanguage(language, 'Chưa có khu vực', 'No area')

  return [
    {
      label: textByLanguage(language, 'Đề nghị còn mở', 'Offer is still open'),
      meta: offerOpen ? textByLanguage(language, 'Đạt', 'Met') : textByLanguage(language, 'Chờ', 'Waiting'),
      state: offerOpen ? 'done' : 'pending',
    },
    {
      label: textByLanguage(language, 'Kỹ năng & giấy tờ phù hợp', 'Skills and documents match'),
      meta: serviceMatched && profileReady
        ? textByLanguage(language, 'Đạt', 'Met')
        : profileReady
          ? textByLanguage(language, 'Chờ khớp', 'Waiting match')
          : textByLanguage(language, 'Cần hồ sơ', 'Profile needed'),
      state: serviceMatched && profileReady ? 'done' : profileReady ? 'pending' : 'blocked',
    },
    {
      label: textByLanguage(language, 'Địa chỉ & thanh toán bảo vệ', 'Protected address and payment'),
      meta: deal?.broadcast ? area : textByLanguage(language, 'Chờ', 'Waiting'),
      state: deal?.broadcast ? 'done' : 'pending',
    },
  ]
}

function workerV5CanAcceptOpenOffer(deal: LocalDeal | null, workerGate: WorkerV5Runtime['state']['workerGate']) {
  return Boolean(
    workerGate !== 'backend_pending'
    && deal?.broadcast?.status === 'sent'
    && deal.broadcast.jobId,
  )
}

const styles = StyleSheet.create({
  workerCustomerFontText: {
    fontFamily: typography.fontFamily,
  },
  authorityCard: {
    backgroundColor: 'rgba(231,255,248,0.83)',
    borderColor: 'rgba(184,231,223,0.88)',
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 6,
    padding: 16,
    ...shadow.soft,
  },
  authorityLabel: {
    color: color.brand.primaryDark,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  authorityText: {
    color: color.text.strong,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  artifactCell: {
    backgroundColor: 'rgba(246,252,250,0.82)',
    borderColor: color.surface.stroke,
    borderRadius: 17,
    borderWidth: 1,
    flex: 1,
    gap: 3,
    minHeight: 72,
    minWidth: 0,
    paddingHorizontal: 9,
    paddingVertical: 10,
  },
  artifactGrid: {
    flexDirection: 'row',
    gap: 7,
  },
  availabilityCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderColor: 'rgba(216,235,232,0.92)',
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 62,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...shadow.soft,
  },
  availabilityCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  availabilityKnob: {
    backgroundColor: color.mint.white,
    borderRadius: 10,
    height: 20,
    shadowColor: color.text.primary,
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    width: 20,
  },
  availabilityKnobOn: {
    marginLeft: 18,
  },
  availabilitySwitch: {
    backgroundColor: '#DFE9E7',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: radius.pill,
    borderWidth: 0,
    height: 26,
    justifyContent: 'center',
    paddingHorizontal: 3,
    width: 44,
  },
  availabilitySwitchDisabled: {
    opacity: 0.58,
  },
  availabilitySwitchOn: {
    backgroundColor: '#16C7B4',
    shadowColor: '#0DAE9A',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
  },
  availabilityTitle: {
    color: color.text.strong,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  artifactLabel: {
    color: color.text.muted,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
  },
  artifactValue: {
    color: color.text.strong,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  artifactValueMint: {
    color: color.brand.primaryDark,
  },
  homeCommandAura: {
    bottom: -36,
    left: -28,
    position: 'absolute',
    right: -28,
    top: -34,
    zIndex: 0,
  },
  homeCommandBody: {
    color: color.text.muted,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
    marginTop: 6,
  },
  homeCommandCard: {
    backgroundColor: 'rgba(255,255,255,0.76)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 28,
    borderWidth: 1,
    gap: 12,
    overflow: 'hidden',
    padding: 16,
    position: 'relative',
    ...shadow.raised,
  },
  homeCommandCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  homeCommandTitle: {
    color: color.text.strong,
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 29,
    marginTop: 0,
  },
  homeCommandTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    position: 'relative',
    zIndex: 1,
  },
  homeListMintAura: {
    bottom: -42,
    left: -28,
    position: 'absolute',
    right: -28,
    top: -34,
    zIndex: 0,
  },
  homeAuraBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FBFFFE',
    zIndex: 0,
  },
  homeQuickActionCard: {
    minHeight: 62,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  homeQuickCardAura: {
    bottom: -42,
    left: -34,
    position: 'absolute',
    right: -34,
    top: -44,
    zIndex: 0,
  },
  homeQuickAuraFrame: {
    position: 'relative',
  },
  homeScoreLabel: {
    color: color.text.muted,
    fontSize: 7,
    fontWeight: '700',
    lineHeight: 9,
    marginTop: 0,
    maxWidth: 54,
    textAlign: 'center',
  },
  homeScoreShell: {
    alignItems: 'center',
    height: 92,
    justifyContent: 'center',
    position: 'relative',
    width: 92,
  },
  homeScoreText: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  homeScoreValue: {
    color: color.brand.primaryDark,
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 25,
  },
  homeSourceAvatarImage: {
    height: 34,
    width: 34,
  },
  homeSourceAvatarTile: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderColor: 'rgba(255,255,255,0.96)',
    borderRadius: 17,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 42,
    ...shadow.soft,
  },
  homeSourceHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 58,
  },
  homeSourceHeaderAction: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 18,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
    ...shadow.soft,
  },
  homeSourceHeaderActionText: {
    color: color.brand.primaryDark,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 18,
  },
  homeSourceHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  homeSourceScrollContent: {
    gap: 9,
    paddingBottom: 118,
    paddingHorizontal: 16,
    paddingTop: 12,
    position: 'relative',
  },
  homeSourceScroll: {
    position: 'relative',
    zIndex: 1,
  },
  homeSourceSubtitle: {
    color: color.text.muted,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
    marginTop: 2,
  },
  homeSourceTitle: {
    color: color.text.strong,
    fontSize: 21,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 25,
  },
  homeStatGrid: {
    flexDirection: 'row',
    gap: 8,
    position: 'relative',
    zIndex: 1,
  },
  homeStatLabel: {
    color: color.text.muted,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  homeStatTile: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.74)',
    borderColor: color.surface.stroke,
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 60,
    minWidth: 0,
    paddingHorizontal: 6,
    paddingVertical: 9,
  },
  homeStatValue: {
    color: color.text.strong,
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 20,
    textAlign: 'center',
  },
  approvalHeroAmount: {
    color: color.brand.primaryDark,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 27,
    marginTop: 8,
  },
  approvalHeroAura: {
    bottom: 'auto',
    height: 170,
    left: '34%',
    right: -60,
    top: -68,
  },
  approvalHeroCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(246,255,252,0.84)',
    borderColor: 'rgba(127,226,215,0.72)',
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    minHeight: 118,
    overflow: 'hidden',
    padding: 16,
    position: 'relative',
    ...shadow.raised,
  },
  approvalHeroCopy: {
    flex: 1,
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  approvalHeroMeta: {
    color: color.text.secondary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    marginTop: 3,
  },
  approvalHeroPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF7E6',
    borderColor: '#F6D18B',
    borderRadius: radius.pill,
    borderWidth: 1,
    color: color.text.strong,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  approvalLens: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: 'rgba(255,255,255,0.96)',
    borderRadius: 34,
    borderWidth: 1,
    flexShrink: 0,
    height: 74,
    justifyContent: 'center',
    position: 'relative',
    width: 74,
    zIndex: 1,
    ...shadow.primary,
  },
  approvalLensLabel: {
    color: color.text.muted,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 11,
  },
  approvalLensValue: {
    color: color.brand.primaryDark,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 22,
  },
  accountUtilityHeroCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 13,
    minHeight: 112,
    overflow: 'hidden',
    padding: 15,
    position: 'relative',
    ...shadow.raised,
  },
  accountUtilityHeroCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  accountUtilityHeroIcon: {
    height: 42,
    width: 42,
  },
  accountUtilityHeroIconShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: 22,
    borderWidth: 1,
    flexShrink: 0,
    height: 64,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 64,
    zIndex: 1,
    ...shadow.soft,
  },
  accountUtilityHeroMeta: {
    color: color.text.muted,
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  accountUtilityHeroTitle: {
    color: color.text.strong,
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 23,
  },
  bankCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.73)',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 21,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 76,
    overflow: 'hidden',
    padding: 12,
    position: 'relative',
    ...shadow.soft,
  },
  bankIconTile: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 18,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 52,
  },
  bankCardLogoImage: {
    height: 28,
    width: 44,
  },
  bankLogoImage: {
    height: 34,
    width: 58,
  },
  payoutBankCheck: {
    alignItems: 'center',
    backgroundColor: color.brand.primary,
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: 9,
    borderWidth: 1,
    height: 18,
    justifyContent: 'center',
    position: 'absolute',
    right: 8,
    top: 8,
    width: 18,
    zIndex: 2,
  },
  payoutBankCheckText: {
    color: color.text.inverse,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 13,
  },
  payoutBankChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 21,
    borderWidth: 1,
    height: 68,
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 11,
    position: 'relative',
    width: '31.8%',
    ...shadow.soft,
  },
  payoutBankChipSelected: {
    backgroundColor: 'rgba(232,255,249,0.88)',
    borderColor: 'rgba(13,179,159,0.55)',
    shadowColor: '#079B8A',
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.13,
    shadowRadius: 24,
  },
  payoutBankGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  payoutBankLogo: {
    height: 38,
    maxWidth: '100%',
    width: 86,
  },
  payoutMethodHeroCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 25,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 78,
    overflow: 'hidden',
    paddingHorizontal: 13,
    paddingVertical: 10,
    position: 'relative',
    ...shadow.soft,
  },
  payoutMethodHeroCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  payoutMethodLogoFrame: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderColor: 'rgba(255,255,255,0.96)',
    borderRadius: 17,
    borderWidth: 1,
    flexShrink: 0,
    height: 50,
    justifyContent: 'center',
    overflow: 'hidden',
    padding: 6,
    position: 'relative',
    width: 68,
    zIndex: 1,
  },
  payoutMethodLogoImage: {
    height: 34,
    width: 58,
  },
  payoutAccountFormCard: {
    backgroundColor: 'rgba(255,255,255,0.80)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 25,
    borderWidth: 1,
    gap: 10,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 14,
    position: 'relative',
    ...shadow.soft,
  },
  payoutAccountInputShell: {
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: 'rgba(127,226,215,0.58)',
    minHeight: 48,
  },
  payoutAccountInputStack: {
    gap: 5,
    position: 'relative',
    zIndex: 1,
  },
  payoutAccountFieldLabel: {
    color: color.text.strong,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  payoutAccountManagementRowActive: {
    backgroundColor: 'rgba(232,255,249,0.72)',
  },
  payoutAccountPrecheckButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(229,255,249,0.86)',
    borderColor: 'rgba(13,179,159,0.38)',
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    position: 'relative',
    zIndex: 1,
  },
  payoutAccountPrecheckStatus: {
    color: color.brand.primaryDark,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    position: 'relative',
    zIndex: 1,
  },
  payoutAccountPrecheckText: {
    color: color.brand.primaryDark,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
    textAlign: 'center',
  },
  payoutMethodSaveStatus: {
    color: color.brand.primaryDark,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    paddingHorizontal: 10,
    textAlign: 'center',
  },
  payoutLimitPolicyCard: {
    backgroundColor: 'rgba(246,255,252,0.84)',
    borderColor: 'rgba(127,226,215,0.72)',
    borderRadius: 22,
    borderWidth: 1,
    gap: 7,
    overflow: 'hidden',
    paddingHorizontal: 13,
    paddingVertical: 12,
    position: 'relative',
    ...shadow.soft,
  },
  payoutLimitPolicyCopy: {
    textAlign: 'justify',
  },
  srOnlyText: {
    height: 0,
    opacity: 0,
    position: 'absolute',
    width: 0,
  },
  chevronText: {
    color: color.brand.primaryDark,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 26,
    paddingHorizontal: 2,
  },
  boundaryBody: {
    color: color.text.secondary,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
    position: 'relative',
    zIndex: 1,
  },
  boundaryNote: {
    backgroundColor: 'rgba(246,255,252,0.84)',
    borderColor: 'rgba(127,226,215,0.72)',
    borderRadius: 18,
    borderWidth: 1,
    gap: 4,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 10,
    position: 'relative',
    ...shadow.soft,
  },
  boundaryTitle: {
    color: color.text.strong,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
    position: 'relative',
    zIndex: 1,
  },
  cardMintAura: {
    bottom: 'auto',
    height: 210,
    left: '24%',
    right: -70,
    top: -92,
  },
  cardTopHighlight: {
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderRadius: radius.pill,
    height: 1,
    left: '10%',
    opacity: 0.86,
    position: 'absolute',
    right: '10%',
    top: 0,
  },
  glassCard: {
    backgroundColor: 'rgba(255,255,255,0.76)',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 30,
    borderWidth: 1,
    gap: 10,
    overflow: 'hidden',
    padding: 18,
    position: 'relative',
    ...shadow.raised,
  },
  composerIcon: {
    height: 18,
    width: 18,
  },
  composerPlaceholder: {
    color: color.text.muted,
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    minWidth: 0,
  },
  composerSend: {
    alignItems: 'center',
    backgroundColor: color.brand.primary,
    borderColor: 'rgba(255,255,255,0.82)',
    borderRadius: 20,
    borderWidth: 1,
    flexShrink: 0,
    height: 40,
    justifyContent: 'center',
    width: 40,
    ...shadow.primary,
  },
  composerSendIcon: {
    height: 21,
    tintColor: color.text.inverse,
    width: 21,
  },
  composerShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 25,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 58,
    overflow: 'hidden',
    paddingLeft: 15,
    paddingRight: 7,
    ...shadow.soft,
  },
  jobRoomComposerInput: {
    color: color.text.strong,
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    maxHeight: 92,
    minHeight: 38,
    minWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 8,
  },
  workerChatTextFieldShell: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    flex: 1,
    minHeight: 38,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  workerChatTextFieldStack: {
    flex: 1,
  },
  jobRoomSendDisabled: {
    backgroundColor: 'rgba(133,154,148,0.44)',
    shadowOpacity: 0,
  },
  privateKaelMediaImage: {
    backgroundColor: color.mint.mint100,
    borderRadius: 10,
    height: 42,
    width: 42,
  },
  privateKaelMediaPreview: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: color.mint.mint100,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    maxWidth: 190,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  privateKaelMediaRail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  privateKaelMediaText: {
    color: color.text.strong,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  privateKaelGreeting: {
    color: color.text.strong,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
  },
  onsiteAdvisoryRail: {
    backgroundColor: 'rgba(239, 251, 246, 0.9)',
    borderColor: color.mint.mint100,
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  onsiteAdvisoryText: {
    color: color.text.strong,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  composerUtility: {
    alignItems: 'center',
    backgroundColor: color.mint.mint50,
    borderRadius: 15,
    flexShrink: 0,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  completionHeroAura: {
    bottom: 'auto',
    height: 170,
    left: '36%',
    right: -62,
    top: -70,
  },
  completionHeroCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(246,255,252,0.84)',
    borderColor: 'rgba(127,226,215,0.72)',
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    minHeight: 118,
    overflow: 'hidden',
    padding: 16,
    position: 'relative',
    ...shadow.raised,
  },
  completionHeroCopy: {
    flex: 1,
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  completionHeroMeta: {
    color: color.text.secondary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    marginTop: 3,
  },
  completionHeroPill: {
    alignSelf: 'flex-start',
    backgroundColor: color.mint.mint50,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: color.brand.primaryDark,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 4,
    textTransform: 'uppercase',
  },
  completionHeroTitle: {
    color: color.text.strong,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 23,
    marginTop: 8,
  },
  completionLens: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: 'rgba(255,255,255,0.96)',
    borderRadius: 34,
    borderWidth: 1,
    flexShrink: 0,
    height: 74,
    justifyContent: 'center',
    position: 'relative',
    width: 74,
    zIndex: 1,
    ...shadow.primary,
  },
  completionLensLabel: {
    color: color.text.muted,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 11,
  },
  completionLensValue: {
    color: color.brand.primaryDark,
    fontSize: 25,
    fontWeight: '700',
    lineHeight: 29,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
  },
  headerTextColumn: {
    flex: 1,
    gap: 2,
  },
  headerMenuText: {
    color: color.brand.primaryDark,
    height: 42,
    fontSize: 18,
    fontWeight: '700',
    includeFontPadding: false,
    letterSpacing: 0,
    lineHeight: 42,
    textAlign: 'center',
    textAlignVertical: 'center',
    width: 42,
  },
  headerSubtitleText: {
    color: color.text.muted,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  heroBody: {
    color: color.text.secondary,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 21,
  },
  heroTitle: {
    color: color.text.strong,
    fontSize: 26,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 32,
  },
  heroTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  iconBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 22,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 52,
    ...shadow.soft,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: glass.bgStrong,
    borderColor: 'rgba(184,231,223,0.78)',
    borderRadius: radius.md,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    padding: 0,
    width: 42,
    ...shadow.soft,
  },
  iconButtonIcon: {
    flexShrink: 0,
  },
  iconImage: {
    height: 30,
    width: 30,
  },
  evidenceBadge: {
    backgroundColor: 'rgba(4,29,34,0.65)',
    borderRadius: radius.pill,
    bottom: 7,
    color: color.text.inverse,
    fontSize: 8,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 3,
    position: 'absolute',
    right: 7,
  },
  evidenceGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  evidenceImage: {
    height: 64,
    width: 64,
  },
  evidencePickerButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderColor: 'rgba(216,235,232,0.92)',
    borderRadius: 22,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 11,
    height: 60,
    justifyContent: 'center',
    minWidth: 0,
    overflow: 'hidden',
    position: 'relative',
    paddingHorizontal: 10,
    ...shadow.soft,
  },
  evidencePickerIcon: {
    height: 38,
    position: 'relative',
    width: 38,
    zIndex: 1,
  },
  evidencePickerRow: {
    flexDirection: 'row',
    gap: 10,
  },
  evidencePickerText: {
    color: color.brand.primaryDark,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 16,
    position: 'relative',
    zIndex: 1,
  },
  evidenceTray: {
    flexDirection: 'row',
    gap: 9,
  },
  evidenceTrayBadge: {
    backgroundColor: 'rgba(4,29,34,0.66)',
    borderRadius: radius.pill,
    bottom: 7,
    color: color.text.inverse,
    fontSize: 8,
    fontWeight: '700',
    lineHeight: 10,
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 3,
    position: 'absolute',
    right: 7,
  },
  evidenceTrayIcon: {
    height: 34,
    width: 34,
  },
  evidenceTrayIconShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.62)',
    borderColor: 'rgba(255,255,255,0.8)',
    borderRadius: 22,
    borderWidth: 1,
    height: 54,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 54,
  },
  evidenceTrayImage: {
    height: '100%',
    width: '100%',
  },
  evidenceTrayTile: {
    alignItems: 'center',
    backgroundColor: '#D6E7E4',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 20,
    borderWidth: 1,
    flex: 1,
    height: 82,
    justifyContent: 'center',
    minWidth: 0,
    overflow: 'hidden',
    position: 'relative',
    ...shadow.soft,
  },
  evidenceTile: {
    alignItems: 'center',
    backgroundColor: '#D6E7E4',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 20,
    borderWidth: 1,
    flex: 1,
    height: 84,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    ...shadow.soft,
  },
  workProgressBoardCount: {
    color: color.brand.primaryDark,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  workProgressBoardMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  workProgressBoardShell: {
    gap: 8,
  },
  workProgressBoardTitle: {
    color: color.text.strong,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
  },
  finalChecklistCard: {
    backgroundColor: 'rgba(246,255,252,0.84)',
    borderColor: 'rgba(127,226,215,0.72)',
    borderRadius: 25,
    borderWidth: 1,
    gap: 7,
    overflow: 'hidden',
    padding: 12,
    position: 'relative',
    ...shadow.soft,
  },
  finalChecklistMeta: {
    color: color.text.muted,
    flexShrink: 1,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
    maxWidth: 78,
    minWidth: 48,
    textAlign: 'right',
  },
  finalChecklistRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: color.surface.stroke,
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    minHeight: 48,
    paddingHorizontal: 10,
    paddingVertical: 8,
    position: 'relative',
    zIndex: 1,
  },
  finalChecklistState: {
    alignItems: 'center',
    backgroundColor: '#EDF3F2',
    borderRadius: 12,
    height: 25,
    justifyContent: 'center',
    width: 25,
  },
  finalChecklistStateDone: {
    backgroundColor: color.brand.primary,
  },
  finalChecklistStateText: {
    color: color.text.muted,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
  finalChecklistStateTextDone: {
    color: color.text.inverse,
  },
  finalChecklistTitle: {
    color: color.text.strong,
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    minWidth: 0,
  },
  eligibilityCard: {
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 24,
    borderWidth: 1,
    gap: 7,
    overflow: 'hidden',
    padding: 14,
    ...shadow.soft,
  },
  eligibilityLabel: {
    color: color.text.strong,
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    minWidth: 0,
  },
  eligibilityMeta: {
    color: color.text.muted,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
    maxWidth: 86,
    textAlign: 'right',
  },
  eligibilityRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: color.surface.stroke,
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    minHeight: 42,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  eligibilityState: {
    alignItems: 'center',
    backgroundColor: color.mint.mint50,
    borderRadius: 12,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  eligibilityStateBlocked: {
    backgroundColor: '#FFF7E6',
  },
  eligibilityStateDone: {
    backgroundColor: color.brand.primary,
  },
  eligibilityStateText: {
    color: color.brand.primaryDark,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
  eligibilityStateTextDone: {
    color: color.text.inverse,
  },
  etaLabel: {
    color: color.text.muted,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  etaLens: {
    alignItems: 'center',
    backgroundColor: 'rgba(230,251,243,0.72)',
    borderColor: 'rgba(255,255,255,0.96)',
    borderRadius: 34,
    borderWidth: 1,
    height: 68,
    justifyContent: 'center',
    position: 'relative',
    width: 68,
    zIndex: 1,
    ...shadow.soft,
  },
  etaLensLabel: {
    color: color.text.muted,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 11,
  },
  etaLensValue: {
    color: color.brand.primaryDark,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 28,
  },
  etaMeta: {
    color: color.text.secondary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    marginTop: 2,
  },
  etaSummaryCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(246,255,252,0.84)',
    borderColor: 'rgba(127,226,215,0.72)',
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    minHeight: 112,
    overflow: 'hidden',
    padding: 16,
    position: 'relative',
    ...shadow.raised,
  },
  etaSummaryCopy: {
    flex: 1,
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  routeEtaSummaryAura: {
    bottom: -88,
    height: 280,
    left: -72,
    opacity: 1,
    right: -58,
    top: -84,
  },
  routeEtaSummaryZipAura: {
    height: 240,
    opacity: 0.82,
    right: -92,
    top: -76,
    width: 324,
  },
  etaValue: {
    color: color.text.strong,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 27,
    marginTop: 4,
  },
  inboxTab: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingVertical: 12,
  },
  inboxTabActive: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderRadius: 20,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingVertical: 12,
  },
  inboxTabMuted: {
    color: color.text.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  inboxTabText: {
    color: color.brand.primaryDark,
    fontSize: 13,
    fontWeight: '700',
  },
  inboxTabs: {
    backgroundColor: 'rgba(222,242,238,0.72)',
    borderColor: 'rgba(255,255,255,0.88)',
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 4,
  },
  infoIcon: {
    height: 42,
    width: 42,
  },
  infoIconShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: 22,
    borderWidth: 1,
    flexShrink: 0,
    height: 64,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 64,
    ...shadow.soft,
  },
  infoCell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.74)',
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    gap: 3,
    justifyContent: 'center',
    minHeight: 74,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 10,
    ...shadow.soft,
  },
  infoCellLabel: {
    color: color.text.muted,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
    textAlign: 'center',
  },
  infoCellValue: {
    color: color.text.strong,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
    textAlign: 'center',
  },
  infoGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  infoLabel: {
    color: color.text.strong,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  infoListCard: {
    backgroundColor: 'rgba(255,255,255,0.73)',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 25,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    ...shadow.soft,
  },
  infoRow: {
    alignItems: 'center',
    borderBottomColor: 'rgba(176,222,214,0.38)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 14,
    padding: 16,
    position: 'relative',
    zIndex: 1,
  },
  infoTextColumn: {
    flex: 1,
    gap: 3,
  },
  infoValue: {
    color: color.text.secondary,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  iconTileMintAura: {
    opacity: 0.92,
  },
  jobSummaryCard: {
    backgroundColor: 'rgba(255,255,255,0.79)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 24,
    borderWidth: 1,
    minHeight: 102,
    overflow: 'hidden',
    padding: 13,
    position: 'relative',
    ...shadow.soft,
  },
  jobSummaryChip: {
    alignSelf: 'flex-start',
    backgroundColor: color.mint.mint50,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: color.brand.primaryDark,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  jobSummaryMeta: {
    color: color.text.muted,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
    marginTop: 2,
    minWidth: 0,
  },
  jobSummaryPrice: {
    color: color.brand.primaryDark,
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 22,
    maxWidth: 116,
    minWidth: 82,
    textAlign: 'right',
  },
  jobSummaryServiceLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  jobSummaryTitle: {
    color: color.text.strong,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 6,
    minWidth: 0,
  },
  acceptReviewStack: {
    gap: 10,
  },
  acceptSummaryCard: {
    backgroundColor: 'rgba(244,255,252,0.88)',
    borderColor: 'rgba(161,235,224,0.62)',
    borderRadius: 28,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 116,
    overflow: 'hidden',
    padding: 14,
    position: 'relative',
    ...shadow.soft,
  },
  acceptSummaryAura: {
    bottom: -88,
    height: 272,
    left: -66,
    opacity: 1,
    right: -56,
    top: -72,
  },
  acceptSummaryZipAura: {
    height: 232,
    opacity: 0.78,
    right: -86,
    top: -64,
    width: 318,
  },
  acceptSummaryLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11,
    position: 'relative',
    zIndex: 1,
  },
  acceptSummaryIconTile: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: 20,
    borderWidth: 1,
    flexShrink: 0,
    height: 58,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 58,
  },
  acceptSummaryIcon: {
    alignSelf: 'center',
    height: 46,
    width: 46,
  },
  acceptSummaryCopy: {
    alignSelf: 'stretch',
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  acceptSummaryTitle: {
    color: color.text.strong,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 21,
    minWidth: 0,
  },
  acceptSummaryMeta: {
    color: color.text.muted,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
    marginTop: 3,
    minWidth: 0,
  },
  acceptSummaryPriceSlot: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flexShrink: 0,
    justifyContent: 'center',
    maxWidth: 116,
    minWidth: 62,
  },
  acceptSummaryPrice: {
    color: color.brand.primaryDark,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  acceptChecklistCard: {
    backgroundColor: 'rgba(249,255,252,0.8)',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 24,
    borderWidth: 1,
    gap: 7,
    overflow: 'hidden',
    padding: 12,
    position: 'relative',
    ...shadow.soft,
  },
  acceptChecklistAura: {
    bottom: -70,
    height: 240,
    left: -56,
    opacity: 0.64,
    right: -56,
    top: -56,
  },
  acceptChecklistZipAura: {
    height: 190,
    opacity: 0.48,
    right: -82,
    top: -58,
    width: 270,
  },
  acceptCheckRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(249,255,252,0.78)',
    borderColor: 'rgba(184,231,223,0.7)',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 38,
    overflow: 'hidden',
    paddingHorizontal: 11,
    paddingVertical: 8,
    position: 'relative',
    zIndex: 1,
  },
  acceptCheckRowAura: {
    bottom: -40,
    height: 118,
    opacity: 0.5,
    right: -54,
    top: -38,
    width: 188,
  },
  acceptCheckRowGap: {},
  acceptCheckState: {
    alignItems: 'center',
    backgroundColor: 'rgba(235,245,243,0.9)',
    borderRadius: 12,
    height: 22,
    justifyContent: 'center',
    position: 'relative',
    width: 22,
    zIndex: 1,
  },
  acceptCheckStateDone: {
    backgroundColor: 'rgba(209,255,244,0.95)',
  },
  acceptCheckStateBlocked: {
    backgroundColor: 'rgba(255,240,230,0.9)',
  },
  acceptCheckStateText: {
    color: color.text.muted,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  acceptCheckStateTextDone: {
    color: color.brand.primaryDark,
  },
  acceptCheckLabel: {
    color: color.text.strong,
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  acceptCheckMeta: {
    color: color.text.secondary,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
    maxWidth: 86,
    position: 'relative',
    textAlign: 'right',
    zIndex: 1,
  },
  acceptCommitmentCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(249,255,252,0.82)',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 78,
    overflow: 'hidden',
    padding: 12,
    position: 'relative',
    ...shadow.soft,
  },
  acceptCommitmentAura: {
    bottom: -70,
    height: 230,
    left: -54,
    opacity: 0.58,
    right: -54,
    top: -58,
  },
  acceptCommitmentZipAura: {
    height: 178,
    opacity: 0.42,
    right: -70,
    top: -48,
    width: 260,
  },
  acceptCommitmentIconTile: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: 17,
    borderWidth: 1,
    flexShrink: 0,
    height: 50,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 50,
    zIndex: 1,
  },
  acceptCommitmentIcon: {
    height: 40,
    width: 40,
  },
  acceptCommitmentCopy: {
    flex: 1,
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  acceptCommitmentTitle: {
    color: color.text.strong,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  acceptCommitmentMeta: {
    color: color.text.secondary,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
    marginTop: 3,
  },
  acceptBoundaryNote: {
    backgroundColor: 'rgba(239,255,251,0.82)',
    borderColor: 'rgba(154,226,214,0.86)',
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 13,
    paddingVertical: 12,
    position: 'relative',
  },
  acceptBoundaryAura: {
    bottom: -72,
    height: 190,
    left: -50,
    opacity: 0.62,
    right: -50,
    top: -60,
  },
  acceptBoundaryZipAura: {
    height: 148,
    opacity: 0.44,
    right: -52,
    top: -46,
    width: 228,
  },
  acceptBoundaryText: {
    color: color.text.secondary,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
    position: 'relative',
    zIndex: 1,
  },
  acceptBoundaryStrong: {
    color: color.text.strong,
    fontWeight: '700',
  },
  acceptConfirmButton: {
    alignItems: 'center',
    backgroundColor: '#13CBB8',
    borderColor: 'rgba(0,137,124,0.2)',
    borderRadius: 24,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 56,
    overflow: 'hidden',
    paddingHorizontal: 18,
    position: 'relative',
    shadowColor: '#059F8E',
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.27,
    shadowRadius: 28,
  },
  acceptConfirmDisabled: {
    opacity: 0.88,
  },
  acceptConfirmText: {
    color: color.text.inverse,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
    zIndex: 1,
  },
  offerDetailStack: {
    gap: 10,
  },
  offerDetailSummaryCard: {
    backgroundColor: 'rgba(249,255,252,0.84)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 24,
    borderWidth: 1,
    minHeight: 132,
    overflow: 'hidden',
    padding: 14,
    position: 'relative',
    ...shadow.soft,
  },
  offerDetailSummaryAura: {
    bottom: -86,
    height: 276,
    left: -60,
    opacity: 0.9,
    right: -60,
    top: -64,
  },
  offerDetailSummaryZipAura: {
    height: 210,
    opacity: 0.66,
    right: -76,
    top: -48,
    width: 292,
  },
  offerDetailSummaryLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11,
    position: 'relative',
    zIndex: 1,
  },
  offerDetailIconTile: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: 18,
    borderWidth: 1,
    flexShrink: 0,
    height: 54,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 54,
  },
  offerDetailIcon: {
    alignSelf: 'center',
    height: 44,
    width: 44,
  },
  offerDetailSummaryCopy: {
    flex: 1,
    minWidth: 0,
  },
  offerDetailStatusChip: {
    alignSelf: 'flex-start',
    backgroundColor: color.mint.mint50,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: color.brand.primaryDark,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  offerDetailTitle: {
    color: color.text.strong,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
    marginTop: 7,
    minWidth: 0,
  },
  offerDetailMeta: {
    color: color.text.muted,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    marginTop: 3,
    minWidth: 0,
  },
  offerDetailPrice: {
    color: color.brand.primaryDark,
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 22,
    maxWidth: 124,
    minWidth: 86,
    textAlign: 'right',
  },
  offerDetailChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 12,
    position: 'relative',
    zIndex: 1,
  },
  offerDetailChip: {
    backgroundColor: 'rgba(227,255,247,0.88)',
    borderColor: 'rgba(154,226,214,0.86)',
    borderRadius: radius.pill,
    borderWidth: 1,
    color: color.brand.primaryDark,
    flexShrink: 1,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  offerDetailListCard: {
    backgroundColor: 'rgba(249,255,252,0.8)',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    ...shadow.soft,
  },
  offerDetailListAura: {
    bottom: -70,
    height: 246,
    left: -56,
    opacity: 0.66,
    right: -56,
    top: -56,
  },
  offerDetailListZipAura: {
    height: 196,
    opacity: 0.52,
    right: -82,
    top: -58,
    width: 274,
  },
  offerDetailListLowerAura: {
    bottom: -76,
    height: 220,
    left: -64,
    opacity: 0.46,
    right: -36,
    top: 'auto',
  },
  offerDetailListRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 74,
    padding: 12,
    position: 'relative',
    zIndex: 1,
  },
  offerDetailListDivider: {
    borderTopColor: 'rgba(205,226,222,0.78)',
    borderTopWidth: 1,
  },
  offerDetailRowIconTile: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: 16,
    borderWidth: 1,
    flexShrink: 0,
    height: 48,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 48,
  },
  offerDetailRowIcon: {
    alignSelf: 'center',
    height: 40,
    width: 40,
  },
  offerDetailRowCopy: {
    flex: 1,
    minWidth: 0,
  },
  offerDetailRowTitle: {
    color: color.text.strong,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
  },
  offerDetailRowMeta: {
    color: color.text.secondary,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
    marginTop: 3,
  },
  offerDetailRowStatus: {
    backgroundColor: color.mint.mint50,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: color.brand.primaryDark,
    flexShrink: 0,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
    maxWidth: 82,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 5,
    textAlign: 'center',
  },
  jobMetaPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    gap: 2,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 0,
    paddingHorizontal: 9,
    paddingVertical: 7,
    ...shadow.soft,
  },
  jobMetaPillLabel: {
    color: color.text.muted,
    fontSize: 8,
    fontWeight: '700',
    lineHeight: 10,
    textAlign: 'center',
  },
  jobMetaPillRow: {
    flexDirection: 'row',
    gap: 8,
  },
  jobMetaPillValue: {
    color: color.brand.primaryDark,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
    textAlign: 'center',
  },
  kaelBriefBody: {
    color: color.text.secondary,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
  },
  kaelBriefCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 76,
    overflow: 'hidden',
    padding: 11,
    position: 'relative',
    ...shadow.soft,
  },
  kaelBriefAura: {
    bottom: -30,
    height: 124,
    left: -26,
    opacity: 0.72,
    right: -34,
    top: -26,
  },
  kaelBriefChevron: {
    color: color.brand.primaryDark,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 24,
    position: 'relative',
    zIndex: 1,
  },
  kaelBriefZipAura: {
    height: 136,
    opacity: 0.58,
    right: -72,
    top: -62,
    width: 176,
  },
  kaelBriefIcon: {
    height: 36,
    width: 36,
  },
  kaelBriefIconTile: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: 17,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 48,
    zIndex: 1,
  },
  kaelBriefText: {
    flex: 1,
    gap: 3,
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  kaelBriefTitle: {
    color: color.text.strong,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  workerHomeKaelAddress: {
    color: color.text.secondary,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  workerHomeKaelBriefLine: {
    color: color.text.secondary,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
    paddingHorizontal: 4,
  },
  workerHomeKaelContext: {
    backgroundColor: 'rgba(247,255,252,0.9)',
    borderColor: 'rgba(184,231,223,0.76)',
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  workerHomeKaelDisclaimer: {
    color: color.text.muted,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  workerHomeKaelMetric: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: 'rgba(216,235,232,0.78)',
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    gap: 3,
    minHeight: 52,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  workerHomeKaelMetricGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  workerHomeKaelMetricLabel: {
    color: color.text.muted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 12,
    textTransform: 'uppercase',
  },
  workerHomeKaelMetricValue: {
    color: color.text.strong,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  workerHomeKaelRiskStatus: {
    color: color.brand.primaryDark,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    minWidth: 42,
    textAlign: 'right',
  },
  workerHomeKaelStack: {
    gap: 10,
  },
  workerHomeKaelStatusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  workerHomeKaelStatusText: {
    color: color.brand.primaryDark,
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  kaelDraftAvatar: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: 18,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 52,
    zIndex: 1,
  },
  kaelDraftBody: {
    color: color.text.secondary,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
  },
  kaelDraftCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(246,255,252,0.84)',
    borderColor: 'rgba(127,226,215,0.72)',
    borderRadius: 21,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    minHeight: 74,
    overflow: 'hidden',
    padding: 11,
    position: 'relative',
    ...shadow.soft,
  },
  kaelDraftChevron: {
    color: color.brand.primaryDark,
    fontSize: 21,
    fontWeight: '700',
    lineHeight: 24,
    position: 'relative',
    zIndex: 1,
  },
  kaelDraftCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  kaelDraftIcon: {
    height: 36,
    width: 36,
  },
  kaelDraftTitle: {
    color: color.text.strong,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  kickerText: {
    color: color.brand.primaryDark,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  listCardMintAura: {
    bottom: 'auto',
    height: 160,
    left: '42%',
    right: -68,
    top: -74,
  },
  mapGridLine: {
    backgroundColor: 'rgba(169,210,202,0.48)',
    height: 2,
    left: 18,
    position: 'absolute',
    right: 18,
    top: 72,
    transform: [{ rotate: '-13deg' }],
  },
  mapPanel: {
    backgroundColor: 'rgba(244,255,252,0.9)',
    borderColor: 'rgba(161,235,224,0.62)',
    borderRadius: 27,
    borderWidth: 1,
    height: 210,
    overflow: 'hidden',
    position: 'relative',
    ...shadow.soft,
  },
  demandMapPanelAura: {
    bottom: -18,
    left: -10,
    opacity: 0.95,
    right: -10,
    top: -18,
    zIndex: 1,
  },
  routeMapPanelAura: {
    bottom: -18,
    left: -10,
    opacity: 0.98,
    right: -10,
    top: -18,
    zIndex: 1,
  },
  mapStaticImage: {
    height: '100%',
    position: 'relative',
    width: '100%',
    zIndex: 0,
  },
  mapUnavailable: {
    alignItems: 'center',
    flex: 1,
    gap: 8,
    justifyContent: 'center',
    paddingHorizontal: 28,
    position: 'relative',
    zIndex: 2,
  },
  mapUnavailableMeta: {
    color: color.text.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    textAlign: 'center',
  },
  mapUnavailableTitle: {
    color: color.text.strong,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 21,
    textAlign: 'center',
  },
  mapPoint: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    position: 'absolute',
    width: 44,
  },
  mapPointJob: {
    backgroundColor: color.brand.primary,
    right: 42,
    top: 44,
  },
  mapPointAreaOne: {
    backgroundColor: color.brand.primary,
    left: 72,
    top: 58,
  },
  mapPointAreaTwo: {
    backgroundColor: color.brand.primary,
    bottom: 30,
    right: 38,
  },
  mapPointCustomer: {
    backgroundColor: color.brand.primary,
    right: 34,
    top: 118,
    width: 64,
  },
  mapPointSelf: {
    backgroundColor: '#5d77f0',
    left: '46%',
    top: 105,
  },
  mapPointText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  mapRoad: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: 'rgba(174,211,205,0.38)',
    borderRadius: 999,
    borderWidth: 1,
    height: 5,
    position: 'absolute',
  },
  mapRoadFour: {
    left: 66,
    top: 148,
    transform: [{ rotate: '8deg' }],
    width: 236,
  },
  mapRoadOne: {
    left: 18,
    top: 92,
    transform: [{ rotate: '-14deg' }],
    width: 310,
  },
  mapRoadThree: {
    left: 102,
    top: 34,
    transform: [{ rotate: '64deg' }],
    width: 220,
  },
  mapRoadTwo: {
    left: 48,
    top: 138,
    transform: [{ rotate: '8deg' }],
    width: 280,
  },
  metricLabel: {
    color: color.text.secondary,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  metricTile: {
    backgroundColor: 'rgba(255,255,255,0.73)',
    borderColor: color.surface.stroke,
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    gap: 6,
    minHeight: 86,
    minWidth: 0,
    overflow: 'hidden',
    padding: 14,
    position: 'relative',
    ...shadow.soft,
  },
  metricValue: {
    color: color.text.strong,
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  modeSwitch: {
    backgroundColor: 'rgba(222,242,238,0.62)',
    borderColor: 'rgba(255,255,255,0.88)',
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    minHeight: 60,
    overflow: 'hidden',
    padding: 5,
    shadowColor: '#088779',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
  },
  modeTab: {
    alignItems: 'center',
    borderRadius: 23,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
    minWidth: 0,
    paddingHorizontal: 8,
  },
  modeTabActive: {
    backgroundColor: 'rgba(255,255,255,0.91)',
    shadowColor: color.brand.primaryDeep,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.09,
    shadowRadius: 18,
  },
  modeTabText: {
    color: color.text.muted,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 17,
    textAlign: 'center',
  },
  modeTabTextActive: {
    color: color.brand.primaryDark,
  },
  navButton: {
    alignItems: 'center',
    borderRadius: component.button.secondary.radius,
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
    minWidth: 0,
    overflow: 'hidden',
    paddingHorizontal: 14,
    position: 'relative',
    zIndex: 1,
  },
  navButtonDisabled: {
    opacity: 0.52,
  },
  navButtonDisabledText: {
    color: color.text.muted,
  },
  sourceActionDisabled: {
    opacity: 1,
  },
  navButtonPrimary: {
    backgroundColor: color.brand.primary,
    ...shadow.primary,
  },
  navButtonPrimaryText: {
    color: color.text.inverse,
  },
  actionRailPrimaryText: {
    color: color.brand.primaryDark,
  },
  navButtonSecondary: {
    backgroundColor: glass.bgStrong,
    borderColor: color.surface.strokeStrong,
    borderWidth: 1,
  },
  navButtonText: {
    color: color.brand.primaryDark,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 19,
    textAlign: 'center',
  },
  actionRailButtonText: {
    fontSize: 13,
    lineHeight: 17,
  },
  actionRailFormulaAura: {
    bottom: -42,
    left: -34,
    opacity: 0.82,
    right: -34,
    top: -48,
  },
  actionRailZipAura: {
    bottom: -18,
    height: 118,
    left: '42%',
    opacity: 0.56,
    right: -42,
    top: -26,
  },
  workerProfileAuraButton: {
    backgroundColor: 'rgba(248,255,253,0.92)',
    borderColor: 'rgba(45,211,193,0.38)',
    overflow: 'hidden',
    shadowColor: '#088779',
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
  },
  workerProfileLogoutCta: {
    marginTop: -2,
  },
  navigationRow: {
    flexDirection: 'row',
    gap: 10,
    overflow: 'visible',
    position: 'relative',
  },
  scopePhotoPickerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  scopePhotoPickerButton: {
    flexBasis: 112,
    flexGrow: 0,
    flexShrink: 0,
    minHeight: 50,
    paddingHorizontal: 12,
  },
  scopePhotoPickerHint: {
    flex: 1,
    lineHeight: 17,
    minWidth: 0,
  },
  scopeSubmitButton: {
    flex: 0,
    minHeight: 54,
    width: '100%',
  },
  scopeSubmitButtonText: {
    color: color.text.inverse,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'center',
    zIndex: 2,
  },
  scopeSubmitDisabled: {
    backgroundColor: 'rgba(229,247,243,0.92)',
    borderColor: color.mint.mint100,
    shadowOpacity: 0,
  },
  scopeSubmitDisabledText: {
    color: color.brand.primaryDark,
    opacity: 0.58,
  },
  opaqueCard: {
    backgroundColor: color.mint.white,
  },
  opportunityInboxStack: {
    gap: 8,
  },
  opportunityList: {
    gap: 8,
  },
  opportunityCaption: {
    color: color.text.muted,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
    marginTop: 3,
  },
  opportunityOpenButton: {
    alignItems: 'center',
    backgroundColor: color.mint.mint50,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    marginTop: 8,
    minHeight: 28,
    minWidth: 52,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  opportunityOpenButtonText: {
    color: color.brand.primaryDark,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
  opportunityCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.74)',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 84,
    overflow: 'hidden',
    padding: 11,
    position: 'relative',
    ...shadow.soft,
  },
  opportunityIcon: {
    height: 38,
    width: 38,
  },
  opportunityIconTile: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: 16,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 48,
  },
  opportunityMeta: {
    color: color.text.muted,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
    marginTop: 2,
  },
  opportunityPayout: {
    color: color.brand.primaryDark,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    textAlign: 'right',
  },
  opportunityPayoutColumn: {
    alignItems: 'flex-end',
    maxWidth: 104,
    minWidth: 72,
  },
  opportunityTextColumn: {
    flex: 1,
    minWidth: 0,
  },
  opportunityTitle: {
    color: color.text.strong,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  pageMintAura: {
    opacity: 0.92,
  },
  shiftBriefPageAura: {
    bottom: 'auto',
    height: 300,
    left: -22,
    opacity: 0.82,
    right: -22,
    top: 72,
  },
  demandMapPageAura: {
    bottom: 'auto',
    height: 560,
    left: -36,
    opacity: 1,
    right: -36,
    top: 24,
  },
  demandMapPageZipAura: {
    height: 320,
    opacity: 0.8,
    right: -92,
    top: 150,
    width: 360,
  },
  opportunityInboxPageAura: {
    bottom: 'auto',
    height: 560,
    left: -44,
    opacity: 0.94,
    right: -44,
    top: 20,
  },
  opportunityInboxPageZipAura: {
    height: 340,
    opacity: 0.62,
    right: -92,
    top: 118,
    width: 390,
  },
  offerDetailPageAura: {
    bottom: 'auto',
    height: 580,
    left: -46,
    opacity: 0.96,
    right: -46,
    top: 18,
  },
  offerDetailPageZipAura: {
    height: 340,
    opacity: 0.64,
    right: -92,
    top: 120,
    width: 390,
  },
  offerDetailPageLowerAura: {
    bottom: 84,
    height: 320,
    left: -58,
    opacity: 0.68,
    right: -58,
    top: 'auto',
  },
  acceptReviewPageAura: {
    bottom: 'auto',
    height: 580,
    left: -46,
    opacity: 0.96,
    right: -46,
    top: 18,
  },
  acceptReviewPageZipAura: {
    height: 340,
    opacity: 0.64,
    right: -92,
    top: 120,
    width: 390,
  },
  acceptReviewPageLowerAura: {
    bottom: 84,
    height: 320,
    left: -58,
    opacity: 0.68,
    right: -58,
    top: 'auto',
  },
  routeEtaPageAura: {
    bottom: 'auto',
    height: 580,
    left: -46,
    opacity: 0.96,
    right: -46,
    top: 18,
  },
  routeEtaPageZipAura: {
    height: 340,
    opacity: 0.64,
    right: -92,
    top: 122,
    width: 390,
  },
  arrivalCheckinPageAura: {
    bottom: 'auto',
    height: 580,
    left: -46,
    opacity: 0.96,
    right: -46,
    top: 18,
  },
  arrivalCheckinPageZipAura: {
    height: 340,
    opacity: 0.64,
    right: -92,
    top: 122,
    width: 390,
  },
  earningsPageZipAura: {
    height: 390,
    opacity: 0.76,
    right: -108,
    top: 86,
    width: 430,
  },
  earningsPageLowerAura: {
    bottom: 40,
    height: 390,
    left: -92,
    opacity: 0.74,
    right: -72,
    top: 'auto',
  },
  kaelOrbPageZipAura: {
    bottom: 84,
    height: 360,
    opacity: 0.72,
    right: -98,
    top: 'auto',
    width: 390,
  },
  caseFlowPageLowerAura: {
    bottom: 66,
    height: 360,
    left: -68,
    opacity: 0.7,
    right: -68,
    top: 'auto',
  },
  demandMapInfoListAura: {
    bottom: -58,
    height: 250,
    left: -46,
    opacity: 0.58,
    right: -46,
    top: -48,
  },
  smartSchedulePageAura: {
    bottom: 'auto',
    height: 620,
    left: -44,
    opacity: 0.98,
    right: -44,
    top: 18,
  },
  smartSchedulePageLowerAura: {
    bottom: 72,
    height: 360,
    left: -62,
    opacity: 0.76,
    right: -62,
    top: 'auto',
  },
  smartSchedulePageZipAura: {
    height: 360,
    opacity: 0.76,
    right: -96,
    top: 112,
    width: 390,
  },
  shiftBriefHeroCard: {
    backgroundColor: 'rgba(248,255,252,0.82)',
    borderColor: 'rgba(255,255,255,0.94)',
    minHeight: 120,
    padding: 16,
  },
  shiftBriefHeroCopy: {
    flex: 1,
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  shiftBriefHeroIcon: {
    height: 46,
    width: 46,
  },
  shiftBriefHeroIconTile: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: 20,
    borderWidth: 1,
    flexShrink: 0,
    height: 66,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 66,
    zIndex: 1,
    ...shadow.soft,
  },
  shiftBriefHeroInner: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    position: 'relative',
    zIndex: 1,
  },
  phaseText: {
    color: color.brand.primaryDark,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
  },
  primaryActionButton: {
    alignItems: 'center',
    backgroundColor: color.brand.primary,
    borderRadius: 26,
    borderColor: component.button.primary.border,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 56,
    overflow: 'hidden',
    paddingHorizontal: 18,
    position: 'relative',
    ...shadow.primary,
  },
  primaryActionButtonSource: {
    backgroundColor: '#13CBB8',
    borderColor: 'rgba(2,126,115,0.22)',
    borderWidth: 1,
    shadowColor: '#059F8E',
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.27,
    shadowRadius: 28,
  },
  primaryActionTopHighlight: {
    backgroundColor: 'rgba(255,255,255,0.64)',
    borderRadius: radius.pill,
    height: 1,
    left: 28,
    opacity: 0.8,
    position: 'absolute',
    right: 28,
    top: 1,
  },
  primaryActionText: {
    color: color.text.inverse,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0,
    zIndex: 2,
  },
  priceLine: {
    alignItems: 'flex-start',
    borderBottomColor: 'rgba(216,235,232,0.64)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'space-between',
    minHeight: 44,
    paddingVertical: 10,
    position: 'relative',
    zIndex: 1,
  },
  priceLineLabel: {
    color: color.text.secondary,
    flex: 1,
    minWidth: 0,
    paddingRight: 2,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  priceLineValue: {
    color: color.text.strong,
    flex: 1.1,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    minWidth: 92,
    textAlign: 'right',
  },
  priceLinesCard: {
    backgroundColor: 'rgba(246,255,252,0.84)',
    borderColor: 'rgba(127,226,215,0.72)',
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 6,
    position: 'relative',
    ...shadow.soft,
  },
  priceTotalLabel: {
    color: color.text.strong,
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
    minWidth: 0,
    paddingRight: 2,
  },
  priceTotalLine: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'space-between',
    minHeight: 52,
    paddingTop: 12,
    position: 'relative',
    zIndex: 1,
  },
  priceTotalValue: {
    color: color.brand.primaryDark,
    flex: 1.1,
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 23,
    minWidth: 98,
    textAlign: 'right',
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  disabledButton: {
    opacity: 0.62,
  },
  quickActionCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.76)',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    minHeight: 72,
    overflow: 'hidden',
    paddingHorizontal: 11,
    paddingVertical: 10,
    position: 'relative',
    width: '48.7%',
    ...shadow.soft,
  },
  quickActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    position: 'relative',
    zIndex: 1,
  },
  quickActionIcon: {
    height: 32,
    width: 32,
  },
  quickActionIconTile: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: 16,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    flexShrink: 0,
    width: 42,
    zIndex: 1,
  },
  quickActionMeta: {
    color: color.text.muted,
    flexShrink: 1,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
    marginTop: 2,
  },
  quickActionText: {
    flex: 1,
    minWidth: 0,
    zIndex: 1,
  },
  quickActionTitle: {
    color: color.text.strong,
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  serviceAreaMapShell: {
    borderRadius: 26,
    overflow: 'hidden',
    position: 'relative',
  },
  serviceAreaChevronOpen: {
    transform: [{ rotate: '90deg' }],
  },
  serviceAreaExpandedStack: {
    gap: 10,
  },
  serviceAreaOpenCard: {
    minHeight: 82,
  },
  serviceAreaPlaceMeta: {
    color: color.text.muted,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
    position: 'relative',
    zIndex: 1,
  },
  serviceAreaPlaceName: {
    color: color.text.strong,
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    minWidth: 0,
  },
  serviceAreaPlacePanel: {
    backgroundColor: 'rgba(249,255,252,0.86)',
    borderColor: 'rgba(151,232,221,0.68)',
    borderRadius: 24,
    borderWidth: 1,
    gap: 10,
    overflow: 'hidden',
    padding: 14,
    position: 'relative',
    ...shadow.soft,
  },
  serviceAreaPlacePin: {
    alignItems: 'center',
    backgroundColor: 'rgba(221,255,247,0.92)',
    borderRadius: 15,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  serviceAreaPlacePinText: {
    color: color.brand.primaryDark,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  serviceAreaInlineEditor: {
    gap: 8,
    position: 'relative',
    zIndex: 1,
  },
  serviceAreaDraftLabel: {
    color: color.brand.primaryDark,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  serviceAreaDraftShell: {
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderColor: 'rgba(139,232,220,0.74)',
    minHeight: 54,
  },
  serviceAreaDraftInput: {
    color: color.text.strong,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 20,
  },
  serviceAreaSaveInlineButton: {
    backgroundColor: 'rgba(219,247,239,0.84)',
    borderColor: 'rgba(39,189,166,0.34)',
    borderWidth: 1,
    minHeight: 46,
  },
  serviceAreaPlaceRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderColor: 'rgba(205,226,222,0.78)',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 50,
    paddingHorizontal: 10,
    paddingVertical: 8,
    position: 'relative',
    zIndex: 1,
  },
  serviceAreaPlaceRowSelected: {
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: 'rgba(139,232,220,0.86)',
  },
  serviceAreaPlaceRowPending: {
    backgroundColor: 'rgba(232,255,249,0.76)',
    borderColor: 'rgba(39,189,166,0.48)',
  },
  serviceAreaPlaceTitle: {
    color: color.brand.primaryDark,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    position: 'relative',
    zIndex: 1,
  },
  serviceCardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    position: 'relative',
    zIndex: 1,
  },
  serviceSourceCard: {
    backgroundColor: 'rgba(255,255,255,0.80)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 23,
    borderWidth: 1,
    minHeight: 128,
    overflow: 'hidden',
    paddingHorizontal: 11,
    paddingVertical: 12,
    position: 'relative',
    width: '31.8%',
    ...shadow.soft,
  },
  serviceSourceCardSelected: {
    backgroundColor: 'rgba(232,255,249,0.88)',
    borderColor: 'rgba(13,179,159,0.48)',
    shadowColor: '#079B8A',
    shadowOffset: { height: 13, width: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
  },
  serviceSourceCardFull: {
    width: '100%',
  },
  serviceSourceCardHalf: {
    width: '48.7%',
  },
  serviceSourceCopy: {
    gap: 4,
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  serviceSourceIcon: {
    height: 42,
    width: 42,
  },
  serviceSourceIconTile: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: 22,
    borderWidth: 1,
    height: 64,
    justifyContent: 'center',
    marginBottom: 10,
    overflow: 'hidden',
    position: 'relative',
    width: 64,
    zIndex: 1,
  },
  serviceSourceMeta: {
    color: color.text.muted,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
    textAlign: 'center',
  },
  serviceSourceTitle: {
    color: color.text.strong,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
    textAlign: 'center',
  },
  skillsServiceHeroAmount: {
    fontSize: 24,
    lineHeight: 29,
    marginTop: 0,
  },
  progressRail: {
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  railCard: {
    backgroundColor: 'rgba(255,255,255,0.73)',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 13,
    paddingVertical: 12,
    ...shadow.soft,
  },
  railLabel: {
    color: color.text.muted,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
    minWidth: 0,
    textAlign: 'center',
    width: '100%',
  },
  railLabelActive: {
    color: color.brand.primaryDark,
    fontWeight: '700',
  },
  railLine: {
    backgroundColor: '#DCEBEA',
    borderRadius: 2,
    height: 2,
    left: '50%',
    position: 'absolute',
    right: '-50%',
    top: 11,
    zIndex: 0,
  },
  railLineDone: {
    backgroundColor: color.brand.primary,
  },
  railNode: {
    alignItems: 'center',
    backgroundColor: '#EEF4F3',
    borderColor: '#E0EBEA',
    borderRadius: 12,
    borderWidth: 1,
    height: 23,
    justifyContent: 'center',
    width: 23,
    zIndex: 1,
  },
  railNodeActive: {
    shadowColor: color.brand.primary,
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  railNodeOn: {
    backgroundColor: color.brand.primary,
    borderColor: color.brand.primary,
  },
  railNodeText: {
    color: '#8DA1A4',
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 11,
  },
  railNodeTextOn: {
    color: color.text.inverse,
  },
  railSegment: {
    alignItems: 'center',
    flex: 1,
    gap: 8,
    minWidth: 0,
    position: 'relative',
  },
  rankNode: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderColor: color.surface.stroke,
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    justifyContent: 'center',
    minHeight: 72,
    minWidth: 0,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  rankNodeActive: {
    backgroundColor: color.mint.mint50,
    borderColor: color.brand.primary,
    shadowColor: color.brand.primary,
    shadowOffset: { height: 9, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
  },
  rankNodeLabel: {
    color: color.text.muted,
    flexShrink: 1,
    fontSize: 8,
    fontWeight: '700',
    lineHeight: 10,
    textAlign: 'center',
  },
  rankNodeValue: {
    color: color.text.muted,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    textAlign: 'center',
  },
  rankNodeValueActive: {
    color: color.brand.primaryDark,
  },
  rankRail: {
    flexDirection: 'row',
    gap: 6,
  },
  rankingHeroRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    position: 'relative',
    zIndex: 1,
  },
  rankingHeroTitle: {
    color: color.text.strong,
    flexShrink: 1,
    fontSize: 23,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 28,
  },
  rankingProgressFill: {
    backgroundColor: color.brand.primaryDark,
    borderRadius: radius.pill,
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
  },
  rankingProgressTrack: {
    backgroundColor: 'rgba(180,220,214,0.58)',
    borderRadius: radius.pill,
    height: 6,
    marginTop: 3,
    overflow: 'hidden',
    width: '100%',
  },
  rankingScoreOrb: {
    alignItems: 'center',
    backgroundColor: 'rgba(232,255,249,0.72)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 43,
    borderWidth: 1,
    flexShrink: 0,
    height: 86,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 86,
    ...shadow.soft,
  },
  rankingScoreOrbAura: {
    bottom: -44,
    height: 168,
    left: -42,
    opacity: 0.7,
    right: -42,
    top: -42,
  },
  rankingScoreOrbLabel: {
    color: color.text.muted,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
    textAlign: 'center',
  },
  rankingScoreOrbValue: {
    color: color.brand.primaryDark,
    fontSize: 27,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 32,
    textAlign: 'center',
  },
  reliabilityAxisCopy: {
    flex: 1,
    gap: 7,
    minWidth: 0,
  },
  reliabilityAxisFill: {
    backgroundColor: color.brand.primary,
    borderRadius: radius.pill,
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
  },
  reliabilityAxisIcon: {
    height: 42,
    width: 42,
  },
  reliabilityAxisIconShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: 22,
    borderWidth: 1,
    height: 64,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    flexShrink: 0,
    width: 64,
    ...shadow.soft,
  },
  reliabilityAxisList: {
    backgroundColor: 'rgba(255,255,255,0.73)',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 25,
    borderWidth: 1,
    gap: 12,
    overflow: 'hidden',
    padding: 14,
    ...shadow.soft,
  },
  reliabilityAxisMeta: {
    color: color.text.secondary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  reliabilityAxisRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 64,
  },
  reliabilityAxisScore: {
    color: color.brand.primaryDark,
    flexShrink: 0,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    textAlign: 'right',
    width: 58,
  },
  reliabilityAxisTitle: {
    color: color.text.strong,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  reliabilityAxisTrack: {
    backgroundColor: '#D9EBE8',
    borderRadius: radius.pill,
    height: 7,
    overflow: 'hidden',
  },
  reliabilityStatLabel: {
    color: color.text.secondary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  reliabilityStatsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  reliabilityStatTile: {
    backgroundColor: 'rgba(255,255,255,0.74)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    gap: 7,
    justifyContent: 'center',
    minHeight: 76,
    minWidth: 0,
    overflow: 'hidden',
    paddingHorizontal: 15,
    paddingVertical: 13,
    position: 'relative',
    ...shadow.soft,
  },
  reliabilityStatValue: {
    color: color.text.strong,
    flexShrink: 1,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 25,
  },
  routeLine: {
    borderRadius: 999,
    height: 5,
    position: 'absolute',
  },
  routeLineEnd: {
    backgroundColor: color.brand.primary,
    right: 56,
    top: 115,
    transform: [{ rotate: '10deg' }],
    width: 122,
  },
  routeLineStart: {
    backgroundColor: '#4f9be8',
    left: 82,
    top: 118,
    transform: [{ rotate: '-21deg' }],
    width: 132,
  },
  safeArea: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  scrollContent: {
    gap: 18,
    paddingBottom: 126,
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  searchIconText: {
    color: color.brand.primaryDark,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 18,
  },
  searchPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderColor: 'rgba(16,169,150,0.82)',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    minHeight: 50,
    paddingHorizontal: 16,
    ...shadow.soft,
  },
  searchFeedback: {
    color: color.text.muted,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    paddingHorizontal: 12,
  },
  searchFieldStack: {
    gap: 0,
  },
  searchInput: {
    color: color.text.strong,
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    minWidth: 0,
  },
  searchPlaceholder: {
    color: color.text.muted,
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  searchStack: {
    gap: 8,
    position: 'relative',
    zIndex: 3,
  },
  searchSuggestionButton: {
    gap: 2,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  searchSuggestionMeta: {
    color: color.text.muted,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  searchSuggestionTitle: {
    color: color.text.strong,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
  },
  searchSuggestions: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: 'rgba(20,158,140,0.16)',
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    ...shadow.soft,
  },
  sectionStack: {
    gap: 14,
  },
  settlementCell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.79)',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    gap: 3,
    justifyContent: 'center',
    minHeight: 70,
    minWidth: 0,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 8,
    position: 'relative',
    ...shadow.soft,
  },
  settlementCellMintAura: {
    opacity: 0.78,
  },
  settlementCellZipMintAura: {
    opacity: 0.58,
  },
  settlementLabel: {
    color: color.text.muted,
    flexShrink: 1,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
    position: 'relative',
    textAlign: 'center',
    zIndex: 1,
  },
  settlementStrip: {
    flexDirection: 'row',
    gap: 8,
  },
  settlementValue: {
    color: color.text.strong,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    position: 'relative',
    textAlign: 'center',
    zIndex: 1,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: -4,
    paddingHorizontal: 2,
  },
  sectionHeaderAction: {
    color: color.brand.primaryDark,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  sectionHeaderTitle: {
    color: color.text.strong,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  scoreCaption: {
    color: color.text.muted,
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  scoreLabel: {
    color: color.text.muted,
    flexShrink: 1,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 11,
    textAlign: 'center',
  },
  scoreLens: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: 'rgba(255,255,255,0.95)',
    borderRadius: 36,
    borderWidth: 1,
    height: 70,
    justifyContent: 'center',
    left: 14,
    position: 'absolute',
    top: 14,
    width: 70,
  },
  scoreMintAura: {
    bottom: 'auto',
    height: 128,
    left: -22,
    right: 'auto',
    top: -22,
    width: 132,
  },
  scoreRing: {
    alignItems: 'center',
    height: 98,
    justifyContent: 'center',
    width: 98,
  },
  scoreSummary: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.73)',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 25,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    minHeight: 124,
    overflow: 'hidden',
    padding: 14,
    position: 'relative',
    ...shadow.soft,
  },
  scoreValue: {
    color: color.brand.primaryDark,
    flexShrink: 1,
    fontSize: 25,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 28,
    textAlign: 'center',
  },
  stepList: {
    gap: 7,
  },
  stepListFormula: {
    backgroundColor: 'rgba(246,255,252,0.84)',
    borderColor: 'rgba(127,226,215,0.72)',
    borderRadius: 25,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 10,
    position: 'relative',
    ...shadow.soft,
  },
  stepMeta: {
    color: color.text.muted,
    flexShrink: 1,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
    marginLeft: 'auto',
    maxWidth: 86,
    minWidth: 48,
    textAlign: 'right',
  },
  stepRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(247,255,251,0.76)',
    borderColor: 'rgba(216,235,232,0.8)',
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    minHeight: 56,
    paddingHorizontal: 10,
    paddingVertical: 9,
    position: 'relative',
    zIndex: 1,
  },
  stepRowActive: {
    borderColor: 'rgba(13,174,154,0.34)',
    shadowColor: color.brand.primary,
    shadowOffset: { height: 7, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
  },
  stepRowDone: {
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  stepState: {
    alignItems: 'center',
    backgroundColor: '#EDF3F2',
    borderRadius: 12,
    height: 27,
    justifyContent: 'center',
    width: 27,
  },
  stepStateActive: {
    backgroundColor: color.brand.primary,
    shadowColor: color.brand.primary,
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
  },
  stepStateDone: {
    backgroundColor: color.mint.mint50,
  },
  stepStateText: {
    color: color.text.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  stepStateTextActive: {
    color: color.text.inverse,
  },
  stepStateTextDone: {
    color: color.brand.primaryDark,
  },
  stepTitle: {
    color: color.text.strong,
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    minWidth: 0,
  },
  successBody: {
    color: color.text.secondary,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
    textAlign: 'center',
  },
  successCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 28,
    borderWidth: 1,
    gap: 8,
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingVertical: 18,
    position: 'relative',
    ...shadow.raised,
  },
  successAura: {
    bottom: 'auto',
    height: 190,
    left: '18%',
    right: -72,
    top: -86,
  },
  successCheck: {
    alignItems: 'center',
    backgroundColor: '#0DAE9A',
    borderColor: 'rgba(255,255,255,0.82)',
    borderRadius: 23,
    borderWidth: 3,
    height: 63,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 63,
    zIndex: 1,
    shadowColor: '#087F73',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 5,
  },
  successCheckFill: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  successCheckText: {
    color: color.text.inverse,
    fontSize: 36,
    fontWeight: '700',
    lineHeight: 40,
    position: 'relative',
    zIndex: 1,
  },
  successEmblem: {
    alignItems: 'center',
    backgroundColor: 'rgba(203,248,238,0.56)',
    borderColor: 'rgba(255,255,255,0.78)',
    borderRadius: 34,
    borderWidth: 1,
    height: 104,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 104,
    shadowColor: '#088779',
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 34,
    elevation: 4,
  },
  successEmblemAura: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.66,
    zIndex: 0,
  },
  successStatusPill: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: color.mint.mint50,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    maxWidth: '86%',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  successStatusText: {
    color: color.brand.primaryDark,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
    textTransform: 'uppercase',
  },
  successTitle: {
    color: color.text.strong,
    fontSize: 21,
    fontWeight: '700',
    lineHeight: 26,
    textAlign: 'center',
  },
  statusDot: {
    backgroundColor: color.brand.primary,
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 7,
    borderWidth: 2,
    height: 14,
    width: 14,
  },
  statusDotSmall: {
    backgroundColor: color.brand.primary,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  sourceProgressFill: {
    backgroundColor: 'rgba(184,231,223,0.42)',
    borderRadius: radius.pill,
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
    width: '0%',
  },
  sourceProgressFillActive: {
    backgroundColor: color.mint.mint50,
    width: '100%',
  },
  sourceProgressShell: {
    backgroundColor: 'rgba(255,255,255,0.68)',
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    marginTop: 7,
    overflow: 'hidden',
    paddingHorizontal: 10,
    position: 'relative',
  },
  sourceProgressText: {
    color: color.brand.primaryDark,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
    zIndex: 1,
  },
  surfaceGlass: {
    backgroundColor: color.mint.canvas,
  },
  surfaceSolid: {
    backgroundColor: color.mint.white,
  },
  timerCaption: {
    color: color.text.muted,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  timerCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderColor: 'rgba(186,240,230,0.78)',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'space-between',
    minHeight: 100,
    overflow: 'hidden',
    padding: 14,
    position: 'relative',
    ...shadow.soft,
    shadowColor: '#088779',
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 38,
  },
  timerLabel: {
    color: color.text.muted,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
    textTransform: 'uppercase',
  },
  timerRing: {
    alignItems: 'center',
    flexShrink: 0,
    height: 70,
    justifyContent: 'center',
    position: 'relative',
    width: 70,
    zIndex: 1,
  },
  timerRingLens: {
    alignItems: 'center',
    backgroundColor: '#FAFFFD',
    borderColor: 'rgba(255,255,255,0.95)',
    borderRadius: 28,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    position: 'absolute',
    width: 52,
  },
  timerRingValue: {
    color: color.brand.primaryDark,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 16,
  },
  timerTextColumn: {
    flex: 1,
    gap: 4,
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  timerValue: {
    color: color.text.strong,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 29,
  },
  timeline: {
    backgroundColor: 'rgba(246,255,252,0.84)',
    borderColor: 'rgba(127,226,215,0.72)',
    borderRadius: 25,
    borderWidth: 1,
    gap: 0,
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingVertical: 16,
    position: 'relative',
    ...shadow.soft,
  },
  timelineDot: {
    borderColor: '#FFFFFF',
    borderRadius: 7,
    borderWidth: 2,
    height: 13,
    left: 2,
    position: 'absolute',
    top: 5,
    width: 13,
    zIndex: 2,
  },
  timelineDotActive: {
    backgroundColor: color.brand.primary,
    shadowColor: color.brand.primary,
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 9,
  },
  timelineDotDone: {
    backgroundColor: color.accent.success,
  },
  timelineItem: {
    minHeight: 46,
    paddingBottom: 14,
    paddingLeft: 28,
    position: 'relative',
  },
  timelineMeta: {
    color: color.text.muted,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
    marginTop: 1,
  },
  timelineRail: {
    backgroundColor: '#D6EBE6',
    bottom: 24,
    left: 24,
    position: 'absolute',
    top: 22,
    width: 2,
  },
  timelineTitle: {
    color: color.text.strong,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  titleText: {
    color: color.text.strong,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 29,
  },
  utilityCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.73)',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 21,
    borderWidth: 1,
    flexBasis: '48.7%',
    flexGrow: 1,
    minHeight: 112,
    minWidth: 0,
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 10,
    position: 'relative',
    zIndex: 1,
    ...shadow.soft,
  },
  utilityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  utilityIcon: {
    height: 42,
    width: 42,
  },
  utilityGridIcon: {
    height: 52,
    width: 52,
  },
  utilityIconTile: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: 22,
    borderWidth: 1,
    height: 64,
    justifyContent: 'center',
    marginBottom: 7,
    overflow: 'hidden',
    position: 'relative',
    flexShrink: 0,
    width: 64,
  },
  utilityMeta: {
    color: color.text.muted,
    flexShrink: 1,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
    marginTop: 3,
    textAlign: 'center',
  },
  utilityTitle: {
    color: color.text.strong,
    flexShrink: 1,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
    textAlign: 'center',
  },
  verificationDocumentCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  verificationDocumentIcon: {
    height: 42,
    width: 42,
  },
  verificationDocumentIconTile: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: 17,
    borderWidth: 1,
    flexShrink: 0,
    height: 50,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 50,
    zIndex: 1,
  },
  verificationDocumentList: {
    backgroundColor: 'rgba(255,255,255,0.80)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    ...shadow.soft,
  },
  verificationDocumentListAura: {
    bottom: -64,
    height: 226,
    left: -58,
    opacity: 0.58,
    right: -50,
    top: -62,
  },
  verificationDocumentListZipAura: {
    height: 170,
    opacity: 0.42,
    right: -74,
    top: -50,
    width: 238,
  },
  verificationDocumentMeta: {
    color: color.text.muted,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  verificationDocumentRow: {
    alignItems: 'center',
    borderBottomColor: 'rgba(205,226,222,0.78)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 78,
    paddingHorizontal: 14,
    paddingVertical: 12,
    position: 'relative',
    zIndex: 1,
  },
  verificationDocumentRowLast: {
    borderBottomWidth: 0,
  },
  verificationDocumentStatus: {
    alignItems: 'center',
    backgroundColor: 'rgba(245,255,252,0.92)',
    borderColor: 'rgba(154,226,214,0.86)',
    borderRadius: radius.pill,
    borderWidth: 1,
    flexShrink: 0,
    justifyContent: 'center',
    minHeight: 30,
    minWidth: 48,
    paddingHorizontal: 10,
    zIndex: 1,
  },
  verificationDocumentStatusDone: {
    backgroundColor: 'rgba(221,255,247,0.92)',
  },
  verificationDocumentStatusText: {
    color: color.text.muted,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
  },
  verificationDocumentStatusTextDone: {
    color: color.brand.primaryDark,
  },
  verificationDocumentTitle: {
    color: color.text.strong,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  gaugeCaption: {
    color: color.text.muted,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    textAlign: 'center',
  },
  gaugeCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 25,
    borderWidth: 1,
    gap: 4,
    minHeight: 130,
    overflow: 'hidden',
    paddingBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    ...shadow.soft,
  },
  gaugeLabel: {
    color: color.text.muted,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
    textAlign: 'center',
  },
  gaugeNumber: {
    color: color.brand.primaryDark,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 34,
    textAlign: 'center',
  },
  gaugeShell: {
    height: 90,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    width: 154,
  },
  gaugeValue: {
    alignItems: 'center',
    bottom: 4,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  paymentTotalAmount: {
    color: color.brand.primaryDark,
    flexShrink: 1,
    fontSize: 25,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 30,
    marginTop: 3,
  },
  paymentTotalAura: {
    bottom: 'auto',
    height: 120,
    left: '36%',
    opacity: 0.78,
    right: -54,
    top: -54,
  },
  paymentTotalCaption: {
    color: color.text.muted,
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
    textTransform: 'uppercase',
  },
  paymentTotalCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderColor: 'rgba(255,255,255,0.93)',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minHeight: 92,
    overflow: 'hidden',
    paddingHorizontal: 15,
    paddingVertical: 14,
    position: 'relative',
    ...shadow.soft,
  },
  ledgerHeroCard: {
    minHeight: 74,
  },
  paymentTotalCopy: {
    flex: 1,
    minWidth: 0,
  },
  paymentTotalChip: {
    backgroundColor: color.mint.mint50,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexShrink: 1,
    maxWidth: 112,
    minWidth: 64,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  paymentTotalChipText: {
    color: color.brand.primaryDark,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
    textAlign: 'center',
  },
  payoutAmountCurrency: {
    color: color.text.secondary,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
    position: 'relative',
    zIndex: 1,
  },
  payoutAmountInputCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: color.brand.primary,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 54,
    overflow: 'hidden',
    paddingHorizontal: 14,
    position: 'relative',
  },
  payoutAmountInputValue: {
    color: color.brand.primaryDark,
    flex: 1,
    flexShrink: 1,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 25,
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  podiumColumn: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    borderColor: 'rgba(255,255,255,0.95)',
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 5,
    paddingVertical: 8,
    width: 62,
    ...shadow.soft,
  },
  podiumFirst: {
    height: 91,
  },
  podiumLabel: {
    color: color.text.muted,
    fontSize: 8,
    fontWeight: '700',
    lineHeight: 10,
    textAlign: 'center',
  },
  podiumSecond: {
    height: 72,
  },
  podiumThird: {
    height: 62,
  },
  podiumValue: {
    color: color.brand.primaryDark,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 22,
    textAlign: 'center',
  },
  profileAvatar: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: 'rgba(255,255,255,0.95)',
    borderRadius: 22,
    borderWidth: 1,
    height: 64,
    justifyContent: 'center',
    width: 64,
    ...shadow.soft,
  },
  profileAvatarImage: {
    height: 42,
    width: 42,
  },
  profileAvatarText: {
    color: color.brand.primaryDark,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 28,
  },
  profileRouteIconVisualBoost: {
    height: 52,
    width: 52,
  },
  profileHeader: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 13,
    minHeight: 112,
    overflow: 'hidden',
    padding: 14,
    position: 'relative',
    ...shadow.soft,
  },
  profileHeaderAura: {
    bottom: 'auto',
    height: 148,
    left: -46,
    opacity: 0.78,
    right: '52%',
    top: -52,
  },
  profileHeaderChip: {
    backgroundColor: color.mint.mint50,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    maxWidth: 118,
    minWidth: 72,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  profileHeaderChipText: {
    color: color.brand.primaryDark,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
    textAlign: 'center',
  },
  profileHeaderMeta: {
    color: color.text.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  profileHeaderName: {
    color: color.text.strong,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 23,
  },
  profileHeaderText: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  profileHeaderChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    paddingTop: 2,
  },
  profileHeaderMiniChip: {
    backgroundColor: 'rgba(229,255,249,0.78)',
    borderColor: 'rgba(127,226,215,0.62)',
    borderRadius: 999,
    borderWidth: 1,
    color: color.brand.primaryDark,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
    maxWidth: 112,
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  profileInfoHeaderGlyph: {
    color: color.brand.primaryDark,
    fontSize: 17,
    height: 52,
    lineHeight: 52,
    width: 52,
  },
  profileProgressFill: {
    backgroundColor: '#0B9B8A',
    borderRadius: 999,
    height: '100%',
    minWidth: 3,
  },
  profileProgressTrack: {
    backgroundColor: 'rgba(10,139,125,0.12)',
    borderColor: 'rgba(127,226,215,0.42)',
    borderRadius: 999,
    borderWidth: 1,
    height: 7,
    marginTop: 2,
    overflow: 'hidden',
    width: '100%',
  },
  profileDashboard: {
    flexDirection: 'row',
    gap: 10,
  },
  profileDashboardCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.80)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 24,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 9,
    minHeight: 98,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 12,
    position: 'relative',
    ...shadow.soft,
  },
  profileDashboardCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  profileDashboardScore: {
    alignItems: 'center',
    backgroundColor: 'rgba(232,255,249,0.84)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 19,
    borderWidth: 1,
    flexShrink: 0,
    height: 54,
    justifyContent: 'center',
    width: 54,
    ...shadow.soft,
  },
  profileDashboardScoreLabel: {
    color: color.text.muted,
    fontSize: 8,
    fontWeight: '700',
    lineHeight: 10,
  },
  profileDashboardScoreValue: {
    color: color.brand.primaryDark,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 24,
  },
  profileDashboardTitle: {
    color: color.text.strong,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 16,
  },
  rankingPodium: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 8,
    height: 108,
    justifyContent: 'center',
    paddingTop: 10,
  },
  scheduleSummaryAmount: {
    color: color.text.strong,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 29,
  },
  scheduleActionButton: {
    alignItems: 'center',
    borderRadius: 26,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 56,
    overflow: 'hidden',
    paddingHorizontal: 16,
    position: 'relative',
  },
  scheduleActionPrimary: {
    backgroundColor: '#13CBB8',
    borderColor: 'rgba(2,126,115,0.22)',
    shadowColor: '#059F8E',
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.27,
    shadowRadius: 28,
  },
  scheduleActionPrimaryText: {
    color: color.text.inverse,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 20,
    position: 'relative',
    textAlign: 'center',
    zIndex: 2,
  },
  scheduleActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  scheduleActionSecondary: {
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderColor: 'rgba(216,235,232,0.92)',
    ...shadow.soft,
  },
  scheduleActionSecondaryText: {
    color: color.brand.primaryDark,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 20,
    textAlign: 'center',
  },
  scheduleSummaryCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(249,255,253,0.82)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 112,
    overflow: 'hidden',
    padding: 16,
    position: 'relative',
    ...shadow.raised,
  },
  scheduleSummaryAura: {
    bottom: -34,
    height: 176,
    left: -42,
    opacity: 0.86,
    right: -34,
    top: -34,
  },
  scheduleSummaryCopy: {
    flex: 1,
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  scheduleSummaryKicker: {
    alignSelf: 'flex-start',
    backgroundColor: color.mint.mint50,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: color.brand.primaryDark,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  scheduleSummaryLens: {
    alignItems: 'center',
    backgroundColor: 'rgba(235,255,249,0.82)',
    borderColor: 'rgba(255,255,255,0.96)',
    borderRadius: 42,
    borderWidth: 1,
    height: 78,
    justifyContent: 'center',
    paddingHorizontal: 8,
    position: 'relative',
    width: 78,
    zIndex: 1,
    ...shadow.soft,
  },
  scheduleSummaryLensLabel: {
    color: color.text.muted,
    fontSize: 8,
    fontWeight: '700',
    lineHeight: 10,
    textAlign: 'center',
  },
  scheduleSummaryLensValue: {
    color: color.brand.primaryDark,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 25,
    textAlign: 'center',
  },
  scheduleSummaryMeta: {
    color: color.text.muted,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    marginTop: 2,
  },
  scheduleSummaryZipAura: {
    height: 164,
    opacity: 0.68,
    right: -60,
    top: -34,
    width: 204,
  },
  scheduleSupportAura: {
    bottom: -42,
    height: 210,
    left: -34,
    opacity: 0.56,
    right: -34,
    top: -42,
  },
  scheduleSupportAuraGroup: {
    position: 'relative',
  },
  scheduleSupportContent: {
    gap: 14,
    position: 'relative',
    zIndex: 1,
  },
  scheduleSupportZipAura: {
    height: 230,
    opacity: 0.42,
    right: -92,
    top: -78,
    width: 260,
  },
  scheduleAside: {
    color: color.brand.primaryDark,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    maxWidth: 104,
    textAlign: 'right',
  },
  scheduleList: {
    gap: 7,
  },
  scheduleEmptyCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.80)',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    minHeight: 76,
    overflow: 'hidden',
    padding: 12,
    position: 'relative',
    ...shadow.soft,
  },
  scheduleEmptyAura: {
    bottom: -26,
    height: 128,
    left: -34,
    opacity: 0.76,
    right: -30,
    top: -28,
  },
  scheduleEmptyIcon: {
    height: 32,
    width: 32,
  },
  scheduleEmptyIconTile: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: 17,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 48,
    zIndex: 1,
  },
  scheduleEmptyMeta: {
    color: color.text.secondary,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
  },
  scheduleEmptyText: {
    flex: 1,
    gap: 3,
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  scheduleEmptyTitle: {
    color: color.text.strong,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
  },
  scheduleEmptyZipAura: {
    height: 132,
    opacity: 0.56,
    right: -70,
    top: -58,
    width: 174,
  },
  scheduleMeta: {
    color: color.text.muted,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
    marginTop: 2,
  },
  scheduleRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    minHeight: 48,
    paddingHorizontal: 10,
    paddingVertical: 7,
    ...shadow.soft,
  },
  scheduleTextColumn: {
    flex: 1,
    minWidth: 0,
  },
  scheduleTime: {
    color: color.brand.primaryDark,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
    width: 47,
  },
  scheduleTitle: {
    color: color.text.strong,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  checkInChecklist: {
    backgroundColor: 'rgba(246,255,252,0.84)',
    borderColor: 'rgba(127,226,215,0.72)',
    borderRadius: 24,
    borderWidth: 1,
    gap: 8,
    overflow: 'hidden',
    padding: 14,
    position: 'relative',
    ...shadow.soft,
  },
  checkInChecklistAura: {
    bottom: -88,
    height: 282,
    left: -76,
    opacity: 0.96,
    right: -58,
    top: -78,
  },
  checkInChecklistZipAura: {
    height: 246,
    opacity: 0.78,
    right: -96,
    top: -82,
    width: 326,
  },
  checkInHero: {
    alignItems: 'center',
    backgroundColor: 'rgba(246,255,252,0.84)',
    borderColor: 'rgba(127,226,215,0.72)',
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 112,
    overflow: 'hidden',
    padding: 16,
    position: 'relative',
    ...shadow.raised,
  },
  checkInHeroAura: {
    bottom: -92,
    height: 292,
    left: -78,
    opacity: 1,
    right: -58,
    top: -86,
  },
  checkInHeroZipAura: {
    height: 252,
    opacity: 0.84,
    right: -96,
    top: -82,
    width: 336,
  },
  checkInLabel: {
    color: color.text.strong,
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    minWidth: 0,
  },
  checkInMeta: {
    color: color.text.muted,
    flexShrink: 1,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
    maxWidth: 86,
    minWidth: 44,
    textAlign: 'right',
  },
  checkInRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: color.surface.stroke,
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    minHeight: 56,
    paddingHorizontal: 10,
    paddingVertical: 9,
    position: 'relative',
    zIndex: 1,
  },
  checkInState: {
    alignItems: 'center',
    backgroundColor: color.mint.mint50,
    borderRadius: 13,
    height: 27,
    justifyContent: 'center',
    width: 27,
  },
  checkInStateActive: {
    backgroundColor: color.mint.mint100,
  },
  checkInStateDone: {
    backgroundColor: color.brand.primary,
  },
  checkInStateText: {
    color: color.brand.primaryDark,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
  checkInStateTextOn: {
    color: color.text.inverse,
  },
  customerContactCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(246,255,252,0.84)',
    borderColor: 'rgba(127,226,215,0.72)',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 76,
    overflow: 'hidden',
    padding: 11,
    position: 'relative',
    ...shadow.soft,
  },
  customerContactIconRow: {
    flexDirection: 'row',
    flexShrink: 0,
    gap: 6,
    position: 'relative',
    zIndex: 1,
  },
  customerContactMiniIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderColor: 'rgba(216,235,232,0.92)',
    borderRadius: 14,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 28,
    ...shadow.soft,
  },
  customerContactMiniIconImage: {
    height: 17,
    width: 17,
  },
  workerV5CustomerCaseWideMintAura: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  workerV5CustomerCaseWorkCardAura: {
    bottom: -28,
    left: -24,
    position: 'absolute',
    right: -24,
    top: -20,
    zIndex: 0,
  },
  workerV5CustomerMapMintAura: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  workerV5CustomerZipMintAura: {
    height: 180,
    position: 'absolute',
    right: -84,
    top: -96,
    width: 220,
    zIndex: 0,
  },
  shiftHeroAura: {
    bottom: 'auto',
    height: 172,
    left: '30%',
    opacity: 0.92,
    right: -58,
    top: -64,
  },
  shiftIcon: {
    height: 42,
    position: 'relative',
    width: 42,
    zIndex: 1,
  },
  shiftIconFormulaAura: {
    height: 92,
    opacity: 0.88,
    right: -34,
    top: -24,
    width: 112,
  },
  shiftIconTile: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: 20,
    borderWidth: 1,
    height: 58,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 58,
  },
  shiftKicker: {
    alignSelf: 'flex-start',
    backgroundColor: color.mint.mint50,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: color.brand.primaryDark,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  shiftMeta: {
    color: color.text.muted,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    marginTop: 1,
  },
  shiftSourceAura: {
    bottom: 'auto',
    height: 156,
    left: '34%',
    opacity: 0.82,
    right: -56,
    top: -68,
  },
  shiftSourceList: {
    backgroundColor: 'rgba(248,255,252,0.86)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 26,
    position: 'relative',
  },
  shiftSourceRow: {
    minHeight: 76,
    paddingHorizontal: 14,
    paddingVertical: 13,
    position: 'relative',
    zIndex: 1,
  },
  shiftSourceStatus: {
    backgroundColor: 'rgba(218,250,240,0.9)',
    borderColor: 'rgba(78,202,177,0.42)',
    maxWidth: 106,
    minWidth: 64,
  },
  shiftSourceTitle: {
    fontSize: 13,
    lineHeight: 17,
  },
  shiftSummaryCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(248,255,252,0.82)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 118,
    overflow: 'hidden',
    padding: 16,
    position: 'relative',
    ...shadow.raised,
  },
  shiftSummaryTextColumn: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    minHeight: 58,
  },
  shiftSummaryTitle: {
    marginTop: 0,
  },
  shiftTextColumn: {
    flex: 1,
    minWidth: 0,
  },
  shiftTitle: {
    color: color.text.strong,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 5,
  },
  scopeHeroAura: {
    bottom: 'auto',
    height: 176,
    left: '30%',
    right: -64,
    top: -70,
  },
  scopeHeroCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(246,255,252,0.84)',
    borderColor: 'rgba(127,226,215,0.72)',
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    minHeight: 118,
    overflow: 'hidden',
    padding: 16,
    position: 'relative',
    ...shadow.raised,
  },
  scopeHeroIcon: {
    height: 42,
    width: 42,
  },
  scopeHeroIconTile: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: 25,
    borderWidth: 1,
    height: 70,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 70,
    zIndex: 1,
  },
  scopeHeroMeta: {
    color: color.text.secondary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    marginTop: 3,
  },
  scopeHeroPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF7E6',
    borderColor: '#F6D18B',
    borderRadius: radius.pill,
    borderWidth: 1,
    color: color.text.strong,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  scopeHeroText: {
    flex: 1,
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  scopeHeroTextNoPill: {
    alignSelf: 'flex-start',
    paddingTop: 3,
  },
  scopeHeroTitle: {
    color: color.text.strong,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
    marginTop: 8,
  },
  scopeHeroTitleNoPill: {
    marginTop: 0,
  },
  mediaImage: {
    height: 64,
    width: '100%',
  },
  mediaStrip: {
    flexDirection: 'row',
    gap: 7,
  },
  mediaTag: {
    backgroundColor: 'rgba(7,26,36,0.62)',
    borderRadius: radius.pill,
    bottom: 5,
    color: color.text.inverse,
    fontSize: 8,
    fontWeight: '700',
    left: 6,
    lineHeight: 10,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 3,
    position: 'absolute',
  },
  mediaThumb: {
    backgroundColor: '#D6E7E4',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 15,
    borderWidth: 1,
    flex: 1,
    height: 64,
    minWidth: 0,
    overflow: 'hidden',
    position: 'relative',
    ...shadow.soft,
  },
  memorySwitchCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  memorySwitchIcon: {
    height: 42,
    width: 42,
  },
  memorySwitchIconShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: 22,
    borderWidth: 1,
    flexShrink: 0,
    height: 64,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 64,
    zIndex: 1,
    ...shadow.soft,
  },
  memorySwitchList: {
    backgroundColor: 'rgba(255,255,255,0.74)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 25,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    ...shadow.soft,
  },
  memorySwitchRow: {
    alignItems: 'center',
    borderBottomColor: 'rgba(176,222,214,0.38)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 13,
    minHeight: 82,
    paddingHorizontal: 14,
    paddingVertical: 11,
    position: 'relative',
    zIndex: 1,
  },
  memorySwitchRowLast: {
    borderBottomWidth: 0,
  },
  memorySwitchTitle: {
    color: color.text.strong,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
  },
  memorySwitchValue: {
    color: color.text.secondary,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  checkInListAura: {
    bottom: -70,
    height: 210,
    left: -48,
    opacity: 0.68,
    right: -52,
    top: -58,
  },
  checkInListZipAura: {
    height: 198,
    opacity: 0.54,
    right: -80,
    top: -70,
    width: 282,
  },
  toggleKnob: {
    backgroundColor: color.mint.white,
    borderRadius: 10,
    height: 20,
    shadowColor: color.text.strong,
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    width: 20,
  },
  toggleKnobOn: {
    marginLeft: 18,
  },
  toggleLabel: {
    color: color.text.strong,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  toggleList: {
    backgroundColor: 'rgba(255,255,255,0.74)',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    ...shadow.soft,
  },
  toggleRow: {
    alignItems: 'center',
    borderBottomColor: 'rgba(176,222,214,0.34)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 72,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  toggleTextColumn: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  toggleTrack: {
    backgroundColor: '#DFE9E7',
    borderRadius: radius.pill,
    flexShrink: 0,
    height: 26,
    padding: 3,
    width: 44,
  },
  toggleTrackOn: {
    backgroundColor: color.brand.primary,
  },
  toggleValue: {
    color: color.text.muted,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  caseClosedAmount: {
    color: color.brand.primaryDark,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 34,
    marginTop: 6,
    textAlign: 'center',
  },
  caseClosedAmountLabel: {
    color: color.text.muted,
    maxWidth: '84%',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
    textAlign: 'center',
  },
  caseClosedCheck: {
    alignItems: 'center',
    backgroundColor: '#0DAE9A',
    borderColor: 'rgba(255,255,255,0.82)',
    borderRadius: 23,
    borderWidth: 3,
    height: 63,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 63,
    zIndex: 1,
    shadowColor: '#087F73',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 5,
  },
  caseClosedCheckShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(203,248,238,0.54)',
    borderColor: 'rgba(255,255,255,0.78)',
    borderRadius: 34,
    borderWidth: 1,
    height: 104,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 104,
    shadowColor: '#088779',
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 34,
    elevation: 4,
  },
  caseClosedCheckText: {
    color: color.text.inverse,
    fontSize: 36,
    fontWeight: '700',
    lineHeight: 40,
    position: 'relative',
    zIndex: 1,
  },
  caseClosedHeroAura: {
    bottom: 'auto',
    height: 220,
    left: '22%',
    right: -76,
    top: -96,
  },
  caseClosedHeroCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.79)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 30,
    borderWidth: 1,
    gap: 6,
    minHeight: 282,
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingVertical: 20,
    position: 'relative',
    ...shadow.raised,
  },
  caseClosedStatusPill: {
    alignItems: 'center',
    backgroundColor: color.mint.mint50,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    marginTop: 4,
    maxWidth: '88%',
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  caseClosedStatusText: {
    color: color.brand.primaryDark,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
  caseClosedTitle: {
    color: color.text.strong,
    fontSize: 23,
    fontWeight: '700',
    lineHeight: 28,
    marginTop: 8,
    maxWidth: '90%',
    textAlign: 'center',
  },
  caseTrailCard: {
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 25,
    borderWidth: 1,
    overflow: 'hidden',
    ...shadow.soft,
  },
  caseTrailCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  caseTrailIcon: {
    height: 40,
    position: 'relative',
    width: 40,
    zIndex: 1,
  },
  caseTrailIconShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: 21,
    borderWidth: 1,
    height: 64,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    flexShrink: 0,
    width: 64,
    zIndex: 1,
  },
  caseTrailMeta: {
    color: color.text.secondary,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  caseTrailRow: {
    alignItems: 'center',
    borderBottomColor: 'rgba(176,222,214,0.38)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 96,
    overflow: 'hidden',
    padding: 13,
    position: 'relative',
  },
  caseTrailRowAura: {
    bottom: -56,
    height: 208,
    left: -52,
    opacity: 0.74,
    right: -52,
    top: -56,
  },
  caseTrailRowZipAura: {
    height: 220,
    opacity: 0.56,
    right: -92,
    top: -78,
    width: 300,
  },
  caseTrailStatus: {
    backgroundColor: 'rgba(230,251,243,0.88)',
    borderColor: 'rgba(127,226,215,0.76)',
    borderRadius: radius.pill,
    borderWidth: 1,
    color: color.brand.primaryDark,
    flexShrink: 1,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
    maxWidth: 86,
    minWidth: 64,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 5,
    position: 'relative',
    textAlign: 'center',
    zIndex: 1,
  },
  caseTrailTitle: {
    color: color.text.strong,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
  },
  chatBubble: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: color.surface.stroke,
    borderRadius: 18,
    borderWidth: 1,
    maxWidth: '86%',
    minWidth: 0,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  chatBubbleBody: {
    color: color.text.strong,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  chatBubbleLabel: {
    color: color.text.muted,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
    marginTop: 6,
    textAlign: 'right',
  },
  chatBubbleRight: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(197,248,235,0.72)',
    borderColor: 'rgba(13,174,154,0.25)',
  },
  intakeEmptyCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  intakeEmptyIcon: {
    height: 34,
    width: 34,
  },
  intakeEmptyIconShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: 17,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    flexShrink: 0,
    width: 48,
  },
  intakeEmptyMeta: {
    color: color.text.muted,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  intakeEmptyRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.76)',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 70,
    padding: 11,
    ...shadow.soft,
  },
  intakeEmptyTitle: {
    color: color.text.strong,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  intakeStack: {
    gap: 9,
  },
  jobRoomBubbleStack: {
    flex: 1,
    gap: 10,
    minWidth: 0,
  },
  jobRoomThreadAura: {
    bottom: 'auto',
    height: 210,
    left: '30%',
    right: -74,
    top: -84,
  },
  jobRoomThreadCard: {
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 250,
    overflow: 'hidden',
    padding: 15,
    position: 'relative',
    ...shadow.raised,
  },
  kaelConversationAura: {
    bottom: 'auto',
    height: 170,
    left: '28%',
    right: -62,
    top: -68,
  },
  kaelConversationCard: {
    backgroundColor: 'rgba(255,255,255,0.74)',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 25,
    borderWidth: 1,
    gap: 10,
    minHeight: 168,
    overflow: 'hidden',
    padding: 13,
    position: 'relative',
    ...shadow.soft,
  },
  kaelOrbBoundaryCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 26,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 13,
    minHeight: 92,
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingVertical: 14,
    position: 'relative',
    shadowColor: '#059B8A',
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
  },
  kaelOrbBoundaryCardNormal: {
    minHeight: 92,
  },
  kaelOrbBoundaryCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  kaelOrbBoundaryIcon: {
    height: 34,
    width: 34,
  },
  kaelOrbBoundaryIconShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: 18,
    borderWidth: 1,
    flexShrink: 0,
    height: 52,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 52,
    zIndex: 1,
  },
  kaelOrbBoundaryStrong: {
    color: color.text.strong,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 23,
    position: 'relative',
    zIndex: 1,
  },
  kaelOrbBoundaryText: {
    color: color.text.secondary,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
    position: 'relative',
    zIndex: 1,
  },
  kaelOrbBubble: {
    borderRadius: 22,
    borderWidth: 1,
    maxWidth: '84%',
    minWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  kaelOrbBubbleLeft: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderBottomLeftRadius: 8,
    borderColor: 'rgba(216,235,232,0.9)',
  },
  kaelOrbBubbleRight: {
    alignSelf: 'flex-end',
    backgroundColor: color.brand.primary,
    borderBottomRightRadius: 8,
    borderColor: 'rgba(255,255,255,0.72)',
  },
  kaelOrbBubbleRole: {
    color: color.text.muted,
    fontSize: 8,
    fontWeight: '700',
    lineHeight: 10,
    marginTop: 5,
    textAlign: 'right',
  },
  kaelOrbBubbleText: {
    color: color.text.secondary,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  kaelOrbBubbleTextStrong: {
    color: color.text.strong,
    fontWeight: '700',
  },
  kaelOrbBubbleTextRight: {
    color: color.text.inverse,
  },
  kaelOrbCardAura: {
    bottom: -58,
    height: 190,
    left: -42,
    opacity: 0.86,
    right: -46,
    top: -58,
  },
  kaelOrbCardZipAura: {
    height: 210,
    opacity: 0.58,
    right: -92,
    top: -76,
    width: 280,
  },
  kaelOrbComposerStack: {
    gap: 0,
    marginBottom: 0,
    marginTop: 10,
    paddingBottom: 3,
    transform: [{ translateY: 7 }],
    position: 'relative',
    zIndex: 3,
  },
  kaelOrbComposerAura: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  kaelOrbComposerCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 26,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 56,
    overflow: 'hidden',
    padding: 8,
    position: 'relative',
    shadowColor: '#059B8A',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.10,
    shadowRadius: 24,
  },
  kaelOrbComposerCameraButton: {
    alignItems: 'center',
    backgroundColor: color.mint.mint50,
    borderColor: glass.stroke,
    borderRadius: 18,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    position: 'relative',
    width: 38,
    zIndex: 1,
  },
  kaelOrbComposerCameraBadge: {
    alignItems: 'center',
    backgroundColor: color.brand.primaryDark,
    borderRadius: 8,
    height: 16,
    justifyContent: 'center',
    minWidth: 16,
    paddingHorizontal: 4,
    position: 'absolute',
    right: -4,
    top: -4,
  },
  kaelOrbComposerCameraBadgeText: {
    color: color.text.inverse,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 11,
  },
  kaelOrbComposerCameraIcon: {
    height: 20,
    width: 20,
  },
  kaelOrbComposerDisclaimer: {
    color: color.text.muted,
    fontSize: 10.5,
    fontWeight: '600',
    lineHeight: 14,
    marginTop: 6,
    paddingBottom: 2,
    textAlign: 'center',
  },
  kaelOrbComposerField: {
    flex: 1,
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  kaelOrbComposerInput: {
    color: color.text.strong,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
  kaelOrbComposerInputShell: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  kaelOrbChatBody: {
    gap: 8,
  },
  kaelOrbCustomerChatFrame: {
    flex: 1,
    gap: 10,
    paddingBottom: 18,
    paddingHorizontal: 16,
    paddingTop: 10,
    position: 'relative',
  },
  kaelOrbCustomerChatFrameIntake: {
    gap: 9,
  },
  kaelOrbCustomerModeMenu: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderColor: 'rgba(255,255,255,0.88)',
    borderRadius: 23,
    borderWidth: 1,
    gap: 4,
    minHeight: 0,
    overflow: 'hidden',
    paddingBottom: 4,
    paddingHorizontal: 4,
    paddingTop: 7,
    position: 'absolute',
    right: 21,
    shadowColor: '#088779',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    top: 68,
    width: 172,
    zIndex: 20,
  },
  kaelOrbCustomerModeMenuAura: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.78,
    zIndex: 0,
  },
  kaelOrbCustomerModeMenuOption: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.42)',
    borderColor: 'rgba(13,167,151,0.12)',
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 9,
    position: 'relative',
    width: '100%',
    zIndex: 2,
  },
  kaelOrbCustomerModeMenuOptionActive: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderColor: 'rgba(255,255,255,0.92)',
    shadowColor: '#046358',
    shadowOffset: { height: 7, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
  },
  kaelOrbCustomerModeMenuInnerShadow: {
    borderBottomColor: 'rgba(12,181,159,0.12)',
    borderColor: 'rgba(255,255,255,0.42)',
    borderRadius: 22,
    borderWidth: 1,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 1,
  },
  kaelOrbCustomerModeMenuSheen: {
    backgroundColor: 'rgba(255,255,255,0.62)',
    borderRadius: 999,
    height: 56,
    left: -76,
    position: 'absolute',
    top: -18,
    width: 42,
    zIndex: 1,
  },
  kaelOrbCustomerModeMenuTopLight: {
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderRadius: 999,
    height: 1.2,
    left: 17,
    opacity: 0.86,
    position: 'absolute',
    right: 17,
    top: 1,
    zIndex: 1,
  },
  kaelOrbCustomerModeMenuText: {
    color: color.text.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 15,
  },
  kaelOrbCustomerModeMenuTextActive: {
    color: color.brand.primaryDark,
  },
  kaelOrbCustomerHeaderRow: {
    minHeight: 62,
  },
  kaelOrbCustomerHeaderTitle: {
    fontSize: 30,
    lineHeight: 36,
  },
  kaelOrbCustomerKeyboard: {
    flex: 1,
    position: 'relative',
    zIndex: 2,
  },
  kaelOrbCustomerSafeArea: {
    maxWidth: '100%',
    width: '100%',
  },
  kaelOrbCustomerShell: {
    flex: 1,
    gap: 10,
    justifyContent: 'space-between',
    minHeight: 0,
    paddingBottom: 0,
  },
  kaelOrbCustomerScrollContent: {
    gap: 12,
    paddingBottom: 34,
    paddingTop: 12,
  },
  kaelOrbCustomerTopActionText: {
    color: color.brand.primaryDark,
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 22,
  },
  kaelOrbCustomerTopBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 58,
  },
  kaelOrbCustomerTopControl: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: 24,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
    ...shadow.soft,
  },
  kaelOrbCustomerTopCopy: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 6,
    transform: [{ translateY: 4 }],
  },
  kaelOrbCustomerTopTitle: {
    color: color.text.strong,
    fontSize: 18,
    fontWeight: '700',
    includeFontPadding: true,
    letterSpacing: 0,
    lineHeight: 24,
    minHeight: 26,
    textAlign: 'center',
  },
  kaelOrbCustomerTranscript: {
    flexGrow: 1,
    gap: 8,
    justifyContent: 'flex-start',
    paddingVertical: 6,
  },
  kaelOrbCustomerTranscriptMenuOpen: {
    paddingTop: 94,
  },
  kaelOrbCustomerTranscriptScroll: {
    flex: 1,
  },
  kaelOrbMediaAura: {
    bottom: -44,
    height: 120,
    left: -36,
    opacity: 0.48,
    right: -36,
    top: -42,
  },
  kaelOrbMediaLine: {
    backgroundColor: 'rgba(238,255,251,0.9)',
    borderRadius: radius.pill,
    height: 4,
    width: '74%',
  },
  kaelOrbMediaStrip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 9,
    width: '86%',
  },
  kaelOrbMediaThumb: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: 20,
    borderWidth: 1,
    flex: 1,
    height: 70,
    justifyContent: 'flex-end',
    minWidth: 0,
    overflow: 'hidden',
    paddingBottom: 10,
    position: 'relative',
    ...shadow.soft,
  },
  kaelOrbMediaThumbDark: {
    backgroundColor: '#435D63',
  },
  kaelOrbMediaThumbSoft: {
    backgroundColor: '#D8E9E6',
  },
  kaelOrbOpenButton: {
    alignItems: 'center',
    backgroundColor: color.mint.mint50,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 28,
    minWidth: 58,
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  kaelOrbOpenButtonText: {
    color: color.brand.primaryDark,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
    textAlign: 'center',
  },
  kaelOrbOpportunityAside: {
    alignItems: 'flex-end',
    gap: 7,
    maxWidth: 108,
    minWidth: 76,
    position: 'relative',
    zIndex: 1,
  },
  kaelOrbOpportunityCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 70,
    overflow: 'hidden',
    padding: 13,
    position: 'relative',
    ...shadow.soft,
  },
  kaelOrbOpportunityCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  kaelOrbOpportunityIcon: {
    height: 32,
    width: 32,
  },
  kaelOrbOpportunityIconShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: 16,
    borderWidth: 1,
    flexShrink: 0,
    height: 46,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 46,
    zIndex: 1,
  },
  kaelOrbOpportunityList: {
    alignSelf: 'flex-start',
    gap: 9,
    marginBottom: 6,
    marginTop: 2,
    width: '92%',
  },
  kaelOrbOpportunityMeta: {
    color: color.text.muted,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  kaelOrbOpportunityMetaStrong: {
    color: color.brand.primaryDark,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  kaelOrbOpportunityPayout: {
    color: color.brand.primaryDark,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
    textAlign: 'right',
  },
  kaelOrbOpportunityStatus: {
    backgroundColor: color.mint.mint50,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: color.brand.primaryDark,
    flexShrink: 0,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
    minWidth: 52,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: 'relative',
    textAlign: 'center',
    zIndex: 1,
  },
  kaelOrbOpportunityTitle: {
    color: color.text.strong,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  kaelOrbQuickChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 14,
  },
  kaelOrbQuickChipDisabled: {
    opacity: 0.52,
  },
  kaelOrbQuickChipSelected: {
    backgroundColor: 'rgba(224,251,244,0.88)',
    borderColor: 'rgba(127,226,215,0.78)',
  },
  kaelOrbQuickChipText: {
    color: color.text.secondary,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 16,
  },
  kaelOrbQuickChipTextSelected: {
    color: color.brand.primaryDark,
  },
  kaelOrbQuickChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  kaelOrbSendButton: {
    alignItems: 'center',
    backgroundColor: color.brand.primary,
    borderColor: 'rgba(255,255,255,0.82)',
    borderRadius: 22,
    borderWidth: 0,
    flexShrink: 0,
    height: 44,
    justifyContent: 'center',
    position: 'relative',
    width: 44,
    zIndex: 1,
    ...shadow.primary,
  },
  kaelOrbSendButtonDisabled: {
    backgroundColor: 'rgba(133,154,148,0.38)',
    shadowOpacity: 0,
  },
  kaelOrbSendIcon: {
    height: 21,
    tintColor: color.text.inverse,
    width: 21,
  },
  kaelOrbSendText: {
    color: color.text.inverse,
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 24,
  },
  kaelOrbStack: {
    gap: 10,
    paddingBottom: 22,
  },
  kaelSourceHeaderAura: {
    bottom: -74,
    height: 188,
    left: -42,
    opacity: 0.76,
    right: -54,
    top: -62,
  },
  kaelSourceHeaderCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 27,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 13,
    minHeight: 112,
    overflow: 'hidden',
    padding: 16,
    position: 'relative',
    ...shadow.raised,
  },
  kaelSourceHeaderCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  kaelSourceHeaderIcon: {
    height: 42,
    position: 'relative',
    width: 42,
    zIndex: 1,
  },
  kaelSourceHeaderIconShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: 21,
    borderWidth: 1,
    height: 64,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 64,
    zIndex: 1,
  },
  kaelSourceHeaderSubtitle: {
    color: color.text.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  kaelSourceHeaderTitle: {
    color: color.text.strong,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 29,
  },
  suggestionChip: {
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    maxWidth: '32%',
    minHeight: 32,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  suggestionChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionChipText: {
    color: color.brand.primaryDark,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
    textAlign: 'center',
  },
  approvalDecisionCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  approvalDecisionIcon: {
    height: 42,
    width: 42,
  },
  approvalDecisionIconShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: 22,
    borderWidth: 1,
    height: 64,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    flexShrink: 0,
    width: 64,
  },
  approvalDecisionList: {
    backgroundColor: 'rgba(255,255,255,0.77)',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    ...shadow.soft,
  },
  approvalDecisionMeta: {
    color: color.text.muted,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  approvalDecisionRow: {
    alignItems: 'center',
    borderBottomColor: 'rgba(176,222,214,0.38)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 11,
    minHeight: 72,
    padding: 12,
    position: 'relative',
  },
  profileDossierRowAura: {
    opacity: 0.7,
    right: -72,
    top: -92,
  },
  approvalDecisionStatus: {
    backgroundColor: color.mint.mint50,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: color.brand.primaryDark,
    flexShrink: 1,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
    maxWidth: 92,
    minWidth: 54,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    textAlign: 'center',
  },
  approvalDecisionTitle: {
    color: color.text.strong,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  workerSettingsActionBody: {
    color: color.text.secondary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 2,
  },
  workerSettingsActionCopy: {
    flex: 1,
    minWidth: 0,
    zIndex: 1,
  },
  workerSettingsActionIcon: {
    height: 46,
    width: 46,
  },
  workerSettingsActionIconShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderColor: 'rgba(176,222,214,0.54)',
    borderRadius: 20,
    borderWidth: 1,
    height: 58,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 58,
  },
  workerSettingsActionRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: 'rgba(176,222,214,0.48)',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 82,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 10,
    position: 'relative',
  },
  workerSettingsActionTitle: {
    color: color.text.strong,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  workerSettingsDivider: {
    backgroundColor: 'rgba(176,222,214,0.36)',
    height: 1,
    marginHorizontal: 14,
  },
  workerSettingsForm: {
    gap: 10,
    paddingBottom: 10,
    paddingHorizontal: 4,
    paddingTop: 2,
  },
  workerSettingsInput: {
    color: color.text.strong,
    fontSize: 14,
    fontWeight: '700',
  },
  workerSettingsInputShell: {
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderColor: 'rgba(176,222,214,0.54)',
    minHeight: 48,
  },
  workerSettingsInputShellError: {
    borderColor: 'rgba(39,189,166,0.48)',
  },
  workerSettingsListCard: {
    backgroundColor: 'rgba(255,255,255,0.74)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 25,
    borderWidth: 1,
    gap: 8,
    overflow: 'hidden',
    padding: 10,
    position: 'relative',
    ...shadow.soft,
  },
  workerSettingsMessage: {
    color: color.brand.primaryDark,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    paddingHorizontal: 4,
  },
  workerSettingsMessageError: {
    color: color.brand.primaryDark,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    paddingHorizontal: 4,
  },
  workerSettingsSaveButton: {
    backgroundColor: 'rgba(219,247,239,0.64)',
    borderColor: 'rgba(39,189,166,0.28)',
    borderWidth: 1,
  },
  workerSettingsSaveButtonActive: {
    backgroundColor: color.brand.primary,
  },
  workerSettingsStatusPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(219,247,239,0.82)',
    borderColor: 'rgba(39,189,166,0.32)',
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 32,
    minWidth: 58,
    overflow: 'hidden',
    paddingHorizontal: 12,
    position: 'relative',
    zIndex: 1,
  },
  workerSettingsStatusText: {
    color: color.brand.primaryDark,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  approvalDraftCard: {
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 27,
    borderWidth: 1,
    gap: 12,
    overflow: 'hidden',
    padding: 14,
    ...shadow.raised,
  },
  approvalDraftCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  approvalDraftHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11,
  },
  approvalDraftIcon: {
    height: 34,
    width: 34,
  },
  approvalDraftIconShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: 18,
    borderWidth: 1,
    height: 54,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    flexShrink: 0,
    width: 54,
  },
  approvalDraftImpact: {
    backgroundColor: '#FFF7E6',
    borderColor: '#F6D18B',
    borderRadius: radius.pill,
    borderWidth: 1,
    color: color.text.strong,
    flexShrink: 1,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
    maxWidth: 86,
    minWidth: 52,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    textAlign: 'center',
  },
  approvalDraftMeta: {
    color: color.text.muted,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  approvalDraftStats: {
    flexDirection: 'row',
    gap: 8,
  },
  approvalDraftTitle: {
    color: color.text.strong,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
  },
  approvalQueueHeroAura: {
    bottom: 'auto',
    height: 180,
    left: '32%',
    right: -66,
    top: -70,
  },
  approvalQueueHeroCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.79)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 30,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    minHeight: 118,
    overflow: 'hidden',
    padding: 16,
    position: 'relative',
    ...shadow.raised,
  },
  approvalQueueHeroCopy: {
    flex: 1,
    minWidth: 0,
  },
  approvalQueueIcon: {
    height: 42,
    width: 42,
  },
  approvalQueueIconShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: 25,
    borderWidth: 1,
    height: 70,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    flexShrink: 0,
    width: 70,
  },
  approvalQueueMeta: {
    color: color.text.secondary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    marginTop: 3,
  },
  approvalQueuePill: {
    alignSelf: 'flex-start',
    backgroundColor: color.mint.mint50,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: color.brand.primaryDark,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
    textTransform: 'uppercase',
  },
  approvalQueueTitle: {
    color: color.text.strong,
    fontSize: 19,
    fontWeight: '700',
    lineHeight: 24,
    marginTop: 7,
  },
  commandHeroAmount: {
    alignItems: 'flex-end',
    flexShrink: 1,
    maxWidth: 130,
    minWidth: 92,
  },
  commandHeroAmountLabel: {
    color: color.text.muted,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
    textAlign: 'right',
  },
  commandHeroAmountValue: {
    color: color.brand.primaryDark,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 25,
    marginTop: 3,
    textAlign: 'right',
  },
  commandHeroAura: {
    bottom: 'auto',
    height: 170,
    left: '34%',
    right: -64,
    top: -70,
  },
  commandHeroCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.79)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 13,
    minHeight: 128,
    overflow: 'hidden',
    padding: 16,
    position: 'relative',
    ...shadow.raised,
  },
  commandHeroCopy: {
    flex: 1,
    minWidth: 0,
  },
  commandHeroMeta: {
    color: color.text.secondary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    marginTop: 3,
  },
  commandHeroPill: {
    alignSelf: 'flex-start',
    backgroundColor: color.mint.mint50,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: color.brand.primaryDark,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  commandHeroTitle: {
    color: color.text.strong,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
    marginTop: 7,
  },
  earningsHeroAmount: {
    color: color.text.strong,
    flexShrink: 1,
    fontSize: 27,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 32,
    marginTop: 8,
  },
  earningsHeroAura: {
    bottom: 'auto',
    height: 190,
    left: '34%',
    right: -70,
    top: -74,
  },
  earningsHeroCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.79)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 30,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    minHeight: 148,
    overflow: 'hidden',
    padding: 18,
    position: 'relative',
    ...shadow.raised,
  },
  earningsHeroCopy: {
    flex: 1,
    minWidth: 0,
  },
  earningsHeroContent: {
    flex: 1,
    gap: 12,
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  earningsHeroIcon: {
    height: 42,
    width: 42,
  },
  earningsHeroIconShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: 22,
    borderWidth: 1,
    height: 64,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    flexShrink: 0,
    width: 64,
  },
  earningsHeroMeta: {
    color: color.text.secondary,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    marginTop: 3,
  },
  earningsHeroPill: {
    alignSelf: 'flex-start',
    backgroundColor: color.mint.mint50,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: color.brand.primaryDark,
    flexShrink: 1,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
    maxWidth: '100%',
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 4,
    textTransform: 'uppercase',
  },
  earningsHeroMainRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'space-between',
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  earningsStatGrid: {
    flexDirection: 'row',
    gap: 8,
    position: 'relative',
    zIndex: 1,
  },
  earningsStatLabel: {
    color: color.text.muted,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
    textAlign: 'center',
  },
  earningsStatTile: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.68)',
    borderColor: 'rgba(255,255,255,0.88)',
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    gap: 3,
    justifyContent: 'center',
    minHeight: 56,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  earningsStatValue: {
    color: color.text.strong,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
  },
  earningsTransactionAmount: {
    color: color.brand.primaryDark,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
    maxWidth: 108,
    minWidth: 76,
    textAlign: 'right',
  },
  earningsTransactionCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  earningsTransactionIcon: {
    height: 34,
    width: 34,
  },
  earningsTransactionIconShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: 18,
    borderWidth: 1,
    height: 54,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    flexShrink: 0,
    width: 54,
  },
  earningsTransactionList: {
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 25,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    ...shadow.soft,
  },
  earningsTransactionMeta: {
    color: color.text.muted,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  earningsTransactionRow: {
    alignItems: 'center',
    borderBottomColor: 'rgba(176,222,214,0.38)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 82,
    padding: 13,
    position: 'relative',
    zIndex: 1,
  },
  earningsTransactionTitle: {
    color: color.text.strong,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
  },
  safetyHeroAura: {
    bottom: 'auto',
    height: 170,
    left: '34%',
    right: -64,
    top: -70,
  },
  safetyHeroCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.79)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 30,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    minHeight: 122,
    overflow: 'hidden',
    padding: 16,
    position: 'relative',
    ...shadow.raised,
  },
  safetyHeroCopy: {
    flex: 1,
    minWidth: 0,
  },
  safetyHeroIcon: {
    height: 42,
    width: 42,
  },
  safetyHeroIconShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: 25,
    borderWidth: 1,
    height: 70,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    flexShrink: 0,
    width: 70,
  },
  safetyHeroMeta: {
    color: color.text.secondary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    marginTop: 3,
  },
  safetyHeroPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFEDEE',
    borderColor: '#F8B7B9',
    borderRadius: radius.pill,
    borderWidth: 1,
    color: '#C73A3A',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  safetyHeroTitle: {
    color: color.text.strong,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
    marginTop: 7,
  },
  safetyRiskCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  safetyRiskIcon: {
    height: 34,
    width: 34,
  },
  safetyRiskIconShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: 18,
    borderWidth: 1,
    height: 54,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    flexShrink: 0,
    width: 54,
  },
  safetyRiskList: {
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 25,
    borderWidth: 1,
    overflow: 'hidden',
    ...shadow.soft,
  },
  safetyRiskMeta: {
    color: color.text.muted,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  safetyRiskRow: {
    alignItems: 'center',
    borderBottomColor: 'rgba(176,222,214,0.38)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 82,
    padding: 13,
  },
  safetyRiskStatus: {
    color: color.brand.primaryDark,
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 22,
    maxWidth: 78,
    minWidth: 42,
    textAlign: 'right',
  },
  safetyRiskStatusUrgent: {
    backgroundColor: '#FFEDEE',
    borderColor: '#F8B7B9',
    borderRadius: radius.pill,
    borderWidth: 1,
    color: '#C73A3A',
    fontSize: 10,
    lineHeight: 12,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  safetyRiskTitle: {
    color: color.text.strong,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
  },
  timelineHeroAura: {
    bottom: 'auto',
    height: 170,
    left: '36%',
    right: -62,
    top: -68,
  },
  timelineHeroCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.79)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    minHeight: 118,
    overflow: 'hidden',
    padding: 16,
    position: 'relative',
    ...shadow.raised,
  },
  timelineHeroCopy: {
    flex: 1,
    minWidth: 0,
  },
  timelineHeroCount: {
    color: color.brand.primaryDark,
    fontSize: 25,
    fontWeight: '700',
    lineHeight: 29,
  },
  timelineHeroCountLabel: {
    color: color.text.muted,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 11,
  },
  timelineHeroLens: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: 'rgba(255,255,255,0.96)',
    borderRadius: 34,
    borderWidth: 1,
    flexShrink: 0,
    height: 74,
    justifyContent: 'center',
    width: 74,
    ...shadow.primary,
  },
  timelineHeroMeta: {
    color: color.text.secondary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    marginTop: 3,
  },
  timelineHeroPill: {
    alignSelf: 'flex-start',
    backgroundColor: color.mint.mint50,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: color.brand.primaryDark,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  timelineHeroTitle: {
    color: color.text.strong,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
    marginTop: 7,
  },
  bankChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.79)',
    borderColor: 'rgba(255,255,255,0.93)',
    borderRadius: 21,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 68,
    minWidth: 0,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 11,
    position: 'relative',
    ...shadow.soft,
  },
  bankChipCheck: {
    alignItems: 'center',
    backgroundColor: color.brand.primary,
    borderRadius: 8,
    height: 16,
    justifyContent: 'center',
    position: 'absolute',
    right: 5,
    top: 5,
    width: 16,
  },
  bankChipCheckText: {
    color: color.text.inverse,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 11,
  },
  bankChipGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  bankChipLabel: {
    color: color.text.strong,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
    textAlign: 'center',
  },
  bankChipSelected: {
    borderColor: 'rgba(13,179,159,0.52)',
    shadowColor: color.brand.primary,
    shadowOffset: { height: 13, width: 0 },
    shadowOpacity: 0.13,
    shadowRadius: 27,
  },
  bankChipValue: {
    color: color.text.muted,
    fontSize: 8,
    fontWeight: '700',
    lineHeight: 11,
    marginTop: 3,
    textAlign: 'center',
  },
  chatMessage: {
    borderRadius: 18,
    maxWidth: '82%',
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...shadow.soft,
  },
  chatMessageBody: {
    color: color.text.secondary,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
    marginTop: 3,
  },
  chatMessageLabel: {
    color: color.text.strong,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
  },
  chatMessagePeer: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderBottomLeftRadius: 6,
    borderColor: 'rgba(216,235,232,0.9)',
    borderWidth: 1,
  },
  chatMessageSystem: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(247,250,255,0.92)',
    borderColor: '#D9E5FB',
    borderWidth: 1,
    maxWidth: '100%',
  },
  chatMessageUser: {
    alignSelf: 'flex-end',
    backgroundColor: color.mint.mint100,
    borderBottomRightRadius: 6,
    borderColor: 'rgba(126,224,207,0.48)',
    borderWidth: 1,
  },
  chatPreviewCard: {
    backgroundColor: 'rgba(255,255,255,0.74)',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 24,
    borderWidth: 1,
    gap: 9,
    overflow: 'hidden',
    padding: 11,
    ...shadow.soft,
  },
  chatPreviewRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  chatPreviewRowUser: {
    justifyContent: 'flex-end',
  },
  voiceBar: {
    backgroundColor: color.brand.primary,
    borderRadius: 3,
    width: 3,
  },
  voiceCaption: {
    color: color.text.muted,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
  },
  voiceShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 52,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...shadow.soft,
  },
  voiceTextColumn: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  voiceTitle: {
    color: color.text.strong,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  voiceWave: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 3,
    height: 28,
    width: 46,
  },
})
