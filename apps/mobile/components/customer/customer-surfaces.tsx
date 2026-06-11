import { type ReactNode, use, useCallback, useEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type DimensionValue,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { LOCAL_DEAL_ID, LOCAL_WORKFLOW_PRICE_DISCLAIMER, hasLocalDealCompletionEvidence, orderWorkflowPhaseSectionsForSummary, workflowAllowedActionsLabel, workflowBlockedReasonLabel, workflowEventLabel, workflowSourceOfTruthLabel, type LocalCustomerSearchState, type LocalDeal, type LocalDealStatus, type LocalScopeChange, type LocalWorkflowSelectors, type ServiceType, type WorkflowArtifactMode, type WorkflowPhaseContext } from '@home-services/shared'
import { ScopeChangeHardStopModal } from '@/components/customer/scope-change-modal/scope-change-hard-stop-modal'
import { BookingWizard } from '@/components/customer/booking-wizard'
import {
  CustomerThemeContext,
  getCustomerThemeTokens,
  getReducedTransparencyCustomerTokens,
  setCustomerThemeMode,
  type CustomerThemeTokens,
  type ThemeMode,
  useCustomerThemeMode,
} from '@/components/customer/customer-theme'
import { FloatingGlassTabBar, type FloatingGlassTabItem } from '@/components/ui/floating-glass-tab-bar'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { GlassCard } from '@/components/ui/glass-card'
import { GlassPressable } from '@/components/ui/glass-pressable'
import { GlassSurface } from '@/components/ui/glass-surface'
import { motionTokens } from '@/components/ui/motion-tokens'
import { NESTSCOUT_BRAND } from '@/design/brand'
import { color, component } from '@/design/theme'
import { ReduceMotionAwareEntranceView, reduceMotionAwarePressStyle } from '@/components/ui/reduce-motion-aware-animation'
import { appCopy, languageDisplayName, localizedProblemLabel, localizedServiceLabel, localizedStatusLabel, setAppLanguage, type AppLanguage, useAppLanguage } from '@/lib/app-language'
import { useAuth } from '@/lib/auth-provider'
import { generateClientRequestId } from '@/lib/client-request-id'
import { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { customerFeedbackService } from '@/lib/services'
import type { JobMessageResponse, NotificationListResponse } from '@/lib/api-types'
import { useJobChatThread } from '@/lib/use-job-chat-thread'
import { useServiceWorkflow } from '@/lib/use-service-workflow'
import { setPendingKaelChatDraft } from './kael-chat/pending-intake'

const CUSTOMER_V4_PRODUCTION_STANDARD = 'CUSTOMER_V4_PRODUCTION_STANDARD: accepted customer V4 production standard'
const CUSTOMER_V4_VISUAL_CONTRACT = 'CUSTOMER_V4_VISUAL_CONTRACT: production surfaces replace old customer UI'
const CUSTOMER_CLIENT_PROTOTYPE_PARITY_20260523 = 'CUSTOMER_CLIENT_PROTOTYPE_PARITY_20260523: approved client prototype parity source'
const CUSTOMER_NO_PROTOTYPE_SAMPLE_CLIENT_STATS = 'customer-no-prototype-sample-client-stats'
const CUSTOMER_SHARED_THEME_STORE = 'CUSTOMER_SHARED_THEME_STORE: one theme mode drives all mounted customer tabs'
const CUSTOMER_DOCK_SCROLL_CLEARANCE = 'CUSTOMER_DOCK_SCROLL_CLEARANCE: content clears absolute V4 dock'
const CUSTOMER_LAYER_ECOLOGY_V4 = 'CUSTOMER_LAYER_ECOLOGY_V4: glass mint surfaces, warm material wash, compact copy'
const SEMANTIC_LAYER_SWITCH_V4 = 'SEMANTIC_LAYER_SWITCH_V4: light/dark swaps semantic V4 layers'
const COPY_DENSITY_COMPACT = 'COPY_DENSITY_COMPACT: structure first, no feature explanations'
const KAEL_CHAT_ROUTE_SHIM_CONTRACT = 'KAEL_CHAT_ROUTE_SHIM_CONTRACT: legacy customer Kael tab redirects to full-screen KaelChatSurface'
const CUSTOMER_APPLE_DARK_ASSET_APPEARANCE = 'CUSTOMER_APPLE_DARK_ASSET_APPEARANCE: client PNG assets use base/elevated dark backing, neutral rim, softened white values, no hard inversion'
const CUSTOMER_APPLE_IOS26_CLIENT_SECTIONS = 'CUSTOMER_APPLE_IOS26_CLIENT_SECTIONS: Home Request Activity use Apple Foundation hierarchy, standard content materials, and Liquid Glass only for controls/navigation'
const CUSTOMER_WORKER_TYPOGRAPHY_PARITY = 'CUSTOMER_WORKER_TYPOGRAPHY_PARITY: customer surfaces use the worker app system-font rhythm, 600/700 weights, and zero letter spacing'
const CUSTOMER_ACTIVITY_APPLE_IOS26_SURFACE = 'CUSTOMER_ACTIVITY_APPLE_IOS26_SURFACE: Activity uses Apple-style hero material, edge highlight, status lens, and standard-material timeline rail'
const CUSTOMER_DECORATIVE_MOTION_ENABLED = false
void CUSTOMER_APPLE_DARK_ASSET_APPEARANCE
void CUSTOMER_APPLE_IOS26_CLIENT_SECTIONS
void CUSTOMER_WORKER_TYPOGRAPHY_PARITY
void CUSTOMER_ACTIVITY_APPLE_IOS26_SURFACE
const customerWorkerTypography = {
  body: { fontWeight: '600' as const, letterSpacing: 0 },
  label: { fontWeight: '700' as const, letterSpacing: 0 },
  screenTitle: { fontWeight: '700' as const, letterSpacing: 0 },
  sectionTitle: { fontWeight: '600' as const, letterSpacing: 0 },
}
const customerDockHeight = component.bottomNav.height
const customerDockKaelActionSize = component.bottomNav.orb.size
const customerDockKaelActionOuterSize = component.bottomNav.orb.outerSize
const customerDockKaelActionRadius = component.bottomNav.orb.radius
const customerDockKaelActionIconSize = component.bottomNav.orb.iconSize
const customerDockKaelActionGlyphHeight = component.bottomNav.orb.glyphHeight
const customerDockKaelActionGlyphWidth = component.bottomNav.orb.glyphWidth
const customerDockKaelActionLabelFontSize = component.bottomNav.orb.labelFontSize
const customerDockKaelActionLabelLineHeight = component.bottomNav.orb.labelLineHeight
const customerDockKaelActionPaddingBottom = component.bottomNav.orb.paddingBottom
const customerDockKaelActionPaddingTop = component.bottomNav.orb.paddingTop
const customerDockKaelActionAuraSize = component.bottomNav.orb.auraSize
const customerDockKaelActionAuraOffsetRight = component.bottomNav.orb.auraOffsetRight
const customerDockKaelActionAuraOffsetTop = component.bottomNav.orb.auraOffsetTop
const customerDockBottomMargin = 18
const customerDockBottomClearance = Math.max(customerDockHeight, customerDockKaelActionOuterSize) + customerDockBottomMargin + 76
const customerFrameHorizontalPadding = 16
const customerDockHiddenListeners = new Set<() => void>()
let customerDockHiddenSnapshot = false
const openBookingPath = '/(customer)/booking'
const openKaelChatPath = '/(customer)/kael-chat'
const openKaelCenterPath = '/(customer)/kael'
const openHistoryPath = '/(customer)/history'
const openProfilePath = '/(customer)/profile'
const customerAmbientLineStyle = {
  opacity: 0.13,
  transform: [{ rotate: '-12deg' }],
}
const customerMapGlowStyle = {
  opacity: 0.34,
  transform: [{ translateX: -59 }, { scale: 1 }],
}
const customerMapPinStyle = {
  transform: [{ translateX: -9 }, { scale: 1 }],
}
const customerHistoryTabKeys: CustomerHistoryTab[] = ['repair', 'price', 'chat', 'done']
const kaelModel8A = require('../../assets/kael-model-8a.png')
const kaelModel8AHead = require('../../assets/kael-model-8a-head.png')
const clientImageIcons = {
  activity: require('../../assets/client-image-icons/client-activity.png'),
  address: require('../../assets/client-image-icons/client-address.png'),
  booking: require('../../assets/client-image-icons/client-booking.png'),
  evidence: require('../../assets/client-image-icons/client-evidence.png'),
  external: require('../../assets/client-image-icons/client-external.png'),
  feedback: require('../../assets/client-image-icons/client-feedback.png'),
  home: require('../../assets/client-image-icons/client-home.png'),
  identity: require('../../assets/client-image-icons/client-identity.png'),
  kael: require('../../assets/client-image-icons/client-kael.png'),
  language: require('../../assets/client-image-icons/client-language.png'),
  logout: require('../../assets/client-image-icons/client-logout-v2.png'),
  password: require('../../assets/client-image-icons/client-password.png'),
  payment: require('../../assets/client-image-icons/client-payment.png'),
  phone: require('../../assets/client-image-icons/client-phone-v2.png'),
  privacy: require('../../assets/client-image-icons/client-privacy.png'),
  profile: require('../../assets/client-image-icons/client-profile.png'),
  request: require('../../assets/client-image-icons/client-request.png'),
  serviceCleaning: require('../../assets/client-image-icons/client-service-cleaning.png'),
  serviceElectrical: require('../../assets/client-image-icons/client-service-electrical.png'),
  servicePlumbing: require('../../assets/client-image-icons/client-service-plumbing.png'),
  theme: require('../../assets/client-image-icons/client-theme.png'),
} as const
const vndFormatter = new Intl.NumberFormat('vi-VN')
const customerIntegerFormatters = {
  en: new Intl.NumberFormat('en-US'),
  vi: new Intl.NumberFormat('vi-VN'),
} as const
const customerUsageRankProgressMax = 1000
const customerMoneyProtectionProgressMax = 100

type CustomerDockActive = 'activity' | 'booking' | 'home' | 'kael' | 'profile'
type CustomerHistoryTab = 'chat' | 'done' | 'price' | 'repair'
type CustomerProfileEditField = 'address' | 'nickname'
type CustomerAccountInfoDraft = {
  birthDate: string
  email: string
  fullName: string
  gender: string
  phone: string
  salutation: string
}
type CustomerGenderValue = 'female' | 'male' | 'other'
type SurfaceTone = 'base' | 'raised' | 'service' | 'water' | 'warm' | 'depth' | 'ghost' | 'disabled'
type ClientImageIconName = keyof typeof clientImageIcons
type CustomerProfileInsightCopy = {
  empty: string
  subtitle: string
  title: string
}
type CustomerProfileInsightStat = {
  available: boolean
  icon: IconName
  label: string
  value: string
}
type CustomerProfileInsightProgress = {
  label: string
  max: number
  value: number
  valueLabel: string
}
type IconName =
  | 'apartment'
  | 'boltPanel'
  | 'broom'
  | 'calendar'
  | 'chat'
  | 'check'
  | 'chevron'
  | 'clock'
  | 'cleaning'
  | 'document'
  | 'estimate'
  | 'external'
  | 'faucet'
  | 'filter'
  | 'feedback'
  | 'history'
  | 'identity'
  | 'kael'
  | 'language'
  | 'logout'
  | 'menu'
  | 'map'
  | 'moon'
  | 'password'
  | 'notification'
  | 'payment'
  | 'person'
  | 'privacy'
  | 'phone'
  | 'plug'
  | 'review'
  | 'request'
  | 'send'
  | 'support'
  | 'ticket'
  | 'theme'
  | 'waterPipe'

const customerGenderOptions: readonly CustomerGenderValue[] = ['male', 'female', 'other']

const clientImageIconByGlyph: Partial<Record<IconName, ClientImageIconName>> = {
  apartment: 'home',
  boltPanel: 'serviceElectrical',
  broom: 'serviceCleaning',
  calendar: 'activity',
  chat: 'kael',
  cleaning: 'serviceCleaning',
  clock: 'activity',
  document: 'booking',
  external: 'external',
  feedback: 'feedback',
  faucet: 'servicePlumbing',
  history: 'activity',
  identity: 'identity',
  kael: 'kael',
  language: 'language',
  logout: 'logout',
  map: 'address',
  password: 'password',
  payment: 'payment',
  person: 'profile',
  phone: 'phone',
  plug: 'serviceElectrical',
  privacy: 'privacy',
  request: 'request',
  support: 'kael',
  ticket: 'booking',
  theme: 'theme',
  waterPipe: 'servicePlumbing',
}

let lastCustomerDockActive: CustomerDockActive = 'home'

function getCustomerDockHiddenSnapshot() {
  return customerDockHiddenSnapshot
}

function subscribeCustomerDockHidden(listener: () => void) {
  customerDockHiddenListeners.add(listener)
  return () => {
    customerDockHiddenListeners.delete(listener)
  }
}

function setCustomerDockHiddenSnapshot(hidden: boolean) {
  if (customerDockHiddenSnapshot === hidden) return
  customerDockHiddenSnapshot = hidden
  customerDockHiddenListeners.forEach((listener) => listener())
}

function useCustomerDockHidden() {
  return useSyncExternalStore(subscribeCustomerDockHidden, getCustomerDockHiddenSnapshot, getCustomerDockHiddenSnapshot)
}

function kaelChatPath(serviceType?: ServiceType | null) {
  return serviceType ? `${openKaelChatPath}?serviceType=${serviceType}` : openKaelChatPath
}

function bookingWizardPath(serviceType?: ServiceType | null) {
  return serviceType ? `${openBookingPath}?serviceType=${serviceType}` : openBookingPath
}

function customerCancelRequiresKaelPolicy(status: LocalDealStatus | null) {
  return status === 'worker_matched' ||
    status === 'worker_on_way' ||
    status === 'arrived' ||
    status === 'inspecting' ||
    status === 'repairing' ||
    status === 'scope_change_pending'
}

function customerJobInProgressStatus(status: LocalDealStatus | null) {
  return status === 'arrived' || status === 'inspecting' || status === 'repairing'
}

function localizedProfileName(rawName: string, languageMode: AppLanguage) {
  const trimmed = rawName.trim()
  if (!trimmed) return ''
  return languageMode === 'vi' && /^customer(\s+qa)?$/i.test(trimmed) ? '' : trimmed
}

function readCustomerProfileMetric(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value)
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return null
}

function readCustomerMetadataString(metadata: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function formatCustomerBirthDateInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

function isValidCustomerBirthDate(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value)
  if (!match) return false
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  const currentYear = new Date().getFullYear()
  if (year < 1900 || year > currentYear || month < 1 || month > 12 || day < 1) return false
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysByMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day <= daysByMonth[month - 1]
}

function normalizeCustomerGender(value: string) {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'male' || normalized === 'nam') return 'male'
  if (normalized === 'female' || normalized === 'nữ' || normalized === 'nu') return 'female'
  if (normalized === 'other' || normalized === 'khác' || normalized === 'khac') return 'other'
  return ''
}

const customerProfileEditorCopy = {
  vi: {
    address: {
      error: 'Nhập địa chỉ cụ thể hơn.',
      helper: 'Kael dùng địa chỉ này để điền nhanh khi tạo yêu cầu.',
      placeholder: 'Nhập địa chỉ căn hộ',
      title: 'Địa chỉ mặc định',
    },
    cancel: 'Hủy',
    nickname: {
      error: 'Nhập ít nhất 2 ký tự.',
      helper: 'Bạn có thể đặt tên thân mật, không cần là tên thật.',
      placeholder: 'Nhập biệt danh',
      title: 'Biệt danh',
    },
    save: 'Lưu',
    saveError: 'Không thể lưu hồ sơ. Vui lòng thử lại.',
    saving: 'Đang lưu',
  },
  en: {
    address: {
      error: 'Enter a more specific address.',
      helper: 'Kael uses this address to prefill future requests.',
      placeholder: 'Enter apartment address',
      title: 'Default address',
    },
    cancel: 'Cancel',
    nickname: {
      error: 'Enter at least 2 characters.',
      helper: 'Use a friendly nickname; it does not need to be your legal name.',
      placeholder: 'Enter nickname',
      title: 'Nickname',
    },
    save: 'Save',
    saveError: 'Could not save profile. Please try again.',
    saving: 'Saving',
  },
} as const

const customerAccountInfoCopy = {
  vi: {
    birthDate: 'Ngày sinh',
    birthDateInvalid: 'Ngày sinh chưa hợp lệ.',
    birthDatePlaceholder: 'DD/MM/YYYY',
    close: 'Đóng',
    email: 'Email (không bắt buộc)',
    emailInvalid: 'Email chưa hợp lệ.',
    emailNote: 'Bạn sẽ nhận lịch sử yêu cầu và hóa đơn qua email này.',
    fieldRequired: 'Nhập ít nhất một thông tin để cập nhật.',
    fullName: 'Họ tên',
    fullNameInvalid: 'Họ tên cần ít nhất 2 ký tự.',
    fullNamePlaceholder: 'Nhập họ tên',
    gender: 'Giới tính',
    genderOptions: { female: 'Nữ', male: 'Nam', other: 'Khác' },
    identityBody: 'Chưa cần cho yêu cầu hiện tại; Kael vẫn dùng thông tin cơ bản để hỗ trợ.',
    identityTitle: 'Xác thực danh tính',
    metaComplete: 'Đã cập nhật',
    metaEmpty: 'Bổ sung',
    metaPartial: (count: number) => `${count}/3 đã lưu`,
    phone: 'Số điện thoại',
    phoneInvalid: 'Số điện thoại chưa hợp lệ.',
    phonePlaceholder: 'Nhập số điện thoại',
    salutation: 'Xưng hô',
    salutationPlaceholder: 'Chọn danh xưng',
    save: 'Cập nhật',
    saveError: 'Không thể cập nhật thông tin. Vui lòng thử lại.',
    saving: 'Đang cập nhật',
    shortFieldInvalid: 'Thông tin này quá dài.',
    title: 'Cập nhật tài khoản',
  },
  en: {
    birthDate: 'Birth date',
    birthDateInvalid: 'Enter a valid birth date.',
    birthDatePlaceholder: 'DD/MM/YYYY',
    close: 'Close',
    email: 'Email (optional)',
    emailInvalid: 'Enter a valid email.',
    emailNote: 'Request history and invoices will be sent to this email.',
    fieldRequired: 'Enter at least one detail to update.',
    fullName: 'Full name',
    fullNameInvalid: 'Full name needs at least 2 characters.',
    fullNamePlaceholder: 'Enter full name',
    gender: 'Gender',
    genderOptions: { female: 'Female', male: 'Male', other: 'Other' },
    identityBody: 'Not required for current requests; Kael still uses the basic profile details.',
    identityTitle: 'Identity verification',
    metaComplete: 'Updated',
    metaEmpty: 'Add details',
    metaPartial: (count: number) => `${count}/3 saved`,
    phone: 'Phone number',
    phoneInvalid: 'Enter a valid phone number.',
    phonePlaceholder: 'Enter phone number',
    salutation: 'Salutation',
    salutationPlaceholder: 'Choose salutation',
    save: 'Update',
    saveError: 'Could not update account information. Please try again.',
    saving: 'Updating',
    shortFieldInvalid: 'This detail is too long.',
    title: 'Update account',
  },
} as const

const customerFeedbackCopy = {
  vi: {
    cancel: 'Hủy',
    errorRequired: 'Nhập ít nhất 8 ký tự để Kael hiểu rõ hơn.',
    helper: 'Tốt, xấu, khó chịu hay thiếu sót đều được. Kael sẽ ghi nhận để cải thiện trải nghiệm thật.',
    placeholder: 'Điều gì Kael làm tốt hoặc cần sửa?',
    rowMeta: 'Gửi cho Kael',
    rowMetaSent: 'Đã ghi nhận',
    rowTitle: 'Góp ý',
    saveError: 'Kael chưa lưu được góp ý. Vui lòng thử lại.',
    saving: 'Đang gửi',
    submit: 'Gửi góp ý',
    title: 'Góp ý cho Kael',
  },
  en: {
    cancel: 'Cancel',
    errorRequired: 'Enter at least 8 characters so Kael has enough context.',
    helper: 'Good, bad, frustrating, or missing details are all welcome. Kael records this to improve the real experience.',
    placeholder: 'What did Kael do well or need to fix?',
    rowMeta: 'Send to Kael',
    rowMetaSent: 'Received',
    rowTitle: 'Feedback',
    saveError: 'Kael could not save this feedback. Please try again.',
    saving: 'Sending',
    submit: 'Send feedback',
    title: 'Feedback for Kael',
  },
} as const

const customerPasswordCopy = {
  vi: {
    cancel: 'Hủy',
    confirmLabel: 'Nhập lại mật khẩu',
    confirmPlaceholder: 'Nhập lại mật khẩu mới',
    currentLabel: 'Mật khẩu hiện tại',
    currentPlaceholder: 'Nhập mật khẩu hiện tại',
    currentRequiredError: 'Nhập mật khẩu hiện tại để tiếp tục.',
    mismatchError: 'Hai mật khẩu chưa khớp.',
    passwordLabel: 'Mật khẩu mới',
    passwordPlaceholder: 'Nhập mật khẩu mới',
    rowMeta: 'Cập nhật',
    rowMetaUpdated: 'Đã cập nhật',
    rowTitle: 'Mật khẩu',
    save: 'Đổi mật khẩu',
    saveError: 'Không thể cập nhật mật khẩu. Vui lòng thử lại.',
    saving: 'Đang cập nhật',
    shortError: 'Mật khẩu cần 8-72 ký tự.',
    title: 'Đổi mật khẩu',
    helper: 'Đặt mật khẩu mới cho tài khoản này. Kael sẽ không lưu hoặc hiển thị mật khẩu của bạn.',
  },
  en: {
    cancel: 'Cancel',
    confirmLabel: 'Confirm password',
    confirmPlaceholder: 'Enter the new password again',
    currentLabel: 'Current password',
    currentPlaceholder: 'Enter current password',
    currentRequiredError: 'Enter your current password to continue.',
    mismatchError: 'Passwords do not match.',
    passwordLabel: 'New password',
    passwordPlaceholder: 'Enter new password',
    rowMeta: 'Update',
    rowMetaUpdated: 'Updated',
    rowTitle: 'Password',
    save: 'Update password',
    saveError: 'Could not update password. Please try again.',
    saving: 'Updating',
    shortError: 'Password needs 8-72 characters.',
    title: 'Update password',
    helper: 'Set a new password for this account. Kael does not store or display your password.',
  },
} as const

const customerProfileCareCopy = {
  vi: {
    interactionLabel: 'Tương tác Kael',
    interactionReady: 'Sẵn sàng',
    savingsLabel: 'Tiết kiệm',
    savingsPending: 'Chờ kiểm giá',
    serviceLabel: 'Dịch vụ đã dùng',
    servicePending: 'Chưa có',
    title: 'Tín hiệu tin cậy',
  },
  en: {
    interactionLabel: 'Kael touchpoints',
    interactionReady: 'Ready',
    savingsLabel: 'Savings',
    savingsPending: 'Awaiting check',
    serviceLabel: 'Services used',
    servicePending: 'No request yet',
    title: 'Trust Signals',
  },
} as const

const customerProfileRankingCopy = {
  vi: {
    empty: 'Kael sẽ cập nhật khi NestScout có lịch sử sử dụng thật.',
    pointsLabel: 'Điểm sử dụng',
    pointsPending: 'Chờ dữ liệu',
    rankLabel: 'Hạng hiện tại',
    rankPending: 'Chờ dữ liệu',
    rankValue: (level: number) => `Hạng ${level}`,
    serviceLabel: 'Dịch vụ đúng giá',
    servicePending: 'Chưa có',
    subtitle: 'Không dùng điểm mẫu hoặc xếp hạng tự suy diễn.',
    title: 'Xếp hạng sử dụng',
  },
  en: {
    empty: 'Kael updates this when NestScout has real usage history.',
    pointsLabel: 'Usage points',
    pointsPending: 'Awaiting data',
    rankLabel: 'Current rank',
    rankPending: 'Awaiting data',
    rankValue: (level: number) => `Rank ${level}`,
    serviceLabel: 'Fair-price services',
    servicePending: 'No service yet',
    subtitle: 'No sample score or inferred ranking is shown.',
    title: 'Usage Ranking',
  },
} as const

const customerProfileMoneyCopy = {
  vi: {
    empty: 'Chỉ số bảo vệ dòng tiền sẽ mở khi có giao dịch và kiểm giá thật.',
    fairPriceLabel: 'Dịch vụ đúng giá',
    fairPricePending: 'Chờ kiểm giá',
    protectedValueLabel: 'Giá trị đã bảo vệ',
    protectedValuePending: 'Chờ dữ liệu',
    scoreLabel: 'Chỉ số bảo vệ',
    scorePending: 'Chờ dữ liệu',
    scoreValue: (score: number) => `${score}/100`,
    subtitle: 'Dựa trên kiểm giá, thanh toán và tranh chấp thật.',
    title: 'Bảo vệ dòng tiền',
  },
  en: {
    empty: 'Money protection opens after real transactions and price checks.',
    fairPriceLabel: 'Fair-price services',
    fairPricePending: 'Awaiting check',
    protectedValueLabel: 'Protected value',
    protectedValuePending: 'Awaiting data',
    scoreLabel: 'Protection score',
    scorePending: 'Awaiting data',
    scoreValue: (score: number) => `${score}/100`,
    subtitle: 'Based on real price checks, payments, and disputes.',
    title: 'Money Protection',
  },
} as const

const customerProfileSectionCopy = {
  vi: {
    identity: 'Tài khoản căn hộ',
    profileStatus: 'Hồ sơ',
    settings: 'Thiết lập và hỗ trợ',
  },
  en: {
    identity: 'Apartment Account',
    profileStatus: 'Profile',
    settings: 'Settings and Support',
  },
} as const

const customerCopy = {
  vi: {
    home: {
      title: NESTSCOUT_BRAND.appName,
      subtitle: 'Kael sẵn sàng phục vụ tận tình!',
      searchA11y: 'Mở Kael tạo yêu cầu',
      searchText: 'Bạn cần sửa gì?',
      commandKicker: 'Bạn cần Kael giúp việc gì hôm nay?',
      commandSubtitle: 'Mở chat nhanh để Kael gom thông tin',
      commandTitle: 'Ổ cắm bị nóng, nước rò, hay cần dọn nhà?',
      commandBody: 'Kael nhận thông tin, phân tích và tự điều phối khi đủ dữ liệu.',
      commandComposer: 'Mô tả sự cố',
      commandSend: 'Gửi',
      contextLabel: 'Căn hộ',
      contextFallback: 'Chưa có khu vực',
      addressHint: 'Chọn khu vực khi gửi yêu cầu',
      addressActiveMeta: 'Khu vực của yêu cầu hiện tại',
      serviceMetaElectrical: 'Ổ cắm, CB, đèn',
      serviceMetaPlumbing: 'Rò rỉ, nghẹt',
      serviceMetaCleaning: 'Dọn căn hộ',
      serviceSectionMeta: '3 nhóm đang hỗ trợ',
      serviceSectionTitle: 'Dịch vụ',
      intakeCta: 'Mở Kael',
      quickActive: 'Yêu cầu',
      quickHistory: 'Hoạt động',
      quickAddress: 'Căn hộ',
      quickTrust: 'Minh bạch giá',
      quickActiveMeta: 'Theo dõi trạng thái',
      quickHistoryMeta: 'Xem tiến trình',
      quickAddressMeta: 'Kiểm tra khu vực',
      quickTrustMeta: 'Ước tính đã kiểm chứng',
      noActiveMeta: 'Chưa có yêu cầu',
      trustTitle: 'Kael kiểm chứng giá',
      trustBody: 'Giá do Kael tính từ dữ liệu hiện có. Kael cập nhật khi có bằng chứng phạm vi mới.',
      notification: (count: number) => `Kael có ${count} cập nhật chưa đọc`,
      activeA11y: (service: string) => `Mở yêu cầu ${service} đang xử lý`,
    },
    ticket: {
      area: 'Khu vực',
      current: 'Hiện tại',
      described: 'Đã mô tả',
      estimate: 'Ước tính',
      finalPrice: 'Giá cuối',
      issue: 'Vấn đề',
      noRequest: 'Không có yêu cầu',
      status: 'Trạng thái',
      unknown: 'Chưa rõ',
      update: 'Cập nhật',
    },
    kael: {
      activeDealError: 'Đang có yêu cầu đang chạy. Mở Hoạt động để theo dõi hoặc hoàn tất trước khi tạo yêu cầu mới.',
      bookingCta: 'Mở chat Kael',
      hubKicker: 'Trợ lý nhận yêu cầu',
      hubTitle: 'Kael nhận mô tả trước',
      hubGreeting: 'Chào bạn, mình là Kael.',
      hubBody: 'Mô tả sự cố điện, nước hoặc vệ sinh. Kael sẽ tóm tắt thành phiếu, chốt ước tính và tự điều phối khi đủ dữ liệu.',
      quickPrompt: 'Bắt đầu bằng dịch vụ',
      attach: 'Đính kèm',
      sessionTitle: 'Phiên nhận yêu cầu',
      sessionMetaReady: 'Đủ để mở phiếu',
      sessionMetaNeedsMore: 'Cần thêm chi tiết',
      assistantSummary: 'Kael đã giữ mô tả này trong phiên. Bước tiếp theo là mở chat Kael để xem ước tính, ghi chú và tiến trình điều phối.',
      assistantMoreDetail: 'Kael cần thêm chi tiết trước khi tạo phiếu.',
      assistantMoreDetailHint: 'Hãy thêm vị trí trong căn hộ, dấu hiệu nhìn thấy, mức độ ảnh hưởng hoặc ảnh trong chat Kael.',
      unsupportedSummary: 'Kael chưa thể tạo phiếu cho dịch vụ ngoài phạm vi hiện tại.',
      unsupportedHint: 'Hiện tại chỉ hỗ trợ sửa điện, sửa nước và vệ sinh/dọn dẹp nhà.',
      quickServiceA11y: (service: string) => `Bắt đầu chat ${service} với Kael`,
      needDetail: 'Mô tả Kael cần rõ hơn trước khi tạo phiếu.',
      needService: 'Cần chọn dịch vụ',
      kaelSendsWorkers: 'Kael gửi thợ',
      summaryTicket: 'Phiếu tóm tắt',
      lockedService: 'Dịch vụ đang khóa',
      unsupportedService: 'Dịch vụ chưa hỗ trợ',
      service: 'Dịch vụ',
    },
    history: {
      filters: ['Sửa', 'Giá', 'Chat', 'Xong'],
      workerWaiting: 'Đang chờ phản hồi',
      workerNone: 'Chưa có thợ nhận',
      workerActive: 'Thợ đang xử lý',
      reviewed: 'Đã gửi đánh giá',
      confirmed: 'Kael đã xác nhận',
      finalConfirm: 'Kael đang xét hoàn tất',
      noWorker: 'Chưa có thợ được ghép',
      cancelledState: 'Yêu cầu đã hủy',
      cancelledBody: 'Kael hiển thị trạng thái hủy đã ghi nhận và cổng chính sách đang khóa giao dịch này. Luồng cũ không được mở lại; bạn có thể tạo yêu cầu mới khi cần.',
      orchestrationStatus: 'Kael đang điều phối',
      waitingWorkerDone: 'Chờ thợ hoàn tất',
      editRequest: 'Chỉnh yêu cầu',
      newRequest: 'Tạo yêu cầu mới',
      openPriceCheck: 'Mở chat Kael',
      continueWithKael: 'Tiếp tục với Kael',
      chatHelperTitle: 'Kael đề xuất hỗ trợ',
      chatHelperMeta: 'Từ workflow thật',
      chatHelperTime: 'Thời gian',
      chatHelperTimeNow: 'Ngay bây giờ',
      chatHelperDetails: 'Xem chi tiết',
      caseCommandMeta: 'Từ dữ liệu thật',
      caseCommandTitle: 'Trung tâm ca việc',
      caseConfidence: 'Độ tin cậy',
      caseEta: 'ETA',
      caseEtaPending: 'Chờ tín hiệu di chuyển thật',
      caseId: 'Mã việc',
      caseLocation: 'Vị trí',
      caseNext: 'Tiếp theo',
      locationEtaTitle: 'Vị trí & ETA',
      locationEtaMeta: 'Theo quyền địa chỉ',
      locationAddressGate: 'Quyền địa chỉ',
      locationAddressHidden: 'Ẩn địa chỉ chi tiết',
      locationAddressReleased: 'Đã mở theo chính sách',
      locationLiveSignal: 'Tín hiệu hiện tại',
      locationSearchCountdown: (seconds: number) => `Tìm thợ còn ${seconds} giây`,
      locationWorkerAcceptedSignal: 'Thợ đã nhận việc',
      locationWorkerOnWaySignal: 'Thợ đang di chuyển',
      locationNoSignal: 'Chờ tín hiệu thật',
      locationEtaExpected: 'Thời gian dự kiến',
      locationRoute: 'Hành trình',
      locationTrackAction: 'Theo dõi hành trình',
      liveAlertTitle: 'Cảnh báo việc đang chạy',
      liveAlertMetaUnread: (count: number) => `${count} thông báo chưa đọc`,
      liveAlertMetaWorkflow: 'Theo workflow hiện tại',
      liveAlertSource: 'Nguồn',
      liveAlertSourceNotification: 'Thông báo thật',
      liveAlertSourceWorkflow: 'Workflow thật',
      liveAlertUnread: 'Chưa đọc',
      liveAlertUnreadEmpty: 'Không có thông báo mới',
      liveAlertNext: 'Tiếp theo',
      liveAlertProblem: 'Vấn đề',
      liveAlertArea: 'Khu vực',
      liveAlertPriority: 'Ưu tiên',
      liveAlertPrice: 'Yêu cầu',
      liveAlertDistance: 'Khoảng cách',
      liveAlertMessageWorker: 'Nhắn thợ',
      liveAlertFallbackTitle: 'Theo dõi trạng thái',
      liveAlertFallbackBody: 'Kael sẽ cập nhật khi workflow có tín hiệu mới.',
      jobAcceptanceTitle: 'Thợ đã nhận việc',
      jobAcceptanceMeta: 'Từ trạng thái job thật',
      jobAcceptanceBody: 'Kael giữ tóm tắt công việc và quyền địa chỉ theo chính sách hiện tại.',
      jobAcceptanceStatus: 'Trạng thái nhận',
      jobAcceptanceAddress: 'Địa chỉ mở',
      jobAcceptanceChat: 'Chat công việc',
      jobAcceptanceBrief: 'Tóm tắt gửi thợ',
      jobAcceptanceNoBrief: 'Chờ tóm tắt thợ thật',
      jobProgressTitle: 'Công việc đang chạy',
      jobProgressMeta: 'Theo phase thật',
      jobProgressBody: 'Tiến trình đi theo trạng thái đồng bộ và các cổng bằng chứng.',
      jobProgressPhase: 'Phase',
      jobProgressEvidence: 'Cổng bằng chứng',
      caseMatching: 'Ghép thợ',
      caseQuote: 'Biên giá',
      matchingScoreTitle: 'Điểm ghép thợ',
      matchingScoreMeta: 'Dựa trên phiếu và broadcast thật',
      matchingFit: 'Độ phù hợp',
      matchingEvidence: 'Bằng chứng',
      matchingEvidenceCount: (count: number) => `${count} bằng chứng thật`,
      matchingEvidenceEmpty: 'Chưa gửi bằng chứng',
      matchingWorkerSignal: 'Tín hiệu thợ',
      matchingPrebrief: 'Tóm tắt Kael',
      matchingNoWorkerProfile: 'Chưa có hồ sơ thợ thật',
      workerQuoteTitle: 'Phiếu giá công việc',
      workerQuoteMeta: 'Kael giữ quyền giá cuối',
      workerQuoteBody: 'Kael đối soát biên giá hiện tại trước khi xác nhận giá cuối.',
      workerQuoteBroadcast: 'Giá gửi thợ',
      workerQuoteKael: 'Ước tính Kael',
      workerQuoteScope: 'Phạm vi mới',
      workerQuoteScopePending: 'Chưa có đổi phạm vi',
      workerQuoteTime: 'Thời gian',
      workerQuoteTimeNow: 'Ngay bây giờ',
      workerQuoteDetails: 'Xem đề xuất',
      cancelTitle: 'Hủy yêu cầu?',
      cancelSearching: 'Yêu cầu tìm thợ sẽ dừng và địa chỉ chi tiết vẫn bị ẩn khỏi thợ.',
      cancelActive: 'Kael sẽ xử lý yêu cầu hủy theo chính sách, ghi dấu vết kiểm tra và báo cho thợ nếu việc đã được nhận.',
      cancelDraft: 'Phiếu sẽ đóng. Bạn có thể tạo yêu cầu mới khi cần.',
      keep: 'Giữ lại',
      cancelRequest: 'Hủy yêu cầu',
      scopeApproveTitle: 'Đồng ý quyết định đổi phạm vi?',
      scopeRejectTitle: 'Khiếu nại đổi phạm vi?',
      scopeApproveBody: 'Hệ thống sẽ ghi nhận bạn đồng ý với quyết định của Kael để thợ tiếp tục sửa.',
      scopeRejectBody: 'Hệ thống sẽ ghi nhận khiếu nại để Kael hoặc hỗ trợ xem lại trước khi thợ tiếp tục phạm vi mới.',
      approve: 'Đồng ý',
      reject: 'Khiếu nại',
      progress: 'Tiến trình yêu cầu',
      scope: 'Đổi phạm vi',
      waitingDecision: 'Kael đang xét',
      reason: 'Lý do',
      workerNoReason: 'Thợ chưa ghi lý do',
      newPrice: 'Giá mới',
      kaelReviewing: 'Kael đang xét',
      evidence: 'Bằng chứng hoàn tất',
      evidenceBefore: 'Ảnh trước',
      evidenceAfter: 'Ảnh sau',
      waitingWorkerPrice: 'Chờ Kael chốt',
      priceDisclaimer: LOCAL_WORKFLOW_PRICE_DISCLAIMER,
      chatEmpty: 'Chưa có trao đổi cho yêu cầu này',
      openOrchestration: 'Mở điều phối',
      orchestrationTitle: 'Kael đang điều phối',
      orchestrationBody: 'Kael tự chuyển yêu cầu sang tìm thợ khi dữ liệu đủ theo chính sách. Bạn có thể theo dõi, hủy hoặc khiếu nại nếu cần.',
      paymentReview: 'Thanh toán & đánh giá',
      payment: 'Thanh toán',
      review: 'Đánh giá',
      locked: 'Khóa',
      open: 'Mở',
      presenceTitle: 'Bản đồ hoàn tất',
      presenceHome: 'Điểm hẹn',
      presenceWorker: 'Thợ cập nhật',
      chooseStar: (rating: number) => `Chọn ${rating} sao`,
      submitReview: 'Gửi đánh giá',
      timeline: [
        ['Mô tả vấn đề', ['draft', 'analyzing']],
        ['Kael điều phối', ['awaiting_customer_confirm']],
        ['Tìm thợ', ['broadcasting']],
        ['Thợ nhận việc', ['worker_matched', 'worker_on_way']],
        ['Kiểm tra/sửa', ['arrived', 'inspecting', 'repairing', 'scope_change_pending']],
        ['Thợ báo hoàn tất', ['completed_by_worker']],
        ['Kael xác nhận xong', ['confirmed_by_customer', 'reviewed']],
      ],
    },
    profile: {
      noEmail: 'Chưa có email hồ sơ',
      admin: 'Quản trị',
      customer: 'Khách',
      unknownRole: 'Chưa xác định',
      realData: 'Đang có yêu cầu',
      home: 'CĂN HỘ',
      noRequest: 'Chưa có yêu cầu',
      draft: 'Phiếu nháp',
      service: 'Dịch vụ',
      data: 'Dữ liệu',
      apartment: 'Căn hộ',
      privacy: 'Riêng tư',
      address: 'Địa chỉ',
      kaelManager: 'Quản Gia Kael',
      serviceScope: 'Điện / nước / vệ sinh',
      history: 'Hoạt động',
      interface: 'Giao diện',
      light: 'Sáng',
      dark: 'Tối',
      signOut: 'Đăng xuất',
      switchAccount: 'Đổi tài khoản',
    },
    nav: { home: 'Nhà', booking: 'Yêu cầu', kael: 'Kael', activity: 'Hoạt động', profile: 'Hồ sơ' },
    navA11y: { home: 'Trang chủ', booking: 'Tạo yêu cầu', kael: 'Kael', activity: 'Hoạt động', profile: 'Hồ sơ' },
  },
  en: {
    home: {
      title: NESTSCOUT_BRAND.appName,
      subtitle: 'Kael is ready to orchestrate',
      searchA11y: 'Open Kael service chat',
      searchText: 'What needs fixing?',
      commandKicker: 'What can Kael help with today?',
      commandSubtitle: 'Open quick chat so Kael can collect details',
      commandTitle: 'Outlet, leak, or cleaning?',
      commandBody: 'Kael receives the details, analyzes them, and orchestrates when data is sufficient.',
      commandComposer: 'Describe the problem',
      commandSend: 'Send',
      contextLabel: 'Apartment',
      contextFallback: 'No area yet',
      addressHint: 'Choose an area before sending the request',
      addressActiveMeta: 'Area for the current request',
      serviceMetaElectrical: 'Outlet, breaker, light',
      serviceMetaPlumbing: 'Leak, clog',
      serviceMetaCleaning: 'Apartment cleaning',
      serviceSectionMeta: '3 supported groups',
      serviceSectionTitle: 'Services',
      intakeCta: 'Open Kael',
      quickActive: 'Request',
      quickHistory: 'Activity',
      quickAddress: 'Apartment',
      quickTrust: 'Price clarity',
      quickActiveMeta: 'Track status',
      quickHistoryMeta: 'View progress',
      quickAddressMeta: 'Check area',
      quickTrustMeta: 'Audited estimate',
      noActiveMeta: 'No active request',
      trustTitle: 'Kael keeps price audit',
      trustBody: 'Prices are Kael estimates from current evidence. Kael updates them when new scope evidence is added.',
      notification: (count: number) => `Kael has ${count} unread updates`,
      activeA11y: (service: string) => `Open active ${service} request`,
    },
    ticket: {
      area: 'Area',
      current: 'Current',
      described: 'Described',
      estimate: 'Estimate',
      finalPrice: 'Final price',
      issue: 'Problem',
      noRequest: 'No request',
      status: 'Status',
      unknown: 'Unknown',
      update: 'Update',
    },
    kael: {
      activeDealError: 'An active request is running. Open Activity to follow or finish it before creating a new request.',
      bookingCta: 'Open Kael chat',
      hubKicker: 'Service Intake Assistant',
      hubTitle: 'Kael takes the description first',
      hubGreeting: 'Hi, I am Kael.',
      hubBody: 'Describe an electrical, plumbing, or cleaning issue. Kael will turn it into a ticket, lock the estimate, and orchestrate when enough data exists.',
      quickPrompt: 'Start with a service',
      attach: 'Attach',
      sessionTitle: 'Intake session',
      sessionMetaReady: 'Ready for ticket',
      sessionMetaNeedsMore: 'Needs more detail',
      assistantSummary: 'Kael saved this description for the session. Next, open Kael chat to review the estimate, notes, and orchestration progress.',
      assistantMoreDetail: 'Kael needs a little more detail before creating a ticket.',
      assistantMoreDetailHint: 'Add the room, visible symptom, impact level, or photo context in Kael chat.',
      unsupportedSummary: 'Kael cannot create a ticket for a service outside the current scope.',
      unsupportedHint: 'NestScout currently supports electrical repair, plumbing repair, and home cleaning only.',
      quickServiceA11y: (service: string) => `Start ${service} chat with Kael`,
      needDetail: 'Kael needs a clearer description before creating a ticket.',
      needService: 'Choose a service',
      kaelSendsWorkers: 'Kael sends workers',
      summaryTicket: 'Summary ticket',
      lockedService: 'Service unavailable',
      unsupportedService: 'Service not supported',
      service: 'Service',
    },
    history: {
      filters: ['Repair', 'Price', 'Chat', 'Done'],
      workerWaiting: 'Waiting for response',
      workerNone: 'No worker accepted',
      workerActive: 'Worker in progress',
      reviewed: 'Review sent',
      confirmed: 'Kael confirmed',
      finalConfirm: 'Kael reviewing completion',
      noWorker: 'No worker matched',
      cancelledState: 'Request cancelled',
      cancelledBody: 'Kael shows the recorded cancellation state and the policy gate locking this transaction. This workflow is not reopened; create a new request when needed.',
      orchestrationStatus: 'Kael orchestrating',
      waitingWorkerDone: 'Waiting for worker completion',
      editRequest: 'Edit request',
      newRequest: 'New request',
      openPriceCheck: 'Open Kael chat',
      continueWithKael: 'Continue with Kael',
      chatHelperTitle: 'Kael suggests support',
      chatHelperMeta: 'From the real workflow',
      chatHelperTime: 'Time',
      chatHelperTimeNow: 'Now',
      chatHelperDetails: 'View details',
      caseCommandMeta: 'From real data',
      caseCommandTitle: 'Case Command Center',
      caseConfidence: 'Confidence',
      caseEta: 'ETA',
      caseEtaPending: 'Awaiting live travel signal',
      caseId: 'Job ID',
      caseLocation: 'Location',
      caseNext: 'Next',
      locationEtaTitle: 'Location & ETA',
      locationEtaMeta: 'By address permission',
      locationAddressGate: 'Address gate',
      locationAddressHidden: 'Detailed address hidden',
      locationAddressReleased: 'Released by policy',
      locationLiveSignal: 'Current signal',
      locationSearchCountdown: (seconds: number) => `Worker search: ${seconds}s left`,
      locationWorkerAcceptedSignal: 'Worker accepted',
      locationWorkerOnWaySignal: 'Worker on the way',
      locationNoSignal: 'Awaiting real signal',
      locationEtaExpected: 'Expected time',
      locationRoute: 'Route',
      locationTrackAction: 'Track route',
      liveAlertTitle: 'Live job alert',
      liveAlertMetaUnread: (count: number) => `${count} unread notice${count === 1 ? '' : 's'}`,
      liveAlertMetaWorkflow: 'From current workflow',
      liveAlertSource: 'Source',
      liveAlertSourceNotification: 'Real notification',
      liveAlertSourceWorkflow: 'Real workflow',
      liveAlertUnread: 'Unread',
      liveAlertUnreadEmpty: 'No new notice',
      liveAlertNext: 'Next',
      liveAlertProblem: 'Problem',
      liveAlertArea: 'Area',
      liveAlertPriority: 'Priority',
      liveAlertPrice: 'Request',
      liveAlertDistance: 'Distance',
      liveAlertMessageWorker: 'Message worker',
      liveAlertFallbackTitle: 'Track status',
      liveAlertFallbackBody: 'Kael will update this when the workflow has a new signal.',
      jobAcceptanceTitle: 'Worker accepted',
      jobAcceptanceMeta: 'From real job state',
      jobAcceptanceBody: 'Kael keeps the job brief and address permission under the current policy.',
      jobAcceptanceStatus: 'Acceptance state',
      jobAcceptanceAddress: 'Released address',
      jobAcceptanceChat: 'Job chat',
      jobAcceptanceBrief: 'Worker brief',
      jobAcceptanceNoBrief: 'Waiting for real worker brief',
      jobProgressTitle: 'Job in progress',
      jobProgressMeta: 'From real phase',
      jobProgressBody: 'Progress follows synced status and evidence gates.',
      jobProgressPhase: 'Phase',
      jobProgressEvidence: 'Evidence gate',
      caseMatching: 'Matching',
      caseQuote: 'Price band',
      matchingScoreTitle: 'Matching score',
      matchingScoreMeta: 'From the real ticket and broadcast',
      matchingFit: 'Match fit',
      matchingEvidence: 'Evidence',
      matchingEvidenceCount: (count: number) => `${count} real evidence item${count === 1 ? '' : 's'}`,
      matchingEvidenceEmpty: 'No evidence sent',
      matchingWorkerSignal: 'Worker signal',
      matchingPrebrief: 'Kael brief',
      matchingNoWorkerProfile: 'No real worker profile yet',
      workerQuoteTitle: 'Job quote sheet',
      workerQuoteMeta: 'Kael owns final price',
      workerQuoteBody: 'Kael reconciles the current price band before confirming the final price.',
      workerQuoteBroadcast: 'Worker-facing price',
      workerQuoteKael: 'Kael estimate',
      workerQuoteScope: 'New scope',
      workerQuoteScopePending: 'No scope change',
      workerQuoteTime: 'Time',
      workerQuoteTimeNow: 'Now',
      workerQuoteDetails: 'View quote',
      cancelTitle: 'Cancel request?',
      cancelSearching: 'The worker search will stop and the detailed address stays hidden.',
      cancelActive: 'Kael will process this cancellation by policy, record the audit trail, and notify the worker if the job was accepted.',
      cancelDraft: 'This ticket will close. You can create a new request later.',
      keep: 'Keep',
      cancelRequest: 'Cancel request',
      scopeApproveTitle: 'Accept Kael scope decision?',
      scopeRejectTitle: 'Appeal scope change?',
      scopeApproveBody: 'The system will record that you accept Kael decision so the worker can continue.',
      scopeRejectBody: 'The system will record an appeal so Kael or support can review before changed work continues.',
      approve: 'Accept',
      reject: 'Appeal',
      progress: 'Request progress',
      scope: 'Scope change',
      waitingDecision: 'Kael reviewing',
      reason: 'Reason',
      workerNoReason: 'No worker reason yet',
      newPrice: 'New price',
      kaelReviewing: 'Kael reviewing',
      evidence: 'Completion evidence',
      evidenceBefore: 'Before',
      evidenceAfter: 'After',
      waitingWorkerPrice: 'Waiting for Kael',
      priceDisclaimer: 'This is a Kael estimate from the current evidence. Kael may update it when new scope evidence is added.',
      chatEmpty: 'No messages for this request yet',
      openOrchestration: 'Open orchestration',
      orchestrationTitle: 'Kael is orchestrating',
      orchestrationBody: 'Kael moves the request into worker search once policy has enough data. You can track, cancel, or appeal if needed.',
      paymentReview: 'Payment & review',
      payment: 'Payment',
      review: 'Review',
      locked: 'Locked',
      open: 'Open',
      presenceTitle: 'Completion map',
      presenceHome: 'Service point',
      presenceWorker: 'Worker update',
      chooseStar: (rating: number) => `Choose ${rating} stars`,
      submitReview: 'Submit review',
      timeline: [
        ['Describe problem', ['draft', 'analyzing']],
        ['Kael orchestrates', ['awaiting_customer_confirm']],
        ['Find worker', ['broadcasting']],
        ['Worker accepted', ['worker_matched', 'worker_on_way']],
        ['Inspect/repair', ['arrived', 'inspecting', 'repairing', 'scope_change_pending']],
        ['Worker completed', ['completed_by_worker']],
        ['Kael confirmed', ['confirmed_by_customer', 'reviewed']],
      ],
    },
    profile: {
      noEmail: 'No profile email yet',
      admin: 'Admin',
      customer: 'Customer',
      unknownRole: 'Unknown',
      realData: 'Active request',
      home: 'HOME',
      noRequest: 'No request yet',
      draft: 'Draft',
      service: 'Service',
      data: 'Data',
      apartment: 'Apartment',
      privacy: 'Privacy',
      address: 'Address',
      kaelManager: 'Kael',
      serviceScope: 'Electrical / plumbing / cleaning',
      history: 'Activity',
      interface: 'Theme',
      light: 'Light',
      dark: 'Dark',
      signOut: 'Sign out',
      switchAccount: 'Switch account',
    },
    nav: { home: 'Home', booking: 'Request', kael: 'Kael', activity: 'Activity', profile: 'Profile' },
    navA11y: { home: 'Home', booking: 'Create request', kael: 'Kael', activity: 'Activity', profile: 'Profile' },
  },
} as const

export function CustomerHomeSurface() {
  const { push, replace } = useRouter()
  const { session } = useAuth()
  const languageMode = useAppLanguage()
  const copy = customerCopy[languageMode]
  const { reduceMotion } = useGlassAccessibility()
  const { dispatch, selectors, state } = useFrontendWorkflow()
  const [homeCommandDraft, setHomeCommandDraft] = useState('')
  const activeDeal = state.deal
  const canStartNewDeal = !activeDeal || canReplaceCustomerDeal(activeDeal.status)
  const isTerminalDeal = activeDeal ? isTerminalCustomerDeal(activeDeal.status) : false
  const activeDealRoute =
    selectors.currentStatus === 'draft' || selectors.currentStatus === 'analyzing'
      ? kaelChatPath(activeDeal?.draft.serviceType)
      : openHistoryPath
  const activeDealStatusLabel = customerVisibleStatusLabel(selectors.currentStatus, selectors.customerSearchState, languageMode)
  const customerMetadata = session?.user.user_metadata ?? {}
  const rawDefaultAddress = typeof customerMetadata.default_address === 'string' ? customerMetadata.default_address.trim() : ''
  const homeAreaValue = customerHomeAreaDisplayLabel(activeDeal, rawDefaultAddress, languageMode, copy.home.contextFallback)
  const homeAddressMeta = activeDeal
    ? copy.home.addressActiveMeta
    : rawDefaultAddress
      ? languageMode === 'en' ? 'Default address' : 'Địa chỉ mặc định'
      : copy.home.addressHint
  const rawDisplayName = readCustomerMetadataString(customerMetadata, 'nickname', 'preferred_name', 'full_name', 'name')
  const displayName = localizedProfileName(rawDisplayName, languageMode)
  const homeTitle = languageMode === 'en'
    ? displayName ? `Hi, ${displayName}` : 'Hi there'
    : displayName ? `Xin chào, ${displayName}` : 'Xin chào'
  const customerTitle = homeTitle
  const openKaelChatFlow = (serviceType?: ServiceType) => {
    if (!canStartNewDeal) {
      replace(activeDealRoute)
      return
    }
    if (isTerminalDeal) dispatch({ type: 'reset_workflow' })
    push(kaelChatPath(serviceType))
  }
  const openBookingFlow = (serviceType?: ServiceType) => {
    if (!canStartNewDeal) {
      replace(activeDealRoute)
      return
    }
    if (isTerminalDeal) dispatch({ type: 'reset_workflow' })
    push(bookingWizardPath(serviceType))
  }
  const homeCommandTarget = canStartNewDeal ? openKaelChatPath : activeDealRoute
  const openHomeCommand = () => {
    if (canStartNewDeal) {
      push(openKaelChatPath)
      return
    }
    replace(activeDealRoute)
  }
  const submitHomeCommand = () => {
    const message = homeCommandDraft.trim()
    if (!message) {
      openHomeCommand()
      return
    }
    if (!canStartNewDeal) {
      replace(activeDealRoute)
      return
    }
    if (isTerminalDeal) dispatch({ type: 'reset_workflow' })
    setPendingKaelChatDraft({
      clientRequestId: generateClientRequestId(),
      createdAt: new Date().toISOString(),
      locale: languageMode,
      mediaCount: 0,
      message,
      problemChips: [],
      serviceType: null,
      source: 'kael',
    })
    setHomeCommandDraft('')
    push(openKaelChatPath)
  }
  const homeCommandActionLabel = canStartNewDeal ? copy.home.intakeCta : copy.home.quickActive
  const homeShortcuts: Array<{ icon: IconName; meta: string | null; onPress: () => void; testID: string; title: string; tone: SurfaceTone }> = [
    {
      icon: 'request',
      meta: activeDeal ? activeDealStatusLabel : null,
      onPress: () => replace(activeDeal ? activeDealRoute : openHistoryPath),
      testID: 'customer-home-shortcut-active',
      title: copy.home.quickActive,
      tone: 'service',
    },
    {
      icon: 'clock',
      meta: copy.home.quickHistoryMeta,
      onPress: () => replace(openHistoryPath),
      testID: 'customer-home-shortcut-history',
      title: copy.home.quickHistory,
      tone: 'water',
    },
    {
      icon: 'apartment',
      meta: copy.home.quickAddressMeta,
      onPress: () => replace(openProfilePath),
      testID: 'customer-home-shortcut-address',
      title: copy.home.quickAddress,
      tone: 'service',
    },
    {
      icon: 'estimate',
      meta: copy.home.quickTrustMeta,
      onPress: () => openKaelChatFlow(),
      testID: 'customer-home-shortcut-trust',
      title: copy.home.quickTrust,
      tone: 'warm',
    },
  ]
  return (
    <V4Frame active="home" testID="customer-home-surface">
      {({ tokens }) => (
        <>
          <View style={styles.v4Content}>
            <View style={styles.hiddenMarker} testID="customer-home-ios26-foundation-section" />
            <View style={styles.homeTopRow} testID="customer-home-title-row">
              <View style={styles.titleBlock}>
                <Text adjustsFontSizeToFit minimumFontScale={0.82} style={[styles.screenTitle, { color: tokens.text }]} numberOfLines={1}>
                  {customerTitle}
                </Text>
                <Text style={[styles.sectionMeta, { color: tokens.muted }]} numberOfLines={1}>
                  {copy.home.subtitle}
                </Text>
              </View>
            </View>
            <View style={styles.homeSheet}>
              <View style={styles.hiddenMarker} testID="customer-home-signature-v4" />
              <View style={styles.hiddenMarker} testID="customer-home-layer-stack" />
              <View style={styles.hiddenMarker} testID="customer-home-hero-depth-grid" />
              <View style={styles.hiddenMarker} testID="customer-home-apartment-context" />
              <View style={styles.hiddenMarker} testID="customer-utility-notification-center" />
              <ReduceMotionAwareEntranceView delayMs={100} distanceY={16} style={styles.homeHeroStack} testID="customer-home-hero-motion">
                <Pressable accessibilityLabel={`${copy.home.contextLabel}. ${homeAreaValue}`} accessibilityRole="button" onPress={() => replace(openProfilePath)} style={({ pressed }) => [styles.homeAddressCard, customerHomeFrameSurface(tokens), reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID="customer-home-address-card">
                  <View style={styles.homeAddressCopy}>
                    <Text style={[styles.homeAddressValue, { color: tokens.text }]} testID="customer-home-address-value">
                      {homeAreaValue}
                    </Text>
                    <Text style={[styles.homeAddressMeta, { color: tokens.muted }]} numberOfLines={1}>
                      {homeAddressMeta}
                    </Text>
                  </View>
                  <MappedIcon name="chevron" color={tokens.primary} accent={tokens.aqua} />
                </Pressable>
                <GlassCard material="liquid" mode={tokens.mode} style={[styles.homeCommandHero, customerHomeHeroSurface(tokens)]} testID="customer-home-layered-hero">
                  <View style={styles.homeCommandHitArea} testID="customer-home-kael-command">
                    <SubtleGlassHighlight />
                    <View style={styles.homeCommandHeader} testID="customer-home-prototype-kael-mini-top">
                      <KaelMascot variant="head" size={44} material="opaque" />
                      <View style={styles.homeCommandCopy}>
                        <Text style={[styles.homeCommandTitle, { color: tokens.text }]} numberOfLines={2}>
                          {copy.home.commandKicker}
                        </Text>
                        <Text style={[styles.homeCommandSubtitle, { color: tokens.muted }]} numberOfLines={1}>
                          {copy.home.commandSubtitle}
                        </Text>
                      </View>
                      <Pressable accessibilityLabel={homeCommandActionLabel} accessibilityRole="button" onPress={openHomeCommand} style={({ pressed }) => [styles.homeCommandOpen, customerHomeIconOnlySurface(tokens), reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID="customer-home-kael-open">
                        <MappedIcon name="external" color={tokens.primary} accent={tokens.copper} />
                      </Pressable>
                    </View>
                    <View style={[styles.homeCommandPrompt, customerHomePromptSurface(tokens)]} testID="customer-home-kael-command-prompt">
                      <TextInput
                        accessibilityLabel={copy.home.commandTitle}
                        multiline
                        onChangeText={setHomeCommandDraft}
                        onSubmitEditing={submitHomeCommand}
                        placeholder={copy.home.commandTitle}
                        placeholderTextColor={tokens.subtleText}
                        returnKeyType="send"
                        selectionColor={tokens.primary}
                        style={[styles.homeCommandPromptInput, { caretColor: tokens.primary, color: tokens.text } as any]}
                        testID="customer-home-kael-command-input"
                        value={homeCommandDraft}
                      />
                      <View style={styles.homeCommandPromptActions}>
                        <Pressable accessibilityLabel={copy.kael.attach} accessibilityRole="button" onPress={() => openKaelChatFlow()} style={({ pressed }) => [styles.homeCommandAttach, customerHomeControlSurface(tokens), reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID="customer-home-kael-command-attach">
                          <Text style={[styles.homeCommandAttachText, { color: tokens.primary }]} numberOfLines={1}>
                            {copy.kael.attach}
                          </Text>
                        </Pressable>
                        <Pressable accessibilityLabel={copy.home.commandSend} accessibilityRole="button" hitSlop={4} onPress={submitHomeCommand} style={({ pressed }) => [styles.homeCommandSend, customerHomeSendSurface(tokens), reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID="customer-home-kael-command-send">
                          <Text style={[styles.homeCommandSendText, { color: tokens.primaryText }]} numberOfLines={1}>
                            {copy.home.commandSend}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                    <View style={styles.hiddenMarker} testID="customer-home-ticket-decor" />
                  </View>
                </GlassCard>
              </ReduceMotionAwareEntranceView>
              <ReduceMotionAwareEntranceView delayMs={150} distanceY={12} style={styles.homeServicesBlock} testID="customer-home-services-section">
                <View style={styles.sectionTitle} testID="customer-home-services-heading">
                  <Text style={[styles.homeServicesTitle, { color: tokens.text }]} numberOfLines={1}>
                    {copy.home.serviceSectionTitle}
                  </Text>
                  <Text style={[styles.homeServicesMeta, { color: tokens.primary }]} numberOfLines={1}>
                    {copy.home.serviceSectionMeta}
                  </Text>
                </View>
                <View style={styles.serviceGrid} testID="customer-home-service-grid">
                  <V4ServiceCard homeTile icon="plug" meta={copy.home.serviceMetaElectrical} showMeta={false} title={localizedServiceLabel('electrical', languageMode)} testID="customer-shell-service-electrical" tone="service" onPress={() => openBookingFlow('electrical')} />
                  <V4ServiceCard homeTile icon="faucet" meta={copy.home.serviceMetaPlumbing} showMeta={false} title={localizedServiceLabel('plumbing', languageMode)} testID="customer-shell-service-plumbing" tone="water" onPress={() => openBookingFlow('plumbing')} />
                  <V4ServiceCard homeTile icon="broom" meta={copy.home.serviceMetaCleaning} showMeta={false} title={localizedServiceLabel('cleaning', languageMode)} testID="customer-shell-service-cleaning" tone="warm" onPress={() => openBookingFlow('cleaning')} />
                </View>
              </ReduceMotionAwareEntranceView>
              <ReduceMotionAwareEntranceView delayMs={185} distanceY={10} style={styles.homeShortcutGrid} testID="customer-home-shortcuts">
                <View style={styles.hiddenMarker} testID="customer-home-real-shortcuts" />
                {homeShortcuts.map((item) => (
                  <Pressable accessibilityLabel={item.meta ? `${item.title}. ${item.meta}` : item.title} accessibilityRole="button" key={item.testID} onPress={item.onPress} style={({ pressed }) => [styles.homeShortcutTile, customerHomeShortcutSurface(tokens, item.tone), reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID={item.testID}>
                    <View style={styles.homeTileIconStage} testID={`${item.testID}-icon-stage`}>
                      <IconShell icon={item.icon} tone={item.tone} size={33} />
                    </View>
                    <View style={styles.homeShortcutCopy}>
                      <Text style={[styles.homeShortcutTitle, { color: tokens.text }]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      {item.meta ? (
                        <Text style={[styles.homeShortcutMeta, { color: tokens.muted }]} numberOfLines={1}>
                          {item.meta}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                ))}
              </ReduceMotionAwareEntranceView>
              {activeDeal ? (
                <Pressable
                  accessibilityLabel={copy.home.activeA11y(localizedServiceLabel(activeDeal.draft.serviceType, languageMode))}
                  accessibilityRole="button"
                  onPress={() => replace(activeDealRoute)}
                  style={[styles.ticketCard, customerHomeActiveDealSurface(tokens)]}
                  testID="customer-home-active-local-deal"
                >
                  <View style={styles.sectionTitle}>
                    <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
                      {localizedServiceLabel(activeDeal.draft.serviceType, languageMode)}
                    </Text>
                  </View>
                  <View style={styles.twoCol}>
                    <V4TicketCell
                      label={copy.ticket.issue}
                      value={localizedProblemLabel(activeDeal.draft.problemChips[0] ?? activeDeal.draft.inferredProblemLabel, activeDeal.draft.serviceType, languageMode)}
                    />
                    <V4TicketCell label={copy.ticket.area} value={localizedCustomerAreaLabel(activeDeal.draft.districtLabel, languageMode, copy.ticket.unknown)} />
                  </View>
                  <View style={styles.twoCol}>
                    <V4TicketCell label={copy.ticket.status} testID="customer-home-active-status" value={activeDealStatusLabel} />
                    <V4TicketCell label={copy.ticket.estimate} testID="customer-home-active-estimate" value={activeDeal.estimate?.priceRangeLabel ?? copy.history.waitingWorkerPrice} />
                  </View>
                </Pressable>
              ) : null}
              <View style={styles.hiddenMarker} testID="customer-home-trust-note" />
              <View style={styles.hiddenMarker} testID="customer-home-other-services-message" />
              <View style={styles.hiddenMarker} testID="customer-home-relaxed-stage" />
            </View>
          </View>
        </>
      )}
    </V4Frame>
  )
}

export function CustomerBookingEntrySurface() {
  const { push, replace } = useRouter()
  const languageMode = useAppLanguage()
  const copy = customerCopy[languageMode]
  const { dispatch, selectors, state } = useFrontendWorkflow()
  const activeDeal = state.deal
  const isTerminalDeal = activeDeal ? isTerminalCustomerDeal(activeDeal.status) : false
  const canStartNewDeal = !activeDeal || canReplaceCustomerDeal(activeDeal.status)
  const activeDealRoute =
    selectors.currentStatus === 'draft' || selectors.currentStatus === 'analyzing'
      ? kaelChatPath(activeDeal?.draft.serviceType)
      : openHistoryPath
  const activeDealStatusLabel = customerVisibleStatusLabel(selectors.currentStatus, selectors.customerSearchState, languageMode)
  const entryCopy = languageMode === 'en'
    ? {
        activeBody: 'Continue the active request before starting a new one.',
        activeCta: 'View activity',
        activeTitle: 'Request in progress',
        intakeHandoffSubtitle: 'Send details to Kael',
        checklist: 'Intake handoff',
        checklistItems: ['Service', 'Issue', 'Media', 'Area'],
        diagnosis: 'Kael intake',
        diagnosisValue: 'Kael will summarize the issue here after the chat has enough detail.',
        detailEstimate: 'View activity details',
        estimateLabel: 'Kael estimate',
        estimatePending: 'Needs data',
        kicker: 'Start request',
        serviceChange: 'Change service',
        serviceChoose: 'Choose service',
        serviceSelected: 'Selected',
        startKaelCheck: 'Open Kael chat',
        title: 'Start with Kael',
      }
    : {
        activeBody: 'Theo dõi hoặc hoàn tất yêu cầu hiện tại trước khi tạo yêu cầu mới.',
        activeCta: 'Xem hoạt động',
        activeTitle: 'Đang có yêu cầu',
        intakeHandoffSubtitle: 'Gửi thông tin cho Kael',
        checklist: 'Phiếu gửi Kael',
        checklistItems: ['Dịch vụ', 'Vấn đề', 'Ảnh/video', 'Khu vực'],
        diagnosis: 'Kael tiếp nhận',
        diagnosisValue: 'Kael sẽ tóm tắt vấn đề ở đây sau khi chat có đủ chi tiết.',
        detailEstimate: 'Xem chi tiết hoạt động',
        estimateLabel: 'Ước tính Kael',
        estimatePending: 'Cần dữ liệu',
        kicker: 'Bắt đầu yêu cầu',
        serviceChange: 'Đổi dịch vụ',
        serviceChoose: 'Chọn dịch vụ',
        serviceSelected: 'Đã chọn',
        startKaelCheck: 'Mở chat Kael',
        title: 'Bắt đầu với Kael',
      }
  const activeServiceType = activeDeal?.draft.serviceType ?? null
  const estimateLabel = activeDeal?.estimate?.priceRangeLabel ?? entryCopy.estimatePending
  const mediaCount = activeDeal?.draft.mediaCount ?? 0
  const mediaChipLabel = mediaCount > 0
    ? `${languageMode === 'en' ? 'Media' : 'Ảnh/video'}: ${mediaCount}`
    : (languageMode === 'en' ? 'Media: none yet' : 'Ảnh/video: chưa có')
  const serviceMetaForBooking = (serviceType: ServiceType) => {
    if (activeDeal?.draft.serviceType === serviceType) return entryCopy.serviceSelected
    return activeDeal ? entryCopy.serviceChange : entryCopy.serviceChoose
  }
  const bookingIssueValue = activeDeal
    ? localizedProblemLabel(activeDeal.draft.problemChips[0] ?? activeDeal.draft.inferredProblemLabel, activeDeal.draft.serviceType, languageMode)
    : entryCopy.estimatePending
  const bookingMediaValue = mediaCount > 0 ? `${mediaCount}` : entryCopy.estimatePending
  const bookingAreaValue = activeDeal
    ? localizedCustomerAreaLabel(activeDeal.draft.districtLabel, languageMode, copy.ticket.unknown)
    : entryCopy.estimatePending
  const bookingCheckValues = [
    activeServiceType ? localizedServiceLabel(activeServiceType, languageMode) : entryCopy.estimatePending,
    activeDeal?.estimate?.problemLabel ?? bookingIssueValue,
    bookingMediaValue,
    bookingAreaValue,
  ]
  const openChat = (serviceType: ServiceType) => {
    if (!canStartNewDeal) {
      replace(activeDealRoute)
      return
    }
    if (isTerminalDeal) dispatch({ type: 'reset_workflow' })
    push(kaelChatPath(serviceType))
  }
  const openEstimateDetails = () => {
    if (activeDeal) {
      replace(`${openHistoryPath}?tab=price`)
      return
    }
    push(kaelChatPath(activeServiceType))
  }
  const shouldShowBookingWizard = canStartNewDeal

  if (shouldShowBookingWizard) {
    return (
      <V4Frame active="booking" testID="customer-booking-entry-surface">
        {({ tokens }) => (
          <View style={styles.bookingStack}>
            <View pointerEvents="none" style={[styles.customerSectionLiquidWash, { backgroundColor: tokens.aqua }]} testID="customer-section-liquid-wash-booking" />
            <View style={styles.hiddenMarker} testID="customer-booking-ios26-foundation-section" />
            <View style={styles.bookingTopRow} testID="customer-booking-title-row">
              <View style={styles.titleBlock}>
                <Text style={[styles.screenTitle, { color: tokens.text }]} numberOfLines={1}>
                  {entryCopy.title}
                </Text>
                <Text style={[styles.sectionMeta, { color: tokens.muted }]} numberOfLines={1}>
                  {entryCopy.intakeHandoffSubtitle}
                </Text>
              </View>
            </View>
            <View style={styles.hiddenMarker} testID="customer-booking-intake-to-kael-primary" />
            <BookingWizard
              mode={tokens.mode}
              onOpenHistory={() => replace(openHistoryPath)}
              onOpenKael={(serviceType) => replace(kaelChatPath(serviceType))}
            />
          </View>
        )}
      </V4Frame>
    )
  }

  return (
    <V4Frame active="booking" testID="customer-booking-entry-surface">
      {({ tokens }) => (
        <View style={styles.bookingStack}>
          <View style={styles.hiddenMarker} testID="customer-section-liquid-wash-booking" />
          <View style={styles.hiddenMarker} testID="customer-booking-ios26-foundation-section" />
          <View style={styles.bookingTopRow} testID="customer-booking-title-row">
            <View style={styles.titleBlock}>
              <Text style={[styles.screenTitle, { color: tokens.text }]} numberOfLines={1}>
                {entryCopy.title}
              </Text>
              <Text style={[styles.sectionMeta, { color: tokens.muted }]} numberOfLines={1}>
                {entryCopy.intakeHandoffSubtitle}
              </Text>
            </View>
          </View>
          <View style={styles.serviceGrid} testID="customer-booking-service-entry-grid">
            <V4ServiceCard compact icon="plug" meta={serviceMetaForBooking('electrical')} selected={activeServiceType === 'electrical'} title={localizedServiceLabel('electrical', languageMode)} testID="customer-booking-service-electrical" tone="service" onPress={() => openChat('electrical')} />
            <V4ServiceCard compact icon="faucet" meta={serviceMetaForBooking('plumbing')} selected={activeServiceType === 'plumbing'} title={localizedServiceLabel('plumbing', languageMode)} testID="customer-booking-service-plumbing" tone="water" onPress={() => openChat('plumbing')} />
            <V4ServiceCard compact icon="broom" meta={serviceMetaForBooking('cleaning')} selected={activeServiceType === 'cleaning'} title={localizedServiceLabel('cleaning', languageMode)} testID="customer-booking-service-cleaning" tone="warm" onPress={() => openChat('cleaning')} />
          </View>
          <View style={styles.chipRow} testID="customer-booking-summary-chips">
            <SmallChip label={activeDeal?.draft.problemChips[0] ? `${copy.ticket.issue}: ${localizedProblemLabel(activeDeal.draft.problemChips[0], activeDeal.draft.serviceType, languageMode)}` : `${copy.ticket.issue}: ${entryCopy.estimatePending}`} tone="service" />
            <SmallChip label={mediaChipLabel} tone="water" />
            <SmallChip label={`${copy.ticket.area}: ${activeDeal ? localizedCustomerAreaLabel(activeDeal.draft.districtLabel, languageMode, copy.ticket.unknown) : entryCopy.estimatePending}`} tone="warm" />
            <SmallChip label={`${entryCopy.estimateLabel}: ${estimateLabel}`} tone="service" />
          </View>
          <View style={[styles.bookingDiagnosisPanel, customerBookingDiagnosisSurface(tokens)]} testID="customer-booking-ai-diagnosis-summary">
            <View style={styles.hiddenMarker} testID="customer-booking-kael-summary" />
            <View style={[styles.bookingDiagnosisPill, { backgroundColor: tokens.service, borderColor: tokens.borderStrong }]}>
              <IconGlyph name="kael" color={tokens.primary} accent={tokens.copper} />
              <Text style={[styles.bookingDiagnosisPillText, { color: tokens.primary }]} numberOfLines={1}>
                {entryCopy.diagnosis}
              </Text>
            </View>
            <Text style={[styles.bookingDiagnosisBody, { color: tokens.text }]} numberOfLines={4}>
              {localizedCustomerGeneratedText(activeDeal?.estimate?.advisory, languageMode, entryCopy.diagnosisValue)}
            </Text>
          </View>
          <View style={[styles.bookingCheckPanel, customerOpaqueSurface(tokens)]} testID="customer-booking-intake-handoff-panel">
            <SubtleLiquidLight testID="customer-booking-checklist-liquid-rim" variant="rim" />
            <View style={styles.sectionTitle}>
              <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
                {entryCopy.checklist}
              </Text>
            </View>
            <View style={styles.bookingGrid} testID="customer-booking-intake-handoff-grid">
              {entryCopy.checklistItems.map((item, index) => (
                <View key={item} style={[styles.priceBox, customerOpaqueSurface(tokens)]}>
                  <Text style={[styles.priceBoxLabel, { color: tokens.muted }]} numberOfLines={1}>
                    {item}
                  </Text>
                  <Text style={[styles.priceBoxValue, { color: tokens.text }]} numberOfLines={2}>
                    {bookingCheckValues[index] ?? entryCopy.estimatePending}
                  </Text>
                </View>
              ))}
            </View>
            {activeDeal?.estimate ? (
              <Text style={[styles.historyDisclaimerText, { color: tokens.muted }]} numberOfLines={3} testID="customer-booking-estimate-disclaimer">
                {copy.history.priceDisclaimer}
              </Text>
            ) : null}
          </View>
          <PrimaryButton compact label={activeDeal ? entryCopy.detailEstimate : entryCopy.startKaelCheck} onPress={openEstimateDetails} testID="customer-booking-activity-detail-cta" />
          {activeDeal ? (
            <Pressable
              accessibilityLabel={`${entryCopy.activeTitle}. ${activeDealStatusLabel}`}
              accessibilityRole="button"
              onPress={() => replace(activeDealRoute)}
              style={({ pressed }) => [styles.ticketCard, customerBookingActiveRequestSurface(tokens), pressed ? styles.pressed : null]}
              testID="customer-booking-active-request"
            >
              <View style={styles.sectionTitle}>
                <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
                  {entryCopy.activeTitle}
                </Text>
                <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
                  {activeDealStatusLabel}
                </Text>
              </View>
              <Text style={[styles.homeTrustBody, { color: tokens.muted }]} numberOfLines={2}>
                {entryCopy.activeBody}
              </Text>
              <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
                {entryCopy.activeCta}
              </Text>
            </Pressable>
          ) : null}
          <View style={styles.hiddenMarker} testID="customer-booking-legacy-flow-not-primary" />
        </View>
      )}
    </V4Frame>
  )
}

export function CustomerKaelSurface() {
  const { replace } = useRouter()

  useEffect(() => {
    replace(openKaelChatPath)
  }, [replace])

  return null
}

export function CustomerHistorySurface() {
  const { push, replace } = useRouter()
  const params = useLocalSearchParams<{ job_id?: string; scope_change?: string; tab?: string }>()
  const languageMode = useAppLanguage()
  const copy = customerCopy[languageMode]
  const { actions, dispatch, notificationUnreadCount, notifications, selectors, state } = useFrontendWorkflow()
  const requestedHistoryTab = isCustomerHistoryTab(params.tab) ? params.tab : null
  const [selectedHistoryTab, setSelectedHistoryTab] = useState<CustomerHistoryTab>('repair')
  const activeHistoryTab = requestedHistoryTab ?? selectedHistoryTab
  const [reviewRating, setReviewRating] = useState<1 | 2 | 3 | 4 | 5 | null>(null)
  const deal = state.deal
  const scopeChange = deal?.scopeChange ?? null
  const routeJobId = typeof params.job_id === 'string' ? params.job_id : null
  const routeScopeChangeId = typeof params.scope_change === 'string' ? params.scope_change : null
  const isScopeChangeWaiting = Boolean(
    scopeChange && ['requested_by_worker', 'reviewing_by_kael', 'waiting_customer_decision'].includes(scopeChange.status),
  )
  const forceScopeChangeModal = Boolean(
    isScopeChangeWaiting && (!routeScopeChangeId || routeScopeChangeId === scopeChange?.id),
  )
  const originalScopeLabel = deal
    ? localizedProblemLabel(deal.draft.problemChips[0] ?? deal.draft.inferredProblemLabel, deal.draft.serviceType, languageMode)
    : copy.history.kaelReviewing
  const originalEstimateLabel = deal?.estimate?.priceRangeLabel ?? copy.history.kaelReviewing
  const estimateLabel = originalEstimateLabel
  const newScopeLabel = scopeChange?.requestedDescription ?? copy.history.kaelReviewing
  const timeline = getCustomerTimeline(selectors.currentStatus, languageMode)
  const visibleStatusLabel = customerVisibleStatusLabel(selectors.currentStatus, selectors.customerSearchState, languageMode)
  const isCancelledStatus = selectors.currentStatus === 'cancelled'
  const workerStateLabel =
    isCancelledStatus
      ? copy.history.cancelledState
      : selectors.customerSearchState === 'searching'
      ? copy.history.workerWaiting
      : selectors.customerSearchState === 'no_worker'
        ? copy.history.workerNone
        : selectors.customerSearchState === 'matched' || selectors.customerSearchState === 'active'
          ? copy.history.workerActive
          : selectors.customerSearchState === 'completed'
            ? selectors.currentStatus === 'reviewed'
              ? copy.history.reviewed
              : selectors.currentStatus === 'confirmed_by_customer'
              ? copy.history.confirmed
              : copy.history.finalConfirm
            : copy.history.noWorker
  const workflow = useServiceWorkflow({
    status: selectors.currentBackendStatus,
    hasAiNotes: Boolean(deal?.estimate?.advisory),
    hasCompletionEvidence: hasLocalDealCompletionEvidence(deal),
    hasCustomerInput: Boolean(deal),
    hasEstimate: Boolean(deal?.estimate),
    hasScopeChange: Boolean(scopeChange),
  })
  const canSubmitReview = workflow.allowedActions.submitReview && selectors.canCustomerSubmitReview
  const completionEvidenceMode = workflow.artifacts.completion_evidence.mode
  const completionStatusLabel =
    selectors.currentStatus === 'reviewed'
      ? copy.history.reviewed
      : completionEvidenceMode === 'blocked'
        ? workflowBlockedReasonLabel('completion_evidence_required', languageMode)
        : completionEvidenceMode === 'final' || selectors.currentStatus === 'confirmed_by_customer'
          ? copy.history.confirmed
          : selectors.currentStatus === 'completed_by_worker'
            ? copy.history.finalConfirm
            : copy.history.waitingWorkerDone
  const canCreateFreshRequest = !deal || workflow.isDone || selectors.currentStatus === 'cancelled'
  const canEditNoWorkerRequest = selectors.customerSearchState === 'no_worker'
  const canCancelLocalRequest = selectors.canCustomerCancelDeal && !isCancelledStatus
  const selectHistoryTab = (tab: CustomerHistoryTab) => {
    setSelectedHistoryTab(tab)
    replace(tab === 'repair' ? openHistoryPath : `${openHistoryPath}?tab=${tab}`)
  }
  useEffect(() => {
    if (!routeJobId || routeJobId === deal?.id) return
    void actions.hydrateRemoteJobById(routeJobId)
  }, [actions, deal?.id, routeJobId])
  const continueOrCreate = () => {
    if (canEditNoWorkerRequest) {
      dispatch({ type: 'reopen_booking_draft' })
    } else if (deal && canCreateFreshRequest) {
      dispatch({ type: 'reset_workflow' })
    }
    push(kaelChatPath(deal?.draft.serviceType))
  }
  const confirmCancelLocalDeal = () => {
    const cancelMessage = customerCancelRequiresKaelPolicy(selectors.currentStatus)
      ? copy.history.cancelActive
      : selectors.hasLocalBroadcast
      ? copy.history.cancelSearching
      : copy.history.cancelDraft
    const cancelRequest = () => void actions.cancelRemoteJob()
    if (Platform.OS === 'web') {
      if (confirmCustomerHistoryCancellation(copy.history.cancelTitle, cancelMessage)) cancelRequest()
      return
    }
    Alert.alert(copy.history.cancelTitle, cancelMessage, [
      { text: copy.history.keep, style: 'cancel' },
      { text: copy.history.cancelRequest, style: 'destructive', onPress: cancelRequest },
    ])
  }
  const submitSelectedReview = () => {
    if (!reviewRating || !canSubmitReview) return
    void actions.submitReview({ rating: reviewRating, tags: [] })
  }
  const focusReviewPanel = () => {
    selectHistoryTab('done')
  }
  const historyActionLabel = canEditNoWorkerRequest ? copy.history.editRequest : canCreateFreshRequest ? copy.history.newRequest : copy.history.continueWithKael
  const showRepairTab = activeHistoryTab === 'repair'
  const showPriceTab = activeHistoryTab === 'price'
  const showChatTab = activeHistoryTab === 'chat'
  const showDoneTab = activeHistoryTab === 'done'
  const isCompletedHistory = workflow.isDone
  const hasCompletionEvidenceOutcome =
    workflow.artifacts.completion_evidence.visible &&
    workflow.artifacts.completion_evidence.mode !== 'basic'
  const hasCompletionOutcome = hasCompletionEvidenceOutcome || workflow.artifacts.payment_decision.visible || workflow.artifacts.review.visible || workflow.isDone
  const showScopeChangeArtifact =
    workflow.artifacts.scope_change.visible &&
    workflow.artifacts.scope_change.mode !== 'basic'
  const showCompletionEvidence = hasCompletionEvidenceOutcome
  const showReviewArtifact = workflow.artifacts.review.visible
  const isDraftHistoryDeal = deal?.status === 'draft'
  const historySubtitle = deal && !isDraftHistoryDeal
    ? visibleStatusLabel
    : showPriceTab
      ? (languageMode === 'en' ? 'Price and orchestration' : 'Bảng giá và điều phối')
      : showChatTab
        ? (languageMode === 'en' ? 'Messages and Kael notes' : 'Tin nhắn và ghi chú Kael')
        : showDoneTab
          ? (languageMode === 'en' ? 'Completed work' : 'Công việc đã hoàn tất')
          : (languageMode === 'en' ? 'Track apartment requests' : 'Theo dõi yêu cầu của căn hộ')
  const showActivityStatusLens = Boolean(deal && !isDraftHistoryDeal)

  return (
    <V4Frame active="activity" testID="customer-history-surface">
      {({ tokens }) => (
        <View style={styles.plainContent}>
          <View style={styles.hiddenMarker} testID="customer-activity-ios26-foundation-section" />
          <View style={styles.hiddenMarker} testID="customer-history-empty-state" />
          <ScopeChangeHardStopModal
            language={languageMode}
            newScopeLabel={newScopeLabel}
            onApprove={() => scopeChange ? void actions.decideScopeChange(scopeChange.id, { decision: 'approve' }) : undefined}
            onReject={() => scopeChange ? void actions.decideScopeChange(scopeChange.id, { decision: 'reject' }) : undefined}
            originalEstimateLabel={originalEstimateLabel}
            originalScopeLabel={originalScopeLabel}
            scopeChange={scopeChange}
            tokens={tokens}
            visible={forceScopeChangeModal}
          />
          <View style={styles.bookingTopRow} testID="customer-history-title-row">
            <View style={styles.titleBlock}>
              <Text style={[styles.screenTitle, { color: tokens.text }]} numberOfLines={1}>
                {languageMode === 'en' ? 'Activity' : 'Hoạt động'}
              </Text>
              <Text style={[styles.sectionMeta, { color: tokens.muted }]} numberOfLines={1}>
                {historySubtitle}
              </Text>
            </View>
          </View>
          {deal ? <CustomerHistoryPhaseContextPanel languageMode={languageMode} phaseContext={workflow.phaseContext} tokens={tokens} /> : null}
          {deal && isCancelledStatus ? <CustomerHistoryCancellationContextPanel copy={copy} languageMode={languageMode} phaseContext={workflow.phaseContext} tokens={tokens} visibleStatusLabel={visibleStatusLabel} /> : null}
          {showRepairTab ? <View style={[styles.historyHeroPanel, styles.activityHeroPanel, customerActivityHeroSurface(tokens)]} testID="customer-history-repair-hero-panel">
            <View pointerEvents="none" style={styles.hiddenMarker} testID="customer-history-apple-ios26-surface-system" />
            <View pointerEvents="none" style={[styles.activityMaterialEdge, customerActivityEdgeHighlightSurface(tokens)]} testID="customer-history-hero-edge-highlight" />
            <View style={styles.activityHeroTop}>
              <View style={styles.activityHeroCopy}>
                <Text style={[styles.cardHeadline, styles.activityHeroTitle, { color: tokens.text }]} numberOfLines={1} testID="customer-history-repair-hero-title">
                  {deal ? localizedServiceLabel(deal.draft.serviceType, languageMode) : localizedStatusLabel(null, languageMode)}
                </Text>
                {!deal ? (
                  <Text style={[styles.sectionMeta, { color: tokens.muted }]} numberOfLines={1}>
                    {historySubtitle}
                  </Text>
                ) : null}
              </View>
              {showActivityStatusLens ? (
                <View style={[styles.activityStatusLens, customerActivityStatusLensSurface(tokens)]} testID="customer-history-activity-status-lens">
                  <Text style={[styles.activityStatusText, { color: tokens.primary }]} numberOfLines={1}>
                    {visibleStatusLabel}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.historyHeroBody, { color: tokens.muted }]} numberOfLines={3}>
              {deal
                ? (languageMode === 'en'
                  ? 'Kael is keeping this request organized so you can review price, chat, and next status.'
                  : 'Kael đang giữ yêu cầu này gọn để bạn xem giá, chat và trạng thái tiếp theo.')
                : (languageMode === 'en'
                  ? 'Requests appear here after Kael creates a real ticket.'
                  : 'Yêu cầu sẽ hiện ở đây sau khi Kael tạo phiếu thật.')}
            </Text>
            {deal ? (
              <View style={styles.twoCol}>
                <V4TicketCell label={copy.ticket.issue} value={localizedProblemLabel(deal.draft.problemChips[0], deal.draft.serviceType, languageMode)} variant="activity" />
                <V4TicketCell label={copy.ticket.area} value={localizedCustomerAreaLabel(deal.draft.districtLabel, languageMode, copy.ticket.unknown)} variant="activity" />
              </View>
            ) : null}
            <View style={styles.historyHeroActions}>
              <PrimaryButton label={historyActionLabel} onPress={continueOrCreate} compact />
              <SecondaryButton label={languageMode === 'en' ? 'View chat' : 'Xem chat'} onPress={() => push(kaelChatPath(deal?.draft.serviceType))} compact tone="primary" />
            </View>
          </View> : null}
          {deal && showRepairTab ? <CustomerHistoryCaseCommandPanel copy={copy} deal={deal} languageMode={languageMode} phaseContext={workflow.phaseContext} tokens={tokens} visibleStatusLabel={visibleStatusLabel} workerStateLabel={workerStateLabel} /> : null}
          {deal && showRepairTab ? <CustomerHistoryMatchingScorePanel copy={copy} deal={deal} languageMode={languageMode} tokens={tokens} workerStateLabel={workerStateLabel} /> : null}
          {deal && showRepairTab ? <CustomerHistoryLocationEtaPanel copy={copy} deal={deal} languageMode={languageMode} onOpenKael={continueOrCreate} tokens={tokens} visibleStatusLabel={visibleStatusLabel} /> : null}
          {deal && showRepairTab && customerCancelRequiresKaelPolicy(deal.status) ? <CustomerHistoryJobAcceptancePanel copy={copy} deal={deal} languageMode={languageMode} phaseContext={workflow.phaseContext} tokens={tokens} workerStateLabel={workerStateLabel} /> : null}
          {deal && showRepairTab && customerJobInProgressStatus(deal.status) ? <CustomerHistoryJobProgressPanel copy={copy} languageMode={languageMode} phaseContext={workflow.phaseContext} tokens={tokens} /> : null}
          {deal && showRepairTab ? <CustomerHistoryLiveAlertPanel copy={copy} deal={deal} languageMode={languageMode} notificationUnreadCount={notificationUnreadCount} notifications={notifications} onOpenJobChat={() => selectHistoryTab('chat')} phaseContext={workflow.phaseContext} tokens={tokens} /> : null}
          {!deal && showPriceTab ? <CustomerHistoryPriceEmptyPanel copy={copy} languageMode={languageMode} onOpenKael={continueOrCreate} tokens={tokens} /> : null}
          {deal && showPriceTab ? <CustomerHistoryPricePanel copy={copy} deal={deal} estimateLabel={estimateLabel} languageMode={languageMode} onOpenKael={continueOrCreate} originalEstimateLabel={originalEstimateLabel} scopeChange={showScopeChangeArtifact ? scopeChange : null} tokens={tokens} visibleStatusLabel={visibleStatusLabel} /> : null}
          {!deal && showChatTab ? <CustomerHistoryChatEmptyPanel copy={copy} languageMode={languageMode} onOpenKael={continueOrCreate} tokens={tokens} /> : null}
          {deal && showChatTab ? <CustomerHistoryChatPanel copy={copy} deal={deal} languageMode={languageMode} onOpenKael={continueOrCreate} phaseContext={workflow.phaseContext} tokens={tokens} visibleStatusLabel={visibleStatusLabel} /> : null}
          {deal && showRepairTab ? (
            <View style={[styles.flowCard, customerHistoryPanelSurface(tokens)]} testID="customer-history-worker-placeholder">
              <View style={styles.workerCard}>
                <View style={[styles.workerAvatar, { backgroundColor: tokens.water, borderColor: tokens.glassBorder }]} />
                <View style={styles.listCopy}>
                  <Text style={[styles.listTitle, { color: tokens.text }]} numberOfLines={1}>
                    {workerStateLabel}
                  </Text>
                </View>
                <View style={styles.workerActions}>
                  <PrimaryButton label={historyActionLabel} onPress={continueOrCreate} compact />
                  {canCancelLocalRequest ? <SecondaryButton label={copy.history.cancelRequest} onPress={confirmCancelLocalDeal} compact testID="customer-history-cancel-local-deal" /> : null}
                </View>
              </View>
            </View>
          ) : null}
          {deal && showRepairTab ? (
            <View style={[styles.flowCard, styles.historyTimelineCard, styles.activityTimelineCard, customerActivityTimelinePanelSurface(tokens)]} testID="customer-history-activity-timeline">
              <View pointerEvents="none" style={[styles.activityMaterialEdge, customerActivityEdgeHighlightSurface(tokens)]} testID="customer-history-timeline-edge-highlight" />
              <View pointerEvents="none" style={[styles.activityTimelineRail, customerActivityTimelineRailSurface(tokens)]} testID="customer-history-activity-timeline-rail" />
              <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
                {copy.history.progress}
              </Text>
              {timeline.map((item) => (
                <View key={item.label} style={[styles.timelineRow, styles.activityTimelineRow]}>
                  <View style={styles.activityTimelineMarker}>
                    <View style={[styles.timelineDot, styles.activityTimelineDot, customerActivityTimelineDotSurface(tokens, item.active)]} />
                  </View>
                  <View style={styles.activityTimelineCopy}>
                    <Text style={[styles.timelineText, { color: item.active ? tokens.text : tokens.muted }]} numberOfLines={1}>
                      {item.label}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
          {!deal && showRepairTab ? <CustomerHistoryRepairEmptyTimeline languageMode={languageMode} tokens={tokens} /> : null}
          {scopeChange && showScopeChangeArtifact && (showRepairTab || showPriceTab) ? (
            <View style={[styles.flowCard, customerHistoryPanelSurface(tokens)]} testID="customer-history-scope-change-panel">
            <View style={styles.sectionTitle}>
              <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
                {copy.history.scope}
              </Text>
              <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
                {copy.history.waitingDecision}
              </Text>
            </View>
            <View style={styles.twoCol}>
              <V4TicketCell label={copy.ticket.current} value={visibleStatusLabel} variant="activity" />
              <V4TicketCell label={copy.ticket.update} value={scopeChange.requestedDescription ?? copy.history.kaelReviewing} variant="activity" />
            </View>
              <View style={styles.twoCol}>
                <V4TicketCell label={copy.history.reason} value={scopeChange.reason ?? copy.history.workerNoReason} variant="activity" />
                <V4TicketCell label={copy.history.newPrice} value={scopeChange.priceMin && scopeChange.priceMax ? `${formatVnd(scopeChange.priceMin)} - ${formatVnd(scopeChange.priceMax)}` : copy.history.kaelReviewing} variant="activity" />
              </View>
            </View>
          ) : null}
          {showDoneTab ? (
            <View style={styles.historyDoneStack} testID="customer-history-done-stack">
              <CustomerHistoryDoneHero canSubmitReview={canSubmitReview} completionStatusLabel={completionStatusLabel} copy={copy} deal={deal} hasCompletionOutcome={hasCompletionOutcome} isCompleted={isCompletedHistory} languageMode={languageMode} onOpenChat={continueOrCreate} onOpenReview={focusReviewPanel} tokens={tokens} />
              {deal && isCompletedHistory ? (
                <CustomerCompletionPresenceMap copy={copy} deal={deal} languageMode={languageMode} tokens={tokens} visibleStatusLabel={visibleStatusLabel} />
              ) : null}
              {!deal ? <CustomerHistoryDoneMapEmptyPanel copy={copy} tokens={tokens} /> : null}
              {deal && !isCompletedHistory ? <CustomerHistoryDoneMapEmptyPanel copy={copy} statusLabel={completionStatusLabel} tokens={tokens} /> : null}
              {deal && showCompletionEvidence ? <CustomerCompletionEvidencePanel completionStatusLabel={completionStatusLabel} copy={copy} deal={deal} languageMode={languageMode} tokens={tokens} /> : null}
              <CustomerHistoryDoneTimeline
                completionEvidenceMode={workflow.artifacts.completion_evidence.mode}
                completionStatusLabel={completionStatusLabel}
                isDone={workflow.isDone}
                languageMode={languageMode}
                reviewMode={workflow.artifacts.review.mode}
                tokens={tokens}
              />
              {deal && showReviewArtifact ? (
                <CustomerHistoryReviewPanel canSubmitReview={canSubmitReview} copy={copy} onRatingChange={setReviewRating} onSubmit={submitSelectedReview} rating={reviewRating} reviewMode={workflow.artifacts.review.mode} selectors={selectors} tokens={tokens} />
              ) : null}
            </View>
          ) : null}
          <View style={styles.hiddenMarker} testID="customer-shell-honest-history-data" />
          <View style={styles.hiddenMarker} testID="customer-history-evidence-timeline" />
          <View style={styles.hiddenMarker} testID="customer-history-stage-map" />
          <View style={styles.hiddenMarker} testID="customer-history-scope-change-placeholder" />
          <View style={styles.hiddenMarker} testID="customer-history-completion-placeholder" />
        </View>
      )}
    </V4Frame>
  )
}

export function CustomerProfileSurface() {
  const { session, signOut, updateCustomerProfile, updatePassword } = useAuth()
  const themeMode = useCustomerThemeMode()
  const languageMode = useAppLanguage()
  const copy = customerCopy[languageMode]
  const profileEditorCopy = customerProfileEditorCopy[languageMode]
  const { reduceMotion } = useGlassAccessibility()
  const [profileEditorField, setProfileEditorField] = useState<CustomerProfileEditField | null>(null)
  const [profileEditorValue, setProfileEditorValue] = useState('')
  const [profileEditorError, setProfileEditorError] = useState<string | null>(null)
  const [profileEditorSaving, setProfileEditorSaving] = useState(false)
  const [accountInfoOpen, setAccountInfoOpen] = useState(false)
  const [accountInfoDraft, setAccountInfoDraft] = useState<CustomerAccountInfoDraft>({
    birthDate: '',
    email: '',
    fullName: '',
    gender: '',
    phone: '',
    salutation: '',
  })
  const [accountInfoError, setAccountInfoError] = useState<string | null>(null)
  const [accountInfoSaving, setAccountInfoSaving] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackValue, setFeedbackValue] = useState('')
  const [feedbackError, setFeedbackError] = useState<string | null>(null)
  const [feedbackSaving, setFeedbackSaving] = useState(false)
  const [feedbackSent, setFeedbackSent] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [passwordCurrent, setPasswordCurrent] = useState('')
  const [passwordValue, setPasswordValue] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordUpdated, setPasswordUpdated] = useState(false)
  const toggleLanguage = () => setAppLanguage(languageMode === 'vi' ? 'en' : 'vi')
  const toggleTheme = () => setCustomerThemeMode(themeMode === 'light' ? 'dark' : 'light')
  const customerMetadata = session?.user.user_metadata ?? {}
  const rawNickname = readCustomerMetadataString(customerMetadata, 'nickname', 'preferred_name')
  const rawFullName = readCustomerMetadataString(customerMetadata, 'full_name', 'name')
  const rawPhone = readCustomerMetadataString(customerMetadata, 'phone_number', 'phone')
  const rawAddress = readCustomerMetadataString(customerMetadata, 'default_address')
  const rawSalutation = readCustomerMetadataString(customerMetadata, 'salutation')
  const rawGender = readCustomerMetadataString(customerMetadata, 'gender')
  const rawBirthDate = readCustomerMetadataString(customerMetadata, 'birth_date', 'birthDate')
  const rawEmail = readCustomerMetadataString(customerMetadata, 'contact_email', 'email') || session?.user.email?.trim() || ''
  const kaelInteractionCount = readCustomerProfileMetric(customerMetadata.kael_interaction_count ?? customerMetadata.kaelInteractions)
  const completedServiceCount = readCustomerProfileMetric(customerMetadata.completed_service_count ?? customerMetadata.completedServices)
  const priceSavingsVnd = readCustomerProfileMetric(customerMetadata.price_savings_vnd ?? customerMetadata.priceSavingsVnd)
  const usageRankLevel = readCustomerProfileMetric(customerMetadata.usage_rank_level ?? customerMetadata.usageRankLevel ?? customerMetadata.customer_usage_rank_level ?? customerMetadata.customerUsageRankLevel)
  const usageRankPoints = readCustomerProfileMetric(customerMetadata.usage_rank_points ?? customerMetadata.usageRankPoints ?? customerMetadata.customer_usage_points ?? customerMetadata.customerUsagePoints)
  const fairPriceServiceCount = readCustomerProfileMetric(customerMetadata.fair_price_service_count ?? customerMetadata.fairPriceServiceCount ?? customerMetadata.fair_priced_service_count ?? customerMetadata.fairPricedServiceCount)
  const moneyProtectionScore = readCustomerProfileMetric(customerMetadata.money_protection_score ?? customerMetadata.moneyProtectionScore ?? customerMetadata.fair_price_score ?? customerMetadata.fairPriceScore)
  const protectedValueVnd = readCustomerProfileMetric(customerMetadata.protected_value_vnd ?? customerMetadata.protectedValueVnd ?? customerMetadata.money_protected_vnd ?? customerMetadata.moneyProtectedVnd ?? customerMetadata.price_protected_vnd ?? customerMetadata.priceProtectedVnd)
  const closeProfileEditor = useCallback(() => {
    if (profileEditorSaving) return
    setProfileEditorField(null)
    setProfileEditorValue('')
    setProfileEditorError(null)
  }, [profileEditorSaving])
  const openProfileEditor = useCallback((field: CustomerProfileEditField) => {
    setProfileEditorField(field)
    setProfileEditorError(null)
    setProfileEditorValue(field === 'nickname' ? rawNickname : rawAddress)
  }, [rawAddress, rawNickname])
  const submitProfileEditor = useCallback(async () => {
    if (!profileEditorField || profileEditorSaving) return

    const value = profileEditorValue.trim()
    const fieldCopy = profileEditorCopy[profileEditorField]
    const validValue = profileEditorField === 'nickname'
      ? value.length >= 2 && value.length <= 80
      : value.length >= 6 && value.length <= 180

    if (!validValue) {
      setProfileEditorError(fieldCopy.error)
      return
    }

    setProfileEditorSaving(true)
    setProfileEditorError(null)
    try {
      const payload = profileEditorField === 'nickname'
        ? { nickname: value }
        : { defaultAddress: value }
      const result = await updateCustomerProfile(payload)
      if (!result.success) {
        setProfileEditorError(result.error ?? profileEditorCopy.saveError)
        return
      }

      setProfileEditorField(null)
      setProfileEditorValue('')
    } catch {
      setProfileEditorError(profileEditorCopy.saveError)
    } finally {
      setProfileEditorSaving(false)
    }
  }, [profileEditorCopy, profileEditorField, profileEditorSaving, profileEditorValue, updateCustomerProfile])
  const accountInfoCopy = customerAccountInfoCopy[languageMode]
  const feedbackCopy = customerFeedbackCopy[languageMode]
  const passwordCopy = customerPasswordCopy[languageMode]
  const openAccountInfo = useCallback(() => {
    setAccountInfoDraft({
      birthDate: formatCustomerBirthDateInput(rawBirthDate),
      email: rawEmail,
      fullName: rawFullName,
      gender: normalizeCustomerGender(rawGender),
      phone: rawPhone,
      salutation: rawSalutation,
    })
    setAccountInfoError(null)
    setAccountInfoOpen(true)
  }, [rawBirthDate, rawEmail, rawFullName, rawGender, rawPhone, rawSalutation])
  const closeAccountInfo = useCallback(() => {
    if (accountInfoSaving) return
    setAccountInfoOpen(false)
    setAccountInfoError(null)
  }, [accountInfoSaving])
  const updateAccountInfoDraft = useCallback((field: keyof CustomerAccountInfoDraft, value: string) => {
    setAccountInfoDraft((current) => ({ ...current, [field]: value }))
    if (accountInfoError) setAccountInfoError(null)
  }, [accountInfoError])
  const submitAccountInfo = useCallback(async () => {
    if (accountInfoSaving) return

    const fullName = accountInfoDraft.fullName.trim()
    const phone = accountInfoDraft.phone.trim()
    const email = accountInfoDraft.email.trim()
    const salutation = accountInfoDraft.salutation.trim()
    const gender = accountInfoDraft.gender.trim()
    const birthDate = accountInfoDraft.birthDate.trim()
    const phoneDigits = phone.replace(/\D/g, '')
    const hasAnyValue = Boolean(fullName || phone || email || salutation || gender || birthDate)

    if (!hasAnyValue) {
      setAccountInfoError(accountInfoCopy.fieldRequired)
      return
    }
    if (fullName && (fullName.length < 2 || fullName.length > 80)) {
      setAccountInfoError(accountInfoCopy.fullNameInvalid)
      return
    }
    if (salutation.length > 40) {
      setAccountInfoError(accountInfoCopy.shortFieldInvalid)
      return
    }
    if (gender && !normalizeCustomerGender(gender)) {
      setAccountInfoError(accountInfoCopy.shortFieldInvalid)
      return
    }
    if (birthDate && !isValidCustomerBirthDate(birthDate)) {
      setAccountInfoError(accountInfoCopy.birthDateInvalid)
      return
    }
    if (phone && (phoneDigits.length < 9 || phoneDigits.length > 12 || !/^[+0-9().\-\s]+$/.test(phone))) {
      setAccountInfoError(accountInfoCopy.phoneInvalid)
      return
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAccountInfoError(accountInfoCopy.emailInvalid)
      return
    }

    setAccountInfoSaving(true)
    setAccountInfoError(null)
    try {
      const result = await updateCustomerProfile({
        birthDate: birthDate || undefined,
        email: email || undefined,
        fullName: fullName || undefined,
        gender: gender || undefined,
        phone: phone || undefined,
        salutation: salutation || undefined,
      })
      if (!result.success) {
        setAccountInfoError(result.error ?? accountInfoCopy.saveError)
        return
      }

      setAccountInfoOpen(false)
    } catch {
      setAccountInfoError(accountInfoCopy.saveError)
    } finally {
      setAccountInfoSaving(false)
    }
  }, [accountInfoCopy, accountInfoDraft, accountInfoSaving, updateCustomerProfile])
  const openFeedback = useCallback(() => {
    setFeedbackValue('')
    setFeedbackError(null)
    setFeedbackOpen(true)
  }, [])
  const closeFeedback = useCallback(() => {
    if (feedbackSaving) return
    setFeedbackOpen(false)
    setFeedbackError(null)
  }, [feedbackSaving])
  const submitFeedback = useCallback(async () => {
    if (feedbackSaving) return
    const message = feedbackValue.trim()

    if (message.length < 8 || message.length > 1200) {
      setFeedbackError(feedbackCopy.errorRequired)
      return
    }

    setFeedbackSaving(true)
    setFeedbackError(null)
    try {
      const result = await customerFeedbackService.submit({
        language: languageMode,
        message,
        source: 'profile',
      })
      if (!result.success) {
        setFeedbackError(result.error || feedbackCopy.saveError)
        return
      }

      setFeedbackSent(true)
      setFeedbackOpen(false)
      setFeedbackValue('')
    } catch {
      setFeedbackError(feedbackCopy.saveError)
    } finally {
      setFeedbackSaving(false)
    }
  }, [feedbackCopy, feedbackSaving, feedbackValue, languageMode])
  const openPasswordSheet = useCallback(() => {
    setPasswordCurrent('')
    setPasswordValue('')
    setPasswordConfirm('')
    setPasswordError(null)
    setPasswordOpen(true)
  }, [])
  const closePasswordSheet = useCallback(() => {
    if (passwordSaving) return
    setPasswordOpen(false)
    setPasswordError(null)
  }, [passwordSaving])
  const submitPassword = useCallback(async () => {
    if (passwordSaving) return

    if (!passwordCurrent) {
      setPasswordError(passwordCopy.currentRequiredError)
      return
    }
    if (passwordValue.length < 8 || passwordValue.length > 72) {
      setPasswordError(passwordCopy.shortError)
      return
    }
    if (passwordValue !== passwordConfirm) {
      setPasswordError(passwordCopy.mismatchError)
      return
    }

    setPasswordSaving(true)
    setPasswordError(null)
    try {
      const result = await updatePassword({
        currentPassword: passwordCurrent,
        newPassword: passwordValue,
      })
      if (!result.success) {
        setPasswordError(result.error || passwordCopy.saveError)
        return
      }

      setPasswordUpdated(true)
      setPasswordOpen(false)
      setPasswordCurrent('')
      setPasswordValue('')
      setPasswordConfirm('')
    } catch {
      setPasswordError(passwordCopy.saveError)
    } finally {
      setPasswordSaving(false)
    }
  }, [passwordConfirm, passwordCopy, passwordCurrent, passwordSaving, passwordValue, updatePassword])
  const profileNickname = localizedProfileName(rawNickname, languageMode) || appCopy[languageMode].common.noData
  const profileAddress = rawAddress || appCopy[languageMode].common.noData
  const accountInfoSavedCount = [rawFullName, rawPhone, rawEmail].filter(Boolean).length
  const profileAccountInfoMeta = accountInfoSavedCount >= 3
    ? accountInfoCopy.metaComplete
    : accountInfoSavedCount > 0
      ? accountInfoCopy.metaPartial(accountInfoSavedCount)
      : accountInfoCopy.metaEmpty
  const profileCareCopy = customerProfileCareCopy[languageMode]
  const profileRankingCopy = customerProfileRankingCopy[languageMode]
  const profileMoneyCopy = customerProfileMoneyCopy[languageMode]
  const profileSectionCopy = customerProfileSectionCopy[languageMode]
  const profileCareStats = [
    {
      icon: 'kael' as const,
      label: profileCareCopy.interactionLabel,
      value: kaelInteractionCount ? `${kaelInteractionCount}` : profileCareCopy.interactionReady,
    },
    {
      icon: 'request' as const,
      label: profileCareCopy.serviceLabel,
      value: completedServiceCount ? `${completedServiceCount}` : profileCareCopy.servicePending,
    },
    {
      icon: 'payment' as const,
      label: profileCareCopy.savingsLabel,
      value: priceSavingsVnd ? formatVnd(priceSavingsVnd) : profileCareCopy.savingsPending,
    },
  ]
  const profileRankingStats = [
    {
      available: Boolean(usageRankLevel),
      icon: 'request' as const,
      label: profileRankingCopy.rankLabel,
      value: usageRankLevel ? profileRankingCopy.rankValue(usageRankLevel) : profileRankingCopy.rankPending,
    },
    {
      available: Boolean(usageRankPoints),
      icon: 'kael' as const,
      label: profileRankingCopy.pointsLabel,
      value: usageRankPoints ? `${usageRankPoints}` : profileRankingCopy.pointsPending,
    },
    {
      available: Boolean(fairPriceServiceCount),
      icon: 'payment' as const,
      label: profileRankingCopy.serviceLabel,
      value: fairPriceServiceCount ? `${fairPriceServiceCount}` : profileRankingCopy.servicePending,
    },
  ]
  const profileRankingProgress = usageRankPoints
    ? {
        label: profileRankingCopy.pointsLabel,
        max: customerUsageRankProgressMax,
        value: usageRankPoints,
        valueLabel: `${formatCustomerInteger(usageRankPoints, languageMode)}/${formatCustomerInteger(customerUsageRankProgressMax, languageMode)}`,
      }
    : null
  const profileMoneyStats = [
    {
      available: Boolean(moneyProtectionScore),
      icon: 'privacy' as const,
      label: profileMoneyCopy.scoreLabel,
      value: moneyProtectionScore ? profileMoneyCopy.scoreValue(moneyProtectionScore) : profileMoneyCopy.scorePending,
    },
    {
      available: Boolean(protectedValueVnd),
      icon: 'payment' as const,
      label: profileMoneyCopy.protectedValueLabel,
      value: protectedValueVnd ? formatVnd(protectedValueVnd) : profileMoneyCopy.protectedValuePending,
    },
    {
      available: Boolean(fairPriceServiceCount),
      icon: 'check' as const,
      label: profileMoneyCopy.fairPriceLabel,
      value: fairPriceServiceCount ? `${fairPriceServiceCount}` : profileMoneyCopy.fairPricePending,
    },
  ]
  const profileMoneyProgress = moneyProtectionScore
    ? {
        label: profileMoneyCopy.scoreLabel,
        max: customerMoneyProtectionProgressMax,
        value: moneyProtectionScore,
        valueLabel: profileMoneyCopy.scoreValue(moneyProtectionScore),
      }
    : null
  const profileFallbackTitle = languageMode === 'en' ? 'Customer profile' : 'Hồ sơ khách'
  const profileTitle = localizedProfileName(rawNickname, languageMode) || localizedProfileName(rawFullName, languageMode) || profileFallbackTitle
  const profileSubtitle = languageMode === 'en' ? 'Basic information' : 'Thông tin cơ bản'
  const profileEditorConfig = profileEditorField ? profileEditorCopy[profileEditorField] : null
  const profileEditorIsAddress = profileEditorField === 'address'

  return (
    <V4Frame active="profile" testID="customer-profile-surface">
      {({ tokens }) => (
        <View style={styles.plainContent}>
          <ReduceMotionAwareEntranceView delayMs={70} distanceY={10} testID="customer-profile-hero-motion">
            <GlassCard material="liquid" mode={tokens.mode} style={[styles.profilePrototypeHero, customerProfileHeroSurface(tokens)]} testID="customer-profile-hero">
              <ProfileLiquidChrome testID="customer-profile-identity-liquid-card" variant="hero" />
              <View style={styles.hiddenMarker} testID="customer-profile-empty-state" />
              <View style={styles.profilePrototypeTop}>
                <View style={styles.profilePrototypeTitleRow}>
                  <IconShell icon="person" size={54} tone="service" />
                  <View style={styles.profilePrototypeTitleCopy}>
                    <Text style={[styles.profilePrototypeTitle, { color: tokens.text }]} numberOfLines={1} testID="customer-profile-hero-title">
                      {profileTitle}
                    </Text>
                    <Text style={[styles.homeShortcutMeta, { color: tokens.muted }]} numberOfLines={1}>
                      {profileSubtitle}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={styles.hiddenMarker} testID="customer-admin-audit-switch" />
            </GlassCard>
          </ReduceMotionAwareEntranceView>
          <View style={styles.hiddenMarker} testID="customer-profile-setup-card" />
          <View style={styles.hiddenMarker} testID="customer-shell-honest-profile-save" />
          <ReduceMotionAwareEntranceView delayMs={125} distanceY={8} style={[styles.profileActions, styles.profileCareWideWrap]} testID="customer-profile-care-card-motion">
            <CustomerProfileCareCard
              copy={profileCareCopy}
              stats={profileCareStats}
            />
          </ReduceMotionAwareEntranceView>
          <ReduceMotionAwareEntranceView delayMs={150} distanceY={8} style={styles.profileActions} testID="customer-profile-ranking-card-motion">
            <CustomerProfileInsightPanel copy={profileRankingCopy} progress={profileRankingProgress} stats={profileRankingStats} testID="customer-profile-ranking-card" />
          </ReduceMotionAwareEntranceView>
          <ReduceMotionAwareEntranceView delayMs={175} distanceY={8} style={styles.profileActions} testID="customer-profile-money-protection-card-motion">
            <CustomerProfileInsightPanel copy={profileMoneyCopy} progress={profileMoneyProgress} stats={profileMoneyStats} testID="customer-profile-money-protection-card" />
          </ReduceMotionAwareEntranceView>
          <ReduceMotionAwareEntranceView delayMs={205} distanceY={8} style={styles.profileActions} testID="customer-profile-list-motion">
            <View style={[styles.listCard, styles.profileGlassListCard, customerProfilePanelSurface(tokens)]} testID="customer-profile-checklist">
              <ProfileLiquidChrome testID="customer-profile-identity-panel-liquid" variant="panel" />
              <Text style={[styles.profileListSectionTitle, { color: tokens.muted }]} numberOfLines={1}>
                {profileSectionCopy.identity}
              </Text>
              <View style={styles.hiddenMarker} testID="customer-profile-unified-functions" />
              <View style={styles.hiddenMarker} testID="customer-profile-privacy-shell" />
              <ActionRow compact icon="identity" title={profileEditorCopy.nickname.title} meta={profileNickname} onPress={() => openProfileEditor('nickname')} testID="customer-profile-edit-nickname" />
              <ActionRow compact icon="phone" title={languageMode === 'en' ? 'Information' : 'Thông tin'} meta={profileAccountInfoMeta} onPress={openAccountInfo} testID="customer-profile-open-account-info" />
              <ActionRow compact icon="map" title={profileEditorCopy.address.title} meta={profileAddress} onPress={() => openProfileEditor('address')} testID="customer-utility-saved-address" />
              <View style={styles.hiddenMarker} testID="customer-profile-evidence-shell" />
            </View>
          </ReduceMotionAwareEntranceView>
          <ReduceMotionAwareEntranceView delayMs={245} distanceY={8} style={styles.profileActions} testID="customer-profile-actions-motion">
            <View style={[styles.listCard, styles.profileGlassListCard, customerProfilePanelSurface(tokens)]}>
              <ProfileLiquidChrome testID="customer-profile-settings-panel-liquid" variant="panel" />
              <Text style={[styles.profileListSectionTitle, { color: tokens.muted }]} numberOfLines={1}>
                {profileSectionCopy.settings}
              </Text>
              <ActionRow compact icon="theme" title={copy.profile.interface} meta={themeMode === 'light' ? copy.profile.light : copy.profile.dark} onPress={toggleTheme} testID="customer-dark-mode-toggle-profile" />
              <ActionRow compact icon="language" title={appCopy[languageMode].common.appLanguage} meta={languageDisplayName(languageMode)} onPress={toggleLanguage} testID="customer-language-toggle" />
              <ActionRow compact icon="feedback" title={feedbackCopy.rowTitle} meta={feedbackSent ? feedbackCopy.rowMetaSent : feedbackCopy.rowMeta} onPress={openFeedback} testID="customer-profile-open-feedback" />
              <ActionRow compact icon="password" title={passwordCopy.rowTitle} meta={passwordUpdated ? passwordCopy.rowMetaUpdated : passwordCopy.rowMeta} onPress={openPasswordSheet} testID="customer-profile-open-password" />
              <ActionRow compact icon="logout" title={copy.profile.signOut} meta={copy.profile.switchAccount} onPress={() => void signOut()} testID="customer-profile-sign-out" />
              <View style={styles.hiddenMarker} testID="customer-utility-ticket-wallet" />
              <View style={styles.hiddenMarker} testID="customer-utility-support-entry" />
              <View style={styles.hiddenMarker} testID="customer-profile-payment-placeholder" />
              <View style={styles.hiddenMarker} testID="customer-profile-review-placeholder" />
            </View>
          </ReduceMotionAwareEntranceView>
          {profileEditorConfig ? (
            <Modal animationType="fade" onRequestClose={closeProfileEditor} transparent visible>
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.profileEditorScrim}>
                <View style={[styles.profileEditorSheet, customerProfilePanelSurface(tokens)]} testID="customer-profile-editor-sheet">
                  <ProfileLiquidChrome testID="customer-profile-editor-sheet-liquid" variant="panel" />
                  <Text style={[styles.profileEditorTitle, { color: tokens.text }]} numberOfLines={1}>
                    {profileEditorConfig.title}
                  </Text>
                  <Text style={[styles.profileEditorHelper, { color: tokens.muted }]}>
                    {profileEditorConfig.helper}
                  </Text>
                  <TextInput
                    accessibilityLabel={profileEditorConfig.title}
                    autoCapitalize="sentences"
                    editable={!profileEditorSaving}
                    keyboardType="default"
                    multiline={profileEditorIsAddress}
                    numberOfLines={profileEditorIsAddress ? 3 : 1}
                    onChangeText={(nextValue) => {
                      setProfileEditorValue(nextValue)
                      if (profileEditorError) setProfileEditorError(null)
                    }}
                    onSubmitEditing={profileEditorIsAddress ? undefined : () => void submitProfileEditor()}
                    placeholder={profileEditorConfig.placeholder}
                    placeholderTextColor={tokens.subtleText}
                    returnKeyType={profileEditorIsAddress ? 'default' : 'done'}
                    style={[
                      styles.profileEditorInput,
                      profileEditorIsAddress ? styles.profileEditorInputMultiline : null,
                      customerProfileInputSurface(tokens),
                      {
                        color: tokens.text,
                      },
                    ]}
                    testID="customer-profile-editor-input"
                    textAlignVertical={profileEditorIsAddress ? 'top' : 'center'}
                    value={profileEditorValue}
                  />
                  {profileEditorError ? (
                    <Text accessibilityRole="alert" style={[styles.profileEditorError, { color: tokens.danger }]} testID="customer-profile-editor-error">
                      {profileEditorError}
                    </Text>
                  ) : null}
                  <View style={styles.profileEditorButtonRow}>
                    <Pressable
                      accessibilityLabel={profileEditorCopy.cancel}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: profileEditorSaving }}
                      disabled={profileEditorSaving}
                      onPress={closeProfileEditor}
                      style={({ pressed }) => [
                        styles.profileEditorButton,
                        styles.profileEditorSecondaryButton,
                        customerProfileSecondaryButtonSurface(tokens),
                        reduceMotionAwarePressStyle(pressed, reduceMotion),
                        profileEditorSaving ? styles.disabled : null,
                      ]}
                      testID="customer-profile-editor-cancel"
                    >
                      <Text adjustsFontSizeToFit minimumFontScale={0.84} numberOfLines={1} style={[styles.profileEditorSecondaryText, { color: tokens.primary }]}>
                        {profileEditorCopy.cancel}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={profileEditorCopy.save}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: profileEditorSaving }}
                      disabled={profileEditorSaving}
                      onPress={() => void submitProfileEditor()}
                      style={({ pressed }) => [
                        styles.profileEditorButton,
                        styles.profileEditorPrimaryButton,
                        customerProfilePrimaryButtonSurface(tokens),
                        reduceMotionAwarePressStyle(pressed, reduceMotion),
                        profileEditorSaving ? styles.disabled : null,
                      ]}
                      testID="customer-profile-editor-save"
                    >
                      <Text adjustsFontSizeToFit minimumFontScale={0.84} numberOfLines={1} style={[styles.profileEditorPrimaryText, { color: tokens.primaryText }]}>
                        {profileEditorSaving ? profileEditorCopy.saving : profileEditorCopy.save}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </KeyboardAvoidingView>
            </Modal>
          ) : null}
          {accountInfoOpen ? (
            <Modal animationType="fade" onRequestClose={closeAccountInfo} transparent visible>
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.profileEditorScrim}>
                <View style={[styles.accountInfoSheet, customerProfilePanelSurface(tokens)]} testID="customer-account-info-sheet">
                  <ProfileLiquidChrome testID="customer-account-info-sheet-liquid" variant="panel" />
                  <View style={styles.accountInfoHeader}>
                    <Pressable
                      accessibilityLabel={accountInfoCopy.close}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: accountInfoSaving }}
                      disabled={accountInfoSaving}
                      onPress={closeAccountInfo}
                      style={({ pressed }) => [styles.accountInfoBackButton, reduceMotionAwarePressStyle(pressed, reduceMotion), accountInfoSaving ? styles.disabled : null]}
                      testID="customer-account-info-close"
                    >
                      <Text style={[styles.accountInfoBackText, { color: tokens.text }]} numberOfLines={1}>
                        ‹
                      </Text>
                    </Pressable>
                    <Text style={[styles.accountInfoTitle, { color: tokens.text }]} numberOfLines={1}>
                      {accountInfoCopy.title}
                    </Text>
                    <View style={styles.accountInfoHeaderSpacer} />
                  </View>
                  <ScrollView
                    automaticallyAdjustKeyboardInsets
                    contentContainerStyle={styles.accountInfoFields}
                    keyboardDismissMode="interactive"
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                  >
                    <AccountInfoField
                      editable={!accountInfoSaving}
                      label={accountInfoCopy.salutation}
                      onChangeText={(value) => updateAccountInfoDraft('salutation', value)}
                      placeholder={accountInfoCopy.salutationPlaceholder}
                      testID="customer-account-salutation-input"
                      tokens={tokens}
                      value={accountInfoDraft.salutation}
                    />
                    <AccountInfoField
                      editable={!accountInfoSaving}
                      label={accountInfoCopy.fullName}
                      onChangeText={(value) => updateAccountInfoDraft('fullName', value)}
                      placeholder={accountInfoCopy.fullNamePlaceholder}
                      testID="customer-account-full-name-input"
                      tokens={tokens}
                      value={accountInfoDraft.fullName}
                    />
                    <AccountInfoGenderSegment
                      disabled={accountInfoSaving}
                      labels={accountInfoCopy.genderOptions}
                      onSelect={(value) => updateAccountInfoDraft('gender', value)}
                      selected={normalizeCustomerGender(accountInfoDraft.gender)}
                      title={accountInfoCopy.gender}
                      tokens={tokens}
                    />
                    <AccountInfoField
                      editable={!accountInfoSaving}
                      keyboardType="number-pad"
                      label={accountInfoCopy.birthDate}
                      onChangeText={(value) => updateAccountInfoDraft('birthDate', formatCustomerBirthDateInput(value))}
                      placeholder={accountInfoCopy.birthDatePlaceholder}
                      testID="customer-account-birth-date-input"
                      tokens={tokens}
                      value={accountInfoDraft.birthDate}
                    />
                    <AccountInfoField
                      editable={!accountInfoSaving}
                      keyboardType="phone-pad"
                      label={accountInfoCopy.phone}
                      onChangeText={(value) => updateAccountInfoDraft('phone', value)}
                      placeholder={accountInfoCopy.phonePlaceholder}
                      testID="customer-account-phone-input"
                      tokens={tokens}
                      value={accountInfoDraft.phone}
                    />
                    <AccountInfoField
                      autoCapitalize="none"
                      editable={!accountInfoSaving}
                      keyboardType="email-address"
                      label={accountInfoCopy.email}
                      onChangeText={(value) => updateAccountInfoDraft('email', value)}
                      placeholder="name@example.com"
                      testID="customer-account-email-input"
                      tokens={tokens}
                      value={accountInfoDraft.email}
                    />
                    <Text style={[styles.accountInfoNote, { color: tokens.muted }]} numberOfLines={3}>
                      {accountInfoCopy.emailNote}
                    </Text>
                    <View style={[styles.accountInfoVerification, customerProfileVerificationSurface(tokens)]}>
                      <MappedIcon name="privacy" color={tokens.primary} accent={tokens.aqua} size={24} />
                      <View style={styles.accountInfoVerificationCopy}>
                        <Text style={[styles.accountInfoVerificationTitle, { color: tokens.primary }]} numberOfLines={1}>
                          {accountInfoCopy.identityTitle}
                        </Text>
                        <Text style={[styles.accountInfoVerificationBody, { color: tokens.muted }]} numberOfLines={2}>
                          {accountInfoCopy.identityBody}
                        </Text>
                      </View>
                    </View>
                  </ScrollView>
                  {accountInfoError ? (
                    <Text accessibilityRole="alert" style={[styles.profileEditorError, { color: tokens.danger }]} testID="customer-account-info-error">
                      {accountInfoError}
                    </Text>
                  ) : null}
                  <Pressable
                    accessibilityLabel={accountInfoCopy.save}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: accountInfoSaving }}
                    disabled={accountInfoSaving}
                    onPress={() => void submitAccountInfo()}
                    style={({ pressed }) => [
                      styles.accountInfoSaveButton,
                      customerProfilePrimaryButtonSurface(tokens),
                      reduceMotionAwarePressStyle(pressed, reduceMotion),
                      accountInfoSaving ? styles.disabled : null,
                    ]}
                    testID="customer-account-info-save"
                  >
                    <Text adjustsFontSizeToFit minimumFontScale={0.84} numberOfLines={1} style={[styles.profileEditorPrimaryText, { color: tokens.primaryText }]}>
                      {accountInfoSaving ? accountInfoCopy.saving : accountInfoCopy.save}
                    </Text>
                  </Pressable>
                </View>
              </KeyboardAvoidingView>
            </Modal>
          ) : null}
          {feedbackOpen ? (
            <Modal animationType="fade" onRequestClose={closeFeedback} transparent visible>
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.profileEditorScrim}>
                <View style={[styles.profileEditorSheet, customerProfilePanelSurface(tokens)]} testID="customer-feedback-sheet">
                  <ProfileLiquidChrome testID="customer-feedback-sheet-liquid" variant="panel" />
                  <Text style={[styles.profileEditorTitle, { color: tokens.text }]} numberOfLines={1}>
                    {feedbackCopy.title}
                  </Text>
                  <Text style={[styles.profileEditorHelper, { color: tokens.muted }]}>
                    {feedbackCopy.helper}
                  </Text>
                  <TextInput
                    accessibilityLabel={feedbackCopy.title}
                    autoCapitalize="sentences"
                    editable={!feedbackSaving}
                    maxLength={1200}
                    multiline
                    numberOfLines={5}
                    onChangeText={(nextValue) => {
                      setFeedbackValue(nextValue)
                      if (feedbackError) setFeedbackError(null)
                    }}
                    placeholder={feedbackCopy.placeholder}
                    placeholderTextColor={tokens.subtleText}
                    returnKeyType="default"
                    style={[
                      styles.profileEditorInput,
                      styles.feedbackInput,
                      customerProfileInputSurface(tokens),
                      {
                        color: tokens.text,
                      },
                    ]}
                    testID="customer-feedback-input"
                    textAlignVertical="top"
                    value={feedbackValue}
                  />
                  {feedbackError ? (
                    <Text accessibilityRole="alert" style={[styles.profileEditorError, { color: tokens.danger }]} testID="customer-feedback-error">
                      {feedbackError}
                    </Text>
                  ) : null}
                  <View style={styles.profileEditorButtonRow}>
                    <Pressable
                      accessibilityLabel={feedbackCopy.cancel}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: feedbackSaving }}
                      disabled={feedbackSaving}
                      onPress={closeFeedback}
                      style={({ pressed }) => [
                        styles.profileEditorButton,
                        styles.profileEditorSecondaryButton,
                        customerProfileSecondaryButtonSurface(tokens),
                        reduceMotionAwarePressStyle(pressed, reduceMotion),
                        feedbackSaving ? styles.disabled : null,
                      ]}
                      testID="customer-feedback-cancel"
                    >
                      <Text adjustsFontSizeToFit minimumFontScale={0.84} numberOfLines={1} style={[styles.profileEditorSecondaryText, { color: tokens.primary }]}>
                        {feedbackCopy.cancel}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={feedbackCopy.submit}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: feedbackSaving }}
                      disabled={feedbackSaving}
                      onPress={() => void submitFeedback()}
                      style={({ pressed }) => [
                        styles.profileEditorButton,
                        styles.profileEditorPrimaryButton,
                        customerProfilePrimaryButtonSurface(tokens),
                        reduceMotionAwarePressStyle(pressed, reduceMotion),
                        feedbackSaving ? styles.disabled : null,
                      ]}
                      testID="customer-feedback-submit"
                    >
                      <Text adjustsFontSizeToFit minimumFontScale={0.84} numberOfLines={1} style={[styles.profileEditorPrimaryText, { color: tokens.primaryText }]}>
                        {feedbackSaving ? feedbackCopy.saving : feedbackCopy.submit}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </KeyboardAvoidingView>
            </Modal>
          ) : null}
          {passwordOpen ? (
            <Modal animationType="fade" onRequestClose={closePasswordSheet} transparent visible>
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.profileEditorScrim}>
                <View style={[styles.profileEditorSheet, customerProfilePanelSurface(tokens)]} testID="customer-password-sheet">
                  <ProfileLiquidChrome testID="customer-password-sheet-liquid" variant="panel" />
                  <Text style={[styles.profileEditorTitle, { color: tokens.text }]} numberOfLines={1}>
                    {passwordCopy.title}
                  </Text>
                  <Text style={[styles.profileEditorHelper, { color: tokens.muted }]}>
                    {passwordCopy.helper}
                  </Text>
                  <View style={styles.passwordField}>
                    <Text style={[styles.passwordFieldLabel, { color: tokens.text }]} numberOfLines={1}>
                      {passwordCopy.currentLabel}
                    </Text>
                    <TextInput
                      accessibilityLabel={passwordCopy.currentLabel}
                      autoCapitalize="none"
                      autoComplete="current-password"
                      autoCorrect={false}
                      editable={!passwordSaving}
                      maxLength={72}
                      onChangeText={(nextValue) => {
                        setPasswordCurrent(nextValue)
                        if (passwordError) setPasswordError(null)
                      }}
                      placeholder={passwordCopy.currentPlaceholder}
                      placeholderTextColor={tokens.subtleText}
                      returnKeyType="next"
                      secureTextEntry
                      style={[
                        styles.profileEditorInput,
                        customerProfileInputSurface(tokens),
                        {
                          color: tokens.text,
                        },
                      ]}
                      testID="customer-password-current-input"
                      textContentType="password"
                      value={passwordCurrent}
                    />
                  </View>
                  <View style={styles.passwordField}>
                    <Text style={[styles.passwordFieldLabel, { color: tokens.text }]} numberOfLines={1}>
                      {passwordCopy.passwordLabel}
                    </Text>
                    <TextInput
                      accessibilityLabel={passwordCopy.passwordLabel}
                      autoCapitalize="none"
                      autoComplete="new-password"
                      autoCorrect={false}
                      editable={!passwordSaving}
                      maxLength={72}
                      onChangeText={(nextValue) => {
                        setPasswordValue(nextValue)
                        if (passwordError) setPasswordError(null)
                      }}
                      placeholder={passwordCopy.passwordPlaceholder}
                      placeholderTextColor={tokens.subtleText}
                      returnKeyType="next"
                      secureTextEntry
                      style={[
                        styles.profileEditorInput,
                        customerProfileInputSurface(tokens),
                        {
                          color: tokens.text,
                        },
                      ]}
                      testID="customer-password-new-input"
                      textContentType="newPassword"
                      value={passwordValue}
                    />
                  </View>
                  <View style={styles.passwordField}>
                    <Text style={[styles.passwordFieldLabel, { color: tokens.text }]} numberOfLines={1}>
                      {passwordCopy.confirmLabel}
                    </Text>
                    <TextInput
                      accessibilityLabel={passwordCopy.confirmLabel}
                      autoCapitalize="none"
                      autoComplete="new-password"
                      autoCorrect={false}
                      editable={!passwordSaving}
                      maxLength={72}
                      onChangeText={(nextValue) => {
                        setPasswordConfirm(nextValue)
                        if (passwordError) setPasswordError(null)
                      }}
                      onSubmitEditing={() => void submitPassword()}
                      placeholder={passwordCopy.confirmPlaceholder}
                      placeholderTextColor={tokens.subtleText}
                      returnKeyType="done"
                      secureTextEntry
                      style={[
                        styles.profileEditorInput,
                        customerProfileInputSurface(tokens),
                        {
                          color: tokens.text,
                        },
                      ]}
                      testID="customer-password-confirm-input"
                      textContentType="newPassword"
                      value={passwordConfirm}
                    />
                  </View>
                  {passwordError ? (
                    <Text accessibilityRole="alert" style={[styles.profileEditorError, { color: tokens.danger }]} testID="customer-password-error">
                      {passwordError}
                    </Text>
                  ) : null}
                  <View style={styles.profileEditorButtonRow}>
                    <Pressable
                      accessibilityLabel={passwordCopy.cancel}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: passwordSaving }}
                      disabled={passwordSaving}
                      onPress={closePasswordSheet}
                      style={({ pressed }) => [
                        styles.profileEditorButton,
                        styles.profileEditorSecondaryButton,
                        customerProfileSecondaryButtonSurface(tokens),
                        reduceMotionAwarePressStyle(pressed, reduceMotion),
                        passwordSaving ? styles.disabled : null,
                      ]}
                      testID="customer-password-cancel"
                    >
                      <Text adjustsFontSizeToFit minimumFontScale={0.84} numberOfLines={1} style={[styles.profileEditorSecondaryText, { color: tokens.primary }]}>
                        {passwordCopy.cancel}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={passwordCopy.save}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: passwordSaving }}
                      disabled={passwordSaving}
                      onPress={() => void submitPassword()}
                      style={({ pressed }) => [
                        styles.profileEditorButton,
                        styles.profileEditorPrimaryButton,
                        customerProfilePrimaryButtonSurface(tokens),
                        reduceMotionAwarePressStyle(pressed, reduceMotion),
                        passwordSaving ? styles.disabled : null,
                      ]}
                      testID="customer-password-save"
                    >
                      <Text adjustsFontSizeToFit minimumFontScale={0.84} numberOfLines={1} style={[styles.profileEditorPrimaryText, { color: tokens.primaryText }]}>
                        {passwordSaving ? passwordCopy.saving : passwordCopy.save}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </KeyboardAvoidingView>
            </Modal>
          ) : null}
        </View>
      )}
    </V4Frame>
  )
}

function AccountInfoField({
  autoCapitalize = 'sentences',
  editable,
  keyboardType = 'default',
  label,
  onChangeText,
  placeholder,
  testID,
  tokens,
  value,
}: {
  autoCapitalize?: 'none' | 'sentences'
  editable: boolean
  keyboardType?: 'default' | 'email-address' | 'number-pad' | 'phone-pad'
  label: string
  onChangeText: (value: string) => void
  placeholder: string
  testID: string
  tokens: CustomerThemeTokens
  value: string
}) {
  return (
    <View style={[styles.accountInfoField, customerProfileInputSurface(tokens)]}>
      <Text style={[styles.accountInfoFieldLabel, { color: tokens.text }]} numberOfLines={1}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize={autoCapitalize}
        editable={editable}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={tokens.subtleText}
        returnKeyType="done"
        style={[styles.accountInfoFieldInput, { color: tokens.text }]}
        testID={testID}
        value={value}
      />
    </View>
  )
}

function AccountInfoGenderSegment({
  disabled,
  labels,
  onSelect,
  selected,
  title,
  tokens,
}: {
  disabled: boolean
  labels: Record<CustomerGenderValue, string>
  onSelect: (value: CustomerGenderValue) => void
  selected: string
  title: string
  tokens: CustomerThemeTokens
}) {
  const { reduceMotion } = useGlassAccessibility()

  return (
    <View style={[styles.accountInfoField, customerProfileInputSurface(tokens)]} testID="customer-account-gender-segment">
      <Text style={[styles.accountInfoFieldLabel, { color: tokens.text }]} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.accountInfoSegmentRow}>
        {customerGenderOptions.map((option) => {
          const active = selected === option
          return (
            <Pressable
              accessibilityLabel={labels[option]}
              accessibilityRole="button"
              accessibilityState={{ disabled, selected: active }}
              disabled={disabled}
              key={option}
              onPress={() => onSelect(option)}
              style={({ pressed }) => [
                styles.accountInfoSegmentButton,
                customerProfileSegmentSurface(tokens, active),
                reduceMotionAwarePressStyle(pressed, reduceMotion),
                disabled ? styles.disabled : null,
              ]}
              testID={`customer-account-gender-${option}`}
            >
              <Text style={[styles.accountInfoSegmentText, { color: active ? tokens.primary : tokens.muted }]} numberOfLines={1}>
                {labels[option]}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

function CustomerProfileCareCard({
  copy,
  stats,
}: {
  copy: (typeof customerProfileCareCopy)[AppLanguage]
  stats: Array<{ icon: IconName; label: string; value: string }>
}) {
  const tokens = useCustomerTokens()

  return (
    <View style={[styles.profileCareCard, customerProfileCareCardSurface(tokens)]} testID="customer-profile-home-care-card">
      <ProfileLiquidChrome testID="customer-profile-care-card-liquid" variant="care" />
      <View style={styles.profileCareHeader} testID="customer-profile-care-header-motion">
        <Text style={[styles.profileCareTitle, { color: tokens.text }]} numberOfLines={1}>
          {copy.title}
        </Text>
      </View>
      <View style={styles.profileCareStats}>
        {stats.map((item, index) => (
          <View key={item.label} style={[styles.profileCareStat, customerProfileCareStatSurface(tokens)]} testID={`customer-profile-care-stat-motion-${index}`}>
            <View style={[styles.profileCareStatIcon, customerProfileCarePillSurface(tokens)]}>
              <MappedIcon name={item.icon} color={tokens.primary} accent={tokens.primary} size={22} />
            </View>
            <View style={styles.profileCareStatCopy}>
              <Text style={[styles.profileCareStatLabel, { color: tokens.text }]} numberOfLines={1}>
                {item.label}
              </Text>
            </View>
            <Text style={[styles.profileCareStatValue, { color: tokens.primary }]} numberOfLines={1} testID={`customer-profile-insight-${index}`}>
              {item.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

function CustomerProfileInsightPanel({
  copy,
  progress,
  stats,
  testID,
}: {
  copy: CustomerProfileInsightCopy
  progress?: CustomerProfileInsightProgress | null
  stats: CustomerProfileInsightStat[]
  testID: string
}) {
  const tokens = useCustomerTokens()
  const hasRealData = stats.some((item) => item.available)
  const progressWidth = progress ? customerProgressWidth(progress.value, progress.max) : null

  return (
    <View style={[styles.profileInsightPanel, customerOpaqueSurface(tokens)]} testID={testID}>
      <View style={styles.profileInsightHeader}>
        <View style={styles.profileInsightHeaderCopy}>
          <Text style={[styles.profileInsightTitle, { color: tokens.text }]} numberOfLines={1}>
            {copy.title}
          </Text>
          <Text style={[styles.profileInsightSubtitle, { color: tokens.muted }]} numberOfLines={2}>
            {copy.subtitle}
          </Text>
        </View>
        <View style={[styles.profileInsightStatusDot, { backgroundColor: hasRealData ? tokens.primary : tokens.borderStrong }]} />
      </View>
      <View style={styles.profileInsightStats}>
        {stats.map((item, index) => (
          <View key={item.label} style={[styles.profileInsightStat, customerProfileCareStatSurface(tokens)]} testID={`${testID}-metric-${index}`}>
            <View style={[styles.profileCareStatIcon, customerProfileCarePillSurface(tokens)]}>
              <MappedIcon name={item.icon} color={item.available ? tokens.primary : tokens.subtleText} accent={tokens.primary} size={21} />
            </View>
            <Text style={[styles.profileInsightStatLabel, { color: tokens.muted }]} numberOfLines={1}>
              {item.label}
            </Text>
            <Text style={[styles.profileInsightStatValue, { color: item.available ? tokens.primary : tokens.subtleText }]} numberOfLines={1} testID={`${testID}-value-${index}`}>
              {item.value}
            </Text>
          </View>
        ))}
      </View>
      {progress && progressWidth ? (
        <View accessibilityLabel={`${progress.label} ${progress.valueLabel}`} style={styles.profileInsightProgress} testID={`${testID}-progress`}>
          <View style={styles.profileInsightProgressMeta}>
            <Text style={[styles.profileInsightProgressLabel, { color: tokens.muted }]} numberOfLines={1}>
              {progress.label}
            </Text>
            <Text style={[styles.profileInsightProgressValue, { color: tokens.primary }]} numberOfLines={1} testID={`${testID}-progress-value`}>
              {progress.valueLabel}
            </Text>
          </View>
          <View style={[styles.profileInsightProgressTrack, { backgroundColor: tokens.border }]} testID={`${testID}-progress-track`}>
            <View style={[styles.profileInsightProgressFill, { backgroundColor: tokens.primary, width: progressWidth }]} testID={`${testID}-progress-fill`} />
          </View>
        </View>
      ) : null}
      {!hasRealData ? (
        <Text style={[styles.profileInsightEmpty, { color: tokens.muted }]} testID={`${testID}-empty`}>
          {copy.empty}
        </Text>
      ) : null}
    </View>
  )
}

export function CustomerV4DockOverlay({ active }: { active: CustomerDockActive }) {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const themeMode = useCustomerThemeMode()
  const { reduceTransparency } = useGlassAccessibility()
  const baseTokens = getCustomerThemeTokens(themeMode)
  const tokens = reduceTransparency ? getReducedTransparencyCustomerTokens(baseTokens) : baseTokens
  const frameWidth = Math.min(width, 430)
  const hidden = useCustomerDockHidden()
  useEffect(() => {
    setCustomerDockHiddenSnapshot(false)
  }, [active])

  return (
    <CustomerThemeContext.Provider value={tokens}>
      <V4Dock active={active} bottomInset={insets.bottom} frameWidth={frameWidth} hidden={hidden} screenWidth={width} />
    </CustomerThemeContext.Provider>
  )
}

function getCustomerTimeline(status: LocalDealStatus | null, language: AppLanguage) {
  const steps = customerCopy[language].history.timeline as ReadonlyArray<readonly [string, readonly LocalDealStatus[]]>
  const activeIndex = status ? steps.findIndex(([, statuses]) => statuses.includes(status)) : -1
  return steps.map(([label], index) => ({
    label,
    active: activeIndex >= index,
  }))
}

function canReplaceCustomerDeal(status: LocalDealStatus): boolean {
  return ['draft', 'cancelled', 'reviewed'].includes(status)
}

function isCustomerHistoryTab(tab: unknown): tab is CustomerHistoryTab {
  return typeof tab === 'string' && customerHistoryTabKeys.includes(tab as CustomerHistoryTab)
}

function customerVisibleStatusLabel(status: LocalDealStatus | null, searchState: LocalCustomerSearchState, language: AppLanguage = 'vi'): string {
  if (searchState === 'no_worker') return language === 'en' ? 'Kael is still matching' : 'Kael đang tìm thợ phù hợp'
  if (searchState === 'searching') return language === 'en' ? 'Kael is finding a worker' : 'Kael đang tìm thợ'
  return localizedStatusLabel(status, language)
}

function localizedCustomerAreaLabel(area: string | null | undefined, language: AppLanguage, fallback: string) {
  if (!area) return fallback
  if (language === 'vi') return area
  const mapped = area
    .replace(/^Khu vực:\s*/i, '')
    .replace(/Khu vực TP\.?HCM/gi, 'Ho Chi Minh City area')
    .replace(/Khu vực chung/gi, 'General area')
    .replace(/Quận\s*(\d+)/gi, 'District $1')
    .replace(/TP\.?\s*HCM|Thành phố Hồ Chí Minh/gi, 'HCMC')
  return mapped.trim() || fallback
}

function customerHomeAreaDisplayLabel(deal: LocalDeal | null, defaultAddress: string, language: AppLanguage, fallback: string) {
  const activeAddress = deal?.draft.addressLabel.trim()
  const activeDistrict = deal?.draft.districtLabel.trim()
  const value = activeAddress || activeDistrict || defaultAddress.trim()
  return localizedCustomerAreaLabel(value, language, fallback)
}

const customerVietnameseSignalPattern = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i

function localizedCustomerGeneratedText(value: string | null | undefined, language: AppLanguage, fallback: string) {
  const trimmed = value?.trim()
  if (!trimmed) return fallback
  if (language === 'en' && customerVietnameseSignalPattern.test(trimmed)) return fallback
  if (language === 'vi' && /^[\x00-\x7F]*$/.test(trimmed)) return fallback
  return trimmed
}

function localizedCustomerComplexityLabel(complexity: string | null | undefined, language: AppLanguage, fallback: string) {
  if (complexity === 'small') return language === 'en' ? 'Small' : 'Nhỏ'
  if (complexity === 'medium') return language === 'en' ? 'Medium' : 'Vừa'
  if (complexity === 'large') return language === 'en' ? 'Large' : 'Lớn'
  return fallback
}

function formatVnd(value: number) {
  return `${vndFormatter.format(value)}đ`
}

function formatCustomerInteger(value: number, languageMode: AppLanguage) {
  return customerIntegerFormatters[languageMode].format(value)
}

function customerProgressWidth(value: number, max: number): DimensionValue {
  if (max <= 0) return '0%'
  const percent = Math.max(0, Math.min(100, Math.round((value / max) * 100)))
  return `${percent}%` as DimensionValue
}

function isTerminalCustomerDeal(status: LocalDealStatus): boolean {
  return status === 'cancelled' || status === 'reviewed'
}

function V4Frame({
  active,
  children,
  testID,
}: {
  active: CustomerDockActive
  children: (props: { tokens: CustomerThemeTokens; mode: ThemeMode }) => ReactNode
  testID: string
}) {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const themeMode = useCustomerThemeMode()
  const { reduceMotion, reduceTransparency } = useGlassAccessibility()
  const baseTokens = getCustomerThemeTokens(themeMode)
  const tokens = reduceTransparency ? getReducedTransparencyCustomerTokens(baseTokens) : baseTokens
  const frameWidth = Math.min(width, 430)
  const appleIOS26MainSection = active === 'home' || active === 'booking' || active === 'activity'
  const pulse = useSharedValue(0)
  const settle = useSharedValue(0)
  useEffect(() => {
    pulse.value = 0
    settle.value = 1
    if (reduceMotion) {
      pulse.value = withTiming(1, { duration: 120 })
      settle.value = withTiming(0, { duration: 120 })
      return
    }
    pulse.value = withSpring(1, motionTokens.liquid.entrance)
    settle.value = withDelay(60, withSpring(0, motionTokens.liquid.press))
  }, [active, pulse, reduceMotion, settle])
  const motionFieldStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0 : 0.05 + pulse.value * 0.04,
    transform: [{ translateY: settle.value * 2 }, { scale: 0.98 + pulse.value * 0.025 }],
  }))
  const lastCustomerScrollYRef = useRef(0)
  const setCustomerDockHiddenSafely = useCallback((hidden: boolean) => {
    setCustomerDockHiddenSnapshot(hidden)
  }, [])
  const handleCustomerDockScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextY = Math.max(0, event.nativeEvent.contentOffset.y)
    const deltaY = nextY - lastCustomerScrollYRef.current

    if (nextY <= 12) {
      setCustomerDockHiddenSafely(false)
    } else if (deltaY > 8 && nextY > 34) {
      setCustomerDockHiddenSafely(true)
    } else if (deltaY < -7) {
      setCustomerDockHiddenSafely(false)
    }

    lastCustomerScrollYRef.current = nextY
  }, [setCustomerDockHiddenSafely])
  useEffect(() => {
    lastCustomerScrollYRef.current = 0
    setCustomerDockHiddenSafely(false)
  }, [active, setCustomerDockHiddenSafely])
  const profileCanvasBackgroundImage =
    themeMode === 'dark'
      ? 'radial-gradient(circle at 52% 10%, rgba(230,244,240,0.055), transparent 30%), radial-gradient(circle at 72% 88%, rgba(105,222,198,0.045), transparent 28%), linear-gradient(180deg, #0B0F0E 0%, #111614 100%)'
      : 'radial-gradient(circle at 50% 12%, rgba(142,231,217,0.18), transparent 28%), radial-gradient(circle at 76% 84%, rgba(105,222,198,0.075), transparent 28%), linear-gradient(180deg, #F4FAF7 0%, #F7FBF8 100%)'
  const defaultCanvasBackgroundImage =
    themeMode === 'dark'
      ? 'radial-gradient(circle at 50% 12%, rgba(105,222,198,0.08), transparent 30%), linear-gradient(180deg, #0B0F0E 0%, #111614 100%)'
      : 'radial-gradient(circle at 50% 12%, rgba(23,169,149,0.08), transparent 30%), linear-gradient(180deg, #F8FBF5 0%, #F4F7F6 100%)'
  const appleIOS26CanvasBackgroundImage =
    themeMode === 'dark'
      ? 'radial-gradient(circle at 50% 4%, rgba(190,210,205,0.060), transparent 28%), radial-gradient(circle at 50% 34%, rgba(105,222,198,0.035), transparent 34%), linear-gradient(180deg, #0E1413 0%, #111816 58%, #0B0F0E 100%)'
      : 'radial-gradient(circle at 50% -4%, rgba(255,255,255,0.98), transparent 28%), radial-gradient(circle at 50% 24%, rgba(0,200,179,0.070), transparent 34%), linear-gradient(180deg, #F7F8F8 0%, #F1F3F2 100%)'
  const experimentalBackgroundImage = active === 'profile'
    ? profileCanvasBackgroundImage
    : appleIOS26MainSection
      ? appleIOS26CanvasBackgroundImage
      : defaultCanvasBackgroundImage
  const canvasLayer = {
    backgroundColor: tokens.canvas,
    experimental_backgroundImage: reduceTransparency ? undefined : experimentalBackgroundImage,
  } as any
  const scrollLayer = active === 'profile' || appleIOS26MainSection ? canvasLayer : { backgroundColor: tokens.canvas }

  return (
    <SafeAreaView style={[styles.safeArea, canvasLayer]} testID={testID}>
      <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
      <CustomerThemeContext.Provider value={tokens}>
        {reduceTransparency ? null : <AmbientGlassField frameWidth={frameWidth} screenWidth={width} />}
        {reduceMotion || reduceTransparency ? null : (
          <Animated.View pointerEvents="none" style={[styles.customerMotionField, { backgroundColor: tokens.aqua }, motionFieldStyle]} testID={`customer-motion-field-${active}`} />
        )}
        <ScrollView
          contentContainerStyle={[
            styles.v4Scroll,
            {
              alignSelf: 'center',
              maxWidth: 430,
              minHeight: '100%',
              paddingBottom: Math.max(insets.bottom + customerDockBottomClearance, customerDockBottomClearance),
              paddingTop: Math.max(insets.top + 8, 20),
              width: Math.max(0, frameWidth - customerFrameHorizontalPadding * 2),
            },
          ]}
          automaticallyAdjustKeyboardInsets
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onScroll={handleCustomerDockScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          style={[styles.scroll, scrollLayer]}
          testID="customer-v4-scroll"
        >
          <View style={styles.hiddenMarker} testID="customer-dark-layer-ecology" />
          <View style={styles.hiddenMarker} testID="customer-shell-motion-field" />
          <View style={styles.hiddenMarker} testID="customer-theme-layer-switch" />
          <View style={styles.hiddenMarker} testID="customer-client-prototype-parity-source" />
          <View style={styles.hiddenMarker} testID={CUSTOMER_NO_PROTOTYPE_SAMPLE_CLIENT_STATS} />
          <View style={styles.hiddenMarker} testID="customer-client-card-press-feedback" />
          {appleIOS26MainSection ? (
            <>
              <View style={styles.hiddenMarker} testID="customer-apple-ios26-client-main-sections" />
              <View style={styles.hiddenMarker} testID={`customer-${active}-ios26-main-section`} />
              <View style={styles.hiddenMarker} testID="customer-ios26-standard-content-material" />
              <View style={styles.hiddenMarker} testID="customer-ios26-liquid-control-layer" />
            </>
          ) : null}
          {children({ tokens, mode: themeMode })}
        </ScrollView>
        {reduceMotion || reduceTransparency ? null : <MotionSweep frameWidth={frameWidth} screenWidth={width} />}
      </CustomerThemeContext.Provider>
    </SafeAreaView>
  )
}

function V4Dock({
  active,
  bottomInset,
  frameWidth,
  hidden,
  screenWidth,
}: {
  active: CustomerDockActive
  bottomInset: number
  frameWidth: number
  hidden: boolean
  screenWidth: number
}) {
  const { replace } = useRouter()
  const navigationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearNavigationTimer = useCallback(() => {
    const timer = navigationTimerRef.current
    if (timer) clearTimeout(timer)
    navigationTimerRef.current = null
  }, [])
  const { reduceMotion } = useGlassAccessibility()
  const languageMode = useAppLanguage()
  const copy = customerCopy[languageMode]
  const tokens = useCustomerTokens()
  const dockWidth = Math.max(0, Math.min(frameWidth - 40, 360))
  const dockActionSize = customerDockKaelActionOuterSize
  const dockGap = 10
  const dockMainWidth = Math.max(dockWidth - dockActionSize - dockGap, 0)
  const dockLeft = Math.max((screenWidth - dockWidth) / 2, 16)
  const bottom = Math.max(bottomInset + customerDockBottomMargin, customerDockBottomMargin)
  const dockTranslateY = useSharedValue(hidden ? 80 : 0)
  const dockScale = useSharedValue(hidden ? 0.97 : 1)
  const dockOpacity = useSharedValue(hidden ? 0 : 1)
  const dockMotionStyle = useAnimatedStyle(() => ({
    opacity: dockOpacity.value,
    transform: reduceMotion
      ? []
      : [
        { translateY: dockTranslateY.value },
        { scale: dockScale.value },
      ],
  }), [reduceMotion])
  type CustomerDockItem = FloatingGlassTabItem<CustomerDockActive> & {
    icon: IconName
    path: '/(customer)/home' | '/(customer)/booking' | '/(customer)/history' | '/(customer)/profile'
  }
  const items: CustomerDockItem[] = [
    { accessibilityLabel: copy.navA11y.home, key: 'home', icon: 'apartment', label: copy.nav.home, path: '/(customer)/home', testID: 'customer-v4-dock-home' },
    { accessibilityLabel: copy.navA11y.booking, key: 'booking', icon: 'document', label: copy.nav.booking, path: openBookingPath, testID: 'customer-v4-dock-booking' },
    { accessibilityLabel: copy.navA11y.activity, key: 'activity', icon: 'history', label: copy.nav.activity, path: '/(customer)/history', testID: 'customer-v4-dock-activity' },
    { accessibilityLabel: copy.navA11y.profile, key: 'profile', icon: 'person', label: copy.nav.profile, path: '/(customer)/profile', testID: 'customer-v4-dock-profile' },
  ]
  const navigateWithLiquidDelay = useCallback((path: CustomerDockItem['path'] | typeof openKaelChatPath | typeof openKaelCenterPath) => {
    clearNavigationTimer()
    navigationTimerRef.current = setTimeout(() => {
      replace(path)
      navigationTimerRef.current = null
    }, 90)
  }, [clearNavigationTimer, replace])

  useEffect(() => clearNavigationTimer, [clearNavigationTimer])

  useEffect(() => {
    if (reduceMotion) {
      dockOpacity.value = withTiming(hidden ? 0 : 1, { duration: 120 })
      dockTranslateY.value = 0
      dockScale.value = 1
      return
    }

    dockOpacity.value = withTiming(hidden ? 0 : 1, { duration: hidden ? 95 : 145 })
    dockTranslateY.value = withSpring(hidden ? 80 : 0, hidden ? motionTokens.liquid.press : motionTokens.liquid.entrance)
    dockScale.value = withSpring(hidden ? 0.97 : 1, hidden ? motionTokens.liquid.press : motionTokens.liquid.entrance)
  }, [dockOpacity, dockScale, dockTranslateY, hidden, reduceMotion])

  return (
    <Animated.View pointerEvents={hidden ? 'none' : 'box-none'} style={[styles.dockWrap, { bottom, left: dockLeft, width: dockWidth }, dockMotionStyle]} testID="customer-dock-motion-shell">
      <View pointerEvents="none" style={styles.hiddenMarker} testID="customer-dock-glass-aura" />
      <View style={styles.customerDockSplitRow} testID="customer-dock-split-toolbar">
        <FloatingGlassTabBar<CustomerDockActive, CustomerDockItem>
          activeKey={active === 'kael' ? null : active}
          appearance="appleLiquid"
          items={items}
          material="liquid"
          mode={tokens.mode}
          onItemPress={(item) => {
            if (item.key === active) return
            lastCustomerDockActive = active
            navigateWithLiquidDelay(item.path)
          }}
          previousKey={active === 'kael' || lastCustomerDockActive === 'kael' ? null : lastCustomerDockActive}
          iconForItem={(item, focused) => (
            <MappedIcon
              name={item.icon}
              color={focused ? tokens.primary : customerDockInactiveTint(tokens)}
              accent={focused ? tokens.primary : customerDockInactiveTint(tokens)}
              size={24}
            />
          )}
          style={[styles.glassDock, styles.customerDockMainCluster, { width: dockMainWidth }, customerDockMainClusterSurface(tokens)]}
          testID="customer-liquid-glass-dock"
        />
        <Pressable
          accessibilityLabel={copy.navA11y.kael}
          accessibilityRole="tab"
          accessibilityState={{ selected: active === 'kael' }}
          onPress={() => {
            if (active === 'kael') return
            lastCustomerDockActive = active
            navigateWithLiquidDelay(openKaelCenterPath)
          }}
          style={({ pressed }) => [styles.customerDockKaelActionPressable, reduceMotionAwarePressStyle(pressed, reduceMotion)]}
          testID="customer-v4-dock-kael"
        >
          <GlassSurface
            material="liquid"
            mode={tokens.mode}
            style={[styles.customerDockKaelActionGlass, customerDockKaelActionSurface(tokens, active === 'kael')]}
            testID="customer-dock-kael-action-glass"
            variant="nav"
          >
            <View pointerEvents="none" style={[styles.customerDockKaelActionEdge, customerDockKaelActionEdgeSurface(tokens)]} testID="customer-dock-kael-action-edge" />
            <View pointerEvents="none" style={[styles.customerDockKaelActionAura, customerDockKaelActionAuraSurface(tokens, active === 'kael')]} testID="customer-dock-kael-action-aura" />
            <View style={styles.customerDockKaelActionGlyph} testID="customer-dock-kael-action-image">
              <MappedIcon name="kael" color={active === 'kael' ? tokens.primary : customerDockInactiveTint(tokens)} accent={tokens.primary} size={customerDockKaelActionIconSize} />
            </View>
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.82}
              numberOfLines={1}
              style={[styles.customerDockKaelActionLabel, { color: active === 'kael' ? tokens.primary : customerDockInactiveTint(tokens) }]}
              testID="customer-dock-kael-action-label"
            >
              {component.bottomNav.orb.label}
            </Text>
          </GlassSurface>
        </Pressable>
      </View>
    </Animated.View>
  )
}

function MotionSweep({ frameWidth, screenWidth }: { frameWidth: number; screenWidth: number }) {
  const tokens = useCustomerTokens()
  const sweep = useSharedValue(0)
  useEffect(() => {
    sweep.value = 0
    sweep.value = withDelay(60, withTiming(1, { duration: 300 }))
  }, [sweep])
  const sweepStyle = useAnimatedStyle(() => ({
    opacity: 0.1 * (1 - sweep.value),
    transform: [{ translateX: -120 + sweep.value * (frameWidth + 240) }, { rotate: '-8deg' }],
  }), [frameWidth])
  if (tokens.glassHighlight === 'transparent') return null
  const left = Math.max((screenWidth - frameWidth) / 2, 0)

  return <Animated.View pointerEvents="none" style={[styles.motionSweep, { backgroundColor: tokens.glassHighlight, left }, sweepStyle]} />
}

function AmbientGlassField({ frameWidth, screenWidth }: { frameWidth: number; screenWidth: number }) {
  const tokens = useCustomerTokens()
  const left = Math.max((screenWidth - frameWidth) / 2, 0)

  return (
    <View pointerEvents="none" style={[styles.ambientGlassField, { left, width: frameWidth }]} testID="customer-section-glass-field">
      <View style={[styles.ambientMintWash, { backgroundColor: tokens.aqua }]} />
      <View style={[styles.ambientWarmWash, { backgroundColor: tokens.copper }]} />
      <View style={[styles.ambientGlassLine, { backgroundColor: tokens.borderStrong }, customerAmbientLineStyle]} />
    </View>
  )
}

function V4MapBackdrop({ presence = false }: { presence?: boolean }) {
  const tokens = useCustomerTokens()
  const route = presence ? 0.48 : 0
  const routeStyle = {
    opacity: 0.28 + route * 0.38,
    transform: [{ rotate: '-19deg' }, { scaleX: 0.72 + route * 0.28 }],
  }
  const vehicleStyle = {
    opacity: 0.72 + route * 0.24,
    transform: [{ translateX: -54 + route * 108 }, { translateY: -10 + route * 22 }, { scale: 0.96 }],
  }

  return (
    <View pointerEvents="none" style={styles.mapBackdrop}>
      <View style={[styles.mapGlow, { backgroundColor: tokens.aqua }, customerMapGlowStyle]} />
      {presence ? (
        <>
          <View style={[styles.mapRoute, { backgroundColor: tokens.primary }, routeStyle]} />
          <View style={[styles.mapRouteSoft, { backgroundColor: tokens.aqua }]} />
          <View style={[styles.mapVehicle, customerOpaqueSurface(tokens), vehicleStyle]}>
            <MappedIcon name="estimate" color={tokens.primary} accent={tokens.copper} />
          </View>
        </>
      ) : null}
      <View style={[styles.mapLine, styles.mapLineOne, { backgroundColor: tokens.borderStrong }]} />
      <View style={[styles.mapLine, styles.mapLineTwo, { backgroundColor: tokens.borderStrong }]} />
      <View style={[styles.mapLine, styles.mapLineThree, { backgroundColor: tokens.borderStrong }]} />
      <View style={[styles.mapRoom, styles.mapRoomOne, { borderColor: tokens.borderStrong }]} />
      <View style={[styles.mapRoom, styles.mapRoomTwo, { borderColor: tokens.borderStrong }]} />
      <View style={[styles.mapRoom, styles.mapRoomThree, { borderColor: tokens.borderStrong }]} />
      {presence ? <View style={[styles.mapPin, { backgroundColor: tokens.primary, borderColor: tokens.glassBorder }, customerMapPinStyle]} /> : null}
      <View style={[styles.mapNode, styles.mapNodeElectric, customerOpaqueSurface(tokens)]}>
        <MappedIcon name="boltPanel" color={tokens.primary} accent={tokens.copper} size={29} />
      </View>
      <View style={[styles.mapNode, styles.mapNodeWater, customerOpaqueSurface(tokens)]}>
        <MappedIcon name="waterPipe" color={tokens.primary} accent={tokens.aqua} size={29} />
      </View>
    </View>
  )
}

function V4ServiceCard({ compact = false, homeTile = false, icon, meta, onPress, selected = false, showMeta = true, testID, title, tone, water }: { compact?: boolean; homeTile?: boolean; icon: IconName; meta?: string; onPress: () => void; selected?: boolean; showMeta?: boolean; testID: string; title: string; tone?: SurfaceTone; water?: boolean }) {
  const tokens = useCustomerTokens()
  const languageMode = useAppLanguage()
  const { reduceMotion } = useGlassAccessibility()
  const iconTone = tone ?? (water ? 'water' : icon === 'cleaning' || icon === 'broom' ? 'warm' : 'service')
  return (
    <Pressable
      accessibilityLabel={languageMode === 'en' ? `Select service ${title}` : `Chọn dịch vụ ${title}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.serviceCard,
        homeTile ? styles.serviceCardHome : null,
        compact ? styles.serviceCardCompact : null,
        homeTile ? customerHomeServiceTileSurface(tokens, iconTone) : compact ? customerBookingServiceTileSurface(tokens, iconTone) : customerOpaqueSurface(tokens),
        selected ? customerSelectedServiceTileSurface(tokens, iconTone) : null,
        reduceMotionAwarePressStyle(pressed, reduceMotion),
      ]}
      testID={testID}
    >
      <View pointerEvents="none" style={[styles.glassRing, { borderColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.16)' : 'rgba(8,120,110,0.10)' }]} />
      <View style={homeTile ? styles.homeTileIconStage : undefined} testID={homeTile ? `${testID}-icon-stage` : undefined}>
        <IconShell icon={icon} tone={iconTone} size={homeTile ? 42 : compact ? 34 : 38} />
      </View>
      <Text style={[styles.serviceTitle, homeTile ? styles.serviceTitleHome : null, { color: tokens.text }]} numberOfLines={2}>
        {title}
      </Text>
      {meta && showMeta ? (
        <Text style={[styles.serviceMeta, { color: tokens.muted }]} numberOfLines={1}>
          {meta}
        </Text>
      ) : null}
    </Pressable>
  )
}

function CustomerHistoryPhaseContextPanel({
  languageMode,
  phaseContext,
  tokens,
}: {
  languageMode: AppLanguage
  phaseContext: WorkflowPhaseContext
  tokens: CustomerThemeTokens
}) {
  const visibleSections = orderWorkflowPhaseSectionsForSummary(phaseContext, phaseContext.sections.filter((section) => section.visible && section.role !== 'worker'))
  const primarySection = visibleSections.find((section) => section.id === phaseContext.primaryArtifact?.id) ?? visibleSections[0] ?? null
  const primaryArtifact = primarySection?.title[languageMode] ?? (languageMode === 'en' ? 'No live artifact' : 'Chưa có dấu mốc sống')
  const blockedReason = phaseContext.blockedReason
    ? workflowBlockedReasonLabel(phaseContext.blockedReason, languageMode)
    : workflowAllowedActionsLabel(phaseContext.allowedActions, languageMode)
  const nextEvent = phaseContext.nextExpectedEvent
    ? workflowEventLabel(phaseContext.nextExpectedEvent, languageMode)
    : languageMode === 'en'
      ? 'No next event'
      : 'Không có sự kiện kế tiếp'
  const reportBody = workflowPhaseReportBody(phaseContext, languageMode)
  const sectionSummary = workflowPhaseSectionSummary(visibleSections, languageMode)

  return (
    <View style={[styles.flowCard, styles.historyReportCard, customerHistoryPanelSurface(tokens)]} testID="customer-history-phase-context">
      <View style={styles.historyReportHeader}>
        <Text style={[styles.cardHeadline, styles.historyReportTitle, { color: tokens.text }]} numberOfLines={1} testID="customer-history-phase-title">
          {phaseContext.title[languageMode]}
        </Text>
        <Text style={[styles.historyReportBadge, { color: tokens.primary }]} numberOfLines={1}>
          {languageMode === 'en' ? 'Report' : 'Báo cáo'}
        </Text>
      </View>
      <Text style={[styles.historyDisclaimerText, styles.historyReportBody, { color: tokens.muted }]} numberOfLines={2} testID="customer-history-phase-body">
        {reportBody}
      </Text>
      <View style={styles.historyReportGrid}>
        <V4TicketCell label={languageMode === 'en' ? 'Artifact' : 'Dấu mốc'} testID="customer-history-phase-artifact-cell" value={primaryArtifact} variant="report" />
        <V4TicketCell label={languageMode === 'en' ? 'Next' : 'Tiếp theo'} value={nextEvent} variant="report" />
        <V4TicketCell label={languageMode === 'en' ? 'Gate' : 'Cổng'} value={blockedReason} variant="report" />
        <V4TicketCell label={languageMode === 'en' ? 'Live sections' : 'Mục đang sống'} testID="customer-history-phase-live-cell" value={sectionSummary} valueLines={2} variant="report" />
      </View>
    </View>
  )
}

function CustomerHistoryCancellationContextPanel({
  copy,
  languageMode,
  phaseContext,
  tokens,
  visibleStatusLabel,
}: {
  copy: (typeof customerCopy)[AppLanguage]
  languageMode: AppLanguage
  phaseContext: WorkflowPhaseContext
  tokens: CustomerThemeTokens
  visibleStatusLabel: string
}) {
  return (
    <View style={[styles.flowCard, customerHistoryPanelSurface(tokens)]} testID="customer-history-cancellation-context">
      <View style={styles.sectionTitle}>
        <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
          {copy.history.cancelledState}
        </Text>
        <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
          {workflowSourceOfTruthLabel(phaseContext.sourceOfTruth, languageMode)}
        </Text>
      </View>
      <Text style={[styles.historyDisclaimerText, { color: tokens.muted }]} numberOfLines={3}>
        {copy.history.cancelledBody}
      </Text>
      <View style={styles.twoCol}>
        <V4TicketCell label={copy.ticket.status} value={visibleStatusLabel} variant="activity" />
        <V4TicketCell label={languageMode === 'en' ? 'Gate' : 'Cổng'} value={workflowBlockedReasonLabel('job_cancelled', languageMode)} variant="activity" />
      </View>
      <View style={styles.twoCol}>
        <V4TicketCell label={languageMode === 'en' ? 'Artifact' : 'Dấu mốc'} value={phaseContext.primaryArtifact?.title[languageMode] ?? copy.history.cancelledState} variant="activity" />
        <V4TicketCell label={languageMode === 'en' ? 'Next' : 'Tiếp theo'} value={copy.history.newRequest} variant="activity" />
      </View>
    </View>
  )
}

function CustomerHistoryCaseCommandPanel({
  copy,
  deal,
  languageMode,
  phaseContext,
  tokens,
  visibleStatusLabel,
  workerStateLabel,
}: {
  copy: (typeof customerCopy)[AppLanguage]
  deal: LocalDeal
  languageMode: AppLanguage
  phaseContext: WorkflowPhaseContext
  tokens: CustomerThemeTokens
  visibleStatusLabel: string
  workerStateLabel: string
}) {
  const broadcast = deal.broadcast
  const releasedAddress = broadcast?.fullAddressVisible && broadcast.fullAddressLabel
    ? broadcast.fullAddressLabel
    : null
  const safeLocation = releasedAddress ?? broadcast?.generalArea ?? deal.draft.districtLabel
  const jobId = broadcast?.jobId || (deal.id === LOCAL_DEAL_ID ? copy.history.kaelReviewing : deal.id)
  const confidenceLabel = deal.estimate?.confidenceLabel?.trim() || copy.history.kaelReviewing
  const quoteLabel = deal.estimate?.priceRangeLabel || broadcast?.estimatedPriceLabel || copy.history.kaelReviewing
  const nextLabel = phaseContext.nextExpectedEvent
    ? workflowEventLabel(phaseContext.nextExpectedEvent, languageMode)
    : visibleStatusLabel
  const rows = [
    [copy.history.caseId, jobId],
    [copy.history.caseConfidence, confidenceLabel],
    [copy.history.caseMatching, workerStateLabel],
    [copy.history.caseQuote, quoteLabel],
    [copy.history.caseLocation, localizedCustomerAreaLabel(safeLocation, languageMode, copy.ticket.unknown)],
    [copy.history.caseEta, copy.history.caseEtaPending],
    [copy.history.caseNext, nextLabel],
  ] as const

  return (
    <View style={[styles.historyCheckPanel, customerHistoryPanelSurface(tokens)]} testID="customer-history-case-command-panel">
      <View style={styles.sectionTitle}>
        <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
          {copy.history.caseCommandTitle}
        </Text>
        <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
          {copy.history.caseCommandMeta}
        </Text>
      </View>
      <View style={styles.bookingGrid} testID="customer-history-case-command-grid">
        {rows.map(([label, value], index) => (
          <V4TicketCell key={label} label={label} testID={`customer-history-case-command-cell-${index}`} value={value} variant="activity" />
        ))}
      </View>
      <Text style={[styles.historyDisclaimerText, { color: tokens.muted }]} numberOfLines={2} testID="customer-history-case-command-status">
        {visibleStatusLabel}
      </Text>
    </View>
  )
}

function CustomerHistoryMatchingScorePanel({
  copy,
  deal,
  languageMode,
  tokens,
  workerStateLabel,
}: {
  copy: (typeof customerCopy)[AppLanguage]
  deal: LocalDeal
  languageMode: AppLanguage
  tokens: CustomerThemeTokens
  workerStateLabel: string
}) {
  const confidenceLabel = deal.estimate?.confidenceLabel?.trim() || copy.history.kaelReviewing
  const areaLabel = localizedCustomerAreaLabel(deal.broadcast?.generalArea ?? deal.draft.districtLabel, languageMode, copy.ticket.unknown)
  const intakeMediaCount = Math.max(0, deal.draft.mediaCount)
  const evidenceLabel = intakeMediaCount > 0 ? copy.history.matchingEvidenceCount(intakeMediaCount) : copy.history.matchingEvidenceEmpty
  const problemSource = deal.broadcast?.problemSummary ?? deal.estimate?.problemLabel ?? deal.draft.problemChips[0] ?? deal.draft.inferredProblemLabel
  const problemLabel = localizedProblemLabel(problemSource, deal.draft.serviceType, languageMode)
  const prebrief = deal.broadcast?.prebrief.find((item) => item.trim().length > 0)?.trim() ?? copy.history.matchingNoWorkerProfile

  return (
    <View style={[styles.historyCheckPanel, styles.matchingScorePanel, customerHistoryPanelSurface(tokens)]} testID="customer-history-matching-score-panel">
      <View style={styles.sectionTitle}>
        <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
          {copy.history.matchingScoreTitle}
        </Text>
        <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
          {copy.history.matchingScoreMeta}
        </Text>
      </View>
      <View style={styles.matchingScoreHero}>
        <View style={[styles.matchingScoreDial, { backgroundColor: tokens.service, borderColor: tokens.borderStrong }]}>
          <Text style={[styles.matchingScoreValue, { color: tokens.primary }]} numberOfLines={1} testID="customer-history-matching-confidence-value">
            {confidenceLabel}
          </Text>
          <Text style={[styles.matchingScoreLabel, { color: tokens.muted }]} numberOfLines={1}>
            {copy.history.matchingFit}
          </Text>
        </View>
        <View style={styles.matchingScoreHeroCopy}>
          <V4TicketCell label={copy.history.matchingWorkerSignal} testID="customer-history-matching-worker" value={workerStateLabel} variant="activity" />
        </View>
      </View>
      <View style={styles.twoCol}>
        <V4TicketCell label={copy.history.matchingEvidence} testID="customer-history-matching-evidence" value={evidenceLabel} variant="activity" />
        <V4TicketCell label={copy.history.caseLocation} testID="customer-history-matching-area" value={areaLabel} variant="activity" />
        <V4TicketCell label={copy.ticket.issue} testID="customer-history-matching-problem" value={problemLabel} variant="activity" />
      </View>
      <V4TicketCell label={copy.history.matchingPrebrief} testID="customer-history-matching-prebrief" value={prebrief} variant="activity" />
    </View>
  )
}

function CustomerHistoryLocationEtaPanel({
  copy,
  deal,
  languageMode,
  onOpenKael,
  tokens,
  visibleStatusLabel,
}: {
  copy: (typeof customerCopy)[AppLanguage]
  deal: LocalDeal
  languageMode: AppLanguage
  onOpenKael: () => void
  tokens: CustomerThemeTokens
  visibleStatusLabel: string
}) {
  const broadcast = deal.broadcast
  const releasedAddress = broadcast?.fullAddressVisible && broadcast.fullAddressLabel
    ? broadcast.fullAddressLabel
    : null
  const safeAddress = releasedAddress ?? broadcast?.generalArea ?? deal.draft.districtLabel
  const addressLabel = localizedCustomerAreaLabel(safeAddress, languageMode, copy.ticket.unknown)
  const addressGateLabel = releasedAddress ? copy.history.locationAddressReleased : copy.history.locationAddressHidden
  const hasWorkerAnchor = ['worker_matched', 'worker_on_way', 'arrived', 'inspecting', 'repairing', 'scope_change_pending', 'completed_by_worker'].includes(deal.status)
  const workerIsOnWay = deal.status === 'worker_on_way'
  const liveSignalLabel =
    deal.status === 'broadcasting' && typeof broadcast?.secondsRemaining === 'number' && broadcast.secondsRemaining > 0
      ? copy.history.locationSearchCountdown(broadcast.secondsRemaining)
      : workerIsOnWay
        ? copy.history.locationWorkerOnWaySignal
        : hasWorkerAnchor
          ? copy.history.locationWorkerAcceptedSignal
          : copy.history.locationNoSignal
  const routeGateLabel = releasedAddress ? liveSignalLabel : addressGateLabel

  return (
    <View style={[styles.presenceMapCard, customerHistoryPanelSurface(tokens)]} testID="customer-history-location-eta-panel">
      <View style={styles.sectionTitle}>
        <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
          {copy.history.locationEtaTitle}
        </Text>
        <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
          {copy.history.locationEtaMeta}
        </Text>
      </View>
      <View style={[styles.presenceMapViewport, customerHistoryMapViewportSurface(tokens)]}>
        <V4MapBackdrop presence={hasWorkerAnchor} />
        <View style={styles.presenceMapHud} testID="customer-history-location-map-hud">
          <View style={[styles.presenceMapControl, { backgroundColor: tokens.service, borderColor: tokens.border }]}>
            <Text style={[styles.presenceMapControlText, { color: tokens.primary }]} numberOfLines={1}>
              {copy.history.locationEtaTitle}
            </Text>
          </View>
          <View style={[styles.presenceMapControl, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
            <Text style={[styles.presenceMapControlText, { color: tokens.primary }]} numberOfLines={1}>
              {visibleStatusLabel}
            </Text>
          </View>
        </View>
        <View style={[styles.presenceBadge, styles.presenceBadgeHome, { backgroundColor: tokens.service, borderColor: tokens.border }]}>
          <MappedIcon name="apartment" color={tokens.primary} accent={tokens.aqua} size={25} />
          <Text style={[styles.presenceBadgeText, { color: tokens.text }]} numberOfLines={1}>
            {copy.history.presenceHome}
          </Text>
        </View>
        <View style={[styles.presenceBadge, styles.presenceBadgeWorker, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
          <MappedIcon name={hasWorkerAnchor ? 'check' : 'estimate'} color={tokens.primary} accent={tokens.copper} />
          <Text style={[styles.presenceBadgeText, { color: tokens.text }]} numberOfLines={1}>
            {liveSignalLabel}
          </Text>
        </View>
      </View>
      <View style={styles.twoCol}>
        <V4TicketCell label={copy.history.caseLocation} testID="customer-history-location-address" value={addressLabel} variant="activity" />
        <V4TicketCell label={copy.history.locationAddressGate} testID="customer-history-location-address-gate" value={addressGateLabel} variant="activity" />
        <V4TicketCell label={copy.history.locationRoute} testID="customer-history-location-route" value={routeGateLabel} variant="activity" />
      </View>
      <View style={styles.twoCol}>
        <V4TicketCell label={copy.history.locationEtaExpected} testID="customer-history-location-eta" value={copy.history.caseEtaPending} variant="activity" />
        <V4TicketCell label={copy.history.locationLiveSignal} testID="customer-history-location-live-signal" value={liveSignalLabel} variant="activity" />
      </View>
      {releasedAddress && hasWorkerAnchor ? (
        <View style={styles.historyHeroActions}>
          <PrimaryButton label={copy.history.locationTrackAction} onPress={onOpenKael} compact testID="customer-history-location-route-action" />
        </View>
      ) : null}
    </View>
  )
}

function CustomerHistoryJobAcceptancePanel({
  copy,
  deal,
  languageMode,
  phaseContext,
  tokens,
  workerStateLabel,
}: {
  copy: (typeof customerCopy)[AppLanguage]
  deal: LocalDeal
  languageMode: AppLanguage
  phaseContext: WorkflowPhaseContext
  tokens: CustomerThemeTokens
  workerStateLabel: string
}) {
  const releasedAddress = deal.broadcast?.fullAddressVisible && deal.broadcast.fullAddressLabel
    ? deal.broadcast.fullAddressLabel
    : null
  const addressLabel = releasedAddress
    ? localizedCustomerAreaLabel(releasedAddress, languageMode, copy.ticket.unknown)
    : copy.history.locationAddressHidden
  const chatGateLabel = workflowAllowedActionsLabel(phaseContext.allowedActions, languageMode)
  const briefLabel = deal.broadcast?.prebrief.find((item) => item.trim().length > 0)?.trim() ?? copy.history.jobAcceptanceNoBrief
  const serviceLabel = localizedServiceLabel(deal.draft.serviceType, languageMode)

  return (
    <View style={[styles.historyCheckPanel, customerHistoryPanelSurface(tokens)]} testID="customer-history-job-acceptance-panel">
      <View style={styles.sectionTitle}>
        <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
          {copy.history.jobAcceptanceTitle}
        </Text>
        <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
          {copy.history.jobAcceptanceMeta}
        </Text>
      </View>
      <Text style={[styles.historyDisclaimerText, { color: tokens.text }]} numberOfLines={2}>
        {copy.history.jobAcceptanceBody}
      </Text>
      <View style={styles.twoCol}>
        <V4TicketCell label={copy.history.jobAcceptanceStatus} testID="customer-history-job-acceptance-status" value={workerStateLabel} variant="activity" />
        <V4TicketCell label={languageMode === 'en' ? 'Service' : 'Dịch vụ'} testID="customer-history-job-acceptance-service" value={serviceLabel} variant="activity" />
        <V4TicketCell label={copy.history.jobAcceptanceAddress} testID="customer-history-job-acceptance-address" value={addressLabel} variant="activity" />
      </View>
      <View style={styles.twoCol}>
        <V4TicketCell label={copy.history.jobAcceptanceChat} testID="customer-history-job-acceptance-chat" value={chatGateLabel} variant="activity" />
        <V4TicketCell label={copy.history.caseId} testID="customer-history-job-acceptance-id" value={deal.broadcast?.jobId ?? deal.id} variant="activity" />
      </View>
      <V4TicketCell label={copy.history.jobAcceptanceBrief} testID="customer-history-job-acceptance-brief" value={briefLabel} variant="activity" />
    </View>
  )
}

function CustomerHistoryJobProgressPanel({
  copy,
  languageMode,
  phaseContext,
  tokens,
}: {
  copy: (typeof customerCopy)[AppLanguage]
  languageMode: AppLanguage
  phaseContext: WorkflowPhaseContext
  tokens: CustomerThemeTokens
}) {
  const evidenceSection = phaseContext.sections.find((section) => section.id === 'completion_evidence')
  const nextLabel = phaseContext.nextExpectedEvent
    ? workflowEventLabel(phaseContext.nextExpectedEvent, languageMode)
    : copy.history.confirmed
  const chatGateLabel = workflowAllowedActionsLabel(phaseContext.allowedActions, languageMode)
  const evidenceLabel = evidenceSection?.title[languageMode] ?? workflowSourceOfTruthLabel('completion_evidence', languageMode)

  return (
    <View style={[styles.historyCheckPanel, customerHistoryPanelSurface(tokens)]} testID="customer-history-job-progress-panel">
      <View style={styles.sectionTitle}>
        <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
          {copy.history.jobProgressTitle}
        </Text>
        <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
          {copy.history.jobProgressMeta}
        </Text>
      </View>
      <Text style={[styles.historyDisclaimerText, { color: tokens.text }]} numberOfLines={2}>
        {copy.history.jobProgressBody}
      </Text>
      <View style={styles.twoCol}>
        <V4TicketCell label={copy.history.jobProgressPhase} testID="customer-history-job-progress-phase" value={phaseContext.title[languageMode]} variant="activity" />
        <V4TicketCell label={copy.history.liveAlertNext} testID="customer-history-job-progress-next" value={nextLabel} variant="activity" />
      </View>
      <View style={styles.twoCol}>
        <V4TicketCell label={copy.history.jobProgressEvidence} testID="customer-history-job-progress-evidence" value={evidenceLabel} variant="activity" />
        <V4TicketCell label={copy.history.jobAcceptanceChat} testID="customer-history-job-progress-chat" value={chatGateLabel} variant="activity" />
      </View>
    </View>
  )
}

function CustomerHistoryLiveAlertPanel({
  copy,
  deal,
  languageMode,
  notificationUnreadCount,
  notifications,
  onOpenJobChat,
  phaseContext,
  tokens,
}: {
  copy: (typeof customerCopy)[AppLanguage]
  deal: LocalDeal
  languageMode: AppLanguage
  notificationUnreadCount: number
  notifications: NotificationListResponse['notifications']
  onOpenJobChat: () => void
  phaseContext: WorkflowPhaseContext
  tokens: CustomerThemeTokens
}) {
  const liveNotification = findCurrentJobNotification(notifications, deal)
  const sourceLabel = liveNotification ? copy.history.liveAlertSourceNotification : copy.history.liveAlertSourceWorkflow
  const unreadLabel = notificationUnreadCount > 0 ? copy.history.liveAlertMetaUnread(notificationUnreadCount) : copy.history.liveAlertUnreadEmpty
  const title = liveNotification?.title?.trim() || phaseContext.primaryArtifact?.title[languageMode] || copy.history.liveAlertFallbackTitle
  const body = liveNotification?.body?.trim() || phaseContext.intent[languageMode] || copy.history.liveAlertFallbackBody
  const artifactLabel = phaseContext.primaryArtifact?.title[languageMode] ?? title
  const nextLabel = phaseContext.nextExpectedEvent
    ? workflowEventLabel(phaseContext.nextExpectedEvent, languageMode)
    : copy.history.confirmed
  const problemFallback = localizedProblemLabel(deal.draft.problemChips[0] ?? deal.draft.inferredProblemLabel, deal.draft.serviceType, languageMode)
  const problemLabel = localizedCustomerGeneratedText(deal.broadcast?.problemSummary || deal.estimate?.problemLabel, languageMode, problemFallback)
  const safeArea = deal.broadcast?.fullAddressVisible && deal.broadcast.fullAddressLabel
    ? deal.broadcast.fullAddressLabel
    : deal.broadcast?.generalArea ?? deal.draft.districtLabel
  const areaLabel = localizedCustomerAreaLabel(safeArea, languageMode, copy.ticket.unknown)
  const priorityLabel = localizedCustomerComplexityLabel(deal.estimate?.complexity, languageMode, copy.history.kaelReviewing)
  const priceLabel = deal.broadcast?.estimatedPriceLabel?.trim() || deal.estimate?.priceRangeLabel || copy.history.waitingWorkerPrice
  const distanceLabel = copy.history.locationNoSignal
  const canOpenJobChat = ['worker_matched', 'worker_on_way', 'arrived', 'inspecting', 'repairing', 'scope_change_pending', 'completed_by_worker'].includes(deal.status)

  return (
    <View style={[styles.historyCheckPanel, customerHistoryPanelSurface(tokens)]} testID="customer-history-live-alert-panel">
      <View style={styles.sectionTitle}>
        <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
          {copy.history.liveAlertTitle}
        </Text>
        <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
          {liveNotification ? unreadLabel : copy.history.liveAlertMetaWorkflow}
        </Text>
      </View>
      <View style={[styles.bookingDiagnosisPanel, customerBookingDiagnosisSurface(tokens)]}>
        <View style={[styles.bookingDiagnosisPill, { backgroundColor: tokens.service, borderColor: tokens.borderStrong }]}>
          <MappedIcon name="kael" color={tokens.primary} accent={tokens.copper} size={24} />
          <Text style={[styles.bookingDiagnosisPillText, { color: tokens.primary }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <Text style={[styles.bookingDiagnosisBody, { color: tokens.text }]} numberOfLines={3}>
          {body}
        </Text>
      </View>
      <View style={styles.twoCol}>
        <V4TicketCell label={copy.history.liveAlertSource} testID="customer-history-live-alert-source" value={sourceLabel} variant="activity" />
        <V4TicketCell label={copy.history.liveAlertUnread} testID="customer-history-live-alert-unread" value={notificationUnreadCount > 0 ? String(notificationUnreadCount) : copy.history.liveAlertUnreadEmpty} variant="activity" />
        <V4TicketCell label={languageMode === 'en' ? 'Artifact' : 'Dấu mốc'} testID="customer-history-live-alert-artifact" value={artifactLabel} variant="activity" />
      </View>
      <View style={styles.twoCol}>
        <V4TicketCell label={copy.history.liveAlertProblem} testID="customer-history-live-alert-problem" value={problemLabel} variant="activity" />
        <V4TicketCell label={copy.history.liveAlertArea} testID="customer-history-live-alert-area" value={areaLabel} variant="activity" />
      </View>
      <View style={styles.twoCol}>
        <V4TicketCell label={copy.history.liveAlertPriority} testID="customer-history-live-alert-priority" value={priorityLabel} variant="activity" />
        <V4TicketCell label={copy.history.liveAlertPrice} testID="customer-history-live-alert-price" value={priceLabel} variant="activity" />
        <V4TicketCell label={copy.history.liveAlertDistance} testID="customer-history-live-alert-distance" value={distanceLabel} variant="activity" />
      </View>
      <V4TicketCell label={copy.history.liveAlertNext} testID="customer-history-live-alert-next" value={nextLabel} variant="activity" />
      {canOpenJobChat ? (
        <View style={styles.historyHeroActions}>
          <PrimaryButton label={copy.history.liveAlertMessageWorker} onPress={onOpenJobChat} compact testID="customer-history-live-alert-message-worker" />
        </View>
      ) : null}
    </View>
  )
}

function findCurrentJobNotification(notifications: NotificationListResponse['notifications'], deal: LocalDeal) {
  const currentIds = new Set([deal.id, deal.broadcast?.jobId].filter((id): id is string => Boolean(id)))
  const belongsToCurrentJob = (item: NotificationListResponse['notifications'][number]) => !item.job_id || currentIds.has(item.job_id)
  return notifications.find((item) => item.status !== 'read' && belongsToCurrentJob(item))
    ?? notifications.find(belongsToCurrentJob)
    ?? null
}

function workflowPhaseSectionSummary(sections: WorkflowPhaseContext['sections'], languageMode: AppLanguage) {
  const labels = sections.slice(0, 2).map((section) => section.title[languageMode])
  if (sections.length > 2) {
    labels.push(languageMode === 'en' ? `+${sections.length - 2} more` : `+${sections.length - 2} mục`)
  }
  return labels.length > 0 ? labels.join(' · ') : (languageMode === 'en' ? 'No visible section yet' : 'Chưa có mục hiển thị')
}

function workflowPhaseReportBody(phaseContext: WorkflowPhaseContext, languageMode: AppLanguage) {
  const reportBodies: Partial<Record<WorkflowPhaseContext['phase'], Record<AppLanguage, string>>> = {
    intake_started: {
      en: 'Kael has the intake. A real job is not open yet.',
      vi: 'Kael đã nhận thông tin; chưa mở công việc thật.',
    },
    kael_collecting: {
      en: 'Kael is shaping the ticket before analysis.',
      vi: 'Kael đang gom dữ liệu để lập phiếu.',
    },
    kael_estimating: {
      en: 'Kael is preparing the estimate.',
      vi: 'Kael đang chuẩn bị ước tính.',
    },
    kael_explaining: {
      en: 'Estimate is ready; matching is waiting for system approval.',
      vi: 'Ước tính đã sẵn sàng; chờ hệ thống mở điều phối.',
    },
    ticket_review: {
      en: 'Kael is reviewing the ticket before matching.',
      vi: 'Kael đang rà soát phiếu trước khi điều phối.',
    },
    matching: {
      en: 'Kael sent the ticket. Waiting for a worker.',
      vi: 'Kael đã gửi phiếu. Đang chờ thợ nhận việc.',
    },
    worker_matched: {
      en: 'A worker accepted. Track travel and chat if needed.',
      vi: 'Thợ đã nhận việc; theo dõi di chuyển và chat khi cần.',
    },
    worker_on_way: {
      en: 'The worker is on the way. Watch the timeline.',
      vi: 'Thợ đang di chuyển; theo dõi timeline.',
    },
    arrived: {
      en: 'The worker has arrived and can inspect the issue.',
      vi: 'Thợ đã đến và có thể kiểm tra hiện trạng.',
    },
    inspecting: {
      en: 'Inspection is active; scope changes still need Kael.',
      vi: 'Đang kiểm tra; đổi phạm vi vẫn cần Kael.',
    },
    repairing: {
      en: 'Work is active; completion still needs evidence.',
      vi: 'Công việc đang chạy; hoàn tất cần bằng chứng.',
    },
    scope_change_pending: {
      en: 'Kael is reviewing the scope change.',
      vi: 'Kael đang rà soát thay đổi phạm vi.',
    },
    completed_by_worker: {
      en: 'Worker evidence is in; Kael reviews completion.',
      vi: 'Thợ đã gửi bằng chứng; Kael rà soát hoàn tất.',
    },
    customer_confirmed_completion: {
      en: 'Completion is confirmed; payment and review follow the synced state.',
      vi: 'Hoàn tất đã xác nhận; thanh toán và đánh giá theo trạng thái.',
    },
    payment_pending: {
      en: 'Payment is pending before review opens.',
      vi: 'Đang chờ thanh toán trước khi mở đánh giá.',
    },
    paid: {
      en: 'Payment is done; review can open when allowed.',
      vi: 'Đã thanh toán; đánh giá sẽ mở khi được phép.',
    },
    done: {
      en: 'The transaction is closed.',
      vi: 'Giao dịch đã đóng.',
    },
    cancelled: {
      en: 'The request is cancelled; no recovery is simulated.',
      vi: 'Yêu cầu đã hủy; không giả lập phục hồi.',
    },
  }

  return reportBodies[phaseContext.phase]?.[languageMode] ?? phaseContext.intent[languageMode]
}

function CustomerHistoryRepairEmptyTimeline({
  languageMode,
  tokens,
}: {
  languageMode: AppLanguage
  tokens: CustomerThemeTokens
}) {
  const emptyTimeline = getCustomerTimeline(null, languageMode).slice(0, 3)
  return (
    <View style={[styles.flowCard, styles.historyTimelineCard, styles.activityTimelineCard, customerActivityTimelinePanelSurface(tokens)]} testID="customer-history-repair-empty-timeline">
      <View pointerEvents="none" style={[styles.activityMaterialEdge, customerActivityEdgeHighlightSurface(tokens)]} testID="customer-history-empty-timeline-edge-highlight" />
      <View pointerEvents="none" style={[styles.activityTimelineRail, customerActivityTimelineRailSurface(tokens)]} testID="customer-history-activity-empty-timeline-rail" />
      {emptyTimeline.map((item) => (
        <View key={item.label} style={[styles.timelineRow, styles.activityTimelineRow]}>
          <View style={styles.activityTimelineMarker}>
            <View style={[styles.timelineDot, styles.activityTimelineDot, customerActivityTimelineDotSurface(tokens, false)]} />
          </View>
          <View style={styles.activityTimelineCopy}>
            <Text style={[styles.timelineText, { color: tokens.text }]} numberOfLines={1}>
              {item.label}
            </Text>
            <Text style={[styles.listMeta, { color: tokens.subtleText }]} numberOfLines={1}>
              {appCopy[languageMode].common.noRequest}
            </Text>
          </View>
        </View>
      ))}
    </View>
  )
}

function CustomerHistoryPriceEmptyPanel({
  copy,
  languageMode,
  onOpenKael,
  tokens,
}: {
  copy: (typeof customerCopy)[AppLanguage]
  languageMode: AppLanguage
  onOpenKael: () => void
  tokens: CustomerThemeTokens
}) {
  const priceBandLabel = languageMode === 'en' ? 'Price band' : 'Biên giá'
  const priceRows = [
    [priceBandLabel, appCopy[languageMode].common.noRequest],
    [languageMode === 'en' ? 'Urgency' : 'Độ khẩn', copy.history.kaelReviewing],
    [languageMode === 'en' ? 'Risk' : 'Rủi ro', copy.history.kaelReviewing],
    [languageMode === 'en' ? 'Kael' : 'Điều phối', copy.history.kaelReviewing],
  ] as const

  return (
    <>
      <View style={[styles.bookingDiagnosisPanel, customerBookingDiagnosisSurface(tokens)]} testID="customer-history-price-empty-kael-summary">
        <View style={[styles.bookingDiagnosisPill, { backgroundColor: tokens.service, borderColor: tokens.borderStrong }]}>
          <MappedIcon name="kael" color={tokens.primary} accent={tokens.copper} size={25} />
          <Text style={[styles.bookingDiagnosisPillText, { color: tokens.primary }]} numberOfLines={1}>
            {languageMode === 'en' ? 'Kael price summary' : 'Kael tóm tắt giá'}
          </Text>
        </View>
        <Text style={[styles.bookingDiagnosisBody, { color: tokens.text }]} numberOfLines={4}>
          {languageMode === 'en'
            ? 'Kael summarizes price when the request has real details.'
          : 'Kael tóm tắt giá khi phiếu có đủ dữ liệu thật.'}
        </Text>
      </View>
      <View style={[styles.historyCheckPanel, customerHistoryPanelSurface(tokens)]} testID="customer-history-price-empty-checklist">
        <SubtleLiquidLight testID="customer-history-tab-liquid-selector" variant="tab" />
        <View style={styles.sectionTitle}>
          <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
            {languageMode === 'en' ? 'Kael price audit' : 'Kael kiểm chứng giá'}
          </Text>
          <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
            {languageMode === 'en' ? 'Evidence-based' : 'Dựa trên bằng chứng'}
          </Text>
        </View>
        <View style={styles.bookingGrid}>
          {priceRows.map(([label, value]) => (
            <View key={label} style={[styles.priceBox, customerHistoryPriceBoxSurface(tokens)]}>
              <Text style={[styles.priceBoxLabel, styles.activityPriceBoxLabel, { color: tokens.muted }]} numberOfLines={1}>
                {label}
              </Text>
              <Text style={[styles.priceBoxValue, styles.activityPriceBoxValue, { color: tokens.text }]} numberOfLines={2}>
                {value}
              </Text>
            </View>
          ))}
        </View>
        <PrimaryButton label={copy.history.openPriceCheck} onPress={onOpenKael} compact testID="customer-history-price-open-kael" />
      </View>
    </>
  )
}

function CustomerHistoryChatEmptyPanel({
  copy,
  languageMode,
  onOpenKael,
  tokens,
}: {
  copy: (typeof customerCopy)[AppLanguage]
  languageMode: AppLanguage
  onOpenKael: () => void
  tokens: CustomerThemeTokens
}) {
  return (
    <View style={[styles.historyThreadCard, customerHistoryPanelSurface(tokens)]} testID="customer-history-chat-empty-thread">
      <View style={styles.hiddenMarker} testID="customer-history-chat-empty-evidence" />
      <View style={styles.historyChatFeed}>
        <View style={[styles.chatPreviewCard, styles.chatPreviewKaelBubble, customerHistoryChatBubbleSurface(tokens, 'kael')]} testID="customer-history-chat-feed-preview">
          <Text style={[styles.bubbleKicker, { color: tokens.primary }]} numberOfLines={1}>
            Kael
          </Text>
          <Text style={[styles.homeTrustBody, { color: tokens.text }]} numberOfLines={3}>
            {copy.history.chatEmpty}
          </Text>
        </View>
        <View style={[styles.historyChatEmptyCue, customerMintPillSurface(tokens)]} testID="customer-history-chat-empty-cue">
          <Text style={[styles.historyChatCueText, { color: tokens.primary }]} numberOfLines={2}>
            {languageMode === 'en' ? 'The thread opens after a real ticket exists.' : 'Luồng chat mở sau khi có phiếu thật.'}
          </Text>
        </View>
      </View>
      <PrimaryButton label={languageMode === 'en' ? 'Open Kael chat' : 'Mở chat Kael'} onPress={onOpenKael} compact />
    </View>
  )
}

function CustomerHistoryDoneMapEmptyPanel({
  copy,
  statusLabel,
  tokens,
}: {
  copy: (typeof customerCopy)[AppLanguage]
  statusLabel?: string
  tokens: CustomerThemeTokens
}) {
  const visibleStatusLabel = statusLabel ?? copy.history.kaelReviewing

  return (
    <View style={[styles.presenceMapCard, styles.presenceMapCardCompact, customerHistoryPanelSurface(tokens)]} testID="customer-history-done-empty-timeline">
      <View style={styles.sectionTitle}>
        <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
          {copy.history.presenceTitle}
        </Text>
        <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
          {visibleStatusLabel}
        </Text>
      </View>
      <View style={[styles.presenceMapViewport, styles.presenceMapViewportCompact, customerHistoryMapViewportSurface(tokens)]}>
        <V4MapBackdrop />
        <View style={styles.presenceMapHud} testID="customer-history-presence-map-hud">
          <View style={[styles.presenceMapControl, { backgroundColor: tokens.service, borderColor: tokens.border }]}>
            <Text style={[styles.presenceMapControlText, { color: tokens.primary }]} numberOfLines={1}>
              {copy.history.presenceTitle}
            </Text>
          </View>
          <View style={[styles.presenceMapControl, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
            <Text style={[styles.presenceMapControlText, { color: tokens.primary }]} numberOfLines={1}>
              {visibleStatusLabel}
            </Text>
          </View>
        </View>
        <View style={[styles.presenceBadge, styles.presenceBadgeHome, { backgroundColor: tokens.service, borderColor: tokens.border }]} testID="customer-presence-map-done-empty-no-worker-badge">
          <MappedIcon name="apartment" color={tokens.primary} accent={tokens.aqua} size={25} />
          <Text style={[styles.presenceBadgeText, { color: tokens.text }]} numberOfLines={1}>
            {copy.history.presenceHome}
          </Text>
        </View>
      </View>
    </View>
  )
}

function CustomerCompletionEvidencePanel({
  completionStatusLabel,
  copy,
  deal,
  languageMode,
  tokens,
}: {
  completionStatusLabel: string
  copy: (typeof customerCopy)[AppLanguage]
  deal: LocalDeal
  languageMode: AppLanguage
  tokens: CustomerThemeTokens
}) {
  const intakeMissingValue = languageMode === 'en' ? 'No intake media sent' : 'Không gửi ảnh ban đầu'
  const completionMissingValue = languageMode === 'en' ? 'Waiting for completion evidence' : 'Chờ bằng chứng hoàn tất'
  const notesMissingValue = languageMode === 'en' ? 'Waiting for worker notes' : 'Chờ ghi chú thợ'
  const intakePhotoCount = deal.draft.mediaCount
  const completionPhotoCount = deal.completionPhotoUrls?.length ?? 0
  const beforeValue = intakePhotoCount > 0
    ? languageMode === 'en'
      ? `${intakePhotoCount} intake photo${intakePhotoCount === 1 ? '' : 's'}`
      : `${intakePhotoCount} ảnh lúc gửi`
    : intakeMissingValue
  const afterValue = completionPhotoCount > 0
    ? languageMode === 'en'
      ? `${completionPhotoCount} completion photo${completionPhotoCount === 1 ? '' : 's'}`
      : `${completionPhotoCount} ảnh hoàn tất`
    : completionMissingValue
  const notesValue = deal.completionNotes?.trim() || notesMissingValue

  return (
    <View style={[styles.flowCard, customerHistoryPanelSurface(tokens)]} testID="customer-history-completion-evidence-panel">
      <View style={styles.sectionTitle}>
        <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
          {copy.history.evidence}
        </Text>
        <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
          {completionStatusLabel}
        </Text>
      </View>
      <View style={styles.twoCol}>
        <V4TicketCell label={copy.history.evidenceBefore} value={beforeValue} variant="activity" />
        <V4TicketCell label={copy.history.evidenceAfter} value={afterValue} variant="activity" />
      </View>
      <View style={styles.twoCol}>
        <V4TicketCell label={languageMode === 'en' ? 'Worker notes' : 'Ghi chú thợ'} value={notesValue} variant="activity" />
        <V4TicketCell label={copy.ticket.status} value={completionStatusLabel} variant="activity" />
      </View>
    </View>
  )
}

function CustomerHistoryDoneHero({
  canSubmitReview,
  completionStatusLabel,
  copy,
  deal,
  hasCompletionOutcome,
  isCompleted,
  languageMode,
  onOpenChat,
  onOpenReview,
  tokens,
}: {
  canSubmitReview: boolean
  completionStatusLabel: string
  copy: (typeof customerCopy)[AppLanguage]
  deal: LocalDeal | null
  hasCompletionOutcome: boolean
  isCompleted: boolean
  languageMode: AppLanguage
  onOpenChat: () => void
  onOpenReview: () => void
  tokens: CustomerThemeTokens
}) {
  const title = deal
    ? `${localizedServiceLabel(deal.draft.serviceType, languageMode)}`
    : languageMode === 'en'
      ? 'No completed job yet'
      : 'Chưa có công việc hoàn tất'
  const body = isCompleted && deal
    ? languageMode === 'en'
      ? 'Review the completion state, receipt map, and Kael decision timeline.'
      : 'Kiểm tra trạng thái hoàn tất, bản đồ biên nhận và timeline quyết định của Kael.'
    : hasCompletionOutcome && deal
      ? languageMode === 'en'
        ? 'Completion follows the synced gate; payment, chat, and review remain controlled by the current phase.'
        : 'Hoàn tất đang theo cổng đồng bộ; thanh toán, chat và đánh giá vẫn do giai đoạn hiện tại kiểm soát.'
    : deal
      ? canSubmitReview
        ? languageMode === 'en'
          ? 'Review is open after Kael completion decision.'
          : 'Đánh giá đã mở sau quyết định hoàn tất của Kael.'
        : languageMode === 'en'
          ? 'Completion details appear after Kael confirms the right step.'
          : 'Chi tiết hoàn tất chỉ hiện sau khi Kael xác nhận đúng bước.'
      : languageMode === 'en'
        ? 'Appears after real completion is updated.'
        : 'Chỉ hiện khi trạng thái hoàn tất được cập nhật.'
  const statusLabel = isCompleted
    ? copy.history.filters[3]
    : hasCompletionOutcome
      ? completionStatusLabel
    : deal
      ? canSubmitReview
        ? copy.history.review
        : copy.history.waitingWorkerDone
      : null
  const primaryLabel = canSubmitReview
    ? copy.history.review
    : isCompleted
      ? languageMode === 'en' ? 'View receipt' : 'Xem biên nhận'
      : deal
        ? copy.history.openPriceCheck
        : copy.history.newRequest
  const primaryAction = canSubmitReview ? onOpenReview : isCompleted ? onOpenReview : onOpenChat
  return (
    <View style={[styles.historyHeroPanel, styles.historyHeroPanelCompact, customerHistoryHeroSurface(tokens)]} testID="customer-history-done-hero">
      <SubtleLiquidLight testID="customer-history-done-hero-liquid" variant="rim" />
      <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
        {title}
      </Text>
      {statusLabel ? (
        <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
          {statusLabel}
        </Text>
      ) : null}
      <Text style={[styles.historyHeroBody, styles.historyHeroBodyCompact, { color: tokens.muted }]} numberOfLines={2}>
        {body}
      </Text>
      <View style={styles.historyHeroActions}>
        <PrimaryButton label={primaryLabel} onPress={primaryAction} compact />
        <SecondaryButton label={isCompleted ? (languageMode === 'en' ? 'View receipt' : 'Xem biên nhận') : copy.history.openPriceCheck} onPress={isCompleted ? onOpenReview : onOpenChat} compact tone="primary" />
      </View>
    </View>
  )
}

function CustomerHistoryDoneTimeline({
  completionEvidenceMode,
  completionStatusLabel,
  isDone,
  languageMode,
  reviewMode,
  tokens,
}: {
  completionEvidenceMode: WorkflowArtifactMode
  completionStatusLabel: string
  isDone: boolean
  languageMode: AppLanguage
  reviewMode: WorkflowArtifactMode
  tokens: CustomerThemeTokens
}) {
  const isWorkerDone = ['review', 'final', 'done'].includes(completionEvidenceMode)
  const isCustomerDone = isWorkerDone && (['review', 'final', 'done', 'blocked'].includes(reviewMode) || isDone)
  const isReviewReady = reviewMode === 'review'
  const isReviewDone = reviewMode === 'final' || reviewMode === 'done' || isDone
  const isReviewActive = isReviewReady || isReviewDone
  const reviewMeta = languageMode === 'en'
    ? isReviewDone
      ? 'Review sent'
      : reviewMode === 'blocked'
        ? 'Waiting for payment decision'
        : isReviewReady
          ? 'Ready for service review'
          : 'Opens after Kael decision'
    : isReviewDone
      ? 'Đã gửi đánh giá'
      : reviewMode === 'blocked'
        ? 'Chờ quyết định thanh toán'
        : isReviewReady
          ? 'Sẵn sàng đánh giá dịch vụ'
          : 'Mở sau quyết định Kael'
  const rows: Array<readonly [string, string, boolean]> = languageMode === 'en'
    ? [
        ['Worker completed', isWorkerDone ? completionStatusLabel : 'Waiting for real completion state', isWorkerDone],
        ['Kael completion', isCustomerDone ? 'Completion decision recorded' : 'Decision pending', isCustomerDone],
        ['Review pending', reviewMeta, isReviewActive],
      ]
    : [
        ['Thợ hoàn tất', isWorkerDone ? completionStatusLabel : 'Chờ trạng thái hoàn tất thật', isWorkerDone],
        ['Kael hoàn tất', isCustomerDone ? 'Đã ghi quyết định hoàn tất' : 'Chờ quyết định', isCustomerDone],
        ['Chờ đánh giá', reviewMeta, isReviewActive],
      ]

  return (
    <View style={[styles.flowCard, styles.historyTimelineCard, styles.historyDoneTimelineCard, customerHistoryPanelSurface(tokens)]} testID="customer-history-done-timeline">
      {rows.map(([title, meta, active]) => (
        <View key={title} style={[styles.timelineRow, styles.timelineRowDone]}>
          <View style={[styles.timelineDot, styles.timelineDotCompact, { backgroundColor: active ? tokens.primary : tokens.borderStrong }]} />
          <View style={styles.listCopy}>
            <Text style={[styles.timelineText, styles.timelineTextCompact, { color: tokens.text }]} numberOfLines={1}>
              {title}
            </Text>
            <Text style={[styles.listMeta, styles.listMetaCompact, { color: tokens.subtleText }]} numberOfLines={1}>
              {meta}
            </Text>
          </View>
        </View>
      ))}
    </View>
  )
}

function CustomerHistoryReviewPanel({
  canSubmitReview,
  copy,
  onRatingChange,
  onSubmit,
  rating,
  reviewMode,
  selectors,
  tokens,
}: {
  canSubmitReview: boolean
  copy: (typeof customerCopy)[AppLanguage]
  onRatingChange: (rating: 1 | 2 | 3 | 4 | 5) => void
  onSubmit: () => void
  rating: 1 | 2 | 3 | 4 | 5 | null
  reviewMode: WorkflowArtifactMode
  selectors: LocalWorkflowSelectors
  tokens: CustomerThemeTokens
}) {
  const reviewValue = reviewMode === 'done' || reviewMode === 'final'
    ? copy.history.reviewed
    : canSubmitReview
      ? copy.history.open
      : copy.history.locked
  const paymentValue = selectors.currentBackendStatus === 'paid'
    ? copy.history.open
    : selectors.paymentLocked
      ? copy.history.locked
      : copy.history.open
  return (
    <View style={[styles.flowCard, customerHistoryPanelSurface(tokens)]} testID="customer-history-review-panel">
      <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
        {copy.history.paymentReview}
      </Text>
      <View style={styles.twoCol}>
        <V4TicketCell label={copy.history.payment} value={paymentValue} variant="activity" />
        <V4TicketCell label={copy.history.review} value={reviewValue} variant="activity" />
      </View>
      {canSubmitReview ? (
        <View style={styles.workerActions} testID="customer-history-review-submit">
          <View style={styles.workerMetaRow}>
            {([1, 2, 3, 4, 5] as const).map((nextRating) => (
              <Pressable
                accessibilityLabel={copy.history.chooseStar(nextRating)}
                accessibilityRole="button"
                accessibilityState={{ selected: rating === nextRating }}
                key={nextRating}
                onPress={() => onRatingChange(nextRating)}
                style={[styles.reviewRatingButton, { backgroundColor: rating === nextRating ? tokens.primary : tokens.glassStrong }]}
              >
                <Text style={{ color: rating === nextRating ? tokens.primaryText : tokens.primary }} numberOfLines={1}>
                  {nextRating}
                </Text>
              </Pressable>
            ))}
          </View>
          <PrimaryButton label={copy.history.submitReview} onPress={onSubmit} compact />
        </View>
      ) : null}
    </View>
  )
}

function CustomerHistoryPricePanel({
  copy,
  deal,
  estimateLabel,
  languageMode,
  onOpenKael,
  originalEstimateLabel,
  scopeChange,
  tokens,
  visibleStatusLabel,
}: {
  copy: (typeof customerCopy)[AppLanguage]
  deal: LocalDeal
  estimateLabel: string
  languageMode: AppLanguage
  onOpenKael: () => void
  originalEstimateLabel: string
  scopeChange: LocalScopeChange | null
  tokens: CustomerThemeTokens
  visibleStatusLabel: string
}) {
  const scopePrice =
    scopeChange?.priceMin && scopeChange.priceMax
      ? `${formatVnd(scopeChange.priceMin)} - ${formatVnd(scopeChange.priceMax)}`
      : copy.history.kaelReviewing
  const finalPriceLabel = deal.finalPrice && deal.finalPrice > 0
    ? formatVnd(deal.finalPrice)
    : copy.history.waitingWorkerPrice
  const broadcastQuoteLabel = deal.broadcast?.estimatedPriceLabel?.trim() || deal.estimate?.priceRangeLabel || copy.history.waitingWorkerPrice
  const kaelQuoteLabel = deal.estimate?.priceRangeLabel || deal.broadcast?.estimatedPriceLabel || copy.history.waitingWorkerPrice
  const scopeQuoteLabel = scopeChange ? scopePrice : copy.history.workerQuoteScopePending
  const workerQuoteTimeLabel = deal.draft.timeChoice === 'now' ? copy.history.workerQuoteTimeNow : copy.history.kaelReviewing
  const problemFallback = localizedProblemLabel(deal.draft.problemChips[0] ?? deal.draft.inferredProblemLabel, deal.draft.serviceType, languageMode)
  const problemLabel = localizedCustomerGeneratedText(deal.estimate?.problemLabel, languageMode, problemFallback)
  const urgencyLabel = localizedCustomerComplexityLabel(deal.estimate?.complexity, languageMode, copy.history.kaelReviewing)
  const priceSummary = localizedCustomerGeneratedText(deal.estimate?.advisory, languageMode, copy.history.priceDisclaimer)
  const priceGrid = [
    [languageMode === 'en' ? 'Price band' : 'Biên giá', estimateLabel],
    [languageMode === 'en' ? 'Urgency' : 'Độ khẩn', urgencyLabel],
    [languageMode === 'en' ? 'Risk' : 'Rủi ro', problemLabel],
    [languageMode === 'en' ? 'Kael' : 'Điều phối', visibleStatusLabel],
  ] as const

  return (
    <View style={[styles.historyCheckPanel, customerHistoryPanelSurface(tokens)]} testID="customer-history-price-tab-panel">
      <View style={styles.sectionTitle}>
        <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
          {copy.history.filters[1]}
        </Text>
        <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
          {languageMode === 'en' ? 'Evidence-based' : 'Dựa trên bằng chứng'}
        </Text>
      </View>
      <View style={[styles.bookingDiagnosisPanel, customerBookingDiagnosisSurface(tokens)]} testID="customer-history-price-kael-summary">
        <View style={[styles.bookingDiagnosisPill, { backgroundColor: tokens.service, borderColor: tokens.borderStrong }]}>
          <MappedIcon name="kael" color={tokens.primary} accent={tokens.copper} size={25} />
          <Text style={[styles.bookingDiagnosisPillText, { color: tokens.primary }]} numberOfLines={1}>
            {languageMode === 'en' ? 'Kael price summary' : 'Kael tóm tắt giá'}
          </Text>
        </View>
        <Text style={[styles.bookingDiagnosisBody, { color: tokens.text }]} numberOfLines={4}>
            {priceSummary}
        </Text>
      </View>
      <View style={styles.bookingGrid} testID="customer-history-price-check-grid">
        {priceGrid.map(([label, value]) => (
          <View key={label} style={[styles.priceBox, customerHistoryPriceBoxSurface(tokens)]}>
            <Text style={[styles.priceBoxLabel, styles.activityPriceBoxLabel, { color: tokens.muted }]} numberOfLines={1}>
              {label}
            </Text>
            <Text style={[styles.priceBoxValue, styles.activityPriceBoxValue, { color: tokens.text }]} numberOfLines={2}>
              {value}
            </Text>
          </View>
        ))}
      </View>
      <View style={[styles.workerQuotePanel, customerHistoryPriceBoxSurface(tokens)]} testID="customer-history-price-worker-quote-panel">
        <View style={styles.workerQuoteHeader}>
          <View style={[styles.bookingDiagnosisPill, { backgroundColor: tokens.service, borderColor: tokens.borderStrong }]}>
            <MappedIcon name="estimate" color={tokens.primary} accent={tokens.copper} size={23} />
            <Text style={[styles.bookingDiagnosisPillText, { color: tokens.primary }]} numberOfLines={1}>
              {copy.history.workerQuoteTitle}
            </Text>
          </View>
          <Text style={[styles.sectionMeta, { color: tokens.muted }]} numberOfLines={1}>
            {copy.history.workerQuoteMeta}
          </Text>
        </View>
        <Text style={[styles.historyDisclaimerText, { color: tokens.text }]} numberOfLines={2}>
          {copy.history.workerQuoteBody}
        </Text>
        <View style={styles.twoCol}>
          <V4TicketCell label={copy.history.workerQuoteBroadcast} testID="customer-history-worker-quote-broadcast" value={broadcastQuoteLabel} variant="activity" />
          <V4TicketCell label={copy.history.workerQuoteKael} testID="customer-history-worker-quote-kael" value={kaelQuoteLabel} variant="activity" />
        </View>
        <View style={styles.twoCol}>
          <V4TicketCell label={copy.history.workerQuoteScope} testID="customer-history-worker-quote-scope" value={scopeQuoteLabel} variant="activity" />
          <V4TicketCell label={copy.ticket.finalPrice} testID="customer-history-worker-quote-final" value={finalPriceLabel} variant="activity" />
        </View>
        <View style={styles.twoCol}>
          <V4TicketCell label={copy.history.workerQuoteTime} testID="customer-history-worker-quote-time" value={workerQuoteTimeLabel} variant="activity" />
          <V4TicketCell label={copy.ticket.status} testID="customer-history-worker-quote-status" value={visibleStatusLabel} variant="activity" />
        </View>
        {scopeChange ? (
          <View style={styles.twoCol}>
            <V4TicketCell label={copy.history.reason} testID="customer-history-worker-quote-reason" value={scopeChange.reason ?? copy.history.workerNoReason} variant="activity" />
            <V4TicketCell label={copy.history.newPrice} testID="customer-history-worker-quote-new-price" value={scopePrice} variant="activity" />
          </View>
        ) : null}
      </View>
      <View style={styles.twoCol}>
        <V4TicketCell label={copy.history.filters[1]} value={originalEstimateLabel} variant="activity" />
        <V4TicketCell label={copy.ticket.finalPrice} value={finalPriceLabel} variant="activity" />
      </View>
      {scopeChange ? (
        <View style={styles.twoCol}>
          <V4TicketCell label={copy.history.reason} value={scopeChange.reason ?? copy.history.workerNoReason} variant="activity" />
          <V4TicketCell label={copy.history.newPrice} value={scopePrice} variant="activity" />
        </View>
      ) : null}
      <Text style={[styles.historyDisclaimerText, { color: tokens.muted }]} numberOfLines={3} testID="customer-history-price-disclaimer">
        {copy.history.priceDisclaimer}
      </Text>
      <View style={styles.twoCol}>
        <PrimaryButton label={copy.history.workerQuoteDetails} onPress={onOpenKael} compact testID="customer-history-price-open-kael" />
        <V4TicketCell label={copy.ticket.status} testID="customer-history-price-kael-status" value={visibleStatusLabel} variant="activity" />
      </View>
    </View>
  )
}

function CustomerHistoryChatPanel({
  copy,
  deal,
  languageMode,
  onOpenKael,
  phaseContext,
  tokens,
  visibleStatusLabel,
}: {
  copy: (typeof customerCopy)[AppLanguage]
  deal: LocalDeal
  languageMode: AppLanguage
  onOpenKael: () => void
  phaseContext: WorkflowPhaseContext
  tokens: CustomerThemeTokens
  visibleStatusLabel: string
}) {
  const { session } = useAuth()
  const [draft, setDraft] = useState('')
  const jobId = getCustomerChatJobId(deal)
  const chatSection = phaseContext.sections.find((section) => section.id === 'job_chat')
  const chatCanRead = Boolean(jobId && chatSection?.visible)
  const chatCanSend = Boolean(chatCanRead && !chatSection?.lockedReason)
  const jobChat = useJobChatThread(jobId, chatCanRead)
  const renderedMessages = jobChat.messages.map((message) => customerChatMessageFromJobMessage(message, session?.user.id ?? null, languageMode))
  const lockedReason = !chatCanSend && chatSection?.lockedReason
    ? workflowBlockedReasonLabel(chatSection.lockedReason, languageMode)
    : null
  const statusValue = visibleStatusLabel
  const serviceValue = localizedServiceLabel(deal.draft.serviceType, languageMode)
  const actionGateValue = phaseContext.blockedReason
    ? workflowBlockedReasonLabel(phaseContext.blockedReason, languageMode)
    : workflowAllowedActionsLabel(phaseContext.allowedActions, languageMode)
  const issueValue = localizedProblemLabel(deal.draft.problemChips[0] ?? deal.draft.inferredProblemLabel, deal.draft.serviceType, languageMode)
  const descriptionValue = deal.draft.description.trim() || copy.history.chatEmpty
  const kaelSummaryValue = localizedCustomerGeneratedText(deal.estimate?.advisory, languageMode, copy.history.chatEmpty)
  const timeValue = deal.draft.timeChoice === 'now' ? copy.history.chatHelperTimeNow : copy.history.kaelReviewing
  const canSend = Boolean(chatCanSend && draft.trim() && !jobChat.sending)
  const sendLabel = languageMode === 'en' ? 'Send message' : 'Gửi tin nhắn'
  const inputLabel = chatCanSend
    ? languageMode === 'en' ? 'Message worker through Kael' : 'Nhắn với thợ qua Kael'
    : chatCanRead
      ? languageMode === 'en' ? 'Chat is read-only after the payment gate' : 'Chat chỉ còn đọc lại sau cổng thanh toán'
      : languageMode === 'en' ? 'Chat opens after Kael matches a worker' : 'Chat mở sau khi Kael ghép thợ'
  const sendErrorTitle = languageMode === 'en' ? 'Message not sent' : 'Chưa gửi được'
  const sendErrorBody = languageMode === 'en' ? 'Kael could not save this message. Try again.' : 'Kael chưa lưu được tin nhắn. Thử lại sau.'
  const submitMessage = async () => {
    const value = draft.trim()
    if (!value || !jobId || !chatCanSend) return
    const sent = await jobChat.send(value)
    if (!sent) {
      Alert.alert(sendErrorTitle, sendErrorBody)
      return
    }
    setDraft('')
  }

  return (
    <View style={[styles.historyThreadCard, customerHistoryPanelSurface(tokens)]} testID="customer-history-chat-tab-panel">
      <View style={styles.sectionTitle}>
        <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
          {copy.history.chatHelperTitle}
        </Text>
        <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
          {copy.history.chatHelperMeta}
        </Text>
      </View>
      <View style={styles.hiddenMarker} testID="customer-history-chat-empty-evidence" />
      <View style={styles.twoCol} testID="customer-history-chat-helper-grid">
        <V4TicketCell label={languageMode === 'en' ? 'Service' : 'Dịch vụ'} testID="customer-history-chat-helper-service" value={serviceValue} variant="activity" />
        <V4TicketCell label={languageMode === 'en' ? 'Gate' : 'Cổng'} testID="customer-history-chat-helper-action" value={actionGateValue} variant="activity" />
        <V4TicketCell label={copy.history.chatHelperTime} testID="customer-history-chat-helper-time" value={timeValue} variant="activity" />
      </View>
      <View style={styles.historyChatFeed}>
        {renderedMessages.length > 0 ? renderedMessages.map((message) => (
          <View key={message.id} style={[styles.chatPreviewCard, message.mine ? styles.chatPreviewUserBubble : styles.chatPreviewKaelBubble, customerHistoryChatBubbleSurface(tokens, message.system ? 'kael' : message.mine ? 'user' : 'other')]} testID={message.system ? 'customer-history-chat-kael-message' : message.mine ? 'customer-history-chat-user-message' : 'customer-history-chat-worker-message'}>
            <Text style={[styles.bubbleKicker, { color: tokens.primary }]} numberOfLines={1}>
              {message.who}
            </Text>
            <Text style={[styles.homeTrustBody, { color: tokens.text }]} numberOfLines={4}>
              {message.text}
            </Text>
          </View>
        )) : (
          <>
            <View style={[styles.chatPreviewCard, styles.chatPreviewKaelBubble, customerHistoryChatBubbleSurface(tokens, 'kael')]} testID="customer-history-chat-feed-preview">
              <Text style={[styles.bubbleKicker, { color: tokens.primary }]} numberOfLines={1}>
                Kael
              </Text>
              <Text style={[styles.homeTrustBody, { color: tokens.text }]} numberOfLines={3}>
                {languageMode === 'en'
                  ? `Request status: ${statusValue}. Problem: ${issueValue}.`
                  : `Trạng thái: ${statusValue}. Vấn đề: ${issueValue}.`}
              </Text>
            </View>
            <View style={[styles.chatPreviewCard, styles.chatPreviewUserBubble, customerHistoryChatBubbleSurface(tokens, 'user')]} testID="customer-history-chat-user-bubble">
              <Text style={[styles.bubbleKicker, { color: tokens.primary }]} numberOfLines={1}>
                {languageMode === 'en' ? 'Customer' : 'Khách'}
              </Text>
              <Text style={[styles.homeTrustBody, { color: tokens.text }]} numberOfLines={3}>
                {descriptionValue}
              </Text>
            </View>
            <View style={[styles.chatPreviewCard, styles.chatPreviewKaelBubble, customerHistoryChatBubbleSurface(tokens, 'kael')]} testID="customer-history-chat-kael-bubble">
              <Text style={[styles.bubbleKicker, { color: tokens.primary }]} numberOfLines={1}>
                Kael
              </Text>
              <Text style={[styles.homeTrustBody, { color: tokens.text }]} numberOfLines={3}>
                {jobChat.loading ? (languageMode === 'en' ? 'Loading thread...' : 'Đang tải luồng chat...') : kaelSummaryValue}
              </Text>
            </View>
          </>
        )}
      </View>
      <View style={[styles.composer, styles.historyChatComposer, customerMintPillSurface(tokens)]} testID="customer-history-chat-composer">
        <TextInput
          accessibilityLabel={inputLabel}
          editable={chatCanSend}
          onChangeText={setDraft}
          onSubmitEditing={submitMessage}
          placeholder={inputLabel}
          placeholderTextColor={tokens.subtleText}
          returnKeyType="send"
          selectionColor={tokens.primary}
          style={[styles.composerInput, { color: tokens.text }]}
          testID="customer-history-chat-input"
          value={draft}
        />
        <Pressable
          accessibilityLabel={sendLabel}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={submitMessage}
          style={({ pressed }) => [
            styles.sendButton,
            { backgroundColor: canSend ? tokens.primary : tokens.border },
            pressed ? styles.pressed : null,
          ]}
          testID="customer-history-chat-send"
        >
          <MappedIcon name="send" color={canSend ? tokens.primaryText : tokens.subtleText} accent={tokens.aqua} />
        </Pressable>
      </View>
      {lockedReason ? (
        <Text style={[styles.sectionMeta, { color: tokens.muted }]} testID="customer-history-chat-locked-reason">
          {lockedReason}
        </Text>
      ) : null}
      <PrimaryButton label={copy.history.chatHelperDetails} onPress={onOpenKael} compact />
    </View>
  )
}

function getCustomerChatJobId(deal: LocalDeal) {
  const jobId = deal.broadcast?.jobId ?? deal.id
  if (!jobId || jobId === LOCAL_DEAL_ID) return null
  return jobId
}

function customerChatMessageFromJobMessage(message: JobMessageResponse, currentUserId: string | null, languageMode: AppLanguage) {
  const system = message.sender_role === 'kael'
  const mine = Boolean(currentUserId && message.sender_id === currentUserId)
  const who = system
    ? 'Kael'
    : message.sender_role === 'customer'
      ? languageMode === 'en' ? 'Customer' : 'Khách'
      : languageMode === 'en' ? 'Worker' : 'Thợ'

  return {
    id: message.id,
    mine,
    system,
    text: message.content,
    who,
  }
}

function CustomerCompletionPresenceMap({
  copy,
  deal,
  languageMode,
  tokens,
  visibleStatusLabel,
}: {
  copy: (typeof customerCopy)[AppLanguage]
  deal: LocalDeal
  languageMode: AppLanguage
  tokens: CustomerThemeTokens
  visibleStatusLabel: string
}) {
  const addressLabel = localizedCustomerAreaLabel(deal.draft.addressLabel ?? deal.draft.districtLabel, languageMode, copy.ticket.unknown)

  return (
    <View style={[styles.presenceMapCard, customerHistoryPanelSurface(tokens)]} testID="customer-presence-map-done">
      <View style={styles.sectionTitle}>
        <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
          {copy.history.presenceTitle}
        </Text>
        <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
          {visibleStatusLabel}
        </Text>
      </View>
      <View style={[styles.presenceMapViewport, customerHistoryMapViewportSurface(tokens)]}>
        <V4MapBackdrop presence />
        <View style={styles.presenceMapHud} testID="customer-history-presence-map-hud">
          <View style={[styles.presenceMapControl, { backgroundColor: tokens.service, borderColor: tokens.border }]}>
            <Text style={[styles.presenceMapControlText, { color: tokens.primary }]} numberOfLines={1}>
              {copy.history.presenceTitle}
            </Text>
          </View>
          <View style={[styles.presenceMapControl, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
            <Text style={[styles.presenceMapControlText, { color: tokens.primary }]} numberOfLines={1}>
              {visibleStatusLabel}
            </Text>
          </View>
        </View>
        <View style={[styles.presenceBadge, styles.presenceBadgeHome, { backgroundColor: tokens.service, borderColor: tokens.border }]}>
          <MappedIcon name="apartment" color={tokens.primary} accent={tokens.aqua} size={25} />
          <Text style={[styles.presenceBadgeText, { color: tokens.text }]} numberOfLines={1}>
            {copy.history.presenceHome}
          </Text>
        </View>
        <View style={[styles.presenceBadge, styles.presenceBadgeWorker, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
          <MappedIcon name="check" color={tokens.primary} accent={tokens.copper} />
          <Text style={[styles.presenceBadgeText, { color: tokens.text }]} numberOfLines={1}>
            {copy.history.presenceWorker}
          </Text>
        </View>
      </View>
      <View style={styles.twoCol}>
        <V4TicketCell label={copy.ticket.area} value={addressLabel} variant="activity" />
        <V4TicketCell label={copy.ticket.status} value={visibleStatusLabel} variant="activity" />
      </View>
    </View>
  )
}

type V4TicketCellVariant = 'default' | 'activity' | 'report'

function V4TicketCell({
  label,
  testID,
  value,
  valueLines = 2,
  variant = 'default',
}: {
  label: string
  testID?: string
  value: string
  valueLines?: number
  variant?: V4TicketCellVariant
}) {
  const tokens = useCustomerTokens()
  const activityVariant = variant === 'activity'
  const reportVariant = variant === 'report'
  return (
    <View style={[styles.ticketCell, reportVariant ? styles.reportTicketCell : null, customerOpaqueSurface(tokens)]} testID={testID}>
      <Text
        style={[
          styles.ticketLabel,
          activityVariant ? styles.activityTicketLabel : null,
          reportVariant ? styles.reportTicketLabel : null,
          { color: tokens.muted },
        ]}
        numberOfLines={1}
        testID={testID ? `${testID}-label` : undefined}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.ticketValue,
          activityVariant ? styles.activityTicketValue : null,
          reportVariant ? styles.reportTicketValue : null,
          { color: tokens.text },
        ]}
        numberOfLines={valueLines}
        testID={testID ? `${testID}-value` : undefined}
      >
        {value}
      </Text>
    </View>
  )
}

function V4Metric({ label, value }: { label: string; value: string }) {
  const tokens = useCustomerTokens()
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricLabel, { color: tokens.muted }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.metricValue, { color: tokens.primary }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  )
}

function QuickCard({ icon, testID, title }: { icon: IconName; testID?: string; title: string }) {
  const tokens = useCustomerTokens()
  return (
    <View style={[styles.quickCard, customerOpaqueSurface(tokens)]} testID={testID}>
      <MappedIcon name={icon} color={tokens.primary} accent={tokens.copper} size={29} />
      <Text style={[styles.quickTitle, { color: tokens.text }]} numberOfLines={2}>
        {title}
      </Text>
    </View>
  )
}

function ListRow({ compact = false, icon, meta, testID, title }: { compact?: boolean; icon: IconName; meta: string; testID?: string; title: string }) {
  const tokens = useCustomerTokens()
  const compactRowSurface = compact ? customerProfileRowSurface(tokens) : null
  return (
    <View style={[styles.listRow, compact ? styles.profileListRow : null, compactRowSurface]} testID={testID}>
      <View style={[styles.profileRowIconStage, customerProfileRowIconSurface(tokens)]}>
        <MappedIcon name={icon} color={tokens.primary} accent={tokens.primary} size={compact ? 24 : 26} />
      </View>
      <View style={[styles.listCopy, compact ? styles.profileListCopy : null]}>
        <Text style={[styles.listTitle, compact ? styles.profileListTitle : null, { color: tokens.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.listMeta, compact ? styles.profileListMeta : null, { color: tokens.subtleText }]} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      {compact ? null : (
        <Text style={[styles.chevron, { color: tokens.text }]} numberOfLines={1}>
          ›
        </Text>
      )}
    </View>
  )
}

function ActionRow({
  compact = false,
  icon,
  meta,
  onPress,
  testID,
  title,
}: {
  compact?: boolean
  icon: IconName
  meta: string
  onPress: () => void
  testID: string
  title: string
}) {
  const tokens = useCustomerTokens()
  const { reduceMotion } = useGlassAccessibility()
  const compactRowSurface = compact ? customerProfileRowSurface(tokens) : null
  return (
    <Pressable accessibilityLabel={meta ? `${title}. ${meta}` : title} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.listRow, compact ? styles.profileListRow : null, compactRowSurface, reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID={testID}>
      <View style={[styles.profileRowIconStage, customerProfileRowIconSurface(tokens)]}>
        <MappedIcon name={icon} color={tokens.primary} accent={tokens.primary} size={compact ? 24 : 26} />
      </View>
      <View style={[styles.listCopy, compact ? styles.profileListCopy : null]}>
        <Text style={[styles.listTitle, compact ? styles.profileListTitle : null, { color: tokens.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.listMeta, compact ? styles.profileListMeta : null, { color: tokens.subtleText }]} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      {compact ? null : (
        <Text style={[styles.chevron, { color: tokens.text }]} numberOfLines={1}>
          ›
        </Text>
      )}
    </Pressable>
  )
}

function ThemeToggle({ mode, onToggle }: { mode: ThemeMode; onToggle: () => void }) {
  const tokens = useCustomerTokens()
  const languageMode = useAppLanguage()
  return (
    <Pressable
      accessibilityLabel={languageMode === 'en' ? 'Toggle light and dark mode' : 'Đổi giao diện sáng tối'}
      accessibilityRole="switch"
      accessibilityState={{ checked: mode === 'dark' }}
      onPress={onToggle}
      style={[styles.themeToggle, { backgroundColor: mode === 'dark' ? tokens.service : tokens.depthSurface, borderColor: tokens.borderStrong }]}
      testID="customer-dark-mode-toggle"
    >
      <View style={[styles.themeKnob, { backgroundColor: mode === 'dark' ? tokens.primary : tokens.raised, transform: [{ translateX: mode === 'dark' ? 18 : 0 }] }]} />
    </Pressable>
  )
}

function IconButton({ accessibilityLabel, icon, markerTestID }: { accessibilityLabel: string; icon: IconName; markerTestID?: string }) {
  const tokens = useCustomerTokens()
  return (
    <View accessibilityLabel={accessibilityLabel} accessibilityRole="image" style={[styles.iconButton, glassSurface(tokens, 'strong')]} testID={markerTestID}>
      <SubtleGlassHighlight />
      <MappedIcon name={icon} color={tokens.primary} accent={tokens.copper} size={30} />
    </View>
  )
}

function ClientImageIcon({ chrome = 'inline', name, size }: { chrome?: 'inline' | 'shell'; name: ClientImageIconName; size: number }) {
  const tokens = useCustomerTokens()
  const reduceTransparency = customerReduceTransparency(tokens)
  const imageSize = Math.round(size * 1.28)
  const showInlineBacking = chrome === 'inline'
  return (
    <View
      pointerEvents="none"
      style={[styles.clientImageIconStage, { height: size, width: size }]}
      testID="customer-client-asset-appearance-adaptive"
    >
      {showInlineBacking ? (
        <View
          pointerEvents="none"
          style={[styles.clientImageAssetBacking, customerClientAssetBackingSurface(tokens, 'inline')]}
          testID={tokens.mode === 'dark' ? 'customer-client-asset-dark-elevated-base' : undefined}
        />
      ) : null}
      <Image
        contentFit="contain"
        source={clientImageIcons[name]}
        style={[styles.clientImageIcon, customerClientAssetImageTone(tokens), { height: imageSize, width: imageSize }]}
      />
      {tokens.mode === 'dark' && !reduceTransparency ? (
        <View pointerEvents="none" style={[styles.clientImageAssetSoftener, customerClientAssetSoftenerSurface(tokens)]} testID="customer-client-asset-dark-softener" />
      ) : null}
    </View>
  )
}

function MappedIcon({ accent, color, name, size = 25 }: { accent: string; color: string; name: IconName; size?: number }) {
  const imageName = clientImageIconByGlyph[name]
  if (imageName) return <ClientImageIcon name={imageName} size={size} />
  return <IconGlyph name={name} color={color} accent={accent} />
}

function IconShell({ icon, tone = 'service', size = 46 }: { icon: IconName; tone?: SurfaceTone; size?: number }) {
  const tokens = useCustomerTokens()
  const accent = tone === 'water' ? tokens.aqua : tone === 'warm' ? tokens.copper : tokens.copper
  const imageName = clientImageIconByGlyph[icon]

  if (imageName) {
    return (
      <View
        style={[
          styles.iconShell,
          styles.clientImageIconShell,
          customerClientAssetBackingSurface(tokens, 'shell'),
          {
            borderRadius: Math.max(14, Math.round(size * 0.36)),
            height: size,
            width: size,
          },
        ]}
        testID="customer-client-asset-elevated-shell"
      >
        <ClientImageIcon chrome="shell" name={imageName} size={Math.round(size * 0.98)} />
      </View>
    )
  }

  return (
    <View
      style={[
        styles.iconShell,
        {
          ...customerIconSurface(tokens, tone),
          borderRadius: Math.max(14, Math.round(size * 0.36)),
          height: size,
          width: size,
        },
      ]}
    >
      <MappedIcon name={icon} color={tokens.primary} accent={accent} size={Math.round(size * 0.96)} />
    </View>
  )
}

function KaelMascot({ material = 'glass', size, variant }: { material?: 'glass' | 'opaque'; size: number; variant: 'head' | 'full' }) {
  const tokens = useCustomerTokens()
  const source = variant === 'head' ? kaelModel8AHead : kaelModel8A
  const mascotSurface = material === 'glass' ? glassSurface(tokens, 'water') : customerOpaqueSurface(tokens)
  return (
    <View
      style={[
        styles.kaelMascotFrame,
        {
          ...mascotSurface,
          borderRadius: Math.round(size * 0.32),
          height: size,
          width: size,
        },
      ]}
      testID={variant === 'head' ? 'kael-model-8a-head.png' : 'kael-model-8a.png'}
    >
      {material === 'glass' ? <SubtleGlassHighlight /> : null}
      <Image contentFit="contain" source={source} style={{ height: variant === 'head' ? size * 0.9 : size * 1.1, width: variant === 'head' ? size * 0.9 : size * 1.05 }} />
    </View>
  )
}

function PrimaryButton({ compact, label, onPress, testID }: { compact?: boolean; label: string; onPress: () => void; testID?: string }) {
  const tokens = useCustomerTokens()
  const { reduceMotion } = useGlassAccessibility()
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        compact ? styles.primaryButtonCompact : null,
        {
          backgroundColor: tokens.primary,
          boxShadow: tokens.mode === 'dark' ? '0 14px 24px rgba(0,0,0,0.22)' : '0 14px 24px rgba(41,173,151,0.22)',
          experimental_backgroundImage: tokens.mode === 'dark'
            ? 'linear-gradient(135deg, rgba(105,222,198,0.94), rgba(14,156,136,0.88))'
            : 'linear-gradient(135deg, #0B5C50, #0E9C88)',
        } as any,
        reduceMotionAwarePressStyle(pressed, reduceMotion),
      ]}
      testID={testID}
    >
      <Text adjustsFontSizeToFit minimumFontScale={0.84} style={[styles.primaryButtonText, { color: tokens.primaryText }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

function SecondaryButton({ compact, label, onPress, testID, tone = 'danger' }: { compact?: boolean; label: string; onPress: () => void; testID?: string; tone?: 'danger' | 'primary' }) {
  const tokens = useCustomerTokens()
  const { reduceMotion } = useGlassAccessibility()
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.secondaryButton, compact ? styles.primaryButtonCompact : null, { borderColor: tokens.borderStrong, backgroundColor: tokens.ghost }, reduceMotionAwarePressStyle(pressed, reduceMotion)]}
      testID={testID}
    >
      <Text adjustsFontSizeToFit minimumFontScale={0.84} style={[styles.secondaryButtonText, { color: tone === 'primary' ? tokens.primary : tokens.danger }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

function SmallChip({ label, tone = 'base' }: { label: string; tone?: SurfaceTone }) {
  const tokens = useCustomerTokens()
  return (
    <View style={[styles.smallChip, customerSmallChipSurface(tokens, tone)]}>
      <Text style={[styles.smallChipText, { color: customerSmallChipTextColor(tokens, tone) }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

function useCustomerTokens(): CustomerThemeTokens {
  return use(CustomerThemeContext)
}

function customerReduceTransparency(tokens: CustomerThemeTokens) {
  return tokens.glassHighlight === 'transparent' && tokens.glassShadow === 'none'
}

function getLayerSurface(tokens: CustomerThemeTokens, tone: SurfaceTone) {
  switch (tone) {
    case 'base':
      return tokens.base
    case 'raised':
      return tokens.raised
    case 'service':
      return tokens.service
    case 'water':
      return tokens.water
    case 'warm':
      return tokens.warm
    case 'depth':
      return tokens.depthSurface
    case 'ghost':
      return tokens.ghost
    case 'disabled':
      return tokens.disabled
  }
}

function customerSmallChipSurface(tokens: CustomerThemeTokens, tone: SurfaceTone = 'base') {
  const reduceTransparency = customerReduceTransparency(tokens)
  const isWater = tone === 'water'
  const isWarm = tone === 'warm'
  const isService = tone === 'service'

  if (!isWater && !isWarm && !isService) {
    return { backgroundColor: getLayerSurface(tokens, tone), borderColor: tokens.border }
  }

  return {
    backgroundColor: tokens.mode === 'dark'
      ? isWarm ? 'rgba(64,42,24,0.86)' : isWater ? 'rgba(18,60,64,0.82)' : 'rgba(19,64,55,0.82)'
      : isWarm ? 'rgba(255,244,219,0.94)' : isWater ? 'rgba(232,252,253,0.94)' : 'rgba(220,251,243,0.94)',
    borderColor: tokens.mode === 'dark'
      ? isWarm ? 'rgba(224,160,107,0.24)' : 'rgba(105,222,198,0.20)'
      : isWarm ? 'rgba(176,118,44,0.18)' : isWater ? 'rgba(35,156,168,0.18)' : 'rgba(13,134,119,0.18)',
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? '0 6px 14px rgba(0,0,0,0.16)' : '0 8px 18px rgba(17,70,61,0.055)',
  }
}

function customerSmallChipTextColor(tokens: CustomerThemeTokens, tone: SurfaceTone = 'base') {
  if (tone === 'water') return tokens.mode === 'dark' ? '#8AEBD9' : tokens.primary
  if (tone === 'warm') return tokens.mode === 'dark' ? '#F3D7A9' : '#6F4C22'
  if (tone === 'service') return tokens.primary
  return tokens.text
}

function confirmCustomerHistoryCancellation(title: string, message: string) {
  const runtime = globalThis as unknown as {
    confirm?: (message?: string) => boolean
    window?: { confirm?: (message?: string) => boolean }
  }
  const confirmDialog = runtime.confirm ?? runtime.window?.confirm
  return confirmDialog ? confirmDialog(`${title}\n\n${message}`) : false
}

function customerLiquidEdgeHighlight(tokens: CustomerThemeTokens) {
  return tokens.mode === 'dark' ? 'rgba(190,210,205,0.13)' : 'rgba(255,255,255,0.58)'
}

function customerLiquidShadow(tokens: CustomerThemeTokens, surface: 'control' | 'cta' | 'hero' | 'panel' | 'tile' = 'panel') {
  if (customerReduceTransparency(tokens)) return 'none'
  if (tokens.mode === 'dark') {
    if (surface === 'hero') return '0 22px 56px rgba(0,0,0,0.32), inset 0 1px 0 rgba(190,210,205,0.10)'
    if (surface === 'cta') return '0 16px 32px rgba(0,117,106,0.22), inset 0 1px 0 rgba(190,210,205,0.14)'
    if (surface === 'control') return '0 10px 22px rgba(0,0,0,0.20), inset 0 1px 0 rgba(190,210,205,0.09)'
    return '0 12px 34px rgba(0,0,0,0.28), inset 0 1px 0 rgba(190,210,205,0.08)'
  }
  if (surface === 'hero') return '0 18px 38px rgba(31,92,82,0.05), inset 0 1px 0 rgba(255,255,255,0.84)'
  if (surface === 'cta') return '0 14px 30px rgba(0,117,106,0.18), inset 0 1px 0 rgba(255,255,255,0.62)'
  if (surface === 'control') return '0 10px 22px rgba(31,92,82,0.04), inset 0 1px 0 rgba(255,255,255,0.70)'
  if (surface === 'tile') return '0 10px 22px rgba(31,92,82,0.04), inset 0 1px 0 rgba(255,255,255,0.76)'
  return '0 12px 28px rgba(31,92,82,0.05), inset 0 1px 0 rgba(255,255,255,0.72)'
}

type CustomerAppleIOS26MaterialRole = 'control' | 'field' | 'hero' | 'panel' | 'tile'

function customerAppleIOS26SectionWashSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle, rgba(105,222,198,0.10), rgba(190,210,205,0.026) 44%, transparent 72%)'
    : 'radial-gradient(circle, rgba(76,222,199,0.12), rgba(255,255,255,0.20) 44%, transparent 72%)'

  return {
    backgroundColor: reduceTransparency ? 'transparent' : tokens.mode === 'dark' ? 'rgba(105,222,198,0.055)' : 'rgba(76,222,199,0.075)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
    opacity: reduceTransparency ? 0 : tokens.mode === 'dark' ? 0.055 : 0.070,
  } as any
}

function customerAppleIOS26MaterialSurface(tokens: CustomerThemeTokens, role: CustomerAppleIOS26MaterialRole = 'panel') {
  const reduceTransparency = customerReduceTransparency(tokens)
  const dark = tokens.mode === 'dark'
  const hero = role === 'hero'
  const control = role === 'control'
  const tile = role === 'tile'
  const field = role === 'field'
  const lightGradient = hero
    ? 'radial-gradient(circle at 72% 10%, rgba(0,200,179,0.080), transparent 31%), linear-gradient(180deg, rgba(255,255,255,0.78), rgba(246,248,248,0.60))'
    : control
      ? 'linear-gradient(145deg, rgba(255,255,255,0.74), rgba(246,248,248,0.58))'
      : field
        ? 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,248,248,0.94))'
        : tile
          ? 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(247,248,248,0.92))'
          : 'linear-gradient(180deg, rgba(255,255,255,0.97), rgba(247,248,248,0.94))'
  const darkGradient = hero
    ? 'radial-gradient(circle at 72% 10%, rgba(105,222,198,0.070), transparent 31%), linear-gradient(180deg, rgba(24,31,29,0.82), rgba(17,22,21,0.68))'
    : control
      ? 'linear-gradient(145deg, rgba(31,42,40,0.74), rgba(22,29,27,0.62))'
      : field
        ? 'linear-gradient(180deg, rgba(24,31,29,0.96), rgba(15,20,19,0.92))'
        : tile
          ? 'linear-gradient(180deg, rgba(23,29,27,0.94), rgba(17,22,21,0.90))'
          : 'linear-gradient(180deg, rgba(22,29,27,0.96), rgba(15,20,19,0.92))'

  return {
    backdropFilter: reduceTransparency || (!hero && !control) ? undefined : dark ? 'blur(18px) saturate(1.18)' : 'blur(20px) saturate(1.42)',
    backgroundColor: reduceTransparency
      ? dark ? '#161D1B' : '#FFFFFF'
      : dark
        ? hero ? 'rgba(22,29,27,0.70)' : control ? 'rgba(22,29,27,0.66)' : field ? 'rgba(24,31,29,0.96)' : 'rgba(22,29,27,0.92)'
        : hero ? 'rgba(255,255,255,0.58)' : control ? 'rgba(255,255,255,0.62)' : field ? 'rgba(255,255,255,0.98)' : 'rgba(255,255,255,0.94)',
    borderColor: reduceTransparency
      ? tokens.borderStrong
      : dark
        ? hero || control ? 'rgba(190,210,205,0.14)' : 'rgba(190,210,205,0.10)'
        : hero || control ? 'rgba(255,255,255,0.66)' : 'rgba(20,73,66,0.08)',
    boxShadow: reduceTransparency
      ? 'none'
      : dark
        ? hero
          ? '0 20px 46px rgba(0,0,0,0.30), inset 0 1px 0 rgba(190,210,205,0.10)'
          : control
            ? '0 10px 22px rgba(0,0,0,0.18), inset 0 1px 0 rgba(190,210,205,0.09)'
            : tile
              ? '0 8px 18px rgba(0,0,0,0.18), inset 0 1px 0 rgba(190,210,205,0.055)'
              : '0 12px 28px rgba(0,0,0,0.24), inset 0 1px 0 rgba(190,210,205,0.060)'
        : hero
          ? '0 18px 36px rgba(31,92,82,0.050), inset 0 1px 0 rgba(255,255,255,0.82)'
          : control
            ? '0 10px 20px rgba(31,92,82,0.035), inset 0 1px 0 rgba(255,255,255,0.72)'
            : tile
              ? '0 7px 16px rgba(31,92,82,0.035), inset 0 1px 0 rgba(255,255,255,0.70)'
              : '0 10px 24px rgba(31,92,82,0.045), inset 0 1px 0 rgba(255,255,255,0.72)',
    background: reduceTransparency ? undefined : dark ? darkGradient : lightGradient,
    backgroundImage: reduceTransparency ? undefined : dark ? darkGradient : lightGradient,
    experimental_backgroundImage: reduceTransparency ? undefined : dark ? darkGradient : lightGradient,
    WebkitBackdropFilter: reduceTransparency || (!hero && !control) ? undefined : dark ? 'blur(18px) saturate(1.18)' : 'blur(20px) saturate(1.42)',
  } as any
}

function glassSurface(tokens: CustomerThemeTokens, tone: 'default' | 'strong' | 'warm' | 'service' | 'water' | 'depth' = 'default') {
  const reduceTransparency = customerReduceTransparency(tokens)
  const warmAccent = tokens.mode === 'dark' ? 'rgba(224,160,107,0.10)' : 'rgba(187,116,61,0.08)'
  const mintWash = tokens.mode === 'dark' ? 'rgba(105,222,198,0.075)' : 'rgba(23,169,149,0.070)'
  const waterWash = tokens.mode === 'dark' ? 'rgba(130,221,226,0.070)' : 'rgba(81,187,192,0.070)'
  const backgroundColor =
    tone === 'strong'
      ? tokens.glassStrong
      : tone === 'warm'
        ? tokens.glassWarm
        : tone === 'depth'
          ? tokens.mode === 'dark' ? 'rgba(19,25,24,0.70)' : 'rgba(255,255,255,0.62)'
          : tokens.glass
  const experimentalBackgroundImage =
    tokens.mode === 'dark'
      ? tone === 'warm'
        ? `radial-gradient(circle at 86% 16%, ${warmAccent}, transparent 28%), linear-gradient(145deg, rgba(30,37,34,0.66), rgba(22,29,27,0.50))`
        : tone === 'water'
          ? `radial-gradient(circle at 86% 14%, ${waterWash}, transparent 30%), linear-gradient(145deg, rgba(30,38,35,0.62), rgba(22,29,27,0.50))`
          : `radial-gradient(circle at 86% 14%, ${mintWash}, transparent 30%), linear-gradient(145deg, rgba(30,38,35,0.62), rgba(22,29,27,0.50))`
      : tone === 'warm'
        ? `radial-gradient(circle at 86% 16%, ${warmAccent}, transparent 28%), linear-gradient(145deg, rgba(255,255,255,0.72), rgba(246,248,248,0.48))`
        : tone === 'water'
          ? `radial-gradient(circle at 86% 14%, ${waterWash}, transparent 30%), linear-gradient(145deg, rgba(255,255,255,0.74), rgba(246,248,248,0.50))`
          : `radial-gradient(circle at 86% 14%, ${mintWash}, transparent 30%), linear-gradient(145deg, rgba(255,255,255,0.74), rgba(246,248,248,0.50))`

  return {
    backgroundColor,
    borderColor: tokens.glassBorder,
    boxShadow: reduceTransparency ? 'none' : tone === 'default' || tone === 'strong' ? customerLiquidShadow(tokens, 'panel') : 'none',
    experimental_backgroundImage: reduceTransparency ? undefined : experimentalBackgroundImage,
  }
}

function customerMessageSurface(tokens: CustomerThemeTokens) {
  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(19,43,42,0.96)' : 'rgba(255,253,248,0.96)',
    borderColor: tokens.border,
    boxShadow: 'none',
  }
}

function customerOpaqueSurface(tokens: CustomerThemeTokens) {
  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(23,29,27,0.94)' : 'rgba(255,255,255,0.96)',
    borderColor: tokens.border,
    boxShadow: customerLiquidShadow(tokens, 'panel'),
    experimental_backgroundImage:
      tokens.mode === 'dark'
        ? 'linear-gradient(180deg, rgba(23,29,27,0.96), rgba(17,22,21,0.94))'
        : 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(247,248,248,0.92))',
  }
}

function customerWorkerMintOperationalTileSurface(tokens: CustomerThemeTokens, mintBoost: 'home' | 'standard' = 'standard') {
  const reduceTransparency = customerReduceTransparency(tokens)
  const specularCatch = tokens.mode === 'dark' ? 'rgba(190,210,205,0.026)' : 'rgba(255,255,255,0.58)'
  const homeBoost = mintBoost === 'home'
  const mintAura = tokens.mode === 'dark'
    ? homeBoost ? 'rgba(105,222,198,0.12)' : 'rgba(105,222,198,0.10)'
    : homeBoost ? 'rgba(76,222,199,0.12)' : 'rgba(76,222,199,0.10)'
  const secondaryMintAura = tokens.mode === 'dark'
    ? homeBoost ? 'rgba(105,222,198,0.048)' : 'rgba(105,222,198,0.044)'
    : homeBoost ? 'rgba(76,222,199,0.061)' : 'rgba(76,222,199,0.055)'
  const gradient = tokens.mode === 'dark'
    ? `radial-gradient(circle at 50% 38%, ${mintAura}, transparent 48%), ${homeBoost ? `radial-gradient(circle at 86% 92%, ${secondaryMintAura}, transparent 46%), ` : ''}radial-gradient(circle at 74% 20%, ${specularCatch}, transparent 32%), linear-gradient(180deg, rgba(22,29,27,0.98), rgba(16,24,23,0.92))`
    : `radial-gradient(circle at 50% 38%, ${mintAura}, transparent 48%), ${homeBoost ? `radial-gradient(circle at 86% 92%, ${secondaryMintAura}, transparent 46%), ` : ''}radial-gradient(circle at 74% 20%, ${specularCatch}, transparent 32%), linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,249,248,0.94))`

  return {
    backgroundColor: tokens.mode === 'dark' ? '#16211F' : homeBoost ? '#F8FFFC' : '#FAFFFD',
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.10)' : homeBoost ? 'rgba(20,117,105,0.092)' : 'rgba(20,73,66,0.08)',
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : customerLiquidShadow(tokens, 'tile'),
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function customerWorkerMintPanelSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
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

function customerBookingActiveRequestSurface(tokens: CustomerThemeTokens) {
  return customerHomeActiveDealSurface(tokens)
}

function customerHomeFrameSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const base = customerAppleIOS26MaterialSurface(tokens, 'control')
  const lightGradient = 'radial-gradient(circle at 18% 50%, rgba(76,222,199,0.16), transparent 46%), radial-gradient(circle at 82% 12%, rgba(255,255,255,0.74), transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.96), rgba(244,255,251,0.90))'
  const darkGradient = 'radial-gradient(circle at 18% 50%, rgba(105,222,198,0.10), transparent 48%), radial-gradient(circle at 82% 12%, rgba(230,244,240,0.080), transparent 34%), linear-gradient(180deg, rgba(24,31,29,0.82), rgba(17,24,22,0.72))'
  const gradient = tokens.mode === 'dark' ? darkGradient : lightGradient

  return {
    ...base,
    background: reduceTransparency ? undefined : gradient,
    backgroundColor: reduceTransparency ? tokens.raised : tokens.mode === 'dark' ? 'rgba(22,29,27,0.74)' : '#F9FFFC',
    backgroundImage: reduceTransparency ? undefined : gradient,
    borderColor: reduceTransparency ? tokens.borderStrong : tokens.mode === 'dark' ? 'rgba(190,210,205,0.15)' : 'rgba(255,255,255,0.82)',
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark'
      ? '0 12px 26px rgba(0,0,0,0.22), inset 0 1px 0 rgba(190,210,205,0.10)'
      : '0 12px 26px rgba(31,92,82,0.045), inset 0 1px 0 rgba(255,255,255,0.88)',
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function customerHomeActiveDealSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const lightGradient = 'radial-gradient(circle at 30% 24%, rgba(76,222,199,0.20), transparent 44%), radial-gradient(circle at 88% 84%, rgba(76,222,199,0.10), transparent 48%), radial-gradient(circle at 80% 10%, rgba(255,255,255,0.70), transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.97), rgba(244,255,251,0.92))'
  const darkGradient = 'radial-gradient(circle at 30% 24%, rgba(105,222,198,0.13), transparent 44%), radial-gradient(circle at 88% 84%, rgba(105,222,198,0.06), transparent 48%), radial-gradient(circle at 80% 10%, rgba(230,244,240,0.075), transparent 34%), linear-gradient(180deg, rgba(24,31,29,0.86), rgba(17,24,22,0.76))'
  const gradient = tokens.mode === 'dark' ? darkGradient : lightGradient

  return {
    background: reduceTransparency ? undefined : gradient,
    backgroundColor: reduceTransparency ? tokens.raised : tokens.mode === 'dark' ? 'rgba(22,29,27,0.78)' : '#F8FFFC',
    backgroundImage: reduceTransparency ? undefined : gradient,
    borderColor: reduceTransparency ? tokens.borderStrong : tokens.mode === 'dark' ? 'rgba(190,210,205,0.16)' : 'rgba(20,117,105,0.12)',
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark'
      ? '0 13px 28px rgba(0,0,0,0.24), inset 0 1px 0 rgba(190,210,205,0.10)'
      : '0 12px 26px rgba(31,92,82,0.055), inset 0 1px 0 rgba(255,255,255,0.86)',
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function customerHomeHeroSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const base = customerAppleIOS26MaterialSurface(tokens, 'hero')
  const lightGradient = 'radial-gradient(circle at 82% 8%, rgba(76,222,199,0.12), transparent 34%), radial-gradient(circle at 16% 96%, rgba(255,255,255,0.60), transparent 32%), linear-gradient(180deg, rgba(255,255,255,0.74), rgba(244,255,251,0.60))'
  const darkGradient = 'radial-gradient(circle at 82% 8%, rgba(105,222,198,0.085), transparent 34%), radial-gradient(circle at 16% 96%, rgba(190,210,205,0.045), transparent 32%), linear-gradient(180deg, rgba(24,31,29,0.78), rgba(17,22,21,0.66))'
  const gradient = tokens.mode === 'dark' ? darkGradient : lightGradient

  return {
    ...base,
    background: reduceTransparency ? undefined : gradient,
    backgroundColor: reduceTransparency ? base.backgroundColor : tokens.mode === 'dark' ? 'rgba(22,29,27,0.70)' : 'rgba(255,255,255,0.60)',
    backgroundImage: reduceTransparency ? undefined : gradient,
    borderColor: reduceTransparency ? tokens.borderStrong : tokens.mode === 'dark' ? 'rgba(190,210,205,0.15)' : 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark'
      ? '0 20px 46px rgba(0,0,0,0.30), inset 0 1px 0 rgba(190,210,205,0.10)'
      : '0 18px 38px rgba(31,92,82,0.058), inset 0 1px 0 rgba(255,255,255,0.84)',
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function customerHomePromptSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const lightGradient = 'radial-gradient(circle at 80% 18%, rgba(76,222,199,0.13), transparent 42%), radial-gradient(circle at 12% 0%, rgba(255,255,255,0.72), transparent 32%), linear-gradient(180deg, rgba(255,255,255,0.98), rgba(243,255,251,0.92))'
  const darkGradient = 'radial-gradient(circle at 80% 18%, rgba(105,222,198,0.080), transparent 42%), radial-gradient(circle at 12% 0%, rgba(190,210,205,0.070), transparent 32%), linear-gradient(180deg, rgba(24,31,29,0.96), rgba(15,20,19,0.92))'
  const gradient = tokens.mode === 'dark' ? darkGradient : lightGradient

  return {
    ...customerAppleIOS26MaterialSurface(tokens, 'field'),
    background: reduceTransparency ? undefined : gradient,
    backgroundColor: reduceTransparency ? tokens.raised : tokens.mode === 'dark' ? 'rgba(24,31,29,0.96)' : '#F8FFFC',
    backgroundImage: reduceTransparency ? undefined : gradient,
    borderColor: reduceTransparency ? tokens.borderStrong : tokens.mode === 'dark' ? 'rgba(190,210,205,0.12)' : 'rgba(15,133,118,0.12)',
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark'
      ? '0 8px 18px rgba(0,0,0,0.16), inset 0 1px 0 rgba(190,210,205,0.070)'
      : '0 10px 24px rgba(31,92,82,0.040), inset 0 1px 0 rgba(255,255,255,0.80)',
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function customerHomeControlSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const lightGradient = 'radial-gradient(circle at 50% 44%, rgba(76,222,199,0.10), transparent 54%), radial-gradient(circle at 34% 8%, rgba(255,255,255,0.72), transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.98), rgba(244,252,249,0.92))'
  const darkGradient = 'radial-gradient(circle at 50% 44%, rgba(105,222,198,0.070), transparent 54%), radial-gradient(circle at 34% 8%, rgba(190,210,205,0.090), transparent 34%), linear-gradient(180deg, rgba(25,33,31,0.94), rgba(18,24,22,0.88))'
  const gradient = tokens.mode === 'dark' ? darkGradient : lightGradient

  return {
    ...customerAppleIOS26MaterialSurface(tokens, 'control'),
    background: reduceTransparency ? undefined : gradient,
    backgroundColor: reduceTransparency ? tokens.raised : tokens.mode === 'dark' ? 'rgba(22,29,27,0.66)' : 'rgba(255,255,255,0.66)',
    backgroundImage: reduceTransparency ? undefined : gradient,
    borderColor: reduceTransparency ? tokens.borderStrong : tokens.mode === 'dark' ? 'rgba(190,210,205,0.13)' : 'rgba(15,133,118,0.11)',
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark'
      ? 'inset 0 1px 0 rgba(190,210,205,0.075)'
      : '0 8px 18px rgba(31,92,82,0.030), inset 0 1px 0 rgba(255,255,255,0.80)',
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function customerHomeIconOnlySurface(tokens: CustomerThemeTokens) {
  return {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    boxShadow: 'none',
    experimental_backgroundImage: undefined,
    opacity: tokens.mode === 'dark' ? 0.95 : 1,
  } as any
}

function customerClientAssetBackingSurface(tokens: CustomerThemeTokens, placement: 'inline' | 'shell') {
  const reduceTransparency = customerReduceTransparency(tokens)
  const shell = placement === 'shell'
  const lightGradient = shell
    ? 'radial-gradient(circle at 72% 36%, rgba(76,222,199,0.20), transparent 42%), linear-gradient(145deg, rgba(255,255,255,0.94), rgba(241,254,251,0.72))'
    : 'radial-gradient(circle at 50% 42%, rgba(255,255,255,0.28), transparent 68%)'
  const darkGradient = shell
    ? 'radial-gradient(circle at 72% 36%, rgba(105,222,198,0.10), transparent 44%), linear-gradient(145deg, rgba(190,210,205,0.055), rgba(22,29,27,0.08))'
    : 'radial-gradient(circle at 50% 42%, rgba(230,244,240,0.13), rgba(190,210,205,0.055) 44%, transparent 72%)'

  return {
    backgroundColor: reduceTransparency
      ? tokens.mode === 'dark' ? '#171D1B' : shell ? '#FFFFFF' : 'transparent'
      : tokens.mode === 'dark'
        ? shell ? 'rgba(190,210,205,0.035)' : 'rgba(230,244,240,0.055)'
        : shell ? 'rgba(245,255,252,0.72)' : 'rgba(255,255,255,0.12)',
    background: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
    backgroundImage: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
    borderColor: reduceTransparency
      ? tokens.borderStrong
      : tokens.mode === 'dark'
        ? shell ? 'rgba(190,210,205,0.07)' : 'rgba(190,210,205,0.15)'
        : shell ? 'rgba(20,117,105,0.08)' : 'transparent',
    borderWidth: tokens.mode === 'dark' || shell ? 1 : 0,
    boxShadow: reduceTransparency
      ? 'none'
      : tokens.mode === 'dark'
        ? shell
          ? '0 0 0 5px rgba(105,222,198,0.045), 0 10px 22px rgba(0,0,0,0.12), inset 0 1px 0 rgba(190,210,205,0.06)'
          : 'inset 0 1px 0 rgba(230,244,240,0.08)'
        : shell
          ? '0 0 0 5px rgba(76,222,199,0.070), 0 12px 24px rgba(23,169,149,0.080), inset 0 1px 0 rgba(255,255,255,0.82)'
          : 'none',
    experimental_backgroundImage: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
  } as any
}

function customerClientAssetImageTone(tokens: CustomerThemeTokens) {
  return {
    opacity: tokens.mode === 'dark' ? 0.91 : 1,
    transform: [{ scale: tokens.mode === 'dark' ? 0.985 : 1 }],
  } as any
}

function customerClientAssetSoftenerSurface(tokens: CustomerThemeTokens) {
  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(11,15,14,0.070)' : 'transparent',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.055)' : 'transparent',
  } as any
}

function customerHomeSendSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const lightGradient = `linear-gradient(135deg, ${color.mint.mint500}, ${color.brand.primary})`
  const darkGradient = `linear-gradient(135deg, ${color.mint.mint300}, ${color.brand.primary})`

  return {
    backgroundColor: reduceTransparency ? tokens.primary : tokens.mode === 'dark' ? color.mint.mint300 : color.brand.primary,
    borderColor: reduceTransparency ? tokens.borderStrong : tokens.mode === 'dark' ? 'rgba(190,210,205,0.14)' : 'rgba(255,255,255,0.30)',
    boxShadow: customerLiquidShadow(tokens, 'cta'),
    background: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
    backgroundImage: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
    experimental_backgroundImage: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
  } as any
}

function customerBookingDiagnosisSurface(tokens: CustomerThemeTokens) {
  return customerAppleIOS26MaterialSurface(tokens, 'panel')
}

function customerHistoryHeroSurface(tokens: CustomerThemeTokens) {
  return customerAppleIOS26MaterialSurface(tokens, 'hero')
}

function customerActivityHeroSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const lightGradient = 'radial-gradient(circle at 86% 14%, rgba(23,169,149,0.12), transparent 31%), linear-gradient(135deg, rgba(255,255,255,0.66), rgba(241,255,251,0.52))'
  const darkGradient = 'radial-gradient(circle at 84% 16%, rgba(105,222,198,0.090), transparent 31%), radial-gradient(circle at 24% 8%, rgba(230,244,240,0.080), transparent 34%), linear-gradient(135deg, rgba(28,36,33,0.70), rgba(12,16,15,0.54))'

  return {
    backgroundColor: reduceTransparency ? tokens.raised : tokens.mode === 'dark' ? 'rgba(22,29,27,0.54)' : 'rgba(255,255,255,0.48)',
    borderColor: reduceTransparency ? tokens.borderStrong : tokens.mode === 'dark' ? 'rgba(230,244,240,0.18)' : 'rgba(255,255,255,0.86)',
    borderWidth: 1,
    boxShadow: customerLiquidShadow(tokens, 'hero'),
    background: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
    backgroundImage: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
    experimental_backgroundImage: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
  } as any
}

function customerActivityTimelinePanelSurface(tokens: CustomerThemeTokens) {
  return customerWorkerMintPanelSurface(tokens)
}

function customerHistoryPanelSurface(tokens: CustomerThemeTokens) {
  return customerWorkerMintPanelSurface(tokens)
}

function customerHistoryPriceBoxSurface(tokens: CustomerThemeTokens) {
  return customerAppleIOS26MaterialSurface(tokens, 'tile')
}

function customerHistoryChatBubbleSurface(tokens: CustomerThemeTokens, role: 'kael' | 'other' | 'user') {
  if (role === 'user') {
    return {
      backgroundColor: tokens.mode === 'dark' ? 'rgba(19,70,62,0.90)' : 'rgba(215,251,243,0.94)',
      borderColor: tokens.mode === 'dark' ? tokens.borderStrong : 'rgba(13,134,119,0.16)',
    }
  }

  if (role === 'other') {
    return {
      backgroundColor: tokens.mode === 'dark' ? 'rgba(22,43,40,0.88)' : 'rgba(246,255,252,0.95)',
      borderColor: tokens.mode === 'dark' ? tokens.border : 'rgba(35,96,84,0.16)',
    }
  }

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(30,54,48,0.98)' : 'rgba(255,255,255,0.98)',
    borderColor: tokens.mode === 'dark' ? tokens.borderStrong : 'rgba(8,120,110,0.20)',
  }
}

function customerHistoryMapViewportSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const lightGradient = 'radial-gradient(circle at 72% 18%, rgba(0,200,179,0.055), transparent 34%), linear-gradient(145deg, rgba(250,255,253,0.98), rgba(247,248,248,0.92))'
  const darkGradient = 'radial-gradient(circle at 72% 18%, rgba(105,222,198,0.050), transparent 34%), linear-gradient(145deg, rgba(19,25,24,0.98), rgba(17,22,21,0.92))'

  return {
    backgroundColor: tokens.mode === 'dark' ? tokens.depthSurface : '#F7F8F8',
    borderColor: tokens.border,
    background: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
    backgroundImage: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
    experimental_backgroundImage: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
  } as any
}

function customerActivityEdgeHighlightSurface(tokens: CustomerThemeTokens) {
  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.14)' : 'rgba(255,255,255,0.78)',
  }
}

function customerActivityStatusLensSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(145deg, rgba(31,42,40,0.78), rgba(22,29,27,0.62))'
    : 'linear-gradient(145deg, rgba(255,255,255,0.82), rgba(246,248,248,0.62))'

  return {
    ...customerAppleIOS26MaterialSurface(tokens, 'control'),
    backgroundColor: reduceTransparency ? tokens.raised : tokens.mode === 'dark' ? 'rgba(22,29,27,0.70)' : 'rgba(255,255,255,0.70)',
    borderColor: reduceTransparency ? tokens.borderStrong : tokens.mode === 'dark' ? 'rgba(190,210,205,0.15)' : 'rgba(255,255,255,0.72)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function customerActivityTimelineRailSurface(tokens: CustomerThemeTokens) {
  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.11)' : 'rgba(8,120,110,0.09)',
  }
}

function customerActivityTimelineDotSurface(tokens: CustomerThemeTokens, active: boolean) {
  return {
    backgroundColor: active ? tokens.primary : tokens.mode === 'dark' ? 'rgba(190,210,205,0.18)' : 'rgba(197,226,220,0.92)',
    borderColor: active ? tokens.mode === 'dark' ? 'rgba(190,210,205,0.18)' : 'rgba(255,255,255,0.86)' : tokens.mode === 'dark' ? 'rgba(190,210,205,0.12)' : 'rgba(255,255,255,0.80)',
    boxShadow: active && !customerReduceTransparency(tokens)
      ? tokens.mode === 'dark' ? '0 0 0 5px rgba(105,222,198,0.070)' : '0 0 0 5px rgba(23,169,149,0.080)'
      : 'none',
  } as any
}

function customerHomeServiceTileSurface(tokens: CustomerThemeTokens, tone: SurfaceTone = 'service') {
  void tone
  return customerWorkerMintOperationalTileSurface(tokens, 'home')
}

function customerBookingServiceTileSurface(tokens: CustomerThemeTokens, tone: SurfaceTone = 'service') {
  void tone
  return customerWorkerMintOperationalTileSurface(tokens)
}

function customerSelectedServiceTileSurface(tokens: CustomerThemeTokens, tone: SurfaceTone = 'service') {
  void tone
  return {
    borderColor: tokens.mode === 'dark' ? 'rgba(138,235,217,0.34)' : 'rgba(13,134,119,0.30)',
    boxShadow: tokens.glassHighlight === 'transparent' && tokens.glassShadow === 'none'
      ? 'none'
      : tokens.mode === 'dark'
        ? '0 12px 24px rgba(0,0,0,0.22)'
        : '0 12px 24px rgba(9,121,106,0.12)',
  }
}

function customerHomeShortcutSurface(tokens: CustomerThemeTokens, tone: SurfaceTone = 'service') {
  void tone
  return customerWorkerMintOperationalTileSurface(tokens, 'home')
}

function customerMintPillSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
  return tokens.mode === 'dark'
    ? { backgroundColor: tokens.service, borderColor: tokens.borderStrong }
    : { backgroundColor: reduceTransparency ? '#DCFBF3' : 'rgba(232,252,247,0.78)', borderColor: 'rgba(23,169,149,0.16)' }
}

function customerDockInactiveTint(tokens: CustomerThemeTokens) {
  return tokens.mode === 'dark' ? 'rgba(190,210,205,0.62)' : 'rgba(92,106,102,0.72)'
}

function customerDockMainClusterSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 18% 8%, rgba(190,210,205,0.070), transparent 32%), radial-gradient(circle at 80% 102%, rgba(255,255,255,0.035), transparent 42%), linear-gradient(180deg, rgba(31,42,40,0.24), rgba(22,29,27,0.075))'
    : 'radial-gradient(circle at 18% 8%, rgba(255,255,255,0.36), transparent 34%), radial-gradient(circle at 84% 108%, rgba(255,255,255,0.10), transparent 42%), linear-gradient(180deg, rgba(255,255,255,0.060), rgba(255,255,255,0.012))'

  return {
    backdropFilter: reduceTransparency ? undefined : tokens.mode === 'dark' ? 'blur(22px) saturate(1.22) contrast(1.03)' : 'blur(24px) saturate(1.76) contrast(1.04)',
    backgroundColor: reduceTransparency
      ? tokens.mode === 'dark' ? '#161D1B' : '#FFFFFF'
      : tokens.mode === 'dark' ? 'rgba(22,29,27,0.20)' : 'rgba(255,255,255,0.028)',
    backgroundImage: reduceTransparency ? undefined : gradient,
    borderColor: reduceTransparency ? tokens.borderStrong : tokens.mode === 'dark' ? 'rgba(190,210,205,0.16)' : 'rgba(255,255,255,0.72)',
    boxShadow: reduceTransparency
      ? 'none'
      : tokens.mode === 'dark'
        ? '0 13px 28px rgba(0,0,0,0.20), inset 0 1px 0 rgba(190,210,205,0.14), inset 0 -1px 0 rgba(190,210,205,0.035)'
        : '0 8px 18px rgba(31,92,82,0.025), 0 2px 8px rgba(255,255,255,0.24), inset 0 1px 0 rgba(255,255,255,0.86), inset 0 -1px 0 rgba(20,73,66,0.025)',
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
    WebkitBackdropFilter: reduceTransparency ? undefined : tokens.mode === 'dark' ? 'blur(22px) saturate(1.22) contrast(1.03)' : 'blur(24px) saturate(1.76) contrast(1.04)',
  } as any
}

function customerDockKaelActionSurface(tokens: CustomerThemeTokens, active: boolean) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const gradient = tokens.mode === 'dark'
    ? active
      ? 'radial-gradient(circle at 32% 14%, rgba(190,210,205,0.18), transparent 34%), radial-gradient(circle at 72% 78%, rgba(255,255,255,0.060), transparent 44%), linear-gradient(145deg, rgba(31,42,40,0.22), rgba(22,29,27,0.070))'
      : 'radial-gradient(circle at 32% 14%, rgba(190,210,205,0.14), transparent 34%), radial-gradient(circle at 72% 78%, rgba(255,255,255,0.045), transparent 44%), linear-gradient(145deg, rgba(31,42,40,0.18), rgba(22,29,27,0.060))'
    : active
      ? 'radial-gradient(circle at 30% 12%, rgba(255,255,255,0.94), transparent 36%), radial-gradient(circle at 72% 78%, rgba(255,255,255,0.24), transparent 44%), linear-gradient(145deg, rgba(255,255,255,0.30), rgba(255,255,255,0.080))'
      : 'radial-gradient(circle at 30% 12%, rgba(255,255,255,0.82), transparent 36%), radial-gradient(circle at 72% 78%, rgba(255,255,255,0.18), transparent 44%), linear-gradient(145deg, rgba(255,255,255,0.22), rgba(255,255,255,0.060))'

  return {
    backdropFilter: reduceTransparency ? undefined : tokens.mode === 'dark' ? 'blur(22px) saturate(1.18)' : 'blur(24px) saturate(1.64) contrast(1.04)',
    backgroundColor: reduceTransparency
      ? tokens.mode === 'dark' ? '#161D1B' : '#FFFFFF'
      : tokens.mode === 'dark'
        ? active ? 'rgba(31,42,40,0.22)' : 'rgba(31,42,40,0.18)'
        : active ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.16)',
    backgroundImage: reduceTransparency ? undefined : gradient,
    borderColor: reduceTransparency
      ? tokens.borderStrong
      : tokens.mode === 'dark'
        ? active ? 'rgba(190,210,205,0.24)' : 'rgba(190,210,205,0.18)'
        : active ? 'rgba(255,255,255,0.94)' : 'rgba(255,255,255,0.84)',
    boxShadow: reduceTransparency
      ? 'none'
      : tokens.mode === 'dark'
        ? '0 14px 26px rgba(0,0,0,0.18), inset 0 1px 0 rgba(190,210,205,0.18), inset 0 -1px 0 rgba(190,210,205,0.04)'
        : '0 0 0 1px rgba(255,255,255,0.58), 0 10px 20px rgba(31,92,82,0.024), 0 2px 10px rgba(255,255,255,0.28), inset 0 1px 0 rgba(255,255,255,0.96), inset 0 -1px 0 rgba(20,73,66,0.035)',
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
    WebkitBackdropFilter: reduceTransparency ? undefined : tokens.mode === 'dark' ? 'blur(22px) saturate(1.18)' : 'blur(24px) saturate(1.64) contrast(1.04)',
  } as any
}

function customerDockKaelActionEdgeSurface(tokens: CustomerThemeTokens) {
  return {
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.20)' : 'rgba(255,255,255,0.92)',
    boxShadow: tokens.mode === 'dark'
      ? '0 0 0 1px rgba(190,210,205,0.07), inset 0 1px 0 rgba(190,210,205,0.16), inset 0 -1px 0 rgba(190,210,205,0.035)'
      : '0 0 0 1px rgba(255,255,255,0.58), inset 0 1px 0 rgba(255,255,255,0.92), inset 0 -1px 0 rgba(20,73,66,0.030)',
  } as any
}

function customerDockKaelActionAuraSurface(tokens: CustomerThemeTokens, active: boolean) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle, rgba(190,210,205,0.10), rgba(255,255,255,0.026) 48%, transparent 76%)'
    : 'radial-gradient(circle, rgba(255,255,255,0.34), rgba(255,255,255,0.080) 48%, transparent 76%)'

  return {
    backgroundColor: reduceTransparency
      ? 'transparent'
      : tokens.mode === 'dark'
        ? active ? 'rgba(190,210,205,0.070)' : 'rgba(190,210,205,0.045)'
        : active ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.080)',
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function customerProfileHeroSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const lightGradient = 'radial-gradient(circle at 86% 14%, rgba(23,169,149,0.12), transparent 31%), linear-gradient(135deg, rgba(255,255,255,0.66), rgba(241,255,251,0.52))'
  const darkGradient = 'radial-gradient(circle at 84% 16%, rgba(105,222,198,0.090), transparent 31%), radial-gradient(circle at 24% 8%, rgba(230,244,240,0.080), transparent 34%), linear-gradient(135deg, rgba(28,36,33,0.70), rgba(12,16,15,0.54))'

  return {
    backgroundColor: reduceTransparency ? (tokens.mode === 'dark' ? '#161D1B' : '#F8FFFC') : tokens.mode === 'dark' ? 'rgba(22,29,27,0.54)' : 'rgba(255,255,255,0.48)',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.18)' : 'rgba(255,255,255,0.86)',
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : customerLiquidShadow(tokens, 'hero'),
    background: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
    backgroundImage: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
    experimental_backgroundImage: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
  } as any
}

function customerProfilePanelSurface(tokens: CustomerThemeTokens) {
  return customerWorkerMintPanelSurface(tokens)
}

function customerProfileCareCardSurface(tokens: CustomerThemeTokens) {
  return customerWorkerMintPanelSurface(tokens)
}

function customerProfileCarePillSurface(tokens: CustomerThemeTokens) {
  return customerProfileRowIconSurface(tokens)
}

function customerProfileCareStatSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const lightGradient = 'radial-gradient(circle at 50% 0%, rgba(255,255,255,0.96), transparent 48%), linear-gradient(145deg, rgba(255,255,255,0.82), rgba(232,255,249,0.48))'
  const darkGradient = 'radial-gradient(circle at 50% 0%, rgba(230,244,240,0.070), transparent 48%), linear-gradient(145deg, rgba(230,244,240,0.055), rgba(13,17,16,0.54))'
  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(22,29,27,0.54)' : 'rgba(255,255,255,0.58)',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.12)' : 'rgba(255,255,255,0.72)',
    boxShadow: reduceTransparency
      ? 'none'
      : tokens.mode === 'dark'
        ? 'inset 0 1px 0 rgba(230,244,240,0.10), 0 14px 24px rgba(0,0,0,0.26)'
        : 'inset 0 1px 0 rgba(255,255,255,0.86), 0 12px 24px rgba(17,70,61,0.08)',
    background: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
    backgroundImage: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
    experimental_backgroundImage: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
  } as any
}

function customerProfileRowSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const lightGradient = 'linear-gradient(180deg, rgba(255,255,255,0.72), rgba(230,255,248,0.30))'
  const darkGradient = 'linear-gradient(180deg, rgba(230,244,240,0.040), rgba(105,222,198,0.016))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.020)' : 'rgba(255,255,255,0.42)',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.065)' : 'rgba(16,131,115,0.070)',
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? 'inset 0 1px 0 rgba(230,244,240,0.050)' : 'inset 0 1px 0 rgba(255,255,255,0.66)',
    background: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
    backgroundImage: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
    experimental_backgroundImage: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
  } as any
}

function customerProfileRowIconSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 72% 36%, rgba(105,222,198,0.10), transparent 44%), linear-gradient(145deg, rgba(190,210,205,0.055), rgba(22,29,27,0.08))'
    : 'radial-gradient(circle at 72% 36%, rgba(76,222,199,0.20), transparent 42%), linear-gradient(145deg, rgba(255,255,255,0.94), rgba(241,254,251,0.72))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.035)' : 'rgba(245,255,252,0.72)',
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.07)' : 'rgba(20,117,105,0.08)',
    boxShadow: reduceTransparency
      ? 'none'
      : tokens.mode === 'dark'
        ? '0 0 0 4px rgba(105,222,198,0.040), inset 0 1px 0 rgba(190,210,205,0.06)'
        : '0 0 0 4px rgba(76,222,199,0.060), inset 0 1px 0 rgba(255,255,255,0.82)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function customerProfileInputSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const gradient = tokens.mode === 'dark'
    ? 'linear-gradient(180deg, rgba(230,244,240,0.040), rgba(105,222,198,0.016))'
    : 'linear-gradient(180deg, rgba(255,255,255,0.72), rgba(230,255,248,0.30))'

  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.024)' : 'rgba(255,255,255,0.50)',
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.082)' : 'rgba(16,131,115,0.090)',
    borderWidth: 1,
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? 'inset 0 1px 0 rgba(230,244,240,0.055)' : 'inset 0 1px 0 rgba(255,255,255,0.66)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function customerProfileSegmentSurface(tokens: CustomerThemeTokens, active: boolean) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const activeGradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 50% 38%, rgba(105,222,198,0.10), transparent 48%), linear-gradient(180deg, rgba(22,29,27,0.98), rgba(16,24,23,0.92))'
    : 'radial-gradient(circle at 50% 38%, rgba(76,222,199,0.10), transparent 48%), linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,249,248,0.94))'
  const inactiveGradient = tokens.mode === 'dark'
    ? 'linear-gradient(180deg, rgba(230,244,240,0.024), rgba(105,222,198,0.010))'
    : 'linear-gradient(180deg, rgba(255,255,255,0.54), rgba(230,255,248,0.20))'

  return {
    backgroundColor: active
      ? tokens.mode === 'dark' ? '#16211F' : '#FAFFFD'
      : tokens.mode === 'dark' ? 'rgba(230,244,240,0.020)' : 'rgba(255,255,255,0.42)',
    borderColor: active
      ? tokens.mode === 'dark' ? 'rgba(138,235,217,0.34)' : 'rgba(13,134,119,0.30)'
      : tokens.mode === 'dark' ? 'rgba(230,244,240,0.060)' : 'rgba(16,131,115,0.070)',
    boxShadow: reduceTransparency
      ? 'none'
      : active
        ? tokens.mode === 'dark' ? '0 8px 18px rgba(0,0,0,0.18), inset 0 1px 0 rgba(190,210,205,0.08)' : '0 8px 18px rgba(9,121,106,0.08), inset 0 1px 0 rgba(255,255,255,0.78)'
        : 'none',
    background: reduceTransparency ? undefined : active ? activeGradient : inactiveGradient,
    backgroundImage: reduceTransparency ? undefined : active ? activeGradient : inactiveGradient,
    experimental_backgroundImage: reduceTransparency ? undefined : active ? activeGradient : inactiveGradient,
  } as any
}

function customerProfileVerificationSurface(tokens: CustomerThemeTokens) {
  return customerWorkerMintOperationalTileSurface(tokens)
}

function customerProfilePrimaryButtonSurface(tokens: CustomerThemeTokens) {
  const reduceTransparency = customerReduceTransparency(tokens)
  const gradient = tokens.mode === 'dark'
    ? 'radial-gradient(circle at 36% 8%, rgba(255,255,255,0.16), transparent 35%), linear-gradient(180deg, #63E6D0, #40CDB8)'
    : 'radial-gradient(circle at 36% 8%, rgba(255,255,255,0.34), transparent 35%), linear-gradient(180deg, #0E8D7D, #087F70)'

  return {
    backgroundColor: tokens.mode === 'dark' ? '#63E6D0' : '#087F70',
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.18)' : 'rgba(255,255,255,0.42)',
    boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? '0 10px 22px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.16)' : '0 10px 22px rgba(9,121,106,0.13), inset 0 1px 0 rgba(255,255,255,0.30)',
    background: reduceTransparency ? undefined : gradient,
    backgroundImage: reduceTransparency ? undefined : gradient,
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as any
}

function customerProfileSecondaryButtonSurface(tokens: CustomerThemeTokens) {
  return customerProfileInputSurface(tokens)
}

function customerIconSurface(tokens: CustomerThemeTokens, tone: SurfaceTone = 'service') {
  void tone
  const reduceTransparency = customerReduceTransparency(tokens)
  const lightGradient = 'radial-gradient(circle at 72% 36%, rgba(76,222,199,0.20), transparent 42%), linear-gradient(145deg, rgba(255,255,255,0.94), rgba(241,254,251,0.72))'
  const darkGradient = 'radial-gradient(circle at 72% 36%, rgba(105,222,198,0.10), transparent 44%), linear-gradient(145deg, rgba(190,210,205,0.055), rgba(22,29,27,0.08))'
  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.035)' : 'rgba(245,255,252,0.72)',
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.07)' : 'rgba(20,117,105,0.08)',
    boxShadow: reduceTransparency
      ? 'none'
      : tokens.mode === 'dark'
        ? '0 0 0 5px rgba(105,222,198,0.045), 0 10px 22px rgba(0,0,0,0.12), inset 0 1px 0 rgba(190,210,205,0.06)'
        : '0 0 0 5px rgba(76,222,199,0.070), 0 12px 24px rgba(23,169,149,0.080), inset 0 1px 0 rgba(255,255,255,0.82)',
    background: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
    backgroundImage: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
    experimental_backgroundImage: reduceTransparency ? undefined : tokens.mode === 'dark' ? darkGradient : lightGradient,
  } as any
}

function SubtleGlassHighlight() {
  const tokens = useCustomerTokens()
  if (tokens.glassHighlight === 'transparent') return null
  return <View pointerEvents="none" style={[styles.glassTopHighlight, { backgroundColor: tokens.glassHighlight }]} />
}

function ProfileLiquidChrome({ testID, variant }: { testID?: string; variant: 'care' | 'hero' | 'panel' }) {
  const tokens = useCustomerTokens()
  const reduceTransparency = customerReduceTransparency(tokens)
  const sheenColor = tokens.mode === 'dark' ? 'rgba(230,244,240,0.12)' : 'rgba(255,255,255,0.64)'
  const lensColor = tokens.mode === 'dark' ? 'rgba(105,222,198,0.18)' : 'rgba(105,222,198,0.20)'
  const outerEdgeSurface = customerProfileChromeCrispShellSurface(tokens, variant)
  const innerInsetSurface = customerProfileChromeInnerInsetSurface(tokens, variant)
  const topGlintSurface = customerProfileChromeTopEdgeSurface(tokens)
  const bottomEdgeSurface = customerProfileChromeBottomEdgeSurface(tokens)
  const lensStyle = variant === 'hero'
    ? styles.profileHeroLiquidLens
    : variant === 'care'
      ? styles.profileCareLiquidLens
      : styles.profilePanelLiquidLens
  const sheenStyle = variant === 'hero'
    ? styles.profileHeroLiquidSheen
    : variant === 'care'
      ? styles.profileCareLiquidSheen
      : styles.profilePanelLiquidSheen
  const edgeStyle = variant === 'hero'
    ? styles.profileHeroLiquidEdge
    : variant === 'care'
      ? styles.profileCareLiquidEdge
      : styles.profilePanelLiquidEdge

  return (
    <>
      <SubtleGlassHighlight />
      {reduceTransparency ? null : (
        <>
          {variant === 'hero' ? null : <View pointerEvents="none" style={[lensStyle, { backgroundColor: lensColor }]} testID={testID} />}
          <View pointerEvents="none" style={[styles.profileLiquidSheen, sheenStyle, { backgroundColor: sheenColor }]} />
          <View pointerEvents="none" style={[styles.profileLiquidOuterEdge, edgeStyle, outerEdgeSurface]} />
          <View pointerEvents="none" style={[styles.profileLiquidInnerEdge, innerInsetSurface]} />
          <View pointerEvents="none" style={[styles.profileLiquidTopGlint, topGlintSurface]} />
          <View pointerEvents="none" style={[styles.profileLiquidBottomEdge, bottomEdgeSurface]} />
        </>
      )}
    </>
  )
}

function customerProfileChromeRadius(variant: 'care' | 'hero' | 'panel') {
  if (variant === 'hero') return 30
  return 29
}

function customerProfileChromeInsetRadius(variant: 'care' | 'hero' | 'panel') {
  return Math.max(customerProfileChromeRadius(variant) - 4, 15)
}

function customerProfileChromeCrispShellSurface(tokens: CustomerThemeTokens, variant: 'care' | 'hero' | 'panel') {
  return {
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.19)' : 'rgba(255,255,255,0.88)',
    borderRadius: customerProfileChromeRadius(variant),
    boxShadow: tokens.mode === 'dark'
      ? 'inset 0 1px 0 rgba(230,244,240,0.15), inset 0 -1px 0 rgba(105,222,198,0.045)'
      : 'inset 0 1px 0 rgba(255,255,255,0.96), inset 0 -1px 0 rgba(9,121,106,0.13)',
  } as any
}

function customerProfileChromeInnerInsetSurface(tokens: CustomerThemeTokens, variant: 'care' | 'hero' | 'panel') {
  return {
    borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.085)' : 'rgba(9,121,106,0.075)',
    borderRadius: customerProfileChromeInsetRadius(variant),
    boxShadow: tokens.mode === 'dark'
      ? 'inset 0 1px 0 rgba(190,210,205,0.060)'
      : 'inset 0 1px 0 rgba(255,255,255,0.72)',
  } as any
}

function customerProfileChromeTopEdgeSurface(tokens: CustomerThemeTokens) {
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

function customerProfileChromeBottomEdgeSurface(tokens: CustomerThemeTokens) {
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

function SubtleLiquidLight({ testID, variant = 'soft' }: { testID?: string; variant?: 'profile' | 'rim' | 'soft' | 'tab' }) {
  const tokens = useCustomerTokens()
  const style = variant === 'rim'
    ? styles.liquidCardRim
    : variant === 'tab'
      ? styles.liquidTabLight
      : styles.liquidCardLight
  return <View pointerEvents="none" style={[style, { backgroundColor: tokens.aqua }]} testID={testID} />
}

function IconGlyph({ name, color, accent }: { name: IconName; color: string; accent: string }) {
  if (name === 'boltPanel') {
    return (
      <Svg width={28} height={28} viewBox="0 0 28 28" fill="none">
        <Rect x={7.5} y={5} width={13} height={18} rx={4} stroke={color} strokeWidth={1.9} />
        <Path d="M11.5 11h5M11.5 15.5h5" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
        <Path d="m15 8-3 8h3l-2 5 5-8h-3l2-5Z" fill={accent} opacity={0.9} />
      </Svg>
    )
  }

  if (name === 'waterPipe') {
    return (
      <Svg width={29} height={29} viewBox="0 0 29 29" fill="none">
        <Path d="M7 9.5h9c3 0 5 2 5 5V20" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M6 22c3-2 5.8 2 9 0 2-1.2 4-1.2 6 0" stroke={accent} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={7.5} cy={9.5} r={3} fill={accent} opacity={0.16} />
      </Svg>
    )
  }

  if (name === 'plug') {
    return (
      <Svg width={28} height={28} viewBox="0 0 28 28" fill="none">
        <Path d="M10.2 6.2v5.6M17.8 6.2v5.6" stroke={accent} strokeWidth={1.9} strokeLinecap="round" />
        <Path d="M8.8 11.6h10.4v3.5a5.2 5.2 0 0 1-10.4 0v-3.5Z" stroke={color} strokeWidth={1.9} strokeLinejoin="round" />
        <Path d="M14 20.3v2.4" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
      </Svg>
    )
  }

  if (name === 'faucet') {
    return (
      <Svg width={29} height={29} viewBox="0 0 29 29" fill="none">
        <Path d="M6.4 9.4h7.4c2.6 0 4.5 1.8 4.5 4.4v1.1" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M8.4 6.6h5.5M11.2 6.6v2.8M6.2 12.8h5" stroke={accent} strokeWidth={1.9} strokeLinecap="round" />
        <Path d="M18.3 16c1.3 1.3 2 2.3 2 3.2a2 2 0 0 1-4 0c0-.9.7-1.9 2-3.2Z" stroke={accent} strokeWidth={1.9} strokeLinejoin="round" />
      </Svg>
    )
  }

  if (name === 'broom') {
    return (
      <Svg width={29} height={29} viewBox="0 0 29 29" fill="none">
        <Path d="M18.5 6.2 11 15" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
        <Path d="m10 14.6 4.8 4" stroke={accent} strokeWidth={1.9} strokeLinecap="round" />
        <Path d="M8.4 16 14 20.7l-1.4 1.6c-1.6.7-3.4.5-5.4-.5l-1.5-1.2L8.4 16Z" stroke={color} strokeWidth={1.9} strokeLinejoin="round" />
        <Path d="m7.2 20 2.6 2.1" stroke={accent} strokeWidth={1.9} strokeLinecap="round" />
      </Svg>
    )
  }

  if (name === 'cleaning') {
    return (
      <Svg width={29} height={29} viewBox="0 0 29 29" fill="none">
        <Path d="M17.5 5.5 8 23" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
        <Path d="M15.5 9.5h5.2c1.2 0 2 .8 2 2v1.2c0 1.2-.8 2-2 2h-8.4" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M9.2 20.5c2.2 1.8 5.5 1.8 8.1 0M7 23.2c3.2 2 8.6 2 12 0" stroke={accent} strokeWidth={1.9} strokeLinecap="round" />
        <Circle cx={21.5} cy={6.5} r={2.2} fill={accent} opacity={0.2} />
      </Svg>
    )
  }

  if (name === 'apartment') {
    return (
      <Svg width={26} height={26} viewBox="0 0 26 26" fill="none">
        <Path d="M5.5 12.5 13 6l7.5 6.5v7.2c0 1-.8 1.8-1.8 1.8H7.3c-1 0-1.8-.8-1.8-1.8v-7.2Z" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M11 21.5v-5h4v5" stroke={accent} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    )
  }

  if (name === 'person') {
    return (
      <Svg width={26} height={26} viewBox="0 0 26 26" fill="none">
        <Path d="M7.5 20c.9-2.5 2.9-3.8 5.5-3.8s4.6 1.3 5.5 3.8" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
        <Circle cx={13} cy={9.5} r={3.3} stroke={color} strokeWidth={1.9} />
      </Svg>
    )
  }

  if (name === 'phone') {
    return (
      <Svg width={26} height={26} viewBox="0 0 26 26" fill="none">
        <Path d="M18.8 20.2c-4.9-.3-9.6-4.9-10-9.8-.1-1.1.7-2 1.8-2h2.1c.8 0 1.5.5 1.7 1.3l.4 1.6c.2.7 0 1.4-.5 1.9l-.8.8c.8 1.5 2 2.7 3.5 3.5l.8-.8c.5-.5 1.2-.7 1.9-.5l1.6.4c.8.2 1.3.9 1.3 1.7v2c0 1.1-.8 1.9-1.9 1.9h-1.9Z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M8.8 5.8h4" stroke={accent} strokeWidth={1.8} strokeLinecap="round" />
      </Svg>
    )
  }

  if (name === 'chat') {
    return (
      <Svg width={25} height={25} viewBox="0 0 25 25" fill="none">
        <Path d="M6.5 6.5h12c1 0 1.8.8 1.8 1.8v7.2c0 1-.8 1.8-1.8 1.8h-6l-4 3v-3h-2c-1 0-1.8-.8-1.8-1.8V8.3c0-1 .8-1.8 1.8-1.8Z" stroke={color} strokeWidth={1.9} strokeLinejoin="round" />
        <Path d="M9.5 11h6" stroke={accent} strokeWidth={1.8} strokeLinecap="round" />
      </Svg>
    )
  }

  if (name === 'clock') {
    return (
      <Svg width={25} height={25} viewBox="0 0 25 25" fill="none">
        <Path d="M12.5 7.7v5l3 1.8" stroke={accent} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M20.5 12.5a8 8 0 1 1-8-8" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M16.8 5.3c1 .6 1.9 1.5 2.5 2.5" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
      </Svg>
    )
  }

  if (name === 'chevron') {
    return (
      <Svg width={25} height={25} viewBox="0 0 25 25" fill="none">
        <Path d="m9.5 6.5 6 6-6 6" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    )
  }

  if (name === 'external') {
    return (
      <Svg width={25} height={25} viewBox="0 0 25 25" fill="none">
        <Path d="M7.5 17.5 17.5 7.5" stroke={color} strokeWidth={2} strokeLinecap="round" />
        <Path d="M8 7.5h9.5V17" stroke={accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    )
  }

  if (name === 'send') {
    return (
      <Svg width={25} height={25} viewBox="0 0 25 25" fill="none">
        <Path d="M5.4 12.8 19.4 5.8l-4.3 13.4-3.1-5.2-6.6-1.2Z" stroke={color} strokeWidth={1.9} strokeLinejoin="round" />
      </Svg>
    )
  }

  if (name === 'payment') {
    return (
      <Svg width={25} height={25} viewBox="0 0 25 25" fill="none">
        <Path d="M5.4 9.5 12.5 5l7.1 4.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M7 10.5h11M8.2 10.5v6.2M12.5 10.5v6.2M16.8 10.5v6.2M6.5 18.5h12" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
        <Path d="M12.5 7.8h.1" stroke={accent} strokeWidth={3} strokeLinecap="round" />
      </Svg>
    )
  }

  if (name === 'ticket') {
    return (
      <Svg width={25} height={25} viewBox="0 0 25 25" fill="none">
        <Path d="M5.8 8.5c0-1 .8-1.8 1.8-1.8h9.8c1 0 1.8.8 1.8 1.8v2.2a2 2 0 0 0 0 3.6v2.2c0 1-.8 1.8-1.8 1.8H7.6c-1 0-1.8-.8-1.8-1.8v-2.2a2 2 0 0 0 0-3.6V8.5Z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
        <Path d="M9.4 12.5h6.2" stroke={accent} strokeWidth={1.8} strokeLinecap="round" />
      </Svg>
    )
  }

  if (name === 'privacy' || name === 'check') {
    return (
      <Svg width={25} height={25} viewBox="0 0 25 25" fill="none">
        <Path d="M12.5 4.8 18.5 7v4.6c0 3.6-2.2 6.5-6 7.7-3.8-1.2-6-4.1-6-7.7V7l6-2.2Z" stroke={color} strokeWidth={1.8} />
        <Path d="m10 12.2 1.6 1.6 3.5-4" stroke={accent} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    )
  }

  if (name === 'moon') {
    return (
      <Svg width={25} height={25} viewBox="0 0 25 25" fill="none">
        <Path d="M14.6 4.7a7.4 7.4 0 1 0 5.7 9.8 6.4 6.4 0 0 1-7.8-7.8 7 7 0 0 1 2.1-2Z" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M17.8 5.8h.1" stroke={accent} strokeWidth={3} strokeLinecap="round" />
      </Svg>
    )
  }

  if (name === 'menu') {
    return (
      <Svg width={25} height={25} viewBox="0 0 25 25" fill="none">
        <Path d="M5.8 7.4h13.4M5.8 12.5h9.2M5.8 17.6h13.4" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
        <Path d="M17.4 12.5h1.8" stroke={accent} strokeWidth={2.2} strokeLinecap="round" />
      </Svg>
    )
  }

  return (
    <Svg width={25} height={25} viewBox="0 0 25 25" fill="none">
      <Rect x={6} y={6} width={13} height={13} rx={3.2} stroke={color} strokeWidth={1.9} />
      <Path d="M9.5 11h6M9.5 15h4" stroke={accent} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  v4Scroll: {
    gap: 12,
    paddingHorizontal: customerFrameHorizontalPadding,
  },
  hiddenMarker: {
    height: 0,
    opacity: 0,
    position: 'absolute',
    width: 0,
  },
  pressed: {
    opacity: 0.78,
  },
  kaelErrorText: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    paddingHorizontal: 6,
  },
  glassTopHighlight: {
    height: 1,
    left: 16,
    opacity: 0.82,
    position: 'absolute',
    right: 16,
    top: 0,
    zIndex: 0,
  },
  glassSheen: {
    height: '170%',
    left: -72,
    opacity: 0.42,
    position: 'absolute',
    top: -46,
    transform: [{ rotate: '11deg' }],
    width: 58,
    zIndex: 0,
  },
  glassRing: {
    borderRadius: 999,
    borderWidth: 2,
    height: 88,
    opacity: 0.88,
    position: 'absolute',
    right: -30,
    top: 34,
    width: 88,
  },
  liquidCardLight: {
    borderRadius: 999,
    height: 164,
    opacity: 0.18,
    position: 'absolute',
    right: -54,
    top: -48,
    width: 164,
    zIndex: 0,
  },
  liquidCardRim: {
    borderRadius: 999,
    height: 138,
    opacity: 0.12,
    position: 'absolute',
    right: -44,
    top: -40,
    width: 138,
    zIndex: 0,
  },
  liquidTabLight: {
    borderRadius: 999,
    height: 64,
    opacity: 0.16,
    position: 'absolute',
    right: 18,
    top: 3,
    width: 112,
    zIndex: 0,
  },
  profileLiquidOuterEdge: {
    borderCurve: 'continuous',
    borderWidth: 1,
    bottom: 0,
    left: 0,
    opacity: 0.94,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 3,
  },
  profileLiquidInnerEdge: {
    borderCurve: 'continuous',
    borderWidth: 1,
    bottom: 4,
    left: 4,
    opacity: 0.56,
    position: 'absolute',
    right: 4,
    top: 4,
    zIndex: 3,
  },
  profileLiquidTopGlint: {
    borderRadius: 999,
    height: 1,
    left: 18,
    opacity: 0.92,
    position: 'absolute',
    right: 18,
    top: 1,
    zIndex: 4,
  },
  profileLiquidBottomEdge: {
    borderRadius: 999,
    bottom: 1,
    height: 1,
    left: 20,
    opacity: 0.60,
    position: 'absolute',
    right: 20,
    zIndex: 4,
  },
  profileLiquidSheen: {
    borderRadius: 999,
    opacity: 0.72,
    position: 'absolute',
    transform: [{ rotate: '13deg' }],
    zIndex: 0,
  },
  profileHeroLiquidSheen: {
    bottom: -46,
    left: 30,
    top: -48,
    width: 42,
  },
  profileCareLiquidSheen: {
    bottom: -56,
    left: 52,
    top: -60,
    width: 50,
  },
  profilePanelLiquidSheen: {
    bottom: -44,
    left: 28,
    top: -44,
    width: 34,
  },
  profileHeroLiquidEdge: {
    borderRadius: 30,
  },
  profileCareLiquidEdge: {
    borderRadius: 29,
  },
  profilePanelLiquidEdge: {
    borderRadius: 29,
  },
  profileHeroLiquidLens: {
    borderRadius: 999,
    height: 142,
    opacity: 0.60,
    position: 'absolute',
    right: -46,
    top: -32,
    width: 184,
    zIndex: 0,
  },
  profileCareLiquidLens: {
    borderRadius: 999,
    height: 142,
    opacity: 0.18,
    position: 'absolute',
    right: -46,
    top: -32,
    width: 184,
    zIndex: 0,
  },
  profilePanelLiquidLens: {
    borderRadius: 999,
    height: 118,
    opacity: 0.16,
    position: 'absolute',
    right: -42,
    top: -28,
    width: 162,
    zIndex: 0,
  },
  motionSweep: {
    bottom: -40,
    position: 'absolute',
    top: -40,
    width: 44,
    zIndex: 24,
  },
  customerMotionField: {
    borderRadius: 999,
    height: 112,
    left: '50%',
    position: 'absolute',
    top: 76,
    transform: [{ translateX: -56 }],
    width: 112,
    zIndex: 0,
  },
  ambientGlassField: {
    bottom: 0,
    overflow: 'hidden',
    position: 'absolute',
    top: 0,
    zIndex: 0,
  },
  ambientMintWash: {
    borderRadius: 34,
    height: 182,
    opacity: 0.12,
    position: 'absolute',
    right: -108,
    top: 128,
    transform: [{ rotate: '-8deg' }],
    width: 218,
  },
  ambientWarmWash: {
    borderRadius: 30,
    bottom: 150,
    height: 130,
    left: -74,
    opacity: 0.08,
    position: 'absolute',
    transform: [{ rotate: '12deg' }],
    width: 180,
  },
  ambientGlassLine: {
    height: 1,
    left: -20,
    opacity: 0.15,
    position: 'absolute',
    top: 300,
    width: 360,
  },
  dockWrap: {
    minHeight: customerDockHeight,
    position: 'absolute',
    zIndex: 30,
  },
  dockGlassAura: {
    borderRadius: 999,
    bottom: -14,
    height: 70,
    left: 18,
    position: 'absolute',
    right: 18,
    zIndex: -1,
  },
  dockWarmAura: {
    borderRadius: 999,
    bottom: -6,
    height: 46,
    opacity: 0.11,
    position: 'absolute',
    right: -12,
    width: 88,
    zIndex: -1,
  },
  customerDockSplitRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    minHeight: Math.max(customerDockHeight, customerDockKaelActionOuterSize),
    position: 'relative',
    width: '100%',
    zIndex: 2,
  },
  glassDock: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 28,
    borderWidth: 1,
    boxShadow: '0 7px 16px rgba(13,70,65,0.035), inset 0 1px 0 rgba(255,255,255,0.58)',
    flexDirection: 'row',
    gap: 0,
    height: customerDockHeight,
    justifyContent: 'space-around',
    minHeight: customerDockHeight,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 3,
    position: 'relative',
  },
  customerDockMainCluster: {
    flexShrink: 1,
  },
  customerDockKaelActionPressable: {
    alignItems: 'center',
    flexShrink: 0,
    height: customerDockKaelActionOuterSize,
    justifyContent: 'center',
    width: customerDockKaelActionOuterSize,
    zIndex: 2,
  },
  customerDockKaelActionGlass: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: customerDockKaelActionRadius,
    borderWidth: 1,
    gap: 0,
    height: customerDockKaelActionSize,
    justifyContent: 'center',
    overflow: 'hidden',
    paddingBottom: customerDockKaelActionPaddingBottom,
    paddingTop: customerDockKaelActionPaddingTop,
    position: 'relative',
    width: customerDockKaelActionSize,
  },
  customerDockKaelActionEdge: {
    borderCurve: 'continuous',
    borderRadius: customerDockKaelActionRadius,
    borderWidth: 1,
    bottom: 1,
    left: 1,
    position: 'absolute',
    right: 1,
    top: 1,
    zIndex: 1,
  },
  customerDockKaelActionAura: {
    borderRadius: 999,
    height: customerDockKaelActionAuraSize,
    opacity: 0.50,
    position: 'absolute',
    right: customerDockKaelActionAuraOffsetRight,
    top: customerDockKaelActionAuraOffsetTop,
    width: customerDockKaelActionAuraSize,
    zIndex: 0,
  },
  customerDockKaelActionGlyph: {
    alignItems: 'center',
    flexShrink: 0,
    height: customerDockKaelActionGlyphHeight,
    justifyContent: 'center',
    width: customerDockKaelActionGlyphWidth,
    zIndex: 2,
  },
  customerDockKaelActionLabel: {
    fontSize: customerDockKaelActionLabelFontSize,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: customerDockKaelActionLabelLineHeight,
    zIndex: 2,
  },
  dockBottomReflection: {
    borderRadius: 999,
    bottom: 8,
    height: 15,
    left: 36,
    opacity: 0.16,
    position: 'absolute',
    right: 36,
    zIndex: 0,
  },
  dockMotionSheen: {
    bottom: -18,
    position: 'absolute',
    top: -18,
    width: 44,
    zIndex: 0,
  },
  dockItem: {
    alignItems: 'center',
    borderRadius: 21,
    flex: 1,
    height: 50,
    justifyContent: 'center',
    position: 'relative',
    zIndex: 2,
  },
  dockItemActive: {
    transform: [{ translateY: -1 }],
  },
  dockDot: {
    borderRadius: 999,
    bottom: 6,
    height: 4,
    position: 'absolute',
    width: 4,
  },
  dockKaelImage: {
    height: 29,
    width: 29,
  },
  v4Content: {
    minHeight: 760,
    position: 'relative',
  },
  customerSectionLiquidWash: {
    borderRadius: 999,
    height: 218,
    opacity: 0.14,
    position: 'absolute',
    right: -104,
    top: 44,
    width: 218,
    zIndex: 0,
  },
  profileSectionMintWash: {
    height: 268,
    opacity: 0.08,
    right: -132,
    top: 10,
    width: 278,
  },
  profileSectionGlassSlab: {
    borderBottomLeftRadius: 132,
    borderCurve: 'continuous',
    borderTopLeftRadius: 36,
    height: 292,
    opacity: 0.055,
    position: 'absolute',
    right: -88,
    top: -2,
    transform: [{ rotate: '-7deg' }],
    width: 182,
    zIndex: 0,
  },
  homeTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingBottom: 10,
    paddingHorizontal: 2,
  },
  titleBlock: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  screenTitle: {
    fontSize: 24,
    ...customerWorkerTypography.screenTitle,
    lineHeight: 29,
  },
  plainContent: {
    gap: 12,
    position: 'relative',
  },
  historyDoneStack: {
    gap: 16,
    paddingTop: 2,
  },
  presenceMapCard: {
    borderRadius: 30,
    borderWidth: 1,
    gap: 14,
    overflow: 'hidden',
    padding: 15,
  },
  presenceMapCardCompact: {
    borderRadius: 26,
    gap: 11,
    padding: 12,
  },
  presenceMapViewport: {
    borderCurve: 'continuous',
    borderRadius: 28,
    borderWidth: 1,
    minHeight: 156,
    overflow: 'hidden',
    position: 'relative',
  },
  presenceMapViewportCompact: {
    borderRadius: 24,
    minHeight: 144,
  },
  presenceMapHud: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    left: 12,
    position: 'absolute',
    right: 12,
    top: 10,
    zIndex: 6,
  },
  presenceMapControl: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    maxWidth: '56%',
    minHeight: 32,
    paddingHorizontal: 10,
  },
  presenceMapControlText: {
    fontSize: 11,
    ...customerWorkerTypography.label,
    lineHeight: 14,
  },
  presenceBadge: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    maxWidth: '58%',
    minHeight: 42,
    paddingHorizontal: 10,
    position: 'absolute',
    zIndex: 4,
  },
  presenceBadgeHome: {
    left: 14,
    top: 58,
  },
  presenceBadgeText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  presenceBadgeWorker: {
    bottom: 36,
    right: 14,
  },
  mapBackdrop: {
    bottom: 0,
    left: 0,
    opacity: 0.76,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  mapGlow: {
    borderRadius: 999,
    height: 132,
    left: '50%',
    opacity: 0.34,
    position: 'absolute',
    top: 34,
    transform: [{ translateX: -59 }],
    width: 132,
  },
  mapRoute: {
    borderRadius: 999,
    height: 10,
    left: 60,
    opacity: 0.5,
    position: 'absolute',
    top: 72,
    transformOrigin: 'left center',
    width: 226,
  },
  mapRouteSoft: {
    borderRadius: 999,
    height: 44,
    left: 52,
    opacity: 0.12,
    position: 'absolute',
    top: 54,
    transform: [{ rotate: '-19deg' }],
    width: 240,
  },
  mapVehicle: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    left: '50%',
    overflow: 'hidden',
    position: 'absolute',
    top: 62,
    width: 42,
    zIndex: 2,
  },
  mapLine: {
    height: 1,
    opacity: 0.34,
    position: 'absolute',
    width: 280,
  },
  mapLineOne: {
    top: 38,
    transform: [{ rotate: '-10deg' }],
  },
  mapLineTwo: {
    right: -40,
    top: 88,
    transform: [{ rotate: '25deg' }],
  },
  mapLineThree: {
    left: -28,
    top: 130,
    transform: [{ rotate: '-32deg' }],
  },
  mapRoom: {
    borderRadius: 18,
    borderWidth: 2,
    opacity: 0.42,
    position: 'absolute',
  },
  mapRoomOne: {
    height: 86,
    left: 42,
    top: 24,
    width: 136,
  },
  mapRoomTwo: {
    height: 84,
    right: 35,
    top: 68,
    width: 132,
  },
  mapRoomThree: {
    height: 76,
    left: 68,
    top: 120,
    width: 186,
  },
  mapPin: {
    borderRadius: 999,
    borderWidth: 3,
    height: 18,
    left: '50%',
    opacity: 0.9,
    position: 'absolute',
    top: 66,
    transform: [{ translateX: -9 }],
    width: 18,
  },
  mapNode: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    opacity: 0.95,
    position: 'absolute',
    width: 44,
  },
  mapNodeElectric: {
    left: 50,
    top: 50,
  },
  mapNodeWater: {
    right: 52,
    top: 100,
  },
  searchPill: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    boxShadow: 'none',
    flexDirection: 'row',
    gap: 10,
    marginTop: 0,
    minHeight: 52,
    overflow: 'hidden',
    paddingHorizontal: 14,
  },
  searchText: {
    flex: 1,
    fontSize: 15,
    ...customerWorkerTypography.body,
  },
  homeMapSpace: {
    height: 112,
  },
  homeSheet: {
    boxShadow: 'none',
    gap: 16,
    marginTop: 12,
    minHeight: 620,
    padding: 0,
  },
  homeHeroStack: {
    gap: 16,
  },
  homeAddressCard: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    minHeight: 62,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  homeAddressCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  homeAddressValue: {
    fontSize: 16,
    ...customerWorkerTypography.label,
    lineHeight: 20,
  },
  homeAddressMeta: {
    fontSize: 12,
    ...customerWorkerTypography.body,
    lineHeight: 15,
  },
  homeCommandHero: {
    borderRadius: 28,
    borderWidth: 1,
    boxShadow: '0 18px 38px rgba(21,89,78,0.08)',
    minHeight: 214,
    overflow: 'hidden',
    padding: 16,
  },
  homeCommandHitArea: {
    flex: 1,
    gap: 12,
    minHeight: 176,
    position: 'relative',
  },
  homeCommandHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minWidth: 0,
    position: 'relative',
    zIndex: 2,
  },
  homeCommandCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  homeCommandOpen: {
    alignItems: 'center',
    borderRadius: 17,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  homeCommandTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 23,
  },
  homeCommandSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 16,
  },
  homeCommandBody: {
    fontSize: 14,
    ...customerWorkerTypography.body,
    lineHeight: 20,
    position: 'relative',
    zIndex: 2,
  },
  homeCommandContext: {
    alignItems: 'center',
    borderRadius: 19,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    minHeight: 48,
    overflow: 'hidden',
    paddingHorizontal: 11,
    paddingVertical: 7,
    position: 'relative',
    zIndex: 2,
  },
  homeCommandContextCopy: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  homeCommandContextLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 14,
  },
  homeCommandContextValue: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 17,
  },
  homeCommandComposer: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 58,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 8,
    position: 'relative',
    zIndex: 2,
  },
  homeCommandComposerText: {
    flex: 1,
    fontSize: 14,
    ...customerWorkerTypography.body,
    lineHeight: 18,
    minWidth: 0,
  },
  homeCommandPrompt: {
    borderRadius: 22,
    borderWidth: 1,
    gap: 10,
    minHeight: 80,
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingVertical: 10,
    position: 'relative',
    zIndex: 2,
  },
  homeCommandPromptActions: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  homeCommandPromptInput: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderWidth: 0,
    boxShadow: 'none',
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 19,
    minHeight: 38,
    minWidth: 0,
    outlineColor: 'transparent',
    outlineOffset: 0,
    outlineStyle: 'none',
    outlineWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    textAlignVertical: 'top',
  } as any,
  homeCommandAttach: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: 10,
  },
  homeCommandAttachText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
  },
  homeCommandSend: {
    alignItems: 'center',
    borderRadius: 17,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 56,
    paddingHorizontal: 15,
  },
  homeCommandSendText: {
    fontSize: 13,
    ...customerWorkerTypography.label,
  },
  twoCol: {
    flexDirection: 'row',
    gap: 10,
  },
  serviceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  serviceMeta: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 14,
    marginTop: 2,
    textAlign: 'center',
  },
  smallChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  smallChipText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
  },
  bookingCheckPanel: {
    borderRadius: 22,
    borderWidth: 1,
    gap: 10,
    overflow: 'hidden',
    padding: 15,
    position: 'relative',
  },
  bookingStack: {
    gap: 16,
    minHeight: 0,
    position: 'relative',
  },
  bookingTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  bookingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    position: 'relative',
    zIndex: 1,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  priceBox: {
    borderRadius: 20,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    gap: 6,
    minHeight: 74,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  priceBoxLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 14,
  },
  activityPriceBoxLabel: {
    fontWeight: '700',
  },
  priceBoxValue: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 19,
  },
  activityPriceBoxValue: {
    fontWeight: '500',
  },
  bookingCheckRow: {
    alignItems: 'center',
    borderBottomColor: 'rgba(35,96,84,0.08)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 9,
    minHeight: 34,
  },
  bookingCheckDot: {
    borderRadius: 999,
    height: 9,
    width: 9,
  },
  bookingCheckText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    minWidth: 0,
  },
  bookingCheckMeta: {
    fontSize: 12,
    fontWeight: '600',
    maxWidth: 96,
    textAlign: 'right',
  },
  bookingDiagnosisPanel: {
    borderRadius: 22,
    borderWidth: 1,
    gap: 8,
    minHeight: 98,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  bookingDiagnosisPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 34,
    paddingHorizontal: 11,
  },
  bookingDiagnosisPillText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
  },
  bookingDiagnosisBody: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 20,
  },
  historyHeroPanel: {
    borderCurve: 'continuous',
    borderRadius: 28,
    borderWidth: 1,
    gap: 14,
    minHeight: 168,
    overflow: 'hidden',
    padding: 16,
    position: 'relative',
  },
  activityHeroPanel: {
    borderRadius: 32,
    gap: 15,
    minHeight: 184,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  activityHeroTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minHeight: 42,
    position: 'relative',
    zIndex: 2,
  },
  activityHeroCopy: {
    flex: 1,
    gap: 4,
    justifyContent: 'center',
    minHeight: 42,
    minWidth: 0,
  },
  activityHeroTitle: {
    fontSize: 20,
    lineHeight: 24,
  },
  activityMaterialEdge: {
    borderRadius: 999,
    height: 1,
    left: 18,
    opacity: 0.78,
    position: 'absolute',
    right: 18,
    top: 1,
    zIndex: 1,
  },
  activityStatusLens: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 0,
    justifyContent: 'center',
    maxWidth: 126,
    minHeight: 34,
    overflow: 'hidden',
    paddingHorizontal: 12,
    position: 'relative',
    zIndex: 2,
  },
  activityStatusText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 15,
  },
  historyHeroPanelCompact: {
    gap: 10,
    padding: 14,
  },
  historyHeroBody: {
    fontSize: 13,
    ...customerWorkerTypography.body,
    lineHeight: 19,
  },
  historyHeroBodyCompact: {
    fontSize: 12,
    lineHeight: 17,
  },
  historyHeroActions: {
    flexDirection: 'row',
    gap: 10,
  },
  historyCheckPanel: {
    borderRadius: 26,
    borderWidth: 1,
    gap: 14,
    overflow: 'hidden',
    padding: 16,
    position: 'relative',
  },
  matchingScoreDial: {
    alignItems: 'center',
    borderRadius: 26,
    borderWidth: 1,
    flexShrink: 0,
    gap: 3,
    justifyContent: 'center',
    minHeight: 86,
    overflow: 'hidden',
    paddingHorizontal: 14,
    width: 104,
  },
  matchingScoreHero: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: 12,
  },
  matchingScoreHeroCopy: {
    flex: 1,
    minWidth: 0,
  },
  matchingScoreLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 14,
  },
  matchingScorePanel: {
    gap: 13,
  },
  matchingScoreValue: {
    fontSize: 27,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 32,
  },
  workerQuoteHeader: {
    alignItems: 'flex-start',
    gap: 5,
  },
  workerQuotePanel: {
    borderRadius: 22,
    borderWidth: 1,
    gap: 10,
    minHeight: 188,
    overflow: 'hidden',
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  historyThreadCard: {
    borderRadius: 26,
    borderWidth: 1,
    gap: 14,
    overflow: 'hidden',
    padding: 16,
    position: 'relative',
  },
  historyChatFeed: {
    gap: 11,
  },
  historyChatEmptyCue: {
    alignSelf: 'flex-end',
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: '84%',
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  historyChatCueText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 16,
  },
  historyChatComposer: {
    borderRadius: 20,
    minHeight: 54,
    padding: 6,
  },
  chatPreviewCard: {
    borderRadius: 20,
    borderWidth: 1,
    gap: 5,
    overflow: 'hidden',
    padding: 12,
  },
  chatPreviewKaelBubble: {
    alignSelf: 'flex-start',
    maxWidth: '92%',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  chatPreviewUserBubble: {
    alignSelf: 'flex-end',
    maxWidth: '88%',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  historyDisclaimerText: {
    fontSize: 12,
    ...customerWorkerTypography.body,
    lineHeight: 17,
  },
  homeShortcutGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  homeTileIconStage: {
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  homeShortcutTile: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    gap: 7,
    justifyContent: 'center',
    minHeight: 84,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  homeShortcutCopy: {
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: 3,
    minWidth: 0,
  },
  homeShortcutTitle: {
    fontSize: 16,
    ...customerWorkerTypography.label,
    lineHeight: 17,
    textAlign: 'center',
  },
  homeShortcutMeta: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 15,
    textAlign: 'center',
  },
  homeTrustNote: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    minHeight: 82,
    overflow: 'hidden',
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  homeTrustCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  homeTrustTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 18,
  },
  homeTrustBody: {
    fontSize: 12,
    ...customerWorkerTypography.body,
    lineHeight: 17,
  },
  homeServicesBlock: {
    gap: 10,
    marginTop: 18,
  },
  homeServicesTitle: {
    fontSize: 18,
    ...customerWorkerTypography.sectionTitle,
    lineHeight: 22,
  },
  homeServicesMeta: {
    fontSize: 12,
    ...customerWorkerTypography.label,
    lineHeight: 16,
  },
  serviceCard: {
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    boxShadow: '0 10px 22px rgba(17,70,61,0.07)',
    flexBasis: '31%',
    flex: 1,
    gap: 7,
    justifyContent: 'center',
    minHeight: 94,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  serviceCardHome: {
    alignItems: 'center',
    borderRadius: 22,
    gap: 9,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  serviceCardCompact: {
    borderRadius: 22,
    gap: 6,
    minHeight: 76,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  serviceTitle: {
    fontSize: 14,
    ...customerWorkerTypography.label,
    lineHeight: 16,
    textAlign: 'center',
  },
  serviceTitleHome: {
    alignSelf: 'stretch',
    fontWeight: '700',
    lineHeight: 15,
    textAlign: 'center',
  },
  sectionTitle: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionHeading: {
    fontSize: 18,
    ...customerWorkerTypography.sectionTitle,
  },
  sectionMeta: {
    fontSize: 12,
    ...customerWorkerTypography.body,
  },
  smallServiceGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  smallService: {
    alignItems: 'center',
    borderRadius: 21,
    borderWidth: 1,
    flex: 1,
    gap: 8,
    minHeight: 78,
    overflow: 'hidden',
    paddingHorizontal: 5,
    paddingVertical: 9,
  },
  smallServiceText: {
    fontSize: 10,
    ...customerWorkerTypography.body,
  },
  paymentRail: {
    borderRadius: 24,
    borderWidth: 1,
    boxShadow: 'none',
    gap: 10,
    minHeight: 128,
    overflow: 'hidden',
    padding: 13,
  },
  paymentWarmHalo: {
    borderRadius: 999,
    height: 88,
    opacity: 0.12,
    position: 'absolute',
    right: -26,
    top: -24,
    width: 88,
  },
  paymentOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  paymentOption: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 62,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 9,
  },
  paymentIconBubble: {
    alignItems: 'center',
    borderRadius: 15,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  paymentCopy: {
    flex: 1,
    gap: 2,
  },
  paymentTitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0,
  },
  paymentMeta: {
    fontSize: 11,
    ...customerWorkerTypography.body,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 31,
  },
  cardHeadline: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0,
  },
  bubbleKicker: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0,
  },
  ticketCard: {
    borderRadius: 26,
    borderWidth: 1,
    gap: 12,
    overflow: 'hidden',
    padding: 14,
  },
  ticketCell: {
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    gap: 5,
    minHeight: 68,
    overflow: 'hidden',
    padding: 12,
  },
  reportTicketCell: {
    borderRadius: 18,
    flexBasis: '47%',
    flexGrow: 1,
    gap: 4,
    minHeight: 66,
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  ticketLabel: {
    fontSize: 11,
    ...customerWorkerTypography.body,
  },
  activityTicketLabel: {
    fontWeight: '700',
  },
  reportTicketLabel: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  ticketValue: {
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    letterSpacing: 0,
  },
  activityTicketValue: {
    fontWeight: '500',
  },
  reportTicketValue: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
  },
  composer: {
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    boxShadow: 'none',
    flexDirection: 'row',
    gap: 8,
    minHeight: 58,
    overflow: 'hidden',
    padding: 7,
  },
  composerInput: {
    flex: 1,
    flexShrink: 1,
    fontSize: 15,
    ...customerWorkerTypography.body,
    minWidth: 0,
    minHeight: 40,
    paddingHorizontal: 8,
  },
  sendButton: {
    alignItems: 'center',
    borderRadius: 17,
    flexShrink: 0,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  flowCard: {
    borderRadius: 22,
    borderWidth: 1,
    boxShadow: 'none',
    gap: 12,
    overflow: 'hidden',
    padding: 14,
  },
  flowCardCompact: {
    gap: 4,
    padding: 8,
  },
  historyReportCard: {
    borderCurve: 'continuous',
    borderRadius: 26,
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  historyReportHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    minHeight: 24,
  },
  historyReportTitle: {
    flex: 1,
    fontSize: 18,
    lineHeight: 23,
    minWidth: 0,
  },
  historyReportBadge: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 15,
  },
  historyReportBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  historyReportGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  historyTimelineCard: {
    paddingVertical: 16,
  },
  activityTimelineCard: {
    borderCurve: 'continuous',
    borderRadius: 30,
    gap: 2,
    paddingHorizontal: 18,
    paddingVertical: 17,
    position: 'relative',
  },
  historyDoneTimelineCard: {
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  timelineRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 32,
  },
  activityTimelineRow: {
    gap: 12,
    minHeight: 52,
    position: 'relative',
    zIndex: 2,
  },
  activityTimelineRail: {
    borderRadius: 999,
    bottom: 31,
    left: 23,
    position: 'absolute',
    top: 34,
    width: 2,
    zIndex: 0,
  },
  activityTimelineMarker: {
    alignItems: 'center',
    flexShrink: 0,
    width: 14,
  },
  activityTimelineDot: {
    borderWidth: 2,
    height: 13,
    width: 13,
  },
  activityTimelineCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  timelineRowDone: {
    gap: 11,
    minHeight: 36,
  },
  timelineRowCompact: {
    gap: 8,
    minHeight: 18,
  },
  timelineDot: {
    borderRadius: 999,
    height: 10,
    width: 10,
  },
  timelineDotCompact: {
    height: 8,
    width: 8,
  },
  timelineText: {
    fontSize: 13,
    ...customerWorkerTypography.body,
  },
  timelineTextCompact: {
    fontSize: 12,
    lineHeight: 14,
  },
  workerCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  workerActions: {
    gap: 8,
    minWidth: 112,
  },
  workerAvatar: {
    borderRadius: 18,
    borderWidth: 1,
    height: 48,
    width: 48,
  },
  workerMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  workerMetaPill: {
    borderRadius: 999,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  reviewRatingButton: {
    alignItems: 'center',
    borderRadius: 999,
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  evidenceTile: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 76,
    overflow: 'hidden',
  },
  evidenceText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0,
  },
  profileHead: {
    borderRadius: 28,
    borderWidth: 1,
    gap: 12,
    overflow: 'hidden',
    padding: 15,
  },
  profilePrototypeHero: {
    borderCurve: 'continuous',
    borderRadius: 30,
    borderWidth: 1,
    gap: 14,
    minHeight: 114,
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingVertical: 17,
    position: 'relative',
  },
  profilePrototypeTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    position: 'relative',
    zIndex: 4,
  },
  profilePrototypeTitleRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 12,
    minWidth: 0,
  },
  profilePrototypeTitleCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  profilePrototypeTitle: {
    fontSize: 24,
    ...customerWorkerTypography.screenTitle,
    lineHeight: 29,
  },
  profileIdentityRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    minWidth: 0,
  },
  profileActionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  profileName: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0,
    minWidth: 0,
  },
  statusCard: {
    borderRadius: 28,
    borderWidth: 1,
    boxShadow: 'none',
    gap: 26,
    minHeight: 154,
    overflow: 'hidden',
    padding: 18,
  },
  statusAccentTile: {
    borderRadius: 28,
    height: 140,
    opacity: 0.2,
    position: 'absolute',
    right: -34,
    top: 20,
    transform: [{ rotate: '-10deg' }],
    width: 140,
  },
  statusTitle: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 31,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 14,
  },
  metric: {
    flex: 1,
    gap: 5,
  },
  metricLabel: {
    fontSize: 11,
    ...customerWorkerTypography.body,
  },
  metricValue: {
    fontSize: 16,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    letterSpacing: 0,
  },
  quickGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  quickCard: {
    borderRadius: 22,
    borderWidth: 1,
    flex: 1,
    gap: 12,
    minHeight: 88,
    overflow: 'hidden',
    padding: 13,
  },
  quickTitle: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 18,
  },
  listCard: {
    borderRadius: 24,
    borderWidth: 1,
    gap: 0,
    overflow: 'hidden',
    padding: 6,
    position: 'relative',
  },
  profileGlassListCard: {
    borderCurve: 'continuous',
    borderRadius: 29,
    gap: 8,
    paddingHorizontal: 13,
    paddingVertical: 14,
  },
  profileListSectionTitle: {
    fontSize: 11,
    ...customerWorkerTypography.label,
    lineHeight: 14,
    paddingHorizontal: 6,
    paddingBottom: 2,
    position: 'relative',
    zIndex: 2,
  },
  profileActions: {
    borderCurve: 'continuous',
    borderRadius: 29,
    overflow: 'hidden',
  },
  profileCareWideWrap: {
    marginHorizontal: -5,
    overflow: 'visible',
  },
  profileCareCard: {
    borderCurve: 'continuous',
    borderRadius: 29,
    borderWidth: 1,
    gap: 11,
    minHeight: 146,
    overflow: 'hidden',
    paddingHorizontal: 15,
    paddingVertical: 15,
    position: 'relative',
  },
  profileCareHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    position: 'relative',
    zIndex: 2,
  },
  profileCareTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 21,
    minWidth: 0,
  },
  profileCareStats: {
    borderRadius: 18,
    flexDirection: 'row',
    gap: 8,
    position: 'relative',
    zIndex: 2,
  },
  profileCareStat: {
    alignItems: 'center',
    borderRadius: 15,
    borderWidth: 1,
    flex: 1,
    gap: 5,
    justifyContent: 'center',
    minHeight: 74,
    paddingHorizontal: 6,
    paddingVertical: 7,
  },
  profileCareStatIcon: {
    alignItems: 'center',
    borderRadius: 13,
    borderWidth: 1,
    flexShrink: 0,
    height: 31,
    justifyContent: 'center',
    width: 31,
  },
  profileCareStatCopy: {
    alignItems: 'center',
    gap: 2,
    minWidth: 0,
  },
  profileCareStatLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 13,
    textAlign: 'center',
  },
  profileCareStatValue: {
    fontSize: 12.5,
    ...customerWorkerTypography.label,
    lineHeight: 15,
    maxWidth: 84,
    textAlign: 'center',
  },
  profileInsightPanel: {
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
    minHeight: 148,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  profileInsightHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  profileInsightHeaderCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  profileInsightTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 20,
  },
  profileInsightSubtitle: {
    fontSize: 11.5,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 16,
  },
  profileInsightStatusDot: {
    borderRadius: 999,
    height: 10,
    width: 10,
  },
  profileInsightStats: {
    flexDirection: 'row',
    gap: 8,
  },
  profileInsightStat: {
    alignItems: 'center',
    borderRadius: 15,
    borderWidth: 1,
    flex: 1,
    gap: 5,
    justifyContent: 'center',
    minHeight: 78,
    paddingHorizontal: 6,
    paddingVertical: 7,
  },
  profileInsightStatLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 13,
    maxWidth: 82,
    textAlign: 'center',
  },
  profileInsightStatValue: {
    fontSize: 12.5,
    ...customerWorkerTypography.label,
    lineHeight: 15,
    maxWidth: 84,
    textAlign: 'center',
  },
  profileInsightProgress: {
    gap: 7,
  },
  profileInsightProgressMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  profileInsightProgressLabel: {
    flex: 1,
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 13,
  },
  profileInsightProgressValue: {
    fontSize: 11.5,
    ...customerWorkerTypography.label,
    lineHeight: 14,
  },
  profileInsightProgressTrack: {
    borderRadius: 999,
    height: 7,
    overflow: 'hidden',
  },
  profileInsightProgressFill: {
    borderRadius: 999,
    height: '100%',
  },
  profileInsightEmpty: {
    fontSize: 11.5,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 16,
  },
  profileEditorScrim: {
    backgroundColor: 'rgba(8,20,17,0.28)',
    flex: 1,
    justifyContent: 'flex-end',
    padding: 16,
  },
  profileEditorSheet: {
    borderRadius: 28,
    borderWidth: 1,
    gap: 12,
    overflow: 'hidden',
    padding: 16,
    position: 'relative',
  },
  profileEditorTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 22,
    position: 'relative',
    zIndex: 2,
  },
  profileEditorHelper: {
    fontSize: 12.5,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 17,
    position: 'relative',
    zIndex: 2,
  },
  profileEditorInput: {
    borderCurve: 'continuous',
    borderRadius: 18,
    borderWidth: 1,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 20,
    minHeight: 52,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 12,
    position: 'relative',
    zIndex: 2,
  },
  profileEditorInputMultiline: {
    minHeight: 92,
  },
  feedbackInput: {
    minHeight: 132,
  },
  passwordField: {
    gap: 6,
  },
  passwordFieldLabel: {
    fontSize: 12.5,
    ...customerWorkerTypography.label,
    lineHeight: 16,
  },
  profileEditorError: {
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 16,
  },
  profileEditorButtonRow: {
    flexDirection: 'row',
    gap: 10,
    position: 'relative',
    zIndex: 2,
  },
  profileEditorButton: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 14,
  },
  profileEditorPrimaryButton: {
    boxShadow: '0 12px 24px rgba(41,173,151,0.18)',
  },
  profileEditorSecondaryButton: {
    boxShadow: 'none',
  },
  profileEditorPrimaryText: {
    fontSize: 14,
    ...customerWorkerTypography.label,
    lineHeight: 17,
  },
  profileEditorSecondaryText: {
    fontSize: 14,
    ...customerWorkerTypography.label,
    lineHeight: 17,
  },
  accountInfoSheet: {
    borderRadius: 30,
    borderWidth: 1,
    gap: 10,
    maxHeight: '88%',
    overflow: 'hidden',
    paddingBottom: 14,
    paddingHorizontal: 14,
    paddingTop: 10,
    position: 'relative',
  },
  accountInfoHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 42,
    position: 'relative',
    zIndex: 2,
  },
  accountInfoBackButton: {
    alignItems: 'center',
    borderRadius: 999,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  accountInfoBackText: {
    fontSize: 28,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 30,
  },
  accountInfoTitle: {
    flex: 1,
    fontSize: 16,
    ...customerWorkerTypography.label,
    lineHeight: 20,
    textAlign: 'center',
  },
  accountInfoHeaderSpacer: {
    width: 38,
  },
  accountInfoFields: {
    gap: 8,
    paddingBottom: 4,
    paddingTop: 2,
  },
  accountInfoField: {
    borderCurve: 'continuous',
    borderRadius: 18,
    borderWidth: 1,
    gap: 6,
    minHeight: 76,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 11,
    position: 'relative',
    zIndex: 2,
  },
  accountInfoFieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 16,
  },
  accountInfoFieldInput: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 19,
    minHeight: 30,
    paddingHorizontal: 0,
    paddingVertical: 2,
  },
  accountInfoSegmentRow: {
    flexDirection: 'row',
    gap: 8,
    minHeight: 38,
  },
  accountInfoSegmentButton: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 10,
  },
  accountInfoSegmentText: {
    fontSize: 12,
    ...customerWorkerTypography.label,
    lineHeight: 15,
  },
  accountInfoNote: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 15,
    paddingTop: 10,
  },
  accountInfoVerification: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    minHeight: 64,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 10,
    position: 'relative',
    zIndex: 2,
  },
  accountInfoVerificationCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  accountInfoVerificationTitle: {
    fontSize: 13,
    ...customerWorkerTypography.label,
    lineHeight: 17,
  },
  accountInfoVerificationBody: {
    fontSize: 11.5,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 15,
  },
  accountInfoSaveButton: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 999,
    borderWidth: 1,
    boxShadow: '0 12px 24px rgba(41,173,151,0.18)',
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 14,
    position: 'relative',
    zIndex: 2,
  },
  listRow: {
    alignItems: 'center',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 9,
    minHeight: 48,
    paddingHorizontal: 10,
    paddingVertical: 7,
    position: 'relative',
    zIndex: 2,
  },
  profileListRow: {
    borderCurve: 'continuous',
    borderRadius: 16,
    minHeight: 58,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  profileRowIconStage: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 14,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    overflow: 'visible',
    width: 32,
  },
  listCopy: {
    flex: 1,
    gap: 3,
  },
  profileListCopy: {
    gap: 3,
    minWidth: 0,
  },
  listTitle: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0,
  },
  profileListTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  listMeta: {
    fontSize: 13,
    ...customerWorkerTypography.body,
  },
  profileListMeta: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 15,
    maxWidth: '100%',
    textAlign: 'left',
  },
  listMetaCompact: {
    fontSize: 11,
    lineHeight: 13,
  },
  disabled: {
    opacity: 0.56,
  },
  chevron: {
    fontSize: 24,
    fontWeight: '400',
    letterSpacing: 0,
  },
  switchTrack: {
    borderRadius: 999,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: 3,
    width: 62,
  },
  switchKnob: {
    borderRadius: 999,
    height: 26,
    width: 26,
  },
  themeToggle: {
    borderRadius: 999,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: 3,
    width: 60,
  },
  themeKnob: {
    borderRadius: 999,
    height: 24,
    width: 24,
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 48,
  },
  iconShell: {
    alignItems: 'center',
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  clientImageIconShell: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    boxShadow: 'none',
    overflow: 'visible',
  },
  clientImageIconStage: {
    alignItems: 'center',
    flexShrink: 0,
    justifyContent: 'center',
    overflow: 'visible',
    position: 'relative',
  },
  clientImageIcon: {
    flexShrink: 0,
    position: 'relative',
    zIndex: 2,
  },
  clientImageAssetBacking: {
    borderRadius: 999,
    borderWidth: 1,
    bottom: 2,
    left: 2,
    position: 'absolute',
    right: 2,
    top: 2,
    zIndex: 0,
  },
  clientImageAssetSoftener: {
    borderRadius: 999,
    borderWidth: 1,
    bottom: 0,
    left: 0,
    opacity: 0.72,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 3,
  },
  kaelMascotFrame: {
    alignItems: 'center',
    borderWidth: 1,
    boxShadow: '0 6px 16px rgba(8,120,110,0.06)',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 18,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: 16,
  },
  primaryButtonCompact: {
    minHeight: 44,
    paddingHorizontal: 14,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0,
  },
  secondaryButton: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0,
  },
})
