import { typography } from '@/design/theme'
import { useEffect, useState, type ReactNode } from 'react'
import { Image } from 'expo-image'
import { StyleSheet, Text, View } from 'react-native'

import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { FormulaMintCardAura } from '@/components/ui/formula-mint-card'
import { KaelButton } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import { toWorkflowPhase, type LocalDeal } from '@nestscout/shared'

import type { CustomerThemeTokens } from '../customer-theme'
import { formatVnd, isDealPaymentProtected } from './case-work-money-display-model'
import type { PaymentRailProvider } from './case-work-response-model'
import { customerRefundDisplayModel } from './customer-refund-display-model'

const QR_BOX_SIZE = 256

type PaymentBusyAction =
  | 'manual_order'
  | 'manual_claim'
  | null

type PaymentRefreshResult = 'failed' | 'success' | null

type CustomerPaymentRailSurfaceProps = {
  deal: LocalDeal
  language: AppLanguage
  onClaimManualBankPayment: () => void
  onCreateManualBankPaymentOrder: () => void
  onRefreshPayment: () => void
  paymentBusy: boolean
  paymentBusyAction: PaymentBusyAction
  paymentRailProvider: PaymentRailProvider
  paymentRefreshResult: PaymentRefreshResult
  refreshingPayment: boolean
  reduceMotion: boolean
  reviewControls: ReactNode
  tokens: CustomerThemeTokens
}

export function CustomerPaymentRailSurface({
  deal,
  language,
  onClaimManualBankPayment,
  onCreateManualBankPaymentOrder,
  onRefreshPayment,
  paymentBusy,
  paymentBusyAction,
  paymentRailProvider,
  paymentRefreshResult,
  refreshingPayment,
  reduceMotion,
  reviewControls,
  tokens,
}: CustomerPaymentRailSurfaceProps) {
  const refund = customerRefundDisplayModel(deal.payment, language)
  if (refund) {
    return (
      <PaymentSurface status={refund.status} testID="customer-v21-case-refund-reconciliation" title={refund.title} tokens={tokens}>
        <Text style={[styles.body, { color: tokens.muted }]}>{refund.noteCopy}</Text>
        <PaymentAmount amount={refund.amount} label={refund.amountLabel} language={language} tokens={tokens} />
        <RefreshButton language={language} onRefresh={onRefreshPayment} refreshResult={paymentRefreshResult} refreshing={refreshingPayment} />
      </PaymentSurface>
    )
  }
  const phase = toWorkflowPhase(deal.backendStatus ?? deal.status)
  if (phase !== 'customer_confirmed_completion' && phase !== 'payment_pending' && phase !== 'paid') return null

  if (phase === 'paid') {
    if (!isDealPaymentProtected(deal)) {
      return (
        <PaymentSurface status={copy(language).reconcileStatus} testID="customer-v21-case-payment-receipt-unverified" title={copy(language).reconcileTitle} tokens={tokens}>
          <Text style={[styles.body, { color: tokens.muted }]}>{copy(language).unverifiedReceiptBody}</Text>
          <RefreshButton language={language} onRefresh={onRefreshPayment} refreshResult={paymentRefreshResult} refreshing={refreshingPayment} />
        </PaymentSurface>
      )
    }
    return <ConfirmedPaymentReceipt deal={deal} language={language} reviewControls={reviewControls} tokens={tokens} />
  }

  if (phase === 'customer_confirmed_completion') {
    if (paymentRailProvider === 'platform_bank_manual') {
      return (
        <PaymentSurface
          status={language === 'vi' ? 'Đang tạo lệnh riêng cho công việc' : 'Creating this work’s transfer order'}
          testID="customer-v21-case-manual-payment-start"
          title={language === 'vi' ? 'Thanh toán qua tài khoản nền tảng' : 'Pay through the platform account'}
          tokens={tokens}
        >
          <Text style={[styles.body, { color: tokens.muted }]}>
            {language === 'vi'
              ? 'Hệ thống tạo QR, số tiền và nội dung chuyển khoản riêng cho công việc này. Chỉ báo đã chuyển sau khi hoàn tất tại ngân hàng.'
              : 'The system creates a QR, amount, and transfer content unique to this work. Claim it only after completing the bank transfer.'}
          </Text>
          <KaelButton
            accessibilityState={{ busy: paymentBusy, disabled: paymentBusy }}
            disabled={paymentBusy}
            label={paymentBusyAction === 'manual_order'
              ? (language === 'vi' ? 'Đang tạo lệnh' : 'Creating order')
              : (language === 'vi' ? 'Tạo lại lệnh thanh toán' : 'Create payment order again')}
            onPress={onCreateManualBankPaymentOrder}
            testID="customer-v21-case-manual-payment-create"
          />
        </PaymentSurface>
      )
    }
    return <PaymentUnavailable language={language} tokens={tokens} />
  }

  if (deal.payment?.provider === 'direct_worker') {
    return (
      <DirectWorkerPayment
        deal={deal}
        language={language}
        onRefresh={onRefreshPayment}
        refreshing={refreshingPayment}
        reduceMotion={reduceMotion}
        tokens={tokens}
      />
    )
  }
  if (deal.payment?.provider === 'platform_bank_manual') {
    return (
      <ManualBankPayment
        deal={deal}
        language={language}
        onClaim={onClaimManualBankPayment}
        onRefresh={onRefreshPayment}
        paymentBusy={paymentBusy}
        paymentBusyAction={paymentBusyAction}
        paymentRailAvailable={paymentRailProvider === 'platform_bank_manual' && deal.paymentRailAvailable !== false}
        refreshResult={paymentRefreshResult}
        refreshing={refreshingPayment}
        reduceMotion={reduceMotion}
        tokens={tokens}
      />
    )
  }
  if (deal.payment?.provider === 'sepay_vietqr') {
    return <LegacyVietQrPayment deal={deal} language={language} onRefresh={onRefreshPayment} refreshing={refreshingPayment} tokens={tokens} />
  }
  return <PaymentUnavailable language={language} onRefresh={onRefreshPayment} refreshing={refreshingPayment} tokens={tokens} />
}

function ManualBankPayment({
  deal,
  language,
  onClaim,
  onRefresh,
  paymentBusy,
  paymentBusyAction,
  paymentRailAvailable,
  refreshResult,
  refreshing,
  reduceMotion,
  tokens,
}: {
  deal: LocalDeal
  language: AppLanguage
  onClaim: () => void
  onRefresh: () => void
  paymentBusy: boolean
  paymentBusyAction: PaymentBusyAction
  paymentRailAvailable: boolean
  refreshResult: PaymentRefreshResult
  refreshing: boolean
  reduceMotion: boolean
  tokens: CustomerThemeTokens
}) {
  const payment = deal.payment
  if (!payment) return <PaymentUnavailable language={language} onRefresh={onRefresh} refreshing={refreshing} tokens={tokens} />
  if (payment.status === 'manual_customer_claimed') {
    return (
      <PaymentSurface status={copy(language).awaitingAdminStatus} testID="customer-v21-case-manual-payment-claimed" title={copy(language).awaitingAdminTitle} tokens={tokens}>
        <Text style={[styles.body, { color: tokens.muted }]}>{copy(language).awaitingAdminBody}</Text>
        <PaymentAmount amount={safeAmount(payment.grossAmount)} label={copy(language).orderAmountLabel} language={language} tokens={tokens} />
        <RefreshButton language={language} onRefresh={onRefresh} refreshResult={refreshResult} refreshing={refreshing} />
      </PaymentSurface>
    )
  }
  if (payment.status === 'manual_reconcile_required' || payment.status === 'manual_verified') {
    return (
      <PaymentSurface status={copy(language).reconcileStatus} testID="customer-v21-case-manual-payment-reconcile" title={copy(language).reconcileTitle} tokens={tokens}>
        <Text style={[styles.body, { color: tokens.muted }]}>{payment.status === 'manual_verified' ? copy(language).verifiedReceiptPendingBody : copy(language).reconcileBody}</Text>
        <PaymentAmount amount={safeAmount(payment.grossAmount)} label={copy(language).orderAmountLabel} language={language} tokens={tokens} />
        <RefreshButton language={language} onRefresh={onRefresh} refreshResult={refreshResult} refreshing={refreshing} />
      </PaymentSurface>
    )
  }
  if (!paymentRailAvailable) {
    const text = copy(language)
    return (
      <PaymentSurface status={text.unavailableStatus} testID="customer-v21-case-manual-payment-paused" title={text.pausedTitle} tokens={tokens}>
        <Text style={[styles.body, { color: tokens.muted }]}>{text.pausedBody}</Text>
        <PaymentAmount amount={safeAmount(payment.grossAmount)} label={text.orderAmountLabel} language={language} tokens={tokens} />
        <RefreshButton language={language} onRefresh={onRefresh} refreshResult={refreshResult} refreshing={refreshing} />
      </PaymentSurface>
    )
  }
  if (payment.status !== 'manual_qr_ready' || !payment.qrImageUrl || !payment.transferContent) {
    return (
      <PaymentSurface status={copy(language).preparingStatus} testID="customer-v21-case-manual-payment-preparing" title={copy(language).preparingTitle} tokens={tokens}>
        <Text style={[styles.body, { color: tokens.muted }]}>{copy(language).preparingBody}</Text>
        <RefreshButton language={language} onRefresh={onRefresh} refreshing={refreshing} />
      </PaymentSurface>
    )
  }

  const text = copy(language)
  return (
    <PaymentSurface status={text.readyStatus} testID="customer-v21-case-manual-payment-ready" title={text.readyTitle} tokens={tokens}>
      <View style={styles.qrFrame} testID="customer-v21-case-manual-qr-frame">
        <Image
          accessibilityLabel={text.qrLabel}
          contentFit="contain"
          source={{ uri: payment.qrImageUrl }}
          style={styles.qr}
          testID="customer-v21-case-manual-qr"
        />
      </View>
      <PaymentAmount amount={safeAmount(payment.grossAmount)} label={text.amountLabel} language={language} tokens={tokens} />
      <View style={styles.detailGroup}>
        <Text style={[styles.label, { color: tokens.muted }]}>{text.transferLabel}</Text>
        <Text selectable style={[styles.transferContent, { color: tokens.primary }]} testID="customer-v21-case-manual-transfer-content">{payment.transferContent}</Text>
      </View>
      <View style={styles.accountRows}>
        <PaymentDetail label={text.bankLabel} value={payment.bankCode ?? text.accountPending} tokens={tokens} />
        <PaymentDetail label={text.accountHolderLabel} value={payment.accountHolder ?? text.accountPending} tokens={tokens} />
        <PaymentDetail label={text.accountLabel} value={payment.accountMasked ?? text.accountPending} tokens={tokens} />
      </View>
      <View style={[styles.instructions, { borderTopColor: tokens.border }]}>
        <Text style={[styles.instruction, { color: tokens.muted }]}>{text.stepOne}</Text>
        <Text style={[styles.instruction, { color: tokens.muted }]}>{text.stepTwo}</Text>
        <Text style={[styles.instruction, { color: tokens.muted }]}>{text.stepThree}</Text>
      </View>
      <KaelButton
        accessibilityState={{ busy: paymentBusyAction === 'manual_claim', disabled: paymentBusy }}
        disabled={paymentBusy}
        label={paymentBusyAction === 'manual_claim' ? text.claimingLabel : text.claimLabel}
        onPress={onClaim}
        testID="customer-v21-case-manual-payment-claim"
      />
    </PaymentSurface>
  )
}

function DirectWorkerPayment({
  deal,
  language,
  onRefresh,
  refreshing,
  reduceMotion,
  tokens,
}: {
  deal: LocalDeal
  language: AppLanguage
  onRefresh: () => void
  refreshing: boolean
  reduceMotion: boolean
  tokens: CustomerThemeTokens
}) {
  const deadlineLabel = useRealDeadlineLabel(deal.payment?.directResponseDeadline, language, reduceMotion)
  const payment = deal.payment
  if (!payment) return null
  const text = copy(language)
  const customerConfirmed = Boolean(payment.directCustomerConfirmedAt)
  const isReconcile = payment.status === 'direct_reconcile_required'
  const isAdminPending = payment.status === 'direct_admin_confirmation_required'
  return (
    <PaymentSurface
      status={isReconcile ? text.reconcileStatus : isAdminPending ? text.directAdminStatus : text.directStatus}
      testID="customer-v21-case-direct-payment"
      title={isReconcile ? text.reconcileTitle : isAdminPending ? text.directAdminPendingTitle : text.directPendingTitle}
      tokens={tokens}
    >
      <Text style={[styles.body, { color: tokens.muted }]}>
        {isReconcile ? text.directReconcileBody : isAdminPending ? text.directAdminPendingBody : text.directPendingBody}
      </Text>
      <PaymentAmount amount={safeAmount(payment.grossAmount)} label={text.recordedAmountLabel} language={language} tokens={tokens} />
      {payment.collateralAmount ? <PaymentDetail label={text.collateralLabel} value={formatVnd(payment.collateralAmount, language)} tokens={tokens} /> : null}
      {deadlineLabel ? <PaymentDetail label={text.responseDeadlineLabel} value={deadlineLabel} tokens={tokens} /> : null}
      {!isReconcile && !isAdminPending && !customerConfirmed ? (
        <Text style={[styles.note, { color: tokens.muted }]}>
          {language === 'vi'
            ? 'Phương thức cũ này chỉ được giữ để đối soát. Không thể xác nhận thanh toán trực tiếp từ ứng dụng.'
            : 'This legacy method is retained for reconciliation only. Direct payment cannot be confirmed in the app.'}
        </Text>
      ) : null}
      <RefreshButton language={language} onRefresh={onRefresh} refreshing={refreshing} />
    </PaymentSurface>
  )
}

function ConfirmedPaymentReceipt({ deal, language, reviewControls, tokens }: {
  deal: LocalDeal
  language: AppLanguage
  reviewControls: ReactNode
  tokens: CustomerThemeTokens
}) {
  const payment = deal.payment
  const text = copy(language)
  const direct = payment?.provider === 'direct_worker'
  return (
    <PaymentSurface status={text.confirmedStatus} testID="customer-v21-case-payment-confirmed" title={direct ? text.directConfirmedTitle : text.confirmedTitle} tokens={tokens}>
      <Text style={[styles.body, { color: tokens.muted }]}>{direct ? text.directConfirmedBody : text.confirmedBody}</Text>
      <PaymentAmount amount={safeAmount(payment?.amountReceived) ?? safeAmount(payment?.grossAmount)} label={text.confirmedAmountLabel} language={language} tokens={tokens} />
      <View style={[styles.reviewSection, { borderTopColor: tokens.border }]}>
        <Text accessibilityRole="header" style={[styles.reviewHeading, { color: tokens.text }]}>{text.reviewTitle}</Text>
        <Text style={[styles.body, { color: tokens.muted }]}>{text.reviewBody}</Text>
        {reviewControls}
      </View>
    </PaymentSurface>
  )
}

function LegacyVietQrPayment({ deal, language, onRefresh, refreshing, tokens }: {
  deal: LocalDeal
  language: AppLanguage
  onRefresh: () => void
  refreshing: boolean
  tokens: CustomerThemeTokens
}) {
  const payment = deal.payment
  if (!payment) return null
  const text = copy(language)
  const received = payment.status === 'received'
  return (
    <PaymentSurface status={text.reconcileStatus} testID="customer-v21-case-sepay-payment-pending" title={text.legacyTransferTitle} tokens={tokens}>
      <Text style={[styles.body, { color: tokens.muted }]}>{received ? text.legacyTransferReceivedBody : text.legacyTransferBody}</Text>
      <PaymentAmount amount={safeAmount(payment.grossAmount)} label={text.recordedAmountLabel} language={language} tokens={tokens} />
      <PaymentAmount amount={safeAmount(payment.amountReceived)} label={text.receivedAmountLabel} language={language} tokens={tokens} />
      <RefreshButton language={language} onRefresh={onRefresh} refreshing={refreshing} />
    </PaymentSurface>
  )
}

function PaymentUnavailable({ language, onRefresh, refreshing, tokens }: {
  language: AppLanguage
  onRefresh?: () => void
  refreshing?: boolean
  tokens: CustomerThemeTokens
}) {
  const text = copy(language)
  return (
    <PaymentSurface status={text.unavailableStatus} testID="customer-v21-case-payment-unavailable" title={text.unavailableTitle} tokens={tokens}>
      <Text style={[styles.body, { color: tokens.muted }]}>{text.unavailableBody}</Text>
      {onRefresh ? <RefreshButton language={language} onRefresh={onRefresh} refreshing={refreshing === true} /> : null}
    </PaymentSurface>
  )
}

function PaymentSurface({ children, status, testID, title, tokens }: {
  children: ReactNode
  status: string
  testID: string
  title: string
  tokens: CustomerThemeTokens
}) {
  const { reduceTransparency } = useGlassAccessibility()
  const showFormulaMintAura = tokens.mode === 'light'

  return (
    <View accessibilityLabel={`${title}. ${status}`} style={[styles.surface, { backgroundColor: tokens.raised, borderColor: tokens.border }]} testID={testID}>
      {showFormulaMintAura ? (
        <FormulaMintCardAura
          reduceTransparency={reduceTransparency}
          scope={testID}
          testID={`${testID}-formula-mint-aura`}
        />
      ) : null}
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

function PaymentAmount({ amount, label, language, tokens }: {
  amount: number | null
  label: string
  language: AppLanguage
  tokens: CustomerThemeTokens
}) {
  if (amount === null) return null
  return <PaymentDetail label={label} value={formatVnd(amount, language)} emphasis tokens={tokens} />
}

function PaymentDetail({ label, value, selectable = false, emphasis = false, tokens }: {
  label: string
  value: string
  selectable?: boolean
  emphasis?: boolean
  tokens: CustomerThemeTokens
}) {
  return (
    <View style={styles.detailGroup}>
      <Text style={[styles.label, { color: tokens.muted }]}>{label}</Text>
      <Text selectable={selectable} style={[emphasis ? styles.amount : styles.detailValue, { color: emphasis ? tokens.text : tokens.primary }]}>{value}</Text>
    </View>
  )
}

function RefreshButton({
  language,
  onRefresh,
  refreshResult = null,
  refreshing,
}: {
  language: AppLanguage
  onRefresh: () => void
  refreshResult?: PaymentRefreshResult
  refreshing: boolean
}) {
  const text = copy(language)
  return (
    <View style={styles.refreshGroup}>
      <KaelButton accessibilityState={{ busy: refreshing, disabled: refreshing }} disabled={refreshing} label={refreshing ? text.refreshingLabel : text.refreshLabel} onPress={onRefresh} size="small" testID="customer-v21-case-payment-refresh" variant="secondary" />
      {refreshResult ? (
        <Text accessibilityLiveRegion="polite" style={styles.refreshFeedback} testID="customer-v21-case-payment-refresh-feedback">
          {refreshResult === 'success' ? text.refreshUnchanged : text.refreshFailed}
        </Text>
      ) : null}
    </View>
  )
}

function useRealDeadlineLabel(deadline: string | null | undefined, language: AppLanguage, reduceMotion: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (reduceMotion || !deadline || !Number.isFinite(Date.parse(deadline))) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [deadline, reduceMotion])
  if (!deadline) return null
  if (reduceMotion) {
    const time = new Date(deadline).toLocaleTimeString(language === 'vi' ? 'vi-VN' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
    })
    return language === 'vi' ? `Hết hạn lúc ${time}` : `Expires at ${time}`
  }
  const remainingSeconds = Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000))
  const hours = Math.floor(remainingSeconds / 3600)
  const minutes = Math.floor((remainingSeconds % 3600) / 60)
  const seconds = remainingSeconds % 60
  return language === 'vi'
    ? `${hours} giờ ${minutes} phút ${seconds} giây`
    : `${hours}h ${minutes}m ${seconds}s`
}

function safeAmount(value: number | null | undefined) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null
}

function copy(language: AppLanguage) {
  return language === 'vi'
    ? {
        accountLabel: 'Số tài khoản',
        accountHolderLabel: 'Chủ tài khoản',
        accountPending: 'Đang xác minh thông tin hiển thị',
        amountLabel: 'Số tiền cần chuyển',
        awaitingAdminBody: 'Kael đã ghi nhận thời điểm bạn báo chuyển. Thu nhập của thợ đã hiện ở trạng thái tạm ghi nhận; bộ phận vận hành sẽ đối soát trước khi mở bước đánh giá.',
        awaitingAdminStatus: 'Đang chờ bộ phận vận hành đối soát',
        awaitingAdminTitle: 'Đã nhận báo chuyển khoản',
        bankLabel: 'Ngân hàng',
        claimingLabel: 'Đang gửi xác nhận',
        claimLabel: 'Tôi đã chuyển khoản',
        collateralLabel: 'Hoa hồng đang được giữ',
        confirmedAmountLabel: 'Số tiền đã xác nhận',
        confirmedBody: 'Giao dịch thanh toán đã được xác minh. Bạn có thể đánh giá chất lượng công việc.',
        confirmedStatus: 'Đã xác nhận',
        confirmedTitle: 'Thanh toán đã được xác nhận',
        directConfirmedBody: 'Biên nhận cũ ghi nhận thanh toán trực tiếp đã được xác minh. Lịch sử đối soát vẫn được giữ để hỗ trợ khi cần.',
        directConfirmedTitle: 'Biên nhận thanh toán trực tiếp cũ',
        directPendingBody: 'Đây là phương thức cũ chỉ còn để đối soát. Bạn không thể xác nhận thanh toán trực tiếp từ ứng dụng.',
        directPendingTitle: 'Thanh toán trực tiếp cũ cần đối soát',
        directAdminPendingBody: 'Hệ thống đã lưu xác nhận tiền mặt cũ. Bộ phận vận hành phải kiểm tra biên nhận trước khi ghi nhận đã thanh toán.',
        directAdminPendingTitle: 'Biên nhận tiền mặt cũ đang chờ xác minh',
        directAdminStatus: 'Chờ bộ phận vận hành đối soát',
        directReconcileBody: 'Bộ phận vận hành đang đối soát biên nhận cũ. Khoản giữ hoa hồng không được tự giải phóng.',
        directStatus: 'Chờ đối soát phương thức cũ',
        legacyTransferBody: 'Phương thức chuyển khoản cũ hiện không nhận thanh toán mới. Biên nhận được giữ để bộ phận vận hành đối soát. Không chuyển tiền theo mã QR hoặc hướng dẫn cũ.',
        legacyTransferReceivedBody: 'Biên nhận cũ đã ghi nhận giao dịch, nhưng trạng thái công việc vẫn cần được đối soát trước khi mở đánh giá. Không chuyển thêm tiền.',
        legacyTransferTitle: 'Biên nhận chuyển khoản cũ cần đối soát',
        orderAmountLabel: 'Số tiền trên lệnh thanh toán',
        pausedBody: 'Phương thức chuyển khoản hiện đang tạm dừng. Lệnh đã lưu vẫn được giữ để đối soát. Không chuyển tiền theo mã QR hoặc hướng dẫn cũ.',
        pausedTitle: 'Thanh toán đang tạm dừng',
        preparingBody: 'Kael đang đọc lại lệnh thanh toán từ máy chủ. Không chuyển tiền cho đến khi QR và nội dung chuyển khoản xuất hiện.',
        preparingStatus: 'Đang chuẩn bị',
        preparingTitle: 'Đang chuẩn bị thanh toán',
        qrLabel: 'Mã QR thanh toán cho công việc này',
        readyStatus: 'Sẵn sàng chuyển khoản',
        readyTitle: 'Thanh toán QR theo công việc',
        receivedAmountLabel: 'Số tiền giao dịch ghi nhận',
        recordedAmountLabel: 'Số tiền trên lệnh cũ',
        reconcileBody: 'Số tiền hoặc giao dịch cần được bộ phận vận hành đối soát. Không chuyển thêm tiền cho công việc này.',
        reconcileStatus: 'Cần đối soát',
        reconcileTitle: 'Thanh toán đang được đối soát',
        refreshLabel: 'Cập nhật trạng thái',
        refreshFailed: 'Chưa thể cập nhật trạng thái. Vui lòng thử lại.',
        refreshUnchanged: 'Đã kiểm tra lại. Chưa có xác nhận mới từ bộ phận vận hành.',
        refreshingLabel: 'Đang cập nhật',
        responseDeadlineLabel: 'Thời gian phản hồi còn lại',
        reviewBody: 'Đánh giá của bạn sẽ được lưu vào công việc này.',
        reviewTitle: 'Đánh giá công việc',
        savingLabel: 'Đang lưu xác nhận',
        stepOne: '1. Mở ứng dụng ngân hàng và quét mã QR.',
        stepTwo: '2. Kiểm tra số tiền và nội dung chuyển khoản trước khi xác nhận ở ngân hàng.',
        stepThree: '3. Quay lại đây và bấm “Tôi đã chuyển khoản” để bộ phận vận hành biết cần đối soát.',
        transferLabel: 'Nội dung chuyển khoản',
        unavailableBody: 'Hệ thống chưa có phương thức thanh toán đã cấu hình cho công việc này. Kael không tự xác nhận giao dịch từ lời nói hoặc ảnh chụp.',
        unavailableStatus: 'Chưa khả dụng',
        unavailableTitle: 'Thanh toán chưa thể tiếp tục',
        unverifiedReceiptBody: 'Trạng thái công việc và biên nhận thanh toán chưa khớp. Bộ phận vận hành cần đối soát trước khi mở đánh giá. Không chuyển thêm tiền.',
        verifiedReceiptPendingBody: 'Biên nhận đã được xác minh, nhưng trạng thái công việc chưa khớp. Bộ phận vận hành cần đối soát trước khi mở đánh giá. Không chuyển thêm tiền.',
      }
    : {
        accountLabel: 'Account number',
        accountHolderLabel: 'Account holder',
        accountPending: 'Display details are being verified',
        amountLabel: 'Amount to transfer',
        awaitingAdminBody: 'Kael recorded when you claimed the transfer. The worker’s earnings are visible as provisional; an admin reconciles it before review opens.',
        awaitingAdminStatus: 'Awaiting admin reconciliation',
        awaitingAdminTitle: 'Transfer claim received',
        bankLabel: 'Bank',
        claimingLabel: 'Sending claim',
        claimLabel: 'I made the transfer',
        collateralLabel: 'Commission collateral held',
        confirmedAmountLabel: 'Confirmed amount',
        confirmedBody: 'The payment transaction has been verified. You can review the work quality.',
        confirmedStatus: 'Confirmed',
        confirmedTitle: 'Payment has been confirmed',
        directConfirmedBody: 'This legacy receipt records a verified direct payment. Its reconciliation history remains available for support.',
        directConfirmedTitle: 'Legacy direct-payment receipt',
        directPendingBody: 'This legacy method is retained for reconciliation only. Direct payment cannot be confirmed in the app.',
        directPendingTitle: 'Legacy direct payment needs reconciliation',
        directAdminPendingBody: 'The system retained a legacy cash claim. Operations must verify its receipt before marking it paid.',
        directAdminPendingTitle: 'Legacy cash receipt awaiting verification',
        directAdminStatus: 'Awaiting operations reconciliation',
        directReconcileBody: 'Operations is reconciling this legacy receipt. The held commission is not released automatically.',
        directStatus: 'Legacy reconciliation pending',
        legacyTransferBody: 'This legacy transfer method is not accepting new payments. Its receipt is retained for operations to reconcile. Do not pay using an old QR code or instructions.',
        legacyTransferReceivedBody: 'The legacy receipt recorded a transaction, but the work status still needs reconciliation before review opens. Do not send more money.',
        legacyTransferTitle: 'Legacy transfer receipt needs reconciliation',
        orderAmountLabel: 'Payment order amount',
        pausedBody: 'Bank transfer is currently paused. The existing order is retained for reconciliation. Do not pay using an old QR code or instructions.',
        pausedTitle: 'Payment is paused',
        preparingBody: 'Kael is reading the payment order from the server again. Do not transfer until the QR and transfer content appear.',
        preparingStatus: 'Preparing',
        preparingTitle: 'Preparing payment',
        qrLabel: 'Payment QR for this work',
        readyStatus: 'Ready to transfer',
        readyTitle: 'QR payment for this work',
        receivedAmountLabel: 'Recorded transaction amount',
        recordedAmountLabel: 'Legacy order amount',
        reconcileBody: 'The amount or transaction needs admin reconciliation. Do not send more money for this work.',
        reconcileStatus: 'Reconciliation required',
        reconcileTitle: 'Payment is being reconciled',
        refreshLabel: 'Refresh status',
        refreshFailed: 'The status could not be refreshed. Please try again.',
        refreshUnchanged: 'Checked again. There is no new confirmation from Admin yet.',
        refreshingLabel: 'Refreshing',
        responseDeadlineLabel: 'Response time remaining',
        reviewBody: 'Your review will be saved to this work.',
        reviewTitle: 'Review the work',
        savingLabel: 'Saving confirmation',
        stepOne: '1. Open your banking app and scan the QR code.',
        stepTwo: '2. Check the amount and transfer content before confirming in your bank.',
        stepThree: '3. Return here and claim the transfer so an admin can reconcile it.',
        transferLabel: 'Transfer content',
        unavailableBody: 'No configured payment method is available for this work. Kael never confirms a transaction from a statement or screenshot.',
        unavailableStatus: 'Unavailable',
        unavailableTitle: 'Payment cannot continue yet',
        unverifiedReceiptBody: 'The work status and payment receipt do not agree. Operations must reconcile them before review opens. Do not send more money.',
        verifiedReceiptPendingBody: 'The receipt is verified, but the work status has not caught up. Operations must reconcile them before review opens. Do not send more money.',
      }
}

const styles = StyleSheet.create({
  accountRows: { gap: 12 },
  actionStack: { gap: 10 },
  amount: { ...typography.title2, fontWeight: '600', fontVariant: ['tabular-nums'] },
  body: { ...typography.subheadline },
  detailGroup: { gap: 4 },
  detailValue: { ...typography.callout, fontWeight: '600', fontVariant: ['tabular-nums'] },
  directCopy: { gap: 4 },
  directWarning: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, gap: 12, paddingHorizontal: 16, paddingVertical: 16 },
  header: { gap: 4 },
  heading: { ...typography.title3, fontWeight: '600' },
  instruction: { ...typography.subheadline },
  instructions: { borderTopWidth: StyleSheet.hairlineWidth, gap: 7, paddingTop: 16 },
  label: { ...typography.footnote, fontWeight: '600' },
  messageTitle: { ...typography.callout, fontWeight: '600' },
  note: { ...typography.subheadline },
  qr: { height: '100%', width: '100%' },
  qrFrame: { alignSelf: 'center', alignItems: 'center', aspectRatio: 1, backgroundColor: '#ffffff', borderColor: '#d8ece8', borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', maxWidth: QR_BOX_SIZE, padding: 10, width: '100%' },
  refreshFeedback: { color: '#4f6f70', fontSize: 13, lineHeight: 18, textAlign: 'center' },
  refreshGroup: { gap: 8 },
  reviewHeading: { ...typography.title3, fontWeight: '600' },
  reviewSection: { borderTopWidth: StyleSheet.hairlineWidth, gap: 12, paddingTop: 18 },
  status: { ...typography.subheadline, fontWeight: '600' },
  surface: { alignSelf: 'center', borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, maxWidth: 608, overflow: 'hidden', width: '100%' },
  surfaceContent: { gap: 18, padding: 20, zIndex: 1 },
  transferContent: { ...typography.callout, fontWeight: '600', fontVariant: ['tabular-nums'] },
})
