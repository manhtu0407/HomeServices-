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
import { WorkerV5PayoutMethodHero } from './earnings/payout-method-surfaces'
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

export type { WorkerDockActive } from './dock/types'
type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>
type WorkerV5FieldEvidenceRequest = {
  createRef: PendingClientRequestRef
  fingerprint: string
  jobId: string
  mediaRefs: string[] | null
  turnRef: PendingClientRequestRef
}
type WorkerV5FieldEvidenceUiState = {
  busy: boolean
  busySlot: number | null
  confirmation: string | null
  urls: (string | null)[]
}

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

// A Reanimated style only drives a component created through Animated; on a
// plain Pressable the mode-trigger scale never ran.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

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

const workerV5OfferDetailIcons: Record<WorkerV5IconName, ImageSourcePropType> = {
  ...workerV5Icons,
  clock: require('@/assets/worker-image-icons/offer-acceptance-window.png') as ImageSourcePropType,
  document: require('@/assets/worker-image-icons/offer-scope-modules.png') as ImageSourcePropType,
  map: require('@/assets/worker-image-icons/offer-private-entry.png') as ImageSourcePropType,
  profile: require('@/assets/worker-image-icons/offer-customer-handoff.png') as ImageSourcePropType,
}

const workerV5OfferDetailEmptyIcon = require('@/assets/worker-image-icons/offer-arrival-signal.png') as ImageSourcePropType

const workerV5ServiceIcons: Record<ServiceType, ImageSourcePropType> = {
  cleaning: require('@/assets/worker-image-icons/service-cleaning.png') as ImageSourcePropType,
  electrical: require('@/assets/worker-image-icons/service-electrical.png') as ImageSourcePropType,
  handyman: require('../customer/v21/assets/service-icons/client-service-handyman-installation.png') as ImageSourcePropType,
  hvac: require('../customer/v21/assets/service-icons/client-service-hvac.png') as ImageSourcePropType,
  plumbing: require('@/assets/worker-image-icons/service-plumbing.png') as ImageSourcePropType,
  upholstery: require('../customer/v21/assets/service-icons/client-service-upholstery-care.png') as ImageSourcePropType,
}
const workerV5OpportunityServiceIcons: Record<ServiceType, ImageSourcePropType> = {
  ...workerV5ServiceIcons,
  plumbing: workerV5CapturedIconAssets.opportunityPlumbing,
}

const WORKER_V5_PROFILE_ICON_VISUAL_BOOST = new Set<WorkerV5IconName>(['document', 'scope'])

function workerV5JobsDestinationScreenId(deal: LocalDeal | null): WorkerV5ScreenId {
  if (!deal) return '2.1-opportunity-inbox'
  const status = deal.backendStatus ?? deal.status
  if (deal.status === 'broadcasting' && deal.broadcast?.status === 'sent') return '2.2-offer-detail'
  if (status === 'worker_candidate_pending') return '2.3-customer-confirmation-wait'
  if (status === 'worker_matched' || status === 'worker_on_way') return '2.7-in-progress'
  if (status === 'arrived' || status === 'inspecting' || status === 'repairing') return '2.7-in-progress'
  if (status === 'scope_change_pending') return '2.9-approval-wait'
  if (status === 'completed_by_worker') return '2.11-completion-submitted'
  if (
    status === 'confirmed_by_customer'
    || status === 'reviewed'
    || status === 'payment_pending'
    || status === 'paid'
  ) return '2.12-case-closed'
  return '2.1-opportunity-inbox'
}

function workerV5DisplayCode(deal: LocalDeal | null, language: AppLanguage) {
  if (!deal) return null
  if (deal.displayCode) return deal.displayCode
  if (!deal.id.startsWith('local-')) {
    return buildLocalJobDisplayCode({
      createdAt: deal.createdAt,
      jobId: deal.id,
    })
  }
  return language === 'vi' ? 'Nháp dịch vụ' : 'Service draft'
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
  const onDockScroll = useDockScrollHandler()
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
  const dataPending = textByLanguage(language, 'Chờ dữ liệu', 'Data pending')
  const jobsEmpty = textByLanguage(language, 'Chưa có', 'None')
  const pendingSettlementCount = !earnings
    ? dataPending
    : earnings.pending_payment_count > 0
      ? String(earnings.pending_payment_count)
      : earnings.pending_payment_amount > 0
        ? '1'
        : jobsEmpty
  const stats = [
    {
      label: textByLanguage(language, 'Cơ hội mới', 'New opportunities'),
      value: deal?.broadcast ? '1' : runtime.workerJobsHydrated ? jobsEmpty : dataPending,
    },
    {
      label: textByLanguage(language, 'Việc đang chạy', 'Active work'),
      value: deal ? '1' : runtime.workerJobsHydrated ? jobsEmpty : dataPending,
    },
    {
      label: textByLanguage(language, 'Chờ đối soát', 'Settlement'),
      value: pendingSettlementCount,
    },
  ]
  const quickActions = [
    {
      details: [
        { glyph: 'document' as const, label: textByLanguage(language, 'Cơ hội thật', 'Real opportunities') },
        { glyph: 'check' as const, label: textByLanguage(language, 'Bạn quyết định', 'You decide') },
      ],
      icon: workerV5HomeQuickIconAssets.incoming,
      meta: deal?.broadcast
        ? textByLanguage(language, '1 cơ hội đã lọc', '1 filtered opportunity')
        : runtime.workerJobsHydrated
          ? textByLanguage(language, 'Chưa có cơ hội thật', 'No real opportunity')
          : dataPending,
      targetId: '2.1-opportunity-inbox' as const,
      tone: 'document' as const,
      title: textByLanguage(language, 'Nhận việc ngay', 'Open work'),
    },
    {
      details: [
        { glyph: 'spark' as const, label: textByLanguage(language, 'Kael lọc', 'Kael filters') },
        { glyph: 'shield' as const, label: textByLanguage(language, 'Không tự nhận', 'No auto-accept') },
      ],
      icon: workerV5HomeQuickIconAssets.kael,
      meta: deal?.broadcast
        ? textByLanguage(language, 'Giải thích cơ hội hiện tại', 'Explain the current opportunity')
        : runtime.workerJobsHydrated
          ? textByLanguage(language, 'Lọc theo kỹ năng & khu vực', 'Filter by skills and area')
          : dataPending,
      targetId: '3.2-kael-job-intake' as const,
      tone: 'signal' as const,
      title: textByLanguage(language, 'Kael nhận việc', 'Kael job intake'),
    },
    {
      details: [
        { glyph: 'service' as const, label: textByLanguage(language, 'Kỹ năng', 'Skills') },
        { glyph: 'location' as const, label: textByLanguage(language, 'Khu vực', 'Area') },
      ],
      icon: workerV5HomeQuickIconAssets.skillsArea,
      meta: !profile
        ? textByLanguage(language, 'Chờ hồ sơ', 'Waiting for profile')
        : profile.districts.length
          ? textByLanguage(language, `${profile.districts.length} khu vực phục vụ`, `${profile.districts.length} service areas`)
          : textByLanguage(language, 'Bổ sung để tăng cơ hội phù hợp', 'Complete this for better matches'),
      targetId: '5.3-skills-service-area' as const,
      tone: 'location' as const,
      title: textByLanguage(language, 'Kỹ năng & khu vực', 'Skills and area'),
    },
    {
      details: [
        { glyph: 'document' as const, label: textByLanguage(language, 'Đối soát', 'Settlement') },
        { glyph: 'money' as const, label: textByLanguage(language, 'Thu nhập ròng', 'Net income') },
      ],
      icon: workerV5HomeQuickIconAssets.earnings,
      meta: !earnings
        ? dataPending
        : earnings.net_earnings > 0
          ? formatVnd(earnings.net_earnings, language)
          : textByLanguage(language, 'Chưa có đối soát', 'No settlement yet'),
      targetId: '4.1-earnings-overview' as const,
      tone: 'money' as const,
      title: textByLanguage(language, 'Thu nhập', 'Earnings'),
    },
  ]
  return (
    <SafeAreaView style={[styles.safeArea, surfaceStyle]} testID="worker-v5-screen-1.1-worker-home">
      <WorkerV5HomeAuraBackground reduceTransparency={glass.reduceTransparency} />
      <ScrollView
        bounces={false}
        contentContainerStyle={[styles.homeSourceScrollContent, { minHeight }]}
        onScroll={onDockScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        style={styles.homeSourceScroll}
        testID="worker-v5-scroll"
      >
        <View style={styles.homeSourceHeader} testID="worker-v5-home-header">
          <View style={styles.homeSourceHeaderCopy}>
            <Text style={styles.homeSourceTitle} numberOfLines={2}>
              {textByLanguage(language, `Chào buổi sáng, ${displayName}!`, `Good morning, ${displayName}!`)}
            </Text>
            <Text style={styles.homeSourceSubtitle} numberOfLines={2}>
              {deal
                ? textByLanguage(language, 'Kael đã đồng bộ lịch, khu vực và việc đang chạy', 'Kael synced schedule, area, and active work')
                : profile
                  ? textByLanguage(language, 'Kael đã đồng bộ hồ sơ và khu vực nhận việc', 'Kael synced profile and service area')
                  : textByLanguage(language, 'Đang chờ hồ sơ và dữ liệu nhận việc', 'Waiting for profile and work data')}
            </Text>
          </View>
        </View>

        <WorkerV5AvailabilityCard
          availabilityGuardReady={runtime.workerJobsHydrated}
          hasActiveJob={runtime.workerJobs.some((job) => isWorkerOperationalJobStatus(job.status))}
          key={profile?.id ?? 'worker-profile-loading'}
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
          infoRow={WorkerV5InfoRow}
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
          infoRow={WorkerV5InfoRow}
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
        availabilityGuardReady={runtime.workerJobsHydrated}
        hasActiveJob={runtime.workerJobs.some((job) => isWorkerOperationalJobStatus(job.status))}
        key={profile?.id ?? 'worker-profile-loading'}
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
        icons={workerV5Icons}
        reduceTransparency={reduceTransparency}
        title={deal ? textByLanguage(language, 'Kael đã chuẩn bị việc phù hợp', 'Kael prepared matching work') : textByLanguage(language, 'Kael đang chờ nguồn thật', 'Kael is waiting for real sources')}
      />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Được cá nhân hóa', 'Personalized')}
        title={textByLanguage(language, 'Hành động nhanh', 'Quick actions')}
      />
      <WorkerV5QuickActionGrid icons={workerV5Icons} items={quickActions} reduceTransparency={reduceTransparency} />
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
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null)
  const deal = runtime.state.deal
  const currentDeal = workerV5JobsDestinationScreenId(deal) === '2.1-opportunity-inbox' ? null : deal
  const isIncoming = currentDeal?.status === 'broadcasting' && currentDeal.broadcast?.status === 'sent'
  const isCurrentMissionSelected = selectedMissionId === currentDeal?.id
  const openCurrentWork = () => {
    if (!currentDeal) return
    const target = requireWorkerV5Screen(workerV5JobsDestinationScreenId(currentDeal))
    const route = routeForWorkerV5Screen(target)
    const shouldShowArrivalGate = currentDeal.status === 'arrived' && target.id === '2.7-in-progress'
    router.replace((shouldShowArrivalGate ? `${route}&ns_arrival_gate=1` : route) as never)
  }
  const openKaelIntake = () => router.replace('/(worker)/chat?ns_worker_screen=3.2-kael-job-intake' as never)

  return (
    <View style={styles.opportunityInboxStack} testID="worker-v5-opportunity-inbox-handoff">
      <View style={styles.opportunityList} testID="worker-v5-opportunity-list">
        {currentDeal ? (
          <WorkerV5OpportunityCard
            deal={currentDeal}
            fallbackJobIcon={workerV5Icons.jobs}
            language={language}
            onSelect={() => setSelectedMissionId(currentDeal.id)}
            reduceTransparency={reduceTransparency}
            selected={isCurrentMissionSelected}
            serviceIcons={workerV5OpportunityServiceIcons}
          />
        ) : (
          <WorkerV5OpportunityEmptyCard jobIcon={workerV5Icons.jobs} language={language} reduceTransparency={reduceTransparency} tab="matches" />
        )}
      </View>
      <WorkerV5ActionRail
        caseWideAura={WorkerV5CustomerCaseWideMintAura}
        primaryButtonFill={WorkerV5PrimaryButtonFill}
        zipAura={WorkerV5CustomerZipMintAura}
        onPrimary={isCurrentMissionSelected ? openCurrentWork : undefined}
        onSecondary={openKaelIntake}
        primary={isIncoming
          ? textByLanguage(language, 'Xem & nhận việc', 'Review and accept')
          : textByLanguage(language, 'Tiếp tục công việc', 'Continue work')}
        primaryDisabled={!currentDeal || !isCurrentMissionSelected}
        primaryTestID="worker-v5-primary-action"
        primaryVariant={isCurrentMissionSelected ? "source" : "default"}
        reduceTransparency={reduceTransparency}
        secondary={textByLanguage(language, 'Kael nhận việc', 'Kael job intake')}
        secondaryTestID="worker-v5-opportunity-kael-action"
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
  const [acceptBusy, setAcceptBusy] = useState(false)
  const [declineBusy, setDeclineBusy] = useState(false)
  const decisionBusyRef = useRef(false)
  const deal = runtime.state.deal
  const profile = runtime.workerProfile
  const checks = buildWorkerV5AcceptReviewChecks(deal, profile, language)
  const passedCount = checks.filter((item) => item.state === 'done').length
  const canAccept = workerV5CanAcceptOpenOffer(deal, runtime.state.workerGate)
  const canDecline = deal?.status === 'broadcasting' && deal.broadcast?.status === 'sent'
  const addressRows = buildWorkerV5OfferAddressRows(deal, language)
  const requestRows = buildWorkerV5OfferRequestRows(deal, language)
  const confirmAccept = async () => {
    if (!canAccept || decisionBusyRef.current) return
    decisionBusyRef.current = true
    setAcceptBusy(true)
    try {
      const ok = await runtime.actions.workerAcceptBroadcast()
      if (ok) router.replace('/(worker)/jobs?ns_worker_screen=2.3-customer-confirmation-wait' as never)
    } finally {
      decisionBusyRef.current = false
      setAcceptBusy(false)
    }
  }
  const declineOffer = async () => {
    if (!canDecline || decisionBusyRef.current) return
    decisionBusyRef.current = true
    setDeclineBusy(true)
    try {
      const ok = await runtime.actions.workerDeclineBroadcast()
      if (ok) router.replace('/(worker)/jobs?ns_worker_screen=2.1-opportunity-inbox' as never)
    } finally {
      decisionBusyRef.current = false
      setDeclineBusy(false)
    }
  }

  return (
    <View style={styles.offerDetailStack} testID="worker-v5-offer-detail-handoff">
      {deal ? (
        <WorkerV5OfferDetailSummaryCard
          caseWideAura={WorkerV5CustomerCaseWideMintAura}
          deal={deal}
          jobIcon={workerV5Icons.jobs}
          language={language}
          reduceTransparency={reduceTransparency}
          serviceIcons={workerV5OpportunityServiceIcons}
          zipAura={WorkerV5CustomerZipMintAura}
        />
      ) : (
        <WorkerV5OfferDetailEmptyCard
          caseWideAura={WorkerV5CustomerCaseWideMintAura}
          emptyOfferIcon={workerV5OfferDetailEmptyIcon}
          language={language}
          reduceTransparency={reduceTransparency}
          zipAura={WorkerV5CustomerZipMintAura}
        />
      )}
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Đã xác minh', 'Verified')}
        title={textByLanguage(language, 'Địa chỉ & khách hàng', 'Address and customer')}
      />
      <WorkerV5OfferDetailListCard
        caseWideAura={WorkerV5CustomerCaseWideMintAura}
        iconSources={workerV5OfferDetailIcons}
        reduceTransparency={reduceTransparency}
        rows={addressRows}
        scope="OfferAddressList"
        testID="worker-v5-offer-address-list"
        zipAura={WorkerV5CustomerZipMintAura}
      />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Phạm vi hiện tại', 'Current scope')}
        title={textByLanguage(language, 'Yêu cầu', 'Request')}
      />
      <WorkerV5OfferDetailListCard
        caseWideAura={WorkerV5CustomerCaseWideMintAura}
        iconSources={workerV5OfferDetailIcons}
        reduceTransparency={reduceTransparency}
        rows={requestRows}
        scope="OfferRequestList"
        testID="worker-v5-offer-request-list"
        zipAura={WorkerV5CustomerZipMintAura}
      />
      <WorkerV5SectionHeader
        action={textByLanguage(language, `${passedCount}/${checks.length} điều kiện`, `${passedCount}/${checks.length} checks`)}
        title={textByLanguage(language, 'Sẵn sàng nhận việc', 'Ready to accept')}
      />
      <WorkerV5AcceptChecklistCard
        caseWideAura={WorkerV5CustomerCaseWideMintAura}
        checks={checks}
        reduceTransparency={reduceTransparency}
        zipAura={WorkerV5CustomerZipMintAura}
      />
      <WorkerV5AcceptCommitmentCard
        caseWideAura={WorkerV5CustomerCaseWideMintAura}
        clockIcon={workerV5OfferDetailIcons.clock}
        deal={deal}
        language={language}
        reduceTransparency={reduceTransparency}
        zipAura={WorkerV5CustomerZipMintAura}
      />
      {runtime.state.lastError ? (
        <WorkerV5BoundaryNote
          title={textByLanguage(language, 'Chưa cập nhật được', 'Could not update')}
          body={runtime.state.lastError}
        />
      ) : null}
      <WorkerV5ActionRail
        caseWideAura={WorkerV5CustomerCaseWideMintAura}
        primaryButtonFill={WorkerV5PrimaryButtonFill}
        zipAura={WorkerV5CustomerZipMintAura}
        onPrimary={canAccept ? () => void confirmAccept() : undefined}
        onSecondary={canDecline ? () => void declineOffer() : undefined}
        primary={acceptBusy ? textByLanguage(language, 'Đang nhận việc', 'Accepting') : textByLanguage(language, 'Nhận việc', 'Accept job')}
        primaryDisabled={!canAccept || acceptBusy}
        primaryTestID="worker-v5-accept-confirm-action"
        reduceTransparency={reduceTransparency}
        secondary={declineBusy ? textByLanguage(language, 'Đang từ chối', 'Declining') : textByLanguage(language, 'Từ chối', 'Decline')}
        secondaryTestID="worker-v5-offer-decline-action"
      />
    </View>
  )
}

function WorkerV5CustomerConfirmationWaitBody({
  language,
  runtime,
}: {
  language: AppLanguage
  runtime: WorkerV5Runtime
}) {
  const deal = runtime.state.deal
  const code = workerV5DisplayCode(deal, language)
  const service = deal ? localizedServiceLabel(deal.draft.serviceType, language) : null

  return (
    <View
      accessibilityLiveRegion="polite"
      style={styles.customerConfirmationWait}
      testID="worker-v5-customer-confirmation-wait"
    >
      <View style={styles.customerConfirmationWaitRule} />
      <View style={styles.customerConfirmationWaitStatusRow}>
        <View style={styles.customerConfirmationWaitDot} />
        <Text style={styles.customerConfirmationWaitStatus}>
          {textByLanguage(language, 'Đã gửi nhận việc', 'Acceptance sent')}
        </Text>
      </View>
      <Text style={styles.customerConfirmationWaitTitle}>
        {textByLanguage(
          language,
          'Đang chờ khách xác nhận bạn cho công việc này.',
          'Waiting for the customer to confirm you for this job.',
        )}
      </Text>
      <Text style={styles.customerConfirmationWaitBody}>
        {textByLanguage(
          language,
          'NestScout sẽ tự mở bước di chuyển khi khách chọn bạn. Địa chỉ chi tiết và thao tác thi công vẫn được khóa trong lúc chờ.',
          'NestScout will open travel after the customer chooses you. Exact address and execution actions remain locked while waiting.',
        )}
      </Text>
      {service || code ? (
        <Text style={styles.customerConfirmationWaitMeta}>
          {[service, code ? textByLanguage(language, `Mã việc ${code}`, `Work ${code}`) : null].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
    </View>
  )
}

function WorkerV5InProgressBody({
  actionBusy,
  language,
  navigateJobChat,
  onTravelAction,
  reduceTransparency,
  runtime,
}: {
  actionBusy: boolean
  language: AppLanguage
  navigateJobChat: () => void
  onTravelAction: () => void
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const params = useLocalSearchParams<WorkerV5RouteParams>()
  const router = useRouter()
  const deal = runtime.state.deal
  const isArrivalGateRequested = firstRouteParam(params.ns_arrival_gate) === '1'
  const isAwaitingArrival = Boolean(
    deal && (
      ['worker_matched', 'worker_on_way'].includes(deal.status)
      || (deal.status === 'arrived' && isArrivalGateRequested)
    ),
  )
  const briefLines = deal?.broadcast?.prebrief?.filter(Boolean).slice(0, 5) ?? []
  const customerEvidenceUrls = deal?.customerEvidencePhotoUrls ?? []
  const evidenceUrls = deal?.fieldEvidencePhotoUrls ?? []
  const currentJobId = deal?.broadcast?.jobId ?? deal?.id ?? null
  const [fieldEvidenceState, setFieldEvidenceState] = useState<WorkerV5FieldEvidenceUiState>({
    busy: false,
    busySlot: null,
    confirmation: null,
    urls: [null, null, null],
  })
  const {
    busy: fieldEvidenceBusy,
    busySlot: fieldEvidenceBusySlot,
    confirmation: fieldEvidenceKaelConfirmation,
    urls: fieldEvidenceUrls,
  } = fieldEvidenceState
  const setFieldEvidenceBusy = (busy: boolean) => setFieldEvidenceState((current) => ({ ...current, busy }))
  const setFieldEvidenceBusySlot = (busySlot: number | null) => setFieldEvidenceState((current) => ({ ...current, busySlot }))
  const setFieldEvidenceKaelConfirmation = (confirmation: string | null) => setFieldEvidenceState((current) => ({ ...current, confirmation }))
  const setFieldEvidenceUrls = (next: SetStateAction<(string | null)[]>) => setFieldEvidenceState((current) => ({
    ...current,
    urls: typeof next === 'function' ? next(current.urls) : next,
  }))
  const [{ busy: phaseActionBusy, notice: phaseActionNotice }, setPhaseActionState] = useState<{
    busy: boolean
    notice: string | null
  }>({ busy: false, notice: null })
  const setPhaseActionBusy = (busy: boolean) => setPhaseActionState((current) => ({ ...current, busy }))
  const setPhaseActionNotice = (notice: string | null) => setPhaseActionState((current) => ({ ...current, notice }))
  const fieldEvidenceSessionRef = useRef<WorkerV5PrivateKaelSession | null>(null)
  const fieldEvidenceRequestRef = useRef<WorkerV5FieldEvidenceRequest | null>(null)
  const fieldEvidenceOperationRef = useRef<{ jobId: string; slot: number } | null>(null)
  const activeFieldEvidenceJobIdRef = useRef<string | null>(null)
  const previousFieldEvidenceJobIdRef = useRef(currentJobId)
  if (previousFieldEvidenceJobIdRef.current !== currentJobId) {
    previousFieldEvidenceJobIdRef.current = currentJobId
    setFieldEvidenceState({ busy: false, busySlot: null, confirmation: null, urls: [null, null, null] })
    fieldEvidenceSessionRef.current = null
    fieldEvidenceRequestRef.current = null
    fieldEvidenceOperationRef.current = null
  }
  activeFieldEvidenceJobIdRef.current = currentJobId
  const visibleEvidenceUrls: (string | null)[] = [...evidenceUrls]
  fieldEvidenceUrls.forEach((url, slot) => {
    if (!url || visibleEvidenceUrls.includes(url)) return
    if (!visibleEvidenceUrls[slot]) {
      visibleEvidenceUrls[slot] = url
      return
    }
    visibleEvidenceUrls.push(url)
  })
  const evidenceCount = visibleEvidenceUrls.filter((url): url is string => Boolean(url)).length
  const progressItems = briefLines.map((line, index) => ({
    meta: index === briefLines.length - 1 ? textByLanguage(language, 'Đang kiểm', 'Active') : textByLanguage(language, 'Đã đọc', 'Read'),
    state: index === briefLines.length - 1 ? 'active' as const : 'done' as const,
    title: line,
  }))

  const addFieldEvidence = async (source: 'camera' | 'library', slot: number) => {
    if (fieldEvidenceBusy || fieldEvidenceOperationRef.current) return
    const requestJobId = currentJobId
    if (!requestJobId) {
      Alert.alert('Kael', textByLanguage(language, 'Chưa tìm thấy việc đang thực hiện để gắn ảnh.', 'No active job was found to attach this photo.'))
      return
    }
    const operation = { jobId: requestJobId, slot }
    fieldEvidenceOperationRef.current = operation
    let evidenceAttached = false

    try {
      // The post-I/O job guard prevents a picker result from crossing into a newly active job.
      // react-doctor-disable-next-line react-doctor/async-defer-await
      const permission = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (activeFieldEvidenceJobIdRef.current !== requestJobId) return
      if (!permission.granted) {
        Alert.alert(
          'Kael',
          textByLanguage(
            language,
            source === 'camera'
              ? 'Cần quyền camera để chụp ảnh hiện trường cho Kael.'
              : 'Cần quyền kho ảnh để gửi ảnh hiện trường cho Kael.',
            source === 'camera'
              ? 'Camera permission is needed to capture on-site evidence for Kael.'
              : 'Photo-library permission is needed to send on-site evidence to Kael.',
          ),
        )
        return
      }

      // react-doctor-disable-next-line react-doctor/async-defer-await
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.82,
          })
        : await ImagePicker.launchImageLibraryAsync({
            allowsMultipleSelection: false,
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.82,
          })
      if (activeFieldEvidenceJobIdRef.current !== requestJobId) return
      if (result.canceled || result.assets.length === 0) return

      const asset = result.assets[0]
      const fieldEvidenceFingerprint = JSON.stringify({
        fileName: asset.fileName?.trim() ?? null,
        fileSizeBytes: asset.fileSize ?? null,
        job_id: requestJobId,
        language,
        mimeType: asset.mimeType ?? null,
        uri: asset.uri,
      })
      let pendingRequest = fieldEvidenceRequestRef.current
      if (
        !pendingRequest ||
        pendingRequest.jobId !== requestJobId ||
        pendingRequest.fingerprint !== fieldEvidenceFingerprint
      ) {
        pendingRequest = {
          createRef: { current: null },
          fingerprint: fieldEvidenceFingerprint,
          jobId: requestJobId,
          mediaRefs: null,
          turnRef: { current: null },
        }
        fieldEvidenceRequestRef.current = pendingRequest
      }
      setFieldEvidenceBusy(true)
      setFieldEvidenceBusySlot(slot)
      setFieldEvidenceKaelConfirmation(textByLanguage(language, 'Kael đang nhận ảnh hiện trường…', 'Kael is receiving the on-site photo…'))
      let uploadedMediaRefs = pendingRequest.mediaRefs
      if (uploadedMediaRefs === null) {
        // react-doctor-disable-next-line react-doctor/async-defer-await
        const uploadResult = await uploadJobMediaDrafts(requestJobId, [{
          fileName: workerV5PrivateKaelMediaName(asset, slot, language),
          fileSizeBytes: asset.fileSize ?? undefined,
          mimeType: asset.mimeType ?? undefined,
          type: 'image',
          uri: asset.uri,
        }], 'kael_reference')
        if (activeFieldEvidenceJobIdRef.current !== requestJobId) return
        if (!uploadResult.success) {
          setFieldEvidenceKaelConfirmation(textByLanguage(
            language,
            'Chưa thể gắn ảnh hiện trường vào việc lúc này.',
            'The on-site photo could not be attached to the job right now.',
          ))
          return
        }
        uploadedMediaRefs = uploadResult.mediaRefs
        pendingRequest.mediaRefs = uploadedMediaRefs
      }
      evidenceAttached = true

      setFieldEvidenceUrls((current) => current.map((url, index) => index === slot ? uploadedMediaRefs[0] ?? asset.uri : url))
      void runtime.actions.workerRefresh().catch(() => undefined)

      let sessionId = fieldEvidenceSessionRef.current?.jobId === requestJobId
        ? fieldEvidenceSessionRef.current.sessionId
        : null
      if (!sessionId) {
        const createFingerprint = JSON.stringify({
          job_id: requestJobId,
          language,
          mode: 'intake',
        })
        // react-doctor-disable-next-line react-doctor/async-defer-await
        const created = await workerKaelChatService.create({
          client_request_id: stableClientRequestId(pendingRequest.createRef, createFingerprint),
          job_id: requestJobId,
          language,
          mode: 'intake',
        })
        if (activeFieldEvidenceJobIdRef.current !== requestJobId) return
        if (!created.success || created.data.session.job_id !== requestJobId) {
          setFieldEvidenceKaelConfirmation(textByLanguage(language, 'Kael chưa mở được phiên xác nhận hiện trường.', 'Kael could not open the on-site confirmation session.'))
          return
        }
        sessionId = created.data.session.id
        fieldEvidenceSessionRef.current = { jobId: requestJobId, sessionId }
        clearStableClientRequestId(pendingRequest.createRef, createFingerprint)
      }

      const confirmationMessage = textByLanguage(
        language,
        'Tôi đã gửi ảnh hiện trường. Hãy đối chiếu ảnh với phạm vi đang thực hiện, chỉ nêu quan sát có căn cứ và hướng dẫn báo đổi phạm vi nếu có phần phát sinh.',
        'I uploaded an on-site photo. Compare it with the active scope, state only grounded observations, and direct me to report a scope change if extra work is present.',
      )
      const turnFingerprint = JSON.stringify({
        language,
        media_refs: uploadedMediaRefs,
        message: confirmationMessage,
        session_id: sessionId,
      })
      // react-doctor-disable-next-line react-doctor/async-defer-await
      const confirmed = await workerKaelChatService.streamTurn(sessionId, {
        client_request_id: stableClientRequestId(pendingRequest.turnRef, turnFingerprint),
        language,
        media_refs: uploadedMediaRefs,
        message: confirmationMessage,
      }, {
        onStage: () => undefined,
        onToken: () => undefined,
      })
      if (activeFieldEvidenceJobIdRef.current !== requestJobId) return
      if (!confirmed.success) {
        setFieldEvidenceKaelConfirmation(textByLanguage(
          language,
          'Ảnh đã được gắn vào việc, nhưng Kael chưa xác nhận được lúc này.',
          'The photo was attached to the job, but Kael could not confirm it right now.',
        ))
        return
      }
      clearStableClientRequestId(pendingRequest.turnRef, turnFingerprint)
      if (fieldEvidenceRequestRef.current === pendingRequest) {
        fieldEvidenceRequestRef.current = null
      }
      const confirmation = [...confirmed.data.turns]
        .reverse()
        .find((turn) => turn.role === 'kael' && turn.text_content?.trim())
        ?.text_content
        ?.trim()
      setFieldEvidenceKaelConfirmation(confirmation ?? textByLanguage(
        language,
        'Ảnh đã được gắn vào việc. Kael chưa trả về xác nhận mới.',
        'The photo was attached to the job. Kael has not returned a new confirmation.',
      ))
    } catch {
      if (activeFieldEvidenceJobIdRef.current === requestJobId) {
        setFieldEvidenceKaelConfirmation(evidenceAttached
          ? textByLanguage(language, 'Kael chưa xác nhận được ảnh lúc này. Ảnh vẫn không làm thay đổi trạng thái việc.', 'Kael could not confirm this photo right now. The photo did not change the job status.')
          : textByLanguage(language, 'Chưa thể mở hoặc gửi ảnh hiện trường lúc này.', 'The on-site photo could not be opened or uploaded right now.'))
      }
    } finally {
      if (fieldEvidenceOperationRef.current === operation) {
        fieldEvidenceOperationRef.current = null
      }
      if (activeFieldEvidenceJobIdRef.current === requestJobId) {
        setFieldEvidenceBusy(false)
        setFieldEvidenceBusySlot(null)
      }
    }
  }

  const chooseFieldEvidenceSource = (slot: number) => {
    Alert.alert(
      textByLanguage(language, 'Ảnh hiện trường', 'On-site photo'),
      textByLanguage(language, 'Kael sẽ đối chiếu ảnh này với phạm vi công việc hiện tại.', 'Kael will compare this photo with the active work scope.'),
      [
        { style: 'cancel', text: textByLanguage(language, 'Hủy', 'Cancel') },
        { onPress: () => void addFieldEvidence('library', slot), text: textByLanguage(language, 'Kho ảnh', 'Photo library') },
        { onPress: () => void addFieldEvidence('camera', slot), text: textByLanguage(language, 'Chụp ảnh', 'Take photo') },
      ],
    )
  }

  const addressAccess = deal?.broadcast?.addressAccess ?? null
  const workerCheckedIn = addressAccess?.worker_checked_in === true
  const exactUnitReleased = addressAccess?.exact_unit_released === true
  const visiblePhaseActionNotice = exactUnitReleased ? null : phaseActionNotice
  const submitLobbyCheckIn = async () => {
    if (phaseActionBusy || !currentJobId) return
    setPhaseActionBusy(true)
    setPhaseActionNotice(null)
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) {
        setPhaseActionNotice(textByLanguage(
          language,
          'Cần quyền kho ảnh để gửi ảnh check-in tại sảnh.',
          'Photo-library access is needed to send lobby check-in evidence.',
        ))
        return
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: false,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.84,
      })
      if (result.canceled || result.assets.length === 0) return
      const asset = result.assets[0]
      const uploaded = await uploadJobMediaDrafts(currentJobId, [{
        fileName: workerV5PrivateKaelMediaName(asset, 0, language),
        fileSizeBytes: asset.fileSize ?? undefined,
        mimeType: asset.mimeType ?? undefined,
        type: 'image',
        uri: asset.uri,
      }], 'access_check_in')
      if (!uploaded.success) {
        setPhaseActionNotice(localizeMediaUploadFailure(uploaded, language))
        return
      }
      const checkedIn = await runtime.actions.workerUpdateStatus('arrived', {
        access_check_in: {
          checked_in_at: new Date().toISOString(),
          mode: 'manual_photo',
          note: textByLanguage(language, 'Ảnh xác nhận check-in tại sảnh', 'Lobby check-in evidence'),
          photo_urls: uploaded.mediaRefs,
        },
      })
      if (checkedIn) {
        setPhaseActionNotice(textByLanguage(
          language,
          'Đã check-in tại sảnh. Đang chờ khách cho phép lên căn hộ.',
          'Lobby check-in recorded. Waiting for the customer to release unit access.',
        ))
      }
    } catch {
      setPhaseActionNotice(textByLanguage(
        language,
        'Chưa thể hoàn tất check-in lúc này. Vui lòng thử lại.',
        'Check-in could not be completed. Please try again.',
      ))
    } finally {
      setPhaseActionBusy(false)
    }
  }

  const advanceWorkPhase = async () => {
    if (phaseActionBusy || !deal) return
    if (deal.status === 'repairing') {
      router.replace('/(worker)/jobs?ns_worker_screen=2.10-completion-evidence' as never)
      return
    }
    const nextStatus = deal.status === 'arrived'
      ? 'inspecting'
      : deal.status === 'inspecting'
        ? 'repairing'
        : null
    if (!nextStatus) return
    setPhaseActionBusy(true)
    try {
      await runtime.actions.workerUpdateStatus(nextStatus)
    } finally {
      setPhaseActionBusy(false)
    }
  }

  const phaseAction = deal?.status === 'arrived' && addressAccess && !workerCheckedIn
    ? {
        disabled: phaseActionBusy,
        label: phaseActionBusy
          ? textByLanguage(language, 'Đang check-in', 'Checking in')
          : textByLanguage(language, 'Check-in bằng ảnh tại sảnh', 'Check in with a lobby photo'),
        onPress: () => void submitLobbyCheckIn(),
        testID: 'worker-v5-arrival-check-in-action',
      }
    : deal?.status === 'arrived' && addressAccess && !exactUnitReleased
      ? {
          disabled: true,
          label: textByLanguage(language, 'Chờ khách cho thợ lên', 'Waiting for unit access'),
          onPress: () => undefined,
          testID: 'worker-v5-phase-advance-action',
        }
      : deal?.status === 'arrived'
        ? {
            disabled: phaseActionBusy,
            label: textByLanguage(language, 'Bắt đầu kiểm tra', 'Start inspection'),
            onPress: () => void advanceWorkPhase(),
            testID: 'worker-v5-phase-advance-action',
          }
        : deal?.status === 'inspecting'
          ? {
              disabled: phaseActionBusy,
              label: textByLanguage(language, 'Bắt đầu sửa chữa', 'Start work'),
              onPress: () => void advanceWorkPhase(),
              testID: 'worker-v5-phase-advance-action',
            }
          : deal?.status === 'repairing'
            ? {
                disabled: phaseActionBusy,
                label: textByLanguage(language, 'Chuẩn bị hồ sơ hoàn tất', 'Prepare completion evidence'),
                onPress: () => void advanceWorkPhase(),
                testID: 'worker-v5-phase-advance-action',
              }
            : null

  if (isAwaitingArrival) {
    return (
      <WorkerV5InProgressTravelGate
        actionBusy={actionBusy}
        deal={deal}
        language={language}
        navigateJobChat={navigateJobChat}
        onArrivalAcknowledged={() => router.replace('/(worker)/jobs?ns_worker_screen=2.7-in-progress' as never)}
        onTravelAction={onTravelAction}
        reduceTransparency={reduceTransparency}
      />
    )
  }

  return (
    <View style={styles.sectionStack}>
      <WorkerV5TimerCard deal={deal} language={language} reduceTransparency={reduceTransparency} sourceCount={progressItems.length} />
      {progressItems.length ? (
        <WorkerV5WorkProgressBoard
          caseWideAura={WorkerV5CustomerCaseWideMintAura}
          items={progressItems}
          language={language}
          reduceTransparency={reduceTransparency}
          zipAura={WorkerV5CustomerZipMintAura}
        />
      ) : null}
      {customerEvidenceUrls.length > 0 ? (
        <>
          <WorkerV5SectionHeader
            action={textByLanguage(language, `${customerEvidenceUrls.length} ảnh`, `${customerEvidenceUrls.length} photos`)}
            title={textByLanguage(language, 'Ảnh hiện trạng từ khách', 'Customer condition photos')}
          />
          <WorkerV5EvidenceTray
            emptyLabel={textByLanguage(language, 'Chưa có', 'None')}
            language={language}
            reduceTransparency={reduceTransparency}
            stageLabel={textByLanguage(language, 'Ảnh hiện trạng từ khách', 'Customer condition photos')}
            testID="worker-v5-customer-evidence-gallery"
            urls={customerEvidenceUrls}
          />
        </>
      ) : null}
      <WorkerV5SectionHeader
        action={evidenceCount ? textByLanguage(language, `${evidenceCount} tệp`, `${evidenceCount} files`) : textByLanguage(language, 'Chưa có', 'None yet')}
        title={textByLanguage(language, 'Bằng chứng hiện trường', 'On-site evidence')}
      />
      <WorkerV5EvidenceTray
        addPhotoDisabled={fieldEvidenceBusy}
        emptyLabel={textByLanguage(language, 'Chưa có', 'None')}
        language={language}
        onAddPhoto={chooseFieldEvidenceSource}
        reduceTransparency={reduceTransparency}
        stageLabel={textByLanguage(language, 'Bằng chứng hiện trường của thợ', 'Worker on-site evidence')}
        uploadingSlot={fieldEvidenceBusySlot}
        urls={visibleEvidenceUrls}
      />
      {fieldEvidenceKaelConfirmation ? (
        <Text
          numberOfLines={3}
          style={styles.fieldEvidenceKaelConfirmation}
          testID="worker-v5-field-evidence-kael-confirmation"
        >
          {fieldEvidenceKaelConfirmation}
        </Text>
      ) : null}
      {phaseAction ? (
        <WorkerV5SingleSourceActionButton
          disabled={phaseAction.disabled}
          label={phaseAction.label}
          onPress={phaseAction.onPress}
          primaryButtonFill={WorkerV5PrimaryButtonFill}
          reduceTransparency={reduceTransparency}
          testID={phaseAction.testID}
        />
      ) : null}
      {visiblePhaseActionNotice ? (
        <Text style={styles.fieldEvidenceKaelConfirmation} testID="worker-v5-phase-action-notice">
          {visiblePhaseActionNotice}
        </Text>
      ) : null}
      <WorkerV5ActionRail
        caseWideAura={WorkerV5CustomerCaseWideMintAura}
        primaryButtonFill={WorkerV5PrimaryButtonFill}
        zipAura={WorkerV5CustomerZipMintAura}
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

const WorkerV5InProgressTravelGate = memo(function WorkerV5InProgressTravelGate({
  actionBusy,
  deal,
  language,
  navigateJobChat,
  onArrivalAcknowledged,
  onTravelAction,
  reduceTransparency,
}: {
  actionBusy: boolean
  deal: LocalDeal | null
  language: AppLanguage
  navigateJobChat: () => void
  onArrivalAcknowledged: () => void
  onTravelAction: () => void
  reduceTransparency: boolean
}) {
  const routePreview = useWorkerV5RoutePreview(deal, true)
  const confirmArrivalGate = () => {
    if (deal?.status === 'arrived') {
      onArrivalAcknowledged()
      return
    }
    onTravelAction()
  }
  return (
    <WorkerV5RouteEtaBody
      actionBusy={actionBusy}
      caseWideAura={WorkerV5CustomerCaseWideMintAura}
      deal={deal}
      etaSummaryComponent={WorkerV5EtaSummaryCard}
      language={language}
      navigateJobChat={navigateJobChat}
      onPrimary={confirmArrivalGate}
      primaryLabel={deal?.status === 'worker_matched'
        ? textByLanguage(language, 'Bắt đầu di chuyển', 'Start travel')
        : textByLanguage(language, 'Xác nhận đã tới', 'Confirm arrival')}
      primaryFill={WorkerV5PrimaryButtonFill}
      reduceTransparency={reduceTransparency}
      routeMapComponent={WorkerV5RouteMapStage}
      routePreview={routePreview}
      zipAura={WorkerV5CustomerZipMintAura}
    />
  )
})

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
  const {
    ownerKey: scopeDraftOwnerKey,
    state: scopeDraft,
    updateOwnerState: updateScopeDraftOwnerState,
  } = useWorkerV5ScopeChangeDraft(deal)
  const {
    description: scopeDescription,
    evidenceOpenLocal: scopeEvidenceOpenLocal,
    evidenceSent: scopeEvidenceSent,
    incident: jobIncident,
    mediaNotice: scopeMediaNotice,
    photos: scopePhotos,
    proposing: scopeProposing,
    reason: scopeReason,
    submitting: scopeSubmitting,
    uploadedEvidenceRefs: scopeUploadedEvidenceRefs,
  } = scopeDraft
  const updateScopeDraft = (
    update: Parameters<typeof updateScopeDraftOwnerState>[1],
  ) => updateScopeDraftOwnerState(scopeDraftOwnerKey, update)
  const scopeMutationInFlightRef = useRef<{ kind: 'evidence' | 'proposal'; ownerKey: string } | null>(null)
  const scopeEvidenceOpen = scopeRouteMode === 'edit' || scopeEvidenceOpenLocal
  const fieldEvidenceUrls = deal?.fieldEvidencePhotoUrls ?? []
  const scopeEvidenceUrls = Array.from(new Set([
    ...fieldEvidenceUrls,
    ...scopePhotos.map((item) => item.uri),
    ...(scope?.evidencePhotoUrls ?? []),
    ...scopeUploadedEvidenceRefs,
  ].filter((uri): uri is string => Boolean(uri))))
  const evidenceCount = scopeEvidenceUrls.length
  const canDraftScopeEvidence = Boolean(deal && ['worker_matched', 'worker_on_way', 'arrived', 'inspecting', 'repairing', 'scope_change_pending'].includes(deal.status))
  const hasScopeSubmission = Boolean(scope || scopeEvidenceSent || jobIncident)
  const scopeDescriptionReady = scopeDescription.trim().length >= 10
  const scopeReasonReady = scopeReason.trim().length >= 10
  const scopeSubmitDisabled = !canDraftScopeEvidence || !scopeDescriptionReady || !scopeReasonReady || scopeSubmitting || Boolean(scope && !jobIncident)
  const openScopeEditPath = () => {
    updateScopeDraft((current) => ({ ...current, evidenceOpenLocal: true }))
    router.replace('/(worker)/jobs?ns_worker_screen=2.8-scope-change&ns_scope_mode=edit' as never)
  }
  const submitScopeEvidence = async () => {
    if (!deal || scopeSubmitDisabled || scopeMutationInFlightRef.current?.ownerKey === scopeDraftOwnerKey) return
    const operation = { kind: 'evidence' as const, ownerKey: scopeDraftOwnerKey }
    scopeMutationInFlightRef.current = operation
    const jobId = deal.broadcast?.jobId ?? deal.id
    const scopeMediaDrafts: LocalMediaUploadDraft[] = scopePhotos.slice(0, 5).map((item) => ({
      fileName: item.fileName,
      type: 'image',
      uri: item.uri,
    }))
    updateScopeDraft((current) => ({ ...current, mediaNotice: null, submitting: true }))
    try {
      let uploadedRefs: string[] = []
      if (scopeMediaDrafts.length > 0) {
        const uploaded = await uploadJobMediaDrafts(jobId, scopeMediaDrafts, 'scope_change_evidence')
        if (!uploaded.success) {
          updateScopeDraft((current) => ({
            ...current,
            mediaNotice: localizeMediaUploadFailure(uploaded, language),
          }))
          return
        }
        uploadedRefs = uploaded.mediaRefs
      }
      const nextEvidenceRefs = mergeJobMediaRefsNewestFirst(
        uploadedRefs,
        scopeUploadedEvidenceRefs,
        fieldEvidenceUrls,
        scope?.evidencePhotoUrls ?? [],
      )
      updateScopeDraft((current) => ({
        ...current,
        uploadedEvidenceRefs: Array.from(new Set([...current.uploadedEvidenceRefs, ...uploadedRefs])),
      }))
      const opened = await runtime.actions.openKaelJobIncident({
        new_description: scopeDescription.trim(),
        photo_urls: nextEvidenceRefs,
        reason: scopeReason.trim(),
      })
      updateScopeDraft((current) => opened
        ? {
          ...current,
          evidenceSent: true,
          incident: opened.incident,
          photos: [],
        }
        : {
          ...current,
          mediaNotice: textByLanguage(language, 'Chưa gửi được bằng chứng đổi phạm vi. Vui lòng thử lại.', 'Scope evidence could not be sent. Try again.'),
        })
      if (!opened) return
      router.replace('/(worker)/chat?ns_worker_screen=3.1-kael-chat-normal' as never)
    } catch {
      updateScopeDraft((current) => ({
        ...current,
        mediaNotice: textByLanguage(language, 'Chưa gửi được bằng chứng đổi phạm vi. Vui lòng thử lại.', 'Scope evidence could not be sent. Try again.'),
      }))
    } finally {
      if (scopeMutationInFlightRef.current === operation) scopeMutationInFlightRef.current = null
      updateScopeDraft((current) => ({ ...current, submitting: false }))
    }
  }
  const submitScopeProposal = async () => {
    if (
      scopeProposing ||
      jobIncident?.status !== 'ready_for_scope_proposal' ||
      scopeMutationInFlightRef.current?.ownerKey === scopeDraftOwnerKey
    ) return
    const operation = { kind: 'proposal' as const, ownerKey: scopeDraftOwnerKey }
    scopeMutationInFlightRef.current = operation
    updateScopeDraft((current) => ({ ...current, proposing: true }))
    try {
      const submitted = await runtime.actions.proposeScopeChangeFromKaelIncident()
      updateScopeDraft((current) => ({
        ...current,
        incident: submitted && current.incident
          ? { ...current.incident, status: 'scope_proposed' }
          : current.incident,
        mediaNotice: submitted
          ? current.mediaNotice
          : textByLanguage(language, 'Chưa tạo được đề xuất phạm vi. Vui lòng thử lại.', 'The scope proposal could not be created. Try again.'),
      }))
    } catch {
      updateScopeDraft((current) => ({
        ...current,
        mediaNotice: textByLanguage(language, 'Chưa tạo được đề xuất phạm vi. Vui lòng thử lại.', 'The scope proposal could not be created. Try again.'),
      }))
    } finally {
      if (scopeMutationInFlightRef.current === operation) scopeMutationInFlightRef.current = null
      updateScopeDraft((current) => ({ ...current, proposing: false }))
    }
  }
  const attachScopePhotos = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      updateScopeDraft((current) => ({
        ...current,
        mediaNotice: textByLanguage(language, 'Cần quyền thư viện ảnh để đính kèm bằng chứng đổi phạm vi.', 'Photo library permission is needed to attach scope evidence.'),
      }))
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.84,
      selectionLimit: 5,
    })
    if (result.canceled || result.assets.length === 0) return
    updateScopeDraft((current) => {
      const picked = result.assets.map((asset, index) => ({
        fileName: asset.fileName?.trim() || textByLanguage(language, `anh-phat-sinh-${current.photos.length + index + 1}.jpg`, `scope-evidence-${current.photos.length + index + 1}.jpg`),
        uri: asset.uri,
      }))
      return {
        ...current,
        mediaNotice: null,
        photos: [...current.photos, ...picked].slice(0, 5),
      }
    })
  }
  const viewScopeDetails = () => {
    router.replace('/(worker)/chat' as never)
  }

  return (
    <View style={styles.sectionStack}>
      <WorkerV5ProgressRail activeStep={4} language={language} reduceTransparency={reduceTransparency} />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Kael hỗ trợ soạn', 'Kael drafts')}
        title={textByLanguage(language, 'Đề xuất thay đổi', 'Change proposal')}
      />
      <WorkerV5PriceLines
        caseWideAura={WorkerV5CustomerCaseWideMintAura}
        formulaAura
        reduceTransparency={reduceTransparency}
        rows={[
          { label: textByLanguage(language, 'Hạng mục bổ sung', 'Additional scope'), value: scope?.requestedDescription || textByLanguage(language, 'Chưa có bản nháp thật', 'No real draft') },
          { label: textByLanguage(language, 'Lý do', 'Reason'), value: scope?.reason || textByLanguage(language, 'Chưa có lý do thật', 'No real reason') },
          { label: textByLanguage(language, 'Bằng chứng', 'Evidence'), value: evidenceCount ? `${evidenceCount}` : textByLanguage(language, 'Chưa có ảnh', 'No photos') },
        ]}
        total={{ label: textByLanguage(language, 'Khoảng giá', 'Price range'), value: price }}
        zipAura={WorkerV5CustomerZipMintAura}
      />
      <WorkerV5EvidenceTray
        emptyLabel={textByLanguage(language, 'Chưa có', 'None')}
        language={language}
        reduceTransparency={reduceTransparency}
        stageLabel={textByLanguage(language, 'Bằng chứng đổi phạm vi', 'Scope-change evidence')}
        urls={scopeEvidenceUrls}
      />
      <WorkerV5ScopeEvidenceGate
        deal={deal}
        language={language}
        onAddPhotos={attachScopePhotos}
        onScopeDescriptionChange={(description) => {
          updateScopeDraft((current) => ({ ...current, description }))
        }}
        onScopeReasonChange={(reason) => {
          updateScopeDraft((current) => ({ ...current, reason }))
        }}
        onSubmitScopeEvidence={submitScopeEvidence}
        onViewDetails={viewScopeDetails}
        primaryButtonFill={!scopeSubmitDisabled ? <WorkerV5PrimaryButtonFill disabled={false} variant="source" /> : null}
        reduceTransparency={reduceTransparency}
        renderInfoRow={(row) => <WorkerV5InfoRow icon={row.icon} label={row.label} value={row.value} />}
        scope={scope}
        scopeDescription={scopeDescription}
        scopeEvidenceOpen={scopeEvidenceOpen}
        scopeEvidenceSent={scopeEvidenceSent && !jobIncident}
        scopeMediaNotice={scopeMediaNotice}
        scopePhotos={scopePhotos}
        scopeReason={scopeReason}
        scopeSubmitDisabled={scopeSubmitDisabled}
        scopeSubmitting={scopeSubmitting}
      />
      <WorkerV5ActionRail
        caseWideAura={WorkerV5CustomerCaseWideMintAura}
        primaryButtonFill={WorkerV5PrimaryButtonFill}
        zipAura={WorkerV5CustomerZipMintAura}
        onPrimary={jobIncident?.status === 'ready_for_scope_proposal' ? submitScopeProposal : hasScopeSubmission ? viewScopeDetails : navigateNext}
        onSecondary={canDraftScopeEvidence ? openScopeEditPath : undefined}
        primary={jobIncident?.status === 'ready_for_scope_proposal'
          ? textByLanguage(language, 'Tạo đề xuất gửi khách', 'Create proposal for customer')
          : hasScopeSubmission
          ? textByLanguage(language, 'Mở Kael Công việc', 'Open Kael Work')
          : textByLanguage(language, 'Không có vấn đề phát sinh', 'No scope issue')}
        primaryTestID="worker-v5-scope-change-send-action"
        primaryVariant="source"
        reduceTransparency={reduceTransparency}
        secondary={textByLanguage(language, 'Chỉnh sửa', 'Edit')}
        secondaryTestID="worker-v5-scope-change-edit-action"
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
  profile,
  reduceMotion,
  reduceTransparency,
  screen,
  surfaceStyle,
  workerJobsHydrated,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  mode: WorkerV5KaelOrbMode
  navigateToScreen: (id: WorkerV5ScreenId) => void
  profile: WorkerV5Runtime['workerProfile']
  reduceMotion: boolean
  reduceTransparency: boolean
  screen: WorkerV5ScreenDefinition
  surfaceStyle: StyleProp<ViewStyle>
  workerJobsHydrated: boolean
}) {
  const modeOptions = [
    {
      description: textByLanguage(language, 'Hỏi đáp và hỗ trợ nhanh', 'Quick questions and support'),
      label: textByLanguage(language, 'Chat thường', 'Normal chat'),
      value: 'normal' as const,
    },
    {
      description: textByLanguage(language, 'Lọc và chuẩn bị cơ hội phù hợp', 'Filter and prepare matching work'),
      label: textByLanguage(language, 'Nhận việc', 'Job intake'),
      value: 'intake' as const,
    },
  ]
  const activeMode = modeOptions.find((item) => item.value === mode) ?? modeOptions[0]
  const [modeMenuOpen, setModeMenuOpen] = useState(false)
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false)
  const [chatEntryKey, setChatEntryKey] = useState(0)
  const [composerActive, setComposerActive] = useState(false)
  const modeMenuOpacity = useSharedValue(reduceMotion ? 1 : 0)
  const modeMenuScaleX = useSharedValue(reduceMotion ? 1 : 0.92)
  const modeMenuScaleY = useSharedValue(reduceMotion ? 1 : 0.8)
  const modeMenuContentOpacity = useSharedValue(reduceMotion ? 1 : 0)
  const modeMenuContentTranslateY = useSharedValue(reduceMotion ? 0 : 8)
  const modeMenuSheenOpacity = useSharedValue(0)
  const modeMenuSheenX = useSharedValue(-92)
  const modeMenuTranslateY = useSharedValue(reduceMotion ? 0 : -4)
  const modeMenuTriggerScale = useSharedValue(1)

  const toggleModeMenu = () => {
    setSessionMenuOpen(false)
    if (!reduceMotion) {
      modeMenuTriggerScale.value = withSequence(
        withTiming(0.985, { duration: motionDuration(70, reduceMotion) }),
        withSpring(1, motionTokens.liquid.press),
      )
    }
    if (!modeMenuOpen) {
      modeMenuOpacity.value = reduceMotion ? 1 : 0
      modeMenuScaleX.value = reduceMotion ? 1 : 0.92
      modeMenuScaleY.value = reduceMotion ? 1 : 0.8
      modeMenuContentOpacity.value = reduceMotion ? 1 : 0
      modeMenuContentTranslateY.value = reduceMotion ? 0 : 8
      modeMenuSheenOpacity.value = 0
      modeMenuSheenX.value = -92
      modeMenuTranslateY.value = reduceMotion ? 0 : -4
    }
    setModeMenuOpen((current) => !current)
  }
  const animatedModeMenuStyle = useAnimatedStyle(() => ({
    opacity: modeMenuOpacity.value,
    transform: [
      { translateY: modeMenuTranslateY.value },
      { scaleX: modeMenuScaleX.value },
      { scaleY: modeMenuScaleY.value },
    ],
  }))
  const animatedModeMenuContentStyle = useAnimatedStyle(() => ({
    opacity: modeMenuContentOpacity.value,
    transform: [{ translateY: modeMenuContentTranslateY.value }],
  }))
  const animatedModeMenuSheenStyle = useAnimatedStyle(() => ({
    opacity: modeMenuSheenOpacity.value,
    transform: [
      { translateX: modeMenuSheenX.value },
      { rotate: '-10deg' },
    ],
  }))
  const animatedModeTriggerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: modeMenuTriggerScale.value }],
  }))
  const orbChat = useWorkerV5KaelOrbChat(deal, language, mode, workerJobsHydrated)
  const resetToNewSession = orbChat.resetToNewSession
  const prepareKaelSurfaceFocus = useCallback(() => {
    setModeMenuOpen(false)
    setSessionMenuOpen(false)
    setComposerActive(false)
  }, [])
  const resetKaelSurface = useCallback(() => {
    setModeMenuOpen(false)
    setSessionMenuOpen(false)
    setComposerActive(false)
    setChatEntryKey((current) => current + 1)
    resetToNewSession()
  }, [resetToNewSession])
  useFocusEffect(prepareKaelSurfaceFocus)
  const switchMode = (nextMode: WorkerV5KaelOrbMode) => {
    resetKaelSurface()
    navigateToScreen(nextMode === 'normal' ? '3.1-kael-chat-normal' : '3.2-kael-job-intake')
  }
  const toggleSessionMenu = () => {
    setModeMenuOpen(false)
    const nextOpen = !sessionMenuOpen
    setSessionMenuOpen(nextOpen)
    if (nextOpen) void orbChat.refreshSessions()
  }
  const openNewSession = () => {
    setComposerActive(false)
    setChatEntryKey((current) => current + 1)
    resetToNewSession()
    void orbChat.startNewSession().then((created) => {
      if (created) setSessionMenuOpen(false)
    })
  }
  const openSession = (sessionId: string) => {
    setComposerActive(false)
    setSessionMenuOpen(false)
    void orbChat.openSession(sessionId)
  }
  const hasPrivateIntakeChat = mode !== 'intake' || canUseWorkerV5PrivateKaelChat(deal)
  const composer = !hasPrivateIntakeChat
    ? (
        <WorkerV5KaelIntakeReadinessActions
          language={language}
          navigateToScreen={navigateToScreen}
          profile={profile}
          reduceTransparency={reduceTransparency}
        />
      )
    : (
      <WorkerV5KaelOrbComposer
        busy={orbChat.busy}
        key={`${mode}:${getWorkerV5ChatJobId(deal) ?? 'no-job'}:${orbChat.activeSessionId ?? 'draft'}:${chatEntryKey}`}
        language={language}
        mediaCount={orbChat.mediaCount}
        mode={mode}
        onActivityChange={setComposerActive}
        onPickMedia={() => void orbChat.pickMedia()}
        onSend={(message) => void orbChat.send(message)}
        reduceTransparency={reduceTransparency}
      />
    )

  useEffect(() => {
    if (!modeMenuOpen) return
    if (reduceMotion) {
      modeMenuOpacity.value = 1
      modeMenuScaleX.value = 1
      modeMenuScaleY.value = 1
      modeMenuContentOpacity.value = 1
      modeMenuContentTranslateY.value = 0
      modeMenuSheenOpacity.value = 0
      modeMenuTranslateY.value = 0
      return
    }

    modeMenuOpacity.value = withTiming(1, { duration: motionDuration(120, reduceMotion) })
    modeMenuScaleX.value = withSpring(1, motionTokens.liquid.pill)
    modeMenuScaleY.value = withSpring(1, motionTokens.liquid.entrance)
    modeMenuTranslateY.value = withSpring(0, motionTokens.liquid.pill)
    modeMenuContentOpacity.value = withDelay(55, withTiming(1, { duration: motionDuration(130, reduceMotion) }))
    modeMenuContentTranslateY.value = withDelay(45, withSpring(0, motionTokens.liquid.entrance))
    if (!reduceTransparency) {
      modeMenuSheenOpacity.value = withSequence(
        withTiming(0.58, { duration: motionDuration(90, reduceMotion) }),
        withDelay(170, withTiming(0, { duration: motionDuration(180, reduceMotion) })),
      )
      modeMenuSheenX.value = withTiming(96, { duration: motionDuration(340, reduceMotion) })
    }
  }, [modeMenuContentOpacity, modeMenuContentTranslateY, modeMenuOpen, modeMenuOpacity, modeMenuScaleX, modeMenuScaleY, modeMenuSheenOpacity, modeMenuSheenX, modeMenuTranslateY, reduceMotion, reduceTransparency])

  return (
    <SafeAreaView style={[styles.safeArea, surfaceStyle, styles.kaelOrbCustomerSafeArea]} testID={`worker-v5-screen-${screen.id}`}>
      <WorkerV5CustomerFulfillmentCanvasAura
        reduceTransparency={reduceTransparency}
        scope="KaelOrbCustomerPage"
        testID="worker-v5-kael-orb-background-mint-aura"
      />
      <WorkerV5KaelChatScreenAura
        reduceTransparency={reduceTransparency}
        scope={mode === 'intake' ? 'KaelJobIntake' : 'KaelChatNormal'}
        testID={mode === 'intake' ? 'worker-v5-kael-job-intake-screen-mint-aura' : 'worker-v5-kael-chat-screen-mint-aura'}
      />
      {!reduceTransparency ? (
        <WorkerV5CustomerZipMintAura
          scope="KaelOrbCustomerPageFine"
          style={styles.kaelOrbPageZipAura}
          testID="worker-v5-kael-orb-page-zip-mint-aura"
        />
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
              onPress={() => navigateToScreen('2.1-opportunity-inbox')}
              style={({ pressed }) => [styles.kaelOrbCustomerTopControl, pressed ? styles.pressed : null]}
              testID="worker-v5-back"
            >
              <WorkerV5BackArrowIcon />
            </Pressable>
            <View style={styles.kaelOrbCustomerTopSpacer} />
            <View
              style={[
                styles.kaelOrbCustomerHeaderActions,
                modeMenuOpen || sessionMenuOpen ? styles.kaelOrbCustomerHeaderActionsOpen : null,
              ]}
              testID="worker-v5-kael-header-actions"
            >
              <Pressable
                accessibilityLabel={textByLanguage(language, 'Quản lý các phiên Kael', 'Manage Kael conversations')}
                accessibilityRole="button"
                accessibilityState={{ expanded: sessionMenuOpen }}
                onPress={toggleSessionMenu}
                style={({ pressed }) => [
                  styles.kaelOrbCustomerSessionTrigger,
                  sessionMenuOpen ? styles.kaelOrbCustomerSessionTriggerOpen : null,
                  pressed ? (reduceMotion ? styles.kaelOrbCustomerSessionTriggerPressedReduced : styles.pressed) : null,
                ]}
                testID="worker-v5-kael-session-toggle"
              >
                <WorkerV5KaelSessionPlusIcon />
              </Pressable>
              <AnimatedPressable
                accessibilityLabel={textByLanguage(
                  language,
                  `Chế độ Kael: ${activeMode.label}. Nhấn để đổi chế độ`,
                  `Kael mode: ${activeMode.label}. Press to switch mode`,
                )}
                accessibilityRole="button"
                accessibilityState={{ expanded: modeMenuOpen }}
                onPress={toggleModeMenu}
                style={({ pressed }) => [
                  styles.kaelOrbCustomerModeTrigger,
                  modeMenuOpen ? styles.kaelOrbCustomerModeTriggerOpen : null,
                  animatedModeTriggerStyle,
                  pressed ? styles.pressed : null,
                ]}
                testID="worker-v5-kael-mode-toggle"
              >
                <Text
                  adjustsFontSizeToFit
                  minimumFontScale={0.78}
                  numberOfLines={1}
                  style={styles.kaelOrbCustomerModeTriggerText}
                  testID="worker-v5-kael-active-mode"
                >
                  {activeMode.label}
                </Text>
              </AnimatedPressable>
            </View>
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
              <Animated.View style={[styles.kaelOrbCustomerModeMenuOptions, animatedModeMenuContentStyle]} testID="worker-v5-kael-mode-menu-options">
                {modeOptions.map((item) => {
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
                      <View style={styles.kaelOrbCustomerModeMenuCopy}>
                        <Text style={[styles.kaelOrbCustomerModeMenuText, selected ? styles.kaelOrbCustomerModeMenuTextActive : null]}>{item.label}</Text>
                        <Text style={styles.kaelOrbCustomerModeMenuDescription}>{item.description}</Text>
                      </View>
                      {selected ? <Text style={styles.kaelOrbCustomerModeMenuCheck}>{'✓'}</Text> : null}
                    </Pressable>
                  )
                })}
              </Animated.View>
            </Animated.View>
          ) : null}

          {sessionMenuOpen ? (
            <WorkerV5KaelSessionMenu
              activeSessionId={orbChat.activeSessionId}
              canCreate={orbChat.canCreateSession}
              error={orbChat.sessionsError}
              language={language}
              loading={orbChat.sessionsLoading}
              mode={mode}
              onArchive={orbChat.archiveSession}
              onCreate={openNewSession}
              onPin={orbChat.setSessionPinned}
              onRename={orbChat.renameSession}
              onSelect={openSession}
              pendingSessionIds={orbChat.pendingSessionIds}
              reduceMotion={reduceMotion}
              reduceTransparency={reduceTransparency}
              sessions={orbChat.sessions}
            />
          ) : null}

          <WorkerV5KaelOrbBody
            activeSessionId={orbChat.activeSessionId}
            composer={composer}
            composerActive={composerActive}
            deal={deal}
            fallbackJobIcon={workerV5Icons.jobs}
            keepIntakeContextAccessible={!hasPrivateIntakeChat}
            language={language}
            liveError={orbChat.error}
            liveStatus={orbChat.busyLabel}
            liveTurns={orbChat.liveTurns}
            mode={mode}
            modeMenuOpen={modeMenuOpen || sessionMenuOpen}
            onOpenOpportunity={() => navigateToScreen(workerV5JobsDestinationScreenId(deal))}
            reduceMotion={reduceMotion}
            reduceTransparency={reduceTransparency}
            serviceIcons={workerV5OpportunityServiceIcons}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function WorkerV5KaelIntakeReadinessActions({
  language,
  navigateToScreen,
  profile,
  reduceTransparency,
}: {
  language: AppLanguage
  navigateToScreen: (id: WorkerV5ScreenId) => void
  profile: WorkerV5Runtime['workerProfile']
  reduceTransparency: boolean
}) {
  const activeServices = profile?.active_service_types
    ?? profile?.selected_service_types
    ?? profile?.service_types
    ?? []
  const districtCount = profile?.districts?.length ?? 0
  const hasMatchingProfile = activeServices.length > 0 && districtCount > 0
  const activeServiceLabels = activeServices
    .map((service) => localizedServiceLabel(service, language))
    .join(', ')

  return (
    <View
      style={[styles.kaelIntakeReadinessCard, reduceTransparency && styles.opaqueCard]}
      testID="worker-v5-kael-intake-readiness"
    >
      <Text style={styles.kaelIntakeReadinessTitle}>
        {hasMatchingProfile
          ? textByLanguage(language, 'Đang lọc theo hồ sơ của bạn', 'Matching from your profile')
          : textByLanguage(language, 'Tăng cơ hội phù hợp', 'Improve matching readiness')}
      </Text>
      <Text style={styles.kaelIntakeReadinessBody}>
        {hasMatchingProfile
          ? textByLanguage(
              language,
              `Kael đang lọc theo ${activeServiceLabels} và ${districtCount} khu vực đã lưu. Bạn vẫn là người quyết định nhận việc.`,
              `Kael is matching ${activeServiceLabels} across ${districtCount} saved areas. You still decide whether to accept.`,
            )
          : textByLanguage(
              language,
              'Kỹ năng và khu vực trong hồ sơ được dùng để lọc cơ hội. Kael chỉ tư vấn; bạn vẫn là người quyết định nhận việc.',
              'Profile skills and service areas are used to filter opportunities. Kael advises; you still decide whether to accept.',
            )}
      </Text>
      <KaelButton
        label={hasMatchingProfile
          ? textByLanguage(language, 'Chỉnh dịch vụ & khu vực', 'Edit services & area')
          : textByLanguage(language, 'Cập nhật kỹ năng & khu vực', 'Update skills & area')}
        onPress={() => navigateToScreen('5.3-skills-service-area')}
        showPrimaryGradient={false}
        style={styles.kaelIntakeReadinessButton}
        testID="worker-v5-kael-optimize-profile"
        variant="secondary"
      />
    </View>
  )
}

function WorkerV5KaelOrbComposer({
  busy,
  language,
  mediaCount,
  mode,
  onActivityChange,
  onPickMedia,
  onSend,
  reduceTransparency,
}: {
  busy: boolean
  language: AppLanguage
  mediaCount: number
  mode: WorkerV5KaelOrbMode
  onActivityChange?: (active: boolean) => void
  onPickMedia: () => void
  onSend: (message: string) => void
  reduceTransparency: boolean
}) {
  const [draft, setDraft] = useState('')
  const focusedRef = useRef(false)
  const trimmedDraft = draft.trim()
  const mediaLabel = mode === 'normal'
    ? textByLanguage(language, 'Thêm ảnh cho Kael', 'Add photo for Kael')
    : textByLanguage(language, 'Thêm ảnh công việc cho Kael', 'Add work photo for Kael')

  const submitDraft = () => {
    if (!trimmedDraft || busy) return
    setDraft('')
    onActivityChange?.(focusedRef.current)
    onSend(trimmedDraft)
  }

  const updateDraft = (nextDraft: string) => {
    setDraft(nextDraft)
    onActivityChange?.(focusedRef.current || nextDraft.trim().length > 0)
  }

  const focusComposer = () => {
    focusedRef.current = true
    onActivityChange?.(true)
  }

  const blurComposer = () => {
    focusedRef.current = false
    onActivityChange?.(draft.trim().length > 0)
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
          disabled={busy}
          onPress={onPickMedia}
          style={({ pressed }) => [
            styles.kaelOrbComposerCameraButton,
            pressed ? styles.pressed : null,
          ]}
          testID="worker-v5-kael-orb-camera"
        >
          <WorkerV5KaelOrbCameraIcon color={color.brand.primaryDark} />
          {mediaCount > 0 ? (
            <View style={styles.kaelOrbComposerCameraBadge} testID="worker-v5-kael-orb-camera-count">
              <Text style={styles.kaelOrbComposerCameraBadgeText}>{mediaCount}</Text>
            </View>
          ) : null}
        </Pressable>
        <KaelTextField
          accessibilityLabel={textByLanguage(language, 'Nhắn Kael', 'Message Kael')}
          inputShellStyle={styles.kaelOrbComposerInputShell}
          inputShellTestID="worker-v5-kael-orb-input-shell"
          onBlur={blurComposer}
          onChangeText={updateDraft}
          onFocus={focusComposer}
          onSubmitEditing={submitDraft}
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
          accessibilityState={{ busy, disabled: busy || !trimmedDraft }}
          disabled={busy || !trimmedDraft}
          onPress={submitDraft}
          style={({ pressed }) => [
            styles.kaelOrbSendButton,
            busy || !trimmedDraft ? styles.jobRoomSendDisabled : null,
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
  const orbChat = useWorkerV5KaelOrbChat(runtime.state.deal, language, 'normal', runtime.workerJobsHydrated)
  if (getWorkerV5ChatJobId(runtime.state.deal)) {
    return <WorkerV5SharedJobIncidentChat deal={runtime.state.deal} language={language} reduceTransparency={reduceTransparency} />
  }
  return (
    <WorkerV5KaelOrbBody
      composer={(
        <WorkerV5KaelOrbComposer
          busy={orbChat.busy}
          language={language}
          mediaCount={orbChat.mediaCount}
          mode="normal"
          onPickMedia={() => void orbChat.pickMedia()}
          onSend={(message) => void orbChat.send(message)}
          reduceTransparency={reduceTransparency}
        />
      )}
      deal={runtime.state.deal}
      fallbackJobIcon={workerV5Icons.jobs}
      language={language}
      liveError={orbChat.error}
      liveStatus={orbChat.busyLabel}
      liveTurns={orbChat.liveTurns}
      mode="normal"
      onOpenOpportunity={() => navigateToScreen(workerV5JobsDestinationScreenId(runtime.state.deal))}
      reduceTransparency={reduceTransparency}
      serviceIcons={workerV5OpportunityServiceIcons}
    />
  )
}

function WorkerV5SharedJobIncidentChat({
  deal,
  language,
  reduceTransparency,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const jobId = getWorkerV5ChatJobId(deal)
  const { error, loading, messages, send, sending } = useJobChatThread(
    jobId,
    Boolean(jobId),
    language,
  )
  const [draft, setDraft] = useState('')
  const submit = async () => {
    const content = draft.trim()
    if (!content || sending) return
    const sent = await send(content)
    if (sent) setDraft('')
  }
  return (
    <View style={[styles.jobRoomThreadCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-shared-job-incident-chat">
      {!reduceTransparency ? <MintAura intensity="component" style={styles.jobRoomThreadAura} /> : null}
      <View style={styles.jobRoomBubbleStack}>
        {loading ? <Text style={styles.boundaryBody}>{textByLanguage(language, 'Đang tải Kael Công việc...', 'Loading Kael Work...')}</Text> : null}
        {messages.slice(-24).map((message) => (
          <WorkerV5ChatBubble
            align={message.sender_role === 'worker' ? 'right' : undefined}
            body={message.content}
            key={message.id}
            label={message.sender_role === 'worker'
              ? textByLanguage(language, 'Thợ', 'Worker')
              : message.sender_role === 'customer'
              ? textByLanguage(language, 'Khách', 'Customer')
              : textByLanguage(language, 'Kael Công việc', 'Kael Work')}
          />
        ))}
        {error ? <WorkerV5ChatBubble body={error} label={textByLanguage(language, 'Kael · trạng thái', 'Kael · status')} /> : null}
      </View>
      <View style={styles.kaelOrbComposerCard}>
        <KaelTextField
          accessibilityLabel={textByLanguage(language, 'Nhắn trong Kael Công việc', 'Message in Kael Work')}
          inputShellStyle={styles.kaelOrbComposerInputShell}
          onChangeText={setDraft}
          onSubmitEditing={() => void submit()}
          placeholder={textByLanguage(language, 'Nhắn cho khách hoặc trả lời Kael...', 'Message the customer or reply to Kael...')}
          placeholderTextColor={color.text.muted}
          returnKeyType="send"
          shellStyle={styles.kaelOrbComposerField}
          style={styles.kaelOrbComposerInput}
          testID="worker-v5-shared-job-incident-input"
          value={draft}
        />
        <Pressable
          accessibilityLabel={textByLanguage(language, 'Gửi tin nhắn Kael Công việc', 'Send Kael Work message')}
          accessibilityRole="button"
          disabled={sending || !draft.trim()}
          onPress={() => void submit()}
          style={({ pressed }) => [styles.kaelOrbSendButton, pressed && draft.trim() ? styles.pressed : null]}
          testID="worker-v5-shared-job-incident-send"
        >
          <Text style={styles.kaelOrbSendText}>↑</Text>
        </Pressable>
      </View>
    </View>
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
  const orbChat = useWorkerV5KaelOrbChat(runtime.state.deal, language, 'intake', runtime.workerJobsHydrated)
  return (
    <WorkerV5KaelOrbBody
      composer={(
        <WorkerV5KaelOrbComposer
          busy={orbChat.busy}
          language={language}
          mediaCount={orbChat.mediaCount}
          mode="intake"
          onPickMedia={() => void orbChat.pickMedia()}
          onSend={(message) => void orbChat.send(message)}
          reduceTransparency={reduceTransparency}
        />
      )}
      deal={runtime.state.deal}
      fallbackJobIcon={workerV5Icons.jobs}
      language={language}
      liveError={orbChat.error}
      liveStatus={orbChat.busyLabel}
      liveTurns={orbChat.liveTurns}
      mode="intake"
      onOpenOpportunity={() => navigateToScreen(workerV5JobsDestinationScreenId(runtime.state.deal))}
      reduceTransparency={reduceTransparency}
      serviceIcons={workerV5OpportunityServiceIcons}
    />
  )
}

function WorkerV5PayoutMethodBody({
  language,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const profile = runtime.workerProfile
  return (
    <View style={styles.sectionStack}>
      <WorkerV5PayoutMethodHero
        language={language}
        profile={profile}
        receivingAccountIcon={workerV5CapturedIconAssets.payoutReceivingAccount}
        reduceTransparency={reduceTransparency}
      />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Chưa khả dụng', 'Unavailable')}
        title={textByLanguage(language, 'Trạng thái tài khoản', 'Account status')}
      />
      <WorkerV5PayoutLimitPolicyCard
        language={language}
        listAura={WorkerV5EarningsHomeListAura}
        reduceTransparency={reduceTransparency}
      />
      <WorkerV5SingleSourceActionButton
        primaryButtonFill={WorkerV5PrimaryButtonFill}
        disabled
        label={textByLanguage(language, 'Quản lý tài khoản chưa khả dụng', 'Account management unavailable')}
        onPress={() => undefined}
        reduceTransparency={reduceTransparency}
        testID="worker-v5-payout-method-use-action"
      />
    </View>
  )
}

function WorkerV5RankingHero({
  heroAura: HeroAura,
  insights,
  language,
  profile,
  reduceTransparency,
}: {
  heroAura: ComponentType<{ testID: string }>
  insights: WorkerV5Runtime['workerPerformanceInsights']
  language: AppLanguage
  profile: WorkerV5Runtime['workerProfile']
  reduceTransparency: boolean
}) {
  const score = workerV5NumericInsight(insights?.performance_score)
  const hasScore = workerV5HasNumber(insights?.performance_score)
  const completedSource = insights?.completed_job_count ?? profile?.total_jobs
  const hasCompleted = workerV5HasNumber(completedSource)
  const completed = workerV5NumericInsight(completedSource)
  const progressWidth = `${Math.max(0, Math.min(100, score))}%` as ViewStyle['width']
  const scoreLabel = hasScore ? `${score}` : textByLanguage(language, 'Chờ', 'Pending')
  const completedLabel = hasCompleted
    ? textByLanguage(language, `${completed} việc hoàn tất`, `${completed} completed jobs`)
    : textByLanguage(language, 'Chờ dữ liệu việc hoàn tất', 'Completed-job data pending')
  return (
    <View style={[rankingStyles.earningsHeroCard, reduceTransparency && rankingStyles.opaqueCard]} testID="worker-v5-ranking-hero">
      {!reduceTransparency ? <HeroAura testID="worker-v5-ranking-mint-aura" /> : null}
      <View style={rankingStyles.rankingHeroRow}>
        <View style={rankingStyles.rankingScoreOrb} testID="worker-v5-ranking-score-orb">
          {!reduceTransparency ? <MintAura intensity="component" style={rankingStyles.rankingScoreOrbAura} /> : null}
          <Text style={rankingStyles.rankingScoreOrbValue} numberOfLines={1} testID="worker-v5-ranking-score">{scoreLabel}</Text>
          <Text style={rankingStyles.rankingScoreOrbLabel} numberOfLines={2} testID="worker-v5-ranking-score-label">{textByLanguage(language, 'điểm hạng', 'rank points')}</Text>
        </View>
        <View style={rankingStyles.earningsHeroCopy}>
          <Text style={rankingStyles.earningsHeroPill} numberOfLines={2} testID="worker-v5-ranking-status">
            {hasScore ? textByLanguage(language, 'Dữ liệu thật', 'Real data') : textByLanguage(language, 'Chưa đủ dữ liệu', 'Not enough data')}
          </Text>
          <Text style={rankingStyles.rankingHeroTitle} numberOfLines={2} testID="worker-v5-ranking-title">
            {hasScore
              ? textByLanguage(language, `${score}/100 điểm xếp hạng`, `${score}/100 ranking points`)
              : textByLanguage(language, 'Chưa có điểm xếp hạng', 'No ranking score yet')}
          </Text>
          <Text style={rankingStyles.earningsHeroMeta} numberOfLines={2} testID="worker-v5-ranking-name">
            {profile?.legal_name || textByLanguage(language, 'Hồ sơ thợ', 'Worker profile')} · {completedLabel}
          </Text>
          <View style={rankingStyles.rankingProgressTrack} testID="worker-v5-ranking-progress">
            <View style={[rankingStyles.rankingProgressFill, { width: progressWidth }]} />
          </View>
        </View>
      </View>
    </View>
  )
}

function WorkerV5AgentMemoryBody({ language, reduceTransparency, runtime }: { language: AppLanguage; reduceTransparency: boolean; runtime: WorkerV5Runtime }) {
  const profile = runtime.workerProfile
  const [memoryToggleOverrides, setMemoryToggleOverrides] = useState<Partial<Record<WorkerV5MemoryPreferenceUiId, boolean>>>({})
  const [savingMemoryToggleIds, setSavingMemoryToggleIds] = useState<Partial<Record<WorkerV5MemoryPreferenceUiId, boolean>>>({})
  const memoryToggleInFlightIds = useRef<Partial<Record<WorkerV5MemoryPreferenceUiId, true>>>({})
  const memoryToggleRequestIds = useRef<Partial<Record<WorkerV5MemoryPreferenceUiId, number>>>({})
  const memoryTouchedToggleIds = useRef<Partial<Record<WorkerV5MemoryPreferenceUiId, true>>>({})
  const readMemoryToggle = (id: WorkerV5MemoryPreferenceUiId, initialValue: boolean) => memoryToggleOverrides[id] ?? initialValue
  useEffect(() => {
    let mounted = true
    memoryToggleInFlightIds.current = {}
    memoryTouchedToggleIds.current = {}
    memoryToggleRequestIds.current = {}
    kaelMemoryService.getMyWorkerMemory()
      .then((response) => {
        if (!mounted) return
        if (response.success) {
          const remoteOverrides = workerV5MemoryPreferenceOverridesFromMemory(response.data.memory)
          setMemoryToggleOverrides((current) => {
            const next = { ...current }
            for (const [id, enabled] of Object.entries(remoteOverrides) as [WorkerV5MemoryPreferenceUiId, boolean][]) {
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
  const setMemoryItemEnabled = (id: WorkerV5MemoryPreferenceUiId, nextEnabled: boolean, previousEnabled: boolean) => {
    if (memoryToggleInFlightIds.current[id]) return
    memoryToggleInFlightIds.current[id] = true
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
          setMemoryToggleOverrides((current) => ({ ...current, [id]: previousEnabled }))
          return
        }
        const remoteOverrides = workerV5MemoryPreferenceOverridesFromMemory(response.data.memory)
        setMemoryToggleOverrides((current) => ({
          ...current,
          ...Object.fromEntries(
            (Object.entries(remoteOverrides) as [WorkerV5MemoryPreferenceUiId, boolean][])
              .filter(([remoteId]) => remoteId === id || !memoryTouchedToggleIds.current[remoteId]),
          ),
          [id]: remoteOverrides[id] ?? nextEnabled,
        }))
      })
      .catch(() => {
        if (memoryToggleRequestIds.current[id] !== requestId) return
        setMemoryToggleOverrides((current) => ({ ...current, [id]: previousEnabled }))
      })
      .finally(() => {
        if (memoryToggleRequestIds.current[id] !== requestId) return
        delete memoryToggleInFlightIds.current[id]
        setSavingMemoryToggleIds((current) => ({ ...current, [id]: false }))
      })
  }
  const hasDistricts = Boolean(profile?.districts?.length)
  const hasRadius = typeof profile?.service_radius_km === 'number' && Number.isFinite(profile.service_radius_km)
  const selectedServices = profile?.selected_service_types
    ?? profile?.active_service_types
    ?? profile?.service_types
    ?? []
  const hasServices = selectedServices.length > 0
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
    ? selectedServices.map((service) => localizedServiceLabel(service, language)).join(', ')
    : textByLanguage(language, 'Chưa có kỹ năng ưu tiên', 'No priority skills')
  const canFilterFromProfile = hasDistricts || hasServices || hasRadius
  const permissionItems: { enabled: boolean; icon: WorkerV5IconName; id: WorkerV5MemoryPreferenceUiId; label: string; value: string }[] = [
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
  const boundaryItems: { enabled: boolean; icon: WorkerV5IconName; id: WorkerV5MemoryPreferenceUiId; label: string; value: string }[] = [
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
      <WorkerV5MemoryHero
        heroAura={WorkerV5EarningsHomeHeroAura}
        language={language}
        reduceTransparency={reduceTransparency}
        shieldIcon={workerV5Icons.shield}
      />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Chỉnh sửa', 'Edit')}
        title={textByLanguage(language, 'Thông tin được phép dùng', 'Allowed information')}
      />
      <WorkerV5MemorySwitchList
        auraTestID="worker-v5-memory-permission-mint-aura"
        iconVisualBoost={WORKER_V5_PROFILE_ICON_VISUAL_BOOST}
        icons={workerV5Icons}
        items={permissionItems}
        listAura={WorkerV5EarningsHomeListAura}
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
        iconVisualBoost={WORKER_V5_PROFILE_ICON_VISUAL_BOOST}
        icons={workerV5Icons}
        items={boundaryItems}
        listAura={WorkerV5EarningsHomeListAura}
        onChange={setMemoryItemEnabled}
        reduceTransparency={reduceTransparency}
        savingIds={savingMemoryToggleIds}
        testID="worker-v5-memory-boundary-list"
      />
    </View>
  )
}

function WorkerV5SettingsBody({ language, reduceTransparency, runtime }: { language: AppLanguage; reduceTransparency: boolean; runtime: WorkerV5Runtime }) {
  const router = useRouter()
  const { session, updateCustomerProfile, updatePassword } = useAuth()
  const metadata = session?.user.user_metadata
  const metadataFullName = workerV5StringFromUnknown(metadata?.full_name ?? metadata?.name)
  const metadataPhone = workerV5StringFromUnknown(metadata?.phone_number ?? metadata?.phone)
  const metadataEmail = workerV5StringFromUnknown(metadata?.contact_email) ?? session?.user.email ?? ''
  const [settingsState, setSettingsState] = useState(() => ({
    accountEmailDraft: metadataEmail,
    accountFullNameDraft: metadataFullName ?? '',
    accountMessage: null as string | null,
    accountPanelOpen: false,
    accountPhoneDraft: metadataPhone ?? '',
    accountSaving: false,
    confirmPasswordDraft: '',
    currentPasswordDraft: '',
    newPasswordDraft: '',
    passwordMessage: null as string | null,
    passwordPanelOpen: false,
    passwordSaving: false,
  }))
  const accountSaveInFlightRef = useRef(false)
  const passwordSaveInFlightRef = useRef(false)
  const {
    accountEmailDraft,
    accountFullNameDraft,
    accountMessage,
    accountPanelOpen,
    accountPhoneDraft,
    accountSaving,
    confirmPasswordDraft,
    currentPasswordDraft,
    newPasswordDraft,
    passwordMessage,
    passwordPanelOpen,
    passwordSaving,
  } = settingsState
  const currentLanguage = language === 'vi' ? 'Tiếng Việt' : 'English'
  const hasServiceArea = Boolean(runtime.workerProfile?.districts?.length || runtime.workerProfile?.service_radius_km)
  const accountCanSave = accountFullNameDraft.trim().length >= 2 || accountPhoneDraft.trim().length >= 6 || accountEmailDraft.trim().length >= 4
  const passwordMatches = newPasswordDraft.length > 0 && newPasswordDraft === confirmPasswordDraft
  const passwordCanSave = currentPasswordDraft.trim().length > 0 && newPasswordDraft.length >= 8 && passwordMatches

  const saveAccountSettings = async () => {
    if (accountSaveInFlightRef.current || accountSaving || !accountCanSave) return
    accountSaveInFlightRef.current = true
    setSettingsState((current) => ({ ...current, accountMessage: null, accountSaving: true }))
    try {
      const result = await updateCustomerProfile({
        email: accountEmailDraft.trim(),
        fullName: accountFullNameDraft.trim(),
        phone: accountPhoneDraft.trim(),
      })
      setSettingsState((current) => ({
        ...current,
        accountMessage: result.success
          ? textByLanguage(language, 'Đã lưu thông tin.', 'Saved')
          : localizeAccountMutationError(result.error, language, 'profile'),
      }))
    } catch {
      setSettingsState((current) => ({
        ...current,
        accountMessage: localizeAccountMutationError(null, language, 'profile'),
      }))
    } finally {
      accountSaveInFlightRef.current = false
      setSettingsState((current) => ({ ...current, accountSaving: false }))
    }
  }

  const savePasswordSettings = async () => {
    if (passwordSaveInFlightRef.current || passwordSaving || !passwordCanSave) return
    passwordSaveInFlightRef.current = true
    setSettingsState((current) => ({ ...current, passwordMessage: null, passwordSaving: true }))
    try {
      const result = await updatePassword({
        currentPassword: currentPasswordDraft.trim(),
        newPassword: newPasswordDraft,
      })
      setSettingsState((current) => ({
        ...current,
        confirmPasswordDraft: result.success ? '' : current.confirmPasswordDraft,
        currentPasswordDraft: result.success ? '' : current.currentPasswordDraft,
        newPasswordDraft: result.success ? '' : current.newPasswordDraft,
        passwordMessage: result.success
          ? textByLanguage(language, 'Đã đổi mật khẩu.', 'Password changed')
          : localizeAccountMutationError(result.error, language, 'password'),
      }))
    } catch {
      setSettingsState((current) => ({
        ...current,
        passwordMessage: localizeAccountMutationError(null, language, 'password'),
      }))
    } finally {
      passwordSaveInFlightRef.current = false
      setSettingsState((current) => ({ ...current, passwordSaving: false }))
    }
  }

  const switchSettingsLanguage = () => {
    const nextLanguage = language === 'vi' ? 'en' : 'vi'
    setAppLanguage(nextLanguage)
    router.replace(`/(worker)/profile?ns_worker_screen=5.10-support-settings&ns_worker_lang=${nextLanguage}` as never)
  }

  return (
    <View style={styles.sectionStack} testID="worker-v5-settings-screen">
      <WorkerV5SettingsHero
        language={language}
        listAura={WorkerV5EarningsHomeListAura}
        reduceTransparency={reduceTransparency}
        settingsIcon={workerV5SettingsIconAssets.hero}
      />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Cơ bản', 'Basics')}
        title={textByLanguage(language, 'Cài đặt chung', 'General settings')}
      />
      <View style={[styles.workerSettingsListCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-settings-list">
        <WorkerV5SettingsActionRow
          body={textByLanguage(language, 'Cập nhật tên, số điện thoại và email liên hệ.', 'Update name, phone, and contact email.')}
          details={[
            { glyph: 'identity', label: textByLanguage(language, 'Tên & liên hệ', 'Name and contact') },
            { glyph: 'shield', label: textByLanguage(language, 'Thông tin riêng', 'Private details') },
          ]}
          icon={workerV5SettingsIconAssets.personal}
          listAura={WorkerV5EarningsHomeListAura}
          onPress={() => {
            setSettingsState((current) => ({
              ...current,
              accountMessage: null,
              accountPanelOpen: !current.accountPanelOpen,
            }))
          }}
          reduceTransparency={reduceTransparency}
          status={accountPanelOpen ? textByLanguage(language, 'Ẩn', 'Hide') : textByLanguage(language, 'Sửa', 'Edit')}
          testID="worker-v5-settings-account"
          tone="identity"
          title={textByLanguage(language, 'Thông tin cá nhân', 'Personal details')}
        />
        {accountPanelOpen ? (
          <View style={styles.workerSettingsForm} testID="worker-v5-settings-account-form">
            <KaelTextField
              accessibilityLabel={textByLanguage(language, 'Họ và tên', 'Full name')}
              inputShellStyle={styles.workerSettingsInputShell}
              onChangeText={(value) => {
                setSettingsState((current) => ({ ...current, accountFullNameDraft: value, accountMessage: null }))
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
                setSettingsState((current) => ({ ...current, accountMessage: null, accountPhoneDraft: value }))
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
                setSettingsState((current) => ({ ...current, accountEmailDraft: value, accountMessage: null }))
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
          details={[
            { glyph: 'language', label: textByLanguage(language, 'Ngôn ngữ', 'Language') },
            { glyph: 'settings', label: textByLanguage(language, 'Giao diện', 'Interface') },
          ]}
          icon={workerV5SettingsIconAssets.language}
          listAura={WorkerV5EarningsHomeListAura}
          onPress={switchSettingsLanguage}
          reduceTransparency={reduceTransparency}
          status={currentLanguage}
          testID="worker-v5-settings-language"
          tone="signal"
          title={textByLanguage(language, 'Ngôn ngữ', 'Language')}
        />
        <View style={styles.workerSettingsDivider} />
        <WorkerV5SettingsActionRow
          body={textByLanguage(language, 'Xác nhận mật khẩu hiện tại trước khi đổi.', 'Confirm the current password first.')}
          details={[
            { glyph: 'shield', label: textByLanguage(language, 'Mật khẩu', 'Password') },
            { glyph: 'check', label: textByLanguage(language, 'Xác nhận hiện tại', 'Verify current') },
          ]}
          icon={workerV5SettingsIconAssets.security}
          listAura={WorkerV5EarningsHomeListAura}
          onPress={() => {
            setSettingsState((current) => ({
              ...current,
              passwordMessage: null,
              passwordPanelOpen: !current.passwordPanelOpen,
            }))
          }}
          reduceTransparency={reduceTransparency}
          status={passwordPanelOpen ? textByLanguage(language, 'Ẩn', 'Hide') : textByLanguage(language, 'Đổi', 'Change')}
          testID="worker-v5-settings-password"
          tone="identity"
          title={textByLanguage(language, 'Bảo mật đăng nhập', 'Login security')}
        />
        {passwordPanelOpen ? (
          <View style={styles.workerSettingsForm} testID="worker-v5-settings-password-form">
            <KaelTextField
              accessibilityLabel={textByLanguage(language, 'Mật khẩu hiện tại', 'Current password')}
              inputShellStyle={styles.workerSettingsInputShell}
              onChangeText={(value) => {
                setSettingsState((current) => ({ ...current, currentPasswordDraft: value, passwordMessage: null }))
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
                setSettingsState((current) => ({ ...current, newPasswordDraft: value, passwordMessage: null }))
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
                setSettingsState((current) => ({ ...current, confirmPasswordDraft: value, passwordMessage: null }))
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
          details={[
            {
              glyph: 'location',
              label: runtime.workerProfile?.districts?.length
                ? textByLanguage(language, `${runtime.workerProfile.districts.length} khu vực`, `${runtime.workerProfile.districts.length} areas`)
                : textByLanguage(language, 'Chưa có khu vực', 'No area yet'),
            },
            {
              glyph: 'signal',
              label: typeof runtime.workerProfile?.service_radius_km === 'number'
                ? textByLanguage(language, `${runtime.workerProfile.service_radius_km} km`, `${runtime.workerProfile.service_radius_km} km`)
                : textByLanguage(language, 'Chưa có bán kính', 'No radius yet'),
            },
          ]}
          icon={workerV5SettingsIconAssets.serviceArea}
          listAura={WorkerV5EarningsHomeListAura}
          onPress={() => router.replace('/(worker)/profile?ns_worker_screen=5.3-skills-service-area' as never)}
          reduceTransparency={reduceTransparency}
          status={hasServiceArea ? textByLanguage(language, 'Mở', 'Open') : textByLanguage(language, 'Thiết lập', 'Set up')}
          testID="worker-v5-settings-service-area"
          tone="location"
          title={textByLanguage(language, 'Khu vực phục vụ', 'Service areas')}
        />
        <View style={styles.workerSettingsDivider} />
        <WorkerV5SettingsActionRow
          body={textByLanguage(language, 'Ghi nhớ tương tác được phép; thợ có thể bật hoặc tắt.', 'Remember allowed interactions; the worker can turn it on or off.')}
          details={[
            { glyph: 'memory', label: textByLanguage(language, 'Quyền ghi nhớ', 'Memory permission') },
            { glyph: 'shield', label: textByLanguage(language, 'Bạn kiểm soát', 'You control it') },
          ]}
          icon={workerV5SettingsIconAssets.kaelMemory}
          listAura={WorkerV5EarningsHomeListAura}
          onPress={() => router.replace('/(worker)/profile?ns_worker_screen=5.6-agent-memory-preferences' as never)}
          reduceTransparency={reduceTransparency}
          status={textByLanguage(language, 'Mở', 'Open')}
          testID="worker-v5-settings-memory"
          tone="signal"
          title={textByLanguage(language, 'Bộ nhớ Kael', 'Kael memory')}
        />
      </View>
    </View>
  )
}

const availabilitySwitchSpring = {
  damping: 19,
  mass: 0.68,
  stiffness: 300,
}

function WorkerV5AvailabilityCard({
  availabilityGuardReady,
  hasActiveJob,
  language,
  onToggleAvailability,
  profile,
  reduceMotion = false,
  reduceTransparency,
}: {
  availabilityGuardReady: boolean
  hasActiveJob: boolean
  language: AppLanguage
  onToggleAvailability?: (isAvailable: boolean) => Promise<boolean>
  profile: WorkerV5Runtime['workerProfile']
  reduceMotion?: boolean
  reduceTransparency: boolean
}) {
  const [pending, setPending] = useState(false)
  const [optimisticAvailable, setOptimisticAvailable] = useState<boolean | null>(null)
  const [inlineFailure, setInlineFailure] = useState<string | null>(null)
  const availabilityInteractionRef = useRef(false)
  const availabilityRequestIdRef = useRef(0)
  const availabilitySwitchDidMountRef = useRef(false)
  const availabilitySwitchLastCheckedRef = useRef(false)
  const availabilityTitleDidMountRef = useRef(false)
  const availabilityTitleProgress = useSharedValue(1)
  const availabilitySwitchProgress = useSharedValue(profile?.is_available ? 1 : 0)
  const availabilitySwitchPressProgress = useSharedValue(0)
  const availabilitySwitchSheenProgress = useSharedValue(1)
  const profileAvailable = Boolean(profile?.is_available)
  if (!pending && optimisticAvailable !== null && profileAvailable === optimisticAvailable) {
    setOptimisticAvailable(null)
  }
  const rawAvailable = optimisticAvailable ?? profileAvailable
  const effectiveProfile = profile ? { ...profile, is_available: rawAvailable } : profile
  const blockedByGuardLoading = Boolean(profile && !availabilityGuardReady && !rawAvailable)
  const availabilityTitle = inlineFailure
    ?? (blockedByGuardLoading
      ? textByLanguage(language, 'Đang đồng bộ công việc', 'Syncing current work')
      : hasActiveJob && rawAvailable
        ? textByLanguage(language, 'Đã bật nhận công việc', 'Enabled for the next job')
      : workerAvailabilityLabel(effectiveProfile, language))
  const checked = Boolean(rawAvailable && profile?.is_approved && !profile?.is_suspended)
  const canToggle = Boolean(
    onToggleAvailability
      && profile
      && !blockedByGuardLoading
      && ((profile.is_approved && !profile.is_suspended) || rawAvailable),
  )
  const disabled = !canToggle || pending

  useEffect(() => {
    // The title is derived from profile props; this effect synchronizes animation to external state.
    // react-doctor-disable-next-line react-doctor/no-event-handler
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

  useEffect(() => {
    const target = checked ? 1 : 0
    const checkedChanged = availabilitySwitchLastCheckedRef.current !== checked
    availabilitySwitchLastCheckedRef.current = checked

    if (reduceMotion || !availabilitySwitchDidMountRef.current || !checkedChanged) {
      availabilitySwitchProgress.value = target
      availabilitySwitchPressProgress.value = 0
      availabilitySwitchSheenProgress.value = 1
      availabilitySwitchDidMountRef.current = true
      return
    }

    availabilitySwitchProgress.value = withSpring(target, availabilitySwitchSpring)
    availabilitySwitchSheenProgress.value = 0
    availabilitySwitchSheenProgress.value = withDelay(35, withTiming(1, {
      duration: 320,
      easing: Easing.out(Easing.cubic),
    }))
  }, [
    availabilitySwitchPressProgress,
    availabilitySwitchProgress,
    availabilitySwitchSheenProgress,
    checked,
    reduceMotion,
  ])

  const availabilityTitleMotionStyle = useAnimatedStyle(() => ({
    opacity: availabilityTitleProgress.value,
    transform: [{ translateY: (1 - availabilityTitleProgress.value) * 8 }],
  }))
  const availabilitySwitchOnMotionStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, Math.min(1, availabilitySwitchProgress.value)),
  }))
  const availabilitySwitchPressMotionStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - availabilitySwitchPressProgress.value * 0.018 }],
  }))
  const availabilityKnobMotionStyle = useAnimatedStyle(() => {
    const progress = Math.max(0, Math.min(1, availabilitySwitchProgress.value))
    const travelStretch = 4 * progress * (1 - progress)
    const pressProgress = availabilitySwitchPressProgress.value

    return {
      transform: [
        { translateX: availabilitySwitchProgress.value * 18 },
        { scaleX: 1 + travelStretch * 0.12 + pressProgress * 0.08 },
        { scaleY: 1 - travelStretch * 0.03 - pressProgress * 0.03 },
      ],
    }
  })
  const availabilitySwitchSheenMotionStyle = useAnimatedStyle(() => {
    const progress = availabilitySwitchSheenProgress.value
    const isTravelling = progress > 0 && progress < 1

    return {
      opacity: isTravelling ? Math.sin(progress * Math.PI) * 0.24 : 0,
      transform: [
        { translateX: -12 + progress * 58 },
        { skewX: '-12deg' },
      ],
    }
  })

  const handleSwitchPressIn = () => {
    if (disabled || reduceMotion) return
    availabilitySwitchPressProgress.value = withSpring(1, motionTokens.liquid.press)
  }

  const handleSwitchPressOut = () => {
    availabilitySwitchPressProgress.value = reduceMotion
      ? 0
      : withSpring(0, motionTokens.liquid.press)
  }

  const handleToggle = async () => {
    if (!onToggleAvailability || !canToggle || availabilityInteractionRef.current) return
    availabilityInteractionRef.current = true
    const nextAvailability = rawAvailable ? false : true
    const requestId = availabilityRequestIdRef.current + 1
    availabilityRequestIdRef.current = requestId
    setInlineFailure(null)
    setOptimisticAvailable(nextAvailability)
    setPending(true)
    try {
      // The request-id guard must run after the mutation so an older toggle cannot overwrite the latest one.
      // react-doctor-disable-next-line react-doctor/async-defer-await
      const saved = await onToggleAvailability(nextAvailability)
      if (availabilityRequestIdRef.current !== requestId) return
      if (!saved) {
        setOptimisticAvailable(null)
        setInlineFailure(textByLanguage(language, 'Chưa cập nhật được — kiểm tra việc đang chạy', 'Could not update — check active work'))
        Alert.alert(
          textByLanguage(language, 'Chưa cập nhật được trạng thái', 'Could not update status'),
          textByLanguage(language, 'Vui lòng thử lại sau khi kết nối ổn định.', 'Please try again once the connection is stable.'),
        )
      }
    } catch {
      if (availabilityRequestIdRef.current !== requestId) return
      setOptimisticAvailable(null)
      setInlineFailure(textByLanguage(language, 'Chưa cập nhật được — kiểm tra kết nối', 'Could not update — check your connection'))
      Alert.alert(
        textByLanguage(language, 'Chưa cập nhật được trạng thái', 'Could not update status'),
        textByLanguage(language, 'Vui lòng thử lại sau khi kết nối ổn định.', 'Please try again once the connection is stable.'),
      )
    } finally {
      if (availabilityRequestIdRef.current === requestId) setPending(false)
      availabilityInteractionRef.current = false
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
      <Animated.View
        style={availabilitySwitchPressMotionStyle}
        testID="worker-v5-availability-switch-motion-shell"
      >
        <Pressable
          accessibilityLabel={textByLanguage(language, 'Bật tắt nhận việc', 'Toggle work availability')}
          accessibilityRole="switch"
          accessibilityState={{ busy: pending, checked, disabled }}
          disabled={disabled}
          onPress={handleToggle}
          onPressIn={handleSwitchPressIn}
          onPressOut={handleSwitchPressOut}
          style={[
            styles.availabilitySwitch,
            disabled ? styles.availabilitySwitchDisabled : null,
          ]}
          testID="worker-v5-availability-switch"
        >
          <Animated.View
            style={[styles.availabilitySwitchOn, availabilitySwitchOnMotionStyle]}
            testID="worker-v5-availability-switch-fill"
          />
          <Animated.View
            pointerEvents="none"
            style={[styles.availabilitySwitchSheen, availabilitySwitchSheenMotionStyle]}
            testID="worker-v5-availability-switch-sheen"
          />
          <Animated.View
            style={[styles.availabilityKnob, availabilityKnobMotionStyle]}
            testID="worker-v5-availability-switch-knob"
          />
        </Pressable>
      </Animated.View>
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
  const uri = mobileApiUrl(`/maps/vietmap/static?lat=${encodeURIComponent(location.lat.toFixed(6))}&lng=${encodeURIComponent(location.lng.toFixed(6))}&zoom=13`)
  return <WorkerV5VietMapStaticImage key={uri} label={label} language={language} uri={uri} />
}

function WorkerV5VietMapStaticImage({
  label,
  language,
  uri,
}: {
  label: string
  language: AppLanguage
  uri: string
}) {
  const [headers, setHeaders] = useState<Record<string, string> | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getMobileApiAuthHeaders()
      .then((nextHeaders) => {
        if (cancelled) return
        const imageHeaders = { ...nextHeaders }
        delete imageHeaders['Content-Type']
        setHeaders(imageHeaders)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
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
      contentFit="cover"
      source={{ headers, uri }}
      style={styles.mapStaticImage}
      testID="worker-v5-vietmap-static-image"
    />
  )
}

function WorkerV5RouteMapStage({
  deal,
  language,
  reduceTransparency,
  routePreview,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
  routePreview: WorkerV5RoutePreviewState
}) {
  const destinationLabel = workerV5ArrivalDestinationLabel(deal, language)
  const originLabel = routePreview.locationStatus === 'ready'
    ? textByLanguage(language, 'Vị trí của bạn đang được cập nhật', 'Your position is updating')
    : routePreview.locationStatus === 'denied'
      ? textByLanguage(language, 'Bật vị trí để tính quãng đường và thời gian đến', 'Enable location for distance and ETA')
      : textByLanguage(language, 'Đang lấy vị trí của bạn', 'Getting your position')

  return (
    <View style={[styles.mapPanel, reduceTransparency && styles.opaqueCard]} testID="worker-v5-route-map-panel">
      {!reduceTransparency ? (
        <WorkerV5CustomerMapMintAura
          scope="RouteEtaMapPanel"
          style={styles.routeMapPanelAura}
          testID="worker-v5-route-map-mint-aura"
        />
      ) : null}
      {routePreview.mapUri ? (
        <WorkerV5AuthenticatedRouteMapPreview
          label={destinationLabel}
          language={language}
          uri={routePreview.mapUri}
        />
      ) : (
        <View style={styles.mapUnavailable} testID="worker-v5-route-vietmap-empty-state">
          <Text style={styles.mapUnavailableTitle}>
            {!routePreview.hasRouteDestination
              ? textByLanguage(language, 'Địa chỉ chưa được mở cho lộ trình', 'The route address is not available yet')
              : routePreview.locationStatus === 'denied'
                ? textByLanguage(language, 'Cần bật vị trí để mở bản đồ', 'Enable location to open the map')
                : routePreview.locationStatus === 'unavailable'
                  ? textByLanguage(language, 'Chưa thể lấy vị trí hiện tại', 'Current location is unavailable')
                  : textByLanguage(language, 'Đang lấy vị trí của bạn', 'Getting your current location')}
          </Text>
          <Text style={styles.mapUnavailableMeta}>
            {routePreview.hasRouteDestination
              ? textByLanguage(language, 'Tuyến đường chỉ dùng tọa độ tòa nhà; số căn và tầng vẫn được bảo vệ.', 'The route uses the building location only; unit and floor remain protected.')
              : textByLanguage(language, 'Bản đồ chỉ hiện khi backend đã mở điểm đến tòa nhà cho thợ.', 'The map appears only after the backend releases the building destination to the worker.')}
          </Text>
        </View>
      )}
      {routePreview.mapUri ? (
        <View style={styles.routeMapCaption} testID="worker-v5-route-map-caption">
          <Text numberOfLines={1} style={styles.routeMapCaptionTitle}>{originLabel}</Text>
          <Text numberOfLines={2} style={styles.routeMapCaptionMeta}>{destinationLabel}</Text>
        </View>
      ) : null}
    </View>
  )
}

function WorkerV5AuthenticatedRouteMapPreview({
  label,
  language,
  uri,
}: {
  label: string
  language: AppLanguage
  uri: string
}) {
  return <WorkerV5AuthenticatedRouteMapImage key={uri} label={label} language={language} uri={uri} />
}

function WorkerV5AuthenticatedRouteMapImage({
  label,
  language,
  uri,
}: {
  label: string
  language: AppLanguage
  uri: string
}) {
  const [headers, setHeaders] = useState<Record<string, string> | null>(null)
  const [webUri, setWebUri] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getMobileApiAuthHeaders()
      .then((nextHeaders) => {
        if (cancelled) return
        const imageHeaders = { ...nextHeaders }
        delete imageHeaders['Content-Type']
        setHeaders(imageHeaders)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [uri])

  useEffect(() => {
    if (Platform.OS !== 'web' || !headers) return
    let cancelled = false
    let objectUri: string | null = null
    void workerRouteService.getMapImage(uri, headers).then((blob) => {
      objectUri = URL.createObjectURL(blob)
      if (!cancelled) setWebUri(objectUri)
    }).catch(() => {
      if (!cancelled) setFailed(true)
    })
    return () => {
      cancelled = true
      if (objectUri) URL.revokeObjectURL(objectUri)
    }
  }, [headers, uri])

  if (failed) {
    return (
      <View style={styles.mapUnavailable} testID="worker-v5-route-map-image-error">
        <Text style={styles.mapUnavailableTitle}>{textByLanguage(language, 'Chưa thể tải bản đồ tuyến đường', 'Route map is unavailable')}</Text>
        <Text style={styles.mapUnavailableMeta}>{label}</Text>
      </View>
    )
  }

  if (!headers || (Platform.OS === 'web' && !webUri)) {
    return (
      <View style={styles.mapUnavailable} testID="worker-v5-route-map-image-loading">
        <Text style={styles.mapUnavailableTitle}>{textByLanguage(language, 'Đang tải bản đồ tuyến đường', 'Loading route map')}</Text>
        <Text style={styles.mapUnavailableMeta}>{label}</Text>
      </View>
    )
  }

  return (
    <Image
      accessibilityLabel={textByLanguage(language, `Bản đồ tuyến đường đến ${label}`, `Route map to ${label}`)}
      onError={() => setFailed(true)}
      contentFit="cover"
      source={Platform.OS === 'web' ? { uri: webUri! } : { headers, uri }}
      style={styles.mapStaticImage}
      testID="worker-v5-route-map-live-image"
    />
  )
}

function WorkerV5StatusTimeline(props: WorkerV5StatusTimelineBaseProps) {
  return (
    <WorkerV5StatusTimelineSurface
      {...props}
      caseWideAura={WorkerV5CustomerCaseWideMintAura}
      zipAura={WorkerV5CustomerZipMintAura}
    />
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
  const savedDistricts = normalizeWorkerV5DistrictSelectionList(profile?.districts ?? [])
  const [serviceAreaState, setServiceAreaState] = useState(() => ({
    areaDraft: workerV5DistrictDraftFromSelection(savedDistricts, language),
    expanded: false,
    savingAreas: false,
    selectedDistricts: savedDistricts,
    serviceAreaMessage: '',
  }))
  const serviceAreaSaveInFlightRef = useRef(false)
  const {
    areaDraft,
    expanded,
    savingAreas,
    selectedDistricts,
    serviceAreaMessage,
  } = serviceAreaState
  const selectedDistrictDraft = workerV5DistrictDraftFromSelection(selectedDistricts, language)
  const draftParse = parseWorkerV5ServiceAreaDraft(areaDraft, language)
  const draftHasChanges = normalizeServiceAreaDraftText(areaDraft) !== normalizeServiceAreaDraftText(selectedDistrictDraft)

  const saveServiceAreas = async () => {
    if (serviceAreaSaveInFlightRef.current || savingAreas) return
    const parsed = parseWorkerV5ServiceAreaDraft(areaDraft, language)
    const nextDistricts = parsed.districts
    if (!nextDistricts.length) {
      setServiceAreaState((current) => ({
        ...current,
        serviceAreaMessage: textByLanguage(language, 'Nhập ít nhất một khu vực phục vụ.', 'Enter at least one service area.'),
      }))
      return
    }
    if (parsed.invalid.length) {
      setServiceAreaState((current) => ({
        ...current,
        serviceAreaMessage: textByLanguage(language, 'Kiểm tra lại tên khu vực trước khi lưu.', 'Check service area names before saving.'),
      }))
      return
    }
    const previousDistricts = selectedDistricts
    serviceAreaSaveInFlightRef.current = true
    setServiceAreaState((current) => ({
      ...current,
      savingAreas: true,
      selectedDistricts: nextDistricts,
      serviceAreaMessage: '',
    }))
    let saved = false
    try {
      saved = await runtime.actions.workerUpdateServiceArea({
        districts: nextDistricts,
      })
    } catch {
      saved = false
    } finally {
      serviceAreaSaveInFlightRef.current = false
    }
    if (!saved) {
      setServiceAreaState((current) => ({
        ...current,
        savingAreas: false,
        selectedDistricts: previousDistricts,
        serviceAreaMessage: textByLanguage(language, 'Chưa đồng bộ được với NestScout. Khu vực vừa nhập vẫn đang chờ lưu.', 'Could not sync with NestScout. Your entered areas are still pending.'),
      }))
      return
    }
    setServiceAreaState((current) => ({
      ...current,
      areaDraft: workerV5DistrictDraftFromSelection(nextDistricts, language),
      savingAreas: false,
      serviceAreaMessage: textByLanguage(language, 'Đã lưu khu vực phục vụ.', 'Service area saved.'),
    }))
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
        onPress={() => setServiceAreaState((current) => ({
          ...current,
          expanded: !current.expanded,
        }))}
        style={({ pressed }) => [
          styles.kaelBriefCard,
          styles.serviceAreaOpenCard,
          reduceTransparency && styles.opaqueCard,
          pressed && styles.pressed,
        ]}
        testID="worker-v5-service-area-open-card"
      >
        <WorkerV5IntegratedIcon
          bleed={11}
          image={workerV5CapturedIconAssets.profileServiceArea}
          reduceTransparency={reduceTransparency}
          tone="location"
          variant="compactPanel"
        />
        <View style={styles.kaelBriefText}>
          <Text style={styles.kaelBriefTitle} numberOfLines={2}>{textByLanguage(language, 'Khu vực phục vụ', 'Service area')}</Text>
          <Text style={styles.kaelBriefBody} numberOfLines={2} testID="worker-v5-service-area-open-summary">{collapsedSummary}</Text>
          <WorkerV5DetailRail
            items={[
              {
                glyph: 'location',
                label: visibleAreaLabels.length
                  ? textByLanguage(language, `${visibleAreaLabels.length} khu vực`, `${visibleAreaLabels.length} areas`)
                  : textByLanguage(language, 'Chưa chọn khu vực', 'No area selected'),
              },
              {
                glyph: 'signal',
                label: radius ?? textByLanguage(language, 'Chưa có bán kính', 'No radius yet'),
              },
            ]}
            testID="worker-v5-service-area-detail"
          />
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
                onChangeText={(areaDraftValue) => setServiceAreaState((current) => ({
                  ...current,
                  areaDraft: areaDraftValue,
                }))}
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
        <Text style={styles.completionLensValue} numberOfLines={1} testID="worker-v5-reliability-score">
          {hasScore ? score : textByLanguage(language, 'Chờ', 'Pending')}
        </Text>
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
    // The fill follows score props and must also react to background data refreshes.
    // react-doctor-disable-next-line react-doctor/no-event-handler
    if (!hasData || reduceMotion) {
      progress.value = target
      return
    }
    progress.value = 0
    progress.value = withDelay(70 + index * 45, withSpring(target, motionTokens.liquid.entrance))
  }, [hasData, index, progress, reduceMotion, target])

  return (
    <Animated.View
      style={[reliabilityStyles.reliabilityAxisFill, animatedFillStyle]}
      testID={`worker-v5-reliability-axis-fill-${index}`}
    />
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
    <WorkerV5PrimitiveInfoRow
      icon={icon}
      icons={workerV5Icons}
      iconVisualBoost={WORKER_V5_PROFILE_ICON_VISUAL_BOOST}
      label={label}
      reduceTransparency={reduceTransparency}
      value={value}
    />
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

function buildDealSummary(deal: LocalDeal | null, language: AppLanguage) {
  if (!deal) return textByLanguage(language, 'Chưa có việc', 'No work')
  const service = localizedServiceLabel(deal.draft.serviceType, language)
  const area = deal.draft.districtLabel || textByLanguage(language, 'chưa rõ khu vực', 'unknown area')
  return `${service} · ${area} · ${localizedStatusLabel(deal.status, language)}`
}

function workerV5OfferHeaderSubtitle(deal: LocalDeal | null, language: AppLanguage) {
  const code = workerV5DisplayCode(deal, language)
  if (code) return textByLanguage(language, `Mã việc ${code}`, `Work ${code}`)
  return textByLanguage(language, 'Đề nghị từ dữ liệu thật', 'Offer from real data')
}

function workerV5CaseHeaderSubtitle(deal: LocalDeal | null, language: AppLanguage) {
  const code = workerV5DisplayCode(deal, language)
  if (code) return textByLanguage(language, `Case ${code}`, `Case ${code}`)
  return textByLanguage(language, 'Case chờ khách phê duyệt', 'Case waiting for customer approval')
}

function workerV5TravelHeaderSubtitle(deal: LocalDeal | null, language: AppLanguage) {
  const code = workerV5DisplayCode(deal, language)
  if (code) return textByLanguage(language, `Mã việc ${code}`, `Work ${code}`)
  return null
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
    boxShadow: '0 3px 8px rgba(7,26,36,0.16)',
    height: 20,
    position: 'relative',
    width: 20,
    zIndex: 2,
  },
  availabilitySwitch: {
    backgroundColor: '#DFE9E7',
    borderColor: 'rgba(216,235,232,0.9)',
    borderRadius: radius.pill,
    borderWidth: 0,
    height: 26,
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: 3,
    width: 44,
  },
  availabilitySwitchDisabled: {
    opacity: 0.58,
  },
  availabilitySwitchOn: {
    backgroundColor: '#16C7B4',
    boxShadow: '0 8px 16px rgba(8,175,156,0.22)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  availabilitySwitchSheen: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: radius.pill,
    height: 20,
    left: 0,
    position: 'absolute',
    top: 3,
    width: 8,
    zIndex: 1,
  },
  availabilityTitle: {
    color: color.text.strong,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
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
  homeSourceHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 58,
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
    fontWeight: '700',
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
  payoutMethodSaveStatus: {
    color: color.brand.primaryDark,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    paddingHorizontal: 10,
    textAlign: 'center',
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
    boxShadow: 'none',
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
  infoListCard: {
    backgroundColor: 'rgba(255,255,255,0.73)',
    borderColor: 'rgba(255,255,255,0.92)',
    borderRadius: 25,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    ...shadow.soft,
  },
  iconTileMintAura: {
    opacity: 0.92,
  },
  acceptReviewStack: {
    gap: 10,
  },
  offerDetailStack: {
    gap: 10,
  },
  offerDetailListDivider: {
    borderTopColor: 'rgba(205,226,222,0.78)',
    borderTopWidth: 1,
  },
  kaelBriefBody: {
    color: color.text.secondary,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
  },
  kaelBriefCard: {
    alignItems: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: 'rgba(204,223,219,0.94)',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 0,
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
    alignSelf: 'center',
    marginLeft: 10,
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
    marginLeft: 38,
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
  routeMapCaption: {
    backgroundColor: 'rgba(248,255,252,0.92)',
    borderColor: 'rgba(255,255,255,0.95)',
    borderRadius: 14,
    borderWidth: 1,
    bottom: 12,
    left: 12,
    maxWidth: '82%',
    paddingHorizontal: 10,
    paddingVertical: 7,
    position: 'absolute',
    zIndex: 3,
  },
  routeMapCaptionMeta: {
    color: color.text.secondary,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  routeMapCaptionTitle: {
    color: color.brand.primaryDark,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
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
  workerProfileAuraButton: {
    backgroundColor: 'rgba(248,255,253,0.92)',
    borderColor: 'rgba(45,211,193,0.38)',
    overflow: 'hidden',
    boxShadow: '0 12px 24px rgba(8,125,114,0.12)',
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
  opaqueCard: {
    backgroundColor: color.mint.white,
  },
  opportunityInboxStack: {
    gap: 8,
  },
  opportunityList: {
    gap: 8,
  },
  opportunityInboxPageZipAura: {
    height: 340,
    opacity: 0.24,
    right: -92,
    top: 118,
    width: 390,
  },
  offerDetailPageZipAura: {
    height: 340,
    opacity: 0.24,
    right: -92,
    top: 120,
    width: 390,
  },
  offerDetailPageLowerAura: {
    bottom: 84,
    height: 320,
    left: -58,
    opacity: 0.24,
    right: -58,
    top: 'auto',
  },
  routeEtaPageZipAura: {
    height: 340,
    opacity: 0.24,
    right: -92,
    top: 122,
    width: 390,
  },
  arrivalCheckinPageZipAura: {
    height: 340,
    opacity: 0.24,
    right: -92,
    top: 122,
    width: 390,
  },
  earningsPageZipAura: {
    height: 390,
    opacity: 0.26,
    right: -108,
    top: 86,
    width: 430,
  },
  earningsPageLowerAura: {
    bottom: 40,
    height: 390,
    left: -92,
    opacity: 0.24,
    right: -72,
    top: 'auto',
  },
  kaelOrbPageZipAura: {
    bottom: 84,
    height: 360,
    opacity: 0.24,
    right: -98,
    top: 'auto',
    width: 390,
  },
  caseFlowPageLowerAura: {
    bottom: 66,
    height: 360,
    left: -68,
    opacity: 0.24,
    right: -68,
    top: 'auto',
  },
  demandMapInfoListAura: {
    bottom: -58,
    height: 250,
    left: -46,
    opacity: 0.22,
    right: -46,
    top: -48,
  },
  smartSchedulePageLowerAura: {
    bottom: 72,
    height: 360,
    left: -62,
    opacity: 0.24,
    right: -62,
    top: 'auto',
  },
  smartSchedulePageZipAura: {
    height: 360,
    opacity: 0.26,
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
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  disabledButton: {
    opacity: 0.62,
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
  customerConfirmationWait: {
    gap: 12,
    paddingHorizontal: 8,
    paddingTop: 22,
  },
  customerConfirmationWaitBody: {
    color: color.text.secondary,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 21,
    maxWidth: 520,
  },
  customerConfirmationWaitDot: {
    backgroundColor: color.brand.primary,
    borderRadius: 4,
    height: 7,
    width: 7,
  },
  customerConfirmationWaitMeta: {
    color: color.text.muted,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
    marginTop: 4,
  },
  customerConfirmationWaitRule: {
    backgroundColor: 'rgba(13,167,151,0.24)',
    height: 1,
    marginBottom: 8,
    width: '100%',
  },
  customerConfirmationWaitStatus: {
    color: color.brand.primaryDark,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  customerConfirmationWaitStatusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  customerConfirmationWaitTitle: {
    color: color.text.strong,
    fontSize: 21,
    fontWeight: '700',
    lineHeight: 28,
    maxWidth: 520,
  },
  sectionStack: {
    gap: 14,
  },
  fieldEvidenceKaelConfirmation: {
    color: color.text.secondary,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
    paddingHorizontal: 2,
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
    backgroundColor: '#08AF9C',
    borderColor: 'rgba(255,255,255,0.82)',
    borderRadius: 18,
    borderWidth: 3,
    height: 63,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 63,
    zIndex: 1,
    boxShadow: '0 10px 18px rgba(8,125,114,0.28)',
  },
  successCheckFill: {
    ...StyleSheet.absoluteFill,
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
    boxShadow: '0 18px 34px rgba(8,125,114,0.16)',
  },
  successEmblemAura: {
    ...StyleSheet.absoluteFill,
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
  surfaceGlass: {
    backgroundColor: signature.bg,
  },
  surfaceSolid: {
    backgroundColor: color.surface.base,
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
    boxShadow: '0 18px 38px rgba(8,125,114,0.16)',
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
  titleText: {
    color: color.text.strong,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 29,
  },
  earningsOverviewTitle: {
    marginLeft: 8,
  },
  profileRouteIconVisualBoost: {
    height: 52,
    width: 52,
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
  workerV5CustomerCaseWideMintAura: {
    ...StyleSheet.absoluteFill,
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
    ...StyleSheet.absoluteFill,
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
  kaelOrbComposerStack: {
    gap: 0,
    marginBottom: 0,
    marginTop: 10,
    paddingBottom: 3,
    transform: [{ translateY: 7 }],
    position: 'relative',
    zIndex: 3,
  },
  kaelIntakeReadinessCard: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderColor: color.mint.mint100,
    borderRadius: 24,
    borderWidth: 1,
    gap: 8,
    marginTop: 10,
    padding: 14,
    ...shadow.soft,
  },
  kaelIntakeReadinessTitle: {
    color: color.text.strong,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  kaelIntakeReadinessBody: {
    color: color.text.secondary,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  kaelIntakeReadinessButton: {
    marginTop: 2,
  },
  kaelOrbComposerAura: {
    ...StyleSheet.absoluteFill,
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
    boxShadow: '0 10px 24px rgba(5,155,138,0.10)',
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
    gap: 3,
    minHeight: 0,
    overflow: 'hidden',
    paddingBottom: 4,
    paddingHorizontal: 4,
    paddingTop: 4,
    position: 'absolute',
    maxWidth: 208,
    boxShadow: '0 8px 16px rgba(8,125,114,0.05)',
    right: 16,
    top: 68,
    width: '59%',
    zIndex: 20,
  },
  kaelOrbCustomerModeMenuAura: {
    ...StyleSheet.absoluteFill,
    opacity: 0.78,
    zIndex: 0,
  },
  kaelOrbCustomerModeMenuOption: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.42)',
    borderColor: 'rgba(13,167,151,0.12)',
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 46,
    paddingHorizontal: 10,
    paddingVertical: 5,
    position: 'relative',
    width: '100%',
    zIndex: 2,
  },
  kaelOrbCustomerModeMenuOptionActive: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderColor: 'rgba(255,255,255,0.92)',
    boxShadow: '0 7px 16px rgba(4,99,88,0.08)',
  },
  kaelOrbCustomerModeMenuCheck: {
    color: color.brand.primary,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
    marginLeft: 8,
  },
  kaelOrbCustomerModeMenuCopy: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  kaelOrbCustomerModeMenuOptions: {
    gap: 3,
    zIndex: 2,
  },
  kaelOrbCustomerModeMenuDescription: {
    color: color.text.muted,
    fontSize: 10.5,
    fontWeight: '500',
    lineHeight: 14,
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
    color: color.text.strong,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
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
  kaelOrbCustomerScrollContent: {
    gap: 12,
    paddingBottom: 34,
    paddingTop: 12,
  },
  kaelOrbCustomerTopBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
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
  kaelOrbCustomerTopSpacer: {
    flex: 1,
    minWidth: 0,
  },
  kaelOrbCustomerHeaderActions: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderColor: 'rgba(216,235,232,0.92)',
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: 'row',
    height: 44,
    overflow: 'hidden',
    ...shadow.soft,
  },
  kaelOrbCustomerHeaderActionsOpen: {
    backgroundColor: 'rgba(246,255,252,0.98)',
    borderColor: 'rgba(15,174,155,0.3)',
  },
  kaelOrbCustomerSessionTrigger: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 21,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  kaelOrbCustomerSessionTriggerOpen: {
    backgroundColor: 'rgba(224,249,243,0.82)',
  },
  kaelOrbCustomerSessionTriggerPressedReduced: {
    opacity: 0.78,
  },
  kaelOrbCustomerModeTrigger: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 21,
    flexDirection: 'row',
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    width: 112,
  },
  kaelOrbCustomerModeTriggerOpen: {
    backgroundColor: 'rgba(224,249,243,0.72)',
  },
  kaelOrbCustomerModeTriggerText: {
    color: color.text.strong,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
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
    fontSize: 12.5,
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
    boxShadow: '0 14px 16px rgba(8,125,114,0.24)',
  },
  kaelOrbSendButtonDisabled: {
    backgroundColor: 'rgba(133,154,148,0.38)',
    boxShadow: 'none',
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
    lineHeight: 16,
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
})
