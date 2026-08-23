import { useMemo, useState , useEffect, useRef } from 'react'
import { Image } from 'expo-image'
import {
  Pressable,
  ScrollView,
  Text as RNText,
  View,
  useWindowDimensions,
  type TextProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { useDockScrollHandler } from '@/components/ui/dock-scroll-state'
import { MintAura } from '@/components/ui/kael-primitives'
import { LiquidBackButton } from '@/components/ui/liquid-back-button'
import type { AppLanguage } from '@/lib/app-language'
import { useAuth } from '@/lib/auth-provider'
import { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import type {
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
  validatedWorkerV5JobId,
  workerV5Routes,
} from './dock/routing'
import {
  WorkerV5ProfileOverviewBody,
  WorkerV5ReliabilityInsightsBody,
  WorkerV5ReviewsFeedbackBody,
  WorkerV5SkillsServiceAreaBody,
  WorkerV5VerificationDocumentsBody,
  WorkerV5WorkerRankingBody,
} from './profile/body-surfaces'
import { useWorkerAvatarPicker } from './profile/use-worker-avatar-picker'
import { workerV5CanReviewOpenOpportunity } from './jobs/acceptance'
import { isWorkerJobsRebuildScreen } from './jobs/worker-jobs-screen-registry'
import { WorkerV5InProgressBody } from './jobs/in-progress-surfaces'
import {
  WorkerJobsProductionHost,
} from './jobs/worker-jobs-production-host'
import {
  WorkerV5CommissionPolicyBody,
  WorkerV5EarningsOverviewBody,
  WorkerV5PayoutRequestBody,
  WorkerV5ReceivingAccountBody,
  WorkerV5TransactionHistoryBody,
} from './earnings/body-surfaces'
import { useWorkerV5RoutePreview, type WorkerV5RoutePreviewState } from './jobs/use-worker-route-preview'
import { textByLanguage } from './ui/format'
import {
  workerDocumentSummary,
} from './ui/labels'
import {
  workerV5ProfileDossierIconAssets,
} from './ui/worker-v5-icon-assets'
import {
  WorkerV5CustomerCaseWideMintAura,
  WorkerV5CustomerFulfillmentCanvasAura,
  WorkerV5CustomerZipMintAura,
  WorkerV5EarningsHomeHeroAura,
} from './ui/aura-surfaces'
import {
  WorkerV5NavButton,
  WorkerV5PrimaryActionButton,
} from './ui/primitives-surfaces'
import { styles } from './worker-v5-flow-styles'
import { WorkerV5HomeBody } from './home/screen-surfaces'
import { WorkerHomeRebuildSurface } from './home/worker-home-rebuild-surface'

import { workerV5Icons } from './ui/screen-icons'

import { WorkerV5KaelOrbScreenSurface } from './chat/orb-screen-surfaces'
import { WorkerV5KaelChatBody, WorkerV5KaelJobIntakeBody } from './chat/kael-body-surfaces'

import { workerV5JobsDestinationScreenId } from './ui/screen-navigation'
import { WorkerV5AgentMemoryBody } from './profile/agent-memory-surfaces'
import { WorkerV5SettingsBody } from './profile/settings-body-surfaces'
import { WorkerV5ScheduleBody } from './profile/schedule-surfaces'
import {
  WorkerV5NotificationsBody,
  WorkerV5PoliciesBody,
  WorkerV5SupportBody,
} from './profile/settings-utility-surfaces'
import { WorkerV5ServiceAreaMapCard } from './profile/service-area-map-surfaces'
import { workerV5CaseHeaderSubtitle, workerV5OfferHeaderSubtitle, workerV5TravelHeaderSubtitle } from './jobs/header-copy'
import { WorkerV5ProfileProductionSurface } from './profile/production-overview-surfaces'
import { WorkerV5DeleteAccountBody } from './profile/delete-account-surfaces'
import { useWorkerThemeMode } from './worker-theme'
import type { WorkerV5Runtime } from './worker-v5-runtime'

export type { WorkerDockActive } from './dock/types'
export type { WorkerV5Runtime } from './worker-v5-runtime'

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
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
  const routeJobIdParam = firstRouteParam(params.job_id)
  const routeLanguage = firstRouteParam(params.ns_worker_lang)
  const prototype = firstRouteParam(params.ns_worker_prototype)
  const workerStage = firstRouteParam(params.ns_worker_stage)
  const workerKaelReturnTarget = firstRouteParam(params.ns_worker_return_to)
  const screenId = screen.id
  const screenPrimaryNext = screen.primaryNext
  const onDockScroll = useDockScrollHandler()
  const router = useRouter()
  const { session, signOut } = useAuth()
  const runtime = useFrontendWorkflow()
  const routeJobId = validatedWorkerV5JobId(routeJobIdParam)
  const currentJobId = runtime.state.deal?.broadcast?.jobId ?? runtime.state.deal?.id
  const workerRouteContext = useMemo(() => ({
    job_id: routeJobId ?? currentJobId,
    ns_audit_role: auditRole,
    ns_worker_lang: routeLanguage,
    ns_worker_prototype: prototype,
    ns_worker_stage: workerStage,
  }), [auditRole, currentJobId, prototype, routeJobId, routeLanguage, workerStage])
  const [actionBusy, setActionBusy] = useState(false)
  const actionBusyRef = useRef(false)
  const { height } = useWindowDimensions()
  const glass = useGlassAccessibility()
  const workerThemeMode = useWorkerThemeMode()
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
  const surfaceStyle = workerThemeMode === 'dark'
    ? styles.surfaceDark
    : screen.id === '5.3-skills-service-area' || glass.reduceTransparency ? styles.surfaceSolid : styles.surfaceGlass
  const shouldShowWorkerAura = !glass.reduceTransparency && workerThemeMode === 'light'
  const usesOpportunityInboxHandoff = screen.id === '2.1-opportunity-inbox'
  const usesOfferDetailHandoff = screen.id === '2.2-offer-detail'
  const usesCustomerConfirmationWaitHandoff = screen.id === '2.3-customer-confirmation-wait'
  const usesRouteEtaHandoff = screen.id === '2.4-route-eta'
  const routePreview = useWorkerV5RoutePreview(runtime.state.deal, usesRouteEtaHandoff)
  const usesTravelHandoff = usesRouteEtaHandoff
  const usesInProgressHandoff = screen.id === '2.7-in-progress'
  const usesEarningsDetailHandoff = screen.id === '4.2-ledger-detail'
    || screen.id === '4.3-payout-request'
    || screen.id === '4.4-payout-method'
    || screen.id === '4.5-commission-policy'
  const headerBackScreen = usesEarningsDetailHandoff
    ? getWorkerV5Screen('4.1-earnings-overview') ?? previousScreen
    : usesCustomerConfirmationWaitHandoff || usesRouteEtaHandoff || usesInProgressHandoff
      ? getWorkerV5Screen('2.1-opportunity-inbox') ?? previousScreen
      : previousScreen
  const usesScopeChangeHandoff = screen.id === '2.8-scope-change'
  const usesApprovalWaitHandoff = screen.id === '2.9-approval-wait'
  const usesCompletionEvidenceHandoff = screen.id === '2.10-completion-evidence'
  const usesCompletionSubmittedHandoff = screen.id === '2.11-completion-submitted'
  const usesCaseClosedHandoff = screen.id === '2.12-case-closed'
  const usesKaelOrbHandoff = screen.id === '3.1-kael-chat-normal' || screen.id === '3.2-kael-job-intake'
  const usesEarningsHandoff = screen.id === '4.1-earnings-overview' || screen.id === '4.2-ledger-detail' || screen.id === '4.3-payout-request' || screen.id === '4.4-payout-method' || screen.id === '4.5-commission-policy'
  const usesEarningsOverviewHandoff = screen.id === '4.1-earnings-overview'
  const usesProfileHandoff = screen.id === '5.1-profile-overview' || screen.id === '5.15-worker-delete-account' || screen.id === '5.2-worker-ranking' || screen.id === '5.3-skills-service-area' || screen.id === '5.4-reliability-insights' || screen.id === '5.5-account-utilities' || screen.id === '5.6-agent-memory-preferences' || screen.id === '5.7-verification-documents' || screen.id === '5.9-reviews-feedback' || screen.id === '5.10-support-settings' || screen.id === '5.11-worker-availability' || screen.id === '5.12-worker-notifications' || screen.id === '5.13-worker-support' || screen.id === '5.14-worker-policies'
  const hidesHeaderUtility = usesProfileHandoff
  const usesCaseExecutionHandoff = usesCustomerConfirmationWaitHandoff || usesInProgressHandoff || usesScopeChangeHandoff || usesApprovalWaitHandoff || usesCompletionEvidenceHandoff || usesCompletionSubmittedHandoff || usesCaseClosedHandoff
  const usesHandoffStage = usesOpportunityInboxHandoff || usesOfferDetailHandoff || usesTravelHandoff || usesCaseExecutionHandoff || usesKaelOrbHandoff || usesEarningsHandoff || usesProfileHandoff
  const handoffHeaderSubtitle = usesOpportunityInboxHandoff
    ? null
    : usesEarningsHandoff
      ? null
    : screen.id === '5.4-reliability-insights'
      ? null
    : screen.id === '5.5-account-utilities' || screen.id === '5.10-support-settings' || screen.id === '5.15-worker-delete-account'
      ? null
    : screen.id === '5.11-worker-availability'
      ? null
    : screen.id === '5.12-worker-notifications'
      ? textByLanguage(language, 'Các cập nhật đã ghi nhận trong ứng dụng', 'Recorded updates in the app')
    : screen.id === '5.13-worker-support'
      ? textByLanguage(language, 'Chọn đúng nơi để xem công việc hoặc hỏi Kael', 'Choose where to review work or ask Kael')
    : screen.id === '5.14-worker-policies'
      ? textByLanguage(language, 'Quy định rõ ràng khi nhận và thực hiện công việc', 'Clear rules for accepting and completing work')
    : screen.id === '5.6-agent-memory-preferences'
      ? null
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
    : screen.id === '5.3-skills-service-area'
      ? textByLanguage(language, 'Dịch vụ chuyên môn', 'Professional services')
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
  const openSupportKaelChat = () => router.replace(`/(worker)/chat?ns_worker_screen=3.1-kael-chat-normal&ns_worker_lang=${language}&ns_worker_return_to=worker-support` as never)
  const openActiveJobKaelChat = () => router.replace('/(worker)/chat?ns_worker_screen=3.2-kael-job-intake' as never)
  const runWorkerAction = async (
    action: () => Promise<boolean>,
    { navigateOnSuccess = true }: { navigateOnSuccess?: boolean } = {},
  ) => {
    if (actionBusyRef.current) return
    actionBusyRef.current = true
    setActionBusy(true)
    try {
      const ok = await action()
      if (ok && navigateOnSuccess) openScreen(nextScreen)
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
  const primaryAction = getWorkerV5PrimaryAction(screen, runtime, language, actionBusy, () => openScreen(nextScreen))
  const handlePrimaryAction = () => {
    if (!primaryAction) return
    if (primaryAction.workerAction) {
      void runWorkerAction(primaryAction.workerAction)
      return
    }
    primaryAction.onPress()
  }
  const workflowDestinationScreenId = workerV5JobsDestinationScreenId(runtime.state.deal)
  const workflowStatus = runtime.state.deal?.backendStatus ?? runtime.state.deal?.status ?? null
  const workflowHydrationPending = runtime.state.workerGate === 'backend_pending' && !runtime.workerJobsHydrated
  const currentProposalAction = runtime.workerProposalOpportunity
    && runtime.workerProposalOpportunity.broadcastId === runtime.state.deal?.broadcast?.broadcastId
    ? runtime.workerProposalOpportunity.proposalAction
    : null
  const screenRedirectId = workflowHydrationPending
    ? null
    : usesOfferDetailHandoff && !workerV5CanReviewOpenOpportunity(
        runtime.state.deal,
        runtime.state.workerGate,
        currentProposalAction,
      )
      ? workflowDestinationScreenId
      : usesCustomerConfirmationWaitHandoff && workflowDestinationScreenId !== '2.3-customer-confirmation-wait'
        ? workflowDestinationScreenId
      : usesApprovalWaitHandoff && workflowDestinationScreenId !== '2.9-approval-wait'
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
    if (!routeJobId || currentJobId === routeJobId) return
    void runtime.actions.hydrateRemoteJobById(routeJobId)
  }, [currentJobId, routeJobId, runtime.actions])

  useEffect(() => {
    if (!screenRedirectId) return
    router.replace(routeForWorkerV5Screen(requireWorkerV5Screen(screenRedirectId), workerRouteContext) as never)
  }, [router, screenRedirectId, workerRouteContext])

  if (screenRedirectId) return null

  if (screen.id === '5.1-profile-overview') {
    return (
      <WorkerV5ProfileProductionSurface
        avatarUploadBusy={avatarUploadBusy}
        insights={runtime.workerPerformanceInsights}
        language={language}
        navigateToScreen={openScreenById}
        onPickAvatar={openWorkerAvatarPicker}
        onSignOut={() => void signOut()}
        profile={runtime.workerProfile}
      />
    )
  }

  if (usesKaelOrbHandoff) {
    return (
      <WorkerV5KaelOrbScreenSurface
        deal={runtime.state.deal}
        language={language}
        mode={screen.id === '3.2-kael-job-intake' ? 'intake' : 'normal'}
        onBack={workerKaelReturnTarget === 'worker-support' ? () => openScreenById('5.13-worker-support') : undefined}
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
      <WorkerHomeRebuildSurface
        avatarUploadBusy={avatarUploadBusy}
        glass={glass}
        language={language}
        minHeight={minHeight}
        onPickAvatar={openWorkerAvatarPicker}
        openScreen={openScreen}
        runtime={runtime}
        surfaceStyle={surfaceStyle}
        themeMode={workerThemeMode}
      />
    )
  }

  const handleHeaderBack = () => {
    if (usesOfferDetailHandoff || usesTravelHandoff || usesCaseExecutionHandoff || usesEarningsHandoff) {
      openScreen(headerBackScreen)
      return
    }
    router.replace(workerV5Routes[screen.section] as never)
  }
  const openOfferMenu = () => {
    openScreen(WORKER_V5_SCREENS.find((candidate) => candidate.id === '3.2-kael-job-intake') ?? nextScreen)
  }

  return <WorkerV5ScreenLayout
    actions={{
      handlePrimaryAction,
      navigateActiveJobChat: openActiveJobKaelChat,
      navigateNext: () => openScreen(nextScreen),
      navigatePrevious: () => openScreen(previousScreen),
      navigateSupportKael: openSupportKaelChat,
      navigateToJob: (jobId) => router.replace(`/(worker)/jobs?job_id=${encodeURIComponent(jobId)}` as never),
      navigateToJobs: () => router.replace('/(worker)/jobs' as never),
      navigateToScreen: openScreenById,
      onDockScroll,
      onHeaderBack: handleHeaderBack,
      onOpenJobChat: openJobChat,
      onOpenOfferMenu: openOfferMenu,
      onSignOut: () => void signOut(),
      openWorkerAvatarPicker,
      runRouteAction,
      runWorkerAction,
    }}
    state={{
      auraState: { formulaPageAuraTarget, reduceTransparency: glass.reduceTransparency, shouldShowWorkerAura, usesCaseExecutionHandoff, usesEarningsHandoff, usesInProgressHandoff, usesKaelOrbHandoff, usesOfferDetailHandoff, usesOpportunityInboxHandoff, usesProfileHandoff, usesRouteEtaHandoff },
      content: { accessToken: session?.access_token ?? null, actionBusy, avatarUploadBusy, language, minHeight, primaryAction, prototype, reduceMotion: glass.reduceMotion, reduceTransparency: glass.reduceTransparency, routePreview, runtime, screen, surfaceStyle, usesCaseExecutionHandoff, usesEarningsHandoff, usesHandoffStage, usesKaelOrbHandoff, usesOfferDetailHandoff, usesOpportunityInboxHandoff, usesTravelHandoff, workerKey: session?.user.id ?? 'guest-worker' },
      headerState: { displayTitle, handoffHeaderSubtitle, hidesHeaderUtility, language, reduceMotion: glass.reduceMotion, screen, title, usesApprovalWaitHandoff, usesCaseClosedHandoff, usesCaseExecutionHandoff, usesEarningsHandoff, usesEarningsOverviewHandoff, usesKaelOrbHandoff, usesOfferDetailHandoff, usesOpportunityInboxHandoff, usesProfileHandoff, usesRouteEtaHandoff, usesTravelHandoff, workerThemeMode },
      nextScreen,
      previousScreen,
    }}
  />
}

type WorkerV5ScreenAuraState = {
  formulaPageAuraTarget: { scope: string; testID: string }
  reduceTransparency: boolean
  shouldShowWorkerAura: boolean
  usesCaseExecutionHandoff: boolean
  usesEarningsHandoff: boolean
  usesInProgressHandoff: boolean
  usesKaelOrbHandoff: boolean
  usesOfferDetailHandoff: boolean
  usesOpportunityInboxHandoff: boolean
  usesProfileHandoff: boolean
  usesRouteEtaHandoff: boolean
}

function WorkerV5ScreenAuras({ state }: { state: WorkerV5ScreenAuraState }) {
  const {
    formulaPageAuraTarget,
    reduceTransparency,
    shouldShowWorkerAura,
    usesCaseExecutionHandoff,
    usesEarningsHandoff,
    usesInProgressHandoff,
    usesKaelOrbHandoff,
    usesOfferDetailHandoff,
    usesOpportunityInboxHandoff,
    usesProfileHandoff,
    usesRouteEtaHandoff,
  } = state
  const showPageAura = shouldShowWorkerAura && !usesProfileHandoff && !usesEarningsHandoff

  return <>
    {showPageAura ? <WorkerV5CustomerFulfillmentCanvasAura reduceTransparency={reduceTransparency} scope={formulaPageAuraTarget.scope} testID={formulaPageAuraTarget.testID} /> : null}
    {usesOpportunityInboxHandoff && shouldShowWorkerAura ? <WorkerV5CustomerZipMintAura scope="OpportunityInboxPageFine" style={styles.opportunityInboxPageZipAura} testID="worker-v5-opportunity-page-customer-zip-mint-aura" /> : null}
    {usesOfferDetailHandoff && shouldShowWorkerAura ? <WorkerV5CustomerZipMintAura scope="OfferDetailPageFine" style={styles.offerDetailPageZipAura} testID="worker-v5-offer-page-customer-zip-mint-aura" /> : null}
    {usesRouteEtaHandoff && shouldShowWorkerAura ? <WorkerV5CustomerZipMintAura scope="RouteEtaPageFine" style={styles.routeEtaPageZipAura} testID="worker-v5-route-page-customer-zip-mint-aura" /> : null}
    {usesCaseExecutionHandoff && !usesInProgressHandoff && shouldShowWorkerAura ? <WorkerV5CustomerZipMintAura scope="WorkerCaseExecutionPageFine" style={styles.arrivalCheckinPageZipAura} testID="worker-v5-case-flow-page-customer-zip-mint-aura" /> : null}
    {usesCaseExecutionHandoff && !usesInProgressHandoff && shouldShowWorkerAura ? <WorkerV5CustomerCaseWideMintAura scope="WorkerCaseExecutionPageLower" style={styles.caseFlowPageLowerAura} testID="worker-v5-case-flow-page-lower-mint-aura" /> : null}
    {usesKaelOrbHandoff && shouldShowWorkerAura ? <WorkerV5CustomerZipMintAura scope="KaelOrbPageFine" style={styles.kaelOrbPageZipAura} testID="worker-v5-kael-orb-page-zip-mint-aura" /> : null}
    {usesOfferDetailHandoff && shouldShowWorkerAura ? <WorkerV5CustomerCaseWideMintAura scope="OfferDetailPageLower" style={styles.offerDetailPageLowerAura} testID="worker-v5-offer-page-lower-mint-aura" /> : null}
  </>
}

type WorkerV5ScreenHeaderState = {
  displayTitle: string
  handoffHeaderSubtitle: string | null
  hidesHeaderUtility: boolean
  language: AppLanguage
  reduceMotion: boolean
  screen: WorkerV5ScreenDefinition
  title: string
  usesApprovalWaitHandoff: boolean
  usesCaseClosedHandoff: boolean
  usesCaseExecutionHandoff: boolean
  usesEarningsHandoff: boolean
  usesEarningsOverviewHandoff: boolean
  usesKaelOrbHandoff: boolean
  usesOfferDetailHandoff: boolean
  usesOpportunityInboxHandoff: boolean
  usesProfileHandoff: boolean
  usesRouteEtaHandoff: boolean
  usesTravelHandoff: boolean
  workerThemeMode: 'dark' | 'light'
}

function WorkerV5ScreenHeader({
  onBack,
  onOpenJobChat,
  onOpenOfferMenu,
  state,
}: {
  onBack: () => void
  onOpenJobChat: () => void
  onOpenOfferMenu: () => void
  state: WorkerV5ScreenHeaderState
}) {
  const {
    displayTitle,
    handoffHeaderSubtitle,
    hidesHeaderUtility,
    language,
    reduceMotion,
    screen,
    title,
    usesApprovalWaitHandoff,
    usesCaseClosedHandoff,
    usesCaseExecutionHandoff,
    usesEarningsHandoff,
    usesEarningsOverviewHandoff,
    usesKaelOrbHandoff,
    usesOfferDetailHandoff,
    usesOpportunityInboxHandoff,
    usesProfileHandoff,
    usesRouteEtaHandoff,
    usesTravelHandoff,
    workerThemeMode,
  } = state
  const usesHandoffHeading = usesKaelOrbHandoff || usesOpportunityInboxHandoff || usesOfferDetailHandoff || usesTravelHandoff || usesCaseExecutionHandoff || usesEarningsHandoff || usesProfileHandoff
  const showPlainTitle = !usesOpportunityInboxHandoff && !usesOfferDetailHandoff && !usesTravelHandoff && !usesCaseExecutionHandoff && !usesKaelOrbHandoff && !usesEarningsHandoff && !usesProfileHandoff

  return <View style={[styles.headerRow, usesKaelOrbHandoff ? styles.kaelOrbCustomerHeaderRow : null, usesEarningsOverviewHandoff ? styles.earningsOverviewHeaderRow : null]}>
    {usesOpportunityInboxHandoff || usesEarningsOverviewHandoff || screen.id === '5.1-profile-overview' ? null : (
      <LiquidBackButton
        label={language === 'vi' ? 'Quay lại worker hiện tại' : 'Back to current worker surface'}
        mode={workerThemeMode}
        onPress={onBack}
        testID="worker-v5-back"
      />
    )}
    <View style={styles.headerTextColumn}>
      {usesCaseClosedHandoff ? null : usesHandoffHeading ? (
        <>
          <Text
            style={[
              styles.titleText,
              workerThemeMode === 'dark' ? styles.titleTextDark : null,
              usesKaelOrbHandoff ? styles.kaelOrbCustomerHeaderTitle : null,
              usesEarningsOverviewHandoff ? styles.earningsOverviewTitle : null,
            ]}
            testID={usesEarningsOverviewHandoff ? 'worker-v5-earnings-overview-title' : undefined}
          >
            {displayTitle}
          </Text>
          {handoffHeaderSubtitle ? <Text style={[styles.headerSubtitleText, workerThemeMode === 'dark' ? styles.headerSubtitleTextDark : null]} numberOfLines={2}>{handoffHeaderSubtitle}</Text> : null}
        </>
      ) : <Text style={[styles.phaseText, workerThemeMode === 'dark' ? styles.phaseTextDark : null]}>{phaseCopy[screen.phase][language]}</Text>}
      {showPlainTitle ? <Text style={[styles.titleText, workerThemeMode === 'dark' ? styles.titleTextDark : null]}>{title}</Text> : null}
    </View>
    {usesOpportunityInboxHandoff || usesEarningsOverviewHandoff ? null : usesOfferDetailHandoff ? (
      <Pressable accessibilityLabel={language === 'vi' ? 'Tùy chọn đề nghị' : 'Offer options'} accessibilityRole="button" onPress={onOpenOfferMenu} style={({ pressed }) => [styles.iconButton, pressed && !reduceMotion ? styles.pressed : null]} testID="worker-v5-offer-menu">
        <Text style={styles.headerMenuText}>•••</Text>
      </Pressable>
    ) : usesRouteEtaHandoff ? (
      <Pressable accessibilityLabel={language === 'vi' ? 'Tùy chọn di chuyển' : 'Travel options'} accessibilityRole="button" onPress={onOpenJobChat} style={({ pressed }) => [styles.iconButton, pressed && !reduceMotion ? styles.pressed : null]} testID="worker-v5-route-menu">
        <Text style={styles.headerMenuText}>•••</Text>
      </Pressable>
    ) : usesApprovalWaitHandoff ? (
      <Pressable accessibilityLabel={language === 'vi' ? 'Trợ giúp phê duyệt' : 'Approval help'} accessibilityRole="button" onPress={onOpenJobChat} style={({ pressed }) => [styles.iconButton, pressed && !reduceMotion ? styles.pressed : null]} testID="worker-v5-approval-help">
        <Text style={styles.headerMenuText}>?</Text>
      </Pressable>
    ) : usesCaseExecutionHandoff || usesEarningsHandoff ? null : usesKaelOrbHandoff ? (
      <Pressable accessibilityLabel={language === 'vi' ? 'Tùy chọn Kael' : 'Kael options'} accessibilityRole="button" onPress={onOpenJobChat} style={({ pressed }) => [styles.iconButton, pressed && !reduceMotion ? styles.pressed : null]} testID="worker-v5-kael-menu">
        <Text style={styles.headerMenuText}>•••</Text>
      </Pressable>
    ) : hidesHeaderUtility ? null : (
      <View style={styles.iconBadge} testID={`worker-v5-header-icon-${screen.id}`}>
        <MintAura intensity="iconTile" style={styles.iconTileMintAura} />
        <Image source={workerV5Icons[screen.icon]} style={styles.iconImage} />
      </View>
    )}
  </View>
}

type WorkerV5ScreenLayoutState = {
  auraState: WorkerV5ScreenAuraState
  content: {
    accessToken: string | null
    actionBusy: boolean
    avatarUploadBusy: boolean
    language: AppLanguage
    minHeight: number
    primaryAction: ReturnType<typeof getWorkerV5PrimaryAction>
    prototype?: string
    reduceMotion: boolean
    reduceTransparency: boolean
    routePreview: WorkerV5RoutePreviewState
    runtime: WorkerV5Runtime
    screen: WorkerV5ScreenDefinition
    surfaceStyle: StyleProp<ViewStyle>
    usesCaseExecutionHandoff: boolean
    usesEarningsHandoff: boolean
    usesHandoffStage: boolean
    usesKaelOrbHandoff: boolean
    usesOfferDetailHandoff: boolean
    usesOpportunityInboxHandoff: boolean
    usesTravelHandoff: boolean
    workerKey: string
  }
  headerState: WorkerV5ScreenHeaderState
  nextScreen: WorkerV5ScreenDefinition | null
  previousScreen: WorkerV5ScreenDefinition | null
}

type WorkerV5ScreenLayoutActions = {
  handlePrimaryAction: () => void
  navigateActiveJobChat: () => void
  navigateNext: () => void
  navigatePrevious: () => void
  navigateSupportKael: () => void
  navigateToJob: (jobId: string) => void
  navigateToJobs: () => void
  navigateToScreen: (id: WorkerV5ScreenId) => void
  onDockScroll: ReturnType<typeof useDockScrollHandler>
  onHeaderBack: () => void
  onOpenJobChat: () => void
  onOpenOfferMenu: () => void
  onSignOut: () => void
  openWorkerAvatarPicker: () => void
  runRouteAction: () => void | Promise<void>
  runWorkerAction: (
    action: () => Promise<boolean>,
    options?: { navigateOnSuccess?: boolean },
  ) => void | Promise<void>
}

function WorkerV5ScreenLayout({ actions, state }: { actions: WorkerV5ScreenLayoutActions; state: WorkerV5ScreenLayoutState }) {
  const { auraState, content, headerState, nextScreen, previousScreen } = state
  const {
    accessToken,
    actionBusy,
    avatarUploadBusy,
    language,
    minHeight,
    primaryAction,
    prototype,
    reduceMotion,
    reduceTransparency,
    routePreview,
    runtime,
    screen,
    surfaceStyle,
    usesCaseExecutionHandoff,
    usesEarningsHandoff,
    usesHandoffStage,
    usesKaelOrbHandoff,
    usesOfferDetailHandoff,
    usesOpportunityInboxHandoff,
    usesTravelHandoff,
    workerKey,
  } = content
  return <SafeAreaView style={[styles.safeArea, surfaceStyle]} testID={`worker-v5-screen-${screen.id}`}>
    <WorkerV5ScreenAuras state={auraState} />
    <ScrollView bounces={false} contentContainerStyle={[styles.scrollContent, usesKaelOrbHandoff ? styles.kaelOrbCustomerScrollContent : null, { minHeight }]} onScroll={actions.onDockScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false} testID="worker-v5-scroll">
      <WorkerV5ScreenHeader onBack={actions.onHeaderBack} onOpenJobChat={actions.onOpenJobChat} onOpenOfferMenu={actions.onOpenOfferMenu} state={headerState} />
      {!usesHandoffStage ? <View style={[styles.glassCard, reduceTransparency && styles.opaqueCard]}>
        {!reduceTransparency ? <MintAura intensity="component" style={styles.cardMintAura} testID="worker-v5-hero-mint-aura" /> : null}
        <View pointerEvents="none" style={styles.cardTopHighlight} />
        <View style={styles.heroTopRow}><View style={styles.statusDot} /><Text style={styles.kickerText}>{language === 'vi' ? 'Dữ liệu đã đồng bộ' : 'Synced data'}</Text></View>
        <Text style={styles.heroTitle}>{buildHeroLine(screen, runtime, language)}</Text>
        <Text style={styles.heroBody}>{buildHeroBody(screen, runtime, language)}</Text>
      </View> : null}
      <WorkerV5Body
        key={workerKey}
        actionBusy={actionBusy}
        accessToken={accessToken}
        avatarUploadBusy={avatarUploadBusy}
        language={language}
        navigateActiveJobChat={actions.navigateActiveJobChat}
        navigateJobChat={actions.onOpenJobChat}
        navigateSupportKael={actions.navigateSupportKael}
        navigateNext={actions.navigateNext}
        navigateToScreen={actions.navigateToScreen}
        navigateToJob={actions.navigateToJob}
        navigateToJobs={actions.navigateToJobs}
        openWorkerAvatarPicker={actions.openWorkerAvatarPicker}
        onSignOut={actions.onSignOut}
        prototype={prototype}
        reduceMotion={reduceMotion}
        reduceTransparency={reduceTransparency}
        routePreview={routePreview}
        runRouteAction={actions.runRouteAction}
        runWorkerAction={actions.runWorkerAction}
        runtime={runtime}
        screen={screen}
      />
      {primaryAction && screen.id !== '5.5-account-utilities' && screen.id !== '5.6-agent-memory-preferences' && screen.id !== '5.10-support-settings' && !usesOpportunityInboxHandoff && !usesOfferDetailHandoff && !usesTravelHandoff && !usesCaseExecutionHandoff && !usesKaelOrbHandoff && !usesEarningsHandoff ? <WorkerV5PrimaryActionButton disabled={primaryAction.disabled} label={primaryAction.label} onPress={actions.handlePrimaryAction} variant={usesHandoffStage ? 'source' : 'default'} /> : null}
      {usesHandoffStage ? null : <AuthorityCard screen={screen} language={language} />}
      {usesHandoffStage ? null : <View style={styles.navigationRow}>
        <WorkerV5NavButton disabled={!previousScreen} label={language === 'vi' ? 'Trước' : 'Previous'} onPress={actions.navigatePrevious} />
        <WorkerV5NavButton disabled={!nextScreen} label={nextScreen ? (language === 'vi' ? 'Tiếp tục' : 'Continue') : (language === 'vi' ? 'Chưa có bước tiếp' : 'No next step yet')} onPress={actions.navigateNext} primary />
      </View>}
    </ScrollView>
  </SafeAreaView>
}

function WorkerV5Body({
  accessToken,
  actionBusy,
  avatarUploadBusy,
  language,
  navigateActiveJobChat,
  navigateJobChat,
  navigateSupportKael,
  navigateNext,
  navigateToJob,
  navigateToJobs,
  navigateToScreen,
  openWorkerAvatarPicker,
  onSignOut,
  prototype,
  reduceMotion,
  reduceTransparency,
  routePreview,
  runRouteAction,
  runWorkerAction,
  runtime,
  screen,
}: {
  accessToken: string | null
  actionBusy: boolean
  avatarUploadBusy: boolean
  language: AppLanguage
  navigateActiveJobChat: () => void
  navigateJobChat: () => void
  navigateSupportKael: () => void
  navigateNext: () => void
  navigateToJob: (jobId: string) => void
  navigateToJobs: () => void
  navigateToScreen: (id: WorkerV5ScreenId) => void
  openWorkerAvatarPicker: () => void
  onSignOut: () => void
  prototype?: string
  reduceMotion: boolean
  reduceTransparency: boolean
  routePreview: WorkerV5RoutePreviewState
  runRouteAction: () => void | Promise<void>
  runWorkerAction: (
    action: () => Promise<boolean>,
    options?: { navigateOnSuccess?: boolean },
  ) => void | Promise<void>
  runtime: WorkerV5Runtime
  screen: WorkerV5ScreenDefinition
}) {
  if (screen.section === 'jobs' && screen.id !== '2.7-in-progress' && isWorkerJobsRebuildScreen(screen.id)) return <WorkerJobsProductionHost {...{ actionBusy, language, navigateActiveJobChat, navigateJobChat, navigateNext, navigateToScreen, reduceMotion, reduceTransparency, routePreview, runRouteAction, runWorkerAction, runtime, screen }} />

  switch (screen.id) {
    case '2.7-in-progress':
      return (
        <View testID="worker-v5-rebuilt-in-progress-session">
          <WorkerV5InProgressBody
            actionBusy={actionBusy}
            language={language}
            navigateJobChat={navigateActiveJobChat}
            onTravelAction={() => void runRouteAction()}
            reduceTransparency={reduceTransparency}
            runtime={runtime}
          />
        </View>
      )
    case '1.1-worker-home':
      return <WorkerV5HomeBody language={language} onOpenProfileSetup={() => navigateToScreen('5.7-verification-documents')} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '3.1-kael-chat-normal':
      return <WorkerV5KaelChatBody language={language} navigateToScreen={navigateToScreen} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '3.2-kael-job-intake':
      return <WorkerV5KaelJobIntakeBody language={language} navigateToScreen={navigateToScreen} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '4.1-earnings-overview':
      return (
        <WorkerV5EarningsOverviewBody
          language={language}
          navigateToScreen={navigateToScreen}
          reduceMotion={reduceMotion}
          reduceTransparency={reduceTransparency}
          runtime={runtime}
        />
      )
    case '4.2-ledger-detail':
      return (
        <WorkerV5TransactionHistoryBody
          language={language}
          reduceTransparency={reduceTransparency}
          runtime={runtime}
        />
      )
    case '4.3-payout-request':
      return (
        <WorkerV5PayoutRequestBody
          language={language}
          reduceTransparency={reduceTransparency}
          runtime={runtime}
        />
      )
    case '4.4-payout-method':
      return <WorkerV5ReceivingAccountBody language={language} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '4.5-commission-policy':
      return (
        <WorkerV5CommissionPolicyBody
          language={language}
          reduceTransparency={reduceTransparency}
          runtime={runtime}
        />
      )
    case '5.1-profile-overview':
      return (
        <WorkerV5ProfileOverviewBody
          avatarUploadBusy={avatarUploadBusy}
          dossierIcons={workerV5ProfileDossierIconAssets}
          heroAura={WorkerV5EarningsHomeHeroAura}
          language={language}
          navigateToScreen={navigateToScreen}
          onPickAvatar={openWorkerAvatarPicker}
          onSignOut={onSignOut}
          reduceMotion={reduceMotion}
          reduceTransparency={reduceTransparency}
          runtime={runtime}
        />
      )
    case '5.15-worker-delete-account':
      return (
        <WorkerV5DeleteAccountBody
          accessToken={accessToken}
          language={language}
          onDeleted={onSignOut}
          onReauthenticate={onSignOut}
        />
      )
    case '5.2-worker-ranking':
      return (
        <WorkerV5WorkerRankingBody
          language={language}
          runtime={runtime}
        />
      )
    case '5.3-skills-service-area':
      return (
        <WorkerV5SkillsServiceAreaBody
          language={language}
          reduceTransparency={reduceTransparency}
          runtime={runtime}
          serviceAreaMapCard={WorkerV5ServiceAreaMapCard}
        />
      )
    case '5.4-reliability-insights':
      return (
        <WorkerV5ReliabilityInsightsBody
          language={language}
          runtime={runtime}
        />
      )
    case '5.5-account-utilities':
      return <WorkerV5SettingsBody key={runtime.workerProfile?.id ?? 'worker-settings-loading'} language={language} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '5.6-agent-memory-preferences':
      return <WorkerV5AgentMemoryBody key={runtime.workerProfile?.id ?? 'worker-memory-loading'} language={language} reduceMotion={reduceMotion} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '5.7-verification-documents':
      return (
        <WorkerV5VerificationDocumentsBody
          language={language}
          reduceTransparency={reduceTransparency}
          runtime={runtime}
        />
      )
    case '5.9-reviews-feedback':
      return (
        <WorkerV5ReviewsFeedbackBody
          language={language}
          runtime={runtime}
        />
      )
    case '5.10-support-settings':
      return <WorkerV5SettingsBody key={runtime.workerProfile?.id ?? 'worker-settings-loading'} language={language} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '5.11-worker-availability':
      return <WorkerV5ScheduleBody language={language} onOpenProfileSetup={() => navigateToScreen('5.7-verification-documents')} reduceMotion={reduceMotion} reduceTransparency={reduceTransparency} runtime={runtime} />
    case '5.12-worker-notifications':
      return <WorkerV5NotificationsBody language={language} navigateToJob={navigateToJob} runtime={runtime} />
    case '5.13-worker-support':
      return <WorkerV5SupportBody language={language} navigateToJobs={navigateToJobs} navigateToKael={navigateSupportKael} />
    case '5.14-worker-policies':
      return <WorkerV5PoliciesBody language={language} reduceTransparency={reduceTransparency} />
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
  workerAction?: () => Promise<boolean>
}

function getWorkerV5PrimaryAction(
  screen: WorkerV5ScreenDefinition,
  runtime: WorkerV5Runtime,
  language: AppLanguage,
  busy: boolean,
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
        onPress: () => undefined,
        workerAction: () => runtime.actions.workerUpdateStatus('worker_on_way'),
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
    case '4.3-payout-request':
    case '4.4-payout-method':
    case '4.5-commission-policy':
      return null
    case '5.1-profile-overview':
      return null
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
    case '5.9-reviews-feedback':
      return {
        disabled: busy,
        label: textByLanguage(language, 'Quay lại xếp hạng', 'Back to ranking'),
        onPress: navigateNext,
      }
    case '5.10-support-settings':
    case '5.11-worker-availability':
    case '5.12-worker-notifications':
    case '5.13-worker-support':
    case '5.14-worker-policies':
      return null
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
      return textByLanguage(language, 'Chờ quyết định của khách được cập nhật', 'Waiting for the customer decision to sync')
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
      return runtime.workerEarnings?.available_balance
        ? textByLanguage(language, 'Số dư đã ghi sổ', 'Recorded in-app balance')
        : textByLanguage(language, 'Chưa có số dư thật', 'No real balance yet')
    case '4.2-ledger-detail':
      return textByLanguage(language, 'Các khoản thu đã được ghi nhận', 'Recorded transactions')
    case '4.3-payout-request':
      return runtime.workerEarnings?.available_balance
        ? textByLanguage(language, 'Tạo yêu cầu rút từ số dư đã ghi nhận', 'Request a withdrawal from recorded balance')
        : textByLanguage(language, 'Chưa có số dư thật để rút', 'No recorded balance to withdraw yet')
    case '4.4-payout-method':
      return textByLanguage(language, 'Quản lý tài khoản nhận tiền', 'Manage payout account')
    case '4.5-commission-policy':
      return textByLanguage(language, 'Hiểu rõ mức hoa hồng đang áp dụng', 'Understand the current commission rate')
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
        'Inbox chỉ hiển thị cơ hội Kael đã gửi tới thợ để mở chi tiết.',
        'The inbox shows only opportunities Kael has sent to the worker.',
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
        'Di chuyển được cập nhật qua quy trình để khách nhận đúng tín hiệu, không tự hứa thời gian đến mới.',
        'Travel updates through the workflow so customers get accurate signals without a new ETA promise.',
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
        'Chỉ làm phần phát sinh sau khi khách duyệt trong ứng dụng.',
        'This screen does not approve work; extra work continues only after the customer approves it in the app.',
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
        'Chỉ hiển thị những giao dịch thu nhập đã được ghi nhận.',
        'Only recorded earnings transactions are shown.',
      )
    case '4.3-payout-request':
      return textByLanguage(
        language,
        'Bạn chỉ có thể gửi yêu cầu rút từ số dư đã ghi nhận sau khi tài khoản nhận tiền được xác nhận.',
        'You can request only recorded available balance after the receiving account is verified.',
      )
    case '4.4-payout-method':
      return textByLanguage(
        language,
        'Thông tin ngân hàng chỉ hiện từ hồ sơ thật; thay đổi tài khoản cần xác minh.',
        'Bank data appears only from the real profile; account changes require verification.',
      )
    case '4.5-commission-policy':
      return textByLanguage(
        language,
        'Mức khởi điểm là 15%; bậc cao hơn có thể được áp dụng mức thấp hơn khi đáp ứng điều kiện.',
        'The starting rate is 15%; higher levels may receive a lower rate after meeting the requirements.',
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
        'Bộ nhớ Kael dùng hồ sơ hiện có làm ngữ cảnh và lưu các quyền bạn chọn trong màn này.',
        'Kael memory uses the current profile as context and saves the permissions you choose here.',
      )
    case '5.7-verification-documents':
      return textByLanguage(
        language,
        'Giấy tờ & xác minh phản ánh CCCD, ảnh đại diện, trạng thái duyệt và hồ sơ chuyên môn đã có thật.',
        'Verification documents reflect the real ID, selfie, approval status, and declared skill profile.',
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


