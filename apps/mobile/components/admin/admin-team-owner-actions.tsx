import { useMemo, useReducer, useState } from 'react'
import { Modal, ScrollView, View } from 'react-native'

import { KaelButton, KaelChip, KaelTextField } from '@/components/ui/kael-primitives'
import { color } from '@/design/theme'
import type { AdminViewOperatorProvisioningSummary } from '@/lib/api-types/admin'
import { adminControlService } from '@/lib/services'
import { ADMIN_CAPABILITIES, type AdminCapability } from '@nestscout/shared'
import { StatusPill } from './admin-section-cards'
import { styles } from './admin-sections-styles'
import { AdminText } from './admin-text'

type OwnerActionsProps = {
  capabilityLabels: Record<AdminCapability, string>
  language: 'vi' | 'en'
  onNominateExisting: () => void
  onRefresh: () => Promise<void>
  pendingAccounts: AdminViewOperatorProvisioningSummary[]
  reduceMotion: boolean
}

const ownerActionCopy = {
  vi: {
    actionTitle: 'Quản lý tài khoản quản trị',
    actionBody: 'Tạo tài khoản NestScout dùng Gmail hoặc đề cử một tài khoản đã đăng ký.',
    create: 'Tạo tài khoản quản trị',
    nominate: 'Đề cử tài khoản đã có',
    pendingTitle: 'Chờ đổi mật khẩu',
    pendingEmpty: 'Chưa có tài khoản nào chờ đổi mật khẩu lần đầu.',
    accountSection: 'Thông tin tài khoản',
    passwordSection: 'Mật khẩu ban đầu',
    accessSection: 'Phân quyền',
    confirmationSection: 'Xác nhận',
    fullName: 'Họ và tên',
    email: 'Địa chỉ Gmail',
    password: 'Mật khẩu ban đầu',
    passwordConfirmation: 'Nhập lại mật khẩu',
    confirmation: 'Tôi hiểu tài khoản phải đổi mật khẩu ở lần đăng nhập đầu.',
    financeBaseline: 'Quyền xem tài chính là quyền nền bắt buộc.',
    close: 'Đóng',
    saving: 'Đang tạo...',
    reset: 'Đặt lại mật khẩu ban đầu',
    resetTitle: 'Đặt lại mật khẩu ban đầu',
    resetSaving: 'Đang lưu...',
    savePassword: 'Lưu mật khẩu mới',
    created: 'Tài khoản đã được tạo và đang chờ đổi mật khẩu.',
    resetDone: 'Mật khẩu ban đầu đã được đặt lại.',
    invalidName: 'Họ tên cần có ít nhất 2 ký tự.',
    invalidEmail: 'Chỉ chấp nhận địa chỉ kết thúc chính xác bằng @gmail.com.',
    invalidPassword: 'Mật khẩu phải có từ 8 đến 128 ký tự.',
    passwordMismatch: 'Hai mật khẩu chưa khớp.',
    confirmationRequired: 'Vui lòng xác nhận quy trình đổi mật khẩu lần đầu.',
    status: { failed: 'Tạo chưa hoàn tất', pending_password_change: 'Chờ đổi mật khẩu', active: 'Đang hoạt động' },
    lastActivity: 'Hoạt động gần nhất',
    createdAt: 'Tạo lúc',
  },
  en: {
    actionTitle: 'Admin account management',
    actionBody: 'Create a NestScout account using Gmail or nominate an existing registered account.',
    create: 'Create Admin account',
    nominate: 'Nominate existing account',
    pendingTitle: 'Awaiting password change',
    pendingEmpty: 'No account is waiting for its first password change.',
    accountSection: 'Account information',
    passwordSection: 'Initial password',
    accessSection: 'Permissions',
    confirmationSection: 'Confirmation',
    fullName: 'Full name',
    email: 'Gmail address',
    password: 'Initial password',
    passwordConfirmation: 'Confirm password',
    confirmation: 'I understand that this account must change its password at first sign-in.',
    financeBaseline: 'Finance read access is a required baseline permission.',
    close: 'Close',
    saving: 'Creating...',
    reset: 'Reset initial password',
    resetTitle: 'Reset initial password',
    resetSaving: 'Saving...',
    savePassword: 'Save new password',
    created: 'The account was created and is awaiting its first password change.',
    resetDone: 'The initial password was reset.',
    invalidName: 'The full name must contain at least 2 characters.',
    invalidEmail: 'Only addresses ending exactly in @gmail.com are supported.',
    invalidPassword: 'The password must contain 8 to 128 characters.',
    passwordMismatch: 'The passwords do not match.',
    confirmationRequired: 'Confirm the first-sign-in password change requirement.',
    status: { failed: 'Creation incomplete', pending_password_change: 'Awaiting password change', active: 'Active' },
    lastActivity: 'Last activity',
    createdAt: 'Created',
  },
} as const

export function AdminTeamOwnerActions(props: OwnerActionsProps) {
  const copy = ownerActionCopy[props.language]
  const [createOpen, setCreateOpen] = useState(false)
  const [resetTarget, setResetTarget] = useState<AdminViewOperatorProvisioningSummary | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  return <View style={styles.stack} testID="admin-team-owner-actions">
    <View style={styles.teamActionSurface}>
      <AdminText textRole="title2" style={styles.reviewSectionTitle}>{copy.actionTitle}</AdminText>
      <AdminText textRole="subheadline" style={styles.reviewSummaryText}>{copy.actionBody}</AdminText>
      <View style={styles.inlineActions}>
        <KaelButton label={copy.create} onPress={() => setCreateOpen(true)} style={styles.inlineAction} testID="admin-create-operator" variant="primary" />
        <KaelButton label={copy.nominate} onPress={props.onNominateExisting} style={styles.inlineAction} testID="admin-nominate-existing" variant="secondary" />
      </View>
    </View>
    {notice ? <View accessibilityRole="alert" style={styles.notice}><AdminText textRole="subheadline" style={styles.noticeText}>{notice}</AdminText></View> : null}
    <PendingAccounts copy={copy} language={props.language} accounts={props.pendingAccounts} capabilityLabels={props.capabilityLabels} onReset={setResetTarget} />
    <CreateOperatorModal {...props} copy={copy} onClose={() => setCreateOpen(false)} onSuccess={async () => { setCreateOpen(false); setNotice(copy.created); await props.onRefresh() }} visible={createOpen} />
    <ResetPasswordModal account={resetTarget} copy={copy} onClose={() => setResetTarget(null)} onSuccess={async () => { setResetTarget(null); setNotice(copy.resetDone); await props.onRefresh() }} reduceMotion={props.reduceMotion} />
  </View>
}

function PendingAccounts({ accounts, capabilityLabels, copy, language, onReset }: { accounts: AdminViewOperatorProvisioningSummary[]; capabilityLabels: OwnerActionsProps['capabilityLabels']; copy: typeof ownerActionCopy.vi | typeof ownerActionCopy.en; language: 'vi' | 'en'; onReset: (account: AdminViewOperatorProvisioningSummary) => void }) {
  const formatDate = (value: string | null) => value ? pendingAccountDateFormatters[language].format(new Date(value)) : '—'
  return <View style={styles.reviewSection}>
    <AdminText textRole="title2" style={styles.reviewSectionTitle}>{copy.pendingTitle}</AdminText>
    {accounts.length === 0 ? <AdminText textRole="subheadline" style={styles.reviewSummaryText}>{copy.pendingEmpty}</AdminText> : <View style={styles.pendingAccountList}>{accounts.map((account) => <View key={account.id} style={styles.pendingAccountCard} testID={`admin-pending-operator-${account.id}`}>
      <View style={styles.pendingAccountHeader}><View style={styles.cardTitleBlock}><AdminText numeric textRole="headline" style={styles.pendingAccountTitle}>{account.full_name}</AdminText><AdminText textRole="headline" style={styles.cardSubtitle}>{account.email_masked}</AdminText></View><StatusPill label={copy.status[account.status]} tone={account.status === 'failed' ? 'danger' : 'warning'} /></View>
      <View style={styles.capabilityList}>{account.capabilities.map((capability) => <AdminText textRole="footnote" key={capability} style={styles.cardHint}>{capabilityLabels[capability]}</AdminText>)}</View>
      <AdminText textRole="footnote" style={styles.cardHint}>{copy.createdAt}: {formatDate(account.created_at)} · {copy.lastActivity}: {formatDate(account.last_activity_at)}</AdminText>
      {account.status === 'pending_password_change' ? <KaelButton label={copy.reset} onPress={() => onReset(account)} size="small" variant="secondary" /> : null}
    </View>)}</View>}
  </View>
}

type CreateModalProps = OwnerActionsProps & {
  copy: typeof ownerActionCopy.vi | typeof ownerActionCopy.en
  onClose: () => void
  onSuccess: () => Promise<void>
  visible: boolean
}

type CreateOperatorState = {
  capabilities: AdminCapability[]
  confirmed: boolean
  email: string
  error: string | null
  fullName: string
  password: string
  passwordConfirmation: string
  saving: boolean
}

const initialCreateOperatorState: CreateOperatorState = {
  capabilities: ['finance.read'],
  confirmed: false,
  email: '',
  error: null,
  fullName: '',
  password: '',
  passwordConfirmation: '',
  saving: false,
}

const pendingAccountDateFormatters = {
  en: new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
  vi: new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }),
}

function CreateOperatorModal(props: CreateModalProps) {
  const [state, patch] = useReducer(
    (current: CreateOperatorState, next: Partial<CreateOperatorState>) => ({ ...current, ...next }),
    initialCreateOperatorState,
  )
  const { capabilities, confirmed, email, error, fullName, password, passwordConfirmation, saving } = state
  const selected = useMemo(() => new Set(capabilities), [capabilities])

  const close = () => {
    if (!saving) props.onClose()
  }
  const toggleCapability = (capability: AdminCapability) => {
    if (capability === 'finance.read') return
    if (capability === 'operations.triage' && !capabilities.includes(capability)) {
      patch({ capabilities: Array.from(new Set<AdminCapability>([...capabilities, 'operations.read', 'operations.triage'])) })
      return
    }
    if (capability === 'operations.read' && capabilities.includes(capability)) {
      patch({ capabilities: capabilities.filter((item) => item !== 'operations.read' && item !== 'operations.triage') })
      return
    }
    if (capability === 'system.manage' && !capabilities.includes(capability)) {
      patch({ capabilities: Array.from(new Set<AdminCapability>([...capabilities, 'system.read', 'system.manage'])) })
      return
    }
    patch({ capabilities: capabilities.includes(capability) ? capabilities.filter((item) => item !== capability) : [...capabilities, capability] })
  }
  const submit = async () => {
    const validationError = validateCreateForm(props.copy, fullName, email, password, passwordConfirmation, confirmed)
    if (validationError) { patch({ error: validationError }); return }
    patch({ error: null, saving: true })
    const result = await adminControlService.provisionOperator({ full_name: fullName.trim(), email: email.trim().toLowerCase(), initial_password: password, capabilities })
    if (!result.success) { patch({ error: result.error, saving: false }); return }
    patch(initialCreateOperatorState)
    await props.onSuccess()
  }

  return <Modal animationType={props.reduceMotion ? 'none' : 'fade'} transparent visible={props.visible} onRequestClose={close}><View style={styles.modalBackdrop}><View style={styles.modalCard} testID="admin-create-operator-modal">
    <AdminText textRole="title2" style={styles.modalTitle}>{props.copy.create}</AdminText>
    <ScrollView style={styles.modalBodyScroll} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.formSection}><AdminText textRole="title2" style={styles.formSectionTitle}>{props.copy.accountSection}</AdminText><KaelTextField accessibilityLabel={props.copy.fullName} onChangeText={(value) => patch({ fullName: value })} placeholder={props.copy.fullName} placeholderTextColor={color.text.muted} value={fullName} /><KaelTextField accessibilityLabel={props.copy.email} autoCapitalize="none" keyboardType="email-address" onChangeText={(value) => patch({ email: value })} placeholder={props.copy.email} placeholderTextColor={color.text.muted} value={email} /></View>
      <View style={styles.formSection}><AdminText textRole="title2" style={styles.formSectionTitle}>{props.copy.passwordSection}</AdminText><KaelTextField accessibilityLabel={props.copy.password} autoCapitalize="none" onChangeText={(value) => patch({ password: value })} placeholder={props.copy.password} placeholderTextColor={color.text.muted} secureTextEntry value={password} /><KaelTextField accessibilityLabel={props.copy.passwordConfirmation} autoCapitalize="none" onChangeText={(value) => patch({ passwordConfirmation: value })} placeholder={props.copy.passwordConfirmation} placeholderTextColor={color.text.muted} secureTextEntry value={passwordConfirmation} /></View>
      <View style={styles.formSection}><AdminText textRole="title2" style={styles.formSectionTitle}>{props.copy.accessSection}</AdminText><AdminText textRole="subheadline" style={styles.reviewSummaryText}>{props.copy.financeBaseline}</AdminText><View style={styles.capabilityList}>{ADMIN_CAPABILITIES.map((capability) => <KaelChip key={capability} accessibilityLabel={props.capabilityLabels[capability]} accessibilityState={{ disabled: capability === 'finance.read' || capability === 'system.read', selected: selected.has(capability) }} disabled={capability === 'finance.read' || capability === 'system.read'} label={props.capabilityLabels[capability]} onPress={() => toggleCapability(capability)} variant={selected.has(capability) ? 'selected' : 'unselected'} />)}</View></View>
      <View style={styles.formSection}><AdminText textRole="title2" style={styles.formSectionTitle}>{props.copy.confirmationSection}</AdminText><KaelChip accessibilityLabel={props.copy.confirmation} accessibilityState={{ selected: confirmed }} label={props.copy.confirmation} onPress={() => patch({ confirmed: !confirmed })} variant={confirmed ? 'selected' : 'unselected'} /></View>
    </ScrollView>
    {error ? <AdminText textRole="subheadline" accessibilityRole="alert" style={styles.errorText}>{error}</AdminText> : null}
    <View style={styles.inlineActions}><KaelButton label={props.copy.close} onPress={close} disabled={saving} style={styles.inlineAction} variant="secondary" /><KaelButton label={saving ? props.copy.saving : props.copy.create} onPress={() => { void submit() }} disabled={saving} loading={saving} style={styles.inlineAction} variant="primary" /></View>
  </View></View></Modal>
}

function ResetPasswordModal({ account, copy, onClose, onSuccess, reduceMotion }: { account: AdminViewOperatorProvisioningSummary | null; copy: typeof ownerActionCopy.vi | typeof ownerActionCopy.en; onClose: () => void; onSuccess: () => Promise<void>; reduceMotion: boolean }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  if (!account) return null
  const submit = async () => {
    if (password.length < 8 || password.length > 128) { setError(copy.invalidPassword); return }
    if (password !== confirmation) { setError(copy.passwordMismatch); return }
    setSaving(true); setError(null)
    const result = await adminControlService.resetPendingOperatorPassword(account.id, password)
    setSaving(false)
    if (!result.success) { setError(result.error); return }
    setPassword(''); setConfirmation(''); await onSuccess()
  }
  return <Modal animationType={reduceMotion ? 'none' : 'fade'} transparent visible onRequestClose={onClose}><View style={styles.modalBackdrop}><View style={styles.modalCard} testID="admin-reset-operator-password-modal">
    <AdminText textRole="title2" style={styles.modalTitle}>{copy.resetTitle}</AdminText><AdminText textRole="headline" style={styles.modalSubtitle}>{account.full_name} · {account.email_masked}</AdminText>
    <KaelTextField accessibilityLabel={copy.password} autoCapitalize="none" onChangeText={setPassword} placeholder={copy.password} placeholderTextColor={color.text.muted} secureTextEntry value={password} />
    <KaelTextField accessibilityLabel={copy.passwordConfirmation} autoCapitalize="none" onChangeText={setConfirmation} placeholder={copy.passwordConfirmation} placeholderTextColor={color.text.muted} secureTextEntry value={confirmation} />
    {error ? <AdminText textRole="subheadline" accessibilityRole="alert" style={styles.errorText}>{error}</AdminText> : null}
    <View style={styles.inlineActions}><KaelButton label={copy.close} onPress={onClose} disabled={saving} style={styles.inlineAction} variant="secondary" /><KaelButton label={saving ? copy.resetSaving : copy.savePassword} onPress={() => { void submit() }} disabled={saving} loading={saving} style={styles.inlineAction} variant="primary" /></View>
  </View></View></Modal>
}

function validateCreateForm(copy: typeof ownerActionCopy.vi | typeof ownerActionCopy.en, fullName: string, email: string, password: string, confirmation: string, confirmed: boolean) {
  if (fullName.trim().length < 2) return copy.invalidName
  if (!/^[^\s@]+@gmail\.com$/i.test(email.trim())) return copy.invalidEmail
  if (password.length < 8 || password.length > 128) return copy.invalidPassword
  if (password !== confirmation) return copy.passwordMismatch
  if (!confirmed) return copy.confirmationRequired
  return null
}
