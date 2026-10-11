import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { Pressable, useWindowDimensions, View, type ViewStyle } from 'react-native'

import type {
  AdminFinanceOverviewResponse,
  AdminFinancePeriodInput,
  AdminPaymentReconciliationDetailResponse,
  AdminPaymentReconciliationDecisionInput,
  AdminPaymentReconciliationSummary,
  AdminViewActor,
} from '@/lib/api-types/admin'
import { useAppLanguage } from '@/lib/app-language'
import { generateClientRequestId } from '@/lib/client-request-id'
import { adminControlService } from '@/lib/services'
import { useAdminSectionAutoRefresh } from '@/lib/admin-data-sync'
import { adminFinanceCopyByLanguage } from './admin-finance-copy'
import { FinanceControls } from './admin-finance-controls'
import { FinanceCashView } from './admin-finance-cash-view'
import { createFinanceFormatters } from './admin-finance-formatters'
import { reconciliationCopyByLanguage } from './admin-finance-reconciliation-copy'
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

type FinanceOverviewMetric = AdminFinanceOverviewResponse['metrics'][keyof AdminFinanceOverviewResponse['metrics']]
type AdminFinancePanelProps = {
  actor: AdminViewActor | null
  initialView?: string
  onFinanceUpdated?: () => void
  reduceMotion: boolean
  reduceTransparency: boolean
}

function waitForFinanceReadRetry(attempt: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, attempt === 0 ? 100 : 250))
}

async function retryFinanceRead<T extends { success: boolean }>(read: () => Promise<T>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      // Each retry depends on the prior response and the bounded backoff keeps reads from overlapping.
      // react-doctor-disable-next-line react-doctor/async-await-in-loop
      const result = await read()
      if (result.success || attempt === 2) return result
    } catch (error) {
      if (attempt === 2) throw error
    }
    if (attempt < 2) await waitForFinanceReadRetry(attempt)
  }
  throw new Error('Finance read retry exhausted unexpectedly')
}
function useAdminFinanceController({
  actor,
  initialView,
  onFinanceUpdated,
  reduceMotion,
}: AdminFinancePanelProps) {
  const { width } = useWindowDimensions()
  const language = useAppLanguage()
  const copy = { ...adminFinanceCopyByLanguage[language], ...reconciliationCopyByLanguage[language] }
  const canRead = actor?.capabilities.includes('finance.read') || actor?.capabilities.includes('finance.reconcile') || false
  const canReconcile = actor?.capabilities.includes('finance.reconcile') ?? false
  const canManageTax = actor?.capabilities.includes('finance.tax.manage') ?? false
  const canApproveTax = actor?.access_level === 'owner' && canManageTax
  const [state, dispatch] = useReducer(financeReducer, { ...initialFinanceState, activeView: normalizeFinanceView(initialView) })
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
  const queuedRefreshRef = useRef(false)
  const reconciliationDraftRef = useRef({ actualAmount: false, bankReference: false })
  const loadRef = useRef<((input?: { blocking?: boolean }) => Promise<void>) | null>(null)

  useEffect(() => {
    const timeout = setTimeout(() => patchReconciliationControls({ debouncedQuery: reconciliationQuery.trim() }), 300)
    return () => clearTimeout(timeout)
  }, [reconciliationQuery])
  const patch = useCallback((value: Partial<FinanceState>) => {
    dispatch({ type: 'patch', value })
  }, [])
  const changeActualAmount = useCallback((actualAmount: string) => {
    reconciliationDraftRef.current.actualAmount = true
    patch({ actualAmount, decisionError: null })
  }, [patch])
  const changeBankReference = useCallback((bankReference: string) => {
    reconciliationDraftRef.current.bankReference = true
    patch({ bankReference, decisionError: null })
  }, [patch])
  const {
    activeView,
    actualAmount,
    assignmentReason,
    bankReference,
    customEditorOpen,
    customFrom,
    customMode,
    customTo,
    decisionError,
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
    if (!shouldBlock && backgroundLoadInFlightRef.current) {
      queuedRefreshRef.current = true
      return
    }
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
    patch({ ...(shouldBlock ? { loading: true } : {}) })
    try {
      const [summaryResult, overviewResult, queueResult] = await Promise.all([
        period.range ? retryFinanceRead(() => adminControlService.getFinanceSummary({ range: period.range!, anchor: period.anchor })) : Promise.resolve(null),
        retryFinanceRead(() => adminControlService.getFinanceOverview(period)),
        canReconcile && activeView === 'cash'
          ? retryFinanceRead(() => adminControlService.listPaymentReconciliations({
            status: 'pending',
            limit: 25,
            assignment: reconciliationAssignment,
            payment_method: reconciliationMethod,
            query: debouncedReconciliationQuery || undefined,
          }))
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
    } catch {
      if (requestId === loadRequestIdRef.current) patch({ error: copy.loadError })
    } finally {
      if (requestId === loadRequestIdRef.current) {
        hasLoadedRef.current = true
        backgroundLoadInFlightRef.current = false
        patch({ loading: false })
        if (queuedRefreshRef.current) {
          queuedRefreshRef.current = false
          void Promise.resolve().then(() => loadRef.current?.({ blocking: false }))
        }
      }
    }
  }, [activeView, canRead, canReconcile, copy.invalidRange, copy.loadError, debouncedReconciliationQuery, patch, period, reconciliationAssignment, reconciliationMethod])
  loadRef.current = load

  const loadMoreReconciliations = useCallback(async () => {
    if (!reconciliationNextCursor || backgroundLoadInFlightRef.current) return
    backgroundLoadInFlightRef.current = true
    const requestId = loadRequestIdRef.current + 1
    loadRequestIdRef.current = requestId
    try {
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
      } else if (requestId === loadRequestIdRef.current) {
        patch({ error: copy.loadError })
      }
    } catch {
      if (requestId === loadRequestIdRef.current) patch({ error: copy.loadError })
    } finally {
      if (requestId === loadRequestIdRef.current) backgroundLoadInFlightRef.current = false
    }
  }, [copy.loadError, debouncedReconciliationQuery, patch, reconciliationAssignment, reconciliationMethod, reconciliationNextCursor, reconciliations])

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

  const loadReconciliationDetail = useCallback(async (item: AdminPaymentReconciliationSummary) => {
    const requestId = detailRequestIdRef.current + 1
    detailRequestIdRef.current = requestId
    patch({ detailLoading: true })
    let detail: AdminPaymentReconciliationDetailResponse | null = null
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        // Transfer content is response-dependent, and the request guard must fence every completion.
        // react-doctor-disable-next-line react-doctor/async-defer-await, react-doctor/async-await-in-loop
        const result = await adminControlService.getPaymentReconciliation(item.id)
        if (requestId !== detailRequestIdRef.current) return
        if (result.success) {
          detail = result.data
          if (item.payment_method !== 'platform_bank_manual' || detail.transfer_content) break
        }
      } catch {
        if (requestId !== detailRequestIdRef.current) return
      }
      if (attempt < 2) await waitForFinanceReadRetry(attempt)
    }
    if (requestId !== detailRequestIdRef.current) return
    if (detail) {
      const transferContentMissing = item.payment_method === 'platform_bank_manual' && !detail.transfer_content
      patch({
        ...(reconciliationDraftRef.current.actualAmount ? {} : { actualAmount: detail.received_amount_vnd === null ? '' : String(detail.received_amount_vnd) }),
        ...(reconciliationDraftRef.current.bankReference ? {} : { bankReference: '' }),
        detailError: transferContentMissing ? copy.transferContentUnavailable : null,
        detailLoading: false,
        selected: detail.reconciliation,
        selectedDetail: detail,
      })
    } else {
      patch({ detailError: copy.detailUnavailable, detailLoading: false })
    }
  }, [copy.detailUnavailable, copy.transferContentUnavailable, patch])

  const refreshFinance = useCallback(async () => {
    await load({ blocking: false })
    if (selected) await loadReconciliationDetail(selected)
  }, [load, loadReconciliationDetail, selected])
  useAdminSectionAutoRefresh('finance', refreshFinance, Boolean(error || detailError), refreshFinance)

  const openReconciliation = useCallback((item: AdminPaymentReconciliationSummary) => {
    reconciliationDraftRef.current = { actualAmount: false, bankReference: false }
    patch({
      actualAmount: item.amount_received === null ? '' : String(item.amount_received),
      assignmentReason: '',
      bankReference: '',
      decisionError: null,
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
    const normalizedBankReference = bankReference.trim()
    if (isManual && (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0)) {
      patch({ decisionError: copy.invalidActualAmount })
      return
    }
    if (isManual && !normalizedBankReference) {
      patch({ decisionError: copy.bankReferenceRequired })
      return
    }
    if ((decision === 'reconcile_required' || decision === 'direct_release' || decision === 'cash_reject') && reason.trim().length < 3) {
      patch({ decisionError: copy.errorAction })
      return
    }
    patch({ decisionError: null, error: null, pendingAction: `${selected.id}:${decision}` })
    const input: AdminPaymentReconciliationDecisionInput = {
      client_request_id: generateClientRequestId(),
      decision,
      expected_version: selected.version,
      ...(isManual ? {
        amount_received: parsedAmount,
        bank_reference: normalizedBankReference,
        credited_at: new Date().toISOString(),
      } : {}),
      ...((decision === 'reconcile_required' || decision === 'direct_release' || decision === 'cash_reject') ? { reason: reason.trim() } : {}),
    }
    const result = await adminControlService.decidePaymentReconciliation(selected.id, input)
    if (result.success) {
      patch({ decisionError: null, notice: copy.updated, selected: null })
      onFinanceUpdated?.()
      await load()
    } else {
      patch({ decisionError: copy.errorAction })
    }
    patch({ pendingAction: null })
  }, [actualAmount, bankReference, copy.bankReferenceRequired, copy.errorAction, copy.invalidActualAmount, copy.updated, load, onFinanceUpdated, patch, reason, selected])

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
    changeActualAmount,
    changeBankReference,
    claimReconciliation,
    commissionAccrued,
    copy,
    customEditorOpen,
    customFrom,
    customMode,
    customTo,
    decisionError,
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
    releaseReconciliation,
    reason,
    saveObservedBalance,
    selected,
    selectedDetail,
    serviceBreakdown,
    submitReconciliation,
    summary,
    trendPoints,
  }
}

export function AdminFinancePanel(props: AdminFinancePanelProps) {
  return <FinancePanelBody controller={useAdminFinanceController(props)} />
}

function FinancePanelBody({ controller }: { controller: ReturnType<typeof useAdminFinanceController> }) {
  const {
    activeView, actor, actualAmount, assignmentReason, bankReference, canApproveTax, canManageTax, changeActualAmount, changeBankReference,
    canRead, canReconcile, claimReconciliation, commissionAccrued, copy, customEditorOpen,
    customFrom, customMode, customTo, detailError, detailLoading, detailRequestIdRef,
    effectiveCommissionRateBps, error, formatCount, formatCurrency, formatDate, formatPercent,
    formatUsd, language, load, loading, loadMoreReconciliations, loadReconciliationDetail,
    metricCardStyle, metricValue, notice, observedBalance, openReconciliation, overview, patch,
    patchReconciliationControls, paymentBreakdown, pendingAction, period, range,
    reconciliationAssignment, reconciliationMethod, reconciliationNextCursor, reconciliationQuery,
    reconciliations, reconciliationTotal, reduceMotion, releaseReconciliation,
    decisionError, reason, saveObservedBalance, selected, selectedDetail, serviceBreakdown, submitReconciliation,
    summary, trendPoints,
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
      onSelectRange={(range) => patch({ customEditorOpen: false, customMode: false, range })}
      onToggleCustom={() => patch({ customEditorOpen: !customEditorOpen })}
      range={range}
    />

    {notice ? <View accessibilityLiveRegion={reduceMotion ? 'polite' : 'none'} style={styles.notice}><AdminText textRole="subheadline" style={styles.noticeText}>{notice}</AdminText><Pressable accessibilityRole="button" accessibilityLabel={copy.cancel} onPress={() => patch({ notice: null })}><AdminText textRole="headline" style={styles.dismiss}>×</AdminText></Pressable></View> : null}
    {error ? <View accessibilityRole="alert" style={styles.error}><AdminText textRole="subheadline" style={styles.errorText}>{error}</AdminText></View> : null}

    {loading ? <View style={styles.loading}><AdminText textRole="subheadline" style={styles.loadingText}>{copy.syncing}</AdminText></View> : activeView === 'overview' ? <View style={styles.viewStack} testID="admin-finance-view-overview">
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
      {period ? <FinanceTaxReportsPanel canApproveTax={canApproveTax} canManageTax={canManageTax} language={language} period={period} reduceMotion={reduceMotion} /> : null}
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
      decisionError={decisionError}
      formatCurrency={formatCurrency}
      formatDate={formatDate}
      onChangeActualAmount={changeActualAmount}
      onChangeAssignmentReason={(assignmentReason) => patch({ assignmentReason })}
      onChangeBankReference={changeBankReference}
      onChangeReason={(reason) => patch({ decisionError: null, reason })}
      onClaim={() => { void claimReconciliation() }}
      onClose={() => { detailRequestIdRef.current += 1; patch({ decisionError: null, detailError: null, detailLoading: false, selected: null, selectedDetail: null }) }}
      onRelease={() => { void releaseReconciliation() }}
      onSubmit={(decision) => { void submitReconciliation(decision) }}
      pending={Boolean(pendingAction)}
      reason={reason}
      selected={selected}
    /> : null}
  </View>
}
