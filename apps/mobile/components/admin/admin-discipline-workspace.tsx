import { useCallback, useEffect, useState } from 'react'
import { FlatList, Linking, StyleSheet, View } from 'react-native'

import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import { color, spacing } from '@/design/theme'
import type {
  AdminAppealDecision,
  AdminCompensationNegotiation,
  AdminIdentityBlock,
  AdminViolationCaseDetail,
  AdminViolationCaseSummary,
  AdminViolationDecision,
} from '@/lib/api-types/admin-program'
import type { AppLanguage } from '@/lib/app-language'
import { adminProgramService } from '@/lib/services/admin-program-service'

import { consequenceLabel, violationLabel } from '../worker/discipline/violation-copy'
import { AdminCompensationDetail, compensationStatusLabel } from './admin-compensation-panel'
import { AdminFilterChips, AdminSegmentedControl } from './admin-segmented-control'
import {
  AdminSystemDetailHeader,
  AdminSystemDetailScroll,
  AdminSystemField,
  AdminSystemRow,
  AdminSystemState,
  AdminSystemWorkspaceLayout,
} from './admin-system-controls'
import { adminSystemStyles } from './admin-system-styles'
import { AdminText } from './admin-text'

type QueueFilter = 'open' | 'confirmed' | 'dismissed' | 'fabricated_report'
type Tab = 'cases' | 'blocklist' | 'compensation'
type ListKey = QueueFilter | 'blocklist' | 'compensation'

const LIST_KEYS: readonly ListKey[] = ['open', 'confirmed', 'dismissed', 'fabricated_report', 'blocklist', 'compensation']

const MIN_REASON = 10

function formatDate(value: string | null, language: AppLanguage) {
  if (!value) return '—'
  return new Date(value).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function blockKindLabel(kind: AdminIdentityBlock['kind'], vi: boolean) {
  if (kind === 'cccd') return vi ? 'Số CCCD (đã mã hóa)' : 'ID number (encoded)'
  if (kind === 'email') return vi ? 'Email đăng nhập (đã mã hóa)' : 'Sign-in email (encoded)'
  return vi ? 'Số điện thoại (đã mã hóa)' : 'Phone (encoded)'
}

function statusLabel(item: AdminViolationCaseSummary, vi: boolean) {
  if (item.appeal_status === 'submitted') return vi ? 'Có khiếu nại chờ xét' : 'Appeal waiting'
  if (item.appeal_status === 'overturned') return vi ? 'Đã minh oan' : 'Cleared'
  if (item.appeal_status === 'upheld') return vi ? 'Giữ nguyên sau khiếu nại' : 'Upheld'
  switch (item.status) {
    case 'proposed': return item.suspended_pending_review ? (vi ? 'Chờ xác minh · đã tạm ngừng' : 'Pending · suspended') : (vi ? 'Chờ xác minh' : 'Pending review')
    case 'confirmed': return vi ? 'Đã xác nhận' : 'Confirmed'
    case 'dismissed': return vi ? 'Đã bác bỏ' : 'Dismissed'
    case 'fabricated_report': return vi ? 'Báo cáo bịa đặt' : 'Fabricated report'
  }
}

export function AdminDisciplineWorkspace({ language }: { language: AppLanguage }) {
  const vi = language === 'vi'
  const [tab, setTab] = useState<Tab>('cases')
  const [filter, setFilter] = useState<QueueFilter>('open')
  const [casesByFilter, setCasesByFilter] = useState<Partial<Record<QueueFilter, AdminViolationCaseSummary[]>>>({})
  const [blocks, setBlocks] = useState<AdminIdentityBlock[] | null>(null)
  const [compensation, setCompensation] = useState<AdminCompensationNegotiation[] | null>(null)
  const [errors, setErrors] = useState<Partial<Record<ListKey, string>>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const cases = casesByFilter[filter] ?? null
  const activeKey: ListKey = tab === 'cases' ? filter : tab
  const error = errors[activeKey] ?? null

  // A list is never cleared before it is refetched: switching chips shows what was already
  // loaded at once and refreshes it quietly, instead of flashing a loading state each time.
  const refresh = useCallback(async (key: ListKey) => {
    const fail = (message: string) => setErrors((current) => ({ ...current, [key]: message }))
    const clear = () => setErrors((current) => ({ ...current, [key]: undefined }))
    if (key === 'compensation') {
      const result = await adminProgramService.listCompensation()
      if (result.success) { setCompensation(result.data.negotiations); clear() }
      else fail(result.error || (vi ? 'Chưa tải được danh sách bồi thường' : 'Could not load compensation'))
    } else if (key === 'blocklist') {
      const result = await adminProgramService.listIdentityBlocks()
      if (result.success) { setBlocks(result.data.blocks); clear() }
      else fail(result.error || (vi ? 'Chưa tải được danh sách chặn' : 'Could not load the blocklist'))
    } else {
      const result = await adminProgramService.listViolationCases(key === 'open' ? null : key)
      if (result.success) { setCasesByFilter((current) => ({ ...current, [key]: result.data.cases })); clear() }
      else fail(result.error || (vi ? 'Chưa tải được hàng đợi vi phạm' : 'Could not load the violation queue'))
    }
  }, [vi])

  const refreshAll = useCallback(() => {
    for (const key of LIST_KEYS) void refresh(key)
  }, [refresh])

  useEffect(() => {
    refreshAll()
  }, [refreshAll])

  const load = () => void refresh(activeKey)
  const select = (next: () => void, key: ListKey) => {
    next()
    setSelectedId(null)
    void refresh(key)
  }

  const caseCount = (key: QueueFilter) => casesByFilter[key]?.length ?? null
  const header = <View style={styles.header}>
    <AdminSegmentedControl
      onChange={(next: Tab) => select(() => setTab(next), next === 'cases' ? filter : next)}
      options={[
        { value: 'cases', label: vi ? 'Vi phạm' : 'Cases' },
        { value: 'blocklist', label: vi ? 'Bị chặn' : 'Blocked' },
        { value: 'compensation', label: vi ? 'Bồi thường' : 'Compensation' },
      ]}
      testID="admin-discipline-tabs"
      value={tab}
    />
    {tab === 'cases' ? <AdminFilterChips
      onChange={(next: QueueFilter) => select(() => setFilter(next), next)}
      options={[
        { value: 'open', label: vi ? 'Cần xử lý' : 'Needs action', count: caseCount('open') },
        { value: 'confirmed', label: vi ? 'Đã xác nhận' : 'Confirmed', count: caseCount('confirmed') },
        { value: 'dismissed', label: vi ? 'Đã bác bỏ' : 'Dismissed', count: caseCount('dismissed') },
        { value: 'fabricated_report', label: vi ? 'Bịa đặt' : 'Fabricated', count: caseCount('fabricated_report') },
      ]}
      testID="admin-discipline-filters"
      value={filter}
    /> : null}
    <AdminText textRole="caption1" style={styles.meta}>
      {vi ? 'Hệ thống chỉ đề xuất. Không có hình phạt nào được áp dụng khi chưa có quyết định của quản trị viên.' : 'The system only proposes. No penalty applies until an administrator decides.'}
    </AdminText>
  </View>

  const list = tab === 'cases'
    ? <FlatList
      contentContainerStyle={adminSystemStyles.listContent}
      data={cases ?? []}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={cases === null && !error ? <AdminSystemState label={vi ? 'Đang tải' : 'Loading'} loading /> : error ? <AdminSystemState actionLabel={vi ? 'Thử lại' : 'Retry'} label={error} onAction={load} /> : <AdminSystemState compact label={vi ? 'Không có hồ sơ nào' : 'No cases'} />}
      ListHeaderComponent={header}
      renderItem={({ item }) => <AdminSystemRow
        accessibilityLabel={`${violationLabel(item.violation_code, language)}. ${statusLabel(item, vi)}`}
        aside={vi ? `Cấp ${item.level}` : `Level ${item.level}`}
        id={item.id}
        meta={`${item.worker_name ?? item.worker_id} · ${statusLabel(item, vi)} · ${formatDate(item.created_at, language)}`}
        onPress={setSelectedId}
        selected={selectedId === item.id}
        title={violationLabel(item.violation_code, language)}
      />}
      showsVerticalScrollIndicator={false}
      style={adminSystemStyles.list}
      testID="admin-discipline-cases"
    />
    : tab === 'compensation'
    ? <FlatList
      contentContainerStyle={adminSystemStyles.listContent}
      data={compensation ?? []}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={compensation === null && !error ? <AdminSystemState label={vi ? 'Đang tải' : 'Loading'} loading /> : error ? <AdminSystemState actionLabel={vi ? 'Thử lại' : 'Retry'} label={error} onAction={load} /> : <AdminSystemState compact label={vi ? 'Chưa có đề nghị bồi thường nào' : 'No compensation requests'} />}
      ListHeaderComponent={header}
      renderItem={({ item }) => <AdminSystemRow
        accessibilityLabel={`${violationLabel(item.violation_code, language)}. ${compensationStatusLabel(item, vi)}`}
        aside={compensationStatusLabel(item, vi)}
        id={item.id}
        meta={`${item.customer_name ?? '—'} → ${item.worker_name ?? item.worker_id}`}
        onPress={setSelectedId}
        selected={selectedId === item.id}
        title={violationLabel(item.violation_code, language)}
      />}
      showsVerticalScrollIndicator={false}
      style={adminSystemStyles.list}
      testID="admin-discipline-compensation"
    />
    : <FlatList
      contentContainerStyle={adminSystemStyles.listContent}
      data={blocks ?? []}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={blocks === null && !error ? <AdminSystemState label={vi ? 'Đang tải' : 'Loading'} loading /> : error ? <AdminSystemState actionLabel={vi ? 'Thử lại' : 'Retry'} label={error} onAction={load} /> : <AdminSystemState compact label={vi ? 'Danh sách chặn trống' : 'The blocklist is empty'} />}
      ListHeaderComponent={header}
      renderItem={({ item }) => <AdminSystemRow
        accessibilityLabel={item.kind}
        aside={item.lifted_at ? (vi ? 'Đã gỡ' : 'Lifted') : (vi ? 'Đang chặn' : 'Active')}
        id={item.id}
        meta={formatDate(item.created_at, language)}
        onPress={setSelectedId}
        selected={selectedId === item.id}
        title={blockKindLabel(item.kind, vi)}
      />}
      showsVerticalScrollIndicator={false}
      style={adminSystemStyles.list}
      testID="admin-discipline-blocklist"
    />

  const selectedCompensation = tab === 'compensation' ? (compensation ?? []).find((item) => item.id === selectedId) ?? null : null
  const detail = !selectedId ? null : tab === 'cases'
    ? <CaseDetail caseId={selectedId} key={selectedId} language={language} onBack={() => setSelectedId(null)} onChanged={refreshAll} />
    : tab === 'compensation'
    ? selectedCompensation ? <AdminCompensationDetail item={selectedCompensation} key={selectedId} language={language} onBack={() => setSelectedId(null)} onChanged={refreshAll} /> : null
    : <BlockDetail block={(blocks ?? []).find((item) => item.id === selectedId) ?? null} language={language} onBack={() => setSelectedId(null)} onChanged={refreshAll} />

  return <AdminSystemWorkspaceLayout detail={detail} emptyDetailLabel={vi ? 'Chọn một mục để xem chi tiết' : 'Choose an item to see details'} list={list} selected={Boolean(selectedId)} />
}

function CaseDetail({ caseId, language, onBack, onChanged }: { caseId: string; language: AppLanguage; onBack: () => void; onChanged: () => void }) {
  const vi = language === 'vi'
  const [detail, setDetail] = useState<AdminViolationCaseDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [clawback, setClawback] = useState('')
  const [authorityRef, setAuthorityRef] = useState('')
  const [holdDays, setHoldDays] = useState('90')
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    const result = await adminProgramService.getViolationCase(caseId)
    if (result.success && result.data.id === caseId) setDetail(result.data)
    else setError((!result.success && result.error) || (vi ? 'Chưa tải được hồ sơ' : 'Could not load the case'))
  }, [caseId, vi])

  useEffect(() => {
    void load()
  }, [load])

  const run = async (action: () => Promise<{ success: boolean; error?: string }>, done: string) => {
    if (pending) return
    setPending(true)
    setNotice(null)
    const result = await action()
    setPending(false)
    if (!result.success) {
      setNotice(result.error || (vi ? 'Chưa ghi được quyết định' : 'Could not record the decision'))
      return
    }
    setNotice(done)
    setReason('')
    setAuthorityRef('')
    await load()
    onChanged()
  }

  if (!detail) return error
    ? <AdminSystemState actionLabel={vi ? 'Thử lại' : 'Retry'} label={error} onAction={load} />
    : <AdminSystemState label={vi ? 'Đang tải' : 'Loading'} loading />

  const reasonReady = reason.trim().length >= MIN_REASON
  // A written reason belongs only to a decision still to be made.
  const needsReason = detail.status === 'proposed' || detail.appeal_status === 'submitted'
  const decide = (decision: AdminViolationDecision) => run(
    () => adminProgramService.decideViolationCase(caseId, {
      decision,
      reason: reason.trim(),
      ...(decision === 'confirm' && detail.level === 4 && Number(clawback) > 0 ? { clawback_vnd: Math.round(Number(clawback)) } : {}),
    }),
    vi ? 'Đã ghi quyết định' : 'Decision recorded',
  )
  const decideAppeal = (decision: AdminAppealDecision) => run(
    () => adminProgramService.decideAppeal(caseId, { decision, reason: reason.trim() }),
    vi ? 'Đã ghi quyết định khiếu nại' : 'Appeal decision recorded',
  )
  const holdLive = detail.level === 5 && detail.status === 'confirmed' && detail.appeal_status !== 'overturned'
    && detail.consequences.some((item) => item.entry_kind === 'withdrawal_hold' && !item.restored)
  const days = Number(holdDays)
  const holdReady = authorityRef.trim().length >= 3 && Number.isInteger(days) && days >= 1 && days <= 365
  const extendHold = () => run(
    () => adminProgramService.extendWithdrawalHold(caseId, {
      authority_reference: authorityRef.trim(),
      hold_until: new Date(Date.now() + days * 86_400_000).toISOString(),
    }),
    vi ? 'Đã gia hạn tạm giữ rút tiền' : 'Withdrawal hold extended',
  )

  return <AdminSystemDetailScroll>
    <AdminSystemDetailHeader
      language={language}
      onBack={onBack}
      subtitle={`${vi ? 'Cấp' : 'Level'} ${detail.level} · ${statusLabel(detail, vi)}`}
      title={violationLabel(detail.violation_code, language)}
    />
    <AdminSystemField label={vi ? 'Thợ' : 'Worker'} value={detail.worker_name ?? detail.worker_id} />
    <AdminSystemField label={vi ? 'Nguồn' : 'Source'} value={detail.source === 'customer_report' ? (vi ? 'Khách báo cáo' : 'Customer report') : detail.source === 'detector' ? (vi ? 'Hệ thống phát hiện' : 'Detector') : (vi ? 'Quản trị viên' : 'Administrator')} />
    {detail.statement ? <AdminSystemField label={vi ? 'Lời khai' : 'Statement'} value={detail.statement} /> : null}
    <AdminSystemField label={vi ? 'Hạn quyết định' : 'Decision deadline'} value={formatDate(detail.decision_deadline_at, language)} />
    <AdminSystemField label={vi ? 'Đã ghi CCCD' : 'ID on record'} value={detail.identity_recorded ? (vi ? 'Có' : 'Yes') : (vi ? 'Chưa' : 'No')} />
    {Object.keys(detail.evidence).length > 0 ? <AdminSystemField label={vi ? 'Dữ liệu phát hiện' : 'Detector data'} value={JSON.stringify(detail.evidence)} /> : null}
    {detail.chat_evidence.map((item, index) => <AdminSystemField key={`chat-${index}`} label={`${vi ? 'Tin nhắn bị che' : 'Redacted message'} · ${formatDate(item.created_at, language)}`} value={item.original_body} />)}
    {detail.consequences.map((item, index) => <AdminSystemField key={`c-${index}`} label={vi ? 'Hậu quả' : 'Consequence'} value={`${consequenceLabel(item.entry_kind, language)}${item.effective_until ? ` · ${vi ? 'đến' : 'until'} ${formatDate(item.effective_until, language)}` : ''}${item.restored ? (vi ? ' · đã khôi phục' : ' · restored') : ''}`} />)}
    {detail.appeal ? <>
      <AdminSystemField label={vi ? 'Khiếu nại của thợ' : 'Worker appeal'} value={detail.appeal.reason} />
      {detail.appeal.evidence.map((item, index) => item.signed_url
        ? <KaelButton key={item.path} label={`${vi ? 'Mở bằng chứng' : 'Open evidence'} ${index + 1}`} onPress={() => { void Linking.openURL(item.signed_url as string) }} variant="secondary" />
        : null)}
    </> : null}

    {needsReason ? <KaelTextField
      accessibilityLabel={vi ? 'Lý do quyết định' : 'Decision reason'}
      multiline
      onChangeText={setReason}
      placeholder={vi ? 'Lý do (thợ sẽ thấy lý do này)' : 'Reason (the worker will see it)'}
      placeholderTextColor={color.text.muted}
      testID="admin-discipline-reason"
      value={reason}
    /> : null}
    {detail.status === 'proposed' ? <View style={styles.actions}>
      {detail.level === 4 ? <KaelTextField
        accessibilityLabel={vi ? 'Số tiền thưởng thu hồi (VND)' : 'Bonus clawback (VND)'}
        keyboardType="number-pad"
        onChangeText={(value) => setClawback(value.replace(/\D/g, ''))}
        placeholder={vi ? 'Thu hồi thưởng chưa rút (VND, không bắt buộc)' : 'Clawback of un-withdrawn bonus (VND, optional)'}
        placeholderTextColor={color.text.muted}
        value={clawback}
      /> : null}
      <KaelButton disabled={!reasonReady || pending} label={vi ? 'Xác nhận vi phạm' : 'Confirm violation'} onPress={() => { void decide('confirm') }} testID="admin-discipline-confirm" variant="destructive" />
      <KaelButton disabled={!reasonReady || pending} label={vi ? 'Bác bỏ' : 'Dismiss'} onPress={() => { void decide('dismiss') }} testID="admin-discipline-dismiss" variant="secondary" />
      {detail.source === 'customer_report' ? <KaelButton disabled={!reasonReady || pending} label={vi ? 'Báo cáo bịa đặt (khóa tài khoản khách)' : 'Fabricated report (locks the customer)'} onPress={() => { void decide('fabricated_report') }} testID="admin-discipline-fabricated" variant="secondary" /> : null}
      {detail.level === 5 && !detail.suspended_pending_review ? <KaelButton disabled={!reasonReady || pending} label={vi ? 'Đình chỉ ngay trong lúc xác minh' : 'Suspend now while verifying'} onPress={() => { void run(() => adminProgramService.suspendForCase(caseId, reason.trim()), vi ? 'Đã tạm ngừng thợ nhận việc' : 'Worker paused from matching') }} testID="admin-discipline-suspend" variant="destructive" /> : null}
    </View> : null}
    {detail.appeal_status === 'submitted' ? <View style={styles.actions}>
      <KaelButton disabled={!reasonReady || pending} label={vi ? 'Minh oan · khôi phục đầy đủ' : 'Overturn · restore fully'} onPress={() => { void decideAppeal('overturned') }} testID="admin-discipline-overturn" variant="primary" />
      <KaelButton disabled={!reasonReady || pending} label={vi ? 'Giữ nguyên quyết định' : 'Uphold'} onPress={() => { void decideAppeal('upheld') }} testID="admin-discipline-uphold" variant="secondary" />
    </View> : null}
    {holdLive ? <View style={styles.actions} testID="admin-discipline-hold">
      <AdminText textRole="caption1" style={styles.meta}>{vi
        ? 'Tiền của thợ tự hết tạm giữ vào ngày ghi ở trên. Chỉ gia hạn khi cơ quan có thẩm quyền (công an, tòa án) đang xử lý vụ việc và bạn có số hồ sơ của họ.'
        : 'The hold ends on its own on the date above. Extend it only while an authority (police, court) is handling the case and you have its reference.'}</AdminText>
      <KaelTextField
        accessibilityLabel={vi ? 'Số hồ sơ của cơ quan có thẩm quyền' : 'Authority reference'}
        onChangeText={setAuthorityRef}
        placeholder={vi ? 'Số hồ sơ / công văn của cơ quan có thẩm quyền' : 'Authority case or letter reference'}
        placeholderTextColor={color.text.muted}
        testID="admin-discipline-hold-reference"
        value={authorityRef}
      />
      <KaelTextField
        accessibilityLabel={vi ? 'Số ngày tạm giữ thêm' : 'Days to extend'}
        keyboardType="number-pad"
        onChangeText={(value) => setHoldDays(value.replace(/\D/g, ''))}
        placeholder={vi ? 'Số ngày tạm giữ thêm (1–365)' : 'Days to extend (1–365)'}
        placeholderTextColor={color.text.muted}
        testID="admin-discipline-hold-days"
        value={holdDays}
      />
      <KaelButton disabled={!holdReady || pending} label={vi ? 'Gia hạn tạm giữ rút tiền' : 'Extend withdrawal hold'} onPress={() => { void extendHold() }} testID="admin-discipline-hold-extend" variant="secondary" />
    </View> : null}
    {needsReason && !reasonReady ? <AdminText textRole="caption1" style={styles.meta}>{vi ? `Cần lý do ít nhất ${MIN_REASON} ký tự.` : `A reason of at least ${MIN_REASON} characters is required.`}</AdminText> : null}
    {notice ? <AdminText accessibilityRole="alert" textRole="subheadline">{notice}</AdminText> : null}
  </AdminSystemDetailScroll>
}

function BlockDetail({ block, language, onBack, onChanged }: { block: AdminIdentityBlock | null; language: AppLanguage; onBack: () => void; onChanged: () => void }) {
  const vi = language === 'vi'
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  if (!block) return null
  const lift = async () => {
    setPending(true)
    const result = await adminProgramService.liftIdentityBlock(block.id, reason.trim())
    setPending(false)
    setNotice(result.success ? (vi ? 'Đã gỡ chặn' : 'Block lifted') : result.error || (vi ? 'Chưa gỡ được' : 'Could not lift'))
    if (result.success) onChanged()
  }
  return <AdminSystemDetailScroll>
    <AdminSystemDetailHeader language={language} onBack={onBack} subtitle={formatDate(block.created_at, language)} title={blockKindLabel(block.kind, vi)} />
    <AdminSystemField label={vi ? 'Hồ sơ vi phạm' : 'Case'} value={block.case_id ?? '—'} />
    {block.lifted_at ? <AdminSystemField label={vi ? 'Đã gỡ' : 'Lifted'} value={`${formatDate(block.lifted_at, language)} · ${block.lift_reason ?? ''}`} /> : <>
      <KaelTextField accessibilityLabel={vi ? 'Lý do gỡ chặn' : 'Reason to lift'} multiline onChangeText={setReason} placeholder={vi ? 'Lý do gỡ chặn' : 'Reason to lift'} placeholderTextColor={color.text.muted} value={reason} />
      <KaelButton disabled={reason.trim().length < MIN_REASON || pending} label={vi ? 'Gỡ chặn' : 'Lift block'} onPress={() => { void lift() }} variant="secondary" />
    </>}
    {notice ? <AdminText accessibilityRole="alert" textRole="subheadline">{notice}</AdminText> : null}
  </AdminSystemDetailScroll>
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  meta: {
    color: color.text.muted,
  },
  actions: {
    gap: spacing.sm,
  },
})
