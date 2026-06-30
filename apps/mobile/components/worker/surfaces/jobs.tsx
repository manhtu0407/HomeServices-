import { buildWorkerBroadcastBrief, isAcceptedLocalWorkerDeal, localizedWorkerAreaLabel } from './chat-helpers'
import { workerActionCopy } from './copy'
import { styles } from './styles'
import { workerDiagnosisSurface, workerJobCardSurface, workerJobsSegmentCrispShell, workerJobsSegmentLiquidSurface, workerJobsSegmentRefraction, workerJobsSegmentTopEdge, workerSecondaryButtonSurface } from './surface-styles/glass-earnings'
import { workerJobsSectionBottomLens, workerJobsSectionCrispShell, workerJobsSectionReflection, workerJobsSectionTopEdge, workerJobsSectionWash } from './surface-styles/home-jobs'
import { workerHasReducedGlass } from './theme'
import { type WorkerIconName, type WorkerJobsTab, type WorkerLanguageMode, type WorkerTone } from './types'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { GlassSurface } from '@/components/ui/glass-surface'
import { motionTokens } from '@/components/ui/motion-tokens'
import { ReduceMotionAwareEntranceView } from '@/components/ui/reduce-motion-aware-animation'
import { localizedProblemLabel, localizedServiceLabel, localizedStatusLabel, useAppLanguage } from '@/lib/app-language'
import { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { useServiceWorkflow } from '@/lib/use-service-workflow'
import { hasLocalDealCompletionEvidence, type LocalDealStatus, orderWorkflowPhaseSectionsForSummary, workflowEventLabel, type WorkflowPhaseContext, workflowSourceOfTruthLabel } from '@nestscout/shared'
import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { type ReactNode, useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { IncomingRequestSheet, JobRoomMetaCell, getNextWorkerAction, selectWorkerPhasePrimarySection, useWorkerArrivalCheckIn, workerPhaseGateLabel, workerStatusForAction } from './job-offer'
import { WorkerNeedsInlineEmptyCard, WorkerNeedsReviewCard, workerWorkflowSectionSummary } from './jobs-needs'
import { CompactWorkerPresenceMap } from './map'
import { WorkerFrame } from './shell'
import { LiquidSharpKeyline, PressButton, WorkerJobsCardChrome, WorkerUtilityIcon, defaultWorkerJobsTab, getWorkerVisibleDeal, kaelHead, useWorkerFrameCopy, useWorkerUi } from './ui'

const workerJobsTabKeys: WorkerJobsTab[] = ['waiting', 'active', 'needs']

function isWorkerJobsTab(value: unknown): value is WorkerJobsTab {
  return typeof value === 'string' && workerJobsTabKeys.includes(value as WorkerJobsTab)
}

export function WorkerJobsSurface() {
  const copy = useWorkerFrameCopy()
  const language = useAppLanguage()
  const params = useLocalSearchParams<{ tab?: string }>()
  const { replace } = useRouter()
  const { selectors, state } = useFrontendWorkflow()
  const requestedTab = isWorkerJobsTab(params.tab) ? params.tab : defaultWorkerJobsTab
  const activeJobsTab = requestedTab
  const deal = getWorkerVisibleDeal(state.deal)
  const jobTitle = deal ? localizedServiceLabel(deal.draft.serviceType, language) : copy.jobs.emptyTitle
  const hiddenAddressLabel = workerActionCopy[language].hiddenAddress
  const visibleArea = deal?.broadcast?.generalArea ?? deal?.draft.districtLabel
  const jobAreaLabel = visibleArea ? localizedWorkerAreaLabel(visibleArea, language) : hiddenAddressLabel
  const fullJobAddressSource = selectors.canWorkerSeeFullAddress && deal?.broadcast?.fullAddressVisible && deal.broadcast.fullAddressLabel ? deal.broadcast.fullAddressLabel : null
  const fullJobAddressLabel = fullJobAddressSource ? localizedWorkerAreaLabel(fullJobAddressSource, language) : null
  const jobVisibleAreaLabel = fullJobAddressLabel ?? jobAreaLabel
  const jobBody = deal
    ? `${localizedProblemLabel(deal.draft.problemChips[0], deal.draft.serviceType, language)} · ${jobVisibleAreaLabel}`
    : copy.jobs.emptyBody
  const activeJobBriefLines = deal?.broadcast ? buildWorkerBroadcastBrief(deal, deal.broadcast, selectors.currentStatus, language, selectors.canWorkerSeeFullAddress) : []
  const workflow = useServiceWorkflow({
    status: selectors.currentBackendStatus,
    hasAiNotes: Boolean(deal?.estimate?.advisory),
    hasCompletionEvidence: hasLocalDealCompletionEvidence(deal),
    hasCustomerInput: Boolean(deal),
    hasEstimate: Boolean(deal?.estimate),
    hasScopeChange: Boolean(deal?.scopeChange),
  })
  const showScopeChangeCard = Boolean(deal && workflow.artifacts.scope_change.mode === 'review')
  const showCompletionEvidenceCard = Boolean(deal && selectors.currentStatus === 'repairing')
  const hasNeedsAttention = showScopeChangeCard || showCompletionEvidenceCard
  const acceptedJob = isAcceptedLocalWorkerDeal(deal)
  const showAcceptedActionPanel = Boolean(acceptedJob && deal?.broadcast && [
    'inspecting',
    'repairing',
    'scope_change_pending',
  ].includes(selectors.currentStatus ?? ''))
  const activeJobStatus = deal && acceptedJob ? localizedStatusLabel(selectors.currentStatus, language) : copy.jobs.emptyStatus
  const waitingHasRequest = Boolean(deal?.broadcast && !acceptedJob)
  const jobsFrameTitle = activeJobsTab === 'waiting'
    ? copy.jobs.filters[0]
    : activeJobsTab === 'active'
      ? copy.jobs.eyebrow
      : copy.jobs.filters[2]
  const jobsFrameSubtitleFallback = activeJobsTab === 'waiting'
    ? (language === 'en' ? 'New requests around your area' : 'Yêu cầu mới quanh khu vực')
    : activeJobsTab === 'active'
      ? (language === 'en' ? 'Accepted jobs and the next action' : 'Việc đã nhận và bước tiếp theo')
      : (language === 'en' ? 'Blocked work that needs a decision' : 'Việc đang chặn tiến trình')
  const jobsFrameSubtitle = activeJobsTab === 'active' ? copy.jobs.subtitle : jobsFrameSubtitleFallback
  const selectJobsTab = (tab: WorkerJobsTab) => {
    replace(`/(worker)/jobs?tab=${tab}`)
  }

  return (
    <WorkerFrame active="jobs" eyebrow={copy.jobs.title} subtitle={jobsFrameSubtitle} title={jobsFrameTitle} testID="worker-jobs-surface">
      <SegmentFilter activeTab={activeJobsTab} labels={copy.jobs.filters} onTabChange={selectJobsTab} />
      {activeJobsTab === 'waiting' ? (
        <WorkerJobsLiquidSection testID="worker-jobs-waiting-liquid-section">
          <View style={styles.hiddenMarker} testID="worker-jobs-waiting" />
          {waitingHasRequest ? (
            <>
              <CompactWorkerPresenceMap mode="waiting" />
              <WorkerPhaseContextCard phaseContext={workflow.phaseContext} testID="worker-jobs-waiting-phase-context" />
              <IncomingRequestSheet compact material="liquid" />
            </>
          ) : (
            <>
              <CompactWorkerPresenceMap mode="waiting" />
              <WorkerEmptyJobPanel
                body={copy.jobs.waitingEmptyBody}
                icon="clock"
                primaryActionLabel={copy.home.readinessTitle}
                primaryActionPath="/(worker)/home"
                testID="worker-jobs-waiting-empty-card"
                title={copy.jobs.waitingEmptyTitle}
                tone="base"
              />
            </>
          )}
        </WorkerJobsLiquidSection>
      ) : null}
      {activeJobsTab === 'active' ? (
        <WorkerJobsLiquidSection testID="worker-jobs-active-liquid-section">
          {acceptedJob ? (
            <>
              <ActiveWorkerJobCard body={jobBody} briefLines={activeJobBriefLines} status={activeJobStatus} title={jobTitle} />
              <WorkerPhaseContextCard phaseContext={workflow.phaseContext} testID="worker-jobs-active-phase-context" />
              {hasNeedsAttention ? <WorkerNeedsReviewCard /> : <WorkerNeedsInlineEmptyCard />}
            </>
          ) : (
            <>
              <WorkerEmptyJobPanel
                body={copy.jobs.activeEmptyBody}
                icon="tools"
                primaryActionLabel={copy.jobs.filters[0]}
                primaryActionPath="/(worker)/jobs?tab=waiting"
                secondaryActionLabel={copy.home.readinessTitle}
                secondaryActionPath="/(worker)/home"
                showMapPreview
                testID="worker-jobs-active-empty-card"
                title={copy.jobs.activeEmptyTitle}
                tone="base"
              />
              <WorkerNeedsInlineEmptyCard />
            </>
          )}
        </WorkerJobsLiquidSection>
      ) : null}
      {activeJobsTab === 'needs' ? (
        <WorkerJobsLiquidSection testID="worker-jobs-needs-liquid-section">
          {deal ? <WorkerPhaseContextCard phaseContext={workflow.phaseContext} testID="worker-jobs-needs-phase-context" /> : null}
          <WorkerNeedsReviewCard />
          {showAcceptedActionPanel ? (
            <View testID="worker-needs-accepted-action-sheet">
              <IncomingRequestSheet compact material="liquid" />
            </View>
          ) : null}
        </WorkerJobsLiquidSection>
      ) : null}
    </WorkerFrame>
  )
}

function WorkerJobsLiquidSection({ children, testID }: { children: ReactNode; testID: string }) {
  return (
    <ReduceMotionAwareEntranceView delayMs={40} distanceY={10} testID={`${testID}-motion`}>
      <View style={styles.workerJobsLiquidSection} testID={testID}>
        <WorkerJobsSectionBackdrop />
        <View style={styles.workerJobsLiquidContent}>
          {children}
        </View>
      </View>
    </ReduceMotionAwareEntranceView>
  )
}

function WorkerJobsSectionBackdrop() {
  const { tokens } = useWorkerUi()

  if (workerHasReducedGlass(tokens)) {
    return <View pointerEvents="none" style={styles.hiddenMarker} testID="worker-jobs-section-opaque-backdrop" />
  }

  return (
    <>
      <View pointerEvents="none" style={[styles.workerJobsSectionWash, workerJobsSectionWash(tokens)]} testID="worker-jobs-liquid-section-wash" />
      <View pointerEvents="none" style={[styles.workerJobsSectionReflection, workerJobsSectionReflection(tokens)]} testID="worker-jobs-liquid-section-reflection" />
      <View pointerEvents="none" style={[styles.workerJobsSectionBottomLens, workerJobsSectionBottomLens(tokens)]} />
      <View pointerEvents="none" style={[styles.workerJobsSectionCrispShell, workerJobsSectionCrispShell(tokens)]} testID="worker-jobs-section-crisp-shell" />
      <View pointerEvents="none" style={[styles.workerJobsSectionTopEdge, workerJobsSectionTopEdge(tokens)]} />
    </>
  )
}

function WorkerPhaseContextCard({
  phaseContext,
  testID,
}: {
  phaseContext: WorkflowPhaseContext
  testID: string
}) {
  const { language, tokens } = useWorkerUi()
  const visibleSections = orderWorkflowPhaseSectionsForSummary(phaseContext, phaseContext.sections.filter((section) => section.visible && section.role !== 'customer'))
  const primarySection = selectWorkerPhasePrimarySection(phaseContext, visibleSections)
  const primaryArtifact = primarySection?.title[language] ?? (language === 'en' ? 'No live artifact' : 'Chưa có dấu mốc sống')
  const gateLabel = workerPhaseGateLabel(phaseContext, language)
  const nextEvent = phaseContext.nextExpectedEvent
    ? workflowEventLabel(phaseContext.nextExpectedEvent, language)
    : language === 'en'
      ? 'No next event'
      : 'Không có sự kiện kế tiếp'
  const sectionSummary = workerWorkflowSectionSummary(visibleSections, language)

  return (
    <View style={[styles.needsReviewCard, workerJobCardSurface(tokens)]} testID={testID}>
      <WorkerJobsCardChrome />
      <View style={styles.identityRow}>
        <WorkerUtilityIcon active frameSize={48} icon="brief" size={48} style={styles.needsInlineImageIcon} />
        <View style={styles.titleStack}>
          <Text style={[styles.statusPill, { alignSelf: 'flex-start', backgroundColor: tokens.mint, borderColor: tokens.border, borderWidth: 1, color: tokens.primary }]} numberOfLines={1}>
            {workflowSourceOfTruthLabel(phaseContext.sourceOfTruth, language)}
          </Text>
          <Text style={[styles.cardTitle, { color: tokens.ink }]} numberOfLines={2}>
            {phaseContext.title[language]}
          </Text>
        </View>
      </View>
      <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={3}>
        {phaseContext.intent[language]}
      </Text>
      <View style={styles.needsReviewGrid}>
        <JobRoomMetaCell label={language === 'en' ? 'Artifact' : 'Dấu mốc'} value={primaryArtifact} />
        <JobRoomMetaCell label={language === 'en' ? 'Next' : 'Tiếp theo'} value={nextEvent} />
        <JobRoomMetaCell label={language === 'en' ? 'Gate' : 'Cổng'} value={gateLabel} />
        <JobRoomMetaCell label={language === 'en' ? 'Live sections' : 'Mục đang sống'} value={sectionSummary} valueLines={4} />
      </View>
    </View>
  )
}

function ActiveWorkerJobCard({ body, briefLines, status, title }: { body: string; briefLines: string[]; status: string; title: string }) {
  const { actions, selectors } = useFrontendWorkflow()
  const { copy, language, tokens } = useWorkerUi()
  const { replace } = useRouter()
  const confirmArrivalCheckIn = useWorkerArrivalCheckIn()
  const nextAction = selectors.canWorkerAdvance ? getNextWorkerAction(selectors.currentStatus, language) : null
  const nextStatus = nextAction && nextAction.type !== 'worker_complete_job' ? workerStatusForAction(nextAction.type) : null
  const needsCompletionEvidence = nextAction?.type === 'worker_complete_job'

  return (
    <View style={[styles.activeJobCard, workerJobCardSurface(tokens)]} testID="worker-jobs-active-card">
      <WorkerJobsCardChrome />
      <View style={styles.rowBetween}>
        <View style={styles.titleStack}>
          <Text style={[styles.statusPill, { alignSelf: 'flex-start', backgroundColor: tokens.mint, borderColor: tokens.border, borderWidth: 1, color: tokens.primary }]} numberOfLines={1}>
            {status}
          </Text>
          <Text style={[styles.cardTitle, { color: tokens.ink }]} numberOfLines={2}>
            {title}
          </Text>
        </View>
        {nextAction ? (
          <Text style={[styles.statusPill, { backgroundColor: tokens.cream, borderColor: tokens.border, borderWidth: 1, color: tokens.copper, flexShrink: 0, maxWidth: 118, textAlign: 'center' }]} numberOfLines={1} testID="worker-active-next-action-pill">
            {nextAction.label}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={3}>
        {body}
      </Text>
      {briefLines.length > 0 ? (
        <View style={[styles.jobDiagnosisBox, workerDiagnosisSurface(tokens)]} testID="worker-active-job-kael-summary">
          <View style={styles.identityRow}>
            <Image source={kaelHead} style={[styles.kaelMini, { borderColor: tokens.borderStrong }]} />
            <Text style={[styles.kaelBriefTitle, { color: tokens.ink }]} numberOfLines={1}>
              {copy.request.briefTitle}
            </Text>
          </View>
          {briefLines.slice(0, 3).map((line) => (
            <View key={line} style={styles.briefItem}>
              <View style={[styles.briefDot, { backgroundColor: tokens.primary }]} />
              <Text style={[styles.briefText, { color: tokens.muted }]} numberOfLines={2}>
                {line}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      <CompactWorkerPresenceMap mode="active" />
      <View style={styles.actionRow}>
        <PressButton label={copy.jobs.jobRoomCta} onPress={() => replace('/(worker)/chat')} testID="worker-jobs-open-jobroom" />
        {nextAction && nextStatus ? (
          <PressButton
            secondary
            label={nextAction.label}
            onPress={() => {
              if (nextAction.type === 'worker_mark_arrived') {
                confirmArrivalCheckIn()
                return
              }
              void actions.workerUpdateStatus(nextStatus)
            }}
            testID="worker-jobs-next-status-action"
          />
        ) : null}
        {needsCompletionEvidence ? (
          <PressButton secondary label={nextAction.label} onPress={() => replace('/(worker)/jobs?tab=needs')} testID="worker-jobs-completion-evidence-route" />
        ) : null}
      </View>
    </View>
  )
}

function getWorkerTimeline(status: LocalDealStatus | null, language: WorkerLanguageMode) {
  const steps: { label: string; statuses: LocalDealStatus[] }[] = language === 'en' ? [
    { label: 'Waiting request', statuses: ['broadcasting'] },
    { label: 'Accepted', statuses: ['worker_matched'] },
    { label: 'On the way', statuses: ['worker_on_way'] },
    { label: 'Arrived', statuses: ['arrived'] },
    { label: 'Inspecting', statuses: ['inspecting'] },
    { label: 'Repairing', statuses: ['repairing', 'completed_by_worker', 'confirmed_by_customer'] },
  ] : [
    { label: 'Chờ yêu cầu', statuses: ['broadcasting'] },
    { label: 'Đã nhận việc', statuses: ['worker_matched'] },
    { label: 'Di chuyển', statuses: ['worker_on_way'] },
    { label: 'Đến nơi', statuses: ['arrived'] },
    { label: 'Kiểm tra', statuses: ['inspecting'] },
    { label: 'Sửa và hoàn tất', statuses: ['repairing', 'completed_by_worker', 'confirmed_by_customer'] },
  ]
  const activeIndex = status ? Math.max(steps.findIndex((step) => step.statuses.includes(status)), -1) : -1
  return steps.map((step, index) => ({
    label: step.label,
    active: activeIndex >= index,
  }))
}

void getWorkerTimeline

function SegmentFilter({
  activeTab,
  labels,
  onTabChange,
}: {
  activeTab: WorkerJobsTab
  labels: readonly string[]
  onTabChange: (tab: WorkerJobsTab) => void
}) {
  const { tokens } = useWorkerUi()
  const { reduceMotion, reduceTransparency } = useGlassAccessibility()
  const [shellWidth, setShellWidth] = useState(0)
  const activeIndex = Math.max(0, workerJobsTabKeys.indexOf(activeTab))
  const segmentInset = 5
  const segmentGap = 5
  const pillWidth = shellWidth > 0 ? Math.max((shellWidth - segmentInset * 2 - segmentGap * Math.max(labels.length - 1, 0)) / Math.max(labels.length, 1), 0) : 0
  const pillLeft = segmentInset + activeIndex * (pillWidth + segmentGap)
  const segmentProgress = useSharedValue(pillLeft)

  useEffect(() => {
    if (reduceMotion) {
      segmentProgress.value = pillLeft
      return
    }
    segmentProgress.value = withSpring(pillLeft, motionTokens.liquid.pill)
  }, [pillLeft, reduceMotion, segmentProgress])

  const liquidSegmentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: segmentProgress.value }],
  }), [segmentProgress])

  return (
    <GlassSurface
      material="liquid"
      mode={tokens.mode}
      onLayout={(event) => {
        const nextWidth = event.nativeEvent.layout.width
        setShellWidth((current) => Math.abs(current - nextWidth) > 0.5 ? nextWidth : current)
      }}
      style={[styles.segmentShell, workerJobsSegmentLiquidSurface(tokens)]}
      testID="worker-activity-filter-pattern"
      variant="control"
    >
      <View style={styles.hiddenMarker} testID="worker-jobs-segment-opaque-shell" />
      <View style={styles.hiddenMarker} testID="worker-jobs-liquid-segment-selection" />
      {!reduceTransparency ? <LiquidSharpKeyline variant="panel" /> : null}
      {!reduceTransparency ? <View pointerEvents="none" style={[styles.workerJobsSegmentRefraction, workerJobsSegmentRefraction(tokens)]} /> : null}
      {!reduceTransparency ? <View pointerEvents="none" style={[styles.workerJobsSegmentCrispShell, workerJobsSegmentCrispShell(tokens)]} testID="worker-jobs-segment-crisp-shell" /> : null}
      {!reduceTransparency ? <View pointerEvents="none" style={[styles.workerJobsSegmentTopEdge, workerJobsSegmentTopEdge(tokens)]} /> : null}
      {pillWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.segmentLiquidPill,
            {
              backgroundColor: reduceTransparency ? tokens.mint : tokens.mode === 'dark' ? 'rgba(24,56,50,0.72)' : 'rgba(197,253,239,0.96)',
              borderColor: tokens.mode === 'dark' ? 'rgba(230,244,240,0.15)' : 'rgba(8,120,110,0.10)',
              borderWidth: 1,
              boxShadow: reduceTransparency ? 'none' : tokens.mode === 'dark' ? 'inset 0 1px 0 rgba(255,255,255,0.12)' : 'inset 0 1px 0 rgba(255,255,255,0.90), 0 10px 22px rgba(14,141,124,0.12)',
              width: pillWidth,
            } as any,
            liquidSegmentStyle,
          ]}
        >
          {!reduceTransparency ? <View style={[styles.segmentLiquidSheen, { backgroundColor: tokens.glassHighlight }]} /> : null}
        </Animated.View>
      ) : null}
      {labels.map((item, index) => {
        const tab = workerJobsTabKeys[index] ?? 'waiting'
        const selected = tab === activeTab
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={item}
            onPress={() => onTabChange(tab)}
            style={({ pressed }) => [
              styles.segmentPill,
              pressed ? styles.pressed : null,
            ]}
            testID={`worker-jobs-segment-${tab}`}
          >
            <Text style={[styles.segmentText, { color: selected ? tokens.primary : tokens.muted }]} numberOfLines={1}>
              {item}
            </Text>
          </Pressable>
        )
      })}
    </GlassSurface>
  )
}

function WorkerEmptyJobPanel({
  body,
  icon,
  primaryActionLabel,
  primaryActionPath,
  secondaryActionLabel,
  secondaryActionPath,
  showMapPreview = false,
  testID,
  title,
  tone,
}: {
  body: string
  icon: WorkerIconName
  primaryActionLabel?: string
  primaryActionPath?: '/(worker)/home' | '/(worker)/jobs?tab=waiting' | '/(worker)/chat'
  secondaryActionLabel?: string
  secondaryActionPath?: '/(worker)/home' | '/(worker)/jobs?tab=waiting' | '/(worker)/chat'
  showMapPreview?: boolean
  testID?: string
  title: string
  tone: WorkerTone
}) {
  const { language, tokens } = useWorkerUi()
  const { replace } = useRouter()

  return (
    <View style={[styles.activeJobCard, workerJobCardSurface(tokens, tone)]} testID={testID}>
      <WorkerJobsCardChrome tone={tone} />
      <View style={styles.jobTop}>
        <View style={styles.identityRow}>
          <WorkerUtilityIcon active frameSize={46} icon={icon} size={46} small style={styles.jobPanelImageIcon} />
          <View style={styles.titleStack}>
            <Text adjustsFontSizeToFit minimumFontScale={0.8} numberOfLines={2} style={[styles.cardTitle, { color: tokens.ink }]}>
              {title}
            </Text>
          </View>
        </View>
      </View>
      <View style={[styles.jobDiagnosisBox, workerDiagnosisSurface(tokens)]} testID={`${testID ?? 'worker-empty-job'}-brief`}>
        <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={3}>
          {body}
        </Text>
      </View>
      {showMapPreview ? <CompactWorkerPresenceMap density="dense" mode="active" /> : null}
      {primaryActionLabel && primaryActionPath ? (
        <View style={styles.actionRow}>
          <PressButton label={primaryActionLabel} onPress={() => replace(primaryActionPath)} testID={`${testID ?? 'worker-empty-job'}-primary-action`} />
          {secondaryActionLabel && secondaryActionPath ? (
            <PressButton secondary label={secondaryActionLabel} onPress={() => replace(secondaryActionPath)} testID={`${testID ?? 'worker-empty-job'}-secondary-action`} />
          ) : (
            <View style={[styles.emptyActionPill, workerSecondaryButtonSurface(tokens)]}>
              <Text adjustsFontSizeToFit minimumFontScale={0.84} numberOfLines={1} style={[styles.pressButtonTextSecondary, { color: tokens.primary }]}>
                {language === 'en' ? 'No request yet' : 'Chưa có yêu cầu'}
              </Text>
            </View>
          )}
        </View>
      ) : null}
    </View>
  )
}
