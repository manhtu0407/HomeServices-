import { useState, type ReactNode } from 'react'
import { Image } from 'expo-image'
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native'

import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import { toWorkflowPhase, type LocalDeal } from '@nestscout/shared'

import type { CustomerThemeTokens } from '../customer-theme'
import { canCustomerDecideScopeChange } from './case-work-display-model'
import { formatVnd } from './case-work-money-display-model'
import { CaseWorkResponse } from './case-work-response'
import { buildSePayVietQrPaymentPresentation } from './sepay-vietqr-payment-display-model'
import {
  buildCaseWorkResponseModel,
  buildCompletedCaseWorkResponseModels,
  type PaymentRailProvider,
} from './case-work-response-model'

const SEPAY_VIETQR_BOX_SIZE = 232

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
  onCreatePaymentIntent,
  onRefreshPayment,
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
  paymentRailProvider,
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
  onCreatePaymentIntent: () => Promise<boolean>
  onRefreshPayment: () => Promise<boolean>
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
  paymentRailProvider: PaymentRailProvider
  textInputStyle: StyleProp<TextStyle>
  tokens: CustomerThemeTokens
}) {
  const [authorizingApartmentAccess, setAuthorizingApartmentAccess] = useState(false)
  const [paymentBusy, setPaymentBusy] = useState(false)
  const [refreshingPayment, setRefreshingPayment] = useState(false)
  const phase = toWorkflowPhase(deal.backendStatus ?? deal.status)
  const model = buildCaseWorkResponseModel({ deal, language, paymentRailProvider, phase })
  const completedPhaseModels = buildCompletedCaseWorkResponseModels({
    deal,
    language,
    phase,
  })
  const phaseHistory = (
    <CaseWorkPhaseHistory language={language} models={completedPhaseModels} tokens={tokens} />
  )
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
  const retrySearchActive = phase === 'matching' && deal.broadcast?.status === 'expired'
  const apartmentAccessReady = model.actionKind === 'apartment_access'
  const activityActionLabel = phase === 'done' || phase === 'cancelled' ? activityLabel : null
  const sepayPayment = phase === 'payment_pending' && deal.payment?.provider === 'sepay_vietqr'
    ? deal.payment
    : null

  return (
    <View style={styles.phaseStack} testID="customer-v21-case-work-thread">
      {phaseHistory}
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
      ) : phase === 'customer_confirmed_completion' && paymentRailProvider === 'sepay_vietqr' ? (
        <KaelButton
          accessibilityState={{ busy: paymentBusy, disabled: paymentBusy }}
          disabled={paymentBusy}
          label={paymentBusy
            ? (language === 'vi' ? 'Đang mở thanh toán' : 'Opening payment')
            : (language === 'vi' ? 'Mở thanh toán VietQR' : 'Open VietQR payment')}
          onPress={() => {
            if (paymentBusy) return
            setPaymentBusy(true)
            void onCreatePaymentIntent().finally(() => setPaymentBusy(false))
          }}
          size="small"
          testID="customer-v21-case-sepay-payment-start"
        />
      ) : phase === 'paid' && model.actionKind === 'review' ? (
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
        details={sepayPayment ? (
        <SePayVietQrPaymentDetails
          language={language}
          onRefresh={() => {
            if (refreshingPayment) return
            setRefreshingPayment(true)
            void onRefreshPayment().finally(() => setRefreshingPayment(false))
          }}
          payment={sepayPayment}
          paymentRailAvailable={paymentRailProvider === 'sepay_vietqr'}
          refreshing={refreshingPayment}
          tokens={tokens}
        />
      ) : undefined}
        model={model}
        reduceMotion={reduceMotion}
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

type SePayVietQrPaymentDetailsProps = {
  language: AppLanguage
  onRefresh: () => void
  payment: NonNullable<LocalDeal['payment']>
  paymentRailAvailable: boolean
  refreshing: boolean
  tokens: CustomerThemeTokens
}

function SePayVietQrPaymentDetails(props: SePayVietQrPaymentDetailsProps) {
  return (
    <SePayVietQrPaymentDetailsBody
      key={props.payment.qrImageUrl ?? 'payment-qr-unavailable'}
      {...props}
    />
  )
}

function SePayVietQrPaymentDetailsBody({
  language,
  onRefresh,
  payment,
  paymentRailAvailable,
  refreshing,
  tokens,
}: SePayVietQrPaymentDetailsProps) {
  const [imageLoadFailed, setImageLoadFailed] = useState(false)
  const presentation = buildSePayVietQrPaymentPresentation({ imageLoadFailed, payment, paymentRailAvailable })
  const copy = paymentDetailsCopy(language)

  return (
    <View style={styles.paymentDetails} testID="customer-v21-case-sepay-payment-details">
      <View style={styles.paymentHeader}>
        <Text accessibilityRole="header" style={[styles.paymentHeading, { color: tokens.text }]}>
          {copy.heading}
        </Text>
        <Text accessibilityLiveRegion="polite" style={[styles.paymentStatus, { color: tokens.muted }]}>
          {paymentPresentationStatus(presentation.kind, copy)}
        </Text>
      </View>
      {presentation.kind === 'ready' ? (
        <>
          <View style={styles.paymentQrFrame} testID="customer-v21-case-sepay-qr-frame">
            <Image
              accessibilityLabel={language === 'vi' ? 'Mã VietQR thanh toán' : 'VietQR payment code'}
              contentFit="contain"
              onError={() => setImageLoadFailed(true)}
              source={{ uri: presentation.qrImageUrl }}
              style={styles.paymentQr}
              testID="customer-v21-case-sepay-qr"
            />
          </View>
          <PaymentDetailLabel label={copy.amountLabel} tokens={tokens} />
          <Text style={[styles.paymentAmount, { color: tokens.text }]}>{formatVnd(presentation.expectedAmount, language)}</Text>
          <PaymentDetailLabel label={copy.transferLabel} tokens={tokens} />
          <Text
            selectable
            style={[styles.paymentTransferContent, { color: tokens.primary }]}
            testID="customer-v21-case-sepay-transfer-content"
          >
            {presentation.transferContent}
          </Text>
          <View style={styles.paymentInstructions}>
            <Text style={[styles.paymentInstruction, { color: tokens.muted }]}>{copy.stepOne}</Text>
            <Text style={[styles.paymentInstruction, { color: tokens.muted }]}>{copy.stepTwo}</Text>
            <Text style={[styles.paymentInstruction, { color: tokens.muted }]}>{copy.stepThree}</Text>
          </View>
          <Text style={[styles.paymentWaiting, { color: tokens.muted }]}>{copy.noManualConfirmation}</Text>
        </>
      ) : presentation.kind === 'amount_mismatch' ? (
        <PaymentAmountMismatch language={language} presentation={presentation} tokens={tokens} />
      ) : presentation.kind === 'received' ? (
        <PaymentMessage copy={copy.receivedCopy} title={copy.receivedTitle} tokens={tokens} />
      ) : presentation.kind === 'unavailable' ? (
        <PaymentMessage copy={copy.unavailableCopy} title={copy.unavailableTitle} tokens={tokens} />
      ) : (
        <PaymentMessage copy={copy.instructionsUnavailableCopy} title={copy.instructionsUnavailableTitle} tokens={tokens} />
      )}
      <KaelButton
        accessibilityState={{ busy: refreshing, disabled: refreshing }}
        disabled={refreshing}
        label={refreshing ? copy.refreshingLabel : copy.refreshLabel}
        onPress={() => {
          // A fresh server refresh should also permit a transient QR image failure to retry.
          setImageLoadFailed(false)
          onRefresh()
        }}
        size="small"
        testID="customer-v21-case-sepay-payment-refresh"
        variant="secondary"
      />
    </View>
  )
}

function PaymentDetailLabel({ label, tokens }: { label: string; tokens: CustomerThemeTokens }) {
  return <Text style={[styles.paymentLabel, { color: tokens.muted }]}>{label}</Text>
}

function PaymentMessage({
  copy,
  title,
  tokens,
}: {
  copy: string
  title: string
  tokens: CustomerThemeTokens
}) {
  return (
    <View style={styles.paymentIssue}>
      <Text style={[styles.paymentIssueTitle, { color: tokens.text }]}>{title}</Text>
      <Text style={[styles.paymentWaiting, { color: tokens.muted }]}>{copy}</Text>
    </View>
  )
}

function PaymentAmountMismatch({
  language,
  presentation,
  tokens,
}: {
  language: AppLanguage
  presentation: Extract<ReturnType<typeof buildSePayVietQrPaymentPresentation>, { kind: 'amount_mismatch' }>
  tokens: CustomerThemeTokens
}) {
  const copy = paymentDetailsCopy(language)
  return (
    <View style={styles.paymentIssue}>
      <Text style={[styles.paymentIssueTitle, { color: tokens.text }]}>{copy.amountMismatchTitle}</Text>
      <Text style={[styles.paymentWaiting, { color: tokens.muted }]}>{copy.amountMismatchCopy}</Text>
      {presentation.expectedAmount !== null ? (
        <View style={styles.paymentIssueAmount}>
          <PaymentDetailLabel label={copy.expectedAmountLabel} tokens={tokens} />
          <Text style={[styles.paymentAmount, { color: tokens.text }]}>{formatVnd(presentation.expectedAmount, language)}</Text>
        </View>
      ) : null}
      {presentation.receivedAmount !== null ? (
        <View style={styles.paymentIssueAmount}>
          <PaymentDetailLabel label={copy.receivedAmountLabel} tokens={tokens} />
          <Text style={[styles.paymentAmount, { color: tokens.text }]}>{formatVnd(presentation.receivedAmount, language)}</Text>
        </View>
      ) : null}
    </View>
  )
}

function paymentPresentationStatus(
  kind: ReturnType<typeof buildSePayVietQrPaymentPresentation>['kind'],
  copy: ReturnType<typeof paymentDetailsCopy>,
) {
  if (kind === 'ready') return copy.readyStatus
  if (kind === 'amount_mismatch') return copy.amountMismatchStatus
  if (kind === 'received') return copy.receivedStatus
  if (kind === 'unavailable') return copy.unavailableStatus
  return copy.instructionsUnavailableStatus
}

function paymentDetailsCopy(language: AppLanguage) {
  return language === 'vi'
    ? {
        amountLabel: 'Số tiền cần chuyển',
        amountMismatchCopy: 'Không chuyển thêm tiền cho công việc này. Hệ thống cần đối chiếu giao dịch trước khi có bước tiếp theo.',
        amountMismatchStatus: 'Cần đối chiếu số tiền',
        amountMismatchTitle: 'Số tiền nhận được chưa khớp',
        expectedAmountLabel: 'Số tiền cần xác minh',
        heading: 'Thanh toán qua VietQR',
        instructionsUnavailableCopy: 'Đừng chuyển tiền cho đến khi hệ thống tải lại và xác minh thông tin thanh toán.',
        instructionsUnavailableStatus: 'Đang kiểm tra thông tin',
        instructionsUnavailableTitle: 'Thông tin VietQR chưa thể xác minh.',
        noManualConfirmation: 'Không cần bấm xác nhận thanh toán. Hệ thống chỉ cập nhật sau khi SePay xác thực giao dịch.',
        receivedCopy: 'Giao dịch đã được tiếp nhận và đang được xác minh. Không cần chuyển thêm tiền.',
        receivedStatus: 'Đang hoàn tất xác minh',
        receivedAmountLabel: 'Số tiền hệ thống ghi nhận',
        receivedTitle: 'Giao dịch đang được xác minh',
        readyStatus: 'Đang chờ SePay xác nhận',
        refreshLabel: 'Cập nhật trạng thái',
        refreshingLabel: 'Đang cập nhật',
        stepOne: '1. Mở ứng dụng ngân hàng và quét mã VietQR.',
        stepThree: '3. Giữ màn hình này mở; trạng thái sẽ tự cập nhật sau khi SePay xác thực.',
        stepTwo: '2. Kiểm tra đúng số tiền và nội dung chuyển khoản trước khi xác nhận ở ngân hàng.',
        transferLabel: 'Nội dung chuyển khoản',
        unavailableCopy: 'Thanh toán hiện chưa thể tiếp tục. Hãy cập nhật trạng thái để nhận thông tin mới nhất từ hệ thống.',
        unavailableStatus: 'Chưa thể tiếp tục thanh toán',
        unavailableTitle: 'Thanh toán chưa thể tiếp tục',
      }
    : {
        amountLabel: 'Amount to transfer',
        amountMismatchCopy: 'Do not send additional money for this job. The system must reconcile the transaction before any next step.',
        amountMismatchStatus: 'Amount reconciliation required',
        amountMismatchTitle: 'The received amount does not match',
        expectedAmountLabel: 'Amount to verify',
        heading: 'Pay with VietQR',
        instructionsUnavailableCopy: 'Do not transfer money until the system reloads and verifies the payment instructions.',
        instructionsUnavailableStatus: 'Checking payment details',
        instructionsUnavailableTitle: 'The VietQR details cannot be verified.',
        noManualConfirmation: 'No payment confirmation is needed. The system updates only after SePay verifies the transaction.',
        receivedCopy: 'The transaction was received and is being verified. Do not send additional money.',
        receivedStatus: 'Completing verification',
        receivedAmountLabel: 'Amount recorded by the system',
        receivedTitle: 'The transaction is being verified',
        readyStatus: 'Waiting for SePay verification',
        refreshLabel: 'Refresh status',
        refreshingLabel: 'Refreshing',
        stepOne: '1. Open your banking app and scan the VietQR code.',
        stepThree: '3. Keep this screen open; the status updates after SePay verifies the transfer.',
        stepTwo: '2. Check the amount and transfer content before confirming in your banking app.',
        transferLabel: 'Transfer content',
        unavailableCopy: 'Payment cannot continue right now. Refresh the status to receive the latest information from the system.',
        unavailableStatus: 'Payment cannot continue',
        unavailableTitle: 'Payment cannot continue',
      }
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
  paymentAmount: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  paymentDetails: {
    alignItems: 'flex-start',
    gap: 12,
    width: '100%',
  },
  paymentHeader: {
    gap: 3,
  },
  paymentHeading: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  paymentInstruction: {
    fontSize: 14,
    lineHeight: 20,
  },
  paymentInstructions: {
    gap: 5,
  },
  paymentIssue: {
    gap: 9,
  },
  paymentIssueAmount: {
    gap: 2,
  },
  paymentIssueTitle: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  paymentLabel: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  paymentQrFrame: {
    alignSelf: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    height: SEPAY_VIETQR_BOX_SIZE,
    justifyContent: 'center',
    padding: 8,
    width: SEPAY_VIETQR_BOX_SIZE,
  },
  paymentQr: {
    height: SEPAY_VIETQR_BOX_SIZE - 16,
    width: SEPAY_VIETQR_BOX_SIZE - 16,
  },
  paymentStatus: {
    fontSize: 14,
    lineHeight: 20,
  },
  paymentTransferContent: {
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    letterSpacing: 0.4,
    lineHeight: 21,
  },
  paymentWaiting: {
    fontSize: 14,
    lineHeight: 20,
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
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  phaseHistoryEntryTitle: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
  },
  phaseHistoryHeading: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
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
  review: {
    gap: 10,
  },
})
