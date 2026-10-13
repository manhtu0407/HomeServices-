import { typography } from '@/design/theme'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Image } from 'expo-image'
import { Animated, Easing, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Path, Rect } from 'react-native-svg'

import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { KaelButton } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import { toWorkflowPhase, type LocalDeal } from '@nestscout/shared'

import type { CustomerThemeTokens } from '../customer-theme'
import { CASE_WORK_CONTENT_INSET, CASE_WORK_RAIL_PADDING, CASE_WORK_ROW_STYLE, caseWorkAccentLine } from './case-work-response'
import { formatVnd, isDealPaymentProtected } from './case-work-money-display-model'
import type { PaymentRailProvider } from './case-work-response-model'
import { paymentBankFullName } from '../profile/payment-bank-display-model'
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
        <PaymentSurface status={copy(language).reconcileStatus} glyph="alert" testID="customer-v21-case-payment-receipt-unverified" title={copy(language).reconcileTitle} tokens={tokens}>
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
          glyph="waiting" testID="customer-v21-case-manual-payment-start"
          title={language === 'vi' ? 'Thanh toán qua tài khoản nền tảng' : 'Pay through the platform account'}
          tokens={tokens}
        >
          <Text style={[styles.body, { color: tokens.muted }]}>
            {language === 'vi'
              ? 'QR, số tiền và nội dung chuyển khoản được tạo riêng cho công việc này. Chỉ báo đã chuyển sau khi hoàn tất tại ngân hàng.'
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
      <PaymentSurface status={copy(language).reconcileStatus} glyph="alert" testID="customer-v21-case-manual-payment-reconcile" title={copy(language).reconcileTitle} tokens={tokens}>
        <Text style={[styles.body, { color: tokens.muted }]}>{payment.status === 'manual_verified' ? copy(language).verifiedReceiptPendingBody : copy(language).reconcileBody}</Text>
        <PaymentAmount amount={safeAmount(payment.grossAmount)} label={copy(language).orderAmountLabel} language={language} tokens={tokens} />
        <RefreshButton language={language} onRefresh={onRefresh} refreshResult={refreshResult} refreshing={refreshing} />
      </PaymentSurface>
    )
  }
  if (!paymentRailAvailable) {
    const text = copy(language)
    return (
      <PaymentSurface status={text.unavailableStatus} glyph="alert" testID="customer-v21-case-manual-payment-paused" title={text.pausedTitle} tokens={tokens}>
        <Text style={[styles.body, { color: tokens.muted }]}>{text.pausedBody}</Text>
        <PaymentAmount amount={safeAmount(payment.grossAmount)} label={text.orderAmountLabel} language={language} tokens={tokens} />
        <RefreshButton language={language} onRefresh={onRefresh} refreshResult={refreshResult} refreshing={refreshing} />
      </PaymentSurface>
    )
  }
  if (payment.status !== 'manual_qr_ready' || !payment.qrImageUrl || !payment.transferContent) {
    return (
      <PaymentSurface status={copy(language).preparingStatus} glyph="waiting" testID="customer-v21-case-manual-payment-preparing" title={copy(language).preparingTitle} tokens={tokens}>
        <Text style={[styles.body, { color: tokens.muted }]}>{copy(language).preparingBody}</Text>
        <RefreshButton language={language} onRefresh={onRefresh} refreshing={refreshing} />
      </PaymentSurface>
    )
  }

  const text = copy(language)
  return (
    <PaymentSurface status={text.readyStatus} glyph="qr" testID="customer-v21-case-manual-payment-ready" title={text.readyTitle} tokens={tokens}>
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
        <PaymentLine detail={paymentBankFullName(payment.bankCode)} label={text.bankLabel} value={payment.bankCode ?? text.accountPending} tokens={tokens} />
        <PaymentLine label={text.accountHolderLabel} value={payment.accountHolder ?? text.accountPending} tokens={tokens} />
        <PaymentLine label={text.accountLabel} value={payment.accountMasked ?? text.accountPending} tokens={tokens} />
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
      glyph="alert" testID="customer-v21-case-direct-payment"
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
    <PaymentSurface status={text.confirmedStatus} glyph="check" testID="customer-v21-case-payment-confirmed" title={direct ? text.directConfirmedTitle : text.confirmedTitle} tokens={tokens}>
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
    <PaymentSurface status={text.reconcileStatus} glyph="alert" testID="customer-v21-case-sepay-payment-pending" title={text.legacyTransferTitle} tokens={tokens}>
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
    <PaymentSurface status={text.unavailableStatus} glyph="alert" testID="customer-v21-case-payment-unavailable" title={text.unavailableTitle} tokens={tokens}>
      <Text style={[styles.body, { color: tokens.muted }]}>{text.unavailableBody}</Text>
      {onRefresh ? <RefreshButton language={language} onRefresh={onRefresh} refreshing={refreshing === true} /> : null}
    </PaymentSurface>
  )
}

type PaymentGlyphName = 'alert' | 'check' | 'qr' | 'waiting'

const GLYPH_SIZE = 32

// The one accent on a payment step: a bare mark that says where the payment stands.
function PaymentGlyph({ glyph, tokens }: { glyph: PaymentGlyphName; tokens: CustomerThemeTokens }) {
  if (glyph === 'waiting') return <WaitingClock color={tokens.primary} />
  const stroke = { fill: 'none', stroke: tokens.primary, strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2 } as const
  return (
    <View style={styles.glyph}>
      <Svg height={GLYPH_SIZE} viewBox="0 0 24 24" width={GLYPH_SIZE}>
        {glyph === 'check' ? <Path d="M4 12.5l5 5L20 6.5" {...stroke} /> : null}
        {glyph === 'alert' ? <Path d="M12 7v6M12 17h.01M10.3 3.9L2.5 17.5A2 2 0 0 0 4.2 20.5h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" {...stroke} /> : null}
        {glyph === 'qr' ? (
          <>
            <Rect height={5} rx={1} width={5} x={3} y={3} {...stroke} />
            <Rect height={5} rx={1} width={5} x={16} y={3} {...stroke} />
            <Rect height={5} rx={1} width={5} x={3} y={16} {...stroke} />
            <Path d="M21 16h-3a2 2 0 0 0-2 2v3M21 21v.01M12 7v3a2 2 0 0 1-2 2H7M3 12h.01M12 3h.01M12 16v.01M16 12h1M21 12v.01M12 21v-1" {...stroke} />
          </>
        ) : null}
      </Svg>
    </View>
  )
}

const HOUR_MS = 3_600_000
const CLOCK_HOURS = 12

// A clock that keeps real time: it starts at the current hour and minute, the minute hand takes an
// hour per turn and the hour hand twelve, so the waiting person sees time actually passing. One
// linear animation drives both hands, because Animated.loop does not restart on web; twelve hours
// outlasts any wait. With reduced motion the hands stand at the time it opened.
function WaitingClock({ color }: { color: string }) {
  const { reduceMotion } = useGlassAccessibility()
  const clock = useRef(new Animated.Value(0)).current
  const [start] = useState(() => {
    const now = new Date()
    const minutes = now.getMinutes() + now.getSeconds() / 60
    return { hour: ((now.getHours() % 12) + minutes / 60) * 30, minute: minutes * 6 }
  })
  useEffect(() => {
    if (reduceMotion) return
    clock.setValue(0)
    const run = Animated.timing(clock, { duration: CLOCK_HOURS * HOUR_MS, easing: Easing.linear, toValue: 1, useNativeDriver: true })
    run.start()
    return () => run.stop()
  }, [clock, reduceMotion])
  const hand = (from: number, degrees: number) => ({
    transform: [{
      rotate: reduceMotion
        ? `${from}deg`
        : clock.interpolate({ inputRange: [0, 1], outputRange: [`${from}deg`, `${from + degrees}deg`] }),
    }],
  })
  const stroke = { fill: 'none', stroke: color, strokeLinecap: 'round', strokeWidth: 2 } as const
  return (
    <View style={styles.glyph}>
      <Svg height={GLYPH_SIZE} viewBox="0 0 24 24" width={GLYPH_SIZE}>
        <Circle cx={12} cy={12} r={10} {...stroke} />
        <Circle cx={12} cy={12} fill={color} r={1.2} />
      </Svg>
      <Animated.View pointerEvents="none" style={[styles.glyphHand, hand(start.hour, 360)]}>
        <Svg height={GLYPH_SIZE} viewBox="0 0 24 24" width={GLYPH_SIZE}><Path d="M12 12V7.6" {...stroke} /></Svg>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.glyphHand, hand(start.minute, 360 * CLOCK_HOURS)]}>
        <Svg height={GLYPH_SIZE} viewBox="0 0 24 24" width={GLYPH_SIZE}><Path d="M12 12V4.8" {...stroke} /></Svg>
      </Animated.View>
    </View>
  )
}

function PaymentSurface({ children, glyph = 'waiting', status, testID, title, tokens }: {
  children: ReactNode
  glyph?: PaymentGlyphName
  status: string
  testID: string
  title: string
  tokens: CustomerThemeTokens
}) {
  return (
    <View accessibilityLabel={`${title}. ${status}`} style={styles.row} testID={testID}>
      <View style={[styles.surface, { borderLeftColor: caseWorkAccentLine(tokens) }]}>
        <View style={styles.header}>
          <PaymentGlyph glyph={glyph} tokens={tokens} />
          <View style={styles.headerCopy}>
            <Text accessibilityRole="header" style={[styles.heading, { color: tokens.text }]}>{title}</Text>
            <Text accessibilityLiveRegion="polite" style={[styles.status, { color: tokens.primary }]}>{status}</Text>
          </View>
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

// A short account fact reads as one receipt line, label left and value right.
function PaymentLine({ detail, label, tokens, value }: { detail?: string | null; label: string; tokens: CustomerThemeTokens; value: string }) {
  return (
    <View style={styles.lineGroup}>
      <View style={styles.line}>
        <Text style={[styles.lineLabel, { color: tokens.muted }]}>{label}</Text>
        <Text selectable style={[styles.lineValue, { color: tokens.text }]}>{value}</Text>
      </View>
      {detail ? <Text numberOfLines={1} style={[styles.lineDetail, { color: tokens.muted }]}>{detail}</Text> : null}
    </View>
  )
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
        preparingBody: 'Chưa chuyển tiền. QR và nội dung chuyển khoản sẽ hiện khi sẵn sàng.',
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
        reviewBody: 'Chạm vào số sao để chấm điểm. Đánh giá được lưu vào công việc này.',
        reviewTitle: 'Đánh giá công việc',
        savingLabel: 'Đang lưu xác nhận',
        stepOne: '1. Quét mã QR bằng ứng dụng ngân hàng.',
        stepTwo: '2. Kiểm tra số tiền và nội dung trước khi chuyển.',
        stepThree: '3. Quay lại bấm “Tôi đã chuyển khoản”.',
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
        preparingBody: 'Do not transfer yet. The QR and transfer details appear when ready.',
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
        reviewBody: 'Tap a star to rate. Your review is saved to this work.',
        reviewTitle: 'Review the work',
        savingLabel: 'Saving confirmation',
        stepOne: '1. Scan the QR code in your banking app.',
        stepTwo: '2. Check the amount and content before sending.',
        stepThree: '3. Come back and tap “I made the transfer”.',
        transferLabel: 'Transfer content',
        unavailableBody: 'No configured payment method is available for this work. Kael never confirms a transaction from a statement or screenshot.',
        unavailableStatus: 'Unavailable',
        unavailableTitle: 'Payment cannot continue yet',
        unverifiedReceiptBody: 'The work status and payment receipt do not agree. Operations must reconcile them before review opens. Do not send more money.',
        verifiedReceiptPendingBody: 'The receipt is verified, but the work status has not caught up. Operations must reconcile them before review opens. Do not send more money.',
      }
}

const styles = StyleSheet.create({
  accountRows: { gap: 10 },
  actionStack: { gap: 10 },
  amount: { ...typography.title2, fontWeight: '600', fontVariant: ['tabular-nums'] },
  body: { ...typography.body },
  detailGroup: { gap: 4 },
  detailValue: { ...typography.callout, fontWeight: '600', fontVariant: ['tabular-nums'] },
  directCopy: { gap: 4 },
  directWarning: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, gap: 12, paddingHorizontal: 16, paddingVertical: 16 },
  glyph: { height: GLYPH_SIZE, width: GLYPH_SIZE },
  glyphHand: { height: GLYPH_SIZE, left: 0, position: 'absolute', top: 0, width: GLYPH_SIZE },
  header: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  headerCopy: { flex: 1, gap: 2 },
  heading: { ...typography.headline, fontWeight: '600' },
  instruction: { ...typography.subheadline },
  instructions: { borderTopWidth: StyleSheet.hairlineWidth, gap: 7, paddingTop: 16 },
  label: { ...typography.footnote, fontWeight: '600' },
  line: { alignItems: 'baseline', columnGap: 12, flexDirection: 'row', justifyContent: 'space-between' },
  lineDetail: { ...typography.footnote, textAlign: 'right' },
  lineGroup: { gap: 2 },
  lineLabel: { ...typography.footnote, flexShrink: 0 },
  lineValue: { ...typography.subheadline, flexShrink: 1, fontVariant: ['tabular-nums'], fontWeight: '600', textAlign: 'right' },
  messageTitle: { ...typography.callout, fontWeight: '600' },
  note: { ...typography.subheadline },
  qr: { height: '100%', width: '100%' },
  qrFrame: { alignSelf: 'flex-start', alignItems: 'center', aspectRatio: 1, backgroundColor: '#ffffff', borderColor: '#d8ece8', borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', maxWidth: QR_BOX_SIZE, padding: 10, width: '100%' },
  refreshFeedback: { ...typography.footnote, color: '#4f6f70', textAlign: 'center' },
  refreshGroup: { gap: 8 },
  reviewHeading: { ...typography.headline, fontWeight: '600' },
  reviewSection: { borderTopWidth: StyleSheet.hairlineWidth, gap: 12, paddingTop: 18 },
  status: { ...typography.subheadline, fontWeight: '600' },
  row: { ...CASE_WORK_ROW_STYLE },
  surface: { borderLeftWidth: 2, gap: 18, marginLeft: CASE_WORK_CONTENT_INSET, maxWidth: 608, paddingLeft: CASE_WORK_RAIL_PADDING },
  transferContent: { ...typography.callout, fontWeight: '600', fontVariant: ['tabular-nums'] },
})
