import { useEffect, useState, type ReactNode } from 'react'
import { Image } from 'expo-image'
import { StyleSheet, Text, View } from 'react-native'

import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { FormulaMintCardAura } from '@/components/ui/formula-mint-card'
import { KaelButton } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import { toWorkflowPhase, type LocalDeal } from '@nestscout/shared'

import type { CustomerThemeTokens } from '../customer-theme'
import { formatVnd } from './case-work-money-display-model'
import type { PaymentRailProvider } from './case-work-response-model'
import { buildSePayVietQrPaymentPresentation } from './sepay-vietqr-payment-display-model'

const QR_BOX_SIZE = 256

type CustomerPaymentRailSurfaceProps = {
  deal: LocalDeal
  language: AppLanguage
  onClaimManualBankPayment: () => void
  onCreateManualBankPaymentOrder: () => void
  onCreatePaymentIntent: () => void
  onRefreshPayment: () => void
  onRespondToDirectWorkerPayment: (received: boolean) => void
  onSelectDirectWorkerPayment: () => void
  paymentBusy: boolean
  paymentRailProvider: PaymentRailProvider
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
  onCreatePaymentIntent,
  onRefreshPayment,
  onRespondToDirectWorkerPayment,
  onSelectDirectWorkerPayment,
  paymentBusy,
  paymentRailProvider,
  refreshingPayment,
  reduceMotion,
  reviewControls,
  tokens,
}: CustomerPaymentRailSurfaceProps) {
  const phase = toWorkflowPhase(deal.backendStatus ?? deal.status)
  if (phase !== 'customer_confirmed_completion' && phase !== 'payment_pending' && phase !== 'paid') return null

  if (phase === 'paid') {
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
              ? 'Kael tạo QR, số tiền và nội dung chuyển khoản riêng cho công việc này. Chỉ báo đã chuyển sau khi hoàn tất tại ngân hàng.'
              : 'Kael creates a QR, amount, and transfer content unique to this work. Claim it only after completing the bank transfer.'}
          </Text>
          <KaelButton
            accessibilityState={{ busy: paymentBusy, disabled: paymentBusy }}
            disabled={paymentBusy}
            label={paymentBusy
              ? (language === 'vi' ? 'Đang tạo lệnh' : 'Creating order')
              : (language === 'vi' ? 'Tạo lại lệnh thanh toán' : 'Create payment order again')}
            onPress={onCreateManualBankPaymentOrder}
            testID="customer-v21-case-manual-payment-create"
          />
        </PaymentSurface>
      )
    }
    if (paymentRailProvider === 'sepay_vietqr') {
      return <LegacyPaymentStart language={language} onCreate={onCreatePaymentIntent} paymentBusy={paymentBusy} tokens={tokens} />
    }
    return <PaymentUnavailable language={language} tokens={tokens} />
  }

  if (deal.payment?.provider === 'direct_worker') {
    return (
      <DirectWorkerPayment
        deal={deal}
        language={language}
        onRefresh={onRefreshPayment}
        onRespond={onRespondToDirectWorkerPayment}
        paymentBusy={paymentBusy}
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
        onSelectDirect={onSelectDirectWorkerPayment}
        paymentBusy={paymentBusy}
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
  onSelectDirect,
  paymentBusy,
  refreshing,
  reduceMotion,
  tokens,
}: {
  deal: LocalDeal
  language: AppLanguage
  onClaim: () => void
  onRefresh: () => void
  onSelectDirect: () => void
  paymentBusy: boolean
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
        <PaymentAmount amount={safeAmount(payment.grossAmount)} label={copy(language).amountLabel} language={language} tokens={tokens} />
        <RefreshButton language={language} onRefresh={onRefresh} refreshing={refreshing} />
      </PaymentSurface>
    )
  }
  if (payment.status === 'manual_reconcile_required') {
    return (
      <PaymentSurface status={copy(language).reconcileStatus} testID="customer-v21-case-manual-payment-reconcile" title={copy(language).reconcileTitle} tokens={tokens}>
        <Text style={[styles.body, { color: tokens.muted }]}>{copy(language).reconcileBody}</Text>
        <PaymentAmount amount={safeAmount(payment.grossAmount)} label={copy(language).amountLabel} language={language} tokens={tokens} />
        <RefreshButton language={language} onRefresh={onRefresh} refreshing={refreshing} />
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
        accessibilityState={{ busy: paymentBusy, disabled: paymentBusy }}
        disabled={paymentBusy}
        label={paymentBusy ? text.claimingLabel : text.claimLabel}
        onPress={onClaim}
        testID="customer-v21-case-manual-payment-claim"
      />
      <View
        style={[styles.directWarning, { backgroundColor: tokens.base, borderColor: tokens.border }]}
        testID="customer-v21-case-direct-payment-warning"
      >
        <View style={styles.directCopy}>
          <Text style={[styles.messageTitle, { color: tokens.text }]}>{text.directTitle}</Text>
          <Text style={[styles.note, { color: tokens.muted }]}>{text.directBody}</Text>
        </View>
        <KaelButton
          accessibilityState={{ busy: paymentBusy, disabled: paymentBusy }}
          disabled={paymentBusy}
          label={text.directAction}
          onPress={onSelectDirect}
          size="small"
          testID="customer-v21-case-direct-payment-select"
          variant="secondary"
        />
      </View>
    </PaymentSurface>
  )
}

function DirectWorkerPayment({
  deal,
  language,
  onRefresh,
  onRespond,
  paymentBusy,
  refreshing,
  reduceMotion,
  tokens,
}: {
  deal: LocalDeal
  language: AppLanguage
  onRefresh: () => void
  onRespond: (received: boolean) => void
  paymentBusy: boolean
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
  return (
    <PaymentSurface
      status={isReconcile ? text.reconcileStatus : text.directStatus}
      testID="customer-v21-case-direct-payment"
      title={isReconcile ? text.reconcileTitle : text.directPendingTitle}
      tokens={tokens}
    >
      <Text style={[styles.body, { color: tokens.muted }]}>
        {isReconcile ? text.directReconcileBody : text.directPendingBody}
      </Text>
      <PaymentAmount amount={safeAmount(payment.grossAmount)} label={text.amountLabel} language={language} tokens={tokens} />
      {payment.collateralAmount ? <PaymentDetail label={text.collateralLabel} value={formatVnd(payment.collateralAmount, language)} tokens={tokens} /> : null}
      {deadlineLabel ? <PaymentDetail label={text.responseDeadlineLabel} value={deadlineLabel} tokens={tokens} /> : null}
      {!isReconcile && !customerConfirmed ? (
        <View style={styles.actionStack}>
          <KaelButton
            accessibilityState={{ busy: paymentBusy, disabled: paymentBusy }}
            disabled={paymentBusy}
            label={paymentBusy ? text.savingLabel : text.directConfirmAction}
            onPress={() => onRespond(true)}
            testID="customer-v21-case-direct-payment-confirm"
          />
          <KaelButton
            accessibilityState={{ busy: paymentBusy, disabled: paymentBusy }}
            disabled={paymentBusy}
            label={text.directProblemAction}
            onPress={() => onRespond(false)}
            size="small"
            testID="customer-v21-case-direct-payment-problem"
            variant="secondary"
          />
        </View>
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

function LegacyPaymentStart({ language, onCreate, paymentBusy, tokens }: {
  language: AppLanguage
  onCreate: () => void
  paymentBusy: boolean
  tokens: CustomerThemeTokens
}) {
  const text = copy(language)
  return (
    <PaymentSurface status={text.preparingStatus} testID="customer-v21-case-sepay-payment-start" title={language === 'vi' ? 'Thanh toán VietQR cũ' : 'Legacy VietQR payment'} tokens={tokens}>
      <Text style={[styles.body, { color: tokens.muted }]}>{language === 'vi' ? 'Lệnh VietQR cũ vẫn chỉ được xác minh theo trạng thái server.' : 'The legacy VietQR order is still verified only by server state.'}</Text>
      <KaelButton accessibilityState={{ busy: paymentBusy, disabled: paymentBusy }} disabled={paymentBusy} label={paymentBusy ? text.preparingStatus : (language === 'vi' ? 'Tạo mã' : 'Create code')} onPress={onCreate} />
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
  const presentation = buildSePayVietQrPaymentPresentation({ payment, paymentRailAvailable: true })
  const text = copy(language)
  return (
    <PaymentSurface status={presentation.kind === 'ready' ? text.readyStatus : text.preparingStatus} testID="customer-v21-case-sepay-payment-pending" title={text.readyTitle} tokens={tokens}>
      {presentation.kind === 'ready' ? (
        <>
          <View style={styles.qrFrame}><Image accessibilityLabel={text.qrLabel} contentFit="contain" source={{ uri: presentation.qrImageUrl }} style={styles.qr} /></View>
          <PaymentAmount amount={presentation.expectedAmount} label={text.amountLabel} language={language} tokens={tokens} />
          <PaymentDetail label={text.transferLabel} value={presentation.transferContent} selectable tokens={tokens} />
        </>
      ) : <Text style={[styles.body, { color: tokens.muted }]}>{text.preparingBody}</Text>}
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

function RefreshButton({ language, onRefresh, refreshing }: { language: AppLanguage; onRefresh: () => void; refreshing: boolean }) {
  const text = copy(language)
  return <KaelButton accessibilityState={{ busy: refreshing, disabled: refreshing }} disabled={refreshing} label={refreshing ? text.refreshingLabel : text.refreshLabel} onPress={onRefresh} size="small" testID="customer-v21-case-payment-refresh" variant="secondary" />
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
        awaitingAdminBody: 'Kael đã ghi nhận thời điểm bạn báo chuyển. Đây chưa phải xác nhận tiền đã vào; Admin sẽ đối soát trước khi mở bước đánh giá.',
        awaitingAdminStatus: 'Đang chờ Admin đối soát',
        awaitingAdminTitle: 'Đã nhận báo chuyển khoản',
        bankLabel: 'Ngân hàng',
        claimingLabel: 'Đang gửi xác nhận',
        claimLabel: 'Tôi đã chuyển khoản',
        collateralLabel: 'Hoa hồng đang được giữ',
        confirmedAmountLabel: 'Số tiền đã xác nhận',
        confirmedBody: 'Admin đã đối soát giao dịch với tài khoản nền tảng. Bạn có thể đánh giá chất lượng công việc.',
        confirmedStatus: 'Đã xác nhận',
        confirmedTitle: 'Thanh toán đã được xác nhận',
        directAction: 'Trả trực tiếp cho thợ',
        directBody: 'Chỉ chọn khi chưa báo đã chuyển QR. Kael giữ 15% hoa hồng đến khi hai bên cùng xác nhận.',
        directConfirmAction: 'Tôi đã trả trực tiếp',
        directConfirmedBody: 'Bạn và thợ đã cùng xác nhận thanh toán trực tiếp. Hoa hồng đã được ghi nhận theo biên nhận này.',
        directConfirmedTitle: 'Thanh toán trực tiếp đã được xác nhận',
        directPendingBody: 'Kael đang chờ đủ xác nhận từ khách và thợ. Công việc chưa được coi là đã thanh toán.',
        directPendingTitle: 'Thanh toán trực tiếp cần hai xác nhận',
        directProblemAction: 'Báo có vấn đề',
        directReconcileBody: 'Kael đã chuyển biên nhận cho Admin đối soát. Khoản hoa hồng giữ lại không được tự giải phóng.',
        directStatus: 'Chờ xác nhận hai phía',
        directTitle: 'Trả trực tiếp có bảo đảm',
        preparingBody: 'Kael đang đọc lại lệnh thanh toán từ server. Không chuyển tiền cho đến khi QR và nội dung chuyển khoản xuất hiện.',
        preparingStatus: 'Đang chuẩn bị',
        preparingTitle: 'Đang chuẩn bị thanh toán',
        qrLabel: 'Mã QR thanh toán cho công việc này',
        readyStatus: 'Sẵn sàng chuyển khoản',
        readyTitle: 'Thanh toán QR theo công việc',
        reconcileBody: 'Số tiền hoặc giao dịch cần được Admin đối soát. Không chuyển thêm tiền cho công việc này.',
        reconcileStatus: 'Cần đối soát',
        reconcileTitle: 'Thanh toán đang được đối soát',
        refreshLabel: 'Cập nhật trạng thái',
        refreshingLabel: 'Đang cập nhật',
        responseDeadlineLabel: 'Thời gian phản hồi còn lại',
        reviewBody: 'Đánh giá của bạn sẽ được lưu vào công việc này.',
        reviewTitle: 'Đánh giá công việc',
        savingLabel: 'Đang lưu xác nhận',
        stepOne: '1. Mở ứng dụng ngân hàng và quét mã QR.',
        stepTwo: '2. Kiểm tra số tiền và nội dung chuyển khoản trước khi xác nhận ở ngân hàng.',
        stepThree: '3. Quay lại đây và bấm “Tôi đã chuyển khoản” để Admin biết cần đối soát.',
        transferLabel: 'Nội dung chuyển khoản',
        unavailableBody: 'Hệ thống chưa có phương thức thanh toán đã cấu hình cho công việc này. Kael không tự xác nhận giao dịch từ lời nói hoặc ảnh chụp.',
        unavailableStatus: 'Chưa khả dụng',
        unavailableTitle: 'Thanh toán chưa thể tiếp tục',
      }
    : {
        accountLabel: 'Account number',
        accountHolderLabel: 'Account holder',
        accountPending: 'Display details are being verified',
        amountLabel: 'Amount to transfer',
        awaitingAdminBody: 'Kael recorded when you claimed the transfer. This is not proof of funds received; an admin reconciles it before review opens.',
        awaitingAdminStatus: 'Awaiting admin reconciliation',
        awaitingAdminTitle: 'Transfer claim received',
        bankLabel: 'Bank',
        claimingLabel: 'Sending claim',
        claimLabel: 'I made the transfer',
        collateralLabel: 'Commission collateral held',
        confirmedAmountLabel: 'Confirmed amount',
        confirmedBody: 'An admin reconciled the transfer against the platform account. You can review the work quality.',
        confirmedStatus: 'Confirmed',
        confirmedTitle: 'Payment has been confirmed',
        directAction: 'Pay the worker directly',
        directBody: 'Choose this before claiming the QR transfer. Kael holds 15% commission until both sides confirm.',
        directConfirmAction: 'I paid directly',
        directConfirmedBody: 'You and the worker confirmed the direct payment. The commission is recorded through this receipt.',
        directConfirmedTitle: 'Direct payment confirmed',
        directPendingBody: 'Kael is waiting for both customer and worker confirmations. The job is not paid yet.',
        directPendingTitle: 'Direct payment needs two confirmations',
        directProblemAction: 'Report a problem',
        directReconcileBody: 'Kael sent the receipt to an admin for reconciliation. The held commission is not released automatically.',
        directStatus: 'Awaiting two confirmations',
        directTitle: 'Protected direct payment',
        preparingBody: 'Kael is reading the payment order from the server again. Do not transfer until the QR and transfer content appear.',
        preparingStatus: 'Preparing',
        preparingTitle: 'Preparing payment',
        qrLabel: 'Payment QR for this work',
        readyStatus: 'Ready to transfer',
        readyTitle: 'QR payment for this work',
        reconcileBody: 'The amount or transaction needs admin reconciliation. Do not send more money for this work.',
        reconcileStatus: 'Reconciliation required',
        reconcileTitle: 'Payment is being reconciled',
        refreshLabel: 'Refresh status',
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
      }
}

const styles = StyleSheet.create({
  accountRows: { gap: 12 },
  actionStack: { gap: 10 },
  amount: { fontSize: 22, fontVariant: ['tabular-nums'], fontWeight: '700', lineHeight: 29 },
  body: { fontSize: 15, lineHeight: 22 },
  detailGroup: { gap: 4 },
  detailValue: { fontSize: 16, fontVariant: ['tabular-nums'], fontWeight: '600', lineHeight: 22 },
  directCopy: { gap: 4 },
  directWarning: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, gap: 12, paddingHorizontal: 16, paddingVertical: 16 },
  header: { gap: 4 },
  heading: { fontSize: 20, fontWeight: '700', lineHeight: 27 },
  instruction: { fontSize: 14, lineHeight: 20 },
  instructions: { borderTopWidth: StyleSheet.hairlineWidth, gap: 7, paddingTop: 16 },
  label: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  messageTitle: { fontSize: 16, fontWeight: '700', lineHeight: 22 },
  note: { fontSize: 14, lineHeight: 20 },
  qr: { height: '100%', width: '100%' },
  qrFrame: { alignSelf: 'center', alignItems: 'center', aspectRatio: 1, backgroundColor: '#ffffff', borderColor: '#d8ece8', borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', maxWidth: QR_BOX_SIZE, padding: 10, width: '100%' },
  reviewHeading: { fontSize: 18, fontWeight: '700', lineHeight: 24 },
  reviewSection: { borderTopWidth: StyleSheet.hairlineWidth, gap: 12, paddingTop: 18 },
  status: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  surface: { alignSelf: 'center', borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, maxWidth: 608, overflow: 'hidden', width: '100%' },
  surfaceContent: { gap: 18, padding: 20, zIndex: 1 },
  transferContent: { fontSize: 16, fontVariant: ['tabular-nums'], fontWeight: '700', letterSpacing: 0.35, lineHeight: 22 },
})
