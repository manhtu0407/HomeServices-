import { createContext, type ReactNode, use, useEffect, useReducer, useState, useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { type LocalCustomerSearchState, type LocalDealStatus, type ServiceType } from '@home-services/shared'
import { FloatingGlassTabBar, type FloatingGlassTabItem } from '@/components/ui/floating-glass-tab-bar'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { GlassCard } from '@/components/ui/glass-card'
import { GlassPressable } from '@/components/ui/glass-pressable'
import { ReduceMotionAwareEntranceView } from '@/components/ui/reduce-motion-aware-animation'
import { appCopy, languageDisplayName, localizedProblemLabel, localizedServiceLabel, localizedStatusLabel, setAppLanguage, type AppLanguage, useAppLanguage } from '@/lib/app-language'
import { useAuth } from '@/lib/auth-provider'
import { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'

const CUSTOMER_V4_PRODUCTION_STANDARD = 'CUSTOMER_V4_PRODUCTION_STANDARD: accepted customer V4 production standard'
const CUSTOMER_V4_VISUAL_CONTRACT = 'CUSTOMER_V4_VISUAL_CONTRACT: production surfaces replace old customer UI'
const CUSTOMER_SHARED_THEME_STORE = 'CUSTOMER_SHARED_THEME_STORE: one theme mode drives all mounted customer tabs'
const CUSTOMER_DOCK_SCROLL_CLEARANCE = 'CUSTOMER_DOCK_SCROLL_CLEARANCE: content clears absolute V4 dock'
const CUSTOMER_LAYER_ECOLOGY_V4 = 'CUSTOMER_LAYER_ECOLOGY_V4: glass mint surfaces, warm material wash, compact copy'
const SEMANTIC_LAYER_SWITCH_V4 = 'SEMANTIC_LAYER_SWITCH_V4: light/dark swaps semantic V4 layers'
const COPY_DENSITY_COMPACT = 'COPY_DENSITY_COMPACT: structure first, no feature explanations'
const KAEL_CHATBOX_SCREEN_CONTRACT = 'KAEL_CHATBOX_SCREEN_CONTRACT: local transaction-intent chatbox'
const KAEL_TICKET_COMPOSER_V3 = 'KAEL_TICKET_COMPOSER_V3: Kael asks, fills a repair ticket, then routes to booking'
const CUSTOMER_DECORATIVE_MOTION_ENABLED = false
const CUSTOMER_THEME_STORAGE_KEY = 'customer.theme.mode.v4'
const customerDockHeight = 70
const customerDockBottomMargin = 10
const customerDockBottomClearance = customerDockHeight + customerDockBottomMargin + 76
const customerFrameHorizontalPadding = 16
const openBookingPath = '/(customer)/booking'
const openHistoryPath = '/(customer)/history'
const kaelModel8A = require('../../assets/kael-model-8a.png')
const kaelModel8AHead = require('../../assets/kael-model-8a-head.png')
const vndFormatter = new Intl.NumberFormat('vi-VN')

type ThemeMode = 'light' | 'dark'
type CustomerDockActive = 'activity' | 'booking' | 'home' | 'kael' | 'profile'
type SurfaceTone = 'base' | 'raised' | 'service' | 'water' | 'warm' | 'depth' | 'ghost' | 'disabled'
type IconName =
  | 'apartment'
  | 'boltPanel'
  | 'calendar'
  | 'chat'
  | 'check'
  | 'cleaning'
  | 'document'
  | 'estimate'
  | 'filter'
  | 'history'
  | 'kael'
  | 'map'
  | 'notification'
  | 'payment'
  | 'person'
  | 'privacy'
  | 'review'
  | 'send'
  | 'support'
  | 'ticket'
  | 'waterPipe'

let lastCustomerDockActive: CustomerDockActive = 'home'

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
  canvas: '#F4FAF7',
  base: '#FFFDF8',
  raised: '#FFFFFF',
  service: '#DCF3EC',
  water: '#E6F8F6',
  warm: '#FFF0DE',
  depthSurface: '#EAF6F1',
  ghost: 'rgba(255,253,248,0.78)',
  glass: 'rgba(255,255,255,0.58)',
  glassStrong: 'rgba(255,255,255,0.74)',
  glassWarm: 'rgba(255,253,246,0.68)',
  glassBorder: 'rgba(255,255,255,0.82)',
  glassHighlight: 'rgba(255,255,255,0.70)',
  glassShadow: '0 12px 30px rgba(13,70,65,0.09)',
  glassFloatShadow: '0 8px 20px rgba(13,70,65,0.07)',
  disabled: '#E5EEEA',
  border: '#D2E8E1',
  borderStrong: '#A9D9CF',
  text: '#102B2D',
  muted: '#667D7A',
  subtleText: '#829A95',
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

function getReducedTransparencyCustomerTokens(tokens: CustomerThemeTokens): CustomerThemeTokens {
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
      searchA11y: 'Mở kiểm giá dịch vụ',
      searchText: 'Bạn cần sửa gì?',
      promoA11y: 'Mở kiểm giá trước khi đặt dịch vụ',
      promoTitle: 'Kiểm giá trước khi đặt.',
      notification: (count: number) => `Kael có ${count} cập nhật chưa đọc`,
      activeA11y: (service: string) => `Mở yêu cầu ${service} đang xử lý`,
    },
    ticket: {
      area: 'Khu vực',
      current: 'Hiện tại',
      described: 'Đã mô tả',
      finalPrice: 'Giá cuối',
      issue: 'Vấn đề',
      noRequest: 'Không có yêu cầu',
      status: 'Trạng thái',
      unknown: 'Chưa rõ',
      update: 'Cập nhật',
    },
    kael: {
      activeDealError: 'Đang có yêu cầu đang chạy. Mở Hoạt động để theo dõi hoặc hoàn tất trước khi tạo yêu cầu mới.',
      bookingCta: 'Qua Kiểm giá',
      needDetail: 'Mô tả Kael cần rõ hơn trước khi tạo phiếu.',
      needService: 'Cần chọn ở Kiểm giá',
      sendAfterConfirm: 'Gửi thợ sau xác nhận',
      summaryTicket: 'Phiếu tóm tắt',
      lockedService: 'Dịch vụ đang khóa',
      unsupportedService: 'Dịch vụ chưa hỗ trợ',
      service: 'Dịch vụ',
    },
    history: {
      filters: ['Sửa', 'Kiểm giá', 'Trò chuyện', 'Xong'],
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
      openPriceCheck: 'Mở Kiểm giá',
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
      beforePhoto: 'Ảnh trước',
      afterPhoto: 'Ảnh sau',
      waitingWorkerPrice: 'Chờ thợ nhập',
      paymentReview: 'Thanh toán & đánh giá',
      payment: 'Thanh toán',
      review: 'Đánh giá',
      locked: 'Khóa',
      open: 'Mở',
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
      searchA11y: 'Open service price check',
      searchText: 'What needs fixing?',
      promoA11y: 'Open price check before booking service',
      promoTitle: 'Check the price before you book.',
      notification: (count: number) => `Kael has ${count} unread updates`,
      activeA11y: (service: string) => `Open active ${service} request`,
    },
    ticket: {
      area: 'Area',
      current: 'Current',
      described: 'Described',
      finalPrice: 'Final price',
      issue: 'Problem',
      noRequest: 'No request',
      status: 'Status',
      unknown: 'Unknown',
      update: 'Update',
    },
    kael: {
      activeDealError: 'An active request is running. Open Activity to follow or finish it before creating a new request.',
      bookingCta: 'Open Price Check',
      needDetail: 'Kael needs a clearer description before creating a ticket.',
      needService: 'Choose in Price Check',
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
      openPriceCheck: 'Open Price Check',
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
      beforePhoto: 'Before',
      afterPhoto: 'After',
      waitingWorkerPrice: 'Waiting for worker',
      paymentReview: 'Payment & review',
      payment: 'Payment',
      review: 'Review',
      locked: 'Locked',
      open: 'Open',
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
  const { replace } = useRouter()
  const languageMode = useAppLanguage()
  const copy = customerCopy[languageMode]
  const { actions, dispatch, notificationUnreadCount, notifications, selectors, state } = useFrontendWorkflow()
  const activeDeal = state.deal
  const visibleNotifications = notifications.slice(0, 2)
  const canStartNewDeal = !activeDeal || canReplaceCustomerDeal(activeDeal.status)
  const isTerminalDeal = activeDeal ? isTerminalCustomerDeal(activeDeal.status) : false
  const activeDealRoute =
    selectors.currentStatus === 'draft' || selectors.currentStatus === 'analyzing' || selectors.currentStatus === 'awaiting_customer_confirm'
      ? openBookingPath
      : openHistoryPath
  const activeDealStatusLabel = customerVisibleStatusLabel(selectors.currentStatus, selectors.customerSearchState, languageMode)
  const openBookingFlow = (serviceType?: ServiceType) => {
    if (!canStartNewDeal) {
      replace(activeDealRoute)
      return
    }
    if (serviceType) dispatch({ type: 'start_home_service', serviceType })
    if (!serviceType && isTerminalDeal) dispatch({ type: 'reset_workflow' })
    replace(openBookingPath)
  }

  return (
    <V4Frame active="home" testID="customer-home-surface">
      {({ tokens }) => (
        <>
          <V4MapBackdrop />
          <View style={styles.v4Content}>
            <ReduceMotionAwareEntranceView delayMs={40} distanceY={10} testID="customer-home-search-motion">
              <GlassPressable accessibilityLabel={copy.home.searchA11y} accessibilityRole="button" mode={tokens.mode} onPress={() => openBookingFlow()} style={styles.searchPill} testID="customer-home-search-entry" variant="control">
                <SubtleGlassHighlight />
                <IconGlyph name="estimate" color={tokens.primary} accent={tokens.copper} />
                <Text style={[styles.searchText, { color: tokens.muted }]} numberOfLines={1}>
                  {copy.home.searchText}
                </Text>
              </GlassPressable>
            </ReduceMotionAwareEntranceView>

            <View style={styles.homeMapSpace} />
            <View style={[styles.homeSheet, customerOpaqueSurface(tokens)]}>
              <View style={styles.hiddenMarker} testID="customer-home-signature-v4" />
              <View style={styles.hiddenMarker} testID="customer-home-layer-stack" />
              <View style={styles.hiddenMarker} testID="customer-home-hero-depth-grid" />
              <View style={styles.hiddenMarker} testID="customer-utility-notification-center" />
              <View style={styles.serviceGrid}>
                <V4ServiceCard icon="boltPanel" title={localizedServiceLabel('electrical', languageMode)} testID="customer-shell-service-electrical" onPress={() => openBookingFlow('electrical')} />
                <V4ServiceCard icon="waterPipe" title={localizedServiceLabel('plumbing', languageMode)} testID="customer-shell-service-plumbing" onPress={() => openBookingFlow('plumbing')} water />
                <V4ServiceCard icon="cleaning" title={localizedServiceLabel('cleaning', languageMode)} testID="customer-shell-service-cleaning" onPress={() => openBookingFlow('cleaning')} />
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
              <ReduceMotionAwareEntranceView delayMs={100} distanceY={16} testID="customer-home-hero-motion">
                <GlassCard mode={tokens.mode} style={styles.promoCard} testID="customer-home-layered-hero">
                  <Pressable accessibilityLabel={copy.home.promoA11y} accessibilityRole="button" onPress={() => openBookingFlow()} style={styles.promoCardHitArea}>
                    <View style={[styles.promoMintCloud, { backgroundColor: tokens.aqua }]} />
                    <View style={[styles.promoWarmCloud, { backgroundColor: tokens.copper }]} />
                    <View style={[styles.promoAccentTile, { backgroundColor: tokens.raised, borderColor: tokens.border }]} />
                    <Text style={[styles.promoTitle, { color: tokens.text }]} numberOfLines={4}>
                      {copy.home.promoTitle}
                    </Text>
                    <View style={styles.hiddenMarker} testID="customer-home-ticket-decor" />
                  </Pressable>
                </GlassCard>
              </ReduceMotionAwareEntranceView>
              <View style={styles.hiddenMarker} testID="customer-home-other-services-message" />
              <View style={styles.hiddenMarker} testID="customer-home-relaxed-stage" />
              <View style={styles.hiddenMarker} testID="customer-home-coupon-strip" />
            </View>
          </View>
        </>
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
  const { replace } = useRouter()
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
  const kaelTicketService = localKaelDraft?.unsupportedServiceLabel ? copy.kael.lockedService : localKaelDraft ? localizedServiceLabel(localKaelDraft.serviceType, languageMode) : localizedServiceLabel(null, languageMode)
  const kaelTicketProblem = localKaelDraft?.unsupportedServiceLabel
    ? copy.kael.unsupportedService
    : (localKaelDraft?.inferredProblemLabel
      ? localizedProblemLabel(localKaelDraft.inferredProblemLabel, localKaelDraft.serviceType, languageMode)
      : localKaelDraft?.needsServiceChoice ? copy.kael.needService : copy.ticket.described)
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
    dispatch({ type: 'submit_kael_draft', text: trimmed })
    setLatestAnswer(trimmed)
    setKaelDraft('')
    setKaelError(null)
  }
  const updateKaelDraft = (value: string) => {
    setKaelDraft(value)
    if (kaelError) setKaelError(null)
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
                </View>
              ) : (
                <>
                  <View style={[styles.kaelUserBubble, customerMessageSurface(tokens)]} testID="customer-kael-user-message">
                    <Text style={[styles.bubbleTitle, styles.kaelUserText, { color: tokens.text }]} numberOfLines={3}>
                      {displayedKaelAnswer}
                    </Text>
                  </View>
                  {hasEnoughKaelInfo ? (
                    <View style={[styles.ticketCard, styles.kaelSummaryTicket, glassSurface(tokens, 'warm')]} testID="customer-kael-ticket-reveal-after-info">
                      <SubtleGlassHighlight />
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
                      <PrimaryButton label={copy.kael.bookingCta} onPress={() => replace(openBookingPath)} compact testID="customer-kael-ticket-booking-cta" />
                    </View>
                  ) : null}
                </>
              )}
              <KaelComposer draft={kaelDraft} onChangeDraft={updateKaelDraft} onSubmit={submitKaelLocalDraft} />
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
  const { replace } = useRouter()
  const languageMode = useAppLanguage()
  const copy = customerCopy[languageMode]
  const { actions, dispatch, selectors, state } = useFrontendWorkflow()
  const [reviewRating, setReviewRating] = useState<1 | 2 | 3 | 4 | 5 | null>(null)
  const deal = state.deal
  const scopeChange = deal?.scopeChange ?? null
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
  const continueOrCreate = () => {
    if (canEditNoWorkerRequest) {
      dispatch({ type: 'reopen_booking_draft' })
    } else if (deal && canCreateFreshRequest) {
      dispatch({ type: 'reset_workflow' })
    }
    replace(openBookingPath)
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

  return (
    <V4Frame active="activity" testID="customer-history-surface">
      {({ tokens }) => (
        <View style={styles.plainContent}>
          <View style={[styles.filterRow, glassSurface(tokens, 'strong')]} testID="customer-history-filter-shell">
            <SubtleGlassHighlight />
            {copy.history.filters.map((label, index) => (
              <View key={label} style={[styles.filterChip, index === 0 ? { backgroundColor: tokens.primary } : { backgroundColor: tokens.raised }]}>
                <Text style={[styles.filterText, { color: index === 0 ? tokens.primaryText : tokens.muted }]} numberOfLines={1}>
                  {label}
                </Text>
              </View>
            ))}
          </View>
          <View style={[styles.flowCard, customerOpaqueSurface(tokens)]} testID="customer-history-empty-state">
            <View style={styles.sectionTitle}>
              <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
                {deal ? localizedServiceLabel(deal.draft.serviceType, languageMode) : localizedStatusLabel(null, languageMode)}
              </Text>
              <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
                {visibleStatusLabel}
              </Text>
            </View>
            {deal ? (
              <View style={styles.twoCol}>
                <V4TicketCell label={copy.ticket.issue} value={localizedProblemLabel(deal.draft.problemChips[0], deal.draft.serviceType, languageMode)} />
                <V4TicketCell label={copy.ticket.area} value={localizedCustomerAreaLabel(deal.draft.districtLabel, languageMode, copy.ticket.unknown)} />
              </View>
            ) : null}
            <PrimaryButton label={historyActionLabel} onPress={continueOrCreate} compact />
          </View>
          {deal ? (
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
          {deal ? (
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
          {scopeChange ? (
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
          {deal && ['completed_by_worker', 'confirmed_by_customer', 'reviewed'].includes(selectors.currentStatus ?? '') ? (
            <View style={[styles.flowCard, customerOpaqueSurface(tokens)]}>
            <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
              {copy.history.evidence}
            </Text>
            <View style={styles.twoCol}>
              <View style={[styles.evidenceTile, customerOpaqueSurface(tokens)]}>
                <Text style={[styles.evidenceText, { color: tokens.muted }]} numberOfLines={1}>{copy.history.beforePhoto}</Text>
              </View>
              <View style={[styles.evidenceTile, customerOpaqueSurface(tokens)]}>
                <Text style={[styles.evidenceText, { color: tokens.muted }]} numberOfLines={1}>{copy.history.afterPhoto}</Text>
              </View>
            </View>
            <View style={styles.twoCol}>
              <V4TicketCell label={copy.ticket.finalPrice} value={copy.history.waitingWorkerPrice} />
              <V4TicketCell label={copy.ticket.status} value={completionStatusLabel} />
            </View>
            </View>
          ) : null}
          {deal && (selectors.canCustomerSubmitReview || ['confirmed_by_customer', 'reviewed'].includes(selectors.currentStatus ?? '')) ? (
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
                  {([1, 2, 3, 4, 5] as const).map((rating) => (
                    <Pressable
                      accessibilityLabel={copy.history.chooseStar(rating)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: reviewRating === rating }}
                      key={rating}
                      onPress={() => setReviewRating(rating)}
                      style={[styles.reviewRatingButton, { backgroundColor: reviewRating === rating ? tokens.primary : tokens.glassStrong }]}
                    >
                      <Text style={{ color: reviewRating === rating ? tokens.primaryText : tokens.primary }} numberOfLines={1}>
                        {rating}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <PrimaryButton label={copy.history.submitReview} onPress={submitSelectedReview} compact />
              </View>
            ) : null}
            </View>
          ) : null}
          <View style={styles.hiddenMarker} testID="customer-shell-no-fake-history-data" />
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
  const { replace } = useRouter()
  const { role, session } = useAuth()
  const { selectors, state } = useFrontendWorkflow()
  const themeMode = useCustomerThemeMode()
  const languageMode = useAppLanguage()
  const copy = customerCopy[languageMode]
  const toggleLanguage = () => setAppLanguage(languageMode === 'vi' ? 'en' : 'vi')
  const toggleTheme = () => setCustomerThemeMode(themeMode === 'light' ? 'dark' : 'light')
  const adminAuditSwitchLabel = languageMode === 'en' ? 'Back to login' : 'Về đăng nhập'
  const profileLabel = session?.user.email ?? copy.profile.noEmail
  const profileRoleLabel = role === 'admin' ? copy.profile.admin : role === 'customer' ? copy.profile.customer : copy.profile.unknownRole
  const deal = state.deal
  const draftLabel = deal ? appCopy[languageMode].common.realRequest : appCopy[languageMode].common.noRequest
  const serviceValue = deal ? localizedServiceLabel(deal.draft.serviceType, languageMode) : localizedServiceLabel(null, languageMode)
  const profileStatusLabel = customerVisibleStatusLabel(selectors.currentStatus, selectors.customerSearchState, languageMode)
  const historyMeta = deal ? profileStatusLabel : appCopy[languageMode].common.noRequest
  const dataValue = deal ? copy.profile.realData : appCopy[languageMode].common.noData

  return (
    <V4Frame active="profile" testID="customer-profile-surface">
      {({ tokens }) => (
        <View style={styles.plainContent}>
          <View style={[styles.profileHead, glassSurface(tokens)]} testID="customer-profile-empty-state">
            <SubtleGlassHighlight />
            <View style={styles.profileIdentityRow}>
              <KaelMascot variant="head" size={58} />
              <Text style={[styles.profileName, { color: tokens.text }]} numberOfLines={1}>
                {profileLabel}
              </Text>
            </View>
            <View style={styles.profileActionRow}>
              <View style={[styles.profileButton, { backgroundColor: tokens.ghost, borderColor: tokens.border }]}>
                <Text style={[styles.profileButtonText, { color: tokens.primary }]} numberOfLines={1}>
                  {profileRoleLabel}
                </Text>
              </View>
              {role === 'admin' ? (
                <View style={styles.profileAdminAction}>
                  <PrimaryButton label={adminAuditSwitchLabel} onPress={() => replace('/(auth)/login')} compact testID="customer-admin-audit-switch" />
                </View>
              ) : null}
            </View>
          </View>
          <View style={styles.hiddenMarker} testID="customer-shell-no-fake-profile-save" />
          <View style={[styles.statusCard, glassSurface(tokens, 'service')]} testID="customer-profile-status-card">
            <SubtleGlassHighlight />
            <View style={[styles.statusAccentTile, { backgroundColor: tokens.raised }]} />
            <Text style={[styles.kicker, { color: tokens.primary }]} numberOfLines={1}>
              {copy.profile.home}
            </Text>
            <Text style={[styles.statusTitle, { color: tokens.text }]} numberOfLines={1}>
              {deal ? profileStatusLabel : copy.profile.noRequest}
            </Text>
            <View style={styles.metricRow}>
              <V4Metric label={copy.profile.draft} value={draftLabel} />
              <V4Metric label={copy.profile.service} value={serviceValue} />
              <V4Metric label={copy.profile.data} value={dataValue} />
            </View>
          </View>
          <View style={styles.quickGrid}>
            <QuickCard icon="kael" title="Kael" />
            <QuickCard icon="apartment" title={copy.profile.apartment} />
            <QuickCard icon="privacy" title={copy.profile.privacy} testID="customer-profile-privacy-shell" />
          </View>
          <View style={styles.profileActions}>
            <View style={[styles.listCard, customerOpaqueSurface(tokens)]} testID="customer-profile-checklist">
              <View style={styles.hiddenMarker} testID="customer-profile-unified-functions" />
              <ListRow icon="map" title={copy.profile.address} meta={localizedCustomerAreaLabel(deal?.draft.districtLabel, languageMode, appCopy[languageMode].common.noData)} testID="customer-utility-saved-address" />
              <ListRow icon="kael" title={copy.profile.kaelManager} meta={copy.profile.serviceScope} />
              <ListRow icon="history" title={copy.profile.history} meta={historyMeta} testID="customer-profile-evidence-shell" />
              <SwitchRow icon="person" title={appCopy[languageMode].common.appLanguage} meta={languageDisplayName(languageMode)} active={languageMode === 'en'} onPress={toggleLanguage} testID="customer-language-toggle" />
              <SwitchRow icon="privacy" title={copy.profile.interface} meta={themeMode === 'light' ? copy.profile.light : copy.profile.dark} active={themeMode === 'dark'} onPress={toggleTheme} testID="customer-dark-mode-toggle-profile" />
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
  const canvasLayer = {
    backgroundColor: tokens.canvas,
    experimental_backgroundImage:
      themeMode === 'dark'
        ? 'radial-gradient(circle at 50% 12%, rgba(105,222,198,0.16), transparent 30%), linear-gradient(180deg, #071312 0%, #141B18 100%)'
        : 'radial-gradient(circle at 50% 12%, rgba(142,231,217,0.35), transparent 28%), linear-gradient(180deg, #f2fbf7 0%, #fff9ee 100%)',
  } as any

  return (
    <SafeAreaView style={[styles.safeArea, canvasLayer]} testID={testID}>
      <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
      <CustomerThemeContext.Provider value={tokens}>
        {reduceTransparency ? null : <AmbientGlassField frameWidth={frameWidth} screenWidth={width} />}
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
          {children({ tokens, mode: themeMode })}
        </ScrollView>
        {reduceMotion || reduceTransparency ? null : <MotionSweep frameWidth={frameWidth} screenWidth={width} />}
        <V4Dock active={active} bottomInset={insets.bottom} frameWidth={frameWidth} screenWidth={width} />
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
  const { reduceTransparency } = useGlassAccessibility()
  const languageMode = useAppLanguage()
  const copy = customerCopy[languageMode]
  const tokens = useCustomerTokens()
  const dockWidth = Math.max(0, frameWidth - 82)
  const dockLeft = Math.max((screenWidth - frameWidth) / 2 + 41, 41)
  const bottom = Math.max(bottomInset + customerDockBottomMargin, customerDockBottomMargin)
  type CustomerDockItem = FloatingGlassTabItem<CustomerDockActive> & {
    icon: IconName
    path: '/(customer)/home' | '/(customer)/booking' | '/(customer)/kael' | '/(customer)/history' | '/(customer)/profile'
  }
  const items: CustomerDockItem[] = [
    { accessibilityLabel: copy.navA11y.home, key: 'home', icon: 'apartment', label: copy.nav.home, path: '/(customer)/home', testID: 'customer-v4-dock-home' },
    { accessibilityLabel: copy.navA11y.booking, key: 'booking', icon: 'document', label: copy.nav.booking, path: openBookingPath, testID: 'customer-v4-dock-booking' },
    { accessibilityLabel: copy.navA11y.kael, key: 'kael', icon: 'kael', label: copy.nav.kael, path: '/(customer)/kael', testID: 'customer-v4-dock-kael' },
    { accessibilityLabel: copy.navA11y.activity, key: 'activity', icon: 'history', label: copy.nav.activity, path: '/(customer)/history', testID: 'customer-v4-dock-activity' },
    { accessibilityLabel: copy.navA11y.profile, key: 'profile', icon: 'person', label: copy.nav.profile, path: '/(customer)/profile', testID: 'customer-v4-dock-profile' },
  ]

  return (
    <View pointerEvents="box-none" style={[styles.dockWrap, { bottom, left: dockLeft, width: dockWidth }]}>
      {reduceTransparency ? null : (
        <>
          <View pointerEvents="none" style={[styles.dockGlassAura, { backgroundColor: tokens.aqua, opacity: 0.18 }]} testID="customer-dock-glass-aura" />
          <View pointerEvents="none" style={[styles.dockWarmAura, { backgroundColor: tokens.copper }]} />
        </>
      )}
      <FloatingGlassTabBar<CustomerDockActive, CustomerDockItem>
        activeKey={active}
        items={items}
        mode={tokens.mode}
        onItemPress={(item) => {
          if (item.key === active) return
          lastCustomerDockActive = item.key
          replace(item.path)
        }}
        iconForItem={(item, focused) =>
          item.icon === 'kael' ? (
            <Image accessible={false} contentFit="contain" source={kaelModel8AHead} style={styles.dockKaelImage} />
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

function V4MapBackdrop() {
  const tokens = useCustomerTokens()
  const route = 0.48
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
      <View style={[styles.mapRoute, { backgroundColor: tokens.primary }, routeStyle]} />
      <View style={[styles.mapRouteSoft, { backgroundColor: tokens.aqua }]} />
      <View style={[styles.mapVehicle, customerOpaqueSurface(tokens), vehicleStyle]}>
        <IconGlyph name="estimate" color={tokens.primary} accent={tokens.copper} />
      </View>
      <View style={[styles.mapLine, styles.mapLineOne, { backgroundColor: tokens.borderStrong }]} />
      <View style={[styles.mapLine, styles.mapLineTwo, { backgroundColor: tokens.borderStrong }]} />
      <View style={[styles.mapLine, styles.mapLineThree, { backgroundColor: tokens.borderStrong }]} />
      <View style={[styles.mapRoom, styles.mapRoomOne, { borderColor: tokens.borderStrong }]} />
      <View style={[styles.mapRoom, styles.mapRoomTwo, { borderColor: tokens.borderStrong }]} />
      <View style={[styles.mapRoom, styles.mapRoomThree, { borderColor: tokens.borderStrong }]} />
      <View style={[styles.mapPin, { backgroundColor: tokens.primary, borderColor: tokens.glassBorder }, pinStyle]} />
      <View style={[styles.mapNode, styles.mapNodeElectric, customerOpaqueSurface(tokens)]}>
        <IconGlyph name="boltPanel" color={tokens.primary} accent={tokens.copper} />
      </View>
      <View style={[styles.mapNode, styles.mapNodeWater, customerOpaqueSurface(tokens)]}>
        <IconGlyph name="waterPipe" color={tokens.primary} accent={tokens.aqua} />
      </View>
    </View>
  )
}

function V4ServiceCard({ icon, onPress, testID, title, water }: { icon: IconName; onPress: () => void; testID: string; title: string; water?: boolean }) {
  const tokens = useCustomerTokens()
  const languageMode = useAppLanguage()
  return (
    <Pressable
      accessibilityLabel={languageMode === 'en' ? `Select service ${title}` : `Chọn dịch vụ ${title}`}
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.serviceCard, customerOpaqueSurface(tokens)]}
      testID={testID}
    >
      <View pointerEvents="none" style={[styles.glassRing, { borderColor: tokens.mode === 'dark' ? 'rgba(105,222,198,0.16)' : 'rgba(8,120,110,0.10)' }]} />
      <IconShell icon={icon} tone={water ? 'water' : 'service'} size={50} />
      <Text style={[styles.serviceTitle, { color: tokens.text }]} numberOfLines={2}>
        {title}
      </Text>
    </Pressable>
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

function SwitchRow({
  active,
  icon,
  meta,
  onPress,
  testID,
  title,
}: {
  active: boolean
  icon: IconName
  meta: string
  onPress: () => void
  testID: string
  title: string
}) {
  const tokens = useCustomerTokens()
  return (
    <Pressable accessibilityLabel={title} accessibilityRole="switch" accessibilityState={{ checked: active }} onPress={onPress} style={styles.listRow} testID={testID}>
      <IconGlyph name={icon} color={tokens.primary} accent={tokens.copper} />
      <View style={styles.listCopy}>
        <Text style={[styles.listTitle, { color: tokens.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.listMeta, { color: tokens.subtleText }]} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <View style={[styles.switchTrack, { backgroundColor: active ? tokens.service : tokens.disabled, borderColor: tokens.border }]}>
        <View style={[styles.switchKnob, { backgroundColor: active ? tokens.primary : tokens.raised, transform: [{ translateX: active ? 24 : 0 }] }]} />
      </View>
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
          ...customerOpaqueSurface(tokens),
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

function KaelMascot({ size, variant }: { size: number; variant: 'head' | 'full' }) {
  const tokens = useCustomerTokens()
  const source = variant === 'head' ? kaelModel8AHead : kaelModel8A
  return (
    <View
      style={[
        styles.kaelMascotFrame,
        {
          ...glassSurface(tokens, 'water'),
          borderRadius: Math.round(size * 0.32),
          height: size,
          width: size,
        },
      ]}
      testID={variant === 'head' ? 'kael-model-8a-head.png' : 'kael-model-8a.png'}
    >
      <SubtleGlassHighlight />
      <Image accessible={false} contentFit="contain" source={source} style={{ height: variant === 'head' ? size * 0.9 : size * 1.1, width: variant === 'head' ? size * 0.9 : size * 1.05 }} />
    </View>
  )
}

function PrimaryButton({ compact, label, onPress, testID }: { compact?: boolean; label: string; onPress: () => void; testID?: string }) {
  const tokens = useCustomerTokens()
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={[styles.primaryButton, compact ? styles.primaryButtonCompact : null, { backgroundColor: tokens.primary }]} testID={testID}>
      <Text adjustsFontSizeToFit minimumFontScale={0.84} style={[styles.primaryButtonText, { color: tokens.primaryText }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

function SecondaryButton({ compact, label, onPress, testID }: { compact?: boolean; label: string; onPress: () => void; testID?: string }) {
  const tokens = useCustomerTokens()
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.secondaryButton, compact ? styles.primaryButtonCompact : null, { borderColor: tokens.borderStrong, backgroundColor: tokens.ghost }]}
      testID={testID}
    >
      <Text adjustsFontSizeToFit minimumFontScale={0.84} style={[styles.secondaryButtonText, { color: tokens.danger }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

function KaelComposer({
  draft,
  onChangeDraft,
  onSubmit,
}: {
  draft: string
  onChangeDraft: (value: string) => void
  onSubmit: () => void
}) {
  const tokens = useCustomerTokens()
  const languageMode = useAppLanguage()
  const inputLabel = languageMode === 'en' ? 'Describe the problem for Kael' : 'Mô tả vấn đề cho Kael'
  const placeholder = languageMode === 'en' ? 'Describe the problem...' : 'Mô tả vấn đề...'
  const sendLabel = languageMode === 'en' ? 'Send' : 'Gửi'
  return (
    <View style={[styles.composer, styles.kaelComposerInline, glassSurface(tokens, 'strong')]} testID="customer-kael-composer-dock">
      <SubtleGlassHighlight />
      <View accessible={false} pointerEvents="none" style={[styles.composerTool, { borderColor: tokens.border }]}>
        <Text style={[styles.composerToolText, { color: tokens.primary }]} numberOfLines={1}>
          +
        </Text>
      </View>
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
      <Pressable accessibilityLabel={sendLabel} accessibilityRole="button" onPress={onSubmit} style={[styles.sendButton, { backgroundColor: tokens.primary }]}>
        <IconGlyph name="send" color={tokens.primaryText} accent={tokens.primaryText} />
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
    boxShadow: 'none',
  }
}

function SubtleGlassHighlight() {
  const tokens = useCustomerTokens()
  if (tokens.glassHighlight === 'transparent') return null
  return <View pointerEvents="none" style={[styles.glassTopHighlight, { backgroundColor: tokens.glassHighlight }]} />
}

function IconGlyph({ name, color, accent }: { name: IconName; color: string; accent: string }) {
  if (name === 'boltPanel') {
    return (
      <Svg accessible={false} width={28} height={28} viewBox="0 0 28 28" fill="none">
        <Rect x={7.5} y={5} width={13} height={18} rx={4} stroke={color} strokeWidth={1.9} />
        <Path d="M11.5 11h5M11.5 15.5h5" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
        <Path d="m15 8-3 8h3l-2 5 5-8h-3l2-5Z" fill={accent} opacity={0.9} />
      </Svg>
    )
  }

  if (name === 'waterPipe') {
    return (
      <Svg accessible={false} width={29} height={29} viewBox="0 0 29 29" fill="none">
        <Path d="M7 9.5h9c3 0 5 2 5 5V20" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M6 22c3-2 5.8 2 9 0 2-1.2 4-1.2 6 0" stroke={accent} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={7.5} cy={9.5} r={3} fill={accent} opacity={0.16} />
      </Svg>
    )
  }

  if (name === 'cleaning') {
    return (
      <Svg accessible={false} width={29} height={29} viewBox="0 0 29 29" fill="none">
        <Path d="M17.5 5.5 8 23" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
        <Path d="M15.5 9.5h5.2c1.2 0 2 .8 2 2v1.2c0 1.2-.8 2-2 2h-8.4" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M9.2 20.5c2.2 1.8 5.5 1.8 8.1 0M7 23.2c3.2 2 8.6 2 12 0" stroke={accent} strokeWidth={1.9} strokeLinecap="round" />
        <Circle cx={21.5} cy={6.5} r={2.2} fill={accent} opacity={0.2} />
      </Svg>
    )
  }

  if (name === 'apartment') {
    return (
      <Svg accessible={false} width={26} height={26} viewBox="0 0 26 26" fill="none">
        <Path d="M5.5 12.5 13 6l7.5 6.5v7.2c0 1-.8 1.8-1.8 1.8H7.3c-1 0-1.8-.8-1.8-1.8v-7.2Z" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M11 21.5v-5h4v5" stroke={accent} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    )
  }

  if (name === 'person') {
    return (
      <Svg accessible={false} width={26} height={26} viewBox="0 0 26 26" fill="none">
        <Path d="M7.5 20c.9-2.5 2.9-3.8 5.5-3.8s4.6 1.3 5.5 3.8" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
        <Circle cx={13} cy={9.5} r={3.3} stroke={color} strokeWidth={1.9} />
      </Svg>
    )
  }

  if (name === 'chat') {
    return (
      <Svg accessible={false} width={25} height={25} viewBox="0 0 25 25" fill="none">
        <Path d="M6.5 6.5h12c1 0 1.8.8 1.8 1.8v7.2c0 1-.8 1.8-1.8 1.8h-6l-4 3v-3h-2c-1 0-1.8-.8-1.8-1.8V8.3c0-1 .8-1.8 1.8-1.8Z" stroke={color} strokeWidth={1.9} strokeLinejoin="round" />
        <Path d="M9.5 11h6" stroke={accent} strokeWidth={1.8} strokeLinecap="round" />
      </Svg>
    )
  }

  if (name === 'send') {
    return (
      <Svg accessible={false} width={25} height={25} viewBox="0 0 25 25" fill="none">
        <Path d="M5.4 12.8 19.4 5.8l-4.3 13.4-3.1-5.2-6.6-1.2Z" stroke={color} strokeWidth={1.9} strokeLinejoin="round" />
      </Svg>
    )
  }

  if (name === 'payment') {
    return (
      <Svg accessible={false} width={25} height={25} viewBox="0 0 25 25" fill="none">
        <Path d="M5.4 9.5 12.5 5l7.1 4.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M7 10.5h11M8.2 10.5v6.2M12.5 10.5v6.2M16.8 10.5v6.2M6.5 18.5h12" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
        <Path d="M12.5 7.8h.1" stroke={accent} strokeWidth={3} strokeLinecap="round" />
      </Svg>
    )
  }

  if (name === 'ticket') {
    return (
      <Svg accessible={false} width={25} height={25} viewBox="0 0 25 25" fill="none">
        <Path d="M5.8 8.5c0-1 .8-1.8 1.8-1.8h9.8c1 0 1.8.8 1.8 1.8v2.2a2 2 0 0 0 0 3.6v2.2c0 1-.8 1.8-1.8 1.8H7.6c-1 0-1.8-.8-1.8-1.8v-2.2a2 2 0 0 0 0-3.6V8.5Z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
        <Path d="M9.4 12.5h6.2" stroke={accent} strokeWidth={1.8} strokeLinecap="round" />
      </Svg>
    )
  }

  if (name === 'privacy' || name === 'check') {
    return (
      <Svg accessible={false} width={25} height={25} viewBox="0 0 25 25" fill="none">
        <Path d="M12.5 4.8 18.5 7v4.6c0 3.6-2.2 6.5-6 7.7-3.8-1.2-6-4.1-6-7.7V7l6-2.2Z" stroke={color} strokeWidth={1.8} />
        <Path d="m10 12.2 1.6 1.6 3.5-4" stroke={accent} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    )
  }

  return (
    <Svg accessible={false} width={25} height={25} viewBox="0 0 25 25" fill="none">
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
    width: 0,
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
  motionSweep: {
    bottom: -40,
    position: 'absolute',
    top: -40,
    width: 44,
    zIndex: 24,
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
  dockLiquidPool: {
    borderRadius: 999,
    bottom: 7,
    height: 52,
    left: 0,
    opacity: 0.24,
    position: 'absolute',
    width: 80,
    zIndex: 0,
  },
  dockLiquidWake: {
    borderRadius: 999,
    bottom: 4,
    height: 56,
    left: 0,
    position: 'absolute',
    width: 88,
    zIndex: 0,
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
  dockActiveGlow: {
    borderRadius: 999,
    height: 48,
    opacity: 0.3,
    position: 'absolute',
    width: 48,
  },
  dockDot: {
    borderRadius: 999,
    bottom: 6,
    height: 4,
    position: 'absolute',
    width: 4,
  },
  dockKaelImage: {
    height: 36,
    width: 36,
  },
  v4Content: {
    minHeight: 760,
    position: 'relative',
  },
  plainContent: {
    gap: 12,
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
    height: 176,
  },
  homeSheet: {
    borderRadius: 30,
    borderWidth: 1,
    boxShadow: 'none',
    gap: 15,
    minHeight: 520,
    overflow: 'hidden',
    padding: 16,
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
    borderRadius: 24,
    borderWidth: 1,
    boxShadow: 'none',
    flexBasis: '31%',
    flex: 1,
    gap: 12,
    minHeight: 138,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 14,
  },
  serviceTitle: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 20,
    minHeight: 40,
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
  promoCard: {
    borderRadius: 26,
    borderWidth: 1,
    boxShadow: 'none',
    minHeight: 138,
    overflow: 'hidden',
    paddingHorizontal: 17,
    paddingVertical: 17,
  },
  promoCardHitArea: {
    flex: 1,
    minHeight: 104,
    position: 'relative',
  },
  promoTitle: {
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 24,
    maxWidth: 188,
    position: 'relative',
    zIndex: 2,
  },
  promoMintCloud: {
    borderRadius: 999,
    height: 136,
    left: -42,
    opacity: 0.14,
    position: 'absolute',
    top: 18,
    width: 136,
  },
  promoWarmCloud: {
    borderRadius: 999,
    height: 160,
    opacity: 0.22,
    position: 'absolute',
    right: -44,
    top: -20,
    width: 160,
  },
  promoAccentTile: {
    borderRadius: 26,
    borderWidth: 1,
    height: 82,
    opacity: 0.8,
    position: 'absolute',
    right: 18,
    top: 28,
    transform: [{ rotate: '-8deg' }],
    width: 82,
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
    minHeight: 196,
    overflow: 'hidden',
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
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    overflow: 'hidden',
    padding: 6,
  },
  filterChip: {
    alignItems: 'center',
    borderRadius: 18,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 8,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '600',
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
  timelineRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 25,
  },
  timelineDot: {
    borderRadius: 999,
    height: 10,
    width: 10,
  },
  timelineText: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0,
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
  profileAdminAction: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 164,
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
    gap: 2,
    overflow: 'hidden',
    padding: 8,
  },
  profileActions: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  listRow: {
    alignItems: 'center',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 11,
    minHeight: 58,
    paddingHorizontal: 8,
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
