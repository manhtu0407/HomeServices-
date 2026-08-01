import { useEffect, useMemo, useRef, useState } from 'react'
import Constants from 'expo-constants'
import {
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
} from 'react-native'
import Svg, { Defs, LinearGradient, Rect } from 'react-native-svg'
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  CUSTOMER_SERVICE_IDS,
  extractKnownDistrictLabel,
  type CustomerServiceId,
  type LocalDeal,
  type ServiceType,
} from '@nestscout/shared'
import { KaelButton } from '@/components/ui/kael-primitives'
import { useDockScrollState, useDockScrollTransform } from '@/components/ui/dock-scroll-state'
import { motionDuration, motionTokens } from '@/components/ui/motion-tokens'
import { AlphaStop as Stop } from '@/components/ui/svg-alpha-stop'
import { generateClientRequestId } from '@/lib/client-request-id'
import { localizeAccountMutationError } from '@/lib/account-mutation-error'
import { localizedProblemOptions, setAppLanguage, useAppLanguage } from '@/lib/app-language'
import { useAuth } from '@/lib/auth-provider'
import { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { bookingServiceIdFromRoute, performanceProfileForBooking, productionServiceForBooking } from '@/lib/kael-performance-intake'
import type { CustomerProfileInsightsResponse, CustomerServiceHistoryItem } from '@/lib/api-types'
import {
  readPendingKaelChatDraft,
  setPendingKaelChatDraft,
} from '../kael-chat/pending-intake'
import { ScopeChangeHardStopModal } from '../scope-change-modal/scope-change-hard-stop-modal'
import { setCustomerThemeMode } from '../customer-theme'
import {
  CaseWideMintAura,
  SourceCardSkin,
  ZipMintAura,
} from '../ui/aura-surfaces'
import { customerV21Assets, customerV21BankAssets } from '../ui/assets'
import { CustomerBookingEntryView, CustomerBookingGuestGateView } from '../booking/booking-entry-stateful-surfaces'
import { HomeStorytellingCard } from '../home/home-storytelling-card'
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
} from '../booking/booking-intake-display-model'
import { useBookingScheduleRuntimeNow } from '../booking/use-booking-schedule-runtime-now'
import { useBookingFormState } from '../booking/use-booking-form-state'
import { useBookingAddressLookup, type BookingAddressSuggestion } from '../booking/use-booking-address-lookup'
import { useCustomerMessageMemoryPreference } from '../kael-chat/use-customer-message-memory-preference'
import { useCustomerAvatarPicker } from '../profile/use-customer-avatar-picker'
import { KaelChatSurface } from './kael-chat-surface'
import { customerKaelStateScopeKey } from '../kael-chat/customer-kael-state-scope'
import {
  agenticDealProblemLabel,
  caseDisplayCode,
  canCustomerDecideScopeChange,
  formatNumber,
  formatVnd,
} from '../kael-chat/case-work-display-model'
import { stepForStatus } from '../kael-chat/case-stage-display-model'
import {
  agenticBooleanFromMemory,
  agenticMemoryRowsFromUnknown,
} from '../kael-chat/agentic-memory-display-model'
import { CustomerV21DockOverlayView } from '../dock/dock-stateful-surfaces'
import {
  customerV21CommonCopy,
  customerV21ScreenTitles,
  customerV21ServiceCopy,
  customerV21StatusCopy,
} from '../ui/copy'
import { ActiveCaseCardPanel } from '../history/history-active-surfaces'
import { CustomerServiceHistorySurface } from '../history/service-history-surface'
import { CaseFactGrid } from '../history/history-surfaces'
import { CustomerProfileOverviewView, CustomerProfileSubscreenView } from '../profile/profile-stateful-surfaces'
import { buildCustomerProfileSettingsGroups } from '../profile/profile-settings-groups'
import { ProfileCompactMintAura } from '../profile/profile-metrics-surfaces'
import {
  ProfileKaelMemoryView,
  ProfileLanguageView,
  ProfileLoginSecurityView,
  ProfilePersonalDetailsView,
} from '../profile/profile-account-utility-surfaces'
import {
  ProfileAppearanceView,
  ProfileDeleteAccountView,
  ProfileNotificationsView,
  ProfileSupportView,
} from '../profile/profile-foundation-utility-surfaces'
import { ProfileLegalView } from '../profile/profile-legal-surfaces'
import { ProfilePaymentUtilitySection } from '../profile/profile-payment-stateful-surfaces'
import { ProfileMoneyPanel, ProfileRankingPanel } from '../profile/profile-utility-surfaces'
import { ProfileUtilityAddressView } from '../profile/profile-utility-stateful-surfaces'
import {
  customerAccountJourneyDisplay,
  fairPriceStatusLabel,
  homeGreeting,
  initialsForName,
  insightNumber,
  profileName,
  profilePanelForScreen,
  profilePanelParam,
  profileScreenParam,
  profileSettingsSectionParam,
  profileStageSubtitle,
  profileUtilityParam,
  profileUtilitySubtitle,
  profileUtilityTitle,
  protectedTransactionLabel,
  rankLabel,
  type CustomerProfilePanel,
  type CustomerProfileUtility,
} from '../profile/profile-display-model'
import { AssetTile, EmptyState, SectionActionHeader, ServiceTile, V21Screen, V21TopBar } from '../ui/shared-surfaces'
import {
  CUSTOMER_LIQUID_NAV_DOCK_HEIGHT,
  CUSTOMER_LIQUID_NAV_GAP,
  CUSTOMER_LIQUID_NAV_MAX_WIDTH,
  CUSTOMER_LIQUID_NAV_ORB_SIZE,
  CUSTOMER_LIQUID_NAV_RAIL_PADDING,
  CUSTOMER_LIQUID_NAV_SIDE_INSET,
} from '../dock/dock-styles'
import { customerV21ProfileUtilityStyles as profileUtilityStyles } from '../profile/profile-utility-styles'
import { customerV21SharedStyles as sharedStyles } from '../ui/shared-styles'
import { type CustomerDockActive, type CustomerKaelMode, type CustomerPrimaryTab, type CustomerV21ScreenId } from '../ui/types'
import {
  chatScreenModeParam,
  firstParam,
  servicesScreenParam,
} from '../ui/route-params'
import { stringArrayFromUnknown, stringFromUnknown } from '../ui/value-display-model'
import {
  cleanRouteJobId,
  customerCaseWorkRouteForDeal,
  customerKaelChatRoute,
  customerKaelWorkRoute,
  customerKaelWorkRouteForHandoff,
  isRealCaseDeal,
} from '../kael-chat/customer-kael-routing'
import { useV21Theme } from '../ui/use-v21-theme'
import {
  customerV21HiddenTextInputScrollbar,
  customerV21InvisibleTextInputScrollbar,
  customerV21WebTextInputNoOutline,
} from '../ui/platform-styles'


const customerBookingServiceIdForHistory: Record<ServiceType, CustomerServiceId> = {
  cleaning: 'home_cleaning',
  electrical: 'electrical',
  handyman: 'handyman_minor_installation',
  hvac: 'hvac_basic_maintenance',
  plumbing: 'plumbing',
  upholstery: 'upholstery_care',
}

const customerV21DockNavItems: { image: ImageSourcePropType; key: CustomerPrimaryTab; route: string }[] = [
  { image: customerV21Assets.home, key: 'home', route: '/(customer)/home' },
  { image: customerV21Assets.booking, key: 'services', route: '/(customer)/booking' },
  { image: customerV21Assets.activityNav, key: 'activity', route: '/(customer)/history' },
  { image: customerV21Assets.profile, key: 'profile', route: '/(customer)/profile' },
]
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

      <HomeStorytellingCard
        language={language}
        reduceTransparency={reduceTransparency}
        tokens={tokens}
      />

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
          bareAsset
          body={copy.emptyActivityBody}
          image={customerV21Assets.serviceStart}
          mintAura
          testID="customer-v21-home-empty"
          title={copy.emptyActivity}
        />
      )}
    </V21Screen>
  )
}

export function CustomerBookingEntrySurface() {
  const { guestMode, session } = useAuth()
  const ownerKey = guestMode || !session ? 'guest' : `account:${session.user.id}`
  return <CustomerBookingEntrySurfaceRoute key={ownerKey} />
}

// Booking fields update independently and already share one guarded submit boundary.
// react-doctor-disable-next-line react-doctor/prefer-useReducer
function CustomerBookingEntrySurfaceRoute() {
  const language = useAppLanguage()
  const router = useRouter()
  const params = useLocalSearchParams<{ date?: string | string[]; editKaelIntake?: string | string[]; screen?: string | string[]; service?: string | string[]; serviceType?: string | string[]; time?: string | string[] }>()
  const { guestMode, session } = useAuth()
  const { reduceTransparency, tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const rawServicesScreen = firstParam(params.screen)
  const directServicesScreen = servicesScreenParam(rawServicesScreen)
  const directService = bookingServiceIdFromRoute(firstParam(params.service) ?? firstParam(params.serviceType))
  const directScheduleDate = bookingScheduleDateParam(firstParam(params.date))
  const directScheduleTime = bookingScheduleTimeParam(firstParam(params.time))
  const editingKaelIntake = firstParam(params.editKaelIntake) === '1'
  const legacyMediaScreenRequested = rawServicesScreen === '2.3-media'
  const servicesScreenId = legacyMediaScreenRequested ? '2.2-search' : directServicesScreen ?? '2.2-search'
  const isMediaScreen = false
  const bookingForm = useBookingFormState({
    selectedService: directService,
    selectedScheduleDate: directScheduleDate,
    selectedScheduleTime: directScheduleTime,
  })
  const {
    selectedService, selectedProblems, address, description, selectedScheduleDate,
    customScheduleDateInput, selectedScheduleTime, customScheduleTimeInput, error,
  } = bookingForm.state
  const {
    setSelectedService, setSelectedProblems, setAddress, setDescription,
    setSelectedScheduleDate, setCustomScheduleDateInput, setSelectedScheduleTime,
    setCustomScheduleTimeInput, setError, applyPendingDraft,
    clear: clearBookingForm,
  } = bookingForm
  const addressDistrictLabel = useRef<string | null>(null)
  const submitDraftInFlightRef = useRef(false)
  const [addressLookupOpen, setAddressLookupOpen] = useState(false)
  const addressLookup = useBookingAddressLookup(address, addressLookupOpen)
  const scheduleRuntimeNow = useBookingScheduleRuntimeNow()
  useEffect(() => {
    if (!legacyMediaScreenRequested) return
    router.replace(customerKaelWorkRoute as never)
  }, [legacyMediaScreenRequested, router])
  useEffect(() => {
    if (!editingKaelIntake || !session?.user.id) return
    let cancelled = false
    readPendingKaelChatDraft(session.user.id).then((draft) => {
      if (cancelled || !draft?.serviceType) return
      applyPendingDraft(
        draft,
        customerBookingServiceIdForHistory[draft.serviceType],
      )
      addressDistrictLabel.current = draft.districtLabel ?? null
    }).catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [applyPendingDraft, editingKaelIntake, session?.user.id])
  const scheduleDateOptions = useMemo(() => buildBookingScheduleDateOptions(language, new Date(scheduleRuntimeNow)), [language, scheduleRuntimeNow])
  const runtimeDate = new Date(scheduleRuntimeNow)
  const availableSelectedScheduleDate = selectedScheduleDate
    && bookingScheduleDateIsBookable(selectedScheduleDate, runtimeDate)
    ? selectedScheduleDate
    : null
  const availableSelectedScheduleTime = selectedScheduleTime
    && bookingScheduleDraft(availableSelectedScheduleDate, selectedScheduleTime, runtimeDate).scheduledAt
    ? selectedScheduleTime
    : null
  const scheduleLabel = bookingScheduleLabel(scheduleDateOptions, availableSelectedScheduleDate, availableSelectedScheduleTime, language)
  const customScheduleDateError = customScheduleDateInput.length === 10 && !availableSelectedScheduleDate
    ? (language === 'vi' ? 'Nhập ngày hợp lệ từ hôm nay trở đi.' : 'Enter a valid date from today onward.')
    : null
  const customScheduleTimeError = customScheduleTimeInput.length === 5 && !availableSelectedScheduleTime
    ? (language === 'vi' ? 'Nhập giờ hợp lệ trong tương lai theo HH:mm, trước 23:59.' : 'Enter a valid future HH:mm time before 23:59.')
    : null
  const addressUsesMultiline = address.trim().length > 34

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
      return
    }
    setAddressLookupOpen(true)
  }
  const selectAddressSuggestion = (suggestion: BookingAddressSuggestion) => {
    setAddress(suggestion.label)
    addressDistrictLabel.current = extractKnownDistrictLabel(suggestion.label) || null
    setAddressLookupOpen(false)
  }
  const resetBookingBoard = () => {
    clearBookingForm()
    addressDistrictLabel.current = null
    setAddressLookupOpen(false)
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

  const submitDraft = () => {
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
    if (!availableSelectedScheduleDate || !availableSelectedScheduleTime) {
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
    const scheduleDraft = bookingScheduleDraft(availableSelectedScheduleDate, availableSelectedScheduleTime, new Date())
    if (!scheduleDraft.scheduledAt || !scheduleDraft.scheduleWindow) {
      setError(language === 'vi'
        ? 'Ngày hoặc giờ bắt đầu chưa hợp lệ. Chọn lại trước khi gửi Kael.'
        : 'The desired date or start time is invalid. Choose it again before sending to Kael.')
      return
    }
    const normalizedAddress = address.trim()
    const normalizedDistrict = addressDistrictLabel.current ?? extractKnownDistrictLabel(normalizedAddress) ?? normalizedAddress
    if (submitDraftInFlightRef.current) return
    submitDraftInFlightRef.current = true
    const clientRequestId = generateClientRequestId()
    // Pending intake is memory-first: the destination can hydrate immediately while
    // the same owner-scoped envelope continues to durable storage in the background.
    void setPendingKaelChatDraft(session.user.id, {
      addressLabel: normalizedAddress,
      clientRequestId,
      createdAt: new Date().toISOString(),
      description: draftDescription,
      districtLabel: normalizedDistrict,
      locale: language,
      message,
      problemChips: draftProblemChips,
      profileId,
      scheduleMode: 'scheduled',
      scheduledAt: scheduleDraft.scheduledAt,
      scheduleWindow: scheduleDraft.scheduleWindow,
      serviceType: draftServiceType,
      source: 'booking',
    }).catch(() => undefined)
    resetBookingBoard()
    router.replace(customerKaelWorkRouteForHandoff(clientRequestId) as never)
  }
  const createDraftLabel = copy.createDraft

  return (
    <V21Screen screenId={servicesScreenId} testID="customer-v21-services">
      <CustomerBookingEntryView
        address={address}
        addressFallbackUsed={addressLookup.fallbackUsed}
        addressLookupOpen={addressLookupOpen}
        addressLookupPending={addressLookup.pending}
        addressSuggestions={addressLookup.suggestions}
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
        mediaPanelNode={null}
        onAddressChange={updateAddress}
        onAddressFocus={() => setAddressLookupOpen(true)}
        onAddressSuggestionPress={selectAddressSuggestion}
        onBack={() => router.replace('/(customer)/home' as never)}
        onCustomScheduleDateChange={updateCustomScheduleDate}
        onCustomScheduleTimeChange={updateCustomScheduleTime}
        onDescriptionChange={setDescription}
        onProblemToggle={toggleProblem}
        onResetSelectedService={() => {
          setSelectedService(null)
          setSelectedProblems([])
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
        }}
        onSubmit={submitDraft}
        problemOptions={problemOptions}
        reduceTransparency={reduceTransparency}
        rootStyles={styles}
        scheduleDateOptions={scheduleDateOptions}
        scheduleLabel={scheduleLabel}
        scheduleRuntimeNow={scheduleRuntimeNow}
        selectedProblems={selectedProblems}
        selectedScheduleDate={availableSelectedScheduleDate}
        selectedScheduleTime={availableSelectedScheduleTime}
        selectedService={selectedService}
        textInputNoOutlineStyle={customerV21WebTextInputNoOutline}
        timeSlots={bookingTimeSlots}
        tokens={tokens}
      />
    </V21Screen>
  )
}

export function CustomerHistorySurface() {
  const language = useAppLanguage()
  const router = useRouter()
  const params = useLocalSearchParams<{
    job_id?: string | string[]
    scope_change?: string | string[]
    screen?: string | string[]
    source?: string | string[]
    tab?: string | string[]
  }>()
  const workflow = useFrontendWorkflow()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const workflowDeal = workflow.state.deal
  const deal = isRealCaseDeal(workflowDeal) ? workflowDeal : null
  const routeJobId = cleanRouteJobId(firstParam(params.job_id))
  const routeScopeChangeParam = firstParam(params.scope_change)
  const legacyActivityScreen = firstParam(params.screen)
  const historySource = firstParam(params.source)
  const historyBackPath = historySource === 'profile-support'
    ? '/(customer)/profile?utility=support'
    : historySource === 'profile-notifications'
      ? '/(customer)/profile?utility=notifications'
      : '/(customer)/home'
  const shouldOpenCaseWork = Boolean(!routeScopeChangeParam && (routeJobId || legacyActivityScreen))
  const scopeChange = deal?.scopeChange ?? null
  const scopeChangeVisible = Boolean(scopeChange && canCustomerDecideScopeChange(scopeChange))
  const [scopeChangeBusy, setScopeChangeBusy] = useState(false)

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

  const decideScopeChange = async (decision: 'approve' | 'reject') => {
    if (!scopeChange || !canCustomerDecideScopeChange(scopeChange) || scopeChangeBusy) return
    setScopeChangeBusy(true)
    try {
      await workflow.actions.decideScopeChange(scopeChange.id, { decision })
    } finally {
      setScopeChangeBusy(false)
    }
  }

  return (
    <>
      <CustomerServiceHistorySurface
        onBack={() => router.replace(historyBackPath as never)}
        onOpenDetail={openHistoryDetail}
        onRebook={rebookService}
      />
      <ScopeChangeHardStopModal
        busy={scopeChangeBusy}
        language={language}
        newScopeLabel={scopeChange?.requestedDescription ?? copy.dataPending}
        onApprove={() => void decideScopeChange('approve')}
        onReject={() => void decideScopeChange('reject')}
        originalEstimateLabel={deal?.estimate?.priceRangeLabel ?? copy.dataPending}
        originalScopeLabel={deal ? agenticDealProblemLabel(deal, language) || copy.dataPending : copy.dataPending}
        scopeChange={scopeChange}
        tokens={tokens}
        visible={scopeChangeVisible}
      />
    </>
  )
}

export function CustomerProfileSurface() {
  const language = useAppLanguage()
  const router = useRouter()
  const params = useLocalSearchParams<{
    panel?: string | string[]
    screen?: string | string[]
    section?: string | string[]
    utility?: string | string[]
  }>()
  const { session, signOut } = useAuth()
  const workflow = useFrontendWorkflow()
  const { avatarUploadBusy, openCustomerAvatarPicker } = useCustomerAvatarPicker({
    language,
    uploadAvatar: workflow.actions.customerUploadAvatar,
  })
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const insights = workflow.customerProfileInsights ?? null
  const directProfileScreen = profileScreenParam(firstParam(params.screen))
  const directSettingsSection = profileSettingsSectionParam(firstParam(params.section))
  const requestedProfileUtility = profileUtilityParam(firstParam(params.utility))
  const directProfileUtility = requestedProfileUtility === 'settings'
    ? directSettingsSection === 'password'
      ? 'password'
      : directSettingsSection === 'memory'
        ? 'memory'
        : 'personal-details'
    : requestedProfileUtility
  const requestedPanel = profilePanelForScreen(directProfileScreen) ?? profilePanelParam(firstParam(params.panel))
  const [selectedPanel, setSelectedPanel] = useState<CustomerProfilePanel>('overview')
  const panel = requestedPanel ?? selectedPanel
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
  const messageMemoryAllowed = agenticBooleanFromMemory(workflow.customerKaelMemory, 'message_interaction_memory')
  const usageRank = typeof insights?.usage_rank_level === 'number' ? Math.max(0, Math.min(5, insights.usage_rank_level)) : null
  const usageRankPoints = typeof insights?.usage_rank_points === 'number' ? Math.max(0, insights.usage_rank_points) : null
  const usageRankCyclePoints = usageRankPoints !== null && usageRankPoints > 0 ? (usageRankPoints % 1000 || 1000) : 0
  const hasUsageRank = usageRank !== null && usageRank > 0
  const usageRankProgress = hasUsageRank ? Math.max(0, Math.min(100, usageRankCyclePoints / 10)) : 0
  const usageRankPointsLabel = usageRankPoints === null
    ? copy.dataPending
    : language === 'vi'
      ? `${formatNumber(usageRankCyclePoints, language)} / 1.000 điểm`
      : `${formatNumber(usageRankCyclePoints, language)} / 1,000 points`
  const settingsGroups = buildCustomerProfileSettingsGroups({
    actions: {
      deleteAccount: () => router.replace('/(customer)/profile?utility=delete-account' as never),
      openAddress: () => router.replace('/(customer)/profile?utility=address' as never),
      openAppearance: () => router.replace('/(customer)/profile?utility=appearance' as never),
      openLanguage: () => router.replace('/(customer)/profile?utility=language' as never),
      openLegal: () => router.replace('/(customer)/profile?utility=legal' as never),
      openMemory: () => router.replace('/(customer)/profile?utility=memory' as never),
      openNotifications: () => router.replace('/(customer)/profile?utility=notifications' as never),
      openPassword: () => router.replace('/(customer)/profile?utility=password' as never),
      openPersonalDetails: () => router.replace('/(customer)/profile?utility=personal-details' as never),
      openRefunds: () => router.replace('/(customer)/profile?utility=payment' as never),
      openSupport: () => router.replace('/(customer)/profile?utility=support' as never),
      signOut: () => void signOut(),
    },
    addressStatus: insightNumber(
      insights,
      'saved_address_count',
      copy.emptyProfileMetric,
      language,
      (value) => language === 'vi' ? `${value} địa chỉ` : `${value} addresses`,
    ),
    bankOptionLabel,
    language,
    memoryAllowed: messageMemoryAllowed,
    notificationUnreadCount: workflow.notificationUnreadCount,
    themeMode: tokens.mode,
  })

  const openProfilePanel = (nextPanel: CustomerProfilePanel, screenId: CustomerV21ScreenId) => {
    setSelectedPanel(nextPanel)
    router.replace(`/(customer)/profile?screen=${screenId}` as never)
  }

  if (directProfileUtility) {
    const directProfileBackPath = '/(customer)/profile'
    return (
      <V21Screen
        frameStyle={profileUtilityStyles.profileSubscreenFrame}
        key={`profile-utility-${directProfileUtility}`}
        screenId="6.1-profile-overview"
        testID="customer-v21-profile"
      >
        <CustomerProfileSubscreenView
          body={directProfileUtility === 'payment' ? (
            <ProfilePaymentUtilitySection
              key={session?.user.id ?? 'guest'}
              language={language}
              textInputNoOutlineStyle={customerV21WebTextInputNoOutline}
              tokens={tokens}
            />
          ) : directProfileUtility === 'legal' ? (
            <ProfileLegalView language={language} tokens={tokens} />
          ) : directProfileUtility === 'appearance' ? (
            <ProfileAppearanceView
              language={language}
              mode={tokens.mode}
              onSelectMode={(mode) => void setCustomerThemeMode(mode)}
              tokens={tokens}
            />
          ) : directProfileUtility === 'notifications' ? (
            <ProfileNotificationsView
              language={language}
              notifications={workflow.notifications}
              onMarkRead={workflow.actions.markNotificationRead}
              onOpenRelatedWork={(jobId) => router.replace(
                `/(customer)/history?job_id=${encodeURIComponent(jobId)}&source=profile-notifications` as never,
              )}
              onRefresh={workflow.actions.refreshNotifications}
              tokens={tokens}
              unreadCount={workflow.notificationUnreadCount}
            />
          ) : directProfileUtility === 'support' ? (
            <ProfileSupportView
              language={language}
              onOpenHistory={() => router.replace('/(customer)/history?source=profile-support' as never)}
              onOpenKael={() => router.replace('/(customer)/kael-chat?mode=normal' as never)}
              tokens={tokens}
            />
          ) : directProfileUtility === 'delete-account' ? (
            <ProfileDeleteAccountView
              accessToken={session?.access_token ?? null}
              language={language}
              onDeleted={() => signOut()}
              textInputNoOutlineStyle={customerV21WebTextInputNoOutline}
              tokens={tokens}
            />
          ) : (
            <ProfileUtilitySection
              key={session?.user.id ?? 'guest'}
              kind={directProfileUtility}
            />
          )}
          onBack={() => router.replace(directProfileBackPath as never)}
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
            setSelectedPanel('overview')
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
        avatarAccessibilityHint={language === 'vi'
          ? 'Mở lựa chọn chụp ảnh hoặc chọn từ thư viện.'
          : 'Opens options to take a photo or choose one from your library.'}
        avatarAccessibilityLabel={workflow.customerAvatarUrl
          ? (language === 'vi' ? 'Đổi ảnh đại diện' : 'Change profile photo')
          : (language === 'vi' ? 'Thêm ảnh đại diện' : 'Add profile photo')}
        avatarUploadBusy={avatarUploadBusy}
        avatarUrl={workflow.customerAvatarUrl}
        initials={initialsForName(name)}
        name={name}
        onPickAvatar={openCustomerAvatarPicker}
        onOpenRanking={() => openProfilePanel('ranking', '6.2-usage-ranking')}
        rankingAccessibilityLabel={language === 'vi' ? 'Xem xếp hạng sử dụng' : 'View usage ranking'}
        rankingBody={language === 'vi' ? 'Kael đánh giá từ dữ liệu sử dụng thật.' : 'Kael evaluates real usage data.'}
        rankingLabel={language === 'vi' ? 'Xếp hạng sử dụng' : 'Usage ranking'}
        rankingMetaLabel={usageRankPointsLabel}
        rankingProgressNode={<ProfileProgressBar percent={usageRankProgress} testID="customer-v21-profile-ranking-entry-progress" />}
        rankingProgressSourceLabel={language === 'vi' ? 'Tăng theo hoạt động thật' : 'Grows with real activity'}
        rootStyles={styles}
        settingsGroups={settingsGroups}
        tokens={tokens}
        topBarSubtitle={language === 'vi' ? 'Thông tin, bảo mật và các quyền của bạn' : 'Your details, security, and controls'}
        topBarTitle={language === 'vi' ? 'Hồ sơ khách hàng' : 'Customer profile'}
        versionLabel={Constants.expoConfig?.version
          ? (language === 'vi'
              ? `Phiên bản ${Constants.expoConfig.version}`
              : `Version ${Constants.expoConfig.version}`)
          : null}
      />
    </V21Screen>
  )
}

type CustomerKaelRouteParams = {
  handoff?: string | string[]
  jobId?: string | string[]
  mode?: string | string[]
  screen?: string | string[]
  sessionId?: string | string[]
}

export function CustomerKaelSurface() {
  const params = useLocalSearchParams<CustomerKaelRouteParams>()
  return <CustomerKaelRuntimeSurface params={params} />
}

function CustomerKaelRuntimeSurface({ params }: { params: CustomerKaelRouteParams }) {
  const { session } = useAuth()
  const routeModeParam = firstParam(params.mode)
  const explicitRouteMode: CustomerKaelMode | null = routeModeParam === 'case'
    ? 'case'
    : routeModeParam === 'normal'
      ? 'normal'
      : null
  const routeMode = explicitRouteMode ?? chatScreenModeParam(firstParam(params.screen)) ?? 'normal'
  const routeJobId = cleanRouteJobId(firstParam(params.jobId))
  const mode: CustomerKaelMode = routeMode === 'case' || routeJobId ? 'case' : 'normal'
  const stateScopeKey = customerKaelStateScopeKey({
    accountId: session?.user.id ?? null,
    // A blank Case Work route must not remount when an unrelated workflow job
    // arrives or clears in the background. Only a job explicitly in the URL
    // owns this route's request scope.
    caseId: mode === 'case' ? routeJobId : null,
    handoffId: firstParam(params.handoff) ?? null,
    mode,
    sessionId: firstParam(params.sessionId) ?? null,
  })

  return <KaelChatSurface key={stateScopeKey} stateScopeKey={stateScopeKey} />
}

export function CustomerV21DockOverlay({ active }: { active: CustomerDockActive }) {
  const language = useAppLanguage()
  const router = useRouter()
  const { width } = useWindowDimensions()
  const { mode, reduceMotion, reduceTransparency, tokens } = useV21Theme()
  const { collapsed, resetDockScroll } = useDockScrollState()
  const animatedDockScrollStyle = useDockScrollTransform(collapsed, reduceMotion)
  // A parent-controlled active tab is external synchronization, not a local event surrogate.
  // react-doctor-disable-next-line react-doctor/no-event-handler
  const activeTab = active === 'chat' ? null : active

  const liquidNavWidth = Math.min(Math.max(width - CUSTOMER_LIQUID_NAV_SIDE_INSET * 2, 0), CUSTOMER_LIQUID_NAV_MAX_WIDTH)
  const liquidDockWidth = Math.max(liquidNavWidth - CUSTOMER_LIQUID_NAV_ORB_SIZE - CUSTOMER_LIQUID_NAV_GAP, CUSTOMER_LIQUID_NAV_DOCK_HEIGHT)
  const selectedIndex = activeTab ? customerV21DockNavItems.findIndex((item) => item.key === activeTab) : -1
  const settledIndex = selectedIndex >= 0 ? selectedIndex : 0
  const lensWidth = Math.max((liquidDockWidth - CUSTOMER_LIQUID_NAV_RAIL_PADDING * 2) / customerV21DockNavItems.length, 0)
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
      navItems={customerV21DockNavItems}
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

type ProfileUtilitySectionProps = {
  kind: Extract<CustomerProfileUtility, 'address' | 'language' | 'memory' | 'password' | 'personal-details'>
}

// Address, password, and account forms intentionally retain separate validation and pending states.
// react-doctor-disable-next-line react-doctor/prefer-useReducer
function ProfileUtilitySection({ kind }: ProfileUtilitySectionProps) {
  const language = useAppLanguage()
  const workflow = useFrontendWorkflow()
  const { session, updateCustomerProfile, updatePassword } = useAuth()
  const { tokens } = useV21Theme()
  const copy = customerV21CommonCopy[language]
  const metadataFullName = stringFromUnknown(session?.user.user_metadata?.full_name)
  const metadataPhone = stringFromUnknown(session?.user.user_metadata?.phone_number)
  const metadataEmail = stringFromUnknown(session?.user.user_metadata?.contact_email) ?? session?.user.email ?? ''
  const metadataDefaultAddress = stringFromUnknown(session?.user.user_metadata?.default_address)
  const metadataSavedAddresses = stringArrayFromUnknown(session?.user.user_metadata?.saved_addresses)
  const memoryRows = agenticMemoryRowsFromUnknown(workflow.customerKaelMemory, language)
  const addressMemory = memoryRows.find((row) => row.preferenceKey === 'preferred_address')
  const backendMessageMemoryAllowed = agenticBooleanFromMemory(workflow.customerKaelMemory, 'message_interaction_memory')
  const messageMemoryPreference = useCustomerMessageMemoryPreference({
    accessToken: session?.access_token ?? null,
    backendEnabled: backendMessageMemoryAllowed,
    language,
    ownerId: session?.user.id ?? null,
    updatePreference: workflow.actions.updateCustomerKaelMemoryPreference,
  })
  const initialDefaultAddress = metadataDefaultAddress ?? (addressMemory?.value && addressMemory.value !== copy.dataPending ? addressMemory.value : '')
  const [defaultAddressDraft, setDefaultAddressDraft] = useState(initialDefaultAddress)
  const [confirmedDefaultAddress, setConfirmedDefaultAddress] = useState(initialDefaultAddress)
  const [secondaryAddressDraft, setSecondaryAddressDraft] = useState('')
  const [savedAddresses, setSavedAddresses] = useState(metadataSavedAddresses)
  const [addressSaving, setAddressSaving] = useState(false)
  const [addressMessage, setAddressMessage] = useState<string | null>(null)
  const [currentPasswordDraft, setCurrentPasswordDraft] = useState('')
  const [newPasswordDraft, setNewPasswordDraft] = useState('')
  const [confirmPasswordDraft, setConfirmPasswordDraft] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null)
  const [accountFullNameDraft, setAccountFullNameDraft] = useState(metadataFullName ?? '')
  const [accountPhoneDraft, setAccountPhoneDraft] = useState(metadataPhone ?? '')
  const [accountEmailDraft, setAccountEmailDraft] = useState(metadataEmail)
  const [accountSaving, setAccountSaving] = useState(false)
  const [accountMessage, setAccountMessage] = useState<string | null>(null)
  const addressSaveInFlightRef = useRef(false)
  const accountSaveInFlightRef = useRef(false)
  const passwordSaveInFlightRef = useRef(false)
  const saveAddressProfile = async (input: { defaultAddress?: string; savedAddresses?: string[] }) => {
    if (addressSaveInFlightRef.current) return null
    addressSaveInFlightRef.current = true
    setAddressSaving(true)
    setAddressMessage(null)
    try {
      const result = await updateCustomerProfile(input)
      if (!result.success) {
        setAddressMessage(localizeAccountMutationError(result.error, language, 'profile'))
        return false
      }
      setAddressMessage(language === 'vi' ? 'Đã lưu' : 'Saved')
      return true
    } catch {
      setAddressMessage(localizeAccountMutationError(null, language, 'profile'))
      return false
    } finally {
      addressSaveInFlightRef.current = false
      setAddressSaving(false)
    }
  }

  const accountCanSave =
    accountFullNameDraft.trim().length >= 2 ||
    accountPhoneDraft.trim().length >= 6 ||
    accountEmailDraft.trim().length >= 4
  const saveAccountProfile = async () => {
    if (accountSaveInFlightRef.current) return false
    if (!accountCanSave) {
      setAccountMessage(language === 'vi' ? 'Kiểm tra thông tin.' : 'Check details.')
      return false
    }
    accountSaveInFlightRef.current = true
    setAccountSaving(true)
    setAccountMessage(null)
    try {
      const result = await updateCustomerProfile({
        email: accountEmailDraft.trim(),
        fullName: accountFullNameDraft.trim(),
        phone: accountPhoneDraft.trim(),
      })
      if (!result.success) {
        setAccountMessage(localizeAccountMutationError(result.error, language, 'profile'))
        return false
      }
      setAccountMessage(language === 'vi' ? 'Đã lưu' : 'Saved')
      return true
    } catch {
      setAccountMessage(localizeAccountMutationError(null, language, 'profile'))
      return false
    } finally {
      accountSaveInFlightRef.current = false
      setAccountSaving(false)
    }
  }

  const passwordMatches = newPasswordDraft.length > 0 && newPasswordDraft === confirmPasswordDraft
  const passwordCanSave = currentPasswordDraft.trim().length > 0 && newPasswordDraft.length >= 8 && passwordMatches
  const saveSettingsPassword = async () => {
    if (passwordSaveInFlightRef.current) return false
    if (!passwordCanSave) {
      setPasswordMessage(language === 'vi' ? 'Kiểm tra mật khẩu.' : 'Check password.')
      return false
    }
    passwordSaveInFlightRef.current = true
    setPasswordSaving(true)
    setPasswordMessage(null)
    try {
      const result = await updatePassword({
        currentPassword: currentPasswordDraft,
        newPassword: newPasswordDraft,
      })
      if (!result.success) {
        setPasswordMessage(localizeAccountMutationError(result.error, language, 'password'))
        return false
      }
      setCurrentPasswordDraft('')
      setNewPasswordDraft('')
      setConfirmPasswordDraft('')
      setPasswordMessage(language === 'vi' ? 'Đã đổi mật khẩu' : 'Password changed')
      return true
    } catch {
      setPasswordMessage(localizeAccountMutationError(null, language, 'password'))
      return false
    } finally {
      passwordSaveInFlightRef.current = false
      setPasswordSaving(false)
    }
  }

  const accountModel = {
    canSave: accountCanSave,
    emailDraft: accountEmailDraft,
    fullNameDraft: accountFullNameDraft,
    message: accountMessage,
    messageColor: accountMessage?.includes('Đã') || accountMessage === 'Saved' ? tokens.primary : tokens.danger,
    onEmailChange: (value: string) => {
      setAccountEmailDraft(value)
      setAccountMessage(null)
    },
    onFullNameChange: (value: string) => {
      setAccountFullNameDraft(value)
      setAccountMessage(null)
    },
    onPhoneChange: (value: string) => {
      setAccountPhoneDraft(value)
      setAccountMessage(null)
    },
    onSave: () => void saveAccountProfile(),
    phoneDraft: accountPhoneDraft,
    saving: accountSaving,
  }
  const passwordModel = {
    canSave: passwordCanSave,
    confirmDraft: confirmPasswordDraft,
    currentDraft: currentPasswordDraft,
    message: passwordMessage,
    messageColor: passwordMessage?.includes('Đã') || passwordMessage === 'Password changed' ? tokens.primary : tokens.danger,
    newDraft: newPasswordDraft,
    onConfirmChange: (value: string) => {
      setConfirmPasswordDraft(value)
      setPasswordMessage(null)
    },
    onCurrentChange: (value: string) => {
      setCurrentPasswordDraft(value)
      setPasswordMessage(null)
    },
    onNewChange: (value: string) => {
      setNewPasswordDraft(value)
      setPasswordMessage(null)
    },
    onSave: () => void saveSettingsPassword(),
    passwordMatches,
    saving: passwordSaving,
  }

  if (kind === 'personal-details') {
    return (
      <ProfilePersonalDetailsView
        account={accountModel}
        language={language}
        textInputNoOutlineStyle={customerV21WebTextInputNoOutline}
        tokens={tokens}
      />
    )
  }
  if (kind === 'password') {
    return (
      <ProfileLoginSecurityView
        language={language}
        password={passwordModel}
        textInputNoOutlineStyle={customerV21WebTextInputNoOutline}
        tokens={tokens}
      />
    )
  }
  if (kind === 'language') {
    return (
      <ProfileLanguageView
        language={language}
        onSelectLanguage={(nextLanguage) => setAppLanguage(nextLanguage)}
        tokens={tokens}
      />
    )
  }
  if (kind === 'memory') {
    return (
      <ProfileKaelMemoryView
        language={language}
        memory={{
          allowed: messageMemoryPreference.enabled,
          onToggle: () => void messageMemoryPreference.toggle(),
          pending: messageMemoryPreference.pending,
        }}
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
        const previousSavedAddresses = savedAddresses
        const previousSecondaryAddressDraft = secondaryAddressDraft
        const nextAddress = secondaryAddressDraft.trim()
        const nextSavedAddresses = Array.from(new Set([...savedAddresses, nextAddress])).slice(0, 8)
        setSavedAddresses(nextSavedAddresses)
        setSecondaryAddressDraft('')
        void saveAddressProfile({
          defaultAddress: savedDefaultAddress || undefined,
          savedAddresses: nextSavedAddresses,
        }).then((saved) => {
          if (saved === false) {
            setSavedAddresses(previousSavedAddresses)
            setSecondaryAddressDraft(previousSecondaryAddressDraft)
          }
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
  const rank = typeof insights?.usage_rank_level === 'number' ? Math.max(0, Math.min(5, insights.usage_rank_level)) : null
  const points = typeof insights?.usage_rank_points === 'number' ? Math.max(0, insights.usage_rank_points) : null
  const numericRank = rank ?? 0
  const numericPoints = points ?? 0
  const rankCyclePoints = numericPoints > 0 ? (numericPoints % 1000 || 1000) : 0
  const progress = Math.max(0, Math.min(100, rankCyclePoints / 10))
  const nextRank = numericRank > 0 && numericRank < 5 ? numericRank + 1 : null
  const remaining = nextRank ? Math.max(0, 1000 - rankCyclePoints) : 0
  const levelProgress = numericRank > 0 && points !== null
    ? Math.max(0, Math.min(100, (((numericRank - 1) * 1000 + rankCyclePoints) / 4000) * 100))
    : 0
  const levelProgressLabel = points === null
    ? copy.dataPending
    : language === 'vi'
      ? `${formatNumber(rankCyclePoints, language)} / 1.000 điểm`
      : `${formatNumber(rankCyclePoints, language)} / 1,000 points`
  const rankTitle = rank === null
    ? copy.dataPending
    : numericRank > 0
      ? (language === 'vi' ? 'Sử dụng tích cực, hành vi tốt.' : 'Positive usage and good behavior.')
      : (language === 'vi' ? 'Chưa có hoạt động đủ điều kiện để xếp hạng.' : 'No qualifying activity yet for a level.')
  const pointsText = points === null
    ? copy.dataPending
    : nextRank
      ? (language === 'vi'
        ? `${formatNumber(rankCyclePoints, language)} / 1.000 điểm · còn ${formatNumber(remaining, language)} điểm lên hạng ${nextRank}`
        : `${formatNumber(rankCyclePoints, language)} / 1,000 points · ${formatNumber(remaining, language)} to level ${nextRank}`)
      : (language === 'vi' ? `${formatNumber(rankCyclePoints, language)} / 1.000 điểm` : `${formatNumber(rankCyclePoints, language)} / 1,000 points`)
  const completedCount = insightNumber(insights, 'completed_service_count', copy.emptyProfileMetric, language)
  const streakLabel = insightNumber(insights, 'active_streak_days', copy.emptyProfileMetric, language, (value) => (language === 'vi' ? `${formatNumber(value, language)} ngày` : `${formatNumber(value, language)} days`))
  const reviewRate = insightNumber(
    insights,
    'positive_review_rate_percent',
    copy.emptyProfileMetric,
    language,
    (value) => `${formatNumber(value, language)}%`,
  )
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
      progressBar={<ProfileProgressBar percent={numericRank > 0 && points !== null ? progress : 0} testID="customer-v21-profile-ranking-progress" />}
      rank={rank}
      rankNodes={[1, 2, 3, 4, 5].map((node) => ({ active: numericRank === node, label: rankLabel(node, language), value: node }))}
      rankProcess={(
        <ProfileRankProcess
          label={language === 'vi' ? 'Tiến trình hạng' : 'Level progress'}
          percent={levelProgress}
          value={levelProgressLabel}
        />
      )}
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
  const score = typeof insights?.money_protection_score === 'number' ? Math.max(0, Math.min(100, insights.money_protection_score)) : null
  const numericScore = score ?? 0
  const totalTransactionCount = typeof insights?.total_transaction_count === 'number'
    ? Math.max(0, insights.total_transaction_count)
    : null
  const protectedTransactionCount = typeof insights?.protected_transaction_count === 'number'
    ? Math.max(0, insights.protected_transaction_count)
    : null
  const noTransactionsConfirmed = totalTransactionCount === 0 && protectedTransactionCount === 0
  const protectedTransactions = protectedTransactionLabel(insights, language, copy.emptyProfileMetric)
  const protectedValue = insightNumber(insights, 'protected_value_vnd', copy.emptyProfileMetric, language, (value) => formatVnd(value, language))
  const disputeFree = totalTransactionCount !== null && totalTransactionCount > 0
    ? insightNumber(insights, 'dispute_free_rate_percent', copy.emptyProfileMetric, language, (value) => `${formatNumber(value, language)}%`)
    : copy.emptyProfileMetric
  const scoreState = score === null
    ? copy.dataPending
    : numericScore >= 80
      ? (language === 'vi' ? 'Rất tốt' : 'Very good')
      : numericScore > 0
        ? (language === 'vi' ? 'Đang theo dõi' : 'Tracking')
        : noTransactionsConfirmed
          ? (language === 'vi' ? 'Chưa bắt đầu' : 'Not started')
          : (language === 'vi' ? 'Cần lưu ý' : 'Needs attention')
  const scoreBody = score === null
    ? (language === 'vi' ? 'Chưa có dữ liệu giao dịch để tính chỉ số bảo vệ.' : 'Transaction data is not available yet for a protection score.')
    : noTransactionsConfirmed
      ? (language === 'vi' ? 'Chưa có giao dịch được bảo vệ để tính chỉ số.' : 'No protected transactions yet for this score.')
      : (language === 'vi' ? 'Dữ liệu bảo vệ dựa trên giao dịch thật trong hệ thống.' : 'Protection data is based on real in-system transactions.')
  return (
    <ProfileMoneyPanel
      body={scoreBody}
      chipLabel={score === null
        ? copy.dataPending
        : numericScore > 0
          ? (language === 'vi' ? `Đáng tin cậy · ${scoreState}` : `Trusted · ${scoreState}`)
          : scoreState}
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

const styles = StyleSheet.create({
  agenticUtilityIcon: {
    minHeight: 56,
    minWidth: 56,
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 20,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 10,
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
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
  infoNoticeIcon: {
    minHeight: 58,
    minWidth: 58,
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
