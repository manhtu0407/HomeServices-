import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
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
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  inferLocalDealDraftFromKael,
  LOCAL_DEAL_ID,
  PROBLEM_CHIPS,
  SERVICE_TYPES,
  extractKnownDistrictLabel,
  type LocalDeal,
  type LocalDealStatus,
  type CustomerKaelMemoryPreferenceKey,
  type ServiceType,
} from '@nestscout/shared'
import { KaelButton, KaelChip, KaelTextInput } from '@/components/ui/kael-primitives'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { motionDuration, motionTokens } from '@/components/ui/motion-tokens'
import { generateClientRequestId } from '@/lib/client-request-id'
import { setAppLanguage, useAppLanguage, type AppLanguage } from '@/lib/app-language'
import { useAuth } from '@/lib/auth-provider'
import { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
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
import {
  AgenticCasePriorityCardPanel,
} from './agentic-case-surfaces'
import {
  CaseWideMintAura,
  CaseWorkCardAura,
  HomeHeroSourceAura,
  SourceCardSkin,
  ZipMintAura,
} from './aura-surfaces'
import { AgenticEvidenceGateView } from './agentic-evidence-stateful-surfaces'
import { AgenticMemoryStageView } from './agentic-memory-stateful-surfaces'
import { CustomerAgenticCenterSurfaceView } from './agentic-center-stateful-surfaces'
import { AgenticApprovalQueuePanel, AgenticArtifactTile, AgenticChatFact, AgenticCommandCaseCardPanel, AgenticCommandTimelinePanel, AgenticHomeBackdropAura, AgenticMetricTile, AgenticProcessedApprovalRow, AgenticStageBackdropAura, AgenticStageHero, AgenticUtilityStackPanel, AgenticWorkLogCardPanel } from './agentic-surfaces'
import { customerV21Assets, customerV21BankAssets, customerV21ServiceAssets, type CustomerV21BankKey } from './assets'
import { CustomerBookingEntryView, CustomerBookingGuestGateView } from './booking-entry-stateful-surfaces'
import { PrepRow } from './booking-surfaces'
import { buildBookingSearchSuggestions, normalizeBookingSearchText, type BookingSearchSuggestion } from './booking-search-display-model'
import {
  bookingScheduleDateParam,
  bookingScheduleLabel,
  bookingScheduleTimeParam,
  bookingTimeSlots,
  buildBookingDraftMessage,
  buildBookingScheduleDateOptions,
} from './booking-intake-display-model'
import {
  agenticDealProblemLabel,
  approvalConfidenceLabel,
  buildAgenticCaseThreadModel,
  caseAddressLabel,
  caseDisplayCode,
  caseEtaTimelineRows,
  caseJobProgressSteps,
  caseScopeRowsForDeal,
  caseSecondaryOptionsForDeal,
  caseThreadLiveSignal,
  currentScopeLabel,
  formatDurationShort,
  formatEvidenceFileCount,
  formatNumber,
  formatShortClockTime,
  formatVnd,
  isArrivalConfirmedStatus,
  isPaymentProtectedStatus,
  isPendingCustomerScopeChange,
  isWorkStartedStatus,
  normalizeKaelRoutingText,
  paymentAmountLabel,
  paymentProviderLabel,
  paymentStatusLabel,
  scopeChangeAmountLabel,
  scopeChangeApproveLabel,
  timeChoiceLabel,
  workProgressPercent,
} from './case-work-display-model'
import {
  activityStatusPrimary,
  activityStatusRows,
  caseReferenceRows,
  caseScreenAsset,
  caseScreenSummary,
  complexitySafetyLabel,
  formatKnownCount,
  screenIdsForStatus,
  stepForStatus,
} from './case-stage-display-model'
import { caseWorkDataSourceFooterLabel } from './case-source-display-model'
import {
  agenticEstimatePriceExplanation,
  agenticEstimateProblemLabel,
  agenticEstimateSourceExplanation,
  formatPriceRange,
} from './agentic-estimate-display-model'
import {
  agenticBooleanFromMemory,
  agenticCommandStep,
  agenticMemoryItemCount,
  agenticMemoryRowsFromUnknown,
  agenticProcessedApprovalRows,
  memoryPreferenceActionSucceeded,
  memoryPreferenceSyncFailureLabel,
  totalDealEvidenceCount,
  type AgenticMemoryRowModel,
  type AgenticProcessedApprovalRowModel,
  type MemoryPreferenceActionResult,
} from './agentic-memory-display-model'
import { MediaIntakeView } from './booking-media-surfaces'
import { ChatBubble } from './chat-surfaces'
import { AgenticCaseThreadPanel } from './chat-case-thread-stateful-surfaces'
import { AgenticChatEstimateCard, ChatEvidenceStrip, KaelChatSurfaceView } from './chat-stateful-surfaces'
import { CustomerV21DockOverlayView } from './dock-stateful-surfaces'
import { buildKaelProcessSequence, type KaelProcessLine, type KaelProcessScenarioId } from './kael-process-lines'
import {
  customerV21CommonCopy,
  customerV21ScreenTitles,
  customerV21ServiceCopy,
  customerV21StatusCopy,
  customerV21TabCopy,
} from './copy'
import { CaseDecisionPanelView, CasePrimaryInfoPanel, CaseProgressLabels, CaseUnderstandingPanel } from './history-case-surfaces'
import { CaseMatchingStageView, CaseOptionsStageView, CaseQuotesStageView } from './history-stage-stateful-surfaces'
import { ActiveCaseCardPanel, ActivityStatusPanelView, CaseOverviewPanel, CaseWorkDataSourceFooter, CaseWorkPanelView, CaseWorkSourceChip } from './history-active-surfaces'
import { CaseJobAcceptedStageView, CaseJobProgressStageView, CaseLiveAlertStageView, CaseLocationEtaStageView } from './history-fulfillment-stateful-surfaces'
import { CustomerHistorySurfaceView } from './history-surface-stateful-surfaces'
import { ArrivalCodeBox, CaseArtifact, CaseFactGrid, CaseFulfillmentStep, CaseMapCanvas, CaseMapPin, CaseMapPreview, CaseMetric, CaseMiniStat, CaseOptionChoiceCard, CaseOverviewLiquidScore, CaseScopeStepRow, CaseStageMediaStrip, CaseSuccessEmblem, CaseTimelineItem, CaseWorkerAvatar, CustomerStatusPill, FulfillmentInfoRow, MatchingKaelStatusIcon, MediaRow, QuotePriceLine } from './history-surfaces'
import { PaymentMethodStagePanel } from './payment-surfaces'
import { PaymentProtectedStageView, PaymentReviewStageView } from './payment-stage-stateful-surfaces'
import { CustomerProfileOverviewView, CustomerProfileSubscreenView } from './profile-stateful-surfaces'
import { ProfileCompactMintAura } from './profile-metrics-surfaces'
import { ProfileAuraCard, ProfileInsightRow, ProfileMemoryPanel, ProfileMoneyPanel, ProfileRankingPanel, SettingsActionRow } from './profile-utility-surfaces'
import { ProfileUtilityAddressView, ProfileUtilityPaymentView, ProfileUtilitySettingsView } from './profile-utility-stateful-surfaces'
import {
  agenticScreenParam,
  fairPriceStatusLabel,
  formatWorkerJobs,
  homeGreeting,
  initialsForName,
  insightNumber,
  memberSinceLabel,
  percentFromConfidenceLabel,
  profileName,
  profilePanelForScreen,
  profilePanelParam,
  profileRankStatus,
  profileScreenParam,
  profileStageSubtitle,
  profileUtilityParam,
  profileUtilitySubtitle,
  profileUtilityTitle,
  protectedTransactionLabel,
  rankLabel,
  servicePreferenceLabel,
  type CustomerProfilePanel,
  type CustomerProfileUtility,
} from './profile-display-model'
import { AssetTile, EmptyState, EyebrowPill, InactiveAgenticGate, InfoNotice, MatchingHandoffChip, SectionActionHeader, SectionHeader, ServiceTile, V21Card, V21Screen, V21TopBar } from './shared-surfaces'
import { customerV21AgenticStyles as agenticStyles } from './agentic-styles'
import { customerV21BookingStyles as bookingStyles } from './booking-styles'
import { customerV21ChatStyles as chatStyles } from './chat-styles'
import {
  CUSTOMER_LIQUID_NAV_DOCK_HEIGHT,
  CUSTOMER_LIQUID_NAV_GAP,
  CUSTOMER_LIQUID_NAV_MAX_WIDTH,
  CUSTOMER_LIQUID_NAV_ORB_SIZE,
  CUSTOMER_LIQUID_NAV_RAIL_PADDING,
  CUSTOMER_LIQUID_NAV_SIDE_INSET,
  customerV21DockStyles as dockStyles,
} from './dock-styles'
import { customerV21HistoryActiveStyles as historyActiveStyles } from './history-active-styles'
import { customerV21PaymentStyles as paymentStyles } from './payment-styles'
import {
  maskBankAccountNumber,
  normalizeBankAccountNumber,
  paymentBankKeyFromUnknown,
  paymentBankOptions,
} from './payment-bank-display-model'
import { customerV21ProfileUtilityStyles as profileUtilityStyles } from './profile-utility-styles'
import { customerV21SharedStyles as sharedStyles } from './shared-styles'
import { type CustomerDockActive, type CustomerKaelMode, type CustomerPrimaryTab, type CustomerV21ScreenId } from './types'
import {
  activityScreenParam,
  caseScreenIds,
  chatScreenModeParam,
  firstParam,
  serviceParam,
  servicesScreenParam,
} from './route-params'
import { isScriptedKaelAcknowledgementTurn, totalMediaRefs } from './kael-chat-turn-display-model'
import { stringArrayFromUnknown, stringFromUnknown } from './value-display-model'

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

const caseWorkScreenIds: CustomerV21ScreenId[] = ['2.5-chat-case', '2.6-case-overview', '2.7-matching', '2.8-options', '2.9-quotes']
const paymentScreenIds: CustomerV21ScreenId[] = ['3.1-payment-review', '3.2-payment-method', '3.3-payment-protected']
const chatCompressedActivityScreenIds = new Set<CustomerV21ScreenId>(['2.6-case-overview', '2.7-matching', '2.8-options', '2.9-quotes', '2.10-location-eta', '2.11-live-alert', '2.12-job-accepted', '2.13-job-progress'])
const completionScreenIds: CustomerV21ScreenId[] = ['2.13-job-progress']
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
const bookingScheduleRuntimeRefreshMs = 30_000
const bookingAddressLookupDelayMs = 260
const bookingSearchInputTextColor = '#071A24'
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

type V21Theme = CustomerThemeTokens

type KaelProcessLineRuntime = {
  activeIndex: number | null
  collapse: string | null
  lines: KaelProcessLine[]
  prompt: string
  scenarioId: KaelProcessScenarioId
  visibleCount: number
}

function useV21Theme() {
  const mode = useCustomerThemeMode()
  const glass = useGlassAccessibility()
  const baseTokens = getCustomerThemeTokens(mode)
  const tokens = glass.reduceTransparency ? getReducedTransparencyCustomerTokens(baseTokens) : baseTokens
  return { ...glass, mode, tokens }
}

function CaseChatSummary({ deal }: { deal: LocalDeal }) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const service = deal.draft.serviceType ? customerV21ServiceCopy[language][deal.draft.serviceType].label : copy.dataPending
  const problem = agenticDealProblemLabel(deal, language)
  const address = deal.draft.addressLabel || deal.draft.districtLabel || copy.dataPending
  return (
    <V21Card style={historyActiveStyles.caseChatSummaryCard} testID="customer-v21-case-overview">
      <SourceCardSkin />
      <CaseWorkCardAura scope="Summary" />
      <View style={historyActiveStyles.caseChatSummaryHeader}>
        <KaelChip label={caseDisplayCode(deal, language)} variant="selected" />
        <CustomerStatusPill label={customerV21StatusCopy[language][deal.status]} tokens={tokens} />
      </View>
      <View style={historyActiveStyles.caseChatSummaryBody}>
        <AssetTile image={customerV21Assets.request} label={service} size={48} style={historyActiveStyles.caseChatSummaryIcon} />
        <View style={styles.flex}>
          <Text numberOfLines={1} style={[historyActiveStyles.caseChatSummaryTitle, { color: tokens.text }]}>{service}</Text>
          <Text numberOfLines={1} style={[historyActiveStyles.caseChatSummaryText, { color: tokens.muted }]}>{problem}</Text>
          <Text numberOfLines={1} style={[historyActiveStyles.caseChatSummaryText, { color: tokens.muted }]}>{address}</Text>
        </View>
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
    <View style={[sharedStyles.protectionBar, { backgroundColor: tokens.border }]} testID={testID}>
      <Animated.View style={[sharedStyles.protectionBarFill, profileUtilityStyles.profileProgressFill, fillStyle]} testID={testID ? `${testID}-fill` : undefined}>
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
        <Animated.View pointerEvents="none" style={[profileUtilityStyles.profileProgressSheen, sheenStyle]} testID={testID ? `${testID}-sheen` : undefined} />
      ) : null}
    </View>
  )
}

function ProfileRankProcess({ label, percent, value }: { label: string; percent: number; value: string }) {
  const { reduceTransparency, tokens } = useV21Theme()
  return (
    <View
      style={[
        profileUtilityStyles.profileRankProcess,
        {
          backgroundColor: tokens.mode === 'dark' ? tokens.raised : 'rgba(255,255,255,0.81)',
          borderColor: tokens.mode === 'dark' ? tokens.border : 'rgba(113,225,209,0.44)',
        },
      ]}
      testID="customer-v21-profile-rank-process"
    >
      <SourceCardSkin />
      <CaseWideMintAura scope="ProfileRankProcess" />
      <ProfileCompactMintAura reduceTransparency={reduceTransparency} scope="ProfileRankProcessFine" />
      <ZipMintAura scope="ProfileRankProcessZip" />
      <View style={profileUtilityStyles.profileRankProcessContent}>
        <View style={sharedStyles.rowBetween}>
          <Text numberOfLines={1} style={[profileUtilityStyles.profileRankProcessLabel, { color: tokens.text }]}>{label}</Text>
          <Text numberOfLines={1} style={[profileUtilityStyles.profileRankProcessValue, { color: tokens.primary }]}>{value}</Text>
        </View>
        <ProfileProgressBar percent={percent} testID="customer-v21-profile-rank-process-progress" />
      </View>
    </View>
  )
}

export function CustomerHomeSurface() {
  const language = useAppLanguage()
  const router = useRouter()
  const workflow = useFrontendWorkflow()
  const { session } = useAuth()
  const { reduceTransparency, tokens } = useV21Theme()
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

      <View style={sharedStyles.homeAuraFrame}>
      <V21Card
        glass
        style={[
          sharedStyles.homeHero,
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
        <HomeHeroSourceAura reduceTransparency={reduceTransparency} />
        <View style={sharedStyles.heroCopy}>
          <Text style={[sharedStyles.heroTitle, sharedStyles.homeHeroTitle, { color: tokens.text }]}>
            {language === 'vi' ? 'Kael sẵn sàng hỗ trợ, công việc vẫn do bạn kiểm soát.' : 'Kael is ready to help while you keep work control.'}
          </Text>
        </View>
        <Image resizeMode="contain" source={customerV21Assets.kaelFull} style={sharedStyles.heroKael} />
      </V21Card>
      </View>

      <SectionActionHeader
        action={language === 'vi' ? 'Xem tất cả ›' : 'See all ›'}
        onAction={() => router.replace('/(customer)/booking' as never)}
        title={language === 'vi' ? 'Bạn cần gì hôm nay?' : 'What do you need today?'}
      />
      <View style={[sharedStyles.serviceGrid, sharedStyles.homeServiceGrid]}>
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
          assetTile={AssetTile}
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
  const { reduceTransparency, tokens } = useV21Theme()
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
        <CustomerBookingGuestGateView
          body={copy.guestBody}
          loginLabel={language === 'vi' ? 'Đăng nhập' : 'Sign in'}
          onLogin={() => router.replace('/(auth)/login' as never)}
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
      <CustomerBookingEntryView
        address={address}
        addressFallbackUsed={addressFallbackUsed}
        addressLookupOpen={addressLookupOpen}
        addressLookupPending={addressLookupPending}
        addressSuggestions={addressSuggestions}
        addressUsesMultiline={addressUsesMultiline}
        bookingSearchInputColor={bookingSearchInputTextColor}
        bookingSourceSearchShadowStyle={bookingSourceSearchWebShadow}
        chatPlaceholder={copy.chatPlaceholder}
        createDraftLabel={copy.createDraft}
        dataPendingLabel={copy.dataPending}
        description={description}
        error={error}
        hiddenTextInputScrollbarStyle={customerV21HiddenTextInputScrollbar}
        invisibleTextInputScrollbarStyle={customerV21InvisibleTextInputScrollbar}
        isMediaScreen={isMediaScreen}
        language={language}
        mediaPanelNode={(
          <MediaIntakePanel
            caseLabel={initialDeal ? caseDisplayCode(initialDeal, language) : (language === 'vi' ? 'Nháp' : 'Draft')}
            description={description}
            mediaCount={mediaCount}
            onVoiceSaved={(draft) => setVoiceDrafts((current) => mergeMediaDrafts(current, [draft], Math.max(1, 5 - mediaCount)))}
            onSubmit={submitDraft}
            problemChips={selectedProblems}
            voiceDrafts={voiceDrafts}
          />
        )}
        onAddressChange={updateAddress}
        onAddressFocus={() => setAddressLookupOpen(true)}
        onAddressSuggestionPress={selectAddressSuggestion}
        onBack={() => router.replace('/(customer)/home' as never)}
        onDescriptionChange={setDescription}
        onProblemToggle={toggleProblem}
        onResetSelectedService={() => {
          setSelectedService(null)
          setSelectedProblems([])
          router.replace('/(customer)/booking' as never)
        }}
        onScheduleDateSelect={setSelectedScheduleDate}
        onScheduleTimeSelect={setSelectedScheduleTime}
        onSearchQueryChange={setServiceSearchQuery}
        onSearchSuggestionPress={selectSearchSuggestion}
        onServiceSelect={(service) => {
          setSelectedService(service)
          setSelectedProblems([])
        }}
        onSubmit={submitDraft}
        problemOptions={problemOptions}
        reduceTransparency={reduceTransparency}
        rootStyles={styles}
        scheduleDateOptions={scheduleDateOptions}
        scheduleLabel={scheduleLabel}
        searchSuggestions={searchSuggestions}
        selectedProblems={selectedProblems}
        selectedScheduleDate={selectedScheduleDate}
        selectedScheduleTime={selectedScheduleTime}
        selectedService={selectedService}
        selectedServiceCopy={selectedServiceCopy}
        serviceSearchQuery={serviceSearchQuery}
        textInputNoOutlineStyle={customerV21WebTextInputNoOutline}
        timeSlots={bookingTimeSlots}
        tokens={tokens}
      />
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
  const { reduceTransparency, tokens } = useV21Theme()
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
    <MediaIntakeView
      caseLabel={cleanCaseLabel}
      description={description}
      doneText={doneText}
      emptyText={emptyText}
      hasAnyInput={hasAnyInput}
      hasDescription={hasDescription}
      hasProblems={hasProblems}
      isRecordingVoice={isRecordingVoice}
      language={language}
      mediaCount={mediaCount}
      mediaTitle={copy.mediaTitle}
      mediaValue={mediaValue}
      microNote={microNote}
      onSubmit={onSubmit}
      onVoicePress={() => void handleVoicePress()}
      problemChips={problemChips}
      recordingSeconds={recordingSeconds}
      reduceTransparency={reduceTransparency}
      runningText={runningText}
      tokens={tokens}
      totalFileCount={totalFileCount}
      totalFileValue={totalFileValue}
      voiceCount={voiceCount}
      voiceError={voiceError}
      voiceValue={voiceValue}
      waitingText={waitingText}
    />
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

  const bodyNode = deal ? (
    caseRouteRedirectRequested ? (
      <InactiveAgenticGate testID={`customer-v21-direct-empty-${activeScreen}`} />
    ) : caseOverviewActive ? (
      <CaseOverviewDirectScreen deal={deal} />
    ) : (
      <ActivityDirectScreen deal={deal} screenId={activeScreen} />
    )
  ) : (
    <InactiveAgenticGate testID={`customer-v21-direct-empty-${activeScreen}`} />
  )

  return (
    <CustomerHistorySurfaceView
      actionLabel="↗"
      activeScreen={activeScreen}
      bodyNode={bodyNode}
      modalNode={(
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
      )}
      onBack={() => router.replace('/(customer)/home' as never)}
      subtitle={subtitle}
      title={title}
    />
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
        <CustomerProfileSubscreenView
          actionLabel="i"
          body={<ProfileUtilitySection insights={insights} kind={directProfileUtility} />}
          onBack={() => router.replace('/(customer)/profile' as never)}
          subtitle={directProfileUtility === 'address' ? '' : profileUtilitySubtitle(directProfileUtility, language)}
          title={profileUtilityTitle(directProfileUtility, language)}
          titleStyle={directProfileUtility === 'address' ? profileUtilityStyles.profileAddressUtilityTitle : undefined}
        />
      </V21Screen>
    )
  }

  const profileScreenId: CustomerV21ScreenId =
    panel === 'ranking' ? '6.2-usage-ranking' : panel === 'money' ? '6.3-protect-money' : panel === 'memory' ? '5.4-memory' : '6.1-profile-overview'
  if (panel !== 'overview') {
    return (
      <V21Screen key={profileScreenId} screenId={profileScreenId} testID="customer-v21-profile">
        <CustomerProfileSubscreenView
          actionLabel="i"
          body={(
            <>
              {panel === 'ranking' ? <ProfileRanking insights={insights} /> : null}
              {panel === 'money' ? <ProfileMoney insights={insights} /> : null}
              {panel === 'memory' ? <ProfileMemory /> : null}
            </>
          )}
          onBack={() => {
            setPanel('overview')
            router.replace('/(customer)/profile' as never)
          }}
          subtitle={profileStageSubtitle(profileScreenId, language)}
          title={customerV21ScreenTitles[language][profileScreenId]}
        />
      </V21Screen>
    )
  }

  return (
    <V21Screen key={profileScreenId} screenId={profileScreenId} testID="customer-v21-profile">
      <CustomerProfileOverviewView
        activeLabel={activeLabel}
        agenticBody={language === 'vi'
          ? 'Trung tâm điều phối, hàng chờ duyệt và ghi nhớ theo dữ liệu thật.'
          : 'Command center, approval queue, and memory from real data.'}
        agenticCenterLabel={copy.agenticCenter}
        agenticChipLabel={language === 'vi' ? 'Tiện ích phụ' : 'Utility'}
        initials={initialsForName(name)}
        memberSince={memberSince}
        name={name}
        onOpenAgenticCenter={() => router.replace('/(customer)/profile?utility=agentic' as never)}
        onOpenRanking={() => openProfilePanel('ranking', '6.2-usage-ranking')}
        onSignOut={() => void signOut()}
        rankingAccessibilityLabel={language === 'vi' ? 'Xem xếp hạng sử dụng' : 'View usage ranking'}
        rankingBody={language === 'vi' ? 'Kael đánh giá từ dữ liệu sử dụng thật.' : 'Kael evaluates real usage data.'}
        rankingLabel={language === 'vi' ? 'Xếp hạng sử dụng' : 'Usage ranking'}
        rankingMetaLabel={usageRankPointsLabel}
        rankingProgressNode={<ProfileProgressBar percent={usageRankProgress} testID="customer-v21-profile-ranking-entry-progress" />}
        rankingStatus={usageRankStatus}
        rankingStatusActive={usageRank > 0}
        rankingStatusTextStyle={usageRank > 0 ? styles.profileMintChipText : profileUtilityStyles.profileRankingEmptyChipText}
        rootStyles={styles}
        signOutLabel={language === 'vi' ? 'Đăng xuất' : 'Sign out'}
        smartUtilitiesAction={language === 'vi' ? 'Mặc định có sẵn' : 'Available'}
        smartUtilitiesTitle={language === 'vi' ? 'Tiện ích thông minh' : 'Smart utilities'}
        tokens={tokens}
        topBarSubtitle={language === 'vi' ? 'Tài khoản, bảo vệ và các tiện ích phụ' : 'Account, protection, and utilities'}
        topBarTitle={language === 'vi' ? 'Hồ sơ khách hàng' : 'Customer profile'}
        utilitySectionAction={language === 'vi' ? 'Quản lý' : 'Manage'}
        utilitySectionTitle={language === 'vi' ? 'Tiện ích tài khoản' : 'Account utilities'}
        utilityTiles={[
          {
            image: customerV21Assets.address,
            label: language === 'vi' ? 'Địa chỉ' : 'Addresses',
            onPress: () => router.replace('/(customer)/profile?utility=address' as never),
            scope: 'Address',
            testID: 'customer-v21-profile-utility-address',
            value: insightNumber(insights, 'saved_address_count', copy.emptyProfileMetric, language, (value) => language === 'vi' ? `${value} địa điểm` : `${value} places`),
          },
          {
            image: customerV21Assets.payment,
            label: language === 'vi' ? 'Thanh toán' : 'Payment',
            onPress: () => router.replace('/(customer)/profile?utility=payment' as never),
            scope: 'Payment',
            testID: 'customer-v21-profile-utility-payment',
            value: bankOptionLabel,
          },
          {
            image: customerV21Assets.theme,
            label: language === 'vi' ? 'Cài đặt' : 'Settings',
            onPress: () => router.replace('/(customer)/profile?utility=settings' as never),
            scope: 'Settings',
            testID: 'customer-v21-profile-utility-settings',
            value: language === 'vi' ? 'Tài khoản' : 'Account',
          },
        ]}
        verified={Boolean(session)}
        verifiedProfileLabel={verifiedProfileLabel}
      />
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
  const processedApprovalRows = agenticProcessedApprovalRows(deal, language)
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

  const agenticScreenView = screenId === '5.2-command-center'
    ? {
      actionLabel: '✦',
      bodyNode: <AgenticCommandCenter deal={deal} onOpenCaseChat={openCaseChat} />,
      onBack: openAgenticHome,
      screenId: '5.2-command-center' as const,
      subtitle: deal ? caseDisplayCode(deal, language) : copy.dataPending,
      testID: 'customer-v21-agentic-command-center',
      title: customerV21ScreenTitles[language]['5.2-command-center'],
    }
    : screenId === '5.3-approval-queue'
      ? {
        actionLabel: 'i',
        bodyNode: redirectApprovalToCaseWork ? (
          <InactiveAgenticGate testID="customer-v21-agentic-approval-redirect" />
        ) : (
          <AgenticApprovalQueuePanel
            approvalSectionAction={deal ? caseDisplayCode(deal, language) : copy.dataPending}
            approvalSectionTitle={language === 'vi' ? 'Cần duyệt ngay' : 'Needs approval now'}
            heroBody={approvalCount > 0
              ? (language === 'vi' ? 'Có quyết định cần bạn duyệt trước khi Kael tiếp tục.' : 'A decision needs your approval before Kael continues.')
              : (language === 'vi' ? 'Không có quyết định chờ duyệt.' : 'No decision is waiting.')}
            heroTitle={language === 'vi' ? 'Duyệt đúng lúc, không bỏ lỡ công việc.' : 'Approve at the right time without missing the job.'}
            onApprove={approveScopeChange}
            onReject={rejectScopeChange}
            pendingApproval={pendingApproval ? {
              approveLabel: scopeChangeApproveLabel(pendingApproval, language),
              confidence: approvalConfidenceLabel(pendingApproval, deal, language),
              costChange: scopeChangeAmountLabel(pendingApproval, language),
              id: pendingApproval.id,
              reason: pendingApproval.reason ?? copy.dataPending,
              requestedDescription: pendingApproval.requestedDescription ?? copy.dataPending,
            } : null}
            processedRows={processedApprovalRows}
            processedSectionAction={language === 'vi' ? `${formatNumber(processedApprovalRows.filter((row) => row.available).length, language)} quyết định` : `${formatNumber(processedApprovalRows.filter((row) => row.available).length, language)} decisions`}
            processedSectionTitle={language === 'vi' ? 'Đã xử lý' : 'Processed'}
            screenTitle={customerV21ScreenTitles[language]['5.3-approval-queue']}
          />
        ),
        onBack: openAgenticHome,
        screenId: '5.3-approval-queue' as const,
        subtitle: language === 'vi' ? 'Quyết định ảnh hưởng giá, phạm vi hoặc hoàn tất' : 'Price, scope, or completion decisions',
        testID: 'customer-v21-agentic-approval-screen',
        title: customerV21ScreenTitles[language]['5.3-approval-queue'],
      }
      : screenId === '5.4-memory'
        ? {
          actionLabel: '⌁',
          bodyNode: <AgenticMemoryStage memory={workflow.customerKaelMemory} memoryRows={memoryRows} />,
          onBack: openAgenticHome,
          screenId: '5.4-memory' as const,
          subtitle: language === 'vi' ? 'Kiểm soát điều Kael nhớ và cách dùng trong công việc' : 'Control what Kael remembers and how it is used',
          testID: 'customer-v21-agentic-memory-screen',
          title: customerV21ScreenTitles[language]['5.4-memory'],
        }
        : {
          actionLabel: '⚙',
          bodyNode: (
            <AgenticHomeStage
              approvalCount={approvalCount}
              deal={deal}
              memoryCount={memoryCount}
              onOpenActivity={openActivity}
              onOpenCaseChat={openCaseChat}
            />
          ),
          onBack: openProfile,
          screenId: '5.1-agentic-home' as const,
          subtitle: language === 'vi' ? 'Tiện ích trong Hồ sơ · điều phối, không thay quyền quyết định' : 'Profile utility · coordination without replacing your authority',
          testID: 'customer-v21-agentic-center',
          title: copy.agenticCenter,
        }

  return <CustomerAgenticCenterSurfaceView {...agenticScreenView} />
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
  const { reduceTransparency, tokens } = useV21Theme()
  const hasDeal = Boolean(deal)

  return (
    <View style={agenticStyles.agenticHomeStack}>
      <AgenticHomeBackdropAura reduceTransparency={reduceTransparency} />
      <AgenticStageHero
        assetTile={AssetTile}
        body={hasDeal
          ? (language === 'vi' ? 'Một luồng dữ liệu, một vết duyệt, một trạng thái tiền.' : 'One data flow, one approval trail, one money state.')
          : (language === 'vi' ? 'Trung tâm sẽ nhận dữ liệu từ Kael Chat và quy trình Agentic.' : 'The center will receive data from Kael Chat and the Agentic workflow.')}
        image={customerV21Assets.kaelFull}
        imageKind="mascot"
        narrow
        scope="AgenticHomeHero"
        testID="customer-v21-agentic-home-hero"
        tokens={tokens}
        title={hasDeal
          ? (language === 'vi' ? 'Tôi đang làm việc trên công việc của bạn.' : 'I am working on your job.')
          : (language === 'vi' ? 'Kael sẵn sàng điều phối công việc.' : 'Kael is ready to coordinate work.')}
      />

      <View style={agenticStyles.agenticMetricRow}>
        <AgenticMetricTile caseWideMintAura={CaseWideMintAura} label={language === 'vi' ? 'Công việc đang chạy' : 'Active jobs'} sourceCardSkin={SourceCardSkin} testID="customer-v21-agentic-active" tokens={tokens} value={formatNumber(hasDeal ? 1 : 0, language)} zipMintAura={ZipMintAura} />
        <AgenticMetricTile caseWideMintAura={CaseWideMintAura} label={language === 'vi' ? 'Cần duyệt' : 'Needs approval'} sourceCardSkin={SourceCardSkin} testID="customer-v21-agentic-approvals" tokens={tokens} value={formatNumber(approvalCount, language)} zipMintAura={ZipMintAura} />
        <AgenticMetricTile caseWideMintAura={CaseWideMintAura} label={language === 'vi' ? 'Mục ghi nhớ' : 'Memory items'} sourceCardSkin={SourceCardSkin} testID="customer-v21-agentic-alerts" tokens={tokens} value={formatNumber(memoryCount, language)} zipMintAura={ZipMintAura} />
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
  const copy = customerV21CommonCopy[language]
  const service = deal.draft.serviceType ? customerV21ServiceCopy[language][deal.draft.serviceType].label : copy.dataPending
  const problem = agenticDealProblemLabel(deal, language)
  const subtitle = [caseDisplayCode(deal, language), problem].filter(Boolean).join(' · ')
  const latestApproval = deal.scopeChange?.requestedDescription ?? deal.scopeChange?.reason
  const statusLabel = customerV21StatusCopy[language][deal.status]
  const footerLabel = latestApproval
    ? (language === 'vi' ? `Duyệt gần nhất: ${latestApproval}` : `Latest approval: ${latestApproval}`)
    : statusLabel

  return (
    <AgenticCasePriorityCardPanel
      activeStep={stepForStatus(deal.status)}
      caseWorkLabel={copy.caseWork}
      footerLabel={footerLabel}
      onOpenActivity={onOpenActivity}
      onOpenCaseChat={onOpenCaseChat}
      service={service}
      serviceAsset={deal.draft.serviceType ? customerV21ServiceAssets[deal.draft.serviceType] : customerV21Assets.request}
      statusLabel={statusLabel}
      subtitle={subtitle}
    />
  )
}

function AgenticWorkLogCard({ deal }: { deal: LocalDeal | null }) {
  const language = useAppLanguage()
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

  return <AgenticWorkLogCardPanel rows={rows} />
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
  const { reduceTransparency, tokens } = useV21Theme()
  const pendingApproval = deal?.scopeChange && isPendingCustomerScopeChange(deal.scopeChange) ? deal.scopeChange : null
  const openApproval = () => {
    if (pendingApproval) {
      router.replace(customerCaseWorkRouteForDeal(deal, '&focus=approval') as never)
      return
    }
    router.replace('/(customer)/profile?screen=5.3-approval-queue' as never)
  }

  return (
    <View style={agenticStyles.agenticStageStack}>
      <AgenticStageBackdropAura reduceTransparency={reduceTransparency} scope="Command" />
      <AgenticCommandCaseCard deal={deal} />
      <SectionActionHeader action={language === 'vi' ? 'Nhật ký' : 'Live log'} title={language === 'vi' ? 'Điều Kael đang điều phối' : 'What Kael is coordinating'} />
      <AgenticCommandTimeline deal={deal} />
      <SectionActionHeader action={language === 'vi' ? 'Tất cả ›' : 'All ›'} title={language === 'vi' ? 'Tài liệu của công việc' : 'Work artifacts'} />
      <AgenticArtifactGrid deal={deal} />
      <View style={agenticStyles.agenticCommandActionRow}>
        <KaelButton
          disabled={!deal}
          label={language === 'vi' ? 'Trò chuyện xử lý công việc' : 'Work handling chat'}
          onPress={deal ? onOpenCaseChat : () => undefined}
          style={agenticStyles.agenticCommandButton}
          testID="customer-v21-agentic-open-case-chat"
          variant="secondary"
        />
        <KaelButton
          disabled={!pendingApproval}
          label={`${customerV21ScreenTitles[language]['5.3-approval-queue']} · ${deal?.scopeChange ? '1' : '0'}`}
          onPress={openApproval}
          style={agenticStyles.agenticCommandButton}
          testID="customer-v21-agentic-command-approval"
        />
      </View>
      <Text style={[agenticStyles.agenticAuthorityNote, { color: tokens.muted }]}>
        {language === 'vi'
          ? 'Kael điều phối và đề xuất; mọi hành động có thẩm quyền vẫn cần bạn hoặc quy trình thật.'
          : 'Kael coordinates and suggests; authority still requires you or the real workflow.'}
      </Text>
    </View>
  )
}

function AgenticCommandCaseCard({ deal }: { deal: LocalDeal | null }) {
  const language = useAppLanguage()
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
    <AgenticCommandCaseCardPanel
      activeStep={activeStep}
      amount={amount}
      detailLine={detailLine}
      hasDeal={hasDeal}
      service={service}
      statusLabel={deal ? customerV21StatusCopy[language][deal.status] : copy.dataPending}
      stepLabels={language === 'vi'
        ? ['Thu thập', 'Báo giá', 'Trả tiền', 'Ghép thợ', 'Làm việc']
        : ['Intake', 'Quote', 'Pay', 'Match', 'Work']}
    />
  )
}

function AgenticCommandTimeline({ deal }: { deal: LocalDeal | null }) {
  const language = useAppLanguage()
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

  return <AgenticCommandTimelinePanel rows={rows} />
}

function AgenticArtifactGrid({ deal }: { deal: LocalDeal | null }) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const quote = deal ? (deal.estimate?.priceRangeLabel || (deal.payment ? paymentAmountLabel(deal.payment, language, '0') : copy.dataPending)) : copy.dataPending
  const worker = deal?.workerProfile ? (language === 'vi' ? 'Thợ thật' : 'Real worker') : copy.dataPending
  const evidence = deal ? formatEvidenceFileCount(totalDealEvidenceCount(deal), language) : copy.dataPending

  return (
    <View style={agenticStyles.agenticArtifactGrid} testID="customer-v21-agentic-artifacts">
      <AgenticArtifactTile caseWideMintAura={CaseWideMintAura} label={language === 'vi' ? 'Báo giá' : 'Quote'} sourceCardSkin={SourceCardSkin} tokens={tokens} value={quote} zipMintAura={ZipMintAura} />
      <AgenticArtifactTile caseWideMintAura={CaseWideMintAura} label={language === 'vi' ? 'Thợ' : 'Worker'} sourceCardSkin={SourceCardSkin} tokens={tokens} value={worker} zipMintAura={ZipMintAura} />
      <AgenticArtifactTile caseWideMintAura={CaseWideMintAura} label={language === 'vi' ? 'Bằng chứng' : 'Evidence'} sourceCardSkin={SourceCardSkin} tokens={tokens} value={evidence} zipMintAura={ZipMintAura} />
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
  const { reduceTransparency, tokens } = useV21Theme()
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
    <AgenticMemoryStageView
      language={language}
      memoryCountLabel={formatNumber(visibleMemoryCount, language)}
      onSaveMemory={handleSaveMemory}
      onToggleMemoryPreference={(key, currentEnabled) => void handleToggleMemoryPreference(key, currentEnabled)}
      pendingPreferenceKey={pendingPreferenceKey}
      reduceTransparency={reduceTransparency}
      sharePreferencesEnabled={sharePreferencesEnabled}
      tokens={tokens}
      visibleMemoryRows={visibleMemoryRows}
    />
  )
}

function AgenticUtilityStack({ deal, memoryCount }: { deal: LocalDeal | null; memoryCount: number }) {
  const language = useAppLanguage()
  const router = useRouter()
  const copy = customerV21CommonCopy[language]
  const commandCenterLabel = language === 'vi' ? 'Trung tâm điều phối' : customerV21ScreenTitles[language]['5.2-command-center']
  return (
    <AgenticUtilityStackPanel
      cards={[
        {
          image: customerV21Assets.activity,
          label: commandCenterLabel,
          onPress: () => router.replace('/(customer)/profile?screen=5.2-command-center' as never),
          testID: 'customer-v21-agentic-card-5.2-command-center',
          value: deal ? `${caseDisplayCode(deal, language)} · ${customerV21StatusCopy[language][deal.status]}` : copy.dataPending,
        },
        {
          image: customerV21Assets.shield,
          label: customerV21ScreenTitles[language]['5.3-approval-queue'],
          onPress: () => router.replace('/(customer)/profile?screen=5.3-approval-queue' as never),
          testID: 'customer-v21-agentic-card-5.3-approval-queue',
          value: deal?.scopeChange ? (language === 'vi' ? '1 việc cần duyệt' : '1 approval') : '0',
        },
        {
          image: customerV21Assets.memory,
          label: customerV21ScreenTitles[language]['5.4-memory'],
          onPress: () => router.replace('/(customer)/profile?screen=5.4-memory' as never),
          testID: 'customer-v21-agentic-card-5.4-memory',
          value: formatNumber(memoryCount, language),
        },
      ]}
      sectionAction={language === 'vi' ? 'Tiện ích' : 'Utilities'}
      sectionTitle={language === 'vi' ? 'Màn hình điều phối' : 'Coordination screens'}
    />
  )
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
    <KaelChatSurfaceView
      agenticEstimateNode={agenticIntakeModeActive && chatEstimate && !processLines && !submittingAgenticRejectReason && !confirmingAgenticEstimate ? (
        <AgenticChatEstimateCard
          canConfirm={canConfirmAgenticEstimate}
          confirming={confirmingAgenticEstimate}
          confirmed={agenticEstimateConfirmed}
          estimate={chatEstimate}
          formatPriceRange={formatPriceRange}
          language={language}
          onConfirm={confirmAgenticEstimate}
          onReject={() => {
            setAgenticRejectOpen(true)
            setError(null)
          }}
          onReasonChange={setAgenticRejectReason}
          onSubmitRejectReason={() => void submitAgenticRejectReason()}
          priceExplanationForEstimate={agenticEstimatePriceExplanation}
          problemLabelForEstimate={agenticEstimateProblemLabel}
          rejected={agenticRejectOpen}
          rejectReason={agenticRejectReason}
          sourceExplanationForLanguage={agenticEstimateSourceExplanation}
          submittingRejectReason={submittingAgenticRejectReason}
          textInputStyle={[styles.composerInput, customerV21WebTextInputNoOutline]}
        />
      ) : null}
      agenticEvidenceGateNode={agenticEvidenceGateActive ? (
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
      agenticVisibleTurns={agenticIntakeModeActive ? agenticVisibleTurns : []}
      animatedModeMenuSheenStyle={animatedModeMenuSheenStyle}
      animatedModeMenuStyle={animatedModeMenuStyle}
      canUseComposerMedia={canUseComposerMedia}
      caseAssistantTurns={showCaseConversation ? caseAssistantTurns : []}
      caseThreadNode={mode === 'case' && deal ? (
        <AgenticCaseThreadPanel activityLabel={customerV21TabCopy[language].activity} deal={deal} editing={caseEditOpen} focus={caseFocus} language={language} onApproveScopeChange={(scopeChangeId) => {
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
          caseEvidenceGateNode={(
            <AgenticEvidenceGateCard
              busy={submittingCaseEvidence || uploadingMedia}
              mediaDrafts={composerMediaDrafts}
              onAddMedia={pickComposerMedia}
              onConfirm={() => void submitCaseEvidence('confirmed')}
              onReasonChange={setCaseEvidenceReason}
              onReject={() => {
                setCaseEvidenceRejectOpen(true)
                setError(null)
              }}
              onSkip={() => void submitCaseEvidence('skipped')}
              onVoiceSaved={(mediaDraft) => setComposerMediaDrafts((current) => mergeMediaDrafts(current, [mediaDraft], 5))}
              rejectOpen={caseEvidenceRejectOpen}
              rejectReason={caseEvidenceReason}
            />
          )}
          caseQuoteRejectOpen={caseQuoteRejectOpen}
          caseQuoteRejectReason={caseQuoteRejectReason}
          caseOptionsAcknowledged={caseOptionsAcknowledged}
          confirmingCaseQuote={confirmingCaseQuote}
          onAcknowledgeOptions={() => setCaseOptionsAcknowledged(true)}
          onApproveQuote={() => void confirmCaseQuote()}
          onQuoteRejectReasonChange={setCaseQuoteRejectReason}
          onQuoteRejectReasonSubmit={() => void submitCaseQuoteRejectReason()}
          onRejectQuote={() => {
            setCaseQuoteRejectOpen(true)
            setError(null)
          }}
          renderJobProgressBar={(active, progress) => <AnimatedStageProgressBar active={active} progress={progress} />}
          sourceFooterLabel={caseWorkDataSourceFooterLabel(caseDisplayCode(deal, language), language)}
          submittingCaseEvidence={submittingCaseEvidence || uploadingMedia}
          submittingCaseQuoteRejectReason={submittingCaseQuoteRejectReason}
          textInputStyle={[styles.composerInput, customerV21WebTextInputNoOutline]}
          tokens={tokens}
        />
      ) : null}
      caseWorkLabel={copy.caseWork}
      composerBusy={composerBusy}
      composerMediaDraftCount={composerMediaDrafts.length}
      composerPlaceholder={composerPlaceholder}
      draft={draft}
      error={error}
      hiddenScrollbarStyle={customerV21HiddenScrollbar}
      hydratingCase={hydratingCase && !deal}
      language={language}
      mode={mode}
      modeMenuOpen={modeMenuOpen}
      normalAssistantTurns={normalAssistantTurns}
      normalChatLabel={copy.normalChat}
      normalEvidenceNode={showNormalEvidence ? (
        <ChatEvidenceStrip
          formatCount={formatKnownCount}
          language={language}
          mediaCount={normalEvidenceCount}
          mode={mode}
          tokens={tokens}
        />
      ) : null}
      onBack={() => router.replace('/(customer)/home' as never)}
      onDraftChange={setDraft}
      onPickMedia={pickComposerMedia}
      onSendMessage={sendMessage}
      onSwitchMode={switchChatMode}
      onToggleModeMenu={toggleModeMenu}
      pendingDraftMessage={pendingDraftMessage}
      processLinesNode={processLines ? (
        <>
          <ChatBubble role="customer" text={processLines.prompt} tokens={tokens} />
          <KaelProcessLines state={processLines} />
        </>
      ) : null}
      reduceMotion={reduceMotion}
      reduceTransparency={reduceTransparency}
      rootStyles={styles}
      showComposer={showComposer}
      showNormalGreeting={showNormalGreeting}
      showPendingDraftBubble={showPendingDraftBubble}
      textInputNoOutlineStyle={customerV21WebTextInputNoOutline}
      timelineHeadline={timelineHeadline}
      tokens={tokens}
      missingCaseWorkDeal={missingCaseWorkDeal}
    />
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
    <CustomerV21DockOverlayView
      activeTab={activeTab}
      animatedDockCausticStyle={animatedDockCausticStyle}
      animatedDockShimmerStyle={animatedDockShimmerStyle}
      animatedLensSheenStyle={animatedLensSheenStyle}
      animatedLensStyle={animatedLensStyle}
      animatedOrbRippleStyle={animatedOrbRippleStyle}
      animatedOrbSheenStyle={animatedOrbSheenStyle}
      animatedOrbStyle={animatedOrbStyle}
      dockCausticLeft={dockCausticLeft}
      dockCausticWidth={dockCausticWidth}
      kaelActive={kaelActive}
      language={language}
      liquidDockWidth={liquidDockWidth}
      liquidNavWidth={liquidNavWidth}
      mode={mode}
      navItems={navItems}
      onKaelPress={openKael}
      onTabPress={(route) => router.replace(route as never)}
      reduceTransparency={reduceTransparency}
      selectedIndex={selectedIndex}
      tokens={tokens}
    />
  )
}

export const CustomerDockOverlay = CustomerV21DockOverlay

function ActiveCaseCard({ deal, onOpen }: { deal: LocalDeal; onOpen: () => void }) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const service = deal.draft.serviceType ? customerV21ServiceCopy[language][deal.draft.serviceType].label : copy.dataPending
  const caseFactMetrics = [
    {
      auraScope: 'ActiveCaseService',
      label: language === 'vi' ? 'Dịch vụ' : 'Service',
      testID: 'customer-v21-active-case-service',
      value: service,
    },
    {
      auraScope: 'ActiveCaseProblem',
      label: language === 'vi' ? 'Vấn đề' : 'Issue',
      testID: 'customer-v21-active-case-problem',
      value: agenticDealProblemLabel(deal, language),
    },
    {
      auraScope: 'ActiveCaseArea',
      label: language === 'vi' ? 'Khu vực' : 'Area',
      testID: 'customer-v21-active-case-area',
      value: deal.draft.addressLabel || deal.draft.districtLabel || copy.dataPending,
    },
    {
      auraScope: 'ActiveCaseEstimate',
      label: language === 'vi' ? 'Ước tính' : 'Estimate',
      testID: 'customer-v21-active-case-estimate',
      value: deal.estimate?.priceRangeLabel || copy.dataPending,
    },
  ]
  return (
    <ActiveCaseCardPanel
      activeCaseLabel={customerV21CommonCopy[language].activeCase}
      activeStep={stepForStatus(deal.status)}
      activityImage={customerV21Assets.activity}
      bodyTextStyle={styles.bodyText}
      cardStyle={styles.activeCaseCard}
      caseCode={caseDisplayCode(deal, language)}
      caseFactGrid={<CaseFactGrid metrics={caseFactMetrics} sourceCardSkin={SourceCardSkin} tokens={tokens} zipMintAura={ZipMintAura} />}
      onOpen={onOpen}
      openLabel={language === 'vi' ? 'Xem hoạt động' : 'View activity'}
      service={service}
      statusLabel={customerV21StatusCopy[language][deal.status]}
    />
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
  const { reduceTransparency, tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const service = deal.draft.serviceType ? customerV21ServiceCopy[language][deal.draft.serviceType].label : copy.dataPending
  const problem = agenticDealProblemLabel(deal, language)
  const address = deal.draft.addressLabel || deal.draft.districtLabel || copy.dataPending
  const confidence = deal.estimate?.confidenceLabel ?? null
  const detailLine = [problem, address].filter((item) => item && item !== copy.dataPending).join(' · ') || copy.dataPending
  return (
    <CaseOverviewPanel
      analyzedLabel={deal.estimate ? (language === 'vi' ? 'Kael đã phân tích' : 'Kael analyzed') : copy.dataPending}
      code={caseDisplayCode(deal, language)}
      detailLine={detailLine}
      reduceTransparency={reduceTransparency}
      scoreNode={confidence ? (
        <CaseOverviewLiquidScore
          aura={false}
          label={language === 'vi' ? 'đủ dữ liệu' : 'data ready'}
          percent={percentFromConfidenceLabel(confidence)}
          reduceTransparency={reduceTransparency}
          scope="Ready"
          tokens={tokens}
          value={confidence}
        />
      ) : null}
      service={service}
      statusLabel={customerV21StatusCopy[language][deal.status]}
      workflowRail={showWorkflowRail ? <ScreenAdaptationRail activeStatus={deal.status} /> : null}
    />
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

function CaseOverviewNextStep({ onNext }: { onNext: () => void }) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  return (
    <View style={historyActiveStyles.caseOverviewNextStack} testID="customer-v21-case-overview-next-step">
      <V21Card
        style={[
          historyActiveStyles.caseOverviewNextCard,
          {
            backgroundColor: tokens.mode === 'dark' ? tokens.glassStrong : 'rgba(246,255,252,0.92)',
            borderColor: tokens.mode === 'dark' ? 'rgba(117,236,220,0.22)' : 'rgba(184,231,223,0.85)',
          },
        ]}
        testID="customer-v21-case-overview-next-card"
      >
        <SourceCardSkin />
        <CaseWorkCardAura scope="OverviewNext" testID="customer-v21-case-overview-next-mint-aura" />
        <View style={historyActiveStyles.caseOverviewNextContent}>
          <AssetTile image={customerV21Assets.kaelHead} label="Kael" size={38} sourceAura style={historyActiveStyles.caseOverviewNextIcon} />
          <View style={styles.flex}>
            <Text style={[sharedStyles.cardTitle, { color: tokens.text }]}>{language === 'vi' ? 'Bước tiếp theo' : 'Next step'}</Text>
            <Text numberOfLines={2} style={[historyActiveStyles.caseOverviewNextCopy, { color: tokens.muted }]}>
              {language === 'vi'
                ? 'Tôi sẽ chấm điểm thợ theo kỹ năng, khoảng cách, lịch và uy tín.'
                : 'Kael scores workers by skill, distance, schedule, and trust.'}
            </Text>
          </View>
          <Text style={[styles.chevronText, { color: tokens.primary }]}>›</Text>
        </View>
      </V21Card>
      <KaelButton label={language === 'vi' ? 'Tìm thợ phù hợp' : 'Find a worker'} onPress={onNext} style={historyActiveStyles.caseOverviewNextButton} testID="customer-v21-case-overview-next" />
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
  const copy = customerV21CommonCopy[language]
  const estimate = deal.estimate
  const evidenceLabel = formatEvidenceFileCount(deal.draft.mediaCount, language)
  const hasDescription = deal.draft.description.trim().length > 0
  const hasEstimate = Boolean(estimate?.priceRangeLabel)
  const recommendation = estimate?.advisory || deal.draft.description || copy.dataPending

  return (
    <CaseWorkPanelView
      activeStep={stepForStatus(deal.status)}
      activityLabel={customerV21TabCopy[language].activity}
      editing={editing}
      editLabel={editing ? (language === 'vi' ? 'Đang chỉnh sửa' : 'Editing') : (language === 'vi' ? 'Yêu cầu chỉnh sửa' : 'Request edits')}
      estimateReady={hasEstimate}
      estimateValue={estimate?.priceRangeLabel || copy.dataPending}
      evidenceLabel={evidenceLabel}
      hasDescription={hasDescription}
      hasMedia={deal.draft.mediaCount > 0}
      kaelIconStyle={styles.infoNoticeIcon}
      kaelImage={customerV21Assets.kaelHead}
      onOpenActivity={onOpenActivity}
      onRequestEdit={onRequestEdit}
      recommendation={recommendation}
      riskLabel={estimate ? complexitySafetyLabel(estimate.complexity, language) : copy.dataPending}
      sourceFooterLabel={caseWorkDataSourceFooterLabel(caseDisplayCode(deal, language), language)}
    />
  )
}

function CasePrimaryInfo({ deal }: { deal: LocalDeal }) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const address = deal.draft.addressLabel || deal.draft.districtLabel || copy.dataPending
  const evidenceLabel = formatEvidenceFileCount(deal.draft.mediaCount, language)
  return (
    <CasePrimaryInfoPanel
      actionLabel={language === 'vi' ? 'Chỉnh sửa' : 'Edit'}
      addressLabel={language === 'vi' ? 'Địa điểm' : 'Location'}
      addressValue={address}
      evidenceChipLabel={deal.draft.mediaCount > 0 ? (language === 'vi' ? 'Đủ' : 'Ready') : evidenceLabel}
      evidenceLabel={language === 'vi' ? 'Bằng chứng' : 'Evidence'}
      evidenceValue={evidenceLabel}
      timeLabel={language === 'vi' ? 'Khung giờ' : 'Time window'}
      timeValue={timeChoiceLabel(deal.draft.timeChoice, language)}
      title={language === 'vi' ? 'Thông tin chính' : 'Primary details'}
      tokens={tokens}
    />
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
    <CaseUnderstandingPanel
      actionLabel={language === 'vi' ? 'Bằng chứng ›' : 'Evidence ›'}
      body={body}
      bodyTextStyle={styles.bodyText}
      confidenceChipLabel={estimate?.confidenceLabel ? (language === 'vi' ? `Độ tin cậy ${estimate.confidenceLabel}` : `Confidence ${estimate.confidenceLabel}`) : null}
      headline={headline}
      likelyPrefix={language === 'vi' ? 'Khả năng cao: ' : 'Likely: '}
      riskChipLabel={estimate?.complexity ? complexitySafetyLabel(estimate.complexity, language) : null}
      title={language === 'vi' ? 'Kael đã hiểu vấn đề' : 'Kael understanding'}
      tokens={tokens}
    />
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
        historyActiveStyles.activityScreenCard,
        paymentRelated ? historyActiveStyles.activityScreenPaymentAuraCard : null,
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
      <AssetTile image={caseScreenAsset(screenId)} label={customerV21ScreenTitles[language][screenId]} size={36} style={historyActiveStyles.activityScreenIcon} />
      <View style={styles.flex}>
        <Text numberOfLines={1} style={[sharedStyles.screenRailTitle, { color: active ? tokens.primary : tokens.text }]}>{customerV21ScreenTitles[language][screenId]}</Text>
        <Text numberOfLines={2} style={[historyActiveStyles.activityScreenBody, { color: tokens.muted }]}>{summary}</Text>
      </View>
      {active ? <View style={[historyActiveStyles.activityActiveDot, { backgroundColor: tokens.primary }]} /> : null}
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
      <V21Card glass style={historyActiveStyles.caseReferenceHero}>
        <AssetTile image={caseScreenAsset(screenId)} label={title} size={62} />
        <View style={styles.flex}>
          <EyebrowPill label={active ? (language === 'vi' ? 'ĐANG MỞ THEO CÔNG VIỆC' : 'ACTIVE IN JOB') : customerV21CommonCopy[language].dataPending} tokens={tokens} />
          <Text style={[historyActiveStyles.caseOverviewTitle, { color: tokens.text }]}>{title}</Text>
          <Text style={[styles.bodyText, { color: tokens.muted }]}>{caseScreenSummary(screenId, deal, language)}</Text>
        </View>
      </V21Card>

      <V21Card testID={`customer-v21-direct-facts-${screenId}`}>
        <SectionHeader
          eyebrow={caseDisplayCode(deal, language)}
          title={language === 'vi' ? 'Dữ liệu của màn hình này' : 'Screen data'}
        />
        {rows.map((row) => (
          <MediaRow assetTile={AssetTile} tokens={tokens} image={row.image} key={row.label} label={row.label} value={row.value} />
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

function CaseMatchingScreen({ deal }: { deal: LocalDeal }) {
  const language = useAppLanguage()
  const router = useRouter()
  const { reduceTransparency, tokens } = useV21Theme()
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
  const openOptions = () => router.replace('/(customer)/history?screen=2.8-options' as never)

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
    <CaseMatchingStageView
      barsNode={(
        <>
          <SectionActionHeader action={language === 'vi' ? 'Chi tiết' : 'Details'} title={language === 'vi' ? 'Điểm matching' : 'Matching score'} />
          <V21Card style={styles.matchingBarsCard} testID="customer-v21-matching-bars">
            <SourceCardSkin />
            <CaseWorkCardAura scope="MatchingBars" testID="customer-v21-matching-bars-mint-aura" />
            <MatchingBar delayMs={0} label={language === 'vi' ? 'Kỹ năng' : 'Skill'} percent={confidencePercent} testID="customer-v21-matching-bar-skill" value={confidencePercent ? formatNumber(Math.round(confidencePercent), language) : '0'} />
            <MatchingBar delayMs={45} label={language === 'vi' ? 'Khoảng cách' : 'Distance'} percent={0} testID="customer-v21-matching-bar-distance" value="0" />
            <MatchingBar delayMs={90} label={language === 'vi' ? 'Đúng giá' : 'Price fit'} percent={priceScore} testID="customer-v21-matching-bar-price" value={priceScore ? formatNumber(Math.round(priceScore), language) : '0'} />
          </V21Card>
        </>
      )}
      confidenceLabel={confidenceLabel}
      confidencePercent={confidencePercent}
      confidenceTitle={estimate ? (language === 'vi' ? 'độ tin cậy' : 'confidence') : copy.dataPending}
      dataPendingLabel={copy.dataPending}
      kaelBody={worker
        ? (language === 'vi' ? 'Dựa trên dữ liệu thợ thật và công việc hiện tại.' : 'Based on real worker and job data.')
        : (language === 'vi' ? 'Chờ dữ liệu thợ thật từ hệ thống.' : 'Waiting for real worker data from the system.')}
      kaelTitle={worker ? (language === 'vi' ? `Kael đề xuất ${worker.fullName}` : `Kael recommends ${worker.fullName}`) : (language === 'vi' ? 'Kael đang ghép thợ' : 'Kael is matching')}
      matchLabel={matchLabel}
      matchTone={worker || deal.status === 'broadcasting' ? 'success' : 'unselected'}
      onOpenOptions={openOptions}
      optionsButtonLabel={language === 'vi' ? 'Xem phương án dịch vụ' : 'View service options'}
      profileAction={profileAction}
      reasonSectionTitle={language === 'vi' ? 'Vì sao phù hợp?' : 'Why this match?'}
      reasons={reasons}
      reduceTransparency={reduceTransparency}
      rootStyles={styles}
      serviceMeta={worker ? `${service} · ${workerJobs}` : `${service} · ${area}`}
      statusLabel={statusLabel}
      statusTone={deal.status === 'broadcasting' || worker ? 'success' : 'unselected'}
      tokens={tokens}
      workerName={workerName}
      workerRating={workerRating}
    />
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
  const body = screenId === '2.7-matching'
    ? (language === 'vi' ? 'NestScout chỉ mở thợ và điểm phù hợp khi hệ thống trả dữ liệu thật.' : 'NestScout opens worker and fit-score details only from real system data.')
    : screenId === '2.8-options'
      ? (language === 'vi' ? 'Phạm vi đề xuất bám theo estimate thật và luôn giữ quyền duyệt cho khách.' : 'Options follow the real estimate and keep customer approval authority.')
      : (language === 'vi' ? 'Giá hiển thị theo estimate/payment thật, không tự dựng paid state.' : 'Price uses real estimate/payment state; no paid state is invented.')
  const rows = screenId === '2.7-matching'
    ? [
      { image: customerV21Assets.identity, label: language === 'vi' ? 'Thợ thật' : 'Real worker', value: workerName },
      { image: customerV21Assets.request, label: language === 'vi' ? 'Dịch vụ cần ghép' : 'Service to match', value: service },
      { image: customerV21Assets.map, label: language === 'vi' ? 'Khu vực' : 'Area', value: address },
    ]
    : screenId === '2.8-options'
      ? [
        { image: customerV21Assets.request, label: language === 'vi' ? 'Phạm vi' : 'Scope', value: estimate?.advisory || problem },
        { image: customerV21Assets.shield, label: language === 'vi' ? 'Mức rủi ro' : 'Risk level', value: estimate ? complexitySafetyLabel(estimate.complexity, language) : copy.dataPending },
        { image: customerV21Assets.payment, label: language === 'vi' ? 'Ước tính' : 'Estimate', value: price },
      ]
      : [
        { image: customerV21Assets.payment, label: language === 'vi' ? 'Khoảng giá' : 'Price range', value: price },
        { image: customerV21Assets.shield, label: language === 'vi' ? 'Ghi chú giá' : 'Price note', value: estimate?.disclaimer || copy.dataPending },
        { image: customerV21Assets.identity, label: language === 'vi' ? 'Thợ' : 'Worker', value: workerName },
      ]

  return (
    <CaseDecisionPanelView
      actionLabel={actionLabel}
      body={body}
      eyebrow={caseDisplayCode(deal, language)}
      heroImage={caseScreenAsset(screenId)}
      infoBody={language === 'vi'
        ? 'Mọi thợ, điểm, giá và quyết định đều phải đến từ quy trình thật.'
        : 'Worker, score, price, and decision data must come from the real workflow.'}
      infoImage={customerV21Assets.shield}
      infoTitle={language === 'vi' ? 'Dữ liệu thật' : 'Real data'}
      rows={rows}
      testID={`customer-v21-decision-panel-${screenId}`}
      title={title}
    />
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
    <CaseOptionsStageView
      activityNode={<ActivityScreenCard active deal={deal} screenId="2.8-options" />}
      advisory={advisory}
      chooseOptionLabel={language === 'vi' ? 'Chọn phương án Kael đề xuất' : 'Choose Kael option'}
      dataBasedLabel={estimate ? (language === 'vi' ? 'Theo dữ liệu' : 'Data based') : copy.dataPending}
      dataBasedTone={estimate ? 'success' : 'unselected'}
      estimateLabel={language === 'vi' ? 'Dự kiến' : 'Estimate'}
      heroBadgeLabel={language === 'vi' ? 'Kael khuyên dùng' : 'Kael recommends'}
      kaelSourceNode={(
        <CaseKaelSourceCard
          body={language === 'vi'
            ? 'Mọi thay đổi phạm vi hoặc giá đều cần duyệt trong quy trình.'
            : 'Scope or price changes must stay in the approval workflow.'}
          image={customerV21Assets.kaelHead}
          testID="customer-v21-options-kael-card"
          title={language === 'vi' ? 'Không tự ý phát sinh' : 'No silent changes'}
        />
      )}
      onChooseOption={() => router.replace('/(customer)/history?screen=2.9-quotes' as never)}
      optionAssetLabel={language === 'vi' ? 'Phương án' : 'Option'}
      price={price}
      problem={problem}
      scopeRows={scopeRows}
      scopeSectionAction={language === 'vi' ? `${formatNumber(scopeRows.length, language)} hạng mục` : `${formatNumber(scopeRows.length, language)} items`}
      scopeSectionTitle={language === 'vi' ? 'Phạm vi phương án đề xuất' : 'Recommended scope'}
      secondaryOptions={secondaryOptions}
      time={time}
      timeLabel={language === 'vi' ? 'Thời gian' : 'Time'}
      tokens={tokens}
    />
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
    <V21Card style={[historyActiveStyles.caseKaelSourceCard, usesPaymentProtectedAura ? historyActiveStyles.caseKaelPaymentAuraCard : null]} testID={testID}>
      <SourceCardSkin />
      {usesPaymentProtectedAura ? <CaseWorkCardAura scope={`${auraScope}PaymentProtected`} testID={`${testID}-card-mint-aura`} /> : null}
      {usesWideAura ? <CaseWideMintAura scope={auraScope} testID={`${testID}-wide-mint-aura`} /> : null}
      <ZipMintAura scope={auraScope} testID={`${testID}-mint-aura`} />
      <View style={historyActiveStyles.caseKaelSourceContent}>
        <AssetTile image={image} label="Kael" size={38} sourceAura style={historyActiveStyles.caseKaelSourceIcon} />
        <View style={styles.flex}>
          <Text numberOfLines={1} style={[historyActiveStyles.caseKaelSourceTitle, { color: tokens.text }]}>{title}</Text>
          <Text numberOfLines={2} style={[historyActiveStyles.caseKaelSourceBody, { color: tokens.muted }]}>{body}</Text>
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
    <CaseQuotesStageView
      activityNode={<ActivityScreenCard active deal={deal} screenId="2.9-quotes" />}
      approveQuoteLabel={language === 'vi' ? 'Duyệt báo giá' : 'Approve quote'}
      canOpenPayment={canOpenPayment}
      committedScopeAction={language === 'vi' ? `${formatNumber(scopeRows.length, language)} mục` : `${formatNumber(scopeRows.length, language)} items`}
      committedScopeTitle={language === 'vi' ? 'Phạm vi cam kết' : 'Committed scope'}
      dataSourceNode={<CaseWorkDataSourceFooter label={caseWorkDataSourceFooterLabel(caseDisplayCode(deal, language), language)} testID="customer-v21-quote-data-source" />}
      editQuoteLabel={language === 'vi' ? 'Yêu cầu chỉnh sửa' : 'Request edit'}
      kaelSourceNode={(
        <CaseKaelSourceCard
          body={language === 'vi'
            ? 'Báo giá chỉ mở theo estimate hoặc payment thật từ hệ thống.'
            : 'Quote data opens only from real estimate or payment state.'}
          image={customerV21Assets.shield}
          testID="customer-v21-quote-kael-card"
          title={language === 'vi' ? 'Báo giá theo quy trình' : 'Workflow quote'}
        />
      )}
      onApproveQuote={() => router.replace('/(customer)/history?screen=3.1-payment-review' as never)}
      onRequestEdit={() => router.replace(customerCaseWorkRouteForDeal(deal) as never)}
      platformFee={platformFee}
      platformFeeLabel={language === 'vi' ? 'Phí bảo vệ' : 'Protection fee'}
      price={price}
      priceLabel={language === 'vi' ? 'Ước tính Kael' : 'Kael estimate'}
      problem={agenticDealProblemLabel(deal, language)}
      problemLabel={language === 'vi' ? 'Phạm vi' : 'Scope'}
      scopeRows={scopeRows}
      serviceWorkerMeta={workerMeta}
      tokens={tokens}
      total={total}
      totalLabel={language === 'vi' ? 'Tổng thanh toán' : 'Total'}
      warrantyLabel={language === 'vi' ? 'Bảo hành' : 'Warranty'}
      warrantyValue={copy.dataPending}
      workerAvatarInitials={initialsForName(workerName)}
      workerAvatarUri={worker?.avatarUrl ?? null}
      workerName={workerName}
      workerNetLabel={language === 'vi' ? 'Thợ nhận' : 'Worker net'}
      workerNetValue={workerNet}
      workerVerifiedLabel={worker ? (language === 'vi' ? 'Đã xác minh' : 'Verified') : copy.dataPending}
      workerVerifiedTone={worker ? 'success' : 'unselected'}
    />
  )
}

function CaseLocationEtaScreen({ deal }: { deal: LocalDeal }) {
  const language = useAppLanguage()
  const router = useRouter()
  const { reduceTransparency, tokens } = useV21Theme()
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
    <CaseLocationEtaStageView
      activeNode={<ActivityScreenCard active deal={deal} screenId="2.10-location-eta" />}
      address={address}
      alertNextDisabled={!hasEta}
      alertNextLabel={language === 'vi' ? 'Xem cảnh báo sắp đến' : 'View arrival alert'}
      callWorkerLabel={language === 'vi' ? 'Gọi thợ' : 'Call worker'}
      dataPendingLabel={copy.dataPending}
      eta={eta}
      etaLabel={etaLabel}
      hasEta={hasEta}
      kaelSourceNode={(
        <CaseKaelSourceCard
          body={hasEta
            ? (language === 'vi' ? 'Kael sẽ nhắc khi thời gian đến thay đổi.' : 'Kael will alert when ETA changes.')
            : (language === 'vi' ? 'Chờ thời gian đến thật từ hệ thống.' : 'Waiting for real system ETA.')}
          image={customerV21Assets.kaelHead}
          testID="customer-v21-location-kael-card"
          title={language === 'vi' ? 'Kael đang theo dõi thời gian đến' : 'Kael tracks ETA'}
        />
      )}
      liveActionLabel={language === 'vi' ? 'Trực tiếp' : 'Live'}
      liveRouteTitle={language === 'vi' ? 'Hành trình trực tiếp' : 'Live route'}
      mapStatus={customerV21StatusCopy[language][deal.status]}
      messageWorkerDisabled={!worker}
      messageWorkerLabel={language === 'vi' ? 'Nhắn thợ' : 'Message worker'}
      onCallWorker={() => undefined}
      onMessageWorker={() => router.replace(customerCaseWorkRouteForDeal(deal) as never)}
      onOpenLiveAlert={() => router.replace('/(customer)/history?screen=2.11-live-alert' as never)}
      reduceTransparency={reduceTransparency}
      timelineRows={timelineRows}
      tokens={tokens}
      workerAvatarInitials={initialsForName(workerName)}
      workerAvatarUri={worker?.avatarUrl ?? null}
      workerName={workerName}
    />
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
    <CaseLiveAlertStageView
      accessActionLabel={language === 'vi' ? 'Gửi cho thợ' : 'Send to worker'}
      addressBody={deal.broadcast?.fullAddressVisible ? address : copy.dataPending}
      addressSharedLabel={deal.broadcast?.fullAddressVisible ? (language === 'vi' ? 'Đã chia sẻ' : 'Shared') : undefined}
      accessTitle={language === 'vi' ? 'Hướng dẫn tiếp cận' : 'Access guide'}
      activeNode={<ActivityScreenCard active={active} deal={deal} screenId={screenId} />}
      arrivalCodeLabel={copy.dataPending}
      canMessageWorker={canMessageWorker}
      dataPendingLabel={copy.dataPending}
      entryPointLabel={language === 'vi' ? 'Địa điểm vào nhà' : 'Entry point'}
      eta={eta}
      hasEta={hasEta}
      heroBody={language === 'vi' ? 'Chuẩn bị lối vào và khu vực thao tác.' : 'Prepare the entrance and work area.'}
      heroPillLabel={language === 'vi' ? 'Thời gian sắp đến' : 'Upcoming time'}
      kaelSourceNode={(
        <CaseKaelSourceCard
          body={language === 'vi' ? 'Mã này chỉ mở khi hệ thống có xác minh đến nơi thật.' : 'This code opens only after a real arrival signal.'}
          image={customerV21Assets.kaelHead}
          testID="customer-v21-live-alert-kael-card"
          title={language === 'vi' ? 'Không chia sẻ mã quá sớm' : 'Do not share the code early'}
        />
      )}
      onMessageWorker={() => router.replace(customerCaseWorkRouteForDeal(deal) as never)}
      onReady={() => router.replace('/(customer)/history?screen=2.12-job-accepted' as never)}
      readyLabel={language === 'vi' ? 'Tôi đã sẵn sàng' : 'I am ready'}
      rootStyles={styles}
      shieldBody={language === 'vi' ? 'Chỉ đọc mã khi đúng thợ đến nơi.' : 'Read only after the right worker arrives.'}
      shieldTitle={language === 'vi' ? 'Mã xác minh đến nơi' : 'Arrival code'}
      status={status}
      tokens={tokens}
      workerMessageLabel={language === 'vi' ? 'Nhắn cho thợ' : 'Message worker'}
      workerName={workerName}
    />
  )
}

function CaseJobAcceptedScreen({ deal }: { deal: LocalDeal }) {
  const language = useAppLanguage()
  const router = useRouter()
  const { reduceTransparency, tokens } = useV21Theme()
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
    <CaseJobAcceptedStageView
      activeNode={<ActivityScreenCard active={active} deal={deal} screenId={screenId} />}
      address={address}
      arrived={arrived}
      dataPendingLabel={copy.dataPending}
      kaelSourceNode={(
        <CaseKaelSourceCard
          body={language === 'vi' ? 'Bằng chứng, checklist và thay đổi phạm vi tiếp tục nằm trong cùng công việc thật.' : 'Evidence, checklist, and scope changes stay inside the same real job.'}
          image={customerV21Assets.kaelHead}
          testID="customer-v21-job-accepted-kael-card"
          title={language === 'vi' ? 'Kael đã mở bảng công việc' : 'Kael opened the job cockpit'}
        />
      )}
      language={language}
      onOpenProgress={() => router.replace('/(customer)/history?screen=2.13-job-progress' as never)}
      paymentReady={paymentReady}
      progressDisabled={!isWorkStartedStatus(deal.status)}
      progressLabel={language === 'vi' ? 'Xem công việc đang diễn ra' : 'View work progress'}
      reduceTransparency={reduceTransparency}
      scopeLabel={scopeLabel}
      successDone={arrived || Boolean(deal)}
      status={status}
      tokens={tokens}
      workerAvatarInitials={initialsForName(workerName)}
      workerAvatarUri={deal.workerProfile?.avatarUrl ?? null}
      workerIdentityDone={Boolean(deal.workerProfile)}
      workerName={workerName}
    />
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
  const openCaseWork = () => router.replace(customerCaseWorkRouteForDeal(deal) as never)

  return (
    <CaseJobProgressStageView
      activeNode={<ActivityScreenCard active={active} deal={deal} screenId={screenId} />}
      completionNode={<CompletionStateSummary deal={deal} />}
      dataPendingLabel={copy.dataPending}
      evidenceCount={evidenceCount}
      evidenceLabel={formatEvidenceFileCount(evidenceCount, language)}
      language={language}
      onOpenKael={openCaseWork}
      onOpenWork={openCaseWork}
      openKaelLabel={language === 'vi' ? 'Nhắn Kael' : 'Message Kael'}
      openWorkLabel={language === 'vi' ? 'Mở xử lý công việc' : 'Open work handling'}
      progressBarNode={<AnimatedStageProgressBar active={started} progress={progress} />}
      progressValue={`${progress}%`}
      riskBody={deal.scopeChange?.reason
        || (started
          ? (language === 'vi' ? 'Kael theo dõi phát sinh theo dữ liệu thật.' : 'Kael monitors real scope changes.')
          : copy.dataPending)}
      riskLabel={riskLabel}
      riskTone={riskTone}
      rootStyles={styles}
      started={started}
      status={status}
      stepNodes={caseJobProgressSteps(deal.status, language).map((step) => (
        <CaseFulfillmentStep body={step.body} key={step.title} state={step.state} tokens={tokens} title={step.title} />
      ))}
      tokens={tokens}
      workProgressTitle={customerV21ScreenTitles[language][screenId]}
    />
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

function CaseWorkSummary({ deal }: { deal: LocalDeal }) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  return (
    <V21Card testID="customer-v21-case-work">
      <SectionHeader title={customerV21ScreenTitles[language]['2.5-chat-case']} />
      <MediaRow assetTile={AssetTile} tokens={tokens} image={customerV21Assets.evidence} label={language === 'vi' ? 'Bằng chứng' : 'Evidence'} value={formatKnownCount(deal.draft.mediaCount, language)} />
      <MediaRow assetTile={AssetTile} tokens={tokens} image={customerV21Assets.request} label={language === 'vi' ? 'Phạm vi' : 'Scope'} value={agenticDealProblemLabel(deal, language)} />
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

  const goMethod = () => router.replace('/(customer)/history?screen=3.2-payment-method' as never)
  const goProtected = () => router.replace('/(customer)/history?screen=3.3-payment-protected' as never)
  const goTracking = () => router.replace('/(customer)/history?screen=2.10-location-eta' as never)

  return (
    <View testID={stageTestId}>
      {screenId === '3.1-payment-review' ? (
        <PaymentReviewStageView
          address={address}
          amount={amount}
          caseCode={caseCode}
          disabled={!paymentReady}
          language={language}
          method={method}
          onNext={goMethod}
          platformFee={platformFee}
          service={service}
          serviceAsset={serviceAsset}
          serviceDetail={serviceDetail}
          status={status}
          time={time}
          tokens={tokens}
          workerInitials={initialsForName(workerName)}
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
        <PaymentProtectedStageView
          amount={amount}
          caseCode={caseCode}
          completionBody={completionBody}
          hasPayment={Boolean(payment)}
          language={language}
          onNext={goTracking}
          paymentConfirmedBody={paymentConfirmedBody}
          payoutBody={payoutBody}
          protectedBody={protectedBody}
          protectedPayment={protectedPayment}
          service={service}
          serviceAsset={serviceAsset}
          time={time}
          tokens={tokens}
          workerName={workerName}
        />
      )}
      <ActivityScreenCard active={active} deal={deal} screenId={screenId} />
    </View>
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
    <PaymentMethodStagePanel
      amount={amount}
      disabled={disabled}
      method={method}
      onNext={onNext}
      onSelectBank={setSelectedBankKey}
      paymentReady={paymentReady}
      recommendedBody={recommendedBody}
      recommendedTitle={recommendedTitle}
      selectedBank={selectedBank}
      selectedBankKey={visibleSelectedBankKey}
      status={status}
      visibleBanks={paymentBankOptions}
    />
  )
}

function CompletionStateSummary({ deal }: { deal: LocalDeal }) {
  const language = useAppLanguage()
  const { tokens } = useV21Theme()
  return (
    <V21Card testID="customer-v21-completion-state">
      <SectionHeader title={customerV21ScreenTitles[language]['2.13-job-progress']} />
      <MediaRow assetTile={AssetTile} tokens={tokens} image={customerV21Assets.evidence} label={language === 'vi' ? 'Ảnh hoàn tất' : 'Completion photos'} value={formatKnownCount(deal.completionPhotoUrls?.length, language)} />
      <MediaRow assetTile={AssetTile} tokens={tokens} image={customerV21Assets.feedback} label={language === 'vi' ? 'Ghi chú hoàn tất' : 'Completion note'} value={deal.completionNotes?.trim() || customerV21CommonCopy[language].dataPending} />
    </V21Card>
  )
}

function ActivityStatusPanel({ deal, screenId }: { deal: LocalDeal; screenId: CustomerV21ScreenId }) {
  const language = useAppLanguage()
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
    <ActivityStatusPanelView
      activeStep={stepForStatus(deal.status)}
      eyebrow={caseDisplayCode(deal, language)}
      image={caseScreenAsset(screenId)}
      infoBody={language === 'vi'
        ? 'Màn này chỉ mở dữ liệu đã có trong công việc thật. Thiếu dữ liệu thì giữ trạng thái chờ, không tự dựng thợ, thời gian đến, giá hoặc thanh toán.'
        : 'This screen only opens data already present on the real job. Missing values stay pending; no worker, ETA, price, or payment is invented.'}
      infoImage={customerV21Assets.shield}
      infoTitle={language === 'vi' ? 'Dữ liệu trung thực' : 'Honest data'}
      labelTextStyle={styles.labelText}
      primary={primary}
      rows={rows}
      testID={`customer-v21-status-panel-${screenId}`}
      title={title}
    />
  )
}

function ScreenAdaptationRail({ activeStatus }: { activeStatus: LocalDealStatus }) {
  const language = useAppLanguage()
  const router = useRouter()
  const { tokens } = useV21Theme()
  const activeScreens = screenIdsForStatus(activeStatus)
  return (
    <View style={sharedStyles.screenRail} testID="customer-v21-screen-rail">
      {caseScreenIds.map((id) => {
        const active = activeScreens.includes(id)
        return (
          <Pressable
            accessibilityLabel={customerV21ScreenTitles[language][id]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            key={id}
            onPress={() => router.replace(`/(customer)/history?screen=${id}` as never)}
            style={[sharedStyles.screenRailItem, { backgroundColor: active ? tokens.service : tokens.ghost, borderColor: tokens.border }]}
            testID={`customer-v21-screen-rail-${id}`}
          >
            <Text numberOfLines={1} style={[sharedStyles.screenRailTitle, { color: active ? tokens.primary : tokens.muted }]}>{customerV21ScreenTitles[language][id]}</Text>
          </Pressable>
        )
      })}
    </View>
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
      <ProfileUtilityPaymentView
        accountConfirmBorderColor={paymentAccountConfirm.length > 0 && !paymentAccountMatches ? tokens.danger : tokens.border}
        accountNameDraft={paymentAccountNameDraft}
        accountNumberConfirmDraft={paymentAccountConfirmDraft}
        accountNumberDraft={paymentAccountNumberDraft}
        bankCountLabel={language === 'vi' ? `${formatNumber(paymentBankOptions.length, language)} ngân hàng` : `${formatNumber(paymentBankOptions.length, language)} banks`}
        confirmedPaymentAccountMasked={confirmedPaymentAccountMasked}
        confirmedPaymentBankName={confirmedPaymentBankName}
        confirmedPaymentReady={confirmedPaymentReady}
        confirmedPaymentStatus={confirmedPaymentStatus}
        dataPendingLabel={copy.dataPending}
        language={language}
        onAccountConfirmChange={(value) => {
          setPaymentAccountConfirmDraft(value)
          setPaymentMessage(null)
        }}
        onAccountNameChange={(value) => {
          setPaymentAccountNameDraft(value)
          setPaymentMessage(null)
        }}
        onAccountNumberChange={(value) => {
          setPaymentAccountNumberDraft(value)
          setPaymentMessage(null)
        }}
        onBankSelect={(bank) => {
          setSelectedBankKey(bank.key)
          setPaymentMessage(null)
        }}
        onSave={() => void savePaymentProfile()}
        paymentAccountConfirm={paymentAccountConfirm}
        paymentAccountMatches={paymentAccountMatches}
        paymentBankOptions={paymentBankOptions}
        paymentCanSave={paymentCanSave}
        paymentMessage={paymentMessage}
        paymentMessageColor={tokens.primary}
        paymentSaving={paymentSaving}
        rootStyles={styles}
        selectedBankKey={selectedBankKey}
        textInputNoOutlineStyle={customerV21WebTextInputNoOutline}
        title={profileUtilityTitle(kind, language)}
        tokens={tokens}
      />
    )
  }

  if (kind === 'settings') {
    return (
      <ProfileUtilitySettingsView
        account={{
          canSave: accountCanSave,
          emailDraft: accountEmailDraft,
          fullNameDraft: accountFullNameDraft,
          message: accountMessage,
          messageColor: accountMessage?.includes('Đã') || accountMessage === 'Saved' ? tokens.primary : tokens.danger,
          onEmailChange: (value) => {
            setAccountEmailDraft(value)
            setAccountMessage(null)
          },
          onFullNameChange: (value) => {
            setAccountFullNameDraft(value)
            setAccountMessage(null)
          },
          onPhoneChange: (value) => {
            setAccountPhoneDraft(value)
            setAccountMessage(null)
          },
          onSave: () => void saveAccountProfile(),
          onToggle: () => {
            setAccountPanelOpen((current) => !current)
            setAccountMessage(null)
          },
          open: accountPanelOpen,
          phoneDraft: accountPhoneDraft,
          saving: accountSaving,
        }}
        language={language}
        memory={{
          allowed: messageMemoryAllowed,
          onToggle: () => void toggleSettingsMessageMemory(),
          pending: settingsMemoryPermissionPending,
        }}
        onOpenAddress={() => router.replace('/(customer)/profile?utility=address' as never)}
        onToggleLanguage={() => setAppLanguage(language === 'vi' ? 'en' : 'vi')}
        password={{
          canSave: passwordCanSave,
          confirmDraft: confirmPasswordDraft,
          currentDraft: currentPasswordDraft,
          message: passwordMessage,
          messageColor: passwordMessage?.includes('Đã') || passwordMessage === 'Password changed' ? tokens.primary : tokens.danger,
          newDraft: newPasswordDraft,
          onConfirmChange: (value) => {
            setConfirmPasswordDraft(value)
            setPasswordMessage(null)
          },
          onCurrentChange: (value) => {
            setCurrentPasswordDraft(value)
            setPasswordMessage(null)
          },
          onNewChange: (value) => {
            setNewPasswordDraft(value)
            setPasswordMessage(null)
          },
          onSave: () => void saveSettingsPassword(),
          onToggle: () => {
            setPasswordPanelOpen((current) => !current)
            setPasswordMessage(null)
          },
          open: passwordPanelOpen,
          passwordMatches,
          saving: passwordSaving,
        }}
        rootStyles={styles}
        textInputNoOutlineStyle={customerV21WebTextInputNoOutline}
        title={profileUtilityTitle(kind, language)}
        tokens={tokens}
      />
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
    <ProfileUtilityAddressView
      addressMessage={addressMessage}
      addressMessageColor={addressMessage?.includes('Đã') || addressMessage === 'Saved' ? tokens.primary : tokens.danger}
      addressOptions={addressOptions}
      addressSaving={addressSaving}
      currentDefaultAddress={currentDefaultAddress}
      dataPendingLabel={copy.dataPending}
      defaultAddressDraft={defaultAddressDraft}
      defaultDraftChanged={defaultDraftChanged}
      defaultStatusLabel={defaultStatusLabel}
      defaultStatusSaved={defaultStatusSaved}
      hasSavedDefaultAddress={hasSavedDefaultAddress}
      language={language}
      onDefaultAddressChange={setDefaultAddressDraft}
      onMakeDefaultAddress={(address) => {
        setDefaultAddressDraft(address)
        void saveAddressProfile({ defaultAddress: address, savedAddresses }).then((saved) => {
          if (saved) setConfirmedDefaultAddress(address)
        })
      }}
      onSaveDefaultAddress={() => {
        void saveAddressProfile({ defaultAddress: currentDefaultAddress, savedAddresses }).then((saved) => {
          if (saved) setConfirmedDefaultAddress(currentDefaultAddress)
        })
      }}
      onSaveSecondaryAddress={() => {
        const nextAddress = secondaryAddressDraft.trim()
        const nextSavedAddresses = Array.from(new Set([...savedAddresses, nextAddress])).slice(0, 8)
        setSavedAddresses(nextSavedAddresses)
        setSecondaryAddressDraft('')
        void saveAddressProfile({
          defaultAddress: savedDefaultAddress || undefined,
          savedAddresses: nextSavedAddresses,
        })
      }}
      onSecondaryAddressChange={setSecondaryAddressDraft}
      rootStyles={styles}
      savedAddressesCountLabel={language === 'vi' ? `${formatNumber(savedAddresses.length, language)} địa chỉ` : `${formatNumber(savedAddresses.length, language)} addresses`}
      secondaryAddressDraft={secondaryAddressDraft}
      textInputNoOutlineStyle={customerV21WebTextInputNoOutline}
      title={profileUtilityTitle(kind, language)}
      tokens={tokens}
    />
  )
}

function ProfileRanking({ insights }: { insights: CustomerProfileInsightsResponse | null }) {
  const language = useAppLanguage()
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
  const protectedTransactions = protectedTransactionLabel(insights, language, copy.emptyProfileMetric)
  return (
    <ProfileRankingPanel
      completed={completedCount}
      metrics={[
        { label: language === 'vi' ? 'Dịch vụ đã dùng' : 'Used services', value: completedCount },
        { label: language === 'vi' ? 'Chuỗi hoạt động' : 'Active streak', value: streakLabel },
        { label: language === 'vi' ? 'Đánh giá tích cực' : 'Positive reviews', value: reviewRate },
      ]}
      pointsText={pointsText}
      progress={progress}
      progressBar={<ProfileProgressBar percent={rank > 0 ? progress : 0} testID="customer-v21-profile-ranking-progress" />}
      protectedTransactions={protectedTransactions}
      rank={rank}
      rankNodes={[1, 2, 3, 4, 5].map((node) => ({ active: rank === node, label: rankLabel(node, language), value: node }))}
      rankProcess={(
        <ProfileRankProcess
          label={language === 'vi' ? 'Tiến trình hạng' : 'Level progress'}
          percent={levelProgress}
          value={levelProgressLabel}
        />
      )}
      rankStatusLabel={profileRankStatus(rank, language, copy.dataPending)}
      rankTitle={rankTitle}
      reviewRate={reviewRate}
      rules={[
        {
          image: customerV21Assets.request,
          label: language === 'vi' ? 'Hoàn tất đúng quy trình' : 'Finish through workflow',
          status: completedCount,
          testID: 'customer-v21-profile-ranking-rule-completed',
          value: language === 'vi' ? 'Không bỏ đơn sau khi thợ đã di chuyển' : 'No cancellation after worker travel starts',
        },
        {
          image: customerV21Assets.feedback,
          label: language === 'vi' ? 'Đánh giá chất lượng' : 'Quality review',
          status: reviewRate,
          testID: 'customer-v21-profile-ranking-rule-review',
          value: language === 'vi' ? 'Phản hồi công bằng sau mỗi công việc' : 'Fair feedback after each job',
        },
        {
          image: customerV21Assets.shield,
          label: language === 'vi' ? 'Dùng thanh toán được bảo vệ' : 'Use protected payment',
          status: protectedTransactions,
          testID: 'customer-v21-profile-ranking-rule-protected',
          value: language === 'vi' ? 'Giữ giao dịch trong hệ thống' : 'Keep transactions in system',
        },
      ]}
      rulesAction={language === 'vi' ? 'Chi tiết' : 'Details'}
      rulesTitle={language === 'vi' ? 'Điều giúp bạn thăng hạng' : 'What improves your level'}
    />
  )
}

function ProfileMoney({ insights }: { insights: CustomerProfileInsightsResponse | null }) {
  const language = useAppLanguage()
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
    <ProfileMoneyPanel
      body={score > 0
        ? (language === 'vi' ? 'Dữ liệu bảo vệ dựa trên giao dịch thật trong hệ thống.' : 'Protection data is based on real in-system transactions.')
        : (language === 'vi' ? 'Chưa có giao dịch thật để tính chỉ số bảo vệ.' : 'No real transactions yet for protection score.')}
      chipLabel={score > 0 ? (language === 'vi' ? `Đáng tin cậy · ${scoreState}` : `Trusted · ${scoreState}`) : copy.dataPending}
      layers={[
        {
          image: customerV21Assets.request,
          label: language === 'vi' ? 'Giá được khóa theo duyệt' : 'Price locked by approval',
          status: typeof insights?.fair_price_service_count === 'number' && insights.fair_price_service_count > 0 ? (language === 'vi' ? 'Tốt' : 'Good') : copy.dataPending,
          value: language === 'vi' ? 'Mọi phát sinh đều cần bạn duyệt' : 'Every change needs your approval',
        },
        {
          image: customerV21Assets.payment,
          label: language === 'vi' ? 'Tiền đi qua sổ nội bộ' : 'Money through ledger',
          status: protectedTransactions,
          value: language === 'vi' ? 'Không thanh toán ngoài nền tảng' : 'No off-platform payment',
        },
        {
          image: customerV21Assets.shield,
          label: language === 'vi' ? 'Giải ngân đúng trạng thái' : 'Release follows status',
          status: fairPriceStatusLabel(insights?.fair_price_status, language, copy.dataPending),
          value: language === 'vi' ? 'Theo trạng thái công việc thật' : 'Based on the real job state',
        },
      ]}
      layersAction={language === 'vi' ? 'Chi tiết ›' : 'Details ›'}
      layersTitle={language === 'vi' ? 'Các lớp bảo vệ' : 'Protection layers'}
      latestBody={copy.dataPending}
      latestStatus={copy.dataPending}
      latestTitle={language === 'vi' ? 'Theo công việc thật' : 'Real job only'}
      metrics={[
        { label: language === 'vi' ? 'Dịch vụ đúng giá' : 'Fair-price services', value: protectedTransactions },
        { label: language === 'vi' ? 'Tiền đã bảo vệ' : 'Protected value', value: protectedValue },
        { label: language === 'vi' ? 'Không tranh chấp' : 'Dispute free', value: disputeFree },
      ]}
      score={score}
      scoreState={scoreState}
    />
  )
}

function ProfileMemory() {
  const language = useAppLanguage()
  const workflow = useFrontendWorkflow()
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
    <ProfileMemoryPanel
      languageValue={languageValue}
      memoryRecordPresent={Boolean(memoryRecord)}
      preference={preference}
      servicePreference={servicePreference}
    />
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
    <AgenticEvidenceGateView
      busy={busy}
      canConfirm={canConfirm}
      fileValue={formatKnownCount(totalFileCount, language)}
      isRecordingVoice={isRecordingVoice}
      language={language}
      onAddMedia={onAddMedia}
      onConfirm={onConfirm}
      onReasonChange={onReasonChange}
      onReject={onReject}
      onSkip={onSkip}
      onVoicePress={() => void handleVoicePress()}
      recordingSeconds={recordingSeconds}
      rejectOpen={rejectOpen}
      rejectReason={rejectReason}
      textInputNoOutlineStyle={customerV21WebTextInputNoOutline}
      tokens={tokens}
      totalFileCount={totalFileCount}
      visualMediaValue={formatKnownCount(visualMediaCount, language)}
      voiceError={voiceError}
      voiceValue={formatKnownCount(voiceCount, language)}
    />
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

function makeAssistantTurnId(surface: CustomerAssistantLocalTurn['surface'], role: CustomerAssistantLocalTurn['role']) {
  return `${surface}-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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

const styles = StyleSheet.create({
  agenticUtilityIcon: {
    minHeight: 56,
    minWidth: 56,
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 20,
  },
  paymentMethodHeroWalletImage: {
    height: 56,
    position: 'relative',
    width: 56,
    zIndex: 1,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
  },
  centerText: {
    textAlign: 'center',
  },
  chevronText: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 24,
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
  errorText: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 10,
  },
  flex: {
    flex: 1,
  },
  formCard: {
    gap: 12,
  },
  labelText: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
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
  activeCaseCard: {
    borderColor: 'rgba(113,225,209,0.46)',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#088779',
    shadowOpacity: 0.12,
    shadowRadius: 24,
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
  jobProgressHeroCard: {
    borderColor: 'rgba(186,240,230,0.78)',
    shadowOpacity: 0.16,
    shadowRadius: 38,
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
  infoNoticeIcon: {
    minHeight: 58,
    minWidth: 58,
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
  profileMintChipText: {
    color: '#088779',
    fontWeight: '700',
  },
  profileLogoutCta: {},
  profileInsightTitle: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 21,
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
})
