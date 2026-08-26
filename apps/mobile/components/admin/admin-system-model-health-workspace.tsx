import { useCallback, useMemo, useState } from 'react'
import { FlatList, StyleSheet, useWindowDimensions, View, type ListRenderItemInfo } from 'react-native'

import { color, spacing } from '@/design/theme'
import type { AdminSystemModelHealthDetailResponse, AdminSystemModelHealthRecord, AdminSystemModelHealthResponse } from '@/lib/api-types/admin-system'
import type { AppLanguage } from '@/lib/app-language'
import { adminControlService } from '@/lib/services'

import { FinanceChoiceChip, FinanceSecondaryButton } from './admin-finance-controls'
import {
  AdminSystemDetailHeader,
  AdminSystemDetailScroll,
  AdminSystemDivider,
  AdminSystemField,
  AdminSystemMetric,
  AdminSystemRow,
  AdminSystemState,
  AdminSystemSummary,
  AdminSystemToolbar,
  AdminSystemWorkspaceLayout,
} from './admin-system-controls'
import { adminSystemStyles } from './admin-system-styles'
import { adminSystemFormatDate } from './admin-system-values'
import { AdminText } from './admin-text'
import { useAdminSystemDetail } from './use-admin-system-detail'
import { useAdminSystemResource } from './use-admin-system-resource'

type HealthView = 'overview' | 'incidents' | 'costs'
type CircuitFilter = 'all' | 'open' | 'closed'

export function AdminSystemModelHealthWorkspace({ language }: { language: AppLanguage }) {
  const labels = copy[language]
  const { width } = useWindowDimensions()
  const [query, setQuery] = useState('')
  const [view, setView] = useState<HealthView>('overview')
  const [circuit, setCircuit] = useState<CircuitFilter>('all')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const limit = view === 'costs' && width < 768 ? 5 : 20
  const fetchPage = useCallback(({ cursor, query: search }: { cursor?: string; query: string }) => adminControlService.listSystemModelHealth({ circuit, cursor, limit, query: search, view }), [circuit, limit, view])
  const list = useAdminSystemResource<AdminSystemModelHealthRecord, AdminSystemModelHealthResponse['summary'], AdminSystemModelHealthResponse>({ cacheKey: `system-model:${view}:${circuit}:${limit}`, errorMessage: labels.loadError, fetchPage, query })
  const detail = useAdminSystemDetail<AdminSystemModelHealthDetailResponse>({ cacheKey: 'system-model-detail', errorMessage: labels.detailError, fetchDetail: adminControlService.getSystemModelHealthDetail, id: selectedKey })
  const selectRecord = useCallback((id: string) => setSelectedKey(id), [])
  const renderRecord = useCallback(({ item }: ListRenderItemInfo<AdminSystemModelHealthRecord>) => <AdminSystemRow
    accessibilityLabel={`${item.provider}. ${item.model || labels.modelNotRecorded}. ${item.purpose}`}
    aside={rowAside(item, view, labels)}
    id={item.detail_key}
    meta={`${item.model || labels.modelNotRecorded} · ${purposeLabel(item.purpose, language)} · ${adminSystemFormatDate(item.updated_at, language)}`}
    onPress={selectRecord}
    selected={selectedKey === item.detail_key}
    title={item.provider}
  />, [labels, language, selectRecord, selectedKey, view])

  const summary = list.summary
  const inventory = list.response?.inventory ?? []
  const listNode = <FlatList
    contentContainerStyle={adminSystemStyles.listContent}
    data={list.records}
    keyExtractor={(item) => item.detail_key}
    ListEmptyComponent={list.loading ? <AdminSystemState label={labels.loading} loading /> : list.error ? <AdminSystemState actionLabel={labels.retry} label={list.error} onAction={list.retry} /> : <AdminSystemState compact label={view === 'costs' ? labels.noCosts : view === 'incidents' ? labels.noIncidents : labels.empty} />}
    ListFooterComponent={list.hasMore ? <View style={styles.loadMore}><FinanceSecondaryButton disabled={list.loadingMore} label={list.loadingMore ? labels.loadingMore : labels.loadMore} loading={list.loadingMore} onPress={list.loadMore} /></View> : null}
    ListHeaderComponent={<View style={styles.header}>
      <AdminSystemToolbar language={language} onChangeQuery={setQuery} onRefresh={list.refresh} query={query} refreshing={list.refreshing} searchPlaceholder={labels.searchPlaceholder} />
      <View style={adminSystemStyles.filterRow}>{(['overview', 'incidents', 'costs'] as const).map((value) => <FinanceChoiceChip key={value} label={labels.view[value]} onPress={() => { setSelectedKey(null); setView(value) }} selected={view === value} />)}</View>
      <AdminSystemSummary generatedAt={list.generatedAt} language={language} quality={list.dataQuality}>
        <AdminSystemMetric label={labels.configured} value={summary?.configured_count ?? labels.notRecorded} />
        <AdminSystemMetric label={labels.calls} value={summary?.call_count ?? labels.notRecorded} />
        <AdminSystemMetric label={labels.failures} value={summary?.failure_count ?? labels.notRecorded} />
        <AdminSystemMetric label={labels.fallbacks} value={summary?.fallback_count ?? labels.notRecorded} />
      </AdminSystemSummary>
      {view === 'overview' && inventory.length > 0 ? <View style={styles.inventory}><AdminText textRole="headline" style={styles.strong}>{labels.inventory}</AdminText>{inventory.map((item) => <AdminSystemField key={item.detail_key} label={`${item.provider} · ${item.model}`} value={purposeLabel(item.purpose, language)} />)}</View> : null}
      {view === 'incidents' ? <View style={styles.filterGroup}><AdminText textRole="caption1" style={styles.meta}>{labels.circuit}</AdminText><View style={adminSystemStyles.filterRow}>{(['all', 'open', 'closed'] as const).map((value) => <FinanceChoiceChip key={value} label={labels.circuitValue[value]} onPress={() => setCircuit(value)} selected={circuit === value} />)}</View></View> : null}
      {summary ? <View style={styles.inlineMeta}><AdminSystemField label={labels.openCircuits} numeric value={summary.open_circuit_count === null ? labels.notRecorded : String(summary.open_circuit_count)} /><AdminSystemField label={labels.totalCost} numeric value={summary.total_cost_usd === null ? labels.noCostRecorded : `${summary.total_cost_usd} USD`} /></View> : null}
      {list.error && list.records.length > 0 ? <AdminSystemState actionLabel={labels.retry} compact label={list.error} onAction={list.retry} /> : null}
    </View>}
    renderItem={renderRecord}
    showsVerticalScrollIndicator={false}
    style={adminSystemStyles.list}
    testID="admin-system-model-health-list"
  />
  const detailNode = useMemo(() => <ModelHealthDetail detail={detail} language={language} onBack={() => setSelectedKey(null)} />, [detail, language])
  return <AdminSystemWorkspaceLayout detail={detailNode} emptyDetailLabel={labels.chooseRecord} list={listNode} selected={Boolean(selectedKey)} />
}

function ModelHealthDetail({ detail, language, onBack }: {
  detail: ReturnType<typeof useAdminSystemDetail<AdminSystemModelHealthDetailResponse>>
  language: AppLanguage
  onBack: () => void
}) {
  const labels = copy[language]
  const record = detail.data?.record
  if (detail.loading && !record) return <AdminSystemState label={labels.loadingDetail} loading />
  if (detail.error && !record) return <AdminSystemState actionLabel={labels.retry} label={detail.error} onAction={detail.retry} />
  if (!record || !detail.data) return <AdminSystemState label={labels.chooseRecord} />
  return <AdminSystemDetailScroll>
    <AdminSystemDetailHeader language={language} onBack={onBack} subtitle={`${record.model || labels.modelNotRecorded} · ${purposeLabel(record.purpose, language)}`} title={record.provider} />
    <Section title={labels.usage}><AdminSystemField label={labels.bucket} value={record.bucket} /><AdminSystemField label={labels.calls} numeric value={metricValue(record.call_count, labels.notRecorded)} /><AdminSystemField label={labels.successes} numeric value={metricValue(record.success_count, labels.notRecorded)} /><AdminSystemField label={labels.failures} numeric value={metricValue(record.failure_count, labels.notRecorded)} /><AdminSystemField label={labels.fallbacks} numeric value={metricValue(record.fallback_count, labels.notRecorded)} /></Section>
    <Section title={labels.latency}><AdminSystemField label={labels.averageLatency} numeric value={latencyValue(record.avg_latency_ms, labels.notRecorded)} /><AdminSystemField label={labels.p95Latency} numeric value={latencyValue(record.p95_latency_ms, labels.notRecorded)} /></Section>
    <Section title={labels.circuitAndCost}><AdminSystemField label={labels.circuit} value={record.circuit_state === 'open' ? labels.circuitValue.open : record.circuit_state === 'closed' ? labels.circuitValue.closed : labels.notRecorded} /><AdminSystemField label={labels.totalCost} numeric value={record.total_cost_usd === null ? labels.noCostRecorded : `${record.total_cost_usd.toFixed(6)} USD`} /><AdminSystemField label={labels.failureKind} value={record.failure_kind || labels.notRecorded} /></Section>
    <Section title={labels.safeEvents}>{detail.data.history.length === 0 ? <AdminSystemState compact label={labels.noSafeEvents} /> : detail.data.history.map((entry) => <AdminSystemField key={safeEventKey(entry)} label={String(entry.code ?? entry.kind ?? labels.event)} value={adminSystemFormatDate(typeof entry.recorded_at === 'string' ? entry.recorded_at : typeof entry.updated_at === 'string' ? entry.updated_at : null, language)} />)}</Section>
    <AdminText textRole="footnote" style={styles.secondary}>{labels.readOnly}</AdminText>
    {detail.error ? <AdminSystemState actionLabel={labels.retry} compact label={detail.error} onAction={detail.retry} /> : null}
  </AdminSystemDetailScroll>
}

function Section({ children, title }: { children: React.ReactNode; title: string }) { return <View style={styles.section}><AdminText textRole="headline" style={styles.strong}>{title}</AdminText><AdminSystemDivider />{children}</View> }
function metricValue(value: number | null, unavailable: string) { return value === null ? unavailable : String(value) }
function latencyValue(value: number | null, unavailable: string) { return value === null ? unavailable : `${Math.round(value)} ms` }
function safeEventKey(entry: Record<string, unknown>) { return String(entry.event_id ?? entry.id ?? entry.recorded_at ?? entry.updated_at ?? JSON.stringify(entry)) }
function rowAside(record: AdminSystemModelHealthRecord, view: HealthView, labels: typeof copy.vi | typeof copy.en) { if (view === 'costs') return record.total_cost_usd === null ? labels.noCostRecorded : `${record.total_cost_usd.toFixed(6)} USD`; if (view === 'incidents') return record.failure_count === null ? labels.notRecorded : `${record.failure_count} ${labels.failures.toLocaleLowerCase()}`; return record.call_count === null ? labels.notRecorded : `${record.call_count} ${labels.calls.toLocaleLowerCase()}` }
function purposeLabel(value: string, language: AppLanguage) { const known: Record<string, readonly [string, string]> = { normal_chat: ['Trò chuyện thường', 'Normal chat'], price_synthesis: ['Tổng hợp giá', 'Price synthesis'], scope_change: ['Đổi phạm vi', 'Scope change'], worker_matching: ['Ghép thợ', 'Worker matching'] }; return known[value]?.[language === 'vi' ? 0 : 1] ?? value.replaceAll('_', ' ') }

const copy = {
  vi: {
    averageLatency: 'Độ trễ trung bình', bucket: 'Ngày dữ liệu', calls: 'Lượt gọi', chooseRecord: 'Chọn một dòng dữ liệu để xem số liệu và sự cố đã scrub.', circuit: 'Circuit', circuitAndCost: 'Circuit và chi phí', circuitValue: { all: 'Tất cả', open: 'Đang mở', closed: 'Đang đóng' }, configured: 'Model được cấu hình', detailError: 'Không thể tải chi tiết tình trạng mô hình.', empty: 'Chưa ghi nhận lượt gọi trong phạm vi này.', event: 'Sự kiện', failureKind: 'Loại lỗi', failures: 'Lỗi', fallbacks: 'Fallback', inventory: 'Model và provider được cấu hình', latency: 'Độ trễ', loadError: 'Không thể tải tình trạng mô hình.', loading: 'Đang tải tình trạng mô hình…', loadingDetail: 'Đang tải chi tiết mô hình…', loadingMore: 'Đang tải…', loadMore: 'Xem thêm', modelNotRecorded: 'Chưa ghi nhận model', noCostRecorded: 'Chưa ghi nhận chi phí', noCosts: 'Chưa ghi nhận chi phí trong kỳ này.', noIncidents: 'Không có lỗi, fallback hoặc circuit mở được ghi nhận trong kỳ.', noSafeEvents: 'Không có mã lỗi an toàn hoặc thay đổi circuit được ghi nhận.', notRecorded: 'Chưa ghi nhận', openCircuits: 'Circuit đang mở', p95Latency: 'Độ trễ p95', readOnly: 'Workspace này chỉ đọc và không gọi thử provider khi tải lại.', retry: 'Thử lại', safeEvents: 'Sự kiện an toàn', searchPlaceholder: 'Tìm provider, model hoặc mục đích', successes: 'Thành công', totalCost: 'Chi phí đã ghi nhận', usage: 'Lượt gọi', view: { overview: 'Tổng quan', incidents: 'Sự cố', costs: 'Chi phí' },
  },
  en: {
    averageLatency: 'Average latency', bucket: 'Data day', calls: 'Calls', chooseRecord: 'Select a data row to inspect scrubbed metrics and incidents.', circuit: 'Circuit', circuitAndCost: 'Circuit and cost', circuitValue: { all: 'All', open: 'Open', closed: 'Closed' }, configured: 'Configured models', detailError: 'Unable to load model health details.', empty: 'No calls are recorded for this scope.', event: 'Event', failureKind: 'Failure kind', failures: 'Failures', fallbacks: 'Fallbacks', inventory: 'Configured models and providers', latency: 'Latency', loadError: 'Unable to load model health.', loading: 'Loading model health…', loadingDetail: 'Loading model details…', loadingMore: 'Loading…', loadMore: 'Load more', modelNotRecorded: 'Model not recorded', noCostRecorded: 'Cost not recorded', noCosts: 'No costs are recorded for this period.', noIncidents: 'No errors, fallbacks, or open circuits are recorded for this period.', noSafeEvents: 'No safe error codes or circuit changes are recorded.', notRecorded: 'Not recorded', openCircuits: 'Open circuits', p95Latency: 'p95 latency', readOnly: 'This workspace is read-only and does not probe providers on refresh.', retry: 'Retry', safeEvents: 'Safe events', searchPlaceholder: 'Search provider, model, or purpose', successes: 'Successes', totalCost: 'Recorded cost', usage: 'Usage', view: { overview: 'Overview', incidents: 'Incidents', costs: 'Costs' },
  },
} as const

const styles = StyleSheet.create({
  filterGroup: { gap: spacing.sm },
  header: { gap: spacing.md, paddingBottom: spacing.md },
  inlineMeta: { gap: spacing.xs },
  inventory: { gap: spacing.sm },
  loadMore: { alignItems: 'center', paddingTop: spacing.md },
  meta: { color: color.text.muted, fontWeight: '600' },
  secondary: { color: color.text.secondary },
  section: { gap: spacing.sm },
  strong: { color: color.text.strong },
})
