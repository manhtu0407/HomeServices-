import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { Pressable, useWindowDimensions, View, type ViewStyle } from 'react-native'

import type {
  AdminFinanceOverviewResponse,
  AdminFinancePeriodInput,
  AdminPaymentReconciliationDecisionInput,
  AdminPaymentReconciliationSummary,
  AdminViewActor,
} from '@/lib/api-types/admin'
import { useAppLanguage } from '@/lib/app-language'
import { generateClientRequestId } from '@/lib/client-request-id'
import { adminControlService } from '@/lib/services'
import { FinanceControls } from './admin-finance-controls'
import { FinanceCashView } from './admin-finance-cash-view'
import { createFinanceFormatters } from './admin-finance-formatters'
import { adminFinancePanelStyles as styles } from './admin-finance-panel-styles'
import {
  customFinancePeriod,
  financeBreakdownLabel,
  financeMetricItem,
  financePendingMetricItem,
  normalizeFinanceView,
} from './admin-finance-overview-helpers'
import { BreakdownCard, FinanceMetricGrid, MetricCard, TrendChart } from './admin-finance-overview-components'
import {
  financeReducer,
  initialFinanceState,
  initialReconciliationControlsState,
  reconciliationControlsReducer,
  type FinanceState,
} from './admin-finance-state'
import { ReconciliationModal } from './admin-finance-reconciliation-modal'
import { FinanceTaxReportsPanel, FinanceTransactionsPanel } from './admin-finance-reports'
import { AdminText } from './admin-text'

const copyByLanguage = {
  vi: {
    accountBalance: 'Số dư tài khoản quan sát',
    assignedTo: 'Người xử lý',
    assignmentReason: 'Lý do nhận thay hoặc bỏ nhận',
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
    cashConfirmation: 'Chờ xác nhận tiền mặt',
    cashConfirm: 'Xác nhận tiền mặt và khấu trừ hoa hồng',
    cashReject: 'Từ chối xác nhận tiền mặt',
    cashConfirmationHint: 'Khách đã xác nhận nhận tiền mặt. Xác nhận sẽ ghi nhận lương thợ và chỉ khấu trừ phần hoa hồng nền tảng.',
    claim: 'Nhận xử lý',
    takeover: 'Nhận thay',
    release: 'Bỏ nhận',
    confirmDecision: 'Xác nhận quyết định',
    workerNet: 'Lương thợ được ghi nhận',
    confirmDirect: 'Xác nhận trả trực tiếp',
    confirmIncoming: 'Xác nhận tiền vào',
    customerClaimedAt: 'Khách đã báo chuyển',
    customerReference: 'Mã khách hàng đã che',
    workerReference: 'Mã thợ đã che',
    serviceType: 'Dịch vụ',
    responseDeadline: 'Hạn phản hồi',
    detailTimeline: 'Lịch sử đối soát',
    detailUnavailable: 'Chưa thể tải chi tiết đối soát.',
    directPayment: 'Trả trực tiếp cho thợ',
    exportUnavailable: 'Chưa có báo cáo có thể xuất cho kỳ này.',
    errorAction: 'Không thể lưu thay đổi. Dữ liệu chưa được cập nhật.',
    invalidRange: 'Khoảng ngày phải hợp lệ và không vượt quá 366 ngày.',
    expectedBankChange: 'Biến động hệ thống kỳ vọng',
    hold: 'Tiền đang giữ',
    incoming: 'Tổng tiền khách chuyển vào nền tảng',
    kaelCost: 'Chi phí Kael AI',
    load: 'Tải lại',
    loadError: 'Không thể tải dữ liệu tài chính. Hãy thử lại.',
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
    partial: 'Dữ liệu một phần',
    averageOrder: 'Giá trị giao dịch trung bình',
    businessRetained: 'Doanh nghiệp thực giữ trước thuế và chi phí',
    cashView: 'Dòng tiền & đối soát',
    commissionView: 'Hoa hồng & chi trả',
    completedRefunds: 'Hoàn tiền đã hoàn tất',
    gmv: 'Tổng giá trị giao dịch',
    generatedAt: 'Dữ liệu tạo lúc',
    netCashFlow: 'Dòng tiền ròng',
    notAssigned: 'Chưa có người nhận xử lý',
    overview: 'Tổng quan',
    paymentMix: 'Theo phương thức thanh toán',
    period: 'Kỳ báo cáo',
    readOnly: 'Chỉ xem',
    searchReconciliation: 'Tìm mã công việc hoặc mã thanh toán',
    allMethods: 'Mọi phương thức',
    bankTransfer: 'Chuyển khoản',
    allAssignments: 'Mọi người xử lý',
    unassigned: 'Chưa có người nhận',
    assignedMine: 'Tôi đang xử lý',
    loadMore: 'Tải thêm',
    queueTotal: 'Cần xử lý',
    resultsSection: 'Kết quả',
    commissionSection: 'Hoa hồng',
    receiptStatus: 'Trạng thái biên nhận',
    reconcile: 'Đối soát',
    reconcileRequired: 'Cần đối soát thêm',
    reviewDecision: 'Rà soát trước khi ghi nhận',
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
    assignedTo: 'Assigned operator',
    assignmentReason: 'Reason for takeover or release',
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
    cashConfirmation: 'Cash confirmation required',
    cashConfirm: 'Confirm cash and collect commission',
    cashReject: 'Reject cash confirmation',
    cashConfirmationHint: 'The customer reported cash payment. Confirming records the worker salary and collects only the platform commission.',
    claim: 'Claim case',
    takeover: 'Take over',
    release: 'Release',
    confirmDecision: 'Confirm decision',
    workerNet: 'Worker salary recorded',
    confirmDirect: 'Confirm direct payment',
    confirmIncoming: 'Confirm incoming transfer',
    customerClaimedAt: 'Customer reported transfer',
    customerReference: 'Masked customer reference',
    workerReference: 'Masked worker reference',
    serviceType: 'Service',
    responseDeadline: 'Response deadline',
    detailTimeline: 'Reconciliation timeline',
    detailUnavailable: 'Reconciliation detail is unavailable.',
    directPayment: 'Paid directly to worker',
    exportUnavailable: 'No report is available to export for this period.',
    errorAction: 'The change could not be saved. The data was not updated.',
    invalidRange: 'The date range must be valid and no longer than 366 days.',
    expectedBankChange: 'Expected system movement',
    hold: 'Worker funds on hold',
    incoming: 'Customer transfers into platform',
    kaelCost: 'Kael AI cost',
    load: 'Reload',
    loadError: 'Unable to load finance data. Please try again.',
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
    partial: 'Partial data',
    averageOrder: 'Average transaction value',
    businessRetained: 'Business retained before tax and operating costs',
    cashView: 'Cash & reconciliation',
    commissionView: 'Commission & payouts',
    completedRefunds: 'Completed refunds',
    gmv: 'Gross transaction value (GMV)',
    generatedAt: 'Data generated at',
    netCashFlow: 'Net cash flow',
    notAssigned: 'No operator assigned',
    overview: 'Overview',
    paymentMix: 'By payment method',
    period: 'Reporting period',
    readOnly: 'Read only',
    searchReconciliation: 'Search job or payment code',
    allMethods: 'All methods',
    bankTransfer: 'Bank transfer',
    allAssignments: 'All assignees',
    unassigned: 'Unassigned',
    assignedMine: 'Assigned to me',
    loadMore: 'Load more',
    queueTotal: 'Needs action',
    resultsSection: 'Results',
    commissionSection: 'Commission',
    receiptStatus: 'Receipt status',
    reconcile: 'Reconcile',
    reconcileRequired: 'Keep for reconciliation',
    reviewDecision: 'Review before recording',
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

type FinanceOverviewMetric = AdminFinanceOverviewResponse['metrics'][keyof AdminFinanceOverviewResponse['metrics']]
type AdminFinancePanelProps = {
  actor: AdminViewActor | null
  initialView?: string
  reduceMotion: boolean
  reduceTransparency: boolean
}
function useAdminFinanceController({
  actor,
  initialView,
  reduceMotion,
}: AdminFinancePanelProps) {
  const { width } = useWindowDimensions()
  const language = useAppLanguage()
  const copy = copyByLanguage[language]
  const canRead = actor?.capabilities.includes('finance.read') || actor?.capabilities.includes('finance.reconcile') || false
  const canReconcile = actor?.capabilities.includes('finance.reconcile') ?? false
  const canManageTax = actor?.capabilities.includes('finance.tax.manage') ?? false
  const canApproveTax = actor?.access_level === 'owner' && canManageTax
  const [state, dispatch] = useReducer(financeReducer, { ...initialFinanceState, activeView: normalizeFinanceView(initialView) })
  const [taxRefreshKey, refreshTaxPolicies] = useReducer((value: number) => value + 1, 0)
  const [reconciliationControls, patchReconciliationControls] = useReducer(reconciliationControlsReducer, initialReconciliationControlsState)
  const {
    assignment: reconciliationAssignment,
    debouncedQuery: debouncedReconciliationQuery,
    method: reconciliationMethod,
    nextCursor: reconciliationNextCursor,
    query: reconciliationQuery,
    total: reconciliationTotal,
  } = reconciliationControls
  const loadRequestIdRef = useRef(0)
  const detailRequestIdRef = useRef(0)
  const hasLoadedRef = useRef(false)
  const backgroundLoadInFlightRef = useRef(false)

  useEffect(() => {
    const timeout = setTimeout(() => patchReconciliationControls({ debouncedQuery: reconciliationQuery.trim() }), 300)
    return () => clearTimeout(timeout)
  }, [reconciliationQuery])
  const patch = useCallback((value: Partial<FinanceState>) => {
    dispatch({ type: 'patch', value })
  }, [])
  const {
    activeView,
    actualAmount,
    assignmentReason,
    bankReference,
    customEditorOpen,
    customFrom,
    customMode,
    customTo,
    detailError,
    detailLoading,
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
    selectedDetail,
    summary,
  } = state
  const period = useMemo<AdminFinancePeriodInput | null>(() => customMode
    ? customFinancePeriod(customFrom, customTo)
    : { range }, [customFrom, customMode, customTo, range])

  useEffect(() => {
    patch({ activeView: normalizeFinanceView(initialView) })
  }, [initialView, patch])

  const load = useCallback(async ({ blocking }: { blocking?: boolean } = {}) => {
    const shouldBlock = blocking ?? !hasLoadedRef.current
    if (!shouldBlock && backgroundLoadInFlightRef.current) return
    if (!shouldBlock) backgroundLoadInFlightRef.current = true
    const requestId = loadRequestIdRef.current + 1
    loadRequestIdRef.current = requestId
    if (!canRead) {
      patch({ loading: false })
      hasLoadedRef.current = true
      backgroundLoadInFlightRef.current = false
      return
    }
    if (!period) {
      patch({ error: copy.invalidRange, loading: false })
      backgroundLoadInFlightRef.current = false
      return
    }
    patch({ error: null, ...(shouldBlock ? { loading: true } : {}) })
    try {
      const [summaryResult, overviewResult, queueResult] = await Promise.all([
        period.range ? adminControlService.getFinanceSummary({ range: period.range, anchor: period.anchor }) : Promise.resolve(null),
        adminControlService.getFinanceOverview(period),
        canReconcile && activeView === 'cash'
          ? adminControlService.listPaymentReconciliations({
            status: 'pending',
            limit: 25,
            assignment: reconciliationAssignment,
            payment_method: reconciliationMethod,
            query: debouncedReconciliationQuery || undefined,
          })
          : Promise.resolve(null),
      ])
      if (requestId === loadRequestIdRef.current) {
        patch({
          error: activeView === 'cash'
            ? ((canReconcile && queueResult && !queueResult.success) || !overviewResult.success ? copy.loadError : null)
            : (overviewResult.success ? null : copy.loadError),
          loading: false,
          ...(overviewResult.success ? { overview: overviewResult.data } : {}),
          ...(queueResult?.success ? { reconciliations: queueResult.data.payment_reconciliations } : {}),
          ...(summaryResult?.success ? { summary: summaryResult.data } : {}),
        })
        if (queueResult?.success) {
          patchReconciliationControls({
            nextCursor: queueResult.data.next_cursor,
            total: {
              amount: Number.isFinite(queueResult.data.total_amount_vnd) ? queueResult.data.total_amount_vnd : null,
              count: Number.isFinite(queueResult.data.total_count) ? queueResult.data.total_count : null,
            },
          })
        }
      }
    } finally {
      if (requestId === loadRequestIdRef.current) {
        hasLoadedRef.current = true
        backgroundLoadInFlightRef.current = false
        patch({ loading: false })
      }
    }
  }, [activeView, canRead, canReconcile, copy.invalidRange, copy.loadError, debouncedReconciliationQuery, patch, period, reconciliationAssignment, reconciliationMethod])

  const loadMoreReconciliations = useCallback(async () => {
    if (!reconciliationNextCursor || backgroundLoadInFlightRef.current) return
    backgroundLoadInFlightRef.current = true
    const requestId = loadRequestIdRef.current + 1
    loadRequestIdRef.current = requestId
    const result = await adminControlService.listPaymentReconciliations({
      status: 'pending',
      limit: 25,
      cursor: reconciliationNextCursor,
      assignment: reconciliationAssignment,
      payment_method: reconciliationMethod,
      query: debouncedReconciliationQuery || undefined,
    })
    if (requestId === loadRequestIdRef.current && result.success) {
      patch({ reconciliations: [...reconciliations, ...result.data.payment_reconciliations] })
      patchReconciliationControls({ nextCursor: result.data.next_cursor })
    }
    if (requestId === loadRequestIdRef.current) backgroundLoadInFlightRef.current = false
  }, [debouncedReconciliationQuery, patch, reconciliationAssignment, reconciliationMethod, reconciliationNextCursor, reconciliations])

  const invalidatePendingLoad = useCallback(() => {
    loadRequestIdRef.current += 1
    backgroundLoadInFlightRef.current = false
  }, [])

  useEffect(() => {
    void load({ blocking: !hasLoadedRef.current })
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

  const loadReconciliationDetail = useCallback((item: AdminPaymentReconciliationSummary) => {
    const requestId = detailRequestIdRef.current + 1
    detailRequestIdRef.current = requestId
    patch({ detailError: null, detailLoading: true })
    return adminControlService.getPaymentReconciliation(item.id).then((result) => {
      if (requestId !== detailRequestIdRef.current) return
      if (result.success) {
        patch({
          actualAmount: result.data.received_amount_vnd === null ? String(result.data.expected_amount_vnd) : String(result.data.received_amount_vnd),
          detailLoading: false,
          selected: result.data.reconciliation,
          selectedDetail: result.data,
        })
      } else {
        patch({ detailError: copy.detailUnavailable, detailLoading: false })
      }
    })
  }, [copy.detailUnavailable, patch])

  const openReconciliation = useCallback((item: AdminPaymentReconciliationSummary) => {
    patch({
      actualAmount: item.amount_received === null ? String(item.gross_amount) : String(item.amount_received),
      assignmentReason: '',
      bankReference: '',
      detailError: null,
      reason: '',
      selected: item,
      selectedDetail: null,
    })
    void loadReconciliationDetail(item)
  }, [loadReconciliationDetail, patch])

  const submitReconciliation = useCallback(async (decision: AdminPaymentReconciliationDecisionInput['decision']) => {
    if (!selected?.assigned_to_me) return
    const isManual = selected.payment_method === 'platform_bank_manual'
    const parsedAmount = Number(actualAmount.replace(/[^0-9]/g, ''))
    if (isManual && (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0 || !bankReference.trim())) {
      patch({ error: copy.errorAction })
      return
    }
    if ((decision === 'reconcile_required' || decision === 'direct_release' || decision === 'cash_reject') && reason.trim().length < 3) {
      patch({ error: copy.errorAction })
      return
    }
    patch({ error: null, pendingAction: `${selected.id}:${decision}` })
    const input: AdminPaymentReconciliationDecisionInput = {
      client_request_id: generateClientRequestId(),
      decision,
      expected_version: selected.version,
      ...(isManual ? {
        amount_received: parsedAmount,
        bank_reference: bankReference.trim(),
        credited_at: new Date().toISOString(),
      } : {}),
      ...((decision === 'reconcile_required' || decision === 'direct_release' || decision === 'cash_reject') ? { reason: reason.trim() } : {}),
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

  const claimReconciliation = useCallback(async () => {
    if (!selected || (selected.assigned_to && actor?.access_level !== 'owner')) return
    if (selected.assigned_to && assignmentReason.trim().length < 3) {
      patch({ error: copy.errorAction })
      return
    }
    patch({ error: null, pendingAction: `${selected.id}:claim` })
    const result = await adminControlService.claimPaymentReconciliation(selected.id, {
      client_request_id: generateClientRequestId(),
      expected_version: selected.version,
      ...(selected.assigned_to ? { takeover_reason: assignmentReason.trim() } : {}),
    })
    if (result.success) {
      const reconciliation = { ...selected, assigned_at: result.data.assigned_at, assigned_to: result.data.assigned_to, assigned_to_me: true, version: result.data.version }
      patch({ selected: reconciliation, selectedDetail: selectedDetail ? { ...selectedDetail, reconciliation } : null })
    } else {
      patch({ error: copy.errorAction })
    }
    patch({ pendingAction: null })
  }, [actor?.access_level, assignmentReason, copy.errorAction, patch, selected, selectedDetail])

  const releaseReconciliation = useCallback(async () => {
    if (!selected?.assigned_to || (!selected.assigned_to_me && actor?.access_level !== 'owner')) return
    if (assignmentReason.trim().length < 3) {
      patch({ error: copy.errorAction })
      return
    }
    patch({ error: null, pendingAction: `${selected.id}:release` })
    const result = await adminControlService.releasePaymentReconciliation(selected.id, {
      client_request_id: generateClientRequestId(),
      expected_version: selected.version,
      reason: assignmentReason.trim(),
    })
    if (result.success) {
      patch({ notice: copy.updated, selected: null, selectedDetail: null })
      await load()
    } else {
      patch({ error: copy.errorAction })
    }
    patch({ pendingAction: null })
  }, [actor?.access_level, assignmentReason, copy.errorAction, copy.updated, load, patch, selected])

  const saveObservedBalance = useCallback(async () => {
    const balance = Number(observedBalance.replace(/[^0-9]/g, ''))
    if (!Number.isSafeInteger(balance) || balance < 0) {
      patch({ error: copy.errorAction })
      return
    }
    patch({ error: null, pendingAction: 'snapshot' })
    const result = await adminControlService.recordFinanceBalanceSnapshot({
      balance_vnd: balance,
      client_request_id: generateClientRequestId(),
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

  return {
    activeView,
    actor,
    actualAmount,
    assignmentReason,
    bankReference,
    canApproveTax,
    canManageTax,
    canRead,
    canReconcile,
    claimReconciliation,
    commissionAccrued,
    copy,
    customEditorOpen,
    customFrom,
    customMode,
    customTo,
    detailError,
    detailLoading,
    detailRequestIdRef,
    effectiveCommissionRateBps,
    error,
    formatCount,
    formatCurrency,
    formatDate,
    formatPercent,
    formatUsd,
    language,
    load,
    loading,
    loadMoreReconciliations,
    loadReconciliationDetail,
    metricCardStyle,
    metricValue,
    notice,
    observedBalance,
    openReconciliation,
    overview,
    patch,
    patchReconciliationControls,
    paymentBreakdown,
    pendingAction,
    period,
    range,
    reconciliationAssignment,
    reconciliationMethod,
    reconciliationNextCursor,
    reconciliationQuery,
    reconciliations,
    reconciliationTotal,
    reduceMotion,
    refreshTaxPolicies,
    releaseReconciliation,
    reason,
    saveObservedBalance,
    selected,
    selectedDetail,
    serviceBreakdown,
    submitReconciliation,
    summary,
    taxRefreshKey,
    trendPoints,
  }
}

export function AdminFinancePanel(props: AdminFinancePanelProps) {
  return <FinancePanelBody controller={useAdminFinanceController(props)} />
}

function FinancePanelBody({ controller }: { controller: ReturnType<typeof useAdminFinanceController> }) {
  const {
    activeView, actor, actualAmount, assignmentReason, bankReference, canApproveTax, canManageTax,
    canRead, canReconcile, claimReconciliation, commissionAccrued, copy, customEditorOpen,
    customFrom, customMode, customTo, detailError, detailLoading, detailRequestIdRef,
    effectiveCommissionRateBps, error, formatCount, formatCurrency, formatDate, formatPercent,
    formatUsd, language, load, loading, loadMoreReconciliations, loadReconciliationDetail,
    metricCardStyle, metricValue, notice, observedBalance, openReconciliation, overview, patch,
    patchReconciliationControls, paymentBreakdown, pendingAction, period, range,
    reconciliationAssignment, reconciliationMethod, reconciliationNextCursor, reconciliationQuery,
    reconciliations, reconciliationTotal, reduceMotion, refreshTaxPolicies, releaseReconciliation,
    reason, saveObservedBalance, selected, selectedDetail, serviceBreakdown, submitReconciliation,
    summary, taxRefreshKey, trendPoints,
  } = controller

  if (!canRead) {
    return <View style={styles.accessCard} testID="admin-finance-no-access"><AdminText textRole="subheadline" style={styles.accessText}>{copy.noAccess}</AdminText></View>
  }

  return <View style={styles.stack} testID="admin-finance-panel">
    <View style={styles.header}>
      <AdminText textRole="headline" style={styles.title}>{copy.title}</AdminText>
      <AdminText textRole="headline" style={styles.subtitle}>{copy.subtitle}</AdminText>
      {overview?.generated_at || summary?.generated_at ? <AdminText textRole="footnote" style={styles.generatedAt}>
        {copy.generatedAt}: {formatDate(overview?.generated_at ?? summary?.generated_at ?? null)}
      </AdminText> : null}
    </View>

    <FinanceControls
      copy={copy}
      customEditorOpen={customEditorOpen}
      customFrom={customFrom}
      customMode={customMode}
      customTo={customTo}
      language={language}
      onApplyCustom={() => customFinancePeriod(customFrom, customTo) ? patch({ customEditorOpen: false, customMode: true }) : patch({ error: copy.invalidRange })}
      onChangeCustomFrom={(customFrom) => patch({ customFrom })}
      onChangeCustomTo={(customTo) => patch({ customTo })}
      onRefresh={() => { refreshTaxPolicies(); void load() }}
      onSelectRange={(range) => patch({ customEditorOpen: false, customMode: false, range })}
      onToggleCustom={() => patch({ customEditorOpen: !customEditorOpen })}
      range={range}
    />

    {notice ? <View accessibilityLiveRegion={reduceMotion ? 'polite' : 'none'} style={styles.notice}><AdminText textRole="subheadline" style={styles.noticeText}>{notice}</AdminText><Pressable accessibilityRole="button" accessibilityLabel={copy.cancel} onPress={() => patch({ notice: null })}><AdminText textRole="headline" style={styles.dismiss}>×</AdminText></Pressable></View> : null}
    {error ? <View accessibilityRole="alert" style={styles.error}><AdminText textRole="subheadline" style={styles.errorText}>{error}</AdminText><Pressable accessibilityRole="button" accessibilityLabel={copy.load} onPress={() => { void load() }}><AdminText textRole="subheadline" style={styles.errorAction}>{copy.load}</AdminText></Pressable></View> : null}

    {loading ? <View style={styles.loading}><AdminText textRole="subheadline" style={styles.loadingText}>{copy.load}</AdminText></View> : activeView === 'overview' ? <View style={styles.viewStack} testID="admin-finance-view-overview">
      <AdminText textRole="title2" style={styles.sectionTitle}>{copy.resultsSection}</AdminText>
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
      <AdminText textRole="title2" style={styles.sectionTitle}>{copy.commissionSection}</AdminText>
      <FinanceMetricGrid cardStyle={metricCardStyle} items={[
        financePendingMetricItem('overview-commission-accrued', copy.commissionAccrued, commissionAccrued, formatCurrency, copy),
        financePendingMetricItem('overview-commission-collected', copy.commissionCollected, metricValue(overview?.metrics.commission_collected_vnd, summary?.commission_collected), formatCurrency, copy),
        financePendingMetricItem('overview-commission-receivable', copy.commissionReceivable, metricValue(overview?.metrics.commission_receivable_vnd, summary?.commission_receivable), formatCurrency, copy),
        financePendingMetricItem('overview-commission-rate', copy.commissionRate, effectiveCommissionRateBps, formatPercent, copy),
      ]} />
      {period ? <FinanceTransactionsPanel formatCurrency={formatCurrency} language={language} period={period} /> : null}
    </View> : activeView === 'cash' ? <FinanceCashView
      canReconcile={canReconcile}
      copy={copy}
      formatCount={formatCount}
      formatCurrency={formatCurrency}
      formatDate={formatDate}
      metricCardStyle={metricCardStyle}
      observedBalance={observedBalance}
      onChangeAssignment={(assignment) => patchReconciliationControls({ assignment })}
      onChangeMethod={(method) => patchReconciliationControls({ method })}
      onChangeQuery={(query) => patchReconciliationControls({ query })}
      onChangeObservedBalance={(observedBalance) => patch({ observedBalance })}
      onLoadMore={() => { void loadMoreReconciliations() }}
      onOpenReconciliation={openReconciliation}
      onSaveObservedBalance={() => { void saveObservedBalance() }}
      overview={overview}
      pendingAction={pendingAction}
      reconciliationAssignment={reconciliationAssignment}
      reconciliationMethod={reconciliationMethod}
      reconciliationNextCursor={reconciliationNextCursor}
      reconciliationQuery={reconciliationQuery}
      reconciliationTotal={reconciliationTotal}
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
        : <View style={styles.emptyCard}><AdminText textRole="title2" style={styles.sectionTitle}>{copy.taxStatus}</AdminText></View>}
      {period ? <FinanceTaxReportsPanel canApproveTax={canApproveTax} canManageTax={canManageTax} language={language} period={period} reduceMotion={reduceMotion} refreshKey={taxRefreshKey} /> : null}
    </View>}

    {canReconcile && activeView === 'cash' && selected ? <ReconciliationModal
      actualAmount={actualAmount}
      assignmentReason={assignmentReason}
      bankReference={bankReference}
      canTakeover={actor?.access_level === 'owner'}
      copy={copy}
      detail={selectedDetail}
      detailError={detailError}
      detailLoading={detailLoading}
      formatCurrency={formatCurrency}
      formatDate={formatDate}
      onChangeActualAmount={(actualAmount) => patch({ actualAmount })}
      onChangeAssignmentReason={(assignmentReason) => patch({ assignmentReason })}
      onChangeBankReference={(bankReference) => patch({ bankReference })}
      onChangeReason={(reason) => patch({ reason })}
      onClaim={() => { void claimReconciliation() }}
      onClose={() => { detailRequestIdRef.current += 1; patch({ detailError: null, detailLoading: false, selected: null, selectedDetail: null }) }}
      onRetry={() => { void loadReconciliationDetail(selected) }}
      onRelease={() => { void releaseReconciliation() }}
      onSubmit={(decision) => { void submitReconciliation(decision) }}
      pending={Boolean(pendingAction)}
      reason={reason}
      selected={selected}
    /> : null}
  </View>
}
