import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from './customer-audio'
import * as ImagePicker from 'expo-image-picker'
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg'
import { SafeAreaView } from 'react-native-safe-area-context'
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  buildLocalJobDisplayCode,
  inferLocalDealDraftFromKael,
  LOCAL_DEAL_ID,
  PROBLEM_CHIPS,
  SERVICE_TYPES,
  extractKnownDistrictLabel,
  type LocalDeal,
  type LocalDealEstimate,
  type LocalPaymentStatus,
  type LocalDealStatus,
  type LocalScopeChange,
  type CustomerKaelMemoryPreferenceKey,
  type ServiceType,
} from '@nestscout/shared'
import { GlassSurface } from '@/components/ui/glass-surface'
import { KaelButton, KaelChip, KaelTextField, KaelTextInput } from '@/components/ui/kael-primitives'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { ReduceMotionAwareEntranceView } from '@/components/ui/reduce-motion-aware-animation'
import { motionDuration, motionTokens } from '@/components/ui/motion-tokens'
import { generateClientRequestId } from '@/lib/client-request-id'
import { setAppLanguage, useAppLanguage, type AppLanguage } from '@/lib/app-language'
import { useAuth } from '@/lib/auth-provider'
import { useFrontendWorkflow, type CustomerKaelMemoryPreferenceUpdateResult } from '@/lib/frontend-workflow-provider'
import { customerProfileService, jobService, kaelAssistantService, kaelChatService, placesService } from '@/lib/services'
import { uploadJobMediaDrafts, uploadKaelChatMediaDrafts, type LocalMediaUploadDraft } from '@/lib/media-upload'
import type { CustomerProfileInsightsResponse, KaelAssistantResponse, KaelChatResponse, KaelChatTurn, PlacesAutocompleteResponse } from '@/lib/api-types'
import {
  getCustomerThemeTokens,
  getReducedTransparencyCustomerTokens,
  useCustomerThemeMode,
  type CustomerThemeTokens,
} from '../customer-theme'
import { clearPendingKaelChatDraft, peekPendingKaelChatDraft, readPendingKaelChatDraft, setPendingKaelChatDraft } from '../kael-chat/pending-intake'
import { ScopeChangeHardStopModal } from '../scope-change-modal/scope-change-hard-stop-modal'
import { customerV21Assets, customerV21BankAssets, customerV21ServiceAssets, type CustomerV21BankKey } from './assets'
import { buildKaelProcessSequence, type KaelProcessLine, type KaelProcessScenarioId } from './kael-process-lines'
import {
  customerV21CommonCopy,
  customerV21ScreenTitles,
  customerV21ServiceCopy,
  customerV21StatusCopy,
  customerV21TabCopy,
} from './copy'
import { type CustomerDockActive, type CustomerKaelMode, type CustomerPrimaryTab, type CustomerV21ScreenId } from './types'

const customerKaelChatRoute = '/(customer)/kael-chat?mode=normal'
const customerKaelWorkRoute = '/(customer)/kael-chat?mode=case'

function isRealCaseDeal(deal: LocalDeal | null | undefined): deal is LocalDeal {
  return Boolean(deal?.id && deal.id !== LOCAL_DEAL_ID)
}

function cleanRouteJobId(jobId: string | null | undefined) {
  return jobId && jobId !== LOCAL_DEAL_ID ? jobId : null
}

function shouldUseLegacyKaelEvidenceFallback(
  result: { code?: string; status?: number },
  photoUrls: string[],
) {
  if (photoUrls.length === 0) return false
  return result.status === 404 ||
    result.code === 'NOT_FOUND' ||
    (result.status === 400 && result.code === 'VALIDATION')
}

function shouldFallbackCaseAssistantToJobChat(result: { code?: string; error?: string; status?: number }) {
  const normalizedError = (result.error ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  return result.status === 404 && (
    normalizedError.includes('endpoint') ||
    (result.code === 'NOT_FOUND' && normalizedError.includes('khong tim thay endpoint'))
  )
}

function customerCaseWorkRouteForDeal(deal: LocalDeal | null | undefined, suffix = '') {
  return isRealCaseDeal(deal)
    ? `/(customer)/kael-chat?mode=case&jobId=${encodeURIComponent(deal.id)}${suffix}`
    : customerKaelWorkRoute
}

const caseScreenIds: CustomerV21ScreenId[] = [
  '2.5-chat-case',
  '2.6-case-overview',
  '2.7-matching',
  '2.8-options',
  '2.9-quotes',
  '3.1-payment-review',
  '3.2-payment-method',
  '3.3-payment-protected',
  '2.10-location-eta',
  '2.11-live-alert',
  '2.12-job-accepted',
  '2.13-job-progress',
]

const caseWorkScreenIds: CustomerV21ScreenId[] = ['2.5-chat-case', '2.6-case-overview', '2.7-matching', '2.8-options', '2.9-quotes']
const paymentScreenIds: CustomerV21ScreenId[] = ['3.1-payment-review', '3.2-payment-method', '3.3-payment-protected']
const chatCompressedActivityScreenIds = new Set<CustomerV21ScreenId>(['2.6-case-overview', '2.7-matching', '2.8-options', '2.9-quotes', '2.10-location-eta', '2.11-live-alert', '2.12-job-accepted', '2.13-job-progress'])
const completionScreenIds: CustomerV21ScreenId[] = ['2.13-job-progress']
const paymentBankOptions: Array<{ key: CustomerV21BankKey; name: string; vietQrCode: string }> = [
  { key: 'vietcombank', name: 'Vietcombank', vietQrCode: 'VCB' },
  { key: 'techcombank', name: 'Techcombank', vietQrCode: 'TCB' },
  { key: 'bidv', name: 'BIDV', vietQrCode: 'BIDV' },
  { key: 'mbbank', name: 'MBBank', vietQrCode: 'MB' },
  { key: 'acb', name: 'ACB', vietQrCode: 'ACB' },
  { key: 'vietinbank', name: 'VietinBank', vietQrCode: 'ICB' },
]

function openMicrophoneSettingsPrompt(language: AppLanguage, title: string) {
  Alert.alert(
    title,
    language === 'vi'
      ? 'Mở Cài đặt để cho phép NestScout dùng mic.'
      : 'Open Settings to allow NestScout to use the microphone.',
    [
      { text: language === 'vi' ? 'Để sau' : 'Later', style: 'cancel' },
      {
        text: language === 'vi' ? 'Mở cài đặt' : 'Open settings',
        onPress: () => {
          void Linking.openSettings().catch(() => undefined)
        },
      },
    ],
  )
}
const bookingTimeSlots = ['08:00-10:00', '10:00-12:00', '14:00-16:00', '16:00-18:00'] as const
const bookingScheduleRuntimeRefreshMs = 30_000
const bookingAddressLookupDelayMs = 260
const bookingSearchInputTextColor = '#071A24'
const bookingSearchProblemLimit = 5
const bookingServiceSearchKeywords: Record<ServiceType, readonly string[]> = {
  cleaning: ['ve sinh', 'don nha', 'don dep', 'lau don', 'bep', 'phong tam', 'tong ve sinh', 'cua kinh', 'sau sua chua'],
  electrical: ['dien', 'sua dien', 'o cam', 'o dien', 'cong tac', 'cau dao', 'aptomat', 'cb', 'den', 'mat dien', 'chap'],
  plumbing: ['nuoc', 'sua nuoc', 'ong nuoc', 'duong ong', 'ong', 'voi', 'ro ri', 'cong', 'bon', 'toilet', 'ap nuoc', 'lavabo'],
}
const bookingProblemSearchKeywords: Record<ServiceType, Partial<Record<string, readonly string[]>>> = {
  cleaning: {
    [PROBLEM_CHIPS.cleaning[0]]: ['don nha', 'don dep', 've sinh nha', 'lau don'],
    [PROBLEM_CHIPS.cleaning[1]]: ['bep', 'dau mo', 'khu bep'],
    [PROBLEM_CHIPS.cleaning[2]]: ['phong tam', 'nha tam', 'toilet', 'wc'],
    [PROBLEM_CHIPS.cleaning[3]]: ['tong ve sinh', 've sinh sau lau ngay'],
    [PROBLEM_CHIPS.cleaning[4]]: ['sau sua chua', 'bui', 'cong trinh'],
    [PROBLEM_CHIPS.cleaning[5]]: ['cua kinh', 'kinh', 'ban cong'],
  },
  electrical: {
    [PROBLEM_CHIPS.electrical[0]]: ['mat dien', 'mot phong', 'phong ngu', 'phong khach'],
    [PROBLEM_CHIPS.electrical[1]]: ['mat dien', 'toan can', 'ca can'],
    [PROBLEM_CHIPS.electrical[2]]: ['o cam', 'o dien', 'cong tac', 'nong', 'loi'],
    [PROBLEM_CHIPS.electrical[3]]: ['cau dao', 'aptomat', 'cb', 'trip', 'nhay'],
    [PROBLEM_CHIPS.electrical[4]]: ['den', 'chap chon', 'bong den'],
    [PROBLEM_CHIPS.electrical[5]]: ['lap them', 'thiet bi', 'quat', 'may bom'],
  },
  plumbing: {
    [PROBLEM_CHIPS.plumbing[0]]: ['nuoc', 'ong', 'ong nuoc', 'duong ong', 'ro ri', 'ro nuoc', 'tham'],
    [PROBLEM_CHIPS.plumbing[1]]: ['nuoc', 'tac', 'cong', 'bon', 'bon rua', 'lavabo'],
    [PROBLEM_CHIPS.plumbing[2]]: ['nuoc', 'voi', 'voi nuoc', 'voi hong', 'ro voi'],
    [PROBLEM_CHIPS.plumbing[3]]: ['toilet', 'bon cau', 'xa nuoc', 'wc'],
    [PROBLEM_CHIPS.plumbing[4]]: ['nuoc', 'ap nuoc', 'yeu', 'may bom'],
    [PROBLEM_CHIPS.plumbing[5]]: ['lap', 'thay', 'thiet bi', 'voi', 'bon'],
  },
}
type BookingSearchSuggestion = {
  key: string
  label: string
  problem?: string
  selected: boolean
  serviceType: ServiceType
}
type BookingAddressSuggestion = PlacesAutocompleteResponse['suggestions'][number]
const chatComposerMediaTypes: ImagePicker.MediaType[] = ['images', 'videos']
const kaelProcessAnswerSettleMs = 1100
const vietnamTimelineTimeZone = 'Asia/Ho_Chi_Minh'
const kaelTimelineRefreshMs = 60_000
type CustomerAssistantLocalTurn = {
  id: string
  role: 'customer' | 'kael'
  surface: 'customer_normal' | 'customer_case'
  text_content: string
}
const bookingSourceSearchWebShadow = Platform.select({
  web: {
    boxShadow: '0 0 0 3px rgba(13,174,154,0.08), 0 10px 24px rgba(5,89,81,0.08), inset 0 1px 0 rgba(255,255,255,0.95)',
  } as unknown as ViewStyle,
  default: null,
})
const customerV21WebTextInputNoOutline = Platform.select({
  web: {
    boxShadow: 'none',
    outlineColor: 'transparent',
    outlineOffset: 0,
    outlineStyle: 'none',
    outlineWidth: 0,
  } as unknown as TextStyle,
  default: null,
})
const customerV21HiddenScrollbar = Platform.select({
  web: {
    msOverflowStyle: 'none',
    scrollbarWidth: 'none',
  } as unknown as ViewStyle,
  default: null,
})
const customerV21HiddenTextInputScrollbar = Platform.select({
  web: {
    msOverflowStyle: 'none',
    overflow: 'hidden',
    resize: 'none',
    scrollbarWidth: 'none',
  } as unknown as TextStyle,
  default: null,
})
const customerV21InvisibleTextInputScrollbar = Platform.select({
  web: {
    msOverflowStyle: 'none',
    resize: 'none',
    scrollbarWidth: 'none',
  } as unknown as TextStyle,
  default: null,
})
const CUSTOMER_LIQUID_NAV_MAX_WIDTH = 390
const CUSTOMER_LIQUID_NAV_SIDE_INSET = 12
const CUSTOMER_LIQUID_NAV_DOCK_HEIGHT = 56
const CUSTOMER_LIQUID_NAV_ORB_SIZE = 68
const CUSTOMER_LIQUID_NAV_GAP = 8
const CUSTOMER_LIQUID_NAV_RAIL_PADDING = 4

type KaelTimelineWindow = 'afternoon' | 'evening' | 'late' | 'midday' | 'morning'

const kaelTimelineHeadlines: Record<AppLanguage, Record<KaelTimelineWindow, string[]>> = {
  en: {
    afternoon: [
      'Afternoon check-in, I am here.',
      'Need anything this afternoon?',
      'I will stay with you.',
      'Let me listen first.',
    ],
    evening: [
      'Evening now, I am here.',
      'Tell me what you need tonight.',
      'I am listening, gently.',
      'We can take it slowly.',
    ],
    late: [
      'Late now, I am still here.',
      'Urgent? Tell me briefly.',
      'I am here tonight.',
      'Say only what you need.',
    ],
    midday: [
      'Midday now, I am here.',
      'Take a pause, I can help.',
      'Tell me what you need.',
      'I am listening closely.',
    ],
    morning: [
      'Good morning, I am here.',
      'Need anything this morning?',
      'I am listening.',
      'Easy start, I am here.',
    ],
  },
  vi: {
    afternoon: [
      'Buổi chiều, mình ở đây.',
      'Chiều nay cần gì, cứ nói.',
      'Mình theo cùng bạn nhé.',
      'Cứ để mình nghe trước.',
    ],
    evening: [
      'Buổi tối rồi, mình ở đây.',
      'Tối nay cần gì, cứ nói nhé.',
      'Mình nghe bạn, chậm rãi thôi.',
      'Bạn cứ nói, mình hỗ trợ.',
    ],
    late: [
      'Muộn rồi, mình vẫn nghe.',
      'Cần gấp thì cứ nói nhé.',
      'Đêm muộn rồi, mình ở đây.',
      'Bạn cứ nói ngắn thôi.',
    ],
    midday: [
      'Giữa ngày rồi, mình ở đây.',
      'Trưa rồi, cứ nói với mình.',
      'Cần gì, mình nghe nhé.',
      'Bạn nghỉ chút, mình hỗ trợ.',
    ],
    morning: [
      'Chào buổi sáng, mình ở đây.',
      'Sáng nay cần gì, cứ nói nhé.',
      'Mình nghe bạn đây.',
      'Ngày mới nhẹ nhàng nhé.',
    ],
  },
}

function getVietnamTimelineParts(now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
      minute: '2-digit',
      timeZone: vietnamTimelineTimeZone,
    }).formatToParts(now)
    const day = Number(parts.find((part) => part.type === 'day')?.value)
    const hour = Number(parts.find((part) => part.type === 'hour')?.value)
    const minute = Number(parts.find((part) => part.type === 'minute')?.value)
    if (Number.isFinite(day) && Number.isFinite(hour) && Number.isFinite(minute)) {
      return { day, hour, minute }
    }
  } catch {
    // Fallback keeps the headline on Vietnam time when a runtime lacks full Intl time-zone data.
  }
  return { day: now.getUTCDate(), hour: (now.getUTCHours() + 7) % 24, minute: now.getUTCMinutes() }
}

function kaelTimelineWindow(hour: number): KaelTimelineWindow {
  if (hour >= 5 && hour < 11) return 'morning'
  if (hour >= 11 && hour < 14) return 'midday'
  if (hour >= 14 && hour < 18) return 'afternoon'
  if (hour >= 18 && hour < 22) return 'evening'
  return 'late'
}

function kaelTimelineHeadline(language: AppLanguage, now = new Date()) {
  const { day, hour, minute } = getVietnamTimelineParts(now)
  const lines = kaelTimelineHeadlines[language][kaelTimelineWindow(hour)]
  const slot = Math.floor(minute / 10)
  return lines[(day + slot) % lines.length]
}

function useKaelTimelineHeadline(language: AppLanguage) {
  const [headline, setHeadline] = useState(() => kaelTimelineHeadline(language))

  useEffect(() => {
    const updateHeadline = () => setHeadline(kaelTimelineHeadline(language))
    updateHeadline()
    const interval = setInterval(updateHeadline, kaelTimelineRefreshMs)
    return () => clearInterval(interval)
  }, [language])

  return headline
}

const profileScreenIds: CustomerV21ScreenId[] = [
  '5.1-agentic-home',
  '5.2-command-center',
  '5.3-approval-queue',
  '5.4-memory',
  '6.1-profile-overview',
  '6.2-usage-ranking',
  '6.3-protect-money',
]
const agenticScreenIds: CustomerV21ScreenId[] = ['5.1-agentic-home', '5.2-command-center', '5.3-approval-queue', '5.4-memory']
const customerProfileStageIds: CustomerV21ScreenId[] = ['6.1-profile-overview', '6.2-usage-ranking', '6.3-protect-money']
type CustomerProfilePanel = 'overview' | 'ranking' | 'money' | 'memory'
type CustomerProfileUtility = 'address' | 'payment' | 'settings'
type AgenticMemoryRowModel = {
  enabled: boolean
  image: ImageSourcePropType
  label: string
  preferenceKey: CustomerKaelMemoryPreferenceKey
  value: string
}
type AgenticProcessedApprovalRowModel = {
  available: boolean
  body: string
  image: ImageSourcePropType
  status: string
  title: string
}

type V21Theme = CustomerThemeTokens

type KaelProcessLineRuntime = {
  activeIndex: number | null
  collapse: string | null
  lines: KaelProcessLine[]
  prompt: string
  scenarioId: KaelProcessScenarioId
  visibleCount: number
}

type AgenticCaseSignal = {
  body: string
  chip: string
  image: ImageSourcePropType
  title: string
}

function useV21Theme() {
  const mode = useCustomerThemeMode()
  const glass = useGlassAccessibility()
  const baseTokens = getCustomerThemeTokens(mode)
  const tokens = glass.reduceTransparency ? getReducedTransparencyCustomerTokens(baseTokens) : baseTokens
  return { ...glass, mode, tokens }
}

function V21Screen({
  children,
  screenId,
  testID,
}: {
  children: ReactNode
  screenId: CustomerV21ScreenId
  testID: string
}) {
  const { tokens } = useV21Theme()
  const usesHomeMintCanvas = screenId === '2.1-home' || screenId === '2.2-search' || screenId === '2.3-media'
  const usesLocationMintCanvas = screenId === '2.10-location-eta'
  const usesFulfillmentMintCanvas = screenId === '2.11-live-alert' || screenId === '2.12-job-accepted' || screenId === '2.13-job-progress'
  const usesAgenticMintCanvas = agenticScreenIds.includes(screenId)
  const usesProfileMintCanvas = customerProfileStageIds.includes(screenId)
  const usesMintCanvas = usesHomeMintCanvas || usesLocationMintCanvas || usesFulfillmentMintCanvas || usesAgenticMintCanvas || usesProfileMintCanvas
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: usesMintCanvas ? '#F1FAF8' : tokens.canvas }]} testID={testID}>
      {usesHomeMintCanvas ? <HomeCanvasAura /> : null}
      {usesLocationMintCanvas ? <LocationEtaCanvasAura /> : null}
      {usesFulfillmentMintCanvas ? <FulfillmentCanvasAura screenId={screenId} /> : null}
      {usesAgenticMintCanvas ? <AgenticCanvasAura screenId={screenId} /> : null}
      {usesProfileMintCanvas ? <ProfileCanvasAura screenId={screenId} /> : null}
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        testID="customer-v21-scroll"
      >
        <View style={styles.frame}>
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function HomeCanvasAura() {
  const { reduceTransparency } = useV21Theme()

  if (reduceTransparency) {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#F8FFFD' }]} testID="customer-v21-home-canvas-aura" />
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="customer-v21-home-canvas-aura">
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 390 844" width="100%">
        <Defs>
          <LinearGradient id="homeCanvasBase" x1="0" x2="0" y1="0" y2="1">
            <Stop offset="0" stopColor="#F9FFFD" />
            <Stop offset="0.42" stopColor="#F3FBF9" />
            <Stop offset="1" stopColor="#EDF9F6" />
          </LinearGradient>
          <RadialGradient id="homeCanvasTopRight" cx="102%" cy="-4%" r="74%">
            <Stop offset="0" stopColor="rgba(80,232,210,0.34)" />
            <Stop offset="0.58" stopColor="rgba(151,246,232,0.12)" />
            <Stop offset="0.74" stopColor="rgba(151,246,232,0)" />
          </RadialGradient>
          <RadialGradient id="homeCanvasLeft" cx="-18%" cy="38%" r="72%">
            <Stop offset="0" stopColor="rgba(136,241,223,0.22)" />
            <Stop offset="0.72" stopColor="rgba(136,241,223,0)" />
          </RadialGradient>
          <RadialGradient id="homeCanvasMidRight" cx="104%" cy="74%" r="72%">
            <Stop offset="0" stopColor="rgba(83,220,206,0.24)" />
            <Stop offset="0.72" stopColor="rgba(83,220,206,0)" />
          </RadialGradient>
          <RadialGradient id="homeCanvasBottomLeft" cx="14%" cy="104%" r="73%">
            <Stop offset="0" stopColor="rgba(145,232,222,0.23)" />
            <Stop offset="0.73" stopColor="rgba(145,232,222,0)" />
          </RadialGradient>
          <RadialGradient id="homeCanvasSoftTop" cx="16%" cy="14%" r="42%">
            <Stop offset="0" stopColor="rgba(89,232,207,0.20)" />
            <Stop offset="0.72" stopColor="rgba(89,232,207,0)" />
          </RadialGradient>
          <RadialGradient id="homeCanvasSoftMiddle" cx="82%" cy="49%" r="46%">
            <Stop offset="0" stopColor="rgba(122,243,223,0.18)" />
            <Stop offset="0.72" stopColor="rgba(122,243,223,0)" />
          </RadialGradient>
          <RadialGradient id="homeCanvasSoftBottom" cx="25%" cy="82%" r="48%">
            <Stop offset="0" stopColor="rgba(81,216,203,0.15)" />
            <Stop offset="0.75" stopColor="rgba(81,216,203,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#homeCanvasBase)" height="844" width="390" />
        <Rect fill="url(#homeCanvasTopRight)" height="844" width="390" />
        <Rect fill="url(#homeCanvasLeft)" height="844" width="390" />
        <Rect fill="url(#homeCanvasMidRight)" height="844" width="390" />
        <Rect fill="url(#homeCanvasBottomLeft)" height="844" width="390" />
        <Rect fill="url(#homeCanvasSoftTop)" height="844" width="390" />
        <Rect fill="url(#homeCanvasSoftMiddle)" height="844" width="390" />
        <Rect fill="url(#homeCanvasSoftBottom)" height="844" width="390" />
      </Svg>
    </View>
  )
}

function ProfileCanvasAura({ screenId }: { screenId: CustomerV21ScreenId }) {
  const { reduceTransparency } = useV21Theme()
  const scope = screenId.replace(/[^a-zA-Z0-9]/g, '')

  if (reduceTransparency) {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#F8FFFD' }]} testID={`customer-v21-profile-canvas-aura-${screenId}`} />
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID={`customer-v21-profile-canvas-aura-${screenId}`}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 390 844" width="100%">
        <Defs>
          <LinearGradient id={`profileCanvasBase${scope}`} x1="0" x2="0.92" y1="0" y2="1">
            <Stop offset="0" stopColor="#FBFFFE" />
            <Stop offset="0.44" stopColor="#F2FBF9" />
            <Stop offset="1" stopColor="#E6F8F3" />
          </LinearGradient>
          <RadialGradient id={`profileCanvasTop${scope}`} cx="98%" cy="1%" r="82%">
            <Stop offset="0" stopColor="rgba(77,231,209,0.34)" />
            <Stop offset="0.54" stopColor="rgba(151,246,232,0.13)" />
            <Stop offset="0.80" stopColor="rgba(151,246,232,0)" />
          </RadialGradient>
          <RadialGradient id={`profileCanvasHero${scope}`} cx="88%" cy="28%" r="72%">
            <Stop offset="0" stopColor="rgba(93,235,213,0.30)" />
            <Stop offset="0.58" stopColor="rgba(154,246,232,0.11)" />
            <Stop offset="0.82" stopColor="rgba(154,246,232,0)" />
          </RadialGradient>
          <RadialGradient id={`profileCanvasLeft${scope}`} cx="-14%" cy="42%" r="78%">
            <Stop offset="0" stopColor="rgba(120,238,221,0.20)" />
            <Stop offset="0.74" stopColor="rgba(120,238,221,0)" />
          </RadialGradient>
          <RadialGradient id={`profileCanvasBottom${scope}`} cx="50%" cy="106%" r="74%">
            <Stop offset="0" stopColor="rgba(83,220,206,0.23)" />
            <Stop offset="0.72" stopColor="rgba(83,220,206,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill={`url(#profileCanvasBase${scope})`} height="844" width="390" />
        <Rect fill={`url(#profileCanvasTop${scope})`} height="844" width="390" />
        <Rect fill={`url(#profileCanvasHero${scope})`} height="844" width="390" />
        <Rect fill={`url(#profileCanvasLeft${scope})`} height="844" width="390" />
        <Rect fill={`url(#profileCanvasBottom${scope})`} height="844" width="390" />
      </Svg>
    </View>
  )
}

function AgenticCanvasAura({ screenId }: { screenId: CustomerV21ScreenId }) {
  const { reduceTransparency } = useV21Theme()
  const scope = screenId.replace(/[^a-zA-Z0-9]/g, '')

  if (reduceTransparency) {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#F7FFFC' }]} testID={`customer-v21-agentic-canvas-aura-${screenId}`} />
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID={`customer-v21-agentic-canvas-aura-${screenId}`}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 390 844" width="100%">
        <Defs>
          <LinearGradient id={`agenticCanvasBase${scope}`} x1="0" x2="0.92" y1="0" y2="1">
            <Stop offset="0" stopColor="#FBFFFD" />
            <Stop offset="0.40" stopColor="#F4FCFA" />
            <Stop offset="1" stopColor="#E9F8F4" />
          </LinearGradient>
          <RadialGradient id={`agenticCanvasTop${scope}`} cx="98%" cy="2%" r="82%">
            <Stop offset="0" stopColor="rgba(73,232,210,0.33)" />
            <Stop offset="0.54" stopColor="rgba(151,246,232,0.13)" />
            <Stop offset="0.80" stopColor="rgba(151,246,232,0)" />
          </RadialGradient>
          <RadialGradient id={`agenticCanvasHero${scope}`} cx="91%" cy="25%" r="70%">
            <Stop offset="0" stopColor="rgba(83,220,206,0.27)" />
            <Stop offset="0.58" stopColor="rgba(154,246,232,0.10)" />
            <Stop offset="0.82" stopColor="rgba(154,246,232,0)" />
          </RadialGradient>
          <RadialGradient id={`agenticCanvasLeft${scope}`} cx="-18%" cy="42%" r="76%">
            <Stop offset="0" stopColor="rgba(132,242,223,0.20)" />
            <Stop offset="0.76" stopColor="rgba(132,242,223,0)" />
          </RadialGradient>
          <RadialGradient id={`agenticCanvasBottom${scope}`} cx="78%" cy="104%" r="78%">
            <Stop offset="0" stopColor="rgba(81,216,203,0.20)" />
            <Stop offset="0.74" stopColor="rgba(81,216,203,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill={`url(#agenticCanvasBase${scope})`} height="844" width="390" />
        <Rect fill={`url(#agenticCanvasTop${scope})`} height="844" width="390" />
        <Rect fill={`url(#agenticCanvasHero${scope})`} height="844" width="390" />
        <Rect fill={`url(#agenticCanvasLeft${scope})`} height="844" width="390" />
        <Rect fill={`url(#agenticCanvasBottom${scope})`} height="844" width="390" />
      </Svg>
    </View>
  )
}

function LocationEtaCanvasAura() {
  const { reduceTransparency } = useV21Theme()

  if (reduceTransparency) {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#F6FCFA' }]} testID="customer-v21-location-canvas-aura" />
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="customer-v21-location-canvas-aura">
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 390 844" width="100%">
        <Defs>
          <LinearGradient id="locationEtaCanvasBase" x1="0" x2="0.9" y1="0" y2="1">
            <Stop offset="0" stopColor="#FAFFFD" />
            <Stop offset="0.45" stopColor="#F4FCFA" />
            <Stop offset="1" stopColor="#EAF8F5" />
          </LinearGradient>
          <RadialGradient id="locationEtaCanvasTopRight" cx="98%" cy="4%" r="76%">
            <Stop offset="0" stopColor="rgba(80,232,210,0.31)" />
            <Stop offset="0.52" stopColor="rgba(151,246,232,0.12)" />
            <Stop offset="0.78" stopColor="rgba(151,246,232,0)" />
          </RadialGradient>
          <RadialGradient id="locationEtaCanvasHeroRight" cx="104%" cy="27%" r="66%">
            <Stop offset="0" stopColor="rgba(83,220,206,0.25)" />
            <Stop offset="0.60" stopColor="rgba(154,246,232,0.10)" />
            <Stop offset="0.82" stopColor="rgba(154,246,232,0)" />
          </RadialGradient>
          <RadialGradient id="locationEtaCanvasLeftWash" cx="-16%" cy="35%" r="72%">
            <Stop offset="0" stopColor="rgba(132,242,223,0.19)" />
            <Stop offset="0.74" stopColor="rgba(132,242,223,0)" />
          </RadialGradient>
          <RadialGradient id="locationEtaCanvasMid" cx="75%" cy="55%" r="58%">
            <Stop offset="0" stopColor="rgba(230,251,243,0.34)" />
            <Stop offset="0.48" stopColor="rgba(130,236,220,0.10)" />
            <Stop offset="0.80" stopColor="rgba(130,236,220,0)" />
          </RadialGradient>
          <RadialGradient id="locationEtaCanvasBottom" cx="18%" cy="105%" r="80%">
            <Stop offset="0" stopColor="rgba(81,216,203,0.18)" />
            <Stop offset="0.72" stopColor="rgba(81,216,203,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#locationEtaCanvasBase)" height="844" width="390" />
        <Rect fill="url(#locationEtaCanvasTopRight)" height="844" width="390" />
        <Rect fill="url(#locationEtaCanvasHeroRight)" height="844" width="390" />
        <Rect fill="url(#locationEtaCanvasLeftWash)" height="844" width="390" />
        <Rect fill="url(#locationEtaCanvasMid)" height="844" width="390" />
        <Rect fill="url(#locationEtaCanvasBottom)" height="844" width="390" />
      </Svg>
    </View>
  )
}

function FulfillmentCanvasAura({ screenId }: { screenId: CustomerV21ScreenId }) {
  const { reduceTransparency } = useV21Theme()
  const scope = screenId.replace(/[^a-zA-Z0-9]/g, '')

  if (reduceTransparency) {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#F3FBF8' }]} testID={`customer-v21-fulfillment-canvas-aura-${screenId}`} />
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID={`customer-v21-fulfillment-canvas-aura-${screenId}`}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 390 844" width="100%">
        <Defs>
          <LinearGradient id={`fulfillmentCanvasBase${scope}`} x1="0" x2="0.92" y1="0" y2="1">
            <Stop offset="0" stopColor="#FBFFFD" />
            <Stop offset="0.42" stopColor="#F2FBF8" />
            <Stop offset="1" stopColor="#E7F7F3" />
          </LinearGradient>
          <RadialGradient id={`fulfillmentCanvasTop${scope}`} cx="100%" cy="2%" r="82%">
            <Stop offset="0" stopColor="rgba(73,232,210,0.33)" />
            <Stop offset="0.54" stopColor="rgba(151,246,232,0.12)" />
            <Stop offset="0.80" stopColor="rgba(151,246,232,0)" />
          </RadialGradient>
          <RadialGradient id={`fulfillmentCanvasHero${scope}`} cx="86%" cy="26%" r="70%">
            <Stop offset="0" stopColor="rgba(83,220,206,0.27)" />
            <Stop offset="0.58" stopColor="rgba(154,246,232,0.10)" />
            <Stop offset="0.82" stopColor="rgba(154,246,232,0)" />
          </RadialGradient>
          <RadialGradient id={`fulfillmentCanvasLeft${scope}`} cx="-18%" cy="45%" r="76%">
            <Stop offset="0" stopColor="rgba(132,242,223,0.21)" />
            <Stop offset="0.76" stopColor="rgba(132,242,223,0)" />
          </RadialGradient>
          <RadialGradient id={`fulfillmentCanvasBottom${scope}`} cx="82%" cy="104%" r="78%">
            <Stop offset="0" stopColor="rgba(81,216,203,0.20)" />
            <Stop offset="0.74" stopColor="rgba(81,216,203,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill={`url(#fulfillmentCanvasBase${scope})`} height="844" width="390" />
        <Rect fill={`url(#fulfillmentCanvasTop${scope})`} height="844" width="390" />
        <Rect fill={`url(#fulfillmentCanvasHero${scope})`} height="844" width="390" />
        <Rect fill={`url(#fulfillmentCanvasLeft${scope})`} height="844" width="390" />
        <Rect fill={`url(#fulfillmentCanvasBottom${scope})`} height="844" width="390" />
      </Svg>
    </View>
  )
}

function ChatCanvasAura() {
  const { reduceTransparency } = useV21Theme()

  if (reduceTransparency) {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#F8FFFD' }]} testID="customer-v21-chat-canvas-aura" />
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="customer-v21-chat-canvas-aura">
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 390 844" width="100%">
        <Defs>
          <LinearGradient id="chatCanvasBase" x1="0" x2="0" y1="0" y2="1">
            <Stop offset="0" stopColor="#FAFFFD" />
            <Stop offset="0.50" stopColor="#F2FBF8" />
            <Stop offset="1" stopColor="#EAF8F5" />
          </LinearGradient>
          <RadialGradient id="chatCanvasTop" cx="95%" cy="2%" r="72%">
            <Stop offset="0" stopColor="rgba(78,232,210,0.29)" />
            <Stop offset="0.58" stopColor="rgba(151,246,232,0.10)" />
            <Stop offset="0.80" stopColor="rgba(151,246,232,0)" />
          </RadialGradient>
          <RadialGradient id="chatCanvasLeft" cx="-8%" cy="42%" r="70%">
            <Stop offset="0" stopColor="rgba(132,242,223,0.18)" />
            <Stop offset="0.76" stopColor="rgba(132,242,223,0)" />
          </RadialGradient>
          <RadialGradient id="chatCanvasBottom" cx="68%" cy="105%" r="62%">
            <Stop offset="0" stopColor="rgba(87,221,207,0.20)" />
            <Stop offset="0.74" stopColor="rgba(87,221,207,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#chatCanvasBase)" height="844" width="390" />
        <Rect fill="url(#chatCanvasTop)" height="844" width="390" />
        <Rect fill="url(#chatCanvasLeft)" height="844" width="390" />
        <Rect fill="url(#chatCanvasBottom)" height="844" width="390" />
      </Svg>
    </View>
  )
}

function V21Card({
  children,
  glass = false,
  style,
  testID,
}: {
  children: ReactNode
  glass?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
}) {
  const { mode, reduceMotion, reduceTransparency, tokens } = useV21Theme()
  const cardStyle = [
    styles.card,
    {
      backgroundColor: tokens.raised,
      borderColor: tokens.border,
      shadowColor: tokens.mode === 'dark' ? '#000000' : '#6BAA9D',
    },
    style,
  ]

  if (glass) {
    return (
      <GlassSurface
        backgroundColor={tokens.glass}
        borderColor={tokens.glassBorder}
        material="liquid"
        mode={mode}
        style={cardStyle}
        testID={testID}
        variant="hero"
      >
        {children}
      </GlassSurface>
    )
  }

  return <View style={cardStyle} testID={testID}>{children}</View>
}

function SourceCardSkin({ testID }: { testID?: string }) {
  const { reduceTransparency } = useV21Theme()

  if (reduceTransparency) {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF' }]} testID={testID} />
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID={testID}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 100 100" width="100%">
        <Defs>
          <LinearGradient id="sourceCardFill" x1="0" x2="1" y1="0" y2="1">
            <Stop offset="0" stopColor="rgba(255,255,255,0.83)" />
            <Stop offset="1" stopColor="rgba(250,255,253,0.65)" />
          </LinearGradient>
          <LinearGradient id="sourceCardEdge" x1="0" x2="1" y1="0" y2="0">
            <Stop offset="0" stopColor="rgba(255,255,255,0)" />
            <Stop offset="0.50" stopColor="rgba(255,255,255,0.98)" />
            <Stop offset="1" stopColor="rgba(255,255,255,0)" />
          </LinearGradient>
        </Defs>
        <Rect fill="url(#sourceCardFill)" height="100" width="100" />
        <Rect fill="url(#sourceCardEdge)" height="1.3" width="82" x="9" y="0" />
      </Svg>
    </View>
  )
}

function HomeHeroSourceAura() {
  const { reduceTransparency } = useV21Theme()

  if (reduceTransparency) {
    return null
  }

  return (
    <View pointerEvents="none" style={styles.homeHeroSourceAura} testID="customer-v21-home-mint-aura">
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 250 210" width="100%">
        <Defs>
          <RadialGradient id="homeHeroSourceAuraFill" cx="50%" cy="50%" r="74%">
            <Stop offset="0" stopColor="rgba(73,231,207,0.34)" />
            <Stop offset="0.48" stopColor="rgba(149,246,229,0.12)" />
            <Stop offset="0.74" stopColor="rgba(149,246,229,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#homeHeroSourceAuraFill)" height="210" width="250" />
      </Svg>
    </View>
  )
}

function SourceIconAura() {
  const { reduceTransparency } = useV21Theme()

  if (reduceTransparency) {
    return null
  }

  return (
    <View pointerEvents="none" style={styles.sourceIconAura}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 92 92" width="100%">
        <Defs>
          <RadialGradient id="sourceIconAuraFill" cx="50%" cy="50%" r="70%">
            <Stop offset="0" stopColor="rgba(75,228,205,0.34)" />
            <Stop offset="0.44" stopColor="rgba(122,243,223,0.16)" />
            <Stop offset="0.76" stopColor="rgba(75,228,205,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#sourceIconAuraFill)" height="92" width="92" />
      </Svg>
    </View>
  )
}

function SourceIconTileSkin() {
  const { reduceTransparency } = useV21Theme()

  if (reduceTransparency) {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#F7FFFB' }]} />
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 56 56" width="100%">
        <Defs>
          <LinearGradient id="sourceIconTileFill" x1="0" x2="1" y1="0" y2="1">
            <Stop offset="0" stopColor="rgba(255,255,255,0.86)" />
            <Stop offset="1" stopColor="rgba(231,251,246,0.57)" />
          </LinearGradient>
        </Defs>
        <Rect fill="url(#sourceIconTileFill)" height="56" width="56" />
      </Svg>
    </View>
  )
}

function HomeEmptySourceAura() {
  const { reduceTransparency } = useV21Theme()

  if (reduceTransparency) {
    return null
  }

  return (
    <View pointerEvents="none" style={styles.homeEmptySourceAura} testID="customer-v21-home-empty-mint-aura">
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 360 220" width="100%">
        <Defs>
          <RadialGradient id="homeEmptyAuraRight" cx="86%" cy="8%" r="64%">
            <Stop offset="0" stopColor="rgba(80,232,210,0.20)" />
            <Stop offset="0.62" stopColor="rgba(151,246,232,0.08)" />
            <Stop offset="0.84" stopColor="rgba(151,246,232,0)" />
          </RadialGradient>
          <RadialGradient id="homeEmptyAuraLeft" cx="8%" cy="92%" r="58%">
            <Stop offset="0" stopColor="rgba(81,216,203,0.15)" />
            <Stop offset="0.74" stopColor="rgba(81,216,203,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#homeEmptyAuraRight)" height="220" width="360" />
        <Rect fill="url(#homeEmptyAuraLeft)" height="220" width="360" />
      </Svg>
    </View>
  )
}

function BookingProblemChipAura() {
  const { reduceTransparency } = useV21Theme()

  if (reduceTransparency) {
    return null
  }

  return (
    <View pointerEvents="none" style={styles.bookingProblemChipAura} testID="customer-v21-booking-problem-mint-aura">
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 330 150" width="100%">
        <Defs>
          <RadialGradient id="bookingProblemAuraBottom" cx="82%" cy="92%" r="70%">
            <Stop offset="0" stopColor="rgba(80,232,210,0.18)" />
            <Stop offset="0.62" stopColor="rgba(151,246,232,0.07)" />
            <Stop offset="0.86" stopColor="rgba(151,246,232,0)" />
          </RadialGradient>
          <RadialGradient id="bookingProblemAuraLeft" cx="5%" cy="10%" r="54%">
            <Stop offset="0" stopColor="rgba(81,216,203,0.10)" />
            <Stop offset="0.74" stopColor="rgba(81,216,203,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#bookingProblemAuraBottom)" height="150" width="330" />
        <Rect fill="url(#bookingProblemAuraLeft)" height="150" width="330" />
      </Svg>
    </View>
  )
}

function BookingSuggestedChipAura() {
  const { reduceTransparency } = useV21Theme()

  if (reduceTransparency) {
    return null
  }

  return (
    <View pointerEvents="none" style={styles.bookingSuggestedChipAura} testID="customer-v21-booking-suggested-chip-aura">
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 160 48" width="100%">
        <Defs>
          <RadialGradient id="bookingSuggestedChipAuraFill" cx="52%" cy="48%" r="70%">
            <Stop offset="0" stopColor="rgba(80,232,210,0.28)" />
            <Stop offset="0.54" stopColor="rgba(151,246,232,0.12)" />
            <Stop offset="0.82" stopColor="rgba(151,246,232,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#bookingSuggestedChipAuraFill)" height="48" width="160" />
      </Svg>
    </View>
  )
}

function BookingDraftButtonAura() {
  const { reduceTransparency } = useV21Theme()

  if (reduceTransparency) {
    return null
  }

  return (
    <View pointerEvents="none" style={styles.bookingDraftButtonAura} testID="customer-v21-booking-submit-mint-aura">
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 340 58" width="100%">
        <Defs>
          <RadialGradient id="bookingDraftButtonAuraCenter" cx="52%" cy="52%" r="72%">
            <Stop offset="0" stopColor="rgba(80,232,210,0.22)" />
            <Stop offset="0.52" stopColor="rgba(151,246,232,0.10)" />
            <Stop offset="0.82" stopColor="rgba(151,246,232,0)" />
          </RadialGradient>
          <RadialGradient id="bookingDraftButtonAuraLeft" cx="10%" cy="96%" r="62%">
            <Stop offset="0" stopColor="rgba(81,216,203,0.13)" />
            <Stop offset="0.72" stopColor="rgba(81,216,203,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#bookingDraftButtonAuraCenter)" height="58" width="340" />
        <Rect fill="url(#bookingDraftButtonAuraLeft)" height="58" width="340" />
      </Svg>
    </View>
  )
}

function BookingSearchMintBorder() {
  const { reduceTransparency } = useV21Theme()

  if (reduceTransparency) {
    return null
  }

  return (
    <View pointerEvents="none" style={styles.bookingSearchMintBorder} testID="customer-v21-booking-search-mint-border" />
  )
}

function AssetTile({
  image,
  label,
  size = 52,
  sourceAura = false,
  style,
  testID,
}: {
  image: ImageSourcePropType
  label: string
  size?: number
  sourceAura?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
}) {
  const { tokens } = useV21Theme()
  if (sourceAura) {
    return (
      <View accessibilityLabel={label} style={[styles.sourceIconAuraFrame, style]} testID={testID}>
        <SourceIconAura />
        <View style={[styles.assetTile, styles.sourceIconTile, { backgroundColor: tokens.mode === 'dark' ? tokens.glassStrong : 'transparent', borderColor: 'rgba(255,255,255,0.95)' }]}>
          <SourceIconTileSkin />
          <Image resizeMode="contain" source={image} style={{ height: size, width: size }} />
        </View>
      </View>
    )
  }

  return (
    <View accessibilityLabel={label} style={[styles.assetTile, { backgroundColor: tokens.ghost, borderColor: tokens.border }, style]} testID={testID}>
      <Image resizeMode="contain" source={image} style={{ height: size, width: size }} />
    </View>
  )
}

function SectionHeader({ eyebrow, title }: { eyebrow?: string; title: string }) {
  const { tokens } = useV21Theme()
  return (
    <View style={styles.sectionHeader}>
      {eyebrow ? <Text style={[styles.eyebrow, { color: tokens.primary }]}>{eyebrow}</Text> : null}
      <Text style={[styles.sectionTitle, { color: tokens.text }]}>{title}</Text>
    </View>
  )
}

function SectionActionHeader({
  action,
  onAction,
  title,
  titleTestID,
}: {
  action?: string
  onAction?: () => void
  title: string
  titleTestID?: string
}) {
  const { tokens } = useV21Theme()
  return (
    <View style={[styles.sectionActionHeader, action ? styles.sectionActionHeaderWithAction : null]}>
      <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={[styles.sectionTitle, styles.sectionActionTitle, { color: tokens.text }]} testID={titleTestID}>{title}</Text>
      {action && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={styles.sectionActionButton}>
          <Text adjustsFontSizeToFit minimumFontScale={0.82} numberOfLines={1} style={[styles.sectionActionText, { color: tokens.primary }]}>{action}</Text>
        </Pressable>
      ) : action ? (
        <View style={styles.sectionActionButton}>
          <Text adjustsFontSizeToFit minimumFontScale={0.82} numberOfLines={1} style={[styles.sectionActionText, { color: tokens.primary }]}>{action}</Text>
        </View>
      ) : null}
    </View>
  )
}

function V21TopBar({
  actionAccessibilityLabel,
  actionLabel,
  actionTestID,
  avatarImage,
  avatarText,
  leading,
  onAction,
  onBack,
  showAvatar = true,
  subtitle,
  title,
  titleContainerStyle,
  titleStyle,
}: {
  actionAccessibilityLabel?: string
  actionLabel?: string
  actionTestID?: string
  avatarImage?: ImageSourcePropType
  avatarText?: string
  leading?: ReactNode
  onAction?: () => void
  onBack?: () => void
  showAvatar?: boolean
  subtitle: string
  title: string
  titleContainerStyle?: StyleProp<ViewStyle>
  titleStyle?: StyleProp<TextStyle>
}) {
  const { tokens } = useV21Theme()
  const shouldShowAvatar = showAvatar && !onBack
  return (
    <View style={styles.topBar}>
      {leading ? (
        leading
      ) : onBack ? (
        <Pressable accessibilityLabel="Back" accessibilityRole="button" onPress={onBack} style={[styles.topControl, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
          <TopBackChevron color={tokens.primary} />
        </Pressable>
      ) : shouldShowAvatar ? (
        <View style={styles.topAvatarWrap} testID="customer-v21-top-avatar">
          {avatarImage ? (
            <Image resizeMode="contain" source={avatarImage} style={styles.topAvatarImage} />
          ) : (
            <Text style={styles.topAvatarText}>{avatarText ?? 'NS'}</Text>
          )}
          <View style={styles.topAvatarDot} />
        </View>
      ) : null}
      <View style={[styles.flex, styles.topCopy, titleContainerStyle]}>
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.68}
          numberOfLines={1}
          style={[styles.topTitle, { color: tokens.text }, titleStyle]}
          testID="customer-v21-top-title"
        >
          {title}
        </Text>
        {subtitle ? <Text numberOfLines={2} style={[styles.topSubtitle, { color: tokens.muted }]} testID="customer-v21-top-subtitle">{subtitle}</Text> : null}
      </View>
      {actionLabel ? (
        <Pressable accessibilityLabel={actionAccessibilityLabel ?? actionLabel} accessibilityRole="button" onPress={onAction} style={[styles.topControl, { backgroundColor: tokens.raised, borderColor: tokens.border }]} testID={actionTestID}>
          <Text style={[styles.topActionText, { color: tokens.primary }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

function TopBackChevron({ color }: { color: string }) {
  return (
    <Svg height={18} style={styles.topControlIcon} viewBox="0 0 24 24" width={18}>
      <Path d="M15 5L8 12L15 19" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.8} />
    </Svg>
  )
}

function EyebrowPill({
  animated = false,
  label,
  preserveCase = false,
  style,
  testID,
}: {
  animated?: boolean
  label: string
  preserveCase?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
}) {
  const { tokens } = useV21Theme()
  const content = (
    <View style={[styles.eyebrowPill, style, { backgroundColor: tokens.service, borderColor: tokens.border }]} testID={testID}>
      <View style={[styles.eyebrowDot, { backgroundColor: tokens.primary }]} />
      <Text style={[styles.eyebrowPillText, preserveCase ? styles.eyebrowPillTextPreserve : null, { color: tokens.primary }]}>{label}</Text>
    </View>
  )

  if (!animated) return content

  return (
    <ReduceMotionAwareEntranceView distanceY={4} style={styles.eyebrowMotionWrap}>
      {content}
    </ReduceMotionAwareEntranceView>
  )
}

function ProgressRail({
  activeStep = 1,
  style,
  testID,
  total = 4,
}: {
  activeStep?: number
  style?: StyleProp<ViewStyle>
  testID?: string
  total?: number
}) {
  const { tokens } = useV21Theme()
  return (
    <View style={[styles.progressRail, style]} accessibilityLabel={`Step ${activeStep} of ${total}`} testID={testID}>
      {Array.from({ length: total }).map((_, index) => {
        const step = index + 1
        const done = step < activeStep
        const active = step === activeStep
        return (
          <Fragment key={step}>
            {index > 0 ? (
              <View
                style={[styles.progressLine, { backgroundColor: step <= activeStep ? tokens.primary : tokens.border }]}
                testID={testID ? `${testID}-line-${index}` : undefined}
              />
            ) : null}
            <View
              style={[
                styles.progressNode,
                active ? styles.progressNodeActive : null,
                {
                  backgroundColor: done || active ? tokens.primary : tokens.ghost,
                  borderColor: done || active ? tokens.primary : tokens.border,
                },
              ]}
              testID={testID ? `${testID}-node-${step}` : undefined}
            >
              <Text style={[styles.progressNodeText, { color: done || active ? tokens.primaryText : tokens.muted }]}>{step}</Text>
            </View>
          </Fragment>
        )
      })}
    </View>
  )
}

function CaseProgressLabels({
  activeStep = 1,
  testIDs = false,
}: {
  activeStep?: number
  testIDs?: boolean
}) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const labels = [
    language === 'vi' ? 'Thu thập' : 'Collect',
    language === 'vi' ? 'Phân tích' : 'Analyze',
    language === 'vi' ? 'Đề xuất' : 'Suggest',
    language === 'vi' ? 'Duyệt' : 'Review',
  ]

  return (
    <View style={styles.caseProgressLabelRail}>
      {labels.map((label, index) => {
        const step = index + 1
        const edgeStyle = index === 0
          ? styles.caseProgressLabelStart
          : index === labels.length - 1
            ? styles.caseProgressLabelEnd
            : styles.caseProgressLabelCenter
        const slotStyle = index === 0
          ? styles.caseProgressLabelSlotStart
          : index === labels.length - 1
            ? styles.caseProgressLabelSlotEnd
            : styles.caseProgressLabelSlotCenter

        return (
          <Fragment key={label}>
            {index > 0 ? <View style={styles.caseProgressLabelSpacer} /> : null}
            <View
              style={[styles.caseProgressLabelSlot, slotStyle]}
              testID={testIDs ? `customer-v21-case-progress-label-slot-${step}` : undefined}
            >
              <Text
                style={[styles.caseProgressLabel, edgeStyle, { color: step === activeStep ? tokens.primary : tokens.muted }]}
                testID={testIDs ? `customer-v21-case-progress-label-${step}` : undefined}
              >
                {label}
              </Text>
            </View>
          </Fragment>
        )
      })}
    </View>
  )
}

function InfoNotice({
  body,
  image,
  title,
}: {
  body: string
  image: ImageSourcePropType
  title: string
}) {
  const { tokens } = useV21Theme()
  return (
    <View style={[styles.infoNotice, { backgroundColor: tokens.service, borderColor: tokens.border }]}>
      <AssetTile image={image} label={title} size={38} style={styles.infoNoticeIcon} />
      <View style={styles.flex}>
        <Text style={[styles.infoNoticeTitle, { color: tokens.text }]}>{title}</Text>
        <Text style={[styles.infoNoticeBody, { color: tokens.muted }]}>{body}</Text>
      </View>
    </View>
  )
}

function ChatModeSwitchAura() {
  const { reduceTransparency } = useV21Theme()

  if (reduceTransparency) return null

  return (
    <View pointerEvents="none" style={styles.chatModeSwitchAura} testID="customer-v21-chat-mode-mint-aura">
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 360 58" width="100%">
        <Defs>
          <RadialGradient id="chatModeSwitchAuraFill" cx="50%" cy="50%" r="76%">
            <Stop offset="0" stopColor="rgba(75,228,205,0.22)" />
            <Stop offset="0.52" stopColor="rgba(151,246,232,0.10)" />
            <Stop offset="0.82" stopColor="rgba(151,246,232,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#chatModeSwitchAuraFill)" height="58" width="360" />
      </Svg>
    </View>
  )
}

function ChatComposerAura() {
  const { reduceTransparency } = useV21Theme()

  if (reduceTransparency) return null

  return (
    <View pointerEvents="none" style={styles.chatComposerAura} testID="customer-v21-chat-composer-mint-aura">
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 360 70" width="100%">
        <Defs>
          <RadialGradient id="chatComposerAuraFill" cx="82%" cy="42%" r="66%">
            <Stop offset="0" stopColor="rgba(71,226,203,0.18)" />
            <Stop offset="0.58" stopColor="rgba(151,246,232,0.07)" />
            <Stop offset="0.82" stopColor="rgba(151,246,232,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#chatComposerAuraFill)" height="70" width="360" />
      </Svg>
    </View>
  )
}

function ChatMediaCameraIcon({ color }: { color: string }) {
  return (
    <Svg
      fill="none"
      height={20}
      style={styles.chatMediaCameraIcon}
      testID="customer-v21-kael-media-camera-icon"
      viewBox="0 0 24 24"
      width={20}
    >
      <Rect height={15.5} rx={5.2} stroke={color} strokeWidth={2} width={17.5} x={3.25} y={5.25} />
      <Circle cx={12} cy={13} r={3.8} stroke={color} strokeWidth={2} />
      <Circle cx={17.35} cy={9.4} fill={color} r={1.35} />
    </Svg>
  )
}

function CaseChatSummary({ deal }: { deal: LocalDeal }) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const service = deal.draft.serviceType ? customerV21ServiceCopy[language][deal.draft.serviceType].label : copy.dataPending
  const problem = agenticDealProblemLabel(deal, language)
  const address = deal.draft.addressLabel || deal.draft.districtLabel || copy.dataPending
  return (
    <V21Card style={styles.caseChatSummaryCard} testID="customer-v21-case-overview">
      <SourceCardSkin />
      <CaseWorkCardAura scope="Summary" />
      <View style={styles.caseChatSummaryHeader}>
        <KaelChip label={caseDisplayCode(deal, language)} variant="selected" />
        <StatusPill status={deal.status} />
      </View>
      <View style={styles.caseChatSummaryBody}>
        <AssetTile image={customerV21Assets.request} label={service} size={48} style={styles.caseChatSummaryIcon} />
        <View style={styles.flex}>
          <Text numberOfLines={1} style={[styles.caseChatSummaryTitle, { color: tokens.text }]}>{service}</Text>
          <Text numberOfLines={1} style={[styles.caseChatSummaryText, { color: tokens.muted }]}>{problem}</Text>
          <Text numberOfLines={1} style={[styles.caseChatSummaryText, { color: tokens.muted }]}>{address}</Text>
        </View>
      </View>
    </V21Card>
  )
}

function CaseWorkCardAura({ scope, testID }: { scope: string; testID?: string }) {
  const { reduceTransparency } = useV21Theme()

  if (reduceTransparency) return null

  const topId = `caseWorkAuraTop${scope}`
  const bottomId = `caseWorkAuraBottom${scope}`
  return (
    <View pointerEvents="none" style={styles.caseWorkCardAura} testID={testID}>
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

function ZipMintAura({ scope, testID }: { scope: string; testID?: string }) {
  const { reduceTransparency } = useV21Theme()
  if (reduceTransparency) return null

  const fillId = `zipMintAura${scope}`
  return (
    <View pointerEvents="none" style={styles.zipMintAura} testID={testID}>
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

function CaseWideMintAura({
  intensity = 'default',
  scope,
  testID,
}: {
  intensity?: 'default' | 'strong'
  scope: string
  testID?: string
}) {
  const { reduceTransparency } = useV21Theme()
  if (reduceTransparency) return null

  const topId = `caseWideMintAuraTop${scope}`
  const leftId = `caseWideMintAuraLeft${scope}`
  const bottomId = `caseWideMintAuraBottom${scope}`
  const strong = intensity === 'strong'
  return (
    <View pointerEvents="none" style={styles.caseWideMintAura} testID={testID}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 360 130" width="100%">
        <Defs>
          <RadialGradient id={topId} cx="88%" cy="2%" r="68%">
            <Stop offset="0" stopColor={strong ? 'rgba(143,226,212,0.57)' : 'rgba(143,226,212,0.38)'} />
            <Stop offset="0.45" stopColor={strong ? 'rgba(230,251,243,0.26)' : 'rgba(230,251,243,0.17)'} />
            <Stop offset="0.76" stopColor="rgba(230,251,243,0)" />
          </RadialGradient>
          <RadialGradient id={leftId} cx="5%" cy="96%" r="58%">
            <Stop offset="0" stopColor={strong ? 'rgba(83,220,206,0.30)' : 'rgba(83,220,206,0.20)'} />
            <Stop offset="0.58" stopColor={strong ? 'rgba(230,251,243,0.17)' : 'rgba(230,251,243,0.11)'} />
            <Stop offset="0.84" stopColor="rgba(230,251,243,0)" />
          </RadialGradient>
          <RadialGradient id={bottomId} cx="58%" cy="108%" r="58%">
            <Stop offset="0" stopColor={strong ? 'rgba(151,246,232,0.24)' : 'rgba(151,246,232,0.16)'} />
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

function ProfileCompactMintAura({ scope, testID }: { scope: string; testID?: string }) {
  const { reduceTransparency } = useV21Theme()
  if (reduceTransparency) return null

  const topId = `profileCompactMintAuraTop${scope}`
  const edgeId = `profileCompactMintAuraEdge${scope}`
  return (
    <View pointerEvents="none" style={styles.profileCompactMintAura} testID={testID}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 180 92" width="100%">
        <Defs>
          <RadialGradient id={topId} cx="92%" cy="4%" r="76%">
            <Stop offset="0" stopColor="rgba(82,235,213,0.30)" />
            <Stop offset="0.42" stopColor="rgba(154,246,232,0.14)" />
            <Stop offset="0.78" stopColor="rgba(154,246,232,0)" />
          </RadialGradient>
          <RadialGradient id={edgeId} cx="7%" cy="94%" r="66%">
            <Stop offset="0" stopColor="rgba(13,174,154,0.16)" />
            <Stop offset="0.58" stopColor="rgba(230,251,243,0.10)" />
            <Stop offset="0.9" stopColor="rgba(230,251,243,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill={`url(#${topId})`} height="92" width="180" />
        <Rect fill={`url(#${edgeId})`} height="92" width="180" />
      </Svg>
    </View>
  )
}

function CaseWorkSourceChip({ label, scope, testID }: { label: string; scope: string; testID?: string }) {
  const { tokens } = useV21Theme()
  return (
    <View style={[styles.caseWorkSourceChip, { backgroundColor: tokens.service, borderColor: 'rgba(13,174,154,0.30)' }]} testID={testID}>
      <CaseWorkSourceChipAura scope={scope} />
      <Text numberOfLines={1} style={[styles.caseWorkSourceChipText, { color: tokens.primary }]}>{label}</Text>
    </View>
  )
}

function CaseWorkSourceChipAura({ scope }: { scope: string }) {
  const { reduceTransparency } = useV21Theme()

  if (reduceTransparency) return null

  const fillId = `caseWorkSourceChipAura${scope}`
  return (
    <View pointerEvents="none" style={styles.caseWorkSourceChipAura} testID={`customer-v21-case-work-source-chip-aura-${scope}`}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 104 40" width="100%">
        <Defs>
          <RadialGradient id={fillId} cx="54%" cy="48%" r="72%">
            <Stop offset="0" stopColor="rgba(82,235,213,0.24)" />
            <Stop offset="0.62" stopColor="rgba(154,246,232,0.10)" />
            <Stop offset="0.9" stopColor="rgba(154,246,232,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill={`url(#${fillId})`} height="40" width="104" />
      </Svg>
    </View>
  )
}

function CaseWorkActionButtonAura({ scope }: { scope: string }) {
  const { reduceTransparency } = useV21Theme()

  if (reduceTransparency) return null

  const fillId = `caseWorkActionAura${scope}`
  return (
    <View pointerEvents="none" style={styles.caseWorkActionButtonAura} testID={`customer-v21-case-work-action-aura-${scope}`}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 180 48" width="100%">
        <Defs>
          <RadialGradient id={fillId} cx="52%" cy="44%" r="76%">
            <Stop offset="0" stopColor="rgba(82,235,213,0.20)" />
            <Stop offset="0.58" stopColor="rgba(154,246,232,0.08)" />
            <Stop offset="0.88" stopColor="rgba(154,246,232,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill={`url(#${fillId})`} height="48" width="180" />
      </Svg>
    </View>
  )
}

function CaseWorkDataSourceFooter({ code, testID }: { code?: string | null; testID?: string }) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const label = code
    ? (language === 'vi' ? `🔒 Nguồn dữ liệu độc lập theo công việc ${code}` : `🔒 Independent data source for job ${code}`)
    : (language === 'vi' ? '🔒 Nguồn dữ liệu độc lập theo công việc thật' : '🔒 Independent data source for a real job')

  return (
    <Text numberOfLines={1} style={[styles.caseWorkDataSourceText, { color: tokens.muted }]} testID={testID}>
      {label}
    </Text>
  )
}

function QuickMetric({ label, testID, value }: { label: string; testID?: string; value: string }) {
  const { tokens } = useV21Theme()
  const compactValue = value.length > 8
  return (
    <View style={[styles.quickMetric, { backgroundColor: tokens.raised, borderColor: tokens.border }]} testID={testID}>
      <SourceCardSkin />
      <ZipMintAura scope={`ProfileMetric${profileAuraScope(label)}`} />
      <View style={styles.profileStatContent}>
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          numberOfLines={2}
          style={[styles.quickMetricValue, compactValue ? styles.quickMetricValueCompact : null, { color: tokens.text }]}
        >
          {value}
        </Text>
        <Text numberOfLines={2} style={[styles.quickMetricLabel, { color: tokens.muted }]}>{label}</Text>
      </View>
    </View>
  )
}

function EmptyState({
  action,
  body,
  image = customerV21Assets.request,
  mintAura = false,
  testID,
  title,
}: {
  action?: ReactNode
  body: string
  image?: ImageSourcePropType
  mintAura?: boolean
  testID?: string
  title: string
}) {
  const { tokens } = useV21Theme()

  if (mintAura) {
    return (
      <V21Card
        style={[
          styles.emptyState,
          styles.homeEmptyState,
          {
            backgroundColor: tokens.mode === 'dark' ? tokens.raised : 'transparent',
            borderColor: tokens.mode === 'dark' ? tokens.border : 'rgba(255,255,255,0.91)',
            shadowColor: tokens.mode === 'dark' ? '#000000' : '#05695E',
          },
        ]}
        testID={testID}
      >
        <SourceCardSkin testID="customer-v21-home-empty-card-skin" />
        <HomeEmptySourceAura />
        <View style={styles.emptyStateContent}>
          <AssetTile image={image} label={title} size={54} sourceAura />
          <Text style={[styles.emptyTitle, { color: tokens.text }]}>{title}</Text>
          <Text style={[styles.bodyText, styles.centerText, { color: tokens.muted }]}>{body}</Text>
          {action}
        </View>
      </V21Card>
    )
  }

  return (
    <V21Card style={styles.emptyState} testID={testID}>
      <AssetTile image={image} label={title} size={64} />
      <Text style={[styles.emptyTitle, { color: tokens.text }]}>{title}</Text>
      <Text style={[styles.bodyText, styles.centerText, { color: tokens.muted }]}>{body}</Text>
      {action}
    </V21Card>
  )
}

function InactiveAgenticGate({ testID }: { testID: string }) {
  return <View collapsable={false} style={styles.inactiveAgenticGate} testID={testID} />
}

function ServiceTile({
  homeAura = false,
  onPress,
  selected,
  service,
}: {
  homeAura?: boolean
  onPress: () => void
  selected?: boolean
  service: ServiceType
}) {
  const language = useAppLanguage()
  const { reduceMotion, tokens } = useV21Theme()
  const copy = customerV21ServiceCopy[language][service]

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.serviceTile,
        homeAura ? styles.homeAuraServiceTile : null,
        {
          backgroundColor: homeAura ? 'transparent' : selected ? tokens.service : tokens.raised,
          borderColor: selected ? (homeAura ? 'rgba(64,215,193,0.46)' : tokens.primary) : homeAura ? 'rgba(255,255,255,0.91)' : tokens.border,
          shadowColor: tokens.mode === 'dark' ? '#000000' : homeAura ? '#088779' : tokens.primary,
          shadowOpacity: homeAura ? (tokens.mode === 'dark' ? 0.16 : 0.13) : 0,
          transform: [{ scale: pressed && !reduceMotion ? 0.985 : 1 }],
        },
      ]}
      testID={`customer-v21-service-${service}`}
    >
      {homeAura ? <SourceCardSkin /> : null}
      <AssetTile image={customerV21ServiceAssets[service]} label={copy.label} size={homeAura ? 46 : 58} sourceAura={homeAura} style={styles.serviceIcon} />
      <Text numberOfLines={2} style={[styles.serviceTitle, homeAura ? styles.homeServiceTitle : null, { color: tokens.text }]}>{copy.label}</Text>
      <Text numberOfLines={2} style={[styles.serviceNote, homeAura ? styles.homeServiceNote : null, { color: tokens.muted }]}>{copy.note}</Text>
    </Pressable>
  )
}

function Metric({
  auraScope,
  label,
  testID,
  value,
}: {
  auraScope?: string
  label: string
  testID?: string
  value: string
}) {
  const { tokens } = useV21Theme()
  return (
    <View style={[styles.metric, { backgroundColor: tokens.ghost, borderColor: tokens.border }, auraScope ? styles.metricAura : null]} testID={testID}>
      {auraScope ? (
        <>
          <SourceCardSkin testID={`${testID ?? auraScope}-skin`} />
          <ZipMintAura scope={auraScope} testID={`${testID ?? auraScope}-mint-aura`} />
        </>
      ) : null}
      <View style={styles.metricContent}>
        <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={2} style={[styles.metricValue, { color: tokens.text }]}>{value}</Text>
        <Text numberOfLines={2} style={[styles.metricLabel, { color: tokens.muted }]}>{label}</Text>
      </View>
    </View>
  )
}

function ProfileAuraCard({
  cardStyle,
  children,
  contentStyle,
  scope,
  testID,
}: {
  cardStyle?: StyleProp<ViewStyle>
  children: ReactNode
  contentStyle?: StyleProp<ViewStyle>
  scope: string
  testID?: string
}) {
  const { tokens } = useV21Theme()
  return (
    <V21Card
      style={[
        styles.profileAuraCard,
        {
          backgroundColor: tokens.mode === 'dark' ? tokens.raised : 'rgba(255,255,255,0.72)',
          borderColor: tokens.mode === 'dark' ? tokens.border : 'rgba(255,255,255,0.92)',
          shadowColor: tokens.mode === 'dark' ? '#000000' : '#088779',
        },
        cardStyle,
      ]}
      testID={testID}
    >
      <SourceCardSkin testID={`customer-v21-profile-${scope.toLowerCase()}-card-skin`} />
      <CaseWideMintAura scope={`Profile${scope}Wide`} testID={`customer-v21-profile-${scope.toLowerCase()}-wide-mint-aura`} />
      <ZipMintAura scope={`Profile${scope}Fine`} testID={`customer-v21-profile-${scope.toLowerCase()}-mint-aura`} />
      <View style={[styles.profileAuraContent, contentStyle]}>
        {children}
      </View>
    </V21Card>
  )
}

function ProfileProgressBar({ percent, testID }: { percent: number; testID?: string }) {
  const { reduceMotion, reduceTransparency, tokens } = useV21Theme()
  const clamped = Math.max(0, Math.min(100, percent))
  const fillWidth = useSharedValue(reduceMotion ? clamped : 0)
  const sheenX = useSharedValue(-72)
  const sheenOpacity = useSharedValue(0)

  useEffect(() => {
    cancelAnimation(fillWidth)
    cancelAnimation(sheenX)
    cancelAnimation(sheenOpacity)

    if (reduceMotion) {
      fillWidth.value = clamped
      sheenX.value = -72
      sheenOpacity.value = 0
      return
    }

    fillWidth.value = 0
    fillWidth.value = withTiming(clamped, { duration: motionDuration(620, reduceMotion) })
    sheenX.value = -72
    sheenOpacity.value = withTiming(clamped > 0 ? 0.8 : 0, { duration: motionDuration(120, reduceMotion) })
    sheenX.value = withTiming(260, { duration: motionDuration(820, reduceMotion) })
    sheenOpacity.value = withDelay(680, withTiming(0, { duration: motionDuration(160, reduceMotion) }))

    return () => {
      cancelAnimation(fillWidth)
      cancelAnimation(sheenX)
      cancelAnimation(sheenOpacity)
    }
  }, [clamped, fillWidth, reduceMotion, sheenOpacity, sheenX])

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fillWidth.value}%`,
  }))

  const sheenStyle = useAnimatedStyle(() => ({
    opacity: sheenOpacity.value,
    transform: [{ translateX: sheenX.value }],
  }))

  return (
    <View style={[styles.protectionBar, { backgroundColor: tokens.border }]} testID={testID}>
      <Animated.View style={[styles.protectionBarFill, styles.profileProgressFill, fillStyle]} testID={testID ? `${testID}-fill` : undefined}>
        {!reduceTransparency ? (
          <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 260 8" width="100%">
            <Defs>
              <LinearGradient id="profileProgressFillGradient" x1="0" x2="1" y1="0" y2="0">
                <Stop offset="0" stopColor="#7BE7D6" />
                <Stop offset="0.55" stopColor="#24B3A1" />
                <Stop offset="1" stopColor="#088779" />
              </LinearGradient>
            </Defs>
            <Rect fill="url(#profileProgressFillGradient)" height="8" rx="4" width="260" />
          </Svg>
        ) : null}
      </Animated.View>
      {!reduceMotion && !reduceTransparency ? (
        <Animated.View pointerEvents="none" style={[styles.profileProgressSheen, sheenStyle]} testID={testID ? `${testID}-sheen` : undefined} />
      ) : null}
    </View>
  )
}

function ProfileLiquidScore({
  label,
  percent,
  scope,
  secondaryLabel,
  size = 'regular',
  value,
}: {
  label: string
  percent: number
  scope: string
  secondaryLabel?: string
  size?: 'regular' | 'large'
  value: string
}) {
  const { reduceTransparency, tokens } = useV21Theme()
  const progressId = `profileLiquidScoreProgress${scope}`
  const ringRadius = 43
  const circumference = 2 * Math.PI * ringRadius
  const clampedPercent = Math.max(0, Math.min(100, percent))
  const progressLength = (circumference * clampedPercent) / 100
  const frameSize = size === 'large' ? 154 : 112
  const svgSize = size === 'large' ? 132 : 102
  const lensInset = size === 'large' ? 24 : 17
  return (
    <View style={[styles.profileLiquidScore, size === 'large' ? styles.profileLiquidScoreLarge : null, { height: frameSize, width: frameSize }]} testID={`customer-v21-profile-score-${scope}`}>
      {!reduceTransparency ? <CaseOverviewScoreAura scope={`Profile${scope}`} /> : null}
      <Svg height={svgSize} style={styles.caseOverviewScoreSvg} viewBox="0 0 100 100" width={svgSize}>
        <Defs>
          <LinearGradient id={progressId} x1="10" x2="88" y1="86" y2="10">
            <Stop offset="0" stopColor="#088779" />
            <Stop offset="0.48" stopColor="#24B3A1" />
            <Stop offset="1" stopColor="#86EAD9" />
          </LinearGradient>
        </Defs>
        <Circle cx="50" cy="50" fill="none" r={ringRadius} stroke="rgba(204,226,222,0.62)" strokeWidth={8} />
        <Circle
          cx="50"
          cy="50"
          fill="none"
          r={ringRadius}
          stroke={`url(#${progressId})`}
          strokeDasharray={`${progressLength} ${circumference}`}
          strokeLinecap="round"
          strokeWidth={8}
        />
      </Svg>
      <View
        pointerEvents="none"
        style={[
          styles.profileScoreLens,
          {
            backgroundColor: tokens.mode === 'dark' ? tokens.glassStrong : 'rgba(246,255,252,0.82)',
            borderColor: tokens.mode === 'dark' ? 'rgba(117,236,220,0.30)' : 'rgba(255,255,255,0.95)',
            bottom: lensInset,
            left: lensInset,
            right: lensInset,
            top: lensInset,
          },
        ]}
      >
        {!reduceTransparency ? <View style={styles.caseOverviewScoreHighlight} /> : null}
      </View>
      <View style={styles.caseOverviewScoreInside}>
        <Text
          adjustsFontSizeToFit
          numberOfLines={1}
          style={[
            styles.profileScoreValue,
            size === 'large' ? styles.profileScoreValueLarge : null,
            { color: tokens.primary },
          ]}
        >
          {value}
        </Text>
        <View style={[styles.profileScoreMeta, size === 'large' ? styles.profileScoreMetaLarge : null]}>
          <Text
            adjustsFontSizeToFit
            minimumFontScale={secondaryLabel ? 0.62 : 0.72}
            numberOfLines={secondaryLabel ? 1 : size === 'large' ? 2 : 1}
            style={[styles.profileScoreLabel, size === 'large' ? styles.profileScoreLabelLarge : null, { color: tokens.muted }]}
          >
            {label}
          </Text>
          {secondaryLabel ? (
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.62}
              numberOfLines={1}
              style={[styles.profileScoreSubLabel, size === 'large' ? styles.profileScoreSubLabelLarge : null, { color: tokens.muted }]}
            >
              {secondaryLabel}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  )
}

function ProfileStatCard({ label, testID, value }: { label: string; testID?: string; value: string }) {
  const { tokens } = useV21Theme()
  const compactValue = value.length > 8
  return (
    <View style={[styles.profileStatCard, { backgroundColor: tokens.mode === 'dark' ? tokens.raised : 'rgba(255,255,255,0.80)', borderColor: tokens.mode === 'dark' ? tokens.border : 'rgba(113,225,209,0.38)' }]} testID={testID}>
      <SourceCardSkin />
      <ProfileCompactMintAura scope={`ProfileStatFine${profileAuraScope(label)}`} />
      <ZipMintAura scope={`ProfileStat${profileAuraScope(label)}`} />
      <View style={styles.profileStatContent}>
        <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={[styles.profileStatValue, compactValue ? styles.profileStatValueCompact : null, { color: tokens.text }]}>{value}</Text>
        <Text numberOfLines={2} style={[styles.profileStatLabel, { color: tokens.muted }]}>{label}</Text>
      </View>
    </View>
  )
}

function ProfileRankProcess({ label, percent, value }: { label: string; percent: number; value: string }) {
  const { tokens } = useV21Theme()
  return (
    <View
      style={[
        styles.profileRankProcess,
        {
          backgroundColor: tokens.mode === 'dark' ? tokens.raised : 'rgba(255,255,255,0.81)',
          borderColor: tokens.mode === 'dark' ? tokens.border : 'rgba(113,225,209,0.44)',
        },
      ]}
      testID="customer-v21-profile-rank-process"
    >
      <SourceCardSkin />
      <CaseWideMintAura scope="ProfileRankProcess" />
      <ProfileCompactMintAura scope="ProfileRankProcessFine" />
      <ZipMintAura scope="ProfileRankProcessZip" />
      <View style={styles.profileRankProcessContent}>
        <View style={styles.rowBetween}>
          <Text numberOfLines={1} style={[styles.profileRankProcessLabel, { color: tokens.text }]}>{label}</Text>
          <Text numberOfLines={1} style={[styles.profileRankProcessValue, { color: tokens.primary }]}>{value}</Text>
        </View>
        <ProfileProgressBar percent={percent} testID="customer-v21-profile-rank-process-progress" />
      </View>
    </View>
  )
}

function ProfileRankingEvaluation({
  completed,
  protectedTransactions,
  reviewRate,
}: {
  completed: string
  protectedTransactions: string
  reviewRate: string
}) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const sourceLine = language === 'vi'
    ? 'Công việc, đánh giá, thanh toán.'
    : 'Jobs, reviews, payments.'
  const rows = [
    { label: language === 'vi' ? 'Hoàn tất' : 'Completed', value: completed },
    { label: language === 'vi' ? 'Đánh giá' : 'Reviews', value: reviewRate },
    { label: language === 'vi' ? 'Bảo vệ' : 'Protected', value: protectedTransactions },
  ]

  return (
    <ProfileAuraCard
      cardStyle={styles.profileRankingEvaluationCard}
      contentStyle={styles.profileRankingEvaluationContent}
      scope="RankingEvaluation"
      testID="customer-v21-profile-ranking-evaluation"
    >
      <AssetTile image={customerV21Assets.kaelHead} label="Kael" size={42} sourceAura style={styles.infoNoticeIcon} />
      <View style={styles.flex}>
        <Text numberOfLines={1} style={[styles.cardTitle, { color: tokens.text }]}>
          {language === 'vi' ? 'Kael đánh giá dữ liệu thật' : 'Kael reads real data'}
        </Text>
        <Text numberOfLines={1} style={[styles.bodyText, { color: tokens.muted }]}>{sourceLine}</Text>
        <View style={styles.profileRankingEvaluationChips}>
          {rows.map((row) => (
            <View key={row.label} style={styles.profileRankingEvidenceChip}>
              <ZipMintAura scope={`ProfileRankingEvidence${profileAuraScope(row.label)}`} />
              <Text numberOfLines={1} style={[styles.profileRankingEvidenceLabel, { color: tokens.muted }]}>{row.label}</Text>
              <Text adjustsFontSizeToFit minimumFontScale={0.78} numberOfLines={1} style={[styles.profileRankingEvidenceValue, { color: tokens.primary }]}>{row.value}</Text>
            </View>
          ))}
        </View>
      </View>
    </ProfileAuraCard>
  )
}

function ProfileInsightRow({
  image,
  label,
  status,
  testID,
  value,
}: {
  image: ImageSourcePropType
  label: string
  status: string
  testID?: string
  value: string
}) {
  const { tokens } = useV21Theme()
  const emptyStatus = status === customerV21CommonCopy.vi.dataPending
    || status === customerV21CommonCopy.en.dataPending
    || status === '0'
    || /^0\s*\/\s*0$/.test(status)
  return (
    <View style={styles.profileInsightRow} testID={testID}>
      <AssetTile image={image} label={label} size={54} sourceAura style={styles.profileInsightIcon} />
      <View style={styles.flex}>
        <Text numberOfLines={1} style={[styles.profileInsightTitle, { color: tokens.text }]}>{label}</Text>
        <Text numberOfLines={2} style={[styles.bodyText, { color: tokens.muted }]}>{value}</Text>
      </View>
      <View style={styles.profileInsightChipFrame} testID={testID ? `${testID}-chip` : undefined}>
        <ZipMintAura scope={`ProfileInsight${profileAuraScope(label)}`} />
        <KaelChip
          label={status}
          style={emptyStatus ? styles.profileInsightEmptyChip : styles.profileInsightChip}
          textStyle={emptyStatus ? styles.profileInsightEmptyChipText : styles.profileMintChipText}
          variant={emptyStatus ? 'unselected' : 'selected'}
        />
      </View>
    </View>
  )
}

export function CustomerHomeSurface() {
  const language = useAppLanguage()
  const router = useRouter()
  const workflow = useFrontendWorkflow()
  const { session } = useAuth()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const deal = workflow.state.deal
  const isDraftDeal = deal?.status === 'draft'
  const displayName = profileName(session?.user.user_metadata, language)

  const activeCaseRoute = isDraftDeal
    ? '/(customer)/booking'
    : customerCaseWorkRouteForDeal(deal)

  const openService = (serviceType: ServiceType) => {
    workflow.dispatch?.({ type: 'start_home_service', serviceType })
    router.replace(`/(customer)/booking?service=${encodeURIComponent(serviceType)}` as never)
  }

  return (
    <V21Screen screenId="2.1-home" testID="customer-v21-home">
      <V21TopBar
        actionLabel="◌"
        avatarText={initialsForName(displayName)}
        showAvatar={false}
        subtitle=""
        title={homeGreeting(displayName, language)}
      />

      <View style={styles.homeAuraFrame}>
      <V21Card
        glass
        style={[
          styles.homeHero,
          {
            backgroundColor: tokens.mode === 'dark' ? tokens.glassStrong : 'transparent',
            borderColor: tokens.mode === 'dark' ? tokens.glassBorder : 'rgba(255,255,255,0.91)',
            shadowColor: tokens.mode === 'dark' ? '#000000' : '#05695E',
            shadowOpacity: tokens.mode === 'dark' ? 0.16 : 0.14,
          },
        ]}
        testID="customer-v21-home-hero"
      >
        <SourceCardSkin testID="customer-v21-home-card-skin" />
        <HomeHeroSourceAura />
        <View style={styles.heroCopy}>
          <Text style={[styles.heroTitle, styles.homeHeroTitle, { color: tokens.text }]}>
            {language === 'vi' ? 'Kael sẵn sàng hỗ trợ, công việc vẫn do bạn kiểm soát.' : 'Kael is ready to help while you keep work control.'}
          </Text>
        </View>
        <Image resizeMode="contain" source={customerV21Assets.kaelFull} style={styles.heroKael} />
      </V21Card>
      </View>

      <SectionActionHeader
        action={language === 'vi' ? 'Xem tất cả ›' : 'See all ›'}
        onAction={() => router.replace('/(customer)/booking' as never)}
        title={language === 'vi' ? 'Bạn cần gì hôm nay?' : 'What do you need today?'}
      />
      <View style={[styles.serviceGrid, styles.homeServiceGrid]}>
        {SERVICE_TYPES.map((service) => (
          <ServiceTile homeAura key={service} onPress={() => openService(service)} service={service} />
        ))}
      </View>

      <SectionActionHeader
        action={deal ? (isDraftDeal ? (language === 'vi' ? 'Tiếp tục ›' : 'Continue ›') : (language === 'vi' ? 'Mở công việc ›' : 'Open work ›')) : undefined}
        onAction={deal ? () => router.replace(activeCaseRoute as never) : undefined}
        title={isDraftDeal ? (language === 'vi' ? 'Nháp dịch vụ' : 'Service draft') : copy.activeCase}
      />
      {deal ? (
        <ActiveCaseCard deal={deal} onOpen={() => router.replace(activeCaseRoute as never)} />
      ) : (
        <EmptyState
          action={<KaelButton label={copy.startService} onPress={() => router.replace('/(customer)/booking' as never)} size="small" testID="customer-v21-home-start" />}
          body={copy.emptyActivityBody}
          image={customerV21Assets.activity}
          mintAura
          testID="customer-v21-home-empty"
          title={copy.emptyActivity}
        />
      )}
    </V21Screen>
  )
}

export function CustomerBookingEntrySurface() {
  const language = useAppLanguage()
  const router = useRouter()
  const params = useLocalSearchParams<{ date?: string | string[]; screen?: string | string[]; service?: string | string[]; serviceType?: string | string[]; time?: string | string[] }>()
  const { guestMode, session } = useAuth()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const initialDeal = useFrontendWorkflow().state.deal
  const rawServicesScreen = firstParam(params.screen)
  const directServicesScreen = servicesScreenParam(rawServicesScreen)
  const directService = serviceParam(firstParam(params.service) ?? firstParam(params.serviceType))
  const directScheduleDate = bookingScheduleDateParam(firstParam(params.date))
  const directScheduleTime = bookingScheduleTimeParam(firstParam(params.time))
  const legacyMediaScreenRequested = rawServicesScreen === '2.3-media'
  const servicesScreenId = legacyMediaScreenRequested ? '2.2-search' : directServicesScreen ?? '2.2-search'
  const isMediaScreen = false
  const [selectedService, setSelectedService] = useState<ServiceType | null>(initialDeal?.draft.serviceType ?? directService)
  const [serviceSearchQuery, setServiceSearchQuery] = useState('')
  const [selectedProblems, setSelectedProblems] = useState<string[]>(initialDeal?.draft.problemChips ?? [])
  const [address, setAddress] = useState(initialDeal?.draft.addressLabel ?? '')
  const [addressDistrictLabel, setAddressDistrictLabel] = useState<string | null>(
    () => extractKnownDistrictLabel(initialDeal?.draft.addressLabel ?? initialDeal?.draft.districtLabel ?? '') ?? initialDeal?.draft.districtLabel ?? null,
  )
  const [addressLookupOpen, setAddressLookupOpen] = useState(false)
  const [addressLookupPending, setAddressLookupPending] = useState(false)
  const [addressFallbackUsed, setAddressFallbackUsed] = useState(false)
  const [addressSuggestions, setAddressSuggestions] = useState<BookingAddressSuggestion[]>([])
  const [description, setDescription] = useState(initialDeal?.draft.description ?? '')
  const [selectedScheduleDate, setSelectedScheduleDate] = useState<string | null>(directScheduleDate)
  const [selectedScheduleTime, setSelectedScheduleTime] = useState<string | null>(directScheduleTime)
  const mediaCount = initialDeal?.draft.mediaCount ?? 0
  const [voiceDrafts, setVoiceDrafts] = useState<LocalMediaUploadDraft[]>([])
  const [error, setError] = useState<string | null>(null)
  const [scheduleRuntimeNow, setScheduleRuntimeNow] = useState(() => Date.now())
  useEffect(() => {
    const intervalId = setInterval(() => setScheduleRuntimeNow(Date.now()), bookingScheduleRuntimeRefreshMs)
    return () => clearInterval(intervalId)
  }, [])
  useEffect(() => {
    if (!legacyMediaScreenRequested) return
    router.replace(customerKaelWorkRoute as never)
  }, [legacyMediaScreenRequested, router])
  useEffect(() => {
    const trimmed = address.trim()
    if (!addressLookupOpen || trimmed.length < 2) {
      setAddressLookupPending(false)
      setAddressFallbackUsed(false)
      setAddressSuggestions([])
      return
    }

    let cancelled = false
    setAddressLookupPending(true)
    const timerId = setTimeout(() => {
      void placesService.autocomplete({ input: trimmed }).then((result) => {
        if (cancelled) return
        if (!result.success) {
          setAddressFallbackUsed(true)
          setAddressSuggestions([])
          return
        }
        setAddressFallbackUsed(result.data.fallback_used)
        setAddressSuggestions(result.data.suggestions)
      }).catch(() => {
        if (cancelled) return
        setAddressFallbackUsed(true)
        setAddressSuggestions([])
      }).finally(() => {
        if (!cancelled) setAddressLookupPending(false)
      })
    }, bookingAddressLookupDelayMs)

    return () => {
      cancelled = true
      clearTimeout(timerId)
    }
  }, [address, addressLookupOpen])
  const scheduleDateOptions = useMemo(() => buildBookingScheduleDateOptions(language, new Date(scheduleRuntimeNow)), [language, scheduleRuntimeNow])
  const scheduleLabel = bookingScheduleLabel(scheduleDateOptions, selectedScheduleDate, selectedScheduleTime, language)
  const addressUsesMultiline = address.trim().length > 34

  useEffect(() => {
    if (!selectedScheduleDate) return
    if (scheduleDateOptions.some((option) => option.value === selectedScheduleDate)) return
    setSelectedScheduleDate(null)
  }, [scheduleDateOptions, selectedScheduleDate])

  if (guestMode || !session) {
    return (
      <V21Screen screenId={servicesScreenId} testID="customer-v21-services-guest">
        <EmptyState
          action={<KaelButton label={language === 'vi' ? 'Đăng nhập' : 'Sign in'} onPress={() => router.replace('/(auth)/login' as never)} testID="customer-v21-guest-login" />}
          body={copy.guestBody}
          image={customerV21Assets.identity}
          testID="customer-v21-guest-gate"
          title={copy.guestTitle}
        />
      </V21Screen>
    )
  }

  const problemOptions = selectedService ? [...PROBLEM_CHIPS[selectedService]] : []
  const normalizedServiceSearchQuery = normalizeBookingSearchText(serviceSearchQuery)
  const toggleProblem = (label: string) => {
    setSelectedProblems((current) =>
      current.includes(label) ? current.filter((item) => item !== label) : [...current, label],
    )
  }
  const searchSuggestions = buildBookingSearchSuggestions({
    language,
    problemOptions,
    query: normalizedServiceSearchQuery,
    selectedProblems,
    selectedService,
  })
  const selectSearchSuggestion = (suggestion: BookingSearchSuggestion) => {
    if (!suggestion.problem) {
      setSelectedService(suggestion.serviceType)
      setSelectedProblems([])
      return
    }
    setSelectedService(suggestion.serviceType)
    setSelectedProblems((current) => {
      if (selectedService !== suggestion.serviceType) return [suggestion.problem as string]
      return current.includes(suggestion.problem as string)
        ? current.filter((item) => item !== suggestion.problem)
        : [...current, suggestion.problem as string]
    })
  }
  const updateAddress = (nextAddress: string) => {
    setAddress(nextAddress)
    setAddressDistrictLabel(extractKnownDistrictLabel(nextAddress) || null)
    setAddressLookupOpen(true)
  }
  const selectAddressSuggestion = (suggestion: BookingAddressSuggestion) => {
    setAddress(suggestion.label)
    setAddressDistrictLabel(extractKnownDistrictLabel(suggestion.label) || null)
    setAddressLookupOpen(false)
    setAddressLookupPending(false)
    setAddressFallbackUsed(false)
    setAddressSuggestions([])
  }

  const submitDraft = async () => {
    if (!selectedService) {
      setError(language === 'vi' ? 'Chọn dịch vụ trước khi gửi Kael.' : 'Choose a service before sending to Kael.')
      return
    }
    if (description.trim().length < 10) {
      setError(language === 'vi' ? 'Mô tả cần rõ hơn trước khi gửi Kael.' : 'Add a clearer description before sending to Kael.')
      return
    }
    if (address.trim().length < 4) {
      setError(language === 'vi' ? 'Nhập khu vực hoặc căn hộ.' : 'Enter an apartment or area.')
      return
    }
    const message = buildBookingDraftMessage({
      address,
      description,
      language,
      problems: selectedProblems,
      scheduleLabel,
      serviceType: selectedService,
    })
    const totalMediaCount = mediaCount + voiceDrafts.length
    const normalizedAddress = address.trim()
    const normalizedDistrict = addressDistrictLabel ?? extractKnownDistrictLabel(normalizedAddress) ?? normalizedAddress
    await setPendingKaelChatDraft({
      addressLabel: normalizedAddress,
      clientRequestId: generateClientRequestId(),
      createdAt: new Date().toISOString(),
      description: description.trim(),
      districtLabel: normalizedDistrict,
      locale: language,
      mediaCount: totalMediaCount,
      message,
      photoDrafts: voiceDrafts.length > 0 ? voiceDrafts : undefined,
      problemChips: selectedProblems,
      serviceType: selectedService,
      source: 'booking',
    })
    setError(null)
    router.replace(customerKaelWorkRoute as never)
  }
  const selectedServiceCopy = selectedService ? customerV21ServiceCopy[language][selectedService] : null

  return (
    <V21Screen screenId={servicesScreenId} testID="customer-v21-services">
      <V21TopBar
        actionLabel="≡"
        onBack={() => router.replace('/(customer)/home' as never)}
        subtitle={isMediaScreen ? (language === 'vi' ? 'Bước 2/4 · dữ liệu chờ công việc thật' : 'Step 2/4 · data waits for a real job') : (language === 'vi' ? 'Kael sẽ dẫn bạn theo từng bước' : 'Kael guides each step')}
        title={isMediaScreen ? (language === 'vi' ? 'Kael thu thập hiện trạng' : 'Kael collects current state') : (language === 'vi' ? 'Tạo yêu cầu dịch vụ' : 'Create service request')}
      />

      {!isMediaScreen ? (
        <V21Card glass style={[styles.stepCard, styles.bookingSourceStepCard]} testID="customer-v21-services-hero">
          <SourceCardSkin testID="customer-v21-booking-step-card-skin" />
          <View style={styles.rowBetween}>
            <Text style={[styles.stepLabel, { color: tokens.text }]}>{language === 'vi' ? 'Bước 1/4 · Chọn dịch vụ' : 'Step 1/4 · Choose service'}</Text>
            <Text style={[styles.stepBadge, { color: tokens.primary }]}>{language === 'vi' ? 'Kael hỗ trợ' : 'Kael assisted'}</Text>
          </View>
          <ProgressRail activeStep={1} style={styles.bookingProgressRail} testID="customer-v21-booking-progress" />
        </V21Card>
      ) : null}

      {isMediaScreen ? (
        <MediaIntakePanel
          caseLabel={initialDeal ? caseDisplayCode(initialDeal, language) : (language === 'vi' ? 'Nháp' : 'Draft')}
          description={description}
          mediaCount={mediaCount}
          onVoiceSaved={(draft) => setVoiceDrafts((current) => mergeMediaDrafts(current, [draft], Math.max(1, 5 - mediaCount)))}
          onSubmit={submitDraft}
          problemChips={selectedProblems}
          voiceDrafts={voiceDrafts}
        />
      ) : null}
      {isMediaScreen && error ? <Text style={[styles.errorText, { color: tokens.primary }]} testID="customer-v21-booking-error">{error}</Text> : null}

      {!isMediaScreen ? (
        <View style={[styles.searchShell, styles.bookingSourceSearch, bookingSourceSearchWebShadow, { backgroundColor: 'transparent', borderColor: 'rgba(13,174,154,0.64)' }]}>
          <SourceCardSkin testID="customer-v21-booking-search-source" />
          <BookingSearchMintBorder />
          <Image
            resizeMode="contain"
            source={customerV21Assets.request}
            style={styles.bookingSearchImageIcon}
            testID="customer-v21-booking-search-icon"
          />
          <KaelTextInput
            accessibilityLabel={language === 'vi' ? 'Tìm dịch vụ hoặc vấn đề' : 'Search services or issues'}
            onChangeText={setServiceSearchQuery}
            placeholder={selectedService
              ? (language === 'vi' ? 'Tìm vấn đề: ống, vòi, toilet...' : 'Find an issue: pipe, faucet, toilet...')
              : (language === 'vi' ? 'Chọn dịch vụ hoặc gợi ý bên dưới...' : 'Pick a service or suggestion below...')}
            placeholderTextColor={tokens.muted}
            returnKeyType="search"
            style={[styles.searchText, customerV21WebTextInputNoOutline, { color: bookingSearchInputTextColor }]}
            testID="customer-v21-booking-search-input"
            value={serviceSearchQuery}
          />
        </View>
      ) : null}
      {!isMediaScreen ? (
        <View style={styles.bookingSearchSuggestionPanel} testID="customer-v21-booking-search-suggestions">
          <Text style={[styles.bookingSearchSuggestionTitle, { color: tokens.primary }]}>
            {selectedService ? (language === 'vi' ? 'Có thể đặt' : 'You can book') : (language === 'vi' ? 'Gợi ý đặt' : 'Suggestions')}
          </Text>
          <View style={styles.bookingSearchSuggestionRow}>
            {searchSuggestions.map((suggestion, index) => (
              <KaelChip
                accessibilityState={{ selected: suggestion.selected }}
                key={suggestion.key}
                label={suggestion.label}
                onPress={() => selectSearchSuggestion(suggestion)}
                testID={`customer-v21-booking-search-suggestion-${index}`}
                variant={suggestion.selected ? 'selected' : 'unselected'}
              />
            ))}
          </View>
        </View>
      ) : null}

      {!isMediaScreen ? (
        <>
          <SectionActionHeader
            action={selectedService ? (language === 'vi' ? 'Thay đổi' : 'Change') : undefined}
            onAction={selectedService ? () => {
              setSelectedService(null)
              setSelectedProblems([])
              router.replace('/(customer)/booking' as never)
            } : undefined}
            title={selectedService ? (language === 'vi' ? 'Dịch vụ đã chọn' : 'Selected service') : (language === 'vi' ? 'Chọn dịch vụ' : 'Choose service')}
          />
          {selectedService && selectedServiceCopy ? (
            <V21Card style={[styles.selectedServiceCard, styles.bookingSelectedServiceCard]} testID="customer-v21-selected-service">
              <SourceCardSkin testID="customer-v21-booking-selected-card-skin" />
              <AssetTile image={customerV21ServiceAssets[selectedService]} label={selectedServiceCopy.label} size={44} sourceAura />
              <View style={styles.flex}>
                <Text style={[styles.cardTitle, { color: tokens.text }]}>{selectedServiceCopy.label}</Text>
                <Text style={[styles.bodyText, { color: tokens.muted }]}>{selectedServiceCopy.note}</Text>
                <View style={styles.heroChipRow}>
                  <View style={styles.bookingSuggestedChipFrame}>
                    <BookingSuggestedChipAura />
                    <KaelChip label={language === 'vi' ? 'Đề xuất bởi Kael' : 'Suggested by Kael'} style={styles.bookingSuggestedChip} variant="selected" />
                  </View>
                  <KaelChip label={copy.dataPending} variant="unselected" />
                </View>
              </View>
            </V21Card>
          ) : null}
          {!selectedService ? (
            <View style={[styles.serviceGrid, styles.bookingServiceGrid]}>
              {SERVICE_TYPES.map((service) => (
                <ServiceTile
                  homeAura
                  key={service}
                  onPress={() => {
                    setSelectedService(service)
                    setSelectedProblems([])
                  }}
                  selected={selectedService === service}
                  service={service}
                />
              ))}
            </View>
          ) : null}

          <SectionActionHeader
            action={language === 'vi' ? 'Kael nhớ sẵn' : 'Saved by Kael'}
            title={language === 'vi' ? 'Thông tin đặt lịch' : 'Booking details'}
          />
          <V21Card style={[styles.formCard, styles.bookingInfoCard]} testID="customer-v21-booking-info-card">
            <SourceCardSkin testID="customer-v21-booking-info-card-skin" />
            <View style={styles.bookingField}>
              <Text style={[styles.bookingFieldLabel, { color: tokens.text }]}>{language === 'vi' ? 'Địa điểm' : 'Location'}</Text>
              <View
                style={[
                  styles.bookingInputRow,
                  addressUsesMultiline ? styles.bookingInputRowMultiline : null,
                  { backgroundColor: tokens.mode === 'dark' ? tokens.base : '#FFFFFF', borderColor: tokens.border },
                ]}
                testID="customer-v21-booking-address-row"
              >
                <Image resizeMode="contain" source={customerV21Assets.map} style={styles.bookingInlineIcon} />
                <KaelTextField
                  inputShellStyle={styles.bookingInlineTextFieldShell}
                  accessibilityLabel={language === 'vi' ? 'Khu vực căn hộ' : 'Apartment area'}
                  multiline={addressUsesMultiline}
                  onChangeText={updateAddress}
                  onFocus={() => setAddressLookupOpen(true)}
                  placeholder={language === 'vi' ? 'Ví dụ: Tòa A, Quận 7' : 'Example: Tower A, District 7'}
                  placeholderTextColor={tokens.subtleText}
                  scrollEnabled={false}
                  shellStyle={styles.bookingInlineTextFieldStack}
                  style={[
                    styles.bookingInlineInput,
                    addressUsesMultiline ? styles.bookingInlineInputMultiline : null,
                    customerV21WebTextInputNoOutline,
                    customerV21HiddenTextInputScrollbar,
                    { color: tokens.text },
                  ]}
                  testID="customer-v21-booking-address"
                  textAlignVertical="center"
                  value={address}
                />
              </View>
              {addressLookupOpen && (addressLookupPending || addressSuggestions.length > 0 || addressFallbackUsed) ? (
                <View style={[styles.bookingAddressSuggestions, { backgroundColor: tokens.mode === 'dark' ? tokens.base : '#FFFFFF', borderColor: tokens.border }]} testID="customer-v21-booking-address-suggestions">
                  {addressLookupPending ? (
                    <Text style={[styles.bookingAddressLookupText, { color: tokens.muted }]} testID="customer-v21-booking-address-loading">
                      {language === 'vi' ? 'Đang tìm' : 'Searching'}
                    </Text>
                  ) : addressSuggestions.length > 0 ? (
                    addressSuggestions.map((suggestion, index) => (
                      <Pressable
                        accessibilityRole="button"
                        key={suggestion.place_id}
                        onPress={() => selectAddressSuggestion(suggestion)}
                        style={({ pressed }) => [
                          styles.bookingAddressSuggestionButton,
                          { borderBottomColor: tokens.border },
                          pressed ? styles.pressed : null,
                        ]}
                        testID={`customer-v21-booking-address-suggestion-${index}`}
                      >
                        <Text numberOfLines={1} style={[styles.bookingAddressSuggestionTitle, { color: tokens.text }]}>
                          {suggestion.main_text}
                        </Text>
                        {suggestion.secondary_text ? (
                          <Text numberOfLines={1} style={[styles.bookingAddressSuggestionSubtitle, { color: tokens.muted }]}>
                            {suggestion.secondary_text}
                          </Text>
                        ) : null}
                      </Pressable>
                    ))
                  ) : (
                    <Text style={[styles.bookingAddressLookupText, { color: tokens.muted }]} testID="customer-v21-booking-address-fallback">
                      {language === 'vi' ? 'Chưa có gợi ý' : 'No suggestions'}
                    </Text>
                  )}
                </View>
              ) : null}
            </View>
            <View style={styles.bookingField}>
              <Text style={[styles.bookingFieldLabel, { color: tokens.text }]}>{language === 'vi' ? 'Thời gian mong muốn' : 'Preferred time'}</Text>
              <View style={[styles.bookingSchedulePanel, { backgroundColor: tokens.mode === 'dark' ? tokens.base : '#FFFFFF', borderColor: tokens.border }]} testID="customer-v21-booking-schedule-panel">
                <View style={styles.bookingScheduleHeader}>
                  <Image resizeMode="contain" source={customerV21Assets.booking} style={styles.bookingInlineIcon} />
                  <Text numberOfLines={1} style={[styles.bookingReadonlyText, { color: scheduleLabel ? tokens.text : tokens.muted }]} testID="customer-v21-booking-schedule-summary">
                    {scheduleLabel ?? (language === 'vi' ? 'Chưa chọn' : 'Not selected')}
                  </Text>
                </View>
                <View style={styles.bookingDateGrid}>
                  {scheduleDateOptions.map((option, index) => {
                    const selected = selectedScheduleDate === option.value
                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        key={option.value}
                        onPress={() => setSelectedScheduleDate(option.value)}
                        style={[
                          styles.bookingDateOption,
                          {
                            backgroundColor: selected ? tokens.service : tokens.ghost,
                            borderColor: selected ? tokens.primary : tokens.border,
                          },
                        ]}
                        testID={`customer-v21-booking-date-${index}`}
                      >
                        <Text numberOfLines={1} style={[styles.bookingDateDay, { color: selected ? tokens.primary : tokens.muted }]}>{option.dayLabel}</Text>
                        <Text numberOfLines={1} style={[styles.bookingDateValue, { color: selected ? tokens.primary : tokens.text }]}>{option.dateLabel}</Text>
                      </Pressable>
                    )
                  })}
                </View>
                <View style={styles.bookingTimeGrid}>
                  {bookingTimeSlots.map((slot, index) => {
                    const selected = selectedScheduleTime === slot
                    return (
                      <KaelChip
                        key={slot}
                        label={slot}
                        onPress={() => setSelectedScheduleTime(slot)}
                        testID={`customer-v21-booking-time-${index}`}
                        variant={selected ? 'selected' : 'unselected'}
                      />
                    )
                  })}
                </View>
              </View>
            </View>
            <View style={styles.bookingField}>
              <Text style={[styles.bookingFieldLabel, { color: tokens.text }]}>{language === 'vi' ? 'Mô tả sự cố' : 'Issue description'}</Text>
              <KaelTextField
                inputShellStyle={[styles.bookingDescriptionInputShell, { backgroundColor: tokens.mode === 'dark' ? tokens.base : '#FFFFFF', borderColor: tokens.border }]}
                accessibilityLabel={language === 'vi' ? 'Mô tả vấn đề' : 'Issue description'}
                multiline
                onChangeText={setDescription}
                placeholder={copy.chatPlaceholder}
                placeholderTextColor={tokens.subtleText}
                style={[styles.bookingDescriptionInput, customerV21WebTextInputNoOutline, customerV21InvisibleTextInputScrollbar, { color: tokens.text }]}
                testID="customer-v21-booking-description"
                textAlignVertical="top"
                value={description}
              />
            </View>
            {selectedService ? (
              <View style={[styles.bookingField, styles.bookingProblemField]}>
                <BookingProblemChipAura />
                <Text style={[styles.bookingFieldLabel, { color: tokens.text }]}>{language === 'vi' ? 'Chi tiết' : 'Details'}</Text>
                <View style={styles.chipWrap}>
                  {problemOptions.map((problem) => (
                    <KaelChip
                      key={problem}
                      label={problem}
                      onPress={() => toggleProblem(problem)}
                      testID={`customer-v21-problem-${problem}`}
                      variant={selectedProblems.includes(problem) ? 'selected' : 'unselected'}
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </V21Card>

          {error ? <Text style={[styles.errorText, { color: tokens.primary }]} testID="customer-v21-booking-error">{error}</Text> : null}
          <KaelButton
            backgroundLayer={<BookingDraftButtonAura />}
            label={copy.createDraft}
            onPress={submitDraft}
            style={styles.bookingDraftSubmitButton}
            testID="customer-v21-booking-submit"
            variant="secondary"
          />
        </>
      ) : null}
    </V21Screen>
  )
}

function MediaIntakePanel({
  caseLabel,
  description,
  mediaCount,
  onSubmit,
  onVoiceSaved,
  problemChips,
  voiceDrafts,
}: {
  caseLabel: string
  description: string
  mediaCount: number
  onSubmit: () => void
  onVoiceSaved: (draft: LocalMediaUploadDraft) => void
  problemChips: string[]
  voiceDrafts: LocalMediaUploadDraft[]
}) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const recorderState = useAudioRecorderState(audioRecorder, 250)
  const recordingRef = useRef(false)
  const [isRecordingVoice, setIsRecordingVoice] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const hasDescription = description.trim().length > 0
  const hasProblems = problemChips.length > 0
  const draftLabel = language === 'vi' ? 'Nháp' : 'Draft'
  const cleanCaseLabel = caseLabel.trim().length > 0 ? caseLabel.trim() : draftLabel
  const emptyText = language === 'vi' ? 'Trống' : 'Empty'
  const waitingText = language === 'vi' ? 'Chờ' : 'Waiting'
  const doneText = language === 'vi' ? 'Hoàn tất' : 'Done'
  const runningText = language === 'vi' ? 'Đang chờ' : 'Waiting'
  const voiceCount = voiceDrafts.length
  const totalFileCount = mediaCount + voiceCount
  const mediaValue = formatKnownCount(mediaCount, language)
  const voiceValue = formatKnownCount(voiceCount, language)
  const totalFileValue = formatKnownCount(totalFileCount, language)
  const recordingSeconds = Math.max(0, Math.round((recorderState.durationMillis ?? 0) / 1000))
  const hasAnyInput = hasDescription || hasProblems || totalFileCount > 0
  const microNote = cleanCaseLabel === draftLabel
    ? (language === 'vi' ? 'Dữ liệu nháp tách khỏi trò chuyện thường.' : 'Draft data stays separate from normal chat.')
    : (language === 'vi' ? `Dữ liệu ${cleanCaseLabel} tách khỏi trò chuyện thường.` : `${cleanCaseLabel} data stays separate from normal chat.`)
  const handleVoicePress = async () => {
    try {
      if (isRecordingVoice) {
        await audioRecorder.stop()
        recordingRef.current = false
        setIsRecordingVoice(false)
        const uri = audioRecorder.uri
        if (!uri) {
          setVoiceError(language === 'vi' ? 'Chưa lưu' : 'Not saved')
          return
        }
        const extension = Platform.OS === 'web' ? '.webm' : '.m4a'
        onVoiceSaved({
          fileName: `kael-voice-${Date.now()}${extension}`,
          mimeType: Platform.OS === 'web' ? 'audio/webm' : 'audio/m4a',
          type: 'audio',
          uri,
        })
        setVoiceError(null)
        return
      }

      if (totalFileCount >= 5) {
        setVoiceError(language === 'vi' ? 'Đủ tệp' : 'Full')
        return
      }

      const permission = await AudioModule.requestRecordingPermissionsAsync()
      if (!permission.granted) {
        const message = language === 'vi' ? 'Chưa bật mic' : 'Mic off'
        setVoiceError(message)
        openMicrophoneSettingsPrompt(language, message)
        return
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      })
      await audioRecorder.prepareToRecordAsync()
      audioRecorder.record()
      recordingRef.current = true
      setIsRecordingVoice(true)
      setVoiceError(null)
    } catch {
      recordingRef.current = false
      setIsRecordingVoice(false)
      setVoiceError(language === 'vi' ? 'Lỗi mic' : 'Mic error')
    }
  }

  useEffect(() => {
    return () => {
      if (!recordingRef.current) return
      void audioRecorder.stop().catch(() => undefined)
      recordingRef.current = false
    }
  }, [audioRecorder])

  return (
    <View testID="customer-v21-screen-2.3-media">
      <View style={styles.mediaCaseRow} testID="customer-v21-media-case-row">
        <EyebrowPill label={cleanCaseLabel} preserveCase testID="customer-v21-media-case-pill" />
      </View>

      <V21Card glass style={[styles.mediaCard, styles.mediaHeroCard]} testID="customer-v21-media-intake">
        <SourceCardSkin testID="customer-v21-media-hero-card-skin" />
        <MediaHeroAura />
        <View style={styles.mediaHeroContent}>
          <View style={styles.rowBetween}>
            <View style={styles.flex}>
              <Text style={[styles.cardTitle, { color: tokens.text }]}>{language === 'vi' ? 'Ảnh & video hiện trạng' : 'Current media'}</Text>
              <Text style={[styles.bodyText, styles.mediaCaptionText, { color: tokens.muted }]}>
                {language === 'vi' ? 'Kael dùng để phân tích, tách khỏi trò chuyện thường.' : 'Kael uses this for analysis, separate from normal chat.'}
              </Text>
            </View>
            <AssetTile image={customerV21Assets.evidence} label={copy.mediaTitle} size={48} sourceAura style={styles.mediaHeroIcon} />
          </View>

          <View style={styles.mediaStrip}>
            <MediaEvidenceSlot active={mediaCount > 0} image={customerV21Assets.evidence} label={language === 'vi' ? 'Ảnh/video' : 'Media'} testID="customer-v21-media-slot-files" value={mediaValue} />
            <MediaEvidenceSlot active={voiceCount > 0} image={customerV21Assets.kael} label={language === 'vi' ? 'Giọng nói' : 'Voice'} testID="customer-v21-media-slot-voice" value={voiceValue} />
            <MediaEvidenceSlot active={totalFileCount > 0} image={customerV21Assets.request} label={language === 'vi' ? 'Tệp' : 'Files'} testID="customer-v21-media-slot-extra" value={totalFileValue} />
          </View>

          <MediaVoiceNote
            isRecording={isRecordingVoice}
            onPress={() => void handleVoicePress()}
            recordingSeconds={recordingSeconds}
            testID="customer-v21-media-voice-note"
            value={isRecordingVoice ? `${recordingSeconds}s` : voiceValue}
          />
          {voiceError ? <Text style={[styles.mediaVoiceError, { color: tokens.primary }]} testID="customer-v21-media-voice-error">{voiceError}</Text> : null}
        </View>
      </V21Card>

      <SectionActionHeader
        action={hasDescription ? (language === 'vi' ? 'Sửa' : 'Edit') : undefined}
        title={language === 'vi' ? 'Mô tả của bạn' : 'Your description'}
      />
      <V21Card style={[styles.mediaCard, styles.mediaSourceListCard, styles.mediaDescriptionCard]} testID="customer-v21-media-description">
        <SourceCardSkin testID="customer-v21-media-description-card-skin" />
        <Text style={[styles.bodyText, styles.mediaDescriptionQuote, { color: hasDescription ? tokens.text : tokens.muted }]}>
          {hasDescription ? description.trim() : emptyText}
        </Text>
        <View style={styles.heroChipRow}>
          {hasProblems ? problemChips.map((chip) => (
            <MediaDescriptionChip key={chip} label={chip} selected />
          )) : (
            <MediaDescriptionChip label={emptyText} testID="customer-v21-media-description-empty-chip" />
          )}
        </View>
      </V21Card>

      <SectionActionHeader
        action={language === 'vi' ? 'Chi tiết' : 'Details'}
        title={language === 'vi' ? 'Kael đang chuẩn bị Thông tin' : 'Kael is preparing the information'}
      />
      <V21Card style={[styles.mediaCard, styles.mediaSourceListCard, styles.mediaPrepSourceCard]} testID="customer-v21-media-prep">
        <SourceCardSkin testID="customer-v21-media-prep-card-skin" />
        <MediaPrepAura />
        <View style={styles.mediaPrepStepList}>
          <MediaPrepListAura />
          <MediaPrepRow index={1} label={language === 'vi' ? 'Đọc mô tả' : 'Read description'} state={hasDescription ? 'done' : 'idle'} value={hasDescription ? doneText : emptyText} />
          <MediaPrepRow index={2} label={language === 'vi' ? 'Phân loại ảnh & giọng nói' : 'Classify media and voice'} state={totalFileCount > 0 ? 'done' : 'idle'} value={totalFileValue} />
          <MediaPrepRow index={3} label={language === 'vi' ? 'Phát hiện rủi ro' : 'Detect risk'} state={hasAnyInput ? 'active' : 'idle'} value={hasAnyInput ? runningText : emptyText} />
          <MediaPrepRow index={4} label={language === 'vi' ? 'Tạo đề xuất ban đầu' : 'Draft recommendation'} state="idle" value={waitingText} />
        </View>
      </V21Card>

      <KaelButton
        backgroundLayer={<MediaAnalyzeButtonAura />}
        label={language === 'vi' ? 'Gửi để Kael phân tích' : 'Send for Kael analysis'}
        onPress={onSubmit}
        style={styles.mediaAnalyzeButton}
        testID="customer-v21-media-analyze"
      />
      <Text style={[styles.mediaMicroNote, { color: tokens.muted }]} testID="customer-v21-media-micro-note">{microNote}</Text>
    </View>
  )
}

function MediaDescriptionChip({ label, selected = false, testID }: { label: string; selected?: boolean; testID?: string }) {
  return (
    <View style={styles.mediaDescriptionChipFrame} testID={testID}>
      <MediaDescriptionChipAura testID={testID ? `${testID}-mint-aura` : undefined} />
      <KaelChip
        label={label}
        style={styles.mediaDescriptionChip}
        variant={selected ? 'selected' : 'unselected'}
      />
    </View>
  )
}

function MediaDescriptionChipAura({ testID }: { testID?: string }) {
  const { reduceTransparency } = useV21Theme()

  if (reduceTransparency) return null

  return (
    <View pointerEvents="none" style={styles.mediaDescriptionChipAura} testID={testID}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 92 44" width="100%">
        <Defs>
          <RadialGradient id="mediaDescriptionChipAuraFill" cx="50%" cy="48%" r="70%">
            <Stop offset="0" stopColor="rgba(89,236,216,0.28)" />
            <Stop offset="0.72" stopColor="rgba(89,236,216,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#mediaDescriptionChipAuraFill)" height="44" width="92" />
      </Svg>
    </View>
  )
}

function MediaHeroAura() {
  const { reduceTransparency } = useV21Theme()

  if (reduceTransparency) return null

  return (
    <View pointerEvents="none" style={styles.mediaHeroAura} testID="customer-v21-media-hero-mint-aura">
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 340 190" width="100%">
        <Defs>
          <RadialGradient id="mediaHeroAuraRight" cx="92%" cy="6%" r="70%">
            <Stop offset="0" stopColor="rgba(82,232,211,0.30)" />
            <Stop offset="0.58" stopColor="rgba(148,246,229,0.12)" />
            <Stop offset="0.74" stopColor="rgba(148,246,229,0)" />
          </RadialGradient>
          <RadialGradient id="mediaHeroAuraLeft" cx="7%" cy="88%" r="62%">
            <Stop offset="0" stopColor="rgba(13,174,154,0.18)" />
            <Stop offset="0.72" stopColor="rgba(13,174,154,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#mediaHeroAuraRight)" height="190" width="340" />
        <Rect fill="url(#mediaHeroAuraLeft)" height="190" width="340" />
      </Svg>
    </View>
  )
}

function MediaPrepAura() {
  const { reduceTransparency } = useV21Theme()

  if (reduceTransparency) return null

  return (
    <View pointerEvents="none" style={styles.mediaPrepAura} testID="customer-v21-media-prep-mint-aura">
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 340 210" width="100%">
        <Defs>
          <RadialGradient id="mediaPrepAuraTop" cx="16%" cy="8%" r="58%">
            <Stop offset="0" stopColor="rgba(151,246,232,0.22)" />
            <Stop offset="0.72" stopColor="rgba(151,246,232,0)" />
          </RadialGradient>
          <RadialGradient id="mediaPrepAuraBottom" cx="88%" cy="92%" r="68%">
            <Stop offset="0" stopColor="rgba(13,174,154,0.16)" />
            <Stop offset="0.76" stopColor="rgba(13,174,154,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#mediaPrepAuraTop)" height="210" width="340" />
        <Rect fill="url(#mediaPrepAuraBottom)" height="210" width="340" />
      </Svg>
    </View>
  )
}

function MediaPrepListAura() {
  const { reduceTransparency } = useV21Theme()

  if (reduceTransparency) return null

  return (
    <View pointerEvents="none" style={styles.mediaPrepListAura} testID="customer-v21-media-prep-list-mint-aura">
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 320 190" width="100%">
        <Defs>
          <RadialGradient id="mediaPrepListAuraLeft" cx="4%" cy="14%" r="58%">
            <Stop offset="0" stopColor="rgba(93,236,216,0.20)" />
            <Stop offset="0.70" stopColor="rgba(93,236,216,0)" />
          </RadialGradient>
          <RadialGradient id="mediaPrepListAuraRight" cx="98%" cy="80%" r="62%">
            <Stop offset="0" stopColor="rgba(13,174,154,0.14)" />
            <Stop offset="0.76" stopColor="rgba(13,174,154,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#mediaPrepListAuraLeft)" height="190" width="320" />
        <Rect fill="url(#mediaPrepListAuraRight)" height="190" width="320" />
      </Svg>
    </View>
  )
}

function MediaAnalyzeButtonAura() {
  const { reduceTransparency } = useV21Theme()

  if (reduceTransparency) return null

  return (
    <View pointerEvents="none" style={styles.mediaAnalyzeButtonAura} testID="customer-v21-media-analyze-mint-aura">
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 340 58" width="100%">
        <Defs>
          <RadialGradient id="mediaAnalyzeAuraCenter" cx="50%" cy="50%" r="72%">
            <Stop offset="0" stopColor="rgba(90,236,214,0.36)" />
            <Stop offset="0.68" stopColor="rgba(90,236,214,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#mediaAnalyzeAuraCenter)" height="58" width="340" />
      </Svg>
    </View>
  )
}

function MediaEvidenceSlot({
  active = false,
  image,
  label,
  testID,
  value,
}: {
  active?: boolean
  image: ImageSourcePropType
  label: string
  testID: string
  value: string
}) {
  const { tokens } = useV21Theme()
  return (
    <View
      style={[
        styles.mediaEvidenceSlot,
        active ? styles.mediaEvidenceSlotActive : null,
        {
          backgroundColor: tokens.mode === 'dark' ? tokens.raised : 'rgba(255,255,255,0.82)',
          borderColor: active ? tokens.primary : tokens.border,
        },
      ]}
      testID={testID}
    >
      <Image resizeMode="contain" source={image} style={styles.mediaSlotIcon} />
      <Text numberOfLines={1} style={[styles.mediaSlotLabel, { color: tokens.muted }]}>{label}</Text>
      <Text adjustsFontSizeToFit minimumFontScale={0.8} numberOfLines={1} style={[styles.mediaSlotValue, { color: active ? tokens.primary : tokens.text }]}>{value}</Text>
    </View>
  )
}

function MediaVoiceNote({
  isRecording,
  onPress,
  recordingSeconds,
  testID,
  value,
}: {
  isRecording: boolean
  onPress: () => void
  recordingSeconds: number
  testID: string
  value: string
}) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const bars = [8, 17, 12, 23, 15, 10, 18, 13]
  const title = isRecording
    ? (language === 'vi' ? 'Đang ghi · chạm để lưu' : 'Recording · tap to save')
    : (language === 'vi' ? 'Ghi chú bằng giọng nói' : 'Voice note')
  return (
    <Pressable
      accessibilityHint={isRecording ? (language === 'vi' ? 'Lưu ghi âm' : 'Save recording') : (language === 'vi' ? 'Bắt đầu ghi âm' : 'Start recording')}
      accessibilityLabel={title}
      accessibilityRole="button"
      accessibilityState={{ selected: isRecording }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.mediaVoice,
        pressed ? styles.mediaVoicePressed : null,
        {
          backgroundColor: tokens.mode === 'dark' ? tokens.raised : '#FFFFFF',
          borderColor: isRecording ? tokens.primary : tokens.border,
        },
      ]}
      testID={testID}
    >
      <Image resizeMode="contain" source={customerV21Assets.kael} style={styles.mediaVoiceIcon} />
      <View style={styles.mediaVoiceBody}>
        <Text numberOfLines={1} style={[styles.mediaVoiceTitle, { color: tokens.text }]}>{title}</Text>
        <View style={styles.mediaWave} testID="customer-v21-media-wave">
          {bars.map((height, index) => (
            <View
              key={`${height}-${index}`}
              style={[styles.mediaWaveBar, { backgroundColor: isRecording || index < 3 ? tokens.primary : tokens.border, height: isRecording ? Math.max(8, height + (index % 2 === 0 ? 4 : 0)) : height }]}
            />
          ))}
        </View>
      </View>
      <Text accessibilityLabel={isRecording ? `${recordingSeconds} seconds` : value} style={[styles.mediaVoiceValue, { color: isRecording ? tokens.primary : tokens.muted }]}>{value}</Text>
    </Pressable>
  )
}

function MediaPrepRow({
  index,
  label,
  state,
  value,
}: {
  index: number
  label: string
  state: 'active' | 'done' | 'idle'
  value: string
}) {
  const { tokens } = useV21Theme()
  const highlighted = state === 'active' || state === 'done'
  return (
    <View style={[styles.mediaPrepRow, { backgroundColor: highlighted ? tokens.service : tokens.ghost, borderColor: tokens.border }]}>
      <View style={[styles.mediaPrepState, { backgroundColor: highlighted ? tokens.primary : tokens.raised, borderColor: highlighted ? tokens.primary : tokens.border }]}>
        <Text style={[styles.mediaPrepStateText, { color: highlighted ? tokens.primaryText : tokens.muted }]}>{state === 'done' ? '✓' : String(index)}</Text>
      </View>
      <Text numberOfLines={2} style={[styles.mediaPrepLabel, { color: tokens.text }]}>{label}</Text>
      <Text numberOfLines={1} style={[styles.mediaPrepValue, { color: highlighted ? tokens.primary : tokens.muted }]}>{value}</Text>
    </View>
  )
}

function PrepRow({
  active = false,
  done = false,
  index,
  label,
  value,
}: {
  active?: boolean
  done?: boolean
  index: number
  label: string
  value: string
}) {
  const { tokens } = useV21Theme()
  const highlighted = done || active
  return (
    <View style={[styles.prepRow, { backgroundColor: highlighted ? tokens.service : tokens.ghost, borderColor: tokens.border }]}>
      <View style={[styles.prepState, { backgroundColor: highlighted ? tokens.primary : tokens.raised, borderColor: highlighted ? tokens.primary : tokens.border }]}>
        <Text style={[styles.prepStateText, { color: highlighted ? tokens.primaryText : tokens.muted }]}>{done ? '✓' : String(index)}</Text>
      </View>
      <Text numberOfLines={2} style={[styles.prepLabel, { color: tokens.text }]}>{label}</Text>
      <Text numberOfLines={1} style={[styles.prepValue, { color: highlighted ? tokens.primary : tokens.muted }]}>{value}</Text>
    </View>
  )
}

export function CustomerHistorySurface() {
  const language = useAppLanguage()
  const router = useRouter()
  const params = useLocalSearchParams<{ job_id?: string | string[]; scope_change?: string | string[]; screen?: string | string[]; tab?: string | string[] }>()
  const workflow = useFrontendWorkflow()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const workflowDeal = workflow.state.deal
  const deal = isRealCaseDeal(workflowDeal) ? workflowDeal : null
  const routeJobId = cleanRouteJobId(firstParam(params.job_id))
  const rawActivityScreen = firstParam(params.screen)
  const legacyCaseChatHistoryRequested = rawActivityScreen === '2.5-chat-case'
  const legacyCaseOverviewHistoryRequested = rawActivityScreen === '2.6-case-overview'
  const legacyMatchingHistoryRequested = rawActivityScreen === '2.7-matching'
  const legacyOptionsHistoryRequested = rawActivityScreen === '2.8-options'
  const legacyQuoteHistoryRequested = rawActivityScreen === '2.9-quotes'
  const legacyLocationHistoryRequested = rawActivityScreen === '2.10-location-eta'
  const legacyLiveAlertHistoryRequested = rawActivityScreen === '2.11-live-alert'
  const legacyJobAcceptedHistoryRequested = rawActivityScreen === '2.12-job-accepted'
  const legacyJobProgressHistoryRequested = rawActivityScreen === '2.13-job-progress'
  const legacyPaymentReviewHistoryRequested = rawActivityScreen === '3.1-payment-review'
  const legacyPaymentMethodHistoryRequested = rawActivityScreen === '3.2-payment-method'
  const legacyPaymentProtectedHistoryRequested = rawActivityScreen === '3.3-payment-protected'
  const legacyPaymentRouteRequested = legacyPaymentReviewHistoryRequested || legacyPaymentMethodHistoryRequested || legacyPaymentProtectedHistoryRequested
  const defaultActivityScreen = deal
    ? screenIdsForStatus(deal.status).find((screen) => !chatCompressedActivityScreenIds.has(screen)) ?? null
    : null
  const defaultCompressedActivityRequested = !rawActivityScreen && Boolean(deal) && !defaultActivityScreen
  const legacyCaseRouteRequested = legacyCaseChatHistoryRequested || legacyCaseOverviewHistoryRequested || legacyMatchingHistoryRequested || legacyOptionsHistoryRequested || legacyQuoteHistoryRequested || legacyLocationHistoryRequested || legacyLiveAlertHistoryRequested || legacyJobAcceptedHistoryRequested || legacyJobProgressHistoryRequested || defaultCompressedActivityRequested
  const activeScreen = legacyCaseChatHistoryRequested || legacyCaseOverviewHistoryRequested
    ? '2.6-case-overview'
    : legacyMatchingHistoryRequested
      ? '2.7-matching'
      : legacyOptionsHistoryRequested
        ? '2.8-options'
        : legacyQuoteHistoryRequested
          ? '2.9-quotes'
          : legacyLocationHistoryRequested
            ? '2.10-location-eta'
            : legacyLiveAlertHistoryRequested
              ? '2.11-live-alert'
              : legacyJobAcceptedHistoryRequested
                ? '2.12-job-accepted'
                : legacyJobProgressHistoryRequested
                  ? '2.13-job-progress'
                  : legacyPaymentReviewHistoryRequested
                    ? '3.1-payment-review'
                    : legacyPaymentMethodHistoryRequested
                      ? '3.2-payment-method'
                      : legacyPaymentProtectedHistoryRequested
                        ? '3.3-payment-protected'
                        : activityScreenParam(rawActivityScreen) ?? defaultActivityScreen ?? '2.6-case-overview'
  const compressedActivityActive = chatCompressedActivityScreenIds.has(activeScreen)
  const paymentRouteRedirectRequested = legacyPaymentRouteRequested && Boolean(deal?.payment)
  const caseRouteRedirectRequested = legacyCaseRouteRequested || paymentRouteRedirectRequested || (compressedActivityActive && Boolean(deal))
  const caseOverviewActive = activeScreen === '2.6-case-overview'
  const scopeChange = deal?.scopeChange ?? null
  const routeScopeChangeParam = firstParam(params.scope_change)
  const forceScopeChangeModal = Boolean(
    scopeChange &&
    isPendingCustomerScopeChange(scopeChange) &&
    (deal?.status === 'scope_change_pending' || routeScopeChangeParam),
  )
  const decideScopeChange = (decision: 'approve' | 'reject') => {
    if (!scopeChange) return
    void workflow.actions.decideScopeChange(scopeChange.id, { decision })
  }

  useEffect(() => {
    if (!routeJobId || deal?.id === routeJobId) return
    void workflow.actions.hydrateRemoteJobById(routeJobId)
  }, [deal?.id, routeJobId, workflow.actions])
  useEffect(() => {
    if (!caseRouteRedirectRequested) return
    const caseChatPath = customerCaseWorkRouteForDeal(deal, paymentRouteRedirectRequested ? '&focus=payment' : '')
    router.replace(caseChatPath as never)
  }, [caseRouteRedirectRequested, deal?.id, paymentRouteRedirectRequested, router])
  const title = caseOverviewActive
    ? (language === 'vi' ? 'Tổng Quan' : 'Overview')
    : customerV21ScreenTitles[language][activeScreen]
  const subtitle = caseOverviewActive
    ? ''
    : activeScreen === '2.7-matching'
      ? (language === 'vi' ? 'Kael so sánh kỹ năng, lịch và khu vực' : 'Kael compares skill, schedule, and area')
    : deal
      ? caseDisplayCode(deal, language)
      : copy.dataPending

  return (
    <V21Screen screenId={activeScreen} testID="customer-v21-activity">
      <V21TopBar
        actionLabel="↗"
        onBack={() => router.replace('/(customer)/home' as never)}
        subtitle={subtitle}
        title={title}
      />

      {deal ? (
        caseRouteRedirectRequested ? (
          <InactiveAgenticGate testID={`customer-v21-direct-empty-${activeScreen}`} />
        ) : caseOverviewActive ? (
          <CaseOverviewDirectScreen deal={deal} />
        ) : (
          <ActivityDirectScreen deal={deal} screenId={activeScreen} />
        )
      ) : (
        <InactiveAgenticGate testID={`customer-v21-direct-empty-${activeScreen}`} />
      )}
      <ScopeChangeHardStopModal
        language={language}
        newScopeLabel={scopeChange?.requestedDescription ?? copy.dataPending}
        onApprove={() => decideScopeChange('approve')}
        onReject={() => decideScopeChange('reject')}
        originalEstimateLabel={deal?.estimate?.priceRangeLabel ?? copy.dataPending}
        originalScopeLabel={deal?.estimate?.problemLabel ?? deal?.draft.description ?? copy.dataPending}
        scopeChange={scopeChange}
        tokens={tokens}
        visible={forceScopeChangeModal}
      />
    </V21Screen>
  )
}

export function CustomerProfileSurface() {
  const language = useAppLanguage()
  const router = useRouter()
  const params = useLocalSearchParams<{ panel?: string | string[]; screen?: string | string[]; utility?: string | string[] }>()
  const { session, signOut } = useAuth()
  const workflow = useFrontendWorkflow()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const insights = workflow.customerProfileInsights ?? null
  const directProfileScreen = profileScreenParam(firstParam(params.screen))
  const directAgenticScreen = agenticScreenParam(directProfileScreen, firstParam(params.utility))
  const directProfileUtility = profileUtilityParam(firstParam(params.utility))
  const requestedPanel = profilePanelForScreen(directProfileScreen) ?? profilePanelParam(firstParam(params.panel))
  const [panel, setPanel] = useState<CustomerProfilePanel>(() => requestedPanel ?? 'overview')
  const name = profileName(session?.user.user_metadata, language)
  const memberSince = memberSinceLabel(insights?.member_since ?? session?.user.created_at, language, copy.dataPending)
  const activeLabel = session ? (language === 'vi' ? 'Tích cực' : 'Active') : copy.dataPending
  const verifiedProfileLabel = session ? (language === 'vi' ? 'Khách hàng đã xác minh' : 'Verified customer') : copy.dataPending
  const bankOptionCount = Object.keys(customerV21BankAssets).length
  const bankOptionLabel = language === 'vi'
    ? `${formatNumber(bankOptionCount, language)} ngân hàng`
    : `${formatNumber(bankOptionCount, language)} banks`
  const usageRank = typeof insights?.usage_rank_level === 'number' ? Math.max(0, Math.min(5, insights.usage_rank_level)) : 0
  const usageRankPoints = typeof insights?.usage_rank_points === 'number' ? Math.max(0, insights.usage_rank_points) : 0
  const usageRankCyclePoints = usageRankPoints > 0 ? (usageRankPoints % 1000 || 1000) : 0
  const usageRankProgress = usageRank > 0 ? Math.max(0, Math.min(100, usageRankCyclePoints / 10)) : 0
  const usageRankStatus = profileRankStatus(usageRank, language, copy.dataPending)
  const usageRankPointsLabel = language === 'vi'
    ? `${formatNumber(usageRankCyclePoints, language)} / 1.000 điểm`
    : `${formatNumber(usageRankCyclePoints, language)} / 1,000 points`

  useEffect(() => {
    if (requestedPanel) setPanel(requestedPanel)
  }, [requestedPanel])

  const openProfilePanel = (nextPanel: CustomerProfilePanel, screenId: CustomerV21ScreenId) => {
    setPanel(nextPanel)
    router.replace(`/(customer)/profile?screen=${screenId}` as never)
  }

  if (directAgenticScreen) {
    return <CustomerAgenticCenterSurface screenId={directAgenticScreen} />
  }

  if (directProfileUtility) {
    return (
      <V21Screen key={`profile-utility-${directProfileUtility}`} screenId="6.1-profile-overview" testID="customer-v21-profile">
        <V21TopBar
          actionLabel="i"
          onBack={() => router.replace('/(customer)/profile' as never)}
          subtitle={directProfileUtility === 'address' ? '' : profileUtilitySubtitle(directProfileUtility, language)}
          title={profileUtilityTitle(directProfileUtility, language)}
          titleStyle={directProfileUtility === 'address' ? styles.profileAddressUtilityTitle : undefined}
        />
        <ProfileUtilitySection insights={insights} kind={directProfileUtility} />
      </V21Screen>
    )
  }

  const profileScreenId: CustomerV21ScreenId =
    panel === 'ranking' ? '6.2-usage-ranking' : panel === 'money' ? '6.3-protect-money' : panel === 'memory' ? '5.4-memory' : '6.1-profile-overview'
  if (panel !== 'overview') {
    return (
      <V21Screen key={profileScreenId} screenId={profileScreenId} testID="customer-v21-profile">
        <V21TopBar
          actionLabel="i"
          onBack={() => {
            setPanel('overview')
            router.replace('/(customer)/profile' as never)
          }}
          subtitle={profileStageSubtitle(profileScreenId, language)}
          title={customerV21ScreenTitles[language][profileScreenId]}
        />
        {panel === 'ranking' ? <ProfileRanking insights={insights} /> : null}
        {panel === 'money' ? <ProfileMoney insights={insights} /> : null}
        {panel === 'memory' ? <ProfileMemory /> : null}
      </V21Screen>
    )
  }

  return (
    <V21Screen key={profileScreenId} screenId={profileScreenId} testID="customer-v21-profile">
      <V21TopBar
        actionLabel="⚙"
        showAvatar={false}
        subtitle={language === 'vi' ? 'Tài khoản, bảo vệ và các tiện ích phụ' : 'Account, protection, and utilities'}
        title={language === 'vi' ? 'Hồ sơ khách hàng' : 'Customer profile'}
      />

      <ProfileAuraCard cardStyle={styles.profileOverviewHeroCard} contentStyle={styles.profileHeroLarge} scope="OverviewHero" testID="customer-v21-profile-hero">
        <View style={styles.profileAvatarLarge}>
          <View pointerEvents="none" style={styles.profileAvatarGradientLayer}>
            <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 74 74" width="100%">
              <Defs>
                <LinearGradient id="profileAvatarGradient" x1="0.08" x2="0.92" y1="0.08" y2="0.92">
                  <Stop offset="0" stopColor="#7EDFD2" />
                  <Stop offset="0.62" stopColor="#24B3A1" />
                  <Stop offset="1" stopColor="#088779" />
                </LinearGradient>
              </Defs>
              <Rect fill="url(#profileAvatarGradient)" height="74" rx="28" width="74" />
            </Svg>
          </View>
          <Text style={styles.profileAvatarText}>{initialsForName(name)}</Text>
          <View style={styles.profileAvatarDot} />
        </View>
        <View style={styles.flex}>
          <View style={styles.profileNameRow}>
            <Text numberOfLines={1} style={[styles.heroTitle, { color: tokens.text }]} testID="customer-v21-profile-name">{name}</Text>
            <KaelChip label="✓" variant={session ? 'selected' : 'unselected'} />
          </View>
          <Text numberOfLines={1} style={[styles.bodyText, { color: tokens.muted }]}>
            {verifiedProfileLabel}
          </Text>
          <View style={styles.heroChipRow}>
            <View style={styles.profileMintChipFrame} testID="customer-v21-profile-member-chip">
              <ZipMintAura scope="ProfileMemberSinceChip" />
              <KaelChip
                label={memberSince}
                style={styles.profileMintChip}
                textStyle={styles.profileMintChipText}
                variant="selected"
              />
            </View>
            <KaelChip label={activeLabel} variant={session ? 'selected' : 'unselected'} />
          </View>
        </View>
      </ProfileAuraCard>

      <SectionActionHeader
        action={language === 'vi' ? 'Mặc định có sẵn' : 'Available'}
        title={language === 'vi' ? 'Tiện ích thông minh' : 'Smart utilities'}
      />
      <Pressable
        accessibilityLabel={copy.agenticCenter}
        accessibilityRole="button"
        onPress={() => router.replace('/(customer)/profile?utility=agentic' as never)}
        testID="customer-v21-profile-agentic-entry"
      >
        <ProfileAuraCard cardStyle={styles.profileOverviewAgenticCard} contentStyle={styles.profileAgenticCard} scope="OverviewAgentic" testID="customer-v21-profile-agentic-card">
          <AssetTile image={customerV21Assets.kaelHead} label={copy.agenticCenter} size={48} sourceAura style={styles.profileAgenticIcon} />
          <View style={styles.flex}>
            <View style={styles.profileNameRow}>
              <Text style={[styles.cardTitle, { color: tokens.text }]}>{copy.agenticCenter}</Text>
              <View style={styles.profileMintChipFrame}>
                <ZipMintAura scope="ProfileAgenticUtilityChip" />
                <KaelChip
                  label={language === 'vi' ? 'Tiện ích phụ' : 'Utility'}
                  style={styles.profileMintChip}
                  textStyle={styles.profileMintChipText}
                  variant="selected"
                />
              </View>
            </View>
            <Text style={[styles.bodyText, { color: tokens.muted }]}>
              {language === 'vi'
                ? 'Trung tâm điều phối, hàng chờ duyệt và ghi nhớ theo dữ liệu thật.'
                : 'Command center, approval queue, and memory from real data.'}
            </Text>
          </View>
          <Text style={[styles.profileAgenticChevron, { color: tokens.primary }]}>›</Text>
        </ProfileAuraCard>
      </Pressable>

      <SectionActionHeader
        action={language === 'vi' ? 'Quản lý' : 'Manage'}
        title={language === 'vi' ? 'Tiện ích tài khoản' : 'Account utilities'}
      />
      <View style={styles.accountUtilityGrid}>
        <AccountUtilityTile image={customerV21Assets.address} label={language === 'vi' ? 'Địa chỉ' : 'Addresses'} value={insightNumber(insights, 'saved_address_count', copy.emptyProfileMetric, language, (value) => language === 'vi' ? `${value} địa điểm` : `${value} places`)} />
        <AccountUtilityTile image={customerV21Assets.payment} label={language === 'vi' ? 'Thanh toán' : 'Payment'} value={bankOptionLabel} />
        <AccountUtilityTile image={customerV21Assets.theme} label={language === 'vi' ? 'Cài đặt' : 'Settings'} value={language === 'vi' ? 'Tài khoản' : 'Account'} />
      </View>

      <View style={styles.profileOverviewActionStack}>
        <Pressable
          accessibilityLabel={language === 'vi' ? 'Xem xếp hạng sử dụng' : 'View usage ranking'}
          accessibilityRole="button"
          onPress={() => openProfilePanel('ranking', '6.2-usage-ranking')}
          testID="customer-v21-profile-ranking-cta"
        >
          {({ pressed }) => (
            <ProfileAuraCard cardStyle={[styles.profileRankingEntryCard, pressed ? styles.pressed : null]} contentStyle={styles.profileRankingEntryContent} scope="OverviewRankingEntry" testID="customer-v21-profile-ranking-entry">
              <AssetTile image={customerV21Assets.activity} label={language === 'vi' ? 'Xếp hạng sử dụng' : 'Usage ranking'} size={54} sourceAura style={styles.profileRankingEntryIcon} />
              <View style={styles.flex}>
                <View style={styles.profileRankingEntryTitleRow}>
                  <Text numberOfLines={1} style={[styles.cardTitle, { color: tokens.text }]}>
                    {language === 'vi' ? 'Xếp hạng sử dụng' : 'Usage ranking'}
                  </Text>
                  <View style={styles.profileRankingStatusChipFrame}>
                    <ZipMintAura scope="ProfileOverviewRankingStatus" />
                    <KaelChip
                      label={usageRankStatus}
                      style={usageRank > 0 ? styles.profileMintChip : styles.profileRankingEmptyChip}
                      textStyle={usageRank > 0 ? styles.profileMintChipText : styles.profileRankingEmptyChipText}
                      variant={usageRank > 0 ? 'selected' : 'unselected'}
                    />
                  </View>
                </View>
                <Text numberOfLines={2} style={[styles.bodyText, { color: tokens.muted }]}>
                  {language === 'vi' ? 'Kael đánh giá từ dữ liệu sử dụng thật.' : 'Kael evaluates real usage data.'}
                </Text>
                <View style={styles.profileRankingEntryMetaRow}>
                  <Text style={[styles.profileRankingEntryMeta, { color: tokens.primary }]}>{usageRankPointsLabel}</Text>
                  <Text style={[styles.profileRankingEntryChevron, { color: tokens.primary }]}>›</Text>
                </View>
                <ProfileProgressBar percent={usageRankProgress} testID="customer-v21-profile-ranking-entry-progress" />
              </View>
            </ProfileAuraCard>
          )}
        </Pressable>
        <KaelButton
          backgroundLayer={<ZipMintAura scope="ProfileLogoutCta" />}
          label={language === 'vi' ? 'Đăng xuất' : 'Sign out'}
          onPress={() => void signOut()}
          showPrimaryGradient={false}
          style={[styles.profileLogoutCta, styles.profileAuraButton]}
          testID="customer-v21-profile-signout-cta"
          variant="secondary"
        />
      </View>
    </V21Screen>
  )
}

export function CustomerAgenticCenterSurface({ screenId = '5.1-agentic-home' }: { screenId?: CustomerV21ScreenId } = {}) {
  const language = useAppLanguage()
  const router = useRouter()
  const workflow = useFrontendWorkflow()
  const workflowDeal = workflow.state.deal
  const deal = isRealCaseDeal(workflowDeal) ? workflowDeal : null
  const copy = customerV21CommonCopy[language]
  const memoryRows = agenticMemoryRowsFromUnknown(workflow.customerKaelMemory, language)
  const memoryCount = agenticMemoryItemCount(memoryRows)
  const approvalCount = deal?.scopeChange ? 1 : 0
  const pendingApproval = deal?.scopeChange && isPendingCustomerScopeChange(deal.scopeChange) ? deal.scopeChange : null
  const redirectApprovalToCaseWork = screenId === '5.3-approval-queue' && Boolean(deal?.id && pendingApproval)
  const approveScopeChange = (id: string) => {
    void workflow.actions?.decideScopeChange?.(id, { decision: 'approve' })
  }
  const rejectScopeChange = (id: string) => {
    void workflow.actions?.decideScopeChange?.(id, { decision: 'reject' })
  }
  const openAgenticHome = () => router.replace('/(customer)/profile?utility=agentic' as never)
  const openProfile = () => router.replace('/(customer)/profile' as never)
  const openActivity = () => router.replace('/(customer)/profile?screen=5.2-command-center' as never)
  const openCaseChat = () => {
    router.replace(customerCaseWorkRouteForDeal(deal) as never)
  }

  useEffect(() => {
    if (!redirectApprovalToCaseWork) return
    router.replace(customerCaseWorkRouteForDeal(deal, '&focus=approval') as never)
  }, [deal?.id, redirectApprovalToCaseWork, router])

  if (screenId === '5.2-command-center') {
    return (
      <V21Screen screenId="5.2-command-center" testID="customer-v21-agentic-command-center">
        <V21TopBar
          actionLabel="✦"
          onBack={openAgenticHome}
          subtitle={deal ? caseDisplayCode(deal, language) : copy.dataPending}
          title={customerV21ScreenTitles[language]['5.2-command-center']}
        />
        <AgenticCommandCenter deal={deal} onOpenCaseChat={openCaseChat} />
      </V21Screen>
    )
  }

  if (screenId === '5.3-approval-queue') {
    return (
      <V21Screen screenId="5.3-approval-queue" testID="customer-v21-agentic-approval-screen">
        <V21TopBar
          actionLabel="i"
          onBack={openAgenticHome}
          subtitle={language === 'vi' ? 'Quyết định ảnh hưởng giá, phạm vi hoặc hoàn tất' : 'Price, scope, or completion decisions'}
          title={customerV21ScreenTitles[language]['5.3-approval-queue']}
        />
        {redirectApprovalToCaseWork ? (
          <InactiveAgenticGate testID="customer-v21-agentic-approval-redirect" />
        ) : (
          <AgenticApprovalQueue deal={deal} onApprove={approveScopeChange} onReject={rejectScopeChange} />
        )}
      </V21Screen>
    )
  }

  if (screenId === '5.4-memory') {
    return (
      <V21Screen screenId="5.4-memory" testID="customer-v21-agentic-memory-screen">
        <V21TopBar
          actionLabel="⌁"
          onBack={openAgenticHome}
          subtitle={language === 'vi' ? 'Kiểm soát điều Kael nhớ và cách dùng trong công việc' : 'Control what Kael remembers and how it is used'}
          title={customerV21ScreenTitles[language]['5.4-memory']}
        />
        <AgenticMemoryStage memory={workflow.customerKaelMemory} memoryRows={memoryRows} />
      </V21Screen>
    )
  }

  return (
    <V21Screen screenId="5.1-agentic-home" testID="customer-v21-agentic-center">
      <V21TopBar
        actionLabel="⚙"
        onBack={openProfile}
        subtitle={language === 'vi' ? 'Tiện ích trong Hồ sơ · điều phối, không thay quyền quyết định' : 'Profile utility · coordination without replacing your authority'}
        title={copy.agenticCenter}
      />
      <AgenticHomeStage
        approvalCount={approvalCount}
        deal={deal}
        memoryCount={memoryCount}
        onOpenActivity={openActivity}
        onOpenCaseChat={openCaseChat}
      />
    </V21Screen>
  )
}

export function CustomerKaelSurface() {
  return <KaelChatSurface />
}

function AgenticHomeStage({
  approvalCount,
  deal,
  memoryCount,
  onOpenActivity,
  onOpenCaseChat,
}: {
  approvalCount: number
  deal: LocalDeal | null
  memoryCount: number
  onOpenActivity: () => void
  onOpenCaseChat: () => void
}) {
  const language = useAppLanguage()
  const hasDeal = Boolean(deal)

  return (
    <View style={styles.agenticHomeStack}>
      <AgenticHomeBackdropAura />
      <AgenticStageHero
        body={hasDeal
          ? (language === 'vi' ? 'Một luồng dữ liệu, một vết duyệt, một trạng thái tiền.' : 'One data flow, one approval trail, one money state.')
          : (language === 'vi' ? 'Trung tâm sẽ nhận dữ liệu từ Kael Chat và quy trình Agentic.' : 'The center will receive data from Kael Chat and the Agentic workflow.')}
        image={customerV21Assets.kaelFull}
        imageKind="mascot"
        narrow
        scope="AgenticHomeHero"
        testID="customer-v21-agentic-home-hero"
        title={hasDeal
          ? (language === 'vi' ? 'Tôi đang làm việc trên công việc của bạn.' : 'I am working on your job.')
          : (language === 'vi' ? 'Kael sẵn sàng điều phối công việc.' : 'Kael is ready to coordinate work.')}
      />

      <View style={styles.agenticMetricRow}>
        <AgenticMetricTile label={language === 'vi' ? 'Công việc đang chạy' : 'Active jobs'} testID="customer-v21-agentic-active" value={formatNumber(hasDeal ? 1 : 0, language)} />
        <AgenticMetricTile label={language === 'vi' ? 'Cần duyệt' : 'Needs approval'} testID="customer-v21-agentic-approvals" value={formatNumber(approvalCount, language)} />
        <AgenticMetricTile label={language === 'vi' ? 'Mục ghi nhớ' : 'Memory items'} testID="customer-v21-agentic-alerts" value={formatNumber(memoryCount, language)} />
      </View>

      {deal ? (
        <>
          <SectionActionHeader
            action={language === 'vi' ? 'Mở ›' : 'Open ›'}
            onAction={onOpenActivity}
            title={language === 'vi' ? 'Công việc ưu tiên' : 'Priority job'}
          />
          <AgenticCasePriorityCard deal={deal} onOpenActivity={onOpenActivity} onOpenCaseChat={onOpenCaseChat} />

          <SectionActionHeader
            action={language === 'vi' ? 'Nhật ký ›' : 'Work log ›'}
            title={language === 'vi' ? 'Kael đang làm' : 'Kael is working on'}
          />
          <AgenticWorkLogCard deal={deal} />
        </>
      ) : null}

      <AgenticUtilityStack deal={deal} memoryCount={memoryCount} />
    </View>
  )
}

function AgenticHomeBackdropAura() {
  const { reduceTransparency } = useV21Theme()
  if (reduceTransparency) return null

  return (
    <View pointerEvents="none" style={styles.agenticHomeBackdropAura} testID="customer-v21-agentic-home-background-aura">
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 390 760" width="100%">
        <Defs>
          <RadialGradient id="agenticHomeTopAura" cx="88%" cy="6%" r="62%">
            <Stop offset="0" stopColor="rgba(99,235,216,0.30)" />
            <Stop offset="0.50" stopColor="rgba(169,247,235,0.13)" />
            <Stop offset="0.82" stopColor="rgba(169,247,235,0)" />
          </RadialGradient>
          <RadialGradient id="agenticHomeLeftAura" cx="-8%" cy="42%" r="68%">
            <Stop offset="0" stopColor="rgba(126,238,223,0.21)" />
            <Stop offset="0.66" stopColor="rgba(126,238,223,0)" />
          </RadialGradient>
          <RadialGradient id="agenticHomeBottomAura" cx="72%" cy="100%" r="62%">
            <Stop offset="0" stopColor="rgba(80,221,206,0.18)" />
            <Stop offset="0.72" stopColor="rgba(80,221,206,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#agenticHomeTopAura)" height="760" width="390" />
        <Rect fill="url(#agenticHomeLeftAura)" height="760" width="390" />
        <Rect fill="url(#agenticHomeBottomAura)" height="760" width="390" />
      </Svg>
    </View>
  )
}

function AgenticStageBackdropAura({ scope }: { scope: string }) {
  const { reduceTransparency } = useV21Theme()
  if (reduceTransparency) return null

  const topId = `agenticStageTop${scope}`
  const leftId = `agenticStageLeft${scope}`
  const lowerId = `agenticStageLower${scope}`
  return (
    <View pointerEvents="none" style={styles.agenticStageBackdropAura} testID={`customer-v21-agentic-${scope.toLowerCase()}-background-aura`}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 390 760" width="100%">
        <Defs>
          <RadialGradient id={topId} cx="90%" cy="0%" r="64%">
            <Stop offset="0" stopColor="rgba(92,232,213,0.27)" />
            <Stop offset="0.50" stopColor="rgba(171,248,236,0.13)" />
            <Stop offset="0.82" stopColor="rgba(171,248,236,0)" />
          </RadialGradient>
          <RadialGradient id={leftId} cx="-4%" cy="36%" r="68%">
            <Stop offset="0" stopColor="rgba(118,237,222,0.18)" />
            <Stop offset="0.70" stopColor="rgba(118,237,222,0)" />
          </RadialGradient>
          <RadialGradient id={lowerId} cx="72%" cy="96%" r="64%">
            <Stop offset="0" stopColor="rgba(71,216,202,0.18)" />
            <Stop offset="0.74" stopColor="rgba(71,216,202,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill={`url(#${topId})`} height="760" width="390" />
        <Rect fill={`url(#${leftId})`} height="760" width="390" />
        <Rect fill={`url(#${lowerId})`} height="760" width="390" />
      </Svg>
    </View>
  )
}

function AgenticStageHero({
  body,
  compact = false,
  image,
  imageKind = 'tile',
  narrow = false,
  pill,
  scope,
  testID,
  title,
}: {
  body: string
  compact?: boolean
  image: ImageSourcePropType
  imageKind?: 'mascot' | 'tile'
  narrow?: boolean
  pill?: string
  scope: string
  testID: string
  title: string
}) {
  const { tokens } = useV21Theme()
  return (
    <V21Card glass style={[styles.agenticStageHeroCard, compact ? styles.agenticStageHeroCardCompact : null, narrow ? styles.agenticStageHeroCardNarrow : null]} testID={testID}>
      <SourceCardSkin />
      <CaseWideMintAura scope={`${scope}Wide`} testID={`${testID}-wide-mint-aura`} />
      <ZipMintAura scope={scope} testID={`${testID}-mint-aura`} />
      {imageKind === 'mascot' ? (
        <View style={[styles.agenticHeroMascotWrap, compact ? styles.agenticHeroMascotWrapCompact : null]}>
          <Image resizeMode="contain" source={image} style={[styles.agenticHeroMascot, compact ? styles.agenticHeroMascotCompact : null]} />
        </View>
      ) : (
        <AssetTile image={image} label={title} size={compact ? 50 : 58} sourceAura style={[styles.agenticHeroIcon, compact ? styles.agenticHeroIconCompact : null]} />
      )}
      <View style={[styles.flex, compact ? styles.agenticStageHeroCopyCompact : null]}>
        {pill ? <EyebrowPill label={pill} preserveCase style={styles.agenticHeroPill} /> : null}
        <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={compact ? 2 : 3} style={[styles.agenticStageHeroTitle, compact ? styles.agenticStageHeroTitleCompact : null, narrow ? styles.agenticStageHeroTitleNarrow : null, { color: tokens.text }]}>{title}</Text>
        {body ? (
          <Text numberOfLines={compact ? 2 : 3} style={[styles.agenticStageHeroBody, compact ? styles.agenticStageHeroBodyCompact : null, narrow ? styles.agenticStageHeroBodyNarrow : null, { color: tokens.muted }]}>{body}</Text>
        ) : null}
      </View>
    </V21Card>
  )
}

function AgenticMetricTile({ label, testID, value }: { label: string; testID?: string; value: string }) {
  const { tokens } = useV21Theme()
  return (
    <View style={[styles.agenticMetricTile, { backgroundColor: tokens.raised, borderColor: 'rgba(255,255,255,0.90)' }]} testID={testID}>
      <SourceCardSkin />
      <CaseWideMintAura scope={`AgenticMetric${label.replace(/[^a-zA-Z0-9]/g, '')}`} />
      <ZipMintAura scope={`AgenticMetricZip${label.replace(/[^a-zA-Z0-9]/g, '')}`} />
      <Text adjustsFontSizeToFit minimumFontScale={0.74} numberOfLines={1} style={[styles.agenticMetricValue, { color: tokens.text }]}>{value}</Text>
      <Text numberOfLines={2} style={[styles.agenticMetricLabel, { color: tokens.muted }]}>{label}</Text>
    </View>
  )
}

function AgenticCasePriorityCard({
  deal,
  onOpenActivity,
  onOpenCaseChat,
}: {
  deal: LocalDeal
  onOpenActivity: () => void
  onOpenCaseChat: () => void
}) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const service = deal.draft.serviceType ? customerV21ServiceCopy[language][deal.draft.serviceType].label : copy.dataPending
  const problem = agenticDealProblemLabel(deal, language)
  const subtitle = [caseDisplayCode(deal, language), problem].filter(Boolean).join(' · ')
  const latestApproval = deal.scopeChange?.requestedDescription ?? deal.scopeChange?.reason

  return (
    <Pressable accessibilityRole="button" onPress={onOpenActivity} testID="customer-v21-agentic-active-case">
      <V21Card style={styles.agenticCasePriorityCard}>
        <SourceCardSkin />
        <CaseWideMintAura scope="AgenticPriorityWide" testID="customer-v21-agentic-active-case-wide-mint-aura" />
        <CaseWorkCardAura scope="AgenticPriority" testID="customer-v21-agentic-active-case-mint-aura" />
        <View style={styles.agenticCaseHeader}>
          <AssetTile image={deal.draft.serviceType ? customerV21ServiceAssets[deal.draft.serviceType] : customerV21Assets.request} label={service} size={48} sourceAura style={styles.agenticCaseIcon} />
          <View style={styles.flex}>
            <Text numberOfLines={1} style={[styles.agenticCaseTitle, { color: tokens.text }]}>{service}</Text>
            <Text numberOfLines={1} style={[styles.bodyText, { color: tokens.muted }]}>{subtitle}</Text>
          </View>
          <StatusPill status={deal.status} />
        </View>
        <ProgressRail activeStep={stepForStatus(deal.status)} total={4} />
        <Text numberOfLines={2} style={[styles.agenticCaseActionTitle, { color: tokens.text }]}>
          {language === 'vi' ? 'Kael đang kiểm tra tiến độ & bằng chứng' : 'Kael is checking progress and evidence'}
        </Text>
        <View style={styles.agenticCaseFooterRow}>
          <Text numberOfLines={1} style={[styles.bodyText, styles.flex, { color: tokens.muted }]}>
            {latestApproval
              ? (language === 'vi' ? `Duyệt gần nhất: ${latestApproval}` : `Latest approval: ${latestApproval}`)
              : customerV21StatusCopy[language][deal.status]}
          </Text>
          <Pressable accessibilityRole="button" onPress={onOpenCaseChat} testID="customer-v21-agentic-open-case-chat">
            <Text style={[styles.sectionActionText, { color: tokens.primary }]}>{copy.caseWork}</Text>
          </Pressable>
          <Text style={[styles.sectionActionText, { color: tokens.primary }]}>›</Text>
        </View>
      </V21Card>
    </Pressable>
  )
}

function AgenticWorkLogCard({ deal }: { deal: LocalDeal | null }) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const evidenceCount = totalDealEvidenceCount(deal)
  const riskDone = Boolean(deal?.estimate)
  const scopeActive = Boolean(deal)
  const completionCount = (deal?.completionPhotoUrls?.length ?? 0) + (deal?.completionNotes ? 1 : 0)
  const rows = [
    {
      body: evidenceCount > 0 ? formatEvidenceFileCount(evidenceCount, language) : copy.dataPending,
      image: customerV21Assets.evidence,
      status: evidenceCount > 0 ? (language === 'vi' ? 'Xong' : 'Done') : (language === 'vi' ? 'Chờ' : 'Pending'),
      tone: evidenceCount > 0 ? 'success' as const : 'unselected' as const,
      title: language === 'vi' ? 'Đọc bằng chứng mới' : 'Read new evidence',
    },
    {
      body: riskDone ? (deal?.estimate?.confidenceLabel ?? copy.dataPending) : copy.dataPending,
      image: customerV21Assets.shield,
      status: riskDone ? (language === 'vi' ? 'Đang chạy' : 'Live') : (language === 'vi' ? 'Chờ' : 'Pending'),
      tone: riskDone ? 'selected' as const : 'unselected' as const,
      title: language === 'vi' ? 'Kiểm tra rủi ro' : 'Risk check',
    },
    {
      body: scopeActive && deal ? customerV21StatusCopy[language][deal.status] : copy.dataPending,
      image: customerV21Assets.activity,
      status: scopeActive ? (language === 'vi' ? 'Đang chạy' : 'Running') : (language === 'vi' ? 'Chờ' : 'Pending'),
      tone: scopeActive ? 'selected' as const : 'unselected' as const,
      title: language === 'vi' ? 'Đối chiếu phạm vi' : 'Scope check',
    },
    {
      body: completionCount > 0 ? formatEvidenceFileCount(completionCount, language) : copy.dataPending,
      image: customerV21Assets.request,
      status: completionCount > 0 ? (language === 'vi' ? 'Xong' : 'Done') : (language === 'vi' ? 'Chờ' : 'Pending'),
      tone: completionCount > 0 ? 'success' as const : 'unselected' as const,
      title: language === 'vi' ? 'Bằng chứng hoàn tất' : 'Completion artifact',
    },
  ]

  return (
    <V21Card style={styles.agenticWorkLogCard} testID="customer-v21-agentic-work-log">
      <SourceCardSkin />
      <CaseWideMintAura scope="AgenticWorkLogWide" testID="customer-v21-agentic-work-log-wide-mint-aura" />
      <CaseWorkCardAura scope="AgenticWorkLog" testID="customer-v21-agentic-work-log-mint-aura" />
      {rows.map((row, index) => (
        <Fragment key={row.title}>
          {index > 0 ? <View style={[styles.memoryDivider, { backgroundColor: tokens.border }]} /> : null}
          <AgenticWorkLogRow {...row} />
        </Fragment>
      ))}
    </V21Card>
  )
}

function AgenticWorkLogRow({
  body,
  image,
  status,
  title,
  tone,
}: {
  body: string
  image: ImageSourcePropType
  status: string
  title: string
  tone: 'selected' | 'success' | 'unselected'
}) {
  const { tokens } = useV21Theme()
  const chipTone = tone === 'unselected' ? 'selected' : tone
  return (
    <View style={styles.agenticWorkLogRow}>
      <AssetTile image={image} label={title} size={42} sourceAura style={styles.agenticUtilityIcon} />
      <View style={styles.flex}>
        <Text numberOfLines={1} style={[styles.cardTitle, { color: tokens.text }]}>{title}</Text>
        <Text numberOfLines={1} style={[styles.bodyText, { color: tokens.muted }]}>{body}</Text>
      </View>
      <MatchingHandoffChip label={status} style={styles.agenticWorkLogStatusChip} tone={chipTone} />
    </View>
  )
}

function AgenticCommandCenter({
  deal,
  onOpenCaseChat,
}: {
  deal: LocalDeal | null
  onOpenCaseChat: () => void
}) {
  const language = useAppLanguage()
  const router = useRouter()
  const { tokens } = useV21Theme()
  const pendingApproval = deal?.scopeChange && isPendingCustomerScopeChange(deal.scopeChange) ? deal.scopeChange : null
  const openApproval = () => {
    if (pendingApproval) {
      router.replace(customerCaseWorkRouteForDeal(deal, '&focus=approval') as never)
      return
    }
    router.replace('/(customer)/profile?screen=5.3-approval-queue' as never)
  }

  return (
    <View style={styles.agenticStageStack}>
      <AgenticStageBackdropAura scope="Command" />
      <AgenticCommandCaseCard deal={deal} />
      <SectionActionHeader action={language === 'vi' ? 'Nhật ký' : 'Live log'} title={language === 'vi' ? 'Điều Kael đang điều phối' : 'What Kael is coordinating'} />
      <AgenticCommandTimeline deal={deal} />
      <SectionActionHeader action={language === 'vi' ? 'Tất cả ›' : 'All ›'} title={language === 'vi' ? 'Tài liệu của công việc' : 'Work artifacts'} />
      <AgenticArtifactGrid deal={deal} />
      <View style={styles.agenticCommandActionRow}>
        <KaelButton
          disabled={!deal}
          label={language === 'vi' ? 'Trò chuyện xử lý công việc' : 'Work handling chat'}
          onPress={deal ? onOpenCaseChat : () => undefined}
          style={styles.agenticCommandButton}
          testID="customer-v21-agentic-open-case-chat"
          variant="secondary"
        />
        <KaelButton
          disabled={!pendingApproval}
          label={`${customerV21ScreenTitles[language]['5.3-approval-queue']} · ${deal?.scopeChange ? '1' : '0'}`}
          onPress={openApproval}
          style={styles.agenticCommandButton}
          testID="customer-v21-agentic-command-approval"
        />
      </View>
      <Text style={[styles.agenticAuthorityNote, { color: tokens.muted }]}>
        {language === 'vi'
          ? 'Kael điều phối và đề xuất; mọi hành động có thẩm quyền vẫn cần bạn hoặc quy trình thật.'
          : 'Kael coordinates and suggests; authority still requires you or the real workflow.'}
      </Text>
    </View>
  )
}

function AgenticCommandCaseCard({ deal }: { deal: LocalDeal | null }) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const hasDeal = Boolean(deal)
  const service = deal?.draft.serviceType
    ? customerV21ServiceCopy[language][deal.draft.serviceType].label
    : (language === 'vi' ? 'Chưa có công việc' : 'No active work')
  const address = deal?.draft.addressLabel || deal?.draft.districtLabel || copy.dataPending
  const workerName = deal?.workerProfile?.fullName?.trim() || null
  const detailLine = hasDeal
    ? ([workerName, address].filter((item): item is string => Boolean(item)).join(' · ') || copy.dataPending)
    : (language === 'vi' ? 'Dữ liệu sẽ vào từ Kael Chat' : 'Data will arrive from Kael Chat')
  const amount = deal?.payment ? paymentAmountLabel(deal.payment, language, '0') : copy.dataPending
  const activeStep = deal ? agenticCommandStep(deal.status) : 0

  return (
    <V21Card glass style={styles.agenticCommandHeroCard} testID="customer-v21-agentic-command-case">
      <SourceCardSkin />
      <CaseWideMintAura scope="AgenticCommandCase" testID="customer-v21-agentic-command-case-wide-mint-aura" />
      <CaseWorkCardAura scope="AgenticCommandCaseSoft" testID="customer-v21-agentic-command-case-card-mint-aura" />
      <ZipMintAura scope="AgenticCommandCase" testID="customer-v21-agentic-command-case-mint-aura" />
      <View style={styles.agenticCommandTopRow}>
        <MatchingHandoffChip label={deal ? customerV21StatusCopy[language][deal.status] : copy.dataPending} tone={deal ? 'success' : 'selected'} />
        <View style={styles.agenticCommandMoney}>
          <Text numberOfLines={1} style={[styles.bodyText, { color: tokens.muted }]}>{language === 'vi' ? 'Tiền bảo vệ' : 'Protected money'}</Text>
          <Text adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1} style={[styles.agenticCommandAmount, { color: tokens.primary }]}>{amount}</Text>
        </View>
      </View>
      <Text adjustsFontSizeToFit minimumFontScale={0.74} numberOfLines={1} style={[styles.agenticCommandTitle, { color: tokens.text }]}>{service}</Text>
      <Text numberOfLines={1} style={[styles.bodyText, { color: tokens.muted }]}>{detailLine}</Text>
      <ProgressRail activeStep={activeStep} total={5} />
      <View style={styles.agenticCommandLabelRail}>
        {(language === 'vi'
          ? ['Thu thập', 'Báo giá', 'Trả tiền', 'Ghép thợ', 'Làm việc']
          : ['Intake', 'Quote', 'Pay', 'Match', 'Work']).map((label, index) => (
          <Text key={label} numberOfLines={1} style={[styles.agenticCommandStepLabel, index + 1 === activeStep ? styles.agenticCommandStepLabelActive : null, { color: index + 1 === activeStep ? tokens.primary : tokens.muted }]}>
            {label}
          </Text>
        ))}
      </View>
    </V21Card>
  )
}

function AgenticCommandTimeline({ deal }: { deal: LocalDeal | null }) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const evidenceCount = totalDealEvidenceCount(deal)
  const activeStep = deal ? agenticCommandStep(deal.status) : 0
  const rows = [
    {
      active: evidenceCount > 0,
      body: evidenceCount > 0 ? `${formatEvidenceFileCount(evidenceCount, language)} · ${language === 'vi' ? 'dữ liệu thật' : 'real data'}` : copy.dataPending,
      title: language === 'vi' ? 'Bằng chứng đã nhập' : 'Evidence received',
    },
    {
      active: Boolean(deal?.estimate),
      body: deal?.estimate?.confidenceLabel
        ? (language === 'vi' ? `Tin cậy ${deal.estimate.confidenceLabel}` : `Confidence ${deal.estimate.confidenceLabel}`)
        : copy.dataPending,
      title: language === 'vi' ? 'Kiểm tra rủi ro hoàn tất' : 'Risk check complete',
    },
    {
      active: Boolean(deal),
      body: deal ? (language === 'vi' ? 'Kael đang so với dữ liệu đã có' : 'Kael is comparing against current data') : copy.dataPending,
      title: language === 'vi' ? 'Đối chiếu phạm vi & tiến độ' : 'Scope and progress check',
    },
    {
      active: Boolean((deal?.completionPhotoUrls?.length ?? 0) > 0 || deal?.completionNotes),
      body: deal?.completionNotes ?? (activeStep >= 5 ? (language === 'vi' ? 'Chờ bước kiểm tra vận hành' : 'Waiting for operation check') : copy.dataPending),
      title: language === 'vi' ? 'Chuẩn bị bằng chứng hoàn tất' : 'Prepare completion artifact',
    },
  ]

  return (
    <V21Card style={styles.agenticTimelineCard} testID="customer-v21-agentic-command-timeline">
      <SourceCardSkin />
      <CaseWideMintAura scope="AgenticTimelineWide" testID="customer-v21-agentic-command-timeline-wide-mint-aura" />
      <CaseWorkCardAura scope="AgenticTimeline" testID="customer-v21-agentic-command-timeline-mint-aura" />
      {rows.map((row, index) => (
        <View key={row.title} style={styles.agenticTimelineRow}>
          <View style={styles.agenticTimelineRail}>
            <View style={[styles.agenticTimelineDot, row.active ? styles.agenticTimelineDotActive : null, { borderColor: row.active ? tokens.primary : tokens.border }]} />
            {index < rows.length - 1 ? <View style={[styles.agenticTimelineLine, { backgroundColor: tokens.border }]} /> : null}
          </View>
          <View style={styles.flex}>
            <Text numberOfLines={1} style={[styles.cardTitle, { color: tokens.text }]}>{row.title}</Text>
            <Text numberOfLines={1} style={[styles.bodyText, { color: tokens.muted }]}>{row.body}</Text>
          </View>
        </View>
      ))}
    </V21Card>
  )
}

function AgenticArtifactGrid({ deal }: { deal: LocalDeal | null }) {
  const language = useAppLanguage()
  const copy = customerV21CommonCopy[language]
  const quote = deal ? (deal.estimate?.priceRangeLabel || (deal.payment ? paymentAmountLabel(deal.payment, language, '0') : copy.dataPending)) : copy.dataPending
  const worker = deal?.workerProfile ? (language === 'vi' ? 'Thợ thật' : 'Real worker') : copy.dataPending
  const evidence = deal ? formatEvidenceFileCount(totalDealEvidenceCount(deal), language) : copy.dataPending

  return (
    <View style={styles.agenticArtifactGrid} testID="customer-v21-agentic-artifacts">
      <AgenticArtifactTile label={language === 'vi' ? 'Báo giá' : 'Quote'} value={quote} />
      <AgenticArtifactTile label={language === 'vi' ? 'Thợ' : 'Worker'} value={worker} />
      <AgenticArtifactTile label={language === 'vi' ? 'Bằng chứng' : 'Evidence'} value={evidence} />
    </View>
  )
}

function AgenticArtifactTile({ label, value }: { label: string; value: string }) {
  const { tokens } = useV21Theme()
  return (
    <View style={[styles.agenticArtifactTile, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
      <SourceCardSkin />
      <CaseWideMintAura scope={`ArtifactWide${label.replace(/[^a-zA-Z0-9]/g, '')}`} />
      <ZipMintAura scope={`Artifact${label.replace(/[^a-zA-Z0-9]/g, '')}`} />
      <Text numberOfLines={1} style={[styles.bodyText, { color: tokens.muted }]}>{label}</Text>
      <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={[styles.agenticArtifactValue, { color: tokens.text }]}>{value}</Text>
    </View>
  )
}

function AgenticApprovalQueue({
  deal,
  onApprove,
  onReject,
}: {
  deal: LocalDeal | null
  onApprove: (id: string) => void
  onReject: (id: string) => void
}) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const scopeChange = deal?.scopeChange ?? null
  const approvalCount = scopeChange ? 1 : 0
  const processedRows = agenticProcessedApprovalRows(deal, language)

  if (!scopeChange) {
    return <InactiveAgenticGate testID="customer-v21-agentic-approval-inactive" />
  }

  return (
    <View style={styles.agenticStageStack}>
      <AgenticStageBackdropAura scope="Approval" />
      <AgenticStageHero
        body={approvalCount > 0
          ? (language === 'vi' ? 'Có quyết định cần bạn duyệt trước khi Kael tiếp tục.' : 'A decision needs your approval before Kael continues.')
          : (language === 'vi' ? 'Không có quyết định chờ duyệt.' : 'No decision is waiting.')}
        compact
        image={customerV21Assets.request}
        scope="AgenticApprovalHero"
        testID="customer-v21-agentic-approval-hero"
        title={language === 'vi' ? 'Duyệt đúng lúc, không bỏ lỡ công việc.' : 'Approve at the right time without missing the job.'}
      />

      <SectionActionHeader
        action={deal ? caseDisplayCode(deal, language) : copy.dataPending}
        title={language === 'vi' ? 'Cần duyệt ngay' : 'Needs approval now'}
      />
      <V21Card style={styles.agenticApprovalCard} testID="customer-v21-agentic-approval-queue">
          <SourceCardSkin />
          <CaseWideMintAura scope="AgenticApprovalCardWide" testID="customer-v21-agentic-approval-card-wide-mint-aura" />
          <CaseWorkCardAura scope="AgenticApprovalCard" testID="customer-v21-agentic-approval-card-mint-aura" />
          <View style={styles.agenticApprovalHeader}>
            <AssetTile image={customerV21Assets.request} label={customerV21ScreenTitles[language]['5.3-approval-queue']} size={44} sourceAura style={styles.agenticApprovalIcon} />
            <View style={styles.flex}>
              <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={2} style={[styles.agenticApprovalTitle, { color: tokens.text }]}>
                {scopeChange.requestedDescription ?? copy.dataPending}
              </Text>
              <Text numberOfLines={1} style={[styles.agenticApprovalMeta, { color: tokens.muted }]}>{scopeChange.reason ?? copy.dataPending}</Text>
            </View>
            <MatchingHandoffChip label={language === 'vi' ? 'Chờ bạn' : 'Waiting'} style={styles.agenticApprovalStatusChip} tone="selected" />
          </View>
          <View style={[styles.memoryDivider, { backgroundColor: tokens.border }]} />
          <View style={styles.agenticApprovalFacts}>
            <View style={styles.flex}>
              <Text style={[styles.agenticApprovalFactLabel, { color: tokens.muted }]}>{language === 'vi' ? 'Thay đổi chi phí' : 'Cost change'}</Text>
              <Text style={[styles.agenticApprovalFactValue, { color: tokens.primary }]}>{scopeChangeAmountLabel(scopeChange, language)}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={[styles.agenticApprovalFactLabel, { color: tokens.muted }]}>{language === 'vi' ? 'Kael đánh giá' : 'Kael review'}</Text>
              <Text style={[styles.agenticApprovalFactValue, { color: tokens.text }]}>{approvalConfidenceLabel(scopeChange, deal, language)}</Text>
            </View>
          </View>
          <Text numberOfLines={3} style={[styles.agenticApprovalReason, { color: tokens.muted }]}>{scopeChange.reason ?? copy.dataPending}</Text>
          <View style={styles.agenticApprovalActions}>
            <KaelButton
              label={language === 'vi' ? 'Không duyệt' : 'Do not approve'}
              onPress={() => onReject(scopeChange.id)}
              style={styles.agenticCommandButton}
              testID="customer-v21-agentic-reject-scope"
              variant="secondary"
            />
            <KaelButton
              label={scopeChangeApproveLabel(scopeChange, language)}
              onPress={() => onApprove(scopeChange.id)}
              style={styles.agenticCommandButton}
              testID="customer-v21-agentic-approve-scope"
            />
          </View>
        </V21Card>

      <SectionActionHeader
        action={language === 'vi' ? `${formatNumber(processedRows.filter((row) => row.available).length, language)} quyết định` : `${formatNumber(processedRows.filter((row) => row.available).length, language)} decisions`}
        title={language === 'vi' ? 'Đã xử lý' : 'Processed'}
      />
      <V21Card style={styles.agenticProcessedCard} testID="customer-v21-agentic-processed-approvals">
        <SourceCardSkin />
        <CaseWideMintAura scope="AgenticProcessedWide" testID="customer-v21-agentic-processed-wide-mint-aura" />
        <CaseWideMintAura scope="AgenticProcessed" testID="customer-v21-agentic-processed-mint-aura" />
        {processedRows.map((row, index) => (
          <Fragment key={row.title}>
            {index > 0 ? <MemoryDivider /> : null}
            <AgenticProcessedApprovalRow {...row} />
          </Fragment>
        ))}
      </V21Card>
    </View>
  )
}

function AgenticProcessedApprovalRow({
  available,
  body,
  image,
  status,
  title,
}: {
  available: boolean
  body: string
  image: ImageSourcePropType
  status: string
  title: string
}) {
  const { tokens } = useV21Theme()
  return (
    <View style={styles.agenticProcessedRow}>
      <AssetTile image={image} label={title} size={48} sourceAura style={styles.agenticUtilityIcon} />
      <View style={styles.flex}>
        <Text numberOfLines={1} style={[styles.cardTitle, { color: tokens.text }]}>{title}</Text>
        <Text numberOfLines={1} style={[styles.bodyText, { color: tokens.muted }]}>{body}</Text>
      </View>
      <MatchingHandoffChip label={status} style={styles.agenticProcessedStatusChip} tone={available ? 'success' : 'selected'} />
    </View>
  )
}

function AgenticMemoryStage({
  memory,
  memoryRows,
}: {
  memory: unknown
  memoryRows: AgenticMemoryRowModel[]
}) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const { actions } = useFrontendWorkflow()
  const copy = customerV21CommonCopy[language]
  const [pendingPreferenceKey, setPendingPreferenceKey] = useState<CustomerKaelMemoryPreferenceKey | null>(null)
  const [optimisticMemoryPreferences, setOptimisticMemoryPreferences] = useState<Partial<Record<CustomerKaelMemoryPreferenceKey, boolean>>>({})
  useEffect(() => {
    setOptimisticMemoryPreferences({})
  }, [memory])
  const visibleMemoryRows = useMemo(() => memoryRows.map((row) => ({
    ...row,
    enabled: optimisticMemoryPreferences[row.preferenceKey] ?? row.enabled,
  })), [memoryRows, optimisticMemoryPreferences])
  const sharePreferencesEnabled = optimisticMemoryPreferences.share_preferences_with_worker
    ?? agenticBooleanFromMemory(memory, 'share_preferences_with_worker')
  const visibleMemoryCount = visibleMemoryRows.filter((row) => row.enabled).length
  const handleSaveMemory = () => {
    void actions.refreshCustomerKaelMemory()
  }
  const handleToggleMemoryPreference = async (key: CustomerKaelMemoryPreferenceKey, currentEnabled: boolean) => {
    const nextEnabled = !currentEnabled
    setOptimisticMemoryPreferences((current) => ({ ...current, [key]: nextEnabled }))
    setPendingPreferenceKey(key)
    let result: MemoryPreferenceActionResult = false
    try {
      result = await actions.updateCustomerKaelMemoryPreference({ key, enabled: nextEnabled })
    } catch {
      result = false
    }
    setPendingPreferenceKey(null)
    if (!memoryPreferenceActionSucceeded(result)) {
      setOptimisticMemoryPreferences((current) => ({ ...current, [key]: currentEnabled }))
      Alert.alert(
        language === 'vi' ? 'Chưa lưu được' : 'Not saved',
        language === 'vi' ? 'Vui lòng thử lại sau.' : 'Please try again later.',
      )
    }
  }

  return (
    <View style={styles.agenticStageStack} testID="customer-v21-profile-memory">
      <AgenticStageBackdropAura scope="Memory" />
      <AgenticStageHero
        body=""
        image={customerV21Assets.memory}
        pill={language === 'vi' ? `${formatNumber(visibleMemoryCount, language)} MỤC GHI NHỚ` : `${formatNumber(visibleMemoryCount, language)} MEMORY ITEMS`}
        scope="AgenticMemoryHero"
        testID="customer-v21-agentic-memory-hero"
        title={language === 'vi' ? 'Kael nhớ về bạn,\ntheo quyền bạn cho.' : 'Kael remembers you\nwith your permission.'}
      />

      <SectionActionHeader
        action={language === 'vi' ? 'Chỉnh sửa' : 'Edit'}
        title={language === 'vi' ? 'Thông tin được phép dùng' : 'Allowed information'}
      />
      <V21Card style={styles.agenticMemoryListCard} testID="customer-v21-agentic-memory-allowed">
        <SourceCardSkin />
        <CaseWideMintAura scope="AgenticMemoryAllowedWide" testID="customer-v21-agentic-memory-allowed-wide-mint-aura" />
        <CaseWorkCardAura scope="AgenticMemoryAllowed" testID="customer-v21-agentic-memory-allowed-mint-aura" />
        {visibleMemoryRows.map((row, index) => (
          <Fragment key={row.label}>
            {index > 0 ? <MemoryDivider /> : null}
            <MemoryPermissionRow
              enabled={row.enabled}
              image={row.image}
              label={row.label}
              onToggle={() => void handleToggleMemoryPreference(row.preferenceKey, row.enabled)}
              pending={pendingPreferenceKey === row.preferenceKey}
              preferenceKey={row.preferenceKey}
              value={row.value}
            />
          </Fragment>
        ))}
      </V21Card>

      <SectionActionHeader
        action={language === 'vi' ? 'Quyền riêng tư ›' : 'Privacy ›'}
        title={language === 'vi' ? 'Ranh giới dữ liệu' : 'Data boundaries'}
      />
      <V21Card style={styles.agenticMemoryListCard} testID="customer-v21-agentic-memory-boundaries">
        <SourceCardSkin />
        <CaseWideMintAura scope="AgenticMemoryBoundaryWide" testID="customer-v21-agentic-memory-boundary-wide-mint-aura" />
        <CaseWorkCardAura scope="AgenticMemoryBoundary" testID="customer-v21-agentic-memory-boundary-mint-aura" />
        <MemoryPermissionRow
          control="chip"
          enabled
          image={customerV21Assets.privacy}
          label={language === 'vi' ? 'Không trộn trò chuyện thường vào công việc' : 'Do not mix normal chat into jobs'}
          statusLabel={language === 'vi' ? 'Bật' : 'On'}
          value={language === 'vi' ? 'Chỉ dữ liệu được chọn mới thành bằng chứng' : 'Only selected data becomes evidence'}
        />
        <MemoryDivider />
        <MemoryPermissionRow
          enabled={sharePreferencesEnabled}
          image={customerV21Assets.profile}
          label={language === 'vi' ? 'Chia sẻ sở thích với thợ' : 'Share preferences with worker'}
          onToggle={() => void handleToggleMemoryPreference(
            'share_preferences_with_worker',
            sharePreferencesEnabled,
          )}
          pending={pendingPreferenceKey === 'share_preferences_with_worker'}
          preferenceKey="share_preferences_with_worker"
          value={language === 'vi' ? 'Chỉ sau khi bạn đồng ý cho từng công việc' : 'Only after you approve each job'}
        />
        <MemoryDivider />
        <MemoryPermissionRow
          control="chip"
          enabled
          image={customerV21Assets.shield}
          label={language === 'vi' ? 'Cảnh báo thanh toán ngoài nền tảng' : 'Off-platform payment warning'}
          statusLabel={language === 'vi' ? 'Bật' : 'On'}
          value={language === 'vi' ? 'Luôn nhắc để bảo vệ quyền lợi' : 'Always reminds you to stay protected'}
        />
      </V21Card>
      <KaelButton
        label={language === 'vi' ? 'Lưu thay đổi' : 'Save changes'}
        onPress={handleSaveMemory}
        style={styles.agenticMemorySaveButton}
        testID="customer-v21-agentic-memory-save"
      />
      <Text style={[styles.agenticMemoryNote, { color: tokens.muted }]}>
        {language === 'vi'
          ? 'Bộ nhớ chỉ hỗ trợ Kael. Nó không tự vượt qua cổng phê duyệt.'
          : 'Memory only supports Kael. It cannot bypass approval gates.'}
      </Text>
    </View>
  )
}

function MemoryDivider() {
  const { tokens } = useV21Theme()
  return <View style={[styles.memoryDivider, { backgroundColor: tokens.border }]} />
}

function AgenticUtilityStack({ deal, memoryCount }: { deal: LocalDeal | null; memoryCount: number }) {
  const language = useAppLanguage()
  const router = useRouter()
  const copy = customerV21CommonCopy[language]
  const commandCenterLabel = language === 'vi' ? 'Trung tâm điều phối' : customerV21ScreenTitles[language]['5.2-command-center']
  return (
    <>
      <SectionActionHeader
        action={language === 'vi' ? 'Tiện ích' : 'Utilities'}
        title={language === 'vi' ? 'Màn hình điều phối' : 'Coordination screens'}
      />
      <View style={styles.agenticUtilityGrid} testID="customer-v21-agentic-utility-stack">
        <AgenticUtilityCard
          image={customerV21Assets.activity}
          label={commandCenterLabel}
          onPress={() => router.replace('/(customer)/profile?screen=5.2-command-center' as never)}
          testID="customer-v21-agentic-card-5.2-command-center"
          value={deal ? `${caseDisplayCode(deal, language)} · ${customerV21StatusCopy[language][deal.status]}` : copy.dataPending}
        />
        <AgenticUtilityCard
          image={customerV21Assets.shield}
          label={customerV21ScreenTitles[language]['5.3-approval-queue']}
          onPress={() => router.replace('/(customer)/profile?screen=5.3-approval-queue' as never)}
          testID="customer-v21-agentic-card-5.3-approval-queue"
          value={deal?.scopeChange ? (language === 'vi' ? '1 việc cần duyệt' : '1 approval') : '0'}
        />
        <AgenticUtilityCard
          image={customerV21Assets.memory}
          label={customerV21ScreenTitles[language]['5.4-memory']}
          onPress={() => router.replace('/(customer)/profile?screen=5.4-memory' as never)}
          testID="customer-v21-agentic-card-5.4-memory"
          value={formatNumber(memoryCount, language)}
        />
      </View>
    </>
  )
}

function AgenticUtilityCard({
  image,
  label,
  onPress,
  testID,
  value,
}: {
  image: ImageSourcePropType
  label: string
  onPress?: () => void
  testID?: string
  value: string
}) {
  const { tokens } = useV21Theme()
  const content = (
    <>
      <CaseWideMintAura scope={`AgenticUtility${label.replace(/[^a-zA-Z0-9]/g, '')}`} />
      <AssetTile image={image} label={label} size={38} sourceAura style={styles.agenticUtilityIcon} />
      <View style={styles.flex}>
        <Text style={[styles.cardTitle, { color: tokens.text }]}>{label}</Text>
        <Text numberOfLines={2} style={[styles.bodyText, { color: tokens.muted }]}>{value}</Text>
      </View>
      {onPress ? <Text style={[styles.sectionActionText, { color: tokens.primary }]}>›</Text> : null}
    </>
  )
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={[styles.agenticUtilityCard, { backgroundColor: tokens.raised, borderColor: tokens.border }]} testID={testID}>
        {content}
      </Pressable>
    )
  }
  return <View style={[styles.agenticUtilityCard, { backgroundColor: tokens.raised, borderColor: tokens.border }]} testID={testID}>{content}</View>
}

export function KaelChatSurface() {
  const language = useAppLanguage()
  const params = useLocalSearchParams<{ focus?: string | string[]; jobId?: string | string[]; mode?: string | string[]; screen?: string | string[]; sessionId?: string | string[]; service?: string | string[] }>()
  const router = useRouter()
  const workflow = useFrontendWorkflow()
  const { session } = useAuth()
  const sessionAccessToken = session?.access_token
  const { reduceMotion, reduceTransparency, tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const timelineHeadline = useKaelTimelineHeadline(language)
  const [pendingDraft, setPendingDraftState] = useState(() => peekPendingKaelChatDraft())
  const [routeDraftEvidencePending, setRouteDraftEvidencePending] = useState(() => Boolean(peekPendingKaelChatDraft()))
  const routeModeParam = firstParam(params.mode)
  const explicitRouteMode: CustomerKaelMode | null = routeModeParam === 'case'
    ? 'case'
    : routeModeParam === 'normal'
      ? 'normal'
      : null
  const routeMode = explicitRouteMode ?? chatScreenModeParam(firstParam(params.screen)) ?? 'normal'
  const routeJobId = cleanRouteJobId(firstParam(params.jobId))
  const routeFocus = firstParam(params.focus)
  const caseFocus = routeFocus === 'payment' || routeFocus === 'approval' ? routeFocus : null
  const workflowDeal = workflow.state.deal
  const deal = isRealCaseDeal(workflowDeal) ? workflowDeal : null
  const caseServiceLabel = deal?.draft.serviceType ? customerV21ServiceCopy[language][deal.draft.serviceType].label : null
  const routeDerivedMode: CustomerKaelMode = routeMode === 'case' || routeJobId || pendingDraft ? 'case' : 'normal'
  const [localMode, setLocalMode] = useState<CustomerKaelMode>(routeDerivedMode)
  const [modeMenuOpen, setModeMenuOpen] = useState(false)
  const mode: CustomerKaelMode = localMode
  const [selectedService, setSelectedService] = useState<ServiceType | null>(pendingDraft?.serviceType ?? deal?.draft.serviceType ?? serviceParam(firstParam(params.service)))
  const [draft, setDraft] = useState('')
  const [chat, setChat] = useState<KaelChatResponse | null>(null)
  const [turns, setTurns] = useState<KaelChatTurn[]>([])
  const [assistantTurns, setAssistantTurns] = useState<CustomerAssistantLocalTurn[]>([])
  const [loading, setLoading] = useState(false)
  const [hydratingCase, setHydratingCase] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [composerMediaDrafts, setComposerMediaDrafts] = useState<LocalMediaUploadDraft[]>(() => pendingDraft?.photoDrafts ? [...pendingDraft.photoDrafts] : [])
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const [caseEditOpen, setCaseEditOpen] = useState(false)
  const [confirmingAgenticEstimate, setConfirmingAgenticEstimate] = useState(false)
  const [confirmingCaseQuote, setConfirmingCaseQuote] = useState(false)
  const [caseQuoteRejectOpen, setCaseQuoteRejectOpen] = useState(false)
  const [caseQuoteRejectReason, setCaseQuoteRejectReason] = useState('')
  const [caseOptionsAcknowledged, setCaseOptionsAcknowledged] = useState(false)
  const [caseEvidenceAcknowledged, setCaseEvidenceAcknowledged] = useState(false)
  const [caseEvidenceRejectOpen, setCaseEvidenceRejectOpen] = useState(false)
  const [caseEvidenceReason, setCaseEvidenceReason] = useState('')
  const [submittingCaseEvidence, setSubmittingCaseEvidence] = useState(false)
  const [submittingCaseQuoteRejectReason, setSubmittingCaseQuoteRejectReason] = useState(false)
  const [agenticRejectOpen, setAgenticRejectOpen] = useState(false)
  const [agenticRejectReason, setAgenticRejectReason] = useState('')
  const [submittingAgenticRejectReason, setSubmittingAgenticRejectReason] = useState(false)
  const [agenticEvidenceRejectOpen, setAgenticEvidenceRejectOpen] = useState(false)
  const [agenticEvidenceReason, setAgenticEvidenceReason] = useState('')
  const [submittingAgenticEvidence, setSubmittingAgenticEvidence] = useState(false)
  const [processLines, setProcessLines] = useState<KaelProcessLineRuntime | null>(null)
  const modeMenuOpacity = useSharedValue(0)
  const modeMenuScale = useSharedValue(0.96)
  const modeMenuSheenOpacity = useSharedValue(0)
  const modeMenuSheenX = useSharedValue(-92)
  const modeMenuTranslateY = useSharedValue(-6)
  const processLineTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const processLineRunRef = useRef(0)
  const processLineWaitersRef = useRef<Array<() => void>>([])

  const clearProcessLineTimers = () => {
    processLineTimersRef.current.forEach((timer) => clearTimeout(timer))
    processLineTimersRef.current = []
  }

  const resolveProcessLineWaiters = () => {
    const waiters = processLineWaitersRef.current
    processLineWaitersRef.current = []
    waiters.forEach((resolve) => resolve())
  }

  const stopProcessLines = () => {
    processLineRunRef.current += 1
    clearProcessLineTimers()
    resolveProcessLineWaiters()
    setProcessLines(null)
  }

  const startProcessLines = (prompt: string, options: {
    complexity?: string | null
    mediaCount?: number
    mode: CustomerKaelMode
    serviceType?: ServiceType | null
  }) => {
    const safePrompt = prompt.trim() || (language === 'vi' ? 'Đã gửi ảnh/video.' : 'Sent media.')
    const serviceType = options.serviceType ?? deal?.draft.serviceType ?? selectedService
    const sequence = buildKaelProcessSequence({
      caseId: deal ? caseDisplayCode(deal, language) : null,
      complexity: options.complexity ?? deal?.estimate?.complexity ?? null,
      distance: deal?.broadcast?.generalArea ?? deal?.draft.districtLabel ?? null,
      hasRealCase: Boolean(deal),
      jobType: serviceType ? customerV21ServiceCopy[language][serviceType].label : caseServiceLabel,
      language,
      mediaCount: options.mediaCount ?? 0,
      message: safePrompt,
      mode: options.mode,
    })
    const runId = processLineRunRef.current + 1
    processLineRunRef.current = runId
    clearProcessLineTimers()
    resolveProcessLineWaiters()
    setProcessLines({
      activeIndex: sequence.lines.length > 0 ? 0 : null,
      collapse: null,
      lines: sequence.lines,
      prompt: safePrompt,
      scenarioId: sequence.scenarioId,
      visibleCount: sequence.lines.length > 0 ? 1 : 0,
    })

    let elapsedMs = 0
    sequence.lines.forEach((line, index) => {
      elapsedMs += line.durationMs
      const nextIndex = index + 1
      processLineTimersRef.current.push(setTimeout(() => {
        if (processLineRunRef.current !== runId) return
        if (nextIndex < sequence.lines.length) {
          setProcessLines((current) => current ? {
            ...current,
            activeIndex: nextIndex,
            visibleCount: Math.max(current.visibleCount, nextIndex + 1),
          } : current)
          return
        }
        setProcessLines((current) => current ? {
          ...current,
          activeIndex: null,
          collapse: sequence.collapse,
          visibleCount: sequence.lines.length,
        } : current)
      }, elapsedMs))
    })
    return new Promise<void>((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        processLineWaitersRef.current = processLineWaitersRef.current.filter((waiter) => waiter !== finish)
        resolve()
      }
      processLineWaitersRef.current.push(finish)
      processLineTimersRef.current.push(setTimeout(() => {
        if (processLineRunRef.current !== runId) return
        finish()
      }, elapsedMs + kaelProcessAnswerSettleMs))
    })
  }

  useEffect(() => {
    return () => {
      processLineRunRef.current += 1
      clearProcessLineTimers()
      resolveProcessLineWaiters()
    }
  }, [])

  useEffect(() => {
    if (routeDerivedMode === 'case') {
      setLocalMode('case')
      return
    }
    if (explicitRouteMode === 'normal') {
      setLocalMode('normal')
    }
  }, [explicitRouteMode, routeDerivedMode])

  const pendingDraftReadKey = `${routeMode}:${routeJobId ?? ''}:${firstParam(params.sessionId) ?? ''}`

  useEffect(() => {
    if (pendingDraft) return
    let cancelled = false
    readPendingKaelChatDraft().then((draft) => {
      if (cancelled || !draft) return
      setPendingDraftState(draft)
      setRouteDraftEvidencePending(true)
      setSelectedService(draft.serviceType)
      setComposerMediaDrafts(draft.photoDrafts ? [...draft.photoDrafts] : [])
      setLocalMode('case')
    }).catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [pendingDraft, pendingDraftReadKey])

  useEffect(() => {
    if (mode !== 'normal') return
    setError((current) => (current === 'Chọn dịch vụ.' || current === 'Choose a service.' ? null : current))
  }, [mode])

  useEffect(() => {
    if (deal?.status === 'awaiting_customer_confirm') return
    setCaseOptionsAcknowledged(false)
  }, [deal?.id, deal?.status])

  useEffect(() => {
    setCaseEvidenceRejectOpen(false)
    setCaseEvidenceReason('')
    setSubmittingCaseEvidence(false)
    if (!deal || (deal.draft.mediaCount ?? 0) > 0) {
      setCaseEvidenceAcknowledged(false)
    }
  }, [deal?.id, deal?.draft.mediaCount])

  useEffect(() => {
    if (mode !== 'case' || !routeJobId || deal?.id === routeJobId) return
    if (typeof workflow.actions.hydrateRemoteJobById !== 'function') return
    let cancelled = false
    setHydratingCase(true)
    workflow.actions.hydrateRemoteJobById(routeJobId)
      .then((ok) => {
        if (!cancelled && !ok) {
          setError(language === 'vi' ? 'Chưa có công việc thật.' : 'No job yet.')
        }
      })
      .finally(() => {
        if (!cancelled) setHydratingCase(false)
      })
    return () => {
      cancelled = true
    }
  }, [deal?.id, language, mode, routeJobId, workflow.actions])

  useEffect(() => {
    let cancelled = false
    const sessionId = firstParam(params.sessionId)
    if (sessionId) {
      setLoading(true)
      kaelChatService.get(sessionId)
        .then((result) => {
          if (cancelled) return
          if (result.success) {
            setChat(result.data)
            setTurns(result.data.turns)
            setSelectedService(result.data.session.service_type)
          } else {
            setError(result.error)
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
      return () => {
        cancelled = true
      }
    }

    if (pendingDraft?.serviceType && sessionAccessToken) {
      const pendingDraftDescription = pendingDraft.description?.trim() || pendingDraft.message
      setLoading(true)
      kaelChatService.create({
        address_district: pendingDraft.districtLabel ?? undefined,
        address_label: pendingDraft.addressLabel,
        client_request_id: pendingDraft.clientRequestId ?? generateClientRequestId(),
        defer_analysis: true,
        message: pendingDraftDescription,
        problem_chips: pendingDraft.problemChips ?? [],
        photo_urls: [],
        service_type: pendingDraft.serviceType,
      })
        .then((result) => {
          if (cancelled) return
          if (result.success) {
            const createdSession = result.data.session
            const createdHasStructuredOutcome = Boolean(
              createdSession.estimate ||
              createdSession.job_id ||
              createdSession.status === 'estimate_ready' ||
              createdSession.status === 'confirmed' ||
              createdSession.next_action === 'estimate_ready' ||
              createdSession.next_action === 'confirmed',
            )
            if (createdHasStructuredOutcome) {
              clearPendingKaelChatDraft()
              setRouteDraftEvidencePending(false)
            } else {
              setRouteDraftEvidencePending(true)
            }
            setChat(result.data)
            setTurns(result.data.turns)
            setSelectedService(result.data.session.service_type)
          } else {
            setError(result.error)
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }
    return () => {
      cancelled = true
    }
  }, [params.sessionId, pendingDraft, sessionAccessToken])

  const pickComposerMedia = async () => {
    if (mode === 'case' && !caseEvidenceGateActive && !agenticEvidenceGateActive) return
    if (mode !== 'normal' && mode !== 'case') return
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert(
        language === 'vi' ? 'Cần quyền ảnh/video' : 'Media permission needed',
        language === 'vi' ? 'Cho phép NestScout chọn ảnh hoặc video để gửi cho Kael.' : 'Allow NestScout to pick photos or videos for Kael.',
      )
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: chatComposerMediaTypes,
      quality: 0.86,
      selectionLimit: Math.max(1, 5 - composerMediaDrafts.length),
    })
    if (result.canceled) return
    const drafts: LocalMediaUploadDraft[] = result.assets.map((asset) => ({
      uri: asset.uri,
      type: mediaDraftTypeFromPickerAsset(asset),
      fileName: asset.fileName ?? asset.uri.split('/').pop(),
      mimeType: asset.mimeType ?? undefined,
      fileSizeBytes: asset.fileSize ?? undefined,
    }))
    setComposerMediaDrafts((current) => mergeMediaDrafts(current, drafts, 5))
    setError(null)
  }

  const submitAgenticEvidence = async (decision: 'confirmed' | 'skipped') => {
    if (!chat?.session.id || submittingAgenticEvidence) return
    if (decision === 'confirmed' && composerMediaDrafts.length === 0) {
      setError(language === 'vi' ? 'Thêm ảnh, video hoặc ghi âm trước khi xác nhận.' : 'Add media before confirming.')
      return
    }
    setSubmittingAgenticEvidence(true)
    setLoading(true)
    setError(null)
    let photoUrls: string[] = []
    let mediaRefs: string[] = []
    try {
      if (decision === 'confirmed') {
        setUploadingMedia(true)
        const uploaded = await uploadKaelChatMediaDrafts(composerMediaDrafts)
        setUploadingMedia(false)
        if (!uploaded.success) {
          setError(uploaded.error)
          return
        }
        photoUrls = uploaded.urls
        mediaRefs = uploaded.mediaRefs ?? []
      }
      const firstCustomerMessage = turns.find((turn) => turn.role === 'customer' && turn.text_content)?.text_content ?? null
      const sourceMessage = pendingDraft?.description?.trim() || pendingDraft?.message || firstCustomerMessage || (language === 'vi' ? 'Khách đã gửi ngữ cảnh dịch vụ.' : 'Customer sent service context.')
      const processPrompt = decision === 'confirmed'
        ? (language === 'vi' ? 'Đã gửi bằng chứng hiện trạng.' : 'Sent current evidence.')
        : (language === 'vi' ? 'Tiếp tục không có bằng chứng.' : 'Continue without evidence.')
      const processDone = startProcessLines(processPrompt, {
        complexity: null,
        mediaCount: photoUrls.length + mediaRefs.length,
        mode: mode === 'case' ? 'case' : 'normal',
        serviceType: selectedService ?? chat.session.service_type,
      })
      const result = await kaelChatService.submitEvidence(chat.session.id, {
        decision,
        message: sourceMessage,
        photo_urls: photoUrls,
        media_refs: mediaRefs,
        problem_chips: pendingDraft?.problemChips ?? [],
        skip_reason: decision === 'skipped' ? agenticEvidenceReason.trim() || undefined : undefined,
      })
      if (result.success) {
        await processDone
        stopProcessLines()
        clearPendingKaelChatDraft()
        setRouteDraftEvidencePending(false)
        setChat(result.data)
        setTurns(result.data.turns)
        setComposerMediaDrafts([])
        setAgenticEvidenceRejectOpen(false)
        setAgenticEvidenceReason('')
      } else if (shouldUseLegacyKaelEvidenceFallback(result, photoUrls)) {
        const legacy = await kaelChatService.sendTurn(chat.session.id, {
          address_district: pendingDraft?.districtLabel ?? undefined,
          address_label: pendingDraft?.addressLabel,
          message: processPrompt,
          photo_urls: photoUrls,
          problem_chips: pendingDraft?.problemChips ?? [],
        })
        if (legacy.success) {
          await processDone
          stopProcessLines()
          clearPendingKaelChatDraft()
          setRouteDraftEvidencePending(false)
          setChat(legacy.data)
          setTurns(legacy.data.turns)
          setComposerMediaDrafts([])
          setAgenticEvidenceRejectOpen(false)
          setAgenticEvidenceReason('')
        } else {
          stopProcessLines()
          setError(legacy.error)
        }
      } else {
        stopProcessLines()
        setError(result.error)
      }
    } finally {
      setUploadingMedia(false)
      setSubmittingAgenticEvidence(false)
      setLoading(false)
    }
  }

  const submitCaseEvidence = async (decision: 'confirmed' | 'skipped') => {
    if (!deal?.id || submittingCaseEvidence) return
    if (decision === 'confirmed' && composerMediaDrafts.length === 0) {
      setError(language === 'vi' ? 'Thêm ảnh, video hoặc ghi âm trước khi xác nhận.' : 'Add media before confirming.')
      return
    }
    setSubmittingCaseEvidence(true)
    setLoading(true)
    setError(null)
    const prompt = decision === 'confirmed'
      ? (language === 'vi' ? 'Đã gửi hiện trạng cho công việc.' : 'Sent current evidence for this job.')
      : (language === 'vi' ? 'Tiếp tục không có bằng chứng hiện trạng.' : 'Continue without current evidence.')
    const processDone = startProcessLines(prompt, {
      complexity: deal.estimate?.complexity ?? null,
      mediaCount: decision === 'confirmed' ? composerMediaDrafts.length : 0,
      mode: 'case',
      serviceType: deal.draft.serviceType,
    })
    try {
      if (decision === 'confirmed') {
        setUploadingMedia(true)
        const uploaded = await uploadJobMediaDrafts(deal.id, composerMediaDrafts, 'before')
        setUploadingMedia(false)
        if (!uploaded.success) {
          stopProcessLines()
          setError(uploaded.error)
          return
        }
      }
      if (typeof workflow.actions.hydrateRemoteJobById === 'function') {
        await workflow.actions.hydrateRemoteJobById(deal.id)
      }
      await processDone
      setCaseEvidenceAcknowledged(true)
      setCaseEvidenceRejectOpen(false)
      setCaseEvidenceReason('')
      setComposerMediaDrafts([])
    } finally {
      setUploadingMedia(false)
      setSubmittingCaseEvidence(false)
      setLoading(false)
      stopProcessLines()
    }
  }

  const sendMessage = async () => {
    const message = draft.trim()
    const hasComposerMedia = composerMediaDrafts.length > 0
    if (!message && !hasComposerMedia) return
    if (mode === 'case') {
      if (hasComposerMedia) {
        setError(language === 'vi' ? 'Ảnh/video cần gửi qua công việc thật.' : 'Media requires a real job.')
        return
      }
      if (!deal?.id) {
        setError(language === 'vi' ? 'Chưa có' : 'Empty')
        return
      }
      const processDone = startProcessLines(message, {
        complexity: deal.estimate?.complexity ?? null,
        mediaCount: deal.draft.mediaCount ?? 0,
        mode: 'case',
        serviceType: deal.draft.serviceType,
      })
      setLoading(true)
      setError(null)
      try {
        const result = await kaelAssistantService.ask({
          job_id: deal.id,
          language,
          message,
          surface: 'customer_case',
        })
        if (result.success) {
          await processDone
          setAssistantTurns((current) => [
            ...current,
            {
              id: makeAssistantTurnId('customer_case', 'customer'),
              role: 'customer',
              surface: 'customer_case',
              text_content: message,
            },
            {
              id: makeAssistantTurnId('customer_case', 'kael'),
              role: 'kael',
              surface: 'customer_case',
              text_content: formatAssistantAnswer(result.data, language),
            },
          ])
          setDraft('')
        } else if (shouldFallbackCaseAssistantToJobChat(result)) {
          const stored = await jobService.sendMessage(deal.id, { content: message })
          if (stored.success) {
            await processDone
            setAssistantTurns((current) => [
              ...current,
              {
                id: makeAssistantTurnId('customer_case', 'customer'),
                role: 'customer',
                surface: 'customer_case',
                text_content: message,
              },
            ])
            setDraft('')
          } else {
            setError(stored.error)
          }
        } else {
          setError(result.error)
        }
      } finally {
        setLoading(false)
        stopProcessLines()
      }
      return
    }
    const intakeIntent = isLikelyKaelIntakeRequest(message)
    const inferredDraft = selectedService ? null : inferLocalDealDraftFromKael(message)
    const shouldUseIntake = Boolean(
      hasComposerMedia || pendingDraft || chat || intakeIntent,
    )
    if (!shouldUseIntake) {
      setLoading(true)
      setError(null)
      const processDone = startProcessLines(message, {
        complexity: null,
        mediaCount: 0,
        mode: 'normal',
        serviceType: null,
      })
      try {
        const result = await kaelAssistantService.ask({
          language,
          message,
          surface: 'customer_normal',
        })
        if (result.success) {
          await processDone
          setAssistantTurns((current) => [
            ...current,
            {
              id: makeAssistantTurnId('customer_normal', 'customer'),
              role: 'customer',
              surface: 'customer_normal',
              text_content: message,
            },
            {
              id: makeAssistantTurnId('customer_normal', 'kael'),
              role: 'kael',
              surface: 'customer_normal',
              text_content: formatAssistantAnswer(result.data, language),
            },
          ])
          setDraft('')
        } else {
          setError(result.error)
        }
      } finally {
        setLoading(false)
        stopProcessLines()
      }
      return
    }
    const inferredService = selectedService ?? inferredDraft?.serviceType ?? null
    if (!inferredService) {
      setError(language === 'vi' ? 'Kael cần biết dịch vụ trước khi tạo yêu cầu.' : 'Kael needs a service before creating a request.')
      return
    }
    if (!selectedService && inferredDraft?.serviceType) {
      setSelectedService(inferredDraft.serviceType)
    }
    setLoading(true)
    setError(null)
    if (!chat) {
      const result = await kaelChatService.create({
        client_request_id: generateClientRequestId(),
        defer_analysis: true,
        message: message || (language === 'vi' ? 'Đã thêm bằng chứng hiện trạng.' : 'Added current evidence.'),
        photo_urls: [],
        problem_chips: inferredDraft?.problemChips ?? [],
        service_type: inferredService,
      })
      setLoading(false)
      if (result.success) {
        setChat(result.data)
        setTurns(result.data.turns)
        setDraft('')
        setAgenticRejectOpen(false)
        setAgenticEvidenceRejectOpen(false)
        setAgenticEvidenceReason('')
      } else {
        setError(result.error)
      }
      return
    }
    let photoUrls: string[] = []
    if (hasComposerMedia) {
      setUploadingMedia(true)
      const uploaded = await uploadKaelChatMediaDrafts(composerMediaDrafts)
      setUploadingMedia(false)
      if (!uploaded.success) {
        setLoading(false)
        stopProcessLines()
        setError(uploaded.error)
        return
      }
      photoUrls = uploaded.urls
    }
    const outgoingMessage = message || (language === 'vi' ? 'Đã gửi ảnh/video.' : 'Sent media.')
    const processDone = startProcessLines(outgoingMessage, {
      complexity: null,
      mediaCount: photoUrls.length,
      mode: 'normal',
      serviceType: inferredService,
    })
    const result = chat
      ? await kaelChatService.sendTurn(chat.session.id, { message: outgoingMessage, photo_urls: photoUrls })
      : await kaelChatService.create({
          client_request_id: generateClientRequestId(),
          message: outgoingMessage,
          photo_urls: photoUrls,
          problem_chips: inferredDraft?.problemChips ?? [],
          service_type: inferredService,
        })
    if (result.success) {
      await processDone
      setLoading(false)
      stopProcessLines()
      setChat(result.data)
      setTurns(result.data.turns)
      setDraft('')
      setComposerMediaDrafts([])
      setAgenticRejectOpen(false)
      setAgenticRejectReason('')
    } else {
      setLoading(false)
      stopProcessLines()
      setError(result.error)
    }
  }

  const chatEstimate = chat?.session.estimate ?? turns.find((turn) => turn.estimate)?.estimate ?? null
  const normalVisibleTurns = turns.filter((turn) =>
    turn.content_type !== 'estimate' &&
    !isScriptedKaelAcknowledgementTurn(turn))
  const normalAssistantTurns = assistantTurns.filter((turn) => turn.surface === 'customer_normal')
  const caseAssistantTurns = assistantTurns.filter((turn) => turn.surface === 'customer_case')
  const backendDraftCustomerTurn = routeDraftEvidencePending
    ? normalVisibleTurns.find((turn) => turn.role === 'customer' && turn.text_content?.trim())
    : null
  const pendingDraftMessage = pendingDraft?.message.trim() ?? backendDraftCustomerTurn?.text_content?.trim() ?? ''
  const routeDraftOwnsIntake = Boolean(pendingDraft || routeDraftEvidencePending)
  const hasPendingDraftTurn = pendingDraftMessage.length > 0 &&
    normalVisibleTurns.some((turn) => turn.role === 'customer' && turn.text_content?.trim() === pendingDraftMessage)
  const hasActionableAgenticTurn = normalVisibleTurns.some((turn) =>
    turn.role !== 'customer' &&
    (turn.content_type === 'clarification' ||
      turn.content_type === 'analysis' ||
      turn.content_type === 'error' ||
      turn.content_type === 'photo_request' ||
      turn.content_type === 'video_request'))
  const routeIntakeHasWorkState = Boolean(pendingDraft || chat || loading || normalVisibleTurns.length > 0)
  const workIntakeActive = mode === 'case' && !deal && routeIntakeHasWorkState
  const normalIntakeActive = mode === 'normal' && !routeDraftOwnsIntake && routeIntakeHasWorkState
  const agenticIntakeModeActive = normalIntakeActive || workIntakeActive
  const missingCaseWorkDeal = mode === 'case' && !deal && !workIntakeActive
  const routeDraftHasStructuredOutcome = Boolean(
    chatEstimate ||
    chat?.session.job_id ||
    chat?.session.status === 'estimate_ready' ||
    chat?.session.status === 'confirmed' ||
    chat?.session.next_action === 'estimate_ready' ||
    chat?.session.next_action === 'confirmed',
  )
  const routeDraftAwaitingAgenticStep = workIntakeActive &&
    routeDraftOwnsIntake &&
    !processLines &&
    !routeDraftHasStructuredOutcome &&
    (routeDraftEvidencePending || !chat || chat.session.status === 'collecting_evidence' || !hasActionableAgenticTurn)
  const showPendingDraftBubble = workIntakeActive &&
    pendingDraftMessage.length > 0 &&
    !processLines &&
    (routeDraftOwnsIntake || routeDraftAwaitingAgenticStep || !hasPendingDraftTurn)
  const routeDraftBackendCustomerTurnId = routeDraftOwnsIntake
    ? normalVisibleTurns.find((turn) => turn.role === 'customer')?.id ?? null
    : null
  const agenticVisibleTurns = routeDraftAwaitingAgenticStep
    ? []
    : normalVisibleTurns.filter((turn) => turn.id !== routeDraftBackendCustomerTurnId)
  const showNormalGreeting = mode === 'normal' &&
    !processLines &&
    normalAssistantTurns.length === 0 &&
    (routeDraftOwnsIntake || (!chat && turns.length === 0))
  const caseEvidenceGateActive = mode === 'case' &&
    Boolean(deal) &&
    !processLines &&
    !caseEditOpen &&
    !caseEvidenceAcknowledged &&
    (deal?.draft.mediaCount ?? 0) <= 0 &&
    (deal?.status === 'broadcasting' || deal?.status === 'awaiting_customer_confirm')
  const agenticEvidenceGateActive = agenticIntakeModeActive &&
    !submittingAgenticEvidence &&
    !processLines &&
    (routeDraftAwaitingAgenticStep || chat?.session.status === 'collecting_evidence' || Boolean(routeDraftEvidencePending && !chat && loading))
  const canConfirmAgenticEstimate = agenticIntakeModeActive &&
    Boolean(chat?.session.id && chatEstimate && chatEstimate.confidence >= 0.7 && chat?.session.status === 'estimate_ready' && chat?.session.next_action === 'estimate_ready')
  const agenticEstimateConfirmed = chat?.session.status === 'confirmed' || chat?.session.next_action === 'confirmed' || Boolean(chat?.session.job_id)
  const confirmAgenticEstimate = async () => {
    if (!chat?.session.id || !chatEstimate || confirmingAgenticEstimate) return
    setConfirmingAgenticEstimate(true)
    setAgenticRejectOpen(false)
    setAgenticRejectReason('')
    setError(null)
    const processPrompt = language === 'vi'
      ? 'Đã xác nhận đề xuất. Kael đang mở công việc thật.'
      : 'Estimate confirmed. Kael is opening the real job.'
    const processDone = startProcessLines(processPrompt, {
      complexity: chatEstimate.complexity ?? null,
      mediaCount: totalMediaRefs(turns),
      mode: mode === 'case' ? 'case' : 'normal',
      serviceType: chat.session.service_type,
    })
    try {
      const confirmed = await kaelChatService.confirm(chat.session.id)
      if (!confirmed.success) {
        stopProcessLines()
        setError(confirmed.error)
        return
      }
      await processDone
      const jobId = confirmed.data.job_id
      setChat((current) => current ? {
        ...current,
        session: {
          ...current.session,
          job_id: jobId,
          next_action: 'confirmed',
          status: 'confirmed',
        },
      } : current)
      if (jobId && typeof workflow.actions.hydrateRemoteJobById === 'function') {
        await workflow.actions.hydrateRemoteJobById(jobId)
      }
      if (jobId) {
        setLocalMode('case')
        router.replace(`/(customer)/kael-chat?mode=case&jobId=${encodeURIComponent(jobId)}` as never)
      }
    } finally {
      setConfirmingAgenticEstimate(false)
      stopProcessLines()
    }
  }

  const submitAgenticRejectReason = async () => {
    const reason = agenticRejectReason.trim()
    if (!chat?.session.id || submittingAgenticRejectReason || !reason) return
    setSubmittingAgenticRejectReason(true)
    setLoading(true)
    setError(null)
    const processDone = startProcessLines(reason, {
      complexity: chatEstimate?.complexity ?? null,
      mediaCount: 0,
      mode: 'normal',
      serviceType: chat.session.service_type,
    })
    try {
      const result = await kaelChatService.sendTurn(chat.session.id, {
        message: reason,
        photo_urls: [],
      })
      if (result.success) {
        await processDone
        setChat(result.data)
        setTurns(result.data.turns)
        setAgenticRejectOpen(false)
        setAgenticRejectReason('')
      } else {
        stopProcessLines()
        setError(result.error)
      }
    } finally {
      setSubmittingAgenticRejectReason(false)
      setLoading(false)
      stopProcessLines()
    }
  }

  const confirmCaseQuote = async () => {
    if (!deal?.id || confirmingCaseQuote || typeof workflow.actions.confirmRemoteSearch !== 'function') return
    setConfirmingCaseQuote(true)
    setCaseQuoteRejectOpen(false)
    setCaseQuoteRejectReason('')
    setError(null)
    const processDone = startProcessLines(language === 'vi' ? 'Đã xác nhận báo giá. Kael đang mở bước tiếp theo.' : 'Quote confirmed. Kael is opening the next step.', {
      complexity: deal.estimate?.complexity ?? null,
      mediaCount: deal.draft.mediaCount ?? 0,
      mode: 'case',
      serviceType: deal.draft.serviceType,
    })
    try {
      const confirmed = await workflow.actions.confirmRemoteSearch()
      if (confirmed) {
        await processDone
      } else {
        stopProcessLines()
        setError(language === 'vi' ? 'Chưa đồng bộ' : 'Not synced')
      }
    } finally {
      setConfirmingCaseQuote(false)
      stopProcessLines()
    }
  }

  const submitCaseQuoteRejectReason = async () => {
    const reason = caseQuoteRejectReason.trim()
    if (!deal?.id || submittingCaseQuoteRejectReason || !reason) return
    setSubmittingCaseQuoteRejectReason(true)
    setLoading(true)
    setError(null)
    const processDone = startProcessLines(reason, {
      complexity: deal.estimate?.complexity ?? null,
      mediaCount: deal.draft.mediaCount ?? 0,
      mode: 'case',
      serviceType: deal.draft.serviceType,
    })
    try {
      const result = await kaelAssistantService.ask({
        job_id: deal.id,
        language,
        message: reason,
        surface: 'customer_case',
      })
      if (result.success) {
        await processDone
        setAssistantTurns((current) => [
          ...current,
          {
            id: makeAssistantTurnId('customer_case', 'customer'),
            role: 'customer',
            surface: 'customer_case',
            text_content: reason,
          },
          {
            id: makeAssistantTurnId('customer_case', 'kael'),
            role: 'kael',
            surface: 'customer_case',
            text_content: formatAssistantAnswer(result.data, language),
          },
        ])
        setCaseQuoteRejectOpen(false)
        setCaseQuoteRejectReason('')
        setCaseEditOpen(true)
      } else {
        stopProcessLines()
        setError(result.error)
      }
    } finally {
      setSubmittingCaseQuoteRejectReason(false)
      setLoading(false)
      stopProcessLines()
    }
  }

  const openActivity = () => {
    router.replace('/(customer)/profile?screen=5.2-command-center' as never)
  }

  const normalEvidenceCount = Math.max(pendingDraft?.mediaCount ?? 0, totalMediaRefs(turns))
  const showNormalEvidence = agenticIntakeModeActive && !agenticEvidenceGateActive && !processLines && normalEvidenceCount > 0
  const caseWorkRoute = customerCaseWorkRouteForDeal(deal)
  const switchChatMode = (nextMode: CustomerKaelMode) => {
    setLocalMode(nextMode)
    setModeMenuOpen(false)
    setCaseEditOpen(false)
    setComposerMediaDrafts([])
    setDraft('')
    setError(null)
    setAgenticRejectOpen(false)
    setAgenticRejectReason('')
    setAgenticEvidenceRejectOpen(false)
    setAgenticEvidenceReason('')
    stopProcessLines()
    router.replace(nextMode === 'case' ? caseWorkRoute as never : customerKaelChatRoute as never)
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

  const showCaseConversation = mode === 'case' && Boolean(deal) && (caseEditOpen || caseAssistantTurns.length > 0)
  const showComposer = (mode === 'normal' || mode === 'case') && !agenticEvidenceGateActive
  const canUseComposerMedia = mode === 'normal' || caseEvidenceGateActive || workIntakeActive
  const composerPlaceholder = mode === 'normal' || !deal ? copy.chatPlaceholder : ''
  const composerBusy = loading || uploadingMedia

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: tokens.canvas }]} testID="customer-v21-kael-chat">
      <ChatCanvasAura />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={[styles.chatFrame, mode === 'case' ? styles.caseChatFrame : null]} testID={mode === 'normal' ? 'customer-v21-screen-2.4-chat-normal' : 'customer-v21-screen-2.5-chat-case'}>
          <V21TopBar
            actionAccessibilityLabel={language === 'vi' ? 'Chuyển chế độ chat' : 'Switch chat mode'}
            actionLabel="⇄"
            actionTestID="customer-v21-chat-mode-menu-button"
            onBack={() => router.replace('/(customer)/home' as never)}
            onAction={toggleModeMenu}
            subtitle=""
            title={timelineHeadline}
            titleContainerStyle={styles.chatTopCopyCentered}
            titleStyle={styles.chatTimelineTitle}
          />

          {modeMenuOpen ? (
            <Animated.View style={[styles.modeSwitch, styles.chatModeSwitch, styles.chatModeMenu, { backgroundColor: tokens.ghost, borderColor: 'rgba(255,255,255,0.88)' }, animatedModeMenuStyle]} testID="customer-v21-chat-mode-menu">
              <SourceCardSkin />
              <ChatModeSwitchAura />
              {!reduceMotion && !reduceTransparency ? (
                <Animated.View pointerEvents="none" style={[styles.chatModeMenuSheen, animatedModeMenuSheenStyle]} testID="customer-v21-chat-mode-menu-sheen" />
              ) : null}
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === 'normal' }}
                onPress={() => switchChatMode('normal')}
                style={[
                  styles.modeButton,
                  styles.chatModeButton,
                  styles.chatModeMenuButton,
                  styles.chatModeMenuOption,
                  { backgroundColor: mode === 'normal' ? tokens.raised : 'rgba(255,255,255,0.42)', borderColor: mode === 'normal' ? 'rgba(255,255,255,0.92)' : 'rgba(13,167,151,0.12)' },
                  mode === 'normal' ? styles.chatModeButtonActive : null,
                ]}
                testID="customer-v21-chat-tab-normal"
              >
                <Text style={[styles.modeButtonText, styles.chatModeMenuText, { color: mode === 'normal' ? tokens.primary : tokens.muted }]}>{copy.normalChat}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === 'case' }}
                onPress={() => switchChatMode('case')}
                style={[
                  styles.modeButton,
                  styles.chatModeButton,
                  styles.chatModeMenuButton,
                  styles.chatModeMenuOption,
                  { backgroundColor: mode === 'case' ? tokens.raised : 'rgba(255,255,255,0.42)', borderColor: mode === 'case' ? 'rgba(255,255,255,0.92)' : 'rgba(13,167,151,0.12)' },
                  mode === 'case' ? styles.chatModeButtonActive : null,
                ]}
                testID="customer-v21-chat-tab-case-work"
              >
                <Text style={[styles.modeButtonText, styles.chatModeMenuText, { color: mode === 'case' ? tokens.primary : tokens.muted }]}>{copy.caseWork}</Text>
              </Pressable>
            </Animated.View>
          ) : null}

          <ScrollView
            contentContainerStyle={[styles.chatTranscript, modeMenuOpen ? styles.chatTranscriptMenuOpen : null]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={customerV21HiddenScrollbar}
            testID="customer-v21-kael-thread"
          >
            {showPendingDraftBubble ? (
              <ChatBubble
                role="customer"
                testID="customer-v21-pending-draft-bubble"
                text={pendingDraftMessage}
              />
            ) : null}
            {showNormalGreeting ? (
              <ChatBubble
                role="kael"
                testID="customer-v21-normal-greeting-bubble"
                text={language === 'vi' ? 'Chào bạn, mình là Kael. Bạn muốn hỏi gì hôm nay?' : 'Hi, I am Kael. What would you like to ask today?'}
              />
            ) : null}
            {mode === 'case' && hydratingCase && !deal ? (
              <V21Card style={styles.caseLoadingCard} testID="customer-v21-case-hydrating">
                <ActivityIndicator color={tokens.primary} />
                <Text style={[styles.bodyText, { color: tokens.muted }]}>{language === 'vi' ? 'Đang tải công việc' : 'Loading job'}</Text>
              </V21Card>
            ) : null}
            {mode === 'case' && deal ? (
              <>
                <AgenticCaseThreadPanel deal={deal} editing={caseEditOpen} focus={caseFocus} onApproveScopeChange={(scopeChangeId) => {
                  void workflow.actions.decideScopeChange?.(scopeChangeId, { decision: 'approve' })
                }} onOpenActivity={openActivity} onRejectScopeChange={() => {
                  setCaseEditOpen(true)
                  setError(null)
                  setAssistantTurns((current) => [
                    ...current,
                    {
                      id: makeAssistantTurnId('customer_case', 'kael'),
                      role: 'kael',
                      surface: 'customer_case',
                      text_content: language === 'vi'
                        ? 'B\u1ea1n mu\u1ed1n t\u1eeb ch\u1ed1i v\u00ec l\u00fd do g\u00ec? Kael s\u1ebd ghi l\u1ea1i v\u00e0 ch\u1ec9 \u0111\u1ed5i ph\u1ea1m vi khi b\u1ea1n ch\u1ed1t.'
                        : 'Why do you want to decline? Kael will capture the reason before changing the scope.',
                    },
                  ])
                }} onRequestEdit={() => {
                  setCaseEditOpen(true)
                  setError(null)
                }}
                  caseEvidenceGateActive={caseEvidenceGateActive}
                  caseEvidenceRejectOpen={caseEvidenceRejectOpen}
                  caseEvidenceRejectReason={caseEvidenceReason}
                  caseQuoteRejectOpen={caseQuoteRejectOpen}
                  caseQuoteRejectReason={caseQuoteRejectReason}
                  caseOptionsAcknowledged={caseOptionsAcknowledged}
                  confirmingCaseQuote={confirmingCaseQuote}
                  onAcknowledgeOptions={() => setCaseOptionsAcknowledged(true)}
                  onAddCaseEvidence={pickComposerMedia}
                  onApproveQuote={() => void confirmCaseQuote()}
                  onCaseEvidenceReasonChange={setCaseEvidenceReason}
                  onCaseEvidenceReject={() => {
                    setCaseEvidenceRejectOpen(true)
                    setError(null)
                  }}
                  onCaseEvidenceSkip={() => void submitCaseEvidence('skipped')}
                  onCaseEvidenceSubmit={() => void submitCaseEvidence('confirmed')}
                  onCaseEvidenceVoiceSaved={(mediaDraft) => setComposerMediaDrafts((current) => mergeMediaDrafts(current, [mediaDraft], 5))}
                  onQuoteRejectReasonChange={setCaseQuoteRejectReason}
                  onQuoteRejectReasonSubmit={() => void submitCaseQuoteRejectReason()}
                  onRejectQuote={() => {
                    setCaseQuoteRejectOpen(true)
                    setError(null)
                  }}
                  caseEvidenceDrafts={composerMediaDrafts}
                  submittingCaseEvidence={submittingCaseEvidence || uploadingMedia}
                  submittingCaseQuoteRejectReason={submittingCaseQuoteRejectReason}
                />
              </>
            ) : null}
            {agenticIntakeModeActive && agenticVisibleTurns.length > 0 ? agenticVisibleTurns.map((turn) => (
              <ChatBubble key={turn.id} role={turn.role === 'customer' ? 'customer' : 'kael'} text={turn.text_content ?? copy.dataPending} />
            )) : null}
            {agenticEvidenceGateActive ? (
              <AgenticEvidenceGateCard
                busy={loading || uploadingMedia || submittingAgenticEvidence || !chat?.session.id}
                mediaDrafts={composerMediaDrafts}
                onAddMedia={pickComposerMedia}
                onConfirm={() => void submitAgenticEvidence('confirmed')}
                onReasonChange={setAgenticEvidenceReason}
                onReject={() => {
                  setAgenticEvidenceRejectOpen(true)
                  setError(null)
                }}
                onSkip={() => void submitAgenticEvidence('skipped')}
                onVoiceSaved={(draft) => setComposerMediaDrafts((current) => mergeMediaDrafts(current, [draft], 5))}
                rejectOpen={agenticEvidenceRejectOpen}
                rejectReason={agenticEvidenceReason}
              />
            ) : null}
            {agenticIntakeModeActive && chatEstimate && !processLines && !submittingAgenticRejectReason && !confirmingAgenticEstimate ? (
              <AgenticChatEstimateCard
                canConfirm={canConfirmAgenticEstimate}
                confirming={confirmingAgenticEstimate}
                confirmed={agenticEstimateConfirmed}
                estimate={chatEstimate}
                onConfirm={confirmAgenticEstimate}
                onReject={() => {
                  setAgenticRejectOpen(true)
                  setError(null)
                }}
                onReasonChange={setAgenticRejectReason}
                onSubmitRejectReason={() => void submitAgenticRejectReason()}
                rejected={agenticRejectOpen}
                rejectReason={agenticRejectReason}
                submittingRejectReason={submittingAgenticRejectReason}
              />
            ) : null}
            {mode === 'normal' ? normalAssistantTurns.map((turn) => (
              <ChatBubble key={turn.id} role={turn.role} text={turn.text_content} />
            )) : null}
            {showCaseConversation ? caseAssistantTurns.map((turn) => (
              <ChatBubble key={turn.id} role={turn.role} text={turn.text_content} />
            )) : null}
            {processLines ? (
              <>
                <ChatBubble role="customer" text={processLines.prompt} />
                <KaelProcessLines state={processLines} />
              </>
            ) : null}
            {missingCaseWorkDeal && !hydratingCase ? <InactiveAgenticGate testID="customer-v21-case-work-inactive" /> : null}
          </ScrollView>

          {showNormalEvidence ? <ChatEvidenceStrip mediaCount={normalEvidenceCount} mode={mode} /> : null}
          {error ? <Text style={[styles.errorText, { color: tokens.primary }]} testID="customer-v21-kael-error">{error}</Text> : null}
          {showComposer ? <View style={[styles.composer, styles.chatComposer, { backgroundColor: tokens.raised, borderColor: 'rgba(255,255,255,0.92)' }]}>
            <SourceCardSkin />
            <ChatComposerAura />
            <Pressable
              accessibilityLabel={language === 'vi' ? 'Thêm ảnh hoặc video' : 'Add photo or video'}
              accessibilityRole="button"
              accessibilityState={{ disabled: composerBusy || !canUseComposerMedia }}
              disabled={composerBusy || !canUseComposerMedia}
              onPress={pickComposerMedia}
              style={[styles.chatMediaButton, !canUseComposerMedia ? styles.chatMediaButtonDisabled : null, { backgroundColor: tokens.service, borderColor: tokens.border }]}
              testID="customer-v21-kael-media-picker"
            >
              <ChatMediaCameraIcon color={tokens.primary} />
              {composerMediaDrafts.length > 0 ? (
                <View style={[styles.chatMediaBadge, { backgroundColor: tokens.primary }]} testID="customer-v21-kael-media-count">
                  <Text style={[styles.chatMediaBadgeText, { color: tokens.primaryText }]}>{composerMediaDrafts.length}</Text>
                </View>
              ) : null}
            </Pressable>
            <KaelTextField
              editable={!composerBusy}
              inputShellStyle={styles.composerTextFieldShell}
              onChangeText={setDraft}
              placeholder={composerPlaceholder}
              placeholderTextColor={tokens.subtleText}
              shellStyle={styles.composerTextFieldStack}
              style={[styles.composerInput, customerV21WebTextInputNoOutline, { color: tokens.text }]}
              testID="customer-v21-kael-input"
              value={draft}
            />
            <Pressable
              accessibilityLabel={language === 'vi' ? 'Gửi tin nhắn cho Kael' : 'Send message to Kael'}
              accessibilityRole="button"
              accessibilityState={{ busy: composerBusy, disabled: composerBusy }}
              disabled={composerBusy}
              onPress={sendMessage}
              style={[styles.sendButton, { backgroundColor: tokens.primary }]}
              testID="customer-v21-kael-send"
            >
              {composerBusy ? <ActivityIndicator color={tokens.primaryText} /> : <Text style={[styles.sendText, { color: tokens.primaryText }]}>↑</Text>}
            </Pressable>
          </View> : null}
          {showComposer ? (
            <Text style={[styles.chatComposerDisclaimer, { color: tokens.muted }]} testID="customer-v21-kael-chat-disclaimer">
              {language === 'vi' ? 'Kael có thể mắc lỗi. Hãy kiểm tra các thông tin quan trọng.' : 'Kael can make mistakes. Check important information.'}
            </Text>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

export function CustomerV21DockOverlay({ active }: { active: CustomerDockActive }) {
  const language = useAppLanguage()
  const router = useRouter()
  const { width } = useWindowDimensions()
  const { mode, reduceMotion, reduceTransparency, tokens } = useV21Theme()
  const activeTab = active === 'chat' ? null : active

  const navItems: Array<{ image: ImageSourcePropType; key: CustomerPrimaryTab; route: string }> = [
    { image: customerV21Assets.home, key: 'home', route: '/(customer)/home' },
    { image: customerV21Assets.booking, key: 'services', route: '/(customer)/booking' },
    { image: customerV21Assets.activity, key: 'activity', route: '/(customer)/history' },
    { image: customerV21Assets.profile, key: 'profile', route: '/(customer)/profile' },
  ]
  const liquidNavWidth = Math.min(Math.max(width - CUSTOMER_LIQUID_NAV_SIDE_INSET * 2, 0), CUSTOMER_LIQUID_NAV_MAX_WIDTH)
  const liquidDockWidth = Math.max(liquidNavWidth - CUSTOMER_LIQUID_NAV_ORB_SIZE - CUSTOMER_LIQUID_NAV_GAP, CUSTOMER_LIQUID_NAV_DOCK_HEIGHT)
  const selectedIndex = activeTab ? navItems.findIndex((item) => item.key === activeTab) : -1
  const settledIndex = selectedIndex >= 0 ? selectedIndex : 0
  const lensWidth = Math.max((liquidDockWidth - CUSTOMER_LIQUID_NAV_RAIL_PADDING * 2) / navItems.length, 0)
  const previousIndexRef = useRef(settledIndex)
  const lensX = useSharedValue(settledIndex * lensWidth)
  const lensScaleX = useSharedValue(1)
  const lensScaleY = useSharedValue(1)
  const lensRadius = useSharedValue(24)
  const lensSkew = useSharedValue(0)
  const lensSheenX = useSharedValue(-84)
  const lensSheenOpacity = useSharedValue(0)
  const dockShimmerX = useSharedValue((0.18 + settledIndex * 0.22) * liquidDockWidth)
  const dockCausticX = useSharedValue(settledIndex * lensWidth)
  const orbScale = useSharedValue(1)
  const orbSheenX = useSharedValue(-36)
  const orbSheenOpacity = useSharedValue(0)
  const orbRippleScale = useSharedValue(1)
  const orbRippleOpacity = useSharedValue(0)
  const kaelActive = active === 'chat'
  const dockCausticWidth = Math.min(118, Math.max(lensWidth + 48, 72))
  const dockCausticLeft = (lensWidth - dockCausticWidth) / 2
  const liquidDockStyles = styles as typeof styles & Record<
    | 'dockCaustic'
    | 'dockCausticGlow'
    | 'dockCausticSweep'
    | 'dockCausticSweepBright'
    | 'dockInnerRefraction'
    | 'dockLens'
    | 'dockLensBloom'
    | 'dockLensInnerShadow'
    | 'dockLensSheen'
    | 'dockLensTopLight'
    | 'dockRow'
    | 'dockShimmer'
    | 'kaelAccessoryBackdrop'
    | 'kaelAccessoryCaustic'
    | 'kaelAccessoryFrontRim'
    | 'kaelAccessoryGlint'
    | 'kaelAccessoryGlobeTop'
    | 'kaelAccessoryOrbit',
    ViewStyle
  >
  const liquidOrbStyles = styles as typeof styles & Record<
    | 'kaelAccessoryOrbitBack'
    | 'kaelAccessoryOrbMotion'
    | 'kaelAccessoryPearl'
    | 'kaelAccessoryRipple'
    | 'kaelAccessoryStatus'
    | 'kaelAccessoryStatusHalo'
    | 'kaelAccessoryStatusWave',
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
  }, [dockCausticX, dockShimmerX, lensRadius, lensScaleX, lensScaleY, lensSheenOpacity, lensSheenX, lensSkew, lensWidth, lensX, liquidDockWidth, reduceMotion, settledIndex])

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

    router.replace(customerKaelChatRoute as never)
  }

  return (
    <View pointerEvents="box-none" style={styles.dockOverlay} testID="customer-v21-dock-overlay">
      <View style={[liquidDockStyles.dockRow, { width: liquidNavWidth }]} testID="customer-v21-liquid-navigation">
      <GlassSurface
        backgroundColor={tokens.glass}
        borderColor={tokens.glassBorder}
        material="liquid"
        mode={mode}
        style={[styles.dockPlane, { width: liquidDockWidth }]}
        testID="customer-v21-primary-dock"
        variant="nav"
      >
        <Animated.View pointerEvents="none" style={[liquidDockStyles.dockShimmer, { width: liquidDockWidth * 0.72 }, animatedDockShimmerStyle]} testID="customer-v21-dock-shimmer" />
        <View pointerEvents="none" style={liquidDockStyles.dockCaustic} testID="customer-v21-dock-caustic">
          <Animated.View pointerEvents="none" style={[liquidDockStyles.dockCausticGlow, { left: dockCausticLeft, width: dockCausticWidth }, animatedDockCausticStyle]} testID="customer-v21-dock-caustic-glow" />
          <View pointerEvents="none" style={liquidDockStyles.dockCausticSweep} testID="customer-v21-dock-caustic-sweep" />
          <View pointerEvents="none" style={liquidDockStyles.dockCausticSweepBright} testID="customer-v21-dock-caustic-sweep-bright" />
        </View>
        <View pointerEvents="none" style={liquidDockStyles.dockInnerRefraction} testID="customer-v21-dock-inner-refraction" />
        {selectedIndex >= 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              liquidDockStyles.dockLens,
              animatedLensStyle,
            ]}
            testID="customer-v21-dock-lens"
          >
            <View pointerEvents="none" style={liquidDockStyles.dockLensBloom} testID="customer-v21-dock-lens-bloom" />
            <View pointerEvents="none" style={liquidDockStyles.dockLensTopLight} testID="customer-v21-dock-lens-top-light" />
            <Animated.View pointerEvents="none" style={[liquidDockStyles.dockLensSheen, animatedLensSheenStyle]} testID="customer-v21-dock-lens-sheen" />
            <View pointerEvents="none" style={liquidDockStyles.dockLensInnerShadow} testID="customer-v21-dock-lens-inner-shadow" />
          </Animated.View>
        ) : null}
        {navItems.map((item) => {
          const selected = activeTab === item.key
          return (
            <Pressable
              accessibilityLabel={customerV21TabCopy[language][item.key]}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              key={item.key}
              onPress={() => router.replace(item.route as never)}
              style={({ pressed }) => [styles.dockItem, pressed ? styles.dockItemPressed : null]}
              testID={`customer-v21-dock-${item.key}`}
            >
              <Image resizeMode="contain" source={item.image} style={[styles.dockIcon, selected ? styles.dockIconActive : null]} />
              <Text numberOfLines={1} style={[styles.dockLabel, selected ? styles.dockLabelActive : null, { color: selected ? tokens.primary : tokens.muted }]}>{customerV21TabCopy[language][item.key]}</Text>
            </Pressable>
          )
        })}
      </GlassSurface>
      <Pressable
        accessibilityLabel={customerV21TabCopy[language].kael}
        accessibilityRole="button"
        accessibilityState={{ selected: kaelActive }}
        onPress={openKael}
        style={({ pressed }) => [styles.kaelAccessory, kaelActive ? styles.kaelAccessoryActive : null, pressed ? styles.kaelAccessoryPressed : null]}
        testID="customer-v21-kael-accessory"
      >
        {!reduceTransparency ? <View pointerEvents="none" style={[styles.kaelAccessoryAura, kaelActive ? styles.kaelAccessoryAuraActive : null]} testID="customer-v21-kael-accessory-aura" /> : null}
        <View pointerEvents="none" style={[liquidDockStyles.kaelAccessoryOrbit, liquidOrbStyles.kaelAccessoryOrbitBack, kaelActive ? styles.kaelAccessoryOrbitActive : null]} testID="customer-v21-kael-accessory-orbit-back">
          <View pointerEvents="none" style={liquidOrbStyles.kaelAccessoryPearl} testID="customer-v21-kael-accessory-orbit-back-pearl" />
        </View>
        <View pointerEvents="none" style={[liquidDockStyles.kaelAccessoryOrbit, kaelActive ? styles.kaelAccessoryOrbitActive : null]} testID="customer-v21-kael-accessory-orbit-front">
          <View pointerEvents="none" style={liquidOrbStyles.kaelAccessoryPearl} testID="customer-v21-kael-accessory-orbit-front-pearl" />
        </View>
        <Animated.View pointerEvents="none" style={[liquidOrbStyles.kaelAccessoryRipple, animatedOrbRippleStyle]} testID="customer-v21-kael-accessory-ripple" />
        <Animated.View style={[liquidOrbStyles.kaelAccessoryOrbMotion, animatedOrbStyle]}>
        <GlassSurface
          backgroundColor={tokens.glassStrong}
          borderColor={tokens.glassBorder}
          material="liquid"
          mode={mode}
          style={[styles.kaelAccessoryGlass, kaelActive ? styles.kaelAccessoryGlassActive : null]}
          testID="customer-v21-kael-accessory-glass"
          variant="control"
        >
          <View pointerEvents="none" style={liquidDockStyles.kaelAccessoryBackdrop} testID="customer-v21-kael-accessory-backdrop" />
          <View pointerEvents="none" style={liquidDockStyles.kaelAccessoryCaustic} testID="customer-v21-kael-accessory-caustic" />
          <View pointerEvents="none" style={liquidDockStyles.kaelAccessoryGlobeTop} testID="customer-v21-kael-accessory-globe-top" />
          <Image resizeMode="contain" source={customerV21Assets.kaelNavigation} style={styles.kaelAccessoryImage} />
          <Animated.View pointerEvents="none" style={[liquidDockStyles.kaelAccessoryGlint, animatedOrbSheenStyle]} testID="customer-v21-kael-accessory-glint" />
          <View pointerEvents="none" style={liquidDockStyles.kaelAccessoryFrontRim} testID="customer-v21-kael-accessory-front-rim" />
          <View pointerEvents="none" style={liquidOrbStyles.kaelAccessoryStatusHalo} testID="customer-v21-kael-accessory-status-halo" />
          <View pointerEvents="none" style={liquidOrbStyles.kaelAccessoryStatusWave} testID="customer-v21-kael-accessory-status-wave" />
          <View pointerEvents="none" style={liquidOrbStyles.kaelAccessoryStatus} testID="customer-v21-kael-accessory-status" />
        </GlassSurface>
        </Animated.View>
      </Pressable>
      </View>
    </View>
  )
}

export const CustomerV4DockOverlay = CustomerV21DockOverlay

function ActiveCaseCard({ deal, onOpen }: { deal: LocalDeal; onOpen: () => void }) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const service = deal.draft.serviceType ? customerV21ServiceCopy[language][deal.draft.serviceType].label : copy.dataPending
  return (
    <V21Card style={styles.activeCaseCard} testID="customer-v21-active-case">
      <SourceCardSkin testID="customer-v21-active-case-skin" />
      <CaseWideMintAura intensity="strong" scope="ActiveCase" testID="customer-v21-active-case-mint-aura" />
      <View style={styles.cardHeaderRow}>
        <AssetTile image={customerV21Assets.activity} label={customerV21CommonCopy[language].activeCase} size={50} />
        <View style={styles.flex}>
          <Text style={[styles.cardTitle, { color: tokens.text }]}>{service}</Text>
          <Text style={[styles.bodyText, { color: tokens.muted }]}>{caseDisplayCode(deal, language)}</Text>
        </View>
        <StatusPill status={deal.status} />
      </View>
      <ProgressRail activeStep={stepForStatus(deal.status)} />
      <CaseFactGrid deal={deal} />
      <KaelButton label={language === 'vi' ? 'Xem hoạt động' : 'View activity'} onPress={onOpen} size="small" testID="customer-v21-active-case-open" />
    </V21Card>
  )
}

function StatusPill({ status }: { status: LocalDealStatus | null }) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  return (
    <View style={[styles.statusPill, { backgroundColor: tokens.service }]}>
      <Text numberOfLines={1} style={[styles.statusText, { color: tokens.primary }]}>{customerV21StatusCopy[language][status ?? 'none']}</Text>
    </View>
  )
}

function CaseFactGrid({ deal }: { deal: LocalDeal }) {
  const language = useAppLanguage()
  const copy = customerV21CommonCopy[language]
  const service = deal.draft.serviceType ? customerV21ServiceCopy[language][deal.draft.serviceType].label : copy.dataPending
  return (
    <View style={styles.factGrid}>
      <Metric
        auraScope="ActiveCaseService"
        label={language === 'vi' ? 'Dịch vụ' : 'Service'}
        testID="customer-v21-active-case-service"
        value={service}
      />
      <Metric
        auraScope="ActiveCaseProblem"
        label={language === 'vi' ? 'Vấn đề' : 'Issue'}
        testID="customer-v21-active-case-problem"
        value={agenticDealProblemLabel(deal, language)}
      />
      <Metric
        auraScope="ActiveCaseArea"
        label={language === 'vi' ? 'Khu vực' : 'Area'}
        testID="customer-v21-active-case-area"
        value={deal.draft.addressLabel || deal.draft.districtLabel || copy.dataPending}
      />
      <Metric
        auraScope="ActiveCaseEstimate"
        label={language === 'vi' ? 'Ước tính' : 'Estimate'}
        testID="customer-v21-active-case-estimate"
        value={deal.estimate?.priceRangeLabel || copy.dataPending}
      />
    </View>
  )
}

function CaseOverview({
  deal,
  showWorkflowRail = true,
}: {
  deal: LocalDeal
  showWorkflowRail?: boolean
}) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const service = deal.draft.serviceType ? customerV21ServiceCopy[language][deal.draft.serviceType].label : copy.dataPending
  const problem = agenticDealProblemLabel(deal, language)
  const address = deal.draft.addressLabel || deal.draft.districtLabel || copy.dataPending
  const confidence = deal.estimate?.confidenceLabel ?? null
  const detailLine = [problem, address].filter((item) => item && item !== copy.dataPending).join(' · ') || copy.dataPending
  return (
    <V21Card glass style={[styles.caseOverviewCard, styles.caseOverviewHeroCard]} testID="customer-v21-case-overview">
      <SourceCardSkin />
      <CaseOverviewHeroAura />
      <View style={styles.caseOverviewHeroContent}>
        <View style={styles.caseOverviewHeroText}>
          <KaelChip label={caseDisplayCode(deal, language)} variant="selected" />
          <Text style={[styles.caseOverviewTitle, { color: tokens.text }]}>{service}</Text>
          <Text numberOfLines={3} style={[styles.caseOverviewDetailText, { color: tokens.muted }]}>{detailLine}</Text>
          <View style={styles.heroChipRow}>
            <KaelChip label={deal.estimate ? (language === 'vi' ? 'Kael đã phân tích' : 'Kael analyzed') : copy.dataPending} variant={deal.estimate ? 'selected' : 'unselected'} />
            <StatusPill status={deal.status} />
          </View>
        </View>
        {confidence ? (
          <CaseOverviewLiquidScore
            aura={false}
            label={language === 'vi' ? 'đủ dữ liệu' : 'data ready'}
            percent={percentFromConfidenceLabel(confidence)}
            scope="Ready"
            value={confidence}
          />
        ) : null}
      </View>
      {showWorkflowRail ? <ScreenAdaptationRail activeStatus={deal.status} /> : null}
    </V21Card>
  )
}

function CaseOverviewDirectScreen({ deal }: { deal: LocalDeal }) {
  const language = useAppLanguage()
  const router = useRouter()
  return (
    <View testID="customer-v21-direct-screen-2.6-case-overview">
      <CaseOverview deal={deal} showWorkflowRail={false} />
      <CasePrimaryInfo deal={deal} />
      <CaseUnderstandingCard deal={deal} />
      <CaseOverviewNextStep onNext={() => router.replace('/(customer)/history?screen=2.7-matching' as never)} />
    </View>
  )
}

function CaseOverviewHeroAura() {
  const { reduceTransparency } = useV21Theme()

  if (reduceTransparency) {
    return null
  }

  return (
    <View pointerEvents="none" style={styles.caseOverviewHeroAura} testID="customer-v21-case-overview-mint-aura">
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 360 190" width="100%">
        <Defs>
          <RadialGradient id="caseOverviewHeroRight" cx="88%" cy="36%" r="58%">
            <Stop offset="0" stopColor="rgba(80,232,210,0.28)" />
            <Stop offset="0.54" stopColor="rgba(151,246,232,0.13)" />
            <Stop offset="0.84" stopColor="rgba(151,246,232,0)" />
          </RadialGradient>
          <RadialGradient id="caseOverviewHeroLeft" cx="10%" cy="8%" r="50%">
            <Stop offset="0" stopColor="rgba(81,216,203,0.11)" />
            <Stop offset="0.74" stopColor="rgba(81,216,203,0)" />
          </RadialGradient>
          <LinearGradient id="caseOverviewHeroTopEdge" x1="0" x2="1" y1="0" y2="0">
            <Stop offset="0" stopColor="rgba(149,243,227,0)" />
            <Stop offset="0.46" stopColor="rgba(92,237,214,0.22)" />
            <Stop offset="1" stopColor="rgba(149,243,227,0)" />
          </LinearGradient>
          <LinearGradient id="caseOverviewHeroRightEdge" x1="0" x2="0" y1="0" y2="1">
            <Stop offset="0" stopColor="rgba(149,243,227,0)" />
            <Stop offset="0.50" stopColor="rgba(92,237,214,0.18)" />
            <Stop offset="1" stopColor="rgba(149,243,227,0)" />
          </LinearGradient>
          <RadialGradient id="caseOverviewHeroCornerAura" cx="88%" cy="16%" r="42%">
            <Stop offset="0" stopColor="rgba(92,237,214,0.18)" />
            <Stop offset="0.58" stopColor="rgba(149,243,227,0.08)" />
            <Stop offset="1" stopColor="rgba(149,243,227,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#caseOverviewHeroRight)" height="190" width="360" />
        <Rect fill="url(#caseOverviewHeroLeft)" height="190" width="360" />
        <Rect fill="url(#caseOverviewHeroTopEdge)" height="18" rx="9" width="250" x="76" y="3" testID="customer-v21-case-overview-hero-top-edge-aura" />
        <Rect fill="url(#caseOverviewHeroRightEdge)" height="138" rx="14" width="30" x="318" y="26" testID="customer-v21-case-overview-hero-right-edge-aura" />
        <Rect fill="url(#caseOverviewHeroCornerAura)" height="190" width="360" />
      </Svg>
    </View>
  )
}

function CaseOverviewLiquidScore({
  aura = true,
  label,
  percent,
  scope,
  value,
}: {
  aura?: boolean
  label: string
  percent: number
  scope: string
  value: string
}) {
  const { reduceTransparency, tokens } = useV21Theme()
  const progressId = `caseOverviewScoreProgress${scope}`
  const ringRadius = 43
  const circumference = 2 * Math.PI * ringRadius
  const clampedPercent = Math.max(0, Math.min(100, percent))
  const progressLength = (circumference * clampedPercent) / 100

  return (
    <View style={styles.caseOverviewLiquidScore} testID="customer-v21-case-overview-liquid-score">
      {aura && !reduceTransparency ? <CaseOverviewScoreAura scope={scope} /> : null}
      <Svg height={82} style={styles.caseOverviewScoreSvg} viewBox="0 0 100 100" width={82}>
        <Defs>
          <LinearGradient id={progressId} x1="10" x2="88" y1="86" y2="10">
            <Stop offset="0" stopColor="#088779" />
            <Stop offset="0.48" stopColor="#24B3A1" />
            <Stop offset="1" stopColor="#86EAD9" />
          </LinearGradient>
        </Defs>
        <Circle cx="50" cy="50" fill="none" r={ringRadius} stroke="rgba(204,226,222,0.62)" strokeWidth={8} />
        <Circle
          cx="50"
          cy="50"
          fill="none"
          r={ringRadius}
          stroke={`url(#${progressId})`}
          strokeDasharray={`${progressLength} ${circumference}`}
          strokeLinecap="round"
          strokeWidth={8}
        />
      </Svg>
      <View
        pointerEvents="none"
        style={[
          styles.caseOverviewScoreLens,
          {
            backgroundColor: tokens.mode === 'dark' ? tokens.glassStrong : 'rgba(246,255,252,0.82)',
            borderColor: tokens.mode === 'dark' ? 'rgba(117,236,220,0.30)' : 'rgba(255,255,255,0.95)',
          },
        ]}
      >
        {!reduceTransparency ? <View style={styles.caseOverviewScoreHighlight} /> : null}
      </View>
      <View style={styles.caseOverviewScoreInside}>
        <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.caseOverviewScoreValue, { color: tokens.primary }]}>{value}</Text>
        <Text numberOfLines={2} style={[styles.caseOverviewScoreLabel, { color: tokens.muted }]}>{label}</Text>
      </View>
    </View>
  )
}

function CaseOverviewScoreAura({ scope }: { scope: string }) {
  return (
    <View pointerEvents="none" style={styles.caseOverviewScoreAura} testID={`customer-v21-case-overview-score-aura-${scope}`}>
      <Svg height="100%" preserveAspectRatio="xMidYMid meet" viewBox="0 0 130 130" width="100%">
        <Defs>
          <RadialGradient id={`caseOverviewScoreAuraFill${scope}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="rgba(92,237,214,0.26)" />
            <Stop offset="0.56" stopColor="rgba(149,243,227,0.10)" />
            <Stop offset="1" stopColor="rgba(149,243,227,0)" />
          </RadialGradient>
        </Defs>
        <Circle cx="65" cy="65" fill={`url(#caseOverviewScoreAuraFill${scope})`} r="63" />
        <Circle cx="65" cy="65" fill="none" r="42" stroke="rgba(255,255,255,0.38)" strokeWidth="2" />
      </Svg>
    </View>
  )
}

function CaseOverviewInfoRow({
  chipLabel,
  image,
  label,
  showChevron = true,
  value,
}: {
  chipLabel?: string
  image: ImageSourcePropType
  label: string
  showChevron?: boolean
  value: string
}) {
  const { tokens } = useV21Theme()
  return (
    <View style={styles.caseOverviewInfoRow}>
      <AssetTile image={image} label={label} size={42} sourceAura style={styles.caseOverviewInfoIcon} />
      <View style={styles.flex}>
        <Text numberOfLines={1} style={[styles.caseOverviewInfoLabel, { color: tokens.text }]}>{label}</Text>
        <Text numberOfLines={2} style={[styles.caseOverviewInfoValue, { color: tokens.muted }]}>{value}</Text>
      </View>
      {chipLabel ? <KaelChip label={chipLabel} variant="selected" /> : showChevron ? <Text style={[styles.chevronText, { color: tokens.primary }]}>›</Text> : null}
    </View>
  )
}

function CaseOverviewNextStep({ onNext }: { onNext: () => void }) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  return (
    <View style={styles.caseOverviewNextStack} testID="customer-v21-case-overview-next-step">
      <V21Card
        style={[
          styles.caseOverviewNextCard,
          {
            backgroundColor: tokens.mode === 'dark' ? tokens.glassStrong : 'rgba(246,255,252,0.92)',
            borderColor: tokens.mode === 'dark' ? 'rgba(117,236,220,0.22)' : 'rgba(184,231,223,0.85)',
          },
        ]}
        testID="customer-v21-case-overview-next-card"
      >
        <SourceCardSkin />
        <CaseWorkCardAura scope="OverviewNext" testID="customer-v21-case-overview-next-mint-aura" />
        <View style={styles.caseOverviewNextContent}>
          <AssetTile image={customerV21Assets.kaelHead} label="Kael" size={38} sourceAura style={styles.caseOverviewNextIcon} />
          <View style={styles.flex}>
            <Text style={[styles.cardTitle, { color: tokens.text }]}>{language === 'vi' ? 'Bước tiếp theo' : 'Next step'}</Text>
            <Text numberOfLines={2} style={[styles.caseOverviewNextCopy, { color: tokens.muted }]}>
              {language === 'vi'
                ? 'Tôi sẽ chấm điểm thợ theo kỹ năng, khoảng cách, lịch và uy tín.'
                : 'Kael scores workers by skill, distance, schedule, and trust.'}
            </Text>
          </View>
          <Text style={[styles.chevronText, { color: tokens.primary }]}>›</Text>
        </View>
      </V21Card>
      <KaelButton label={language === 'vi' ? 'Tìm thợ phù hợp' : 'Find a worker'} onPress={onNext} style={styles.caseOverviewNextButton} testID="customer-v21-case-overview-next" />
    </View>
  )
}

function CaseWorkPanel({
  deal,
  editing,
  onOpenActivity,
  onRequestEdit,
}: {
  deal: LocalDeal
  editing: boolean
  onOpenActivity: () => void
  onRequestEdit: () => void
}) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const estimate = deal.estimate
  const evidenceLabel = formatEvidenceFileCount(deal.draft.mediaCount, language)
  const hasDescription = deal.draft.description.trim().length > 0
  const hasEstimate = Boolean(estimate?.priceRangeLabel)
  const pendingText = language === 'vi' ? 'Chờ' : 'Pending'
  const doneText = language === 'vi' ? 'Có' : 'Ready'
  const emptyText = language === 'vi' ? 'Trống' : 'Empty'
  const recommendation = estimate?.advisory || deal.draft.description || copy.dataPending

  return (
    <>
      <V21Card style={styles.caseProgressCard} testID="customer-v21-case-work-progress">
        <SourceCardSkin />
        <CaseWorkCardAura scope="Progress" testID="customer-v21-case-work-progress-mint-aura" />
        <Text style={[styles.cardTitle, { color: tokens.text }]}>{language === 'vi' ? 'Tiến độ Kael đang thực hiện' : 'Kael progress'}</Text>
        <ProgressRail activeStep={stepForStatus(deal.status)} />
        <CaseProgressLabels activeStep={3} />
      </V21Card>

      <V21Card style={styles.caseEvidenceCard} testID="customer-v21-case-work-evidence">
        <SourceCardSkin />
        <CaseWorkCardAura scope="Evidence" testID="customer-v21-case-work-evidence-mint-aura" />
        <View style={styles.rowBetween}>
          <Text style={[styles.cardTitle, { color: tokens.text }]}>{language === 'vi' ? 'Công cụ & bằng chứng' : 'Tools and evidence'}</Text>
          <CaseWorkSourceChip label={evidenceLabel} scope="Evidence" testID="customer-v21-case-work-source-chip" />
        </View>
        <PrepRow done={hasDescription} index={1} label={language === 'vi' ? 'Đọc mô tả' : 'Read description'} value={hasDescription ? doneText : emptyText} />
        <PrepRow done={deal.draft.mediaCount > 0} index={2} label={language === 'vi' ? 'Phân tích ảnh/video' : 'Analyze media'} value={evidenceLabel} />
        <PrepRow active={!hasEstimate} done={hasEstimate} index={3} label={language === 'vi' ? 'Ước tính chi phí & thời gian' : 'Estimate cost and time'} value={hasEstimate ? doneText : pendingText} />
      </V21Card>

      <View style={styles.caseArtifactGrid} testID="customer-v21-case-work-artifacts">
        <CaseArtifact label={language === 'vi' ? 'Bằng chứng' : 'Evidence'} scope="Evidence" value={evidenceLabel} />
        <CaseArtifact label={language === 'vi' ? 'Ước tính' : 'Estimate'} scope="Estimate" value={estimate?.priceRangeLabel || copy.dataPending} accent={Boolean(estimate?.priceRangeLabel)} />
        <CaseArtifact label={language === 'vi' ? 'Rủi ro' : 'Risk'} scope="Risk" value={estimate ? complexitySafetyLabel(estimate.complexity, language) : copy.dataPending} />
      </View>

      <V21Card style={styles.caseRecommendationCard} testID="customer-v21-case-work-recommendation">
        <SourceCardSkin />
        <CaseWorkCardAura scope="Recommendation" testID="customer-v21-case-work-recommendation-mint-aura" />
        <View style={styles.cardHeaderRow}>
          <AssetTile image={customerV21Assets.kaelHead} label="Kael" size={42} style={styles.infoNoticeIcon} />
          <View style={styles.flex}>
            <Text style={[styles.cardTitle, { color: tokens.text }]}>{language === 'vi' ? 'Đề xuất của Kael' : 'Kael recommendation'}</Text>
            <Text numberOfLines={3} style={[styles.bodyText, { color: tokens.muted }]}>{recommendation}</Text>
          </View>
        </View>
        <View style={styles.caseWorkLockedActions}>
          <KaelButton backgroundLayer={<CaseWorkActionButtonAura scope="EditReal" />} label={editing ? (language === 'vi' ? 'Đang chỉnh sửa' : 'Editing') : (language === 'vi' ? 'Yêu cầu chỉnh sửa' : 'Request edits')} onPress={onRequestEdit} size="small" style={styles.caseWorkLockedActionButton} testID="customer-v21-case-work-request-edit" variant="secondary" />
          <KaelButton label={customerV21TabCopy[language].activity} onPress={onOpenActivity} size="small" style={styles.caseWorkLockedActionButton} testID="customer-v21-case-open-activity" variant="secondary" />
        </View>
        <CaseWorkDataSourceFooter code={caseDisplayCode(deal, language)} testID="customer-v21-case-work-source-footer" />
      </V21Card>
    </>
  )
}

function AgenticCaseThreadPanel({
  caseEvidenceDrafts,
  caseEvidenceGateActive,
  caseEvidenceRejectOpen,
  caseEvidenceRejectReason,
  caseOptionsAcknowledged,
  caseQuoteRejectOpen,
  caseQuoteRejectReason,
  confirmingCaseQuote,
  deal,
  editing,
  focus,
  onAddCaseEvidence,
  onAcknowledgeOptions,
  onApproveScopeChange,
  onApproveQuote,
  onCaseEvidenceReasonChange,
  onCaseEvidenceReject,
  onCaseEvidenceSkip,
  onCaseEvidenceSubmit,
  onCaseEvidenceVoiceSaved,
  onOpenActivity,
  onQuoteRejectReasonChange,
  onQuoteRejectReasonSubmit,
  onRejectScopeChange,
  onRejectQuote,
  onRequestEdit,
  submittingCaseEvidence,
  submittingCaseQuoteRejectReason,
}: {
  caseEvidenceDrafts: LocalMediaUploadDraft[]
  caseEvidenceGateActive: boolean
  caseEvidenceRejectOpen: boolean
  caseEvidenceRejectReason: string
  caseOptionsAcknowledged: boolean
  caseQuoteRejectOpen: boolean
  caseQuoteRejectReason: string
  confirmingCaseQuote: boolean
  deal: LocalDeal
  editing: boolean
  focus?: 'approval' | 'payment' | null
  onAddCaseEvidence: () => void
  onAcknowledgeOptions: () => void
  onApproveScopeChange: (id: string) => void
  onApproveQuote: () => void
  onCaseEvidenceReasonChange: (value: string) => void
  onCaseEvidenceReject: () => void
  onCaseEvidenceSkip: () => void
  onCaseEvidenceSubmit: () => void
  onCaseEvidenceVoiceSaved: (draft: LocalMediaUploadDraft) => void
  onOpenActivity: () => void
  onQuoteRejectReasonChange: (value: string) => void
  onQuoteRejectReasonSubmit: () => void
  onRejectScopeChange: (id: string) => void
  onRejectQuote: () => void
  onRequestEdit: () => void
  submittingCaseEvidence: boolean
  submittingCaseQuoteRejectReason: boolean
}) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const estimate = deal.estimate
  const service = deal.draft.serviceType ? customerV21ServiceCopy[language][deal.draft.serviceType].label : copy.dataPending
  const problem = agenticDealProblemLabel(deal, language)
  const address = deal.draft.addressLabel || deal.draft.districtLabel || copy.dataPending
  const timeWindow = timeChoiceLabel(deal.draft.timeChoice, language)
  const evidenceLabel = formatEvidenceFileCount(deal.draft.mediaCount, language)
  const estimateLabel = estimate?.priceRangeLabel || copy.dataPending
  const confidenceLabel = estimate?.confidenceLabel || copy.dataPending
  const hasEstimate = Boolean(estimate?.priceRangeLabel)
  const pendingText = language === 'vi' ? 'Ch\u1edd' : 'Pending'
  const recommendation = estimate?.advisory || deal.draft.description || copy.dataPending
  const pendingScopeChange = deal.scopeChange && isPendingCustomerScopeChange(deal.scopeChange) ? deal.scopeChange : null
  const caseFlowBlockedByEvidence = caseEvidenceGateActive || submittingCaseEvidence
  const matchingGateActive = !caseFlowBlockedByEvidence && deal.status === 'broadcasting'
  const optionsGateActive = !caseFlowBlockedByEvidence && deal.status === 'awaiting_customer_confirm' && Boolean(estimate) && !caseOptionsAcknowledged
  const quoteDecision = !caseFlowBlockedByEvidence && deal.status === 'awaiting_customer_confirm' && estimate && caseOptionsAcknowledged ? estimate : null
  const etaGateActive = !caseFlowBlockedByEvidence && Boolean(deal.broadcast) && deal.status === 'worker_matched'
  const liveAlertGateActive = !caseFlowBlockedByEvidence && Boolean(deal.broadcast) && deal.status === 'worker_on_way'
  const acceptedWorkerGateActive = !caseFlowBlockedByEvidence && (deal.status === 'arrived' || deal.status === 'inspecting')
  const jobProgressGateActive = !caseFlowBlockedByEvidence && ['repairing', 'completed_by_worker', 'confirmed_by_customer', 'reviewed'].includes(deal.status)
  const paymentGateActive = !caseFlowBlockedByEvidence && Boolean(deal.payment) && (focus === 'payment' || ['completed_by_worker', 'confirmed_by_customer', 'reviewed'].includes(deal.status))
  const liveSignal = caseThreadLiveSignal(deal, language, copy)
  const actionStatus = editing
    ? (language === 'vi' ? '\u0110ang trao \u0111\u1ed5i' : 'Discussing')
    : hasEstimate
      ? (language === 'vi' ? 'C\u1ea7n b\u1ea1n ch\u1ed1t' : 'Needs decision')
      : pendingText

  return (
    <>
      <V21Card
        style={[styles.agenticChatCard, { backgroundColor: tokens.raised, borderColor: 'rgba(116,224,209,0.56)' }]}
        testID="customer-v21-case-overview"
      >
        <SourceCardSkin />
        <CaseWideMintAura scope="CaseThreadOverview" />
        <View style={styles.agenticChatHeader}>
          <AssetTile image={customerV21Assets.request} label={service} size={44} sourceAura style={styles.agenticChatIcon} />
          <View style={styles.flex}>
            <Text numberOfLines={2} style={[styles.agenticChatTitle, { color: tokens.text }]}>
              {language === 'vi' ? 'Kael \u0111ang \u0111i\u1ec1u h\u00e0nh c\u00f4ng vi\u1ec7c' : 'Kael is running the work'}
            </Text>
            <Text numberOfLines={2} style={[styles.agenticChatBody, { color: tokens.muted }]}>
              {`${service} \u00b7 ${problem}`}
            </Text>
            <Text numberOfLines={1} style={[styles.agenticChatNote, { color: tokens.muted }]}>
              {address}
            </Text>
          </View>
          <CaseWorkSourceChip label={caseDisplayCode(deal, language)} scope="CaseThreadCode" />
        </View>
        <View style={styles.agenticChatFactGrid}>
          <AgenticChatFact label={language === 'vi' ? 'Khung giờ' : 'Time'} value={timeWindow} />
          <AgenticChatFact label={language === 'vi' ? 'Bằng chứng' : 'Evidence'} value={evidenceLabel} />
        </View>
        <View style={styles.agenticChatFactGrid}>
          <AgenticChatFact label={language === 'vi' ? 'Ước tính' : 'Estimate'} value={estimateLabel} />
          <AgenticChatFact label={language === 'vi' ? 'Độ tin cậy' : 'Confidence'} value={confidenceLabel} />
        </View>
      </V21Card>

      {caseEvidenceGateActive ? (
        <AgenticEvidenceGateCard
          busy={submittingCaseEvidence}
          mediaDrafts={caseEvidenceDrafts}
          onAddMedia={onAddCaseEvidence}
          onConfirm={onCaseEvidenceSubmit}
          onReasonChange={onCaseEvidenceReasonChange}
          onReject={onCaseEvidenceReject}
          onSkip={onCaseEvidenceSkip}
          onVoiceSaved={onCaseEvidenceVoiceSaved}
          rejectOpen={caseEvidenceRejectOpen}
          rejectReason={caseEvidenceRejectReason}
        />
      ) : null}

      {matchingGateActive ? <AgenticCaseMatchingCard deal={deal} /> : null}

      {optionsGateActive ? (
        <AgenticCaseOptionsCard deal={deal} onContinue={onAcknowledgeOptions} />
      ) : null}

      {quoteDecision ? (
        <AgenticCaseQuoteDecisionCard
          confirming={confirmingCaseQuote}
          deal={deal}
          estimate={quoteDecision}
          onConfirm={onApproveQuote}
          onReasonChange={onQuoteRejectReasonChange}
          onReject={onRejectQuote}
          onSubmitReason={onQuoteRejectReasonSubmit}
          rejectOpen={caseQuoteRejectOpen}
          rejectReason={caseQuoteRejectReason}
          submittingReason={submittingCaseQuoteRejectReason}
        />
      ) : null}

      {paymentGateActive ? <AgenticCasePaymentCard deal={deal} /> : null}

      {!paymentGateActive && etaGateActive ? <AgenticCaseEtaCard deal={deal} /> : null}

      {!paymentGateActive && liveAlertGateActive ? <AgenticCaseLiveAlertCard deal={deal} /> : null}

      {!paymentGateActive && acceptedWorkerGateActive ? <AgenticCaseAcceptedWorkerCard deal={deal} /> : null}

      {!paymentGateActive && jobProgressGateActive ? <AgenticCaseJobProgressCard deal={deal} /> : null}

      {liveSignal && !pendingScopeChange && !quoteDecision && !matchingGateActive && !optionsGateActive && !paymentGateActive && !etaGateActive && !liveAlertGateActive && !acceptedWorkerGateActive && !jobProgressGateActive ? <AgenticCaseSignalCard signal={liveSignal} /> : null}

      {pendingScopeChange && !editing && !quoteDecision && !matchingGateActive && !optionsGateActive && !paymentGateActive && !etaGateActive && !liveAlertGateActive && !acceptedWorkerGateActive && !jobProgressGateActive ? (
        <V21Card style={styles.caseRecommendationCard} testID="customer-v21-case-work-approval-card">
          <SourceCardSkin />
          <CaseWorkCardAura scope="CaseThreadApproval" testID="customer-v21-case-work-approval-mint-aura" />
          <View style={styles.cardHeaderRow}>
            <AssetTile image={customerV21Assets.request} label="Kael" size={42} style={styles.infoNoticeIcon} />
            <View style={styles.flex}>
              <Text style={[styles.cardTitle, { color: tokens.text }]}>
                {language === 'vi' ? 'Kael c\u1ea7n b\u1ea1n ch\u1ed1t' : 'Kael needs your decision'}
              </Text>
              <Text numberOfLines={2} style={[styles.bodyText, { color: tokens.muted }]}>
                {pendingScopeChange.requestedDescription ?? pendingScopeChange.reason ?? copy.dataPending}
              </Text>
            </View>
            <CaseWorkSourceChip label={scopeChangeAmountLabel(pendingScopeChange, language)} scope="CaseThreadApprovalAmount" />
          </View>
          <View style={styles.agenticChatFactGrid}>
            <AgenticChatFact label={language === 'vi' ? 'L\u00fd do' : 'Reason'} value={pendingScopeChange.reason ?? copy.dataPending} />
            <AgenticChatFact label={language === 'vi' ? 'Kael \u0111\u00e1nh gi\u00e1' : 'Kael review'} value={approvalConfidenceLabel(pendingScopeChange, deal, language)} />
          </View>
          <View style={styles.agenticChatActions}>
            <KaelButton
              backgroundLayer={<CaseWorkActionButtonAura scope="CaseScopeReject" />}
              label={language === 'vi' ? 'T\u1eeb ch\u1ed1i' : 'Decline'}
              onPress={() => onRejectScopeChange(pendingScopeChange.id)}
              size="small"
              style={styles.agenticChatActionButton}
              testID="customer-v21-case-work-scope-reject"
              variant="secondary"
            />
            <KaelButton
              label={scopeChangeApproveLabel(pendingScopeChange, language)}
              onPress={() => onApproveScopeChange(pendingScopeChange.id)}
              size="small"
              style={styles.agenticChatActionButton}
              testID="customer-v21-case-work-scope-approve"
            />
          </View>
        </V21Card>
      ) : null}

      {!pendingScopeChange && !liveSignal && !quoteDecision && !matchingGateActive && !optionsGateActive && !paymentGateActive && !etaGateActive && !liveAlertGateActive && !acceptedWorkerGateActive && !jobProgressGateActive ? (
        <V21Card style={styles.caseRecommendationCard} testID="customer-v21-case-work-recommendation">
          <SourceCardSkin />
          <CaseWorkCardAura scope="Recommendation" testID="customer-v21-case-work-recommendation-mint-aura" />
          <View style={styles.cardHeaderRow}>
            <AssetTile image={customerV21Assets.kaelHead} label="Kael" size={42} style={styles.infoNoticeIcon} />
            <View style={styles.flex}>
              <Text style={[styles.cardTitle, { color: tokens.text }]}>
                {language === 'vi' ? '\u0110\u1ec1 xu\u1ea5t ti\u1ebfp theo' : 'Next recommendation'}
              </Text>
              <Text numberOfLines={3} style={[styles.bodyText, { color: tokens.muted }]}>{recommendation}</Text>
            </View>
            <CaseWorkSourceChip label={actionStatus} scope="CaseThreadDecision" />
          </View>
          <View style={styles.caseWorkLockedActions}>
            <KaelButton backgroundLayer={<CaseWorkActionButtonAura scope="EditReal" />} label={editing ? (language === 'vi' ? '\u0110ang ch\u1ec9nh' : 'Editing') : (language === 'vi' ? 'Y\u00eau c\u1ea7u ch\u1ec9nh s\u1eeda' : 'Request edits')} onPress={onRequestEdit} size="small" style={styles.caseWorkLockedActionButton} testID="customer-v21-case-work-request-edit" variant="secondary" />
            <KaelButton label={customerV21TabCopy[language].activity} onPress={onOpenActivity} size="small" style={styles.caseWorkLockedActionButton} testID="customer-v21-case-open-activity" variant="secondary" />
          </View>
          <CaseWorkDataSourceFooter code={caseDisplayCode(deal, language)} testID="customer-v21-case-work-source-footer" />
        </V21Card>
      ) : null}
    </>
  )
}

function AgenticCasePaymentCard({ deal }: { deal: LocalDeal }) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const payment = deal.payment

  if (!payment) return null

  const amount = paymentAmountLabel(payment, language, '0')
  const platformFee = payment.platformFee === 0 || payment.platformFee ? formatVnd(payment.platformFee, language) : copy.dataPending
  const workerNet = payment.workerNet === 0 || payment.workerNet ? formatVnd(payment.workerNet, language) : copy.dataPending
  const method = payment.provider ? paymentProviderLabel(payment.provider, language) : copy.dataPending
  const status = paymentStatusLabel(payment.status, language)
  const protectedPayment = isPaymentProtectedStatus(payment.status)
  const paymentTime = formatShortClockTime(payment.receivedAt, language)
  const service = deal.draft.serviceType ? customerV21ServiceCopy[language][deal.draft.serviceType].label : copy.dataPending
  const caseCode = caseDisplayCode(deal, language)
  const ledgerMethod = [payment.paymentCode, paymentTime, method].filter(Boolean).join(' · ') || method

  return (
    <V21Card
      style={[styles.agenticChatCard, { backgroundColor: tokens.raised, borderColor: 'rgba(116,224,209,0.56)' }]}
      testID="customer-v21-case-payment-card"
    >
      <SourceCardSkin />
      <CaseWideMintAura scope="CasePaymentChat" testID="customer-v21-case-payment-card-mint-aura" />
      <ZipMintAura scope="CasePaymentChatFine" testID="customer-v21-case-payment-card-zip-mint-aura" />
      <View style={styles.agenticChatHeader}>
        <AssetTile image={customerV21Assets.payment} label={language === 'vi' ? 'Thanh toán' : 'Payment'} size={44} sourceAura style={styles.agenticChatIcon} />
        <View style={styles.flex}>
          <Text numberOfLines={2} style={[styles.agenticChatTitle, { color: tokens.text }]}>
            {language === 'vi' ? 'Kael bảo vệ khoản thanh toán' : 'Kael protects the payment'}
          </Text>
          <Text numberOfLines={2} style={[styles.agenticChatBody, { color: tokens.muted }]}>
            {`${service} · ${caseCode}`}
          </Text>
        </View>
        <CaseWorkSourceChip label={status} scope="CasePaymentStatus" />
      </View>

      <View style={styles.agenticChatFactGrid}>
        <AgenticChatFact label={language === 'vi' ? 'Số tiền' : 'Amount'} value={amount} />
        <AgenticChatFact label={language === 'vi' ? 'Kênh' : 'Method'} value={method} />
      </View>
      <View style={styles.agenticChatFactGrid}>
        <AgenticChatFact label={language === 'vi' ? 'Phí nền tảng' : 'Platform fee'} value={platformFee} />
        <AgenticChatFact label={language === 'vi' ? 'Thợ nhận' : 'Worker net'} value={workerNet} />
      </View>

      <View style={[styles.agenticPaymentLedger, { backgroundColor: tokens.service, borderColor: tokens.border }]} testID="customer-v21-case-payment-ledger">
        <PaymentLedgerStep
          body={ledgerMethod}
          state="done"
          title={language === 'vi' ? 'Lệnh thanh toán thật' : 'Real payment order'}
        />
        <PaymentLedgerStep
          body={protectedPayment ? (language === 'vi' ? 'Đang giữ an toàn trong hệ thống' : 'Held safely in the system') : status}
          state={protectedPayment ? 'active' : 'pending'}
          title={language === 'vi' ? 'Bảo vệ tiền' : 'Money protection'}
        />
        <PaymentLedgerStep
          body={language === 'vi' ? 'Chỉ mở sau khi công việc hoàn tất đúng quy trình' : 'Opens only after the job completes properly'}
          state="pending"
          title={language === 'vi' ? 'Giải ngân' : 'Payout'}
        />
      </View>

      <Text numberOfLines={2} style={[styles.agenticChatNote, { color: tokens.muted }]}>
        {language === 'vi'
          ? 'Kael chỉ theo dõi khoản tiền từ payment order thật. Không thanh toán ngoài nền tảng.'
          : 'Kael only tracks money from a real payment order. Do not pay off-platform.'}
      </Text>
    </V21Card>
  )
}

function AgenticCaseEtaCard({ deal }: { deal: LocalDeal }) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const workerName = deal.workerProfile?.fullName?.trim() || copy.dataPending
  const address = caseAddressLabel(deal, language)
  const eta = typeof deal.broadcast?.secondsRemaining === 'number'
    ? formatDurationShort(deal.broadcast.secondsRemaining, language)
    : copy.dataPending
  const status = customerV21StatusCopy[language][deal.status]
  const area = deal.broadcast?.generalArea || deal.draft.districtLabel || copy.dataPending

  return (
    <V21Card
      style={[styles.agenticChatCard, { backgroundColor: tokens.raised, borderColor: 'rgba(116,224,209,0.56)' }]}
      testID="customer-v21-case-eta-card"
    >
      <SourceCardSkin />
      <CaseWideMintAura scope="CaseEtaChat" testID="customer-v21-case-eta-card-mint-aura" />
      <View style={styles.agenticChatHeader}>
        <AssetTile image={customerV21Assets.map} label={language === 'vi' ? 'Thời gian đến' : 'Arrival time'} size={44} sourceAura style={styles.agenticChatIcon} />
        <View style={styles.flex}>
          <Text numberOfLines={2} style={[styles.agenticChatTitle, { color: tokens.text }]}>
            {language === 'vi' ? 'Kael theo dõi thời gian đến' : 'Kael tracks arrival time'}
          </Text>
          <Text numberOfLines={2} style={[styles.agenticChatBody, { color: tokens.muted }]}>
            {workerName}
          </Text>
        </View>
        <CaseWorkSourceChip label={eta} scope="CaseEtaValue" />
      </View>
      <View style={styles.agenticChatFactGrid}>
        <AgenticChatFact label={language === 'vi' ? 'Địa chỉ' : 'Address'} value={address} />
        <AgenticChatFact label={language === 'vi' ? 'Khu vực' : 'Area'} value={area} />
        <AgenticChatFact label={language === 'vi' ? 'Trạng thái' : 'Status'} value={status} />
      </View>
      <Text numberOfLines={2} style={[styles.agenticChatNote, { color: tokens.muted }]}>
        {language === 'vi'
          ? 'Kael chỉ cập nhật khi hệ thống có thời gian đến hoặc trạng thái di chuyển thật.'
          : 'Kael updates only when the system has real ETA or movement status.'}
      </Text>
    </V21Card>
  )
}

function AgenticCaseLiveAlertCard({ deal }: { deal: LocalDeal }) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const workerName = deal.workerProfile?.fullName?.trim() || copy.dataPending
  const address = deal.broadcast?.fullAddressVisible ? caseAddressLabel(deal, language) : (deal.broadcast?.generalArea || deal.draft.districtLabel || copy.dataPending)
  const eta = typeof deal.broadcast?.secondsRemaining === 'number'
    ? formatDurationShort(deal.broadcast.secondsRemaining, language)
    : customerV21StatusCopy[language][deal.status]
  const status = customerV21StatusCopy[language][deal.status]
  const codeStatus = copy.dataPending

  return (
    <V21Card
      style={[styles.agenticChatCard, { backgroundColor: tokens.raised, borderColor: 'rgba(116,224,209,0.56)' }]}
      testID="customer-v21-case-live-alert-card"
    >
      <SourceCardSkin />
      <CaseWideMintAura scope="CaseLiveAlertChat" testID="customer-v21-case-live-alert-card-mint-aura" />
      <View style={styles.agenticChatHeader}>
        <AssetTile
          image={customerV21Assets.map}
          label={language === 'vi' ? 'Th\u1ee3 \u0111ang t\u1edbi' : 'Worker on the way'}
          size={44}
          sourceAura
          style={styles.agenticChatIcon}
        />
        <View style={styles.flex}>
          <Text numberOfLines={2} style={[styles.agenticChatTitle, { color: tokens.text }]}>
            {language === 'vi' ? 'Kael \u0111ang canh th\u1eddi \u0111i\u1ec3m th\u1ee3 \u0111\u1ebfn' : 'Kael is tracking the worker arrival'}
          </Text>
          <Text numberOfLines={2} style={[styles.agenticChatBody, { color: tokens.muted }]}>
            {workerName}
          </Text>
        </View>
        <CaseWorkSourceChip label={eta} scope="CaseLiveAlertEta" />
      </View>
      <View style={styles.agenticChatFactGrid}>
        <AgenticChatFact label={language === 'vi' ? 'L\u1ed1i v\u00e0o' : 'Entry'} value={address} />
        <AgenticChatFact label={language === 'vi' ? 'M\u00e3 \u0111\u1ebfn n\u01a1i' : 'Arrival code'} value={codeStatus} />
        <AgenticChatFact label={language === 'vi' ? 'Tr\u1ea1ng th\u00e1i' : 'Status'} value={status} />
      </View>
      <Text numberOfLines={2} style={[styles.agenticChatNote, { color: tokens.muted }]}>
        {language === 'vi'
          ? 'M\u00e3 ch\u1ec9 m\u1edf khi h\u1ec7 th\u1ed1ng x\u00e1c minh th\u1ee3 \u0111\u1ebfn n\u01a1i th\u1eadt.'
          : 'The code opens only after the system verifies a real arrival.'}
      </Text>
    </V21Card>
  )
}

function AgenticCaseAcceptedWorkerCard({ deal }: { deal: LocalDeal }) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const workerName = deal.workerProfile?.fullName?.trim() || copy.dataPending
  const status = customerV21StatusCopy[language][deal.status]
  const address = caseAddressLabel(deal, language)
  const scope = currentScopeLabel(deal, language)
  const paymentProtection = deal.payment
    ? paymentStatusLabel(deal.payment.status, language)
    : copy.dataPending

  return (
    <V21Card
      style={[styles.agenticChatCard, { backgroundColor: tokens.raised, borderColor: 'rgba(116,224,209,0.56)' }]}
      testID="customer-v21-case-accepted-worker-card"
    >
      <SourceCardSkin />
      <CaseWideMintAura scope="CaseAcceptedWorkerChat" testID="customer-v21-case-accepted-worker-card-mint-aura" />
      <View style={styles.agenticChatHeader}>
        <AssetTile
          image={customerV21Assets.activity}
          label={language === 'vi' ? 'B\u1ea3ng c\u00f4ng vi\u1ec7c' : 'Work board'}
          size={44}
          sourceAura
          style={styles.agenticChatIcon}
        />
        <View style={styles.flex}>
          <Text numberOfLines={2} style={[styles.agenticChatTitle, { color: tokens.text }]}>
            {language === 'vi' ? 'Kael \u0111\u00e3 m\u1edf b\u1ea3ng c\u00f4ng vi\u1ec7c' : 'Kael opened the work board'}
          </Text>
          <Text numberOfLines={2} style={[styles.agenticChatBody, { color: tokens.muted }]}>
            {workerName}
          </Text>
        </View>
        <CaseWorkSourceChip label={status} scope="CaseAcceptedWorkerStatus" />
      </View>
      <View style={styles.agenticChatFactGrid}>
        <AgenticChatFact label={language === 'vi' ? 'Ph\u1ea1m vi' : 'Scope'} value={scope} />
        <AgenticChatFact label={language === 'vi' ? '\u0110\u1ecba ch\u1ec9' : 'Address'} value={address} />
        <AgenticChatFact label={language === 'vi' ? 'B\u1ea3o v\u1ec7 ti\u1ec1n' : 'Money protection'} value={paymentProtection} />
      </View>
      <Text numberOfLines={2} style={[styles.agenticChatNote, { color: tokens.muted }]}>
        {language === 'vi'
          ? 'Kael gi\u1eef b\u1eb1ng ch\u1ee9ng, checklist v\u00e0 thay \u0111\u1ed5i ph\u1ea1m vi trong Case Work.'
          : 'Kael keeps evidence, checklist, and scope changes inside Case Work.'}
      </Text>
    </V21Card>
  )
}

function AgenticCaseJobProgressCard({ deal }: { deal: LocalDeal }) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const status = customerV21StatusCopy[language][deal.status]
  const progress = workProgressPercent(deal.status)
  const started = isWorkStartedStatus(deal.status)
  const evidenceCount = (deal.draft.mediaCount ?? 0) + (deal.completionPhotoUrls?.length ?? 0) + (deal.completionNotes ? 1 : 0)
  const evidenceLabel = formatEvidenceFileCount(evidenceCount, language)
  const riskLabel = deal.scopeChange
    ? (language === 'vi' ? 'C\u1ea7n duy\u1ec7t' : 'Needs approval')
    : started
      ? (language === 'vi' ? 'An to\u00e0n' : 'Safe')
      : copy.dataPending
  const note = deal.completionNotes?.trim()
    || (started
      ? (language === 'vi' ? 'Kael theo d\u00f5i ti\u1ebfn \u0111\u1ed9 theo tr\u1ea1ng th\u00e1i c\u00f4ng vi\u1ec7c th\u1eadt.' : 'Kael follows progress from the real job state.')
      : copy.dataPending)

  return (
    <V21Card
      style={[styles.agenticChatCard, { backgroundColor: tokens.raised, borderColor: 'rgba(116,224,209,0.56)' }]}
      testID="customer-v21-case-job-progress-card"
    >
      <SourceCardSkin />
      <CaseWideMintAura scope="CaseJobProgressChat" testID="customer-v21-case-job-progress-card-mint-aura" />
      <View style={styles.agenticChatHeader}>
        <AssetTile
          image={customerV21Assets.clock}
          label={language === 'vi' ? 'Ti\u1ebfn \u0111\u1ed9' : 'Progress'}
          size={44}
          sourceAura
          style={styles.agenticChatIcon}
        />
        <View style={styles.flex}>
          <Text numberOfLines={2} style={[styles.agenticChatTitle, { color: tokens.text }]}>
            {language === 'vi' ? 'Kael \u0111ang theo d\u00f5i c\u00f4ng vi\u1ec7c' : 'Kael is tracking the work'}
          </Text>
          <Text numberOfLines={2} style={[styles.agenticChatBody, { color: tokens.muted }]}>
            {note}
          </Text>
        </View>
        <CaseWorkSourceChip label={status} scope="CaseJobProgressStatus" />
      </View>
      <View style={styles.agenticChatFactGrid}>
        <AgenticChatFact label={language === 'vi' ? 'Ti\u1ebfn \u0111\u1ed9' : 'Progress'} value={started ? `${progress}%` : copy.dataPending} />
        <AgenticChatFact label={language === 'vi' ? 'B\u1eb1ng ch\u1ee9ng' : 'Evidence'} value={evidenceLabel} />
        <AgenticChatFact label={language === 'vi' ? 'An to\u00e0n' : 'Safety'} value={riskLabel} />
      </View>
      <AnimatedStageProgressBar active={started} progress={progress} />
    </V21Card>
  )
}

function AgenticCaseMatchingCard({ deal }: { deal: LocalDeal }) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const service = deal.draft.serviceType ? customerV21ServiceCopy[language][deal.draft.serviceType].label : copy.dataPending
  const area = deal.broadcast?.generalArea || deal.draft.districtLabel || deal.draft.addressLabel || copy.dataPending
  const confidence = deal.estimate?.confidenceLabel || '0'
  const status = customerV21StatusCopy[language][deal.status]
  const workerLabel = deal.workerProfile?.fullName?.trim() || (language === 'vi' ? 'Đang tìm thợ' : 'Matching')

  return (
    <V21Card
      style={[styles.agenticChatCard, { backgroundColor: tokens.raised, borderColor: 'rgba(116,224,209,0.56)' }]}
      testID="customer-v21-case-matching-card"
    >
      <SourceCardSkin />
      <CaseWideMintAura scope="CaseMatchingChat" testID="customer-v21-case-matching-card-mint-aura" />
      <View style={styles.agenticChatHeader}>
        <AssetTile image={customerV21Assets.identity} label={workerLabel} size={44} sourceAura style={styles.agenticChatIcon} />
        <View style={styles.flex}>
          <Text numberOfLines={2} style={[styles.agenticChatTitle, { color: tokens.text }]}>
            {language === 'vi' ? 'Kael đang ghép thợ phù hợp' : 'Kael is matching a worker'}
          </Text>
          <Text numberOfLines={2} style={[styles.agenticChatBody, { color: tokens.muted }]}>
            {workerLabel}
          </Text>
        </View>
        <CaseWorkSourceChip label={status} scope="CaseMatchingStatus" />
      </View>
      <View style={styles.agenticChatFactGrid}>
        <AgenticChatFact label={language === 'vi' ? 'Dịch vụ' : 'Service'} value={service} />
        <AgenticChatFact label={language === 'vi' ? 'Khu vực' : 'Area'} value={area} />
        <AgenticChatFact label={language === 'vi' ? 'Độ tin cậy' : 'Confidence'} value={confidence} />
      </View>
      <Text numberOfLines={2} style={[styles.agenticChatNote, { color: tokens.muted }]}>
        {language === 'vi'
          ? 'Kael chỉ hiện thợ, vị trí và thời gian đến khi hệ thống có dữ liệu thật.'
          : 'Kael only shows worker, location, and ETA when real system data is available.'}
      </Text>
    </V21Card>
  )
}

function AgenticCaseOptionsCard({ deal, onContinue }: { deal: LocalDeal; onContinue: () => void }) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const service = deal.draft.serviceType ? customerV21ServiceCopy[language][deal.draft.serviceType].label : copy.dataPending
  const scopeRows = caseScopeRowsForDeal(deal, language).slice(0, 4)
  const options = caseSecondaryOptionsForDeal(deal, language)
  const estimate = deal.estimate?.priceRangeLabel || copy.dataPending

  return (
    <V21Card
      style={[styles.agenticChatCard, { backgroundColor: tokens.raised, borderColor: 'rgba(116,224,209,0.56)' }]}
      testID="customer-v21-case-options-card"
    >
      <SourceCardSkin />
      <CaseWideMintAura scope="CaseOptionsChat" testID="customer-v21-case-options-card-mint-aura" />
      <View style={styles.agenticChatHeader}>
        <AssetTile image={deal.draft.serviceType ? customerV21ServiceAssets[deal.draft.serviceType] : customerV21Assets.request} label={service} size={44} sourceAura style={styles.agenticChatIcon} />
        <View style={styles.flex}>
          <Text numberOfLines={2} style={[styles.agenticChatTitle, { color: tokens.text }]}>
            {language === 'vi' ? 'Kael chốt phạm vi đề xuất' : 'Kael locks the suggested scope'}
          </Text>
          <Text numberOfLines={2} style={[styles.agenticChatBody, { color: tokens.muted }]}>
            {deal.estimate?.advisory || agenticDealProblemLabel(deal, language)}
          </Text>
        </View>
        <CaseWorkSourceChip label={estimate} scope="CaseOptionsEstimate" />
      </View>

      <View style={styles.agenticChatFactGrid}>
        {options.map((option) => (
          <AgenticChatFact key={option.testID} label={option.title} value={option.rightLabel} />
        ))}
      </View>

      <View style={styles.caseStepListContent} testID="customer-v21-case-options-scope-list">
        {scopeRows.map((row) => (
          <CaseScopeStepRow key={row.label} label={row.label} state={row.state} value={row.value} />
        ))}
      </View>

      <KaelButton
        label={language === 'vi' ? 'Tiếp tục' : 'Continue'}
        onPress={onContinue}
        size="small"
        style={styles.agenticChatActionButton}
        testID="customer-v21-case-options-continue"
      />
    </V21Card>
  )
}

function AgenticCaseQuoteDecisionCard({
  confirming,
  deal,
  estimate,
  onConfirm,
  onReasonChange,
  onReject,
  onSubmitReason,
  rejectOpen,
  rejectReason,
  submittingReason,
}: {
  confirming: boolean
  deal: LocalDeal
  estimate: LocalDealEstimate
  onConfirm: () => void
  onReasonChange: (value: string) => void
  onReject: () => void
  onSubmitReason: () => void
  rejectOpen: boolean
  rejectReason: string
  submittingReason: boolean
}) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const service = deal.draft.serviceType ? customerV21ServiceCopy[language][deal.draft.serviceType].label : copy.dataPending
  const problem = agenticDealProblemLabel(deal, language)
  const evidence = formatEvidenceFileCount(deal.draft.mediaCount, language)
  const price = estimate.priceRangeLabel || copy.dataPending
  const confidence = estimate.confidenceLabel || copy.dataPending
  const canSubmitReason = rejectReason.trim().length > 0 && !submittingReason && !confirming

  return (
    <V21Card
      style={[styles.agenticChatCard, { backgroundColor: tokens.raised, borderColor: 'rgba(116,224,209,0.56)' }]}
      testID="customer-v21-case-quote-decision-card"
    >
      <SourceCardSkin />
      <CaseWideMintAura scope="CaseQuoteDecision" testID="customer-v21-case-quote-decision-mint-aura" />
      <View style={styles.agenticChatHeader}>
        <AssetTile image={customerV21Assets.request} label={service} size={44} sourceAura style={styles.agenticChatIcon} />
        <View style={styles.flex}>
          <Text numberOfLines={2} style={[styles.agenticChatTitle, { color: tokens.text }]}>
            {language === 'vi' ? 'Kael cần bạn xác nhận' : 'Kael needs your confirmation'}
          </Text>
          <Text numberOfLines={2} style={[styles.agenticChatBody, { color: tokens.muted }]}>
            {problem}
          </Text>
        </View>
        <CaseWorkSourceChip label={language === 'vi' ? 'Cần chốt' : 'Needs decision'} scope="CaseQuoteDecisionStatus" />
      </View>

      <View style={styles.agenticChatFactGrid}>
        <AgenticChatFact label={language === 'vi' ? 'Ước tính' : 'Estimate'} value={price} />
        <AgenticChatFact label={language === 'vi' ? 'Bằng chứng' : 'Evidence'} value={evidence} />
        <AgenticChatFact label={language === 'vi' ? 'Độ tin cậy' : 'Confidence'} value={confidence} />
      </View>

      {estimate.advisory ? (
        <Text numberOfLines={3} style={[styles.agenticChatBody, { color: tokens.text }]} testID="customer-v21-case-quote-advisory">
          {estimate.advisory}
        </Text>
      ) : null}

      {rejectOpen ? (
        <View
          style={[styles.agenticRejectReasonCard, { backgroundColor: tokens.service, borderColor: tokens.borderStrong }]}
          testID="customer-v21-case-quote-reject-reason"
        >
          <SourceCardSkin />
          <CaseWideMintAura scope="CaseQuoteRejectReason" />
          <Text style={[styles.agenticChatTitle, { color: tokens.text }]}>
            {language === 'vi' ? 'Kael sẽ hỏi thêm' : 'Kael will clarify'}
          </Text>
          <Text style={[styles.agenticChatBody, { color: tokens.muted }]}>
            {language === 'vi' ? 'Ghi lý do ngắn để Kael điều chỉnh trước khi chạy bước tiếp theo.' : 'Write a short reason so Kael can adjust before the next step.'}
          </Text>
          <KaelTextField
            inputShellStyle={styles.agenticEvidenceReasonInputShell}
            onChangeText={onReasonChange}
            placeholder={language === 'vi' ? 'Lý do ngắn' : 'Short reason'}
            placeholderTextColor={tokens.subtleText}
            shellStyle={styles.agenticEvidenceReasonInput}
            style={[styles.composerInput, customerV21WebTextInputNoOutline, { color: tokens.text }]}
            testID="customer-v21-case-quote-reject-input"
            value={rejectReason}
          />
          <KaelButton
            accessibilityState={{ busy: submittingReason, disabled: !canSubmitReason }}
            disabled={!canSubmitReason}
            label={submittingReason ? (language === 'vi' ? 'Đang gửi' : 'Sending') : (language === 'vi' ? 'Gửi cho Kael' : 'Send to Kael')}
            onPress={onSubmitReason}
            size="small"
            style={styles.agenticChatActionButton}
            testID="customer-v21-case-quote-reject-send"
          />
        </View>
      ) : null}

      <View style={styles.agenticChatActions}>
        <KaelButton
          backgroundLayer={<CaseWorkActionButtonAura scope="CaseQuoteReject" />}
          disabled={confirming}
          label={language === 'vi' ? 'Từ chối' : 'Decline'}
          onPress={onReject}
          size="small"
          style={styles.agenticChatActionButton}
          testID="customer-v21-case-quote-reject"
          variant="secondary"
        />
        <KaelButton
          accessibilityState={{ busy: confirming, disabled: confirming || submittingReason }}
          disabled={confirming || submittingReason}
          label={confirming ? (language === 'vi' ? 'Đang xác nhận' : 'Confirming') : (language === 'vi' ? 'Xác nhận' : 'Confirm')}
          onPress={onConfirm}
          size="small"
          style={styles.agenticChatActionButton}
          testID="customer-v21-case-quote-confirm"
        />
      </View>
    </V21Card>
  )
}

function AgenticCaseSignalCard({ signal }: { signal: AgenticCaseSignal }) {
  const { tokens } = useV21Theme()
  return (
    <V21Card
      style={[styles.agenticChatCard, { backgroundColor: tokens.raised, borderColor: 'rgba(116,224,209,0.56)' }]}
      testID="customer-v21-case-work-live-signal"
    >
      <SourceCardSkin />
      <CaseWideMintAura scope="CaseThreadLiveSignal" testID="customer-v21-case-work-live-signal-mint-aura" />
      <View style={styles.agenticChatHeader}>
        <AssetTile image={signal.image} label={signal.title} size={42} sourceAura style={styles.agenticChatIcon} />
        <View style={styles.flex}>
          <Text numberOfLines={1} style={[styles.agenticChatTitle, { color: tokens.text }]}>{signal.title}</Text>
          <Text numberOfLines={2} style={[styles.agenticChatBody, { color: tokens.muted }]}>{signal.body}</Text>
        </View>
        <CaseWorkSourceChip label={signal.chip} scope="CaseThreadLiveSignalStatus" />
      </View>
    </V21Card>
  )
}

function caseThreadLiveSignal(deal: LocalDeal, language: AppLanguage, copy: (typeof customerV21CommonCopy)[AppLanguage]): AgenticCaseSignal | null {
  const status = customerV21StatusCopy[language][deal.status]
  if (deal.payment) {
    const amount = paymentAmountLabel(deal.payment, language, '0')
    const method = deal.payment.provider ? paymentProviderLabel(deal.payment.provider, language) : copy.dataPending
    const paymentStatus = paymentStatusLabel(deal.payment.status, language)
    return {
      body: `${amount} \u00b7 ${method}`,
      chip: paymentStatus,
      image: customerV21Assets.payment,
      title: language === 'vi' ? 'Thanh to\u00e1n an to\u00e0n' : 'Protected payment',
    }
  }

  if (deal.broadcast && (deal.status === 'worker_on_way' || deal.status === 'worker_matched')) {
    const eta = deal.broadcast.secondsRemaining ? formatDurationShort(deal.broadcast.secondsRemaining, language) : status
    const area = deal.broadcast.fullAddressVisible
      ? deal.broadcast.fullAddressLabel ?? deal.broadcast.generalArea
      : deal.broadcast.generalArea
    return {
      body: area || copy.dataPending,
      chip: eta,
      image: customerV21Assets.map,
      title: language === 'vi' ? 'Th\u1ee3 & th\u1eddi gian' : 'Worker and ETA',
    }
  }

  if (deal.status === 'repairing' || deal.status === 'scope_change_pending' || deal.status === 'completed_by_worker') {
    const completionCount = (deal.completionPhotoUrls?.length ?? 0) + (deal.completionNotes ? 1 : 0)
    return {
      body: completionCount > 0 ? formatEvidenceFileCount(completionCount, language) : status,
      chip: status,
      image: customerV21Assets.activity,
      title: language === 'vi' ? 'Ti\u1ebfn \u0111\u1ed9 hi\u1ec7n tr\u01b0\u1eddng' : 'Field progress',
    }
  }

  if (deal.workerProfile || deal.broadcast) {
    const workerName = deal.workerProfile?.fullName?.trim() || deal.broadcast?.generalArea || copy.dataPending
    return {
      body: workerName,
      chip: status,
      image: customerV21Assets.identity,
      title: language === 'vi' ? 'Th\u1ee3 th\u1eadt' : 'Real worker',
    }
  }

  return null
}

function CaseArtifact({ accent = false, label, scope, testID, value }: { accent?: boolean; label: string; scope: string; testID?: string; value: string }) {
  const { tokens } = useV21Theme()
  return (
    <View style={[styles.caseArtifact, { backgroundColor: accent ? tokens.service : tokens.raised, borderColor: tokens.border }]} testID={testID}>
      <SourceCardSkin />
      <CaseWorkCardAura scope={`Artifact${scope}`} testID={testID ? `${testID}-mint-aura` : undefined} />
      <Text numberOfLines={1} style={[styles.caseArtifactLabel, { color: tokens.muted }]}>{label}</Text>
      <Text adjustsFontSizeToFit minimumFontScale={0.68} numberOfLines={2} style={[styles.caseArtifactValue, { color: accent ? tokens.primary : tokens.text }]}>{value}</Text>
    </View>
  )
}

function CasePrimaryInfo({ deal }: { deal: LocalDeal }) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const address = deal.draft.addressLabel || deal.draft.districtLabel || copy.dataPending
  const evidenceLabel = formatEvidenceFileCount(deal.draft.mediaCount, language)
  return (
    <>
      <SectionActionHeader
        action={language === 'vi' ? 'Chỉnh sửa' : 'Edit'}
        title={language === 'vi' ? 'Thông tin chính' : 'Primary details'}
      />
      <V21Card style={[styles.casePrimaryInfoCard, styles.caseOverviewInfoCard]} testID="customer-v21-case-primary-info">
        <SourceCardSkin />
        <CaseWorkCardAura scope="OverviewInfo" testID="customer-v21-case-primary-info-mint-aura" />
        <CaseOverviewInfoRow image={customerV21Assets.booking} label={language === 'vi' ? 'Khung giờ' : 'Time window'} value={timeChoiceLabel(deal.draft.timeChoice, language)} />
        <View style={[styles.caseInfoDivider, { backgroundColor: tokens.border }]} />
        <CaseOverviewInfoRow image={customerV21Assets.address} label={language === 'vi' ? 'Địa điểm' : 'Location'} value={address} />
        <View style={[styles.caseInfoDivider, { backgroundColor: tokens.border }]} />
        <CaseOverviewInfoRow chipLabel={deal.draft.mediaCount > 0 ? (language === 'vi' ? 'Đủ' : 'Ready') : evidenceLabel} image={customerV21Assets.evidence} label={language === 'vi' ? 'Bằng chứng' : 'Evidence'} value={evidenceLabel} />
      </V21Card>
    </>
  )
}

function CaseUnderstandingCard({ deal }: { deal: LocalDeal }) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const estimate = deal.estimate
  const headline = agenticDealProblemLabel(deal, language)
  const body = estimate?.advisory || deal.draft.description || copy.dataPending
  return (
    <>
      <SectionActionHeader
        action={language === 'vi' ? 'Bằng chứng ›' : 'Evidence ›'}
        title={language === 'vi' ? 'Kael đã hiểu vấn đề' : 'Kael understanding'}
      />
      <V21Card style={styles.caseUnderstandingCard} testID="customer-v21-case-understanding">
        <SourceCardSkin />
        <CaseWorkCardAura scope="OverviewUnderstanding" testID="customer-v21-case-understanding-mint-aura" />
        <Text style={[styles.caseUnderstandingText, { color: tokens.text }]}>
          <Text style={styles.caseUnderstandingStrong}>{language === 'vi' ? 'Khả năng cao: ' : 'Likely: '}</Text>
          {headline}
        </Text>
        <Text style={[styles.bodyText, { color: tokens.muted }]}>{body}</Text>
        <View style={styles.heroChipRow}>
          {estimate?.complexity ? <KaelChip label={complexitySafetyLabel(estimate.complexity, language)} variant="selected" /> : null}
          {estimate?.confidenceLabel ? (
            <KaelChip
              label={language === 'vi' ? `Độ tin cậy ${estimate.confidenceLabel}` : `Confidence ${estimate.confidenceLabel}`}
              variant="unselected"
            />
          ) : null}
        </View>
      </V21Card>
    </>
  )
}

function ActivityScreenCard({
  active,
  deal,
  screenId,
}: {
  active: boolean
  deal: LocalDeal
  screenId: CustomerV21ScreenId
}) {
  const language = useAppLanguage()
  const router = useRouter()
  const { tokens } = useV21Theme()
  const summary = caseScreenSummary(screenId, deal, language)
  const paymentRelated = paymentScreenIds.includes(screenId)
  return (
    <Pressable
      accessibilityLabel={customerV21ScreenTitles[language][screenId]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={() => router.replace(`/(customer)/history?screen=${screenId}` as never)}
      style={[
        styles.activityScreenCard,
        paymentRelated ? styles.activityScreenPaymentAuraCard : null,
        {
          backgroundColor: active ? tokens.service : tokens.raised,
          borderColor: paymentRelated ? 'rgba(154,232,219,0.54)' : active ? tokens.primary : tokens.border,
        },
      ]}
      testID={`customer-v21-case-screen-${screenId}`}
    >
      {paymentRelated ? <SourceCardSkin /> : null}
      {paymentRelated ? <CaseWorkCardAura scope={`PaymentRelatedCard${screenId}`} testID={`customer-v21-case-screen-${screenId}-card-mint-aura`} /> : null}
      {paymentRelated ? <CaseWideMintAura scope={`PaymentRelated${screenId}`} testID={`customer-v21-case-screen-${screenId}-wide-mint-aura`} /> : null}
      {paymentRelated ? <ZipMintAura scope={`PaymentRelatedZip${screenId}`} testID={`customer-v21-case-screen-${screenId}-mint-aura`} /> : null}
      <AssetTile image={caseScreenAsset(screenId)} label={customerV21ScreenTitles[language][screenId]} size={36} style={styles.activityScreenIcon} />
      <View style={styles.flex}>
        <Text numberOfLines={1} style={[styles.screenRailTitle, { color: active ? tokens.primary : tokens.text }]}>{customerV21ScreenTitles[language][screenId]}</Text>
        <Text numberOfLines={2} style={[styles.activityScreenBody, { color: tokens.muted }]}>{summary}</Text>
      </View>
      {active ? <View style={[styles.activityActiveDot, { backgroundColor: tokens.primary }]} /> : null}
    </Pressable>
  )
}

function ActivityDirectScreen({ deal, screenId }: { deal: LocalDeal; screenId: CustomerV21ScreenId }) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const title = customerV21ScreenTitles[language][screenId]
  const rows = caseReferenceRows(screenId, deal, language)
  const activeScreens = screenIdsForStatus(deal.status)
  const active = activeScreens.includes(screenId)

  if (screenId === '2.7-matching') {
    return <CaseMatchingScreen deal={deal} />
  }

  if (screenId === '2.8-options') {
    return <CaseOptionsScreen deal={deal} />
  }

  if (screenId === '2.9-quotes') {
    return <CaseQuotesScreen deal={deal} />
  }

  if (screenId === '2.10-location-eta') {
    return <CaseLocationEtaScreen deal={deal} />
  }

  if (screenId === '2.11-live-alert') {
    return <CaseLiveAlertScreen deal={deal} />
  }

  if (screenId === '2.12-job-accepted') {
    return <CaseJobAcceptedScreen deal={deal} />
  }

  if (screenId === '2.13-job-progress') {
    return <CaseJobProgressScreen deal={deal} />
  }

  if (paymentScreenIds.includes(screenId)) {
    return <CasePaymentStageScreen deal={deal} screenId={screenId} />
  }

  return (
    <View testID={`customer-v21-direct-screen-${screenId}`}>
      <V21Card glass style={styles.caseReferenceHero}>
        <AssetTile image={caseScreenAsset(screenId)} label={title} size={62} />
        <View style={styles.flex}>
          <EyebrowPill label={active ? (language === 'vi' ? 'ĐANG MỞ THEO CÔNG VIỆC' : 'ACTIVE IN JOB') : customerV21CommonCopy[language].dataPending} />
          <Text style={[styles.caseOverviewTitle, { color: tokens.text }]}>{title}</Text>
          <Text style={[styles.bodyText, { color: tokens.muted }]}>{caseScreenSummary(screenId, deal, language)}</Text>
        </View>
      </V21Card>

      <V21Card testID={`customer-v21-direct-facts-${screenId}`}>
        <SectionHeader
          eyebrow={caseDisplayCode(deal, language)}
          title={language === 'vi' ? 'Dữ liệu của màn hình này' : 'Screen data'}
        />
        {rows.map((row) => (
          <MediaRow image={row.image} key={row.label} label={row.label} value={row.value} />
        ))}
      </V21Card>

      {screenId === '2.5-chat-case' ? <CaseWorkSummary deal={deal} /> : null}
      {screenId === '2.6-case-overview' ? (
        <>
          <CasePrimaryInfo deal={deal} />
          <CaseUnderstandingCard deal={deal} />
        </>
      ) : null}
      <ActivityScreenCard active={active} deal={deal} screenId={screenId} />
    </View>
  )
}

function MatchingHandoffChip({
  label,
  style,
  testID,
  tone = 'unselected',
}: {
  label: string
  style?: StyleProp<ViewStyle>
  testID?: string
  tone?: 'selected' | 'success' | 'unselected'
}) {
  const variant = tone === 'success' ? 'successStatus' : tone
  const auraScope = `Handoff${tone}${(testID ?? label).replace(/[^A-Za-z0-9]/g, '') || 'Chip'}`
  return (
    <KaelChip
      backgroundLayer={tone === 'selected' || tone === 'success' ? <ZipMintAura scope={auraScope} /> : null}
      label={label}
      style={[
        styles.matchingHandoffChip,
        tone === 'selected' ? styles.matchingHandoffChipSelected : null,
        tone === 'success' ? styles.matchingHandoffChipSuccess : null,
        style,
      ]}
      testID={testID}
      textStyle={[
        styles.matchingHandoffChipText,
        tone === 'selected' ? styles.matchingHandoffChipSelectedText : null,
        tone === 'success' ? styles.matchingHandoffChipSuccessText : null,
      ]}
      variant={variant}
    />
  )
}

function CaseMatchingScreen({ deal }: { deal: LocalDeal }) {
  const language = useAppLanguage()
  const router = useRouter()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const estimate = deal.estimate
  const worker = deal.workerProfile ?? null
  const service = deal.draft.serviceType ? customerV21ServiceCopy[language][deal.draft.serviceType].label : copy.dataPending
  const problem = agenticDealProblemLabel(deal, language)
  const area = deal.broadcast?.generalArea || deal.draft.districtLabel || deal.draft.addressLabel || copy.dataPending
  const time = timeChoiceLabel(deal.draft.timeChoice, language)
  const confidencePercent = estimate ? percentFromConfidenceLabel(estimate.confidenceLabel) : 0
  const confidenceLabel = estimate?.confidenceLabel || '0'
  const workerName = worker?.fullName?.trim() || (deal.status === 'broadcasting'
    ? (language === 'vi' ? 'Đang tìm thợ' : 'Finding worker')
    : copy.dataPending)
  const workerJobs = worker ? formatWorkerJobs(worker.totalJobs, language) : formatWorkerJobs(0, language)
  const workerRating = worker ? `★ ${worker.rating.toFixed(1)}` : '0'
  const statusLabel = customerV21StatusCopy[language][deal.status]
  const matchLabel = worker
    ? (language === 'vi' ? 'Thợ thật' : 'Real worker')
    : deal.status === 'broadcasting'
      ? (language === 'vi' ? 'Đang ghép' : 'Matching')
      : copy.dataPending
  const profileAction = worker ? (language === 'vi' ? 'Xem hồ sơ ›' : 'View profile ›') : copy.dataPending
  const priceScore = estimate?.hasVndPrice ? confidencePercent : 0
  const trustScore = worker ? Math.round(Math.max(0, Math.min(5, worker.rating)) * 20) : 0

  const reasons = [
    {
      body: problem,
      image: customerV21Assets.tools,
      score: confidencePercent ? formatNumber(Math.round(confidencePercent), language) : '0',
      title: language === 'vi' ? 'Kỹ năng dịch vụ' : 'Service skill',
    },
    {
      body: language === 'vi' ? `${time} · ${area}` : `${time} · ${area}`,
      image: customerV21Assets.booking,
      score: '0',
      title: language === 'vi' ? 'Lịch & khu vực' : 'Schedule and area',
    },
    {
      body: worker ? workerJobs : copy.dataPending,
      image: customerV21Assets.shield,
      score: worker ? formatNumber(trustScore, language) : '0',
      title: language === 'vi' ? 'Uy tín & hiệu suất' : 'Trust and performance',
    },
  ]

  return (
    <View testID="customer-v21-direct-screen-2.7-matching">
      <V21Card glass style={styles.matchingHeroCard} testID="customer-v21-matching-hero">
        <SourceCardSkin />
        <CaseWorkCardAura scope="MatchingHero" testID="customer-v21-matching-hero-mint-aura" />
        <View style={styles.matchingHeroContent}>
          <CaseOverviewLiquidScore
            label={estimate ? (language === 'vi' ? 'độ tin cậy' : 'confidence') : copy.dataPending}
            percent={confidencePercent}
            scope="Matching"
            value={confidenceLabel}
          />
          <View style={styles.matchingHeroCopy}>
            <MatchingHandoffChip label={matchLabel} tone={worker || deal.status === 'broadcasting' ? 'success' : 'unselected'} />
            <Text numberOfLines={2} style={[styles.matchingHeroName, { color: tokens.text }]}>{workerName}</Text>
            <Text numberOfLines={2} style={[styles.matchingHeroMeta, { color: tokens.muted }]}>
              {worker ? `${service} · ${workerJobs}` : `${service} · ${area}`}
            </Text>
            <View style={styles.matchingChipRow}>
              <MatchingHandoffChip label={workerRating} tone="unselected" />
              <MatchingHandoffChip label={copy.dataPending} tone="selected" />
              <MatchingHandoffChip label={statusLabel} tone={deal.status === 'broadcasting' || worker ? 'success' : 'unselected'} />
            </View>
          </View>
        </View>
      </V21Card>

      <SectionActionHeader action={profileAction} title={language === 'vi' ? 'Vì sao phù hợp?' : 'Why this match?'} />
      <V21Card style={styles.matchingListCard} testID="customer-v21-decision-panel-2.7-matching">
        <SourceCardSkin />
        <CaseWorkCardAura scope="MatchingReasons" testID="customer-v21-matching-reasons-mint-aura" />
        {reasons.map((reason, index) => (
          <View key={reason.title}>
            <View style={styles.matchingReasonRow}>
              <AssetTile image={reason.image} label={reason.title} size={44} sourceAura style={styles.matchingReasonIcon} />
              <View style={styles.flex}>
                <Text numberOfLines={1} style={[styles.matchingReasonTitle, { color: tokens.text }]}>{reason.title} · {reason.score}</Text>
                <Text numberOfLines={2} style={[styles.matchingReasonBody, { color: tokens.muted }]}>{reason.body}</Text>
              </View>
              <View style={[styles.matchingScoreBadge, { backgroundColor: tokens.service, borderColor: 'rgba(137,232,218,0.76)' }]}>
                <Text numberOfLines={1} style={[styles.matchingScoreBadgeText, { color: tokens.primary }]}>{reason.score}</Text>
              </View>
            </View>
            {index < reasons.length - 1 ? <View style={[styles.matchingDivider, { backgroundColor: tokens.border }]} /> : null}
          </View>
        ))}
      </V21Card>

      <SectionActionHeader action={language === 'vi' ? 'Chi tiết' : 'Details'} title={language === 'vi' ? 'Điểm matching' : 'Matching score'} />
      <V21Card style={styles.matchingBarsCard} testID="customer-v21-matching-bars">
        <SourceCardSkin />
        <CaseWorkCardAura scope="MatchingBars" testID="customer-v21-matching-bars-mint-aura" />
        <MatchingBar delayMs={0} label={language === 'vi' ? 'Kỹ năng' : 'Skill'} percent={confidencePercent} testID="customer-v21-matching-bar-skill" value={confidencePercent ? formatNumber(Math.round(confidencePercent), language) : '0'} />
        <MatchingBar delayMs={45} label={language === 'vi' ? 'Khoảng cách' : 'Distance'} percent={0} testID="customer-v21-matching-bar-distance" value="0" />
        <MatchingBar delayMs={90} label={language === 'vi' ? 'Đúng giá' : 'Price fit'} percent={priceScore} testID="customer-v21-matching-bar-price" value={priceScore ? formatNumber(Math.round(priceScore), language) : '0'} />
      </V21Card>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.replace('/(customer)/history?screen=2.8-options' as never)}
        style={[styles.matchingKaelCard, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
        testID="customer-v21-matching-kael-card"
      >
        <SourceCardSkin />
        <CaseWorkCardAura scope="MatchingKael" testID="customer-v21-matching-kael-mint-aura" />
        <MatchingKaelStatusIcon testID="customer-v21-matching-kael-status-icon" />
        <View style={styles.flex}>
          <Text numberOfLines={1} style={[styles.matchingKaelTitle, { color: tokens.text }]}>
            {worker ? (language === 'vi' ? `Kael đề xuất ${worker.fullName}` : `Kael recommends ${worker.fullName}`) : (language === 'vi' ? 'Kael đang ghép thợ' : 'Kael is matching')}
          </Text>
          <Text numberOfLines={2} style={[styles.matchingKaelBody, { color: tokens.muted }]}>
            {worker
              ? (language === 'vi' ? 'Dựa trên dữ liệu thợ thật và công việc hiện tại.' : 'Based on real worker and job data.')
              : (language === 'vi' ? 'Chờ dữ liệu thợ thật từ hệ thống.' : 'Waiting for real worker data from the system.')}
          </Text>
        </View>
        <Text style={[styles.chevronText, { color: tokens.primary }]}>›</Text>
      </Pressable>

      <KaelButton
        label={language === 'vi' ? 'Xem phương án dịch vụ' : 'View service options'}
        onPress={() => router.replace('/(customer)/history?screen=2.8-options' as never)}
        style={styles.matchingNextButton}
        testID="customer-v21-matching-next"
      />
    </View>
  )
}

function MatchingKaelStatusIcon({ testID }: { testID?: string }) {
  return (
    <View accessibilityLabel="Kael" style={styles.matchingKaelStatusIconWrap} testID={testID}>
      <View pointerEvents="none" style={styles.matchingKaelStatusIconAura}>
        <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 86 86" width="100%">
          <Defs>
            <RadialGradient id="matchingKaelStatusAura" cx="50%" cy="50%" r="54%">
              <Stop offset="0" stopColor="rgba(92,237,214,0.26)" />
              <Stop offset="0.60" stopColor="rgba(149,243,227,0.12)" />
              <Stop offset="1" stopColor="rgba(149,243,227,0)" />
            </RadialGradient>
          </Defs>
          <Rect fill="url(#matchingKaelStatusAura)" height="86" width="86" />
        </Svg>
      </View>
      <Image resizeMode="contain" source={customerV21Assets.kaelHead} style={styles.matchingKaelStatusImage} />
    </View>
  )
}

function MatchingBar({
  delayMs = 0,
  label,
  percent,
  testID,
  value,
}: {
  delayMs?: number
  label: string
  percent: number
  testID?: string
  value: string
}) {
  const { tokens } = useV21Theme()
  const { reduceMotion } = useGlassAccessibility()
  const rowOpacity = useSharedValue(1)
  const rowTranslateY = useSharedValue(0)
  const fillOpacity = useSharedValue(1)
  const valueScale = useSharedValue(1)
  const clamped = Math.max(0, Math.min(100, percent))

  useEffect(() => {
    rowOpacity.value = reduceMotion ? 1 : 0
    rowTranslateY.value = reduceMotion ? 0 : 4
    fillOpacity.value = reduceMotion ? 1 : 0.48
    valueScale.value = reduceMotion ? 1 : 0.96

    const duration = motionDuration(190, reduceMotion)
    rowOpacity.value = withDelay(reduceMotion ? 0 : delayMs, withTiming(1, { duration }))
    rowTranslateY.value = reduceMotion
      ? withTiming(0, { duration })
      : withDelay(delayMs, withSpring(0, motionTokens.liquid.entrance))
    fillOpacity.value = withDelay(reduceMotion ? 0 : delayMs + 35, withTiming(1, { duration }))
    valueScale.value = reduceMotion
      ? withTiming(1, { duration })
      : withDelay(delayMs + 35, withSpring(1, motionTokens.liquid.press))

    return () => {
      cancelAnimation(rowOpacity)
      cancelAnimation(rowTranslateY)
      cancelAnimation(fillOpacity)
      cancelAnimation(valueScale)
    }
  }, [delayMs, fillOpacity, reduceMotion, rowOpacity, rowTranslateY, value, valueScale])

  const rowMotionStyle = useAnimatedStyle(() => (
    reduceMotion
      ? { opacity: rowOpacity.value }
      : { opacity: rowOpacity.value, transform: [{ translateY: rowTranslateY.value }] }
  ), [reduceMotion])

  const fillMotionStyle = useAnimatedStyle(() => ({
    opacity: fillOpacity.value,
  }))

  const valueMotionStyle = useAnimatedStyle(() => (
    reduceMotion
      ? { opacity: rowOpacity.value }
      : { opacity: rowOpacity.value, transform: [{ scale: valueScale.value }] }
  ), [reduceMotion])

  return (
    <Animated.View style={[styles.matchingBarRow, rowMotionStyle]} testID={testID ? `${testID}-motion` : undefined}>
      <Text numberOfLines={1} style={[styles.matchingBarLabel, { color: tokens.muted }]}>{label}</Text>
      <View style={[styles.matchingBarTrack, { backgroundColor: tokens.border }]}>
        <Animated.View style={[styles.matchingBarFill, { width: `${clamped}%` }, fillMotionStyle]} />
      </View>
      <Animated.View style={[styles.matchingBarValueMotion, valueMotionStyle]} testID={testID ? `${testID}-value-motion` : undefined}>
        <Text numberOfLines={1} style={[styles.matchingBarValue, { color: tokens.text }]}>{value}</Text>
      </Animated.View>
    </Animated.View>
  )
}

function CaseDecisionPanel({ deal, screenId }: { deal: LocalDeal; screenId: CustomerV21ScreenId }) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const estimate = deal.estimate
  const workerName = deal.workerProfile?.fullName?.trim() || copy.dataPending
  const service = deal.draft.serviceType ? customerV21ServiceCopy[language][deal.draft.serviceType].label : copy.dataPending
  const problem = agenticDealProblemLabel(deal, language)
  const address = deal.broadcast?.generalArea || deal.draft.districtLabel || deal.draft.addressLabel || copy.dataPending
  const price = estimate?.priceRangeLabel || copy.dataPending
  const title = customerV21ScreenTitles[language][screenId]
  const actionLabel = screenId === '2.7-matching'
    ? (language === 'vi' ? 'Ghép theo công việc thật' : 'Real-job matching')
    : screenId === '2.8-options'
      ? (language === 'vi' ? 'Phương án có kiểm soát' : 'Controlled options')
      : (language === 'vi' ? 'Báo giá cần duyệt' : 'Approval-bound quote')

  return (
    <V21Card testID={`customer-v21-decision-panel-${screenId}`}>
      <SectionHeader eyebrow={caseDisplayCode(deal, language)} title={title} />
      <View style={styles.profileDetailHero}>
        <AssetTile image={caseScreenAsset(screenId)} label={title} size={58} />
        <View style={styles.flex}>
          <Text style={[styles.caseOverviewTitle, { color: tokens.text }]}>{actionLabel}</Text>
          <Text style={[styles.bodyText, { color: tokens.muted }]}>
            {screenId === '2.7-matching'
              ? (language === 'vi' ? 'NestScout chỉ mở thợ và điểm phù hợp khi hệ thống trả dữ liệu thật.' : 'NestScout opens worker and fit-score details only from real system data.')
              : screenId === '2.8-options'
                ? (language === 'vi' ? 'Phạm vi đề xuất bám theo estimate thật và luôn giữ quyền duyệt cho khách.' : 'Options follow the real estimate and keep customer approval authority.')
                : (language === 'vi' ? 'Giá hiển thị theo estimate/payment thật, không tự dựng paid state.' : 'Price uses real estimate/payment state; no paid state is invented.')}
          </Text>
        </View>
      </View>
      {screenId === '2.7-matching' ? (
        <>
          <MediaRow image={customerV21Assets.identity} label={language === 'vi' ? 'Thợ thật' : 'Real worker'} value={workerName} />
          <MediaRow image={customerV21Assets.request} label={language === 'vi' ? 'Dịch vụ cần ghép' : 'Service to match'} value={service} />
          <MediaRow image={customerV21Assets.map} label={language === 'vi' ? 'Khu vực' : 'Area'} value={address} />
        </>
      ) : null}
      {screenId === '2.8-options' ? (
        <>
          <MediaRow image={customerV21Assets.request} label={language === 'vi' ? 'Phạm vi' : 'Scope'} value={estimate?.advisory || problem} />
          <MediaRow image={customerV21Assets.shield} label={language === 'vi' ? 'Mức rủi ro' : 'Risk level'} value={estimate ? complexitySafetyLabel(estimate.complexity, language) : copy.dataPending} />
          <MediaRow image={customerV21Assets.payment} label={language === 'vi' ? 'Ước tính' : 'Estimate'} value={price} />
        </>
      ) : null}
      {screenId === '2.9-quotes' ? (
        <>
          <MediaRow image={customerV21Assets.payment} label={language === 'vi' ? 'Khoảng giá' : 'Price range'} value={price} />
          <MediaRow image={customerV21Assets.shield} label={language === 'vi' ? 'Ghi chú giá' : 'Price note'} value={estimate?.disclaimer || copy.dataPending} />
          <MediaRow image={customerV21Assets.identity} label={language === 'vi' ? 'Thợ' : 'Worker'} value={workerName} />
        </>
      ) : null}
      <InfoNotice
        body={language === 'vi'
          ? 'Mọi thợ, điểm, giá và quyết định đều phải đến từ quy trình thật.'
          : 'Worker, score, price, and decision data must come from the real workflow.'}
        image={customerV21Assets.shield}
        title={language === 'vi' ? 'Dữ liệu thật' : 'Real data'}
      />
    </V21Card>
  )
}

type CaseScopeRowTone = 'done' | 'active' | 'pending'

function CaseOptionsScreen({ deal }: { deal: LocalDeal }) {
  const language = useAppLanguage()
  const router = useRouter()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const estimate = deal.estimate
  const service = deal.draft.serviceType ? customerV21ServiceCopy[language][deal.draft.serviceType] : null
  const serviceLabel = service?.label ?? copy.dataPending
  const problem = agenticDealProblemLabel(deal, language)
  const advisory = estimate?.advisory || problem
  const price = estimate?.priceRangeLabel || copy.dataPending
  const time = timeChoiceLabel(deal.draft.timeChoice, language)
  const scopeRows = caseScopeRowsForDeal(deal, language)
  const serviceAsset = deal.draft.serviceType ? customerV21ServiceAssets[deal.draft.serviceType] : customerV21Assets.request
  const secondaryOptions = caseSecondaryOptionsForDeal(deal, language)

  return (
    <View testID="customer-v21-direct-screen-2.8-options">
      <V21Card glass style={styles.caseOptionHeroCard} testID="customer-v21-options-hero">
        <SourceCardSkin />
        <ZipMintAura scope="OptionsHero" testID="customer-v21-options-hero-mint-aura" />
        <View style={styles.caseSourceLayer}>
          <View style={styles.caseOptionBadgeTop}>
            <MatchingHandoffChip label={language === 'vi' ? 'Kael khuyên dùng' : 'Kael recommends'} tone="success" />
          </View>
          <View style={styles.caseOptionHeroMain}>
            <AssetTile image={customerV21Assets.shield} label={language === 'vi' ? 'Phương án' : 'Option'} size={46} sourceAura style={styles.caseOptionHeroIcon} />
            <View style={styles.flex}>
              <Text numberOfLines={2} style={[styles.caseOptionTitle, { color: tokens.text }]}>{advisory}</Text>
              <Text numberOfLines={2} style={[styles.caseOptionBody, { color: tokens.muted }]}>{problem}</Text>
            </View>
          </View>
          <View style={[styles.caseDivider, { backgroundColor: tokens.border }]} />
          <View style={styles.caseOptionMetricRow}>
            <View style={styles.caseOptionMetric}>
              <Text style={[styles.caseOptionMetricLabel, { color: tokens.muted }]}>{language === 'vi' ? 'Thời gian' : 'Time'}</Text>
              <Text style={[styles.caseOptionMetricValue, { color: tokens.text }]}>{time}</Text>
            </View>
            <View style={styles.caseOptionMetric}>
              <Text style={[styles.caseOptionMetricLabel, { color: tokens.muted }]}>{language === 'vi' ? 'Dự kiến' : 'Estimate'}</Text>
              <Text style={[styles.caseOptionMoney, { color: tokens.primary }]}>{price}</Text>
            </View>
            <MatchingHandoffChip label={estimate ? (language === 'vi' ? 'Theo dữ liệu' : 'Data based') : copy.dataPending} tone={estimate ? 'success' : 'unselected'} />
          </View>
        </View>
      </V21Card>

      <View style={styles.caseOptionChoiceStack}>
        {secondaryOptions.map((option) => (
          <CaseOptionChoiceCard
            body={option.body}
            image={option.image}
            key={option.title}
            rightLabel={option.rightLabel}
            testID={option.testID}
            title={option.title}
          />
        ))}
      </View>

      <SectionActionHeader
        action={language === 'vi' ? `${formatNumber(scopeRows.length, language)} hạng mục` : `${formatNumber(scopeRows.length, language)} items`}
        title={language === 'vi' ? 'Phạm vi phương án đề xuất' : 'Recommended scope'}
      />
      <V21Card style={styles.caseStepListCard} testID="customer-v21-options-scope">
        <SourceCardSkin />
        <ZipMintAura scope="OptionsScope" testID="customer-v21-options-scope-mint-aura" />
        <View style={styles.caseStepListContent}>
          {scopeRows.map((row) => (
            <CaseScopeStepRow key={row.label} label={row.label} state={row.state} value={row.value} />
          ))}
        </View>
      </V21Card>

      <CaseKaelSourceCard
        body={language === 'vi'
          ? 'Mọi thay đổi phạm vi hoặc giá đều cần duyệt trong quy trình.'
          : 'Scope or price changes must stay in the approval workflow.'}
        image={customerV21Assets.kaelHead}
        testID="customer-v21-options-kael-card"
        title={language === 'vi' ? 'Không tự ý phát sinh' : 'No silent changes'}
      />

      <KaelButton
        label={language === 'vi' ? 'Chọn phương án Kael đề xuất' : 'Choose Kael option'}
        onPress={() => router.replace('/(customer)/history?screen=2.9-quotes' as never)}
        style={styles.casePrimaryStageButton}
        testID="customer-v21-options-next"
      />

      <ActivityScreenCard active deal={deal} screenId="2.8-options" />
    </View>
  )
}

function CaseOptionChoiceCard({
  body,
  image,
  rightLabel,
  testID,
  title,
}: {
  body: string
  image: ImageSourcePropType
  rightLabel: string
  testID: string
  title: string
}) {
  const { tokens } = useV21Theme()
  return (
    <V21Card style={styles.caseOptionChoiceCard} testID={testID}>
      <SourceCardSkin />
      <ZipMintAura scope={testID.replace(/[^a-zA-Z0-9]/g, '')} />
      <View style={styles.caseSourceLayer}>
        <View style={styles.caseOptionChoiceContent}>
          <AssetTile image={image} label={title} size={38} sourceAura style={styles.caseOptionChoiceIcon} />
          <View style={styles.flex}>
            <Text numberOfLines={1} style={[styles.caseOptionChoiceTitle, { color: tokens.text }]}>{title}</Text>
            <Text numberOfLines={2} style={[styles.caseOptionChoiceBody, { color: tokens.muted }]}>{body}</Text>
          </View>
          <MatchingHandoffChip label={rightLabel} tone="selected" />
        </View>
      </View>
    </V21Card>
  )
}

function CaseScopeStepRow({ label, state, value }: { label: string; state: CaseScopeRowTone; value: string }) {
  const { tokens } = useV21Theme()
  const stateLabel = state === 'done' ? '✓' : state === 'active' ? '+' : '•'
  return (
    <View
      style={[
        styles.caseScopeStepRow,
        {
          backgroundColor: 'rgba(247,255,251,0.76)',
          borderColor: state === 'active' ? 'rgba(13,174,154,0.45)' : 'rgba(216,235,232,0.80)',
        },
      ]}
    >
      <View
        style={[
          styles.caseScopeStateDot,
          {
            backgroundColor: state === 'done' ? '#E6FBF3' : state === 'active' ? '#24B3A1' : '#EDF3F2',
            borderColor: state === 'active' ? '#24B3A1' : 'rgba(216,235,232,0.90)',
          },
        ]}
      >
        <Text style={[styles.caseScopeStateText, { color: state === 'active' ? '#FFFFFF' : tokens.primary }]}>{stateLabel}</Text>
      </View>
      <Text numberOfLines={1} style={[styles.caseScopeLabel, { color: tokens.text }]}>{label}</Text>
        <Text numberOfLines={1} style={[styles.caseScopeValue, { color: state === 'active' ? '#088779' : tokens.muted }]}>{value}</Text>
    </View>
  )
}

function CaseKaelSourceCard({
  body,
  image,
  testID,
  title,
}: {
  body: string
  image: ImageSourcePropType
  testID: string
  title: string
}) {
  const { tokens } = useV21Theme()
  const auraScope = testID.replace(/[^a-zA-Z0-9]/g, '')
  const usesWideAura =
    testID === 'customer-v21-location-kael-card' ||
    testID === 'customer-v21-live-alert-kael-card' ||
    testID === 'customer-v21-job-accepted-kael-card' ||
    testID === 'customer-v21-payment-review-kael-card' ||
    testID === 'customer-v21-payment-protected-kael-card'
  const usesPaymentProtectedAura = testID === 'customer-v21-payment-protected-kael-card'
  return (
    <V21Card style={[styles.caseKaelSourceCard, usesPaymentProtectedAura ? styles.caseKaelPaymentAuraCard : null]} testID={testID}>
      <SourceCardSkin />
      {usesPaymentProtectedAura ? <CaseWorkCardAura scope={`${auraScope}PaymentProtected`} testID={`${testID}-card-mint-aura`} /> : null}
      {usesWideAura ? <CaseWideMintAura scope={auraScope} testID={`${testID}-wide-mint-aura`} /> : null}
      <ZipMintAura scope={auraScope} testID={`${testID}-mint-aura`} />
      <View style={styles.caseKaelSourceContent}>
        <AssetTile image={image} label="Kael" size={38} sourceAura style={styles.caseKaelSourceIcon} />
        <View style={styles.flex}>
          <Text numberOfLines={1} style={[styles.caseKaelSourceTitle, { color: tokens.text }]}>{title}</Text>
          <Text numberOfLines={2} style={[styles.caseKaelSourceBody, { color: tokens.muted }]}>{body}</Text>
        </View>
        <Text style={[styles.chevronText, { color: tokens.primary }]}>›</Text>
      </View>
    </V21Card>
  )
}

function CaseQuotesScreen({ deal }: { deal: LocalDeal }) {
  const language = useAppLanguage()
  const router = useRouter()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const estimate = deal.estimate
  const payment = deal.payment
  const worker = deal.workerProfile
  const service = deal.draft.serviceType ? customerV21ServiceCopy[language][deal.draft.serviceType].label : copy.dataPending
  const workerName = worker?.fullName?.trim() || copy.dataPending
  const workerMeta = worker
    ? `${service} · ${formatWorkerJobs(worker.totalJobs, language)}`
    : `${service} · ${copy.dataPending}`
  const price = estimate?.priceRangeLabel || copy.dataPending
  const grossAmount = payment?.grossAmount === 0 || payment?.grossAmount ? formatVnd(payment.grossAmount, language) : null
  const platformFee = payment?.platformFee === 0 || payment?.platformFee ? formatVnd(payment.platformFee, language) : copy.dataPending
  const workerNet = payment?.workerNet === 0 || payment?.workerNet ? formatVnd(payment.workerNet, language) : copy.dataPending
  const total = grossAmount ?? price
  const canOpenPayment = Boolean(payment?.grossAmount === 0 || payment?.grossAmount)
  const scopeRows = caseScopeRowsForDeal(deal, language).slice(0, 4)

  return (
    <View testID="customer-v21-direct-screen-2.9-quotes">
      <V21Card glass style={styles.caseQuoteLedgerCard} testID="customer-v21-quote-ledger-card">
        <SourceCardSkin />
        <ZipMintAura scope="QuoteLedger" testID="customer-v21-quote-ledger-mint-aura" />
        <View style={styles.caseSourceLayer}>
          <View style={styles.caseQuoteWorkerRow}>
            <CaseWorkerAvatar name={workerName} uri={worker?.avatarUrl ?? null} />
            <View style={styles.flex}>
              <Text numberOfLines={1} style={[styles.caseQuoteWorkerName, { color: tokens.text }]}>{workerName}</Text>
              <Text numberOfLines={1} style={[styles.caseQuoteWorkerMeta, { color: tokens.muted }]}>{workerMeta}</Text>
            </View>
            <MatchingHandoffChip label={worker ? (language === 'vi' ? 'Đã xác minh' : 'Verified') : copy.dataPending} tone={worker ? 'success' : 'unselected'} />
          </View>

          <View style={[styles.caseDivider, { backgroundColor: tokens.border }]} />

          <View style={styles.casePriceLines} testID="customer-v21-quote-price-lines">
            <QuotePriceLine label={language === 'vi' ? 'Ước tính Kael' : 'Kael estimate'} value={price} />
            <QuotePriceLine label={language === 'vi' ? 'Phạm vi' : 'Scope'} value={agenticDealProblemLabel(deal, language)} />
            <QuotePriceLine label={language === 'vi' ? 'Phí bảo vệ' : 'Protection fee'} value={platformFee} />
            <QuotePriceLine label={language === 'vi' ? 'Tổng thanh toán' : 'Total'} total value={total} />
          </View>
        </View>
      </V21Card>

      <SectionActionHeader
        action={language === 'vi' ? `${formatNumber(scopeRows.length, language)} mục` : `${formatNumber(scopeRows.length, language)} items`}
        title={language === 'vi' ? 'Phạm vi cam kết' : 'Committed scope'}
      />
      <V21Card style={styles.caseStepListCard} testID="customer-v21-quote-scope">
        <SourceCardSkin />
        <ZipMintAura scope="QuoteScope" testID="customer-v21-quote-scope-mint-aura" />
        <View style={styles.caseStepListContent}>
          {scopeRows.map((row) => (
            <CaseScopeStepRow key={row.label} label={row.label} state={row.state} value={row.value} />
          ))}
        </View>
      </V21Card>

      <View style={styles.caseQuoteStatGrid} testID="customer-v21-quote-stat-grid">
        <CaseMiniStat label={language === 'vi' ? 'Thợ nhận' : 'Worker net'} value={workerNet} />
        <CaseMiniStat label={language === 'vi' ? 'Bảo hành' : 'Warranty'} value={copy.dataPending} />
      </View>

      <CaseKaelSourceCard
        body={language === 'vi'
          ? 'Báo giá chỉ mở theo estimate hoặc payment thật từ hệ thống.'
          : 'Quote data opens only from real estimate or payment state.'}
        image={customerV21Assets.shield}
        testID="customer-v21-quote-kael-card"
        title={language === 'vi' ? 'Báo giá theo quy trình' : 'Workflow quote'}
      />

      <View style={styles.caseQuoteButtonRow}>
        <KaelButton
          label={language === 'vi' ? 'Yêu cầu chỉnh sửa' : 'Request edit'}
          onPress={() => router.replace(customerCaseWorkRouteForDeal(deal) as never)}
          size="small"
          style={styles.caseQuoteButton}
          testID="customer-v21-quote-edit"
          variant="secondary"
        />
        <KaelButton
          disabled={!canOpenPayment}
          label={language === 'vi' ? 'Duyệt báo giá' : 'Approve quote'}
          onPress={() => router.replace('/(customer)/history?screen=3.1-payment-review' as never)}
          size="small"
          style={styles.caseQuoteButton}
          testID="customer-v21-quote-approve"
        />
      </View>

      <CaseWorkDataSourceFooter code={caseDisplayCode(deal, language)} testID="customer-v21-quote-data-source" />
      <ActivityScreenCard active deal={deal} screenId="2.9-quotes" />
    </View>
  )
}

function QuotePriceLine({ label, total = false, value }: { label: string; total?: boolean; value: string }) {
  const { tokens } = useV21Theme()
  return (
    <View style={total ? styles.casePriceTotalLine : styles.casePriceLine}>
      <Text numberOfLines={1} style={[total ? styles.casePriceTotalLabel : styles.casePriceLabel, { color: total ? tokens.text : tokens.muted }]}>{label}</Text>
      <Text numberOfLines={1} style={[total ? styles.casePriceTotalValue : styles.casePriceValue, { color: total ? tokens.primary : tokens.text }]}>{value}</Text>
    </View>
  )
}

function CaseMiniStat({ label, value }: { label: string; value: string }) {
  const { tokens } = useV21Theme()
  return (
    <View style={[styles.caseMiniStat, { backgroundColor: 'rgba(255,255,255,0.91)', borderColor: 'rgba(216,235,232,0.92)' }]}>
      <SourceCardSkin />
      <ZipMintAura scope={label.replace(/[^a-zA-Z0-9]/g, '')} />
      <View style={styles.caseSourceLayer}>
        <Text numberOfLines={1} style={[styles.caseMiniStatLabel, { color: tokens.muted }]}>{label}</Text>
        <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={[styles.caseMiniStatValue, { color: tokens.text }]}>{value}</Text>
      </View>
    </View>
  )
}

function CaseWorkerAvatar({ name, uri }: { name: string; uri: string | null }) {
  const { tokens } = useV21Theme()
  return (
    <View style={[styles.caseWorkerAvatar, { backgroundColor: '#E6FBF3', borderColor: 'rgba(216,235,232,0.92)' }]}>
      {uri ? (
        <Image resizeMode="cover" source={{ uri }} style={styles.caseWorkerAvatarImage} />
      ) : (
        <Text style={[styles.caseWorkerAvatarText, { color: tokens.primary }]}>{initialsForName(name)}</Text>
      )}
    </View>
  )
}

function CaseLocationEtaScreen({ deal }: { deal: LocalDeal }) {
  const language = useAppLanguage()
  const router = useRouter()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const worker = deal.workerProfile
  const workerName = worker?.fullName?.trim() || copy.dataPending
  const address = caseAddressLabel(deal, language)
  const eta = typeof deal.broadcast?.secondsRemaining === 'number'
    ? formatDurationShort(deal.broadcast.secondsRemaining, language)
    : copy.dataPending
  const etaLabel = language === 'vi' ? 'Thời gian đến' : 'ETA'
  const hasEta = typeof deal.broadcast?.secondsRemaining === 'number'
  const timelineRows = caseEtaTimelineRows(deal, language)

  return (
    <View testID="customer-v21-direct-screen-2.10-location-eta">
      <CaseMapPreview
        address={address}
        eta={eta}
        etaLabel={etaLabel}
        status={customerV21StatusCopy[language][deal.status]}
        uri={worker?.avatarUrl ?? null}
        workerName={workerName}
      />

      <SectionActionHeader
        action={hasEta ? (language === 'vi' ? 'Trực tiếp' : 'Live') : copy.dataPending}
        title={language === 'vi' ? 'Hành trình trực tiếp' : 'Live route'}
      />
      <V21Card style={styles.caseTimelineCard} testID="customer-v21-location-timeline">
        <SourceCardSkin />
        <ZipMintAura scope="LocationTimeline" testID="customer-v21-location-timeline-mint-aura" />
        <View style={styles.caseTimelineContent}>
          <View pointerEvents="none" style={styles.caseTimelineRail} testID="customer-v21-location-timeline-rail" />
          {timelineRows.map((row) => (
            <CaseTimelineItem body={row.body} key={row.title} state={row.state} title={row.title} />
          ))}
        </View>
      </V21Card>

      <View style={styles.caseLocationActionRow}>
        <KaelButton
          disabled={!worker}
          label={language === 'vi' ? 'Nhắn thợ' : 'Message worker'}
          onPress={() => router.replace(customerCaseWorkRouteForDeal(deal) as never)}
          size="small"
          style={styles.caseLocationActionButton}
          testID="customer-v21-location-message-worker"
          variant="secondary"
        />
        <KaelButton
          disabled
          label={language === 'vi' ? 'Gọi thợ' : 'Call worker'}
          onPress={() => undefined}
          size="small"
          style={styles.caseLocationActionButton}
          testID="customer-v21-location-call-worker"
          variant="secondary"
        />
      </View>

      <CaseKaelSourceCard
        body={hasEta
          ? (language === 'vi' ? 'Kael sẽ nhắc khi thời gian đến thay đổi.' : 'Kael will alert when ETA changes.')
          : (language === 'vi' ? 'Chờ thời gian đến thật từ hệ thống.' : 'Waiting for real system ETA.')}
        image={customerV21Assets.kaelHead}
        testID="customer-v21-location-kael-card"
        title={language === 'vi' ? 'Kael đang theo dõi thời gian đến' : 'Kael tracks ETA'}
      />

      <KaelButton
        disabled={!hasEta}
        label={language === 'vi' ? 'Xem cảnh báo sắp đến' : 'View arrival alert'}
        onPress={() => router.replace('/(customer)/history?screen=2.11-live-alert' as never)}
        style={styles.casePrimaryStageButton}
        testID="customer-v21-location-alert-next"
      />

      <ActivityScreenCard active deal={deal} screenId="2.10-location-eta" />
    </View>
  )
}

function CaseLiveAlertScreen({ deal }: { deal: LocalDeal }) {
  const language = useAppLanguage()
  const router = useRouter()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const screenId = '2.11-live-alert' as const
  const eta = typeof deal.broadcast?.secondsRemaining === 'number'
    ? formatDurationShort(deal.broadcast.secondsRemaining, language)
    : copy.dataPending
  const hasEta = typeof deal.broadcast?.secondsRemaining === 'number'
  const workerName = deal.workerProfile?.fullName?.trim() || copy.dataPending
  const address = caseAddressLabel(deal, language)
  const status = customerV21StatusCopy[language][deal.status]
  const active = screenIdsForStatus(deal.status).includes(screenId)
  const canMessageWorker = Boolean(deal.workerProfile && deal.id)

  return (
    <View testID="customer-v21-live-alert-stage">
      <V21Card glass style={[styles.fulfillmentHeroCard, styles.fulfillmentHeroCentered]} testID="customer-v21-live-alert-hero">
        <SourceCardSkin />
        <CaseWideMintAura scope="LiveAlertHero" testID="customer-v21-live-alert-hero-mint-aura" />
        <EyebrowPill
          label={language === 'vi' ? 'Thời gian sắp đến' : 'Upcoming time'}
          preserveCase
          style={styles.fulfillmentHeroPill}
          testID="customer-v21-live-alert-time-pill"
        />
        <Text style={[styles.fulfillmentCaption, { color: tokens.muted }]}>{workerName}</Text>
        <Text adjustsFontSizeToFit minimumFontScale={0.76} numberOfLines={1} style={[styles.liveAlertTime, { color: tokens.primary }]}>{eta}</Text>
        <Text style={[styles.bodyText, styles.fulfillmentCenteredText, { color: tokens.muted }]}>
          {language === 'vi' ? 'Chuẩn bị lối vào và khu vực thao tác.' : 'Prepare the entrance and work area.'}
        </Text>
        <View style={styles.fulfillmentChipRow}>
          <MatchingHandoffChip label={hasEta ? eta : copy.dataPending} testID="customer-v21-live-alert-eta-chip" tone={hasEta ? 'success' : 'selected'} />
          <MatchingHandoffChip label={status} testID="customer-v21-live-alert-status-chip" tone="selected" />
        </View>
      </V21Card>

      <SectionActionHeader
        action={language === 'vi' ? 'Gửi cho thợ' : 'Send to worker'}
        title={language === 'vi' ? 'Hướng dẫn tiếp cận' : 'Access guide'}
      />
      <V21Card style={styles.fulfillmentListCard} testID="customer-v21-live-alert-access">
        <SourceCardSkin />
        <CaseWideMintAura scope="LiveAlertAccess" testID="customer-v21-live-alert-access-mint-aura" />
        <FulfillmentInfoRow
          body={deal.broadcast?.fullAddressVisible ? address : copy.dataPending}
          image={customerV21Assets.home}
          rightLabel={deal.broadcast?.fullAddressVisible ? (language === 'vi' ? 'Đã chia sẻ' : 'Shared') : undefined}
          title={language === 'vi' ? 'Địa điểm vào nhà' : 'Entry point'}
        />
        <FulfillmentInfoRow
          body={language === 'vi' ? 'Chỉ đọc mã khi đúng thợ đến nơi.' : 'Read only after the right worker arrives.'}
          image={customerV21Assets.shield}
          title={language === 'vi' ? 'Mã xác minh đến nơi' : 'Arrival code'}
        />
        <ArrivalCodeBox code={null} label={copy.dataPending} />
      </V21Card>

      <View style={styles.fulfillmentKaelCardWrap}>
        <CaseKaelSourceCard
          body={language === 'vi' ? 'Mã này chỉ mở khi hệ thống có xác minh đến nơi thật.' : 'This code opens only after a real arrival signal.'}
          image={customerV21Assets.kaelHead}
          testID="customer-v21-live-alert-kael-card"
          title={language === 'vi' ? 'Không chia sẻ mã quá sớm' : 'Do not share the code early'}
        />
      </View>

      <View style={styles.caseLocationActionRow}>
        <KaelButton
          disabled={!canMessageWorker}
          label={language === 'vi' ? 'Nhắn cho thợ' : 'Message worker'}
          onPress={() => router.replace(customerCaseWorkRouteForDeal(deal) as never)}
          size="small"
          style={styles.caseLocationActionButton}
          testID="customer-v21-live-alert-message-worker"
          variant="secondary"
        />
        <KaelButton
          backgroundLayer={<CaseWorkActionButtonAura scope="LiveAlertReady" />}
          label={language === 'vi' ? 'Tôi đã sẵn sàng' : 'I am ready'}
          onPress={() => router.replace('/(customer)/history?screen=2.12-job-accepted' as never)}
          size="small"
          style={styles.caseLocationActionButton}
          testID="customer-v21-live-alert-ready"
        />
      </View>

      <ActivityScreenCard active={active} deal={deal} screenId={screenId} />
    </View>
  )
}

function CaseJobAcceptedScreen({ deal }: { deal: LocalDeal }) {
  const language = useAppLanguage()
  const router = useRouter()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const screenId = '2.12-job-accepted' as const
  const workerName = deal.workerProfile?.fullName?.trim() || copy.dataPending
  const address = caseAddressLabel(deal, language)
  const status = customerV21StatusCopy[language][deal.status]
  const arrived = isArrivalConfirmedStatus(deal.status)
  const paymentReady = Boolean(deal.payment)
  const scopeLabel = currentScopeLabel(deal, language)
  const active = screenIdsForStatus(deal.status).includes(screenId)

  return (
    <View testID="customer-v21-job-accepted-stage">
      <V21Card glass style={[styles.fulfillmentHeroCard, styles.fulfillmentHeroCentered]} testID="customer-v21-job-accepted-hero">
        <SourceCardSkin />
        <CaseWideMintAura scope="JobAcceptedHero" testID="customer-v21-job-accepted-hero-mint-aura" />
        <CaseSuccessEmblem done={arrived || Boolean(deal)} />
        <Text style={[styles.caseOverviewTitle, styles.fulfillmentCenteredText, { color: tokens.text }]}>
          {language === 'vi' ? 'Thông tin đơn đã được xác nhận' : 'Job confirmation'}
        </Text>
        <Text style={[styles.bodyText, styles.fulfillmentCenteredText, { color: tokens.muted }]}>
          {language === 'vi' ? 'Đúng thợ · đúng lịch · đúng công việc.' : 'Right worker · right schedule · right job.'}
        </Text>
        <View style={styles.fulfillmentChipRow}>
          <MatchingHandoffChip label={status} testID="customer-v21-job-accepted-status-chip" tone="success" />
        </View>
      </V21Card>

      <SectionActionHeader action={language === 'vi' ? 'Chi tiết' : 'Details'} title={language === 'vi' ? 'Ba lớp xác minh' : 'Three verification layers'} />
      <V21Card style={styles.fulfillmentListCard} testID="customer-v21-job-accepted-verification">
        <SourceCardSkin />
        <CaseWideMintAura scope="JobAcceptedVerification" testID="customer-v21-job-accepted-verification-mint-aura" />
        <ZipMintAura scope="JobAcceptedVerificationFine" testID="customer-v21-job-accepted-verification-zip-mint-aura" />
        <View style={styles.fulfillmentStepList}>
          <CaseFulfillmentStep
            body={workerName}
            state={deal.workerProfile ? 'done' : 'pending'}
            title={language === 'vi' ? 'Hồ sơ thợ' : 'Worker identity'}
          />
          <CaseFulfillmentStep
            body={arrived ? (language === 'vi' ? 'Đã xác nhận' : 'Confirmed') : copy.dataPending}
            state={arrived ? 'done' : 'active'}
            title={language === 'vi' ? 'Mã đến nơi' : 'Arrival code'}
          />
          <CaseFulfillmentStep
            body={paymentReady ? (language === 'vi' ? 'Đã có lệnh' : 'Order ready') : copy.dataPending}
            state={paymentReady ? 'done' : 'pending'}
            title={language === 'vi' ? 'Thanh toán bảo vệ' : 'Protected payment'}
          />
        </View>
      </V21Card>

      <V21Card style={styles.fulfillmentListCard} testID="customer-v21-job-accepted-worker">
        <SourceCardSkin />
        <CaseWideMintAura scope="JobAcceptedWorker" testID="customer-v21-job-accepted-worker-mint-aura" />
        <View style={styles.fulfillmentWorkerRow}>
          <CaseWorkerAvatar name={workerName} uri={deal.workerProfile?.avatarUrl ?? null} />
          <View style={styles.flex}>
            <Text numberOfLines={1} style={[styles.cardTitle, { color: tokens.text }]}>{workerName}</Text>
            <Text numberOfLines={2} style={[styles.bodyText, { color: tokens.muted }]}>
              {arrived
                ? (language === 'vi' ? `Đã đến ${address}` : `Arrived at ${address}`)
                : (language === 'vi' ? 'Chờ xác minh đến nơi.' : 'Waiting for arrival verification.')}
            </Text>
          </View>
          <MatchingHandoffChip label={status} testID="customer-v21-job-accepted-worker-status-chip" tone="selected" />
        </View>
        <View style={[styles.fulfillmentDivider, { backgroundColor: tokens.border }]} />
        <View style={styles.fulfillmentScopeRow}>
          <Text numberOfLines={1} style={[styles.fulfillmentScopeLabel, { color: tokens.muted }]}>
            {language === 'vi' ? 'Phạm vi hiện tại' : 'Current scope'}
          </Text>
          <Text numberOfLines={2} style={[styles.fulfillmentScopeValue, { color: tokens.text }]}>
            {scopeLabel}
          </Text>
        </View>
      </V21Card>

      <View style={styles.fulfillmentKaelCardWrap}>
        <CaseKaelSourceCard
          body={language === 'vi' ? 'Bằng chứng, checklist và thay đổi phạm vi tiếp tục nằm trong cùng công việc thật.' : 'Evidence, checklist, and scope changes stay inside the same real job.'}
          image={customerV21Assets.kaelHead}
          testID="customer-v21-job-accepted-kael-card"
          title={language === 'vi' ? 'Kael đã mở bảng công việc' : 'Kael opened the job cockpit'}
        />
      </View>

      <KaelButton
        backgroundLayer={<CaseWorkActionButtonAura scope="JobAcceptedProgress" />}
        disabled={!isWorkStartedStatus(deal.status)}
        label={language === 'vi' ? 'Xem công việc đang diễn ra' : 'View work progress'}
        onPress={() => router.replace('/(customer)/history?screen=2.13-job-progress' as never)}
        style={styles.casePrimaryStageButton}
        testID="customer-v21-job-accepted-progress-next"
      />
      <ActivityScreenCard active={active} deal={deal} screenId={screenId} />
    </View>
  )
}

function CaseJobProgressScreen({ deal }: { deal: LocalDeal }) {
  const language = useAppLanguage()
  const router = useRouter()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const screenId = '2.13-job-progress' as const
  const status = customerV21StatusCopy[language][deal.status]
  const progress = workProgressPercent(deal.status)
  const started = isWorkStartedStatus(deal.status)
  const evidenceCount = (deal.draft.mediaCount ?? 0) + (deal.completionPhotoUrls?.length ?? 0)
  const active = screenIdsForStatus(deal.status).includes(screenId)
  const riskTone = deal.scopeChange || started ? 'success' : 'unselected'
  const riskLabel = deal.scopeChange
    ? (language === 'vi' ? 'Cần duyệt' : 'Needs approval')
    : started
      ? (language === 'vi' ? 'An toàn' : 'Safe')
      : copy.dataPending

  return (
    <View testID="customer-v21-job-progress-stage">
      <V21Card glass style={[styles.fulfillmentHeroCard, styles.jobProgressHeroCard]} testID="customer-v21-job-progress-hero">
        <SourceCardSkin />
        <CaseWideMintAura scope="JobProgressHero" testID="customer-v21-job-progress-hero-mint-aura" />
        <ZipMintAura scope="JobProgressHeroFine" testID="customer-v21-job-progress-hero-zip-mint-aura" />
        <View style={styles.fulfillmentProgressHeroRow}>
          <View style={styles.flex}>
            <MatchingHandoffChip label={status} testID="customer-v21-job-progress-status-chip" tone="success" />
            <Text adjustsFontSizeToFit minimumFontScale={0.76} numberOfLines={1} style={[styles.jobProgressValue, { color: tokens.text }]}>
              {started ? `${progress}%` : copy.dataPending}
            </Text>
            <Text style={[styles.bodyText, { color: tokens.muted }]}>
              {started
                ? (language === 'vi' ? 'Tiến độ lấy từ trạng thái công việc thật.' : 'Progress follows the real job state.')
                : (language === 'vi' ? 'Chờ công việc thật bắt đầu.' : 'Waiting for real work to start.')}
            </Text>
          </View>
          <AssetTile image={customerV21Assets.clock} label={customerV21ScreenTitles[language][screenId]} size={58} sourceAura style={styles.fulfillmentProgressIcon} testID="customer-v21-job-progress-clock-icon" />
        </View>
        <AnimatedStageProgressBar active={started} progress={progress} />
      </V21Card>

      <SectionActionHeader action={started ? (language === 'vi' ? 'Trực tiếp' : 'Live') : copy.dataPending} title={language === 'vi' ? 'Tiến trình công việc' : 'Work progress'} />
      <V21Card style={styles.fulfillmentListCard} testID="customer-v21-job-progress-steps">
        <SourceCardSkin />
        <CaseWideMintAura scope="JobProgressSteps" testID="customer-v21-job-progress-steps-mint-aura" />
        <View style={styles.fulfillmentStepList}>
          {caseJobProgressSteps(deal.status, language).map((step) => (
            <CaseFulfillmentStep body={step.body} key={step.title} state={step.state} title={step.title} />
          ))}
        </View>
      </V21Card>

      <SectionActionHeader action={formatEvidenceFileCount(evidenceCount, language)} title={language === 'vi' ? 'Bằng chứng hiện trường' : 'On-site evidence'} titleTestID="customer-v21-job-progress-evidence-title" />
      <V21Card style={styles.fulfillmentListCard} testID="customer-v21-job-progress-evidence">
        <SourceCardSkin />
        <CaseWideMintAura scope="JobProgressEvidence" testID="customer-v21-job-progress-evidence-mint-aura" />
        <CaseStageMediaStrip count={evidenceCount} />
      </V21Card>

      <V21Card style={styles.fulfillmentListCard} testID="customer-v21-job-progress-risk">
        <SourceCardSkin />
        <CaseWideMintAura scope="JobProgressRisk" testID="customer-v21-job-progress-risk-mint-aura" />
        <View style={styles.jobProgressRiskRow}>
          <AssetTile image={customerV21Assets.shield} label={language === 'vi' ? 'Rủi ro' : 'Risk'} size={44} sourceAura style={styles.jobProgressRiskIcon} />
          <View style={styles.flex}>
            <Text numberOfLines={1} style={[styles.cardTitle, { color: tokens.text }]}>{language === 'vi' ? 'Rủi ro & phạm vi' : 'Risk and scope'}</Text>
            <Text numberOfLines={2} style={[styles.bodyText, { color: tokens.muted }]}>
              {deal.scopeChange?.reason
                || (started
                  ? (language === 'vi' ? 'Kael theo dõi phát sinh theo dữ liệu thật.' : 'Kael monitors real scope changes.')
                  : copy.dataPending)}
            </Text>
          </View>
          <MatchingHandoffChip label={riskLabel} style={styles.jobProgressRiskChip} testID="customer-v21-job-progress-risk-chip" tone={riskTone} />
        </View>
      </V21Card>

      <View style={styles.caseLocationActionRow}>
        <KaelButton
          backgroundLayer={<CaseWorkActionButtonAura scope="JobProgressKael" />}
          label={language === 'vi' ? 'Nhắn Kael' : 'Message Kael'}
          onPress={() => router.replace(customerCaseWorkRouteForDeal(deal) as never)}
          size="small"
          style={styles.caseLocationActionButton}
          testID="customer-v21-job-progress-open-kael"
          variant="secondary"
        />
        <KaelButton
          backgroundLayer={<CaseWorkActionButtonAura scope="JobProgressWork" />}
          label={language === 'vi' ? 'Mở xử lý công việc' : 'Open work handling'}
          onPress={() => router.replace(customerCaseWorkRouteForDeal(deal) as never)}
          size="small"
          style={styles.caseLocationActionButton}
          testID="customer-v21-job-progress-open-case-work"
        />
      </View>

      <CompletionStateSummary deal={deal} />
      <ActivityScreenCard active={active} deal={deal} screenId={screenId} />
    </View>
  )
}

function AnimatedStageProgressBar({ active, progress }: { active: boolean; progress: number }) {
  const { reduceMotion } = useV21Theme()
  const clamped = Math.max(0, Math.min(100, progress))
  const fillWidth = useSharedValue(clamped)
  const sheenX = useSharedValue(-96)
  const sheenOpacity = useSharedValue(0)

  useEffect(() => {
    cancelAnimation(fillWidth)
    cancelAnimation(sheenX)
    cancelAnimation(sheenOpacity)

    if (reduceMotion) {
      fillWidth.value = clamped
      sheenX.value = -96
      sheenOpacity.value = 0
      return
    }

    fillWidth.value = 0
    fillWidth.value = withTiming(clamped, { duration: motionDuration(active ? 720 : 480, reduceMotion) })
    sheenX.value = -96
    sheenOpacity.value = withTiming(1, { duration: motionDuration(120, reduceMotion) })
    sheenX.value = withTiming(280, { duration: motionDuration(860, reduceMotion) })
    sheenOpacity.value = withDelay(700, withTiming(0, { duration: motionDuration(170, reduceMotion) }))

    return () => {
      cancelAnimation(fillWidth)
      cancelAnimation(sheenX)
      cancelAnimation(sheenOpacity)
    }
  }, [active, clamped, fillWidth, reduceMotion, sheenOpacity, sheenX])

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fillWidth.value}%`,
  }))

  const sheenStyle = useAnimatedStyle(() => ({
    opacity: sheenOpacity.value,
    transform: [{ translateX: sheenX.value }],
  }))

  return (
    <View style={styles.stageProgressBar} testID="customer-v21-job-progress-bar">
      <View pointerEvents="none" style={styles.stageProgressTrackAura} />
      <Animated.View pointerEvents="none" style={[styles.stageProgressSheen, sheenStyle]} testID="customer-v21-job-progress-bar-sheen" />
      <Animated.View style={[styles.stageProgressFill, fillStyle]} testID="customer-v21-job-progress-bar-fill">
        <View pointerEvents="none" style={styles.stageProgressFillHighlight} />
      </Animated.View>
    </View>
  )
}

type FulfillmentStepState = 'active' | 'done' | 'pending'

function FulfillmentInfoRow({
  body,
  image,
  rightLabel,
  title,
}: {
  body: string
  image: ImageSourcePropType
  rightLabel?: string
  title: string
}) {
  const { tokens } = useV21Theme()
  return (
    <View style={[styles.fulfillmentListRow, { borderBottomColor: tokens.border }]}>
      <AssetTile image={image} label={title} size={34} sourceAura style={styles.fulfillmentListIcon} />
      <View style={styles.flex}>
        <Text numberOfLines={1} style={[styles.fulfillmentRowTitle, { color: tokens.text }]}>{title}</Text>
        <Text numberOfLines={2} style={[styles.fulfillmentRowBody, { color: tokens.muted }]}>{body}</Text>
      </View>
      {rightLabel ? <MatchingHandoffChip label={rightLabel} tone="success" /> : null}
    </View>
  )
}

function ArrivalCodeBox({ code, label }: { code: string | null; label: string }) {
  const { tokens } = useV21Theme()
  const digits = code && /^\d{4}$/.test(code) ? code.split('') : null

  if (!digits) {
    return (
      <View style={styles.arrivalCodePendingWrap} testID="customer-v21-arrival-code-pending">
        <View style={styles.arrivalCodeBox}>
          {Array.from({ length: 4 }).map((_, index) => (
            <View key={index} style={[styles.arrivalCodeDigit, styles.arrivalCodeDigitPending, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
              <Text style={[styles.arrivalCodeDigitText, { color: tokens.muted }]}>•</Text>
            </View>
          ))}
        </View>
        <View style={[styles.arrivalCodePending, { backgroundColor: tokens.service, borderColor: tokens.border }]} testID="customer-v21-arrival-code-pending-pill">
          <Text style={[styles.arrivalCodePendingText, { color: tokens.muted }]}>{label}</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.arrivalCodeBox} testID="customer-v21-arrival-code-box">
      {digits.map((digit, index) => (
        <View key={`${digit}-${index}`} style={[styles.arrivalCodeDigit, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
          <Text style={[styles.arrivalCodeDigitText, { color: tokens.text }]}>{digit}</Text>
        </View>
      ))}
    </View>
  )
}

function CaseSuccessEmblem({ done }: { done: boolean }) {
  const { tokens } = useV21Theme()
  return (
    <View style={[styles.successEmblem, !done ? styles.successEmblemPending : null]} testID="customer-v21-job-accepted-emblem">
      <SuccessEmblemAura done={done} />
      <View style={[styles.successEmblemCore, { backgroundColor: done ? tokens.primary : tokens.raised, borderColor: 'rgba(255,255,255,0.82)' }]}>
        <Text style={[styles.successEmblemText, { color: done ? '#FFFFFF' : tokens.muted }]}>{done ? '✓' : '•'}</Text>
      </View>
    </View>
  )
}

function SuccessEmblemAura({ done }: { done: boolean }) {
  const { reduceTransparency } = useV21Theme()

  if (reduceTransparency) {
    return null
  }

  return (
    <View pointerEvents="none" style={styles.successEmblemAura} testID="customer-v21-job-accepted-emblem-aura">
      <Svg height="104" preserveAspectRatio="none" viewBox="0 0 104 104" width="104">
        <Defs>
          <RadialGradient id="successEmblemAuraCore" cx="45%" cy="34%" r="70%">
            <Stop offset="0" stopColor={done ? '#F4FFFC' : '#FAFFFD'} />
            <Stop offset="0.52" stopColor={done ? '#CBF8EE' : '#DDF7F0'} />
            <Stop offset="1" stopColor={done ? '#7EDCCA' : '#AEE8DC'} />
          </RadialGradient>
          <RadialGradient id="successEmblemAuraEdge" cx="50%" cy="52%" r="58%">
            <Stop offset="0" stopColor="rgba(255,255,255,0.10)" />
            <Stop offset="0.58" stopColor="rgba(63,223,202,0.12)" />
            <Stop offset="1" stopColor="rgba(63,223,202,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#successEmblemAuraCore)" height="104" rx="34" width="104" />
        <Rect fill="url(#successEmblemAuraEdge)" height="104" rx="34" width="104" />
      </Svg>
    </View>
  )
}

function CaseFulfillmentStep({
  body,
  state,
  title,
}: {
  body: string
  state: FulfillmentStepState
  title: string
}) {
  const { tokens } = useV21Theme()
  const active = state === 'active'
  const done = state === 'done'
  const highlighted = active || done
  return (
    <View style={[
      styles.fulfillmentStep,
      {
        backgroundColor: highlighted ? tokens.service : 'rgba(255,255,255,0.80)',
        borderColor: highlighted ? 'rgba(85,214,195,0.36)' : 'rgba(204,235,229,0.82)',
      },
    ]}>
      <View style={[
        styles.fulfillmentStepState,
        {
          backgroundColor: highlighted ? tokens.primary : 'rgba(255,255,255,0.74)',
          borderColor: highlighted ? tokens.primary : 'rgba(204,235,229,0.88)',
        },
      ]}>
        <Text style={[styles.fulfillmentStepStateText, { color: highlighted ? '#FFFFFF' : tokens.muted }]}>{done ? '✓' : active ? '•' : ''}</Text>
      </View>
      <View style={styles.flex}>
        <Text numberOfLines={1} style={[styles.fulfillmentStepTitle, { color: tokens.text }]}>{title}</Text>
        <Text numberOfLines={1} style={[styles.fulfillmentStepBody, { color: highlighted ? tokens.primary : tokens.muted }]}>{body}</Text>
      </View>
    </View>
  )
}

function CaseStageMediaStrip({ count }: { count: number }) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const visibleCount = Math.min(Math.max(count, 0), 3)

  if (visibleCount === 0) {
    return (
      <View style={[styles.stageMediaEmpty, { backgroundColor: tokens.service, borderColor: tokens.border }]} testID="customer-v21-job-progress-media-empty">
        <Text style={[styles.arrivalCodePendingText, { color: tokens.muted }]}>{customerV21CommonCopy[language].dataPending}</Text>
      </View>
    )
  }

  return (
    <View style={styles.stageMediaStrip} testID="customer-v21-job-progress-media-strip">
      {Array.from({ length: visibleCount }).map((_, index) => {
        const remaining = count - index
        const label = index === 2 && remaining > 1 ? `+${remaining}` : String(index + 1)
        return (
          <View key={index} style={styles.stageMediaThumb}>
            <View style={styles.stageMediaThumbGlow} />
            <Text style={styles.stageMediaTag}>{label}</Text>
          </View>
        )
      })}
    </View>
  )
}

function CaseMapPreview({
  address,
  eta,
  etaLabel,
  status,
  uri,
  workerName,
}: {
  address: string
  eta: string
  etaLabel: string
  status: string
  uri: string | null
  workerName: string
}) {
  const { tokens } = useV21Theme()
  return (
    <View style={styles.caseMapCard} testID="customer-v21-location-map-card">
      <CaseMapCanvas />
      <CaseMapAuraLayer scope="LocationMap" testID="customer-v21-location-map-mint-aura" />
      <CaseMapPin style={styles.caseMapPinStart} />
      <CaseMapPin style={styles.caseMapPinEnd} />
      <View style={[styles.caseMapFloat, { backgroundColor: 'rgba(255,255,255,0.90)', borderColor: 'rgba(255,255,255,0.95)' }]}>
        <ZipMintAura scope="LocationMapFloat" testID="customer-v21-location-map-float-mint-aura" />
        <CaseWorkerAvatar name={workerName} uri={uri} />
        <View style={styles.flex}>
          <Text numberOfLines={1} style={[styles.caseMapWorkerName, { color: tokens.text }]}>{workerName}</Text>
          <Text numberOfLines={1} style={[styles.caseMapWorkerMeta, { color: tokens.muted }]}>{status} · {address}</Text>
        </View>
        <View style={styles.caseMapEta}>
          <Text numberOfLines={1} style={[styles.caseMapEtaValue, { color: tokens.primary }]}>{eta}</Text>
          <Text numberOfLines={1} style={[styles.caseMapEtaLabel, { color: tokens.muted }]}>{etaLabel}</Text>
        </View>
      </View>
    </View>
  )
}

function CaseMapAuraLayer({ scope, testID }: { scope: string; testID?: string }) {
  const { reduceTransparency } = useV21Theme()
  if (reduceTransparency) return null

  const topId = `caseMapAuraTop${scope}`
  const bottomId = `caseMapAuraBottom${scope}`
  return (
    <View pointerEvents="none" style={styles.caseMapAuraLayer} testID={testID}>
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

function CaseMapCanvas() {
  return (
    <View style={styles.caseMapCanvas} pointerEvents="none">
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 340 215" width="100%">
        <Defs>
          <LinearGradient id="caseMapBase" x1="0" x2="1" y1="0" y2="1">
            <Stop offset="0" stopColor="#EDF7E8" />
            <Stop offset="0.48" stopColor="#E5F1E8" />
            <Stop offset="1" stopColor="#F5F8E9" />
          </LinearGradient>
          <RadialGradient id="caseMapMintWash" cx="14%" cy="16%" r="76%">
            <Stop offset="0" stopColor="rgba(143,226,212,0.20)" />
            <Stop offset="0.58" stopColor="rgba(230,251,243,0.10)" />
            <Stop offset="1" stopColor="rgba(230,251,243,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#caseMapBase)" height="215" width="340" />
        <Rect fill="url(#caseMapMintWash)" height="215" width="340" />
        {[34, 68, 102, 136, 170].map((y) => (
          <Rect fill="rgba(88,148,127,0.08)" height="1" key={`h-${y}`} width="340" x="0" y={y} />
        ))}
        {[38, 76, 114, 152, 190, 228, 266, 304].map((x) => (
          <Rect fill="rgba(88,148,127,0.07)" height="215" key={`v-${x}`} width="1" x={x} y="0" />
        ))}
        <Path d="M-20 55 L230 15" stroke="rgba(255,255,255,0.90)" strokeLinecap="round" strokeWidth="18" />
        <Path d="M35 220 L112 2" stroke="rgba(255,255,255,0.86)" strokeLinecap="round" strokeWidth="18" />
        <Path d="M128 214 L370 96" stroke="rgba(255,255,255,0.86)" strokeLinecap="round" strokeWidth="18" />
        <Path d="M-26 156 L178 182" stroke="rgba(255,255,255,0.82)" strokeLinecap="round" strokeWidth="16" />
        <Path d="M58 141 L226 68" stroke="rgba(255,255,255,0.82)" strokeLinecap="round" strokeWidth="10" />
        <Path d="M58 141 L226 68" stroke="#38BDF8" strokeLinecap="round" strokeWidth="5" />
        <Path d="M202 54 L278 74" stroke="#38BDF8" strokeLinecap="round" strokeWidth="5" />
      </Svg>
    </View>
  )
}

function CaseMapPin({ style }: { style: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.caseMapPin, style]}>
      <View style={styles.caseMapPinInner} />
    </View>
  )
}

function CaseTimelineItem({ body, state, title }: { body: string; state: CaseScopeRowTone; title: string }) {
  const { tokens } = useV21Theme()
  return (
    <View style={styles.caseTimelineItem}>
      <View
        style={[
          styles.caseTimelineDot,
          {
            backgroundColor: state === 'pending' ? tokens.raised : tokens.primary,
            borderColor: state === 'pending' ? tokens.border : 'rgba(255,255,255,0.92)',
            shadowColor: state === 'active' ? '#24B3A1' : 'transparent',
            shadowOffset: { height: 0, width: 0 },
            shadowOpacity: state === 'active' ? 0.18 : 0,
            shadowRadius: state === 'active' ? 12 : 0,
          },
        ]}
      >
        <Text style={[styles.caseTimelineDotText, { color: state === 'pending' ? tokens.muted : '#FFFFFF' }]}>{state === 'done' ? '✓' : state === 'active' ? '•' : ''}</Text>
      </View>
      <View style={styles.flex}>
        <Text numberOfLines={1} style={[styles.caseTimelineTitle, { color: tokens.text }]}>{title}</Text>
        <Text numberOfLines={2} style={[styles.caseTimelineBody, { color: tokens.muted }]}>{body}</Text>
      </View>
    </View>
  )
}

function CaseWorkSummary({ deal }: { deal: LocalDeal }) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  return (
    <V21Card testID="customer-v21-case-work">
      <SectionHeader title={customerV21ScreenTitles[language]['2.5-chat-case']} />
      <MediaRow image={customerV21Assets.evidence} label={language === 'vi' ? 'Bằng chứng' : 'Evidence'} value={formatKnownCount(deal.draft.mediaCount, language)} />
      <MediaRow image={customerV21Assets.request} label={language === 'vi' ? 'Phạm vi' : 'Scope'} value={agenticDealProblemLabel(deal, language)} />
      <Text style={[styles.bodyText, { color: tokens.muted }]}>
        {language === 'vi'
          ? 'Xử lý công việc chỉ dùng dữ liệu của công việc thật. Trò chuyện thường không tự nhập bằng chứng vào đây.'
          : 'Work handling only uses real job data. Normal Chat does not silently enter evidence here.'}
      </Text>
    </V21Card>
  )
}

function CasePaymentStageScreen({
  deal,
  screenId,
}: {
  deal: LocalDeal
  screenId: CustomerV21ScreenId
}) {
  const language = useAppLanguage()
  const router = useRouter()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const payment = deal.payment ?? null
  const amount = paymentAmountLabel(payment, language, '0')
  const platformFee = payment?.platformFee === 0 || payment?.platformFee ? formatVnd(payment.platformFee, language) : copy.dataPending
  const workerNet = payment?.workerNet === 0 || payment?.workerNet ? formatVnd(payment.workerNet, language) : copy.dataPending
  const method = payment?.provider ? paymentProviderLabel(payment.provider, language) : copy.dataPending
  const status = payment?.status ? paymentStatusLabel(payment.status, language) : copy.dataPending
  const paymentReady = Boolean(payment)
  const protectedPayment = Boolean(payment && isPaymentProtectedStatus(payment.status))
  const service = deal.draft.serviceType ? customerV21ServiceCopy[language][deal.draft.serviceType].label : copy.dataPending
  const serviceAsset = deal.draft.serviceType ? customerV21ServiceAssets[deal.draft.serviceType] : customerV21Assets.payment
  const caseCode = caseDisplayCode(deal, language)
  const serviceDetail = agenticDealProblemLabel(deal, language)
  const workerName = deal.workerProfile?.fullName?.trim() || copy.dataPending
  const workerMeta = deal.workerProfile
    ? (language === 'vi' ? 'Thợ đã xác minh' : 'Verified worker')
    : copy.dataPending
  const time = timeChoiceLabel(deal.draft.timeChoice, language)
  const address = deal.draft.addressLabel || deal.draft.districtLabel || copy.dataPending
  const active = screenIdsForStatus(deal.status).includes(screenId)
  const stageTestId = `customer-v21-direct-screen-${screenId}`

  const goMethod = () => router.replace('/(customer)/history?screen=3.2-payment-method' as never)
  const goProtected = () => router.replace('/(customer)/history?screen=3.3-payment-protected' as never)
  const goTracking = () => router.replace('/(customer)/history?screen=2.10-location-eta' as never)

  return (
    <View testID={stageTestId}>
      {screenId === '3.1-payment-review' ? (
        <PaymentReviewStage
          address={address}
          amount={amount}
          caseCode={caseCode}
          disabled={!paymentReady}
          method={method}
          onNext={goMethod}
          platformFee={platformFee}
          service={service}
          serviceAsset={serviceAsset}
          serviceDetail={serviceDetail}
          status={status}
          time={time}
          workerMeta={workerMeta}
          workerName={workerName}
          workerNet={workerNet}
        />
      ) : screenId === '3.2-payment-method' ? (
        <PaymentMethodStage
          amount={amount}
          caseCode={caseCode}
          disabled={!paymentReady}
          method={method}
          onNext={goProtected}
          paymentReady={paymentReady}
          status={status}
        />
      ) : (
        <PaymentProtectedStage
          amount={amount}
          caseCode={caseCode}
          method={method}
          onNext={goTracking}
          payment={payment}
          protectedPayment={protectedPayment}
          service={service}
          serviceAsset={serviceAsset}
          status={status}
          time={time}
          workerName={workerName}
        />
      )}
      <ActivityScreenCard active={active} deal={deal} screenId={screenId} />
    </View>
  )
}

function PaymentReviewStage({
  address,
  amount,
  caseCode,
  disabled,
  method,
  onNext,
  platformFee,
  service,
  serviceAsset,
  serviceDetail,
  status,
  time,
  workerMeta,
  workerName,
  workerNet,
}: {
  address: string
  amount: string
  caseCode: string
  disabled: boolean
  method: string
  onNext: () => void
  platformFee: string
  service: string
  serviceAsset: ImageSourcePropType
  serviceDetail: string
  status: string
  time: string
  workerMeta: string
  workerName: string
  workerNet: string
}) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  return (
    <>
      <V21Card style={styles.paymentReviewCaseCard} testID="customer-v21-payment-review-case">
        <SourceCardSkin />
        <CaseWideMintAura scope="PaymentReviewCase" testID="customer-v21-payment-review-case-mint-aura" />
        <View style={styles.paymentReviewRow}>
          <View style={styles.paymentReviewLeadingCell}>
            <AssetTile image={serviceAsset} label={service} size={42} sourceAura style={styles.paymentReviewServiceIcon} />
          </View>
          <View style={styles.paymentReviewTextColumn}>
            <Text numberOfLines={1} style={[styles.cardTitle, { color: tokens.text }]}>{service}</Text>
            <Text numberOfLines={2} style={[styles.bodyText, { color: tokens.muted }]}>{caseCode} · {serviceDetail}</Text>
          </View>
          <MatchingHandoffChip label={disabled ? copy.dataPending : (language === 'vi' ? 'Đã khóa giá' : 'Price locked')} tone={disabled ? 'selected' : 'success'} />
        </View>
        <View style={[styles.fulfillmentDivider, { backgroundColor: tokens.border }]} />
        <View style={styles.paymentReviewRow}>
          <View style={styles.paymentReviewLeadingCell}>
            <CaseWorkerAvatar name={workerName} uri={null} />
          </View>
          <View style={styles.paymentReviewTextColumn}>
            <Text numberOfLines={1} style={[styles.cardTitle, { color: tokens.text }]}>{workerName}</Text>
            <Text numberOfLines={1} style={[styles.bodyText, { color: tokens.muted }]}>{workerMeta}</Text>
          </View>
        </View>
        <View style={styles.paymentReviewMetaRow}>
          <Text numberOfLines={1} style={[styles.bodyText, styles.paymentReviewMetaText, { color: tokens.muted }]}>{time}</Text>
          <Text numberOfLines={1} style={[styles.bodyText, styles.paymentReviewMetaTextRight, { color: tokens.muted }]}>{address}</Text>
        </View>
      </V21Card>

      <SectionActionHeader action={disabled ? copy.dataPending : (language === 'vi' ? 'Đã khóa giá' : 'Locked')} title={language === 'vi' ? 'Chi tiết thanh toán' : 'Payment details'} />
      <V21Card style={styles.paymentPriceCard} testID="customer-v21-payment-review-details">
        <SourceCardSkin />
        <CaseWideMintAura scope="PaymentReviewDetails" testID="customer-v21-payment-review-details-mint-aura" />
        <PaymentPriceLine label={language === 'vi' ? 'Số tiền hệ thống' : 'System amount'} value={amount} />
        <PaymentPriceLine label={language === 'vi' ? 'Phí nền tảng' : 'Platform fee'} value={platformFee} />
        <PaymentPriceLine label={language === 'vi' ? 'Phương thức' : 'Method'} value={method} />
        <PaymentPriceLine label={language === 'vi' ? 'Trạng thái' : 'Status'} value={status} />
        <View style={[styles.paymentTotalLine, { borderTopColor: tokens.border }]}>
          <Text style={[styles.paymentTotalLabel, { color: tokens.text }]}>{language === 'vi' ? 'Tổng thanh toán' : 'Total'}</Text>
          <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={[styles.paymentTotalValue, { color: tokens.primary }]}>{amount}</Text>
        </View>
        <View style={styles.paymentWorkerNetPill}>
          <Text style={[styles.paymentWorkerNetLabel, { color: tokens.text }]}>{language === 'vi' ? 'Thợ nhận dự kiến' : 'Worker net'}</Text>
          <Text style={[styles.paymentWorkerNetValue, { color: tokens.primary }]}>{workerNet}</Text>
        </View>
      </V21Card>

      <CaseKaelSourceCard
        body={language === 'vi' ? 'Tiền chỉ đi qua payment order thật và sổ cái nội bộ.' : 'Money only moves through a real payment order and ledger.'}
        image={customerV21Assets.kaelHead}
        testID="customer-v21-payment-review-kael-card"
        title={language === 'vi' ? 'Bảo vệ thanh toán cùng Kael' : 'Payment protection with Kael'}
      />

      <V21Card style={styles.paymentSafetyCard} testID="customer-v21-payment-review-safety">
        <SourceCardSkin />
        <CaseWideMintAura scope="PaymentReviewSafetyWide" testID="customer-v21-payment-review-safety-wide-mint-aura" />
        <ZipMintAura scope="PaymentReviewSafety" testID="customer-v21-payment-review-safety-mint-aura" />
        <View style={styles.paymentReviewRow}>
          <AssetTile image={customerV21Assets.shield} label={language === 'vi' ? 'An toàn' : 'Safety'} size={34} sourceAura style={styles.paymentSafetyIcon} />
          <View style={styles.flex}>
            <Text numberOfLines={1} style={[styles.cardTitle, { color: tokens.text }]}>{language === 'vi' ? 'Giữ an toàn đến khi hoàn tất.' : 'Safe until completion.'}</Text>
            <Text numberOfLines={2} style={[styles.bodyText, { color: tokens.muted }]}>{language === 'vi' ? 'Release, hoàn tiền hoặc tranh chấp cần đúng thẩm quyền.' : 'Release, refund, or dispute requires the right authority.'}</Text>
          </View>
        </View>
      </V21Card>

      <KaelButton
        backgroundLayer={<CaseWorkActionButtonAura scope="PaymentReviewPay" />}
        disabled={disabled}
        label={disabled ? copy.paymentLocked : (language === 'vi' ? 'Thanh toán an toàn' : 'Safe payment')}
        onPress={onNext}
        style={styles.casePrimaryStageButton}
        testID="customer-v21-payment-review-next"
      />
    </>
  )
}

function PaymentMethodStage({
  amount,
  caseCode,
  disabled,
  method,
  onNext,
  paymentReady,
  status,
}: {
  amount: string
  caseCode: string
  disabled: boolean
  method: string
  onNext: () => void
  paymentReady: boolean
  status: string
}) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const [selectedBankKey, setSelectedBankKey] = useState<CustomerV21BankKey | null>(null)
  const visibleSelectedBankKey = selectedBankKey
  const selectedBank = paymentBankOptions.find((bank) => bank.key === visibleSelectedBankKey) ?? null
  const recommendedTitle = selectedBank
    ? `${selectedBank.name} qua VietQR`
    : language === 'vi'
      ? 'Chọn ngân hàng qua VietQR'
      : 'Choose a VietQR bank'
  const recommendedBody = paymentReady
    ? (language === 'vi' ? 'Mở app ngân hàng, quét QR và xác nhận lệnh thanh toán.' : 'Open your bank app, scan the QR, and confirm the payment order.')
    : copy.paymentLocked
  return (
    <>
      <V21Card glass style={styles.paymentMethodHeroCard} testID="customer-v21-payment-method-total">
        <SourceCardSkin />
        <CaseWideMintAura scope="PaymentMethodTotal" testID="customer-v21-payment-method-total-mint-aura" />
        <ZipMintAura scope="PaymentMethodTotalBackground" testID="customer-v21-payment-method-total-bg-mint-aura" />
        <View style={styles.paymentMethodHeroContent}>
          <View style={styles.paymentMethodHeroTextColumn}>
            <Text style={[styles.bodyText, { color: tokens.muted }]}>{language === 'vi' ? 'Số tiền cần thanh toán' : 'Amount due'}</Text>
            <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={[styles.paymentMethodAmount, { color: tokens.primary }]}>{amount}</Text>
            <Text numberOfLines={2} style={[styles.bodyText, { color: tokens.muted }]}>{language === 'vi' ? 'Lệnh thanh toán được bảo vệ theo công việc thật.' : 'Payment order is protected by the real job.'}</Text>
          </View>
          <PaymentHeroMethodIcon bank={selectedBank} />
        </View>
      </V21Card>

      <SectionActionHeader title={language === 'vi' ? 'Ngân hàng khuyên dùng' : 'Recommended bank'} />
      <V21Card style={styles.paymentBankRecommendedCard} testID="customer-v21-payment-method-selected">
        <SourceCardSkin />
        <CaseWideMintAura scope="PaymentMethodSelected" testID="customer-v21-payment-method-selected-mint-aura" />
        <ZipMintAura scope="PaymentMethodRecommended" testID="customer-v21-payment-method-recommended-mint-aura" />
        <View style={styles.paymentReviewRow}>
          <View style={styles.paymentBankRecommendedLogoBox}>
            {selectedBank ? (
              <Image
                accessibilityIgnoresInvertColors
                resizeMode="contain"
                source={customerV21BankAssets[selectedBank.key]}
                style={styles.paymentBankRecommendedLogo}
                testID={`customer-v21-payment-bank-recommended-logo-${selectedBank.key}`}
              />
            ) : (
              <View style={styles.paymentBankRecommendedFallbackIcon} testID="customer-v21-payment-bank-recommended-wallet-icon">
                <SourceCardSkin />
                <Image accessibilityIgnoresInvertColors resizeMode="contain" source={customerV21Assets.wallet} style={styles.paymentMethodHeroWalletImage} />
              </View>
            )}
          </View>
          <View style={styles.flex}>
            <Text numberOfLines={1} style={[styles.cardTitle, { color: tokens.text }]}>{recommendedTitle}</Text>
            <Text numberOfLines={2} style={[styles.bodyText, { color: tokens.muted }]}>{recommendedBody}</Text>
          </View>
          <MatchingHandoffChip label={selectedBank ? (language === 'vi' ? 'Đã chọn' : 'Selected') : copy.dataPending} style={styles.paymentMethodRightChip} tone={selectedBank ? 'success' : 'selected'} />
        </View>
      </V21Card>

      <SectionActionHeader action={language === 'vi' ? '6 ngân hàng' : '6 banks'} title={language === 'vi' ? 'Chọn ngân hàng Việt Nam' : 'Choose a Vietnamese bank'} />
      <View style={styles.paymentBankGrid} testID="customer-v21-payment-method-grid">
        <CaseWideMintAura scope="PaymentBankGrid" testID="customer-v21-payment-bank-grid-wide-mint-aura" />
        <ZipMintAura scope="PaymentBankGrid" testID="customer-v21-payment-bank-grid-mint-aura" />
        {paymentBankOptions.map((bank) => (
          <PaymentBankTile
            bank={bank}
            disabled={false}
            key={bank.key}
            onPress={() => setSelectedBankKey(bank.key)}
            selected={bank.key === visibleSelectedBankKey}
          />
        ))}
      </View>

      <SectionActionHeader action={language === 'vi' ? '2 lựa chọn' : '2 options'} title={language === 'vi' ? 'Phương thức khác' : 'Other methods'} />
      <V21Card style={styles.paymentMethodOtherCard} testID="customer-v21-payment-method-other">
        <SourceCardSkin />
        <CaseWideMintAura scope="PaymentMethodOther" testID="customer-v21-payment-method-other-mint-aura" />
        <PaymentMethodRow image={customerV21Assets.paymentCard} imageTestID="customer-v21-payment-card-method-image" label={language === 'vi' ? 'Thẻ nội địa / quốc tế' : 'Domestic / international card'} value={paymentReady ? (language === 'vi' ? 'Visa, Mastercard, JCB và ATM nội địa' : 'Visa, Mastercard, JCB and domestic ATM') : copy.dataPending} />
        <View style={[styles.fulfillmentDivider, { backgroundColor: tokens.border }]} />
        <PaymentMethodRow image={customerV21Assets.paymentBankTransfer} imageTestID="customer-v21-payment-transfer-method-image" label={language === 'vi' ? 'Chuyển khoản ngân hàng' : 'Bank transfer'} value={paymentReady ? `${method} · ${status}` : copy.dataPending} />
      </V21Card>

      <V21Card style={styles.paymentSafetyCard} testID="customer-v21-payment-method-safety">
        <SourceCardSkin />
        <CaseWideMintAura scope="PaymentMethodSafety" testID="customer-v21-payment-method-safety-mint-aura" />
        <View style={styles.paymentReviewRow}>
          <PaymentMethodIconFrame image={customerV21Assets.shield} label={language === 'vi' ? 'An toàn' : 'Safety'} testID="customer-v21-payment-method-safety-icon-image" />
          <View style={styles.flex}>
            <Text numberOfLines={1} style={[styles.cardTitle, { color: tokens.text }]}>{language === 'vi' ? 'Tiền của bạn được giữ an toàn' : 'Your money stays protected'}</Text>
            <Text numberOfLines={2} style={[styles.bodyText, { color: tokens.muted }]}>{language === 'vi' ? 'Chỉ giải ngân sau khi công việc và ledger đúng trạng thái.' : 'Release only happens after the job and ledger reach the right state.'}</Text>
          </View>
        </View>
      </V21Card>

      <KaelButton
        backgroundLayer={<CaseWorkActionButtonAura scope="PaymentMethodContinue" />}
        disabled={disabled}
        label={disabled ? copy.paymentLocked : (language === 'vi' ? 'Tiếp tục thanh toán' : 'Continue payment')}
        onPress={onNext}
        style={styles.casePrimaryStageButton}
        testID="customer-v21-payment-method-next"
      />
    </>
  )
}

function PaymentProtectedStage({
  amount,
  caseCode,
  method,
  onNext,
  payment,
  protectedPayment,
  service,
  serviceAsset,
  status,
  time,
  workerName,
}: {
  amount: string
  caseCode: string
  method: string
  onNext: () => void
  payment: LocalDeal['payment'] | null
  protectedPayment: boolean
  service: string
  serviceAsset: ImageSourcePropType
  status: string
  time: string
  workerName: string
}) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const paymentReceivedTime = formatShortClockTime(payment?.receivedAt, language)
  const paymentConfirmedBody = payment
    ? [
      paymentReceivedTime,
      method,
      language === 'vi' ? 'Nhà cung cấp xác nhận' : 'Provider confirmed',
    ].filter(Boolean).join(' · ')
    : copy.dataPending
  const protectedBody = protectedPayment
    ? (language === 'vi' ? 'NestScout ghi nhận vào sổ cái bất biến' : 'NestScout recorded it in the immutable ledger')
    : status
  const completionBody = payment
    ? (language === 'vi' ? 'Khách hàng xác nhận hoặc xử lý theo quy trình' : 'Customer confirms or process handles it')
    : copy.dataPending
  const payoutBody = payment
    ? (language === 'vi' ? 'Chỉ sau khi được phép giải ngân' : 'Only after authorized release')
    : copy.dataPending
  return (
    <>
      <V21Card glass style={styles.paymentProtectedHeroCard} testID="customer-v21-payment-protected-hero">
        <SourceCardSkin />
        <CaseWideMintAura scope="PaymentProtectedHero" testID="customer-v21-payment-protected-hero-mint-aura" />
        <ZipMintAura scope="PaymentProtectedHeroFine" testID="customer-v21-payment-protected-hero-zip-mint-aura" />
        <CaseSuccessEmblem done={protectedPayment} />
        <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={[styles.paymentProtectedTitle, { color: tokens.text }]}>
          {protectedPayment
            ? (language === 'vi' ? 'Thanh toán thành công!' : 'Payment successful!')
            : (language === 'vi' ? 'Chờ thanh toán' : 'Payment pending')}
        </Text>
        <Text numberOfLines={2} style={[styles.bodyText, styles.centerText, { color: tokens.muted }]}>
          {protectedPayment
            ? (language === 'vi' ? `${amount} đang được giữ an toàn trong hệ thống.` : `${amount} is protected in the system.`)
            : copy.paymentLocked}
        </Text>
        <MatchingHandoffChip label={protectedPayment ? (language === 'vi' ? 'Được bảo vệ' : 'Protected') : copy.dataPending} style={styles.paymentProtectedChip} tone={protectedPayment ? 'success' : 'selected'} />
      </V21Card>

      <V21Card style={styles.paymentProtectedServiceCard} testID="customer-v21-payment-protected-service">
        <SourceCardSkin />
        <CaseWideMintAura scope="PaymentProtectedService" testID="customer-v21-payment-protected-service-mint-aura" />
        <ZipMintAura scope="PaymentProtectedServiceFine" testID="customer-v21-payment-protected-service-zip-mint-aura" />
        <View style={styles.paymentReviewRow}>
          <AssetTile image={serviceAsset} label={service} size={42} sourceAura style={styles.paymentReviewServiceIcon} />
          <View style={styles.flex}>
            <Text numberOfLines={1} style={[styles.cardTitle, { color: tokens.text }]}>{service}</Text>
            <Text numberOfLines={1} style={[styles.bodyText, { color: tokens.muted }]}>{workerName} · {time}</Text>
          </View>
          <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={[styles.paymentProtectedAmount, { color: tokens.primary }]}>{amount}</Text>
        </View>
      </V21Card>

      <SectionActionHeader action={payment ? (language === 'vi' ? 'Sổ cái ›' : 'Ledger ›') : copy.dataPending} title={language === 'vi' ? 'Trạng thái khoản tiền' : 'Money status'} />
      <V21Card style={styles.paymentLedgerCard} testID="customer-v21-payment-protected-ledger">
        <SourceCardSkin />
        <CaseWideMintAura scope="PaymentProtectedLedger" testID="customer-v21-payment-protected-ledger-mint-aura" />
        <ZipMintAura scope="PaymentProtectedLedgerFine" testID="customer-v21-payment-protected-ledger-zip-mint-aura" />
        <PaymentLedgerStep body={paymentConfirmedBody} state={payment ? 'done' : 'pending'} title={payment ? (language === 'vi' ? 'Đã thanh toán' : 'Paid') : (language === 'vi' ? 'Lệnh thanh toán' : 'Payment order')} />
        <PaymentLedgerStep body={protectedBody} state={payment ? 'active' : 'pending'} title={protectedPayment ? (language === 'vi' ? 'Đang giữ an toàn' : 'Held safely') : (language === 'vi' ? 'Đối soát' : 'Reconciliation')} />
        <PaymentLedgerStep body={completionBody} state="pending" title={language === 'vi' ? 'Chờ hoàn tất công việc' : 'Waiting for completion'} />
        <PaymentLedgerStep body={payoutBody} state="pending" title={language === 'vi' ? 'Giải ngân vào ví thợ' : 'Worker payout'} />
      </V21Card>

      <CaseKaelSourceCard
        body={language === 'vi' ? 'Không thanh toán ngoài nền tảng. Tôi sẽ theo dõi trạng thái tiền cùng công việc.' : 'Do not pay off-platform. I will follow money state with the job.'}
        image={customerV21Assets.kaelHead}
        testID="customer-v21-payment-protected-kael-card"
        title={language === 'vi' ? 'Kael nhắc bạn' : 'Kael reminder'}
      />

      <KaelButton
        backgroundLayer={<CaseWorkActionButtonAura scope="PaymentProtectedTrack" />}
        label={language === 'vi' ? 'Theo dõi đơn hàng' : 'Track job'}
        onPress={onNext}
        style={styles.casePrimaryStageButton}
        testID="customer-v21-payment-protected-track"
      />
      <Text numberOfLines={1} style={[styles.mediaMicroNote, { color: tokens.muted }]}>{caseCode}</Text>
    </>
  )
}

function PaymentPriceLine({ label, value }: { label: string; value: string }) {
  const { tokens } = useV21Theme()
  return (
    <View style={[styles.paymentPriceLine, { borderBottomColor: tokens.border }]}>
      <Text numberOfLines={1} style={[styles.paymentPriceLabel, { color: tokens.muted }]}>{label}</Text>
      <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={[styles.paymentPriceValue, { color: tokens.text }]}>{value}</Text>
    </View>
  )
}

function PaymentHeroMethodIcon({
  bank,
}: {
  bank: { key: CustomerV21BankKey; name: string; vietQrCode: string } | null
}) {
  return (
    <View style={styles.paymentMethodHeroIconFrame} testID="customer-v21-payment-method-hero-icon">
      <SourceCardSkin />
      <ZipMintAura scope="PaymentMethodHeroIcon" testID="customer-v21-payment-method-hero-icon-mint-aura" />
      {bank ? (
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="contain"
          source={customerV21BankAssets[bank.key]}
          style={styles.paymentMethodHeroBankLogo}
          testID={`customer-v21-payment-method-hero-bank-logo-${bank.key}`}
        />
      ) : (
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="contain"
          source={customerV21Assets.wallet}
          style={styles.paymentMethodHeroWalletImage}
          testID="customer-v21-payment-method-hero-wallet-icon"
        />
      )}
    </View>
  )
}

function PaymentBankTile({
  bank,
  disabled,
  onPress,
  selected,
}: {
  bank: { key: CustomerV21BankKey; name: string; vietQrCode: string }
  disabled: boolean
  onPress: () => void
  selected: boolean
}) {
  return (
    <Pressable
      accessibilityLabel={`${bank.name} VietQR`}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.paymentBankTile,
        selected ? styles.paymentBankTileSelected : null,
        disabled ? styles.paymentBankTileDisabled : null,
        pressed ? styles.pressed : null,
      ]}
      testID={`customer-v21-payment-bank-tile-${bank.key}`}
    >
      <SourceCardSkin />
      {selected ? <ZipMintAura scope={`PaymentBankTile${bank.key}`} testID={`customer-v21-payment-bank-tile-${bank.key}-mint-aura`} /> : null}
      <Image
        accessibilityIgnoresInvertColors
        resizeMode="contain"
        source={customerV21BankAssets[bank.key]}
        style={styles.paymentBankLogo}
        testID={`customer-v21-payment-bank-logo-${bank.key}`}
      />
      {selected ? (
        <View style={styles.paymentBankCheck}>
          <Text style={styles.paymentBankCheckText}>✓</Text>
        </View>
      ) : null}
    </Pressable>
  )
}

function PaymentMethodIconFrame({
  image,
  label,
  testID,
}: {
  image: ImageSourcePropType
  label: string
  testID: string
}) {
  return (
    <View style={styles.paymentMethodRowIcon}>
      <SourceCardSkin />
      <ZipMintAura scope={label.replace(/[^a-zA-Z0-9]/g, '')} />
      <Image
        accessibilityIgnoresInvertColors
        accessibilityLabel={label}
        resizeMode="contain"
        source={image}
        style={styles.paymentMethodAssetIcon}
        testID={testID}
      />
    </View>
  )
}

function PaymentMethodRow({
  image,
  imageTestID,
  label,
  value,
}: {
  image: ImageSourcePropType
  imageTestID: string
  label: string
  value: string
}) {
  const { tokens } = useV21Theme()
  return (
    <View style={styles.paymentMethodRow}>
      <PaymentMethodIconFrame image={image} label={label} testID={imageTestID} />
      <View style={styles.flex}>
        <Text numberOfLines={1} style={[styles.cardTitle, { color: tokens.text }]}>{label}</Text>
        <Text numberOfLines={1} style={[styles.bodyText, { color: tokens.muted }]}>{value}</Text>
      </View>
      <Text style={[styles.chevronText, { color: tokens.primary }]}>›</Text>
    </View>
  )
}

function PaymentLedgerStep({ body, state, title }: { body: string; state: FulfillmentStepState; title: string }) {
  const { tokens } = useV21Theme()
  const done = state === 'done'
  const active = state === 'active'
  const highlighted = done || active
  return (
    <View style={styles.paymentLedgerStep}>
      <View style={[styles.paymentLedgerRail, { backgroundColor: highlighted ? tokens.primary : tokens.border }]} />
      <View
        style={[
          styles.paymentLedgerDot,
          {
            backgroundColor: active ? tokens.primary : done ? '#F4FFFC' : tokens.raised,
            borderColor: highlighted ? tokens.primary : tokens.border,
          },
        ]}
      >
        {active ? <View pointerEvents="none" style={styles.paymentLedgerDotAura} /> : null}
        <Text style={[styles.paymentLedgerDotText, { color: active ? '#FFFFFF' : highlighted ? tokens.primary : tokens.muted }]}>{done ? '✓' : active ? '•' : ''}</Text>
      </View>
      <View style={styles.flex}>
        <Text numberOfLines={1} style={[styles.cardTitle, { color: tokens.text }]}>{title}</Text>
        <Text numberOfLines={1} style={[styles.bodyText, { color: active ? tokens.primary : tokens.muted }]}>{body}</Text>
      </View>
    </View>
  )
}

function CompletionStateSummary({ deal }: { deal: LocalDeal }) {
  const language = useAppLanguage()
  return (
    <V21Card testID="customer-v21-completion-state">
      <SectionHeader title={customerV21ScreenTitles[language]['2.13-job-progress']} />
      <MediaRow image={customerV21Assets.evidence} label={language === 'vi' ? 'Ảnh hoàn tất' : 'Completion photos'} value={formatKnownCount(deal.completionPhotoUrls?.length, language)} />
      <MediaRow image={customerV21Assets.feedback} label={language === 'vi' ? 'Ghi chú hoàn tất' : 'Completion note'} value={deal.completionNotes?.trim() || customerV21CommonCopy[language].dataPending} />
    </V21Card>
  )
}

function ActivityStatusPanel({ deal, screenId }: { deal: LocalDeal; screenId: CustomerV21ScreenId }) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const broadcast = deal.broadcast
  const address = broadcast?.fullAddressVisible
    ? broadcast.fullAddressLabel || deal.draft.addressLabel || broadcast.generalArea || copy.dataPending
    : broadcast?.generalArea || deal.draft.districtLabel || deal.draft.addressLabel || copy.dataPending
  const eta = typeof broadcast?.secondsRemaining === 'number' ? formatDurationShort(broadcast.secondsRemaining, language) : copy.dataPending
  const workerName = deal.workerProfile?.fullName || copy.dataPending
  const prebrief = broadcast?.prebrief?.[0] || copy.dataPending
  const completionEvidence = formatEvidenceFileCount(deal.completionPhotoUrls?.length, language)
  const title = customerV21ScreenTitles[language][screenId]
  const status = customerV21StatusCopy[language][deal.status]
  const primary = activityStatusPrimary(screenId, { address, eta, language, status })
  const rows = activityStatusRows(screenId, {
    address,
    completionEvidence,
    eta,
    language,
    prebrief,
    status,
    workerName,
  })

  return (
    <V21Card testID={`customer-v21-status-panel-${screenId}`}>
      <SectionHeader eyebrow={caseDisplayCode(deal, language)} title={title} />
      <View style={styles.activityStatusHero}>
        <AssetTile image={caseScreenAsset(screenId)} label={title} size={58} />
        <View style={styles.flex}>
          <Text style={[styles.labelText, { color: tokens.muted }]}>{primary.label}</Text>
          <Text numberOfLines={2} style={[styles.activityStatusValue, { color: tokens.primary }]}>{primary.value}</Text>
          <Text style={[styles.bodyText, { color: tokens.muted }]}>{primary.body}</Text>
        </View>
      </View>
      <ProgressRail activeStep={stepForStatus(deal.status)} total={5} />
      <View style={styles.activityStatusRows}>
        {rows.map((row) => (
          <MediaRow image={row.image} key={row.label} label={row.label} value={row.value} />
        ))}
      </View>
      <InfoNotice
        body={language === 'vi'
          ? 'Màn này chỉ mở dữ liệu đã có trong công việc thật. Thiếu dữ liệu thì giữ trạng thái chờ, không tự dựng thợ, thời gian đến, giá hoặc thanh toán.'
          : 'This screen only opens data already present on the real job. Missing values stay pending; no worker, ETA, price, or payment is invented.'}
        image={customerV21Assets.shield}
        title={language === 'vi' ? 'Dữ liệu trung thực' : 'Honest data'}
      />
    </V21Card>
  )
}

function activityStatusPrimary(
  screenId: CustomerV21ScreenId,
  values: { address: string; eta: string; language: AppLanguage; status: string },
) {
  if (screenId === '2.10-location-eta') {
    return {
      body: values.language === 'vi' ? 'Địa chỉ chi tiết chỉ hiện khi cổng nhận việc thật cho phép.' : 'Full address appears only when the real accept gate allows it.',
      label: values.language === 'vi' ? 'Vị trí được phép' : 'Allowed location',
      value: values.address,
    }
  }
  if (screenId === '2.11-live-alert') {
    return {
      body: values.language === 'vi' ? 'Đếm giờ chỉ dùng tín hiệu thời gian đến thật từ hệ thống.' : 'Countdown uses only a real system ETA signal.',
      label: values.language === 'vi' ? 'Thời gian đến' : 'ETA',
      value: values.eta,
    }
  }
  if (screenId === '2.12-job-accepted') {
    return {
      body: values.language === 'vi' ? 'Xác nhận nhận việc bám theo trạng thái quy trình hiện có.' : 'Acceptance follows the current workflow state.',
      label: values.language === 'vi' ? 'Trạng thái công việc' : 'Job status',
      value: values.status,
    }
  }
  return {
    body: values.language === 'vi' ? 'Tiến độ công việc chỉ phản ánh trạng thái công việc thật.' : 'Work progress reflects only the real job state.',
    label: values.language === 'vi' ? 'Tiến độ' : 'Progress',
    value: values.status,
  }
}

function activityStatusRows(
  screenId: CustomerV21ScreenId,
  values: {
    address: string
    completionEvidence: string
    eta: string
    language: AppLanguage
    prebrief: string
    status: string
    workerName: string
  },
) {
  const row = (image: ImageSourcePropType, label: string, value: string) => ({ image, label, value })
  if (screenId === '2.10-location-eta') {
    return [
      row(customerV21Assets.map, values.language === 'vi' ? 'Địa điểm' : 'Location', values.address),
      row(customerV21Assets.identity, values.language === 'vi' ? 'Thợ thật' : 'Real worker', values.workerName),
      row(customerV21Assets.booking, values.language === 'vi' ? 'Thời gian đến' : 'ETA', values.eta),
    ]
  }
  if (screenId === '2.11-live-alert') {
    return [
      row(customerV21Assets.notification, values.language === 'vi' ? 'Cảnh báo' : 'Alert', values.status),
      row(customerV21Assets.map, values.language === 'vi' ? 'Địa điểm' : 'Location', values.address),
      row(customerV21Assets.booking, values.language === 'vi' ? 'Thời gian đến' : 'ETA', values.eta),
    ]
  }
  if (screenId === '2.12-job-accepted') {
    return [
      row(customerV21Assets.identity, values.language === 'vi' ? 'Thợ thật' : 'Real worker', values.workerName),
      row(customerV21Assets.map, values.language === 'vi' ? 'Địa điểm' : 'Location', values.address),
      row(customerV21Assets.kael, values.language === 'vi' ? 'Tóm tắt Kael' : 'Kael brief', values.prebrief),
    ]
  }
  return [
    row(customerV21Assets.activity, values.language === 'vi' ? 'Trạng thái' : 'Status', values.status),
    row(customerV21Assets.evidence, values.language === 'vi' ? 'Bằng chứng hoàn tất' : 'Completion evidence', values.completionEvidence),
    row(customerV21Assets.shield, values.language === 'vi' ? 'Phê duyệt' : 'Approval', values.language === 'vi' ? 'Chỉ mở khi quy trình yêu cầu' : 'Only opens when workflow requires it'),
  ]
}

function ScreenAdaptationRail({ activeStatus }: { activeStatus: LocalDealStatus }) {
  const language = useAppLanguage()
  const router = useRouter()
  const { tokens } = useV21Theme()
  const activeScreens = screenIdsForStatus(activeStatus)
  return (
    <View style={styles.screenRail} testID="customer-v21-screen-rail">
      {caseScreenIds.map((id) => {
        const active = activeScreens.includes(id)
        return (
          <Pressable
            accessibilityLabel={customerV21ScreenTitles[language][id]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            key={id}
            onPress={() => router.replace(`/(customer)/history?screen=${id}` as never)}
            style={[styles.screenRailItem, { backgroundColor: active ? tokens.service : tokens.ghost, borderColor: tokens.border }]}
            testID={`customer-v21-screen-rail-${id}`}
          >
            <Text numberOfLines={1} style={[styles.screenRailTitle, { color: active ? tokens.primary : tokens.muted }]}>{customerV21ScreenTitles[language][id]}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function screenIdsForStatus(status: LocalDealStatus): CustomerV21ScreenId[] {
  if (status === 'broadcasting') return ['2.7-matching']
  if (status === 'worker_matched') return ['2.10-location-eta', '2.12-job-accepted']
  if (status === 'worker_on_way') return ['2.10-location-eta', '2.11-live-alert']
  if (status === 'arrived' || status === 'inspecting') return ['2.12-job-accepted']
  if (status === 'repairing' || status === 'scope_change_pending') return ['2.13-job-progress']
  if (status === 'completed_by_worker' || status === 'confirmed_by_customer' || status === 'reviewed') return ['2.13-job-progress', '3.3-payment-protected']
  if (status === 'awaiting_customer_confirm') return ['2.8-options', '2.9-quotes']
  return ['2.6-case-overview']
}

function caseScreenAsset(screenId: CustomerV21ScreenId): ImageSourcePropType {
  if (screenId.startsWith('3.')) return customerV21Assets.payment
  if (screenId === '2.10-location-eta' || screenId === '2.11-live-alert') return customerV21Assets.map
  if (screenId === '2.5-chat-case') return customerV21Assets.kael
  if (screenId === '2.13-job-progress' || screenId === '2.12-job-accepted') return customerV21Assets.activity
  if (screenId === '2.7-matching') return customerV21Assets.identity
  if (screenId === '2.8-options' || screenId === '2.9-quotes') return customerV21Assets.request
  return customerV21Assets.booking
}

function caseScreenSummary(screenId: CustomerV21ScreenId, deal: LocalDeal, language: AppLanguage) {
  const copy = customerV21CommonCopy[language]
  const estimate = deal.estimate
  const payment = deal.payment
  const broadcast = deal.broadcast
  const address = deal.draft.addressLabel || deal.draft.districtLabel || broadcast?.generalArea || copy.dataPending
  const workerName = deal.workerProfile?.fullName || null
  if (screenId === '2.5-chat-case') {
    return language === 'vi'
      ? `Bằng chứng: ${formatKnownCount(deal.draft.mediaCount, language)}`
      : `Evidence: ${formatKnownCount(deal.draft.mediaCount, language)}`
  }
  if (screenId === '2.6-case-overview') return `${caseDisplayCode(deal, language)} · ${customerV21StatusCopy[language][deal.status]}`
  if (screenId === '2.7-matching') {
    if (workerName) return language === 'vi' ? `Thợ thật: ${workerName}` : `Real worker: ${workerName}`
    if (deal.status === 'broadcasting') return customerV21StatusCopy[language].broadcasting
    return copy.dataPending
  }
  if (screenId === '2.8-options') return estimate ? agenticDealProblemLabel(deal, language) || estimate.advisory || copy.dataPending : copy.dataPending
  if (screenId === '2.9-quotes') return estimate?.priceRangeLabel || copy.dataPending
  if (screenId === '3.1-payment-review') {
    if (payment?.grossAmount === 0 || payment?.grossAmount) return formatVnd(payment.grossAmount, language)
    return customerV21CommonCopy[language].paymentLocked
  }
  if (screenId === '3.2-payment-method') return payment?.provider ? paymentProviderLabel(payment.provider, language) : copy.dataPending
  if (screenId === '3.3-payment-protected') return payment?.status ? paymentStatusLabel(payment.status, language) : customerV21CommonCopy[language].paymentLocked
  if (screenId === '2.10-location-eta') return broadcast?.fullAddressVisible ? address : (broadcast?.generalArea || copy.dataPending)
  if (screenId === '2.11-live-alert') {
    if (typeof broadcast?.secondsRemaining === 'number') return formatDurationShort(broadcast.secondsRemaining, language)
    return copy.dataPending
  }
  if (screenId === '2.12-job-accepted') {
    if (!broadcast?.status) return copy.dataPending
    return language === 'vi' ? 'Đã có xác nhận từ hệ thống' : 'System confirmation available'
  }
  if (screenId === '2.13-job-progress') {
    if (deal.status === 'repairing' || deal.status === 'scope_change_pending') return customerV21StatusCopy[language][deal.status]
    if (deal.status === 'completed_by_worker' || deal.status === 'confirmed_by_customer' || deal.status === 'reviewed') return customerV21StatusCopy[language][deal.status]
    return language === 'vi' ? 'Chưa bắt đầu công việc' : 'Work has not started'
  }
  return copy.dataPending
}

function caseScopeRowsForDeal(deal: LocalDeal, language: AppLanguage) {
  const copy = customerV21CommonCopy[language]
  const includedLabel = deal.estimate ? (language === 'vi' ? 'Đã gồm' : 'Included') : copy.dataPending
  const approvalLabel = language === 'vi' ? 'Phải duyệt' : 'Approval'
  const serviceType = deal.draft.serviceType
  const rowsByService: Record<ServiceType, string[]> = {
    cleaning: language === 'vi'
      ? ['Dọn khu vực chính', 'Làm sạch bề mặt', 'Bếp/phòng tắm theo yêu cầu', 'Thu gom rác nhẹ', 'Kiểm tra sau dọn', 'Vật tư phát sinh']
      : ['Clean main areas', 'Surface cleaning', 'Kitchen/bathroom by request', 'Light trash collection', 'Post-clean check', 'Extra supplies'],
    electrical: language === 'vi'
      ? ['Khoanh vùng điểm lỗi', 'Kiểm tra an toàn điện', 'Xử lý kết nối cơ bản', 'Test tải sau xử lý', 'Dọn điểm thao tác', 'Vật tư phát sinh']
      : ['Locate fault point', 'Electrical safety check', 'Basic connection fix', 'Post-fix load test', 'Clean work point', 'Extra materials'],
    plumbing: language === 'vi'
      ? ['Xác định rò rỉ/tắc', 'Kiểm tra áp lực nước', 'Xử lý đường ống nhẹ', 'Siết/đổi ron cơ bản', 'Test sau xử lý', 'Vật tư phát sinh']
      : ['Locate leak/blockage', 'Water pressure check', 'Light pipe handling', 'Basic seal replacement', 'Post-fix test', 'Extra materials'],
  }
  const labels = serviceType
    ? rowsByService[serviceType]
    : (language === 'vi'
      ? ['Xác nhận dịch vụ', 'Đọc mô tả', 'Kiểm tra bằng chứng', 'Chốt phạm vi', 'Dự kiến thời gian', 'Vật tư phát sinh']
      : ['Confirm service', 'Read description', 'Check evidence', 'Lock scope', 'Estimate time', 'Extra materials'])

  return labels.map((label, index) => ({
    label,
    state: index === labels.length - 1 ? 'active' as const : deal.estimate ? 'done' as const : 'pending' as const,
    value: index === labels.length - 1 ? approvalLabel : includedLabel,
  }))
}

function caseScopeRowsForMissingDeal(language: AppLanguage) {
  const copy = customerV21CommonCopy[language]
  const labels = language === 'vi'
    ? ['Xác nhận dịch vụ', 'Đọc mô tả', 'Kiểm tra bằng chứng', 'Chốt phạm vi', 'Dự kiến thời gian', 'Vật tư phát sinh']
    : ['Confirm service', 'Read description', 'Check evidence', 'Lock scope', 'Estimate time', 'Extra materials']

  return labels.map((label) => ({
    label,
    state: 'pending' as const,
    value: copy.dataPending,
  }))
}

function caseSecondaryOptionsForDeal(deal: LocalDeal, language: AppLanguage) {
  const copy = customerV21CommonCopy[language]
  const service = deal.draft.serviceType ? customerV21ServiceCopy[language][deal.draft.serviceType] : null
  const serviceLabel = service?.label ?? copy.dataPending
  return [
    {
      body: language === 'vi' ? 'Giữ phạm vi tối thiểu theo mô tả.' : 'Keep the minimum scope from the description.',
      image: deal.draft.serviceType ? customerV21ServiceAssets[deal.draft.serviceType] : customerV21Assets.request,
      rightLabel: deal.estimate?.priceRangeLabel || copy.dataPending,
      testID: 'customer-v21-options-standard',
      title: serviceLabel,
    },
    {
      body: language === 'vi' ? 'Dùng khi cần thợ xác nhận thêm tại chỗ.' : 'Use when on-site confirmation is needed.',
      image: customerV21Assets.tools,
      rightLabel: copy.dataPending,
      testID: 'customer-v21-options-onsite',
      title: language === 'vi' ? 'Kiểm tra tại chỗ' : 'On-site check',
    },
  ]
}

function currentScopeLabel(deal: LocalDeal, language: AppLanguage) {
  const copy = customerV21CommonCopy[language]
  const serviceLabel = deal.draft.serviceType ? customerV21ServiceCopy[language][deal.draft.serviceType].label : null
  const problemLabel = agenticDealProblemLabel(deal, language)
  const parts = [serviceLabel, problemLabel]
    .filter((part): part is string => Boolean(part && part !== copy.dataPending))
    .filter((part, index, values) => values.indexOf(part) === index)

  return parts.length > 0 ? parts.join(' · ') : copy.dataPending
}

function caseAddressLabel(deal: LocalDeal, language: AppLanguage) {
  const copy = customerV21CommonCopy[language]
  return deal.broadcast?.fullAddressVisible
    ? deal.broadcast.fullAddressLabel || deal.draft.addressLabel || deal.broadcast.generalArea || copy.dataPending
    : deal.broadcast?.generalArea || deal.draft.districtLabel || deal.draft.addressLabel || copy.dataPending
}

function caseEtaTimelineRows(deal: LocalDeal, language: AppLanguage) {
  const copy = customerV21CommonCopy[language]
  const workerName = deal.workerProfile?.fullName?.trim() || copy.dataPending
  const address = caseAddressLabel(deal, language)
  const eta = typeof deal.broadcast?.secondsRemaining === 'number'
    ? formatDurationShort(deal.broadcast.secondsRemaining, language)
    : copy.dataPending
  const accepted = ['worker_matched', 'worker_on_way', 'arrived', 'inspecting', 'repairing', 'scope_change_pending', 'completed_by_worker', 'confirmed_by_customer', 'reviewed'].includes(deal.status)
  const onWay = ['worker_on_way', 'arrived', 'inspecting', 'repairing', 'scope_change_pending', 'completed_by_worker', 'confirmed_by_customer', 'reviewed'].includes(deal.status)
  const arrived = ['arrived', 'inspecting', 'repairing', 'scope_change_pending', 'completed_by_worker', 'confirmed_by_customer', 'reviewed'].includes(deal.status)

  return [
    {
      body: workerName,
      state: accepted ? 'done' as const : 'pending' as const,
      title: language === 'vi' ? 'Thợ đã nhận đơn' : 'Worker accepted',
    },
    {
      body: address,
      state: deal.broadcast?.fullAddressVisible ? 'done' as const : 'pending' as const,
      title: language === 'vi' ? 'Đã mở khu vực' : 'Area opened',
    },
    {
      body: eta,
      state: onWay ? 'active' as const : 'pending' as const,
      title: language === 'vi' ? 'Đang trên đường' : 'On the way',
    },
    {
      body: arrived ? (language === 'vi' ? 'Đã đến' : 'Arrived') : copy.dataPending,
      state: arrived ? 'done' as const : 'pending' as const,
      title: language === 'vi' ? 'Đến địa điểm' : 'Arrive',
    },
  ]
}

function caseEtaTimelineRowsPending(language: AppLanguage) {
  const copy = customerV21CommonCopy[language]
  return [
    {
      body: copy.dataPending,
      state: 'pending' as const,
      title: language === 'vi' ? 'Thợ đã nhận đơn' : 'Worker accepted',
    },
    {
      body: copy.dataPending,
      state: 'pending' as const,
      title: language === 'vi' ? 'Đã rời điểm trước' : 'Left previous stop',
    },
    {
      body: copy.dataPending,
      state: 'pending' as const,
      title: language === 'vi' ? 'Đang trên đường' : 'On the way',
    },
    {
      body: copy.dataPending,
      state: 'pending' as const,
      title: language === 'vi' ? 'Đến địa điểm' : 'Arrive',
    },
  ]
}

function isArrivalConfirmedStatus(status: LocalDealStatus) {
  return ['arrived', 'inspecting', 'repairing', 'scope_change_pending', 'completed_by_worker', 'confirmed_by_customer', 'reviewed'].includes(status)
}

function isWorkStartedStatus(status: LocalDealStatus) {
  return ['inspecting', 'repairing', 'scope_change_pending', 'completed_by_worker', 'confirmed_by_customer', 'reviewed'].includes(status)
}

function isWorkCompletedStatus(status: LocalDealStatus) {
  return ['completed_by_worker', 'confirmed_by_customer', 'reviewed'].includes(status)
}

function workProgressPercent(status: LocalDealStatus | undefined) {
  if (!status) return 0
  if (isWorkCompletedStatus(status)) return 100
  if (status === 'scope_change_pending') return 62
  if (status === 'repairing') return 58
  if (status === 'inspecting') return 28
  if (status === 'arrived') return 14
  return 0
}

function caseJobProgressSteps(status: LocalDealStatus | undefined, language: AppLanguage) {
  const copy = customerV21CommonCopy[language]
  const arrived = status ? isArrivalConfirmedStatus(status) : false
  const started = status ? isWorkStartedStatus(status) : false
  const repairing = status === 'repairing' || status === 'scope_change_pending' || (status ? isWorkCompletedStatus(status) : false)
  const completed = status ? isWorkCompletedStatus(status) : false
  const step = (
    title: string,
    body: string,
    state: FulfillmentStepState,
  ) => ({ body, state, title })

  return [
    step(
      language === 'vi' ? 'Khảo sát hiện trạng' : 'Inspect current state',
      arrived ? (language === 'vi' ? 'Hoàn tất' : 'Done') : copy.dataPending,
      arrived ? 'done' : status ? 'active' : 'pending',
    ),
    step(
      language === 'vi' ? 'Thực hiện công việc' : 'Do the work',
      repairing ? `${workProgressPercent(status)}%` : copy.dataPending,
      repairing ? 'active' : started ? 'active' : 'pending',
    ),
    step(
      language === 'vi' ? 'Kiểm tra vận hành' : 'Operational check',
      completed ? (language === 'vi' ? 'Hoàn tất' : 'Done') : copy.dataPending,
      completed ? 'done' : repairing ? 'pending' : 'pending',
    ),
    step(
      language === 'vi' ? 'Bàn giao & bằng chứng' : 'Handoff and evidence',
      completed ? (language === 'vi' ? 'Đã có bằng chứng' : 'Evidence ready') : copy.dataPending,
      completed ? 'done' : 'pending',
    ),
  ]
}

function caseReferenceRows(screenId: CustomerV21ScreenId, deal: LocalDeal, language: AppLanguage) {
  const copy = customerV21CommonCopy[language]
  const estimate = deal.estimate
  const payment = deal.payment
  const service = deal.draft.serviceType ? customerV21ServiceCopy[language][deal.draft.serviceType].label : copy.dataPending
  const problem = agenticDealProblemLabel(deal, language)
  const workerName = deal.workerProfile?.fullName || copy.dataPending
  const address = deal.broadcast?.fullAddressVisible
    ? deal.broadcast.fullAddressLabel || deal.draft.addressLabel || deal.broadcast.generalArea || copy.dataPending
    : deal.broadcast?.generalArea || deal.draft.districtLabel || deal.draft.addressLabel || copy.dataPending
  const time = timeChoiceLabel(deal.draft.timeChoice, language)
  const evidence = formatEvidenceFileCount(deal.draft.mediaCount, language)
  const price = estimate?.priceRangeLabel || copy.dataPending
  const disclaimer = estimate?.disclaimer || copy.dataPending
  const paymentStatus = payment?.status ? paymentStatusLabel(payment.status, language) : copy.dataPending
  const paymentAmount = payment?.grossAmount === 0 || payment?.grossAmount ? formatVnd(payment.grossAmount, language) : copy.dataPending
  const paymentMethod = payment?.provider ? paymentProviderLabel(payment.provider, language) : copy.dataPending
  const completionEvidence = formatEvidenceFileCount(deal.completionPhotoUrls?.length, language)
  const completionNote = deal.completionNotes?.trim() || copy.dataPending

  const row = (image: ImageSourcePropType, label: string, value: string) => ({ image, label, value })
  const serviceAsset = deal.draft.serviceType ? customerV21ServiceAssets[deal.draft.serviceType] : customerV21Assets.request
  const common = [
    row(serviceAsset, language === 'vi' ? 'Dịch vụ' : 'Service', service),
    row(customerV21Assets.request, language === 'vi' ? 'Vấn đề' : 'Issue', problem),
    row(customerV21Assets.activity, language === 'vi' ? 'Trạng thái' : 'Status', customerV21StatusCopy[language][deal.status]),
  ]

  if (screenId === '2.5-chat-case') {
    return [
      row(customerV21Assets.evidence, language === 'vi' ? 'Bằng chứng công việc' : 'Work evidence', evidence),
      row(customerV21Assets.request, language === 'vi' ? 'Phạm vi' : 'Scope', problem),
      row(customerV21Assets.kael, language === 'vi' ? 'Ranh giới' : 'Boundary', language === 'vi' ? 'Tách khỏi trò chuyện thường' : 'Separate from normal chat'),
    ]
  }
  if (screenId === '2.6-case-overview') {
    return [
      row(customerV21Assets.booking, language === 'vi' ? 'Mã công việc' : 'Job id', caseDisplayCode(deal, language)),
      ...common,
      row(customerV21Assets.evidence, language === 'vi' ? 'Bằng chứng' : 'Evidence', evidence),
    ]
  }
  if (screenId === '2.7-matching') {
    return [
      row(customerV21Assets.identity, language === 'vi' ? 'Thợ thật' : 'Real worker', workerName),
      row(customerV21Assets.map, language === 'vi' ? 'Khu vực' : 'Area', address),
      row(customerV21Assets.booking, language === 'vi' ? 'Khung giờ' : 'Time window', time),
      row(customerV21Assets.shield, language === 'vi' ? 'Quyền riêng tư' : 'Privacy', language === 'vi' ? 'Chỉ mở địa chỉ theo cổng nhận việc thật' : 'Address opens only after real accept gate'),
    ]
  }
  if (screenId === '2.8-options') {
    return [
      row(customerV21Assets.request, language === 'vi' ? 'Phương án' : 'Option', estimate?.advisory || problem),
      row(customerV21Assets.shield, language === 'vi' ? 'Rủi ro' : 'Risk', estimate ? complexitySafetyLabel(estimate.complexity, language) : copy.dataPending),
      row(customerV21Assets.payment, language === 'vi' ? 'Giá' : 'Price', price),
    ]
  }
  if (screenId === '2.9-quotes') {
    return [
      row(customerV21Assets.payment, language === 'vi' ? 'Ước tính Kael' : 'Kael estimate', price),
      row(customerV21Assets.shield, language === 'vi' ? 'Ghi chú giá' : 'Price note', disclaimer),
      row(customerV21Assets.identity, language === 'vi' ? 'Thợ' : 'Worker', workerName),
    ]
  }
  if (screenId === '3.1-payment-review') {
    return [
      row(customerV21Assets.payment, language === 'vi' ? 'Trạng thái thanh toán' : 'Payment status', paymentStatus),
      row(customerV21Assets.shield, language === 'vi' ? 'Số tiền' : 'Amount', paymentAmount),
      row(customerV21Assets.booking, language === 'vi' ? 'Công việc liên kết' : 'Linked job', caseDisplayCode(deal, language)),
    ]
  }
  if (screenId === '3.2-payment-method') {
    return [
      row(customerV21Assets.payment, language === 'vi' ? 'Phương thức' : 'Method', paymentMethod),
      row(customerV21Assets.shield, language === 'vi' ? 'Trạng thái' : 'Status', paymentStatus),
      row(customerV21Assets.request, language === 'vi' ? 'Ghi chú' : 'Note', customerV21CommonCopy[language].paymentLocked),
    ]
  }
  if (screenId === '3.3-payment-protected') {
    return [
      row(customerV21Assets.shield, language === 'vi' ? 'Bảo vệ' : 'Protection', payment?.status ? paymentStatus : customerV21CommonCopy[language].paymentLocked),
      row(customerV21Assets.payment, language === 'vi' ? 'Số tiền thật' : 'Real amount', paymentAmount),
      row(customerV21Assets.activity, language === 'vi' ? 'Bước tiếp theo' : 'Next step', customerV21StatusCopy[language][deal.status]),
    ]
  }
  if (screenId === '2.10-location-eta') {
    return [
      row(customerV21Assets.map, language === 'vi' ? 'Vị trí' : 'Location', address),
      row(customerV21Assets.identity, language === 'vi' ? 'Thợ thật' : 'Real worker', workerName),
      row(customerV21Assets.booking, language === 'vi' ? 'Khung giờ' : 'Time window', time),
    ]
  }
  if (screenId === '2.11-live-alert') {
    return [
      row(customerV21Assets.notification, language === 'vi' ? 'Cảnh báo' : 'Alert', customerV21StatusCopy[language][deal.status]),
      row(customerV21Assets.map, language === 'vi' ? 'Khu vực' : 'Area', address),
      row(customerV21Assets.kael, language === 'vi' ? 'Kael nhắc' : 'Kael note', language === 'vi' ? 'Không chia sẻ số điện thoại hoặc địa chỉ ngoài quy trình.' : 'Do not share phone or address outside the workflow.'),
    ]
  }
  if (screenId === '2.12-job-accepted') {
    return [
      row(customerV21Assets.identity, language === 'vi' ? 'Thợ' : 'Worker', workerName),
      row(customerV21Assets.map, language === 'vi' ? 'Địa điểm' : 'Location', address),
      row(customerV21Assets.kael, language === 'vi' ? 'Tóm tắt Kael' : 'Kael brief', deal.broadcast?.prebrief?.[0] || copy.dataPending),
    ]
  }
  if (screenId === '2.13-job-progress') {
    return [
      row(customerV21Assets.activity, language === 'vi' ? 'Tiến độ' : 'Progress', customerV21StatusCopy[language][deal.status]),
      row(customerV21Assets.evidence, language === 'vi' ? 'Ảnh hoàn tất' : 'Completion photos', completionEvidence),
      row(customerV21Assets.feedback, language === 'vi' ? 'Ghi chú hoàn tất' : 'Completion note', completionNote),
    ]
  }
  return common
}

function MediaRow({ image, label, value }: { image: ImageSourcePropType; label: string; value: string }) {
  const { tokens } = useV21Theme()
  return (
    <View style={styles.mediaRow}>
      <AssetTile image={image} label={label} size={42} />
      <View style={styles.flex}>
        <Text style={[styles.labelText, { color: tokens.muted }]}>{label}</Text>
        <Text numberOfLines={2} style={[styles.cardTitle, { color: tokens.text }]}>{value}</Text>
      </View>
    </View>
  )
}

function AccountUtilityTile({
  image,
  label,
  value,
}: {
  image: ImageSourcePropType
  label: string
  value: string
}) {
  const { tokens } = useV21Theme()
  const router = useRouter()
  const utility = profileUtilityFromLabel(label)
  const handlePress = utility
    ? () => router.replace(`/(customer)/profile?utility=${utility}` as never)
    : undefined
  const tileContent = (
    <>
      <SourceCardSkin />
      <ZipMintAura scope={`ProfileUtility${profileAuraScope(label)}`} />
      <AssetTile image={image} label={label} size={48} sourceAura style={styles.accountUtilityIcon} />
      <Text numberOfLines={1} style={[styles.utilityLabel, { color: tokens.text }]}>{label}</Text>
      <Text numberOfLines={2} style={[styles.serviceNote, { color: tokens.muted }]}>{value}</Text>
      {utility ? <Text style={[styles.accountUtilityChevron, { color: tokens.primary }]}>›</Text> : null}
    </>
  )
  if (handlePress) {
    return (
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        onPress={handlePress}
        style={({ pressed }) => [
          styles.accountUtilityTile,
          { backgroundColor: tokens.raised, borderColor: tokens.border },
          pressed ? styles.pressed : null,
        ]}
        testID={`customer-v21-profile-utility-${utility}`}
      >
        {tileContent}
      </Pressable>
    )
  }
  return (
    <View style={[styles.accountUtilityTile, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
      {tileContent}
    </View>
  )
}

function SettingsActionRow({
  body,
  image,
  onPress,
  status,
  testID,
  title,
}: {
  body: string
  image: ImageSourcePropType
  onPress: () => void
  status: string
  testID: string
  title: string
}) {
  const { tokens } = useV21Theme()
  return (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.profileSettingsActionRow,
        { backgroundColor: tokens.raised, borderColor: tokens.border },
        pressed ? styles.pressed : null,
      ]}
      testID={testID}
    >
      <ZipMintAura scope={`ProfileSettings${profileAuraScope(title)}`} />
      <AssetTile image={image} label={title} size={48} sourceAura style={styles.profileSettingsActionIcon} />
      <View style={styles.flex}>
        <Text numberOfLines={1} style={[styles.profileInsightTitle, { color: tokens.text }]}>{title}</Text>
        <Text numberOfLines={2} style={[styles.bodyText, { color: tokens.muted }]}>{body}</Text>
      </View>
      <View style={styles.profileInsightChipFrame}>
        <ZipMintAura scope={`ProfileSettingsStatus${profileAuraScope(status)}`} />
        <KaelChip
          label={status}
          style={styles.profileInsightChip}
          textStyle={styles.profileMintChipText}
          variant="selected"
        />
      </View>
    </Pressable>
  )
}

function ProfileUtilitySection({
  insights,
  kind,
}: {
  insights: CustomerProfileInsightsResponse | null
  kind: CustomerProfileUtility
}) {
  const language = useAppLanguage()
  const router = useRouter()
  const workflow = useFrontendWorkflow()
  const { session, updateCustomerProfile, updatePassword } = useAuth()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const metadataFullName = stringFromUnknown(session?.user.user_metadata?.full_name)
  const metadataPhone = stringFromUnknown(session?.user.user_metadata?.phone_number)
  const metadataEmail = stringFromUnknown(session?.user.user_metadata?.contact_email) ?? session?.user.email ?? ''
  const metadataDefaultAddress = stringFromUnknown(session?.user.user_metadata?.default_address)
  const metadataSavedAddresses = stringArrayFromUnknown(session?.user.user_metadata?.saved_addresses)
  const [selectedBankKey, setSelectedBankKey] = useState<CustomerV21BankKey | null>(null)
  const selectedBank = selectedBankKey ? paymentBankOptions.find((bank) => bank.key === selectedBankKey) ?? null : null
  const [paymentAccountNameDraft, setPaymentAccountNameDraft] = useState('')
  const [paymentAccountNumberDraft, setPaymentAccountNumberDraft] = useState('')
  const [paymentAccountConfirmDraft, setPaymentAccountConfirmDraft] = useState('')
  const [confirmedPaymentBankKey, setConfirmedPaymentBankKey] = useState<CustomerV21BankKey | null>(null)
  const [confirmedPaymentBankName, setConfirmedPaymentBankName] = useState('')
  const [confirmedPaymentAccountName, setConfirmedPaymentAccountName] = useState('')
  const [confirmedPaymentAccountMasked, setConfirmedPaymentAccountMasked] = useState('')
  const [confirmedPaymentMethodStatus, setConfirmedPaymentMethodStatus] = useState<string | null>(null)
  const [paymentHydrated, setPaymentHydrated] = useState(false)
  const [paymentSaving, setPaymentSaving] = useState(false)
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null)
  const memoryRows = agenticMemoryRowsFromUnknown(workflow.customerKaelMemory, language)
  const addressMemory = memoryRows.find((row) => row.preferenceKey === 'preferred_address')
  const [settingsMemoryPermissionOverride, setSettingsMemoryPermissionOverride] = useState<boolean | null>(null)
  const [settingsMemoryPermissionPending, setSettingsMemoryPermissionPending] = useState(false)
  const [settingsMemoryPermissionMessage, setSettingsMemoryPermissionMessage] = useState<string | null>(null)
  const backendMessageMemoryAllowed = agenticBooleanFromMemory(workflow.customerKaelMemory, 'message_interaction_memory')
  const initialDefaultAddress = metadataDefaultAddress ?? (addressMemory?.value && addressMemory.value !== copy.dataPending ? addressMemory.value : '')
  const [defaultAddressDraft, setDefaultAddressDraft] = useState(initialDefaultAddress)
  const [confirmedDefaultAddress, setConfirmedDefaultAddress] = useState(initialDefaultAddress)
  const [secondaryAddressDraft, setSecondaryAddressDraft] = useState('')
  const [savedAddresses, setSavedAddresses] = useState(metadataSavedAddresses)
  const [addressSaving, setAddressSaving] = useState(false)
  const [addressMessage, setAddressMessage] = useState<string | null>(null)
  const [passwordPanelOpen, setPasswordPanelOpen] = useState(false)
  const [currentPasswordDraft, setCurrentPasswordDraft] = useState('')
  const [newPasswordDraft, setNewPasswordDraft] = useState('')
  const [confirmPasswordDraft, setConfirmPasswordDraft] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null)
  const [accountPanelOpen, setAccountPanelOpen] = useState(false)
  const [accountFullNameDraft, setAccountFullNameDraft] = useState(metadataFullName ?? '')
  const [accountPhoneDraft, setAccountPhoneDraft] = useState(metadataPhone ?? '')
  const [accountEmailDraft, setAccountEmailDraft] = useState(metadataEmail)
  const [accountSaving, setAccountSaving] = useState(false)
  const [accountMessage, setAccountMessage] = useState<string | null>(null)
  const savedAddressCount = insightNumber(insights, 'saved_address_count', copy.emptyProfileMetric, language)

  useEffect(() => {
    if (settingsMemoryPermissionOverride === null) {
      setSettingsMemoryPermissionMessage(null)
      return
    }
    if (settingsMemoryPermissionOverride === backendMessageMemoryAllowed) {
      setSettingsMemoryPermissionOverride(null)
      setSettingsMemoryPermissionMessage(null)
    }
  }, [backendMessageMemoryAllowed, settingsMemoryPermissionOverride])

  useEffect(() => {
    if (kind !== 'payment') return undefined
    let cancelled = false
    setPaymentHydrated(false)
    customerProfileService.getPaymentMethod().then((result) => {
      if (cancelled) return
      if (!result.success) {
        setPaymentMessage(null)
        setPaymentHydrated(true)
        return
      }
      const method = result.data.payment_method
      if (method) {
        const bankKey = paymentBankKeyFromUnknown(method.bank_key)
        setSelectedBankKey(bankKey)
        setConfirmedPaymentBankKey(bankKey)
        setConfirmedPaymentBankName(method.bank_name)
        setConfirmedPaymentAccountName(method.account_holder_name)
        setConfirmedPaymentAccountMasked(method.bank_account_masked)
        setConfirmedPaymentMethodStatus(method.status)
        setPaymentAccountNameDraft(method.account_holder_name)
      }
      setPaymentHydrated(true)
    })
    return () => {
      cancelled = true
    }
  }, [kind])

  const saveAddressProfile = async (input: { defaultAddress?: string; savedAddresses?: string[] }) => {
    setAddressSaving(true)
    setAddressMessage(null)
    const result = await updateCustomerProfile(input)
    setAddressSaving(false)
    if (!result.success) {
      setAddressMessage(result.error ?? (language === 'vi' ? 'Chưa lưu' : 'Not saved'))
      return false
    }
    setAddressMessage(language === 'vi' ? 'Đã lưu' : 'Saved')
    return true
  }

  const accountCanSave =
    accountFullNameDraft.trim().length >= 2 ||
    accountPhoneDraft.trim().length >= 6 ||
    accountEmailDraft.trim().length >= 4
  const saveAccountProfile = async () => {
    if (!accountCanSave) {
      setAccountMessage(language === 'vi' ? 'Kiểm tra thông tin.' : 'Check details.')
      return false
    }
    setAccountSaving(true)
    setAccountMessage(null)
    const result = await updateCustomerProfile({
      email: accountEmailDraft.trim(),
      fullName: accountFullNameDraft.trim(),
      phone: accountPhoneDraft.trim(),
    })
    setAccountSaving(false)
    if (!result.success) {
      setAccountMessage(result.error ?? (language === 'vi' ? 'Chưa lưu' : 'Not saved'))
      return false
    }
    setAccountMessage(language === 'vi' ? 'Đã lưu' : 'Saved')
    return true
  }

  const messageMemoryAllowed = settingsMemoryPermissionOverride ?? backendMessageMemoryAllowed
  const toggleSettingsMessageMemory = async () => {
    if (settingsMemoryPermissionPending) return
    const nextEnabled = !messageMemoryAllowed
    setSettingsMemoryPermissionOverride(nextEnabled)
    setSettingsMemoryPermissionMessage(null)
    setSettingsMemoryPermissionPending(true)
    let result: MemoryPreferenceActionResult = false
    try {
      result = await workflow.actions.updateCustomerKaelMemoryPreference({
        enabled: nextEnabled,
        key: 'message_interaction_memory',
      })
    } catch {
      result = false
    }
    setSettingsMemoryPermissionPending(false)
    if (!memoryPreferenceActionSucceeded(result)) {
      if (nextEnabled === backendMessageMemoryAllowed) {
        setSettingsMemoryPermissionOverride(null)
        setSettingsMemoryPermissionMessage(null)
        return
      }
      setSettingsMemoryPermissionOverride(nextEnabled)
      const settingsMemorySyncMessage = memoryPreferenceSyncFailureLabel(result, language, {
        accessToken: session?.access_token ?? null,
        hasSession: Boolean(session?.user.id),
      })
      setSettingsMemoryPermissionMessage(settingsMemorySyncMessage)
      return
    }
    setSettingsMemoryPermissionMessage(language === 'vi' ? 'Đã lưu' : 'Saved')
  }

  const paymentAccountNumber = normalizeBankAccountNumber(paymentAccountNumberDraft)
  const paymentAccountConfirm = normalizeBankAccountNumber(paymentAccountConfirmDraft)
  const paymentAccountMatches = paymentAccountNumber.length > 0 && paymentAccountNumber === paymentAccountConfirm
  const paymentAccountLongEnough = paymentAccountNumber.length >= 6
  const paymentAccountName = paymentAccountNameDraft.trim()
  const paymentCanSave = Boolean(selectedBank && paymentAccountName.length >= 2 && paymentAccountLongEnough && paymentAccountMatches)
  const confirmedPaymentReady = Boolean(confirmedPaymentBankKey && confirmedPaymentAccountMasked)
  const confirmedPaymentStatus = !paymentHydrated
    ? (language === 'vi' ? 'Đang tải' : 'Loading')
    : confirmedPaymentMethodStatus === 'verified'
    ? (language === 'vi' ? 'Đã xác minh' : 'Verified')
    : confirmedPaymentReady
      ? (language === 'vi' ? 'Chưa xác minh' : 'Unverified')
      : copy.dataPending

  const savePaymentProfile = async () => {
    if (!selectedBank || !paymentCanSave) return false
    setPaymentSaving(true)
    setPaymentMessage(null)
    const masked = maskBankAccountNumber(paymentAccountNumber)
    const result = await customerProfileService.savePaymentMethod({
      account_holder_name: paymentAccountName,
      bank_account: paymentAccountNumber,
      bank_key: selectedBank.key,
      bank_name: selectedBank.name,
    })
    setPaymentSaving(false)
    if (!result.success) {
      setPaymentMessage(null)
      return false
    }
    const method = result.data.payment_method
    setConfirmedPaymentBankKey(selectedBank.key)
    setConfirmedPaymentBankName(method?.bank_name ?? selectedBank.name)
    setConfirmedPaymentAccountName(method?.account_holder_name ?? paymentAccountName)
    setConfirmedPaymentAccountMasked(method?.bank_account_masked ?? masked)
    setConfirmedPaymentMethodStatus(method?.status ?? 'pending_verification')
    setPaymentMessage(language === 'vi' ? 'Đã lưu' : 'Saved')
    return true
  }

  const passwordMatches = newPasswordDraft.length > 0 && newPasswordDraft === confirmPasswordDraft
  const passwordCanSave = currentPasswordDraft.trim().length > 0 && newPasswordDraft.length >= 8 && passwordMatches
  const saveSettingsPassword = async () => {
    if (!passwordCanSave) {
      setPasswordMessage(language === 'vi' ? 'Kiểm tra mật khẩu.' : 'Check password.')
      return false
    }
    setPasswordSaving(true)
    setPasswordMessage(null)
    const result = await updatePassword({
      currentPassword: currentPasswordDraft,
      newPassword: newPasswordDraft,
    })
    setPasswordSaving(false)
    if (!result.success) {
      setPasswordMessage(result.error ?? (language === 'vi' ? 'Chưa đổi' : 'Not changed'))
      return false
    }
    setCurrentPasswordDraft('')
    setNewPasswordDraft('')
    setConfirmPasswordDraft('')
    setPasswordMessage(language === 'vi' ? 'Đã đổi mật khẩu' : 'Password changed')
    return true
  }

  if (kind === 'payment') {
    return (
      <View style={styles.profileUtilityStack} testID="customer-v21-profile-utility-payment-screen">
        <ProfileAuraCard contentStyle={styles.profileUtilityHero} scope="UtilityPaymentHero" testID="customer-v21-profile-payment-settings">
          <AssetTile image={customerV21Assets.payment} label={profileUtilityTitle(kind, language)} size={58} sourceAura style={styles.profileUtilityHeroIcon} />
          <View style={styles.flex}>
            <Text style={[styles.cardTitle, { color: tokens.text }]}>{language === 'vi' ? 'Tài khoản nhận tiền' : 'Receiving account'}</Text>
            <Text style={[styles.bodyText, { color: tokens.muted }]}>
              {confirmedPaymentReady
                ? `${confirmedPaymentBankName || copy.dataPending} · ${confirmedPaymentAccountMasked}`
                : (language === 'vi' ? 'Chọn ngân hàng và xác nhận số tài khoản.' : 'Choose a bank and confirm the account number.')}
            </Text>
          </View>
          <KaelChip label={confirmedPaymentStatus} variant={confirmedPaymentReady ? 'selected' : 'unselected'} />
        </ProfileAuraCard>

        <SectionActionHeader
          action={language === 'vi' ? `${formatNumber(paymentBankOptions.length, language)} ngân hàng` : `${formatNumber(paymentBankOptions.length, language)} banks`}
          title={language === 'vi' ? 'Chọn ngân hàng' : 'Choose bank'}
        />
        <View style={styles.paymentBankGrid} testID="customer-v21-profile-payment-bank-grid">
          <CaseWideMintAura scope="ProfilePaymentBankGrid" testID="customer-v21-profile-payment-bank-grid-wide-mint-aura" />
          {paymentBankOptions.map((bank) => (
            <PaymentBankTile
              bank={bank}
              disabled={false}
              key={bank.key}
              onPress={() => {
                setSelectedBankKey(bank.key)
                setPaymentMessage(null)
              }}
              selected={bank.key === selectedBankKey}
            />
          ))}
        </View>

        <ProfileAuraCard cardStyle={styles.profileListCard} contentStyle={styles.profilePaymentForm} scope="UtilityPaymentAccount" testID="customer-v21-profile-payment-account-form">
          <View style={styles.profileAddressBlockHeader}>
            <Text style={[styles.cardTitle, { color: tokens.text }]}>{language === 'vi' ? 'Xác nhận tài khoản' : 'Confirm account'}</Text>
            <Text style={[styles.bodyText, { color: tokens.muted }]}>
              {language === 'vi' ? 'Nhập đúng tên chủ tài khoản và số tài khoản hai lần trước khi lưu.' : 'Enter the holder name and the account number twice before saving.'}
            </Text>
          </View>
          <KaelTextInput
            accessibilityLabel={language === 'vi' ? 'Tên chủ tài khoản' : 'Account holder'}
            autoCapitalize="characters"
            onChangeText={(value) => {
              setPaymentAccountNameDraft(value)
              setPaymentMessage(null)
            }}
            placeholder={language === 'vi' ? 'Tên chủ tài khoản' : 'Account holder'}
            placeholderTextColor={tokens.subtleText}
            style={[styles.profileAddressInput, customerV21WebTextInputNoOutline, { backgroundColor: tokens.raised, borderColor: tokens.border, color: tokens.text }]}
            testID="customer-v21-profile-payment-account-name-input"
            value={paymentAccountNameDraft}
          />
          <KaelTextInput
            accessibilityLabel={language === 'vi' ? 'Số tài khoản' : 'Account number'}
            keyboardType="number-pad"
            onChangeText={(value) => {
              setPaymentAccountNumberDraft(value)
              setPaymentMessage(null)
            }}
            placeholder={language === 'vi' ? 'Số tài khoản' : 'Account number'}
            placeholderTextColor={tokens.subtleText}
            style={[styles.profileAddressInput, customerV21WebTextInputNoOutline, { backgroundColor: tokens.raised, borderColor: tokens.border, color: tokens.text }]}
            testID="customer-v21-profile-payment-account-number-input"
            value={paymentAccountNumberDraft}
          />
          <KaelTextInput
            accessibilityLabel={language === 'vi' ? 'Nhập lại số tài khoản' : 'Confirm account number'}
            keyboardType="number-pad"
            onChangeText={(value) => {
              setPaymentAccountConfirmDraft(value)
              setPaymentMessage(null)
            }}
            placeholder={language === 'vi' ? 'Nhập lại số tài khoản' : 'Confirm account number'}
            placeholderTextColor={tokens.subtleText}
            style={[styles.profileAddressInput, customerV21WebTextInputNoOutline, { backgroundColor: tokens.raised, borderColor: paymentAccountConfirm.length > 0 && !paymentAccountMatches ? tokens.danger : tokens.border, color: tokens.text }]}
            testID="customer-v21-profile-payment-account-confirm-input"
            value={paymentAccountConfirmDraft}
          />
          {paymentAccountConfirm.length > 0 && !paymentAccountMatches ? (
            <Text style={[styles.profileAddressMessage, { color: tokens.danger }]} testID="customer-v21-profile-payment-account-mismatch">
              {language === 'vi' ? 'Số tài khoản chưa khớp.' : 'Account numbers do not match.'}
            </Text>
          ) : null}
          <KaelButton
            disabled={paymentSaving || !paymentCanSave}
            label={paymentSaving ? (language === 'vi' ? 'Đang lưu' : 'Saving') : (language === 'vi' ? 'Lưu tài khoản' : 'Save account')}
            onPress={() => void savePaymentProfile()}
            showPrimaryGradient={false}
            style={[styles.profileAddressSaveDefaultButton, paymentCanSave && !paymentSaving ? styles.profileAddressSaveDefaultButtonActive : null]}
            testID="customer-v21-profile-payment-account-save"
          />
        </ProfileAuraCard>

        {paymentMessage ? <Text style={[styles.profileAddressMessage, { color: tokens.primary }]} testID="customer-v21-profile-payment-message">{paymentMessage}</Text> : null}
      </View>
    )
  }

  if (kind === 'settings') {
    return (
      <View style={styles.profileUtilityStack} testID="customer-v21-profile-utility-settings-screen">
        <ProfileAuraCard contentStyle={styles.profileUtilityHero} scope="UtilitySettingsHero" testID="customer-v21-profile-settings-hero">
          <AssetTile image={customerV21Assets.theme} label={profileUtilityTitle(kind, language)} size={58} sourceAura style={styles.profileUtilityHeroIcon} />
          <View style={styles.flex}>
            <Text style={[styles.cardTitle, { color: tokens.text }]}>{language === 'vi' ? 'Cài đặt tài khoản' : 'Account settings'}</Text>
            <Text style={[styles.bodyText, { color: tokens.muted }]}>
              {language === 'vi' ? 'Bảo mật, ngôn ngữ và dữ liệu Kael.' : 'Security, language, and Kael data.'}
            </Text>
          </View>
          <KaelChip label={language === 'vi' ? 'Tài khoản' : 'Account'} variant="selected" />
        </ProfileAuraCard>

        <SectionActionHeader
          action={language === 'vi' ? 'Cơ bản' : 'Basics'}
          title={language === 'vi' ? 'Cài đặt chung' : 'General settings'}
        />
        <ProfileAuraCard cardStyle={styles.profileListCard} contentStyle={styles.profileSettingsListContent} scope="UtilitySettingsList" testID="customer-v21-profile-settings-list">
          <SettingsActionRow
            body={language === 'vi' ? 'Cập nhật tên, số điện thoại và email liên hệ.' : 'Update name, phone, and contact email.'}
            image={customerV21Assets.profile}
            onPress={() => {
              setAccountPanelOpen((current) => !current)
              setAccountMessage(null)
            }}
            status={accountPanelOpen ? (language === 'vi' ? 'Ẩn' : 'Hide') : (language === 'vi' ? 'Sửa' : 'Edit')}
            testID="customer-v21-profile-settings-account"
            title={language === 'vi' ? 'Thông tin cá nhân' : 'Personal details'}
          />
          {accountPanelOpen ? (
            <View style={styles.profileSettingsPasswordForm} testID="customer-v21-profile-settings-account-form">
              <KaelTextInput
                accessibilityLabel={language === 'vi' ? 'Họ và tên' : 'Full name'}
                onChangeText={(value) => {
                  setAccountFullNameDraft(value)
                  setAccountMessage(null)
                }}
                placeholder={language === 'vi' ? 'Họ và tên' : 'Full name'}
                placeholderTextColor={tokens.subtleText}
                style={[styles.profileAddressInput, customerV21WebTextInputNoOutline, { backgroundColor: tokens.raised, borderColor: tokens.border, color: tokens.text }]}
                testID="customer-v21-profile-settings-account-name-input"
                value={accountFullNameDraft}
              />
              <KaelTextInput
                accessibilityLabel={language === 'vi' ? 'Số điện thoại' : 'Phone number'}
                keyboardType="phone-pad"
                onChangeText={(value) => {
                  setAccountPhoneDraft(value)
                  setAccountMessage(null)
                }}
                placeholder={language === 'vi' ? 'Số điện thoại' : 'Phone number'}
                placeholderTextColor={tokens.subtleText}
                style={[styles.profileAddressInput, customerV21WebTextInputNoOutline, { backgroundColor: tokens.raised, borderColor: tokens.border, color: tokens.text }]}
                testID="customer-v21-profile-settings-account-phone-input"
                value={accountPhoneDraft}
              />
              <KaelTextInput
                accessibilityLabel={language === 'vi' ? 'Email liên hệ' : 'Contact email'}
                autoCapitalize="none"
                keyboardType="email-address"
                onChangeText={(value) => {
                  setAccountEmailDraft(value)
                  setAccountMessage(null)
                }}
                placeholder={language === 'vi' ? 'Email liên hệ' : 'Contact email'}
                placeholderTextColor={tokens.subtleText}
                style={[styles.profileAddressInput, customerV21WebTextInputNoOutline, { backgroundColor: tokens.raised, borderColor: tokens.border, color: tokens.text }]}
                testID="customer-v21-profile-settings-account-email-input"
                value={accountEmailDraft}
              />
              <KaelButton
                disabled={accountSaving || !accountCanSave}
                label={accountSaving ? (language === 'vi' ? 'Đang lưu' : 'Saving') : (language === 'vi' ? 'Lưu thông tin' : 'Save details')}
                onPress={() => void saveAccountProfile()}
                showPrimaryGradient={false}
                style={[styles.profileAddressSaveDefaultButton, accountCanSave && !accountSaving ? styles.profileAddressSaveDefaultButtonActive : null]}
                testID="customer-v21-profile-settings-account-save"
              />
              {accountMessage ? (
                <Text
                  style={[styles.profileAddressMessage, { color: accountMessage.includes('Đã') || accountMessage === 'Saved' ? tokens.primary : tokens.danger }]}
                  testID="customer-v21-profile-settings-account-message"
                >
                  {accountMessage}
                </Text>
              ) : null}
            </View>
          ) : null}
          <View style={[styles.profileListDivider, { backgroundColor: tokens.border }]} />
          <SettingsActionRow
            body={language === 'vi' ? 'Chuyển ngôn ngữ giao diện.' : 'Switch app language.'}
            image={customerV21Assets.language}
            onPress={() => setAppLanguage(language === 'vi' ? 'en' : 'vi')}
            status={language === 'vi' ? 'Tiếng Việt' : 'English'}
            testID="customer-v21-profile-settings-language"
            title={language === 'vi' ? 'Ngôn ngữ' : 'Language'}
          />
          <View style={[styles.profileListDivider, { backgroundColor: tokens.border }]} />
          <SettingsActionRow
            body={language === 'vi' ? 'Xác nhận mật khẩu hiện tại trước khi đổi.' : 'Confirm the current password first.'}
            image={customerV21Assets.shield}
            onPress={() => {
              setPasswordPanelOpen((current) => !current)
              setPasswordMessage(null)
            }}
            status={passwordPanelOpen ? (language === 'vi' ? 'Ẩn' : 'Hide') : (language === 'vi' ? 'Đổi' : 'Change')}
            testID="customer-v21-profile-settings-password"
            title={language === 'vi' ? 'Bảo mật đăng nhập' : 'Login security'}
          />
          {passwordPanelOpen ? (
            <View style={styles.profileSettingsPasswordForm} testID="customer-v21-profile-settings-password-form">
              <KaelTextInput
                accessibilityLabel={language === 'vi' ? 'Mật khẩu hiện tại' : 'Current password'}
                onChangeText={(value) => {
                  setCurrentPasswordDraft(value)
                  setPasswordMessage(null)
                }}
                placeholder={language === 'vi' ? 'Mật khẩu hiện tại' : 'Current password'}
                placeholderTextColor={tokens.subtleText}
                secureTextEntry
                style={[styles.profileAddressInput, customerV21WebTextInputNoOutline, { backgroundColor: tokens.raised, borderColor: tokens.border, color: tokens.text }]}
                testID="customer-v21-profile-settings-password-current-input"
                value={currentPasswordDraft}
              />
              <KaelTextInput
                accessibilityLabel={language === 'vi' ? 'Mật khẩu mới' : 'New password'}
                onChangeText={(value) => {
                  setNewPasswordDraft(value)
                  setPasswordMessage(null)
                }}
                placeholder={language === 'vi' ? 'Mật khẩu mới' : 'New password'}
                placeholderTextColor={tokens.subtleText}
                secureTextEntry
                style={[styles.profileAddressInput, customerV21WebTextInputNoOutline, { backgroundColor: tokens.raised, borderColor: tokens.border, color: tokens.text }]}
                testID="customer-v21-profile-settings-password-new-input"
                value={newPasswordDraft}
              />
              <KaelTextInput
                accessibilityLabel={language === 'vi' ? 'Nhập lại mật khẩu mới' : 'Confirm new password'}
                onChangeText={(value) => {
                  setConfirmPasswordDraft(value)
                  setPasswordMessage(null)
                }}
                placeholder={language === 'vi' ? 'Nhập lại mật khẩu mới' : 'Confirm new password'}
                placeholderTextColor={tokens.subtleText}
                secureTextEntry
                style={[styles.profileAddressInput, customerV21WebTextInputNoOutline, { backgroundColor: tokens.raised, borderColor: confirmPasswordDraft.length > 0 && !passwordMatches ? tokens.danger : tokens.border, color: tokens.text }]}
                testID="customer-v21-profile-settings-password-confirm-input"
                value={confirmPasswordDraft}
              />
              {confirmPasswordDraft.length > 0 && !passwordMatches ? (
                <Text style={[styles.profileAddressMessage, { color: tokens.danger }]} testID="customer-v21-profile-settings-password-mismatch">
                  {language === 'vi' ? 'Mật khẩu chưa khớp.' : 'Passwords do not match.'}
                </Text>
              ) : null}
              <KaelButton
                disabled={passwordSaving || !passwordCanSave}
                label={passwordSaving ? (language === 'vi' ? 'Đang đổi' : 'Changing') : (language === 'vi' ? 'Lưu mật khẩu' : 'Save password')}
                onPress={() => void saveSettingsPassword()}
                showPrimaryGradient={false}
                style={[styles.profileAddressSaveDefaultButton, passwordCanSave && !passwordSaving ? styles.profileAddressSaveDefaultButtonActive : null]}
                testID="customer-v21-profile-settings-password-save"
              />
              {passwordMessage ? (
                <Text
                  style={[styles.profileAddressMessage, { color: passwordMessage.includes('Đã') || passwordMessage === 'Password changed' ? tokens.primary : tokens.danger }]}
                  testID="customer-v21-profile-settings-password-message"
                >
                  {passwordMessage}
                </Text>
              ) : null}
            </View>
          ) : null}
          <View style={[styles.profileListDivider, { backgroundColor: tokens.border }]} />
          <SettingsActionRow
            body={language === 'vi' ? 'Địa chỉ mặc định và địa chỉ phụ.' : 'Default and secondary addresses.'}
            image={customerV21Assets.address}
            onPress={() => router.replace('/(customer)/profile?utility=address' as never)}
            status={language === 'vi' ? 'Mở' : 'Open'}
            testID="customer-v21-profile-settings-address"
            title={language === 'vi' ? 'Địa chỉ' : 'Addresses'}
          />
          <View style={[styles.profileListDivider, { backgroundColor: tokens.border }]} />
          <SettingsActionRow
            body={language === 'vi' ? 'Ghi nhớ tương tác tin nhắn. Dữ liệu công việc vẫn giữ để vận hành.' : 'Remember message interactions. Job data stays for operations.'}
            image={customerV21Assets.memory}
            onPress={() => void toggleSettingsMessageMemory()}
            status={settingsMemoryPermissionPending
              ? (language === 'vi' ? 'Đang lưu' : 'Saving')
              : language === 'vi'
                ? (messageMemoryAllowed ? 'Cho phép' : 'Không cho phép')
                : (messageMemoryAllowed ? 'Allowed' : 'Not allowed')}
            testID="customer-v21-profile-settings-memory"
            title={language === 'vi' ? 'Bộ nhớ Kael' : 'Kael memory'}
          />
        </ProfileAuraCard>
      </View>
    )
  }

  const currentDefaultAddress = defaultAddressDraft.trim()
  const savedDefaultAddress = confirmedDefaultAddress.trim()
  const hasSavedDefaultAddress = savedDefaultAddress.length > 0
  const defaultDraftChanged = currentDefaultAddress !== savedDefaultAddress
  const defaultStatusLabel = defaultDraftChanged && currentDefaultAddress
    ? (language === 'vi' ? 'Chưa lưu' : 'Unsaved')
    : hasSavedDefaultAddress
      ? (language === 'vi' ? 'Đã đặt' : 'Set')
      : copy.dataPending
  const defaultStatusSaved = hasSavedDefaultAddress && !defaultDraftChanged
  const addressOptions = Array.from(new Set([savedDefaultAddress, ...savedAddresses])).filter(Boolean)

  return (
    <View style={styles.profileUtilityStack} testID="customer-v21-profile-utility-address-screen">
      <ProfileAuraCard cardStyle={styles.profileListCard} contentStyle={styles.profileAddressHub} scope="UtilityAddressHub" testID="customer-v21-profile-address-hub">
        <View style={styles.profileAddressHubHeader}>
          <AssetTile image={customerV21Assets.address} label={profileUtilityTitle(kind, language)} size={54} sourceAura style={styles.profileAddressHubIcon} />
          <View style={styles.flex}>
            <Text style={[styles.cardTitle, { color: tokens.text }]}>{language === 'vi' ? 'Cài đặt địa chỉ' : 'Address settings'}</Text>
            <Text style={[styles.bodyText, { color: tokens.muted }]}>
              {language === 'vi' ? 'Địa chỉ mặc định chỉ mở cho thợ sau khi nhận đơn.' : 'The default address opens only after a worker accepts the job.'}
            </Text>
          </View>
          <KaelChip label={defaultStatusLabel} variant={defaultStatusSaved ? 'selected' : 'unselected'} />
        </View>

        <View style={styles.profileAddressBlock}>
          <View style={styles.profileAddressBlockHeader}>
            <Text style={[styles.profileInsightTitle, { color: tokens.text }]}>{language === 'vi' ? 'Địa chỉ mặc định' : 'Default address'}</Text>
            <Text style={[styles.profileAddressHint, { color: defaultDraftChanged && currentDefaultAddress ? tokens.primary : tokens.muted }]}>
              {defaultDraftChanged && currentDefaultAddress
                ? (language === 'vi' ? 'Bấm lưu để đặt mặc định' : 'Save to set default')
                : hasSavedDefaultAddress
                  ? (language === 'vi' ? 'Thợ nhận khi đơn được chấp nhận' : 'Shared after acceptance')
                  : copy.dataPending}
            </Text>
          </View>
          <KaelTextInput
            accessibilityLabel={language === 'vi' ? 'Địa chỉ mặc định' : 'Default address'}
            onChangeText={setDefaultAddressDraft}
            placeholder={language === 'vi' ? 'Ví dụ: Tòa A, Quận 7' : 'Example: Tower A, District 7'}
            placeholderTextColor={tokens.subtleText}
            style={[styles.profileAddressInput, customerV21WebTextInputNoOutline, { backgroundColor: tokens.raised, borderColor: tokens.border, color: tokens.text }]}
            testID="customer-v21-profile-default-address-input"
            value={defaultAddressDraft}
          />
          <KaelButton
            disabled={addressSaving || currentDefaultAddress.length === 0}
            label={addressSaving ? (language === 'vi' ? 'Đang lưu' : 'Saving') : (language === 'vi' ? 'Lưu mặc định' : 'Save default')}
            onPress={() => {
              void saveAddressProfile({ defaultAddress: currentDefaultAddress, savedAddresses }).then((saved) => {
                if (saved) setConfirmedDefaultAddress(currentDefaultAddress)
              })
            }}
            showPrimaryGradient={false}
            style={[
              styles.profileAddressSaveDefaultButton,
              currentDefaultAddress.length > 0 && !addressSaving ? styles.profileAddressSaveDefaultButtonActive : null,
            ]}
            testID="customer-v21-profile-default-address-save"
          />
        </View>

        <View style={[styles.profileAddressDivider, { backgroundColor: tokens.border }]} />

        <View style={styles.profileAddressBlock}>
          <View style={styles.profileAddressBlockHeader}>
            <Text style={[styles.profileInsightTitle, { color: tokens.text }]}>{language === 'vi' ? 'Địa chỉ phụ' : 'Secondary addresses'}</Text>
            <Text style={[styles.profileAddressHint, { color: tokens.primary }]}>{language === 'vi' ? `${formatNumber(savedAddresses.length, language)} địa chỉ` : `${formatNumber(savedAddresses.length, language)} addresses`}</Text>
          </View>
          <View style={styles.profileAddressAddRow}>
            <KaelTextInput
              accessibilityLabel={language === 'vi' ? 'Địa chỉ phụ' : 'Secondary address'}
              onChangeText={setSecondaryAddressDraft}
              placeholder={language === 'vi' ? 'Thêm địa chỉ phụ' : 'Add secondary address'}
              placeholderTextColor={tokens.subtleText}
              style={[styles.profileAddressInput, styles.flex, customerV21WebTextInputNoOutline, { backgroundColor: tokens.raised, borderColor: tokens.border, color: tokens.text }]}
              testID="customer-v21-profile-secondary-address-input"
              value={secondaryAddressDraft}
            />
            <KaelButton
              disabled={addressSaving || secondaryAddressDraft.trim().length === 0}
              label={language === 'vi' ? 'Lưu' : 'Save'}
              onPress={() => {
                const nextAddress = secondaryAddressDraft.trim()
                const nextSavedAddresses = Array.from(new Set([...savedAddresses, nextAddress])).slice(0, 8)
                setSavedAddresses(nextSavedAddresses)
                setSecondaryAddressDraft('')
                void saveAddressProfile({
                  defaultAddress: savedDefaultAddress || undefined,
                  savedAddresses: nextSavedAddresses,
                })
              }}
              size="small"
              style={styles.profileAddressAddButton}
              testID="customer-v21-profile-secondary-address-save"
            />
          </View>
          {addressOptions.length > 0 ? (
            <View style={styles.profileAddressSavedList} testID="customer-v21-profile-address-list">
              {addressOptions.map((address, index) => {
                const isDefault = address === currentDefaultAddress
                return (
                  <View
                    key={`${address}-${index}`}
                    style={[styles.profileAddressSavedRow, { borderColor: tokens.border }]}
                    testID={`customer-v21-profile-secondary-address-${index}`}
                  >
                    <AssetTile image={customerV21Assets.map} label={language === 'vi' ? 'Địa chỉ đã lưu' : 'Saved address'} size={42} sourceAura style={styles.profileAddressSavedIcon} />
                    <View style={styles.flex}>
                      <Text numberOfLines={1} style={[styles.profileInsightTitle, { color: tokens.text }]}>
                        {isDefault ? (language === 'vi' ? 'Mặc định' : 'Default') : (language === 'vi' ? `Địa chỉ ${index + 1}` : `Address ${index + 1}`)}
                      </Text>
                      <Text numberOfLines={2} style={[styles.bodyText, { color: tokens.muted }]}>{address}</Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      disabled={isDefault}
                      onPress={() => {
                        setDefaultAddressDraft(address)
                        void saveAddressProfile({ defaultAddress: address, savedAddresses }).then((saved) => {
                          if (saved) setConfirmedDefaultAddress(address)
                        })
                      }}
                      style={[
                        styles.profileAddressDefaultButton,
                        {
                          backgroundColor: isDefault ? 'rgba(22, 199, 180, 0.13)' : tokens.raised,
                          borderColor: isDefault ? tokens.primary : tokens.border,
                          opacity: isDefault ? 0.86 : 1,
                        },
                      ]}
                      testID={`customer-v21-profile-secondary-address-default-${index}`}
                    >
                      <Text style={[styles.profileAddressDefaultText, { color: isDefault ? tokens.primary : tokens.muted }]}>
                        {isDefault ? (language === 'vi' ? 'Mặc định' : 'Default') : (language === 'vi' ? 'Đặt mặc định' : 'Make default')}
                      </Text>
                    </Pressable>
                  </View>
                )
              })}
            </View>
          ) : null}
        </View>
      </ProfileAuraCard>

      {addressMessage ? <Text style={[styles.profileAddressMessage, { color: addressMessage.includes('Đã') || addressMessage === 'Saved' ? tokens.primary : tokens.danger }]} testID="customer-v21-profile-address-message">{addressMessage}</Text> : null}
    </View>
  )
}

function ProfileRanking({ insights }: { insights: CustomerProfileInsightsResponse | null }) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const rank = typeof insights?.usage_rank_level === 'number' ? Math.max(0, Math.min(5, insights.usage_rank_level)) : 0
  const points = typeof insights?.usage_rank_points === 'number' ? Math.max(0, insights.usage_rank_points) : 0
  const rankCyclePoints = points > 0 ? (points % 1000 || 1000) : 0
  const progress = Math.max(0, Math.min(100, rankCyclePoints / 10))
  const nextRank = rank > 0 && rank < 5 ? rank + 1 : null
  const remaining = nextRank ? Math.max(0, 1000 - rankCyclePoints) : 0
  const levelProgress = rank > 0
    ? Math.max(0, Math.min(100, (((rank - 1) * 1000 + rankCyclePoints) / 4000) * 100))
    : 0
  const levelProgressLabel = language === 'vi'
    ? `${formatNumber(rankCyclePoints, language)} / 1.000 điểm`
    : `${formatNumber(rankCyclePoints, language)} / 1,000 points`
  const rankTitle = rank > 0
    ? (language === 'vi' ? 'Sử dụng tích cực, hành vi tốt.' : 'Positive usage and good behavior.')
    : copy.dataPending
  const pointsText = nextRank
    ? (language === 'vi'
      ? `${formatNumber(rankCyclePoints, language)} / 1.000 điểm · còn ${formatNumber(remaining, language)} điểm lên hạng ${nextRank}`
      : `${formatNumber(rankCyclePoints, language)} / 1,000 points · ${formatNumber(remaining, language)} to level ${nextRank}`)
    : (language === 'vi' ? `${formatNumber(rankCyclePoints, language)} / 1.000 điểm` : `${formatNumber(rankCyclePoints, language)} / 1,000 points`)
  const completedCount = insightNumber(insights, 'completed_service_count', copy.emptyProfileMetric, language)
  const streakLabel = insightNumber(insights, 'active_streak_days', copy.emptyProfileMetric, language, (value) => (language === 'vi' ? `${formatNumber(value, language)} ngày` : `${formatNumber(value, language)} days`))
  const reviewRate = insightNumber(insights, 'positive_review_rate_percent', copy.emptyProfileMetric, language, (value) => `${formatNumber(value, language)}%`)
  return (
    <View testID="customer-v21-profile-ranking">
      <ProfileAuraCard cardStyle={styles.profileRankingHeroCard} contentStyle={styles.profileRankingHero} scope="RankingHero" testID="customer-v21-profile-ranking-hero">
        <ProfileLiquidScore
          label={language === 'vi' ? 'Hạng hiện tại' : 'Current level'}
          percent={rank > 0 ? progress : 0}
          scope="Ranking"
          value={String(rank)}
        />
        <View style={styles.flex}>
          <View style={styles.profileRankingStatusChipFrame} testID="customer-v21-profile-ranking-status-chip">
            <ZipMintAura scope="ProfileRankingStatusChip" />
            <KaelChip
              label={profileRankStatus(rank, language, copy.dataPending)}
              style={rank > 0 ? styles.profileMintChip : styles.profileRankingEmptyChip}
              textStyle={rank > 0 ? styles.profileMintChipText : styles.profileRankingEmptyChipText}
              variant={rank > 0 ? 'selected' : 'unselected'}
            />
          </View>
          <Text style={[styles.profileDetailTitle, { color: tokens.text }]}>{rankTitle}</Text>
          <Text style={[styles.bodyText, { color: tokens.muted }]}>{pointsText}</Text>
          <ProfileProgressBar percent={rank > 0 ? progress : 0} testID="customer-v21-profile-ranking-progress" />
        </View>
      </ProfileAuraCard>

      <View style={styles.profileMetrics}>
        <ProfileStatCard label={language === 'vi' ? 'Dịch vụ đã dùng' : 'Used services'} value={completedCount} />
        <ProfileStatCard label={language === 'vi' ? 'Chuỗi hoạt động' : 'Active streak'} value={streakLabel} />
        <ProfileStatCard label={language === 'vi' ? 'Đánh giá tích cực' : 'Positive reviews'} value={reviewRate} />
      </View>

      <SectionActionHeader
        action={language === 'vi' ? 'Hạng tối đa 5' : 'Max level 5'}
        title={language === 'vi' ? 'Thang hạng khách hàng' : 'Customer levels'}
      />
      <View style={styles.rankRail}>
        {[1, 2, 3, 4, 5].map((node) => {
          const active = rank === node
          return (
            <View
              key={node}
              style={[
                styles.rankNode,
                active ? styles.rankNodeActive : styles.rankNodeRest,
                {
                  backgroundColor: active
                    ? (tokens.mode === 'dark' ? tokens.service : 'rgba(220,255,246,0.91)')
                    : (tokens.mode === 'dark' ? tokens.raised : 'rgba(255,255,255,0.81)'),
                  borderColor: active
                    ? (tokens.mode === 'dark' ? 'rgba(117,236,220,0.34)' : 'rgba(13,174,154,0.38)')
                    : (tokens.mode === 'dark' ? tokens.border : 'rgba(113,225,209,0.26)'),
                },
              ]}
              testID={`customer-v21-profile-rank-node-${node}`}
            >
              <SourceCardSkin />
              <ProfileCompactMintAura scope={`ProfileRankNodeFine${node}`} />
              {active ? <ZipMintAura scope={`ProfileRankNode${node}`} /> : null}
              <View style={styles.rankNodeContent}>
                <Text style={[styles.rankNodeValue, { color: active ? tokens.primary : tokens.muted }]}>{node}</Text>
                <Text numberOfLines={1} style={[styles.rankNodeLabel, { color: tokens.muted }]}>
                  {rankLabel(node, language)}
                </Text>
              </View>
            </View>
          )
        })}
      </View>
      <ProfileRankProcess
        label={language === 'vi' ? 'Tiến trình hạng' : 'Level progress'}
        percent={levelProgress}
        value={levelProgressLabel}
      />
      <ProfileRankingEvaluation
        completed={completedCount}
        protectedTransactions={protectedTransactionLabel(insights, language, copy.emptyProfileMetric)}
        reviewRate={reviewRate}
      />

      <SectionActionHeader
        action={language === 'vi' ? 'Chi tiết' : 'Details'}
        title={language === 'vi' ? 'Điều giúp bạn thăng hạng' : 'What improves your level'}
      />
      <ProfileAuraCard cardStyle={styles.profileListCard} contentStyle={styles.profileListContent} scope="RankingRules" testID="customer-v21-profile-ranking-rules">
        <ProfileInsightRow
          image={customerV21Assets.request}
          label={language === 'vi' ? 'Hoàn tất đúng quy trình' : 'Finish through workflow'}
          status={completedCount}
          testID="customer-v21-profile-ranking-rule-completed"
          value={language === 'vi' ? 'Không bỏ đơn sau khi thợ đã di chuyển' : 'No cancellation after worker travel starts'}
        />
        <View style={[styles.profileListDivider, { backgroundColor: tokens.border }]} />
        <ProfileInsightRow
          image={customerV21Assets.feedback}
          label={language === 'vi' ? 'Đánh giá chất lượng' : 'Quality review'}
          status={reviewRate}
          testID="customer-v21-profile-ranking-rule-review"
          value={language === 'vi' ? 'Phản hồi công bằng sau mỗi công việc' : 'Fair feedback after each job'}
        />
        <View style={[styles.profileListDivider, { backgroundColor: tokens.border }]} />
        <ProfileInsightRow
          image={customerV21Assets.shield}
          label={language === 'vi' ? 'Dùng thanh toán được bảo vệ' : 'Use protected payment'}
          status={protectedTransactionLabel(insights, language, copy.emptyProfileMetric)}
          testID="customer-v21-profile-ranking-rule-protected"
          value={language === 'vi' ? 'Giữ giao dịch trong hệ thống' : 'Keep transactions in system'}
        />
      </ProfileAuraCard>

    </View>
  )
}

function ProfileMoney({ insights }: { insights: CustomerProfileInsightsResponse | null }) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const score = typeof insights?.money_protection_score === 'number' ? Math.max(0, Math.min(100, insights.money_protection_score)) : 0
  const protectedTransactions = protectedTransactionLabel(insights, language, copy.emptyProfileMetric)
  const protectedValue = insightNumber(insights, 'protected_value_vnd', copy.emptyProfileMetric, language, (value) => formatVnd(value, language))
  const disputeFree = insightNumber(insights, 'dispute_free_rate_percent', copy.emptyProfileMetric, language, (value) => `${formatNumber(value, language)}%`)
  const scoreState = score >= 80
    ? (language === 'vi' ? 'Rất tốt' : 'Very good')
    : score > 0
      ? (language === 'vi' ? 'Đang theo dõi' : 'Tracking')
      : copy.dataPending
  return (
    <View testID="customer-v21-profile-money">
      <ProfileAuraCard contentStyle={styles.profileMoneyHero} scope="MoneyHero" testID="customer-v21-profile-money-hero">
        <Text style={[styles.profileMoneyKicker, { color: tokens.text }]}>{language === 'vi' ? 'Chỉ số Bảo vệ đồng tiền' : 'Money protection score'}</Text>
        <ProfileLiquidScore
          label="/100"
          percent={score}
          scope="Money"
          secondaryLabel={scoreState}
          size="large"
          value={String(score)}
        />
        <KaelChip label={score > 0 ? (language === 'vi' ? `Đáng tin cậy · ${scoreState}` : `Trusted · ${scoreState}`) : copy.dataPending} variant={score > 0 ? 'selected' : 'unselected'} />
        <Text style={[styles.profileMoneyBody, { color: tokens.muted }]}>
          {score > 0
            ? (language === 'vi' ? 'Dữ liệu bảo vệ dựa trên giao dịch thật trong hệ thống.' : 'Protection data is based on real in-system transactions.')
            : (language === 'vi' ? 'Chưa có giao dịch thật để tính chỉ số bảo vệ.' : 'No real transactions yet for protection score.')}
        </Text>
      </ProfileAuraCard>

      <View style={styles.profileMetrics}>
        <ProfileStatCard label={language === 'vi' ? 'Dịch vụ đúng giá' : 'Fair-price services'} value={protectedTransactions} />
        <ProfileStatCard label={language === 'vi' ? 'Tiền đã bảo vệ' : 'Protected value'} value={protectedValue} />
        <ProfileStatCard label={language === 'vi' ? 'Không tranh chấp' : 'Dispute free'} value={disputeFree} />
      </View>

      <SectionActionHeader
        action={language === 'vi' ? 'Chi tiết ›' : 'Details ›'}
        title={language === 'vi' ? 'Các lớp bảo vệ' : 'Protection layers'}
      />
      <ProfileAuraCard cardStyle={styles.profileListCard} contentStyle={styles.profileListContent} scope="MoneyLayers" testID="customer-v21-profile-money-layers">
        <ProfileInsightRow
          image={customerV21Assets.request}
          label={language === 'vi' ? 'Giá được khóa theo duyệt' : 'Price locked by approval'}
          status={typeof insights?.fair_price_service_count === 'number' && insights.fair_price_service_count > 0 ? (language === 'vi' ? 'Tốt' : 'Good') : copy.dataPending}
          value={language === 'vi' ? 'Mọi phát sinh đều cần bạn duyệt' : 'Every change needs your approval'}
        />
        <View style={[styles.profileListDivider, { backgroundColor: tokens.border }]} />
        <ProfileInsightRow
          image={customerV21Assets.payment}
          label={language === 'vi' ? 'Tiền đi qua sổ nội bộ' : 'Money through ledger'}
          status={protectedTransactions}
          value={language === 'vi' ? 'Không thanh toán ngoài nền tảng' : 'No off-platform payment'}
        />
        <View style={[styles.profileListDivider, { backgroundColor: tokens.border }]} />
        <ProfileInsightRow
          image={customerV21Assets.shield}
          label={language === 'vi' ? 'Giải ngân đúng trạng thái' : 'Release follows status'}
          status={fairPriceStatusLabel(insights?.fair_price_status, language, copy.dataPending)}
          value={language === 'vi' ? 'Theo trạng thái công việc thật' : 'Based on the real job state'}
        />
      </ProfileAuraCard>

      <SectionActionHeader
        action={language === 'vi' ? 'Xem ›' : 'View ›'}
        title={language === 'vi' ? 'Công việc gần nhất được bảo vệ' : 'Latest protected job'}
      />
      <ProfileAuraCard contentStyle={styles.profileProtectedJob} scope="MoneyLatest" testID="customer-v21-profile-money-latest">
        <AssetTile image={customerV21Assets.shield} label={language === 'vi' ? 'Bảo vệ' : 'Protection'} size={52} sourceAura style={styles.profileInsightIcon} />
        <View style={styles.flex}>
          <Text style={[styles.profileInsightTitle, { color: tokens.text }]}>{language === 'vi' ? 'Theo công việc thật' : 'Real job only'}</Text>
          <Text style={[styles.bodyText, { color: tokens.muted }]}>{copy.dataPending}</Text>
        </View>
        <KaelChip label={copy.dataPending} variant="unselected" />
      </ProfileAuraCard>

      <ProfileAuraCard contentStyle={styles.profileKaelNote} scope="MoneyKael" testID="customer-v21-profile-money-kael">
        <AssetTile image={customerV21Assets.kaelHead} label="Kael" size={42} sourceAura style={styles.infoNoticeIcon} />
        <View style={styles.flex}>
          <Text style={[styles.cardTitle, { color: tokens.text }]}>{language === 'vi' ? 'Kael nhắc bạn' : 'Kael reminder'}</Text>
          <Text style={[styles.bodyText, { color: tokens.muted }]}>
            {language === 'vi' ? 'Kael chỉ giải thích và theo dõi. Quyền thanh toán nằm trong quy trình được phép.' : 'Kael explains and tracks. Payment authority stays in the allowed workflow.'}
          </Text>
        </View>
      </ProfileAuraCard>
    </View>
  )
}

function ProfileMemory() {
  const language = useAppLanguage()
  const workflow = useFrontendWorkflow()
  const { tokens } = useV21Theme()
  const memory = workflow.customerKaelMemory
  const copy = customerV21CommonCopy[language]
  const memoryRecord = memory && typeof memory === 'object' ? memory as Record<string, unknown> : null
  const preference = stringFromUnknown(memoryRecord?.preference_summary) ?? copy.dataPending
  const servicePrefs = memoryRecord?.service_preferences && typeof memoryRecord.service_preferences === 'object'
    ? memoryRecord.service_preferences as Record<string, unknown>
    : {}
  const languageValue = stringFromUnknown(memoryRecord?.language)?.toUpperCase() ?? copy.dataPending
  const servicePreference = servicePreferenceLabel(servicePrefs.preferred_service, language) ?? copy.dataPending
  return (
    <View testID="customer-v21-profile-memory">
      <V21Card glass style={styles.profileDetailHero}>
        <AssetTile image={customerV21Assets.memory} label={customerV21ScreenTitles[language]['5.4-memory']} size={62} />
        <View style={styles.flex}>
          <EyebrowPill label={memoryRecord ? (language === 'vi' ? 'BỘ NHỚ KAEL' : 'KAEL MEMORY') : copy.dataPending} />
          <Text style={[styles.caseOverviewTitle, { color: tokens.text }]}>
            {language === 'vi' ? 'Kael nhớ theo quyền bạn cho.' : 'Kael remembers with your permission.'}
          </Text>
          <Text style={[styles.bodyText, { color: tokens.muted }]}>{preference}</Text>
        </View>
      </V21Card>

      <SectionActionHeader
        action={memoryRecord ? (language === 'vi' ? 'Theo dữ liệu thật' : 'Real data') : copy.dataPending}
        title={language === 'vi' ? 'Thông tin được phép dùng' : 'Allowed memory'}
      />
      <V21Card style={styles.memoryListCard}>
        <MemoryPermissionRow
          enabled={preference !== copy.dataPending}
          image={customerV21Assets.memory}
          label={language === 'vi' ? 'Tóm tắt sở thích' : 'Preference summary'}
          value={preference}
        />
        <View style={[styles.memoryDivider, { backgroundColor: tokens.border }]} />
        <MemoryPermissionRow
          enabled={languageValue !== copy.dataPending}
          image={customerV21Assets.language}
          label={language === 'vi' ? 'Ngôn ngữ' : 'Language'}
          value={languageValue}
        />
        <View style={[styles.memoryDivider, { backgroundColor: tokens.border }]} />
        <MemoryPermissionRow
          enabled={servicePreference !== copy.dataPending}
          image={customerV21ServiceAssets.cleaning}
          label={language === 'vi' ? 'Ưu tiên dịch vụ' : 'Service preference'}
          value={servicePreference}
        />
      </V21Card>

      <SectionActionHeader
        action={language === 'vi' ? 'Quy tắc' : 'Rules'}
        title={language === 'vi' ? 'Ranh giới dữ liệu' : 'Data boundaries'}
      />
      <V21Card style={styles.memoryListCard}>
        <MemoryPermissionRow
          enabled
          image={customerV21Assets.privacy}
          label={language === 'vi' ? 'Không trộn trò chuyện thường vào công việc' : 'Do not mix normal chat into jobs'}
          value={language === 'vi' ? 'Bật theo quy trình' : 'Workflow enforced'}
        />
        <View style={[styles.memoryDivider, { backgroundColor: tokens.border }]} />
        <MemoryPermissionRow
          enabled={false}
          image={customerV21Assets.profile}
          label={language === 'vi' ? 'Chia sẻ sở thích với thợ' : 'Share preferences with worker'}
          value={copy.dataPending}
        />
        <View style={[styles.memoryDivider, { backgroundColor: tokens.border }]} />
        <MemoryPermissionRow
          enabled
          image={customerV21Assets.shield}
          label={language === 'vi' ? 'Cảnh báo thanh toán ngoài nền tảng' : 'Off-platform payment warning'}
          value={language === 'vi' ? 'Bật theo quy trình' : 'Workflow enforced'}
        />
      </V21Card>
    </View>
  )
}

function MemoryPermissionRow({
  control = 'toggle',
  enabled,
  image,
  label,
  onToggle,
  pending = false,
  preferenceKey,
  statusLabel,
  value,
}: {
  control?: 'toggle' | 'chip'
  enabled: boolean
  image: ImageSourcePropType
  label: string
  onToggle?: () => void
  pending?: boolean
  preferenceKey?: CustomerKaelMemoryPreferenceKey
  statusLabel?: string
  value: string
}) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  return (
    <View style={styles.memoryRow}>
      <AssetTile image={image} label={label} size={44} sourceAura style={styles.memoryIcon} />
      <View style={styles.flex}>
        <Text adjustsFontSizeToFit minimumFontScale={0.78} numberOfLines={1} style={[styles.cardTitle, { color: tokens.text }]}>{label}</Text>
        <Text numberOfLines={2} style={[styles.bodyText, { color: tokens.muted }]}>{value}</Text>
      </View>
      {control === 'chip' ? (
        <MatchingHandoffChip
          label={statusLabel ?? (enabled ? (language === 'vi' ? 'Bật' : 'On') : customerV21CommonCopy[language].dataPending)}
          style={styles.memoryStatusChip}
          tone={enabled ? 'success' : 'selected'}
        />
      ) : (
        <Pressable
          accessibilityLabel={enabled ? (language === 'vi' ? 'Đang bật' : 'On') : (language === 'vi' ? 'Chưa bật' : 'Off')}
          accessibilityRole="switch"
          accessibilityState={{ checked: enabled, disabled: pending || !onToggle, busy: pending }}
          disabled={pending || !onToggle}
          onPress={onToggle}
          style={[
            styles.memoryToggle,
            pending ? styles.memoryTogglePending : null,
            {
              backgroundColor: enabled ? tokens.primary : tokens.border,
            },
          ]}
          testID={preferenceKey ? `customer-v21-memory-toggle-${preferenceKey}` : undefined}
        >
          {pending ? (
            <ActivityIndicator color={enabled ? '#FFFFFF' : tokens.primary} size="small" />
          ) : (
            <View style={[styles.memoryToggleKnob, enabled ? styles.memoryToggleKnobOn : null]} />
          )}
        </Pressable>
      )}
    </View>
  )
}

function ChatEvidenceStrip({ mediaCount, mode }: { mediaCount: number | null | undefined; mode: CustomerKaelMode }) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const countLabel = formatKnownCount(mediaCount, language)
  return (
    <View style={[styles.chatEvidenceStrip, { backgroundColor: tokens.ghost, borderColor: tokens.border }]} testID="customer-v21-chat-evidence-strip">
      <MediaRow
        image={mode === 'case' ? customerV21Assets.evidence : customerV21Assets.kael}
        label={mode === 'case' ? (language === 'vi' ? 'Bằng chứng công việc' : 'Work evidence') : (language === 'vi' ? 'Ảnh / video' : 'Photo / video')}
        value={countLabel}
      />
    </View>
  )
}

function ChatBubble({ role, testID, text }: { role: 'customer' | 'kael'; testID?: string; text: string }) {
  const { tokens } = useV21Theme()
  const isCustomer = role === 'customer'
  return (
    <View style={[styles.chatBubble, isCustomer ? styles.chatBubbleCustomer : styles.chatBubbleKael, { backgroundColor: isCustomer ? tokens.primary : tokens.raised, borderColor: tokens.border }]} testID={testID}>
      <Text style={[styles.chatBubbleText, { color: isCustomer ? tokens.primaryText : tokens.text }]}>{text}</Text>
    </View>
  )
}

function AgenticEvidenceGateCard({
  busy,
  mediaDrafts,
  onAddMedia,
  onConfirm,
  onReasonChange,
  onReject,
  onSkip,
  onVoiceSaved,
  rejectOpen,
  rejectReason,
}: {
  busy: boolean
  mediaDrafts: LocalMediaUploadDraft[]
  onAddMedia: () => void
  onConfirm: () => void
  onReasonChange: (value: string) => void
  onReject: () => void
  onSkip: () => void
  onVoiceSaved: (draft: LocalMediaUploadDraft) => void
  rejectOpen: boolean
  rejectReason: string
}) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const recorderState = useAudioRecorderState(audioRecorder, 250)
  const recordingRef = useRef(false)
  const [isRecordingVoice, setIsRecordingVoice] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const visualMediaCount = mediaDrafts.filter((item) => item.type === 'image' || item.type === 'video').length
  const voiceCount = mediaDrafts.filter((item) => item.type === 'audio').length
  const totalFileCount = mediaDrafts.length
  const recordingSeconds = Math.max(0, Math.round((recorderState.durationMillis ?? 0) / 1000))
  const canConfirm = totalFileCount > 0 && !busy

  const handleVoicePress = async () => {
    try {
      if (isRecordingVoice) {
        await audioRecorder.stop()
        recordingRef.current = false
        setIsRecordingVoice(false)
        const uri = audioRecorder.uri
        if (!uri) {
          setVoiceError(language === 'vi' ? 'Chưa lưu' : 'Not saved')
          return
        }
        const extension = Platform.OS === 'web' ? '.webm' : '.m4a'
        onVoiceSaved({
          fileName: `kael-evidence-voice-${Date.now()}${extension}`,
          mimeType: Platform.OS === 'web' ? 'audio/webm' : 'audio/m4a',
          type: 'audio',
          uri,
        })
        setVoiceError(null)
        return
      }
      if (totalFileCount >= 5) {
        setVoiceError(language === 'vi' ? 'Đủ tệp' : 'Full')
        return
      }
      const permission = await AudioModule.requestRecordingPermissionsAsync()
      if (!permission.granted) {
        const message = language === 'vi' ? 'Chưa bật mic' : 'Mic off'
        setVoiceError(message)
        openMicrophoneSettingsPrompt(language, message)
        return
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      })
      await audioRecorder.prepareToRecordAsync()
      audioRecorder.record()
      recordingRef.current = true
      setIsRecordingVoice(true)
      setVoiceError(null)
    } catch {
      recordingRef.current = false
      setIsRecordingVoice(false)
      setVoiceError(language === 'vi' ? 'Lỗi mic' : 'Mic error')
    }
  }

  useEffect(() => {
    return () => {
      if (!recordingRef.current) return
      void audioRecorder.stop().catch(() => undefined)
      recordingRef.current = false
    }
  }, [audioRecorder])

  return (
    <V21Card
      style={[styles.agenticChatCard, styles.agenticEvidenceGateCard, { backgroundColor: tokens.raised, borderColor: 'rgba(116,224,209,0.56)' }]}
      testID="customer-v21-agentic-evidence-gate"
    >
      <SourceCardSkin />
      <CaseWideMintAura scope="ChatEvidenceGate" testID="customer-v21-agentic-evidence-mint-aura" />
      <View style={styles.agenticChatHeader}>
        <AssetTile image={customerV21Assets.evidence} label={language === 'vi' ? 'Bằng chứng' : 'Evidence'} size={42} sourceAura style={styles.agenticChatIcon} />
        <View style={styles.flex}>
          <Text numberOfLines={2} style={[styles.agenticChatTitle, { color: tokens.text }]}>
            {language === 'vi' ? 'Kael cần hiện trạng trước' : 'Kael needs current evidence first'}
          </Text>
          <Text numberOfLines={2} style={[styles.agenticChatBody, { color: tokens.muted }]}>
            {language === 'vi' ? 'Thêm ảnh, video hoặc ghi âm. Kael chỉ phân tích sau khi bạn chốt bước này.' : 'Add photos, video, or voice. Kael analyzes only after you confirm this step.'}
          </Text>
        </View>
      </View>

      <View style={styles.agenticEvidenceMetricRow}>
        <AgenticChatFact centered label={language === 'vi' ? 'Ảnh/video' : 'Media'} value={formatKnownCount(visualMediaCount, language)} />
        <AgenticChatFact centered label={language === 'vi' ? 'Giọng nói' : 'Voice'} value={formatKnownCount(voiceCount, language)} />
        <AgenticChatFact centered label={language === 'vi' ? 'Tệp' : 'Files'} value={formatKnownCount(totalFileCount, language)} />
      </View>

      <View style={styles.agenticEvidenceToolRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy || totalFileCount >= 5 }}
          disabled={busy || totalFileCount >= 5}
          onPress={onAddMedia}
          style={[styles.agenticEvidenceToolButton, { backgroundColor: tokens.service, borderColor: tokens.border }]}
          testID="customer-v21-agentic-evidence-add-media"
        >
          <ChatMediaCameraIcon color={tokens.primary} />
          <Text numberOfLines={1} style={[styles.agenticEvidenceToolText, { color: tokens.primary }]}>
            {language === 'vi' ? 'Thêm ảnh/video' : 'Add media'}
          </Text>
        </Pressable>
        <View style={[styles.agenticEvidenceFileCount, { backgroundColor: tokens.service, borderColor: tokens.border, borderWidth: 1 }]} testID="customer-v21-agentic-evidence-file-count">
          <Text style={[styles.agenticChatFactValue, { color: tokens.text }]}>{formatKnownCount(totalFileCount, language)}</Text>
        </View>
      </View>

      <MediaVoiceNote
        isRecording={isRecordingVoice}
        onPress={() => void handleVoicePress()}
        recordingSeconds={recordingSeconds}
        testID="customer-v21-agentic-evidence-voice-note"
        value={isRecordingVoice ? `${recordingSeconds}s` : formatKnownCount(voiceCount, language)}
      />
      {voiceError ? <Text style={[styles.mediaVoiceError, { color: tokens.primary }]}>{voiceError}</Text> : null}

      {rejectOpen ? (
        <View style={styles.agenticEvidenceReasonBox}>
          <KaelTextField
            inputShellStyle={styles.agenticEvidenceReasonInputShell}
            onChangeText={onReasonChange}
            placeholder={language === 'vi' ? 'Lý do ngắn' : 'Short reason'}
            placeholderTextColor={tokens.subtleText}
            shellStyle={styles.agenticEvidenceReasonInput}
            style={[styles.composerInput, customerV21WebTextInputNoOutline, { color: tokens.text }]}
            testID="customer-v21-agentic-evidence-reason"
            value={rejectReason}
          />
          <KaelButton
            accessibilityState={{ busy, disabled: busy }}
            disabled={busy}
            label={language === 'vi' ? 'Tiếp tục' : 'Continue'}
            onPress={onSkip}
            size="small"
            style={styles.agenticChatActionButton}
            testID="customer-v21-agentic-evidence-skip"
          />
        </View>
      ) : null}

      <View style={styles.agenticChatActions}>
        <KaelButton
          backgroundLayer={<CaseWorkActionButtonAura scope="EvidenceReject" />}
          disabled={busy}
          label={language === 'vi' ? 'Từ chối' : 'Decline'}
          onPress={onReject}
          size="small"
          style={styles.agenticChatActionButton}
          testID="customer-v21-agentic-evidence-reject"
          variant="secondary"
        />
        <KaelButton
          accessibilityState={{ busy, disabled: !canConfirm }}
          disabled={!canConfirm}
          label={busy ? (language === 'vi' ? 'Đang gửi' : 'Sending') : (language === 'vi' ? 'Xác nhận' : 'Confirm')}
          onPress={onConfirm}
          size="small"
          style={styles.agenticChatActionButton}
          testID="customer-v21-agentic-evidence-confirm"
        />
      </View>
    </V21Card>
  )
}

function AgenticChatEstimateCard({
  canConfirm,
  confirmed,
  confirming,
  estimate,
  onConfirm,
  onReject,
  onReasonChange,
  onSubmitRejectReason,
  rejected,
  rejectReason,
  submittingRejectReason,
}: {
  canConfirm: boolean
  confirmed: boolean
  confirming: boolean
  estimate: NonNullable<KaelChatResponse['session']['estimate']>
  onConfirm: () => void
  onReject: () => void
  onReasonChange: (value: string) => void
  onSubmitRejectReason: () => void
  rejected: boolean
  rejectReason: string
  submittingRejectReason: boolean
}) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const serviceLabel = customerV21ServiceCopy[language][estimate.service_type].label
  const problem = agenticEstimateProblemLabel(estimate, language)
  const confidencePercent = Math.round(estimate.confidence * 100)
  const needsMoreInfo = estimate.confidence < 0.7
  const confirmLabel = confirmed
    ? (language === 'vi' ? '\u0110\u00e3 x\u00e1c nh\u1eadn' : 'Confirmed')
    : confirming
      ? (language === 'vi' ? '\u0110ang x\u00e1c nh\u1eadn' : 'Confirming')
      : (language === 'vi' ? 'X\u00e1c nh\u1eadn' : 'Confirm')
  const rejectLabel = rejected
    ? (language === 'vi' ? '\u0110ang trao \u0111\u1ed5i' : 'Discussing')
    : (language === 'vi' ? 'T\u1eeb ch\u1ed1i' : 'Decline')
  const canSubmitRejectReason = rejectReason.trim().length > 0 && !submittingRejectReason && !confirming
  const statusLabel = confirmed
    ? (language === 'vi' ? 'Backend \u0111\u00e3 m\u1edf c\u00f4ng vi\u1ec7c' : 'Backend opened work')
    : needsMoreInfo
      ? (language === 'vi' ? 'Cần thêm dữ liệu' : 'Needs more context')
      : canConfirm
      ? (language === 'vi' ? 'C\u1ea7n b\u1ea1n ch\u1ed1t' : 'Needs your decision')
      : (language === 'vi' ? '\u0110ang ch\u1edd' : 'Waiting')
  const priceExplanation = agenticEstimatePriceExplanation(estimate, language)
  const sourceExplanation = agenticEstimateSourceExplanation(language)

  return (
    <V21Card
      style={[styles.agenticChatCard, { backgroundColor: tokens.raised, borderColor: 'rgba(116,224,209,0.56)' }]}
      testID="customer-v21-agentic-estimate-card"
    >
      <SourceCardSkin />
      <CaseWideMintAura scope="ChatEstimate" testID="customer-v21-agentic-estimate-mint-aura" />
      <View style={styles.agenticChatHeader}>
        <AssetTile image={customerV21Assets.request} label={serviceLabel} size={44} sourceAura style={styles.agenticChatIcon} />
        <View style={styles.flex}>
          <Text numberOfLines={2} style={[styles.agenticChatTitle, { color: tokens.text }]}>
            {language === 'vi' ? 'Kael \u0111\u1ec1 xu\u1ea5t b\u01b0\u1edbc ti\u1ebfp theo' : 'Kael suggests the next step'}
          </Text>
          <Text numberOfLines={2} style={[styles.agenticChatBody, { color: tokens.muted }]}>
            {problem}
          </Text>
        </View>
        <CaseWorkSourceChip label={statusLabel} scope="ChatEstimateStatus" testID="customer-v21-agentic-estimate-status" />
      </View>
      <View style={styles.agenticChatFactGrid}>
        <AgenticChatFact label={language === 'vi' ? 'D\u1ecbch v\u1ee5' : 'Service'} value={serviceLabel} />
        <AgenticChatFact label={language === 'vi' ? '\u01af\u1edbc t\u00ednh' : 'Estimate'} value={formatPriceRange(estimate.price_min, estimate.price_max, language)} />
        <AgenticChatFact label={language === 'vi' ? '\u0110\u1ed9 tin c\u1eady' : 'Confidence'} value={`${confidencePercent}%`} />
      </View>
      <Text numberOfLines={4} style={[styles.agenticChatBody, { color: tokens.text }]} testID="customer-v21-agentic-estimate-price-explanation">
        {priceExplanation}
      </Text>
      <Text numberOfLines={3} style={[styles.agenticChatNote, { color: tokens.muted }]} testID="customer-v21-agentic-estimate-source-explanation">
        {sourceExplanation}
      </Text>
      {needsMoreInfo ? (
        <View style={[styles.agenticMoreInfoCard, { backgroundColor: tokens.service, borderColor: tokens.borderStrong }]} testID="customer-v21-agentic-estimate-more-info">
          <ZipMintAura scope="ChatEstimateMoreInfo" />
          <Text style={[styles.agenticChatBody, { color: tokens.text }]}>
            {language === 'vi'
              ? 'Độ tin cậy dưới 70%. Bạn gửi thêm ảnh/video hoặc mô tả rõ vị trí, mức độ rò rỉ và thời điểm xảy ra, rồi Kael sẽ tính lại.'
              : 'Confidence is below 70%. Add media or describe the location, severity, and timing so Kael can re-check.'}
          </Text>
        </View>
      ) : estimate.advisory ? (
        <Text numberOfLines={3} style={[styles.agenticChatBody, { color: tokens.text }]} testID="customer-v21-agentic-estimate-advisory">
          {estimate.advisory}
        </Text>
      ) : null}
      <Text numberOfLines={2} style={[styles.agenticChatNote, { color: tokens.muted }]} testID="customer-v21-agentic-estimate-disclaimer">
        {estimate.disclaimer}
      </Text>
      {rejected ? (
        <View
          style={[styles.agenticRejectReasonCard, { backgroundColor: tokens.service, borderColor: tokens.borderStrong }]}
          testID="customer-v21-agentic-reject-reason"
        >
          <SourceCardSkin />
          <CaseWideMintAura scope="ChatRejectReason" />
          <Text style={[styles.agenticChatTitle, { color: tokens.text }]}>
            {language === 'vi' ? 'Kael s\u1ebd ch\u1ec9nh l\u1ea1i' : 'Kael will adjust'}
          </Text>
          <Text style={[styles.agenticChatBody, { color: tokens.muted }]}>
            {language === 'vi' ? 'Nh\u1eafn l\u00fd do ho\u1eb7c \u0111i\u1ec1u b\u1ea1n mu\u1ed1n \u0111\u1ed5i.' : 'Send the reason or what you want changed.'}
          </Text>
          <KaelTextField
            inputShellStyle={styles.agenticEvidenceReasonInputShell}
            onChangeText={onReasonChange}
            placeholder={language === 'vi' ? 'L\u00fd do ng\u1eafn' : 'Short reason'}
            placeholderTextColor={tokens.subtleText}
            shellStyle={styles.agenticEvidenceReasonInput}
            style={[styles.composerInput, customerV21WebTextInputNoOutline, { color: tokens.text }]}
            testID="customer-v21-agentic-reject-reason-input"
            value={rejectReason}
          />
          <KaelButton
            accessibilityState={{ busy: submittingRejectReason, disabled: !canSubmitRejectReason }}
            disabled={!canSubmitRejectReason}
            label={submittingRejectReason ? (language === 'vi' ? '\u0110ang g\u1eedi' : 'Sending') : (language === 'vi' ? 'G\u1eedi cho Kael' : 'Send to Kael')}
            onPress={onSubmitRejectReason}
            size="small"
            style={styles.agenticChatActionButton}
            testID="customer-v21-agentic-reject-reason-send"
          />
        </View>
      ) : null}
      <View style={styles.agenticChatActions}>
        <KaelButton
          backgroundLayer={<CaseWorkActionButtonAura scope="ChatReject" />}
          disabled={confirmed || confirming}
          label={rejectLabel}
          onPress={onReject}
          size="small"
          style={styles.agenticChatActionButton}
          testID="customer-v21-agentic-estimate-reject"
          variant="secondary"
        />
        <KaelButton
          accessibilityState={{ busy: confirming, disabled: !canConfirm || confirming || confirmed || submittingRejectReason }}
          disabled={!canConfirm || confirming || confirmed || submittingRejectReason}
          label={confirmLabel}
          onPress={onConfirm}
          size="small"
          style={styles.agenticChatActionButton}
          testID="customer-v21-agentic-estimate-confirm"
        />
      </View>
    </V21Card>
  )
}

function AgenticChatFact({ centered = false, label, value }: { centered?: boolean; label: string; value: string }) {
  const { tokens } = useV21Theme()
  return (
    <View style={[styles.agenticChatFact, centered && styles.agenticChatFactCentered, { backgroundColor: tokens.service, borderColor: tokens.borderStrong }]}>
      <ZipMintAura scope={`ChatFact${profileAuraScope(label)}`} />
      <Text numberOfLines={1} style={[styles.agenticChatFactLabel, centered && styles.centerText, { color: tokens.muted }]}>{label}</Text>
      <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={2} style={[styles.agenticChatFactValue, centered && styles.centerText, { color: tokens.text }]}>{value}</Text>
    </View>
  )
}

function KaelProcessLines({ state }: { state: KaelProcessLineRuntime }) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const activeLine = state.activeIndex === null ? null : state.lines[state.activeIndex] ?? null
  if (state.collapse && state.activeIndex === null) {
    return (
      <View
        accessibilityLabel={state.collapse}
        style={styles.kaelProcessLines}
        testID="customer-v21-kael-process-lines"
      >
        <View style={styles.kaelProcessLine} testID="customer-v21-kael-process-collapse">
          <Text style={[styles.kaelProcessText, styles.kaelProcessTextActive, { color: tokens.primary }]}>{state.collapse}</Text>
        </View>
      </View>
    )
  }
  return (
    <View
      accessibilityLabel={language === 'vi' ? 'Kael đang xử lý' : 'Kael processing'}
      style={styles.kaelProcessLines}
      testID="customer-v21-kael-process-lines"
    >
      {activeLine ? (
        <KaelThinkingLine line={activeLine} testID={`customer-v21-kael-process-line-${state.activeIndex ?? 0}`} />
      ) : null}
    </View>
  )
}

function KaelThinkingLine({ line, testID }: { line: KaelProcessLine; testID: string }) {
  const { reduceMotion, tokens } = useV21Theme()
  const opacity = useSharedValue(reduceMotion ? 1 : 0.42)
  const translateY = useSharedValue(reduceMotion ? 0 : 3)
  const textStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }))

  useEffect(() => {
    cancelAnimation(opacity)
    cancelAnimation(translateY)
    if (reduceMotion) {
      opacity.value = 1
      translateY.value = 0
      return
    }
    opacity.value = 0.42
    translateY.value = 3
    opacity.value = withTiming(1, { duration: motionDuration(260, reduceMotion) })
    translateY.value = withTiming(0, { duration: motionDuration(260, reduceMotion) })
  }, [line.key, opacity, reduceMotion, translateY])

  return (
    <Animated.View
      key={line.key}
      style={[styles.kaelProcessThinkingLine, textStyle]}
      testID={testID}
    >
      <Text
        numberOfLines={1}
        style={[styles.kaelProcessText, { color: tokens.muted }]}
      >
        {line.text}
      </Text>
      <KaelThinkingDots />
    </Animated.View>
  )
}

function KaelThinkingDots() {
  const { reduceMotion, tokens } = useV21Theme()
  const first = useSharedValue(reduceMotion ? 0.65 : 0.25)
  const second = useSharedValue(reduceMotion ? 0.65 : 0.25)
  const third = useSharedValue(reduceMotion ? 0.65 : 0.25)
  const firstStyle = useAnimatedStyle(() => ({ opacity: first.value }))
  const secondStyle = useAnimatedStyle(() => ({ opacity: second.value }))
  const thirdStyle = useAnimatedStyle(() => ({ opacity: third.value }))

  useEffect(() => {
    ;[first, second, third].forEach((dot) => cancelAnimation(dot))
    if (reduceMotion) {
      first.value = 0.65
      second.value = 0.65
      third.value = 0.65
      return
    }
    const dotCycle = (delayMs: number) => withRepeat(
      withSequence(
        withDelay(delayMs, withTiming(1, { duration: 360 })),
        withTiming(0.25, { duration: 520 }),
      ),
      -1,
      false,
    )
    first.value = dotCycle(0)
    second.value = dotCycle(170)
    third.value = dotCycle(340)
  }, [first, reduceMotion, second, third])

  return (
    <View
      accessible={false}
      style={styles.kaelThinkingDots}
      testID="customer-v21-kael-thinking-dots"
    >
      <Animated.View style={[styles.kaelThinkingDot, { backgroundColor: tokens.primary }, firstStyle]} />
      <Animated.View style={[styles.kaelThinkingDot, { backgroundColor: tokens.primary }, secondStyle]} />
      <Animated.View style={[styles.kaelThinkingDot, { backgroundColor: tokens.primary }, thirdStyle]} />
    </View>
  )
}

function buildBookingDraftMessage({
  address,
  description,
  language,
  problems,
  scheduleLabel,
  serviceType,
}: {
  address: string
  description: string
  language: AppLanguage
  problems: string[]
  scheduleLabel: string | null
  serviceType: ServiceType
}) {
  const service = customerV21ServiceCopy[language][serviceType].label
  if (language === 'vi') {
    return [
      `Dịch vụ: ${service}`,
      `Vấn đề: ${problems.length > 0 ? problems.join(', ') : 'Theo mô tả'}`,
      `Khu vực: ${address.trim()}`,
      `Thời gian: ${scheduleLabel ?? 'Chưa chọn'}`,
      `Mô tả: ${description.trim()}`,
    ].join('\n')
  }
  return [
    `Service: ${service}`,
    `Issue: ${problems.length > 0 ? problems.join(', ') : 'From description'}`,
    `Area: ${address.trim()}`,
    `Time: ${scheduleLabel ?? 'Not selected'}`,
    `Description: ${description.trim()}`,
  ].join('\n')
}

function mergeMediaDrafts(current: LocalMediaUploadDraft[], drafts: LocalMediaUploadDraft[], limit = 5) {
  const seenUris = new Set(current.map((item) => item.uri))
  const merged = [...current]
  for (const draft of drafts) {
    if (seenUris.has(draft.uri)) continue
    seenUris.add(draft.uri)
    merged.push(draft)
    if (merged.length >= limit) break
  }
  return merged
}

function mediaDraftTypeFromPickerAsset(asset: ImagePicker.ImagePickerAsset): LocalMediaUploadDraft['type'] {
  if (asset.type === 'video' || asset.mimeType?.startsWith('video/')) return 'video'
  return 'image'
}

type BookingScheduleDateOption = {
  dateLabel: string
  dayLabel: string
  label: string
  value: string
}

function buildBookingScheduleDateOptions(language: AppLanguage, runtimeNow: Date = new Date()): BookingScheduleDateOption[] {
  const now = new Date(runtimeNow)
  now.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }).map((_, index) => {
    const date = new Date(now)
    date.setDate(now.getDate() + index)
    const dayLabel = index === 0
      ? (language === 'vi' ? 'Hôm nay' : 'Today')
      : weekdayLabel(date.getDay(), language)
    const dateLabel = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`
    return {
      dateLabel,
      dayLabel,
      label: `${dayLabel} ${dateLabel}`,
      value: dateValue(date),
    }
  })
}

function bookingScheduleLabel(
  options: BookingScheduleDateOption[],
  selectedDate: string | null,
  selectedTime: string | null,
  language: AppLanguage,
) {
  const dateLabel = selectedDate ? options.find((option) => option.value === selectedDate)?.label ?? selectedDate : null
  if (dateLabel && selectedTime) return `${dateLabel} · ${selectedTime}`
  if (dateLabel) return `${dateLabel} · ${language === 'vi' ? 'Chưa chọn giờ' : 'No time'}`
  if (selectedTime) return `${language === 'vi' ? 'Chưa chọn ngày' : 'No date'} · ${selectedTime}`
  return null
}

function bookingScheduleDateParam(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

function bookingScheduleTimeParam(value: string | undefined) {
  if (!value) return null
  return bookingTimeSlots.includes(value as (typeof bookingTimeSlots)[number]) ? value : null
}

function dateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function weekdayLabel(day: number, language: AppLanguage) {
  const vi = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
  const en = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return language === 'vi' ? vi[day] : en[day]
}

function insightNumber(
  insights: CustomerProfileInsightsResponse | null,
  key: keyof CustomerProfileInsightsResponse,
  fallback: string,
  language: AppLanguage,
  formatter?: (value: number) => string,
) {
  const value = insights?.[key]
  if (typeof value !== 'number') return fallback
  return formatter ? formatter(value) : formatNumber(value, language)
}

function protectedTransactionLabel(
  insights: CustomerProfileInsightsResponse | null,
  language: AppLanguage,
  fallback: string,
) {
  if (typeof insights?.protected_transaction_count !== 'number' || typeof insights?.total_transaction_count !== 'number') {
    return fallback
  }
  return `${formatNumber(insights.protected_transaction_count, language)} / ${formatNumber(insights.total_transaction_count, language)}`
}

function rankLabel(rank: number, language: AppLanguage) {
  if (language !== 'vi') return `L${rank}`
  if (rank === 1) return 'Mới'
  if (rank === 2) return 'Hoạt động'
  if (rank === 3) return 'Tin cậy'
  if (rank === 4) return 'Cao cấp'
  return 'Tối đa'
}

function profileRankStatus(rank: number, language: AppLanguage, fallback: string) {
  if (rank <= 0) return fallback
  if (rank >= 3) return language === 'vi' ? 'Khách hàng Tin cậy' : 'Trusted customer'
  return language === 'vi' ? 'Đang xây hạng' : 'Building level'
}

function fairPriceStatusLabel(
  status: CustomerProfileInsightsResponse['fair_price_status'] | undefined,
  language: AppLanguage,
  fallback: string,
) {
  if (status === 'verified') return language === 'vi' ? 'Đã xác minh' : 'Verified'
  if (status === 'mixed') return language === 'vi' ? 'Đang xét' : 'Reviewing'
  if (status === 'pending') return language === 'vi' ? 'Đang chờ' : 'Pending'
  return fallback
}

function profileStageSubtitle(screenId: CustomerV21ScreenId, language: AppLanguage) {
  if (screenId === '6.2-usage-ranking') {
    return language === 'vi' ? 'Hạng phản ánh cách bạn sử dụng dịch vụ' : 'Level reflects how you use service'
  }
  if (screenId === '6.3-protect-money') {
    return language === 'vi' ? 'Đúng giá, đúng quy trình và minh bạch' : 'Fair price, proper workflow, transparent'
  }
  return language === 'vi' ? 'Tài khoản, bảo vệ và các tiện ích phụ' : 'Account, protection, and utilities'
}

function profileAuraScope(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, '')
}

function paymentProviderLabel(provider: string, language: AppLanguage) {
  if (provider === 'sepay_vietqr') return language === 'vi' ? 'VietQR qua SePay' : 'SePay VietQR'
  if (provider === 'cash') return language === 'vi' ? 'Tiền mặt' : 'Cash'
  if (provider === 'bank_transfer') return language === 'vi' ? 'Chuyển khoản ngân hàng' : 'Bank transfer'
  return language === 'vi' ? 'Phương thức hệ thống' : provider
}

function paymentStatusLabel(status: LocalPaymentStatus, language: AppLanguage) {
  const vi: Record<LocalPaymentStatus, string> = {
    amount_mismatch: 'Sai lệch số tiền',
    code_requested: 'Đã yêu cầu mã thanh toán',
    expired: 'Đã hết hạn',
    failed: 'Thanh toán lỗi',
    not_started: 'Chưa bắt đầu',
    pending: 'Đang chờ xác nhận',
    received: 'Đã nhận tiền',
    reconciled: 'Đã đối soát',
    vietqr_ready: 'VietQR sẵn sàng',
  }
  const en: Record<LocalPaymentStatus, string> = {
    amount_mismatch: 'Amount mismatch',
    code_requested: 'Payment code requested',
    expired: 'Expired',
    failed: 'Failed',
    not_started: 'Not started',
    pending: 'Pending',
    received: 'Received',
    reconciled: 'Reconciled',
    vietqr_ready: 'VietQR ready',
  }
  return language === 'vi' ? vi[status] : en[status]
}

function paymentAmountLabel(payment: LocalDeal['payment'] | null, language: AppLanguage, fallback: string) {
  const amount = payment?.grossAmount ?? payment?.amountReceived
  if (typeof amount === 'number') return formatVnd(amount, language)
  return fallback
}

function isPaymentProtectedStatus(status: LocalPaymentStatus) {
  return status === 'received' || status === 'reconciled'
}

function formatKnownCount(value: number | null | undefined, language: AppLanguage) {
  if (typeof value === 'number') return formatNumber(value, language)
  return '0'
}

function formatEvidenceFileCount(value: number | null | undefined, language: AppLanguage) {
  const realCount = typeof value === 'number' ? value : 0
  const count = formatNumber(realCount, language)
  return language === 'vi' ? `${count} tệp` : `${count} file${realCount === 1 ? '' : 's'}`
}

function formatWorkerJobs(value: number | null | undefined, language: AppLanguage) {
  const count = typeof value === 'number' ? value : 0
  return language === 'vi' ? `${formatNumber(count, language)} đơn` : `${formatNumber(count, language)} jobs`
}

function percentFromConfidenceLabel(value: string) {
  const match = value.match(/(\d+(?:[.,]\d+)?)/)
  if (!match) return 0
  const parsed = Number(match[1].replace(',', '.'))
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(100, parsed))
}

function makeAssistantTurnId(surface: CustomerAssistantLocalTurn['surface'], role: CustomerAssistantLocalTurn['role']) {
  return `${surface}-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeKaelRoutingText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function isLikelyKaelIntakeRequest(message: string) {
  const normalized = normalizeKaelRoutingText(message)
  if (!normalized) return false
  const qnaSignal = /\b(gia|bao nhieu|luat|phap ly|quy dinh|quy trinh|dich vu|tho|bao hanh|huy|thanh toan|co duoc|la gi|huong dan|nen|khac gi|yeu cau gi|tu van)\b/.test(normalized)
  if (qnaSignal) return false
  return /\b(dat lich|goi tho|can sua|can don|kiem tra giup|bi hong|hong|ro|ri|tac|mat dien|chap|hien trang|anh\/video|anh|video|duong ong|ve sinh|don dep|thay|lap|sua giup|o cam|cong tac|voi nuoc|ong nuoc|lavabo|toilet)\b/.test(normalized)
}

function formatAssistantAnswer(result: KaelAssistantResponse, language: AppLanguage) {
  const notes = result.safety_notes.filter((note) => note.trim().length > 0)
  if (notes.length === 0) return result.answer
  const noteLabel = language === 'vi' ? 'Lưu ý' : 'Note'
  return `${result.answer}\n\n${noteLabel}: ${notes.join(' ')}`
}

function totalMediaRefs(turns: KaelChatTurn[]) {
  return turns.reduce((total, turn) => total + (Array.isArray(turn.media_refs) ? turn.media_refs.length : 0), 0)
}

function isScriptedKaelAcknowledgementTurn(turn: KaelChatTurn) {
  if (turn.role === 'customer') return false
  const text = turn.text_content?.trim()
  if (!text) return false
  const normalized = normalizeKaelRoutingText(text)
  return normalized.includes('kael ghi nhan moi lo') &&
    (normalized.includes('admin can thiep') || normalized.includes('moi tuong tac duoc luu'))
}

function agenticEstimateProblemLabel(
  estimate: NonNullable<KaelChatResponse['session']['estimate']>,
  language: AppLanguage,
) {
  const candidates = [
    estimate.problem_summary,
    estimate.problem_category,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  for (const candidate of candidates) {
    const mapped = agenticProblemTaxonomyLabel(candidate, language)
    if (mapped) return mapped
    if (!looksLikeRawProblemTaxonomy(candidate)) return candidate.trim()
  }
  return customerV21CommonCopy[language].dataPending
}

function agenticDealProblemLabel(deal: LocalDeal, language: AppLanguage) {
  const copy = customerV21CommonCopy[language]
  const candidates = [
    deal.estimate?.problemLabel,
    deal.broadcast?.problemSummary,
    ...deal.draft.problemChips,
    deal.draft.inferredProblemLabel,
    deal.draft.description,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  for (const candidate of candidates) {
    const mapped = agenticProblemTaxonomyLabel(candidate, language)
    if (mapped) return mapped
    if (!looksLikeRawProblemTaxonomy(candidate)) return candidate.trim()
  }
  return copy.dataPending
}

function agenticProblemTaxonomyLabel(value: string, language: AppLanguage) {
  const normalized = normalizeKaelRoutingText(value).replace(/[^a-z0-9]+/g, '_')
  const viLabels: Record<string, string> = {
    electrical_outlet_switch: 'Ổ điện',
    outlet_switch: 'Ổ điện',
    pipe_leak: 'Rò nước',
    plumbing_pipe_leak: 'Rò nước',
    weak_pressure: 'Áp yếu',
    plumbing_weak_pressure: 'Áp yếu',
    clogged_drain: 'Tắc cống',
    plumbing_clogged_drain: 'Tắc cống',
    faucet_issue: 'Vòi hỏng',
    plumbing_faucet_issue: 'Vòi hỏng',
  }
  const enLabels: Record<string, string> = {
    electrical_outlet_switch: 'Outlet or switch',
    outlet_switch: 'Outlet or switch',
    pipe_leak: 'Pipe leak',
    plumbing_pipe_leak: 'Pipe leak',
    weak_pressure: 'Weak water pressure',
    plumbing_weak_pressure: 'Weak water pressure',
    clogged_drain: 'Clogged drain',
    plumbing_clogged_drain: 'Clogged drain',
    faucet_issue: 'Faucet issue',
    plumbing_faucet_issue: 'Faucet issue',
  }
  const labels = language === 'vi' ? viLabels : enLabels
  return labels[normalized] ?? null
}

function looksLikeRawProblemTaxonomy(value: string) {
  const trimmed = value.trim()
  return /^[a-z]+:[\s_a-z0-9-]+$/i.test(trimmed) || /^[a-z]+(?:_[a-z0-9]+)+$/i.test(trimmed)
}

function agenticEstimatePriceExplanation(
  estimate: NonNullable<KaelChatResponse['session']['estimate']>,
  language: AppLanguage,
) {
  const range = formatPriceRange(estimate.price_min, estimate.price_max, language)
  if (language === 'vi') {
    return `Cách tính: Kael đối chiếu loại dịch vụ, vấn đề "${agenticEstimateProblemLabel(estimate, language)}", khu vực, bằng chứng hiện trạng và độ phức tạp để ra khoảng ${range}.`
  }
  return `How Kael estimated: service type, "${agenticEstimateProblemLabel(estimate, language)}", area, current evidence, and complexity produce the ${range} range.`
}

function agenticEstimateSourceExplanation(language: AppLanguage) {
  return language === 'vi'
    ? 'Nguồn giá: dữ liệu hệ thống và bằng chứng bạn gửi. Giá cuối vẫn cần công việc thật và phạm vi đã xác nhận.'
    : 'Source: system data and your evidence. Final price still requires a real job and confirmed scope.'
}

function formatNumber(value: number, language: AppLanguage) {
  return new Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US').format(value)
}

function formatVnd(value: number, language: AppLanguage) {
  return `${formatNumber(value, language)}đ`
}

function formatPriceRange(min: number, max: number, language: AppLanguage = 'vi') {
  if (min === max) return formatVnd(min, language)
  return `${formatVnd(min, language)} - ${formatVnd(max, language)}`
}

function formatDurationShort(seconds: number, language: AppLanguage) {
  const minutes = Math.max(1, Math.round(seconds / 60))
  return language === 'vi' ? `${minutes} phút` : `${minutes} min`
}

function formatShortClockTime(value: string | null | undefined, language: AppLanguage) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
  }).format(date)
}

function timeChoiceLabel(value: LocalDeal['draft']['timeChoice'], language: AppLanguage) {
  if (value === 'now') return language === 'vi' ? 'Sớm nhất có thể' : 'As soon as possible'
  return customerV21CommonCopy[language].dataPending
}

function complexitySafetyLabel(value: LocalDealEstimate['complexity'], language: AppLanguage) {
  const vi: Record<LocalDealEstimate['complexity'], string> = {
    large: 'Cần kiểm tra kỹ',
    medium: 'Cần xác nhận phạm vi',
    small: 'Rủi ro thấp',
    unknown: 'Chưa rõ rủi ro',
  }
  const en: Record<LocalDealEstimate['complexity'], string> = {
    large: 'Needs careful check',
    medium: 'Scope needs confirmation',
    small: 'Low risk',
    unknown: 'Risk pending',
  }
  return language === 'vi' ? vi[value] : en[value]
}

function metadataString(metadata: Record<string, unknown> | undefined, key: string) {
  return stringFromUnknown(metadata?.[key])
}

function memorySummaryFromUnknown(memory: unknown) {
  if (!memory || typeof memory !== 'object') return null
  const record = memory as Record<string, unknown>
  return stringFromUnknown(record.preference_summary)
}

function totalDealEvidenceCount(deal: LocalDeal | null) {
  if (!deal) return 0
  return Math.max(0, deal.draft.mediaCount ?? 0)
    + (deal.scopeChange?.evidencePhotoUrls?.length ?? 0)
    + (deal.completionPhotoUrls?.length ?? 0)
    + (deal.completionNotes ? 1 : 0)
}

function agenticCommandStep(status: LocalDealStatus) {
  if (status === 'draft' || status === 'analyzing') return 1
  if (status === 'awaiting_customer_confirm' || status === 'scope_change_pending') return 2
  if (status === 'confirmed_by_customer') return 3
  if (status === 'broadcasting' || status === 'worker_matched' || status === 'worker_on_way') return 4
  return 5
}

function scopeChangeAmountLabel(scopeChange: NonNullable<LocalDeal['scopeChange']>, language: AppLanguage) {
  const min = typeof scopeChange.priceMin === 'number' ? scopeChange.priceMin : null
  const max = typeof scopeChange.priceMax === 'number' ? scopeChange.priceMax : null
  if (min !== null && max !== null && min !== max) return `${formatVnd(min, language)} - ${formatVnd(max, language)}`
  const amount = max ?? min
  if (amount === null) return '0'
  return `+${formatVnd(amount, language)}`
}

function scopeChangeApproveLabel(scopeChange: NonNullable<LocalDeal['scopeChange']>, language: AppLanguage) {
  const amount = typeof scopeChange.priceMax === 'number'
    ? scopeChange.priceMax
    : typeof scopeChange.priceMin === 'number'
      ? scopeChange.priceMin
      : null
  if (amount === null) return language === 'vi' ? 'Duyệt' : 'Approve'
  return language === 'vi' ? `Duyệt +${formatVnd(amount, language)}` : `Approve +${formatVnd(amount, language)}`
}

function approvalConfidenceLabel(scopeChange: NonNullable<LocalDeal['scopeChange']>, deal: LocalDeal | null, language: AppLanguage) {
  const kaelReview = scopeChange.kaelReview && typeof scopeChange.kaelReview === 'object'
    ? scopeChange.kaelReview as Record<string, unknown>
    : null
  const verdict = stringFromUnknown(kaelReview?.verdict) ?? stringFromUnknown(kaelReview?.label)
  const confidence = stringFromUnknown(kaelReview?.confidence_label)
    ?? (typeof kaelReview?.confidence === 'number' ? `${Math.round(kaelReview.confidence * 100)}%` : null)
    ?? deal?.estimate?.confidenceLabel
  if (verdict && confidence) return `${verdict} · ${confidence}`
  if (confidence) return language === 'vi' ? `Hợp lý · ${confidence}` : `Reasonable · ${confidence}`
  return language === 'vi' ? 'Chưa có' : 'Pending'
}

function agenticProcessedApprovalRows(deal: LocalDeal | null, language: AppLanguage): AgenticProcessedApprovalRowModel[] {
  const copy = customerV21CommonCopy[language]
  const step = deal ? agenticCommandStep(deal.status) : 0
  const quoteReady = Boolean(deal?.estimate || deal?.payment || step >= 3)
  const scheduleReady = Boolean(deal && step >= 3)
  const quoteValue = deal?.payment
    ? paymentAmountLabel(deal.payment, language, '0')
    : deal?.estimate?.priceRangeLabel ?? copy.dataPending
  const scheduleValue = scheduleReady
    ? (language === 'vi' ? 'Theo yêu cầu hiện tại' : 'Current request')
    : copy.dataPending
  const approvedLabel = language === 'vi' ? 'Đã có' : 'Ready'

  return [
    {
      available: quoteReady,
      body: quoteValue,
      image: customerV21Assets.request,
      status: quoteReady ? approvedLabel : copy.dataPending,
      title: language === 'vi' ? 'Báo giá dịch vụ' : 'Service quote',
    },
    {
      available: scheduleReady,
      body: scheduleValue,
      image: customerV21Assets.booking,
      status: scheduleReady ? approvedLabel : copy.dataPending,
      title: language === 'vi' ? 'Khung giờ làm việc' : 'Work window',
    },
  ]
}

function agenticMemoryRowsFromUnknown(memory: unknown, language: AppLanguage): AgenticMemoryRowModel[] {
  const copy = customerV21CommonCopy[language]
  const record = memory && typeof memory === 'object' ? memory as Record<string, unknown> : null
  const servicePrefs = record?.service_preferences && typeof record.service_preferences === 'object'
    ? record.service_preferences as Record<string, unknown>
    : null
  const permissionPrefs = servicePrefs?.memory_permissions && typeof servicePrefs.memory_permissions === 'object'
    ? servicePrefs.memory_permissions as Record<string, unknown>
    : null
  const address = firstMemoryString(record, servicePrefs, ['preferred_address', 'address_label', 'default_address', 'home_address'])
  const timeWindow = firstMemoryString(record, servicePrefs, ['preferred_time_window', 'schedule_window', 'time_window', 'preferred_schedule'])
  const budget = firstMemoryBudget(record, servicePrefs, ['budget_limit_vnd', 'max_budget_vnd', 'budget_limit', 'max_budget'], language)

  return [
    {
      enabled: memoryPermissionEnabled(permissionPrefs, 'preferred_address', Boolean(address)),
      image: customerV21Assets.map,
      label: language === 'vi' ? 'Địa chỉ ưu tiên' : 'Preferred address',
      preferenceKey: 'preferred_address',
      value: address ?? copy.dataPending,
    },
    {
      enabled: memoryPermissionEnabled(permissionPrefs, 'preferred_time_window', Boolean(timeWindow)),
      image: customerV21Assets.booking,
      label: language === 'vi' ? 'Khung giờ phù hợp' : 'Preferred time',
      preferenceKey: 'preferred_time_window',
      value: timeWindow ?? copy.dataPending,
    },
    {
      enabled: memoryPermissionEnabled(permissionPrefs, 'budget_limit_vnd', Boolean(budget)),
      image: customerV21Assets.wallet,
      label: language === 'vi' ? 'Giới hạn ngân sách' : 'Budget limit',
      preferenceKey: 'budget_limit_vnd',
      value: budget ?? copy.dataPending,
    },
  ]
}

function agenticMemoryItemCount(rows: AgenticMemoryRowModel[]) {
  return rows.filter((row) => row.enabled).length
}

function memoryPermissionEnabled(
  permissions: Record<string, unknown> | null,
  key: CustomerKaelMemoryPreferenceKey,
  fallback: boolean,
) {
  return typeof permissions?.[key] === 'boolean' ? permissions[key] === true : fallback
}

function firstMemoryString(
  primary: Record<string, unknown> | null,
  secondary: Record<string, unknown> | null,
  keys: string[],
) {
  for (const key of keys) {
    const value = stringFromUnknown(primary?.[key]) ?? stringFromUnknown(secondary?.[key])
    if (value) return value
  }
  return null
}

function firstMemoryBudget(
  primary: Record<string, unknown> | null,
  secondary: Record<string, unknown> | null,
  keys: string[],
  language: AppLanguage,
) {
  for (const key of keys) {
    const rawValue = primary?.[key] ?? secondary?.[key]
    if (typeof rawValue === 'number') return formatVnd(rawValue, language)
    const stringValue = stringFromUnknown(rawValue)
    if (stringValue) return stringValue
  }
  return null
}

type MemoryPreferenceActionResult = boolean | CustomerKaelMemoryPreferenceUpdateResult

function memoryPreferenceActionSucceeded(result: MemoryPreferenceActionResult) {
  if (typeof result === 'boolean') return result
  return result.success
}

function memoryPreferenceSyncFailureLabel(
  result: MemoryPreferenceActionResult,
  language: AppLanguage,
  sessionState: { accessToken: string | null; hasSession: boolean },
) {
  if (!sessionState.hasSession) return language === 'vi' ? 'Chưa đăng nhập' : 'Sign in'
  if (sessionState.accessToken === 'local-visual-audit') return language === 'vi' ? 'Bản xem trước' : 'Preview'
  if (typeof result !== 'boolean') {
    if (result.code === 'NOT_FOUND' || result.status === 404) return language === 'vi' ? 'Cần cập nhật' : 'Update needed'
    if (result.code === 'CONFIG_MISSING' || result.code === 'CONFIG_INVALID') return language === 'vi' ? 'Chưa cấu hình' : 'Not configured'
    if (result.status === 401 || result.status === 403) return language === 'vi' ? 'Chưa đăng nhập' : 'Sign in'
    if (result.status === 0) return language === 'vi' ? 'Mất kết nối' : 'Offline'
  }
  return language === 'vi' ? 'Chưa đồng bộ' : 'Not synced'
}

function agenticBooleanFromMemory(memory: unknown, key: string) {
  if (!memory || typeof memory !== 'object') return false
  const record = memory as Record<string, unknown>
  const servicePrefs = record.service_preferences && typeof record.service_preferences === 'object'
    ? record.service_preferences as Record<string, unknown>
    : null
  const permissionPrefs = servicePrefs?.memory_permissions && typeof servicePrefs.memory_permissions === 'object'
    ? servicePrefs.memory_permissions as Record<string, unknown>
    : null
  const boundaries = record.data_boundaries && typeof record.data_boundaries === 'object'
    ? record.data_boundaries as Record<string, unknown>
    : null
  return record[key] === true || boundaries?.[key] === true || permissionPrefs?.[key] === true
}

function profileName(metadata: Record<string, unknown> | undefined, language: AppLanguage) {
  return metadataString(metadata, 'nickname')
    ?? metadataString(metadata, 'full_name')
    ?? metadataString(metadata, 'name')
    ?? (language === 'vi' ? 'Khách NestScout' : 'NestScout customer')
}

function caseDisplayCode(deal: LocalDeal, language: AppLanguage) {
  if (deal.displayCode) return deal.displayCode
  if (!deal.id.startsWith('local-')) {
    return buildLocalJobDisplayCode({
      jobId: deal.id,
      createdAt: deal.createdAt,
    })
  }
  return language === 'vi' ? 'Nháp dịch vụ' : 'Service draft'
}

function initialsForName(name: string) {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length === 0) return 'NS'
  const first = parts[0]?.[0] ?? 'N'
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : parts[0]?.[1]
  return `${first}${last ?? ''}`.toLocaleUpperCase('vi-VN')
}

function homeGreeting(name: string, language: AppLanguage) {
  const hour = new Date().getHours()
  if (language === 'vi') {
    const moment = hour < 12 ? 'Chào buổi sáng' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối'
    return `${moment}, ${name}`
  }
  const moment = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  return `${moment}, ${name}`
}

function memberSinceLabel(value: string | null | undefined, language: AppLanguage, fallback: string) {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = String(date.getFullYear())
  return language === 'vi' ? `Thành viên ${month}/${year}` : `Member ${month}/${year}`
}

function stepForStatus(status: LocalDealStatus) {
  if (status === 'draft' || status === 'analyzing' || status === 'awaiting_customer_confirm') return 1
  if (status === 'broadcasting' || status === 'worker_matched' || status === 'worker_on_way') return 2
  if (status === 'arrived' || status === 'inspecting' || status === 'repairing' || status === 'scope_change_pending') return 3
  return 4
}

function stringFromUnknown(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function stringArrayFromUnknown(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => stringFromUnknown(item)).filter((item): item is string => Boolean(item))
    : []
}

function paymentBankKeyFromUnknown(value: unknown): CustomerV21BankKey | null {
  const key = stringFromUnknown(value)
  return key && paymentBankOptions.some((bank) => bank.key === key) ? key as CustomerV21BankKey : null
}

function normalizeBankAccountNumber(value: string) {
  return value.replace(/\s+/g, '').trim()
}

function maskBankAccountNumber(value: string | null) {
  const normalized = normalizeBankAccountNumber(value ?? '')
  return normalized.length >= 4 ? `**** ${normalized.slice(-4)}` : ''
}

function servicePreferenceLabel(value: unknown, language: AppLanguage) {
  const service = serviceParam(stringFromUnknown(value) ?? undefined)
  return service ? customerV21ServiceCopy[language][service].label : null
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function servicesScreenParam(value: string | undefined): CustomerV21ScreenId | null {
  return value === '2.2-search' ? value : null
}

function chatScreenModeParam(value: string | undefined): CustomerKaelMode | null {
  if (value === '2.4-chat-normal') return 'normal'
  if (value === '2.5-chat-case') return 'case'
  return null
}

function activityScreenParam(value: string | undefined): CustomerV21ScreenId | null {
  return caseScreenIds.includes(value as CustomerV21ScreenId) ? value as CustomerV21ScreenId : null
}

function isPendingCustomerScopeChange(scopeChange: LocalScopeChange) {
  return ['requested_by_worker', 'reviewing_by_kael', 'waiting_customer_decision'].includes(scopeChange.status)
}

function profilePanelParam(value: string | undefined): 'overview' | 'ranking' | 'money' | 'memory' | null {
  return value === 'overview' || value === 'ranking' || value === 'money' || value === 'memory' ? value : null
}

function profileUtilityParam(value: string | undefined): CustomerProfileUtility | null {
  if (value === 'notifications' || value === 'support') return 'settings'
  return value === 'address' || value === 'payment' || value === 'settings' ? value : null
}

function profileUtilityFromLabel(label: string): CustomerProfileUtility | null {
  const normalized = normalizeKaelRoutingText(label)
  if (normalized.includes('dia chi') || normalized.includes('address')) return 'address'
  if (normalized.includes('thanh toan') || normalized.includes('payment')) return 'payment'
  if (normalized.includes('cai dat') || normalized.includes('setting')) return 'settings'
  return null
}

function profileUtilityTitle(kind: CustomerProfileUtility, language: AppLanguage) {
  if (kind === 'payment') return language === 'vi' ? 'Thanh toán' : 'Payment'
  if (kind === 'settings') return language === 'vi' ? 'Cài đặt' : 'Settings'
  return language === 'vi' ? 'Địa chỉ' : 'Addresses'
}

function profileUtilitySubtitle(kind: CustomerProfileUtility, language: AppLanguage) {
  if (kind === 'payment') {
    return language === 'vi' ? 'Ngân hàng mặc định và nơi nhận tiền' : 'Default bank and payout destination'
  }
  if (kind === 'settings') {
    return language === 'vi' ? 'Bảo mật, ngôn ngữ và dữ liệu tài khoản' : 'Security, language, and account data'
  }
  return language === 'vi' ? 'Địa chỉ dùng cho đặt dịch vụ' : 'Addresses used for booking'
}

function profileScreenParam(value: string | undefined): CustomerV21ScreenId | null {
  return profileScreenIds.includes(value as CustomerV21ScreenId) ? value as CustomerV21ScreenId : null
}

function agenticScreenParam(screenId: CustomerV21ScreenId | null, utility: string | undefined): CustomerV21ScreenId | null {
  if (screenId && agenticScreenIds.includes(screenId)) return screenId
  return utility === 'agentic' ? '5.1-agentic-home' : null
}

function profilePanelForScreen(screenId: CustomerV21ScreenId | null): CustomerProfilePanel | null {
  if (screenId === '5.4-memory') return 'memory'
  if (screenId === '6.2-usage-ranking') return 'ranking'
  if (screenId === '6.3-protect-money') return 'money'
  if (screenId === '6.1-profile-overview') return 'overview'
  return null
}

function serviceParam(value: string | undefined): ServiceType | null {
  return value === 'electrical' || value === 'plumbing' || value === 'cleaning' ? value : null
}

function normalizeBookingSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim()
}

function bookingSearchMatches(query: string, values: readonly string[]) {
  if (!query) return true
  return values.some((value) => {
    const normalizedValue = normalizeBookingSearchText(value)
    return normalizedValue.includes(query) || query.includes(normalizedValue)
  })
}

function bookingServiceMatchesQuery(serviceType: ServiceType, query: string, language: AppLanguage) {
  const serviceCopy = customerV21ServiceCopy[language][serviceType]
  return bookingSearchMatches(query, [
    serviceCopy.label,
    serviceCopy.note,
    ...bookingServiceSearchKeywords[serviceType],
  ])
}

function bookingProblemMatchesQuery(serviceType: ServiceType, problem: string, query: string, language: AppLanguage) {
  return bookingSearchMatches(query, [
    problem,
    customerV21ServiceCopy[language][serviceType].label,
    ...(bookingProblemSearchKeywords[serviceType][problem] ?? []),
  ])
}

function buildBookingSearchSuggestions({
  language,
  problemOptions,
  query,
  selectedProblems,
  selectedService,
}: {
  language: AppLanguage
  problemOptions: string[]
  query: string
  selectedProblems: string[]
  selectedService: ServiceType | null
}): BookingSearchSuggestion[] {
  if (selectedService) {
    const serviceMatches = bookingServiceMatchesQuery(selectedService, query, language)
    const matchedProblems = problemOptions.filter((problem) =>
      serviceMatches || bookingProblemMatchesQuery(selectedService, problem, query, language),
    )
    const visibleProblems = (matchedProblems.length > 0 ? matchedProblems : problemOptions).slice(0, bookingSearchProblemLimit)
    return visibleProblems.map((problem) => ({
      key: `problem-${selectedService}-${problem}`,
      label: problem,
      problem,
      selected: selectedProblems.includes(problem),
      serviceType: selectedService,
    }))
  }

  const matchingServices = SERVICE_TYPES.filter((serviceType) => {
    if (!query) return true
    return bookingServiceMatchesQuery(serviceType, query, language) ||
      PROBLEM_CHIPS[serviceType].some((problem) => bookingProblemMatchesQuery(serviceType, problem, query, language))
  })
  const services = (matchingServices.length > 0 ? matchingServices : SERVICE_TYPES).map((serviceType) => ({
    key: `service-${serviceType}`,
    label: customerV21ServiceCopy[language][serviceType].label,
    selected: false,
    serviceType,
  }))
  if (!query) return services

  const problems = matchingServices.flatMap((serviceType) => {
    const serviceMatches = bookingServiceMatchesQuery(serviceType, query, language)
    return PROBLEM_CHIPS[serviceType]
      .filter((problem) => serviceMatches || bookingProblemMatchesQuery(serviceType, problem, query, language))
      .slice(0, bookingSearchProblemLimit)
      .map((problem) => ({
        key: `problem-${serviceType}-${problem}`,
        label: problem,
        problem,
        selected: false,
        serviceType,
      }))
  })

  return [...services, ...problems].slice(0, 1 + bookingSearchProblemLimit)
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  activityActiveDot: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  activityScreenBody: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    marginTop: 3,
  },
  activityScreenCard: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 74,
    overflow: 'hidden',
    padding: 10,
    position: 'relative',
  },
  activityScreenGrid: {
    gap: 9,
    marginTop: 12,
  },
  activityScreenIcon: {
    minHeight: 52,
    minWidth: 52,
  },
  activityScreenPaymentAuraCard: {
    backgroundColor: 'rgba(255,255,255,0.93)',
    borderColor: 'rgba(116,224,209,0.64)',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 30,
  },
  activityStatusHero: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    marginTop: 12,
  },
  activityStatusRows: {
    gap: 4,
    marginTop: 12,
  },
  activityStatusValue: {
    fontSize: 23,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 29,
    marginTop: 2,
  },
  arrivalCodeBox: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 10,
    position: 'relative',
    zIndex: 1,
  },
  arrivalCodeDigit: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    shadowColor: '#085F57',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    width: 42,
  },
  arrivalCodeDigitText: {
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 24,
  },
  arrivalCodeDigitPending: {
    opacity: 0.72,
  },
  arrivalCodePending: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 10,
    minHeight: 48,
    minWidth: 132,
    paddingHorizontal: 18,
    position: 'relative',
    zIndex: 1,
  },
  arrivalCodePendingText: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
  arrivalCodePendingWrap: {
    alignItems: 'center',
    gap: 8,
    position: 'relative',
    zIndex: 1,
  },
  addressCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  agenticHero: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
  },
  agenticApprovalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  agenticApprovalCard: {
    borderColor: 'rgba(116,224,209,0.55)',
    gap: 12,
    overflow: 'hidden',
    padding: 16,
    position: 'relative',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 16, width: 0 },
    shadowOpacity: 0.10,
    shadowRadius: 32,
  },
  agenticApprovalFactLabel: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 18,
  },
  agenticApprovalFactValue: {
    fontSize: 19,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 24,
    marginTop: 4,
  },
  agenticApprovalFacts: {
    flexDirection: 'row',
    gap: 14,
  },
  agenticApprovalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    position: 'relative',
    zIndex: 1,
  },
  agenticApprovalIcon: {
    minHeight: 76,
    minWidth: 76,
  },
  agenticApprovalMeta: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 20,
  },
  agenticApprovalReason: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 23,
    marginTop: 4,
    position: 'relative',
    zIndex: 1,
  },
  agenticApprovalStatusChip: {
    alignSelf: 'center',
    justifyContent: 'center',
    minWidth: 74,
  },
  agenticApprovalTitle: {
    fontSize: 21,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 27,
  },
  agenticArtifactGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  agenticArtifactTile: {
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    minHeight: 72,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 12,
    position: 'relative',
  },
  agenticArtifactValue: {
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 25,
    marginTop: 3,
  },
  agenticAuthorityNote: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
    marginTop: 10,
    paddingHorizontal: 22,
    textAlign: 'center',
  },
  agenticEmptyPriorityButton: {
    minWidth: 138,
  },
  agenticEmptyPriorityCard: {
    borderColor: 'rgba(116,224,209,0.58)',
    overflow: 'hidden',
    padding: 18,
    position: 'relative',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: 0.13,
    shadowRadius: 36,
  },
  agenticEmptyPriorityFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    position: 'relative',
    zIndex: 1,
  },
  agenticCaseActionTitle: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 21,
    marginTop: 14,
    position: 'relative',
    zIndex: 1,
  },
  agenticCaseFooterRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    position: 'relative',
    zIndex: 1,
  },
  agenticCaseHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
    position: 'relative',
    zIndex: 1,
  },
  agenticCaseIcon: {
    minHeight: 68,
    minWidth: 68,
  },
  agenticCasePriorityCard: {
    borderColor: 'rgba(116,224,209,0.55)',
    overflow: 'hidden',
    padding: 18,
    position: 'relative',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 34,
  },
  agenticCaseTitle: {
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 30,
  },
  agenticCommandActionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  agenticCommandAmount: {
    fontSize: 28,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 34,
    textAlign: 'right',
  },
  agenticCommandButton: {
    flex: 1,
  },
  agenticCommandHeroCard: {
    borderColor: 'rgba(255,255,255,0.92)',
    gap: 8,
    minHeight: 172,
    overflow: 'hidden',
    padding: 18,
    position: 'relative',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 34,
  },
  agenticCommandLabelRail: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'space-between',
    marginTop: 4,
    position: 'relative',
    zIndex: 1,
  },
  agenticCommandMoney: {
    alignItems: 'flex-end',
    flex: 1,
  },
  agenticCommandStepLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
    textAlign: 'center',
  },
  agenticCommandStepLabelActive: {
    fontWeight: '600',
  },
  agenticCommandTitle: {
    fontSize: 30,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 36,
    position: 'relative',
    zIndex: 1,
  },
  agenticCommandTopRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    position: 'relative',
    zIndex: 1,
  },
  agenticKael: {
    height: 108,
    width: 86,
  },
  agenticHeroIcon: {
    minHeight: 92,
    minWidth: 92,
  },
  agenticHeroIconCompact: {
    minHeight: 82,
    minWidth: 82,
  },
  agenticHeroMascot: {
    height: 132,
    width: 108,
  },
  agenticHeroMascotCompact: {
    height: 116,
    width: 94,
  },
  agenticHeroMascotWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 142,
    minWidth: 120,
    position: 'relative',
    zIndex: 1,
  },
  agenticHeroMascotWrapCompact: {
    minHeight: 124,
    minWidth: 104,
  },
  agenticHeroPill: {
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  agenticMemoryListCard: {
    borderColor: 'rgba(116,224,209,0.46)',
    gap: 0,
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingVertical: 18,
    position: 'relative',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.09,
    shadowRadius: 28,
  },
  agenticMemoryNote: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 10,
    paddingHorizontal: 18,
    textAlign: 'center',
  },
  agenticMemorySaveButton: {
    marginTop: 14,
    shadowColor: '#24B3A1',
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
  },
  agenticHomeBackdropAura: {
    bottom: -96,
    left: -22,
    opacity: 0.82,
    position: 'absolute',
    right: -22,
    top: 28,
    zIndex: 0,
  },
  agenticHomeStack: {
    position: 'relative',
  },
  agenticStageBackdropAura: {
    bottom: -92,
    left: -24,
    opacity: 0.86,
    position: 'absolute',
    right: -24,
    top: -112,
  },
  agenticStageStack: {
    position: 'relative',
  },
  agenticMetricLabel: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 7,
    textAlign: 'center',
  },
  agenticMetricRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    position: 'relative',
    zIndex: 1,
  },
  agenticMetricTile: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 88,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 12,
    position: 'relative',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
  },
  agenticMetricValue: {
    fontSize: 28,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 34,
    textAlign: 'center',
  },
  agenticProcessedCard: {
    borderColor: 'rgba(116,224,209,0.42)',
    gap: 0,
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingVertical: 16,
    position: 'relative',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.09,
    shadowRadius: 28,
  },
  agenticProcessedRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    minHeight: 74,
    position: 'relative',
    zIndex: 1,
  },
  agenticProcessedStatusChip: {
    alignSelf: 'center',
    backgroundColor: 'rgba(224,252,245,0.92)',
    borderColor: 'rgba(85,214,195,0.42)',
    justifyContent: 'center',
    marginLeft: 'auto',
    minWidth: 76,
    shadowColor: '#24B3A1',
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  agenticStageHeroBody: {
    fontSize: 19,
    fontWeight: '600',
    lineHeight: 28,
    position: 'relative',
    zIndex: 1,
  },
  agenticStageHeroBodyCompact: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  agenticStageHeroCard: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.92)',
    flexDirection: 'row',
    gap: 20,
    minHeight: 224,
    overflow: 'hidden',
    paddingHorizontal: 22,
    paddingVertical: 24,
    position: 'relative',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 20, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 38,
  },
  agenticStageHeroCardCompact: {
    gap: 16,
    minHeight: 182,
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  agenticStageHeroCardNarrow: {
    alignSelf: 'center',
    gap: 16,
    minHeight: 198,
    paddingHorizontal: 18,
    paddingVertical: 20,
    width: '92%',
  },
  agenticStageHeroCopyCompact: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  agenticStageHeroTitle: {
    fontSize: 35,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 42,
    position: 'relative',
    zIndex: 1,
  },
  agenticStageHeroTitleCompact: {
    fontSize: 26,
    lineHeight: 32,
    textAlign: 'center',
  },
  agenticStageHeroTitleNarrow: {
    fontSize: 26,
    lineHeight: 32,
  },
  agenticStageHeroBodyNarrow: {
    fontSize: 14,
    lineHeight: 20,
  },
  agenticTimelineCard: {
    borderColor: 'rgba(116,224,209,0.46)',
    gap: 0,
    overflow: 'hidden',
    paddingVertical: 18,
    position: 'relative',
  },
  agenticTimelineDot: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 3,
    height: 20,
    width: 20,
  },
  agenticTimelineDotActive: {
    backgroundColor: '#DFFBF4',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
  },
  agenticTimelineLine: {
    flex: 1,
    marginVertical: 2,
    width: 2,
  },
  agenticTimelineRail: {
    alignItems: 'center',
    alignSelf: 'stretch',
    width: 28,
  },
  agenticTimelineRow: {
    flexDirection: 'row',
    gap: 12,
    minHeight: 74,
    paddingHorizontal: 18,
    position: 'relative',
    zIndex: 1,
  },
  agenticUtilityCard: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 76,
    overflow: 'hidden',
    padding: 12,
    position: 'relative',
  },
  agenticUtilityGrid: {
    gap: 9,
    marginTop: 12,
    position: 'relative',
    zIndex: 1,
  },
  agenticUtilityIcon: {
    minHeight: 56,
    minWidth: 56,
  },
  agenticWorkLogCard: {
    borderColor: 'rgba(116,224,209,0.46)',
    gap: 0,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 28,
  },
  agenticWorkLogRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 78,
    position: 'relative',
    zIndex: 1,
  },
  agenticWorkLogStatusChip: {
    alignSelf: 'center',
    backgroundColor: 'rgba(224,252,245,0.92)',
    borderColor: 'rgba(85,214,195,0.42)',
    justifyContent: 'center',
    marginLeft: 'auto',
    minWidth: 58,
    shadowColor: '#24B3A1',
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  assetTile: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 64,
    minWidth: 64,
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 20,
  },
  bookingDescriptionInput: {
    borderRadius: 18,
    minHeight: 84,
    paddingHorizontal: 14,
    paddingVertical: 11,
    shadowColor: '#085F57',
    shadowOffset: { height: 6, width: 0 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
  },
  bookingDateDay: {
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 13,
    textAlign: 'center',
  },
  bookingDateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 9,
  },
  bookingDateOption: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flexBasis: '23%',
    flexGrow: 1,
    minHeight: 50,
    minWidth: 68,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  bookingDateValue: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    marginTop: 2,
    textAlign: 'center',
  },
  bookingDraftButtonAura: {
    ...StyleSheet.absoluteFillObject,
  },
  bookingDraftSubmitButton: {
    borderColor: 'rgba(185,235,226,0.74)',
    marginTop: 14,
    shadowColor: '#24B3A1',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  bookingField: {
    gap: 6,
    marginBottom: 9,
    position: 'relative',
    zIndex: 1,
  },
  bookingFieldLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    lineHeight: 14,
    marginLeft: 2,
  },
  bookingInfoCard: {
    borderColor: 'rgba(255,255,255,0.91)',
    borderRadius: 24,
    gap: 0,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 13,
    position: 'relative',
    shadowColor: '#088779',
    shadowOpacity: 0.10,
    shadowRadius: 26,
  },
  bookingInlineIcon: {
    height: 28,
    width: 28,
  },
  bookingInlineInput: {
    alignSelf: 'stretch',
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    includeFontPadding: false,
    lineHeight: 17,
    minHeight: 28,
    overflow: 'hidden',
    paddingHorizontal: 0,
    paddingVertical: 0,
    textAlignVertical: 'center',
    width: '100%',
  },
  bookingInlineInputMultiline: {
    lineHeight: 18,
    minHeight: 54,
    paddingBottom: 8,
    paddingTop: 8,
  },
  bookingInlineTextFieldStack: {
    alignSelf: 'stretch',
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
  },
  bookingInlineTextFieldShell: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderWidth: 0,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
    minWidth: 0,
    overflow: 'hidden',
    paddingHorizontal: 0,
    paddingVertical: 0,
    width: '100%',
  },
  bookingAddressLookupText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 17,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bookingAddressSuggestionButton: {
    borderBottomWidth: 1,
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bookingAddressSuggestions: {
    borderCurve: 'continuous',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 6,
    overflow: 'hidden',
    shadowColor: '#085F57',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 18,
  },
  bookingAddressSuggestionSubtitle: {
    fontSize: 11.5,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 15,
  },
  bookingAddressSuggestionTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 17,
  },
  bookingInputRow: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingRight: 14,
    position: 'relative',
    shadowColor: '#085F57',
    shadowOffset: { height: 6, width: 0 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
  },
  bookingInputRowMultiline: {
    minHeight: 72,
    paddingVertical: 8,
  },
  bookingDescriptionInputShell: {
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 84,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  bookingProblemChipAura: {
    bottom: -32,
    left: -26,
    position: 'absolute',
    right: -26,
    top: -20,
    zIndex: 0,
  },
  bookingProblemField: {
    overflow: 'hidden',
    paddingBottom: 2,
    paddingTop: 2,
  },
  bookingReadonlyText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  bookingSearchImageIcon: {
    height: 30,
    width: 30,
  },
  bookingScheduleHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  bookingSchedulePanel: {
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#085F57',
    shadowOffset: { height: 6, width: 0 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
  },
  bookingSelectedServiceCard: {
    borderColor: 'rgba(255,255,255,0.91)',
    borderRadius: 24,
    minHeight: 102,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 13,
    position: 'relative',
    shadowColor: '#088779',
    shadowOpacity: 0.10,
    shadowRadius: 26,
  },
  bookingServiceGrid: {
    marginTop: 6,
  },
  bookingSearchMintBorder: {
    ...StyleSheet.absoluteFillObject,
    borderColor: 'rgba(70,224,204,0.28)',
    borderRadius: 23,
    borderWidth: 1,
    zIndex: 1,
  },
  bookingSourceSearch: {
    borderWidth: 1,
    marginTop: 10,
    minHeight: 48,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  bookingSearchSuggestionPanel: {
    marginTop: 8,
    paddingHorizontal: 2,
  },
  bookingSearchSuggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  bookingSearchSuggestionTitle: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 15,
    marginBottom: 7,
    marginLeft: 4,
  },
  bookingProgressRail: {
    marginTop: 9,
  },
  bookingSourceStepCard: {
    borderColor: 'rgba(255,255,255,0.88)',
    borderRadius: 24,
    gap: 0,
    marginBottom: 0,
    minHeight: 74,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 10,
    position: 'relative',
    shadowColor: '#088779',
    shadowOpacity: 0.10,
    shadowRadius: 22,
  },
  bookingSuggestedChip: {
    position: 'relative',
    zIndex: 1,
  },
  bookingSuggestedChipAura: {
    bottom: -9,
    left: -14,
    position: 'absolute',
    right: -14,
    top: -9,
    zIndex: 0,
  },
  bookingSuggestedChipFrame: {
    position: 'relative',
  },
  bookingTimeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 9,
  },
  card: {
    borderRadius: 26,
    borderWidth: 1,
    gap: 14,
    marginTop: 14,
    maxWidth: '100%',
    padding: 16,
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.10,
    shadowRadius: 24,
    width: '100%',
  },
  cardHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 21,
  },
  caseDivider: {
    height: 1,
    opacity: 0.74,
    width: '100%',
  },
  caseKaelSourceBody: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  caseKaelSourceCard: {
    backgroundColor: 'rgba(255,255,255,0.91)',
    borderColor: 'rgba(216,235,232,0.92)',
    borderRadius: 24,
    minHeight: 80,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 10,
    position: 'relative',
    shadowColor: '#085F57',
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.10,
    shadowRadius: 32,
  },
  caseKaelPaymentAuraCard: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderColor: 'rgba(116,224,209,0.62)',
    shadowColor: '#24B3A1',
    shadowOpacity: 0.15,
    shadowRadius: 34,
  },
  caseKaelSourceContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    position: 'relative',
    zIndex: 1,
  },
  caseKaelSourceIcon: {
    minHeight: 60,
    minWidth: 60,
  },
  caseKaelSourceTitle: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 21,
  },
  caseLocationActionButton: {
    flex: 1,
    minWidth: 0,
  },
  caseLocationActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  caseMapAuraBottom: {
    backgroundColor: 'rgba(10,180,160,0.12)',
    borderRadius: 140,
    bottom: -58,
    height: 128,
    position: 'absolute',
    right: -44,
    width: 184,
  },
  caseMapAuraTop: {
    backgroundColor: 'rgba(109,236,218,0.18)',
    borderRadius: 140,
    height: 138,
    left: -54,
    position: 'absolute',
    top: -44,
    width: 210,
  },
  caseMapAuraLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  caseMapCanvas: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#EDF7E8',
    overflow: 'hidden',
    zIndex: 0,
  },
  caseMapCard: {
    borderColor: '#D8E9DE',
    borderRadius: 24,
    borderWidth: 1,
    height: 215,
    marginTop: 14,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#085F57',
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.10,
    shadowRadius: 32,
    width: '100%',
  },
  caseMapEta: {
    alignItems: 'flex-end',
    minWidth: 54,
  },
  caseMapEtaLabel: {
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 12,
    marginTop: 1,
  },
  caseMapEtaValue: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 18,
  },
  caseMapFloat: {
    alignItems: 'center',
    borderRadius: 17,
    borderWidth: 1,
    bottom: 10,
    flexDirection: 'row',
    gap: 10,
    left: 12,
    minHeight: 58,
    overflow: 'hidden',
    paddingHorizontal: 11,
    paddingVertical: 9,
    position: 'absolute',
    right: 12,
    shadowColor: '#085F57',
    shadowOffset: { height: 9, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    zIndex: 4,
  },
  caseMapPin: {
    alignItems: 'center',
    backgroundColor: '#24B3A1',
    borderColor: '#FFFFFF',
    borderRadius: 16,
    borderBottomLeftRadius: 0,
    borderWidth: 0,
    height: 32,
    justifyContent: 'center',
    position: 'absolute',
    shadowColor: '#088779',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    transform: [{ rotate: '-45deg' }],
    width: 32,
    zIndex: 3,
  },
  caseMapPinEnd: {
    right: 45,
    top: 51,
  },
  caseMapPinInner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    height: 11,
    width: 11,
  },
  caseMapPinStart: {
    left: 46,
    top: 127,
  },
  caseMapRoad: {
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderRadius: 999,
    height: 18,
    position: 'absolute',
  },
  caseMapRoadA: {
    left: -18,
    top: 42,
    transform: [{ rotate: '-16deg' }],
    width: 246,
  },
  caseMapRoadB: {
    right: -32,
    top: 104,
    transform: [{ rotate: '18deg' }],
    width: 260,
  },
  caseMapRoadC: {
    left: 88,
    top: 18,
    transform: [{ rotate: '82deg' }],
    width: 212,
  },
  caseMapRoadD: {
    bottom: 54,
    left: 22,
    transform: [{ rotate: '8deg' }],
    width: 180,
  },
  caseMapRoute: {
    backgroundColor: '#18A7D0',
    borderRadius: 999,
    height: 6,
    position: 'absolute',
  },
  caseMapRouteA: {
    left: '25%',
    top: '58%',
    transform: [{ rotate: '-21deg' }],
    width: 88,
  },
  caseMapRouteB: {
    left: '42%',
    top: '49%',
    transform: [{ rotate: '20deg' }],
    width: 76,
  },
  caseMapRouteC: {
    right: '22%',
    top: '39%',
    transform: [{ rotate: '-22deg' }],
    width: 64,
  },
  caseMapWorkerMeta: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    marginTop: 2,
  },
  caseMapWorkerName: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 19,
  },
  caseMiniStat: {
    backgroundColor: 'rgba(255,255,255,0.91)',
    borderRadius: 20,
    borderWidth: 1,
    flex: 1,
    minHeight: 76,
    overflow: 'hidden',
    padding: 12,
    position: 'relative',
    shadowColor: '#085F57',
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 26,
  },
  caseMiniStatLabel: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
  },
  caseMiniStatValue: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 23,
    marginTop: 4,
  },
  caseOptionBadgeTop: {
    alignItems: 'flex-end',
    marginBottom: 7,
  },
  caseOptionBody: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 3,
  },
  caseOptionChoiceBody: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    marginTop: 2,
  },
  caseOptionChoiceCard: {
    backgroundColor: 'rgba(255,255,255,0.91)',
    borderColor: 'rgba(216,235,232,0.92)',
    borderRadius: 24,
    minHeight: 88,
    overflow: 'hidden',
    padding: 12,
    position: 'relative',
    shadowColor: '#085F57',
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.10,
    shadowRadius: 32,
  },
  caseOptionChoiceContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  caseOptionChoiceIcon: {
    minHeight: 60,
    minWidth: 60,
  },
  caseOptionChoiceStack: {
    gap: 8,
    marginTop: 8,
  },
  caseOptionChoiceTitle: {
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 22,
  },
  caseOptionHeroCard: {
    backgroundColor: 'rgba(255,255,255,0.91)',
    borderColor: 'rgba(13,174,154,0.55)',
    borderRadius: 24,
    gap: 0,
    minHeight: 186,
    overflow: 'hidden',
    padding: 13,
    position: 'relative',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 26,
  },
  caseOptionHeroIcon: {
    minHeight: 66,
    minWidth: 66,
  },
  caseOptionHeroMain: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  caseOptionMetric: {
    flex: 1,
    minWidth: 0,
  },
  caseOptionMetricLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    lineHeight: 14,
  },
  caseOptionMetricRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  caseOptionMetricValue: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 2,
  },
  caseOptionMoney: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 19,
    marginTop: 2,
  },
  caseOptionTitle: {
    fontSize: 21,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 26,
  },
  casePriceLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  casePriceLine: {
    alignItems: 'center',
    borderBottomColor: 'rgba(216,235,232,0.70)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  casePriceLines: {
    gap: 0,
  },
  casePriceTotalLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
  casePriceTotalLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingTop: 11,
  },
  casePriceTotalValue: {
    fontSize: 19,
    fontWeight: '600',
    lineHeight: 24,
    textAlign: 'right',
  },
  casePriceValue: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
    maxWidth: '48%',
    textAlign: 'right',
  },
  paymentReviewCaseCard: {
    backgroundColor: 'rgba(255,255,255,0.93)',
    borderColor: 'rgba(154,232,219,0.58)',
    borderRadius: 24,
    gap: 10,
    minHeight: 174,
    overflow: 'hidden',
    padding: 13,
    position: 'relative',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 16, width: 0 },
    shadowOpacity: 0.13,
    shadowRadius: 30,
  },
  paymentReviewRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11,
    position: 'relative',
    zIndex: 1,
  },
  paymentReviewServiceIcon: {
    minHeight: 62,
    minWidth: 62,
  },
  paymentReviewLeadingCell: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 64,
    width: 70,
  },
  paymentReviewTextColumn: {
    flex: 1,
    minWidth: 0,
  },
  paymentReviewMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    position: 'relative',
    zIndex: 1,
  },
  paymentReviewMetaText: {
    flex: 1,
    fontWeight: '700',
    minWidth: 0,
  },
  paymentReviewMetaTextRight: {
    flex: 1.15,
    fontWeight: '700',
    minWidth: 0,
    textAlign: 'right',
  },
  paymentPriceCard: {
    backgroundColor: 'rgba(255,255,255,0.93)',
    borderColor: 'rgba(154,232,219,0.58)',
    borderRadius: 24,
    gap: 0,
    minHeight: 230,
    overflow: 'hidden',
    padding: 14,
    position: 'relative',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 15, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 30,
  },
  paymentPriceLine: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 38,
    position: 'relative',
    zIndex: 1,
  },
  paymentPriceLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    minWidth: 0,
  },
  paymentPriceValue: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
    maxWidth: '52%',
    textAlign: 'right',
  },
  paymentTotalLine: {
    alignItems: 'center',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 12,
    position: 'relative',
    zIndex: 1,
  },
  paymentTotalLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  paymentTotalValue: {
    flexShrink: 1,
    fontSize: 21,
    fontWeight: '600',
    lineHeight: 26,
    textAlign: 'right',
  },
  paymentWorkerNetPill: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: '#EAF8EF',
    borderColor: '#BFE8CE',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    minHeight: 34,
    paddingHorizontal: 12,
    position: 'relative',
    zIndex: 1,
  },
  paymentWorkerNetLabel: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
  },
  paymentWorkerNetValue: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 15,
  },
  paymentSafetyCard: {
    backgroundColor: 'rgba(255,255,255,0.93)',
    borderColor: 'rgba(154,232,219,0.50)',
    borderRadius: 24,
    gap: 0,
    minHeight: 82,
    overflow: 'hidden',
    padding: 12,
    position: 'relative',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.10,
    shadowRadius: 26,
  },
  paymentSafetyIcon: {
    minHeight: 56,
    minWidth: 56,
  },
  paymentMethodHeroCard: {
    backgroundColor: 'rgba(255,255,255,0.93)',
    borderColor: 'rgba(74,215,198,0.62)',
    borderRadius: 26,
    minHeight: 168,
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingVertical: 15,
    position: 'relative',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 20, width: 0 },
    shadowOpacity: 0.17,
    shadowRadius: 38,
  },
  paymentMethodHeroContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    minHeight: 128,
    position: 'relative',
    zIndex: 1,
  },
  paymentMethodHeroTextColumn: {
    alignItems: 'flex-start',
    flex: 1,
    justifyContent: 'center',
    minHeight: 124,
    minWidth: 0,
  },
  paymentMethodAmount: {
    fontSize: 30,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 36,
    marginVertical: 3,
  },
  paymentMethodHeroIconFrame: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderColor: 'rgba(255,255,255,0.96)',
    borderRadius: 24,
    borderWidth: 1,
    height: 86,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.13,
    shadowRadius: 26,
    width: 86,
  },
  paymentMethodHeroBankLogo: {
    height: 52,
    position: 'relative',
    width: 74,
    zIndex: 1,
  },
  paymentMethodHeroWalletImage: {
    height: 56,
    position: 'relative',
    width: 56,
    zIndex: 1,
  },
  paymentMethodRightChip: {
    alignSelf: 'center',
    marginLeft: 'auto',
    minWidth: 82,
  },
  paymentBankRecommendedCard: {
    backgroundColor: 'rgba(255,255,255,0.93)',
    borderColor: 'rgba(74,215,198,0.58)',
    borderRadius: 26,
    minHeight: 112,
    overflow: 'hidden',
    padding: 13,
    position: 'relative',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 15, width: 0 },
    shadowOpacity: 0.13,
    shadowRadius: 30,
  },
  paymentBankRecommendedLogoBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderColor: 'rgba(255,255,255,0.96)',
    borderRadius: 22,
    borderWidth: 1,
    height: 74,
    justifyContent: 'center',
    minWidth: 112,
    overflow: 'hidden',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.09,
    shadowRadius: 22,
  },
  paymentBankRecommendedLogo: {
    height: 46,
    width: 90,
  },
  paymentBankRecommendedFallbackIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20,
    borderWidth: 1,
    height: 66,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 66,
  },
  paymentBankGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
    position: 'relative',
  },
  paymentBankTile: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.91)',
    borderColor: 'rgba(216,235,232,0.92)',
    borderRadius: 22,
    borderWidth: 1,
    flexBasis: '30%',
    flexGrow: 1,
    height: 88,
    justifyContent: 'center',
    minWidth: 92,
    overflow: 'hidden',
    paddingHorizontal: 10,
    position: 'relative',
    shadowColor: '#085F57',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.07,
    shadowRadius: 22,
  },
  paymentBankTileSelected: {
    borderColor: '#55D6C3',
    borderWidth: 1.5,
    shadowColor: '#24B3A1',
    shadowOpacity: 0.16,
  },
  paymentBankTileDisabled: {
    opacity: 0.76,
  },
  paymentBankLogo: {
    height: 58,
    position: 'relative',
    width: 104,
    zIndex: 1,
  },
  paymentBankCheck: {
    alignItems: 'center',
    backgroundColor: '#24B3A1',
    borderRadius: 13,
    height: 26,
    justifyContent: 'center',
    position: 'absolute',
    right: 8,
    top: 8,
    width: 26,
    zIndex: 2,
  },
  paymentBankCheckText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 16,
  },
  paymentMethodSelectedCard: {
    backgroundColor: 'rgba(255,255,255,0.93)',
    borderColor: 'rgba(154,232,219,0.56)',
    borderRadius: 24,
    minHeight: 88,
    overflow: 'hidden',
    padding: 12,
    position: 'relative',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.11,
    shadowRadius: 26,
  },
  paymentMethodSmallIcon: {
    minHeight: 58,
    minWidth: 58,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
  },
  paymentMethodOtherCard: {
    backgroundColor: 'rgba(255,255,255,0.93)',
    borderColor: 'rgba(154,232,219,0.52)',
    borderRadius: 24,
    gap: 0,
    minHeight: 136,
    overflow: 'hidden',
    padding: 12,
    position: 'relative',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.10,
    shadowRadius: 26,
  },
  paymentMethodRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11,
    minHeight: 56,
    position: 'relative',
    zIndex: 1,
  },
  paymentMethodRowIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20,
    borderWidth: 1,
    height: 60,
    justifyContent: 'center',
    minWidth: 60,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
  },
  paymentMethodAssetIcon: {
    height: 58,
    position: 'relative',
    width: 58,
    zIndex: 1,
  },
  paymentProtectedHeroCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.93)',
    borderColor: 'rgba(154,232,219,0.62)',
    borderRadius: 30,
    minHeight: 264,
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingVertical: 20,
    position: 'relative',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 20, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 38,
  },
  paymentProtectedTitle: {
    fontSize: 28,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 34,
    marginTop: 14,
    textAlign: 'center',
  },
  paymentProtectedChip: {
    alignSelf: 'center',
    marginTop: 12,
    position: 'relative',
    zIndex: 1,
  },
  paymentProtectedServiceCard: {
    backgroundColor: 'rgba(255,255,255,0.93)',
    borderColor: 'rgba(154,232,219,0.52)',
    borderRadius: 26,
    minHeight: 104,
    overflow: 'hidden',
    padding: 14,
    position: 'relative',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 30,
  },
  paymentProtectedAmount: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 22,
    maxWidth: 112,
    textAlign: 'right',
  },
  paymentLedgerCard: {
    backgroundColor: 'rgba(255,255,255,0.93)',
    borderColor: 'rgba(154,232,219,0.56)',
    borderRadius: 26,
    gap: 0,
    minHeight: 250,
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingVertical: 18,
    position: 'relative',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 28,
  },
  paymentLedgerStep: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    minHeight: 54,
    position: 'relative',
    zIndex: 1,
  },
  paymentLedgerRail: {
    bottom: -15,
    left: 12,
    position: 'absolute',
    top: 30,
    width: 2,
    zIndex: 0,
  },
  paymentLedgerDot: {
    alignItems: 'center',
    borderRadius: 13,
    borderWidth: 1,
    height: 26,
    justifyContent: 'center',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    width: 26,
    zIndex: 1,
  },
  paymentLedgerDotAura: {
    backgroundColor: 'rgba(180,246,234,0.48)',
    borderRadius: 21,
    height: 42,
    position: 'absolute',
    width: 42,
    zIndex: -1,
  },
  paymentLedgerDotText: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 13,
  },
  casePrimaryStageButton: {
    marginTop: 14,
    overflow: 'hidden',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
  },
  caseQuoteButton: {
    flex: 1,
    minWidth: 0,
  },
  caseQuoteButtonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  caseQuoteLedgerCard: {
    backgroundColor: 'rgba(255,255,255,0.91)',
    borderColor: 'rgba(216,235,232,0.92)',
    borderRadius: 24,
    gap: 0,
    minHeight: 250,
    overflow: 'hidden',
    padding: 14,
    position: 'relative',
    shadowColor: '#085F57',
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.10,
    shadowRadius: 32,
  },
  caseQuoteStatGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  caseQuoteWorkerMeta: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    marginTop: 2,
  },
  caseQuoteWorkerName: {
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 25,
  },
  caseQuoteWorkerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11,
  },
  caseScopeLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  caseScopeStateDot: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  caseScopeStateText: {
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 12,
  },
  caseScopeStepRow: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    minHeight: 38,
    paddingHorizontal: 9,
    paddingVertical: 7,
    shadowColor: '#24B3A1',
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
  },
  caseScopeValue: {
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 13,
    maxWidth: 86,
    textAlign: 'right',
  },
  caseSourceLayer: {
    gap: 12,
    position: 'relative',
    zIndex: 1,
  },
  caseStepListCard: {
    backgroundColor: 'rgba(255,255,255,0.91)',
    borderColor: 'rgba(216,235,232,0.92)',
    borderRadius: 24,
    gap: 0,
    overflow: 'hidden',
    paddingHorizontal: 13,
    paddingVertical: 13,
    position: 'relative',
    shadowColor: '#085F57',
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.10,
    shadowRadius: 32,
  },
  caseStepListContent: {
    gap: 6,
    position: 'relative',
    zIndex: 1,
  },
  caseTimelineBody: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    marginTop: 2,
  },
  caseTimelineCard: {
    backgroundColor: 'rgba(255,255,255,0.91)',
    borderColor: 'rgba(216,235,232,0.92)',
    borderRadius: 24,
    gap: 0,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 13,
    position: 'relative',
    shadowColor: '#085F57',
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.10,
    shadowRadius: 32,
  },
  caseTimelineContent: {
    gap: 9,
    paddingLeft: 1,
    position: 'relative',
    zIndex: 1,
  },
  caseTimelineDot: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 2,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  caseTimelineDotText: {
    fontSize: 9,
    fontWeight: '600',
    lineHeight: 11,
  },
  caseTimelineItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 13,
    minHeight: 53,
    position: 'relative',
    zIndex: 1,
  },
  caseTimelineRail: {
    backgroundColor: '#D6EBE6',
    bottom: 16,
    left: 10,
    position: 'absolute',
    top: 9,
    width: 2,
    zIndex: 0,
  },
  caseTimelineTitle: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
  caseWorkerAvatar: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 48,
  },
  caseWorkerAvatarImage: {
    height: '100%',
    width: '100%',
  },
  caseWorkerAvatarText: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
  centerText: {
    textAlign: 'center',
  },
  chevronText: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 24,
  },
  chatActivityLink: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  chatBubble: {
    borderRadius: 22,
    borderWidth: 1,
    maxWidth: '84%',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chatBubbleCustomer: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 8,
  },
  chatBubbleKael: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 8,
  },
  chatBubbleText: {
    fontSize: 14,
    lineHeight: 20,
  },
  agenticChatActionButton: {
    flex: 1,
    minWidth: 0,
  },
  agenticChatActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
    position: 'relative',
    zIndex: 1,
  },
  agenticChatBody: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
    position: 'relative',
    zIndex: 1,
  },
  agenticEvidenceFileCount: {
    alignItems: 'center',
    borderRadius: 18,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 54,
    paddingHorizontal: 10,
  },
  agenticEvidenceGateCard: {
    alignSelf: 'flex-start',
    maxWidth: '92%',
    padding: 13,
  },
  agenticEvidenceMetricRow: {
    flexDirection: 'row',
    gap: 8,
    position: 'relative',
    zIndex: 1,
  },
  agenticEvidenceReasonBox: {
    gap: 8,
    position: 'relative',
    zIndex: 1,
  },
  agenticEvidenceReasonInput: {
    width: '100%',
  },
  agenticEvidenceReasonInputShell: {
    minHeight: 48,
  },
  agenticEvidenceToolButton: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 12,
  },
  agenticEvidenceToolRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    position: 'relative',
    zIndex: 1,
  },
  agenticEvidenceToolText: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 15,
  },
  agenticMoreInfoCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 10,
    position: 'relative',
    zIndex: 1,
  },
  agenticChatCard: {
    alignSelf: 'flex-start',
    gap: 12,
    marginBottom: 6,
    marginTop: 2,
    overflow: 'hidden',
    padding: 14,
    position: 'relative',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 16, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 32,
    width: '92%',
  },
  agenticChatFact: {
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    minHeight: 66,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 9,
    position: 'relative',
  },
  agenticChatFactCentered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  agenticChatFactGrid: {
    flexDirection: 'row',
    gap: 8,
    position: 'relative',
    zIndex: 1,
  },
  agenticChatFactLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    lineHeight: 13,
    position: 'relative',
    zIndex: 1,
  },
  agenticChatFactValue: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 5,
    position: 'relative',
    zIndex: 1,
  },
  agenticChatHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    position: 'relative',
    zIndex: 1,
  },
  agenticChatIcon: {
    minHeight: 58,
    minWidth: 58,
  },
  agenticChatNote: {
    fontSize: 11.5,
    fontWeight: '600',
    lineHeight: 16,
    position: 'relative',
    zIndex: 1,
  },
  agenticPaymentLedger: {
    borderRadius: 18,
    borderWidth: 1,
    gap: 0,
    marginTop: 2,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 8,
    position: 'relative',
    zIndex: 1,
  },
  agenticChatTitle: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
    position: 'relative',
    zIndex: 1,
  },
  agenticRejectReasonCard: {
    alignSelf: 'flex-start',
    borderRadius: 22,
    borderWidth: 1,
    gap: 5,
    maxWidth: '88%',
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 12,
    position: 'relative',
  },
  kaelProcessDot: {
    borderRadius: 2.5,
    height: 5,
    width: 5,
  },
  kaelProcessDotActive: {
    shadowColor: '#17A995',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.36,
    shadowRadius: 5,
  },
  kaelProcessDotWrap: {
    alignItems: 'center',
    borderRadius: 7,
    height: 14,
    justifyContent: 'center',
    marginTop: 1,
    width: 14,
  },
  kaelProcessLine: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 7,
    minHeight: 16,
  },
  kaelProcessLines: {
    alignSelf: 'flex-start',
    gap: 5,
    marginBottom: 6,
    marginLeft: 6,
    marginTop: -1,
    maxWidth: '88%',
  },
  kaelProcessText: {
    flexShrink: 1,
    fontSize: 11.5,
    fontWeight: '600',
    lineHeight: 16,
  },
  kaelProcessTextActive: {
    fontWeight: '700',
  },
  kaelProcessThinkingLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    minHeight: 18,
  },
  kaelThinkingDot: {
    borderRadius: 2,
    height: 4,
    width: 4,
  },
  kaelThinkingDots: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
    paddingTop: 4,
  },
  chatComposer: {
    minHeight: 56,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#059B8A',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.10,
    shadowRadius: 24,
  },
  chatComposerDisclaimer: {
    fontSize: 10.5,
    fontWeight: '600',
    lineHeight: 14,
    marginTop: -4,
    textAlign: 'center',
  },
  chatComposerAura: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  chatMediaBadge: {
    alignItems: 'center',
    borderRadius: 8,
    height: 16,
    justifyContent: 'center',
    minWidth: 16,
    paddingHorizontal: 4,
    position: 'absolute',
    right: -4,
    top: -4,
  },
  chatMediaBadgeText: {
    fontSize: 9,
    fontWeight: '600',
    lineHeight: 11,
  },
  chatMediaButton: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    position: 'relative',
    width: 38,
    zIndex: 1,
  },
  chatMediaButtonDisabled: {
    opacity: 1,
  },
  chatMediaCameraIcon: {
    height: 20,
    width: 20,
  },
  chatEvidenceStrip: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 10,
  },
  chatFrame: {
    flex: 1,
    gap: 10,
    paddingBottom: 18,
    paddingHorizontal: 16,
    paddingTop: 10,
    position: 'relative',
  },
  chatHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    marginTop: 0,
  },
  chatTranscript: {
    flexGrow: 1,
    gap: 8,
    paddingVertical: 6,
  },
  chatTranscriptMenuOpen: {
    paddingTop: 94,
  },
  chatModeButton: {
    position: 'relative',
    zIndex: 1,
  },
  chatModeButtonActive: {
    shadowColor: '#046358',
    shadowOffset: { height: 7, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
  },
  chatModeSwitch: {
    borderColor: 'rgba(255,255,255,0.88)',
    minHeight: 46,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#088779',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
  },
  chatModeMenu: {
    alignSelf: 'flex-end',
    flexDirection: 'column',
    gap: 4,
    minHeight: 0,
    paddingBottom: 4,
    paddingHorizontal: 4,
    paddingTop: 7,
    position: 'absolute',
    right: 21,
    top: 68,
    width: 172,
    zIndex: 20,
  },
  chatModeMenuButton: {
    borderRadius: 16,
    flex: 0,
    minHeight: 34,
    paddingHorizontal: 9,
    zIndex: 2,
  },
  chatModeMenuOption: {
    borderWidth: 1,
    width: '100%',
  },
  chatModeMenuSheen: {
    backgroundColor: 'rgba(255,255,255,0.62)',
    borderRadius: 999,
    height: 56,
    left: -76,
    position: 'absolute',
    top: -18,
    width: 42,
    zIndex: 1,
  },
  chatModeMenuText: {
    fontSize: 12,
  },
  chatModeSwitchAura: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  chatTopTitle: {
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 36,
  },
  chatTimelineTitle: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
    textAlign: 'center',
  },
  chatTopCopyCentered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    transform: [{ translateY: 4 }],
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  composer: {
    alignItems: 'center',
    borderRadius: 26,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 8,
  },
  composerInput: {
    flex: 1,
    fontSize: 15,
    minHeight: 44,
    paddingHorizontal: 10,
    position: 'relative',
    zIndex: 1,
  },
  composerTextFieldShell: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  composerTextFieldStack: {
    flex: 1,
  },
  dockIcon: {
    height: 27,
    opacity: 0.82,
    position: 'relative',
    transform: [{ translateY: 1 }, { scale: 0.92 }],
    width: 27,
    zIndex: 3,
  },
  dockIconActive: {
    opacity: 1,
    transform: [{ translateY: -1 }, { scale: 1 }],
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
  dockItemPressed: {
    transform: [{ scale: 0.9 }],
  },
  dockLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    lineHeight: 11,
    maxWidth: 64,
    position: 'relative',
    textAlign: 'center',
    zIndex: 3,
  },
  dockLabelActive: {
    fontWeight: '600',
    transform: [{ translateY: -1 }],
  },
  dockOverlay: {
    alignItems: 'center',
    bottom: 12,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 30,
  },
  dockRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: CUSTOMER_LIQUID_NAV_GAP,
    justifyContent: 'center',
  },
  dockPlane: {
    alignItems: 'center',
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 0,
    height: CUSTOMER_LIQUID_NAV_DOCK_HEIGHT,
    minHeight: CUSTOMER_LIQUID_NAV_DOCK_HEIGHT,
    overflow: 'hidden',
    padding: CUSTOMER_LIQUID_NAV_RAIL_PADDING,
    position: 'relative',
  },
  dockShimmer: {
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
  dockCaustic: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    zIndex: 0,
  },
  dockCausticGlow: {
    backgroundColor: 'rgba(28,205,179,0.14)',
    borderRadius: 999,
    bottom: -22,
    filter: Platform.OS === 'web' ? 'blur(9px)' : undefined,
    height: 49,
    position: 'absolute',
  } as any,
  dockCausticSweep: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 999,
    bottom: -18,
    height: 64,
    left: -10,
    opacity: 0.68,
    position: 'absolute',
    right: -10,
    transform: [{ rotate: '-6deg' }],
  },
  dockCausticSweepBright: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 999,
    height: 24,
    left: '48%',
    opacity: 0.44,
    position: 'absolute',
    right: -22,
    top: 5,
    transform: [{ rotate: '-4deg' }],
  },
  dockInnerRefraction: {
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
  dockLens: {
    backgroundColor: 'rgba(248,255,253,0.94)',
    borderColor: 'rgba(255,255,255,0.98)',
    borderRadius: 24,
    borderWidth: 1,
    bottom: 4,
    left: 4,
    overflow: 'hidden',
    position: 'absolute',
    shadowColor: '#078071',
    shadowOffset: { height: 9, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    top: 4,
    zIndex: 1,
  },
  dockLensBloom: {
    backgroundColor: 'rgba(220,249,242,0.52)',
    borderRadius: 24,
    bottom: 5,
    left: 6,
    opacity: 0.88,
    position: 'absolute',
    right: 6,
    top: 5,
  },
  dockLensTopLight: {
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
  dockLensSheen: {
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderRadius: 16,
    bottom: 1,
    left: 1,
    position: 'absolute',
    top: 1,
    width: 18,
    zIndex: 3,
  },
  dockLensInnerShadow: {
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
  emptyState: {
    alignItems: 'center',
  },
  inactiveAgenticGate: {
    minHeight: 1,
  },
  emptyStateContent: {
    alignItems: 'center',
    gap: 12,
    justifyContent: 'center',
    position: 'relative',
    zIndex: 1,
  },
  emptyTitle: {
    fontSize: 19,
    fontWeight: '600',
    lineHeight: 24,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 10,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  factGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  flex: {
    flex: 1,
  },
  formCard: {
    gap: 12,
  },
  frame: {
    alignSelf: 'center',
    alignItems: 'stretch',
    minWidth: 0,
  },
  heroCopy: {
    alignItems: 'center',
    flex: 1,
    flexShrink: 1,
    gap: 8,
    justifyContent: 'center',
    minWidth: 0,
    position: 'relative',
    zIndex: 1,
  },
  heroHello: {
    fontSize: 14,
    fontWeight: '700',
  },
  heroKael: {
    flexShrink: 0,
    height: 118,
    position: 'relative',
    width: 86,
    zIndex: 1,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 34,
  },
  homeAuraFrame: {
    marginTop: 2,
    position: 'relative',
  },
  homeAuraServiceTile: {
    borderRadius: 25,
    borderWidth: 1,
    elevation: 2,
    flexBasis: '30%',
    flexGrow: 1,
    gap: 4,
    maxWidth: '32%',
    minHeight: 120,
    overflow: 'hidden',
    paddingBottom: 11,
    paddingHorizontal: 8,
    paddingTop: 11,
    position: 'relative',
    shadowColor: '#088779',
    shadowOffset: { height: 14, width: 0 },
    shadowRadius: 28,
  },
  homeEmptySourceAura: {
    bottom: -42,
    left: -28,
    position: 'absolute',
    right: -28,
    top: -34,
    zIndex: 0,
  },
  homeEmptyState: {
    overflow: 'hidden',
    position: 'relative',
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 34,
  },
  homeHero: {
    alignItems: 'center',
    borderRadius: 30,
    flexDirection: 'row',
    gap: 12,
    minHeight: 178,
    overflow: 'hidden',
    position: 'relative',
  },
  homeHeroSourceAura: {
    height: 210,
    position: 'absolute',
    right: -92,
    top: -110,
    width: 250,
    zIndex: 0,
  },
  homeHeroTitle: {
    fontSize: 24,
    lineHeight: 28,
    textAlign: 'center',
  },
  input: {
    borderRadius: 20,
    borderWidth: 1,
    fontSize: 15,
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  intakeHero: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  kaelAccessory: {
    flexShrink: 0,
    height: CUSTOMER_LIQUID_NAV_ORB_SIZE,
    overflow: 'visible',
    width: CUSTOMER_LIQUID_NAV_ORB_SIZE,
  },
  kaelAccessoryActive: {
    transform: [{ scale: 1.015 }],
  },
  kaelAccessoryPressed: {
    transform: [{ scale: 0.94 }],
  },
  kaelAccessoryAura: {
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
  kaelAccessoryAuraActive: {
    backgroundColor: 'rgba(15,218,183,0.42)',
    opacity: 0.96,
    transform: [{ scale: 1.08 }],
  },
  kaelAccessoryOrbMotion: {
    height: CUSTOMER_LIQUID_NAV_ORB_SIZE,
    position: 'relative',
    width: CUSTOMER_LIQUID_NAV_ORB_SIZE,
    zIndex: 2,
  },
  kaelAccessoryGlass: {
    alignItems: 'center',
    backgroundColor: 'rgba(219,251,243,0.76)',
    borderRadius: 34,
    borderWidth: 1,
    height: CUSTOMER_LIQUID_NAV_ORB_SIZE,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#05675D',
    shadowOffset: { height: 15, width: 0 },
    shadowOpacity: 0.20,
    shadowRadius: 29,
    width: CUSTOMER_LIQUID_NAV_ORB_SIZE,
  },
  kaelAccessoryGlassActive: {
    backgroundColor: 'rgba(219,251,243,0.84)',
    shadowOpacity: 0.28,
    shadowRadius: 35,
  },
  kaelAccessoryImage: {
    height: 62,
    left: 4,
    position: 'absolute',
    top: -1,
    transform: [{ translateY: 3 }, { scale: 1.025 }],
    width: 60,
    zIndex: 5,
  },
  kaelAccessoryOrbit: {
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
  kaelAccessoryOrbitBack: {
    opacity: 0.42,
    transform: [{ rotate: '24deg' }, { scale: 0.94 }],
    zIndex: 0,
  },
  kaelAccessoryOrbitActive: {
    borderBottomColor: 'rgba(14,181,158,0.52)',
    borderColor: 'rgba(73,229,204,0.72)',
    opacity: 0.88,
  },
  kaelAccessoryPearl: {
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
  kaelAccessoryRipple: {
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
  kaelAccessoryBackdrop: {
    backgroundColor: 'rgba(184,248,236,0.92)',
    borderRadius: 30,
    borderColor: 'rgba(255,255,255,0.80)',
    borderWidth: 1,
    bottom: 5,
    left: 5,
    opacity: 0.82,
    position: 'absolute',
    right: 5,
    top: 5,
    zIndex: 1,
  },
  kaelAccessoryCaustic: {
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
  kaelAccessoryGlobeTop: {
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
  kaelAccessoryGlint: {
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
  kaelAccessoryFrontRim: {
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
  kaelAccessoryStatus: {
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
  kaelAccessoryStatusHalo: {
    backgroundColor: 'rgba(18,191,132,0.16)',
    borderRadius: 9,
    bottom: 2,
    height: 18,
    position: 'absolute',
    right: 0,
    width: 18,
    zIndex: 9,
  },
  kaelAccessoryStatusWave: {
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
  labelText: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  lockedEmptyAuraCard: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 88,
    paddingVertical: 20,
  },
  lockedEmptyCardLabel: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
    position: 'relative',
    textAlign: 'center',
    zIndex: 1,
  },
  lockedEmptyMintPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 86,
    overflow: 'hidden',
    paddingHorizontal: 16,
    position: 'relative',
  },
  lockedEmptyMintPillText: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
    position: 'relative',
    textAlign: 'center',
    zIndex: 1,
  },
  lockedEmptyMintPillWide: {
    alignSelf: 'stretch',
    minHeight: 42,
    width: '100%',
  },
  lockedEmptyPillAura: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  matchingBarFill: {
    backgroundColor: '#24B3A1',
    borderRadius: 999,
    height: '100%',
  },
  matchingBarLabel: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
    width: 78,
  },
  matchingBarRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    position: 'relative',
    zIndex: 1,
  },
  matchingBarTrack: {
    borderRadius: 999,
    flex: 1,
    height: 8,
    overflow: 'hidden',
  },
  matchingBarValue: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
    textAlign: 'right',
    width: 34,
  },
  matchingBarValueMotion: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    width: 34,
  },
  matchingBarsCard: {
    gap: 13,
    overflow: 'hidden',
    position: 'relative',
  },
  matchingChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 9,
  },
  matchingHandoffChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.71)',
    borderColor: 'rgba(204,235,229,0.82)',
    height: 28,
    minHeight: 28,
    paddingHorizontal: 10,
  },
  matchingHandoffChipSelected: {
    backgroundColor: 'rgba(224,252,245,0.88)',
    borderColor: 'rgba(85,214,195,0.36)',
  },
  matchingHandoffChipSelectedText: {
    color: '#088779',
  },
  matchingHandoffChipSuccess: {
    backgroundColor: '#EAF8EF',
    borderColor: '#BFE8CE',
  },
  matchingHandoffChipSuccessText: {
    color: '#1F9B5B',
  },
  matchingHandoffChipText: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  matchingDivider: {
    height: 1,
    marginLeft: 64,
    opacity: 0.72,
  },
  matchingHeroCard: {
    minHeight: 150,
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingVertical: 18,
    position: 'relative',
  },
  matchingHeroContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    position: 'relative',
    zIndex: 1,
  },
  matchingHeroCopy: {
    flex: 1,
    minWidth: 0,
  },
  matchingHeroMeta: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    marginTop: 3,
  },
  matchingHeroName: {
    fontSize: 30,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 36,
    marginTop: 7,
  },
  matchingKaelBody: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
    marginTop: 2,
  },
  matchingKaelCard: {
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
    minHeight: 88,
    overflow: 'hidden',
    padding: 13,
    position: 'relative',
    shadowColor: '#088779',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
  },
  matchingKaelTitle: {
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 22,
  },
  matchingKaelStatusIconAura: {
    bottom: -18,
    left: -18,
    position: 'absolute',
    right: -18,
    top: -18,
    zIndex: 0,
  },
  matchingKaelStatusIconWrap: {
    alignItems: 'center',
    height: 64,
    justifyContent: 'center',
    position: 'relative',
    width: 64,
    zIndex: 1,
  },
  matchingKaelStatusImage: {
    height: 50,
    position: 'relative',
    width: 50,
    zIndex: 1,
  },
  matchingListCard: {
    gap: 0,
    overflow: 'hidden',
    paddingVertical: 14,
    position: 'relative',
  },
  matchingNextButton: {
    marginTop: 10,
  },
  matchingReasonBody: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
    marginTop: 2,
  },
  matchingReasonIcon: {
    minHeight: 58,
    minWidth: 58,
  },
  matchingReasonRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 92,
    paddingVertical: 12,
    position: 'relative',
    zIndex: 1,
  },
  matchingReasonTitle: {
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 22,
  },
  matchingScoreBadge: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    minWidth: 48,
    paddingHorizontal: 10,
  },
  matchingScoreBadgeText: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 20,
    textAlign: 'center',
  },
  linkText: {
    fontSize: 13,
    fontWeight: '600',
  },
  mediaCard: {
    gap: 12,
  },
  mediaAnalyzeButton: {
    borderColor: 'rgba(185,235,226,0.74)',
    marginTop: 14,
    overflow: 'hidden',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.10,
    shadowRadius: 18,
  },
  mediaAnalyzeButtonAura: {
    ...StyleSheet.absoluteFillObject,
  },
  mediaCaptionText: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  mediaCaseRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 2,
    marginTop: 2,
  },
  mediaDescriptionCard: {
    minHeight: 84,
  },
  mediaDescriptionChip: {
    position: 'relative',
    zIndex: 1,
  },
  mediaDescriptionChipAura: {
    bottom: -7,
    left: -9,
    position: 'absolute',
    right: -9,
    top: -7,
    zIndex: 0,
  },
  mediaDescriptionChipFrame: {
    borderRadius: 999,
    overflow: 'visible',
    position: 'relative',
  },
  mediaDescriptionQuote: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 20,
    position: 'relative',
    zIndex: 1,
  },
  mediaEvidenceSlot: {
    alignItems: 'center',
    borderRadius: 15,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    minHeight: 72,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 8,
    shadowColor: '#085F57',
    shadowOffset: { height: 7, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
  },
  mediaEvidenceSlotActive: {
    shadowColor: '#24B3A1',
    shadowOpacity: 0.13,
  },
  mediaHeroAura: {
    bottom: -34,
    left: -32,
    position: 'absolute',
    right: -32,
    top: -24,
    zIndex: 0,
  },
  mediaHeroCard: {
    borderColor: 'rgba(255,255,255,0.90)',
    borderRadius: 30,
    overflow: 'hidden',
    padding: 16,
    position: 'relative',
    shadowColor: '#088779',
    shadowOpacity: 0.12,
    shadowRadius: 28,
  },
  mediaHeroContent: {
    gap: 12,
    position: 'relative',
    zIndex: 1,
  },
  mediaHeroIcon: {
    height: 66,
    minHeight: 66,
    minWidth: 66,
    width: 66,
  },
  mediaMicroNote: {
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
    marginHorizontal: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  mediaMiniIcon: {
    minHeight: 50,
    minWidth: 50,
  },
  mediaMiniLabel: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
    textAlign: 'center',
  },
  mediaMiniStat: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    flex: 1,
    gap: 6,
    minHeight: 116,
    padding: 10,
  },
  mediaMiniValue: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 18,
    textAlign: 'center',
  },
  mediaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  mediaSlotIcon: {
    height: 30,
    width: 30,
  },
  mediaSlotGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  mediaSlotLabel: {
    fontSize: 9.5,
    fontWeight: '600',
    lineHeight: 12,
    textAlign: 'center',
  },
  mediaSlotValue: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 15,
    textAlign: 'center',
  },
  mediaSourceListCard: {
    borderColor: 'rgba(255,255,255,0.91)',
    borderRadius: 25,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 13,
    position: 'relative',
    shadowColor: '#088779',
    shadowOpacity: 0.09,
    shadowRadius: 22,
  },
  mediaPrepAura: {
    bottom: -34,
    left: -28,
    position: 'absolute',
    right: -28,
    top: -24,
    zIndex: 0,
  },
  mediaPrepListAura: {
    bottom: -12,
    left: -12,
    position: 'absolute',
    right: -12,
    top: -12,
    zIndex: 0,
  },
  mediaPrepLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  mediaPrepRow: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    minHeight: 40,
    paddingHorizontal: 9,
    paddingVertical: 8,
    position: 'relative',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 6, width: 0 },
    shadowOpacity: 0.045,
    shadowRadius: 12,
    zIndex: 1,
  },
  mediaPrepSourceCard: {
    gap: 0,
    minHeight: 188,
  },
  mediaPrepState: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  mediaPrepStateText: {
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 12,
  },
  mediaPrepStepList: {
    gap: 6,
    overflow: 'hidden',
    padding: 1,
    position: 'relative',
    zIndex: 1,
  },
  mediaPrepValue: {
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 13,
    maxWidth: 82,
    textAlign: 'right',
  },
  mediaStrip: {
    flexDirection: 'row',
    gap: 7,
  },
  mediaVoice: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    minHeight: 52,
    paddingHorizontal: 12,
  },
  mediaVoiceBody: {
    flex: 1,
    gap: 2,
  },
  mediaVoiceError: {
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 13,
    marginLeft: 8,
    marginTop: -4,
  },
  mediaVoiceIcon: {
    height: 30,
    width: 30,
  },
  mediaVoicePressed: {
    transform: [{ scale: 0.99 }],
  },
  mediaVoiceTitle: {
    fontSize: 10.5,
    fontWeight: '600',
    lineHeight: 13,
  },
  mediaVoiceValue: {
    fontSize: 9,
    fontWeight: '600',
    lineHeight: 12,
  },
  mediaWave: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
    height: 28,
  },
  mediaWaveBar: {
    borderRadius: 2,
    width: 3,
  },
  memoryDivider: {
    height: 1,
    marginVertical: 12,
    width: '100%',
  },
  memoryIcon: {
    minHeight: 58,
    minWidth: 58,
  },
  memoryListCard: {
    gap: 0,
  },
  memoryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 78,
    position: 'relative',
    zIndex: 1,
  },
  memoryStatusChip: {
    alignSelf: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
    minWidth: 64,
    shadowColor: '#24B3A1',
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  memoryToggle: {
    alignItems: 'flex-start',
    borderRadius: 18,
    height: 32,
    justifyContent: 'center',
    paddingHorizontal: 4,
    width: 56,
  },
  memoryTogglePending: {
    alignItems: 'center',
    opacity: 0.84,
  },
  memoryToggleKnob: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    height: 24,
    shadowColor: '#0A1C22',
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 5,
    width: 24,
  },
  memoryToggleKnobOn: {
    alignSelf: 'flex-end',
  },
  activeCaseCard: {
    borderColor: 'rgba(113,225,209,0.46)',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#088779',
    shadowOpacity: 0.12,
    shadowRadius: 24,
  },
  metric: {
    borderRadius: 18,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 82,
    overflow: 'hidden',
    padding: 12,
    position: 'relative',
  },
  metricAura: {
    borderColor: 'rgba(113,225,209,0.42)',
    shadowColor: '#088779',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  metricContent: {
    position: 'relative',
    zIndex: 1,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    marginTop: 4,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 21,
  },
  profileHero: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
  },
  profileMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  profileCompactMintAura: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  profileStatCard: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    flexBasis: '30%',
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 76,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 12,
    position: 'relative',
    shadowColor: '#088779',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.10,
    shadowRadius: 24,
  },
  profileStatContent: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 1,
  },
  profileStatLabel: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    marginTop: 4,
    textAlign: 'center',
  },
  profileStatValue: {
    fontSize: 23,
    fontWeight: '600',
    lineHeight: 28,
    textAlign: 'center',
  },
  profileStatValueCompact: {
    fontSize: 17,
    lineHeight: 22,
  },
  safeArea: {
    flex: 1,
    maxWidth: '100%',
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  screenKicker: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0,
    marginTop: 6,
  },
  screenRail: {
    gap: 8,
  },
  screenRailItem: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  screenRailTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 34,
    marginTop: 2,
  },
  scrollContent: {
    paddingBottom: 128,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  sectionHeader: {
    gap: 4,
    marginTop: 22,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 25,
  },
  segment: {
    borderRadius: 18,
    borderWidth: 1,
    flexBasis: '40%',
    flexGrow: 0,
    maxWidth: '40%',
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  sendButton: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    minWidth: 44,
    position: 'relative',
    width: 44,
    zIndex: 1,
  },
  sendText: {
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 24,
  },
  serviceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'flex-start',
    marginTop: 12,
  },
  homeServiceGrid: {
    flexWrap: 'nowrap',
    gap: 9,
    justifyContent: 'space-between',
    marginTop: 8,
    position: 'relative',
  },
  homeServiceNote: {
    fontSize: 9.5,
    lineHeight: 13,
  },
  homeServiceTitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  serviceIcon: {
    minHeight: 82,
    minWidth: 82,
  },
  serviceNote: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    textAlign: 'center',
  },
  serviceTile: {
    alignItems: 'center',
    borderRadius: 26,
    borderWidth: 1,
    flexBasis: '40%',
    flexGrow: 0,
    gap: 8,
    maxWidth: '40%',
    minHeight: 168,
    minWidth: 0,
    padding: 12,
  },
  serviceTitle: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 19,
    textAlign: 'center',
  },
  sourceIconAura: {
    height: 92,
    left: -5,
    position: 'absolute',
    top: -5,
    width: 92,
  },
  sourceIconAuraFrame: {
    alignItems: 'center',
    height: 82,
    justifyContent: 'center',
    position: 'relative',
    width: 82,
  },
  sourceIconTile: {
    borderRadius: 22,
    borderWidth: 1,
    elevation: 1,
    height: 64,
    overflow: 'hidden',
    shadowColor: '#056055',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.13,
    shadowRadius: 26,
    width: 64,
  },
  statusPill: {
    borderRadius: 999,
    maxWidth: 118,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  textArea: {
    minHeight: 104,
  },
  utilityCard: {
    gap: 12,
  },
  utilityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 14,
  },
  utilityLabel: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
    textAlign: 'center',
  },
  utilityTile: {
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    flexBasis: '45%',
    flexGrow: 1,
    gap: 10,
    minHeight: 132,
    padding: 12,
  },
  accountUtilityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  accountUtilityIcon: {
    minHeight: 82,
    minWidth: 82,
  },
  accountUtilityChevron: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 22,
    position: 'absolute',
    right: 12,
    top: 12,
  },
  accountUtilityTile: {
    alignItems: 'center',
    borderRadius: 26,
    borderWidth: 1,
    flexBasis: '30%',
    flexGrow: 1,
    gap: 8,
    minHeight: 154,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 14,
    position: 'relative',
    shadowColor: '#088779',
    shadowOffset: { height: 15, width: 0 },
    shadowOpacity: 0.10,
    shadowRadius: 30,
  },
  profileUtilityStack: {
    gap: 14,
    position: 'relative',
  },
  profileUtilityHero: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
  },
  profileUtilityHeroIcon: {
    flexShrink: 0,
    minHeight: 86,
    minWidth: 86,
  },
  profileAddressUtilityTitle: {
    fontWeight: '800',
  },
  profilePaymentForm: {
    gap: 12,
  },
  profileAddressHub: {
    gap: 14,
  },
  profileAddressHubHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  profileAddressHubIcon: {
    flexShrink: 0,
    minHeight: 76,
    minWidth: 76,
  },
  profileAddressBlock: {
    gap: 10,
  },
  profileAddressBlockHeader: {
    gap: 3,
  },
  profileAddressHint: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  profileAddressDivider: {
    height: 1,
    opacity: 0.86,
  },
  profileAddressForm: {
    gap: 10,
  },
  profileAddressInput: {
    borderRadius: 18,
    borderWidth: 1,
    fontSize: 14,
    fontWeight: '600',
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  profileAddressSaveDefaultButton: {
    borderRadius: 22,
  },
  profileAddressSaveDefaultButtonActive: {
    backgroundColor: '#12B8A4',
    shadowColor: '#088779',
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
  },
  profileAddressSecondaryContent: {
    gap: 0,
  },
  profileAddressAddRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  profileAddressAddButton: {
    minHeight: 44,
    minWidth: 86,
  },
  profileAddressSavedList: {
    gap: 10,
  },
  profileAddressSavedRow: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 82,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  profileAddressSavedIcon: {
    flexShrink: 0,
    minHeight: 62,
    minWidth: 62,
  },
  profileAddressDefaultButton: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  profileAddressDefaultText: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  profileAddressMessage: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
  },
  caseFactsPanel: {
    borderRadius: 22,
    borderWidth: 1,
    gap: 12,
    padding: 12,
  },
  caseArtifact: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 70,
    minWidth: 0,
    overflow: 'hidden',
    padding: 10,
    position: 'relative',
    shadowColor: '#088779',
    shadowOffset: { height: 6, width: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
  },
  caseArtifactGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  caseArtifactLabel: {
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
    position: 'relative',
    textAlign: 'center',
    zIndex: 1,
  },
  caseArtifactValue: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 19,
    marginTop: 4,
    position: 'relative',
    textAlign: 'center',
    zIndex: 1,
  },
  caseChatFrame: {
    gap: 9,
  },
  caseChatSummaryBody: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    position: 'relative',
    zIndex: 1,
  },
  caseChatSummaryCard: {
    borderColor: 'rgba(255,255,255,0.91)',
    borderRadius: 24,
    gap: 9,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 11,
    position: 'relative',
    shadowColor: '#088779',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  caseChatSummaryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    position: 'relative',
    zIndex: 1,
  },
  caseChatSummaryIcon: {
    minHeight: 60,
    minWidth: 60,
  },
  caseChatSummaryText: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  caseChatSummaryTitle: {
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 21,
  },
  caseEvidenceCard: {
    gap: 8,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#088779',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
  },
  caseInfoDivider: {
    height: 1,
    width: '100%',
  },
  caseLoadingCard: {
    alignItems: 'center',
    gap: 10,
  },
  caseOverviewCard: {
    gap: 14,
  },
  caseOverviewConfidenceRing: {
    shadowColor: '#088779',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
  },
  caseOverviewDetailText: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
    marginTop: 3,
  },
  caseOverviewHeroAura: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  caseOverviewHeroCard: {
    minHeight: 166,
    overflow: 'hidden',
    paddingVertical: 18,
    position: 'relative',
    shadowColor: '#088779',
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.10,
    shadowRadius: 26,
  },
  caseOverviewHeroContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    position: 'relative',
    zIndex: 1,
  },
  caseOverviewHeroText: {
    flex: 1,
    minWidth: 0,
  },
  caseOverviewInfoCard: {
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#088779',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
  },
  caseOverviewInfoIcon: {
    minHeight: 64,
    minWidth: 64,
  },
  caseOverviewInfoLabel: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 19,
  },
  caseOverviewInfoRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 72,
    position: 'relative',
    zIndex: 1,
  },
  caseOverviewInfoValue: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 2,
  },
  caseOverviewLiquidScore: {
    alignItems: 'center',
    flexShrink: 0,
    height: 82,
    justifyContent: 'center',
    position: 'relative',
    width: 82,
  },
  caseOverviewNextButton: {
    marginTop: 0,
  },
  caseOverviewNextCard: {
    borderRadius: 20,
    marginTop: 0,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 11,
    position: 'relative',
    shadowColor: '#088779',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
  },
  caseOverviewNextIcon: {
    minHeight: 58,
    minWidth: 58,
  },
  caseOverviewNextContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11,
    position: 'relative',
    zIndex: 1,
  },
  caseOverviewNextCopy: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
    marginTop: 2,
  },
  caseOverviewNextStack: {
    gap: 10,
    marginTop: 9,
  },
  caseOverviewScoreAura: {
    bottom: -22,
    left: -22,
    overflow: 'hidden',
    position: 'absolute',
    right: -22,
    top: -22,
  },
  caseOverviewScoreHighlight: {
    backgroundColor: 'rgba(255,255,255,0.70)',
    borderRadius: 999,
    height: 12,
    left: 12,
    position: 'absolute',
    right: 12,
    top: 6,
  },
  caseOverviewScoreInside: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 2,
  },
  caseOverviewScoreLabel: {
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 11,
    maxWidth: 58,
    textAlign: 'center',
  },
  caseOverviewScoreLens: {
    borderRadius: 999,
    borderWidth: 1,
    bottom: 12,
    left: 12,
    overflow: 'hidden',
    position: 'absolute',
    right: 12,
    shadowColor: '#04665B',
    shadowOffset: { height: 9, width: 0 },
    shadowOpacity: 0.09,
    shadowRadius: 24,
    top: 12,
    zIndex: 1,
  },
  caseOverviewScoreSvg: {
    position: 'absolute',
    transform: [{ rotate: '-90deg' }],
    zIndex: 1,
  },
  caseOverviewScoreValue: {
    fontSize: 25,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 28,
  },
  caseOverviewStartButton: {
    marginTop: 18,
  },
  caseOverviewTitle: {
    fontSize: 28,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 34,
    marginTop: 8,
  },
  caseReferenceHero: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    minHeight: 142,
  },
  casePrimaryInfoCard: {
    gap: 12,
  },
  caseProgressCard: {
    gap: 10,
    overflow: 'hidden',
    paddingVertical: 12,
    position: 'relative',
    shadowColor: '#088779',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
  },
  caseProgressLabel: {
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 13,
    minWidth: 0,
    width: 64,
  },
  caseProgressLabelRail: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 5,
    marginTop: -2,
    position: 'relative',
    width: '100%',
    zIndex: 1,
  },
  caseProgressLabelCenter: {
    textAlign: 'center',
  },
  caseProgressLabelEnd: {
    textAlign: 'right',
  },
  caseProgressLabelStart: {
    textAlign: 'left',
  },
  caseProgressLabelSlot: {
    overflow: 'visible',
    width: 23,
  },
  caseProgressLabelSlotCenter: {
    alignItems: 'center',
  },
  caseProgressLabelSlotEnd: {
    alignItems: 'flex-end',
  },
  caseProgressLabelSlotStart: {
    alignItems: 'flex-start',
  },
  caseProgressLabelSpacer: {
    flex: 1,
    height: 1,
  },
  fulfillmentCaption: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 9,
    textAlign: 'center',
  },
  fulfillmentCenteredText: {
    textAlign: 'center',
  },
  fulfillmentChipRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    justifyContent: 'center',
    marginTop: 10,
    position: 'relative',
    zIndex: 1,
  },
  fulfillmentDivider: {
    height: 1,
    marginVertical: 12,
    position: 'relative',
    width: '100%',
    zIndex: 1,
  },
  fulfillmentHeroCard: {
    overflow: 'hidden',
    paddingHorizontal: 15,
    paddingVertical: 18,
    position: 'relative',
    shadowColor: '#088779',
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: 0.10,
    shadowRadius: 34,
  },
  jobProgressHeroCard: {
    borderColor: 'rgba(186,240,230,0.78)',
    shadowOpacity: 0.16,
    shadowRadius: 38,
  },
  fulfillmentHeroCentered: {
    alignItems: 'center',
  },
  fulfillmentHeroPill: {
    alignSelf: 'center',
  },
  fulfillmentKaelCardWrap: {
    marginTop: 9,
  },
  fulfillmentListCard: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderColor: 'rgba(216,235,232,0.92)',
    borderRadius: 25,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 13,
    position: 'relative',
    shadowColor: '#085F57',
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 30,
  },
  fulfillmentListIcon: {
    minHeight: 48,
    minWidth: 48,
  },
  fulfillmentListRow: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 66,
    paddingVertical: 9,
    position: 'relative',
    zIndex: 1,
  },
  fulfillmentProgressHeroRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    position: 'relative',
    zIndex: 1,
  },
  fulfillmentProgressIcon: {
    minHeight: 78,
    minWidth: 78,
  },
  fulfillmentRowBody: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    marginTop: 1,
  },
  fulfillmentRowTitle: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
  },
  fulfillmentStep: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 54,
    paddingHorizontal: 10,
    position: 'relative',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    zIndex: 1,
  },
  fulfillmentStepBody: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    marginTop: 1,
  },
  fulfillmentStepList: {
    gap: 6,
    position: 'relative',
    zIndex: 1,
  },
  fulfillmentStepState: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  fulfillmentStepStateText: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 16,
  },
  fulfillmentStepTitle: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
  fulfillmentScopeLabel: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  fulfillmentScopeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    position: 'relative',
    zIndex: 1,
  },
  fulfillmentScopeValue: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 21,
    textAlign: 'right',
  },
  fulfillmentWorkerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    position: 'relative',
    zIndex: 1,
  },
  jobProgressRiskIcon: {
    minHeight: 74,
    minWidth: 74,
  },
  jobProgressRiskChip: {
    alignSelf: 'center',
    marginTop: 5,
  },
  jobProgressRiskRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    position: 'relative',
    zIndex: 1,
  },
  jobProgressStartButton: {
    shadowOpacity: 0.18,
    shadowRadius: 24,
  },
  jobProgressValue: {
    fontSize: 34,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 40,
    marginTop: 7,
  },
  liveAlertTime: {
    fontSize: 38,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 44,
    marginTop: 2,
    textAlign: 'center',
  },
  stageMediaEmpty: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 64,
    position: 'relative',
    zIndex: 1,
  },
  stageMediaStrip: {
    flexDirection: 'row',
    gap: 7,
    position: 'relative',
    zIndex: 1,
  },
  stageMediaTag: {
    backgroundColor: 'rgba(7,26,36,0.62)',
    borderRadius: 999,
    bottom: 6,
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '600',
    left: 7,
    lineHeight: 12,
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 3,
    position: 'absolute',
  },
  stageMediaThumb: {
    backgroundColor: '#254B52',
    borderColor: 'rgba(255,255,255,0.76)',
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    height: 68,
    minWidth: 0,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#085F57',
    shadowOffset: { height: 7, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
  },
  stageMediaThumbGlow: {
    backgroundColor: '#28C9B5',
    borderRadius: 22,
    height: 36,
    left: 22,
    opacity: 0.62,
    position: 'absolute',
    top: 15,
    transform: [{ rotate: '45deg' }],
    width: 36,
  },
  stageProgressBar: {
    backgroundColor: 'rgba(208,228,224,0.56)',
    borderRadius: 7,
    height: 8,
    marginTop: 11,
    overflow: 'hidden',
    position: 'relative',
    zIndex: 1,
  },
  stageProgressFill: {
    backgroundColor: '#24B3A1',
    borderRadius: 7,
    height: '100%',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
  },
  stageProgressFillHighlight: {
    backgroundColor: 'rgba(255,255,255,0.42)',
    borderRadius: 7,
    height: 2,
    left: 2,
    position: 'absolute',
    right: 2,
    top: 1,
  },
  stageProgressSheen: {
    backgroundColor: 'rgba(18,188,168,0.28)',
    borderRadius: 7,
    height: '100%',
    position: 'absolute',
    top: 0,
    width: 96,
    zIndex: 1,
  },
  stageProgressTrackAura: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(93,228,211,0.12)',
  },
  successEmblem: {
    alignItems: 'center',
    backgroundColor: 'rgba(203,248,238,0.88)',
    borderRadius: 34,
    height: 104,
    justifyContent: 'center',
    marginBottom: 10,
    marginTop: 2,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#088779',
    shadowOffset: { height: 22, width: 0 },
    shadowOpacity: 0.24,
    shadowRadius: 44,
    width: 104,
    zIndex: 1,
  },
  successEmblemCore: {
    alignItems: 'center',
    borderRadius: 23,
    borderWidth: 3,
    height: 63,
    justifyContent: 'center',
    shadowColor: '#088779',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    width: 63,
    zIndex: 1,
  },
  successEmblemAura: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  successEmblemPending: {
    backgroundColor: 'rgba(238,251,247,0.90)',
    shadowOpacity: 0.18,
  },
  successEmblemText: {
    fontSize: 34,
    fontWeight: '600',
    lineHeight: 39,
  },
  caseRecommendationCard: {
    gap: 12,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#088779',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
  },
  caseUnderstandingCard: {
    gap: 10,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#088779',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
  },
  caseUnderstandingStrong: {
    fontWeight: '600',
  },
  caseUnderstandingText: {
    fontSize: 19,
    fontWeight: '600',
    lineHeight: 25,
  },
  caseWorkCardAura: {
    bottom: -28,
    left: -24,
    position: 'absolute',
    right: -24,
    top: -20,
    zIndex: 0,
  },
  caseWideMintAura: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 0,
  },
  caseWorkActionButtonAura: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  caseWorkDataSourceText: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    position: 'relative',
    textAlign: 'center',
    zIndex: 1,
  },
  caseWorkLockedActionButton: {
    flex: 1,
    minWidth: 0,
  },
  caseWorkLockedActions: {
    flexDirection: 'row',
    gap: 10,
    position: 'relative',
    zIndex: 1,
  },
  caseWorkSourceChip: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 78,
    overflow: 'hidden',
    paddingHorizontal: 14,
    position: 'relative',
  },
  caseWorkSourceChipAura: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  caseWorkSourceChipText: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
    position: 'relative',
    textAlign: 'center',
    zIndex: 1,
  },
  confidenceLabel: {
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
    textAlign: 'center',
  },
  confidenceRing: {
    alignItems: 'center',
    borderRadius: 36,
    borderWidth: 1,
    height: 72,
    justifyContent: 'center',
    paddingHorizontal: 8,
    width: 72,
  },
  confidenceValue: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 19,
    textAlign: 'center',
  },
  eyebrowDot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  eyebrowPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  eyebrowMotionWrap: {
    alignSelf: 'flex-start',
  },
  eyebrowPillText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  eyebrowPillTextPreserve: {
    textTransform: 'none',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: -4,
  },
  heroChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  infoNotice: {
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  infoNoticeBody: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  infoNoticeIcon: {
    minHeight: 58,
    minWidth: 58,
  },
  infoNoticeTitle: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
  modeButton: {
    alignItems: 'center',
    borderRadius: 18,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  modeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  modeSwitch: {
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    padding: 5,
  },
  profileAgenticCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 13,
    minHeight: 92,
  },
  profileAgenticChevron: {
    fontSize: 26,
    fontWeight: '600',
    lineHeight: 28,
  },
  profileAgenticIcon: {
    minHeight: 82,
    minWidth: 82,
  },
  profileAuraCard: {
    gap: 0,
    overflow: 'hidden',
    position: 'relative',
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.10,
    shadowRadius: 28,
  },
  profileAuraContent: {
    position: 'relative',
    zIndex: 1,
  },
  prepCard: {
    gap: 8,
  },
  prepLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
  },
  prepRow: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 50,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  prepState: {
    alignItems: 'center',
    borderRadius: 13,
    borderWidth: 1,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  prepStateText: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
  },
  prepValue: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
    maxWidth: 76,
    textAlign: 'right',
  },
  profileAvatarDot: {
    backgroundColor: '#30D27B',
    borderColor: '#FFFFFF',
    borderRadius: 5,
    borderWidth: 2,
    bottom: -1,
    height: 10,
    position: 'absolute',
    right: -1,
    width: 10,
  },
  profileAvatarGradientLayer: {
    borderRadius: 28,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
  },
  profileAvatarLarge: {
    alignItems: 'center',
    backgroundColor: '#24B3A1',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 28,
    borderWidth: 2,
    height: 74,
    justifyContent: 'center',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 9, width: 0 },
    shadowOpacity: 0.23,
    shadowRadius: 22,
    width: 74,
  },
  profileAvatarText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    position: 'relative',
    zIndex: 1,
  },
  profileDetailHero: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
  },
  profileDetailTitle: {
    fontSize: 25,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 31,
    marginTop: 9,
  },
  profileHeroLarge: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    minHeight: 132,
  },
  profileMintChip: {
    backgroundColor: 'rgba(224,252,245,0.88)',
    borderColor: 'rgba(85,214,195,0.42)',
    position: 'relative',
    zIndex: 1,
  },
  profileMintChipFrame: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 7, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
  },
  profileMintChipText: {
    color: '#088779',
    fontWeight: '700',
  },
  profileNameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  profileOverviewAgenticCard: {
    borderColor: 'rgba(74,218,197,0.48)',
    borderRadius: 25,
    shadowColor: '#24B3A1',
    shadowOffset: { height: 16, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 34,
  },
  profileOverviewHeroCard: {
    borderColor: 'rgba(255,255,255,0.96)',
    borderRadius: 30,
    shadowColor: '#24B3A1',
    shadowOffset: { height: 22, width: 0 },
    shadowOpacity: 0.13,
    shadowRadius: 44,
  },
  profileOverviewProtectionCard: {
    borderColor: 'rgba(113,225,209,0.46)',
    borderRadius: 26,
    shadowColor: '#24B3A1',
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 38,
  },
  profileProgressFill: {
    backgroundColor: '#24B3A1',
    overflow: 'hidden',
    shadowColor: '#088779',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
  },
  profileProgressSheen: {
    backgroundColor: 'rgba(255,255,255,0.70)',
    borderRadius: 999,
    bottom: -3,
    position: 'absolute',
    top: -3,
    width: 54,
  },
  profileOverviewActionStack: {
    gap: 12,
    marginTop: 18,
  },
  profileRankingEntryCard: {
    borderColor: 'rgba(74,218,197,0.48)',
    borderRadius: 28,
    shadowColor: '#24B3A1',
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 38,
  },
  profileRankingEntryContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    minHeight: 128,
  },
  profileRankingEntryIcon: {
    flexShrink: 0,
    minHeight: 82,
    minWidth: 82,
  },
  profileRankingEntryTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  profileRankingEntryMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    marginTop: 6,
  },
  profileRankingEntryMeta: {
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  profileRankingEntryChevron: {
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 24,
  },
  profileAuraButton: {
    backgroundColor: 'rgba(248,255,253,0.92)',
    borderColor: 'rgba(45,211,193,0.38)',
    overflow: 'hidden',
    shadowColor: '#088779',
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
  },
  profileRankingCta: {},
  profileLogoutCta: {},
  profileShortcutRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  profileInsightIcon: {
    minHeight: 68,
    minWidth: 68,
  },
  profileInsightChip: {
    backgroundColor: 'rgba(224,252,245,0.88)',
    borderColor: 'rgba(85,214,195,0.40)',
    minWidth: 68,
    position: 'relative',
    zIndex: 1,
  },
  profileInsightEmptyChip: {
    backgroundColor: 'rgba(236,253,248,0.84)',
    borderColor: 'rgba(85,214,195,0.34)',
    minWidth: 68,
    position: 'relative',
    zIndex: 1,
  },
  profileInsightEmptyChipText: {
    color: '#0B8579',
    fontWeight: '700',
  },
  profileInsightChipFrame: {
    alignSelf: 'center',
    borderRadius: 999,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 7, width: 0 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
  },
  profileInsightRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 86,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  profileInsightTitle: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 21,
  },
  profileKaelNote: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  profileLiquidScore: {
    alignItems: 'center',
    flexShrink: 0,
    justifyContent: 'center',
    position: 'relative',
  },
  profileLiquidScoreLarge: {
    alignSelf: 'center',
  },
  profileListCard: {
    padding: 10,
  },
  profileListContent: {
    gap: 0,
  },
  profileSettingsListContent: {
    gap: 8,
  },
  profileSettingsActionRow: {
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 82,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 10,
    position: 'relative',
  },
  profileSettingsActionIcon: {
    flexShrink: 0,
    minHeight: 68,
    minWidth: 68,
  },
  profileSettingsPasswordForm: {
    gap: 10,
    paddingHorizontal: 2,
    paddingTop: 6,
  },
  profileListDivider: {
    height: 1,
    marginHorizontal: 14,
    opacity: 0.78,
  },
  profileMoneyBody: {
    fontSize: 16,
    lineHeight: 23,
    maxWidth: 292,
    textAlign: 'center',
  },
  profileMoneyHero: {
    alignItems: 'center',
    gap: 12,
    minHeight: 318,
    justifyContent: 'center',
  },
  profileMoneyKicker: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'center',
  },
  profileProtectedJob: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  profileRankProcess: {
    borderRadius: 21,
    borderWidth: 1,
    marginTop: 10,
    minHeight: 58,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 10,
    position: 'relative',
    shadowColor: '#088779',
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 28,
  },
  profileRankProcessContent: {
    gap: 7,
    position: 'relative',
    zIndex: 1,
  },
  profileRankProcessLabel: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  profileRankProcessValue: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
    textAlign: 'right',
  },
  profileRankingEvaluationCard: {
    borderColor: 'rgba(113,225,209,0.46)',
    borderRadius: 25,
    marginTop: 10,
    shadowColor: '#24B3A1',
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.10,
    shadowRadius: 30,
  },
  profileRankingEvaluationChips: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 9,
  },
  profileRankingEvaluationContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  profileRankingEvidenceChip: {
    alignItems: 'center',
    borderColor: 'rgba(85,214,195,0.34)',
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    minHeight: 48,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 7,
    position: 'relative',
  },
  profileRankingEvidenceLabel: {
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
    position: 'relative',
    textAlign: 'center',
    zIndex: 1,
  },
  profileRankingEvidenceValue: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 1,
    position: 'relative',
    textAlign: 'center',
    zIndex: 1,
  },
  profileRankingEmptyChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(236,253,248,0.78)',
    borderColor: 'rgba(85,214,195,0.34)',
    minWidth: 82,
    position: 'relative',
    zIndex: 1,
  },
  profileRankingEmptyChipText: {
    color: '#0B8579',
    fontWeight: '700',
  },
  profileRankingHeroCard: {
    borderColor: 'rgba(113,225,209,0.50)',
    borderRadius: 28,
    shadowColor: '#24B3A1',
    shadowOffset: { height: 20, width: 0 },
    shadowOpacity: 0.13,
    shadowRadius: 42,
  },
  profileRankingHero: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    minHeight: 176,
  },
  profileRankingStatusChipFrame: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    marginBottom: 2,
    maxWidth: 190,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#24B3A1',
    shadowOffset: { height: 7, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
  },
  profileScoreLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    lineHeight: 11,
    maxWidth: 82,
    textAlign: 'center',
  },
  profileScoreLabelLarge: {
    fontSize: 10.5,
    lineHeight: 12,
    maxWidth: 86,
  },
  profileScoreMeta: {
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 82,
  },
  profileScoreMetaLarge: {
    maxWidth: 88,
  },
  profileScoreSubLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    lineHeight: 11,
    maxWidth: 82,
    textAlign: 'center',
  },
  profileScoreSubLabelLarge: {
    fontSize: 10.5,
    lineHeight: 12,
    maxWidth: 88,
  },
  profileScoreLens: {
    borderRadius: 999,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'absolute',
    shadowColor: '#04665B',
    shadowOffset: { height: 9, width: 0 },
    shadowOpacity: 0.09,
    shadowRadius: 24,
    zIndex: 1,
  },
  profileScoreValue: {
    fontSize: 30,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 34,
  },
  profileScoreValueLarge: {
    fontSize: 38,
    lineHeight: 42,
  },
  progressLine: {
    flex: 1,
    borderRadius: 2,
    height: 2,
  },
  progressNode: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    height: 23,
    justifyContent: 'center',
    width: 23,
  },
  progressNodeActive: {
    shadowColor: '#24B3A1',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 7,
  },
  progressNodeText: {
    fontSize: 9,
    fontWeight: '600',
    lineHeight: 12,
  },
  progressRail: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    marginTop: 2,
    position: 'relative',
    width: '100%',
    zIndex: 1,
  },
  protectionBar: {
    borderRadius: 999,
    height: 8,
    marginTop: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  protectionBarFill: {
    borderRadius: 999,
    height: '100%',
  },
  protectionCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
  },
  protectionIcon: {
    minHeight: 82,
    minWidth: 82,
  },
  protectionScore: {
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 27,
  },
  quickMetric: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    flexBasis: '30%',
    flexGrow: 1,
    minHeight: 88,
    overflow: 'hidden',
    padding: 12,
    position: 'relative',
    shadowColor: '#088779',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
  },
  quickMetricLabel: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    marginTop: 4,
    textAlign: 'center',
  },
  quickMetricValue: {
    fontSize: 23,
    fontWeight: '600',
    lineHeight: 28,
    textAlign: 'center',
  },
  quickMetricValueCompact: {
    fontSize: 18,
    lineHeight: 22,
  },
  rankNode: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    minHeight: 62,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 9,
    position: 'relative',
  },
  rankNodeActive: {
    shadowColor: '#088779',
    shadowOffset: { height: 13, width: 0 },
    shadowOpacity: 0.13,
    shadowRadius: 26,
  },
  rankNodeContent: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 1,
  },
  rankNodeLabel: {
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
    marginTop: 2,
    textAlign: 'center',
  },
  rankNodeValue: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 22,
  },
  rankNodeRest: {
    shadowColor: '#056459',
    shadowOffset: { height: 7, width: 0 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
  },
  rankRail: {
    flexDirection: 'row',
    gap: 7,
  },
  rowBetween: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  searchShell: {
    alignItems: 'center',
    borderRadius: 23,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 54,
    paddingHorizontal: 14,
  },
  searchText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    minHeight: 34,
    paddingVertical: 0,
  },
  sectionActionButton: {
    alignItems: 'flex-end',
    maxWidth: 112,
    minWidth: 0,
    paddingHorizontal: 2,
    paddingVertical: 4,
    position: 'absolute',
    right: 0,
    top: -1,
    width: 112,
  },
  sectionActionHeader: {
    marginTop: 24,
    minHeight: 29,
    position: 'relative',
  },
  sectionActionHeaderWithAction: {
    paddingRight: 116,
  },
  sectionActionTitle: {
    minWidth: 0,
    width: '100%',
  },
  sectionActionText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
  },
  selectedServiceCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  stepBadge: {
    fontSize: 10.5,
    fontWeight: '600',
    lineHeight: 15,
  },
  stepCard: {
    gap: 12,
    minHeight: 88,
  },
  stepLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    lineHeight: 15,
  },
  stage21Logo: {
    alignItems: 'center',
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  stage21LogoMedia: {
    height: 54,
    width: 54,
  },
  topActionText: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 22,
  },
  zipMintAura: {
    height: 180,
    position: 'absolute',
    right: -84,
    top: -96,
    width: 220,
    zIndex: 0,
  },
  topAvatarDot: {
    backgroundColor: '#30D27B',
    borderColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 2,
    bottom: -1,
    height: 16,
    position: 'absolute',
    right: -1,
    width: 16,
  },
  topAvatarImage: {
    height: 44,
    width: 44,
  },
  topAvatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  topAvatarWrap: {
    alignItems: 'center',
    backgroundColor: '#24B3A1',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 20,
    borderWidth: 2,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 58,
  },
  topControl: {
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  topControlIcon: {
    flexShrink: 0,
  },
  topControlText: {
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 30,
  },
  topCopy: {
    alignItems: 'flex-start',
    minWidth: 0,
  },
  topSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    textAlign: 'left',
  },
  topTitle: {
    fontSize: 27,
    fontWeight: '600',
    includeFontPadding: true,
    letterSpacing: 0,
    lineHeight: 34,
    minHeight: 36,
    textAlign: 'left',
  },
})
