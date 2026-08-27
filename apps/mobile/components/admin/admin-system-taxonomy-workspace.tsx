import { useCallback, useMemo, useReducer, useRef } from 'react'
import { FlatList, StyleSheet, View, type ListRenderItemInfo } from 'react-native'

import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import { color, spacing } from '@/design/theme'
import type { AdminViewActor } from '@/lib/api-types/admin'
import type { AdminSystemReceipt, AdminSystemTaxonomyDetailResponse, AdminSystemTaxonomyListResponse, AdminSystemTaxonomyProblem, AdminSystemTaxonomyService, AdminSystemTaxonomyValidationResponse } from '@/lib/api-types/admin-system'
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
import { adminSystemComplexityLabel, adminSystemFormatDate, adminSystemServiceLabel } from './admin-system-values'
import { AdminText } from './admin-text'
import { useAdminSystemDetail } from './use-admin-system-detail'
import { useAdminSystemResource } from './use-admin-system-resource'

type TaxonomyStatus = 'all' | 'active' | 'inactive'
type TaxonomyBaseline = 'all' | 'available' | 'missing'
type TaxonomyComplexity = 'all' | Complexity
type EditorMode = 'service' | 'create' | 'problem' | 'toggle'
type Complexity = 'small' | 'medium' | 'large'

type Draft = {
  mode: EditorMode
  problem: AdminSystemTaxonomyProblem | null
  change: Record<string, unknown> | null
  labelVi: string
  labelEn: string
  slug: string
  complexity: Complexity
  sortOrder: string
}

type TaxonomyListState = {
  baseline: TaxonomyBaseline
  complexity: TaxonomyComplexity
  query: string
  selectedType: string | null
  status: TaxonomyStatus
}

const initialTaxonomyListState: TaxonomyListState = {
  baseline: 'all', complexity: 'all', query: '', selectedType: null, status: 'all',
}

type TaxonomyEditorState = {
  draft: Draft | null
  error: string | null
  pending: boolean
  preview: AdminSystemTaxonomyValidationResponse | null
  reason: string
  receipt: AdminSystemReceipt | null
}

const initialTaxonomyEditorState: TaxonomyEditorState = {
  draft: null, error: null, pending: false, preview: null, reason: '', receipt: null,
}

export function AdminSystemTaxonomyWorkspace({ actor, language }: { actor: AdminViewActor; language: AppLanguage }) {
  const labels = copy[language]
  const [state, patch] = useReducer((current: TaxonomyListState, next: Partial<TaxonomyListState>) => ({ ...current, ...next }), initialTaxonomyListState)
  const fetchPage = useCallback(({ query: search }: { cursor?: string; query: string }) => adminControlService.getSystemTaxonomy({ baseline: state.baseline, complexity: state.complexity, limit: 20, query: search, status: state.status }), [state.baseline, state.complexity, state.status])
  const list = useAdminSystemResource<AdminSystemTaxonomyService, AdminSystemTaxonomyListResponse['summary'], AdminSystemTaxonomyListResponse>({ cacheKey: `system-taxonomy:${state.status}:${state.complexity}:${state.baseline}`, errorMessage: labels.loadError, fetchPage, query: state.query })
  const detail = useAdminSystemDetail<AdminSystemTaxonomyDetailResponse>({ cacheKey: 'system-taxonomy-detail', errorMessage: labels.detailError, fetchDetail: adminControlService.getSystemTaxonomyDetail, id: state.selectedType })
  const selectService = useCallback((id: string) => patch({ selectedType: id }), [])
  const renderService = useCallback(({ item }: ListRenderItemInfo<AdminSystemTaxonomyService>) => <AdminSystemRow
    accessibilityLabel={`${serviceName(item, language)}. ${item.active_problem_count} ${labels.activeProblems}`}
    aside={`${item.active_problem_count}/${item.active_problem_count + item.inactive_problem_count}`}
    id={item.service_type}
    meta={`${labels.quoteReady}: ${item.quote_ready_problem_count} · ${labels.revision} ${item.revision}`}
    onPress={selectService}
    selected={state.selectedType === item.service_type}
    title={serviceName(item, language)}
  />, [labels.activeProblems, labels.quoteReady, labels.revision, language, selectService, state.selectedType])

  const listNode = <FlatList
    contentContainerStyle={adminSystemStyles.listContent}
    data={list.records}
    keyExtractor={(item) => item.service_type}
    ListEmptyComponent={list.loading ? <AdminSystemState label={labels.loading} loading /> : list.error ? <AdminSystemState actionLabel={labels.retry} label={list.error} onAction={list.retry} /> : <AdminSystemState compact label={labels.empty} />}
    ListHeaderComponent={<View style={styles.header}>
      <AdminSystemToolbar language={language} onChangeQuery={(query) => patch({ query })} onRefresh={list.refresh} query={state.query} refreshing={list.refreshing} searchPlaceholder={labels.searchPlaceholder} />
      <AdminSystemSummary generatedAt={list.generatedAt} language={language} quality={list.dataQuality}>
        <AdminSystemMetric label={labels.services} value={list.summary?.canonical_service_count ?? null} />
        <AdminSystemMetric label={labels.activeProblems} value={list.summary?.active_problem_count ?? null} />
        <AdminSystemMetric label={labels.inactiveProblems} value={list.summary?.inactive_problem_count ?? null} />
        <AdminSystemMetric label={labels.missingBaseline} value={list.summary?.missing_baseline_count ?? null} />
      </AdminSystemSummary>
      <View style={styles.filterGroup}><AdminText textRole="caption1" style={styles.meta}>{labels.problemStatus}</AdminText><View style={adminSystemStyles.filterRow}>{(['all', 'active', 'inactive'] as const).map((value) => <FinanceChoiceChip key={value} label={labels.statusValue[value]} onPress={() => patch({ status: value })} selected={state.status === value} />)}</View></View>
      <View style={styles.filterGroup}><AdminText textRole="caption1" style={styles.meta}>{language === 'vi' ? 'Độ phức tạp' : 'Complexity'}</AdminText><View style={adminSystemStyles.filterRow}>{(['all', 'small', 'medium', 'large'] as const).map((value) => <FinanceChoiceChip key={value} label={value === 'all' ? labels.statusValue.all : adminSystemComplexityLabel(value, language)} onPress={() => patch({ complexity: value })} selected={state.complexity === value} />)}</View></View>
      <View style={styles.filterGroup}><AdminText textRole="caption1" style={styles.meta}>{language === 'vi' ? 'Giá tham chiếu' : 'Price baseline'}</AdminText><View style={adminSystemStyles.filterRow}>{(['all', 'available', 'missing'] as const).map((value) => <FinanceChoiceChip key={value} label={value === 'all' ? labels.statusValue.all : value === 'available' ? (language === 'vi' ? 'Đã ghi nhận' : 'Recorded') : (language === 'vi' ? 'Chưa ghi nhận' : 'Not recorded')} onPress={() => patch({ baseline: value })} selected={state.baseline === value} />)}</View></View>
      {list.error && list.records.length > 0 ? <AdminSystemState actionLabel={labels.retry} compact label={list.error} onAction={list.retry} /> : null}
    </View>}
    renderItem={renderService}
    showsVerticalScrollIndicator={false}
    style={adminSystemStyles.list}
    testID="admin-system-taxonomy-list"
  />
  const detailNode = useMemo(() => <TaxonomyDetail actor={actor} detail={detail} language={language} onBack={() => patch({ selectedType: null })} />, [actor, detail, language])
  return <AdminSystemWorkspaceLayout detail={detailNode} emptyDetailLabel={labels.chooseService} list={listNode} selected={Boolean(state.selectedType)} />
}

function TaxonomyDetail({ actor, detail, language, onBack }: {
  actor: AdminViewActor
  detail: ReturnType<typeof useAdminSystemDetail<AdminSystemTaxonomyDetailResponse>>
  language: AppLanguage
  onBack: () => void
}) {
  const labels = copy[language]
  const canManage = actor.capabilities.includes('system.manage')
  const [editor, patchEditor] = useReducer((current: TaxonomyEditorState, next: Partial<TaxonomyEditorState>) => ({ ...current, ...next }), initialTaxonomyEditorState)
  const clientRequestIdRef = useRef<string | null>(null)
  const response = detail.data
  const record = response?.record
  const draft = editor.draft

  if (detail.loading && !record) return <AdminSystemState label={labels.loadingDetail} loading />
  if (detail.error && !record) return <AdminSystemState actionLabel={labels.retry} label={detail.error} onAction={detail.retry} />
  if (!record || !response) return <AdminSystemState label={labels.chooseService} />

  const reset = () => {
    clientRequestIdRef.current = null
    patchEditor(initialTaxonomyEditorState)
  }
  const beginDraft = (nextDraft: Draft) => {
    clientRequestIdRef.current = generateClientRequestId()
    patchEditor({ draft: nextDraft, error: null })
  }
  const editService = () => beginDraft({ mode: 'service', problem: null, change: null, labelVi: record.label_vi, labelEn: record.label_en || '', slug: '', complexity: 'medium', sortOrder: '' })
  const createProblem = () => beginDraft({ mode: 'create', problem: null, change: null, labelVi: '', labelEn: '', slug: '', complexity: 'medium', sortOrder: String(Math.max(0, ...record.problems.map((item) => item.sort_order)) + 10) })
  const editProblem = (problem: AdminSystemTaxonomyProblem) => beginDraft({ mode: 'problem', problem, change: null, labelVi: problem.label_vi, labelEn: problem.label_en || '', slug: problem.slug, complexity: problem.default_complexity, sortOrder: String(problem.sort_order) })
  const toggleProblem = (problem: AdminSystemTaxonomyProblem) => beginDraft({ mode: 'toggle', problem, change: { action: problem.is_active ? 'deactivate' : 'activate', id: problem.id }, labelVi: problem.label_vi, labelEn: problem.label_en || '', slug: problem.slug, complexity: problem.default_complexity, sortOrder: String(problem.sort_order) })

  const mutationInput = () => {
    const draft = editor.draft
    const clientRequestId = clientRequestIdRef.current
    if (!draft || !clientRequestId) return null
    let service_patch: { label_vi?: string; label_en?: string } | undefined
    let problem_changes: Record<string, unknown>[] = []
    if (draft.mode === 'service') service_patch = { label_vi: draft.labelVi.trim(), label_en: draft.labelEn.trim() }
    if (draft.mode === 'create') problem_changes = [{ action: 'create', value: { slug: draft.slug.trim(), label_vi: draft.labelVi.trim(), label_en: draft.labelEn.trim(), default_complexity: draft.complexity, sort_order: Number(draft.sortOrder) } }]
    if (draft.mode === 'problem' && draft.problem) problem_changes = [{ action: 'update', id: draft.problem.id, patch: { label_vi: draft.labelVi.trim(), label_en: draft.labelEn.trim(), default_complexity: draft.complexity } }, { action: 'reorder', id: draft.problem.id, sort_order: Number(draft.sortOrder) }]
    if (draft.mode === 'toggle' && draft.change) problem_changes = [draft.change]
    return { client_request_id: clientRequestId, expected_revision: response.version, problem_changes, reason: editor.reason.trim(), ...(service_patch ? { service_patch } : {}) }
  }

  const review = async () => {
    const input = mutationInput()
    if (!input || !editor.reason.trim()) return
    patchEditor({ error: null, pending: true })
    const result = await adminControlService.validateSystemTaxonomy(record.service_type, input)
    patchEditor(result.success ? { pending: false, preview: result.data } : { error: result.error || labels.validateError, pending: false })
  }
  const confirm = async () => {
    const input = mutationInput()
    if (!input || !editor.preview) return
    patchEditor({ error: null, pending: true })
    const result = await adminControlService.updateSystemTaxonomy(record.service_type, input)
    if (!result.success) {
      patchEditor({ error: result.error || labels.saveError, pending: false })
      return
    }
    patchEditor({ pending: false, preview: null, receipt: result.data })
    await detail.refresh()
  }

  return <AdminSystemDetailScroll>
    <AdminSystemDetailHeader language={language} onBack={onBack} subtitle={`${labels.revision} ${record.revision} · ${record.data_quality === 'available' ? labels.current : labels.partial}`} title={serviceName(record, language)} />
    {!draft && !editor.receipt ? <>
      <Section title={labels.serviceMetadata}><AdminSystemField label={labels.serviceType} value={record.service_type} /><AdminSystemField label={labels.slug} value={record.slug} /><AdminSystemField label={labels.labelVi} value={record.label_vi} /><AdminSystemField label={labels.labelEn} value={record.label_en || labels.notRecorded} /><AdminSystemField label={labels.history} numeric value={String(response.history.length)} /></Section>
      <Section title={labels.problems}>
        {record.problems.map((problem) => <View key={problem.id} style={styles.problemRow}>
          <View style={styles.problemText}><AdminText textRole="headline" style={styles.strong}>{language === 'vi' ? problem.label_vi : problem.label_en || problem.label_vi}</AdminText><AdminText textRole="footnote" style={styles.secondary}>{problem.slug} · {adminSystemComplexityLabel(problem.default_complexity, language)} · {problem.quote_ready ? labels.quoteReady : labels.notQuoteReady} · {problem.reference_count} {labels.references}</AdminText></View>
          {canManage ? <View style={styles.problemActions}><FinanceSecondaryButton label={labels.edit} onPress={() => editProblem(problem)} size="small" /><FinanceSecondaryButton disabled={!problem.is_active && !problem.quote_ready} label={problem.is_active ? labels.deactivate : labels.activate} onPress={() => toggleProblem(problem)} size="small" /></View> : null}
        </View>)}
      </Section>
      {canManage ? <View style={styles.actions}><FinanceSecondaryButton label={labels.editService} onPress={editService} /><KaelButton label={labels.addProblem} onPress={createProblem} variant="primary" /></View> : <AdminText textRole="footnote" style={styles.secondary}>{labels.readOnly}</AdminText>}
    </> : null}
    {draft && !editor.preview && !editor.receipt ? <>
      <Section title={editorTitle(draft.mode, labels)}>
        {draft.mode !== 'toggle' ? <>
          {draft.mode === 'create' ? <KaelTextField accessibilityLabel={labels.slug} autoCapitalize="none" label={labels.slug} onChangeText={(slug) => patchEditor({ draft: { ...draft, slug } })} value={draft.slug} /> : null}
          <KaelTextField accessibilityLabel={labels.labelVi} label={labels.labelVi} onChangeText={(labelVi) => patchEditor({ draft: { ...draft, labelVi } })} value={draft.labelVi} />
          <KaelTextField accessibilityLabel={labels.labelEn} label={labels.labelEn} onChangeText={(labelEn) => patchEditor({ draft: { ...draft, labelEn } })} value={draft.labelEn} />
          {draft.mode !== 'service' ? <><View style={adminSystemStyles.filterRow}>{(['small', 'medium', 'large'] as const).map((value) => <FinanceChoiceChip key={value} label={adminSystemComplexityLabel(value, language)} onPress={() => patchEditor({ draft: { ...draft, complexity: value } })} selected={draft.complexity === value} />)}</View><KaelTextField accessibilityLabel={labels.sortOrder} keyboardType="number-pad" label={labels.sortOrder} onChangeText={(sortOrder) => patchEditor({ draft: { ...draft, sortOrder } })} value={draft.sortOrder} /></> : null}
        </> : <AdminSystemState compact label={draft.problem?.is_active ? labels.deactivateWarning : labels.activateWarning} />}
        <KaelTextField accessibilityLabel={labels.reason} label={labels.reason} multiline onChangeText={(reason) => patchEditor({ reason })} value={editor.reason} />
      </Section>
      <ActionError label={editor.error} />
      <View style={styles.actions}><FinanceSecondaryButton label={labels.cancel} onPress={reset} /><KaelButton disabled={!editor.reason.trim() || !validDraft(draft) || editor.pending} label={labels.review} loading={editor.pending} onPress={() => { void review() }} variant="primary" /></View>
    </> : null}
    {editor.preview && !editor.receipt ? <>
      <Section title={labels.reviewTitle}><AdminSystemField label={labels.reason} value={editor.reason} /><AdminSystemField label={labels.activated} numeric value={String(editor.preview.impact.activated_problem_count)} /><AdminSystemField label={labels.deactivated} numeric value={String(editor.preview.impact.deactivated_problem_count)} /><AdminSystemField label={labels.affectedReferences} numeric value={String(editor.preview.impact.affected_reference_count)} />{editor.preview.issues.length ? <AdminSystemState compact label={editor.preview.issues.join(', ')} /> : null}</Section>
      <ActionError label={editor.error} />
      <View style={styles.actions}><FinanceSecondaryButton label={labels.backToEdit} onPress={() => patchEditor({ preview: null })} /><KaelButton disabled={!editor.preview.valid || editor.pending} label={labels.confirm} loading={editor.pending} onPress={() => { void confirm() }} variant="primary" /></View>
    </> : null}
    {editor.receipt ? <><AdminSystemState compact label={labels.receiptRecorded} /><Section title={labels.receipt}><AdminSystemField label={labels.eventId} value={editor.receipt.event_id} /><AdminSystemField label={labels.recordedAt} value={adminSystemFormatDate(editor.receipt.recorded_at, language)} /><AdminSystemField label={labels.newRevision} numeric value={String(editor.receipt.new_version)} /></Section><FinanceSecondaryButton label={labels.done} onPress={reset} /></> : null}
    {detail.error && record ? <AdminSystemState actionLabel={labels.retry} compact label={detail.error} onAction={detail.retry} /> : null}
  </AdminSystemDetailScroll>
}

function Section({ children, title }: { children: React.ReactNode; title: string }) { return <View style={styles.section}><AdminText textRole="headline" style={styles.strong}>{title}</AdminText><AdminSystemDivider />{children}</View> }
function ActionError({ label }: { label: string | null }) { return label ? <AdminText accessibilityRole="alert" textRole="footnote" style={styles.error}>{label}</AdminText> : null }
function serviceName(record: AdminSystemTaxonomyService, language: AppLanguage) { return language === 'vi' ? record.label_vi : record.label_en || adminSystemServiceLabel(record.service_type, language) }
function validDraft(draft: Draft) { if (draft.mode === 'toggle') return true; if (!draft.labelVi.trim() || !draft.labelEn.trim()) return false; if (draft.mode === 'create' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug.trim())) return false; return draft.mode === 'service' || Number.isInteger(Number(draft.sortOrder)) }
function editorTitle(mode: EditorMode, labels: typeof copy.vi | typeof copy.en) { return mode === 'service' ? labels.editService : mode === 'create' ? labels.addProblem : mode === 'problem' ? labels.editProblem : labels.changeStatus }

const copy = {
  vi: {
    activate: 'Kích hoạt', activateWarning: 'Problem chỉ được kích hoạt khi có baseline quote-ready; server sẽ kiểm tra lại trước khi lưu.', activated: 'Problem được kích hoạt', activeProblems: 'Problem đang áp dụng', addProblem: 'Thêm nhóm vấn đề', affectedReferences: 'Tham chiếu bị tác động', backToEdit: 'Quay lại chỉnh sửa', cancel: 'Hủy', changeStatus: 'Thay đổi trạng thái', chooseService: 'Chọn một dịch vụ để xem cấu trúc chi tiết.', confirm: 'Xác nhận', current: 'Dữ liệu hiện tại', deactivate: 'Ngừng áp dụng', deactivateWarning: 'Problem sẽ không còn xuất hiện trong luồng tạo việc mới; việc cũ vẫn giữ tham chiếu.', deactivated: 'Problem ngừng áp dụng', detailError: 'Không thể tải chi tiết cấu trúc dịch vụ.', done: 'Hoàn tất', edit: 'Chỉnh sửa', editProblem: 'Chỉnh nhóm vấn đề', editService: 'Chỉnh nhãn dịch vụ', empty: 'Chưa ghi nhận cấu trúc dịch vụ.', eventId: 'Mã sự kiện', history: 'Số revision đã ghi nhận', inactiveProblems: 'Problem ngừng áp dụng', labelEn: 'Nhãn tiếng Anh', labelVi: 'Nhãn tiếng Việt', loadError: 'Không thể tải cấu trúc dịch vụ.', loading: 'Đang tải cấu trúc dịch vụ…', loadingDetail: 'Đang tải chi tiết dịch vụ…', missingBaseline: 'Active nhưng thiếu baseline', newRevision: 'Revision mới', notQuoteReady: 'Chưa quote-ready', notRecorded: 'Chưa ghi nhận', partial: 'Dữ liệu một phần', problemStatus: 'Trạng thái problem', problems: 'Nhóm vấn đề', quoteReady: 'Quote-ready', readOnly: 'Bạn chỉ có quyền xem cấu trúc dịch vụ.', reason: 'Lý do thay đổi', receipt: 'Biên nhận quản trị', receiptRecorded: 'Thay đổi taxonomy đã được ghi nhận.', recordedAt: 'Thời điểm ghi nhận', references: 'tham chiếu', retry: 'Thử lại', review: 'Rà soát thay đổi', reviewTitle: 'Rà soát tác động', revision: 'Revision', saveError: 'Không thể lưu cấu trúc dịch vụ.', searchPlaceholder: 'Tìm dịch vụ hoặc nhóm vấn đề', serviceMetadata: 'Thông tin dịch vụ', services: 'Dịch vụ canonical', serviceType: 'Mã kỹ thuật service type', slug: 'Slug bất biến', sortOrder: 'Thứ tự hiển thị', statusValue: { all: 'Tất cả', active: 'Đang áp dụng', inactive: 'Ngừng áp dụng' }, validateError: 'Thay đổi taxonomy chưa hợp lệ.',
  },
  en: {
    activate: 'Activate', activateWarning: 'A problem can only be activated with a quote-ready baseline; the server validates this again before saving.', activated: 'Problems activated', activeProblems: 'Active problems', addProblem: 'Add problem', affectedReferences: 'Affected references', backToEdit: 'Back to edit', cancel: 'Cancel', changeStatus: 'Change status', chooseService: 'Select a service to inspect its taxonomy.', confirm: 'Confirm', current: 'Current data', deactivate: 'Deactivate', deactivateWarning: 'The problem will stop appearing in new-job flows; historical jobs keep their reference.', deactivated: 'Problems deactivated', detailError: 'Unable to load service taxonomy details.', done: 'Done', edit: 'Edit', editProblem: 'Edit problem', editService: 'Edit service labels', empty: 'No service taxonomy is recorded.', eventId: 'Event ID', history: 'Recorded revisions', inactiveProblems: 'Inactive problems', labelEn: 'English label', labelVi: 'Vietnamese label', loadError: 'Unable to load service taxonomy.', loading: 'Loading service taxonomy…', loadingDetail: 'Loading service details…', missingBaseline: 'Active without baseline', newRevision: 'New revision', notQuoteReady: 'Not quote-ready', notRecorded: 'Not recorded', partial: 'Partial data', problemStatus: 'Problem status', problems: 'Problems', quoteReady: 'Quote-ready', readOnly: 'You have read-only access to service taxonomy.', reason: 'Change reason', receipt: 'Administration receipt', receiptRecorded: 'The taxonomy change was recorded.', recordedAt: 'Recorded at', references: 'references', retry: 'Retry', review: 'Review change', reviewTitle: 'Review impact', revision: 'Revision', saveError: 'Unable to save service taxonomy.', searchPlaceholder: 'Search service or problem', serviceMetadata: 'Service metadata', services: 'Canonical services', serviceType: 'Technical service type', slug: 'Immutable slug', sortOrder: 'Sort order', statusValue: { all: 'All', active: 'Active', inactive: 'Inactive' }, validateError: 'The taxonomy change is invalid.',
  },
} as const

const styles = StyleSheet.create({
  actions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'flex-end' },
  error: { color: color.accent.destructive },
  filterGroup: { gap: spacing.sm },
  header: { gap: spacing.md, paddingBottom: spacing.md },
  meta: { color: color.text.muted, fontWeight: '600' },
  problemActions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  problemRow: { borderBottomColor: color.surface.stroke, borderBottomWidth: StyleSheet.hairlineWidth, gap: spacing.sm, paddingVertical: spacing.md },
  problemText: { flex: 1, gap: spacing.xs, minWidth: 0 },
  secondary: { color: color.text.secondary },
  section: { gap: spacing.sm },
  strong: { color: color.text.strong },
})
