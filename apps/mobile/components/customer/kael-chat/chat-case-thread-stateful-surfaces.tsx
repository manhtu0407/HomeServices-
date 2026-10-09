import { typography } from '@/design/theme'
import { useState, type ReactNode } from 'react'
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native'

import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import type { MatchingSelectionView } from '@/lib/frontend-workflow/use-customer-matching-selection'
import type { ApartmentAccessView } from '@/lib/frontend-workflow/use-customer-apartment-access'
import {
  toWorkflowPhase,
  type FavoriteWorkerForMatching,
  type JobMatchingPreferenceInput,
  type LocalDeal,
} from '@nestscout/shared'

import type { CustomerThemeTokens } from '../customer-theme'
import { canCustomerDecideScopeChange, scopeChangeApproveLabel } from './case-work-display-model'
import { CaseWorkResponse } from './case-work-response'
import {
  buildCaseWorkResponseModel,
  buildCompletedCaseWorkResponseModels,
  type PaymentRailProvider,
} from './case-work-response-model'
import { CustomerPaymentRailSurface } from './customer-payment-rail-surface'
import { FindingWorkersReceipt } from './finding-workers-receipt'
import { ScopeChangeReviewingDetails } from './scope-change-reviewing-details'
import { ScopeChangeProposalDetails } from './scope-change-proposal-details'
import { ApartmentAccessControls } from './apartment-access-controls'
import { isWorkerAtWorkStatus, WorkerReportButton } from '../report/worker-report-entry'

type PaymentBusyAction =
  | 'manual_order'
  | 'manual_claim'
  | null

export function AgenticCaseThreadPanel({
  apartmentAccessState,
  activityLabel,
  caseEvidenceGateActive,
  caseEvidenceGateNode,
  completionReviewNode,
  caseOptionsAcknowledged,
  caseQuoteRejectOpen,
  caseQuoteRejectReason,
  confirmingCaseQuote,
  deal,
  language,
  matchingSelectionState,
  onAcknowledgeOptions,
  onAuthorizeApartmentAccess,
  onCreateManualBankPaymentOrder,
  onClaimManualBankPayment,
  onChooseMatchingPreference,
  onLoadSavedWorkers,
  onRefreshPayment,
  onApproveScopeChange,
  onApproveQuote,
  onOpenActivity,
  onQuoteRejectReasonChange,
  onQuoteRejectReasonSubmit,
  onRejectScopeChange,
  onRejectQuote,
  onRetryWorkerSearch,
  onStopMatching,
  onSubmitReview,
  reduceMotion,
  retryingWorkerSearch,
  submittingCaseQuoteRejectReason,
  paymentRailProvider,
  textInputStyle,
  tokens,
}: {
  apartmentAccessState: ApartmentAccessView
  activityLabel: string
  caseEvidenceGateActive: boolean
  caseEvidenceGateNode: ReactNode
  completionReviewNode: ReactNode
  caseOptionsAcknowledged: boolean
  caseQuoteRejectOpen: boolean
  caseQuoteRejectReason: string
  confirmingCaseQuote: boolean
  deal: LocalDeal
  language: AppLanguage
  matchingSelectionState: MatchingSelectionView
  onAcknowledgeOptions: () => void
  onAuthorizeApartmentAccess: () => Promise<void> | void
  onCreateManualBankPaymentOrder: () => Promise<boolean>
  onClaimManualBankPayment: () => Promise<boolean>
  onChooseMatchingPreference: (input: Omit<JobMatchingPreferenceInput, 'client_request_id'>) => Promise<boolean>
  onLoadSavedWorkers: () => Promise<FavoriteWorkerForMatching[] | null>
  onRefreshPayment: () => Promise<boolean>
  onApproveScopeChange: (id: string) => void
  onApproveQuote: () => void
  onOpenActivity: () => void
  onQuoteRejectReasonChange: (value: string) => void
  onQuoteRejectReasonSubmit: () => void
  onRejectScopeChange: (id: string) => void
  onRejectQuote: () => void
  onRetryWorkerSearch: () => Promise<void> | void
  onStopMatching: () => Promise<boolean>
  onSubmitReview: (input: { rating: number; tags: string[]; comment?: string }) => Promise<boolean>
  reduceMotion: boolean
  retryingWorkerSearch: boolean
  submittingCaseQuoteRejectReason: boolean
  paymentRailProvider: PaymentRailProvider
  textInputStyle: StyleProp<TextStyle>
  tokens: CustomerThemeTokens
}) {
  const [paymentBusyAction, setPaymentBusyAction] = useState<PaymentBusyAction>(null)
  const [refreshingPayment, setRefreshingPayment] = useState(false)
  const [paymentRefreshResult, setPaymentRefreshResult] = useState<'failed' | 'success' | null>(null)
  const backendPhase = toWorkflowPhase(deal.backendStatus ?? deal.status)
  const phase = deal.scopeReview && (backendPhase === 'inspecting' || backendPhase === 'repairing')
    ? 'scope_change_reviewing'
    : backendPhase
  const model = buildCaseWorkResponseModel({ deal, language, paymentRailProvider, phase })
  const completedPhaseModels = buildCompletedCaseWorkResponseModels({
    deal,
    language,
    phase,
  })
  const phaseHistory = (
    <CaseWorkPhaseHistory language={language} models={completedPhaseModels} tokens={tokens} />
  )
  const paymentBusy = paymentBusyAction !== null
  const runPaymentAction = (
    action: Exclude<PaymentBusyAction, null>,
    operation: () => Promise<boolean>,
  ) => {
    if (paymentBusyAction) return
    setPaymentBusyAction(action)
    void operation().finally(() => setPaymentBusyAction(null))
  }

  if (caseEvidenceGateActive) {
    return (
      <View style={styles.phaseStack} testID="customer-v21-case-work-thread">
        {phaseHistory}
        {caseEvidenceGateNode}
      </View>
    )
  }

  if (phase === 'completed_by_worker' && completionReviewNode) {
    return (
      <View style={styles.phaseStack} testID="customer-v21-case-work-thread">
        {phaseHistory}
        {completionReviewNode}
      </View>
    )
  }

  const pendingScopeChange = phase === 'scope_change_pending' && deal.scopeChange && canCustomerDecideScopeChange(deal.scopeChange)
    ? deal.scopeChange
    : null
  const quoteReviewActive = phase === 'ticket_review' && Boolean(deal.estimate)
  const matchingReceipt = phase === 'matching' && deal.matchingState ? (
    <FindingWorkersReceipt
      language={language}
      matchingState={deal.matchingState}
      selectionState={matchingSelectionState.jobId === deal.id ? matchingSelectionState : {
        jobId: deal.id, scopeKey: `${matchingSelectionState.scopeKey}:${deal.id}`, ready: false, choice: null,
      }}
      onChoosePreference={onChooseMatchingPreference}
      onLoadSavedWorkers={onLoadSavedWorkers}
      onRetry={() => onRetryWorkerSearch()}
      retryingWorkerSearch={retryingWorkerSearch}
      onStop={onStopMatching}
      reduceMotion={reduceMotion}
      tokens={tokens}
    />
  ) : null
  const retrySearchActive = phase === 'matching' && !matchingReceipt && deal.broadcast?.status === 'expired'
  const scopeReviewingDetails = phase === 'scope_change_reviewing' ? (
    <ScopeChangeReviewingDetails deal={deal} language={language} tokens={tokens} />
  ) : null
  const scopeProposalDetails = pendingScopeChange ? (
    <ScopeChangeProposalDetails deal={deal} language={language} tokens={tokens} />
  ) : null
  const apartmentAccessReady = model.actionKind === 'apartment_access'
  const activityActionLabel = phase === 'done' || phase === 'cancelled' ? activityLabel : null
  // While a worker is on the job the customer can always reach the report, next to whatever
  // decision the current step asks for.
  const withWorkerReport = (controls: ReactNode) => isWorkerAtWorkStatus(deal.status)
    ? (
      <View style={styles.reportStack}>
        {controls}
        <WorkerReportButton jobId={deal.id} language={language} testID="customer-v21-case-work-report-worker" />
      </View>
    )
    : controls

  return (
    <View style={styles.phaseStack} testID="customer-v21-case-work-thread">
      {phaseHistory}
      <CaseWorkResponse
        controls={withWorkerReport(pendingScopeChange ? (
          <View style={styles.actions}>
            <KaelButton
              label={language === 'vi' ? 'Từ chối' : 'Decline'}
              onPress={() => onRejectScopeChange(pendingScopeChange.id)}
              size="small"
              style={styles.action}
              testID="customer-v21-case-work-scope-reject"
              variant="secondary"
            />
            <KaelButton
              label={scopeChangeApproveLabel(pendingScopeChange, language)}
              onPress={() => onApproveScopeChange(pendingScopeChange.id)}
              size="small"
              style={styles.action}
              testID="customer-v21-case-work-scope-approve"
            />
          </View>
        ) : quoteReviewActive ? (
          <QuoteReviewControls
            acknowledged={caseOptionsAcknowledged}
            confirming={confirmingCaseQuote}
            language={language}
            onAcknowledge={onAcknowledgeOptions}
            onConfirm={onApproveQuote}
            onReasonChange={onQuoteRejectReasonChange}
            onReject={onRejectQuote}
            onSubmitReason={onQuoteRejectReasonSubmit}
            rejectOpen={caseQuoteRejectOpen}
            rejectReason={caseQuoteRejectReason}
            submittingReason={submittingCaseQuoteRejectReason}
            textInputStyle={textInputStyle}
            tokens={tokens}
          />
        ) : retrySearchActive ? (
          <KaelButton
            accessibilityState={{ busy: retryingWorkerSearch, disabled: retryingWorkerSearch }}
            disabled={retryingWorkerSearch}
            label={retryingWorkerSearch
              ? (language === 'vi' ? 'Đang tìm lại' : 'Searching again')
              : (language === 'vi' ? 'Tìm lại thợ' : 'Find workers again')}
            onPress={onRetryWorkerSearch}
            size="small"
            testID="customer-v21-case-retry-worker-search"
          />
        ) : apartmentAccessReady ? (
          <ApartmentAccessControls
            key={`${deal.id}:${deal.broadcast?.addressAccess?.authorization_context?.expected_check_in_at}`}
            jobId={deal.id}
            state={apartmentAccessState}
            language={language}
            onAuthorize={onAuthorizeApartmentAccess}
            tokens={tokens}
          />
        ) : activityActionLabel ? (
          <KaelButton
            label={activityActionLabel}
            onPress={onOpenActivity}
            size="small"
            testID="customer-v21-case-open-activity"
            variant="secondary"
          />
        ) : undefined)}
        details={scopeReviewingDetails ?? scopeProposalDetails ?? matchingReceipt}
        hideNoteSummary={Boolean(matchingReceipt)}
        model={model}
        reduceMotion={reduceMotion}
        tokens={tokens}
      />
      <CustomerPaymentRailSurface
        deal={deal}
        language={language}
        onCreateManualBankPaymentOrder={() => {
          runPaymentAction('manual_order', onCreateManualBankPaymentOrder)
        }}
        onClaimManualBankPayment={() => {
          runPaymentAction('manual_claim', onClaimManualBankPayment)
        }}
        onRefreshPayment={() => {
          if (refreshingPayment) return
          setPaymentRefreshResult(null)
          setRefreshingPayment(true)
          void onRefreshPayment()
            .then((refreshed) => setPaymentRefreshResult(refreshed ? 'success' : 'failed'))
            .catch(() => setPaymentRefreshResult('failed'))
            .finally(() => setRefreshingPayment(false))
        }}
        paymentBusy={paymentBusy}
        paymentBusyAction={paymentBusyAction}
        paymentRailProvider={paymentRailProvider}
        paymentRefreshResult={paymentRefreshResult}
        refreshingPayment={refreshingPayment}
        reduceMotion={reduceMotion}
        reviewControls={phase === 'paid' ? (
          <CustomerReviewControls
            language={language}
            onSubmit={onSubmitReview}
            textInputStyle={textInputStyle}
            tokens={tokens}
          />
        ) : null}
        tokens={tokens}
      />
    </View>
  )
}

function CaseWorkPhaseHistory({
  language,
  models,
  tokens,
}: {
  language: AppLanguage
  models: ReturnType<typeof buildCompletedCaseWorkResponseModels>
  tokens: CustomerThemeTokens
}) {
  if (models.length === 0) return null

  return (
    <View
      style={[styles.phaseHistory, { borderLeftColor: tokens.primary }]}
      testID="customer-v21-case-work-phase-history"
    >
      <Text accessibilityRole="header" style={[styles.phaseHistoryHeading, { color: tokens.text }]}>
        {language === 'vi' ? 'Các bước đã hoàn tất' : 'Completed steps'}
      </Text>
      <View style={styles.phaseHistoryEntries}>
        {models.map((model) => (
          <View
            accessible
            accessibilityLabel={`${model.title}. ${model.status}`}
            key={model.phase}
            style={styles.phaseHistoryEntry}
            testID={`customer-v21-case-work-history-${model.phase}`}
          >
            <Text style={[styles.phaseHistoryEntryTitle, { color: tokens.text }]}>{model.title}</Text>
            <Text style={[styles.phaseHistoryEntryStatus, { color: tokens.muted }]}>{model.status}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

function CustomerReviewControls({
  language,
  onSubmit,
  textInputStyle,
  tokens,
}: {
  language: AppLanguage
  onSubmit: (input: { rating: number; tags: string[]; comment?: string }) => Promise<boolean>
  textInputStyle: StyleProp<TextStyle>
  tokens: CustomerThemeTokens
}) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  return (
    <View style={styles.review} testID="customer-v21-case-review-controls">
      <View style={styles.ratingActions}>
        {[1, 2, 3, 4, 5].map((value) => (
          <KaelButton
            key={value}
            label={`${value} ★`}
            onPress={() => setRating(value)}
            size="small"
            style={styles.ratingAction}
            testID={`customer-v21-case-review-rating-${value}`}
            variant={rating === value ? 'primary' : 'secondary'}
          />
        ))}
      </View>
      <KaelTextField
        onChangeText={setComment}
        placeholder={language === 'vi' ? 'Chia sẻ ngắn về chất lượng công việc' : 'Share a short note about the work'}
        placeholderTextColor={tokens.subtleText}
        style={[textInputStyle, { color: tokens.text }]}
        testID="customer-v21-case-review-comment"
        value={comment}
      />
      <KaelButton
        accessibilityState={{ busy: submitting, disabled: submitting || rating === 0 }}
        disabled={submitting || rating === 0}
        label={submitting
          ? (language === 'vi' ? 'Đang gửi đánh giá' : 'Submitting review')
          : (language === 'vi' ? 'Gửi đánh giá' : 'Submit review')}
        onPress={() => {
          if (submitting || rating === 0) return
          setSubmitting(true)
          const trimmed = comment.trim()
          void onSubmit({ rating, tags: [], ...(trimmed ? { comment: trimmed } : {}) })
            .finally(() => setSubmitting(false))
        }}
        size="small"
        testID="customer-v21-case-review-submit"
      />
    </View>
  )
}

function QuoteReviewControls({
  acknowledged,
  confirming,
  language,
  onAcknowledge,
  onConfirm,
  onReasonChange,
  onReject,
  onSubmitReason,
  rejectOpen,
  rejectReason,
  submittingReason,
  textInputStyle,
  tokens,
}: {
  acknowledged: boolean
  confirming: boolean
  language: AppLanguage
  onAcknowledge: () => void
  onConfirm: () => void
  onReasonChange: (value: string) => void
  onReject: () => void
  onSubmitReason: () => void
  rejectOpen: boolean
  rejectReason: string
  submittingReason: boolean
  textInputStyle: StyleProp<TextStyle>
  tokens: CustomerThemeTokens
}) {
  if (!acknowledged) {
    return (
      <KaelButton
        label={language === 'vi' ? 'Xem và quyết định' : 'Review and decide'}
        onPress={onAcknowledge}
        size="small"
        testID="customer-v21-case-options-continue"
      />
    )
  }

  const canSubmitReason = rejectReason.trim().length > 0 && !submittingReason && !confirming
  return (
    <>
      {rejectOpen ? (
        <View style={styles.reason} testID="customer-v21-case-quote-reject-reason">
          <KaelTextField
            onChangeText={onReasonChange}
            placeholder={language === 'vi' ? 'Điều bạn muốn Kael điều chỉnh' : 'What should Kael adjust?'}
            placeholderTextColor={tokens.subtleText}
            style={[textInputStyle, { color: tokens.text }]}
            testID="customer-v21-case-quote-reject-input"
            value={rejectReason}
          />
          <KaelButton
            disabled={!canSubmitReason}
            label={submittingReason
              ? (language === 'vi' ? 'Đang gửi' : 'Sending')
              : (language === 'vi' ? 'Gửi điều chỉnh' : 'Send changes')}
            onPress={onSubmitReason}
            size="small"
            testID="customer-v21-case-quote-reject-send"
          />
        </View>
      ) : null}
      <View style={styles.actions}>
        <KaelButton
          disabled={confirming || submittingReason}
          label={language === 'vi' ? 'Cần điều chỉnh' : 'Request changes'}
          onPress={onReject}
          size="small"
          style={styles.action}
          testID="customer-v21-case-quote-reject"
          variant="secondary"
        />
        <KaelButton
          accessibilityState={{ busy: confirming, disabled: confirming || submittingReason }}
          disabled={confirming || submittingReason}
          label={confirming
            ? (language === 'vi' ? 'Đang xác nhận' : 'Confirming')
            : (language === 'vi' ? 'Xác nhận phương án' : 'Confirm proposal')}
          onPress={onConfirm}
          size="small"
          style={styles.action}
          testID="customer-v21-case-quote-confirm"
        />
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  action: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  reportStack: {
    alignItems: 'flex-start',
    gap: 10,
  },
  phaseHistory: {
    alignSelf: 'center',
    borderLeftWidth: 2,
    gap: 10,
    maxWidth: 608,
    paddingLeft: 18,
    width: '100%',
  },
  phaseHistoryEntries: {
    gap: 10,
  },
  phaseHistoryEntry: {
    gap: 2,
  },
  phaseHistoryEntryStatus: {
    ...typography.footnote,
  },
  phaseHistoryEntryTitle: {
    ...typography.subheadline,
    fontWeight: '600',
  },
  phaseHistoryHeading: {
    ...typography.callout,
    fontWeight: '600',
  },
  phaseStack: {
    gap: 18,
    width: '100%',
  },
  ratingAction: {
    flex: 1,
    minWidth: 44,
  },
  ratingActions: {
    flexDirection: 'row',
    gap: 6,
  },
  reason: {
    gap: 10,
  },
  review: {
    gap: 10,
  },
})
