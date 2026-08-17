import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { Pressable, StyleSheet, Text, useWindowDimensions, View, type ViewStyle } from 'react-native'
import Svg, { Circle, Polyline } from 'react-native-svg'

import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import { color, component, radius, shadow, spacing, typography } from '@/design/theme'
import type {
  AdminFinanceOverviewResponse,
  AdminFinancePeriodInput,
  AdminFinanceRange,
  AdminFinanceSummaryResponse,
  AdminPaymentReconciliationDecisionInput,
  AdminPaymentReconciliationSummary,
  AdminViewActor,
} from '@/lib/api-types/admin'
import { useAppLanguage } from '@/lib/app-language'
import { adminControlService } from '@/lib/services'
import { FinanceControls, type FinanceView } from './admin-finance-controls'
import { createFinanceFormatters } from './admin-finance-formatters'
import { ReconciliationModal } from './admin-finance-reconciliation-modal'
import { reconciliationStatusLabel } from './admin-finance-reconciliation-status'
import { FinanceTaxReportsPanel, FinanceTransactionsPanel } from './admin-finance-reports'

const copyByLanguage = {
  vi: {
    accountBalance: 'Số dư tài khoản quan sát',
    actualAmount: 'Số tiền thực nhận',
    actualBankChange: 'Biến động ngân hàng thực tế',
    bankReference: 'Mã giao dịch ngân hàng',
    cancel: 'Hủy',
    customApply: 'Áp dụng khoảng ngày',
    customFrom: 'Từ ngày (YYYY-MM-DD)',
    customRange: 'Tùy chọn',
    customTo: 'Đến ngày (YYYY-MM-DD)',
    closingBalance: 'Số dư cuối kỳ',
    commissionAccrued: 'Hoa hồng phát sinh',
    commissionCollected: 'Hoa hồng đã thu',
    commissionReceivable: 'Hoa hồng còn phải thu',
    commissionRate: 'Tỷ lệ hoa hồng hiệu dụng',
    confirmDirect: 'Xác nhận trả trực tiếp',
    confirmIncoming: 'Xác nhận tiền vào',
    customerClaimedAt: 'Khách đã báo chuyển',
    directPayment: 'Trả trực tiếp cho thợ',
    exportUnavailable: 'Chưa có báo cáo có thể xuất cho kỳ này.',
    errorAction: 'Không thể lưu thay đổi. Dữ liệu chưa được cập nhật.',
    invalidRange: 'Khoảng ngày phải hợp lệ và không vượt quá 366 ngày.',
    expectedBankChange: 'Biến động hệ thống kỳ vọng',
    hold: 'Tiền đang giữ',
    incoming: 'Tổng tiền khách chuyển vào nền tảng',
    kaelCost: 'Chi phí Kael AI',
    load: 'Tải lại',
    noAccess: 'Tài khoản này chưa có quyền xem dữ liệu tài chính.',
    noBreakdown: 'Chưa có dữ liệu phân bổ cho kỳ này.',
    noQueue: 'Chưa có giao dịch nào cần đối soát.',
    noTrend: 'Chưa có dữ liệu xu hướng cho kỳ này.',
    openingBalance: 'Số dư đầu kỳ',
    paidOut: 'Tổng tiền đã chi trả cho thợ',
    payoutPending: 'Yêu cầu rút tiền đang chờ',
    payoutOverSla: 'Yêu cầu rút tiền quá hạn xử lý',
    previousUnavailable: 'Chưa có dữ liệu kỳ trước',
    paidJobs: 'Công việc đã thanh toán',
    averageOrder: 'Giá trị giao dịch trung bình',
    businessRetained: 'Doanh nghiệp thực giữ trước thuế và chi phí',
    cashView: 'Dòng tiền & đối soát',
    commissionView: 'Hoa hồng & chi trả',
    completedRefunds: 'Hoàn tiền đã hoàn tất',
    gmv: 'Tổng giá trị giao dịch',
    netCashFlow: 'Dòng tiền ròng',
    overview: 'Tổng quan',
    paymentMix: 'Theo phương thức thanh toán',
    period: 'Kỳ báo cáo',
    readOnly: 'Chỉ xem',
    receiptStatus: 'Trạng thái biên nhận',
    reconcile: 'Đối soát',
    reconcileRequired: 'Cần đối soát thêm',
    reconciliationQueue: 'Hàng chờ đối soát',
    saveBalance: 'Lưu số dư quan sát',
    saveBalanceHint: 'Nhập số dư bạn đang thấy trên tài khoản ngân hàng. Kael không tự suy đoán số dư hay xác nhận giao dịch.',
    snapshotSaved: 'Đã lưu số dư quan sát.',
    subtitle: 'Theo dõi giá trị giao dịch, hoa hồng và dòng tiền từ dữ liệu đã ghi nhận.',
    sourceAverageOrder: 'Công thức: GMV ÷ công việc đã thanh toán',
    sourceBusinessRetained: 'Công thức: Hoa hồng đã thu − hoàn hoặc đảo phí',
    sourceGmv: 'Nguồn: Khoản thanh toán hoàn tất',
    sourceIncoming: 'Nguồn: Khoản tiền đã vào nền tảng',
    sourceKaelCost: 'Nguồn: Chi phí provider, USD',
    sourceNetCashFlow: 'Công thức: Tiền vào − chi trả − hoàn tiền',
    sourcePaidJobs: 'Nguồn: Công việc có thanh toán hoàn tất',
    sourcePaidOut: 'Nguồn: Lệnh chi trả cho thợ đã hoàn tất',
    syncing: 'Đang chờ đồng bộ',
    serviceMix: 'Theo loại dịch vụ',
    taxEstimate: 'Ước tính thuế',
    taxStatus: 'Chưa cấu hình — chưa có ước tính',
    taxView: 'Thuế & báo cáo',
    title: 'Tổng quan tài chính',
    trend: 'Xu hướng theo kỳ',
    timeZone: 'Múi giờ Asia/Ho_Chi_Minh',
    versusPrevious: 'so với kỳ trước',
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
    customApply: 'Apply date range',
    customFrom: 'From date (YYYY-MM-DD)',
    customRange: 'Custom',
    customTo: 'To date (YYYY-MM-DD)',
    closingBalance: 'Closing balance',
    commissionAccrued: 'Commission accrued',
    commissionCollected: 'Commission collected',
    commissionReceivable: 'Commission receivable',
    commissionRate: 'Effective commission rate',
    confirmDirect: 'Confirm direct payment',
    confirmIncoming: 'Confirm incoming transfer',
    customerClaimedAt: 'Customer reported transfer',
    directPayment: 'Paid directly to worker',
    exportUnavailable: 'No report is available to export for this period.',
    errorAction: 'The change could not be saved. The data was not updated.',
    invalidRange: 'The date range must be valid and no longer than 366 days.',
    expectedBankChange: 'Expected system movement',
    hold: 'Worker funds on hold',
    incoming: 'Customer transfers into platform',
    kaelCost: 'Kael AI cost',
    load: 'Reload',
    noAccess: 'This account does not have finance data access.',
    noBreakdown: 'No breakdown data is available for this period.',
    noQueue: 'There are no payments awaiting reconciliation.',
    noTrend: 'No trend data is available for this period.',
    openingBalance: 'Opening balance',
    paidOut: 'Payouts sent to workers',
    payoutPending: 'Pending payouts',
    payoutOverSla: 'Payouts past processing target',
    previousUnavailable: 'Previous period unavailable',
    paidJobs: 'Paid jobs',
    averageOrder: 'Average transaction value',
    businessRetained: 'Business retained before tax and operating costs',
    cashView: 'Cash & reconciliation',
    commissionView: 'Commission & payouts',
    completedRefunds: 'Completed refunds',
    gmv: 'Gross transaction value (GMV)',
    netCashFlow: 'Net cash flow',
    overview: 'Overview',
    paymentMix: 'By payment method',
    period: 'Reporting period',
    readOnly: 'Read only',
    receiptStatus: 'Receipt status',
    reconcile: 'Reconcile',
    reconcileRequired: 'Keep for reconciliation',
    reconciliationQueue: 'Reconciliation queue',
    saveBalance: 'Save observed balance',
    saveBalanceHint: 'Enter the balance you currently see in the bank account. Kael does not infer balances or confirm transactions.',
    snapshotSaved: 'The observed balance was saved.',
    subtitle: 'Track transaction value, commission, and cash flow from recorded data.',
    sourceAverageOrder: 'Formula: GMV ÷ paid jobs',
    sourceBusinessRetained: 'Formula: commission collected − refunds or reversals',
    sourceGmv: 'Source: completed payment orders',
    sourceIncoming: 'Source: transfers received by the platform',
    sourceKaelCost: 'Source: provider spend, USD',
    sourceNetCashFlow: 'Formula: incoming − payouts − refunds',
    sourcePaidJobs: 'Source: jobs with a completed payment',
    sourcePaidOut: 'Source: completed worker payouts',
    syncing: 'Waiting for synchronization',
    serviceMix: 'By service',
    taxEstimate: 'Estimated tax',
    taxStatus: 'Not configured — no estimate available',
    taxView: 'Tax & reports',
    title: 'Finance overview',
    trend: 'Period trend',
    timeZone: 'Asia/Ho_Chi_Minh time zone',
    versusPrevious: 'versus previous period',
    transferredAt: 'Credited at',
    unavailable: 'Not recorded',
    updated: 'The data was refreshed.',
    variance: 'Unexplained variance',
    waitingCustomer: 'Waiting for both confirmations',
    workerAvailable: 'Worker available funds',
  },
} as const

type FinanceCopy = (typeof copyByLanguage)[keyof typeof copyByLanguage]
type FinanceBreakdown = { amount: number; label: string }
type FinanceOverviewMetric = AdminFinanceOverviewResponse['metrics'][keyof AdminFinanceOverviewResponse['metrics']]

type FinanceState = {
  activeView: FinanceView
  actualAmount: string
  bankReference: string
  customEditorOpen: boolean
  customFrom: string
  customMode: boolean
  customTo: string
  error: string | null
  loading: boolean
  notice: string | null
  observedBalance: string
  overview: AdminFinanceOverviewResponse | null
  pendingAction: string | null
  range: AdminFinanceRange
  reason: string
  reconciliations: AdminPaymentReconciliationSummary[]
  selected: AdminPaymentReconciliationSummary | null
  summary: AdminFinanceSummaryResponse | null
}

type FinanceAction = { type: 'patch'; value: Partial<FinanceState> }

const initialFinanceState: FinanceState = {
  activeView: 'overview',
  actualAmount: '',
  bankReference: '',
  customEditorOpen: false,
  customFrom: '',
  customMode: false,
  customTo: '',
  error: null,
  loading: true,
  notice: null,
  observedBalance: '',
  overview: null,
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
  initialView,
  onViewChange,
  reduceMotion,
  reduceTransparency,
}: {
  actor: AdminViewActor | null
  initialView?: string
  onViewChange?: (view: FinanceView) => void
  reduceMotion: boolean
  reduceTransparency: boolean
}) {
  const { width } = useWindowDimensions()
  const language = useAppLanguage()
  const copy = copyByLanguage[language]
  const canRead = actor?.capabilities.includes('finance.read') || actor?.capabilities.includes('finance.reconcile') || false
  const canReconcile = actor?.capabilities.includes('finance.reconcile') ?? false
  const canManageTax = actor?.capabilities.includes('finance.tax.manage') ?? false
  const canApproveTax = actor?.access_level === 'owner' && canManageTax
  const [state, dispatch] = useReducer(financeReducer, { ...initialFinanceState, activeView: normalizeFinanceView(initialView) })
  const [taxRefreshKey, refreshTaxPolicies] = useReducer((value: number) => value + 1, 0)
  const loadRequestIdRef = useRef(0)
  const patch = useCallback((value: Partial<FinanceState>) => {
    dispatch({ type: 'patch', value })
  }, [])
  const {
    activeView,
    actualAmount,
    bankReference,
    customEditorOpen,
    customFrom,
    customMode,
    customTo,
    error,
    loading,
    notice,
    observedBalance,
    overview,
    pendingAction,
    range,
    reason,
    reconciliations,
    selected,
    summary,
  } = state
  const period = useMemo<AdminFinancePeriodInput | null>(() => customMode
    ? customFinancePeriod(customFrom, customTo)
    : { range }, [customFrom, customMode, customTo, range])

  useEffect(() => {
    patch({ activeView: normalizeFinanceView(initialView) })
  }, [initialView, patch])

  const load = useCallback(async () => {
    const requestId = loadRequestIdRef.current + 1
    loadRequestIdRef.current = requestId
    if (!canRead) {
      patch({ loading: false })
      return
    }
    if (!period) {
      patch({ error: copy.invalidRange, loading: false })
      return
    }
    patch({ error: null, loading: true })
    const [summaryResult, overviewResult, queueResult] = await Promise.all([
      period.range ? adminControlService.getFinanceSummary({ range: period.range, anchor: period.anchor }) : Promise.resolve(null),
      adminControlService.getFinanceOverview(period),
      canReconcile
        ? adminControlService.listPaymentReconciliations({ status: 'pending', limit: 25, offset: 0 })
        : Promise.resolve(null),
    ])
    if (requestId === loadRequestIdRef.current) {
      patch({
        error: null,
        loading: false,
        overview: overviewResult.success ? overviewResult.data : null,
        reconciliations: queueResult?.success ? queueResult.data.payment_reconciliations : [],
        summary: summaryResult?.success ? summaryResult.data : null,
      })
    }
  }, [canRead, canReconcile, copy.invalidRange, patch, period])

  const invalidatePendingLoad = useCallback(() => {
    loadRequestIdRef.current += 1
  }, [])

  useEffect(() => {
    void load()
    return invalidatePendingLoad
  }, [invalidatePendingLoad, load])

  const { formatCount, formatCurrency, formatDate, formatPercent, formatUsd } = useMemo(
    () => createFinanceFormatters(language, copy.unavailable),
    [copy.unavailable, language],
  )
  const metricCardStyle = useMemo<ViewStyle>(() => ({
    flexBasis: width < 600 ? '100%' : width < 840 ? '46%' : '30%',
    minWidth: width < 600 ? 0 : 190,
  }), [width])
  const metricValue = (metric: FinanceOverviewMetric | undefined, legacy: number | null | undefined) => overview ? metric?.value ?? null : legacy ?? null
  const gmv = overview?.metrics.gmv_vnd.value ?? null
  const commissionAccrued = metricValue(overview?.metrics.commission_accrued_vnd, summary?.commission_accrued)
  const effectiveCommissionRateBps = gmv !== null && gmv > 0 && commissionAccrued !== null ? (commissionAccrued / gmv) * 10_000 : null
  const trendPoints = overview?.trend.flatMap((point) => point.gmv_vnd === null ? [] : [{ label: formatDate(point.bucket_start), value: point.gmv_vnd }]) ?? null
  const paymentBreakdown = overview?.payment_methods.flatMap((item) => item.gmv_vnd === null ? [] : [{ amount: item.gmv_vnd, label: financeBreakdownLabel(item.payment_method, 'payment', language) }]) ?? null
  const serviceBreakdown = overview?.services.flatMap((item) => item.gmv_vnd === null ? [] : [{ amount: item.gmv_vnd, label: financeBreakdownLabel(item.service_type, 'service', language) }]) ?? null

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

  if (!canRead) {
    return <View style={styles.accessCard} testID="admin-finance-no-access"><Text style={styles.accessText}>{copy.noAccess}</Text></View>
  }

  return <View style={styles.stack} testID="admin-finance-panel">
    <View style={styles.header}>
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.subtitle}>{copy.subtitle}</Text>
    </View>

    <FinanceControls
      activeView={activeView}
      copy={copy}
      customEditorOpen={customEditorOpen}
      customFrom={customFrom}
      customMode={customMode}
      customTo={customTo}
      compact={width < 600}
      language={language}
      onApplyCustom={() => customFinancePeriod(customFrom, customTo) ? patch({ customEditorOpen: false, customMode: true }) : patch({ error: copy.invalidRange })}
      onChangeCustomFrom={(customFrom) => patch({ customFrom })}
      onChangeCustomTo={(customTo) => patch({ customTo })}
      onRefresh={() => { refreshTaxPolicies(); void load() }}
      onSelectRange={(range) => patch({ customEditorOpen: false, customMode: false, range })}
      onSelectView={(nextView) => {
        patch({ activeView: nextView })
        onViewChange?.(nextView)
      }}
      onToggleCustom={() => patch({ customEditorOpen: !customEditorOpen })}
      range={range}
    />

    {notice ? <View accessibilityLiveRegion={reduceMotion ? 'polite' : 'none'} style={styles.notice}><Text style={styles.noticeText}>{notice}</Text><Pressable accessibilityRole="button" accessibilityLabel={copy.cancel} onPress={() => patch({ notice: null })}><Text style={styles.dismiss}>×</Text></Pressable></View> : null}
    {error ? <View accessibilityRole="alert" style={styles.error}><Text style={styles.errorText}>{error}</Text><Pressable accessibilityRole="button" accessibilityLabel={copy.load} onPress={() => { void load() }}><Text style={styles.errorAction}>{copy.load}</Text></Pressable></View> : null}

    {loading ? <View style={styles.loading}><Text style={styles.loadingText}>{copy.load}</Text></View> : activeView === 'overview' ? <View style={styles.viewStack} testID="admin-finance-view-overview">
      <FinanceMetricGrid cardStyle={metricCardStyle} items={[
        financeMetricItem('gmv', copy.gmv, copy.sourceGmv, overview?.metrics.gmv_vnd, formatCurrency, copy),
        financeMetricItem('paid-jobs', copy.paidJobs, copy.sourcePaidJobs, overview?.metrics.paid_jobs, formatCount, copy),
        financeMetricItem('average-order', copy.averageOrder, copy.sourceAverageOrder, overview?.metrics.average_order_value_vnd, formatCurrency, copy),
        financeMetricItem('business-retained', copy.businessRetained, copy.sourceBusinessRetained, overview?.metrics.business_kept_vnd, formatCurrency, copy),
        financeMetricItem('incoming', copy.incoming, copy.sourceIncoming, overview?.metrics.platform_incoming_vnd, formatCurrency, copy, summary?.platform_incoming),
        financeMetricItem('paid-out', copy.paidOut, copy.sourcePaidOut, overview?.metrics.payout_outflow_vnd, formatCurrency, copy, summary?.payout_outflow),
        financeMetricItem('net-cash-flow', copy.netCashFlow, copy.sourceNetCashFlow, overview?.metrics.net_cash_flow_vnd, formatCurrency, copy),
        financeMetricItem('kael-cost', copy.kaelCost, copy.sourceKaelCost, overview?.metrics.kael_ai_cost_usd, formatUsd, copy),
      ]} />
      <TrendChart copy={copy} points={trendPoints} />
      <View style={styles.breakdownGrid}>
        <BreakdownCard copy={copy} formatCurrency={formatCurrency} items={paymentBreakdown} title={copy.paymentMix} />
        <BreakdownCard copy={copy} formatCurrency={formatCurrency} items={serviceBreakdown} title={copy.serviceMix} />
      </View>
    </View> : activeView === 'cash' ? <FinanceCashView
      canReconcile={canReconcile}
      copy={copy}
      formatCurrency={formatCurrency}
      formatDate={formatDate}
      metricCardStyle={metricCardStyle}
      observedBalance={observedBalance}
      onChangeObservedBalance={(observedBalance) => patch({ observedBalance })}
      onOpenReconciliation={openReconciliation}
      onSaveObservedBalance={() => { void saveObservedBalance() }}
      overview={overview}
      pendingAction={pendingAction}
      reconciliations={reconciliations}
      summary={summary}
    /> : activeView === 'commission' ? <View style={styles.viewStack} testID="admin-finance-view-commission">
      <FinanceMetricGrid cardStyle={metricCardStyle} items={[
        financePendingMetricItem('commission-accrued', copy.commissionAccrued, commissionAccrued, formatCurrency, copy),
        financePendingMetricItem('commission-collected', copy.commissionCollected, metricValue(overview?.metrics.commission_collected_vnd, summary?.commission_collected), formatCurrency, copy),
        financePendingMetricItem('commission-receivable', copy.commissionReceivable, metricValue(overview?.metrics.commission_receivable_vnd, summary?.commission_receivable), formatCurrency, copy),
        financePendingMetricItem('commission-rate', copy.commissionRate, effectiveCommissionRateBps, formatPercent, copy),
        financePendingMetricItem('worker-hold', copy.hold, overview ? overview.current_balances.worker_hold_vnd.value : summary?.worker_hold, formatCurrency, copy),
        financePendingMetricItem('worker-available', copy.workerAvailable, overview ? overview.current_balances.worker_available_vnd.value : summary?.worker_available, formatCurrency, copy),
        financePendingMetricItem('payout-pending', copy.payoutPending, overview ? overview.current_balances.payout_pending_vnd.value : summary?.payout_pending, formatCurrency, copy),
        financePendingMetricItem('payout-over-sla', copy.payoutOverSla, undefined, formatCount, copy),
      ]} />
      {period ? <FinanceTransactionsPanel formatCurrency={formatCurrency} language={language} period={period} /> : null}
    </View> : <View style={styles.viewStack} testID="admin-finance-view-tax">
      {overview?.tax_policy_ids.length && overview.metrics.tax_estimate_vnd.value !== null
        ? <MetricCard label={copy.taxEstimate} style={metricCardStyle} value={formatCurrency(overview.metrics.tax_estimate_vnd.value)} />
        : <View style={styles.emptyCard}><Text style={styles.sectionTitle}>{copy.taxStatus}</Text></View>}
      {period ? <FinanceTaxReportsPanel canApproveTax={canApproveTax} canManageTax={canManageTax} language={language} period={period} reduceMotion={reduceMotion} refreshKey={taxRefreshKey} /> : null}
    </View>}

    {canReconcile ? <ReconciliationModal
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
    /> : null}
  </View>
}

function FinanceCashView({
  canReconcile,
  copy,
  formatCurrency,
  formatDate,
  metricCardStyle,
  observedBalance,
  onChangeObservedBalance,
  onOpenReconciliation,
  onSaveObservedBalance,
  overview,
  pendingAction,
  reconciliations,
  summary,
}: {
  canReconcile: boolean
  copy: FinanceCopy
  formatCurrency: (value: number | null) => string
  formatDate: (value: string | null) => string
  metricCardStyle: ViewStyle
  observedBalance: string
  onChangeObservedBalance: (value: string) => void
  onOpenReconciliation: (item: AdminPaymentReconciliationSummary) => void
  onSaveObservedBalance: () => void
  overview: AdminFinanceOverviewResponse | null
  pendingAction: string | null
  reconciliations: AdminPaymentReconciliationSummary[]
  summary: AdminFinanceSummaryResponse | null
}) {
  return <View style={styles.viewStack} testID="admin-finance-view-cash">
    {!canReconcile ? <View style={styles.readOnlyBadge}><Text style={styles.readOnlyText}>{copy.readOnly}</Text></View> : null}
    <FinanceMetricGrid cardStyle={metricCardStyle} items={[
      financePendingMetricItem('incoming', copy.incoming, summary?.platform_incoming, formatCurrency, copy),
      financePendingMetricItem('paid-out', copy.paidOut, summary?.payout_outflow, formatCurrency, copy),
      financePendingMetricItem('direct-payment', copy.directPayment, summary?.direct_payment_total, formatCurrency, copy),
      financePendingMetricItem('completed-refunds', copy.completedRefunds, overview?.metrics.refund_completed_vnd.value, formatCurrency, copy),
    ]} />
    <View style={styles.balanceCard}>
      <Text style={styles.sectionTitle}>{copy.accountBalance}</Text>
      <View style={styles.balanceGrid}>
        <PendingMetric label={copy.openingBalance} value={overview?.bank_reconciliation.opening_balance_vnd.value ?? summary?.opening_balance} formatValue={formatCurrency} copy={copy} />
        <PendingMetric label={copy.closingBalance} value={overview?.bank_reconciliation.closing_balance_vnd.value ?? summary?.closing_balance} formatValue={formatCurrency} copy={copy} />
        <PendingMetric label={copy.expectedBankChange} value={overview?.bank_reconciliation.expected_change_vnd.value ?? summary?.expected_bank_change} formatValue={formatCurrency} copy={copy} />
        <PendingMetric label={copy.actualBankChange} value={overview?.bank_reconciliation.actual_change_vnd.value ?? summary?.actual_bank_change} formatValue={formatCurrency} copy={copy} />
        <PendingMetric label={copy.variance} value={overview?.bank_reconciliation.unexplained_variance_vnd.value ?? summary?.unexplained_variance} formatValue={formatCurrency} copy={copy} />
      </View>
      {canReconcile ? <><Text style={styles.subtitle}>{copy.saveBalanceHint}</Text><KaelTextField
        accessibilityLabel={copy.accountBalance}
        keyboardType="number-pad"
        label={copy.accountBalance}
        onChangeText={onChangeObservedBalance}
        placeholder="0"
        placeholderTextColor={color.text.muted}
        value={observedBalance}
      />
      <KaelButton disabled={pendingAction === 'snapshot'} label={copy.saveBalance} onPress={onSaveObservedBalance} variant="secondary" /></> : null}
    </View>

    {canReconcile ? <><View style={styles.queueHeader}>
      <Text style={styles.sectionTitle}>{copy.reconciliationQueue}</Text>
    </View>
    {reconciliations.length === 0 ? <View style={styles.emptyCard}><Text style={styles.emptyText}>{copy.noQueue}</Text></View> : reconciliations.map((item) => <Pressable
      accessibilityLabel={`${copy.reconciliationQueue}: ${item.job_id}`}
      accessibilityRole="button"
      key={item.id}
      onPress={() => onOpenReconciliation(item)}
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
    </Pressable>)}</> : null}
  </View>
}

type FinanceMetricItem = {
  comparison?: string
  dataSource?: string
  direction?: FinanceOverviewMetric['direction']
  key: string
  label: string
  value: string
}

function FinanceMetricGrid({ cardStyle, items }: { cardStyle: ViewStyle; items: FinanceMetricItem[] }) {
  return <View style={styles.metricGrid}>{items.map((item) => <MetricCard comparison={item.comparison} dataSource={item.dataSource} direction={item.direction} key={item.key} label={item.label} style={cardStyle} testID={`admin-finance-metric-${item.key}`} value={item.value} />)}</View>
}

function PendingMetric({ copy, formatValue, label, value }: { copy: FinanceCopy; formatValue: (value: number | null) => string; label: string; value: number | null | undefined }) {
  return <Metric dataSource={value === null || value === undefined ? copy.syncing : undefined} label={label} value={formatValue(value ?? null)} />
}

function MetricCard({ comparison, dataSource, direction, label, style, testID, value }: { comparison?: string; dataSource?: string; direction?: FinanceOverviewMetric['direction']; label: string; style?: ViewStyle; testID?: string; value: string }) {
  return <View style={[styles.metricCard, style]} testID={testID}><Metric compact label={label} value={value} />{dataSource ? <Text style={styles.metricDataSource} testID={testID ? `${testID}-source` : undefined}>{dataSource}</Text> : null}{comparison ? <Text style={[styles.metricComparison, direction === 'up' ? styles.metricComparisonUp : direction === 'down' ? styles.metricComparisonDown : null]}>{comparison}</Text> : null}</View>
}

function Metric({ compact = false, dataSource, label, value }: { compact?: boolean; dataSource?: string; label: string; value: string }) {
  return <View style={[styles.metric, compact && styles.metricCompact]}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text>{dataSource ? <Text style={styles.metricDataSource}>{dataSource}</Text> : null}</View>
}

function TrendChart({ copy, points }: { copy: FinanceCopy; points: { label: string; value: number }[] | null }) {
  if (!points?.length) return <View style={styles.emptyCard}><Text style={styles.sectionTitle}>{copy.trend}</Text><Text style={styles.emptyText}>{copy.noTrend}</Text></View>
  const values = points.map((point) => point.value)
  const min = Math.min(...values)
  const spread = Math.max(Math.max(...values) - min, 1)
  const plot = points.map((point, index) => {
    const x = points.length === 1 ? 160 : 12 + index * (296 / (points.length - 1))
    const y = 112 - ((point.value - min) / spread) * 88
    return { ...point, x, y }
  })
  return <View style={styles.chartCard}>
    <Text style={styles.sectionTitle}>{copy.trend}</Text>
    <View accessibilityLabel={`${copy.trend}: ${points.map((point) => `${point.label} ${point.value}`).join(', ')}`} accessibilityRole="image">
      <Svg height={128} viewBox="0 0 320 128" width="100%">
        <Polyline fill="none" points={plot.map((point) => `${point.x},${point.y}`).join(' ')} stroke={color.brand.primary} strokeWidth={3} />
        {plot.map((point) => <Circle cx={point.x} cy={point.y} fill={color.surface.base} key={`${point.label}-${point.x}`} r={4} stroke={color.brand.primary} strokeWidth={2} />)}
      </Svg>
    </View>
  </View>
}

function BreakdownCard({ copy, formatCurrency, items, title }: { copy: FinanceCopy; formatCurrency: (value: number | null) => string; items: FinanceBreakdown[] | null; title: string }) {
  const visibleItems = items?.filter((item) => item.label.trim()) ?? []
  return <View style={styles.breakdownCard}><Text style={styles.sectionTitle}>{title}</Text>{visibleItems.length
    ? visibleItems.map((item) => <View key={item.label} style={styles.breakdownRow}><Text style={styles.breakdownLabel}>{item.label}</Text><Text style={styles.breakdownValue}>{formatCurrency(item.amount)}</Text></View>)
    : <Text style={styles.emptyText}>{copy.noBreakdown}</Text>}</View>
}

function normalizeFinanceView(value: string | undefined): FinanceView {
  return value === 'cash' || value === 'commission' || value === 'tax' ? value : 'overview'
}

function financeMetricItem(
  key: string,
  label: string,
  source: string,
  metric: FinanceOverviewMetric | undefined,
  formatValue: (value: number | null) => string,
  copy: FinanceCopy,
  legacyValue?: number | null,
): FinanceMetricItem {
  const value = metric?.value ?? legacyValue ?? null
  const dataSource = value === null ? `${source} · ${copy.syncing}` : source
  const formattedValue = formatValue(value ?? 0)
  if (!metric || metric.value === null) return { dataSource, key, label, value: formattedValue }
  if (metric.change_value === null) return { comparison: copy.previousUnavailable, dataSource, direction: 'unavailable', key, label, value: formattedValue }
  const directionMark = metric.direction === 'up' ? '↑' : metric.direction === 'down' ? '↓' : '→'
  const percent = metric.change_percent === null ? '' : ` · ${Math.abs(metric.change_percent).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`
  return {
    comparison: `${directionMark} ${formatValue(Math.abs(metric.change_value))}${percent} ${copy.versusPrevious}`,
    dataSource,
    direction: metric.direction,
    key,
    label,
    value: formattedValue,
  }
}

function financePendingMetricItem(
  key: string,
  label: string,
  value: number | null | undefined,
  formatValue: (value: number | null) => string,
  copy: FinanceCopy,
): FinanceMetricItem {
  return {
    dataSource: value === null || value === undefined ? copy.syncing : undefined,
    key,
    label,
    value: formatValue(value ?? null),
  }
}

function financeBreakdownLabel(value: string, kind: 'payment' | 'service', language: 'vi' | 'en') {
  const paymentLabels: Record<string, readonly [string, string]> = {
    cash: ['Trả trực tiếp cho thợ', 'Paid directly to worker'],
    direct_worker: ['Trả trực tiếp cho thợ', 'Paid directly to worker'],
    platform_bank_manual: ['Chuyển khoản vào nền tảng', 'Transfer to platform'],
    sepay_vietqr: ['Chuyển khoản vào nền tảng', 'Transfer to platform'],
  }
  const serviceLabels: Record<string, readonly [string, string]> = {
    cleaning: ['Vệ sinh nhà cửa', 'Home cleaning'],
    electrical: ['Sửa điện', 'Electrical repair'],
    handyman: ['Sửa chữa nhỏ và lắp đặt', 'Minor repair and installation'],
    hvac: ['Điều hòa và không khí trong nhà', 'Air conditioning and indoor air'],
    plumbing: ['Sửa nước', 'Plumbing repair'],
    upholstery: ['Chăm sóc sofa và đồ vải', 'Sofa and fabric care'],
  }
  const fallback = kind === 'payment' ? ['Phương thức khác', 'Other payment method'] : ['Dịch vụ khác', 'Other service']
  const labels = kind === 'payment' ? paymentLabels[value] : serviceLabels[value]
  return (labels ?? fallback)[language === 'vi' ? 0 : 1]
}

function customFinancePeriod(from: string, to: string): AdminFinancePeriodInput | null {
  if (!validDateInput(from) || !validDateInput(to)) return null
  const fromDate = new Date(`${from}T00:00:00+07:00`)
  const inclusiveTo = new Date(`${to}T00:00:00+07:00`)
  const toDate = new Date(inclusiveTo.getTime() + 86_400_000)
  const duration = toDate.getTime() - fromDate.getTime()
  if (!Number.isFinite(duration) || duration <= 0 || duration > 366 * 86_400_000) return null
  return { from: fromDate.toISOString(), to: toDate.toISOString() }
}

function validDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

const styles = StyleSheet.create({
  accessCard: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, padding: spacing.lg },
  accessText: { ...typography.subheadline, color: color.text.secondary },
  balanceCard: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, gap: spacing.md, padding: spacing.lg, ...shadow.soft },
  balanceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  breakdownCard: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, flex: 1, gap: spacing.md, minWidth: 240, padding: spacing.lg },
  breakdownGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  breakdownLabel: { ...typography.subheadline, color: color.text.secondary, flex: 1 },
  breakdownRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  breakdownValue: { ...typography.label, color: color.text.strong, fontVariant: ['tabular-nums'], fontWeight: '700' },
  chartCard: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, gap: spacing.md, padding: spacing.lg },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  dismiss: { ...typography.headline, color: color.text.secondary },
  emptyCard: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, gap: spacing.sm, padding: spacing.lg },
  emptyText: { ...typography.subheadline, color: color.text.secondary },
  error: { alignItems: 'center', backgroundColor: component.chip.error.bg, borderColor: component.chip.error.border, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between', padding: spacing.md },
  errorAction: { ...typography.label, color: color.brand.primary, fontWeight: '700' },
  errorText: { ...typography.footnote, color: color.text.strong, flex: 1 },
  header: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, gap: spacing.sm, padding: spacing.lg, ...shadow.soft },
  jobId: { ...typography.caption2, color: color.text.muted, fontVariant: ['tabular-nums'] },
  loading: { alignItems: 'center', backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, padding: spacing.xl },
  loadingText: { ...typography.subheadline, color: color.text.secondary },
  metric: { flexBasis: 128, gap: spacing.xxs, minWidth: 128 },
  metricCard: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, flexBasis: '46%', flexGrow: 1, gap: spacing.sm, minWidth: 148, padding: spacing.md },
  metricCompact: { flexBasis: 'auto', minWidth: 0 },
  metricComparison: { ...typography.caption2, color: color.text.muted, marginTop: spacing.sm },
  metricComparisonDown: { color: color.text.secondary },
  metricComparisonUp: { color: color.brand.primaryDark },
  metricDataSource: { ...typography.caption1, color: color.text.secondary },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  metricLabel: { ...typography.caption2, color: color.text.muted, fontWeight: '600' },
  metricValue: { ...typography.headline, color: color.text.strong, fontVariant: ['tabular-nums'], fontWeight: '700' },
  notice: { alignItems: 'center', backgroundColor: component.chip.successStatus.bg, borderColor: component.chip.successStatus.border, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between', padding: spacing.md },
  noticeText: { ...typography.footnote, color: color.text.strong, flex: 1 },
  queueHeader: { marginTop: spacing.md },
  readOnlyBadge: { alignSelf: 'flex-start', backgroundColor: color.surface.soft, borderColor: color.surface.stroke, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  readOnlyText: { ...typography.label, color: color.text.secondary, fontWeight: '700' },
  reconciliationCard: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, gap: spacing.md, padding: spacing.lg, ...shadow.soft },
  reconciliationHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between' },
  reconciliationTitle: { ...typography.subheadline, color: color.text.strong, flex: 1, fontWeight: '700' },
  sectionTitle: { ...typography.headline, color: color.text.strong, fontWeight: '700' },
  stack: { gap: spacing.lg },
  status: { ...typography.caption2, color: color.brand.primary, fontWeight: '700', maxWidth: '48%', textAlign: 'right' },
  subtitle: { ...typography.subheadline, color: color.text.secondary },
  title: { ...typography.title3, color: color.text.strong, fontWeight: '700' },
  viewStack: { gap: spacing.lg },
})
