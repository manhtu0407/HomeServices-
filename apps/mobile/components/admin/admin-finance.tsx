import { useCallback, useEffect, useMemo, useReducer } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'

import { KaelButton, KaelChip, KaelTextField } from '@/components/ui/kael-primitives'
import { color, component, radius, shadow, spacing, typography } from '@/design/theme'
import type {
  AdminFinanceRange,
  AdminFinanceSummaryResponse,
  AdminPaymentReconciliationDecisionInput,
  AdminPaymentReconciliationSummary,
  AdminViewActor,
} from '@/lib/api-types/admin'
import { useAppLanguage } from '@/lib/app-language'
import { adminControlService } from '@/lib/services'

type FinanceCopy = {
  accountBalance: string
  actualAmount: string
  actualBankChange: string
  bankReference: string
  cancel: string
  closingBalance: string
  commissionAccrued: string
  commissionCollected: string
  commissionReceivable: string
  confirmDirect: string
  confirmIncoming: string
  customerClaimedAt: string
  directPayment: string
  errorAction: string
  expectedBankChange: string
  hold: string
  incoming: string
  load: string
  missingData: string
  noAccess: string
  noQueue: string
  openingBalance: string
  paidOut: string
  payoutPending: string
  receiptStatus: string
  reconcile: string
  reconcileRequired: string
  reconciliationQueue: string
  saveBalance: string
  saveBalanceHint: string
  snapshotSaved: string
  title: string
  transferredAt: string
  unavailable: string
  updated: string
  variance: string
  waitingCustomer: string
  workerAvailable: string
}

const copyByLanguage: Record<'vi' | 'en', FinanceCopy> = {
  vi: {
    accountBalance: 'Số dư tài khoản quan sát',
    actualAmount: 'Số tiền thực nhận',
    actualBankChange: 'Biến động ngân hàng thực tế',
    bankReference: 'Mã giao dịch ngân hàng',
    cancel: 'Hủy',
    closingBalance: 'Số dư cuối kỳ',
    commissionAccrued: 'Hoa hồng phát sinh',
    commissionCollected: 'Hoa hồng đã thu',
    commissionReceivable: 'Hoa hồng còn phải thu',
    confirmDirect: 'Xác nhận trả trực tiếp',
    confirmIncoming: 'Xác nhận tiền vào',
    customerClaimedAt: 'Khách đã báo chuyển',
    directPayment: 'Trả trực tiếp cho thợ',
    errorAction: 'Không thể lưu thay đổi. Dữ liệu chưa được cập nhật.',
    expectedBankChange: 'Biến động hệ thống kỳ vọng',
    hold: 'Tiền đang giữ',
    incoming: 'Tổng tiền khách chuyển vào nền tảng',
    load: 'Tải lại',
    missingData: 'Chưa đủ dữ liệu',
    noAccess: 'Tài khoản này chưa có quyền đối soát tài chính.',
    noQueue: 'Chưa có giao dịch nào cần đối soát.',
    openingBalance: 'Số dư đầu kỳ',
    paidOut: 'Tổng payout đã chuyển cho thợ',
    payoutPending: 'Payout đang chờ',
    receiptStatus: 'Trạng thái biên nhận',
    reconcile: 'Đối soát',
    reconcileRequired: 'Cần đối soát thêm',
    reconciliationQueue: 'Hàng chờ đối soát',
    saveBalance: 'Lưu số dư quan sát',
    saveBalanceHint: 'Nhập số dư bạn đang thấy trên tài khoản ngân hàng. Kael không tự suy đoán số dư hay xác nhận giao dịch.',
    snapshotSaved: 'Đã lưu số dư quan sát.',
    title: 'Đối soát thanh toán',
    transferredAt: 'Thời gian ghi có',
    unavailable: 'Chưa ghi nhận',
    updated: 'Dữ liệu đã được tải lại.',
    variance: 'Chênh lệch chưa giải thích',
    waitingCustomer: 'Đang chờ xác nhận hai phía',
    workerAvailable: 'Tiền khả dụng của thợ',
  },
  en: {
    accountBalance: 'Observed account balance',
    actualAmount: 'Actual amount received',
    actualBankChange: 'Actual bank movement',
    bankReference: 'Bank transaction reference',
    cancel: 'Cancel',
    closingBalance: 'Closing balance',
    commissionAccrued: 'Commission accrued',
    commissionCollected: 'Commission collected',
    commissionReceivable: 'Commission receivable',
    confirmDirect: 'Confirm direct payment',
    confirmIncoming: 'Confirm incoming transfer',
    customerClaimedAt: 'Customer reported transfer',
    directPayment: 'Paid directly to worker',
    errorAction: 'The change could not be saved. The data was not updated.',
    expectedBankChange: 'Expected system movement',
    hold: 'Worker funds on hold',
    incoming: 'Customer transfers into platform',
    load: 'Reload',
    missingData: 'Not enough data',
    noAccess: 'This account does not have finance reconciliation access.',
    noQueue: 'There are no payments awaiting reconciliation.',
    openingBalance: 'Opening balance',
    paidOut: 'Payouts sent to workers',
    payoutPending: 'Pending payouts',
    receiptStatus: 'Receipt status',
    reconcile: 'Reconcile',
    reconcileRequired: 'Keep for reconciliation',
    reconciliationQueue: 'Reconciliation queue',
    saveBalance: 'Save observed balance',
    saveBalanceHint: 'Enter the balance you currently see in the bank account. Kael does not infer balances or confirm transactions.',
    snapshotSaved: 'The observed balance was saved.',
    title: 'Payment reconciliation',
    transferredAt: 'Credited at',
    unavailable: 'Not recorded',
    updated: 'The data was refreshed.',
    variance: 'Unexplained variance',
    waitingCustomer: 'Waiting for both confirmations',
    workerAvailable: 'Worker available funds',
  },
}

const RANGE_OPTIONS: AdminFinanceRange[] = ['day', 'week', 'month', 'year']

type FinanceState = {
  actualAmount: string
  bankReference: string
  error: string | null
  loading: boolean
  notice: string | null
  observedBalance: string
  pendingAction: string | null
  range: AdminFinanceRange
  reason: string
  reconciliations: AdminPaymentReconciliationSummary[]
  selected: AdminPaymentReconciliationSummary | null
  summary: AdminFinanceSummaryResponse | null
}

type FinanceAction = { type: 'patch'; value: Partial<FinanceState> }

const initialFinanceState: FinanceState = {
  actualAmount: '',
  bankReference: '',
  error: null,
  loading: true,
  notice: null,
  observedBalance: '',
  pendingAction: null,
  range: 'month',
  reason: '',
  reconciliations: [],
  selected: null,
  summary: null,
}

function financeReducer(state: FinanceState, action: FinanceAction): FinanceState {
  return { ...state, ...action.value }
}

export function AdminFinancePanel({
  actor,
  reduceMotion,
  reduceTransparency,
}: {
  actor: AdminViewActor | null
  reduceMotion: boolean
  reduceTransparency: boolean
}) {
  const language = useAppLanguage()
  const copy = copyByLanguage[language]
  const canReconcile = actor?.capabilities.includes('finance.reconcile') ?? false
  const [state, dispatch] = useReducer(financeReducer, initialFinanceState)
  const patch = useCallback((value: Partial<FinanceState>) => {
    dispatch({ type: 'patch', value })
  }, [])
  const {
    actualAmount,
    bankReference,
    error,
    loading,
    notice,
    observedBalance,
    pendingAction,
    range,
    reason,
    reconciliations,
    selected,
    summary,
  } = state

  const load = useCallback(async () => {
    if (!canReconcile) {
      patch({ loading: false })
      return
    }
    patch({ error: null, loading: true })
    const [summaryResult, queueResult] = await Promise.all([
      adminControlService.getFinanceSummary({ range }),
      adminControlService.listPaymentReconciliations({ status: 'pending', limit: 25, offset: 0 }),
    ])
    patch({
      error: !summaryResult.success || !queueResult.success ? copy.errorAction : null,
      loading: false,
      reconciliations: queueResult.success ? queueResult.data.payment_reconciliations : [],
      summary: summaryResult.success ? summaryResult.data : null,
    })
  }, [canReconcile, copy.errorAction, patch, range])

  useEffect(() => {
    const timer = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(timer)
  }, [load])

  const formatCurrency = useCallback((value: number | null) => {
    if (value === null) return copy.missingData
    return new Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
      currency: 'VND',
      maximumFractionDigits: 0,
      style: 'currency',
    }).format(value)
  }, [copy.missingData, language])

  const formatDate = useCallback((value: string | null) => {
    if (!value) return copy.unavailable
    try {
      return new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    } catch {
      return copy.unavailable
    }
  }, [copy.unavailable, language])

  const metrics = useMemo(() => summary ? [
    [copy.incoming, summary.platform_incoming],
    [copy.paidOut, summary.payout_outflow],
    [copy.commissionAccrued, summary.commission_accrued],
    [copy.commissionCollected, summary.commission_collected],
    [copy.commissionReceivable, summary.commission_receivable],
    [copy.hold, summary.worker_hold],
    [copy.workerAvailable, summary.worker_available],
    [copy.payoutPending, summary.payout_pending],
    [copy.directPayment, summary.direct_payment_total],
  ] as const : [], [copy, summary])

  const openReconciliation = useCallback((item: AdminPaymentReconciliationSummary) => {
    patch({
      actualAmount: item.amount_received === null ? String(item.gross_amount) : String(item.amount_received),
      bankReference: '',
      reason: '',
      selected: item,
    })
  }, [patch])

  const submitReconciliation = useCallback(async (decision: AdminPaymentReconciliationDecisionInput['decision']) => {
    if (!selected) return
    const isManual = selected.payment_method === 'platform_bank_manual'
    const parsedAmount = Number(actualAmount.replace(/[^0-9]/g, ''))
    if (isManual && (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0 || !bankReference.trim())) {
      patch({ error: copy.errorAction })
      return
    }
    if ((decision === 'reconcile_required' || decision === 'direct_release') && reason.trim().length < 3) {
      patch({ error: copy.errorAction })
      return
    }
    patch({ error: null, pendingAction: `${selected.id}:${decision}` })
    const input: AdminPaymentReconciliationDecisionInput = {
      decision,
      ...(isManual ? {
        amount_received: parsedAmount,
        bank_reference: bankReference.trim(),
        credited_at: new Date().toISOString(),
      } : {}),
      ...((decision === 'reconcile_required' || decision === 'direct_release') ? { reason: reason.trim() } : {}),
    }
    const result = await adminControlService.decidePaymentReconciliation(selected.id, input)
    if (result.success) {
      patch({ notice: copy.updated, selected: null })
      await load()
    } else {
      patch({ error: copy.errorAction })
    }
    patch({ pendingAction: null })
  }, [actualAmount, bankReference, copy.errorAction, copy.updated, load, patch, reason, selected])

  const saveObservedBalance = useCallback(async () => {
    const balance = Number(observedBalance.replace(/[^0-9]/g, ''))
    if (!Number.isSafeInteger(balance) || balance < 0) {
      patch({ error: copy.errorAction })
      return
    }
    patch({ error: null, pendingAction: 'snapshot' })
    const result = await adminControlService.recordFinanceBalanceSnapshot({
      balance_vnd: balance,
      observed_at: new Date().toISOString(),
    })
    if (result.success) {
      patch({ notice: copy.snapshotSaved, observedBalance: '' })
      await load()
    } else {
      patch({ error: copy.errorAction })
    }
    patch({ pendingAction: null })
  }, [copy.errorAction, copy.snapshotSaved, load, observedBalance, patch])

  if (!canReconcile) {
    return <View style={styles.accessCard} testID="admin-finance-no-access"><Text style={styles.accessText}>{copy.noAccess}</Text></View>
  }

  return <View style={styles.stack} testID="admin-finance-panel">
    <View style={[styles.header, reduceTransparency ? styles.solidSurface : null]}>
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.subtitle}>{copy.saveBalanceHint}</Text>
    </View>

    <View style={styles.toolbar}>
      <View style={styles.rangeRow}>
        {RANGE_OPTIONS.map((option) => <KaelChip
          accessibilityLabel={rangeLabel(option, language)}
          accessibilityState={{ selected: range === option }}
          key={option}
          label={rangeLabel(option, language)}
          onPress={() => patch({ range: option })}
          testID={`admin-finance-range-${option}`}
          variant={range === option ? 'selected' : 'unselected'}
        />)}
      </View>
      <KaelButton label={copy.load} onPress={() => { void load() }} size="small" variant="secondary" />
    </View>

    {notice ? <View accessibilityLiveRegion={reduceMotion ? 'polite' : 'none'} style={styles.notice}><Text style={styles.noticeText}>{notice}</Text><Pressable accessibilityRole="button" accessibilityLabel={copy.cancel} onPress={() => patch({ notice: null })}><Text style={styles.dismiss}>×</Text></Pressable></View> : null}
    {error ? <View accessibilityRole="alert" style={styles.error}><Text style={styles.errorText}>{error}</Text><Pressable accessibilityRole="button" accessibilityLabel={copy.load} onPress={() => { void load() }}><Text style={styles.errorAction}>{copy.load}</Text></Pressable></View> : null}

    {loading ? <View style={styles.loading}><Text style={styles.loadingText}>{copy.load}</Text></View> : <>
      <View style={styles.metricGrid}>
        {metrics.map(([label, value]) => <MetricCard key={label} label={label} value={formatCurrency(value)} />)}
      </View>

      <View style={[styles.balanceCard, reduceTransparency ? styles.solidSurface : null]}>
        <Text style={styles.sectionTitle}>{copy.accountBalance}</Text>
        <View style={styles.balanceGrid}>
          <Metric label={copy.openingBalance} value={formatCurrency(summary?.opening_balance ?? null)} />
          <Metric label={copy.closingBalance} value={formatCurrency(summary?.closing_balance ?? null)} />
          <Metric label={copy.expectedBankChange} value={formatCurrency(summary?.expected_bank_change ?? null)} />
          <Metric label={copy.actualBankChange} value={formatCurrency(summary?.actual_bank_change ?? null)} />
          <Metric label={copy.variance} value={formatCurrency(summary?.unexplained_variance ?? null)} />
        </View>
        <KaelTextField
          accessibilityLabel={copy.accountBalance}
          keyboardType="number-pad"
          label={copy.accountBalance}
          onChangeText={(observedBalance) => patch({ observedBalance })}
          placeholder="0"
          placeholderTextColor={color.text.muted}
          value={observedBalance}
        />
        <KaelButton disabled={pendingAction === 'snapshot'} label={copy.saveBalance} onPress={() => { void saveObservedBalance() }} variant="secondary" />
      </View>

      <View style={styles.queueHeader}>
        <Text style={styles.sectionTitle}>{copy.reconciliationQueue}</Text>
      </View>
      {reconciliations.length === 0 ? <View style={styles.emptyCard}><Text style={styles.emptyText}>{copy.noQueue}</Text></View> : reconciliations.map((item) => <Pressable
        accessibilityLabel={`${copy.reconciliationQueue}: ${item.job_id}`}
        accessibilityRole="button"
        key={item.id}
        onPress={() => openReconciliation(item)}
        style={styles.reconciliationCard}
        testID={`admin-finance-reconciliation-${item.id}`}
      >
        <View style={styles.reconciliationHeader}>
          <Text style={styles.reconciliationTitle}>{item.payment_method === 'platform_bank_manual' ? copy.incoming : copy.directPayment}</Text>
          <Text style={styles.status}>{reconciliationStatusLabel(item.status, copy)}</Text>
        </View>
        <Text style={styles.jobId}>{item.job_id}</Text>
        <View style={styles.detailGrid}>
          <Metric label={copy.actualAmount} value={formatCurrency(item.amount_received ?? item.gross_amount)} />
          <Metric label={copy.customerClaimedAt} value={formatDate(item.customer_transfer_claimed_at)} />
        </View>
      </Pressable>)}
    </>}

    <ReconciliationModal
      actualAmount={actualAmount}
      bankReference={bankReference}
      copy={copy}
      formatCurrency={formatCurrency}
      onChangeActualAmount={(actualAmount) => patch({ actualAmount })}
      onChangeBankReference={(bankReference) => patch({ bankReference })}
      onChangeReason={(reason) => patch({ reason })}
      onClose={() => patch({ selected: null })}
      onSubmit={(decision) => { void submitReconciliation(decision) }}
      pending={Boolean(pendingAction)}
      reason={reason}
      reduceMotion={reduceMotion}
      reduceTransparency={reduceTransparency}
      selected={selected}
    />
  </View>
}

function ReconciliationModal({
  actualAmount,
  bankReference,
  copy,
  formatCurrency,
  onChangeActualAmount,
  onChangeBankReference,
  onChangeReason,
  onClose,
  onSubmit,
  pending,
  reason,
  reduceMotion,
  reduceTransparency,
  selected,
}: {
  actualAmount: string
  bankReference: string
  copy: FinanceCopy
  formatCurrency: (value: number | null) => string
  onChangeActualAmount: (value: string) => void
  onChangeBankReference: (value: string) => void
  onChangeReason: (value: string) => void
  onClose: () => void
  onSubmit: (decision: AdminPaymentReconciliationDecisionInput['decision']) => void
  pending: boolean
  reason: string
  reduceMotion: boolean
  reduceTransparency: boolean
  selected: AdminPaymentReconciliationSummary | null
}) {
  if (!selected) return null
  const isManual = selected.payment_method === 'platform_bank_manual'
  const canDecideDirect = selected.status === 'direct_reconcile_required'
  return <Modal animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={onClose} transparent visible>
    <View style={[styles.modalBackdrop, reduceTransparency ? styles.modalBackdropSolid : null]}>
      <View style={[styles.modalCard, reduceTransparency ? styles.solidSurface : null]}>
        <Text style={styles.modalTitle}>{copy.reconcile}</Text>
        <Text style={styles.modalAmount}>{formatCurrency(selected.gross_amount)}</Text>
        <Text style={styles.modalStatus}>{reconciliationStatusLabel(selected.status, copy)}</Text>
        {isManual ? <>
          <KaelTextField accessibilityLabel={copy.actualAmount} keyboardType="number-pad" label={copy.actualAmount} onChangeText={onChangeActualAmount} value={actualAmount} />
          <KaelTextField accessibilityLabel={copy.bankReference} autoCapitalize="characters" label={copy.bankReference} onChangeText={onChangeBankReference} value={bankReference} />
          <KaelButton disabled={pending} label={copy.confirmIncoming} onPress={() => onSubmit('confirm')} variant="primary" />
          <KaelTextField accessibilityLabel={copy.reconcileRequired} label={copy.reconcileRequired} onChangeText={onChangeReason} value={reason} />
          <KaelButton disabled={pending} label={copy.reconcileRequired} onPress={() => onSubmit('reconcile_required')} variant="secondary" />
        </> : canDecideDirect ? <>
          <Text style={styles.directHint}>{copy.waitingCustomer}</Text>
          <KaelButton disabled={pending} label={copy.confirmDirect} onPress={() => onSubmit('direct_paid')} variant="primary" />
          <KaelTextField accessibilityLabel={copy.reconcileRequired} label={copy.reconcileRequired} onChangeText={onChangeReason} value={reason} />
          <KaelButton disabled={pending} label={copy.reconcileRequired} onPress={() => onSubmit('direct_release')} variant="secondary" />
        </> : <>
          <Text style={styles.directHint}>{copy.waitingCustomer}</Text>
        </>}
        <KaelButton disabled={pending} label={copy.cancel} onPress={onClose} variant="ghost" />
      </View>
    </View>
  </Modal>
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return <View style={styles.metricCard}><Metric label={label} value={value} /></View>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>
}

function rangeLabel(range: AdminFinanceRange, language: 'vi' | 'en') {
  const labels = language === 'vi'
    ? { day: 'Ngày', week: 'Tuần', month: 'Tháng', year: 'Năm' }
    : { day: 'Day', week: 'Week', month: 'Month', year: 'Year' }
  return labels[range]
}

function reconciliationStatusLabel(status: string, copy: FinanceCopy) {
  if (status === 'manual_customer_claimed') return copy.customerClaimedAt
  if (status === 'manual_reconcile_required' || status === 'direct_reconcile_required') return copy.reconcileRequired
  if (status === 'direct_awaiting_customer_confirmation' || status === 'direct_awaiting_worker_confirmation') return copy.waitingCustomer
  return copy.receiptStatus
}

const styles = StyleSheet.create({
  accessCard: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, padding: spacing.lg },
  accessText: { ...typography.body, color: color.text.secondary },
  balanceCard: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, gap: spacing.md, padding: spacing.lg, ...shadow.soft },
  balanceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  directHint: { ...typography.footnote, color: color.text.secondary },
  dismiss: { ...typography.headline, color: color.text.secondary },
  emptyCard: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, padding: spacing.lg },
  emptyText: { ...typography.body, color: color.text.secondary },
  error: { alignItems: 'center', backgroundColor: component.chip.error.bg, borderColor: component.chip.error.border, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between', padding: spacing.md },
  errorAction: { ...typography.label, color: color.brand.primary, fontWeight: '700' },
  errorText: { ...typography.footnote, color: color.text.strong, flex: 1 },
  header: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, gap: spacing.sm, padding: spacing.lg, ...shadow.soft },
  jobId: { ...typography.caption2, color: color.text.muted, fontVariant: ['tabular-nums'] },
  loading: { alignItems: 'center', backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, padding: spacing.xl },
  loadingText: { ...typography.body, color: color.text.secondary },
  metric: { flexBasis: 128, flexGrow: 1, gap: spacing.xs, minWidth: 128 },
  metricCard: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, flexBasis: '46%', flexGrow: 1, minWidth: 148, padding: spacing.md },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  metricLabel: { ...typography.caption2, color: color.text.muted, fontWeight: '600' },
  metricValue: { ...typography.title3, color: color.text.strong, fontVariant: ['tabular-nums'], fontWeight: '700' },
  modalAmount: { ...typography.title2, color: color.text.strong, fontVariant: ['tabular-nums'], fontWeight: '700' },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(4, 20, 28, 0.42)', flex: 1, justifyContent: 'center', padding: spacing.lg },
  modalBackdropSolid: { backgroundColor: color.surface.base },
  modalCard: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, gap: spacing.md, maxWidth: 520, padding: spacing.lg, width: '100%', ...shadow.raised },
  modalStatus: { ...typography.footnote, color: color.text.secondary },
  modalTitle: { ...typography.title2, color: color.text.strong, fontWeight: '700' },
  notice: { alignItems: 'center', backgroundColor: component.chip.successStatus.bg, borderColor: component.chip.successStatus.border, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between', padding: spacing.md },
  noticeText: { ...typography.footnote, color: color.text.strong, flex: 1 },
  queueHeader: { marginTop: spacing.sm },
  rangeRow: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  reconciliationCard: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, gap: spacing.md, padding: spacing.lg, ...shadow.soft },
  reconciliationHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  reconciliationTitle: { ...typography.headline, color: color.text.strong, flex: 1, fontWeight: '700' },
  sectionTitle: { ...typography.title3, color: color.text.strong, fontWeight: '700' },
  solidSurface: { backgroundColor: color.surface.base },
  stack: { gap: spacing.lg },
  status: { ...typography.caption2, color: color.brand.primary, fontWeight: '700', maxWidth: '48%', textAlign: 'right' },
  subtitle: { ...typography.body, color: color.text.secondary },
  title: { ...typography.title2, color: color.text.strong, fontWeight: '700' },
  toolbar: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'space-between' },
})
