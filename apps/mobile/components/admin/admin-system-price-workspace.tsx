import { SERVICE_TYPES, type ServiceType } from '@nestscout/shared'
import { useCallback, useMemo, useReducer, useRef } from 'react'
import { FlatList, StyleSheet, View, type ListRenderItemInfo } from 'react-native'

import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import { color, spacing } from '@/design/theme'
import type { AdminViewActor } from '@/lib/api-types/admin'
import type { AdminSystemEvidencePackage, AdminSystemPriceDetailResponse, AdminSystemPriceListResponse, AdminSystemPriceRecord, AdminSystemPriceValidationResponse, AdminSystemReceipt } from '@/lib/api-types/admin-system'
import type { AppLanguage } from '@/lib/app-language'
import { generateClientRequestId } from '@/lib/client-request-id'
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
import { adminSystemComplexityLabel, adminSystemFormatDate, adminSystemFormatVnd, adminSystemServiceLabel } from './admin-system-values'
import { AdminText } from './admin-text'
import { useAdminSystemDetail } from './use-admin-system-detail'
import { useAdminSystemResource } from './use-admin-system-resource'

type PriceStatus = 'all' | 'active' | 'superseded' | 'retired'
type PriceComplexity = 'all' | 'small' | 'medium' | 'large'
type PriceService = 'all' | ServiceType
type PriceStage = 'view' | 'publish' | 'retire' | 'review' | 'receipt'

type PriceListState = {
  complexity: PriceComplexity
  query: string
  selectedId: string | null
  service: PriceService
  status: PriceStatus
}

const initialPriceListState: PriceListState = {
  complexity: 'all', query: '', selectedId: null, service: 'all', status: 'all',
}

type PriceEditorState = {
  actionError: string | null
  packageId: string | null
  packages: AdminSystemEvidencePackage[]
  pending: boolean
  preview: AdminSystemPriceValidationResponse | null
  reason: string
  receipt: AdminSystemReceipt | null
  stage: PriceStage
}

const initialPriceEditorState: PriceEditorState = {
  actionError: null, packageId: null, packages: [], pending: false, preview: null, reason: '', receipt: null, stage: 'view',
}

export function AdminSystemPriceWorkspace({ actor, language }: { actor: AdminViewActor; language: AppLanguage }) {
  const labels = copy[language]
  const [state, patch] = useReducer((current: PriceListState, next: Partial<PriceListState>) => ({ ...current, ...next }), initialPriceListState)
  const fetchPage = useCallback(({ cursor, query: search }: { cursor?: string; query: string }) => adminControlService.listSystemPriceBaselines({ complexity: state.complexity, cursor, limit: 20, query: search, service_type: state.service, status: state.status }), [state.complexity, state.service, state.status])
  const list = useAdminSystemResource<AdminSystemPriceRecord, AdminSystemPriceListResponse['summary'], AdminSystemPriceListResponse>({ cacheKey: `system-price:${state.status}:${state.complexity}:${state.service}`, errorMessage: labels.loadError, fetchPage, query: state.query })
  const detail = useAdminSystemDetail<AdminSystemPriceDetailResponse>({ cacheKey: 'system-price-detail', errorMessage: labels.detailError, fetchDetail: adminControlService.getSystemPriceBaseline, id: state.selectedId })
  const selectPrice = useCallback((id: string) => patch({ selectedId: id }), [])
  const renderPrice = useCallback(({ item }: ListRenderItemInfo<AdminSystemPriceRecord>) => <AdminSystemRow
    accessibilityLabel={`${priceTitle(item, language)}. ${labels.statusValue[item.lifecycle]}`}
    aside={priceRange(item, language)}
    id={item.id}
    meta={`${adminSystemComplexityLabel(item.complexity, language)} · ${item.district_code} · ${labels.version} ${item.version}`}
    onPress={selectPrice}
    selected={state.selectedId === item.id}
    title={priceTitle(item, language)}
  />, [labels.statusValue, labels.version, language, selectPrice, state.selectedId])

  const listNode = <FlatList
    contentContainerStyle={adminSystemStyles.listContent}
    data={list.records}
    keyExtractor={(item) => item.id}
    ListEmptyComponent={list.loading ? <AdminSystemState label={labels.loading} loading /> : list.error ? <AdminSystemState actionLabel={labels.retry} label={list.error} onAction={list.retry} /> : <AdminSystemState compact label={labels.empty} />}
    ListFooterComponent={list.hasMore ? <View style={styles.loadMore}><FinanceSecondaryButton disabled={list.loadingMore} label={list.loadingMore ? labels.loadingMore : labels.loadMore} loading={list.loadingMore} onPress={list.loadMore} /></View> : null}
    ListHeaderComponent={<View style={styles.header}>
      <AdminSystemToolbar language={language} onChangeQuery={(query) => patch({ query })} onRefresh={list.refresh} query={state.query} refreshing={list.refreshing} searchPlaceholder={labels.searchPlaceholder} />
      <AdminSystemSummary generatedAt={list.generatedAt} language={language} quality={list.dataQuality}>
        <AdminSystemMetric label={labels.activeCount} value={list.summary?.active_count ?? null} />
        <AdminSystemMetric label={labels.quorumCount} value={list.summary?.quorum_count ?? null} />
        <AdminSystemMetric label={labels.inactiveCount} value={list.summary?.inactive_count ?? null} />
        <AdminSystemMetric label={labels.attentionCount} value={list.summary?.attention_count ?? null} />
      </AdminSystemSummary>
      <FilterGroup label={labels.service}><FinanceChoiceChip label={labels.all} onPress={() => patch({ service: 'all' })} selected={state.service === 'all'} />{SERVICE_TYPES.map((value) => <FinanceChoiceChip key={value} label={adminSystemServiceLabel(value, language)} onPress={() => patch({ service: value })} selected={state.service === value} />)}</FilterGroup>
      <FilterGroup label={labels.status}>{(['all', 'active', 'superseded', 'retired'] as const).map((value) => <FinanceChoiceChip key={value} label={labels.statusValue[value]} onPress={() => patch({ status: value })} selected={state.status === value} />)}</FilterGroup>
      <FilterGroup label={labels.complexity}>{(['all', 'small', 'medium', 'large'] as const).map((value) => <FinanceChoiceChip key={value} label={value === 'all' ? labels.all : adminSystemComplexityLabel(value, language)} onPress={() => patch({ complexity: value })} selected={state.complexity === value} />)}</FilterGroup>
      {list.error && list.records.length > 0 ? <AdminSystemState actionLabel={labels.retry} compact label={list.error} onAction={list.retry} /> : null}
    </View>}
    renderItem={renderPrice}
    showsVerticalScrollIndicator={false}
    style={adminSystemStyles.list}
    testID="admin-system-price-list"
  />

  const detailNode = useMemo(() => <PriceDetail actor={actor} detail={detail} language={language} onBack={() => patch({ selectedId: null })} />, [actor, detail, language])
  return <AdminSystemWorkspaceLayout detail={detailNode} emptyDetailLabel={labels.chooseRecord} list={listNode} selected={Boolean(state.selectedId)} />
}

function PriceDetail({ actor, detail, language, onBack }: {
  actor: AdminViewActor
  detail: ReturnType<typeof useAdminSystemDetail<AdminSystemPriceDetailResponse>>
  language: AppLanguage
  onBack: () => void
}) {
  const labels = copy[language]
  const [editor, patchEditor] = useReducer((current: PriceEditorState, next: Partial<PriceEditorState>) => ({ ...current, ...next }), initialPriceEditorState)
  const clientRequestIdRef = useRef<string | null>(null)
  const canManage = actor.capabilities.includes('system.manage')
  const response = detail.data
  const record = response?.record

  if (detail.loading && !record) return <AdminSystemState label={labels.loadingDetail} loading />
  if (detail.error && !record) return <AdminSystemState actionLabel={labels.retry} label={detail.error} onAction={detail.retry} />
  if (!record || !response) return <AdminSystemState label={labels.chooseRecord} />

  const reset = () => {
    clientRequestIdRef.current = null
    patchEditor(initialPriceEditorState)
  }
  const beginPublish = async () => {
    patchEditor({ actionError: null, pending: true })
    const result = await adminControlService.listSystemEvidencePackages({ limit: 20, problem_id: record.problem_id, service_type: record.service_type })
    if (!result.success) {
      patchEditor({ actionError: result.error || labels.packageError, pending: false })
      return
    }
    clientRequestIdRef.current = generateClientRequestId()
    patchEditor({ packages: result.data.records, pending: false, stage: 'publish' })
  }
  const reviewPublish = async () => {
    const clientRequestId = clientRequestIdRef.current
    if (!editor.packageId || !editor.reason.trim() || !clientRequestId) return
    patchEditor({ actionError: null, pending: true })
    const result = await adminControlService.validateSystemPriceBaseline({ baseline_id: record.id, client_request_id: clientRequestId, evidence_package_id: editor.packageId, expected_version: response.version, reason: editor.reason.trim() })
    patchEditor(result.success
      ? { pending: false, preview: result.data, stage: 'review' }
      : { actionError: result.error || labels.validateError, pending: false })
  }
  const confirmPublish = async () => {
    const clientRequestId = clientRequestIdRef.current
    if (!editor.packageId || !editor.preview || !clientRequestId) return
    patchEditor({ actionError: null, pending: true })
    const result = await adminControlService.publishSystemPriceBaseline({ baseline_id: record.id, client_request_id: clientRequestId, evidence_package_id: editor.packageId, expected_version: response.version, reason: editor.reason.trim() })
    if (!result.success) {
      patchEditor({ actionError: result.error || labels.publishError, pending: false })
      return
    }
    patchEditor({ pending: false, receipt: result.data, stage: 'receipt' })
    await detail.refresh()
  }
  const confirmRetire = async () => {
    const clientRequestId = clientRequestIdRef.current
    if (!clientRequestId) return
    patchEditor({ actionError: null, pending: true })
    const result = await adminControlService.retireSystemPriceBaseline(record.id, { client_request_id: clientRequestId, expected_version: response.version, reason: editor.reason.trim() })
    if (!result.success) {
      patchEditor({ actionError: result.error || labels.retireError, pending: false })
      return
    }
    patchEditor({ pending: false, receipt: result.data, stage: 'receipt' })
    await detail.refresh()
  }

  return <AdminSystemDetailScroll>
    <AdminSystemDetailHeader language={language} onBack={onBack} subtitle={`${labels.version} ${record.version} · ${labels.statusValue[record.lifecycle]}`} title={priceTitle(record, language)} />
    {editor.stage === 'view' ? <>
      <Section title={labels.scope}>
        <AdminSystemField label={labels.service} value={adminSystemServiceLabel(record.service_type, language)} />
        <AdminSystemField label={labels.problem} value={language === 'vi' ? record.problem_label_vi : record.problem_label_en || record.problem_label_vi} />
        <AdminSystemField label={labels.complexity} value={adminSystemComplexityLabel(record.complexity, language)} />
        <AdminSystemField label={labels.district} value={record.district_code} />
        <AdminSystemField label={labels.effective} value={adminSystemFormatDate(record.effective_from, language)} />
      </Section>
      <Section title={labels.priceRange}>
        <AdminSystemField label={labels.minimum} numeric value={adminSystemFormatVnd(record.price_min, language)} />
        <AdminSystemField label={labels.maximum} numeric value={adminSystemFormatVnd(record.price_max, language)} />
        <AdminSystemField label={labels.evidenceAccepted} numeric value={String(record.accepted_evidence_count)} />
        <AdminSystemField label={labels.references} numeric value={String(record.downstream_reference_count)} />
      </Section>
      <Section title={labels.evidence}>
        {record.evidence.length === 0 ? <AdminSystemState compact label={labels.noEvidence} /> : record.evidence.map((item) => <View key={`${item.domain}:${item.url}`} style={styles.evidence}><AdminText textRole="headline" style={styles.strong}>{item.domain}</AdminText><AdminText textRole="footnote" style={styles.secondary}>{item.accepted ? labels.accepted : item.exclusion_reason || labels.excluded} · {adminSystemFormatVnd(item.price_min, language)} – {adminSystemFormatVnd(item.price_max, language)}</AdminText><AdminText textRole="caption1" style={styles.secondary}>{adminSystemFormatDate(item.verified_at || item.observed_at, language)}</AdminText></View>)}
      </Section>
      <Section title={labels.history}><AdminSystemField label={labels.historyCount} numeric value={String(response.history.length)} /></Section>
      {canManage && record.lifecycle === 'active' ? <View style={styles.actions}><KaelButton label={labels.publishVersion} onPress={() => { void beginPublish() }} variant="secondary" /><KaelButton label={labels.retire} onPress={() => { clientRequestIdRef.current = generateClientRequestId(); patchEditor({ stage: 'retire' }) }} variant="secondary" /></View> : <AdminText textRole="footnote" style={styles.secondary}>{labels.readOnly}</AdminText>}
    </> : null}
    {editor.stage === 'publish' ? <>
      <Section title={labels.choosePackage}>{editor.packages.length === 0 ? <AdminSystemState compact label={labels.noPackages} /> : editor.packages.map((item) => <FinanceChoiceChip key={item.id} label={`${adminSystemFormatVnd(item.aggregate_min, language)} – ${adminSystemFormatVnd(item.aggregate_max, language)} · ${item.accepted_source_count} ${labels.sources}`} onPress={() => patchEditor({ packageId: item.id })} selected={editor.packageId === item.id} />)}</Section>
      <ReasonField language={language} onChange={(reason) => patchEditor({ reason })} value={editor.reason} />
      <ActionError label={editor.actionError} />
      <View style={styles.actions}><FinanceSecondaryButton label={labels.cancel} onPress={reset} /><KaelButton disabled={!editor.packageId || !editor.reason.trim() || editor.pending} label={labels.review} loading={editor.pending} onPress={() => { void reviewPublish() }} variant="primary" /></View>
    </> : null}
    {editor.stage === 'retire' ? <>
      <AdminSystemState compact label={record.downstream_reference_count > 0 ? labels.retireWarning(record.downstream_reference_count) : labels.retireUnavailableWarning} />
      <ReasonField language={language} onChange={(reason) => patchEditor({ reason })} value={editor.reason} />
      <ActionError label={editor.actionError} />
      <View style={styles.actions}><FinanceSecondaryButton label={labels.cancel} onPress={reset} /><KaelButton disabled={!editor.reason.trim()} label={labels.reviewRetire} onPress={() => patchEditor({ stage: 'review' })} variant="primary" /></View>
    </> : null}
    {editor.stage === 'review' ? <>
      <Section title={labels.reviewTitle}>
        <AdminSystemField label={labels.currentPrice} numeric value={priceRange(record, language)} />
        {editor.preview ? <AdminSystemField label={labels.newPrice} numeric value={`${adminSystemFormatVnd(editor.preview.proposed.aggregate_min, language)} – ${adminSystemFormatVnd(editor.preview.proposed.aggregate_max, language)}`} /> : <AdminSystemField label={labels.action} value={labels.retire} />}
        <AdminSystemField label={labels.reason} value={editor.reason} />
      </Section>
      <ActionError label={editor.actionError} />
      <View style={styles.actions}><FinanceSecondaryButton label={labels.backToEdit} onPress={() => patchEditor({ stage: editor.preview ? 'publish' : 'retire' })} /><KaelButton disabled={editor.pending} label={labels.confirm} loading={editor.pending} onPress={() => { void (editor.preview ? confirmPublish() : confirmRetire()) }} variant="primary" /></View>
    </> : null}
    {editor.stage === 'receipt' && editor.receipt ? <><AdminSystemState compact label={labels.receiptRecorded} /><Section title={labels.receipt}><AdminSystemField label={labels.eventId} value={editor.receipt.event_id} /><AdminSystemField label={labels.recordedAt} value={adminSystemFormatDate(editor.receipt.recorded_at, language)} /><AdminSystemField label={labels.newVersion} numeric value={String(editor.receipt.new_version)} /></Section><FinanceSecondaryButton label={labels.done} onPress={reset} /></> : null}
    {editor.pending && editor.stage === 'view' ? <AdminSystemState compact label={labels.loadingPackages} loading /> : null}
    {detail.error && record ? <AdminSystemState actionLabel={labels.retry} compact label={detail.error} onAction={detail.retry} /> : null}
  </AdminSystemDetailScroll>
}

function FilterGroup({ children, label }: { children: React.ReactNode; label: string }) { return <View style={styles.filterGroup}><AdminText textRole="caption1" style={styles.meta}>{label}</AdminText><View style={adminSystemStyles.filterRow}>{children}</View></View> }
function Section({ children, title }: { children: React.ReactNode; title: string }) { return <View style={styles.section}><AdminText textRole="headline" style={styles.strong}>{title}</AdminText><AdminSystemDivider />{children}</View> }
function ReasonField({ language, onChange, value }: { language: AppLanguage; onChange: (value: string) => void; value: string }) { const label = language === 'vi' ? 'Lý do thay đổi' : 'Change reason'; return <KaelTextField accessibilityLabel={label} label={label} multiline onChangeText={onChange} value={value} /> }
function ActionError({ label }: { label: string | null }) { return label ? <AdminText accessibilityRole="alert" textRole="footnote" style={styles.error}>{label}</AdminText> : null }
function priceTitle(record: AdminSystemPriceRecord, language: AppLanguage) { return `${adminSystemServiceLabel(record.service_type, language)} · ${language === 'vi' ? record.problem_label_vi : record.problem_label_en || record.problem_label_vi}` }
function priceRange(record: AdminSystemPriceRecord, language: AppLanguage) { return `${adminSystemFormatVnd(record.price_min, language)} – ${adminSystemFormatVnd(record.price_max, language)}` }

const copy = {
  vi: {
    accepted: 'Được chấp nhận', action: 'Hành động', activeCount: 'Khóa giá đang hiệu lực', all: 'Tất cả', attentionCount: 'Cần rà soát', backToEdit: 'Quay lại chỉnh sửa', cancel: 'Hủy', choosePackage: 'Gói bằng chứng đã xác minh', chooseRecord: 'Chọn một khóa giá để xem chi tiết.', complexity: 'Độ phức tạp', confirm: 'Xác nhận', currentPrice: 'Giá hiện tại', detailError: 'Không thể tải chi tiết giá tham chiếu.', district: 'Khu vực', done: 'Hoàn tất', effective: 'Hiệu lực từ', empty: 'Chưa ghi nhận giá tham chiếu cho phạm vi này.', eventId: 'Mã sự kiện', evidence: 'Bằng chứng', evidenceAccepted: 'Nguồn bằng chứng được chấp nhận', excluded: 'Bị loại', history: 'Lịch sử', historyCount: 'Số phiên bản đã ghi nhận', inactiveCount: 'Đã thay thế hoặc ngừng', loadError: 'Không thể tải giá tham chiếu.', loading: 'Đang tải giá tham chiếu…', loadingDetail: 'Đang tải chi tiết giá…', loadingMore: 'Đang tải…', loadingPackages: 'Đang tải gói bằng chứng…', loadMore: 'Xem thêm', maximum: 'Giá tối đa', minimum: 'Giá tối thiểu', newPrice: 'Giá mới', newVersion: 'Phiên bản mới', noEvidence: 'Chưa ghi nhận thông tin nguồn bằng chứng.', noPackages: 'Không có gói bằng chứng phù hợp đã được xác minh.', packageError: 'Không thể tải gói bằng chứng.', priceRange: 'Khoảng giá', problem: 'Nhóm vấn đề', publishError: 'Không thể xuất bản phiên bản giá.', publishVersion: 'Tạo phiên bản mới', quorumCount: 'Đạt số nguồn tối thiểu', readOnly: 'Bạn chỉ có quyền xem dữ liệu hệ thống.', reason: 'Lý do', receipt: 'Biên nhận quản trị', receiptRecorded: 'Thay đổi đã được ghi nhận.', recordedAt: 'Thời điểm ghi nhận', references: 'Tham chiếu đang sử dụng', retire: 'Ngừng áp dụng', retireError: 'Không thể ngừng áp dụng giá.', retireUnavailableWarning: 'Nếu không có giá thay thế, phạm vi này sẽ trở thành “Chưa ghi nhận”.', retireWarning: (count: number) => `${count} tham chiếu lịch sử vẫn giữ phiên bản này; bản ghi sẽ không bị xóa.`, review: 'Rà soát thay đổi', reviewRetire: 'Rà soát ngừng áp dụng', reviewTitle: 'Rà soát trước khi xác nhận', retry: 'Thử lại', scope: 'Phạm vi áp dụng', searchPlaceholder: 'Tìm dịch vụ, vấn đề hoặc mã giá', service: 'Dịch vụ', sources: 'nguồn', status: 'Trạng thái', statusValue: { all: 'Tất cả', active: 'Đang hiệu lực', superseded: 'Đã thay thế', retired: 'Đã ngừng' }, validateError: 'Gói bằng chứng chưa vượt qua kiểm tra.', version: 'Phiên bản',
  },
  en: {
    accepted: 'Accepted', action: 'Action', activeCount: 'Active price keys', all: 'All', attentionCount: 'Needs review', backToEdit: 'Back to edit', cancel: 'Cancel', choosePackage: 'Verified evidence package', chooseRecord: 'Select a price key to view details.', complexity: 'Complexity', confirm: 'Confirm', currentPrice: 'Current price', detailError: 'Unable to load price details.', district: 'Area', done: 'Done', effective: 'Effective from', empty: 'No price baselines are recorded for this scope.', eventId: 'Event ID', evidence: 'Evidence', evidenceAccepted: 'Accepted evidence sources', excluded: 'Excluded', history: 'History', historyCount: 'Recorded versions', inactiveCount: 'Superseded or retired', loadError: 'Unable to load price baselines.', loading: 'Loading price baselines…', loadingDetail: 'Loading price details…', loadingMore: 'Loading…', loadingPackages: 'Loading evidence packages…', loadMore: 'Load more', maximum: 'Maximum price', minimum: 'Minimum price', newPrice: 'New price', newVersion: 'New version', noEvidence: 'No evidence metadata is recorded.', noPackages: 'No matching verified evidence package is available.', packageError: 'Unable to load evidence packages.', priceRange: 'Price range', problem: 'Problem', publishError: 'Unable to publish the price version.', publishVersion: 'Create new version', quorumCount: 'Quorum met', readOnly: 'You have read-only System access.', reason: 'Reason', receipt: 'Administration receipt', receiptRecorded: 'The change was recorded.', recordedAt: 'Recorded at', references: 'References using this version', retire: 'Retire', retireError: 'Unable to retire the baseline.', retireUnavailableWarning: 'Without a replacement, this scope will become “Not recorded”.', retireWarning: (count: number) => `${count} historical references retain this version; the record will not be deleted.`, review: 'Review change', reviewRetire: 'Review retirement', reviewTitle: 'Review before confirmation', retry: 'Retry', scope: 'Scope', searchPlaceholder: 'Search service, problem, or price ID', service: 'Service', sources: 'sources', status: 'Status', statusValue: { all: 'All', active: 'Active', superseded: 'Superseded', retired: 'Retired' }, validateError: 'The evidence package did not pass validation.', version: 'Version',
  },
} as const

const styles = StyleSheet.create({
  actions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'flex-end' },
  error: { color: color.accent.destructive },
  evidence: { borderBottomColor: color.surface.stroke, borderBottomWidth: StyleSheet.hairlineWidth, gap: spacing.xs, paddingVertical: spacing.sm },
  filterGroup: { gap: spacing.sm },
  header: { gap: spacing.md, paddingBottom: spacing.md },
  loadMore: { alignItems: 'center', paddingTop: spacing.md },
  meta: { color: color.text.muted, fontWeight: '600' },
  secondary: { color: color.text.secondary },
  section: { gap: spacing.sm },
  strong: { color: color.text.strong },
})
