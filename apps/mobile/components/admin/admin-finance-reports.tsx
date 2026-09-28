import { useCallback, useEffect, useEffectEvent, useReducer } from 'react'
import { Platform, Pressable, Share, StyleSheet, View } from 'react-native'

import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import { color, component, spacing, typography } from '@/design/theme'
import type {
  AdminFinancePeriodInput,
  AdminFinanceTaxPolicy,
  AdminFinanceTaxPolicyDraftInput,
  AdminFinanceTransaction,
  AdminFinanceTransactionDetailResponse,
} from '@/lib/api-types/admin'
import { generateClientRequestId } from '@/lib/client-request-id'
import { adminControlService } from '@/lib/services'
import { FinanceChoiceChip, FinanceSecondaryButton } from './admin-finance-controls'
import { AdminText } from './admin-text'

type CommonProps = {
  formatCurrency: (value: number | null) => string
  language: 'vi' | 'en'
  period: AdminFinancePeriodInput
}

type FinanceTaxReportsProps = Omit<CommonProps, 'formatCurrency'> & {
  canApproveTax: boolean
  canManageTax: boolean
  reduceMotion: boolean
  refreshKey: number
}

type TaxPolicyRuleForm = {
  basis: AdminFinanceTaxPolicy['basis']
  formKey: string
  ratePercent: string
  subject: AdminFinanceTaxPolicy['subject']
  taxType: string
  thresholdVnd: string
}

type FinanceTransactionsState = {
  cursor: string | null
  detail: AdminFinanceTransactionDetailResponse | null
  detailLoading: boolean
  error: string | null
  loading: boolean
  rows: AdminFinanceTransaction[]
}

type FinanceTransactionsPatch = Partial<FinanceTransactionsState> |
  ((current: FinanceTransactionsState) => Partial<FinanceTransactionsState>)

const initialFinanceTransactionsState: FinanceTransactionsState = {
  cursor: null,
  detail: null,
  detailLoading: false,
  error: null,
  loading: true,
  rows: [],
}

function financeTransactionsReducer(current: FinanceTransactionsState, next: FinanceTransactionsPatch) {
  return { ...current, ...(typeof next === 'function' ? next(current) : next) }
}

type TaxPolicyDraftForm = {
  effectiveFrom: string
  effectiveTo: string
  name: string
  rules: TaxPolicyRuleForm[]
  sourceReference: string
}

type TaxPolicyEditor =
  | { form: TaxPolicyDraftForm; kind: 'create' }
  | { form: TaxPolicyDraftForm; kind: 'edit'; policyId: string }
  | { approvalReference: string; kind: 'approve'; policyId: string }
  | { kind: 'retire'; policyId: string; reason: string }

type FinanceTaxReportsState = {
  editor: TaxPolicyEditor | null
  exporting: boolean
  generatedAt: string | null
  loading: boolean
  notice: string | null
  policies: AdminFinanceTaxPolicy[]
  policyError: boolean
  saving: boolean
}

type FinanceTaxReportsPatch = Partial<FinanceTaxReportsState> |
  ((current: FinanceTaxReportsState) => Partial<FinanceTaxReportsState>)

const initialFinanceTaxReportsState: FinanceTaxReportsState = {
  editor: null,
  exporting: false,
  generatedAt: null,
  loading: true,
  notice: null,
  policies: [],
  policyError: false,
  saving: false,
}

function financeTaxReportsReducer(
  current: FinanceTaxReportsState,
  next: FinanceTaxReportsPatch,
) {
  return { ...current, ...(typeof next === 'function' ? next(current) : next) }
}

const transactionDateFormatters = {
  en: new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }),
  vi: new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }),
}

const copy = {
  vi: {
    active: 'Đang hiệu lực',
    addRule: 'Thêm quy tắc',
    actionFailed: 'Chưa thể lưu thay đổi chính sách lúc này. Vui lòng thử lại.',
    approvalEvidence: 'Mã hồ sơ kế toán đã phê duyệt',
    approvalRequired: 'Cần mã hồ sơ kế toán trước khi duyệt.',
    approve: 'Duyệt chính sách',
    approved: 'Chính sách đã được duyệt.',
    awaitingOwner: 'Chờ Owner duyệt',
    basis: 'Cơ sở tính',
    back: 'Quay lại danh sách',
    cancel: 'Hủy',
    create: 'Tạo bản nháp',
    draftSaved: 'Bản nháp đã được lưu.',
    edit: 'Chỉnh sửa bản nháp',
    effectiveFrom: 'Ngày hiệu lực',
    effectiveTo: 'Ngày kết thúc (nếu có)',
    draft: 'Bản nháp',
    emptyPolicies: 'Chưa có chính sách thuế. Chưa có ước tính.',
    emptyTransactions: 'Không có giao dịch đã thanh toán trong kỳ này.',
    export: 'Xuất CSV đã che dữ liệu nhận dạng',
    exportFailed: 'Không thể tạo báo cáo CSV cho kỳ này.',
    exportReady: (count: number) => `Báo cáo CSV gồm ${count.toLocaleString('vi-VN')} dòng đã sẵn sàng.`,
    loading: 'Đang tải dữ liệu',
    loadMore: 'Tải thêm giao dịch',
    invalidDraft: 'Hãy nhập đủ tên, mã loại thuế, tỷ lệ, ngày hiệu lực và hồ sơ nguồn hợp lệ.',
    masked: 'Mã nhận dạng đã che',
    policies: 'Chính sách thuế',
    reports: 'Báo cáo',
    refundReview: 'Yêu cầu hoàn tiền đang được xem xét',
    refundReviewDetail: 'Chưa có quyết định duyệt hoàn tiền hoặc số tiền được duyệt. Giao dịch đã thanh toán vẫn được giữ nguyên.',
    refundRequired: 'Nghĩa vụ hoàn tiền đã được ghi nhận',
    refundAmount: 'Số tiền cần hoàn',
    refundPendingReceipt: 'Chưa có chứng từ hoàn tiền được xác minh. Chưa xác nhận đã chuyển tiền.',
    reportingDisclaimer: 'Số liệu phục vụ đối chiếu nội bộ, không phải tư vấn thuế.',
    generatedAt: 'Dữ liệu tạo lúc',
    retired: 'Đã ngừng',
    retire: 'Ngừng chính sách',
    retiredNotice: 'Chính sách đã được ngừng.',
    removeRule: 'Xóa quy tắc',
    retry: 'Thử lại',
    shareFailed: 'Báo cáo đã tạo nhưng không thể mở bảng chia sẻ trên thiết bị này.',
    taxPoliciesUnavailable: 'Chưa thể tải chính sách thuế lúc này.',
    taxType: 'Mã loại thuế',
    taxRate: 'Thuế suất (%)',
    taxRule: (index: number) => `Quy tắc ${index}`,
    transactions: 'Giao dịch trong kỳ',
    transactionDetail: 'Chi tiết giao dịch',
    transactionsUnavailable: 'Dữ liệu giao dịch chi tiết đang chờ đồng bộ.',
    unavailable: 'Chưa có dữ liệu',
    sourceReference: 'Hồ sơ nguồn',
    subject: 'Chủ thể chịu thuế',
    subjectPlatform: 'Nền tảng',
    subjectWorker: 'Thợ',
    retireReason: 'Lý do ngừng chính sách',
    version: 'Phiên bản',
  },
  en: {
    active: 'Active',
    addRule: 'Add rule',
    actionFailed: 'The policy change could not be saved right now. Please try again.',
    approvalEvidence: 'Approved accounting record reference',
    approvalRequired: 'An accounting record reference is required before approval.',
    approve: 'Approve policy',
    approved: 'The policy was approved.',
    awaitingOwner: 'Awaiting Owner approval',
    basis: 'Tax basis',
    back: 'Back to list',
    cancel: 'Cancel',
    create: 'Create draft',
    draftSaved: 'The draft was saved.',
    edit: 'Edit draft',
    effectiveFrom: 'Effective from',
    effectiveTo: 'Effective to (optional)',
    draft: 'Draft',
    emptyPolicies: 'No tax policy is configured. No estimate is available.',
    emptyTransactions: 'There are no paid transactions in this period.',
    export: 'Export CSV with masked identifiers',
    exportFailed: 'The CSV report could not be generated for this period.',
    exportReady: (count: number) => `A CSV report with ${count.toLocaleString('en-US')} rows is ready.`,
    loading: 'Loading data',
    loadMore: 'Load more transactions',
    invalidDraft: 'Enter a valid name, tax type, rate, effective date, and source record.',
    masked: 'Masked identifiers',
    policies: 'Tax policies',
    reports: 'Reports',
    refundReview: 'Refund request under review',
    refundReviewDetail: 'No refund or amount has been approved. The recorded payment remains unchanged.',
    refundRequired: 'Refund obligation recorded',
    refundAmount: 'Amount to return',
    refundPendingReceipt: 'No verified refund receipt is available. A completed transfer has not been confirmed.',
    reportingDisclaimer: 'Figures are for internal reconciliation and are not tax advice.',
    generatedAt: 'Data generated at',
    retired: 'Retired',
    retire: 'Retire policy',
    retiredNotice: 'The policy was retired.',
    removeRule: 'Remove rule',
    retry: 'Try again',
    shareFailed: 'The report was generated, but sharing is unavailable on this device.',
    taxPoliciesUnavailable: 'Tax policy data is unavailable right now.',
    taxType: 'Tax type code',
    taxRate: 'Tax rate (%)',
    taxRule: (index: number) => `Rule ${index}`,
    transactions: 'Transactions in period',
    transactionDetail: 'Transaction detail',
    transactionsUnavailable: 'Detailed transaction data is waiting to sync.',
    unavailable: 'No data',
    sourceReference: 'Source record',
    subject: 'Tax subject',
    subjectPlatform: 'Platform',
    subjectWorker: 'Worker',
    retireReason: 'Reason for retirement',
    version: 'Version',
  },
} as const

export function FinanceTransactionsPanel({ formatCurrency, language, period }: CommonProps) {
  const strings = copy[language]
  const [state, patch] = useReducer(financeTransactionsReducer, initialFinanceTransactionsState)
  const { cursor, detail, detailLoading, error, loading, rows } = state

  const load = useCallback(async (nextCursor?: string) => {
    patch({ error: null, loading: true })
    const result = await adminControlService.listFinanceTransactions({ ...period, cursor: nextCursor, limit: 25 })
    if (result.success) {
      patch((current) => ({
        cursor: result.data.next_cursor,
        loading: false,
        rows: nextCursor ? [...current.rows, ...result.data.transactions] : result.data.transactions,
      }))
    } else {
      patch({ error: result.error, loading: false })
    }
  }, [period])

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(() => {
      if (!cancelled) void load()
    })
    return () => {
      cancelled = true
    }
  }, [load])

  const openDetail = useCallback(async (row: AdminFinanceTransaction) => {
    patch({ detailLoading: true, error: null })
    const result = await adminControlService.getFinanceTransaction(row.job_id)
    patch(result.success
      ? { detail: result.data, detailLoading: false }
      : { detailLoading: false, error: result.error })
  }, [])

  if (detail) return <View style={styles.section} testID="admin-finance-transaction-detail">
    <Pressable accessibilityLabel={strings.back} accessibilityRole="button" onPress={() => patch({ detail: null })} style={styles.backRow}><AdminText textRole="headline" style={styles.backText}>‹ {strings.back}</AdminText></Pressable>
    <View style={styles.sectionHeader}><AdminText textRole="title2" style={styles.sectionTitle}>{strings.transactionDetail}</AdminText><AdminText textRole="footnote" style={styles.masked}>{strings.masked}</AdminText></View>
    <TransactionRow formatCurrency={formatCurrency} language={language} row={detail.transaction} />
    {detail.refund ? <View accessibilityLiveRegion="polite" style={styles.stateCard} testID="admin-finance-refund-summary">
      <AdminText accessibilityRole="header" textRole="headline" style={styles.sectionTitle}>
        {detail.refund.state === 'review_required' ? strings.refundReview : strings.refundRequired}
      </AdminText>
      {detail.refund.state === 'refund_required' && detail.refund.amount_vnd !== null ? <AdminText numeric textRole="headline" style={styles.amount} testID="admin-finance-refund-amount">
        {strings.refundAmount}: {formatCurrency(detail.refund.amount_vnd)}
      </AdminText> : null}
      <AdminText textRole="subheadline" style={styles.secondary}>
        {detail.refund.state === 'review_required' ? strings.refundReviewDetail : strings.refundPendingReceipt}
      </AdminText>
    </View> : null}
    <View style={styles.timeline}>
      {detail.timeline.map((event) => <View key={`${event.event_type}:${event.occurred_at}:${event.actor_ref ?? 'system'}`} style={styles.timelineRow}><View style={styles.timelineDot} /><View style={styles.timelineText}><AdminText textRole="headline" style={styles.rowTitle}>{event.event_type}</AdminText><AdminText numeric textRole="footnote" style={styles.secondary}>{event.occurred_at}{event.actor_ref ? ` · ${event.actor_ref}` : ''}</AdminText></View></View>)}
    </View>
  </View>

  return <View style={styles.section} testID="admin-finance-transactions">
    <View style={styles.sectionHeader}>
      <AdminText textRole="title2" style={styles.sectionTitle}>{strings.transactions}</AdminText>
      <AdminText textRole="footnote" style={styles.masked}>{strings.masked}</AdminText>
    </View>
    {error ? <View accessibilityRole="alert" style={styles.stateCard}><AdminText textRole="subheadline" style={styles.error}>{strings.transactionsUnavailable}</AdminText><FinanceSecondaryButton label={strings.retry} onPress={() => { void load() }} size="small" /></View>
      : !loading && rows.length === 0 ? <View style={styles.stateCard}><AdminText textRole="subheadline" style={styles.secondary}>{strings.emptyTransactions}</AdminText></View>
        : rows.map((row) => <TransactionRow formatCurrency={formatCurrency} key={row.job_id} language={language} onPress={() => { void openDetail(row) }} row={row} />)}
    {loading || detailLoading ? <AdminText textRole="subheadline" accessibilityLiveRegion="polite" style={styles.secondary}>{strings.loading}…</AdminText> : null}
    {cursor && !loading ? <FinanceSecondaryButton label={strings.loadMore} onPress={() => { void load(cursor) }} size="small" /> : null}
  </View>
}

export function FinanceTaxReportsPanel({ canApproveTax, canManageTax, language, period, refreshKey }: FinanceTaxReportsProps) {
  const strings = copy[language]
  const [state, patch] = useReducer(financeTaxReportsReducer, initialFinanceTaxReportsState)
  const { editor, exporting, generatedAt, loading, notice, policies, policyError, saving } = state

  const loadPolicies = useCallback(async () => {
    patch({ loading: true })
    const result = await adminControlService.listFinanceTaxPolicies()
    patch(result.success
      ? { generatedAt: result.data.generated_at, loading: false, policies: result.data.tax_policies, policyError: false }
      : { loading: false, policies: [], policyError: true })
  }, [])

  const loadPoliciesOnRefresh = useEffectEvent(loadPolicies)

  useEffect(() => {
    void loadPoliciesOnRefresh()
  }, [refreshKey])

  const exportCsv = useCallback(async () => {
    patch({ exporting: true, notice: null })
    const result = await adminControlService.exportFinanceCsv(period)
    if (!result.success) {
      patch({ exporting: false, notice: strings.exportFailed })
      return
    }
    try {
      await shareFinanceCsvFile(result.data.csv, result.data.filename)
      patch({ notice: strings.exportReady(result.data.row_count) })
    } catch {
      patch({ notice: strings.shareFailed })
    }
    patch({ exporting: false })
  }, [period, strings])

  const openDraftEditor = useCallback((policy?: AdminFinanceTaxPolicy) => {
    patch({ editor: policy
      ? { form: taxPolicyForm(policy), kind: 'edit', policyId: policy.id }
      : { form: emptyTaxPolicyForm(), kind: 'create' } })
  }, [])

  const updateDraftForm = useCallback((next: Partial<TaxPolicyDraftForm>) => {
    patch((current) => ({
      editor: isDraftEditor(current.editor)
        ? { ...current.editor, form: { ...current.editor.form, ...next } }
        : current.editor,
    }))
  }, [])

  const updateDraftRule = useCallback((index: number, next: Partial<TaxPolicyRuleForm>) => {
    patch((current) => ({
      editor: isDraftEditor(current.editor)
        ? {
          ...current.editor,
          form: {
            ...current.editor.form,
            rules: current.editor.form.rules.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, ...next } : rule),
          },
        }
        : current.editor,
    }))
  }, [])

  const addDraftRule = useCallback(() => {
    patch((current) => ({
      editor: isDraftEditor(current.editor) && current.editor.form.rules.length < 20
        ? { ...current.editor, form: { ...current.editor.form, rules: [...current.editor.form.rules, emptyTaxRuleForm()] } }
        : current.editor,
    }))
  }, [])

  const removeDraftRule = useCallback((index: number) => {
    patch((current) => ({
      editor: isDraftEditor(current.editor) && current.editor.form.rules.length > 1
        ? { ...current.editor, form: { ...current.editor.form, rules: current.editor.form.rules.filter((_, ruleIndex) => ruleIndex !== index) } }
        : current.editor,
    }))
  }, [])

  const updateEditor = useCallback((next: TaxPolicyEditor | null | ((current: TaxPolicyEditor | null) => TaxPolicyEditor | null)) => {
    patch((current) => ({
      editor: typeof next === 'function' ? next(current.editor) : next,
    }))
  }, [])

  const submitEditor = useCallback(async () => {
    if (!editor) return
    if (editor.kind === 'approve') {
      const approvalReference = editor.approvalReference.trim()
      if (!approvalReference) {
        patch({ notice: strings.approvalRequired })
        return
      }
      patch({ saving: true })
      const result = await adminControlService.approveFinanceTaxPolicy(editor.policyId, { accountant_approval_reference: approvalReference })
      if (result.success) {
        patch({ editor: null, notice: strings.approved })
        await loadPolicies()
      } else {
        patch({ notice: strings.actionFailed })
      }
      patch({ saving: false })
      return
    }
    if (editor.kind === 'retire') {
      const reason = editor.reason.trim()
      if (reason.length < 3) {
        patch({ notice: strings.actionFailed })
        return
      }
      patch({ saving: true })
      const result = await adminControlService.retireFinanceTaxPolicy(editor.policyId, { reason })
      if (result.success) {
        patch({ editor: null, notice: strings.retiredNotice })
        await loadPolicies()
      } else {
        patch({ notice: strings.actionFailed })
      }
      patch({ saving: false })
      return
    }

    const input = taxPolicyDraftInput(editor.form)
    if (!input) {
      patch({ notice: strings.invalidDraft })
      return
    }
    patch({ saving: true })
    const result = editor.kind === 'create'
      ? await adminControlService.createFinanceTaxPolicyDraft(input)
      : await adminControlService.updateFinanceTaxPolicyDraft(editor.policyId, input)
    if (result.success) {
      patch({ editor: null, notice: strings.draftSaved })
      await loadPolicies()
    } else {
      patch({ notice: strings.actionFailed })
    }
    patch({ saving: false })
  }, [editor, loadPolicies, strings])

  if (editor) return <View style={styles.section} testID="admin-finance-tax-reports">
    {notice ? <AdminText textRole="subheadline" accessibilityLiveRegion="polite" style={styles.secondary}>{notice}</AdminText> : null}
    <TaxPolicyEditorView
      onAddRule={addDraftRule}
      editor={editor}
      language={language}
      onClose={() => patch({ editor: null })}
      onRemoveRule={removeDraftRule}
      onUpdateDraft={updateDraftForm}
      onUpdateEditor={updateEditor}
      onUpdateRule={updateDraftRule}
      onSubmit={() => { void submitEditor() }}
      saving={saving}
    />
  </View>

  return <View style={styles.section} testID="admin-finance-tax-reports">
    <View style={styles.reportSurface}>
      <AdminText textRole="title2" style={styles.sectionTitle}>{strings.reports}</AdminText>
      <AdminText textRole="subheadline" style={styles.secondary}>{strings.reportingDisclaimer}</AdminText>
      {generatedAt ? <AdminText numeric textRole="footnote" style={styles.secondary}>{strings.generatedAt}: {generatedAt}</AdminText> : null}
      <FinanceSecondaryButton disabled={exporting} label={strings.export} onPress={() => { void exportCsv() }} testID="admin-finance-export-csv" />
    </View>
    <View style={styles.sectionHeader}>
      <AdminText textRole="title2" style={styles.sectionTitle}>{strings.policies}</AdminText>
      {canManageTax ? <FinanceSecondaryButton label={strings.create} onPress={() => openDraftEditor()} size="small" testID="admin-finance-tax-create" /> : null}
    </View>
    {notice ? <AdminText textRole="subheadline" accessibilityLiveRegion="polite" style={styles.secondary}>{notice}</AdminText> : null}
    {policyError ? <View accessibilityRole="alert" style={styles.stateCard}>
      <AdminText textRole="subheadline" style={styles.error}>{strings.taxPoliciesUnavailable}</AdminText>
      <FinanceSecondaryButton label={strings.retry} onPress={() => { void loadPolicies() }} size="small" testID="admin-finance-tax-retry" />
    </View> : null}
    {loading ? <AdminText textRole="subheadline" style={styles.secondary}>{strings.loading}…</AdminText>
      : policyError ? null
        : policies.length === 0 ? <View style={styles.stateCard}><AdminText textRole="subheadline" style={styles.secondary}>{strings.emptyPolicies}</AdminText></View>
        : policies.map((policy) => <View key={policy.id} style={styles.policyCard} testID={`admin-finance-tax-policy-${policy.id}`}>
          <View style={styles.sectionHeader}><AdminText textRole="headline" style={styles.rowTitle}>{policy.name}</AdminText><AdminText textRole="footnote" style={styles.status}>{policyStatus(policy, strings)}</AdminText></View>
          <AdminText numeric textRole="footnote" style={styles.secondary}>{strings.version} {policy.version} · {policy.rules.length.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US')} {language === 'vi' ? 'quy tắc' : 'rules'}</AdminText>
          {policy.rules.map((rule, index) => <AdminText key={rule.id} numeric textRole="footnote" style={styles.secondary}>{strings.taxRule(index + 1)} · {(rule.rate_bps / 100).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US')}% · {taxBasisLabel(rule.basis, language)}{rule.applies_at_or_above_vnd != null ? ` · ${language === 'vi' ? 'từ' : 'from'} ${rule.applies_at_or_above_vnd.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US')} VND` : ''}</AdminText>)}
          <AdminText textRole="footnote" style={styles.secondary}>{policy.effective_from}{policy.effective_to ? ` — ${policy.effective_to}` : ''}</AdminText>
          {canManageTax && policy.source_reference ? <AdminText textRole="footnote" style={styles.secondary}>{strings.sourceReference}: {policy.source_reference}</AdminText> : null}
          {canManageTax && policy.status === 'draft' ? <View style={styles.policyActions}>
            <FinanceSecondaryButton label={strings.edit} onPress={() => openDraftEditor(policy)} size="small" testID={`admin-finance-tax-edit-${policy.id}`} />
            {canApproveTax ? <KaelButton label={strings.approve} onPress={() => patch({ editor: { approvalReference: '', kind: 'approve', policyId: policy.id } })} size="small" testID={`admin-finance-tax-approve-${policy.id}`} /> : <AdminText textRole="footnote" style={styles.secondary}>{strings.awaitingOwner}</AdminText>}
          </View> : null}
          {canApproveTax && policy.status === 'approved' ? <FinanceSecondaryButton label={strings.retire} onPress={() => patch({ editor: { kind: 'retire', policyId: policy.id, reason: '' } })} size="small" testID={`admin-finance-tax-retire-${policy.id}`} /> : null}
        </View>)}
  </View>
}

async function shareFinanceCsvFile(csv: string, filename: string) {
  if (Platform.OS === 'web') {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
    return
  }
  const { File, Paths } = await import('expo-file-system')
  const file = new File(Paths.cache, filename)
  file.create({ overwrite: true })
  file.write(csv)
  await Share.share({ title: filename, url: file.uri })
}

function TaxPolicyEditorView({
  editor,
  language,
  onAddRule,
  onClose,
  onRemoveRule,
  onSubmit,
  onUpdateDraft,
  onUpdateEditor,
  onUpdateRule,
  saving,
}: {
  editor: TaxPolicyEditor | null
  language: 'vi' | 'en'
  onAddRule: () => void
  onClose: () => void
  onRemoveRule: (index: number) => void
  onSubmit: () => void
  onUpdateDraft: (next: Partial<TaxPolicyDraftForm>) => void
  onUpdateEditor: (next: TaxPolicyEditor | null | ((current: TaxPolicyEditor | null) => TaxPolicyEditor | null)) => void
  onUpdateRule: (index: number, next: Partial<TaxPolicyRuleForm>) => void
  saving: boolean
}) {
  const strings = copy[language]
  const isDraft = isDraftEditor(editor)
  const title = editor?.kind === 'approve' ? strings.approve
    : editor?.kind === 'retire' ? strings.retire
      : editor?.kind === 'edit' ? strings.edit
        : strings.create
  const submitLabel = editor?.kind === 'approve' ? strings.approve
    : editor?.kind === 'retire' ? strings.retire
      : strings.create

  if (!editor) return null
  return <View style={styles.editorSurface} testID="admin-finance-tax-editor">
        <AdminText textRole="title2" style={styles.modalTitle}>{title}</AdminText>
        <View style={styles.modalContent}>
          {isDraft ? <>
            <KaelTextField label={language === 'vi' ? 'Tên chính sách' : 'Policy name'} onChangeText={(name) => onUpdateDraft({ name })} testID="admin-finance-tax-form-name" value={editor.form.name} />
            {editor.form.rules.map((rule, index) => <View key={rule.formKey} style={styles.ruleSurface} testID={`admin-finance-tax-form-rule-${index}`}>
              <View style={styles.sectionHeader}><AdminText textRole="headline" style={styles.fieldLabel}>{strings.taxRule(index + 1)}</AdminText>{editor.form.rules.length > 1 ? <FinanceSecondaryButton label={strings.removeRule} onPress={() => onRemoveRule(index)} size="small" /> : null}</View>
              <KaelTextField autoCapitalize="none" label={strings.taxType} onChangeText={(taxType) => onUpdateRule(index, { taxType })} testID={index === 0 ? 'admin-finance-tax-form-type' : `admin-finance-tax-form-type-${index}`} value={rule.taxType} />
              <View style={styles.formSection}>
                <AdminText textRole="subheadline" style={styles.fieldLabel}>{strings.subject}</AdminText>
                <View style={styles.chipRow}>
                  <FinanceChoiceChip label={strings.subjectPlatform} onPress={() => onUpdateRule(index, { subject: 'platform' })} selected={rule.subject === 'platform'} testID={index === 0 ? 'admin-finance-tax-form-subject-platform' : `admin-finance-tax-form-subject-platform-${index}`} />
                  <FinanceChoiceChip label={strings.subjectWorker} onPress={() => onUpdateRule(index, { subject: 'worker' })} selected={rule.subject === 'worker'} testID={index === 0 ? 'admin-finance-tax-form-subject-worker' : `admin-finance-tax-form-subject-worker-${index}`} />
                </View>
              </View>
              <View style={styles.formSection}>
                <AdminText textRole="subheadline" style={styles.fieldLabel}>{strings.basis}</AdminText>
                <View style={styles.chipRow}>
                  {(['gmv', 'commission_collected', 'commission_retained', 'worker_net_paid', 'worker_bonus'] as const).map((basis) => <FinanceChoiceChip
                    key={basis}
                    label={taxBasisLabel(basis, language)}
                    onPress={() => onUpdateRule(index, { basis })}
                    selected={rule.basis === basis}
                    testID={index === 0 ? `admin-finance-tax-form-basis-${basis}` : `admin-finance-tax-form-basis-${basis}-${index}`}
                  />)}
                </View>
              </View>
              {rule.basis === 'worker_bonus' ? <KaelTextField keyboardType="number-pad" label={language === 'vi' ? 'Chỉ khấu trừ khi thưởng từ (VND, để trống nếu áp dụng mọi khoản)' : 'Withhold only at or above (VND, blank for every payout)'} onChangeText={(thresholdVnd) => onUpdateRule(index, { thresholdVnd: thresholdVnd.replace(/\D/g, '') })} testID={`admin-finance-tax-form-threshold-${index}`} value={rule.thresholdVnd} /> : null}
              <KaelTextField keyboardType="decimal-pad" label={strings.taxRate} onChangeText={(ratePercent) => onUpdateRule(index, { ratePercent })} testID={index === 0 ? 'admin-finance-tax-form-rate' : `admin-finance-tax-form-rate-${index}`} value={rule.ratePercent} />
            </View>)}
            <FinanceSecondaryButton label={strings.addRule} onPress={onAddRule} size="small" testID="admin-finance-tax-add-rule" />
            <KaelTextField autoCapitalize="none" label={strings.effectiveFrom} onChangeText={(effectiveFrom) => onUpdateDraft({ effectiveFrom })} placeholder="YYYY-MM-DD" testID="admin-finance-tax-form-effective-from" value={editor.form.effectiveFrom} />
            <KaelTextField autoCapitalize="none" label={strings.effectiveTo} onChangeText={(effectiveTo) => onUpdateDraft({ effectiveTo })} placeholder="YYYY-MM-DD" testID="admin-finance-tax-form-effective-to" value={editor.form.effectiveTo} />
            <KaelTextField autoCapitalize="none" label={strings.sourceReference} onChangeText={(sourceReference) => onUpdateDraft({ sourceReference })} testID="admin-finance-tax-form-source-reference" value={editor.form.sourceReference} />
          </> : editor?.kind === 'approve' ? <KaelTextField autoCapitalize="characters" label={strings.approvalEvidence} onChangeText={(approvalReference) => onUpdateEditor((current) => current?.kind === 'approve' ? { ...current, approvalReference } : current)} testID="admin-finance-tax-form-approval-reference" value={editor.approvalReference} />
            : editor?.kind === 'retire' ? <KaelTextField label={strings.retireReason} multiline onChangeText={(reason) => onUpdateEditor((current) => current?.kind === 'retire' ? { ...current, reason } : current)} testID="admin-finance-tax-form-retire-reason" value={editor.reason} />
              : null}
        </View>
        <View style={styles.modalActions}>
          <FinanceSecondaryButton label={strings.cancel} onPress={onClose} style={styles.modalAction} />
          <KaelButton label={submitLabel} loading={saving} onPress={onSubmit} style={styles.modalAction} testID="admin-finance-tax-editor-submit" />
        </View>
  </View>
}

function emptyTaxPolicyForm(): TaxPolicyDraftForm {
  return {
    effectiveFrom: '',
    effectiveTo: '',
    name: '',
    rules: [emptyTaxRuleForm()],
    sourceReference: '',
  }
}

function emptyTaxRuleForm(): TaxPolicyRuleForm {
  return { basis: 'commission_retained', formKey: generateClientRequestId(), ratePercent: '', subject: 'platform', taxType: '', thresholdVnd: '' }
}

function isDraftEditor(editor: TaxPolicyEditor | null): editor is Extract<TaxPolicyEditor, { kind: 'create' | 'edit' }> {
  return editor?.kind === 'create' || editor?.kind === 'edit'
}

function taxPolicyDraftInput(form: TaxPolicyDraftForm): AdminFinanceTaxPolicyDraftInput | null {
  const effectiveFrom = form.effectiveFrom.trim()
  const effectiveTo = form.effectiveTo.trim()
  const rules = form.rules.map((rule) => ({
    basis: rule.basis,
    rate_bps: Math.round(Number(rule.ratePercent.trim().replace(',', '.')) * 100),
    subject: rule.subject,
    tax_type: rule.taxType.trim(),
    ...(rule.basis === 'worker_bonus' && /^\d+$/.test(rule.thresholdVnd) ? { applies_at_or_above_vnd: Number(rule.thresholdVnd) } : {}),
  }))
  if (!form.name.trim() || !form.sourceReference.trim() || rules.length < 1 || rules.some((rule) => !rule.tax_type || !Number.isSafeInteger(rule.rate_bps) || rule.rate_bps < 1 || rule.rate_bps > 10_000) || !isIsoDate(effectiveFrom) || (effectiveTo && (!isIsoDate(effectiveTo) || effectiveTo < effectiveFrom))) return null
  return {
    effective_from: effectiveFrom,
    ...(effectiveTo ? { effective_to: effectiveTo } : {}),
    name: form.name.trim(),
    rules,
    source_reference: form.sourceReference.trim(),
  }
}

function taxPolicyForm(policy: AdminFinanceTaxPolicy): TaxPolicyDraftForm {
  return {
    effectiveFrom: policy.effective_from,
    effectiveTo: policy.effective_to ?? '',
    name: policy.name,
    rules: policy.rules.map((rule) => ({
      basis: rule.basis,
      formKey: generateClientRequestId(),
      ratePercent: String(rule.rate_bps / 100),
      subject: rule.subject,
      taxType: rule.tax_type,
      thresholdVnd: rule.applies_at_or_above_vnd == null ? '' : String(rule.applies_at_or_above_vnd),
    })),
    sourceReference: policy.source_reference ?? '',
  }
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function TransactionRow({ formatCurrency, language, onPress, row }: {
  formatCurrency: (value: number | null) => string
  language: 'vi' | 'en'
  onPress?: () => void
  row: AdminFinanceTransaction
}) {
  const date = row.paid_at ? transactionDateFormatters[language].format(new Date(row.paid_at)) : copy[language].unavailable
  const content = <>
    <View style={styles.sectionHeader}><AdminText textRole="headline" style={styles.rowTitle}>{row.display_code}</AdminText><AdminText textRole="footnote" style={styles.status}>{transactionStatusLabel(row.status, language)}</AdminText></View>
    <AdminText numeric textRole="headline" style={styles.amount}>{formatCurrency(row.gross_amount_vnd)}</AdminText>
    <AdminText textRole="footnote" style={styles.secondary}>{row.customer_ref}{row.worker_ref ? ` · ${row.worker_ref}` : ''} · {date}</AdminText>
  </>
  return onPress
    ? <Pressable accessibilityLabel={`${row.display_code}, ${formatCurrency(row.gross_amount_vnd)}`} accessibilityRole="button" onPress={onPress} style={styles.transactionCard} testID={`admin-finance-transaction-${row.job_id}`}>{content}</Pressable>
    : <View style={styles.transactionCard} testID={`admin-finance-transaction-${row.job_id}`}>{content}</View>
}

function policyStatus(policy: AdminFinanceTaxPolicy, strings: typeof copy.vi | typeof copy.en) {
  if (policy.status === 'draft') return strings.draft
  if (policy.status === 'retired') return strings.retired
  return strings.active
}

function taxBasisLabel(basis: AdminFinanceTaxPolicy['basis'], language: 'vi' | 'en') {
  const labels = {
    commission_collected: ['Hoa hồng đã thu', 'Commission collected'],
    commission_retained: ['Hoa hồng thực giữ', 'Commission retained'],
    gmv: ['Tổng giá trị giao dịch', 'Gross transaction value'],
    worker_net_paid: ['Thu nhập thợ đã chi', 'Worker net paid'],
    worker_bonus: ['Thưởng cho thợ', 'Worker bonus'],
  } as const
  return labels[basis][language === 'vi' ? 0 : 1]
}

function transactionStatusLabel(status: string, language: 'vi' | 'en') {
  if (status === 'paid') return language === 'vi' ? 'Đã thanh toán' : 'Paid'
  if (status === 'reviewed') return language === 'vi' ? 'Đã đánh giá' : 'Reviewed'
  return language === 'vi' ? 'Chưa ghi nhận' : 'Not recorded'
}

const styles = StyleSheet.create({
  amount: { ...typography.headline, color: color.text.strong, fontWeight: '600' },
  backRow: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  backText: { ...typography.headline, color: color.brand.primaryDark, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  error: { ...typography.subheadline, color: color.text.strong },
  fieldLabel: { ...typography.caption2, color: color.text.secondary, fontWeight: '600' },
  formSection: { gap: spacing.sm },
  masked: { ...typography.caption2, color: color.text.muted },
  modalAction: { flex: 1 },
  modalActions: { flexDirection: 'row', gap: spacing.sm },
  editorSurface: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, gap: spacing.lg, padding: spacing.lg, width: '100%' },
  modalContent: { gap: spacing.md },
  modalTitle: { ...typography.title2, color: color.text.strong, fontWeight: '600' },
  ruleSurface: { borderBottomColor: color.surface.stroke, borderBottomWidth: StyleSheet.hairlineWidth, gap: spacing.md, paddingBottom: spacing.lg },
  policyActions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  policyCard: { borderTopColor: color.surface.stroke, borderTopWidth: StyleSheet.hairlineWidth, gap: spacing.sm, paddingVertical: spacing.lg },
  reportSurface: { gap: spacing.md },
  rowTitle: { ...typography.subheadline, color: color.text.strong, flex: 1, fontWeight: '600' },
  secondary: { ...typography.caption2, color: color.text.secondary },
  section: { gap: spacing.md },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  sectionTitle: { ...typography.headline, color: color.text.strong, fontWeight: '600' },
  stateCard: { backgroundColor: color.surface.soft, borderRadius: component.card.radius, gap: spacing.md, padding: spacing.lg },
  status: { ...typography.caption2, color: color.brand.primary, fontWeight: '600' },
  transactionCard: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, gap: spacing.sm, padding: spacing.lg },
  timeline: { gap: spacing.md },
  timelineDot: { backgroundColor: color.brand.primary, borderRadius: 4, height: 8, marginTop: spacing.xs, width: 8 },
  timelineRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  timelineText: { flex: 1, gap: spacing.xs },
})
