import { SERVICE_TYPES, type AdminFinanceComparableMetric, type AdminFinanceOverviewResponse, type AdminFinanceServiceBreakdown, type ServiceType } from '@nestscout/shared'
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native'

import {
  getCustomerThemeTokens,
  getReducedTransparencyCustomerTokens,
  useCustomerThemeMode,
  type CustomerThemeTokens,
} from '@/components/customer/customer-theme'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { radius, spacing, typography } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'
import type {
  AdminViewOperationsResponse,
  AdminViewOverviewDetailKey,
  AdminViewOverviewDetailsResponse,
} from '@/lib/api-types/admin'
import { adminControlService } from '@/lib/services'

import { AdminOverviewDetailSheet, type AdminOverviewDetailSelection } from './admin-overview-detail-sheet'
import { AdminOverviewTrendPanel } from './admin-overview-trend-panel'
import type { AdminProductionCapabilityId } from './admin-sections-production-copy'
import type { AdminProductionSectionId } from './admin-sections-production-registry'
import { createFinanceFormatters } from './admin-finance-formatters'
import { AdminText } from './admin-text'

export type AdminOverviewRange = 'day' | 'week' | 'month'

export type AdminOverviewOpenTarget = {
  capabilityId: AdminProductionCapabilityId
  detailKey: AdminViewOverviewDetailKey
  section: AdminProductionSectionId
}

type AdminOverviewState = {
  finance: AdminFinanceOverviewResponse | null
  financeError: string | null
  financeLoading: boolean
  operations: AdminViewOperationsResponse | null
  operationsError: string | null
  operationsLoading: boolean
  range: AdminOverviewRange
}

type AdminOverviewDetailState = {
  detail: AdminViewOverviewDetailsResponse | null
  error: string | null
  loading: boolean
  permissionLimited: boolean
  selection: AdminOverviewDetailSelection | null
}

type AdminOverviewCopy = ReturnType<typeof overviewCopy>
type FinanceMetricKind = 'count' | 'currency'

const FLOW_GROUPS = [
  { id: 'coordination', statuses: ['draft', 'analyzing', 'estimate_ready', 'awaiting_customer_confirm', 'broadcasting', 'worker_candidate_pending'] },
  { id: 'assigned', statuses: ['worker_matched', 'worker_on_way', 'arrived'] },
  { id: 'inService', statuses: ['inspecting', 'repairing', 'scope_change_pending'] },
  { id: 'finishing', statuses: ['completed_by_worker', 'confirmed_by_customer', 'payment_pending'] },
] as const

const initialState: AdminOverviewState = {
  finance: null,
  financeError: null,
  financeLoading: true,
  operations: null,
  operationsError: null,
  operationsLoading: true,
  range: 'month',
}

const initialDetailState: AdminOverviewDetailState = {
  detail: null,
  error: null,
  loading: false,
  permissionLimited: false,
  selection: null,
}

function overviewCopy(language: AppLanguage) {
  if (language === 'en') {
    return {
      title: 'Overview',
      description: 'Financial results use the selected period. Operations and workers show the current snapshot.',
      ranges: { day: 'Today', week: 'This week', month: 'This month' },
      updating: 'Updating data…',
      financeTitle: 'Business results',
      periodScope: 'Selected period',
      currentScope: 'Current status',
      metrics: {
        gmv: 'Gross transaction value',
        paidJobs: 'Paid jobs',
        businessKept: 'Business kept before tax and costs',
        averageOrder: 'Average order value',
        netCashFlow: 'Net cash flow',
        commissionReceivable: 'Commission receivable',
      },
      dataQuality: { available: 'Recorded', partial: 'Partial data', unavailable: 'Not recorded' },
      previousUnavailable: 'No comparable prior period',
      versusPrevious: 'vs previous period',
      trendTitle: 'GMV and paid jobs trend',
      trendEmpty: 'No trend has been recorded for this period.',
      paidJobsShort: 'paid jobs',
      serviceTitle: 'Service performance',
      serviceColumns: { service: 'Service', gmv: 'GMV', jobs: 'Jobs', commission: 'Commission' },
      operationsTitle: 'Operations',
      activeJobs: 'active jobs',
      flowTitle: 'Workflow progress',
      openSummaryHint: 'Shows a read-only summary for this item.',
      flow: { coordination: 'Coordinating', assigned: 'Assigned / travelling', inService: 'In service', finishing: 'Finishing' },
      attention: {
        worker_applications: 'Worker applications',
        payment_attention: 'Payments',
        open_disputes: 'Open disputes',
        other_admin_queue: 'Other Admin queue',
      },
      workersTitle: 'Worker team',
      workerMetrics: { workers_in_verification: 'In verification', workers_suspended: 'Suspended' },
      financeError: 'Business results could not be loaded.',
      operationsError: 'The current operations snapshot could not be loaded.',
      detailError: 'Details could not be loaded.',
      retry: 'Try again',
      loadingFinance: 'Loading business results…',
      loadingOperations: 'Loading current operations…',
      unavailable: 'Not recorded',
      services: {
        electrical: 'Electrical repair', plumbing: 'Plumbing repair', cleaning: 'Home cleaning',
        hvac: 'Air conditioning and indoor air', upholstery: 'Sofa and fabric care', handyman: 'Minor repair and installation',
      },
    }
  }
  return {
    title: 'Tổng quan',
    description: 'Kết quả tài chính theo kỳ đã chọn. Vận hành và đội thợ dùng trạng thái hiện tại.',
    ranges: { day: 'Hôm nay', week: 'Tuần này', month: 'Tháng này' },
    updating: 'Đang cập nhật dữ liệu…',
    financeTitle: 'Kết quả kinh doanh',
    periodScope: 'Theo kỳ đã chọn',
    currentScope: 'Trạng thái hiện tại',
    metrics: {
      gmv: 'Tổng giá trị giao dịch',
      paidJobs: 'Công việc đã thanh toán',
      businessKept: 'Doanh nghiệp thực giữ trước thuế và chi phí',
      averageOrder: 'Giá trị đơn trung bình',
      netCashFlow: 'Dòng tiền ròng',
      commissionReceivable: 'Hoa hồng còn phải thu',
    },
    dataQuality: { available: 'Đã ghi nhận', partial: 'Dữ liệu một phần', unavailable: 'Chưa ghi nhận' },
    previousUnavailable: 'Chưa có kỳ so sánh',
    versusPrevious: 'so với kỳ trước',
    trendTitle: 'Xu hướng GMV và công việc đã thanh toán',
    trendEmpty: 'Chưa ghi nhận xu hướng trong kỳ này.',
    paidJobsShort: 'công việc đã thanh toán',
    serviceTitle: 'Hiệu quả dịch vụ',
    serviceColumns: { service: 'Dịch vụ', gmv: 'GMV', jobs: 'Đơn', commission: 'Hoa hồng' },
    operationsTitle: 'Vận hành',
    activeJobs: 'công việc đang hoạt động',
    flowTitle: 'Tiến trình công việc',
    openSummaryHint: 'Hiển thị tóm tắt chỉ đọc cho mục này.',
    flow: { coordination: 'Đang điều phối', assigned: 'Đã nhận / đang di chuyển', inService: 'Đang thực hiện', finishing: 'Đang hoàn tất' },
    attention: {
      worker_applications: 'Hồ sơ thợ',
      payment_attention: 'Thanh toán',
      open_disputes: 'Tranh chấp đang mở',
      other_admin_queue: 'Hàng chờ quản trị khác',
    },
    workersTitle: 'Đội thợ',
    workerMetrics: { workers_in_verification: 'Đang xác minh', workers_suspended: 'Đang tạm ngưng' },
    financeError: 'Không thể tải kết quả kinh doanh.',
    operationsError: 'Không thể tải trạng thái vận hành hiện tại.',
    detailError: 'Không thể tải dữ liệu chi tiết.',
    retry: 'Thử lại',
    loadingFinance: 'Đang tải kết quả kinh doanh…',
    loadingOperations: 'Đang tải trạng thái vận hành…',
    unavailable: 'Chưa ghi nhận',
    services: {
      electrical: 'Sửa điện', plumbing: 'Sửa nước', cleaning: 'Vệ sinh nhà',
      hvac: 'Điều hòa và không khí trong nhà', upholstery: 'Chăm sóc sofa và đồ vải', handyman: 'Sửa chữa nhỏ và lắp đặt',
    },
  }
}

function isMissingAdminSession(result: { success: boolean; status?: number; code?: string }) {
  return !result.success && (
    result.status === 401
    || result.code === 'AUTH_MISSING'
    || result.code === 'AUTH_REQUIRED'
  )
}

function canReadOverviewDetail(
  operations: AdminViewOperationsResponse | null,
  key: AdminViewOverviewDetailKey,
) {
  if (!operations) return false
  if (key === 'open_disputes') return operations.actor.access_level === 'owner'
  const capability = key === 'worker_applications' || key === 'workers_in_verification' || key === 'workers_suspended'
    ? 'workers.read'
    : key === 'payment_attention'
      ? 'transactions.read'
      : 'operations.read'
  return operations.actor.capabilities.includes(capability)
}

function overviewTarget(key: AdminViewOverviewDetailKey): AdminOverviewOpenTarget {
  if (key === 'worker_applications') return { capabilityId: 'workers-applications', detailKey: key, section: 'workers' }
  if (key === 'workers_in_verification') return { capabilityId: 'workers-profile-review', detailKey: key, section: 'workers' }
  if (key === 'workers_suspended') return { capabilityId: 'workers-access', detailKey: key, section: 'workers' }
  if (key === 'payment_attention') return { capabilityId: 'operations-service-transactions', detailKey: key, section: 'operations' }
  if (key === 'open_disputes') return { capabilityId: 'operations-disputes', detailKey: key, section: 'operations' }
  return { capabilityId: 'operations-job-monitor', detailKey: key, section: 'operations' }
}

export function AdminOverviewDashboard({ language, onOpenTarget, onSessionMissing }: {
  language: AppLanguage
  onOpenTarget?: (target: AdminOverviewOpenTarget) => void
  onSessionMissing: () => void
}) {
  const { width } = useWindowDimensions()
  const { reduceMotion, reduceTransparency } = useGlassAccessibility()
  const mode = useCustomerThemeMode()
  const tokens = useMemo(() => {
    const resolved = getCustomerThemeTokens(mode)
    return reduceTransparency ? getReducedTransparencyCustomerTokens(resolved) : resolved
  }, [mode, reduceTransparency])
  const copy = useMemo(() => overviewCopy(language), [language])
  const formatters = useMemo(() => createFinanceFormatters(language, copy.unavailable), [copy.unavailable, language])
  const [state, patch] = useReducer(
    (current: AdminOverviewState, next: Partial<AdminOverviewState>) => ({ ...current, ...next }),
    initialState,
  )
  const [detailState, patchDetail] = useReducer(
    (current: AdminOverviewDetailState, next: Partial<AdminOverviewDetailState>) => ({ ...current, ...next }),
    initialDetailState,
  )
  const detailCache = useMemo(() => new Map<AdminViewOverviewDetailKey, AdminViewOverviewDetailsResponse>(), [])
  const detailRequestIdRef = useRef(0)
  const detailKeyRef = useRef<AdminViewOverviewDetailKey | null>(null)
  const financeRequestIdRef = useRef(0)
  const operationsRequestIdRef = useRef(0)
  const rangeRef = useRef<AdminOverviewRange>('month')

  const loadFinance = useCallback(async (range: AdminOverviewRange) => {
    const requestId = financeRequestIdRef.current + 1
    financeRequestIdRef.current = requestId
    patch({ financeError: null, financeLoading: true })
    try {
      const result = await adminControlService.getFinanceOverview({ range })
      if (requestId === financeRequestIdRef.current) {
        if (isMissingAdminSession(result)) onSessionMissing()
        else patch(result.success
          ? { finance: result.data, financeError: null }
          : { financeError: copy.financeError })
      }
    } finally {
      if (requestId === financeRequestIdRef.current) patch({ financeLoading: false })
    }
  }, [copy.financeError, onSessionMissing])

  const loadOperations = useCallback(async () => {
    const requestId = operationsRequestIdRef.current + 1
    operationsRequestIdRef.current = requestId
    patch({ operationsError: null, operationsLoading: true })
    try {
      const result = await adminControlService.getOperations()
      if (requestId === operationsRequestIdRef.current) {
        if (isMissingAdminSession(result)) onSessionMissing()
        else patch(result.success
          ? { operations: result.data, operationsError: null }
          : { operationsError: copy.operationsError })
      }
    } finally {
      if (requestId === operationsRequestIdRef.current) patch({ operationsLoading: false })
    }
  }, [copy.operationsError, onSessionMissing])

  const invalidateRequests = useCallback(() => {
    financeRequestIdRef.current += 1
    operationsRequestIdRef.current += 1
    detailRequestIdRef.current += 1
    detailKeyRef.current = null
  }, [])

  useEffect(() => {
    void Promise.all([loadFinance(rangeRef.current), loadOperations()])
    return invalidateRequests
  }, [invalidateRequests, loadFinance, loadOperations])

  const selectRange = useCallback((range: AdminOverviewRange) => {
    if (range === rangeRef.current) return
    rangeRef.current = range
    patch({ range })
    void loadFinance(range)
  }, [loadFinance])

  const loadDetail = useCallback(async (key: AdminViewOverviewDetailKey, force = false) => {
    const cached = detailCache.get(key)
    if (cached && !force) {
      patchDetail({ detail: cached, error: null, loading: false })
      return
    }
    const requestId = detailRequestIdRef.current + 1
    detailRequestIdRef.current = requestId
    patchDetail({ detail: cached ?? null, error: null, loading: true })
    const result = await adminControlService.getOverviewDetails({ key, limit: 5 })
    if (requestId === detailRequestIdRef.current && detailKeyRef.current === key) {
      if (isMissingAdminSession(result)) onSessionMissing()
      else if (result.success) {
        detailCache.set(key, result.data)
        patchDetail({ detail: result.data, error: null, loading: false })
      } else if (result.status === 403) {
        patchDetail({ detail: null, loading: false, permissionLimited: true })
      } else {
        patchDetail({ error: copy.detailError, loading: false })
      }
    }
  }, [copy.detailError, detailCache, onSessionMissing])

  const openDetail = useCallback((selection: AdminOverviewDetailSelection) => {
    detailRequestIdRef.current += 1
    detailKeyRef.current = selection.key
    const permissionLimited = !canReadOverviewDetail(state.operations, selection.key)
    patchDetail({ error: null, permissionLimited, selection })
    if (permissionLimited) {
      patchDetail({ detail: null, loading: false })
      return
    }
    void loadDetail(selection.key)
  }, [loadDetail, state.operations])

  const closeDetail = useCallback(() => {
    detailRequestIdRef.current += 1
    detailKeyRef.current = null
    patchDetail(initialDetailState)
  }, [])

  const detailTarget = detailState.selection ? overviewTarget(detailState.selection.key) : null
  const canOpenTarget = Boolean(
    detailTarget
      && onOpenTarget
      && canReadOverviewDetail(state.operations, detailState.selection?.key ?? 'coordination'),
  )

  const compact = width < 600
  const expanded = width >= 840
  const kpiCardStyle = compact ? styles.kpiCardCompact : styles.kpiCardRegular
  const financeRefreshing = Boolean(state.finance && state.financeLoading)
  const operationsRefreshing = Boolean(state.operations && state.operationsLoading)

  return <View style={styles.root} testID="admin-production-section-overview">
    <View style={[styles.header, { borderBottomColor: tokens.border }]}>
      <View style={styles.headerCopy}>
        <AdminText accessibilityRole="header" textRole="title1" style={[styles.title, { color: tokens.text }]}>{copy.title}</AdminText>
        <AdminText textRole="subheadline" style={[styles.description, { color: tokens.muted }]}>{copy.description}</AdminText>
      </View>
      <View
        accessibilityRole="tablist"
        style={[styles.rangeControl, { backgroundColor: tokens.base, borderColor: tokens.borderStrong }]}
        testID="admin-overview-range-control"
      >
        {(['day', 'week', 'month'] as const).map((range, index) => {
          const selected = state.range === range
          return <Pressable
            accessibilityLabel={copy.ranges[range]}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={range}
            onPress={() => selectRange(range)}
            style={({ pressed }) => [
              styles.rangeOption,
              index > 0 && styles.rangeOptionDivider,
              {
                backgroundColor: tokens.base,
                borderLeftColor: tokens.border,
              },
              pressed && styles.controlPressed,
            ]}
            testID={`admin-overview-range-${range}`}
          >
            <AdminText
              textRole="subheadline"
              style={[
                styles.rangeOptionLabel,
                { color: selected ? tokens.primary : tokens.muted },
                selected && styles.rangeOptionLabelSelected,
              ]}
            >
              {copy.ranges[range]}
            </AdminText>
          </Pressable>
        })}
      </View>
      {financeRefreshing || operationsRefreshing ? <AdminText accessibilityLiveRegion="polite" textRole="footnote" style={[styles.updating, { color: tokens.primary }]}>{copy.updating}</AdminText> : null}
    </View>

    <SectionHeading scope={copy.periodScope} title={copy.financeTitle} tokens={tokens} />
    {state.financeError ? <ErrorBanner copy={copy} message={state.financeError} onRetry={() => { void loadFinance(rangeRef.current) }} testID="admin-overview-finance-error" tokens={tokens} /> : null}
    {!state.finance && state.financeLoading ? <RegionLoading label={copy.loadingFinance} tokens={tokens} /> : null}
    {state.finance ? <>
      <KpiGrid cardStyle={kpiCardStyle} copy={copy} finance={state.finance} formatCount={formatters.formatCount} formatCurrency={formatters.formatCurrency} tokens={tokens} />
      <View style={[styles.analysisGrid, expanded && styles.analysisGridExpanded]} testID="admin-overview-analysis-grid">
        <AdminOverviewTrendPanel
          copy={copy}
          expanded={expanded}
          finance={state.finance}
          formatCount={formatters.formatCount}
          formatCurrency={formatters.formatCurrency}
          key={`${state.finance.preset}-${state.finance.from}-${state.finance.to}`}
          language={language}
          range={state.finance.preset === 'day' || state.finance.preset === 'week' || state.finance.preset === 'month'
            ? state.finance.preset
            : state.range}
          tokens={tokens}
        />
        <ServicePerformance copy={copy} expanded={expanded} finance={state.finance} formatCount={formatters.formatCount} formatCurrency={formatters.formatCurrency} tokens={tokens} />
      </View>
    </> : null}

    <View style={[styles.currentGrid, !compact && styles.currentGridWide]} testID="admin-overview-current-grid">
      <View style={[styles.currentColumn, !compact && styles.currentColumnWide]}>
        <SectionHeading scope={copy.currentScope} title={copy.operationsTitle} tokens={tokens} />
        {state.operationsError ? <ErrorBanner copy={copy} message={state.operationsError} onRetry={() => { void loadOperations() }} testID="admin-overview-operations-error" tokens={tokens} /> : null}
        {!state.operations && state.operationsLoading ? <RegionLoading label={copy.loadingOperations} tokens={tokens} /> : null}
        {state.operations ? <OperationsPanel copy={copy} onSelectDetail={openDetail} operations={state.operations} tokens={tokens} /> : null}
      </View>
      <View style={[styles.currentColumn, !compact && styles.currentColumnWide]}>
        <SectionHeading scope={copy.currentScope} title={copy.workersTitle} tokens={tokens} />
        {state.operations ? <WorkerPanel copy={copy} onSelectDetail={openDetail} operations={state.operations} tokens={tokens} /> : null}
      </View>
    </View>
    <AdminOverviewDetailSheet
      detail={detailState.detail}
      error={detailState.error}
      generatedAt={state.operations?.generated_at ?? null}
      language={language}
      loading={detailState.loading}
      onClose={closeDetail}
      onRetry={() => { if (detailState.selection) void loadDetail(detailState.selection.key, true) }}
      onViewAll={canOpenTarget ? () => {
        const target = detailTarget
        closeDetail()
        if (target) onOpenTarget?.(target)
      } : undefined}
      permissionLimited={detailState.permissionLimited}
      reduceMotion={reduceMotion}
      selection={detailState.selection}
      tokens={tokens}
    />
  </View>
}

function SectionHeading({ scope, title, tokens }: { scope: string; title: string; tokens: CustomerThemeTokens }) {
  return <View style={styles.sectionHeading}>
    <AdminText accessibilityRole="header" textRole="title2" style={[styles.sectionTitle, { color: tokens.text }]}>{title}</AdminText>
    <AdminText textRole="caption1" style={[styles.scopeLabel, { color: tokens.muted }]}>{scope}</AdminText>
  </View>
}

function ErrorBanner({ copy, message, onRetry, testID, tokens }: { copy: AdminOverviewCopy; message: string; onRetry: () => void; testID: string; tokens: CustomerThemeTokens }) {
  return <View accessibilityRole="alert" style={[styles.errorBanner, { backgroundColor: tokens.base, borderColor: tokens.borderStrong }]} testID={testID}>
    <View style={styles.errorMessage}>
      <View style={[styles.errorIndicator, { backgroundColor: tokens.danger }]} testID={`${testID}-indicator`} />
      <AdminText textRole="footnote" style={[styles.errorText, { color: tokens.text }]}>{message}</AdminText>
    </View>
    <Pressable
      accessibilityLabel={`${copy.retry}: ${message}`}
      accessibilityRole="button"
      onPress={onRetry}
      style={({ pressed }) => [styles.retryAction, pressed && { backgroundColor: tokens.base }]}
      testID={`${testID}-retry`}
    >
      <AdminText textRole="headline" style={[styles.retryLabel, { color: tokens.primary }]}>{copy.retry}</AdminText>
    </Pressable>
  </View>
}

function RegionLoading({ label, tokens }: { label: string; tokens: CustomerThemeTokens }) {
  return <View accessibilityLiveRegion="polite" style={[styles.regionLoading, { borderColor: tokens.border }]}>
    <ActivityIndicator color={tokens.primary} />
    <AdminText textRole="subheadline" style={[styles.regionLoadingText, { color: tokens.muted }]}>{label}</AdminText>
  </View>
}

function KpiGrid({ cardStyle, copy, finance, formatCount, formatCurrency, tokens }: {
  cardStyle: StyleProp<ViewStyle>
  copy: AdminOverviewCopy
  finance: AdminFinanceOverviewResponse
  formatCount: (value: number | null | undefined) => string
  formatCurrency: (value: number | null) => string
  tokens: CustomerThemeTokens
}) {
  const items = [
    { id: 'gmv', kind: 'currency' as const, label: copy.metrics.gmv, metric: finance.metrics.gmv_vnd },
    { id: 'paid-jobs', kind: 'count' as const, label: copy.metrics.paidJobs, metric: finance.metrics.paid_jobs },
    { id: 'business-kept', kind: 'currency' as const, label: copy.metrics.businessKept, metric: finance.metrics.business_kept_vnd },
    { id: 'average-order', kind: 'currency' as const, label: copy.metrics.averageOrder, metric: finance.metrics.average_order_value_vnd },
    { id: 'net-cash-flow', kind: 'currency' as const, label: copy.metrics.netCashFlow, metric: finance.metrics.net_cash_flow_vnd },
    { id: 'commission-receivable', kind: 'currency' as const, label: copy.metrics.commissionReceivable, metric: finance.metrics.commission_receivable_vnd },
  ]
  return <View style={styles.kpiGrid} testID="admin-overview-kpis">
    {items.map((item) => <MetricCard cardStyle={cardStyle} copy={copy} formatCount={formatCount} formatCurrency={formatCurrency} key={item.id} {...item} tokens={tokens} />)}
  </View>
}

function MetricCard({ cardStyle, copy, formatCount, formatCurrency, id, kind, label, metric, tokens }: {
  cardStyle: StyleProp<ViewStyle>
  copy: AdminOverviewCopy
  formatCount: (value: number | null | undefined) => string
  formatCurrency: (value: number | null) => string
  id: string
  kind: FinanceMetricKind
  label: string
  metric: AdminFinanceComparableMetric
  tokens: CustomerThemeTokens
}) {
  const unavailable = metric.value === null || metric.data_quality === 'unavailable'
  const value = unavailable ? copy.unavailable : kind === 'currency' ? formatCurrency(metric.value) : formatCount(metric.value)
  const comparison = formatMetricComparison(metric, kind, copy, formatCount, formatCurrency)
  const quality = unavailable ? copy.dataQuality.unavailable : copy.dataQuality[metric.data_quality]
  return <View accessible accessibilityLabel={`${label}. ${value}. ${comparison}. ${quality}`} style={[styles.kpiCard, cardStyle, { backgroundColor: tokens.base, borderColor: tokens.border }]} testID={`admin-overview-kpi-${id}`}>
    <AdminText textRole="caption1" style={[styles.kpiLabel, { color: tokens.muted }]}>{label}</AdminText>
    <AdminText numeric textRole="title2" style={[styles.kpiValue, { color: tokens.text }]}>{value}</AdminText>
    <AdminText numeric textRole="footnote" style={[styles.kpiComparison, { color: tokens.muted }]}>{comparison}</AdminText>
    <View style={styles.qualityRow}>
      <View style={[styles.qualityDot, { backgroundColor: metric.data_quality === 'partial' ? tokens.copper : unavailable ? tokens.subtleText : tokens.primary }]} />
      <AdminText textRole="caption1" style={[styles.qualityText, { color: metric.data_quality === 'partial' ? tokens.copper : tokens.muted }]}>{quality}</AdminText>
    </View>
  </View>
}

function formatMetricComparison(
  metric: AdminFinanceComparableMetric,
  kind: FinanceMetricKind,
  copy: AdminOverviewCopy,
  formatCount: (value: number | null | undefined) => string,
  formatCurrency: (value: number | null) => string,
) {
  if (metric.change_value === null || metric.direction === 'unavailable') return copy.previousUnavailable
  const direction = metric.direction === 'up' ? '↑' : metric.direction === 'down' ? '↓' : '→'
  const change = kind === 'currency' ? formatCurrency(Math.abs(metric.change_value)) : formatCount(Math.abs(metric.change_value))
  const percent = metric.change_percent === null ? '' : ` · ${Math.abs(metric.change_percent).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`
  return `${direction} ${change}${percent} ${copy.versusPrevious}`
}

function ServicePerformance({ copy, expanded, finance, formatCount, formatCurrency, tokens }: {
  copy: AdminOverviewCopy
  expanded: boolean
  finance: AdminFinanceOverviewResponse
  formatCount: (value: number | null | undefined) => string
  formatCurrency: (value: number | null) => string
  tokens: CustomerThemeTokens
}) {
  const rows = serviceRows(finance.services)
  return <View style={[styles.panel, expanded && styles.analysisPanelExpanded, { backgroundColor: tokens.base, borderColor: tokens.border }]} testID="admin-overview-services">
    <AdminText accessibilityRole="header" textRole="headline" style={[styles.panelTitle, { color: tokens.text }]}>{copy.serviceTitle}</AdminText>
    {rows.map((row) => <View accessible accessibilityLabel={`${copy.services[row.service_type]}. ${copy.serviceColumns.gmv}: ${row.gmv_vnd === null ? copy.unavailable : formatCurrency(row.gmv_vnd)}. ${copy.serviceColumns.jobs}: ${row.paid_jobs === null ? copy.unavailable : formatCount(row.paid_jobs)}. ${copy.serviceColumns.commission}: ${row.commission_accrued_vnd === null ? copy.unavailable : formatCurrency(row.commission_accrued_vnd)}`} key={row.service_type} style={[styles.serviceRow, { borderTopColor: tokens.border }]}>
      <AdminText textRole="subheadline" style={[styles.serviceName, { color: tokens.text }]}>{copy.services[row.service_type]}</AdminText>
      <View style={styles.serviceMetrics}>
        <MetricPair label={copy.serviceColumns.gmv} tokens={tokens} value={row.gmv_vnd === null ? copy.unavailable : formatCurrency(row.gmv_vnd)} />
        <MetricPair label={copy.serviceColumns.jobs} tokens={tokens} value={row.paid_jobs === null ? copy.unavailable : formatCount(row.paid_jobs)} />
        <MetricPair label={copy.serviceColumns.commission} tokens={tokens} value={row.commission_accrued_vnd === null ? copy.unavailable : formatCurrency(row.commission_accrued_vnd)} />
      </View>
    </View>)}
  </View>
}

function serviceRows(source: AdminFinanceServiceBreakdown[]) {
  const byService = new Map(source.map((row) => [row.service_type, row]))
  return SERVICE_TYPES.map((serviceType) => {
    const row = byService.get(serviceType)
    return row && SERVICE_TYPES.includes(row.service_type as ServiceType)
      ? { ...row, service_type: serviceType }
      : { service_type: serviceType, gmv_vnd: null, commission_accrued_vnd: null, paid_jobs: null, data_quality: 'unavailable' as const, unavailable_reason: 'not_recorded' }
  }).sort((left, right) => {
    if (left.gmv_vnd === null && right.gmv_vnd === null) return 0
    if (left.gmv_vnd === null) return 1
    if (right.gmv_vnd === null) return -1
    return right.gmv_vnd - left.gmv_vnd
  })
}

function groupedOperationFlow(operations: AdminViewOperationsResponse) {
  const grouped = FLOW_GROUPS.map((group) => {
    const statuses = operations.flow.filter((item) => (group.statuses as readonly string[]).includes(item.status))
    return { id: group.id, count: statuses.reduce((sum, item) => sum + item.count, 0), statuses }
  })
  const knownStatuses = new Set<string>(FLOW_GROUPS.flatMap((group) => [...group.statuses]))
  const otherStatuses = operations.flow.filter((item) => !knownStatuses.has(item.status))
  const otherCount = otherStatuses.reduce((sum, item) => sum + item.count, 0)
  return { grouped, otherCount, otherStatuses }
}

function OperationsPanel({ copy, onSelectDetail, operations, tokens }: {
  copy: AdminOverviewCopy
  onSelectDetail: (selection: AdminOverviewDetailSelection) => void
  operations: AdminViewOperationsResponse
  tokens: CustomerThemeTokens
}) {
  const activeCount = operations.flow.reduce((sum, item) => sum + item.count, 0)
  const { grouped, otherCount } = groupedOperationFlow(operations)
  return <View style={[styles.panel, { backgroundColor: tokens.base, borderColor: tokens.border }]} testID="admin-overview-operations">
    <AdminText numeric textRole="title2" style={[styles.operationsTotal, { color: tokens.text }]}>{operations.flow.length === 0 ? copy.unavailable : activeCount} {operations.flow.length === 0 ? '' : copy.activeJobs}</AdminText>
    <AdminText textRole="caption1" style={[styles.subsectionTitle, { color: tokens.muted }]} testID="admin-overview-flow-heading">{copy.flowTitle}</AdminText>
    <View style={styles.snapshotMetrics} testID="admin-overview-operations-metrics">
      {grouped.map((group) => <SummaryRow
        accessibilityHint={copy.openSummaryHint}
        key={group.id}
        label={copy.flow[group.id]}
        onPress={() => onSelectDetail({ count: group.count, key: group.id, title: copy.flow[group.id] })}
        style={styles.snapshotMetric}
        testID={`admin-overview-operation-${group.id}`}
        tokens={tokens}
        value={String(group.count)}
      />)}
      {otherCount > 0 ? <SummaryRow
        accessibilityHint={copy.openSummaryHint}
        label={languageOther(copy)}
        onPress={() => onSelectDetail({ count: otherCount, key: 'other', title: languageOther(copy) })}
        style={styles.snapshotMetric}
        testID="admin-overview-operation-other"
        tokens={tokens}
        value={String(otherCount)}
      /> : null}
      {operations.attention.map((item) => <SummaryRow
        accessibilityHint={copy.openSummaryHint}
        key={item.key}
        label={copy.attention[item.key]}
        onPress={() => onSelectDetail({ count: item.count, key: item.key, title: copy.attention[item.key] })}
        style={styles.snapshotMetric}
        testID={`admin-overview-operation-${item.key}`}
        tokens={tokens}
        value={String(item.count)}
      />)}
    </View>
  </View>
}

function languageOther(copy: AdminOverviewCopy) {
  return copy.title === 'Overview' ? 'Other workflow states' : 'Trạng thái khác'
}

function WorkerPanel({ copy, onSelectDetail, operations, tokens }: {
  copy: AdminOverviewCopy
  onSelectDetail: (selection: AdminOverviewDetailSelection) => void
  operations: AdminViewOperationsResponse
  tokens: CustomerThemeTokens
}) {
  return <View style={[styles.panel, styles.workerPanel, { backgroundColor: tokens.base, borderColor: tokens.border }]} testID="admin-overview-workers">
    {(['workers_in_verification', 'workers_suspended'] as const).map((key, index) => {
      const metric = operations.quality.find((item) => item.key === key)
      const value = metric ? metric.count : null
      return <Pressable
        accessibilityHint={copy.openSummaryHint}
        accessibilityLabel={`${copy.workerMetrics[key]}. ${value === null ? copy.unavailable : value}`}
        accessibilityRole="button"
        key={key}
        onPress={() => onSelectDetail({ count: value, key, title: copy.workerMetrics[key] })}
        style={[styles.workerMetric, index > 0 && styles.workerMetricDivider, { borderTopColor: tokens.border }]}
        testID={`admin-overview-worker-${key}`}
      >
        <AdminText textRole="subheadline" style={[styles.workerMetricLabel, { color: tokens.muted }]}>{copy.workerMetrics[key]}</AdminText>
        <AdminText numeric textRole="headline" style={[styles.workerMetricValue, { color: tokens.text }]}>{metric ? metric.count : copy.unavailable}</AdminText>
      </Pressable>
    })}
  </View>
}

function MetricPair({ label, tokens, value }: { label: string; tokens: CustomerThemeTokens; value: string }) {
  return <View style={styles.metricPair}><AdminText textRole="caption1" style={[styles.metricPairLabel, { color: tokens.subtleText }]}>{label}</AdminText><AdminText numeric textRole="footnote" style={[styles.metricPairValue, { color: tokens.text }]}>{value}</AdminText></View>
}

function SummaryRow({ accessibilityHint, label, onPress, style, testID, tokens, value }: {
  accessibilityHint: string
  label: string
  onPress: () => void
  style?: StyleProp<ViewStyle>
  testID?: string
  tokens: CustomerThemeTokens
  value: string
}) {
  return <Pressable
    accessibilityHint={accessibilityHint}
    accessibilityLabel={`${label}. ${value}`}
    accessibilityRole="button"
    onPress={onPress}
    style={[styles.summaryRow, style, { borderTopColor: tokens.border }]}
    testID={testID}
  >
    <AdminText textRole="subheadline" style={[styles.summaryLabel, { color: tokens.text }]}>{label}</AdminText>
    <AdminText numeric textRole="headline" style={[styles.summaryValue, { color: tokens.text }]}>{value}</AdminText>
  </Pressable>
}

const styles = StyleSheet.create({
  analysisGrid: { gap: spacing.md },
  analysisGridExpanded: { alignItems: 'flex-start', flexDirection: 'row' },
  analysisPanelExpanded: { flex: 1 },
  currentColumn: { gap: spacing.sm, minWidth: 0 },
  currentColumnWide: { flex: 1 },
  currentGrid: { gap: spacing.xl },
  currentGridWide: { alignItems: 'flex-start', flexDirection: 'row' },
  description: { ...typography.subheadline, maxWidth: 720 },
  controlPressed: { opacity: 0.72 },
  errorBanner: { alignItems: 'center', borderRadius: radius.sm, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  errorIndicator: { borderRadius: radius.pill, height: 8, width: 8 },
  errorMessage: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.sm, minWidth: 200 },
  errorText: { ...typography.footnote, flex: 1 },
  header: { borderBottomWidth: StyleSheet.hairlineWidth, gap: spacing.md, paddingBottom: spacing.lg },
  headerCopy: { gap: spacing.xs },
  kpiCard: { borderRadius: radius.lg, borderWidth: 1, flexGrow: 1, gap: spacing.xs, padding: spacing.md },
  kpiCardCompact: { flexBasis: '46%', minWidth: 140 },
  kpiCardRegular: { flexBasis: '30%', minWidth: 190 },
  kpiComparison: { ...typography.footnote, minHeight: 36 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  kpiLabel: { ...typography.caption1, fontWeight: '600', minHeight: 32 },
  kpiValue: { ...typography.title2, fontWeight: '700' },
  metricPair: { flex: 1, gap: 2, minWidth: 72 },
  metricPairLabel: { ...typography.caption2 },
  metricPairValue: { ...typography.footnote, fontWeight: '600' },
  operationsTotal: { ...typography.title3, fontWeight: '700', paddingBottom: spacing.sm },
  panel: { borderRadius: radius.lg, borderWidth: 1, minWidth: 0, padding: spacing.md },
  panelTitle: { ...typography.headline, fontWeight: '700', paddingBottom: spacing.md },
  qualityDot: { borderRadius: radius.pill, height: 8, width: 8 },
  qualityRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, minHeight: 20 },
  qualityText: { ...typography.caption1, fontWeight: '600' },
  rangeControl: { alignSelf: 'flex-start', borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', maxWidth: 420, overflow: 'hidden', width: '100%' },
  rangeOption: { alignItems: 'center', flex: 1, justifyContent: 'center', minHeight: 44, minWidth: 0, paddingHorizontal: spacing.sm },
  rangeOptionDivider: { borderLeftWidth: StyleSheet.hairlineWidth },
  rangeOptionLabel: { ...typography.subheadline, textAlign: 'center' },
  rangeOptionLabelSelected: { fontWeight: '700' },
  regionLoading: { alignItems: 'center', borderRadius: radius.lg, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 72, padding: spacing.md },
  regionLoadingText: { ...typography.subheadline },
  retryAction: { alignItems: 'center', borderRadius: radius.sm, justifyContent: 'center', minHeight: 44, minWidth: 76, paddingHorizontal: spacing.sm },
  retryLabel: { ...typography.label, fontWeight: '700' },
  root: { gap: spacing.lg },
  scopeLabel: { ...typography.caption1, fontWeight: '600', textTransform: 'uppercase' },
  sectionHeading: { alignItems: 'baseline', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between' },
  sectionTitle: { ...typography.title2, fontWeight: '700' },
  serviceMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  serviceName: { ...typography.subheadline, fontWeight: '600' },
  serviceRow: { borderTopWidth: StyleSheet.hairlineWidth, gap: spacing.sm, paddingVertical: spacing.md },
  subsectionTitle: { ...typography.caption1, fontWeight: '700', marginBottom: spacing.md, textTransform: 'uppercase' },
  snapshotMetric: { minHeight: 56, paddingVertical: spacing.md },
  snapshotMetrics: { gap: spacing.xs },
  summaryLabel: { ...typography.subheadline, flex: 1 },
  summaryRow: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, minHeight: 44, paddingVertical: spacing.sm },
  summaryValue: { ...typography.headline, fontWeight: '700' },
  title: { ...typography.title1, fontWeight: '700' },
  updating: { ...typography.footnote, fontWeight: '600' },
  workerMetric: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between', minHeight: 48, paddingVertical: spacing.sm },
  workerMetricDivider: { borderTopWidth: StyleSheet.hairlineWidth },
  workerMetricLabel: { ...typography.subheadline, flex: 1 },
  workerMetricValue: { ...typography.headline, fontWeight: '700' },
  workerPanel: { paddingVertical: 0 },
})
