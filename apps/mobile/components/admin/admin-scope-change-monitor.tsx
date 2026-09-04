import { SCOPE_CHANGE_STATUSES, SERVICE_TYPES, type ScopeChangeStatus, type ServiceType } from '@nestscout/shared'
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { FlatList, Linking, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type ListRenderItemInfo } from 'react-native'

import { getCustomerThemeTokens, getReducedTransparencyCustomerTokens, useCustomerThemeMode } from '@/components/customer/customer-theme'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import { spacing } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'
import type {
  AdminViewEvidenceMetadata,
  AdminViewScopeChangeDetailResponse,
  AdminViewScopeChangeListInput,
  AdminViewScopeChangeSummary,
} from '@/lib/api-types/admin'
import { adminControlService } from '@/lib/services'

import { formatAdminDateTime, formatAdminNumber, formatAdminVnd } from './admin-intl'
import { AdminText } from './admin-text'
import {
  DetailField,
  DetailHeading,
  DetailSection,
  EvidenceRows,
  TimelineRows,
  WorkspaceEmpty,
  WorkspaceFeedback,
  WorkspaceFilterRow,
  WorkspaceMetrics,
  WorkspaceSearch,
} from './admin-operations-workspace-ui'

type ScopeFilters = {
  query: string
  requestedFrom: string
  requestedTo: string
  requestTiming: 'all' | 'pre_arrival' | 'on_site'
  service: 'all' | ServiceType
  status: 'all' | ScopeChangeStatus
}

type ScopeState = {
  actionError: string | null
  detail: AdminViewScopeChangeDetailResponse | null
  detailError: string | null
  detailLoading: boolean
  error: string | null
  generatedAt: string | null
  hasMore: boolean
  listLoading: boolean
  nextCursor: string | null
  records: AdminViewScopeChangeSummary[]
  refreshing: boolean
  selectedId: string | null
  counts: { kael_processing: number; waiting_customer: number; approved: number; rejected_or_cancelled: number }
}

const initialState: ScopeState = {
  actionError: null,
  counts: { approved: 0, kael_processing: 0, rejected_or_cancelled: 0, waiting_customer: 0 },
  detail: null,
  detailError: null,
  detailLoading: false,
  error: null,
  generatedAt: null,
  hasMore: false,
  listLoading: true,
  nextCursor: null,
  records: [],
  refreshing: false,
  selectedId: null,
}

function reducer(state: ScopeState, patch: Partial<ScopeState>) {
  return { ...state, ...patch }
}

export function AdminScopeChangeMonitor({ language, onSessionMissing }: {
  language: AppLanguage
  onSessionMissing: () => void
}) {
  const { width } = useWindowDimensions()
  const themeMode = useCustomerThemeMode()
  const { reduceTransparency } = useGlassAccessibility()
  const baseTokens = getCustomerThemeTokens(themeMode)
  const tokens = reduceTransparency ? getReducedTransparencyCustomerTokens(baseTokens) : baseTokens
  const copy = scopeCopy[language]
  const [state, patch] = useReducer(reducer, initialState)
  const [filters, setFilters] = useReducer((current: ScopeFilters, next: Partial<ScopeFilters>) => ({ ...current, ...next }), {
    query: '', requestedFrom: '', requestedTo: '', requestTiming: 'all', service: 'all', status: 'all',
  })
  const [debouncedQuery, setDebouncedQuery] = useReducer((_current: string, next: string) => next, '')
  const listRequestId = useRef(0)
  const detailRequestId = useRef(0)
  const failedEvidence = useRef<AdminViewEvidenceMetadata | null>(null)
  const stateRef = useRef(state)
  const listCache = useMemo(() => new Map<string, Omit<ScopeState, 'actionError' | 'detail' | 'detailError' | 'detailLoading' | 'selectedId'>>(), [])
  const detailCache = useMemo(() => new Map<string, AdminViewScopeChangeDetailResponse>(), [])
  const wide = width >= 768

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    const nextQuery = filters.query.trim()
    if (nextQuery === debouncedQuery) return
    const timer = setTimeout(() => setDebouncedQuery(nextQuery), 300)
    return () => clearTimeout(timer)
  }, [debouncedQuery, filters.query])

  const queryInput = useMemo<AdminViewScopeChangeListInput>(() => ({
    limit: 20,
    query: debouncedQuery || undefined,
    requested_from: toBoundary(filters.requestedFrom, false),
    requested_to: toBoundary(filters.requestedTo, true),
    request_timing: filters.requestTiming,
    service_type: filters.service,
    status: filters.status,
  }), [debouncedQuery, filters.requestedFrom, filters.requestedTo, filters.requestTiming, filters.service, filters.status])
  const queryKey = useMemo(() => JSON.stringify(queryInput), [queryInput])

  const loadList = useCallback(async ({ append = false, force = false }: { append?: boolean; force?: boolean } = {}) => {
    const cached = listCache.get(queryKey)
    if (!append && !force && cached) {
      patch({ ...cached, error: null, listLoading: false, refreshing: false })
      return
    }
    const requestId = ++listRequestId.current
    const current = stateRef.current
    patch({ error: null, ...(current.records.length === 0 ? { listLoading: true } : { refreshing: true }) })
    const result = await adminControlService.listScopeChanges({ ...queryInput, cursor: append ? current.nextCursor ?? undefined : undefined })
    if (requestId === listRequestId.current) {
      if (!result.success) {
        if (result.status === 401 || result.status === 403) onSessionMissing()
        patch({ error: result.error, listLoading: false, refreshing: false })
      } else {
        const nextRecords = append ? [...stateRef.current.records, ...result.data.records] : result.data.records
        const snapshot = {
          counts: result.data.counts,
          error: null,
          generatedAt: result.data.generated_at,
          hasMore: result.data.has_more,
          listLoading: false,
          nextCursor: result.data.next_cursor,
          records: nextRecords,
          refreshing: false,
        }
        if (!append) listCache.set(queryKey, snapshot)
        patch(snapshot)
      }
    }
  }, [listCache, onSessionMissing, queryInput, queryKey])

  const cancelListRequest = useCallback(() => {
    listRequestId.current += 1
  }, [])

  useEffect(() => {
    void loadList()
    return cancelListRequest
  }, [cancelListRequest, loadList])

  const selectRecord = useCallback(async (record: AdminViewScopeChangeSummary) => {
    failedEvidence.current = null
    patch({ actionError: null, detail: null, detailError: null, detailLoading: true, selectedId: record.scope_change_id })
    const cached = detailCache.get(record.scope_change_id)
    if (cached) {
      patch({ detail: cached, detailLoading: false })
      return
    }
    const requestId = ++detailRequestId.current
    const result = await adminControlService.getScopeChange(record.scope_change_id)
    if (requestId === detailRequestId.current) {
      if (!result.success) {
        if (result.status === 401 || result.status === 403) onSessionMissing()
        patch({ detailError: result.error, detailLoading: false })
      } else {
        detailCache.set(record.scope_change_id, result.data)
        patch({ detail: result.data, detailLoading: false })
      }
    }
  }, [detailCache, onSessionMissing])

  const openEvidence = useCallback(async (item: AdminViewEvidenceMetadata) => {
    if (!state.selectedId) return
    const result = await adminControlService.createScopeChangeEvidenceAccess(state.selectedId, { evidence_id: item.evidence_id })
    if (!result.success) {
      failedEvidence.current = item
      patch({ actionError: result.error })
      return
    }
    await Linking.openURL(result.data.signed_url).then(() => {
      failedEvidence.current = null
      patch({ actionError: null })
    }).catch(() => {
      failedEvidence.current = item
      patch({ actionError: copy.evidenceError })
    })
  }, [copy.evidenceError, state.selectedId])

  const closeDetail = () => {
    detailRequestId.current += 1
    failedEvidence.current = null
    patch({ actionError: null, detail: null, detailError: null, detailLoading: false, selectedId: null })
  }

  const renderScopeItem = useCallback(({ item }: ListRenderItemInfo<AdminViewScopeChangeSummary>) => <ScopeRow
    item={item}
    language={language}
    onPress={selectRecord}
    selected={state.selectedId === item.scope_change_id}
    tokens={tokens}
  />, [language, selectRecord, state.selectedId, tokens])

  const list = <FlatList
    contentContainerStyle={styles.listContent}
    data={state.records}
    keyExtractor={(item) => item.scope_change_id}
    keyboardShouldPersistTaps="handled"
    ListEmptyComponent={state.listLoading ? null : <WorkspaceEmpty label={copy.empty} tokens={tokens} />}
    ListFooterComponent={state.hasMore ? <KaelButton label={copy.loadMore} onPress={() => { void loadList({ append: true }) }} variant="secondary" /> : null}
    ListHeaderComponent={<View style={styles.listHeader}>
      <WorkspaceMetrics items={[
        { label: copy.metrics.kael, value: state.counts.kael_processing },
        { label: copy.metrics.customer, value: state.counts.waiting_customer },
        { label: copy.metrics.approved, value: state.counts.approved },
        { label: copy.metrics.closed, value: state.counts.rejected_or_cancelled },
      ]} tokens={tokens} />
      <WorkspaceSearch label={copy.search} onChange={(query) => setFilters({ query })} onRefresh={() => { listCache.delete(queryKey); void loadList({ force: true }) }} refreshLabel={copy.refresh} refreshing={state.refreshing} tokens={tokens} value={filters.query} />
      <WorkspaceFilterRow label={copy.filters.status} onSelect={(status) => setFilters({ status })} options={statusOptions(language)} selected={filters.status} tokens={tokens} />
      <WorkspaceFilterRow label={copy.filters.service} onSelect={(service) => setFilters({ service })} options={serviceOptions(language)} selected={filters.service} tokens={tokens} />
      <WorkspaceFilterRow label={copy.filters.timing} onSelect={(requestTiming) => setFilters({ requestTiming })} options={timingOptions(language)} selected={filters.requestTiming} tokens={tokens} />
      <View style={styles.dateRow}>
        <KaelTextField accessibilityLabel={copy.filters.from} autoCapitalize="none" onChangeText={(requestedFrom) => setFilters({ requestedFrom })} placeholder={copy.filters.from} placeholderTextColor={tokens.subtleText} value={filters.requestedFrom} />
        <KaelTextField accessibilityLabel={copy.filters.to} autoCapitalize="none" onChangeText={(requestedTo) => setFilters({ requestedTo })} placeholder={copy.filters.to} placeholderTextColor={tokens.subtleText} value={filters.requestedTo} />
      </View>
      <WorkspaceFeedback compact error={state.error} loading={state.listLoading && state.records.length === 0} loadingLabel={copy.loading} onRetry={() => { void loadList({ force: true }) }} retryLabel={copy.retry} tokens={tokens} />
      {state.generatedAt ? <AdminText textRole="caption1" style={{ color: tokens.subtleText }}>{copy.generated}: {formatDate(state.generatedAt, language)}</AdminText> : null}
    </View>}
    renderItem={renderScopeItem}
    showsVerticalScrollIndicator={false}
    style={styles.list}
    testID="admin-scope-change-list"
  />

  const detail = <ScopeDetail
    actionError={state.actionError}
    detail={state.detail}
    error={state.detailError}
    language={language}
    loading={state.detailLoading}
    onBack={wide ? undefined : closeDetail}
    onOpenEvidence={openEvidence}
    onRetryAction={() => failedEvidence.current && void openEvidence(failedEvidence.current)}
    onRetry={() => {
      const record = state.records.find((item) => item.scope_change_id === state.selectedId)
      if (record) { detailCache.delete(record.scope_change_id); void selectRecord(record) }
    }}
    tokens={tokens}
  />

  if (!wide && state.selectedId) return <View style={styles.workspace}>{detail}</View>
  return <View style={[styles.workspace, wide && styles.masterDetail]}>
    <View style={[styles.listPane, wide && { borderRightColor: tokens.border }]}>{list}</View>
    {wide ? <View style={styles.detailPane}>{state.selectedId ? detail : <WorkspaceEmpty label={copy.select} tokens={tokens} />}</View> : null}
  </View>
}

function ScopeRow({ item, language, onPress, selected, tokens }: {
  item: AdminViewScopeChangeSummary
  language: AppLanguage
  onPress: (item: AdminViewScopeChangeSummary) => void
  selected: boolean
  tokens: ReturnType<typeof getCustomerThemeTokens>
}) {
  const copy = scopeCopy[language]
  return <Pressable
    accessibilityLabel={`${item.display_code}. ${scopeStatusLabel(item.status, language)}`}
    accessibilityRole="button"
    accessibilityState={{ selected }}
    onPress={() => { void onPress(item) }}
    style={({ pressed }) => [styles.row, { backgroundColor: selected ? tokens.ghost : 'transparent', borderBottomColor: tokens.border, opacity: pressed ? 0.7 : 1 }]}
  >
    <View style={styles.rowMain}>
      <AdminText textRole="headline" style={{ color: tokens.text }}>{item.display_code}</AdminText>
      <AdminText textRole="footnote" style={{ color: tokens.muted }}>{serviceLabel(item.service_type, language)} · {formatDate(item.updated_at, language)}</AdminText>
    </View>
    <View style={styles.rowMeta}>
      <AdminText textRole="caption1" style={{ color: tokens.primary, textAlign: 'right' }}>{scopeStatusLabel(item.status, language)}</AdminText>
      <AdminText numeric textRole="footnote" style={{ color: tokens.text, textAlign: 'right' }}>{formatDelta(item, language, copy.notRecorded)}</AdminText>
    </View>
  </Pressable>
}

function ScopeDetail({ actionError, detail, error, language, loading, onBack, onOpenEvidence, onRetry, onRetryAction, tokens }: {
  actionError: string | null
  detail: AdminViewScopeChangeDetailResponse | null
  error: string | null
  language: AppLanguage
  loading: boolean
  onBack?: () => void
  onOpenEvidence: (item: AdminViewEvidenceMetadata) => void
  onRetry: () => void
  onRetryAction: () => void
  tokens: ReturnType<typeof getCustomerThemeTokens>
}) {
  const copy = scopeCopy[language]
  if (loading || error || !detail) return <WorkspaceFeedback error={error} loading={loading} loadingLabel={copy.detailLoading} onRetry={onRetry} retryLabel={copy.retry} tokens={tokens} />
  return <ScrollView contentContainerStyle={styles.detailContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={styles.detailScroll}>
    <DetailHeading backLabel={copy.back} generatedAt={formatDate(detail.generated_at, language)} generatedLabel={copy.generated} onBack={onBack} title={detail.summary.display_code} tokens={tokens} />
    <WorkspaceFeedback compact error={actionError} loading={false} loadingLabel={copy.loading} onRetry={onRetryAction} retryLabel={copy.retry} tokens={tokens} />
    <DetailSection title={copy.sections.status} tokens={tokens}>
      <DetailField label={copy.fields.status} tokens={tokens} value={scopeStatusLabel(detail.summary.status, language)} />
      <DetailField label={copy.fields.service} tokens={tokens} value={serviceLabel(detail.summary.service_type, language)} />
      <DetailField label={copy.fields.updated} tokens={tokens} value={formatDate(detail.summary.updated_at, language)} />
    </DetailSection>
    <DetailSection title={copy.sections.scope} tokens={tokens}>
      <DetailField label={copy.fields.original} tokens={tokens} value={detail.original_scope.description ?? copy.notRecorded} />
      <DetailField label={copy.fields.proposed} tokens={tokens} value={detail.proposed_scope.description} />
      <DetailField label={copy.fields.reason} tokens={tokens} value={detail.proposed_scope.reason} />
    </DetailSection>
    <DetailSection title={copy.sections.pricing} tokens={tokens}>
      <DetailField label={copy.fields.originalPrice} numeric tokens={tokens} value={formatRange(detail.original_scope.price_min_vnd, detail.original_scope.price_max_vnd, language, copy.notRecorded)} />
      <DetailField label={copy.fields.kaelPrice} numeric tokens={tokens} value={formatRange(detail.pricing.kael_min_vnd, detail.pricing.kael_max_vnd, language, copy.notRecorded)} />
      <DetailField label={copy.fields.totalPrice} numeric tokens={tokens} value={formatRange(detail.pricing.total_min_vnd, detail.pricing.total_max_vnd, language, copy.notRecorded)} />
    </DetailSection>
    <DetailSection title={copy.sections.request} tokens={tokens}>
      <DetailField label={copy.fields.timing} tokens={tokens} value={timingLabel(detail.proposed_scope.request_timing, language)} />
      <DetailField label={copy.fields.requested} tokens={tokens} value={formatDate(detail.proposed_scope.requested_at, language)} />
      <DetailField label={copy.fields.decision} tokens={tokens} value={detail.proposed_scope.customer_decision_at ? formatDate(detail.proposed_scope.customer_decision_at, language) : copy.notRecorded} />
    </DetailSection>
    <DetailSection title={copy.sections.evidence} tokens={tokens}>
      {detail.evidence.length > 0 ? <EvidenceRows items={detail.evidence.map((item) => ({ ...item, captured_at: item.captured_at ? formatDate(item.captured_at, language) : null, label: language === 'vi' ? 'Bằng chứng đổi phạm vi' : 'Scope-change evidence' }))} onOpen={onOpenEvidence} openLabel={copy.open} tokens={tokens} /> : <AdminText textRole="subheadline" style={{ color: tokens.muted }}>{copy.noEvidence}</AdminText>}
    </DetailSection>
    <DetailSection title={copy.sections.timeline} tokens={tokens}>
      <TimelineRows items={detail.timeline.map((item) => ({ ...item, label: scopeTimelineLabel(item.key, language), occurred_at: formatDate(item.occurred_at, language) }))} tokens={tokens} />
    </DetailSection>
    <DetailSection title={copy.sections.receipt} tokens={tokens}>
      {detail.price_receipt ? <>
        <AdminText textRole="footnote" style={{ color: tokens.muted }}>{copy.receiptAvailable}</AdminText>
        <DetailField label={copy.fields.receiptSchema} tokens={tokens} value={safeReceiptText(detail.price_receipt.schema_version, copy.notRecorded)} />
        <DetailField label={copy.fields.receiptEvidence} numeric tokens={tokens} value={safeReceiptCount(detail.price_receipt.evidence_count, language, copy.notRecorded)} />
        <DetailField label={copy.fields.receiptGenerated} tokens={tokens} value={safeReceiptDate(detail.price_receipt.generated_at, language, copy.notRecorded)} />
      </> : <AdminText textRole="subheadline" style={{ color: tokens.muted }}>{copy.notRecorded}</AdminText>}
    </DetailSection>
    {detail.related_dispute ? <DetailSection title={copy.sections.dispute} tokens={tokens}>
      <DetailField label={copy.fields.caseId} tokens={tokens} value={detail.related_dispute.dispute_id} />
      <DetailField label={copy.fields.caseType} tokens={tokens} value={disputeTypeLabel(detail.related_dispute.dispute_type, language)} />
      <DetailField label={copy.fields.status} tokens={tokens} value={disputeStatusLabel(detail.related_dispute.status, language)} />
    </DetailSection> : null}
  </ScrollView>
}

function toBoundary(value: string, endOfDay: boolean) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  return `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+07:00`
}

function formatDate(value: string, language: AppLanguage) {
  return formatAdminDateTime(value, language, 'short')
}

function formatRange(min: number | null, max: number | null, language: AppLanguage, fallback: string) {
  if (min === null || max === null) return fallback
  return min === max ? formatAdminVnd(min, language) : `${formatAdminVnd(min, language)} – ${formatAdminVnd(max, language)}`
}

function formatDelta(item: AdminViewScopeChangeSummary, language: AppLanguage, fallback: string) {
  return formatRange(item.delta_min_vnd, item.delta_max_vnd, language, fallback)
}

function safeReceiptText(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function safeReceiptCount(value: unknown, language: AppLanguage, fallback: string) {
  return typeof value === 'number' && Number.isFinite(value)
    ? formatAdminNumber(value, language)
    : fallback
}

function safeReceiptDate(value: unknown, language: AppLanguage, fallback: string) {
  return typeof value === 'string' && value.trim() ? formatDate(value, language) : fallback
}

function serviceLabel(value: ServiceType, language: AppLanguage) {
  return serviceNames[language][value]
}

function scopeStatusLabel(value: ScopeChangeStatus, language: AppLanguage) {
  return scopeCopy[language].statuses[value]
}

function timingLabel(value: string, language: AppLanguage) {
  if (value === 'pre_arrival') return language === 'vi' ? 'Trước khi thợ đến' : 'Before arrival'
  if (value === 'on_site') return language === 'vi' ? 'Tại hiện trường' : 'On site'
  return value
}

function disputeStatusLabel(value: string, language: AppLanguage) {
  const labels: Record<string, readonly [string, string]> = {
    admin_decided: ['Đã ghi quyết định', 'Decision recorded'],
    admin_review: ['Admin đang rà soát', 'Admin review'],
    appealed: ['Đã đề nghị xem lại', 'Appealed'],
    awaiting_counter_party: ['Chờ phản hồi bên còn lại', 'Awaiting counterparty'],
    open: ['Đang mở', 'Open'],
  }
  return labels[value]?.[language === 'vi' ? 0 : 1] ?? (language === 'vi' ? 'Trạng thái đã ghi nhận' : 'Recorded status')
}

function disputeTypeLabel(value: string, language: AppLanguage) {
  const labels: Record<string, readonly [string, string]> = {
    abusive_behavior_customer: ['Hành vi không phù hợp từ khách', 'Customer conduct'],
    abusive_behavior_worker: ['Hành vi không phù hợp từ thợ', 'Worker conduct'],
    completion_rejected: ['Khách chưa chấp nhận hoàn tất', 'Completion rejected'],
    damage_claim: ['Yêu cầu rà soát thiệt hại', 'Damage claim'],
    other: ['Lý do khác', 'Other'],
    scope_disagreement_post_job: ['Bất đồng phạm vi sau công việc', 'Post-job scope disagreement'],
    unpaid_service: ['Dịch vụ chưa thanh toán', 'Unpaid service'],
  }
  return labels[value]?.[language === 'vi' ? 0 : 1] ?? (language === 'vi' ? 'Tranh chấp đã ghi nhận' : 'Recorded dispute')
}

function scopeTimelineLabel(key: string, language: AppLanguage) {
  const labels: Record<string, readonly [string, string]> = {
    customer_decision: ['Khách đã quyết định', 'Customer decision recorded'],
    job_created: ['Công việc được tạo', 'Job created'],
    scope_requested: ['Thợ yêu cầu đổi phạm vi', 'Scope change requested'],
    scope_updated: ['Yêu cầu đổi phạm vi được cập nhật', 'Scope change updated'],
    worker_matched: ['Đã ghép thợ', 'Worker matched'],
  }
  return labels[key]?.[language === 'vi' ? 0 : 1] ?? (language === 'vi' ? 'Sự kiện đổi phạm vi' : 'Scope-change event')
}

function statusOptions(language: AppLanguage) {
  return [{ label: scopeCopy[language].all, value: 'all' as const }, ...SCOPE_CHANGE_STATUSES.map((value) => ({ label: scopeStatusLabel(value, language), value }))]
}

function serviceOptions(language: AppLanguage) {
  return [{ label: scopeCopy[language].all, value: 'all' as const }, ...SERVICE_TYPES.map((value) => ({ label: serviceLabel(value, language), value }))]
}

function timingOptions(language: AppLanguage) {
  return [
    { label: scopeCopy[language].all, value: 'all' as const },
    { label: timingLabel('pre_arrival', language), value: 'pre_arrival' as const },
    { label: timingLabel('on_site', language), value: 'on_site' as const },
  ]
}

const serviceNames: Record<AppLanguage, Record<ServiceType, string>> = {
  vi: { cleaning: 'Vệ sinh nhà', electrical: 'Điện', handyman: 'Sửa chữa nhỏ', hvac: 'Điều hòa & không khí', plumbing: 'Nước', upholstery: 'Nội thất mềm' },
  en: { cleaning: 'Home cleaning', electrical: 'Electrical', handyman: 'Handyman', hvac: 'Air conditioning', plumbing: 'Plumbing', upholstery: 'Upholstery care' },
}

const scopeCopy = {
  vi: {
    all: 'Tất cả', back: 'Quay lại danh sách', detailLoading: 'Đang tải chi tiết đổi phạm vi…', empty: 'Không có yêu cầu đổi phạm vi phù hợp.', evidenceError: 'Không thể mở bằng chứng.', generated: 'Dữ liệu tạo lúc', loadMore: 'Tải thêm', loading: 'Đang tải đổi phạm vi…', noEvidence: 'Chưa có bằng chứng được ghi nhận.', notRecorded: 'Chưa ghi nhận', open: 'Mở', receiptAvailable: 'Đã có receipt xác minh giá trong hồ sơ.', refresh: 'Tải lại', retry: 'Thử lại', search: 'Tìm theo mã công việc', select: 'Chọn một yêu cầu để xem chi tiết.',
    filters: { from: 'Từ ngày YYYY-MM-DD', service: 'Dịch vụ', status: 'Trạng thái', timing: 'Thời điểm yêu cầu', to: 'Đến ngày YYYY-MM-DD' },
    metrics: { approved: 'Đã chấp thuận', closed: 'Từ chối / hủy', customer: 'Chờ khách', kael: 'Kael xử lý' },
    statuses: { approved_by_customer: 'Khách đã chấp thuận', cancelled: 'Đã hủy', rejected_by_customer: 'Khách đã từ chối', requested_by_worker: 'Thợ vừa yêu cầu', reviewing_by_kael: 'Kael đang rà soát', waiting_customer_decision: 'Chờ khách quyết định' },
    sections: { dispute: 'Tranh chấp liên quan', evidence: 'Bằng chứng', pricing: 'Giá và chênh lệch', receipt: 'Receipt xác minh giá', request: 'Yêu cầu và quyết định', scope: 'Phạm vi gốc và đề xuất', status: 'Trạng thái', timeline: 'Timeline công việc' },
    fields: { caseId: 'Mã ca', caseType: 'Loại tranh chấp', decision: 'Khách quyết định lúc', kaelPrice: 'Giá Kael tính lại', original: 'Phạm vi gốc', originalPrice: 'Giá gốc', proposed: 'Phạm vi đề xuất', reason: 'Lý do', receiptEvidence: 'Số evidence được đối chiếu', receiptGenerated: 'Tạo lúc', receiptSchema: 'Phiên bản receipt', requested: 'Yêu cầu lúc', service: 'Dịch vụ', status: 'Trạng thái', timing: 'Thời điểm', totalPrice: 'Tổng sau thay đổi', updated: 'Cập nhật' },
  },
  en: {
    all: 'All', back: 'Back to list', detailLoading: 'Loading scope-change detail…', empty: 'No scope change matches these filters.', evidenceError: 'Unable to open evidence.', generated: 'Generated', loadMore: 'Load more', loading: 'Loading scope changes…', noEvidence: 'No evidence is recorded.', notRecorded: 'Not recorded', open: 'Open', receiptAvailable: 'A price-verification receipt is recorded.', refresh: 'Refresh', retry: 'Retry', search: 'Search by job code', select: 'Select a request to review its details.',
    filters: { from: 'From YYYY-MM-DD', service: 'Service', status: 'Status', timing: 'Request timing', to: 'To YYYY-MM-DD' },
    metrics: { approved: 'Approved', closed: 'Rejected / cancelled', customer: 'Awaiting customer', kael: 'Kael processing' },
    statuses: { approved_by_customer: 'Customer approved', cancelled: 'Cancelled', rejected_by_customer: 'Customer rejected', requested_by_worker: 'Requested by worker', reviewing_by_kael: 'Kael reviewing', waiting_customer_decision: 'Awaiting customer decision' },
    sections: { dispute: 'Related dispute', evidence: 'Evidence', pricing: 'Pricing and difference', receipt: 'Price-verification receipt', request: 'Request and decision', scope: 'Original and proposed scope', status: 'Status', timeline: 'Job timeline' },
    fields: { caseId: 'Case ID', caseType: 'Dispute type', decision: 'Customer decision at', kaelPrice: 'Kael recalculation', original: 'Original scope', originalPrice: 'Original price', proposed: 'Proposed scope', reason: 'Reason', receiptEvidence: 'Evidence checked', receiptGenerated: 'Generated at', receiptSchema: 'Receipt version', requested: 'Requested at', service: 'Service', status: 'Status', timing: 'Timing', totalPrice: 'Total after change', updated: 'Updated' },
  },
} as const

const styles = StyleSheet.create({
  dateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  detailContent: { gap: spacing.xl, padding: spacing.lg, paddingBottom: spacing.xxxl },
  detailPane: { flex: 1, minWidth: 0 },
  detailScroll: { flex: 1 },
  list: { flex: 1 },
  listContent: { flexGrow: 1, paddingBottom: spacing.xl },
  listHeader: { gap: spacing.lg, padding: spacing.lg },
  listPane: { flex: 1, minWidth: 0 },
  masterDetail: { flexDirection: 'row' },
  row: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, minHeight: 76, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  rowMain: { flex: 1, gap: spacing.xs },
  rowMeta: { alignItems: 'flex-end', gap: spacing.xs, maxWidth: '46%' },
  workspace: { flex: 1, minHeight: 0, overflow: 'hidden' },
})
