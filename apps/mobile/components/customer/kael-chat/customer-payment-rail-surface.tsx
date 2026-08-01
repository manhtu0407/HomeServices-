import { useState, type ReactNode } from 'react'
import { Image } from 'expo-image'
import { StyleSheet, Text, View } from 'react-native'

import { KaelButton } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import { toWorkflowPhase, type LocalDeal } from '@nestscout/shared'

import type { CustomerThemeTokens } from '../customer-theme'
import { CaseWideMintAura } from '../ui/aura-surfaces'
import { formatVnd, isDealPaymentProtected } from './case-work-money-display-model'
import type { PaymentRailProvider } from './case-work-response-model'
import { buildSePayVietQrPaymentPresentation } from './sepay-vietqr-payment-display-model'

const SEPAY_VIETQR_BOX_SIZE = 256

type CustomerPaymentRailSurfaceProps = {
  deal: LocalDeal
  language: AppLanguage
  onCreatePaymentIntent: () => void
  onRefreshPayment: () => void
  paymentBusy: boolean
  paymentRailProvider: PaymentRailProvider
  refreshingPayment: boolean
  reviewControls: ReactNode
  tokens: CustomerThemeTokens
}

export function CustomerPaymentRailSurface({
  deal,
  language,
  onCreatePaymentIntent,
  onRefreshPayment,
  paymentBusy,
  paymentRailProvider,
  refreshingPayment,
  reviewControls,
  tokens,
}: CustomerPaymentRailSurfaceProps) {
  const phase = toWorkflowPhase(deal.backendStatus ?? deal.status)
  if (phase !== 'customer_confirmed_completion' && phase !== 'payment_pending' && phase !== 'paid') return null

  if (phase === 'paid') {
    if (deal.payment?.provider === 'cash' && deal.payment.status === 'cash_confirmed') {
      return <CashPaymentReceipt deal={deal} language={language} reviewControls={reviewControls} tokens={tokens} />
    }
    return isDealPaymentProtected(deal)
      ? <VerifiedPaymentReceipt deal={deal} language={language} reviewControls={reviewControls} tokens={tokens} />
      : <PaymentVerificationPending language={language} onRefresh={onRefreshPayment} refreshing={refreshingPayment} tokens={tokens} />
  }

  if (phase === 'customer_confirmed_completion') {
    return paymentRailProvider === 'sepay_vietqr'
      ? (
          <PaymentSurface
            status={language === 'vi' ? 'Sẵn sàng tạo mã' : 'Ready to create code'}
            testID="customer-v21-case-payment-start"
            title={language === 'vi' ? 'Thanh toán qua VietQR' : 'Pay with VietQR'}
            tokens={tokens}
          >
            <Text style={[styles.body, { color: tokens.muted }]}>
              {language === 'vi'
                ? 'Kael sẽ lấy mã VietQR từ hệ thống. Kiểm tra số tiền và nội dung chuyển khoản chỉ sau khi mã xuất hiện.'
                : 'Kael will fetch a VietQR code from the system. Check the amount and transfer content only after the code appears.'}
            </Text>
            <KaelButton
              accessibilityState={{ busy: paymentBusy, disabled: paymentBusy }}
              disabled={paymentBusy}
              label={paymentBusy
                ? (language === 'vi' ? 'Đang tạo mã VietQR' : 'Creating VietQR code')
                : (language === 'vi' ? 'Tạo mã VietQR' : 'Create VietQR code')}
              onPress={onCreatePaymentIntent}
              testID="customer-v21-case-sepay-payment-start"
            />
          </PaymentSurface>
        )
      : <PaymentUnavailable language={language} tokens={tokens} />
  }

  if (!deal.payment || deal.payment.provider !== 'sepay_vietqr') {
    return <PaymentUnavailable language={language} onRefresh={onRefreshPayment} refreshing={refreshingPayment} tokens={tokens} />
  }

  return (
    <PendingVietQrPayment
      key={deal.payment.qrImageUrl ?? deal.payment.status}
      language={language}
      onRefresh={onRefreshPayment}
      payment={deal.payment}
      paymentRailAvailable={paymentRailProvider === 'sepay_vietqr'}
      refreshing={refreshingPayment}
      tokens={tokens}
    />
  )
}

function CashPaymentReceipt({
  deal,
  language,
  reviewControls,
  tokens,
}: {
  deal: LocalDeal
  language: AppLanguage
  reviewControls: ReactNode
  tokens: CustomerThemeTokens
}) {
  const amount = safeAmount(deal.payment?.amountReceived) ?? safeAmount(deal.payment?.grossAmount)
  const copy = paymentCopy(language)

  return (
    <PaymentSurface
      status={language === 'vi' ? 'Đã ghi nhận' : 'Recorded'}
      testID="customer-v21-case-cash-payment-confirmed"
      title={language === 'vi' ? 'Thanh toán tiền mặt đã ghi nhận' : 'Cash payment recorded'}
      tokens={tokens}
    >
      <Text style={[styles.body, { color: tokens.muted }]}>
        {language === 'vi'
          ? 'Thợ đã xác nhận đã nhận thanh toán. Bạn có thể đánh giá chất lượng công việc.'
          : 'The worker confirmed receiving payment. You can review the completed work.'}
      </Text>
      {amount !== null ? <PaymentAmount amount={amount} label={copy.confirmedAmountLabel} language={language} tokens={tokens} /> : null}
      <View style={[styles.reviewSection, { borderTopColor: tokens.border }]}>
        <Text accessibilityRole="header" style={[styles.reviewHeading, { color: tokens.text }]}>{copy.reviewTitle}</Text>
        <Text style={[styles.body, { color: tokens.muted }]}>{copy.reviewBody}</Text>
        {reviewControls}
      </View>
    </PaymentSurface>
  )
}

function PendingVietQrPayment({
  language,
  onRefresh,
  payment,
  paymentRailAvailable,
  refreshing,
  tokens,
}: {
  language: AppLanguage
  onRefresh: () => void
  payment: NonNullable<LocalDeal['payment']>
  paymentRailAvailable: boolean
  refreshing: boolean
  tokens: CustomerThemeTokens
}) {
  const [imageLoadFailed, setImageLoadFailed] = useState(false)
  const presentation = buildSePayVietQrPaymentPresentation({ imageLoadFailed, payment, paymentRailAvailable })
  const copy = paymentCopy(language)

  return (
    <PaymentSurface
      status={paymentStatus(presentation.kind, payment.status, copy)}
      testID="customer-v21-case-payment-pending"
      title={copy.pendingTitle}
      tokens={tokens}
    >
      {presentation.kind === 'ready' ? (
        <>
          <View style={styles.qrFrame} testID="customer-v21-case-sepay-qr-frame">
            <Image
              accessibilityLabel={copy.qrLabel}
              contentFit="contain"
              onError={() => setImageLoadFailed(true)}
              source={{ uri: presentation.qrImageUrl }}
              style={styles.qr}
              testID="customer-v21-case-sepay-qr"
            />
          </View>
          <PaymentAmount amount={presentation.expectedAmount} label={copy.amountLabel} language={language} tokens={tokens} />
          <View style={styles.detailGroup}>
            <Text style={[styles.label, { color: tokens.muted }]}>{copy.transferLabel}</Text>
            <Text selectable style={[styles.transferContent, { color: tokens.primary }]} testID="customer-v21-case-sepay-transfer-content">
              {presentation.transferContent}
            </Text>
          </View>
          <View style={[styles.instructions, { borderTopColor: tokens.border }]}>
            <Text style={[styles.instruction, { color: tokens.muted }]}>{copy.stepOne}</Text>
            <Text style={[styles.instruction, { color: tokens.muted }]}>{copy.stepTwo}</Text>
            <Text style={[styles.instruction, { color: tokens.muted }]}>{copy.stepThree}</Text>
          </View>
          <Text style={[styles.note, { color: tokens.muted }]}>{copy.noManualConfirmation}</Text>
        </>
      ) : presentation.kind === 'amount_mismatch' ? (
        <PaymentMessage
          body={copy.amountMismatchBody}
          title={copy.amountMismatchTitle}
          tokens={tokens}
        >
          <PaymentAmount amount={presentation.expectedAmount} label={copy.expectedAmountLabel} language={language} tokens={tokens} />
          <PaymentAmount amount={presentation.receivedAmount} label={copy.receivedAmountLabel} language={language} tokens={tokens} />
        </PaymentMessage>
      ) : presentation.kind === 'received' ? (
        <PaymentMessage body={copy.receivedBody} title={copy.receivedTitle} tokens={tokens} />
      ) : payment.status === 'code_requested' || payment.status === 'pending' ? (
        <PaymentMessage body={copy.preparingBody} title={copy.preparingTitle} tokens={tokens} />
      ) : presentation.kind === 'unavailable' ? (
        <PaymentMessage body={copy.unavailableBody} title={copy.unavailableTitle} tokens={tokens} />
      ) : (
        <PaymentMessage body={copy.instructionsUnavailableBody} title={copy.instructionsUnavailableTitle} tokens={tokens} />
      )}
      <KaelButton
        accessibilityState={{ busy: refreshing, disabled: refreshing }}
        disabled={refreshing}
        label={refreshing ? copy.refreshingLabel : copy.refreshLabel}
        onPress={() => {
          setImageLoadFailed(false)
          onRefresh()
        }}
        size="small"
        testID="customer-v21-case-sepay-payment-refresh"
        variant="secondary"
      />
    </PaymentSurface>
  )
}

function VerifiedPaymentReceipt({
  deal,
  language,
  reviewControls,
  tokens,
}: {
  deal: LocalDeal
  language: AppLanguage
  reviewControls: ReactNode
  tokens: CustomerThemeTokens
}) {
  const payment = deal.payment
  const amount = safeAmount(payment?.amountReceived) ?? safeAmount(payment?.grossAmount)
  const copy = paymentCopy(language)

  return (
    <PaymentSurface
      status={copy.confirmedStatus}
      testID="customer-v21-case-payment-confirmed"
      title={copy.confirmedTitle}
      tokens={tokens}
    >
      <Text style={[styles.body, { color: tokens.muted }]}>{copy.confirmedBody}</Text>
      {amount !== null ? <PaymentAmount amount={amount} label={copy.confirmedAmountLabel} language={language} tokens={tokens} /> : null}
      <View style={[styles.reviewSection, { borderTopColor: tokens.border }]}>
        <Text accessibilityRole="header" style={[styles.reviewHeading, { color: tokens.text }]}>{copy.reviewTitle}</Text>
        <Text style={[styles.body, { color: tokens.muted }]}>{copy.reviewBody}</Text>
        {reviewControls}
      </View>
    </PaymentSurface>
  )
}

function PaymentVerificationPending({
  language,
  onRefresh,
  refreshing,
  tokens,
}: {
  language: AppLanguage
  onRefresh: () => void
  refreshing: boolean
  tokens: CustomerThemeTokens
}) {
  const copy = paymentCopy(language)
  return (
    <PaymentSurface
      status={copy.verificationPendingStatus}
      testID="customer-v21-case-payment-verification-pending"
      title={copy.verificationPendingTitle}
      tokens={tokens}
    >
      <Text style={[styles.body, { color: tokens.muted }]}>{copy.verificationPendingBody}</Text>
      <KaelButton
        accessibilityState={{ busy: refreshing, disabled: refreshing }}
        disabled={refreshing}
        label={refreshing ? copy.refreshingLabel : copy.refreshLabel}
        onPress={onRefresh}
        size="small"
        testID="customer-v21-case-sepay-payment-refresh"
        variant="secondary"
      />
    </PaymentSurface>
  )
}

function PaymentUnavailable({
  language,
  onRefresh,
  refreshing,
  tokens,
}: {
  language: AppLanguage
  onRefresh?: () => void
  refreshing?: boolean
  tokens: CustomerThemeTokens
}) {
  const copy = paymentCopy(language)
  return (
    <PaymentSurface
      status={copy.unavailableStatus}
      testID="customer-v21-case-payment-unavailable"
      title={copy.unavailableTitle}
      tokens={tokens}
    >
      <Text style={[styles.body, { color: tokens.muted }]}>{copy.unavailableBody}</Text>
      {onRefresh ? (
        <KaelButton
          accessibilityState={{ busy: refreshing, disabled: refreshing }}
          disabled={refreshing}
          label={refreshing ? copy.refreshingLabel : copy.refreshLabel}
          onPress={onRefresh}
          size="small"
          testID="customer-v21-case-sepay-payment-refresh"
          variant="secondary"
        />
      ) : null}
    </PaymentSurface>
  )
}

function PaymentSurface({
  children,
  status,
  testID,
  title,
  tokens,
}: {
  children: ReactNode
  status: string
  testID: string
  title: string
  tokens: CustomerThemeTokens
}) {
  return (
    <View
      accessibilityLabel={`${title}. ${status}`}
      style={[styles.surface, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
      testID={testID}
    >
      <CaseWideMintAura scope={`CustomerPaymentRail${testID}`} testID={`${testID}-mint-aura`} />
      <View style={styles.surfaceContent}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={[styles.heading, { color: tokens.text }]}>{title}</Text>
          <Text accessibilityLiveRegion="polite" style={[styles.status, { color: tokens.primary }]}>{status}</Text>
        </View>
        {children}
      </View>
    </View>
  )
}

function PaymentAmount({
  amount,
  label,
  language,
  tokens,
}: {
  amount: number | null
  label: string
  language: AppLanguage
  tokens: CustomerThemeTokens
}) {
  if (amount === null) return null
  return (
    <View style={styles.detailGroup}>
      <Text style={[styles.label, { color: tokens.muted }]}>{label}</Text>
      <Text style={[styles.amount, { color: tokens.text }]}>{formatVnd(amount, language)}</Text>
    </View>
  )
}

function PaymentMessage({
  body,
  children,
  title,
  tokens,
}: {
  body: string
  children?: ReactNode
  title: string
  tokens: CustomerThemeTokens
}) {
  return (
    <View style={[styles.message, { backgroundColor: tokens.base, borderColor: tokens.border }]}>
      <Text style={[styles.messageTitle, { color: tokens.text }]}>{title}</Text>
      <Text style={[styles.body, { color: tokens.muted }]}>{body}</Text>
      {children}
    </View>
  )
}

function paymentStatus(
  kind: ReturnType<typeof buildSePayVietQrPaymentPresentation>['kind'],
  status: NonNullable<LocalDeal['payment']>['status'],
  copy: ReturnType<typeof paymentCopy>,
) {
  if (kind === 'ready') return copy.readyStatus
  if (kind === 'amount_mismatch') return copy.amountMismatchStatus
  if (kind === 'received') return copy.receivedStatus
  if (status === 'code_requested' || status === 'pending') return copy.preparingStatus
  if (kind === 'unavailable') return copy.unavailableStatus
  return copy.instructionsUnavailableStatus
}

function safeAmount(value: number | null | undefined) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
}

function paymentCopy(language: AppLanguage) {
  return language === 'vi'
    ? {
        amountLabel: 'Số tiền cần chuyển',
        amountMismatchBody: 'Không chuyển thêm tiền cho công việc này. Hệ thống cần đối chiếu giao dịch trước khi mở bước tiếp theo.',
        amountMismatchStatus: 'Cần đối chiếu',
        amountMismatchTitle: 'Số tiền nhận được chưa khớp',
        confirmedAmountLabel: 'Số tiền đã xác minh',
        confirmedBody: 'Hệ thống đã đối chiếu giao dịch thành công. Bạn có thể đánh giá chất lượng công việc.',
        confirmedStatus: 'Đã xác thực',
        confirmedTitle: 'Thanh toán đã được xác nhận',
        expectedAmountLabel: 'Số tiền cần xác minh',
        instructionsUnavailableBody: 'Đừng chuyển tiền cho đến khi hệ thống tải lại và xác minh thông tin thanh toán.',
        instructionsUnavailableStatus: 'Đang kiểm tra thông tin',
        instructionsUnavailableTitle: 'Thông tin VietQR chưa thể xác minh.',
        noManualConfirmation: 'Không cần bấm xác nhận thanh toán. Hệ thống chỉ mở bước đánh giá sau khi giao dịch được xác thực.',
        pendingTitle: 'Thanh toán qua VietQR',
        preparingBody: 'Hệ thống đang chuẩn bị hoặc cập nhật lệnh thanh toán. Chưa chuyển tiền cho đến khi mã VietQR hợp lệ xuất hiện.',
        preparingStatus: 'Đang chuẩn bị',
        preparingTitle: 'Đang chuẩn bị thanh toán',
        qrLabel: 'Mã VietQR thanh toán',
        readyStatus: 'Chờ xác nhận giao dịch',
        receivedBody: 'Giao dịch đã được tiếp nhận và đang được xác minh. Không cần chuyển thêm tiền.',
        receivedStatus: 'Đang xác minh',
        receivedTitle: 'Giao dịch đang được xác minh',
        receivedAmountLabel: 'Số tiền hệ thống ghi nhận',
        refreshLabel: 'Cập nhật trạng thái',
        refreshingLabel: 'Đang cập nhật',
        reviewBody: 'Đánh giá sẽ được lưu vào công việc này sau khi bạn gửi.',
        reviewTitle: 'Đánh giá công việc',
        stepOne: '1. Mở ứng dụng ngân hàng và quét mã VietQR.',
        stepThree: '3. Giữ màn hình này mở; trạng thái sẽ tự cập nhật sau khi giao dịch được xác thực.',
        stepTwo: '2. Kiểm tra đúng số tiền và nội dung chuyển khoản trước khi xác nhận ở ngân hàng.',
        transferLabel: 'Nội dung chuyển khoản',
        unavailableBody: 'Hệ thống chưa có phương thức thanh toán đã được xác thực cho công việc này. Kael sẽ chỉ mở bước đánh giá sau khi giao dịch được xác nhận.',
        unavailableStatus: 'Chưa khả dụng',
        unavailableTitle: 'Thanh toán chưa thể tiếp tục',
        verificationPendingBody: 'Công việc đang chờ bản ghi thanh toán được hệ thống xác thực. Bước đánh giá vẫn được khóa để bảo vệ trạng thái giao dịch.',
        verificationPendingStatus: 'Đang chờ xác thực',
        verificationPendingTitle: 'Thanh toán đang được xác minh',
      }
    : {
        amountLabel: 'Amount to transfer',
        amountMismatchBody: 'Do not send more money for this work. The system must reconcile the transaction before opening the next step.',
        amountMismatchStatus: 'Reconciliation needed',
        amountMismatchTitle: 'The received amount does not match',
        confirmedAmountLabel: 'Verified amount',
        confirmedBody: 'The system reconciled the transaction successfully. You can review the work quality.',
        confirmedStatus: 'Verified',
        confirmedTitle: 'Payment has been confirmed',
        expectedAmountLabel: 'Amount to verify',
        instructionsUnavailableBody: 'Do not transfer money until the system reloads and verifies the payment instructions.',
        instructionsUnavailableStatus: 'Checking information',
        instructionsUnavailableTitle: 'VietQR information cannot be verified yet.',
        noManualConfirmation: 'You do not need to confirm payment. The review step opens only after the transaction is verified.',
        pendingTitle: 'Pay with VietQR',
        preparingBody: 'The system is preparing or updating the payment order. Do not transfer money until a valid VietQR code appears.',
        preparingStatus: 'Preparing',
        preparingTitle: 'Preparing payment',
        qrLabel: 'VietQR payment code',
        readyStatus: 'Awaiting transaction confirmation',
        receivedBody: 'The transaction was received and is being verified. Do not send more money.',
        receivedStatus: 'Verifying',
        receivedTitle: 'Transaction is being verified',
        receivedAmountLabel: 'Amount recorded by the system',
        refreshLabel: 'Refresh status',
        refreshingLabel: 'Refreshing',
        reviewBody: 'Your review will be saved to this work after you submit it.',
        reviewTitle: 'Review the work',
        stepOne: '1. Open your banking app and scan the VietQR code.',
        stepThree: '3. Keep this screen open; the status updates after the transaction is verified.',
        stepTwo: '2. Check the amount and transfer content before confirming in your banking app.',
        transferLabel: 'Transfer content',
        unavailableBody: 'The system does not have a verified payment method for this work yet. Kael opens review only after a transaction is verified.',
        unavailableStatus: 'Unavailable',
        unavailableTitle: 'Payment cannot continue yet',
        verificationPendingBody: 'This work is waiting for the payment record to be verified by the system. The review step remains locked to protect the transaction state.',
        verificationPendingStatus: 'Awaiting verification',
        verificationPendingTitle: 'Payment is being verified',
      }
}

const styles = StyleSheet.create({
  amount: {
    fontSize: 22,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    lineHeight: 29,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  detailGroup: {
    gap: 4,
  },
  header: {
    gap: 4,
  },
  heading: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 27,
  },
  instruction: {
    fontSize: 14,
    lineHeight: 20,
  },
  instructions: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 7,
    paddingTop: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  message: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
    padding: 14,
  },
  messageTitle: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  note: {
    fontSize: 14,
    lineHeight: 20,
  },
  qr: {
    height: '100%',
    width: '100%',
  },
  qrFrame: {
    alignSelf: 'center',
    alignItems: 'center',
    aspectRatio: 1,
    backgroundColor: '#ffffff',
    borderColor: '#d8ece8',
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    maxWidth: SEPAY_VIETQR_BOX_SIZE,
    padding: 10,
    width: '100%',
  },
  reviewHeading: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  reviewSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
    paddingTop: 18,
  },
  status: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  surface: {
    alignSelf: 'center',
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 608,
    overflow: 'hidden',
    padding: 20,
    position: 'relative',
    width: '100%',
  },
  surfaceContent: {
    gap: 18,
    zIndex: 1,
  },
  transferContent: {
    fontSize: 16,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    letterSpacing: 0.35,
    lineHeight: 22,
  },
})
