import { useState, type ReactNode } from 'react'
import { StyleSheet, View, type StyleProp, type TextStyle } from 'react-native'

import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import { toWorkflowPhase, type LocalDeal } from '@nestscout/shared'

import type { CustomerThemeTokens } from '../customer-theme'
import { canCustomerDecideScopeChange } from './case-work-display-model'
import { CaseWorkResponse } from './case-work-response'
import { buildCaseWorkResponseModel } from './case-work-response-model'

export function AgenticCaseThreadPanel({
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
  onAcknowledgeOptions,
  onAuthorizeApartmentAccess,
  onConfirmStagingPayment,
  onCreatePaymentIntent,
  onApproveScopeChange,
  onApproveQuote,
  onOpenActivity,
  onQuoteRejectReasonChange,
  onQuoteRejectReasonSubmit,
  onRejectScopeChange,
  onRejectQuote,
  onRetryWorkerSearch,
  onSubmitReview,
  reduceMotion,
  retryingWorkerSearch,
  submittingCaseQuoteRejectReason,
  stagingPaymentRailEnabled,
  textInputStyle,
  tokens,
}: {
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
  onAcknowledgeOptions: () => void
  onAuthorizeApartmentAccess: () => Promise<void> | void
  onConfirmStagingPayment: () => Promise<boolean>
  onCreatePaymentIntent: () => Promise<boolean>
  onApproveScopeChange: (id: string) => void
  onApproveQuote: () => void
  onOpenActivity: () => void
  onQuoteRejectReasonChange: (value: string) => void
  onQuoteRejectReasonSubmit: () => void
  onRejectScopeChange: (id: string) => void
  onRejectQuote: () => void
  onRetryWorkerSearch: () => void
  onSubmitReview: (input: { rating: number; tags: string[]; comment?: string }) => Promise<boolean>
  reduceMotion: boolean
  retryingWorkerSearch: boolean
  submittingCaseQuoteRejectReason: boolean
  stagingPaymentRailEnabled: boolean
  textInputStyle: StyleProp<TextStyle>
  tokens: CustomerThemeTokens
}) {
  const [authorizingApartmentAccess, setAuthorizingApartmentAccess] = useState(false)
  const [paymentBusy, setPaymentBusy] = useState(false)
  const phase = toWorkflowPhase(deal.backendStatus ?? deal.status)
  if (caseEvidenceGateActive) return caseEvidenceGateNode
  if (phase === 'completed_by_worker') return completionReviewNode

  const model = buildCaseWorkResponseModel({ deal, language, paymentRailAvailable: stagingPaymentRailEnabled, phase })
  const pendingScopeChange = phase === 'scope_change_pending' && deal.scopeChange && canCustomerDecideScopeChange(deal.scopeChange)
    ? deal.scopeChange
    : null
  const quoteReviewActive = phase === 'ticket_review' && Boolean(deal.estimate)
  const retrySearchActive = phase === 'matching' && deal.broadcast?.status === 'expired'
  const apartmentAccessReady = model.actionKind === 'apartment_access'
  const activityActionLabel = phase === 'done' || phase === 'cancelled' ? activityLabel : null

  return (
    <CaseWorkResponse
      controls={pendingScopeChange ? (
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
            label={language === 'vi' ? 'Chấp nhận thay đổi' : 'Accept change'}
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
        <KaelButton
          accessibilityState={{ busy: authorizingApartmentAccess, disabled: authorizingApartmentAccess }}
          disabled={authorizingApartmentAccess}
          label={authorizingApartmentAccess
            ? (language === 'vi' ? 'Đang xác nhận' : 'Confirming')
            : (language === 'vi' ? 'Cho thợ lên' : 'Release unit access')}
          onPress={() => {
            if (authorizingApartmentAccess) return
            setAuthorizingApartmentAccess(true)
            void Promise.resolve()
              .then(onAuthorizeApartmentAccess)
              .finally(() => setAuthorizingApartmentAccess(false))
          }}
          size="small"
          testID="customer-v21-case-authorize-apartment-access"
        />
      ) : phase === 'customer_confirmed_completion' && stagingPaymentRailEnabled ? (
        <KaelButton
          accessibilityState={{ busy: paymentBusy, disabled: paymentBusy }}
          disabled={paymentBusy}
          label={paymentBusy
            ? (language === 'vi' ? 'Đang tạo mô phỏng' : 'Starting simulation')
            : (language === 'vi' ? 'Bắt đầu thanh toán mô phỏng' : 'Start payment simulation')}
          onPress={() => {
            if (paymentBusy) return
            setPaymentBusy(true)
            void onCreatePaymentIntent().finally(() => setPaymentBusy(false))
          }}
          size="small"
          testID="customer-v21-case-staging-payment-start"
        />
      ) : phase === 'payment_pending' && deal.payment?.provider === 'staging_simulator' && stagingPaymentRailEnabled ? (
        <KaelButton
          accessibilityState={{ busy: paymentBusy, disabled: paymentBusy }}
          disabled={paymentBusy}
          label={paymentBusy
            ? (language === 'vi' ? 'Đang xác nhận mô phỏng' : 'Confirming simulation')
            : (language === 'vi' ? 'Xác nhận thanh toán mô phỏng' : 'Confirm simulated payment')}
          onPress={() => {
            if (paymentBusy) return
            setPaymentBusy(true)
            void onConfirmStagingPayment().finally(() => setPaymentBusy(false))
          }}
          size="small"
          testID="customer-v21-case-staging-payment-confirm"
        />
      ) : phase === 'paid' ? (
        <CustomerReviewControls
          language={language}
          onSubmit={onSubmitReview}
          textInputStyle={textInputStyle}
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
      ) : undefined}
      model={model}
      reduceMotion={reduceMotion}
      tokens={tokens}
    />
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
  reason: {
    gap: 10,
  },
  ratingAction: {
    flex: 1,
    minWidth: 44,
  },
  ratingActions: {
    flexDirection: 'row',
    gap: 6,
  },
  review: {
    gap: 10,
  },
})
