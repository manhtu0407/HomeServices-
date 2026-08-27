import { SERVICE_TYPES, type ServiceType } from '@nestscout/shared'
import { useCallback, useMemo, useReducer, useRef } from 'react'
import { FlatList, StyleSheet, View, type ListRenderItemInfo } from 'react-native'

import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import { color, spacing } from '@/design/theme'
import type { AdminViewActor } from '@/lib/api-types/admin'
import type { AdminSystemLearningDetailResponse, AdminSystemLearningListResponse, AdminSystemLearningPreviewResponse, AdminSystemLearningRecord, AdminSystemReceipt } from '@/lib/api-types/admin-system'
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
import { adminSystemFormatDate, adminSystemServiceLabel } from './admin-system-values'
import { AdminText } from './admin-text'
import { useAdminSystemDetail } from './use-admin-system-detail'
import { useAdminSystemResource } from './use-admin-system-resource'

type RuleStatus = 'all' | 'active' | 'monitoring' | 'disabled'
type RuleAction = 'rollback' | 'revoke'
type RuleRollback = 'all' | 'available' | 'unavailable'
type RuleService = 'all' | ServiceType

type LearningListState = {
  query: string
  rollback: RuleRollback
  selectedId: string | null
  service: RuleService
  status: RuleStatus
}

const initialLearningListState: LearningListState = {
  query: '', rollback: 'all', selectedId: null, service: 'all', status: 'all',
}

type LearningEditorState = {
  action: RuleAction | null
  error: string | null
  pending: boolean
  preview: AdminSystemLearningPreviewResponse | null
  reason: string
  receipt: AdminSystemReceipt | null
  targetVersion: number | null
}

const initialLearningEditorState: LearningEditorState = {
  action: null, error: null, pending: false, preview: null, reason: '', receipt: null, targetVersion: null,
}

export function AdminSystemLearningWorkspace({ actor, language }: { actor: AdminViewActor; language: AppLanguage }) {
  const labels = copy[language]
  const [state, patch] = useReducer((current: LearningListState, next: Partial<LearningListState>) => ({ ...current, ...next }), initialLearningListState)
  const fetchPage = useCallback(({ cursor, query: search }: { cursor?: string; query: string }) => adminControlService.listSystemLearningRules({ cursor, limit: 20, query: search, rollback: state.rollback, service_type: state.service, status: state.status }), [state.rollback, state.service, state.status])
  const list = useAdminSystemResource<AdminSystemLearningRecord, AdminSystemLearningListResponse['summary'], AdminSystemLearningListResponse>({ cacheKey: `system-learning:${state.status}:${state.service}:${state.rollback}`, errorMessage: labels.loadError, fetchPage, query: state.query })
  const detail = useAdminSystemDetail<AdminSystemLearningDetailResponse>({ cacheKey: 'system-learning-detail', errorMessage: labels.detailError, fetchDetail: adminControlService.getSystemLearningRule, id: state.selectedId })
  const selectRule = useCallback((id: string) => patch({ selectedId: id }), [])
  const renderRule = useCallback(({ item }: ListRenderItemInfo<AdminSystemLearningRecord>) => <AdminSystemRow
    accessibilityLabel={`${ruleTypeLabel(item.rule_type, language)}. ${statusLabel(item.status, language)}`}
    aside={`${Math.round(item.confidence * 100)}%`}
    id={item.id}
    meta={`${scopeLabel(item, language)} · ${labels.version} ${item.active_version} · ${statusLabel(item.status, language)}`}
    onPress={selectRule}
    selected={state.selectedId === item.id}
    title={ruleTypeLabel(item.rule_type, language)}
  />, [labels.version, language, selectRule, state.selectedId])

  const listNode = <FlatList
    contentContainerStyle={adminSystemStyles.listContent}
    data={list.records}
    keyExtractor={(item) => item.id}
    ListEmptyComponent={list.loading ? <AdminSystemState label={labels.loading} loading /> : list.error ? <AdminSystemState actionLabel={labels.retry} label={list.error} onAction={list.retry} /> : null}
    ListFooterComponent={list.hasMore ? <View style={styles.loadMore}><FinanceSecondaryButton disabled={list.loadingMore} label={list.loadingMore ? labels.loadingMore : labels.loadMore} loading={list.loadingMore} onPress={list.loadMore} /></View> : null}
    ListHeaderComponent={<View style={styles.header}>
      <AdminSystemToolbar language={language} onChangeQuery={(query) => patch({ query })} onRefresh={list.refresh} query={state.query} refreshing={list.refreshing} searchPlaceholder={labels.searchPlaceholder} />
      <AdminSystemSummary generatedAt={list.generatedAt} language={language} quality={list.dataQuality}>
        <AdminSystemMetric label={labels.active} value={list.summary?.active_count ?? null} />
        <AdminSystemMetric label={labels.monitoring} value={list.summary?.monitoring_count ?? null} />
        <AdminSystemMetric label={labels.rollbackAvailable} value={list.summary?.rollback_count ?? null} />
        <AdminSystemMetric label={labels.inactive} value={list.summary?.inactive_count ?? null} />
      </AdminSystemSummary>
      <View style={styles.filterGroup}><AdminText textRole="caption1" style={styles.meta}>{labels.status}</AdminText><View style={adminSystemStyles.filterRow}>{(['all', 'active', 'monitoring', 'disabled'] as const).map((value) => <FinanceChoiceChip key={value} label={labels.statusValue[value]} onPress={() => patch({ status: value })} selected={state.status === value} />)}</View></View>
      <View style={styles.filterGroup}><AdminText textRole="caption1" style={styles.meta}>{labels.service}</AdminText><View style={adminSystemStyles.filterRow}><FinanceChoiceChip label={labels.all} onPress={() => patch({ service: 'all' })} selected={state.service === 'all'} />{SERVICE_TYPES.map((value) => <FinanceChoiceChip key={value} label={adminSystemServiceLabel(value, language)} onPress={() => patch({ service: value })} selected={state.service === value} />)}</View></View>
      <View style={styles.filterGroup}><AdminText textRole="caption1" style={styles.meta}>{labels.rollbackAvailable}</AdminText><View style={adminSystemStyles.filterRow}>{(['all', 'available', 'unavailable'] as const).map((value) => <FinanceChoiceChip key={value} label={value === 'all' ? labels.all : value === 'available' ? labels.rollbackAvailable : (language === 'vi' ? 'Không có phiên bản hoàn tác' : 'No rollback version')} onPress={() => patch({ rollback: value })} selected={state.rollback === value} />)}</View></View>
      {list.error && list.records.length > 0 ? <AdminSystemState actionLabel={labels.retry} compact label={list.error} onAction={list.retry} /> : null}
    </View>}
    renderItem={renderRule}
    showsVerticalScrollIndicator={false}
    style={adminSystemStyles.list}
    testID="admin-system-learning-list"
  />
  const detailNode = useMemo(() => <LearningDetail actor={actor} detail={detail} language={language} onBack={() => patch({ selectedId: null })} />, [actor, detail, language])
  return <AdminSystemWorkspaceLayout detail={detailNode} emptyDetailLabel={labels.chooseRule} list={listNode} selected={Boolean(state.selectedId)} />
}

function LearningDetail({ actor, detail, language, onBack }: {
  actor: AdminViewActor
  detail: ReturnType<typeof useAdminSystemDetail<AdminSystemLearningDetailResponse>>
  language: AppLanguage
  onBack: () => void
}) {
  const labels = copy[language]
  const canManage = actor.capabilities.includes('system.manage')
  const [editor, patchEditor] = useReducer((current: LearningEditorState, next: Partial<LearningEditorState>) => ({ ...current, ...next }), initialLearningEditorState)
  const clientRequestIdRef = useRef<string | null>(null)
  const response = detail.data
  const record = response?.record
  const versions = useMemo(() => response ? response.history.flatMap((entry) => typeof entry.version === 'number' && entry.version < response.version ? [entry.version] : []) : [], [response])

  if (detail.loading && !record) return <AdminSystemState label={labels.loadingDetail} loading />
  if (detail.error && !record) return <AdminSystemState actionLabel={labels.retry} label={detail.error} onAction={detail.retry} />
  if (!record || !response) return <AdminSystemState label={labels.chooseRule} />

  const reset = () => {
    clientRequestIdRef.current = null
    patchEditor(initialLearningEditorState)
  }
  const beginAction = (nextAction: RuleAction) => {
    clientRequestIdRef.current = generateClientRequestId()
    patchEditor({ action: nextAction, error: null, targetVersion: nextAction === 'rollback' ? versions[0] ?? null : null })
  }
  const review = async () => {
    const clientRequestId = clientRequestIdRef.current
    if (!editor.action || !clientRequestId || !editor.reason.trim() || editor.action === 'rollback' && !editor.targetVersion) return
    patchEditor({ error: null, pending: true })
    const result = await adminControlService.previewSystemLearningAction(record.id, editor.action, { client_request_id: clientRequestId, expected_version: response.version, reason: editor.reason.trim(), ...(editor.targetVersion ? { target_version: editor.targetVersion } : {}) })
    patchEditor(result.success ? { pending: false, preview: result.data } : { error: result.error || labels.previewError, pending: false })
  }
  const confirm = async () => {
    const clientRequestId = clientRequestIdRef.current
    if (!editor.action || !clientRequestId || !editor.preview) return
    patchEditor({ error: null, pending: true })
    const result = await adminControlService.applySystemLearningAction(record.id, editor.action, { client_request_id: clientRequestId, expected_version: response.version, reason: editor.reason.trim(), ...(editor.targetVersion ? { target_version: editor.targetVersion } : {}) })
    if (!result.success) {
      patchEditor({ error: result.error || labels.applyError, pending: false })
      return
    }
    patchEditor({ pending: false, preview: null, receipt: result.data })
    await detail.refresh()
  }

  return <AdminSystemDetailScroll>
    <AdminSystemDetailHeader language={language} onBack={onBack} subtitle={`${labels.version} ${record.active_version} · ${statusLabel(record.status, language)}`} title={ruleTypeLabel(record.rule_type, language)} />
    {!editor.action && !editor.receipt ? <>
      <Section title={labels.statusAndVersion}><AdminSystemField label={labels.status} value={statusLabel(record.status, language)} /><AdminSystemField label={labels.activeVersion} numeric value={String(record.active_version)} /><AdminSystemField label={labels.confidence} numeric value={`${Math.round(record.confidence * 100)}%`} /><AdminSystemField label={labels.updated} value={adminSystemFormatDate(record.updated_at, language)} /></Section>
      <Section title={labels.scope}><AdminSystemField label={labels.service} value={record.affected_service ? adminSystemServiceLabel(record.affected_service, language) : labels.allServices} /><AdminSystemField label={labels.problem} value={record.affected_problem || labels.allProblems} /><AdminSystemField label={labels.district} value={record.affected_district || labels.allDistricts} /></Section>
      <Section title={labels.provenance}><AdminSystemField label={labels.provenanceId} value={record.provenance_id || labels.notRecorded} /><AdminSystemField label={labels.releaseId} value={record.release_id || labels.notRecorded} /><AdminSystemField label={labels.evidence} numeric value={String(record.evidence_count)} /></Section>
      <Section title={labels.dependencies}>{record.dependencies.length === 0 ? <AdminSystemState compact label={labels.noDependencies} /> : record.dependencies.map((dependency) => <AdminSystemField key={dependency.id} label={dependency.type} value={`${dependency.id} · ${dependency.status}`} />)}</Section>
      <Section title={labels.versionHistory}><AdminSystemField label={labels.historyCount} numeric value={String(response.history.length)} />{versions.map((version) => <AdminSystemField key={version} label={labels.version} numeric value={String(version)} />)}</Section>
      {canManage ? <View style={styles.actions}>{record.rollback_available ? <FinanceSecondaryButton disabled={versions.length === 0} label={labels.rollback} onPress={() => beginAction('rollback')} /> : null}{record.status === 'active' ? <KaelButton label={labels.revoke} onPress={() => beginAction('revoke')} variant="primary" /> : null}</View> : <AdminText textRole="footnote" style={styles.secondary}>{labels.readOnly}</AdminText>}
    </> : null}
    {editor.action && !editor.preview && !editor.receipt ? <>
      <Section title={editor.action === 'rollback' ? labels.rollback : labels.revoke}>
        {editor.action === 'rollback' ? <View style={adminSystemStyles.filterRow}>{versions.map((version) => <FinanceChoiceChip key={version} label={`${labels.version} ${version}`} onPress={() => patchEditor({ targetVersion: version })} selected={editor.targetVersion === version} />)}</View> : <AdminSystemState compact label={labels.revokeWarning(record.dependency_count)} />}
        <KaelTextField accessibilityLabel={labels.reason} label={labels.reason} multiline onChangeText={(reason) => patchEditor({ reason })} value={editor.reason} />
      </Section>
      <ActionError label={editor.error} />
      <View style={styles.actions}><FinanceSecondaryButton label={labels.cancel} onPress={reset} /><KaelButton disabled={!editor.reason.trim() || editor.action === 'rollback' && !editor.targetVersion || editor.pending} label={labels.review} loading={editor.pending} onPress={() => { void review() }} variant="primary" /></View>
    </> : null}
    {editor.preview && !editor.receipt ? <>
      <Section title={labels.reviewTitle}><AdminSystemField label={labels.action} value={editor.preview.action === 'rollback' ? labels.rollback : labels.revoke} /><AdminSystemField label={labels.currentVersion} numeric value={String(editor.preview.current_version)} /><AdminSystemField label={labels.targetVersion} numeric value={editor.preview.target_version === null ? labels.notApplicable : String(editor.preview.target_version)} /><AdminSystemField label={labels.affectedDependencies} numeric value={String(editor.preview.dependency_count)} /><AdminSystemField label={labels.reason} value={editor.reason} /></Section>
      <ActionError label={editor.error} />
      <View style={styles.actions}><FinanceSecondaryButton label={labels.backToEdit} onPress={() => patchEditor({ preview: null })} /><KaelButton disabled={editor.pending} label={labels.confirm} loading={editor.pending} onPress={() => { void confirm() }} variant="primary" /></View>
    </> : null}
    {editor.receipt ? <><AdminSystemState compact label={labels.receiptRecorded} /><Section title={labels.receipt}><AdminSystemField label={labels.eventId} value={editor.receipt.event_id} /><AdminSystemField label={labels.recordedAt} value={adminSystemFormatDate(editor.receipt.recorded_at, language)} /><AdminSystemField label={labels.newVersion} numeric value={String(editor.receipt.new_version)} /></Section><FinanceSecondaryButton label={labels.done} onPress={reset} /></> : null}
    {detail.error && record ? <AdminSystemState actionLabel={labels.retry} compact label={detail.error} onAction={detail.retry} /> : null}
  </AdminSystemDetailScroll>
}

function Section({ children, title }: { children: React.ReactNode; title: string }) { return <View style={styles.section}><AdminText textRole="headline" style={styles.strong}>{title}</AdminText><AdminSystemDivider />{children}</View> }
function ActionError({ label }: { label: string | null }) { return label ? <AdminText accessibilityRole="alert" textRole="footnote" style={styles.error}>{label}</AdminText> : null }
function ruleTypeLabel(value: string, language: AppLanguage) { const known: Record<string, readonly [string, string]> = { price_adjustment: ['Điều chỉnh giá', 'Price adjustment'], routing: ['Điều phối', 'Routing'], scope_change: ['Đổi phạm vi', 'Scope change'], worker_matching: ['Ghép thợ', 'Worker matching'] }; return known[value]?.[language === 'vi' ? 0 : 1] ?? value.replaceAll('_', ' ') }
function statusLabel(value: string, language: AppLanguage) { const known: Record<string, readonly [string, string]> = { active: ['Đang áp dụng', 'Active'], monitoring: ['Đang theo dõi', 'Monitoring'], disabled: ['Đã tắt', 'Disabled'], revoked: ['Đã thu hồi', 'Revoked'], rolled_back: ['Đã hoàn tác', 'Rolled back'], degraded: ['Suy giảm đã ghi nhận', 'Degraded recorded'] }; return known[value]?.[language === 'vi' ? 0 : 1] ?? value.replaceAll('_', ' ') }
function scopeLabel(record: AdminSystemLearningRecord, language: AppLanguage) { return [record.affected_service ? adminSystemServiceLabel(record.affected_service, language) : null, record.affected_problem, record.affected_district].filter(Boolean).join(' · ') || (language === 'vi' ? 'Toàn hệ thống' : 'System-wide') }

const copy = {
  vi: {
    action: 'Hành động', active: 'Đang áp dụng', activeVersion: 'Phiên bản đang áp dụng', affectedDependencies: 'Dependency bị tác động', all: 'Tất cả', allDistricts: 'Tất cả khu vực', allProblems: 'Tất cả problem', allServices: 'Tất cả dịch vụ', applyError: 'Không thể ghi nhận thao tác quản trị rule.', backToEdit: 'Quay lại chỉnh sửa', cancel: 'Hủy', chooseRule: 'Chọn một rule để xem nguồn gốc và lịch sử.', confidence: 'Độ tin cậy', confirm: 'Xác nhận', currentVersion: 'Phiên bản hiện tại', dependencies: 'Dependencies', detailError: 'Không thể tải chi tiết rule.', district: 'Khu vực', done: 'Hoàn tất', eventId: 'Mã sự kiện', evidence: 'Số evidence', historyCount: 'Mốc lịch sử', inactive: 'Đã tắt/thu hồi/hoàn tác', loadError: 'Không thể tải quy tắc học của Kael.', loading: 'Đang tải quy tắc học…', loadingDetail: 'Đang tải chi tiết rule…', loadingMore: 'Đang tải…', loadMore: 'Xem thêm', monitoring: 'Đang theo dõi', newVersion: 'Phiên bản mới', noDependencies: 'Không có dependency đang ghi nhận.', notApplicable: 'Không áp dụng', notRecorded: 'Chưa ghi nhận', previewError: 'Không thể tạo bản xem trước tác động.', problem: 'Nhóm vấn đề', provenance: 'Nguồn gốc', provenanceId: 'Mã provenance', readOnly: 'Bạn chỉ có quyền xem rule đã deploy.', reason: 'Lý do quản trị', receipt: 'Biên nhận quản trị', receiptRecorded: 'Thao tác rule đã được ghi nhận.', recordedAt: 'Thời điểm ghi nhận', releaseId: 'Mã release', retry: 'Thử lại', review: 'Rà soát tác động', reviewTitle: 'Rà soát trước khi xác nhận', revoke: 'Thu hồi rule', revokeWarning: (count: number) => `Thu hồi sẽ vô hiệu chuỗi phụ thuộc liên quan (${count} dependency đang ghi nhận). Không có undo tức thời.`, rollback: 'Hoàn tác phiên bản', rollbackAvailable: 'Có phiên bản hoàn tác', scope: 'Phạm vi', searchPlaceholder: 'Tìm rule, phạm vi hoặc khu vực', service: 'Dịch vụ', status: 'Trạng thái', statusAndVersion: 'Trạng thái và phiên bản', statusValue: { all: 'Tất cả', active: 'Đang áp dụng', monitoring: 'Đang theo dõi', disabled: 'Đã tắt' }, targetVersion: 'Phiên bản đích', updated: 'Cập nhật', version: 'Phiên bản', versionHistory: 'Lịch sử phiên bản',
  },
  en: {
    action: 'Action', active: 'Active', activeVersion: 'Active version', affectedDependencies: 'Affected dependencies', all: 'All', allDistricts: 'All areas', allProblems: 'All problems', allServices: 'All services', applyError: 'Unable to record the rule action.', backToEdit: 'Back to edit', cancel: 'Cancel', chooseRule: 'Select a rule to inspect provenance and history.', confidence: 'Confidence', confirm: 'Confirm', currentVersion: 'Current version', dependencies: 'Dependencies', detailError: 'Unable to load rule details.', district: 'Area', done: 'Done', eventId: 'Event ID', evidence: 'Evidence count', historyCount: 'History entries', inactive: 'Disabled/revoked/rolled back', loadError: 'Unable to load Kael learning rules.', loading: 'Loading learning rules…', loadingDetail: 'Loading rule details…', loadingMore: 'Loading…', loadMore: 'Load more', monitoring: 'Monitoring', newVersion: 'New version', noDependencies: 'No dependencies are recorded.', notApplicable: 'Not applicable', notRecorded: 'Not recorded', previewError: 'Unable to preview action impact.', problem: 'Problem', provenance: 'Provenance', provenanceId: 'Provenance ID', readOnly: 'You have read-only access to deployed rules.', reason: 'Administration reason', receipt: 'Administration receipt', receiptRecorded: 'The rule action was recorded.', recordedAt: 'Recorded at', releaseId: 'Release ID', retry: 'Retry', review: 'Review impact', reviewTitle: 'Review before confirmation', revoke: 'Revoke rule', revokeWarning: (count: number) => `Revocation disables the related dependency chain (${count} recorded dependencies). There is no instant undo.`, rollback: 'Roll back version', rollbackAvailable: 'Rollback available', scope: 'Scope', searchPlaceholder: 'Search rule type, scope, or area', service: 'Service', status: 'Status', statusAndVersion: 'Status and version', statusValue: { all: 'All', active: 'Active', monitoring: 'Monitoring', disabled: 'Disabled' }, targetVersion: 'Target version', updated: 'Updated', version: 'Version', versionHistory: 'Version history',
  },
} as const

const styles = StyleSheet.create({
  actions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'flex-end' },
  error: { color: color.accent.destructive },
  filterGroup: { gap: spacing.sm },
  header: { gap: spacing.md, paddingBottom: spacing.md },
  loadMore: { alignItems: 'center', paddingTop: spacing.md },
  meta: { color: color.text.muted, fontWeight: '600' },
  secondary: { color: color.text.secondary },
  section: { gap: spacing.sm },
  strong: { color: color.text.strong },
})
