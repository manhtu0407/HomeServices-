import { customerCopy } from './copy'
import { styles } from './styles'
import { customerActivityEdgeHighlightSurface, customerActivityHeroSurface, customerActivityStatusLensSurface, customerActivityTimelineDotSurface, customerActivityTimelinePanelSurface, customerActivityTimelineRailSurface, customerHistoryPanelSurface } from './surface-styles'
import { type CustomerThemeTokens } from '@/components/customer/customer-theme'
import { ScopeChangeHardStopModal } from '@/components/customer/scope-change-modal/scope-change-hard-stop-modal'
import { appCopy, type AppLanguage, localizedProblemLabel, localizedServiceLabel, localizedStatusLabel, useAppLanguage } from '@/lib/app-language'
import { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { useServiceWorkflow } from '@/lib/use-service-workflow'
import { hasLocalDealCompletionEvidence, type LocalDealStatus, orderWorkflowPhaseSectionsForSummary, workflowAllowedActionsLabel, workflowBlockedReasonLabel, workflowEventLabel, type WorkflowPhaseContext, workflowSourceOfTruthLabel } from '@nestscout/shared'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Alert, Platform, Text, View } from 'react-native'
import { CustomerCompletionEvidencePanel, CustomerCompletionPresenceMap, CustomerHistoryChatEmptyPanel, CustomerHistoryChatPanel, CustomerHistoryDoneHero, CustomerHistoryDoneMapEmptyPanel, CustomerHistoryDoneTimeline, CustomerHistoryPriceEmptyPanel, CustomerHistoryPricePanel, CustomerHistoryReviewPanel } from './history-panels'
import { V4Frame } from './shell'
import { PrimaryButton, SecondaryButton, V4TicketCell, customerHistoryTabKeys, customerVisibleStatusLabel, formatVnd, kaelChatPath, localizedCustomerAreaLabel, openHistoryPath } from './ui'
import type { CustomerHistoryTab } from './ui'

function customerCancelRequiresKaelPolicy(status: LocalDealStatus | null) {
  return status === 'worker_matched' ||
    status === 'worker_on_way' ||
    status === 'arrived' ||
    status === 'inspecting' ||
    status === 'repairing' ||
    status === 'scope_change_pending'
}

export function CustomerHistorySurface() {
  const { push, replace } = useRouter()
  const params = useLocalSearchParams<{ job_id?: string; scope_change?: string; tab?: string }>()
  const languageMode = useAppLanguage()
  const copy = customerCopy[languageMode]
  const { actions, dispatch, selectors, state } = useFrontendWorkflow()
  const requestedHistoryTab = isCustomerHistoryTab(params.tab) ? params.tab : null
  const [selectedHistoryTab, setSelectedHistoryTab] = useState<CustomerHistoryTab>('repair')
  const activeHistoryTab = requestedHistoryTab ?? selectedHistoryTab
  const [reviewRating, setReviewRating] = useState<1 | 2 | 3 | 4 | 5 | null>(null)
  const deal = state.deal
  const scopeChange = deal?.scopeChange ?? null
  const routeJobId = typeof params.job_id === 'string' ? params.job_id : null
  const routeScopeChangeId = typeof params.scope_change === 'string' ? params.scope_change : null
  const isScopeChangeWaiting = Boolean(
    scopeChange && ['requested_by_worker', 'reviewing_by_kael', 'waiting_customer_decision'].includes(scopeChange.status),
  )
  const forceScopeChangeModal = Boolean(
    isScopeChangeWaiting && (!routeScopeChangeId || routeScopeChangeId === scopeChange?.id),
  )
  const originalScopeLabel = deal
    ? localizedProblemLabel(deal.draft.problemChips[0] ?? deal.draft.inferredProblemLabel, deal.draft.serviceType, languageMode)
    : copy.history.kaelReviewing
  const originalEstimateLabel = deal?.estimate?.priceRangeLabel ?? copy.history.kaelReviewing
  const estimateLabel = originalEstimateLabel
  const newScopeLabel = scopeChange?.requestedDescription ?? copy.history.kaelReviewing
  const timeline = getCustomerTimeline(selectors.currentStatus, languageMode)
  const visibleStatusLabel = customerVisibleStatusLabel(selectors.currentStatus, selectors.customerSearchState, languageMode)
  const isCancelledStatus = selectors.currentStatus === 'cancelled'
  const workerStateLabel =
    isCancelledStatus
      ? copy.history.cancelledState
      : selectors.customerSearchState === 'searching'
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
  const workflow = useServiceWorkflow({
    status: selectors.currentBackendStatus,
    hasAiNotes: Boolean(deal?.estimate?.advisory),
    hasCompletionEvidence: hasLocalDealCompletionEvidence(deal),
    hasCustomerInput: Boolean(deal),
    hasEstimate: Boolean(deal?.estimate),
    hasScopeChange: Boolean(scopeChange),
  })
  const canSubmitReview = workflow.allowedActions.submitReview && selectors.canCustomerSubmitReview
  const completionEvidenceMode = workflow.artifacts.completion_evidence.mode
  const completionStatusLabel =
    selectors.currentStatus === 'reviewed'
      ? copy.history.reviewed
      : completionEvidenceMode === 'blocked'
        ? workflowBlockedReasonLabel('completion_evidence_required', languageMode)
        : completionEvidenceMode === 'final' || selectors.currentStatus === 'confirmed_by_customer'
          ? copy.history.confirmed
          : selectors.currentStatus === 'completed_by_worker'
            ? copy.history.finalConfirm
            : copy.history.waitingWorkerDone
  const canCreateFreshRequest = !deal || workflow.isDone || selectors.currentStatus === 'cancelled'
  const canEditNoWorkerRequest = selectors.customerSearchState === 'no_worker'
  const canCancelLocalRequest = selectors.canCustomerCancelDeal && !isCancelledStatus
  // §32.7: "Cho thợ lên" appears only after the worker's lobby check-in and before the
  // exact unit is released; the release itself is the backend-authorized handshake.
  const addressAccess = deal?.broadcast?.addressAccess ?? null
  const workerAccessReleased = Boolean(addressAccess?.exact_unit_released)
  const canAuthorizeWorkerAccess = Boolean(
    addressAccess?.worker_checked_in && !workerAccessReleased && !isCancelledStatus && !workflow.isDone,
  )
  const isAuthorizingAccessRef = useRef(false)
  const authorizeWorkerAccess = async () => {
    if (isAuthorizingAccessRef.current) return
    isAuthorizingAccessRef.current = true
    try {
      await actions.authorizeApartmentAccess()
    } finally {
      isAuthorizingAccessRef.current = false
    }
  }
  const selectHistoryTab = (tab: CustomerHistoryTab) => {
    setSelectedHistoryTab(tab)
    replace(tab === 'repair' ? openHistoryPath : `${openHistoryPath}?tab=${tab}`)
  }
  useEffect(() => {
    if (!routeJobId || routeJobId === deal?.id) return
    void actions.hydrateRemoteJobById(routeJobId)
  }, [actions, deal?.id, routeJobId])
  const continueOrCreate = () => {
    if (canEditNoWorkerRequest) {
      dispatch({ type: 'reopen_booking_draft' })
    } else if (deal && canCreateFreshRequest) {
      dispatch({ type: 'reset_workflow' })
    }
    push(kaelChatPath(deal?.draft.serviceType))
  }
  const confirmCancelLocalDeal = () => {
    const cancelMessage = customerCancelRequiresKaelPolicy(selectors.currentStatus)
      ? copy.history.cancelActive
      : selectors.hasLocalBroadcast
      ? copy.history.cancelSearching
      : copy.history.cancelDraft
    const cancelRequest = () => void actions.cancelRemoteJob()
    if (Platform.OS === 'web') {
      if (confirmCustomerHistoryCancellation(copy.history.cancelTitle, cancelMessage)) cancelRequest()
      return
    }
    Alert.alert(copy.history.cancelTitle, cancelMessage, [
      { text: copy.history.keep, style: 'cancel' },
      { text: copy.history.cancelRequest, style: 'destructive', onPress: cancelRequest },
    ])
  }
  const submitSelectedReview = () => {
    if (!reviewRating || !canSubmitReview) return
    void actions.submitReview({ rating: reviewRating, tags: [] })
  }
  const focusReviewPanel = () => {
    selectHistoryTab('done')
  }
  const historyActionLabel = canEditNoWorkerRequest ? copy.history.editRequest : canCreateFreshRequest ? copy.history.newRequest : copy.history.openPriceCheck
  const showRepairTab = activeHistoryTab === 'repair'
  const showPriceTab = activeHistoryTab === 'price'
  const showChatTab = activeHistoryTab === 'chat'
  const showDoneTab = activeHistoryTab === 'done'
  const isCompletedHistory = workflow.isDone
  const hasCompletionEvidenceOutcome =
    workflow.artifacts.completion_evidence.visible &&
    workflow.artifacts.completion_evidence.mode !== 'basic'
  const hasCompletionOutcome = hasCompletionEvidenceOutcome || workflow.artifacts.payment_decision.visible || workflow.artifacts.review.visible || workflow.isDone
  const showScopeChangeArtifact =
    workflow.artifacts.scope_change.visible &&
    workflow.artifacts.scope_change.mode !== 'basic'
  const showCompletionEvidence = hasCompletionEvidenceOutcome
  const showReviewArtifact = workflow.artifacts.review.visible
  const isDraftHistoryDeal = deal?.status === 'draft'
  const historySubtitle = deal && !isDraftHistoryDeal
    ? visibleStatusLabel
    : showPriceTab
      ? (languageMode === 'en' ? 'Price and orchestration' : 'Bảng giá và điều phối')
      : showChatTab
        ? (languageMode === 'en' ? 'Messages and Kael notes' : 'Tin nhắn và ghi chú Kael')
        : showDoneTab
          ? (languageMode === 'en' ? 'Completed work' : 'Công việc đã hoàn tất')
          : (languageMode === 'en' ? 'Track apartment requests' : 'Theo dõi yêu cầu của căn hộ')
  const showActivityStatusLens = Boolean(deal && !isDraftHistoryDeal)

  return (
    <V4Frame active="activity" testID="customer-history-surface">
      {({ tokens }) => (
        <View style={styles.plainContent}>
          <View style={styles.hiddenMarker} testID="customer-activity-ios26-foundation-section" />
          <View style={styles.hiddenMarker} testID="customer-history-empty-state" />
          <ScopeChangeHardStopModal
            language={languageMode}
            newScopeLabel={newScopeLabel}
            onApprove={() => scopeChange ? void actions.decideScopeChange(scopeChange.id, { decision: 'approve' }) : undefined}
            onReject={() => scopeChange ? void actions.decideScopeChange(scopeChange.id, { decision: 'reject' }) : undefined}
            originalEstimateLabel={originalEstimateLabel}
            originalScopeLabel={originalScopeLabel}
            scopeChange={scopeChange}
            tokens={tokens}
            visible={forceScopeChangeModal}
          />
          <View style={styles.bookingTopRow} testID="customer-history-title-row">
            <View style={styles.titleBlock}>
              <Text style={[styles.screenTitle, { color: tokens.text }]} numberOfLines={1}>
                {languageMode === 'en' ? 'Activity' : 'Hoạt động'}
              </Text>
              <Text style={[styles.sectionMeta, { color: tokens.muted }]} numberOfLines={1}>
                {historySubtitle}
              </Text>
            </View>
          </View>
          {deal ? <CustomerHistoryPhaseContextPanel languageMode={languageMode} phaseContext={workflow.phaseContext} tokens={tokens} /> : null}
          {deal && isCancelledStatus ? <CustomerHistoryCancellationContextPanel copy={copy} languageMode={languageMode} phaseContext={workflow.phaseContext} tokens={tokens} visibleStatusLabel={visibleStatusLabel} /> : null}
          {showRepairTab ? <View style={[styles.historyHeroPanel, styles.activityHeroPanel, customerActivityHeroSurface(tokens)]} testID="customer-history-repair-hero-panel">
            <View pointerEvents="none" style={styles.hiddenMarker} testID="customer-history-apple-ios26-surface-system" />
            <View pointerEvents="none" style={[styles.activityMaterialEdge, customerActivityEdgeHighlightSurface(tokens)]} testID="customer-history-hero-edge-highlight" />
            <View style={styles.activityHeroTop}>
              <View style={styles.activityHeroCopy}>
                <Text style={[styles.cardHeadline, styles.activityHeroTitle, { color: tokens.text }]} numberOfLines={1} testID="customer-history-repair-hero-title">
                  {deal ? localizedServiceLabel(deal.draft.serviceType, languageMode) : localizedStatusLabel(null, languageMode)}
                </Text>
                {!deal ? (
                  <Text style={[styles.sectionMeta, { color: tokens.muted }]} numberOfLines={1}>
                    {historySubtitle}
                  </Text>
                ) : null}
              </View>
              {showActivityStatusLens ? (
                <View style={[styles.activityStatusLens, customerActivityStatusLensSurface(tokens)]} testID="customer-history-activity-status-lens">
                  <Text style={[styles.activityStatusText, { color: tokens.primary }]} numberOfLines={1}>
                    {visibleStatusLabel}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.historyHeroBody, { color: tokens.muted }]} numberOfLines={3}>
              {deal
                ? (languageMode === 'en'
                  ? 'Kael is keeping this request organized so you can review price, chat, and next status.'
                  : 'Kael đang giữ yêu cầu này gọn để bạn xem giá, chat và trạng thái tiếp theo.')
                : (languageMode === 'en'
                  ? 'Requests appear here after Kael creates a real ticket.'
                  : 'Yêu cầu sẽ hiện ở đây sau khi Kael tạo phiếu thật.')}
            </Text>
            {deal ? (
              <View style={styles.twoCol}>
                <V4TicketCell label={copy.ticket.issue} value={localizedProblemLabel(deal.draft.problemChips[0], deal.draft.serviceType, languageMode)} variant="activity" />
                <V4TicketCell label={copy.ticket.area} value={localizedCustomerAreaLabel(deal.draft.districtLabel, languageMode, copy.ticket.unknown)} variant="activity" />
              </View>
            ) : null}
            <View style={styles.historyHeroActions}>
              <PrimaryButton label={historyActionLabel} onPress={continueOrCreate} compact />
              <SecondaryButton label={languageMode === 'en' ? 'View chat' : 'Xem chat'} onPress={() => push(kaelChatPath(deal?.draft.serviceType))} compact tone="primary" />
            </View>
          </View> : null}
          {!deal && showPriceTab ? <CustomerHistoryPriceEmptyPanel copy={copy} languageMode={languageMode} onOpenKael={continueOrCreate} tokens={tokens} /> : null}
          {deal && showPriceTab ? <CustomerHistoryPricePanel copy={copy} deal={deal} estimateLabel={estimateLabel} languageMode={languageMode} onOpenKael={continueOrCreate} originalEstimateLabel={originalEstimateLabel} scopeChange={showScopeChangeArtifact ? scopeChange : null} tokens={tokens} visibleStatusLabel={visibleStatusLabel} /> : null}
          {!deal && showChatTab ? <CustomerHistoryChatEmptyPanel copy={copy} languageMode={languageMode} onOpenKael={continueOrCreate} tokens={tokens} /> : null}
          {deal && showChatTab ? <CustomerHistoryChatPanel copy={copy} deal={deal} languageMode={languageMode} onOpenKael={continueOrCreate} phaseContext={workflow.phaseContext} tokens={tokens} visibleStatusLabel={visibleStatusLabel} /> : null}
          {deal && showRepairTab ? (
            <View style={[styles.flowCard, customerHistoryPanelSurface(tokens)]} testID="customer-history-worker-placeholder">
              <View style={styles.workerCard}>
                <View style={[styles.workerAvatar, { backgroundColor: tokens.water, borderColor: tokens.glassBorder }]} />
                <View style={styles.listCopy}>
                  <Text style={[styles.listTitle, { color: tokens.text }]} numberOfLines={1}>
                    {workerStateLabel}
                  </Text>
                </View>
                <View style={styles.workerActions}>
                  <PrimaryButton label={historyActionLabel} onPress={continueOrCreate} compact />
                  {canCancelLocalRequest ? <SecondaryButton label={copy.history.cancelRequest} onPress={confirmCancelLocalDeal} compact testID="customer-history-cancel-local-deal" /> : null}
                </View>
              </View>
            </View>
          ) : null}
          {deal && showRepairTab && (canAuthorizeWorkerAccess || workerAccessReleased) ? (
            <View style={[styles.flowCard, customerHistoryPanelSurface(tokens)]} testID="customer-history-apartment-access-panel">
              <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
                {copy.history.accessTitle}
              </Text>
              <Text style={[styles.listMeta, { color: tokens.muted }]} numberOfLines={2} testID="customer-history-apartment-access-body">
                {workerAccessReleased ? copy.history.accessReleasedBody : copy.history.accessCheckedInBody}
              </Text>
              {canAuthorizeWorkerAccess ? (
                <PrimaryButton compact label={copy.history.accessAuthorizeCta} onPress={() => void authorizeWorkerAccess()} testID="customer-history-authorize-access" />
              ) : null}
            </View>
          ) : null}
          {deal && showRepairTab ? (
            <View style={[styles.flowCard, styles.historyTimelineCard, styles.activityTimelineCard, customerActivityTimelinePanelSurface(tokens)]} testID="customer-history-activity-timeline">
              <View pointerEvents="none" style={[styles.activityMaterialEdge, customerActivityEdgeHighlightSurface(tokens)]} testID="customer-history-timeline-edge-highlight" />
              <View pointerEvents="none" style={[styles.activityTimelineRail, customerActivityTimelineRailSurface(tokens)]} testID="customer-history-activity-timeline-rail" />
              <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
                {copy.history.progress}
              </Text>
              {timeline.map((item) => (
                <View key={item.label} style={[styles.timelineRow, styles.activityTimelineRow]}>
                  <View style={styles.activityTimelineMarker}>
                    <View style={[styles.timelineDot, styles.activityTimelineDot, customerActivityTimelineDotSurface(tokens, item.active)]} />
                  </View>
                  <View style={styles.activityTimelineCopy}>
                    <Text style={[styles.timelineText, { color: item.active ? tokens.text : tokens.muted }]} numberOfLines={1}>
                      {item.label}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
          {!deal && showRepairTab ? <CustomerHistoryRepairEmptyTimeline languageMode={languageMode} tokens={tokens} /> : null}
          {scopeChange && showScopeChangeArtifact && (showRepairTab || showPriceTab) ? (
            <View style={[styles.flowCard, customerHistoryPanelSurface(tokens)]} testID="customer-history-scope-change-panel">
            <View style={styles.sectionTitle}>
              <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
                {copy.history.scope}
              </Text>
              <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
                {copy.history.waitingDecision}
              </Text>
            </View>
            <View style={styles.twoCol}>
              <V4TicketCell label={copy.ticket.current} value={visibleStatusLabel} variant="activity" />
              <V4TicketCell label={copy.ticket.update} value={scopeChange.requestedDescription ?? copy.history.kaelReviewing} variant="activity" />
            </View>
              <View style={styles.twoCol}>
                <V4TicketCell label={copy.history.reason} value={scopeChange.reason ?? copy.history.workerNoReason} variant="activity" />
                <V4TicketCell label={copy.history.newPrice} value={scopeChange.priceMin && scopeChange.priceMax ? `${formatVnd(scopeChange.priceMin)} - ${formatVnd(scopeChange.priceMax)}` : copy.history.kaelReviewing} variant="activity" />
              </View>
            </View>
          ) : null}
          {showDoneTab ? (
            <View style={styles.historyDoneStack} testID="customer-history-done-stack">
              <CustomerHistoryDoneHero canSubmitReview={canSubmitReview} completionStatusLabel={completionStatusLabel} copy={copy} deal={deal} hasCompletionOutcome={hasCompletionOutcome} isCompleted={isCompletedHistory} languageMode={languageMode} onOpenChat={continueOrCreate} onOpenReview={focusReviewPanel} tokens={tokens} />
              {deal && isCompletedHistory ? (
                <CustomerCompletionPresenceMap copy={copy} deal={deal} languageMode={languageMode} tokens={tokens} visibleStatusLabel={visibleStatusLabel} />
              ) : null}
              {!deal ? <CustomerHistoryDoneMapEmptyPanel copy={copy} tokens={tokens} /> : null}
              {deal && !isCompletedHistory ? <CustomerHistoryDoneMapEmptyPanel copy={copy} statusLabel={completionStatusLabel} tokens={tokens} /> : null}
              {deal && showCompletionEvidence ? <CustomerCompletionEvidencePanel completionStatusLabel={completionStatusLabel} copy={copy} deal={deal} languageMode={languageMode} tokens={tokens} /> : null}
              <CustomerHistoryDoneTimeline
                completionEvidenceMode={workflow.artifacts.completion_evidence.mode}
                completionStatusLabel={completionStatusLabel}
                isDone={workflow.isDone}
                languageMode={languageMode}
                reviewMode={workflow.artifacts.review.mode}
                tokens={tokens}
              />
              {deal && showReviewArtifact ? (
                <CustomerHistoryReviewPanel canSubmitReview={canSubmitReview} copy={copy} onRatingChange={setReviewRating} onSubmit={submitSelectedReview} rating={reviewRating} reviewMode={workflow.artifacts.review.mode} selectors={selectors} tokens={tokens} />
              ) : null}
            </View>
          ) : null}
          <View style={styles.hiddenMarker} testID="customer-shell-honest-history-data" />
          <View style={styles.hiddenMarker} testID="customer-history-evidence-timeline" />
          <View style={styles.hiddenMarker} testID="customer-history-stage-map" />
          <View style={styles.hiddenMarker} testID="customer-history-scope-change-placeholder" />
          <View style={styles.hiddenMarker} testID="customer-history-completion-placeholder" />
        </View>
      )}
    </V4Frame>
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

function isCustomerHistoryTab(tab: unknown): tab is CustomerHistoryTab {
  return typeof tab === 'string' && customerHistoryTabKeys.includes(tab as CustomerHistoryTab)
}

function CustomerHistoryPhaseContextPanel({
  languageMode,
  phaseContext,
  tokens,
}: {
  languageMode: AppLanguage
  phaseContext: WorkflowPhaseContext
  tokens: CustomerThemeTokens
}) {
  const visibleSections = orderWorkflowPhaseSectionsForSummary(phaseContext, phaseContext.sections.filter((section) => section.visible && section.role !== 'worker'))
  const primarySection = visibleSections.find((section) => section.id === phaseContext.primaryArtifact?.id) ?? visibleSections[0] ?? null
  const primaryArtifact = primarySection?.title[languageMode] ?? (languageMode === 'en' ? 'No live artifact' : 'Chưa có dấu mốc sống')
  const blockedReason = phaseContext.blockedReason
    ? workflowBlockedReasonLabel(phaseContext.blockedReason, languageMode)
    : workflowAllowedActionsLabel(phaseContext.allowedActions, languageMode)
  const nextEvent = phaseContext.nextExpectedEvent
    ? workflowEventLabel(phaseContext.nextExpectedEvent, languageMode)
    : languageMode === 'en'
      ? 'No next event'
      : 'Không có sự kiện kế tiếp'
  const reportBody = workflowPhaseReportBody(phaseContext, languageMode)
  const sectionSummary = workflowPhaseSectionSummary(visibleSections, languageMode)

  return (
    <View style={[styles.flowCard, styles.historyReportCard, customerHistoryPanelSurface(tokens)]} testID="customer-history-phase-context">
      <View style={styles.historyReportHeader}>
        <Text style={[styles.cardHeadline, styles.historyReportTitle, { color: tokens.text }]} numberOfLines={1} testID="customer-history-phase-title">
          {phaseContext.title[languageMode]}
        </Text>
        <Text style={[styles.historyReportBadge, { color: tokens.primary }]} numberOfLines={1}>
          {languageMode === 'en' ? 'Report' : 'Báo cáo'}
        </Text>
      </View>
      <Text style={[styles.historyDisclaimerText, styles.historyReportBody, { color: tokens.muted }]} numberOfLines={2} testID="customer-history-phase-body">
        {reportBody}
      </Text>
      <View style={styles.historyReportGrid}>
        <V4TicketCell label={languageMode === 'en' ? 'Artifact' : 'Dấu mốc'} testID="customer-history-phase-artifact-cell" value={primaryArtifact} variant="report" />
        <V4TicketCell label={languageMode === 'en' ? 'Next' : 'Tiếp theo'} value={nextEvent} variant="report" />
        <V4TicketCell label={languageMode === 'en' ? 'Gate' : 'Cổng'} value={blockedReason} variant="report" />
        <V4TicketCell label={languageMode === 'en' ? 'Live sections' : 'Mục đang sống'} testID="customer-history-phase-live-cell" value={sectionSummary} valueLines={2} variant="report" />
      </View>
    </View>
  )
}

function CustomerHistoryCancellationContextPanel({
  copy,
  languageMode,
  phaseContext,
  tokens,
  visibleStatusLabel,
}: {
  copy: (typeof customerCopy)[AppLanguage]
  languageMode: AppLanguage
  phaseContext: WorkflowPhaseContext
  tokens: CustomerThemeTokens
  visibleStatusLabel: string
}) {
  return (
    <View style={[styles.flowCard, customerHistoryPanelSurface(tokens)]} testID="customer-history-cancellation-context">
      <View style={styles.sectionTitle}>
        <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
          {copy.history.cancelledState}
        </Text>
        <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
          {workflowSourceOfTruthLabel(phaseContext.sourceOfTruth, languageMode)}
        </Text>
      </View>
      <Text style={[styles.historyDisclaimerText, { color: tokens.muted }]} numberOfLines={3}>
        {copy.history.cancelledBody}
      </Text>
      <View style={styles.twoCol}>
        <V4TicketCell label={copy.ticket.status} value={visibleStatusLabel} variant="activity" />
        <V4TicketCell label={languageMode === 'en' ? 'Gate' : 'Cổng'} value={workflowBlockedReasonLabel('job_cancelled', languageMode)} variant="activity" />
      </View>
      <View style={styles.twoCol}>
        <V4TicketCell label={languageMode === 'en' ? 'Artifact' : 'Dấu mốc'} value={phaseContext.primaryArtifact?.title[languageMode] ?? copy.history.cancelledState} variant="activity" />
        <V4TicketCell label={languageMode === 'en' ? 'Next' : 'Tiếp theo'} value={copy.history.newRequest} variant="activity" />
      </View>
    </View>
  )
}

function workflowPhaseSectionSummary(sections: WorkflowPhaseContext['sections'], languageMode: AppLanguage) {
  const labels = sections.slice(0, 2).map((section) => section.title[languageMode])
  if (sections.length > 2) {
    labels.push(languageMode === 'en' ? `+${sections.length - 2} more` : `+${sections.length - 2} mục`)
  }
  return labels.length > 0 ? labels.join(' · ') : (languageMode === 'en' ? 'No visible section yet' : 'Chưa có mục hiển thị')
}

function workflowPhaseReportBody(phaseContext: WorkflowPhaseContext, languageMode: AppLanguage) {
  const reportBodies: Partial<Record<WorkflowPhaseContext['phase'], Record<AppLanguage, string>>> = {
    intake_started: {
      en: 'Kael has the intake. A real job is not open yet.',
      vi: 'Kael đã nhận thông tin; chưa mở công việc thật.',
    },
    kael_collecting: {
      en: 'Kael is shaping the ticket before analysis.',
      vi: 'Kael đang gom dữ liệu để lập phiếu.',
    },
    kael_estimating: {
      en: 'Kael is preparing the estimate.',
      vi: 'Kael đang chuẩn bị ước tính.',
    },
    kael_explaining: {
      en: 'Estimate is ready; matching is waiting for system approval.',
      vi: 'Ước tính đã sẵn sàng; chờ hệ thống mở điều phối.',
    },
    ticket_review: {
      en: 'Kael is reviewing the ticket before matching.',
      vi: 'Kael đang rà soát phiếu trước khi điều phối.',
    },
    matching: {
      en: 'Kael sent the ticket. Waiting for a worker.',
      vi: 'Kael đã gửi phiếu. Đang chờ thợ nhận việc.',
    },
    worker_matched: {
      en: 'A worker accepted. Track travel and chat if needed.',
      vi: 'Thợ đã nhận việc; theo dõi di chuyển và chat khi cần.',
    },
    worker_on_way: {
      en: 'The worker is on the way. Watch the timeline.',
      vi: 'Thợ đang di chuyển; theo dõi timeline.',
    },
    arrived: {
      en: 'The worker has arrived and can inspect the issue.',
      vi: 'Thợ đã đến và có thể kiểm tra hiện trạng.',
    },
    inspecting: {
      en: 'Inspection is active; scope changes still need Kael.',
      vi: 'Đang kiểm tra; đổi phạm vi vẫn cần Kael.',
    },
    repairing: {
      en: 'Work is active; completion still needs evidence.',
      vi: 'Công việc đang chạy; hoàn tất cần bằng chứng.',
    },
    scope_change_pending: {
      en: 'Kael is reviewing the scope change.',
      vi: 'Kael đang rà soát thay đổi phạm vi.',
    },
    completed_by_worker: {
      en: 'Worker evidence is in; Kael reviews completion.',
      vi: 'Thợ đã gửi bằng chứng; Kael rà soát hoàn tất.',
    },
    customer_confirmed_completion: {
      en: 'Completion is confirmed; payment and review follow the synced state.',
      vi: 'Hoàn tất đã xác nhận; thanh toán và đánh giá theo trạng thái.',
    },
    payment_pending: {
      en: 'Payment is pending before review opens.',
      vi: 'Đang chờ thanh toán trước khi mở đánh giá.',
    },
    paid: {
      en: 'Payment is done; review can open when allowed.',
      vi: 'Đã thanh toán; đánh giá sẽ mở khi được phép.',
    },
    done: {
      en: 'The transaction is closed.',
      vi: 'Giao dịch đã đóng.',
    },
    cancelled: {
      en: 'The request is cancelled; no recovery is simulated.',
      vi: 'Yêu cầu đã hủy; không giả lập phục hồi.',
    },
  }

  return reportBodies[phaseContext.phase]?.[languageMode] ?? phaseContext.intent[languageMode]
}

function CustomerHistoryRepairEmptyTimeline({
  languageMode,
  tokens,
}: {
  languageMode: AppLanguage
  tokens: CustomerThemeTokens
}) {
  const emptyTimeline = getCustomerTimeline(null, languageMode).slice(0, 3)
  return (
    <View style={[styles.flowCard, styles.historyTimelineCard, styles.activityTimelineCard, customerActivityTimelinePanelSurface(tokens)]} testID="customer-history-repair-empty-timeline">
      <View pointerEvents="none" style={[styles.activityMaterialEdge, customerActivityEdgeHighlightSurface(tokens)]} testID="customer-history-empty-timeline-edge-highlight" />
      <View pointerEvents="none" style={[styles.activityTimelineRail, customerActivityTimelineRailSurface(tokens)]} testID="customer-history-activity-empty-timeline-rail" />
      {emptyTimeline.map((item) => (
        <View key={item.label} style={[styles.timelineRow, styles.activityTimelineRow]}>
          <View style={styles.activityTimelineMarker}>
            <View style={[styles.timelineDot, styles.activityTimelineDot, customerActivityTimelineDotSurface(tokens, false)]} />
          </View>
          <View style={styles.activityTimelineCopy}>
            <Text style={[styles.timelineText, { color: tokens.text }]} numberOfLines={1}>
              {item.label}
            </Text>
            <Text style={[styles.listMeta, { color: tokens.subtleText }]} numberOfLines={1}>
              {appCopy[languageMode].common.noRequest}
            </Text>
          </View>
        </View>
      ))}
    </View>
  )
}

function confirmCustomerHistoryCancellation(title: string, message: string) {
  const runtime = globalThis as unknown as {
    confirm?: (message?: string) => boolean
    window?: { confirm?: (message?: string) => boolean }
  }
  const confirmDialog = runtime.confirm ?? runtime.window?.confirm
  return confirmDialog ? confirmDialog(`${title}\n\n${message}`) : false
}
