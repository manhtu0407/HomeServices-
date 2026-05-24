import { createContext, type ReactNode, use, useEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { LOCAL_WORKFLOW_PRICE_DISCLAIMER, inferLocalDealDraftFromKael, type LocalCustomerSearchState, type LocalDeal, type LocalDealStatus, type LocalScopeChange, type LocalWorkflowSelectors, type ServiceType } from '@home-services/shared'
import { setPendingKaelChatDraft } from '@/components/customer/kael-chat/pending-intake'
import { ScopeChangeHardStopModal } from '@/components/customer/scope-change-modal/scope-change-hard-stop-modal'
import { FloatingGlassTabBar, type FloatingGlassTabItem } from '@/components/ui/floating-glass-tab-bar'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { GlassCard } from '@/components/ui/glass-card'
import { GlassPressable } from '@/components/ui/glass-pressable'
import { ReduceMotionAwareEntranceView, reduceMotionAwarePressStyle } from '@/components/ui/reduce-motion-aware-animation'
import { appCopy, languageDisplayName, localizedProblemLabel, localizedServiceLabel, localizedStatusLabel, setAppLanguage, type AppLanguage, useAppLanguage } from '@/lib/app-language'
import { useAuth } from '@/lib/auth-provider'
import { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'

const CUSTOMER_V4_PRODUCTION_STANDARD = 'CUSTOMER_V4_PRODUCTION_STANDARD: accepted customer V4 production standard'
const CUSTOMER_V4_VISUAL_CONTRACT = 'CUSTOMER_V4_VISUAL_CONTRACT: production surfaces replace old customer UI'
const CUSTOMER_CLIENT_PROTOTYPE_PARITY_20260523 = 'CUSTOMER_CLIENT_PROTOTYPE_PARITY_20260523: approved client prototype parity source'
const CUSTOMER_NO_PROTOTYPE_SAMPLE_CLIENT_STATS = 'customer-no-prototype-sample-client-stats'
const CUSTOMER_SHARED_THEME_STORE = 'CUSTOMER_SHARED_THEME_STORE: one theme mode drives all mounted customer tabs'
const CUSTOMER_DOCK_SCROLL_CLEARANCE = 'CUSTOMER_DOCK_SCROLL_CLEARANCE: content clears absolute V4 dock'
const CUSTOMER_LAYER_ECOLOGY_V4 = 'CUSTOMER_LAYER_ECOLOGY_V4: glass mint surfaces, warm material wash, compact copy'
const SEMANTIC_LAYER_SWITCH_V4 = 'SEMANTIC_LAYER_SWITCH_V4: light/dark swaps semantic V4 layers'
const COPY_DENSITY_COMPACT = 'COPY_DENSITY_COMPACT: structure first, no feature explanations'
const KAEL_CHATBOX_SCREEN_CONTRACT = 'KAEL_CHATBOX_SCREEN_CONTRACT: local transaction-intent chatbox'
const KAEL_TICKET_COMPOSER_V3 = 'KAEL_TICKET_COMPOSER_V3: Kael asks, fills a repair ticket, then routes to Kael chat'
const CUSTOMER_DECORATIVE_MOTION_ENABLED = false
const CUSTOMER_THEME_STORAGE_KEY = 'customer.theme.mode.v4'
const customerDockHeight = 70
const customerDockBottomMargin = 6
const customerDockBottomClearance = customerDockHeight + customerDockBottomMargin + 76
const customerFrameHorizontalPadding = 16
const openBookingPath = '/(customer)/booking'
const openKaelChatPath = '/(customer)/kael-chat'
const openHistoryPath = '/(customer)/history'
const openProfilePath = '/(customer)/profile'
const customerHistoryTabKeys: CustomerHistoryTab[] = ['repair', 'price', 'chat', 'done']
const kaelModel8A = require('../../assets/kael-model-8a.png')
const kaelModel8AHead = require('../../assets/kael-model-8a-head.png')
const vndFormatter = new Intl.NumberFormat('vi-VN')

type ThemeMode = 'light' | 'dark'
type CustomerDockActive = 'activity' | 'booking' | 'home' | 'kael' | 'profile'
type CustomerHistoryTab = 'chat' | 'done' | 'price' | 'repair'
type SurfaceTone = 'base' | 'raised' | 'service' | 'water' | 'warm' | 'depth' | 'ghost' | 'disabled'
type IconName =
  | 'apartment'
  | 'boltPanel'
  | 'calendar'
  | 'chat'
  | 'check'
  | 'chevron'
  | 'cleaning'
  | 'document'
  | 'estimate'
  | 'external'
  | 'filter'
  | 'history'
  | 'kael'
  | 'menu'
  | 'map'
  | 'moon'
  | 'notification'
  | 'payment'
  | 'person'
  | 'privacy'
  | 'phone'
  | 'review'
  | 'send'
  | 'support'
  | 'ticket'
  | 'waterPipe'

let lastCustomerDockActive: CustomerDockActive = 'home'

function kaelChatPath(serviceType?: ServiceType | null) {
  return serviceType ? `${openKaelChatPath}?serviceType=${serviceType}` : openKaelChatPath
}

type CustomerThemeTokens = {
  mode: ThemeMode
  canvas: string
  base: string
  raised: string
  service: string
  water: string
  warm: string
  depthSurface: string
  ghost: string
  glass: string
  glassStrong: string
  glassWarm: string
  glassBorder: string
  glassHighlight: string
  glassShadow: string
  glassFloatShadow: string
  disabled: string
  border: string
  borderStrong: string
  text: string
  muted: string
  subtleText: string
  primary: string
  primaryText: string
  aqua: string
  copper: string
  danger: string
}

const lightLayer: CustomerThemeTokens = {
  mode: 'light',
  canvas: '#F8FBF5',
  base: '#FFFDF7',
  raised: '#FFFFFF',
  service: '#DCFBF3',
  water: '#E8FCFA',
  warm: '#FFF8EB',
  depthSurface: '#E5F1EB',
  ghost: 'rgba(255,253,248,0.78)',
  glass: 'rgba(255,255,255,0.58)',
  glassStrong: 'rgba(255,255,255,0.74)',
  glassWarm: 'rgba(255,253,246,0.68)',
  glassBorder: 'rgba(255,255,255,0.82)',
  glassHighlight: 'rgba(255,255,255,0.70)',
  glassShadow: '0 12px 30px rgba(13,70,65,0.09)',
  glassFloatShadow: '0 8px 20px rgba(13,70,65,0.07)',
  disabled: '#E5EEEA',
  border: 'rgba(35,96,84,0.13)',
  borderStrong: 'rgba(8,120,110,0.22)',
  text: '#12231F',
  muted: '#647672',
  subtleText: '#7D958F',
  primary: '#08786E',
  primaryText: '#FFFFFF',
  aqua: '#51BBC0',
  copper: '#BB743D',
  danger: '#C94F45',
}

const darkLayer: CustomerThemeTokens = {
  mode: 'dark',
  canvas: '#071312',
  base: '#10201F',
  raised: '#162B28',
  service: '#173B35',
  water: '#15363A',
  warm: '#3B291B',
  depthSurface: '#0D1B1A',
  ghost: 'rgba(237,248,244,0.12)',
  glass: 'rgba(14,32,32,0.62)',
  glassStrong: 'rgba(19,43,42,0.74)',
  glassWarm: 'rgba(24,34,31,0.72)',
  glassBorder: 'rgba(255,255,255,0.14)',
  glassHighlight: 'rgba(255,255,255,0.16)',
  glassShadow: '0 12px 32px rgba(0,0,0,0.20)',
  glassFloatShadow: '0 8px 22px rgba(0,0,0,0.16)',
  disabled: '#172927',
  border: '#294A45',
  borderStrong: '#3B6A62',
  text: '#F0FBF7',
  muted: '#9AB6B0',
  subtleText: '#85A59E',
  primary: '#69DEC6',
  primaryText: '#071312',
  aqua: '#76DCE3',
  copper: '#E0A06B',
  danger: '#F29A8D',
}

const CUSTOMER_THEME_TOKENS = {
  lightLayer,
  darkLayer,
}

const CustomerThemeContext = createContext<CustomerThemeTokens>(lightLayer)
let customerThemeMode: ThemeMode = 'light'
let customerThemeSubscribers: Array<() => void> = []
let customerThemeHydrated = false

function getCustomerThemeModeSnapshot() {
  return customerThemeMode
}

function subscribeCustomerThemeMode(listener: () => void) {
  customerThemeSubscribers = [...customerThemeSubscribers, listener]
  return () => {
    customerThemeSubscribers = customerThemeSubscribers.filter((item) => item !== listener)
  }
}

function setCustomerThemeMode(nextMode: ThemeMode) {
  if (customerThemeMode === nextMode) return
  customerThemeMode = nextMode
  AsyncStorage.setItem(CUSTOMER_THEME_STORAGE_KEY, nextMode).catch(() => undefined)
  for (const listener of customerThemeSubscribers) listener()
}

export function useCustomerThemeMode() {
  useEffect(() => {
    if (customerThemeHydrated) return
    customerThemeHydrated = true
    AsyncStorage.getItem(CUSTOMER_THEME_STORAGE_KEY)
      .then((stored) => {
        if (stored === 'light' || stored === 'dark') setCustomerThemeMode(stored)
      })
      .catch(() => undefined)
  }, [])

  return useSyncExternalStore(subscribeCustomerThemeMode, getCustomerThemeModeSnapshot, getCustomerThemeModeSnapshot)
}

export function getCustomerThemeTokens(mode: ThemeMode) {
  return mode === 'light' ? CUSTOMER_THEME_TOKENS.lightLayer : CUSTOMER_THEME_TOKENS.darkLayer
}

export function getReducedTransparencyCustomerTokens(tokens: CustomerThemeTokens): CustomerThemeTokens {
  return {
    ...tokens,
    ghost: tokens.mode === 'dark' ? 'rgba(18,39,36,0.96)' : 'rgba(255,253,248,0.96)',
    glass: tokens.mode === 'dark' ? 'rgba(18,39,36,0.96)' : 'rgba(255,253,248,0.96)',
    glassBorder: tokens.borderStrong,
    glassFloatShadow: 'none',
    glassHighlight: 'transparent',
    glassShadow: 'none',
    glassStrong: tokens.mode === 'dark' ? 'rgba(22,43,40,0.98)' : 'rgba(255,255,255,0.98)',
    glassWarm: tokens.mode === 'dark' ? 'rgba(59,41,27,0.96)' : 'rgba(255,247,235,0.98)',
  }
}

const customerCopy = {
  vi: {
    home: {
      title: 'Home Services',
      subtitle: 'Kael sẵn sàng kiểm giá',
      searchA11y: 'Mở kiểm giá dịch vụ',
      searchText: 'Bạn cần sửa gì?',
      commandKicker: 'Kể Kael sự cố',
      commandSubtitle: 'Mở chat nhanh để Kael gom thông tin',
      commandTitle: 'Ổ cắm bị nóng, nước rò, hay cần dọn nhà?',
      commandBody: 'Kael tóm tắt trước khi tìm thợ.',
      commandComposer: 'Mô tả sự cố',
      commandSend: 'Gửi',
      contextLabel: 'Căn hộ',
      contextFallback: 'Chưa có khu vực',
      addressHint: 'Chọn khu vực khi đặt lịch',
      addressActiveMeta: 'Khu vực của yêu cầu hiện tại',
      serviceMetaElectrical: 'Ổ cắm, CB, đèn',
      serviceMetaPlumbing: 'Rò rỉ, nghẹt',
      serviceMetaCleaning: 'Dọn căn hộ',
      serviceSectionMeta: '3 nhóm đang hỗ trợ',
      serviceSectionTitle: 'Dịch vụ',
      intakeCta: 'Mở Kael',
      quickActive: 'Yêu cầu',
      quickHistory: 'Lịch sử',
      quickAddress: 'Căn hộ',
      quickTrust: 'Minh bạch giá',
      quickActiveMeta: 'Theo dõi trạng thái',
      quickHistoryMeta: 'Xem phiếu cũ',
      quickAddressMeta: 'Kiểm tra khu vực',
      quickTrustMeta: 'Ước tính trước xác nhận',
      noActiveMeta: 'Chưa có yêu cầu',
      trustTitle: 'Kael chỉ chuẩn bị phiếu',
      trustBody: 'Giá là ước tính tham khảo. Thợ xác nhận phạm vi và giá thực tế trước khi bắt đầu.',
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
      hubBody: 'Mô tả sự cố điện, nước hoặc vệ sinh. Kael sẽ tóm tắt thành phiếu để bạn xem ước tính và xác nhận ở chat tiếp theo.',
      quickPrompt: 'Bắt đầu bằng dịch vụ',
      attach: 'Đính kèm',
      sessionTitle: 'Phiên nhận yêu cầu',
      sessionMetaReady: 'Đủ để mở phiếu',
      sessionMetaNeedsMore: 'Cần thêm chi tiết',
      assistantSummary: 'Kael đã giữ mô tả này trong phiên. Bước tiếp theo là mở chat Kael để xem ước tính và xác nhận rõ trước khi tìm thợ.',
      assistantMoreDetail: 'Kael cần thêm chi tiết trước khi tạo phiếu.',
      assistantMoreDetailHint: 'Hãy thêm vị trí trong căn hộ, dấu hiệu nhìn thấy, mức độ ảnh hưởng hoặc ảnh trong chat Kael.',
      unsupportedSummary: 'Kael chưa thể tạo phiếu cho dịch vụ ngoài phạm vi hiện tại.',
      unsupportedHint: 'Hiện tại chỉ hỗ trợ sửa điện, sửa nước và vệ sinh/dọn dẹp nhà.',
      quickServiceA11y: (service: string) => `Bắt đầu chat ${service} với Kael`,
      needDetail: 'Mô tả Kael cần rõ hơn trước khi tạo phiếu.',
      needService: 'Cần chọn dịch vụ',
      sendAfterConfirm: 'Gửi thợ sau xác nhận',
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
      confirmed: 'Đã xác nhận xong',
      finalConfirm: 'Chờ xác nhận cuối',
      noWorker: 'Chưa có thợ được ghép',
      needCustomerConfirm: 'Cần khách xác nhận',
      waitingWorkerDone: 'Chờ thợ hoàn tất',
      editRequest: 'Chỉnh yêu cầu',
      newRequest: 'Tạo yêu cầu mới',
      openPriceCheck: 'Mở chat Kael',
      confirmDoneTitle: 'Xác nhận đã nhận việc?',
      confirmDoneBody: 'Hệ thống sẽ ghi nhận khách đã xác nhận xong. Thanh toán vẫn khóa ở giai đoạn này.',
      checkAgain: 'Kiểm tra lại',
      confirmDone: 'Xác nhận xong',
      cancelTitle: 'Hủy yêu cầu?',
      cancelSearching: 'Yêu cầu tìm thợ sẽ dừng và địa chỉ chi tiết vẫn bị ẩn khỏi thợ.',
      cancelDraft: 'Phiếu sẽ đóng. Bạn có thể tạo yêu cầu mới khi cần.',
      keep: 'Giữ lại',
      cancelRequest: 'Hủy yêu cầu',
      scopeApproveTitle: 'Duyệt thay đổi phạm vi?',
      scopeRejectTitle: 'Từ chối thay đổi phạm vi?',
      scopeApproveBody: 'Hệ thống sẽ ghi nhận khách đã duyệt thay đổi và cho thợ tiếp tục sửa.',
      scopeRejectBody: 'Hệ thống sẽ ghi nhận khách từ chối thay đổi và dừng yêu cầu này để tránh thợ tiếp tục phạm vi mới.',
      approve: 'Duyệt',
      reject: 'Từ chối',
      progress: 'Tiến trình yêu cầu',
      scope: 'Đổi phạm vi',
      waitingDecision: 'Chờ quyết định',
      reason: 'Lý do',
      workerNoReason: 'Thợ chưa ghi lý do',
      newPrice: 'Giá mới',
      needsConfirm: 'Cần xác nhận',
      evidence: 'Bằng chứng hoàn tất',
      evidenceBefore: 'Ảnh trước',
      evidenceAfter: 'Ảnh sau',
      waitingWorkerPrice: 'Chờ thợ nhập',
      priceDisclaimer: LOCAL_WORKFLOW_PRICE_DISCLAIMER,
      chatEmpty: 'Chưa có trao đổi cho yêu cầu này',
      confirmSearch: 'Xác nhận tìm thợ',
      confirmSearchTitle: 'Tìm thợ sau khi kiểm giá',
      confirmSearchBody: 'Kael chỉ chuyển yêu cầu sang tìm thợ khi bạn đã xác nhận rõ.',
      paymentReview: 'Thanh toán & đánh giá',
      payment: 'Thanh toán',
      review: 'Đánh giá',
      locked: 'Khóa',
      open: 'Mở',
      presenceTitle: 'Bản đồ xác nhận',
      presenceHome: 'Điểm hẹn',
      presenceWorker: 'Thợ cập nhật',
      chooseStar: (rating: number) => `Chọn ${rating} sao`,
      submitReview: 'Gửi đánh giá',
      timeline: [
        ['Mô tả vấn đề', ['draft', 'analyzing']],
        ['Xác nhận tìm thợ', ['awaiting_customer_confirm']],
        ['Tìm thợ', ['broadcasting']],
        ['Thợ nhận việc', ['worker_matched', 'worker_on_way']],
        ['Kiểm tra/sửa', ['arrived', 'inspecting', 'repairing', 'scope_change_pending']],
        ['Thợ báo hoàn tất', ['completed_by_worker']],
        ['Khách xác nhận xong', ['confirmed_by_customer', 'reviewed']],
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
      history: 'Lịch sử',
      interface: 'Giao diện',
      light: 'Sáng',
      dark: 'Tối',
    },
    nav: { home: 'Nhà', booking: 'Đặt', kael: 'Kael', activity: 'Lịch', profile: 'Hồ sơ' },
    navA11y: { home: 'Trang chủ', booking: 'Đặt dịch vụ', kael: 'Kael', activity: 'Lịch sử', profile: 'Hồ sơ' },
  },
  en: {
    home: {
      title: 'Home Services',
      subtitle: 'Kael is ready to check price',
      searchA11y: 'Open Kael service chat',
      searchText: 'What needs fixing?',
      commandKicker: 'Tell Kael',
      commandSubtitle: 'Open quick chat so Kael can collect details',
      commandTitle: 'Outlet, leak, or cleaning?',
      commandBody: 'Kael summarizes before worker search.',
      commandComposer: 'Describe the problem',
      commandSend: 'Send',
      contextLabel: 'Apartment',
      contextFallback: 'No area yet',
      addressHint: 'Choose an area when booking',
      addressActiveMeta: 'Area for the current request',
      serviceMetaElectrical: 'Outlet, breaker, light',
      serviceMetaPlumbing: 'Leak, clog',
      serviceMetaCleaning: 'Apartment cleaning',
      serviceSectionMeta: '3 supported groups',
      serviceSectionTitle: 'Services',
      intakeCta: 'Open Kael',
      quickActive: 'Request',
      quickHistory: 'History',
      quickAddress: 'Apartment',
      quickTrust: 'Price clarity',
      quickActiveMeta: 'Track status',
      quickHistoryMeta: 'View past tickets',
      quickAddressMeta: 'Check area',
      quickTrustMeta: 'Estimate before confirm',
      noActiveMeta: 'No active request',
      trustTitle: 'Kael prepares the ticket only',
      trustBody: 'Prices are reference estimates. The worker confirms scope and actual price before starting.',
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
      hubBody: 'Describe an electrical, plumbing, or cleaning issue. Kael will turn it into a ticket for estimate review and explicit confirmation.',
      quickPrompt: 'Start with a service',
      attach: 'Attach',
      sessionTitle: 'Intake session',
      sessionMetaReady: 'Ready for ticket',
      sessionMetaNeedsMore: 'Needs more detail',
      assistantSummary: 'Kael saved this description for the session. Next, open Kael chat to review the estimate and confirm before worker search.',
      assistantMoreDetail: 'Kael needs a little more detail before creating a ticket.',
      assistantMoreDetailHint: 'Add the room, visible symptom, impact level, or photo context in Kael chat.',
      unsupportedSummary: 'Kael cannot create a ticket for a service outside the current scope.',
      unsupportedHint: 'Home Services currently supports electrical repair, plumbing repair, and home cleaning only.',
      quickServiceA11y: (service: string) => `Start ${service} chat with Kael`,
      needDetail: 'Kael needs a clearer description before creating a ticket.',
      needService: 'Choose a service',
      sendAfterConfirm: 'Sent after confirmation',
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
      confirmed: 'Completed',
      finalConfirm: 'Waiting final confirmation',
      noWorker: 'No worker matched',
      needCustomerConfirm: 'Customer confirmation needed',
      waitingWorkerDone: 'Waiting for worker completion',
      editRequest: 'Edit request',
      newRequest: 'New request',
      openPriceCheck: 'Open Kael chat',
      confirmDoneTitle: 'Confirm the job is done?',
      confirmDoneBody: 'The system will record customer completion. Payment remains locked in this phase.',
      checkAgain: 'Check again',
      confirmDone: 'Confirm done',
      cancelTitle: 'Cancel request?',
      cancelSearching: 'The worker search will stop and the detailed address stays hidden.',
      cancelDraft: 'This ticket will close. You can create a new request later.',
      keep: 'Keep',
      cancelRequest: 'Cancel request',
      scopeApproveTitle: 'Approve scope change?',
      scopeRejectTitle: 'Reject scope change?',
      scopeApproveBody: 'The system will record approval and let the worker continue.',
      scopeRejectBody: 'The system will record rejection and stop the request from continuing with the new scope.',
      approve: 'Approve',
      reject: 'Reject',
      progress: 'Request progress',
      scope: 'Scope change',
      waitingDecision: 'Waiting decision',
      reason: 'Reason',
      workerNoReason: 'No worker reason yet',
      newPrice: 'New price',
      needsConfirm: 'Needs confirmation',
      evidence: 'Completion evidence',
      evidenceBefore: 'Before',
      evidenceAfter: 'After',
      waitingWorkerPrice: 'Waiting for worker',
      priceDisclaimer: 'This is a market-based estimate. The worker confirms scope and actual price before starting.',
      chatEmpty: 'No messages for this request yet',
      confirmSearch: 'Confirm worker search',
      confirmSearchTitle: 'Find a worker after price check',
      confirmSearchBody: 'Kael sends the request to worker search only after your explicit confirmation.',
      paymentReview: 'Payment & review',
      payment: 'Payment',
      review: 'Review',
      locked: 'Locked',
      open: 'Open',
      presenceTitle: 'Confirmation map',
      presenceHome: 'Service point',
      presenceWorker: 'Worker update',
      chooseStar: (rating: number) => `Choose ${rating} stars`,
      submitReview: 'Submit review',
      timeline: [
        ['Describe problem', ['draft', 'analyzing']],
        ['Confirm search', ['awaiting_customer_confirm']],
        ['Find worker', ['broadcasting']],
        ['Worker accepted', ['worker_matched', 'worker_on_way']],
        ['Inspect/repair', ['arrived', 'inspecting', 'repairing', 'scope_change_pending']],
        ['Worker completed', ['completed_by_worker']],
        ['Customer confirmed', ['confirmed_by_customer', 'reviewed']],
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
      history: 'History',
      interface: 'Theme',
      light: 'Light',
      dark: 'Dark',
    },
    nav: { home: 'Home', booking: 'Book', kael: 'Kael', activity: 'History', profile: 'Profile' },
    navA11y: { home: 'Home', booking: 'Book service', kael: 'Kael', activity: 'History', profile: 'Profile' },
  },
} as const

export function CustomerHomeSurface() {
  const { push, replace } = useRouter()
  const { session } = useAuth()
  const languageMode = useAppLanguage()
  const copy = customerCopy[languageMode]
  const { actions, dispatch, notificationUnreadCount, notifications, selectors, state } = useFrontendWorkflow()
  const activeDeal = state.deal
  const visibleNotifications = notifications.slice(0, 2)
  const canStartNewDeal = !activeDeal || canReplaceCustomerDeal(activeDeal.status)
  const isTerminalDeal = activeDeal ? isTerminalCustomerDeal(activeDeal.status) : false
  const activeDealRoute =
    selectors.currentStatus === 'draft' || selectors.currentStatus === 'analyzing' || selectors.currentStatus === 'awaiting_customer_confirm'
      ? kaelChatPath(activeDeal?.draft.serviceType)
      : openHistoryPath
  const activeDealStatusLabel = customerVisibleStatusLabel(selectors.currentStatus, selectors.customerSearchState, languageMode)
  const customerMetadata = session?.user.user_metadata ?? {}
  const rawDefaultAddress = typeof customerMetadata.default_address === 'string' ? customerMetadata.default_address.trim() : ''
  const homeAreaValue = activeDeal?.draft.districtLabel
    ? localizedCustomerAreaLabel(activeDeal.draft.districtLabel, languageMode, copy.home.contextFallback)
    : rawDefaultAddress
      ? localizedCustomerAreaLabel(rawDefaultAddress, languageMode, copy.home.contextFallback)
      : copy.home.contextFallback
  const homeAddressMeta = activeDeal
    ? copy.home.addressActiveMeta
    : rawDefaultAddress
      ? languageMode === 'en' ? 'Default address' : 'Địa chỉ mặc định'
      : copy.home.addressHint
  const rawDisplayName = typeof customerMetadata.full_name === 'string'
    ? customerMetadata.full_name
    : typeof customerMetadata.name === 'string'
      ? customerMetadata.name
      : ''
  const displayName = rawDisplayName.trim()
  const homeTitle = languageMode === 'en'
    ? displayName ? `${displayName}'s home` : 'Your home'
    : displayName ? `Nhà của ${displayName}` : 'Nhà của bạn'
  const customerTitle = homeTitle
  const openKaelChatFlow = (serviceType?: ServiceType) => {
    if (!canStartNewDeal) {
      replace(activeDealRoute)
      return
    }
    if (isTerminalDeal) dispatch({ type: 'reset_workflow' })
    push(kaelChatPath(serviceType))
  }
  const homeCommandTarget = canStartNewDeal ? openKaelChatPath : activeDealRoute
  const openHomeCommand = () => {
    if (canStartNewDeal) {
      push(openKaelChatPath)
      return
    }
    replace(activeDealRoute)
  }
  const homeCommandActionLabel = canStartNewDeal ? copy.home.intakeCta : copy.home.quickActive
  const homeShortcuts: Array<{ icon: IconName; meta: string; onPress: () => void; testID: string; title: string }> = [
    {
      icon: 'ticket',
      meta: activeDeal ? activeDealStatusLabel : copy.home.noActiveMeta,
      onPress: () => replace(activeDeal ? activeDealRoute : openHistoryPath),
      testID: 'customer-home-shortcut-active',
      title: copy.home.quickActive,
    },
    {
      icon: 'history',
      meta: copy.home.quickHistoryMeta,
      onPress: () => replace(openHistoryPath),
      testID: 'customer-home-shortcut-history',
      title: copy.home.quickHistory,
    },
    {
      icon: 'apartment',
      meta: copy.home.quickAddressMeta,
      onPress: () => replace(openProfilePath),
      testID: 'customer-home-shortcut-address',
      title: copy.home.quickAddress,
    },
    {
      icon: 'estimate',
      meta: copy.home.quickTrustMeta,
      onPress: () => openKaelChatFlow(),
      testID: 'customer-home-shortcut-trust',
      title: copy.home.quickTrust,
    },
  ]

  return (
    <V4Frame active="home" testID="customer-home-surface">
      {({ tokens }) => (
        <>
          <View style={styles.v4Content}>
            <View pointerEvents="none" style={[styles.customerSectionLiquidWash, { backgroundColor: tokens.aqua }]} testID="customer-section-liquid-wash-home" />
            <View style={styles.homeTopRow} testID="customer-home-title-row">
              <View style={styles.titleBlock}>
                <Text style={[styles.screenTitle, { color: tokens.text }]} numberOfLines={1}>
                  {customerTitle}
                </Text>
                <Text style={[styles.sectionMeta, { color: tokens.muted }]} numberOfLines={1}>
                  {copy.home.subtitle}
                </Text>
              </View>
              <Pressable
                accessibilityLabel={copy.home.notification(notificationUnreadCount)}
                accessibilityRole="button"
                onPress={() => replace(openHistoryPath)}
                style={({ pressed }) => [styles.homeBell, customerOpaqueSurface(tokens), pressed ? styles.pressed : null]}
                testID="customer-home-notification-entry"
              >
                <IconGlyph name="notification" color={tokens.primary} accent={tokens.copper} />
              </Pressable>
            </View>
            <View style={styles.homeSheet}>
              <View style={styles.hiddenMarker} testID="customer-home-signature-v4" />
              <View style={styles.hiddenMarker} testID="customer-home-layer-stack" />
              <View style={styles.hiddenMarker} testID="customer-home-hero-depth-grid" />
              <View style={styles.hiddenMarker} testID="customer-home-apartment-context" />
              <View style={styles.hiddenMarker} testID="customer-utility-notification-center" />
              <ReduceMotionAwareEntranceView delayMs={100} distanceY={16} testID="customer-home-hero-motion">
                <Pressable accessibilityLabel={`${copy.home.contextLabel}. ${homeAreaValue}`} accessibilityRole="button" onPress={() => replace(openProfilePath)} style={({ pressed }) => [styles.homeAddressCard, customerOpaqueSurface(tokens), pressed ? styles.pressed : null]} testID="customer-home-address-card">
                  <View style={styles.homeAddressCopy}>
                    <Text style={[styles.homeAddressValue, { color: tokens.text }]} numberOfLines={1}>
                      {homeAreaValue}
                    </Text>
                    <Text style={[styles.homeAddressMeta, { color: tokens.muted }]} numberOfLines={1}>
                      {homeAddressMeta}
                    </Text>
                  </View>
                  <IconGlyph name="chevron" color={tokens.primary} accent={tokens.aqua} />
                </Pressable>
                <GlassCard mode={tokens.mode} style={styles.homeCommandHero} testID="customer-home-layered-hero">
                  <View style={styles.homeCommandHitArea} testID="customer-home-kael-command">
                    <SubtleGlassHighlight />
                    <SubtleLiquidLight testID="customer-home-command-liquid-light" />
                    <View style={[styles.homeCommandWash, { backgroundColor: tokens.aqua }]} />
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
                      <Pressable accessibilityLabel={homeCommandActionLabel} accessibilityRole="button" onPress={openHomeCommand} style={({ pressed }) => [styles.homeCommandOpen, { backgroundColor: tokens.service, borderColor: tokens.border }, pressed ? styles.pressed : null]} testID="customer-home-kael-open">
                        <IconGlyph name="external" color={tokens.primary} accent={tokens.copper} />
                      </Pressable>
                    </View>
                    <View style={[styles.homeCommandPrompt, customerOpaqueSurface(tokens)]} testID="customer-home-kael-command-prompt">
                      <Text style={[styles.homeCommandPromptText, { color: tokens.subtleText }]} numberOfLines={2}>
                        {copy.home.commandTitle}
                      </Text>
                      <View style={styles.homeCommandPromptActions}>
                        <Pressable accessibilityLabel={copy.kael.attach} accessibilityRole="button" onPress={() => openKaelChatFlow()} style={({ pressed }) => [styles.homeCommandAttach, { backgroundColor: tokens.service, borderColor: tokens.border }, pressed ? styles.pressed : null]} testID="customer-home-kael-command-attach">
                          <Text style={[styles.homeCommandAttachText, { color: tokens.primary }]} numberOfLines={1}>
                            {copy.kael.attach}
                          </Text>
                        </Pressable>
                        <Pressable accessibilityLabel={copy.home.commandSend} accessibilityRole="button" onPress={openHomeCommand} style={({ pressed }) => [styles.homeCommandSend, { backgroundColor: tokens.primary }, pressed ? styles.pressed : null]} testID="customer-home-kael-command-send">
                          <Text style={[styles.homeCommandSendText, { color: tokens.primaryText }]} numberOfLines={1}>
                            {copy.home.commandSend}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                    <View style={styles.chipRow} testID="customer-home-kael-command-chips">
                      <SmallChip label={localizedServiceLabel('electrical', languageMode)} tone="service" />
                      <SmallChip label={localizedServiceLabel('plumbing', languageMode)} tone="service" />
                      <SmallChip label={localizedServiceLabel('cleaning', languageMode)} tone="service" />
                    </View>
                    <View style={styles.hiddenMarker} testID="customer-home-ticket-decor" />
                  </View>
                </GlassCard>
              </ReduceMotionAwareEntranceView>
              <View style={styles.homeServicesBlock} testID="customer-home-services-section">
                <View style={styles.sectionTitle} testID="customer-home-services-heading">
                  <Text style={[styles.homeServicesTitle, { color: tokens.text }]} numberOfLines={1}>
                    {copy.home.serviceSectionTitle}
                  </Text>
                  <Text style={[styles.homeServicesMeta, { color: tokens.primary }]} numberOfLines={1}>
                    {copy.home.serviceSectionMeta}
                  </Text>
                </View>
                <View style={styles.serviceGrid} testID="customer-home-service-grid">
                  <V4ServiceCard icon="boltPanel" meta={copy.home.serviceMetaElectrical} title={localizedServiceLabel('electrical', languageMode)} testID="customer-shell-service-electrical" onPress={() => openKaelChatFlow('electrical')} />
                  <V4ServiceCard icon="waterPipe" meta={copy.home.serviceMetaPlumbing} title={localizedServiceLabel('plumbing', languageMode)} testID="customer-shell-service-plumbing" onPress={() => openKaelChatFlow('plumbing')} water />
                  <V4ServiceCard icon="cleaning" meta={copy.home.serviceMetaCleaning} title={localizedServiceLabel('cleaning', languageMode)} testID="customer-shell-service-cleaning" onPress={() => openKaelChatFlow('cleaning')} />
                </View>
              </View>
              <View style={styles.homeShortcutGrid} testID="customer-home-shortcuts">
                <View style={styles.hiddenMarker} testID="customer-home-real-shortcuts" />
                {homeShortcuts.slice(0, 2).map((item) => (
                  <Pressable accessibilityLabel={`${item.title}. ${item.meta}`} accessibilityRole="button" key={item.testID} onPress={item.onPress} style={({ pressed }) => [styles.homeShortcutTile, customerOpaqueSurface(tokens), pressed ? styles.pressed : null]} testID={item.testID}>
                    <IconGlyph name={item.icon} color={tokens.primary} accent={tokens.copper} />
                    <View style={styles.homeShortcutCopy}>
                      <Text style={[styles.homeShortcutTitle, { color: tokens.text }]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={[styles.homeShortcutMeta, { color: tokens.muted }]} numberOfLines={1}>
                        {item.meta}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
              {visibleNotifications.length > 0 ? (
                <View style={[styles.notificationInlineCard, customerOpaqueSurface(tokens)]} testID="customer-notification-inbox-live">
                  <IconGlyph name="notification" color={tokens.primary} accent={tokens.copper} />
                  <View style={styles.notificationInlineBody}>
                    <Text style={[styles.notificationInlineText, { color: tokens.text }]} numberOfLines={1}>
                      {copy.home.notification(notificationUnreadCount)}
                    </Text>
                    {visibleNotifications.map((item) => (
                      <Pressable
                        accessibilityLabel={`${item.title}. ${item.body}`}
                        accessibilityRole="button"
                        key={item.id}
                        onPress={() => {
                          void actions.markNotificationRead(item.id)
                          if (item.job_id) replace(openHistoryPath)
                        }}
                        style={styles.notificationInlineItem}
                      >
                        <Text style={[styles.notificationInlineItemText, { color: tokens.muted }]} numberOfLines={1}>
                          {item.title}: {item.body}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}
              {activeDeal ? (
                <Pressable
                  accessibilityLabel={copy.home.activeA11y(localizedServiceLabel(activeDeal.draft.serviceType, languageMode))}
                  accessibilityRole="button"
                  onPress={() => replace(activeDealRoute)}
                  style={[styles.ticketCard, customerOpaqueSurface(tokens)]}
                  testID="customer-home-active-local-deal"
                >
                  <View style={styles.sectionTitle}>
                    <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
                      {localizedServiceLabel(activeDeal.draft.serviceType, languageMode)}
                    </Text>
                    <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
                      {activeDealStatusLabel}
                    </Text>
                  </View>
                  <View style={styles.twoCol}>
                    <V4TicketCell
                      label={copy.ticket.issue}
                      value={localizedProblemLabel(activeDeal.draft.problemChips[0] ?? activeDeal.draft.inferredProblemLabel, activeDeal.draft.serviceType, languageMode)}
                    />
                    <V4TicketCell label={copy.ticket.area} value={localizedCustomerAreaLabel(activeDeal.draft.districtLabel, languageMode, copy.ticket.unknown)} />
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
    selectors.currentStatus === 'draft' || selectors.currentStatus === 'analyzing' || selectors.currentStatus === 'awaiting_customer_confirm'
      ? kaelChatPath(activeDeal?.draft.serviceType)
      : openHistoryPath
  const activeDealStatusLabel = customerVisibleStatusLabel(selectors.currentStatus, selectors.customerSearchState, languageMode)
  const entryCopy = languageMode === 'en'
    ? {
        activeBody: 'Continue the active request before starting a new one.',
        activeCta: 'View activity',
        activeTitle: 'Request in progress',
        beforeConfirmSearch: 'Before confirming worker search',
        checklist: 'Price check',
        checklistItems: ['Work type', 'Urgency', 'Price band', 'Needs confirmation'],
        diagnosis: 'Kael assessment',
        diagnosisValue: 'Kael will summarize the issue here after the chat has enough detail.',
        detailEstimate: 'View detailed estimate',
        estimateLabel: 'Estimate',
        estimatePending: 'Needs data',
        kicker: 'Price check',
        serviceChange: 'Change service',
        serviceChoose: 'Choose service',
        serviceSelected: 'Selected',
        startKaelCheck: 'Open Kael chat',
        step: 'Step 2/4',
        title: 'Check price',
      }
    : {
        activeBody: 'Theo dõi hoặc hoàn tất yêu cầu hiện tại trước khi tạo yêu cầu mới.',
        activeCta: 'Xem hoạt động',
        activeTitle: 'Đang có yêu cầu',
        beforeConfirmSearch: 'Trước khi xác nhận tìm thợ',
        checklist: 'Bảng kiểm giá',
        checklistItems: ['Dạng việc', 'Độ khẩn', 'Biên giá', 'Cần xác nhận'],
        diagnosis: 'Kael nhận định',
        diagnosisValue: 'Kael sẽ tóm tắt vấn đề ở đây sau khi chat có đủ chi tiết.',
        detailEstimate: 'Xem ước tính chi tiết',
        estimateLabel: 'Ước tính',
        estimatePending: 'Cần dữ liệu',
        kicker: 'Kiểm giá',
        serviceChange: 'Đổi dịch vụ',
        serviceChoose: 'Chọn dịch vụ',
        serviceSelected: 'Đã chọn',
        startKaelCheck: 'Mở chat Kael',
        step: 'Bước 2/4',
        title: 'Kiểm giá',
      }
  const activeServiceType = activeDeal?.draft.serviceType ?? null
  const estimateLabel = activeDeal?.estimate?.priceRangeLabel ?? entryCopy.estimatePending
  const mediaCount = activeDeal?.draft.mediaCount ?? 0
  const mediaChipLabel = mediaCount > 0
    ? `${languageMode === 'en' ? 'Media' : 'Ảnh/video'}: ${mediaCount}`
    : (languageMode === 'en' ? 'Media: none yet' : 'Ảnh/video: chưa có')
  const bookingPillLabel = entryCopy.step
  const serviceMetaForBooking = (serviceType: ServiceType) => {
    if (activeDeal?.draft.serviceType === serviceType) return entryCopy.serviceSelected
    return activeDeal ? entryCopy.serviceChange : entryCopy.serviceChoose
  }
  const bookingCheckValues = [
    activeDeal?.estimate?.problemLabel ?? entryCopy.estimatePending,
    activeDeal?.estimate?.complexity && activeDeal.estimate.complexity !== 'unknown'
      ? activeDeal.estimate.complexity
      : entryCopy.estimatePending,
    estimateLabel,
    activeDeal ? copy.history.needsConfirm : entryCopy.estimatePending,
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

  return (
    <V4Frame active="booking" testID="customer-booking-entry-surface">
      {({ tokens }) => (
        <View style={styles.bookingStack}>
          <View pointerEvents="none" style={[styles.customerSectionLiquidWash, { backgroundColor: tokens.aqua }]} testID="customer-section-liquid-wash-booking" />
          <View style={styles.bookingTopRow} testID="customer-booking-title-row">
            <View style={styles.titleBlock}>
              <Text style={[styles.screenTitle, { color: tokens.text }]} numberOfLines={1}>
                {entryCopy.title}
              </Text>
              <Text style={[styles.sectionMeta, { color: tokens.muted }]} numberOfLines={1}>
                {entryCopy.beforeConfirmSearch}
              </Text>
            </View>
            <View style={[styles.bookingStepPill, { backgroundColor: tokens.service, borderColor: tokens.border }]}>
              <Text style={[styles.bookingStepText, { color: tokens.primary }]} numberOfLines={1}>
                {bookingPillLabel}
              </Text>
            </View>
          </View>
          <View style={styles.serviceGrid} testID="customer-booking-service-entry-grid">
            <V4ServiceCard compact icon="boltPanel" meta={serviceMetaForBooking('electrical')} selected={activeServiceType === 'electrical'} title={localizedServiceLabel('electrical', languageMode)} testID="customer-booking-service-electrical" onPress={() => openChat('electrical')} />
            <V4ServiceCard compact icon="waterPipe" meta={serviceMetaForBooking('plumbing')} selected={activeServiceType === 'plumbing'} title={localizedServiceLabel('plumbing', languageMode)} testID="customer-booking-service-plumbing" onPress={() => openChat('plumbing')} water />
            <V4ServiceCard compact icon="cleaning" meta={serviceMetaForBooking('cleaning')} selected={activeServiceType === 'cleaning'} title={localizedServiceLabel('cleaning', languageMode)} testID="customer-booking-service-cleaning" onPress={() => openChat('cleaning')} />
          </View>
          <View style={styles.chipRow} testID="customer-booking-summary-chips">
            <SmallChip label={activeDeal?.draft.problemChips[0] ? `${copy.ticket.issue}: ${localizedProblemLabel(activeDeal.draft.problemChips[0], activeDeal.draft.serviceType, languageMode)}` : `${copy.ticket.issue}: ${entryCopy.estimatePending}`} tone="service" />
            <SmallChip label={mediaChipLabel} tone="service" />
            <SmallChip label={`${copy.ticket.area}: ${activeDeal ? localizedCustomerAreaLabel(activeDeal.draft.districtLabel, languageMode, copy.ticket.unknown) : entryCopy.estimatePending}`} tone="service" />
            <SmallChip label={`${entryCopy.estimateLabel}: ${estimateLabel}`} tone="service" />
          </View>
          <View style={[styles.bookingDiagnosisPanel, customerOpaqueSurface(tokens), { backgroundColor: tokens.service }]} testID="customer-booking-ai-diagnosis-summary">
            <View style={styles.hiddenMarker} testID="customer-booking-kael-summary" />
            <View style={[styles.bookingDiagnosisPill, { backgroundColor: tokens.service, borderColor: tokens.borderStrong }]}>
              <IconGlyph name="kael" color={tokens.primary} accent={tokens.copper} />
              <Text style={[styles.bookingDiagnosisPillText, { color: tokens.primary }]} numberOfLines={1}>
                {entryCopy.diagnosis}
              </Text>
            </View>
            <Text style={[styles.bookingDiagnosisBody, { color: tokens.text }]} numberOfLines={4}>
              {activeDeal?.estimate?.advisory ?? entryCopy.diagnosisValue}
            </Text>
          </View>
          <View style={[styles.bookingCheckPanel, customerOpaqueSurface(tokens)]} testID="customer-booking-price-check-panel">
            <SubtleLiquidLight testID="customer-booking-checklist-liquid-rim" variant="rim" />
            <View style={styles.sectionTitle}>
              <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
                {entryCopy.checklist}
              </Text>
              <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
                {entryCopy.estimateLabel}
              </Text>
            </View>
            <View style={styles.bookingGrid} testID="customer-booking-price-check-grid">
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
              <Text style={[styles.historyDisclaimerText, { color: tokens.muted }]} numberOfLines={3} testID="customer-booking-price-disclaimer">
                {copy.history.priceDisclaimer}
              </Text>
            ) : null}
          </View>
          <PrimaryButton compact label={activeDeal ? entryCopy.detailEstimate : entryCopy.startKaelCheck} onPress={openEstimateDetails} testID="customer-booking-estimate-detail-cta" />
          {activeDeal ? (
            <Pressable
              accessibilityLabel={`${entryCopy.activeTitle}. ${activeDealStatusLabel}`}
              accessibilityRole="button"
              onPress={() => replace(activeDealRoute)}
              style={({ pressed }) => [styles.ticketCard, customerOpaqueSurface(tokens), pressed ? styles.pressed : null]}
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

type CustomerKaelDraftState = {
  kaelDraft: string
  latestAnswer: string
  kaelError: string | null
}

const EMPTY_CUSTOMER_KAEL_DRAFT_STATE: CustomerKaelDraftState = {
  kaelDraft: '',
  latestAnswer: '',
  kaelError: null,
}

function customerKaelDraftReducer(current: CustomerKaelDraftState, patch: Partial<CustomerKaelDraftState>): CustomerKaelDraftState {
  return { ...current, ...patch }
}

export function CustomerKaelSurface() {
  const { push, replace } = useRouter()
  const languageMode = useAppLanguage()
  const copy = customerCopy[languageMode]
  const { dispatch, state } = useFrontendWorkflow()
  const [{ kaelDraft, latestAnswer, kaelError }, patchKaelDraft] = useReducer(customerKaelDraftReducer, EMPTY_CUSTOMER_KAEL_DRAFT_STATE)
  const setKaelDraft = (nextDraft: string) => patchKaelDraft({ kaelDraft: nextDraft })
  const setLatestAnswer = (nextAnswer: string) => patchKaelDraft({ latestAnswer: nextAnswer })
  const setKaelError = (nextError: string | null) => patchKaelDraft({ kaelError: nextError })
  const localKaelDraft = state.deal?.draft.source === 'kael' ? state.deal.draft : null
  const canStartKaelDraft = !state.deal || canReplaceCustomerDeal(state.deal.status)
  const displayedKaelAnswer = latestAnswer.trim().length > 0 ? latestAnswer : localKaelDraft?.description ?? ''
  const hasAnyKaelInfo = displayedKaelAnswer.trim().length > 0
  const hasEnoughKaelInfo = displayedKaelAnswer.trim().length >= 16
  const isUnsupportedKaelService = Boolean(localKaelDraft?.unsupportedServiceLabel)
  const shouldRevealKaelTicket = hasEnoughKaelInfo && !isUnsupportedKaelService
  const kaelTicketService = localKaelDraft?.unsupportedServiceLabel ? copy.kael.lockedService : localKaelDraft ? localizedServiceLabel(localKaelDraft.serviceType, languageMode) : localizedServiceLabel(null, languageMode)
  const kaelTicketProblem = localKaelDraft?.unsupportedServiceLabel
    ? copy.kael.unsupportedService
    : (localKaelDraft?.inferredProblemLabel
      ? localizedProblemLabel(localKaelDraft.inferredProblemLabel, localKaelDraft.serviceType, languageMode)
      : localKaelDraft?.needsServiceChoice ? copy.kael.needService : copy.ticket.described)
  const quickKaelServices: ServiceType[] = ['electrical', 'plumbing', 'cleaning']
  const startKaelService = (serviceType: ServiceType) => {
    if (!canStartKaelDraft) {
      setKaelError(copy.kael.activeDealError)
      return
    }
    if (state.deal && isTerminalCustomerDeal(state.deal.status)) dispatch({ type: 'reset_workflow' })
    push(kaelChatPath(serviceType))
  }
  const submitKaelLocalDraft = () => {
    const trimmed = kaelDraft.trim()
    if (!trimmed) return
    if (trimmed.length < 4) {
      setKaelError(copy.kael.needDetail)
      return
    }
    if (!canStartKaelDraft) {
      setKaelError(copy.kael.activeDealError)
      return
    }
    const inferredKaelDraft = inferLocalDealDraftFromKael(trimmed)
    const handoffServiceType = inferredKaelDraft.unsupportedServiceLabel ? null : inferredKaelDraft.serviceType
    dispatch({ type: 'submit_kael_draft', text: trimmed })
    setPendingKaelChatDraft({ message: trimmed, serviceType: handoffServiceType })
    setLatestAnswer(trimmed)
    setKaelDraft('')
    setKaelError(null)
    push(kaelChatPath(handoffServiceType))
  }
  const updateKaelDraft = (value: string) => {
    setKaelDraft(value)
    if (kaelError) setKaelError(null)
  }
  const openKaelAttachFlow = () => {
    if (!canStartKaelDraft && !localKaelDraft) {
      setKaelError(copy.kael.activeDealError)
      return
    }
    if (state.deal && isTerminalCustomerDeal(state.deal.status)) dispatch({ type: 'reset_workflow' })
    push(kaelChatPath(localKaelDraft?.serviceType))
  }

  useEffect(() => {
    if (state.deal?.draft.source === 'kael') return
    patchKaelDraft(EMPTY_CUSTOMER_KAEL_DRAFT_STATE)
  }, [state.deal?.draft.source])

  return (
    <V4Frame active="kael" testID="customer-kael-companion">
      {({ tokens }) => (
        <View style={styles.plainContent}>
          <View style={[styles.kaelCard, customerOpaqueSurface(tokens)]} testID="customer-kael-chatbox">
            <View style={styles.hiddenMarker} testID="customer-kael-ticket-composer" />
            <View style={[styles.kaelChatStage, customerOpaqueSurface(tokens), !hasAnyKaelInfo ? styles.kaelChatStageEmpty : null]} testID="customer-kael-conversation-feed">
              <View style={styles.hiddenMarker} testID="customer-kael-empty-chat-state" />
              {!hasAnyKaelInfo ? (
                <View style={styles.kaelBlankCanvas} testID="customer-kael-empty-chat-canvas">
                  <View style={[styles.kaelCanvasWashLarge, { backgroundColor: tokens.aqua }]} />
                  <View style={[styles.kaelCanvasWashWarm, { backgroundColor: tokens.copper }]} />
                  <View style={styles.kaelHubHeader} testID="customer-kael-service-intake-hub">
                    <KaelMascot variant="full" size={96} material="opaque" />
                    <View style={styles.kaelHubCopy}>
                      <Text style={[styles.kicker, { color: tokens.primary }]} numberOfLines={1}>
                        {copy.kael.hubKicker}
                      </Text>
                      <Text style={[styles.kaelHubGreeting, { color: tokens.text }]} numberOfLines={1}>
                        {copy.kael.hubGreeting}
                      </Text>
                      <Text style={[styles.kaelHubTitle, { color: tokens.text }]} numberOfLines={2}>
                        {copy.kael.hubTitle}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.kaelHubBody, { color: tokens.muted }]} numberOfLines={4}>
                    {copy.kael.hubBody}
                  </Text>
                  <Text style={[styles.kaelHubPrompt, { color: tokens.primary }]} numberOfLines={1}>
                    {copy.kael.quickPrompt}
                  </Text>
                  <View style={styles.kaelHubQuickRow} testID="customer-kael-hub-quick-services">
                    {quickKaelServices.map((serviceType) => {
                      const serviceLabel = localizedServiceLabel(serviceType, languageMode)
                      return (
                        <Pressable
                          accessibilityLabel={copy.kael.quickServiceA11y(serviceLabel)}
                          accessibilityRole="button"
                          key={serviceType}
                          onPress={() => startKaelService(serviceType)}
                          style={({ pressed }) => [styles.kaelHubChip, customerOpaqueSurface(tokens), pressed ? styles.pressed : null]}
                          testID={`customer-kael-hub-service-${serviceType}`}
                        >
                          <Text style={[styles.kaelHubChipText, { color: tokens.text }]} numberOfLines={1}>
                            {serviceLabel}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>
                </View>
              ) : (
                <>
                  <View style={styles.kaelSessionHeader}>
                    <Text style={[styles.kicker, { color: tokens.primary }]} numberOfLines={1}>
                      {copy.kael.sessionTitle}
                    </Text>
                    <Text style={[styles.sectionMeta, { color: isUnsupportedKaelService ? tokens.copper : hasEnoughKaelInfo ? tokens.primary : tokens.copper }]} numberOfLines={1}>
                      {isUnsupportedKaelService ? copy.kael.unsupportedService : shouldRevealKaelTicket ? copy.kael.sessionMetaReady : copy.kael.sessionMetaNeedsMore}
                    </Text>
                  </View>
                  <View style={[styles.kaelUserBubble, customerMessageSurface(tokens)]} testID="customer-kael-user-message">
                    <Text style={[styles.bubbleTitle, styles.kaelUserText, { color: tokens.text }]} numberOfLines={3}>
                      {displayedKaelAnswer}
                    </Text>
                  </View>
                  <View style={[styles.kaelAssistantBubble, customerOpaqueSurface(tokens)]} testID="customer-kael-assistant-guidance">
                    <Text style={[styles.bubbleKicker, { color: tokens.primary }]} numberOfLines={1}>
                      Kael
                    </Text>
                    <Text style={[styles.kaelAssistantText, { color: tokens.text }]} numberOfLines={4}>
                      {isUnsupportedKaelService ? copy.kael.unsupportedSummary : shouldRevealKaelTicket ? copy.kael.assistantSummary : copy.kael.assistantMoreDetail}
                    </Text>
                    {isUnsupportedKaelService ? (
                      <Text style={[styles.kaelAssistantHint, { color: tokens.muted }]} numberOfLines={3}>
                        {copy.kael.unsupportedHint}
                      </Text>
                    ) : !shouldRevealKaelTicket ? (
                      <Text style={[styles.kaelAssistantHint, { color: tokens.muted }]} numberOfLines={3}>
                        {copy.kael.assistantMoreDetailHint}
                      </Text>
                    ) : null}
                  </View>
                  {shouldRevealKaelTicket ? (
                    <View style={[styles.ticketCard, styles.kaelSummaryTicket, customerOpaqueSurface(tokens)]} testID="customer-kael-ticket-reveal-after-info">
                      <View style={styles.hiddenMarker} testID="customer-kael-repair-ticket" />
                      <View style={styles.sectionTitle}>
                        <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
                          {copy.kael.summaryTicket}
                        </Text>
                        <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
                          {copy.kael.sendAfterConfirm}
                        </Text>
                      </View>
                      <View style={styles.twoCol}>
                        <V4TicketCell label={copy.kael.service} value={kaelTicketService} testID="customer-kael-ticket-field-service" />
                        <V4TicketCell label={copy.ticket.issue} value={kaelTicketProblem} testID="customer-kael-ticket-field-problem" />
                      </View>
                      <View style={styles.hiddenMarker} testID="customer-kael-ticket-field-location" />
                      <View style={styles.hiddenMarker} testID="customer-kael-ticket-field-media" />
                      <View style={styles.hiddenMarker} testID="customer-kael-ticket-progress" />
                      <PrimaryButton label={copy.kael.bookingCta} onPress={() => push(kaelChatPath(localKaelDraft?.serviceType))} compact testID="customer-kael-ticket-booking-cta" />
                    </View>
                  ) : null}
                </>
              )}
              <KaelComposer attachLabel={copy.kael.attach} draft={kaelDraft} onAttach={openKaelAttachFlow} onChangeDraft={updateKaelDraft} onSubmit={submitKaelLocalDraft} />
            </View>
            {kaelError ? (
              <Text style={[styles.kaelErrorText, { color: tokens.danger }]} testID="customer-kael-active-deal-guard">
                {kaelError}
              </Text>
            ) : null}
          </View>
          <View style={styles.hiddenMarker} testID="customer-kael-worker-placeholder" />
        </View>
      )}
    </V4Frame>
  )
}

export function CustomerHistorySurface() {
  const { push, replace } = useRouter()
  const params = useLocalSearchParams<{ job_id?: string; scope_change?: string; tab?: string }>()
  const languageMode = useAppLanguage()
  const copy = customerCopy[languageMode]
  const { actions, dispatch, selectors, state } = useFrontendWorkflow()
  const requestedHistoryTab = isCustomerHistoryTab(params.tab) ? params.tab : null
  const [activeHistoryTab, setActiveHistoryTab] = useState<CustomerHistoryTab>(requestedHistoryTab ?? 'repair')
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
    : copy.history.needsConfirm
  const originalEstimateLabel = deal?.estimate?.priceRangeLabel ?? copy.history.needsConfirm
  const estimateLabel = originalEstimateLabel
  const newScopeLabel = scopeChange?.requestedDescription ?? copy.history.needsConfirm
  const timeline = getCustomerTimeline(selectors.currentStatus, languageMode)
  const visibleStatusLabel = customerVisibleStatusLabel(selectors.currentStatus, selectors.customerSearchState, languageMode)
  const workerStateLabel =
    selectors.customerSearchState === 'searching'
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
  const completionStatusLabel = selectors.canCustomerConfirmCompletion
    ? copy.history.needCustomerConfirm
    : selectors.currentStatus === 'confirmed_by_customer'
      ? copy.history.confirmed
      : copy.history.waitingWorkerDone
  const canCreateFreshRequest = !deal || selectors.currentStatus === 'confirmed_by_customer' || selectors.currentStatus === 'reviewed' || selectors.currentStatus === 'cancelled'
  const canEditNoWorkerRequest = selectors.customerSearchState === 'no_worker'
  const canCancelLocalRequest = selectors.canCustomerCancelDeal
  useEffect(() => {
    if (!requestedHistoryTab || requestedHistoryTab === activeHistoryTab) return
    setActiveHistoryTab(requestedHistoryTab)
  }, [activeHistoryTab, requestedHistoryTab])
  const selectHistoryTab = (tab: CustomerHistoryTab) => {
    setActiveHistoryTab(tab)
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
  const confirmCompletionReceived = () => {
    Alert.alert(
      copy.history.confirmDoneTitle,
      copy.history.confirmDoneBody,
      [
        { text: copy.history.checkAgain, style: 'cancel' },
        { text: copy.history.confirmDone, onPress: () => void actions.customerConfirmCompletion() },
      ],
    )
  }
  const confirmCancelLocalDeal = () => {
    const cancelMessage = selectors.hasLocalBroadcast
      ? copy.history.cancelSearching
      : copy.history.cancelDraft
    Alert.alert(copy.history.cancelTitle, cancelMessage, [
      { text: copy.history.keep, style: 'cancel' },
      { text: copy.history.cancelRequest, style: 'destructive', onPress: () => void actions.cancelRemoteJob() },
    ])
  }
  const confirmSearchFromPriceTab = () => {
    Alert.alert(copy.history.confirmSearchTitle, copy.history.confirmSearchBody, [
      { text: copy.history.checkAgain, style: 'cancel' },
      { text: copy.history.confirmSearch, onPress: () => void actions.confirmRemoteSearch() },
    ])
  }
  const submitSelectedReview = () => {
    if (!reviewRating) return
    void actions.submitReview({ rating: reviewRating, tags: [] })
  }
  const decideCurrentScopeChange = (decision: 'approve' | 'reject') => {
    if (!scopeChange) return
    Alert.alert(
      decision === 'approve' ? copy.history.scopeApproveTitle : copy.history.scopeRejectTitle,
      decision === 'approve'
        ? copy.history.scopeApproveBody
        : copy.history.scopeRejectBody,
      [
        { text: copy.history.checkAgain, style: 'cancel' },
        {
          text: decision === 'approve' ? copy.history.approve : copy.history.reject,
          style: decision === 'approve' ? 'default' : 'destructive',
          onPress: () => void actions.decideScopeChange(scopeChange.id, { decision }),
        },
      ],
    )
  }
  const historyActionLabel = canEditNoWorkerRequest ? copy.history.editRequest : canCreateFreshRequest ? copy.history.newRequest : copy.history.openPriceCheck
  const showRepairTab = activeHistoryTab === 'repair'
  const showPriceTab = activeHistoryTab === 'price'
  const showChatTab = activeHistoryTab === 'chat'
  const showDoneTab = activeHistoryTab === 'done'
  const isCompletedHistory = ['completed_by_worker', 'confirmed_by_customer', 'reviewed'].includes(selectors.currentStatus ?? '')
  const historySubtitle = deal
    ? visibleStatusLabel
    : showPriceTab
      ? (languageMode === 'en' ? 'Price and confirmation' : 'Bảng giá và xác nhận')
      : showChatTab
        ? (languageMode === 'en' ? 'Messages and Kael notes' : 'Tin nhắn và ghi chú Kael')
        : showDoneTab
          ? (languageMode === 'en' ? 'Completed work' : 'Công việc đã hoàn tất')
          : (languageMode === 'en' ? 'Track apartment requests' : 'Theo dõi yêu cầu của căn hộ')
  const historyPillLabel = deal
    ? copy.history.open
    : showPriceTab
      ? copy.history.filters[1]
      : showChatTab
        ? copy.history.filters[2]
        : showDoneTab
          ? copy.history.filters[3]
          : appCopy[languageMode].common.noRequest

  return (
    <V4Frame active="activity" testID="customer-history-surface">
      {({ tokens }) => (
        <View style={styles.plainContent}>
          <View pointerEvents="none" style={[styles.customerSectionLiquidWash, { backgroundColor: tokens.aqua }]} testID="customer-section-liquid-wash-activity" />
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
                {languageMode === 'en' ? 'Schedule' : 'Lịch hẹn'}
              </Text>
              <Text style={[styles.sectionMeta, { color: tokens.muted }]} numberOfLines={1}>
                {historySubtitle}
              </Text>
            </View>
            <View style={[styles.bookingStepPill, { backgroundColor: tokens.service, borderColor: tokens.border }]}>
              <Text style={[styles.bookingStepText, { color: tokens.primary }]} numberOfLines={1}>
                {historyPillLabel}
              </Text>
            </View>
          </View>
          <CustomerHistoryTabs activeTab={activeHistoryTab} labels={copy.history.filters} onTabChange={selectHistoryTab} tokens={tokens} />
          {showRepairTab ? <View style={[styles.historyHeroPanel, customerOpaqueSurface(tokens)]} testID="customer-history-repair-hero-panel">
            <SubtleLiquidLight testID="customer-history-repair-hero-liquid" variant="rim" />
            <View style={[styles.historyHeroStatusPill, { backgroundColor: tokens.service, borderColor: tokens.border }]}>
              <Text style={[styles.bookingStepText, { color: tokens.primary }]} numberOfLines={1}>
                {deal ? visibleStatusLabel : appCopy[languageMode].common.noRequest}
              </Text>
            </View>
            <View style={styles.sectionTitle}>
              <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
                {deal ? localizedServiceLabel(deal.draft.serviceType, languageMode) : localizedStatusLabel(null, languageMode)}
              </Text>
              <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
                {deal ? visibleStatusLabel : (languageMode === 'en' ? 'From Kael' : 'Từ Kael')}
              </Text>
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
                <V4TicketCell label={copy.ticket.issue} value={localizedProblemLabel(deal.draft.problemChips[0], deal.draft.serviceType, languageMode)} />
                <V4TicketCell label={copy.ticket.area} value={localizedCustomerAreaLabel(deal.draft.districtLabel, languageMode, copy.ticket.unknown)} />
              </View>
            ) : null}
            <View style={styles.historyHeroActions}>
              <PrimaryButton label={historyActionLabel} onPress={continueOrCreate} compact />
              <SecondaryButton label={languageMode === 'en' ? 'View chat' : 'Xem chat'} onPress={() => push(kaelChatPath(deal?.draft.serviceType))} compact tone="primary" />
            </View>
          </View> : null}
          {!deal && showPriceTab ? <CustomerHistoryPriceEmptyPanel copy={copy} languageMode={languageMode} onConfirmSearch={continueOrCreate} tokens={tokens} /> : null}
          {deal && showPriceTab ? <CustomerHistoryPricePanel canConfirmSearch={selectors.currentStatus === 'awaiting_customer_confirm'} copy={copy} deal={deal} estimateLabel={estimateLabel} languageMode={languageMode} onConfirmSearch={confirmSearchFromPriceTab} originalEstimateLabel={originalEstimateLabel} scopeChange={scopeChange} tokens={tokens} visibleStatusLabel={visibleStatusLabel} /> : null}
          {!deal && showChatTab ? <CustomerHistoryChatEmptyPanel copy={copy} languageMode={languageMode} onOpenKael={continueOrCreate} tokens={tokens} /> : null}
          {deal && showChatTab ? <CustomerHistoryChatPanel copy={copy} deal={deal} languageMode={languageMode} onOpenKael={continueOrCreate} tokens={tokens} visibleStatusLabel={visibleStatusLabel} /> : null}
          {deal && showRepairTab ? (
            <View style={[styles.flowCard, customerOpaqueSurface(tokens)]} testID="customer-history-worker-placeholder">
              <View style={styles.workerCard}>
                <View style={[styles.workerAvatar, { backgroundColor: tokens.water, borderColor: tokens.glassBorder }]} />
                <View style={styles.listCopy}>
                  <Text style={[styles.listTitle, { color: tokens.text }]} numberOfLines={1}>
                    {workerStateLabel}
                  </Text>
                </View>
                <View style={styles.workerActions}>
                  {selectors.canCustomerConfirmCompletion ? (
                    <PrimaryButton label={copy.history.confirmDone} onPress={confirmCompletionReceived} compact />
                  ) : (
                    <PrimaryButton label={historyActionLabel} onPress={continueOrCreate} compact />
                  )}
                  {canCancelLocalRequest ? <SecondaryButton label={copy.history.cancelRequest} onPress={confirmCancelLocalDeal} compact testID="customer-history-cancel-local-deal" /> : null}
                </View>
              </View>
            </View>
          ) : null}
          {deal && showRepairTab ? (
            <View style={[styles.flowCard, customerOpaqueSurface(tokens)]}>
              <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
                {copy.history.progress}
              </Text>
              {timeline.map((item) => (
                <View key={item.label} style={styles.timelineRow}>
                  <View style={[styles.timelineDot, { backgroundColor: item.active ? tokens.primary : tokens.borderStrong }]} />
                  <Text style={[styles.timelineText, { color: tokens.text }]} numberOfLines={1}>
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          {!deal && showRepairTab ? <CustomerHistoryRepairEmptyTimeline languageMode={languageMode} tokens={tokens} /> : null}
          {scopeChange && (showRepairTab || showPriceTab) ? (
            <View style={[styles.flowCard, customerOpaqueSurface(tokens)]}>
            <View style={styles.sectionTitle}>
              <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
                {copy.history.scope}
              </Text>
              <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
                {copy.history.waitingDecision}
              </Text>
            </View>
            <View style={styles.twoCol}>
              <V4TicketCell label={copy.ticket.current} value={visibleStatusLabel} />
              <V4TicketCell label={copy.ticket.update} value={scopeChange.requestedDescription ?? copy.history.needsConfirm} />
            </View>
              <View style={styles.workerActions} testID="customer-scope-change-decision">
                <View style={styles.twoCol}>
                  <V4TicketCell label={copy.history.reason} value={scopeChange.reason ?? copy.history.workerNoReason} />
                  <V4TicketCell label={copy.history.newPrice} value={scopeChange.priceMin && scopeChange.priceMax ? `${formatVnd(scopeChange.priceMin)} - ${formatVnd(scopeChange.priceMax)}` : copy.history.needsConfirm} />
                </View>
                <View style={styles.workerMetaRow}>
                  <SecondaryButton label={copy.history.reject} onPress={() => decideCurrentScopeChange('reject')} compact />
                  <PrimaryButton label={copy.history.approve} onPress={() => decideCurrentScopeChange('approve')} compact />
                </View>
              </View>
            </View>
          ) : null}
          {showDoneTab ? (
            <CustomerHistoryDoneHero canConfirmCompletion={selectors.canCustomerConfirmCompletion} canSubmitReview={selectors.canCustomerSubmitReview} copy={copy} deal={deal} isCompleted={isCompletedHistory} languageMode={languageMode} onConfirmCompletion={confirmCompletionReceived} onOpenChat={continueOrCreate} tokens={tokens} />
          ) : null}
          {deal && showDoneTab && isCompletedHistory ? (
            <CustomerCompletionPresenceMap copy={copy} deal={deal} languageMode={languageMode} tokens={tokens} visibleStatusLabel={visibleStatusLabel} />
          ) : null}
          {!deal && showDoneTab ? <CustomerHistoryDoneMapEmptyPanel copy={copy} tokens={tokens} /> : null}
          {deal && showDoneTab && !isCompletedHistory ? <CustomerHistoryDoneMapEmptyPanel copy={copy} tokens={tokens} /> : null}
          {deal && showDoneTab ? <CustomerCompletionEvidencePanel copy={copy} languageMode={languageMode} tokens={tokens} /> : null}
          {showDoneTab ? <CustomerHistoryDoneTimeline completionStatusLabel={completionStatusLabel} languageMode={languageMode} status={selectors.currentStatus} tokens={tokens} /> : null}
          {deal && showDoneTab && (selectors.canCustomerSubmitReview || ['confirmed_by_customer', 'reviewed'].includes(selectors.currentStatus ?? '')) ? (
            <CustomerHistoryReviewPanel copy={copy} onRatingChange={setReviewRating} onSubmit={submitSelectedReview} rating={reviewRating} selectors={selectors} tokens={tokens} />
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
  const { role, session } = useAuth()
  const themeMode = useCustomerThemeMode()
  const languageMode = useAppLanguage()
  const copy = customerCopy[languageMode]
  const toggleLanguage = () => setAppLanguage(languageMode === 'vi' ? 'en' : 'vi')
  const toggleTheme = () => setCustomerThemeMode(themeMode === 'light' ? 'dark' : 'light')
  const profileRoleLabel = role === 'customer' || role === 'admin' ? copy.profile.customer : copy.profile.unknownRole
  const customerMetadata = session?.user.user_metadata ?? {}
  const rawDisplayName = typeof customerMetadata.full_name === 'string' && customerMetadata.full_name.trim()
    ? customerMetadata.full_name.trim()
    : typeof customerMetadata.name === 'string' && customerMetadata.name.trim()
      ? customerMetadata.name.trim()
      : ''
  const rawPhone = typeof customerMetadata.phone_number === 'string' && customerMetadata.phone_number.trim()
    ? customerMetadata.phone_number.trim()
    : typeof customerMetadata.phone === 'string' && customerMetadata.phone.trim()
      ? customerMetadata.phone.trim()
      : ''
  const rawAddress = typeof customerMetadata.default_address === 'string' ? customerMetadata.default_address.trim() : ''
  const profileDisplayName = rawDisplayName || appCopy[languageMode].common.noData
  const profilePhone = rawPhone || (languageMode === 'en' ? 'Not verified' : 'Chưa xác minh')
  const profileAddress = rawAddress || appCopy[languageMode].common.noData
  const profileTitle = languageMode === 'en' ? 'Customer profile' : 'Hồ sơ khách'
  const profileSubtitle = languageMode === 'en' ? 'Information used for booking' : 'Thông tin dùng cho đặt lịch'
  const syncStatus = rawPhone ? (languageMode === 'en' ? 'Added' : 'Đã thêm') : (languageMode === 'en' ? 'Not verified' : 'Chưa xác minh')
  const setupSteps = [
    {
      active: Boolean(session),
      meta: session ? (languageMode === 'en' ? 'Created' : 'Đã tạo') : appCopy[languageMode].common.noData,
      title: languageMode === 'en' ? 'Account' : 'Tài khoản',
    },
    {
      active: Boolean(rawPhone),
      meta: rawPhone ? (languageMode === 'en' ? 'Added' : 'Đã thêm') : (languageMode === 'en' ? 'Waiting OTP' : 'Chờ OTP'),
      title: languageMode === 'en' ? 'Phone' : 'Điện thoại',
    },
    {
      active: Boolean(rawAddress),
      meta: rawAddress ? (languageMode === 'en' ? 'On profile' : 'Từ hồ sơ') : appCopy[languageMode].common.noData,
      title: languageMode === 'en' ? 'Address' : 'Địa chỉ',
    },
  ] as const

  return (
    <V4Frame active="profile" testID="customer-profile-surface">
      {({ tokens }) => (
        <View style={styles.plainContent}>
          <View pointerEvents="none" style={[styles.customerSectionLiquidWash, { backgroundColor: tokens.aqua }]} testID="customer-section-liquid-wash-profile" />
          <View style={[styles.profilePrototypeHero, glassSurface(tokens)]} testID="customer-profile-hero">
            <SubtleGlassHighlight />
            <View style={styles.hiddenMarker} testID="customer-profile-empty-state" />
            <SubtleLiquidLight testID="customer-profile-identity-liquid-card" variant="profile" />
            <View style={styles.profilePrototypeTop}>
              <View style={styles.profilePrototypeTitleRow}>
                <IconShell icon="person" size={52} tone="service" />
                <View style={styles.profilePrototypeTitleCopy}>
                  <Text style={[styles.profilePrototypeTitle, { color: tokens.text }]} numberOfLines={1}>
                    {profileTitle}
                  </Text>
                  <Text style={[styles.homeShortcutMeta, { color: tokens.muted }]} numberOfLines={1}>
                    {profileSubtitle}
                  </Text>
                </View>
              </View>
              <View style={[styles.profileButton, { backgroundColor: tokens.ghost, borderColor: tokens.border }]}>
                <Text style={[styles.profileButtonText, { color: tokens.primary }]} numberOfLines={1}>
                  {profileRoleLabel}
                </Text>
              </View>
            </View>
            <View style={styles.profileSetupSteps} testID="profileSetupSteps">
              {setupSteps.map((step) => (
                <CustomerProfileSetupStep active={step.active} key={step.title} meta={step.meta} title={step.title} />
              ))}
            </View>
            <View style={styles.hiddenMarker} testID="customer-admin-audit-switch" />
          </View>
          <View style={styles.hiddenMarker} testID="customer-profile-setup-card" />
          <View style={styles.hiddenMarker} testID="customer-shell-honest-profile-save" />
          <View style={[styles.syncPreview, customerOpaqueSurface(tokens)]} testID="customer-profile-sync-preview">
            <View style={styles.syncPreviewTop}>
              <Text style={[styles.syncPreviewTitle, { color: tokens.text }]} numberOfLines={1}>
                {languageMode === 'en' ? 'Synced from setup' : 'Đồng bộ từ thiết lập'}
              </Text>
              <View style={[styles.bookingStepPill, { backgroundColor: tokens.service, borderColor: tokens.border, minWidth: 0 }]}>
                <Text style={[styles.bookingStepText, { color: tokens.primary }]} numberOfLines={1}>
                  {syncStatus}
                </Text>
              </View>
            </View>
            <Text style={[styles.homeTrustBody, { color: tokens.muted }]} numberOfLines={2}>
              {languageMode === 'en'
                ? 'Setup details stay here and can be adjusted before booking.'
                : 'Thông tin thiết lập nằm ở đây và có thể chỉnh trước khi đặt lịch.'}
            </Text>
          </View>
          <View style={styles.profileActions}>
            <View style={[styles.listCard, customerOpaqueSurface(tokens)]} testID="customer-profile-checklist">
              <View style={styles.hiddenMarker} testID="customer-profile-unified-functions" />
              <View style={styles.hiddenMarker} testID="customer-profile-privacy-shell" />
              <ListRow icon="person" title={languageMode === 'en' ? 'Display name' : 'Tên hiển thị'} meta={profileDisplayName} />
              <ListRow icon="phone" title={languageMode === 'en' ? 'Phone number' : 'Số điện thoại'} meta={profilePhone} />
              <ListRow icon="map" title={languageMode === 'en' ? 'Default address' : 'Địa chỉ mặc định'} meta={profileAddress} testID="customer-utility-saved-address" />
              <View style={styles.hiddenMarker} testID="customer-profile-evidence-shell" />
            </View>
          </View>
          <View style={styles.profileActions}>
            <View style={[styles.listCard, customerOpaqueSurface(tokens)]}>
              <ActionRow icon="moon" title={copy.profile.interface} meta={themeMode === 'light' ? copy.profile.light : copy.profile.dark} onPress={toggleTheme} testID="customer-dark-mode-toggle-profile" />
              <ActionRow icon="menu" title={appCopy[languageMode].common.appLanguage} meta={languageDisplayName(languageMode)} onPress={toggleLanguage} testID="customer-language-toggle" />
              <View style={styles.hiddenMarker} testID="customer-utility-ticket-wallet" />
              <View style={styles.hiddenMarker} testID="customer-utility-support-entry" />
              <View style={styles.hiddenMarker} testID="customer-profile-payment-placeholder" />
              <View style={styles.hiddenMarker} testID="customer-profile-review-placeholder" />
            </View>
          </View>
        </View>
      )}
    </V4Frame>
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

  return (
    <CustomerThemeContext.Provider value={tokens}>
      <V4Dock active={active} bottomInset={insets.bottom} frameWidth={frameWidth} screenWidth={width} />
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
  return ['draft', 'cancelled', 'confirmed_by_customer', 'reviewed'].includes(status)
}

function isCustomerHistoryTab(tab: unknown): tab is CustomerHistoryTab {
  return typeof tab === 'string' && customerHistoryTabKeys.includes(tab as CustomerHistoryTab)
}

function customerVisibleStatusLabel(status: LocalDealStatus | null, searchState: LocalCustomerSearchState, language: AppLanguage = 'vi'): string {
  if (searchState === 'no_worker') return language === 'en' ? 'No worker accepted yet' : 'Chưa có thợ nhận'
  if (searchState === 'searching') return language === 'en' ? 'Waiting for worker' : 'Đang chờ thợ nhận'
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

function formatVnd(value: number) {
  return `${vndFormatter.format(value)}đ`
}

function isTerminalCustomerDeal(status: LocalDealStatus): boolean {
  return status === 'cancelled' || status === 'confirmed_by_customer' || status === 'reviewed'
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
  const pulse = useSharedValue(0)
  const settle = useSharedValue(0)
  useEffect(() => {
    pulse.value = 0
    pulse.value = withTiming(1, { duration: 220 })
    settle.value = 1
    settle.value = withDelay(80, withTiming(0, { duration: 300 }))
  }, [active, pulse, settle])
  const motionFieldStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0 : 0.08 + pulse.value * 0.04,
    transform: [{ translateY: settle.value * 2 }],
  }))
  const experimentalBackgroundImage =
    themeMode === 'dark'
      ? 'radial-gradient(circle at 50% 12%, rgba(105,222,198,0.16), transparent 30%), linear-gradient(180deg, #071312 0%, #141B18 100%)'
      : 'radial-gradient(circle at 50% 12%, rgba(142,231,217,0.35), transparent 28%), linear-gradient(180deg, #f2fbf7 0%, #fff9ee 100%)'
  const canvasLayer = {
    backgroundColor: tokens.canvas,
    experimental_backgroundImage: reduceTransparency ? undefined : experimentalBackgroundImage,
  } as any

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
          showsVerticalScrollIndicator={false}
          style={[styles.scroll, { backgroundColor: tokens.canvas }]}
        >
          <View style={styles.hiddenMarker} testID="customer-dark-layer-ecology" />
          <View style={styles.hiddenMarker} testID="customer-shell-motion-field" />
          <View style={styles.hiddenMarker} testID="customer-theme-layer-switch" />
          <View style={styles.hiddenMarker} testID="customer-client-prototype-parity-source" />
          <View style={styles.hiddenMarker} testID={CUSTOMER_NO_PROTOTYPE_SAMPLE_CLIENT_STATS} />
          <View style={styles.hiddenMarker} testID="customer-client-card-press-feedback" />
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
  screenWidth,
}: {
  active: CustomerDockActive
  bottomInset: number
  frameWidth: number
  screenWidth: number
}) {
  const { replace } = useRouter()
  const navigationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { reduceTransparency } = useGlassAccessibility()
  const languageMode = useAppLanguage()
  const copy = customerCopy[languageMode]
  const tokens = useCustomerTokens()
  const dockWidth = Math.max(0, Math.min(frameWidth - 32, 392))
  const dockLeft = Math.max((screenWidth - dockWidth) / 2, 16)
  const bottom = Math.max(bottomInset + customerDockBottomMargin, customerDockBottomMargin)
  type CustomerDockItem = FloatingGlassTabItem<CustomerDockActive> & {
    icon: IconName
    path: '/(customer)/home' | '/(customer)/booking' | '/(customer)/kael-chat' | '/(customer)/history' | '/(customer)/profile'
  }
  const items: CustomerDockItem[] = [
    { accessibilityLabel: copy.navA11y.home, key: 'home', icon: 'apartment', label: copy.nav.home, path: '/(customer)/home', testID: 'customer-v4-dock-home' },
    { accessibilityLabel: copy.navA11y.booking, key: 'booking', icon: 'document', label: copy.nav.booking, path: openBookingPath, testID: 'customer-v4-dock-booking' },
    { accessibilityLabel: copy.navA11y.kael, key: 'kael', icon: 'kael', label: copy.nav.kael, path: openKaelChatPath, testID: 'customer-v4-dock-kael' },
    { accessibilityLabel: copy.navA11y.activity, key: 'activity', icon: 'history', label: copy.nav.activity, path: '/(customer)/history', testID: 'customer-v4-dock-activity' },
    { accessibilityLabel: copy.navA11y.profile, key: 'profile', icon: 'person', label: copy.nav.profile, path: '/(customer)/profile', testID: 'customer-v4-dock-profile' },
  ]

  useEffect(() => {
    return () => {
      if (navigationTimerRef.current) clearTimeout(navigationTimerRef.current)
    }
  }, [])

  return (
    <View pointerEvents="box-none" style={[styles.dockWrap, { bottom, left: dockLeft, width: dockWidth }]}>
      <View pointerEvents="none" style={[styles.dockBackdropShield, { backgroundColor: tokens.canvas }]} testID="customer-dock-backdrop-shield" />
      <View pointerEvents="none" style={styles.hiddenMarker} testID="customer-dock-glass-aura" />
      <FloatingGlassTabBar<CustomerDockActive, CustomerDockItem>
        activeKey={active}
        items={items}
        mode={tokens.mode}
        onItemPress={(item) => {
          if (item.key === active) return
          lastCustomerDockActive = active
          if (navigationTimerRef.current) clearTimeout(navigationTimerRef.current)
          navigationTimerRef.current = setTimeout(() => {
            replace(item.path)
            navigationTimerRef.current = null
          }, 90)
        }}
        previousKey={lastCustomerDockActive}
        iconForItem={(item, focused) =>
          item.icon === 'kael' ? (
            <Image contentFit="contain" source={kaelModel8AHead} style={styles.dockKaelImage} />
          ) : (
            <IconGlyph name={item.icon} color={focused ? tokens.primary : tokens.subtleText} accent={focused ? tokens.copper : tokens.subtleText} />
          )
        }
        style={styles.glassDock}
        testID="customer-liquid-glass-dock"
      />
    </View>
  )
}

function MotionSweep({ frameWidth, screenWidth }: { frameWidth: number; screenWidth: number }) {
  const tokens = useCustomerTokens()
  if (tokens.glassHighlight === 'transparent') return null
  const progress = 0.36
  const sweepStyle = {
    opacity: 0.16,
    transform: [{ translateX: -120 + progress * (frameWidth + 240) }, { rotate: '8deg' }],
  }
  const left = Math.max((screenWidth - frameWidth) / 2, 0)

  return <View pointerEvents="none" style={[styles.motionSweep, { backgroundColor: tokens.glassHighlight, left }, sweepStyle]} />
}

function AmbientGlassField({ frameWidth, screenWidth }: { frameWidth: number; screenWidth: number }) {
  const tokens = useCustomerTokens()
  const lineStyle = {
    opacity: 0.13,
    transform: [{ rotate: '-12deg' }],
  }
  const left = Math.max((screenWidth - frameWidth) / 2, 0)

  return (
    <View pointerEvents="none" style={[styles.ambientGlassField, { left, width: frameWidth }]} testID="customer-section-glass-field">
      <View style={[styles.ambientMintWash, { backgroundColor: tokens.aqua }]} />
      <View style={[styles.ambientWarmWash, { backgroundColor: tokens.copper }]} />
      <View style={[styles.ambientGlassLine, { backgroundColor: tokens.borderStrong }, lineStyle]} />
    </View>
  )
}

function V4MapBackdrop({ presence = false }: { presence?: boolean }) {
  const tokens = useCustomerTokens()
  const route = presence ? 0.48 : 0
  const glowStyle = {
    opacity: 0.34,
    transform: [{ translateX: -59 }, { scale: 1 }],
  }
  const pinStyle = {
    transform: [{ translateX: -9 }, { scale: 1 }],
  }
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
      <View style={[styles.mapGlow, { backgroundColor: tokens.aqua }, glowStyle]} />
      {presence ? (
        <>
          <View style={[styles.mapRoute, { backgroundColor: tokens.primary }, routeStyle]} />
          <View style={[styles.mapRouteSoft, { backgroundColor: tokens.aqua }]} />
          <View style={[styles.mapVehicle, customerOpaqueSurface(tokens), vehicleStyle]}>
            <IconGlyph name="estimate" color={tokens.primary} accent={tokens.copper} />
          </View>
        </>
      ) : null}
      <View style={[styles.mapLine, styles.mapLineOne, { backgroundColor: tokens.borderStrong }]} />
      <View style={[styles.mapLine, styles.mapLineTwo, { backgroundColor: tokens.borderStrong }]} />
      <View style={[styles.mapLine, styles.mapLineThree, { backgroundColor: tokens.borderStrong }]} />
      <View style={[styles.mapRoom, styles.mapRoomOne, { borderColor: tokens.borderStrong }]} />
      <View style={[styles.mapRoom, styles.mapRoomTwo, { borderColor: tokens.borderStrong }]} />
      <View style={[styles.mapRoom, styles.mapRoomThree, { borderColor: tokens.borderStrong }]} />
      {presence ? <View style={[styles.mapPin, { backgroundColor: tokens.primary, borderColor: tokens.glassBorder }, pinStyle]} /> : null}
      <View style={[styles.mapNode, styles.mapNodeElectric, customerOpaqueSurface(tokens)]}>
        <IconGlyph name="boltPanel" color={tokens.primary} accent={tokens.copper} />
      </View>
      <View style={[styles.mapNode, styles.mapNodeWater, customerOpaqueSurface(tokens)]}>
        <IconGlyph name="waterPipe" color={tokens.primary} accent={tokens.aqua} />
      </View>
    </View>
  )
}

function V4ServiceCard({ compact = false, icon, meta, onPress, selected = false, testID, title, water }: { compact?: boolean; icon: IconName; meta?: string; onPress: () => void; selected?: boolean; testID: string; title: string; water?: boolean }) {
  const tokens = useCustomerTokens()
  const languageMode = useAppLanguage()
  const { reduceMotion } = useGlassAccessibility()
  const showMeta = compact
  return (
    <Pressable
      accessibilityLabel={languageMode === 'en' ? `Select service ${title}` : `Chọn dịch vụ ${title}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.serviceCard,
        compact ? styles.serviceCardCompact : null,
        customerOpaqueSurface(tokens),
        selected ? { backgroundColor: tokens.service, borderColor: tokens.borderStrong } : null,
        reduceMotionAwarePressStyle(pressed, reduceMotion),
      ]}
      testID={testID}
    >
      <View pointerEvents="none" style={[styles.glassRing, { borderColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.16)' : 'rgba(8,120,110,0.10)' }]} />
      <IconShell icon={icon} tone={water ? 'water' : icon === 'cleaning' ? 'warm' : 'service'} size={compact ? 34 : 38} />
      <Text style={[styles.serviceTitle, { color: tokens.text }]} numberOfLines={2}>
        {title}
      </Text>
      {meta ? (
        showMeta ? (
          <Text style={[styles.serviceMeta, { color: tokens.muted }]} numberOfLines={1}>
            {meta}
          </Text>
        ) : (
          <View style={styles.hiddenMarker} testID={`${testID}-meta-production-hidden`} />
        )
      ) : null}
    </Pressable>
  )
}

function CustomerHistoryTabs({
  activeTab,
  labels,
  onTabChange,
  tokens,
}: {
  activeTab: CustomerHistoryTab
  labels: readonly string[]
  onTabChange: (tab: CustomerHistoryTab) => void
  tokens: CustomerThemeTokens
}) {
  const { reduceMotion, reduceTransparency } = useGlassAccessibility()
  const [shellWidth, setShellWidth] = useState(0)
  const activeIndex = Math.max(0, customerHistoryTabKeys.indexOf(activeTab))
  const pillWidth = shellWidth > 0 ? Math.max((shellWidth - 24) / Math.max(labels.length, 1), 0) : 0
  const pillLeft = 6 + activeIndex * (pillWidth + 6)
  const tabProgress = useSharedValue(pillLeft)
  useEffect(() => {
    if (reduceMotion) {
      tabProgress.value = pillLeft
      return
    }
    tabProgress.value = withTiming(pillLeft, { duration: 210 })
  }, [pillLeft, reduceMotion, tabProgress])
  const liquidTabStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tabProgress.value }],
  }), [tabProgress])

  return (
    <View
      onLayout={(event) => {
        const nextWidth = event.nativeEvent.layout.width
        setShellWidth((current) => Math.abs(current - nextWidth) > 0.5 ? nextWidth : current)
      }}
      style={[styles.filterRow, glassSurface(tokens, 'strong')]}
      testID="customer-history-filter-shell"
    >
      <SubtleGlassHighlight />
      <SubtleLiquidLight testID="customer-history-tab-liquid-selector" variant="tab" />
      {pillWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.filterLiquidPill,
            {
              backgroundColor: reduceTransparency ? tokens.service : tokens.service,
              width: pillWidth,
            },
            liquidTabStyle,
          ]}
          testID="customer-history-tab-active-liquid-pill"
        >
          {!reduceTransparency ? <View style={[styles.filterLiquidSheen, { backgroundColor: tokens.glassHighlight }]} /> : null}
        </Animated.View>
      ) : null}
      {labels.map((label, index) => {
        const tab = customerHistoryTabKeys[index] ?? 'repair'
        const selected = tab === activeTab
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={tab}
            onPress={() => onTabChange(tab)}
            style={({ pressed }) => [
              styles.filterChip,
              selected ? { backgroundColor: 'transparent', borderColor: 'transparent' } : { backgroundColor: tokens.raised, borderColor: 'transparent' },
              pressed ? styles.pressed : null,
            ]}
            testID={`customer-history-tab-${tab}`}
          >
            <Text style={[styles.filterText, { color: selected ? tokens.primary : tokens.muted }]} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
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
    <View style={[styles.flowCard, customerOpaqueSurface(tokens)]} testID="customer-history-repair-empty-timeline">
      {emptyTimeline.map((item) => (
        <View key={item.label} style={styles.timelineRow}>
          <View style={[styles.timelineDot, { backgroundColor: tokens.borderStrong }]} />
          <View style={styles.listCopy}>
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
  onConfirmSearch,
  tokens,
}: {
  copy: (typeof customerCopy)[AppLanguage]
  languageMode: AppLanguage
  onConfirmSearch: () => void
  tokens: CustomerThemeTokens
}) {
  const priceRows = [
    [copy.history.filters[1], appCopy[languageMode].common.noRequest],
    [languageMode === 'en' ? 'Urgency' : 'Độ khẩn', copy.history.needsConfirm],
    [languageMode === 'en' ? 'Price band' : 'Biên giá', copy.history.needsConfirm],
    [languageMode === 'en' ? 'Confirm' : 'Xác nhận', copy.history.needsConfirm],
  ] as const

  return (
    <>
      <View style={[styles.bookingDiagnosisPanel, customerOpaqueSurface(tokens), { backgroundColor: tokens.service }]} testID="customer-history-price-empty-kael-summary">
        <View style={[styles.bookingDiagnosisPill, { backgroundColor: tokens.service, borderColor: tokens.borderStrong }]}>
          <IconGlyph name="kael" color={tokens.primary} accent={tokens.copper} />
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
      <View style={[styles.historyCheckPanel, customerOpaqueSurface(tokens)]} testID="customer-history-price-empty-checklist">
        <SubtleLiquidLight testID="customer-history-tab-liquid-selector" variant="tab" />
        <View style={styles.sectionTitle}>
          <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
            {languageMode === 'en' ? 'Price check' : 'Bảng kiểm giá'}
          </Text>
          <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
            {copy.history.needsConfirm}
          </Text>
        </View>
        <View style={styles.bookingGrid}>
          {priceRows.map(([label, value]) => (
            <View key={label} style={[styles.priceBox, customerOpaqueSurface(tokens)]}>
              <Text style={[styles.priceBoxLabel, { color: tokens.muted }]} numberOfLines={1}>
                {label}
              </Text>
              <Text style={[styles.priceBoxValue, { color: tokens.text }]} numberOfLines={2}>
                {value}
              </Text>
            </View>
          ))}
        </View>
        <PrimaryButton label={copy.history.openPriceCheck} onPress={onConfirmSearch} compact testID="customer-history-price-confirm-search" />
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
    <View style={[styles.historyThreadCard, customerOpaqueSurface(tokens)]} testID="customer-history-chat-empty-thread">
      <View style={styles.hiddenMarker} testID="customer-history-chat-empty-evidence" />
      <View style={[styles.chatPreviewCard, styles.chatPreviewKaelBubble, customerOpaqueSurface(tokens)]} testID="customer-history-chat-feed-preview">
        <Text style={[styles.bubbleKicker, { color: tokens.primary }]} numberOfLines={1}>
          Kael
        </Text>
        <Text style={[styles.homeTrustBody, { color: tokens.text }]} numberOfLines={3}>
          {copy.history.chatEmpty}
        </Text>
      </View>
      <PrimaryButton label={languageMode === 'en' ? 'Open Kael chat' : 'Mở chat Kael'} onPress={onOpenKael} compact />
    </View>
  )
}

function CustomerHistoryDoneMapEmptyPanel({
  copy,
  tokens,
}: {
  copy: (typeof customerCopy)[AppLanguage]
  tokens: CustomerThemeTokens
}) {
  return (
    <View style={[styles.presenceMapCard, styles.presenceMapCardCompact, customerOpaqueSurface(tokens)]} testID="customer-history-done-empty-timeline">
      <View style={styles.sectionTitle}>
        <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
          {copy.history.presenceTitle}
        </Text>
        <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
          {copy.history.needsConfirm}
        </Text>
      </View>
      <View style={[styles.presenceMapViewport, styles.presenceMapViewportCompact, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
        <V4MapBackdrop />
        <View style={[styles.presenceBadge, styles.presenceBadgeHome, { backgroundColor: tokens.service, borderColor: tokens.border }]} testID="customer-presence-map-done-empty-no-worker-badge">
          <IconGlyph name="apartment" color={tokens.primary} accent={tokens.aqua} />
          <Text style={[styles.presenceBadgeText, { color: tokens.text }]} numberOfLines={1}>
            {copy.history.presenceHome}
          </Text>
        </View>
      </View>
    </View>
  )
}

function CustomerCompletionEvidencePanel({
  copy,
  languageMode,
  tokens,
}: {
  copy: (typeof customerCopy)[AppLanguage]
  languageMode: AppLanguage
  tokens: CustomerThemeTokens
}) {
  const emptyValue = appCopy[languageMode].common.noData

  return (
    <View style={[styles.flowCard, customerOpaqueSurface(tokens)]} testID="customer-history-completion-evidence-panel">
      <View style={styles.sectionTitle}>
        <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
          {copy.history.evidence}
        </Text>
        <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
          {copy.history.needsConfirm}
        </Text>
      </View>
      <View style={styles.twoCol}>
        <V4TicketCell label={copy.history.evidenceBefore} value={emptyValue} />
        <V4TicketCell label={copy.history.evidenceAfter} value={emptyValue} />
      </View>
    </View>
  )
}

function CustomerHistoryDoneHero({
  canConfirmCompletion,
  canSubmitReview,
  copy,
  deal,
  isCompleted,
  languageMode,
  onConfirmCompletion,
  onOpenChat,
  tokens,
}: {
  canConfirmCompletion: boolean
  canSubmitReview: boolean
  copy: (typeof customerCopy)[AppLanguage]
  deal: LocalDeal | null
  isCompleted: boolean
  languageMode: AppLanguage
  onConfirmCompletion: () => void
  onOpenChat: () => void
  tokens: CustomerThemeTokens
}) {
  const title = isCompleted && deal
    ? `${localizedServiceLabel(deal.draft.serviceType, languageMode)}`
    : languageMode === 'en'
      ? 'No completed job yet'
      : 'Chưa có công việc hoàn tất'
  const body = isCompleted && deal
    ? languageMode === 'en'
      ? 'Review the completion state, receipt map, and final confirmation timeline.'
      : 'Kiểm tra trạng thái hoàn tất, bản đồ biên nhận và timeline xác nhận cuối.'
    : languageMode === 'en'
      ? 'Appears after real completion is updated.'
      : 'Chỉ hiện khi trạng thái hoàn tất được cập nhật.'
  const primaryLabel = canSubmitReview
    ? copy.history.review
    : canConfirmCompletion
      ? copy.history.confirmDone
      : isCompleted
        ? languageMode === 'en' ? 'View receipt' : 'Xem biên nhận'
        : copy.history.newRequest
  const primaryAction = canConfirmCompletion ? onConfirmCompletion : onOpenChat
  return (
    <View style={[styles.historyHeroPanel, styles.historyHeroPanelCompact, customerOpaqueSurface(tokens)]} testID="customer-history-done-hero">
      <SubtleLiquidLight testID="customer-history-done-hero-liquid" variant="rim" />
      <View style={[styles.historyHeroStatusPill, { backgroundColor: tokens.service, borderColor: tokens.border }]}>
        <Text style={[styles.bookingStepText, { color: tokens.primary }]} numberOfLines={1}>
          {isCompleted ? copy.history.filters[3] : appCopy[languageMode].common.noRequest}
        </Text>
      </View>
      <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
        {title}
      </Text>
      <Text style={[styles.historyHeroBody, styles.historyHeroBodyCompact, { color: tokens.muted }]} numberOfLines={2}>
        {body}
      </Text>
      <View style={styles.historyHeroActions}>
        <PrimaryButton label={primaryLabel} onPress={primaryAction} compact />
        <SecondaryButton label={isCompleted ? (languageMode === 'en' ? 'View receipt' : 'Xem biên nhận') : copy.history.openPriceCheck} onPress={onOpenChat} compact tone="primary" />
      </View>
    </View>
  )
}

function CustomerHistoryDoneTimeline({
  completionStatusLabel,
  languageMode,
  status,
  tokens,
}: {
  completionStatusLabel: string
  languageMode: AppLanguage
  status: LocalDealStatus | null
  tokens: CustomerThemeTokens
}) {
  const isWorkerDone = status === 'completed_by_worker' || status === 'confirmed_by_customer' || status === 'reviewed'
  const isCustomerDone = status === 'confirmed_by_customer' || status === 'reviewed'
  const isReviewStep = status === 'confirmed_by_customer' || status === 'reviewed'
  const rows: Array<readonly [string, string, boolean]> = languageMode === 'en'
    ? [
        ['Worker completed', isWorkerDone ? completionStatusLabel : 'Waiting for real completion state', isWorkerDone],
        ['Customer confirmed', isCustomerDone ? 'Customer receipt confirmed' : 'Not confirmed yet', isCustomerDone],
        ['Review pending', isReviewStep ? 'Ready for service review' : 'Opens after confirmation', isReviewStep],
      ]
    : [
        ['Thợ hoàn tất', isWorkerDone ? completionStatusLabel : 'Chờ trạng thái hoàn tất thật', isWorkerDone],
        ['Khách xác nhận', isCustomerDone ? 'Đã xác nhận nhận việc' : 'Chưa xác nhận', isCustomerDone],
        ['Chờ đánh giá', isReviewStep ? 'Sẵn sàng đánh giá dịch vụ' : 'Mở sau khi xác nhận', isReviewStep],
      ]

  return (
    <View style={[styles.flowCard, styles.flowCardCompact, customerOpaqueSurface(tokens)]} testID="customer-history-done-timeline">
      {rows.map(([title, meta, active]) => (
        <View key={title} style={[styles.timelineRow, styles.timelineRowCompact]}>
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
  copy,
  onRatingChange,
  onSubmit,
  rating,
  selectors,
  tokens,
}: {
  copy: (typeof customerCopy)[AppLanguage]
  onRatingChange: (rating: 1 | 2 | 3 | 4 | 5) => void
  onSubmit: () => void
  rating: 1 | 2 | 3 | 4 | 5 | null
  selectors: LocalWorkflowSelectors
  tokens: CustomerThemeTokens
}) {
  return (
    <View style={[styles.flowCard, customerOpaqueSurface(tokens)]}>
      <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
        {copy.history.paymentReview}
      </Text>
      <View style={styles.twoCol}>
        <V4TicketCell label={copy.history.payment} value={selectors.paymentLocked ? copy.history.locked : copy.history.open} />
        <V4TicketCell label={copy.history.review} value={selectors.reviewLocked ? copy.history.locked : copy.history.open} />
      </View>
      {selectors.canCustomerSubmitReview ? (
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
  canConfirmSearch,
  copy,
  deal,
  estimateLabel,
  languageMode,
  onConfirmSearch,
  originalEstimateLabel,
  scopeChange,
  tokens,
  visibleStatusLabel,
}: {
  canConfirmSearch: boolean
  copy: (typeof customerCopy)[AppLanguage]
  deal: LocalDeal
  estimateLabel: string
  languageMode: AppLanguage
  onConfirmSearch: () => void
  originalEstimateLabel: string
  scopeChange: LocalScopeChange | null
  tokens: CustomerThemeTokens
  visibleStatusLabel: string
}) {
  const scopePrice =
    scopeChange?.priceMin && scopeChange.priceMax
      ? `${formatVnd(scopeChange.priceMin)} - ${formatVnd(scopeChange.priceMax)}`
      : copy.history.needsConfirm
  const problemLabel = deal.estimate?.problemLabel
    ?? localizedProblemLabel(deal.draft.problemChips[0] ?? deal.draft.inferredProblemLabel, deal.draft.serviceType, languageMode)
  const urgencyLabel = deal.estimate?.complexity && deal.estimate.complexity !== 'unknown'
    ? deal.estimate.complexity
    : copy.history.needsConfirm
  const priceGrid = [
    [copy.history.filters[1], estimateLabel],
    [languageMode === 'en' ? 'Urgency' : 'Độ khẩn', urgencyLabel],
    [languageMode === 'en' ? 'Risk' : 'Rủi ro', problemLabel],
    [languageMode === 'en' ? 'Confirm' : 'Xác nhận', copy.history.needsConfirm],
  ] as const

  return (
    <View style={[styles.historyCheckPanel, customerOpaqueSurface(tokens)]} testID="customer-history-price-tab-panel">
      <View style={styles.sectionTitle}>
        <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
          {copy.history.filters[1]}
        </Text>
        <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
          {visibleStatusLabel}
        </Text>
      </View>
      <View style={[styles.bookingDiagnosisPanel, customerOpaqueSurface(tokens), { backgroundColor: tokens.service }]} testID="customer-history-price-kael-summary">
        <View style={[styles.bookingDiagnosisPill, { backgroundColor: tokens.service, borderColor: tokens.borderStrong }]}>
          <IconGlyph name="kael" color={tokens.primary} accent={tokens.copper} />
          <Text style={[styles.bookingDiagnosisPillText, { color: tokens.primary }]} numberOfLines={1}>
            {languageMode === 'en' ? 'Kael price summary' : 'Kael tóm tắt giá'}
          </Text>
        </View>
        <Text style={[styles.bookingDiagnosisBody, { color: tokens.text }]} numberOfLines={4}>
            {deal.estimate?.advisory ?? copy.history.priceDisclaimer}
        </Text>
      </View>
      <View style={styles.bookingGrid} testID="customer-history-price-check-grid">
        {priceGrid.map(([label, value]) => (
          <View key={label} style={[styles.priceBox, customerOpaqueSurface(tokens)]}>
            <Text style={[styles.priceBoxLabel, { color: tokens.muted }]} numberOfLines={1}>
              {label}
            </Text>
            <Text style={[styles.priceBoxValue, { color: tokens.text }]} numberOfLines={2}>
              {value}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.twoCol}>
        <V4TicketCell label={copy.history.filters[1]} value={originalEstimateLabel} />
        <V4TicketCell label={copy.ticket.finalPrice} value={copy.history.waitingWorkerPrice} />
      </View>
      {scopeChange ? (
        <View style={styles.twoCol}>
          <V4TicketCell label={copy.history.reason} value={scopeChange.reason ?? copy.history.workerNoReason} />
          <V4TicketCell label={copy.history.newPrice} value={scopePrice} />
        </View>
      ) : null}
      <Text style={[styles.historyDisclaimerText, { color: tokens.muted }]} numberOfLines={3} testID="customer-history-price-disclaimer">
        {copy.history.priceDisclaimer}
      </Text>
      {canConfirmSearch ? (
        <PrimaryButton label={copy.history.confirmSearch} onPress={onConfirmSearch} compact testID="customer-history-price-confirm-search" />
      ) : (
        <V4TicketCell label={copy.history.confirmSearch} testID="customer-history-price-confirm-search-locked" value={visibleStatusLabel} />
      )}
    </View>
  )
}

function CustomerHistoryChatPanel({
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
  const statusValue = visibleStatusLabel
  const issueValue = localizedProblemLabel(deal.draft.problemChips[0] ?? deal.draft.inferredProblemLabel, deal.draft.serviceType, languageMode)
  const descriptionValue = deal.draft.description.trim() || copy.history.chatEmpty
  const kaelSummaryValue = deal.estimate?.advisory ?? copy.history.chatEmpty

  return (
    <View style={[styles.historyThreadCard, customerOpaqueSurface(tokens)]} testID="customer-history-chat-tab-panel">
      <View style={styles.sectionTitle}>
        <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
          {copy.history.filters[2]}
        </Text>
        <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
          Kael
        </Text>
      </View>
      <View style={styles.hiddenMarker} testID="customer-history-chat-empty-evidence" />
      <View style={[styles.chatPreviewCard, styles.chatPreviewKaelBubble, customerOpaqueSurface(tokens)]} testID="customer-history-chat-feed-preview">
        <Text style={[styles.bubbleKicker, { color: tokens.primary }]} numberOfLines={1}>
          Kael
        </Text>
        <Text style={[styles.homeTrustBody, { color: tokens.text }]} numberOfLines={3}>
          {languageMode === 'en'
            ? `Request status: ${statusValue}. Problem: ${issueValue}.`
            : `Trạng thái: ${statusValue}. Vấn đề: ${issueValue}.`}
        </Text>
      </View>
      <View style={[styles.chatPreviewCard, styles.chatPreviewUserBubble, { backgroundColor: tokens.service, borderColor: tokens.border }]} testID="customer-history-chat-user-bubble">
        <Text style={[styles.bubbleKicker, { color: tokens.primary }]} numberOfLines={1}>
          {languageMode === 'en' ? 'Customer' : 'Khách'}
        </Text>
        <Text style={[styles.homeTrustBody, { color: tokens.text }]} numberOfLines={3}>
          {descriptionValue}
        </Text>
      </View>
      <View style={[styles.chatPreviewCard, styles.chatPreviewKaelBubble, customerOpaqueSurface(tokens)]} testID="customer-history-chat-kael-bubble">
        <Text style={[styles.bubbleKicker, { color: tokens.primary }]} numberOfLines={1}>
          Kael
        </Text>
        <Text style={[styles.homeTrustBody, { color: tokens.text }]} numberOfLines={3}>
          {kaelSummaryValue}
        </Text>
      </View>
      <PrimaryButton label={copy.history.openPriceCheck} onPress={onOpenKael} compact />
    </View>
  )
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
    <View style={[styles.presenceMapCard, customerOpaqueSurface(tokens)]} testID="customer-presence-map-done">
      <View style={styles.sectionTitle}>
        <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
          {copy.history.presenceTitle}
        </Text>
        <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
          {visibleStatusLabel}
        </Text>
      </View>
      <View style={[styles.presenceMapViewport, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
        <V4MapBackdrop presence />
        <View style={[styles.presenceBadge, styles.presenceBadgeHome, { backgroundColor: tokens.service, borderColor: tokens.border }]}>
          <IconGlyph name="apartment" color={tokens.primary} accent={tokens.aqua} />
          <Text style={[styles.presenceBadgeText, { color: tokens.text }]} numberOfLines={1}>
            {copy.history.presenceHome}
          </Text>
        </View>
        <View style={[styles.presenceBadge, styles.presenceBadgeWorker, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
          <IconGlyph name="check" color={tokens.primary} accent={tokens.copper} />
          <Text style={[styles.presenceBadgeText, { color: tokens.text }]} numberOfLines={1}>
            {copy.history.presenceWorker}
          </Text>
        </View>
      </View>
      <View style={styles.twoCol}>
        <V4TicketCell label={copy.ticket.area} value={addressLabel} />
        <V4TicketCell label={copy.ticket.status} value={visibleStatusLabel} />
      </View>
    </View>
  )
}

function V4TicketCell({ label, testID, value }: { label: string; testID?: string; value: string }) {
  const tokens = useCustomerTokens()
  return (
    <View style={[styles.ticketCell, customerOpaqueSurface(tokens)]} testID={testID}>
      <Text style={[styles.ticketLabel, { color: tokens.muted }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.ticketValue, { color: tokens.text }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  )
}

function CustomerProfileSetupStep({ active, meta, title }: { active: boolean; meta: string; title: string }) {
  const tokens = useCustomerTokens()
  return (
    <View style={[styles.profileSetupStep, active ? { backgroundColor: tokens.service, borderColor: tokens.borderStrong } : { backgroundColor: tokens.raised, borderColor: tokens.border }]} testID="CustomerProfileSetupStep">
      <Text style={[styles.profileSetupStepTitle, { color: tokens.text }]} numberOfLines={1}>
        {title}
      </Text>
      <Text style={[styles.profileSetupStepMeta, { color: active ? tokens.primary : tokens.muted }]} numberOfLines={1}>
        {meta}
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
      <IconGlyph name={icon} color={tokens.primary} accent={tokens.copper} />
      <Text style={[styles.quickTitle, { color: tokens.text }]} numberOfLines={2}>
        {title}
      </Text>
    </View>
  )
}

function ListRow({ icon, meta, testID, title }: { icon: IconName; meta: string; testID?: string; title: string }) {
  const tokens = useCustomerTokens()
  return (
    <View style={styles.listRow} testID={testID}>
      <IconGlyph name={icon} color={tokens.primary} accent={tokens.copper} />
      <View style={styles.listCopy}>
        <Text style={[styles.listTitle, { color: tokens.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.listMeta, { color: tokens.subtleText }]} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Text style={[styles.chevron, { color: tokens.text }]} numberOfLines={1}>
        ›
      </Text>
    </View>
  )
}

function ActionRow({
  icon,
  meta,
  onPress,
  testID,
  title,
}: {
  icon: IconName
  meta: string
  onPress: () => void
  testID: string
  title: string
}) {
  const tokens = useCustomerTokens()
  return (
    <Pressable accessibilityLabel={title} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.listRow, pressed ? styles.pressed : null]} testID={testID}>
      <IconGlyph name={icon} color={tokens.primary} accent={tokens.copper} />
      <View style={styles.listCopy}>
        <Text style={[styles.listTitle, { color: tokens.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.listMeta, { color: tokens.subtleText }]} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Text style={[styles.chevron, { color: tokens.text }]} numberOfLines={1}>
        ›
      </Text>
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
      <IconGlyph name={icon} color={tokens.primary} accent={tokens.copper} />
    </View>
  )
}

function IconShell({ icon, tone = 'service', size = 46 }: { icon: IconName; tone?: SurfaceTone; size?: number }) {
  const tokens = useCustomerTokens()
  const accent = tone === 'water' ? tokens.aqua : tone === 'warm' ? tokens.copper : tokens.copper
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
      <IconGlyph name={icon} color={tokens.primary} accent={accent} />
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

function KaelComposer({
  attachLabel,
  draft,
  onAttach,
  onChangeDraft,
  onSubmit,
}: {
  attachLabel?: string
  draft: string
  onAttach?: () => void
  onChangeDraft: (value: string) => void
  onSubmit: () => void
}) {
  const tokens = useCustomerTokens()
  const languageMode = useAppLanguage()
  const inputLabel = languageMode === 'en' ? 'Describe the problem for Kael' : 'Mô tả vấn đề cho Kael'
  const placeholder = languageMode === 'en' ? 'Describe the problem...' : 'Mô tả vấn đề...'
  const sendLabel = languageMode === 'en' ? 'Send' : 'Gửi'
  const hasDraft = draft.trim().length > 0
  const attachControl = onAttach ? (
    <Pressable accessibilityLabel={attachLabel} accessibilityRole="button" onPress={onAttach} style={({ pressed }) => [styles.composerTool, { borderColor: tokens.border }, pressed ? styles.pressed : null]}>
      <Text style={[styles.composerToolText, { color: tokens.primary }]} numberOfLines={1}>
        +
      </Text>
    </Pressable>
  ) : (
    <View pointerEvents="none" style={[styles.composerTool, { borderColor: tokens.border }]}>
      <Text style={[styles.composerToolText, { color: tokens.primary }]} numberOfLines={1}>
        +
      </Text>
    </View>
  )
  return (
    <View style={[styles.composer, styles.kaelComposerInline, glassSurface(tokens, 'strong')]} testID="customer-kael-composer-dock">
      <SubtleGlassHighlight />
      {attachControl}
      <TextInput
        accessibilityLabel={inputLabel}
        maxLength={220}
        onChangeText={onChangeDraft}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={tokens.subtleText}
        returnKeyType="send"
        style={[styles.composerInput, { color: tokens.text }]}
        testID="customer-kael-local-chat-input"
        value={draft}
      />
      <Pressable accessibilityLabel={sendLabel} accessibilityRole="button" accessibilityState={{ disabled: !hasDraft }} disabled={!hasDraft} onPress={onSubmit} style={({ pressed }) => [styles.sendButton, { backgroundColor: hasDraft ? tokens.primary : tokens.border, opacity: hasDraft ? 1 : 0.72 }, pressed && hasDraft ? styles.pressed : null]}>
        <IconGlyph name="send" color={hasDraft ? tokens.primaryText : tokens.subtleText} accent={hasDraft ? tokens.primaryText : tokens.subtleText} />
      </Pressable>
    </View>
  )
}

function SmallChip({ label, tone = 'base' }: { label: string; tone?: SurfaceTone }) {
  const tokens = useCustomerTokens()
  return (
    <View style={[styles.smallChip, { backgroundColor: getLayerSurface(tokens, tone), borderColor: tokens.border }]}>
      <Text style={[styles.smallChipText, { color: tokens.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

function useCustomerTokens(): CustomerThemeTokens {
  return use(CustomerThemeContext)
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

function glassSurface(tokens: CustomerThemeTokens, tone: 'default' | 'strong' | 'warm' | 'service' | 'water' | 'depth' = 'default') {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.glassShadow === 'none'
  const warmAccent = tokens.mode === 'dark' ? 'rgba(224,160,107,0.20)' : 'rgba(255,184,102,0.23)'
  const softWarmAccent = tokens.mode === 'dark' ? 'rgba(224,160,107,0.13)' : 'rgba(255,184,102,0.14)'
  const mintWash = tokens.mode === 'dark' ? 'rgba(105,222,198,0.17)' : 'rgba(183,246,231,0.34)'
  const backgroundColor =
    tone === 'strong'
      ? tokens.glassStrong
      : tone === 'warm'
        ? tokens.glassWarm
        : tone === 'service'
          ? tokens.mode === 'dark'
            ? 'rgba(23,59,53,0.72)'
            : 'rgba(220,243,236,0.68)'
          : tone === 'water'
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
      ? tone === 'warm'
        ? `radial-gradient(circle at 84% 42%, ${warmAccent}, transparent 31%), radial-gradient(circle at 18% 88%, ${mintWash}, transparent 38%), linear-gradient(120deg, rgba(59,41,27,0.70), rgba(18,34,32,0.68))`
        : tone === 'service'
          ? `radial-gradient(circle at 88% 16%, ${softWarmAccent}, transparent 22%), radial-gradient(circle at 74% 62%, rgba(105,222,198,0.18), transparent 34%), linear-gradient(145deg, rgba(23,59,53,0.78), rgba(12,26,25,0.68))`
          : tone === 'water'
            ? `radial-gradient(circle at 92% 12%, ${softWarmAccent}, transparent 20%), radial-gradient(circle at 78% 62%, rgba(105,222,198,0.16), transparent 34%), linear-gradient(145deg, rgba(21,54,58,0.76), rgba(12,26,25,0.68))`
            : `radial-gradient(circle at 94% 10%, ${softWarmAccent}, transparent 20%), radial-gradient(circle at 10% 92%, ${mintWash}, transparent 34%), linear-gradient(145deg, rgba(22,43,40,0.78), rgba(12,26,25,0.68))`
      : tone === 'warm'
        ? `radial-gradient(circle at 84% 42%, ${warmAccent}, transparent 31%), radial-gradient(circle at 18% 88%, ${mintWash}, transparent 38%), linear-gradient(120deg, rgba(201,248,237,0.62), rgba(255,243,205,0.48))`
        : tone === 'service'
          ? `radial-gradient(circle at 88% 16%, ${softWarmAccent}, transparent 22%), radial-gradient(circle at 74% 62%, rgba(22,185,168,0.26), transparent 34%), linear-gradient(145deg, rgba(255,255,255,0.50), rgba(221,248,241,0.56))`
          : tone === 'water'
            ? `radial-gradient(circle at 92% 12%, ${softWarmAccent}, transparent 20%), radial-gradient(circle at 78% 62%, rgba(33,165,177,0.28), transparent 34%), linear-gradient(145deg, rgba(255,255,255,0.50), rgba(221,249,247,0.58))`
            : `radial-gradient(circle at 94% 10%, ${softWarmAccent}, transparent 20%), radial-gradient(circle at 10% 92%, ${mintWash}, transparent 34%), linear-gradient(145deg, rgba(255,255,255,0.50), rgba(224,248,242,0.34))`

  return {
    backgroundColor,
    borderColor: tokens.glassBorder,
    boxShadow:
      reduceTransparency
        ? 'none'
        : tone === 'default' || tone === 'strong'
        ? tokens.mode === 'dark'
          ? '0 10px 24px rgba(0,0,0,0.18)'
          : '0 10px 24px rgba(13,70,65,0.07)'
        : 'none',
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
    backgroundColor: tokens.mode === 'dark' ? 'rgba(22,43,40,0.94)' : 'rgba(255,253,248,0.96)',
    borderColor: tokens.border,
    boxShadow: tokens.mode === 'dark' ? '0 8px 22px rgba(0,0,0,0.18)' : '0 8px 22px rgba(17,70,61,0.06)',
    experimental_backgroundImage:
      tokens.mode === 'dark'
        ? 'linear-gradient(180deg, rgba(22,43,40,0.96), rgba(18,39,36,0.94))'
        : 'linear-gradient(180deg, rgba(255,255,255,0.94), rgba(248,255,252,0.88))',
  }
}

function customerIconSurface(tokens: CustomerThemeTokens, tone: SurfaceTone = 'service') {
  const isWater = tone === 'water'
  const isWarm = tone === 'warm'
  return {
    backgroundColor: tokens.mode === 'dark'
      ? isWater
        ? '#15363A'
        : isWarm
          ? '#3B291B'
          : '#173B35'
      : isWater
        ? '#E8FCFA'
        : isWarm
          ? '#FFF8EB'
          : '#DCFBF3',
    borderColor: isWater
      ? tokens.mode === 'dark' ? 'rgba(118,220,227,0.22)' : 'rgba(33,140,178,0.22)'
      : isWarm
        ? tokens.mode === 'dark' ? 'rgba(224,160,107,0.24)' : 'rgba(176,118,44,0.22)'
        : tokens.borderStrong,
    boxShadow: tokens.mode === 'dark' ? '0 8px 18px rgba(0,0,0,0.18)' : '0 10px 18px rgba(17,70,61,0.08)',
    experimental_backgroundImage: tokens.mode === 'dark'
      ? isWater
        ? 'radial-gradient(circle at 30% 22%, rgba(255,255,255,0.12), transparent 34%), linear-gradient(145deg, rgba(21,54,58,0.98), rgba(12,28,30,0.94))'
        : isWarm
          ? 'radial-gradient(circle at 30% 22%, rgba(255,255,255,0.12), transparent 34%), linear-gradient(145deg, rgba(59,41,27,0.98), rgba(32,24,18,0.94))'
          : 'radial-gradient(circle at 30% 22%, rgba(255,255,255,0.12), transparent 34%), linear-gradient(145deg, rgba(23,59,53,0.98), rgba(12,32,29,0.94))'
      : isWater
        ? 'radial-gradient(circle at 30% 22%, rgba(255,255,255,0.92), transparent 34%), linear-gradient(145deg, rgba(214,246,255,0.98), rgba(240,253,255,0.94))'
        : isWarm
          ? 'radial-gradient(circle at 30% 22%, rgba(255,255,255,0.94), transparent 34%), linear-gradient(145deg, rgba(255,239,196,0.98), rgba(255,253,242,0.94))'
          : 'radial-gradient(circle at 30% 22%, rgba(255,255,255,0.92), transparent 34%), linear-gradient(145deg, rgba(190,248,235,0.98), rgba(230,255,249,0.94))',
  }
}

function SubtleGlassHighlight() {
  const tokens = useCustomerTokens()
  if (tokens.glassHighlight === 'transparent') return null
  return <View pointerEvents="none" style={[styles.glassTopHighlight, { backgroundColor: tokens.glassHighlight }]} />
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
    height: 190,
    opacity: 0.16,
    position: 'absolute',
    right: -92,
    top: 152,
    transform: [{ rotate: '-8deg' }],
    width: 220,
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
  dockBackdropShield: {
    borderRadius: 36,
    bottom: -10,
    height: 88,
    left: -6,
    opacity: 0.86,
    position: 'absolute',
    right: -6,
    zIndex: -2,
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
  glassDock: {
    alignItems: 'center',
    borderRadius: 29,
    borderWidth: 1,
    boxShadow: '0 8px 20px rgba(13,70,65,0.07), inset 0 1px 0 rgba(255,255,255,0.62)',
    flexDirection: 'row',
    gap: 4,
    minHeight: 64,
    overflow: 'hidden',
    padding: 7,
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
    height: 210,
    opacity: 0.13,
    position: 'absolute',
    right: -86,
    top: 38,
    width: 210,
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
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 29,
  },
  homeBell: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 44,
  },
  plainContent: {
    gap: 12,
    position: 'relative',
  },
  presenceMapCard: {
    borderRadius: 30,
    borderWidth: 1,
    gap: 12,
    overflow: 'hidden',
    padding: 13,
  },
  presenceMapCardCompact: {
    borderRadius: 26,
    gap: 8,
    padding: 10,
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
    borderRadius: 23,
    minHeight: 92,
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
    top: 42,
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
    height: 118,
    left: '50%',
    opacity: 0.42,
    position: 'absolute',
    top: 150,
    transform: [{ translateX: -59 }],
    width: 118,
  },
  mapRoute: {
    borderRadius: 999,
    height: 12,
    left: 78,
    opacity: 0.5,
    position: 'absolute',
    top: 222,
    transformOrigin: 'left center',
    width: 232,
  },
  mapRouteSoft: {
    borderRadius: 999,
    height: 54,
    left: 70,
    opacity: 0.12,
    position: 'absolute',
    top: 200,
    transform: [{ rotate: '-19deg' }],
    width: 246,
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
    top: 214,
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
    top: 110,
    transform: [{ rotate: '-10deg' }],
  },
  mapLineTwo: {
    right: -40,
    top: 210,
    transform: [{ rotate: '25deg' }],
  },
  mapLineThree: {
    left: -28,
    top: 286,
    transform: [{ rotate: '-32deg' }],
  },
  mapRoom: {
    borderRadius: 18,
    borderWidth: 2,
    opacity: 0.42,
    position: 'absolute',
  },
  mapRoomOne: {
    height: 132,
    left: 42,
    top: 138,
    width: 150,
  },
  mapRoomTwo: {
    height: 118,
    right: 35,
    top: 188,
    width: 138,
  },
  mapRoomThree: {
    height: 108,
    left: 68,
    top: 318,
    width: 196,
  },
  mapPin: {
    borderRadius: 999,
    borderWidth: 3,
    height: 18,
    left: '50%',
    opacity: 0.9,
    position: 'absolute',
    top: 205,
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
    top: 170,
  },
  mapNodeWater: {
    right: 52,
    top: 246,
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
    fontWeight: '500',
    letterSpacing: 0,
  },
  homeMapSpace: {
    height: 112,
  },
  homeSheet: {
    boxShadow: 'none',
    gap: 14,
    marginTop: 12,
    minHeight: 620,
    padding: 0,
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
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 20,
  },
  homeAddressMeta: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0,
    lineHeight: 15,
  },
  homeCommandHero: {
    borderRadius: 28,
    borderWidth: 1,
    boxShadow: '0 18px 36px rgba(21,89,78,0.10)',
    minHeight: 210,
    overflow: 'hidden',
    padding: 16,
  },
  homeCommandHitArea: {
    flex: 1,
    gap: 10,
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
    fontWeight: '500',
    letterSpacing: 0,
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
    fontWeight: '500',
    letterSpacing: 0,
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
  homeCommandPromptText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 19,
    minWidth: 0,
  },
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
    borderRadius: 20,
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  homeCommandSendText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0,
  },
  homeCommandWash: {
    borderRadius: 999,
    height: 180,
    opacity: 0.16,
    position: 'absolute',
    right: -52,
    top: -48,
    width: 180,
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
  bookingCheckPanel: {
    borderRadius: 22,
    borderWidth: 1,
    gap: 10,
    overflow: 'hidden',
    padding: 15,
    position: 'relative',
  },
  bookingStack: {
    gap: 12,
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
  bookingStepPill: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 92,
    paddingHorizontal: 12,
  },
  bookingStepText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 15,
  },
  bookingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    position: 'relative',
    zIndex: 1,
  },
  priceBox: {
    borderRadius: 20,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    gap: 5,
    minHeight: 68,
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
  priceBoxValue: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 20,
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
    fontWeight: '800',
    letterSpacing: 0,
  },
  bookingDiagnosisBody: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 20,
  },
  historyHeroPanel: {
    borderRadius: 28,
    borderWidth: 1,
    gap: 14,
    overflow: 'hidden',
    padding: 16,
    position: 'relative',
  },
  historyHeroPanelCompact: {
    gap: 8,
    padding: 12,
  },
  historyHeroStatusPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 12,
  },
  historyHeroBody: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0,
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
    gap: 12,
    overflow: 'hidden',
    padding: 15,
    position: 'relative',
  },
  historyThreadCard: {
    borderRadius: 26,
    borderWidth: 1,
    gap: 12,
    overflow: 'hidden',
    padding: 15,
    position: 'relative',
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
    fontWeight: '500',
    letterSpacing: 0,
    lineHeight: 17,
  },
  homeShortcutGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  homeShortcutTile: {
    borderRadius: 22,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    gap: 5,
    justifyContent: 'center',
    minHeight: 76,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  homeShortcutCopy: {
    gap: 3,
    minWidth: 0,
  },
  homeShortcutTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 17,
  },
  homeShortcutMeta: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0,
    lineHeight: 15,
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
    fontWeight: '500',
    letterSpacing: 0,
    lineHeight: 17,
  },
  homeServicesBlock: {
    gap: 12,
    marginTop: 22,
  },
  homeServicesTitle: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 23,
  },
  homeServicesMeta: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 16,
  },
  notificationInlineCard: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 56,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  notificationInlineText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 18,
  },
  notificationInlineBody: {
    flex: 1,
    gap: 3,
  },
  notificationInlineItem: {
    minHeight: 18,
    justifyContent: 'center',
  },
  notificationInlineItemText: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0,
    lineHeight: 18,
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
  serviceCardCompact: {
    borderRadius: 22,
    gap: 6,
    minHeight: 76,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  serviceTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 16,
    textAlign: 'center',
  },
  sectionTitle: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0,
  },
  sectionMeta: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0,
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
    fontWeight: '500',
    letterSpacing: 0,
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
    fontWeight: '500',
    letterSpacing: 0,
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
  kaelCard: {
    borderRadius: 28,
    borderWidth: 1,
    boxShadow: 'none',
    gap: 12,
    minHeight: 430,
    padding: 14,
  },
  kaelChatStage: {
    borderRadius: 25,
    borderWidth: 1,
    flex: 1,
    gap: 12,
    justifyContent: 'space-between',
    minHeight: 336,
    overflow: 'hidden',
    padding: 12,
  },
  kaelChatStageEmpty: {
    opacity: 0.92,
  },
  kaelBlankCanvas: {
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    minHeight: 248,
    overflow: 'hidden',
    padding: 4,
    position: 'relative',
  },
  kaelCanvasWashLarge: {
    borderRadius: 32,
    height: 168,
    left: -48,
    opacity: 0.07,
    position: 'absolute',
    top: 46,
    transform: [{ rotate: '-8deg' }],
    width: 168,
  },
  kaelCanvasWashWarm: {
    borderRadius: 28,
    bottom: 42,
    height: 126,
    opacity: 0.06,
    position: 'absolute',
    right: -34,
    transform: [{ rotate: '12deg' }],
    width: 126,
  },
  kaelHubHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 13,
    minWidth: 0,
    position: 'relative',
    zIndex: 2,
  },
  kaelHubCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  kaelHubGreeting: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 18,
  },
  kaelHubTitle: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 27,
  },
  kaelHubBody: {
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0,
    lineHeight: 20,
    position: 'relative',
    zIndex: 2,
  },
  kaelHubPrompt: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
    position: 'relative',
    zIndex: 2,
  },
  kaelHubQuickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    position: 'relative',
    zIndex: 2,
  },
  kaelHubChip: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 94,
    overflow: 'hidden',
    paddingHorizontal: 12,
  },
  kaelHubChipText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
  },
  kaelSessionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  kaelUserBubble: {
    alignSelf: 'flex-end',
    borderRadius: 22,
    borderTopRightRadius: 8,
    borderWidth: 1,
    maxWidth: '82%',
    overflow: 'hidden',
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  kaelUserText: {
    fontSize: 14,
    lineHeight: 19,
  },
  kaelSummaryTicket: {
    width: '100%',
  },
  kaelAssistantBubble: {
    alignSelf: 'flex-start',
    borderRadius: 22,
    borderTopLeftRadius: 8,
    borderWidth: 1,
    gap: 6,
    maxWidth: '92%',
    overflow: 'hidden',
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  kaelAssistantText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 19,
  },
  kaelAssistantHint: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0,
    lineHeight: 17,
  },
  kaelBubble: {
    borderRadius: 25,
    borderTopLeftRadius: 10,
    borderWidth: 1,
    gap: 6,
    overflow: 'hidden',
    padding: 14,
  },
  bubbleKicker: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0,
  },
  bubbleTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 25,
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
  ticketLabel: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0,
  },
  ticketValue: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0,
  },
  emptyTicket: {
    alignItems: 'center',
    borderRadius: 24,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: 10,
    justifyContent: 'center',
    minHeight: 148,
    overflow: 'hidden',
    padding: 16,
  },
  emptyTicketText: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0,
    textAlign: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
  kaelComposerInline: {
    flexShrink: 0,
    minHeight: 64,
  },
  composerTool: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flexShrink: 0,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  composerToolText: {
    fontSize: 26,
    fontWeight: '300',
    letterSpacing: 0,
    lineHeight: 28,
  },
  composerInput: {
    flex: 1,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0,
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
  filterRow: {
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    overflow: 'hidden',
    padding: 6,
  },
  filterChip: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 8,
    position: 'relative',
    zIndex: 2,
  },
  filterLiquidPill: {
    borderRadius: 16,
    bottom: 6,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    top: 6,
    zIndex: 0,
  },
  filterLiquidSheen: {
    borderRadius: 999,
    height: 14,
    left: 14,
    opacity: 0.48,
    position: 'absolute',
    right: 14,
    top: 4,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
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
  timelineRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 25,
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
    fontWeight: '500',
    letterSpacing: 0,
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
    borderRadius: 30,
    borderWidth: 1,
    gap: 12,
    overflow: 'hidden',
    padding: 15,
    position: 'relative',
  },
  profilePrototypeTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
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
    fontSize: 23,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 27,
  },
  profileSetupSteps: {
    flexDirection: 'row',
    gap: 8,
  },
  profileSetupStep: {
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    gap: 3,
    minHeight: 52,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  profileSetupStepTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 13,
  },
  profileSetupStepMeta: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 12,
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
  profileButton: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  profileButtonText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0,
  },
  syncPreview: {
    borderRadius: 24,
    borderWidth: 1,
    gap: 8,
    overflow: 'hidden',
    padding: 12,
  },
  syncPreviewTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  syncPreviewTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 19,
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
    fontWeight: '500',
    letterSpacing: 0,
  },
  metricValue: {
    fontSize: 16,
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
  },
  profileActions: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  listRow: {
    alignItems: 'center',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 9,
    minHeight: 48,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  listCopy: {
    flex: 1,
    gap: 3,
  },
  listTitle: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0,
  },
  listMeta: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0,
  },
  listMetaCompact: {
    fontSize: 11,
    lineHeight: 13,
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
  smallChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  smallChipText: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0,
  },
})
