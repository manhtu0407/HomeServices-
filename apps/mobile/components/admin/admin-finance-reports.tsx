import { useCallback, useEffect, useEffectEvent, useReducer, useState } from 'react'
import { Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native'

import { KaelButton, KaelChip, KaelTextField } from '@/components/ui/kael-primitives'
import { color, component, spacing, typography } from '@/design/theme'
import type {
  AdminFinancePeriodInput,
  AdminFinanceTaxPolicy,
  AdminFinanceTaxPolicyDraftInput,
  AdminFinanceTransaction,
} from '@/lib/api-types/admin'
import { adminControlService } from '@/lib/services'

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

type TaxPolicyDraftForm = {
  basis: AdminFinanceTaxPolicy['basis']
  effectiveFrom: string
  effectiveTo: string
  name: string
  ratePercent: string
  sourceReference: string
  subject: AdminFinanceTaxPolicy['subject']
  taxType: string
}

type TaxPolicyEditor =
  | { form: TaxPolicyDraftForm; kind: 'create' }
  | { form: TaxPolicyDraftForm; kind: 'edit'; policyId: string }
  | { approvalReference: string; kind: 'approve'; policyId: string }
  | { kind: 'retire'; policyId: string; reason: string }

type FinanceTaxReportsState = {
  editor: TaxPolicyEditor | null
  exporting: boolean
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
    actionFailed: 'Chưa thể lưu thay đổi chính sách lúc này. Vui lòng thử lại.',
    approvalEvidence: 'Mã hồ sơ kế toán đã phê duyệt',
    approvalRequired: 'Cần mã hồ sơ kế toán trước khi duyệt.',
    approve: 'Duyệt chính sách',
    approved: 'Chính sách đã được duyệt.',
    awaitingOwner: 'Chờ Owner duyệt',
    basis: 'Cơ sở tính',
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
    retired: 'Đã ngừng',
    retire: 'Ngừng chính sách',
    retiredNotice: 'Chính sách đã được ngừng.',
    retry: 'Thử lại',
    shareFailed: 'Báo cáo đã tạo nhưng không thể mở bảng chia sẻ trên thiết bị này.',
    taxPoliciesUnavailable: 'Chưa thể tải chính sách thuế lúc này.',
    taxType: 'Mã loại thuế',
    taxRate: 'Thuế suất (%)',
    transactions: 'Giao dịch trong kỳ',
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
    actionFailed: 'The policy change could not be saved right now. Please try again.',
    approvalEvidence: 'Approved accounting record reference',
    approvalRequired: 'An accounting record reference is required before approval.',
    approve: 'Approve policy',
    approved: 'The policy was approved.',
    awaitingOwner: 'Awaiting Owner approval',
    basis: 'Tax basis',
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
    retired: 'Retired',
    retire: 'Retire policy',
    retiredNotice: 'The policy was retired.',
    retry: 'Try again',
    shareFailed: 'The report was generated, but sharing is unavailable on this device.',
    taxPoliciesUnavailable: 'Tax policy data is unavailable right now.',
    taxType: 'Tax type code',
    taxRate: 'Tax rate (%)',
    transactions: 'Transactions in period',
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
  const [rows, setRows] = useState<AdminFinanceTransaction[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (nextCursor?: string) => {
    setLoading(true)
    setError(null)
    const result = await adminControlService.listFinanceTransactions({ ...period, cursor: nextCursor, limit: 25 })
    if (result.success) {
      setRows((current) => nextCursor ? [...current, ...result.data.transactions] : result.data.transactions)
      setCursor(result.data.next_cursor)
    } else {
      setError(result.error)
    }
    setLoading(false)
  }, [period])

  useEffect(() => {
    const timer = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(timer)
  }, [load])

  return <View style={styles.section} testID="admin-finance-transactions">
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{strings.transactions}</Text>
      <Text style={styles.masked}>{strings.masked}</Text>
    </View>
    {error ? <View accessibilityRole="alert" style={styles.stateCard}><Text style={styles.error}>{strings.transactionsUnavailable}</Text><KaelButton label={strings.retry} onPress={() => { void load() }} size="small" variant="secondary" /></View>
      : !loading && rows.length === 0 ? <View style={styles.stateCard}><Text style={styles.secondary}>{strings.emptyTransactions}</Text></View>
        : rows.map((row) => <TransactionRow formatCurrency={formatCurrency} key={row.job_id} language={language} row={row} />)}
    {loading ? <Text accessibilityLiveRegion="polite" style={styles.secondary}>{strings.loading}…</Text> : null}
    {cursor && !loading ? <KaelButton label={strings.loadMore} onPress={() => { void load(cursor) }} size="small" variant="secondary" /> : null}
  </View>
}

export function FinanceTaxReportsPanel({ canApproveTax, canManageTax, language, period, reduceMotion, refreshKey }: FinanceTaxReportsProps) {
  const strings = copy[language]
  const [state, patch] = useReducer(financeTaxReportsReducer, initialFinanceTaxReportsState)
  const { editor, exporting, loading, notice, policies, policyError, saving } = state

  const loadPolicies = useCallback(async () => {
    patch({ loading: true })
    const result = await adminControlService.listFinanceTaxPolicies()
    patch(result.success
      ? { loading: false, policies: result.data.tax_policies, policyError: false }
      : { loading: false, policies: [], policyError: true })
  }, [])

  const loadPoliciesOnRefresh = useEffectEvent(loadPolicies)

  useEffect(() => {
    const timer = setTimeout(() => { void loadPoliciesOnRefresh() }, 0)
    return () => clearTimeout(timer)
  }, [refreshKey])

  const exportCsv = useCallback(async () => {
    patch({ exporting: true, notice: null })
    const result = await adminControlService.exportFinanceCsv(period)
    if (!result.success) {
      patch({ exporting: false, notice: strings.exportFailed })
      return
    }
    try {
      await Share.share({ message: result.data.csv, title: result.data.filename })
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

  return <View style={styles.section} testID="admin-finance-tax-reports">
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{strings.policies}</Text>
      {canManageTax ? <KaelButton label={strings.create} onPress={() => openDraftEditor()} size="small" testID="admin-finance-tax-create" variant="secondary" /> : null}
    </View>
    {notice ? <Text accessibilityLiveRegion="polite" style={styles.secondary}>{notice}</Text> : null}
    {policyError ? <View accessibilityRole="alert" style={styles.stateCard}>
      <Text style={styles.error}>{strings.taxPoliciesUnavailable}</Text>
      <KaelButton label={strings.retry} onPress={() => { void loadPolicies() }} size="small" testID="admin-finance-tax-retry" variant="secondary" />
    </View> : null}
    {loading ? <Text style={styles.secondary}>{strings.loading}…</Text>
      : policyError ? null
        : policies.length === 0 ? <View style={styles.stateCard}><Text style={styles.secondary}>{strings.emptyPolicies}</Text></View>
        : policies.map((policy) => <View key={policy.id} style={styles.policyCard} testID={`admin-finance-tax-policy-${policy.id}`}>
          <View style={styles.sectionHeader}><Text style={styles.rowTitle}>{policy.name}</Text><Text style={styles.status}>{policyStatus(policy, strings)}</Text></View>
          <Text style={styles.secondary}>{strings.version} {policy.version} · {(policy.rate_bps / 100).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US')}% · {taxBasisLabel(policy.basis, language)}</Text>
          <Text style={styles.secondary}>{policy.effective_from}{policy.effective_to ? ` — ${policy.effective_to}` : ''}</Text>
          {canManageTax && policy.source_reference ? <Text style={styles.secondary}>{strings.sourceReference}: {policy.source_reference}</Text> : null}
          {canManageTax && policy.status === 'draft' ? <View style={styles.policyActions}>
            <KaelButton label={strings.edit} onPress={() => openDraftEditor(policy)} size="small" testID={`admin-finance-tax-edit-${policy.id}`} variant="secondary" />
            {canApproveTax ? <KaelButton label={strings.approve} onPress={() => patch({ editor: { approvalReference: '', kind: 'approve', policyId: policy.id } })} size="small" testID={`admin-finance-tax-approve-${policy.id}`} /> : <Text style={styles.secondary}>{strings.awaitingOwner}</Text>}
          </View> : null}
          {canApproveTax && policy.status === 'approved' ? <KaelButton label={strings.retire} onPress={() => patch({ editor: { kind: 'retire', policyId: policy.id, reason: '' } })} size="small" testID={`admin-finance-tax-retire-${policy.id}`} variant="secondary" /> : null}
        </View>)}
    <KaelButton disabled={exporting} label={strings.export} onPress={() => { void exportCsv() }} testID="admin-finance-export-csv" variant="secondary" />
    <TaxPolicyEditorModal
      editor={editor}
      language={language}
      onClose={() => patch({ editor: null })}
      onUpdateDraft={updateDraftForm}
      onUpdateEditor={updateEditor}
      onSubmit={() => { void submitEditor() }}
      reduceMotion={reduceMotion}
      saving={saving}
    />
  </View>
}

function TaxPolicyEditorModal({
  editor,
  language,
  onClose,
  onSubmit,
  onUpdateDraft,
  onUpdateEditor,
  reduceMotion,
  saving,
}: {
  editor: TaxPolicyEditor | null
  language: 'vi' | 'en'
  onClose: () => void
  onSubmit: () => void
  onUpdateDraft: (next: Partial<TaxPolicyDraftForm>) => void
  onUpdateEditor: (next: TaxPolicyEditor | null | ((current: TaxPolicyEditor | null) => TaxPolicyEditor | null)) => void
  reduceMotion: boolean
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

  return <Modal animationType={reduceMotion ? 'none' : 'fade'} transparent visible={editor !== null} onRequestClose={onClose}>
    <View style={styles.modalBackdrop}>
      <View accessibilityViewIsModal style={styles.modalCard} testID="admin-finance-tax-editor">
        <Text style={styles.modalTitle}>{title}</Text>
        <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
          {isDraft ? <>
            <KaelTextField label={language === 'vi' ? 'Tên chính sách' : 'Policy name'} onChangeText={(name) => onUpdateDraft({ name })} testID="admin-finance-tax-form-name" value={editor.form.name} />
            <KaelTextField autoCapitalize="none" label={strings.taxType} onChangeText={(taxType) => onUpdateDraft({ taxType })} testID="admin-finance-tax-form-type" value={editor.form.taxType} />
            <View style={styles.formSection}>
              <Text style={styles.fieldLabel}>{strings.subject}</Text>
              <View style={styles.chipRow}>
                <KaelChip accessibilityState={{ selected: editor.form.subject === 'platform' }} label={strings.subjectPlatform} onPress={() => onUpdateDraft({ subject: 'platform' })} testID="admin-finance-tax-form-subject-platform" variant={editor.form.subject === 'platform' ? 'selected' : 'unselected'} />
                <KaelChip accessibilityState={{ selected: editor.form.subject === 'worker' }} label={strings.subjectWorker} onPress={() => onUpdateDraft({ subject: 'worker' })} testID="admin-finance-tax-form-subject-worker" variant={editor.form.subject === 'worker' ? 'selected' : 'unselected'} />
              </View>
            </View>
            <View style={styles.formSection}>
              <Text style={styles.fieldLabel}>{strings.basis}</Text>
              <View style={styles.chipRow}>
                {(['gmv', 'commission_collected', 'commission_retained', 'worker_net_paid'] as const).map((basis) => <KaelChip
                  accessibilityState={{ selected: editor.form.basis === basis }}
                  key={basis}
                  label={taxBasisLabel(basis, language)}
                  onPress={() => onUpdateDraft({ basis })}
                  testID={`admin-finance-tax-form-basis-${basis}`}
                  variant={editor.form.basis === basis ? 'selected' : 'unselected'}
                />)}
              </View>
            </View>
            <KaelTextField keyboardType="decimal-pad" label={strings.taxRate} onChangeText={(ratePercent) => onUpdateDraft({ ratePercent })} testID="admin-finance-tax-form-rate" value={editor.form.ratePercent} />
            <KaelTextField autoCapitalize="none" label={strings.effectiveFrom} onChangeText={(effectiveFrom) => onUpdateDraft({ effectiveFrom })} placeholder="YYYY-MM-DD" testID="admin-finance-tax-form-effective-from" value={editor.form.effectiveFrom} />
            <KaelTextField autoCapitalize="none" label={strings.effectiveTo} onChangeText={(effectiveTo) => onUpdateDraft({ effectiveTo })} placeholder="YYYY-MM-DD" testID="admin-finance-tax-form-effective-to" value={editor.form.effectiveTo} />
            <KaelTextField autoCapitalize="none" label={strings.sourceReference} onChangeText={(sourceReference) => onUpdateDraft({ sourceReference })} testID="admin-finance-tax-form-source-reference" value={editor.form.sourceReference} />
          </> : editor?.kind === 'approve' ? <KaelTextField autoCapitalize="characters" label={strings.approvalEvidence} onChangeText={(approvalReference) => onUpdateEditor((current) => current?.kind === 'approve' ? { ...current, approvalReference } : current)} testID="admin-finance-tax-form-approval-reference" value={editor.approvalReference} />
            : editor?.kind === 'retire' ? <KaelTextField label={strings.retireReason} multiline onChangeText={(reason) => onUpdateEditor((current) => current?.kind === 'retire' ? { ...current, reason } : current)} testID="admin-finance-tax-form-retire-reason" value={editor.reason} />
              : null}
        </ScrollView>
        <View style={styles.modalActions}>
          <KaelButton label={strings.cancel} onPress={onClose} style={styles.modalAction} variant="secondary" />
          <KaelButton label={submitLabel} loading={saving} onPress={onSubmit} style={styles.modalAction} testID="admin-finance-tax-editor-submit" />
        </View>
      </View>
    </View>
  </Modal>
}

function emptyTaxPolicyForm(): TaxPolicyDraftForm {
  return {
    basis: 'commission_retained',
    effectiveFrom: '',
    effectiveTo: '',
    name: '',
    ratePercent: '',
    sourceReference: '',
    subject: 'platform',
    taxType: '',
  }
}

function isDraftEditor(editor: TaxPolicyEditor | null): editor is Extract<TaxPolicyEditor, { kind: 'create' | 'edit' }> {
  return editor?.kind === 'create' || editor?.kind === 'edit'
}

function taxPolicyDraftInput(form: TaxPolicyDraftForm): AdminFinanceTaxPolicyDraftInput | null {
  const effectiveFrom = form.effectiveFrom.trim()
  const effectiveTo = form.effectiveTo.trim()
  const rateBps = Math.round(Number(form.ratePercent.trim().replace(',', '.')) * 100)
  if (!form.name.trim() || !form.taxType.trim() || !form.sourceReference.trim() || !isIsoDate(effectiveFrom) || (effectiveTo && (!isIsoDate(effectiveTo) || effectiveTo < effectiveFrom)) || !Number.isSafeInteger(rateBps) || rateBps < 1 || rateBps > 10_000) return null
  return {
    basis: form.basis,
    effective_from: effectiveFrom,
    ...(effectiveTo ? { effective_to: effectiveTo } : {}),
    name: form.name.trim(),
    rate_bps: rateBps,
    source_reference: form.sourceReference.trim(),
    subject: form.subject,
    tax_type: form.taxType.trim(),
  }
}

function taxPolicyForm(policy: AdminFinanceTaxPolicy): TaxPolicyDraftForm {
  return {
    basis: policy.basis,
    effectiveFrom: policy.effective_from,
    effectiveTo: policy.effective_to ?? '',
    name: policy.name,
    ratePercent: String(policy.rate_bps / 100),
    sourceReference: policy.source_reference ?? '',
    subject: policy.subject,
    taxType: policy.tax_type,
  }
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function TransactionRow({ formatCurrency, language, row }: {
  formatCurrency: (value: number | null) => string
  language: 'vi' | 'en'
  row: AdminFinanceTransaction
}) {
  const date = row.paid_at ? transactionDateFormatters[language].format(new Date(row.paid_at)) : copy[language].unavailable
  return <Pressable accessibilityLabel={`${row.display_code}, ${formatCurrency(row.gross_amount_vnd)}`} accessibilityRole="button" style={styles.transactionCard} testID={`admin-finance-transaction-${row.job_id}`}>
    <View style={styles.sectionHeader}><Text style={styles.rowTitle}>{row.display_code}</Text><Text style={styles.status}>{transactionStatusLabel(row.status, language)}</Text></View>
    <Text style={styles.amount}>{formatCurrency(row.gross_amount_vnd)}</Text>
    <Text style={styles.secondary}>{row.customer_ref}{row.worker_ref ? ` · ${row.worker_ref}` : ''} · {date}</Text>
  </Pressable>
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  error: { ...typography.subheadline, color: color.text.strong },
  fieldLabel: { ...typography.caption2, color: color.text.secondary, fontWeight: '600' },
  formSection: { gap: spacing.sm },
  masked: { ...typography.caption2, color: color.text.muted },
  modalAction: { flex: 1 },
  modalActions: { flexDirection: 'row', gap: spacing.sm },
  modalBackdrop: { alignItems: 'center', backgroundColor: 'rgba(15, 48, 47, 0.36)', flex: 1, justifyContent: 'center', padding: spacing.lg },
  modalCard: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.largeRadius, borderWidth: 1, gap: spacing.lg, maxHeight: '88%', maxWidth: 560, padding: spacing.xl, width: '100%' },
  modalContent: { gap: spacing.md },
  modalTitle: { ...typography.title2, color: color.text.strong, fontWeight: '600' },
  policyActions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  policyCard: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, gap: spacing.sm, padding: spacing.lg },
  rowTitle: { ...typography.subheadline, color: color.text.strong, flex: 1, fontWeight: '600' },
  secondary: { ...typography.caption2, color: color.text.secondary },
  section: { gap: spacing.md },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  sectionTitle: { ...typography.headline, color: color.text.strong, fontWeight: '600' },
  stateCard: { backgroundColor: color.surface.soft, borderRadius: component.card.radius, gap: spacing.md, padding: spacing.lg },
  status: { ...typography.caption2, color: color.brand.primary, fontWeight: '600' },
  transactionCard: { backgroundColor: color.surface.base, borderColor: color.surface.stroke, borderRadius: component.card.radius, borderWidth: 1, gap: spacing.sm, padding: spacing.lg },
})
