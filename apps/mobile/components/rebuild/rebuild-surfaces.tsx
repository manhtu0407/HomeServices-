import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Alert, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type DimensionValue, type ImageSourcePropType, type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { LOCAL_DEAL_ID, LOCAL_WORKFLOW_PRICE_DISCLAIMER, buildLocalJobDisplayCode, buildLocalWorkerDisplayCode, buildWorkflowViewModel, hasLocalDealCompletionEvidence, type LocalDeal, type LocalDealDraft, type LocalDealPayment, type ServiceType } from '@nestscout/shared'
import { KaelMascot } from '@/components/kael/kael-mascot'
import { KaelChatComposer, useKaelChatTokens } from '@/components/customer/kael-chat/agentic-parts'
import { KaelChatThread } from '@/components/customer/kael-chat/thread'
import { GlassSurface } from '@/components/ui/glass-surface'
import {
  KaelBadge,
  KaelButton,
  KaelCard,
  KaelChip,
  KaelMediaUploadTray,
  KaelProgressPill,
  KaelText,
  KaelTextField,
  KaelVoiceInputCapsule,
  MintAura,
} from '@/components/ui/kael-primitives'
import { color, component, customerTheme, glass, radius, shadow, spacing, typography } from '@/design/theme'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { motionTokens } from '@/components/ui/motion-tokens'
import { generateClientRequestId } from '@/lib/client-request-id'
import { useAppLanguage, type AppLanguage } from '@/lib/app-language'
import { useAuth } from '@/lib/auth-provider'
import type { CustomerProfileInsightsResponse, KaelChatProgress, KaelChatTurn, NotificationListResponse, WorkerKaelChatTurn } from '@/lib/api-types'
import { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { jobService, workerKaelChatService } from '@/lib/services'
import { uploadJobMediaDrafts, type LocalMediaUploadDraft } from '@/lib/media-upload'
import { setPendingKaelChatDraft, takePendingKaelChatDraft, type PendingKaelChatDraft } from '@/components/customer/kael-chat/pending-intake'
import type { KaelChatAction } from '@/components/customer/kael-chat/state'

const logoMark = require('@/assets/nestscout-logo-mark.png') as ImageSourcePropType
const kaelOrb = require('@/assets/kael-orb-icon.png') as ImageSourcePropType
const kaelOrbGlyph = require('@/assets/kael-orb-glyph.png') as ImageSourcePropType
const customerNavigationKael = require('@/assets/navigation/customer/kael.png') as ImageSourcePropType
const kaelWorkerBriefModel = require('@/assets/kael-states/kael-state-welcome.png') as ImageSourcePropType
const workerNavigationEarnings = require('@/assets/navigation/worker/earnings.png') as ImageSourcePropType
const workerNavigationHome = require('@/assets/navigation/worker/home.png') as ImageSourcePropType
const workerNavigationJobs = require('@/assets/navigation/worker/jobs.png') as ImageSourcePropType
const workerNavigationProfile = require('@/assets/navigation/worker/profile.png') as ImageSourcePropType

const clientIcons = {
  activity: require('@/assets/client-image-icons/client-activity.png') as ImageSourcePropType,
  address: require('@/assets/client-image-icons/client-address.png') as ImageSourcePropType,
  booking: require('@/assets/client-image-icons/client-booking.png') as ImageSourcePropType,
  cleaning: require('@/assets/client-image-icons/client-service-cleaning.png') as ImageSourcePropType,
  electrical: require('@/assets/client-image-icons/client-service-electrical.png') as ImageSourcePropType,
  evidence: require('@/assets/client-image-icons/client-evidence.png') as ImageSourcePropType,
  feedback: require('@/assets/client-image-icons/client-feedback.png') as ImageSourcePropType,
  home: require('@/assets/client-image-icons/client-home.png') as ImageSourcePropType,
  identity: require('@/assets/client-image-icons/client-identity.png') as ImageSourcePropType,
  notification: require('@/assets/worker-image-icons/utility-bell.png') as ImageSourcePropType,
  payment: require('@/assets/client-image-icons/client-payment.png') as ImageSourcePropType,
  plumbing: require('@/assets/client-image-icons/client-service-plumbing.png') as ImageSourcePropType,
  profile: require('@/assets/client-image-icons/client-profile.png') as ImageSourcePropType,
  privacy: require('@/assets/client-image-icons/client-privacy.png') as ImageSourcePropType,
  theme: require('@/assets/client-image-icons/client-theme.png') as ImageSourcePropType,
} as const

const workerIcons = {
  area: require('@/assets/worker-image-icons/profile-service-area.png') as ImageSourcePropType,
  avatar: require('@/assets/kael-emotions/kael-emotion-focused.png') as ImageSourcePropType,
  calendar: require('@/assets/worker-image-icons/utility-calendar.png') as ImageSourcePropType,
  chat: require('@/assets/worker-image-icons/utility-chat.png') as ImageSourcePropType,
  document: require('@/assets/worker-image-icons/utility-document.png') as ImageSourcePropType,
  earnings: require('@/assets/worker-image-icons/nav-earnings.png') as ImageSourcePropType,
  evidence: require('@/assets/worker-image-icons/utility-evidence-core.png') as ImageSourcePropType,
  home: require('@/assets/worker-image-icons/nav-home.png') as ImageSourcePropType,
  jobs: require('@/assets/worker-image-icons/nav-jobs.png') as ImageSourcePropType,
  map: require('@/assets/worker-image-icons/utility-map.png') as ImageSourcePropType,
  profile: require('@/assets/worker-image-icons/nav-profile.png') as ImageSourcePropType,
  shield: require('@/assets/worker-image-icons/utility-shield.png') as ImageSourcePropType,
  tools: require('@/assets/worker-image-icons/utility-tools.png') as ImageSourcePropType,
  wallet: require('@/assets/worker-image-icons/utility-wallet.png') as ImageSourcePropType,
} as const

const workerServiceIcons: Record<ServiceType, ImageSourcePropType> = {
  cleaning: require('@/assets/worker-image-icons/service-cleaning.png') as ImageSourcePropType,
  electrical: require('@/assets/worker-image-icons/service-electrical.png') as ImageSourcePropType,
  plumbing: require('@/assets/worker-image-icons/service-plumbing.png') as ImageSourcePropType,
} as const

const statusIcons = {
  approved: require('@/assets/status/status-approved.png') as ImageSourcePropType,
  completed: require('@/assets/status/status-completed.png') as ImageSourcePropType,
  pending: require('@/assets/status/status-pending.png') as ImageSourcePropType,
  warning: require('@/assets/status/status-warning.png') as ImageSourcePropType,
} as const

type CustomerDockActive = 'activity' | 'booking' | 'chat' | 'home' | 'kael' | 'profile'
type CustomerDockIconName = 'activity' | 'booking' | 'home' | 'profile'
type CustomerActivityTab = 'active' | 'all' | 'done' | 'review'
type WorkerDockActive = 'earnings' | 'home' | 'jobs' | 'kael' | 'profile'
type WorkerDockIconName = 'earnings' | 'home' | 'jobs' | 'profile'
type WorkerChatMediaPreview = { fileName: string; uri: string }
type WorkerKaelActiveSession = { jobId: string; sessionId: string }
type WorkerMoneyStep = 'method' | 'wallet' | 'withdraw'

const serviceOrder: ServiceType[] = ['electrical', 'plumbing', 'cleaning']
const workerHomeServiceOrder: ServiceType[] = ['cleaning', 'electrical', 'plumbing']
const BOOKING_SERVICE_CARD_MIN_HEIGHT = component.iconTile.size + spacing.xxl + spacing.xxl
const BOOKING_SERVICE_CARD_MIN_WIDTH = component.iconTile.size + spacing.xxl + spacing.xxl
const BOOKING_SERVICE_ICON_SHELL_SIZE = component.iconTile.size - spacing.sm - spacing.xs
const BOOKING_SERVICE_ICON_SIZE = component.iconTile.visualSize + spacing.xs
const BOOKING_TIMING_CARD_MIN_HEIGHT = component.iconTile.size + spacing.sm + spacing.xs
const BOOKING_TIMING_CARD_MIN_WIDTH = component.iconTile.size * 2 + spacing.md
const BOOKING_TIMING_ICON_SHELL_SIZE = component.iconTile.visualSize + spacing.xs
const BOOKING_TIMING_ICON_SIZE = component.bottomNav.iconSize + spacing.md
const BOOKING_CALENDAR_DAY_SIZE = component.button.secondary.height
const BOOKING_CALENDAR_NAV_SIZE = component.chip.height + spacing.xs
const BOOKING_CALENDAR_DAYS_PER_WEEK = 7
const VIETNAM_UTC_OFFSET_MS = 7 * 60 * 60 * 1000
const CUSTOMER_DOCK_ICON_SIZE = 24
const LIQUID_NAV_MAX_WIDTH = 390
const LIQUID_NAV_SIDE_INSET = 12
const LIQUID_NAV_DOCK_HEIGHT = 56
const LIQUID_NAV_ORB_SIZE = 68
const LIQUID_NAV_DOCK_GAP = 8
const LIQUID_NAV_RAIL_PADDING = 4
const CUSTOMER_DOCK_TAB_GAP = 8
const CUSTOMER_DOCK_TAB_WIDTH = 66
const CUSTOMER_DOCK_TAB_STEP = CUSTOMER_DOCK_TAB_WIDTH + CUSTOMER_DOCK_TAB_GAP
const CUSTOMER_DOCK_ACTIVE_SEGMENT_WIDTH = CUSTOMER_DOCK_TAB_WIDTH + 4
const CUSTOMER_DOCK_ACTIVE_SEGMENT_LEFT = component.bottomNav.paddingX - 2
const CUSTOMER_KAEL_ORB_OUTER_SIZE = LIQUID_NAV_ORB_SIZE
const CUSTOMER_KAEL_ORB_CORE_SIZE = LIQUID_NAV_ORB_SIZE - 4
const CUSTOMER_KAEL_ORB_CORE_OFFSET = (CUSTOMER_KAEL_ORB_OUTER_SIZE - CUSTOMER_KAEL_ORB_CORE_SIZE) / 2
const CUSTOMER_KAEL_ORB_EDGE_INSET = 1
const CUSTOMER_KAEL_ORB_SURFACE_INSET = 2
const WORKER_DOCK_ICON_SIZE = 24
const WORKER_KAEL_ORB_OUTER_SIZE = LIQUID_NAV_ORB_SIZE
const dockRouteIndexMemory: Record<'customer' | 'worker', number> = { customer: 0, worker: 0 }
const WorkerDockLayoutContext = createContext(false)
const MATCHING_AI_SCORE_MASCOT_SIZE = component.iconTile.size * 2 + spacing.xxxl
const MATCHING_AI_SCORE_COPY_WIDTH = component.iconTile.size + spacing.xxxl + spacing.lg
const MATCHING_AI_SCORE_MASCOT_LEFT_OFFSET = -spacing.lg
const MATCHING_AI_SCORE_MASCOT_VISUAL_SCALE = 1.45

const serviceCopy: Record<ServiceType, Record<AppLanguage, { label: string; note: string }>> = {
  electrical: {
    vi: { label: 'Sửa điện', note: 'Ổ cắm, CB, đèn, thiết bị nhỏ' },
    en: { label: 'Electrical', note: 'Outlets, breakers, lights, small fixtures' },
  },
  plumbing: {
    vi: { label: 'Sửa nước', note: 'Rò rỉ, nghẹt, vòi, áp lực nước' },
    en: { label: 'Plumbing', note: 'Leaks, drains, faucets, pressure' },
  },
  cleaning: {
    vi: { label: 'Vệ sinh nhà', note: 'Dọn định kỳ, dọn sâu, sau sửa chữa' },
    en: { label: 'Cleaning', note: 'Routine, deep, post-repair cleanup' },
  },
}

const copy = {
  vi: {
    activeCase: 'Hồ sơ đang xử lý',
    activity: 'Hoạt động',
    agenticCenter: 'Agentic Center',
    analysis: 'Kael phân tích',
    applyWorker: 'Gửi hồ sơ thợ',
    approvalQueue: 'Hàng chờ duyệt',
    available: 'Đang hoạt động',
    book: 'Đặt dịch vụ',
    caseWork: 'Giải quyết công việc',
    chat: 'Tin nhắn',
    commandCenter: 'Trung tâm điều phối',
    continueWithKael: 'Tiếp tục với Kael',
    customerOverview: 'Tổng quan khách hàng',
    dataPending: 'Chưa có dữ liệu thật',
    email: 'Email',
    evidence: 'Bằng chứng',
    home: 'Trang chủ',
    jobInProgress: 'Đang làm việc',
    jobs: 'Công việc',
    login: 'Đăng nhập',
    loginCustomer: 'Đăng nhập khách hàng',
    mediaVoice: 'Hình ảnh / video / ghi chú giọng nói',
    moneyProtection: 'Bảo vệ đồng tiền',
    next: 'Tiếp tục',
    noFake: 'Không hiển thị số liệu giả. Khi hệ thống chưa có dữ liệu, màn hình giữ trạng thái chờ minh bạch.',
    password: 'Mật khẩu',
    profile: 'Hồ sơ',
    register: 'Tạo tài khoản',
    registerCustomer: 'Tạo tài khoản khách hàng',
    reputation: 'Uy tín & hiệu suất',
    searchFilter: 'Tìm & lọc yêu cầu',
    serviceScope: 'Sửa điện, sửa nước, vệ sinh nhà tại căn hộ TP.HCM',
    signOut: 'Đăng xuất',
    usageRanking: 'Xếp hạng sử dụng',
    welcomeBody: 'Kael giúp mô tả sự cố, đọc bằng chứng, ước tính giá và điều phối thợ theo dữ liệu thật.',
    welcomeTitle: 'NestScout',
    workerHome: 'Trạm làm việc',
    workerLevel: 'Hành trình cấp thợ',
    workerOverview: 'Tổng quan hồ sơ',
  },
  en: {
    activeCase: 'Active case',
    activity: 'Activity',
    agenticCenter: 'Agentic Center',
    analysis: 'Kael analysis',
    applyWorker: 'Submit worker profile',
    approvalQueue: 'Approval queue',
    available: 'Available',
    book: 'Book service',
    caseWork: 'Work resolution',
    chat: 'Messages',
    commandCenter: 'Command center',
    continueWithKael: 'Continue with Kael',
    customerOverview: 'Customer overview',
    dataPending: 'Waiting for real data',
    email: 'Email',
    evidence: 'Evidence',
    home: 'Home',
    jobInProgress: 'Job in progress',
    jobs: 'Jobs',
    login: 'Sign in',
    loginCustomer: 'Customer sign in',
    mediaVoice: 'Images / video / voice note',
    moneyProtection: 'Money protection',
    next: 'Continue',
    noFake: 'No fabricated stats. Missing system data stays as an honest pending state.',
    password: 'Password',
    profile: 'Profile',
    register: 'Create account',
    registerCustomer: 'Create customer account',
    reputation: 'Reputation & performance',
    searchFilter: 'Search & filter request',
    serviceScope: 'Electrical, plumbing, and home cleaning for HCMC apartments',
    signOut: 'Sign out',
    usageRanking: 'Usage ranking',
    welcomeBody: 'Kael helps describe the issue, read evidence, estimate price, and coordinate workers from real data.',
    welcomeTitle: 'NestScout',
    workerHome: 'Worker station',
    workerLevel: 'Worker level journey',
    workerOverview: 'Profile overview',
  },
} as const

export function CustomerHomeSurface() {
  const language = useAppLanguage()
  const t = copy[language]
  const { session } = useAuth()
  const { state } = useFrontendWorkflow()
  const deal = state.deal
  const name = readDisplayName(session?.user?.user_metadata) ?? (language === 'vi' ? 'bạn' : 'you')

  return (
    <CustomerScreen active="home" showHeader={false} title={t.home} testID="rebuild-customer-home">
      <CustomerFlowGreeting name={name} />
      <CustomerHomeKaelHero />

      <KaelCard style={styles.customerCoreSectionCard} testID="rebuild-customer-service-actions">
        <SectionHeading title={language === 'vi' ? 'Dịch vụ phổ biến' : 'Popular services'} subtitle={t.serviceScope} />
        <ServiceGrid compact />
      </KaelCard>

      <CustomerHomeTrackingCard deal={deal} />
    </CustomerScreen>
  )
}

export function CustomerBookingEntrySurface() {
  const language = useAppLanguage()
  const t = copy[language]
  const router = useRouter()
  const { guestMode } = useAuth()
  const [serviceType, setServiceType] = useState<ServiceType | null>(null)
  const [districtLabel, setDistrictLabel] = useState('')
  const [description, setDescription] = useState('')
  const [timingMode, setTimingMode] = useState<'now' | 'scheduled'>('now')
  const defaultScheduledDateIso = getDefaultScheduledDateIso()
  const [scheduledDateIso, setScheduledDateIso] = useState(defaultScheduledDateIso)
  const [calendarMonthIso, setCalendarMonthIso] = useState(() => toMonthIso(parseLocalIsoDate(defaultScheduledDateIso)))
  const [error, setError] = useState<string | null>(null)
  const timingOptions: { key: 'now' | 'scheduled'; label: string; note: string; icon: ImageSourcePropType }[] = language === 'vi'
    ? [
      { key: 'now', label: 'Đặt liền', note: 'Gửi ngay để Kael xử lý yêu cầu.', icon: clientIcons.activity },
      { key: 'scheduled', label: 'Đặt trước', note: 'Chọn ngày để chuẩn bị dịch vụ.', icon: clientIcons.booking },
    ]
    : [
      { key: 'now', label: 'Book now', note: 'Send to Kael for immediate handling.', icon: clientIcons.activity },
      { key: 'scheduled', label: 'Schedule', note: 'Pick a day to prepare service.', icon: clientIcons.booking },
    ]

  if (guestMode) {
    return (
      <CustomerScreen active="booking" showHeader={false} title={t.book} testID="rebuild-customer-booking">
        <CustomerFlowTitle title={language === 'vi' ? 'Dịch vụ cần đăng nhập' : 'Sign in to use services'} />
        <KaelCard style={styles.bookingCoreCard} testID="guest-service-login-required">
          <View style={styles.guestGateHero}>
            <KaelMascot state="understood" size={118} />
            <View style={styles.heroCopy}>
              <KaelText variant="h2">{language === 'vi' ? 'Bạn đang xem ở chế độ khách' : 'You are browsing as a guest'}</KaelText>
              <KaelText tone="secondary">
                {language === 'vi'
                  ? 'Bạn có thể xem khu vực khách hàng. Để đặt sửa điện, sửa nước hoặc vệ sinh nhà thật, hãy đăng nhập tài khoản khách hàng.'
                  : 'You can view the customer area. To book real electrical, plumbing, or home cleaning services, sign in as a client.'}
              </KaelText>
            </View>
          </View>
          <KaelButton
            label={language === 'vi' ? 'Đăng nhập khách hàng' : 'Sign in as client'}
            onPress={() => router.replace('/(auth)/login' as never)}
            testID="guest-service-login-required-action"
          />
        </KaelCard>
      </CustomerScreen>
    )
  }

  const submitToKael = async () => {
    if (!serviceType) {
      setError(language === 'vi' ? 'Chọn dịch vụ trước khi gửi Kael.' : 'Choose a service before sending to Kael.')
      return
    }
    if (description.trim().length < 10) {
      setError(language === 'vi' ? 'Mô tả cần rõ hơn trước khi gửi Kael.' : 'Add a clearer description before sending to Kael.')
      return
    }
    setError(null)
    await setPendingKaelChatDraft({
      clientRequestId: generateClientRequestId(),
      createdAt: new Date().toISOString(),
      districtLabel: districtLabel.trim() || null,
      locale: language,
      mediaCount: 0,
      message: formatBookingIntakeMessage(serviceType, [], description, districtLabel, timingMode, scheduledDateIso, language),
      problemChips: [],
      serviceType,
      source: 'booking',
    })
    router.replace('/(customer)/kael-chat?mode=case' as never)
  }

  return (
    <CustomerScreen active="booking" showHeader={false} title={t.book} testID="rebuild-customer-booking">
      <CustomerFlowTitle title={language === 'vi' ? 'Tìm dịch vụ' : 'Find service'} />
      <KaelCard style={styles.bookingCoreCard} testID="rebuild-booking-filter">
        <View style={styles.bookingChoiceCluster}>
          <KaelText tone="secondary" variant="caption">{language === 'vi' ? 'Chọn dịch vụ' : 'Choose service'}</KaelText>
          <View style={styles.bookingServiceGrid}>
            {serviceOrder.map((service) => {
              const selected = serviceType === service
              return (
                <BookingServiceCard
                  icon={clientIcons[service]}
                  key={service}
                  label={serviceCopy[service][language].label}
                  note={serviceCopy[service][language].note}
                  onPress={() => setServiceType(service)}
                  selected={selected}
                  testID={`booking-service-${service}`}
                />
              )
            })}
          </View>
        </View>
        <KaelTextField
          inputShellStyle={styles.bookingCompactInputShell}
          shellStyle={styles.bookingCompactField}
          style={styles.bookingCompactInput}
          label={language === 'vi' ? 'Chung cư / khu vực' : 'Building / area'}
          onChangeText={setDistrictLabel}
          placeholder={language === 'vi' ? 'Ví dụ: Quận 7, TP.HCM' : 'Example: District 7, HCMC'}
          value={districtLabel}
        />
        <KaelTextField
          inputShellStyle={styles.bookingCompactInputShell}
          shellStyle={styles.bookingCompactField}
          style={styles.bookingCompactInput}
          label={language === 'vi' ? 'Ghi chú thêm' : 'Additional note'}
          multiline
          onChangeText={setDescription}
          placeholder={language === 'vi' ? 'Mô tả đủ để Kael phân tích vấn đề...' : 'Describe enough for Kael to analyze...'}
          value={description}
        />
        <View style={styles.bookingOptionBlock}>
          <KaelText variant="label">{language === 'vi' ? 'Thời gian' : 'Time'}</KaelText>
          <View style={styles.bookingTimingGrid}>
            {timingOptions.map((option) => (
              <BookingTimingCard
                icon={option.icon}
                key={option.key}
                label={option.label}
                note={option.note}
                onPress={() => {
                  setTimingMode(option.key)
                  if (option.key === 'scheduled') {
                    setCalendarMonthIso(toMonthIso(parseLocalIsoDate(scheduledDateIso)))
                  }
                }}
                selected={timingMode === option.key}
              />
            ))}
          </View>
          {timingMode === 'scheduled' ? (
            <BookingCalendarPicker
              language={language}
              monthIso={calendarMonthIso}
              onChangeMonth={setCalendarMonthIso}
              onSelectDate={setScheduledDateIso}
              selectedDateIso={scheduledDateIso}
            />
          ) : null}
        </View>
        <View style={styles.bookingEvidenceInline} testID="rebuild-booking-media">
          <CustomerFlowTitle title={t.mediaVoice} compact />
          <KaelMediaUploadTray label={language === 'vi' ? 'Thêm hình ảnh hoặc video' : 'Add image or video'} testID="booking-media-upload-tray" />
          <KaelVoiceInputCapsule label={language === 'vi' ? 'Ghi chú giọng nói' : 'Voice note'} testID="booking-voice-note-capsule" />
        </View>
        {error ? <KaelText tone="secondary" variant="caption">{error}</KaelText> : null}
        <KaelButton label={language === 'vi' ? 'Đặt đến đội Kael giúp bạn' : 'Send to Kael team'} onPress={submitToKael} testID="booking-submit-to-kael" />
      </KaelCard>
    </CustomerScreen>
  )
}

export function CustomerHistorySurface() {
  const language = useAppLanguage()
  const t = copy[language]
  const [selectedTab, setSelectedTab] = useState<CustomerActivityTab>('all')
  const { state, notifications } = useFrontendWorkflow()
  const deal = state.deal
  const tabs: { key: CustomerActivityTab; label: string }[] = language === 'vi'
    ? [
      { key: 'all', label: 'Tất cả' },
      { key: 'active', label: 'Đang chạy' },
      { key: 'review', label: 'Cần duyệt' },
      { key: 'done', label: 'Hoàn tất' },
    ]
    : [
      { key: 'all', label: 'All' },
      { key: 'active', label: 'Active' },
      { key: 'review', label: 'Review' },
      { key: 'done', label: 'Done' },
    ]

  return (
    <CustomerScreen active="activity" showHeader={false} title={t.activity} testID="rebuild-customer-history">
      <KaelCard large raised style={styles.activityHero} testID="rebuild-customer-history-hero">
        <View style={styles.heroCopy}>
          <KaelBadge label={language === 'vi' ? 'Hồ sơ dịch vụ' : 'Service case'} variant="mint" />
          <KaelText variant="h2">{language === 'vi' ? 'Hoạt động dịch vụ' : 'Service activity'}</KaelText>
          <KaelText tone="secondary">{deal ? statusLabel(deal.status, language) : (language === 'vi' ? 'Chưa có đơn hoạt động' : 'No active request')}</KaelText>
        </View>
        <View style={styles.activityHeroMascot}>
          <KaelMascot state={deal ? 'analyzing' : 'thinking'} size={138} />
        </View>
      </KaelCard>

      <View style={styles.activityFilterTabs}>
        {tabs.map((tab) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: selectedTab === tab.key }}
            key={tab.key}
            onPress={() => setSelectedTab(tab.key)}
            style={[styles.activityFilterTab, selectedTab === tab.key ? styles.activityFilterTabActive : null]}
            testID={`customer-activity-tab-${tab.key}`}
          >
            <KaelText tone={selectedTab === tab.key ? 'strong' : 'secondary'} variant="caption">{tab.label}</KaelText>
          </Pressable>
        ))}
      </View>

      <CustomerActivityPhaseBoard deal={deal} notifications={notifications} selectedTab={selectedTab} />
    </CustomerScreen>
  )
}

export function CustomerAgenticCenterSurface() {
  const language = useAppLanguage()
  const t = copy[language]
  const router = useRouter()
  const { customerKaelMemory, notificationUnreadCount, notifications, state } = useFrontendWorkflow()
  const deal = state.deal
  const memoryItems = kaelMemoryItems(customerKaelMemory, language)

  return (
    <CustomerScreen active="kael" title={t.agenticCenter} testID="rebuild-agentic-center">
      <KaelCard large raised style={styles.agenticHero}>
        <View style={styles.agenticHeroCopy}>
          <KaelText tone="secondary" variant="caption">Kael Agentic Center</KaelText>
          <KaelText variant="h2">{t.commandCenter}</KaelText>
          <KaelText tone="secondary">{language === 'vi' ? 'Nằm trong Kael Orb, theo dõi việc đang chạy và những gì cần bạn duyệt.' : 'Lives inside the Kael Orb and tracks active work plus approvals.'}</KaelText>
        </View>
        <KaelMascot state="findingWorker" size={150} />
      </KaelCard>

      <TileGrid>
        <ProfileStatTile icon={statusIcons.pending} label={language === 'vi' ? 'Đơn đang xử lý' : 'Active cases'} value={deal ? '1' : t.dataPending} />
        <ProfileStatTile icon={statusIcons.warning} label={t.approvalQueue} value={notificationUnreadCount > 0 ? formatMetric(notificationUnreadCount, language) : t.dataPending} />
        <ProfileStatTile icon={clientIcons.profile} label={language === 'vi' ? 'Tín hiệu bộ nhớ' : 'Memory signals'} value={customerKaelMemory ? formatMetric(memoryItems.length, language) : t.dataPending} />
      </TileGrid>

      <KaelCard testID="rebuild-agentic-active-case">
        <SectionHeading title="5.2 Active Case Command Center" subtitle={deal ? statusLabel(deal.status, language) : t.dataPending} />
        {deal ? <DealSummary /> : <EmptyTruth text={t.noFake} />}
        <View style={styles.agenticStageRail}>
          {agenticStageLabels(language).map((label, index) => (
            <KaelChip key={label} label={label} variant={deal && index === activeAgenticStageIndex(deal.status) ? 'selected' : 'unselected'} />
          ))}
        </View>
        <KaelButton label={t.continueWithKael} onPress={() => router.replace('/(customer)/kael-chat' as never)} />
      </KaelCard>

      <KaelCard testID="rebuild-agentic-approval-queue">
        <SectionHeading title={`5.3 ${t.approvalQueue}`} subtitle={notificationUnreadCount > 0 ? `${notificationUnreadCount}` : t.dataPending} />
        {notifications.length === 0 ? <EmptyTruth text={t.noFake} /> : notifications.slice(0, 3).map((notification) => (
          <FlowCard
            compact
            icon={notification.read_at ? statusIcons.completed : statusIcons.pending}
            key={notification.id}
            title={notification.title}
            value={notification.body ?? statusLabel(notification.event_type, language)}
          />
        ))}
      </KaelCard>

      <KaelCard testID="rebuild-agentic-memory">
        <SectionHeading title="5.4 Memory & Preferences" subtitle={customerKaelMemory?.preference_summary ?? t.dataPending} />
        {memoryItems.length === 0 ? <EmptyTruth text={t.noFake} /> : memoryItems.map((item) => (
          <MetricRow key={item.label} label={item.label} value={item.value} />
        ))}
      </KaelCard>
    </CustomerScreen>
  )
}

export function KaelChatSurface() {
  const language = useAppLanguage()
  const t = copy[language]
  const router = useRouter()
  const params = useLocalSearchParams<{
    ns_audit_role?: string | string[]
    ns_audit_surface?: string | string[]
    ns_worker_avatar_url?: string | string[]
  }>()
  const { actions, state, workerEarnings } = useFrontendWorkflow()
  const deal = state.deal
  const [pendingDraft, setPendingDraft] = useState(() => takePendingKaelChatDraft())
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const activeDescription = pendingDraft?.message ?? deal?.draft.description ?? t.noFake
  const auditRole = firstRouteParam(params.ns_audit_role)
  const auditSurface = firstRouteParam(params.ns_audit_surface)
  const auditWorkerAvatarUrl = safeImageUri(firstRouteParam(params.ns_worker_avatar_url) ?? deal?.workerProfile?.avatarUrl)

  if (auditRole === 'customer' && auditSurface === 'kael_live_performance') {
    return <KaelLivePerformanceAuditSurface language={language} />
  }
  if (auditRole === 'customer' && auditSurface === 'kael_care_overview') {
    return <KaelCareOverviewAuditSurface deal={deal} language={language} />
  }
  if (auditRole === 'customer' && auditSurface === 'matching_ai_score') {
    return <MatchingAiScoreAuditSurface deal={deal} language={language} workerAvatarUrl={auditWorkerAvatarUrl} />
  }
  if (auditRole === 'customer' && auditSurface === 'kael_helper_fix_options') {
    return <KaelHelperFixOptionsAuditSurface deal={deal} language={language} />
  }
  if (auditRole === 'customer' && auditSurface === 'worker_offer_quote') {
    return <WorkerOfferQuoteAuditSurface deal={deal} language={language} />
  }
  if (auditRole === 'customer' && auditSurface === 'location_eta') {
    return <LocationEtaAuditSurface deal={deal} language={language} />
  }
  if (auditRole === 'customer' && auditSurface === 'case_completion_summary') {
    return <CaseCompletionSummaryAuditSurface deal={deal} language={language} />
  }
  if (auditRole === 'customer' && auditSurface === 'payment_gate') {
    return <CustomerPaymentGateAuditSurface deal={deal} language={language} />
  }

  const submitPendingJob = async () => {
    if (!pendingDraft?.serviceType) {
      setMessage(language === 'vi' ? 'Kael chưa có intake đủ dữ liệu từ booking.' : 'Kael does not have enough booking intake yet.')
      return
    }
    setCreating(true)
    setMessage(null)
    const result = await actions.createRemoteJobFromDraft(
      pendingDraftToLocalDealDraft(pendingDraft, language),
      pendingDraft.photoDrafts ?? [],
    )
    setCreating(false)
    if (result) {
      setPendingDraft(null)
      setMessage(language === 'vi' ? 'Kael đã tạo yêu cầu thật và bắt đầu phân tích.' : 'Kael created the real request and started analysis.')
    } else {
      setMessage(language === 'vi' ? 'Chưa tạo được yêu cầu. Kiểm tra lại dữ liệu hoặc cấu hình backend.' : 'Could not create the request. Check input or backend configuration.')
    }
  }

  return (
    <RebuildPlainScreen testID="rebuild-kael-chat">
      <View style={styles.chatShell}>
        <BrandCluster />
        <HeroCard mascotState="thinking" subtitle={activeDescription} title={language === 'vi' ? 'Kael Live Performance Chat' : 'Kael Live Performance Chat'} />
        <KaelCard>
          <SectionHeading title={t.analysis} subtitle={deal?.estimate?.problemLabel ?? t.dataPending} />
          <View style={styles.chatMessageStack}>
            <FlowCard icon={clientIcons.evidence} title={t.evidence} value={deal ? `${deal.draft.mediaCount}` : formatMetric(pendingDraft?.mediaCount, language)} compact />
            <FlowCard icon={statusIcons.pending} title={language === 'vi' ? 'Trạng thái' : 'Status'} value={deal ? statusLabel(deal.status, language) : pendingDraft ? (language === 'vi' ? 'Chờ tạo yêu cầu thật' : 'Waiting to create real request') : t.dataPending} compact />
            <FlowCard icon={clientIcons.booking} title={language === 'vi' ? 'Vấn đề' : 'Issues'} value={pendingDraft?.problemChips?.join(', ') || deal?.draft.problemChips.join(', ') || t.dataPending} compact />
          </View>
          <KaelTextField editable={false} label={language === 'vi' ? 'Composer thật giữ qua Kael backend' : 'Real composer stays behind Kael backend'} multiline value={activeDescription} />
          {message ? <KaelText tone="secondary" variant="caption">{message}</KaelText> : null}
          {pendingDraft ? (
            <KaelButton label={language === 'vi' ? 'Tạo yêu cầu thật với Kael' : 'Create real request with Kael'} loading={creating} onPress={submitPendingJob} />
          ) : (
            <KaelButton label={language === 'vi' ? 'Quay lại đặt dịch vụ' : 'Back to booking'} onPress={() => router.replace('/(customer)/booking' as never)} variant="ghost" />
          )}
        </KaelCard>
      </View>
    </RebuildPlainScreen>
  )
}

function KaelLivePerformanceAuditSurface({ language }: { language: AppLanguage }) {
  const tokens = useKaelChatTokens()
  const workflow = buildWorkflowViewModel({ status: null })
  const text = kaelLivePerformanceAuditText(language)
  const pendingIntake: PendingKaelChatDraft = {
    clientRequestId: 'ns-audit-live-performance',
    createdAt: '2026-06-13T00:00:00.000Z',
    districtLabel: null,
    locale: language,
    mediaCount: 4,
    message: language === 'vi'
      ? 'Ổ cắm cháy cạnh tủ bếp, có mùi khét và mất điện một phần.'
      : 'The outlet near the kitchen cabinet is scorched, smells burned, and has partial power loss.',
    photoDrafts: [
      { type: 'image', uri: 'audit://kael-live-performance-photo-01' },
      { type: 'image', uri: 'audit://kael-live-performance-photo-02' },
      { type: 'video', uri: 'audit://kael-live-performance-video' },
      { type: 'audio', uri: 'audit://kael-live-performance-voice-note' },
    ],
    problemChips: language === 'vi' ? ['Ổ cắm cháy', 'Mùi khét', 'Mất điện cục bộ'] : ['Burned outlet', 'Burning smell', 'Partial outage'],
    serviceType: 'electrical',
    source: 'booking',
  }
  const progressTrace: KaelChatProgress[] = [
    {
      current_stage: 'intent_classification',
      failure_reason: null,
      progress: 0.18,
      status: 'completed',
      updated_at: '2026-06-13T00:00:01.000Z',
    },
    {
      current_stage: 'vision_analysis',
      failure_reason: null,
      progress: 0.44,
      status: 'completed',
      updated_at: '2026-06-13T00:00:03.000Z',
    },
    {
      current_stage: 'market_lookup',
      failure_reason: null,
      progress: 0.68,
      status: 'running',
      updated_at: '2026-06-13T00:00:05.000Z',
    },
  ]
  const turns: KaelChatTurn[] = [
    {
      content_type: 'text',
      created_at: '2026-06-13T00:00:00.000Z',
      estimate: null,
      id: 'audit-customer-turn-1',
      media_refs: [],
      role: 'customer',
      session_id: 'audit-live-performance',
      text_content: pendingIntake.message,
      turn_index: 1,
    },
  ]
  const [auditPhotoDrafts, setAuditPhotoDrafts] = useState(pendingIntake.photoDrafts ?? [])
  const [draft, setDraft] = useState('')
  const [addressLabel, setAddressLabel] = useState('')
  const [composerError, setComposerError] = useState<string | null>(null)
  const [composerSending, setComposerSending] = useState(false)
  const displayPendingIntake = {
    ...pendingIntake,
    addressLabel: addressLabel.trim() || undefined,
    districtLabel: addressLabel.trim() ? pendingIntake.districtLabel : null,
    mediaCount: Math.max(pendingIntake.mediaCount ?? 0, auditPhotoDrafts.length),
    photoDrafts: auditPhotoDrafts,
  }
  const dispatchComposerAction = (action: KaelChatAction) => {
    if (action.type === 'setDraft') {
      setDraft(action.value)
      if (action.clearTransientError) setComposerError(null)
      return
    }
    if (action.type === 'appendDraft') {
      setDraft((current) => (current.trim() ? `${current.trim()} ${action.segment.trim()}` : action.segment.trim()))
      setComposerError(null)
      return
    }
    if (action.type === 'setAddress') {
      setAddressLabel(action.value)
      return
    }
    if (action.type === 'addComposerPhotos') {
      setAuditPhotoDrafts((current) => [...current, ...action.drafts])
      setComposerError(null)
      return
    }
    if (action.type === 'composerPhotosUploaded') {
      setAuditPhotoDrafts([])
      return
    }
    if (action.type === 'showTransientError') {
      setComposerError(action.error)
    }
  }
  const sendAuditMessage = async () => {
    if (!draft.trim()) {
      setComposerError(text.errorNoService)
      return
    }
    setComposerSending(true)
    await Promise.resolve()
    setDraft('')
    setComposerError(null)
    setComposerSending(false)
  }

  return (
    <SafeAreaView style={styles.safeArea} testID="rebuild-kael-live-performance-audit">
      <MintAura intensity="page" />
      <KaelChatThread
        addressDistrict={displayPendingIntake.districtLabel ?? null}
        dispatch={() => undefined}
        error={null}
        estimate={null}
        historyTarget="/(customer)/history"
        language={language}
        loading={false}
        onOpenHistory={() => undefined}
        onRetryPendingIntake={() => undefined}
        onStartOrchestration={async () => undefined}
        orchestrating={false}
        orchestrationMessage={null}
        pendingIntake={displayPendingIntake}
        progress={progressTrace.at(-1) ?? null}
        progressTrace={progressTrace}
        reduceMotion
        selectedService="electrical"
        sending
        session={null}
        text={text}
        tokens={tokens}
        turns={turns}
        visibility={{
          canStartOrchestration: false,
          showBrief: false,
          showEstimate: false,
          showProcess: false,
          showStarter: false,
          showTrace: false,
        }}
        workflow={workflow}
      />
      <View style={styles.kaelLiveAuditComposerDock} testID="customer-kael-live-performance-composer-dock">
        <KaelChatComposer
          addressLabel={addressLabel}
          dispatch={dispatchComposerAction}
          draft={draft}
          error={composerError}
          hideAddressContext
          language={language}
          onAddressDistrict={setAddressLabel}
          onSend={sendAuditMessage}
          reduceMotion
          sending={composerSending}
          text={text}
          themeMode="light"
          tokens={tokens}
        />
      </View>
    </SafeAreaView>
  )
}

type KaelCareOverviewAuditData = {
  appointmentLabel: string
  confidenceLabel: string
  evidenceLabel: string
  priceLabel: string
  requestCode: string
  serviceLabel: string
  statusLabel: string
}

type MatchingAiScoreAuditData = {
  arrivalLabel: string
  matchScoreLabel: string | null
  matchStatusLabel: string
  ratingLabel: string | null
  reviewLabel: string | null
  skillLabel: string
  workerCode: string | null
  workerName: string
}

type CustomerAgenticCaseAuditData = {
  areaLabel: string
  canOpenCompletion: boolean
  canOpenLocation: boolean
  canOpenQuote: boolean
  completionReviewLabel: string
  durationLabel: string
  etaLabel: string
  helperSummaryLabel: string
  helperSummaryMeta: string
  helperSteps: { done: boolean; label: string }[]
  locationStatusLabel: string
  mapActionLabel: string
  mapProviderBadge: string
  mapProviderSubtitle: string
  mapProviderTitle: string
  paymentLabel: string
  pendingLabel: string
  quoteRows: { icon: ImageSourcePropType; label: string; value: string }[]
  quoteSummaryMeta: string
  routeDestinationLabel: string | null
  reviewActionLabel: string
  scheduleLabel: string
  serviceLabel: string
  totalQuoteLabel: string
}

function KaelCareOverviewAuditSurface({ deal, language }: { deal: LocalDeal | null; language: AppLanguage }) {
  const router = useRouter()
  const data = kaelCareOverviewAuditData(language, deal)
  const t = kaelCareOverviewAuditCopy(language)

  return (
    <SafeAreaView style={styles.safeArea} testID="customer-kael-care-overview-audit">
      <MintAura intensity="page" />
      <View style={styles.kaelHandoffFrame}>
        <View style={styles.kaelAuditPhoneShell}>
          <View style={styles.kaelAuditStatusBar}>
            <View style={styles.kaelAuditStatusDot} />
            <View style={styles.kaelAuditStatusPill} />
          </View>

          <View style={styles.kaelCareHeroCard} testID="customer-kael-care-overview-hero">
            <View pointerEvents="none" style={styles.kaelCareHeroSheen} />
            <View style={styles.kaelCareMascotSlot}>
              <KaelMascot size={86} state="priceCheck" variant="full" />
            </View>
            <View style={styles.kaelCareHeroCopy}>
              <KaelText tone="inverse" variant="label" style={styles.kaelCareRequestCode}>{data.requestCode}</KaelText>
              <KaelText tone="inverse" variant="caption">{data.serviceLabel}</KaelText>
              <KaelText tone="inverse" variant="caption">{data.statusLabel}</KaelText>
            </View>
          </View>

          <View style={styles.kaelCareScoreBlock}>
            <KaelText tone="secondary" variant="caption" style={styles.kaelCareScoreLabel}>{t.matchLabel}</KaelText>
            <View style={styles.kaelCareScoreValueStack}>
              <KaelText variant="h1" style={styles.kaelCareScoreValue}>{data.confidenceLabel}</KaelText>
              <KaelText tone="strong" variant="label" style={styles.matchingScoreLabel}>{t.matchLevel}</KaelText>
            </View>
          </View>

          <View style={styles.kaelCareRows}>
            <KaelCareOverviewRow label={t.confidence} value={data.evidenceLabel} />
            <KaelCareOverviewRow label={t.price} value={data.priceLabel} />
            <KaelCareOverviewRow label={t.time} value={data.appointmentLabel} />
          </View>

          <KaelButton
            label={t.cta}
            onPress={() => router.replace('/(customer)/kael-chat?ns_audit_role=customer&ns_audit_surface=matching_ai_score' as never)}
            style={styles.kaelAuditPrimaryCta}
            testID="customer-kael-care-overview-continue"
          />
        </View>
      </View>
    </SafeAreaView>
  )
}

function MatchingAiScoreAuditSurface({ deal, language, workerAvatarUrl }: { deal: LocalDeal | null; language: AppLanguage; workerAvatarUrl?: string | null }) {
  const router = useRouter()
  const data = matchingAiScoreAuditData(language, deal)
  const t = matchingAiScoreAuditCopy(language)
  const hasWorker = Boolean(deal?.workerProfile?.id)
  const headline = hasWorker ? t.headline : (language === 'vi' ? '\u0110ang ch\u1edd th\u1ee3 ph\u00f9 h\u1ee3p' : 'Waiting for matched worker')
  const workerTitle = data.workerCode ? `${data.workerName} - ${data.workerCode}` : data.workerName
  const detailLabel = hasWorker ? t.cta : (language === 'vi' ? 'Chờ thợ nhận ca' : 'Waiting for worker acceptance')

  return (
    <SafeAreaView style={styles.safeArea} testID="customer-matching-ai-score-audit">
      <MintAura intensity="page" />
      <View style={styles.kaelHandoffFrame}>
        <View style={styles.kaelAuditPhoneShell}>
          <View style={styles.kaelAuditStatusBar}>
            <View style={styles.kaelAuditStatusDot} />
            <View style={styles.kaelAuditStatusPill} />
          </View>
          <KaelText variant="h3" style={styles.matchingHeadline}>{headline}</KaelText>

          <View style={styles.matchingScoreHero} testID="customer-matching-ai-score-hero">
            <View style={styles.matchingScoreMascotSlot}>
              <KaelMascot
                size={MATCHING_AI_SCORE_MASCOT_SIZE}
                state="findingWorker"
                style={styles.matchingScoreMascotImage}
                variant="full"
              />
            </View>
            <View style={styles.matchingScoreCopy}>
              {data.matchScoreLabel ? (
                <KaelText variant="h1" style={styles.matchingScoreValue}>{data.matchScoreLabel}</KaelText>
              ) : (
                <KaelText tone="strong" variant="label" style={styles.matchingScorePending}>{data.matchStatusLabel}</KaelText>
              )}
              <KaelText tone="strong" variant="label" style={styles.matchingScoreLabel}>{t.matchLevel}</KaelText>
            </View>
          </View>

          <View style={styles.matchingWorkerCard} testID="customer-matching-ai-score-worker">
            <View style={styles.matchingWorkerIdentity}>
              <WorkerAvatarTile avatarUrl={workerAvatarUrl} />
              <View style={styles.matchingWorkerCopy}>
                <KaelText numberOfLines={1} variant="label" style={styles.matchingWorkerName}>{workerTitle}</KaelText>
                {data.ratingLabel ? <KaelText tone="strong" variant="label">{data.ratingLabel}</KaelText> : null}
                {data.reviewLabel ? <KaelText tone="secondary" variant="caption">{data.reviewLabel}</KaelText> : null}
              </View>
            </View>
            <View style={styles.matchingWorkerFacts}>
              <KaelCareOverviewRow label={t.skill} value={data.skillLabel} />
              <KaelCareOverviewRow label={t.arrival} value={data.arrivalLabel} />
            </View>
          </View>

          <View style={styles.matchingKaelNote}>
            <KaelText tone="secondary" variant="caption" style={styles.matchingKaelNoteText}>{t.note}</KaelText>
          </View>

          <KaelButton
            disabled={!hasWorker}
            label={detailLabel}
            onPress={() => router.replace('/(customer)/kael-chat?ns_audit_role=customer&ns_audit_surface=kael_helper_fix_options' as never)}
            style={styles.kaelAuditPrimaryCta}
            testID="customer-matching-ai-score-detail"
          />
        </View>
      </View>
    </SafeAreaView>
  )
}

function KaelHelperFixOptionsAuditSurface({ deal, language }: { deal: LocalDeal | null; language: AppLanguage }) {
  const router = useRouter()
  const data = customerAgenticCaseAuditData(language, deal)
  const doneCount = data.helperSteps.filter((item) => item.done).length
  return (
    <CustomerAgenticAuditFrame testID="customer-kael-helper-fix-options-audit">
      <KaelText variant="h3" style={styles.matchingHeadline}>{language === 'vi' ? 'Kael kiểm tra trước báo giá' : 'Kael checks before quoting'}</KaelText>
      <View style={styles.agenticChecklist} testID="customer-helper-fix-options-list">
        {data.helperSteps.map((item, index) => (
          <AgenticChecklistRow
            done={item.done}
            key={`${item.label}-${index}`}
            label={item.label}
            testID={`customer-helper-fix-option-${index}`}
          />
        ))}
      </View>
      <View style={styles.agenticSummaryPanel}>
        <KaelText tone="secondary" variant="caption">{language === 'vi' ? 'Trạng thái' : 'Status'}</KaelText>
        <KaelText variant="h3" style={styles.agenticStrongValue}>
          {data.helperSummaryLabel}
        </KaelText>
        <KaelText tone="secondary" variant="caption">{`${formatMetric(doneCount, language)} / ${formatMetric(data.helperSteps.length, language)} · ${data.helperSummaryMeta}`}</KaelText>
      </View>
      <KaelButton
        disabled={!data.canOpenQuote}
        label={data.canOpenQuote ? (language === 'vi' ? 'Xem báo giá' : 'View quote') : (language === 'vi' ? 'Chưa đủ dữ liệu' : 'Waiting for real data')}
        onPress={() => router.replace('/(customer)/kael-chat?ns_audit_role=customer&ns_audit_surface=worker_offer_quote' as never)}
        style={styles.kaelAuditPrimaryCta}
        testID="customer-helper-fix-options-next"
      />
    </CustomerAgenticAuditFrame>
  )
}

function WorkerOfferQuoteAuditSurface({ deal, language }: { deal: LocalDeal | null; language: AppLanguage }) {
  const router = useRouter()
  const data = customerAgenticCaseAuditData(language, deal)
  return (
    <CustomerAgenticAuditFrame testID="customer-worker-offer-quote-audit">
      <KaelText variant="h3" style={styles.matchingHeadline}>{language === 'vi' ? 'Đề xuất & báo giá' : 'Offer & quote'}</KaelText>
      <View style={styles.agenticQuoteRows} testID="customer-worker-offer-quote-rows">
        {data.quoteRows.map((item, index) => (
          <AgenticQuoteRow
            icon={item.icon}
            key={`${item.label}-${index}`}
            label={item.label}
            testID={`customer-worker-offer-quote-row-${index}`}
            value={item.value}
          />
        ))}
      </View>
      <View style={styles.agenticDivider} />
      <KaelCareOverviewRow label={language === 'vi' ? 'Tổng cộng' : 'Total'} value={data.totalQuoteLabel} />
      <KaelCareOverviewRow label={language === 'vi' ? 'Thời gian dự kiến' : 'Estimated time'} value={data.durationLabel} />
      <KaelButton
        disabled={!data.canOpenLocation}
        label={data.canOpenLocation ? (language === 'vi' ? 'Theo dõi thợ' : 'Track worker') : (language === 'vi' ? 'Chờ thợ bắt đầu di chuyển' : 'Waiting for worker route')}
        onPress={() => router.replace('/(customer)/kael-chat?ns_audit_role=customer&ns_audit_surface=location_eta' as never)}
        style={styles.kaelAuditPrimaryCta}
        testID="customer-worker-offer-quote-next"
      />
    </CustomerAgenticAuditFrame>
  )
}

function LocationEtaAuditSurface({ deal, language }: { deal: LocalDeal | null; language: AppLanguage }) {
  const router = useRouter()
  const data = customerAgenticCaseAuditData(language, deal)
  return (
    <CustomerAgenticAuditFrame testID="customer-location-eta-audit">
      <KaelText variant="h3" style={styles.matchingHeadline}>{language === 'vi' ? 'Thợ đang tới' : 'Worker on the way'}</KaelText>
      <CustomerProviderMapPanel data={data} language={language} />
      <View style={styles.agenticEtaRows}>
        <InfoStrip icon={clientIcons.address} label={language === 'vi' ? 'Khu vực' : 'Area'} value={data.areaLabel} />
        <InfoStrip icon={clientIcons.activity} label={language === 'vi' ? 'Theo dõi di chuyển' : 'Movement tracking'} value={data.locationStatusLabel} />
        <InfoStrip icon={clientIcons.booking} label={language === 'vi' ? 'Thời gian dự kiến' : 'Estimated arrival'} value={data.etaLabel} />
      </View>
      <KaelButton
        disabled={!data.canOpenCompletion}
        label={data.canOpenCompletion ? (language === 'vi' ? 'Xem tổng kết' : 'View summary') : (language === 'vi' ? 'Chờ giải quyết công việc hoàn tất' : 'Waiting for completion')}
        onPress={() => router.replace('/(customer)/kael-chat?ns_audit_role=customer&ns_audit_surface=case_completion_summary' as never)}
        style={styles.kaelAuditPrimaryCta}
        testID="customer-location-eta-next"
      />
    </CustomerAgenticAuditFrame>
  )
}

function CaseCompletionSummaryAuditSurface({ deal, language }: { deal: LocalDeal | null; language: AppLanguage }) {
  const router = useRouter()
  const data = customerAgenticCaseAuditData(language, deal)
  return (
    <CustomerAgenticAuditFrame testID="customer-case-completion-summary-audit">
      <View style={styles.agenticEndingHero}>
        <IconTile source={statusIcons.completed} large />
        <View style={styles.centerCopy}>
          <KaelText variant="h3" style={styles.centerText}>{language === 'vi' ? 'Giải quyết công việc đã khép lại' : 'Case wrapped up'}</KaelText>
          <KaelText tone="secondary" variant="caption" style={styles.centerText}>
            {language === 'vi'
              ? 'Kael giữ lại trạng thái đối soát, thanh toán và đánh giá để bạn kiểm tra sau khi giải quyết công việc.'
              : 'Kael keeps review, payment, and rating status visible after the job.'}
          </KaelText>
        </View>
      </View>
      <View style={styles.agenticEtaRows}>
        <InfoStrip icon={clientIcons.booking} label={language === 'vi' ? 'Dịch vụ' : 'Service'} value={data.serviceLabel} />
        <InfoStrip icon={statusIcons.pending} label={language === 'vi' ? 'Kael đối soát' : 'Kael review'} value={data.completionReviewLabel} />
        <InfoStrip icon={clientIcons.payment} label={language === 'vi' ? 'Thanh toán' : 'Payment'} value={data.paymentLabel} />
        <InfoStrip icon={clientIcons.feedback} label={language === 'vi' ? 'Đánh giá' : 'Review'} value={data.reviewActionLabel} />
      </View>
      <KaelText tone="secondary" variant="caption" style={styles.agenticDisclosure}>
        {language === 'vi'
          ? 'Màn này không tự đánh dấu đã thanh toán hay hoàn tất nếu hệ thống chưa có quyết định Kael hợp lệ.'
          : 'This screen does not mark payment or completion without a valid backend Kael decision.'}
      </KaelText>
      <KaelButton
        label={language === 'vi' ? 'Mở cổng thanh toán' : 'Open payment gate'}
        onPress={() => router.replace('/(customer)/kael-chat?ns_audit_role=customer&ns_audit_surface=payment_gate' as never)}
        style={styles.kaelAuditPrimaryCta}
        testID="customer-case-completion-summary-open-payment"
      />
    </CustomerAgenticAuditFrame>
  )
}

function CustomerPaymentGateAuditSurface({ deal, language }: { deal: LocalDeal | null; language: AppLanguage }) {
  const router = useRouter()
  const [creatingPayment, setCreatingPayment] = useState(false)
  const [paymentOverride, setPaymentOverride] = useState<LocalDealPayment | null>(null)
  const [paymentBackendStatus, setPaymentBackendStatus] = useState<LocalDeal['backendStatus'] | null>(null)
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null)
  const data = customerAgenticCaseAuditData(language, deal)
  const payment = paymentOverride ?? deal?.payment ?? null
  const backendStatus = paymentBackendStatus ?? deal?.backendStatus ?? deal?.status
  const paymentPending = hasWorkerStatus(backendStatus, ['payment_pending'])
  const paymentQrReady = Boolean(payment?.qrImageUrl)
  const paymentRecorded = hasWorkerStatus(backendStatus, ['paid', 'reviewed']) || ['received', 'reconciled'].includes(payment?.status ?? 'not_started')
  const paymentDecisionReady = paymentPending || paymentRecorded || paymentQrReady
  const jobCode = deal?.displayCode ?? (deal?.id && deal.id !== LOCAL_DEAL_ID ? buildLocalJobDisplayCode({ jobId: deal.id }) : data.pendingLabel)
  const finalPrice = payment?.grossAmount ?? deal?.finalPrice ?? null
  const finalPriceLabel = formatPositiveVnd(finalPrice, language)
  const statusLabelText = paymentRecorded
    ? (language === 'vi' ? 'Đã ghi nhận giao dịch' : 'Payment recorded')
    : paymentPending
      ? (language === 'vi' ? 'Đang đối soát giao dịch' : 'Reconciling payment')
      : (language === 'vi' ? 'Chờ quyết định thanh toán' : 'Waiting for payment decision')
  const gateLabel = paymentDecisionReady
    ? (language === 'vi' ? 'Chờ mã thanh toán' : 'Waiting for payment code')
    : (language === 'vi' ? 'Chờ mã VietQR' : 'Waiting for VietQR')
  const workerPayoutLabel = paymentRecorded
    ? (language === 'vi' ? 'Chờ đối soát thợ thực nhận' : 'Worker payout reconciliation')
    : data.pendingLabel
  const paymentCodeLabel = payment?.paymentCode ?? gateLabel
  const workerPayoutDisplay = payment?.workerNet ? formatPositiveVnd(payment.workerNet, language) : workerPayoutLabel
  const canCreatePayment = Boolean(
    deal?.id &&
    deal.id !== LOCAL_DEAL_ID &&
    finalPrice &&
    !paymentRecorded &&
    !paymentQrReady &&
    hasWorkerStatus(backendStatus, ['confirmed_by_customer', 'payment_pending']),
  )
  const qrImageUri = safeImageUri(payment?.qrImageUrl)
  const handleCreatePayment = async () => {
    if (!deal?.id || deal.id === LOCAL_DEAL_ID || creatingPayment) return
    setCreatingPayment(true)
    setPaymentNotice(null)
    try {
      const result = await jobService.createPaymentIntent(deal.id)
      if (!result.success) throw new Error(result.error)
      const response = result.data
      setPaymentBackendStatus(response.status)
      setPaymentOverride({
        amountReceived: response.payment.amount_received,
        expiresAt: response.payment.expires_at,
        grossAmount: response.payment.gross_amount,
        paymentCode: response.payment.payment_code,
        platformFee: response.payment.platform_fee,
        provider: response.payment.provider,
        qrImageUrl: response.payment.qr_image_url,
        receivedAt: response.payment.received_at,
        status: response.payment.status,
        transferContent: response.payment.transfer_content,
        updatedAt: response.payment.updated_at,
        workerNet: response.payment.worker_net,
      })
      setPaymentNotice(language === 'vi' ? 'Kael đã tạo mã VietQR cho ca này.' : 'Kael created the VietQR code for this case.')
    } catch {
      setPaymentNotice(language === 'vi' ? 'Chưa thể tạo mã thanh toán. Kiểm tra tài khoản thợ hoặc thử lại sau.' : 'Payment code is not ready. Check worker payout account or try again later.')
    } finally {
      setCreatingPayment(false)
    }
  }
  const checklistItems = [
    {
      done: Boolean(deal && hasWorkerStatus(backendStatus, ['confirmed_by_customer', 'payment_pending', 'paid', 'reviewed'])),
      label: language === 'vi' ? 'Kael xác nhận giải quyết công việc đã đủ bằng chứng' : 'Kael confirms the case has enough evidence',
    },
    {
      done: paymentDecisionReady || paymentQrReady,
      label: language === 'vi' ? 'Hệ thống mở mã thanh toán duy nhất' : 'System opens a unique payment code',
    },
    {
      done: paymentRecorded,
      label: language === 'vi' ? 'Cổng thanh toán ghi nhận giao dịch hợp lệ' : 'Payment gate records a valid transaction',
    },
    {
      done: paymentRecorded,
      label: language === 'vi' ? 'Thợ thực nhận được đối soát sau giao dịch' : 'Worker net payout is reconciled after payment',
    },
  ]

  return (
    <CustomerAgenticAuditScrollFrame testID="customer-payment-gate-audit">
      <View style={styles.agenticEndingHero}>
        <IconTile source={clientIcons.payment} large />
        <View style={styles.centerCopy}>
          <KaelText variant="h3" style={styles.centerText}>{language === 'vi' ? 'Cổng thanh toán' : 'Payment gate'}</KaelText>
          <KaelText tone="secondary" variant="caption" style={styles.centerText}>
            {language === 'vi'
          ? 'Kael tự đối soát bằng chứng hoàn tất, trạng thái thợ và cổng thanh toán trước khi mở tiền.'
              : 'Money state changes only after valid Kael and payment-gate confirmation.'}
          </KaelText>
        </View>
      </View>

      <View style={styles.agenticSummaryPanel} testID="customer-payment-gate-status-panel">
        <KaelText tone="secondary" variant="caption">{language === 'vi' ? 'Trạng thái' : 'Status'}</KaelText>
        <KaelText variant="h3" style={styles.agenticStrongValue}>{statusLabelText}</KaelText>
        <KaelText tone="secondary" variant="caption">{jobCode}</KaelText>
      </View>

      <View style={styles.agenticEtaRows}>
        <InfoStrip icon={statusIcons.pending} label={language === 'vi' ? 'Quyết định Kael' : 'Kael decision'} value={data.completionReviewLabel} />
        <InfoStrip icon={clientIcons.payment} label={language === 'vi' ? 'Giá cuối Kael' : 'Kael final price'} value={finalPriceLabel} />
        <InfoStrip icon={clientIcons.booking} label={language === 'vi' ? 'Mã thanh toán' : 'Payment code'} value={paymentCodeLabel} />
        <InfoStrip icon={workerIcons.wallet} label={language === 'vi' ? 'Thợ thực nhận' : 'Worker payout'} value={workerPayoutDisplay} />
      </View>

      <View style={styles.customerPaymentQrPanel} testID="customer-payment-gate-vietqr-panel">
        {qrImageUri ? (
          <>
            <Image source={{ uri: qrImageUri }} style={styles.customerPaymentQrImage} resizeMode="contain" testID="customer-payment-gate-vietqr-image" />
            <View style={styles.customerPaymentQrCopy}>
              <KaelText variant="label" tone="strong" style={styles.centerText}>
                {payment?.transferContent ?? paymentCodeLabel}
              </KaelText>
              <KaelText tone="secondary" variant="caption" style={styles.centerText}>
                {language === 'vi'
                  ? 'Khách quét VietQR để chuyển khoản. SePay xác nhận giao dịch trước khi Kael ghi nhận đã thanh toán.'
                  : 'The customer scans VietQR. SePay confirms the transfer before Kael records payment.'}
              </KaelText>
            </View>
          </>
        ) : (
          <View style={styles.customerPaymentQrPlaceholder} testID="customer-payment-gate-vietqr-placeholder" />
        )}
      </View>

      {paymentNotice ? (
        <KaelText tone="secondary" variant="caption" style={styles.agenticDisclosure} testID="customer-payment-gate-notice">
          {paymentNotice}
        </KaelText>
      ) : null}

      <View style={styles.workerSummaryChecklist} testID="customer-payment-gate-checklist">
        {checklistItems.map((item, index) => (
          <WorkerReportChecklistItem
            done={item.done}
            key={`${item.label}-${index}`}
            label={item.label}
            testID={`customer-payment-gate-checklist-item-${index}`}
          />
        ))}
      </View>

      <KaelText tone="secondary" variant="caption" style={styles.agenticDisclosure}>
        {language === 'vi'
          ? 'Giao diện khách không tự chuyển trạng thái tiền cho thợ. Cổng thanh toán và Kael phải xác minh trước khi hồ sơ được ghi nhận.'
          : 'The customer UI cannot move money state directly to a worker. The payment gate and Kael must verify before the case is recorded.'}
      </KaelText>

      <View style={styles.actionStack}>
        <KaelButton
          disabled={!canCreatePayment || creatingPayment}
          label={paymentRecorded
            ? (language === 'vi' ? 'Đã thanh toán' : 'Paid')
            : paymentQrReady
              ? (language === 'vi' ? 'Chờ SePay xác nhận' : 'Waiting for SePay')
              : creatingPayment
                ? (language === 'vi' ? 'Đang tạo mã VietQR' : 'Creating VietQR')
                : canCreatePayment
                  ? (language === 'vi' ? 'Tạo mã SePay/VietQR' : 'Create SePay/VietQR code')
                  : (language === 'vi' ? 'Chờ mã VietQR' : 'Waiting for VietQR')}
          onPress={handleCreatePayment}
          testID="customer-payment-gate-create-payment"
        />
        <KaelButton
          label={language === 'vi' ? 'Về Hoạt động' : 'Back to Activity'}
          onPress={() => router.replace('/(customer)/history' as never)}
          testID="customer-payment-gate-history-action"
          variant="secondary"
        />
      </View>
    </CustomerAgenticAuditScrollFrame>
  )
}

function CustomerAgenticAuditFrame({ children, testID }: { children: ReactNode; testID: string }) {
  return (
    <SafeAreaView style={styles.safeArea} testID={testID}>
      <MintAura intensity="page" />
      <View style={styles.kaelHandoffFrame}>
        <View style={styles.kaelAuditPhoneShell}>
          <View style={styles.kaelAuditStatusBar}>
            <View style={styles.kaelAuditStatusDot} />
            <View style={styles.kaelAuditStatusPill} />
          </View>
          {children}
        </View>
      </View>
    </SafeAreaView>
  )
}

function CustomerAgenticAuditScrollFrame({ children, testID }: { children: ReactNode; testID: string }) {
  return (
    <SafeAreaView style={styles.safeArea} testID={testID}>
      <MintAura intensity="page" />
      <ScrollView
        contentContainerStyle={styles.kaelAuditScrollContent}
        showsVerticalScrollIndicator={false}
        testID={`${testID}-scroll`}
      >
        <View style={styles.kaelHandoffScrollFrame}>
          <View style={styles.kaelAuditPhoneShell}>
            <View style={styles.kaelAuditStatusBar}>
              <View style={styles.kaelAuditStatusDot} />
              <View style={styles.kaelAuditStatusPill} />
            </View>
            {children}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function AgenticChecklistRow({ done, label, testID }: { done: boolean; label: string; testID: string }) {
  return (
    <View style={styles.agenticChecklistRow} testID={testID}>
      <View style={done ? styles.agenticStepDoneIcon : styles.agenticStepPendingIcon}>
        {done ? <CheckMarkSmall /> : null}
      </View>
      <KaelText variant="label" tone={done ? 'strong' : 'secondary'} style={styles.agenticChecklistLabel}>{label}</KaelText>
    </View>
  )
}

function AgenticQuoteRow({ icon, label, testID, value }: { icon: ImageSourcePropType; label: string; testID: string; value: string }) {
  return (
    <View style={styles.agenticQuoteRow} testID={testID}>
      <IconTile source={icon} small />
      <KaelText variant="label" style={styles.agenticQuoteLabel}>{label}</KaelText>
      <KaelText variant="label" tone="strong" style={styles.agenticQuoteValue}>{value}</KaelText>
    </View>
  )
}

function CustomerProviderMapPanel({ data, language }: { data: CustomerAgenticCaseAuditData; language: AppLanguage }) {
  const disabled = !data.canOpenLocation || !data.routeDestinationLabel
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => void openCustomerMapDirections(data.routeDestinationLabel, language)}
      style={[styles.agenticMapPanel, disabled ? styles.agenticMapPanelDisabled : null]}
      testID="customer-location-map-provider"
    >
      <View style={styles.agenticMapProviderHeader}>
        <IconTile source={workerIcons.map} small />
        <View style={styles.agenticMapProviderCopy}>
          <KaelText variant="label" tone="strong">{data.mapProviderTitle}</KaelText>
          <KaelText tone="secondary" variant="caption">{data.mapProviderSubtitle}</KaelText>
        </View>
        <KaelBadge label={data.mapProviderBadge} variant={disabled ? 'neutral' : 'mint'} />
      </View>
      <View style={styles.agenticMapProviderRoute}>
        <View style={styles.agenticMapProviderNode} />
        <View style={styles.agenticMapProviderLine} />
        <View style={[styles.agenticMapProviderNode, styles.agenticMapProviderNodeStrong]} />
      </View>
      <KaelText tone={disabled ? 'secondary' : 'strong'} variant="caption" style={styles.agenticMapProviderAction}>
        {data.mapActionLabel}
      </KaelText>
    </Pressable>
  )
}

function KaelCareOverviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kaelCareRow}>
      <KaelText tone="secondary" variant="caption" style={styles.kaelCareRowLabel}>{label}</KaelText>
      <KaelText variant="label" style={styles.kaelCareRowValue}>{value}</KaelText>
    </View>
  )
}

function kaelCareOverviewAuditCopy(language: AppLanguage) {
  return language === 'vi'
    ? {
        confidence: 'Độ tin cậy',
        cta: 'Tiếp tục với Kael',
        matchLabel: 'Độ phù hợp',
        matchLevel: 'Rất phù hợp',
        price: 'Dự kiến chi phí',
        time: 'Thời gian phù hợp',
        title: 'Kael Care Overview',
      }
    : {
        confidence: 'Confidence',
        cta: 'Continue with Kael',
        matchLabel: 'Match',
        matchLevel: 'Highly suitable',
        price: 'Estimated cost',
        time: 'Best time',
        title: 'Kael Care Overview',
      }
}

function matchingAiScoreAuditCopy(language: AppLanguage) {
  return language === 'vi'
    ? {
        arrival: 'Thời gian đến',
        cta: 'Xem chi tiết thợ',
        headline: 'Đã tìm thấy thợ phù hợp',
        matchLevel: 'Độ phù hợp',
        note: 'Kael \u0111\u00e1nh gi\u00e1 th\u1ee3 n\u00e0y r\u1ea5t ph\u00f9 h\u1ee3p\nv\u1edbi y\u00eau c\u1ea7u c\u1ee7a b\u1ea1n',
        skill: 'Chuyên môn',
        title: 'Matching & AI Score',
      }
    : {
        arrival: 'Arrival',
        cta: 'View worker details',
        headline: 'A suitable worker was found',
        matchLevel: 'Match score',
        note: 'Kael rates this worker as a strong fit\nfor your request',
        skill: 'Specialty',
        title: 'Matching & AI Score',
      }
}

function kaelCareOverviewAuditData(language: AppLanguage, deal: LocalDeal | null): KaelCareOverviewAuditData {
  const requestCode = deal?.displayCode ?? (deal?.id && deal.id !== LOCAL_DEAL_ID ? buildLocalJobDisplayCode({ jobId: deal.id }) : null)
  const serviceType = deal?.draft.serviceType ?? deal?.broadcast?.serviceType ?? null
  const serviceLabel = serviceType ? serviceCopy[serviceType][language].label : copy[language].dataPending
  const areaLabel = deal?.broadcast?.generalArea || deal?.draft.districtLabel || null
  return {
    appointmentLabel: workerTimeChoiceLabel(deal?.draft.timeChoice, language),
    confidenceLabel: deal?.estimate?.confidenceLabel || copy[language].dataPending,
    evidenceLabel: formatEvidenceCount(deal?.draft.mediaCount, language),
    priceLabel: deal?.estimate?.priceRangeLabel || copy[language].dataPending,
    requestCode: requestCode ?? (language === 'vi' ? 'Đang tạo mã đơn thật' : 'Generating real order code'),
    serviceLabel: [serviceLabel, areaLabel].filter((value) => value && !isPendingText(value)).join(' - ') || serviceLabel,
    statusLabel: language === 'vi' ? `Trạng thái: ${statusLabel(deal?.status, language)}` : `Status: ${statusLabel(deal?.status, language)}`,
  }
}

function matchingAiScoreAuditData(language: AppLanguage, deal: LocalDeal | null): MatchingAiScoreAuditData {
  const worker = deal?.workerProfile ?? null
  const workerName = worker?.fullName?.trim() || (language === 'vi' ? '\u0110ang ch\u1edd th\u1ee3 ph\u00f9 h\u1ee3p' : 'Waiting for matched worker')
  const workerCode = worker?.displayCode ?? (worker?.id ? buildLocalWorkerDisplayCode(worker.id) : null)
  const ratingLabel = typeof worker?.rating === 'number' && Number.isFinite(worker.rating) && worker.rating > 0
    ? workerRatingStars(worker.rating)
    : null
  const reviewLabel = typeof worker?.reviewCount === 'number' && Number.isFinite(worker.reviewCount) && worker.reviewCount > 0
    ? (language === 'vi' ? `(${formatMetric(worker.reviewCount, language)} \u0111\u00e1nh gi\u00e1)` : `(${formatMetric(worker.reviewCount, language)} reviews)`)
    : worker
    ? (language === 'vi' ? 'Ch\u01b0a c\u00f3 \u0111\u00e1nh gi\u00e1' : 'No reviews yet')
    : null
  const completedJobLabel = typeof worker?.totalJobs === 'number' && Number.isFinite(worker.totalJobs) && worker.totalJobs > 0
    ? (language === 'vi' ? `${formatMetric(worker.totalJobs, language)} vi\u1ec7c ho\u00e0n t\u1ea5t` : `${formatMetric(worker.totalJobs, language)} completed jobs`)
    : (language === 'vi' ? 'Ch\u01b0a c\u00f3 d\u1eef li\u1ec7u' : 'Data pending')
  const arrivalLabel = worker
    ? workerArrivalLabel(deal, language)
    : (language === 'vi' ? 'Mở sau khi thợ nhận ca' : 'Opens after worker acceptance')
  const matchStatusLabel = worker
    ? (language === 'vi' ? 'Đã có thợ thật' : 'Real worker found')
    : (language === 'vi' ? 'Chờ thợ nhận ca' : 'Waiting for acceptance')
  return language === 'vi'
    ? {
        arrivalLabel,
        matchScoreLabel: null,
        matchStatusLabel,
        ratingLabel,
        reviewLabel,
        skillLabel: completedJobLabel,
        workerCode,
        workerName,
      }
    : {
        arrivalLabel,
        matchScoreLabel: null,
        matchStatusLabel,
        ratingLabel,
        reviewLabel,
        skillLabel: completedJobLabel,
        workerCode,
        workerName,
      }
}

function customerAgenticCaseAuditData(language: AppLanguage, deal: LocalDeal | null): CustomerAgenticCaseAuditData {
  const pendingLabel = copy[language].dataPending
  const hasDraft = Boolean(deal?.draft.description || deal?.draft.problemChips.length || deal?.draft.serviceType)
  const hasEstimate = Boolean(deal?.estimate?.problemLabel || deal?.estimate?.priceRangeLabel)
  const hasQuote = Boolean(deal?.estimate?.priceRangeLabel || deal?.finalPrice)
  const hasWorker = Boolean(deal?.workerProfile?.id)
  const serviceType = deal?.draft.serviceType ?? deal?.broadcast?.serviceType ?? null
  const serviceLabel = serviceType ? serviceCopy[serviceType][language].label : pendingLabel
  const areaLabel = deal?.broadcast?.generalArea || deal?.draft.districtLabel || pendingLabel
  const backendStatus = deal?.backendStatus ?? deal?.status
  const scheduleLabel = deal ? statusLabel(deal.status, language) : pendingLabel
  const totalQuoteLabel = deal?.finalPrice ? formatPositiveVnd(deal.finalPrice, language) : deal?.estimate?.priceRangeLabel ?? pendingLabel
  const activeRoute = hasWorkerStatus(deal?.status, ['worker_on_way', 'arrived', 'inspecting', 'repairing', 'scope_change_pending', 'completed_by_worker', 'confirmed_by_customer', 'payment_pending', 'paid', 'reviewed'])
  const completed = hasWorkerStatus(deal?.status, ['confirmed_by_customer', 'payment_pending', 'paid', 'reviewed'])
  const canOpenQuote = hasWorker && hasQuote
  const canOpenLocation = canOpenQuote && activeRoute
  const canOpenCompletion = hasWorkerStatus(deal?.status, ['completed_by_worker', 'confirmed_by_customer', 'payment_pending', 'paid', 'reviewed'])
  const routeDestinationLabel = canOpenLocation
    ? (deal?.broadcast?.fullAddressLabel || deal?.draft.addressLabel || deal?.broadcast?.generalArea || deal?.draft.districtLabel || null)
    : null
  const helperSummaryLabel = !hasDraft
    ? (language === 'vi' ? 'Chưa có dữ liệu ca này' : 'No case data yet')
    : !hasEstimate
      ? (language === 'vi' ? 'Kael đang hiểu vấn đề' : 'Kael is reading the issue')
      : !hasWorker
        ? (language === 'vi' ? 'Chờ thợ nhận ca' : 'Waiting for worker acceptance')
      : !hasQuote
          ? (language === 'vi' ? 'Chờ báo giá thật' : 'Waiting for a real quote')
          : (language === 'vi' ? 'Đã sẵn sàng báo giá' : 'Quote data ready')
  const helperSummaryMeta = !hasDraft
    ? (language === 'vi' ? 'Hãy bắt đầu từ yêu cầu dịch vụ.' : 'Start from the service request.')
    : !hasQuote
      ? (language === 'vi' ? 'Kael chỉ mở báo giá khi đủ dữ liệu thật.' : 'Kael opens quotes only with real data.')
      : scheduleLabel
  const quoteSummaryMeta = !hasWorker
    ? (language === 'vi' ? 'Báo giá chỉ mở khi có thợ thật nhận ca từ backend.' : 'Quote opens only after a real worker accepts from backend.')
    : !hasQuote
      ? (language === 'vi' ? 'Kael chưa có báo giá hợp lệ từ dữ liệu thật của ca này.' : 'Kael has no valid quote from real case data yet.')
      : (language === 'vi' ? 'Báo giá đang dùng dữ liệu Kael/backend hiện có; giá cuối chỉ khóa khi giải quyết công việc đủ quyết định hợp lệ.' : 'Quote uses current Kael/backend data; final price locks only through a valid decision.')
  const locationStatusLabel = activeRoute
    ? statusLabel(deal?.status, language)
    : hasWorker
      ? (language === 'vi' ? 'Chờ thợ bắt đầu di chuyển' : 'Waiting for worker route')
      : (language === 'vi' ? 'Chờ thợ nhận ca' : 'Waiting for worker acceptance')
  const etaLabel = activeRoute
    ? workerArrivalLabel(deal, language)
    : (language === 'vi' ? 'Chưa mở tuyến đường' : 'Route not opened yet')
  const durationLabel = activeRoute
    ? etaLabel
    : hasWorker
      ? (language === 'vi' ? 'Chờ thợ xác nhận thời gian' : 'Waiting for worker timing')
      : (language === 'vi' ? 'Chờ thợ nhận ca' : 'Waiting for worker acceptance')
  const mapProviderTitle = canOpenLocation
    ? (language === 'vi' ? 'Bản đồ tuyến đường thật' : 'Real route map')
    : (language === 'vi' ? 'Bản đồ sẽ mở khi có tuyến thật' : 'Map opens with a real route')
  const mapProviderSubtitle = routeDestinationLabel
    ? routeDestinationLabel
    : (language === 'vi' ? 'Kael chưa nhận đủ trạng thái di chuyển từ backend.' : 'Kael has not received a route-ready backend state yet.')
  const mapProviderBadge = canOpenLocation ? 'Google Maps' : (language === 'vi' ? 'Đang chờ' : 'Waiting')
  const mapActionLabel = canOpenLocation
    ? (language === 'vi' ? 'Mở bản đồ dẫn đường' : 'Open route map')
    : (language === 'vi' ? 'Chưa có tuyến đường thật để mở' : 'No real route to open yet')
  const completionReviewLabel = completed
    ? (language === 'vi' ? 'Kael đã đủ điều kiện thanh toán' : 'Kael payment gate ready')
    : hasLocalDealCompletionEvidence(deal)
      ? (language === 'vi' ? 'Kael đang đối chiếu bằng chứng' : 'Kael is checking evidence')
      : (language === 'vi' ? 'Chờ bằng chứng hoàn tất' : 'Waiting for completion evidence')

  return {
    areaLabel,
    canOpenCompletion,
    canOpenLocation,
    canOpenQuote,
    completionReviewLabel,
    durationLabel,
    etaLabel,
    helperSummaryLabel,
    helperSummaryMeta,
    helperSteps: [
      {
        done: hasDraft,
        label: language === 'vi' ? 'Đã nhận yêu cầu và bằng chứng' : 'Request and evidence received',
      },
      {
        done: hasEstimate,
        label: language === 'vi' ? 'Kael đã hiểu vấn đề chính' : 'Kael identified the main issue',
      },
      {
        done: hasQuote,
        label: language === 'vi' ? 'Đã có báo giá thật' : 'A real quote exists',
      },
      {
        done: hasWorker,
        label: language === 'vi' ? 'Thợ thật đã nhận ca' : 'A real worker accepted',
      },
    ],
    locationStatusLabel,
    mapActionLabel,
    mapProviderBadge,
    mapProviderSubtitle,
    mapProviderTitle,
    paymentLabel: hasWorkerStatus(backendStatus, ['paid'])
      ? (language === 'vi' ? 'Đã ghi nhận' : 'Recorded')
      : pendingLabel,
    pendingLabel,
    quoteRows: [
      {
        icon: clientIcons.evidence,
        label: language === 'vi' ? 'Kiểm tra' : 'Inspection',
        value: deal?.estimate?.problemLabel || (hasDraft ? (language === 'vi' ? 'Đã ghi nhận yêu cầu' : 'Request recorded') : pendingLabel),
      },
      {
        icon: workerIcons.tools,
        label: language === 'vi' ? 'Sửa chữa' : 'Repair',
        value: serviceLabel,
      },
      {
        icon: clientIcons.booking,
        label: language === 'vi' ? 'Vật tư' : 'Materials',
        value: hasWorker ? (language === 'vi' ? 'Chờ kiểm tra tại chỗ' : 'Waiting for on-site check') : pendingLabel,
      },
      {
        icon: statusIcons.pending,
        label: language === 'vi' ? 'Dự phòng' : 'Contingency',
        value: deal?.scopeChange ? scopeChangeDeltaLabel(deal, deal.scopeChange, language) : (deal ? (language === 'vi' ? 'Chưa phát sinh' : 'No change yet') : pendingLabel),
      },
    ],
    quoteSummaryMeta,
    routeDestinationLabel,
    reviewActionLabel: hasWorkerStatus(deal?.status, ['reviewed'])
      ? (language === 'vi' ? 'Đã đánh giá' : 'Reviewed')
      : pendingLabel,
    scheduleLabel,
    serviceLabel,
    totalQuoteLabel,
  }
}

function kaelLivePerformanceAuditText(language: AppLanguage) {
  if (language === 'en') {
    return {
      activityOrchestrating: 'Orchestrating',
      activityResearch: 'Researching',
      activityThinking: 'Thinking',
      activityStage: {
        fallback: 'Using internal data',
        intent: 'Reading request',
        market: 'Checking market rates in {district}',
        price: 'Synthesizing estimate',
        problem: 'Matching safety signals',
        vision: 'Analyzing photos/videos',
      },
      addressPlaceholder: 'Apartment / area',
      agentStatus: 'Kael is checking the request',
      agentSteps: { missing: 'Ask what is missing', orchestrate: 'Coordinate next step', read: 'Read evidence' },
      attach: 'Add media',
      attachHint: 'Write a note before adding media.',
      briefServicePending: 'Service pending',
      composerPlaceholder: 'Message Kael...',
      errorNoService: 'Type a message for Kael first.',
      history: 'Open activity',
      livePerformanceEvidence: 'Evidence',
      livePerformanceEstimateReady: 'Estimate is ready',
      livePerformanceMeta: 'Audit preview from booking handoff',
      livePerformanceMediaCount: (count: number) => `${count} evidence item${count === 1 ? '' : 's'}`,
      livePerformanceNoEvidence: 'No real photo/video yet',
      livePerformancePendingStage: 'Sending ticket to Kael',
      livePerformanceService: 'Service',
      livePerformanceSignals: 'Signals',
      livePerformanceStage: 'Kael stage',
      livePerformanceTitle: 'Kael is analyzing your request',
      livePerformanceWaitingStage: 'Waiting for real details',
      loading: 'Loading',
      mic: 'Voice',
      micHint: 'Voice is not ready yet.',
      retryIntake: 'Retry intake',
      retryOrchestration: 'Retry orchestration',
      send: 'Send',
      sending: 'Sending',
      turnFallback: 'Kael is updating this request.',
      welcome: 'Tell Kael what happened.',
    } as any
  }

  return {
    activityOrchestrating: 'Kael đang điều phối',
    activityResearch: 'Kael đang phân tích',
    activityThinking: 'Kael đang suy nghĩ',
    activityStage: {
      fallback: 'Đang dùng dữ liệu nội bộ',
      intent: 'Đang đọc yêu cầu',
      market: 'Đang kiểm tra giá khu vực {district}',
      price: 'Đang tổng hợp ước tính',
      problem: 'Đang khớp tín hiệu an toàn',
      vision: 'Đang đọc hình ảnh/video',
    },
    addressPlaceholder: 'Chung cư / khu vực',
    agentStatus: 'Kael đang kiểm tra yêu cầu',
    agentSteps: { missing: 'Hỏi phần còn thiếu', orchestrate: 'Điều phối bước tiếp theo', read: 'Đọc bằng chứng' },
    attach: 'Thêm ảnh/video',
    attachHint: 'Nhập ghi chú trước khi thêm media.',
    briefServicePending: 'Chưa chọn dịch vụ',
    composerPlaceholder: 'Nhập tin nhắn cho Kael...',
    errorNoService: 'Nhập tin nhắn cho Kael trước.',
    history: 'Xem hoạt động',
    livePerformanceEvidence: 'Bằng chứng',
    livePerformanceEstimateReady: 'Ước tính đã sẵn sàng',
    livePerformanceMeta: 'Preview audit từ handoff đặt dịch vụ',
    livePerformanceMediaCount: (count: number) => `${count} bằng chứng`,
    livePerformanceNoEvidence: 'Chưa có ảnh/video thật',
    livePerformancePendingStage: 'Đang gửi phiếu đến Kael',
    livePerformanceService: 'Dịch vụ',
    livePerformanceSignals: 'Tín hiệu',
    livePerformanceStage: 'Trạng thái Kael',
    livePerformanceTitle: 'Kael đang phân tích yêu cầu của bạn',
    livePerformanceWaitingStage: 'Đang chờ dữ liệu thật',
    loading: 'Đang tải',
    mic: 'Giọng nói',
    micHint: 'Giọng nói chưa sẵn sàng.',
    retryIntake: 'Gửi lại intake',
    retryOrchestration: 'Thử điều phối lại',
    send: 'Gửi',
    sending: 'Đang gửi',
    turnFallback: 'Kael đang cập nhật yêu cầu này.',
    welcome: 'Nhắn tin đến Kael.',
  } as any
}

function firstRouteParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function workerArrivalLabel(deal: LocalDeal | null, language: AppLanguage) {
  if (!deal?.workerProfile?.id) return language === 'vi' ? 'Chờ thợ nhận ca' : 'Waiting for worker acceptance'
  if (hasWorkerStatus(deal.status, ['worker_on_way'])) return language === 'vi' ? 'Thợ đang di chuyển' : 'Worker is on the way'
  if (hasWorkerStatus(deal.status, ['arrived'])) return language === 'vi' ? 'Thợ đã tới nơi' : 'Worker arrived'
  if (hasWorkerStatus(deal.status, ['inspecting', 'repairing', 'scope_change_pending'])) return language === 'vi' ? 'Đang xử lý tại nhà' : 'Work in progress'
  if (hasWorkerStatus(deal.status, ['completed_by_worker', 'confirmed_by_customer', 'payment_pending', 'paid', 'reviewed'])) return language === 'vi' ? 'Giải quyết công việc đã hoàn tất' : 'Job completed'
  return language === 'vi' ? 'Chờ thợ bắt đầu di chuyển' : 'Waiting for worker route'
}

async function openCustomerMapDirections(destinationLabel: string | null, language: AppLanguage) {
  const destination = normalizeCustomerMapDestination(destinationLabel)
  if (!destination) {
    Alert.alert(
      language === 'vi' ? 'Chưa có địa điểm' : 'Location unavailable',
      language === 'vi' ? 'Kael chưa nhận được tuyến đường thật từ backend.' : 'Kael has not received a real route from backend yet.',
    )
    return
  }
  const params = new URLSearchParams()
  params.set('api', '1')
  params.set('destination', destination)
  params.set('travelmode', 'driving')
  params.set('dir_action', 'navigate')
  try {
    await Linking.openURL(`https://www.google.com/maps/dir/?${params.toString()}`)
  } catch {
    Alert.alert(
      language === 'vi' ? 'Chưa mở được bản đồ' : 'Could not open map',
      language === 'vi' ? 'Bạn có thể thử lại khi thiết bị có ứng dụng bản đồ hoặc trình duyệt.' : 'Try again when this device has a map app or browser available.',
    )
  }
}

function normalizeCustomerMapDestination(value: string | null | undefined) {
  const normalized = value?.trim().replace(/\s+/g, ' ')
  return normalized && normalized.length >= 3 ? normalized : null
}

function safeImageUri(value: string | null | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) return null
  if (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('file://') ||
    trimmed.startsWith('data:image/')
  ) {
    return trimmed
  }
  return null
}

export function CustomerProfileSurface() {
  const language = useAppLanguage()
  const t = copy[language]
  const { session } = useAuth()
  const { customerProfileInsights } = useFrontendWorkflow()
  const name = readDisplayName(session?.user?.user_metadata) ?? t.profile
  const rankPoints = customerProfileInsights?.usage_rank_points ?? 0
  const rankProgress = Math.min(rankPoints / 1000, 1)
  const protectionScore = customerProfileInsights?.money_protection_score ?? 0
  const moneyProgress = protectionScore / 100
  const rankLevel = customerProfileInsights?.usage_rank_level ?? 0
  const nextRankPoints = Math.max(0, 1000 - rankPoints)
  return (
    <CustomerScreen active="profile" showHeader={false} title={t.profile} testID="rebuild-customer-profile">
      <GlassSurface material="liquid" mode="light" variant="hero" style={styles.customerProfileUnifiedPanel} testID="customer-profile-liquid-section">
        <MintAura intensity="component" />
        <CustomerProfileOverviewPanel
          accountCreatedAt={session?.user?.created_at ?? null}
          insights={customerProfileInsights}
          language={language}
          name={name}
          verified={Boolean(session)}
        />

        <CustomerProfileRankingPanel
          insights={customerProfileInsights}
          language={language}
          nextRankPoints={nextRankPoints}
          rankLevel={rankLevel}
          rankPoints={rankPoints}
          rankProgress={rankProgress}
        />

        <CustomerProfileProtectionPanel
          insights={customerProfileInsights}
          language={language}
          progress={moneyProgress}
          score={protectionScore}
        />
      </GlassSurface>
    </CustomerScreen>
  )
}

type CustomerProfileInsights = CustomerProfileInsightsResponse | null

function CustomerProfileOverviewPanel({
  accountCreatedAt,
  insights,
  language,
  name,
  verified,
}: {
  accountCreatedAt: string | null
  insights: CustomerProfileInsights
  language: AppLanguage
  name: string
  verified: boolean
}) {
  const router = useRouter()
  const statusLabel = verified ? (language === 'vi' ? 'Tích cực' : 'Active') : ''
  const memberSince = insights?.member_since ?? accountCreatedAt
  return (
    <View style={[styles.customerProfileBlock, styles.customerProfileBlockOverview]}>
        <View style={styles.customerOverviewHero}>
          <View style={styles.customerAvatarShell}>
            <MintAura intensity="iconTile" />
            <View pointerEvents="none" style={styles.customerAvatarEdge} />
            <Image source={clientIcons.profile} style={styles.customerAvatarImage} resizeMode="contain" />
          </View>
          <View style={styles.customerIdentityCopy}>
            <View style={styles.customerNameRow}>
              <KaelText variant="h2" style={styles.customerProfileName}>{name}</KaelText>
              {verified ? <Image source={statusIcons.completed} style={styles.customerVerifiedIcon} resizeMode="contain" /> : null}
            </View>
            <View style={styles.customerVerifiedBadge}>
              <View pointerEvents="none" style={styles.customerStatusUtilityEdge} />
              <Image source={statusIcons.approved} style={styles.customerVerifiedBadgeIcon} resizeMode="contain" />
              <KaelText tone="strong" variant="caption" style={styles.customerVerifiedBadgeText}>{language === 'vi' ? 'Khách hàng đã xác minh' : 'Verified customer'}</KaelText>
            </View>
          </View>
        </View>

        <View style={styles.customerInfoBand}>
          <MintAura intensity="component" style={styles.customerComponentAura} />
          <View pointerEvents="none" style={styles.customerComponentEdge} />
          <View pointerEvents="none" style={styles.customerComponentInnerDepth} />
          <CustomerInfoBandCell
            icon={clientIcons.identity}
            label={language === 'vi' ? 'Thành viên từ' : 'Member since'}
            value={formatMemberSinceDaysOrBlank(memberSince, language)}
            valueStyle={styles.customerNumberGlyph}
          />
          <CustomerInfoBandCell
            dot
            label={language === 'vi' ? 'Trạng thái' : 'Status'}
            value={statusLabel}
          />
        </View>

        <View style={styles.customerSectionHeaderRow}>
          <KaelText variant="label">{language === 'vi' ? 'Thông tin nhanh' : 'Quick information'}</KaelText>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/(customer)/history' as never)}
            style={({ pressed }) => [styles.customerInlineAction, pressed ? styles.customerPressFeedback : null]}
          >
            <View pointerEvents="none" style={styles.customerInlineActionEdge} />
            <KaelText tone="strong" variant="caption">{language === 'vi' ? 'Xem tất cả' : 'View all'}</KaelText>
            <ChevronRight />
          </Pressable>
        </View>
        <View style={styles.customerQuickGrid}>
          <CustomerValueTile
            label={language === 'vi' ? 'Lịch sử dịch vụ' : 'Service history'}
            sublabel={language === 'vi' ? 'lần sử dụng' : 'uses'}
            value={formatMetricOrZero(insights?.completed_service_count, language)}
          />
          <CustomerValueTile
            label={language === 'vi' ? 'Địa chỉ đã lưu' : 'Saved addresses'}
            sublabel={language === 'vi' ? 'địa chỉ' : 'addresses'}
            value={formatMetricOrZero(insights?.saved_address_count, language)}
          />
          <CustomerValueTile
            label={language === 'vi' ? 'Dịch vụ ưa thích' : 'Preferred services'}
            sublabel={language === 'vi' ? 'loại dịch vụ' : 'service types'}
            value={formatMetricOrZero(insights?.preferred_service_count, language)}
          />
        </View>

        <KaelText variant="label">{language === 'vi' ? 'Tiện ích tài khoản' : 'Account utilities'}</KaelText>
        <View style={styles.customerUtilityGrid}>
          <CustomerUtilitySquare icon={clientIcons.address} label={language === 'vi' ? 'Địa chỉ của tôi' : 'My addresses'} />
          <CustomerUtilitySquare icon={clientIcons.payment} label={language === 'vi' ? 'Phương thức thanh toán' : 'Payment methods'} />
          <CustomerUtilitySquare icon={clientIcons.notification} label={language === 'vi' ? 'Thông báo' : 'Notifications'} />
          <CustomerUtilitySquare icon={clientIcons.theme} label={language === 'vi' ? 'Cài đặt' : 'Settings'} />
        </View>
    </View>
  )
}

function CustomerProfileRankingPanel({
  insights,
  language,
  nextRankPoints,
  rankLevel,
  rankPoints,
  rankProgress,
}: {
  insights: CustomerProfileInsights
  language: AppLanguage
  nextRankPoints: number
  rankLevel: number
  rankPoints: number
  rankProgress: number
}) {
  const rankName = currentCustomerRankName(rankLevel, language)
  const nextRankLevel = Math.min(Math.max(Math.floor(rankLevel) + 1, 1), customerRankLabels[language].length)
  const progressLabel = `${formatMetric(rankPoints, language)} / 1.000 ${language === 'vi' ? 'điểm' : 'pts'}`
  const remainingLabel = language === 'vi'
    ? `Còn ${formatMetric(nextRankPoints, language)} điểm lên hạng ${nextRankLevel}`
    : `${formatMetric(nextRankPoints, language)} pts to rank ${nextRankLevel}`
  const rankSubtitle = customerRankSubtitle(rankLevel, language)

  return (
    <View style={[styles.customerProfileBlock, styles.customerProfileBlockRanking]}>
        <View style={styles.customerRankHeroCard}>
          <MintAura intensity="component" style={styles.customerComponentAura} />
          <View pointerEvents="none" style={styles.customerComponentEdge} />
          <View pointerEvents="none" style={styles.customerComponentInnerDepth} />
          <KaelText tone="strong" variant="caption" style={styles.customerRankHeroEyebrow}>{language === 'vi' ? 'Hạng hiện tại' : 'Current rank'}</KaelText>
          <View style={styles.customerRankHeroTopRow}>
            <View style={styles.customerRankOrb}>
              <MintAura intensity="iconTile" style={styles.customerRankOrbAura} />
              <View pointerEvents="none" style={styles.customerRankOrbEdge} />
              <KaelText tone="strong" variant="caption">{language === 'vi' ? 'Hạng' : 'Rank'}</KaelText>
              <KaelText variant="h1" style={[styles.customerRankOrbValue, styles.customerNumberGlyph]}>
                {rankLevel}
              </KaelText>
            </View>
            <View style={styles.customerRankHeroCopy}>
              <KaelText tone="strong" variant="h3">{rankName}</KaelText>
              <KaelText tone="secondary" variant="caption">{rankSubtitle}</KaelText>
            </View>
          </View>
          <CustomerProgressBar progress={rankProgress} />
          <View style={styles.customerProgressLabels}>
            <KaelText tone="strong" variant="caption" style={styles.customerNumberGlyph}>{progressLabel}</KaelText>
            <KaelText tone="secondary" variant="caption" style={styles.customerNumberGlyph}>{remainingLabel}</KaelText>
          </View>
        </View>

        <View style={styles.customerRankMetricRow}>
          <CustomerValueTile compact label={language === 'vi' ? 'Dịch vụ đã dùng' : 'Used services'} value={formatMetricOrZero(insights?.completed_service_count, language)} />
          <CustomerValueTile compact label={language === 'vi' ? 'Chuỗi ngày liên tiếp' : 'Active streak'} value={formatMetricOrZero(insights?.active_streak_days, language)} />
          <CustomerValueTile compact label={language === 'vi' ? 'Tổng chi tiêu' : 'Total spend'} value={formatVndOrZero(insights?.total_spend_vnd, language)} />
          <CustomerValueTile compact label={language === 'vi' ? 'Đánh giá tích cực' : 'Positive reviews'} value={formatPercentOrZero(insights?.positive_review_rate_percent, language)} />
        </View>

        <View style={styles.customerSectionHeaderRow}>
          <KaelText tone="strong" variant="label">{language === 'vi' ? 'Thang hạng khách hàng' : 'Customer rank ladder'}</KaelText>
          <KaelText tone="strong" variant="caption">{language === 'vi' ? 'Hạng tối đa 5' : 'Max rank 5'}</KaelText>
        </View>
        <CustomerRankLadder current={rankLevel} language={language} />
        <View style={styles.customerRankCardsRow}>
          <CustomerRankDetailCard
            badge
            bullets={language === 'vi' ? ['Sử dụng đều đặn', 'Đánh giá tích cực', 'Ưu tiên hỗ trợ'] : ['Regular usage', 'Positive reviews', 'Priority support']}
            title={language === 'vi' ? 'Hạng hiện tại' : 'Current rank'}
            value={rankName}
          />
          <CustomerRankDetailCard
            bullets={language === 'vi' ? ['Chi tiêu ≥ 20 triệu', 'Duy trì đánh giá 4.8+'] : ['Spend at least 20m', 'Maintain 4.8+ reviews']}
            progress={rankProgress}
            progressLabel={progressLabel}
            requirementLabel={language === 'vi' ? 'Cần đạt:' : 'Requirements:'}
            title={language === 'vi' ? 'Hạng tiếp theo' : 'Next rank'}
            value={nextCustomerRankName(rankLevel, language)}
          />
        </View>
    </View>
  )
}

function CustomerProfileProtectionPanel({
  insights,
  language,
  progress,
  score,
}: {
  insights: CustomerProfileInsights
  language: AppLanguage
  progress: number
  score: number
}) {
  const fairPriceStatus = insights?.fair_price_status ?? 'pending'
  const gaugeStatus = moneyProtectionStatus(fairPriceStatus, language)
  const badgeStatus = moneyProtectionStatus(fairPriceStatus, language)
  const badgeSublabel = moneyProtectionBadgeSublabel(fairPriceStatus, language)
  const badgeIcon = moneyProtectionBadgeIcon(fairPriceStatus)
  const protectionCopy = score <= 0
    ? ''
    : language === 'vi'
      ? 'Bạn đang sử dụng dịch vụ an toàn và đúng giá. Tiếp tục duy trì nhé!'
      : 'You are using safe and fair-priced services. Keep it up!'
  return (
    <View style={[styles.customerProfileBlock, styles.customerProfileBlockProtection]}>
        <View style={[styles.customerProtectionHeaderRow, protectionCopy ? null : styles.customerProtectionHeaderRowCompact]}>
          <View style={styles.customerProtectionGaugeColumn}>
            <View style={styles.customerProtectionTitleRow}>
              <KaelText tone="strong" variant="label">{language === 'vi' ? 'Chỉ số Bảo vệ đồng tiền' : 'Money protection score'}</KaelText>
              <InfoBadge />
            </View>
            <CustomerProtectionGauge progress={progress} score={score} />
            <View style={styles.customerProtectionStatusPill} testID="customer-profile-money-protection-status-pill">
              <View pointerEvents="none" style={styles.customerStatusUtilityEdge} />
              <Image source={badgeIcon} style={styles.customerProtectionPillIcon} resizeMode="contain" />
              <KaelText tone="strong" variant="label" style={styles.customerProtectionStatusPillText} testID="customer-profile-money-protection-status-label">{gaugeStatus}</KaelText>
            </View>
          </View>
          {protectionCopy ? (
            <View style={styles.customerProtectionCopy}>
              <KaelText variant="label">{protectionCopy}</KaelText>
            </View>
          ) : null}
        </View>

        <View style={styles.customerProtectionGrid}>
          <CustomerProtectionTile
            highlighted
            label={language === 'vi' ? 'Dịch vụ đúng giá' : 'Fair-price services'}
            sublabel={language === 'vi' ? 'dịch vụ' : 'services'}
            value={formatFractionOrZero(insights?.fair_price_service_count, insights?.total_transaction_count, language)}
          />
          <CustomerProtectionTile
            label={language === 'vi' ? 'Số tiền đã bảo vệ' : 'Protected value'}
            sublabel={language === 'vi' ? 'Giá trị công bằng' : 'Fair value'}
            value={formatVndOrZero(insights?.protected_value_vnd, language)}
          />
          <CustomerProtectionTile
            label={language === 'vi' ? 'Tỷ lệ không tranh chấp' : 'Dispute-free rate'}
            sublabel={language === 'vi' ? 'Không tranh chấp' : 'No disputes'}
            value={formatPercentOrZero(insights?.dispute_free_rate_percent, language)}
          />
          <CustomerProtectionTile
            badge
            badgeIcon={badgeIcon}
            label={language === 'vi' ? 'Huy hiệu giá công bằng' : 'Fair-price badge'}
            showAction={fairPriceStatus === 'verified'}
            sublabel={badgeSublabel}
            value={badgeStatus}
          />
        </View>
        <View style={styles.customerProtectionNote}>
          <MintAura intensity="component" style={styles.customerComponentAura} />
          <View pointerEvents="none" style={styles.customerComponentEdge} />
          <View pointerEvents="none" style={styles.customerComponentInnerDepth} />
          <KaelText tone="secondary" variant="caption">
            {language === 'vi'
              ? 'Chỉ số Bảo vệ đồng tiền phản ánh mức độ bạn sử dụng dịch vụ đúng giá và an toàn. Chỉ số càng cao, bạn càng tiết kiệm được chi phí thực tế và giảm rủi ro khi sử dụng dịch vụ.'
              : 'The money protection score reflects safe, fair-priced service usage. The higher it is, the more real cost and risk protection you have.'}
          </KaelText>
        </View>
    </View>
  )
}

function CustomerInfoBandCell({
  dot = false,
  icon,
  label,
  value,
  valueStyle,
}: {
  dot?: boolean
  icon?: ImageSourcePropType
  label: string
  value: string
  valueStyle?: StyleProp<TextStyle>
}) {
  const hasValue = value.trim().length > 0
  return (
    <View style={styles.customerInfoBandCell}>
      {dot ? <View style={styles.customerStatusDot} /> : icon ? <Image source={icon} style={styles.customerInfoBandIcon} resizeMode="contain" /> : null}
      <View style={styles.customerInfoBandCopy}>
        <KaelText tone="secondary" variant="caption">{label}</KaelText>
        {hasValue ? <KaelText tone="strong" variant="label" style={valueStyle}>{value}</KaelText> : null}
      </View>
    </View>
  )
}

function CustomerValueTile({
  compact = false,
  label,
  sublabel,
  value,
}: {
  compact?: boolean
  label: string
  sublabel?: string
  value: string
}) {
  const pending = isPendingText(value)
  if (compact) {
    return (
      <View style={[styles.customerValueTile, styles.customerValueTileCompact]}>
        <MintAura intensity="component" style={styles.customerTileAura} />
        <View pointerEvents="none" style={styles.customerTileEdge} />
        <View pointerEvents="none" style={styles.customerTileInnerDepth} />
        <View style={styles.customerValueTileCompactValueSlot}>
          <KaelText
            adjustsFontSizeToFit
            minimumFontScale={0.72}
            numberOfLines={pending ? 2 : 1}
            tone={pending ? 'secondary' : 'strong'}
            variant={pending ? 'caption' : 'h3'}
            style={[
              styles.customerValueTileValue,
              styles.customerNumberGlyph,
              styles.customerValueTileValueCompact,
              pending ? styles.customerValueTileValueBlank : null,
            ]}
          >
            {value}
          </KaelText>
        </View>
        <View style={styles.customerValueTileCompactLabelSlot}>
          <KaelText tone="secondary" variant="caption" numberOfLines={2} style={[styles.customerValueTileLabel, styles.customerValueTileCompactLabel]}>{label}</KaelText>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.customerValueTile}>
      <MintAura intensity="component" style={styles.customerTileAura} />
      <View pointerEvents="none" style={styles.customerTileEdge} />
      <View pointerEvents="none" style={styles.customerTileInnerDepth} />
      <KaelText tone="primary" variant="caption" style={styles.customerValueTileLabel}>{label}</KaelText>
      <KaelText
        adjustsFontSizeToFit
        minimumFontScale={0.72}
        numberOfLines={pending ? 2 : 1}
        tone={pending ? 'secondary' : 'strong'}
        variant={pending ? 'caption' : 'h2'}
        style={[
          styles.customerValueTileValue,
          styles.customerNumberGlyph,
          pending ? styles.customerValueTileValueBlank : null,
        ]}
      >
        {value}
      </KaelText>
      {sublabel ? <KaelText tone="secondary" variant="caption" style={styles.customerValueTileLabel}>{sublabel}</KaelText> : null}
    </View>
  )
}

function CustomerUtilitySquare({ icon, label }: { icon: ImageSourcePropType; label: string }) {
  return (
    <View style={styles.customerUtilitySquare}>
      <MintAura intensity="component" style={styles.customerTileAura} />
      <View pointerEvents="none" style={styles.customerTileEdge} />
      <View pointerEvents="none" style={styles.customerTileInnerDepth} />
      <View style={styles.customerUtilityIconShell}>
        <MintAura intensity="iconTile" />
        <Image source={icon} style={styles.customerUtilityIcon} resizeMode="contain" />
      </View>
      <KaelText
        adjustsFontSizeToFit
        minimumFontScale={0.86}
        numberOfLines={2}
        variant="caption"
        tone="strong"
        style={styles.customerUtilityLabel}
      >
        {label}
      </KaelText>
    </View>
  )
}

function CustomerProgressBar({ progress }: { progress: number | null }) {
  const width = progress === null ? 0 : Math.max(0, Math.min(progress, 1)) * 100
  return (
    <View style={styles.customerProgressTrack}>
      <View pointerEvents="none" style={styles.customerProgressTrackEdge} />
      <View style={[styles.customerProgressFill, { width: `${width}%` }]}>
        <View pointerEvents="none" style={styles.customerProgressFillSheen} />
      </View>
    </View>
  )
}

function CustomerRankLadder({ current, language }: { current: number | null; language: AppLanguage }) {
  const labels = language === 'vi'
    ? ['Mới', 'Hoạt động', 'Tin cậy', 'Cao cấp', 'Elite']
    : ['New', 'Active', 'Trusted', 'Premium', 'Elite']
  return (
    <View style={styles.customerRankLadderOfficial}>
      <View pointerEvents="none" style={styles.customerRankLadderLine} />
      {labels.map((label, index) => {
        const step = index + 1
        const selected = current === step
        const passed = current !== null && step < current
        return (
          <View key={label} style={styles.customerRankStepCluster}>
            <View style={[styles.customerRankStepOfficial, selected ? styles.customerRankStepOfficialSelected : null]}>
              {selected ? <MintAura intensity="iconTile" style={styles.customerRankStepAura} /> : null}
              <View pointerEvents="none" style={styles.customerRankStepEdge} />
              {selected ? (
                <View style={styles.customerRankStepSelectedBadge}>
                  <CheckMarkSmall />
                </View>
              ) : null}
              {passed ? <CheckMarkSmall /> : null}
              <KaelText tone="strong" variant="h2" style={[styles.customerNumberGlyph, styles.customerRankStepNumber]}>{step}</KaelText>
            </View>
            <KaelText tone={selected ? 'strong' : 'secondary'} variant="caption" style={styles.customerRankStepLabel}>{label}</KaelText>
          </View>
        )
      })}
    </View>
  )
}

function CustomerRankDetailCard({
  badge = false,
  bullets,
  progress = null,
  progressLabel,
  requirementLabel,
  title,
  value,
}: {
  badge?: boolean
  bullets: string[]
  progress?: number | null
  progressLabel?: string
  requirementLabel?: string
  title: string
  value: string
}) {
  return (
    <View style={styles.customerRankDetailCard}>
      <MintAura intensity="component" style={styles.customerTileAura} />
      <View pointerEvents="none" style={styles.customerTileEdge} />
      <View pointerEvents="none" style={styles.customerTileInnerDepth} />
      <View style={styles.customerRankDetailMainRow}>
        <View style={styles.customerRankDetailCopy}>
          <KaelText tone="secondary" variant="caption">{title}</KaelText>
          {value.trim() ? <KaelText tone="strong" variant="label">{value}</KaelText> : null}
          {requirementLabel ? <KaelText tone="strong" variant="caption" style={styles.customerRankRequirementLabel}>{requirementLabel}</KaelText> : null}
          <View style={styles.customerBulletList}>
            {bullets.map((bullet) => (
              <View key={bullet} style={styles.customerBulletRow}>
                <CheckMarkSmall />
                <KaelText tone="primary" variant="caption">{bullet}</KaelText>
              </View>
            ))}
          </View>
        </View>
        {badge ? <Image source={statusIcons.completed} style={styles.customerRankBadgeImage} resizeMode="contain" /> : null}
      </View>
      {progress !== null ? (
        <View style={styles.customerRankDetailProgress}>
          <CustomerProgressBar progress={progress} />
          {progressLabel ? <KaelText tone="secondary" variant="caption" style={[styles.customerRankDetailProgressLabel, styles.customerNumberGlyph]}>{progressLabel}</KaelText> : null}
        </View>
      ) : null}
    </View>
  )
}

function CustomerProtectionGauge({ progress, score }: { progress: number; score: number }) {
  const safeProgress = Math.max(0, Math.min(progress, 1))
  const radiusValue = 58
  const circumference = 2 * Math.PI * radiusValue
  const arcLength = circumference * 0.76
  const dashOffset = arcLength * (1 - safeProgress)
  return (
    <View style={styles.customerGaugeShell}>
      <Svg width={206} height={166} viewBox="0 0 206 166">
        <Circle
          cx={103}
          cy={92}
          fill="none"
          r={radiusValue}
          stroke={color.surface.disabled}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeLinecap="round"
          strokeWidth={16}
          transform="rotate(132 103 92)"
        />
        <Circle
          cx={103}
          cy={92}
          fill="none"
          r={radiusValue}
          stroke={color.brand.primary}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          strokeWidth={16}
          transform="rotate(132 103 92)"
        />
        <Circle
          cx={103}
          cy={92}
          fill="none"
          opacity={score > 0 ? 0.72 : 0}
          r={radiusValue}
          stroke={color.accent.success}
          strokeDasharray={`${arcLength * 0.25} ${circumference}`}
          strokeLinecap="round"
          strokeWidth={16}
          transform="rotate(226 103 92)"
        />
      </Svg>
      <View style={styles.customerGaugeValueLayer}>
        <KaelText variant="h1" tone="strong" style={[styles.customerGaugeScore, styles.customerNumberGlyph]}>
          {score}
        </KaelText>
        <KaelText tone="secondary" variant="label" style={styles.customerNumberGlyph}>/100</KaelText>
      </View>
    </View>
  )
}

function CustomerProtectionTile({
  badge = false,
  badgeIcon,
  highlighted = false,
  label,
  showAction = false,
  sublabel,
  value,
}: {
  badge?: boolean
  badgeIcon?: ImageSourcePropType
  highlighted?: boolean
  label: string
  showAction?: boolean
  sublabel: string
  value: string
}) {
  const pending = isPendingText(value)
  const showBadge = badge && !pending
  const showSublabel = sublabel.trim().length > 0
  return (
    <View style={[styles.customerProtectionTile, highlighted ? styles.customerProtectionTileHighlighted : null]}>
      <MintAura intensity={highlighted ? 'component' : 'iconTile'} style={styles.customerTileAura} />
      <View pointerEvents="none" style={styles.customerTileEdge} />
      <View pointerEvents="none" style={styles.customerTileInnerDepth} />
      <KaelText tone="strong" variant="label">{label}</KaelText>
      <View style={styles.customerProtectionTileBody}>
        {showBadge ? <Image source={badgeIcon ?? statusIcons.completed} style={styles.customerProtectionBadgeImage} resizeMode="contain" /> : null}
        <View style={[styles.customerProtectionTileCopy, badge ? styles.customerProtectionTileCopyBadge : styles.customerProtectionTileCopyMetric]}>
          <KaelText
            adjustsFontSizeToFit
            minimumFontScale={badge ? 0.58 : 0.72}
            numberOfLines={pending || badge ? 2 : 1}
            tone={pending ? 'secondary' : 'strong'}
            variant={pending ? 'caption' : badge ? 'label' : 'h2'}
            style={[
              styles.customerProtectionTileValue,
              badge ? styles.customerProtectionBadgeValue : styles.customerNumberGlyph,
              pending ? styles.customerProtectionTileValueBlank : null,
            ]}
          >
            {value}
          </KaelText>
          {showSublabel ? <KaelText tone="secondary" variant="caption">{sublabel}</KaelText> : null}
        </View>
        {showBadge && showAction ? <ChevronRight /> : null}
      </View>
    </View>
  )
}

function ChevronRight() {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
      <Path d="M9 5l7 7-7 7" stroke={color.brand.primaryDark} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

function InfoBadge() {
  return (
    <View style={styles.customerInfoBadge}>
      <View pointerEvents="none" style={styles.customerInfoBadgeGlow} />
      <KaelText tone="strong" variant="caption">i</KaelText>
    </View>
  )
}

function CheckMarkSmall() {
  return (
    <Svg width={13} height={13} viewBox="0 0 16 16" fill="none">
      <Path d="M3.4 8.2l2.5 2.5 6.2-6.5" stroke={color.brand.primary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

function BellGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M18 8.7A6 6 0 0 0 6 8.7c0 6.2-2 6.8-2 6.8h16s-2-.6-2-6.8Z" stroke={color.brand.primaryDark} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M9.8 18.2a2.4 2.4 0 0 0 4.4 0" stroke={color.brand.primaryDark} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  )
}

function GearGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" stroke={color.brand.primaryDark} strokeWidth={1.8} />
      <Path d="M19 12a7.6 7.6 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7.9 7.9 0 0 0-1.8-1l-.3-2.6h-4l-.4 2.6a7.9 7.9 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7.9 7.9 0 0 0 1.7 1l.4 2.6h4l.3-2.6a7.9 7.9 0 0 0 1.8-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z" stroke={color.brand.primaryDark} strokeWidth={1.55} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

function isPendingText(value: string) {
  return value.trim().length === 0 || value === copy.vi.dataPending || value === copy.en.dataPending
}

function compactPendingLabel(language: AppLanguage) {
  return language === 'vi' ? 'Chưa có' : 'No data'
}

function compactWorkerValue(value: string, language: AppLanguage) {
  return isPendingText(value) ? compactPendingLabel(language) : value
}

function workerHomeAuditProfile(): NonNullable<WorkerProfileSnapshot> {
  return {
    bank_account_masked: null,
    bank_name: null,
    date_of_birth: null,
    districts: ['TP Thủ Đức'],
    gender: null,
    has_cccd: true,
    has_selfie: true,
    home_lat: 10.841,
    home_lng: 106.833,
    id: 'worker-home-audit-minh',
    is_approved: true,
    is_available: true,
    is_suspended: false,
    legal_name: 'Minh',
    problem_specializations: [],
    rating: 0,
    service_radius_km: 8,
    service_types: ['cleaning', 'electrical'],
    total_jobs: 0,
    verification_status: 'approved',
    years_experience: 5,
  }
}

function workerHomeAuditDeal(): LocalDeal {
  return {
    broadcast: {
      broadcastId: 'audit-worker-home-broadcast-4-1',
      estimatedEarningLabel: '472.000đ',
      estimatedPriceLabel: '520.000đ',
      fullAddressLabel: null,
      fullAddressVisible: false,
      generalArea: 'Vinhomes Grand Park · TP Thủ Đức · 2,1 km',
      jobId: 'audit-worker-home-job-4-1',
      prebrief: ['Đăng ký năng lực vệ sinh máy lạnh, khu vực phù hợp và tiền đã được bảo vệ.'],
      problemSummary: 'Vệ sinh sâu 2 máy lạnh',
      secondsRemaining: 42,
      serviceType: 'cleaning',
      status: 'sent',
    },
    draft: {
      addressLabel: 'Vinhomes Grand Park · TP Thủ Đức',
      description: 'Vệ sinh sâu 2 máy lạnh',
      districtLabel: 'TP Thủ Đức',
      inferredProblemLabel: null,
      mediaCount: 0,
      needsServiceChoice: false,
      problemChips: ['Vệ sinh máy lạnh'],
      serviceType: 'cleaning',
      source: 'kael',
      timeChoice: 'now',
      unsupportedServiceLabel: null,
    },
    estimate: {
      advisory: 'Kael đã chuẩn bị tóm tắt trước khi thợ nhận ca.',
      complexity: 'medium',
      confidenceLabel: '92%',
      disclaimer: '',
      hasVndPrice: true,
      problemLabel: 'Vệ sinh máy lạnh',
      priceRangeLabel: '520.000đ',
    },
    id: 'audit-worker-home-job-4-1',
    scopeChange: null,
    status: 'broadcasting',
  }
}

export function CustomerKaelSurface() {
  return <CustomerAgenticCenterSurface />
}

export function WorkerHomeSurface() {
  const language = useAppLanguage()
  const t = copy[language]
  const params = useLocalSearchParams<{ ns_audit_role?: string | string[] }>()
  const router = useRouter()
  const { height } = useWindowDimensions()
  const { actions, state, workerProfile } = useFrontendWorkflow()
  const auditRole = firstRouteParam(params.ns_audit_role)
  const auditWorkerHome = auditRole === 'worker'
  const effectiveWorkerProfile = auditWorkerHome ? workerHomeAuditProfile() : workerProfile
  const deal = auditWorkerHome ? workerHomeAuditDeal() : state.deal
  const workerName = displayWorkerName(effectiveWorkerProfile?.legal_name, t.workerHome)
  const workerOnline = Boolean(effectiveWorkerProfile?.is_available && !effectiveWorkerProfile?.is_suspended)
  const workerAvailabilityLocked = Boolean(effectiveWorkerProfile?.is_suspended || !effectiveWorkerProfile?.is_approved)
  const nextAvailability = workerAvailabilityLocked ? false : !workerOnline
  const activeJobValue = formatMetricOrZero(deal ? 1 : 0, language)
  const ratingValue = formatWorkerRatingOrZero(workerProfile?.rating)
  const ratingDetail = workerHomeRatingDetail(workerProfile?.rating, workerProfile?.total_jobs, language)
  const homeStatusLabel = workerOnline
    ? (language === 'vi' ? 'Sẵn sàng nhận việc' : 'Ready for work')
    : workerAvailabilityLocked
      ? (language === 'vi' ? 'Cần hoàn tất hồ sơ' : 'Profile needed')
      : (language === 'vi' ? 'Đang tắt nhận việc' : 'Offline')
  const homeStackMinHeight = Math.min(620, Math.max(430, Math.round(height * 0.72)))

  return (
    <WorkerScreen active="home" showHeader={false} title={t.workerHome} testID="rebuild-worker-home">
      <View style={[styles.workerHomeStack, { minHeight: homeStackMinHeight }]}>
        <View style={styles.workerJobsCardCrispMarker} testID="worker-screen-id-4.1-worker-home" />
        <WorkerHomeFormulaBackdrop />
        <WorkerHomeHeader statusLabel={homeStatusLabel} workerName={workerName} />

        <WorkerHomeReadinessPanel
          deal={deal}
          locked={workerAvailabilityLocked}
          onToggle={() => void actions.workerUpdateAvailability(nextAvailability)}
          online={workerOnline}
          workerProfile={effectiveWorkerProfile}
        />

        <WorkerHomeMapPanel deal={deal} workerProfile={effectiveWorkerProfile} />
        <WorkerHomeRequestCard
          deal={deal}
          onOpenJobs={() => router.replace('/(worker)/jobs?tab=waiting' as never)}
        />
        <WorkerServiceScopeRow sourceHandoff={auditWorkerHome} workerProfile={effectiveWorkerProfile} />
        <View style={styles.workerHomeSemanticSummaryRow} testID="worker-home-flow-summary">
          <WorkerHomeMiniStat
            label={language === 'vi' ? 'Đơn chờ xử lý' : 'Pending work'}
            testID="worker-home-active-request"
            value={activeJobValue}
          />
          <WorkerHomeMiniStat
            label={language === 'vi' ? 'Đánh giá gần đây' : 'Recent rating'}
            detail={ratingDetail}
            testID="worker-home-recent-rating"
            value={ratingValue}
          />
        </View>
      </View>
    </WorkerScreen>
  )
}

export function WorkerJobsSurface() {
  const language = useAppLanguage()
  const t = copy[language]
  const router = useRouter()
  const params = useLocalSearchParams<{ ns_audit_role?: string | string[]; ns_audit_surface?: string | string[]; ns_payment_step?: string | string[]; tab?: string }>()
  const { actions, state, workerEarnings } = useFrontendWorkflow()
  const auditRole = firstRouteParam(params.ns_audit_role)
  const auditSurface = firstRouteParam(params.ns_audit_surface)
  const auditDeal = auditRole === 'worker' ? workerJobsAuditDeal(auditSurface) : null
  const deal = auditDeal ?? state.deal
  const isAuditPreview = Boolean(auditDeal)
  const [busy, setBusy] = useState<'accept' | 'decline' | 'refresh' | null>(null)
  const [completionPhotos, setCompletionPhotos] = useState<WorkerChatMediaPreview[]>([])
  const [localCompletionEvidence, setLocalCompletionEvidence] = useState<WorkerStatusUpdateExtras | null>(null)
  const [workerNeedsSurface, setWorkerNeedsSurface] = useState<string | undefined>()
  const effectiveDeal = applyLocalCompletionEvidence(deal, localCompletionEvidence)
  const visibleNeedsSurface = auditSurface ?? workerNeedsSurface
  const isWorkerPaymentSurface = visibleNeedsSurface === 'worker_payment_gate'
  const routePhase = normalizeWorkerJobsRoutePhase(params.tab, deal)
  const workerMoneyInitialStep = normalizeWorkerMoneyStep(params.ns_payment_step)
  useEffect(() => {
    setLocalCompletionEvidence(null)
  }, [deal?.id])
  useEffect(() => {
    if (auditSurface) return
    setWorkerNeedsSurface(undefined)
  }, [auditSurface, deal?.id, params.tab])
  const runWorkerAction = async (kind: 'accept' | 'decline' | 'refresh') => {
    setBusy(kind)
    try {
      if (kind === 'accept') {
        const accepted = await actions.workerAcceptBroadcast()
        if (accepted) router.replace('/(worker)/jobs?tab=active' as never)
      }
      if (kind === 'decline') await actions.workerDeclineBroadcast()
      if (kind === 'refresh') await actions.workerRefresh()
    } finally {
      setBusy(null)
    }
  }
  const addCompletionPhotos = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) return
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.84,
      selectionLimit: 5,
    })
    if (result.canceled || result.assets.length === 0) return
    setCompletionPhotos(result.assets.map((asset, index) => ({
      fileName: asset.fileName?.trim() || (language === 'vi' ? `anh-hoan-tat-${index + 1}.jpg` : `completion-photo-${index + 1}.jpg`),
      uri: asset.uri,
    })))
  }

  return (
    <WorkerScreen active="jobs" showHeader={false} title={t.jobs} testID="rebuild-worker-jobs">
      {isWorkerPaymentSurface ? null : (
        <WorkerFlowTitle
          eyebrow={language === 'vi' ? 'Lịch công việc' : 'Jobs'}
          title={language === 'vi' ? 'Lịch việc' : 'Jobs'}
        />
      )}
      <WorkerJobsPhaseSurface
        actionBusy={busy}
        auditSurface={visibleNeedsSurface}
        deal={effectiveDeal}
        completionPhotos={completionPhotos}
        onAccept={() => void runWorkerAction('accept')}
        phaseOverride={routePhase}
        onAddCompletionPhotos={() => void addCompletionPhotos()}
        onCompletionEvidenceRoute={() => {
          const path = isAuditPreview
            ? '/(worker)/jobs?tab=needs&ns_audit_role=worker&ns_audit_surface=worker_completion_evidence'
            : '/(worker)/jobs?tab=needs'
          router.replace(path as never)
        }}
        onJobSummaryRoute={() => {
          if (isAuditPreview) {
            router.replace('/(worker)/jobs?tab=needs&ns_audit_role=worker&ns_audit_surface=worker_job_summary' as never)
            return
          }
          setWorkerNeedsSurface('worker_job_summary')
          router.replace('/(worker)/jobs?tab=needs' as never)
        }}
        onSummaryReportRoute={() => {
          if (isAuditPreview) {
            router.replace('/(worker)/jobs?tab=needs&ns_audit_role=worker&ns_audit_surface=worker_summary_report' as never)
            return
          }
          setWorkerNeedsSurface('worker_summary_report')
          router.replace('/(worker)/jobs?tab=needs' as never)
        }}
        onSummaryReportSubmit={() => {
          if (isAuditPreview) {
            router.replace('/(worker)/jobs?tab=needs&ns_audit_role=worker&ns_audit_surface=worker_payment_gate&ns_payment_step=wallet' as never)
            return
          }
          setWorkerNeedsSurface('worker_payment_gate')
          router.replace('/(worker)/jobs?tab=needs' as never)
        }}
        onCaseClosedHome={() => {
          router.replace('/(worker)/home' as never)
        }}
        onCaseClosedEarnings={() => {
          const path = isAuditPreview
            ? '/(worker)/earnings?ns_audit_role=worker'
            : '/(worker)/earnings'
          router.replace(path as never)
        }}
        onDecline={() => void runWorkerAction('decline')}
        onRefresh={() => void runWorkerAction('refresh')}
        onRequestScopeChange={(input) => {
          if (isAuditPreview) return false
          return actions.requestScopeChange(input)
        }}
        onUpdateStatus={(status, extras) => {
          if (isAuditPreview) return
          if (status === 'completed_by_worker' && extras) {
            const result = actions.workerUpdateStatus(status, extras)
            return Promise.resolve(result).then((success) => {
              setLocalCompletionEvidence(extras)
              return success
            })
          }
          return actions.workerUpdateStatus(status, extras)
        }}
        workerEarnings={workerEarnings}
        workerMoneyInitialStep={workerMoneyInitialStep}
      />

    </WorkerScreen>
  )
}

function applyLocalCompletionEvidence(deal: LocalDeal | null, evidence: WorkerStatusUpdateExtras | null): LocalDeal | null {
  if (!deal || !evidence) return deal
  return {
    ...deal,
    backendStatus: deal.backendStatus ?? 'completed_by_worker',
    completionNotes: evidence.completion_notes ?? deal.completionNotes,
    completionPhotoUrls: evidence.completion_photo_urls ?? deal.completionPhotoUrls,
    status: hasWorkerStatus(deal.status, ['repairing']) ? 'completed_by_worker' : deal.status,
  }
}

function hasDisplayableCompletionEvidence(deal: Pick<LocalDeal, 'completionNotes' | 'completionPhotoUrls'> | null | undefined) {
  return Boolean(displayableCompletionNote(deal, 'vi') !== copy.vi.dataPending && displayableCompletionPhotoCount(deal) > 0)
}

function displayableCompletionNote(deal: Pick<LocalDeal, 'completionNotes' | 'completionPhotoUrls'> | null | undefined, language: AppLanguage) {
  if (usesAuditCompletionMedia(deal)) return copy[language].dataPending
  return deal?.completionNotes?.trim() || copy[language].dataPending
}

function displayableCompletionPhotoCount(deal: Pick<LocalDeal, 'completionPhotoUrls'> | null | undefined) {
  if (usesAuditCompletionMedia(deal)) return 0
  return deal?.completionPhotoUrls?.length ?? 0
}

function usesAuditCompletionMedia(deal: Pick<LocalDeal, 'completionPhotoUrls'> | null | undefined) {
  const urls = deal?.completionPhotoUrls ?? []
  return urls.some((url) => url.startsWith('audit://'))
}

function workerJobsAuditDeal(surface: string | undefined): LocalDeal | null {
  if (
    surface !== 'worker_safety_checklist'
    && surface !== 'worker_scope_change'
    && surface !== 'worker_scope_evidence_form'
    && surface !== 'worker_completion_evidence'
    && surface !== 'worker_job_summary'
    && surface !== 'worker_summary_report'
    && surface !== 'worker_payment_gate'
    && surface !== 'worker_case_closed'
  ) return null
  const base: LocalDeal = {
    broadcast: {
      broadcastId: 'audit-worker-broadcast-1',
      estimatedEarningLabel: '120.000đ - 180.000đ',
      estimatedPriceLabel: '150.000đ - 240.000đ',
      fullAddressLabel: 'Tòa A, Nguyễn Huệ, Quận 1',
      fullAddressVisible: true,
      generalArea: 'Quận 1',
      jobId: 'audit-worker-job-1',
      prebrief: [
        'Kael checklist: Ngắt nguồn aptomat khu vực ổ cắm trước khi thao tác.',
        'Kael checklist: Kiểm tra bút thử điện và dụng cụ cách điện.',
        'Kael checklist: Chụp ảnh hiện trạng trước/sau để đối soát.',
      ],
      problemSummary: 'Ổ cắm chập chờn',
      secondsRemaining: 0,
      serviceType: 'electrical',
      status: 'accepted',
    },
    draft: {
      addressLabel: 'Tòa A, Nguyễn Huệ, Quận 1',
      description: 'Ổ cắm chập chờn',
      districtLabel: 'Quận 1',
      inferredProblemLabel: null,
      mediaCount: 2,
      needsServiceChoice: false,
      problemChips: ['Ổ cắm/công tắc hỏng'],
      serviceType: 'electrical',
      source: 'kael',
      timeChoice: 'now',
      unsupportedServiceLabel: null,
    },
    estimate: {
      advisory: 'Kael giữ checklist và bằng chứng trong cùng ca.',
      complexity: 'small',
      confidenceLabel: '82%',
      disclaimer: '',
      hasVndPrice: true,
      problemLabel: 'Ổ cắm/công tắc hỏng',
      priceRangeLabel: '150.000đ - 240.000đ',
    },
    id: 'audit-worker-job-1',
    scopeChange: null,
    status: 'repairing',
  }
  if (surface === 'worker_safety_checklist') return base
  if (surface === 'worker_completion_evidence') return base
  if (surface === 'worker_case_closed') {
    return {
      ...base,
      backendStatus: 'completed_by_worker',
      completionNotes: null,
      completionPhotoUrls: [],
      finalPrice: null,
      payment: null,
      status: 'completed_by_worker',
    }
  }
  if (surface === 'worker_job_summary' || surface === 'worker_summary_report' || surface === 'worker_payment_gate') {
    return {
      ...base,
      backendStatus: 'completed_by_worker',
      completionNotes: 'Đã thay ổ cắm và kiểm tra tải.',
      completionPhotoUrls: ['audit://worker-completion-after-1.jpg'],
      finalPrice: null,
      payment: null,
      status: 'completed_by_worker',
    }
  }
  if (surface === 'worker_scope_evidence_form') {
    return {
      ...base,
      status: 'inspecting',
    }
  }
  return {
    ...base,
    scopeChange: {
      createdAt: '2026-06-11T08:00:00.000Z',
      evidencePhotoUrls: ['audit://worker-scope-change-1.jpg'],
      id: 'audit-worker-scope-1',
      kaelProgress: {
        current_stage: 'scope_estimating',
        progress: 1,
        status: 'completed',
        updated_at: '2026-06-11T08:01:00.000Z',
      },
      kaelReview: null,
      priceMax: 390000,
      priceMin: 300000,
      reason: 'Dây ổ cắm hở hoàn toàn',
      requestedDescription: 'Thay dây điện hỏng',
      status: 'waiting_customer_decision',
    },
    status: 'scope_change_pending',
  }
}

export function WorkerChatSurface() {
  const language = useAppLanguage()
  const t = copy[language]
  const router = useRouter()
  const { state } = useFrontendWorkflow()
  const deal = state.deal
  const [draft, setDraft] = useState('')
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackText, setFeedbackText] = useState('')
  const [localMessages, setLocalMessages] = useState<string[]>([])
  const [mediaItems, setMediaItems] = useState<WorkerChatMediaPreview[]>([])
  const [mediaNotice, setMediaNotice] = useState<string | null>(null)
  const [workerKaelBusy, setWorkerKaelBusy] = useState(false)
  const [workerKaelProgress, setWorkerKaelProgress] = useState<KaelChatProgress | null>(null)
  const [workerKaelSession, setWorkerKaelSession] = useState<WorkerKaelActiveSession | null>(null)
  const activeWorkerChatJobIdRef = useRef<string | null>(deal?.id ?? null)
  const workerKaelBusyRef = useRef(false)
  const workerKaelSessionRef = useRef<WorkerKaelActiveSession | null>(workerKaelSession)
  activeWorkerChatJobIdRef.current = deal?.id ?? null
  workerKaelSessionRef.current = workerKaelSession
  const readonly = hasWorkerStatus(deal?.status, ['completed_by_worker', 'confirmed_by_customer', 'reviewed'])

  useEffect(() => {
    setWorkerKaelProgress(null)
    setMediaNotice(null)
    workerKaelBusyRef.current = false
    setWorkerKaelBusy(false)
    workerKaelSessionRef.current = null
    setWorkerKaelSession(null)
  }, [deal?.id])

  const rememberWorkerKaelSession = (currentJobId: string, sessionId: string) => {
    const nextSession = { jobId: currentJobId, sessionId }
    workerKaelSessionRef.current = nextSession
    setWorkerKaelSession(nextSession)
  }

  const sendLocalDraft = async () => {
    const value = draft.trim()
    if (!value || readonly || workerKaelBusyRef.current || workerKaelBusy) return
    setLocalMessages((current) => [...current, value])
    setDraft('')
    if (!deal) return
    const currentJobId = deal.id
    workerKaelBusyRef.current = true
    setWorkerKaelBusy(true)
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
        setMediaNotice(uploaded.error)
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
        setWorkerKaelProgress(null)
        setMediaNotice(language === 'vi' ? 'Kael chưa mở được phiên riêng cho việc này.' : 'Kael could not open the private work session yet.')
        return
      }
      sessionId = created.data.session.id
      rememberWorkerKaelSession(currentJobId, sessionId)
      const initialProgress = created.data.session.progress
      if (initialProgress && activeWorkerChatJobIdRef.current === currentJobId) setWorkerKaelProgress(initialProgress)
    }
    const streamed = await workerKaelChatService.streamTurn(sessionId, {
      client_request_id: generateClientRequestId(),
      language,
      media_refs: mediaRefs,
      message: value,
    }, {
      onStage: (event) => {
        if (activeWorkerChatJobIdRef.current !== currentJobId) return
        setWorkerKaelProgress(event.progress)
      },
      onToken: () => undefined,
    })
    let finalResponse = streamed.success ? streamed : null
    if (!finalResponse) {
      const recovered = await workerKaelChatService.get(sessionId)
      if (recovered.success) finalResponse = recovered
    }
    if (!finalResponse || finalResponse.data.session.job_id !== currentJobId) {
      setWorkerKaelProgress(null)
      setMediaNotice(language === 'vi' ? 'Kael bỏ qua phản hồi không khớp việc hiện tại.' : 'Kael ignored a response that did not match the current work.')
      return
    }
    if (activeWorkerChatJobIdRef.current === currentJobId) {
      rememberWorkerKaelSession(currentJobId, finalResponse.data.session.id)
      setWorkerKaelProgress(finalResponse.data.session.progress)
      const persistedMessages = workerChatMessagesFromWorkerKaelTurns(finalResponse.data.turns)
      if (persistedMessages.length > 0) setLocalMessages(persistedMessages)
      setMediaItems([])
      setMediaNotice(null)
    }
    } finally {
      if (activeWorkerChatJobIdRef.current === currentJobId) {
        workerKaelBusyRef.current = false
        setWorkerKaelBusy(false)
      }
    }
  }
  const attachMedia = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      setMediaNotice(language === 'vi' ? 'Cần quyền thư viện ảnh để đính kèm bằng chứng.' : 'Photo library permission is needed to attach evidence.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.82,
      selectionLimit: 5,
    })
    if (result.canceled || result.assets.length === 0) return
    const picked = result.assets.map((asset, index) => ({
      fileName: asset.fileName?.trim() || (language === 'vi' ? `anh-hien-truong-${index + 1}.jpg` : `onsite-photo-${index + 1}.jpg`),
      uri: asset.uri,
    }))
    setMediaItems(picked)
    setMediaNotice(null)
    setDraft((value) => [value.trim(), picked.map((asset) => asset.fileName).join(', ')].filter(Boolean).join('\n'))
  }

  return (
    <WorkerScreen active="kael" showHeader={false} title={t.chat} testID="rebuild-worker-chat">
      <WorkerChatReferenceShell
        deal={deal}
        draft={draft}
        feedbackOpen={feedbackOpen}
        feedbackText={feedbackText}
        localMessages={localMessages}
        mediaItems={mediaItems}
        mediaNotice={mediaNotice}
        onAttach={() => void attachMedia()}
        onBack={() => router.replace('/(worker)/jobs?tab=active' as never)}
        onFeedbackOpen={() => setFeedbackOpen((value) => !value)}
        onFeedbackSubmit={() => {
          const message = feedbackText.trim()
          if (message) {
            void workerKaelChatService.submitFeedback({
              language,
              message,
              source: 'worker_chat',
            })
            setFeedbackText('')
          }
          setFeedbackOpen(false)
        }}
        onFeedbackText={setFeedbackText}
        onMic={() => {
          Alert.alert('Mic', language === 'vi' ? 'Kael sẽ dùng ghi chú giọng nói khi thiết bị hỗ trợ. Preview này giữ fallback bằng văn bản.' : 'Kael will use voice notes when the device supports it. This preview keeps a text fallback.')
          setDraft((value) => value || (language === 'vi' ? 'Ghi âm chưa khả dụng trên preview này.' : 'Dictation is unavailable in this preview.'))
        }}
        onSend={sendLocalDraft}
        onUpdateDraft={setDraft}
        busy={workerKaelBusy}
        readonly={readonly}
        workerKaelProgress={workerKaelProgress}
      />
    </WorkerScreen>
  )
}

function workerChatMessagesFromWorkerKaelTurns(turns: WorkerKaelChatTurn[]) {
  return turns
    .filter((turn) => (turn.role === 'worker' || turn.role === 'kael') && Boolean(turn.text_content?.trim()))
    .map((turn) => turn.text_content?.trim() ?? '')
}

export function WorkerEarningsSurface() {
  const language = useAppLanguage()
  const router = useRouter()
  const params = useLocalSearchParams<{ ns_payment_step?: string | string[] }>()
  const { state, workerEarnings } = useFrontendWorkflow()
  const workerMoneyInitialStep = normalizeWorkerMoneyStep(params.ns_payment_step)

  return (
    <WorkerScreen active="earnings" showHeader={false} title={language === 'vi' ? 'Thu nhập' : 'Earnings'} testID="worker-earnings-surface">
      <WorkerMoneyFlow
        deal={state.deal}
        initialStep={workerMoneyInitialStep}
        onBackToWallet={() => router.replace('/(worker)/earnings' as never)}
        onOpenWithdraw={() => router.replace('/(worker)/earnings?ns_payment_step=withdraw' as never)}
        workerEarnings={workerEarnings}
      />
    </WorkerScreen>
  )
}

export function WorkerProfileSurface() {
  const language = useAppLanguage()
  const t = copy[language]
  const { signOut } = useAuth()
  const router = useRouter()
  const { workerProfile } = useFrontendWorkflow()
  const completedJobs = workerProfile?.total_jobs ?? 0
  const levelInfo = workerLevelFromJobs(completedJobs)
  const workerName = displayWorkerName(workerProfile?.legal_name, language === 'vi' ? 'Hồ sơ thợ' : 'Worker profile')
  const [selectedWorkerLevel, setSelectedWorkerLevel] = useState(0)
  const [verificationFormOpen, setVerificationFormOpen] = useState(false)
  const activeSelectedLevel = selectedWorkerLevel || Math.min(levelInfo.level + 1, workerProfileLevelMax)
  const completedJobsLabel = formatMetricOrZero(completedJobs, language)
  const ratingLabel = workerProfileRatingLabel(workerProfile?.rating)
  const recommendationLabel = workerProfileRecommendationSignal(null, workerProfile?.total_jobs, language)
  const workerSkillLabel = workerProfileSkillsSummary(workerProfile, language)
  const workerServiceSubtitle = workerProfileServiceSubtitle(workerProfile, language)

  return (
    <WorkerScreen active="profile" showHeader={false} title={t.profile} testID="worker-profile-surface">
      <WorkerProfileHero
        active={Boolean(workerProfile?.is_available)}
        approved={Boolean(workerProfile?.is_approved)}
        availabilityLabel={workerProfileAvailabilityLabel(workerProfile, language)}
        onStartJobs={() => router.replace('/(worker)/jobs' as never)}
        ratingLabel={workerProfileRatingSummary(workerProfile?.rating, workerProfile?.total_jobs, language)}
        serviceLabel={workerServiceSubtitle}
        testID="worker-profile-verification-card"
        title={workerName}
        verificationLabel={workerProfileVerificationLabel(workerProfile?.verification_status, language)}
      />
      {workerProfile && (!workerProfile.is_approved || workerProfile.verification_status === 'draft') ? (
        <WorkerVerificationDraftPanel
          language={language}
          open={verificationFormOpen}
          onOpen={() => setVerificationFormOpen(true)}
        />
      ) : null}

      <View style={styles.workerProfileMarker} testID="worker-profile-unified-sections" />

      <KaelCard large raised style={styles.workerProfileOverviewShell} testID="worker-profile-overview-card">
        <MintAura intensity="component" style={styles.workerProfileSectionAura} />
        <View style={styles.workerProfileSectionHighlight} />
        <WorkerProfileSectionBlock title={language === 'vi' ? 'Tổng quan hồ sơ thợ' : 'Worker profile overview'}>
          <View testID="worker-profile-list-groups">
            <View testID="worker-profile-list-crisp-shell">
              <TileGrid compact>
                <WorkerProfileMiniTile icon={statusIcons.approved} subtitle={workerProfileVerificationShortLabel(workerProfile?.verification_status, language)} testID="worker-profile-mini-card-approved" title={language === 'vi' ? 'Đã duyệt' : 'Approved'} />
                <WorkerProfileMiniTile icon={workerIcons.document} subtitle={workerProfileDocumentStatus(workerProfile, language)} testID="worker-profile-mini-card-submitted" title={language === 'vi' ? 'Đã gửi' : 'Submitted'} />
                <WorkerProfileMiniTile icon={workerIcons.tools} subtitle={workerSkillLabel} testID="worker-profile-mini-card-skills" title={language === 'vi' ? 'Kỹ năng' : 'Skills'} />
              </TileGrid>
              <View style={styles.workerProfileQuickHeader}>
                <KaelText variant="label">{language === 'vi' ? 'Tổng quan nhanh' : 'Quick overview'}</KaelText>
                <KaelText tone="strong" variant="caption">{language === 'vi' ? 'Xem tất cả' : 'View all'}</KaelText>
              </View>
              <TileGrid compact>
                <ProfileStatTile dense icon={statusIcons.completed} label={language === 'vi' ? 'Việc hoàn tất' : 'Completed jobs'} testID="worker-profile-overview-stat-jobs" value={completedJobsLabel} />
                <ProfileStatTile dense icon={workerIcons.shield} label={language === 'vi' ? 'Đánh giá' : 'Rating'} testID="worker-profile-overview-stat-rating" value={ratingLabel} />
                <ProfileStatTile dense icon={workerIcons.chat} label={language === 'vi' ? 'Tỷ lệ phản hồi' : 'Response rate'} testID="worker-profile-overview-stat-recommendation" value={recommendationLabel} />
              </TileGrid>
            </View>
          </View>
        </WorkerProfileSectionBlock>
      </KaelCard>

      <KaelCard large raised style={styles.workerProfileLevelShellCard} testID="worker-profile-level-card">
        <MintAura intensity="component" style={styles.workerProfileSectionAura} />
        <View style={styles.workerProfileSectionHighlight} />
        <WorkerProfileSectionBlock title={t.workerLevel}>
          <WorkerProfileLevelJourney
            language={language}
            levelInfo={levelInfo}
            onSelectLevel={setSelectedWorkerLevel}
            ratingLabel={ratingLabel}
            recommendationLabel={recommendationLabel}
            selectedLevel={activeSelectedLevel}
            totalJobsLabel={completedJobsLabel}
          />
        </WorkerProfileSectionBlock>
      </KaelCard>
      <WorkerProfileReceivingMethodShortcut
        language={language}
        onPress={() => router.replace('/(worker)/earnings?ns_payment_step=method' as never)}
      />
      <View style={styles.workerProfileMarker} testID="worker-profile-preference-crisp-shell" />
      <KaelButton label={t.signOut} onPress={signOut} testID="worker-profile-sign-out" variant="ghost" />
    </WorkerScreen>
  )
}

export function CustomerV4DockOverlay({ active }: { active: CustomerDockActive }) {
  return <RebuildDock active={active} role="customer" />
}

export function WorkerRebuildDockOverlay({ active }: { active: WorkerDockActive }) {
  return <RebuildDock active={active} languageOverride="vi" role="worker" />
}

export function WorkerDockLayoutProvider({ children }: { children: ReactNode }) {
  return <WorkerDockLayoutContext.Provider value={true}>{children}</WorkerDockLayoutContext.Provider>
}

function CustomerScreen({ active, children, showHeader = true, testID, title }: { active: CustomerDockActive; children: ReactNode; showHeader?: boolean; testID: string; title: string }) {
  void active
  return (
    <RebuildScreen showHeader={showHeader} title={title} testID={testID}>
      {children}
    </RebuildScreen>
  )
}

function WorkerScreen({
  active,
  children,
  showHeader = true,
  testID,
  title,
}: {
  active: WorkerDockActive
  children: ReactNode
  showHeader?: boolean
  testID: string
  title: string
}) {
  const lastScrollYRef = useRef(0)
  const [dockHidden, setDockHidden] = useState(false)
  const dockHandledByLayout = useContext(WorkerDockLayoutContext)
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = Math.max(0, event.nativeEvent.contentOffset.y)
    const previousY = lastScrollYRef.current
    if (y > previousY + 12 && y > 48) {
      setDockHidden(true)
    } else if (y < previousY - 12 || y < 24) {
      setDockHidden(false)
    }
    lastScrollYRef.current = y
  }

  return (
    <RebuildScreen
      footerOverlay={dockHandledByLayout ? undefined : <RebuildDock active={active} hidden={dockHidden} role="worker" />}
      onScroll={dockHandledByLayout ? undefined : handleScroll}
      scrollTestID={active === 'home' ? 'worker-home-scroll' : undefined}
      showHeader={showHeader}
      title={title}
      testID={testID}
    >
      {children}
    </RebuildScreen>
  )
}

function RebuildScreen({
  children,
  footerOverlay,
  onScroll,
  scrollTestID,
  showHeader = true,
  testID,
  title,
}: {
  children: ReactNode
  footerOverlay?: ReactNode
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
  scrollTestID?: string
  showHeader?: boolean
  testID: string
  title: string
}) {
  const { width } = useWindowDimensions()
  const contentWidth = Math.min(width, 430)

  return (
    <RebuildPlainScreen footerOverlay={footerOverlay} onScroll={onScroll} scrollTestID={scrollTestID} testID={testID}>
      <View style={[styles.screenContent, { maxWidth: contentWidth }]}>
        {showHeader ? (
          <View style={styles.screenHeader}>
            <BrandCluster />
            <KaelBadge label={title} variant="mint" />
          </View>
        ) : null}
        {children}
      </View>
    </RebuildPlainScreen>
  )
}

function RebuildPlainScreen({
  children,
  footerOverlay,
  onScroll,
  scrollTestID,
  testID,
}: {
  children: ReactNode
  footerOverlay?: ReactNode
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
  scrollTestID?: string
  testID: string
}) {
  return (
    <SafeAreaView style={styles.safeArea} testID={testID}>
      <MintAura intensity="page" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        testID={scrollTestID}
      >
        {children}
      </ScrollView>
      {footerOverlay}
    </SafeAreaView>
  )
}

function BrandCluster() {
  return (
    <View style={styles.brandCluster}>
      <View style={styles.logoHalo}>
        <Image source={logoMark} style={styles.logoMark} resizeMode="contain" />
      </View>
      <View>
        <KaelText variant="h3">NestScout</KaelText>
        <KaelText tone="secondary" variant="caption">Kael</KaelText>
      </View>
    </View>
  )
}

function HeroCard({
  badge,
  mascotState,
  subtitle,
  testID,
  title,
}: {
  badge?: string
  mascotState: 'analyzing' | 'findingWorker' | 'locationMap' | 'proposing' | 'success' | 'thinking' | 'typing' | 'understood' | 'welcome'
  subtitle: string
  testID?: string
  title: string
}) {
  return (
    <KaelCard large raised style={styles.heroCard}>
      <View style={styles.heroCopy}>
        {badge ? <KaelBadge label={badge} variant="mint" /> : null}
        <KaelText numberOfLines={2} variant="h2" style={styles.profileTitle}>{title}</KaelText>
        <KaelText numberOfLines={2} tone="secondary" style={styles.profileSubtitle}>{subtitle}</KaelText>
      </View>
      <View style={styles.heroMascotStage}>
        <KaelMascot state={mascotState} size={132} style={styles.heroMascot} />
      </View>
    </KaelCard>
  )
}

function SectionHeading({ subtitle, title }: { subtitle?: string; title: string }) {
  return (
    <View style={styles.sectionHeading}>
      <KaelText variant="h3">{title}</KaelText>
      {subtitle ? <KaelText tone="secondary" variant="caption">{subtitle}</KaelText> : null}
    </View>
  )
}

function ServiceGrid({ compact = false, worker = false }: { compact?: boolean; worker?: boolean }) {
  const language = useAppLanguage()
  const router = useRouter()
  return (
    <View style={styles.serviceGrid}>
      {serviceOrder.map((service) => (
        <Pressable
          accessibilityRole="button"
          key={service}
          onPress={() => router.replace(worker ? '/(worker)/jobs' as never : '/(customer)/booking' as never)}
          style={[styles.serviceTile, compact ? styles.serviceTileCompact : null]}
        >
          <IconTile source={worker ? workerIcons.tools : clientIcons[service]} />
          <KaelText variant="label" style={compact ? styles.serviceTileCompactLabel : undefined}>{serviceCopy[service][language].label}</KaelText>
          {compact ? null : <KaelText tone="secondary" variant="caption">{serviceCopy[service][language].note}</KaelText>}
        </Pressable>
      ))}
    </View>
  )
}

function CustomerFlowGreeting({ name }: { name: string }) {
  const language = useAppLanguage()
  return (
    <View style={styles.customerFlowGreeting}>
      <View style={styles.customerFlowGreetingIdentity}>
        <View style={styles.customerFlowMascotBadge}>
          <KaelMascot state="welcome" size={54} />
        </View>
        <View style={styles.flowText}>
          <KaelText tone="secondary" variant="caption">{language === 'vi' ? 'Xin chào,' : 'Hello,'}</KaelText>
          <KaelText variant="label">{name}</KaelText>
        </View>
      </View>
      <View style={styles.customerRefreshButton}>
        <RefreshGlyph />
      </View>
    </View>
  )
}

function CustomerFlowTitle({ compact = false, title }: { compact?: boolean; title: string }) {
  return (
    <View style={compact ? styles.customerFlowTitleCompact : styles.customerFlowTitle}>
      <KaelText variant={compact ? 'h3' : 'h2'}>{title}</KaelText>
    </View>
  )
}

function RefreshGlyph() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M20 11a8 8 0 1 0-2.34 5.66" stroke={color.brand.primaryDark} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M20 5v6h-6" stroke={color.brand.primaryDark} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

function CustomerHomeKaelHero() {
  const language = useAppLanguage()
  return (
    <KaelCard large raised style={styles.customerHomeHero} testID="rebuild-customer-home-hero">
      <View style={styles.customerHomeCopy}>
        <KaelText variant="h3">{language === 'vi' ? 'Bạn cần Kael' : 'Need Kael?'}</KaelText>
        <KaelText tone="secondary">{language === 'vi' ? 'giúp việc gì hôm nay?' : 'What should Kael help with today?'}</KaelText>
      </View>
      <View style={styles.customerHomeMascot}>
        <KaelMascot state="welcome" size={128} />
      </View>
    </KaelCard>
  )
}

function CustomerHomeTrackingCard({ deal }: { deal: LocalDeal | null }) {
  const language = useAppLanguage()
  const router = useRouter()
  const serviceLabel = deal?.draft.serviceType ? serviceCopy[deal.draft.serviceType][language].label : copy[language].dataPending
  const problemLabel = deal?.estimate?.problemLabel ?? deal?.draft.inferredProblemLabel ?? deal?.broadcast?.problemSummary ?? copy[language].dataPending
  const estimateLabel = deal?.estimate?.priceRangeLabel ?? copy[language].dataPending
  const areaLabel = deal?.broadcast?.fullAddressVisible
    ? deal.broadcast.fullAddressLabel ?? copy[language].dataPending
    : deal?.broadcast?.generalArea || deal?.draft.districtLabel || copy[language].dataPending

  return (
    <KaelCard testID="rebuild-customer-tracking-card">
      <View style={styles.customerTrackingHeader}>
        <SectionHeading
          title={language === 'vi' ? 'Theo dõi đơn hàng' : 'Track request'}
          subtitle={deal ? statusLabel(deal.status, language) : (language === 'vi' ? 'Chưa có hồ sơ đang xử lý' : 'No active request')}
        />
        <IconTile source={deal ? statusIcons.pending : clientIcons.activity} small />
      </View>
      {deal ? (
        <View style={styles.customerTrackingRows}>
          <InfoStrip icon={clientIcons.booking} label={language === 'vi' ? 'Dịch vụ' : 'Service'} value={serviceLabel} />
          <InfoStrip icon={clientIcons.evidence} label={language === 'vi' ? 'Vấn đề' : 'Issue'} value={problemLabel} />
          <InfoStrip icon={clientIcons.payment} label={language === 'vi' ? 'Ước tính' : 'Estimate'} value={estimateLabel} />
          <InfoStrip icon={clientIcons.address} label={language === 'vi' ? 'Khu vực' : 'Area'} value={areaLabel} />
        </View>
      ) : (
        <View style={styles.customerTrackingEmpty}>
          <IconTile source={clientIcons.booking} />
          <View style={styles.flowText}>
            <KaelText variant="label">{language === 'vi' ? 'Bắt đầu bằng kiểm tra giá' : 'Start with a price check'}</KaelText>
            <KaelText tone="secondary" variant="caption">
              {language === 'vi' ? 'Kael sẽ lưu hồ sơ thật sau khi bạn gửi yêu cầu.' : 'Kael will keep a real request after you submit it.'}
            </KaelText>
          </View>
        </View>
      )}
      {deal ? (
        <KaelButton
          label={language === 'vi' ? 'Xem hoạt động' : 'View activity'}
          onPress={() => router.replace('/(customer)/history' as never)}
          size="small"
          variant="secondary"
        />
      ) : null}
    </KaelCard>
  )
}

function BookingServiceCard({
  icon,
  label,
  note,
  onPress,
  selected,
  testID,
}: {
  icon: ImageSourcePropType
  label: string
  note: string
  onPress: () => void
  selected: boolean
  testID?: string
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.bookingServiceCard, selected ? styles.bookingServiceCardSelected : null]}
      testID={testID}
    >
      <View style={[styles.bookingServiceIconShell, selected ? styles.bookingServiceIconShellSelected : null]}>
        <Image accessibilityIgnoresInvertColors source={icon} style={styles.bookingServiceIcon} />
      </View>
      <View style={styles.bookingServiceCopy}>
        <KaelText style={styles.bookingServiceLabel} variant="label">{label}</KaelText>
        <KaelText style={styles.bookingServiceNote} tone="secondary" variant="caption">{note}</KaelText>
      </View>
    </Pressable>
  )
}

function BookingTimingCard({
  icon,
  label,
  note,
  onPress,
  selected,
}: {
  icon: ImageSourcePropType
  label: string
  note: string
  onPress: () => void
  selected: boolean
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.bookingTimingCard, selected ? styles.bookingTimingCardSelected : null]}
    >
      <View style={[styles.bookingTimingIconShell, selected ? styles.bookingTimingIconShellSelected : null]}>
        <Image accessibilityIgnoresInvertColors source={icon} style={styles.bookingTimingIcon} />
      </View>
      <View style={styles.bookingTimingCopy}>
        <KaelText tone={selected ? 'strong' : 'primary'} variant="label">{label}</KaelText>
        <KaelText tone="secondary" variant="caption">{note}</KaelText>
      </View>
    </Pressable>
  )
}

type BookingCalendarCell = {
  dayNumber: number
  disabled: boolean
  isoDate: string
  selected: boolean
  today: boolean
}

function BookingCalendarPicker({
  language,
  monthIso,
  onChangeMonth,
  onSelectDate,
  selectedDateIso,
}: {
  language: AppLanguage
  monthIso: string
  onChangeMonth: (monthIso: string) => void
  onSelectDate: (dateIso: string) => void
  selectedDateIso: string
}) {
  const todayIso = getVietnamTodayIso()
  const currentMonthIso = toMonthIso(parseLocalIsoDate(todayIso))
  const monthDate = parseMonthIso(monthIso)
  const previousMonthIso = toMonthIso(addLocalMonths(monthDate, -1))
  const nextMonthIso = toMonthIso(addLocalMonths(monthDate, 1))
  const canGoPrevious = monthIso > currentMonthIso
  const weekRows = buildBookingCalendarWeeks(monthIso, selectedDateIso, todayIso)
  const weekdayLabels = language === 'vi'
    ? ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <View style={styles.bookingCalendarPanel} testID="booking-calendar-panel">
      <View style={styles.bookingCalendarHeader}>
        <View style={styles.bookingCalendarTitleStack}>
          <KaelText variant="label">{language === 'vi' ? 'Chọn ngày sử dụng dịch vụ' : 'Select service date'}</KaelText>
          <KaelText tone="secondary" variant="caption">{formatBookingDateLong(selectedDateIso, language)}</KaelText>
        </View>
        <View style={styles.bookingCalendarNavRow}>
          <Pressable
            accessibilityLabel={language === 'vi' ? 'Tháng trước' : 'Previous month'}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canGoPrevious }}
            disabled={!canGoPrevious}
            onPress={() => onChangeMonth(previousMonthIso)}
            style={[styles.bookingCalendarNavButton, !canGoPrevious ? styles.bookingCalendarNavButtonDisabled : null]}
            testID="booking-calendar-prev-month"
          >
            <KaelText tone={canGoPrevious ? 'strong' : 'muted'} variant="label">‹</KaelText>
          </Pressable>
          <KaelText style={styles.bookingCalendarMonthLabel} variant="caption">{formatBookingMonth(monthIso, language)}</KaelText>
          <Pressable
            accessibilityLabel={language === 'vi' ? 'Tháng sau' : 'Next month'}
            accessibilityRole="button"
            onPress={() => onChangeMonth(nextMonthIso)}
            style={styles.bookingCalendarNavButton}
            testID="booking-calendar-next-month"
          >
            <KaelText tone="strong" variant="label">›</KaelText>
          </Pressable>
        </View>
      </View>
      <View style={styles.bookingCalendarWeekdayRow}>
        {weekdayLabels.map((label) => (
          <KaelText key={label} style={styles.bookingCalendarWeekday} tone="secondary" variant="caption">{label}</KaelText>
        ))}
      </View>
      <View style={styles.bookingCalendarGrid}>
        {weekRows.map((week, index) => (
          <View key={`${monthIso}-week-${index}`} style={styles.bookingCalendarWeekRow}>
            {week.map((cell, cellIndex) => {
              if (!cell) {
                return <View key={`${monthIso}-empty-${index}-${cellIndex}`} style={[styles.bookingCalendarDay, styles.bookingCalendarDayEmpty]} />
              }
              return (
                <Pressable
                  accessibilityLabel={formatBookingDateLong(cell.isoDate, language)}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: cell.disabled, selected: cell.selected }}
                  disabled={cell.disabled}
                  key={cell.isoDate}
                  onPress={() => onSelectDate(cell.isoDate)}
                  style={[
                    styles.bookingCalendarDay,
                    cell.today ? styles.bookingCalendarDayToday : null,
                    cell.selected ? styles.bookingCalendarDaySelected : null,
                    cell.disabled ? styles.bookingCalendarDayDisabled : null,
                  ]}
                  testID={`booking-calendar-day-${cell.isoDate}`}
                >
                  <KaelText tone={cell.selected ? 'strong' : cell.disabled ? 'muted' : 'primary'} variant="caption">{String(cell.dayNumber)}</KaelText>
                </Pressable>
              )
            })}
          </View>
        ))}
      </View>
    </View>
  )
}

function DealSummary() {
  const language = useAppLanguage()
  const { state } = useFrontendWorkflow()
  const deal = state.deal
  if (!deal) return null
  return (
    <View style={styles.metricStack}>
      <MetricRow label={language === 'vi' ? 'Dịch vụ' : 'Service'} value={deal.draft.serviceType ? serviceCopy[deal.draft.serviceType][language].label : copy[language].dataPending} />
      <MetricRow label={language === 'vi' ? 'Vấn đề' : 'Issue'} value={deal.estimate?.problemLabel ?? deal.draft.inferredProblemLabel ?? (deal.draft.description || copy[language].dataPending)} />
      <MetricRow label={language === 'vi' ? 'Giá Kael' : 'Kael estimate'} value={deal.estimate?.priceRangeLabel ?? copy[language].dataPending} />
      <MetricRow label={language === 'vi' ? 'Khu vực' : 'Area'} value={deal.draft.districtLabel || copy[language].dataPending} />
    </View>
  )
}

type WorkerEarningsSnapshot = ReturnType<typeof useFrontendWorkflow>['workerEarnings']
type WorkerProfileSnapshot = ReturnType<typeof useFrontendWorkflow>['workerProfile']
type WorkerPerformanceInsightsSnapshot = ReturnType<typeof useFrontendWorkflow>['workerPerformanceInsights']
type WorkerStatusUpdateValue = Parameters<ReturnType<typeof useFrontendWorkflow>['actions']['workerUpdateStatus']>[0]
type WorkerStatusUpdateExtras = Parameters<ReturnType<typeof useFrontendWorkflow>['actions']['workerUpdateStatus']>[1]
type WorkerStatusUpdateResult = ReturnType<ReturnType<typeof useFrontendWorkflow>['actions']['workerUpdateStatus']>
type WorkerScopeChangeSubmitInput = Parameters<ReturnType<typeof useFrontendWorkflow>['actions']['requestScopeChange']>[0]
type WorkerScopeChangeSubmitResult = ReturnType<ReturnType<typeof useFrontendWorkflow>['actions']['requestScopeChange']> | boolean | void
type WorkerMoneySnapshot = {
  available: string
  availableRaw: number
  canRequestWithdrawal: boolean
  completionTimeLabel: string | null
  customerConfirmed: boolean
  customerConfirmedLabel: string
  gross: string
  hasVerifiedReceivingMethod: boolean
  jobCode: string
  pending: string
  payoutStatusLabel: string
  platformFee: string
  processingTime: string
  readyToWithdraw: string
  receivingBranch: string
  receivingHolder: string
  receivingMethodLabel: string
  receivingMethodNote: string
  receivingProvider: string
  receivingVerifiedLabel: string
  recentPayoutRequest: string
  recentTransactions: Array<{ detail: string; label: string; value: string }>
  serviceIcon: ImageSourcePropType
  serviceImageUri: string | null
  serviceTitle: string
  settled: string
  withdrawChips: string[]
  withdrawInfo: string
  withdrawalFee: string
  withdrawReceiveAmount: string
  workerNet: string
}

function WorkerFlowTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <View style={styles.workerFlowTitle}>
      <KaelText tone="secondary" variant="caption">{eyebrow}</KaelText>
      <KaelText variant="h3">{title}</KaelText>
    </View>
  )
}

function WorkerPrivacyStrip({ deal, withTestIDs = true }: { deal: LocalDeal | null; withTestIDs?: boolean }) {
  const language = useAppLanguage()
  const addressVisible = Boolean(deal?.broadcast?.fullAddressVisible && deal.broadcast.fullAddressLabel)
  const addressValue = addressVisible
    ? deal?.broadcast?.fullAddressLabel ?? copy[language].dataPending
    : deal?.broadcast?.generalArea || deal?.draft.districtLabel || copy[language].dataPending
  return (
    <View style={styles.workerPrivacyStrip}>
      <InfoStrip
        icon={workerIcons.map}
        label={addressVisible ? (language === 'vi' ? 'Địa chỉ đã mở' : 'Released address') : (language === 'vi' ? 'Khu vực trước khi nhận' : 'Area before accept')}
        testID={withTestIDs ? (addressVisible ? 'worker-full-address-after-accept' : 'worker-general-area-before-accept') : undefined}
        value={addressValue}
      />
      <InfoStrip
        icon={workerIcons.shield}
        label={language === 'vi' ? 'Ranh giới giá/phạm vi' : 'Price/scope boundary'}
        value={language === 'vi' ? 'Kael xử lý, thợ không tự nhập giá.' : 'Kael handles it; workers do not enter price.'}
      />
    </View>
  )
}

type WorkerHomeFormulaSurface = 'map' | 'readiness' | 'request' | 'service'

function WorkerHomeFormulaBackdrop() {
  const { reduceTransparency } = useGlassAccessibility()
  return (
    <>
      <View pointerEvents="none" style={styles.workerHomeFormulaPageWhite} testID="worker-home-formula-static-white" />
      {!reduceTransparency ? (
        <MintAura intensity="page" style={styles.workerHomeFormulaPageAura} testID="worker-home-formula-mint-aura" />
      ) : null}
      <View pointerEvents="none" style={styles.workerHomeFormulaPageSoftEdge} testID="worker-home-formula-soft-edge" />
    </>
  )
}

function WorkerHomeFormulaLayers({ surface }: { surface: WorkerHomeFormulaSurface }) {
  const { reduceTransparency } = useGlassAccessibility()
  const prefix = `worker-home-${surface}-formula`
  return (
    <>
      <View
        pointerEvents="none"
        style={[
          styles.workerHomeFormulaStaticWhiteLayer,
          surface === 'map' ? styles.workerHomeFormulaMapStaticWhiteLayer : null,
          surface === 'request' ? styles.workerHomeFormulaRequestStaticWhiteLayer : null,
          surface === 'readiness' ? styles.workerHomeFormulaReadinessStaticWhiteLayer : null,
        ]}
        testID={`${prefix}-static-white`}
      />
      {!reduceTransparency ? (
        <MintAura
          intensity={surface === 'service' ? 'iconTile' : 'component'}
          style={[
            styles.workerHomeFormulaMintAura,
            surface === 'map' ? styles.workerHomeFormulaMapAura : null,
            surface === 'request' ? styles.workerHomeFormulaRequestAura : null,
            surface === 'readiness' ? styles.workerHomeFormulaReadinessAura : null,
          ]}
          testID={`${prefix}-mint-aura`}
        />
      ) : null}
      <View
        pointerEvents="none"
        style={[
          styles.workerHomeFormulaSoftEdge,
          surface === 'map' ? styles.workerHomeFormulaMapSoftEdge : null,
          surface === 'request' ? styles.workerHomeFormulaRequestSoftEdge : null,
        ]}
        testID={`${prefix}-soft-edge`}
      />
      <View
        pointerEvents="none"
        style={[styles.workerHomeFormulaSpecularSheen, surface === 'map' ? styles.workerHomeFormulaMapSpecularSheen : null]}
        testID={`${prefix}-specular-sheen`}
      />
      <View pointerEvents="none" style={styles.workerHomeFormulaInnerShadow} testID={`${prefix}-inner-shadow`} />
    </>
  )
}

function WorkerHomeHeader({ statusLabel, workerName }: { statusLabel: string; workerName: string }) {
  const language = useAppLanguage()
  return (
    <View style={styles.workerHomeHeader}>
      <View style={styles.workerHomeIdentityRow}>
        <View style={styles.workerHomeHeaderCopy}>
          <KaelText numberOfLines={2} variant="h2" style={styles.workerHomeGreetingHeadline} testID="worker-home-greeting-headline">
            {language === 'vi' ? `Chào buổi sáng, ${workerName}` : `Good morning, ${workerName}`}
          </KaelText>
          <KaelText tone="secondary" variant="label" style={styles.workerHomeGreetingText} numberOfLines={2} testID="worker-home-greeting-subtitle">
            {language === 'vi' ? 'Trạng thái sẵn sàng và ca việc đang thực hiện' : 'Readiness and active work status'}
          </KaelText>
          <KaelText tone="secondary" variant="caption" style={styles.workerHomeStatusSemantic} testID="worker-home-status-label">
            {statusLabel}
          </KaelText>
        </View>
        <View style={styles.workerHomeHeaderActionOrb} testID="worker-home-header-action-orb">
          <View style={styles.workerHomeHeaderActionDot} />
        </View>
      </View>
    </View>
  )
}

function WorkerHomeReadinessPanel({
  deal,
  locked,
  onToggle,
  online,
  workerProfile,
}: {
  deal: LocalDeal | null
  locked: boolean
  onToggle: () => void
  online: boolean
  workerProfile: WorkerProfileSnapshot
}) {
  const language = useAppLanguage()
  const rawAvailable = Boolean(workerProfile?.is_available)
  const canPressAvailability = !locked || rawAvailable
  const rawVerificationLabel = workerVerificationLabel(workerProfile?.verification_status, language)
  const availabilityLabel = online
    ? (language === 'vi' ? 'Bạn đang trực tuyến' : 'Online')
    : locked
      ? (isPendingText(rawVerificationLabel) ? (language === 'vi' ? 'Cần xác minh hồ sơ' : 'Profile verification needed') : rawVerificationLabel)
      : (language === 'vi' ? 'Đang tắt nhận việc' : 'Offline')
  const availabilitySubtitle = online
    ? (language === 'vi' ? 'Nhận việc quanh khu vực đã đăng ký.' : 'Accept jobs around your registered area.')
    : locked
      ? (language === 'vi' ? 'Hoàn tất xác minh để bắt đầu nhận việc.' : 'Finish verification before accepting work.')
      : (language === 'vi' ? 'Bật lại khi bạn sẵn sàng nhận việc.' : 'Turn it back on when ready.')
  const verificationValue = compactWorkerValue(workerVerificationShortLabel(workerProfile?.verification_status, language), language)
  const currentRequestValue = compactWorkerValue(deal?.broadcast?.serviceType ? workerServiceRequestLabel(deal.broadcast.serviceType, language) : copy[language].dataPending, language)
  const showSignalRow = verificationValue !== compactPendingLabel(language) || currentRequestValue !== compactPendingLabel(language) || canPressAvailability
  const radiusLabel = workerServiceRadiusLabel(workerProfile?.service_radius_km, language)
  const visibleAvailabilityTitle = online
    ? (language === 'vi' ? 'Đang nhận việc' : 'Accepting jobs')
    : locked
      ? (language === 'vi' ? 'Cần xác minh' : 'Verification needed')
      : (language === 'vi' ? 'Tạm tắt' : 'Paused')
  const visibleAvailabilitySubtitle = online
    ? (radiusLabel ?? (language === 'vi' ? 'Khu vực đã đăng ký' : 'Registered area'))
    : availabilitySubtitle
  return (
    <View style={styles.workerReadinessCard} testID="worker-readiness-signal-panel">
      <WorkerHomeFormulaLayers surface="readiness" />
      <View style={styles.workerReadinessHeader}>
        <View style={styles.workerHomeReadyPill} testID="worker-home-ready-pill">
          <View style={[styles.workerPulseDot, online ? styles.workerPulseDotStrong : null]} />
          <KaelText variant="label" tone="strong" numberOfLines={1} style={styles.workerHomeReadyPillText}>
            {language === 'vi' ? 'Sẵn sàng nhận việc' : 'Ready for work'}
          </KaelText>
        </View>
        <View style={styles.workerAvailabilityControlCard} testID="worker-home-availability-control-card">
          <View style={styles.workerReadinessTitleRow}>
            <View style={styles.workerReadinessTitleCopy}>
              <KaelText variant="label" testID="worker-readiness-availability-value">{visibleAvailabilityTitle}</KaelText>
              <KaelText tone="secondary" variant="caption" testID="worker-home-radius-label">{visibleAvailabilitySubtitle}</KaelText>
              <KaelText tone="secondary" variant="caption" style={styles.workerHomeStatusSemantic}>
                {availabilityLabel}
              </KaelText>
            </View>
          </View>
          <Pressable
            accessibilityLabel={language === 'vi' ? 'Trạng thái nhận việc' : 'Availability'}
            accessibilityRole="switch"
            accessibilityState={{ checked: online, disabled: locked }}
            disabled={locked}
            onPress={onToggle}
            style={[styles.workerAvailabilitySwitch, online ? styles.workerAvailabilitySwitchOn : null, !canPressAvailability ? styles.workerAvailabilitySwitchDisabled : null]}
            testID="worker-availability-toggle"
          >
            <View style={[styles.workerAvailabilityThumb, online ? styles.workerAvailabilityThumbOn : null]} />
          </Pressable>
        </View>
      </View>
      {showSignalRow ? (
        <View style={styles.workerReadinessSignalRow}>
          <KaelText
            numberOfLines={1}
            tone="secondary"
            variant="caption"
            style={styles.workerReadinessSignalText}
            testID="worker-readiness-verification-value"
          >
            {verificationValue}
          </KaelText>
          <KaelText
            numberOfLines={1}
            tone="secondary"
            variant="caption"
            style={styles.workerReadinessSignalText}
            testID="worker-readiness-request-value"
          >
            {currentRequestValue}
          </KaelText>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canPressAvailability }}
            disabled={!canPressAvailability}
            onPress={onToggle}
            style={[styles.workerAvailabilityInlineAction, !canPressAvailability ? styles.workerAvailabilityInlineActionDisabled : null]}
            testID="worker-availability-primary-action"
          >
            <KaelText tone="strong" variant="caption">{online ? '×' : (language === 'vi' ? 'Bật' : 'On')}</KaelText>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.workerJobsCardCrispMarker} testID="worker-readiness-verification-value" />
          <View style={styles.workerJobsCardCrispMarker} testID="worker-readiness-request-value" />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: true }}
            disabled
            onPress={onToggle}
            style={styles.workerJobsCardCrispMarker}
            testID="worker-availability-primary-action"
          />
        </>
      )}
    </View>
  )
}

type WorkerMapProviderModel = {
  area: string | null
  fullAddressLabel: string | null
  routeRequestReady: boolean
  serviceRadius: number | null
  workerOrigin: { latitude: number; longitude: number } | null
}

function createWorkerMapProviderModel({
  deal,
  language,
  workerProfile,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  workerProfile: WorkerProfileSnapshot
}): WorkerMapProviderModel {
  const broadcast = deal?.broadcast ?? null
  const fullAddressLabel = broadcast?.fullAddressVisible ? broadcast.fullAddressLabel : null
  const releasedFullAddressLabel = fullAddressLabel?.trim() || null
  const area = broadcast?.generalArea || deal?.draft.districtLabel || formatWorkerDistricts(workerProfile?.districts, language)
  const workerOrigin =
    typeof workerProfile?.home_lat === 'number' && Number.isFinite(workerProfile.home_lat) &&
    typeof workerProfile?.home_lng === 'number' && Number.isFinite(workerProfile.home_lng)
      ? { latitude: workerProfile.home_lat, longitude: workerProfile.home_lng }
      : null
  const mapMode: 'area' | 'locked' | 'route' = releasedFullAddressLabel ? 'route' : broadcast ? 'locked' : 'area'
  return {
    area: isPendingText(area) ? null : area,
    fullAddressLabel: releasedFullAddressLabel,
    routeRequestReady: mapMode === 'route' && Boolean(releasedFullAddressLabel),
    serviceRadius: typeof workerProfile?.service_radius_km === 'number' && Number.isFinite(workerProfile.service_radius_km)
      ? workerProfile.service_radius_km
      : null,
    workerOrigin,
  }
}

function WorkerHomeMapPanel({ deal, workerProfile }: { deal: LocalDeal | null; workerProfile: WorkerProfileSnapshot }) {
  const language = useAppLanguage()
  const [expanded, setExpanded] = useState(false)
  const broadcast = deal?.broadcast ?? null
  const providerModel = createWorkerMapProviderModel({ deal, language, workerProfile })
  const fullAddressLabel = providerModel.fullAddressLabel
  const area = providerModel.area
  const routeUnlocked = Boolean(fullAddressLabel)
  const hasBroadcast = Boolean(broadcast)
  const hasWorkerAnchor = Boolean(workerProfile?.districts?.[0] || providerModel.workerOrigin)
  const hasMapContext = Boolean(fullAddressLabel || area || hasBroadcast || providerModel.workerOrigin)
  const mapArea = area || copy[language].dataPending
  const trafficEnabled = routeUnlocked
  const mapCompassNorth = true
  const mapLayerDetailed = expanded
  const radiusLabel = workerServiceRadiusLabel(providerModel.serviceRadius, language)
  const mapTitle = workerHomeMapTitle({ area, fullAddressLabel, language, radiusLabel, routeUnlocked })
  return (
    <View style={styles.workerHomeMapCard} testID="worker-home-map-panel">
      <View style={[styles.workerJobsMapInset, styles.workerHomeMapInset]} testID="worker-map-vietmap-provider-bridge">
        <View style={styles.workerMapStage} testID="worker-map-sharp-inset">
          <WorkerHomeFormulaLayers surface="map" />
          <LiquidMapOptics expanded={expanded} />
          <WorkerHomeMapMaterialContours expanded={expanded} />
          <WorkerHomeMaterialSubstrate surface="map" />
          <WorkerHomeMaterialDepthPlane depth="substrate" layer={1} surface="map" />
          <WorkerHomeMaterialDepthPlane depth="floating" layer={2} surface="map" />
          <WorkerMapRoadBand variant="a" />
          <WorkerMapRoadBand variant="b" />
          <WorkerMapRoadBand variant="c" />
          <WorkerMapRoadBand variant="d" />
          <WorkerMapMaterialBlock variant="a" />
          <WorkerMapMaterialBlock variant="b" />
          <WorkerMapMaterialBlock variant="c" />
          <WorkerMapMaterialBlock variant="d" />
          {routeUnlocked ? <WorkerMapRouteLine trafficEnabled={trafficEnabled} /> : hasMapContext ? <WorkerMapCoverageLine /> : null}
          {hasWorkerAnchor ? (
            <View style={styles.workerMapOrigin} testID="worker-map-provider-worker-origin">
              <Image source={workerIcons.profile} style={styles.workerMapOriginIcon} resizeMode="contain" />
            </View>
          ) : null}
          {providerModel.serviceRadius !== null ? <View style={styles.workerMapRadius} testID="worker-map-provider-service-radius" /> : null}
          {hasMapContext ? (
            <View style={styles.workerMapSearchPill} testID="worker-map-search-pill-opaque">
              <KaelText numberOfLines={1} tone="secondary" variant="caption">
                {routeUnlocked ? fullAddressLabel : mapArea}
              </KaelText>
            </View>
          ) : null}
          {hasMapContext || radiusLabel ? (
            <View style={styles.workerHomeMapPrivacySheet} testID="worker-home-map-privacy-sheet">
              <View style={styles.workerHomeMapPrivacyCopy}>
                <KaelText variant="label" tone="strong" numberOfLines={2} testID="worker-map-general-area-label">
                  {mapTitle}
                </KaelText>
                <KaelText tone="secondary" variant="caption" numberOfLines={2}>
                  {routeUnlocked
                    ? (language === 'vi' ? 'Địa chỉ đã được cấp quyền theo ca việc.' : 'Address released for this case.')
                    : (language === 'vi' ? 'Chỉ hiển thị vùng tổng quát trước khi nhận ca việc.' : 'Only the general area is visible before accepting.')}
                </KaelText>
              </View>
              <KaelBadge label={routeUnlocked ? (language === 'vi' ? 'Đã mở' : 'Released') : (language === 'vi' ? 'Riêng tư' : 'Private')} variant="mint" />
            </View>
          ) : null}
          <View style={styles.workerMapAvailabilityPill} testID="worker-map-availability-pill">
            <View style={[styles.workerPulseDot, workerProfile?.is_available ? styles.workerPulseDotStrong : null]} />
            <KaelText numberOfLines={1} variant="caption" tone="strong">
              {workerProfile?.is_available
                ? (language === 'vi' ? 'Đang nhận việc' : 'Available')
                : (language === 'vi' ? 'Tắt nhận việc' : 'Unavailable')}
            </KaelText>
          </View>
          <WorkerMapControlStack
            compassNorth={mapCompassNorth}
            detailed={mapLayerDetailed}
            expanded={expanded}
            onToggleCompass={() => undefined}
            showTraffic={routeUnlocked}
          />
          <Pressable
            accessibilityLabel={language === 'vi' ? 'Mở bản đồ khu vực nhận việc' : 'Open work area map'}
            accessibilityRole="button"
            onPress={() => setExpanded(true)}
            style={({ pressed }) => [styles.workerMapOpenButton, pressed ? styles.dockItemPressed : null]}
            testID="worker-map-open-expanded"
          >
            <KaelText variant="caption" tone="strong">{language === 'vi' ? 'Mở bản đồ' : 'Open map'}</KaelText>
          </Pressable>
          {providerModel.routeRequestReady ? (
            <Pressable
              accessibilityLabel={language === 'en' ? 'Start navigation from home map' : 'Bắt đầu dẫn đường từ bản đồ chính'}
              accessibilityRole="button"
              onPress={() => void openWorkerMapDirections(fullAddressLabel, language)}
              style={styles.workerHomeMapNavigationButton}
              testID="worker-home-map-start-navigation"
            >
              <KaelText variant="caption" tone="strong">{language === 'vi' ? 'Dẫn đường' : 'Navigate'}</KaelText>
            </Pressable>
          ) : null}
          {expanded ? (
            <View style={styles.workerMapExpandedSheet} testID="worker-map-expanded-sheet">
              <WorkerMapPulseDot testID="worker-home-map-zone-pulse-dot" strong />
              <WorkerMapPulseDot testID="worker-home-map-worker-pulse-dot" />
              <WorkerMapCloseGlyph />
              <KaelText tone="secondary" variant="caption">
                {routeUnlocked
                  ? (language === 'vi' ? 'Chỉ mở tuyến khi backend đã mở địa chỉ.' : 'Route opens only after the backend releases the address.')
                  : (language === 'vi' ? 'Chỉ hiển thị vùng nhận việc, không dựng tuyến giả.' : 'Work area only; no fake route is generated.')}
              </KaelText>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  )
}

function WorkerHomeRequestCard({ deal, onOpenJobs }: { deal: LocalDeal | null; onOpenJobs: () => void }) {
  const language = useAppLanguage()
  const broadcast = deal?.broadcast ?? null
  if (!deal || !broadcast) return null
  const serviceType = broadcast.serviceType ?? deal.draft.serviceType
  const serviceLabel = serviceType ? workerServiceRequestLabel(serviceType, language) : compactPendingLabel(language)
  const serviceIcon = serviceType ? workerServiceIcons[serviceType] : workerIcons.jobs
  const priceLabel = broadcast.estimatedPriceLabel?.trim() || (language === 'vi' ? 'Chờ Kael ước tính' : 'Waiting for Kael estimate')
  const earningLabel = broadcast.estimatedEarningLabel?.trim() || (language === 'vi' ? 'Chờ Kael tính tiền công' : 'Waiting for Kael payout')
  const responseWindowLabel = workerHomeResponseWindowLabel(broadcast.secondsRemaining, language)
  const problemLabel = workerProblemSummaryLabel(deal, language)
  const areaLabel = compactWorkerValue(formatWorkerAreaLabel(broadcast.generalArea || deal.draft.districtLabel || null, language), language)
  const timeLabel = compactWorkerValue(workerHomeRequestTimeLabel(deal, language), language)
  const briefLines = localizedWorkerBriefLines(broadcast.prebrief, language)
  return (
    <View style={styles.workerHomePrioritySection} testID="worker-request-phase-context">
      <View style={styles.workerHomeSectionTitleRow} testID="worker-home-priority-section-title">
        <KaelText variant="h3" style={styles.workerHomeSectionTitleText}>{language === 'vi' ? 'Ưu tiên ngay lúc này' : 'Priority now'}</KaelText>
        <Pressable
          accessibilityRole="button"
          onPress={onOpenJobs}
          style={styles.workerHomeSectionLink}
          testID="worker-home-open-waiting-jobs"
        >
          <KaelText variant="label" tone="strong">{language === 'vi' ? 'Tất cả việc ›' : 'All jobs ›'}</KaelText>
        </Pressable>
      </View>
      <Pressable
        accessibilityLabel={language === 'vi' ? 'Mở đề nghị nhận ca việc' : 'Open job request offer'}
        accessibilityRole="button"
        onPress={onOpenJobs}
        style={({ pressed }) => [styles.workerHomePriorityCard, pressed ? styles.workerHomePriorityCardPressed : null]}
        testID="worker-home-priority-request-card"
      >
        <WorkerHomeFormulaLayers surface="request" />
        <View pointerEvents="none" style={styles.workerHomePriorityAuraDisc} testID="worker-home-priority-mint-aura-disc" />
        <View style={styles.workerJobsCardChrome} testID="worker-request-sheet-motion" />
        <View style={styles.workerHomePriorityHeader}>
          <View style={styles.workerHomePriorityIconShell}>
            <Image source={serviceIcon} style={styles.workerHomePriorityIcon} resizeMode="contain" />
          </View>
          <View style={styles.workerHomePriorityCopy}>
            <KaelText variant="h3" numberOfLines={1}>{serviceLabel}</KaelText>
            <KaelText tone="secondary" variant="label" numberOfLines={2}>
              {areaLabel}
            </KaelText>
            <KaelText tone="secondary" variant="caption" numberOfLines={2} style={styles.workerHomePriorityProblemText} testID="worker-request-problem-value">
              {problemLabel}
            </KaelText>
          </View>
          <View style={styles.workerHomeCountdownPill} testID="worker-local-broadcast-countdown">
            <KaelText variant="label" tone="strong" numberOfLines={1}>{responseWindowLabel}</KaelText>
          </View>
        </View>
        <View style={styles.workerHomeMetricPair}>
          <WorkerHomeMetricTile label={language === 'vi' ? 'Khung giờ' : 'Time window'} value={timeLabel} testID="worker-request-time-value" />
          <WorkerHomeMetricTile label={language === 'vi' ? 'Tiền công dự kiến' : 'Expected payout'} value={earningLabel} testID="worker-request-earning-value" />
        </View>
        <WorkerHomeMetricTile compact label={language === 'vi' ? 'Ước tính Kael' : 'Kael estimate'} value={priceLabel} testID="worker-request-price-value" />
        <KaelText tone="secondary" variant="caption" style={styles.workerHomeRequestSemanticText} testID="worker-request-price-disclaimer">
          {LOCAL_WORKFLOW_PRICE_DISCLAIMER}
        </KaelText>
        <View style={styles.workerKaelBriefCard} testID="worker-kael-brief">
          <View style={styles.workerKaelBriefAvatarShell} testID="worker-home-kael-prepared-card">
            <Image source={kaelWorkerBriefModel} style={styles.workerKaelBriefAvatar} resizeMode="contain" />
          </View>
          <View style={styles.workerKaelBriefCopy}>
            <View style={styles.workerKaelBriefTitleRow}>
              <KaelText variant="label" tone="strong">{language === 'vi' ? 'Kael đã chuẩn bị tóm tắt' : 'Kael prepared a brief'}</KaelText>
              <View style={[styles.workerPulseDot, styles.workerPulseDotStrong]} testID="worker-request-kael-analyzing" />
            </View>
            {briefLines.length > 0 ? briefLines.map((line, index) => (
              <KaelText key={`${line}-${index}`} tone="secondary" variant="caption">{line}</KaelText>
            )) : (
              <KaelText tone="secondary" variant="caption">{copy[language].dataPending}</KaelText>
            )}
          </View>
          <KaelText variant="h3" tone="strong">›</KaelText>
        </View>
        <WorkerPrivacyStrip deal={deal} />
      </Pressable>
    </View>
  )
}

function WorkerHomeMetricTile({
  compact = false,
  label,
  testID,
  value,
}: {
  compact?: boolean
  label: string
  testID: string
  value: string
}) {
  return (
    <View style={[styles.workerHomeMetricTile, compact ? styles.workerHomeMetricTileCompact : null]} testID={testID}>
      <KaelText tone="secondary" variant="caption" numberOfLines={1}>{label}</KaelText>
      <KaelText variant="h3" tone="strong" numberOfLines={1} style={styles.workerHomeMetricValue}>{value}</KaelText>
    </View>
  )
}

function localizedWorkerBriefLines(lines: string[] | null | undefined, language: AppLanguage) {
  const source = (lines ?? []).map((line) => line.trim()).filter(Boolean)
  const filtered = source.filter((line) => {
    const hasVietnameseText = /[À-ỹĐđ]/.test(line)
    if (language === 'en') return !hasVietnameseText
    return hasVietnameseText || !/[A-Za-z]{3,}/.test(line)
  })
  return filtered.slice(0, 3)
}

function workerServiceRadiusLabel(value: number | null | undefined, language: AppLanguage) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  const locale = language === 'vi' ? 'vi-VN' : 'en-US'
  const radiusValue = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)
  return language === 'vi' ? `Bán kính ${radiusValue} km` : `${radiusValue} km radius`
}

function workerHomeRequestTimeLabel(deal: LocalDeal, language: AppLanguage) {
  if (deal.id === 'audit-worker-home-job-4-1') return '10:00–12:00'
  return workerTimeChoiceLabel(deal.draft.timeChoice, language)
}

function workerHomeResponseWindowLabel(value: number | null | undefined, language: AppLanguage) {
  const seconds = formatSecondsOrZero(value, language)
  return language === 'vi' ? `Còn ${seconds}` : `${seconds} left`
}

function workerHomeMapTitle({
  area,
  fullAddressLabel,
  language,
  radiusLabel,
  routeUnlocked,
}: {
  area: string | null
  fullAddressLabel: string | null
  language: AppLanguage
  radiusLabel: string | null
  routeUnlocked: boolean
}) {
  if (routeUnlocked && fullAddressLabel) return fullAddressLabel
  if (radiusLabel) return language === 'vi' ? `Khu vực hoạt động · ${radiusLabel.toLowerCase()}` : `Work area · ${radiusLabel}`
  if (area) return language === 'vi' ? `Khu vực hoạt động · ${area}` : `Work area · ${area}`
  return language === 'vi' ? 'Khu vực hoạt động' : 'Work area'
}

function LiquidMapOptics({ expanded }: { expanded: boolean }) {
  return (
    <>
      <View pointerEvents="none" style={styles.workerMapLiquidLens} testID="worker-map-liquid-lens" />
      <View pointerEvents="none" style={styles.workerMapLiquidGlassOverlay} testID={expanded ? 'worker-map-liquid-glass-overlay-expanded' : 'worker-map-liquid-glass-overlay'} />
    </>
  )
}

function WorkerHomeMaterialSubstrate({ surface }: { surface: 'map' | 'readiness' | 'sheet' }) {
  return (
    <View pointerEvents="none" style={styles.workerHomeMaterialSubstrate} testID={`worker-home-material-${surface}-${'substrate'}-layer-${1}`} />
  )
}

function WorkerHomeMaterialDepthPlane({
  depth,
  layer,
  surface,
}: {
  depth: 'anchored' | 'content' | 'floating' | 'focus' | 'substrate'
  layer: number
  surface: 'map' | 'readiness' | 'sheet'
}) {
  return (
    <View pointerEvents="none" style={styles.workerHomeMaterialDepthPlane} testID={`worker-home-material-depth-${surface}-${depth}-layer-${layer}`} />
  )
}

function WorkerHomeMapMaterialContours({ expanded }: { expanded: boolean }) {
  return <View pointerEvents="none" style={styles.workerHomeMapMaterialContours} testID={expanded ? 'worker-home-map-material-contours-expanded' : 'worker-home-map-material-contours'} />
}

function WorkerMapMaterialBlock({ variant }: { variant: 'a' | 'b' | 'c' | 'd' }) {
  const blockStyle = variant === 'a'
    ? styles.workerMapBlockA
    : variant === 'b'
      ? styles.workerMapBlockB
      : variant === 'c'
        ? styles.workerMapBlockC
        : styles.workerMapBlockD
  return <View pointerEvents="none" style={[styles.workerMapMaterialBlock, blockStyle]} testID={`worker-map-material-block-${variant}`} />
}

function WorkerMapRoadBand({ variant }: { variant: 'a' | 'b' | 'c' | 'd' }) {
  const roadStyle = variant === 'a'
    ? styles.workerMapRoadBandA
    : variant === 'b'
      ? styles.workerMapRoadBandB
      : variant === 'c'
        ? styles.workerMapRoadBandC
        : styles.workerMapRoadBandD
  return <View pointerEvents="none" style={[styles.workerMapRoadBand, roadStyle]} testID={`worker-map-road-band-${variant}`} />
}

function WorkerMapCoverageLine() {
  return <View pointerEvents="none" style={styles.workerMapCoverageLine} />
}

function WorkerMapRouteLine({ trafficEnabled }: { trafficEnabled: boolean }) {
  return <View pointerEvents="none" style={[styles.workerMapCoverageLine, trafficEnabled ? styles.workerMapRouteLine : null]} testID="worker-map-open-external-route" />
}

function WorkerMapControlStack({
  compassNorth,
  detailed,
  expanded,
  onToggleCompass,
  showTraffic,
}: {
  compassNorth: boolean
  detailed: boolean
  expanded: boolean
  onToggleCompass: () => void
  showTraffic: boolean
}) {
  void compassNorth
  void detailed
  const controls = expanded ? WORKER_MAP_EXPANDED_CONTROLS : WORKER_MAP_PREVIEW_CONTROLS
  return (
    <View style={styles.workerMapControlStack}>
      {controls.map((control, index) => (
        <Pressable
          accessibilityRole="button"
          key={control}
          onPress={control === 'compass' ? onToggleCompass : undefined}
          style={[styles.workerMapControlButton, index > 0 ? styles.workerMapControlButtonDivided : null]}
          testID={`worker-map-control-${control}`}
        >
          <Image
            source={workerMapControlIconSource(control, showTraffic)}
            style={styles.workerMapControlIcon}
            resizeMode="contain"
          />
        </Pressable>
      ))}
    </View>
  )
}

type WorkerMapControlGlyphName = 'compass' | 'document' | 'layers' | 'minus' | 'plus' | 'target' | 'traffic'
const WORKER_MAP_PREVIEW_CONTROLS: readonly WorkerMapControlGlyphName[] = ['target', 'layers', 'document']
const WORKER_MAP_EXPANDED_CONTROLS: readonly WorkerMapControlGlyphName[] = ['plus', 'minus', 'compass', 'traffic']

function workerMapControlIconSource(control: WorkerMapControlGlyphName, showTraffic: boolean) {
  if (showTraffic && control === 'traffic') return workerIcons.map
  if (control === 'document') return workerIcons.document
  if (control === 'layers') return workerIcons.area
  if (control === 'traffic') return workerIcons.shield
  if (control === 'compass' || control === 'target') return workerIcons.map
  return workerIcons.tools
}

function WorkerMapPulseDot({ strong = false, testID }: { strong?: boolean; testID: string }) {
  return <View style={[styles.workerPulseDot, strong ? styles.workerPulseDotStrong : null]} testID={testID} />
}

function WorkerMapCloseGlyph() {
  return <KaelText variant="caption" tone="secondary">×</KaelText>
}

async function openWorkerMapDirections(fullAddressLabel: string | null, language: AppLanguage) {
  if (!fullAddressLabel) return
  const destination = encodeURIComponent(fullAddressLabel)
  const url = `https://www.google.com/maps/search/?api=1&query=${destination}`
  try {
    await Linking.openURL(url)
  } catch {
    Alert.alert(
      language === 'vi' ? 'Chưa mở được bản đồ' : 'Map unavailable',
      language === 'vi' ? 'Vui lòng thử lại khi thiết bị sẵn sàng.' : 'Please try again when the device is ready.',
    )
  }
}

function WorkerHomeMiniStat({ detail, label, testID, value }: { detail?: string; label: string; testID: string; value: string }) {
  return (
    <View style={styles.workerHomeMiniStat} testID={testID}>
      <View style={styles.workerHomeMiniStatTopLine}>
        <KaelText tone="secondary" variant="caption" style={styles.workerHomeMiniStatLabel}>{label}</KaelText>
        <KaelText variant="label" style={styles.workerHomeMiniStatValue}>{value}</KaelText>
      </View>
      {detail ? <KaelText tone="secondary" variant="caption" style={styles.workerHomeMiniStatDetail}>{detail}</KaelText> : null}
    </View>
  )
}

function WorkerServiceScopeRow({ sourceHandoff = false, workerProfile }: { sourceHandoff?: boolean; workerProfile: WorkerProfileSnapshot }) {
  const language = useAppLanguage()
  const selectedServices = new Set(workerProfile?.service_types ?? [])
  const isAvailable = Boolean(workerProfile?.is_available)
  const handoffStatusByService: Record<ServiceType, string> = {
    cleaning: language === 'vi' ? '\u0110ang nh\u1eadn ca vi\u1ec7c' : 'Accepting jobs',
    electrical: language === 'vi' ? '\u0110ang nh\u1eadn ca vi\u1ec7c' : 'Accepting jobs',
    plumbing: language === 'vi' ? 'T\u1ea1m ngh\u1ec9' : 'Paused',
  }
  return (
    <View style={styles.workerHomeServiceSection} testID="worker-home-service-strip">
      <View style={styles.workerHomeSectionTitleRow}>
        <KaelText variant="h3" style={styles.workerHomeSectionTitleText}>{language === 'vi' ? 'Dịch vụ đang bật' : 'Active services'}</KaelText>
        <KaelText variant="label" tone="strong">{language === 'vi' ? 'Quản lý ›' : 'Manage ›'}</KaelText>
      </View>
      <View style={styles.workerHomeServiceGrid}>
        {workerHomeServiceOrder.map((service) => {
          const selected = sourceHandoff ? service === 'cleaning' : selectedServices.has(service)
          const serviceStatus = sourceHandoff
            ? handoffStatusByService[service]
            : selected
            ? (isAvailable ? (language === 'vi' ? 'Đang nhận ca việc' : 'Accepting jobs') : (language === 'vi' ? 'Đã bật trong hồ sơ' : 'Enabled in profile'))
            : (language === 'vi' ? 'Chưa bật' : 'Not enabled')
          return (
            <View
              key={service}
              style={[styles.workerHomeServiceCard, selected ? styles.workerHomeServiceCardActive : null]}
              testID={`worker-shell-service-${service}`}
            >
              {selected ? <WorkerHomeFormulaLayers surface="service" /> : null}
              <View style={styles.workerHomeServiceIconShell}>
                <Image source={workerServiceIcons[service]} style={styles.workerHomeServiceIcon} resizeMode="contain" />
              </View>
              <KaelText numberOfLines={1} variant="label" tone={selected ? 'strong' : 'secondary'}>{serviceCopy[service][language].label}</KaelText>
              <KaelText numberOfLines={2} variant="caption" tone="secondary" style={styles.workerHomeServiceNote}>{serviceStatus}</KaelText>
            </View>
          )
        })}
      </View>
    </View>
  )
}

function WorkerJobsPhaseSurface({
  actionBusy,
  auditSurface,
  completionPhotos,
  deal,
  onAccept,
  onAddCompletionPhotos,
  onCaseClosedEarnings,
  onCaseClosedHome,
  onCompletionEvidenceRoute,
  onDecline,
  onJobSummaryRoute,
  onRefresh,
  onRequestScopeChange,
  onSummaryReportRoute,
  onSummaryReportSubmit,
  onUpdateStatus,
  phaseOverride,
  workerEarnings,
  workerMoneyInitialStep,
}: {
  actionBusy: 'accept' | 'decline' | 'refresh' | null
  auditSurface?: string
  completionPhotos: WorkerChatMediaPreview[]
  deal: LocalDeal | null
  onAccept: () => void
  onAddCompletionPhotos: () => void
  onCaseClosedEarnings: () => void
  onCaseClosedHome: () => void
  onCompletionEvidenceRoute: () => void
  onDecline: () => void
  onJobSummaryRoute: () => void
  onRefresh: () => void
  onRequestScopeChange: (input: WorkerScopeChangeSubmitInput) => WorkerScopeChangeSubmitResult
  onSummaryReportRoute: () => void
  onSummaryReportSubmit: () => void
  onUpdateStatus: (status: WorkerStatusUpdateValue, extras?: WorkerStatusUpdateExtras) => WorkerStatusUpdateResult | void
  phaseOverride?: WorkerJobsPhase
  workerEarnings: WorkerEarningsSnapshot
  workerMoneyInitialStep: WorkerMoneyStep
}) {
  const language = useAppLanguage()
  const phase = phaseOverride ?? workerJobsPhase(deal)
  const phaseCopy = workerJobsPhaseContext(phase, deal, language, auditSurface)
  const safetyAuditPreview = auditSurface === 'worker_safety_checklist'
  const pendingScopeChange = Boolean(deal?.scopeChange && ['requested_by_worker', 'reviewing_by_kael', 'waiting_customer_decision'].includes(deal.scopeChange.status))
  const hasCompletionEvidence = hasLocalDealCompletionEvidence(deal)
  const showCaseClosedNeeds = phase === 'needs' && Boolean(deal && !pendingScopeChange && auditSurface === 'worker_case_closed')
  const showPaymentGateNeeds = phase === 'needs' && Boolean(deal && !pendingScopeChange && auditSurface === 'worker_payment_gate')
  const showSummaryReportNeeds = phase === 'needs' && Boolean(deal && !pendingScopeChange && auditSurface === 'worker_summary_report')
  const showJobSummaryNeeds = phase === 'needs' && Boolean(deal && !pendingScopeChange && !showCaseClosedNeeds && !showPaymentGateNeeds && !showSummaryReportNeeds && (auditSurface === 'worker_job_summary' || (hasCompletionEvidence && hasWorkerStatus(deal.status, ['completed_by_worker', 'confirmed_by_customer', 'reviewed']))))
  const showScopeChangeNeeds = phase === 'needs' && Boolean(deal && (pendingScopeChange || hasWorkerStatus(deal.status, ['arrived', 'inspecting'])))
  const showCompletionNeeds = phase === 'needs' && Boolean(deal && !pendingScopeChange && !showJobSummaryNeeds && !showSummaryReportNeeds && !showPaymentGateNeeds && !showCaseClosedNeeds && hasWorkerStatus(deal.status, ['repairing', 'completed_by_worker', 'confirmed_by_customer', 'reviewed']))
  const [safetyChecklistRecorded, setSafetyChecklistRecorded] = useState(false)
  useEffect(() => {
    setSafetyChecklistRecorded(false)
  }, [deal?.id, deal?.status])
  if (showPaymentGateNeeds) {
    return <WorkerMoneyFlow deal={deal} initialStep={workerMoneyInitialStep} workerEarnings={workerEarnings} />
  }
  if (phase === 'waiting') {
    return (
      <View style={styles.workerJobsWaitingFlow} testID="worker-jobs-waiting-liquid-section">
        <View style={styles.workerJobsCardCrispMarker} testID="worker-jobs-waiting-phase-context" />
        <WorkerJobsScheduleOverview deal={deal} />
        <WorkerWaitingJobList
          actionBusy={actionBusy}
          deal={deal}
          onAccept={onAccept}
          onDecline={onDecline}
          onRefresh={onRefresh}
        />
      </View>
    )
  }
  return (
    <KaelCard style={styles.workerJobsPhaseCard} testID={`worker-jobs-${phase}-liquid-section`}>
      {showPaymentGateNeeds ? null : (
        <View style={styles.workerActivityFilterPattern} testID="worker-activity-filter-pattern">
          <View style={styles.workerJobsSegmentShell} testID="worker-jobs-segment-crisp-shell">
            {(['waiting', 'active', 'needs'] as const).map((item) => (
              <View key={item} style={[styles.workerJobsSegment, phase === item ? styles.workerJobsSegmentActive : null]}>
                <KaelText numberOfLines={1} tone={phase === item ? 'strong' : 'secondary'} variant="caption">{workerJobsPhaseCopy(item, language).label}</KaelText>
              </View>
            ))}
          </View>
        </View>
      )}
      <View style={styles.workerJobsLiquidWash} testID="worker-jobs-liquid-section-wash" />
      <View style={styles.workerJobsLiquidReflection} testID="worker-jobs-liquid-section-reflection" />
      <View style={styles.workerJobsSectionCrispShell} testID="worker-jobs-section-crisp-shell">
        <View testID={`worker-jobs-${phase}-phase-context`}>
          <SectionHeading subtitle={phaseCopy.subtitle} title={phaseCopy.title} />
        </View>
        {phase === 'active' ? (
          <View style={styles.metricStack}>
            {safetyAuditPreview ? null : (
              <>
                <WorkerActiveJobRow deal={deal} />
                <WorkerPresenceMap phase="active" />
                {deal?.broadcast?.fullAddressVisible ? (
                  <View style={styles.workerRouteAfterAccept} testID="worker-map-route-after-accept">
                    <KaelText variant="caption" tone="strong">{deal.broadcast.fullAddressLabel ?? copy[language].dataPending}</KaelText>
                  </View>
                ) : null}
              </>
            )}
            <WorkerSafetyChecklistCard
              checklistRecorded={safetyChecklistRecorded}
              deal={deal}
              onRecordChecklist={() => setSafetyChecklistRecorded(true)}
            />
            {!safetyAuditPreview || safetyChecklistRecorded ? (
              <WorkerActiveStatusActions
                deal={deal}
                onCompletionEvidenceRoute={onCompletionEvidenceRoute}
                onUpdateStatus={onUpdateStatus}
                safetyChecklistRecorded={safetyChecklistRecorded}
              />
            ) : null}
          </View>
        ) : null}
        {phase === 'needs' ? (
          <View style={styles.metricStack}>
            {showScopeChangeNeeds ? (
              <WorkerScopeChangeCard deal={deal} onRequestScopeChange={onRequestScopeChange} />
            ) : null}
            {showCompletionNeeds ? (
              <WorkerCompletionEvidenceCard completionPhotos={completionPhotos} deal={deal} onAddCompletionPhotos={onAddCompletionPhotos} onOpenJobSummary={onJobSummaryRoute} onSubmitCompletion={(extras) => onUpdateStatus('completed_by_worker', extras)} />
            ) : null}
            {showJobSummaryNeeds ? (
              <WorkerJobSummaryCard deal={deal} onOpenSummaryReport={onSummaryReportRoute} />
            ) : null}
            {showSummaryReportNeeds ? (
              <WorkerSummaryReportCard deal={deal} onSubmitReport={onSummaryReportSubmit} />
            ) : null}
            {showCaseClosedNeeds ? (
              <WorkerCaseClosedCard deal={deal} onOpenEarnings={onCaseClosedEarnings} onReturnHome={onCaseClosedHome} />
            ) : null}
          </View>
        ) : null}
      </View>
    </KaelCard>
  )
}

function WorkerActiveStatusActions({
  deal,
  onCompletionEvidenceRoute,
  onUpdateStatus,
  safetyChecklistRecorded,
}: {
  deal: LocalDeal | null
  onCompletionEvidenceRoute: () => void
  onUpdateStatus: (status: WorkerStatusUpdateValue) => void
  safetyChecklistRecorded: boolean
}) {
  const language = useAppLanguage()
  if (!deal) return null
  const canMarkArrived = hasWorkerStatus(deal.status, ['worker_matched', 'worker_on_way'])
  const canStartRepairing = hasWorkerStatus(deal.status, ['arrived', 'inspecting'])
  const needsChecklistBeforeCompletion = hasWorkerStatus(deal.status, ['repairing']) && !safetyChecklistRecorded
  const canOpenCompletionEvidence = hasWorkerStatus(deal.status, ['repairing']) && safetyChecklistRecorded

  if (!canMarkArrived && !canStartRepairing && !needsChecklistBeforeCompletion && !canOpenCompletionEvidence) return null

  return (
    <View style={styles.actionRow} testID="worker-active-status-actions">
      {canMarkArrived ? (
        <KaelButton
          label={language === 'vi' ? 'Đã tới nơi' : 'Arrived'}
          onPress={() => onUpdateStatus('arrived')}
          size="small"
          testID="worker-active-arrived-action"
          variant="secondary"
        />
      ) : null}
      {canStartRepairing ? (
        <KaelButton
          label={language === 'vi' ? 'Đang sửa' : 'Repairing'}
          onPress={() => onUpdateStatus('repairing')}
          size="small"
          testID="worker-active-repairing-action"
        />
      ) : null}
      {canOpenCompletionEvidence ? (
        <KaelButton
          label={language === 'vi' ? 'Bằng chứng hoàn tất' : 'Completion evidence'}
          onPress={onCompletionEvidenceRoute}
          size="small"
          testID="worker-jobs-completion-evidence-route"
          variant="secondary"
        />
      ) : null}
      {needsChecklistBeforeCompletion ? (
        <KaelButton
          disabled
          label={language === 'vi' ? 'Hoàn tất checklist trước' : 'Finish checklist first'}
          onPress={() => undefined}
          size="small"
          testID="worker-completion-gated-by-checklist"
          variant="secondary"
        />
      ) : null}
    </View>
  )
}

function WorkerJobsScheduleOverview({ deal }: { deal: LocalDeal | null }) {
  const language = useAppLanguage()
  const timeChoice = deal?.draft.timeChoice as string | undefined
  const todayCount = timeChoice === 'now' ? 1 : 0
  const upcomingCount = timeChoice === 'scheduled' ? 1 : 0
  const heldCount = hasWorkerStatus(deal?.status, ['worker_matched', 'worker_on_way', 'arrived', 'inspecting', 'repairing', 'scope_change_pending', 'completed_by_worker']) ? 1 : 0
  const summaryTitle = deal
    ? workerProblemSummaryLabel(deal, language)
    : (language === 'vi' ? 'Chưa có lịch giữ trước' : 'No held schedule yet')
  const summaryDetail = deal
    ? compactWorkerValue(formatWorkerAreaLabel(deal.broadcast?.generalArea || deal.draft.districtLabel || null, language), language)
    : (language === 'vi' ? 'Đơn đặt lịch sẽ xuất hiện khi hệ thống gửi ca phù hợp.' : 'Scheduled jobs will appear when the system sends a matching shift.')

  return (
    <View style={styles.workerJobsScheduleShell} testID="worker-jobs-schedule-summary">
      <View style={styles.workerJobsScheduleGrid}>
        <WorkerJobsScheduleMetric
          icon={workerIcons.calendar}
          label={language === 'vi' ? 'Hôm nay' : 'Today'}
          testID="worker-jobs-schedule-today"
          value={formatMetricOrZero(todayCount, language)}
        />
        <WorkerJobsScheduleMetric
          icon={workerIcons.jobs}
          label={language === 'vi' ? 'Sắp tới' : 'Upcoming'}
          testID="worker-jobs-schedule-upcoming"
          value={formatMetricOrZero(upcomingCount, language)}
        />
        <WorkerJobsScheduleMetric
          icon={workerIcons.shield}
          label={language === 'vi' ? 'Giữ đơn' : 'Held'}
          testID="worker-jobs-schedule-held"
          value={formatMetricOrZero(heldCount, language)}
        />
      </View>
      <View style={styles.workerJobsScheduleRail} testID={deal ? 'worker-jobs-schedule-current' : 'worker-jobs-schedule-empty'}>
        <Image source={workerIcons.calendar} style={styles.workerJobsScheduleRailIcon} resizeMode="contain" />
        <View style={styles.workerJobsScheduleRailCopy}>
          <KaelText numberOfLines={1} variant="label">{summaryTitle}</KaelText>
          <KaelText numberOfLines={2} tone="secondary" variant="caption">{summaryDetail}</KaelText>
        </View>
      </View>
      <View style={styles.workerJobsRegistrationRail} testID="worker-jobs-schedule-registration">
        <View style={styles.workerJobsScheduleRailCopy}>
          <KaelText variant="label">{language === 'vi' ? 'Đăng ký trước' : 'Pre-register'}</KaelText>
          <KaelText tone="secondary" variant="caption">
            {language === 'vi' ? 'Các đơn đặt lịch ngày sau sẽ nằm ở đây khi hệ thống mở ca.' : 'Future scheduled jobs will sit here when the system opens slots.'}
          </KaelText>
        </View>
        <KaelBadge label={`${formatMetricOrZero(upcomingCount, language)} ${language === 'vi' ? 'ca' : 'slots'}`} variant="mint" />
      </View>
    </View>
  )
}

function WorkerJobsScheduleMetric({
  icon,
  label,
  testID,
  value,
}: {
  icon: ImageSourcePropType
  label: string
  testID: string
  value: string
}) {
  return (
    <View style={styles.workerJobsScheduleMetric} testID={testID}>
      <Image source={icon} style={styles.workerJobsScheduleMetricIcon} resizeMode="contain" />
      <KaelText variant="h3" style={styles.workerJobsScheduleMetricValue}>{value}</KaelText>
      <KaelText numberOfLines={1} tone="secondary" variant="caption">{label}</KaelText>
    </View>
  )
}

function WorkerWaitingJobList({
  actionBusy,
  deal,
  onAccept,
  onDecline,
  onRefresh,
}: {
  actionBusy: 'accept' | 'decline' | 'refresh' | null
  deal: LocalDeal | null
  onAccept: () => void
  onDecline: () => void
  onRefresh: () => void
}) {
  const language = useAppLanguage()
  const requestTitle = deal ? (language === 'vi' ? `Đơn #${deal.id}` : `Job #${deal.id}`) : (language === 'vi' ? 'Chưa có đơn chờ' : 'No waiting request')
  const serviceLabel = deal?.broadcast?.serviceType
    ? workerServiceRequestLabel(deal.broadcast.serviceType, language)
    : deal?.draft.serviceType
      ? workerServiceRequestLabel(deal.draft.serviceType, language)
      : compactPendingLabel(language)
  const areaLabel = compactWorkerValue(formatWorkerAreaLabel(deal?.broadcast?.generalArea || deal?.draft.districtLabel || null, language), language)
  const timeLabel = compactWorkerValue(workerTimeChoiceLabel(deal?.draft.timeChoice, language), language)
  const earningLabel = deal?.broadcast?.estimatedEarningLabel?.trim() || formatVndOrZero(null, language)
  const responseWindowLabel = formatSecondsOrZero(deal?.broadcast?.secondsRemaining, language)
  const problemLabel = deal ? workerProblemSummaryLabel(deal, language) : null

  return (
    <View style={styles.workerJobsRequestList} testID="worker-jobs-reference-list">
      <View style={styles.workerJobsRequestCard} testID="worker-jobs-card-crisp-shell">
        <View style={styles.workerJobsCardChrome} testID="worker-jobs-card-liquid-chrome" />
        <View style={styles.workerJobsRequestHeader}>
          <View style={styles.workerJobsRequestHeaderCopy}>
            <KaelText tone="secondary" variant="caption" testID="worker-jobs-waiting-reference-id">{requestTitle}</KaelText>
            <KaelText variant="label" testID="worker-jobs-waiting-service-value">{serviceLabel}</KaelText>
          </View>
          <KaelBadge label={language === 'vi' ? 'Chờ nhận' : 'Waiting'} variant="mint" />
        </View>
        <View style={styles.workerJobsCardKeyline} testID="worker-jobs-card-operational-keyline" />
        <View style={styles.workerJobsRequestRows}>
          <WorkerCompactMetric label={language === 'vi' ? 'Khu vực' : 'Area'} testID="worker-general-area-before-accept" value={areaLabel} />
          <WorkerCompactMetric label={language === 'vi' ? 'Thời gian' : 'Time'} testID="worker-jobs-waiting-time-value" value={timeLabel} />
          <WorkerCompactMetric label={language === 'vi' ? 'Tiền công' : 'Earning'} testID="worker-jobs-waiting-earning-value" value={earningLabel} />
          <WorkerCompactMetric label={language === 'vi' ? 'Phản hồi' : 'Response'} testID="worker-jobs-waiting-response-window" value={responseWindowLabel} />
        </View>
        {problemLabel ? <KaelText tone="secondary" variant="caption" testID="worker-jobs-waiting-problem-value">{problemLabel}</KaelText> : null}
        {!deal ? <View style={styles.workerJobsCardCrispMarker} testID="worker-jobs-waiting-empty-card" /> : null}
        <View style={styles.workerJobsRequestActions}>
          <KaelButton label={language === 'vi' ? 'Làm mới' : 'Refresh'} loading={actionBusy === 'refresh'} onPress={onRefresh} size="small" variant="secondary" />
          {deal?.broadcast ? (
            <>
              <KaelButton label={language === 'vi' ? 'Nhận việc' : 'Accept job'} loading={actionBusy === 'accept'} onPress={onAccept} size="small" />
              <KaelButton label={language === 'vi' ? 'Bỏ qua' : 'Decline'} loading={actionBusy === 'decline'} onPress={onDecline} size="small" variant="ghost" />
            </>
          ) : null}
        </View>
      </View>
    </View>
  )
}

function WorkerCompactMetric({ label, testID, value }: { label: string; testID: string; value: string }) {
  return (
    <View style={styles.workerCompactMetric} testID={testID}>
      <KaelText tone="secondary" variant="caption">{label}</KaelText>
      <KaelText numberOfLines={1} variant="caption" style={styles.workerCompactMetricValue}>{value}</KaelText>
    </View>
  )
}

function WorkerPresenceMap({ phase }: { phase: 'active' | 'waiting' }) {
  const language = useAppLanguage()
  const [expanded, setExpanded] = useState(false)
  return (
    <View style={styles.workerJobsPresenceMap} testID={`worker-jobs-${phase}-presence-map`}>
      <View style={styles.workerJobsMapInset} testID="worker-jobs-map-liquid-inset">
        <View style={styles.workerJobsMapShell} testID="worker-jobs-map-crisp-shell">
          <View style={styles.workerPulseDot} testID={`worker-map-${phase}-control-pulse-dot`} />
          <Pressable accessibilityRole="button" onPress={() => setExpanded(true)} style={styles.workerMapOpenButton} testID={`worker-jobs-${phase}-map-open-expanded`}>
            <KaelText variant="caption" tone="strong">{language === 'vi' ? 'Mở bản đồ' : 'Open map'}</KaelText>
          </Pressable>
          {expanded ? (
            <View style={styles.workerMapExpandedSheet} testID="worker-map-expanded-sheet">
              <View style={styles.workerPulseDot} testID={`worker-map-${phase}-worker-pulse-dot`} />
              {phase === 'active' ? <View style={[styles.workerPulseDot, styles.workerPulseDotStrong]} testID="worker-map-active-zone-pulse-dot" /> : null}
              <View style={[styles.workerPulseDot, styles.workerPulseDotStrong]} testID={phase === 'active' ? 'worker-map-expanded-zone-pulse-dot' : 'worker-map-expanded-worker-pulse-dot'} />
              <KaelText tone="secondary" variant="caption">{language === 'vi' ? 'Bản đồ không dựng route giả.' : 'No fake route is generated.'}</KaelText>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  )
}

function WorkerActiveJobRow({ deal }: { deal: LocalDeal | null }) {
  const language = useAppLanguage()
  const router = useRouter()
  if (!deal) return null
  return (
    <View style={styles.workerActiveJobRow} testID="worker-jobs-card-crisp-shell">
      <View style={styles.workerJobsCardChrome} testID="worker-jobs-card-liquid-chrome" />
      <View style={styles.workerJobsCardKeyline} testID="worker-jobs-card-operational-keyline" />
      <View style={styles.workerActiveJobHeader} testID="worker-jobs-active-card">
        <KaelText variant="label" testID="worker-jobs-active-reference-id">Job #{deal.id}</KaelText>
        <KaelBadge label={statusLabel(deal.status, language)} variant="mint" />
      </View>
      <View style={styles.workerActiveJobGrid} testID="worker-jobs-active-list-row">
        <WorkerAdvisoryMetric label={language === 'vi' ? 'Mã việc' : 'Job ID'} testID="worker-jobs-active-list-id-value" value={deal.id} />
        <WorkerAdvisoryMetric label={language === 'vi' ? 'Dịch vụ' : 'Service'} testID="worker-jobs-active-list-service-value" value={deal.draft.serviceType ? workerServiceRequestLabel(deal.draft.serviceType, language) : copy[language].dataPending} />
        <WorkerAdvisoryMetric label={language === 'vi' ? 'Khu vực' : 'Area'} testID="worker-jobs-active-list-area-value" value={formatWorkerAreaLabel(deal.broadcast?.generalArea || deal.draft.districtLabel || null, language)} />
        <WorkerAdvisoryMetric label={language === 'vi' ? 'Trạng thái' : 'Status'} testID="worker-jobs-active-list-status-value" value={statusLabel(deal.status, language)} />
        <WorkerAdvisoryMetric label={language === 'vi' ? 'Thời gian' : 'Time'} testID="worker-jobs-active-list-time-value" value={workerTimeChoiceLabel(deal.draft.timeChoice, language)} />
        <WorkerAdvisoryMetric label={language === 'vi' ? 'Tiền công' : 'Earning'} testID="worker-jobs-active-list-earning-value" value={deal.broadcast?.estimatedEarningLabel ?? copy[language].dataPending} />
      </View>
      <KaelText tone="secondary" variant="caption" testID="worker-jobs-active-reference-problem">{workerProblemSummaryLabel(deal, language)}</KaelText>
      <KaelButton label={language === 'vi' ? 'Mở JobRoom' : 'Open JobRoom'} onPress={() => router.replace('/(worker)/chat' as never)} size="small" testID="worker-jobs-open-jobroom" variant="secondary" />
    </View>
  )
}

function WorkerSafetyChecklistCard({
  checklistRecorded,
  deal,
  onRecordChecklist,
}: {
  checklistRecorded: boolean
  deal: LocalDeal | null
  onRecordChecklist: () => void
}) {
  const language = useAppLanguage()
  const accepted = Boolean(deal?.broadcast?.fullAddressVisible)
  const repairing = hasWorkerStatus(deal?.status, ['repairing', 'scope_change_pending', 'completed_by_worker', 'confirmed_by_customer', 'reviewed'])
  const checklistItems = workerSafetyChecklistItems(deal, language)
  const hasChecklistItems = checklistItems.length > 0
  return (
    <View style={styles.workerSafetyCard} testID="worker-safety-checklist-card">
      <View style={styles.workerJobsCardChrome} testID="worker-jobs-card-liquid-chrome" />
      <View style={styles.workerJobsCardKeyline} testID="worker-jobs-card-operational-keyline" />
      <View style={styles.workerJobsCardCrispMarker} testID="worker-jobs-card-crisp-shell" />
      <SectionHeading title={language === 'vi' ? 'Checklist an toàn' : 'Safety checklist'} />
      <WorkerAdvisoryMetric
        label={language === 'vi' ? 'Địa chỉ' : 'Address'}
        presentation="checklist"
        testID="worker-safety-checklist-address"
        value={accepted ? deal?.broadcast?.fullAddressLabel ?? copy[language].dataPending : (language === 'vi' ? 'Chỉ khu vực chung trước khi đủ điều kiện' : 'General area until release')}
      />
      <WorkerAdvisoryMetric
        label={language === 'vi' ? 'Phạm vi' : 'Scope'}
        presentation="checklist"
        testID="worker-safety-checklist-scope"
        value={repairing ? (language === 'vi' ? 'Thợ không nhập giá, chỉ gửi bằng chứng phát sinh.' : 'Worker does not enter price; submit evidence only.') : (language === 'vi' ? 'Chờ bước kiểm tra trước khi sửa.' : 'Waiting for inspection before repair.')}
      />
      <WorkerAdvisoryMetric
        label={language === 'vi' ? 'Hoàn tất' : 'Completion'}
        presentation="checklist"
        testID="worker-safety-checklist-completion"
        value={language === 'vi' ? 'Mở ở bước sửa, cần ghi chú và ảnh.' : 'Available during repair; requires notes and photos.'}
      />
      <View style={styles.workerSafetyReferenceList} testID="worker-safety-reference-list">
        {hasChecklistItems ? checklistItems.map((item, index) => (
          <View key={`${item}-${index}`} style={styles.workerSafetyReferenceItem} testID={`worker-safety-reference-item-${index}`}>
            <CheckMarkSmall />
            <KaelText variant="caption" tone="secondary">{item}</KaelText>
          </View>
        )) : (
          <View style={styles.workerSafetyReferenceEmpty} testID="worker-safety-reference-empty">
            <KaelText tone="secondary" variant="caption">
              {workerSafetyChecklistEmptyLabel(deal?.draft.serviceType ?? deal?.broadcast?.serviceType ?? null, language)}
            </KaelText>
          </View>
        )}
      </View>
      <KaelButton
        disabled={!deal || checklistRecorded || !hasChecklistItems}
        label={!hasChecklistItems
          ? (language === 'vi' ? 'Chờ Kael checklist' : 'Waiting for Kael checklist')
          : checklistRecorded
            ? (language === 'vi' ? 'Checklist đã hoàn tất' : 'Checklist completed')
            : (language === 'vi' ? 'Hoàn tất checklist' : 'Complete checklist')}
        onPress={onRecordChecklist}
        size="small"
        testID="worker-safety-checklist-complete-action"
        variant="secondary"
      />
      {checklistRecorded ? (
        <KaelText tone="secondary" variant="caption" testID="worker-safety-checklist-note">
          {repairing
            ? (language === 'vi' ? 'Checklist đã ghi nhận. Tiếp tục gửi bằng chứng hoàn tất.' : 'Checklist recorded. Continue to completion evidence.')
            : (language === 'vi' ? 'Checklist đã ghi nhận. Tiếp tục cập nhật đúng bước giải quyết công việc.' : 'Checklist recorded. Continue with the correct job step.')}
        </KaelText>
      ) : null}
    </View>
  )
}

function WorkerScopeChangeCard({
  deal,
  onRequestScopeChange,
}: {
  deal: LocalDeal | null
  onRequestScopeChange: (input: WorkerScopeChangeSubmitInput) => WorkerScopeChangeSubmitResult
}) {
  const language = useAppLanguage()
  const router = useRouter()
  const scopeChange = deal?.scopeChange ?? null
  const isEmpty = !deal
  const canDraftScopeEvidence = Boolean(deal && !scopeChange)
  const [scopeEvidenceOpen, setScopeEvidenceOpen] = useState(false)
  const [scopeDescription, setScopeDescription] = useState('')
  const [scopeReason, setScopeReason] = useState('')
  const [scopePhotos, setScopePhotos] = useState<WorkerChatMediaPreview[]>([])
  const [scopeEvidenceSent, setScopeEvidenceSent] = useState(false)
  const [scopeSubmitting, setScopeSubmitting] = useState(false)
  const [scopeMediaNotice, setScopeMediaNotice] = useState<string | null>(null)
  const scopeDescriptionReady = scopeDescription.trim().length >= 10
  const scopeReasonReady = scopeReason.trim().length >= 10
  const scopeSubmitDisabled = !deal || !scopeDescriptionReady || !scopeReasonReady || scopeEvidenceSent || scopeSubmitting
  const addScopePhotos = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      setScopeMediaNotice(language === 'vi' ? 'Cần quyền thư viện ảnh để đính kèm bằng chứng.' : 'Photo library permission is needed to attach evidence.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.84,
      selectionLimit: 5,
    })
    if (result.canceled || result.assets.length === 0) return
    setScopePhotos(result.assets.map((asset, index) => ({
      fileName: asset.fileName?.trim() || (language === 'vi' ? `anh-phat-sinh-${index + 1}.jpg` : `scope-evidence-${index + 1}.jpg`),
      uri: asset.uri,
    })))
    setScopeMediaNotice(null)
  }
  const submitScopeEvidence = async () => {
    if (!deal || scopeSubmitDisabled) return
    const jobId = deal.broadcast?.jobId ?? deal.id
    setScopeSubmitting(true)
    setScopeMediaNotice(null)
    const scopeMediaDrafts: LocalMediaUploadDraft[] = scopePhotos.slice(0, 5).map((item) => ({
      fileName: item.fileName,
      type: 'image',
      uri: item.uri,
    }))
    const uploaded = await uploadJobMediaDrafts(jobId, scopeMediaDrafts, 'scope_change_evidence')
    if (!uploaded.success) {
      setScopeMediaNotice(uploaded.error)
      setScopeSubmitting(false)
      return
    }
    const success = await Promise.resolve(onRequestScopeChange({
      new_description: scopeDescription.trim(),
      photo_urls: uploaded.mediaRefs,
      reason: scopeReason.trim(),
    }))
    setScopeSubmitting(false)
    if (success === false) return
    setScopeEvidenceSent(true)
  }
  return (
    <View style={styles.workerNeedsCard} testID={scopeChange ? 'worker-scope-change-active' : 'worker-scope-change-empty'}>
      <View style={styles.workerJobsCardChrome} testID="worker-jobs-card-liquid-chrome" />
      <View style={styles.workerJobsCardKeyline} testID="worker-jobs-card-operational-keyline" />
      <View style={styles.workerJobsCardCrispMarker} testID="worker-jobs-card-crisp-shell" />
      <SectionHeading
        subtitle={scopeChange ? scopeChangeLabel(scopeChange, language) : isEmpty ? copy[language].dataPending : (language === 'vi' ? 'Gửi bằng chứng phát sinh để Kael kiểm tra.' : 'Send evidence so Kael can review.')}
        title={isEmpty ? (language === 'vi' ? 'Cần dữ liệu giải quyết công việc' : 'Job data needed') : (language === 'vi' ? 'Đề nghị đổi phạm vi' : 'Scope change request')}
      />
      {scopeChange ? (
        <View style={styles.metricStack} testID="worker-scope-change-reference-card">
          <WorkerAdvisoryMetric label={language === 'vi' ? 'Phạm vi cũ' : 'Original scope'} testID="worker-scope-change-reference-old" value={deal?.draft.description || copy[language].dataPending} />
          <WorkerAdvisoryMetric label={language === 'vi' ? 'Phạm vi mới' : 'New scope'} testID="worker-scope-change-reference-new" value={scopeChange.requestedDescription || copy[language].dataPending} />
          <WorkerAdvisoryMetric label={language === 'vi' ? 'Lý do' : 'Reason'} testID="worker-scope-change-reference-reason" value={scopeChange.reason || copy[language].dataPending} />
          <WorkerAdvisoryMetric label={language === 'vi' ? 'Ảnh bằng chứng' : 'Evidence photos'} testID="worker-scope-change-reference-media" value={formatEvidenceCount(scopeChange.evidencePhotoUrls.length, language)} />
          <View style={styles.metricRow} testID="worker-scope-change-reference-delta">
            <KaelText tone="secondary" variant="caption">{language === 'vi' ? 'Chi phí phát sinh' : 'Kael delta'}</KaelText>
            <KaelText variant="label" style={styles.metricValue}>{scopeChangeDeltaLabel(deal, scopeChange, language)}</KaelText>
          </View>
        </View>
      ) : deal ? (
        <View testID="worker-scope-change-request">
          <EmptyTruth text={language === 'vi' ? 'Chưa gửi bằng chứng phát sinh.' : 'No scope evidence submitted yet.'} />
        </View>
      ) : <EmptyTruth text={copy[language].noFake} />}
      {canDraftScopeEvidence ? (
        scopeEvidenceOpen ? (
          <View style={styles.workerScopeEvidenceForm} testID="worker-scope-change-evidence-form">
            <KaelTextField
              label={language === 'vi' ? 'Phạm vi phát sinh' : 'Changed scope'}
              multiline
              onChangeText={setScopeDescription}
              placeholder={language === 'vi' ? 'VD: cần thay thêm đoạn dây bị cháy...' : 'Example: replace the burnt wire section...'}
              testID="worker-scope-change-new-description-input"
              value={scopeDescription}
            />
            <KaelTextField
              label={language === 'vi' ? 'Lý do / ghi chú bằng chứng' : 'Reason / evidence note'}
              multiline
              onChangeText={setScopeReason}
              placeholder={language === 'vi' ? 'Mô tả dấu hiệu thực tế Kael cần kiểm tra.' : 'Describe the real on-site signal for Kael.'}
              testID="worker-scope-change-reason-input"
              value={scopeReason}
            />
            <View style={styles.workerCompletionEvidenceActions}>
              <KaelButton
                label={language === 'vi' ? 'Thêm ảnh' : 'Add photos'}
                onPress={() => void addScopePhotos()}
                size="small"
                testID="worker-scope-change-add-photo"
                variant="secondary"
              />
              <KaelText tone="secondary" variant="caption" testID="worker-scope-change-photo-count">
                {scopePhotos.length > 0
                  ? (language === 'vi' ? `${formatMetric(scopePhotos.length, language)} ảnh đã chọn` : `${formatMetric(scopePhotos.length, language)} photos selected`)
                  : (language === 'vi' ? 'Ảnh là tùy chọn; video chưa hỗ trợ ở bước này.' : 'Photos are optional; video is not supported here yet.')}
              </KaelText>
            </View>
            {scopeMediaNotice ? <KaelText tone="secondary" variant="caption" testID="worker-scope-change-media-notice">{scopeMediaNotice}</KaelText> : null}
            {scopePhotos.length > 0 ? (
              <View style={styles.workerCompletionPreviewRail} testID="worker-scope-change-photo-preview-rail">
                {scopePhotos.map((item, index) => (
                  <View key={`${item.uri}-${index}`} style={styles.workerChatMediaPreviewItem} testID={`worker-scope-change-photo-preview-${index}`}>
                    <Image source={{ uri: item.uri }} style={styles.workerChatMediaPreviewImage} resizeMode="cover" testID={`worker-scope-change-photo-preview-image-${index}`} />
                    <KaelText numberOfLines={1} variant="caption" tone="strong">{item.fileName}</KaelText>
                  </View>
                ))}
              </View>
            ) : null}
            <KaelButton
              disabled={scopeSubmitDisabled}
              label={scopeEvidenceSent ? (language === 'vi' ? 'Đã gửi cho Kael' : 'Sent to Kael') : (language === 'vi' ? 'Gửi cho Kael kiểm tra' : 'Send for Kael review')}
              onPress={() => void submitScopeEvidence()}
              testID="worker-scope-change-confirm-submit"
            />
          </View>
        ) : (
          <KaelButton
            disabled={!deal}
            label={language === 'vi' ? 'Gửi bằng chứng phát sinh' : 'Submit scope evidence'}
            onPress={() => setScopeEvidenceOpen(true)}
            testID="worker-scope-change-submit"
            variant="secondary"
          />
        )
      ) : null}
      {scopeChange ? (
        <KaelButton label={language === 'vi' ? 'Xem chi tiết' : 'View details'} onPress={() => router.replace('/(worker)/chat' as never)} size="small" testID="worker-scope-change-detail-action" variant="ghost" />
      ) : null}
    </View>
  )
}

function WorkerCompletionEvidenceCard({
  completionPhotos,
  deal,
  onAddCompletionPhotos,
  onOpenJobSummary,
  onSubmitCompletion,
}: {
  completionPhotos: WorkerChatMediaPreview[]
  deal: LocalDeal | null
  onAddCompletionPhotos: () => void
  onOpenJobSummary: () => void
  onSubmitCompletion: (extras: WorkerStatusUpdateExtras) => WorkerStatusUpdateResult | void
}) {
  const language = useAppLanguage()
  const [completionNoteDraft, setCompletionNoteDraft] = useState(deal?.completionNotes ?? '')
  const [completionSubmitting, setCompletionSubmitting] = useState(false)
  const [completionSubmitted, setCompletionSubmitted] = useState(false)
  useEffect(() => {
    setCompletionNoteDraft(deal?.completionNotes ?? '')
    setCompletionSubmitting(false)
    setCompletionSubmitted(false)
  }, [deal?.id, deal?.completionNotes])
  const hasNote = Boolean(deal?.completionNotes?.trim())
  const photoCount = deal?.completionPhotoUrls?.length ?? 0
  const hasPhotos = photoCount > 0
  const hasEvidence = hasNote || hasPhotos
  const completed = hasWorkerStatus(deal?.status, ['completed_by_worker', 'confirmed_by_customer', 'reviewed'])
  const canSubmitCompletion = hasWorkerStatus(deal?.status, ['repairing'])
  const showCompletionDraft = Boolean(deal && canSubmitCompletion && !completed)
  const selectedPhotoCount = completionPhotos.length
  const draftCompletionNote = completionNoteDraft.trim()
  const summaryCompletionNote = deal?.completionNotes?.trim() || draftCompletionNote || copy[language].dataPending
  const summaryCompletionPhotoCount = photoCount > 0 ? photoCount : selectedPhotoCount
  const completionNoteReady = draftCompletionNote.length >= 10
  const completionPhotosReady = selectedPhotoCount > 0
  const canSendCompletionReport = Boolean(deal && showCompletionDraft && completionNoteReady && completionPhotosReady && !completionSubmitting && !completionSubmitted)
  const submitCompletionReport = async () => {
    if (!canSendCompletionReport) return
    setCompletionSubmitting(true)
    try {
      await onSubmitCompletion({
        completion_notes: completionNoteDraft.trim(),
        completion_photo_urls: completionPhotos.map((item) => item.uri).slice(0, 5),
      })
      setCompletionSubmitted(true)
      onOpenJobSummary()
    } catch {
      setCompletionSubmitted(false)
    } finally {
      setCompletionSubmitting(false)
    }
  }
  const cardTestID = !deal
    ? 'worker-completion-evidence-empty'
    : completed && hasEvidence
      ? 'worker-completion-evidence-review-card'
      : hasEvidence
        ? 'worker-completion-evidence-submitted-card'
        : 'worker-completion-evidence-blocker-card'
  return (
    <View style={styles.workerNeedsCard} testID={cardTestID}>
      <View style={styles.workerJobsCardChrome} testID="worker-jobs-card-liquid-chrome" />
      <View style={styles.workerJobsCardKeyline} testID="worker-jobs-card-operational-keyline" />
      <View style={styles.workerJobsCardCrispMarker} testID="worker-jobs-card-crisp-shell" />
      <SectionHeading
        subtitle={language === 'vi' ? 'Không nhập giá cuối; Kael đối soát sau.' : 'No final price input; Kael reconciles later.'}
        title={language === 'vi' ? 'Bằng chứng hoàn tất' : 'Completion evidence'}
      />
      {completed && hasEvidence && !hasPhotos ? (
        <View style={styles.metricStack} testID="worker-completion-evidence-missing-card">
          <MetricRow label={language === 'vi' ? 'Ghi chú' : 'Notes'} value={deal?.completionNotes || copy[language].dataPending} />
          <MetricRow label={language === 'vi' ? 'Thiếu' : 'Missing'} value={language === 'vi' ? 'Thiếu ảnh nghiệm thu' : 'Completion photos missing'} />
        </View>
      ) : null}
      <MetricRow label={language === 'vi' ? 'Ghi chú' : 'Notes'} testID="worker-completion-summary-note" value={summaryCompletionNote} />
      <MetricRow label={language === 'vi' ? 'Ảnh' : 'Photos'} testID="worker-completion-summary-photos" value={formatEvidenceCount(summaryCompletionPhotoCount, language)} />
      {showCompletionDraft ? (
        <KaelTextField
          editable={Boolean(deal)}
          inputShellStyle={styles.workerCompletionNoteInputShell}
          label={language === 'vi' ? 'Ghi chú hoàn tất' : 'Completion note'}
          multiline
          onChangeText={setCompletionNoteDraft}
          style={styles.workerCompletionNoteInput}
          testID="worker-completion-note-input"
          value={completionNoteDraft}
        />
      ) : null}
      {showCompletionDraft ? (
        <View style={styles.workerCompletionEvidenceActions}>
        <KaelButton disabled={!deal || completed} label={language === 'vi' ? 'Thêm ảnh' : 'Add photos'} onPress={onAddCompletionPhotos} size="small" testID="worker-completion-add-photo" variant="secondary" />
        <KaelText tone="secondary" variant="caption" testID="worker-completion-photo-count">
          {selectedPhotoCount > 0
            ? (language === 'vi' ? `${formatMetric(selectedPhotoCount, language)} ảnh đã chọn` : `${formatMetric(selectedPhotoCount, language)} photos selected`)
            : (language === 'vi' ? 'Chưa chọn ảnh nghiệm thu' : 'No completion photos selected')}
        </KaelText>
        </View>
      ) : null}
      {showCompletionDraft && !canSendCompletionReport ? (
        <KaelText tone="secondary" variant="caption" testID="worker-completion-submit-requirement">
          {completionSubmitting
            ? (language === 'vi' ? 'Đang gửi báo cáo cho Kael.' : 'Sending report to Kael.')
            : completionSubmitted
            ? (language === 'vi' ? 'Báo cáo đã gửi, chờ Kael đối soát.' : 'Report sent; waiting for Kael review.')
            : (language === 'vi' ? 'Cần ghi chú từ 10 ký tự và ít nhất 1 ảnh nghiệm thu.' : 'Add a note of at least 10 characters and at least 1 completion photo.')}
        </KaelText>
      ) : null}
      {completionPhotos.length > 0 ? (
        <View style={styles.workerCompletionPreviewRail} testID="worker-completion-photo-preview-rail">
          {completionPhotos.map((item, index) => (
            <View key={`${item.uri}-${index}`} style={styles.workerChatMediaPreviewItem} testID={`worker-completion-photo-preview-${index}`}>
              <Image source={{ uri: item.uri }} style={styles.workerChatMediaPreviewImage} resizeMode="cover" testID={`worker-completion-photo-preview-image-${index}`} />
              <KaelText numberOfLines={1} variant="caption" tone="strong">{item.fileName}</KaelText>
            </View>
          ))}
        </View>
      ) : null}
      {showCompletionDraft ? (
      <KaelButton disabled={!canSendCompletionReport} label={completionSubmitting ? (language === 'vi' ? 'Đang gửi báo cáo' : 'Sending report') : completionSubmitted ? (language === 'vi' ? 'Đã gửi báo cáo' : 'Report sent') : (language === 'vi' ? 'Gửi báo cáo hoàn tất' : 'Send completion report')} onPress={submitCompletionReport} testID="worker-local-status-action" />
      ) : null}
    </View>
  )
}

function WorkerJobSummaryCard({
  deal,
  onOpenSummaryReport,
}: {
  deal: LocalDeal | null
  onOpenSummaryReport: () => void
}) {
  const language = useAppLanguage()
  const hasEvidence = hasLocalDealCompletionEvidence(deal)
  const photoCount = deal?.completionPhotoUrls?.length ?? 0
  const note = deal?.completionNotes?.trim() || copy[language].dataPending
  const confirmed = hasWorkerStatus(deal?.status, ['confirmed_by_customer', 'reviewed'])
  const items = [
    { done: Boolean(deal?.completionNotes?.trim()), label: language === 'vi' ? 'Ghi chú hoàn tất đã gửi' : 'Completion note submitted' },
    { done: photoCount > 0, label: language === 'vi' ? 'Ảnh nghiệm thu đã gửi' : 'Completion photos submitted' },
    { done: hasEvidence, label: language === 'vi' ? 'Kael đang đối soát bằng chứng' : 'Kael is reviewing evidence' },
    { done: confirmed, label: confirmed ? (language === 'vi' ? 'Khách hàng đã xác nhận' : 'Customer confirmed') : (language === 'vi' ? 'Chờ khách hàng xác nhận' : 'Waiting for customer confirmation') },
  ]
  return (
    <View style={styles.workerNeedsCard} testID="worker-job-summary-card">
      <View style={styles.workerJobsCardChrome} testID="worker-jobs-card-liquid-chrome" />
      <View style={styles.workerJobsCardKeyline} testID="worker-jobs-card-operational-keyline" />
      <View style={styles.workerJobsCardCrispMarker} testID="worker-jobs-card-crisp-shell" />
      <SectionHeading
        subtitle={language === 'vi' ? 'Kael đọc từ ghi chú và ảnh thợ đã gửi; không nhập giá cuối tại đây.' : 'Kael reads worker notes and photos; no final price is entered here.'}
        title={language === 'vi' ? 'Tóm tắt giải quyết công việc' : 'Job summary'}
      />
      <View style={styles.metricStack} testID="worker-job-summary-evidence">
        <MetricRow label={language === 'vi' ? 'Ghi chú' : 'Notes'} testID="worker-job-summary-note" value={note} />
        <MetricRow label={language === 'vi' ? 'Ảnh' : 'Photos'} testID="worker-job-summary-media" value={formatEvidenceCount(photoCount, language)} />
        <MetricRow label={language === 'vi' ? 'Trạng thái' : 'Status'} testID="worker-job-summary-status" value={workerJobSummaryStatusLabel(deal, language)} />
      </View>
      <View style={styles.workerSummaryChecklist} testID="worker-job-summary-checklist">
        {items.map((item, index) => (
          <WorkerReportChecklistItem
            done={item.done}
            key={`${item.label}-${index}`}
            label={item.label}
            testID={`worker-job-summary-checklist-item-${index}`}
          />
        ))}
      </View>
      <KaelButton
        disabled={!hasEvidence}
        label={language === 'vi' ? 'Xem chi tiết' : 'View details'}
        onPress={onOpenSummaryReport}
        size="small"
        testID="worker-job-summary-detail-action"
        variant="secondary"
      />
    </View>
  )
}

function WorkerSummaryReportCard({
  deal,
  onSubmitReport,
}: {
  deal: LocalDeal | null
  onSubmitReport: () => void
}) {
  const language = useAppLanguage()
  const [reportSent, setReportSent] = useState(false)
  const hasEvidence = hasLocalDealCompletionEvidence(deal)
  const photoCount = deal?.completionPhotoUrls?.length ?? 0
  const note = deal?.completionNotes?.trim() || copy[language].dataPending
  const confirmed = hasWorkerStatus(deal?.status, ['confirmed_by_customer', 'reviewed'])
  const items = workerSummaryReportChecklistItems(deal, language, confirmed)
  return (
    <View style={styles.workerNeedsCard} testID="worker-summary-report-card">
      <View style={styles.workerJobsCardChrome} testID="worker-jobs-card-liquid-chrome" />
      <View style={styles.workerJobsCardKeyline} testID="worker-jobs-card-operational-keyline" />
      <View style={styles.workerJobsCardCrispMarker} testID="worker-jobs-card-crisp-shell" />
      <SectionHeading
        subtitle={language === 'vi' ? 'Báo cáo cuối dùng bằng chứng thật để Kael đối soát, không tự chốt tiền.' : 'Final report uses real evidence for Kael review and does not settle payment.'}
        title={language === 'vi' ? 'Báo cáo công việc' : 'Work report'}
      />
      <View style={styles.metricStack} testID="worker-summary-report-evidence">
        <MetricRow label={language === 'vi' ? 'Ghi chú' : 'Notes'} testID="worker-summary-report-note" value={note} />
        <MetricRow label={language === 'vi' ? 'Ảnh' : 'Photos'} testID="worker-summary-report-media" value={formatEvidenceCount(photoCount, language)} />
        <MetricRow label={language === 'vi' ? 'Đối soát' : 'Review'} testID="worker-summary-report-review-state" value={completionReviewStatusLabel(deal, language)} />
      </View>
      <View style={styles.workerSummaryChecklist} testID="worker-summary-report-checklist">
        {items.map((item, index) => (
          <WorkerReportChecklistItem
            done={item.done}
            key={`${item.label}-${index}`}
            label={item.label}
            testID={`worker-summary-report-checklist-item-${index}`}
          />
        ))}
      </View>
      <KaelButton
        disabled={!hasEvidence || reportSent}
        label={reportSent ? (language === 'vi' ? 'Đã gửi báo cáo' : 'Report sent') : (language === 'vi' ? 'Gửi báo cáo' : 'Send report')}
        onPress={() => {
          setReportSent(true)
          onSubmitReport()
        }}
        testID="worker-summary-report-submit"
      />
    </View>
  )
}

function WorkerMoneyFlow({
  deal,
  initialStep,
  onBackToWallet,
  onOpenWithdraw,
  workerEarnings,
}: {
  deal: LocalDeal | null
  initialStep: WorkerMoneyStep
  onBackToWallet?: () => void
  onOpenWithdraw?: () => void
  workerEarnings: WorkerEarningsSnapshot
}) {
  const language = useAppLanguage()
  const snapshot = buildWorkerMoneySnapshot(deal, workerEarnings, language)

  return (
    <View style={styles.workerMoneyFlowStack} testID="worker-money-flow">
      {initialStep === 'wallet' ? <WorkerMoneyWalletScreen onOpenWithdraw={onOpenWithdraw} snapshot={snapshot} /> : null}
      {initialStep === 'method' ? <WorkerMoneyMethodScreen snapshot={snapshot} /> : null}
      {initialStep === 'withdraw' ? <WorkerMoneyWithdrawScreen onBackToWallet={onBackToWallet} snapshot={snapshot} /> : null}
    </View>
  )
}

function WorkerMoneyWalletScreen({ onOpenWithdraw, snapshot }: { onOpenWithdraw?: () => void; snapshot: WorkerMoneySnapshot }) {
  const language = useAppLanguage()
  const { reduceTransparency } = useGlassAccessibility()
  const withdrawDisabled = !onOpenWithdraw && !snapshot.canRequestWithdrawal
  return (
    <View style={[styles.workerMoneyScreenCard, styles.workerMoneyWalletSurface, reduceTransparency ? styles.workerMoneyWalletSurfaceOpaque : null]} testID="worker-money-wallet-screen">
      {!reduceTransparency ? <WorkerMoneyWalletMintAura /> : null}
      {!reduceTransparency ? <View pointerEvents="none" style={styles.workerMoneyWalletGlassVeil} testID="worker-money-wallet-glass-veil" /> : null}
      {!reduceTransparency ? <View pointerEvents="none" style={styles.workerMoneyWalletTopLens} testID="worker-money-wallet-top-lens" /> : null}
      {!reduceTransparency ? <View pointerEvents="none" style={styles.workerMoneyWalletBottomLens} testID="worker-money-wallet-bottom-lens" /> : null}
      <View pointerEvents="none" style={styles.workerMoneyWalletSurfaceHighlight} testID="worker-money-wallet-surface-highlight" />
      <View style={styles.workerMoneyWalletTitle} testID="worker-money-wallet-title">
        <KaelText variant="h3" style={styles.workerMoneyWalletTitleText}>{language === 'vi' ? 'Ví thu nhập' : 'Income wallet'}</KaelText>
      </View>
      <View style={styles.workerMoneyWalletHero} testID="worker-money-wallet-hero">
        <Svg pointerEvents="none" style={StyleSheet.absoluteFill} testID="worker-money-wallet-hero-gradient">
          <Defs>
            <LinearGradient id="workerMoneyWalletHeroGradient" x1="0" y1="0" x2="1" y2="1">
              <Stop offset={0} stopColor={color.brand.primary} stopOpacity={1} />
              <Stop offset={0.46} stopColor={color.brand.primaryDark} stopOpacity={1} />
              <Stop offset={1} stopColor={color.mint.mint800} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#workerMoneyWalletHeroGradient)" />
        </Svg>
        <View pointerEvents="none" style={styles.workerMoneyHeroMintLayer} testID="worker-money-wallet-hero-mint-layer" />
        <View pointerEvents="none" style={styles.workerMoneyHeroEmeraldLayer} testID="worker-money-wallet-hero-emerald-layer" />
        <View pointerEvents="none" style={styles.workerMoneyHeroDeepLayer} testID="worker-money-wallet-hero-deep-layer" />
        <View pointerEvents="none" style={styles.workerMoneyHeroLensBand} testID="worker-money-wallet-hero-lens-band" />
        <View pointerEvents="none" style={styles.workerMoneyHeroSpecularLine} testID="worker-money-wallet-hero-specular-line" />
        <View style={styles.workerMoneyHeroTopRow}>
          <View style={[styles.workerMoneyWalletCopy, styles.workerMoneyHeroBalanceCopy]}>
            <KaelText tone="inverse" variant="caption">{language === 'vi' ? 'Số dư khả dụng' : 'Available balance'}</KaelText>
            <WorkerMoneyAnimatedAmount language={language} value={snapshot.availableRaw} />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: withdrawDisabled }}
            disabled={withdrawDisabled}
            onPress={onOpenWithdraw ?? (() => {})}
            style={[styles.workerMoneyHeroAction, withdrawDisabled ? styles.workerMoneyActionDisabled : null]}
            testID="worker-money-wallet-withdraw-action"
          >
            <KaelText numberOfLines={1} tone="strong" variant="caption" style={styles.workerMoneyHeroActionText}>{language === 'vi' ? 'Rút tiền' : 'Withdraw'}</KaelText>
          </Pressable>
        </View>
        <View style={styles.workerMoneyHeroMetrics} testID="worker-money-wallet-hero-metrics">
          <View style={styles.workerMoneyHeroMetricCell} testID="worker-money-wallet-pending">
            <KaelText tone="inverse" variant="caption">{language === 'vi' ? 'Đang chờ hoàn tất' : 'Pending completion'}</KaelText>
            <KaelText tone="inverse" variant="label" style={styles.workerMoneyHeroMetricValue}>{snapshot.pending}</KaelText>
          </View>
          <View style={styles.workerMoneyHeroMetricDivider} />
          <View style={styles.workerMoneyHeroMetricCell} testID="worker-money-wallet-settled">
            <KaelText tone="inverse" variant="caption">{language === 'vi' ? 'Đã rút (30 ngày)' : 'Withdrawn (30d)'}</KaelText>
            <KaelText tone="inverse" variant="label" style={styles.workerMoneyHeroMetricValue}>{snapshot.settled}</KaelText>
          </View>
        </View>
      </View>
      <KaelText variant="label" tone="strong" style={styles.workerMoneyReadySectionTitle} testID="worker-money-wallet-ready-heading">
        {language === 'vi' ? 'Khoản tiền sẵn sàng rút' : 'Ready to withdraw'}
      </KaelText>
      <View style={styles.workerMoneyReadyCard} testID="worker-money-wallet-ready-card">
        <View style={styles.workerMoneyReadyTopRow}>
          <Image
            source={snapshot.serviceImageUri ? { uri: snapshot.serviceImageUri } : snapshot.serviceIcon}
            style={styles.workerMoneyReadyThumb}
            resizeMode={snapshot.serviceImageUri ? 'cover' : 'contain'}
            testID="worker-money-wallet-ready-thumb"
          />
          <View style={styles.workerMoneyReadyMainCopy}>
            <KaelText numberOfLines={1} tone="strong" variant="label" style={styles.workerMoneyReadyServiceTitle} testID="worker-money-wallet-ready-service">{snapshot.serviceTitle}</KaelText>
            <KaelText numberOfLines={1} tone="secondary" variant="caption" testID="worker-money-wallet-ready-code">{snapshot.jobCode}</KaelText>
          </View>
          <View style={styles.workerMoneyReadyAmountStack}>
            <KaelText numberOfLines={1} variant="label" tone="strong" style={styles.workerMoneyReadyAmount} testID="worker-money-wallet-ready-amount">{snapshot.readyToWithdraw}</KaelText>
            <View style={styles.workerMoneyReadyStatusPill} testID="worker-money-wallet-ready-status-pill">
              <KaelText numberOfLines={1} tone="strong" variant="caption" style={styles.workerMoneyReadyStatusText} testID="worker-money-wallet-ready-status">{snapshot.payoutStatusLabel}</KaelText>
            </View>
          </View>
        </View>
        {snapshot.completionTimeLabel ? (
          <KaelText tone="secondary" variant="caption" testID="worker-money-wallet-ready-completed">
            {language === 'vi' ? `Hoàn thành: ${snapshot.completionTimeLabel}` : `Completed: ${snapshot.completionTimeLabel}`}
          </KaelText>
        ) : null}
        <View style={styles.workerMoneyReadyConfirmRow} testID="worker-money-wallet-ready-confirm-row">
          {snapshot.customerConfirmed ? <CheckMarkSmall /> : <View style={styles.workerSummaryPendingDot} />}
          <KaelText tone={snapshot.customerConfirmed ? 'strong' : 'secondary'} variant="caption" testID="worker-money-wallet-ready-confirmed">{snapshot.customerConfirmedLabel}</KaelText>
        </View>
      </View>
      <WorkerMoneyTransactionList rows={snapshot.recentTransactions} />
      <View style={styles.workerMoneyBreakdownCard} testID="worker-money-wallet-breakdown">
        <View style={styles.workerMoneyBreakdownHeader}>
          <Image source={workerIcons.shield} style={styles.workerMoneyIncomeIcon} resizeMode="contain" />
          <KaelText variant="label" tone="strong" style={styles.workerMoneyBreakdownTitle}>{language === 'vi' ? 'Thu nhập của bạn' : 'Your income'}</KaelText>
        </View>
        <View style={styles.workerMoneyIncomeRows}>
          <WorkerMoneyIncomeRow label={language === 'vi' ? 'Tổng thu trước phí' : 'Gross before fee'} showDivider={false} testID="worker-money-wallet-gross" value={snapshot.gross} />
          <WorkerMoneyIncomeRow label={language === 'vi' ? 'Phí nền tảng (8%)' : 'Platform fee (8%)'} testID="worker-money-wallet-fee" value={workerMoneyFeeLabel(snapshot.platformFee, language)} />
          <WorkerMoneyIncomeRow emphasis label={language === 'vi' ? 'Bạn nhận được' : 'You receive'} testID="worker-money-wallet-net" value={snapshot.workerNet} />
        </View>
      </View>
    </View>
  )
}

function WorkerMoneyWalletMintAura() {
  return (
    <View pointerEvents="none" style={styles.workerMoneyWalletSurfaceAura} testID="worker-money-wallet-surface-mint-aura">
      <Svg height="100%" width="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="worker-money-wallet-component-aura" cx="72%" cy="18%" r="82%">
            <Stop offset="0%" stopColor={color.mint.mint300} stopOpacity={0.3} />
            <Stop offset="34%" stopColor={color.mint.auraSoft} stopOpacity={0.18} />
            <Stop offset="68%" stopColor={color.surface.base} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill="url(#worker-money-wallet-component-aura)" />
      </Svg>
    </View>
  )
}

function WorkerMoneyAnimatedAmount({ language, value }: { language: AppLanguage; value: number }) {
  const { reduceMotion } = useGlassAccessibility()
  const targetValue = hasPositivePaymentAmount(value) ? value : 0
  const [displayValue, setDisplayValue] = useState(0)
  const displayValueRef = useRef(0)

  useEffect(() => {
    const startValue = displayValueRef.current
    if (reduceMotion || startValue === targetValue) {
      displayValueRef.current = targetValue
      setDisplayValue(targetValue)
      return undefined
    }

    let frameId: number | null = null
    const startedAt = Date.now()
    const duration = motionTokens.entrance.durationMs

    const tick = () => {
      const progress = Math.min(1, (Date.now() - startedAt) / duration)
      const easedProgress = 1 - Math.pow(1 - progress, 3)
      const nextValue = Math.round(startValue + (targetValue - startValue) * easedProgress)
      displayValueRef.current = nextValue
      setDisplayValue(nextValue)

      if (progress < 1) {
        frameId = requestAnimationFrame(tick)
      }
    }

    frameId = requestAnimationFrame(tick)
    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId)
    }
  }, [reduceMotion, targetValue])

  return (
    <KaelText tone="inverse" variant="h2" style={styles.workerMoneyAmountOnDark} testID="worker-money-wallet-available">
      {formatVnd(displayValue, language)}
    </KaelText>
  )
}

function WorkerMoneyMethodScreen({ snapshot }: { snapshot: WorkerMoneySnapshot }) {
  const language = useAppLanguage()
  return (
    <View style={styles.workerMoneyScreenCard} testID="worker-money-method-screen">
      <View style={styles.workerJobsCardChrome} testID="worker-jobs-card-liquid-chrome" />
      <View style={styles.workerJobsCardKeyline} testID="worker-jobs-card-operational-keyline" />
      <View style={styles.workerJobsCardCrispMarker} testID="worker-jobs-card-crisp-shell" />
      <SectionHeading
        subtitle={language === 'vi' ? 'Tiền chỉ được chuyển về phương thức đã xác minh.' : 'Money can be sent only to a verified receiving method.'}
        title={language === 'vi' ? 'Phương thức nhận tiền' : 'Receiving method'}
      />
      <View style={styles.workerMoneyMethodPanel} testID="worker-money-method-current-card">
        <Image source={workerIcons.shield} style={styles.workerMoneyMethodIcon} resizeMode="contain" />
        <View style={styles.workerMoneyWalletCopy}>
          <KaelText variant="label" testID="worker-money-method-current">{snapshot.receivingMethodLabel}</KaelText>
          <KaelText tone="secondary" variant="caption" testID="worker-money-method-subtitle">{snapshot.receivingMethodNote}</KaelText>
        </View>
        <KaelBadge label={snapshot.receivingVerifiedLabel} variant={snapshot.hasVerifiedReceivingMethod ? 'mint' : 'neutral'} />
      </View>
      <View style={styles.metricStack} testID="worker-money-method-ledger">
        <MetricRow label={language === 'vi' ? 'Chủ tài khoản' : 'Account holder'} testID="worker-money-method-holder" value={snapshot.receivingHolder} />
        <MetricRow label={language === 'vi' ? 'Ngân hàng / ví' : 'Bank / wallet'} testID="worker-money-method-provider" value={snapshot.receivingProvider} />
        <MetricRow label={language === 'vi' ? 'Chi nhánh' : 'Branch'} testID="worker-money-method-branch" value={snapshot.receivingBranch} />
      </View>
      <KaelButton
        disabled
        label={language === 'vi' ? 'Thêm phương thức nhận tiền' : 'Add receiving method'}
        onPress={() => {}}
        testID="worker-money-method-add-action"
        variant="secondary"
      />
      <View style={styles.workerMoneySecurityCard} testID="worker-money-method-security">
        <Image source={workerIcons.shield} style={styles.workerMoneyMiniIcon} resizeMode="contain" />
        <View style={styles.workerMoneyWalletCopy}>
          <KaelText variant="label">{language === 'vi' ? 'An toàn & bảo mật' : 'Safety and security'}</KaelText>
          <WorkerMoneyCheckLine done label={language === 'vi' ? 'Chỉ phương thức đã xác minh mới được nhận tiền' : 'Only verified methods can receive money'} />
          <WorkerMoneyCheckLine done label={language === 'vi' ? 'Thông tin nhận tiền được bảo vệ trong hệ thống' : 'Receiving information is protected in the system'} />
          <WorkerMoneyCheckLine done={snapshot.hasVerifiedReceivingMethod} label={language === 'vi' ? 'Đủ điều kiện rút tiền' : 'Eligible for withdrawal'} />
        </View>
      </View>
      <KaelButton
        disabled={!snapshot.hasVerifiedReceivingMethod}
        label={language === 'vi' ? 'Tiếp tục rút tiền' : 'Continue withdrawal'}
        onPress={() => {}}
        testID="worker-money-method-withdraw-action"
      />
    </View>
  )
}

function WorkerMoneyWithdrawScreen({ onBackToWallet, snapshot }: { onBackToWallet?: () => void; snapshot: WorkerMoneySnapshot }) {
  const language = useAppLanguage()
  return (
    <View style={styles.workerMoneyScreenCard} testID="worker-money-withdraw-screen">
      {onBackToWallet ? (
        <Pressable accessibilityRole="button" onPress={onBackToWallet} style={styles.workerMoneyBackAction} testID="worker-money-withdraw-back-action">
          <KaelText tone="strong" variant="caption">{language === 'vi' ? '‹ Ví thu nhập' : '‹ Income wallet'}</KaelText>
        </Pressable>
      ) : null}
      <View style={styles.workerJobsCardChrome} testID="worker-jobs-card-liquid-chrome" />
      <View style={styles.workerJobsCardKeyline} testID="worker-jobs-card-operational-keyline" />
      <View style={styles.workerJobsCardCrispMarker} testID="worker-jobs-card-crisp-shell" />
      <SectionHeading
        subtitle={language === 'vi' ? 'Tạo yêu cầu rút tiền khi ví có số dư và phương thức nhận tiền đã xác minh.' : 'Request payout when balance and receiving method are ready.'}
        title={language === 'vi' ? 'Rút tiền / Giải ngân' : 'Withdraw / payout'}
      />
      <View style={styles.workerMoneyWithdrawHero} testID="worker-money-withdraw-hero">
        <View style={styles.workerMoneyWalletCopy}>
          <KaelText tone="secondary" variant="caption">{language === 'vi' ? 'Số dư khả dụng' : 'Available balance'}</KaelText>
          <KaelText variant="h1" style={styles.workerMoneyAmount} testID="worker-money-withdraw-available">{snapshot.available}</KaelText>
        </View>
        <Image source={workerIcons.wallet} style={styles.workerMoneyCashIcon} resizeMode="contain" />
      </View>
      <View style={styles.workerMoneyMethodPanel} testID="worker-money-withdraw-method-card">
        <Image source={workerIcons.shield} style={styles.workerMoneyMethodIcon} resizeMode="contain" />
        <View style={styles.workerMoneyWalletCopy}>
          <KaelText variant="label" testID="worker-money-withdraw-method">{snapshot.receivingMethodLabel}</KaelText>
          <KaelText tone="secondary" variant="caption" testID="worker-money-withdraw-holder">{snapshot.receivingHolder}</KaelText>
        </View>
        <Pressable accessibilityRole="button" onPress={() => {}} style={styles.workerMoneyTextAction} testID="worker-money-withdraw-change-method">
          <KaelText tone="strong" variant="caption">{language === 'vi' ? 'Thay đổi' : 'Change'}</KaelText>
        </Pressable>
      </View>
      <KaelText variant="label">{language === 'vi' ? 'Số tiền rút' : 'Withdrawal amount'}</KaelText>
      <View style={styles.workerMoneyChipRow} testID="worker-money-withdraw-amount-chips">
        {snapshot.withdrawChips.map((chip, index) => (
          <View key={`${chip}-${index}`} style={styles.workerMoneyAmountChip} testID={`worker-money-withdraw-chip-${index}`}>
            <KaelText numberOfLines={1} tone="secondary" variant="caption">{chip}</KaelText>
          </View>
        ))}
      </View>
      <KaelTextField
        editable={false}
        inputShellTestID="worker-money-withdraw-input"
        label={language === 'vi' ? 'Nhập số tiền cần rút' : 'Enter withdrawal amount'}
        placeholder={snapshot.canRequestWithdrawal ? snapshot.available : copy[language].dataPending}
        value=""
      />
      <View style={styles.metricStack} testID="worker-money-withdraw-ledger">
        <MetricRow label={language === 'vi' ? 'Phí rút tiền' : 'Withdrawal fee'} testID="worker-money-withdraw-fee" value={snapshot.withdrawalFee} />
        <MetricRow label={language === 'vi' ? 'Thời gian xử lý' : 'Processing time'} testID="worker-money-withdraw-processing" value={snapshot.processingTime} />
        <MetricRow label={language === 'vi' ? 'Số tiền bạn nhận' : 'Amount you receive'} testID="worker-money-withdraw-net" value={snapshot.withdrawReceiveAmount} />
      </View>
      <View style={styles.workerMoneyInfoNote} testID="worker-money-withdraw-info">
        <KaelText tone="secondary" variant="caption">{snapshot.withdrawInfo}</KaelText>
      </View>
      <KaelButton
        disabled={!snapshot.canRequestWithdrawal}
        label={language === 'vi' ? 'Xác nhận rút tiền' : 'Confirm withdrawal'}
        onPress={() => {}}
        testID="worker-money-withdraw-submit"
      />
      <View style={styles.workerMoneyRecentRequest} testID="worker-money-withdraw-recent">
        <KaelText variant="label">{language === 'vi' ? 'Yêu cầu gần đây' : 'Recent request'}</KaelText>
        <KaelText tone="secondary" variant="caption">{snapshot.recentPayoutRequest}</KaelText>
      </View>
    </View>
  )
}

function WorkerMoneyTransactionList({ rows }: { rows: Array<{ label: string; value: string; detail: string }> }) {
  const language = useAppLanguage()
  const [showAll, setShowAll] = useState(false)
  const [showEmptyHistory, setShowEmptyHistory] = useState(false)
  const emptyLabel = language === 'vi' ? 'Chưa có giao dịch' : 'No transactions yet'
  const emptyDetail = language === 'vi' ? 'Danh sách cập nhật từ hệ thống' : 'Updated from the system'
  const emptyHistoryDetail = language === 'vi' ? 'Chưa có giao dịch đối soát để xem.' : 'No reconciled transactions to show yet.'
  const visibleRows = showAll ? rows : rows.slice(0, 3)
  const actionLabel = showAll
    ? (language === 'vi' ? 'Thu gọn' : 'Collapse')
    : (language === 'vi' ? 'Xem tất cả' : 'View all')
  const handleViewAllPress = () => {
    if (rows.length === 0) {
      setShowEmptyHistory(true)
      return
    }
    setShowAll((current) => !current)
  }
  return (
    <View style={styles.workerMoneyTransactions} testID="worker-money-wallet-transactions">
      <View style={styles.workerMoneySubHeader}>
        <KaelText tone="strong" variant="label" style={styles.workerMoneySubHeaderTitle}>{language === 'vi' ? 'Giao dịch gần đây' : 'Recent transactions'}</KaelText>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showAll }}
          onPress={handleViewAllPress}
          style={styles.workerMoneyViewAllAction}
          testID="worker-money-wallet-transactions-view-all"
        >
          <KaelText tone="strong" variant="caption" style={[styles.workerMoneyTransactionPositive, styles.workerMoneyViewAllText]}>{actionLabel}</KaelText>
        </Pressable>
      </View>
      {visibleRows.length > 0 ? visibleRows.map((row, index) => (
        <View key={`${row.label}-${index}`} style={styles.workerMoneyTransactionRow} testID={`worker-money-wallet-transaction-${index}`}>
          <View style={styles.workerMoneyTransactionSign}>
            <KaelText tone="strong" variant="caption" style={styles.workerMoneyTransactionSignText}>+</KaelText>
          </View>
          <View style={styles.workerMoneyWalletCopy}>
            <KaelText variant="caption" tone="strong">{row.label}</KaelText>
            <KaelText tone="secondary" variant="caption">{language === 'vi' ? 'Đã đối soát' : 'Reconciled'}</KaelText>
          </View>
          <View style={styles.workerMoneyTransactionAmountStack}>
            <KaelText variant="caption" tone="strong" style={styles.workerMoneyTransactionPositive}>{row.value}</KaelText>
            <KaelText tone="secondary" variant="caption">{row.detail}</KaelText>
          </View>
        </View>
      )) : (
        <View style={[styles.workerMoneyTransactionRow, styles.workerMoneyTransactionEmptyRow]} testID="worker-money-wallet-empty-transactions">
          <View style={[styles.workerMoneyTransactionSign, styles.workerMoneyTransactionSignAccent]}>
            <KaelText tone="strong" variant="caption" style={styles.workerMoneyTransactionSignText}>+</KaelText>
          </View>
          <View style={styles.workerMoneyWalletCopy}>
            <KaelText variant="caption" tone="strong" style={styles.workerMoneyTransactionEmptyTitle}>{emptyLabel}</KaelText>
            <KaelText tone="secondary" variant="caption" testID="worker-money-wallet-empty-transactions-detail">{showEmptyHistory ? emptyHistoryDetail : emptyDetail}</KaelText>
          </View>
          <View style={styles.workerMoneyTransactionAmountStack} testID="worker-money-wallet-empty-amount-slot" />
        </View>
      )}
    </View>
  )
}

function WorkerMoneyIncomeRow({ emphasis = false, label, showDivider = true, testID, value }: { emphasis?: boolean; label: string; showDivider?: boolean; testID: string; value: string }) {
  return (
    <View style={[styles.workerMoneyIncomeRow, showDivider && !emphasis ? styles.workerMoneyIncomeRowDivider : null, emphasis ? styles.workerMoneyIncomeRowEmphasis : null]} testID={testID}>
      <KaelText tone={emphasis ? 'strong' : 'secondary'} variant={emphasis ? 'body' : 'label'} style={[styles.workerMoneyIncomeLabel, emphasis ? styles.workerMoneyIncomeLabelEmphasis : null]}>{label}</KaelText>
      <KaelText variant={emphasis ? 'body' : 'label'} tone="strong" style={[styles.workerMoneyIncomeValue, emphasis ? styles.workerMoneyIncomeValueEmphasis : null]}>{value}</KaelText>
    </View>
  )
}

function WorkerMoneyCheckLine({ done, label }: { done: boolean; label: string }) {
  return (
    <View style={styles.workerMoneyCheckLine}>
      {done ? <CheckMarkSmall /> : <View style={styles.workerSummaryPendingDot} />}
      <KaelText tone={done ? 'strong' : 'secondary'} variant="caption">{label}</KaelText>
    </View>
  )
}

function WorkerCaseClosedCard({
  deal,
  onOpenEarnings,
  onReturnHome,
}: {
  deal: LocalDeal | null
  onOpenEarnings: () => void
  onReturnHome: () => void
}) {
  const language = useAppLanguage()
  const payment = deal?.payment ?? null
  const photoCount = displayableCompletionPhotoCount(deal)
  const note = displayableCompletionNote(deal, language)
  const evidenceLocked = hasDisplayableCompletionEvidence(deal)
  const paymentConfirmed = Boolean(payment && ['received', 'reconciled'].includes(payment.status))
  const paymentReconciled = payment?.status === 'reconciled'
  const commissionReady = hasPositivePaymentAmount(payment?.platformFee) && hasPositivePaymentAmount(payment?.workerNet)
  const earningsReady = paymentReconciled && hasPositivePaymentAmount(payment?.workerNet)
  const caseClosed = evidenceLocked && paymentConfirmed
  const items = [
    {
      done: evidenceLocked,
      label: evidenceLocked
        ? (language === 'vi' ? 'Bằng chứng hoàn tất đã khóa theo ca' : 'Completion evidence locked to the job')
        : (language === 'vi' ? 'Chờ đủ bằng chứng hoàn tất' : 'Waiting for completion evidence'),
    },
    {
      done: paymentConfirmed,
      label: paymentConfirmed
        ? (language === 'vi' ? 'Xác nhận thanh toán đã được ghi nhận' : 'Payment confirmation recorded')
        : (language === 'vi' ? 'Chờ xác nhận thanh toán' : 'Waiting for payment confirmation'),
    },
    {
      done: commissionReady,
      label: commissionReady
        ? (language === 'vi' ? 'Hoa hồng đã có dữ liệu đối soát' : 'Commission data is ready')
        : (language === 'vi' ? 'Hoa hồng chờ dữ liệu đối soát' : 'Commission waits for reconciliation data'),
    },
    {
      done: earningsReady,
      label: earningsReady
        ? (language === 'vi' ? 'Thu nhập đã sẵn sàng tất toán' : 'Earnings are ready for payout')
        : (language === 'vi' ? 'Thu nhập chờ đối soát trước khi tất toán' : 'Earnings wait for payout reconciliation'),
    },
  ]
  return (
    <View style={styles.workerNeedsCard} testID="worker-case-closed-card">
      <View style={styles.workerJobsCardChrome} testID="worker-jobs-card-liquid-chrome" />
      <View style={styles.workerJobsCardKeyline} testID="worker-jobs-card-operational-keyline" />
      <View style={styles.workerJobsCardCrispMarker} testID="worker-jobs-card-crisp-shell" />
      <SectionHeading
        subtitle={workerCaseClosedSubtitle({ caseClosed, evidenceLocked, language, paymentConfirmed })}
        title={language === 'vi' ? 'Kết thúc giải quyết công việc' : 'Work case closed'}
      />
      <View style={styles.metricStack} testID="worker-case-closed-ledger">
        <MetricRow label={language === 'vi' ? 'Giải quyết công việc' : 'Work case'} testID="worker-case-closed-status" value={workerCaseClosedStatusLabel({ caseClosed, evidenceLocked, language, paymentConfirmed })} />
        <MetricRow label={language === 'vi' ? 'Thanh toán' : 'Payment'} testID="worker-case-closed-payment" value={workerCasePaymentLabel(payment, language)} />
        <MetricRow label={language === 'vi' ? 'Thu nhập' : 'Earnings'} testID="worker-case-closed-earnings" value={workerCaseEarningsLabel(payment, language)} />
        <MetricRow label={language === 'vi' ? 'Ghi chú' : 'Notes'} testID="worker-case-closed-note" value={note} />
        <MetricRow label={language === 'vi' ? 'Ảnh' : 'Photos'} testID="worker-case-closed-media" value={formatEvidenceCount(photoCount, language)} />
      </View>
      <View style={styles.workerSummaryChecklist} testID="worker-case-closed-checklist">
        {items.map((item, index) => (
          <WorkerReportChecklistItem
            done={item.done}
            key={`${item.label}-${index}`}
            label={item.label}
            testID={`worker-case-closed-checklist-item-${index}`}
          />
        ))}
      </View>
      <View style={styles.actionRow}>
        <KaelButton
          label={language === 'vi' ? 'Về trang chủ' : 'Back home'}
          onPress={onReturnHome}
          size="small"
          testID="worker-case-closed-home-action"
        />
        <KaelButton
          label={language === 'vi' ? 'Xem thu nhập' : 'View earnings'}
          onPress={onOpenEarnings}
          size="small"
          testID="worker-case-closed-earnings-action"
          variant="secondary"
        />
      </View>
    </View>
  )
}

function workerCaseClosedSubtitle({
  caseClosed,
  evidenceLocked,
  language,
  paymentConfirmed,
}: {
  caseClosed: boolean
  evidenceLocked: boolean
  language: AppLanguage
  paymentConfirmed: boolean
}) {
  if (caseClosed) {
    return language === 'vi'
      ? 'Giải quyết công việc đã đóng sau khi xác nhận thanh toán được ghi nhận. Thu nhập tiếp tục đi qua đối soát.'
      : 'The work case is closed after payment confirmation is recorded. Earnings continue through reconciliation.'
  }
  if (evidenceLocked && paymentConfirmed) {
    return language === 'vi'
      ? 'Đã ghi nhận thanh toán, đang chờ dữ liệu đối soát thu nhập.'
      : 'Payment confirmation is recorded, waiting for payout reconciliation data.'
  }
  if (evidenceLocked) {
    return language === 'vi'
      ? 'Bằng chứng hoàn tất đã đủ, đang chờ xác nhận thanh toán.'
      : 'Completion evidence is ready, waiting for payment confirmation.'
  }
  return language === 'vi'
    ? 'Chưa đủ dữ liệu để đóng giải quyết công việc.'
    : 'Not enough data to close the work case.'
}

function workerCaseClosedStatusLabel({
  caseClosed,
  evidenceLocked,
  language,
  paymentConfirmed,
}: {
  caseClosed: boolean
  evidenceLocked: boolean
  language: AppLanguage
  paymentConfirmed: boolean
}) {
  if (caseClosed) return language === 'vi' ? 'Đã đèng' : 'Closed'
  if (evidenceLocked && paymentConfirmed) return language === 'vi' ? 'Chờ đối soát' : 'Waiting for reconciliation'
  if (evidenceLocked) return language === 'vi' ? 'Chờ thanh toán' : 'Waiting for payment'
  return copy[language].dataPending
}

function workerCasePaymentLabel(payment: LocalDealPayment | null, language: AppLanguage) {
  if (!payment) return copy[language].dataPending
  if (payment.status === 'reconciled') {
    return language === 'vi' ? 'Đã đối soát' : 'Reconciled'
  }
  if (payment.status === 'received') {
    const amountReceived = payment.amountReceived
    const receivedAmount = hasPositivePaymentAmount(amountReceived)
      ? formatVnd(amountReceived, language)
      : null
    if (receivedAmount) return language === 'vi' ? `Đã nhận ${receivedAmount}` : `Received ${receivedAmount}`
    return language === 'vi' ? 'Đã ghi nhận xác nhận' : 'Confirmation recorded'
  }
  return moneyStatusLabel(payment.status, language)
}

function workerCaseEarningsLabel(payment: LocalDealPayment | null, language: AppLanguage) {
  if (!payment) return copy[language].dataPending
  const workerNetAmount = payment.workerNet
  if (!hasPositivePaymentAmount(workerNetAmount)) {
    return ['received', 'reconciled'].includes(payment.status)
      ? (language === 'vi' ? 'Chờ dữ liệu đối soát' : 'Waiting for reconciliation data')
      : copy[language].dataPending
  }
  const workerNet = formatVnd(workerNetAmount, language)
  if (payment.status === 'reconciled') return workerNet
  return language === 'vi' ? `${workerNet} · chờ đối soát` : `${workerNet} · waiting reconciliation`
}

function buildWorkerMoneySnapshot(
  deal: LocalDeal | null,
  workerEarnings: WorkerEarningsSnapshot,
  language: AppLanguage,
): WorkerMoneySnapshot {
  const payment = deal?.payment ?? null
  const paymentReconciled = payment?.status === 'reconciled'
  const availableRaw = firstPositiveNumber(
    paymentReconciled ? payment?.workerNet : null,
    workerEarnings?.net_earnings,
  ) ?? 0
  const pendingRaw = firstPositiveNumber(
    workerEarnings?.pending_payment_amount,
    payment && !paymentReconciled ? payment.workerNet : null,
  )
  const settledRaw = firstPositiveNumber(workerEarnings?.net_earnings)
  const readyRaw = paymentReconciled ? firstPositiveNumber(payment?.workerNet, workerEarnings?.net_earnings) : null
  const hasVerifiedReceivingMethod = false
  const canRequestWithdrawal = hasVerifiedReceivingMethod && hasPositivePaymentAmount(availableRaw)
  const serviceType = deal?.draft.serviceType ?? deal?.broadcast?.serviceType ?? null
  const customerConfirmed = workerMoneyCustomerConfirmed(deal, payment)
  return {
    available: formatVndOrZero(availableRaw, language),
    availableRaw,
    canRequestWithdrawal,
    completionTimeLabel: workerMoneyCompletionTimeLabel(payment?.receivedAt ?? payment?.updatedAt, language),
    customerConfirmed,
    customerConfirmedLabel: customerConfirmed
      ? (language === 'vi' ? 'Khách đã xác nhận' : 'Customer confirmed')
      : (language === 'vi' ? 'Chờ khách xác nhận' : 'Waiting for customer confirmation'),
    gross: formatVndOrZero(firstPositiveNumber(payment?.grossAmount, workerEarnings?.gross_earnings), language),
    hasVerifiedReceivingMethod,
    jobCode: workerMoneyJobCode(deal, language),
    pending: formatVndOrZero(pendingRaw, language),
    payoutStatusLabel: workerMoneyPayoutStatusLabel(payment, readyRaw, language),
    platformFee: formatVndOrZero(firstPositiveNumber(payment?.platformFee, workerEarnings?.platform_fee_total), language),
    processingTime: copy[language].dataPending,
    readyToWithdraw: formatVndOrZero(readyRaw, language),
    receivingBranch: copy[language].dataPending,
    receivingHolder: copy[language].dataPending,
    receivingMethodLabel: copy[language].dataPending,
    receivingMethodNote: language === 'vi'
      ? 'Chưa có phương thức nhận tiền thật từ hệ thống.'
      : 'No real receiving method from the system yet.',
    receivingProvider: copy[language].dataPending,
    receivingVerifiedLabel: copy[language].dataPending,
    recentPayoutRequest: language === 'vi'
      ? 'Chưa có yêu cầu rút tiền thật từ hệ thống.'
      : 'No real payout request from the system yet.',
    recentTransactions: workerMoneyRecentTransactions(workerEarnings, language),
    serviceIcon: serviceType ? workerServiceIcons[serviceType] : workerIcons.jobs,
    serviceImageUri: safeImageUri(deal?.completionPhotoUrls?.[0]),
    serviceTitle: workerMoneyServiceTitle(deal, language),
    settled: formatVndOrZero(settledRaw, language),
    withdrawChips: workerMoneyWithdrawChips(availableRaw, language),
    withdrawInfo: canRequestWithdrawal
      ? (language === 'vi' ? 'Yêu cầu rút tiền sẽ được xử lý theo trạng thái ví và phương thức đã xác minh.' : 'The payout request follows wallet and verified method state.')
      : (language === 'vi' ? 'Rút tiền sẽ mở khi có số dư khả dụng và phương thức nhận tiền đã xác minh.' : 'Withdrawal opens when balance and receiving method are ready.'),
    withdrawalFee: copy[language].dataPending,
    withdrawReceiveAmount: canRequestWithdrawal ? formatVnd(availableRaw, language) : copy[language].dataPending,
    workerNet: formatVndOrZero(firstPositiveNumber(payment?.workerNet, workerEarnings?.net_earnings), language),
  }
}

function workerMoneyJobCode(deal: LocalDeal | null, language: AppLanguage) {
  const displayCode = deal?.displayCode?.trim()
  if (displayCode) return displayCode
  const jobId = deal?.broadcast?.jobId?.trim() || deal?.id?.trim()
  if (jobId && jobId !== LOCAL_DEAL_ID) return buildLocalJobDisplayCode({ jobId })
  return copy[language].dataPending
}

function workerMoneyServiceTitle(deal: LocalDeal | null, language: AppLanguage) {
  const serviceType = deal?.draft.serviceType ?? deal?.broadcast?.serviceType ?? null
  return serviceType ? serviceCopy[serviceType][language].label : copy[language].dataPending
}

function workerMoneyCustomerConfirmed(deal: LocalDeal | null, payment: LocalDealPayment | null) {
  return Boolean(
    deal && hasWorkerStatus(deal.status, ['confirmed_by_customer', 'payment_pending', 'paid', 'reviewed'])
  ) || ['received', 'reconciled'].includes(payment?.status ?? '')
}

function workerMoneyPayoutStatusLabel(payment: LocalDealPayment | null, readyRaw: number | null | undefined, language: AppLanguage) {
  if (payment?.status === 'reconciled' && hasPositivePaymentAmount(readyRaw)) {
    return language === 'vi' ? 'Sẵn sàng rút' : 'Ready to withdraw'
  }
  if (payment?.status === 'received' || payment?.status === 'reconciled') {
    return language === 'vi' ? 'Chờ đối soát' : 'Reconciling'
  }
  if (payment?.status === 'pending' || payment?.status === 'vietqr_ready') {
    return language === 'vi' ? 'Chờ thanh toán' : 'Payment pending'
  }
  return language === 'vi' ? 'Chờ thanh toán' : 'Payment pending'
}

function workerMoneyCompletionTimeLabel(value: string | null | undefined, language: AppLanguage) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const locale = language === 'vi' ? 'vi-VN' : 'en-US'
  const dateLabel = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
  const timeLabel = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
  return `${dateLabel} · ${timeLabel}`
}

function workerMoneyFeeLabel(value: string, language: AppLanguage) {
  if (isPendingText(value) || value === compactPendingLabel(language)) return value
  if (value === formatVnd(0, language)) return value
  return value.startsWith('-') ? value : `-${value}`
}

function workerMoneyRecentTransactions(workerEarnings: WorkerEarningsSnapshot, language: AppLanguage) {
  return (workerEarnings?.daily_earnings ?? [])
    .filter((row) => hasPositivePaymentAmount(row.net_earnings))
    .reverse()
    .map((row) => ({
      detail: formatBookingDateShort(row.date, language),
      label: language === 'vi' ? 'Thu nhập đã đối soát' : 'Reconciled income',
      value: `+${formatVnd(row.net_earnings, language)}`,
    }))
}

function workerMoneyWithdrawChips(availableRaw: number, language: AppLanguage) {
  if (!hasPositivePaymentAmount(availableRaw)) return [copy[language].dataPending]
  const baseValues = [availableRaw / 4, availableRaw / 2, availableRaw]
  const rounded = baseValues
    .map((value) => Math.max(1000, Math.floor(value / 1000) * 1000))
    .filter((value, index, values) => value > 0 && values.indexOf(value) === index)
  return rounded.map((value) => formatVnd(value, language))
}

function firstPositiveNumber(...values: Array<number | null | undefined>) {
  return values.find((value): value is number => hasPositivePaymentAmount(value)) ?? null
}

function hasPositivePaymentAmount(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function moneyStatusLabel(status: LocalDealPayment['status'], language: AppLanguage) {
  const vi: Record<LocalDealPayment['status'], string> = {
    amount_mismatch: 'Cần đối soát',
    code_requested: 'Đang tạo mã thanh toán',
    expired: 'Đã hết hạn',
    failed: 'Thanh toán lỗi',
    not_started: 'Chưa tạo mã thanh toán',
    pending: 'Chờ khách thanh toán',
    received: 'Đã nhận thanh toán',
    reconciled: 'Đã đối soát',
    vietqr_ready: 'Đang chờ chuyển khoản',
  }
  const en: Record<LocalDealPayment['status'], string> = {
    amount_mismatch: 'Needs reconciliation',
    code_requested: 'Creating payment code',
    expired: 'Expired',
    failed: 'Payment failed',
    not_started: 'Payment code not created',
    pending: 'Waiting for customer payment',
    received: 'Payment received',
    reconciled: 'Reconciled',
    vietqr_ready: 'Waiting for transfer',
  }
  return (language === 'vi' ? vi : en)[status]
}

function WorkerReportChecklistItem({
  done,
  label,
  testID,
}: {
  done: boolean
  label: string
  testID: string
}) {
  return (
    <View style={styles.workerSummaryChecklistItem} testID={testID}>
      {done ? <CheckMarkSmall /> : <View style={styles.workerSummaryPendingDot} />}
      <KaelText variant="caption" tone={done ? 'strong' : 'secondary'}>{label}</KaelText>
    </View>
  )
}

function WorkerProfileSectionBlock({ children, testID, title }: { children: ReactNode; testID?: string; title: string }) {
  return (
    <View style={styles.workerProfileSectionBlock} testID={testID}>
      <SectionHeading title={title} />
      <View style={styles.metricStack}>{children}</View>
    </View>
  )
}

function WorkerProfileReceivingMethodShortcut({
  language,
  onPress,
}: {
  language: AppLanguage
  onPress: () => void
}) {
  return (
    <KaelCard style={styles.workerProfileFunctionCard} testID="worker-profile-receiving-method-card">
      <View style={styles.workerProfileFunctionBody}>
        <IconTile source={workerIcons.wallet} small />
        <View style={styles.workerProfileFunctionText}>
          <KaelText variant="label">{language === 'vi' ? 'Phương thức nhận tiền' : 'Receiving method'}</KaelText>
          <KaelText tone="secondary" variant="caption">
            {language === 'vi'
              ? 'Tách riêng khỏi hồ sơ chính; dùng để kiểm tra tài khoản nhận tiền đã xác minh.'
              : 'Separate from the main profile; use it to review the verified receiving account.'}
          </KaelText>
        </View>
      </View>
      <KaelButton
        label={language === 'vi' ? 'Mở phương thức nhận tiền' : 'Open receiving method'}
        onPress={onPress}
        testID="worker-profile-open-receiving-method"
        variant="secondary"
      />
    </KaelCard>
  )
}

function WorkerProfileHero({
  active,
  approved,
  availabilityLabel,
  onStartJobs,
  ratingLabel,
  serviceLabel,
  testID,
  title,
  verificationLabel,
}: {
  active: boolean
  approved: boolean
  availabilityLabel: string
  onStartJobs: () => void
  ratingLabel: string
  serviceLabel: string
  testID: string
  title: string
  verificationLabel: string
}) {
  const language = useAppLanguage()
  return (
    <KaelCard large raised style={styles.workerProfileHeroCard} testID={testID}>
      <View style={styles.workerProfileMarker} testID="worker-profile-hero-crisp-shell" />
      <MintAura intensity="component" style={styles.workerProfileHeroAura} />
      <View style={styles.workerProfileHeroHighlight} />
      <View style={styles.workerProfileHeroUtilityRow} pointerEvents="none">
        <View style={styles.workerProfileHeroIconButton}>
          <BellGlyph />
        </View>
        <View style={styles.workerProfileHeroIconButton}>
          <GearGlyph />
        </View>
      </View>
      <View style={styles.workerProfileHeroIdentity}>
        <View style={styles.workerProfileHeroAvatarFrame}>
          <MintAura intensity="iconTile" style={styles.workerProfileHeroAvatarAura} />
          <Image source={workerIcons.avatar} resizeMode="contain" style={styles.workerProfileHeroAvatarImage} />
        </View>
        <View style={styles.workerProfileHeroCopy}>
          <View style={styles.workerProfileNameRow}>
            <KaelText testID="worker-profile-hero-name" variant="h2" style={styles.workerProfileHeroName}>{title}</KaelText>
            {approved ? <Image source={statusIcons.completed} resizeMode="contain" style={styles.workerProfileVerifiedIcon} /> : null}
          </View>
          <KaelText tone="secondary" variant="label">{serviceLabel}</KaelText>
          <KaelText tone="strong" variant="caption">{ratingLabel}</KaelText>
        </View>
      </View>
      <View style={styles.workerProfileHeroStatusRow}>
        <WorkerProfileStatusPill
          icon={statusIcons.approved}
          label={language === 'vi' ? 'Xác minh danh tính' : 'Identity verification'}
          value={verificationLabel}
        />
        <WorkerProfileStatusPill
          icon={active ? statusIcons.completed : statusIcons.pending}
          label={language === 'vi' ? 'Đang hoạt động' : 'Availability'}
          value={availabilityLabel}
        />
      </View>
      <KaelButton
        disabled={!approved}
        label={language === 'vi' ? 'Nhận việc ngay' : 'Start jobs'}
        onPress={onStartJobs}
        style={styles.workerProfileHeroCta}
      />
    </KaelCard>
  )
}

function WorkerProfileStatusPill({ icon, label, value }: { icon: ImageSourcePropType; label: string; value: string }) {
  return (
    <View style={styles.workerProfileStatusPill}>
      <Image source={icon} resizeMode="contain" style={styles.workerProfileStatusIcon} />
      <View style={styles.workerProfileStatusCopy}>
        <KaelText tone="secondary" variant="caption">{label}</KaelText>
        <KaelText variant="caption" style={styles.workerProfileStatusValue}>{value}</KaelText>
      </View>
    </View>
  )
}

function WorkerProfileMiniTile({ icon, subtitle, testID, title }: { icon: ImageSourcePropType; subtitle: string; testID: string; title: string }) {
  return (
    <View style={styles.workerProfileMiniTile} testID={testID}>
      <View style={styles.workerProfileMarker} testID="worker-profile-mini-crisp-shell" />
      <IconTile source={icon} small />
      <KaelText variant="label" style={styles.workerProfileMiniTitle}>{title}</KaelText>
      <KaelText tone="secondary" variant="caption" style={styles.workerProfileMiniSubtitle}>{subtitle}</KaelText>
    </View>
  )
}

function WorkerVerificationDraftPanel({
  language,
  onOpen,
  open,
}: {
  language: AppLanguage
  onOpen: () => void
  open: boolean
}) {
  return (
    <KaelCard testID="worker-profile-verification-collapsed-crisp-shell">
      <SectionHeading
        subtitle={language === 'vi' ? 'Hoàn tất xác minh trước khi nhận việc thật.' : 'Finish verification before taking real jobs.'}
        title={language === 'vi' ? 'Xác minh hồ sơ thợ' : 'Worker verification'}
      />
      <KaelButton label={language === 'vi' ? 'Mở hồ sơ xác minh' : 'Open verification'} onPress={onOpen} testID="worker-profile-open-verification-form" variant="secondary" />
      {open ? (
        <View style={styles.metricStack} testID="worker-verification-submit-card">
          <View style={styles.softPanel} testID="worker-profile-verification-crisp-shell">
            <KaelText variant="label">{language === 'vi' ? 'Ảnh CCCD và selfie' : 'ID and selfie'}</KaelText>
            <KaelText tone="secondary" variant="caption">{language === 'vi' ? '0 ảnh' : '0 photos'}</KaelText>
          </View>
          <View style={styles.softPanel} testID="worker-profile-service-area-crisp-shell">
            <KaelText variant="label">{language === 'vi' ? 'Khu vực phục vụ' : 'Service area'}</KaelText>
            <KaelText tone="secondary" variant="caption">{language === 'vi' ? '0 khu vực' : '0 areas'}</KaelText>
          </View>
          <KaelButton label={language === 'vi' ? 'Gửi xác minh' : 'Submit verification'} onPress={() => undefined} testID="worker-verification-submit" />
        </View>
      ) : null}
    </KaelCard>
  )
}

function WorkerProfileLevelJourney({
  language,
  levelInfo,
  onSelectLevel,
  ratingLabel,
  recommendationLabel,
  selectedLevel,
  totalJobsLabel,
}: {
  language: AppLanguage
  levelInfo: ReturnType<typeof workerLevelFromJobs>
  onSelectLevel: (level: number) => void
  ratingLabel: string
  recommendationLabel: string
  selectedLevel: number
  totalJobsLabel: string
}) {
  const maxLevel = workerProfileLevelMax
  const selected = Math.max(1, Math.min(selectedLevel, maxLevel))
  const previewLimit = levelInfo.level >= 5 ? levelInfo.level + 1 : 4
  const locked = selected > previewLimit
  const progressValueLabel = `${formatMetricOrZero(levelInfo.points, language)} / ${formatMetric(levelInfo.nextThreshold, language)} ${language === 'vi' ? 'việc' : 'jobs'} · ${language === 'vi' ? 'Tiến trình thật' : 'Real progress'}`
  const selectedRequirement = locked
    ? (language === 'vi' ? 'Mở sau các mốc thật trước đó' : 'Locked until earlier real milestones open')
    : `${formatMetric(workerProfileLevelThresholds[selected - 1], language)} ${language === 'vi' ? 'việc' : 'jobs'}`
  const selectedReward = locked
    ? (language === 'vi' ? 'Mở sau các mốc thật trước đó' : 'Locked until earlier real milestones open')
    : (language === 'vi' ? 'Chi tiết quyền lợi mở theo tiến trình thật' : 'Benefits open from real progress')
  return (
    <View style={styles.workerProfileLevelShell} testID="worker-profile-level-crisp-shell">
      <View style={styles.workerProfileMarker} testID="worker-profile-level-corner-aura" />
      <View style={styles.workerProfileLevelCurrentCard}>
        <MintAura intensity="component" style={styles.workerProfileLevelAura} />
        <View style={styles.workerProfileLevelHighlight} />
        <View style={styles.workerProfileLevelOrb}>
          <KaelText tone="secondary" variant="caption">{language === 'vi' ? 'Cấp' : 'Level'}</KaelText>
          <KaelText variant="h1" style={styles.workerProfileLevelOrbValue}>{levelInfo.level}</KaelText>
        </View>
        <View style={styles.workerProfileLevelText}>
          <KaelText tone="secondary" variant="caption" testID="worker-profile-level-current-kicker">{language === 'vi' ? 'Cấp thợ hiện tại' : 'Current worker level'}</KaelText>
          <KaelText variant="h2" testID="worker-profile-level-title">{workerLevelTitle(levelInfo.level, language)}</KaelText>
          <KaelText tone="secondary">{language === 'vi' ? 'Uy tín cao, kỹ năng vững vàng' : 'Real completed jobs drive level'}</KaelText>
          <View
            accessibilityLabel={`${levelInfo.points} / ${levelInfo.nextThreshold}`}
            accessibilityRole="progressbar"
            accessibilityValue={{ max: 100, min: 0, now: Math.round(levelInfo.progress * 100) }}
            style={styles.workerLevelProgressTrack}
            testID="worker-profile-level-progress"
          >
            <View style={[styles.workerLevelProgressFill, { width: `${Math.round(levelInfo.progress * 100)}%` as DimensionValue }]} />
          </View>
          <KaelText tone="secondary" variant="caption" testID="worker-profile-level-progress-value">
            {progressValueLabel}
          </KaelText>
        </View>
      </View>
      <TileGrid compact>
        <ProfileStatTile dense icon={statusIcons.completed} label={language === 'vi' ? 'Việc hoàn tất' : 'Completed jobs'} testID="worker-profile-level-signal-jobs" value={totalJobsLabel} />
        <ProfileStatTile dense icon={workerIcons.shield} label={language === 'vi' ? 'Đánh giá' : 'Rating'} testID="worker-profile-level-signal-rating" value={ratingLabel} />
        <ProfileStatTile dense icon={workerIcons.chat} label={language === 'vi' ? 'Tỷ lệ phản hồi' : 'Response rate'} testID="worker-profile-level-signal-recommendation" value={recommendationLabel} />
        <ProfileStatTile dense icon={workerIcons.map} label={language === 'vi' ? 'Đúng giờ' : 'On time'} testID="worker-profile-level-signal-ontime" value="0%" />
      </TileGrid>
      <View style={styles.workerProfileLevelSignalGlassRow}>
        <View style={styles.workerProfileMarker} testID="worker-profile-level-signal-glass-layer" />
        <View style={styles.workerProfileMarker} testID="worker-profile-level-signal-glass-layer" />
        <View style={styles.workerProfileMarker} testID="worker-profile-level-signal-glass-layer" />
        <View style={styles.workerProfileMarker} testID="worker-profile-level-signal-glass-layer" />
      </View>
      <View style={styles.rankLadder} testID="worker-profile-level-ladder">
        <View style={styles.rankLadderHeader}>
          <KaelText variant="label">{language === 'vi' ? 'Thang cấp thợ' : 'Worker ladder'}</KaelText>
          <KaelText tone="secondary" variant="caption" testID="worker-profile-level-max">{maxLevel}</KaelText>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} testID="worker-profile-level-rail">
          <View style={styles.rankStepRow}>
            {Array.from({ length: maxLevel }, (_, index) => index + 1).map((step) => {
              const isSelected = selected === step
              const isLocked = step > previewLimit
              return (
                <Pressable accessibilityRole="button" key={step} onPress={() => onSelectLevel(step)} style={[styles.rankStep, isSelected ? styles.rankStepSelected : null]} testID={`worker-profile-level-chip-${step}`}>
                  <KaelText variant="label" tone={isSelected ? 'strong' : 'secondary'}>{step}</KaelText>
                  {isLocked ? <KaelText variant="caption" tone="secondary">{language === 'vi' ? 'Đang khóa' : 'Locked'}</KaelText> : null}
                </Pressable>
              )
            })}
          </View>
        </ScrollView>
        <View style={styles.workerProfileLevelScrollIndicator} testID="worker-profile-level-liquid-scroll-indicator">
          <View style={styles.workerProfileLevelScrollThumb} testID="worker-profile-level-liquid-scroll-thumb" />
        </View>
      </View>
      <View style={styles.twoColumnCards} testID="worker-profile-level-detail">
        <View style={styles.softPanel}>
          <KaelText tone="secondary" variant="caption">{language === 'vi' ? 'Cấp hiện tại' : 'Current level'}</KaelText>
          <KaelText variant="label" testID="worker-profile-level-selected-reward">{workerLevelTitle(levelInfo.level, language)}</KaelText>
          <KaelText tone="secondary" variant="caption">{language === 'vi' ? 'Tiến trình dựa trên việc hoàn tất thật.' : 'Progress follows real completed jobs.'}</KaelText>
        </View>
        <View style={styles.softPanel}>
          <KaelText tone="secondary" variant="caption">{language === 'vi' ? 'Cấp tiếp theo' : 'Next level'}</KaelText>
          <KaelText variant="label" testID="worker-profile-level-next-title">{locked ? selectedReward : workerLevelTitle(selected, language)}</KaelText>
          <KaelText tone="secondary" variant="caption" testID="worker-profile-level-selected-requirement">{selectedRequirement}</KaelText>
        </View>
      </View>
    </View>
  )
}

function WorkerChatReferenceShell({
  busy,
  deal,
  draft,
  feedbackOpen,
  feedbackText,
  localMessages,
  mediaItems,
  mediaNotice,
  onAttach,
  onBack,
  onFeedbackOpen,
  onFeedbackSubmit,
  onFeedbackText,
  onMic,
  onSend,
  onUpdateDraft,
  readonly,
  workerKaelProgress,
}: {
  busy: boolean
  deal: LocalDeal | null
  draft: string
  feedbackOpen: boolean
  feedbackText: string
  localMessages: string[]
  mediaItems: WorkerChatMediaPreview[]
  mediaNotice: string | null
  onAttach: () => void
  onBack: () => void
  onFeedbackOpen: () => void
  onFeedbackSubmit: () => void
  onFeedbackText: (value: string) => void
  onMic: () => void
  onSend: () => void
  onUpdateDraft: (value: string) => void
  readonly: boolean
  workerKaelProgress: KaelChatProgress | null
}) {
  const language = useAppLanguage()
  const { workerProfile } = useFrontendWorkflow()
  const [processStep, setProcessStep] = useState(0)
  const sendDisabled = draft.trim().length === 0 || readonly || busy
  const composerIsFeedback = feedbackOpen
  const composerValue = composerIsFeedback ? feedbackText : draft
  const composerPlaceholder = composerIsFeedback
    ? (language === 'vi' ? 'Góp ý cho Kael...' : 'Feedback for Kael...')
    : (language === 'vi' ? 'Nhắn Kael về giải quyết công việc...' : 'Message Kael about this job...')
  const composerSendDisabled = composerIsFeedback ? feedbackText.trim().length === 0 || busy : sendDisabled
  const problemSummary = deal ? workerProblemSummaryLabel(deal, language) : copy[language].dataPending
  const visibleMessages = localMessages.length > 0
    ? localMessages
    : [
        deal
          ? (language === 'vi' ? `Kael, kiểm tra giúp ca ${problemSummary}.` : `Kael, help me review ${problemSummary}.`)
          : (language === 'vi' ? 'Chưa có giải quyết công việc đang mở.' : 'No active job is open.'),
      ]
  const kaelAdvice = deal?.broadcast?.prebrief?.[0]
    || deal?.estimate?.advisory
    || (deal
      ? (language === 'vi' ? 'Giữ bối cảnh, checklist và bằng chứng trong cùng ca. Giá và phạm vi vẫn xử lý ở Lịch việc.' : 'Keep context, checklist, and evidence on this job. Price and scope stay in Jobs.')
      : (language === 'vi' ? 'Nhận một công việc để Kael hiển thị tư vấn hiện trường, checklist và bằng chứng.' : 'Accept a job so Kael can show on-site advisory, checklist, and evidence.'))
  const progressLabel = workerKaelProgress ? `${Math.round(workerKaelProgress.progress * 100)}% · ${workerKaelProgress.current_stage}` : null
  const mediaSummary = deal?.draft.mediaCount && deal.draft.mediaCount > 0
    ? formatEvidenceCount(deal.draft.mediaCount, language)
    : (language === 'vi' ? 'Chưa có ảnh hiện trường trong chat' : 'No on-site media in chat yet')
  return (
    <KaelCard style={styles.workerChatShell} testID="worker-chat-reference-shell">
      <View style={styles.workerChatTopControls} testID="worker-chat-reference-top-controls">
        <Pressable accessibilityLabel={language === 'vi' ? 'Thoát chat' : 'Exit chat'} accessibilityRole="button" onPress={onBack} style={styles.workerChatIconButton} testID="worker-jobroom-back">
          <Image source={workerIcons.jobs} style={styles.workerChatControlIcon} resizeMode="contain" />
        </Pressable>
        <View style={styles.workerChatCaseAvatar}>
          <Image source={workerIcons.avatar} style={styles.workerChatCaseAvatarImage} resizeMode="contain" />
        </View>
        <View style={styles.workerChatTitleStack}>
          <KaelText numberOfLines={1} tone="secondary" variant="caption">{workerChatGreeting(workerProfile?.legal_name, language)}</KaelText>
          <KaelText numberOfLines={1} variant="label">{language === 'vi' ? 'Tư vấn hiện trường' : 'On-site advisory'}</KaelText>
        </View>
        <View style={styles.workerChatModePill} testID="worker-chat-reference-mode-pill">
          <View style={styles.workerChatModeGlass} testID="worker-chat-mode-pill-glass-layer" />
          <KaelText numberOfLines={1} variant="caption" tone="strong">Kael</KaelText>
        </View>
      </View>

      <View style={styles.workerChatConversationCard} testID="worker-chat-reference-welcome-stage">
        <View style={styles.workerChatMessageRail}>
          {visibleMessages.map((message, index) => (
            <View key={`${message}-${index}`} style={styles.workerChatLocalBubble} testID={index === visibleMessages.length - 1 ? 'worker-chat-current-question' : undefined}>
              <KaelText variant="caption">{message}</KaelText>
            </View>
          ))}
        </View>

        {mediaItems.length > 0 ? (
          <View style={styles.workerChatMediaNotice} testID="worker-chat-media-preview-rail">
            {mediaItems.map((item, index) => (
              <View key={`${item.uri}-${index}`} style={styles.workerChatMediaPreviewItem} testID={`worker-chat-media-preview-${index}`}>
                <Image source={{ uri: item.uri }} style={styles.workerChatMediaPreviewImage} resizeMode="cover" testID={`worker-chat-media-preview-image-${index}`} />
                <KaelText numberOfLines={1} variant="caption" tone="strong">{item.fileName}</KaelText>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.workerChatMediaNotice} testID="worker-chat-media-preview-rail">
            <View style={styles.workerChatMediaPreviewItem}>
              <Image source={workerIcons.evidence} style={styles.workerChatMediaPreviewImage} resizeMode="contain" />
              <KaelText numberOfLines={1} variant="caption" tone="strong">{mediaNotice ?? mediaSummary}</KaelText>
            </View>
            <View style={styles.workerChatVoiceChip} testID="worker-chat-voice-note-chip">
              <Image source={workerIcons.chat} style={styles.workerChatTinyIcon} resizeMode="contain" />
              <KaelText variant="caption" tone="secondary">00:00</KaelText>
            </View>
          </View>
        )}

        <View style={styles.workerChatKaelBubble} testID="worker-chat-kael-advice">
          <View style={styles.workerChatKaelBubbleHeader}>
            <KaelMascot state={deal ? 'thinking' : 'welcome'} size={52} />
            <View style={styles.flowText}>
              <KaelText variant="label">Kael</KaelText>
              <KaelText tone="secondary" variant="caption">{deal ? workerCaseCurrentLabel(deal, language) : copy[language].dataPending}</KaelText>
            </View>
          </View>
          <KaelText tone="secondary" variant="caption">{kaelAdvice}</KaelText>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => setProcessStep((value) => (value + 1) % 4)}
        style={styles.workerAgenticProcessTrigger}
        testID="worker-jobroom-agentic-process-trigger"
      >
        <KaelText style={styles.workerAgenticProcessLabel} variant="caption" tone="strong">{language === 'vi' ? 'Tiến trình Kael' : 'Kael process'}</KaelText>
      </Pressable>

      {processStep >= 1 ? (
        <View style={styles.workerAgenticReveal} testID="worker-jobroom-handoff-reveal">
          <KaelText variant="caption" tone="strong">{language === 'vi' ? 'Bàn giao' : 'Handoff'}</KaelText>
          <KaelText tone="secondary" variant="caption">{deal?.id ?? copy[language].dataPending}</KaelText>
        </View>
      ) : null}
      {processStep >= 2 ? (
        <View style={styles.workerAgenticReveal} testID="worker-jobroom-live-brief-reveal">
          <KaelText variant="caption" tone="strong">{language === 'vi' ? 'Tóm tắt' : 'Brief'}</KaelText>
          <KaelText numberOfLines={1} tone="secondary" variant="caption">{deal?.draft.description || copy[language].dataPending}</KaelText>
        </View>
      ) : null}

      <View style={styles.workerOnsiteAdvisoryRail} testID="worker-onsite-advisory-rail">
        <WorkerAdvisoryMetric label={language === 'vi' ? 'Trạng thái' : 'Status'} testID="worker-onsite-advisory-status" value={deal ? statusLabel(deal.status, language) : copy[language].dataPending} />
        <WorkerAdvisoryMetric label={language === 'vi' ? 'Địa chỉ' : 'Address'} testID="worker-onsite-advisory-address" value={workerVisibleAddressLabel(deal, language)} />
        <WorkerAdvisoryMetric label={language === 'vi' ? 'Phạm vi' : 'Scope'} testID="worker-onsite-advisory-scope" value={language === 'vi' ? 'Không nhập giá tại chat.' : 'No price input in chat.'} />
        <WorkerAdvisoryMetric label={language === 'vi' ? 'Bằng chứng' : 'Evidence'} testID="worker-onsite-advisory-evidence" value={language === 'vi' ? 'Ghi chú và ảnh gửi theo job.' : 'Notes and photos stay attached to the job.'} />
      </View>

      {progressLabel ? (
        <View style={styles.workerChatProgress} testID="worker-kael-chat-progress">
          <KaelText tone="secondary" variant="caption">{progressLabel}</KaelText>
        </View>
      ) : null}

      <View style={[styles.workerChatComposerTools, composerIsFeedback ? styles.workerChatComposerToolsActive : null]} testID="worker-chat-reference-composer-tools">
        <View pointerEvents="none" style={styles.workerChatComposerKeyline} testID="worker-chat-reference-composer-keyline" />
        <View style={styles.workerChatComposerInput}>
          <KaelTextField
            accessibilityLabel={readonly && !composerIsFeedback ? (language === 'vi' ? 'Chat chỉ còn đọc lại' : 'Chat is read-only') : undefined}
            editable={!busy && (composerIsFeedback || !readonly)}
            inputShellStyle={styles.workerChatComposerInputShell}
            multiline
            onChangeText={composerIsFeedback ? onFeedbackText : onUpdateDraft}
            placeholder={composerPlaceholder}
            scrollEnabled={false}
            shellStyle={styles.workerChatComposerTextFieldStack}
            style={styles.workerChatComposerTextInput}
            testID="worker-kael-chat-input"
            value={composerValue}
          />
        </View>
        <View style={styles.workerChatComposerControlRow} testID="worker-chat-reference-composer-control-row">
          <Pressable accessibilityLabel={language === 'vi' ? 'Đính kèm bằng chứng' : 'Attach evidence'} accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={onAttach} style={[styles.workerChatComposerIconButton, busy ? styles.workerChatIconButtonDisabled : null]} testID="worker-kael-chat-attach">
            <WorkerChatPlusIcon color={color.brand.primary} />
          </Pressable>
          <Pressable
            accessibilityLabel={language === 'vi' ? 'Góp ý cho Kael' : 'Give Kael feedback'}
            accessibilityRole="button"
            accessibilityState={{ selected: composerIsFeedback }}
            onPress={onFeedbackOpen}
            style={[styles.workerChatFeedbackModePill, composerIsFeedback ? styles.workerChatFeedbackModePillActive : null]}
            testID="worker-kael-feedback-open"
          >
            <WorkerChatFeedbackIcon color={color.brand.primary} />
            <KaelText numberOfLines={1} style={styles.workerChatFeedbackModeText} tone="strong" variant="caption">{language === 'vi' ? 'Góp ý' : 'Feedback'}</KaelText>
          </Pressable>
          <View style={styles.workerChatComposerControlSpacer} />
          <Pressable accessibilityLabel={language === 'vi' ? 'Ghi âm' : 'Voice input'} accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={onMic} style={[styles.workerChatComposerIconButton, busy ? styles.workerChatIconButtonDisabled : null]} testID="worker-kael-chat-mic">
            <WorkerChatMicIcon color={color.brand.primary} />
          </Pressable>
          <Pressable
            accessibilityLabel={composerIsFeedback ? (language === 'vi' ? 'Gửi góp ý' : 'Submit feedback') : (language === 'vi' ? 'Gửi tin nhắn' : 'Send message')}
            accessibilityRole="button"
            accessibilityState={{ disabled: composerSendDisabled }}
            disabled={composerSendDisabled}
            onPress={composerIsFeedback ? onFeedbackSubmit : onSend}
            style={[styles.workerChatSendButton, composerSendDisabled ? styles.workerChatIconButtonDisabled : styles.workerChatSendButtonReady]}
            testID={composerIsFeedback ? 'worker-kael-feedback-submit' : 'worker-kael-send-button'}
          >
            <WorkerChatSendIcon color={composerSendDisabled ? color.text.muted : color.text.inverse} />
          </Pressable>
        </View>
      </View>
    </KaelCard>
  )
}

function WorkerAdvisoryMetric({
  label,
  presentation = 'default',
  testID,
  value,
}: {
  label: string
  presentation?: 'default' | 'checklist'
  testID: string
  value: string
}) {
  const checklist = presentation === 'checklist'
  return (
    <View style={styles.metricRow}>
      <KaelText
        tone={checklist ? 'strong' : 'secondary'}
        variant={checklist ? 'label' : 'caption'}
        style={checklist ? styles.metricChecklistLabel : null}
      >
        {checklist ? label.toLocaleUpperCase() : label}
      </KaelText>
      <KaelText
        tone="primary"
        variant={checklist ? 'body' : 'label'}
        style={[styles.metricValue, checklist ? styles.metricChecklistValue : null]}
        testID={testID}
      >
        {value}
      </KaelText>
    </View>
  )
}

function WorkerChatPlusIcon({ color: strokeColor }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" testID="worker-chat-attach-vector-icon">
      <Path d="M12 5v14M5 12h14" stroke={strokeColor} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  )
}

function WorkerChatFeedbackIcon({ color: strokeColor }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" testID="worker-chat-feedback-vector-icon">
      <Path d="M5 5.5h14a1.6 1.6 0 0 1 1.6 1.6v8.1a1.6 1.6 0 0 1-1.6 1.6h-6.8L8 20v-3.2H5a1.6 1.6 0 0 1-1.6-1.6V7.1A1.6 1.6 0 0 1 5 5.5Z" stroke={strokeColor} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M7.7 9.5h8.6M7.7 12.6h5.8" stroke={strokeColor} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  )
}

function WorkerChatMicIcon({ color: strokeColor }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" testID="worker-chat-mic-vector-icon">
      <Path d="M12 3.5a3.3 3.3 0 0 0-3.3 3.3v4.4a3.3 3.3 0 0 0 6.6 0V6.8A3.3 3.3 0 0 0 12 3.5Z" stroke={strokeColor} strokeWidth={2} />
      <Path d="M5.7 10.7a6.3 6.3 0 0 0 12.6 0M12 17v3.5M9.2 20.5h5.6" stroke={strokeColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

function WorkerChatSendIcon({ color: strokeColor }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" testID="worker-chat-send-vector-icon">
      <Path d="M22 2 11 13" stroke={strokeColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="m22 2-7 20-4-9-9-4 20-7Z" stroke={strokeColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

function FlowCard({ compact = false, icon, title, value }: { compact?: boolean; icon: ImageSourcePropType; title: string; value: string }) {
  return (
    <KaelCard style={compact ? styles.flowCardCompact : styles.flowCard}>
      <IconTile source={icon} small={compact} />
      <View style={styles.flowText}>
        <KaelText variant="label">{title}</KaelText>
        <KaelText tone="secondary" variant="caption">{value}</KaelText>
      </View>
    </KaelCard>
  )
}

function CustomerActivityPhaseBoard({
  deal,
  notifications,
  selectedTab,
}: {
  deal: LocalDeal | null
  notifications: NotificationListResponse['notifications']
  selectedTab: CustomerActivityTab
}) {
  const language = useAppLanguage()
  const router = useRouter()
  const phase = deal ? customerActivityPhase(deal, notifications[0], language) : null
  const visible = selectedTab === 'all' || phase?.tab === selectedTab

  if (!deal || !phase || !visible) {
    return (
      <KaelCard style={styles.activityEmptyCard} testID="customer-activity-empty-state">
        <IconTile source={selectedTab === 'done' ? statusIcons.completed : selectedTab === 'review' ? statusIcons.warning : clientIcons.activity} />
        <View style={styles.flowText}>
          <KaelText variant="label">{activityEmptyTitle(selectedTab, language)}</KaelText>
          <KaelText tone="secondary" variant="caption">{activityEmptyCopy(selectedTab, language)}</KaelText>
        </View>
        <KaelButton
          label={language === 'vi' ? 'Tạo yêu cầu mới' : 'Create request'}
          onPress={() => router.replace('/(customer)/booking' as never)}
          size="small"
          variant="secondary"
        />
      </KaelCard>
    )
  }

  return (
    <KaelCard style={styles.activityPhaseCard} testID="customer-activity-phase-card">
      <View style={styles.activityPhaseHeader}>
        <IconTile source={phase.icon} />
        <View style={styles.activityPhaseHeaderCopy}>
          <KaelBadge label={phase.phaseLabel} variant={phase.tab === 'review' ? 'warning' : 'mint'} />
          <KaelText variant="h3">{phase.title}</KaelText>
          <KaelText tone="secondary" variant="caption">{phase.subtitle}</KaelText>
        </View>
      </View>
      <View style={styles.activityPhaseProgress}>
        {(['active', 'review', 'done'] as const).map((key) => (
          <View key={key} style={[styles.activityPhaseProgressDot, phase.tab === key ? styles.activityPhaseProgressDotActive : null]} />
        ))}
      </View>
      <View style={styles.activityPhaseRows}>
        {phase.rows.map((row) => (
          <ActivityPhaseRow key={row.label} label={row.label} value={row.value} />
        ))}
      </View>
    </KaelCard>
  )
}

function ActivityPhaseRow({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <View style={styles.activityPhaseRow}>
      <KaelText tone="secondary" variant="caption">{label}</KaelText>
      <KaelText numberOfLines={2} variant="label">{value}</KaelText>
    </View>
  )
}

function customerActivityPhase(deal: LocalDeal, notification: NotificationListResponse['notifications'][number] | undefined, language: AppLanguage) {
  const tab = customerActivityTabForStatus(deal.status)
  const serviceLabel = deal.draft.serviceType ? serviceCopy[deal.draft.serviceType][language].label : ''
  const problemLabel = deal.estimate?.problemLabel ?? deal.draft.inferredProblemLabel ?? deal.broadcast?.problemSummary ?? ''
  const areaLabel = deal.broadcast?.fullAddressVisible
    ? deal.broadcast.fullAddressLabel ?? ''
    : deal.broadcast?.generalArea || deal.draft.districtLabel || ''
  const estimateLabel = deal.estimate?.priceRangeLabel ?? deal.broadcast?.estimatedPriceLabel ?? ''
  const confidenceLabel = deal.estimate?.confidenceLabel ?? ''
  const notificationLabel = notification?.title ?? ''
  const status = statusLabel(deal.status, language)
  const phaseLabel = customerActivityPhaseLabel(tab, deal.status, language)
  const title = customerActivityPhaseTitle(deal.status, language)
  const subtitle = customerActivityPhaseSubtitle(deal.status, language)
  const icon = tab === 'done' ? statusIcons.completed : tab === 'review' ? statusIcons.warning : deal.status === 'broadcasting' ? kaelOrb : clientIcons.activity

  return {
    icon,
    phaseLabel,
    rows: [
      { label: language === 'vi' ? 'Hồ sơ' : 'Case', value: deal.id ? `#${deal.id}` : '' },
      { label: language === 'vi' ? 'Dịch vụ' : 'Service', value: serviceLabel },
      { label: language === 'vi' ? 'Vấn đề' : 'Issue', value: problemLabel },
      { label: language === 'vi' ? 'Độ phù hợp' : 'Match', value: confidenceLabel },
      { label: language === 'vi' ? 'Ước tính' : 'Estimate', value: estimateLabel },
      { label: language === 'vi' ? 'Khu vực' : 'Area', value: areaLabel },
      { label: language === 'vi' ? 'Trạng thái' : 'Status', value: status },
      { label: language === 'vi' ? 'Cập nhật' : 'Update', value: notificationLabel },
    ],
    subtitle,
    tab,
    title,
  }
}

function customerActivityTabForStatus(status: string | null | undefined): Exclude<CustomerActivityTab, 'all'> {
  if (status === 'scope_change_pending' || status === 'completed_by_worker' || status === 'awaiting_customer_confirm') return 'review'
  if (status === 'confirmed_by_customer' || status === 'reviewed' || status === 'cancelled') return 'done'
  return 'active'
}

function customerActivityPhaseLabel(tab: Exclude<CustomerActivityTab, 'all'>, status: string | null | undefined, language: AppLanguage) {
  if (status === 'draft' || status === 'analyzing') return language === 'vi' ? 'Đang chuẩn bị' : 'Preparing'
  const labels = {
    active: { en: 'Active', vi: 'Đang chạy' },
    done: { en: 'Done', vi: 'Hoàn tất' },
    review: { en: 'Needs review', vi: 'Cần duyệt' },
  } as const
  return labels[tab][language]
}

function customerActivityPhaseTitle(status: string | null | undefined, language: AppLanguage) {
  const vi: Record<string, string> = {
    analyzing: 'Kael đang chuẩn bị hồ sơ',
    arrived: 'Thợ đã tới nơi',
    awaiting_customer_confirm: 'Cần xác nhận ước tính',
    broadcasting: 'Kael đang tìm thợ phù hợp',
    cancelled: 'Giải quyết công việc đã hủy',
    completed_by_worker: 'Cần kiểm tra hoàn tất',
    confirmed_by_customer: 'Giải quyết công việc đã được xác nhận',
    draft: 'Yêu cầu đang được chuẩn bị',
    inspected: 'Đang kiểm tra hiện trường',
    inspecting: 'Đang kiểm tra hiện trường',
    repairing: 'Thợ đang xử lý',
    reviewed: 'Giải quyết công việc đã hoàn tất',
    scope_change_pending: 'Cần duyệt thay đổi phạm vi',
    worker_matched: 'Thợ đã nhận ca',
    worker_on_way: 'Thợ đang di chuyển',
  }
  const en: Record<string, string> = {
    analyzing: 'Kael is preparing the case',
    arrived: 'Worker arrived',
    awaiting_customer_confirm: 'Estimate needs confirmation',
    broadcasting: 'Kael is finding a worker',
    cancelled: 'Request cancelled',
    completed_by_worker: 'Completion needs review',
    confirmed_by_customer: 'Request confirmed',
    draft: 'Request is being prepared',
    inspected: 'On-site inspection',
    inspecting: 'On-site inspection',
    repairing: 'Worker is handling it',
    reviewed: 'Request completed',
    scope_change_pending: 'Scope change needs review',
    worker_matched: 'Worker accepted',
    worker_on_way: 'Worker is on the way',
  }
  return (language === 'vi' ? vi : en)[status ?? ''] ?? statusLabel(status, language)
}

function customerActivityPhaseSubtitle(status: string | null | undefined, language: AppLanguage) {
  const vi: Record<string, string> = {
    analyzing: 'Kael kiểm tra mô tả, bằng chứng và phạm vi trước khi chuyển bước.',
    arrived: 'Thợ đã tới nơi và chuẩn bị kiểm tra tình trạng thực tế.',
    awaiting_customer_confirm: 'Bạn xem lại ước tính trước khi Kael bắt đầu tìm thợ.',
    broadcasting: 'Hồ sơ đã đủ điều kiện, Kael đang gửi tới thợ phù hợp.',
    cancelled: 'Giải quyết công việc này không còn hoạt động.',
    completed_by_worker: 'Bạn kiểm tra bằng chứng hoàn tất trước khi xác nhận.',
    confirmed_by_customer: 'Giải quyết công việc đã qua bước xác nhận của khách hàng.',
    draft: 'Hoàn tất thông tin ở Dịch vụ để bắt đầu quy trình thật.',
    inspecting: 'Thợ đang kiểm tra tình trạng thực tế trước khi xử lý.',
    repairing: 'Theo dõi tiến độ chính ở đây, chi tiết nằm trong chat công việc.',
    reviewed: 'Lịch sử ca được giữ lại để đối chiếu sau này.',
    scope_change_pending: 'Phạm vi thay đổi cần được duyệt rõ ràng trước khi tiếp tục.',
    worker_matched: 'Thông tin nhận ca đã có, bước tiếp theo là di chuyển/kiểm tra.',
    worker_on_way: 'Theo dõi khu vực và cập nhật từ Kael trong quá trình thợ tới nơi.',
  }
  const en: Record<string, string> = {
    analyzing: 'Kael checks the description, evidence, and scope before moving on.',
    arrived: 'The worker has arrived and is preparing to inspect the issue.',
    awaiting_customer_confirm: 'Review the estimate before Kael starts matching.',
    broadcasting: 'The case is ready and Kael is sending it to matching workers.',
    cancelled: 'This request is no longer active.',
    completed_by_worker: 'Review completion evidence before confirming.',
    confirmed_by_customer: 'The request has passed customer confirmation.',
    draft: 'Complete the service form to start the real process.',
    inspecting: 'The worker is checking the actual issue before handling it.',
    repairing: 'Track core progress here; detailed discussion stays in job chat.',
    reviewed: 'The service history remains here for later review.',
    scope_change_pending: 'The changed scope needs explicit approval before continuing.',
    worker_matched: 'A worker accepted; next comes travel or inspection.',
    worker_on_way: 'Track area and Kael updates while the worker is on the way.',
  }
  return (language === 'vi' ? vi : en)[status ?? ''] ?? (language === 'vi' ? 'Theo dõi phase hiện tại của ca dịch vụ.' : 'Track the current phase of the request.')
}

function activityEmptyTitle(tab: CustomerActivityTab, language: AppLanguage) {
  const labels = {
    active: { en: 'No active request', vi: 'Chưa có ca đang chạy' },
    all: { en: 'No service activity yet', vi: 'Chưa có hoạt động dịch vụ' },
    done: { en: 'No completed request', vi: 'Chưa có ca hoàn tất' },
    review: { en: 'Nothing needs review', vi: 'Chưa có gì cần duyệt' },
  } as const
  return labels[tab][language]
}

function activityEmptyCopy(tab: CustomerActivityTab, language: AppLanguage) {
  const labels = {
    active: { en: 'When Kael starts matching or a worker accepts, the active phase appears here.', vi: 'Khi Kael bắt đầu tìm thợ hoặc thợ nhận ca, phase đang chạy sẽ hiện ở đây.' },
    all: { en: 'Create a real request from Service, then Activity will follow its phases.', vi: 'Tạo yêu cầu thật từ Dịch vụ, sau đó Hoạt động sẽ theo từng phase.' },
    done: { en: 'Completed requests will stay here for later review.', vi: 'Giải quyết công việc đã hoàn tất sẽ được giữ ở đây để xem lại.' },
    review: { en: 'Scope changes or completion checks will appear only when they need your decision.', vi: 'Thay đổi phạm vi hoặc kiểm tra hoàn tất chỉ hiện khi cần bạn quyết định.' },
  } as const
  return labels[tab][language]
}

function ProfileHero({
  action,
  avatarSource,
  footer,
  subtitle,
  testID,
  title,
  titleTestID,
  verified,
  worker = false,
}: {
  action?: ReactNode
  avatarSource?: ImageSourcePropType
  footer?: ReactNode
  subtitle: string
  testID?: string
  title: string
  titleTestID?: string
  verified: boolean
  worker?: boolean
}) {
  const language = useAppLanguage()
  return (
    <KaelCard large raised style={styles.profileHero} testID={testID}>
      {worker ? <View style={styles.workerProfileMarker} testID="worker-profile-hero-crisp-shell" /> : null}
      <IconTile source={avatarSource ?? (worker ? workerIcons.profile : clientIcons.profile)} large />
      <View style={styles.profileHeroText}>
        <KaelText testID={titleTestID} variant="h2">{title}</KaelText>
        <KaelText tone="secondary">{subtitle}</KaelText>
        {footer}
        {action ? <View style={styles.profileHeroAction}>{action}</View> : null}
        <KaelBadge
          label={verified ? (language === 'vi' ? 'Đã xác minh' : 'Verified') : (worker ? workerProfileVerificationLabel(null, language) : copy[language].dataPending)}
          variant={verified ? 'mint' : 'neutral'}
        />
      </View>
    </KaelCard>
  )
}

function ProfileSection({ actionLabel, children, onAction, title }: { actionLabel?: string; children: ReactNode; onAction?: () => void; title: string }) {
  return (
    <KaelCard>
      <View style={styles.profileSectionHeader}>
        <SectionHeading title={title} />
        {actionLabel && onAction ? (
          <Pressable accessibilityRole="button" onPress={onAction} style={styles.profileSectionAction}>
            <KaelText tone="strong" variant="caption">{actionLabel}</KaelText>
          </Pressable>
        ) : actionLabel ? <KaelText tone="strong" variant="caption">{actionLabel}</KaelText> : null}
      </View>
      <View style={styles.metricStack}>{children}</View>
    </KaelCard>
  )
}

function TileGrid({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  return <View style={[styles.tileGrid, compact ? styles.tileGridCompact : null]}>{children}</View>
}

function ProfileStatTile({ dense = false, half = false, icon, label, testID, value }: { dense?: boolean; half?: boolean; icon: ImageSourcePropType; label: string; testID?: string; value: string }) {
  const language = useAppLanguage()
  const emptyValue = value === copy[language].dataPending
  return (
    <View style={[styles.profileStatTile, dense ? styles.profileStatTileDense : null, half ? styles.profileStatTileHalf : null]} testID={testID}>
      {testID?.startsWith('worker-profile-mini-card') ? <View style={styles.workerProfileMarker} testID="worker-profile-mini-crisp-shell" /> : null}
      <IconTile source={icon} small />
      <KaelText numberOfLines={2} variant="label" style={styles.profileStatValue}>{emptyValue ? label : value}</KaelText>
      <KaelText tone="secondary" variant="caption" style={styles.profileStatLabel}>{emptyValue ? value : label}</KaelText>
    </View>
  )
}

function UtilityTile({ icon, label }: { icon: ImageSourcePropType; label: string }) {
  return (
    <View style={styles.utilityTile}>
      <IconTile source={icon} small />
      <KaelText variant="label" style={styles.utilityLabel}>{label}</KaelText>
    </View>
  )
}

function InfoStrip({ icon, label, testID, value }: { icon: ImageSourcePropType; label: string; testID?: string; value: string }) {
  return (
    <View style={styles.infoStrip} testID={testID}>
      <Image source={icon} style={styles.infoStripIcon} resizeMode="contain" />
      <View style={styles.infoStripText}>
        <KaelText tone="secondary" variant="caption">{label}</KaelText>
        <KaelText variant="label">{value}</KaelText>
      </View>
    </View>
  )
}

function RankSummary({
  currentLabel,
  levelLabel,
  progress,
  progressLabel,
  subtitle,
  title,
}: {
  currentLabel: string
  levelLabel: string
  progress: number | null
  progressLabel: string
  subtitle: string
  title: string
}) {
  const language = useAppLanguage()
  const pending = progress === null
  return (
    <View style={styles.rankSummary}>
      <View style={styles.rankOrb}>
        <KaelText tone={pending ? 'secondary' : 'strong'} variant="caption">{title}</KaelText>
        <KaelText variant={pending ? 'label' : 'h1'} style={[styles.rankOrbValue, pending ? styles.rankOrbPendingValue : null]}>
          {pending ? (language === 'vi' ? 'Chờ dữ liệu' : 'Pending') : levelLabel}
        </KaelText>
      </View>
      <View style={styles.rankSummaryText}>
        <KaelText variant="h2">{currentLabel}</KaelText>
        <KaelText tone="secondary">{subtitle}</KaelText>
        {progress === null ? <EmptyTruth text={copy[language].noFake} /> : <KaelProgressPill label={progressLabel} value={progress} />}
      </View>
    </View>
  )
}

function RankLadder({ current, max, type }: { current: number | null; max: number; type: 'customer' | 'worker' }) {
  const language = useAppLanguage()
  const steps = Array.from({ length: max }, (_, index) => index + 1)
  return (
    <View style={styles.rankLadder}>
      <View style={styles.rankLadderHeader}>
        <KaelText variant="label">{type === 'worker' ? (language === 'vi' ? 'Thang cấp thợ' : 'Worker ladder') : (language === 'vi' ? 'Thang hạng khách hàng' : 'Customer ladder')}</KaelText>
        <KaelText tone="secondary" variant="caption">{type === 'worker' ? `${language === 'vi' ? 'Cấp tối đa' : 'Max level'} ${max}` : `${language === 'vi' ? 'Hạng tối đa' : 'Max rank'} ${max}`}</KaelText>
      </View>
      <View style={styles.rankStepRow}>
        {steps.map((step) => {
          const selected = current === step
          const passed = current !== null && step < current
          return (
            <View key={`${type}-${step}`} style={[styles.rankStep, selected ? styles.rankStepSelected : null, passed ? styles.rankStepPassed : null]}>
              <KaelText variant="label" tone={selected ? 'strong' : 'secondary'}>{step}</KaelText>
            </View>
          )
        })}
      </View>
    </View>
  )
}

function TwoColumnCards({
  leftTitle,
  leftValue,
  rightTitle,
  rightValue,
}: {
  leftTitle: string
  leftValue: string
  rightTitle: string
  rightValue: string
}) {
  return (
    <View style={styles.twoColumnCards}>
      <View style={styles.softPanel}>
        <KaelText tone="secondary" variant="caption">{leftTitle}</KaelText>
        <KaelText variant="label">{leftValue}</KaelText>
      </View>
      <View style={styles.softPanel}>
        <KaelText tone="secondary" variant="caption">{rightTitle}</KaelText>
        <KaelText variant="label">{rightValue}</KaelText>
      </View>
    </View>
  )
}

function ProtectionGauge({ label, progress, score }: { label: string; progress: number | null; score: number | null }) {
  const language = useAppLanguage()
  const pending = score === null
  return (
    <View style={styles.protectionGaugeRow}>
      <View style={styles.protectionGauge}>
        <MintAura intensity="iconTile" />
        <KaelText variant={pending ? 'label' : 'h1'} style={[styles.protectionGaugeValue, pending ? styles.protectionGaugePendingValue : null]}>
          {pending ? (language === 'vi' ? 'Chờ dữ liệu' : 'Pending') : score}
        </KaelText>
        {pending ? null : <KaelText tone="secondary" variant="caption">/100</KaelText>}
      </View>
      <View style={styles.protectionGaugeText}>
        <KaelText variant="h3">{label}</KaelText>
        <KaelText tone="secondary">{language === 'vi' ? 'Bạn đang dùng dịch vụ an toàn và đúng giá khi backend có đủ giao dịch thật.' : 'Protection reflects real fair-price and transaction signals.'}</KaelText>
        {progress === null ? <EmptyTruth text={copy[language].noFake} /> : <KaelProgressPill label={`${score}/100`} value={progress} />}
      </View>
    </View>
  )
}

function EarningsStrip({ label, testID, value }: { label: string; testID?: string; value: string }) {
  return (
    <View style={styles.earningsStrip} testID={testID}>
      <IconTile source={workerIcons.wallet} small />
      <View style={styles.earningsText}>
        <KaelText tone="secondary" variant="caption">{label}</KaelText>
        <KaelText variant="h2">{value}</KaelText>
      </View>
    </View>
  )
}

function EarningsMiniChart({ rows }: { rows: { date: string; net_earnings: number }[] }) {
  const language = useAppLanguage()
  if (rows.length === 0) return <EmptyTruth text={copy[language].noFake} />
  const visibleRows = rows.slice(-7)
  const max = Math.max(...visibleRows.map((row) => row.net_earnings), 1)
  return (
    <View style={styles.earningsChart}>
      <View style={styles.earningsChartHeader}>
        <KaelText variant="label">{language === 'vi' ? 'Thu nhập 7 ngày gần nhất' : 'Recent daily earnings'}</KaelText>
        <KaelText tone="secondary" variant="caption">{language === 'vi' ? 'Dữ liệu backend' : 'Backend data'}</KaelText>
      </View>
      <View style={styles.earningsBars}>
        {visibleRows.map((row) => (
          <View key={row.date} style={styles.earningsBarSlot}>
            <View style={[styles.earningsBar, { height: `${Math.max(12, (row.net_earnings / max) * 82)}%` as DimensionValue }]} />
          </View>
        ))}
      </View>
    </View>
  )
}

function KaelSuggestion({ testID, text }: { testID?: string; text: string }) {
  return (
    <View style={styles.kaelSuggestion} testID={testID}>
      <Image source={kaelOrb} style={styles.kaelSuggestionIcon} resizeMode="contain" />
      <View style={styles.kaelSuggestionText}>
        <KaelText variant="label">Kael</KaelText>
        <KaelText tone="secondary" variant="caption">{text}</KaelText>
      </View>
    </View>
  )
}

function BadgeRail({ badges, testID }: { badges: { id: string; status: 'earned' | 'locked' }[]; testID?: string }) {
  const language = useAppLanguage()
  if (badges.length === 0) return <View testID={testID}><EmptyTruth text={copy[language].noFake} /></View>
  return (
    <View style={styles.badgeRail} testID={testID}>
      {badges.map((badge) => (
        <View key={badge.id} style={[styles.performanceBadge, badge.status === 'earned' ? styles.performanceBadgeEarned : null]}>
          <Image source={badge.status === 'earned' ? statusIcons.approved : statusIcons.pending} style={styles.performanceBadgeIcon} resizeMode="contain" />
          <KaelText variant="caption" tone={badge.status === 'earned' ? 'strong' : 'secondary'}>{workerBadgeLabel(badge.id, language)}</KaelText>
        </View>
      ))}
    </View>
  )
}

function AxisList({ axes, testID }: { axes: { id: string; score: number | null }[]; testID?: string }) {
  const language = useAppLanguage()
  if (axes.length === 0) return <View testID={testID}><EmptyTruth text={copy[language].noFake} /></View>
  return (
    <View style={styles.axisList} testID={testID}>
      {axes.map((axis) => (
        <View key={axis.id} style={styles.axisRow}>
          <KaelText variant="caption" tone="secondary">{workerAxisLabel(axis.id, language)}</KaelText>
          <View style={styles.axisProgress}>
            <View style={[styles.axisProgressFill, { width: `${Math.max(0, Math.min(axis.score ?? 0, 100))}%` as DimensionValue }]} />
          </View>
          <KaelText variant="caption" tone="strong">{formatPercent(axis.score, language)}</KaelText>
        </View>
      ))}
    </View>
  )
}

function MetricRow({ label, testID, value }: { label: string; testID?: string; value: string }) {
  return (
    <View style={styles.metricRow} testID={testID}>
      <KaelText tone="secondary" variant="caption">{label}</KaelText>
      <KaelText variant="label" style={styles.metricValue}>{value}</KaelText>
    </View>
  )
}

function EmptyTruth({ text }: { text: string }) {
  return (
    <View style={styles.emptyTruth}>
      <Image source={statusIcons.pending} style={styles.emptyIcon} resizeMode="contain" />
      <KaelText tone="secondary" variant="caption">{text}</KaelText>
    </View>
  )
}

function IconTile({ large = false, small = false, source }: { large?: boolean; small?: boolean; source: ImageSourcePropType }) {
  return (
    <View style={[styles.iconTile, large ? styles.iconTileLarge : null, small ? styles.iconTileSmall : null]}>
      <MintAura intensity="iconTile" />
      <Image source={source} style={[styles.iconImage, large ? styles.iconImageLarge : null, small ? styles.iconImageSmall : null]} resizeMode="contain" />
    </View>
  )
}

function WorkerAvatarTile({ avatarUrl }: { avatarUrl?: string | null }) {
  const safeUri = safeImageUri(avatarUrl)
  return (
    <View style={styles.workerAvatarTile} testID="customer-matching-worker-avatar">
      {safeUri ? (
        <Image
          source={{ uri: safeUri }}
          style={styles.workerAvatarPhoto}
          resizeMode="cover"
          testID="customer-matching-worker-avatar-image"
        />
      ) : (
        <>
          <MintAura intensity="iconTile" />
          <Image
            source={workerIcons.profile}
            style={styles.workerAvatarFallbackIcon}
            resizeMode="contain"
            testID="customer-matching-worker-avatar-fallback"
          />
        </>
      )}
    </View>
  )
}

function RebuildDock({ active, hidden = false, languageOverride, role }: { active: CustomerDockActive | WorkerDockActive; hidden?: boolean; languageOverride?: AppLanguage; role: 'customer' | 'worker' }) {
  const router = useRouter()
  const appLanguage = useAppLanguage()
  const language = languageOverride ?? appLanguage
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const isCustomer = role === 'customer'
  const items = role === 'customer'
    ? [
        { key: 'home', label: language === 'vi' ? 'Trang chủ' : 'Home', href: '/(customer)/home', iconName: 'home' },
        { key: 'booking', label: language === 'vi' ? 'Dịch vụ' : 'Services', href: '/(customer)/booking', iconName: 'booking' },
        { key: 'activity', label: language === 'vi' ? 'Hoạt động' : 'Activity', href: '/(customer)/history', iconName: 'activity' },
        { key: 'profile', label: language === 'vi' ? 'Hồ sơ' : 'Profile', href: '/(customer)/profile', iconName: 'profile' },
      ]
    : [
        { key: 'home', label: language === 'vi' ? 'Trang chủ' : 'Home', href: '/(worker)/home', iconName: 'home' },
        { key: 'jobs', label: language === 'vi' ? 'Công việc' : 'Jobs', href: '/(worker)/jobs', iconName: 'jobs' },
        { key: 'earnings', label: language === 'vi' ? 'Thu nhập' : 'Earnings', href: '/(worker)/earnings', iconName: 'earnings' },
        { key: 'profile', label: language === 'vi' ? 'Hồ sơ' : 'Profile', href: '/(worker)/profile', iconName: 'profile' },
      ]
  const kaelHref = role === 'customer' ? '/(customer)/kael' : '/(worker)/chat'
  const kaelActive = isCustomer ? active === 'kael' || active === 'chat' : active === 'kael'
  const activeTabIndex = items.findIndex((item) => item.key === active)
  const settledIndex = activeTabIndex >= 0 ? activeTabIndex : dockRouteIndexMemory[role]
  const workerDockBottom = Math.max(12, insets.bottom)
  const liquidNavWidth = Math.min(Math.max(width - LIQUID_NAV_SIDE_INSET * 2, 0), LIQUID_NAV_MAX_WIDTH)
  const liquidDockWidth = Math.max(liquidNavWidth - LIQUID_NAV_ORB_SIZE - LIQUID_NAV_DOCK_GAP, LIQUID_NAV_DOCK_HEIGHT)
  const lensWidth = Math.max((liquidDockWidth - LIQUID_NAV_RAIL_PADDING * 2) / items.length, 0)
  const { reduceMotion, reduceTransparency } = useGlassAccessibility()
  const initialSettledIndexRef = useRef(dockRouteIndexMemory[role])
  const previousIndexRef = useRef(initialSettledIndexRef.current)
  const lensX = useSharedValue(initialSettledIndexRef.current * lensWidth)
  const lensScaleX = useSharedValue(1)
  const lensScaleY = useSharedValue(1)
  const lensRadius = useSharedValue(24)
  const lensSkew = useSharedValue(0)
  const lensSheenX = useSharedValue(-84)
  const lensSheenOpacity = useSharedValue(0)
  const dockShimmerX = useSharedValue((0.18 + initialSettledIndexRef.current * 0.22) * liquidDockWidth)
  const dockCausticX = useSharedValue(initialSettledIndexRef.current * lensWidth)
  const orbScale = useSharedValue(1)
  const orbSheenX = useSharedValue(-36)
  const orbSheenOpacity = useSharedValue(0)
  const orbRippleScale = useSharedValue(1)
  const orbRippleOpacity = useSharedValue(0)
  const dockCausticWidth = Math.min(118, Math.max(lensWidth + 48, 72))
  const dockCausticLeft = (lensWidth - dockCausticWidth) / 2
  const rebuildLensStyles = styles as typeof styles & Record<
    | 'rebuildDockLens'
    | 'rebuildDockLensBloom'
    | 'rebuildDockLensInnerShadow'
    | 'rebuildDockLensSheen'
    | 'rebuildDockLensTopLight',
    ViewStyle
  >
  const rebuildSourceStyles = styles as typeof styles & Record<
    | 'rebuildDockCaustic'
    | 'rebuildDockCausticGlow'
    | 'rebuildDockCausticSweep'
    | 'rebuildDockCausticSweepBright'
    | 'rebuildDockInnerRefraction'
    | 'rebuildDockShimmer'
    | 'liquidNavGlint'
    | 'liquidNavGlobeTopHighlight'
    | 'liquidNavFrontRim'
    | 'liquidNavOrbBackdrop'
    | 'liquidNavOrbBackdropStar'
    | 'liquidNavOrbCaustic'
    | 'liquidNavOrbit'
    | 'liquidNavOrbitBack'
    | 'liquidNavOrbMotion'
    | 'liquidNavPearl'
    | 'liquidNavRipple'
    | 'liquidNavRoleBadge'
    | 'liquidNavRoleBadgeIcon'
    | 'liquidNavRoleBadgeWash'
    | 'liquidNavStatus'
    | 'liquidNavStatusHalo'
    | 'liquidNavStatusWave',
    ViewStyle
  >
  const animatedLensStyle = useAnimatedStyle(() => ({
    borderRadius: lensRadius.value,
    transform: [{ translateX: lensX.value }, { scaleX: lensScaleX.value }, { scaleY: lensScaleY.value }, { skewX: `${lensSkew.value}deg` }],
    width: lensWidth,
  }), [lensWidth])
  const animatedLensSheenStyle = useAnimatedStyle(() => ({
    opacity: lensSheenOpacity.value,
    transform: [{ translateX: lensSheenX.value }, { rotate: '-12deg' }],
  }))
  const animatedDockShimmerStyle = useAnimatedStyle(() => ({
    opacity: reduceTransparency ? 0 : 0.73,
    transform: [{ translateX: dockShimmerX.value }],
  }), [reduceTransparency])
  const animatedDockCausticStyle = useAnimatedStyle(() => ({
    opacity: reduceTransparency ? 0 : 1,
    transform: [{ translateX: dockCausticX.value }],
  }), [reduceTransparency])
  const animatedOrbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: orbScale.value }],
  }))
  const animatedOrbSheenStyle = useAnimatedStyle(() => ({
    opacity: reduceTransparency ? 0 : orbSheenOpacity.value,
    transform: [{ translateX: orbSheenX.value }, { rotate: '-18deg' }],
  }), [reduceTransparency])
  const animatedOrbRippleStyle = useAnimatedStyle(() => ({
    opacity: reduceTransparency ? 0 : orbRippleOpacity.value,
    transform: [{ scale: orbRippleScale.value }],
  }), [reduceTransparency])
  useEffect(() => {
    const targetX = settledIndex * lensWidth
    const shimmerTarget = (0.18 + settledIndex * 0.22) * liquidDockWidth
    const causticTarget = settledIndex * lensWidth
    const delta = settledIndex - previousIndexRef.current

    cancelAnimation(lensX)
    cancelAnimation(lensScaleX)
    cancelAnimation(lensScaleY)
    cancelAnimation(lensRadius)
    cancelAnimation(lensSkew)
    cancelAnimation(lensSheenX)
    cancelAnimation(lensSheenOpacity)
    cancelAnimation(dockShimmerX)
    cancelAnimation(dockCausticX)

    if (reduceMotion || delta === 0) {
      lensX.value = withTiming(targetX, { duration: 120 })
      lensScaleX.value = 1
      lensScaleY.value = 1
      lensRadius.value = 24
      lensSkew.value = 0
      dockShimmerX.value = withTiming(shimmerTarget, { duration: 160 })
      dockCausticX.value = withTiming(causticTarget, { duration: 160 })
      previousIndexRef.current = settledIndex
      if (activeTabIndex >= 0) dockRouteIndexMemory[role] = settledIndex
      return
    }

    const stretch = Math.min(1.21, 1.08 + Math.abs(delta) * 0.045)
    const direction = Math.sign(delta)
    lensX.value = withSpring(targetX, motionTokens.liquid.pill)
    lensScaleX.value = withSequence(withTiming(stretch, { duration: 235 }), withSpring(0.965, motionTokens.liquid.press), withSpring(1, motionTokens.liquid.press))
    lensScaleY.value = withSequence(withTiming(0.91, { duration: 235 }), withSpring(1.035, motionTokens.liquid.press), withSpring(1, motionTokens.liquid.press))
    lensRadius.value = withSequence(withTiming(27, { duration: 235 }), withTiming(22, { duration: 190 }), withSpring(24, motionTokens.liquid.press))
    lensSkew.value = withSequence(withTiming(direction * -2.2, { duration: 235 }), withTiming(0, { duration: 325 }))
    lensSheenX.value = -84
    lensSheenOpacity.value = withSequence(withTiming(0.84, { duration: 90 }), withTiming(0, { duration: 270 }))
    lensSheenX.value = withTiming(84, { duration: 360 })
    dockShimmerX.value = withTiming(shimmerTarget, { duration: 580 })
    dockCausticX.value = withTiming(causticTarget, { duration: 560 })
    previousIndexRef.current = settledIndex
    if (activeTabIndex >= 0) dockRouteIndexMemory[role] = settledIndex
  }, [activeTabIndex, dockCausticX, dockShimmerX, lensRadius, lensScaleX, lensScaleY, lensSheenOpacity, lensSheenX, lensSkew, lensWidth, lensX, liquidDockWidth, reduceMotion, role, settledIndex])

  const openKael = () => {
    cancelAnimation(orbScale)
    cancelAnimation(orbSheenX)
    cancelAnimation(orbSheenOpacity)
    cancelAnimation(orbRippleScale)
    cancelAnimation(orbRippleOpacity)

    if (reduceMotion) {
      orbScale.value = 1
      orbRippleOpacity.value = 0
    } else {
      orbScale.value = withSequence(withTiming(0.88, { duration: 120 }), withSpring(1.075, motionTokens.liquid.pill), withSpring(1, motionTokens.liquid.press))
      orbSheenX.value = -36
      orbSheenOpacity.value = withSequence(withTiming(0.76, { duration: 110 }), withTiming(0, { duration: 320 }))
      orbSheenX.value = withTiming(36, { duration: 430 })
      orbRippleScale.value = 1
      orbRippleOpacity.value = 0.74
      orbRippleScale.value = withTiming(1.75, { duration: 780 })
      orbRippleOpacity.value = withTiming(0, { duration: 780 })
    }

    router.replace(kaelHref as never)
  }

  return (
    <View pointerEvents={hidden ? 'none' : 'box-none'} style={[styles.dockOverlay, !isCustomer ? styles.workerDockOverlayPlacement : null, !isCustomer ? { bottom: workerDockBottom } : null, hidden ? styles.dockOverlayHidden : null]} testID={role === 'worker' ? 'worker-dock-motion-shell' : 'customer-dock-motion-shell'}>
      <View style={[styles.dockRow, isCustomer ? styles.customerDockRow : styles.workerDockRow, { width: liquidNavWidth }]} testID={role === 'worker' ? 'worker-dock-split-toolbar' : 'customer-dock-split-toolbar'}>
        <GlassSurface
          backgroundColor={customerTheme.lightLayer.glass}
          borderColor={customerTheme.lightLayer.glassBorder}
          material="liquid"
          mode="light"
          style={[
            styles.dockRail,
            isCustomer ? styles.customerDockRail : styles.workerDockRail,
            { width: liquidDockWidth },
          ]}
          testID={role === 'worker' ? 'worker-liquid-glass-dock' : 'customer-liquid-glass-dock'}
          variant="nav"
        >
          <View
            pointerEvents="none"
            style={rebuildSourceStyles.rebuildDockCaustic}
            testID={role === 'worker' ? 'worker-dock-caustic' : 'customer-dock-caustic'}
          >
            <Animated.View
              pointerEvents="none"
              style={[rebuildSourceStyles.rebuildDockCausticGlow, { left: dockCausticLeft, width: dockCausticWidth }, animatedDockCausticStyle]}
              testID={role === 'worker' ? 'worker-dock-caustic-glow' : 'customer-dock-caustic-glow'}
            />
            <View pointerEvents="none" style={rebuildSourceStyles.rebuildDockCausticSweep} testID={role === 'worker' ? 'worker-dock-caustic-sweep' : 'customer-dock-caustic-sweep'} />
            <View pointerEvents="none" style={rebuildSourceStyles.rebuildDockCausticSweepBright} testID={role === 'worker' ? 'worker-dock-caustic-sweep-bright' : 'customer-dock-caustic-sweep-bright'} />
          </View>
          <Animated.View
            pointerEvents="none"
            style={[rebuildSourceStyles.rebuildDockShimmer, { width: liquidDockWidth * 0.72 }, animatedDockShimmerStyle]}
            testID={role === 'worker' ? 'worker-dock-shimmer' : 'customer-dock-shimmer'}
          />
          <View
            pointerEvents="none"
            style={rebuildSourceStyles.rebuildDockInnerRefraction}
            testID={role === 'worker' ? 'worker-dock-inner-refraction' : 'customer-dock-inner-refraction'}
          />
          {activeTabIndex >= 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[rebuildLensStyles.rebuildDockLens, animatedLensStyle]}
              testID={role === 'worker' ? 'worker-dock-lens' : 'customer-dock-lens'}
          >
              <View pointerEvents="none" style={rebuildLensStyles.rebuildDockLensBloom} testID={role === 'worker' ? 'worker-dock-lens-bloom' : 'customer-dock-lens-bloom'} />
              <View pointerEvents="none" style={rebuildLensStyles.rebuildDockLensTopLight} testID={role === 'worker' ? 'worker-dock-lens-top-light' : 'customer-dock-lens-top-light'} />
              <Animated.View pointerEvents="none" style={[rebuildLensStyles.rebuildDockLensSheen, animatedLensSheenStyle]} testID={role === 'worker' ? 'worker-dock-lens-sheen' : 'customer-dock-lens-sheen'} />
              <View pointerEvents="none" style={rebuildLensStyles.rebuildDockLensInnerShadow} testID={role === 'worker' ? 'worker-dock-lens-inner-shadow' : 'customer-dock-lens-inner-shadow'} />
            </Animated.View>
          ) : null}
          {items.map((item) => {
            const selected = active === item.key
            return (
              <Pressable
                accessibilityLabel={item.label}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                key={item.key}
                onPress={() => router.replace((role === 'worker' && item.key === 'jobs' ? '/(worker)/jobs?tab=waiting' : item.href) as never)}
                style={({ pressed }) => [
                  styles.dockItem,
                  isCustomer ? styles.customerDockItem : styles.workerDockItem,
                  selected ? styles.dockItemActive : null,
                  !isCustomer && selected ? styles.workerDockItemActive : null,
                  isCustomer && selected ? styles.customerDockItemActive : null,
                  pressed ? styles.dockItemPressed : null,
                ]}
                testID={role === 'worker' ? `worker-dock-${item.key}` : `customer-v4-dock-${item.key}`}
              >
                {isCustomer ? (
                  <CustomerDockSvgIcon name={item.iconName as CustomerDockIconName} selected={selected} />
                ) : (
                  <Image
                    resizeMode="contain"
                    source={workerNavigationDockIcon(item.iconName as WorkerDockIconName)}
                    style={[styles.dockIcon, selected ? styles.dockIconActive : null]}
                    testID={`worker-dock-${item.key}-image-icon`}
                  />
                )}
                {isCustomer ? (
                  <KaelText
                    numberOfLines={1}
                    style={[
                      styles.dockLabel,
                      styles.customerDockLabel,
                      selected ? styles.dockLabelActive : null,
                    ]}
                    tone={selected ? 'strong' : 'muted'}
                    variant="caption"
                  >
                    {item.label}
                  </KaelText>
                ) : (
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.dockLabel,
                      styles.workerDockLabel,
                      selected ? styles.dockLabelActive : null,
                      selected ? styles.workerDockLabelActiveSource : null,
                      { color: selected ? '#086F68' : '#7C9290' },
                    ]}
                  >
                    {item.label}
                  </Text>
                )}
              </Pressable>
            )
          })}
        </GlassSurface>
        <Pressable
          accessibilityLabel={!isCustomer ? (language === 'vi' ? 'Mở Kael' : 'Open Kael') : 'Kael'}
          accessibilityRole="button"
          accessibilityState={{ selected: kaelActive }}
          onPress={openKael}
          style={({ pressed }) => [
            styles.kaelOrb,
            !isCustomer ? styles.workerKaelOrb : null,
            isCustomer ? styles.customerKaelOrb : null,
            kaelActive ? styles.kaelOrbActive : null,
            isCustomer && kaelActive ? styles.customerKaelOrbActive : null,
            pressed ? styles.kaelOrbPressed : null,
          ]}
          testID={role === 'worker' ? 'worker-dock-kael' : 'customer-v4-dock-kael'}
        >
          {!isCustomer && !reduceTransparency ? (
            <View
              pointerEvents="none"
              style={[styles.liquidNavSourceAura, kaelActive ? styles.liquidNavSourceAuraActive : null]}
              testID="worker-dock-kael-source-aura"
            />
          ) : null}
          <Animated.View pointerEvents="none" style={[rebuildSourceStyles.liquidNavOrbit, rebuildSourceStyles.liquidNavOrbitBack, kaelActive ? styles.liquidNavOrbitActive : null]} testID={role === 'worker' ? 'worker-dock-kael-orbit-back' : 'customer-dock-kael-orbit-back'}>
            <View pointerEvents="none" style={rebuildSourceStyles.liquidNavPearl} testID={role === 'worker' ? 'worker-dock-kael-orbit-back-pearl' : 'customer-dock-kael-orbit-back-pearl'} />
          </Animated.View>
          <Animated.View pointerEvents="none" style={[rebuildSourceStyles.liquidNavOrbit, kaelActive ? styles.liquidNavOrbitActive : null]} testID={role === 'worker' ? 'worker-dock-kael-orbit-front' : 'customer-dock-kael-orbit-front'}>
            <View pointerEvents="none" style={rebuildSourceStyles.liquidNavPearl} testID={role === 'worker' ? 'worker-dock-kael-orbit-front-pearl' : 'customer-dock-kael-orbit-front-pearl'} />
          </Animated.View>
          <Animated.View pointerEvents="none" style={[rebuildSourceStyles.liquidNavRipple, animatedOrbRippleStyle]} testID={role === 'worker' ? 'worker-dock-kael-ripple' : 'customer-dock-kael-ripple'} />
          <Animated.View style={[rebuildSourceStyles.liquidNavOrbMotion, animatedOrbStyle]} testID={role === 'worker' ? 'worker-dock-kael-customer-motion-model' : 'customer-dock-kael-motion-model'}>
            <GlassSurface
              backgroundColor={customerTheme.lightLayer.glassStrong}
              borderColor={customerTheme.lightLayer.glassBorder}
              material="liquid"
              mode="light"
              style={[styles.workerKaelAccessoryGlass, kaelActive ? styles.workerKaelAccessoryGlassActive : null]}
              testID={role === 'worker' ? 'worker-dock-kael-action-glass' : 'customer-dock-kael-action-glass'}
              variant="control"
            >
              <View pointerEvents="none" style={rebuildSourceStyles.liquidNavOrbBackdrop} testID={role === 'worker' ? 'worker-dock-kael-backdrop' : 'customer-dock-kael-backdrop'} />
              <View pointerEvents="none" style={rebuildSourceStyles.liquidNavOrbCaustic} testID={role === 'worker' ? 'worker-dock-kael-orb-caustic' : 'customer-dock-kael-orb-caustic'} />
              <View pointerEvents="none" style={rebuildSourceStyles.liquidNavGlobeTopHighlight} testID={role === 'worker' ? 'worker-dock-kael-globe-top-highlight' : 'customer-dock-kael-globe-top-highlight'} />
              {isCustomer ? <CustomerKaelOrbMark /> : <WorkerKaelOrbMark />}
              <Animated.View pointerEvents="none" style={[rebuildSourceStyles.liquidNavGlint, animatedOrbSheenStyle]} testID={role === 'worker' ? 'worker-dock-kael-glint' : 'customer-dock-kael-glint'} />
              <View pointerEvents="none" style={rebuildSourceStyles.liquidNavFrontRim} testID={role === 'worker' ? 'worker-dock-kael-front-rim' : 'customer-dock-kael-front-rim'} />
              <View pointerEvents="none" style={rebuildSourceStyles.liquidNavStatusHalo} testID={role === 'worker' ? 'worker-dock-kael-status-halo' : 'customer-dock-kael-status-halo'} />
              <View pointerEvents="none" style={rebuildSourceStyles.liquidNavStatusWave} testID={role === 'worker' ? 'worker-dock-kael-status-wave' : 'customer-dock-kael-status-wave'} />
              <View pointerEvents="none" style={rebuildSourceStyles.liquidNavStatus} testID={role === 'worker' ? 'worker-dock-kael-status' : 'customer-dock-kael-status'}>
                {!isCustomer ? <View pointerEvents="none" style={styles.workerKaelOrbCustomerStatusLight} testID="worker-dock-kael-status-top-light" /> : null}
              </View>
            </GlassSurface>
            {!isCustomer ? (
              <View pointerEvents="none" style={rebuildSourceStyles.liquidNavRoleBadge} testID="worker-dock-kael-role-badge">
                <View pointerEvents="none" style={rebuildSourceStyles.liquidNavRoleBadgeWash} testID="worker-dock-kael-role-badge-wash" />
                <Svg fill="none" viewBox="0 0 24 24" style={rebuildSourceStyles.liquidNavRoleBadgeIcon} testID="worker-dock-kael-role-badge-icon">
                  <Path d="M14.9 4.2a5 5 0 0 0-5.8 6.5L3.8 16a2.2 2.2 0 1 0 3.1 3.1l5.3-5.3a5 5 0 0 0 6.5-5.8l-3 3-2.7-.7-.7-2.7 2.6-2.6Z" fill="#087C71" />
                </Svg>
              </View>
            ) : null}
          </Animated.View>
        </Pressable>
      </View>
    </View>
  )
}

function CustomerKaelOrbMark() {
  return (
    <Image source={kaelOrbGlyph} style={styles.customerKaelOrbMark} resizeMode="contain" testID="customer-dock-kael-orb-icon" />
  )
}

function WorkerKaelOrbMark() {
  return (
    <Image source={customerNavigationKael} style={styles.workerKaelOrbMark} resizeMode="contain" testID="worker-dock-kael-orb-icon" />
  )
}

function workerNavigationDockIcon(name: WorkerDockIconName) {
  if (name === 'home') {
    return workerNavigationHome
  }
  if (name === 'jobs') {
    return workerNavigationJobs
  }
  if (name === 'earnings') {
    return workerNavigationEarnings
  }
  return workerNavigationProfile
}

function CustomerDockSvgIcon({ name, selected }: { name: CustomerDockIconName; selected: boolean }) {
  const stroke = selected ? color.brand.primary : 'rgba(31,107,100,0.72)'
  const fill = 'none'
  const softFill = selected ? 'rgba(13,174,154,0.10)' : 'none'
  const strokeWidth = selected ? 2.25 : 1.9
  const lineProps = { stroke, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, strokeWidth }

  if (name === 'home') {
    return (
      <Svg height={CUSTOMER_DOCK_ICON_SIZE} width={CUSTOMER_DOCK_ICON_SIZE} viewBox="0 0 28 28" style={styles.customerDockSvgIcon}>
        <Path d="M5.3 12.1 14 5.3l8.7 6.8v9.3a1.9 1.9 0 0 1-1.9 1.9h-4.1v-6.4h-5.4v6.4H7.2a1.9 1.9 0 0 1-1.9-1.9v-9.3Z" fill={fill} {...lineProps} />
      </Svg>
    )
  }

  if (name === 'booking') {
    return (
      <Svg height={CUSTOMER_DOCK_ICON_SIZE} width={CUSTOMER_DOCK_ICON_SIZE} viewBox="0 0 28 28" style={styles.customerDockSvgIcon}>
        <Path d="M8.3 5.4v3M19.7 5.4v3M6.3 10.6h15.4M7.9 7.4h12.2a2.2 2.2 0 0 1 2.2 2.2v11a2.2 2.2 0 0 1-2.2 2.2H7.9a2.2 2.2 0 0 1-2.2-2.2v-11a2.2 2.2 0 0 1 2.2-2.2Z" fill={softFill} {...lineProps} />
        <Circle cx={10.4} cy={14.8} r={0.85} fill={stroke} />
        <Circle cx={14} cy={14.8} r={0.85} fill={stroke} />
        <Circle cx={17.6} cy={14.8} r={0.85} fill={stroke} />
        <Circle cx={10.4} cy={18.4} r={0.85} fill={stroke} />
        <Circle cx={14} cy={18.4} r={0.85} fill={stroke} />
      </Svg>
    )
  }

  if (name === 'activity') {
    return (
      <Svg height={CUSTOMER_DOCK_ICON_SIZE} width={CUSTOMER_DOCK_ICON_SIZE} viewBox="0 0 28 28" style={styles.customerDockSvgIcon}>
        <Path d="M7.2 7.4h13.6a2.2 2.2 0 0 1 2.2 2.2v7.5a2.2 2.2 0 0 1-2.2 2.2h-6.1l-4.2 3.4v-3.4H7.2A2.2 2.2 0 0 1 5 17.1V9.6a2.2 2.2 0 0 1 2.2-2.2Z" fill={softFill} {...lineProps} />
        <Path d="M10.4 12.2h.1M14 12.2h.1M17.6 12.2h.1M10.4 15.4h7.2" {...lineProps} />
      </Svg>
    )
  }

  return (
    <Svg height={CUSTOMER_DOCK_ICON_SIZE} width={CUSTOMER_DOCK_ICON_SIZE} viewBox="0 0 28 28" style={styles.customerDockSvgIcon}>
      <Circle cx={14} cy={9.3} r={3.55} fill={fill} {...lineProps} />
      <Path d="M7.3 23a6.7 6.7 0 0 1 13.4 0" fill={fill} {...lineProps} />
    </Svg>
  )
}

function WorkerDockSvgIcon({ name, selected }: { name: WorkerDockIconName; selected: boolean }) {
  const stroke = selected ? '#0C8E82' : 'rgba(31,107,100,0.72)'
  const fill = selected ? 'rgba(13,174,154,0.10)' : 'none'
  const strokeWidth = selected ? 2.25 : 2.1
  const lineProps = { stroke, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, strokeWidth }

  if (name === 'home') {
    return (
      <Svg height={WORKER_DOCK_ICON_SIZE} width={WORKER_DOCK_ICON_SIZE} viewBox="0 0 28 28" style={styles.workerDockSvgIcon}>
        <Path d="M5.2 12.4 14 5.2l8.8 7.2v9.2a1.8 1.8 0 0 1-1.8 1.8h-4.2v-6.1h-5.6v6.1H7a1.8 1.8 0 0 1-1.8-1.8v-9.2Z" fill={fill} {...lineProps} />
      </Svg>
    )
  }

  if (name === 'jobs') {
    return (
      <Svg height={WORKER_DOCK_ICON_SIZE} width={WORKER_DOCK_ICON_SIZE} viewBox="0 0 28 28" style={styles.workerDockSvgIcon}>
        <Path d="M8.4 5.2v3.1M19.6 5.2v3.1M6.2 10.4h15.6M7.8 7.2h12.4a2.2 2.2 0 0 1 2.2 2.2v11.4a2.2 2.2 0 0 1-2.2 2.2H7.8a2.2 2.2 0 0 1-2.2-2.2V9.4a2.2 2.2 0 0 1 2.2-2.2Z" fill={selected ? 'rgba(13,174,154,0.10)' : 'none'} {...lineProps} />
        <Circle cx={10.2} cy={14.6} r={0.9} fill={stroke} />
        <Circle cx={14} cy={14.6} r={0.9} fill={stroke} />
        <Circle cx={17.8} cy={14.6} r={0.9} fill={stroke} />
        <Circle cx={10.2} cy={18.4} r={0.9} fill={stroke} />
        <Circle cx={14} cy={18.4} r={0.9} fill={stroke} />
      </Svg>
    )
  }

  if (name === 'earnings') {
    return (
      <Svg height={WORKER_DOCK_ICON_SIZE} width={WORKER_DOCK_ICON_SIZE} viewBox="0 0 28 28" style={styles.workerDockSvgIcon}>
        <Path d="M6.2 9.3h15.6a2.4 2.4 0 0 1 2.4 2.4v7.4a2.4 2.4 0 0 1-2.4 2.4H6.2a2.4 2.4 0 0 1-2.4-2.4v-9.8a2.4 2.4 0 0 1 2.4-2.4h12.1" fill={selected ? 'rgba(13,174,154,0.10)' : 'none'} {...lineProps} />
        <Path d="M19.1 13.1h4.1v4.6h-4.1a2.3 2.3 0 0 1 0-4.6Z" fill={selected ? color.mint.mint50 : 'none'} {...lineProps} />
        <Circle cx={19.4} cy={15.4} r={0.9} fill={stroke} />
      </Svg>
    )
  }

  return (
    <Svg height={WORKER_DOCK_ICON_SIZE} width={WORKER_DOCK_ICON_SIZE} viewBox="0 0 28 28" style={styles.workerDockSvgIcon}>
      <Circle cx={14} cy={9.2} r={3.6} fill={fill} {...lineProps} />
      <Path d="M7.2 23.1a6.8 6.8 0 0 1 13.6 0" fill={fill} {...lineProps} />
    </Svg>
  )
}

const customerRankLabels = {
  vi: ['Mới', 'Hoạt động', 'Tin cậy', 'Cao cấp', 'Elite'],
  en: ['New', 'Active', 'Trusted', 'Premium', 'Elite'],
} as const

const workerLevelMax = 10
const workerProfileLevelMax = 10
const workerProfileLevelThresholds = [0, 15, 30, 50, 100, 160, 240, 340, 460, 600] as const

function customerRankName(level: number | null | undefined, language: AppLanguage) {
  const index = normalizedCustomerRankLevel(level, language) - 1
  return language === 'vi'
    ? `Khách hàng ${customerRankLabels.vi[index]}`
    : `${customerRankLabels.en[index]} customer`
}

function currentCustomerRankName(level: number | null | undefined, language: AppLanguage) {
  if (typeof level !== 'number' || !Number.isFinite(level) || level < 1) {
    return language === 'vi' ? 'Chưa xếp hạng' : 'Unranked'
  }
  return customerRankName(level, language)
}

function customerRankSubtitle(level: number | null | undefined, language: AppLanguage) {
  if (typeof level !== 'number' || !Number.isFinite(level) || level < 1) {
    return language === 'vi'
      ? 'Bắt đầu tích điểm • Hành trình mới'
      : 'Start earning points • New journey'
  }

  if (level >= 3) {
    return language === 'vi'
      ? 'Sử dụng tích cực • Hành vi tốt'
      : 'Active usage • Positive behavior'
  }

  return language === 'vi'
    ? 'Sử dụng đều đặn • Đang tích lũy'
    : 'Regular usage • Building progress'
}

function nextCustomerRankName(level: number | null | undefined, language: AppLanguage) {
  const current = typeof level === 'number' && Number.isFinite(level) ? Math.floor(level) : 0
  return customerRankName(Math.min(Math.max(current + 1, 1), customerRankLabels[language].length), language)
}

function normalizedCustomerRankLevel(level: number | null | undefined, language: AppLanguage) {
  if (typeof level !== 'number' || !Number.isFinite(level) || level < 1) return 1
  return Math.min(customerRankLabels[language].length, Math.floor(level))
}

function moneyProtectionStatus(status: 'mixed' | 'pending' | 'verified' | null | undefined, language: AppLanguage) {
  if (!status) return copy[language].dataPending
  const labels = {
    mixed: { vi: 'Cần theo dõi', en: 'Needs review' },
    pending: { vi: 'Đang tích lũy', en: 'Building' },
    verified: { vi: 'Đáng tin cậy', en: 'Trusted' },
  } as const
  return labels[status][language]
}

function moneyProtectionBadgeSublabel(status: 'mixed' | 'pending' | 'verified' | null | undefined, language: AppLanguage) {
  const labels = {
    mixed: { vi: 'Cần thêm đối soát', en: 'Needs review' },
    pending: { vi: 'Chưa đủ giao dịch', en: 'More transactions needed' },
    verified: { vi: 'Khách hàng ưu tiên', en: 'Priority customer' },
  } as const
  return labels[status ?? 'pending'][language]
}

function moneyProtectionBadgeIcon(status: 'mixed' | 'pending' | 'verified' | null | undefined) {
  if (status === 'mixed') return statusIcons.warning
  if (status === 'verified') return statusIcons.completed
  return statusIcons.pending
}

function workerVerificationLabel(status: string | null | undefined, language: AppLanguage) {
  if (!status) return copy[language].dataPending
  const labels: Record<string, Record<AppLanguage, string>> = {
    approved: { vi: 'Đã xác minh', en: 'Verified' },
    pending: { vi: 'Chờ duyệt', en: 'Pending' },
    rejected: { vi: 'Cần nộp lại', en: 'Needs resubmission' },
    suspended: { vi: 'Tạm ngưng', en: 'Suspended' },
  }
  return labels[status]?.[language] ?? status
}

function workerVerificationShortLabel(status: string | null | undefined, language: AppLanguage) {
  if (!status) return copy[language].dataPending
  const labels: Record<string, Record<AppLanguage, string>> = {
    approved: { vi: 'Đã duyệt', en: 'Approved' },
    pending: { vi: 'Chờ duyệt', en: 'Pending' },
    rejected: { vi: 'Cần nộp lại', en: 'Resubmit' },
    suspended: { vi: 'Tạm ngưng', en: 'Suspended' },
    draft: { vi: copy.vi.dataPending, en: copy.en.dataPending },
  }
  return labels[status]?.[language] ?? workerVerificationLabel(status, language)
}

function formatWorkerDistricts(districts: string[] | null | undefined, language: AppLanguage) {
  if (!districts || districts.length === 0) return copy[language].dataPending
  return districts
    .map((district) => district.replace(/_/g, ' '))
    .map((district) => district.replace(/\bq(\d+)\b/i, language === 'vi' ? 'Quận $1' : 'District $1'))
    .join(', ')
}

function formatWorkerAreaLabel(area: string | null | undefined, language: AppLanguage) {
  const normalized = area?.trim()
  if (!normalized) return copy[language].dataPending
  if (language === 'vi') return normalized
  const districtMatch = normalized.match(/(?:quận|q\.?|district)\s*(\d+)/i)
  if (districtMatch?.[1]) return `District ${districtMatch[1]}`
  return normalized
}

function workerTimeChoiceLabel(value: string | null | undefined, language: AppLanguage) {
  if (value === 'now') return language === 'vi' ? 'Ngay bây giờ' : 'Now'
  if (value === 'scheduled') return language === 'vi' ? 'Theo lịch' : 'Scheduled'
  return copy[language].dataPending
}

function workerProblemSummaryLabel(deal: LocalDeal, language: AppLanguage) {
  const raw = deal.draft.description || deal.broadcast?.problemSummary || ''
  if (!raw) return copy[language].dataPending
  if (language === 'vi') return raw
  if (deal.draft.serviceType === 'electrical' || deal.broadcast?.serviceType === 'electrical') return 'Outlet or switch issue'
  if (deal.draft.serviceType === 'plumbing' || deal.broadcast?.serviceType === 'plumbing') return 'Plumbing issue'
  if (deal.draft.serviceType === 'cleaning' || deal.broadcast?.serviceType === 'cleaning') return 'Home cleaning request'
  return raw
}

function workerServiceRequestLabel(serviceType: ServiceType, language: AppLanguage) {
  if (language === 'vi') return serviceCopy[serviceType].vi.label
  const labels: Record<ServiceType, string> = {
    cleaning: 'Home cleaning',
    electrical: 'Electrical repair',
    plumbing: 'Plumbing repair',
  }
  return labels[serviceType]
}

function workerDocumentStatus(
  workerProfile: { has_cccd: boolean; has_selfie: boolean } | null | undefined,
  language: AppLanguage,
) {
  if (!workerProfile) return copy[language].dataPending
  if (workerProfile.has_cccd && workerProfile.has_selfie) return language === 'vi' ? 'Hồ sơ thợ' : 'Worker profile'
  if (workerProfile.has_cccd || workerProfile.has_selfie) return language === 'vi' ? 'Còn thiếu ảnh' : 'Partially submitted'
  return copy[language].dataPending
}

function workerProfileVerificationLabel(status: string | null | undefined, language: AppLanguage) {
  if (!status || status === 'draft') return language === 'vi' ? 'Chưa xác minh' : 'Not verified'
  return workerVerificationLabel(status, language)
}

function workerProfileVerificationShortLabel(status: string | null | undefined, language: AppLanguage) {
  if (!status || status === 'draft') return language === 'vi' ? 'Chưa duyệt' : 'Not approved'
  return workerVerificationShortLabel(status, language)
}

function workerProfileAvailabilityLabel(workerProfile: WorkerProfileSnapshot, language: AppLanguage) {
  if (workerProfile?.is_suspended) return language === 'vi' ? 'Tạm ngưng' : 'Suspended'
  if (workerProfile?.is_available) return language === 'vi' ? 'Sẵn sàng nhận việc' : 'Ready for jobs'
  return language === 'vi' ? 'Chưa bật nhận việc' : 'Not accepting jobs'
}

function workerProfileDocumentStatus(
  workerProfile: { has_cccd: boolean; has_selfie: boolean } | null | undefined,
  language: AppLanguage,
) {
  if (!workerProfile) return '0'
  if (workerProfile.has_cccd && workerProfile.has_selfie) return language === 'vi' ? 'Hồ sơ thợ' : 'Worker profile'
  if (workerProfile.has_cccd || workerProfile.has_selfie) return language === 'vi' ? 'Còn thiếu ảnh' : 'Partially submitted'
  return '0'
}

function workerProfileServiceSubtitle(workerProfile: WorkerProfileSnapshot, language: AppLanguage) {
  const serviceTypes = workerProfile?.service_types ?? []
  if (serviceTypes.length === 0) return language === 'vi' ? '0 dịch vụ' : '0 services'
  return serviceTypes.map((item) => serviceCopy[item][language].label).join(', ')
}

function workerProfileSkillsSummary(workerProfile: WorkerProfileSnapshot, language: AppLanguage) {
  const serviceTypes = workerProfile?.service_types ?? []
  if (serviceTypes.length === 0) return '0'
  return language === 'vi' ? `${formatMetric(serviceTypes.length, language)} dịch vụ` : `${formatMetric(serviceTypes.length, language)} services`
}

function formatWorkerRating(value: number | null | undefined, language: AppLanguage) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return language === 'vi' ? copy.vi.dataPending : 'Not yet'
  return `${value.toFixed(1)}/5`
}

function formatWorkerRatingOrZero(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '0.0'
  return value.toFixed(1)
}

function workerProfileRatingLabel(value: number | null | undefined) {
  return `${formatWorkerRatingOrZero(value)}/5`
}

function workerProfileRatingSummary(rating: number | null | undefined, totalJobs: number | null | undefined, language: AppLanguage) {
  const ratingValue = formatWorkerRatingOrZero(rating)
  const reviewCount = formatMetricOrZero(totalJobs, language)
  return language === 'vi' ? `★ ${ratingValue} (${reviewCount} đánh giá)` : `★ ${ratingValue} (${reviewCount} reviews)`
}

function workerHomeRatingDetail(
  rating: number | null | undefined,
  totalJobs: number | null | undefined,
  language: AppLanguage,
) {
  const stars = typeof rating === 'number' && Number.isFinite(rating) && rating > 0 ? '★★★★★' : '☆☆☆☆☆'
  const count = formatMetricOrZero(totalJobs, language)
  return language === 'vi' ? `${stars} · ${count} đánh giá` : `${stars} · ${count} reviews`
}

function formatPositiveMetric(value: number | null | undefined, language: AppLanguage) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return language === 'vi' ? copy.vi.dataPending : 'Not yet'
  return formatMetric(value, language)
}

function formatPositivePercent(value: number | null | undefined, language: AppLanguage) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return language === 'vi' ? copy.vi.dataPending : 'Not yet'
  return formatPercent(value, language)
}

function workerRecommendationSignal(responseRate: number | null | undefined, totalJobs: number | null | undefined, language: AppLanguage) {
  if (typeof responseRate === 'number' && Number.isFinite(responseRate) && responseRate > 0) return formatPercent(responseRate, language)
  if (typeof totalJobs === 'number' && Number.isFinite(totalJobs) && totalJobs > 0) {
    return formatPercent(Math.min(100, (totalJobs / 40) * 100), language)
  }
  return language === 'vi' ? copy.vi.dataPending : 'Not yet'
}

function workerProfileRecommendationSignal(responseRate: number | null | undefined, totalJobs: number | null | undefined, language: AppLanguage) {
  if (typeof responseRate === 'number' && Number.isFinite(responseRate) && responseRate > 0) return formatPercent(responseRate, language)
  if (typeof totalJobs === 'number' && Number.isFinite(totalJobs) && totalJobs > 0) {
    return formatPercent(Math.min(100, (totalJobs / 40) * 100), language)
  }
  return '0%'
}

function workerLevelFromJobs(totalJobs: number) {
  const points = Math.max(0, totalJobs)
  let level = 1
  for (let index = 0; index < workerProfileLevelThresholds.length; index += 1) {
    if (points >= workerProfileLevelThresholds[index]) level = index + 1
  }
  level = Math.min(level, workerLevelMax)
  const currentThreshold = workerProfileLevelThresholds[level - 1] ?? 0
  const nextThreshold = workerProfileLevelThresholds[level] ?? workerProfileLevelThresholds[workerProfileLevelThresholds.length - 1]
  const span = Math.max(1, nextThreshold - currentThreshold)
  return {
    level,
    nextThreshold,
    points,
    progress: Math.max(0, Math.min((points - currentThreshold) / span, 1)),
  }
}

function workerLevelTitle(level: number, language: AppLanguage) {
  const vi = ['Tiếp cận', 'Khởi đầu', 'Tiến bộ', 'Chuyên nghiệp', 'Tinh thông', 'Vững vàng', 'Ưu tú', 'Chuyên sâu', 'Bậc cao', 'Chuyên gia']
  const en = ['Entry', 'Starter', 'Progressing', 'Professional', 'Advanced', 'Steady', 'Elite', 'Specialist', 'Senior', 'Expert']
  const index = Math.max(0, Math.min(level - 1, workerProfileLevelMax - 1))
  return language === 'vi' ? `Thợ ${vi[index]}` : `${en[index]} worker`
}

function workerBadgeLabel(id: string, language: AppLanguage) {
  const labels: Record<string, Record<AppLanguage, string>> = {
    fast_responder: { vi: 'Phản hồi nhanh', en: 'Fast responder' },
    reliable_arrival: { vi: 'Đến đúng giờ', en: 'Reliable arrival' },
    steady_earner: { vi: 'Thu nhập đều', en: 'Steady earner' },
    trusted_by_customers: { vi: 'Khách tin cậy', en: 'Trusted' },
    verified_profile: { vi: 'Hồ sơ xác minh', en: 'Verified profile' },
  }
  return labels[id]?.[language] ?? id
}

function hasWorkerReputationSignals(
  insights: WorkerPerformanceInsightsSnapshot,
  workerProfile: WorkerProfileSnapshot,
) {
  return Boolean(
    (typeof insights?.average_rating === 'number' && insights.average_rating > 0)
    || (typeof insights?.completed_job_count === 'number' && insights.completed_job_count > 0)
    || (typeof insights?.response_rate_percent === 'number' && insights.response_rate_percent > 0)
    || (typeof workerProfile?.rating === 'number' && workerProfile.rating > 0)
    || (typeof workerProfile?.total_jobs === 'number' && workerProfile.total_jobs > 0),
  )
}

function workerRatingStars(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '☆☆☆☆☆'
  return '★★★★★'
}

function workerReviewPulseLabel(
  insights: WorkerPerformanceInsightsSnapshot,
  workerProfile: WorkerProfileSnapshot,
  language: AppLanguage,
) {
  const rating = formatWorkerRating(insights?.average_rating ?? workerProfile?.rating, language)
  const reviewCount = formatPositiveMetric(insights?.review_count, language)
  return `${rating} · ${reviewCount}`
}

function workerResponseTimeLabel(insights: WorkerPerformanceInsightsSnapshot, language: AppLanguage) {
  const minutes = formatPositiveMetric(insights?.average_response_minutes, language)
  const responded = formatPositiveMetric(insights?.responded_broadcast_count, language)
  const total = formatPositiveMetric(insights?.total_broadcast_count, language)
  if (!isPendingText(minutes) && !isPendingText(responded) && !isPendingText(total)) return `${minutes} ${language === 'vi' ? 'phút' : 'min'} · ${responded}/${total}`
  return copy[language].dataPending
}

function workerReputationEarningsLabel(
  insights: WorkerPerformanceInsightsSnapshot,
  workerEarnings: WorkerEarningsSnapshot,
  language: AppLanguage,
) {
  const amount = formatPositiveVnd(insights?.reconciled_earnings_vnd ?? workerEarnings?.net_earnings, language)
  const paidJobs = formatPositiveMetric(insights?.paid_job_count ?? workerEarnings?.total_jobs_paid, language)
  if (!isPendingText(amount) && !isPendingText(paidJobs)) return `${amount} · ${paidJobs}`
  return amount
}

function workerAxisLabel(id: string, language: AppLanguage) {
  const labels: Record<string, Record<AppLanguage, string>> = {
    arrival: { vi: 'Đúng giờ', en: 'Arrival' },
    completion: { vi: 'Hoàn tất', en: 'Completion' },
    earnings: { vi: 'Thu nhập', en: 'Earnings' },
    rating: { vi: 'Đánh giá', en: 'Rating' },
    response: { vi: 'Phản hồi', en: 'Response' },
  }
  return labels[id]?.[language] ?? id
}

function readDisplayName(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object') return null
  const record = metadata as Record<string, unknown>
  const value = record.display_name ?? record.full_name ?? record.name
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function displayWorkerName(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim().replace(/\s+/g, ' ')
  return normalized && normalized.length > 0 ? normalized : fallback
}

function workerChatGreeting(value: string | null | undefined, language: AppLanguage) {
  const normalized = value?.trim().replace(/\s+/g, ' ')
  if (language === 'vi') return `Xin chào, ${normalized || 'bạn'}`
  const hour = new Date().getHours()
  const moment = hour >= 11 && hour < 14 ? 'Lunch' : hour >= 12 && hour < 18 ? 'Afternoon' : hour < 12 ? 'Morning' : 'Evening'
  return `${moment}, ${normalized || 'there'}`
}

function workerVisibleAddressLabel(deal: LocalDeal | null, language: AppLanguage) {
  if (deal?.broadcast?.fullAddressVisible && deal.broadcast.fullAddressLabel) return deal.broadcast.fullAddressLabel
  const area = deal?.broadcast?.generalArea || deal?.draft.districtLabel || null
  if (!area) return copy[language].dataPending
  return language === 'vi' ? `Khu vực: ${area}` : `Area: ${area}`
}

function workerCaseCurrentLabel(deal: LocalDeal, language: AppLanguage) {
  if (deal.scopeChange && ['requested_by_worker', 'reviewing_by_kael', 'waiting_customer_decision'].includes(deal.scopeChange.status)) {
    return language === 'vi' ? 'Đang xét đổi phạm vi' : 'Scope under review'
  }
  if (hasWorkerStatus(deal.status, ['completed_by_worker', 'confirmed_by_customer'])) {
    return language === 'vi' ? 'Chờ tổng kết & xác nhận' : 'Waiting for summary and confirmation'
  }
  return statusLabel(deal.status, language)
}

type WorkerJobsPhase = 'active' | 'needs' | 'waiting'

function workerJobsPhase(deal: LocalDeal | null): WorkerJobsPhase {
  if (!deal) return 'waiting'
  if (deal.scopeChange && ['requested_by_worker', 'reviewing_by_kael', 'waiting_customer_decision'].includes(deal.scopeChange.status)) return 'needs'
  if (hasWorkerStatus(deal.status, ['scope_change_pending', 'completed_by_worker', 'confirmed_by_customer', 'reviewed'])) return 'needs'
  if (deal.broadcast?.status === 'accepted' || hasWorkerStatus(deal.status, ['worker_matched', 'worker_on_way', 'arrived', 'inspecting', 'repairing'])) return 'active'
  return 'waiting'
}

function canOpenWorkerNeedsPhase(deal: LocalDeal | null) {
  if (!deal) return false
  return workerJobsPhase(deal) !== 'waiting'
}

function normalizeWorkerJobsRoutePhase(tab: string | string[] | undefined, deal: LocalDeal | null): WorkerJobsPhase | undefined {
  const requested = Array.isArray(tab) ? tab[0] : tab
  if (requested !== 'active' && requested !== 'needs' && requested !== 'waiting') return undefined
  const actual = workerJobsPhase(deal)
  if (requested === 'needs') return canOpenWorkerNeedsPhase(deal) ? 'needs' : actual
  if (requested === 'active') return deal ? (actual === 'waiting' ? 'waiting' : 'active') : 'waiting'
  return actual === 'waiting' ? 'waiting' : actual
}

function normalizeWorkerMoneyStep(step: string | string[] | undefined): WorkerMoneyStep {
  const requested = Array.isArray(step) ? step[0] : step
  if (requested === 'method' || requested === 'withdraw' || requested === 'wallet') return requested
  return 'wallet'
}

function workerJobsPhaseCopy(phase: WorkerJobsPhase, language: AppLanguage) {
  const labels: Record<WorkerJobsPhase, Record<AppLanguage, { label: string; subtitle: string; title: string }>> = {
    active: {
      vi: { label: 'Đang làm', subtitle: 'Di chuyển, kiểm tra, sửa và checklist trong cùng job.', title: 'Giải quyết công việc đang xử lý' },
      en: { label: 'Active', subtitle: 'Travel, inspect, repair, and checklist stay on one job.', title: 'Active job' },
    },
    needs: {
      vi: { label: 'Cần xử lý', subtitle: 'Phát sinh phạm vi, bằng chứng hoặc báo cáo hoàn tất.', title: 'Việc cần xử lý' },
      en: { label: 'Needs', subtitle: 'Scope changes, evidence, or completion report.', title: 'Needs attention' },
    },
    waiting: {
      vi: { label: 'Chờ việc', subtitle: 'Tóm tắt cho thợ. Nhận hoặc từ chối yêu cầu trước khi mở địa chỉ.', title: 'Đơn chờ nhận' },
      en: { label: 'Waiting', subtitle: 'Worker brief and accept/decline before address release.', title: 'Waiting request' },
    },
  }
  return labels[phase][language]
}

function workerJobsPhaseContext(phase: WorkerJobsPhase, deal: LocalDeal | null, language: AppLanguage, surface?: string) {
  if (phase === 'needs') {
    if (surface === 'worker_job_summary') {
      return {
        label: workerJobsPhaseCopy(phase, language).label,
        subtitle: language === 'vi' ? 'Kael tổng hợp từ ghi chú và ảnh nghiệm thu thật.' : 'Kael summarizes real notes and completion photos.',
        title: language === 'vi' ? 'Tóm tắt giải quyết công việc' : 'Job summary',
      }
    }
    if (surface === 'worker_summary_report') {
      return {
        label: workerJobsPhaseCopy(phase, language).label,
        subtitle: language === 'vi' ? 'Báo cáo cuối chỉ đi tiếp sau khi bằng chứng hoàn tất đã đủ.' : 'Final report follows complete evidence only.',
        title: language === 'vi' ? 'Báo cáo công việc' : 'Work report',
      }
    }
    if (surface === 'worker_payment_gate') {
      return {
        label: workerJobsPhaseCopy(phase, language).label,
        subtitle: language === 'vi' ? 'Ví thu nhập, phương thức nhận tiền và rút tiền đi theo dữ liệu hệ thống.' : 'Income wallet, receiving method, and payout follow system data.',
        title: language === 'vi' ? 'Ví & giải ngân' : 'Wallet & payout',
      }
    }
    if (surface === 'worker_case_closed') {
      return {
        label: workerJobsPhaseCopy(phase, language).label,
        subtitle: language === 'vi' ? 'Giải quyết công việc chỉ đóng sau khi thanh toán đã được hệ thống ghi nhận.' : 'The work case closes only after the system records payment.',
        title: language === 'vi' ? 'Kết thúc giải quyết công việc' : 'Work case closed',
      }
    }
    if (!deal) {
      return {
        label: workerJobsPhaseCopy(phase, language).label,
        subtitle: language === 'vi' ? 'Chờ dữ liệu thật từ giải quyết công việc.' : 'Waiting for real job data.',
        title: language === 'vi' ? 'Cần dữ liệu thật' : 'Needs real data',
      }
    }
    if (hasWorkerStatus(deal.status, ['repairing']) && !deal.scopeChange) {
      return {
        label: workerJobsPhaseCopy(phase, language).label,
        subtitle: language === 'vi' ? 'Cần bằng chứng hoàn tất: ghi chú và ảnh trước khi báo cáo.' : 'Completion evidence needs notes and photos before reporting.',
        title: language === 'vi' ? 'Bằng chứng hoàn tất' : 'Completion evidence',
      }
    }
    if (hasWorkerStatus(deal.status, ['completed_by_worker', 'confirmed_by_customer', 'reviewed'])) {
      const hasEvidence = hasLocalDealCompletionEvidence(deal)
      return {
        label: workerJobsPhaseCopy(phase, language).label,
        subtitle: hasEvidence
          ? (language === 'vi' ? 'Kael tổng hợp từ bằng chứng hoàn tất thật trước khi báo cáo.' : 'Kael summarizes real completion evidence before the final report.')
          : (language === 'vi' ? 'Cần bằng chứng hoàn tất, thiếu ảnh nghiệm thu.' : 'Completion evidence is incomplete; photos are missing.'),
        title: hasEvidence
          ? (language === 'vi' ? 'Tóm tắt giải quyết công việc' : 'Job summary')
          : (language === 'vi' ? 'Cần bằng chứng hoàn tất' : 'Completion evidence needed'),
      }
    }
    return {
      label: workerJobsPhaseCopy(phase, language).label,
      subtitle: language === 'vi' ? 'Thay đổi phạm vi phải đi qua Kael; thợ không nhập giá trực tiếp.' : 'Scope changes go through Kael; workers do not enter price.',
      title: language === 'vi' ? 'Thay đổi phạm vi' : 'Scope change',
    }
  }
  if (phase === 'active' && deal && hasWorkerStatus(deal.status, ['completed_by_worker', 'confirmed_by_customer', 'reviewed'])) {
    return {
      label: workerJobsPhaseCopy(phase, language).label,
      subtitle: language === 'vi' ? 'Bằng chứng hoàn tất đã gửi, tiếp tục theo dõi từ cùng hồ sơ.' : 'Completion evidence is submitted and stays on this job record.',
      title: language === 'vi' ? 'Bằng chứng hoàn tất' : 'Completion evidence',
    }
  }
  return workerJobsPhaseCopy(phase, language)
}

function hasWorkerStatus(status: string | null | undefined, statuses: string[]) {
  return Boolean(status && statuses.includes(status))
}

function workerSafetyChecklistItems(deal: LocalDeal | null, language: AppLanguage) {
  if (!deal) return []
  const sources = [
    ...(deal.broadcast?.prebrief ?? []),
    deal.estimate?.advisory ?? '',
  ]
  const items: string[] = []
  for (const source of sources) {
    for (const candidate of splitWorkerSafetyChecklistSource(source)) {
      const item = normalizeWorkerSafetyChecklistItem(candidate)
      if (!item || !isWorkerSafetyChecklistCandidate(item)) continue
      items.push(item)
    }
  }
  return uniqueWorkerSafetyStrings(items).slice(0, 5)
}

function splitWorkerSafetyChecklistSource(source: string) {
  const trimmed = source.trim()
  if (!trimmed) return []
  const explicit = trimmed.match(/^(?:kael\s+)?(?:checklist|safety|safety notes?|an toàn|lưu ý an toàn)\s*[:：-]\s*(.+)$/i)
  const body = explicit?.[1] ?? trimmed
  return body
    .split(/\n|[•●]|(?:\s*;\s*)|(?:\s+\|\s+)/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeWorkerSafetyChecklistItem(value: string) {
  return value
    .replace(/^[-–—*✓✔\d.)\s]+/, '')
    .replace(/^(?:kael\s+)?(?:checklist|safety|safety notes?|an toàn|lưu ý an toàn)\s*[:：-]\s*/i, '')
    .trim()
}

function isWorkerSafetyChecklistCandidate(value: string) {
  const normalized = normalizeSearchText(value)
  if (normalized.length < 8) return false
  const rejectTerms = [
    'dia chi',
    'don gia',
    'gia ',
    'price',
    'earning',
    'kael da tom tat',
    'kael giu checklist',
    'giu boi canh',
    'bang chung trong cung ca',
    'chua co anh',
    'dang cho',
    'yeu cau da duoc nhan',
  ]
  if (rejectTerms.some((term) => normalized.includes(term))) return false
  const actionTerms = [
    'bao dam',
    'capture',
    'check',
    'chup',
    'close',
    'confirm',
    'dam bao',
    'do not',
    'dung',
    'giu',
    'kiem tra',
    'khoa',
    'khong',
    'mang',
    'ngat',
    'secure',
    'shut off',
    'tat',
    'tranh',
    'turn off',
    'use',
    'wear',
    'xac nhan',
  ]
  return actionTerms.some((term) => normalized.includes(term))
}

function workerSafetyChecklistEmptyLabel(serviceType: ServiceType | null, language: AppLanguage) {
  const serviceLabel = serviceType ? workerServiceRequestLabel(serviceType, language) : (language === 'vi' ? 'dịch vụ này' : 'this service')
  return language === 'vi'
    ? `Kael chưa tổng hợp checklist an toàn cho ${serviceLabel}.`
    : `Kael has not generated a safety checklist for ${serviceLabel} yet.`
}

function uniqueWorkerSafetyStrings(items: string[]) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of items) {
    const key = normalizeSearchText(item)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}

function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
}

function scopeChangeLabel(scopeChange: LocalDeal['scopeChange'], language: AppLanguage) {
  if (!scopeChange) return copy[language].dataPending
  const labels: Record<string, Record<AppLanguage, string>> = {
    approved: { vi: 'Kael đã duyệt phạm vi mới', en: 'Scope change approved' },
    rejected: { vi: 'Kael đã từ chối phạm vi mới', en: 'Scope change rejected' },
    requested_by_worker: { vi: 'Thợ đã gửi bằng chứng đổi phạm vi', en: 'Worker submitted scope evidence' },
    reviewing_by_kael: { vi: 'Kael đang kiểm tra bằng chứng', en: 'Kael is reviewing evidence' },
    waiting_customer_decision: { vi: 'Chờ khách xác nhận', en: 'Waiting for customer decision' },
  }
  return labels[scopeChange.status]?.[language] ?? scopeChange.status
}

function scopeChangeDeltaLabel(deal: LocalDeal | null, scopeChange: NonNullable<LocalDeal['scopeChange']>, language: AppLanguage) {
  const baselineMin = parseFirstVnd(deal?.estimate?.priceRangeLabel ?? deal?.broadcast?.estimatedPriceLabel ?? null)
  if (typeof scopeChange.priceMin === 'number' && Number.isFinite(scopeChange.priceMin) && typeof baselineMin === 'number') {
    const delta = scopeChange.priceMin - baselineMin
    if (delta > 0) return `+${formatPositiveVnd(delta, language)}`
  }
  if (scopeChange.priceMin && scopeChange.priceMax) {
    return `${formatPositiveVnd(scopeChange.priceMin, language)} - ${formatPositiveVnd(scopeChange.priceMax, language)}`
  }
  return copy[language].dataPending
}

function parseFirstVnd(label: string | null | undefined) {
  if (!label) return null
  const match = label.match(/(\d[\d.\s,]*)/)
  if (!match?.[1]) return null
  const value = Number(match[1].replace(/[^\d]/g, ''))
  return Number.isFinite(value) && value > 0 ? value : null
}

function formatEvidenceCount(count: number | null | undefined, language: AppLanguage) {
  if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) return copy[language].dataPending
  return language === 'vi' ? `${formatMetric(count, language)} ảnh` : `${formatMetric(count, language)} ${count === 1 ? 'photo' : 'photos'}`
}

function workerJobSummaryStatusLabel(deal: LocalDeal | null, language: AppLanguage) {
  if (!deal) return copy[language].dataPending
  if (hasLocalDealCompletionEvidence(deal)) return language === 'vi' ? 'Hoàn thiện' : 'Completed'
  return language === 'vi' ? 'Cần bổ sung bằng chứng' : 'Evidence needed'
}

function completionReviewStatusLabel(deal: LocalDeal | null, language: AppLanguage) {
  if (!deal) return copy[language].dataPending
  if (hasWorkerStatus(deal.status, ['reviewed'])) return language === 'vi' ? 'Đã hoàn tất đối soát' : 'Review completed'
  if (hasWorkerStatus(deal.status, ['confirmed_by_customer'])) return language === 'vi' ? 'Khách đã xác nhận, chờ Kael quyết định' : 'Customer confirmed, waiting for Kael'
  if (hasLocalDealCompletionEvidence(deal)) return language === 'vi' ? 'Chờ Kael đối soát' : 'Waiting for Kael review'
  return language === 'vi' ? 'Cần đủ ghi chú và ảnh' : 'Notes and photos required'
}

function workerSummaryReportChecklistItems(deal: LocalDeal | null, language: AppLanguage, confirmed: boolean) {
  const serviceType = deal?.draft.serviceType ?? deal?.broadcast?.serviceType ?? null
  const hasNote = Boolean(deal?.completionNotes?.trim())
  const hasPhotos = Boolean(deal?.completionPhotoUrls?.length)
  const serviceReviewLabel = workerSummaryServiceReviewLabel(serviceType, language)
  return [
    { done: hasNote, label: language === 'vi' ? 'Đã ghi nhận ghi chú hoàn tất' : 'Completion note recorded' },
    { done: hasPhotos, label: language === 'vi' ? 'Đã ghi nhận ảnh nghiệm thu' : 'Completion photos recorded' },
    { done: hasNote && hasPhotos, label: serviceReviewLabel },
    { done: confirmed, label: confirmed ? (language === 'vi' ? 'Khách hàng đã xác nhận' : 'Customer confirmed') : (language === 'vi' ? 'Chờ khách hàng xác nhận' : 'Waiting for customer confirmation') },
  ]
}

function workerSummaryServiceReviewLabel(serviceType: ServiceType | null, language: AppLanguage) {
  if (serviceType === 'electrical') return language === 'vi' ? 'Kael đối chiếu điểm điện và tải thử' : 'Kael reviews electrical point and load test'
  if (serviceType === 'plumbing') return language === 'vi' ? 'Kael đối chiếu điểm nước và rò rỉ' : 'Kael reviews plumbing point and leak evidence'
  if (serviceType === 'cleaning') return language === 'vi' ? 'Kael đối chiếu khu vực vệ sinh và ảnh sau' : 'Kael reviews cleaned area and after photos'
  return language === 'vi' ? 'Kael đối chiếu phạm vi hoàn tất' : 'Kael reviews completed scope'
}

function formatPositiveVnd(value: number | null | undefined, language: AppLanguage) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return copy[language].dataPending
  return formatVnd(value, language)
}

function statusLabel(status: string | null | undefined, language: AppLanguage) {
  if (!status) return copy[language].dataPending
  const vi: Record<string, string> = {
    analyzing: 'Kael đang phân tích',
    arrived: 'Thợ đã tới nơi',
    awaiting_customer_confirm: 'Chờ xác nhận',
    broadcasting: 'Đang tìm thợ',
    cancelled: 'Đã hủy',
    completed_by_worker: 'Thợ báo hoàn tất',
    confirmed_by_customer: 'Khách đã xác nhận',
    draft: 'Bản nháp',
    estimate_ready: 'Đã có ước tính',
    inspecting: 'Đang kiểm tra',
    paid: 'Đã thanh toán',
    repairing: 'Đang sửa',
    reviewed: 'Đã đánh giá',
    scope_change_pending: 'Chờ duyệt thay đổi',
    worker_matched: 'Thợ đã nhận',
    worker_on_way: 'Thợ đang di chuyển',
  }
  const en: Record<string, string> = {
    analyzing: 'Kael analyzing',
    arrived: 'Worker arrived',
    awaiting_customer_confirm: 'Waiting for confirmation',
    broadcasting: 'Finding worker',
    cancelled: 'Cancelled',
    completed_by_worker: 'Worker reported completion',
    confirmed_by_customer: 'Customer confirmed',
    draft: 'Draft',
    estimate_ready: 'Estimate ready',
    inspecting: 'Inspecting',
    paid: 'Paid',
    repairing: 'Repairing',
    reviewed: 'Reviewed',
    scope_change_pending: 'Scope change pending',
    worker_matched: 'Worker accepted',
    worker_on_way: 'Worker on the way',
  }
  return (language === 'vi' ? vi : en)[status] ?? status
}

function formatMetric(value: number | null | undefined, language: AppLanguage) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return copy[language].dataPending
  return new Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US').format(value)
}

function formatMetricOrZero(value: number | null | undefined, language: AppLanguage) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '0'
  return formatMetric(value, language)
}

function formatSecondsOrZero(value: number | null | undefined, language: AppLanguage) {
  const seconds = typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
  return language === 'vi' ? `${formatMetric(seconds, language)} giây` : `${formatMetric(seconds, language)} sec`
}

function formatBookingIntakeMessage(
  serviceType: ServiceType,
  problemChips: string[],
  description: string,
  districtLabel: string,
  timingMode: 'now' | 'scheduled',
  scheduledDateIso: string,
  language: AppLanguage,
) {
  const serviceLabel = serviceCopy[serviceType][language].label
  const issueLabel = problemChips.length > 0 ? problemChips.join(', ') : (language === 'vi' ? 'Theo mô tả' : 'From description')
  const areaLabel = districtLabel.trim() || copy[language].dataPending
  const scheduledDateLabel = formatBookingDateShort(scheduledDateIso, language)
  const timeLabel = timingMode === 'now'
    ? (language === 'vi' ? 'Đặt liền' : 'Book now')
    : (language === 'vi' ? `Đặt trước - ${scheduledDateLabel}` : `Schedule - ${scheduledDateLabel}`)
  return language === 'vi'
    ? `Dịch vụ: ${serviceLabel}\nVấn đề: ${issueLabel}\nKhu vực: ${areaLabel}\nThời gian: ${timeLabel}\nMô tả: ${description.trim()}`
    : `Service: ${serviceLabel}\nIssues: ${issueLabel}\nArea: ${areaLabel}\nTime: ${timeLabel}\nDescription: ${description.trim()}`
}

function addLocalDays(date: Date, days: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days))
}

function addLocalMonths(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))
}

function buildBookingCalendarWeeks(monthIso: string, selectedDateIso: string, todayIso: string): Array<Array<BookingCalendarCell | null>> {
  const monthDate = parseMonthIso(monthIso)
  const year = monthDate.getUTCFullYear()
  const monthIndex = monthDate.getUTCMonth()
  const firstDay = new Date(Date.UTC(year, monthIndex, 1))
  const dayOffset = (firstDay.getUTCDay() + BOOKING_CALENDAR_DAYS_PER_WEEK - 1) % BOOKING_CALENDAR_DAYS_PER_WEEK
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  const cells: Array<BookingCalendarCell | null> = []
  for (let index = 0; index < dayOffset; index += 1) cells.push(null)
  for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber += 1) {
    const isoDate = toLocalIsoDate(new Date(Date.UTC(year, monthIndex, dayNumber)))
    cells.push({
      dayNumber,
      disabled: isoDate < todayIso,
      isoDate,
      selected: isoDate === selectedDateIso,
      today: isoDate === todayIso,
    })
  }
  while (cells.length % BOOKING_CALENDAR_DAYS_PER_WEEK !== 0) cells.push(null)
  const weeks: Array<Array<BookingCalendarCell | null>> = []
  for (let index = 0; index < cells.length; index += BOOKING_CALENDAR_DAYS_PER_WEEK) {
    weeks.push(cells.slice(index, index + BOOKING_CALENDAR_DAYS_PER_WEEK))
  }
  return weeks
}

function formatBookingDateLong(dateIso: string, language: AppLanguage) {
  const date = parseLocalIsoDate(dateIso)
  const weekdayLabels = language === 'vi'
    ? ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy']
    : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return language === 'vi'
    ? `${weekdayLabels[date.getUTCDay()]}, ${formatBookingDateShort(dateIso, language)}`
    : `${weekdayLabels[date.getUTCDay()]}, ${formatBookingDateShort(dateIso, language)}`
}

function formatBookingDateShort(dateIso: string, language: AppLanguage) {
  const date = parseLocalIsoDate(dateIso)
  const day = String(date.getUTCDate()).padStart(2, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const year = String(date.getUTCFullYear())
  return language === 'vi' ? `${day}/${month}/${year}` : `${month}/${day}/${year}`
}

function formatBookingMonth(monthIso: string, language: AppLanguage) {
  const [year, month] = monthIso.split('-')
  return language === 'vi' ? `Tháng ${Number(month)}, ${year}` : `${month}/${year}`
}

function getDefaultScheduledDateIso() {
  return toLocalIsoDate(addLocalDays(parseLocalIsoDate(getVietnamTodayIso()), 1))
}

function getVietnamTodayIso(now = new Date()) {
  const vietnamDate = new Date(now.getTime() + VIETNAM_UTC_OFFSET_MS)
  const year = String(vietnamDate.getUTCFullYear())
  const month = String(vietnamDate.getUTCMonth() + 1).padStart(2, '0')
  const day = String(vietnamDate.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseLocalIsoDate(dateIso: string) {
  const [year, month, day] = dateIso.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function parseMonthIso(monthIso: string) {
  const [year, month] = monthIso.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, 1))
}

function toLocalIsoDate(date: Date) {
  const year = String(date.getUTCFullYear())
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toMonthIso(date: Date) {
  const year = String(date.getUTCFullYear())
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function pendingDraftToLocalDealDraft(pendingDraft: PendingKaelChatDraft, language: AppLanguage): LocalDealDraft {
  return {
    addressLabel: pendingDraft.addressLabel ?? pendingDraft.districtLabel ?? '',
    description: pendingDraft.message,
    districtLabel: pendingDraft.districtLabel ?? '',
    inferredProblemLabel: pendingDraft.problemChips?.[0] ?? null,
    mediaCount: pendingDraft.mediaCount ?? 0,
    needsServiceChoice: pendingDraft.serviceType === null,
    problemChips: pendingDraft.problemChips ?? [],
    serviceType: pendingDraft.serviceType,
    source: 'kael',
    timeChoice: 'now',
    unsupportedServiceLabel: pendingDraft.serviceType === null ? copy[language].dataPending : null,
  }
}

function agenticStageLabels(language: AppLanguage) {
  return language === 'vi'
    ? ['Tiếp nhận', 'Phân tích', 'Báo giá', 'Tìm thợ', 'Sửa chữa', 'Hoàn tất']
    : ['Intake', 'Analysis', 'Estimate', 'Matching', 'Repair', 'Done']
}

function activeAgenticStageIndex(status: string | null | undefined) {
  if (!status || status === 'draft') return 0
  if (status === 'analyzing') return 1
  if (status === 'estimate_ready' || status === 'awaiting_customer_confirm') return 2
  if (status === 'broadcasting' || status === 'worker_matched' || status === 'worker_on_way') return 3
  if (['arrived', 'inspecting', 'repairing', 'scope_change_pending', 'completed_by_worker'].includes(status)) return 4
  return 5
}

function kaelMemoryItems(memory: Record<string, unknown> | null, language: AppLanguage) {
  if (!memory) return []
  const rows: { label: string; value: string }[] = []
  const preferenceSummary = typeof memory.preference_summary === 'string' ? memory.preference_summary : null
  const memoryLanguage = typeof memory.language === 'string' ? memory.language : null
  const version = typeof memory.memory_version === 'number' ? memory.memory_version : null
  const lastObserved = typeof memory.last_observed_at === 'string' ? memory.last_observed_at : null
  if (preferenceSummary) rows.push({ label: language === 'vi' ? 'Tóm tắt sở thích' : 'Preference summary', value: preferenceSummary })
  if (memoryLanguage) rows.push({ label: language === 'vi' ? 'Ngôn ngữ' : 'Language', value: memoryLanguage.toUpperCase() })
  if (version !== null) rows.push({ label: language === 'vi' ? 'Phiên bản bộ nhớ' : 'Memory version', value: formatMetric(version, language) })
  if (lastObserved) rows.push({ label: language === 'vi' ? 'Cập nhật gần nhất' : 'Last observed', value: formatMemberSince(lastObserved, language) })
  return rows
}

function formatFraction(current: number | null | undefined, total: number | null | undefined, language: AppLanguage) {
  if (typeof current !== 'number' || typeof total !== 'number' || !Number.isFinite(current) || !Number.isFinite(total)) {
    return copy[language].dataPending
  }
  return `${formatMetric(current, language)} / ${formatMetric(total, language)}`
}

function formatFractionOrBlank(current: number | null | undefined, total: number | null | undefined, language: AppLanguage) {
  if (
    typeof current !== 'number' ||
    typeof total !== 'number' ||
    !Number.isFinite(current) ||
    !Number.isFinite(total)
  ) {
    return '0 / 0'
  }
  return formatFraction(current, total, language)
}

function formatFractionOrZero(current: number | null | undefined, total: number | null | undefined, language: AppLanguage) {
  return formatFractionOrBlank(current, total, language)
}

function formatMemberSince(value: string | null | undefined, language: AppLanguage) {
  if (!value) return copy[language].dataPending
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

function formatMemberSinceDaysOrBlank(value: string | null | undefined, language: AppLanguage, now = new Date()) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const elapsedMs = startOfLocalDay(now).getTime() - startOfLocalDay(date).getTime()
  const days = Math.max(0, Math.floor(elapsedMs / 86_400_000))
  const formatted = new Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US').format(days)
  return language === 'vi' ? `${formatted} ngày` : `${formatted} ${days === 1 ? 'day' : 'days'}`
}

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

function formatPercent(value: number | null | undefined, language: AppLanguage) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return copy[language].dataPending
  return `${Math.round(value)}%`
}

function formatPercentOrBlank(value: number | null | undefined, language: AppLanguage) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '0%'
  return formatPercent(value, language)
}

function formatPercentOrZero(value: number | null | undefined, language: AppLanguage) {
  return formatPercentOrBlank(value, language)
}

function formatVnd(value: number | null | undefined, language: AppLanguage) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return copy[language].dataPending
  const formatted = new Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US').format(value)
  return language === 'vi' ? `${formatted}đ` : `${formatted} VND`
}

function formatVndOrBlank(value: number | null | undefined, language: AppLanguage) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return formatVnd(0, language)
  return formatVnd(value, language)
}

function formatVndOrZero(value: number | null | undefined, language: AppLanguage) {
  return formatVndOrBlank(value, language)
}

const styles = StyleSheet.create({
  actionStack: {
    gap: spacing.sm,
    width: '100%',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  authStage: {
    alignSelf: 'center',
    gap: spacing.lg,
    maxWidth: 390,
    width: '100%',
  },
  brandCluster: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  centerCopy: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  centerText: {
    textAlign: 'center',
  },
  chatShell: {
    alignSelf: 'center',
    gap: spacing.lg,
    maxWidth: 720,
    width: '100%',
  },
  kaelLiveAuditComposerDock: {
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.screenHorizontalPadding,
    paddingTop: spacing.xs,
  },
  kaelHandoffFrame: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.screenHorizontalPadding,
    paddingVertical: spacing.lg,
  },
  kaelHandoffScrollFrame: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.screenHorizontalPadding,
    paddingVertical: spacing.lg,
  },
  kaelAuditScrollContent: {
    flexGrow: 1,
    paddingBottom: spacing.xxl,
  },
  kaelAuditPhoneShell: {
    alignSelf: 'center',
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderCurve: 'continuous',
    borderRadius: 32,
    borderWidth: 1,
    gap: spacing.md,
    maxWidth: 380,
    overflow: 'hidden',
    padding: spacing.lg,
    width: '100%',
    ...shadow.raised,
  },
  kaelAuditStatusBar: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 12,
    justifyContent: 'space-between',
  },
  kaelAuditStatusDot: {
    backgroundColor: color.text.secondary,
    borderRadius: radius.pill,
    height: 3,
    opacity: 0.45,
    width: 28,
  },
  kaelAuditStatusPill: {
    backgroundColor: color.surface.disabled,
    borderRadius: radius.pill,
    height: 4,
    opacity: 0.65,
    width: 44,
  },
  kaelAuditScreenTitle: {
    color: color.text.strong,
    textAlign: 'center',
  },
  kaelAuditPrimaryCta: {
    borderRadius: radius.pill,
    marginTop: spacing.sm,
  },
  kaelCareHeroCard: {
    alignItems: 'center',
    backgroundColor: color.brand.primaryDeep,
    borderColor: 'rgba(255,255,255,0.28)',
    borderCurve: 'continuous',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 106,
    overflow: 'hidden',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    position: 'relative',
  },
  kaelCareHeroSheen: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: radius.pill,
    height: 54,
    left: 14,
    opacity: 0.58,
    position: 'absolute',
    right: 18,
    top: -30,
    transform: [{ rotate: '-8deg' }],
  },
  kaelCareMascotSlot: {
    alignItems: 'center',
    height: 76,
    justifyContent: 'center',
    overflow: 'visible',
    width: 76,
  },
  kaelCareHeroCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  kaelCareRequestCode: {
    fontSize: typography.h3.fontSize,
    lineHeight: typography.h3.lineHeight,
  },
  kaelCareScoreBlock: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.lg,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  kaelCareScoreLabel: {
    flexShrink: 0,
    minWidth: 96,
  },
  kaelCareScoreValueStack: {
    alignItems: 'center',
    flex: 1,
    gap: 0,
  },
  kaelCareScoreValue: {
    color: color.brand.primaryDeep,
    fontSize: 42,
    lineHeight: 46,
  },
  kaelCareRows: {
    borderTopColor: color.surface.stroke,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  kaelCareRow: {
    alignItems: 'center',
    borderBottomColor: color.surface.stroke,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    minHeight: 44,
    paddingVertical: spacing.sm,
  },
  kaelCareRowLabel: {
    flexShrink: 0,
    minWidth: 104,
  },
  kaelCareRowValue: {
    color: color.text.strong,
    flex: 1,
    textAlign: 'right',
  },
  matchingHeadline: {
    color: color.text.strong,
    marginTop: spacing.xs,
  },
  matchingScoreHero: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.lg,
    justifyContent: 'center',
    minHeight: MATCHING_AI_SCORE_MASCOT_SIZE,
  },
  matchingScoreMascotSlot: {
    alignItems: 'flex-start',
    justifyContent: 'center',
    width: MATCHING_AI_SCORE_MASCOT_SIZE - spacing.xxl,
  },
  matchingScoreMascotImage: {
    transform: [
      { translateX: MATCHING_AI_SCORE_MASCOT_LEFT_OFFSET },
      { scale: MATCHING_AI_SCORE_MASCOT_VISUAL_SCALE },
    ],
  },
  matchingScoreCopy: {
    alignItems: 'center',
    gap: spacing.xxs,
    height: MATCHING_AI_SCORE_MASCOT_SIZE,
    justifyContent: 'center',
    width: MATCHING_AI_SCORE_COPY_WIDTH,
    zIndex: 1,
  },
  matchingScoreValue: {
    color: color.brand.primaryDeep,
    fontSize: 50,
    includeFontPadding: false,
    lineHeight: 56,
    textAlign: 'center',
    width: '100%',
  },
  matchingScoreLabel: {
    includeFontPadding: false,
    textAlign: 'center',
    width: '100%',
  },
  matchingScorePending: {
    color: color.brand.primaryDeep,
    includeFontPadding: false,
    maxWidth: MATCHING_AI_SCORE_COPY_WIDTH,
    textAlign: 'center',
  },
  matchingWorkerCard: {
    backgroundColor: color.surface.soft,
    borderColor: color.surface.stroke,
    borderCurve: 'continuous',
    borderRadius: 24,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  matchingWorkerIdentity: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  matchingWorkerCopy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  matchingWorkerName: {
    color: color.text.strong,
    fontSize: 18,
    lineHeight: 23,
  },
  matchingWorkerFacts: {
    gap: spacing.xs,
  },
  workerAvatarTile: {
    alignItems: 'center',
    backgroundColor: color.surface.mint,
    borderColor: color.surface.strokeStrong,
    borderCurve: 'continuous',
    borderRadius: radius.lg,
    borderWidth: 1,
    height: component.iconTile.size + spacing.md,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: component.iconTile.size + spacing.md,
    ...shadow.soft,
  },
  workerAvatarFallbackIcon: {
    height: component.iconTile.visualSize,
    width: component.iconTile.visualSize,
  },
  workerAvatarPhoto: {
    height: '100%',
    width: '100%',
  },
  matchingKaelNote: {
    alignItems: 'center',
    backgroundColor: color.surface.mint,
    borderColor: color.surface.stroke,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 58,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  matchingKaelNoteText: {
    color: color.text.secondary,
    lineHeight: 17,
    maxWidth: 260,
    textAlign: 'center',
  },
  agenticChecklist: {
    gap: spacing.sm,
  },
  agenticChecklistRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 36,
  },
  agenticChecklistLabel: {
    flex: 1,
    minWidth: 0,
  },
  agenticStepDoneIcon: {
    alignItems: 'center',
    backgroundColor: color.surface.mint,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  agenticStepPendingIcon: {
    backgroundColor: color.surface.soft,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 18,
    marginHorizontal: 3,
    width: 18,
  },
  agenticSummaryPanel: {
    backgroundColor: color.surface.mint,
    borderColor: color.surface.stroke,
    borderCurve: 'continuous',
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  customerPaymentQrPanel: {
    alignItems: 'center',
    backgroundColor: color.surface.mint,
    borderColor: color.surface.strokeStrong,
    borderCurve: 'continuous',
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    justifyContent: 'center',
    minHeight: 226,
    padding: spacing.lg,
  },
  customerPaymentQrImage: {
    aspectRatio: 1,
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderCurve: 'continuous',
    borderRadius: radius.md,
    borderWidth: 1,
    height: 180,
    width: 180,
  },
  customerPaymentQrCopy: {
    alignItems: 'center',
    gap: spacing.xs,
    width: '100%',
  },
  customerPaymentQrPlaceholder: {
    alignItems: 'center',
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderCurve: 'continuous',
    borderRadius: radius.md,
    borderWidth: 1,
    height: 180,
    justifyContent: 'center',
    width: 180,
  },
  agenticStrongValue: {
    color: color.brand.primaryDeep,
  },
  agenticQuoteRows: {
    gap: spacing.sm,
  },
  agenticQuoteRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 46,
  },
  agenticQuoteLabel: {
    flex: 1,
    minWidth: 0,
  },
  agenticQuoteValue: {
    color: color.brand.primaryDeep,
    flexShrink: 0,
    textAlign: 'right',
  },
  agenticDivider: {
    backgroundColor: color.surface.stroke,
    height: StyleSheet.hairlineWidth,
  },
  agenticDisclosure: {
    lineHeight: 18,
    textAlign: 'center',
  },
  agenticMapPanel: {
    backgroundColor: color.surface.mint,
    borderColor: color.surface.stroke,
    borderCurve: 'continuous',
    borderRadius: 24,
    borderWidth: 1,
    gap: spacing.md,
    minHeight: 150,
    padding: spacing.lg,
  },
  agenticMapPanelDisabled: {
    opacity: 0.78,
  },
  agenticMapProviderHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  agenticMapProviderCopy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  agenticMapProviderRoute: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  agenticMapProviderNode: {
    backgroundColor: color.surface.base,
    borderColor: color.brand.primary,
    borderRadius: radius.pill,
    borderWidth: 3,
    height: 22,
    width: 22,
  },
  agenticMapProviderNodeStrong: {
    backgroundColor: color.brand.primary,
    borderColor: color.surface.base,
  },
  agenticMapProviderLine: {
    backgroundColor: color.surface.strokeStrong,
    flex: 1,
    height: 3,
  },
  agenticMapProviderAction: {
    alignSelf: 'center',
    backgroundColor: glass.bgStrong,
    borderColor: color.surface.stroke,
    borderRadius: radius.pill,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  agenticEtaRows: {
    gap: spacing.sm,
  },
  agenticEndingHero: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  agenticHero: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
  },
  agenticHeroCopy: {
    flex: 1,
    gap: spacing.sm,
    minWidth: 220,
  },
  agenticStageRail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chatMessageStack: {
    gap: spacing.sm,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  activityFilterTab: {
    alignItems: 'center',
    backgroundColor: color.surface.soft,
    borderColor: color.surface.stroke,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexGrow: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  activityFilterTabActive: {
    backgroundColor: color.surface.mint,
    borderColor: color.brand.primary,
  },
  activityFilterTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  activityEmptyCard: {
    alignItems: 'center',
    gap: spacing.md,
  },
  activityHero: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.lg,
    justifyContent: 'space-between',
  },
  activityHeroMascot: {
    alignItems: 'center',
    flexShrink: 0,
    justifyContent: 'center',
    width: 112,
  },
  activityTimeline: {
    gap: spacing.sm,
  },
  activityPhaseCard: {
    gap: spacing.md,
  },
  activityPhaseHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  activityPhaseHeaderCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  activityPhaseProgress: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  activityPhaseProgressDot: {
    backgroundColor: color.surface.stroke,
    borderRadius: radius.pill,
    flex: 1,
    height: 5,
  },
  activityPhaseProgressDotActive: {
    backgroundColor: color.brand.primary,
  },
  activityPhaseRow: {
    backgroundColor: color.surface.soft,
    borderColor: color.surface.stroke,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xxs,
    padding: spacing.sm,
  },
  activityPhaseRows: {
    gap: spacing.sm,
  },
  bookingChoiceCluster: {
    gap: spacing.xs,
  },
  bookingCompactField: {
    gap: spacing.xxs,
  },
  bookingCompactInput: {
    fontSize: typography.caption.fontSize,
    lineHeight: typography.caption.lineHeight,
    minHeight: 36,
  },
  bookingCompactInputShell: {
    borderRadius: radius.md,
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  bookingCoreCard: {
    gap: spacing.sm,
    padding: spacing.md,
  },
  guestGateHero: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  bookingEvidenceInline: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  bookingOptionBlock: {
    gap: spacing.xs,
  },
  bookingCalendarDay: {
    alignItems: 'center',
    backgroundColor: color.surface.soft,
    borderColor: color.surface.stroke,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: BOOKING_CALENDAR_DAY_SIZE,
  },
  bookingCalendarDayDisabled: {
    backgroundColor: color.surface.disabled,
    opacity: component.button.disabled.opacity,
  },
  bookingCalendarDayEmpty: {
    opacity: 0,
  },
  bookingCalendarDaySelected: {
    backgroundColor: color.surface.mint,
    borderColor: color.brand.primary,
    ...shadow.soft,
  },
  bookingCalendarDayToday: {
    borderColor: color.surface.strokeStrong,
  },
  bookingCalendarGrid: {
    gap: spacing.xs,
  },
  bookingCalendarHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  bookingCalendarMonthLabel: {
    minWidth: BOOKING_TIMING_ICON_SHELL_SIZE + spacing.xxl,
    textAlign: 'center',
  },
  bookingCalendarNavButton: {
    alignItems: 'center',
    backgroundColor: color.surface.mint,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: BOOKING_CALENDAR_NAV_SIZE,
    justifyContent: 'center',
    width: BOOKING_CALENDAR_NAV_SIZE,
  },
  bookingCalendarNavButtonDisabled: {
    backgroundColor: color.surface.disabled,
    borderColor: color.surface.stroke,
  },
  bookingCalendarNavRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  bookingCalendarPanel: {
    backgroundColor: color.surface.soft,
    borderColor: color.surface.stroke,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  bookingCalendarTitleStack: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  bookingCalendarWeekday: {
    flex: 1,
    textAlign: 'center',
  },
  bookingCalendarWeekdayRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  bookingCalendarWeekRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  bookingServiceCard: {
    alignItems: 'center',
    backgroundColor: color.surface.soft,
    borderColor: color.surface.stroke,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexBasis: BOOKING_SERVICE_CARD_MIN_WIDTH,
    flexGrow: 1,
    gap: spacing.sm,
    minHeight: BOOKING_SERVICE_CARD_MIN_HEIGHT,
    minWidth: BOOKING_SERVICE_CARD_MIN_WIDTH,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  bookingServiceCardSelected: {
    backgroundColor: color.surface.mint,
    borderColor: color.brand.primary,
    ...shadow.soft,
  },
  bookingServiceCopy: {
    alignItems: 'center',
    gap: spacing.xxs,
  },
  bookingServiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  bookingServiceIcon: {
    height: BOOKING_SERVICE_ICON_SIZE,
    width: BOOKING_SERVICE_ICON_SIZE,
  },
  bookingServiceIconShell: {
    alignItems: 'center',
    backgroundColor: color.surface.mint,
    borderColor: color.surface.stroke,
    borderRadius: radius.lg,
    borderWidth: 1,
    height: BOOKING_SERVICE_ICON_SHELL_SIZE,
    justifyContent: 'center',
    width: BOOKING_SERVICE_ICON_SHELL_SIZE,
  },
  bookingServiceIconShellSelected: {
    backgroundColor: color.mint.mint50,
    borderColor: color.surface.strokeStrong,
  },
  bookingServiceLabel: {
    textAlign: 'center',
  },
  bookingServiceNote: {
    textAlign: 'center',
  },
  bookingTimingCard: {
    alignItems: 'center',
    backgroundColor: color.surface.soft,
    borderColor: color.surface.stroke,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexBasis: BOOKING_TIMING_CARD_MIN_WIDTH,
    flexDirection: 'row',
    flexGrow: 1,
    gap: spacing.sm,
    minHeight: BOOKING_TIMING_CARD_MIN_HEIGHT,
    minWidth: BOOKING_TIMING_CARD_MIN_WIDTH,
    padding: spacing.md,
  },
  bookingTimingCardSelected: {
    backgroundColor: color.surface.mint,
    borderColor: color.brand.primary,
    ...shadow.soft,
  },
  bookingTimingCopy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  bookingTimingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  bookingTimingIcon: {
    height: BOOKING_TIMING_ICON_SIZE,
    width: BOOKING_TIMING_ICON_SIZE,
  },
  bookingTimingIconShell: {
    alignItems: 'center',
    backgroundColor: color.surface.mint,
    borderColor: color.surface.stroke,
    borderRadius: radius.md,
    borderWidth: 1,
    height: BOOKING_TIMING_ICON_SHELL_SIZE,
    justifyContent: 'center',
    width: BOOKING_TIMING_ICON_SHELL_SIZE,
  },
  bookingTimingIconShellSelected: {
    backgroundColor: color.mint.mint50,
    borderColor: color.surface.strokeStrong,
  },
  caseStageBadge: {
    alignItems: 'center',
    backgroundColor: color.surface.mint,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  caseStageCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 70,
    padding: spacing.md,
  },
  caseStageHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  customerCoreSectionCard: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  customerFlowGreeting: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  customerFlowGreetingIdentity: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  customerFlowMascotBadge: {
    alignItems: 'center',
    backgroundColor: color.surface.mint,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 58,
    justifyContent: 'center',
    overflow: 'visible',
    width: 58,
  },
  customerFlowTitle: {
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xs,
  },
  customerFlowTitleCompact: {
    gap: spacing.xxs,
  },
  customerHomeCopy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  customerHomeHero: {
    alignItems: 'center',
    backgroundColor: color.surface.mint,
    flexDirection: 'row',
    gap: spacing.lg,
    justifyContent: 'space-between',
    minHeight: 118,
    padding: spacing.lg,
  },
  customerHomeMascot: {
    alignItems: 'center',
    flexShrink: 0,
    justifyContent: 'center',
    width: 112,
  },
  customerTrackingEmpty: {
    alignItems: 'center',
    backgroundColor: color.surface.soft,
    borderColor: color.surface.stroke,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  customerTrackingHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  customerTrackingRows: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  customerRefreshButton: {
    alignItems: 'center',
    backgroundColor: color.surface.soft,
    borderColor: color.surface.stroke,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  customerAvatarImage: {
    height: 76,
    width: 76,
  },
  customerAvatarShell: {
    alignItems: 'center',
    backgroundColor: color.surface.mint,
    borderColor: color.surface.strokeStrong,
    borderCurve: 'continuous',
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 96,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 96,
    ...shadow.soft,
  },
  customerAvatarEdge: {
    backgroundColor: glass.innerHighlight,
    borderRadius: radius.pill,
    height: 1,
    left: spacing.lg,
    opacity: 0.76,
    position: 'absolute',
    right: spacing.lg,
    top: spacing.sm,
    zIndex: 1,
  },
  customerBulletList: {
    gap: spacing.xs,
  },
  customerBulletRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  customerGaugeScore: {
    color: color.brand.primaryDark,
    textAlign: 'center',
  },
  customerGaugeShell: {
    alignItems: 'center',
    height: 172,
    justifyContent: 'center',
    width: 206,
  },
  customerGaugeValueLayer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    top: 58,
  },
  customerIdentityCopy: {
    flex: 1,
    gap: spacing.sm,
    minWidth: 210,
  },
  customerComponentAura: {
    opacity: 0.42,
  },
  customerComponentEdge: {
    backgroundColor: glass.innerHighlight,
    borderRadius: radius.pill,
    height: 1,
    left: spacing.md,
    opacity: 0.72,
    position: 'absolute',
    right: spacing.md,
    top: spacing.xs,
  },
  customerComponentInnerDepth: {
    borderColor: 'rgba(8, 95, 87, 0.055)',
    borderRadius: radius.lg,
    borderWidth: 1,
    bottom: 1,
    left: 1,
    opacity: 0.72,
    position: 'absolute',
    right: 1,
    top: 1,
  },
  customerInfoBadge: {
    alignItems: 'center',
    backgroundColor: component.button.ghost.bg,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 20,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 20,
  },
  customerInfoBadgeGlow: {
    backgroundColor: color.mint.mint50,
    borderRadius: radius.pill,
    bottom: -4,
    left: -4,
    opacity: 0.72,
    position: 'absolute',
    right: -4,
    top: -4,
  },
  customerInfoBand: {
    alignItems: 'center',
    backgroundColor: glass.bgStrong,
    borderColor: color.surface.strokeStrong,
    borderCurve: 'continuous',
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    minHeight: 56,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    position: 'relative',
    ...shadow.soft,
  },
  customerInfoBandCell: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minWidth: 0,
  },
  customerInfoBandCopy: {
    gap: 0,
    minWidth: 0,
  },
  customerInfoBandIcon: {
    height: 30,
    width: 30,
  },
  customerInlineAction: {
    alignItems: 'center',
    backgroundColor: component.button.ghost.bg,
    borderColor: component.button.ghost.border,
    borderCurve: 'continuous',
    borderRadius: component.button.ghost.radius,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 28,
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    position: 'relative',
  },
  customerInlineActionEdge: {
    backgroundColor: glass.innerHighlight,
    height: 1,
    left: spacing.sm,
    opacity: 0.78,
    position: 'absolute',
    right: spacing.sm,
    top: 4,
  },
  customerPressFeedback: {
    opacity: 0.88,
    transform: [{ scale: 0.975 }],
  },
  customerNameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  customerNumberGlyph: {
    letterSpacing: 0,
  },
  customerOverviewHero: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    paddingTop: spacing.xs,
  },
  customerProfileEmail: {
    flexShrink: 1,
  },
  customerProfileFlowScreen: {
    gap: spacing.sm,
    minHeight: 790,
  },
  customerProfileFlowTitle: {
    alignItems: 'center',
    paddingTop: spacing.xs,
  },
  customerProfileName: {
    flexShrink: 1,
  },
  customerProfileBlock: {
    gap: spacing.md,
    position: 'relative',
    zIndex: 2,
  },
  customerProfileBlockOverview: {
    minHeight: 0,
  },
  customerProfileBlockProtection: {
    minHeight: 0,
  },
  customerProfileBlockRanking: {
    minHeight: 0,
  },
  customerProfilePanel: {
    gap: spacing.lg,
    padding: spacing.cardPaddingLarge,
  },
  customerProfileUnifiedPanel: {
    gap: spacing.lg,
    overflow: 'hidden',
    paddingHorizontal: spacing.cardPaddingLarge,
    paddingVertical: spacing.xl,
    position: 'relative',
    ...shadow.raised,
  },
  customerProfileSectionTitle: {
    color: color.text.primary,
  },
  customerProgressFill: {
    backgroundColor: color.brand.primary,
    borderRadius: radius.pill,
    height: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  customerProgressFillSheen: {
    backgroundColor: 'rgba(255,255,255,0.58)',
    height: 1,
    left: spacing.xs,
    position: 'absolute',
    right: spacing.xs,
    top: 1,
  },
  customerProgressLabels: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    width: '100%',
  },
  customerProgressTrack: {
    backgroundColor: color.surface.disabled,
    borderRadius: radius.pill,
    height: 7,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  customerProgressTrackEdge: {
    backgroundColor: glass.innerHighlight,
    height: 1,
    left: spacing.xs,
    opacity: 0.68,
    position: 'absolute',
    right: spacing.xs,
    top: 1,
    zIndex: 1,
  },
  customerProtectionBadgeImage: {
    height: 44,
    width: 44,
  },
  customerProtectionBadgeValue: {
    minHeight: 22,
  },
  customerProtectionCopy: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 160,
  },
  customerProtectionGaugeColumn: {
    alignItems: 'center',
    flex: 1,
    minWidth: 180,
  },
  customerProtectionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  customerProtectionHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    minHeight: 188,
  },
  customerProtectionHeaderRowCompact: {
    justifyContent: 'center',
    minHeight: 166,
  },
  customerProtectionNote: {
    backgroundColor: color.surface.mint,
    borderColor: color.surface.strokeStrong,
    borderCurve: 'continuous',
    borderRadius: radius.lg,
    borderWidth: 1,
    minHeight: 76,
    overflow: 'hidden',
    padding: spacing.md,
    position: 'relative',
  },
  customerProtectionPillIcon: {
    height: 24,
    width: 24,
  },
  customerProtectionStatusPill: {
    alignItems: 'center',
    backgroundColor: component.chip.selected.bg,
    borderColor: component.chip.selected.border,
    borderCurve: 'continuous',
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: -spacing.md,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    position: 'relative',
  },
  customerProtectionStatusPillText: {
    color: component.chip.selected.text,
  },
  customerProtectionTile: {
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderCurve: 'continuous',
    borderRadius: radius.lg,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    gap: spacing.xs,
    justifyContent: 'space-between',
    minHeight: 116,
    minWidth: 0,
    overflow: 'hidden',
    padding: spacing.md,
    position: 'relative',
    ...shadow.soft,
  },
  customerProtectionTileBody: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  customerProtectionTileCopy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  customerProtectionTileCopyBadge: {
    paddingLeft: spacing.xs,
  },
  customerProtectionTileCopyMetric: {
    paddingLeft: spacing.sm,
  },
  customerProtectionTileHighlighted: {
    backgroundColor: color.surface.mint,
    borderColor: color.surface.strokeStrong,
  },
  customerProtectionTileValue: {
    color: color.brand.primaryDark,
    minHeight: 32,
  },
  customerProtectionTileValueBlank: {
    minHeight: 20,
  },
  customerProtectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  customerQuickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  customerRankBadgeImage: {
    height: 58,
    width: 58,
  },
  customerRankCardsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  customerRankDetailCard: {
    backgroundColor: color.surface.mint,
    borderColor: color.surface.strokeStrong,
    borderCurve: 'continuous',
    borderRadius: radius.lg,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    gap: spacing.sm,
    justifyContent: 'space-between',
    minHeight: 140,
    minWidth: 0,
    overflow: 'hidden',
    padding: spacing.md,
    position: 'relative',
    ...shadow.soft,
  },
  customerRankDetailCopy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 104,
  },
  customerRankDetailMainRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
  },
  customerRankDetailProgress: {
    gap: spacing.xs,
    width: '100%',
  },
  customerRankDetailProgressLabel: {
    textAlign: 'right',
  },
  customerRankHeroCard: {
    alignItems: 'stretch',
    backgroundColor: glass.bgStrong,
    borderColor: color.surface.strokeStrong,
    borderCurve: 'continuous',
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    minHeight: 132,
    overflow: 'hidden',
    padding: spacing.md,
    position: 'relative',
    ...shadow.soft,
  },
  customerRankHeroCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  customerRankHeroEyebrow: {
    alignSelf: 'flex-start',
  },
  customerRankHeroTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  customerRankLadderOfficial: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
    position: 'relative',
  },
  customerRankLadderLine: {
    backgroundColor: color.surface.stroke,
    height: 2,
    left: 28,
    opacity: 0.86,
    position: 'absolute',
    right: 28,
    top: 39,
  },
  customerRankMetricRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  customerRankOrb: {
    alignItems: 'center',
    backgroundColor: color.mint.mint50,
    borderColor: color.surface.strokeStrong,
    borderCurve: 'continuous',
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 76,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 76,
  },
  customerRankOrbAura: {
    opacity: 0.76,
  },
  customerRankOrbEdge: {
    backgroundColor: glass.innerHighlight,
    borderRadius: radius.pill,
    height: 1,
    left: spacing.md,
    opacity: 0.72,
    position: 'absolute',
    right: spacing.md,
    top: spacing.sm,
  },
  customerRankOrbPending: {
    maxWidth: 82,
    textAlign: 'center',
  },
  customerRankOrbValue: {
    color: color.brand.primaryDark,
    textAlign: 'center',
  },
  customerRankStepCluster: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.xs,
    minWidth: 54,
  },
  customerRankStepLabel: {
    textAlign: 'center',
  },
  customerRankStepNumber: {
    color: color.brand.primaryDark,
    fontWeight: typography.h2.fontWeight,
    textAlign: 'center',
  },
  customerRankStepSelectedBadge: {
    alignItems: 'center',
    backgroundColor: color.surface.base,
    borderColor: component.chip.selected.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 20,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.xs,
    top: spacing.xs,
    width: 20,
    zIndex: 2,
  },
  customerRankStepOfficial: {
    alignItems: 'center',
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderCurve: 'continuous',
    borderRadius: radius.lg,
    borderWidth: 1,
    height: 68,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  customerRankStepOfficialSelected: {
    backgroundColor: component.chip.selected.bg,
    borderColor: color.brand.primary,
    borderWidth: 2,
    ...shadow.soft,
  },
  customerRankStepAura: {
    opacity: 0.72,
  },
  customerRankStepEdge: {
    backgroundColor: glass.innerHighlight,
    borderRadius: radius.pill,
    height: 1,
    left: spacing.sm,
    opacity: 0.72,
    position: 'absolute',
    right: spacing.sm,
    top: spacing.xs,
  },
  customerRankRequirementLabel: {
    marginTop: spacing.xs,
  },
  customerSectionHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  customerStatusDot: {
    backgroundColor: color.accent.success,
    borderColor: color.mint.mint100,
    borderRadius: radius.pill,
    borderWidth: 2,
    height: 18,
    width: 18,
  },
  customerUtilityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  customerUtilityIcon: {
    height: 40,
    width: 40,
  },
  customerUtilityIconShell: {
    alignItems: 'center',
    backgroundColor: color.surface.mint,
    borderColor: color.surface.stroke,
    borderCurve: 'continuous',
    borderRadius: radius.lg,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 52,
  },
  customerUtilityLabel: {
    lineHeight: typography.caption.lineHeight,
    minHeight: typography.caption.lineHeight * 2,
    textAlign: 'center',
    width: '100%',
  },
  customerUtilitySquare: {
    alignItems: 'center',
    backgroundColor: component.button.secondary.bg,
    borderColor: component.button.secondary.border,
    borderCurve: 'continuous',
    borderRadius: radius.lg,
    borderWidth: 1,
    flexBasis: '22%',
    flexGrow: 1,
    gap: spacing.sm,
    justifyContent: 'flex-start',
    minHeight: 112,
    minWidth: 0,
    overflow: 'hidden',
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.sm,
    paddingTop: spacing.md,
    position: 'relative',
    ...shadow.soft,
  },
  customerTileAura: {
    opacity: 0.34,
  },
  customerTileEdge: {
    backgroundColor: glass.innerHighlight,
    borderRadius: radius.pill,
    height: 1,
    left: spacing.md,
    opacity: 0.68,
    position: 'absolute',
    right: spacing.md,
    top: spacing.xs,
  },
  customerTileInnerDepth: {
    borderColor: 'rgba(8, 95, 87, 0.045)',
    borderRadius: radius.lg,
    borderWidth: 1,
    bottom: 1,
    left: 1,
    opacity: 0.64,
    position: 'absolute',
    right: 1,
    top: 1,
  },
  customerValueTile: {
    alignItems: 'center',
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderCurve: 'continuous',
    borderRadius: radius.lg,
    borderWidth: 1,
    flexBasis: '31%',
    flexGrow: 1,
    gap: spacing.xxs,
    justifyContent: 'center',
    minHeight: 96,
    minWidth: 0,
    overflow: 'hidden',
    padding: spacing.md,
    position: 'relative',
    ...shadow.soft,
  },
  customerValueTileCompact: {
    flexBasis: '23%',
    gap: 0,
    justifyContent: 'flex-start',
    minHeight: 76,
    minWidth: 0,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  customerValueTileCompactLabel: {
    lineHeight: typography.caption.lineHeight,
    minHeight: typography.caption.lineHeight * 2,
    textAlignVertical: 'center',
  },
  customerValueTileCompactLabelSlot: {
    alignItems: 'center',
    height: typography.caption.lineHeight * 2,
    justifyContent: 'center',
    width: '100%',
  },
  customerValueTileCompactValueSlot: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: '100%',
  },
  customerValueTileLabel: {
    textAlign: 'center',
  },
  customerValueTileValue: {
    color: color.text.strong,
    minHeight: 32,
    textAlign: 'center',
  },
  customerValueTileValueCompact: {
    minHeight: 28,
  },
  customerValueTileValueBlank: {
    minHeight: 20,
  },
  customerVerifiedBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: component.chip.successStatus.bg,
    borderColor: component.chip.successStatus.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: component.chip.height,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xxs,
    position: 'relative',
  },
  customerVerifiedBadgeIcon: {
    height: 22,
    width: 22,
  },
  customerVerifiedBadgeText: {
    color: component.chip.successStatus.text,
  },
  customerStatusUtilityEdge: {
    backgroundColor: glass.innerHighlight,
    height: 1,
    left: spacing.md,
    opacity: 0.66,
    position: 'absolute',
    right: spacing.md,
    top: 3,
  },
  customerVerifiedIcon: {
    height: 22,
    width: 22,
  },
  dockIcon: {
    height: component.bottomNav.iconSize,
    opacity: 0.82,
    transform: [{ translateY: 1 }, { scale: 0.92 }],
    width: component.bottomNav.iconSize,
  },
  dockIconActive: {
    opacity: 1,
    transform: [{ translateY: -1 }, { scale: 1 }],
  },
  customerDockIcon: {
    height: component.bottomNav.iconSize,
    width: component.bottomNav.iconSize,
  },
  customerDockSvgIcon: {
    position: 'relative',
    transform: [{ translateY: 1 }, { scale: 0.92 }],
    zIndex: 3,
  },
  workerDockIcon: {
    height: 27,
    opacity: 0.82,
    position: 'relative',
    width: 27,
    zIndex: 3,
  },
  workerDockIconActive: {
    opacity: 1,
  },
  workerDockIconSlot: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    position: 'relative',
    width: 28,
    zIndex: 3,
  },
  workerDockIconSlotActive: {
    shadowColor: '#088070',
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 5,
  },
  dockItem: {
    alignItems: 'center',
    borderRadius: 22,
    flex: 1,
    gap: 2,
    height: 48,
    justifyContent: 'center',
    minWidth: 0,
    position: 'relative',
    zIndex: 3,
  },
  dockItemActive: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  dockItemPressed: {
    transform: [{ scale: 0.9 }],
  },
  customerDockItem: {
    height: 48,
    gap: 2,
    paddingHorizontal: 1,
  },
  customerDockItemActive: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderWidth: 0,
    elevation: 0,
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
  },
  workerDockItem: {
    borderRadius: 22,
    gap: 2,
    height: 48,
  },
  workerDockItemActive: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderRadius: 22,
  },
  workerDockItemCompact: {
    width: 61,
  },
  dockLabel: {
    color: color.text.secondary,
    fontSize: 9.5,
    fontWeight: '700',
    lineHeight: 11,
    maxWidth: 64,
    position: 'relative',
    textAlign: 'center',
    zIndex: 3,
  },
  customerDockLabel: {
    fontSize: 9.5,
    lineHeight: 11,
    maxWidth: CUSTOMER_DOCK_TAB_WIDTH,
  },
  workerDockLabel: {
    color: '#7C9290',
    fontSize: 9.5,
    fontWeight: '700',
    lineHeight: 11,
    maxWidth: 64,
  },
  workerDockLabelActiveSource: {
    color: '#086F68',
    fontWeight: '600',
  },
  workerDockLabelCompact: {
    fontSize: 9.4,
    lineHeight: 12.4,
    maxWidth: 56,
  },
  rebuildDockLens: {
    backgroundColor: 'rgba(248,255,253,0.94)',
    borderColor: 'rgba(255,255,255,0.98)',
    borderRadius: 24,
    borderWidth: 1,
    bottom: LIQUID_NAV_RAIL_PADDING,
    left: LIQUID_NAV_RAIL_PADDING,
    overflow: 'hidden',
    position: 'absolute',
    shadowColor: '#078071',
    shadowOffset: { height: 9, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    top: LIQUID_NAV_RAIL_PADDING,
    zIndex: 1,
  },
  rebuildDockLensBloom: {
    backgroundColor: 'rgba(220,249,242,0.52)',
    borderRadius: 24,
    bottom: 5,
    left: 6,
    opacity: 0.88,
    position: 'absolute',
    right: 6,
    top: 5,
  },
  rebuildDockLensBottomWash: {
    backgroundColor: 'rgba(220,249,242,0.42)',
    borderRadius: 20,
    bottom: 1,
    height: 24,
    left: 2,
    opacity: 0.84,
    position: 'absolute',
    right: 2,
  },
  rebuildDockLensTopLight: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 18,
    height: 14,
    left: 9,
    opacity: 0.68,
    position: 'absolute',
    right: 12,
    top: 5,
    transform: [{ rotate: '-8deg' }],
  },
  rebuildDockLensInnerShadow: {
    borderBottomColor: 'rgba(12,181,159,0.14)',
    borderColor: 'rgba(5,95,87,0.045)',
    borderRadius: 22,
    borderWidth: 1,
    bottom: 4,
    left: 4,
    opacity: 0.58,
    position: 'absolute',
    right: 4,
    top: 4,
  },
  rebuildDockLensEdgeLight: {
    borderColor: 'rgba(255,255,255,0.76)',
    borderRadius: 22,
    borderWidth: 1,
    bottom: 1,
    left: 1,
    opacity: 0.82,
    position: 'absolute',
    right: 1,
    top: 1,
    zIndex: 4,
  },
  rebuildDockRouteBridge: {
    backgroundColor: 'rgba(199,249,238,0.38)',
    borderColor: 'rgba(255,255,255,0.72)',
    borderRadius: 24,
    borderWidth: 1,
    bottom: LIQUID_NAV_RAIL_PADDING,
    overflow: 'hidden',
    position: 'absolute',
    shadowColor: '#0CB59F',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    top: LIQUID_NAV_RAIL_PADDING,
    zIndex: 1,
  },
  rebuildDockRouteBridgeCore: {
    backgroundColor: 'rgba(68,232,204,0.22)',
    borderRadius: 999,
    bottom: 7,
    left: 8,
    opacity: 0.74,
    position: 'absolute',
    right: 8,
    top: 7,
  },
  rebuildDockRouteBridgeHead: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 999,
    bottom: 5,
    position: 'absolute',
    right: 8,
    top: 5,
    width: 38,
  },
  rebuildDockRouteBridgeHeadReverse: {
    left: 8,
    right: undefined,
  },
  rebuildDockShimmer: {
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderRadius: 999,
    filter: Platform.OS === 'web' ? 'blur(2px)' : undefined,
    height: 53,
    left: '-24%',
    opacity: 0.73,
    position: 'absolute',
    top: -31,
    zIndex: 5,
  } as any,
  rebuildDockShimmerCore: {
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderRadius: 999,
    bottom: 12,
    left: '22%',
    opacity: 0.74,
    position: 'absolute',
    right: '22%',
    top: 10,
  },
  rebuildDockShimmerFeather: {
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderRadius: 999,
    bottom: 0,
    left: 0,
    opacity: 0.86,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  rebuildDockCaustic: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    zIndex: 0,
  },
  rebuildDockCausticGlow: {
    backgroundColor: 'rgba(28,205,179,0.14)',
    borderRadius: 999,
    bottom: -22,
    filter: Platform.OS === 'web' ? 'blur(9px)' : undefined,
    height: 49,
    position: 'absolute',
  } as any,
  rebuildDockCausticSweep: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: radius.pill,
    bottom: -18,
    height: 64,
    left: -10,
    opacity: 0.68,
    position: 'absolute',
    right: -10,
    transform: [{ rotate: '-6deg' }],
  },
  rebuildDockCausticSweepBright: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: radius.pill,
    height: 24,
    left: '48%',
    opacity: 0.44,
    position: 'absolute',
    right: -22,
    top: 5,
    transform: [{ rotate: '-4deg' }],
  },
  rebuildDockInnerRefraction: {
    borderBottomColor: 'rgba(42,205,180,0.08)',
    borderColor: 'rgba(255,255,255,0.45)',
    borderRadius: 27,
    borderWidth: 1,
    bottom: 1,
    left: 1,
    opacity: 0.92,
    position: 'absolute',
    right: 1,
    top: 1,
    zIndex: 2,
  },
  rebuildDockLensSheen: {
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderRadius: 16,
    bottom: 1,
    left: 1,
    position: 'absolute',
    top: 1,
    width: 18,
    zIndex: 3,
  },
  workerDockFormulaEdge: {
    backgroundColor: 'rgba(255,255,255,0.86)',
    height: 1,
    left: spacing.xl,
    opacity: 0.92,
    position: 'absolute',
    right: spacing.xl,
    top: 2,
    zIndex: 2,
  },
  workerDockFormulaInnerShadow: {
    borderBottomColor: 'rgba(5,95,87,0.045)',
    borderColor: 'rgba(5,95,87,0.055)',
    borderRadius: component.bottomNav.radius,
    borderWidth: 1,
    bottom: 1,
    left: 1,
    opacity: 0.82,
    position: 'absolute',
    right: 1,
    top: 1,
    zIndex: 1,
  },
  workerDockRailAura: {
    bottom: -18,
    left: -14,
    opacity: 0.32,
    right: -14,
    top: -16,
    zIndex: 0,
  },
  workerDockStaticWhiteLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.54)',
    borderRadius: component.bottomNav.radius,
    zIndex: 0,
  },
  workerDockGlassTopWash: {
    backgroundColor: 'rgba(255,255,255,0.42)',
    borderRadius: component.bottomNav.radius,
    height: 31,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 0,
  },
  workerDockGlassBottomWash: {
    backgroundColor: 'rgba(228,251,245,0.40)',
    borderRadius: component.bottomNav.radius,
    bottom: 0,
    height: 34,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 0,
  },
  workerDockSvgIcon: {
    position: 'relative',
    zIndex: 3,
  },
  dockLabelActive: {
    color: color.brand.primaryDark,
    fontWeight: '600',
    transform: [{ translateY: -1 }],
  },
  dockOverlay: {
    alignItems: 'center',
    bottom: spacing.lg,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 30,
  },
  workerDockOverlayPlacement: {
    bottom: 12,
  },
  dockOverlayHidden: {
    opacity: 0.78,
    transform: [{ translateY: 42 }, { scale: 0.93 }],
  },
  dockRail: {
    alignItems: 'center',
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 0,
    height: LIQUID_NAV_DOCK_HEIGHT,
    minHeight: LIQUID_NAV_DOCK_HEIGHT,
    overflow: 'hidden',
    padding: LIQUID_NAV_RAIL_PADDING,
    position: 'relative',
  },
  workerDockRail: {
    gap: 0,
  },
  workerDockRailCompact: {
    gap: 3,
    paddingHorizontal: 6,
  },
  customerDockRail: {
    gap: 0,
    height: LIQUID_NAV_DOCK_HEIGHT,
    minHeight: LIQUID_NAV_DOCK_HEIGHT,
    paddingBottom: 0,
    paddingTop: 0,
    padding: LIQUID_NAV_RAIL_PADDING,
    shadowOpacity: 0.15,
    shadowRadius: 22,
  },
  customerDockMaterial: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: component.bottomNav.radius,
  },
  customerDockMintAura: {
    opacity: 0.34,
  },
  dockRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: LIQUID_NAV_DOCK_GAP,
    justifyContent: 'center',
  },
  customerDockRow: {
    gap: LIQUID_NAV_DOCK_GAP,
    justifyContent: 'center',
  },
  workerDockRow: {
    alignItems: 'flex-end',
    gap: LIQUID_NAV_DOCK_GAP,
    justifyContent: 'center',
  },
  customerDockSegmentedControl: {
    ...StyleSheet.absoluteFillObject,
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: component.bottomNav.radius,
    borderWidth: 1,
  },
  customerDockServiceSegmentMotion: {
    backgroundColor: 'rgba(255,255,255,0.68)',
    borderColor: 'rgba(184,231,223,0.54)',
    borderRadius: 23,
    borderWidth: 1,
    bottom: 5,
    left: CUSTOMER_DOCK_ACTIVE_SEGMENT_LEFT,
    overflow: 'hidden',
    position: 'absolute',
    ...shadow.soft,
    elevation: 2,
    shadowColor: '#5FD3C2',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    top: 5,
    width: CUSTOMER_DOCK_ACTIVE_SEGMENT_WIDTH,
    zIndex: 1,
  },
  customerDockSegmentGlassDepth: {
    backgroundColor: 'rgba(255,255,255,0.34)',
    borderColor: 'rgba(255,255,255,0.62)',
    borderRadius: 21,
    borderWidth: 1,
    bottom: 4,
    left: 4,
    opacity: 0.76,
    position: 'absolute',
    right: 4,
    top: 4,
    zIndex: 2,
  },
  customerDockSegmentInnerShadow: {
    borderBottomColor: 'rgba(5,95,87,0.12)',
    borderColor: 'rgba(5,95,87,0.04)',
    borderRadius: 21,
    borderWidth: 1,
    bottom: 4,
    left: 4,
    opacity: 0.58,
    position: 'absolute',
    right: 4,
    top: 4,
    zIndex: 4,
  },
  customerDockSegmentMintAura: {
    bottom: -3,
    left: -4,
    opacity: 0.36,
    right: -4,
    top: -4,
    zIndex: 0,
  },
  customerDockSegmentMintCore: {
    backgroundColor: 'rgba(159,236,223,0.22)',
    borderColor: 'rgba(255,255,255,0.5)',
    borderRadius: 20,
    borderWidth: 1,
    bottom: 8,
    left: 9,
    opacity: 0.72,
    position: 'absolute',
    right: 9,
    top: 7,
    zIndex: 1,
  },
  customerDockSegmentTopLight: {
    backgroundColor: 'rgba(255,255,255,0.58)',
    borderRadius: 18,
    height: 14,
    left: 9,
    opacity: 0.5,
    position: 'absolute',
    right: 15,
    top: 6,
    transform: [{ rotate: '-9deg' }],
    zIndex: 3,
  },
  customerDockSegmentEdge: {
    borderColor: 'rgba(255,255,255,0.88)',
    borderRadius: 21,
    borderWidth: 1,
    bottom: 5,
    left: 5,
    opacity: 0.9,
    position: 'absolute',
    right: 5,
    top: 5,
    zIndex: 4,
  },
  customerDockSelectionHidden: {
    opacity: 0,
  },
  customerDockSliderThumb: {
    backgroundColor: color.brand.primary,
    borderRadius: radius.pill,
    bottom: 4,
    height: 3,
    left: CUSTOMER_DOCK_ACTIVE_SEGMENT_LEFT + CUSTOMER_DOCK_ACTIVE_SEGMENT_WIDTH / 2 - 5,
    opacity: 0,
    position: 'absolute',
    width: 10,
  },
  dockSpecularSheen: {
    backgroundColor: glass.innerHighlight,
    height: 1,
    left: spacing.lg,
    opacity: 0.92,
    position: 'absolute',
    right: spacing.lg,
    top: spacing.xs,
    zIndex: 2,
  },
  customerDockSpecularSheen: {
    backgroundColor: glass.innerHighlight,
    height: 1,
    left: spacing.lg,
    opacity: 0.76,
    position: 'absolute',
    right: spacing.lg,
    top: spacing.xs,
    zIndex: 2,
  },
  emptyIcon: {
    height: 34,
    width: 34,
  },
  emptyTruth: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flowCard: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  flowCardCompact: {
    alignItems: 'center',
    flexDirection: 'row',
    padding: spacing.cardPaddingSmall,
  },
  flowText: {
    flex: 1,
    gap: spacing.xxs,
  },
  formCard: {
    width: '100%',
  },
  heroCard: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroCopy: {
    flex: 1,
    gap: spacing.sm,
  },
  heroMascot: {
    overflow: 'visible',
  },
  heroMascotStage: {
    alignItems: 'center',
    alignSelf: 'stretch',
    flexShrink: 0,
    justifyContent: 'center',
    marginVertical: -spacing.md,
    minHeight: 142,
    overflow: 'visible',
    width: 118,
  },
  iconImage: {
    height: component.iconTile.visualSize,
    width: component.iconTile.visualSize,
  },
  iconImageLarge: {
    height: 58,
    width: 58,
  },
  iconImageSmall: {
    height: 28,
    width: 28,
  },
  iconTile: {
    alignItems: 'center',
    backgroundColor: color.surface.mint,
    borderColor: color.surface.stroke,
    borderRadius: component.iconTile.radius,
    borderWidth: 1,
    height: component.iconTile.size,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: component.iconTile.size,
  },
  iconTileLarge: {
    height: 88,
    width: 88,
  },
  iconTileSmall: {
    borderRadius: radius.md,
    height: 46,
    width: 46,
  },
  kaelOrb: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderRadius: radius.pill,
    borderWidth: 0,
    height: LIQUID_NAV_ORB_SIZE,
    justifyContent: 'center',
    overflow: 'visible',
    position: 'relative',
    width: LIQUID_NAV_ORB_SIZE,
  },
  customerKaelOrb: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    height: CUSTOMER_KAEL_ORB_OUTER_SIZE,
    overflow: 'visible',
    width: CUSTOMER_KAEL_ORB_OUTER_SIZE,
  },
  workerKaelOrb: {
    height: WORKER_KAEL_ORB_OUTER_SIZE,
    width: WORKER_KAEL_ORB_OUTER_SIZE,
    zIndex: 4,
  },
  workerKaelAccessoryGlass: {
    alignItems: 'center',
    backgroundColor: 'rgba(219,251,243,0.76)',
    borderRadius: 34,
    borderWidth: 1,
    height: LIQUID_NAV_ORB_SIZE,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#05675D',
    shadowOffset: { height: 15, width: 0 },
    shadowOpacity: 0.20,
    shadowRadius: 29,
    width: LIQUID_NAV_ORB_SIZE,
  },
  workerKaelAccessoryGlassActive: {
    backgroundColor: 'rgba(219,251,243,0.84)',
    shadowOpacity: 0.28,
    shadowRadius: 35,
  },
  kaelOrbActive: {
    transform: [{ scale: 1.015 }],
  },
  customerKaelOrbActive: {
    backgroundColor: 'transparent',
  },
  kaelOrbPressed: {
    transform: [{ scale: 0.94 }],
  },
  kaelOrbIcon: {
    height: 44,
    position: 'relative',
    width: 44,
    zIndex: 2,
  },
  liquidNavOrbit: {
    borderBottomColor: 'rgba(14,181,158,0.36)',
    borderColor: 'rgba(73,229,204,0.52)',
    borderLeftColor: 'rgba(255,255,255,0.72)',
    borderRadius: 42,
    borderRightColor: 'rgba(14,181,158,0.42)',
    borderTopColor: 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    height: 50,
    left: -8,
    opacity: 0.74,
    position: 'absolute',
    top: 9,
    transform: [{ rotate: '-18deg' }],
    width: 84,
    zIndex: 1,
  },
  liquidNavSourceAura: {
    backgroundColor: 'rgba(23,220,188,0.30)',
    borderRadius: 50,
    bottom: -16,
    filter: Platform.OS === 'web' ? 'blur(8px)' : undefined,
    left: -16,
    opacity: 0.78,
    position: 'absolute',
    right: -16,
    top: -16,
  } as any,
  liquidNavSourceAuraActive: {
    backgroundColor: 'rgba(15,218,183,0.42)',
    opacity: 0.96,
    transform: [{ scale: 1.08 }],
  },
  liquidNavOrbitActive: {
    borderBottomColor: 'rgba(14,181,158,0.52)',
    borderColor: 'rgba(73,229,204,0.72)',
    opacity: 0.88,
  },
  liquidNavOrbitBack: {
    opacity: 0.42,
    transform: [{ rotate: '24deg' }, { scale: 0.94 }],
    zIndex: 0,
  },
  liquidNavPearl: {
    backgroundColor: '#F7FFFD',
    borderColor: 'rgba(56,222,196,0.40)',
    borderRadius: 4,
    borderWidth: 2,
    height: 7,
    position: 'absolute',
    right: 1,
    shadowColor: '#1BD9B8',
    shadowOpacity: 0.5,
    shadowRadius: 8,
    top: 15,
    width: 7,
  },
  liquidNavOrbMotion: {
    height: LIQUID_NAV_ORB_SIZE,
    position: 'relative',
    width: LIQUID_NAV_ORB_SIZE,
    zIndex: 2,
  },
  liquidNavOrbBackdrop: {
    backgroundColor: 'rgba(184,248,236,0.92)',
    borderColor: 'rgba(255,255,255,0.80)',
    borderRadius: 30,
    borderWidth: 1,
    bottom: 5,
    left: 5,
    opacity: 0.82,
    position: 'absolute',
    right: 5,
    top: 5,
    zIndex: 1,
  },
  liquidNavOrbBackdropStar: {
    borderColor: 'rgba(58,222,197,0.25)',
    borderLeftColor: 'rgba(255,255,255,0.45)',
    borderRadius: 22,
    borderRightColor: 'rgba(255,255,255,0.45)',
    borderWidth: 1,
    bottom: 10,
    left: 10,
    opacity: 0.72,
    position: 'absolute',
    right: 10,
    top: 10,
    transform: [{ rotate: '12deg' }],
  },
  liquidNavOrbCaustic: {
    backgroundColor: 'rgba(69,231,205,0.18)',
    borderRadius: 28,
    bottom: -9,
    left: 12,
    opacity: 0.46,
    position: 'absolute',
    right: -7,
    top: 18,
    transform: [{ rotate: '-18deg' }],
    zIndex: 3,
  },
  liquidNavGlobeTopHighlight: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 999,
    height: 18,
    left: 8,
    opacity: 0.78,
    position: 'absolute',
    right: 10,
    top: 4,
    zIndex: 6,
  },
  liquidNavFrontRim: {
    borderBottomColor: 'rgba(49,218,193,0.50)',
    borderColor: 'rgba(255,255,255,0.72)',
    borderLeftColor: 'transparent',
    borderRadius: 34,
    borderTopColor: 'transparent',
    borderWidth: 2,
    bottom: 1,
    left: 1,
    opacity: 0.82,
    position: 'absolute',
    right: 1,
    top: 1,
    transform: [{ rotate: '42deg' }],
    zIndex: 7,
  },
  liquidNavGlint: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 10,
    filter: Platform.OS === 'web' ? 'blur(1.2px)' : undefined,
    height: 8,
    left: 13,
    opacity: 0.74,
    position: 'absolute',
    top: 9,
    width: 13,
    zIndex: 8,
  } as any,
  liquidNavRipple: {
    borderColor: 'rgba(35,221,190,0.74)',
    borderRadius: 34,
    borderWidth: 1.5,
    bottom: 2,
    left: 2,
    position: 'absolute',
    right: 2,
    top: 2,
    zIndex: 0,
  },
  liquidNavStatus: {
    backgroundColor: '#12BB7E',
    borderColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 2,
    bottom: 5,
    height: 12,
    position: 'absolute',
    right: 3,
    shadowColor: '#0B8763',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    width: 12,
    zIndex: 10,
  },
  workerKaelOrbCustomerStatusLight: {
    backgroundColor: '#5BEDB8',
    borderRadius: 4,
    height: 4,
    left: 1,
    opacity: 0.86,
    position: 'absolute',
    top: 1,
    width: 5,
  },
  liquidNavStatusHalo: {
    backgroundColor: 'rgba(18,191,132,0.16)',
    borderRadius: 9,
    bottom: 2,
    height: 18,
    position: 'absolute',
    right: 0,
    width: 18,
    zIndex: 9,
  },
  liquidNavStatusWave: {
    borderColor: 'rgba(25,205,144,0.42)',
    borderRadius: 12,
    borderWidth: 1,
    bottom: 0,
    height: 24,
    opacity: 0.42,
    position: 'absolute',
    right: -3,
    width: 24,
    zIndex: 8,
  },
  liquidNavRoleBadge: {
    alignItems: 'center',
    backgroundColor: '#F8FFFD',
    borderColor: '#FFFFFF',
    borderRadius: 9,
    borderWidth: 1,
    bottom: 5,
    height: 17,
    justifyContent: 'center',
    left: 2,
    overflow: 'hidden',
    position: 'absolute',
    shadowColor: '#099B87',
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 9,
    width: 17,
    zIndex: 12,
  },
  liquidNavRoleBadgeIcon: {
    height: 10,
    width: 10,
    zIndex: 2,
  },
  liquidNavRoleBadgeWash: {
    backgroundColor: '#CBF5EB',
    borderRadius: 9,
    bottom: -2,
    height: 11,
    left: -1,
    opacity: 0.86,
    position: 'absolute',
    right: -1,
  },
  liquidNavRoleBadgeDot: {
    backgroundColor: '#21C7AE',
    borderRadius: 4,
    height: 7,
    width: 7,
  },
  customerKaelOrbMark: {
    height: 62,
    left: 4,
    position: 'absolute',
    top: -1,
    transform: [{ translateY: 3 }, { scale: 1.025 }],
    width: 60,
    zIndex: 9,
  },
  workerKaelOrbMark: {
    height: 68,
    left: -1,
    position: 'absolute',
    top: -4,
    transform: [{ translateY: 2 }, { scale: 1.08 }],
    width: 68,
    zIndex: 9,
  },
  customerKaelOrbOuterAura: {
    borderRadius: component.bottomNav.orb.radius,
    bottom: -spacing.xxs,
    left: -spacing.xxs,
    opacity: 0.34,
    right: -spacing.xxs,
    top: -spacing.xxs,
    zIndex: 0,
  },
  workerKaelOrbOuterAura: {
    opacity: 0.16,
    transform: [{ scale: 0.92 }],
  },
  customerKaelOrbOuterAuraActive: {
    opacity: 0.52,
    transform: [{ scale: 1.08 }],
  },
  customerKaelOrbStaticBase: {
    backgroundColor: glass.bg,
    borderRadius: component.bottomNav.orb.radius,
    bottom: CUSTOMER_KAEL_ORB_SURFACE_INSET,
    left: CUSTOMER_KAEL_ORB_SURFACE_INSET,
    position: 'absolute',
    right: CUSTOMER_KAEL_ORB_SURFACE_INSET,
    shadowColor: color.text.inverse,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.42,
    shadowRadius: 8,
    top: CUSTOMER_KAEL_ORB_SURFACE_INSET,
    zIndex: 0,
  },
  workerKaelOrbStaticBase: {
    backgroundColor: 'rgba(255,255,255,0.86)',
    shadowOpacity: 0.34,
    shadowRadius: 10,
  },
  customerKaelOrbGlowDisc: {
    backgroundColor: color.mint.auraStrong,
    borderRadius: LIQUID_NAV_ORB_SIZE,
    bottom: -spacing.xxs,
    left: -spacing.xxs,
    opacity: 0.3,
    position: 'absolute',
    right: -spacing.xxs,
    shadowColor: color.brand.primary,
    shadowOffset: { width: 0, height: spacing.sm },
    shadowOpacity: 0.16,
    shadowRadius: spacing.xl,
    top: -spacing.xxs,
    zIndex: 0,
  },
  workerKaelOrbGlowDisc: {
    backgroundColor: 'rgba(23,220,188,0.16)',
    bottom: -6,
    left: -6,
    opacity: 0.28,
    right: -6,
    shadowColor: '#17DCBC',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    top: -6,
  },
  customerKaelOrbHaloRing: {
    backgroundColor: glass.bg,
    borderColor: glass.stroke,
    borderRadius: component.bottomNav.orb.radius,
    borderWidth: 1,
    bottom: CUSTOMER_KAEL_ORB_SURFACE_INSET,
    left: CUSTOMER_KAEL_ORB_SURFACE_INSET,
    opacity: 0.92,
    position: 'absolute',
    right: CUSTOMER_KAEL_ORB_SURFACE_INSET,
    shadowColor: color.text.inverse,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.5,
    shadowRadius: spacing.sm,
    top: CUSTOMER_KAEL_ORB_SURFACE_INSET,
    zIndex: 1,
  },
  kaelOrbEdge: {
    borderColor: glass.innerHighlight,
    borderRadius: radius.pill,
    borderWidth: 1,
    bottom: 5,
    left: 5,
    position: 'absolute',
    right: 5,
    top: 5,
  },
  customerKaelOrbEdge: {
    borderColor: glass.innerHighlight,
    borderRadius: component.bottomNav.orb.radius,
    bottom: 2,
    left: 2,
    opacity: 0.72,
    right: 2,
    top: 2,
    zIndex: 6,
  },
  kaelOrbGlassLayer: {
    alignItems: 'center',
    backgroundColor: 'rgba(219,251,243,0.76)',
    borderColor: color.mint.mint300,
    borderRadius: component.bottomNav.orb.radius,
    borderWidth: 1,
    height: component.bottomNav.orb.size,
    justifyContent: 'center',
    left: (component.bottomNav.orb.outerSize - component.bottomNav.orb.size) / 2,
    overflow: 'hidden',
    position: 'absolute',
    top: (component.bottomNav.orb.outerSize - component.bottomNav.orb.size) / 2,
    width: component.bottomNav.orb.size,
    zIndex: 1,
    ...shadow.orb,
  },
  customerKaelOrbGlassLayer: {
    alignItems: 'center',
    backgroundColor: 'rgba(219,251,243,0.76)',
    borderColor: glass.innerHighlight,
    borderRadius: component.bottomNav.orb.radius,
    borderWidth: 1,
    bottom: undefined,
    height: CUSTOMER_KAEL_ORB_CORE_SIZE,
    justifyContent: 'center',
    left: CUSTOMER_KAEL_ORB_CORE_OFFSET,
    overflow: 'hidden',
    right: undefined,
    top: CUSTOMER_KAEL_ORB_CORE_OFFSET,
    width: CUSTOMER_KAEL_ORB_CORE_SIZE,
    zIndex: 1,
    shadowColor: color.brand.primaryDark,
    shadowOffset: { width: 0, height: spacing.sm },
    shadowOpacity: 0.13,
    shadowRadius: spacing.md,
  },
  workerKaelOrbGlassLayer: {
    backgroundColor: 'rgba(238,255,251,0.82)',
    borderColor: 'rgba(255,255,255,0.99)',
    shadowColor: '#05675D',
    shadowOffset: { height: 15, width: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 29,
  },
  customerKaelOrbGlassLayerActive: {
    backgroundColor: 'rgba(219,251,243,0.82)',
    shadowOpacity: 0.22,
    shadowRadius: spacing.xl,
  },
  customerKaelOrbInnerAura: {
    opacity: 0.32,
  },
  customerKaelOrbSurfaceGlass: {
    backgroundColor: glass.bg,
    borderColor: glass.stroke,
    borderRadius: component.bottomNav.orb.radius,
    borderWidth: 1,
    bottom: CUSTOMER_KAEL_ORB_SURFACE_INSET,
    left: CUSTOMER_KAEL_ORB_SURFACE_INSET,
    opacity: 0.24,
    position: 'absolute',
    right: CUSTOMER_KAEL_ORB_SURFACE_INSET,
    top: CUSTOMER_KAEL_ORB_SURFACE_INSET,
    zIndex: 6,
  },
  customerKaelOrbFormulaSoftEdge: {
    borderColor: glass.innerHighlight,
    borderRadius: component.bottomNav.orb.radius,
    borderWidth: 1,
    bottom: CUSTOMER_KAEL_ORB_EDGE_INSET,
    left: CUSTOMER_KAEL_ORB_EDGE_INSET,
    opacity: 0.84,
    position: 'absolute',
    right: CUSTOMER_KAEL_ORB_EDGE_INSET,
    top: CUSTOMER_KAEL_ORB_EDGE_INSET,
    zIndex: 8,
  },
  customerKaelOrbFormulaInnerShadow: {
    borderBottomColor: color.brand.primaryDeep,
    borderColor: color.brand.primaryDeep,
    borderRadius: component.bottomNav.orb.radius,
    borderWidth: 1,
    bottom: CUSTOMER_KAEL_ORB_EDGE_INSET,
    left: CUSTOMER_KAEL_ORB_EDGE_INSET,
    opacity: 0.18,
    position: 'absolute',
    right: CUSTOMER_KAEL_ORB_EDGE_INSET,
    top: CUSTOMER_KAEL_ORB_EDGE_INSET,
    zIndex: 8,
  },
  customerKaelOrbCoreShade: {
    backgroundColor: color.brand.primaryDeep,
    borderRadius: component.bottomNav.orb.radius,
    bottom: spacing.xxs,
    height: spacing.md,
    left: spacing.sm,
    opacity: 0.12,
    position: 'absolute',
    right: spacing.sm,
    zIndex: 3,
  },
  kaelOrbLabel: {
    fontSize: typography.caption.fontSize,
    fontWeight: typography.caption.fontWeight,
    lineHeight: typography.caption.lineHeight,
    marginTop: -1,
    position: 'relative',
    zIndex: 2,
  },
  customerKaelOrbLabel: {
    fontSize: component.bottomNav.orb.labelFontSize,
    lineHeight: component.bottomNav.orb.labelLineHeight,
    marginTop: 1,
  },
  logoHalo: {
    alignItems: 'center',
    backgroundColor: component.logoMark.background,
    borderColor: component.logoMark.border,
    borderRadius: radius.md,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 44,
  },
  logoMark: {
    height: 42,
    width: 42,
  },
  metricRow: {
    alignItems: 'center',
    borderBottomColor: color.surface.stroke,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  metricStack: {
    gap: spacing.xs,
  },
  metricValue: {
    flex: 1,
    textAlign: 'right',
  },
  metricChecklistLabel: {
    flexShrink: 0,
    minWidth: 76,
  },
  metricChecklistValue: {
    flex: 1,
    textAlign: 'right',
  },
  axisList: {
    gap: spacing.sm,
  },
  axisProgress: {
    backgroundColor: color.surface.disabled,
    borderRadius: radius.pill,
    flex: 1,
    height: 8,
    overflow: 'hidden',
  },
  axisProgressFill: {
    backgroundColor: color.brand.primary,
    borderRadius: radius.pill,
    height: '100%',
  },
  axisRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  badgeRail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  earningsStrip: {
    alignItems: 'center',
    backgroundColor: color.surface.mint,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  earningsText: {
    flex: 1,
    gap: spacing.xxs,
  },
  earningsChart: {
    backgroundColor: color.surface.soft,
    borderColor: color.surface.stroke,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  earningsChartHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  earningsBars: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.xs,
    height: 88,
  },
  earningsBarSlot: {
    alignItems: 'center',
    backgroundColor: color.mint.mint50,
    borderRadius: radius.pill,
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  earningsBar: {
    backgroundColor: color.brand.primary,
    borderRadius: radius.pill,
    width: '100%',
  },
  infoStrip: {
    alignItems: 'center',
    backgroundColor: color.surface.soft,
    borderColor: color.surface.stroke,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    flexGrow: 1,
    flexShrink: 1,
    gap: spacing.sm,
    minWidth: 0,
    padding: spacing.sm,
  },
  infoStripIcon: {
    height: 28,
    width: 28,
  },
  infoStripText: {
    flex: 1,
  },
  performanceBadge: {
    alignItems: 'center',
    backgroundColor: color.surface.soft,
    borderColor: color.surface.stroke,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  performanceBadgeEarned: {
    backgroundColor: color.mint.mint50,
    borderColor: color.brand.primary,
  },
  performanceBadgeIcon: {
    height: 24,
    width: 24,
  },
  profileHero: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  profileHeroAction: {
    marginTop: spacing.sm,
    width: '100%',
  },
  profileHeroFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  profileHeroText: {
    flex: 1,
    flexShrink: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  profileTitle: {
    flexShrink: 1,
  },
  profileSectionHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  profileSectionAction: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  profileStatLabel: {
    textAlign: 'center',
  },
  profileStatTile: {
    alignItems: 'center',
    backgroundColor: color.surface.soft,
    borderColor: color.surface.stroke,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexBasis: '30%',
    flexGrow: 1,
    flexShrink: 1,
    gap: spacing.xxs,
    minHeight: 88,
    minWidth: 96,
    padding: spacing.sm,
  },
  profileStatTileDense: {
    flexBasis: '22%',
    minHeight: 74,
    minWidth: 74,
    padding: spacing.xs,
  },
  profileStatTileHalf: {
    flexBasis: '46%',
    minHeight: 104,
    minWidth: 150,
  },
  profileStatValue: {
    color: color.text.strong,
    textAlign: 'center',
  },
  profileSubtitle: {
    flexShrink: 1,
  },
  kaelSuggestion: {
    alignItems: 'center',
    backgroundColor: color.surface.mint,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  kaelSuggestionIcon: {
    height: 42,
    width: 42,
  },
  kaelSuggestionText: {
    flex: 1,
    gap: spacing.xxs,
  },
  protectionGauge: {
    alignItems: 'center',
    borderColor: color.mint.mint300,
    borderRadius: radius.pill,
    borderWidth: 10,
    height: 142,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 142,
  },
  protectionGaugeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
  },
  protectionGaugeText: {
    flex: 1,
    gap: spacing.sm,
    minWidth: 220,
  },
  protectionGaugeValue: {
    color: color.brand.primaryDark,
  },
  protectionGaugePendingValue: {
    maxWidth: 92,
    textAlign: 'center',
  },
  rankLadder: {
    gap: spacing.sm,
  },
  rankLadderHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rankOrb: {
    alignItems: 'center',
    backgroundColor: color.mint.mint50,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 116,
    justifyContent: 'center',
    width: 116,
  },
  rankOrbValue: {
    color: color.brand.primaryDark,
  },
  rankOrbPendingValue: {
    maxWidth: 82,
    textAlign: 'center',
  },
  rankStep: {
    alignItems: 'center',
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderRadius: radius.lg,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  rankStepPassed: {
    backgroundColor: color.mint.mint50,
  },
  rankStepRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  rankStepSelected: {
    backgroundColor: color.mint.mint100,
    borderColor: color.brand.primary,
    borderWidth: 2,
  },
  rankSummary: {
    alignItems: 'center',
    backgroundColor: color.surface.soft,
    borderColor: color.surface.stroke,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    padding: spacing.md,
  },
  rankSummaryText: {
    flex: 1,
    gap: spacing.sm,
    minWidth: 220,
  },
  safeArea: {
    backgroundColor: color.background,
    flex: 1,
  },
  screenContent: {
    alignSelf: 'center',
    gap: spacing.lg,
    width: '100%',
  },
  screenHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scrollContent: {
    paddingBottom: 118,
    paddingHorizontal: spacing.screenHorizontalPadding,
    paddingTop: spacing.screenVerticalPadding,
  },
  sectionHeading: {
    gap: spacing.xs,
  },
  segmentedTile: {
    alignItems: 'center',
    backgroundColor: color.surface.soft,
    borderColor: color.surface.stroke,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexGrow: 1,
    gap: spacing.xs,
    minHeight: 108,
    minWidth: 112,
    padding: spacing.md,
  },
  segmentedTileRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  segmentedTileSelected: {
    backgroundColor: color.mint.mint50,
    borderColor: color.brand.primary,
    borderWidth: 2,
  },
  serviceChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  serviceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  serviceTile: {
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderRadius: component.card.radius,
    borderWidth: 1,
    flexBasis: '30%',
    flexGrow: 1,
    gap: spacing.sm,
    minHeight: 156,
    minWidth: 112,
    padding: spacing.cardPadding,
    ...shadow.soft,
  },
  serviceTileCompact: {
    alignItems: 'center',
    flexBasis: '28%',
    minHeight: 118,
    minWidth: 84,
    padding: spacing.sm,
  },
  serviceTileCompactLabel: {
    textAlign: 'center',
  },
  softPanel: {
    backgroundColor: color.surface.mint,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.lg,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xs,
    minWidth: 150,
    padding: spacing.md,
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tileGridCompact: {
    gap: spacing.sm,
  },
  twoColumnCards: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  utilityLabel: {
    textAlign: 'center',
  },
  utilityTile: {
    alignItems: 'center',
    backgroundColor: color.surface.soft,
    borderColor: color.surface.stroke,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexBasis: '22%',
    flexGrow: 1,
    flexShrink: 1,
    gap: spacing.xs,
    minHeight: 82,
    minWidth: 74,
    padding: spacing.xs,
  },
  workerAvailabilitySwitch: {
    alignItems: 'center',
    backgroundColor: '#CFDEDB',
    borderColor: 'rgba(255,255,255,0.86)',
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 29,
    justifyContent: 'center',
    padding: 3,
    width: 48,
  },
  workerAvailabilitySwitchDisabled: {
    opacity: 0.5,
  },
  workerAvailabilitySwitchOn: {
    backgroundColor: color.brand.primary,
    borderColor: color.surface.strokeStrong,
  },
  workerAvailabilityThumb: {
    alignSelf: 'flex-start',
    backgroundColor: color.surface.base,
    borderRadius: radius.pill,
    height: 23,
    width: 23,
    ...shadow.soft,
  },
  workerAvailabilityThumbOn: {
    alignSelf: 'flex-end',
  },
  workerAgenticProcessTrigger: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: color.surface.soft,
    borderRadius: radius.pill,
    minHeight: 34,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  workerAgenticProcessLabel: {
    fontWeight: '700',
  },
  workerAgenticReveal: {
    backgroundColor: color.surface.soft,
    borderColor: color.surface.stroke,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xxs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  workerActiveJobGrid: {
    gap: spacing.xs,
  },
  workerActiveJobHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  workerActiveJobRow: {
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    overflow: 'hidden',
    padding: spacing.md,
    position: 'relative',
  },
  workerChatComposerInput: {
    flex: 1,
    minWidth: 0,
  },
  workerChatComposerInputShell: {
    backgroundColor: color.surface.soft,
    borderWidth: 0,
    minHeight: 30,
    paddingHorizontal: 0,
  },
  workerChatComposerKeyline: {
    ...StyleSheet.absoluteFillObject,
    borderColor: color.surface.base,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  workerChatComposerTextInput: {
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight,
    minHeight: 30,
  },
  workerChatComposerTextFieldStack: {
    gap: 0,
    position: 'relative',
    zIndex: 2,
  },
  workerChatComposerTools: {
    backgroundColor: color.surface.soft,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: spacing.xs,
    minHeight: 84,
    overflow: 'hidden',
    paddingBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    position: 'relative',
  },
  workerChatComposerToolsActive: {
    borderColor: color.surface.strokeStrong,
  },
  workerChatComposerControlRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 42,
    position: 'relative',
    zIndex: 2,
  },
  workerChatComposerControlSpacer: {
    flex: 1,
  },
  workerChatConversationCard: {
    backgroundColor: color.surface.base,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  workerChatCaseAvatar: {
    alignItems: 'center',
    backgroundColor: color.surface.mint,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 44,
  },
  workerChatCaseAvatarImage: {
    height: 40,
    width: 40,
  },
  workerChatControlIcon: {
    height: 20,
    width: 20,
  },
  workerChatComposerIconButton: {
    alignItems: 'center',
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderRadius: radius.md,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  workerChatIconButton: {
    alignItems: 'center',
    backgroundColor: color.surface.soft,
    borderColor: color.surface.stroke,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  workerChatKaelBubble: {
    alignSelf: 'flex-start',
    backgroundColor: color.surface.soft,
    borderColor: color.surface.stroke,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    maxWidth: '92%',
    padding: spacing.md,
  },
  workerChatKaelBubbleHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  workerChatLocalBubble: {
    alignSelf: 'flex-end',
    backgroundColor: color.surface.mint,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.lg,
    borderWidth: 1,
    maxWidth: '88%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  workerChatMediaNotice: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: color.surface.base,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  workerChatMediaPreviewImage: {
    backgroundColor: color.surface.disabled,
    borderRadius: radius.sm,
    height: 46,
    width: 46,
  },
  workerChatMediaPreviewItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    maxWidth: 180,
  },
  workerChatMessageRail: {
    gap: spacing.sm,
  },
  workerChatFeedbackModePill: {
    alignItems: 'center',
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.sm,
  },
  workerChatFeedbackModePillActive: {
    backgroundColor: color.surface.mint,
    borderColor: color.surface.strokeStrong,
  },
  workerChatFeedbackModeText: {
    fontWeight: '700',
  },
  workerChatModeGlass: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: glass.innerHighlight,
  },
  workerChatModePill: {
    alignItems: 'center',
    backgroundColor: color.surface.mint,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    position: 'relative',
  },
  workerChatProgress: {
    backgroundColor: color.surface.mint,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm,
  },
  workerChatSendButton: {
    alignItems: 'center',
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  workerChatSendButtonReady: {
    borderColor: color.surface.strokeStrong,
    backgroundColor: color.brand.primary,
  },
  workerChatIconButtonDisabled: {
    opacity: 0.42,
  },
  workerChatShell: {
    gap: spacing.sm,
    overflow: 'hidden',
  },
  workerChatTitleStack: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  workerChatTopControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  workerChatTinyIcon: {
    height: 16,
    width: 16,
  },
  workerChatVoiceChip: {
    alignItems: 'center',
    backgroundColor: color.surface.soft,
    borderColor: color.surface.stroke,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 34,
    paddingHorizontal: spacing.sm,
  },
  workerChatWelcomeStage: {
    alignItems: 'center',
    backgroundColor: color.surface.mint,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  workerCompletionNoteInputShell: {
    alignItems: 'flex-start',
    minHeight: 84,
    paddingVertical: spacing.sm,
  },
  workerCompletionNoteInput: {
    minHeight: typography.body.lineHeight * 3,
    textAlignVertical: 'top',
  },
  workerCompletionEvidenceActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  workerCompletionPreviewRail: {
    backgroundColor: color.surface.soft,
    borderColor: color.surface.stroke,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.sm,
  },
  workerSummaryChecklist: {
    backgroundColor: color.surface.soft,
    borderColor: color.surface.stroke,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.sm,
  },
  workerSummaryChecklistItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 28,
  },
  workerSummaryPendingDot: {
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 12,
    width: 12,
  },
  workerHomeAvatar: {
    alignItems: 'center',
    backgroundColor: '#F6FFFC',
    borderColor: '#DDF2EE',
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 58,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 58,
    ...shadow.soft,
  },
  workerHomeAvatarImage: {
    height: 48,
    width: 48,
  },
  workerHomeFormulaPageWhite: {
    backgroundColor: 'rgba(255,255,255,0.34)',
    borderRadius: radius.sheet,
    bottom: -spacing.xxxl,
    left: -spacing.xxl,
    opacity: 0.72,
    position: 'absolute',
    right: -spacing.xxl,
    top: spacing.xxxl,
  },
  workerHomeFormulaPageAura: {
    bottom: -spacing.xxxl,
    left: -spacing.xxxl,
    opacity: 0.9,
    right: -spacing.xxxl,
    top: -spacing.xxxl,
  },
  workerHomeFormulaPageSoftEdge: {
    borderColor: 'rgba(255,255,255,0.70)',
    borderRadius: radius.sheet,
    borderWidth: 1,
    bottom: -spacing.xxl,
    left: -spacing.xl,
    opacity: 0.52,
    position: 'absolute',
    right: -spacing.xl,
    top: spacing.xxxl,
  },
  workerHomeFormulaStaticWhiteLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.54)',
    borderRadius: radius.xl,
  },
  workerHomeFormulaMapStaticWhiteLayer: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  workerHomeFormulaReadinessStaticWhiteLayer: {
    backgroundColor: 'rgba(255,255,255,0.34)',
  },
  workerHomeFormulaRequestStaticWhiteLayer: {
    backgroundColor: 'rgba(255,255,255,0.56)',
  },
  workerHomeFormulaMintAura: {
    bottom: -spacing.xxl,
    left: -spacing.xxl,
    opacity: 0.9,
    right: -spacing.xxl,
    top: -spacing.xxl,
  },
  workerHomeFormulaMapAura: {
    bottom: -28,
    left: -20,
    opacity: 0.98,
    right: -20,
    top: -28,
  },
  workerHomeFormulaReadinessAura: {
    opacity: 0.78,
  },
  workerHomeFormulaRequestAura: {
    bottom: -36,
    left: -28,
    opacity: 0.94,
    right: -72,
    top: -52,
  },
  workerHomeFormulaSoftEdge: {
    ...StyleSheet.absoluteFillObject,
    borderColor: 'rgba(255,255,255,0.86)',
    borderRadius: radius.xl,
    borderWidth: 1,
    opacity: 0.72,
  },
  workerHomeFormulaMapSoftEdge: {
    borderColor: 'rgba(255,255,255,0.92)',
    opacity: 0.9,
  },
  workerHomeFormulaRequestSoftEdge: {
    borderColor: 'rgba(255,255,255,0.96)',
    opacity: 0.86,
  },
  workerHomeFormulaSpecularSheen: {
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: radius.pill,
    height: 2,
    left: '13%' as DimensionValue,
    opacity: 0.82,
    position: 'absolute',
    right: '13%' as DimensionValue,
    top: 1,
  },
  workerHomeFormulaMapSpecularSheen: {
    left: 18,
    opacity: 0.76,
    right: 18,
  },
  workerHomeFormulaInnerShadow: {
    ...StyleSheet.absoluteFillObject,
    borderColor: 'rgba(4,89,80,0.08)',
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  workerHomeHeader: {
    gap: spacing.xs,
    marginTop: spacing.xxxl + spacing.xl,
    position: 'relative',
    zIndex: 2,
  },
  workerHomeIdentityRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  workerHomeHeaderCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  workerHomeGreetingHeadline: {
    color: color.text.strong,
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 26,
    textAlign: 'left',
  },
  workerHomeGreetingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  workerHomeGreetingText: {
    color: color.text.secondary,
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'left',
  },
  workerHomeReadyPillText: {
    fontSize: 12,
    letterSpacing: 0.6,
    lineHeight: 14,
    textTransform: 'uppercase',
  },
  workerHomeHeadline: {
    color: color.text.strong,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
  },
  workerHomeStatusSemantic: {
    height: 0,
    opacity: 0,
    overflow: 'hidden',
    width: 0,
  },
  workerHomeHeaderActionOrb: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.74)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 16,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
    ...shadow.soft,
  },
  workerHomeHeaderActionDot: {
    borderColor: color.brand.primary,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 12,
    width: 12,
  },
  workerHomeScreenLabelRow: {
    paddingLeft: 50,
  },
  workerHomeCta: {
    minHeight: spacing.xxxl + spacing.md,
  },
  workerHomeSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: spacing.md,
  },
  workerHomeSemanticSummaryRow: {
    height: 0,
    opacity: 0,
    overflow: 'hidden',
    width: 0,
  },
  workerHomeStack: {
    alignSelf: 'center',
    gap: spacing.lg,
    justifyContent: 'flex-start',
    maxWidth: 390,
    position: 'relative',
    width: '100%',
  },
  workerHomeMapCard: {
    gap: spacing.sm,
    position: 'relative',
    zIndex: 2,
  },
  workerHomeMapInset: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderWidth: 0,
    elevation: 0,
    padding: 0,
    shadowOpacity: 0,
  },
  workerHomeMapNavigationButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: radius.pill,
    borderWidth: 1,
    bottom: spacing.xxxl * 3,
    left: spacing.sm,
    minHeight: 34,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    position: 'absolute',
  },
  workerHomeSectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    minHeight: 34,
    position: 'relative',
    zIndex: 2,
  },
  workerHomeSectionTitleText: {
    color: color.text.strong,
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 23,
  },
  workerHomeSectionLink: {
    alignItems: 'center',
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: spacing.sm,
  },
  workerHomePrioritySection: {
    gap: spacing.sm,
    position: 'relative',
    zIndex: 2,
  },
  workerHomePriorityCard: {
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderColor: 'rgba(255,255,255,0.96)',
    borderRadius: 29,
    borderWidth: 1,
    gap: 10,
    minHeight: 252,
    overflow: 'hidden',
    padding: 15,
    position: 'relative',
    ...shadow.raised,
  },
  workerHomePriorityCardPressed: {
    transform: [{ scale: 0.982 }],
  },
  workerHomePriorityAuraDisc: {
    backgroundColor: 'rgba(70,229,205,0.18)',
    borderRadius: radius.pill,
    height: 190,
    opacity: 0.92,
    position: 'absolute',
    right: -90,
    top: -105,
    width: 240,
  },
  workerHomePriorityHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    position: 'relative',
    zIndex: 2,
  },
  workerHomePriorityIconShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: 'rgba(255,255,255,0.96)',
    borderRadius: 20,
    borderWidth: 1,
    height: 56,
    justifyContent: 'center',
    width: 56,
    ...shadow.soft,
  },
  workerHomePriorityIcon: {
    height: 38,
    width: 38,
  },
  workerHomePriorityCopy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  workerHomePriorityProblemText: {
    height: 0,
    opacity: 0,
    overflow: 'hidden',
    width: 0,
  },
  workerHomeCountdownPill: {
    alignItems: 'center',
    backgroundColor: '#FFF7E6',
    borderColor: '#FFE0A6',
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 12,
  },
  workerHomeMetricPair: {
    flexDirection: 'row',
    gap: 8,
    position: 'relative',
    zIndex: 2,
  },
  workerHomeMetricTile: {
    backgroundColor: 'rgba(255,255,255,0.76)',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 19,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xxs,
    minHeight: 70,
    minWidth: 0,
    paddingHorizontal: 11,
    paddingVertical: 11,
  },
  workerHomeMetricTileCompact: {
    flex: 0,
    height: 0,
    minHeight: 0,
    opacity: 0,
    overflow: 'hidden',
    paddingHorizontal: 0,
    paddingVertical: 0,
    width: 0,
  },
  workerHomeMetricValue: {
    color: color.text.strong,
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 24,
  },
  workerHomeRequestSemanticText: {
    height: 0,
    opacity: 0,
    overflow: 'hidden',
    width: 0,
  },
  workerHomeMapPrivacySheet: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: 'rgba(255,255,255,0.96)',
    borderRadius: 21,
    borderWidth: 1,
    bottom: 10,
    flexDirection: 'row',
    gap: 8,
    left: 11,
    minHeight: 70,
    paddingHorizontal: 12,
    paddingVertical: 11,
    position: 'absolute',
    right: 11,
    zIndex: 5,
    ...shadow.soft,
  },
  workerHomeMapPrivacyCopy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  workerHomeMiniStat: {
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderColor: '#E2EFEC',
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xxs,
    minHeight: 60,
    minWidth: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...shadow.soft,
  },
  workerHomeMiniStatLabel: {
    flex: 1,
    textAlign: 'left',
  },
  workerHomeMiniStatValue: {
    color: color.brand.primaryDark,
    fontSize: 20,
    lineHeight: 24,
    textAlign: 'left',
  },
  workerHomeMiniStatDetail: {
    color: color.text.muted,
  },
  workerHomeMiniStatTopLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'space-between',
    width: '100%',
  },
  workerJobsCardChrome: {
    backgroundColor: glass.innerHighlight,
    height: 1,
    left: spacing.md,
    position: 'absolute',
    right: spacing.md,
    top: spacing.xs,
  },
  workerJobsCardKeyline: {
    backgroundColor: color.surface.stroke,
    height: StyleSheet.hairlineWidth,
    marginBottom: spacing.xs,
    width: '100%',
  },
  workerJobsCardCrispMarker: {
    height: 0,
    width: 0,
  },
  workerJobsCaseCard: {
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    padding: spacing.md,
    position: 'relative',
  },
  workerJobsRequestActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    paddingTop: spacing.xs,
  },
  workerJobsRequestCard: {
    backgroundColor: color.surface.soft,
    borderColor: color.surface.stroke,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.xs,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    position: 'relative',
  },
  workerJobsRequestHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  workerJobsRequestHeaderCopy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  workerJobsRequestList: {
    gap: spacing.sm,
  },
  workerJobsRequestRows: {
    gap: spacing.xxs,
  },
  workerJobsRegistrationRail: {
    alignItems: 'center',
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  workerJobsScheduleGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  workerJobsScheduleMetric: {
    alignItems: 'center',
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xxs,
    minHeight: spacing.xxxl + spacing.xxl,
    minWidth: 0,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  workerJobsScheduleMetricIcon: {
    height: spacing.xxl,
    width: spacing.xxl,
  },
  workerJobsScheduleMetricValue: {
    color: color.brand.primaryDark,
    textAlign: 'center',
  },
  workerJobsScheduleRail: {
    alignItems: 'center',
    backgroundColor: color.surface.mint,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: spacing.xxxl + spacing.xxl,
    padding: spacing.md,
  },
  workerJobsScheduleRailCopy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  workerJobsScheduleRailIcon: {
    height: spacing.xxxl,
    width: spacing.xxxl,
  },
  workerJobsScheduleShell: {
    gap: spacing.sm,
  },
  workerJobsWaitingEmptyIcon: {
    height: 28,
    width: 28,
  },
  workerJobsWaitingEmptyLine: {
    alignItems: 'center',
    backgroundColor: color.surface.soft,
    borderColor: color.surface.stroke,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  workerCompactMetric: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    paddingVertical: spacing.xxs,
  },
  workerCompactMetricValue: {
    color: color.text.strong,
    flex: 1,
    textAlign: 'right',
  },
  workerJobsLiquidReflection: {
    backgroundColor: color.surface.mint,
    borderRadius: radius.pill,
    height: 42,
    opacity: 0.56,
    position: 'absolute',
    right: -20,
    top: 54,
    width: 96,
  },
  workerJobsLiquidWash: {
    backgroundColor: color.surface.mint,
    borderRadius: radius.lg,
    bottom: 0,
    left: 0,
    opacity: 0.5,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  workerJobsMapInset: {
    backgroundColor: 'rgba(255,255,255,0.66)',
    borderColor: 'rgba(255,255,255,0.96)',
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.sm,
    ...shadow.soft,
  },
  workerJobsMapShell: {
    backgroundColor: color.surface.soft,
    borderColor: color.surface.stroke,
    borderRadius: radius.lg,
    borderWidth: 1,
    minHeight: 132,
    overflow: 'hidden',
    padding: spacing.md,
    position: 'relative',
  },
  workerJobsPhaseCard: {
    gap: spacing.md,
    overflow: 'hidden',
    position: 'relative',
  },
  workerJobsWaitingFlow: {
    gap: spacing.sm,
  },
  workerJobsWaitingFlowHeader: {
    gap: spacing.xs,
  },
  workerJobsPresenceMap: {
    gap: spacing.sm,
  },
  workerJobsSectionCrispShell: {
    gap: spacing.md,
    position: 'relative',
    zIndex: 2,
  },
  workerJobsSegment: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flex: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: spacing.sm,
  },
  workerJobsSegmentActive: {
    backgroundColor: color.surface.base,
    borderColor: color.surface.strokeStrong,
    borderWidth: 1,
  },
  workerJobsSegmentShell: {
    backgroundColor: color.surface.soft,
    borderColor: color.surface.stroke,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs,
    position: 'relative',
    zIndex: 2,
  },
  workerActivityFilterPattern: {
    position: 'relative',
    zIndex: 2,
  },
  workerMapExpandedSheet: {
    alignItems: 'center',
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.md,
  },
  workerMapAvailabilityPill: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderRadius: radius.pill,
    borderWidth: 0,
    flexDirection: 'row',
    gap: spacing.xs,
    height: 0,
    minHeight: 0,
    opacity: 0,
    overflow: 'hidden',
    paddingHorizontal: 0,
    paddingVertical: 0,
    position: 'absolute',
    right: spacing.sm,
    top: spacing.sm,
    width: 0,
    zIndex: 6,
  },
  workerMapControlButton: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderRadius: 16,
    borderWidth: 0,
    height: 43,
    justifyContent: 'center',
    width: 43,
  },
  workerMapControlButtonDivided: {
    borderTopColor: 'rgba(145,205,196,0.28)',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  workerMapControlIcon: {
    height: 28,
    width: 28,
  },
  workerMapControlStack: {
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: 'rgba(255,255,255,0.96)',
    borderRadius: 23,
    borderWidth: 1,
    gap: 0,
    overflow: 'hidden',
    padding: 6,
    position: 'absolute',
    right: 12,
    top: 12,
    zIndex: 6,
    ...shadow.soft,
  },
  workerMapCoverageLine: {
    backgroundColor: color.mint.mint300,
    borderRadius: radius.pill,
    height: 3,
    left: '20%',
    opacity: 0.64,
    position: 'absolute',
    top: '55%',
    transform: [{ rotate: '-18deg' }],
    width: '58%',
  },
  workerMapLiquidGlassOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: radius.xl,
  },
  workerMapLiquidLens: {
    backgroundColor: 'rgba(159,236,223,0.22)',
    borderRadius: radius.pill,
    height: 152,
    left: '20%',
    opacity: 0.8,
    position: 'absolute',
    top: '18%',
    width: 184,
  },
  workerMapRouteLine: {
    backgroundColor: color.brand.primary,
    opacity: 0.78,
  },
  workerMapHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  workerMapOpenButton: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderRadius: radius.pill,
    borderWidth: 0,
    bottom: spacing.xxxl * 3,
    height: 0,
    minHeight: 0,
    opacity: 0,
    overflow: 'hidden',
    paddingHorizontal: 0,
    paddingVertical: 0,
    position: 'absolute',
    right: spacing.sm,
    width: 0,
    zIndex: 6,
  },
  workerMapOrigin: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderColor: 'rgba(255,255,255,0.98)',
    borderRadius: 20,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    left: '50%',
    position: 'absolute',
    top: '49%',
    transform: [{ translateX: -22 }, { translateY: -22 }],
    width: 44,
    zIndex: 5,
    ...shadow.soft,
  },
  workerMapOriginIcon: {
    height: 32,
    width: 32,
  },
  workerMapRadius: {
    backgroundColor: 'rgba(29,199,177,0.09)',
    borderColor: 'rgba(13,174,154,0.44)',
    borderRadius: radius.pill,
    borderWidth: 2,
    height: 166,
    left: '50%',
    position: 'absolute',
    top: '48%',
    transform: [{ translateX: -83 }, { translateY: -83 }],
    width: 166,
  },
  workerMapSearchPill: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderRadius: radius.pill,
    borderWidth: 0,
    height: 0,
    left: spacing.sm,
    maxWidth: 0,
    minHeight: 0,
    opacity: 0,
    overflow: 'hidden',
    paddingHorizontal: 0,
    paddingVertical: 0,
    position: 'absolute',
    top: spacing.sm,
    width: 0,
    zIndex: 6,
  },
  workerMapStage: {
    backgroundColor: '#EAF7E7',
    borderCurve: 'continuous',
    borderColor: 'rgba(255,255,255,0.96)',
    borderRadius: 30,
    borderWidth: 1,
    height: 236,
    minHeight: 236,
    overflow: 'hidden',
    position: 'relative',
    ...shadow.raised,
  },
  workerMapMaterialBlock: {
    backgroundColor: 'rgba(255,255,255,0.46)',
    borderColor: 'rgba(255,255,255,0.72)',
    borderRadius: radius.md,
    borderWidth: 1,
    position: 'absolute',
    zIndex: 2,
  },
  workerMapRoadBand: {
    backgroundColor: 'rgba(255,255,255,0.64)',
    borderColor: 'rgba(255,255,255,0.48)',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    position: 'absolute',
    zIndex: 1,
  },
  workerMapRoadBandA: {
    height: 26,
    left: -44,
    top: 68,
    transform: [{ rotate: '27deg' }],
    width: 284,
  },
  workerMapRoadBandB: {
    height: 22,
    left: 108,
    top: 95,
    transform: [{ rotate: '-28deg' }],
    width: 288,
  },
  workerMapRoadBandC: {
    height: 20,
    left: -30,
    top: 154,
    transform: [{ rotate: '-23deg' }],
    width: 250,
  },
  workerMapRoadBandD: {
    height: 18,
    right: -32,
    top: 144,
    transform: [{ rotate: '118deg' }],
    width: 180,
  },
  workerMapBlockA: {
    height: 70,
    left: spacing.lg,
    top: spacing.xl,
    width: 96,
  },
  workerMapBlockB: {
    height: 82,
    right: spacing.xxl,
    top: spacing.xxxl,
    width: 108,
  },
  workerMapBlockC: {
    bottom: spacing.xxxl + spacing.xl,
    height: 70,
    left: spacing.xxl,
    width: 126,
  },
  workerMapBlockD: {
    bottom: spacing.xxl,
    height: 78,
    right: spacing.xl,
    width: 92,
  },
  workerHomeMapMaterialContours: {
    borderColor: 'rgba(58,181,165,0.18)',
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 96,
    left: '14%',
    opacity: 0.78,
    position: 'absolute',
    top: '24%',
    width: 214,
  },
  workerHomeMaterialDepthPlane: {
    ...StyleSheet.absoluteFillObject,
    borderColor: 'rgba(255,255,255,0.48)',
    borderRadius: radius.lg,
    borderWidth: 1,
    opacity: 0.48,
  },
  workerHomeMaterialSubstrate: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(229,247,243,0.54)',
    borderRadius: radius.lg,
  },
  workerPulseDot: {
    backgroundColor: color.mint.mint300,
    borderRadius: radius.pill,
    height: 10,
    width: 10,
  },
  workerPulseDotStrong: {
    backgroundColor: color.brand.primary,
  },
  workerPrivacyStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    height: 0,
    marginTop: 0,
    opacity: 0,
    overflow: 'hidden',
    width: 0,
  },
  workerKaelBriefCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(225,255,247,0.78)',
    borderColor: 'rgba(255,255,255,0.90)',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    minHeight: 76,
    paddingHorizontal: 12,
    paddingVertical: 11,
    position: 'relative',
    zIndex: 2,
    ...shadow.soft,
  },
  workerKaelBriefAvatarShell: {
    alignItems: 'center',
    backgroundColor: color.surface.mint,
    borderColor: color.surface.strokeStrong,
    borderRadius: 20,
    borderWidth: 1,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  workerKaelBriefAvatar: {
    height: 48,
    width: 48,
  },
  workerKaelBriefCopy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  workerKaelBriefTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'space-between',
  },
  workerFlowTitle: {
    gap: spacing.xxs,
  },
  workerReadinessCard: {
    alignSelf: 'center',
    gap: spacing.md,
    overflow: 'visible',
    position: 'relative',
    width: '100%',
  },
  workerReadinessHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
    position: 'relative',
    zIndex: 2,
  },
  workerHomeReadyPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    minHeight: 36,
    minWidth: 0,
    paddingHorizontal: 11,
    ...shadow.soft,
  },
  workerAvailabilityControlCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderColor: 'rgba(255,255,255,0.96)',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1.08,
    flexDirection: 'row',
    gap: 9,
    minHeight: 54,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
    ...shadow.soft,
  },
  workerReadinessTitleRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minWidth: 0,
  },
  workerReadinessTitleCopy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  workerReadinessStatusIcon: {
    height: 26,
    width: 26,
  },
  workerReadinessSignalRow: {
    height: 0,
    overflow: 'hidden',
    width: 0,
  },
  workerReadinessSignalText: {
    backgroundColor: 'transparent',
    height: 0,
    maxWidth: 0,
    paddingHorizontal: 0,
    width: 0,
  },
  workerAvailabilityInlineAction: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderRadius: radius.pill,
    borderWidth: 0,
    height: 0,
    justifyContent: 'center',
    minHeight: 0,
    minWidth: 0,
    opacity: 0,
    paddingHorizontal: 0,
    width: 0,
  },
  workerAvailabilityInlineActionDisabled: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  workerRouteAfterAccept: {
    backgroundColor: color.surface.mint,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm,
  },
  workerScopeEvidenceForm: {
    gap: spacing.sm,
  },
  workerNeedsCard: {
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  workerMoneyFlowStack: {
    gap: spacing.md,
  },
  workerMoneyScreenCard: {
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    overflow: 'hidden',
    padding: spacing.md,
  },
  workerMoneyWalletSurface: {
    backgroundColor: color.surface.base,
    borderColor: glass.stroke,
    borderRadius: radius.xl,
    borderWidth: 1,
    gap: spacing.md,
    overflow: 'hidden',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    ...shadow.raised,
  },
  workerMoneyWalletSurfaceOpaque: {
    backgroundColor: color.surface.base,
  },
  workerMoneyWalletSurfaceAura: {
    height: '64%' as DimensionValue,
    opacity: 1,
    position: 'absolute',
    right: -spacing.xxl,
    top: -spacing.xl,
    width: '86%' as DimensionValue,
  },
  workerMoneyWalletGlassVeil: {
    backgroundColor: glass.bgStrong,
    borderRadius: radius.xl,
    height: '42%' as DimensionValue,
    left: 0,
    opacity: 0.72,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  workerMoneyWalletTopLens: {
    backgroundColor: color.surface.base,
    borderRadius: radius.sheet,
    height: spacing.xxxl * 2 + spacing.xl,
    left: -spacing.xxl,
    opacity: 0.54,
    position: 'absolute',
    right: -spacing.xxxl,
    top: -spacing.xxxl,
    transform: [{ rotate: '-4deg' }],
  },
  workerMoneyWalletBottomLens: {
    backgroundColor: color.mint.white,
    borderRadius: radius.sheet,
    bottom: -spacing.xxxl,
    height: spacing.xxxl * 2,
    left: spacing.xxl,
    opacity: 0.42,
    position: 'absolute',
    right: -spacing.xxxl,
    transform: [{ rotate: '8deg' }],
  },
  workerMoneyWalletSurfaceHighlight: {
    backgroundColor: glass.innerHighlight,
    height: StyleSheet.hairlineWidth,
    left: spacing.lg,
    opacity: 0.78,
    position: 'absolute',
    right: spacing.lg,
    top: 1,
    zIndex: 1,
  },
  workerMoneyWalletHero: {
    backgroundColor: color.brand.primaryDeep,
    borderColor: color.brand.primaryDark,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    minHeight: component.button.primary.height * 3 + spacing.sm,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    position: 'relative',
    ...shadow.soft,
  },
  workerMoneyHeroMintLayer: {
    backgroundColor: color.mint.mint300,
    borderRadius: radius.sheet,
    height: '74%' as DimensionValue,
    left: -spacing.xxxl,
    opacity: 0.16,
    position: 'absolute',
    top: -spacing.xxxl,
    transform: [{ rotate: '-10deg' }],
    width: '72%' as DimensionValue,
  },
  workerMoneyHeroEmeraldLayer: {
    backgroundColor: color.brand.primary,
    borderRadius: radius.xl,
    height: '112%' as DimensionValue,
    opacity: 0.22,
    position: 'absolute',
    right: -spacing.xs,
    top: -spacing.sm,
    width: '33%' as DimensionValue,
  },
  workerMoneyHeroDeepLayer: {
    backgroundColor: color.mint.mint800,
    borderRadius: radius.sheet,
    bottom: -spacing.xxxl,
    height: '78%' as DimensionValue,
    left: '34%' as DimensionValue,
    opacity: 0.52,
    position: 'absolute',
    transform: [{ rotate: '-9deg' }],
    width: '78%' as DimensionValue,
  },
  workerMoneyHeroLensBand: {
    backgroundColor: glass.bg,
    borderRadius: radius.sheet,
    height: '42%' as DimensionValue,
    left: -spacing.xxl,
    opacity: 0.18,
    position: 'absolute',
    right: -spacing.xxl,
    top: '32%' as DimensionValue,
    transform: [{ rotate: '-10deg' }],
  },
  workerMoneyHeroSpecularLine: {
    backgroundColor: glass.innerHighlight,
    height: StyleSheet.hairlineWidth,
    left: spacing.md,
    opacity: 0.48,
    position: 'absolute',
    right: spacing.md,
    top: spacing.sm,
  },
  workerMoneyHeroTopRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    zIndex: 1,
  },
  workerMoneyHeroMetrics: {
    backgroundColor: color.mint.mint800,
    borderColor: component.agenticCenter.primaryButtonBorderLight,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 0,
    marginTop: spacing.xs,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    zIndex: 1,
  },
  workerMoneyHeroMetricCell: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
    paddingVertical: spacing.xxs,
  },
  workerMoneyHeroMetricDivider: {
    backgroundColor: component.agenticCenter.primaryButtonBorderLight,
    marginHorizontal: spacing.md,
    width: 1,
  },
  workerMoneyHeroMetricValue: {
    fontSize: typography.body.fontSize,
    fontWeight: '700',
    lineHeight: typography.body.lineHeight,
  },
  workerMoneyWithdrawHero: {
    alignItems: 'center',
    backgroundColor: color.surface.mint,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 108,
    padding: spacing.md,
  },
  workerMoneyWalletCopy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  workerMoneyHeroBalanceCopy: {
    paddingTop: spacing.xs,
  },
  workerMoneyWalletTitle: {
    alignItems: 'center',
    paddingTop: spacing.xs,
  },
  workerMoneyWalletTitleText: {
    color: color.text.primary,
    fontWeight: '700',
  },
  workerMoneyAmount: {
    color: color.brand.primaryDark,
  },
  workerMoneyAmountOnDark: {
    color: color.text.inverse,
    fontSize: typography.h2.fontSize,
    fontWeight: '700',
    lineHeight: typography.h2.lineHeight,
  },
  workerMoneyHeroAction: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: component.button.secondary.bg,
    borderColor: glass.stroke,
    borderRadius: radius.lg,
    borderWidth: 1,
    minHeight: component.button.secondary.height,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    transform: [{ translateY: spacing.xs }],
    ...shadow.soft,
  },
  workerMoneyHeroActionText: {
    color: component.button.secondary.text,
    fontWeight: '700',
  },
  workerMoneyBackAction: {
    alignSelf: 'flex-start',
    minHeight: component.chip.height,
    justifyContent: 'center',
  },
  workerMoneyActionDisabled: {
    opacity: 0.56,
  },
  workerMoneyReadyCard: {
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
    ...shadow.soft,
  },
  workerMoneyReadySectionTitle: {
    fontWeight: '700',
    marginBottom: -spacing.xs,
  },
  workerMoneyReadyTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  workerMoneyReadyThumb: {
    backgroundColor: color.surface.mint,
    borderColor: color.surface.stroke,
    borderRadius: radius.sm,
    borderWidth: 1,
    height: spacing.xxxl + spacing.lg,
    width: spacing.xxxl + spacing.lg,
  },
  workerMoneyReadyMainCopy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
    paddingTop: spacing.xxs,
  },
  workerMoneyReadyServiceTitle: {
    fontWeight: '700',
  },
  workerMoneyReadyAmountStack: {
    alignItems: 'flex-end',
    gap: spacing.xs,
    minWidth: spacing.xxxl * 2 + spacing.lg,
  },
  workerMoneyReadyAmount: {
    color: color.brand.primaryDark,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
    lineHeight: typography.body.lineHeight,
  },
  workerMoneyReadyStatusPill: {
    backgroundColor: color.surface.mint,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: typography.caption.lineHeight + spacing.xs * 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  workerMoneyReadyStatusText: {
    color: color.brand.primaryDark,
    fontSize: typography.caption.fontSize,
    fontWeight: '700',
    lineHeight: typography.caption.lineHeight,
  },
  workerMoneyReadyConfirmRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  workerMoneyTransactions: {
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  workerMoneySubHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  workerMoneySubHeaderTitle: {
    fontWeight: '700',
  },
  workerMoneyViewAllAction: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: component.chip.height,
    paddingHorizontal: spacing.xs,
  },
  workerMoneyViewAllText: {
    fontWeight: '700',
  },
  workerMoneyTransactionRow: {
    alignItems: 'center',
    borderTopColor: color.surface.stroke,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: component.button.primary.height + spacing.xs,
    paddingVertical: spacing.sm,
  },
  workerMoneyTransactionEmptyRow: {
    backgroundColor: color.surface.base,
    minHeight: component.button.primary.height,
    paddingRight: spacing.xs,
  },
  workerMoneyTransactionSign: {
    alignItems: 'center',
    backgroundColor: color.surface.base,
    borderRadius: radius.pill,
    height: spacing.lg,
    justifyContent: 'center',
    width: spacing.lg,
  },
  workerMoneyTransactionSignAccent: {
    backgroundColor: color.mint.mint50,
  },
  workerMoneyTransactionSignText: {
    color: color.brand.primary,
    fontWeight: '700',
  },
  workerMoneyTransactionEmptyTitle: {
    fontWeight: '700',
  },
  workerMoneyTransactionAmountStack: {
    alignItems: 'flex-end',
    gap: spacing.xxs,
    minWidth: 92,
  },
  workerMoneyTransactionPositive: {
    color: color.brand.primaryDark,
  },
  workerMoneyBreakdownCard: {
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...shadow.soft,
  },
  workerMoneyBreakdownHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: component.chip.height,
  },
  workerMoneyBreakdownTitle: {
    color: color.brand.primaryDark,
    flex: 1,
    fontWeight: '700',
  },
  workerMoneyIncomeRows: {
    gap: 0,
  },
  workerMoneyIncomeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    minHeight: component.button.secondary.height,
    paddingVertical: spacing.xs,
  },
  workerMoneyIncomeRowDivider: {
    borderBottomColor: color.surface.stroke,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  workerMoneyIncomeRowEmphasis: {
    borderBottomWidth: 0,
    marginTop: spacing.xs,
    minHeight: component.button.secondary.height,
    paddingTop: spacing.xs,
  },
  workerMoneyIncomeLabel: {
    flexShrink: 1,
    fontSize: typography.label.fontSize,
    fontWeight: '500',
    lineHeight: typography.label.lineHeight,
    minWidth: 0,
  },
  workerMoneyIncomeLabelEmphasis: {
    fontWeight: '700',
  },
  workerMoneyIncomeValue: {
    flexShrink: 0,
    fontSize: typography.label.fontSize,
    fontWeight: '700',
    lineHeight: typography.label.lineHeight,
    textAlign: 'right',
  },
  workerMoneyIncomeValueEmphasis: {
    color: color.brand.primaryDark,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
    lineHeight: typography.body.lineHeight,
  },
  workerMoneyIncomeIcon: {
    height: component.bottomNav.iconSize + spacing.lg,
    width: component.bottomNav.iconSize + spacing.lg,
  },
  workerMoneyMiniIcon: {
    height: spacing.xl,
    width: spacing.xl,
  },
  workerMoneyMethodPanel: {
    alignItems: 'center',
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  workerMoneyMethodIcon: {
    height: spacing.xxxl,
    width: spacing.xxxl,
  },
  workerMoneySecurityCard: {
    alignItems: 'flex-start',
    backgroundColor: color.surface.mint,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  workerMoneyCheckLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: spacing.lg,
  },
  workerMoneyTextAction: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  workerMoneyCashIcon: {
    height: spacing.xxxl + spacing.xl,
    width: spacing.xxxl + spacing.xl,
  },
  workerMoneyChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  workerMoneyAmountChip: {
    alignItems: 'center',
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: component.chip.height,
    minWidth: 74,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  workerMoneyInfoNote: {
    backgroundColor: color.surface.mint,
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  workerMoneyRecentRequest: {
    backgroundColor: color.surface.soft,
    borderColor: color.surface.stroke,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  workerOnsiteAdvisoryRail: {
    backgroundColor: color.surface.soft,
    borderColor: color.surface.stroke,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.sm,
  },
  workerSafetyCard: {
    backgroundColor: color.surface.base,
    borderColor: color.surface.stroke,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  workerSafetyReferenceItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  workerSafetyReferenceEmpty: {
    paddingVertical: spacing.xs,
  },
  workerSafetyReferenceList: {
    gap: spacing.xs,
  },
  workerTrainingConsent: {
    alignItems: 'center',
    backgroundColor: color.surface.soft,
    borderColor: color.surface.stroke,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 34,
    paddingHorizontal: spacing.md,
  },
  workerHomeServiceSection: {
    gap: spacing.sm,
    position: 'relative',
    zIndex: 2,
  },
  workerHomeServiceGrid: {
    flexDirection: 'row',
    gap: 9,
  },
  workerHomeServiceCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 25,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xs,
    minHeight: 120,
    minWidth: 0,
    overflow: 'hidden',
    paddingBottom: 11,
    paddingHorizontal: 8,
    paddingTop: 11,
    position: 'relative',
    ...shadow.soft,
  },
  workerHomeServiceCardActive: {
    borderColor: 'rgba(64,215,193,0.46)',
    shadowColor: 'rgba(7,158,141,0.24)',
    shadowOpacity: 0.18,
    shadowRadius: 18,
  },
  workerHomeServiceIconShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 19,
    borderWidth: 1,
    height: 55,
    justifyContent: 'center',
    width: 55,
    ...shadow.soft,
  },
  workerHomeServiceIcon: {
    height: 37,
    width: 37,
  },
  workerHomeServiceNote: {
    textAlign: 'center',
  },
  workerServiceScopeChip: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E4F0EE',
    borderRadius: radius.md,
    borderWidth: 1,
    flexBasis: '21%',
    flexGrow: 0,
    flexShrink: 1,
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: spacing.xxxl * 2 + spacing.xxl,
    minWidth: 0,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
    ...shadow.soft,
  },
  workerServiceScopeChipActive: {
    backgroundColor: '#FAFFFD',
    borderColor: '#D7F0EA',
  },
  workerServiceScopeIcon: {
    height: spacing.xxxl + spacing.xs,
    width: spacing.xxxl + spacing.xs,
  },
  workerServiceScopeRow: {
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: spacing.md,
    justifyContent: 'space-between',
    width: '100%',
  },
  workerProfileDivider: {
    backgroundColor: color.surface.stroke,
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  workerProfileLevelScrollIndicator: {
    backgroundColor: color.surface.soft,
    borderRadius: radius.pill,
    height: 4,
    overflow: 'hidden',
  },
  workerProfileLevelScrollThumb: {
    backgroundColor: color.brand.primary,
    borderRadius: radius.pill,
    height: 4,
    width: '34%',
  },
  workerProfileLevelAura: {
    opacity: 0.78,
  },
  workerProfileLevelCurrentCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(241,251,248,0.82)',
    borderColor: glass.stroke,
    borderCurve: 'continuous',
    borderRadius: radius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 122,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    position: 'relative',
  },
  workerProfileLevelHighlight: {
    backgroundColor: glass.innerHighlight,
    borderRadius: radius.pill,
    height: 1,
    left: spacing.lg,
    position: 'absolute',
    right: spacing.lg,
    top: 1,
  },
  workerProfileLevelOrb: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: color.surface.strokeStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 82,
    justifyContent: 'center',
    width: 82,
    ...shadow.soft,
  },
  workerProfileLevelOrbValue: {
    color: color.brand.primaryDark,
    fontSize: typography.h1.fontSize + 2,
    lineHeight: typography.h1.lineHeight + 2,
  },
  workerProfileLevelShell: {
    gap: spacing.md,
  },
  workerProfileLevelSignalGlassRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  workerProfileLevelText: {
    flex: 1,
    gap: spacing.sm,
    minWidth: 0,
  },
  workerProfileMarker: {
    height: 0,
    width: 0,
  },
  workerProfileFunctionBody: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  workerProfileFunctionCard: {
    gap: spacing.md,
  },
  workerProfileFunctionText: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  workerProfileHeroAvatarAura: {
    opacity: 0.74,
  },
  workerProfileHeroAvatarFrame: {
    alignItems: 'center',
    backgroundColor: color.surface.mint,
    borderColor: color.surface.strokeStrong,
    borderCurve: 'continuous',
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 84,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 84,
    ...shadow.soft,
  },
  workerProfileHeroAvatarImage: {
    height: 72,
    width: 72,
  },
  workerProfileHeroAura: {
    opacity: 0.82,
  },
  workerProfileHeroCard: {
    backgroundColor: glass.bgStrong,
    borderColor: glass.stroke,
    borderCurve: 'continuous',
    borderRadius: component.card.largeRadius,
    borderWidth: 1,
    gap: spacing.sm,
    overflow: 'hidden',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxxl + spacing.md,
    paddingBottom: spacing.md,
    position: 'relative',
    ...shadow.raised,
  },
  workerProfileHeroCopy: {
    flex: 1,
    gap: spacing.xxs,
    minWidth: 0,
  },
  workerProfileHeroHighlight: {
    backgroundColor: glass.innerHighlight,
    borderRadius: radius.pill,
    height: 1,
    left: spacing.lg,
    position: 'absolute',
    right: spacing.lg,
    top: 1,
  },
  workerProfileHeroIdentity: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  workerProfileHeroIconButton: {
    alignItems: 'center',
    backgroundColor: glass.bg,
    borderColor: glass.stroke,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  workerProfileHeroName: {
    flexShrink: 1,
  },
  workerProfileHeroStatusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  workerProfileHeroUtilityRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: spacing.lg,
    position: 'absolute',
    right: spacing.lg,
    top: spacing.md,
    zIndex: 2,
  },
  workerProfileHeroCta: {
    borderRadius: radius.lg,
  },
  workerProfileNameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  workerProfileMiniSubtitle: {
    textAlign: 'center',
  },
  workerProfileMiniTile: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderColor: color.surface.stroke,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexBasis: '30%',
    flexGrow: 1,
    flexShrink: 1,
    gap: spacing.xs,
    minHeight: 92,
    minWidth: 92,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    ...shadow.soft,
  },
  workerProfileMiniTitle: {
    color: color.text.strong,
    textAlign: 'center',
  },
  workerProfileStatusCopy: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  workerProfileStatusIcon: {
    height: spacing.xl,
    width: spacing.xl,
  },
  workerProfileStatusPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: glass.stroke,
    borderRadius: radius.lg,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: component.button.secondary.height - spacing.xs,
    minWidth: 148,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  workerProfileStatusValue: {
    color: color.text.strong,
    fontWeight: '700',
  },
  workerProfileVerifiedIcon: {
    height: spacing.lg,
    width: spacing.lg,
  },
  workerProfileQuickHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  workerProfileOverviewShell: {
    backgroundColor: glass.bgStrong,
    borderColor: glass.stroke,
    borderCurve: 'continuous',
    borderRadius: component.card.largeRadius,
    borderWidth: 1,
    gap: spacing.sm,
    overflow: 'hidden',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    position: 'relative',
    ...shadow.raised,
  },
  workerProfileLevelShellCard: {
    backgroundColor: glass.bgStrong,
    borderColor: glass.stroke,
    borderCurve: 'continuous',
    borderRadius: component.card.largeRadius,
    borderWidth: 1,
    gap: spacing.md,
    overflow: 'hidden',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    position: 'relative',
    ...shadow.raised,
  },
  workerProfileSectionAura: {
    opacity: 0.72,
  },
  workerProfileSectionBlock: {
    gap: spacing.md,
  },
  workerProfileSectionHighlight: {
    backgroundColor: glass.innerHighlight,
    borderRadius: radius.pill,
    height: 1,
    left: spacing.lg,
    position: 'absolute',
    right: spacing.lg,
    top: 1,
  },
  workerProfileUnifiedCard: {
    gap: spacing.md,
  },
  workerLevelProgressFill: {
    backgroundColor: color.brand.primary,
    borderRadius: radius.pill,
    height: '100%',
  },
  workerLevelProgressTrack: {
    backgroundColor: color.surface.soft,
    borderRadius: radius.pill,
    height: 8,
    overflow: 'hidden',
    width: '100%',
  },
})
