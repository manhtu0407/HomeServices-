import { memo, type ComponentType, type ReactNode, type SetStateAction, useCallback, useMemo, useState } from 'react'
import { useEffect, useRef } from 'react'
import { Image } from 'expo-image'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
  type PressableStateCallbackType,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Circle, Defs, LinearGradient } from 'react-native-svg'
import { AlphaStop as Stop } from '@/components/ui/svg-alpha-stop'
import { buildLocalJobDisplayCode, type LocalDeal, type ServiceType } from '@nestscout/shared'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { useDockScrollHandler } from '@/components/ui/dock-scroll-state'
import { KaelButton, KaelTextField, MintAura } from '@/components/ui/kael-primitives'
import { motionDuration, motionTokens } from '@/components/ui/motion-tokens'
import { color, glass, radius, shadow, signature, typography } from '@/design/theme'
import { getMobileApiAuthHeaders, mobileApiUrl } from '@/lib/api'
import { localizeAccountMutationError } from '@/lib/account-mutation-error'
import { setAppLanguage, type AppLanguage, localizedServiceLabel, localizedStatusLabel } from '@/lib/app-language'
import { useAuth } from '@/lib/auth-provider'
import {
  clearStableClientRequestId,
  stableClientRequestId,
  type PendingClientRequestRef,
} from '@/lib/client-request-id'
import { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { isWorkerOperationalJobStatus } from '@/lib/frontend-workflow/helpers'
import { useJobChatThread } from '@/lib/use-job-chat-thread'
import { mergeJobMediaRefsNewestFirst } from '@/lib/job-media-preview'
import {
  localizeMediaUploadFailure,
  uploadJobMediaDrafts,
  type LocalMediaUploadDraft,
} from '@/lib/media-upload'
import { kaelMemoryService, workerKaelChatService, workerRouteService } from '@/lib/services'
import type {
  WorkerV5IconName,
  WorkerV5RouteParams,
  WorkerV5ScreenDefinition,
  WorkerV5ScreenId,
  WorkerV5Section,
} from './dock/types'
import {
  WORKER_V5_SCREENS,
  getWorkerV5Screen,
  phaseCopy,
  requireWorkerV5Screen,
  workerV5EnglishGuardrails,
} from './dock/screens'
import {
  firstRouteParam,
  resolveWorkerV5Language,
  resolveWorkerV5ScreenId,
  routeForWorkerV5Screen,
  workerV5Routes,
} from './dock/routing'
import {
  WorkerV5HomeQuickActionGrid,
  WorkerV5KaelBriefCard,
  WorkerV5QuickActionGrid,
} from './home/action-surfaces'
import {
  WorkerV5OpportunityCard,
  WorkerV5OpportunityEmptyCard,
} from './home/opportunity-surfaces'
import {
  WorkerV5BankTaxBody,
  WorkerV5ProfileOverviewBody,
  WorkerV5ReliabilityInsightsBody,
  WorkerV5ReviewsFeedbackBody,
  WorkerV5SkillsServiceAreaBody,
  WorkerV5VerificationDocumentsBody,
  WorkerV5WorkerRankingBody,
} from './profile/body-surfaces'
import { useWorkerAvatarPicker } from './profile/use-worker-avatar-picker'
import type { WorkerV5MemoryPreferenceUiId } from './profile/memory'
import { WORKER_V5_MEMORY_PREFERENCE_API_KEYS, workerV5MemoryPreferenceOverridesFromMemory } from './profile/memory'
import {
  WorkerV5MemoryHero,
  WorkerV5MemorySwitchList,
} from './profile/memory-surfaces'
import { styles as rankingStyles } from './profile/ranking-styles'
import { styles as reliabilityStyles } from './profile/reliability-styles'
import {
  WorkerV5ReadOnlyToggleList,
  WorkerV5SettingsActionRow,
  WorkerV5SettingsHero,
} from './profile/settings-surfaces'
import { buildWorkerV5AcceptReviewChecks, workerV5CanAcceptOpenOffer } from './jobs/acceptance'
import {
  WorkerV5AcceptChecklistCard,
  WorkerV5AcceptCommitmentCard,
} from './jobs/acceptance-surfaces'
import {
  WorkerV5ActionRail,
  WorkerV5ChatBubble,
  WorkerV5SingleSourceActionButton,
} from './jobs/advisory-surfaces'
import {
  WorkerV5ApprovalWaitBody,
  WorkerV5CaseClosedBody,
  WorkerV5CompletionSubmittedBody,
} from './jobs/completion-bodies'
import { WorkerV5CompletionEvidenceScreenBody } from './jobs/completion-evidence-screen-body'
import { WorkerV5RouteEtaBody } from './jobs/active-body-surfaces'
import { WorkerV5EvidenceTray } from './jobs/evidence-surfaces'
import {
  WorkerV5EarningsOverviewBody,
  WorkerV5LedgerDetailBody,
  WorkerV5PayoutRequestBody,
} from './earnings/body-surfaces'
import { WorkerV5LedgerHero } from './earnings/ledger-surfaces'
import { WorkerV5PayoutLimitPolicyCard } from './earnings/payout-surfaces'
import { WorkerV5PayoutMethodBody, WorkerV5PayoutMethodHero } from './earnings/payout-method-surfaces'
import {
  buildWorkerV5OfferAddressRows,
  buildWorkerV5OfferRequestRows,
} from './jobs/offer'
import { WorkerV5EtaSummaryCard } from './jobs/map-surfaces'
import { useWorkerV5RoutePreview, type WorkerV5RoutePreviewState } from './jobs/use-worker-route-preview'
import { WorkerV5OfferDetailEmptyCard, WorkerV5OfferDetailListCard, WorkerV5OfferDetailSummaryCard } from './jobs/offer-surfaces'
import { WorkerV5ProgressRail, WorkerV5WorkProgressBoard } from './jobs/progress-surfaces'
import {
  WorkerV5StatusTimeline as WorkerV5StatusTimelineSurface,
  type WorkerV5StatusTimelineBaseProps,
} from './jobs/timeline-surfaces'
import { WorkerV5PriceLines } from './jobs/shared-surfaces'
import { WorkerV5ScopeEvidenceGate } from './jobs/scope-surfaces'
import { useWorkerV5ScopeChangeDraft } from './jobs/use-worker-scope-change-draft'
import { formatVnd, textByLanguage } from './ui/format'
import {
  formatScopePriceRange,
  formatWorkerDistrict,
  getWorkerV5ChatJobId,
  normalizeServiceAreaDraftText,
  normalizeWorkerV5DistrictSelectionList,
  parseWorkerV5ServiceAreaDraft,
  workerAvailabilityLabel,
  workerDocumentSummary,
  workerV5DistrictDraftFromSelection,
  workerV5HomeDisplayName,
} from './ui/labels'
import {
  workerV5HasNumber,
  workerV5NumericInsight,
} from './ui/performance'
import {
  workerV5ArrivalDestinationLabel,
  workerV5StringFromUnknown,
  type WorkerV5MapLocation,
} from './ui/route'
import { WorkerV5IntegratedIcon } from './ui/integrated-icon-surfaces'
import { WorkerV5DetailRail } from './ui/worker-v5-detail-rail'
import {
  workerV5CapturedIconAssets,
  workerV5HomeQuickIconAssets,
  workerV5ProfileDossierIconAssets,
  workerV5ProfileServiceIconAssets,
  workerV5RankingIconAssets,
  workerV5ReliabilityIconAssets,
  workerV5SettingsIconAssets,
} from './ui/worker-v5-icon-assets'
import {
  WorkerV5CustomerCaseWideMintAura,
  WorkerV5CustomerFulfillmentCanvasAura,
  WorkerV5CustomerMapMintAura,
  WorkerV5CustomerZipMintAura,
  WorkerV5EarningsHomeHeroAura,
  WorkerV5EarningsHomeListAura,
  WorkerV5HomeAuraBackground,
  WorkerV5HomeHeroSourceAura,
  WorkerV5HomeQuickActionsAura,
  WorkerV5KaelChatScreenAura,
  WorkerV5SourceCardSkin,
} from './ui/aura-surfaces'
import {
  WorkerV5BackArrowIcon,
  WorkerV5InfoRow as WorkerV5PrimitiveInfoRow,
  WorkerV5NavButton,
  WorkerV5PrimaryActionButton,
  WorkerV5PrimaryButtonFill,
  WorkerV5SectionHeader,
} from './ui/primitives-surfaces'
import { WorkerV5KaelOrbCameraIcon } from './chat/orb-surfaces'
import {
  WorkerV5KaelOrbBody,
} from './chat/body-surfaces'
import { WorkerV5KaelSessionMenu, WorkerV5KaelSessionPlusIcon } from './chat/session-menu'
import { useWorkerV5KaelOrbChat } from './chat/use-kael-orb-chat'
import {
  canUseWorkerV5PrivateKaelChat,
  workerV5PrivateKaelMediaName,
  type WorkerV5PrivateKaelSession,
} from './chat/use-worker-kael-orb-chat'
import {
  WorkerV5BoundaryNote,
  WorkerV5TimerCard,
} from './ui/metrics-surfaces'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import { styles } from './worker-v5-flow-styles'

export type { WorkerDockActive } from './dock/types'
import { WorkerV5AvailabilityCard } from './home/availability-surfaces'
import { WorkerV5MapStage } from './home/map-stage-surfaces'
import { WorkerV5HomeScreenSurface } from './home/screen-surfaces'
import { WorkerV5HomeBody } from './home/screen-surfaces'
import { InfoListCard, MetricTile, WorkerV5ScreenInfoRow } from './ui/screen-atoms-surfaces'
import { workerV5Icons } from './ui/screen-icons'
import { WORKER_V5_PROFILE_ICON_VISUAL_BOOST } from './ui/screen-icons'
import { WorkerV5KaelOrbComposer, WorkerV5KaelOrbScreenSurface } from './chat/orb-screen-surfaces'
import { WorkerV5KaelChatBody, WorkerV5KaelJobIntakeBody } from './chat/kael-body-surfaces'
import { workerV5OpportunityServiceIcons } from './ui/screen-icons'
import { workerV5JobsDestinationScreenId } from './ui/screen-navigation'
import { WorkerV5RankingHero } from './profile/ranking-hero-surfaces'
import { WorkerV5AgentMemoryBody } from './profile/agent-memory-surfaces'
import { WorkerV5SettingsBody } from './profile/settings-body-surfaces'
import { WorkerV5ServiceAreaMapCard } from './profile/service-area-map-surfaces'
import { WorkerV5ReliabilityAxisFill, WorkerV5ReliabilityHero } from './profile/reliability-hero-surfaces'
import { workerV5DisplayCode } from './ui/screen-labels'
import { workerV5OfferDetailEmptyIcon, workerV5OfferDetailIcons } from './jobs/inbox-offer-surfaces'
import { WorkerV5CustomerConfirmationWaitBody, WorkerV5OfferDetailBody, WorkerV5OpportunityInboxBody } from './jobs/inbox-offer-surfaces'
import { WorkerV5InProgressBody } from './jobs/in-progress-surfaces'
import { WorkerV5ScopeChangeBody } from './jobs/scope-change-body-surfaces'
import { WorkerV5RouteMapStage, WorkerV5StatusTimeline } from './jobs/route-map-surfaces'
import { workerV5CaseHeaderSubtitle, workerV5OfferHeaderSubtitle, workerV5TravelHeaderSubtitle } from './jobs/header-copy'
type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

// A Reanimated style only drives a component created through Animated; on a
// plain Pressable the mode-trigger scale never ran.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

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
  const auditRole = firstRouteParam(params.ns_audit_role)
  const routeLanguage = firstRouteParam(params.ns_worker_lang)
  const workerRouteContext = useMemo(() => ({
    ns_audit_role: auditRole,
    ns_worker_lang: routeLanguage,
  }), [auditRole, routeLanguage])
  const screenId = screen.id
  const screenPrimaryNext = screen.primaryNext
  const onDockScroll = useDockScrollHandler()
  const router = useRouter()
  const { session, signOut } = useAuth()
  const runtime = useFrontendWorkflow()
  const [actionBusy, setActionBusy] = useState(false)
  const actionBusyRef = useRef(false)
  const { height } = useWindowDimensions()
  const glass = useGlassAccessibility()
  const { avatarUploadBusy, openWorkerAvatarPicker } = useWorkerAvatarPicker({
    language,
    uploadAvatar: runtime.actions.workerUploadAvatar,
  })
  const previousScreen = useMemo(
    () => {
      const index = WORKER_V5_SCREENS.findIndex((candidate) => candidate.id === screenId)
      return index > 0 ? WORKER_V5_SCREENS[index - 1] ?? null : null
    },
    [screenId],
  )
  const nextScreen = useMemo(
    () => WORKER_V5_SCREENS.find((candidate) => candidate.id === screenPrimaryNext) ?? null,
    [screenPrimaryNext],
  )
  const title = screen.title[language]
  const minHeight = Math.max(620, Math.round(height * 0.92))
  const surfaceStyle = glass.reduceTransparency ? styles.surfaceSolid : styles.surfaceGlass
  const usesOpportunityInboxHandoff = screen.id === '2.1-opportunity-inbox'
  const usesOfferDetailHandoff = screen.id === '2.2-offer-detail'
  const usesCustomerConfirmationWaitHandoff = screen.id === '2.3-customer-confirmation-wait'
  const usesRouteEtaHandoff = screen.id === '2.4-route-eta'
  const routePreview = useWorkerV5RoutePreview(runtime.state.deal, usesRouteEtaHandoff)
  const usesTravelHandoff = usesRouteEtaHandoff
  const usesInProgressHandoff = screen.id === '2.7-in-progress'
  const headerBackScreen = usesCustomerConfirmationWaitHandoff || usesRouteEtaHandoff || usesInProgressHandoff
    ? getWorkerV5Screen('2.1-opportunity-inbox') ?? previousScreen
    : previousScreen
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
  const usesProfileHandoff = screen.id === '5.1-profile-overview' || screen.id === '5.2-worker-ranking' || screen.id === '5.3-skills-service-area' || screen.id === '5.4-reliability-insights' || screen.id === '5.5-account-utilities' || screen.id === '5.6-agent-memory-preferences' || screen.id === '5.7-verification-documents' || screen.id === '5.8-bank-tax-center' || screen.id === '5.9-reviews-feedback' || screen.id === '5.10-support-settings'
  const hidesHeaderUtility = screen.id === '5.1-profile-overview' || screen.id === '5.2-worker-ranking' || screen.id === '5.3-skills-service-area' || screen.id === '5.4-reliability-insights' || screen.id === '5.10-support-settings'
  const usesCaseExecutionHandoff = usesCustomerConfirmationWaitHandoff || usesInProgressHandoff || usesScopeChangeHandoff || usesApprovalWaitHandoff || usesCompletionEvidenceHandoff || usesCompletionSubmittedHandoff || usesCaseClosedHandoff
  const usesHandoffStage = usesOpportunityInboxHandoff || usesOfferDetailHandoff || usesTravelHandoff || usesCaseExecutionHandoff || usesKaelOrbHandoff || usesEarningsHandoff || usesProfileHandoff
  const handoffHeaderSubtitle = usesOpportunityInboxHandoff
    ? textByLanguage(language, 'Kael đã lọc theo kỹ năng, bán kính và lịch trống', 'Kael has filtered by skills, radius, and open schedule')
    : usesEarningsOverviewHandoff
      ? null
    : screen.id === '4.2-ledger-detail'
      ? null
    : usesPayoutRequestHandoff
      ? null
    : usesPayoutMethodHandoff
      ? textByLanguage(language, 'Chỉ hiển thị dữ liệu tài khoản đã ghi nhận', 'Recorded account data only')
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
      : usesCustomerConfirmationWaitHandoff
        ? workerV5OfferHeaderSubtitle(runtime.state.deal, language)
      : usesApprovalWaitHandoff || usesCompletionSubmittedHandoff
        ? workerV5CaseHeaderSubtitle(runtime.state.deal, language)
      : usesInProgressHandoff
        ? null
      : usesCaseExecutionHandoff || usesOfferDetailHandoff
        ? workerV5OfferHeaderSubtitle(runtime.state.deal, language)
        : null

  const displayTitle = usesKaelOrbHandoff && screen.id === '3.1-kael-chat-normal'
    ? 'Kael'
    : usesEarningsOverviewHandoff
      ? textByLanguage(language, 'Thu nhập của bạn', 'Your earnings')
    : title

  const formulaPageAuraTarget = usesOpportunityInboxHandoff
      ? { scope: 'OpportunityInboxPage', testID: 'worker-v5-opportunity-page-customer-mint-aura' }
    : usesOfferDetailHandoff
      ? { scope: 'OfferDetailPage', testID: 'worker-v5-offer-page-customer-mint-aura' }
    : usesRouteEtaHandoff
      ? { scope: 'RouteEtaPage', testID: 'worker-v5-route-page-customer-mint-aura' }
    : usesCompletionSubmittedHandoff
      ? { scope: 'CompletionSubmittedPage', testID: 'worker-v5-completion-submitted-background-mint-aura' }
    : usesProfileHandoff
      ? { scope: 'WorkerProfilePage', testID: 'worker-v5-profile-page-customer-mint-aura' }
    : usesEarningsHandoff
      ? { scope: 'WorkerEarningsPage', testID: 'worker-v5-earnings-page-customer-mint-aura' }
    : usesInProgressHandoff
      ? { scope: 'WorkerInProgressPage', testID: 'worker-v5-in-progress-canvas-aura' }
    : usesCaseExecutionHandoff
      ? { scope: 'WorkerCaseExecutionPage', testID: 'worker-v5-case-flow-page-customer-mint-aura' }
      : { scope: 'WorkerDefaultPage', testID: 'worker-v5-page-mint-aura' }

  const openScreen = (target: WorkerV5ScreenDefinition | null) => {
    if (!target) return
    router.replace(routeForWorkerV5Screen(target, workerRouteContext) as never)
  }
  const openScreenById = (id: WorkerV5ScreenId) => {
    openScreen(WORKER_V5_SCREENS.find((candidate) => candidate.id === id) ?? null)
  }
  const openJobChat = () => router.replace('/(worker)/chat?ns_worker_screen=3.1-kael-chat-normal' as never)
  const runWorkerAction = async (action: () => Promise<boolean>) => {
    if (actionBusyRef.current) return
    actionBusyRef.current = true
    setActionBusy(true)
    try {
      const ok = await action()
      if (ok) openScreen(nextScreen)
    } finally {
      actionBusyRef.current = false
      setActionBusy(false)
    }
  }
  const runRouteAction = async () => {
    if (actionBusyRef.current) return
    const status = runtime.state.deal?.status
    const nextStatus = status === 'worker_matched'
      ? 'worker_on_way'
      : status === 'worker_on_way'
        ? 'arrived'
        : null
    if (!nextStatus) {
      openScreenById(workerV5JobsDestinationScreenId(runtime.state.deal))
      return
    }
    actionBusyRef.current = true
    setActionBusy(true)
    try {
      const ok = await runtime.actions.workerUpdateStatus(nextStatus)
      if (ok) openScreenById('2.7-in-progress')
    } finally {
      actionBusyRef.current = false
      setActionBusy(false)
    }
  }
  const primaryAction = getWorkerV5PrimaryAction(screen, runtime, language, actionBusy, runWorkerAction, () => openScreen(nextScreen))
  const workflowDestinationScreenId = workerV5JobsDestinationScreenId(runtime.state.deal)
  const workflowStatus = runtime.state.deal?.backendStatus ?? runtime.state.deal?.status ?? null
  const workflowHydrationPending = runtime.state.workerGate === 'backend_pending' && !runtime.workerJobsHydrated
  const screenRedirectId = workflowHydrationPending
    ? null
    : usesOfferDetailHandoff && !workerV5CanAcceptOpenOffer(runtime.state.deal, runtime.state.workerGate)
      ? workflowDestinationScreenId
      : usesCustomerConfirmationWaitHandoff && workflowDestinationScreenId !== '2.3-customer-confirmation-wait'
        ? workflowDestinationScreenId
      : usesRouteEtaHandoff && workflowDestinationScreenId !== '2.4-route-eta'
        ? workflowDestinationScreenId
      : usesInProgressHandoff && workflowDestinationScreenId !== '2.7-in-progress'
        ? workflowDestinationScreenId
      : usesCompletionEvidenceHandoff && workflowStatus !== 'repairing'
        ? workflowDestinationScreenId
      : usesCompletionSubmittedHandoff && runtime.state.deal && workflowDestinationScreenId !== '2.11-completion-submitted'
        ? workflowStatus === 'repairing' ? '2.10-completion-evidence' : workflowDestinationScreenId
        : null

  useEffect(() => {
    if (!screenRedirectId) return
    router.replace(routeForWorkerV5Screen(requireWorkerV5Screen(screenRedirectId), workerRouteContext) as never)
  }, [router, screenRedirectId, workerRouteContext])

  if (screenRedirectId) return null

  if (usesKaelOrbHandoff) {
    return (
      <WorkerV5KaelOrbScreenSurface
        deal={runtime.state.deal}
        language={language}
        mode={screen.id === '3.2-kael-job-intake' ? 'intake' : 'normal'}
        navigateToScreen={openScreenById}
        profile={runtime.workerProfile}
        reduceMotion={glass.reduceMotion}
        reduceTransparency={glass.reduceTransparency}
        screen={screen}
        surfaceStyle={surfaceStyle}
        workerJobsHydrated={runtime.workerJobsHydrated}
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
      <WorkerV5CustomerFulfillmentCanvasAura
        reduceTransparency={glass.reduceTransparency}
        scope={formulaPageAuraTarget.scope}
        testID={formulaPageAuraTarget.testID}
      />
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
      {usesRouteEtaHandoff && !glass.reduceTransparency ? (
        <WorkerV5CustomerZipMintAura
          scope="RouteEtaPageFine"
          style={styles.routeEtaPageZipAura}
          testID="worker-v5-route-page-customer-zip-mint-aura"
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
      <ScrollView
        bounces={false}
        contentContainerStyle={[styles.scrollContent, usesKaelOrbHandoff ? styles.kaelOrbCustomerScrollContent : null, { minHeight }]}
        onScroll={onDockScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        testID="worker-v5-scroll"
      >
        <View style={[styles.headerRow, usesKaelOrbHandoff ? styles.kaelOrbCustomerHeaderRow : null]}>
          {usesOpportunityInboxHandoff || usesEarningsOverviewHandoff ? null : (
            <Pressable
              accessibilityLabel={language === 'vi' ? 'Quay lại worker hiện tại' : 'Back to current worker surface'}
              accessibilityRole="button"
              onPress={() => (usesOfferDetailHandoff || usesTravelHandoff || usesCaseExecutionHandoff || usesEarningsHandoff ? openScreen(headerBackScreen) : router.replace(workerV5Routes[screen.section] as never))}
              style={({ pressed }) => [styles.iconButton, pressed && !glass.reduceMotion ? styles.pressed : null]}
              testID="worker-v5-back"
            >
              <WorkerV5BackArrowIcon />
            </Pressable>
          )}
          <View style={styles.headerTextColumn}>
            {usesCaseClosedHandoff ? null : usesKaelOrbHandoff || usesOpportunityInboxHandoff || usesOfferDetailHandoff || usesTravelHandoff || usesCaseExecutionHandoff || usesEarningsHandoff || usesProfileHandoff ? (
              <>
                <Text
                  style={[
                    styles.titleText,
                    usesKaelOrbHandoff ? styles.kaelOrbCustomerHeaderTitle : null,
                    usesEarningsOverviewHandoff ? styles.earningsOverviewTitle : null,
                  ]}
                  testID={usesEarningsOverviewHandoff ? 'worker-v5-earnings-overview-title' : undefined}
                >
                  {displayTitle}
                </Text>
                {handoffHeaderSubtitle ? <Text style={styles.headerSubtitleText} numberOfLines={2}>{handoffHeaderSubtitle}</Text> : null}
              </>
            ) : (
              <Text style={styles.phaseText}>{phaseCopy[screen.phase][language]}</Text>
            )}
            {!usesOpportunityInboxHandoff && !usesOfferDetailHandoff && !usesTravelHandoff && !usesCaseExecutionHandoff && !usesKaelOrbHandoff && !usesEarningsHandoff && !usesProfileHandoff ? <Text style={styles.titleText}>{title}</Text> : null}
          </View>
          {usesOpportunityInboxHandoff || usesEarningsOverviewHandoff ? null : usesOfferDetailHandoff ? (
            <Pressable
              accessibilityLabel={language === 'vi' ? 'Tùy chọn đề nghị' : 'Offer options'}
              accessibilityRole="button"
              onPress={() => openScreen(WORKER_V5_SCREENS.find((candidate) => candidate.id === '3.2-kael-job-intake') ?? nextScreen)}
              style={({ pressed }) => [styles.iconButton, pressed && !glass.reduceMotion ? styles.pressed : null]}
              testID="worker-v5-offer-menu"
            >
              <Text style={styles.headerMenuText}>•••</Text>
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
          ) : usesCaseExecutionHandoff ? null : screen.id === '4.2-ledger-detail' ? (
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
          ) : hidesHeaderUtility ? null : (
            <View style={styles.iconBadge} testID={`worker-v5-header-icon-${screen.id}`}>
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

        <WorkerV5Body
          key={session?.user.id ?? 'guest-worker'}
          actionBusy={actionBusy}
          avatarUploadBusy={avatarUploadBusy}
          language={language}
          navigateJobChat={openJobChat}
          navigateNext={() => openScreen(nextScreen)}
          navigateToScreen={openScreenById}
          openWorkerAvatarPicker={openWorkerAvatarPicker}
          reduceMotion={glass.reduceMotion}
          reduceTransparency={glass.reduceTransparency}
          routePreview={routePreview}
          runRouteAction={runRouteAction}
          runWorkerAction={runWorkerAction}
          runtime={runtime}
          screen={screen}
        />

        {primaryAction && screen.id !== '5.4-reliability-insights' && screen.id !== '5.5-account-utilities' && screen.id !== '5.6-agent-memory-preferences' && screen.id !== '5.10-support-settings' && !usesOpportunityInboxHandoff && !usesOfferDetailHandoff && !usesTravelHandoff && !usesCaseExecutionHandoff && !usesKaelOrbHandoff && !usesEarningsHandoff ? (
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

function WorkerV5Body({
  actionBusy,
  avatarUploadBusy,
  language,
  navigateJobChat,
  navigateNext,
  navigateToScreen,
  openWorkerAvatarPicker,
  reduceMotion,
  reduceTransparency,
  routePreview,
  runRouteAction,
  runWorkerAction,
  runtime,
  screen,
}: {
  actionBusy: boolean
  avatarUploadBusy: boolean
  language: AppLanguage
  navigateJobChat: () => void
  navigateNext: () => void
  navigateToScreen: (id: WorkerV5ScreenId) => void
  openWorkerAvatarPicker: () => void
  reduceMotion: boolean
  reduceTransparency: boolean
  routePreview: WorkerV5RoutePreviewState
  runRouteAction: () => void | Promise<void>
  runWorkerAction: (action: () => Promise<boolean>) => void | Promise<void>
  runtime: WorkerV5Runtime
  screen: WorkerV5ScreenDefinition
}) {
  switch (screen.id) {
    case '1.1-worker-home':
      return <WorkerV5HomeBody language={language} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '2.1-opportunity-inbox':
      return <WorkerV5OpportunityInboxBody language={language} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '2.2-offer-detail':
      return <WorkerV5OfferDetailBody language={language} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '2.3-customer-confirmation-wait':
      return <WorkerV5CustomerConfirmationWaitBody language={language} runtime={runtime} />
    case '2.4-route-eta':
      return (
        <WorkerV5RouteEtaBody
          actionBusy={actionBusy}
          caseWideAura={WorkerV5CustomerCaseWideMintAura}
          deal={runtime.state.deal}
          etaSummaryComponent={WorkerV5EtaSummaryCard}
          language={language}
          navigateJobChat={navigateJobChat}
          onPrimary={() => void runRouteAction()}
          primaryLabel={runtime.state.deal?.status === 'worker_matched'
            ? textByLanguage(language, 'Bắt đầu di chuyển', 'Start travel')
            : textByLanguage(language, 'Xác nhận đã tới', 'Confirm arrival')}
          primaryFill={WorkerV5PrimaryButtonFill}
          reduceTransparency={reduceTransparency}
          routeMapComponent={WorkerV5RouteMapStage}
          routePreview={routePreview}
          zipAura={WorkerV5CustomerZipMintAura}
        />
      )
    case '2.7-in-progress':
      return (
        <WorkerV5InProgressBody
          actionBusy={actionBusy}
          language={language}
          navigateJobChat={navigateJobChat}
          onTravelAction={() => void runRouteAction()}
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
          primaryFill={WorkerV5PrimaryButtonFill}
          reduceTransparency={reduceTransparency}
          runtime={runtime}
          statusTimeline={WorkerV5StatusTimeline}
        />
      )
    case '2.10-completion-evidence':
      return (
        <WorkerV5CompletionEvidenceScreenBody
          language={language}
          navigateNext={navigateNext}
          primaryFill={WorkerV5PrimaryButtonFill}
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
          primaryFill={WorkerV5PrimaryButtonFill}
          reduceMotion={reduceMotion}
          reduceTransparency={reduceTransparency}
          runtime={runtime}
          statusTimeline={WorkerV5StatusTimeline}
        />
      )
    case '2.12-case-closed':
      return (
        <WorkerV5CaseClosedBody
          completionRecordIcon={workerV5CapturedIconAssets.caseCompletionRecord}
          incomeLedgerIcon={workerV5CapturedIconAssets.caseIncomeLedger}
          language={language}
          navigateToEarnings={() => navigateToScreen('4.1-earnings-overview')}
          navigateToRanking={() => navigateToScreen('5.2-worker-ranking')}
          primaryFill={WorkerV5PrimaryButtonFill}
          reduceTransparency={reduceTransparency}
          runtime={runtime}
        />
      )
    case '3.1-kael-chat-normal':
      return <WorkerV5KaelChatBody language={language} navigateToScreen={navigateToScreen} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '3.2-kael-job-intake':
      return <WorkerV5KaelJobIntakeBody language={language} navigateToScreen={navigateToScreen} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '4.1-earnings-overview':
      return (
        <WorkerV5EarningsOverviewBody
          caseWideAura={WorkerV5CustomerCaseWideMintAura}
          earningsHeroIcon={workerV5CapturedIconAssets.earningsHero}
          heroAura={WorkerV5EarningsHomeHeroAura}
          icons={workerV5Icons}
          language={language}
          listAura={WorkerV5EarningsHomeListAura}
          navigateToScreen={navigateToScreen}
          primaryFill={WorkerV5PrimaryButtonFill}
          recentTransactionIcon={workerV5CapturedIconAssets.earningsRecentTransactions}
          reduceTransparency={reduceTransparency}
          runtime={runtime}
          zipAura={WorkerV5CustomerZipMintAura}
        />
      )
    case '4.2-ledger-detail':
      return (
        <WorkerV5LedgerDetailBody
          caseWideAura={WorkerV5CustomerCaseWideMintAura}
          language={language}
          ledgerHero={WorkerV5LedgerHero}
          listAura={WorkerV5EarningsHomeListAura}
          primaryFill={WorkerV5PrimaryButtonFill}
          reduceTransparency={reduceTransparency}
          runtime={runtime}
          statusTimeline={WorkerV5StatusTimeline}
          zipAura={WorkerV5CustomerZipMintAura}
        />
      )
    case '4.3-payout-request':
      return (
        <WorkerV5PayoutRequestBody
          caseWideAura={WorkerV5CustomerCaseWideMintAura}
          heroAura={WorkerV5EarningsHomeHeroAura}
          icons={workerV5Icons}
          language={language}
          listAura={WorkerV5EarningsHomeListAura}
          primaryFill={WorkerV5PrimaryButtonFill}
          reduceTransparency={reduceTransparency}
          runtime={runtime}
          zipAura={WorkerV5CustomerZipMintAura}
        />
      )
    case '4.4-payout-method':
      return <WorkerV5PayoutMethodBody language={language} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '5.1-profile-overview':
      return (
        <WorkerV5ProfileOverviewBody
          avatarUploadBusy={avatarUploadBusy}
          caseWideAura={WorkerV5CustomerCaseWideMintAura}
          dossierIcons={workerV5ProfileDossierIconAssets}
          heroAura={WorkerV5EarningsHomeHeroAura}
          language={language}
          listAura={WorkerV5EarningsHomeListAura}
          navigateToScreen={navigateToScreen}
          onPickAvatar={openWorkerAvatarPicker}
          reduceMotion={reduceMotion}
          reduceTransparency={reduceTransparency}
          runtime={runtime}
          zipAura={WorkerV5CustomerZipMintAura}
        />
      )
    case '5.2-worker-ranking':
      return (
        <WorkerV5WorkerRankingBody
          heroAura={WorkerV5EarningsHomeHeroAura}
          language={language}
          listAura={WorkerV5EarningsHomeListAura}
          rankingIcons={workerV5RankingIconAssets}
          rankingHero={WorkerV5RankingHero}
          reduceTransparency={reduceTransparency}
          runtime={runtime}
        />
      )
    case '5.3-skills-service-area':
      return (
        <WorkerV5SkillsServiceAreaBody
          heroAura={WorkerV5EarningsHomeHeroAura}
          language={language}
          listAura={WorkerV5EarningsHomeListAura}
          reduceTransparency={reduceTransparency}
          runtime={runtime}
          serviceAreaMapCard={WorkerV5ServiceAreaMapCard}
          serviceIcons={workerV5ProfileServiceIconAssets}
          skillsGridEmptyIcon={workerV5Icons.tools}
          skillsHeroIcon={workerV5CapturedIconAssets.skillsHero}
        />
      )
    case '5.4-reliability-insights':
      return (
        <WorkerV5ReliabilityInsightsBody
          caseWideAura={WorkerV5CustomerCaseWideMintAura}
          icons={workerV5Icons}
          language={language}
          listAura={WorkerV5EarningsHomeListAura}
          reduceMotion={reduceMotion}
          reduceTransparency={reduceTransparency}
          reliabilityIcons={workerV5ReliabilityIconAssets}
          reliabilityAxisFill={WorkerV5ReliabilityAxisFill}
          reliabilityHero={WorkerV5ReliabilityHero}
          runtime={runtime}
          zipAura={WorkerV5CustomerZipMintAura}
        />
      )
    case '5.5-account-utilities':
      return <WorkerV5SettingsBody key={runtime.workerProfile?.id ?? 'worker-settings-loading'} language={language} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '5.6-agent-memory-preferences':
      return <WorkerV5AgentMemoryBody key={runtime.workerProfile?.id ?? 'worker-memory-loading'} language={language} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '5.7-verification-documents':
      return (
        <WorkerV5VerificationDocumentsBody
          caseWideAura={WorkerV5CustomerCaseWideMintAura}
          icons={workerV5Icons}
          language={language}
          profileIconVisualBoost={WORKER_V5_PROFILE_ICON_VISUAL_BOOST}
          readOnlyToggleList={WorkerV5ReadOnlyToggleList}
          reduceTransparency={reduceTransparency}
          runtime={runtime}
          zipAura={WorkerV5CustomerZipMintAura}
        />
      )
    case '5.8-bank-tax-center':
      return (
        <WorkerV5BankTaxBody
          caseWideAura={WorkerV5CustomerCaseWideMintAura}
          icons={workerV5Icons}
          infoListCard={InfoListCard}
          infoRow={WorkerV5ScreenInfoRow}
          language={language}
          metricTile={MetricTile}
          reduceTransparency={reduceTransparency}
          runtime={runtime}
          zipAura={WorkerV5CustomerZipMintAura}
        />
      )
    case '5.9-reviews-feedback':
      return (
        <WorkerV5ReviewsFeedbackBody
          icons={workerV5Icons}
          infoListCard={InfoListCard}
          infoRow={WorkerV5ScreenInfoRow}
          language={language}
          metricTile={MetricTile}
          reduceTransparency={reduceTransparency}
          runtime={runtime}
        />
      )
    case '5.10-support-settings':
      return <WorkerV5SettingsBody key={runtime.workerProfile?.id ?? 'worker-settings-loading'} language={language} reduceTransparency={reduceTransparency} runtime={runtime} />
    default:
      return null
  }
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

type WorkerV5PrimaryAction = {
  disabled: boolean
  label: string
  onPress: () => void
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
    case '2.4-route-eta':
      return {
        disabled: !hasDeal || busy,
        label: busy ? textByLanguage(language, 'Đang cập nhật', 'Updating') : textByLanguage(language, 'Bắt đầu di chuyển', 'Start travel'),
        onPress: () => runWorkerAction(() => runtime.actions.workerUpdateStatus('worker_on_way')),
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

function buildHeroLine(screen: WorkerV5ScreenDefinition, runtime: WorkerV5Runtime, language: AppLanguage) {
  const deal = runtime.state.deal
  switch (screen.id) {
    case '1.1-worker-home':
      return runtime.workerProfile?.legal_name
        ? textByLanguage(language, `Chào ${runtime.workerProfile.legal_name.trim()}`, `Hello ${runtime.workerProfile.legal_name.trim()}`)
        : textByLanguage(language, 'Chào bạn, giải quyết công việc đã sẵn sàng', 'Your work resolution is ready')
    case '2.1-opportunity-inbox':
      return deal
        ? textByLanguage(language, 'Có đề nghị hoặc việc đang cần xử lý', 'A real offer or work item needs attention')
        : textByLanguage(language, 'Hộp thư cơ hội đang trống', 'Opportunity inbox is empty')
    case '2.2-offer-detail':
      return deal
        ? textByLanguage(language, 'Xem kỹ đề nghị trước khi quyết định', 'Review the offer before deciding')
        : textByLanguage(language, 'Chưa có đề nghị để mở', 'No offer to open')
    case '2.4-route-eta':
      return deal
        ? textByLanguage(language, 'Cập nhật di chuyển từ việc hiện tại', 'Travel updates use the current work')
        : textByLanguage(language, 'Chưa có việc dang di chuyển', 'No en-route work')
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
      return runtime.workerProfile?.selected_service_types?.length
        || runtime.workerProfile?.active_service_types?.length
        || runtime.workerProfile?.service_types?.length
        ? textByLanguage(language, 'Dịch vụ tự chọn và khu vực lấy từ hồ sơ thật', 'Selected services and areas come from the real profile')
        : textByLanguage(language, 'Chưa chọn dịch vụ muốn nhận', 'No selected services yet')
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
  switch (screen.id) {
    case '1.1-worker-home':
      return textByLanguage(
        language,
        'Tổng quan dùng hồ sơ thợ, trạng thái nhận việc và việc thật đã đồng bộ.',
        'Overview uses synced worker profile, availability, and real work state.',
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
    case '2.4-route-eta':
      return textByLanguage(
        language,
        'Di chuyển cập nhật qua quy trình NestScout để khách nhận tín hiệu đúng, không tự hứa thời gian đến mới.',
        'Travel updates through NestScout so customers get accurate signals without a new ETA promise.',
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


