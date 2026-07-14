import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import Svg, { Defs, LinearGradient, Rect } from 'react-native-svg'
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  inferLocalDealDraftFromKael,
  CUSTOMER_SERVICE_IDS,
  LOCAL_DEAL_ID,
  extractKnownDistrictLabel,
  type CustomerServiceId,
  type LocalDeal,
  type CaseWorkEvidence,
  type ServiceType,
} from '@nestscout/shared'
import { KaelButton } from '@/components/ui/kael-primitives'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { useDockScrollState, useDockScrollTransform } from '@/components/ui/dock-scroll-state'
import { motionDuration, motionTokens } from '@/components/ui/motion-tokens'
import { AlphaStop as Stop } from '@/components/ui/svg-alpha-stop'
import { generateClientRequestId } from '@/lib/client-request-id'
import { localizedProblemOptions, setAppLanguage, useAppLanguage, type AppLanguage } from '@/lib/app-language'
import { useAuth } from '@/lib/auth-provider'
import { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { useJobChatThread } from '@/lib/use-job-chat-thread'
import { customerProfileService, jobService, kaelChatService, placesService } from '@/lib/services'
import { bookingServiceIdFromRoute, performanceProfileForBooking, productionServiceForBooking } from '@/lib/kael-performance-intake'
import { cleanupKaelChatMediaRefs, localizeMediaUploadFailure, uploadJobMediaDrafts, uploadKaelChatMediaDrafts, type LocalMediaUploadDraft } from '@/lib/media-upload'
import type { CustomerProfileInsightsResponse, CustomerServiceHistoryItem, KaelChatResponse, KaelChatTurn, PlacesAutocompleteResponse } from '@/lib/api-types'
import {
  getCustomerThemeTokens,
  getReducedTransparencyCustomerTokens,
  useCustomerThemeMode,
} from '../customer-theme'
import { clearPendingKaelChatDraft, peekPendingKaelChatDraft, readPendingKaelChatDraft, setPendingKaelChatDraft } from '../kael-chat/pending-intake'
import { AgenticEvidenceGateCard } from '../kael-chat/agentic-evidence-gate-card'
import { CompletionReviewCard } from '../kael-chat/completion-review-card'
import { localizedCaseWorkEvidencePrompt, localizedCaseWorkSafetyMessage } from '../kael-chat/case-work-localization'
import { MediaDraftPreviewTray } from '../kael-chat/media-draft-preview-tray'
import { OnDeviceVoiceTranscript } from '../kael-chat/on-device-voice-transcript'
import { WorkerCandidateReviewCard } from '../kael-chat/worker-candidate-review-card'
import { QuoteReadinessReviewCard } from '../kael-chat/quote-readiness-review-card'
import {
  CaseWideMintAura,
  HomeHeroSourceAura,
  SourceCardSkin,
  ZipMintAura,
} from './aura-surfaces'
import { customerV21Assets, customerV21BankAssets, type CustomerV21BankKey } from './assets'
import { CustomerBookingEntryView, CustomerBookingGuestGateView } from './booking-entry-stateful-surfaces'
import {
  bookingCustomDateValue,
  bookingCustomTimeValue,
  bookingScheduleDateParam,
  bookingScheduleDateIsBookable,
  bookingScheduleDraft,
  bookingScheduleLabel,
  bookingScheduleTimeParam,
  bookingTimeSlots,
  buildBookingDraftMessage,
  buildBookingScheduleDateOptions,
  normalizeBookingCustomDateInput,
  normalizeBookingCustomTimeInput,
} from './booking-intake-display-model'
import {
  agenticDealProblemLabel,
  caseDisplayCode,
  canCustomerDecideScopeChange,
  formatNumber,
  formatVnd,
  normalizeKaelRoutingText,
} from './case-work-display-model'
import {
  formatKnownCount,
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
  agenticMemoryRowsFromUnknown,
  memoryPreferenceActionSucceeded,
  memoryPreferenceSyncFailureLabel,
  type MemoryPreferenceActionResult,
} from './agentic-memory-display-model'
import { ChatBubble } from './chat-surfaces'
import { AgenticCaseThreadPanel } from './chat-case-thread-stateful-surfaces'
import { AgenticChatEstimateCard, ChatEvidenceStrip, KaelChatSurfaceView } from './chat-stateful-surfaces'
import { CustomerV21DockOverlayView } from './dock-stateful-surfaces'
import { buildKaelProcessSequence, type KaelProcessLine, type KaelProcessScenarioId } from './kael-process-lines'
import { CustomerKaelSessionMenu } from './kael-session-menu'
import { useCustomerKaelConversations } from './use-customer-kael-conversations'
import {
  customerV21CommonCopy,
  customerV21ScreenTitles,
  customerV21ServiceCopy,
  customerV21StatusCopy,
  customerV21TabCopy,
} from './copy'
import { ActiveCaseCardPanel } from './history-active-surfaces'
import { CustomerServiceHistorySurface } from './service-history-surface'
import { CaseFactGrid } from './history-surfaces'
import { CustomerProfileOverviewView, CustomerProfileSubscreenView } from './profile-stateful-surfaces'
import { ProfileCompactMintAura } from './profile-metrics-surfaces'
import { ProfileMoneyPanel, ProfileRankingPanel } from './profile-utility-surfaces'
import { ProfileUtilityAddressView, ProfileUtilityPaymentView, ProfileUtilitySettingsView } from './profile-utility-stateful-surfaces'
import {
  customerAccountJourneyDisplay,
  fairPriceStatusLabel,
  homeGreeting,
  initialsForName,
  insightNumber,
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
  type CustomerProfilePanel,
  type CustomerProfileUtility,
} from './profile-display-model'
import { AssetTile, EmptyState, SectionActionHeader, ServiceTile, V21Card, V21Screen, V21TopBar } from './shared-surfaces'
import {
  CUSTOMER_LIQUID_NAV_DOCK_HEIGHT,
  CUSTOMER_LIQUID_NAV_GAP,
  CUSTOMER_LIQUID_NAV_MAX_WIDTH,
  CUSTOMER_LIQUID_NAV_ORB_SIZE,
  CUSTOMER_LIQUID_NAV_RAIL_PADDING,
  CUSTOMER_LIQUID_NAV_SIDE_INSET,
} from './dock-styles'
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
  chatScreenModeParam,
  firstParam,
  serviceParam,
  servicesScreenParam,
} from './route-params'
import { isScriptedKaelAcknowledgementTurn, totalMediaRefs } from './kael-chat-turn-display-model'
import { stringArrayFromUnknown, stringFromUnknown } from './value-display-model'

const customerKaelChatRoute = '/(customer)/kael-chat?mode=normal'
const customerKaelWorkRoute = '/(customer)/kael-chat?mode=case'

const customerBookingServiceIdForHistory: Record<ServiceType, CustomerServiceId> = {
  cleaning: 'home_cleaning',
  electrical: 'electrical',
  handyman: 'handyman_minor_installation',
  hvac: 'hvac_basic_maintenance',
  plumbing: 'plumbing',
  upholstery: 'upholstery_care',
}

function isRealCaseDeal(deal: LocalDeal | null | undefined): deal is LocalDeal {
  return Boolean(deal?.id && deal.id !== LOCAL_DEAL_ID)
}

function cleanRouteJobId(jobId: string | null | undefined) {
  return jobId && jobId !== LOCAL_DEAL_ID ? jobId : null
}

function localizeKaelRequestFailure(
  failure: { code?: string; error: string },
  language: AppLanguage,
) {
  if (language === 'vi') return failure.error
  switch (failure.code) {
    case 'RATE_LIMITED':
    case 'PENDING_MEDIA_QUOTA':
    case 'DAILY_MEDIA_QUOTA':
      return 'Kael has reached a temporary request limit. Please try again later.'
    case 'VALIDATION':
    case 'INVALID_MEDIA_CONTENT':
    case 'INVALID_MEDIA_REF':
      return 'Some request information is invalid. Please review it and try again.'
    case 'INVALID_STATUS':
    case 'ALREADY_DECIDED':
      return 'This step is no longer available because the case has moved forward.'
    case 'SESSION_PENDING':
      return 'Kael is still preparing this case. Please try again shortly.'
    case 'AI_DISABLED':
    case 'NO_PROVIDER_AVAILABLE':
    case 'MEDIA_VALIDATION_UNAVAILABLE':
      return 'Kael is temporarily unavailable. Please try again shortly.'
    case 'NOT_FOUND':
      return 'This case could not be found or is no longer available.'
    default:
      return 'Kael could not complete that step. Please try again.'
  }
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

function customerCaseWorkRouteForDeal(deal: LocalDeal | null | undefined, suffix = '') {
  return isRealCaseDeal(deal)
    ? `/(customer)/kael-chat?mode=case&jobId=${encodeURIComponent(deal.id)}${suffix}`
    : customerKaelWorkRoute
}

const bookingScheduleRuntimeRefreshMs = 30_000
const bookingAddressLookupDelayMs = 260
type BookingAddressSuggestion = PlacesAutocompleteResponse['suggestions'][number]
const chatComposerMediaTypes: ImagePicker.MediaType[] = ['images', 'videos']
const kaelProcessAnswerSettleMs = 1100
type CustomerAssistantLocalTurn = {
  id: string
  role: 'customer' | 'worker' | 'kael'
  surface: 'customer_normal' | 'customer_case'
  text_content: string
}
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
                <Stop offset="0.55" stopColor="#08AF9C" />
                <Stop offset="1" stopColor="#087D72" />
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

  const openService = (serviceId: CustomerServiceId) => {
    const productionServiceType = productionServiceForBooking(serviceId)
    if (productionServiceType) workflow.dispatch?.({ type: 'start_home_service', serviceType: productionServiceType })
    router.replace(`/(customer)/booking?service=${encodeURIComponent(serviceId)}` as never)
  }

  return (
    <V21Screen screenId="2.1-home" testID="customer-v21-home">
      <V21TopBar
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
      </V21Card>
      </View>

      <SectionActionHeader
        action={language === 'vi' ? 'Xem tất cả ›' : 'See all ›'}
        onAction={() => router.replace('/(customer)/booking' as never)}
        title={language === 'vi' ? 'Bạn cần gì hôm nay?' : 'What do you need today?'}
      />
      <View style={[sharedStyles.serviceGrid, sharedStyles.homeServiceGrid]}>
        {CUSTOMER_SERVICE_IDS.map((service) => (
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
  const rawServicesScreen = firstParam(params.screen)
  const directServicesScreen = servicesScreenParam(rawServicesScreen)
  const directService = bookingServiceIdFromRoute(firstParam(params.service) ?? firstParam(params.serviceType))
  const directScheduleDate = bookingScheduleDateParam(firstParam(params.date))
  const directScheduleTime = bookingScheduleTimeParam(firstParam(params.time))
  const legacyMediaScreenRequested = rawServicesScreen === '2.3-media'
  const servicesScreenId = legacyMediaScreenRequested ? '2.2-search' : directServicesScreen ?? '2.2-search'
  const isMediaScreen = false
  const [selectedService, setSelectedService] = useState<CustomerServiceId | null>(directService)
  const [selectedProblems, setSelectedProblems] = useState<string[]>([])
  const [address, setAddress] = useState('')
  const addressDistrictLabel = useRef<string | null>(null)
  const [addressLookupOpen, setAddressLookupOpen] = useState(false)
  const [addressLookupPending, setAddressLookupPending] = useState(false)
  const [addressFallbackUsed, setAddressFallbackUsed] = useState(false)
  const [addressSuggestions, setAddressSuggestions] = useState<BookingAddressSuggestion[]>([])
  const [description, setDescription] = useState('')
  const [selectedScheduleDate, setSelectedScheduleDate] = useState<string | null>(directScheduleDate)
  const [customScheduleDateInput, setCustomScheduleDateInput] = useState('')
  const [selectedScheduleTime, setSelectedScheduleTime] = useState<string | null>(directScheduleTime)
  const [customScheduleTimeInput, setCustomScheduleTimeInput] = useState('')
  const [photoDrafts, setPhotoDrafts] = useState<LocalMediaUploadDraft[]>([])
  const mediaCount = photoDrafts.length
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
    if (!addressLookupOpen || trimmed.length < 2) return

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
  const customScheduleDateError = customScheduleDateInput.length === 10 && !selectedScheduleDate
    ? (language === 'vi' ? 'Nhập ngày hợp lệ từ hôm nay trở đi.' : 'Enter a valid date from today onward.')
    : null
  const customScheduleTimeError = customScheduleTimeInput.length === 5 && !selectedScheduleTime
    ? (language === 'vi' ? 'Nhập giờ hợp lệ theo HH:mm, trước 23:59.' : 'Enter a valid HH:mm time before 23:59.')
    : null
  const addressUsesMultiline = address.trim().length > 34

  useEffect(() => {
    if (!selectedScheduleDate) return
    if (bookingScheduleDateIsBookable(selectedScheduleDate, new Date(scheduleRuntimeNow))) return
    setSelectedScheduleDate(null)
  }, [scheduleRuntimeNow, selectedScheduleDate])

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

  const productionServiceType = productionServiceForBooking(selectedService)
  const problemOptions = productionServiceType ? localizedProblemOptions(productionServiceType, language) : []
  const toggleProblem = (label: string) => {
    setSelectedProblems((current) =>
      current.includes(label) ? current.filter((item) => item !== label) : [...current, label],
    )
  }
  const updateAddress = (nextAddress: string) => {
    setAddress(nextAddress)
    addressDistrictLabel.current = extractKnownDistrictLabel(nextAddress) || null
    if (nextAddress.trim().length < 2) {
      setAddressLookupOpen(false)
      setAddressLookupPending(false)
      setAddressFallbackUsed(false)
      setAddressSuggestions([])
      return
    }
    setAddressLookupOpen(true)
  }
  const selectAddressSuggestion = (suggestion: BookingAddressSuggestion) => {
    setAddress(suggestion.label)
    addressDistrictLabel.current = extractKnownDistrictLabel(suggestion.label) || null
    setAddressLookupOpen(false)
    setAddressLookupPending(false)
    setAddressFallbackUsed(false)
    setAddressSuggestions([])
  }
  const resetBookingBoard = () => {
    setSelectedService(null)
    setSelectedProblems([])
    setAddress('')
    addressDistrictLabel.current = null
    setAddressLookupOpen(false)
    setAddressLookupPending(false)
    setAddressFallbackUsed(false)
    setAddressSuggestions([])
    setDescription('')
    setSelectedScheduleDate(null)
    setCustomScheduleDateInput('')
    setSelectedScheduleTime(null)
    setCustomScheduleTimeInput('')
    setPhotoDrafts([])
    setError(null)
  }

  const pickBasicIntakePhotos = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      setError(language === 'vi' ? 'Cho phép truy cập thư viện để thêm ảnh hiện trạng.' : 'Allow photo-library access to add current-condition photos.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ['images'],
      preferredAssetRepresentationMode: 'compatible' as ImagePicker.UIImagePickerPreferredAssetRepresentationMode,
      quality: 0.82,
      selectionLimit: Math.max(1, 5 - photoDrafts.length),
    })
    if (result.canceled) return
    const drafts: LocalMediaUploadDraft[] = result.assets.map((asset) => ({
      fileName: asset.fileName ?? undefined,
      fileSizeBytes: asset.fileSize,
      mimeType: asset.mimeType ?? undefined,
      type: 'image',
      uri: asset.uri,
    }))
    setPhotoDrafts((current) => mergeMediaDrafts(current, drafts, 5))
    setError(null)
  }

  const updateCustomScheduleDate = (value: string) => {
    const normalizedInput = normalizeBookingCustomDateInput(value)
    setCustomScheduleDateInput(normalizedInput)
    setSelectedScheduleDate(bookingCustomDateValue(normalizedInput, new Date(scheduleRuntimeNow)))
    setError(null)
  }

  const updateCustomScheduleTime = (value: string) => {
    const normalizedInput = normalizeBookingCustomTimeInput(value)
    setCustomScheduleTimeInput(normalizedInput)
    setSelectedScheduleTime(bookingCustomTimeValue(normalizedInput))
    setError(null)
  }

  const submitDraft = async () => {
    if (!selectedService) {
      setError(language === 'vi' ? 'Chọn dịch vụ trước khi gửi Kael.' : 'Choose a service before sending to Kael.')
      return
    }
    const draftServiceType = productionServiceForBooking(selectedService)
    const profileId = performanceProfileForBooking(selectedService)
    if (!draftServiceType || !profileId) {
      setError(language === 'vi' ? 'Dịch vụ này chưa có cấu hình Kael phù hợp.' : 'This service does not have a Kael profile yet.')
      return
    }
    const draftDescription = description.trim()
    if (draftDescription.length < 10) {
      setError(language === 'vi' ? 'Mô tả cần rõ hơn trước khi gửi Kael.' : 'Add a clearer description before sending to Kael.')
      return
    }
    const draftProblemChips = selectedProblems
    if (address.trim().length < 4) {
      setError(language === 'vi' ? 'Nhập khu vực hoặc căn hộ.' : 'Enter an apartment or area.')
      return
    }
    if (!selectedScheduleDate || !selectedScheduleTime) {
      setError(language === 'vi'
        ? 'Chọn ngày và giờ bắt đầu mong muốn trước khi gửi Kael.'
        : 'Choose your desired date and start time before sending to Kael.')
      return
    }
    const message = buildBookingDraftMessage({
      address,
      description: draftDescription,
      language,
      problems: draftProblemChips,
      scheduleLabel,
      serviceType: draftServiceType,
    })
    const scheduleDraft = bookingScheduleDraft(selectedScheduleDate, selectedScheduleTime)
    if (!scheduleDraft.scheduledAt || !scheduleDraft.scheduleWindow) {
      setError(language === 'vi'
        ? 'Ngày hoặc giờ bắt đầu chưa hợp lệ. Chọn lại trước khi gửi Kael.'
        : 'The desired date or start time is invalid. Choose it again before sending to Kael.')
      return
    }
    const normalizedAddress = address.trim()
    const normalizedDistrict = addressDistrictLabel.current ?? extractKnownDistrictLabel(normalizedAddress) ?? normalizedAddress
    await setPendingKaelChatDraft({
      addressLabel: normalizedAddress,
      clientRequestId: generateClientRequestId(),
      createdAt: new Date().toISOString(),
      description: draftDescription,
      districtLabel: normalizedDistrict,
      locale: language,
      mediaCount,
      message,
      photoDrafts: photoDrafts.length > 0 ? photoDrafts : undefined,
      problemChips: draftProblemChips,
      profileId,
      scheduleMode: 'scheduled',
      scheduledAt: scheduleDraft.scheduledAt,
      scheduleWindow: scheduleDraft.scheduleWindow,
      serviceType: draftServiceType,
      source: 'booking',
    })
    resetBookingBoard()
    router.replace(customerKaelWorkRoute as never)
  }
  const createDraftLabel = copy.createDraft

  return (
    <V21Screen screenId={servicesScreenId} testID="customer-v21-services">
      <CustomerBookingEntryView
        address={address}
        addressFallbackUsed={addressFallbackUsed}
        addressLookupOpen={addressLookupOpen}
        addressLookupPending={addressLookupPending}
        addressSuggestions={addressSuggestions}
        addressUsesMultiline={addressUsesMultiline}
        chatPlaceholder={copy.chatPlaceholder}
        createDraftLabel={createDraftLabel}
        customScheduleDateError={customScheduleDateError}
        customScheduleDateInput={customScheduleDateInput}
        customScheduleTimeError={customScheduleTimeError}
        customScheduleTimeInput={customScheduleTimeInput}
        description={description}
        error={error}
        hiddenTextInputScrollbarStyle={customerV21HiddenTextInputScrollbar}
        invisibleTextInputScrollbarStyle={customerV21InvisibleTextInputScrollbar}
        isMediaScreen={isMediaScreen}
        language={language}
        mediaCount={mediaCount}
        mediaDraftPreviewNode={(
          <MediaDraftPreviewTray
            busy={false}
            drafts={photoDrafts}
            language={language}
            onRemove={(index) => setPhotoDrafts((current) => current.filter((_, currentIndex) => currentIndex !== index))}
            tokens={tokens}
          />
        )}
        mediaPanelNode={null}
        onAddressChange={updateAddress}
        onAddressFocus={() => setAddressLookupOpen(true)}
        onAddressSuggestionPress={selectAddressSuggestion}
        onBack={() => router.replace('/(customer)/home' as never)}
        onCustomScheduleDateChange={updateCustomScheduleDate}
        onCustomScheduleTimeChange={updateCustomScheduleTime}
        onDescriptionChange={setDescription}
        onMediaAdd={() => void pickBasicIntakePhotos()}
        onProblemToggle={toggleProblem}
        onResetSelectedService={() => {
          setSelectedService(null)
          setSelectedProblems([])
          setPhotoDrafts([])
          router.replace('/(customer)/booking' as never)
        }}
        onScheduleDateSelect={(value) => {
          setCustomScheduleDateInput('')
          setSelectedScheduleDate(value)
          setError(null)
        }}
        onScheduleTimeSelect={(value) => {
          setCustomScheduleTimeInput('')
          setSelectedScheduleTime(value)
          setError(null)
        }}
        onServiceSelect={(service) => {
          setSelectedService(service)
          setSelectedProblems([])
          setPhotoDrafts([])
        }}
        onSubmit={submitDraft}
        problemOptions={problemOptions}
        reduceTransparency={reduceTransparency}
        rootStyles={styles}
        scheduleDateOptions={scheduleDateOptions}
        scheduleLabel={scheduleLabel}
        selectedProblems={selectedProblems}
        selectedScheduleDate={selectedScheduleDate}
        selectedScheduleTime={selectedScheduleTime}
        selectedService={selectedService}
        textInputNoOutlineStyle={customerV21WebTextInputNoOutline}
        timeSlots={bookingTimeSlots}
        tokens={tokens}
      />
    </V21Screen>
  )
}

export function CustomerHistorySurface() {
  const router = useRouter()
  const params = useLocalSearchParams<{ job_id?: string | string[]; scope_change?: string | string[]; screen?: string | string[]; tab?: string | string[] }>()
  const workflow = useFrontendWorkflow()
  const workflowDeal = workflow.state.deal
  const deal = isRealCaseDeal(workflowDeal) ? workflowDeal : null
  const routeJobId = cleanRouteJobId(firstParam(params.job_id))
  const routeScopeChangeParam = firstParam(params.scope_change)
  const legacyActivityScreen = firstParam(params.screen)
  const shouldOpenCaseWork = Boolean(routeJobId || routeScopeChangeParam || legacyActivityScreen)

  useEffect(() => {
    if (!routeJobId || deal?.id === routeJobId) return
    void workflow.actions.hydrateRemoteJobById(routeJobId)
  }, [deal?.id, routeJobId, workflow.actions])

  useEffect(() => {
    if (!shouldOpenCaseWork) return
    if (routeJobId && deal?.id !== routeJobId) return
    if (!deal) {
      if (legacyActivityScreen && !routeJobId) router.replace(customerKaelWorkRoute as never)
      return
    }
    const focus = routeScopeChangeParam
      ? '&focus=approval'
      : legacyActivityScreen?.startsWith('3.')
        ? '&focus=payment'
        : ''
    router.replace(customerCaseWorkRouteForDeal(deal, focus) as never)
  }, [deal, legacyActivityScreen, routeJobId, routeScopeChangeParam, router, shouldOpenCaseWork])

  const rebookService = (item: CustomerServiceHistoryItem) => {
    const serviceId = customerBookingServiceIdForHistory[item.service_type]
    router.replace(`/(customer)/booking?service=${encodeURIComponent(serviceId)}` as never)
  }

  const openHistoryDetail = (item: CustomerServiceHistoryItem) => {
    router.replace(`/(customer)/kael-chat?mode=case&jobId=${encodeURIComponent(item.id)}` as never)
  }

  return (
    <CustomerServiceHistorySurface
      onBack={() => router.replace('/(customer)/home' as never)}
      onOpenDetail={openHistoryDetail}
      onRebook={rebookService}
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
  const directProfileUtility = profileUtilityParam(firstParam(params.utility))
  const requestedPanel = profilePanelForScreen(directProfileScreen) ?? profilePanelParam(firstParam(params.panel))
  const [panel, setPanel] = useState<CustomerProfilePanel>(() => requestedPanel ?? 'overview')
  const name = profileName(session?.user.user_metadata, language)
  const accountJourney = customerAccountJourneyDisplay({
    activeServiceDays: insights?.active_service_days,
    createdAt: insights?.member_since ?? session?.user.created_at,
    fallback: copy.dataPending,
    language,
  })
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

  if (directProfileUtility) {
    return (
      <V21Screen key={`profile-utility-${directProfileUtility}`} screenId="6.1-profile-overview" testID="customer-v21-profile">
        <CustomerProfileSubscreenView
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
    panel === 'ranking' ? '6.2-usage-ranking' : panel === 'money' ? '6.3-protect-money' : '6.1-profile-overview'
  if (panel !== 'overview') {
    return (
      <V21Screen key={profileScreenId} screenId={profileScreenId} testID="customer-v21-profile">
        <CustomerProfileSubscreenView
          body={(
            <>
              {panel === 'ranking' ? <ProfileRanking insights={insights} /> : null}
              {panel === 'money' ? <ProfileMoney insights={insights} /> : null}
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
        accountJourney={accountJourney}
        initials={initialsForName(name)}
        name={name}
        onOpenRanking={() => openProfilePanel('ranking', '6.2-usage-ranking')}
        onSignOut={() => void signOut()}
        rankingAccessibilityLabel={language === 'vi' ? 'Xem xếp hạng sử dụng' : 'View usage ranking'}
        rankingBody={language === 'vi' ? 'Kael đánh giá từ dữ liệu sử dụng thật.' : 'Kael evaluates real usage data.'}
        rankingLabel={language === 'vi' ? 'Xếp hạng sử dụng' : 'Usage ranking'}
        rankingMetaLabel={usageRankPointsLabel}
        rankingProgressNode={<ProfileProgressBar percent={usageRankProgress} testID="customer-v21-profile-ranking-entry-progress" />}
        rankingProgressSourceLabel={language === 'vi' ? 'Tăng theo hoạt động thật' : 'Grows with real activity'}
        rankingStatus={usageRankStatus}
        rankingStatusActive={usageRank > 0}
        rankingStatusTextStyle={usageRank > 0 ? styles.profileMintChipText : profileUtilityStyles.profileRankingEmptyChipText}
        rootStyles={styles}
        signOutLabel={language === 'vi' ? 'Đăng xuất' : 'Sign out'}
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
      />
    </V21Screen>
  )
}

export function CustomerKaelSurface() {
  return <KaelChatSurface />
}

export function KaelChatSurface() {
  const language = useAppLanguage()
  const params = useLocalSearchParams<{ focus?: string | string[]; jobId?: string | string[]; mode?: string | string[]; ns_audit_role?: string | string[]; screen?: string | string[]; sessionId?: string | string[]; service?: string | string[] }>()
  const router = useRouter()
  const workflow = useFrontendWorkflow()
  const { session } = useAuth()
  const sessionAccessToken = session?.access_token
  const { reduceMotion, reduceTransparency, tokens } = useV21Theme()
  const [pendingDraft, setPendingDraftState] = useState(() => peekPendingKaelChatDraft())
  const pendingDraftLocalizedMessage = pendingDraft
    ? pendingDraft.description?.trim() || (
        pendingDraft.locale === language || !pendingDraft.serviceType
          ? pendingDraft.message
          : buildBookingDraftMessage({
              address: pendingDraft.addressLabel ?? pendingDraft.districtLabel ?? '',
              description: '',
              language,
              problems: pendingDraft.problemChips ?? [],
              scheduleLabel: pendingDraft.scheduleWindow
                ? `${pendingDraft.scheduleWindow.date} · ${pendingDraft.scheduleWindow.start}-${pendingDraft.scheduleWindow.end}`
                : null,
              serviceType: pendingDraft.serviceType,
            })
      )
    : null
  const [routeDraftEvidencePending, setRouteDraftEvidencePending] = useState(() => Boolean(peekPendingKaelChatDraft()))
  const routeModeParam = firstParam(params.mode)
  const explicitRouteMode: CustomerKaelMode | null = routeModeParam === 'case'
    ? 'case'
    : routeModeParam === 'normal'
      ? 'normal'
      : null
  const routeMode = explicitRouteMode ?? chatScreenModeParam(firstParam(params.screen)) ?? 'normal'
  const routeJobId = cleanRouteJobId(firstParam(params.jobId))
  const workflowDeal = workflow.state.deal
  const workflowCaseDeal = isRealCaseDeal(workflowDeal) ? workflowDeal : null
  const routeDerivedMode: CustomerKaelMode = routeMode === 'case' || routeJobId || pendingDraft ? 'case' : 'normal'
  const [localMode, setLocalMode] = useState<CustomerKaelMode>(routeDerivedMode)
  const [modeMenuOpen, setModeMenuOpen] = useState(false)
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false)
  const [blankCaseTransition, setBlankCaseTransition] = useState(false)
  const mode: CustomerKaelMode = localMode
  const conversations = useCustomerKaelConversations(mode, language)
  const {
    busy: conversationBusy,
    openSession: openCatalogConversation,
    resetToBlank: resetCatalogConversation,
    startNewSession: startCatalogConversation,
    syncLinkedCaseSession,
    syncLinkedJobSession,
  } = conversations
  const [selectedService, setSelectedService] = useState<ServiceType | null>(pendingDraft?.serviceType ?? workflowCaseDeal?.draft.serviceType ?? serviceParam(firstParam(params.service)))
  const [draft, setDraft] = useState('')
  const [chat, setChat] = useState<KaelChatResponse | null>(null)
  const [chatModeOwner, setChatModeOwner] = useState<CustomerKaelMode | null>(null)
  const [turns, setTurns] = useState<KaelChatTurn[]>([])
  const [assistantTurns, setAssistantTurns] = useState<CustomerAssistantLocalTurn[]>([])
  const activeChat = chatModeOwner === mode ? chat : null
  const activeTurns = chatModeOwner === mode ? turns : []
  const activeCatalogCaseJobId = conversations.activeResponse?.session.case_job_id ?? null
  const activeCatalogCaseSessionId = conversations.activeResponse?.session.case_session_id ?? null
  const catalogCaseOwnsSurface = mode === 'case' && (
    blankCaseTransition || Boolean(conversations.activeSessionId)
  )
  const activeCatalogCaseMatchesWorkflowDeal = Boolean(
    activeCatalogCaseSessionId
    && activeChat?.session.id === activeCatalogCaseSessionId
    && activeChat.session.job_id
    && activeChat.session.job_id === workflowCaseDeal?.id,
  )
  const deal = catalogCaseOwnsSurface
    ? activeCatalogCaseMatchesWorkflowDeal ? workflowCaseDeal : null
    : workflowCaseDeal
  const candidateJobId = deal?.status === 'worker_candidate_pending' ? deal.id : null
  const caseServiceLabel = deal?.draft.serviceType ? customerV21ServiceCopy[language][deal.draft.serviceType].label : null
  const jobIncidentThread = useJobChatThread(deal?.id ?? null, Boolean(deal && mode === 'case'))
  const [loading, setLoading] = useState(false)
  const [hydratingCase, setHydratingCase] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [composerMediaDrafts, setComposerMediaDrafts] = useState<LocalMediaUploadDraft[]>(() => pendingDraft?.photoDrafts ? [...pendingDraft.photoDrafts] : [])
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const [caseEditOpen, setCaseEditOpen] = useState(false)
  const [confirmingAgenticEstimate, setConfirmingAgenticEstimate] = useState(false)
  const [confirmingCaseQuote, setConfirmingCaseQuote] = useState(false)
  const [confirmingCompletion, setConfirmingCompletion] = useState(false)
  const [caseQuoteRejectOpen, setCaseQuoteRejectOpen] = useState(false)
  const [caseQuoteRejectReason, setCaseQuoteRejectReason] = useState('')
  const [caseOptionsAcknowledged, setCaseOptionsAcknowledged] = useState(false)
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
  const modeMenuOpacity = useSharedValue(reduceMotion ? 1 : 0)
  const modeMenuScale = useSharedValue(reduceMotion ? 1 : 0.96)
  const modeMenuSheenOpacity = useSharedValue(0)
  const modeMenuSheenX = useSharedValue(-92)
  const modeMenuTranslateY = useSharedValue(reduceMotion ? 0 : -6)
  const processLineTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const processLineRunRef = useRef(0)
  const processLineWaitersRef = useRef<(() => void)[]>([])
  const [caseSessionLoads] = useState(() => new Map<string, Promise<boolean>>())

  const clearProcessLineTimers = useCallback(() => {
    processLineTimersRef.current.forEach((timer) => clearTimeout(timer))
    processLineTimersRef.current = []
  }, [])

  const resolveProcessLineWaiters = useCallback(() => {
    const waiters = processLineWaitersRef.current
    processLineWaitersRef.current = []
    waiters.forEach((resolve) => resolve())
  }, [])

  const stopProcessLines = useCallback(() => {
    processLineRunRef.current += 1
    clearProcessLineTimers()
    resolveProcessLineWaiters()
    setProcessLines(null)
  }, [clearProcessLineTimers, resolveProcessLineWaiters])

  const loadCatalogCaseSession = useCallback((caseSessionId: string) => {
    const inFlight = caseSessionLoads.get(caseSessionId)
    if (inFlight) return inFlight
    const request = kaelChatService.get(caseSessionId)
      .then((loaded) => {
        if (!loaded.success) {
          setError(localizeKaelRequestFailure(loaded, language))
          return false
        }
        setChat(loaded.data)
        setChatModeOwner('case')
        setTurns(loaded.data.turns)
        setSelectedService(loaded.data.session.service_type)
        if (loaded.data.session.job_id && typeof workflow.actions.hydrateRemoteJobById === 'function') {
          void workflow.actions.hydrateRemoteJobById(loaded.data.session.job_id)
        }
        return true
      })
      .finally(() => {
        if (caseSessionLoads.get(caseSessionId) === request) {
          caseSessionLoads.delete(caseSessionId)
        }
      })
    caseSessionLoads.set(caseSessionId, request)
    return request
  }, [caseSessionLoads, language, workflow.actions])

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
  }, [clearProcessLineTimers, resolveProcessLineWaiters])

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

  const caseOptionsDealId = deal?.id
  const caseOptionsDealStatus = deal?.status
  const caseEvidenceMediaCount = deal?.draft.mediaCount
  useEffect(() => {
    if (caseOptionsDealStatus === 'awaiting_customer_confirm') return
    setCaseOptionsAcknowledged(false)
  }, [caseOptionsDealId, caseOptionsDealStatus])

  useEffect(() => {
    setCaseEvidenceRejectOpen(false)
    setCaseEvidenceReason('')
    setSubmittingCaseEvidence(false)
  }, [caseEvidenceMediaCount, caseOptionsDealId])

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

  const automaticCaseJobId = mode === 'case' && !blankCaseTransition
    ? routeJobId ?? (!conversations.activeSessionId ? workflowCaseDeal?.id ?? null : null)
    : null

  useEffect(() => {
    if (!automaticCaseJobId || activeCatalogCaseJobId === automaticCaseJobId) return
    void syncLinkedJobSession(automaticCaseJobId)
  }, [activeCatalogCaseJobId, automaticCaseJobId, syncLinkedJobSession])

  useEffect(() => {
    if (
      mode !== 'case'
      || !activeCatalogCaseSessionId
      || activeChat?.session.id === activeCatalogCaseSessionId
      || (routeJobId && activeCatalogCaseJobId !== routeJobId)
    ) return
    void loadCatalogCaseSession(activeCatalogCaseSessionId)
  }, [
    activeCatalogCaseJobId,
    activeCatalogCaseSessionId,
    activeChat?.session.id,
    loadCatalogCaseSession,
    mode,
    routeJobId,
  ])

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
            setChatModeOwner(routeMode)
            setTurns(result.data.turns)
            setSelectedService(result.data.session.service_type)
          } else {
            setError(localizeKaelRequestFailure(result, language))
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
      return () => {
        cancelled = true
      }
    }

    const pendingServiceType = pendingDraft?.serviceType
    if (pendingServiceType && sessionAccessToken) {
      const pendingDraftDescription = pendingDraftLocalizedMessage ?? pendingDraft.message
      setLoading(true)
      const createFromBasicIntake = async () => {
        const uploaded = await uploadKaelChatMediaDrafts(pendingDraft.photoDrafts ?? [])
        if (!uploaded.success) return uploaded
        const created = await kaelChatService.create({
          address_district: pendingDraft.districtLabel ?? undefined,
          address_label: pendingDraft.addressLabel,
          client_request_id: pendingDraft.clientRequestId ?? generateClientRequestId(),
          evidence_items: uploaded.evidenceItems,
          language,
          message: pendingDraftDescription,
          problem_chips: pendingDraft.problemChips ?? [],
          photo_urls: uploaded.urls,
          profileId: pendingDraft.profileId,
          scheduledAt: pendingDraft.scheduledAt,
          scheduleWindow: pendingDraft.scheduleWindow,
          service_type: pendingServiceType,
        })
        if (!created.success) await cleanupKaelChatMediaRefs(uploaded.mediaRefs)
        return created
      }
      createFromBasicIntake()
        .then((result) => {
          if (cancelled) return
          if (result.success) {
            clearPendingKaelChatDraft()
            setPendingDraftState(null)
            setRouteDraftEvidencePending(false)
            setComposerMediaDrafts([])
            setChat(result.data)
            setChatModeOwner('case')
            setTurns(result.data.turns)
            setSelectedService(result.data.session.service_type)
            void syncLinkedCaseSession(result.data.session.id)
          } else {
            setError(localizeKaelRequestFailure(result, language))
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }
    return () => {
      cancelled = true
    }
  }, [language, params.sessionId, pendingDraft, pendingDraftLocalizedMessage, routeMode, sessionAccessToken, syncLinkedCaseSession])

  const pickComposerMedia = async () => {
    if (mode === 'case' && deal && !caseEvidenceGateActive && !agenticEvidenceGateActive) return
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
      preferredAssetRepresentationMode: 'compatible' as ImagePicker.UIImagePickerPreferredAssetRepresentationMode,
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
      durationMillis: asset.duration ?? undefined,
    }))
    setComposerMediaDrafts((current) => mergeMediaDrafts(current, drafts, 5))
    setError(null)
  }

  const submitAgenticEvidence = async (decision: 'confirmed' | 'skipped') => {
    if (!activeChat?.session.id || submittingAgenticEvidence) return
    const reviewedVoiceTranscript = voiceTranscript.trim()
    if (decision === 'confirmed' && composerMediaDrafts.length === 0 && !reviewedVoiceTranscript) {
      setError(language === 'vi' ? 'Thêm ảnh, video hoặc bản chép lời trước khi xác nhận.' : 'Add media or an editable transcript before confirming.')
      return
    }
    setSubmittingAgenticEvidence(true)
    setLoading(true)
    setError(null)
    let photoUrls: string[] = []
    let uploadedMediaRefs: string[] = []
    let mediaAccepted = false
    let evidenceItems: CaseWorkEvidence[] = reviewedVoiceTranscript
      ? [{ kind: 'voice_transcript', transcript: reviewedVoiceTranscript, model_eligible: true }]
      : []
    try {
      if (decision === 'confirmed') {
        setUploadingMedia(true)
        const uploaded = await uploadKaelChatMediaDrafts(composerMediaDrafts)
        setUploadingMedia(false)
        if (!uploaded.success) {
          setError(localizeMediaUploadFailure(uploaded, language))
          return
        }
        photoUrls = uploaded.urls
        uploadedMediaRefs = uploaded.mediaRefs
        evidenceItems = [...evidenceItems, ...uploaded.evidenceItems]
      }
      const firstCustomerMessage = activeTurns.find((turn) => turn.role === 'customer' && turn.text_content)?.text_content ?? null
      const sourceMessage = pendingDraftLocalizedMessage || firstCustomerMessage || (language === 'vi' ? 'Khách đã gửi ngữ cảnh dịch vụ.' : 'Customer sent service context.')
      const processPrompt = decision === 'confirmed'
        ? (language === 'vi' ? 'Đã gửi bằng chứng hiện trạng.' : 'Sent current evidence.')
        : (language === 'vi' ? 'Tiếp tục không có bằng chứng.' : 'Continue without evidence.')
      const processDone = startProcessLines(processPrompt, {
        complexity: null,
        mediaCount: composerMediaDrafts.length + (reviewedVoiceTranscript ? 1 : 0),
        mode: mode === 'case' ? 'case' : 'normal',
        serviceType: selectedService ?? activeChat.session.service_type,
      })
      const result = await kaelChatService.submitEvidence(activeChat.session.id, {
        decision,
        evidence_items: evidenceItems,
        language,
        message: reviewedVoiceTranscript || sourceMessage,
        photo_urls: photoUrls,
        media_refs: [],
        problem_chips: pendingDraft?.problemChips ?? [],
        skip_reason: decision === 'skipped' ? agenticEvidenceReason.trim() || undefined : undefined,
      })
      if (result.success) {
        mediaAccepted = true
        await processDone
        stopProcessLines()
        clearPendingKaelChatDraft()
        setRouteDraftEvidencePending(false)
        setChat(result.data)
        setChatModeOwner(mode)
        setTurns(result.data.turns)
        setComposerMediaDrafts([])
        setVoiceTranscript('')
        setAgenticEvidenceRejectOpen(false)
        setAgenticEvidenceReason('')
      } else if (shouldUseLegacyKaelEvidenceFallback(result, photoUrls)) {
        const legacy = await kaelChatService.sendTurn(activeChat.session.id, {
          address_district: pendingDraft?.districtLabel ?? undefined,
          address_label: pendingDraft?.addressLabel,
          evidence_items: evidenceItems,
          language,
          message: processPrompt,
          photo_urls: photoUrls,
          problem_chips: pendingDraft?.problemChips ?? [],
        })
        if (legacy.success) {
          mediaAccepted = true
          await processDone
          stopProcessLines()
          clearPendingKaelChatDraft()
          setRouteDraftEvidencePending(false)
          setChat(legacy.data)
          setChatModeOwner(mode)
          setTurns(legacy.data.turns)
          setComposerMediaDrafts([])
          setVoiceTranscript('')
          setAgenticEvidenceRejectOpen(false)
          setAgenticEvidenceReason('')
        } else {
          stopProcessLines()
          setError(localizeKaelRequestFailure(legacy, language))
        }
      } else {
        stopProcessLines()
        setError(localizeKaelRequestFailure(result, language))
      }
    } finally {
      if (!mediaAccepted && uploadedMediaRefs.length > 0) {
        await cleanupKaelChatMediaRefs(uploadedMediaRefs)
      }
      setUploadingMedia(false)
      setSubmittingAgenticEvidence(false)
      setLoading(false)
    }
  }

  const submitCaseEvidence = async (decision: 'confirmed' | 'skipped') => {
    if (!deal?.id || submittingCaseEvidence) return
    const reviewedVoiceTranscript = voiceTranscript.trim()
    if (decision === 'confirmed' && composerMediaDrafts.length === 0 && !reviewedVoiceTranscript) {
      setError(language === 'vi' ? 'Thêm ảnh, video hoặc bản chép lời trước khi xác nhận.' : 'Add media or an editable transcript before confirming.')
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
      if (decision === 'confirmed' && composerMediaDrafts.length > 0) {
        setUploadingMedia(true)
        const uploaded = await uploadJobMediaDrafts(deal.id, composerMediaDrafts, 'before')
        setUploadingMedia(false)
        if (!uploaded.success) {
          stopProcessLines()
          setError(localizeMediaUploadFailure(uploaded, language))
          return
        }
      }
      if (decision === 'confirmed' && reviewedVoiceTranscript) {
        const storedTranscript = await jobService.sendMessage(deal.id, { content: reviewedVoiceTranscript })
        if (!storedTranscript.success) {
          stopProcessLines()
          setError(localizeKaelRequestFailure(storedTranscript, language))
          return
        }
      }
      if (typeof workflow.actions.hydrateRemoteJobById === 'function') {
        await workflow.actions.hydrateRemoteJobById(deal.id)
      }
      await processDone
      setCaseEvidenceRejectOpen(false)
      setCaseEvidenceReason('')
      setComposerMediaDrafts([])
      setVoiceTranscript('')
    } finally {
      setUploadingMedia(false)
      setSubmittingCaseEvidence(false)
      setLoading(false)
      stopProcessLines()
    }
  }

  const sendMessage = async () => {
    const reviewedVoiceTranscript = voiceTranscript.trim()
    const message = draft.trim() || reviewedVoiceTranscript
    const hasComposerMedia = composerMediaDrafts.length > 0
    if (!message && !hasComposerMedia && !reviewedVoiceTranscript) return
    if (mode === 'normal') {
      if (hasComposerMedia) {
        setError(language === 'vi'
          ? 'Ảnh và video được xử lý trong mục Xử lý công việc.'
          : 'Photos and videos are handled in Work handling.')
        return
      }
      const processDone = startProcessLines(message, {
        complexity: null,
        mediaCount: 0,
        mode: 'normal',
        serviceType: null,
      })
      setLoading(true)
      setError(null)
      try {
        const result = await conversations.sendConversationTurn(message)
        if (result) {
          await processDone
          setDraft('')
          setVoiceTranscript('')
        } else {
          setError(conversations.sessionsError ?? (language === 'vi' ? 'Kael chưa thể trả lời lúc này.' : 'Kael could not reply right now.'))
        }
      } finally {
        setLoading(false)
        stopProcessLines()
      }
      return
    }
    if (mode === 'case' && deal) {
      if (hasComposerMedia) {
        setError(language === 'vi' ? 'Ảnh/video cần gửi qua công việc thật.' : 'Media requires a real job.')
        return
      }
      if (!deal?.id) {
        setError(language === 'vi' ? 'Chưa có' : 'Empty')
        return
      }
      if (hasSharedJobIncident) {
        setLoading(true)
        setError(null)
        const sent = await jobIncidentThread.send(message)
        setLoading(false)
        if (sent) {
          setDraft('')
          setVoiceTranscript('')
        } else {
          setError(jobIncidentThread.error ?? (language === 'vi' ? 'Chưa thể gửi vào Kael Công việc.' : 'Kael Work could not send this message.'))
        }
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
        const result = await conversations.sendConversationTurn(message)
        if (result) {
          await processDone
          setDraft('')
        } else {
          setError(conversations.sessionsError ?? (language === 'vi' ? 'Kael chưa thể trả lời lúc này.' : 'Kael could not reply right now.'))
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
      hasComposerMedia || reviewedVoiceTranscript || pendingDraft || activeChat || intakeIntent,
    )
    if (!shouldUseIntake) {
      setLoading(true)
      setError(null)
      const processDone = startProcessLines(message, {
        complexity: null,
        mediaCount: 0,
        mode: 'case',
        serviceType: null,
      })
      try {
        const result = await conversations.sendConversationTurn(message)
        if (result) {
          await processDone
          setDraft('')
        } else {
          setError(conversations.sessionsError ?? (language === 'vi' ? 'Kael chưa thể tiếp nhận nội dung này.' : 'Kael could not receive this message.'))
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
    const catalogConversation = activeChat
      ? await conversations.syncLinkedCaseSession(activeChat.session.id) ?? await conversations.ensureActiveSession()
      : await conversations.ensureActiveSession()
    if (!catalogConversation) {
      setError(language === 'vi' ? 'Chưa thể mở phiên Xử lý công việc.' : 'A Work handling session could not be opened.')
      return
    }
    setLoading(true)
    setError(null)
    let photoUrls: string[] = []
    let uploadedMediaRefs: string[] = []
    let evidenceItems: CaseWorkEvidence[] = reviewedVoiceTranscript
      ? [{ kind: 'voice_transcript', transcript: reviewedVoiceTranscript, model_eligible: true }]
      : []
    if (hasComposerMedia) {
      setUploadingMedia(true)
      const uploaded = await uploadKaelChatMediaDrafts(composerMediaDrafts)
      setUploadingMedia(false)
      if (!uploaded.success) {
        setLoading(false)
        stopProcessLines()
        setError(localizeMediaUploadFailure(uploaded, language))
        return
      }
      photoUrls = uploaded.urls
      uploadedMediaRefs = uploaded.mediaRefs
      evidenceItems = [...evidenceItems, ...uploaded.evidenceItems]
    }
    const outgoingMessage = message || (language === 'vi' ? 'Đã gửi ảnh/video.' : 'Sent media.')
    const processDone = startProcessLines(outgoingMessage, {
      complexity: null,
      mediaCount: composerMediaDrafts.length + (reviewedVoiceTranscript ? 1 : 0),
      mode: mode === 'case' ? 'case' : 'normal',
      serviceType: inferredService,
    })
    const result = activeChat
      ? await kaelChatService.sendTurn(activeChat.session.id, {
          evidence_items: evidenceItems,
          language,
          message: outgoingMessage,
          photo_urls: photoUrls,
        })
      : await kaelChatService.create({
          client_request_id: catalogConversation.session.client_request_id,
          evidence_items: evidenceItems,
          language,
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
      setChatModeOwner(mode)
      setTurns(result.data.turns)
      setDraft('')
      setVoiceTranscript('')
      setComposerMediaDrafts([])
      setAgenticRejectOpen(false)
      setAgenticRejectReason('')
      await conversations.syncLinkedCaseSession(result.data.session.id)
    } else {
      await cleanupKaelChatMediaRefs(uploadedMediaRefs)
      setLoading(false)
      stopProcessLines()
      setError(localizeKaelRequestFailure(result, language))
    }
  }

  const chatEstimate = activeChat?.session.estimate ?? activeTurns.find((turn) => turn.estimate)?.estimate ?? null
  const normalVisibleTurns = activeTurns.filter((turn) =>
    turn.content_type !== 'estimate' &&
    !isScriptedKaelAcknowledgementTurn(turn))
  const catalogConversationTurns = conversations.turns.map((turn) => ({
    id: turn.id,
    role: turn.role === 'customer' ? 'customer' as const : 'kael' as const,
    text_content: turn.text_content,
  }))
  const normalAssistantTurns = mode === 'normal' ? catalogConversationTurns : []
  const hasSharedJobIncident = jobIncidentThread.messages.some((message) =>
    message.sender_role === 'kael' && message.content.startsWith('Kael Công việc:'),
  )
  const sharedJobIncidentTurns = hasSharedJobIncident
    ? jobIncidentThread.messages.map((message) => ({
      id: `job-incident-${message.id}`,
      role: message.sender_role,
      surface: 'customer_case' as const,
      text_content: message.sender_role === 'worker'
        ? `${language === 'vi' ? 'Thợ: ' : 'Worker: '}${message.content}`
        : message.content,
    }))
    : []
  const caseAssistantTurns = [
    ...(mode === 'case' ? catalogConversationTurns : []),
    ...assistantTurns.filter((turn) => turn.surface === 'customer_case'),
    ...sharedJobIncidentTurns,
  ]
  const backendDraftCustomerTurn = routeDraftEvidencePending
    ? normalVisibleTurns.find((turn) => turn.role === 'customer' && turn.text_content?.trim())
    : null
  const pendingDraftMessage = pendingDraftLocalizedMessage?.trim() ?? backendDraftCustomerTurn?.text_content?.trim() ?? ''
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
  const routeIntakeHasWorkState = Boolean(pendingDraft || activeChat || loading || normalVisibleTurns.length > 0)
  const workIntakeActive = mode === 'case' && !deal && routeIntakeHasWorkState
  const normalIntakeActive = mode === 'normal' && !routeDraftOwnsIntake && routeIntakeHasWorkState
  const agenticIntakeModeActive = normalIntakeActive || workIntakeActive
  const diagnosisScope = activeChat?.session.diagnosis_scope
  const artifactNextAction = diagnosisScope && typeof diagnosisScope.next_action === 'object' && diagnosisScope.next_action
    ? diagnosisScope.next_action as Record<string, unknown>
    : null
  const serverRequestsEvidence = artifactNextAction?.kind === 'request_evidence'
  const serverEvidenceKind = artifactNextAction?.evidence_kind === 'photo' ||
      artifactNextAction?.evidence_kind === 'video_frame' ||
      artifactNextAction?.evidence_kind === 'voice_transcript'
    ? artifactNextAction.evidence_kind
    : undefined
  const serverEvidencePrompt = serverRequestsEvidence
    ? localizedCaseWorkEvidencePrompt({
        blockers: Array.isArray(diagnosisScope?.quote_blockers)
          ? diagnosisScope.quote_blockers.filter((value: unknown): value is string => typeof value === 'string')
          : [],
        evidenceKind: serverEvidenceKind,
        language,
      })
    : undefined
  const serverPriceReviewBlocked = artifactNextAction?.kind === 'escalate'
  const serverSafetyMessages = Array.isArray(diagnosisScope?.safety_flags)
    ? diagnosisScope.safety_flags.flatMap((flag: unknown) => {
        if (!flag || typeof flag !== 'object') return []
        const code = (flag as { code?: unknown }).code
        return typeof code === 'string' && code.trim() ? [localizedCaseWorkSafetyMessage(code, language)] : []
      })
    : []
  const agenticAnalysisActive = agenticIntakeModeActive && activeChat?.session.case_phase === 'analysis'
  const offerReviewActive = agenticIntakeModeActive &&
    activeChat?.session.case_phase === 'offer_review' &&
    activeChat.session.status === 'estimate_ready' &&
    activeChat.session.next_action === 'estimate_ready'
  const missingCaseWorkDeal = mode === 'case' && !deal && !workIntakeActive
  const routeDraftHasStructuredOutcome = Boolean(
    offerReviewActive ||
    activeChat?.session.job_id ||
    activeChat?.session.status === 'estimate_ready' ||
    activeChat?.session.status === 'confirmed' ||
    activeChat?.session.next_action === 'estimate_ready' ||
    activeChat?.session.next_action === 'confirmed',
  )
  const routeDraftAwaitingAgenticStep = workIntakeActive &&
    routeDraftOwnsIntake &&
    !processLines &&
    !routeDraftHasStructuredOutcome &&
    (routeDraftEvidencePending || !activeChat || activeChat.session.status === 'collecting_evidence' || !hasActionableAgenticTurn)
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
  const caseEvidenceGateActive = false
  const agenticEvidenceGateActive = agenticIntakeModeActive &&
    !submittingAgenticEvidence &&
    !processLines &&
    serverRequestsEvidence
  const canConfirmAgenticEstimate = offerReviewActive &&
    Boolean(activeChat?.session.id && chatEstimate && chatEstimate.confidence >= 0.7 && chatEstimate.needs_inspection !== true && activeChat?.session.status === 'estimate_ready' && activeChat?.session.next_action === 'estimate_ready')
  const agenticEstimateConfirmed = activeChat?.session.status === 'confirmed' || activeChat?.session.next_action === 'confirmed' || Boolean(activeChat?.session.job_id)
  const confirmAgenticEstimate = async () => {
    if (!activeChat?.session.id || !chatEstimate || confirmingAgenticEstimate) return
    setConfirmingAgenticEstimate(true)
    setAgenticRejectOpen(false)
    setAgenticRejectReason('')
    setError(null)
    const processPrompt = language === 'vi'
      ? 'Đã xác nhận đề xuất. Kael đang mở công việc thật.'
      : 'Estimate confirmed. Kael is opening the real job.'
    const processDone = startProcessLines(processPrompt, {
      complexity: chatEstimate.complexity ?? null,
      mediaCount: totalMediaRefs(activeTurns),
      mode: mode === 'case' ? 'case' : 'normal',
      serviceType: activeChat.session.service_type,
    })
    try {
      const confirmed = await kaelChatService.confirm(activeChat.session.id)
      if (!confirmed.success) {
        stopProcessLines()
        setError(localizeKaelRequestFailure(confirmed, language))
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
        setChatModeOwner('case')
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
    if (!activeChat?.session.id || submittingAgenticRejectReason || !reason) return
    setSubmittingAgenticRejectReason(true)
    setLoading(true)
    setError(null)
    const processDone = startProcessLines(reason, {
      complexity: chatEstimate?.complexity ?? null,
      mediaCount: 0,
      mode: mode === 'case' ? 'case' : 'normal',
      serviceType: activeChat.session.service_type,
    })
    try {
      const result = await kaelChatService.sendTurn(activeChat.session.id, {
        language,
        message: reason,
        photo_urls: [],
      })
      if (result.success) {
        await processDone
        setChat(result.data)
        setChatModeOwner(mode)
        setTurns(result.data.turns)
        setAgenticRejectOpen(false)
        setAgenticRejectReason('')
      } else {
        stopProcessLines()
        setError(localizeKaelRequestFailure(result, language))
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
      const result = await conversations.sendConversationTurn(reason)
      if (result) {
        await processDone
        setCaseQuoteRejectOpen(false)
        setCaseQuoteRejectReason('')
        setCaseEditOpen(true)
      } else {
        stopProcessLines()
        setError(conversations.sessionsError ?? (language === 'vi' ? 'Kael chưa thể trả lời lúc này.' : 'Kael could not reply right now.'))
      }
    } finally {
      setSubmittingCaseQuoteRejectReason(false)
      setLoading(false)
      stopProcessLines()
    }
  }

  const confirmCaseCompletion = async () => {
    if (deal?.status !== 'completed_by_worker' || confirmingCompletion) return
    setConfirmingCompletion(true)
    setError(null)
    try {
      const confirmed = await workflow.actions.customerConfirmCompletion()
      if (!confirmed) {
        setError(language === 'vi' ? 'Chưa thể xác nhận hoàn tất' : 'Completion could not be confirmed')
      }
    } finally {
      setConfirmingCompletion(false)
    }
  }

  const openActivity = () => {
    router.replace('/(customer)/history' as never)
  }

  const normalEvidenceCount = Math.max(pendingDraft?.mediaCount ?? 0, totalMediaRefs(activeTurns))
  const showNormalEvidence = agenticIntakeModeActive && !agenticEvidenceGateActive && !processLines && normalEvidenceCount > 0
  const visualAuditCustomerSuffix = firstParam(params.ns_audit_role) === 'customer'
    ? '&ns_audit_role=customer'
    : ''
  const normalChatRoute = `${customerKaelChatRoute}${visualAuditCustomerSuffix}`
  const blankCaseWorkRoute = `${customerKaelWorkRoute}${visualAuditCustomerSuffix}`
  const caseWorkRoute = `${customerCaseWorkRouteForDeal(deal)}${visualAuditCustomerSuffix}`
  const switchChatMode = (nextMode: CustomerKaelMode) => {
    setLocalMode(nextMode)
    setBlankCaseTransition(false)
    setModeMenuOpen(false)
    setSessionMenuOpen(false)
    setCaseEditOpen(false)
    setComposerMediaDrafts([])
    setDraft('')
    setError(null)
    setAgenticRejectOpen(false)
    setAgenticRejectReason('')
    setAgenticEvidenceRejectOpen(false)
    setAgenticEvidenceReason('')
    stopProcessLines()
    router.replace(nextMode === 'case' ? caseWorkRoute as never : normalChatRoute as never)
  }
  const resetConversationVisualState = useCallback(() => {
    const currentSurface = mode === 'normal' ? 'customer_normal' : 'customer_case'
    setModeMenuOpen(false)
    setSessionMenuOpen(false)
    setCaseEditOpen(false)
    setComposerMediaDrafts([])
    setDraft('')
    setVoiceTranscript('')
    setError(null)
    setAgenticRejectOpen(false)
    setAgenticRejectReason('')
    setAgenticEvidenceRejectOpen(false)
    setAgenticEvidenceReason('')
    setCaseQuoteRejectOpen(false)
    setCaseQuoteRejectReason('')
    setCaseEvidenceRejectOpen(false)
    setCaseEvidenceReason('')
    setAssistantTurns((current) => current.filter((turn) => turn.surface !== currentSurface))
    stopProcessLines()

    if (chatModeOwner === mode) {
      setChat(null)
      setChatModeOwner(null)
      setTurns([])
    }

    if (mode === 'case') {
      clearPendingKaelChatDraft()
      setPendingDraftState(null)
      setRouteDraftEvidencePending(false)
      setSelectedService(null)
    } else if (mode === 'normal') {
      setSelectedService(null)
    }

  }, [chatModeOwner, mode, stopProcessLines])
  const startNewConversation = useCallback(async () => {
    if (loading || uploadingMedia || conversationBusy) return
    setBlankCaseTransition(mode === 'case')
    resetConversationVisualState()
    resetCatalogConversation()
    const created = await startCatalogConversation()
    if (!created) {
      setBlankCaseTransition(false)
      setError(language === 'vi' ? 'Chưa thể tạo cuộc trò chuyện mới.' : 'A new conversation could not be created.')
      return
    }
    setBlankCaseTransition(false)
    router.replace(mode === 'case' ? blankCaseWorkRoute as never : normalChatRoute as never)
  }, [
    blankCaseWorkRoute,
    conversationBusy,
    language,
    loading,
    mode,
    normalChatRoute,
    resetConversationVisualState,
    resetCatalogConversation,
    router,
    startCatalogConversation,
    uploadingMedia,
  ])
  const openConversation = useCallback(async (conversationId: string) => {
    if (loading || uploadingMedia || conversationBusy) return
    setBlankCaseTransition(false)
    setSessionMenuOpen(false)
    const opened = await openCatalogConversation(conversationId)
    if (!opened) return
    resetConversationVisualState()
    if (opened.session.mode === 'normal' || !opened.session.case_session_id) {
      router.replace(opened.session.mode === 'case' ? blankCaseWorkRoute as never : normalChatRoute as never)
      return
    }

    setLoading(true)
    const loaded = await loadCatalogCaseSession(opened.session.case_session_id)
    setLoading(false)
    if (!loaded) return
    router.replace(blankCaseWorkRoute as never)
  }, [
    blankCaseWorkRoute,
    conversationBusy,
    loadCatalogCaseSession,
    loading,
    normalChatRoute,
    openCatalogConversation,
    resetConversationVisualState,
    router,
    uploadingMedia,
  ])
  const archiveConversation = useCallback(async (conversationId: string) => {
    const target = conversations.sessions.find((session) => session.id === conversationId)
    const wasActive = conversations.activeSessionId === conversationId
    const archived = await conversations.archiveSession(conversationId)
    if (!archived) return false

    const closesVisibleCase = Boolean(
      target?.case_session_id
      && (wasActive || target.case_job_id === workflowCaseDeal?.id),
    )
    if (closesVisibleCase) {
      setSessionMenuOpen(false)
      setBlankCaseTransition(true)
      resetConversationVisualState()
      router.replace(blankCaseWorkRoute as never)
      if (target?.case_job_id && typeof workflow.actions.hydrateRemoteJobById === 'function') {
        void workflow.actions.hydrateRemoteJobById(target.case_job_id)
      }
    }
    return true
  }, [
    blankCaseWorkRoute,
    conversations,
    resetConversationVisualState,
    router,
    workflow.actions,
    workflowCaseDeal?.id,
  ])
  const toggleSessionMenu = () => {
    setModeMenuOpen(false)
    setSessionMenuOpen((current) => {
      if (!current) void conversations.refreshSessions(true)
      return !current
    })
  }
  const toggleModeMenu = () => {
    if (!modeMenuOpen) {
      modeMenuOpacity.value = reduceMotion ? 1 : 0
      modeMenuScale.value = reduceMotion ? 1 : 0.96
      modeMenuSheenOpacity.value = 0
      modeMenuSheenX.value = -92
      modeMenuTranslateY.value = reduceMotion ? 0 : -6
    }
    setSessionMenuOpen(false)
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
  const canUseComposerMedia = mode === 'normal' || (mode === 'case' && !deal) || caseEvidenceGateActive || workIntakeActive
  const composerPlaceholder = mode === 'normal'
    ? (language === 'vi' ? 'Nhập tin nhắn cho Kael...' : 'Message Kael...')
    : deal
      ? (language === 'vi' ? 'Trao đổi với Kael về công việc này...' : 'Ask Kael about this service...')
      : (language === 'vi' ? 'Mô tả nhu cầu dịch vụ cho Kael...' : 'Describe the service you need...')
  const composerBusy = loading || uploadingMedia || conversations.busy
  const hasCurrentConversation = mode === 'normal'
    ? Boolean(processLines || activeChat || activeTurns.length > 0 || normalAssistantTurns.length > 0 || composerMediaDrafts.length > 0 || voiceTranscript.trim())
    : Boolean(processLines || activeChat || activeTurns.length > 0 || deal || hydratingCase || showPendingDraftBubble || caseAssistantTurns.length > 0 || composerMediaDrafts.length > 0 || voiceTranscript.trim())
  const showEmptyHero = !hasCurrentConversation && !loading
  const workerCandidateNode = useMemo(() => {
    if (mode !== 'case' || !candidateJobId) return null
    return (
      <WorkerCandidateReviewCard
        busy={workflow.customerWorkerCandidateBusy}
        candidate={workflow.customerWorkerCandidate}
        error={workflow.customerWorkerCandidateError}
        language={language}
        onConfirm={() => void workflow.actions.decideWorkerCandidate('confirm')}
        onReject={() => void workflow.actions.decideWorkerCandidate('reject')}
        onRetry={() => void workflow.actions.refreshWorkerCandidate(candidateJobId)}
        onToggleFavorite={(isFavorite) => void workflow.actions.setWorkerCandidateFavorite(isFavorite)}
        tokens={tokens}
      />
    )
  }, [
    candidateJobId,
    language,
    mode,
    tokens,
    workflow.actions,
    workflow.customerWorkerCandidate,
    workflow.customerWorkerCandidateBusy,
    workflow.customerWorkerCandidateError,
  ])
  const sessionMenuNode = useMemo(() => (
    <CustomerKaelSessionMenu
      activeSessionId={conversations.activeSessionId}
      canCreate={conversations.canCreateSession}
      error={conversations.sessionsError}
      language={language}
      loading={conversations.sessionsLoading}
      mode={mode}
      onArchive={archiveConversation}
      onCreate={() => void startNewConversation()}
      onPin={conversations.setSessionPinned}
      onRename={conversations.renameSession}
      onSelect={(conversationId) => void openConversation(conversationId)}
      pendingSessionIds={conversations.pendingSessionIds}
      reduceMotion={reduceMotion}
      reduceTransparency={reduceTransparency}
      sessions={conversations.sessions}
      tokens={tokens}
    />
  ), [
    conversations.activeSessionId,
    conversations.canCreateSession,
    conversations.pendingSessionIds,
    conversations.renameSession,
    conversations.sessions,
    conversations.sessionsError,
    conversations.sessionsLoading,
    conversations.setSessionPinned,
    archiveConversation,
    language,
    mode,
    openConversation,
    reduceMotion,
    reduceTransparency,
    startNewConversation,
    tokens,
  ])

  return (
    <KaelChatSurfaceView
      agenticEstimateNode={offerReviewActive && chatEstimate && !processLines && !submittingAgenticRejectReason && !confirmingAgenticEstimate ? (
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
      analysisEvidenceNode={agenticEvidenceGateActive ? (
        <AgenticEvidenceGateCard
          allowSkip={false}
          busy={loading || uploadingMedia || submittingAgenticEvidence || !activeChat?.session.id}
          language={language}
          mediaDrafts={composerMediaDrafts}
          onAddMedia={pickComposerMedia}
          onConfirm={() => void submitAgenticEvidence('confirmed')}
          onReasonChange={setAgenticEvidenceReason}
          onRemoveMedia={(index) => setComposerMediaDrafts((current) => current.filter((_, currentIndex) => currentIndex !== index))}
          onReject={() => {
            setAgenticEvidenceRejectOpen(true)
            setError(null)
          }}
          onSkip={() => void submitAgenticEvidence('skipped')}
          onVoiceTranscriptChange={setVoiceTranscript}
          prompt={serverEvidencePrompt}
          rejectOpen={agenticEvidenceRejectOpen}
          rejectReason={agenticEvidenceReason}
          requiredEvidenceKind={serverEvidenceKind}
          textInputNoOutlineStyle={customerV21WebTextInputNoOutline}
          tokens={tokens}
          voiceTranscript={voiceTranscript}
        />
      ) : serverPriceReviewBlocked ? (
        <QuoteReadinessReviewCard
          language={language}
          reason={typeof artifactNextAction?.reason === 'string' ? artifactNextAction.reason : undefined}
          safetyMessages={serverSafetyMessages}
          tokens={tokens}
        />
      ) : null}
      agenticVisibleTurns={agenticIntakeModeActive ? agenticVisibleTurns : []}
      animatedModeMenuSheenStyle={animatedModeMenuSheenStyle}
      animatedModeMenuStyle={animatedModeMenuStyle}
      canStartNewConversation={!composerBusy}
      canUseComposerMedia={canUseComposerMedia}
      caseAssistantTurns={showCaseConversation ? caseAssistantTurns : []}
      caseThreadNode={mode === 'case' && deal ? (
        <AgenticCaseThreadPanel activityLabel={customerV21TabCopy[language].activity} deal={deal} editing={caseEditOpen} language={language} onApproveScopeChange={(scopeChangeId) => {
          if (!deal.scopeChange || deal.scopeChange.id !== scopeChangeId || !canCustomerDecideScopeChange(deal.scopeChange)) return
          void workflow.actions.decideScopeChange?.(scopeChangeId, { decision: 'approve' })
        }} onOpenActivity={openActivity} onRejectScopeChange={(scopeChangeId) => {
          if (!deal.scopeChange || deal.scopeChange.id !== scopeChangeId || !canCustomerDecideScopeChange(deal.scopeChange)) return
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
              language={language}
              mediaDrafts={composerMediaDrafts}
              onAddMedia={pickComposerMedia}
              onConfirm={() => void submitCaseEvidence('confirmed')}
              onReasonChange={setCaseEvidenceReason}
              onRemoveMedia={(index) => setComposerMediaDrafts((current) => current.filter((_, currentIndex) => currentIndex !== index))}
              onReject={() => {
                setCaseEvidenceRejectOpen(true)
                setError(null)
              }}
              onSkip={() => void submitCaseEvidence('skipped')}
              onVoiceTranscriptChange={setVoiceTranscript}
              rejectOpen={caseEvidenceRejectOpen}
              rejectReason={caseEvidenceReason}
              textInputNoOutlineStyle={customerV21WebTextInputNoOutline}
              tokens={tokens}
              voiceTranscript={voiceTranscript}
            />
          )}
          caseQuoteRejectOpen={caseQuoteRejectOpen}
          caseQuoteRejectReason={caseQuoteRejectReason}
          caseOptionsAcknowledged={caseOptionsAcknowledged}
          confirmingCaseQuote={confirmingCaseQuote}
          completionReviewNode={deal.status === 'completed_by_worker' ? (
            <CompletionReviewCard
              busy={confirmingCompletion}
              deal={deal}
              language={language}
              onConfirm={() => void confirmCaseCompletion()}
              onReportIssue={() => {
                setCaseEditOpen(true)
                setError(null)
              }}
              tokens={tokens}
            />
          ) : null}
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
      caseWorkLabel={language === 'vi' ? 'Xử lý công việc' : 'Work handling'}
      composerBusy={composerBusy}
      composerMediaDraftCount={composerMediaDrafts.length}
      composerMediaNode={(
        <MediaDraftPreviewTray
          busy={composerBusy}
          drafts={composerMediaDrafts}
          language={language}
          onRemove={(index) => setComposerMediaDrafts((current) => current.filter((_, currentIndex) => currentIndex !== index))}
          tokens={tokens}
        />
      )}
      composerPlaceholder={composerPlaceholder}
      composerVoiceNode={agenticAnalysisActive && !agenticEvidenceGateActive ? (
        <OnDeviceVoiceTranscript
          disabled={composerBusy}
          language={language}
          onChangeText={setVoiceTranscript}
          tokens={tokens}
          transcript={voiceTranscript}
        />
      ) : null}
      draft={draft}
      error={error}
      hiddenScrollbarStyle={customerV21HiddenScrollbar}
      hydratingCase={hydratingCase && !deal}
      language={language}
      mode={mode}
      modeMenuOpen={modeMenuOpen}
      normalAssistantTurns={normalAssistantTurns}
      normalChatLabel={language === 'vi' ? 'Chat thường' : 'Normal chat'}
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
      onToggleSessionMenu={toggleSessionMenu}
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
      sessionMenuNode={sessionMenuNode}
      sessionMenuOpen={sessionMenuOpen}
      showComposer={showComposer}
      showEmptyHero={showEmptyHero}
      showPendingDraftBubble={showPendingDraftBubble}
      textInputNoOutlineStyle={customerV21WebTextInputNoOutline}
      tokens={tokens}
      workerCandidateNode={workerCandidateNode}
      missingCaseWorkDeal={missingCaseWorkDeal}
    />
  )
}

export function CustomerV21DockOverlay({ active }: { active: CustomerDockActive }) {
  const language = useAppLanguage()
  const router = useRouter()
  const { width } = useWindowDimensions()
  const { mode, reduceMotion, reduceTransparency, tokens } = useV21Theme()
  const { collapsed, resetDockScroll } = useDockScrollState()
  const animatedDockScrollStyle = useDockScrollTransform(collapsed, reduceMotion)
  const activeTab = active === 'chat' ? null : active

  const navItems: { image: ImageSourcePropType; key: CustomerPrimaryTab; route: string }[] = [
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

  useEffect(() => {
    resetDockScroll()
  }, [active, resetDockScroll])

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
    router.replace(customerKaelChatRoute as never)
  }

  return (
    <CustomerV21DockOverlayView
      activeTab={activeTab}
      animatedDockCausticStyle={animatedDockCausticStyle}
      animatedDockShimmerStyle={animatedDockShimmerStyle}
      animatedDockScrollStyle={animatedDockScrollStyle}
      animatedLensSheenStyle={animatedLensSheenStyle}
      animatedLensStyle={animatedLensStyle}
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
      reduceMotion={reduceMotion}
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
        confirmedPaymentBankKey={confirmedPaymentBankKey}
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
      metrics={[
        { label: language === 'vi' ? 'Dịch vụ đã dùng' : 'Used services', value: completedCount },
        { label: language === 'vi' ? 'Chuỗi hoạt động' : 'Active streak', value: streakLabel },
        { label: language === 'vi' ? 'Đánh giá tích cực' : 'Positive reviews', value: reviewRate },
      ]}
      pointsText={pointsText}
      progress={progress}
      progressBar={<ProfileProgressBar percent={rank > 0 ? progress : 0} testID="customer-v21-profile-ranking-progress" />}
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
      rules={[
        {
          details: [
            { glyph: 'document', label: language === 'vi' ? 'Theo trạng thái' : 'Status tracked' },
            { glyph: 'check', label: language === 'vi' ? 'Không bỏ đơn' : 'No job drop' },
          ],
          image: customerV21Assets.rankingCompletion,
          label: language === 'vi' ? 'Hoàn tất đúng quy trình' : 'Finish through workflow',
          status: completedCount,
          testID: 'customer-v21-profile-ranking-rule-completed',
          value: language === 'vi' ? 'Không bỏ đơn sau khi thợ đã di chuyển' : 'No cancellation after worker travel starts',
        },
        {
          details: [
            { glyph: 'identity', label: language === 'vi' ? 'Sau công việc' : 'After service' },
            { glyph: 'check', label: language === 'vi' ? 'Phản hồi công bằng' : 'Fair feedback' },
          ],
          image: customerV21Assets.rankingReview,
          label: language === 'vi' ? 'Đánh giá chất lượng' : 'Quality review',
          status: reviewRate,
          testID: 'customer-v21-profile-ranking-rule-review',
          value: language === 'vi' ? 'Phản hồi công bằng sau mỗi công việc' : 'Fair feedback after each job',
        },
        {
          details: [
            { glyph: 'shield', label: language === 'vi' ? 'Trong hệ thống' : 'In platform' },
            { glyph: 'document', label: language === 'vi' ? 'Có đối soát' : 'Reconciled' },
          ],
          image: customerV21Assets.rankingProtection,
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
    backgroundColor: '#08AF9C',
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
    boxShadow: '0 8px 18px rgba(8,125,114,0.07)',
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
    boxShadow: '0 8px 24px rgba(8,125,114,0.12)',
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
    boxShadow: '0 15px 30px rgba(8,125,114,0.10)',
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
    backgroundColor: '#08AF9C',
    borderRadius: 7,
    height: '100%',
    overflow: 'hidden',
    position: 'relative',
    boxShadow: '0 0 12px rgba(8,175,156,0.22)',
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
    color: '#087D72',
    fontWeight: '700',
  },
  profileLogoutCta: {},
  profileInsightTitle: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 21,
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
