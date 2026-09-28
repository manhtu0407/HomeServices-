import { useMemo, useReducer, useRef } from 'react'
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native'
import { ADMIN_CAPABILITIES, type AdminCapability } from '@nestscout/shared'

import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import { color, radius, spacing } from '@/design/theme'
import type {
  AdminViewActor,
  AdminViewManagerNominationSummary,
  AdminViewOperatorProvisioningSummary,
  AdminViewSubAdminAccountCandidate,
  AdminViewSubAdminSummary,
} from '@/lib/api-types/admin'
import type { AppLanguage } from '@/lib/app-language'
import {
  clearStableClientRequestId,
  shouldRetainClientRequestId,
  stableClientRequestId,
  type PendingClientRequestId,
} from '@/lib/client-request-id'
import { adminControlService } from '@/lib/services'

import type { AdminProductionCapabilityId } from './admin-sections-production-copy'
import { formatAdminDateTime } from './admin-intl'
import { AdminText } from './admin-text'
import { FinanceChoiceChip, FinanceSecondaryButton } from './admin-finance-controls'

type TeamRecord =
  | { kind: 'member'; value: AdminViewSubAdminSummary }
  | { kind: 'nomination'; value: AdminViewManagerNominationSummary }
  | { kind: 'pending'; value: AdminViewOperatorProvisioningSummary }

type TeamListState = {
  query: string
  selected: TeamRecord | null
  status: 'active' | 'all' | 'revoked'
}

const initialTeamListState: TeamListState = { query: '', selected: null, status: 'all' }

type ProvisioningState = {
  accountQuery: string
  busy: boolean
  candidates: AdminViewSubAdminAccountCandidate[]
  capabilities: AdminCapability[]
  confirmed: boolean
  email: string
  error: string | null
  fullName: string
  mode: 'list' | 'create' | 'review' | 'reset' | 'search'
  notice: string | null
  password: string
  passwordConfirm: string
  selectedAccount: AdminViewOperatorProvisioningSummary | null
}

const initialProvisioningState: ProvisioningState = {
  accountQuery: '', busy: false, candidates: [], capabilities: ['finance.read'], confirmed: false, email: '', error: null,
  fullName: '', mode: 'list', notice: null, password: '', passwordConfirm: '', selectedAccount: null,
}

type CapabilityEditorState = {
  action: 'grant' | 'update' | 'revoke'
  busy: boolean
  capabilities: AdminCapability[]
  error: string | null
  member: AdminViewSubAdminSummary | null
  reason: string
  review: boolean
}

const initialCapabilityEditorState: CapabilityEditorState = {
  action: 'update', busy: false, capabilities: ['finance.read'], error: null, member: null, reason: '', review: false,
}

const copy = {
  vi: {
    active: 'Đang hoạt động', all: 'Tất cả', back: 'Quay lại danh sách', cancel: 'Hủy', capabilities: 'Phạm vi quyền', confirm: 'Xác nhận', confirmation: 'Tài khoản phải đổi mật khẩu ở lần đăng nhập đầu.', create: 'Tạo tài khoản', directoryEmpty: 'Chưa có quản trị viên phù hợp.', email: 'Địa chỉ Gmail', error: 'Không thể hoàn tất thao tác.', fullName: 'Họ và tên', inactive: 'Đã thu hồi', lastActivity: 'Hoạt động gần nhất', loading: 'Đang xử lý...', nominate: 'Đề cử', nominationEmpty: 'Chưa có đề cử đang chờ.', ownerOnly: 'Bạn có quyền xem. Thay đổi tài khoản và quyền chỉ dành cho Chủ hệ thống.', password: 'Mật khẩu ban đầu', passwordConfirm: 'Nhập lại mật khẩu', pending: 'Chờ đổi mật khẩu', pendingEmpty: 'Chưa có tài khoản chờ kích hoạt.', reason: 'Lý do thu hồi quyền', refresh: 'Tải lại', reset: 'Đặt lại mật khẩu', review: 'Rà soát', revoke: 'Thu hồi', save: 'Lưu thay đổi', search: 'Tìm theo tên hoặc liên hệ đã che', searchAccount: 'Tìm tài khoản khách/thợ đã đăng ký', searchEmpty: 'Không tìm thấy tài khoản phù hợp.', status: 'Trạng thái', updated: 'Cập nhật', currentAccess: 'Quyền hiện tại', accessAudit: 'Kiểm tra quyền theo tài khoản', noSecret: 'Mật khẩu chỉ được gửi tới máy chủ khi bạn xác nhận và không được hiển thị lại.', selectMember: 'Chọn quản trị viên để rà soát quyền.', saved: 'Đã ghi nhận thay đổi.', invalid: 'Kiểm tra lại thông tin bắt buộc.',
  },
  en: {
    active: 'Active', all: 'All', back: 'Back to list', cancel: 'Cancel', capabilities: 'Access scope', confirm: 'Confirm', confirmation: 'The account must change its password on first sign-in.', create: 'Create account', directoryEmpty: 'No matching operator.', email: 'Gmail address', error: 'Unable to complete this action.', fullName: 'Full name', inactive: 'Revoked', lastActivity: 'Last activity', loading: 'Working...', nominate: 'Nominate', nominationEmpty: 'No pending nomination.', ownerOnly: 'You may view this workspace. Account and access changes are Owner-only.', password: 'Initial password', passwordConfirm: 'Confirm password', pending: 'Password change pending', pendingEmpty: 'No account is waiting for activation.', reason: 'Access revocation reason', refresh: 'Refresh', reset: 'Reset password', review: 'Review', revoke: 'Revoke', save: 'Save changes', search: 'Search name or masked contact', searchAccount: 'Find a registered customer or worker', searchEmpty: 'No matching account.', status: 'Status', updated: 'Updated', currentAccess: 'Current access', accessAudit: 'Review access by account', noSecret: 'The password is sent to the server only after confirmation and is never shown again.', selectMember: 'Select an operator to review access.', saved: 'Change recorded.', invalid: 'Check the required information.',
  },
} as const

export function AdminTeamWorkspace({ actor, capability, language, members, nominations, onRefresh, pendingAccounts }: {
  actor: AdminViewActor | null
  capability: AdminProductionCapabilityId
  language: AppLanguage
  members: AdminViewSubAdminSummary[]
  nominations: AdminViewManagerNominationSummary[]
  onRefresh: () => Promise<void>
  pendingAccounts: AdminViewOperatorProvisioningSummary[]
}) {
  const labels = copy[language]
  const { width } = useWindowDimensions()
  const compact = width < 600
  const expanded = width >= 768
  const isOwner = actor?.access_level === 'owner'
  const [state, patch] = useReducer((current: TeamListState, next: Partial<TeamListState>) => ({ ...current, ...next }), initialTeamListState)
  const records = useMemo<TeamRecord[]>(() => capability === 'team-provisioning'
    ? [...pendingAccounts.map((value) => ({ kind: 'pending' as const, value })), ...nominations.map((value) => ({ kind: 'nomination' as const, value }))]
    : members.map((value) => ({ kind: 'member' as const, value })), [capability, members, nominations, pendingAccounts])
  const visible = useMemo(() => records.filter((record) => {
    if (record.kind === 'member' && state.status !== 'all' && record.value.status !== state.status) return false
    const normalized = state.query.trim().toLocaleLowerCase(language === 'vi' ? 'vi-VN' : 'en-US')
    return !normalized || recordSearch(record).toLocaleLowerCase(language === 'vi' ? 'vi-VN' : 'en-US').includes(normalized)
  }), [language, records, state.query, state.status])

  if (capability === 'team-provisioning') return <ProvisioningWorkspace actor={actor} compact={compact} language={language} nominations={nominations} onRefresh={onRefresh} pendingAccounts={pendingAccounts} />
  if (capability === 'team-capabilities') return <CapabilityWorkspace actor={actor} language={language} members={members} onRefresh={onRefresh} />

  const list = <View style={styles.column}>
    <View style={styles.headerRow}>{!isOwner ? <AdminText textRole="footnote" style={[styles.muted, styles.utilityNote]}>{labels.ownerOnly}</AdminText> : null}<FinanceSecondaryButton label={labels.refresh} onPress={() => { void onRefresh() }} style={styles.utilityAction} /></View>
    <KaelTextField accessibilityLabel={labels.search} autoCapitalize="none" mode="search" onChangeText={(query) => patch({ query })} placeholder={labels.search} placeholderTextColor={color.text.muted} value={state.query} />
    <View style={styles.filterRow}>{(['all', 'active', 'revoked'] as const).map((value) => <FinanceChoiceChip key={value} label={value === 'revoked' ? labels.inactive : labels[value]} onPress={() => patch({ status: value })} selected={state.status === value} />)}</View>
    {visible.length === 0 ? <Feedback label={labels.directoryEmpty} /> : visible.map((record) => <TeamRow key={recordKey(record)} labels={labels} onPress={() => patch({ selected: record })} record={record} selected={state.selected ? recordKey(state.selected) === recordKey(record) : false} />)}
  </View>
  const detail = state.selected ? <TeamDetail labels={labels} language={language} onBack={() => patch({ selected: null })} record={state.selected} showBack={!expanded} /> : expanded ? <Feedback label={labels.selectMember} /> : null
  return <View style={[styles.workspace, expanded && styles.workspaceExpanded]} testID={`admin-team-workspace-${capability}`}>{(!state.selected || expanded) ? list : null}{(state.selected || expanded) ? <View style={[styles.detailColumn, expanded && styles.detailExpanded]}>{detail}</View> : null}</View>
}

function ProvisioningWorkspace({ actor, compact, language, nominations, onRefresh, pendingAccounts }: { actor: AdminViewActor | null; compact: boolean; language: AppLanguage; nominations: AdminViewManagerNominationSummary[]; onRefresh: () => Promise<void>; pendingAccounts: AdminViewOperatorProvisioningSummary[] }) {
  const labels = copy[language]
  const owner = actor?.access_level === 'owner'
  const [state, patch] = useReducer((current: ProvisioningState, next: Partial<ProvisioningState>) => ({ ...current, ...next }), initialProvisioningState)
  const { accountQuery, busy, candidates, capabilities, confirmed, email, error, fullName, mode, notice, password, passwordConfirm, selectedAccount } = state
  const toggle = (value: AdminCapability) => patch({ capabilities: toggleCapability(capabilities, value) })
  const review = () => {
    if (fullName.trim().length < 2 || !/^[^\s@]+@gmail\.com$/i.test(email.trim()) || password.length < 8 || password !== passwordConfirm || !confirmed) { patch({ error: labels.invalid }); return }
    patch({ error: null, mode: 'review' })
  }
  const confirm = async () => {
    patch({ busy: true, error: null })
    const result = await adminControlService.provisionOperator({ capabilities, email: email.trim().toLowerCase(), full_name: fullName.trim(), initial_password: password })
    if (!result.success) { patch({ busy: false, error: result.error || labels.error }); return }
    patch({ busy: false, mode: 'list', notice: labels.saved, password: '', passwordConfirm: '' })
    await onRefresh()
  }
  const reset = async () => {
    if (!selectedAccount || password.length < 8 || password !== passwordConfirm) { patch({ error: labels.invalid }); return }
    patch({ busy: true, error: null })
    const result = await adminControlService.resetPendingOperatorPassword(selectedAccount.id, password)
    if (!result.success) { patch({ busy: false, error: result.error || labels.error }); return }
    patch({ busy: false, mode: 'list', notice: labels.saved, password: '', passwordConfirm: '', selectedAccount: null })
    await onRefresh()
  }
  const search = async () => {
    if (accountQuery.trim().length < 2) { patch({ error: labels.invalid }); return }
    patch({ busy: true, error: null })
    const result = await adminControlService.searchSubAdminAccounts(accountQuery.trim())
    patch({ busy: false, candidates: result.success ? result.data.accounts : [], error: result.success ? null : result.error || labels.error })
  }
  const nominate = async (candidate: AdminViewSubAdminAccountCandidate) => {
    patch({ busy: true, error: null })
    const result = await adminControlService.nominateManager(candidate.user_id)
    if (!result.success) { patch({ busy: false, error: result.error || labels.error }); return }
    patch({ busy: false, mode: 'list', notice: labels.saved })
    await onRefresh()
  }
  if (!owner) return <View style={styles.column} testID="admin-team-workspace-team-provisioning"><Feedback label={labels.ownerOnly} /></View>
  return <View style={styles.column} testID="admin-team-workspace-team-provisioning">
    {mode === 'list' ? <View style={[styles.provisioningActions, compact && styles.provisioningActionsCompact]} testID="admin-team-provisioning-actions"><FinanceSecondaryButton label={labels.searchAccount} onPress={() => patch({ mode: 'search' })} style={compact ? styles.provisioningActionCompact : styles.provisioningSearchAction} testID="admin-team-provisioning-search" /><KaelButton label={labels.create} onPress={() => patch({ mode: 'create' })} style={compact ? styles.provisioningActionCompact : undefined} testID="admin-team-provisioning-create" variant="primary" /></View> : <View style={styles.headerRow}><FinanceSecondaryButton label={labels.back} onPress={() => patch({ error: null, mode: 'list' })} /></View>}
    {notice ? <AdminText accessibilityRole="alert" textRole="subheadline" style={styles.notice}>{notice}</AdminText> : null}
    {mode === 'list' ? <><AdminText textRole="headline" style={styles.rowTitle}>{labels.pending}</AdminText>{pendingAccounts.length === 0 ? <Feedback label={labels.pendingEmpty} /> : pendingAccounts.map((account) => <Pressable accessibilityRole="button" key={account.id} onPress={() => patch({ mode: 'reset', selectedAccount: account })} style={styles.row}><View style={styles.rowText}><AdminText textRole="headline" style={styles.rowTitle}>{account.full_name}</AdminText><AdminText textRole="footnote" style={styles.muted}>{account.email_masked}</AdminText></View><AdminText textRole="footnote" style={styles.meta}>{labels.reset}</AdminText></Pressable>)}<AdminText textRole="headline" style={styles.rowTitle}>{language === 'vi' ? 'Đề cử đang chờ' : 'Pending nominations'}</AdminText>{nominations.length === 0 ? <Feedback label={labels.nominationEmpty} /> : nominations.map((item) => <View key={item.id} style={styles.row}><View style={styles.rowText}><AdminText textRole="headline" style={styles.rowTitle}>{item.full_name ?? item.phone_masked ?? item.user_id}</AdminText><AdminText textRole="footnote" style={styles.muted}>{item.phone_masked}</AdminText></View><AdminText textRole="footnote" style={styles.meta}>{labels.pending}</AdminText></View>)}</> : null}
    {mode === 'create' || mode === 'review' ? <View style={styles.form}>{mode === 'create' ? <><KaelTextField accessibilityLabel={labels.fullName} label={labels.fullName} onChangeText={(fullName) => patch({ fullName })} value={fullName} /><KaelTextField accessibilityLabel={labels.email} autoCapitalize="none" label={labels.email} onChangeText={(email) => patch({ email })} value={email} /><KaelTextField accessibilityLabel={labels.password} autoCapitalize="none" label={labels.password} onChangeText={(password) => patch({ password })} secureTextEntry value={password} /><KaelTextField accessibilityLabel={labels.passwordConfirm} autoCapitalize="none" label={labels.passwordConfirm} onChangeText={(passwordConfirm) => patch({ passwordConfirm })} secureTextEntry value={passwordConfirm} /><CapabilityPicker capabilities={capabilities} language={language} onToggle={toggle} /><FinanceChoiceChip label={labels.confirmation} onPress={() => patch({ confirmed: !confirmed })} selected={confirmed} /><AdminText textRole="footnote" style={styles.muted}>{labels.noSecret}</AdminText><KaelButton label={labels.review} onPress={review} variant="primary" /></> : <><ReviewField label={labels.fullName} value={fullName} /><ReviewField label={labels.email} value={email} /><ReviewField label={labels.capabilities} value={capabilities.map((value) => capabilityLabel(value, language)).join(' · ')} /><AdminText textRole="footnote" style={styles.muted}>{labels.confirmation}</AdminText><View style={styles.filterRow}><FinanceSecondaryButton label={labels.back} onPress={() => patch({ mode: 'create' })} /><KaelButton disabled={busy} label={busy ? labels.loading : labels.confirm} loading={busy} onPress={() => { void confirm() }} variant="primary" /></View></>}</View> : null}
    {mode === 'reset' ? <View style={styles.form}><AdminText textRole="headline" style={styles.rowTitle}>{selectedAccount?.full_name} · {selectedAccount?.email_masked}</AdminText><KaelTextField accessibilityLabel={labels.password} autoCapitalize="none" label={labels.password} onChangeText={(password) => patch({ password })} secureTextEntry value={password} /><KaelTextField accessibilityLabel={labels.passwordConfirm} autoCapitalize="none" label={labels.passwordConfirm} onChangeText={(passwordConfirm) => patch({ passwordConfirm })} secureTextEntry value={passwordConfirm} /><AdminText textRole="footnote" style={styles.muted}>{labels.noSecret}</AdminText><KaelButton disabled={busy} label={busy ? labels.loading : labels.review} loading={busy} onPress={() => { void reset() }} variant="primary" /></View> : null}
    {mode === 'search' ? <View style={styles.form}><KaelTextField accessibilityLabel={labels.searchAccount} autoCapitalize="none" mode="search" onChangeText={(accountQuery) => patch({ accountQuery })} placeholder={labels.searchAccount} placeholderTextColor={color.text.muted} value={accountQuery} /><FinanceSecondaryButton disabled={busy} label={labels.searchAccount} loading={busy} onPress={() => { void search() }} />{candidates.length === 0 ? <Feedback label={labels.searchEmpty} /> : candidates.map((candidate) => <Pressable accessibilityRole="button" key={candidate.user_id} onPress={() => { void nominate(candidate) }} style={styles.row}><View style={styles.rowText}><AdminText textRole="headline" style={styles.rowTitle}>{candidate.full_name ?? candidate.phone_masked ?? candidate.user_id}</AdminText><AdminText textRole="footnote" style={styles.muted}>{candidate.phone_masked}</AdminText></View><AdminText textRole="headline" style={styles.notice}>{labels.nominate}</AdminText></Pressable>)}</View> : null}
    {error ? <AdminText accessibilityRole="alert" textRole="subheadline" style={styles.error}>{error}</AdminText> : null}
  </View>
}

function CapabilityWorkspace({ actor, language, members, onRefresh }: { actor: AdminViewActor | null; language: AppLanguage; members: AdminViewSubAdminSummary[]; onRefresh: () => Promise<void> }) {
  const labels = copy[language]
  const owner = actor?.access_level === 'owner'
  const [state, patch] = useReducer((current: CapabilityEditorState, next: Partial<CapabilityEditorState>) => ({ ...current, ...next }), initialCapabilityEditorState)
  const { action, busy, capabilities, error, member, reason, review } = state
  const pendingAccessRequest = useRef<PendingClientRequestId | null>(null)
  const choose = (value: AdminViewSubAdminSummary) => patch({ action: value.status === 'active' ? 'update' : 'grant', capabilities: value.capabilities, error: null, member: value, reason: '', review: false })
  const confirm = async () => {
    if (!member || (action === 'revoke' && reason.trim().length < 3)) { patch({ error: labels.invalid }); return }
    const nextCapabilities = action === 'revoke' ? [] : capabilities
    const fingerprint = JSON.stringify({ action, capabilities: [...nextCapabilities].sort(), reason: reason.trim(), userId: member.user_id, version: member.version })
    const clientRequestId = stableClientRequestId(pendingAccessRequest, fingerprint)
    patch({ busy: true, error: null })
    const result = await adminControlService.setSubAdminAccess(member.user_id, { action, capabilities: nextCapabilities, client_request_id: clientRequestId, expected_version: member.version, ...(action === 'revoke' ? { reason: reason.trim() } : {}) })
    if (!result.success) {
      if (!shouldRetainClientRequestId(result)) clearStableClientRequestId(pendingAccessRequest, fingerprint)
      patch({ busy: false, error: result.error || labels.error })
      return
    }
    clearStableClientRequestId(pendingAccessRequest, fingerprint)
    patch({ busy: false, member: null, review: false })
    await onRefresh()
  }
  return <View style={styles.column} testID="admin-team-workspace-team-capabilities">{!owner ? <Feedback label={labels.ownerOnly} /> : !member ? <>{members.length === 0 ? <Feedback label={labels.directoryEmpty} /> : members.map((value) => <Pressable accessibilityRole="button" key={value.user_id} onPress={() => choose(value)} style={styles.row}><View style={styles.rowText}><AdminText textRole="headline" style={styles.rowTitle}>{value.full_name ?? value.phone_masked ?? value.user_id}</AdminText><AdminText textRole="footnote" style={styles.muted}>{value.capabilities.length} {labels.capabilities.toLocaleLowerCase()}</AdminText></View><AdminText textRole="footnote" style={styles.meta}>{value.status === 'active' ? labels.active : labels.inactive}</AdminText></Pressable>)}</> : <View style={styles.form}><FinanceSecondaryButton label={labels.back} onPress={() => patch({ member: null })} /><AdminText textRole="headline" style={styles.rowTitle}>{member.full_name ?? member.phone_masked ?? member.user_id}</AdminText>{!review ? <><CapabilityPicker capabilities={capabilities} language={language} onToggle={(value) => patch({ capabilities: toggleCapability(capabilities, value) })} /><View style={styles.filterRow}><FinanceChoiceChip label={labels.save} onPress={() => patch({ action: 'update' })} selected={action === 'update'} /><FinanceChoiceChip label={labels.revoke} onPress={() => patch({ action: 'revoke' })} selected={action === 'revoke'} tone="danger" /></View>{action === 'revoke' ? <KaelTextField accessibilityLabel={labels.reason} label={labels.reason} multiline onChangeText={(reason) => patch({ reason })} value={reason} /> : null}<KaelButton label={labels.review} onPress={() => patch(action === 'revoke' && reason.trim().length < 3 ? { error: labels.invalid } : { error: null, review: true })} variant="primary" /></> : <><ReviewField label={labels.status} value={action === 'revoke' ? labels.inactive : labels.active} /><ReviewField label={labels.capabilities} value={action === 'revoke' ? labels.inactive : capabilities.map((value) => capabilityLabel(value, language)).join(' · ')} />{reason ? <ReviewField label={labels.reason} value={reason} /> : null}<View style={styles.filterRow}><FinanceSecondaryButton label={labels.back} onPress={() => patch({ review: false })} /><KaelButton disabled={busy} label={busy ? labels.loading : labels.confirm} loading={busy} onPress={() => { void confirm() }} variant="primary" /></View></>}{error ? <AdminText accessibilityRole="alert" textRole="subheadline" style={styles.error}>{error}</AdminText> : null}</View>}</View>
}

function CapabilityPicker({ capabilities, language, onToggle }: { capabilities: AdminCapability[]; language: AppLanguage; onToggle: (value: AdminCapability) => void }) { return <View style={styles.form}><AdminText textRole="headline" style={styles.rowTitle}>{copy[language].capabilities}</AdminText><View style={styles.filterRow}>{ADMIN_CAPABILITIES.map((value) => <FinanceChoiceChip disabled={value === 'finance.read' || value === 'system.read'} key={value} label={capabilityLabel(value, language)} onPress={() => onToggle(value)} selected={capabilities.includes(value)} />)}</View></View> }
function TeamRow({ labels, onPress, record, selected }: { labels: typeof copy.vi | typeof copy.en; onPress: () => void; record: TeamRecord; selected: boolean }) { const value = record.value; const name = 'full_name' in value ? value.full_name : null; const contact = 'phone_masked' in value ? value.phone_masked : 'email_masked' in value ? value.email_masked : null; const status = record.kind === 'member' ? (value as AdminViewSubAdminSummary).status === 'active' ? labels.active : labels.inactive : labels.pending; return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.row, selected && styles.rowSelected]}><View style={styles.rowText}><AdminText textRole="headline" style={styles.rowTitle}>{name ?? contact ?? 'Admin'}</AdminText><AdminText textRole="footnote" style={styles.muted}>{contact}</AdminText></View><AdminText textRole="footnote" style={styles.meta}>{status}</AdminText></Pressable> }
function TeamDetail({ labels, language, onBack, record, showBack }: { labels: typeof copy.vi | typeof copy.en; language: AppLanguage; onBack: () => void; record: TeamRecord; showBack: boolean }) {
  const name = record.value.full_name ?? ('phone_masked' in record.value ? record.value.phone_masked : 'email_masked' in record.value ? record.value.email_masked : null)
  const fields = record.kind === 'member'
    ? [
      { label: labels.status, value: record.value.status === 'active' ? labels.active : labels.inactive },
      { label: labels.currentAccess, value: record.value.capabilities.map((item: AdminCapability) => capabilityLabel(item, language)).join(' · ') },
      { label: labels.lastActivity, value: record.value.last_activity_at ? formatDate(record.value.last_activity_at, language) : labels.pending },
      { label: labels.updated, value: formatDate(record.value.updated_at, language) },
    ]
    : record.kind === 'nomination'
      ? [{ label: labels.status, value: labels.pending }, { label: labels.updated, value: formatDate(record.value.nominated_at, language) }]
      : [
        { label: labels.status, value: labels.pending },
        { label: labels.currentAccess, value: record.value.capabilities.map((item: AdminCapability) => capabilityLabel(item, language)).join(' · ') },
        { label: labels.updated, value: formatDate(record.value.updated_at, language) },
      ]
  return <View style={styles.column}>{showBack ? <FinanceSecondaryButton label={labels.back} onPress={onBack} /> : null}<AdminText accessibilityRole="header" textRole="title2" style={styles.title}>{name ?? 'Admin'}</AdminText><View style={styles.fieldList}>{fields.map((field) => <ReviewField key={field.label} {...field} />)}</View></View>
}
function ReviewField({ label, value }: { label: string; value: string }) { return <View style={styles.field}><AdminText textRole="caption1" style={styles.meta}>{label}</AdminText><AdminText textRole="subheadline" style={styles.rowTitle}>{value}</AdminText></View> }
function toggleCapability(current: AdminCapability[], value: AdminCapability): AdminCapability[] { if (value === 'finance.read' || value === 'system.read') return current; if (value === 'operations.triage' && !current.includes(value)) return Array.from(new Set<AdminCapability>([...current, 'operations.read', value])); if (value === 'operations.read' && current.includes(value)) return current.filter((item) => item !== 'operations.read' && item !== 'operations.triage'); if (value === 'system.manage' && !current.includes(value)) return Array.from(new Set<AdminCapability>([...current, 'system.read', value])); return current.includes(value) ? current.filter((item) => item !== value) : [...current, value] }
function capabilityLabel(value: AdminCapability, language: AppLanguage) { const labels: Record<AdminCapability, readonly [string, string]> = { 'finance.read': ['Đọc tài chính', 'Read finance'], 'finance.reconcile': ['Đối soát', 'Reconcile'], 'finance.tax.manage': ['Quản lý thuế', 'Manage tax'], 'operations.read': ['Đọc vận hành', 'Read operations'], 'operations.triage': ['Chuẩn bị hồ sơ', 'Triage'], 'payouts.process': ['Xử lý chi trả', 'Process payouts'], 'payouts.read': ['Đọc chi trả', 'Read payouts'], 'system.manage': ['Quản lý hệ thống', 'Manage system'], 'system.read': ['Đọc hệ thống', 'Read system'], 'team.read': ['Đọc đội ngũ', 'Read team'], 'transactions.read': ['Đọc giao dịch', 'Read transactions'], 'workers.manage': ['Quản lý thợ', 'Manage workers'], 'workers.read': ['Đọc hồ sơ thợ', 'Read workers'], 'workers.review': ['Duyệt thợ', 'Review workers'], 'workers.bonus.manage': ['Quản lý thưởng thợ', 'Manage worker rewards'], 'workers.discipline.manage': ['Xử lý vi phạm', 'Decide violations'] }; return labels[value][language === 'vi' ? 0 : 1] }
function recordKey(record: TeamRecord) { return record.kind === 'member' ? `member:${record.value.user_id}` : `${record.kind}:${record.value.id}` }
function recordSearch(record: TeamRecord) { const value = record.value; return `${'full_name' in value ? value.full_name ?? '' : ''} ${'phone_masked' in value ? value.phone_masked ?? '' : ''} ${'email_masked' in value ? value.email_masked : ''}` }
function formatDate(value: string, language: AppLanguage) { return formatAdminDateTime(value, language) }
function Feedback({ label }: { label: string }) { return <View style={styles.feedback}><AdminText textRole="subheadline" style={styles.muted}>{label}</AdminText></View> }

const styles = StyleSheet.create({
  column: { flex: 1, gap: spacing.md, minWidth: 0 },
  detailColumn: { flex: 1, minWidth: 0 },
  detailExpanded: { borderLeftColor: color.surface.stroke, borderLeftWidth: StyleSheet.hairlineWidth, maxWidth: 720, paddingLeft: spacing.xl },
  error: { color: color.brand.primaryDark },
  feedback: { alignItems: 'center', borderColor: color.surface.stroke, borderRadius: radius.lg, borderWidth: 1, justifyContent: 'center', padding: spacing.xl },
  field: { borderBottomColor: color.surface.stroke, borderBottomWidth: StyleSheet.hairlineWidth, gap: spacing.xs, paddingVertical: spacing.sm },
  fieldList: { borderTopColor: color.surface.stroke, borderTopWidth: StyleSheet.hairlineWidth },
  filterRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  form: { gap: spacing.md },
  headerRow: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'space-between' },
  meta: { color: color.text.muted },
  muted: { color: color.text.secondary },
  notice: { color: color.brand.primaryDark },
  provisioningActionCompact: { width: '100%' },
  provisioningActions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginLeft: 'auto' },
  provisioningActionsCompact: { alignItems: 'stretch', flexDirection: 'column', marginLeft: 0, width: '100%' },
  provisioningSearchAction: { flexGrow: 1, flexShrink: 1, minWidth: 240 },
  row: { alignItems: 'flex-start', borderBottomColor: color.surface.stroke, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.md, minHeight: 68, paddingHorizontal: spacing.sm, paddingVertical: spacing.md },
  rowSelected: { backgroundColor: color.mint.mint50 },
  rowText: { flex: 1, gap: spacing.xs, minWidth: 0 },
  rowTitle: { color: color.text.strong },
  title: { color: color.text.strong, fontWeight: '600' },
  utilityAction: { marginLeft: 'auto' },
  utilityNote: { flex: 1, minWidth: 210 },
  workspace: { gap: spacing.xl },
  workspaceExpanded: { flexDirection: 'row' },
})
